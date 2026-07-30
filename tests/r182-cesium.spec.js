// (#R182) THE GESTURES, MEASURED IN A REAL BROWSER, AGAINST MAPLIBRE IN THE SAME RUN.
//
// 「Cesium選択時に、マップの操作がほぼできない。また、MapLibre時と同じレスポンスになるように。（マウスなど）」
//
// Every assertion here is DIFFERENTIAL: the same gesture is driven through the same contract on
// both engines in the same browser and the same viewport, and Cesium is required to answer close
// to what MapLibre answered. That is what "the same response" means, and it is also the only
// form of the test that stays true when the environment changes — a fixed expected number would
// be measuring this machine, not the parity.
//
// Input is driven through Playwright's mouse/keyboard, i.e. the browser's real input pipeline.
// Synthetic events would not exercise the reason six of these gestures were dead: Cesium calls
// preventDefault on `pointerdown`, which suppresses the compatibility mouse events (#R181).
import { test, expect } from '@playwright/test';

const BOOT = { timeout: 90_000 };

const boot = async (page, engine) => {
  await page.goto('/?rafshim=1', { waitUntil: 'domcontentloaded' });
  await page.evaluate((e) => { try { localStorage.setItem('intmap_engine', e); } catch (_) {} }, engine);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, BOOT);
  await page.waitForFunction(() => window.IntMapGeoEngine.canDraw(), null, BOOT);
  await expect.poll(() => page.evaluate(() => window.IntMapGeoEngine.id()), BOOT).toBe(engine);
};

/* the canvas, not the canvas CONTAINER: MapLibre's container is zero-height in this app's
   layout, and a gesture aimed at its centre lands at the top of the window */
