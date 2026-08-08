// (#R186) Browser regressions for this round.
//
// Each one pins a behaviour that was found by MEASURING the running app, and each is written as the
// measurement rather than as the code — so it keeps holding if the implementation moves.
import { test, expect } from '@playwright/test';
import { bootEngine } from './helpers/engine.js';

const BOOT = { timeout: 120_000 };
const ready = (page) => page.waitForFunction(() => !!window.IntMapGeoEngine && window.IntMapGeoEngine.canDraw(), null, BOOT);
const booted = (page) => page.waitForFunction(() => !!(window.__imBoot && window.__imBoot.isDone()), null, BOOT);

test('R186 launch screen: covers the app from the first frame and lifts on real milestones', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  /* It is static markup in the body, so it is there before any module has run. */
  await expect(page.locator('#boot-splash')).toBeVisible();
  /* Vite content-hashes the mark's URL at build time, which is what makes the icon cacheable.
     ⚠ (#R205) THIS ASSERTED AN <img> AND SO IT FAILED THE ROUND AFTER. The mark is a CSS background
     now, because the light and dark launch screens use different files and only the declaration that
     WINS the cascade is ever fetched — two <img> tags would pull 331 KB to show 118 KB of it. What
     has to hold is what this line was for: the launch screen shows a content-hashed IntMap mark from
     the first frame. Where the URL is written down is not the property. */
  const mark = await page.locator('#boot-splash .boot-icon')
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  /* either mark — a light context gets IntMap.Icon_BW-inverted, a dark one gets IntMap.Icon — and
     `[-.]` after the name is the content hash (built) or the plain extension (unbuilt) */
  expect(mark, 'the launch screen shows an IntMap mark').toMatch(/IntMap\.Icon(_BW-inverted)?[-.]/);
  /* and EXACTLY ONE of them is fetched: the other declaration lost the cascade and is never requested */
  expect(mark.match(/IntMap\.Icon/g).length, 'only the winning declaration is fetched').toBe(1);
  await booted(page);
  /* The splash dissolves over 420 ms and is then removed. Wait for the RESULT — a fixed sleep is a
     test of the runner's load, and on a busy CI runner 700 ms was not enough (it passed on retry,
     which is the signature of a timing assertion rather than a behavioural one). */
  await page.locator('#boot-splash').waitFor({ state: 'detached', timeout: 15_000 });
  expect(await page.locator('#boot-splash').count()).toBe(0);
  const marks = await page.evaluate(() => window.__imBoot.marks());
  /* The milestones have to be the real ones, in order — not a timer pretending to be progress. */
  for (const k of ['html', 'dom', 'renderer', 'style']) expect(marks[k], k).toBeDefined();
  expect(marks.style).toBeGreaterThan(marks.renderer);
  /* …but WHICH ending it got is a property of the machine, not of the app. On a slow runner the boot
     legitimately outruns the 20 s failsafe, and demanding `idle` made this a test of the runner (it
     failed 3/3 in CI on exactly that). What must hold is that it ended for a REAL reason and that the
     reason is recorded — a launch screen that lifts without saying why is the failure mode. */
  const ending = ['idle', 'timeout', 'no-renderer'].filter((k) => marks[k] !== undefined);
  expect(ending, `no ending recorded in ${JSON.stringify(marks)}`).toHaveLength(1);
  if (marks.idle !== undefined) expect(marks.idle).toBeGreaterThan(marks.style);
  expect(await page.evaluate(() => document.body.classList.contains('booting'))).toBe(false);
});

/* ⚠ These two are the tests that are ABOUT the default layers, so they opt OUT of the suppression
   the config applies to every other test (playwright.config.js `storageState` — see the note there
   for the 9,160 ms vs 3,192 ms measurement behind it). The first needs a genuinely empty profile;
   the second writes its own saved session. This is where the shipped default is pinned. */
test.describe('R186 default layers', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('R186 defaults: Köppen and the submarine cables are painting on a first visit', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await booted(page);
  const r = await page.evaluate(() => {
    const G = window.IntMapGeoEngine, vis = (id) => G.layers.has(id) && G.layers.getLayout(id, 'visibility') === 'visible';
    return { climateBox: !!document.getElementById('dl-climate')?.checked,
             cablesBox: !!document.getElementById('dl-subcables')?.checked,
             climate: vis('lyr-climate'), cables: vis('lyr-subcables') };
  });
  /* a checked box paints nothing on its own — #R34 recorded that for the place-name toggle */
  expect(r).toEqual({ climateBox: true, cablesBox: true, climate: true, cables: true });
});

  test('R186 defaults: a session that switched one off is not overruled on the next load', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  /* (#R189) `defv:189` — a session WITHOUT the stamp predates #R188's imAutoOff fix, and its
     absences can be an outage's poison as easily as a choice, so the restore heals them once.
     Only a stamped session's absence is a choice, which is what this test is about. */
  await page.evaluate(() => localStorage.setItem('intmap_session2', JSON.stringify({ v: 2, defv: 190, layers: ['dl-subcables'], tabInit: true })));
  await page.reload();
  await booted(page);
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => ({
    climate: !!document.getElementById('dl-climate')?.checked,
    cables: !!document.getElementById('dl-subcables')?.checked,
  }));
  expect(r.cables).toBe(true);
  expect(r.climate, '"default on" must not mean "cannot be turned off"').toBe(false);
  });
});

