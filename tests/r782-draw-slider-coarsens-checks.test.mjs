/* IntMap · #R782 — the Draw slider is a RESOLUTION control, and nothing smooths the stroke
 *
 * 「Draw機能がくそ。勝手に滑らかにされる。そんな挙動は求めてない。」
 * 「本来はスライダーで荒くするってやつなのに、滑らかなまま。」「最大の解像度は高めて」「いや消せよ」
 *
 * #R719 put a centripetal Catmull–Rom spline between the points Douglas–Peucker kept and the line on
 * the map, on every recompute. It was a faithful reading of the label 平滑化 and it took the control
 * away: decimation still dropped the points, the spline put a curve back through the survivors, and
 * the same smooth line came out at 0 and at 100. This round withdrew the spline.
 *
 * ⚠ WHAT REPLACES A WITHDRAWN MECHANISM'S CHECK IS NOT THAT MECHANISM'S ABSENCE. «js/map-tools.js
 * does not contain the string smoothPath» would pass on a build that re-smoothed the line somewhere
 * else, and would fail the day the file grows an unrelated helper by that name. What can go wrong is
 * a SECOND STAGE between the kept points and the map — of any construction — so that is what is
 * measured, on the running function: the stroked line must BE the polyline the slider left, vertex
 * for vertex, at every setting of the slider.
 *
 * ⚠ THE SHIPPED MODULE IS EVALUATED, NOT READ (#R505). The only things stubbed are what the module
 * imports (a timer wheel and the Nominatim gate) and the renderer contract — none of which the
 * geometry under test touches.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function drawTool() {
  const noop = () => {};
  const el = () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop,
                      querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, setAttribute: noop, remove: noop });
  const sb = { console, Math, JSON, Date, Number, String, Object, Array, isFinite, parseInt, parseFloat, setTimeout, clearTimeout, RegExp };
  sb.window = sb; sb.globalThis = sb;
  sb.document = { getElementById: () => null, createElement: el, body: el(), head: el(),
                  addEventListener: noop, readyState: 'complete', querySelector: () => null, querySelectorAll: () => [] };
  sb.turf = { distance: () => 1, point: (p) => p };
  sb.IntMapModules = {};
  sb.IntMapGeoEngine = { hasRenderer: () => true,
    layers: { hasSource: () => true, addSource: noop, has: () => true, add: noop, setSourceData: noop, setLayout: noop },
    render: { canvas: () => ({ style: {} }) }, input: { set: noop }, camera: { getZoom: () => 5 }, events: { on: noop, once: noop } };
  sb.IntMapLang = { t: () => 'x' };
  sb.everyTick = () => noop; sb.NominatimGate = {};
  vm.createContext(sb);
  vm.runInContext(read('js/map-tools.js').replace(/^import[^\n]*\n/gm, ''), sb, { filename: 'map-tools.js' });
  sb.IntMapModules.drawTool({ ringArea: () => 0, t: () => '', distHTML: String, areaHTML: String,
                              makeDraggable: noop, imToast: noop, exitTool: noop, lang: 'en', isMobile: () => false });
  return sb.DrawTool;
}

/* ⚠ A CORNER IS THE SHARPEST TURN, NOT THE AVERAGE ONE. A mean turn per vertex is a function of how
   densely a path is sampled — a 360-point circle averages 1° a vertex and a 5-point one 72° — so
   comparing two paths of different densities by their mean measures the sampling, not the shape.
   What «coarse» looks like to the reader is a corner, so the largest single turn is what is read. */
const maxTurn = (a) => {
  let worst = 0;
  for (let i = 1; i < a.length - 1; i++) {
    const v1 = [a[i][0] - a[i - 1][0], a[i][1] - a[i - 1][1]], v2 = [a[i + 1][0] - a[i][0], a[i + 1][1] - a[i][1]];
    const n1 = Math.hypot(v1[0], v1[1]), n2 = Math.hypot(v2[0], v2[1]);
    if (!n1 || !n2) continue;
    worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))));
  }
  return worst;
};

/* the stroke the tool is actually used on: a hand-drawn wobbly loop, which is the input a spline
   flatters and a decimator visibly coarsens. */
const wobblyLoop = (n = 360) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2 * Math.PI / n, r = 1 + 0.04 * Math.sin(a * 9);
    out.push([139 + r * Math.cos(a), 35 + r * Math.sin(a)]);
  }
  return out;
};

test('#R782 ① the line that is stroked IS the polyline the slider left — no stage in between', () => {
  const D = drawTool();
  assert.ok(D && D._debug && typeof D._debug.simulate === 'function', 'the shipped module evaluated and armed');
  const raw = wobblyLoop();

  for (const res of [0, 10, 25, 50, 75, 100]) {
    const r = D._debug.simulate(raw, res);
    assert.equal(r.curveN, r.simplN,
      `at resolution ${res} the stroked line carries ${r.curveN} vertices against the ${r.simplN} the slider kept — ` +
      'something is adding vertices after the decimation, which is the whole of what the reader reported');
    assert.deepEqual(r.line, r.kept,
      `at resolution ${res} the stroked line is not the polyline the slider left — a second stage has moved the line ` +
      'off the points, whatever it is called');
  }
});

