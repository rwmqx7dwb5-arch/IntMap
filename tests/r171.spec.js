// R171 behavioural checks in a real browser.
//
// Two of this round's claims are invisible in the source and have to be MEASURED:
//
//   1. "The flight simulator uses a globe." #R170 already contained the line that switches to the
//      globe, and the sim still flew a flat Earth, because MapLibre 5's `globe` projection is DEFINED
//      as vertical-perspective while zoomed out and plain MERCATOR from about z12 up — and the sim
//      lives at z≈15. A test that asserted getProjection().type === 'globe' would have passed the
//      whole time. So this measures CURVATURE instead: the vertical bow of the ±60° parallel, which
//      is exactly 0 px under mercator and hundreds of px on a globe.
//   2. "Typing in the 3-D volume fields works." The old panel re-rendered itself from the input
//      handler, so the field being typed into was destroyed after one keystroke ("2500" → "2", focus
//      back on BODY). Only a real keyboard through a real DOM shows that.
import { test, expect } from '@playwright/test';

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
};

/* Vertical bow of the parallel through the map centre, sampled ±60° of longitude. Mercator maps a
   parallel to a straight horizontal line, so this is exactly 0; any globe bends it by hundreds of
   pixels. Measured on this app at pitch 0: globe z10 741, z11 753, z12 0, z15 0 — that zero IS the bug. */
const bowAt = page => page.evaluate(() => {
  const m = window.__imap, c = m.getCenter();
  const p = [-60, -30, 0, 30, 60].map(d => m.project([c.lng + d, c.lat]));
  return Math.round(Math.abs(p[2].y - (p[0].y + p[4].y) / 2) * 10) / 10;
});

test('MapLibre\'s plain globe really does go flat at flight-sim zoom (the reason #R170 did not fix this)', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const rows = await page.evaluate(async () => {
    const m = window.__imap, out = [];
    const bow = () => { const c = m.getCenter(); const p = [-60, -30, 0, 30, 60].map(d => m.project([c.lng + d, c.lat]));
      return Math.round(Math.abs(p[2].y - (p[0].y + p[4].y) / 2) * 10) / 10; };
    m.setProjection({ type: 'globe' });
    for (const z of [10, 12, 15]) { m.jumpTo({ center: [138.7, 35.3], zoom: z, pitch: 0, bearing: 0 }); await new Promise(r => setTimeout(r, 350)); out.push({ z, bow: bow() }); }
    return out;
  });
  expect(rows.find(r => r.z === 10).bow, 'zoomed out, the plain globe is curved').toBeGreaterThan(100);
  expect(rows.find(r => r.z === 12).bow, 'from z12 MapLibre renders the "globe" as mercator — this is the trap').toBe(0);
  expect(rows.find(r => r.z === 15).bow).toBe(0);
});

test('the flight simulator flies a curved Earth, and gives the view back on exit', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  // take off from the FLAT view — the case #R170 set out to cover
  await page.evaluate(() => window.IntMapOS.exec('view.proj.flat', { source: 'test' }));
  await page.waitForTimeout(500);
  expect(await bowAt(page), 'flat means flat').toBe(0);

  await page.evaluate(() => window.IntMapFlightSim.start({ lng: 138.7, lat: 35.3, alt: 3000 }));
  await page.waitForTimeout(3500);

  const during = await page.evaluate(() => ({ zoom: window.__imap.getZoom(), active: window.IntMapFlightSim.active(),
    globeness: window.IntMapGeoEngine.camera.globeness(),
    proj: JSON.stringify(window.__imap.getProjection()) }));
  expect(during.active).toBe(true);
  /* (#R172) the curvature expectation was DROPPED here, and this is the record of why: #R171 satisfied it
     with vertical-perspective, which at cockpit zoom with 3-D terrain on rendered NOTHING — the sim shipped
     as a white void.
     (#R173) it is back, by the route #R171 and #R172 both missed. The cockpit sat at z15 only because its
     look-at target was pinned 1.8 km ahead; the distance is the zoom in disguise, and solving it on the
     sphere instead lands the same camera inside the renderer's spherical regime. So the assertion that used
     to fix the sim at "the zoom where the plain globe is mercator" now fixes the opposite — with the
     white-void trap still guarded by tests/r172.spec.js, which counts ground pixels. */
  expect(during.zoom, 'the cockpit now flies below the globe→mercator crossover').toBeLessThan(11.1);
  expect(during.globeness, 'and the Earth really is a sphere while it does').toBeGreaterThan(0.99);
  expect(during.proj, 'the sim flies the app Globe').toContain('globe');

  await page.evaluate(() => window.IntMapFlightSim.stop());
  await page.waitForTimeout(1600);
  const after = await page.evaluate(() => JSON.stringify(window.__imap.getProjection()));
  expect(after, 'a pilot who took off from Flat gets Flat back').toContain('mercator');
  expect(await bowAt(page)).toBe(0);
});

