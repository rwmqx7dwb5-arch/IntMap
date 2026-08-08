// @ts-check
/* ============================================================================
 *  R201 — in a real renderer: the night side as a GRADIENT, the admin-1 label as a PLACE label,
 *         and the space explorer reached by the zoom itself
 * ----------------------------------------------------------------------------
 *  tests/r201-checks.test.mjs reads the source. This is the half that only a page can answer:
 *  the alpha the renderer really holds in the night canvas, the popup a tap on a prefecture opens,
 *  and a zoom-out integral that is only meaningful against a camera standing on its own floor.
 *
 *  ⚠ ONE PAGE, SERIAL. #R197 established this shape in tests/r197.spec.js and it is the reason a
 *  round can add browser coverage without adding browser TIME: booting the app is most of what a
 *  spec costs, so three subjects that can share a boot must share one. The three tests below are
 *  ordered so each leaves the map where the next one wants it.
 *
 *  ⚠ AND THIS FILE REPLACES COVERAGE RATHER THAN ADDING IT. `tests/r196.spec.js ④` and
 *  `tests/r200.spec.js ②` both measured the night side through the five-polygon mechanism this
 *  round deleted; their assertions are here, against the mechanism that exists, and they are gone
 *  from there. `tests/r197.spec.js ①` measured a button that no longer exists. See
 *  scripts/test-budget.mjs — the ceiling only goes down.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page, diag;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, storageState: seededStorageState() });
  /* ⚠ ② needs the OpenFreeMap `place` tiles: the layer it is about does not exist without them.
     Everything else stays blocked (see tests/helpers/network.js). */
  await installHermeticRouting(context, ['tiles.openfreemap.org']);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/?rafshim=1', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.__imap && !!document.getElementById('map'), null, { timeout: 60_000 });
  await page.waitForFunction(() => !!window.IntMapNightSide && !!window.IntMapSpace, null, { timeout: 60_000 });
});

test.afterAll(async () => { try { await page.context().close(); } catch { /* ignore */ } });

