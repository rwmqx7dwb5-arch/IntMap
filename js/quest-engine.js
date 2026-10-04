/* ============================================================================
 *  IntMap · LEARN QUESTS — the question engine   (js/quest-engine.js)   (learn-quests)
 * ----------------------------------------------------------------------------
 *  The map as the textbook: questions generated from data IntMap already ships, answered ON the map.
 *  The quiz of js/analysis-edu.js (flags, capitals, a country to click, silhouettes, two duels) stays
 *  where it is and as it is; this is the layer above it, and its panel (js/quest-panel.js) is reached from
 *  that quiz's menu, from Layers ▸ Tools, from a challenge link and from Atlas (`learn.quest`).
 *
 *  ⚠ PURE. No DOM, no `window`, no network: the panel loads the data the kinds name in `needs` and hands it
 *  in, and the one measurement a kind cannot make by itself — the geodesic distance — is handed in too
 *  (`makeQuestEngine({ distanceKm, halfCircumferenceKm })`), so the checks import this file in Node and the
 *  app answers with the map's own geodesy rather than with a second copy of it.
 *
 *  ⚠ DETERMINISTIC. A question list is a function of (kind, seed, n) and the data: the same three give the same
 *  questions on every device, which is what a challenge link (`?quest=<kind>.<seed>.<n>`) promises a class —
 *  everybody answers the same questions. The data is part of the input: a rebuilt gazetteer or day index can
 *  give an old seed a different list (the link still opens; it is the build's list).
 *
 *  THE KINDS (a registry — one entry per kind, every list below derived from it):
 *    where  «tap this city on the map» — GeoNames settlements from data/gazetteer-phone.json.gz (CC BY 4.0),
 *           three bands of difficulty by POPULATION RANK, scored by geodesic distance.
 *    when   «which year?» — the dated events of data/on-this-day.json (the border record's change days and the
 *           war record's events), asked on the map of that day and place with the year hidden, scored by |Δyear|.
 *  IntMap-authored text is en + jp (CONSTITUTION.md §7); names are the sources' own. No emoji.
 * ==========================================================================*/
import { INDEX_PATH, allDays, eventsOn, describe, viewOf, warLayerOf } from './on-this-day.js';
import { IntMapLang } from './lang-registry.js';

/* a kind's title is a translation held as data (js/lang-registry.js pickArgs) — resolved by IntMapLang.t at the reader's call */
const LA = IntMapLang.pickArgs();

/** the files the kinds read, by the name a kind lists in `needs` — the panel loads exactly these */
export const QUEST_DATA = Object.freeze({ gazetteer: 'data/gazetteer-phone.json.gz', onThisDay: INDEX_PATH });

/* ══ THE SCORE SCALE — one shape for every kind ════════════════════════════════════════════════════
   points = round(MAX ^ (1 − x)), x = the error ÷ the LARGEST error that question allows (0 … 1).
   A perfect answer is MAX, the worst possible answer is exactly 1 point (never 0, so an answer always
   differs from a skip, which is 0), and the score falls monotonically in between. Written as the
   exponential the brief names — max·exp(−d/L) — this is L = (largest error) ÷ ln(MAX): for `where`
   L = 20,015 km ÷ ln 1000 ≈ 2,897 km, so 1,000 km scores 708, 200 km 933.
   ⚠ §4 of .agents/rules/no-ad-hoc-hardcoding.md, for the one constant here:
     1. observation — MAX = 1000 is a choice of DISPLAY, not a measurement: three significant digits is
        enough to tell a 30 km answer from a 300 km one (970 vs 734) on a phone; nothing else depends on it.
     2. expiry      — changing MAX rescales every score, so personal bests kept in a browser
                      (js/quest-panel.js) stop being comparable; the panel keys them by kind and n only.
     3. source      — the «largest error» is not a constant of this file: for `where` it is half the
                      Earth's circumference from js/geodesy.js (_HALF_CIRCUM, injected), for `when` the
                      span of the day index itself (data/on-this-day.json `span`). */
export const QUEST_MAX = 1000;
const pointsFor = (x) => Math.round(Math.pow(QUEST_MAX, 1 - Math.min(1, Math.max(0, x))));

