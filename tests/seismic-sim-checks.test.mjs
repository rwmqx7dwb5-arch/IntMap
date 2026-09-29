/* ============================================================================
 *  IntMap · the seismic simulator (js/seismic.js, js/fault-geometry.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r176-checks ⑤, tests/r224-checks ② ③, tests/r248-checks ② and
 *  tests/r246-checks ④.
 *
 *  #R176 ⑤ arrivals are ray-traced through a published Earth model and the ground motion names its chain.
 *  #R224 ② the MMI ramp is USGS's, and it is continuous · ③ a drawn outline is a fault's SHADOW.
 *  #R248 ② the far seismic raster covers the FIELD, not the planet, and the fine image's box is snapped
 *          onto THAT grid — the property that makes the two rasters tile (#R245).
 *  #R246 ④ 「地震シミュレータで、計算進捗は「震度分布を計算」の下ではなく上に。」
 *
 *  ⚠ Where a match is on text, the source is read with COMMENTS STRIPPED (scripts/code-only.mjs).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { lazyFiles } from './app-source.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = codeOnly;
/* (#R209) a feature file is REACHED if the Vite entry imports it or js/lazy-modules.js import()s it —
   the lazy list is DERIVED from that loader's own literal specifiers (tests/app-source.mjs). */
const entry = read('src/main.js');
const LAZY = lazyFiles(root);
const reached = (rel) => entry.includes(`import '../${rel}';`) || LAZY.includes(rel);
/* (#R178/#R322) the application body spans app-body, the engine and the camera maths */
const body = [read('js/app-body.js'), read('js/geo-engine.js'), read('js/camera-math.js')].join('\n');
const instantiated = () => body + '\n' + read('js/lazy-modules.js');
const quake = read('js/seismic.js');

/* ── ⑤ the seismic simulator ────────────────────────────────────────────────────────────────────
   Validated against the real 2011 Tohoku event (M9.1, 29 km, 372 km to Tokyo): P at 52 s, S at 1m32s,
   about three minutes of shaking — and against published IASP91 P times at 30°/60°/90°. */
