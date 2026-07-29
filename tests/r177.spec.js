// R177 behavioural checks in a real browser, against the BUILT site (playwright.config.js builds
// first and serves dist/). Every number quoted below was produced by running the failing version
// first — these are regressions, not aspirations.
//
//   1. with the tilt ceiling lifted the viewpoint does not move — on the SPHERE as well as the plane
//   2. …and the thing that measures it does not share an equation with the thing that fixes it
//   3. a zoom is still a dolly at every tilt (#R175 must survive)
//   4. a journey still arrives where it was sent (#R173 must survive)
//   5. standard tilt is untouched — the hook is not even installed
//   6. the anchor never hands the renderer a camera it cannot hold
import { test, expect } from '@playwright/test';

const boot = async page => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__imap, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__imap.isStyleLoaded(), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1200);
};

/* ── THE RULER ──────────────────────────────────────────────────────────────────────────────────
   #R172-#R176 each measured the viewpoint with the same equation their correction used, and each
   read 0 m while the real drift grew to thousands of kilometres. So this one is built from the
   matrix MapLibre DRAWS with: invert it, take two view rays, and intersect them — every ray meets
   at the camera, in whatever space the matrix happens to be.

   transform.cameraPosition is deliberately NOT used: on the mercator transform it is
   inv(viewProj)·(0,0,-1,1), the NEAR-PLANE centre, which sits nearZ (= height/50 px) ahead of the
   camera and shifts with pitch — worth 223 m at z12 and enough to look like a real drift. */
const RULER = () => {
  const m = window.__imap, R = 6371008.8, D = Math.PI / 180;
  const inv = a => { const o = new Float64Array(16);
    const b00=a[0]*a[5]-a[1]*a[4],b01=a[0]*a[6]-a[2]*a[4],b02=a[0]*a[7]-a[3]*a[4],b03=a[1]*a[6]-a[2]*a[5],
          b04=a[1]*a[7]-a[3]*a[5],b05=a[2]*a[7]-a[3]*a[6],b06=a[8]*a[13]-a[9]*a[12],b07=a[8]*a[14]-a[10]*a[12],
          b08=a[8]*a[15]-a[11]*a[12],b09=a[9]*a[14]-a[10]*a[13],b10=a[9]*a[15]-a[11]*a[13],b11=a[10]*a[15]-a[11]*a[14];
    let d = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06; if (!d) return null; d = 1/d;
    o[0]=(a[5]*b11-a[6]*b10+a[7]*b09)*d; o[1]=(a[2]*b10-a[1]*b11-a[3]*b09)*d; o[2]=(a[13]*b05-a[14]*b04+a[15]*b03)*d; o[3]=(a[10]*b04-a[9]*b05-a[11]*b03)*d;
    o[4]=(a[6]*b08-a[4]*b11-a[7]*b07)*d; o[5]=(a[0]*b11-a[2]*b08+a[3]*b07)*d; o[6]=(a[14]*b02-a[12]*b05-a[15]*b01)*d; o[7]=(a[8]*b05-a[10]*b02+a[11]*b01)*d;
    o[8]=(a[4]*b10-a[5]*b08+a[7]*b06)*d; o[9]=(a[1]*b08-a[0]*b10-a[3]*b06)*d; o[10]=(a[12]*b04-a[13]*b02+a[15]*b00)*d; o[11]=(a[9]*b02-a[8]*b04-a[11]*b00)*d;
    o[12]=(a[5]*b07-a[4]*b09-a[6]*b06)*d; o[13]=(a[0]*b09-a[1]*b07+a[2]*b06)*d; o[14]=(a[13]*b01-a[12]*b03-a[14]*b00)*d; o[15]=(a[8]*b03-a[9]*b01+a[10]*b00)*d;
    return o; };
  const xf = (M, v) => { const x=v[0],y=v[1],z=v[2], w=M[3]*x+M[7]*y+M[11]*z+M[15];
    return [(M[0]*x+M[4]*y+M[8]*z+M[12])/w, (M[1]*x+M[5]*y+M[9]*z+M[13])/w, (M[2]*x+M[6]*y+M[10]*z+M[14])/w]; };
  window.__eye = () => {
    const I = inv(m.transform.modelViewProjectionMatrix); if (!I) return null;
    const A = xf(I,[0,0,-0.9]), B = xf(I,[0,0,0.9]), C = xf(I,[0.6,0.4,-0.9]), E = xf(I,[0.6,0.4,0.9]);
    const u=[B[0]-A[0],B[1]-A[1],B[2]-A[2]], v=[E[0]-C[0],E[1]-C[1],E[2]-C[2]], w0=[A[0]-C[0],A[1]-C[1],A[2]-C[2]];
    const dot=(p,q)=>p[0]*q[0]+p[1]*q[1]+p[2]*q[2];
    const a=dot(u,u), b=dot(u,v), c=dot(v,v), d2=dot(u,w0), e=dot(v,w0), den=a*c-b*b;
    const s = den ? (b*e-c*d2)/den : 0;
    const p = [A[0]+s*u[0], A[1]+s*u[1], A[2]+s*u[2]];
    // the vertical-perspective matrix works in EARTH RADII, the mercator one in [worldPx, worldPx, m]
    if (Math.max(Math.abs(p[0]),Math.abs(p[1]),Math.abs(p[2])) < 64) { const r = Math.hypot(p[0],p[1],p[2]);
      return { space:'sphere', lng: Math.atan2(p[0],p[2])/D, lat: Math.asin(p[1]/r)/D, alt: (r-1)*R }; }
    const ws = m.transform.worldSize, x = p[0]/ws, y = p[1]/ws;
    return { space:'merc', lng: ((((x*360-180)+180)%360+360)%360)-180,
             lat: 360/Math.PI*Math.atan(Math.exp((180-y*360)*D))-90, alt: p[2] };
  };
  window.__gap = (a, b) => { if (!a || !b) return NaN;
    const f1=a.lat*D, f2=b.lat*D;
    const h = Math.sin((f2-f1)/2)**2 + Math.cos(f1)*Math.cos(f2)*Math.sin((b.lng-a.lng)*D/2)**2;
    return Math.hypot(2*R*Math.asin(Math.min(1,Math.sqrt(h))), b.alt-a.alt); };
};

