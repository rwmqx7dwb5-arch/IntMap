/* ============================================================================
 *  IntMap · js/polity-arc.js — RISE AND FALL: one polity, read across the whole of time   (hist-product)
 * ----------------------------------------------------------------------------
 *  The time machine shows one instant; the year book reads one instant; «this place through time» reads one point. None
 *  of them could answer what a learner asks of ONE polity: when did the map begin to draw the Mongol Empire, how large
 *  did it draw it and when, and when did it stop? This is that page. For any polity the border records draw it shows
 *    · WHEN — the first and the last year the map draws it, and whether that edge is the polity's or a record's (the year
 *      OpenHistoricalMap or CShapes begins is a change of record, and the page says so instead of calling it a founding);
 *    · HOW LARGE — a chart of the area of the shape drawn under its name at every instant the records change it, coloured
 *      by the record that drew each stretch, with the seams between records marked and the largest drawn extent named;
 *    · AND LETS THE READER GO THERE — tap the chart to move the clock to that year; «largest», «first» and «last» move the
 *      clock and fit the map; «play its life» plays the time-lapse through exactly the instants its shape changes
 *      (js/time-lapse.js `startLapse({ instants })` — no frame where nothing about it changed);
 *    · AND WHAT ELSE IT IS CALLED — the other names in the records linked to the same Wikidata item, and the names the map
 *      writes identically in the reader's language, each with the reason it is listed.
 *  With nothing asked it lists the polities by their largest drawn extent, and a search field finds any of them by the
 *  name the map writes, in English or in the reader's language. Doors: the Chronos panel (js/news-timeline.js), each row
 *  of «this place through time» (js/place-history.js → js/place-dossier.js), and Atlas `time.polityArc`
 *  (js/atlas-cap-time.js → `atlas` below).
 *
 *  ⚠ IT STATES ONLY WHAT THE MAP DRAWS (.agents/rules/historical-verification.md). The index (data/polity-arcs.json) is
 *    written by scripts/build-polity-arcs.mjs from the map's own js/time-borders.js, instantiated; this file decides
 *    nothing about history. An area is the area OF THE DRAWN SHAPE, never a claim about a realm's control, and the page
 *    says so beside the chart.
 *  Strings IntMap writes here are en + jp (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';
import './safe-html.js';   /* publishes globalThis.IntMapSafe — the escaper below */

/** the app's one escaper (js/safe-html.js) — read once, here */
const esc = (s) => globalThis.IntMapSafe.html(String(s == null ? '' : s));

const ARCS_PATH = 'data/polity-arcs.json';
let _idx = null;
/** the index, read once (a failed read is forgotten so the next door asks again) */
function loadArcs() {
  if (!_idx) _idx = jsonWithin(ARCS_PATH, clockFor(ARCS_PATH)).catch((e) => { _idx = null; throw e; });
  return _idx;
}

/* ══ READING THE INDEX — pure: no map, no clock, no DOM (tests/hist-product-checks.test.mjs evaluates them) ══════════ */
const norm = (s) => String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
/** the name the map writes on the polity in the reader's language */
const nameOf = (arc, lang) => (lang === 'jp' && arc.j ? arc.j : arc.n);

/** the polities whose name (as the map writes it, in English or in Japanese) or Wikidata item matches `q`:
 *  the exact name first, then names that begin with it, then names that contain it; within each, the larger drawn first */
export function search(idx, q, limit) {
  const k = norm(q);
  if (!k) return [];
  const rank = (a) => {
    const names = [norm(a.n), norm(a.j)];
    if (names.includes(k) || (a.q || []).some((x) => norm(x) === k)) return 0;
    if (names.some((x) => x && x.startsWith(k))) return 1;
    if (names.some((x) => x && x.includes(k))) return 2;
    return -1;
  };
  return idx.arcs.map((a) => ({ a, r: rank(a) })).filter((x) => x.r >= 0)
    .sort((x, y) => x.r - y.r || y.a.pk[1] - x.a.pk[1]).slice(0, limit || 30).map((x) => x.a);
}
/** the polities the DATED records draw (Cliopatria, OpenHistoricalMap, CShapes), by their largest drawn extent — the
 *  sheets' cultural areas are searchable but not ranked beside them: a sheet states a period, not a polity's year.
 *  (polity-pages) exported: the same rule chooses which polities have a static page (scripts/polity-pages.mjs) */
export function largest(idx, limit) { return idx.arcs.filter((a) => a.d && a.d.length).slice(0, limit || 20); }
/** one polity by its Wikidata item, else its name; when several share the item, the one the map draws in `year` */
function find(idx, want) {
  const w = want || {};
  const covers = (a, y) => { const D = describe(idx, a); return y != null && D.first != null && y >= D.first.y && (D.last.y == null || y <= D.last.y); };
  const qids = [].concat(w.qid || []).filter(Boolean);
  if (qids.length) {
    const hits = idx.arcs.filter((a) => (a.q || []).some((q) => qids.includes(q)));
    const byName = w.name ? hits.find((a) => a.n === w.name || a.j === w.name) : null;
    if (byName) return byName;
    if (hits.length) return hits.find((a) => covers(a, w.year)) || hits[0];
  }
  if (w.name) {
    const k = norm(w.name);
    const hits = idx.arcs.filter((a) => norm(a.n) === k || norm(a.j) === k);
    if (hits.length) return hits.find((a) => covers(a, w.year)) || hits[0];
  }
  return null;
}

/* the records, in the bit order of a point's mask */
const recsOf = (idx, mask) => (idx.recs || []).filter((_, i) => mask & (1 << i));
/** the most precise record in a mask — the one that drew most of a composed stretch (the map composes the more precise first) */
const leadRec = (idx, mask) => { const r = recsOf(idx, mask); return r.length ? r[r.length - 1] : 'sheet'; };

/** each dated record's first year, from the reach the index states (its `windows`), else its three edges */
function beginsOf(I) {
  const W = I.windows;
  const first = (r) => (W && Array.isArray(W[r]) && W[r].length ? Math.min(...W[r].map((w) => w[0])) : null);
  return { clio: first('clio') ?? I.clioFrom, ohm: first('ohm') ?? I.dayFrom, cshapes: first('cshapes') ?? I.csFrom };
}

/**
 * describe(idx, arc) — what the page and Atlas say about one polity.
 *   → { first:{y, edge}, last:{y|null, edge}, peak:{y, km, recs, bb}, points:[{y, km, recs}], sheets:[{y, km}],
 *       changes:[years the drawn shape changes], records:[…], seams:[{y, rec}] }
 *   `edge`: 'stated' (the record draws it from / to here), 'reach' (the first or last year that record covers — a change
 *   of record, not of the polity), 'today' (still drawn at the last year the records cover), 'sheet' (only the sheets draw it).
 */
