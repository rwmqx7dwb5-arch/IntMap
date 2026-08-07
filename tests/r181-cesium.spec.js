// (#R181) THE SIX DEFECTS, MEASURED IN A REAL BROWSER.
//
// 「Cesium選択時の衛星画像か完全に破損している。」 → 「全部点検して全部直して。」
//
// Every assertion here is a number that was WRONG before this round, taken the same way it was
// taken during the hunt: by asking the live scene, not the source. Three of the six are invisible
// to a screenshot (a bearing that reads back as rounding, an event that never fires, a fit that
// clips by 6%), which is exactly why they survived #R180's own browser suite.
import { test, expect } from '@playwright/test';
import { bootEngine } from './helpers/engine.js';

const BOOT = { timeout: 90_000 };

/* (#R201) ONE page load — see tests/helpers/engine.js */
const boot = (page, engine) => bootEngine(page, engine, BOOT);

/* ── ① THE REPORTED DEFECT: THE IMAGERY IS THE RIGHT WAY UP ────────────────────────────────
   A flipped tile is flipped about ITS OWN centre, so the giveaway is not a mirrored map but a
   seam at every tile-row boundary. Rather than diff a screenshot, ask the provider for a tile
   and compare it with the same tile decoded the ordinary way: identical content, opposite rows.
   That is a property of the returned object, so it holds at any zoom and needs no network luck
   beyond the one tile. */
test('R181 ①: a tile handed to Cesium is oriented for the GPU, not for the DOM', async ({ page }) => {
  await boot(page, 'cesium');
  const got = await page.evaluate(async () => {
    const C = window.__imCesium.Cesium;
    /* a provider over a data: URL — no network, and the source pixels are known */
    const cv = document.createElement('canvas'); cv.width = cv.height = 4;
    const g = cv.getContext('2d');
    g.fillStyle = '#ff0000'; g.fillRect(0, 0, 4, 2);      // TOP half red
    g.fillStyle = '#0000ff'; g.fillRect(0, 2, 4, 2);      // bottom half blue
    const url = cv.toDataURL('image/png');
    const bytes = await (await fetch(url)).arrayBuffer();

    const prov = window.IntMapCesiumLayers.makeTileImageryProvider(C, {
      tiles: ['r181test://{z}/{x}/{y}'], tileSize: 4,
      protocols: { r181test: async () => ({ data: bytes }) },
    });
    const img = await prov.requestImage(0, 0, 0);
    const read = async (src) => {
      const b = (src instanceof ImageBitmap) ? src : await createImageBitmap(src);
      const c = new OffscreenCanvas(b.width, b.height), x = c.getContext('2d');
      x.drawImage(b, 0, 0);
      const d = x.getImageData(0, 0, b.width, b.height).data;
      const px = (r, col) => { const i = (r * b.width + col) * 4; return [d[i], d[i + 1], d[i + 2]].join(','); };
      return { top: px(0, 0), bottom: px(b.height - 1, 0), w: b.width, h: b.height,
               isBitmap: (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap) };
    };
    return { fromProvider: await read(img), plain: await read(new Blob([bytes])) };
  });
  /* decoded the ordinary way, row 0 is the red half — that is the DOM's top-down order */
  expect(got.plain.top, 'the source really is red on top').toBe('255,0,0');
  expect(got.plain.bottom).toBe('0,0,255');
  /* what the provider hands Cesium must be the SAME image, bottom-up, because WebGL ignores
     UNPACK_FLIP_Y_WEBGL for an ImageBitmap and Cesium is relying on that flag */
  expect(got.fromProvider.isBitmap, 'the provider returns a bitmap').toBe(true);
  expect(got.fromProvider.top, 'row 0 must be the BLUE half — i.e. already flipped for upload')
    .toBe('0,0,255');
  expect(got.fromProvider.bottom).toBe('255,0,0');
  expect(got.fromProvider.w).toBe(4);
});

/* ── ② THE BEARING ────────────────────────────────────────────────────────────────────────
   At pitch 0 this read back 67.34° at z9, 123.54° at z6 and −177.63° at boot, for a camera
   pointing due north — the direction of a rounding residue — and the map could not be rotated
   at all, because an orbit offset that is vertical cannot carry a heading. */