const canvasBox = (page) => page.evaluate(() => {
  const r = window.IntMapGeoEngine.render.canvas().getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const cam = (page) => page.evaluate(() => {
  const c = window.IntMapGeoEngine.camera.get();
  return { lng: c.center.lng, lat: c.center.lat, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch };
});
/* park the camera somewhere that is NOT the value in the URL hash — landing on the hash's own
   camera lets the app's restore fire mid-gesture and eat part of the drag */
const START = { center: [12, 25], zoom: 4, pitch: 30, bearing: 0 };
/* …and then WAIT FOR IT TO STOP. A jumpTo makes the app write its shared `#v=` URL, and the
   hashchange that follows arrives a few hundred milliseconds later and re-asserts the camera.
   On MapLibre that re-assert calls stop(), which resets the drag handlers — measured, a drag
   begun too early registered exactly two of its eight moves. So park, then poll until the
   camera has been still for two samples running. */
const park = async (page, over = {}) => {
  await page.evaluate((c) => { window.IntMapGeoEngine.camera.jumpTo(c); }, { ...START, ...over });
  await settle(page);
};

/* WAIT FOR THE CAMERA TO STOP, rather than for a number of milliseconds. Two Cesium scenes and
   a MapLibre one share this machine's GPU while the suite runs, and the page is hidden — rAF
   was measured at 3–8 Hz and setTimeout throttled to about 1 Hz. A fixed wait under that is
   measuring the harness; polling for stillness measures the map. */
const settle = (page, budgetMs = 4000) => page.evaluate(async (budget) => {
  const at = () => { const x = window.IntMapGeoEngine.camera.get();
    return [x.center.lng, x.center.lat, x.zoom, x.bearing, x.pitch].join(','); };
  let last = '', still = 0;
  for (let i = 0; i < budget / 120 && still < 2; i++) {
    await new Promise((r) => setTimeout(r, 120));
    const now = at(); still = (now === last) ? still + 1 : 0; last = now;
  }
}, budgetMs);
/* …and after an INPUT, wait for the map to start moving first. An event dispatched from the
   test process may not have been processed yet when the poll begins, and "unchanged twice"
   would then mean "not yet", which reads as a gesture that did nothing. */
const settleFrom = (page, key, budgetMs = 6000) => page.evaluate(async ([k, budget]) => {
  const at = () => { const x = window.IntMapGeoEngine.camera.get();
    return [x.center.lng, x.center.lat, x.zoom, x.bearing, x.pitch].join(','); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = Date.now();
  while (Date.now() - t0 < budget && at() === k) await wait(80);
  let last = '', still = 0;
  while (Date.now() - t0 < budget && still < 2) {
    await wait(120);
    const now = at(); still = (now === last) ? still + 1 : 0; last = now;
  }
}, [key, budgetMs]);
const camKey = (c) => [c.lng, c.lat, c.zoom, c.bearing, c.pitch].join(',');

const norm = (d) => { const v = ((d % 360) + 360) % 360; return v > 180 ? v - 360 : v; };

/* ══ ① THE MOUSE ══════════════════════════════════════════════════════════════════════════
   Six of the eight gestures the contract names had NO binding on this engine, and the two
   that moved moved by Cesium's law rather than MapLibre's. Measured before this round, at
   z4: a 120 px drag down moved the centre 4× too far, a right-drag zoomed instead of
   rotating, ctrl+drag did nothing, and the wheel did nothing at all. */
async function mouseSuite(page, engine, part) {
  await boot(page, engine);
  const b = await canvasBox(page);
  const cx = Math.round(b.x + b.w / 2), cy = Math.round(b.y + b.h / 2);
  const out = {};

  /* ONE move, and the response sampled while the button is still down. Both halves of that
     are deliberate. Sampling before the release compares the gesture LAW rather than two
     inertia clocks; and a single move rather than a swept one is what makes the comparison
     survive this harness, which delivers real pointer moves 600–2000 ms apart (measured) —
     long enough for the app's own asynchronous work to land in the middle of a swept drag and
     for MapLibre's stop() to reset the handler part-way through. Both engines measure the
     delta from the press point, so one move and eight moves ask the same question. */
  /* …and 40 px BELOW the centre line. `bearingDelta` is negated when the pointer is above the
     map's centre — a real steering-wheel sign, and a knife edge at exactly the centre row:
     both engines decide it with a strict `<`, so a drag on the line itself is settled by the
     last bit of a float. A hand never drags there; a test should not either. */
  const drag = async (name, dx, dy, opts = {}) => {
    await park(page, opts.start);
    const y0 = cy + 40;
    const before = await cam(page);
    await page.mouse.move(cx, y0);
    if (opts.key) await page.keyboard.down(opts.key);
    await page.mouse.down({ button: opts.button || 'left' });
    await page.mouse.move(cx + dx, y0 + dy);
    await settleFrom(page, camKey(before));
    const during = await cam(page);
    await page.mouse.up({ button: opts.button || 'left' });
    if (opts.key) await page.keyboard.up(opts.key);
    await settle(page);
    out[name] = { dLng: during.lng - before.lng, dLat: during.lat - before.lat,
      dZoom: during.zoom - before.zoom, dBearing: norm(during.bearing - before.bearing),
      dPitch: during.pitch - before.pitch };
  };

  /* SPLIT IN TWO, because one test that drives fourteen gestures through two engines is one
     test that times out on a shared CI runner (measured: 3.2 min against a 180 s budget, all
     three attempts). The halves are independent and run in parallel workers. */
  if (part === 'drag') {
    await drag('panRight', 120, 0);
    await drag('panDown', 0, 120);
    await drag('panRightFlat', 120, 0, { start: { pitch: 0 } });
    await drag('rotateRight', 120, 0, { button: 'right' });
    await drag('pitchUp', 0, -120, { button: 'right' });
    await drag('ctrlRotate', 120, 0, { key: 'Control' });
    await drag('ctrlPitch', 0, -120, { key: 'Control' });
    return out;
  }

  /* the wheel, as a whole gesture — and whether it zoomed at the cursor */
  for (const [name, delta] of [['wheelIn', -120], ['wheelOut', 120]]) {
    await park(page, { pitch: 0 });
    const px = cx + 150, py = cy + 100;
    const anchor = await page.evaluate((p) => window.IntMapGeoEngine.coords.unproject(p),
      [px - b.x, py - b.y]);
    const before = await cam(page);
    await page.mouse.move(px, py);
    await page.mouse.wheel(0, delta);
    await settleFrom(page, camKey(before));
    const after = await cam(page);
    const back = await page.evaluate((a) => window.IntMapGeoEngine.coords.project(a), anchor);
    out[name] = { dZoom: after.zoom - before.zoom,
      anchorErrPx: back ? Math.hypot(back.x - (px - b.x), back.y - (py - b.y)) : 9999 };
  }

  /* shift + drag = box zoom */
  await park(page, { pitch: 0 });
  {
    const before = await cam(page);
    await page.mouse.move(cx - 100, cy - 75);
    await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 77);
    await page.mouse.up();
    await page.keyboard.up('Shift');
    await settleFrom(page, camKey(before));
    const after = await cam(page);
    out.boxZoom = { dZoom: after.zoom - before.zoom };
  }

  /* the keyboard */
  for (const [name, key, mod] of [['keyRight', 'ArrowRight', null], ['keyUp', 'ArrowUp', null],
    ['keyShiftRight', 'ArrowRight', 'Shift'], ['keyShiftUp', 'ArrowUp', 'Shift']]) {
    await park(page);
    await page.mouse.click(cx, cy);
    await settle(page);
    const before = await cam(page);
    if (mod) await page.keyboard.down(mod);
    await page.keyboard.press(key);
    if (mod) await page.keyboard.up(mod);
    await settleFrom(page, camKey(before));
    const after = await cam(page);
    out[name] = { dLng: after.lng - before.lng, dLat: after.lat - before.lat,
      dBearing: norm(after.bearing - before.bearing), dPitch: after.pitch - before.pitch,
      dZoom: after.zoom - before.zoom };
  }
  return out;
}

/* the comparison, printed in full — a failure should read as a table, not as one number */
const compare = (ml, cs) => {
  const show = (k) => `${k}: MapLibre ${JSON.stringify(ml[k], (_, v) => typeof v === 'number' ? +v.toFixed(3) : v)}`
    + ` vs Cesium ${JSON.stringify(cs[k], (_, v) => typeof v === 'number' ? +v.toFixed(3) : v)}`;
  for (const k of Object.keys(ml)) console.log(show(k));
  return show;
};

test('R182 ①a: pan, rotate and pitch answer the way MapLibre answers', async ({ page }) => {
  test.setTimeout(300_000);
  const ml = await mouseSuite(page, 'maplibre', 'drag');
  const cs = await mouseSuite(page, 'cesium', 'drag');
  const show = compare(ml, cs);

  /* PAN — the same law, which is MapLibre's globe pan and not "the grabbed point follows the
     cursor" (maplibre-gl says so itself; see js/cesium-input.js). Cesium used to move 4× too
     far downwards and to drift in latitude on a horizontal drag. */
  for (const k of ['panRight', 'panDown', 'panRightFlat']) {
    const want = Math.hypot(ml[k].dLng, ml[k].dLat);
    const got = Math.hypot(cs[k].dLng, cs[k].dLat);
    expect(want, `${k}: MapLibre itself must have moved`).toBeGreaterThan(0.5);
    expect(Math.abs(got - want) / want, show(k)).toBeLessThan(0.05);
    /* the direction, on whichever axis MapLibre actually moved along — the other axis is a
       residue on both engines and its sign means nothing */
    for (const ax of ['dLng', 'dLat']) {
      if (Math.abs(ml[k][ax]) < 0.5) { expect(Math.abs(cs[k][ax]), show(k)).toBeLessThan(0.5); continue; }
      expect(Math.sign(cs[k][ax]), show(k)).toBe(Math.sign(ml[k][ax]));
    }
    expect(Math.abs(cs[k].dPitch), `${k} must not disturb the pitch`).toBeLessThan(0.5);
  }
  /* a pan must not spin the map — the old engine reported ±180 after every flat drag */
  expect(Math.abs(cs.panRightFlat.dBearing), show('panRightFlat')).toBeLessThan(0.5);

  /* ROTATE and PITCH — 0.8°/px and −0.5°/px, both on the right button and on ctrl+left */
  for (const k of ['rotateRight', 'ctrlRotate']) {
    expect(Math.abs(ml[k].dBearing), `${k}: MapLibre itself must have rotated`).toBeGreaterThan(10);
    expect(Math.abs(cs[k].dBearing - ml[k].dBearing), show(k)).toBeLessThan(1);
  }
  for (const k of ['pitchUp', 'ctrlPitch']) {
    expect(Math.abs(ml[k].dPitch), `${k}: MapLibre itself must have tilted`).toBeGreaterThan(10);
    expect(Math.abs(cs[k].dPitch - ml[k].dPitch), show(k)).toBeLessThan(1);
  }
});

test('R182 ①b: the wheel, the box zoom and the keyboard answer the way MapLibre answers', async ({ page }) => {
  test.setTimeout(300_000);
  const ml = await mouseSuite(page, 'maplibre', 'rest');
  const cs = await mouseSuite(page, 'cesium', 'rest');
  const show = compare(ml, cs);

  /* THE WHEEL — the sigmoid, at the app's own rates, anchored at the cursor */
  for (const k of ['wheelIn', 'wheelOut']) {
    expect(Math.abs(ml[k].dZoom), `${k}: MapLibre itself must have zoomed`).toBeGreaterThan(0.2);
    expect(Math.sign(cs[k].dZoom), show(k)).toBe(Math.sign(ml[k].dZoom));
    expect(Math.abs(cs[k].dZoom - ml[k].dZoom), show(k)).toBeLessThan(0.05);
  }
  /* 「カーソル地点へとズームされるというUXがなくなってしまった」(#R20) — it must not zoom to the centre */
  expect(cs.wheelIn.anchorErrPx, show('wheelIn')).toBeLessThan(25);

  /* BOX ZOOM */
  expect(ml.boxZoom.dZoom, 'MapLibre itself must have box-zoomed').toBeGreaterThan(1);
  expect(Math.abs(cs.boxZoom.dZoom - ml.boxZoom.dZoom), show('boxZoom')).toBeLessThan(0.2);

  /* THE KEYBOARD — 100 px per arrow, 15° and 10° with shift */
  expect(Math.abs(cs.keyRight.dLng - ml.keyRight.dLng), show('keyRight')).toBeLessThan(0.2);
  expect(Math.abs(cs.keyUp.dLat - ml.keyUp.dLat), show('keyUp')).toBeLessThan(0.2);
  expect(Math.abs(cs.keyShiftRight.dBearing - ml.keyShiftRight.dBearing), show('keyShiftRight')).toBeLessThan(0.6);
  expect(Math.abs(cs.keyShiftUp.dPitch - ml.keyShiftUp.dPitch), show('keyShiftUp')).toBeLessThan(0.6);
});

/* ══ ② A GESTURE IS ONE MOVE, AND IT COASTS ═══════════════════════════════════════════════
   `moveend` has 19 subscribers in this app, several of which reconcile layers or refresh
   data; announcing every frame of a drag as a completed move is not a cosmetic difference.
   And a fling is a fling because the last 160 ms of movement were fast — which is why this
   drag is dispatched FROM INSIDE THE PAGE, in one synchronous burst. Measured, this harness
   delivers real pointer moves 600–2000 ms apart and throttles setTimeout to about one a
   second (the preview document is hidden), and a drag that slow has no inertia on MapLibre
   either. The input pipeline itself is what ① exercises; what is left to check here is the
   controller's own bookkeeping, and a burst is exactly the fast flick that exercises it. */
test('R182 ②: a drag is one movestart…moveend, and the fling glides after release', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, 'cesium');
  await park(page, { pitch: 0 });
  const got = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine, cv = E.render.canvas();
    const r = cv.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const rec = { seq: [], counts: {} };
    const offs = [];
    for (const n of ['movestart', 'move', 'moveend', 'dragstart', 'idle']) {
      const f = () => { rec.counts[n] = (rec.counts[n] || 0) + 1; if (n !== 'move') rec.seq.push(n); };
      E.events.on(n, f); offs.push([n, f]);
    }
    const pe = (type, x, y, buttons) => {
      const ev = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1,
        pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: 0, buttons });
      (type === 'pointerdown' ? cv : window).dispatchEvent(ev);
    };
    const wait = (ms) => new Promise((k) => setTimeout(k, ms));
    pe('pointerdown', cx, cy, 1);
    for (let i = 1; i <= 10; i++) pe('pointermove', cx - 18 * i, cy, 1);
    const atRelease = E.camera.get().center.lng;
    rec.seq.push('pointerup');
    pe('pointerup', cx - 180, cy, 0);
    await wait(3000);
    for (const [n, f] of offs) E.events.off(n, f);
    return { rec, atRelease, after: E.camera.get().center.lng };
  });
  const j = JSON.stringify(got);
  expect(got.rec.counts.movestart, j).toBe(1);
  expect(got.rec.counts.moveend, j).toBe(1);
  expect(got.rec.counts.dragstart, j).toBe(1);
  expect(got.rec.counts.move, 'the frames themselves must still be announced').toBeGreaterThan(4);
  /* the ONE moveend belongs to the end of the whole gesture, i.e. after the release —
     not to a frame in the middle of it */
  expect(got.rec.seq.indexOf('moveend'), j).toBeGreaterThan(got.rec.seq.indexOf('pointerup'));
  /* and the fling carries on past the release, in the same direction */
  const glide = got.after - got.atRelease;
  expect(Math.abs(glide), `glided ${glide} — ${j}`).toBeGreaterThan(0.05);
  expect(Math.sign(glide), `glided ${glide}`).toBe(1);   // dragged left → centre east → keeps going
});