test('R176 ⑤: arrivals are ray-traced through IASP91 and the ground motion names its chain', () => {
  /* ⚠ READ, NOT RUN: the tracer and the ground-motion chain are closures of the seismic panel factory, which builds DOM and a renderer source on construction. */
  assert.ok(existsSync(join(ROOT, 'js/seismic.js')), 'the simulator has its own file');
  assert.ok(reached('js/seismic.js'), 'loaded by the Vite entry, or fetched on demand by js/lazy-modules.js');
  assert.match(instantiated(), /window\.IntMapModules\.seismic\((IM_HOST)\);/, 'and instantiated');
  assert.match(quake, /const IASP91=\[/, 'the velocity model is the data in the file');
  assert.match(quake, /\{ d0:2889, d1:5153\.9,p:\[10\.03904,3\.75665,-13\.67046\], *s:\[0\] \}/, 'including an outer core with no S');
  assert.match(quake, /function trace\(p,srcDepth,phase,dir\)\{/, 'and the travel times are TRACED, not tabulated');
  assert.match(quake, /const DR=1;/, 'through 1 km homogeneous shells (no singular turning-point integral)');
  /* the ground-motion chain, each step attributable */
  assert.match(quake, /Math\.pow\(10,1\.5\*mw\+9\.1\)/, 'Hanks & Kanamori for the moment');
  /* (#R232) the Brune corner is now `fc0`, the OMNIDIRECTIONAL corner, because rupture directivity
     shifts the apparent one: fc(θ) = fc0/Fd. The relation being pinned is the formula. */
  assert.match(quake, /const fc0?=0\.49\*BETA\*Math\.pow\(dSigma\/M0,1\/3\);/, 'Brune for the corner frequency');
  assert.match(quake, /function rvt\(spec,Td\)\{/, 'random-vibration theory for the peak values');
  assert.match(quake, /function spread\(rKm\)\{/, 'trilinear geometrical spreading');
  assert.match(quake, /function siteAmp\(\)\{/, 'and quarter-wavelength site amplification');
  /* honesty: MMI is not shindo, and it is not offered outside the model's range */
  /* (#R191) the intensity conversion moves from Wald et al. 1999 (one line fitted over MMI V-IX) to
     Worden et al. 2012 — the GMICE ShakeMap itself uses, verified against the PGV values USGS prints
     for the class boundaries. What this assertion is really about is unchanged: the panel converts
     PGV with a NAMED published relation and says it is not the JMA scale. */
  assert.match(quake, /\(lg<=0\.53\)\?\(3\.78\+1\.47\*lg\):\(2\.89\+3\.16\*lg\)/, 'Worden et al. 2012 for the intensity');
  assert.match(quake, /const MMI_CALIB_KM=1000;/, 'with a stated range');
  /* …and the "not felt" floor is the scales' own lowest classes now, not a PGV constant that belonged
     to Wald's validity range — 0.5 cm/s is MMI 1.3 under Wald and MMI 3.3 under Worden. */
  assert.match(quake, /calibrated:\(inRange&&pgv>=PGV_FELT&&mmi<=9\.5\)/, 'and a flag for "outside what the relation supports"');
  /* (#R192) the two scales stopped being one quantity: 震度 is the JMA level a₀ and MMI is the
     felt-band PGV, so the "not felt" floor for MMI is its own class floor. */
  assert.match(quake, /const PGV_FELT=PGV_FLOOR_MMI;/, 'the MMI floor is the MMI class floor');
  assert.match(quake, /const A0_FLOOR_JMA=a0AtJMA\(JMA_CLASSES\[0\]\.min\);/, 'and 震度1 has its own, in a₀');
  assert.ok(/NOT the JMA shindo scale/.test(quake) && /気象庁震度階級ではありません/.test(quake), 'and it says so in the panel');
});

/* ══════════════════ #R224 ② ③ ══════════════════ */
/* ── ② THE MMI RAMP IS USGS'S, AND IT IS CONTINUOUS ───────────────────────────────────────────────
   Read out of USGS.能登.pdf (the ShakeMap for the 2024-01-01 M7.5 Noto event, us6000m0xl v10): the
   legend bar is 81 filled strips and these nine colours appear in it, in order, under the columns
   the SHAKING row labels. IntMap paired every class with the ramp colour one step BELOW it. */
test('R224 ② MMI is painted with the ShakeMap ramp, continuously', async () => {
  const s = read('js/seismic.js');
  const want = [[1, 255, 255, 255], [2, 191, 204, 255], [3, 160, 230, 255], [4, 128, 255, 255],
    [5, 122, 255, 147], [6, 255, 255, 0], [7, 255, 200, 0], [8, 255, 145, 0],
    [9, 255, 0, 0], [10, 200, 0, 0]];
  const m = /const MMI_RAMP=\[([\s\S]*?)\];/.exec(s);
  assert.ok(m, 'the ramp is declared once');
  const got = [...m[1].matchAll(/\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\]/g)].map((x) => x.slice(1).map(Number));
  assert.deepEqual(got, want, 'the anchors are the ones measured out of the PDF');
  /* the fill is the ramp, per cell, in BOTH painters — and 震度 keeps its published bands.
     ⚠ (#R247) BOTH PAINTERS NOW CALL ONE FUNCTION. `fieldPx(I,out)` is where the ramp is evaluated
     and where the lowest class's fade is applied, and the fine field and the far annulus each write
     what it returns — which is the same statement this test has always made («the fill is the ramp
     in BOTH painters»), enforced by construction instead of by two matching call sites. 震度 is
     still banded inside it: `jmaClass(I)` picks the class and only the ALPHA ramps at the floor. */
  assert.match(s, /function fieldPx\(I,out\)/, 'one painter for both rasters');
  assert.match(s, /else mmiRGB\(I,out\);/, 'the MMI fill is the ramp, per cell');
  assert.match(s, /const c=fieldPx\(I,_fineRGB\)/, 'the fine field goes through it');
  assert.match(s, /const rgb=fieldPx\(I,_farRGB\)/, 'and so does the far field');
  assert.match(s, /const rgb=_clsRGB\(jmaClass\(I\)\);/, 'JMA is untouched and still banded');
  /* the legend's class colours are DERIVED from the ramp — never a second copy of a hex */
  assert.match(s, /\}\ \]\.map\(k=>Object\.assign\(k,\{ col:_mmiHex\(k\.min\) \}\)\);/,
    'MMI_CLASSES takes its colours from the ramp');
  /* …and the arithmetic itself, against the PDF's anchors */
  const src = s.slice(s.indexOf('const MMI_RAMP='), s.indexOf('const _mmiHex='));
  const mmiRGB = new Function(src + '\nreturn mmiRGB;')();
  for (const [I, r, g, b] of want) assert.deepEqual(mmiRGB(I), [r, g, b], `MMI ${I}`);
  assert.deepEqual(mmiRGB(4.5), [125, 255, 201], 'and it interpolates between them');
  assert.deepEqual(mmiRGB(11), [200, 0, 0], 'clamped at the top');
});

/* ── ③ A DRAWN OUTLINE IS THE FAULT'S SHADOW ──────────────────────────────────────────────────────
   Verified against published earthquakes rather than against itself: the numbers below are the
   rectangles those two events actually ruptured, and what comes back is the dip, width, slip and
   magnitude that were published for them. */
test('R224 ③ the fault solver recovers real earthquakes from their footprints', async () => {
  const w = {};
  new Function('window', read('js/fault-geometry.js'))(w);
  const G = w.IntMapFaultGeom;
  const D = Math.PI / 180;
  const rect = (lng, lat, L, W, az) => {
    const kx = 111.320 * Math.cos(lat * D), ky = 110.574, c = Math.cos(az * D), s = Math.sin(az * D);
    return [[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]]
      .map(([x, y]) => [lng + (x * s + y * c) / kx, lat + (x * c - y * s) / ky]);
  };
  const solve = (lng, lat, L, W, az, over) =>
    G.solve({ footprint: G.footprint(rect(lng, lat, L, W, az), L * W), depthKm: 10, stressDropMPa: 3, override: over });

  /* 2024 Noto, M7.5: ~150 × 30 km on a fault dipping ~50°, so a 150 × 19 km footprint */
  const noto = solve(137.27, 37.49, 150, 19, 10);
  assert.ok(noto.dipDeg > 45 && noto.dipDeg < 60, `Noto dip ${noto.dipDeg.toFixed(0)}° (published ~50°)`);
  assert.ok(noto.widthKm > 25 && noto.widthKm < 38, `Noto width ${noto.widthKm.toFixed(0)} km (published ~30)`);
  assert.ok(noto.slipM > 1.5 && noto.slipM < 4, `Noto mean slip ${noto.slipM.toFixed(2)} m (published 2–4)`);
  assert.ok(Math.abs(noto.mw - 7.5) < 0.3, `Noto Mw ${noto.mw.toFixed(2)} (7.5)`);
  assert.ok(noto.areaKm2 > noto.areaProjKm2, 'the plane is bigger than its own shadow');

  /* 2011 Tōhoku, M9.0-9.1: a ~500 × 200 km megathrust — the case Wells & Coppersmith cannot reach,
     which is why the dip floor exists and why the slip comes from the stress drop, not from W&C. */
  const toh = solve(142.4, 38.3, 500, 197, 20);
  assert.ok(toh.dipDeg <= 12, `Tohoku dip ${toh.dipDeg.toFixed(0)}° — a megathrust falls on the floor`);
  assert.ok(toh.widthKm > 150, `Tohoku width ${toh.widthKm.toFixed(0)} km`);
  assert.ok(toh.slipM > 8 && toh.slipM < 16, `Tohoku mean slip ${toh.slipM.toFixed(1)} m (published ~10)`);
  assert.ok(Math.abs(toh.mw - 9.0) < 0.3, `Tohoku Mw ${toh.mw.toFixed(2)} (9.0)`);

  /* a long thin ribbon is a strike-slip fault, and its width is the seismogenic depth */
  const ss = solve(-118, 35, 60, 4, 140);
  assert.ok(ss.dipDeg > 70, `a ribbon dips steeply (${ss.dipDeg.toFixed(0)}°)`);
  assert.ok(ss.zBotKm - ss.zTopKm > 10, 'and it fills the seismogenic layer');

  /* ⚠ EVERY OVERRIDE RE-ENTERS THE SAME CHAIN — 「Mw・M0・断層面積・平均すべり量が一貫して再計算」 */
  const a = solve(137.27, 37.49, 150, 19, 10, { dip: 30 });
  assert.equal(Math.round(a.dipDeg), 30);
  /* A₃D = A_proj / cos δ, so a SHALLOWER dip means the shadow is closer to the plane's true size:
     the plane shrinks. (Steepen it instead and it grows — both directions are checked.) */
  assert.ok(a.areaKm2 < noto.areaKm2, 'a shallower dip brings the plane closer to its own shadow');
  const a2 = solve(137.27, 37.49, 150, 19, 10, { dip: 80 });
  assert.ok(a2.areaKm2 > noto.areaKm2, 'and a steeper one makes it bigger');
  assert.ok(Math.abs(a.M0 - 3.3075e10 * a.areaKm2 * 1e6 * a.slipM) / a.M0 < 1e-9, 'M0 = μ·A₃D·D̄ still');
  assert.equal(a.auto.dip, false); assert.equal(a.auto.slip, true, 'the others stay on auto');
  const b = solve(137.27, 37.49, 150, 19, 10, { slipM: 6 });
  assert.equal(b.slipM, 6); assert.ok(b.mw > noto.mw, 'more slip is a bigger earthquake');
  const c = solve(137.27, 37.49, 150, 19, 10, { zTopKm: 2, zBotKm: 22 });
  assert.ok(Math.abs((c.zBotKm - c.zTopKm) - 20) < 0.01, 'a pinned pair of depths is honoured exactly');
  assert.ok(Math.abs(c.widthKm * Math.sin(c.dipDeg * D) - 20) < 0.01, '…and states the width through the dip');

  /* the panel exposes it, and it is not a second implementation */
  const s = read('js/seismic.js');
  assert.match(s, /const FG=\(\)=>window\.IntMapFaultGeom;/);
  assert.match(s, /function _faultAdvHTML\(\)/, 'the 詳細設定 disclosure exists');
  for (const k of ['dip', 'widthKm', 'zTopKm', 'zBotKm', 'slipM'])
    assert.ok(s.includes(`_fadvRow('${k}'`), `the advanced panel offers ${k}`);
  assert.match(s, /setFaultGeometry\(o\)/, 'and Atlas can drive it (#R82)');
  assert.ok(!/faultSlip/.test(s), 'the fixed 2 m slip is gone');
});

/* ══════════════════ #R248 ② ══════════════════ */
test('#R248 ② the far raster is sized to the field, and the fine box snaps onto THAT grid', () => {
  /* ⚠ READ, NOT RUN: farWindow and the snap read a dozen closures of the field builder (FAR_N, mY, the fine field) that exist only inside a running panel. */
  const s = code(read('js/seismic.js'));
  /* ⚠ (#R249) UPDATED, AND WHY. This asserted `farWindow(C0,rKm)` — the signature, not the
     property. #R249 hands the function a THIRD argument (the fine field's cell) because #R248's
     window fixed the far raster's EXTENT and left a 2.24× step at the seam, which is the number the
     reader was actually reporting. The property #R248 was protecting — the window is the FIELD's,
     never the planet's — is unchanged and still asserted below; only the arity moved.
     ⚠ The cell EXPRESSION also moved (it is now `min(budget, wanted)` then bounded by a cell count,
     then the 4·NF guard), so the assertion is on the guard that #R248 owns rather than on the whole
     line. tests/r249-checks ① pins the new half. */
  assert.match(s, /function farWindow\(C0,\s*rKm,\s*wantCellKm\)/, 'the far raster has a window');
  /* square in Mercator = square on the ground; both sides capped so a wrapped field cannot ask for
     a canvas that cannot exist */
  assert.match(s, /Math\.max\(cell,\s*sx\/\(4\*NF\),\s*sy\/\(4\*NF\)\)/,
    'the cell is square and neither side may exceed 4·FAR_N');
  /* the cap's true longitude reach, not the linear approximation that under-reads it */
  assert.match(s, /Math\.asin\(s\)\/D/, 'max Δλ of a spherical cap is asin(sin ρ / cos φ₀)');
  /* #R191's two failures stay avoided */
  assert.match(s, /if\(!full&&\(C0\[0\]-dLng<-180\|\|C0\[0\]\+dLng>180\)\) full=true;/,
    'a window that would cross ±180 keeps the whole world in x');
  /* the snap reads the window, never 360/FAR_N */
  assert.match(s, /const _fdx=farWin\.dx, _fy0=farWin\.y0, _fdy=farWin\.dy/, 'the box snaps onto the window grid');
  assert.doesNotMatch(s, /_fdx=360\/_fN/, 'the old whole-world snap must be gone or the two rasters stop tiling');
  /* the far loop may only wrap when the window IS the world */
  assert.match(s, /const i=wrap\?\(\(\(s%NX\)\+NX\)%NX\):s;/, 'a sub-window clamps its band, it does not wind it round');
  /* an empty annulus is not encoded */
  assert.match(s, /if\(!painted\)\{ _revoke\(fldFar&&fldFar\.url\); fldFar=null; paintFar\(\); return; \}/,
    'a fully transparent PNG is pure cost');
  /* the snap is reported as a NUMBER so a regression is measurable, not a matter of looking */
  assert.match(s, /snapCols:.*snapRows:/, 'the snap is reported in stats');
});

/* ══════════════════ #R246 ④ ══════════════════ */
/* ── ④ THE SEISMIC FOOTER DRAWS THE PROGRESS ABOVE THE BUTTON ──────────────────────────────── */
test('r246 ④ the compute progress is above 「震度分布を計算」, not below it', () => {
  /* EVALUATED: `_flowFoot` and `_progHTML` are lifted out of the comment-stripped js/seismic.js and
     run for both steps of the flow (placing the hypocentre, and solving); the order is read off the
     markup they RETURN, not off the expression that builds it. */
  const s = code(read('js/seismic.js'));
  const foot = (step) => new Function('L', '_flowStep', '_runBtnClass', '_runBtnLabel', 'FS', 'minimised',
    liftFunction(s, '_progHTML') + '\n' + liftFunction(s, '_flowFoot') + '\nreturn _flowFoot();')(
    (en) => en, () => step, () => 'sq-run', () => 'Compute intensity', '12px', false);
  for (const step of ['epi', 'run']) {
    const html = foot(step);
    const prog = html.indexOf('class="sq-prog ');
    const btn = html.indexOf('<button');
    assert.ok(html.startsWith('<div class="sq-foot"'), `_flowFoot no longer builds the pinned footer (step ${step})`);
    assert.ok(prog > 0 && btn > 0, `the footer has both a progress box and the primary button (step ${step})`);
    assert.ok(prog < btn, `the progress bar is still emitted AFTER the button (step ${step})`);
    assert.equal((html.match(/class="sq-prog /g) || []).length, 1, 'one progress box in the footer');
  }
  /* one progress STATE, two readouts at most — `_setProg` writes to every `.sq-prog` it finds.
     ⚠ READ, NOT RUN: _setProg writes into the live panel, and the helper-count is a property of the text. */
  assert.match(s, /panel\.querySelectorAll\('\.sq-prog'\)/, 'the progress is written to by class, not to the first one');
  assert.equal((s.match(/_progHTML\(/g) || []).length, 2, 'the progress markup is one helper, called once');
});
