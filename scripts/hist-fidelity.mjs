#!/usr/bin/env node
/* ============================================================================
 *  hist-fidelity.mjs — what the historical map actually CLAIMS  (#R730)
 * ----------------------------------------------------------------------------
 *  「地方区分のcoverageが一部だけだったりする！ふざけんな！」
 *  「機械的だけでなく、歴史考証的なやり方で検証していって。（いずれは全時代、全地域を）」
 *
 *  #R719 measured the first half of that — the share of the world's land carrying a first-level
 *  subdivision — on a 0.25° grid, wrote the three numbers it got into a COMMENT at the top of
 *  scripts/build-hist-admin-fill.mjs, and threw the measuring code away. So the next round could
 *  not tell whether the number had moved, and no gate could fail when it got worse.
 *  [[intmap-discovered-list-is-a-photograph]] — the instrument is the thing to keep.
 *
 *  ⚠⚠⚠ AND THE SECOND HALF IS WHY THIS FILE MEASURES THREE THINGS, NOT ONE. Coverage alone
 *  rewards the wrong repair: the cheapest way to raise it is to draw a unit in years nobody
 *  placed it in, and that is exactly the defect #R730 found already shipping —
 *
 *      48 of the ritsuryō provinces and the circuits of the 五畿七道 were drawn from 200 BC,
 *      and 壱岐国 · 安房国 · 東海道 · 山陰道 · 西海道 were still on the map in 1900 and today,
 *      seventy years after 廃藩置県 (1871-08-29) abolished the system. The Shanghai
 *      International Settlement (1863) and French Concession (1849) were drawn from 200 BC too.
 *
 *  Every one of those is a HIGHER coverage number than the truth, and every gate was green,
 *  because a gate measures form and the map publishes a claim. So the three measures are taken
 *  together and the gate reads them together:
 *
 *    1. UNSOURCED SPANS  — rows drawn from a date no upstream stated.  Must be 0.
 *    2. DOUBLE CLAIM     — the same unit drawn twice over one instant. May not grow.
 *    3. COVERAGE         — land, per year and per polity, carrying a first-level unit.
 *
 *  Run:
 *    node scripts/hist-fidelity.mjs --check        the gate (npm run check:histfidelity)
 *    node scripts/hist-fidelity.mjs --report       all three, with the per-polity table
 *    node scripts/hist-fidelity.mjs --year 1900 --in 128,30,146,46
 *                                                  list what is drawn there, that year
 *    node scripts/hist-fidelity.mjs --update       re-record the observations in data/
 *
 *  ⚠ `--year` IS NOT A CONVENIENCE. .agents/rules/historical-verification.md §2-1 requires
 *  naming a year and a place and READING WHAT IS DRAWN, because that is how the ritsuryō
 *  provinces were found: every aggregate was green, and the list for Japan in 1900 read
 *  「滋賀県, 壱岐国, 安房国, 東海道, 山陰道, 西海道」.
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DERIVED_FROM_THE_REPOSITORY } from './lib/upstream-cadence.mjs';
import { readLedger, displayRanges, candidates, judged, LEDGER } from './histeras/spans.mjs';
import { readEdges, edgeProblems } from './histadmin/edges.mjs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { measure, status as knowStatus, KNOW, grid as kGrid, scan as kScan } from '../js/hist-knowledge.js';
/* (hist-coverage-depth) the records spliced into the first tier — the one list js/time-admin1.js draws */
import { HIST_ADMIN_GAPS } from '../js/border-coast.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);
const OBSERVED = 'data/hist-fidelity.json';

/* ⚠ (upstream-liveness) 出自は値である。読むのは js/data-governance.js の read() と
   npm run check:datagov（scripts/data-governance.mjs）。この宣言は少なくとも「どの bundle を書くか」と
   「上流がどの周期で新しいものを出すか」（cadence と、その根拠 cadenceBasis）を述べる。
   ⚠ ここに無い facet は「述べていない」であって「無い」ではない——data/governance-ledger.json が数える。 */
export const GOVERNANCE = {
  'data/hist-fidelity.json': {
    /* the observation ledger of npm run check:histfidelity, measured over the hist-* bundles here */
    ...DERIVED_FROM_THE_REPOSITORY,
    builtBy: 'scripts/hist-fidelity.mjs',
  },
  'data/hist-coverage-holes.json': {
    /* (hist-coverage) every hole in the first-level record, per measured year, and why — measured over the bundles here */
    ...DERIVED_FROM_THE_REPOSITORY,
    builtBy: 'scripts/hist-fidelity.mjs',
  },
  'data/hist-claims.json': {
    /* (hist-coverage) the first-level double claims js/time-admin1.js counts at the reader's date — measured over the bundles here */
    ...DERIVED_FROM_THE_REPOSITORY,
    builtBy: 'scripts/hist-fidelity.mjs',
  },
};

/* ── the shipped bundles, read the way the browser reads them ───────────────────────────── */
const load = (rel) => {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return JSON.parse(s.slice(s.indexOf('=') + 1).replace(/;\s*$/, ''));
};
/* ⚠ THE TIERS ARE DISCOVERED FROM data/, AND THE GAP RECORDS ARE THE LIST THE PAGE DRAWS.
   A hand-written copy of either silently drops the next record the day one is added
   (.agents/rules/no-ad-hoc-hardcoding.md §2-4). ⚠ (hist-coverage-depth) The gap records used to be
   a regex here — `hist-(admin-fill|kuni)` — beside the list in js/time-admin1.js: two copies of one
   judgement, so a surveyed record added to the page would have been drawn and never measured. They
   are read from HIST_ADMIN_GAPS (js/border-coast.js), the list the page itself imports; a record not built yet (or
   not built on this machine) is absent from data/ and is skipped, exactly as the page skips it. */
export const bundles = () => {
  const tiers = fs.readdirSync(path.join(ROOT, 'data')).filter((f) => /^hist-admin\d+\.js$/.test(f)).map((f) => 'data/' + f);
  const gaps = HIST_ADMIN_GAPS.map((g) => g.file).filter((f) => fs.existsSync(path.join(ROOT, f)));
  /* by name, then by level (stable) — the order the directory listing gave before, so the ledgers this
     writes do not reorder because the list moved */
  return [...tiers, ...gaps].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((f) => ({ file: f, b: load(f) }))
    .sort((a, b) => Math.min(...a.b.levels) - Math.min(...b.b.levels));
};
/* ⚠ (hist-coverage-depth) WHERE A ROW'S SOURCE DATES ARE. A tier keys `dates` by the OpenHistoricalMap
   relation id in column 10; a surveyed gap record has no relation id (its column 10 is the publisher's
   key) and keys them by its own row. Reading `dates[f[10]]` there asked the table for «ahcb» and found
   nothing, so its rows were never measured for a stated start. The fact decided on is the row's id. */
export const datesOf = (b, f, i) => {
  const D = b && b.dates; if (!D) return undefined;
  return (typeof f[10] === 'number') ? D[f[10]] : D[i];
};

/* ── dates ─────────────────────────────────────────────────────────────────────────────── */
const cmp = (a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] !== b[1] ? a[1] - b[1] : a[2] - b[2]);
const inForce = (f, y, m, d) => cmp([f[2], f[3], f[4]], [y, m, d]) <= 0 && cmp([y, m, d], [f[5], f[6], f[7]]) < 0;
const spanOverlap = (a, b) => cmp([a[2], a[3], a[4]], [b[5], b[6], b[7]]) < 0 && cmp([b[2], b[3], b[4]], [a[5], a[6], a[7]]) < 0;

/* ══ 1. UNSOURCED SPANS ═══════════════════════════════════════════════════════════════════
   The question is not «is the span well formed» — check:histadmin already asks that, and it was
   green over every row below — but «did anybody SAY it».
   ⚠ THE MARK IS IN THE RECORD, NOT IN A LIST OF NAMES: build-hist-admin1.mjs writes
   `dates[id].start.raw = null` when upstream stated no start, so the defect names itself and the
   next one arrives already counted. [[intmap-restate-the-defect-not-the-fix]]
   ⚠ An absent END is upstream's way of saying «still in force», which IS a statement. An absent
   START is not: nothing about the unit says when it began, so every date the map draws it at is
   the map's own invention. */
