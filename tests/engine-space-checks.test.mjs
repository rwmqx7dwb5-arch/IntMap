/* ============================================================================
 *  Space — the explorer (js/space.js, js/space-bodies.js, js/space-cosmos.js, js/space-sky.js), the
 *  night sky from a point (js/night-sky.js), and the data they draw (stars, moons, spacecraft, small
 *  bodies, deep sky).
 * ----------------------------------------------------------------------------
 *  Gathered from tests/r208-checks ③ ⑤ ⑥ ⑨ (a star catalogue with depth, the sky from the ground,
 *  the other planets' moons, the axis at the map↔space seam), tests/r213-checks ①–⑥ (the spacecraft,
 *  Kepler on all three branches, deep-sky distances, the reach, the opt-in populations), tests/r219-
 *  checks ①–③ (the moons really orbit, the scale switch, the cosmic ladder) and tests/r222-checks ⑤ ⑥
 *  (the two space-view defects, the phone sheet and clock). Titles keep the round that wrote them.
 *
 *  ⚠ THEY PIN CLAIMS, NOT SHAPES (#R207/#R213). Where a number appears it is because the number IS the
 *  claim — Voyager 1 really is ~171 AU from the Sun in 2026, Halley's perihelion really is 0.575 AU,
 *  M31 really is ~770 kpc — and where the claim is a relation the test derives both sides.
 *
 *  RUN where it can be: js/space-bodies.js, js/space-cosmos.js, js/ephemeris.js and js/night-sky.js
 *  are evaluated against a stub window; js/space.js is one WebGL module, so the pieces of it that are
 *  arithmetic — the scale mapping, the reach, the frame-edge scale switch, "is the Earth the subject" —
 *  are lifted out by name and run in the same scope shape. What stays READ says why.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { asClassicScript } from './app-source.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { decodeStarCatalogue } from '../js/star-catalogue.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));

/* ── js/space.js, by the names it declares ───────────────────────────────────────────────────── */
const SPACE_SRC = read('js/space.js');
const SPACE_AST = acorn.parse(SPACE_SRC, { ecmaVersion: 'latest', sourceType: 'module' });
function liftSpace(names, expose, deps = {}) {
  const stmts = [];
  for (const name of names) {
    let hit = null;
    walk.full(SPACE_AST, (n) => {
      if (hit) return;
      if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) hit = n;
      if (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id && d.id.name === name)) hit = n;
    });
    assert.ok(hit, `js/space.js no longer declares ${name}`);
    if (!stmts.includes(hit)) stmts.push(hit);
  }
  const text = stmts.sort((a, b) => a.start - b.start).map((n) => SPACE_SRC.slice(n.start, n.end)).join('\n');
  const keys = Object.keys(deps);
  return new Function(...keys, `${text}\nreturn (${expose});`)(...keys.map((k) => deps[k]));
}

/* one loaded copy of js/space-bodies.js against a stub window — it publishes on `window` and
   allocates nothing until asked */
let SB = null;
function bodies() {
  if (SB) return SB;
  const w = {};
  new Function('window', 'document', 'fetch', read('js/space-bodies.js'))(
    w, { baseURI: 'https://example.test/' }, () => Promise.reject(new Error('no network in this test')));
  SB = w.IntMapSpaceBodies;
  assert.ok(SB && typeof SB.load === 'function', 'js/space-bodies.js published its module');
  return SB;
}
const rot = (b) => bodies()._kepler.rotator(b.i, b.om, b.w);
const at = (b, jd) => bodies()._kepler.smallPos(Object.assign({}, b, { _rot: rot(b) }), jd);
const r3 = (p) => Math.hypot(p[0], p[1], p[2]);

/* run one of the app's plain-script files in a sandbox and hand back its window */
function loadScripts(files) {
  const ctx = vm.createContext({ console, Math, Date, JSON, isFinite, parseInt, parseFloat, Float32Array, Uint8Array, Set, Map });
  ctx.window = ctx; ctx.globalThis = ctx;
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
}

/* ═══ #R208 ③ THE STARS — a catalogue with depth, and a camera that can use it ════════════════ */

test('R208 ③a: stars.bin carries the measured parallax, and 0 means unknown', () => {
  const manifest = json('data/stars.json');
  assert.equal(manifest.format, 'IMSTAR2');
  assert.ok(manifest.fields.includes('parallax_mas'), 'the new field is declared');
  assert.ok(manifest.parallax.withDistance > 50000, `only ${manifest.parallax.withDistance} stars can be placed in depth`);
  assert.ok(manifest.parallax.unknown > 0,
    'some parallaxes are below the noise and are recorded as unknown rather than rounded to a distance');
  /* α Centauri is 1.34 pc and is the nearest star above the catalogue's magnitude limit; a build that
     reported anything nearer would be reading the wrong column. */
  assert.ok(manifest.parallax.nearest_pc > 1.2 && manifest.parallax.nearest_pc < 1.6,
    `nearest star ${manifest.parallax.nearest_pc} pc — expected α Centauri at ~1.34`);
  const bin = readFileSync(join(ROOT, 'data', 'stars.bin'));
  assert.equal(bin.toString('latin1', 0, 7), 'IMSTAR2');
  assert.equal(bin.length, 12 + manifest.count * 8, 'eight bytes per star, not six');
});

/* (startup-lazy-layers) RUN, NOT READ: the record layout is decoded by ONE function now
   (js/star-catalogue.js), so the claim «either format loads» is evaluated on the shipped file and on
   the same bytes rewritten as IMSTAR1 — a hard-coded stride would put Sirius somewhere else in one of
   them. Both views reach that decoder and neither walks the bytes itself any more. */
