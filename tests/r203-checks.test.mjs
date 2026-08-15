/* ============================================================================
 *  IntMap · R203 source-level checks
 * ----------------------------------------------------------------------------
 *  Node tests, no browser. Every one of these is DERIVED from the source rather than copied out of
 *  it — #R202's lesson about `r185`'s altitude floor is that the same number written in two places
 *  eventually disagrees, and a test is one of the two places.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpeningView } from '../js/opening-view.js';
const { subsolarPoint, solarElevation, openingCentre, MIN_ELEV_DEG } = OpeningView;
import { allSpecs, coreNames, currentRoundSpec, CORE_ALWAYS, isDeep, tierSpecs } from '../scripts/tiers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── ① THE APP DOES NOT OPEN ON A BLACK PLANET ─────────────────────────────────────────────────
   The measured defect: the whole canvas at [29,30,36] with 52 % of pixels under luminance 15,
   because 10°E was half past midnight. The fix is a longitude, and the thing worth pinning is the
   PROPERTY — after openingCentre(), the Sun is up over the centre — at every hour of the day. */
test('R203 ① the opening centre is always in daylight, at every hour of the day', () => {
  const day = Date.UTC(2026, 7, 8);
  for (let h = 0; h < 24; h++) {
    const ms = day + h * 3600e3;
    const c = openingCentre(ms, [10, 20]);
    const e = solarElevation(ms, c[1], c[0]);
    assert.ok(e >= MIN_ELEV_DEG - 1e-6, `at ${h}:00 UTC the opening centre ${c} has the Sun at ${e.toFixed(1)}°`);
  }
  /* …and it does not move when it does not have to: at the hour 10°E is in full daylight, the
     opening view is the one the app has always had. */
  const noon10E = Date.UTC(2026, 7, 8, 11);   /* ~12:40 local at 10°E */
  assert.deepEqual(openingCentre(noon10E, [10, 20]), [10, 20]);
});

test('R203 ①b the sub-solar point agrees with the almanac at the solstices and equinoxes', () => {
  /* declination: 0° at the equinoxes, ±23.44° at the solstices, to a tenth of a degree */
  const cases = [
    [Date.UTC(2026, 2, 20, 14, 46), 0],        /* March equinox 2026 */
    [Date.UTC(2026, 5, 21, 8, 25), 23.44],     /* June solstice */
    [Date.UTC(2026, 8, 23, 0, 6), 0],          /* September equinox */
    [Date.UTC(2026, 11, 21, 20, 51), -23.44],  /* December solstice */
  ];
  for (const [ms, dec] of cases) {
    const s = subsolarPoint(ms);
    assert.ok(Math.abs(s.lat - dec) < 0.15, `declination ${s.lat.toFixed(3)} vs ${dec} at ${new Date(ms).toISOString()}`);
    /* and the sub-solar point is where the Sun is overhead, by construction */
    assert.ok(Math.abs(solarElevation(ms, s.lat, s.lng) - 90) < 1e-6);
    /* local apparent noon: the sub-solar longitude is ~15°/h west of Greenwich at UT noon */
    const utHours = (ms - Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), new Date(ms).getUTCDate())) / 3600e3;
    const expect = ((-15 * (utHours - 12) + 540) % 360) - 180;
    assert.ok(Math.abs(((s.lng - expect + 540) % 360) - 180) < 5,
      `sub-solar longitude ${s.lng.toFixed(2)} is not within the equation of time of ${expect.toFixed(2)}`);
  }
});

test('R203 ①c the map is created at that centre, and js/opening-view.js is its only owner', () => {
  const body = rd('js/app-body.js');
  assert.match(body, /const _openingCentre=OpeningView\.openingCentre\(OpeningView\.openingClockMs\(\),\[10,20\]\)/,
    'the opening centre is computed once');
  assert.match(body, /center:_openingCentre,/, 'and the view is created at it');
  /* ⚠ published, so a test READS what the app decided instead of re-deriving a number that moves
     0.25° a minute — which is what took tests/r180-cesium red on the first post-merge run. */
  assert.match(body, /window\.__imOpeningCentre=_openingCentre/, 'and published for the tests');
  assert.match(body, /import \{ OpeningView \} from '\.\/opening-view\.js'/);
  /* nothing else may re-derive the Sun's position for this purpose */
  assert.doesNotMatch(body, /280\.460 \+ 0\.9856474/, 'the solar series lives in js/opening-view.js only');
});

