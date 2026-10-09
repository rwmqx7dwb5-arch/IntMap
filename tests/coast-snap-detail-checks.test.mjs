/* ============================================================================
 *  coast-snap-detail — the land a record's coast left out reaches the BASE MAP'S coastline
 *  (scripts/histclio/coast-snap.mjs `COASTS` / `coastOf` / `Land('osm')` → data/hist-coast-snap.js,
 *   js/time-borders.js `_snapsFor` / `typeNote` / `placeRecords`, js/place-history.js `compose`)
 * ----------------------------------------------------------------------------
 *  Reported on production (build 38fd028): the Asian shore of the Bosporus at Üsküdar — Salacak, Harem, Selimiye to
 *  Kadıköy — was drawn under nothing in 1000, 1500 and 1650 (240 of 919 base-map land points), and the same shape on the
 *  European shore at Beşiktaş. The pieces reached Natural Earth 1:10m's coast, which along the Bosporus is a coarse
 *  straight line inside the shore the base map (OpenStreetMap) draws.
 *    ① the reported shores, a grid point at a time ON THE BASE MAP'S LAND (OpenStreetMap's): every land point is drawn in
 *       1000, 1500 and 1650 — the same boxes counted on the bundle #1039 shipped left 219 (Üsküdar) and 83 (Beşiktaş)
 *       blank in each year
 *    ② the coast each record reaches is the one its terms allow: OpenHistoricalMap and Cliopatria rows reach
 *       OpenStreetMap's, the share-alike records (CShapes, historical-basemaps) keep Natural Earth's — and a piece of a
 *       Cliopatria row at Harem ends ON OpenStreetMap's coastline
 *    ③ the page draws the Harem piece in 1650 under the Ottoman Empire, and its note names OpenStreetMap (en + jp); a
 *       share-alike row's note names Natural Earth
 *    ④ the place timeline at Harem says the coast was matched, and lists 1886 to today (CShapes' coast, Natural Earth's,
 *       stops short of this shore) as a span no record covers
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as CS from '../scripts/histclio/coast-snap.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = (file, g) => { const w = {}; new Function('window', readFileSync(join(ROOT, file), 'utf8'))(w); return w[g]; };
const ymd = (y, m, d) => y * 10000 + m * 100 + d;
let _G = null;
const G = () => _G || (_G = { rows: CS.loadRows().rows, snap: bundle(CS.SNAP_FILE, CS.SNAP_GLOBAL), osm: new CS.Land('osm') });

/* the shores production showed blank (Salacak 29.004/41.021, Harem 29.0105/41.011, Selimiye 29.015/41.004 to Kadıköy;
   Beşiktaş), and the two the first round measured (the old city's tip, the south shore at Kumkapı) */
const SHORES = {
  'Üsküdar to Kadıköy': [28.995, 40.980, 29.045, 41.035],
  'Beşiktaş': [28.990, 41.035, 29.020, 41.050],
  'old city tip': [28.970, 41.000, 28.995, 41.020],
  'Kumkapı': [28.930, 40.995, 28.990, 41.006],
};
test('① the reported shores are drawn on the base map\'s land in 1000, 1500 and 1650 — every point', () => {
  const { rows, snap, osm } = G();
  for (const [nm, box] of Object.entries(SHORES)) for (const y of [1000, 1500, 1650]) {
    const c = CS.portCoverage({ rows, snap, land: osm, box, y, step: 0.001 });
    assert.ok(c.land > 90, nm + ': no base-map land under the box');
    assert.equal(c.drawn + c.snapped, c.land, nm + ' ' + y + ': ' + (c.land - c.drawn - c.snapped) + ' of ' + c.land + ' base-map land points are drawn under nothing');
  }
});

