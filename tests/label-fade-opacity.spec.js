// Two behaviours, measured in a real browser:
//  1. a name that stands for a region goes once that region fills the view — country names, province names — by one rule
//     (IntMapCountryExtent.gone / applyGone), not by any name or layer;
//  2. the Objects list's Opacity slider moves an area fill across a visible range, 0..FILL_AT_FULL, through the one setter
//     the panel and Atlas's `object` capability both end in (IntMapObjects.set).
import { test, expect } from '@playwright/test';
import { bootPage } from './helpers/app.js';

test.describe.configure({ mode: 'serial' });
let page;
test.beforeAll(async ({ browser }) => { page = await browser.newPage({ viewport: { width: 1280, height: 820 } }); await bootPage(page); });
test.afterAll(async () => { await page.close(); });

const goneNames = (layer) => page.evaluate((id) => {
  const f = window.IntMapGeoEngine.layers.getFilter(id); const s = JSON.stringify(f || []);
  const m = /"!",\["in",\[[^\]]*\],\["literal",(\[[^\]]*\])\]/.exec(s); return m ? JSON.parse(m[1]) : [];
}, layer);

async function view(center, zoom) {
  await page.evaluate(({ c, z }) => {
    const G = window.IntMapGeoEngine;
    for (const id of ['ofm-country', 'ofm-admin1']) { try { G.layers.setLayout(id, 'visibility', 'visible'); } catch (_) {} }
    G.camera.jumpTo({ center: c, zoom: z });
  }, { c: center, z: zoom });
  await page.waitForFunction(() => window.IntMapGeoEngine.render.isIdle ? true : true);
  await page.waitForTimeout(2500);
}

test('① a country name is on the map while the country is wider than the view, and gone once the view is inside it', async () => {
  await view([2.5, 46.5], 3.2);
  const wide = await goneNames('ofm-country');
  await view([2.5, 46.5], 8);
  await expect.poll(() => goneNames('ofm-country'), { timeout: 15000 }).not.toEqual([]);
  const deep = await goneNames('ofm-country');
  expect(deep.filter((n) => !wide.includes(n)).length).toBeGreaterThan(0);   // a name that was shown while the country was wider than the view
  await view([2.5, 46.5], 3.2);
  await expect.poll(() => goneNames('ofm-country'), { timeout: 15000 }).toEqual(wide);   // zooming back out brings it back
});

test('② a province name goes by the same rule', async () => {
  await view([139.7, 35.7], 4.2);
  const wide = await goneNames('ofm-admin1');
  await view([139.7, 35.7], 9.5);
  await expect.poll(() => goneNames('ofm-admin1'), { timeout: 30000 }).not.toEqual([]);
  expect((await goneNames('ofm-admin1')).filter((n) => !wide.includes(n)).length).toBeGreaterThan(0);
});

test('③ Objects opacity: an area fill spans a visible range and 100 % is dense', async () => {
  const r = await page.evaluate(async () => {
    const G = window.IntMapGeoEngine;
    G.camera.jumpTo({ center: [2.5, 2.5], zoom: 5 });
    const geom = { type: 'Polygon', coordinates: [[[0, 0], [5, 0], [5, 5], [0, 5], [0, 0]]] };
    const id = window.IntMapAnnotations.add(geom, { color: '#ff3b30' });
    await new Promise((res) => setTimeout(res, 600));
    const O = window.IntMapObjects; const out = {};
    const fillOp = () => { const f = G.coords.querySourceFeatures('annot-src'); return f.length ? f[0].properties.op : null; };
    out.initial = fillOp();
    for (const v of [0.1, 0.5, 1]) { O.set(id, { opacity: v }); await new Promise((res) => setTimeout(res, 400)); out['o' + v] = fillOp(); }
    out.alphaListed = O.getObj(id).opacity;
    return out;
  });
  expect(r.o1).toBeGreaterThanOrEqual(0.8);
  expect(r.o0_5 ?? r['o0.5']).toBeGreaterThan(r['o0.1'] * 3);
  expect(r.o1 - r['o0.1']).toBeGreaterThan(0.5);
  expect(r.alphaListed).toBe(1);
});
