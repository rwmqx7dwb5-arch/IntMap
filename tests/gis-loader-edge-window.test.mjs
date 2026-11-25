/* gis-loader — an Edge runtime may define `window` itself (an accessor that returns the global object and cannot be assigned).
   Observation 2026-11-26 (production, PR #1431): every data.gis task failed `gis_unavailable:scope-conflict` because the loader
   assigned its own object to `window`, the assignment did nothing, and the GIS runtime then found a window that was not the scope handed to it.
   The loader must adopt a window that is already there. */
import test from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'window', { get() { return globalThis; }, configurable: true });

test('loadGis works when the host already has a window it will not let us replace', async () => {
  const { loadGis } = await import('../supabase/functions/_shared/gis-loader.js');
  const gis = await loadGis();
  assert.ok(gis && gis.flow, 'the GIS came up');
  const { makeHeadlessGis } = await import('../supabase/functions/_shared/gis-headless.js');
  const h = makeHeadlessGis({ loadGis, now: () => Date.now() });
  const pt = (k, x) => ({ type: 'Feature', properties: { [k]: x }, geometry: { type: 'Point', coordinates: [x, 0] } });
  const r = await h.run({ op: 'nearestJoin', inputs: [[pt('a', 1), pt('a', 5)], [pt('b', 2)]], params: {} });
  assert.equal(r.features.length, 2);
});
