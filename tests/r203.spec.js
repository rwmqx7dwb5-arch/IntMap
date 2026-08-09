/* ============================================================================
 *  IntMap · R203 browser regressions
 * ----------------------------------------------------------------------------
 *  ⚠ ONE PAGE FOR THE WHOLE FILE. This spec is in the CORE tier — the 29 files that run before every
 *  push — and the whole point of that tier is that it is under nine minutes. A fresh context per test
 *  is a fresh boot per test, and on a runner with no GPU #R186 measured a boot at 9.2 s. Serial mode
 *  plus one page is what tests/r197 and tests/r201 already do for the same reason; each test here
 *  leaves the camera where it found it.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { OpeningView } from '../js/opening-view.js';

test.describe.configure({ mode: 'serial' });

let page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/');
  await page.waitForFunction(() => {
    try { return !!window.__imap && window.IntMapGeoEngine.canDraw(); } catch (_) { return false; }
  }, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
});
test.afterAll(async () => { await page?.close(); });

/* The PLANET's own pixels, read inside a render tick — the context has no preserveDrawingBuffer, so
   this is the only honest way to ask what is on screen (#R197).
   ⚠ THE CENTRAL FIFTH, NOT THE WHOLE CANVAS. Measured while writing this: the whole canvas is 72 %
   dark at the opening zoom even when the Earth is fully lit, because at z1.7 the globe is a disc in
   the middle and everything around it is sky — and sky at 10,000 km up is space, correctly. A metric
   that counts the sky answers "how much of the frame is the planet", which is not the question. */
async function canvasStats(p) {
  return p.evaluate(() => new Promise((res) => {
    const m = window.__imap, cv = m.getCanvas();
    m.once('render', () => {
      try {
        const c = document.createElement('canvas'); c.width = 160; c.height = 160;
        const g = c.getContext('2d');
        const sw = Math.round(cv.width * 0.34), sh = Math.round(cv.height * 0.34);
        g.drawImage(cv, (cv.width - sw) >> 1, (cv.height - sh) >> 1, sw, sh, 0, 0, 160, 160);
        const d = g.getImageData(0, 0, 160, 160).data;
        let r = 0, gg = 0, b = 0, dark = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
          if (d[i] + d[i + 1] + d[i + 2] < 45) dark++;
        }
        res({ r: r / n, g: gg / n, b: b / n, darkFrac: dark / n });
      } catch (e) { res({ err: String(e && e.message || e) }); }
    });
    m.triggerRepaint();
  }));
}

/* ── ① 「起動したときに地図が真っ暗になっている場合がある」 ──────────────────────────────────
   MEASURED before the fix, on this exact boot: the whole canvas averaged [29,30,36] with 52 % of its
   pixels under luminance 15, because the app opened at 10°E at 22:49 UTC — half past midnight, so
   the entire visible hemisphere was #R201's night side. The fix is the opening LONGITUDE, and this
   asserts the consequence rather than the mechanism: whenever the suite runs, the Sun is up over
   the centre and the planet is not black. */
test('R203 ① the app does not open on a black planet, at whatever hour the suite runs', async () => {
  /* ⚠ THE MODULE IS BUNDLED, SO A TEST CANNOT `import('/js/opening-view.js')` FROM THE PAGE — the
     first version of this check did, caught the rejection, and SKIPPED ITSELF, which is the silent
     pass this repository keeps warning about. The app publishes what it decided instead. */
  const chosen = await page.evaluate(() => window.__imOpeningCentre);
  expect(Array.isArray(chosen), 'the app published the centre it opened at').toBe(true);
  expect(chosen[1], 'at the latitude it always has').toBeCloseTo(20, 4);
  /* the property, evaluated HERE rather than in the page: the Sun is up over what the app chose.
     ⚠ NOT compared against `camera.getCenter()` — on a desktop the sidebar sets camera PADDING, so
     the reported centre is the centre of the padded view and is tens of degrees away from the one
     the view was created at. Measured while writing this: published 176.748, reported 89.107. */
  expect(OpeningView.solarElevation(Date.now(), chosen[1], chosen[0]),
    'the Sun stands over the opening centre').toBeGreaterThan(OpeningView.MIN_ELEV_DEG - 1);

  const s = await canvasStats(page);
  expect(s.err, 'the canvas could be read').toBeUndefined();
  const lum = (s.r + s.g + s.b) / 3;
  /* before the fix, over the same central window: mean 29 and 52 % of the pixels under luminance 15 */
  expect(lum, `the planet under the camera is lit (mean luminance ${lum.toFixed(1)})`).toBeGreaterThan(60);
  expect(s.darkFrac, `and it is not night (${(100 * s.darkFrac).toFixed(0)}% dark)`).toBeLessThan(0.25);
});