/* ── ① 「視点の位置を変えるなと言っているのに、変わる。高度が明らかに変わっている」 ────────────
   The FIFTH report. Measured on the #R176 build with the ruler above:

       globe z3  Tokyo   drift 7,115 km   eye altitude 8,573 km → 1,948 km during one drag
       globe z6  Tokyo         475 km                 1,072 km →   610 km
       globe z10 Tokyo        27.6 km                  67.0 km →  39.4 km
       flat  z6  Tromsø       64.4 km                   453 km →   388 km
       z12 Tokyo               193 m                 16,522 m → 16,588 m

   …while the ruler #R176 shipped read 0 m for every one of them, because it WAS the fix. */
for (const c of [{ proj: 'globe', z: 3, lng: 139.767, lat: 35.681, tag: 'globe z3 Tokyo' },
                 { proj: 'globe', z: 6, lng: 139.767, lat: 35.681, tag: 'globe z6 Tokyo' },
                 { proj: 'globe', z: 10, lng: 139.767, lat: 35.681, tag: 'globe z10 Tokyo' },
                 { proj: 'globe', z: 12, lng: 139.767, lat: 35.681, tag: 'globe z12 Tokyo' },
                 { proj: 'globe', z: 6, lng: 15.0, lat: 69.65, tag: 'globe z6 Tromso' },
                 { proj: 'mercator', z: 6, lng: 15.0, lat: 69.65, tag: 'flat z6 Tromso' },
                 { proj: 'mercator', z: 12, lng: 139.767, lat: 35.681, tag: 'flat z12 Tokyo' }]) {
  test(`unlimited tilt holds the viewpoint still — ${c.tag}`, async ({ page }) => {
    test.setTimeout(180000);
    await boot(page);
    await page.evaluate(RULER);
    const r = await page.evaluate(async (cc) => {
      const m = window.__imap, el = m.getCanvasContainer();
      const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const b = el.getBoundingClientRect();
      const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
      const fire = (t, type, x, y, buttons) => t.dispatchEvent(new MouseEvent(type,
        { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons, ctrlKey: true, view: window }));
      window.IntMapTilt.set(false);
      m.setProjection({ type: cc.proj });
      m.jumpTo({ center: [cc.lng, cc.lat], zoom: cc.z, pitch: 0, bearing: 0 });
      await frame(); await frame();
      window.IntMapTilt.set(true);
      m.jumpTo({ center: [cc.lng, cc.lat], zoom: cc.z, pitch: 0, bearing: 0 });
      await frame(); await frame();
      const E0 = window.__eye();
      fire(el, 'mousedown', cx, cy, 1); await frame();
      let y = cy, prev = E0, drift = 0, jump = 0, altMin = E0.alt, altMax = E0.alt;
      for (let i = 0; i < 18; i++) {
        y -= 6; fire(document, 'mousemove', cx, y, 1); await frame();
        const E = window.__eye();
        drift = Math.max(drift, window.__gap(E0, E));
        jump = Math.max(jump, window.__gap(prev, E));
        altMin = Math.min(altMin, E.alt); altMax = Math.max(altMax, E.alt);
        prev = E;
      }
      fire(document, 'mouseup', cx, y, 0); await frame();
      return { space: E0.space, drift, jump, alt0: E0.alt, altMin, altMax, endPitch: m.getPitch() };
    }, c);
    expect(r.endPitch, 'the drag really tilted the map').toBeGreaterThan(30);
    expect(r.drift, 'the viewpoint must not move').toBeLessThan(1);
    expect(r.jump, 'and it must not jump between frames').toBeLessThan(1);
    // 「高度が明らかに変わっている」 — the altitude is part of the viewpoint, stated separately
    // because it is the half of the complaint a horizontal-only check would pass.
    expect(Math.abs(r.altMax - r.alt0), 'the eye altitude must not climb').toBeLessThan(1);
    expect(Math.abs(r.alt0 - r.altMin), 'the eye altitude must not fall').toBeLessThan(1);
  });
}

