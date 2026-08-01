// R174 behavioural checks in a real browser. Each one measures the reported symptom, not the
// mechanism behind it — and every number below was produced by running the failing version first.
//
//   1. the flight simulator looks UP (the map's pitch follows the pilot's) and paints no sky of its own
//   2. with the tilt ceiling lifted, zooming in still moves the viewpoint — and does not hang
//   3. the clicked aircraft's track survives a double-click zoom
//   4. the 3-D volume is still a closed body after the globe hands over to the flat map (z12+)
//   5. the drone planner: real terrain, AMSL/AGL kept apart, specific reasons, edit/recompute/save/delete
import { test, expect } from '@playwright/test';

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
};

test('the flight simulator looks up, and the sky is the renderer’s', async ({ page }) => {
  test.setTimeout(300000);
  await boot(page);
  await page.evaluate(() => window.IntMapFlightSim.start({ lng: 138.66, lat: 35.05, alt: 4000, hdg: 0 }));
  await page.waitForTimeout(8000);
  const snap = () => page.evaluate(() => { const m = window.__imap, S = window.IntMapFlightSim._st();
    return { view: S._camPitch, mapPitch: m.getPitch(), alt: S.alt,
      eye: window.IntMapGeoEngine.camera.altitude(),
      pad: m.getPadding(), simSky: !!document.querySelector('#map .fs-sky'),
      sky: (() => { try { return (m.getSky() || {})['sky-color']; } catch (_) { return null; } })() }; });

  const level = await snap();
  expect(level.simSky, 'the sim paints no sky of its own — 「空を勝手に描くな」').toBe(false);
  expect(level.sky, 'the renderer’s own sky is what a cockpit sees').toBe('#3f78c2');
  expect(level.pad, 'nothing is compensated with the projection centre').toEqual({ top: 0, bottom: 0, left: 0, right: 0 });

  // pull the nose up hard and hold it: the MAP must follow the pilot's line of sight past the vertical
  await page.evaluate(() => window.IntMapFlightSim._dbg.key('arrowdown', true));
  let best = 0, worstGap = 0;
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(900);
    const s = await snap();
    best = Math.max(best, s.view);
    worstGap = Math.max(worstGap, Math.abs(s.view - s.mapPitch));
    expect(Math.abs(s.eye - s.alt), 'the viewpoint stays at the aircraft').toBeLessThan(120);
  }
  await page.evaluate(() => window.IntMapFlightSim._dbg.clearKeys());
  /* the failing version froze the map at 85.4° while the pilot looked to 165°, and pushed 1,077 px of
     padding to hide it — so the gap, not the angle, is the thing to assert */
  expect(best, 'the aeroplane really did point above the vertical').toBeGreaterThan(120);
  expect(worstGap, 'and the map looked where the pilot was looking, every frame').toBeLessThan(3);

  await page.evaluate(() => window.IntMapFlightSim.stop());
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({ pad: window.__imap.getPadding(),
    simSky: !!document.querySelector('#map .fs-sky'), maxPitch: window.__imap.getMaxPitch() }));
  expect(after.simSky).toBe(false);
  expect(after.pad).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  expect(after.maxPitch, 'the tilt ceiling is handed back').toBeLessThanOrEqual(78);
});

test('with the tilt ceiling lifted, zooming in still moves the viewpoint', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(() => { window.IntMapTilt.set(true);
    window.__imap.jumpTo({ center: [139.76, 35.68], zoom: 12, pitch: 60, bearing: 0 }); });
  await page.waitForTimeout(1500);
  const eye = () => page.evaluate(() => { const e = window.IntMapGeoEngine.camera.eye();
    return { alt: e.alt, lng: e.lng, lat: e.lat, zoom: window.__imap.getZoom(), pitch: window.__imap.getPitch() }; });

  const a = await eye();
  const walk = [a.alt];
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__imap.setZoom(window.__imap.getZoom() + 1));
    await page.waitForTimeout(500);
    walk.push((await eye()).alt);
  }
  /* MEASURED before the fix: 8,373 m at z12, z13, z14, z15, z16 — every step identical, because the
     anchor was re-solved at the PROPOSED zoom and simply absorbed it. Then z17 hung the tab. */
  for (let i = 1; i < walk.length; i++) {
    expect(walk[i], `zoom step ${i} brought the viewpoint down`).toBeLessThan(walk[i - 1] * 0.75);
  }
  const b = await eye();
  expect(b.zoom, 'and it really is six zoom levels in — no hang').toBeGreaterThan(17.5);

  // …and tilting still holds the eye exactly where it stands, which is what the setting is for
  const c = await eye();
  await page.evaluate(() => window.IntMapTilt.tiltTo(110));
  await page.waitForTimeout(1200);
  const d = await eye();
  expect(Math.abs(d.alt - c.alt), 'tilting does not move the viewpoint').toBeLessThan(20);
  expect(Math.hypot((d.lng - c.lng) * 91000, (d.lat - c.lat) * 111320)).toBeLessThan(60);
  expect(d.pitch, 'the tilt really happened').toBeGreaterThan(100);
});