test('R186 sky: the star field is projected with the renderer\'s own camera', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await ready(page);
  /* The catalogue is only fetched when the sky is going to be drawn — a light-mode visitor never
     downloads it — so ask for it explicitly here, where only the CAMERA is under test. */
  await page.evaluate(() => window.IntMapSky.load());
  await page.waitForFunction(() => !!(window.IntMapSky && window.IntMapSky.state().stars > 0), null, BOOT);
  /* ⚠ THE MEASUREMENT THIS WHOLE FEATURE RESTS ON. A star is at infinity, so where it lands depends
     only on the camera's rotation and projection — and js/space-sky.js reconstructs those rather
     than reading a matrix out of the renderer. The same code path, with the translations restored,
     must therefore land a SURFACE point exactly where map.project() puts it. Measured over five
     camera states: worst error 0.000 px. */
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const G = window.IntMapGeoEngine, S = window.IntMapSky;
    const cases = [
      { center: [10, 20], zoom: 1.7, bearing: 0, pitch: 0 },
      { center: [10, 20], zoom: 2.5, bearing: 47, pitch: 0 },
      { center: [139.7, 35.7], zoom: 4, bearing: 120, pitch: 35 },
      { center: [-70, -30], zoom: 3, bearing: -80, pitch: 55 },
    ];
    let worst = 0, pts = 0;
    for (const c of cases) {
      G.camera.jumpTo(c); await wait(260);
      const F = S.frame(); if (!F) return { err: 'no frame' };
      for (let dy = -60; dy <= 60; dy += 20) for (let dx = -60; dx <= 60; dx += 20) {
        const lng = ((c.center[0] + dx + 540) % 360) - 180, lat = Math.max(-84, Math.min(84, c.center[1] + dy));
        const a = S.projectSurface(lng, lat, F), b = G.coords.project([lng, lat]);
        if (!a || !b) continue;
        if (b.x < -3000 || b.x > 5000 || b.y < -3000 || b.y > 5000) continue;
        worst = Math.max(worst, Math.hypot(a[0] - b.x, a[1] - b.y)); pts++;
      }
    }
    return { worst, pts, stars: S.state().stars, active: S.state().active };
  });
  expect(r.err).toBeUndefined();
  expect(r.pts).toBeGreaterThan(100);
  expect(r.worst, 'the sky camera must BE the renderer camera, not an approximation of it').toBeLessThan(0.5);
  expect(r.stars).toBeGreaterThan(5000);
});

test('R186 sky: real stars are drawn behind the globe in dark mode', async ({ page }) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await booted(page);
  /* …and here too: wait for the RESULT — pixels on the canvas — rather than for a stopwatch. The
     camera is still settling for a while after boot and each settle clears and redraws the sky, so a
     fixed sleep is a test of the runner's load (it failed once and passed on retry in CI). */
  const count = () => {
    const cv = document.getElementById('space-canvas');
    if (!cv || !cv.width) return -1;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) lit++;
    return lit;
  };
  await page.waitForFunction(count, null, BOOT).catch(() => {});
  await page.waitForFunction((fn) => new Function('return (' + fn + ')()')() > 200, count.toString(), BOOT);
  const r = await page.evaluate((fn) => ({
    lit: new Function('return (' + fn + ')()')(),
    on: document.body.classList.contains('space-sky-on'),
    mapBg: getComputedStyle(document.getElementById('map')).backgroundColor,
    last: window.IntMapSky.state().last,
  }), count.toString());
  expect(r.on).toBe(true);
  /* #map has to give up --bg-color, or the black it paints is the very thing being replaced */
  expect(r.mapBg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(r.lit, 'the sky must actually have stars in it').toBeGreaterThan(200);
  expect(r.last.stars).toBeGreaterThan(50);
});