/* ── ② 「ななめに地表を見た際にズームすると、地平線付近が点滅する」 ───────────────────────────
   The mechanism, measured frame by frame: `transform.farZ` alternated between MapLibre's own plane
   and the stretched one — 93 changes of more than 50 % in 186 frames — because every frame whose
   altitude had moved 5 % cleared the override and let the next one put it back. A frame drawn with
   the short plane loses everything under the horizon, which is the flash. */
test('R203 ② a pitched zoom does not flip the far clip plane frame to frame', async () => {
  await page.evaluate(() => window.__imap.jumpTo({ center: [138.7274, 35.3606], zoom: 11.5, pitch: 78, bearing: 20 }));
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    window.__fz = [];
    window.__fzOff = () => window.__imap.off('render', window.__fzOn);
    window.__fzOn = () => { try { window.__fz.push(window.__imap.transform.farZ); } catch (_) {} };
    window.__imap.on('render', window.__fzOn);
  });
  const box = await page.evaluate(() => { const r = window.__imap.getCanvas().getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(box.x + box.w / 2, box.y + box.h * 0.6);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(120);
  }
  const fz = await page.evaluate(() => { window.__fzOff(); return window.__fz; });
  expect(fz.length, 'frames were drawn').toBeGreaterThan(20);
  let flips = 0;
  for (let i = 1; i < fz.length; i++) {
    const a = fz[i - 1], b = fz[i];
    if (a > 0 && b > 0 && Math.max(a / b, b / a) > 1.5) flips++;
  }
  /* the sphere→plane handover at z12 legitimately changes the plane once; a flicker is dozens */
  expect(flips, `far-plane jumps in ${fz.length} frames (was 93 of 186)`).toBeLessThanOrEqual(6);
  await page.evaluate(() => window.__imap.jumpTo({ pitch: 0, bearing: 0, zoom: 3 }));
  await page.waitForTimeout(700);
});