/* ── ① 「夜と昼の部分の変遷が階段状で不自然」「夜の部分は完全に夜間光レイヤーと同じ画像に」 ───── */
test('R201 ① the terminator is a per-pixel gradient, and full night is the night-lights image', async () => {
  test.setTimeout(240_000);
  /* ⚠ (#R207) THE MEASUREMENT NEEDS A BRIGHT UNSHADED BASEMAP, AND IT NO LONGER GETS ONE BY DEFAULT.
     This reads the ratio between a lit pixel and the same pixel under the night shading, and its own
     premise below is `px.off > 60` — comfortably true of the light Carto base this was written
     against, and false over open ocean now that 「初回時にはmapではなくsatelliteに」. The subject is
     the terminator, not the basemap, so the basemap is chosen rather than inherited. */
  await page.evaluate(() => document.getElementById('btn-view-map')?.click());
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [0, 10], zoom: 1.2, pitch: 0, bearing: 0 }));
  await page.waitForFunction(() => window.IntMapNightSide.state().built, null, { timeout: 60_000 });

  /* the image carries the whole effect, and its ramp is a zoom expression (so a gesture costs this
     module nothing) that reaches zero before a continent fills the view */
  const style = await page.evaluate(() => {
    const m = window.__imap;
    return {
      img: !!m.getLayer('im-night-lights-lyr'),
      op: m.getLayer('im-night-lights-lyr') ? m.getPaintProperty('im-night-lights-lyr', 'raster-opacity') : null,
      cap: !!m.getLayer('im-night-shade'),
      capOp: m.getLayer('im-night-shade') ? m.getPaintProperty('im-night-shade', 'fill-opacity') : null,
      st: window.IntMapNightSide.state()
    };
  });
  expect(style.img, 'the night side is one canvas, not five polygons').toBe(true);
  expect(Array.isArray(style.op) && style.op[0]).toBe('interpolate');
  expect(style.op[style.op.length - 1], 'and it is zero by the time a continent fills the view').toBe(0);
  /* ⚠ the cap's opacity is data-driven INSIDE a zoom interpolate — MapLibre rejects a nested zoom
     expression and addLayer swallows the rejection (#R196), so this reads the accepted style back */
  expect(style.cap, 'the polar cap layer really is in the style').toBe(true);
  expect(Array.isArray(style.capOp) && style.capOp[0]).toBe('interpolate');
  expect(style.capOp[style.capOp.length - 1], 'the cap ramp ends at zero too').toBe(0);
  expect(style.st.twilightEnd, 'night ends where astronomical twilight does').toBe(-18);

  /* THE STAIRCASE, MEASURED. Five nested fills could produce at most five levels across the band;
     the alpha is now computed per pixel, so the count is a property of the mechanism and not of a
     constant anywhere. Read off the canvas the renderer is holding. */
  const prof = await page.evaluate(() => {
    const src = window.__imap.getSource('im-night-lights'); if (!src) return null;
    const cv = src.canvas, d = cv.getContext('2d').getImageData(0, Math.round(cv.height / 2), cv.width, 1).data;
    const a = []; for (let c = 0; c < cv.width; c++) a.push(d[c * 4 + 3]);
    let maxJump = 0;
    for (let c = 1; c < a.length; c++) maxJump = Math.max(maxJump, Math.abs(a[c] - a[c - 1]));
    return { w: cv.width, levels: new Set(a.filter((v) => v > 0 && v < 255)).size, maxJump,
      band: a.filter((v) => v > 0 && v < 255).length, full: a.filter((v) => v === 255).length };
  });
  expect(prof, 'the night canvas exists').toBeTruthy();
  expect(prof.levels, `the twilight band is a gradient, not five steps: ${JSON.stringify(prof)}`).toBeGreaterThan(30);
  expect(prof.maxJump, 'no single pixel steps by more than a fifth of the range').toBeLessThan(52);
  expect(prof.full, 'and there is a fully opaque night, which IS the night-lights layer').toBeGreaterThan(20);

  /* THE POLAR CAP IS ONLY THE POLAR CAP. The image quad stops at Mercator's ±85.051°; the fill that
     used to carry the whole night now carries nothing else. */
  const cap = await page.evaluate(() => {
    const fc = window.IntMapNightSide._capFC();
    let minAbs = 90, lit = 0, dark = 0;
    for (const f of fc.features) {
      for (const [, lat] of f.geometry.coordinates[0]) minAbs = Math.min(minAbs, Math.abs(lat));
      if (f.geometry.coordinates[0][0][1] > 0) dark++; else lit++;
    }
    return { n: fc.features.length, minAbs: +minAbs.toFixed(2), north: dark, south: lit,
      capLat: window.IntMapNightSide.state().capLat };
  });
  expect(cap.minAbs, 'no cap wedge reaches below the image').toBeGreaterThanOrEqual(cap.capLat - 0.001);
  /* exactly one pole is in darkness at any date outside the equinoxes — never both, never neither */
  expect(cap.north === 0 || cap.south === 0, `one pole is lit: ${JSON.stringify(cap)}`).toBe(true);
  expect(cap.n, 'and the dark one is covered').toBeGreaterThan(0);

  /* PIXELS: the same frame with the effect on and off, on the antisolar meridian. #R200 measured
     0.87 through the five polygons and pinned 0.75; the image replaces the basemap outright, so the
     threshold moves with the mechanism.
     ⚠ MEASURED AGAINST A KNOWN BACKGROUND, NOT AGAINST A TILE SERVER. This spec is hermetic (see
     tests/helpers/network.js): Carto, Esri and GIBS are all blocked, so there is nothing under the
     night side to darken and the first version of this test read 0 and blamed the basemap — the
     screenshot showed a black globe. What is under the effect is not what is being measured; HOW
     MUCH OF IT SURVIVES is. So the bottom of the style gets one flat mid-grey layer, which is
     same-origin, identical on every run, and makes the ratio below mean exactly what it says. */
  await page.evaluate(() => {
    const m = window.__imap;
    if (!m.getLayer('r201-bg')) m.addLayer({ id: 'r201-bg', type: 'background',
      paint: { 'background-color': '#c9c9c9' } }, m.getStyle().layers[0].id);
  });
  await page.waitForTimeout(1200);

  const px = await page.evaluate(async () => {
    const m = window.__imap;
    const settle = () => new Promise((r) => { m.once('idle', r); setTimeout(r, 5000); });
    const wrap = (x) => ((x % 360) + 540) % 360 - 180;
    const now = new Date(), utc = now.getUTCHours() + now.getUTCMinutes() / 60;
    const anti = wrap(wrap((12 - utc) * 15) + 180);
    /* ⚠ MERCATOR, AND THE WHOLE WORLD IN ONE FRAME. Two things made the globe version of this
       measurement unstable, and both are about WHERE the point is rather than about the effect:
       the antisolar meridian is wherever the clock puts it, and on a globe the FAR SIDE of the
       planet still projects to a screen position — so the sample can land on empty space (read 0)
       or on the limb (read a fraction). Flat, at the widest zoom, the point being measured is on
       screen at a fixed place at every hour of the day. CI measured 0.49 twice from that coupling
       while this machine and production both give > 0.9. */
    m.setProjection({ type: 'mercator' });
    m.jumpTo({ center: [anti, 0], zoom: 1.1, pitch: 0, bearing: 0 });
    const sample = () => {
      const cv = m.getCanvas(), g = document.createElement('canvas');
      g.width = cv.width; g.height = cv.height;
      const cx = g.getContext('2d'); cx.drawImage(cv, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      const sx = cv.width / cv.clientWidth, sy = cv.height / cv.clientHeight;
      const p = m.project([anti, -20]);
      const c = Math.round(p.x * sx), r = Math.round(p.y * sy);
      if (!(r > 4 && c > 4 && r < cv.height - 4 && c < cv.width - 4)) return null;
      let s = 0, n = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const k = ((r + dy) * cv.width + (c + dx)) * 4; s += 0.30 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2]; n++; }
      return +(s / n).toFixed(1);
    };
    window.IntMapNightSide.setEnabled(false);
    await settle();
    const off = sample();
    /* ⚠ WAIT FOR THE REBUILD, DO NOT TIME IT. `setEnabled(true)` schedules `consider()`, which builds
       on the next IDLE (up to a 2.5 s fallback) and only then paints — so a fixed 1,500 ms is a test
       of how fast the runner is, and on a loaded one it sampled a half-built effect: CI measured
       0.567 three times while this machine and production both give > 0.9. Wait for the state the
       assertion is about, then force the repaint. */
    window.IntMapNightSide.setEnabled(true);
    for (let i = 0; i < 120 && !window.IntMapNightSide.state().built; i++) await new Promise((r) => setTimeout(r, 250));
    window.IntMapNightSide.refresh();
    await new Promise((r) => setTimeout(r, 600));
    await settle();
    const on = sample();
    const built = window.IntMapNightSide.state().built;
    /* put the projection back — ③ is about the ZOOM FLOOR, which is the globe's */
    m.setProjection({ type: 'globe' });
    await new Promise((r) => setTimeout(r, 800));
    return { anti: +anti.toFixed(1), on, off, built };
  });
  expect(px.built, 'the night side rebuilt after being switched back on').toBe(true);
  expect(px.off, 'the unshaded basemap has to be bright enough to measure against').toBeGreaterThan(60);
  expect(1 - px.on / px.off, `night side at ${px.anti}°: ${px.off} → ${px.on}`).toBeGreaterThan(0.9);

  /* the terminator is a real solar computation: midnight and noon on the same meridian differ */
  const night = await page.evaluate(() => {
    const d = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));    /* solstice noon UTC: 0°E is lit */
    return { lit: window.IntMapNightSide._nightAt(0, 0, d), dark: window.IntMapNightSide._nightAt(180, 0, d) };
  });
  expect(night.lit, 'the sub-solar meridian is day').toBeLessThan(0.05);
  expect(night.dark, 'and the antimeridian is night').toBeGreaterThan(0.95);
});

