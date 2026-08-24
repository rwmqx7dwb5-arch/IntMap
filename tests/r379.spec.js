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
      /* ⚠ (#R401) …and the LIVE cloud hidden again for THIS frame. It is hidden once above, but
         js/aviation-live.js publishes with `visible: true` on every poll, so a feed that answers
         between the two shots draws real aircraft into one of them and not the other. */
      E.layers.setAircraftCloud(LIVE, { visible: false });
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
  /* ⚠ (#R401) THE 1,200 ms SLEEP THAT USED TO BE HERE IS GONE, and it was never load-bearing:
     loadAviation() already waits for the cloud to exist, and probeMask() hides the LIVE cloud and
     publishes its own, so nothing measured below depends on the feed having answered. It was 1.2 s
     of the 2.3 s this test cost, and #R401 needed the second it bought back to pay for the test it
     added to this file (scripts/test-budget.mjs — a round that adds test time takes it out
     somewhere else). */
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

/* ============================================================================
 *  (#R401) …AND ITS ANGLE IS A SCREEN ANGLE
 * ----------------------------------------------------------------------------
 *  「地図を傾けても、航空レイヤーの飛行機アイコンが同じ向きなのを修正して。」
 *
 *  The mark's ANGLE lives in this file because the mark's PIXELS are what this file measures, and
 *  the angle is the same kind of claim as the silhouette: a gl.POINTS sprite is axis-aligned to the
 *  viewport, so nothing outside a rendered frame can say which way the nose ended up pointing.
 *
 *  ── HOW THE ANGLE IS TAKEN, AND WHY IT IS TAKEN THIS WAY ────────────────────────────────────
 *  Each of these is a defect that was measured on the way here, not a precaution.
 *
 *  ⚠ 1. THE COVERAGE IS RECOVERED, NOT THRESHOLDED. The silhouette is anti-aliased, so its edge
 *  pixels are the mark BLENDED WITH WHATEVER IS UNDER THEM — and at Tokyo z5 that is bright land on
 *  one side of the aircraft and dark sea on the other. A "magenta enough" test keeps the edge on one
 *  side and drops it on the other: measured, a due-east probe read 45° with the tiles still loading
 *  and 55.6° once they had arrived, reproducibly both ways. So the mark is drawn TWICE at the same
 *  place and the same angle, in two colours, and the frames are subtracted. Compositing is
 *  `a·colour + (1−a)·background`, so
 *          on(1,0,1) − on(0,1,0) = a · (1,−1,1)
 *  and the background cancels EXACTLY, whatever it is. Each channel independently recovers the same
 *  coverage a, which is also the check: three numbers that should agree, and do not when something
 *  else changed between the two frames.
 *
 *  ⚠ 2. THE PROBE FLIES AT 12,000 m, AND AT ZERO IT WAS BEING CUT IN HALF. js/aircraft-points.js
 *  draws depth-TESTED (the rule it states: the far side of the globe must occlude an aircraft), and
 *  a tilted basemap writes a different depth under every part of a sprite. An aircraft reported at
 *  altitude 0 therefore loses whichever half of its silhouette overlies ground nearer than itself —
 *  measured at pitch 60, one wing gone, the mask 7 % smaller and its long axis 11° out. Lifting the
 *  probe is what makes the pitched rows measure a whole aeroplane.
 *
 *  ⚠ 3. …WHICH MEANS THE SPRITE IS NO LONGER OVER ITS GROUND POSITION, so where it is on screen is
 *  taken from the MARK: the same aircraft drawn at T and at T+180 gives two centroids either side of
 *  the sprite's centre. Their DIFFERENCE is the heading — the plan-form's area sits behind the nose,
 *  so T's centroid is the tail end — and any constant offset (half a pixel of point rasterisation,
 *  an odd canvas width) is in both and cancels.
 *
 *  ⚠ 4. AND THE TWO HALVES ARE CHECKED AGAINST EACH OTHER. T and T+180 are the same silhouette
 *  turned round, so their masks have the same area and the same long axis; when they do not,
 *  something was drawn over one of them and the difference of their centroids is a number about
 *  that, not about the heading. That is what turns a spoiled run into a failure with a reason
 *  instead of a wrong angle.
 *
 *  The ground truth is the map's OWN projection — a rhumb step along the track put through
 *  `map.project`. A second derivation of the perspective divide would only be a second thing to be
 *  wrong. (Measured: the projected direction of a mercator step is the same to twelve decimal places
 *  for any step from half a pixel to 128, at every pitch, because a homography maps lines to lines.)
 * ==========================================================================*/