test('R181 ②: bearing round-trips at every zoom and pitch, including straight down', async ({ page }) => {
  /* every jumpTo re-covers and rebuilds every vector layer, so this is genuinely a slow test —
     it is the breadth that matters here, not the count. Marked rather than trimmed to nothing,
     because the defect was zoom-dependent (67.34° at z9, 123.54° at z6, −177.63° at boot). */
  test.slow();
  await boot(page, 'cesium');
  const rows = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine, out = [];
    const norm = (x) => { const v = ((x % 360) + 360) % 360; return v > 180 ? v - 360 : v; };
    for (const z of [1.7, 6, 9, 14]) {
      for (const p of [0, 45]) {
        for (const b of [0, 90, 270, -30]) {
          E.camera.jumpTo({ center: [138.7274, 35.3606], zoom: z, pitch: p, bearing: b });
          await new Promise((r) => setTimeout(r, 40));
          const c = E.camera.get();
          out.push({ z, p, b, dB: Math.abs(norm(c.bearing - b)), dP: Math.abs(c.pitch - p) });
        }
      }
    }
    return out;
  });
  const worstB = Math.max(...rows.map((r) => r.dB));
  const worstP = Math.max(...rows.map((r) => r.dP));
  expect(rows.length).toBe(32);
  expect(worstB, `worst bearing error over ${rows.length} cases`).toBeLessThan(0.05);
  expect(worstP, 'and the pitch must not have been disturbed by the repair').toBeLessThan(0.01);
});

test('R181 ②: at pitch 0 the map really turns — the heading is not silently dropped', async ({ page }) => {
  await boot(page, 'cesium');
  const heads = await page.evaluate(async () => {
    const C = window.__imCesium.Cesium, E = window.IntMapGeoEngine, v = window.__imap, out = [];
    for (const b of [0, 90, 180, 270]) {
      E.camera.jumpTo({ center: [138.7274, 35.3606], zoom: 9, pitch: 0, bearing: b });
      await new Promise((r) => setTimeout(r, 60));
      /* the renderer's own heading, not ours — this is the number lookAt was throwing away */
      out.push({ b, cam: ((C.Math.toDegrees(v._camera.heading) % 360) + 360) % 360 });
    }
    return out;
  });
  /* compared the short way round: Cesium reports a heading of 0 as 360, and 359.999 is not
     359.999 degrees away from 0 */
  const apart = (a, b) => { const d = ((a - b) % 360 + 360) % 360; return d > 180 ? 360 - d : d; };
  for (const h of heads) {
    expect(apart(h.cam, h.b), `asked for ${h.b}, renderer heading ${h.cam}`).toBeLessThan(0.05);
  }
});

/* ── ③ THE EVENTS ─────────────────────────────────────────────────────────────────────────
   `mousedown` measured 0 against MapLibre's 4 — Cesium binds POINTER events and prevents their
   default, which suppresses the browser's compatibility mouse events. map-tools.js and
   terrain-water.js both bind down → move → up on mouse AND touch, so a shape could be started
   and never dragged. */
test('R181 ③: every event the app subscribes to fires on the second engine too', async ({ page }) => {
  await boot(page, 'cesium');
  await page.evaluate(() => {
    window.__seen = {};
    const E = window.IntMapGeoEngine;
    for (const n of ['click', 'dblclick', 'contextmenu', 'mousedown', 'mouseup', 'mousemove',
      'mouseout', 'touchstart', 'touchmove', 'touchend', 'wheel', 'render', 'rotate', 'pitch',
      'move', 'moveend', 'zoom', 'zoomend', 'terrain']) {
      E.events.on(n, () => { window.__seen[n] = (window.__seen[n] || 0) + 1; });
    }
    E.camera.jumpTo({ center: [138.7274, 35.3606], zoom: 8, pitch: 0, bearing: 0 });
  });
  await page.waitForTimeout(1200);

  const box = await page.locator('#map canvas').first().boundingBox();
  const cx = Math.round(box.x + box.width / 2), cy = Math.round(box.y + box.height / 2);
  await page.mouse.move(cx - 40, cy - 40);
  await page.mouse.move(cx, cy);
  await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up();
  await page.waitForTimeout(300);
  await page.mouse.dblclick(cx + 4, cy + 4);
  await page.mouse.click(cx + 12, cy + 12, { button: 'right' });
  await page.waitForTimeout(300);
  await page.evaluate(({ cx, cy }) => {
    const cv = document.querySelector('#map canvas');
    cv.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: cx, clientY: cy }));
    const mk = (t, x, y) => {
      const T = new Touch({ identifier: 1, target: cv, clientX: x, clientY: y });
      cv.dispatchEvent(new TouchEvent(t, { bubbles: true, cancelable: true,
        touches: t === 'touchend' ? [] : [T], changedTouches: [T] }));
    };
    mk('touchstart', cx, cy); mk('touchmove', cx + 8, cy + 8); mk('touchend', cx + 8, cy + 8);
  }, { cx, cy });
  await page.mouse.move(box.x - 40, box.y - 40);          // leave the canvas
  await page.waitForTimeout(300);
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [138.7274, 35.3606], zoom: 9, pitch: 40, bearing: 25 }));
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = document.getElementById('btn-view-3d'); if (b) b.click(); });
  await page.waitForTimeout(900);

  const seen = await page.evaluate(() => window.__seen);
  const missing = ['click', 'dblclick', 'contextmenu', 'mousedown', 'mouseup', 'mousemove',
    'mouseout', 'touchstart', 'touchmove', 'touchend', 'wheel', 'render', 'rotate', 'pitch',
    'move', 'moveend', 'terrain'].filter((n) => !seen[n]);
  expect(missing, 'these are subscribed to in js/ and would silently never run').toEqual([]);
});

