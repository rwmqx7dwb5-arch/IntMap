/* ============================================================================
 *  gis-chain-audit — the four internal tasks, run end to end in a real page
 * ----------------------------------------------------------------------------
 *  Measured 2026-11-16 by running each task through the shipped doors (IntMapGis.atlas, the project
 *  kernel, IntMapOS.execute) rather than reading the code:
 *    ① acquiring `layer:temp` while the layer was off walked width×height pixels through the
 *       registry's one-position door — one Open-Meteo request per pixel, 91 in 30 s for 16×16 and
 *       unfinished. The row now states a window door (js/map-ui.js `region`), and the window is
 *       asked in blocks of positions.
 *    ② `layer:earthquakes` (and every other features row with no supplier) was listed as a GRID while
 *       undrawn, so its acquisition was refused `bad-param width` — a statement about the camera.
 *    ③ the project kernel (save → change one step → reopen) worked and Atlas had no capability for it.
 *  ⚠ OPEN-METEO IS STUBBED, AND THE STUB IS THE CLAIM: it answers the multi-position form only, so a
 *  regression to one-request-per-pixel shows as a request count, not as a flaky network wait.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

test('the four GIS chains reach their end through the shipped doors', async ({ app }) => {
  const page = app.page;
  const asked = [];
  await page.route(/https:\/\/api\.open-meteo\.com\/v1\/forecast\?.*/, (route) => {
    const u = new URL(route.request().url());
    const lats = (u.searchParams.get('latitude') || '').split(',');
    asked.push(lats.length);
    const one = (i) => ({ latitude: +lats[i], current: { temperature_2m: 10 + i % 7 } });
    const body = lats.length > 1 ? lats.map((_, i) => one(i)) : one(0);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  try {
    const r = await page.evaluate(async () => {
      await window.IntMapLazy.need('gisCore');
      const A = window.IntMapGis.atlas;
      const out = {};
      const cat = await A.catalogue();
      out.kinds = Object.fromEntries(cat.layers.map((row) => [row.ref, row.quantity.payload]));
      // ① a field read as a window while its layer is off
      const t = await A.run({ inputs: ['layer:temp'], acquire: { bounds: [129, 30, 146, 46], width: 16, height: 16 } });
      out.temp = { ok: t.ok, why: t.why || null, count: t.dataset && t.dataset.count };
      // ② a features row nobody has drawn
      const q = await A.run({ inputs: ['layer:earthquakes'], acquire: { bounds: [129, 30, 146, 46] } });
      out.eq = { ok: q.ok, why: q.why || null, param: q.detail && q.detail.param };
      // the buffer → dissolve chain, through Atlas's own door
      const h = await window.IntMapOS.execute('data.gis', { inputs: ['layer:heritage'], acquire: { bounds: [135, 34, 136.5, 35.5] } });
      const hid = h.meta && h.meta.gis && h.meta.gis.dataset;
      const b = await window.IntMapOS.execute('data.gis', { op: 'buffer', inputs: [hid], params: { radiusKm: 10 } });
      const bid = b.meta && b.meta.gis && b.meta.gis.dataset;
      const d = await window.IntMapOS.execute('data.gis', { op: 'dissolve', inputs: [bid] });
      out.chain = { acquired: !!hid, buffered: !!bid, dissolved: !!(d.meta && d.meta.gis && d.meta.gis.dataset), polygons: d.meta && d.meta.gis && d.meta.gis.count };
      // ③ the project, from Atlas
      const s = await window.IntMapOS.execute('data.gisProject', { action: 'save', name: 'gis-chain-audit' });
      const rr = await window.IntMapOS.execute('data.gisProject', { action: 'rerun', dataset: bid, params: { radiusKm: 20 } });
      const ls = await window.IntMapOS.execute('data.gisProject', { action: 'list' });
      const pid = s.meta && s.meta.gisProject && s.meta.gisProject.id;
      const op = await window.IntMapOS.execute('data.gisProject', { action: 'open', id: pid });
      const rm = await window.IntMapOS.execute('data.gisProject', { action: 'remove', id: pid });
      const m = (x) => (x && x.meta && x.meta.gisProject) || {};
      out.project = {
        saved: m(s).ok === true && !!pid,
        rebuilt: (m(rr).rebuilt || []).length,
        listed: (m(ls).projects || []).some((p) => p.id === pid),
        restored: m(op).restored || 0,
        removed: m(rm).ok === true,
      };
      return out;
    });

    expect(r.kinds['layer:earthquakes'], 'a features row is listed as features whether or not it is drawn').toBe('features');
    expect(r.kinds['layer:temp']).toBe('grid');
    expect(r.temp, 'the window is answered').toMatchObject({ ok: true, count: 256 });
    expect(asked.length, 'one request per block of positions, not one per pixel').toBeLessThanOrEqual(3);
    expect(Math.max(...asked), 'positions travel together').toBeGreaterThan(1);
    expect(r.eq.param, 'an undrawn features row is not refused for lacking a grid width').not.toBe('width');
    expect(r.eq.ok).toBe(false);
    expect(r.chain).toMatchObject({ acquired: true, buffered: true, dissolved: true, polygons: 1 });
    expect(r.project).toMatchObject({ saved: true, listed: true, removed: true });
    expect(r.project.rebuilt, 'changing the buffer re-computes it and the dissolve downstream').toBeGreaterThanOrEqual(2);
    expect(r.project.restored).toBeGreaterThan(0);
  } finally {
    await page.unroute(/https:\/\/api\.open-meteo\.com\/v1\/forecast\?.*/);
  }
});
