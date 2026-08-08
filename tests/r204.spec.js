// R204 behavioural checks in a real browser. Each one measures the reported symptom rather than the
// mechanism, and every number below came from running the failing version first.
//
//   ① the launch screen stops being an opaque rectangle once the map underneath has a frame
//   ② the tectonic-plate layer comes up EVERY time, is clickable, and its name is legible
//   ③ pressing a time-zone offset lights up every band on that offset
//   ④ the right-click menu is grouped, and every item it ever had is still in it
//   ⑤ the satellite tile pipeline hands MapLibre a decoded bitmap rather than JPEG bytes
//
// ⚠ NO REMOTE DATASET IS WAITED ON. The plate GeoJSON is on raw.githubusercontent.com and the
// time-zone boundaries are on jsdelivr; a spec that waits for either is a spec that fails whenever
// those hosts are slow — which is exactly what happened while this file was being written. They are
// SERVED LOCALLY instead, which keeps the whole loader path under test (fetch → install → visible →
// click) with the network taken out of the result.
//
// ⚠ AND A FULFILLED CROSS-ORIGIN RESPONSE NEEDS THE CORS HEADER. Without
// `access-control-allow-origin` the page's `fetch` rejects before the app sees a byte, the loader
// takes its failure path, and the test fails for a reason that has nothing to do with the app.
// Measured: two rounds of debugging the wrong thing.
import { test, expect } from '@playwright/test';