test('② each record reaches the coast its terms allow, and a Cliopatria piece at Harem ends on OpenStreetMap\'s coastline', () => {
  for (const T of CS.TIERS) assert.equal(CS.coastOf(T.t), T.shareAlike ? 'ne' : 'osm', T.t);
  assert.equal(CS.coastOf('cshapes'), 'ne');
  assert.equal(CS.coastOf('sheet'), 'ne');
  assert.equal(CS.coastOf('clio'), 'osm');
  const { snap, osm } = G();
  assert.deepEqual(snap.coasts, Object.fromEntries(CS.TIERS.map((T) => [T.t, CS.coastOf(T.t)])));
  const t = ymd(1650, 7, 1);
  const here = snap.feats.filter((f) => f[9].t === 'clio' && ymd(f[2], f[3], f[4]) <= t && t < ymd(f[5], f[6], f[7]))
    .map((f) => f[8].map((p) => p.map((ri) => snap.rings[ri]))).filter((P) => CS.inPolys(P, 29.0105, 41.011));
  assert.equal(here.length, 1, 'Harem is not inside exactly one Cliopatria piece in 1650');
  /* its shore there is OpenStreetMap's, and none of it is Natural Earth's (which lies inland of it on this shore) */
  const ne = new CS.Land('ne'), V = here[0].flat(2).filter(([x, y]) => x > 29.0 && x < 29.03 && y > 41.0 && y < 41.03);
  const onOSM = V.filter(([x, y]) => osm.coast.on(x, y, 1e-7)).length, onNE = V.filter(([x, y]) => ne.coast.on(x, y, 1e-7) && !osm.coast.on(x, y, 1e-7)).length;
  assert.ok(onOSM >= 5 && onNE === 0, 'the piece at Harem has ' + onOSM + ' vertices on OpenStreetMap\'s coastline and ' + onNE + ' on Natural Earth\'s');
});

test('③ the page draws Harem in 1650 under the Ottoman Empire, and the note names whose coast it is', async () => {
  const { timeBorders } = await import('../scripts/histeras/time-borders.mjs');
  const { repoFetch } = await import('../scripts/hist-fidelity.mjs');
  const { api } = await timeBorders({ lang: 'en', fetch: repoFetch });
  const c = await api.compositeAt(1650, 6, 15);
  const hit = c.fc.features.filter((f) => { const g = f.geometry, P = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return CS.inPolys(P, 29.0105, 41.011); });
  assert.ok(hit.some((f) => f.properties._coastSnap && f.properties._coastSrc === 'osm' && /Ottoman/.test(f.properties.NAME)), 'Harem is not drawn by an Ottoman piece reaching OpenStreetMap\'s coast: ' + hit.map((f) => f.properties.NAME + '/' + f.properties._coastSrc).join(', '));
  assert.match(api.typeNote({ properties: { NAME: 'Ottoman Empire', _coastSnap: 1, _coastSrc: 'osm' } }), /real coastline \(OpenStreetMap, © OpenStreetMap contributors, ODbL\)/);
  assert.match(api.typeNote({ properties: { NAME: 'Turkey', _coastSnap: 1, _coastSrc: 'ne' } }), /real coastline \(Natural Earth 1:10m\)/);
  const { api: jp } = await timeBorders({ lang: 'jp', fetch: repoFetch });
  assert.match(jp.typeNote({ properties: { NAME: 'Ottoman Empire', _coastSnap: 1, _coastSrc: 'osm' } }), /本物の海岸線（OpenStreetMap、© OpenStreetMap contributors、ODbL）/);
});

test('④ the place timeline at Harem: the matched coast is said, and the years after the records\' end are listed', async () => {
  const { harness, historyAt } = await import('../scripts/place-history.mjs');
  const H = await harness('en');
  const rec = await historyAt(H, 29.0105, 41.011);
  const N = rec.nation;
  assert.equal(N.status, 'ok');
  const k = ymd(1650, 7, 1), E = N.entries.find((x) => x.from.k <= k && k < x.to.k);
  assert.ok(E && /Ottoman/.test(E.name), 'Harem has no Ottoman entry in 1650');
  assert.ok(E.notes.some((n) => /OpenStreetMap/.test(n)), 'the 1650 entry does not say whose coast it was matched to');
  /* from 1886 the ground is CShapes', a share-alike record that keeps Natural Earth's coast, which stops short of this shore:
     the years to today are listed as a span no record covers, never closed over (dev-notes 2026-10-08-coast-snap-detail §5) */
  assert.ok(N.gaps.some((g) => g.from === ymd(1886, 1, 1) && g.toNow), 'the years from 1886 to today are not listed: ' + JSON.stringify(N.gaps.slice(-2)));
});