/* ── ② 「クリック可能ではない！ほかの地名ラベルと違う挙動にするな！」 ──────────────────────── */
test('R201 ② a prefecture / state label opens the same popup a city label does', async () => {
  test.setTimeout(240_000);
  /* the suite seeds `{"layers":[]}` (playwright.config.js), so the names layer is off here */
  const on = await page.evaluate(() => {
    const c = document.getElementById('cb-names');
    if (!c) return false;
    if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }
    return true;
  });
  expect(on, 'the Place-names switch exists').toBe(true);
  /* Japan at z6: #R198 measured the prefectures entering there (class `province`, rank 5) */
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [138.4, 36.2], zoom: 6.2, pitch: 0, bearing: 0 }));

  /* ⚠ TWO COORDINATE SPACES, AND MIXING THEM LOOKS EXACTLY LIKE THE DEFECT UNDER TEST. `map.project`
     answers in the MAP CONTAINER's pixels; `page.mouse.click` and `elementsFromPoint` want the
     VIEWPORT's. The container starts 440 px in on this layout (the sidebar), so the first version of
     this test asked whether the map was on top at a point 440 px to the left of the label — got the
     sidebar every time — and would have reported "the label is not clickable", which is the very
     thing it exists to check. Measured: the canvas rect is {l:440, t:0, w:840, h:820}.
     ⚠ AND THE DOM CHECK STAYS. #R196 spent a round on a tap that landed on a panel covering the map;
     here the Köppen legend really does sit over four of the ten prefecture labels. */
  const found = await page.waitForFunction(() => {
    const m = window.__imap;
    if (!m.getLayer('ofm-admin1')) return null;
    const cv = m.getCanvas(), r0 = cv.getBoundingClientRect();
    for (const f of m.queryRenderedFeatures({ layers: ['ofm-admin1'] })) {
      const g = f.geometry;
      if (!g || g.type !== 'Point') continue;
      const p = m.project(g.coordinates);
      const x = Math.round(r0.left + p.x), y = Math.round(r0.top + p.y);
      if (!(x > 4 && y > 4 && x < window.innerWidth - 4 && y < window.innerHeight - 4)) continue;
      const top = document.elementsFromPoint(x, y)[0];
      if (top !== cv && !(top && top.tagName === 'CANVAS')) continue;
      return { name: f.properties.name, x, y };
    }
    return null;
  }, null, { timeout: 60_000 }).then((h) => h.jsonValue());
  expect(found, 'an admin-1 label is on the map and nothing is covering it').toBeTruthy();

  await page.mouse.click(found.x, found.y);
  await page.waitForSelector('.plc-popup', { timeout: 20_000 });
  const popup = await page.evaluate(() => {
    const el = document.querySelector('.plc-popup');
    return { text: (el.textContent || '').trim(),
      copy: !!el.querySelector('.plc-copy'), ai: !!el.querySelector('.plc-ai'),
      /* a region HAS an area, so the area tools are NOT suppressed the way water/terrain labels are */
      iso: !!el.querySelector('.plc-iso'), move: !!el.querySelector('.plc-move') };
  });
  expect(popup.text, `the popup names the region: ${JSON.stringify(found)}`).toContain(found.name);
  expect(popup.copy && popup.ai, 'the same Copy / AI brief row every place label gets').toBe(true);
  expect(popup.iso && popup.move, 'and the area tools, because a prefecture has an area').toBe(true);
  await page.evaluate(() => { const b = document.querySelector('.plc-popup .maplibregl-popup-close-button'); if (b) b.click(); });
});