/* ══ ③ THE ANIMATED PATH LANDS WHERE THE INSTANT ONE DOES ════════════════════════════════
   The orbit angles are not Cesium's orientation angles. Handing them to flyTo put the centre
   up to 25° of latitude away and threw the bearing away entirely at pitch 0 — and every
   animated move in the app goes through there. */
test('R182 ③: easeTo lands on the camera it was asked for, at every pitch', async ({ page }) => {
  test.setTimeout(300000);
  await boot(page, 'cesium');
  const rows = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine, out = [];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const p of [0, 30, 60]) {
      for (const bg of [0, 45, 200]) {
        E.camera.jumpTo({ center: [30, 10], zoom: 6, pitch: 0, bearing: 0 });
        await wait(400);
        E.camera.easeTo({ center: [12, 25], zoom: 4, pitch: p, bearing: bg, duration: 300 });
        await wait(1400);
        const c = E.camera.get();
        out.push({ p, bg, lng: c.center.lng, lat: c.center.lat, zoom: c.zoom, bearing: c.bearing, pitch: c.pitch });
      }
    }
    return out;
  });
  for (const r of rows) {
    const d = (x) => JSON.stringify(r);
    expect(Math.abs(r.lng - 12), d()).toBeLessThan(0.05);
    expect(Math.abs(r.lat - 25), d()).toBeLessThan(0.05);
    expect(Math.abs(r.zoom - 4), d()).toBeLessThan(0.02);
    expect(Math.abs(r.pitch - r.p), d()).toBeLessThan(0.1);
    expect(Math.abs(norm(r.bearing - r.bg)), d()).toBeLessThan(0.1);
  }
});