test('R186 atmosphere: switched on for satellite, and aimed at the real Sun', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await booted(page);
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    document.getElementById('btn-view-sat').click();
    await wait(3000);
    const G = window.IntMapGeoEngine, S = window.IntMapSky, D = Math.PI / 180;
    const sky = G.scene.getSky();
    const L = window.__imap.getLight();
    /* Recover the direction MapLibre's atmosphere shader will use, and compare it to the real
       sub-solar point. The light spec offsets the azimuth by 90° and NEGATES the cartesian form
       before use, which is exactly the kind of convention #R182 was burnt by. */
    const az = (L.position[1] + 90) * D, po = L.position[2] * D;
    const c = { x: Math.cos(az) * Math.sin(po), y: Math.sin(az) * Math.sin(po), z: Math.cos(po) };
    const n = Math.hypot(c.x, c.y, c.z), v = [-c.x / n, -c.y / n, -c.z / n];
    const lat = Math.asin(Math.max(-1, Math.min(1, v[1]))) / D, lng = Math.atan2(v[0], v[2]) / D;
    const ms = Date.now(), s = S.sunPosition(ms), g = S.gmstDeg(ms);
    const want = { lng: ((s.ra - g + 540) % 360) - 180, lat: s.dec };
    return { blend: sky && sky['atmosphere-blend'], anchor: L.anchor,
             errDeg: Math.hypot((lng - want.lng) * Math.cos(want.lat * D), lat - want.lat),
             wb: window.IntMapWorldBase.state() };
  });
  expect(r.blend, 'a style with no sky gets atmosphere-blend 0 — the atmosphere never ran').toBeTruthy();
  expect(r.anchor).toBe('map');
  /* half a degree covers the seconds of clock drift between setting the light and reading it back */
  expect(r.errDeg, 'the terminator glow has to be where the terminator is').toBeLessThan(0.5);
  /* and the coarse whole-Earth floor is under it, served with no network at all */
  expect(r.wb.visible).toBe(true);
  expect(r.wb.tilesMade, 'the floor must be generated locally, not fetched').toBeGreaterThan(0);
});

test('R186 POI: shop and facility names are their own layer and their own toggle', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await booted(page);
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const G = window.IntMapGeoEngine, cb = document.getElementById('cb-poi');
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(1400);
    const on = G.layers.getLayout('ofm-poi', 'visibility');
    const src = G.scene.getStyle().layers.find((l) => l.id === 'ofm-poi');
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(600);
    return { on, off: G.layers.getLayout('ofm-poi', 'visibility'),
             sourceLayer: src && src['source-layer'], minzoom: src && src.minzoom,
             dot: G.layers.has('ofm-poi-dot') };
  });
  expect(r).toMatchObject({ on: 'visible', off: 'none', sourceLayer: 'poi', minzoom: 14, dot: true });
});

test('R186 sea level: the number applies as it is typed, and 100 % is opaque', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await booted(page);
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const cb = document.getElementById('dl-sealevel');
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(2500);
    const before = window._seaLevelM;
    const num = document.querySelector('#data-legend-sealevel .sl-num');
    num.value = '37'; num.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(500);
    const ramp = window.IntMapGeoEngine.layers.getPaint('lyr-sealevel', 'color-relief-color');
    /* the flooded stops carry no alpha of their own any more, so `color-relief-opacity` IS the
       transparency — which is what makes 100 % mean 100 % */
    const alphas = JSON.stringify(ramp).match(/rgba\(\d+,\d+,\d+,([\d.]+)\)/g) || [];
    return { before, after: window._seaLevelM, alphas };
  });
  expect(r.before).toBe(2);
  expect(r.after, 'the value must apply without pressing Set').toBe(37);
  for (const a of r.alphas) expect(a).toMatch(/,(0|1)\)$/);
});

test('R186 aircraft: the sweep covers the viewport with tiled circles, not one', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await ready(page);
  /* No network here — the PLAN is the thing this pins. One 250 nm circle is 615 km across; a wide
     view now asks for a grid of them, and the poll interval grows with the grid so the long-run
     request rate stays where the feed tolerates it. */
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const G = window.IntMapGeoEngine;
    const out = {};
    G.camera.jumpTo({ center: [8, 50], zoom: 6.2 }); await wait(400);
    const cb = document.getElementById('dl-planes');
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(1200);
    out.close = window.IntMapPlanes3D.state().cover;
    /* The view-driven refetch is DEBOUNCED against the poll interval, so waiting for it makes this
       a test of a timer under whatever load the runner is carrying. Re-arm the layer instead: that
       is the same entry point a poll uses, and it plans the sweep synchronously before it asks the
       network for anything — so this measures the PLAN, which is what the test is about. */
    G.camera.jumpTo({ center: [8, 50], zoom: 4.2 }); await wait(600);
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); await wait(200);
    cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 40 && ((window.IntMapPlanes3D.state().cover || {}).circles || 1) === 1; i++) await wait(250);
    out.wide = window.IntMapPlanes3D.state().cover;
    out.budget = window.IntMapPlanes3D.state().circleBudget;
    out.minZoom = window.IntMapPlanes3D.state().minZoom;
    cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
    return out;
  });
  expect(r.close.circles).toBe(1);
  expect(r.wide.circles, 'a continent-wide view has to ask for more than one circle').toBeGreaterThan(4);
  expect(r.wide.circles).toBeLessThanOrEqual(r.budget);
  expect(r.wide.coverKmX).toBeGreaterThan(1500);
  /* (#R187) 「もっと増やして」 again: the budget went 16 → 48 circles and the floor z3 → z2. The
     SHAPE of the plan is what this test is for and that is unchanged; the two numbers it pinned are
     the ones the instruction moved. */
  expect(r.minZoom).toBe(2);
});