/* ── ② THE TIERS ───────────────────────────────────────────────────────────────────────────── */
test('R203 ② every spec belongs to exactly one tier, and the core list names real files', () => {
  const all = allSpecs();
  assert.ok(all.length > 40, 'the suite still has its specs');
  const core = tierSpecs('core'), deep = tierSpecs('deep');
  assert.equal(core.length + deep.length, all.length, 'core ∪ deep = every spec');
  assert.equal(core.filter((f) => deep.includes(f)).length, 0, 'and the two do not overlap');
  for (const n of coreNames()) {
    assert.ok(fs.existsSync(path.join(ROOT, 'tests', n + '.spec.js')), `core names ${n}, which does not exist`);
  }
  /* ⚠ (#R204) THE GATE'S CONTENTS ARE PINNED AS A RELATION, NOT AS FILE NAMES. This test used to
     name `tests/r203.spec.js`, which is exactly the mistake #R203's own notes were written about:
     the round after pushes that file out of the gate on price, and the test asserting the OLD
     round's membership goes red for doing the right thing. What a gate must contain is the four
     always-on suites and WHICHEVER round is current — both of which scripts/tiers.mjs derives. */
  for (const must of [...CORE_ALWAYS, currentRoundSpec()].filter(Boolean).map((n) => 'tests/' + n + '.spec.js')) {
    assert.ok(core.includes(must), `${must} must be in the tier that runs every time`);
    assert.ok(!isDeep(must), `${must} must not be deep`);
  }
});

test('R203 ②b the core tier is under a tenth of what the whole suite used to cost', () => {
  const dur = JSON.parse(rd('tests/durations.json'));
  const times = Object.entries(dur).filter(([, v]) => typeof v === 'number');
  const sorted = times.map(([, v]) => v).sort((a, b) => a - b);
  const p75 = sorted[Math.floor(sorted.length * 0.75)];
  const cost = (f) => (typeof dur[f] === 'number' ? dur[f] : p75);
  const core = tierSpecs('core').reduce((a, f) => a + cost(f), 0);
  const whole = allSpecs().reduce((a, f) => a + cost(f), 0);
  /* 「今の時間の1/10以下の時間で全テスト工程を終わらせろ」 — measured whole was 5,123 s */
  assert.ok(core <= whole / 10, `the core tier is ${core}s against a whole suite of ${whole}s`);
  /* …and the ceiling in scripts/test-budget.mjs must be the thing that keeps it there */
  const budget = rd('scripts/test-budget.mjs');
  const m = /const BUDGET_S = (\d+);/.exec(budget);
  assert.ok(m && Number(m[1]) <= 512, `the core ceiling is ${m && m[1]}s; a tenth of 5,123 s is 512 s`);
});

/* ── ③ THE MOON IS NOT INSIDE THE EARTH ────────────────────────────────────────────────────────
   Derived from js/space.js's own constants, so the test cannot drift from the file: at PERIGEE the
   Moon's model-scale separation must exceed the two model radii put together. */