/* ══ ④ `around` — ZOOM TOWARD THE CURSOR ═════════════════════════════════════════════════
   The adapter used to drop the option, and the two call sites that pass it are the app's own
   double-click and pinch zoom, which exist for exactly this (#R20). */
test('R182 ④: easeTo({around}) holds the anchor under its own pixel', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page, 'cesium');
  const rows = await page.evaluate(async () => {
    const E = window.IntMapGeoEngine, out = [];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    /* stillness, not a stopwatch — see the note on `settle` at the top of this file */
    const at = () => { const x = E.camera.get();
      return [x.center.lng, x.center.lat, x.zoom, x.bearing, x.pitch].join(','); };
    const rest = async (budget) => { const t0 = Date.now(); let last = '', still = 0;
      while (Date.now() - t0 < budget && still < 2) {
        await wait(120); const n = at(); still = (n === last) ? still + 1 : 0; last = n; } };
    const s = E.render.size();
    for (const [fx, fy] of [[0.75, 0.7], [0.25, 0.3]]) {
      for (const dz of [1, -1]) {
        E.camera.jumpTo({ center: [12, 25], zoom: 4, pitch: 0, bearing: 0 });
        await rest(6000);
        const px = s.width * fx, py = s.height * fy;
        const anchor = E.coords.unproject([px, py]);
        E.camera.easeTo({ zoom: E.camera.getZoom() + dz, around: anchor, duration: 250 });
        await rest(9000);
        const back = E.coords.project(anchor);
        out.push({ dz, zoom: E.camera.getZoom(),
          err: back ? Math.hypot(back.x - px, back.y - py) : 9999 });
      }
    }
    return out;
  });
  for (const r of rows) {
    expect(Math.abs(r.zoom - (4 + r.dz)), JSON.stringify(r)).toBeLessThan(0.05);
    expect(r.err, JSON.stringify(r)).toBeLessThan(6);
  }
});