function unsourcedSpans(bs) {
  const rows = [];
  for (const { file, b } of bs) {
    for (let i = 0; i < b.feats.length; i++) {
      const f = b.feats[i], d = datesOf(b, f, i);
      if (!d) continue;
      /* ⚠ «STATED» AND «DERIVED» ARE BOTH ANSWERS; «INHERITED FROM AN OLD BUILD» IS NOT.
         A start upstream wrote is a statement. A start histadmin/class-dates.mjs derived from the
         unit's own system carries `derived` saying how, and js/time-admin1.js draws it in the
         derived line's style so the reader is told. The fossil `boundary: preserved-display-bound`
         is neither, and it is what put 令制国 in 200 BC. */
      if (!(d.start && (d.start.raw || d.start.derived))) {
        rows.push({ file, id: f[10], name: f[0], level: f[1],
          from: [f[2], f[3], f[4]].join('-'), end: (d.end && d.end.raw) || null });
      }
    }
  }
  return rows;
}

/* ══ 2. DOUBLE CLAIM — SEAM, DUPLICATE, CONTESTED ═══════════════════════════════════════════
   Two units of the SAME admin_level over the same ground at the same instant is one of three
   different things, and they are not interchangeable (historical-verification.md §2-5):
     a SEAM       — year precision on both sides of a handover ([1938..1949] × [1948..1973])
     a DUPLICATE  — upstream holds one unit twice (Закаспійская область, 1881, twice)
     CONTESTED    — two different units claim the ground: a dispute, a layered jurisdiction, or a
                    reorganisation whose end nobody recorded — not judged by the machine
   The kind is decided by js/hist-scale.js `claimKind`, the one rule the layer's note also reads.
   ══ ⚠⚠⚠ (hist-coverage) THE PAIRS USED TO BE NAMESAKES, NOT CLAIMS ════════════════════════════
   This counted «the same NAME at the same LEVEL over an OVERLAPPING span» and never asked about the
   GROUND. Two counties called Lincoln in two states are not a double claim, and they were most of
   the count: measured 2026-10-03, the old rule found 60 identical + 34,194 nested + 11,196 seam =
   45,450 pairs over the five bundles, and a ground test finds 3,847 pairs that really share ground (1,986 seam · 151 duplicate · 1,710 contested).
   ⇒ the ground is asked first: same level, crossing spans, meeting boxes, and at least a quarter of
   the SMALLER unit's interior points inside the other — the same OVERLAP_MIN share
   scripts/build-hist-admin-fill.mjs test 5 uses to say «a record already answers this ground». */
const GROUND_MIN = 0.25;
const SAMPLE_K = 14;   /* a 14×14 lattice over the unit's box, interior points kept: ~150 for a compact unit */
let _HS = null;
/** js/hist-scale.js, evaluated — the page's own rule, not a copy (it has no DOM by its own invariant) */
export function histScale() {
  if (_HS) return _HS;
  const w = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'hist-scale.js'), 'utf8'), { window: w, Date, Math });
  return (_HS = w.IntMapHistScale);
}
function ringIn(r, x, y) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
const polysIn = (P, x, y) => P.some((p) => ringIn(p[0], x, y) && !p.slice(1).some((h) => ringIn(h, x, y)));
/** the row's identity in the runtime ledger: OHM's relation id, or «<gap file>:<row>» for a derived row */
export const claimKey = (file, f, i) => (f[10] != null && Number.isFinite(f[10]) ? 'r' + f[10] : path.basename(file, '.js') + ':' + i);
export function groundClaims(bs) {
  const HS = histScale(), U = [];
  for (const { file, b } of bs) b.feats.forEach((f, i) => {
    const polys = f[8].map((p) => p.map((ri) => b.rings[ri]));
    const bb = [180, 90, -180, -90];
    for (const p of polys) for (const q of p[0]) { if (q[0] < bb[0]) bb[0] = q[0]; if (q[1] < bb[1]) bb[1] = q[1]; if (q[0] > bb[2]) bb[2] = q[0]; if (q[1] > bb[3]) bb[3] = q[1]; }
    U.push({ file, i, f, name: f[0], lvl: f[1], s: [f[2], f[3], f[4]], e: [f[5], f[6], f[7]], polys, bb, pts: null });
  });
  /* ⚠ THE SHARE IS OF THE SMALLER UNIT'S GROUND, so «smaller» is measured: each unit carries a
     SAMPLE_K × SAMPLE_K lattice over its own box and the cells of it that are interior (the same
     scanline js/hist-knowledge.js measures with); its ground is those cells' area. The other unit is
     then scanned ON THAT LATTICE — one pass over its rings — and the cells both hold are counted. */
  const lat = (u) => {
    if (u.lat) return u.lat;
    const [a, b, c, d] = u.bb, res = Math.max(c - a, d - b, 1e-9) / SAMPLE_K;
    const win = { x0: a, y0: b, res, NX: SAMPLE_K, NY: SAMPLE_K }, mask = new Uint8Array(SAMPLE_K * SAMPLE_K);
    let n = 0;
    for (const p of u.polys) kScan(win, p, (j, i0, i1) => { for (let i = i0; i <= i1; i++) if (!mask[j * SAMPLE_K + i]) { mask[j * SAMPLE_K + i] = 1; n++; } });
    return (u.lat = { win, mask, n, area: n * res * res });
  };
  /* …and the smaller unit's interior cell centres are asked of the other unit, stopping as soon as the
     share is decided either way */
  const ptsOf = (S) => {
    if (S.pts) return S.pts;
    const L = lat(S), out = [];
    if (!L.n) { for (const p of S.polys) for (const q of p[0]) out.push(q); }   /* thinner than its lattice: its own vertices */
    else for (let k = 0; k < L.mask.length; k++) if (L.mask[k]) out.push([L.win.x0 + ((k % SAMPLE_K) + 0.5) * L.win.res, L.win.y0 + (Math.floor(k / SAMPLE_K) + 0.5) * L.win.res]);
    return (S.pts = out);
  };
  function decided(S, O) {
    const P = ptsOf(S), need = Math.ceil(GROUND_MIN * P.length);
    let h = 0, left = P.length;
    for (const p of P) {
      left--;
      if (p[0] >= O.bb[0] && p[0] <= O.bb[2] && p[1] >= O.bb[1] && p[1] <= O.bb[3] && polysIn(O.polys, p[0], p[1])) h++;
      if (h >= need) return true;
      if (h + left < need) return false;
    }
    return h >= need && P.length > 0;
  }
  /* a 2° bucket index, so a pair is only ever looked at when the two boxes can meet (a sweep over x
     alone walked tens of thousands of units for every continent-wide one) */
  const CELL = 2, cells = new Map(), seen = new Int32Array(U.length).fill(-1);
  const cellsOf = (bb) => { const o = []; for (let x = Math.floor(bb[0] / CELL); x <= Math.floor(bb[2] / CELL); x++) for (let y = Math.floor(bb[1] / CELL); y <= Math.floor(bb[3] / CELL); y++) o.push(x * 1000 + y); return o; };
  U.forEach((u, i) => { u.cells = cellsOf(u.bb); for (const c of u.cells) { if (!cells.has(c)) cells.set(c, []); cells.get(c).push(i); } });
  const out = [];
  for (let a = 0; a < U.length; a++) {
    const A = U[a];
    for (const c of A.cells) for (const k of cells.get(c)) {
      if (k <= a || seen[k] === a) continue;
      seen[k] = a;
      const B = U[k];
      if (A.lvl !== B.lvl || B.bb[0] > A.bb[2] || B.bb[2] < A.bb[0] || B.bb[1] > A.bb[3] || B.bb[3] < A.bb[1]) continue;
      const kind = HS.claimKind(A, B);
      if (!kind) continue;
      const la = lat(A), lb = lat(B);
      const [S, O] = (la.n ? la.area : 0) <= (lb.n ? lb.area : 0) ? [A, B] : [B, A];
      if (!decided(S, O)) continue;
      out.push({ kind, a: A, b: B });
    }
  }
  return out;
}

/* ══ 3. COVERAGE ══════════════════════════════════════════════════════════════════════════
   ⚠ MEASURED AS AREA, NOT AS A COUNT. «654 units in force in 1900» cannot show «一部だけ»:
   France was 2% of its own land and the count said nothing.
   [[intmap-coverage-counted-is-not-coverage-seen]]
   The denominator is the land the map itself puts inside a polity that year — the same three
   records js/time-borders.js dispatches over — so the fraction answers the reader's question
   («of the world I can see, how much has provinces drawn on it») and not a cartographic one.
   ⚠ (hist-coverage) THE MEASURE IS js/hist-knowledge.js's, NOT THIS FILE'S. It was a scanline
   written here; it is now the same function the map uses to HATCH the uncovered ground, so the
   number this gate records and the area the reader sees cannot be two answers. */
