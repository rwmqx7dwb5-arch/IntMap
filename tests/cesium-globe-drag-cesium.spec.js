// (cesium-globe-drag) THE GLOBE DRAG, MEASURED ON BOTH ENGINES ALONG THE SAME PATH.
//
// MapLibre 6.4 moved its globe drag from a fixed degrees-per-pixel law (computeGlobePanCenter) to a
// versor rotation that brings the grabbed place back under the pointer (versorSetLocationAtPoint).
// js/cesium-input.js transcribes it as `globeDrag`. WHETHER THE TRANSCRIPTION IS THE FORMULA is not
// asked here: tests/cesium-globe-drag-checks.test.mjs runs MapLibre's own GlobeTransform and
// handleMapControlsPan against globeDrag over nine paths, every step (worst disagreement 2e-13).
// What only a browser can show is that the formula, fed by the REAL Cesium camera through its `geo`
// port (the ellipsoid scaled onto the unit sphere, the pole projected through the camera's own
// matrices), puts the same place under the same real pointer as MapLibre does. So: one page, each
// engine once, two paths —
//   · a pitched drag on the globe, read as the grabbed place's distance from the pointer in PIXELS
//     and in degrees, and as the camera centre (measured with this spec against the build before
//     the change: at the fourth step Cesium 17.44 px / 0.784° where MapLibre 1.38 px / 0.063°;
//     after, 1.38 px / 0.063°);
//   · a drag from inside the rim to beyond it, where the falloff and then the centre-pixel anchor
//     take over (before: the centre ended 12.81° from MapLibre's; after, 0.083°).
// ⚠ MapLibre's own slip is not zero: the drag keeps the bearing (fixedBearing), which drops the
// twist, so the grabbed place slides by twist × distance from the centre. "The same feel" is Cesium
// slipping as MapLibre slips — hence every bound below is differential.
import { test, expect } from '@playwright/test';
import { bootEngine } from './helpers/engine.js';

const BOOT = { timeout: 90_000 };

/* offsets from the canvas centre, in CSS px; the camera is parked before each path */
const PATHS = [
  { name: 'z4 pitched 40', cam: { center: [12, 40], zoom: 4, pitch: 40 }, press: [0, 80], step: [20, -25], n: 4 },
  /* at 1280×720 the silhouette sits ~225 px out at z1.7: three steps on the planet, two beyond */
  { name: 'z1.7 over the rim', cam: { center: [12, 25], zoom: 1.7 }, press: [150, 0], step: [25, 0], n: 5 },
];

const boot = async (page, engine) => {
  await bootEngine(page, engine, BOOT);
  /* the app restores the camera from its shared `#v=` URL on hashchange, and on MapLibre that
     restore calls stop(), which resets the drag handler mid-gesture (tests/r182-cesium.spec.js
     measured it); the round trip has its own tests, here it is noise */
  await page.evaluate(() => { window.addEventListener('hashchange', (e) => { e.stopImmediatePropagation(); }, true); });
  /* the place under a canvas pixel on the engine's OWN surface model — MapLibre's sphere, Cesium's
     ellipsoid, not the tessellated mesh, whose chord sags inside the curve at low zoom — or null off
     the planet. MapLibre's unproject SNAPS a pixel off the planet to the horizon, so ask the round trip. */
  await page.evaluate(() => {
    window.__globeDragPick = (px, py) => {
      const E = window.IntMapGeoEngine;
      if (E.id() === 'cesium') {
        const V = E.raw(), C = window.__imCesium.Cesium;
        const p = V._camera.pickEllipsoid(new C.Cartesian2(px, py), V._globe.ellipsoid);
        if (!p) return null;
        const c = C.Cartographic.fromCartesian(p);
        return { lng: C.Math.toDegrees(c.longitude), lat: C.Math.toDegrees(c.latitude) };
      }
      const ll = E.coords.unproject([px, py]);
      const back = ll && E.coords.project(ll);
      return (back && Math.hypot(back.x - px, back.y - py) < 1) ? { lng: ll.lng, lat: ll.lat } : null;
    };
  });
  await page.evaluate(() => new Promise((r) => {
    let done = false; const fin = () => { if (!done) { done = true; r(); } };
    try { window.IntMapGeoEngine.events.once('idle', fin); } catch (_) { /* ignore */ }
    /* Cesium never raised it within 8 s here (measured 8.6 s spent waiting); the park below waits
       for a still camera anyway, which is what a drag needs */
    setTimeout(fin, 3000);
  }));
};