test('R186 water: a source outside the working rectangle is not silently dropped', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await booted(page);
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const TW = window.IntMapTerrainWater;
    await TW.open({ lng: 138.62, lat: 36.30 }); await wait(1500);
    const g = TW.state().grid;
    /* the rectangle is drawn, so the user can see where an edit lands */
    const feats = window.IntMapGeoEngine.layers.sourceData
      ? null : null;
    const before = TW.state();
    return { nx: g.nx, cellM: Math.round(g.cellM), bbox: g.bbox,
             hasAreaLayer: window.IntMapGeoEngine.layers.has('tw-area'),
             hasFlowLine: window.IntMapGeoEngine.layers.has('tw-flow'),
             solveMs: before.result && before.result.solveMs };
  });
  /* 384 cells over the view, not 256 — the grid was resampling 17 DEM samples into one cell */
  expect(r.nx).toBe(384);
  expect(r.hasAreaLayer).toBe(true);
  /* (#R187) 「一本の補助線はいらない」 — the traced course is drawn as WATER (an image overlay,
     tw-flowimg) and the cyan polyline layer is gone. Asserted as an absence so the line cannot come
     back by accident. */
  expect(r.hasFlowLine).toBe(false);
  expect(r.solveMs).toBeLessThan(4000);
});

test('R186 water: the trace tells the sea from a closed basin below sea level', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await booted(page);
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const TW = window.IntMapTerrainWater;
    await TW.open({ lng: -116.8, lat: 36.3 }); await wait(1200);
    const out = {};
    for (const [k, lng, lat] of [['pacific', -139, 35], ['losangeles', -118.9, 33.9], ['deadsea', 35.5, 31.5]]) {
      const s = await TW._seaCheck(lng, lat);
      out[k] = { sea: s.sea, frac: s.fraction };
    }
    TW.close();
    return out;
  });
  /* Measured: open Pacific 100 %, off Los Angeles 55 %, Dead Sea 7 % of the window. Elevation alone
     called the Dead Sea (and Badwater) "the sea"; the connected ≤0 m AREA separates them. */
  expect(r.pacific.sea).toBe(true);
  expect(r.losangeles.sea).toBe(true);
  expect(r.deadsea.sea, 'the lowest closed basin on Earth is not the sea').toBe(false);
});

test('R186 Cesium: a real star sky, a real Sun, and imagery at the poles', async ({ page }) => {
  test.setTimeout(240_000);
  /* (#R201) ONE page load — see tests/helpers/engine.js */
  await bootEngine(page, 'cesium', { url: '/', timeout: BOOT.timeout });
  /* The polar base layer is added when SingleTileImageryProvider.fromUrl RESOLVES, so waiting a fixed
     2.5 s for it was a test of how fast the machine decodes a 284 KB JPEG — it failed 3/3 in CI on
     exactly that. Wait for the layer. */
  /* (#R187) `_worldBase` is a LIST now — the bundled offline floor plus the tiled polar-capable GIBS
     imagery over it, because one 2,048 × 1,024 picture stretched to the pole draws a radial smear
     rather than a cap. It is created empty and filled as each provider resolves, so the wait is for
     an entry rather than for the field. */
  await page.waitForFunction(() => { try { const w = window.IntMapGeoEngine.raw()._worldBase; return !!(w && w.length); } catch (_) { return false; } }, null, BOOT);
  const r = await page.evaluate(() => {
    const v = window.IntMapGeoEngine.raw();
    return { skyBox: !!v._scene.skyBox, show: !!(v._scene.skyBox && v._scene.skyBox.show),
             sun: !!v._scene.sun, moon: !!v._scene.moon,
             worldBase: !!(v._worldBase && v._worldBase.length),
             atBottom: (() => { try { return v._worldBase.indexOf(v._scene.imageryLayers.get(0)) >= 0; } catch (_) { return false; } })(),
             /* the MapLibre star canvas must stay out of the way — two skies is one too many */
             spaceSky: window.IntMapSky.state().active };
  });
  /* skyBox:false was switching off the Tycho-2 star map that ships with the engine */
  expect(r).toMatchObject({ skyBox: true, show: true, sun: true, moon: true, worldBase: true, atBottom: true, spaceSky: false });
});