const RES = Number(arg('--res', String(KNOW.res)));

let _rec = null;
function records() {
  if (_rec) return _rec;
  const cs = load('data/cshapes.js'), hb = load('data/hist-borders.js'), er = load('data/hist-eras.js');
  /* ⚠ THE BANDS ARE DISCOVERED, NOT COPIED. js/time-borders.js holds CS_MIN/CS_MAX and
     HB_MIN/HB_MAX as constants; repeating the numbers here would put one fact in two places
     (.agents/rules/no-ad-hoc-hardcoding.md §1). Each record already says how far it reaches —
     the OHM band publishes `window`, and CShapes' reach is the span of its own rows. */
  let csLo = Infinity, csHi = -Infinity;
  for (const f of cs.feats) { if (f[2] < csLo) csLo = f[2]; if (f[5] > csHi) csHi = f[5]; }
  /* (hist-coverage-expansion) the two records the page composes below CShapes — absent, the band chain answers */
  const opt = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? load(rel) : null);
  _rec = { cs, hb, er, csLo, csHi, hbLo: hb.window[0], hbHi: hb.window[1], cl: opt('data/hist-clio.js'), rs: opt('data/hist-eras-rest.js'),
    /* (hist-colonial-era-borders) OpenHistoricalMap on the ground CShapes leaves, from 1886 */
    ol: opt('data/hist-borders-late.js') };
  return _rec;
}
const resolve = (polys, rings) => polys.map((poly) => poly.map((r) => rings[r]));
export function politiesAt(y, opt = {}) {
  /* `opt.band` asks for the chain as it was before the composition (one record per band) — the comparison the
     checks make, never what the gate records. `opt.late === false` leaves out OpenHistoricalMap on CShapes' days
     (the composition as it was before hist-colonial-era-borders) — again a comparison, never the record.
     Each entry names the record it came from (`rec`), so a listing can say who drew what. */
  const R = records(), { cs, hb, er, csLo, csHi, hbLo, hbHi } = R, cl = opt.band ? null : R.cl, rs = opt.band ? null : R.rs, out = [];
  const ol = opt.band || opt.late === false ? null : R.ol;
  if (y >= csLo && y <= csHi) {
    for (const f of cs.feats) if (inForce(f, y, 7, 1)) out.push({ nm: f[0], polys: resolve(f[8], cs.rings), rec: 'cshapes' });
    /* (hist-colonial-era-borders) …then OpenHistoricalMap on the ground CShapes leaves (js/time-borders.js csComposite) */
    if (ol) for (const f of ol.feats) if (inForce(f, y, 7, 1)) out.push({ nm: f[0].en, polys: resolve(f[8], ol.rings), rec: 'ohm-late' });
    /* (hist-coverage-expansion) …and Cliopatria on the ground CShapes leaves (js/time-borders.js csComposite) */
    if (cl) for (const f of cl.feats) if (!(f[9] && f[9].r) && inForce(f, y, 7, 1)) out.push({ nm: f[0].en, polys: resolve(f[8], cl.rings), rec: 'clio' });
    return out;
  }
  /* (hist-coverage-expansion) below CShapes the page draws a COMPOSITION — OHM in its band, Cliopatria, and
     the sheet less both (js/time-borders.js `compositeAt`); the subtraction is in the files, so the measure
     is their union. The sheet is chosen as this gate has always chosen it (latest at or before the year). */
  if (y < csLo && cl && rs) {
    if (y >= hbLo && y <= hbHi) for (const f of hb.feats) if (inForce(f, y, 7, 1)) out.push({ nm: (f[0] && f[0].en) || f[1], polys: resolve(f[8], hb.rings), rec: 'ohm' });
    /* a realm (`r`) is the union of member rows drawn beside it — its ground is counted through them */
    for (const f of cl.feats) if (!(f[9] && f[9].r) && inForce(f, y, 7, 1)) out.push({ nm: f[0].en, polys: resolve(f[8], cl.rings), rec: 'clio' });
    let sb = null;
    for (const s of rs.snaps) if (s.y <= y && (!sb || s.y > sb.y)) sb = s;
    if (sb) for (const f of sb.feats) out.push({ nm: (f[0] && f[0].en) || '?', polys: resolve(f[2], rs.rings), rec: 'sheet ' + sb.y });
    return out;
  }
  if (y >= hbLo && y <= hbHi) {
    for (const f of hb.feats) if (inForce(f, y, 7, 1)) out.push({ nm: (f[0] && f[0].en) || f[1], polys: resolve(f[8], hb.rings) });
    if (out.length) return out;   /* per instant, not per band: #R690 widened the window and OHM does not fill it evenly */
  }
  let best = null;
  for (const s of er.snaps) if (s.y <= y && (!best || s.y > best.y)) best = s;
  if (best) for (const f of best.feats) out.push({ nm: (f[0] && f[0].en) || '?', polys: resolve(f[2], er.rings) });
  return out;
}
/* Which admin_level is «first-level» is the shallowest bundle's own answer, not a number written
   here: that bundle is the one js/time-admin1.js draws at every zoom, and its `levels` say which
   values that is. A gap record joins it when its own `levels` intersect them. */
export const firstLevelBundles = (bs) => { const lv = new Set(bs[0].b.levels); return bs.filter(({ b }) => (b.levels || []).some((x) => lv.has(x))); };
function firstLevelAt(bs, y) {
  const lv = new Set(bs[0].b.levels), out = [];
  for (const { file, b } of firstLevelBundles(bs)) {
    for (const f of b.feats) if (lv.has(f[1]) && inForce(f, y, 7, 1)) out.push({ file, f, polys: resolve(f[8], b.rings) });
  }
  return out;
}
export function coverage(bs, y) {
  const m = measure(politiesAt(y), firstLevelAt(bs, y), RES);
  return { year: y, ...m, ...landShares(m) };
}
/* ══ (hist-coverage-expansion) THE SHARE OF THE WORLD'S LAND, NOT ONLY OF THE LAND INSIDE A POLITY ══════
   `pct` above is «of the ground the map puts inside a polity, how much carries a first-level unit». Its
   denominator is the polity layer, so drawing MORE polities lowers it although not one province was lost —
   the composition this round adds does exactly that. Two shares whose denominator is the land itself say
   what each layer covers of the world: `polityLand` (any polity drawn) and `unitLand` (a first-level unit
   drawn), both area-weighted. Land is the present-day outline set the holes are read against (neGrid). */
/** the share of the world's land inside a drawn polity at `y` (area-weighted, the neGrid land) */
export function polityLandAt(y, opt) { return landShares(measure(politiesAt(y, opt), [], RES)).polityLand; }
function landShares(m) {
  const { G, cell } = neGrid(), cid = m.cells.cid, cov = m.cells.cov;
  let L = 0, P = 0, U = 0;
  for (let j = 0; j < G.NY; j++) {
    const w = Math.cos(G.latC(j) * Math.PI / 180), base = j * G.NX;
    for (let i = 0; i < G.NX; i++) { const k = base + i; if (cell[k] < 0) continue; L += w; if (cid[k] >= 0) P += w; if (cov[k]) U += w; }
  }
  return { polityLand: L ? 100 * P / L : 0, unitLand: L ? 100 * U / L : 0 };
}

/* ══ 3b. THE HOLES, AND WHY EACH ONE IS A HOLE ════════════════════════════════════════════
   (hist-coverage) «足せない国は穴として、理由と観測日付を記録する». A polity the measure finds
   less than whole is a hole, and the uncovered part of it lies over present-day countries whose
   units data/hist-admin-fill.js either draws, or refuses for a reason it now writes into the
   bundle (`refused`). So each hole is broken down by the present-day country under its uncovered
   ground — Natural Earth's own outline set, data/admin1-world.json.gz, the same one the fill is
   built from — and each share states why that ground is empty in that year:
     undated / no-identifier / no-set-floor / never-whole   the fill's own refusal (with its counts)
     before-set-floor   the country's present-day units are drawn only from the latest founding
                        any of them states, and that is after this year
     withheld           the fill draws this country at this date, but not this ground: the era
                        record places it in another polity, or it is a unit left to OpenHistoricalMap
                        that OpenHistoricalMap does not cover at this date
     no-outline         the ground lies in no present-day unit of the outline set (a coast, a lake)
   The ledger is a PHOTOGRAPH and the gate re-takes it: data/hist-coverage-holes.json must equal
   what the shipped bundles measure, so a round that fills a hole has to re-record the ledger and
   cannot leave a stale reason standing ([[intmap-discovered-list-is-a-photograph]]). */
