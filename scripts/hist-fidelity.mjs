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
};

/* ── the shipped bundles, read the way the browser reads them ───────────────────────────── */
const load = (rel) => {
  const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return JSON.parse(s.slice(s.indexOf('=') + 1).replace(/;\s*$/, ''));
};
/* ⚠ THE TIERS AND THE GAP RECORDS ARE DISCOVERED FROM data/, NOT LISTED HERE. js/time-admin1.js
   builds T1/T2/T3 and its GAPS list from the bundles present; a hand-written copy of that list
   silently drops the fourth record the day one is added (.agents/rules/no-ad-hoc-hardcoding.md §2-4). */
export const bundles = () => fs.readdirSync(path.join(ROOT, 'data'))
  .filter((f) => /^hist-(admin\d|admin-fill|kuni)\.js$/.test(f))
  .map((f) => ({ file: 'data/' + f, b: load('data/' + f) }))
  .sort((a, b) => Math.min(...a.b.levels) - Math.min(...b.b.levels));

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
    const dates = b.dates || {};
    for (const f of b.feats) {
      const d = dates[f[10]];
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

/* ══ 2. DOUBLE CLAIM ══════════════════════════════════════════════════════════════════════
   Two units of the SAME admin_level over the same ground at the same instant is one of three
   different things, and they are not interchangeable (historical-verification.md §2-5):
     a DISPUTE   — both really did claim it (Alaska boundary dispute, Essequibo, Acre)
     a DUPLICATE — upstream holds the unit twice (Закаспійская область, 1881, twice)
     a SEAM      — year precision on both sides of a handover ([1938..1949] × [1948..1973])
   What separates them mechanically is the identity of the unit, so that is what is counted: the
   same NAME at the same LEVEL over an OVERLAPPING span is a duplicate or a seam, never a
   dispute, because a polity does not dispute ground with itself. */
function selfOverlaps(bs) {
  const out = [];
  for (const { file, b } of bs) {
    const by = new Map();
    b.feats.forEach((f, i) => { const k = f[0] + '\t' + f[1]; if (!by.has(k)) by.set(k, []); by.get(k).push(i); });
    for (const [, idx] of by) {
      if (idx.length < 2) continue;
      for (let a = 0; a < idx.length; a++) for (let c = a + 1; c < idx.length; c++) {
        const A = b.feats[idx[a]], B = b.feats[idx[c]];
        if (!spanOverlap(A, B)) continue;
        const identical = A[2] === B[2] && A[3] === B[3] && A[4] === B[4] && A[5] === B[5] && A[6] === B[6] && A[7] === B[7];
        const nested = !identical && (cmp([A[2], A[3], A[4]], [B[2], B[3], B[4]]) <= 0 && cmp([B[5], B[6], B[7]], [A[5], A[6], A[7]]) <= 0
          || cmp([B[2], B[3], B[4]], [A[2], A[3], A[4]]) <= 0 && cmp([A[5], A[6], A[7]], [B[5], B[6], B[7]]) <= 0);
        out.push({ file, name: A[0], level: A[1], ids: [A[10], B[10]], kind: identical ? 'identical' : nested ? 'nested' : 'seam' });
      }
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
   («of the world I can see, how much has provinces drawn on it») and not a cartographic one. */
const RES = Number(arg('--res', '0.25'));
const NX = Math.round(360 / RES), NY = Math.round(180 / RES);
const latC = (j) => -90 + (j + 0.5) * RES;

/* even-odd scanline fill: every ring of a polygon is crossed on the row's own latitude, so a
   hole subtracts itself and no point-in-polygon test is run per cell. */
function scan(rings, cb) {
  let minY = 90, maxY = -90;
  for (const r of rings) for (const p of r) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const j0 = Math.max(0, Math.floor((minY + 90) / RES - 0.5)), j1 = Math.min(NY - 1, Math.ceil((maxY + 90) / RES));
  const xs = [];
  for (let j = j0; j <= j1; j++) {
    const y = latC(j); xs.length = 0;
    for (const r of rings) for (let k = 0, n = r.length; k < n; k++) {
      const a = r[k], b = r[(k + 1) % n];
      if ((a[1] <= y) === (b[1] <= y)) continue;
      xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.ceil((xs[k] + 180) / RES - 0.5), i1 = Math.floor((xs[k + 1] + 180) / RES - 0.5);
      if (i1 < 0 || i0 > NX - 1) continue;
      cb(j, Math.max(0, i0), Math.min(NX - 1, i1));
    }
  }
}

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
  _rec = { cs, hb, er, csLo, csHi, hbLo: hb.window[0], hbHi: hb.window[1] };
  return _rec;
}
function politiesAt(y) {
  const { cs, hb, er, csLo, csHi, hbLo, hbHi } = records(), out = [];
  if (y >= csLo && y <= csHi) {
    for (const f of cs.feats) if (inForce(f, y, 7, 1)) out.push({ nm: f[0], polys: f[8], rings: cs.rings });
    return out;
  }
  if (y >= hbLo && y <= hbHi) {
    for (const f of hb.feats) if (inForce(f, y, 7, 1)) out.push({ nm: (f[0] && f[0].en) || f[1], polys: f[8], rings: hb.rings });
    if (out.length) return out;   /* per instant, not per band: #R690 widened the window and OHM does not fill it evenly */
  }
  let best = null;
  for (const s of er.snaps) if (s.y <= y && (!best || s.y > best.y)) best = s;
  if (best) for (const f of best.feats) out.push({ nm: (f[0] && f[0].en) || '?', polys: f[2], rings: er.rings });
  return out;
}
/* Which admin_level is «first-level» is the shallowest bundle's own answer, not a number written
   here: that bundle is the one js/time-admin1.js draws at every zoom, and its `levels` say which
   values that is. A gap record joins it when its own `levels` intersect them. */
function firstLevelAt(bs, y) {
  const lv = new Set(bs[0].b.levels), out = [];
  for (const { b } of bs) {
    if (!(b.levels || []).some((x) => lv.has(x))) continue;
    for (const f of b.feats) if (lv.has(f[1]) && inForce(f, y, 7, 1)) out.push({ polys: f[8], rings: b.rings });
  }
  return out;
}
export function coverage(bs, y) {
  const pol = politiesAt(y), adm = firstLevelAt(bs, y);
  const cid = new Int32Array(NX * NY).fill(-1), names = [];
  pol.forEach((c, ix) => {
    names.push(c.nm);
    for (const poly of c.polys) scan(poly.map((r) => c.rings[r]), (j, i0, i1) => { const base = j * NX; for (let i = i0; i <= i1; i++) cid[base + i] = ix; });
  });
  const cov = new Uint8Array(NX * NY);
  for (const u of adm) for (const poly of u.polys) scan(poly.map((r) => u.rings[r]), (j, i0, i1) => { const base = j * NX; for (let i = i0; i <= i1; i++) cov[base + i] = 1; });
  const tot = new Map(), hit = new Map();
  let T = 0, H = 0;
  for (let k = 0; k < cid.length; k++) {
    const c = cid[k];
    if (c < 0) continue;
    T++; tot.set(c, (tot.get(c) || 0) + 1);
    if (cov[k]) { H++; hit.set(c, (hit.get(c) || 0) + 1); }
  }
  const per = [...tot].map(([c, t]) => ({ nm: names[c], cells: t, pct: 100 * (hit.get(c) || 0) / t })).sort((a, b) => b.cells - a.cells);
  /* «一部だけ» is the user's own complaint and needs a line. A polity is WHOLE when the grid finds
     a unit over essentially all of it; the 5% slack is the resolution difference between a polity
     outline and a subdivision outline — the same quantity #R719 measured at 20% for a
     unit-inside-country test, smaller here because this asks about a WHOLE country, where the
     edge cells are a far smaller share of the total than they are for one province. */
  return { year: y, units: adm.length, polities: per.length, pct: 100 * H / T,
    zero: per.filter((p) => p.pct < 1).length,
    partial: per.filter((p) => p.pct >= 1 && p.pct < 95).length,
    full: per.filter((p) => p.pct >= 95).length, per };
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
    const iso3Of = new Map();
    for (const f of b.feats) iso3Of.set(String(f[10]).split('-')[0], f[11]);
    const F = new Map();
    for (const [code, s] of Object.entries(inc)) { const c = iso3Of.get(code.split('-')[0]); if (c && (!F.has(c) || s > F.get(c))) F.set(c, s); }
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
  for (const { file, b } of bs) {
    const hits = [];
    for (const f of b.feats) {
      if (!inForce(f, y, 7, 1)) continue;
      let sx = 0, sy = 0, n = 0;
      for (const poly of f[8]) for (const ri of poly) for (const p of b.rings[ri]) { sx += p[0]; sy += p[1]; n++; }
      const cx = sx / n, cy = sy / n;
      if (cx < box[0] || cx > box[2] || cy < box[1] || cy > box[3]) continue;
      const d = (b.dates || {})[f[10]];
      const mark = !d || (d.start && d.start.raw) ? ''
        : d.start && d.start.derived ? '   · 開始日は上流に無く、同じ制度の他の単位から導出（' + d.start.bound + '）'
        : '   ⚠ 開始日を誰も述べていない';
      /* (hist-fidelity-sweep) a reviewed handover says whose day it is, beside upstream's own */
      const cor = d && ['start', 'end'].filter((k) => d[k] && d[k].corrected).map((k) => `${k === 'start' ? '開始' : '終了'}は上流 ${d[k].raw} → 審査済み ${d[k].corrected.at}（${d[k].corrected.q} ${d[k].corrected.p}）`).join('・');
      hits.push(`${f[0]} (L${f[1]} ${[f[2], f[3], f[4]].join('-')} → ${[f[5], f[6], f[7]].join('-')})${mark}${cor ? '   · ' + cor : ''}`);
    }
    console.log(`${file}: ${hits.length}`);
    for (const h of hits) console.log('    ' + h);
  }
}

async function main() {
  const bs = bundles();
  if (has('--year')) {
    const y = parseInt(arg('--year', '1900'), 10), box = arg('--in', '-180,-90,180,90').split(',').map(Number);
    listYear(bs, y, box);
    return listEra(y, box);
  }

  const spans = unsourcedSpans(bs);
  const dupes = selfOverlaps(bs);
  const kinds = { identical: 0, nested: 0, seam: 0 };
  for (const d of dupes) kinds[d.kind]++;

  const observed = JSON.parse(fs.readFileSync(path.join(ROOT, OBSERVED), 'utf8'));
  const cov = observed.years.map((r) => coverage(bs, r.year));

  if (has('--update')) {
    const next = { ...observed, measured: new Date().toISOString().slice(0, 10), res: RES,
      unsourcedSpans: spans.length, selfOverlaps: kinds,
      years: cov.map((c) => ({ year: c.year, pct: +c.pct.toFixed(2), zero: c.zero, partial: c.partial, full: c.full })) };
    fs.writeFileSync(path.join(ROOT, OBSERVED), JSON.stringify(next, null, 2) + '\n');
    console.log('wrote ' + OBSERVED + ' — ' + spans.length + ' unsourced span(s), coverage ' + cov.map((c) => c.year + ':' + c.pct.toFixed(1) + '%').join(' '));
    return;
  }

  const problems = [], notes = [];
  const say = (ok, tag, msg) => { (ok ? notes : problems).push(`  ${ok ? 'ok  ' : '✖  '} ${tag}: ${msg}`); };

  say(spans.length === 0, 'unsourced-span', spans.length === 0
    ? `every one of ${bs.reduce((n, x) => n + x.b.feats.length, 0)} shipped rows is drawn from a date some upstream stated`
    : `${spans.length} row(s) are drawn from a date NO upstream states — ${spans.slice(0, 4).map((r) => `${r.name} (drawn from ${r.from})`).join(', ')}. A start nobody stated is not a start: resolve it from the unit's own record, or do not draw the unit at that date (.agents/rules/historical-verification.md §2-3)`);

  for (const k of ['identical', 'nested', 'seam']) {
    say(kinds[k] <= observed.selfOverlaps[k], 'double-claim-' + k,
      `${kinds[k]} pair(s) of one unit drawn twice over one instant (was ${observed.selfOverlaps[k]})`);
  }

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
    console.log('\n── 同じ単位が同じ瞬間に二度描かれる組: identical ' + kinds.identical + ' / nested ' + kinds.nested + ' / seam ' + kinds.seam);
    console.log('\n── 年ごとの被覆（母集合＝その年、地図が政体の中に置いている陸地）');
    for (const c of cov) {
      console.log(`   ${String(c.year).padStart(6)}  ${c.pct.toFixed(1).padStart(5)}%   単位 ${String(c.units).padStart(4)}  政体 ${String(c.polities).padStart(3)}   0%:${c.zero}  一部だけ:${c.partial}  丸ごと:${c.full}`);
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