/* THE REPORTED BUG: 「Live air traffic でズームインすると、軌跡が消える」.
   It is not the zoom gesture, and it is not the double-click (that is a real but SEPARATE defect, guarded
   by the next test). With 3-D terrain on, ONE ground elevation was read at the map CENTRE and subtracted
   from every aircraft on screen. Zooming in walks the centre onto higher ground and refines the DEM under
   it; the moment the centre stands higher than an aircraft's altitude, the subtraction goes negative, is
   clamped to 0 — and the track then DROPPED every leg (`if(!(alt>0)) continue`) while the aircraft glyph
   survived, because that one is pushed whatever its altitude. The machine stays, its trail goes.
   Measured over Mt Fuji with the aircraft at 5,000 ft: 0 legs at every zoom from z10.5 to z14.3. */
test('the track survives zooming in over high ground with 3-D terrain on', async ({ page }) => {
  /* (#R184) 240 s was never a budget, it was a coin toss. This test boots the app with 3-D terrain,
     streams DEM tiles over Mt Fuji, waits out five moveend cycles and then six wheel steps — and it
     has been measured at 3.8 min against a 4.0 min ceiling on EVERY CI run for rounds, on main and
     on this branch alike. A 5 % margin survives only while nothing else is competing for the runner.
     #R184 added 33 browser tests (a second engine booted several times, Overpass and DEM work), and
     the same unchanged test went 3.8 → 4.2 min and failed three attempts in a row ON THE TIMEOUT,
     not on an assertion. Nothing it checks has changed and nothing it checks is relaxed here; it is
     given a budget with real margin instead of one it was always about to miss. */
  test.setTimeout(480000);
  let tick = 0;
  await page.route('**/api.airplanes.live/**', route => { const t = Math.min(tick++, 8);
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ now: Date.now(), ac: [{ hex: 'abc123', flight: 'TEST123 ', r: 'JA123X', t: 'B788',
        lat: 35.36 + t * 0.004, lon: 138.68 + t * 0.006, alt_baro: 5000, alt_geom: 5000,
        gs: 200, track: 55, seen: 1, dbFlags: 0 }] }) }); });
  await boot(page);
  await page.evaluate(() => { try { document.getElementById('sidebar').style.display = 'none'; window.__imap.resize(); } catch (_) {} });
  await page.evaluate(() => { const b = document.getElementById('btn-view-3d'); if (b && !b.classList.contains('active')) b.click(); });
  await page.evaluate(() => window.__imap.jumpTo({ center: [138.72, 35.38], zoom: 10.5, pitch: 45, bearing: 0 }));
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const cb = document.getElementById('dl-planes'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(3000);
  for (let i = 0; i < 5; i++) { await page.evaluate(() => window.__imap.fire('moveend')); await page.waitForTimeout(2000); }

  /* Capture what the module hands the renderer. queryRenderedFeatures cannot answer this: with terrain on
     it reports 0 for the aircraft too, while the aeroplane is plainly drawn on screen. */
  await page.evaluate(() => { const m = window.__imap; window.__cap = {};
    for (const [k, id] of [['track', 'src-plane-track'], ['planes', 'src-planes-3d']]) {
      const s = m.getSource(id); if (!s) continue; const orig = s.setData.bind(s);
      s.setData = d => { try { window.__cap[k] = JSON.parse(JSON.stringify(d)); } catch (_) {} return orig(d); }; } });
  await page.evaluate(() => window.IntMapPlanes3D.select('ABC123'));
  await page.waitForTimeout(1500);

  const snap = () => page.evaluate(() => { const m = window.__imap, c = m.getCenter();
    const g = m.queryTerrainElevation ? m.queryTerrainElevation({ lng: c.lng, lat: c.lat }) : null;
    const t = window.__cap.track, p = window.__cap.planes;
    return { zoom: +m.getZoom().toFixed(2), centreGround: g == null ? null : Math.round(g),
      legs: t ? t.features.filter(f => f.properties.kind === 'leg').length : -1,
      /* (#R183) one aircraft is FOUR extrusions now (fuselage/wing/stabiliser/fin), so counting
         non-post features counts PARTS. The aircraft is counted the way the module counts it — by
         its fuselage, or by the single silhouette when the body is drawn plainly. */
      bodies: p ? p.features.filter(f => !f.properties.post && (!f.properties.part || f.properties.part === 'fuselage')).length : -1 }; });

  const box = await page.evaluate(() => { const c = document.getElementById('map').getBoundingClientRect();
    return { x: Math.round(c.x + c.width / 2), y: Math.round(c.y + c.height / 2) }; });
  await page.mouse.move(box.x, box.y);
  const seen = [await snap()];
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(1400); seen.push(await snap()); }

  expect(seen[0].centreGround, 'the map centre really is standing on high ground').toBeGreaterThan(1500);
  for (const s of seen) {
    expect(s.bodies, `the aircraft is drawn at z${s.zoom}`).toBe(1);
    expect(s.legs, `and so is its track at z${s.zoom} — this was 0 at every step`).toBeGreaterThan(4);
  }
  expect(seen[seen.length - 1].zoom, 'the zoom really did go in').toBeGreaterThan(seen[0].zoom + 2);
});