export const HOLES = 'data/hist-coverage-holes.json';
const HOLES_NOTE = 'Observations, not targets. Per measured year: [polity, % of its land carrying a first-level unit, cells (0.25°), [[present-day ISO3 under the uncovered ground, % of that ground, reason, …]]]. Re-recorded by node scripts/hist-fidelity.mjs --update; npm run check:histfidelity fails when it is not what the shipped bundles measure.';
/* the reasons, as data — so a reader of the ledger does not need this file to know what a code means */
const HOLE_REASONS = {
  undated: 'Wikidata states a founding (P571) for fewer than three, or fewer than half, of this country\'s present-day first-level units — [stated, units]',
  'no-identifier': 'a present-day unit of this country carries no ISO 3166-2 or HASC code, so the country cannot be answered whole — [stated, units]',
  'no-set-floor': 'dated, but no unit\'s own statement gives the set a floor — [stated, units]',
  'never-whole': 'on no date can every present-day unit of this country be drawn: the era record places one in another polity — [stated, units]',
  'before-set-floor': 'the present-day units are drawn only from the latest founding any of them states — [YYYYMMDD]',
  withheld: 'the country is drawn at this date, but not this ground: the era record places it elsewhere, or OpenHistoricalMap answers for it and does not cover it now',
  'no-outline': 'the ground lies in no present-day unit of the outline set (coast, lake, or a polity outline wider than the unit set)',
  '*': 'present-day countries each under less than 5% of the uncovered ground, together',
};
const HOLE_SHARE_MIN = 5;   /* a present-day country under less than 5% of a hole's ground is folded into «other» */
let _ne = null;
function neGrid() {
  if (_ne) return _ne;
  const ne = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', 'admin1-world.json.gz'))));
  const G = kGrid(RES), win = { x0: -180, y0: -90, res: RES, NX: G.NX, NY: G.NY };
  const iso = [], ix = new Map(), cell = new Int16Array(G.NX * G.NY).fill(-1), codeIso = new Map();
  for (const f of ne.f) {
    if (!ix.has(f.i)) { ix.set(f.i, iso.length); iso.push(f.i); }
    const k = ix.get(f.i);
    const code = String(f.n || '').split('|').find((p) => /^[A-Z]{2}-[A-Z0-9]{1,3}~?$/.test(p));
    if (code) codeIso.set(code, f.i);
    const g = f.g, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const p of polys) kScan(win, p, (j, i0, i1) => { const base = j * G.NX; for (let i = i0; i <= i1; i++) cell[base + i] = k; });
  }
  return (_ne = { G, iso, cell, codeIso });
}
function fillOf(bs) { const x = bs.find((q) => /admin-fill/.test(q.file)); return x ? x.b : null; }
export function holes(bs, y, m = null) {
  if (!m) m = measure(politiesAt(y), firstLevelAt(bs, y), RES);
  const { G, iso, cell, codeIso } = neGrid(), fill = fillOf(bs) || {};
  const refused = fill.refused || {}, inc = fill.inception || {};
  const floor = new Map(), drawn = new Set();
  for (const [code, s] of Object.entries(inc)) { const c = codeIso.get(code); if (c && (!floor.has(c) || s > floor.get(c))) floor.set(c, s); }
  for (const f of (fill.feats || [])) drawn.add(f[11]);
  const t = y * 10000 + 701;
  const why = (c) => {
    if (c == null) return ['no-outline'];
    if (refused[c]) return refused[c];
    if (floor.has(c) && t < floor.get(c)) return ['before-set-floor', floor.get(c)];
    return ['withheld'];
  };
  const out = [];
  /* the per-cell arrays measure() just filled: cid (which polity) and cov (covered) */
  const cid = m.cells.cid, cov = m.cells.cov;
  const want = new Map();
  for (const p of m.per) if (knowStatus(p.pct) !== 'full') want.set(p.ix, new Map());
  for (let k = 0; k < cid.length; k++) {
    const c = cid[k]; if (c < 0 || cov[k]) continue;
    const t2 = want.get(c); if (!t2) continue;
    const ii = cell[k], key = ii < 0 ? null : iso[ii];
    t2.set(key, (t2.get(key) || 0) + 1);
  }
  for (const p of m.per) {
    const t2 = want.get(p.ix); if (!t2) continue;
    const un = p.cells - p.hit, parts = [];
    let other = 0;
    for (const [c, n] of [...t2].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))) {
      const share = Math.round(1000 * n / un) / 10;
      if (share < HOLE_SHARE_MIN) { other += n; continue; }
      parts.push([c || '', share, ...why(c)]);
    }
    if (other) parts.push(['*', Math.round(1000 * other / un) / 10]);
    out.push([p.nm, Math.round(p.pct * 10) / 10, p.cells, parts]);
  }
  return out;
}

/* ══ 3c. THE CLAIMS THE LAYER'S NOTE READS ═══════════════════════════════════════════════
   (hist-coverage) The first-level pairs only — the tier js/time-admin1.js's note speaks for — keyed
   by the identity the page has for each row (`claimKey`), with the kind and the instant the overlap
   begins and ends. The page counts, at the reader's date, the pairs whose both rows are drawn. */
export const CLAIMS = 'data/hist-claims.json';
const CLAIMS_NOTE = 'First-level pairs of units drawn over the same ground at the same instant: [kind, row A, row B, overlap start [y,m,d], overlap end (exclusive)]. Rows are OpenHistoricalMap relations (r<id>) or derived rows (<file>:<row>). Kinds are js/hist-scale.js claimKind: seam (a year-precision handover), duplicate (one unit held twice), contested (two different units claim the ground; not judged). Re-recorded by node scripts/hist-fidelity.mjs --update.';
export function claimLedger(bs, claims) {
  const first = new Set(firstLevelBundles(bs).map((x) => x.file));
  const ymdOf = (p) => p[0] * 10000 + p[1] * 100 + p[2];
  const rows = [];
  for (const { kind, a, b } of claims) {
    if (!first.has(a.file) || !first.has(b.file)) continue;
    const os = ymdOf(a.s) >= ymdOf(b.s) ? a.s : b.s, oe = ymdOf(a.e) <= ymdOf(b.e) ? a.e : b.e;
    const ka = claimKey(a.file, a.f, a.i), kb = claimKey(b.file, b.f, b.i);
    rows.push(ka < kb ? [kind, ka, kb, os, oe] : [kind, kb, ka, os, oe]);
  }
  rows.sort((p, q) => (p[1] + p[2] < q[1] + q[2] ? -1 : 1));
  return rows;
}

/* ══ 4. ERA NAMES PAST THEIR POLITY ═════════════════════════════════════════════════════════
   (hist-era-span-fidelity) «Songhai» and «Watassid Morocco» were drawn at 1600 — the Songhai Empire
   fell in 1591, the Wattasids in 1554 — and every gate was green, because the era sheets carry no
   span per feature and the sheet was well formed. The three measures above look only at the
   first-level bundles; this one asks the era record the same question: is a name drawn in a year
   the polity it names did not exist?
   ⚠ THE YEARS ARE THE PAGE'S. Which years a sheet is drawn for is asked of js/time-borders.js
   `nearest` (evaluated, not copied), so «world_1600 is drawn from 1566» is measured, not assumed.
   ⚠ THE FINDINGS ARE DISCOVERED, THE VERDICTS ARE REVIEWED. Every name with a lifespan — #R686's
   matcher binding or a reviewed row — whose drawn years cross that lifespan is a finding, and a
   finding nobody judged is red (scripts/histeras/spans.mjs explains why the machine does not judge).
   ⚠ AND THE MAP IS ASKED, NOT THE LEDGER: an applied row is checked by handing the sheet to the
   page's own `eraShown` at a year past the bound and reading what comes back. */
