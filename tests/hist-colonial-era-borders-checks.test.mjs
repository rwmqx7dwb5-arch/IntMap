/* ============================================================================
 *  (hist-colonial-era-borders) from 1886 the composition is CShapes → OpenHistoricalMap → Cliopatria.
 *  CShapes states sovereign states, so on 1886-01-01 the colonial blocs OpenHistoricalMap states (the
 *  Congo Free State, German East Africa, Greenland under Denmark…) left the map: measured on the gate's
 *  grid, 85.8% of the world's land inside a drawn polity on 1 July 1885 and 79.1% a year later.
 *  scripts/build-hist-clio.mjs --ohm-late writes data/hist-borders-late.js (OHM less CShapes' ground, on
 *  their own days) and cuts Cliopatria against both; js/time-borders.js `csComposite` draws the union and
 *  scripts/hist-fidelity.mjs `politiesAt` measures it. Asked of the shipped files, of the gate's own
 *  measure and of the page's module run in node — never of the source text.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LATE_TOP } from '../scripts/build-hist-clio.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (rel, g) => { const w = {}; new Function('window', readFileSync(join(ROOT, rel), 'utf8'))(w); return w[g]; };
const haveEras = existsSync(join(ROOT, 'data', 'hist-eras.js'));
/* even-odd point in a polygon list ([[ring, hole…], …]) */
const inPolys = (polys, [x, y]) => polys.some((poly) => poly.reduce((inside, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c ? !inside : inside;
}, false));
/* a point of Greenland's interior, far from any coast */
const GREENLAND = [-42, 72];

test('① the late record runs from the first year of CShapes to LATE_TOP, on ground CShapes does not state that day', { skip: !haveEras && 'data/hist-eras.js is not pulled (npm run data:pull)' }, async () => {
  const L = load('data/hist-borders-late.js', '__HISTBLATE');
  assert.deepEqual(L.window, [1886, LATE_TOP]);
  assert.equal(L.end, 'exclusive');
  /* on the gate's grid, the cells both CShapes and the late record draw — measured 2026-10-05: 0.06–0.08% of the
     late record's cells (islands smaller than the cut's three-cell rule, kept as #991 keeps them for Cliopatria) */
  const { politiesAt } = await import('../scripts/hist-fidelity.mjs');
  const { measure } = await import('../js/hist-knowledge.js');
  for (const y of [1886, 1890, 1900, 1914, 1920]) {
    const ps = politiesAt(y), cs = ps.filter((p) => p.rec === 'cshapes'), ol = ps.filter((p) => p.rec === 'ohm-late');
    const a = Int32Array.from(measure(cs, [], 0.25).cells.cid), b = measure(ol, [], 0.25).cells.cid;
    let n = 0, both = 0; for (let k = 0; k < b.length; k++) if (b[k] >= 0) { n++; if (a[k] >= 0) both++; }
    assert.ok(n > 0 && both / n < 0.01, `${y}: ${both} of ${n} late cells are CShapes' too`);
  }
});

test('② the gate measures the composition: OHM adds land from 1886, and Greenland and the colonial blocs are drawn', { skip: !haveEras && 'data/hist-eras.js is not pulled (npm run data:pull)' }, async () => {
  const { polityLandAt, politiesAt } = await import('../scripts/hist-fidelity.mjs');
  for (const y of [1886, 1890, 1900, 1914]) {
    const without = polityLandAt(y, { late: false }), withOhm = polityLandAt(y);
    assert.ok(withOhm > without, `${y}: ${withOhm.toFixed(2)}% with OpenHistoricalMap, ${without.toFixed(2)}% without`);
  }
  /* (measured 2026-10-05) 1886: 79.07% → 83.68%. The 1885 figure (85.76%) is still above it: the rest is the
     year sheet that answers below 1886 and not from it (Arabia, Sokoto, Kong… on the 1880 sheet) — see the dev-note. */
  const late1886 = new Set(politiesAt(1886).filter((p) => p.rec === 'ohm-late').map((p) => p.nm));
  for (const n of ['Congo Free State', 'German East Africa', 'Portuguese Angola', 'French Congo', 'Denmark'])
    assert.ok(late1886.has(n), n + ' is drawn by OpenHistoricalMap in 1886');
  const drawnBy = (y, pt) => politiesAt(y).filter((p) => inPolys(p.polys, pt)).map((p) => p.rec + ':' + p.nm);
  for (const y of [1886, 1890, 1900, 1914]) {
    const g = drawnBy(y, GREENLAND);
    assert.ok(g.includes('ohm-late:Denmark'), `${y}: Greenland is drawn, as Denmark's, by OpenHistoricalMap (${g.join(', ') || 'nothing'})`);
  }
});

test('③ the page composes CShapes, then OpenHistoricalMap, then Cliopatria, and cites them in that order', { skip: !haveEras && 'data/hist-eras.js is not pulled (npm run data:pull)' }, async () => {
  const { timeBorders } = await import('../scripts/histeras/time-borders.mjs');
  const { repoFetch } = await import('../scripts/hist-fidelity.mjs');
  const { api } = await timeBorders({ lang: 'en', fetch: repoFetch });
  const at = (y, m, d) => { const w = new Date(0); w.setFullYear(y, m - 1, d); w.setHours(12, 0, 0, 0); return w; };
  const r = await api.collectionAt(at(1886, 7, 1));
  assert.equal(r.tier, 'composite');
  const ps = r.fc.features.map((f) => f.properties);
  assert.ok(ps.some((p) => p._gw != null), 'CShapes answers first');
  for (const n of ['Congo Free State', 'German East Africa', 'Denmark']) assert.ok(ps.some((p) => p._rec === 'ohm' && p.NAME === n), n + ' is drawn by OpenHistoricalMap in 1886');
  const tiers = r.record.parts.map((x) => x.tier);
  assert.equal(tiers[0], 'cshapes'); assert.equal(tiers[1], 'ohm');
  if (tiers.length > 2) assert.equal(tiers[2], 'clio');
  assert.ok(/OpenHistoricalMap/.test(r.record.parts[1].src) && /CC0/.test(r.record.parts[1].src), 'the composed world cites the late OHM record by its own src');
  /* past LATE_TOP the record has no rows, and the answer is CShapes with Cliopatria as before */
  const after = await api.collectionAt(at(LATE_TOP + 2, 7, 1));
  assert.ok(!after.fc.features.some((f) => f.properties._rec === 'ohm'), `no OpenHistoricalMap row after ${LATE_TOP}`);
  /* an OHM edge on CShapes' days is a DAY */
  assert.equal(api.changePrecision(at(1890, 7, 1)), 'day');
});
