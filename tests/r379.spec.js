/* ============================================================================
 *  R379 — 「航空機レイヤーの飛行機アイコンのデザインをもとに戻して。」
 *
 *  ONE claim, and it is the one a source-level check cannot make: what is on the screen is the
 *  app's own airliner plan-form, drawn by a fragment shader that COMPILED.
 *
 *  ⚠ WHY THIS HAS TO BE A BROWSER TEST. js/aircraft-points.js catches a shader failure, warns once
 *  and returns — so a program that will not compile draws NOTHING, and a layer that draws nothing
 *  looks exactly like a layer nobody switched on (#R353 measured that mistake on the volcano rings).
 *  The dart's field was eight lines of half-planes; this one is an eighteen-vertex loop with a
 *  crossing test, i.e. precisely the kind of shader a driver can reject. Nothing in tests/ would
 *  have noticed.
 *
 *  ⚠ AND WHY IT DOES NOT NEED A FEED. The picture is drawn from a cloud this file publishes: one
 *  aircraft, at the centre of the canvas, tracking north, at a size chosen to be measurable. The
 *  live layer is switched on only to make js/aviation-live.js (and with it the GPU primitive) load,
 *  and its own cloud is hidden while the probe is measured. adsb.lol having a bad afternoon cannot
 *  turn this red.
 * ==========================================================================*/
import { test, expect } from './helpers/app.js';

const PROBE = 'r379-probe';
const LIVE = 'lyr-aircraft-cloud';
const SIZE = 60;          /* the sprite box in CSS px — big enough that one artwork unit is >1 px */

/* Switch the aircraft layer on the way a person does (#R37: the ROW's pointerdown, not the
   checkbox's click) and wait for the cloud, which is what proves the lazy module arrived. */
async function loadAviation(page) {
  await page.waitForFunction(() => document.querySelectorAll('.lyr-row').length > 100, null, { timeout: 60000 });
  await page.evaluate(() => {
    const cb = document.getElementById('dl-planes');
    if (cb && !cb.checked) {
      const row = cb.closest('label') || cb.closest('.lyr-row') || cb.parentElement;
      ['pointerdown', 'pointerup'].forEach((t) =>
        row.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 1 })));
    }
  });
  await page.waitForFunction(
    () => { try { return window.IntMapGeoEngine.layers.hasAircraftCloud('lyr-aircraft-cloud'); } catch (_) { return false; } },
    null, { timeout: 30000 },
  );
}

/* The mark's own pixels: the canvas read twice on consecutive render ticks — once with the probe
   hidden and once with it shown — and DIFFED. The basemap under it is whatever the suite happened
   to load, so the only honest way to ask "what did this layer draw" is to ask what it CHANGED
   (#R325 used the same on/off-in-the-same-tree comparison to stop measuring the sidebar). */
async function probeMask(page, size) {
  return page.evaluate(({ PROBE, LIVE, size }) => new Promise((res) => {
    const m = window.__imap, E = window.IntMapGeoEngine, cv = m.getCanvas();
    const cont = m.getContainer();
    const dpr = cv.width / Math.max(1, cont.clientWidth);
    const side = Math.min(cv.width, cv.height, Math.round(size * dpr * 1.6)) | 0;
    const x0 = (cv.width - side) >> 1, y0 = (cv.height - side) >> 1;

    /* the aircraft goes where the CANVAS CENTRE is, not where getCenter() says: a desktop sidebar
       sets camera padding, so those are tens of degrees apart (#R203 was bitten by exactly this) */
    const ll = m.unproject([cont.clientWidth / 2, cont.clientHeight / 2]);
    const D2R = Math.PI / 180;
    const mx = (180 + ll.lng) / 360;
    const p = Math.max(-89.9999, Math.min(89.9999, ll.lat)) * D2R;
    const my = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + p / 2))) / 360;

    if (!E.layers.hasAircraftCloud(PROBE) && !E.layers.addAircraftCloud(PROBE)) { res({ err: 'no cloud' }); return; }
    E.layers.setAircraftCloud(LIVE, { visible: false });
    E.layers.setAircraftCloud(PROBE, {
      buffers: {
        pos: new Float32Array([mx, my]), vel: new Float32Array([0, 0]),
        alt: new Float32Array([0]), altv: new Float32Array([0]),
        ms: new Float32Array([1e-8]),
        col: new Float32Array([1, 0, 1, 1]),      /* magenta: nothing on a basemap is this colour */
        form: new Float32Array([1, 0]),           /* ordinary size, tracking due north */
      },
      t0: performance.now(), visible: false, opacity: 1, sizePx: size,
    });

    const grab = () => {
      const c = document.createElement('canvas'); c.width = side; c.height = side;
      const g = c.getContext('2d');
      g.drawImage(cv, x0, y0, side, side, 0, 0, side, side);
      return g.getImageData(0, 0, side, side).data;
    };
    const shot = (visible) => new Promise((done) => {
      E.layers.setAircraftCloud(PROBE, { visible });
      m.once('render', () => done(grab()));
      m.triggerRepaint();
    });

    (async () => {
      try {
        const off = await shot(false);
        const on = await shot(true);
        E.layers.setAircraftCloud(PROBE, { visible: false });
        E.layers.setAircraftCloud(LIVE, { visible: true });

        /* rows of the mark: where the two frames differ, and how white / how magenta that is */
        const rows = [];
        let white = 0, body = 0, changed = 0;
        for (let y = 0; y < side; y++) {
          let lo = -1, hi = -1;
          for (let x = 0; x < side; x++) {
            const i = (y * side + x) * 4;
            const d = Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]);
            if (d <= 24) continue;
            if (lo < 0) lo = x; hi = x; changed++;
            const r = on[i], g2 = on[i + 1], b = on[i + 2];
            if (r > 190 && g2 > 190 && b > 190) white++;
            else if (r > 140 && b > 140 && g2 < 110) body++;
          }
          rows.push(lo < 0 ? 0 : (hi - lo + 1));
        }
        res({ side, dpr, rows, white, body, changed });
      } catch (e) { res({ err: String((e && e.message) || e) }); }
    })();
  }), { PROBE, LIVE, size });
}

