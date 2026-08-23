/* ============================================================================
 *  R379 — the same mark on the OTHER engine.
 *
 *  A billboard's texel is multiplied by its colour, so one tinted sprite cannot be a coloured body
 *  and a white outline at once — and the body's colour is a continuous altitude ramp, not a palette
 *  that could be baked. js/cesium-engine.js therefore draws TWO billboards per aircraft: the white
 *  annulus the stroke paints, and the body inset by half of it. Two invariants make that safe, and
 *  neither is visible to a source-text check:
 *
 *    · the PAIRING — rim at 2k, body at 2k+1, same position, same screen angle, same scale. Half a
 *      pair left behind is an aeroplane with somebody else's outline on it.
 *    · the TINT — the body carries the aircraft's own colour, the rim is white at the stroke's own
 *      alpha. Getting these the wrong way round paints white aeroplanes with coloured haloes.
 *
 *  ⚠ NAMED `r379-cesium.spec.js`, NOT `r379.spec.js`. The round's gate on every push is the file
 *  without a suffix; a Cesium boot is 90 s of engine download and belongs in the deep tier
 *  (scripts/tiers.mjs). The MapLibre half — that the shader compiles at all — is in the gate.
 *
 *  ⚠ NO FEED. The fleet here is three aircraft this file publishes through the engine contract.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { bootEngine } from './helpers/engine.js';

const ID = 'r379-cesium-probe';

test('R379 Cesium draws the pair — white rim, coloured body, one aircraft', async ({ page }) => {
  await bootEngine(page, 'cesium', { timeout: 120_000 });

  const got = await page.evaluate(async ({ ID }) => {
    const E = window.IntMapGeoEngine;
    /* ⚠ `window.__imap` IS the CesiumView on a Cesium session — the adapter's own `raw()` returns
       it. That is how this reads the collection without a hook that exists only for a test. */
    const V = E.raw();
    if (!E.layers.addAircraftCloud(ID)) return { err: 'the engine would not take an aircraft cloud' };

    const c = V.getCenter();
    const D2R = Math.PI / 180;
    const mx = (180 + c[0]) / 360;
    const p = Math.max(-89.9999, Math.min(89.9999, c[1])) * D2R;
    const my = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + p / 2))) / 360;
    const pos = [], vel = [], form = [], col = [], z = [];
    /* three aircraft, three colours and three tracks — enough that a pairing bug cannot look right
       by accident, and few enough that the assertions below can name every one of them */
    const put = (dx, rot, c3, a) => {
      pos.push(mx + dx, my); vel.push(0, 0); form.push(1, rot);
      col.push(c3[0], c3[1], c3[2], a); z.push(0);
    };
    put(-0.002, 0, [0.21, 0.88, 1], 1);        /* civil, due north, fresh */
    put(0, 0.7, [1, 0.19, 0.25], 1);           /* military, north-east */
    put(0.002, 3.14, [1, 0.82, 0.25], 0.6);    /* selected, south, half-stale */
    E.layers.setAircraftCloud(ID, {
      buffers: {
        pos: new Float32Array(pos), vel: new Float32Array(vel),
        alt: new Float32Array(z), altv: new Float32Array(z), ms: new Float32Array(z.map(() => 1e-8)),
        col: new Float32Array(col), form: new Float32Array(form),
      },
      t0: performance.now(), visible: true, opacity: 1, sizePx: 48,
    });
    await new Promise((r) => setTimeout(r, 600));   /* the 10 Hz tick */

    const A = V._air && V._air[ID];
    if (!A) return { err: 'the cloud is not on the view' };
    const B = A.bbs, pairs = [];
    for (let k = 0; k < A.dartN; k++) {
      const rim = B.get(k * 2), core = B.get(k * 2 + 1);
      if (!rim || !core) { pairs.push({ missing: true }); continue; }
      pairs.push({
        /* ⚠ `Billboard.image` IS the id — Cesium's getter returns `_imageId`, and there is no
           public `imageId` getter at all (reading one gives undefined, which is how the first
           version of this file failed). The SETTER takes `imageId` in the constructor options,
           which is what js/cesium-engine.js passes. */
        rimId: rim.image, coreId: core.image,
        shown: !!rim.show && !!core.show,
        samePos: rim.position && core.position
          && rim.position.x === core.position.x && rim.position.y === core.position.y && rim.position.z === core.position.z,
        sameRot: rim.rotation === core.rotation, sameScale: rim.scale === core.scale,
        rim: [rim.color.red, rim.color.green, rim.color.blue, rim.color.alpha],
        core: [core.color.red, core.color.green, core.color.blue, core.color.alpha],
        pointHidden: !(A.pts.get(A.dart[k]) || {}).show,
      });
    }
    const out = { n: A.n, dartN: A.dartN, poolLen: B.length, pairs };
    E.layers.removeAircraftCloud(ID);
    return out;
  }, { ID });

  expect(got.err).toBeUndefined();
  expect(got.n, 'three aircraft were published').toBe(3);
  expect(got.dartN, 'and all three are near enough to be drawn as silhouettes').toBe(3);
  expect(got.poolLen, 'the billboard pool holds a PAIR per aircraft').toBe(6);

  for (let i = 0; i < got.pairs.length; i++) {
    const p = got.pairs[i];
    expect(p.missing, `pair ${i} exists`).toBeUndefined();
    expect(p.rimId, `pair ${i}: the even index is the outline`).toBe('intmap-aircraft-rim');
    expect(p.coreId, `pair ${i}: the odd index is the body`).toBe('intmap-aircraft-core');
    expect(p.shown, `pair ${i} is drawn`).toBe(true);
    expect(p.samePos, `pair ${i}: the rim is where the body is`).toBe(true);
    expect(p.sameRot, `pair ${i}: and points the same way`).toBe(true);
    expect(p.sameScale, `pair ${i}: and is the same size`).toBe(true);
    /* the tint: white for the rim at the stroke's own alpha, the aircraft's colour for the body */
    expect(p.rim.slice(0, 3), `pair ${i}: the rim is white`).toEqual([1, 1, 1]);
    expect(p.rim[3], `pair ${i}: at 0.95 of the body's alpha`).toBeCloseTo(p.core[3] * 0.95, 5);
    expect(p.core.slice(0, 3), `pair ${i}: the body is NOT white`).not.toEqual([1, 1, 1]);
    /* one aircraft, one glyph — the dot underneath is hidden rather than left to stick out */
    expect(p.pointHidden, `pair ${i}: its point is hidden`).toBe(true);
  }
  /* and the three bodies are three different colours, so nothing is painting them all alike */
  const keys = new Set(got.pairs.map((p) => p.core.slice(0, 3).join(',')));
  expect(keys.size, 'three aircraft, three body colours').toBe(3);
});