/* ══ THE SEED ═══════════════════════════════════════════════════════════════════════════════════ */
/** the characters a seed may hold — it travels in a query, and these need no escaping there */
export const SEED_RE = /^[A-Za-z0-9_-]+$/;
/* FNV-1a over the UTF-16 code units → a 32-bit state, then mulberry32. Both are public-domain one-liners
   with well-known behaviour; neither is used for anything secret. */
function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** a deterministic generator in [0,1) for (kind, seed) — the kind is mixed in so one seed gives each kind its own list */
export function rngFor(kind, seed) {
  let a = hash32(String(kind) + ':' + String(seed));
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** a new seed from two random 32-bit words — the CALLER supplies the randomness (crypto in the page) */
export function newSeed(u32a, u32b) {
  return ((u32a >>> 0).toString(36) + (u32b >>> 0).toString(36)).slice(0, 12) || '0';
}
/* k distinct indices of [0, len) in the generator's order (a partial Fisher–Yates) */
function pickIndices(rng, len, k) {
  const idx = Array.from({ length: len }, (_, i) => i), out = [];
  for (let i = 0; i < Math.min(k, len); i++) {
    const j = i + Math.floor(rng() * (len - i));
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
    out.push(idx[i]);
  }
  return out;
}

/* ══ KIND where — a city, tapped on the map ═════════════════════════════════════════════════════════ */
/** the rows a `where` question may ask: what GeoNames itself calls a settlement (the file's own `placeKinds`
 *  — sections of a city, historical and abandoned places are not asked), most populous first */
export function whereRows(doc) {
  const F = (doc && doc.fields) || [], kinds = (doc && doc.placeKinds) || {};
  const col = (name) => F.indexOf(name);
  const c = { en: col('en'), ja: col('ja'), iso2: col('iso2'), lng: col('lng'), lat: col('lat'), pop: col('pop'), gid: col('gid'), fcode: col('fcode'), disp: col('disp') };
  if (c.en < 0 || c.lng < 0 || c.lat < 0 || c.pop < 0 || c.fcode < 0) return [];
  const rows = [];
  ((doc && doc.rows) || []).forEach((r, k) => {
    const lng = +r[c.lng], lat = +r[c.lat];
    if (!r[c.en] || !isFinite(lng) || !isFinite(lat)) return;
    const kind = kinds[r[c.fcode]];
    if (!kind || kind.kind !== 'settlement') return;
    const en = (c.disp >= 0 && r[c.disp]) || r[c.en];
    rows.push({ k, id: (c.gid >= 0 && r[c.gid]) || (r[c.en] + '|' + lng + '|' + lat), en, jp: (c.ja >= 0 && r[c.ja]) || en,
      iso2: (c.iso2 >= 0 && r[c.iso2]) || '', at: [lng, lat], pop: +r[c.pop] || 0 });
  });
  /* by population, the file's order breaking ties — the file says it is sorted (`slice.by`), but the rank is
     the engine's claim, so it is made here rather than trusted */
  rows.sort((a, b) => (b.pop - a.pop) || (a.k - b.k));
  return rows;
}
/* THE DIFFICULTY BANDS — quantiles of the POPULATION RANK, on the rank's logarithm. The rows are cut at ranks
   N^(1/3) and N^(2/3) (N = the rows a `where` question may ask): with today's file 0–22, 22–495 and 495–N, i.e. the
   world's best-known cities, the well-known ones, and the rest. Why the logarithm rather than three equal thirds:
   city populations fall roughly as 1/rank (Zipf), so equal thirds of the RANK put a city of 300,000 people in the
   «easy» third — measured on the first build of this file, the easy band's first pick was Changyi (CN, 302,072).
   Equal steps of log(rank) are equal steps of log(population), which is what «well known» tracks. No population
   threshold is written anywhere: a rebuilt file moves the cuts with its own N.
   Question i of n is asked from band ⌊3i/n⌋ — a set climbs from easy to hard, so a link needs no level of its own;
   a band that runs out lends the question to the nearest band that has rows left. */
export const WHERE_BANDS = 3;
export const bandOf = (i, n) => Math.min(WHERE_BANDS - 1, Math.floor(i * WHERE_BANDS / Math.max(1, n)));
/** the rank where each band starts and ends: [0, ⌊N^(1/3)⌉, ⌊N^(2/3)⌉, N] */
export function bandEdges(N) {
  const e = [0];
  for (let b = 1; b < WHERE_BANDS; b++) e.push(Math.min(N, Math.max(e[b - 1], Math.round(Math.pow(N, b / WHERE_BANDS)))));
  e.push(N);
  return e;
}

const where = {
  id: 'where',
  title: LA('Find the place', '場所当て'),
  needs: ['gazetteer'],
  generate(rng, data, n) {
    const rows = whereRows(data && data.gazetteer), N = rows.length;
    if (!N) return [];
    const take = Math.min(n, N), E = bandEdges(N);
    /* each band shuffled once by the generator, then drawn from the front */
    const bands = [];
    for (let b = 0; b < WHERE_BANDS; b++) { const band = rows.slice(E[b], E[b + 1]); bands.push(pickIndices(rng, band.length, band.length).map((j) => band[j])); }
    const out = [];
    for (let i = 0; i < take; i++) {
      const want = bandOf(i, take);
      let b = -1;
      for (let d = 0; d < WHERE_BANDS && b < 0; d++) { if (bands[want + d] && bands[want + d].length) b = want + d; else if (bands[want - d] && bands[want - d].length) b = want - d; }
      if (b < 0) break;
      const r = bands[b].shift();
      out.push({ kind: 'where', i: out.length, band: b, id: r.id, name: { en: r.en, jp: r.jp }, iso2: r.iso2, at: r.at.slice(), pop: r.pop });
    }
    return out;
  },
  /** answer: { lng, lat } (null = skipped) → { points, max, detail: { km } } */
  score: (deps) => (q, a) => {
    if (!a || !isFinite(+a.lng) || !isFinite(+a.lat)) return { points: 0, max: QUEST_MAX, detail: { skipped: true } };
    const km = deps && typeof deps.distanceKm === 'function' ? deps.distanceKm(q.at, [+a.lng, +a.lat]) : null;
    const far = deps && +deps.halfCircumferenceKm;
    /* ⚠ a distance that could not be measured is not a distance of 0 or of the antipode — it is unscored */
    if (km == null || !isFinite(km) || !(far > 0)) return { points: 0, max: QUEST_MAX, detail: { unmeasured: true } };
    return { points: pointsFor(km / far), max: QUEST_MAX, detail: { km } };
  },
};

/* ══ KIND when — a dated event, its year hidden ═════════════════════════════════════════════════════
   The question is the event as js/on-this-day.js describes it (describe() — the record's statement about
   itself, under the names the map writes, never a sentence the record does not make) and the map of that day
   and place (viewOf()). Two kinds of event are not asked:
   · a 1 January border day (`maybeYearOnly`): the border record may date it by its year alone, so «the map of
     that day» may not be a day the record states — the same reason js/on-this-day.js never makes one a headline.
   · an event whose words already hold a year (four digits in a row in the en or jp text, the record or the war's
     name — «The 1949 Armistice Agreements», 「1943年のベンガル飢饉」): a question that prints a year is answered
     by reading, or is skewed by the year it prints. The rule is read off the text of every event, not a list. */
export const YEAR_IN_TEXT = /[0-9０-９]{4}/;
const yearOfIso = (d) => { const s = String(d); return +s.slice(0, s.lastIndexOf('-', s.length - 4)); };

/** every event a `when` question may ask, in the index's order: { md, k, ev, words } */
export function whenEvents(idx) {
  const out = [];
  if (!idx || !idx.days) return out;
  allDays().forEach((md) => {
    eventsOn(idx, md).forEach((ev, k) => {
      if (ev.maybeYearOnly) return;
      const en = describe(ev, idx, 'en'), jp = describe(ev, idx, 'jp');
      const words = { text: { en: en.text, jp: jp.text }, record: { en: en.record, jp: jp.record }, war: en.war ? { en: en.war, jp: jp.war } : null };
      const all = [words.text.en, words.text.jp, words.record.en, words.record.jp, words.war ? words.war.en : '', words.war ? words.war.jp : ''].join(' ');
      if (!all.trim() || YEAR_IN_TEXT.test(all)) return;
      out.push({ md, k, ev, words });
    });
  });
  return out;
}

const when = {
  id: 'when',
  title: LA('Guess the year', '年代当て'),
  needs: ['onThisDay'],
  generate(rng, data, n) {
    const idx = data && data.onThisDay, pool = whenEvents(idx);
    const span = (idx && idx.span) || null;
    if (!pool.length || !span) return [];
    return pickIndices(rng, pool.length, n).map((j, i) => {
      const e = pool[j];
      return { kind: 'when', i, md: e.md, k: e.k, d: e.ev.d, src: e.ev.src, year: yearOfIso(e.ev.d), span: { from: +span.from, to: +span.to },
        text: e.words.text, record: e.words.record, war: e.words.war, view: viewOf(e.ev), layer: warLayerOf(e.ev) };
    });
  },
  /** answer: { year } (null = skipped) → { points, max, detail: { off } } — the error is held against the largest
   *  error this question allows within the index's span, so a year at the edge of the span is not easier */
  score: () => (q, a) => {
    const y = a && Math.round(+a.year);
    if (a == null || !isFinite(y)) return { points: 0, max: QUEST_MAX, detail: { skipped: true } };
    const off = Math.abs(y - q.year), far = Math.max(q.year - q.span.from, q.span.to - q.year, 1);
    return { points: pointsFor(off / far), max: QUEST_MAX, detail: { off } };
  },
};

/* ══ THE REGISTRY ═══════════════════════════════════════════════════════════════════════════════ */
const DEFS = [where, when];
/** the kind ids, in the order the panel offers them */
export const QUEST_KIND_IDS = Object.freeze(DEFS.map((d) => d.id));
/** a kind's title in the reader's language, or null for an id that is not a kind */
export function kindTitle(id, lang) { const d = DEFS.find((x) => x.id === id); return d ? IntMapLang.t(lang, ...d.title) : null; }
/** the data names a kind needs (QUEST_DATA keys), or null */
export function kindNeeds(id) { const d = DEFS.find((x) => x.id === id); return d ? d.needs.slice() : null; }

/** The engine, with the measurements it borrows: `deps.distanceKm(a, b)` ([lng,lat] pairs → km) and
 *  `deps.halfCircumferenceKm`. → { kinds, generate(kind, seed, n, data), score(question, answer) } */
export function makeQuestEngine(deps) {
  const kinds = {};
  DEFS.forEach((d) => { kinds[d.id] = { id: d.id, title: d.title.slice(), needs: d.needs.slice(), generate: d.generate, score: d.score(deps || {}) }; });
  return {
    kinds,
    /** the question list of (kind, seed, n) over `data` ({ gazetteer, onThisDay } — whichever the kind needs) */
    generate(kind, seed, n, data) {
      const K = kinds[kind];
      if (!K) return [];
      const count = Math.max(0, Math.floor(+n) || 0);
      return K.generate(rngFor(kind, seed), data || {}, count);
    },
    score(q, a) { const K = q && kinds[q.kind]; return K ? K.score(q, a) : { points: 0, max: QUEST_MAX, detail: { unknownKind: true } }; },
  };
}

/* ══ THE CHALLENGE LINK — `?quest=<kind>.<seed>.<n>` (the page's mode, beside `?tour=` — js/map-state.js address) ══ */
export function questQuery(kind, seed, n) { return '?quest=' + encodeURIComponent(kind) + '.' + encodeURIComponent(seed) + '.' + Math.max(1, Math.floor(+n) || 1); }
/** `?quest=…` read back → { kind, seed, n }, or null when it is not a quest this engine can ask */
export function questFromSearch(search) {
  let q; try { q = new URLSearchParams(String(search || '')); } catch (_) { return null; }
  const v = q.get('quest'); if (!v) return null;
  const m = /^([a-z]+)\.([A-Za-z0-9_-]+)\.(\d+)$/.exec(String(v).trim());
  if (!m || QUEST_KIND_IDS.indexOf(m[1]) < 0 || !SEED_RE.test(m[2])) return null;
  const n = parseInt(m[3], 10);
  return n >= 1 ? { kind: m[1], seed: m[2], n } : null;
}