test('R379 ① the aircraft mark is the airliner plan-form again, and its shader compiled', async ({ app }) => {
  const page = app.page;
  const warned = [];
  const onMsg = (msg) => { if (/aircraftPoints/.test(msg.text())) warned.push(msg.text()); };
  page.on('console', onMsg);

  await loadAviation(page);
  await page.waitForTimeout(1200);

  const s = await probeMask(page, SIZE);
  page.off('console', onMsg);

  expect(s.err, 'the probe cloud could be published and read').toBeUndefined();
  /* ⚠ THE SILENT FAILURE THIS FILE EXISTS FOR: a shader that does not compile is logged once and
     then the layer draws nothing at all. */
  expect(warned, `js/aircraft-points.js reported a shader problem: ${warned.join(' | ')}`).toEqual([]);
  expect(s.changed, 'the probe drew something').toBeGreaterThan(200);

  /* ⚠ MEASURED FROM THE WIDEST ROW, NOT FROM THE NOSE. The first version anchored its fractions on
     the topmost changed row, and the nose is a one-pixel point whose anti-aliased coverage does not
     clear the diff threshold — so `top` began several rows down the fuselage, every fraction landed
     lower than intended, and the "fuselage" row it sampled was already wing root (measured: 32 px
     where the fuselage is 9.5). The widest row and the last row need no such detection. */
  const top = s.rows.findIndex((w) => w > 0);
  let bottom = -1; for (let i = s.rows.length - 1; i >= 0; i--) { if (s.rows[i] > 0) { bottom = i; break; } }
  const H = bottom - top;
  expect(H, 'the mark has a measurable height').toBeGreaterThan(20);
  const wing = Math.max(...s.rows.slice(top, bottom + 1));
  const wingRow = s.rows.indexOf(wing);
  const belowWing = bottom - wingRow;
  const tail = Math.max(...s.rows.slice(bottom - Math.max(2, Math.round(H * 0.08)), bottom + 1));
  const waist = Math.min(...s.rows.slice(wingRow + 2, bottom - Math.max(3, Math.round(H * 0.10))));

  /* ⚠ THESE ARE THE ASSERTIONS THAT SEPARATE THE TWO DESIGNS, and they are written so #R341's dart
     FAILS them. A triangle widens monotonically to its trailing edge: its widest row IS its last,
     there is nothing below it, and nothing narrows and then widens again. The plan-form has 34
     units of wing at ~70 % of its length, a bare 4.4-unit fuselage behind it, and then a 12-unit
     tailplane — narrow, wide, narrow, wide. */
  expect(wing / (SIZE * s.dpr), `the wings span the sprite (wing ${wing}px of a ${Math.round(SIZE * s.dpr)}px box)`).toBeGreaterThan(0.6);
  expect(belowWing / H, `the wing is not the trailing edge (${belowWing} of ${H} rows are behind it)`).toBeGreaterThan(0.15);
  expect(waist, `behind the wing there is only fuselage (waist ${waist}px against a ${wing}px wing)`).toBeLessThan(wing / 3);
  expect(tail / waist, `and then the tailplane widens again (tail ${tail}px)`).toBeGreaterThan(1.5);

  /* the other half of the mark: a white stroke around a coloured body — #R191's 「元に戻せと
     言っているのに、色を勝手に変えるな」 is about exactly this pair being drawn together */
  expect(s.body, 'the body is drawn in the aircraft\'s own colour').toBeGreaterThan(100);
  expect(s.white, 'and it is outlined in white').toBeGreaterThan(60);
});