test('a double-click zoom keeps the aircraft track on screen', async ({ page }) => {
  test.setTimeout(180000);
  let tick = 0;
  await page.route('**/api.airplanes.live/**', route => { const t = Math.min(tick++, 6);
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ now: Date.now(), ac: [{ hex: 'abc123', flight: 'TEST123 ', r: 'JA123X', t: 'B788',
        lat: 35.660 + t * 0.004, lon: 139.700 + t * 0.006, alt_baro: 4000, alt_geom: 4000,
        gs: 200, track: 55, seen: 1, dbFlags: 0 }] }) }); });
  await boot(page);
  await page.evaluate(() => { try { document.getElementById('sidebar').style.display = 'none'; window.__imap.resize(); } catch (_) {} });
  await page.evaluate(() => window.__imap.jumpTo({ center: [139.71, 35.67], zoom: 11, pitch: 45, bearing: 0 }));
  await page.evaluate(() => { const cb = document.getElementById('dl-planes'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
  /* (#R187) this asserts on `lyr-plane-track-3d`, i.e. the 3-D track — no longer the default since
     the first flat glyph was restored, so it is asked for by name. */
  await page.evaluate(() => window.IntMapPlanes3D.set(true));
  await page.waitForTimeout(3500);
  for (let i = 0; i < 4; i++) { await page.evaluate(() => window.__imap.fire('moveend')); await page.waitForTimeout(2000); }
  await page.evaluate(() => window.IntMapPlanes3D.select('ABC123'));
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.IntMapPlanes3D.selected())).toBe('ABC123');

  const box = await page.evaluate(() => { const c = document.getElementById('map').getBoundingClientRect();
    return { x: Math.round(c.x + c.width / 2), y: Math.round(c.y + c.height / 2) }; });
  const z0 = await page.evaluate(() => window.__imap.getZoom());
  await page.mouse.dblclick(box.x, box.y);
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => ({ sel: window.IntMapPlanes3D.selected(), zoom: window.__imap.getZoom(),
    legs: window.__imap.queryRenderedFeatures({ layers: ['lyr-plane-track-3d'] }).length }));
  expect(after.zoom, 'the double-click really did zoom').toBeGreaterThan(z0 + 0.5);
  expect(after.sel, 'and the aircraft is still selected — this used to go null').toBe('ABC123');
  expect(after.legs, 'so its track is still drawn').toBeGreaterThan(0);

  // a plain click on empty map still deselects — the deferral must not break that
  await page.mouse.click(60, 690);
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.IntMapPlanes3D.selected())).toBeNull();
});