/* ══ ⑤ THE GESTURE SWITCHES REALLY SWITCH ════════════════════════════════════════════════
   js/flight-sim.js suspends all eight for the length of a flight and restores them after; on
   the old engine three of the names were recorded and ignored, and two shared one flag, so
   turning the pinch off also killed the wheel. */
test('R182 ⑤: all eight gesture names can be suspended and restored', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, 'cesium');
  const b = await canvasBox(page);
  const cx = Math.round(b.x + b.w / 2), cy = Math.round(b.y + b.h / 2);

  const names = await page.evaluate(() => window.IntMapGeoEngine.input.names());
  expect(names.length).toBe(8);
  const applied = await page.evaluate(() => window.IntMapGeoEngine.input.setAll(false));
  expect(applied, 'every name must be accepted, not silently dropped').toBe(8);

  await park(page, { pitch: 0 });
  const before = await cam(page);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(cx + 20 * i, cy); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.mouse.wheel(0, -240);
  await settle(page);
  const suspended = await cam(page);
  expect(Math.abs(suspended.lng - before.lng), 'a suspended map must not pan').toBeLessThan(0.01);
  expect(Math.abs(suspended.zoom - before.zoom), 'or zoom').toBeLessThan(0.01);

  await page.evaluate(() => window.IntMapGeoEngine.input.setAll(true));
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(cx + 20 * i, cy); await page.waitForTimeout(16); }
  await page.mouse.up();
  await settle(page);
  const restored = await cam(page);
  expect(Math.abs(restored.lng - before.lng), 'and must pan again once restored').toBeGreaterThan(1);
});

