/* ============================================================================
 *  gis-buffer-worker — the buffer op answers the same on the page's thread and in the worker
 * ----------------------------------------------------------------------------
 *  ⚠ A REAL BROWSER, because the worker is src/gis-buffer-worker.js as the bundler emits it (a module
 *  worker with polygon-clipping inside it), and that is the one thing node cannot be asked about.
 *  What is measured is not 「worker が使われた」 — the op's own note says that, and an op that computed
 *  here and said `used` would pass it — but that EVERY feature's output is the byte-for-byte answer the
 *  page's kernel gives for it (許容幅 0): points on the seam and at a pole, a line, a polygon with a hole,
 *  a MultiPoint, and a geometry with nothing to buffer.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test('a buffer run in the worker is byte-for-byte the page kernel\'s answer', async ({ app }) => {
  test.setTimeout(240000);
  const page = app.page;
  const r = await page.evaluate(async () => {
    await window.IntMapLazy.need('gisCore');
    if (!window.IntMapData) return { ok: false, why: 'no IntMapData', have: Object.keys(window).filter((k) => /^IntMap/.test(k)) };
    const GG = window.IntMapGisGeometry;
    await GG.ready();
    let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const feats = [];
    for (let i = 0; i < 2000; i++) feats.push({ type: 'Feature', properties: { id: i }, geometry: { type: 'Point', coordinates: [120 + rnd() * 30, 20 + rnd() * 25] } });
    const ring = (cx, cy, rad, m) => { const o = []; for (let i = 0; i < m; i++) { const t = i / m * 2 * Math.PI; o.push([cx + rad * Math.cos(t) * (1 + 0.2 * Math.sin(5 * t)), cy + rad * Math.sin(t) * (1 + 0.2 * Math.sin(5 * t))]); } o.push(o[0]); return o; };
    for (let i = 0; i < 12; i++) {
      feats.push({ type: 'Feature', properties: { id: 'poly' + i }, geometry: { type: 'Polygon', coordinates: [ring(125 + i, 30, 0.6, 40), ring(125 + i, 30, 0.2, 12).reverse()] } });
      feats.push({ type: 'Feature', properties: { id: 'line' + i }, geometry: { type: 'LineString', coordinates: ring(140, 30 + i * 0.3, 0.4, 30).slice(0, 25) } });
    }
    feats.push({ type: 'Feature', properties: { id: 'seam' }, geometry: { type: 'Point', coordinates: [179.95, 10] } });
    feats.push({ type: 'Feature', properties: { id: 'pole' }, geometry: { type: 'Point', coordinates: [30, 89.95] } });
    feats.push({ type: 'Feature', properties: { id: 'multi' }, geometry: { type: 'MultiPoint', coordinates: [[100, 10], [100.02, 10.01], [101, 11]] } });
    feats.push({ type: 'Feature', properties: { id: 'none' }, geometry: null });
    const ds = (window.IntMapData || window.IntMapGis.data).add({ title: 'b', features: feats });
    const step = { op: 'buffer', inputs: [ds.id], params: { radiusKm: 5 } };

    const gaps = { w: 0 };
    let go = true, last = performance.now();
    const tick = () => { const n = performance.now(); gaps.w = Math.max(gaps.w, n - last); last = n; if (go) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const t0 = performance.now();
    const got = await window.IntMapGisOps.run(step);
    const ms = Math.round(performance.now() - t0);
    go = false;
    if (!got.ok) return { ok: false, why: got.why };
    const want = feats.filter((f) => f.geometry).map((f) => GG.attempt.bufferKm(f.geometry, 5, 64));
    const out = got.dataset.features();
    if (!out.length) return { ok: false, why: "the run registered no rows" };
    const same = out.length === want.filter((w) => w.ok && w.geometry).length
      && out.every((f, i) => JSON.stringify(f.geometry) === JSON.stringify(want.filter((w) => w.ok && w.geometry)[i].geometry));
    return { ok: true, worker: got.stats && got.stats.worker, n: out.length, same, ms, maxGap: Math.round(gaps.w) };
  });
  expect(r.ok, JSON.stringify(r)).toBe(true);
  expect(r.worker, 'the op must say the worker carried it').toMatch(/^used: \d+ of \d+ features$/);
  expect(r.same, 'worker and page kernel disagree').toBe(true);
  console.log('buffer worker spec', JSON.stringify(r));
});