const CAM_JS = `(() => { const x = window.IntMapGeoEngine.camera.get();
  return [x.center.lng, x.center.lat, x.zoom, x.bearing, x.pitch].map((v) => v.toFixed(6)).join(','); })()`;
/* stillness, not milliseconds: the page is hidden and rAF runs at a few Hz under the suite */
const settle = (page, budgetMs = 3000) => page.evaluate(async ([src, budget]) => {
  const at = new Function('return ' + src);
  let last = '', still = 0; const t0 = Date.now();
  while (Date.now() - t0 < budget && (still < 2 || Date.now() - t0 < 500)) {
    await new Promise((r) => setTimeout(r, 100));
    const now = at(); still = (now === last) ? still + 1 : 0; last = now;
  }
}, [CAM_JS, budgetMs]);

/* ONE round trip per step: wait for the camera to change, then read the place under the pointer,
   where the GRABBED place is on screen now, and the camera. Changed is enough — one move is one
   camera write on both engines (Cesium writes it inside pointermove, MapLibre on the next render
   frame, whole), so there is no later frame to wait for. MEASURED: the stillness poll this used to
   add cost 1.3–2.2 s a step on Cesium, whose main thread holds each timer for a whole frame here. */
const readStep = (page, key, x, y, grab) => page.evaluate(async ([src, k, px, py, g]) => {
  const at = new Function('return ' + src);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = Date.now();
  while (Date.now() - t0 < 4000 && at() === k) await wait(40);
  const E = window.IntMapGeoEngine;
  const under = window.__globeDragPick(px, py);
  const gp = g ? E.coords.project(g) : null;
  const c = E.camera.get();
  return { under, grabPx: gp ? Math.hypot(gp.x - px, gp.y - py) : null,
    centre: { lng: c.center.lng, lat: c.center.lat }, bearing: c.bearing };
}, [CAM_JS, key, x, y, grab]);

const D2R = Math.PI / 180;
const arc = (a, b) => {
  const c = Math.sin(a.lat * D2R) * Math.sin(b.lat * D2R) + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.cos((a.lng - b.lng) * D2R);
  return Math.acos(Math.max(-1, Math.min(1, c))) / D2R;
};

