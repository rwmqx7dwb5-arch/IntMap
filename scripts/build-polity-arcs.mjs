#!/usr/bin/env node
/* ============================================================================
 *  IntMap · RISE AND FALL — every polity the map draws, measured through time   (hist-product)
 * ----------------------------------------------------------------------------
 *  The time machine answers «what did the world look like in 1279» and «who held this point», and the year book ranks one
 *  instant by drawn area. Nothing could answer the question a learner asks of ONE polity: when did the map begin drawing the
 *  Mongol Empire, how large did it draw it, when, and when did it stop — the shape of a rise and a fall. Every fact was in the
 *  bundles; none could be read across time by polity. This writes the index that can: data/polity-arcs.json, «polity → the area
 *  the map draws under its name at every instant the records change it». Its reader is js/polity-arc.js (the sheet, the
 *  place card's row button, the Chronos panel's door, Atlas's `time.polityArc`).
 *
 *  ══ ⚠⚠⚠ IT STATES ONLY WHAT THE MAP DRAWS (.agents/rules/historical-verification.md) ═══════════════════════════════════
 *  Nothing here reads the bundles its own way. js/time-borders.js is INSTANTIATED (scripts/history-pages.mjs `mapReader`,
 *  the reader the history pages, the year pages and «on this day» use) and asked `collectionAt` at each instant; a polity
 *  is the NAME THE MAP WRITES on an outline that instant (the `tagSame` pass), its area the year book's own measure
 *  (js/year-book.js `areaKm2` — the drawn shape on the sphere), its record the one that drew the outline
 *  (scripts/year-choice.mjs `recordOf`). So:
 *    · AN AREA IS THE AREA OF THE DRAWN SHAPE, never a statement about a realm's control. The page says so, and it says
 *      which record drew each stretch, because two records draw one polity differently and the seam between them
 *      (1689: OpenHistoricalMap begins; 1886: CShapes begins) is a change of record, not of the world.
 *    · THE INSTANTS ARE THE MAP'S OWN. Before 1689 the index is read at 1 July of EVERY year on which the map's world
 *      changes, as js/time-borders.js `changeDates` lists them (a Cliopatria row begins or ends; the map moves from one
 *      sheet to the next, which re-judges the coast pieces of data/hist-coast-snap.js) — between two of them nothing it
 *      draws changes, so this is every state, not a sample. OpenHistoricalMap and CShapes state days: from 1689 to the last CShapes year the
 *      index is sampled on 1 July of every year (the instant the history pages and the year pages read), and the page says
 *      «as drawn on 1 July» — a border change inside a year is the year book's and «on this day»'s to tell.
 *    · THE HISTORICAL-BASEMAPS SHEETS STATE A PERIOD, NOT A YEAR. Between sheet years the map fills the dated records' gaps
 *      with the nearest sheet; those pieces state no year and are NOT counted in the dated line. A sheet's own pieces are
 *      kept apart (`s`), at the sheet's own year, and the page draws them as points — the sheet's statement, at its year.
 *    · A DESCRIPTION IS NOT A POLITY. An outline whose name the cartographer wrote as a description («Hunter-gatherers of the
 *      savanna», `_desc`) is left out and counted (`skipped.described`); an unnamed outline likewise (`skipped.unnamed`).
 *  ⚠ NO SMOOTHING. A run of instants with the same rounded area (whole km²) and the same records is one point; that is the
 *    only compression, and it is lossless at the precision the page prints.
 *  ⚠ BUILT FROM THE BUNDLES HERE, NEVER FROM AN UPSTREAM — `--check` re-derives it and compares.
 *
 *    node scripts/build-polity-arcs.mjs           write data/polity-arcs.json
 *    node scripts/build-polity-arcs.mjs --check   re-derive and compare with the committed file (exit 1 on a difference)
 *    node scripts/build-polity-arcs.mjs --show <name>   print one polity's line (what the sheet would draw)
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DERIVED_FROM_THE_REPOSITORY } from './lib/upstream-cadence.mjs';

/* ⚠ 出自は値である（js/data-governance.js の read() と npm run check:datagov が読む）。 */
export const GOVERNANCE = {
  'data/polity-arcs.json': {
    /* names and drawn areas, measured by the map's own code over the four border records it draws */
    upstreams: [
      { publisher: 'Seshat Global History Databank (Cliopatria)', url: 'https://github.com/Seshat-Global-History-Databank/cliopatria', licence: 'CC BY 4.0',
        licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: true, creditRequired: true,
        paidBy: 'Cliopatria — Seshat Global History Databank (CC BY 4.0)' },
      { publisher: 'OpenHistoricalMap', url: 'https://www.openhistoricalmap.org/', licence: 'CC0 1.0',
        licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: false, creditRequired: false },
      { publisher: 'Schvitz, Rüegger, Girardin, Cederman, Weidmann, Gleditsch (ICR, ETH Zürich)', url: 'https://icr.ethz.ch/data/cshapes/', licence: 'CC BY-NC-SA 4.0',
        attribution: true, creditRequired: true, paidBy: 'CShapes 2.0 (Schvitz et al., ETH Zürich)' },
      { publisher: 'aourednik/historical-basemaps', url: 'https://github.com/aourednik/historical-basemaps', licence: 'GPL-3.0', attribution: true },
    ],
    ...DERIVED_FROM_THE_REPOSITORY,
    schema: 'scripts/build-polity-arcs.mjs --check (re-derived from the bundles and compared)',
    builtBy: 'scripts/build-polity-arcs.mjs',
  },
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = 'data/polity-arcs.json';
/* the records whose pieces state the instant they are drawn at, in the bit order of a point's record mask — the order the
   map composes them in, oldest first (js/polity-arc.js RECORDS reads the same list from the file's `recs`) */
export const DATED = ['clio', 'ohm', 'cshapes'];
const V = 1;

const readBundle = (rel) => { const t = readFileSync(join(ROOT, rel), 'utf8'); return JSON.parse(t.slice(t.indexOf('=') + 1).replace(/;\s*$/, '')); };
const round2 = (x) => Math.round(x * 100) / 100;

/** the instants the index is read at: sheet years (each its own statement), the years below the OpenHistoricalMap floor
 *  on which the map's own world changes (`changeYears` — js/time-borders.js `changeDates`), and every year from that floor
 *  to the last CShapes year — ascending, unique */
export function instants(bands, sheetYears, changeYears) {
  const s = new Set();
  for (const y of sheetYears) if (y <= bands.csTo) s.add(y);
  for (const y of changeYears) if (y < bands.ohmFrom) s.add(y);
  for (let y = bands.ohmFrom; y <= bands.csTo; y++) s.add(y);
  return [...s].sort((a, b) => a - b);
}

/* ── the box of a set of geometries, the narrow way round the antimeridian ──────────────────────────
   A polity that straddles 180° (the Russian Empire with Alaska, Fiji) has a plain box the width of the world. The
   longitudes its parts cover are arcs on a circle; the box is the complement of the widest empty gap between them. */
function partBoxes(g, out) {
  const polys = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const p of polys) {
    const r = p[0]; if (!r || !r.length) continue;
    let w = 180, s = 90, e = -180, n = -90;
    for (const c of r) { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; }
    out.push([w, s, e, n]);
  }
  return out;
}
export function narrowBox(boxes) {
  if (!boxes.length) return null;
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
  return [round2(best.w), round2(s), round2(best.e), round2(n)];
}