test('the flight simulator is silent by default and the SOUND key says so', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => window.IntMapFlightSim.start({ lng: 138.7, lat: 35.3, alt: 3000 }));
  await page.waitForTimeout(1500);
  const deck = await page.evaluate(() => {
    const b = document.querySelector('.fs-deck [data-act="mute"]');
    return { exists: !!b, on: b ? b.classList.contains('on') : null, icon: b ? b.firstChild.textContent : null,
             stored: localStorage.getItem('intmap_fs_sound'),
             ctx: (() => { try { return document.querySelectorAll('*').length > 0 && window.__fsCamActive; } catch (_) { return null; } })() };
  });
  expect(deck.exists).toBe(true);
  expect(deck.on, 'the SOUND key must not start lit — silence is the default now').toBe(false);
  expect(deck.icon).toBe('🔇');
  expect(deck.stored, 'nothing is stored until the pilot chooses').toBeNull();
  // turning it on persists, and the key flips
  await page.evaluate(() => document.querySelector('.fs-deck [data-act="mute"]').click());
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ on: document.querySelector('.fs-deck [data-act="mute"]').classList.contains('on'), stored: localStorage.getItem('intmap_fs_sound') }));
  expect(after.on).toBe(true);
  expect(after.stored).toBe('on');
  await page.evaluate(() => window.IntMapFlightSim.stop());
});

test('Measure ▸ 3-D volume: a whole number can actually be typed, and it reaches the renderer', async ({ page }) => {
  test.setTimeout(150000);
  await boot(page);
  await page.evaluate(async () => {
    window.__imap.jumpTo({ center: [138.7274, 35.30], zoom: 9, pitch: 60, bearing: 0 });
    await new Promise(r => setTimeout(r, 1500));
  });
  await page.click('#btn-measure-menu');
  await page.click('#btn-tool-volume');
  const canvas = await page.locator('canvas.maplibregl-canvas').boundingBox();
  for (const [fx, fy] of [[0.42, 0.55], [0.58, 0.55], [0.58, 0.66], [0.42, 0.66]]) {
    await page.mouse.click(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
    await page.waitForTimeout(140);
  }

  const base = page.locator('#v3d-base');
  await base.click(); await base.press('Control+a');
  await page.keyboard.type('2500', { delay: 55 });
  await page.waitForTimeout(200);
  const afterBase = await page.evaluate(() => ({ focus: document.activeElement.id, value: document.getElementById('v3d-base').value }));
  // before the fix this was value "2" with focus back on BODY after the first keystroke
  expect(afterBase.value, 'every keystroke must land — the panel must not rebuild itself under the cursor').toBe('2500');
  expect(afterBase.focus).toBe('v3d-base');

  const top = page.locator('#v3d-top');
  await top.click(); await top.press('Control+a');
  await page.keyboard.type('9000', { delay: 55 });
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({
    base: document.getElementById('v3d-base').value, top: document.getElementById('v3d-top').value,
    state: window.IntMapVolume3D.state(),
    paintBase: window.__imap.getPaintProperty('imv3d-vol', 'fill-extrusion-base'),
    paintTop: window.__imap.getPaintProperty('imv3d-vol', 'fill-extrusion-height'),
    thick: document.getElementById('v3d-thick').textContent,
  }));
  expect(st.base).toBe('2500');
  expect(st.top).toBe('9000');
  expect(st.paintBase, 'the typed number has to survive all the way to the renderer').toBe(2500);
  expect(st.paintTop).toBe(9000);
  expect(st.thick, 'the derived rows refresh in place').toContain('6,500');

  // clearing a field to retype it must not silently become 0 m
  await base.click(); await base.press('Control+a'); await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);
  const cleared = await page.evaluate(() => ({ value: document.getElementById('v3d-base').value, base: window.IntMapVolume3D.base() }));
  expect(cleared.value).toBe('');
  expect(cleared.base, 'an empty field is a keyboard state, not the number zero').toBe(2500);
});