/* ── ② the readout's viewpoint IS the renderer's viewpoint ──────────────────────────────────────
   camera.eye() feeds the always-on 「視点」 chip, the 3-D solid shader's camera, and the tilt
   anchor. Checking it against the draw matrix is what makes the anchor's own test independent:
   if this passes, the two can never silently share an error again. */
test('camera.eye() agrees with the matrix the renderer draws with', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(RULER);
  const rows = [];
  for (const proj of ['globe', 'mercator'])
    for (const z of [3, 6, 12])
      for (const [p, b] of [[0, 0], [45, 0], [45, 90], [80, 200]]) {
        rows.push(await page.evaluate(async (s) => {
          const m = window.__imap;
          window.IntMapTilt.set(true);
          window.IntMapGeoEngine.camera.setTiltPivot('target');   // land exactly where asked
          m.setProjection({ type: s.proj });
          m.jumpTo({ center: [139.767, 35.681], zoom: s.z, pitch: s.p, bearing: s.b });
          await new Promise(r => setTimeout(r, 150));
          const T = window.__eye(), G = window.IntMapGeoEngine.camera.eye();
          return { tag: `${s.proj} z${s.z} p${s.p} b${s.b}`, space: T.space, err: G ? window.__gap(T, G) : 1e12,
                   alt: Math.round(T.alt) };
        }, { proj, z, p, b }));
      }
  for (const r of rows) expect(r.err, `${r.tag} [${r.space}] eye altitude ${r.alt} m`).toBeLessThan(1);
  expect(rows.some(r => r.space === 'sphere'), 'the sphere model was exercised').toBe(true);
  expect(rows.some(r => r.space === 'merc'), 'the mercator model was exercised').toBe(true);
});

/* ── ③ #R175 must survive: a zoom is a DOLLY at every tilt ──────────────────────────────────── */
test('a zoom is still a dolly at every tilt (#R175)', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  await page.evaluate(RULER);
  const rows = await page.evaluate(async () => {
    const m = window.__imap, el = m.getCanvasContainer();
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const out = [];
    for (const pitch of [0, 60, 85, 110, 150]) {
      window.IntMapTilt.set(false);
      m.setProjection({ type: 'mercator' });
      m.jumpTo({ center: [139.767, 35.681], zoom: 12, pitch: 0, bearing: 0 }); await wait(250);
      window.IntMapTilt.set(true);
      m.jumpTo({ center: [139.767, 35.681], zoom: 12, pitch: 0, bearing: 0 }); await wait(250);
      m.setPitch(pitch); await wait(250);
      const z0 = m.getZoom(), a0 = window.__eye().alt;
      for (let i = 0; i < 4; i++) {
        el.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
        await wait(320);
      }
      out.push({ pitch, ratio: window.__eye().alt / a0, expect: Math.pow(2, z0 - m.getZoom()) });
    }
    return out;
  });
  for (const r of rows) {
    expect(r.expect, `zoom really changed at pitch ${r.pitch}`).toBeLessThan(0.9);
    expect(Math.abs(r.ratio - r.expect), `pitch ${r.pitch}: eye ratio ${r.ratio} vs zoom ratio ${r.expect}`).toBeLessThan(0.03);
  }
});