/** → the index object (what data/polity-arcs.json holds) */
export async function build(opt = {}) {
  const { mapReader } = await import('./history-pages.mjs');
  const { july1, partsOfTier, recordOf } = await import('./year-choice.mjs');
  const { areaKm2 } = await import('../js/year-book.js');
  const R = await mapReader();
  const B = R.bands;
  const eras = readBundle('data/hist-eras.js'), clio = readBundle('data/hist-clio.js');
  const sheetYears = new Set(eras.snaps.map((s) => s.y));
  /* the days the map's world changes, as the map itself lists them (js/time-borders.js `changeDates`: Cliopatria's rows, the
     moves from one sheet to the next, OpenHistoricalMap's and CShapes' edges). It lists only the records already open, so
     one instant in each band is read first. Below 1689 every one is a 1 January (a year), so 1 July of it reads the new state. */
  for (const y of [clio.window[0], B.ohmFrom, B.csFrom]) await R.labelsAt(july1(y));
  const changed = (await R.api.changeDates()).map((d) => d.getFullYear());
  /* ⚠ …and the years the coast pieces (data/hist-coast-snap.js) begin and end, which `changeDates` does not list. MEASURED
     2026-10-08: the drawn areas of Han Dynasty, Mahan, Goths … differ between 1 July 150 and 1 July 151 (the coast pieces are
     judged again where the sheet the map shows changes), and 151 is in no list `changeDates` returns — so the Chronos
     stepper does not stop there either (dev-notes/2026-10-08-hist-product.md). Read here from the bundle the map composes,
     until `changeDates` lists them; then this line adds nothing. */
  for (const f of readBundle('data/hist-coast-snap.js').feats) { changed.push(f[2]); changed.push(f[5]); }
  const at = instants(B, [...sheetYears], changed);
  const years = opt.years ? at.filter((y) => opt.years.includes(y)) : at;
  const skipped = { described: 0, unnamed: 0, sheetFill: 0 };
  /* polity name (as the map writes it in English) → its accumulators */
  const P = new Map();
  const src = { clio: clio.src, ohm: readBundle('data/hist-borders.js').src, cshapes: readBundle('data/cshapes.js').src, sheet: eras.src };
  for (let yi = 0; yi < years.length; yi++) {
    const y = years[yi];
    const r = await R.labelsAt(july1(y));
    if (!r || r.modern || !r.fc) throw new Error('polity-arcs: the map answered nothing for ' + y + ' — a record did not load');
    const parts = partsOfTier(r.tier);
    const isSheet = sheetYears.has(y);
    const here = new Map();   /* en → { km, mask, sk, boxes } at this instant */
    r.fc.features.forEach((f, i) => {
      const p = f.properties || {};
      const en = r.labels.en[i];
      if (!en) { skipped.unnamed++; return; }
      if (p._desc) { skipped.described++; return; }
      const rec = recordOf(p, parts);
      const bit = DATED.indexOf(rec);
      if (bit < 0 && !isSheet) { skipped.sheetFill++; return; }   /* a sheet's piece between sheet years states no year (header) */
      let h = here.get(en);
      if (!h) { h = { km: 0, mask: 0, sk: 0, boxes: [], jp: r.labels.jp[i], qids: new Set() }; here.set(en, h); }
      const km = areaKm2(f.geometry);
      if (bit >= 0) { h.km += km; h.mask |= 1 << bit; } else h.sk += km;
      if (p._qid) h.qids.add(String(p._qid));
      partBoxes(f.geometry, h.boxes);
    });
    for (const [en, h] of here) {
      let A = P.get(en);
      if (!A) { A = { n: en, jp: new Map(), q: new Set(), d: [], s: [], boxes: [], peak: null, last: null }; P.set(en, A); }
      if (h.jp && h.jp !== en) A.jp.set(h.jp, (A.jp.get(h.jp) || 0) + 1);
      for (const q of h.qids) A.q.add(q);
      const km = Math.round(h.km);
      if (h.mask) {
        /* a change point only where the rounded area or the records change (an absence was closed by a 0 point below) */
        const prev = A.d[A.d.length - 1];
        if (!prev || prev[1] !== km || prev[2] !== h.mask) A.d.push([y, km, h.mask]);
        A.last = { yi, km };
        const bb = narrowBox(h.boxes);
        if (!A.peak || km > A.peak.km) A.peak = { y, km, mask: h.mask, bb };   /* the earliest instant of the largest area */
      }
      if (h.sk >= 0.5 && isSheet) A.s.push([y, Math.round(h.sk)]);
      for (const b of h.boxes) A.boxes.push(b);
      if (A.boxes.length > 4096) A.boxes = [narrowBox(A.boxes)];   /* folded as it grows: the narrow box of boxes is the narrow box of their union */
    }
    /* a polity drawn at the previous instant and not at this one ends here */
    for (const A of P.values()) {
      if (A.last && A.last.yi === yi - 1 && !(here.get(A.n) && here.get(A.n).mask)) { A.d.push([y, 0, 0]); A.last = { yi: yi - 1, km: 0, closed: true }; }
    }
    if (opt.progress && yi % 100 === 0) process.stderr.write('  ' + y + ' (' + yi + '/' + years.length + ')\n');
  }
  const arcs = [];
  for (const A of P.values()) {
    if (!A.d.length && !A.s.length) continue;
    const o = { n: A.n };
    const jp = [...A.jp.entries()].sort((a, b) => b[1] - a[1])[0];
    if (jp) o.j = jp[0];
    if (A.q.size) o.q = [...A.q].sort();
    if (A.d.length) o.d = A.d;
    if (A.s.length) o.s = A.s;
    o.bb = narrowBox(A.boxes);
    if (A.peak) o.pk = [A.peak.y, A.peak.km, A.peak.mask, A.peak.bb];
    else { const top = A.s.reduce((b, x) => (x[1] > b[1] ? x : b), A.s[0]); o.pk = [top[0], top[1], 0, o.bb]; }
    arcs.push(o);
  }
  /* largest drawn extent first, then by name — the order the sheet lists them in when nothing is asked */
  arcs.sort((a, b) => b.pk[1] - a.pk[1] || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));
  return {
    v: V, recs: DATED, src,
    instants: { sheets: [...sheetYears].filter((y) => y <= B.csTo).sort((a, b) => a - b), clioFrom: clio.window[0], dayFrom: B.ohmFrom, csFrom: B.csFrom, to: B.csTo, at: 'July 1' },
    skipped, arcs,
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const t0 = Date.now();
  if (process.argv.includes('--show')) {
    const name = arg('--show');
    const idx = JSON.parse(readFileSync(join(ROOT, OUT), 'utf8'));
    const a = idx.arcs.find((x) => x.n === name || x.j === name || (x.q || []).includes(name));
    if (!a) { console.error('no polity named ' + name); process.exit(1); }
    console.log(JSON.stringify(a));
    process.exit(0);
  }
  const idx = await build({ progress: true });
  const text = JSON.stringify(idx) + '\n';
  if (process.argv.includes('--check')) {
    const was = readFileSync(join(ROOT, OUT), 'utf8');
    if (was !== text) { console.error('polity-arcs: ' + OUT + ' does not match the bundles — run node scripts/build-polity-arcs.mjs'); process.exit(1); }
    console.log('polity-arcs: ' + OUT + ' matches the bundles (' + idx.arcs.length + ' polities, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  } else {
    writeFileSync(join(ROOT, OUT), text);
    console.log('polity-arcs: wrote ' + OUT + ' — ' + idx.arcs.length + ' polities, ' + (text.length / 1024).toFixed(0) + ' KB, skipped ' + JSON.stringify(idx.skipped) + ' (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
  }
}