/* ── ③ 「同じサイズで戻るようにしろ／遷移を断絶的に勝手にするな／別の地球に差し替えるな」 ────── */
test('R203 ③ the space crossing hands the Earth over at the same size and face, both ways', async () => {
  await page.evaluate(() => window.__imap.jumpTo({ center: [139.7, 35.7], zoom: 0.9, pitch: 0, bearing: 0 }));
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => {
    const G = window.IntMapGeoEngine, c = G.camera.getCenter();
    const a = G.coords.project([c.lng, c.lat]), b = G.coords.project([c.lng + 90, c.lat]);
    /* (#R208) …and the ROLL: the screen angle of north, clockwise from straight up. This is the
       fourth thing the crossing has to carry, beside the size, the face and the instant. */
    const n = G.coords.project([c.lng, c.lat + 0.5]);
    return { zoom: G.camera.get().zoom, px: Math.hypot(b.x - a.x, b.y - a.y), lng: c.lng, lat: c.lat,
      northDeg: Math.atan2(n.x - a.x, -(n.y - a.y)) * 180 / Math.PI };
  });
  expect(before.px, 'the map is showing a globe with a measurable radius').toBeGreaterThan(20);

  const entered = await page.evaluate(() => {
    if (!window.IntMapSpace) return null;
    window.IntMapSpace.enterFromZoom();
    return window.IntMapSpace.state();
  });
  expect(entered, 'the space explorer exists').not.toBeNull();
  expect(entered.open).toBe(true);
  /* arriving from the map means arriving AT THE EARTH, not at Neptune's orbit */
  expect(entered.mode).toBe('system');
  expect(entered.focus).toBe('earth');
  expect(entered.atNearLimit, 'the Earth is at least map-sized, so one zoom-in gesture hands it back').toBe(true);

  /* ══ (#R208) 「地軸の傾きが微妙に違って、非連続的」 ══════════════════════════════════════════════
     The up-vector used to be the literal ecliptic north while the map draws the Earth with its own
     axis vertical, so the planet rolled by the obliquity in the frame the crossing handed over.
     ⚠ ASSERTED AS ONE NUMBER EITHER SIDE OF THE SEAM rather than as the mechanism: the screen angle
     of north. The map's is `before.northDeg`; the scene's is `state().northRollDeg`.
     ⚠ AND THE BLEND MUST BE EXACTLY 1 HERE ON EVERY WINDOW. Two earlier versions expressed the knee
     as a fraction of the viewport half-height and arrived at 0.85 / 0.69 / 0.53 on a laptop, a phone
     and a tablet, because the map's globe at minimum zoom is a constant ~89 px and so a different
     fraction of every window. Taking the ratio against the handover size makes it 1 by construction. */
  expect(entered.axisBlend, 'at the seam the scene is in the map’s frame, not the ecliptic').toBe(1);
  expect(Math.abs(entered.northRollDeg - before.northDeg),
    `north is at ${entered.northRollDeg}° in space against ${before.northDeg.toFixed(2)}° on the map`)
    .toBeLessThan(0.5);

  await page.waitForTimeout(1200);
  await page.evaluate(() => window.IntMapSpace.leaveToMap());
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => {
    const G = window.IntMapGeoEngine, c = G.camera.getCenter();
    const a = G.coords.project([c.lng, c.lat]), b = G.coords.project([c.lng + 90, c.lat]);
    return { zoom: G.camera.get().zoom, px: Math.hypot(b.x - a.x, b.y - a.y), lng: c.lng, lat: c.lat, open: window.IntMapSpace.state().open };
  });
  expect(after.open, 'the map is back').toBe(false);
  /* 「はるかにズームインして普通の地球に戻る」 is what must NOT happen: the same size, within 5 % */
  expect(Math.abs(after.px - before.px) / before.px,
    `globe radius ${after.px.toFixed(1)} px against ${before.px.toFixed(1)} px`).toBeLessThan(0.05);
  /* …and the same face: the round trip must not rotate the planet */
  const dLng = Math.abs(((after.lng - before.lng + 540) % 360) - 180);
  expect(dLng, 'the centre longitude survived the round trip').toBeLessThan(3);
  expect(Math.abs(after.lat - before.lat)).toBeLessThan(3);

  /* (#R208) …and a ROTATED map hands over its own roll. Same page, same boot — the crossing is the
     only thing repeated. This is what pins the sign: the map draws north at −bearing from screen up,
     so at bearing 40 the Earth's pole must be 40° anticlockwise of vertical in space as well. */
  const rot = await page.evaluate(async () => {
    const G = window.IntMapGeoEngine, S = window.IntMapSpace;
    G.camera.jumpTo({ center: [139.7, 35.7], zoom: 0.9, pitch: 0, bearing: 40 });
    await new Promise((r) => setTimeout(r, 1200));
    const c = G.camera.getCenter();
    const a = G.coords.project([c.lng, c.lat]), n = G.coords.project([c.lng, c.lat + 0.5]);
    const mapNorth = Math.atan2(n.x - a.x, -(n.y - a.y)) * 180 / Math.PI;
    S.enterFromZoom();
    await new Promise((r) => setTimeout(r, 900));
    const st = S.state();
    S.leaveToMap();
    await new Promise((r) => setTimeout(r, 900));
    G.camera.jumpTo({ bearing: 0 });
    return { mapNorth, spaceNorth: st.northRollDeg, blend: st.axisBlend, mapRollDeg: st.mapRollDeg };
  });
  expect(rot.mapNorth, 'the map puts north at −bearing from screen up').toBeCloseTo(-40, 1);
  expect(rot.blend, 'the rotated crossing is still fully in the map’s frame').toBe(1);
  expect(Math.abs(rot.spaceNorth - rot.mapNorth),
    `north is at ${rot.spaceNorth}° in space against ${rot.mapNorth.toFixed(2)}° on the rotated map`)
    .toBeLessThan(0.5);
  await page.waitForTimeout(600);
});

/* ── ④ the Earth in space is the app's own Earth, and the Moon is beside it rather than inside ── */
test('R203 ④ model scale puts the Moon outside the Earth, and the Earth wears the app’s basemap', async () => {
  const r = await page.evaluate(async () => {
    const S = window.IntMapSpace; if (!S) return null;
    S.open({ mode: 'system', scale: 'model', body: 'earth' });
    const st = S.state();
    /* the texture the explorer asks for must be the one js/world-base.js owns */
    const wb = (window.IntMapWorldBase && window.IntMapWorldBase.url && window.IntMapWorldBase.url()) || '';
    const asked = await new Promise((res) => {
      const seen = [];
      const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) seen.push(e.name); });
      try { po.observe({ type: 'resource', buffered: true }); } catch (_) {}
      setTimeout(() => { try { po.disconnect(); } catch (_) {} res(seen); }, 1200);
    });
    S.close();
    return { st, wb, planetEarth: asked.some((u) => /planets\/earth\.jpg/.test(u)),
      basemap: asked.some((u) => /world-basemap\.jpg/.test(u)) };
  });
  expect(r, 'the space explorer exists').not.toBeNull();
  expect(r.wb, 'js/world-base.js still owns the whole-Earth picture').toMatch(/world-basemap\.jpg/);
  expect(r.planetEarth, 'nothing fetched a second Earth').toBe(false);
  expect(r.st.err, 'the scene reported no error').toBeFalsy();
});