/* the sprite this test measures: 64 (the layer's own ceiling) × 2 = 128 device pixels. At the 60 px
   the test above uses, the coloured part of the fuselage is 2.4 px wide and the tailplane's is
   thinner still — thin enough that anti-aliasing alone decides whether a whole limb of the
   silhouette clears the coverage floor. */
const R401_SIZE = 64, R401_BIG = 2;
/* metres above the ellipsoid — see ⚠ 2 */
const R401_ALT_M = 12000;

const ANGLES = [
  /* track, pitch, bearing — the four rows of #R401's measurement table */
  { trk: 90, pitch: 0, bearing: 0 },
  { trk: 45, pitch: 0, bearing: 0 },
  { trk: 45, pitch: 60, bearing: 0 },   /* the report: tilting must move the mark */
  { trk: 45, pitch: 0, bearing: 45 },   /* …and so must turning */
];

async function headingTable(page, rows, size, big, altM) {
  return page.evaluate(({ PROBE, LIVE, rows, size, big, altM }) => new Promise((res) => {
    const m = window.__imap, E = window.IntMapGeoEngine, cv = m.getCanvas();
    const cont = m.getContainer(), D2R = Math.PI / 180;
    const MERC_CIRC = 2 * Math.PI * 6378137;
    if (!E.layers.hasAircraftCloud(PROBE) && !E.layers.addAircraftCloud(PROBE)) { res({ err: 'no cloud' }); return; }
    /* ⚠ THE LIVE LAYER IS STOPPED, NOT JUST HIDDEN. js/aviation-live.js publishes with
       `visible: true` on every poll, so a feed answering between the two grabs puts real aircraft
       back over the probe — and hiding it before each grab does not help, because the poll's own
       callback lands in the gap between that call and the frame. */
    const AV = window.IntMapAviation;

    const dpr = cv.width / Math.max(1, cont.clientWidth);
    const side = Math.min(cv.width, cv.height, Math.round(size * big * dpr * 2.6)) | 0;
    const x0 = (cv.width - side) >> 1, y0 = (cv.height - side) >> 1;
    const grab = () => {
      const c = document.createElement('canvas'); c.width = side; c.height = side;
      const g = c.getContext('2d');
      g.drawImage(cv, x0, y0, side, side, 0, 0, side, side);
      return g.getImageData(0, 0, side, side).data;
    };
    const frame = () => new Promise((done) => {
      /* belt and braces: hidden again for THIS frame, in case anything re-showed it */
      E.layers.setAircraftCloud(LIVE, { visible: false });
      m.once('render', () => done(grab()));
      m.triggerRepaint();
    });
    const publish = (mx, my, ms, trk, col) => E.layers.setAircraftCloud(PROBE, {
      buffers: {
        pos: new Float32Array([mx, my]), vel: new Float32Array([0, 0]),
        alt: new Float32Array([altM]), altv: new Float32Array([0]),
        ms: new Float32Array([ms]), col: new Float32Array(col),
        form: new Float32Array([big, trk]),
      },
      t0: performance.now(), visible: true, opacity: 1, sizePx: size,
    });

    /* the mark's coverage field: its mass, its centroid and its long axis, in crop pixels */
    const MARK_A = [1, 0, 1, 1], MARK_B = [0, 1, 0, 1];
    async function shape(mx, my, ms, trk) {
      publish(mx, my, ms, trk, MARK_A);
      const A = await frame();
      publish(mx, my, ms, trk, MARK_B);
      const B = await frame();
      E.layers.setAircraftCloud(PROBE, { visible: false });
      const keep = new Float32Array(side * side);
      let sx = 0, sy = 0, w = 0, n = 0;
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          const i = (y * side + x) * 4;
          const aR = A[i] - B[i], aG = B[i + 1] - A[i + 1], aB = A[i + 2] - B[i + 2];
          if (aR < 20) continue;                                           /* no mark here */
          if (Math.abs(aR - aG) > 40 || Math.abs(aR - aB) > 40) continue;  /* not the mark */
          keep[y * side + x] = aR;
          sx += x * aR; sy += y * aR; w += aR; n++;
        }
      }
      if (!w) return null;
      const cx = sx / w, cy = sy / w;
      let mxx = 0, myy = 0, mxy = 0;
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          const v = keep[y * side + x];
          if (!v) continue;
          const dx = x - cx, dy = y - cy;
          mxx += v * dx * dx; myy += v * dy * dy; mxy += v * dx * dy;
        }
      }
      /* ⚠ THE LONG AXIS OF THIS MARK IS ITS WINGSPAN, NOT ITS FUSELAGE, and the difference is
         ninety degrees. The plan-form is 37 artwork units long and 34 wide, so the two moments are
         close — but the mass is in the WINGS while the fuselage is 4.4 units of thin line, and the
         wings win. It is used only to check the two halves against each other, so which of the two
         it is does not matter; that it is the SAME one both times does. */
      return { cx, cy, n, axis: 0.5 * Math.atan2(2 * mxy / w, (mxx - myy) / w) / D2R };
    }

    (async () => {
      const out = [];
      try {
        /* ⚠ WAIT FOR THE LIVE LAYER TO BE RUNNING BEFORE STOPPING IT. loadAviation() switches the
           row on and returns as soon as the CLOUD exists, which is earlier than the controller
           finishing start() — so a stop() issued here can land before there is anything to stop, and
           the poll that arrives a moment later publishes with `visible: true` and puts real aircraft
           over the probe for the rest of the measurement. Measured: that is the difference between
           the four rows agreeing with the projection exactly and agreeing to within nine degrees. */
        for (let i = 0; i < 100 && !(AV && AV.isOn && AV.isOn()); i++) {
          await new Promise((r) => setTimeout(r, 50));
        }
        const wasOn = !!(AV && AV.isOn && AV.isOn());
        if (wasOn) AV.stop();
        E.layers.setAircraftCloud(LIVE, { visible: false });
        for (const r of rows) {
          m.jumpTo({ pitch: r.pitch, bearing: r.bearing });
          /* the aircraft goes where the CANVAS CENTRE is (#R203's trap: camera padding) */
          const ll = m.unproject([cont.clientWidth / 2, cont.clientHeight / 2]);
          const mx = (180 + ll.lng) / 360;
          const pl = Math.max(-89.9999, Math.min(89.9999, ll.lat)) * D2R;
          const my = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + pl / 2))) / 360;
          const ms = 1 / Math.max(1, MERC_CIRC * Math.cos(ll.lat * D2R));
          const inv = (y) => (Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) * 2 - Math.PI / 2) / D2R;

          /* ground truth: one rhumb step along the track, through the map's own projection */
          const trk = r.trk * D2R, step = 2e-4;
          const a = m.project({ lng: mx * 360 - 180, lat: inv(my) });
          const b = m.project({ lng: (mx + Math.sin(trk) * step) * 360 - 180, lat: inv(my - Math.cos(trk) * step) });
          const truth = Math.atan2(b.x - a.x, -(b.y - a.y)) / D2R;

          /* ⚠ TAKEN AGAIN WHEN THE TWO HALVES DISAGREE. On a machine still fetching tiles the two
             frames of a pair can straddle one landing, and those pixels are thrown out as
             disagreement — which erodes one mask and not the other. Retrying is what a measurement
             does when its own consistency check fails; it costs nothing when the map is quiet, and
             it is bounded so a basemap that never settles still fails rather than spins. */
          let s1 = null, s2 = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            s1 = await shape(mx, my, ms, trk);
            s2 = await shape(mx, my, ms, trk + Math.PI);
            if (!s1 || !s2) break;
            const dn = Math.abs(s1.n - s2.n) / (s1.n + s2.n);
            const sk = Math.abs(((s1.axis - s2.axis + 270) % 180) - 90);
            if (dn < 0.06 && sk < 20) break;
          }
          if (!s1 || !s2) { out.push({ trk: r.trk, pitch: r.pitch, bearing: r.bearing, err: 'nothing drawn' }); continue; }
          const nx = s2.cx - s1.cx, ny = s2.cy - s1.cy;
          out.push({
            trk: r.trk, pitch: r.pitch, bearing: r.bearing,
            measured: Math.atan2(nx, -ny) / D2R, truth, arm: Math.hypot(nx, ny),
            px: s1.n, px2: s2.n,
            /* the nose direction as two SIGNS — which side of the mark's own centre the tail sits.
               A sign survives every bias the angle above carries, and it is what says the mark is
               not mirrored. */
            east: nx > 0, north: ny < 0,
            /* how far the same silhouette turned round disagrees with itself about its own axis */
            skew: Math.abs(((s1.axis - s2.axis + 270) % 180) - 90),
          });
        }
        E.layers.setAircraftCloud(LIVE, { visible: true });
        /* put the camera back HERE rather than through another page.evaluate: an in-page jumpTo is
           a tenth of a second, and MEASURED, the round trip that wrapped one cost three (#R401). */
        m.jumpTo({ pitch: 0, bearing: 0 });
        if (wasOn) await AV.start({});
        res({ rows: out, dpr, side });
      } catch (e) { res({ err: String((e && e.message) || e) }); }
    })();
  }), { PROBE, LIVE, rows, size, big, altM });
}