test('Measure ▸ 3-D volume: the altitude fields fit inside the panel', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.click('#btn-measure-menu');
  await page.click('#btn-tool-volume');
  await page.waitForTimeout(300);
  const fit = await page.evaluate(() => {
    const p = document.getElementById('tool-panel');
    const r = p.getBoundingClientRect();
    const out = { scrollW: p.scrollWidth, clientW: p.clientWidth, over: [] };
    p.querySelectorAll('input, .v3d-shape').forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.right > r.right + 1 || b.left < r.left - 1) out.over.push((el.id || el.className) + ' ' + Math.round(b.right - r.right));
    });
    return out;
  });
  // measured before the fix: the "to" field's right edge sat 38 px past the panel edge
  expect(fit.over, 'no control may spill out of the tool panel').toEqual([]);
  expect(fit.scrollW, 'the panel itself must not scroll horizontally').toBeLessThanOrEqual(fit.clientW);
});

test('Measure ▸ 3-D volume: freehand, circle and rectangle footprints', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(async () => {
    window.__imap.jumpTo({ center: [138.7274, 35.30], zoom: 9.5, pitch: 55, bearing: 0 });
    await new Promise(r => setTimeout(r, 1500));
  });
  await page.click('#btn-measure-menu');
  await page.click('#btn-tool-volume');
  await page.waitForTimeout(250);
  const c = await page.locator('canvas.maplibregl-canvas').boundingBox();
  const cx = c.x + c.width * 0.5, cy = c.y + c.height * 0.5;

  await page.click('.v3d-shape[data-shape="circle"]');
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + 70, cy + 25, { steps: 6 }); await page.mouse.move(cx + 120, cy + 40, { steps: 6 });
  await page.mouse.up(); await page.waitForTimeout(350);
  const circle = await page.evaluate(() => window.IntMapVolume3D.state());
  expect(circle.shape).toBe('circle');
  expect(circle.points, 'a circle is a real ring, not four corners').toBeGreaterThan(50);
  expect(circle.painted).toBe(true);
  expect(circle.areaM2).toBeGreaterThan(0);

  await page.click('.v3d-shape[data-shape="freehand"]');
  await page.waitForTimeout(150);
  await page.mouse.move(cx - 100, cy - 55); await page.mouse.down();
  for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; await page.mouse.move(cx + Math.cos(a) * 85, cy + Math.sin(a) * 50, { steps: 2 }); }
  await page.mouse.up(); await page.waitForTimeout(350);
  const free = await page.evaluate(() => window.IntMapVolume3D.state());
  expect(free.shape).toBe('freehand');
  expect(free.points, 'a traced outline keeps enough vertices to be a curve').toBeGreaterThan(8);
  expect(free.painted).toBe(true);

  await page.click('.v3d-shape[data-shape="rect"]');
  await page.waitForTimeout(150);
  await page.mouse.move(cx - 80, cy - 50); await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 50, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(350);
  const rect = await page.evaluate(() => window.IntMapVolume3D.state());
  expect(rect.shape).toBe('rect');
  expect(rect.painted).toBe(true);
  expect(rect.areaM2).toBeGreaterThan(0);

  // a stroke must not also drop a polygon vertex through the synthetic click at its end
  const stray = await page.evaluate(() => (window.IntMapConsole ? 0 : 0) || document.getElementById('v3d-pts').textContent);
  expect(Number(stray)).toBe(rect.points);
});