export function describe(idx, arc) {
  const I = idx.instants || {};
  const d = arc.d || [], s = (arc.s || []).map((x) => ({ y: x[0], km: x[1] }));
  const points = d.map((p) => ({ y: p[0], km: p[1], recs: recsOf(idx, p[2]) }));
  const records = [...new Set(points.flatMap((p) => p.recs))];
  const out = { points, sheets: s, records, changes: points.map((p) => p.y), seams: [] };
  if (!points.length) {
    out.first = s.length ? { y: s[0].y, edge: 'sheet' } : null;
    out.last = s.length ? { y: s[s.length - 1].y, edge: 'sheet' } : { y: null, edge: 'sheet' };
  } else {
    const p0 = points[0], pn = points[points.length - 1];
    /* the first year a record covers: Cliopatria's first, OpenHistoricalMap's first (1689), CShapes's first (1886) — from the
       reach the index states (`instants.windows`, scripts/build-polity-arcs.mjs recordWindows), else the three edges.
       ⚠ (wave4-refine) A RANGE, NOT AN EQUALITY: a first point AT OR BEFORE its record's first year is the record's edge. The
       equality let a point the index held 119,600 years below Cliopatria's reach (Sumerian City-States at 122,999 BC) be
       called a stated beginning, and the page said «from 123,000 BC». The index no longer holds such a point (the builder
       measures a record's pieces inside its reach only); this reads the edge the same way whatever the index holds. */
    const begins = beginsOf(I);
    out.first = { y: p0.y, edge: p0.recs.some((r) => begins[r] != null && p0.y <= begins[r]) ? 'reach' : 'stated', rec: leadRec(idx, d[0][2]) };
    if (pn.km > 0) out.last = { y: I.to, edge: 'today', rec: leadRec(idx, d[d.length - 1][2]) };
    else {
      const before = d[d.length - 2];
      const lastRecs = before ? recsOf(idx, before[2]) : [];
      /* an end on the day the next record begins is a hand-over between records (scripts/build-hist-clio.mjs cuts the
         records against each other there) — the next record may draw the same ground under another name */
      const handover = (pn.y === I.dayFrom && lastRecs.includes('clio') && !lastRecs.includes('ohm')) || (pn.y === I.csFrom && lastRecs.includes('ohm') && !lastRecs.includes('cshapes'));
      out.last = { y: pn.y - 1, edge: handover ? 'reach' : 'stated', rec: before ? leadRec(idx, before[2]) : null };
      if (handover) out.last.by = pn.y === I.dayFrom ? 'ohm' : 'cshapes';
    }
    /* the seams inside its span: a record begins */
    for (const [rec, y] of [['ohm', I.dayFrom], ['cshapes', I.csFrom]]) if (y != null && y > out.first.y && (out.last.y == null || y <= out.last.y)) out.seams.push({ y, rec });
  }
  const pk = arc.pk || [];
  out.peak = { y: pk[0], km: pk[1], recs: pk[2] ? recsOf(idx, pk[2]) : ['sheet'], bb: pk[3] || arc.bb };
  return out;
}
/** the drawn area in year `y` (the step the index holds), and the records that drew it — null where it is not drawn
 *  (polity-pages: exported with `related` and `chartSvg` — the static pages, scripts/polity-pages.mjs, read the index
 *  through the same three, so a page and this sheet cannot state a polity differently) */
export function valueAt(idx, arc, y) {
  const d = arc.d || [];
  let hit = null;
  for (const p of d) { if (p[0] <= y) hit = p; else break; }
  if (hit && hit[1] > 0) return { y, km: hit[1], recs: recsOf(idx, hit[2]) };
  const sh = (arc.s || []).find((x) => x[0] === y);
  return sh ? { y, km: sh[1], recs: ['sheet'] } : null;
}
/** the other names: linked to the same Wikidata item, or written identically by the map in the reader's language */
export function related(idx, arc, lang) {
  const out = [], seen = new Set([arc]);
  const qs = arc.q || [];
  for (const a of idx.arcs) if (!seen.has(a) && (a.q || []).some((q) => qs.includes(q))) { seen.add(a); out.push({ arc: a, why: 'qid', qid: (a.q || []).find((q) => qs.includes(q)) }); }
  const mine = nameOf(arc, lang);
  if (lang === 'jp' && arc.j) for (const a of idx.arcs) if (!seen.has(a) && a.j === mine) { seen.add(a); out.push({ arc: a, why: 'name' }); }
  return out.sort((x, y) => (describe(idx, x.arc).first || { y: 0 }).y - (describe(idx, y.arc).first || { y: 0 }).y);
}

/* ══ ONE WIKIDATA ITEM, ONE PAGE (wave4-refine) ═════════════════════════════════════════════════════════════════
   The index is keyed by the NAME the map writes, so one Wikidata item the records draw under several names is several entries
   — «United States» (OpenHistoricalMap) and «United States of America» (CShapes), both Q30; the 27 slices «New Spain
   (1667-1697)» … «New Spain (1865-1899)», all Q170603. The static pages (scripts/polity-pages.mjs) are one per ITEM: the names
   whose records state exactly one item and the same one are drawn as one line — the area drawn under any of them at each
   instant, summed. ⚠ IDENTITY IS THE RECORDS' STATED ITEM, NEVER A SPELLING: a name with no item stays its own, and a name
   whose records state two items (the index's «Ottoman Empire» carries Q12560 and Q1529261) is already two items under one
   spelling and joins neither. ⚠ AND THE STATED ITEM MUST BE THAT NAME'S UNIT (.agents/rules/historical-verification.md §4-3):
   only a name whose item the builder CONFIRMED (`qv` 'ok' — scripts/build-polity-arcs.mjs itemIdentity: the item's own
   labels agree with the row's own names, and its lifespan meets the drawn span) joins. «Zhai» states the Qin dynasty's
   item and «Republic of Pirates» The Bahamas'; they keep their own pages, and itemsPending lists them for review.
   The page is headed by the name drawn over the most years among the names that write no year they are drawn in
   («New Spain (1667-1697)» writes 1697 — a slice of the record, not the polity's name); only when every name writes one
   is a dated name the heading. */

/** the narrow box of a set of boxes — the narrow way round the antimeridian. A polity that straddles 180° (the Russian
 *  Empire with Alaska, Fiji) has a plain box the width of the world; the longitudes its parts cover are arcs on a circle, and
 *  the box is the complement of the widest empty gap between them. (scripts/build-polity-arcs.mjs measures with this one.) */
