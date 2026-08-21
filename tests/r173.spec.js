// R173 behavioural checks in a real browser.
//
// Each of these measures the thing the report was about, not the mechanism behind it:
//   1. the cockpit is on a SPHERE — judged by the horizon sitting at the true dip below eye level,
//      which is exactly 0 on a flat map and grows with altitude on a round one;
//   2. tilting with the ceiling lifted does not move the viewpoint — by any route (drag, keyboard,
//      programmatic, ease), and a journey still lands where it was asked to;
//   3. the 3-D volume is a closed body, and it is the body that draws;
//   4. an aircraft can be picked WHERE IT IS DRAWN and its click draws the observed track — driven by
//      a stubbed ADS-B feed (#R170b) so the numbers are exact.
import { test, expect } from '@playwright/test';
import { loadLazyModules } from './helpers/app.js';

/* ⚠ (#R186) See the same note in tests/r172.spec.js. Köppen is on by default now, its legend covers
   the part of the map these drags start on, and a gesture that lands on a legend never reaches the
   renderer — measured as a tilt drag that moved the camera exactly 0 m. The subject here is the
   viewpoint, so the boot restores the map these tests were written against.

   Written as a SAVED SESSION rather than as clicks after boot — the layers are then never created at
   all, which is cheaper than creating and removing them on a runner with no GPU, where the cockpit
   test in this file is already at its wall-clock budget. */
const clearDefaultLayers = async (page) => {
  await page.addInitScript(() => {
    /* (#R189) `defv` — without the generation stamp `_restore()` reads this as a pre-#R188 session
       whose absences may be an outage's poison, and heals the default-on layers back on. */
    try { localStorage.setItem('intmap_session2', JSON.stringify({ v: 2, defv: 190, layers: [], tabInit: true, lsrOpen: false })); } catch (_) {}
  });
};

const boot = async page => {
  await clearDefaultLayers(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(600);   /* (#R212) the style is already loaded — this tail was 1.5 s in 20 specs */
};

/* the eye, as the engine reports it */
const eye = page => page.evaluate(() => { const E = window.IntMapGeoEngine.camera.eye();
  return { lng: E.lng, lat: E.lat, alt: E.alt }; });
const metres = (a, b) => Math.hypot((b.lng - a.lng) * 91000, (b.lat - a.lat) * 111320);
/* the sim's own pause (the P key), so the camera stops being rewritten every frame */
const pause = async page => { await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
    /* the release matters: the sim ignores a key that is already held, so a keydown on its own
       pauses once and every later one is swallowed */
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'p', bubbles: true })); });
  await page.waitForTimeout(2500); };