test('R208 ③b: the one decoder takes the stride from the magic, so either format loads', () => {
  const bin = readFileSync(join(ROOT, 'data', 'stars.bin'));
  const v2 = decodeStarCatalogue(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  assert.equal(v2.format, 'IMSTAR2');
  assert.ok(v2.plxMas && v2.plxMas.length === v2.n, 'IMSTAR2 carries a parallax per star');
  /* the same stars in the six-byte layout */
  const v1b = Buffer.alloc(12 + v2.n * 6);
  v1b.write('IMSTAR1', 0, 'latin1'); v1b.writeUInt32LE(v2.n, 8);
  for (let i = 0; i < v2.n; i++) bin.copy(v1b, 12 + i * 6, 12 + i * 8, 12 + i * 8 + 6);
  const v1 = decodeStarCatalogue(v1b.buffer.slice(v1b.byteOffset, v1b.byteOffset + v1b.byteLength));
  assert.equal(v1.plxMas, null, 'IMSTAR1 has no parallax column, rather than a column of zeros');
  let worst = 0;
  for (let i = 0; i < v2.n; i++) worst = Math.max(worst, Math.abs(v1.ra[i] - v2.ra[i]), Math.abs(v1.dec[i] - v2.dec[i]), Math.abs(v1.mag[i] - v2.mag[i]));
  assert.equal(worst, 0, 'the two layouts must decode to the same sky');
  /* Sirius, where the catalogue says it is (RA 101.287°, Dec −16.716°, V −1.46) */
  let best = Infinity;
  for (let i = 0; i < v2.n; i++) best = Math.min(best, Math.hypot(v2.ra[i] - 101.287, v2.dec[i] + 16.716) + Math.abs(v2.mag[i] + 1.46));
  assert.ok(best < 0.1, 'Sirius is not where the decoder puts it (' + best + ')');
  assert.throws(() => decodeStarCatalogue(new ArrayBuffer(16)), /bad catalog header/);
  for (const f of ['js/space-sky.js', 'js/space.js']) {
    const src = codeOnly(read(f));
    assert.match(src, /loadStarCatalogue\(\)/, `${f} reads the catalogue through the one decoder`);
    assert.ok(!/IMSTAR|getUint16\(o/.test(src), `${f} walks the catalogue bytes itself again — a second decoder that can disagree`);
  }
});

test('R208 ③c: the camera can leave the solar system, and the ceiling is one function', () => {
  /* RUN: the reach and the ceiling */
  const S = liftSpace(['POS_P', 'posScale', 'AU_PER_PC', 'REACH_AU', 'reachAu', 'distCeil'],
    '{ REACH_AU, distCeil, set mode(v){ mode=v; } }',
    { mode: 'system', scale: 'model', starMaxPc: 0, showDeep: false, SB: () => null, window: {} });
  /* 1 pc = 206,264.8 AU, and the nearest star is 1.34 pc — a ceiling that cannot pass 276,000 AU
     cannot leave the solar system at all, which is what 1e4 (10,000 AU) could not. */
  assert.ok(S.REACH_AU > 276000 * 2, `REACH_AU ${S.REACH_AU} does not reach the nearest star (276,000 AU)`);
  assert.ok(S.distCeil() > 26 * Math.pow(276000, 0.42), 'the system ceiling is past the nearest star in scene units');
  S.mode = 'body';
  assert.equal(S.distCeil(), 60, 'a body view keeps its own close ceiling');
  /* ⚠ READ (these halves): the clamps, the star distance fallback and the far edge live in the WebGL
     draw path */
  const src = read('js/space.js');
  assert.ok((src.match(/distCeil\(\)/g) || []).length >= 5,
    'every clamp goes through it — it was 1e4 in four separate places');
  assert.ok(!/Math\.min\(1e4,d\)/.test(src) && !/'body'\?60:1e4/.test(src), 'no literal ceiling survives');
  assert.ok(/starPc\[i\]>0\?starPc\[i\]:\(unknown\+\+,starMaxPc\)/.test(src),
    'a star with no usable parallax goes to the far edge — a lower bound, not an invented distance');
  /* ⚠ the edge is DERIVED, not cached beside the positions: the buffer only rebuilds on the next DRAW,
     so a stored edge describes whichever scale drew last — and that edge is the star pass's far clip
     plane. tests/smoke.spec.js ⑧ caught it reading a model-scale figure in true scale.
     (#R208 wrote this assertion twice in a row, once with an unescaped regex; the pair is one claim.) */
  assert.ok(/function starFarEdgeNow\(\)/.test(src) && !/starFarEdge=edge/.test(src),
    'the star-field edge is computed from the current scale, not stored with the buffer');
  assert.ok(/posScale\(pc\*AU_PER_PC\)/.test(src),
    'star distance goes through the same scale mapping as the planets, or model scale puts the ' +
    'whole solar system inside one pixel');
});

/* ═══ #R208 ⑤ THE SKY FROM A POINT ON THE GROUND ═══════════════════════════════════════════════
   js/night-sky.js touches the DOM only inside ensureDOM(), so the astronomy is exercised with a stub. */
function nightSky() {
  const win = { addEventListener() { }, devicePixelRatio: 1 };
  /* ⚠ (#R221) THE LANGUAGE REGISTRY IS A DEPENDENCY OF EVERY MODULE: js/night-sky.js asks
     window.IntMapLang for its label helper, and throws on the first line that reaches for it without. */
  new Function('window', asClassicScript(read('js/lang-registry.js')))(win);
  new Function('window', 'document', asClassicScript(read('js/night-sky.js')))(win, { createElement: () => ({ style: {}, appendChild() { } }) });
  return win.IntMapNightSky;
}

test('R208 ⑤a: alt/az is checked against identities, not against itself', () => {
  const NS = nightSky();
  /* ⚠ THESE ARE EXACT RELATIONS, not "expected values" copied out of another program. */
  for (const lat of [-70, -23.4, 0, 35.68, 51.5, 78]) {
    /* 1. THE POLE STAR SITS AT YOUR LATITUDE — for every observer at every instant. */
    for (const lst of [0, 47, 123, 271, 359]) {
      const p = NS.altAz(0, 90, lst, lat);
      assert.ok(Math.abs(p.alt - lat) < 1e-6, `a star at the north celestial pole is at altitude ${p.alt} from latitude ${lat}`);
    }
    /* 2. ON THE MERIDIAN, altitude = 90 − |latitude − declination|. */
    for (const dec of [-40, 0, 20, 60]) {
      const p = NS.altAz(100, dec, 100, lat);          /* LST = RA → hour angle 0 → on the meridian */
      assert.ok(Math.abs(p.alt - (90 - Math.abs(lat - dec))) < 1e-6, `on the meridian at lat ${lat}, dec ${dec}: got ${p.alt}`);
      /* …and it is due south from the north, due north from the south */
      if (Math.abs(lat - dec) > 1e-9) assert.equal(Math.round(p.az), lat > dec ? 180 : 0);
    }
    /* 3. A STAR ON THE CELESTIAL EQUATOR RISES DUE EAST, six hours before it transits. */
    if (Math.abs(lat) < 89) {
      const p = NS.altAz(0, 0, -90, lat);
      assert.ok(Math.abs(p.az - 90) < 1e-6, `an equatorial star rises due east, got az ${p.az} at lat ${lat}`);
      assert.ok(Math.abs(p.alt) < 1e-6, `…and at altitude 0, got ${p.alt}`);
    }
  }
});

test('R208 ⑤b: the projection puts the zenith at the centre and EAST ON THE LEFT', () => {
  const NS = nightSky();
  const R = 100;
  /* ⚠ not deepEqual against [0,0]: −cos(0)·0 is NEGATIVE ZERO. The claim is "at the centre". */
  const z = NS.project(90, 0, R);
  assert.ok(Math.hypot(z[0], z[1]) < 1e-9, `the zenith is the centre, got ${z}`);
  const n = NS.project(0, 0, R), e = NS.project(0, 90, R), s = NS.project(0, 180, R), w = NS.project(0, 270, R);
  assert.ok(Math.abs(Math.hypot(n[0], n[1]) - R) < 1e-9, 'the horizon is the rim');
  assert.ok(n[1] < -R * 0.99, 'north is up');
  assert.ok(s[1] > R * 0.99, 'south is down');
  /* ⚠ looking UP mirrors the compass: a chart with east on the right is the sky seen from OUTSIDE,
     which is js/space-sky.js's view, not this one. */
  assert.ok(e[0] > R * 0.99, 'east is on the LEFT of the sky, which is +x in canvas coordinates '
    + 'only because the canvas y axis points down — see project()');
  assert.ok(w[0] < -R * 0.99, 'and west opposite it');
});

test('R208 ⑤c: the horizon angle takes the Earth curving away, and the sea is a surface', () => {
  const NS = nightSky();
  /* a 1,000 m peak 20 km away, seen from sea level. Flat-earth would be atan(1000/20000) = 2.862°; the
     curvature drop at 20 km with k = 1.13 is 27.8 m, so the real angle is 2.783°. */
  const flat = Math.atan2(1000, 20000) * 180 / Math.PI;
  const real = NS.elevAngleDeg(1000, 0, 20000);
  assert.ok(real < flat, 'the curvature term lowers a distant peak');
  assert.ok(Math.abs(real - 2.7834) < 0.002, `expected 2.783°, got ${real.toFixed(4)}`);
  /* and it grows with the square of the distance */
  const d20 = flat - real;
  const d40 = Math.atan2(1000, 40000) * 180 / Math.PI - NS.elevAngleDeg(1000, 0, 40000);
  assert.ok(d40 / d20 > 1.9 && d40 / d20 < 2.1,
    `the drop is d²/2kR, so twice the distance is twice the ANGLE deficit here: ratio ${(d40 / d20).toFixed(2)}`);
  /* ⚠ READ (this half): the clamps sit in the skyline sweep, which samples the live DEM */
  const src = read('js/night-sky.js');
  /* ⚠ the observer stands on the SURFACE. The Terrarium DEM is bathymetric, so mid-Pacific answers
     −5,367 m; measured before this clamp, an open-ocean point hid 3,823 of 4,404 stars behind a skyline. */
  assert.ok(/Math\.max\(0,\s*h0raw\)/.test(src), 'the eye is clamped to sea level over water');
  assert.ok(/elevAngleDeg\(Math\.max\(0,\s*h\)/.test(src), 'and so is the ground along each ray');
});

/* ⚠ READ, NOT RUN: which globals the module reaches for, and the Atlas/SYS text, are the claims. */
test('R208 ⑤d: it borrows the catalogue, the ephemeris, the DEM and the clock', () => {
  const src = read('js/night-sky.js');
  assert.ok(/window\.IntMapSky/.test(src), 'the star catalogue and precession come from js/space-sky.js');
  assert.ok(/window\.IntMapEphemeris/.test(src), 'the Sun, Moon and planets from js/ephemeris.js');
  assert.ok(/window\.IntMapTerrain/.test(src), 'the terrain from js/map-extras.js');
  /* ⚠ the clock is asked with when(); #R200 recorded that the other spelling does not exist. Comments
     stripped first — this file NAMES the wrong spelling in order to warn about it. */
  const code = codeOnly(src);
  assert.ok(/IntMapTime[\s\S]{0,80}when\(\)/.test(code), 'the master clock is asked with when()');
  assert.ok(!/IntMapTime\.now\b/.test(code), '…and never with the spelling that does not exist');
  /* the two reasons a star is not drawn are counted APART */
  assert.ok(/starsHiddenByTerrain/.test(src) && /starsLostToDaylight/.test(src),
    'terrain occlusion and daylight are reported separately');
  /* reachable from Atlas as well as from the right-click item (STANDING #R112) */
  assert.ok(/window\.IntMapNightSky&&window\.IntMapNightSky\.open/.test(read('js/tool-panel.js')),
    'the right-click menu opens it');
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it. */
  const atlas = read('js/atlas-console.js') + '\n' + read('js/atlas-catalog-text.js');
  assert.ok(/case 'nightSky':/.test(atlas), 'Atlas can open it');
  assert.ok(/NIGHT SKY FROM A POINT/.test(atlas),
    '…and it is in the SYS catalogue — an action the catalogue does not list does not exist to the planner (#R115)');
});

/* ═══ #R208 ⑥ / #R219 ① THE OTHER PLANETS' MOONS ════════════════════════════════════════════════ */

test('R208 ⑥a: every satellite carries a real epoch, a stated frame, and a mean anomaly', () => {
  const p = join(ROOT, 'data', 'moons.json');
  assert.ok(existsSync(p), 'data/moons.json is built (scripts/build-moons.mjs)');
  const doc = JSON.parse(readFileSync(p, 'utf8'));
  assert.ok(/JPL|Jet Propulsion/i.test(doc.attribution), 'the source is named in the file');
  const all = Object.values(doc.planets).flat();
  assert.ok(all.length > 100, `only ${all.length} satellites`);
  for (const m of all) {
    /* ⚠ THE MEAN ANOMALY AT EPOCH IS THE WHOLE POINT. #R197 refused to place these because without it
       a moon is at a chosen angle; a row that lost it must not be shipped as if it had one. */
    assert.ok(Number.isFinite(m.mDeg), `${m.name} has no mean anomaly at epoch`);
    assert.ok(Number.isFinite(m.wDeg) && Number.isFinite(m.nodeDeg) && Number.isFinite(m.iDeg), `${m.name} is missing an orientation angle`);
    assert.ok(m.aKm > 0 && m.periodDays > 0, `${m.name} has no orbit`);
    assert.ok(m.epoch, `${m.name} has no stated epoch`);
    /* ⚠ and the FRAME its i/node are measured in */
    assert.ok(m.frame === 'ecliptic' || m.frame === 'laplace', `${m.name}: frame "${m.frame}"`);
    if (m.frame === 'laplace') {
      assert.ok(Number.isFinite(m.poleRaDeg) && Number.isFinite(m.poleDecDeg),
        `${m.name} is on a Laplace plane with no pole — it cannot be placed and must not be kept`);
    }
  }
  /* the four Galileans are there, with their published semi-major axes (km) */
  const jup = Object.fromEntries((doc.planets.jupiter || []).map((m) => [m.name, m]));
  for (const [n, a, P] of [['Io', 421800, 1.762732], ['Europa', 671100, 3.525463],
    ['Ganymede', 1070400, 7.155588], ['Callisto', 1882700, 16.690440]]) {
    assert.ok(jup[n], `${n} is missing`);
    assert.equal(jup[n].aKm, a, `${n} semi-major axis`);
    assert.ok(Math.abs(jup[n].periodDays - P) < 1e-6, `${n} period`);
    assert.equal(jup[n].frame, 'laplace', `${n} is referred to Jupiter's Laplace plane`);
  }
});

/* ⚠ READ, NOT RUN: the propagation runs inside the WebGL frame of js/space.js; R219 ① below runs the
   same arithmetic against js/ephemeris.js's own solver. */
test('R208 ⑥b: the client propagates them and rotates the Laplace plane, and says so', () => {
  const src = read('js/space.js');
  assert.ok(/E\.kepler\(M,\s*m\.e\)/.test(src), "the eccentric anomaly comes from js/ephemeris.js's own solver, not a second copy");
  assert.ok(/m\.mDeg\s*\+\s*n\s*\*\s*\(jd\s*-\s*2451545\.0\)/.test(src), 'the mean anomaly is propagated from the epoch, which is what makes the phase real');
  assert.ok(/m\.frame==='laplace'/.test(src), 'the Laplace rotation is applied only where the row says to');
  assert.ok(/OBLIQ/.test(src), 'and equatorial → ecliptic afterwards, because the scene is ecliptic');
  /* a moon with no published radius is drawn at a FLOOR, not at an invented size */
  assert.ok(/m\.radiusKm\?Math\.max\(0\.004,\s*m\.radiusKm\/b\.rKm\):0\.006/.test(src), 'an unmeasured radius falls back to a floor rather than a guess');
  /* ⚠ and js/ephemeris.js's "deliberately not here" note must acknowledge this */
  assert.ok(/#R208[\s\S]{0,400}data\/moons\.json/.test(read('js/ephemeris.js')),
    "js/ephemeris.js still says the moons are deliberately absent without noting where they came from");
});

/* `kepler()` returns RADIANS; js/space.js multiplied that by π/180 a second time, so every satellite of
   every planet oscillated ±3.14° about periapsis instead of orbiting — reported three rounds running as
   「地球以外の惑星の衛星の挙動・軌道がバグっている」. Over one period the position must sweep a full turn and
   the radius must stay inside [a(1−e), a(1+e)]. */
test('R219 ① a satellite completes one revolution in one period, at the right radius', () => {
  const E = loadScripts(['js/ephemeris.js']).window.IntMapEphemeris;
  assert.ok(E && typeof E.kepler === 'function');
  /* the same arithmetic js/space.js runs, transcribed — including the fix */
  const D2R = Math.PI / 180;
  function moonPos(m, jd) {
    const n = 360 / m.periodDays;
    const M = m.mDeg + n * (jd - 2451545.0);
    const ecc = E.kepler(M, m.e);
    const cE = Math.cos(ecc), sE = Math.sin(ecc);       /* ⚠ radians, NOT ecc*D2R */
    const a = m.aKm;
    const xv = a * (cE - m.e), yv = a * Math.sqrt(Math.max(0, 1 - m.e * m.e)) * sE;
    const w = m.wDeg * D2R, i = m.iDeg * D2R, O = m.nodeDeg * D2R;
    const cw = Math.cos(w), sw = Math.sin(w), ci = Math.cos(i), cO = Math.cos(O), sO = Math.sin(O), si = Math.sin(i);
    const x1 = xv * cw - yv * sw, y1 = xv * sw + yv * cw;
    return [x1 * cO - y1 * ci * sO, x1 * sO + y1 * ci * cO, y1 * si];
  }
  /* Io, from data/moons.json itself when it is there, and from JPL's published values when not */
  let io = null;
  try { io = (json('data/moons.json').planets.jupiter || []).find((m) => m.name === 'Io'); } catch { /* fall through */ }
  if (!io) io = { name: 'Io', aKm: 421800, e: 0.0041, iDeg: 0.036, wDeg: 84.129, nodeDeg: 43.977, mDeg: 342.021, periodDays: 1.769138 };
  const jd0 = 2460000.5, N = 72, ang = [];
  let rMin = Infinity, rMax = 0;
  for (let k = 0; k < N; k++) {
    const p = moonPos(io, jd0 + io.periodDays * k / N);
    const r = Math.hypot(p[0], p[1], p[2]);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
    ang.push(Math.atan2(p[1], p[0]));
  }
  let total = 0;
  for (let k = 1; k < N; k++) {
    let d = ang[k] - ang[k - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  assert.ok(Math.abs(Math.abs(total) - 2 * Math.PI) < 0.35, 'one period must sweep 2π, swept ' + total.toFixed(3) + ' rad (the ×π/180 bug gives ~0.1)');
  assert.ok(rMin > io.aKm * (1 - io.e) * 0.995 && rMax < io.aKm * (1 + io.e) * 1.005,
    'radius ' + rMin.toFixed(0) + '…' + rMax.toFixed(0) + ' outside [a(1−e), a(1+e)]');
  assert.ok((rMax - rMin) / io.aKm > 1e-4, 'the orbit must actually vary in radius');
});

/* ═══ #R208 ⑨ THE AXIS DOES NOT JUMP AT THE MAP↔SPACE SEAM ════════════════════════════════════
   ⚠ READ, NOT RUN: the up-vector feeds the WebGL camera, and the seam is compared as one number
   (northRollDeg) by a browser test on both sides of it. */
test('R208 ⑨: the space camera interpolates its up-vector instead of snapping to the ecliptic', () => {
  const src = read('js/space.js');
  /* ⚠ the up-vector was the literal [0,0,1] — the ECLIPTIC north — while the map draws the Earth with
     its own axis vertical. Those differ by the obliquity, so the crossing rolled the Earth by up to
     23.44° in one frame. */
  assert.ok(/function upVector\(\)/.test(src) && /function axisBlend\(\)/.test(src), 'the up-vector is computed, not a constant');
  assert.ok(/mLook\(eye,\[0,0,0\],upVector\(\)\)/.test(src), 'and the camera uses it');
  assert.ok(!/mLook\(eye,\[0,0,0\],\[0,0,1\]\)/.test(src), 'the hard-wired ecliptic up is gone');
  assert.ok(/poleVector\('earth'/.test(src), "the Earth's axis comes from js/ephemeris.js rather than being re-derived from the obliquity");
  /* ⚠ AND IT MUST STILL REACH THE ECLIPTIC — driven by the Earth's own apparent size */
  assert.ok(/r\s*=\s*earthRadiusPx\(\)/.test(src), 'the blend is driven by the apparent size of the Earth');
  /* ⚠⚠ THE UPPER KNEE IS A RELATION AND MUST NOT BE WRITTEN AS A NUMBER (#R198, #R203). Two earlier
     attempts made it a fraction of the VIEWPORT HALF-HEIGHT and both left the seam jumping (measured
     3.5° / 7.2° / 11.0° of roll at 1280×720 / 390×844 / 768×1024). The ratio is taken against the size
     the crossing is DEFINED at: `handoverRadiusPx()`, the same one `atNearLimit()` tests. */
  assert.ok(/handoverRadiusPx\(\)/.test(/function axisRefPx\(\)[\s\S]{0,400}/.exec(src)?.[0] || ''),
    'the reference size is the handover radius, so the ratio is 1 at the seam on every viewport');
  assert.ok(!/\/\s*Math\.max\(1,\s*H\s*\/\s*2\)/.test(src), 'nothing measures the blend against the viewport height any more — that is what was wrong twice');
  assert.ok(/const t = \(r \/ ref - AXIS_LOW\) \/ \(1 - AXIS_LOW\);/.test(src), 'the upper knee is literally 1 — the handover size itself — and only the floor is a constant');
  const low = /const AXIS_LOW = ([\d.]+);/.exec(src);
  assert.ok(low && Number(low[1]) > 0 && Number(low[1]) < 1, 'the lower knee is a fraction of the handover size, not of the window');
  /* the seam has to match a ROTATED map too: the map draws north at −bearing from screen up */
  assert.ok(/mapRollDeg\s*=\s*-b\.bearing/.test(src), "the map's bearing is carried across the crossing, so a rotated map hands over its own roll");
  assert.ok(/function northRollDeg\(\)/.test(src) && /northRollDeg:/.test(src),
    'and what the eye sees — the screen angle of north — is reportable, so a browser test can compare the two sides of the seam as one number');
});

/* ═══ #R213 THE SPACECRAFT, KEPLER, THE DEEP SKY, THE REACH, THE POPULATIONS ═══════════════════ */

/* Hermite interpolation of the bundled Horizons samples, checked against where these spacecraft
   actually are. Voyager 1's distance is on NASA's own front page — the number that would catch a frame
   error, a unit error or an interpolation that silently returns the wrong sample. */
test('R213 ①: the bundled trajectories put each spacecraft where it really is', () => {
  const sc = json('data/spacecraft.json');
  const H = bodies()._kepler.hermite;
  assert.equal(sc.v, 1);
  assert.ok(/Horizons/i.test(sc.source), 'the file names JPL Horizons');
  assert.ok(sc.craft.length >= 15, `the fleet is ${sc.craft.length} — at least the 15 that were asked for`);
  const JD_2026_08_10 = 2461262.5;
  const dist = (key) => { const c = sc.craft.find((x) => x.key === key); assert.ok(c, key + ' is in the file'); return r3(H(c.s, JD_2026_08_10).p); };
  /* NASA publishes Voyager 1 at ~171 AU and Voyager 2 at ~143 AU in mid-2026; New Horizons is past 65 AU. */
  assert.ok(Math.abs(dist('voyager1') - 171.4) < 5, `Voyager 1 at ${dist('voyager1').toFixed(1)} AU`);
  assert.ok(Math.abs(dist('voyager2') - 143.6) < 5, `Voyager 2 at ${dist('voyager2').toFixed(1)} AU`);
  assert.ok(dist('voyager1') > dist('voyager2'), 'Voyager 1 is the more distant of the two');
  assert.ok(Math.abs(dist('newhorizons') - 65.3) < 3, `New Horizons at ${dist('newhorizons').toFixed(1)} AU`);
  /* JWST orbits Sun–Earth L2: 1 AU plus 1.5 million km = 1.01 AU */
  assert.ok(dist('jwst') > 1.005 && dist('jwst') < 1.03, `JWST at ${dist('jwst').toFixed(3)} AU (L2 is 1 AU + 0.01 AU)`);
  /* Parker Solar Probe's orbit reaches inside 0.06 AU */
  const parker = sc.craft.find((c) => c.key === 'parker');
  const rmin = Math.min(...parker.s.map((s) => r3([s[1], s[2], s[3]])));
  assert.ok(rmin < 0.08, `Parker's perihelion sample is ${rmin.toFixed(4)} AU — inside Mercury's orbit`);
  /* ⚠ the honesty fields: a trajectory is not telemetry, and the file has to say which craft are still
     being talked to. Two of them are not. */
  const lost = sc.craft.filter((c) => c.contact !== 'active').map((c) => c.key);
  assert.ok(lost.includes('pioneer10') && lost.includes('pioneer11'),
    'Pioneer 10/11 are marked as no longer in contact — their position is propagated, not tracked');
  assert.ok(/not telemetry/i.test(sc.warn), 'the manifest states that a trajectory is not telemetry');
});

/* HERMITE, NOT A CHORD: between two samples the interpolant matches the velocity at both ends. Hide the
   middle sample of three and rebuild it from the outer two — over TWICE the shipped step, so the figures
   are an upper bound (a cubic Hermite's error goes as h⁴). */
test('R213 ②: the interpolation reproduces a withheld sample better than a chord does', () => {
  const sc = json('data/spacecraft.json');
  const H = bodies()._kepler.hermite;
  const measure = (key) => {
    const c = sc.craft.find((x) => x.key === key);
    let worse = 0, n = 0, sumH = 0, sumC = 0;
    for (let i = 4; i + 2 < c.s.length; i += 37) {
      const A = c.s[i], M = c.s[i + 1], B = c.s[i + 2];
      const hp = H([A, B], M[0]).p;
      const f = (M[0] - A[0]) / (B[0] - A[0]);
      const cp = [0, 1, 2].map((k) => A[1 + k] + (B[1 + k] - A[1 + k]) * f);
      const eH = r3([hp[0] - M[1], hp[1] - M[2], hp[2] - M[3]]);
      const eC = r3([cp[0] - M[1], cp[1] - M[2], cp[2] - M[3]]);
      sumH += eH; sumC += eC; n++; if (eH > eC) worse++;
    }
    return { n, worse, h: sumH / n, c: sumC / n };
  };
  const v = measure('voyager1');
  assert.equal(v.worse, 0, 'never worse than a chord on Voyager 1');
  assert.ok(v.h * 20 < v.c, `Voyager 1: Hermite ${v.h.toExponential(2)} AU vs chord ${v.c.toExponential(2)} AU`);
  /* 2×10⁻⁶ AU is 300 km at 171 AU; the file itself is only stored to 10⁻⁷ AU */
  assert.ok(v.h < 1e-5, `and in absolute terms ${(v.h * 149597870.7).toFixed(0)} km over a 180-day span`);
  /* Parker Solar Probe — the hardest case, whipping round the Sun at 190 km/s */
  const p = measure('parker');
  assert.equal(p.worse, 0, 'never worse than a chord on Parker either');
  assert.ok(p.h * 2 < p.c, `Parker: Hermite ${p.h.toExponential(2)} AU vs chord ${p.c.toExponential(2)} AU (over 6 days; the shipped step is 3)`);
});

/* KEPLER, ON ALL THREE BRANCHES: at the time of perihelion the body is at exactly the perihelion
   distance the catalogue states — true of every orbit, and not produced by an accident. */
test('R213 ③: every orbit passes through its own published perihelion at its own published time', () => {
  const sb = json('data/small-bodies.json');
  const find = (id) => { const b = sb.bodies.find((x) => x.id === id); assert.ok(b, id + ' is in the file'); return b; };
  for (const [id, what] of [['1P', 'elliptic (Halley)'], ['1', 'elliptic (Ceres)'], ['2017 U1', "hyperbolic ('Oumuamua, e = 1.20)"],
    ['2019 Q4', 'hyperbolic (Borisov, e = 3.36)'], ['2023 A3', 'near-parabolic (Tsuchinshan-ATLAS, e = 1.0001)']]) {
    const b = find(id);
    assert.ok(isFinite(b.tp), what + ' has a time of perihelion');
    const r = r3(at(b, b.tp));
    assert.ok(Math.abs(r - b.q) / b.q < 0.002, `${what}: r(tp) = ${r.toFixed(5)} AU against q = ${b.q} AU`);
  }
  /* …and a closed orbit really closes: half a period after perihelion, Halley is at aphelion */
  const H = find('1P');
  const aph = r3(at(H, H.tp + H.per / 2));
  assert.ok(Math.abs(aph - H.a * (1 + H.e)) / aph < 0.01, `Halley's aphelion ${aph.toFixed(2)} AU = a(1+e)`);
  /* …and an unbound one never comes back */
  const O = find('2017 U1');
  assert.ok(r3(at(O, O.tp + 3000)) > 40, "'Oumuamua is 40+ AU away 3,000 days after perihelion");
  assert.ok(r3(at(O, O.tp + 6000)) > r3(at(O, O.tp + 3000)), 'and still receding');
  /* the populations the panel offers must all be present */
  const kinds = {}; for (const b of sb.bodies) kinds[b.kind] = (kinds[b.kind] || 0) + 1;
  for (const k of ['asteroid', 'comet', 'tno', 'hyperbolic']) assert.ok(kinds[k] > 0, `there are ${k}s (${kinds[k]})`);
  assert.ok(kinds.comet > 400, `every numbered comet is here (${kinds.comet})`);
  /* ⚠ the selection has to be stated, because "the biggest asteroids" is a claim about a cut */
  assert.match(sb.selection, /150 km/, 'the size cut behind the asteroid set is recorded');
  assert.match(sb.warn, /osculating/i, 'the manifest states what an osculating element set is not');
});

/* THE DEEP SKY HAS MEASURED DISTANCES, AND SAYS SO WHERE IT DOES NOT. */
test('R213 ④: deep-sky objects carry published distances, and nulls stay null', () => {
  const ds = json('data/deep-sky.json');
  const get = (alias) => ds.objects.find((o) => o.alias.includes(alias) || o.main === alias);
  const kpc = (o) => o.pc / 1000;
  const m31 = get('M  31'); assert.ok(m31, 'M31 is in the file');
  assert.ok(Math.abs(kpc(m31) - 780) < 120, `Andromeda at ${kpc(m31).toFixed(0)} kpc (published ≈ 780)`);
  const lmc = get('NAME LMC'); assert.ok(Math.abs(kpc(lmc) - 50) < 12, `the LMC at ${kpc(lmc).toFixed(1)} kpc (≈ 50)`);
  const m87 = get('M  87'); assert.ok(m87.pc / 1e6 > 12 && m87.pc / 1e6 < 22, `M87 at ${(m87.pc / 1e6).toFixed(1)} Mpc (≈ 16.5)`);
  const m42 = get('M  42'); assert.ok(m42.pc > 300 && m42.pc < 600, `the Orion Nebula at ${m42.pc.toFixed(0)} pc (≈ 410)`);
  /* ⚠ CLASSIFICATION IS PREFIX-SHAPED AND THE FIRST BUILD GOT IT WRONG: SIMBAD's `GlC` and `GiC` both
     begin with G, so a galaxy test anchored at ^G swallowed every globular and filed M13 as a galaxy. */
  assert.equal(get('M  13').cls, 'globular', 'M13 is a globular cluster, not a galaxy');
  assert.equal(get('M  57').cls, 'planetary', 'M57 is a planetary nebula');
  /* nothing is given an invented distance */
  const noDist = ds.objects.filter((o) => o.pc == null);
  assert.ok(noDist.length > 0, 'some objects genuinely have no published distance');
  assert.equal(ds.withDistance + noDist.length, ds.count, 'the manifest counts both groups');
  assert.ok(ds.objects.every((o) => o.pc == null || o.pc > 0), 'a distance is either published or absent — never zero');
  assert.match(ds.method, /median/i, 'the distance is stated to be a median of published measurements');
  assert.ok(ds.objects.filter((o) => o.dn > 1).length > 50, 'most distances are a median over several measurements');
});

/* THE CAMERA'S REACH IS A PROPERTY OF THE DATA. #R208 stopped at 48 pc and wrote down why; the ceiling
   may only move because there is now something out there. (#R215) the STAR catalogue is drawn at its
   parallax distances in every frame, so it raises the reach too — measured, the #R208 constant penned
   the camera three and a half times inside the furthest thing on screen. */
test('R213 ⑤: the zoom-out ceiling is derived from the furthest measured object', () => {
  /* RUN: reachAu/distCeil, with the catalogue maximum and the deep-sky population supplied */
  const make = (o) => liftSpace(['POS_P', 'posScale', 'AU_PER_PC', 'REACH_AU', 'reachAu', 'distCeil'],
    '{ REACH_AU, AU_PER_PC, reachAu, distCeil, posScale }',
    { mode: 'system', scale: 'model', starMaxPc: o.starMaxPc || 0, showDeep: !!o.deep, SB: () => (o.deep ? { deepFarAu: () => o.deep } : null), window: {} });
  const none = make({});
  assert.equal(none.reachAu(), none.REACH_AU, 'the #R208 constant is still the floor of the reach');
  const stars = make({ starMaxPc: 1000 });
  assert.equal(stars.reachAu(), 1000 * stars.AU_PER_PC, 'and the star catalogue, which is always drawn, raises it');
  const deep = make({ starMaxPc: 1000, deep: 5e12 });
  assert.equal(deep.reachAu(), 5e12 * 1.25, 'and with the deep-sky population on, the reach comes from that data');
  assert.equal(deep.distCeil(), deep.posScale(deep.reachAu()),
    'the ceiling goes through posScale like everything else — a raw AU limit means a different thing in each scale');
  const ds = json('data/deep-sky.json');
  const far = Math.max(...ds.objects.filter((o) => o.pc > 0).map((o) => o.pc)) * 206264.806;
  assert.ok(far > 1e7, `the furthest measured object is ${(far / 206264.806 / 1e6).toFixed(1)} Mpc — beyond #R208's 10⁷ AU`);
});

/* THE THREE POPULATIONS FETCH NOTHING UNTIL ASKED FOR, AND REPORT THEIR OWN STATE. */
test('R213 ⑥: the space populations are opt-in and carry loading/ok/error', () => {
  const B = bodies();
  for (const k of ['craft', 'small', 'deep']) {
    assert.equal(B.state(k), 'idle', k + ' has not been fetched');
    assert.equal(B.ready(k), false, k + ' is not ready');
  }
  /* nothing is drawn from an unloaded population — the #R212 rule that "not yet" is not "none" */
  assert.deepEqual(B.craftAt(2461262.5), []);
  assert.deepEqual(B.smallAt(2461262.5, {}), []);
  assert.deepEqual(B.deepSky(), []);
  assert.equal(B.deepFarAu(), 0);
  /* ⚠ READ (this half): the switches are the WebGL view's own chrome.
     ⚠ (#R218) INTENDED REPLACEMENT: 「宇宙を探索の表示6つは全部デフォルトでは選択状態に。」 #R213 defaulted
     these three OFF on cost grounds; the instruction settles the trade the other way. The per-switch
     loading/ok/error state is what makes that safe, and it is unchanged. */
  const space = read('js/space.js');
  assert.match(space, /let showCraft=true, showSmall=true, showDeep=true;/, 'all three default on');
  assert.match(space, /function popState\(k\)\{/, 'the button can report the fetch state');
  assert.match(space, /litOn\(b,on&&st==='ok'\)/, 'a switch that is on but still fetching does not look like a switch that is on and empty');
});

/* ═══ #R219 / #R222 THE SCALE SWITCH, THE COSMIC LADDER, THE SUBJECT ═══════════════════════════ */

/* #R207 carried `dist / systemDist()` across the switch, which is right inside the planets and wrong
   outside them (a factor of ~2,000 at the ceiling). The invariant is the distance in AU. */
test('R219 ② switching model ↔ true scale keeps the camera at the same real distance', () => {
  /* RUN: the scale mapping js/space.js actually uses (it used to be transcribed here) */
  const S = liftSpace(['POS_P', 'posScale', 'auOfDist'], '{ posScale, auOfDist, set scale(v){ scale=v; } }', { scale: 'model' });
  for (const au of [1, 30, 1e3, 1e5, 1e7, 1e12]) {
    S.scale = 'model';
    assert.ok(Math.abs(S.auOfDist(S.posScale(au)) - au) / au < 1e-9, 'model round trip at ' + au + ' AU');
    S.scale = 'real';
    assert.ok(Math.abs(S.auOfDist(S.posScale(au)) - au) / au < 1e-12, 'real round trip at ' + au + ' AU');
  }
});

test('R219 ③ the distance ladder is strictly increasing and ends at the particle horizon', () => {
  const C = loadScripts(['js/space-cosmos.js']).window.IntMapCosmos;
  assert.ok(C && Array.isArray(C.RUNGS) && C.RUNGS.length >= 8);
  for (let i = 1; i < C.RUNGS.length; i++)
    assert.ok(C.RUNGS[i][1] > C.RUNGS[i - 1][1], C.RUNGS[i][0] + ' must be further out than ' + C.RUNGS[i - 1][0]);
  /* every rung carries all five languages and a source — standing rule 3 and rule 4 */
  for (const [key, au, lbl, src] of C.RUNGS) {
    assert.ok(au > 0 && isFinite(au), key + ' has no radius');
    /* ⚠ (#R245) the label is a TUPLE HELD AS DATA (IntMapLang.pickArgs()), not an object keyed by
       language code: en, jp, de, ru, es, the order of every L(…) call site in the app. */
    assert.ok(Array.isArray(lbl), key + ' holds its label as a tuple, not a language-keyed object');
    ['en', 'jp', 'de', 'ru', 'es'].forEach((l, i) => assert.ok(lbl[i] && lbl[i].length > 2, key + ' is missing ' + l));
    assert.ok(src && src.length > 4, key + ' has no source');
  }
  /* the horizon: 46.5 Gly comoving, in AU. ⚠ NOT 13.8 Gly — the light travel time is not the radius. */
  const gly = C.HORIZON_AU / C.AU_PER_LY / 1e9;
  assert.ok(Math.abs(gly - 46.5) < 0.6, 'horizon is ' + gly.toFixed(1) + ' Gly, expected 46.5 comoving');
  /* `visible()` shows a handful at any camera distance, never everything and never nothing */
  for (const au of [1e2, 1e5, 1e9, 1e14]) {
    const v = C.visible(au);
    assert.ok(v.length >= 1 && v.length <= 6, 'at ' + au + ' AU: ' + v.length + ' rungs');
  }
  assert.equal(C.ring(5, 8).length, 24);
});

test('#R222 ⑤ the scale switch carries the FRAME EDGE, not the camera distance', () => {
  /* RUN: setScale itself, lifted with the scale mapping and the state it moves, on a view whose focus
     is a dot (so the AU rule alone decides — the body blend is #R221's and is left as it was) */
  const S = liftSpace(['POS_P', 'posScale', 'auOfDist', 'HALF_FRAME', 'setScale'],
    '{ setScale, auOfDist, HALF_FRAME, get dist(){ return dist; }, set dist(v){ dist=v; }, get scale(){ return scale; } }',
    { D2R: Math.PI / 180, mode: 'system', scale: 'model', dist: 0, gl: { deleteBuffer() {} }, orbitCache: {},
      focusRadius: () => 0, distFloor: () => 1e-9, distCeil: () => 1e30, systemDist: () => 70, refreshHUD: () => {} });
  const model = 182.2685;
  S.dist = model;
  const edgeModel = S.auOfDist(model * S.HALF_FRAME);
  assert.equal(S.setScale('real'), true);
  assert.equal(S.scale, 'real');
  assert.ok(Math.abs(S.auOfDist(S.dist * S.HALF_FRAME) - edgeModel) < 1e-6 * edgeModel,
    'the invariant is the real-space radius at the edge of the picture — the same planets stay in frame');
  S.setScale('model');
  assert.ok(Math.abs(S.dist - model) / model < 1e-6, 'and the round trip returns');
  /* ⚠ READ (this half): the half-frame tangent is named once, not re-typed at each use */
  assert.ok(/const HALF_FRAME=Math\.tan\(45\*D2R\/2\)/.test(SPACE_SRC), 'the half-frame tangent is named once');
});

test('#R222 ⑤ zooming in on a probe cannot hand the reader back to the Earth map', () => {
  /* RUN: the Earth is the subject only when nothing else is selected */
  const S = liftSpace(['earthIsSubject'], '{ earthIsSubject, set sel(v){ craftSel=v[0]; smallSel=v[1]; } }',
    { focus: 'earth', craftSel: null, smallSel: null });
  assert.equal(S.earthIsSubject(), true);
  S.sel = ['voyager1', null];
  assert.equal(S.earthIsSubject(), false, 'a selected spacecraft is the subject, even with the Earth in focus');
  S.sel = [null, '1P'];
  assert.equal(S.earthIsSubject(), false, '…and so is a selected small body');
  /* ⚠ READ (this half): autoMode switches the WebGL view's mode inside its frame loop */
  const am = SPACE_SRC.slice(SPACE_SRC.indexOf('function autoMode('), SPACE_SRC.indexOf('function setMode('));
  assert.ok(/craftSel\|\|smallSel/.test(am.replace(/\s/g, '')), '#R221’s body-mode guard is still there');
});

/* ⚠ READ, NOT RUN: pointer capture, drag thresholds and CSS custom properties are browser behaviour. */
test('#R222 ⑥ the space sheet has three stops and is dragged, not switched', () => {
  const sp = read('js/space.js');
  assert.ok(/setPointerCapture/.test(sp), 'a drag that leaves the handle keeps working');
  assert.ok(/pointerdown/.test(sp) && /pointermove/.test(sp) && /pointerup/.test(sp));
  assert.ok(/moved<8/.test(sp.replace(/\s/g, '')), 'a tap still cycles the stops');
  const css = read('css/intmap.css');
  assert.ok(/sp-col\.sp-max/.test(css), 'the third stop exists in the stylesheet');
  assert.ok(/--sp-sheet-h/.test(css), 'and the stops are one custom property');
  assert.ok(/sp-drag/.test(css), 'the transition is suppressed while dragging');
});

/* ⚠ READ, NOT RUN: the clock sheet is markup built by the WebGL view; 16px is about mobile zoom-on-focus. */
test('#R222 ⑥ the space clock is a three-row sheet with a unit on every step key', () => {
  const sp = read('js/space.js');
  assert.ok(/const STEP_U=/.test(sp), 'the three step units are named once');
  assert.equal((sp.match(/sp-step-l">'\+STEP_U/g) || []).length, 6, 'all six step keys carry their unit');
  const css = read('css/intmap.css');
  assert.ok(/sp-timebox \.sp-when\{[^}]*font-size:16px/.test(css.replace(/\s*\n\s*/g, ' ')) ||
    /sp-when\{[\s\S]{0,200}font-size:16px/.test(css),
    'the field is 16px, so a phone types into it instead of zooming into it');
});