/* ── ④ fitBounds ──────────────────────────────────────────────────────────────────────────
   The fit was computed in flat Mercator on a curved surface, so the far parts of the box fell
   off the screen: measured by projecting the box's own boundary afterwards, a Europe-sized box
   left 6% of itself outside the viewport. */
test('R181 ④: fitBounds actually shows the box it was given', async ({ page }) => {
  await boot(page, 'cesium');
  const rows = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine, out = [];
    const BOXES = [[[135, 33], [141, 37]], [[-10, 35], [30, 60]], [[-125, 25], [-66, 49]],
      [[2, 48], [3, 49]], [[112, -44], [154, -10]], [[-180, -60], [180, 70]]];
    for (const b of BOXES) {
      E.camera.fitBounds(b, { padding: 0, duration: 0 });
      await new Promise((r) => setTimeout(r, 500));
      const s = E.render.size(), W = s.width, H = s.height;
      const [[w, so], [e, n]] = b;
      let worst = 0;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        for (const [x, y] of [[w + (e - w) * t, so], [w + (e - w) * t, n],
          [w, so + (n - so) * t], [e, so + (n - so) * t]]) {
          const p = E.coords.project([x, y]);
          if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
          worst = Math.max(worst, Math.max(0, -p.x, p.x - W) / W, Math.max(0, -p.y, p.y - H) / H);
        }
      }
      out.push({ b: JSON.stringify(b), outFrac: worst, zoom: E.camera.getZoom() });
    }
    return out;
  });
  for (const r of rows) {
    expect(r.outFrac, `${r.b} left ${(r.outFrac * 100).toFixed(1)}% of itself off screen`)
      .toBeLessThan(0.01);
  }
  /* and a box that goes the whole way round is not treated as having no width at all */
  const world = rows.find((r) => r.b.includes('-180'));
  expect(world.zoom, 'a 360-degree span must not read as zero and let the zoom run away')
    .toBeLessThan(3);
});

/* ── ⑤ THE DEFAULT ENGINE ─────────────────────────────────────────────────────────────────
   Pressing Satellite on MapLibre — the default, i.e. every ordinary session — threw three to
   six uncaught RangeErrors, because applyTheme rebuilds a sprite (which fires styledata
   synchronously) one line before it flips the visibility that the styledata handler tests. */
test('R181 ⑤: switching the base map on the DEFAULT engine raises no errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await boot(page, 'maplibre');
  await page.waitForTimeout(1500);
  for (const id of ['btn-view-sat', 'btn-view-map', 'btn-view-sat', 'btn-view-map']) {
    await page.evaluate((i) => { const b = document.getElementById(i); if (b) b.click(); }, id);
    await page.waitForTimeout(900);
  }
  expect(errors.filter((e) => /Maximum call stack/i.test(e)),
    'applyTheme re-entered itself until the stack gave out').toEqual([]);
  expect(errors).toEqual([]);
  /* and the flip it was in the middle of still completed */
  const vis = await page.evaluate(() => window.IntMapGeoEngine.layers.getLayout('layer-sat', 'visibility'));
  expect(vis).toBe('none');
});

/* ── ⑥ THE VECTOR TILES ───────────────────────────────────────────────────────────────────
   Pan in to z12 and back out and the country labels never returned: 768 features reached the
   layer, 714 passed its filter, the layer was visible and in zoom range — and it drew nothing,
   because "a tile arrived, redraw" was gated on a counter that every OTHER layer bumped. */
