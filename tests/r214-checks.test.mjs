/* ============================================================================
 *  R214 — Node checks: the standing (first-person) sky, and the state that survives a reload
 * ----------------------------------------------------------------------------
 *  ⚠ #R203's trap, restated because it keeps catching us: DO NOT pin the previous round's VALUES.
 *  A test that says `fov === 65` fails the day someone changes a sensible default while keeping every
 *  claim true. So each check below is either an IDENTITY (true for every camera, every instant and
 *  every catalogue) or a CLAIM the code makes about itself in prose.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* js/night-sky.js touches the DOM only inside ensureDOM(), so the whole camera can be exercised
   here with the same stub #R208 used — no browser, no canvas. */
function nightSky() {
  const win = { addEventListener() { }, devicePixelRatio: 1 };
  /* ⚠ (#R221) THE LANGUAGE REGISTRY IS A DEPENDENCY OF EVERY MODULE NOW, exactly as the renderer
     contract is: js/night-sky.js asks window.IntMapLang for its label helper instead of hand-rolling
     a five-argument one. A sandbox that does not provide it is not the environment the file runs in,
     and the module throws on the first line that reaches for it. */
  new Function('window', read('js/lang-registry.js'))(win);
  new Function('window', 'document', read('js/night-sky.js'))(win, { createElement: () => ({ style: {}, appendChild() { } }) });
  return win.IntMapNightSky;
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
/* cos(90°) is 6.1e−17, not 0, so a component that should vanish comes back as ±6e−17 — and −0 is not
   0 to deepEqual. Round to zero rather than weakening the comparison. */
const round12 = (v) => (Math.abs(v) < 1e-12 ? 0 : +v.toFixed(12));

/* ═══ ① THE FRAME ═════════════════════════════════════════════════════════════════════════════ */

test('R214 ①a: a horizon coordinate becomes a unit vector in the observer own ENU frame', () => {
  const NS = nightSky();
  /* the four facts that DEFINE east-north-up, so a sign slip anywhere shows up here */
  assert.deepEqual(NS.dirOf(0, 0).map(round12), [0, 1, 0], 'due north is +y');
  assert.deepEqual(NS.dirOf(0, 90).map(round12), [1, 0, 0], 'due east is +x');
  assert.deepEqual(NS.dirOf(90, 137).map(round12), [0, 0, 1], 'the zenith is +z, whatever azimuth you name it by');
  assert.deepEqual(NS.dirOf(0, 180).map(round12), [0, -1, 0], 'due south is −y');
  for (const alt of [-85, -30, 0, 17, 60, 89]) for (const az of [0, 33, 91, 180, 274, 359]) {
    assert.ok(Math.abs(len(NS.dirOf(alt, az)) - 1) < 1e-12, `alt ${alt} az ${az} is not a unit vector`);
  }
});

test('R214 ①b: the camera is orthonormal and CANNOT ROLL, at every attitude', () => {
  const NS = nightSky();
  for (const alt of [-85, -40, -1, 0, 1, 25, 70, 85]) for (const az of [0, 47, 123, 200, 314]) {
    NS.look({ az, alt });
    const B = NS.viewBasis();
    for (const k of ['f', 'r', 'u']) assert.ok(Math.abs(len(B[k]) - 1) < 1e-12, `${k} is not unit at alt ${alt}`);
    assert.ok(Math.abs(dot(B.f, B.r)) < 1e-12, `axis and right are not perpendicular at alt ${alt}`);
    assert.ok(Math.abs(dot(B.f, B.u)) < 1e-12, `axis and up are not perpendicular at alt ${alt}`);
    assert.ok(Math.abs(dot(B.r, B.u)) < 1e-12, `right and up are not perpendicular at alt ${alt}`);
    /* ⚠ NO ROLL is not a stylistic claim, it is this: screen-RIGHT is HORIZONTAL. Its z component is
       zero at every attitude, which is exactly what makes the horizon level wherever you point. */
    assert.ok(Math.abs(B.r[2]) < 1e-12, `screen-right has a vertical component (${B.r[2]}) at alt ${alt} — the view is rolled`);
  }
});

/* ═══ ② THE PROJECTION ════════════════════════════════════════════════════════════════════════ */

test('R214 ②a: it is gnomonic — great circles come out STRAIGHT', () => {
  const NS = nightSky();
  /* This is the defining property of the gnomonic projection and it is independent of how the code
     is written: every great circle through the sky must land on a straight line on the screen. Take
     an arbitrary great circle (a plane through the origin), walk it, and check the projected points
     are collinear to within a rounding error. */
  NS.look({ az: 200, alt: 18, fov: 70 });
  const B = NS.viewBasis(), F = 400;
  const n = [Math.sin(0.7) * Math.cos(1.1), Math.sin(0.7) * Math.sin(1.1), Math.cos(0.7)];   /* the circle's pole */
  const a = [-Math.sin(1.1), Math.cos(1.1), 0];                                               /* in the plane */
  const b = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];/* n × a, also in it */
  const pts = [];
  for (let t = 0; t < 6.28; t += 0.02) {
    const v = [a[0] * Math.cos(t) + b[0] * Math.sin(t), a[1] * Math.cos(t) + b[1] * Math.sin(t), a[2] * Math.cos(t) + b[2] * Math.sin(t)];
    const p = NS.projectVec(v, B, F); if (p) pts.push(p);
  }
  assert.ok(pts.length > 30, 'the great circle should cross the frustum');
  const p0 = pts[0], p1 = pts[pts.length - 1];
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy);
  let worst = 0;
  for (const p of pts) worst = Math.max(worst, Math.abs((p[0] - p0[0]) * dy - (p[1] - p0[1]) * dx) / L);
  assert.ok(worst < 1e-6, `a great circle bent by ${worst} px — that projection is not gnomonic`);
});

