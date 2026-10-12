#!/usr/bin/env node
/* ============================================================================
 *  territory-change.mjs — «持ち主が変わった土地» for one region and two instants, from the page's own modules   (wave4-atlas)
 * ----------------------------------------------------------------------------
 *  .agents/rules/historical-verification.md §2-1: a historical claim is checked by NAMING a region and two instants
 *  and reading what the map would say, not by a gate's aggregate. This prints exactly what Atlas's
 *  `time.territoryChange` answers — js/territory-change.js `territoryChange` over js/time-borders.js `collectionAt`
 *  evaluated on the shipped records and today's Natural Earth outlines (the journey harness opens both as the page
 *  does). Nothing here re-implements a rule.
 *
 *    node scripts/territory-change.mjs --box w,s,e,n --from 1913 --to 1924 [--step 0.05] [--lang jp|en] [--json]
 *    node scripts/territory-change.mjs --sites     # the comparisons the development record checks
 *    node scripts/territory-change.mjs --bench     # the cost per cell DEFAULT_CELLS is measured from
 *
 *  The sites are the ones dev-notes/2026-10-13-wave4-atlas.md compares with the treaties that moved the land.
 * ==========================================================================*/
import { journeyHarness } from './journey-through-time.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SITES = [
  { name: 'Europe 1913 → 1924 (Versailles, Saint-Germain, Trianon, Riga)', box: [-11, 35, 45, 62], from: '1913', to: '1924' },
  { name: 'Europe 1938-06-15 → 1950 (the Second World War settlement)', box: [-11, 35, 45, 62], from: '1938-06-15', to: '1950' },
  { name: 'East Asia 1904 → 1911 (Portsmouth, the annexation of Korea)', box: [115, 25, 150, 55], from: '1904', to: '1911' },
  { name: 'Africa 1880 → 1914 (the partition)', box: [-20, -36, 52, 38], from: '1880', to: '1914' },
];

export async function harness(lang = 'jp') {
  const H = await journeyHarness(lang);
  const T = await import('../js/territory-change.js');
  /* the harness stubs the page's timers (scripts/histeras/time-borders.mjs), so the rows hand back to a microtask */
  return { T, deps: Object.assign({}, H.deps, { yieldTo: () => Promise.resolve() }), J: H.J };
}
const instantSpec = (s) => (s === 'now' ? { now: true } : /^-?\d+$/.test(s) ? { year: +s } : { date: s });
export async function run(H, box, from, to, stepDeg) {
  return H.T.territoryChange(box, H.J.instantOf(instantSpec(from)), H.J.instantOf(instantSpec(to)), H.deps, { stepDeg });
}
export function printable(R, H, lang) {
  if (R.failed) return '  FAILED ' + R.failed;
  const L = R.lattice, lines = [`  step ${L.step.toFixed(4)}° (≈ ${Math.round(R.stepKm)} km) · ${L.cols}×${L.rows} cells · records ${(R.records.from.src || R.records.from.tier)} → ${(R.records.to.src || R.records.to.tier)}`];
  const nm = (a) => a.map((n) => n.local || n.en).join(' / ');
  for (const t of R.transfers) lines.push(`    ${Math.round(t.km2).toString().padStart(9)} km²  ${nm(t.from)} → ${nm(t.to)}  (${t.shareOfFrom == null ? '' : (t.shareOfFrom * 100).toFixed(1) + '% of giver'}, ${t.pieces.length} piece(s), largest at ${t.pieces[0] ? t.pieces[0].lng.toFixed(2) + ',' + t.pieces[0].lat.toFixed(2) : '—'})${t.comparedByNameOnly ? ' [name only]' : ''}${t.overlap ? ' [overlap]' : ''}`);
  if (R.renamed.length) lines.push('    renamed: ' + R.renamed.map((x) => nm(x.from) + ' → ' + nm(x.to) + ' ' + Math.round(x.km2)).join(' · '));
  if (R.recordOnly.length) lines.push('    drawn at one instant only: ' + R.recordOnly.map((x) => x.side + ':' + nm(x.polity) + ' ' + Math.round(x.km2)).join(' · '));
  lines.push(`    changed ${Math.round(R.totals.changedKm2)} km² of ${Math.round(R.totals.comparedKm2)} km² compared`);
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const lang = arg('--lang') || 'jp', json = process.argv.includes('--json');
  const H = await harness(lang);
  if (process.argv.includes('--bench')) {
    for (const cells of [250000, 1000000, 2000000]) {
      const box = SITES[0].box, step = Math.sqrt(((box[2] - box[0]) * (box[3] - box[1])) / cells);
      await run(H, box, '1913', '1924', 1);   /* the records opened once, so the timing below is the comparison and not the first read */
      const t0 = Date.now(); const R = await run(H, box, '1913', '1924', step); const P = { polys: R.transfers.map((x) => H.T.traceCells(x.cells, R.lattice)).filter((g) => g.length) };   /* the outlines the map is given (js/territory-change.js transferPolys traces each transfer the same way) */ const t1 = Date.now();
      const n = R.lattice.cols * R.lattice.rows;
      console.log(`${n} cells · step ${step.toFixed(4)}° · ${t1 - t0} ms · ${((t1 - t0) * 1000 / n).toFixed(3)} µs/cell (labelled, judged and traced) · ${R.transfers.length} transfers, ${P.polys.length} drawn`);
    }
  } else {
    const jobs = process.argv.includes('--sites') ? SITES
      : [{ name: 'region', box: String(arg('--box') || '').split(',').map(Number), from: String(arg('--from')), to: String(arg('--to') || 'now') }];
    const step = arg('--step') ? +arg('--step') : null;
    for (const s of jobs) {
      const R = await run(H, s.box, s.from, s.to, step);
      if (json) console.log(JSON.stringify(Object.assign({ name: s.name }, H.T.forAtlas(R, lang))));
      else console.log(s.name + '\n' + printable(R, H, lang));
    }
  }
}