test('the cockpit contains a real world, with the viewpoint at the aeroplane (#R173 globe withdrawn in #R174)', async ({ page }) => {
  /* Generous, because a cockpit is the heaviest thing this app draws and CI has no GPU. Measured in
     headless software GL: the flat cockpit ran at 5 fps and the spherical one at 3 — the extra cost is
     real (more of what is in front of the aeroplane is actually drawn), and on a machine rendering in
     software it pushes a fixed-wall-clock test past three minutes. On a GPU the same test takes ~1 min. */
  test.setTimeout(420000);
  await boot(page);
  /* (#R209) the simulator is no longer in the boot bundle — `window.IntMapFlightSim` exists only once
     `IntMapLazy.need('flightSim')` has resolved, which is what the app's own entry point awaits
     before it calls start(). The keyboard the `pause` helper drives is registered by that same
     module, so it has to arrive before the sim is started, not after. */
  await loadLazyModules(page);
  await page.evaluate(() => window.IntMapFlightSim.start({ lng: 138.66, lat: 35.05, alt: 6000, hdg: 0 }));
  await page.waitForTimeout(9000);
  /* PAUSE before measuring. Everything asserted below is a property of the camera and the frame on
     screen, not of the aeroplane moving — and a paused cockpit stops re-writing the whole camera 60
     times a second, which is what made a GPU-less runner take seven minutes to answer a page.evaluate
     (it answers in seconds here). The physics is frozen, the view is not. */
  await pause(page);

  const s = await page.evaluate(() => {
    const m = window.__imap, S = window.IntMapFlightSim._st();
    return { active: window.IntMapFlightSim.active(), zoom: m.getZoom(), globeness: window.IntMapGeoEngine.camera.globeness(),
      alt: S.alt, eyeAlt: window.IntMapGeoEngine.camera.altitude(), terrain: !!m.getTerrain(),
      proj: JSON.stringify(m.getProjection()), sky: !!document.querySelector('#map .fs-sky') };
  });
  expect(s.active).toBe(true);
  expect(s.terrain, 'a flight simulator does not trade away its DEM').toBe(true);
  expect(s.proj, 'the sim flies the app Globe, never a raw projection spec').toContain('globe');
  /* (#R174) THE POINT OF #R173 WAS WITHDRAWN, and this is where the record belongs. Putting the camera
     in the renderer's spherical regime meant the map could not look above the horizon at all — measured
     while pulling the nose up, the map's pitch stayed at 85.4° for every frame from 92° to 165° of view
     angle, with 1,077 px of padding compensating on a 720 px window. A flight simulator that cannot look
     up is not one, so the cockpit is back at working zoom and the sky is the renderer's again. What this
     test still guards — and what was always the valuable half — is that the cockpit contains a WORLD, that
     the viewpoint is AT the aeroplane, and that the DEM is under it. Looking up is guarded by
     tests/r174.spec.js. */
  expect(s.zoom, 'the cockpit sits where the DEM and the sky both work').toBeGreaterThan(11.1);
  expect(Math.abs(s.eyeAlt - s.alt), 'the viewpoint is at the aircraft').toBeLessThan(120);
  expect(s.sky, 'and the sim paints no sky of its own — that is the renderer’s job').toBe(false);

  /* the cockpit contains a WORLD (#R172's lesson: measure pixels, not projection names).
     A small patch, decoded in the page: a full-width screenshot decoded on top of a live cockpit
     crashed the tab on a GPU-less CI runner, and a few hundred square pixels of ground say the same. */
  const vp = page.viewportSize();
  const png = (await page.screenshot({ clip: { x: Math.round(vp.width * 0.30), y: Math.round(vp.height * 0.62),
    width: Math.round(vp.width * 0.30), height: Math.round(vp.height * 0.20) } })).toString('base64');
  const colours = await page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3));
    return seen.size;
  }, png);
  expect(colours, 'the lower half of the cockpit must contain real ground').toBeGreaterThan(40);

  // near the ground the map goes back to the flat regime, where the imagery is sharpest
  await pause(page);                                        // …flying again for the descent
  await page.evaluate(async () => { const S = window.IntMapFlightSim._st(), t = (S._terrF || 0) + 250, a0 = S.alt;
    for (let i = 0; i < 25; i++) { S.alt = a0 + (t - a0) * (i + 1) / 25; await new Promise(r => setTimeout(r, 60)); } });
  await page.waitForTimeout(5000);                          // the camera follows the altitude every frame
  /* ⚠ (#R304) PAUSE BEFORE MEASURING, WHICH IS THIS FILE'S OWN RULE AND WAS APPLIED ONLY ONCE.
     The block above says it: 「Everything asserted below is a property of the camera and the frame on
     screen, not of the aeroplane moving」. The descent measurement never paused, so the physics kept
     flying — and with the DEM not yet under the aircraft (measured: `_terrF` 0, so the ramp targets
     250 m and the model then climbs away from it at ~10 m/s) the reading lands wherever the five
     seconds happened to end. MEASURED as exactly that: this test passes alone and on CI, and failed
     twice on a busy machine by ~250 m. ⚠ THE CAMERA IS NOT THE SUSPECT — sampled every 2 s through
     the whole descent, `eyeAlt` tracks `alt` to within 0.1 m at every step, terrain arriving
     mid-descent included. Freezing the model is what makes the number the camera's rather than the
     stopwatch's. */
  await pause(page);
  const low = await page.evaluate(() => ({ globeness: window.IntMapGeoEngine.camera.globeness(),
    zoom: window.__imap.getZoom(), alt: window.IntMapFlightSim._st().alt,
    eyeAlt: window.IntMapGeoEngine.camera.altitude() }));
  expect(low.alt).toBeLessThan(1200);
  expect(low.globeness, 'on approach the curvature is invisible and the detail is what matters').toBeLessThan(0.5);
  expect(Math.abs(low.eyeAlt - low.alt), 'and the viewpoint is still at the aircraft').toBeLessThan(120);
  expect(low.zoom, 'still at working zoom on the descent').toBeGreaterThan(11.1);
  await page.evaluate(() => window.IntMapFlightSim.stop());
});