test('R214 ②b: the field of view is the field of view', () => {
  const NS = nightSky();
  /* Half the vertical field of view, straight up from the axis, must land exactly on the top edge —
     that is what "the focal length comes from the vertical fov" has to mean, and it is the number
     the drag scale is derived from. */
  for (const fov of [20, 45, 65, 100]) for (const alt of [-30, 0, 30]) {
    NS.look({ az: 90, alt, fov });
    const B = NS.viewBasis(), h = 900, F = (h / 2) / Math.tan(fov / 2 * Math.PI / 180);
    const axis = NS.projectVec(B.f, B, F);
    assert.ok(Math.abs(axis[0]) < 1e-9 && Math.abs(axis[1]) < 1e-9, 'what you are looking at is in the middle of the frame');
    const up = NS.projectVec(NS.dirOf(alt + fov / 2, 90), B, F);
    assert.ok(Math.abs(up[1] + h / 2) < 1e-6, `half a field of view up should be the top edge, got ${up[1]} against ${-h / 2}`);
  }
});

test('R214 ②c: the horizon is level, and the zenith is straight up the middle', () => {
  const NS = nightSky();
  for (const alt of [-40, -5, 0, 22, 60, 84]) {
    NS.look({ az: 137, alt, fov: 60 });
    const B = NS.viewBasis(), F = 500;
    /* two points on the true horizon, equally far either side of where you are facing, must sit at
       the SAME height on the screen and at mirrored x — no roll, no tilt, at any attitude */
    for (const d of [5, 20, 40]) {
      const l = NS.projectVec(NS.dirOf(0, 137 - d), B, F), r = NS.projectVec(NS.dirOf(0, 137 + d), B, F);
      if (!l || !r) continue;
      assert.ok(Math.abs(l[1] - r[1]) < 1e-9, `the horizon is not level at alt ${alt} (±${d}°)`);
      assert.ok(Math.abs(l[0] + r[0]) < 1e-9, `the horizon is not symmetric at alt ${alt} (±${d}°)`);
    }
    /* and the zenith, when it can be drawn at all, is on the centre column */
    const z = NS.projectVec([0, 0, 1], B, F);
    if (z) assert.ok(Math.abs(z[0]) < 1e-9, `the zenith is off the centre column (x=${z[0]}) at alt ${alt}`);
  }
});