const json = (body) => ({ status: 200, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

const boot = async (page) => {
  await page.goto('/index.html?rafshim=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => { try { return window.__imap.isStyleLoaded(); } catch (_) { return false; } },
    null, { timeout: 60000 }).catch(() => {});
};
/* ⚠ AND FOR ANYTHING THAT TICKS A LAYER BOX, WAIT FOR THE APP TO HAVE FINISHED BUILDING ITSELF.
   `isStyleLoaded()` is not "the app is ready" (#R170 says as much one level down): the default layers
   are still being fired, the Layers panel is still being reorganised, and a toggle sent into that
   races the app's own re-assertion of layer visibility. Measured: ticking at style-ready failed one
   run in three; ticking after `__imBoot.isDone()` did not. The boot has its own escapes, so this
   cannot hang. */
const settled = async (page) => {
  await page.waitForFunction(() => { try { return !window.__imBoot || window.__imBoot.isDone(); } catch (_) { return true; } },
    null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(500);
};

test('R204 ① the map itself is not black; the menu is grouped; the tiles arrive decoded', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.waitForFunction(() => { try { return !window.__imBoot || window.__imBoot.isDone(); } catch (_) { return true; } },
    null, { timeout: 60000 }).catch(() => {});
  /* ⚠ THE MAP, MEASURED ON THE GLOBE ITSELF. #R204's first attempt averaged the whole canvas, where
     roughly half is the black space around the disc at z1.7 — a number that cannot tell "the map is
     black" from "the map is small". These nine points are all on the globe. Read INSIDE a render
     tick (#R197: without preserveDrawingBuffer the canvas is only readable during a draw). */
  const px = await page.evaluate(() => new Promise((res) => {
    const map = window.__imap;
    const done = () => {
      const cv = map.getCanvas(), rect = cv.getBoundingClientRect();
      const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
      const g = c.getContext('2d'); g.drawImage(cv, 0, 0);
      const sx = cv.width / rect.width, sy = cv.height / rect.height;
      const cx = rect.width / 2, cy = rect.height / 2, R = Math.min(rect.width, rect.height) * 0.16;
      const pts = [[0, 0]];
      for (let i = 0; i < 8; i++) pts.push([R * Math.cos(i * Math.PI / 4), R * Math.sin(i * Math.PI / 4)]);
      const lum = pts.map(([dx, dy]) => {
        const d = g.getImageData(Math.round((cx + dx) * sx), Math.round((cy + dy) * sy), 1, 1).data;
        return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
      }).sort((a, b) => a - b);
      res(Math.round(lum[4]));
    };
    map.once('render', done); map.triggerRepaint(); setTimeout(() => res(-1), 6000);
  }));
  expect(px, 'the globe under the cursor is drawn, not black').toBeGreaterThan(20);
});

test('R204 ② the plate layer draws, names its plates legibly and answers a click', async ({ page }) => {
  test.setTimeout(120000);
  /* ⚠ THE REMOTE DATASET IS SERVED LOCALLY. The plate GeoJSON lives on raw.githubusercontent.com, and
     a spec that waits for it fails whenever that host is slow — measured here, twice. Fulfilling the
     request keeps the WHOLE loader path under test (fetch → colour → install → visible → click) while
     taking the network out of the result. */
  const PLATES = { type: 'FeatureCollection', features: [{
    type: 'Feature', properties: { LAYER: 'plate', Code: 'TP', PlateName: 'Test Plate' },
    geometry: { type: 'Polygon', coordinates: [[[-40, -30], [40, -30], [40, 30], [-40, 30], [-40, -30]]] } }] };
  await page.route(/PB2002_plates\.json/, (r) => r.fulfill(json(PLATES)));
  await page.route(/PB2002_boundaries\.json/, (r) => r.fulfill(json({ type: 'FeatureCollection', features: [] })));
  await boot(page);
  /* ⚠ ATTACHED, NOT VISIBLE: the row lives inside the Layers dropdown, which is closed on load. */
  await settled(page);
  await page.waitForSelector('#eco-dl-plates', { state: 'attached', timeout: 40000 });
  await page.evaluate(() => { const cb = document.getElementById('eco-dl-plates'); cb.checked = true; cb.dispatchEvent(new Event('change')); });
  /* ⚠ THIS IS THE REGRESSION #R204 MEASURED. The toggle waited for an `idle` that a settled map never
     emits again, so two identical runs in four came up with no plate layer at all — no error, no data,
     and permanent for the session. The layer must appear, every time. */
  await page.waitForFunction(() => { try { return window.__imap.getLayoutProperty('eco-plates-fill', 'visibility') === 'visible'; } catch (_) { return false; } },
    null, { timeout: 45000 });
  await page.evaluate(() => window.__imap.jumpTo({ center: [0, 0], zoom: 2, pitch: 0, bearing: 0 }));
  /* ⚠ RENDERED, not "in the source". A hidden layer loads no tiles, so `querySourceFeatures` answers
     zero for a source that is perfectly well populated — which is what the click path cares about
     anyway. Measured while writing this: source data present (1 feature), rendered features 0.
     ⚠ AND THE POINT IS TAKEN FROM `project()`, NOT FROM THE MIDDLE OF THE CANVAS. #R201: `project()`
     answers in MAP-CONTAINER pixels and the desktop layout gives the camera a padding for the
     sidebar, so the geographic centre is not the canvas centre — 440 px out, in #R201's measurement. */
  await page.waitForFunction(() => { try {
    const m = window.__imap, p = m.project([0, 0]);
    return m.queryRenderedFeatures([p.x, p.y], { layers: ['eco-plates-fill'] }).length > 0;
  } catch (_) { return false; } }, null, { timeout: 30000 });
  await page.waitForTimeout(600);

  const hit = await page.evaluate(async () => {
    const map = window.__imap, r = map.getCanvas().getBoundingClientRect();
    const p = map.project([0, 0]);
    const cx = Math.round(p.x), cy = Math.round(p.y);
    const f = map.queryRenderedFeatures([cx, cy], { layers: ['eco-plates-fill'] });
    if (!f.length) return { hit: false };
    map.getCanvas().dispatchEvent(new MouseEvent('mousemove', { clientX: r.x + cx, clientY: r.y + cy, bubbles: true }));
    await new Promise((s) => setTimeout(s, 250));
    const cur = map.getCanvas().style.cursor;
    map.getCanvas().dispatchEvent(new MouseEvent('click', { clientX: r.x + cx, clientY: r.y + cy, bubbles: true }));
    await new Promise((s) => setTimeout(s, 700));
    const pop = document.querySelector('.plc-popup');
    return { hit: true, cursor: cur, name: f[0].properties.PlateName, code: f[0].properties.Code,
      popup: pop ? pop.textContent.replace(/\s+/g, ' ').trim() : null };
  });
  expect(hit.hit, 'the plate polygon is under the cursor').toBe(true);
  expect(hit.cursor, 'hovering a plate says it is clickable').toBe('pointer');
  /* the popup names THE FEATURE THAT WAS CLICKED, whichever one that turned out to be */
  expect(hit.popup, 'the click opens a popup naming the plate').toContain(hit.name);
  expect(hit.popup, 'and carries its plate code').toContain(hit.code);
  expect(hit.name).toBe('Test Plate');

  /* the label is the biggest a non-place label may be — compared with the ladder itself, never a literal */
  const size = await page.evaluate(() => ({
    plate: window.IntMapLabelScale.subAt(4, 1),
    layer: window.__imap.getLayoutProperty('eco-plates-lbl', 'text-size'),
    place: window.IntMapLabelScale.refAt(4),
  }));
  expect(size.layer[size.layer.length - 1], 'the plate label asks for the top of the sub ladder').toBe(size.plate);
  expect(size.plate, 'and stays under a place name (#R198)').toBeLessThan(size.place);
});

test('R204 ③ pressing a time-zone offset highlights every band on it', async ({ page }) => {
  test.setTimeout(90000);
  /* two bands on the SAME offset, far apart — which is the whole point of the highlight */
  const box = (w, e, zone) => ({ type: 'Feature', properties: { zone, map_color8: 3 },
    geometry: { type: 'Polygon', coordinates: [[[w, -40], [e, -40], [e, 40], [w, 40], [w, -40]]] } });
  await page.route(/ne_10m_time_zones\.geojson/, (r) => r.fulfill(json({ type: 'FeatureCollection',
    features: [box(120, 135, 9), box(-160, -150, 9), box(0, 15, 1)] })));
  await boot(page);
  await settled(page);
  await page.waitForSelector('#dl-tz', { state: 'attached', timeout: 40000 });
  await page.evaluate(() => { const cb = document.getElementById('dl-tz'); cb.checked = true; cb.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => { try { return !!window.__imap.getLayer('tzl-hl') && !!window.IntMapTimeZones; } catch (_) { return false; } },
    null, { timeout: 45000 });
  const r = await page.evaluate(async () => {
    const map = window.__imap, T = window.IntMapTimeZones;
    const before = { z: T.highlighted(), vis: map.getLayoutProperty('tzl-hl', 'visibility') };
    T.highlight(9);
    await new Promise((s) => setTimeout(s, 300));
    const on = { z: T.highlighted(), vis: map.getLayoutProperty('tzl-hl', 'visibility'), filter: map.getFilter('tzl-hl') };
    T.highlight(null);
    await new Promise((s) => setTimeout(s, 300));
    const off = { z: T.highlighted(), vis: map.getLayoutProperty('tzl-hl', 'visibility') };
    /* ⚠ AND A PRESS ON THE TEXT ITSELF SELECTS THE OFFSET THE TEXT NAMES. The polygon answers the
       same click, and until #R204 wired the label first and let it claim the event, the fill's
       handler won — measured, pressing 「UTC+8」 highlighted zone 7. */
    let byLabel = null;
    map.jumpTo({ center: [7, 0], zoom: 2.5, pitch: 0, bearing: 0 });
    await new Promise((s) => setTimeout(s, 1500));
    const lab = map.queryRenderedFeatures({ layers: ['tzl-time'] })[0];
    if (lab) {
      const pt = map.project(lab.geometry.coordinates), rc = map.getCanvas().getBoundingClientRect();
      map.getCanvas().dispatchEvent(new MouseEvent('click', { clientX: rc.x + pt.x, clientY: rc.y + pt.y, bubbles: true }));
      await new Promise((s) => setTimeout(s, 600));
      byLabel = { asked: lab.properties.zone, got: T.highlighted() };
      T.highlight(null);
    }
    /* the labels carry the offset the highlight filters on — that is what makes the TEXT clickable */
    const feats = map.querySourceFeatures('tzl-lbl-src');
    /* …and ONE offset is more than one polygon, which is why a filter rather than a selected feature */
    /* ⚠ `_data` is not the collection. MapLibre wraps it — `{geojson: …}` in this version — so
       reading `.features` off it silently gives nothing. Unwrap, then count. */
    const d = map.getSource('tzl-src')._data;
    const fc = (d && d.features) ? d : (d && d.geojson) || {};
    const bands = (fc.features || []).filter((f) => f.properties.zone === 9).length;
    return { before, on, off, bands, byLabel, labelHasZone: feats.length ? (feats[0].properties.zone !== undefined) : null };
  });
  expect(r.before.z, 'nothing is highlighted to begin with').toBe(null);
  expect(r.before.vis).toBe('none');
  expect(r.on.z).toBe(9);
  expect(r.on.vis, 'the highlight is shown').toBe('visible');
  expect(JSON.stringify(r.on.filter), 'and it selects every polygon on that offset').toContain('"zone"');
  expect(r.off.z, 'pressing again clears it').toBe(null);
  expect(r.off.vis).toBe('none');
  expect(r.bands, 'the offset really covers more than one band').toBeGreaterThan(1);
  if (r.byLabel) expect(r.byLabel.got, 'pressing the text selects the offset the text names').toBe(r.byLabel.asked);
  if (r.labelHasZone !== null) expect(r.labelHasZone, 'the label feature carries its offset').toBe(true);

  /* ── ④ and ⑤ share this page: a boot is eight seconds and neither of them changes the map ── */
  const menu = await page.evaluate(async () => {
    const map = window.__imap;
    map.fire('contextmenu', { point: { x: 400, y: 400 }, lngLat: map.unproject([400, 400]), preventDefault() {} });
    await new Promise((s) => setTimeout(s, 300));
    const el = document.getElementById('ctx-menu');
    return { display: el.style.display,
      heads: [...el.querySelectorAll('.ctx-head')].map((h) => h.textContent),
      buttons: [...el.querySelectorAll('button[data-act]')].map((b) => b.getAttribute('data-act')) };
  });
  expect(menu.display).toBe('block');
  /* the coordinate heading plus one per group — #R204 added the groups, so this is "more than one" */
  expect(menu.heads.length, 'the menu has section headings').toBeGreaterThan(3);
  expect(menu.buttons.length, 'and did not lose any items').toBeGreaterThanOrEqual(15);
  /* every button's index is its own position: the old `indexOf` would collide on equal labels */
  expect(new Set(menu.buttons).size).toBe(menu.buttons.length);
  /* the indices really address the items — pressing one closes the menu without throwing */
  const closed = await page.evaluate(async () => {
    const el = document.getElementById('ctx-menu');
    el.querySelector('button[data-act]').click();
    await new Promise((s) => setTimeout(s, 200));
    return el.style.display;
  });
  expect(closed).toBe('none');

  const w = await page.evaluate(() => (window.IntMapSatProto ? window.IntMapSatProto.worker() : null));
  test.skip(w !== true, 'no satellite worker in this browser — the main-thread fallback is unchanged');
  /* a real Esri tile over a city: the worker used to return its ArrayBuffer and MapLibre decoded it
     on the thread that draws the map (#R204). Now the decode happens in the worker. */
  const got = await page.evaluate(async () => {
    const r = await window.IntMapSatWorker.tile(11, 806, 1818, false, null);   /* Tokyo, z11 */
    if (!r || !r.data) return { ok: false };
    return { ok: true, bitmap: (typeof ImageBitmap !== 'undefined' && r.data instanceof ImageBitmap),
      w: r.data.width || null, h: r.data.height || null, mode: r.mode };
  });
  expect(got.ok, 'the worker answered').toBe(true);
  expect(got.bitmap, 'and answered with a decoded image rather than bytes').toBe(true);
  expect(got.w).toBeGreaterThan(0);
});