export const repoFetch = async (u) => {
  const rel = String(u).replace(/^https?:\/\/[^/]+\//, '').replace(/^\.?\//, '').split('?')[0];
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => null, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
  const b = fs.readFileSync(p);
  return { ok: true, status: 200, json: async () => JSON.parse(b.toString('utf8')), text: async () => b.toString('utf8'),
    arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
};
let _era = null;
export async function eraContext() {
  if (_era) return _era;
  const { er, hbLo } = records();
  const { timeBorders } = await import('./histeras/time-borders.mjs');
  const { api } = await timeBorders({ lang: 'en', fetch: repoFetch });
  await api.loadEraSpans();
  const ledger = readLedger(ROOT);
  const histnames = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'histnames.json'), 'utf8'));
  /* the band below the day-exact record is where the sheets are the answer; hbLo is that record's own window */
  const ranges = displayRanges(er.snaps.map((s) => s.y), (y, ys) => api._nearest(y, ys), hbLo);
  const found = candidates({ bundle: er, ledger, histnames, ranges });
  _era = { er, ledger, histnames, ranges, found, api, hbLo };
  return _era;
}
/* ── (restore-clock-and-elam) the year a `history` sentence names, as it would be written there ─────────
   An astronomical year ≤ 0 is written «N BCE» (−3199 is 3200 BCE), alone or opening a range («207-204 BCE»);
   a year of the common era is the bare number, not the head of a BCE range. Used only to ask whether the
   reviewed sentence states the year the row's `hs` claims it does — so the value and the prose cannot part. */
export function historyNames(text, y) {
  const t = String(text || '');
  if (!Number.isInteger(y)) return false;
  if (y <= 0) return new RegExp('(?<!\\d)' + (1 - y) + '(?:\\s*[-–]\\s*\\d+)?\\s*BCE\\b').test(t);
  return new RegExp('(?<!\\d)' + y + '(?!\\d)(?!(?:\\s*[-–]\\s*\\d+)?\\s*BCE)').test(t);
}
/* a row whose `history` is «As «Other».» reviews itself through that row's sentence (one unit, two spellings) */
function historyOf(r, ledger) {
  const m = /^As «(.+)»\.$/.exec(String(r.history || '').trim());
  if (!m) return String(r.history || '');
  const o = (ledger.rows || []).find((x) => x.name === m[1] && x.q === r.q);
  return o ? String(o.history || '') : '';
}
/** a sheet as a FeatureCollection of names only — what `eraShown` decides on is the name, not the ring */
const sheetFC = (s) => ({ type: 'FeatureCollection', features: s.feats.map((f) => ({ type: 'Feature',
  properties: { NAME: (f[0] && f[0].en) || '' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] } })) });
export function eraSpanProblems(ctx) {
  const { er, ledger, found, api, ranges } = ctx, out = [];
  const facts = ledger.facts || {};
  const unjudged = found.filter((c) => !judged(c, ledger));
  if (unjudged.length) out.push(['era-span-unjudged', unjudged.length + ' finding(s) of a name drawn outside the years its polity existed have no verdict in ' + LEDGER + ' — ' +
    unjudged.slice(0, 6).map((c) => `«${c.name}» (${c.q} ${c.side} ${c.year}; drawn ${c.sheets.map((x) => x.drawn.join('..')).join(', ')})`).join(', ') +
    '. Judge each against the historical record: a row if Wikidata and history agree, `refuted` with the reason if not (.agents/rules/historical-verification.md §2-2, §4-3)']);
  for (const r of ledger.rows || []) {
    const fa = facts[r.q];
    const tag = `«${r.name}» → ${r.q}`;
    if (!fa) { out.push(['era-span-row-unfetched', tag + ' has no Wikidata facts — run node scripts/histeras/spans.mjs --fetch']); continue; }
    if (!(r.history && String(r.history).trim())) out.push(['era-span-row-unreviewed', tag + ' states no historical check (`history`) — a Wikidata date alone is not history']);
    if (r.e != null && !(fa.e || []).includes(r.e)) out.push(['era-span-row-unstated', tag + ' ends at ' + r.e + ', which Wikidata does not state (it states ' + JSON.stringify(fa.e) + ')']);
    /* ⚠ (hist-fidelity-sweep) A START HISTORY STATES AND WIKIDATA DOES NOT. «Elam» was moved to `refuted` on
       2026-10-01 because the card could only say «Wikidata states…», so the 5000 and 4000 BCE sheets named
       Elam two millennia before the Proto-Elamite period. `sBy: "history"` is the reviewed answer: the bound
       is the year the `history` sentence names (`hs`), and it is admitted only where it is EARLIER than every
       start Wikidata states — history refuting Wikidata as too late, the one case where Wikidata's year would
       withhold years the polity existed. A history bound later than Wikidata's is not a correction but a
       second opinion, and is refused. */
    if (r.sBy != null && r.sBy !== 'history') out.push(['era-span-row-bad-basis', tag + ' says its start is by «' + r.sBy + '»; the only other basis is "history"']);
    if (r.s != null && r.sBy === 'history') {
      if (r.s !== r.hs) out.push(['era-span-history-bound-not-hs', tag + ' takes its start from history but begins at ' + r.s + ', not at `hs` ' + r.hs]);
      if (!(fa.s || []).length || !(fa.s || []).every((w) => w > r.s)) out.push(['era-span-history-bound-not-earlier', tag + ' takes its start from history (' + r.s + ') where Wikidata states ' + JSON.stringify(fa.s) + ' — a history bound is admitted only where it is earlier than every start Wikidata states']);
    } else if (r.s != null && !(fa.s || []).includes(r.s)) out.push(['era-span-row-unstated', tag + ' begins at ' + r.s + ', which Wikidata does not state (it states ' + JSON.stringify(fa.s) + ')']);
    /* ⚠ (restore-clock-and-elam) A START BOUND THAT IS LATER THAN HISTORY WITHHOLDS YEARS THE POLITY EXISTED.
       MEASURED: «Elam» → Q128904 carried Wikidata's 2700 BCE (the Old Elamite period) as its bound, while the
       row's own sentence named the Proto-Elamite period, c. 3200 BCE — so the 3000 BCE map drew Elam's shape
       with no name, and every gate was green: the check above asks only whether Wikidata states the year, and
       Wikidata stating it is not history (.agents/rules/historical-verification.md §2-2). The reviewer's year
       is therefore a VALUE, `hs` — the earliest year the `history` sentence places the unit — and the map
       is asked below whether it withholds the name in any year from `hs` on. A Wikidata start later than
       history is refuted (`date-disputed`), as «Ur» already was, never kept because the sheets it trims
       happen to be early. */
    if (r.s != null) {
      if (!Number.isInteger(r.hs)) out.push(['era-span-row-no-history-start', tag + ' begins at ' + r.s + ' but states no `hs` — the earliest year its `history` places the unit — so nothing can show the bound withholds no year it existed']);
      else if (!historyNames(historyOf(r, ledger), r.hs)) out.push(['era-span-row-history-start-unsaid', tag + ' claims history places it from ' + r.hs + ', and its `history` sentence does not say so']);
    }
    /* the row must still act on something the map draws — a judgement about nothing is a stale photograph */
    const live = found.some((c) => c.name === r.name && c.q === r.q && ((c.side === 'end' && r.e != null) || (c.side === 'start' && r.s != null)));
    if (!live) out.push(['era-span-row-dead', tag + ' no longer crosses any drawn year of any sheet — the record changed; re-judge or remove the row']);
    /* evaluated on the page: past the bound the name is gone, inside it the name stays */
    for (const s of er.snaps) {
      const rg = ranges.get(s.y); if (!rg || !s.feats.some((f) => f[0] && f[0].en === r.name)) continue;
      const fc = sheetFC(s);
      const bad = [];
      if (r.e != null && rg[1] > r.e) bad.push(Math.max(r.e + 1, rg[0]));
      if (r.s != null && rg[0] < r.s) bad.push(rg[0]);
      /* the last year this sheet withholds the name in, against the earliest year history places the unit */
      if (r.s != null && Number.isInteger(r.hs) && rg[0] < r.s && Math.min(rg[1], r.s - 1) >= r.hs) {
        out.push(['era-span-withholds-history', tag + ' is withheld on sheet ' + s.y + ' in ' + Math.max(rg[0], r.hs) + '..' + Math.min(rg[1], r.s - 1) +
          ', years its own `history` says it existed (from ' + r.hs + '; Wikidata states ' + r.s + ') — refute the start as `date-disputed`']);
      }
      for (const y of bad) {
        const shown = api.eraShown(fc, y);
        if (shown.features.some((f) => f.properties.NAME === r.name)) out.push(['era-span-not-enforced', tag + ' is still named by the page at ' + y + ' on sheet ' + s.y]);
      }
      const inside = [rg[0], rg[1], s.y].find((y) => y >= (r.s != null ? r.s : -Infinity) && y <= (r.e != null ? r.e : Infinity) && y >= rg[0] && y <= rg[1]);
      if (inside != null && !api.eraShown(fc, inside).features.some((f) => f.properties.NAME === r.name)) {
        out.push(['era-span-overreach', tag + ' is withheld by the page at ' + inside + ', inside its own span']);
      }
    }
  }
  for (const r of ledger.refuted || []) {
    if (!(r.why && r.note)) out.push(['era-span-refuted-unexplained', `«${r.name}» → ${r.q} ${r.side} is refuted without a reason and a note`]);
    if (!found.some((c) => c.name === r.name && c.q === r.q && c.side === r.side)) out.push(['era-span-refuted-dead', `«${r.name}» → ${r.q} ${r.side} is refuted, but nothing raises it any more — remove the entry`]);
  }
  return out;
}