test('R214 ②d: nothing behind the eye is drawn in front of it', () => {
  const NS = nightSky();
  /* The gnomonic projection diverges at 90° and CHANGES SIGN past it — the failure mode is a star
     behind your head appearing in the middle of the frame. Everything at or beyond the cut must be
     refused, and everything comfortably inside it must be accepted. */
  NS.look({ az: 0, alt: 0, fov: 90 });
  const B = NS.viewBasis(), F = 500;
  assert.equal(NS.projectVec(NS.dirOf(0, 180), B, F), null, 'the point directly behind you');
  assert.equal(NS.projectVec(NS.dirOf(0, 90), B, F), null, 'the point exactly 90° away');
  assert.equal(NS.projectVec(NS.dirOf(0, 120), B, F), null, 'a point past 90°');
  assert.ok(NS.projectVec(NS.dirOf(0, 80), B, F), '80° away is inside the cut and must project');
});

/* ═══ ③ THE CAMERA'S LIMITS AND THE PUBLIC SURFACE ════════════════════════════════════════════ */

test('R214 ③: the camera clamps where the geometry needs it to, and the mode is switchable', () => {
  const NS = nightSky();
  /* ⚠ (#R256) 「Night skyはStanding hereをデフォルトに。」 — the FIRST view is the one a person
     standing at the point actually has. The switch itself, which is what this test is for, is
     unchanged in both directions. */
  assert.equal(NS.mode(), 'stand', 'the standing view is the default');
  assert.equal(NS.setMode('stand'), 'stand');
  assert.equal(NS.mode(), 'stand');
  assert.equal(NS.setMode('nonsense'), 'dome', 'anything that is not the standing view is the chart');
  const wild = NS.look({ az: 1234.5, alt: 200, fov: 1000 });
  assert.ok(wild.az >= 0 && wild.az < 360, `azimuth must wrap, got ${wild.az}`);
  assert.ok(Math.abs(wild.az - (1234.5 % 360)) < 1e-9, 'and wrap by 360, not by clamping');
  assert.ok(wild.alt <= 89 && wild.alt > 0, `altitude must stay short of the zenith, got ${wild.alt}`);
  const low = NS.look({ alt: -200 });
  assert.ok(low.alt >= -89 && low.alt < 0, `…and short of the nadir, got ${low.alt}`);
  /* the field of view has to stay inside the 90° the projection can express */
  assert.ok(wild.fov < 180, `a field of view of ${wild.fov}° cannot be projected gnomonically`);
  assert.ok(NS.look({ fov: 0.1 }).fov > 0, 'and cannot collapse to zero');
  const st = NS.state();
  assert.equal(st.mode, 'dome');
  assert.ok(st.look && typeof st.look.az === 'number' && typeof st.look.alt === 'number' && typeof st.look.fov === 'number',
    'state() reports the camera, so a test or Atlas can read where it is pointing');
});

/* ═══ ④ THE CLAIMS THE FILE MAKES ABOUT ITSELF ════════════════════════════════════════════════ */