/* ══ ⑥ TOUCH ═════════════════════════════════════════════════════════════════════════════
   One finger pans; two fingers pinch about their midpoint. Driven through CDP's touch input
   so the pointer stream is the real one. */
test('R182 ⑥: one finger pans and two fingers pinch', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, 'cesium');
  const b = await canvasBox(page);
  const cx = Math.round(b.x + b.w / 2), cy = Math.round(b.y + b.h / 2);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });

  await park(page, { pitch: 0 });
  let before = await cam(page);
  await touch('touchStart', [{ x: cx, y: cy, id: 1 }]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: cx + 20 * i, y: cy, id: 1 }]); await page.waitForTimeout(16); }
  await touch('touchEnd', []);
  await settle(page);
  let after = await cam(page);
  expect(after.lng - before.lng, 'a one-finger drag east pans the centre west').toBeLessThan(-1);

  await park(page, { pitch: 0 });
  before = await cam(page);
  await touch('touchStart', [{ x: cx - 60, y: cy, id: 1 }, { x: cx + 60, y: cy, id: 2 }]);
  for (let i = 1; i <= 8; i++) {
    await touch('touchMove', [{ x: cx - 60 - 12 * i, y: cy, id: 1 }, { x: cx + 60 + 12 * i, y: cy, id: 2 }]);
    await page.waitForTimeout(16);
  }
  await touch('touchEnd', []);
  await settle(page);
  after = await cam(page);
  expect(after.zoom - before.zoom, 'fingers spreading apart zooms in').toBeGreaterThan(0.5);
  await cdp.detach();
});