test('R181 ⑥: vector-tile layers come back after a round trip through a deep zoom', async ({ page }) => {
  await boot(page, 'cesium');
  const count = () => page.evaluate(() => {
    const v = window.__imap, rec = v._layerById.get('ofm-country');
    return rec && rec.ds ? rec.ds.entities.values.length : -1;
  });
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [20, 10], zoom: 1.7, pitch: 0, bearing: 0 }));
  await expect.poll(count, { timeout: 45_000 }).toBeGreaterThan(200);
  const before = await count();

  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [138.7274, 35.3606], zoom: 12, pitch: 60, bearing: 30 }));
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [10, 48], zoom: 5, pitch: 0, bearing: 0 }));
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [20, 10], zoom: 1.7, pitch: 0, bearing: 0 }));

  await expect.poll(count, { timeout: 45_000 }).toBeGreaterThan(200);
  const after = await count();
  expect(after, `${before} features on the way in, ${after} on the way back`).toBeGreaterThan(before * 0.8);

  /* and the declutter is doing its job on top of them — a globe at z1.7 must not be a pile */
  const shown = await page.evaluate(() => {
    const v = window.__imap, C = window.__imCesium.Cesium, now = C.JulianDate.now();
    const rec = v._layerById.get('ofm-country');
    let n = 0;
    for (const e of rec.ds.entities.values) {
      if (!e.label) continue;
      const vis = (e.label.show && e.label.show.getValue) ? e.label.show.getValue(now) : !!e.label.show;
      if (vis) n++;
    }
    return n;
  });
  expect(shown).toBeGreaterThan(0);
  expect(shown, 'the screen-space declutter must be dropping the overlaps').toBeLessThan(after / 4);
});

/* ── ⑦ AND THE PROMISES THE ROUND MUST NOT HAVE BROKEN ────────────────────────────────────── */

test('R181 ⑦: a default session still transfers no Cesium and no engine errors', async ({ page }) => {
  const urls = [];
  const errors = [];
  page.on('request', (r) => urls.push(r.url()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?rafshim=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, BOOT);
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.IntMapGeoEngine.id())).toBe('maplibre');
  expect(urls.filter((u) => /\/cesium[/-]|cesium\.js|Cesium\//i.test(u))).toEqual([]);
  expect(errors).toEqual([]);
});

/* the audit read `sourcedata` 12 against MapLibre's 95 and that looked like frequency — but the
   payload carried only {sourceId}, and all three subscribers in the app test `e.isSourceLoaded`.
   An event that fires with the wrong shape is an event that never fired. */
test('R181 ③b: sourcedata says WHEN a source finished, not only that it changed', async ({ page }) => {
  await boot(page, 'cesium');
  await page.evaluate(() => {
    window.__sd = [];
    window.IntMapGeoEngine.events.on('sourcedata', (e) => {
      if (e && e.isSourceLoaded) window.__sd.push(e.sourceId);
    });
    window.IntMapGeoEngine.camera.jumpTo({ center: [20, 10], zoom: 2.5, pitch: 0, bearing: 0 });
  });
  await expect.poll(() => page.evaluate(() => window.__sd.length), { timeout: 45_000 })
    .toBeGreaterThan(0);
  /* `ofm` is the vector source the place-label and reference-overlay handlers wait on */
  await expect.poll(() => page.evaluate(() => window.__sd.filter((s) => s === 'ofm').length),
    { timeout: 45_000 }).toBeGreaterThan(0);
  const kinds = await page.evaluate(() => [...new Set(window.__sd)].length);
  expect(kinds, 'raster sources report it too — satellite.js\'s cross-fade waits on one')
    .toBeGreaterThan(1);
});

test('R181 ⑦: the sky spec survives a round trip, so a flight can put it back', async ({ page }) => {
  await boot(page, 'cesium');
  const got = await page.evaluate(() => {
    const E = window.IntMapGeoEngine;
    const spec = { 'sky-color': '#0a3d91', 'horizon-color': '#bcd4ff' };
    E.scene.setSky(spec);
    return { back: E.scene.getSky(), cleared: (E.scene.setSky(null), E.scene.getSky()) };
  });
  expect(got.back, 'flight-sim.js reads this to restore the sky after a flight')
    .toMatchObject({ 'sky-color': '#0a3d91' });
  expect(got.cleared).toBeNull();
});