/* ══ 5. A CHANGE OF NAME FALLS ON THE RECORD'S DAY, NOT ON 1 JANUARY ══════════════════════════════
   (hist-fidelity-sweep) 1960-06-15 drew «Dahomey», «Niger», «Cote d'Ivoire» and «Nigeria» without their
   coloniser — weeks before 1960-08-01 · 08-03 · 08-07 · 10-01 — because js/time-borders.js `_CS_ERA` was
   written in years and compared as `y < before`. The record beside it, data/cshapes.js, starts a new row
   for that gwcode on the day of the change; a year is therefore asked of the record (`_csBefore`).
   ⚠ THE PAGE IS ASKED. For every dated rule, the record's own boundaries of that gwcode in that year are
   found, and the page's `csName` is evaluated the day before and the day of the boundary with the row the
   page draws there: the rule's name must stand before it and be gone on it. A year holding two boundaries
   cannot say which one it means and must be written as a day; a written day in a year the record has
   boundaries in must be one of them. A year with no boundary is the table's own precision — listed by
   `--report`, not failed. */
export function csNameProblems(ctx) {
  const { api } = ctx, out = [], yearOnly = [];
  if (!api.csName || !api.csEra) return { out: [['cs-name-unmeasurable', 'js/time-borders.js publishes no csName/csEra — the dated name table cannot be asked']], yearOnly };
  const { cs } = records();
  const ymd = (y, m, d) => y * 10000 + m * 100 + d;
  const un = (v) => [Math.floor(v / 10000), Math.floor(v / 100) % 100, v % 100];
  const shift = (y, m, d, k) => { const t = new Date(0); t.setUTCFullYear(y, m - 1, d + k); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
  const byGw = new Map();
  for (const f of cs.feats) { if (!byGw.has(f[1])) byGw.set(f[1], []); byGw.get(f[1]).push(f); }
  const rowAt = (rows, t) => rows.find((f) => ymd(f[2], f[3], f[4]) <= t && t <= ymd(f[5], f[6], f[7])) || null;
  for (const [gwS, rules] of Object.entries(api.csEra())) {
    const gw = +gwS, rows = byGw.get(gw) || [];
    rules.forEach(([cut, name], ri) => {
      if (cut === 9999) return;
      /* the next rule may carry the same words (Iceland under the Danish crown both before and after 1918) —
         then the boundary changes the rule, not the name, and only the day before is asked */
      const sameAfter = rules[ri + 1] && rules[ri + 1][1] === name;
      const Y = Array.isArray(cut) ? cut[0] : cut;
      const y0 = ymd(Y, 1, 1), y1 = ymd(Y + 1, 1, 1);
      /* the instants inside Y at which the record of this gwcode changes: a row starting, or the day after one ends */
      const B = new Set();
      for (const f of rows) {
        const s = ymd(f[2], f[3], f[4]); if (s >= y0 && s < y1 && s > ymd(rows[0][2], rows[0][3], rows[0][4])) B.add(s);
        const e = ymd(...shift(f[5], f[6], f[7], 1)); if (e >= y0 && e < y1) B.add(e);
      }
      const tag = `gw ${gw} «${name}» before ${Array.isArray(cut) ? cut.join('-') : cut}`;
      let at;
      if (Array.isArray(cut)) {
        at = ymd(cut[0], cut[1], cut[2]);
        if (B.size && !B.has(at)) { out.push(['cs-name-day-off-record', tag + ' names a day the record does not change on (its boundaries in ' + Y + ': ' + [...B].sort().map((v) => un(v).join('-')).join(', ') + ')']); return; }
        if (!B.size) return;   /* a written day with no record boundary is the table's own statement */
      } else {
        if (B.size > 1) { out.push(['cs-name-ambiguous-year', tag + ' falls in a year in which the record changes ' + B.size + ' times (' + [...B].sort().map((v) => un(v).join('-')).join(', ') + ') — write the day']); return; }
        if (!B.size) { yearOnly.push(tag); return; }
        at = [...B][0];
      }
      /* evaluated on the page: the rule's name before the boundary, and not on it */
      const [ay, am, ad] = un(at), [by, bm, bd] = shift(ay, am, ad, -1), tb = ymd(by, bm, bd);
      const rb = rowAt(rows, tb), ra = rowAt(rows, at);
      if (rb) { const nb = api.csName(rb[0], gw, by, bm, bd, rb); if (nb !== name) out.push(['cs-name-not-before', tag + ': the page names it «' + nb + '» on ' + [by, bm, bd].join('-') + ', the day before the record changes']); }
      if (ra && !sameAfter) { const na = api.csName(ra[0], gw, ay, am, ad, ra); if (na === name) out.push(['cs-name-still-after', tag + ': the page still names it «' + na + '» on ' + [ay, am, ad].join('-') + ', the day the record changes']); }
    });
  }
  return { out, yearOnly };
}

/* ══ 6. A CARRIED-BACK UNIT IS NOT DRAWN BEFORE ITS COUNTRY'S SET WAS COMPLETE ═════════════════════
   (hist-fidelity-sweep) data/hist-admin-fill.js drew Japan's 45 prefectures from 1881-02-07: the build
   took each code's EARLIEST stated inception, and a refounded unit states several — 香川県 1871, 1875 and
   1888-12-03 — so 1881-1888 drew Kagawa over 愛媛県, Nara over 大阪府, Toyama / Saga / Miyazaki before
   1883. The bundle now carries the latest inception each code states (`inception`), and this re-derives
   from the shipped bytes the two things a row claims: it is not drawn before its own last founding, and
   not before the latest founding any unit of its country states (the whole-country set floor). A gap
   record without that evidence cannot be measured, and says so. */
export function fillInceptionProblems(bs) {
  const out = [];
  for (const { file, b } of bs) {
    if (!/admin-fill/.test(file)) continue;
    const inc = b.inception;
    if (!inc || typeof inc !== 'object') { out.push(['fill-inception-unstated', file + ' carries no `inception` — the floor its rows are drawn from cannot be re-derived']); continue; }
    /* ⚠ (hist-coverage) THE COUNTRY OF A CODE IS THE OUTLINE SET'S, NOT ITS PREFIX. This read «UA-43 → UA →
       whichever country a drawn UA-row names», and Natural Earth — the set the build admits countries by —
       files Crimea (UA-43, Wikidata 1991-02-12) and Sevastopol (UA-40) under RUS. Once the ranked join dated
       UA-43, the prefix gave Ukraine a 1991 floor the build never applied, and the gate read 16 correct
       Ukrainian rows as drawn too early. The code's country is asked of data/admin1-world.json.gz itself;
       the prefix is only the fallback for a code that set does not hold. */
    const iso3Of = new Map(), { codeIso } = neGrid();
    for (const f of b.feats) iso3Of.set(String(f[10]).split('-')[0], f[11]);
    const countryOf = (code) => codeIso.get(code) || iso3Of.get(code.split('-')[0]);
    const F = new Map();
    for (const [code, s] of Object.entries(inc)) { const c = countryOf(code); if (c && (!F.has(c) || s > F.get(c))) F.set(c, s); }
    const bad = [];
    for (const f of b.feats) {
      const s = f[2] * 10000 + f[3] * 100 + f[4];
      const own = inc[f[10]], floor = F.get(f[11]);
      if ((own != null && s < own) || (floor != null && s < floor)) bad.push(f[0] + ' ' + f[10] + ' from ' + [f[2], f[3], f[4]].join('-') + ' (own ' + own + ', country ' + floor + ')');
    }
    if (bad.length) out.push(['fill-before-inception', bad.length + ' row(s) of ' + file + ' are drawn before a founding Wikidata states for them or for their country — ' + bad.slice(0, 6).join('; ')]);
  }
  return out;
}

/* ══ main ════════════════════════════════════════════════════════════════════════════════ */
/* (hist-era-span-fidelity) the polities the era sheet draws there that year, as the page draws them —
   the sheet `nearest` picks for that year, and every name the reader's year withholds marked as such.
   Listed only below the day-exact record, where the sheets are what the map shows. */
async function listEra(y, box) {
  const ctx = await eraContext();
  if (y >= ctx.hbLo) return;
  const sy = ctx.api._nearest(y, ctx.er.snaps.map((s) => s.y));
  const s = ctx.er.snaps.find((x) => x.y === sy); if (!s) return;
  const shown = ctx.api.eraShown(sheetFC(s), y);
  const hits = [];
  s.feats.forEach((f, i) => {
    let sx = 0, sy2 = 0, n = 0;
    for (const poly of f[2]) for (const ri of poly.slice(0, 1)) for (const p of ctx.er.rings[ri]) { sx += p[0]; sy2 += p[1]; n++; }
    const cx = sx / n, cy = sy2 / n;
    if (cx < box[0] || cx > box[2] || cy < box[1] || cy > box[3]) return;
    const p = shown.features[i].properties;
    hits.push((f[0] && f[0].en) + (p._wName ? `   ✂ 名前を描かない（${p._wQ} ${p._wLabel || ''} が ${p._wYear} に${p._wSide === 'end' ? '終焉' : '成立'}）` : ''));
  });
  console.log(`data/hist-eras.js: sheet ${sy} drawn for ${y} — ${hits.length} named shape(s) in the box`);
  for (const h of [...new Set(hits)].sort()) console.log('    ' + h);
}
function listYear(bs, y, box) {
  /* (hist-coverage) a row claimed twice at this instant says so, and says which kind of claim it is */
  const live = new Map();
  for (const { file, b } of bs) b.feats.forEach((f, i) => { if (inForce(f, y, 7, 1)) live.set(claimKey(file, f, i), f[0]); });
  const claimed = new Map();
  try {
    const t = [y, 7, 1], le = (p, q) => (p[0] !== q[0] ? p[0] < q[0] : p[1] !== q[1] ? p[1] < q[1] : p[2] <= q[2]);
    for (const [kind, ka, kb, os, oe] of JSON.parse(fs.readFileSync(path.join(ROOT, CLAIMS), 'utf8')).pairs) {
      if (!live.has(ka) || !live.has(kb) || !(le(os, t) && !le(oe, t))) continue;
      claimed.set(ka, (claimed.get(ka) || []).concat([[kind, live.get(kb)]]));
      claimed.set(kb, (claimed.get(kb) || []).concat([[kind, live.get(ka)]]));
    }
  } catch (_) { /* no ledger yet — the rows are listed without their claims */ }
  const KIND_JA = { seam: '継ぎ目', duplicate: '重複', contested: '係争' };
  for (const { file, b } of bs) {
    const hits = [];
    for (let i = 0; i < b.feats.length; i++) {
      const f = b.feats[i];
      if (!inForce(f, y, 7, 1)) continue;
      let sx = 0, sy = 0, n = 0;
      for (const poly of f[8]) for (const ri of poly) for (const p of b.rings[ri]) { sx += p[0]; sy += p[1]; n++; }
      const cx = sx / n, cy = sy / n;
      if (cx < box[0] || cx > box[2] || cy < box[1] || cy > box[3]) continue;
      const d = datesOf(b, f, i);
      const mark = !d || (d.start && d.start.raw) ? ''
        : d.start && d.start.derived ? '   · 開始日は上流に無く、同じ制度の他の単位から導出（' + d.start.bound + '）'
        : '   ⚠ 開始日を誰も述べていない';
      /* (hist-fidelity-sweep) a reviewed handover says whose day it is, beside upstream's own */
      const cor = d && ['start', 'end'].filter((k) => d[k] && d[k].corrected).map((k) => `${k === 'start' ? '開始' : '終了'}は上流 ${d[k].raw} → 審査済み ${d[k].corrected.at}（${d[k].corrected.q} ${d[k].corrected.p}）`).join('・');
      const cl = claimed.get(claimKey(file, f, i));
      const clm = cl ? '   ⇄ ' + cl.map(([k, o]) => KIND_JA[k] + '(' + k + ') × ' + o).join('; ') : '';
      hits.push(`${f[0]} (L${f[1]} ${[f[2], f[3], f[4]].join('-')} → ${[f[5], f[6], f[7]].join('-')})${mark}${cor ? '   · ' + cor : ''}${clm}`);
    }
    console.log(`${file}: ${hits.length}`);
    for (const h of hits) console.log('    ' + h);
  }
}

/* (hist-colonial-era-borders) the polities the map draws there that year, as `politiesAt` composes them, each with the
   record that drew it — the enumeration historical-verification.md §2-1 asks for, of the country layer itself. A polity is
   listed when its drawn ground's centroid (cell-weighted on the gate's grid) lies in the box, with that ground in cells. */
function listPolities(y, box) {
  const ps = politiesAt(y), m = measure(ps, [], RES), { cid, NX, NY } = m.cells, G = kGrid(RES);
  const acc = ps.map(() => [0, 0, 0]);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const c = cid[j * NX + i]; if (c < 0) continue;
    const a = acc[c]; a[0]++; a[1] += G.lonC(i); a[2] += G.latC(j); }
  const by = new Map();
  ps.forEach((p, i) => { const [n, sx, sy] = acc[i]; if (!n) return; const x = sx / n, yy = sy / n;
    if (x < box[0] || x > box[2] || yy < box[1] || yy > box[3]) return;
    const k = p.rec || '?'; if (!by.has(k)) by.set(k, []); by.get(k).push([p.nm, n]); });
  console.log(`polities drawn in ${y} (1 July) with their ground's centre in the box, by record:`);
  for (const [k, rows] of by) {
    rows.sort((a, b) => b[1] - a[1]);
    console.log(`  ${k}: ${rows.length}`);
    for (const [n, c] of rows) console.log(`      ${String(c).padStart(6)} cells  ${n}`);
  }
}