/* ── ④ #R173 must survive: a journey still arrives ──────────────────────────────────────────── */
test('a journey still lands where it was sent (#R173)', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const m = window.__imap;
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const km = (a, b) => { const D = Math.PI / 180, R = 6371008.8;
      const h = Math.sin((b.lat - a.lat) * D / 2) ** 2 + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.sin((b.lng - a.lng) * D / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
    window.IntMapTilt.set(true);
    m.setProjection({ type: 'mercator' });
    m.jumpTo({ center: [139.767, 35.681], zoom: 10, pitch: 0, bearing: 0 }); await wait(300);
    m.jumpTo({ center: [2.3522, 48.8566], zoom: 11, pitch: 55, bearing: 0 }); await wait(500);
    const jump = km(m.getCenter(), { lng: 2.3522, lat: 48.8566 });
    m.jumpTo({ center: [139.767, 35.681], zoom: 10, pitch: 0, bearing: 0 }); await wait(300);
    m.flyTo({ center: [2.3522, 48.8566], zoom: 11, pitch: 55, duration: 0 }); await wait(700);
    return { jump, fly: km(m.getCenter(), { lng: 2.3522, lat: 48.8566 }) };
  });
  expect(r.jump, 'jumpTo to Paris arrives at Paris').toBeLessThan(1000);
  expect(r.fly, 'flyTo to Paris arrives at Paris').toBeLessThan(1000);
});

/* ── ⑤ standard tilt is BYTE-IDENTICAL: the hook is not installed at all ────────────────────── */
test('standard tilt does not go through any of this', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const r = await page.evaluate(async () => {
    const m = window.__imap;
    window.IntMapTilt.set(false);
    await new Promise(res => setTimeout(res, 200));
    return { hook: m.transformCameraUpdate == null, ceiling: m.getMaxPitch() };
  });
  expect(r.hook, 'no transformCameraUpdate while the ceiling is standard').toBe(true);
  expect(r.ceiling).toBe(78);
});

/* ── ⑥ never hand the renderer a camera it cannot hold ──────────────────────────────────────
   Tilted past the horizon on the sphere, the pivot the eye implies leaves ±85.051° and the zoom
   that goes with it leaves the map's range. Forcing it answered z −0.167 at 85.0511°N — and the
   next camera change FROZE the page (not threw) inside MapLibre's tile cover. Plain MapLibre at the
   same pitch is fine, so that camera was ours. */
test('the anchor never emits a camera outside the renderer\'s range', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  const r = await Promise.race([
    page.evaluate(async () => {
      const m = window.__imap;
      const wait = ms => new Promise(res => setTimeout(res, ms));
      window.IntMapTilt.set(true);
      const seen = [];
      for (const s of [{ z: 6, p: 0, b: 0 }, { z: 6, p: 120, b: 45 }, { z: 12, p: 0, b: 0 },
                       { z: 3, p: 175, b: 0 }, { z: 15, p: 90, b: 300 }]) {
        m.setProjection({ type: 'globe' });
        m.jumpTo({ center: [139.767, 35.681], zoom: s.z, pitch: s.p, bearing: s.b });
        await wait(350);
        const t = m.transform;
        // the renderer sizes its frustum from cameraToCenterDistance + elevation·pixelPerMeter,
        // so THAT ratio — not the metres — is what says whether a camera is one it can handle
        const ppm = t.pixelsPerMeter || (t.worldSize / (2 * Math.PI * 6371008.8 * Math.cos(m.getCenter().lat * Math.PI / 180)));
        const elev = +m.getCameraTargetElevation() || 0;
        seen.push({ tag: `z${s.z} p${s.p}`, zoom: m.getZoom(), lat: m.getCenter().lat, elev,
                    looks: Math.abs(elev * ppm) / (t.cameraToCenterDistance || 1080) });
      }
      return seen;
    }, null),
    new Promise(res => setTimeout(() => res('FROZE'), 60000)),
  ]);
  expect(r, 'the page must still be running').not.toBe('FROZE');
  for (const s of r) {
    expect(s.zoom, `${s.tag}: zoom ${s.zoom} in range`).toBeGreaterThanOrEqual(0);
    expect(s.zoom, `${s.tag}: zoom ${s.zoom} in range`).toBeLessThanOrEqual(19);
    expect(Math.abs(s.lat), `${s.tag}: centre latitude ${s.lat} in range`).toBeLessThanOrEqual(85.06);
    // 1,488 km at z12 was 89 look-distances from sea level, and the renderer froze on it
    expect(s.looks, `${s.tag}: target ${Math.round(s.elev)} m = ${s.looks.toFixed(1)} look-distances`).toBeLessThanOrEqual(51);
  }
});