test('the 3-D volume is a closed body — one solid, with a floor', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => document.getElementById('btn-tool-volume').click());
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => {
    const V = window.IntMapVolume3D;
    V.setAltitudes(1000, 3000); V.setStyle('#ff3b30', 0.45);
    V.setRing(V.circleRing([139.85, 35.60], 3000, 48));
    return V.state();
  });
  await page.waitForTimeout(1200);
  expect(st.canSolid, 'MapLibre can draw a closed body (a custom mesh, not an extrusion)').toBe(true);
  expect(st.body, 'and that is what is painted').toBe(true);
  expect(st.shell, 'the open shell is not painted at the same time').toBe(false);
  expect(st.points).toBe(48);

  // every footprint shape still reaches the same body
  for (const shape of ['rect', 'freehand', 'polygon', 'circle']) {
    const ok = await page.evaluate(s => {
      const V = window.IntMapVolume3D;
      V.setShape(s);
      V.setRing(s === 'rect' ? V.rectRing([139.80, 35.55], [139.90, 35.65])
        : V.circleRing([139.85, 35.60], 2500, 32));
      const st2 = V.state();
      return { shape: st2.shape, points: st2.points, body: st2.body, painted: st2.painted };
    }, shape);
    expect(ok.shape, `${shape} is selectable`).toBe(shape);
    expect(ok.points, `${shape} has a footprint`).toBeGreaterThan(3);
    expect(ok.painted, `${shape} draws`).toBe(true);
    expect(ok.body, `${shape} draws as the closed body`).toBe(true);
  }
});