async function main() {
  const bs = bundles();
  if (has('--year')) {
    const y = parseInt(arg('--year', '1900'), 10), box = arg('--in', '-180,-90,180,90').split(',').map(Number);
    listPolities(y, box);
    listYear(bs, y, box);
    return listEra(y, box);
  }

  const spans = unsourcedSpans(bs);
  const claims = groundClaims(bs);
  const kinds = Object.fromEntries(histScale().CLAIM_KINDS.map((k) => [k, 0]));
  for (const c of claims) kinds[c.kind]++;
  const pairs = claimLedger(bs, claims);

  const observed = JSON.parse(fs.readFileSync(path.join(ROOT, OBSERVED), 'utf8'));
  /* each year's measure is read for its holes before the next year's overwrites the cells */
  const cov = [], holeYears = [];
  for (const r of observed.years) { const c = coverage(bs, r.year); holeYears.push({ year: r.year, holes: holes(bs, r.year, c) }); cov.push(c); }

  if (has('--update')) {
    const today = new Date().toISOString().slice(0, 10);
    const { selfOverlaps, ...rest } = observed;   /* (hist-coverage) the namesake count is retired — see «2. DOUBLE CLAIM» */
    const next = { ...rest, measured: today, res: RES,
      unsourcedSpans: spans.length, claims: kinds,
      years: cov.map((c) => ({ year: c.year, pct: +c.pct.toFixed(2), pctArea: +c.pctArea.toFixed(2), polityLand: +c.polityLand.toFixed(2), unitLand: +c.unitLand.toFixed(2), zero: c.zero, partial: c.partial, full: c.full })) };
    fs.writeFileSync(path.join(ROOT, OBSERVED), JSON.stringify(next, null, 2) + '\n');
    fs.writeFileSync(path.join(ROOT, HOLES), JSON.stringify({ note: HOLES_NOTE, measured: today, res: RES, reasons: HOLE_REASONS, years: holeYears }) + '\n');
    fs.writeFileSync(path.join(ROOT, CLAIMS), JSON.stringify({ note: CLAIMS_NOTE, measured: today, kinds: histScale().CLAIM_KINDS, pairs }) + '\n');
    console.log('wrote ' + OBSERVED + ', ' + HOLES + ', ' + CLAIMS + ' — ' + spans.length + ' unsourced span(s), claims ' + JSON.stringify(kinds) + ', coverage ' + cov.map((c) => c.year + ':' + c.pct.toFixed(1) + '%').join(' '));
    return;
  }

  const problems = [], notes = [];
  const say = (ok, tag, msg) => { (ok ? notes : problems).push(`  ${ok ? 'ok  ' : '✖  '} ${tag}: ${msg}`); };

  say(spans.length === 0, 'unsourced-span', spans.length === 0
    ? `every one of ${bs.reduce((n, x) => n + x.b.feats.length, 0)} shipped rows is drawn from a date some upstream stated`
    : `${spans.length} row(s) are drawn from a date NO upstream states — ${spans.slice(0, 4).map((r) => `${r.name} (drawn from ${r.from})`).join(', ')}. A start nobody stated is not a start: resolve it from the unit's own record, or do not draw the unit at that date (.agents/rules/historical-verification.md §2-3)`);

  /* (hist-coverage) the same ground claimed twice, by kind — none of the three may grow */
  const was = observed.claims || {};
  for (const k of histScale().CLAIM_KINDS) {
    say(was[k] != null && kinds[k] <= was[k], 'double-claim-' + k,
      `${kinds[k]} pair(s) of units at one level drawn over the same ground at one instant (was ${was[k] == null ? 'unrecorded' : was[k]})`);
  }
  /* …and the two photographs the page and the reader read are re-taken, not trusted */
  const rec = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (_) { return null; } };
  const hl = rec(HOLES), cl = rec(CLAIMS);
  const hOk = !!hl && JSON.stringify(hl.years) === JSON.stringify(holeYears), cOk = !!cl && JSON.stringify(cl.pairs) === JSON.stringify(pairs);
  say(hOk, 'holes-ledger', hOk
    ? `${holeYears.reduce((n, y) => n + y.holes.length, 0)} hole(s) over ${holeYears.length} years, each broken down by the present-day country under it and why its ground is empty (${HOLES}, observed ${hl.measured})`
    : HOLES + ' is not what the shipped bundles measure — re-record it: node scripts/hist-fidelity.mjs --update');
  say(cOk, 'claims-ledger', cOk
    ? `${pairs.length} first-level pair(s) the layer's note counts at the reader's date (${CLAIMS}, observed ${cl.measured})`
    : CLAIMS + ' is not what the shipped bundles measure — re-record it: node scripts/hist-fidelity.mjs --update');

  const era = await eraContext();
  const eraBad = eraSpanProblems(era);
  for (const [tag, msg] of eraBad) say(false, tag, msg);
  if (!eraBad.length) {
    const applied = era.found.filter((c) => { const j = judged(c, era.ledger); return j && j.by === 'row'; }).length;
    say(true, 'era-span', `${era.found.length} finding(s) of an era name drawn outside its polity's lifespan, every one judged — ${applied} withheld on the map by a reviewed row, ${era.found.length - applied} refuted with a reason`);
  }

  /* ⑦ (hist-fidelity-sweep) one handover, two statements of its year — scripts/histadmin/edges.mjs */
  const edges = readEdges(ROOT);
  const edp = edgeProblems(bs, edges, historyNames);
  for (const [tag, msg] of edp) say(false, tag, msg);
  if (!edp.length) say(true, 'edge-handover', (edges.found || []).length + ' succession(s) upstream ties by one event while naming two years, every one judged — ' + (edges.reviewed || []).length + ' moved to the day Wikidata states and history agrees with, ' + (edges.refuted || []).length + ' left as upstream wrote it');

  const fip = fillInceptionProblems(bs);
  for (const [tag, msg] of fip) say(false, tag, msg);
  if (!fip.length) say(true, 'fill-inception', 'no carried-back row is drawn before its own latest stated founding or its country\'s');

  const csn = csNameProblems(era);
  for (const [tag, msg] of csn.out) say(false, tag, msg);
  if (!csn.out.length) say(true, 'cs-name-day', `every dated name rule that falls in a year the CShapes record changes in is named on the record's day — ${csn.yearOnly.length} rule(s) fall in a year with no record boundary and keep the table's year precision`);

  for (const c of cov) {
    const was = observed.years.find((r) => r.year === c.year);
    /* The grid is deterministic, so the floor is the last measurement itself. The slack exists
       for a simplification-tolerance change, not for drift: a round that lowers coverage on
       purpose (by removing a claim nobody made) re-records it with --update and says why. */
    say(c.pct >= was.pct - 0.5, 'coverage-' + c.year,
      `${c.pct.toFixed(1)}% of the land inside a polity carries a first-level unit (was ${was.pct}%) — 0%:${c.zero} 一部だけ:${c.partial} 丸ごと:${c.full}`);
    /* (hist-coverage-expansion) the two shares of the world's land — neither may shrink */
    if (was.polityLand != null) say(c.polityLand >= was.polityLand - 0.5, 'polity-land-' + c.year,
      `${c.polityLand.toFixed(1)}% of the world's land is inside a drawn polity (was ${was.polityLand}%); ${c.unitLand.toFixed(1)}% carries a first-level unit (was ${was.unitLand}%)`);
    if (was.unitLand != null && !(c.unitLand >= was.unitLand - 0.5)) say(false, 'unit-land-' + c.year, `${c.unitLand.toFixed(1)}% of the world's land carries a first-level unit, under the recorded ${was.unitLand}%`);
  }

  if (has('--report')) {
    console.log('\n── 開始日を誰も述べていない行: ' + spans.length + ' 件');
    for (const r of spans.slice(0, 90)) console.log(`   ${r.file.replace('data/', '').padEnd(20)} ${r.name} (L${r.level})  地図は ${r.from} から描く / 上流が述べる終わり ${r.end || 'なし'}`);
    console.log('\n── 時代の名前が、その政体の存在しない年に描かれる所見: ' + era.found.length + ' 件');
    for (const c of era.found) {
      const j = judged(c, era.ledger);
      console.log(`   ${j ? (j.by === 'row' ? '名前を外す' : '反証(' + j.ref.why + ')') : '未判定'}  «${c.name}» ${c.q} ${c.label || ''} ${c.side === 'end' ? '終焉' : '成立'} ${c.year}  描かれる年 ${c.sheets.map((x) => x.drawn.join('..')).join(', ')}`);
    }
    console.log('\n── 国名の切り替えが年の精度のままの規則（記録がその年に変わらない）: ' + csn.yearOnly.length + ' 件');
    for (const t of csn.yearOnly) console.log('   ' + t);
    console.log('\n── 同じ土地を同じ瞬間に二つの単位が主張する組: 継ぎ目 ' + kinds.seam + ' / 重複 ' + kinds.duplicate + ' / 係争 ' + kinds.contested);
    for (const k of histScale().CLAIM_KINDS) {
      for (const c of claims.filter((x) => x.kind === k).slice(0, 5)) console.log(`   ${k.padEnd(9)} ${c.a.name} [${c.a.s.join('-')}..${c.a.e.join('-')}] × ${c.b.name} [${c.b.s.join('-')}..${c.b.e.join('-')}]   ${c.a.file.replace('data/', '')}`);
    }
    console.log('\n── 穴（区分の記録が無い・一部だけの政体）と、その下の現代の国と理由');
    for (const hy of holeYears) {
      const big = hy.holes.filter((h) => h[2] >= 400).slice(0, 6);
      if (!big.length) continue;
      console.log('   ' + String(hy.year).padStart(6) + '  ' + big.map((h) => `${h[0]} ${h[1]}% [${h[3].map((p) => p.slice(0, 2).join(' ') + '% ' + p.slice(2).join(' ')).join(', ')}]`).join(' · '));
    }
    console.log('\n── 年ごとの被覆（母集合＝その年、地図が政体の中に置いている陸地）');
    for (const c of cov) {
      console.log(`   ${String(c.year).padStart(6)}  ${c.pct.toFixed(1).padStart(5)}% (面積 ${c.pctArea.toFixed(1)}%)   単位 ${String(c.units).padStart(4)}  政体 ${String(c.polities).padStart(3)}   0%:${c.zero}  一部だけ:${c.partial}  丸ごと:${c.full}`);
      const bad = c.per.filter((p) => p.cells >= 40 && p.pct < 95).slice(0, 12);
      if (bad.length) console.log('           大きく欠けている政体: ' + bad.map((p) => `${p.nm} ${p.pct.toFixed(0)}%`).join(' · '));
    }
    console.log('');
  }

  for (const n of notes) console.log(n);
  for (const p of problems) console.log(p);
  console.log('\ncheck:histfidelity — the historical map is measured as a claim, not as a shape');
  if (problems.length) process.exit(1);
}
/* (hist-era-span-fidelity) run only as a program — scripts/histeras/spans.mjs and the checks import
   `eraContext` / `eraSpanProblems` from here, and an import must not run the gate */
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