test('the 3-D volume survives the globe→flat handover at z12', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(() => document.getElementById('btn-tool-volume').click());
  await page.waitForTimeout(700);
  await page.evaluate(() => { const V = window.IntMapVolume3D;
    V.setAltitudes(1000, 3000); V.setStyle('#ff3b30', 0.6);
    V.setRing(V.circleRing([139.76, 35.68], 3000, 48)); });
  await page.waitForTimeout(900);

  const red = async () => {
    const png = (await page.screenshot({ clip: { x: 440, y: 60, width: 700, height: 620 } })).toString('base64');
    return page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 100 && d[i] > d[i + 1] * 1.4 && d[i] > d[i + 2] * 1.4) n++;
      return n; }, png);
  };
  const seen = [];
  for (const z of [11, 12, 13]) {
    await page.evaluate(zz => window.__imap.jumpTo({ center: [139.76, 35.68], zoom: zz, pitch: 55, bearing: 0 }), z);
    await page.waitForTimeout(1400);
    const variant = await page.evaluate(() => +window.IntMapGeoEngine.camera.globeness().toFixed(2));
    seen.push({ z, red: await red(), variant });
  }
  /* MEASURED before the fix: 32,435 red pixels at z11 (the globe prelude, elevation in metres) and
     9,152 at z12 — nothing but the ground outline, because the flat prelude wants MERCATOR units and
     every vertex was clipped past the far plane. Both regimes must draw the body, and it must GROW. */
  expect(seen[0].red, 'the body draws on the globe').toBeGreaterThan(10000);
  expect(seen[1].red, 'and on the flat map, where it used to vanish').toBeGreaterThan(seen[0].red);
  expect(seen[2].red, 'and it keeps growing as you zoom in').toBeGreaterThan(seen[1].red);

  // the closed body is simply what a volume is now — no choice, and the panel offers none
  const st = await page.evaluate(() => window.IntMapVolume3D.state());
  expect(st.body, 'the closed body is what is painted').toBe(true);
  expect(st.shell, 'the open shell is not').toBe(false);
  expect(await page.evaluate(() => !!document.querySelector('#v3d-solid')), 'no Solid checkbox').toBe(false);
});

test('the 3-D volume polygon has a drawing-complete button that really stops the clicks', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => { try { document.getElementById('sidebar').style.display = 'none'; window.__imap.resize(); } catch (_) {} });
  await page.evaluate(() => window.__imap.jumpTo({ center: [139.76, 35.68], zoom: 11, pitch: 0, bearing: 0 }));
  await page.evaluate(() => document.getElementById('btn-tool-volume').click());
  await page.waitForTimeout(700);
  // three clicks on the map = a footprint
  for (const p of [[500, 250], [700, 250], [700, 430]]) { await page.mouse.click(p[0], p[1]); await page.waitForTimeout(350); }
  expect(await page.evaluate(() => window.IntMapVolume3D.state().points)).toBe(3);
  const btn = page.locator('#v3d-seal');
  await expect(btn, 'the button appears once there is a footprint').toBeVisible();
  await btn.click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.IntMapVolume3D.state().sealed)).toBe(true);
  // …and now a click on the map is a click on the map
  await page.mouse.click(560, 430); await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.IntMapVolume3D.state().points), 'no more vertices').toBe(3);
  // pressing it again reopens the footprint
  await page.locator('#v3d-seal').click(); await page.waitForTimeout(300);
  await page.mouse.click(540, 420); await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.IntMapVolume3D.state().points), 'and drawing resumes').toBe(4);
});