test('Measure ▸ 3-D volume: colour and opacity reach the renderer', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(async () => { window.__imap.jumpTo({ center: [138.7274, 35.30], zoom: 9.5, pitch: 55 }); await new Promise(r => setTimeout(r, 1200)); });
  await page.click('#btn-measure-menu');
  await page.click('#btn-tool-volume');
  await page.click('.v3d-shape[data-shape="rect"]');
  const c = await page.locator('canvas.maplibregl-canvas').boundingBox();
  const cx = c.x + c.width * 0.5, cy = c.y + c.height * 0.5;
  await page.mouse.move(cx - 70, cy - 40); await page.mouse.down(); await page.mouse.move(cx + 70, cy + 40, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(300);

  await page.click('[data-v3dcol="#ff9500"]');
  await page.waitForTimeout(200);
  const col = await page.evaluate(() => ({
    fill: window.__imap.getPaintProperty('imv3d-vol', 'fill-extrusion-color'),
    edge: window.__imap.getPaintProperty('imv3d-edge', 'line-color'),
  }));
  expect(col.fill).toBe('#ff9500');
  expect(col.edge, 'the ground outline follows the colour too').toBe('#ff9500');

  await page.evaluate(() => { const s = document.getElementById('v3d-op'); s.value = '0.85'; s.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(250);
  const op = await page.evaluate(() => window.__imap.getPaintProperty('imv3d-vol', 'fill-extrusion-opacity'));
  expect(op).toBeCloseTo(0.85, 5);
});

test('the tilt limit lifts to the renderer\'s full range and comes back down', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const start = await page.evaluate(() => ({ max: window.__imap.getMaxPitch(), unlimited: window.IntMapTilt.isUnlimited() }));
  expect(start.max, 'the standard ceiling is unchanged for a fresh profile').toBe(78);
  expect(start.unlimited).toBe(false);

  // the ceiling really does stop the camera
  await page.evaluate(() => window.__imap.jumpTo({ pitch: 120 }));
  expect(await page.evaluate(() => Math.round(window.__imap.getPitch()))).toBe(78);

  await page.evaluate(() => window.IntMapTilt.set(true));
  await page.waitForTimeout(200);
  const on = await page.evaluate(() => { window.__imap.jumpTo({ pitch: 150 }); return { max: window.__imap.getMaxPitch(), pitch: Math.round(window.__imap.getPitch()), stored: localStorage.getItem('intmap_tilt_unlimited') }; });
  expect(on.max, "180° is the renderer's whole tilt range — setMaxPitch throws above it").toBe(180);
  expect(on.pitch, 'the camera can now lean past the horizon').toBe(150);
  expect(on.stored).toBe('1');

  // an angle past the top resolves into the same view aimed the other way
  const wrap = await page.evaluate(() => window.IntMapTilt.fromAngle(250, 90));
  expect(wrap.pitch).toBe(110);
  expect(wrap.bearing).toBe(270);

  // switching back must bring the view into range, not leave it somewhere unreachable
  await page.evaluate(() => window.IntMapTilt.set(false));
  await page.waitForTimeout(900);
  const off = await page.evaluate(() => ({ max: window.__imap.getMaxPitch(), pitch: Math.round(window.__imap.getPitch()) }));
  expect(off.max).toBe(78);
  expect(off.pitch, 'a camera left at 150° would be stuck at an angle the user can no longer reach').toBeLessThanOrEqual(78);
});

test('the tilt setting survives a reload and is reflected in Settings', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => window.IntMapTilt.set(true));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap && !!window.IntMapGeoEngine, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__imap.getMaxPitch())).toBe(180);
  await page.click('#btn-open-settings');
  await page.waitForTimeout(400);
  expect(await page.inputValue('#setting-tilt-limit')).toBe('unlimited');
});

test('the viewpoint altitude appears in the always-on readout and tracks the camera', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const off = await page.evaluate(() => window.IntMapEyeAlt.text());
  expect(off, 'off by default').toBe('');

  await page.evaluate(() => window.IntMapEyeAlt.set(true));
  await page.evaluate(async () => { window.__imap.jumpTo({ center: [138.7, 35.3], zoom: 12, pitch: 0, bearing: 0 }); await new Promise(r => setTimeout(r, 500)); });
  await page.waitForTimeout(400);
  const hi = await page.evaluate(() => ({ alt: window.IntMapGeoEngine.camera.altitude(), text: window.IntMapEyeAlt.text(),
    shown: (() => { const el = document.getElementById('coord-readout'); return el && getComputedStyle(el).display !== 'none' ? el.textContent : ''; })() }));
  // z12 over Japan: the camera sits ~16.8 km up (cameraToCenterDistance × ground metres per pixel)
  expect(hi.alt).toBeGreaterThan(12000);
  expect(hi.alt).toBeLessThan(22000);
  expect(hi.text).toMatch(/^(Eye|視点|Kamera|Камера|Cámara) /);
  expect(hi.shown, 'the chip must be visible in the readout even with the cursor off the map').toContain('Eye');

  // zooming in halves the altitude for every zoom level
  await page.evaluate(async () => { window.__imap.jumpTo({ zoom: 14, pitch: 0 }); await new Promise(r => setTimeout(r, 500)); });
  const lo = await page.evaluate(() => window.IntMapGeoEngine.camera.altitude());
  expect(lo / hi.alt, 'two zoom levels closer = a quarter of the altitude').toBeCloseTo(0.25, 1);

  // tilting lowers the eye above the map centre
  await page.evaluate(async () => { window.__imap.jumpTo({ zoom: 14, pitch: 60 }); await new Promise(r => setTimeout(r, 500)); });
  const tilted = await page.evaluate(() => window.IntMapGeoEngine.camera.altitude());
  expect(tilted / lo).toBeCloseTo(Math.cos(60 * Math.PI / 180), 1);
});

