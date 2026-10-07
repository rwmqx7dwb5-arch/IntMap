/* ============================================================================
 *  IntMap · curriculum-kit — a curriculum unit, and what IntMap opens for it   (curriculum-sales-kit)
 * ----------------------------------------------------------------------------
 *  「教員が『この単元でこれを使う』と即決できる導入パック」. A teacher thinks in units of the course they teach —
 *  地理総合 Ｃ（1）, key stage 3 «physical geography», C3's D2.Geo.1-3 — and IntMap spoke in examples, tours and layers.
 *  This module turns data/curriculum-units.json (the units, quoted from their primary documents, with what IntMap can
 *  open for each) into the model scripts/org-pages.mjs writes curriculum.html and ja/curriculum.html from:
 *
 *    · every map of a unit is a LINK THE APP ITSELF WOULD WRITE. An `example` is js/showcase.js's captured link (the
 *      app put into the example's state and asked for its address); a stated map (view + data layers, no date) is
 *      written by js/map-state.js `encode` — the codec of the address bar and of every share link. No link is typed.
 *    · a unit's tours are js/tours.js tourLink (the classroom mode), its quest js/quest-engine.js questQuery with the
 *      unit's own key as the seed, so everybody who opens a unit's challenge answers the same questions.
 *    · «Make a tour for this unit» is a WRITTEN TOUR (js/tours.js encodeCustomTour) whose steps are the unit's maps —
 *      an example step carries the example's sentence and question — opened with `&edit=1`, which js/tour-player.js
 *      hands to the tour builder as its draft. The builder is the existing one; this only supplies its argument.
 *    · a unit with nothing is «not covered yet», and the page says so: that list is the next product work.
 *
 *  ⚠ THE REGISTRIES ARE ASKED, NOT COPIED. Layer ids against js/layer-manifest.js sharedIds(), example ids against
 *  SHOWCASE (a withheld example is not offered), tour ids against TOURS, quest kinds against QUEST_KIND_IDS, the
 *  quest's length against the panel's own choices. `problems()` lists every disagreement; the generator refuses to
 *  write while there is one (scripts/org-pages.mjs) and tests/curriculum-sales-kit-checks.test.mjs holds it at zero.
 *  ⚠ js/showcase.js CURRICULUM (the five headings the example cards name) and this file's units are two places that
 *  name the same headings: the checks hold them to the same words and every example or tour that declares a heading
 *  to a unit under it.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!globalThis.window) globalThis.window = globalThis;   /* the app's pure modules read `window` only to publish; node has none */