test('R214 ④a: both views read the SAME measured skyline, and neither invents one', () => {
  const src = read('js/night-sky.js');
  const stand = src.slice(src.indexOf('function drawStand'));
  assert.ok(/horizonAt\(/.test(stand), 'the standing view asks the same horizonAt() the chart does');
  assert.ok(/if\s*\(horizon\)/.test(stand),
    'the standing view branches on whether the profile was MEASURED before it draws ground');
  /* the honest fallback: when the DEM did not answer, the line is dashed and the fill translucent —
     a construction line, not a hill (standing instruction 4) */
  assert.ok(/setLineDash/.test(stand), 'the unmeasured horizon is dashed');
  assert.ok(!/prof\[i\]\s*=\s*0;/.test(stand), 'nothing manufactures a flat profile to draw');
});

test('R214 ④b: turning your head does not re-precess the catalogue', () => {
  const src = read('js/night-sky.js');
  assert.ok(/function ensureSkyCache/.test(src), 'the per-instant cache exists');
  const cache = src.slice(src.indexOf('function ensureSkyCache'), src.indexOf('function draw('));
  assert.ok(/stars\s*\?\s*stars\.n\s*:\s*0/.test(cache),
    '⚠ the catalogue is part of the cache key — it arrives after the first frame');
  const stand = src.slice(src.indexOf('function drawStand'));
  assert.ok(!/\.precess\(/.test(stand), 'drawStand must not precess anything itself — it reads the cache');
});

/* ═══ ⑥ WHAT A RELOAD BRINGS BACK ═════════════════════════════════════════════════════════════ */

test('R214 ⑥: every simulator #R211 left out now registers with the share registry', () => {
  /* #R211 built IntMapShareState and registered three modules; the rest were listed as "later" in
     three consecutive rounds. Each pair below is (the file that owns the state, the key it must
     register under) — and the KEY MATTERS: js/map-ui.js `apply()` calls IntMapLazy.need(key) for a
     module that has not registered yet, so a lazily-fetched simulator whose key is not its lazy
     name is never fetched and its state silently does not arrive. */
  const want = [
    ['js/tsunami.js', 'tsunami', true],      /* lazy → the key must be the lazy-module name */
    ['js/viewshed.js', 'los', true],         /* lazy, and its lazy name is 'los', not 'viewshed' */
    ['js/sims.js', 'sun', false],
    ['js/sims.js', 'disaster', false],
    ['js/sims.js', 'radiation', false],
    ['js/drone-nav.js', 'drone', false],
  ];
  const lazy = read('js/lazy-modules.js');
  for (const [file, key, isLazy] of want) {
    const src = read(file);
    const re = new RegExp("IntMapShareState[\\s\\S]{0,80}register\\('" + key + "'");
    assert.ok(re.test(src), `${file} does not register '${key}' with IntMapShareState`);
    if (isLazy) assert.ok(new RegExp("case '" + key + "':").test(lazy),
      `'${key}' is registered as if it were a lazy module, but js/lazy-modules.js cannot fetch it`);
  }
  /* ⚠⚠ AND LOAD ORDER MUST NOT DECIDE WHETHER A SIMULATOR IS SHAREABLE. Every call site is guarded
     with `window.IntMapShareState && …`, which is a silent no-op for a module evaluated BEFORE
     js/map-ui.js builds the registry. Measured: js/drone-nav.js is one, and its registration
     vanished without a trace. The eager modules therefore queue instead, and map-ui drains. */
  assert.ok(/_imShareEarly/.test(read('js/map-ui.js')), 'js/map-ui.js must drain the early queue');
  for (const f of ['js/sims.js', 'js/drone-nav.js', 'js/viewshed.js']) {
    assert.ok(/_imShareEarly/.test(read(f)), `${f} registers eagerly and must queue when the registry is not up yet`);
  }
  /* …and the registry's own contract: both halves, or `register` refuses it and says nothing. */
  for (const [file] of want) {
    const src = read(file);
    const i = src.indexOf('_share');
    if (i < 0) continue;
    const blk = src.slice(i, i + 1400);
    assert.ok(/get\(\)/.test(blk) && /set\(v\)/.test(blk), `${file}'s _share must have BOTH get and set`);
  }
  /* the tsunami's free-drawn rupture has to travel: the same magnitude at the same epicentre with a
     different ring is a different earthquake (#R212), so a link without it reopens on another run */
  const ts = read('js/tsunami.js');
  const blk = ts.slice(ts.indexOf("register('tsunami'"), ts.indexOf("register('tsunami'") + 1400);
  assert.ok(/rupture/.test(blk) && /ring/.test(blk), 'the tsunami share state must carry the drawn rupture ring');
});

/* ═══ ⑤ THE DAY/NIGHT SWITCH REACHES THE THING THAT IS ACTUALLY DRAWING ═══════════════════════ */

test('R214 ⑤: turning the day/night side off reaches the renderer that owns it', () => {
  const ns = read('js/night-side.js'), ts = read('js/theme-sky.js'), ab = read('js/app-body.js');
  /* ⚠ #R162's trap: a `window.X` nobody assigns makes the feature vanish silently inside a
     try/catch. Both ends of this hand-off are asserted, because only one of them is visible from
     either file. */
  assert.ok(/window\.IntMapThemeSky\s*=/.test(ts), 'js/theme-sky.js must publish the hook itself');
  /* ⚠ and NOT from js/app-body.js — tests/r200 ⑤ ratchets that file and eight lines broke it. */
  assert.ok(!/window\.IntMapThemeSky\s*=/.test(ab), 'the hook must not be published from the core file');
  assert.ok(/window\.IntMapThemeSky/.test(ns), 'js/night-side.js must use it when the switch flips');
  /* ⚠⚠ (#R215) THIS ASSERTION USED TO REQUIRE THE OPPOSITE, AND IT WAS WRONG. #R214 excused MapLibre
     on a stated argument — "its night side is a layer this module removes, and this light is only
     the fill-extrusion shading" — and the report came back a fifth time («オフにしてもオフにならない。
     MapLibre。»). The argument is half true: the layers really do go. But maplibre-gl's own
     atmosphere pass builds `u_sun_pos` FROM `style.light` (drawAtmosphere → getSunPos), so the globe's
     halo is itself bright over the day side and dark over the night side, and this app re-aims that
     light at the real Sun every sixty seconds. No engine is excused. Measured on MapLibre: on →
     anchor 'map' at the Sun's own azimuth/polar; off → anchor 'viewport' at the default [1.15,210,30]. */
  const aim = ts.slice(ts.indexOf('function _nightSideOff'), ts.indexOf('function _aimSun') + 700);
  assert.ok(!/_rendererLightsTheGlobe/.test(aim),
    'the un-aiming is unconditional — the engine gate is what left MapLibre lit (#R215)');
  assert.ok(/setSunDirection\(null\)/.test(aim), 'and it restores the default light rather than inventing one');
  /* …and it has to survive the periodic re-aim, which is what made the old behaviour look like the
     switch "not working": the setting was read nowhere, so the next tick lit the globe again. */
  assert.ok(aim.indexOf('_nightSideOff()') < aim.indexOf('_sunOverheadPoint()'),
    'the setting is consulted BEFORE the sun is aimed, so the 60-second re-aim cannot undo it');
});

test('R214 ④c: the standing view is reachable by hand and by Atlas, and the planner knows the parameters', () => {
  /* ⚠ (#R255) 「星空を見ると立って星空を見るは同じものに統合しろ。切り替えボタンで切り替わるように。」
     — the two right-click items became ONE. The standing VIEW is untouched; what went is the second
     door to it, because the panel has carried a labelled dome/stand switch since #R214 itself. So
     this asserts what #R214 was really protecting — that the view is reachable by hand — against the
     panel's own control rather than against a menu entry that no longer exists. */
  assert.ok(/IntMapNightSky&&window\.IntMapNightSky\.open/.test(read('js/tool-panel.js')),
    'the right-click menu no longer opens the night sky at all');
  assert.ok(/class="ns-mode" data-m="stand"/.test(read('js/night-sky.js')),
    'the standing view is not reachable by hand — the panel has no switch to it');
  const atlas = read('js/atlas-console.js');
  assert.ok(/case 'standHere':/.test(atlas), 'Atlas has an action for it');
  /* ⚠ #R115: a parameter the SYS catalogue does not name DOES NOT EXIST to the planner. */
  const sys = atlas.slice(atlas.indexOf('NIGHT SKY FROM A POINT:'), atlas.indexOf('NIGHT SKY FROM A POINT:') + 2000);
  for (const p of ['"mode"', '"az"', '"alt"', '"fov"', 'stand']) {
    assert.ok(sys.includes(p), `the catalogue does not mention ${p}, so Atlas can never send it`);
  }
});