test('Atlas can drive both new switches', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const a = await window.IntMapConsole.dispatch({ type: 'tiltLimit', on: true });
    const b = await window.IntMapConsole.dispatch({ type: 'eyeAltitude', on: true });
    return { a: !!a.ok, b: !!b.ok, max: window.__imap.getMaxPitch(), eye: window.IntMapEyeAlt.isOn(), htmlA: String(a.html || '').slice(0, 160) };
  });
  expect(r.a).toBe(true);
  expect(r.b).toBe(true);
  expect(r.max).toBe(180);
  expect(r.eye).toBe(true);
  expect(r.htmlA).toMatch(/180/);
});

test('Atlas can draw a circular 3-D volume in a colour', async ({ page }) => {
  test.setTimeout(150000);
  await boot(page);
  const st = await page.evaluate(async () => {
    await window.IntMapConsole.dispatch({ type: 'volume3d', place: 'Mount Fuji', km: 8, base: 2000, top: 9000, shape: 'circle', color: '#ff3b30' });
    await new Promise(r => setTimeout(r, 1200));
    return { s: window.IntMapVolume3D.state(), fill: window.__imap.getPaintProperty('imv3d-vol', 'fill-extrusion-color') };
  });
  expect(st.s.points, 'circle → a real ring').toBeGreaterThan(50);
  expect(st.s.low).toBe(2000);
  expect(st.s.high).toBe(9000);
  expect(st.s.painted).toBe(true);
  expect(st.fill).toBe('#ff3b30');
});

test('the elevation profile still puts its cursor on the map through the engine', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  // #R169 deliberately made no browser claim about js/elevation-profile.js (it needs a real DEM).
  // This round moved its addSource/addLayer/setData onto the engine, so that claim is now needed:
  // the layer it creates is the only visible consequence of the migration.
  await page.evaluate(async () => { window.__imap.jumpTo({ center: [138.7, 35.36], zoom: 10 }); await new Promise(r => setTimeout(r, 1500)); });
  await page.click('#btn-measure-menu');
  await page.click('#btn-tool-measure');
  const c = await page.locator('canvas.maplibregl-canvas').boundingBox();
  await page.mouse.click(c.x + c.width * 0.40, c.y + c.height * 0.50);
  await page.waitForTimeout(200);
  await page.mouse.click(c.x + c.width * 0.60, c.y + c.height * 0.55);
  await page.waitForTimeout(400);
  await page.click('#tp-profile');
  await page.waitForSelector('#elev-svg', { timeout: 60000 });
  await page.evaluate(() => { const s = document.getElementById('elev-svg'), b = s.getBoundingClientRect();
    s.dispatchEvent(new MouseEvent('mousemove', { clientX: b.x + b.width / 2, clientY: b.y + b.height / 2, bubbles: true })); });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({
    src: !!window.__imap.getSource('elev-cursor'),
    lyr: !!window.__imap.getLayer('elev-cursor-pt'),
    feats: (() => { try { return window.__imap.getSource('elev-cursor').serialize().data.features.length; } catch (_) { return -1; } })(),
  }));
  expect(r.src, 'the cursor source is added through the engine').toBe(true);
  expect(r.lyr).toBe(true);
  expect(r.feats, 'hovering the chart marks the spot on the map').toBe(1);
});

test('the migrated modules still drive the map through the engine', async ({ page }) => {
  test.setTimeout(150000);
  await boot(page);
  // search-geocode: gotoPlace (camera), positionSearchCard (project), the move listener (events)
  await page.evaluate(() => { const i = document.getElementById('ms-input'); i.value = 'Kyoto'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#ms-btn');
  await page.waitForSelector('#ms-results > *', { timeout: 30000 });
  await page.locator('#ms-results > *').first().click();
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const card = document.querySelector('.search-result-card');
    return { card: !!card, positioned: !!(card && parseFloat(card.style.left) > 0), pin: !!document.querySelector('.search-pin'),
             lng: Math.round(window.__imap.getCenter().lng * 10) / 10 };
  });
  expect(r.card, 'the search card is built').toBe(true);
  expect(r.positioned, 'positionSearchCard projects through the engine now').toBe(true);
  expect(r.pin).toBe(true);
  expect(Math.abs(r.lng - 135.8), 'gotoPlace flew there through the engine').toBeLessThan(1.5);
});