async function drive(page, engine) {
  await boot(page, engine);
  const b = await page.evaluate(() => {
    const r = window.IntMapGeoEngine.render.canvas().getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const cx = Math.round(b.w / 2), cy = Math.round(b.h / 2);
  const out = {};
  for (const P of PATHS) {
    await page.evaluate((c) => { window.IntMapGeoEngine.camera.jumpTo({ pitch: 0, bearing: 0, ...c }); }, P.cam);
    await settle(page);
    let x = cx + P.press[0], y = cy + P.press[1];
    /* a press that lands on a panel is not a drag of the map — say so rather than measure nothing */
    const press = await page.evaluate(([px, py, bx, by]) => {
      const E = window.IntMapGeoEngine;
      const el = document.elementFromPoint(bx + px, by + py);
      return { hit: !!el && el === E.render.canvas(), grab: window.__globeDragPick(px, py) };
    }, [x, y, b.x, b.y]);
    expect(press.hit, `${engine} ${P.name}: the press point must land on the map canvas`).toBe(true);
    expect(press.grab, `${engine} ${P.name}: the press must grab a place`).not.toBeNull();
    const grab = { lng: press.grab.lng, lat: press.grab.lat };
    await page.mouse.move(b.x + x, b.y + y);
    await page.mouse.down();
    const steps = [];
    for (let i = 0; i < P.n; i++) {
      x += P.step[0]; y += P.step[1];
      const key = await page.evaluate(CAM_JS);
      await page.mouse.move(b.x + x, b.y + y);
      const s = await readStep(page, key, x, y, grab);
      steps.push({ on: !!s.under, slip: s.under ? arc(grab, s.under) : null,
        px: s.under ? s.grabPx : null, centre: s.centre, bearing: s.bearing });
    }
    await page.mouse.up();
    await settle(page);
    out[P.name] = steps;
  }
  return out;
}

test('cesium-globe-drag: the grabbed place stays under the pointer on Cesium as on MapLibre, and the centre follows MapLibre over the rim', async ({ page }) => {
  test.setTimeout(300_000);
  const ml = await drive(page, 'maplibre');
  const cs = await drive(page, 'cesium');

  const f = (v, d = 4) => (v == null ? '  off ' : v.toFixed(d).padStart(7));
  for (const P of PATHS) {
    const a = ml[P.name], c = cs[P.name];
    console.log(`\n${P.name}\n step  slip ML   slip CS   px ML    px CS    centre ML→CS (deg)`);
    for (let i = 0; i < a.length; i++) {
      console.log(`  ${i + 1}   ${f(a[i].slip)}   ${f(c[i].slip)}   ${f(a[i].px, 2)}  ${f(c[i].px, 2)}   ${arc(a[i].centre, c[i].centre).toFixed(4)}`);
    }
  }

  for (const P of PATHS) {
    const a = ml[P.name], c = cs[P.name];
    const total = arc(a[0].centre, a[a.length - 1].centre) + 1e-9;
    for (let i = 0; i < a.length; i++) {
      const at = `${P.name} step ${i + 1}`;
      /* on the planet on one engine means on it on the other: the same pixel, the same camera */
      expect(c[i].on, `${at}: on the globe on MapLibre (${a[i].on}) and on Cesium (${c[i].on})`).toBe(a[i].on);
      if (a[i].slip != null && c[i].slip != null) {
        /* the slip is MapLibre's to within 0.02° plus 10% of MapLibre's own — the second term is
           the sphere-against-ellipsoid difference, which scales with how far the drag has gone */
        expect(Math.abs(c[i].slip - a[i].slip), `${at}: slip ML ${a[i].slip} vs CS ${c[i].slip}`)
          .toBeLessThan(0.02 + 0.1 * a[i].slip);
        /* …and on screen: the grabbed place is as many pixels from the pointer as on MapLibre, to
           within a pixel plus 10% */
        expect(Math.abs(c[i].px - a[i].px), `${at}: grabbed place ${a[i].px} px from the pointer on MapLibre, ${c[i].px} px on Cesium`)
          .toBeLessThan(1 + 0.1 * a[i].px);
      }
      /* and the camera went where MapLibre's went, to within 3% of the whole drag's arc */
      expect(arc(a[i].centre, c[i].centre), `${at}: centre ML ${JSON.stringify(a[i].centre)} vs CS ${JSON.stringify(c[i].centre)}`)
        .toBeLessThan(0.02 + 0.03 * total);
      expect(Math.abs(c[i].bearing), `${at}: the drag keeps the bearing`).toBeLessThan(0.5);
    }
  }
  /* the pitched path stays ON the planet throughout, and there the grabbed place stays under the
     pointer in absolute terms too: MapLibre measured 0.6–1.4 px over these four steps, the old
     Cesium law 3.55 px at the first and 17.44 px at the fourth */
  for (const [i, s] of cs[PATHS[0].name].entries()) {
    expect(s.on, 'the pitched path stays on the planet').toBe(true);
    expect(s.px, `pitched step ${i + 1}: the grabbed place is ${s.px} px from the pointer on Cesium`).toBeLessThan(3);
  }
  /* the rim path really does cross the rim, or it measured nothing it claims to */
  const rim = ml[PATHS[1].name];
  expect(rim.some((s) => s.on) && rim.some((s) => !s.on), 'the rim path has steps on and beyond the planet').toBe(true);
});