/* ── ③ 「ボタンで押す形式ではなく…ズームアウトし続ければそのまま宇宙まで」 ─────────────────── */
test('R201 ③ space is reached by continuing to zoom out, and left by continuing to zoom in', async () => {
  test.setTimeout(240_000);
  expect(await page.evaluate(() => !!document.getElementById('space-btn')),
    'there is no button any more — the zoom is the way in').toBe(false);

  /* above the floor the gesture is an ordinary zoom-out and this module must not accumulate it */
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ center: [0, 10], zoom: 3, pitch: 0, bearing: 0 }));
  await page.waitForTimeout(600);
  const above = await page.evaluate(() => {
    for (let i = 0; i < 6; i++) window.IntMapSpace._pushOut(0.5);
    const s = window.IntMapSpace.state();
    return { over: s.overzoom, open: s.open, atFloor: s.atFloor };
  });
  expect(above.atFloor).toBe(false);
  expect(above.over, 'a zoom-out the camera CAN spend is not an attempt to leave').toBe(0);
  expect(above.open).toBe(false);

  /* on the floor it fills, and says so, and only then crosses */
  await page.evaluate(() => window.IntMapGeoEngine.camera.jumpTo({ zoom: window.IntMapGeoEngine.camera.getMinZoom() }));
  await page.waitForFunction(() => window.IntMapSpace.atFloor(), null, { timeout: 20_000 });
  const filling = await page.evaluate(() => {
    window.IntMapSpace._pushOut(0.5); window.IntMapSpace._pushOut(0.5);
    const s = window.IntMapSpace.state();
    return { over: s.overzoom, trigger: s.overTrigger, gauge: s.gaugeVisible, open: s.open };
  });
  expect(filling.over, 'the integral is filling').toBeGreaterThan(0);
  expect(filling.over, 'and one flick is not a launch').toBeLessThan(filling.trigger);
  expect(filling.gauge, 'the gauge says what the gesture is doing').toBe(true);
  expect(filling.open, 'still on the map').toBe(false);

  await page.evaluate(() => { window.IntMapSpace._pushOut(0.5); window.IntMapSpace._pushOut(0.5); });
  await page.waitForFunction(() => window.IntMapSpace.state().open, null, { timeout: 40_000 });
  await page.waitForFunction(() => { const s = window.IntMapSpace.state(); return s.stars > 1000; }, null, { timeout: 60_000 });
  const opened = await page.evaluate(() => window.IntMapSpace.state());
  expect(opened.mode).toBe('system');
  expect(opened.focus).toBe('earth');
  /* ⚠ a WebGL context that never draws still reports a size — read the pixels back */
  const px = await page.evaluate(() => window.IntMapSpace._sample(240, 160));
  expect(px.lit, 'something is drawn out there').toBeGreaterThan(20);

  /* …and the same gesture, mirrored, brings the map back */
  const back = await page.evaluate(async () => {
    const ov = document.getElementById('space-ov');
    for (let i = 0; i < 120; i++) ov.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 1500));
    return { open: window.IntMapSpace.state().open, atNear: window.IntMapSpace.state().atNearLimit };
  });
  expect(back.atNear, 'the space camera ran out of zoom to spend').toBe(true);
  expect(back.open, 'and kept pushing, so it came back').toBe(false);

  const errs = diag.pageErrors.filter((m) => /before initialization|is not a function|is not defined/.test(m));
  expect(errs, 'no reference error escapes the crossing').toEqual([]);
});