/** the smaller of the two ways round, in degrees */
const angleGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

test('R401 the mark points along the aircraft\'s SCREEN track — tilt, bearing and all', async ({ app }) => {
  const page = app.page;
  await loadAviation(page);
  /* ⚠ NO CAMERA MOVE OF ITS OWN. app.reset() has already put the named view up, and MEASURED, a
     `page.evaluate(jumpTo({zoom: 6}))` on top of it costs 5.4 s — a zoom change runs every layer's
     zoom handler synchronously, which would be most of what this test cost. The probe does not care
     what the zoom is; the pitch and bearing it does care about are set inside headingTable. */
  const t = await headingTable(page, ANGLES, R401_SIZE, R401_BIG, R401_ALT_M);

  expect(t.err, 'the probe cloud could be published and read').toBeUndefined();
  expect(t.rows.length).toBe(ANGLES.length);
  for (const r of t.rows) {
    const at = `track ${r.trk} at pitch ${r.pitch}, bearing ${r.bearing}`;
    expect(r.err, `${at}: the probe drew something`).toBeUndefined();
    /* everything the measurement knows about itself, carried in every message below, so a failure
       says whether the ANGLE was wrong or the MASK it came from was */
    const how = `mask ${r.px}/${r.px2} px, axes ${r.skew.toFixed(1)}° apart, arm ${r.arm.toFixed(1)} px`;
    /* ⚠ FIFTEEN DEGREES, AND THE NUMBER IS THE MEASUREMENT'S, NOT THE RENDERER'S. The mark's two
       opposite renders are not pixel-identical — anti-aliasing puts a limb of the silhouette either
       side of the coverage floor differently at different angles — so the difference of their
       centroids carries a bias, measured at up to 9.3° across these four rows. That is far inside
       what this test is for: a mark that ignores pitch is 18.4° out on the third row, one that
       ignores bearing is 45° out on the fourth, and a mirrored one is 90° or 180° out on every row.
       The two SIGNS below are exact, and they are what pins the mirror. */
    expect(angleGap(r.measured, r.truth),
      `${at}: drawn at ${r.measured.toFixed(1)}°, the projection says ${r.truth.toFixed(1)}° (${how})`).toBeLessThan(15);
    /* ⚠ THE MASK HAS TO BE THE MARK. The plan-form fills 16.5 % of its box (319.8 artwork units² of
       44²) and the white stroke covers the outer part of that, so the coloured region is about a
       tenth of the box. A mask far outside that band is measuring something else, and an angle taken
       from it is a number with no subject. */
    const frac = r.px / ((R401_SIZE * R401_BIG * t.dpr) ** 2);
    expect(frac, `${at}: the coloured mask is the plan-form's own area (${how})`).toBeGreaterThan(0.04);
    expect(frac, `${at}: the coloured mask is not the whole crop (${how})`).toBeLessThan(0.25);
    /* …and the two halves of the measurement have to be the same mark — see ⚠ 4 above */
    expect(Math.abs(r.px - r.px2) / (r.px + r.px2),
      `${at}: the two masks are the same area (${how})`).toBeLessThan(0.06);
    expect(r.skew, `${at}: the two masks agree about their own axis (${how})`).toBeLessThan(20);
    /* the arm has to be long enough for the angle to mean anything — the plan-form's centroid is
       0.166 of the sprite half-box behind the nose, so T against T+180 is a third of the box */
    expect(r.arm, `${at}: the two centroids are measurably apart (${how})`).toBeGreaterThan(0.12 * R401_SIZE * R401_BIG * t.dpr);

  }

  /* ⚠ THE MIRROR, AS A SIGN RATHER THAN AN ANGLE. #R341's mat2 reflected the mark about the
     vertical axis, so an aircraft tracking 090° was drawn with its nose pointing west — and the
     honest way to say "the nose points east" is to ask which side of the mark's own centre the
     tail-heavy centroid fell on. No tolerance, no bias, no arithmetic. */
  const east90 = t.rows.find((r) => r.trk === 90 && r.pitch === 0 && r.bearing === 0);
  expect(east90.east, 'an aircraft tracking 090° is drawn with its nose to the EAST').toBe(true);
  const up45 = t.rows.find((r) => r.trk === 45 && r.bearing === 45);
  expect(up45.north, 'and with the map turned 45°, a 045° track is drawn pointing up the screen').toBe(true);

  /* ⚠ THE REPORT ITSELF, AS ITS OWN ASSERTION. Every row above could pass on a tolerance while the
     mark sat frozen, if the truth happened not to move — so this says the thing that was wrong: a
     45° track at pitch 60 is not drawn at the same angle as at pitch 0 (the projection puts them
     18° apart), and turning the map moves it too (45° apart). Measured before the fix, all three
     rows came out at the same 31.3°. */
  const flat = t.rows.find((r) => r.trk === 45 && r.pitch === 0 && r.bearing === 0);
  const tilted = t.rows.find((r) => r.trk === 45 && r.pitch === 60);
  const turned = t.rows.find((r) => r.trk === 45 && r.bearing === 45);
  /* ⚠ SIX DEGREES, NOT EIGHTEEN. The projection puts these two 18.4° apart; the measurement's own
     bias (see above) compresses that to about 9.7 on this machine. What the assertion has to
     separate is MOVED from FROZEN, and frozen is zero. */
  expect(angleGap(flat.measured, tilted.measured), 'tilting the map moves the mark').toBeGreaterThan(6);
  expect(angleGap(flat.measured, turned.measured), 'turning the map moves the mark').toBeGreaterThan(25);
});