const { SHOWCASE, CAPTURED } = await import('../js/showcase.js');
const { tourById, tourLink, tourSteps, encodeCustomTour, customTourLink, TOUR_REQUEST_LIMIT } = await import('../js/tours.js');
const { sharedIds } = await import('../js/layer-manifest.js');
const { encode } = await import('../js/map-state.js');
const { QUEST_KIND_IDS, questQuery, SEED_RE } = await import('../js/quest-engine.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const KIT_PATH = 'data/curriculum-units.json';
export const KIT = JSON.parse(readFileSync(join(ROOT, KIT_PATH), 'utf8'));

/* the question counts the quest panel offers (js/quest-panel.js, its «Questions per set» select) — read from the panel,
   so a unit cannot ask for a length the panel would not offer */
export const QUEST_LENGTHS = [...readFileSync(join(ROOT, 'js/quest-panel.js'), 'utf8').matchAll(/<option value="(\d+)">/g)].map((m) => +m[1]);

const LANG_I = { en: 0, jp: 1 };
const showcase = (id) => SHOWCASE.find((s) => s.id === id) || null;

/** a stated map → the fragment the app writes for it (js/map-state.js encode) */
export function stateHash(m) {
  return encode({ view: { lng: m.view.lng, lat: m.view.lat, zoom: m.view.zoom, bearing: 0, pitch: 0, proj: m.proj === 'globe' ? 'globe' : 'flat' },
    layers: m.layers.slice(), display: [], time: null, base: m.base === 'sat' ? 'sat' : 'map' });
}

/** every disagreement between the data and the registries it names → string[] (empty is good) */
export function problems(kit = KIT) {
  const bad = [];
  const shared = new Set(sharedIds());
  const ups = new Map(((kit.gov && kit.gov.upstreams) || []).map((u) => [u.id, u]));
  for (const u of ups.values()) {
    if (!/^https:\/\//.test(u.url || '')) bad.push('upstream ' + u.id + ': no https source URL');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(u.retrievedAt || '')) bad.push('upstream ' + u.id + ': no retrievedAt date');
    if (!/^[0-9a-f]{64}$/.test(u.sha256 || '')) bad.push('upstream ' + u.id + ': no sha256 of the file that was read');
  }
  const keys = new Set();
  for (const f of kit.frameworks || []) {
    if (!['jp', 'en'].includes(f.quoted)) bad.push(f.id + ': `quoted` must be jp or en');
    for (const s of f.subjects || []) {
      if (!ups.has(s.source)) bad.push(s.id + ': source ' + s.source + ' is not an upstream');
      const groups = new Set((s.groups || []).map((g) => g.key));
      for (const g of s.groups || []) { if (keys.has(g.key)) bad.push('duplicate key ' + g.key); keys.add(g.key); }
      for (const u of s.units || []) {
        const where = s.id + ' ' + u.key;
        if (keys.has(u.key)) bad.push('duplicate key ' + u.key); keys.add(u.key);
        if (!SEED_RE.test(u.key)) bad.push(where + ': the key is a quest seed and must match ' + SEED_RE);
        if (!groups.has(u.group)) bad.push(where + ': group ' + u.group + ' is not declared');
        if (!u.label || !u.gloss) bad.push(where + ': a unit needs its quoted label and a gloss');
        for (const m of u.maps || []) {
          if (m.example) {
            const e = showcase(m.example);
            if (!e) bad.push(where + ': example ' + m.example + ' is not shown (unknown or withheld)');
            else if (!(CAPTURED[e.id] && CAPTURED[e.id].hash)) bad.push(where + ': example ' + m.example + ' has no captured link');
            continue;
          }
          if (!m.title || !m.title[0] || !m.title[1]) bad.push(where + ': a stated map needs a title in en and jp');
          const v = m.view || {};
          if (!(Math.abs(v.lng) <= 180 && Math.abs(v.lat) <= 85 && v.zoom >= 0 && v.zoom <= 22)) bad.push(where + ': a stated map needs a view in range');
          if (!Array.isArray(m.layers)) bad.push(where + ': a stated map lists its layers (possibly none)');
          for (const id of m.layers || []) if (!shared.has(id)) bad.push(where + ': layer ' + id + ' is not a share-carried data layer (js/layer-manifest.js sharedIds)');
          if (m.at != null || m.time != null) bad.push(where + ': a stated map carries no date — a dated claim is an example or a tour, checked against the record');
          if (!(m.layers || []).length && m.base !== 'sat' && m.proj !== 'globe') bad.push(where + ': a stated map with no layer shows nothing a unit asked for');
        }
        for (const id of u.tours || []) if (!tourById(id)) bad.push(where + ': tour ' + id + ' does not exist');
        if (u.quest) {
          if (!QUEST_KIND_IDS.includes(u.quest.kind)) bad.push(where + ': quest kind ' + u.quest.kind + ' does not exist');
          if (!QUEST_LENGTHS.includes(u.quest.n)) bad.push(where + ': the quest panel offers ' + QUEST_LENGTHS.join('/') + ' questions, not ' + u.quest.n);
        }
      }
    }
  }
  return bad;
}

/* the steps a unit's tour starts from, in one language: an example is its captured link with its own words, a stated
   map its link with its title (the teacher writes what to say) */
function unitSteps(u, lang) {
  const i = LANG_I[lang];
  return (u.maps || []).map((m) => {
    if (m.example) { const e = showcase(m.example); return { title: e.title[i], say: e.blurb[i], ask: e.question[i], hash: CAPTURED[e.id].hash }; }
    return { title: m.title[i], say: '', ask: '', hash: stateHash(m) };
  });
}

/* the room the server leaves a written tour (js/tours.js TOUR_REQUEST_LIMIT is path + query) — measured against the
   hosted site's own path, the longest an IntMap page is served from today; the checks hold every unit's link under it */
export const SERVED_PATH = '/IntMap/index.html';

/* ── the model — built once, at import (the written tours are packed asynchronously by the one packing) ── */
async function build() {
  const bad = problems();
  const frameworks = [];
  for (const f of KIT.frameworks) {
    const subjects = [];
    for (const s of f.subjects) {
      const units = [];
      for (const u of s.units) {
        const maps = (u.maps || []).map((m) => {
          if (m.example) { const e = showcase(m.example); return e && CAPTURED[e.id] ? { kind: 'example', id: e.id, title: e.title, hash: CAPTURED[e.id].hash } : null; }
          return { kind: 'state', title: m.title, hash: stateHash(m), layers: m.layers.slice() };
        }).filter(Boolean);
        const tours = (u.tours || []).map((id) => tourById(id)).filter(Boolean).map((t) => ({ id: t.id, title: t.title, query: tourLink(t.id, 1).replace(/^\.\/index\.html/, ''), steps: tourSteps(t).length }));
        const quest = u.quest && QUEST_KIND_IDS.includes(u.quest.kind) ? { kind: u.quest.kind, n: u.quest.n, query: questQuery(u.quest.kind, u.key, u.quest.n) } : null;
        const make = {};
        if (maps.length) {
          for (const lang of ['en', 'jp']) {
            const steps = unitSteps(u, lang);
            const title = s.name[LANG_I[lang]] + ' — ' + (f.quoted === lang ? u.label : u.gloss);
            const t = await encodeCustomTour({ title, steps }, { plain: true });
            make[lang] = { query: customTourLink('./index.html', t, steps[0].hash, { edit: true }).replace(/^\.\/index\.html/, ''), steps: steps.length };
          }
        }
        units.push({ ...u, maps, tours, quest, make, covered: !!(maps.length || tours.length || quest) });
      }
      subjects.push({ ...s, units, upstream: KIT.gov.upstreams.find((x) => x.id === s.source) });
    }
    frameworks.push({ ...f, subjects });
  }
  const all = frameworks.flatMap((f) => f.subjects.flatMap((s) => s.units));
  return { frameworks, upstreams: KIT.gov.upstreams, counts: { units: all.length, covered: all.filter((u) => u.covered).length, open: all.filter((u) => !u.covered).length }, problems: bad };
}
export const MODEL = await build();

/** the units no map, tour or quest answers yet, framework by framework → [{ framework, subject, key, label, gloss }] */
export function uncovered(model = MODEL) {
  return model.frameworks.flatMap((f) => f.subjects.flatMap((s) => s.units.filter((u) => !u.covered).map((u) => ({ framework: f.id, subject: s.id, key: u.key, label: u.label, gloss: u.gloss }))));
}

/** the longest «Make a tour» request a unit produces, measured as the server would receive it → { key, bytes, limit } */
export function longestMakeRequest(model = MODEL) {
  let worst = { key: null, bytes: 0, limit: TOUR_REQUEST_LIMIT };
  for (const f of model.frameworks) for (const s of f.subjects) for (const u of s.units) for (const lang of ['en', 'jp']) {
    const q = u.make[lang] && u.make[lang].query; if (!q) continue;
    const bytes = new TextEncoder().encode(SERVED_PATH + q.slice(0, q.indexOf('#') < 0 ? q.length : q.indexOf('#'))).length;
    if (bytes > worst.bytes) worst = { key: u.key + ' (' + lang + ')', bytes, limit: TOUR_REQUEST_LIMIT };
  }
  return worst;
}