export function narrowBox(boxes) {
  if (!boxes.length) return null;
  const r2 = (x) => Math.round(x * 100) / 100;
  const s = Math.min(...boxes.map((b) => b[1])), n = Math.max(...boxes.map((b) => b[3]));
  const iv = boxes.map((b) => [b[0], b[2]]).sort((a, b) => a[0] - b[0]);
  /* merge the covered arcs, then find the widest gap between consecutive ones (and the one across ±180°) */
  const merged = [];
  for (const x of iv) { const l = merged[merged.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else merged.push([x[0], x[1]]); }
  let best = { gap: (merged[0][0] + 360) - merged[merged.length - 1][1], w: merged[0][0], e: merged[merged.length - 1][1] };
  for (let i = 1; i < merged.length; i++) {
    const gap = merged[i][0] - merged[i - 1][1];
    if (gap > best.gap) best = { gap, w: merged[i][0], e: merged[i - 1][1] + 360 };
  }
  return [r2(best.w), r2(s), r2(best.e), r2(n)];
}
/* the step a name's line holds in year `y`: [km, mask] (0 where it is not drawn) */
const stepAt = (a, y) => { let hit = null; for (const p of a.d || []) { if (p[0] <= y) hit = p; else break; } return hit && hit[1] > 0 ? [hit[1], hit[2]] : [0, 0]; };
/** the years a name is drawn, counted from its line (each point holds until the next; one still drawn runs to `to`) */
function drawnYears(arc, to) {
  const d = arc.d || [];
  let n = 0;
  for (let i = 0; i < d.length; i++) if (d[i][1] > 0) n += (i + 1 < d.length ? d[i + 1][0] : to + 1) - d[i][0];
  return n;
}
/** the dated names grouped by the one Wikidata item their records state → Map(arc → { qid, canon, members }), for the items
 *  drawn under two names or more. `canon` — the name drawn over the most years (then the larger, then by name) — names the page. */
/* the names of one item: a name stating exactly that one item, and (`confirmed`) one whose item the builder confirmed */
function byItem(arcs, confirmed) {
  const byQ = new Map();
  for (const a of arcs) {
    if (!(a.d && a.d.length && a.q && a.q.length === 1)) continue;
    if (confirmed && !(a.qv && a.qv[0] === 'ok')) continue;
    const k = a.q[0]; if (!byQ.has(k)) byQ.set(k, []); byQ.get(k).push(a);
  }
  return byQ;
}
/* does a name write a year it is drawn in («New Spain (1667-1697)», drawn 1689–1697) */
function writesItsYear(a, to) {
  const d = a.d || [], drawn = d.filter((p) => p[1] > 0).map((p) => p[0]);
  if (!drawn.length) return false;
  const from = Math.min(...drawn), end = d[d.length - 1][1] === 0 ? d[d.length - 1][0] - 1 : to;
  return (String(a.n).match(/\d+/g) || []).some((x) => +x >= from && +x <= end);
}
/** the names that state an item shared with another name but whose item was not confirmed for them — never joined, listed
 *  for review: [{ qid, name, why }] (`why`: 'differs' | 'lifespan' | 'unverified', scripts/build-polity-arcs.mjs itemIdentity) */
export function itemsPending(idx, arcs) {
  const out = [];
  for (const [qid, ms] of byItem(arcs, false)) {
    if (ms.length < 2) continue;
    for (const a of ms) if (!(a.qv && a.qv[0] === 'ok')) out.push({ qid, name: a.n, why: (a.qv && a.qv[0]) || 'unverified' });
  }
  return out.sort((x, y) => (x.qid < y.qid ? -1 : x.qid > y.qid ? 1 : x.name < y.name ? -1 : 1));
}
export function itemsOf(idx, arcs) {
  const to = (idx.instants || {}).to;
  const byQ = byItem(arcs, true);
  const out = new Map();
  for (const [qid, ms] of byQ) {
    if (ms.length < 2) continue;
    const yrs = new Map(ms.map((a) => [a, drawnYears(a, to)]));
    const plain = ms.filter((a) => !writesItsYear(a, to));
    const canon = [...(plain.length ? plain : ms)].sort((x, y) => yrs.get(y) - yrs.get(x) || y.pk[1] - x.pk[1] || (x.n < y.n ? -1 : x.n > y.n ? 1 : 0))[0];
    const members = [...ms].sort((x, y) => x.d[0][0] - y.d[0][0] || (x.n < y.n ? -1 : x.n > y.n ? 1 : 0));
    const it = { qid, canon, members };
    for (const a of ms) out.set(a, it);
  }
  return out;
}
/** one item's line, in the index's own shape (so describe / valueAt / chartSvg read it as they read a name): at every instant
 *  any member's line changes, the area drawn under all of them and the records that drew it; `names` lists them. */
export function itemArc(it) {
  const ms = it.members, c = it.canon;
  const years = [...new Set(ms.flatMap((a) => a.d.map((p) => p[0])))].sort((a, b) => a - b);
  const d = [];
  for (const y of years) {
    let km = 0, mask = 0;
    for (const a of ms) { const [k, m] = stepAt(a, y); km += k; mask |= m; }
    const prev = d[d.length - 1];
    if (!prev && !km) continue;
    if (!prev || prev[1] !== km || prev[2] !== mask) d.push([y, km, mask]);
  }
  const sy = new Map();
  for (const a of ms) for (const [y, km] of a.s || []) sy.set(y, (sy.get(y) || 0) + km);
  let pk = null;
  for (const p of d) if (p[1] > 0 && (!pk || p[1] > pk[1])) pk = p;   /* the earliest instant of the largest area */
  /* the box at the largest instant: each member drawn then, by its own box at its own largest if that is the year, else its whole box */
  const pkBox = narrowBox(ms.filter((a) => stepAt(a, pk[0])[0] > 0).map((a) => (a.pk && a.pk[0] === pk[0] && a.pk[3] ? a.pk[3] : a.bb)).filter(Boolean));
  const o = { n: c.n, q: [it.qid], d, bb: narrowBox(ms.map((a) => a.bb).filter(Boolean)), pk: [pk[0], pk[1], pk[2], pkBox], names: ms.map((a) => a.n), members: ms };
  if (c.j) o.j = c.j;
  if (sy.size) o.s = [...sy.entries()].sort((a, b) => a[0] - b[0]);
  return o;
}

/* ══ WORDS ══════════════════════════════════════════════════════════════════════════════════════════════════ */
/* the reader's language — handed in by the door that opens the sheet (`want.lang`), as js/year-book.js receives it */
let langOf = () => 'en';
const lang = () => { try { return langOf() || 'en'; } catch (_) { return 'en'; } };
/** a year as the reader reads it (astronomical: 0 is 1 BC) */
export function yearWords(y, lg) {
  if (y == null) return '';
  if (y <= 0) return lg === 'jp' ? '紀元前' + (1 - y) + '年' : (1 - y) + ' BC';
  return lg === 'jp' ? y + '年' : String(y);
}
const kmWords = (km) => Math.round(km).toLocaleString() + ' km²';
/* a record in its own words: the head of the `src` it states («CShapes 2.0 (Schvitz…) · CC BY-NC-SA 4.0» → «CShapes 2.0») */
const shortSrc = (src) => String(src || '').split(' · ')[0].replace(/\s*\(.*$/, '').replace(/^.*\//, '').trim();
const recordName = (idx, rec) => shortSrc(idx.src && idx.src[rec]) || rec;
function edgeWords(idx, side, x, lg) {
  const t = IntMapLang.pick(() => lg);
  if (!x || x.y == null) return '';
  const at = yearWords(x.y, lg);
  if (x.edge === 'today') return t(at + ' — still drawn in the last year the records cover', at + '（記録が届く最後の年にも描かれている）');
  if (x.edge === 'sheet') return t(at + ' (a ' + recordName(idx, 'sheet') + ' map of that year)', at + '（' + recordName(idx, 'sheet') + ' のその年の図）');
  if (x.edge === 'reach') {
    const rn = recordName(idx, side === 'first' ? x.rec : x.by);
    return side === 'first' ? t(at + ' — where ' + rn + ' begins: earlier, another record may draw this ground under another name', at + '（' + rn + ' の記録の始まり。それ以前は別の記録が別の名前で描いている場合がある）')
      : t(at + ' — then ' + rn + ' takes over and may draw this ground under another name', at + '（以降は ' + rn + ' の記録で、別の名前で描かれている場合がある）');
  }
  return at;
}

/* ══ THE CHART — an SVG string, from describe(); the same picture for every polity ══════════════════════════════ */
const CW = 340, CH = 150, ML = 6, MR = 6, MT = 14, MB = 20;
/** the x-range a polity is drawn over: its first year to the year after its last (its whole span, end exclusive) */
export function spanOf(D) {
  if (!D.first) return null;
  let a = D.first.y, b = D.last && D.last.y != null ? D.last.y + 1 : a + 1;
  if (D.sheets.length && !D.points.length) { a = D.sheets[0].y; b = D.sheets[D.sheets.length - 1].y; if (b - a < 20) { a -= 10; b += 10; } }
  return [a, Math.max(b, a + 1)];
}
/** the chart, as an SVG string (`nowY` null: no clock line) — styled by the classes below (CSS), and on the static pages
 *  by css/history-pages.css, which names the same classes */
export function chartSvg(idx, arc, D, lg, nowY) {
  const t = IntMapLang.pick(() => lg);
  const sp = spanOf(D); if (!sp) return '';
  const [a, b] = sp, top = Math.max(1, D.peak.km) * 1.1;
  const X = (y) => ML + (CW - ML - MR) * (y - a) / (b - a), Y = (km) => MT + (CH - MT - MB) * (1 - km / top);
  let g = '';
  /* the steps: each point holds until the next one (the records do not change it in between) */
  D.points.forEach((p, i) => {
    if (!(p.km > 0)) return;
    const y1 = i + 1 < D.points.length ? D.points[i + 1].y : b;
    const rec = p.recs[p.recs.length - 1] || 'sheet';
    g += '<rect class="pa-bar pa-' + esc(rec) + '" x="' + X(p.y).toFixed(2) + '" y="' + Y(p.km).toFixed(2) + '" width="' + Math.max(0.6, X(y1) - X(p.y)).toFixed(2) + '" height="' + (CH - MB - Y(p.km)).toFixed(2) + '"></rect>';
  });
  for (const s of D.sheets) if (s.y >= a && s.y <= b) g += '<circle class="pa-dot" cx="' + X(s.y).toFixed(2) + '" cy="' + Y(s.km).toFixed(2) + '" r="3"></circle>';
  for (const s of D.seams) g += '<line class="pa-seam" x1="' + X(s.y).toFixed(2) + '" x2="' + X(s.y).toFixed(2) + '" y1="' + MT + '" y2="' + (CH - MB) + '"></line><text class="pa-seamt" x="' + (X(s.y) + 2).toFixed(2) + '" y="' + (MT + 8) + '">' + esc(recordName(idx, s.rec)) + '</text>';
  if (D.peak.y != null) g += '<circle class="pa-peak" cx="' + X(Math.min(D.peak.y + 0.5, b)).toFixed(2) + '" cy="' + Y(D.peak.km).toFixed(2) + '" r="3.5"></circle>';
  if (nowY != null && nowY >= a && nowY <= b) g += '<line class="pa-now" x1="' + X(nowY).toFixed(2) + '" x2="' + X(nowY).toFixed(2) + '" y1="' + (MT - 4) + '" y2="' + (CH - MB) + '"></line>';
  g += '<line class="pa-axis" x1="' + ML + '" x2="' + (CW - MR) + '" y1="' + (CH - MB) + '" y2="' + (CH - MB) + '"></line>';
  g += '<text class="pa-tick" x="' + ML + '" y="' + (CH - 5) + '">' + esc(yearWords(a, lg)) + '</text><text class="pa-tick" text-anchor="end" x="' + (CW - MR) + '" y="' + (CH - 5) + '">' + esc(yearWords(b - 1, lg)) + '</text>';
  return '<svg class="pa-chart" viewBox="0 0 ' + CW + ' ' + CH + '" role="img" data-a="' + Number(a) + '" data-b="' + Number(b) + '" aria-label="' + esc(t('Area drawn under this name, ' + yearWords(a, lg) + ' to ' + yearWords(b - 1, lg) + '; largest ' + kmWords(D.peak.km) + ' in ' + yearWords(D.peak.y, lg), yearWords(a, lg) + 'から' + yearWords(b - 1, lg) + 'までにこの名前で描かれた面積。最大は' + yearWords(D.peak.y, lg) + 'の ' + kmWords(D.peak.km))) + '">' + g + '</svg>';
}

/* ══ THE SHEET ═══════════════════════════════════════════════════════════════════════════════════════════════════ */
const CSS = `.pa-panel{ position:fixed; z-index:var(--z-sheet); top:72px; right:12px; width:min(380px, calc(100vw - 24px)); max-height:calc(100vh - 160px); display:flex; flex-direction:column; border-radius:16px; background:var(--popup-bg); -webkit-backdrop-filter:blur(22px) saturate(1.6); backdrop-filter:blur(22px) saturate(1.6); border:1px solid var(--glass-border,rgba(128,128,128,0.2)); box-shadow:var(--shadow); color:var(--text-main); overflow:hidden; }
.pa-panel[hidden]{ display:none; }
.pa-head{ display:flex; align-items:center; gap:6px; padding:10px 10px 8px; border-bottom:1px solid rgba(128,128,128,0.16); }
.pa-title{ flex:1; margin:0; font-size:15px; font-weight:700; text-align:center; }
.pa-x,.pa-back{ flex:none; width:32px; height:32px; border-radius:50%; border:0; background:var(--input-bg); color:var(--text-main); font-size:18px; line-height:1; cursor:pointer; }
.pa-back[hidden]{ visibility:hidden; display:block; }
.pa-body{ overflow-y:auto; overscroll-behavior:contain; padding:8px 12px 12px; }
.pa-q{ width:100%; box-sizing:border-box; padding:9px 12px; border-radius:10px; border:1px solid var(--glass-border,rgba(128,128,128,0.25)); background:var(--input-bg); color:var(--text-main); font:inherit; font-size:14px; }
.pa-wait,.pa-note{ font-size:11px; color:var(--text-muted); line-height:1.45; margin:6px 0 0; }
.pa-sec{ margin-top:10px; }
.pa-sec h4{ margin:0 0 5px; font-size:11px; letter-spacing:.04em; text-transform:uppercase; color:var(--text-muted); }
.pa-list{ list-style:none; margin:0; padding:0; border-radius:10px; overflow:hidden; background:var(--input-bg); }
.pa-row{ display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 8px; width:100%; padding:8px 10px; border:0; border-bottom:1px solid rgba(128,128,128,0.14); background:transparent; color:var(--text-main); text-align:left; font:inherit; cursor:pointer; min-height:44px; }
.pa-list li:last-child .pa-row{ border-bottom:0; }
.pa-n{ font-size:13px; font-weight:600; flex:1 1 auto; }
.pa-v{ font-size:11px; color:var(--text-muted); font-variant-numeric:tabular-nums; }
.pa-s{ flex-basis:100%; font-size:11px; color:var(--text-muted); line-height:1.35; }
.pa-name{ margin:2px 0 0; font-size:20px; font-weight:750; line-height:1.2; }
.pa-sub{ margin:2px 0 0; font-size:11.5px; color:var(--text-muted); }
.pa-sub a{ color:var(--primary-color); text-decoration:none; }
.pa-facts{ display:grid; grid-template-columns:auto 1fr; gap:4px 10px; margin:10px 0 0; font-size:12.5px; }
.pa-facts dt{ color:var(--text-muted); }
.pa-facts dd{ margin:0; font-variant-numeric:tabular-nums; }
.pa-chartbox{ margin-top:10px; border-radius:12px; background:var(--input-bg); padding:6px 6px 2px; touch-action:none; }
.pa-chart{ width:100%; height:auto; display:block; cursor:crosshair; }
.pa-bar{ opacity:.85; }
.pa-clio{ fill:#8e6bd8; } .pa-ohm{ fill:#2bb3a3; } .pa-cshapes{ fill:#3b82f6; }
.pa-key i.pa-clio{ background:#8e6bd8; } .pa-key i.pa-ohm{ background:#2bb3a3; } .pa-key i.pa-cshapes{ background:#3b82f6; } .pa-key i.pa-sw{ background:transparent; border:1.5px solid var(--text-muted); box-sizing:border-box; border-radius:50%; }
.pa-dot{ fill:none; stroke:var(--text-muted); stroke-width:1.4; }
.pa-peak{ fill:var(--popup-bg,#fff); stroke:var(--text-main); stroke-width:1.6; }
.pa-seam{ stroke:var(--text-muted); stroke-width:1; stroke-dasharray:3 3; }
.pa-seamt,.pa-tick{ font-size:9px; fill:var(--text-muted); }
.pa-now{ stroke:var(--primary-color,#0a84ff); stroke-width:1.5; }
.pa-axis{ stroke:rgba(128,128,128,0.4); stroke-width:1; }
.pa-read{ min-height:16px; margin:2px 4px 4px; font-size:11.5px; font-variant-numeric:tabular-nums; }
.pa-key{ display:flex; flex-wrap:wrap; gap:4px 10px; margin:4px 2px 0; font-size:10.5px; color:var(--text-muted); }
.pa-key i{ display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:4px; vertical-align:-1px; }
.pa-acts{ display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }
.pa-act{ flex:1 1 auto; min-height:40px; padding:8px 10px; border-radius:10px; border:1px solid var(--glass-border,rgba(128,128,128,0.25)); background:var(--input-bg); color:var(--text-main); font:inherit; font-size:12.5px; font-weight:650; cursor:pointer; }
.pa-act.pa-primary{ background:var(--primary-fill,#0a84ff); color:#fff; border-color:transparent; }
.pa-src{ margin-top:12px; font-size:10px; color:var(--text-muted); line-height:1.4; }
@media (max-width:700px){
  .pa-panel{ top:auto; right:0; left:0; bottom:0; width:100%; max-height:78vh; border-radius:16px 16px 0 0; padding-bottom:var(--safe-bottom); }
  .pa-x,.pa-back{ width:40px; height:40px; }
}`;
function ensureStyle() { if (typeof document === 'undefined' || document.getElementById('polity-arc-css')) return; const st = document.createElement('style'); st.id = 'polity-arc-css'; st.textContent = CSS; document.head.appendChild(st); }

let sheet = null, state = { arc: null, q: '' }, unsubClock = null, unsubLapse = null, paintTimer = 0;
const nowYear = () => { try { return IntMapTime.isLive() ? null : IntMapTime.when().getUTCFullYear(); } catch (_) { return null; } };
/* the instant a year stands for in the index: 1 July (noon UTC) — the instant every point was read at */
const july1 = (y) => { const t = new Date(0); t.setUTCFullYear(y, 6, 1); t.setUTCHours(12, 0, 0, 0); return t; };

/** move the clock to year `y` (1 July, the instant the index was read at); → true when the clock took it */
function goYear(y) {
  try { if (y < IntMapTime.min) return false; IntMapTime.set(july1(y), { source: 'polity-arc' }); return true; } catch (_) { return false; }
}
function fit(bb) {
  try { if (Array.isArray(bb) && bb.length === 4) IntMapGeoEngine.camera.fitBounds([[bb[0], bb[1]], [bb[2], bb[3]]], { padding: 48, duration: 900, maxZoom: 6 }); } catch (_) { /* no renderer */ }
}
/** the instants its life is played through: every year its drawn shape changes, and the year it stops being drawn */
function lifeInstants(idx, arc) {
  const D = describe(idx, arc);
  const ys = D.points.length ? D.points.map((p) => p.y) : D.sheets.map((s) => s.y);
  return [...new Set(ys)].filter((y) => y >= IntMapTime.min).map((y) => july1(y).getTime());
}
async function play(idx, arc) {
  const L = await import('./time-lapse.js');
  fit(arc.bb);
  return L.startLapse({ instants: lifeInstants(idx, arc), owner: 'polity-arc:' + arc.n });
}

/** open the sheet: `want` = { name?, qid?, year?, query? } — a polity, or the list (with a search) */
export async function openArc(want) {
  ensureStyle();
  if (!sheet) {
    sheet = document.createElement('section');
    sheet.id = 'pa-sheet'; sheet.className = 'pa-panel'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'false');
    sheet.addEventListener('click', onClick);
    sheet.addEventListener('input', (e) => { if (e.target && e.target.classList.contains('pa-q')) { state.q = e.target.value; paintList(); } });
    sheet.addEventListener('pointermove', onChartMove);
    sheet.addEventListener('pointerleave', () => { const r = sheet && sheet.querySelector('.pa-read'); if (r) r.textContent = ''; });
    document.body.appendChild(sheet);
  }
  sheet.hidden = false;
  /* opened by the reader's operation: it takes the front from the panel the operation was made in (js/ui-stack.js `opened`) */
  try { globalThis.IntMapStack.opened(sheet); } catch (_) { /* no stack owner (Node) */ }
  if (!unsubClock) unsubClock = IntMapTime.on(() => { clearTimeout(paintTimer); paintTimer = setTimeout(paintNow, 200); });
  const w = want || {};
  if (typeof w.lang === 'function') langOf = w.lang;
  state.q = w.query || '';
  sheet.innerHTML = head(null) + '<div class="pa-body"><div class="pa-wait">' + esc(IntMapLang.t(lang(), 'Reading the index of polities…', '政体の索引を読み込み中…')) + '</div></div>';
  let idx;
  try { idx = await loadArcs(); } catch (_) {
    sheet.innerHTML = head(null) + '<div class="pa-body"><p class="pa-note">' + esc(IntMapLang.t(lang(), 'The index of polities could not be read.', '政体の索引を読み込めませんでした。')) + '</p></div>';
    return { ok: false, reason: 'unavailable' };
  }
  state.idx = idx;
  state.arc = (w.name || w.qid) ? find(idx, w) : null;
  if (!state.arc && (w.name || w.qid)) state.q = w.name || w.qid;
  if (state.arc) paintArc(); else paintList();
  return { ok: true, arc: state.arc ? state.arc.n : null };
}
function closeArc() {
  if (sheet) sheet.hidden = true;
  if (unsubClock) { try { unsubClock(); } catch (_) { /* gone */ } unsubClock = null; }
  if (unsubLapse) { try { unsubLapse(); } catch (_) { /* gone */ } unsubLapse = null; }
}
function head(arc) {
  const t = IntMapLang.pick(() => lang());
  return '<header class="pa-head"><button type="button" class="pa-back" data-act="list" aria-label="' + esc(t('All polities', '政体の一覧')) + '"' + (arc ? '' : ' hidden') + '>‹</button>'
    + '<h3 class="pa-title">' + esc(t('Rise and fall', '政体の盛衰')) + '</h3>'
    + '<button type="button" class="pa-x" data-act="close" aria-label="' + esc(t('Close', '閉じる')) + '">×</button></header>';
}
function listRow(idx, a, lg) {
  const t = IntMapLang.pick(() => lg), D = describe(idx, a);
  const span = !D.first ? '' : D.last.edge === 'today' ? t(yearWords(D.first.y, lg) + ' – still drawn in ' + yearWords(D.last.y, lg), yearWords(D.first.y, lg) + '〜' + yearWords(D.last.y, lg) + 'にも描画') : yearWords(D.first.y, lg) + '–' + yearWords(D.last.y, lg);
  return '<li><button type="button" class="pa-row" data-arc="' + esc(idx.arcs.indexOf(a)) + '"><span class="pa-n">' + esc(nameOf(a, lg)) + '</span><span class="pa-v">' + esc(kmWords(a.pk[1])) + '</span>'
    + '<span class="pa-s">' + esc(span + ' · ' + t('largest in ', '最大 ') + yearWords(a.pk[0], lg)) + (lg === 'jp' && a.j ? ' · ' + esc(a.n) : '') + '</span></button></li>';
}
function paintList() {
  if (!sheet || !state.idx) return;
  const idx = state.idx, lg = lang(), t = IntMapLang.pick(() => lg);
  state.arc = null;
  const had = sheet.querySelector('.pa-q');
  const rows = state.q ? search(idx, state.q, 40) : largest(idx, 25);
  const listHtml = rows.length ? '<ol class="pa-list">' + rows.map((a) => listRow(idx, a, lg)).join('') + '</ol>'
    : '<p class="pa-note">' + esc(t('No polity the map draws has that name.', 'その名前で地図に描かれる政体はありません。')) + '</p>';
  const sec = '<section class="pa-sec pa-results"><h4>' + esc(state.q ? t('Polities', '政体') : t('Largest drawn extents', '描かれた面積が最大の政体')) + '</h4>' + listHtml
    + (state.q ? '' : '<p class="pa-note">' + esc(t('Ranked by the largest area the map draws under each name — the drawn shape on the sphere, not a measure of real control.', '各名前で地図に描かれた最大の面積の順（球面上の描画の面積で、実際の支配域の測定ではありません）。')) + '</p>') + '</section>';
  if (had) { const r = sheet.querySelector('.pa-results'); if (r) r.outerHTML = sec; return; }
  sheet.innerHTML = head(null) + '<div class="pa-body"><input type="search" class="pa-q" enterkeyhint="search" autocomplete="off" aria-label="' + esc(t('Find a polity', '政体を探す')) + '" placeholder="' + esc(t('Find a polity — e.g. Mongol Empire', '政体を探す（例: モンゴル帝国）')) + '" value="' + esc(state.q) + '">' + sec
    + '<p class="pa-src">' + esc(t('Index of ', '収録: ') + idx.arcs.length.toLocaleString() + t(' names the map draws', ' の名前')) + ' · ' + esc(['clio', 'ohm', 'cshapes', 'sheet'].map((k) => recordName(idx, k)).join(' · ')) + '</p></div>';
}
/* The clock moves only the chart's year marker (`chartSvg(…, nowYear())` is the one clock-dependent
   piece of the sheet), so a clock change replaces the chart and nothing else. Repainting the whole sheet
   — as it did — wiped the hover readout, the focused button and the reader's place 200 ms after every
   tick, including the tick the reader's own click on the chart (or «Go to its largest») caused. The
   chart element itself is kept (its contents and attributes are swapped), so a pointer resting on it
   and anything holding it stay on the same node. */
function paintNow() {
  if (!sheet || sheet.hidden || !state.idx || !state.arc) return;
  const old = sheet.querySelector('.pa-chart');
  if (!old) { paintArc(); return; }
  const idx = state.idx, a = state.arc, box = document.createElement('div');
  box.innerHTML = chartSvg(idx, a, describe(idx, a), lang(), nowYear());
  const neu = box.firstElementChild; if (!neu) return;
  for (const at of Array.from(neu.attributes)) old.setAttribute(at.name, at.value);
  old.innerHTML = neu.innerHTML;
}
function paintArc() {
  if (!sheet || sheet.hidden || !state.idx || !state.arc) return;
  const idx = state.idx, a = state.arc, lg = lang(), t = IntMapLang.pick(() => lg), D = describe(idx, a);
  const keep = sheet.querySelector('.pa-body'), scroll = keep ? keep.scrollTop : 0;
  const recKey = D.records.map((r) => '<span><i class="pa-' + esc(r) + '"></i>' + esc(recordName(idx, r)) + '</span>').join('') + (D.sheets.length ? '<span><i class="pa-sw"></i>' + esc(recordName(idx, 'sheet') + t(' (its own sheet years)', '（その図の年）')) + '</span>' : '');
  const rel = related(idx, a, lg);
  const qs = (a.q || []).map((q) => '<a href="https://www.wikidata.org/wiki/' + encodeURIComponent(q) + '" target="_blank" rel="noopener">' + esc(q) + '</a>').join(' · ');
  const playing = state.playing === a.n;
  const peakBy = D.peak.recs.map((r) => recordName(idx, r)).join(' + ');
  sheet.innerHTML = head(a) + '<div class="pa-body">'
    + '<p class="pa-name">' + esc(nameOf(a, lg)) + '</p>'
    + '<p class="pa-sub">' + (lg === 'jp' && a.j ? esc(a.n) + (qs ? ' · ' : '') : '') + qs + '</p>'
    + '<dl class="pa-facts">'
    + '<dt>' + esc(t('First drawn', '描かれ始め')) + '</dt><dd>' + esc(edgeWords(idx, 'first', D.first, lg)) + '</dd>'
    + '<dt>' + esc(t('Last drawn', '描かれ終わり')) + '</dt><dd>' + esc(edgeWords(idx, 'last', D.last, lg)) + '</dd>'
    + '<dt>' + esc(t('Largest', '最大')) + '</dt><dd>' + esc(t(kmWords(D.peak.km) + ' in ' + yearWords(D.peak.y, lg) + ', drawn by ' + peakBy, kmWords(D.peak.km) + '（' + yearWords(D.peak.y, lg) + '・' + peakBy + ' による描画）')) + '</dd>'
    + '<dt>' + esc(t('Changes', '形の変化')) + '</dt><dd>' + esc(t(D.points.filter((p) => p.km > 0).length + ' drawn states', D.points.filter((p) => p.km > 0).length + ' 通りの描画')) + '</dd>'
    + '</dl>'
    + '<div class="pa-chartbox">' + chartSvg(idx, a, D, lg, nowYear()) + '<div class="pa-read" aria-live="polite"></div><div class="pa-key">' + recKey + '</div></div>'
    + '<div class="pa-acts">'
    + '<button type="button" class="pa-act pa-primary" data-act="peak">' + esc(t('Go to its largest', '最大の年へ')) + '</button>'
    + '<button type="button" class="pa-act" data-act="play">' + esc(playing ? t('Stop', '停止') : t('Play its life', '一生を再生')) + '</button>'
    + '<button type="button" class="pa-act" data-act="first">' + esc(t('First year', '最初の年')) + '</button>'
    + '<button type="button" class="pa-act" data-act="last">' + esc(t('Last year', '最後の年')) + '</button>'
    + '</div>'
    + (rel.length ? '<section class="pa-sec"><h4>' + esc(t('Also in the records as', '記録上の別の名前')) + '</h4><ol class="pa-list">' + rel.slice(0, 12).map((r) => {
      const R = describe(idx, r.arc);
      return '<li><button type="button" class="pa-row" data-arc="' + esc(idx.arcs.indexOf(r.arc)) + '"><span class="pa-n">' + esc(nameOf(r.arc, lg) + (lg === 'jp' && r.arc.j ? ' (' + r.arc.n + ')' : '')) + '</span><span class="pa-v">' + esc(R.first ? yearWords(R.first.y, lg) + '–' + (R.last.edge === 'today' ? '' : yearWords(R.last.y, lg)) : '') + '</span>'
        + '<span class="pa-s">' + esc(r.why === 'qid' ? t('linked to the same Wikidata item ' + r.qid, '同じ Wikidata 項目 ' + r.qid + ' に結ばれている') : t('the map writes the same name', '地図上で同じ名前で書かれる')) + '</span></button></li>';
    }).join('') + '</ol></section>' : '')
    + '<p class="pa-note">' + esc(t('The area is the area of the shape the map draws under this name, on the sphere — not a measure of the territory really controlled. Each colour is the record that drew that stretch; a step at a dashed line is a change of record, not of the world. From ' + yearWords(idx.instants.dayFrom, lg) + ' the map is read on 1 July of each year; before that, at every year Cliopatria changes.',
      '面積は、この名前で地図が描く形の球面上の面積で、実際に支配した領域の測定ではありません。色はその区間を描いた記録です。破線での段差は記録の切り替わりで、世界の変化ではありません。' + yearWords(idx.instants.dayFrom, lg) + '以降は各年 7 月 1 日の地図、それより前は Cliopatria が変わる年ごとの地図です。')) + '</p>'
    + '<p class="pa-src">' + esc(t('Records: ', '記録: ')) + esc(D.records.concat(D.sheets.length ? ['sheet'] : []).map((r) => (idx.src && idx.src[r]) || r).join(' · ')) + '</p>'
    + '</div>';
  const body = sheet.querySelector('.pa-body'); if (body) body.scrollTop = scroll;
}
function chartYear(ev) {
  const svg = ev.target && ev.target.closest ? ev.target.closest('.pa-chart') : null;
  if (!svg) return null;
  const r = svg.getBoundingClientRect(); if (!r.width) return null;
  const a = +svg.dataset.a, b = +svg.dataset.b;
  const fx = ((ev.clientX - r.left) / r.width) * CW;
  const y = Math.floor(a + (b - a) * (fx - ML) / (CW - ML - MR));
  return Math.max(a, Math.min(b - 1, y));
}
function onChartMove(ev) {
  const y = chartYear(ev); if (y == null || !state.arc) return;
  const out = sheet.querySelector('.pa-read'); if (!out) return;
  const lg = lang(), t = IntMapLang.pick(() => lg), v = valueAt(state.idx, state.arc, y);
  out.textContent = yearWords(y, lg) + ': ' + (v ? kmWords(v.km) + ' · ' + v.recs.map((r) => recordName(state.idx, r)).join(' + ') : t('not drawn', '描かれていない'));
}
function onClick(ev) {
  const svgY = chartYear(ev);
  if (svgY != null && state.arc) { goYear(svgY); return; }
  const b = ev.target && ev.target.closest && ev.target.closest('button'); if (!b || !state.idx) return;
  const idx = state.idx, a = state.arc;
  if (b.dataset.act === 'close') { closeArc(); return; }
  if (b.dataset.act === 'list') { state.arc = null; paintList(); return; }
  if (b.dataset.arc != null) { state.arc = idx.arcs[+b.dataset.arc] || null; if (state.arc) { fit(state.arc.bb); paintArc(); } return; }
  if (!a) return;
  const D = describe(idx, a);
  if (b.dataset.act === 'peak') { goYear(D.peak.y); fit(D.peak.bb); }
  else if (b.dataset.act === 'first' && D.first) { goYear(D.first.y); fit(a.bb); }
  else if (b.dataset.act === 'last' && D.last && D.last.y != null) { goYear(D.last.y); fit(a.bb); }
  else if (b.dataset.act === 'play') {
    import('./time-lapse.js').then((L) => {
      if (state.playing === a.n) { L.stopLapse('stopped'); return; }
      if (!unsubLapse) unsubLapse = L.onLapse((s) => { const mine = s.playing && L.lapseOwner() === 'polity-arc:' + (state.arc && state.arc.n); const was = state.playing; state.playing = mine ? state.arc.n : null; if (was !== state.playing) paintArc(); });
      return play(idx, a);
    }).catch(() => { /* the player could not be loaded; the clock is unchanged */ });
  }
}

/* ══ ATLAS — `time.polityArc` (js/atlas-cap-time.js) — the same reading, in sentences, and the same doors ══════════ */
/** `a` = { name?, qid?, year?, pick?, go?: 'peak'|'first'|'last', play?, show? }; K = the Atlas kernel's internals */
export async function atlas(a, K) {
  const R = K.R, L = K.L, warn = K.warn, note = K.note, lg = (K.HOST && K.HOST.lang) || 'en';
  let idx;
  try { idx = await loadArcs(); } catch (_) { return R(false, warn(esc(L('The index of polities could not be read', '政体の索引を読み込めませんでした'))), { meta: { code: 'UNAVAILABLE', category: 'transient', retryable: true, produced: [], userGoalSatisfied: false } }); }
  const src = '<div style="font-size:12px;color:var(--text-muted);">' + esc(L('Records: ', '記録: ')) + esc(['clio', 'ohm', 'cshapes', 'sheet'].map((k) => recordName(idx, k)).join(' · ')) + '</div>';
  const caveat = L('Areas are of the shape the map draws under the name (on the sphere), not of the territory really controlled; a step where the record changes (1689, 1886) is a change of record.', '面積はその名前で地図が描く形（球面上）の面積で、実際の支配域ではありません。記録が切り替わる年（1689 年・1886 年）の段差は記録の違いです。');
  /* nothing named: the ranking */
  if (!a.name && !a.qid) {
    const top = largest(idx, 15).map((x) => ({ name: nameOf(x, lg), en: x.n, largestKm2: x.pk[1], largestYear: x.pk[0] }));
    if (a.show) await openArc({ lang: () => lg });
    return R(true, note('✓ ' + esc(L('Largest drawn extents', '描かれた面積が最大の政体'))) + '<ol style="margin:4px 0 4px 18px;padding:0;">' + top.map((x) => '<li>' + esc(x.name + ' — ' + kmWords(x.largestKm2) + ' (' + yearWords(x.largestYear, lg) + ')') + '</li>').join('') + '</ol><div>' + esc(caveat) + '</div>' + src, { meta: { polityArc: { ranking: top } } });
  }
  let arc = find(idx, { name: a.name, qid: a.qid, year: a.year });
  if (!arc) {
    const hits = search(idx, a.name || a.qid, 8);
    if (a.pick != null && hits[(+a.pick) - 1]) arc = hits[(+a.pick) - 1];
    else if (hits.length === 1) arc = hits[0];
    else {
      const cands = hits.map((x, i) => { const D = describe(idx, x); return { n: i + 1, name: nameOf(x, lg), en: x.n, from: D.first && D.first.y, to: D.last && D.last.y }; });
      const msg = hits.length ? esc(L('Several polities match — call again with "pick":n', '複数の政体が該当します。"pick":n で選んでください')) + '<ol style="margin:4px 0 4px 18px;padding:0;">' + cands.map((c) => '<li>' + esc(c.name + (c.name !== c.en ? ' (' + c.en + ')' : '') + ' ' + yearWords(c.from, lg) + '–' + (c.to == null ? '' : yearWords(c.to, lg))) + '</li>').join('') + '</ol>'
        : esc(L('No polity the map draws has that name', 'その名前で地図に描かれる政体はありません')) + ': ' + esc(a.name || a.qid);
      return R(false, warn(msg), { meta: { code: hits.length ? 'AMBIGUOUS' : 'NOT_FOUND', category: 'input', retryable: false, produced: [], userGoalSatisfied: false, candidates: cands } });
    }
  }
  const D = describe(idx, arc);
  const rel = related(idx, arc, lg).map((r) => ({ name: nameOf(r.arc, lg), en: r.arc.n, why: r.why, qid: r.qid || null }));
  const facts = {
    name: nameOf(arc, lg), en: arc.n, wikidata: arc.q || [],
    first: D.first, last: D.last, largest: { year: D.peak.y, km2: D.peak.km, records: D.peak.recs.map((r) => recordName(idx, r)) },
    records: D.records.map((r) => recordName(idx, r)), drawnStates: D.points.filter((p) => p.km > 0).length,
    changeYears: D.changes, alsoAs: rel,
  };
  const did = [];
  if (a.go === 'peak') { if (goYear(D.peak.y)) did.push(L('clock at its largest', '時計を最大の年へ')); fit(D.peak.bb); }
  else if (a.go === 'first' && D.first) { if (goYear(D.first.y)) did.push(L('clock at its first year', '時計を最初の年へ')); fit(arc.bb); }
  else if (a.go === 'last' && D.last && D.last.y != null) { if (goYear(D.last.y)) did.push(L('clock at its last year', '時計を最後の年へ')); fit(arc.bb); }
  let lapse = null;
  if (a.play) { try { lapse = await play(idx, arc); if (lapse && lapse.playing) did.push(L('playing its life (' + lapse.total + ' frames)', '一生を再生中（' + lapse.total + ' コマ）')); } catch (_) { /* below: not playing */ } }
  if (a.show) { await openArc({ name: arc.n, qid: (arc.q || [])[0], lang: () => lg }); did.push(L('opened the Rise and fall sheet', '「政体の盛衰」を表示')); }
  const lines = [
    L('First drawn: ', '描かれ始め: ') + edgeWords(idx, 'first', D.first, lg),
    L('Last drawn: ', '描かれ終わり: ') + edgeWords(idx, 'last', D.last, lg),
    L('Largest drawn: ' + kmWords(D.peak.km) + ' in ' + yearWords(D.peak.y, lg) + ', by ' + facts.largest.records.join(' + '), '最大: ' + kmWords(D.peak.km) + '（' + yearWords(D.peak.y, lg) + '・' + facts.largest.records.join(' + ') + '）'),
    L('Drawn states: ', '描画の変化: ') + facts.drawnStates,
  ];
  if (rel.length) lines.push(L('Also in the records as: ', '記録上の別の名前: ') + rel.slice(0, 8).map((r) => r.name + ' (' + (r.why === 'qid' ? r.qid : L('same name', '同じ名前')) + ')').join(', '));
  const failedPlay = a.play && !(lapse && lapse.playing);
  const html = note('✓ ' + esc(L('Rise and fall — ', '政体の盛衰 — ') + facts.name)) + (did.length ? ' — ' + esc(did.join(' · ')) : '')
    + '<div>' + lines.map(esc).join('<br>') + '</div><div style="font-size:12px;color:var(--text-muted);">' + esc(caveat) + '</div>' + src;
  if (failedPlay) return R(false, warn(esc(L('The life could not be played', '再生を開始できませんでした'))) + html, { meta: { code: 'LAPSE_NOT_STARTED', category: 'transient', retryable: true, produced: ['explanation'], userGoalSatisfied: false, polityArc: facts } });
  return R(true, html, { meta: { polityArc: facts } });
}