test('#R782 ② at the finest setting the line is the trace, unaltered', () => {
  const D = drawTool();
  const raw = wobblyLoop();
  /* the slider at 0 is «drop nothing», so what the reader drew is what the reader gets. This is the
     complaint in its plainest form: 「そんな挙動は求めてない」. */
  const r = D._debug.simulate(raw, 0);
  assert.deepEqual(r.line, raw, 'at resolution 0 the drawn line must be the captured stroke itself');
  assert.equal(r.rawN, r.curveN, 'every captured point reaches the map and no other point does');
});

test('#R782 ③ the slider actually coarsens — fewer vertices and sharper corners as it rises', () => {
  const D = drawTool();
  const raw = wobblyLoop();
  const steps = [0, 25, 50, 75, 100].map((res) => ({ res, r: D._debug.simulate(raw, res) }));

  /* ⚠ MONOTONE, NOT STRICTLY SO. Douglas–Peucker bottoms out: past a tolerance wider than the
     drawing itself there is nothing left to drop but the two endpoints and whichever points are
     furthest off the chord, so the top of the range legitimately plateaus. Requiring a strict drop
     at every step would be a check on that plateau's position, not on the slider. */
  for (let i = 1; i < steps.length; i++)
    assert.ok(steps[i].r.curveN <= steps[i - 1].r.curveN,
      `resolution ${steps[i].res} draws ${steps[i].r.curveN} vertices against ${steps[i - 1].r.curveN} at ` +
      `${steps[i - 1].res} — raising the slider must never ADD detail`);
  assert.ok(steps[steps.length - 1].r.curveN * 10 < steps[0].r.curveN,
    `across its whole range the slider goes from ${steps[0].r.curveN} vertices to ${steps[steps.length - 1].r.curveN} — ` +
    'a range that barely thins the line is a control the reader cannot feel');

  /* ⚠ FEWER VERTICES IS NOT YET «COARSE» TO A READER. A spline can take five points and draw a line
     smoother than the 360 it came from — that was the shipped behaviour. Coarse is what the eye
     reads: corners. So the sharpest turn must GROW as detail is dropped. */
  const fine = maxTurn(steps[0].r.line), coarse = maxTurn(steps[steps.length - 1].r.line);
  assert.ok(coarse > fine * 3,
    `the sharpest corner is ${coarse.toFixed(3)} rad at maximum against ${fine.toFixed(3)} rad at minimum — ` +
    'a coarser line has to LOOK coarser, and this is the measurement the shipped spline made impossible');
  assert.ok(coarse > 0.5,
    `at maximum the line's sharpest turn is only ${(coarse * 180 / Math.PI).toFixed(1)}° — that still reads as a curve`);
});

test('#R782 ④ the area readout stays what it was, at every setting of the slider', () => {
  const D = drawTool();
  const raw = wobblyLoop();
  /* #R8c's contract: the area is measured on the 5-px trace, so the slider moves the LINE and never
     the number. Unchanged by this round, and easy to break while changing what the slider feeds. */
  assert.equal(D._debug.simulate(raw, 0).area, D._debug.simulate(raw, 100).area,
    'the area is invariant under the slider');
});

test('#R782 ⑤ the stroke is captured finer than #R719 left it, and the panel says which way the slider goes', () => {
  const s = read('js/map-tools.js');
  const minPx = parseFloat(/const MIN_PX=([\d.]+);/.exec(s)[1]);
  const areaPx = parseFloat(/const AREA_PX=([\d.]+);/.exec(s)[1]);
  /* 「最大の解像度は高めて」 — and capture is the only place resolution can be raised: nothing
     downstream recovers a bend the pointer passed through and the tool never sampled. */
  assert.ok(minPx < 1.5, `the line is sampled at ${minPx} px — #R719 already captured at 1.5, so this is not an increase`);
  assert.ok(minPx < areaPx, 'the LINE is still captured finer than the AREA trace — the O(n²) area pass does not bound what the reader draws');
  assert.ok(minPx >= 0.25,
    `sampling at ${minPx} CSS px is below a device pixel on every display this runs on — past that the extra ` +
    'vertices are pointer jitter, and a constant here cannot raise the pointer’s own event rate');

  /* the label is part of the defect: a control called 平滑化 is what made #R719 implement smoothing. */
  assert.ok(!/Resolution \(smoothing\)|解像度（平滑化）/.test(s),
    'the slider must not be labelled 平滑化 / smoothing — it decimates, and the last label is what got a spline built');
  assert.match(s, /解像度（右ほど粗く）/, 'and it says which direction it goes');
});