test('a lifted aircraft can be hovered and clicked where it is drawn, and its track appears', async ({ page }) => {
  test.setTimeout(180000);
  let tick = 0;
  /* the stub flies for four fixes and then holds station: the track needs movement, the pick needs
     the aeroplane to still be where it was projected a moment ago. */
  await page.route('**/api.airplanes.live/**', route => { const t = Math.min(tick++, 4);
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ now: Date.now(), ac: [{ hex: 'abc123', flight: 'TEST123 ', r: 'JA123X', t: 'B788',
        lat: 35.60 + t * 0.02, lon: 139.60 + t * 0.03, alt_baro: 36000, alt_geom: 36100,
        gs: 480, track: 55, seen: 1, dbFlags: 0 }] }) }); });
  await boot(page);
  await page.evaluate(() => { try { document.getElementById('sidebar').style.display = 'none'; window.__imap.resize(); } catch (_) {} });
  await page.evaluate(() => window.__imap.jumpTo({ center: [139.72, 35.68], zoom: 9.5, pitch: 60, bearing: 0 }));
  await page.evaluate(() => { const cb = document.getElementById('dl-planes'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
  /* (#R187) a LIFTED aircraft is the 3-D rendering, which is no longer the default (the first flat
     glyph is, per 「最初のデザインに戻して」) — so this test asks for it by name. */
  await page.evaluate(() => window.IntMapPlanes3D.set(true));
  await page.waitForTimeout(3500);
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__imap.fire('moveend')); await page.waitForTimeout(2000); }

  const s = await page.evaluate(() => window.IntMapPlanes3D.state());
  expect(s.lifted, 'the aircraft is standing at its reported altitude').toBe(1);
  expect(s.maxAlt, '36,100 ft of GPS altitude is 11,003 m').toBe(11003);

  // MapLibre answers a point query only at the FOOTPRINT — this is the bug the round fixed
  const pos = await page.evaluate(() => { const p = window.IntMapPlanes3D.screenPos('ABC123');
    return p ? { x: Math.round(p.x), y: Math.round(p.y) } : null; });
  expect(pos, 'the engine can say where an aircraft at 11 km is drawn').not.toBeNull();
  const ground = await page.evaluate(() => { const m = window.__imap;
    const f = m.queryRenderedFeatures({ layers: ['lyr-planes-3d'] });
    const g = m.project(f[0].geometry.coordinates[0][0]); return { y: Math.round(g.y) }; });
  expect(Math.abs(pos.y - ground.y), 'and it is nowhere near its ground position').toBeGreaterThan(40);

  expect(await page.evaluate(p => window.IntMapPlanes3D.pickAt(p), pos), 'the pick finds it there').toBe('ABC123');

  await page.mouse.move(pos.x, pos.y); await page.waitForTimeout(700);
  const hovered = await page.evaluate(() => [...document.querySelectorAll('div')].some(e => e.offsetParent && /TEST123/.test(e.textContent)));
  expect(hovered, 'hovering the lifted aircraft shows its readout').toBe(true);

  await page.mouse.click(pos.x, pos.y); await page.waitForTimeout(1200);
  const sel = await page.evaluate(() => window.IntMapPlanes3D.state());
  expect(sel.selected, 'clicking it selects it').toBe('ABC123');
  expect(sel.trackVisible, 'and its track is on screen').toBe(true);
  expect(sel.track.fixes, 'made of the fixes actually received').toBeGreaterThan(2);
  expect(sel.track.maxAlt, 'at the altitude they were received at').toBe(11003);

  // the track is drawn in 3-D: one ribbon per leg, extruded at that leg's altitude
  const legs = await page.evaluate(() => window.__imap.queryRenderedFeatures({ layers: ['lyr-plane-track-3d'] })
    .map(f => Math.round(f.properties.alt)));
  expect(legs.length, 'the track has legs standing in the air').toBeGreaterThan(1);
  expect(Math.min(...legs), 'each at the altitude it was flown at').toBeGreaterThan(10000);

  await page.mouse.click(60, 700); await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.IntMapPlanes3D.selected()), 'clicking away puts it back').toBeNull();

  /* …and the aeroplane's FOOTPRINT — the post standing under it — selects it too. This is the case that
     caught a real defect on production: the pick and the renderer's own footprint hit were two separate
     click handlers and each of them TOGGLED, so a click that satisfied both selected the aircraft and
     deselected it in the same event. One handler, one decision. */
  /* (#R183) Aim at the aircraft's GROUND POSITION, taken from the data, rather than at the centroid
     of whichever polygon a render query happens to return. The post is deliberately a hairline —
     max(6 m, 1.1 px) — so it is only about two pixels across on screen, and the old centroid only
     ever hit it by being coincidentally close: the silhouette's average vertex sits a little aft of
     the aircraft, and once the body became four parts (fuselage/wing/stabiliser/fin) the fuselage's
     average moved a couple of pixels forward and the click fell off the post. The position the test
     MEANS is the aircraft's own lng/lat, so that is what it now projects. */
  const post = await page.evaluate(() => { const m = window.__imap;
    /* the post's own square is centred exactly on the aircraft's lng/lat, so its centroid IS the
       ground point — aim at the thing being tested rather than at a proxy for it */
    const pf = m.queryRenderedFeatures({ layers: ['lyr-planes-post'] }).find(x => (x.properties || {}).post === 1);
    let ll;
    if (pf) { const r = pf.geometry.coordinates[0].slice(0, 4);
      const c = r.reduce((a, p2) => [a[0] + p2[0], a[1] + p2[1]], [0, 0]);
      ll = [c[0] / r.length, c[1] / r.length];
    } else { ll = [139.72, 35.68]; }   /* the stub's final position, after its four fixes */
    const g = m.project(ll); return { x: Math.round(g.x), y: Math.round(g.y) }; });
  await page.mouse.click(post.x, post.y); await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.IntMapPlanes3D.selected()), 'the post under an aircraft selects it').toBe('ABC123');
});