test('the drone planner answers with the real terrain, and says exactly what fails', async ({ page }) => {
  test.setTimeout(240000);
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await boot(page);
  await page.evaluate(() => window.__imap.jumpTo({ center: [138.72, 35.42], zoom: 10, pitch: 55, bearing: 0 }));
  /* (#R176) the toolbar button is gone — the planner opens through its own API, the way Atlas opens it */
  expect(await page.evaluate(() => !!document.getElementById('btn-tool-drone')), 'no drone button anywhere').toBe(false);
  await page.evaluate(() => window.IntMapDrone.open());
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.IntMapDrone.state().open)).toBe(true);

  /* A route that flies straight through Mt Fuji at 100 m ABOVE THE GROUND at each end. The ends are
     fine; everything between them is inside a volcano. */
  const r = await page.evaluate(async () => {
    const D = window.IntMapDrone;
    D.newRoute(); D.usePreset('prosumer'); D.setTypedRef('agl');
    D.addWaypoint(138.7565, 35.5170, 100, 'agl');
    D.addWaypoint(138.6300, 35.3000, 100, 'agl');
    const res = await D.compute();
    return { ground: res.wpGround.map(Math.round), amsl: res.wpAmsl.map(Math.round), agl: res.wpAgl.map(Math.round),
      km: res.groundDistM / 1000, minutes: res.timeS / 60, wh: res.energyWh, pct: res.batteryPct,
      minClear: res.minClearance, demMissing: res.demMissing, samples: res.samples.length,
      kinds: res.violations.map(v => v.kind), texts: res.violations.map(v => v.text), ok: res.ok };
  });
  // real elevation, not a guess: Lake Kawaguchi stands at about 830 m
  expect(r.ground[0], 'the DEM was actually read').toBeGreaterThan(700);
  expect(r.ground[0]).toBeLessThan(950);
  expect(r.demMissing, 'and every sample got an elevation').toBe(0);
  // AGL is what was typed; AMSL is that plus the ground under THAT waypoint — never mixed up
  expect(r.agl).toEqual([100, 100]);
  expect(r.amsl[0]).toBe(r.ground[0] + 100);
  expect(r.amsl[1]).toBe(r.ground[1] + 100);
  expect(r.km).toBeGreaterThan(25);
  expect(r.minClear, 'the straight line is deep inside the mountain').toBeLessThan(-500);
  expect(r.kinds).toContain('terrain-collision');
  expect(r.kinds).toContain('range');
  expect(r.kinds).toContain('battery');
  expect(r.ok).toBe(false);
  // the reason is specific: it names both numbers that failed the comparison
  expect(r.texts[0]).toMatch(/AMSL/);
  expect(r.texts[0]).toMatch(/\d/);

  // "follow the terrain" must actually make it clear the ground
  const f = await page.evaluate(async () => { const res = await window.IntMapDrone.followTerrain();
    return { wp: window.IntMapDrone.route().wp.length, minClear: res.minClearance, maxAgl: res.maxAgl,
      kinds: res.violations.map(v => v.kind) }; });
  expect(f.wp, 'waypoints were inserted over the ridges').toBeGreaterThan(2);
  expect(f.minClear, 'and the path now clears the ground everywhere').toBeGreaterThan(9);
  /* …but it stays HONEST: clearing Mt Fuji needs far more height than this aircraft is allowed, and
     that is reported rather than smoothed away. */
  expect(f.kinds).toContain('max-altitude');
  expect(f.kinds).not.toContain('terrain-collision');

  // it is drawn in 3-D — asked of what was handed to the renderer, not of a point query
  const drawn = await page.evaluate(() => window.IntMapDrone.state());
  expect(drawn.drawn).toBe(true);
  expect(drawn.draw.air, 'one ribbon per densified segment').toBeGreaterThan(100);
  expect(drawn.draw.wp).toBe(f.wp);

  // edit → recompute
  const edited = await page.evaluate(async () => { const D = window.IntMapDrone;
    D.setWaypoint(0, { alt: 300 }); const res = await D.compute();
    return { agl0: Math.round(res.wpAgl[0]), amsl0: Math.round(res.wpAmsl[0]) }; });
  expect(edited.agl0).toBe(300);
  expect(edited.amsl0).toBe(r.ground[0] + 300);

  // save → list → new → load → delete
  const store = await page.evaluate(async () => { const D = window.IntMapDrone;
    D.setRoute(Object.assign(D.route(), { name: 'Fuji survey' })); D.save();
    const id = D.routes()[0].id, n = D.route().wp.length;
    D.newRoute(); const emptied = D.route().wp.length;
    D.load(id); const back = D.route().wp.length;
    D.remove(id);
    return { saved: 1, n, emptied, back, gone: D.routes().length }; });
  expect(store.emptied).toBe(0);
  expect(store.back).toBe(store.n);
  expect(store.gone).toBe(0);

  // the extension seams the brief asks for really are consulted
  const seams = await page.evaluate(async () => { const D = window.IntMapDrone;
    D.newRoute(); D.addWaypoint(139.70, 35.68, 100, 'agl'); D.addWaypoint(139.78, 35.70, 100, 'agl');
    /* (#R184) js/drone-ops.js now fills these seams for real, so a test that registers its own
       source has to measure the DELTA rather than the absolute count. What is being asserted is
       unchanged — "unregistering removes the one I added" — but it can no longer be spelled as
       "and then nothing is registered at all", because that was only ever true while the seams
       were empty. The wind field is put BACK afterwards for the same reason: leaving it null
       would silently disable the real one for whatever runs next in this tab. */
    const before = D.hazardSourceIds().slice().sort();
    const calm = await D.compute();
    D.registerHazardSource('t-nfz', () => [{ i: 3, kind: 'no-fly-zone', severity: 'error', text: 'test NFZ' }]);
    D.registerWindField(() => ({ u: 5, v: 0 }));
    const windy = await D.compute();
    D.unregisterHazardSource('t-nfz');
    try { if (window.IntMapDroneOps) window.IntMapDroneOps.install(); else D.registerWindField(null); }
    catch (_) { D.registerWindField(null); }
    return { nfz: windy.violations.filter(v => v.kind === 'no-fly-zone').length,
      calmS: calm.timeS, windS: windy.timeS,
      before, after: D.hazardSourceIds().slice().sort() }; });
  expect(seams.nfz, 'a hazard source becomes a finding like any other').toBe(1);
  expect(seams.windS, 'a tailwind really does shorten the flight').toBeLessThan(seams.calmS * 0.85);
  expect(seams.after, 'and unregistering removes exactly the one that was added').toEqual(seams.before);
  expect(seams.after, 'the test source is gone').not.toContain('t-nfz');

  expect(errs, 'no page errors along the way').toEqual([]);
});