test('R203 ③ in model scale the Moon clears the Earth at perigee', () => {
  const src = rd('js/space.js');
  const num = (re, what) => { const m = re.exec(src); assert.ok(m, `js/space.js no longer states ${what}`); return Number(m[1]); };
  const POS_P = num(/const POS_P=([\d.]+)/, 'POS_P');
  const RAD_K = num(/RAD_K=([\d.]+)/, 'RAD_K');
  const MOON_K = num(/const MOON_K=([\d.]+)/, 'MOON_K');
  const MOON_REF = num(/MOON_REF_KM=(\d+)/, 'MOON_REF_KM');
  const radScale = (km) => RAD_K * Math.pow(km / 6378.137, 1 / 3);
  const sep = (km) => MOON_K * Math.pow(km / MOON_REF, POS_P);
  const rE = radScale(6378.137), rM = radScale(1737.4);
  assert.ok(sep(356500) > (rE + rM) * 1.5,
    `perigee separation ${sep(356500).toFixed(4)} against radii ${(rE + rM).toFixed(4)} — the Moon is inside the Earth`);
  /* and the old behaviour — compressing the HELIOCENTRIC distance — is what fused them */
  const POS_K = num(/POS_K=(\d+)/, 'POS_K');
  const old = POS_K * Math.pow(1 + 356500 / 149597870.7, POS_P) - POS_K * Math.pow(1, POS_P);
  assert.ok(old < rE + rM, 'the defect this fixes: the heliocentric compression really did fuse them');
  /* the Moon must be placed relative to the Earth in the scene, not from its own heliocentric radius */
  assert.match(src, /if\(id==='moon'&&pos\._moonGeo/, 'scenePos must special-case the Moon');
});

test('R203 ③b the space explorer draws the app’s own Earth, and there is no second one', () => {
  const src = rd('js/space.js');
  assert.match(src, /IntMapWorldBase[\s\S]{0,80}url\(\)/, 'the Earth texture comes from js/world-base.js');
  assert.match(src, /data\/world-basemap\.jpg/, 'and falls back to the same bundled picture');
  /* the per-planet URL must no longer be reachable for the Earth: texUrl returns before it */
  const tu = src.slice(src.indexOf('function texUrl(id)'), src.indexOf('/* a 1×1 stand-in'));
  assert.match(tu, /if\(id==='earth'\)/, 'texUrl must answer for the Earth before the planets folder');
  assert.ok(tu.indexOf("id==='earth'") < tu.indexOf("'data/planets/'"), 'and it must answer FIRST');
  assert.ok(!fs.existsSync(path.join(ROOT, 'data/planets/earth.jpg')), 'and from the repository');
  /* the other worlds still come from where they always did */
  assert.ok(fs.existsSync(path.join(ROOT, 'data/planets/mars.jpg')));
  /* the crossing states a size in both directions */
  assert.match(src, /function mapGlobeRadiusPx/);
  assert.match(src, /function earthRadiusPx/);
  assert.match(src, /o\.match/, 'openView takes the size and face the map handed over');
});

/* ── ④ THE HORIZON DOES NOT FLICKER ─────────────────────────────────────────────────────────── */
test('R203 ④ the far-plane override is never cleared by a zoom', () => {
  const ge = rd('js/geo-engine.js');
  const i = ge.indexOf('setHorizonReach(on)');
  assert.ok(i > 0, 'setHorizonReach is still there');
  const body = ge.slice(i, ge.indexOf('setCenterClamped(on)', i));
  assert.match(body, /shapeChanged\(tr,sph\)/, 'the clear is gated on the shape, not on the altitude');
  assert.match(body, /prisZoom/, 'the pristine plane is remembered with the zoom it was read at');
  /* the sphere rescales the cached plane by 2^Δzoom; the plane does not, and both are measured */
  assert.match(body, /sph \? pris\*Math\.pow\(2,\(tr\.zoom\|\|0\)-prisZoom\) : pris/);
  /* and the altitude alone must no longer be able to trigger a clear */
  assert.doesNotMatch(body, /if\(!\(force\|\|moved\)\) return;\s*\n\s*try\{ tr\.clearNearFarZOverride/,
    'an altitude change must not clear the override — that is the flicker');
});

/* ── ⑤ THE PICTURE AND ITS CAPTION MOVE TOGETHER ────────────────────────────────────────────── */
test('R203 ⑤ the satellite labels fade with the imagery they are drawn on', () => {
  const body = rd('js/app-body.js');
  const grab = (id) => {
    const i = body.indexOf("{id:'" + id + "',type:'raster'");
    assert.ok(i > 0, id + ' is still declared as a raster layer');
    return /'raster-fade-duration':(\d+)/.exec(body.slice(i, i + 220));
  };
  const sat = grab('layer-sat'), lbl = grab('layer-sat-labels');
  assert.ok(sat && lbl, 'both raster layers still declare a fade duration');
  assert.equal(lbl[1], sat[1], 'the caption fades with the photograph');
  assert.ok(Number(sat[1]) > 0, 'and neither is a hard swap (#R191)');
});

/* ── ⑥ THE MESH ────────────────────────────────────────────────────────────────────────────── */
test('R203 ⑥ the shaking mesh is finer than the round before, on both classes of device', () => {
  const s = rd('js/seismic.js');
  /* ⚠ (#R204) the fine grid is no longer one number: it is a cell size with a floor and a ceiling
     (see js/seismic.js). "Finer than the round before" is a claim about the FLOOR — the coarsest
     grid the code can pick — which is what #R203's single number was. */
  const fine = /const CELL_KM=[\d.]+, N_MIN=\(_mob\?(\d+):(\d+)\), N_MAX=\(_mob\?(\d+):(\d+)\);/.exec(s);
  /* (#R245) the far grid is declared once, beside the layer, because buildField now snaps its box
     onto it — same numbers, hoisted out of buildFar so two functions can agree on them. */
  const far = /const FAR_N=\(\)=>\(\(typeof isMobile==='function'&&isMobile\(\)\)\?(\d+):(\d+)\);/.exec(s);
  assert.ok(fine && far, 'both grids are still declared where they were');
  assert.ok(Number(fine[2]) >= 640, `desktop fine mesh floor is ${fine[2]}, #R203 shipped 640`);
  assert.ok(Number(fine[1]) >= 288, `mobile fine mesh floor is ${fine[1]}, #R203 shipped 288`);
  assert.ok(Number(fine[4]) >= Number(fine[2]), 'the desktop ceiling is at least the floor');
  assert.ok(Number(fine[3]) >= Number(fine[1]), 'the mobile ceiling is at least the floor');
  assert.ok(Number(far[2]) >= 1024, `desktop far mesh is ${far[2]}, #R202 shipped 768`);
  assert.ok(Number(far[1]) >= 512, `mobile far mesh is ${far[1]}, #R202 shipped 384`);
});

/* ── ⑦ THE BUILD STAMP ─────────────────────────────────────────────────────────────────────────
   ⚠ (#R204) The exact pin lives in the CURRENT round's file — that was #R202's rule and this test
   broke it by naming R203, so the very next round had to edit it. What an OLD round's file can
   honestly assert is the INVARIANT: there are two stamps, they name the same round, and it is not
   older than the round that wrote this. */
test('R203 ⑦ both build stamps name the same round, and it is not older than R203', () => {
  const idx = rd('index.html');
  const a = /window\.__imBuild='R(\d+)';/.exec(idx);
  const b = /window\.INTMAP_BUILD='\d{4}-\d{2}-\d{2}-R(\d+)';/.exec(idx);
  assert.ok(a && b, 'both stamps are present');
  assert.equal(a[1], b[1], `the two stamps disagree: R${a[1]} vs R${b[1]}`);
  assert.ok(Number(a[1]) >= 203, `the build stamp is R${a[1]}`);
});