/* (#R174 SEC) CodeQL caught this on the PR: a route can arrive from localStorage or from
   IntMapDrone.setRoute/setSpec without ever passing the panel's numeric inputs, and its spec values reached
   an `value="…"` attribute raw. Sanitised at the door AND escaped at the sink — one of the two being right
   is not a design. */
test('a hostile route cannot inject markup into the planner panel', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const PAYLOAD = '"><img src=x onerror="window.__pwned=1">';
  // 1. straight through the public API
  await page.evaluate(p => { const D = window.IntMapDrone; D.open();
    D.setRoute({ id: p, name: p, presetId: p, spec: { cruiseSpeed: p, maxAgl: p, batteryWh: p },
      wp: [{ lng: 139.7, lat: 35.6, alt: p, ref: p, hold: p }] }); D.open(); }, PAYLOAD);
  await page.waitForTimeout(600);
  // 2. and through the store, which is the path the API cannot police
  await page.evaluate(p => { localStorage.setItem('intmap_drone_routes', JSON.stringify([
    { id: p, name: p, spec: { cruiseSpeed: p }, wp: [{ lng: 139.7, lat: 35.6, alt: p, ref: p }] }])); }, PAYLOAD);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.IntMapDrone, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.IntMapDrone.open());
  await page.waitForTimeout(800);

  const r = await page.evaluate(() => ({ pwned: !!window.__pwned,
    imgs: document.querySelectorAll('#drone-panel img').length,
    spec: window.IntMapDrone.spec(),
    /* the stored route is what carried the payload across the reload; the panel lists it by name */
    savedName: (window.IntMapDrone.routes()[0] || {}).name,
    savedShown: (document.querySelector('#drone-panel .dn-open') || {}).textContent,
    saved: window.IntMapDrone.routes().length }));
  expect(r.pwned, 'no script ran').toBe(false);
  expect(r.imgs, 'no element was injected into the panel').toBe(0);
  // the numbers really are numbers, not strings that happen to render
  Object.values(r.spec).forEach(v => expect(typeof v, 'every aircraft limit is a number').toBe('number'));
  expect(isFinite(r.spec.cruiseSpeed)).toBe(true);
  expect(r.saved, 'the stored route was accepted, not thrown away').toBe(1);
  expect(r.savedName, 'the name survives intact in the model').toContain('<img');
  expect(r.savedShown, '…and is shown as TEXT, which is the whole point').toContain('<img');
});

test('the drone planner is reachable from Atlas and fits a phone', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 390, height: 780 });
  await boot(page);
  const res = await page.evaluate(() => window.IntMapConsole.dispatch({ type: 'drone', action: 'plan',
    from: 'Tokyo Station', to: 'Haneda Airport', alt: 100, ref: 'agl', aircraft: 'prosumer' }));
  expect(res.ok).toBe(true);
  const st = await page.evaluate(() => window.IntMapDrone.state());
  expect(st.waypoints).toBe(2);
  expect(st.open).toBe(true);
  expect(st.result, 'Atlas planned a real route, with real numbers').not.toBeNull();
  expect(st.result.groundDistM).toBeGreaterThan(10000);

  const box = await page.evaluate(() => { const p = document.querySelector('#drone-panel'), r = p.getBoundingClientRect();
    return { left: Math.round(r.x), right: Math.round(r.right), width: Math.round(r.width),
      addCentre: !!p.querySelector('#dn-addc'), fields: p.querySelectorAll('[data-spec]').length }; });
  expect(box.right, 'the panel fits the screen').toBeLessThanOrEqual(391);
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.addCentre, 'and a phone gets the centre-crosshair way to add a waypoint').toBe(true);
  expect(box.fields, 'every aircraft limit is editable').toBeGreaterThanOrEqual(12);
});
