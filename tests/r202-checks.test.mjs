/* ============================================================================
 *  R202 — the sky is computed, the source is integrated, and the far plane reaches the horizon
 * ----------------------------------------------------------------------------
 *  Twelve instructions, and the ones with physics or arithmetic behind them are checked by RUNNING
 *  that arithmetic rather than by asserting on the text that contains it:
 *
 *    ① js/sky-model.js is pure — no DOM, no renderer — so the scattering integral runs here.
 *    ② src/tsunami-worker.js loads into a Node vm (the harness tests/r197-checks.test.mjs built), so
 *       the cell-averaged source is compared against the centre sample it replaces.
 *
 *  The rest are seam checks of the kind this suite has used since #R162: a capability that is
 *  declared must be implemented, a contract method that is called must exist, and a value that two
 *  files have to agree on is derived from one of them rather than written down twice.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── ① THE SKY, RUN ───────────────────────────────────────────────────────────────────────── */
const SKY = await import(new URL('../js/sky-model.js', import.meta.url));

test('R202 ①a the sky is blue in daylight and space at night — the defect this round is about', () => {
  const noon = SKY.skyColour(80, 10, 90).rgb;
  const night = SKY.skyColour(-20, 10, 90).rgb;
  /* the reported defect: at noon, from the ground, MapLibre's sky-color was #060b16 = (6,11,22) */
  assert.ok(noon[2] > 100, `a noon sky must be bright: got ${noon}`);
  assert.ok(noon[2] > noon[1] && noon[1] > noon[0], `and blue: got ${noon}`);
  assert.ok(night[2] < 12, `a deep-night sky is space: got ${night}`);
});

test('R202 ①b it falls with the Sun, monotonically, all the way through twilight', () => {
  const lum = (e) => { const c = SKY.skyColour(e, 10, 90).rgb; return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const el = [80, 60, 40, 20, 10, 5, 0, -3, -6, -12, -18];
  let prev = Infinity;
  for (const e of el) { const v = lum(e); assert.ok(v <= prev + 0.5, `sun ${e}° is brighter than the step above it (${v} > ${prev})`); prev = v; }
  assert.ok(lum(80) > 40 * lum(-12), 'and day and deep twilight are not the same picture');
});

test('R202 ①c …and with ALTITUDE, which is the half a two-hex ramp could never express', () => {
  const lum = (a) => { const c = SKY.skyColour(80, a, 90).rgb; return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ground = lum(10), high = lum(30000), space = lum(300000);
  assert.ok(ground > high * 3, `climbing out of the atmosphere must darken the sky: ${ground} vs ${high}`);
  assert.ok(space < 6, `and from 300 km it is space: ${space}`);
});

test('R202 ①d the calibration against Cesium is the one in the file, still', () => {
  /* Cesium's own SkyAtmosphere read [85,112,130] at the top of the frame for this camera and
     instant (test-results/r202/sky-cesium-noonLow.png). The model is fitted to it; this is the
     assertion that keeps a later exposure tweak from silently walking away from the measurement. */
  const c = SKY.skyColour(77.2, 2500, 90).rgb;
  assert.ok(Math.abs(c[0] - 85) <= 30 && Math.abs(c[1] - 112) <= 30 && Math.abs(c[2] - 130) <= 40,
    `model ${c} against Cesium [85,112,130]`);
});

test('R202 ①e no arrangement of camera, Sun and view direction returns NaN', () => {
  /* the one that caught a real defect: a ray pointing BELOW the horizon from exactly sea level. The
     near root of the ground intersection is t = 0 there, so a `t > 0` clip let the march run
     straight through the planet, exp(−h/H) overflowed and every channel came back NaN. */
  for (const [alt, ve, se] of [[0, -30, 40], [0, 0, 0], [1e6, 89, -90], [10, 55, 90], [400000, -80, 20],
    [0, -90, 90], [7e6, 55, 0], [-5, 55, 45], [10, 55, 720]]) {
    const r = SKY.skyColour(se, alt, 90, ve);
    assert.ok(r.linear.every((v) => isFinite(v) && v >= 0), `skyColour(${se},${alt},90,${ve}) = ${r.linear}`);
    assert.match(r.hex, /^#[0-9a-f]{6}$/, `and a real colour: ${r.hex}`);
  }
});

/* ── ② THE TSUNAMI SOURCE, RUN ────────────────────────────────────────────────────────────── */
function loadWorker(src) {
  const ctx = {
    self: { postMessage: () => {} },
    performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
    console, Math, Float32Array, Float64Array, Int32Array, Int16Array, Int8Array, Uint8Array,
    Number, Object, Array, isFinite, String, Error,
  };
  vm.createContext(ctx);
  vm.runInContext(src + '\n;globalThis.__api={run,okadaUz,faultGeom,seaFloor};', ctx, { filename: 'tsunami-worker.js' });
  return ctx.__api;
}
const flatOcean = (d, w, h) => {
  const rgb = new Uint8Array(w * h * 3), q = Math.round(d);
  for (let k = 0; k < w * h; k++) { rgb[k * 3] = q >> 8; rgb[k * 3 + 1] = q & 255; rgb[k * 3 + 2] = 255; }
  return { w, h, rgb };
};
const RUN = { id: 1, nx: 1440, ny: 640, lat0: -80, lat1: 80, dec: 8, hours: 0.25, frames: 24 };
const amp = (src, mw) => loadWorker(src).run({ ...RUN, bathy: flatOcean(4000, 720, 320), src: { lng: 143, lat: 38, mw, depthKm: 24 } }).amp;

/* ⚠ (#R204) THE QUADRATURE IS READ OUT OF THE FILE, NOT WRITTEN INTO THE TEST. Both of these pinned
   the literal `SUB_N = 3`, so #R204 — asked for MORE accuracy at the source, which is the direction
   this pair is about — broke the two tests whose subject is that accuracy. The same mistake #R203
   made with the 448 mesh and with `tests/r203.spec.js`. What is asserted now is the relation. */
const SUBLINE = /const SUB_N = (\d+), subR = 1\.5 \* g\.L;/;

test('R202 ②a the source is INTEGRATED over the cell, and it changes the answer', () => {
  const now = rd('src/tsunami-worker.js');
  const m = SUBLINE.exec(now);
  assert.ok(m, 'the quadrature is stated in one place');
  assert.ok(Number(m[1]) >= 3, `SUB_N is ${m[1]}; #R202 established 3 as the floor`);
  const centre = now.replace(m[0], 'const SUB_N = 1, subR = -1;');
  /* the smaller the rupture against a ~28 km cell, the more a centre sample aliases it */
  const a75 = amp(centre, 7.5), b75 = amp(now, 7.5);
  assert.ok(Math.abs(a75 - b75) / a75 > 0.1, `Mw 7.5: centre ${a75} vs averaged ${b75} — the point sample was not aliasing?`);
});

test('R202 ②b …and the quadrature that ships is converged', () => {
  const now = rd('src/tsunami-worker.js');
  const m = SUBLINE.exec(now);
  const at = (n) => amp(now.replace(m[0], `const SUB_N = ${n}, subR = 1.5 * g.L;`), 7.5);
  const shipped = amp(now, 7.5), seven = at(7);
  assert.ok(Math.abs(shipped - seven) / seven < 0.03, `${m[1]}×${m[1]} ${shipped} against 7×7 ${seven} — not converged`);
  /* …and no coarser than the one before it: #R202 shipped 3, and its own table puts 3 at 1.5 % of
     the converged value while 5 is at 0.3 %, which is why #R204 raised it. */
  const three = at(3);
  assert.ok(Math.abs(shipped - seven) <= Math.abs(three - seven) + 1e-9,
    `${m[1]}×${m[1]} is further from converged than 3×3 was`);
});

/* ── ③ THE SEAMS ──────────────────────────────────────────────────────────────────────────── */
test('R202 ③a orbit3d: declared by both engines, implemented by both, reached only through the contract', () => {
  const ge = rd('js/geo-engine.js'), ce = rd('js/cesium-engine.js');
  assert.match(ge, /orbit3d:true/, 'MapLibre declares it');
  assert.match(ce, /orbit3d:true/, 'and so does Cesium');
  for (const m of ['addOrbit', 'setOrbit', 'removeOrbit', 'projectMercAlt']) {
    assert.match(ge, new RegExp(`${m}\\s*\\(`), `js/geo-engine.js implements ${m}`);
    assert.match(ce, new RegExp(`${m}\\s*\\(`), `js/cesium-engine.js implements ${m}`);
  }
  /* the custom layer is the ADAPTER's business — nothing outside geo-engine may name it (#R173) */
  const users = ['js/satellites-live.js', 'js/data-layers.js', 'js/app-body.js']
    .filter((f) => /IntMapModules\.orbitPoints/.test(rd(f)));
  assert.deepEqual(users, [], `only js/geo-engine.js may reach for the orbit layer; ${users} does`);
});

test('R202 ③b the pick projects at ALTITUDE, or it picks something that is not on screen', () => {
  const s = rd('js/satellites-live.js');
  assert.match(s, /projectMercAlt/, 'pickAt goes through the batched altitude projection');
  assert.match(s, /orbMercAlt|orbRate/, 'and it holds the same mercator/altitude triples the layer drew');
  /* the rate has to exist for the layer to move between propagations */
  assert.match(s, /lng2/, 'propagateAll carries the one-second-later fix');
  assert.match(s, /eciToGeodetic\(\{x:pv\.position\.x\+pv\.velocity\.x/, 'derived from the ECI velocity, not a second SGP4');
});

test('R202 ③c the satellite layer is in a group somebody would open', () => {
  const dl = rd('js/data-layers.js');
  /* ⚠ (#R259) THE LITERAL LIST BECAME A PROPERTY. #R259 added `osmspace` (spaceports and satellite
     ground stations) to this shelf — 「1行だけのグループはカテゴリではない」 — and a list literal
     asserts «and nothing else, ever», which is not what #R202 was claiming. The claim is that `sats`
     has a group of its own and is not filed under the ocean. */
  const og = /\['lyrGrpOrbit',\[([^\]]*)\]\]/.exec(dl);
  assert.ok(og && og[1].includes("'sats'"), 'sats is in its own group');
  assert.doesNotMatch(dl, /lyrGrpMaritime',\[[^\]]*'sats'/, 'and no longer under Oceans & maritime');
  /* ⚠ (#R239) SAME CLAIM, NEW HOME — every keyed string moved into js/locales/ui.<code>.js.
     The `Object.assign(i18n.en…es,{…})` shape this test read was five languages by
     construction, and fr/ko/zh fell back to English for ~170 keys declared that way
     (scripts/i18n-keyed-audit.mjs). Nine locale files is the stricter form of the same
     question. (#R203: move the assertion, say why.) */
  for (const c of ['en', 'jp', 'de', 'ru', 'es', 'fr', 'ko', 'zh', 'zh-hans']) {
    assert.ok((() => { const t = rd('js/locales/ui.' + c + '.js'); return t.includes('lyrGrpOrbit:') || t.includes('"lyrGrpOrbit":'); })(), `the group is named in ${c}`);
  }
});

test('R202 ③d the selected mobile segment is white on black, in both themes', () => {
  const css = rd('css/intmap.css');
  const light = css.match(/\.m-seg-btn\.active\{([^}]*)\}/);
  const dark = css.match(/\[data-theme="dark"\] \.m-seg-btn\.active\{([^}]*)\}/);
  assert.ok(light && dark, 'both rules exist');
  for (const [name, m] of [['light', light], ['dark', dark]]) {
    assert.match(m[1], /background:#fff/, `${name}: white background`);
    assert.match(m[1], /color:#000/, `${name}: black text`);
  }
});

test('R202 ③e the space HUD shows both scales and takes any multiplier', () => {
  const s = rd('js/space.js');
  assert.match(s, /class="sp-scale" data-s="real"/, 'true scale is its own segment');
  assert.match(s, /class="sp-scale" data-s="model"/, 'and so is model scale');
  assert.match(s, /function parseRate/, 'the multiplier is parsed from free text');
  assert.match(s, /class="sp-rate"/, 'and there is a field to type it into');
  assert.match(s, /function rateStep/, 'the ladder steps both ways');
  /* ⚠ the defect rateStep replaces: ⏪ read RATES[i+1] exactly as ⏩ did, so nothing could slow down */
  assert.doesNotMatch(s, /sp-back'\)\.onclick=\(\)=>\{ const i=RATES\.indexOf/, 'the old one-way ladder is gone');
  assert.match(s, /sp-live/, 'and Live is a control of its own');
});

/* ── ③f THE GESTURE-TIME RESOLUTION CUT IS GONE (#R229) ───────────────────────────────────────────
   This asserted that js/render-scale.js was mobile-only, deferred and correctly armed — three rounds
   (#R202, #R221, #R227) refined HOW it lowered the map's resolution while the camera moved, and none
   of them asked WHETHER it should. Its own header quotes 「速度、画質を高めて。どちらか一方犠牲はNG」
   and then answers it by cutting the resolution to 70 % during every gesture, on the argument that
   splitting the trade in time is not a sacrifice. That argument was invented here, not agreed.
   「外せ」「なぜ確認しなかった」— the module is deleted and the map is always at full resolution. */
test('R202 ③f the gesture-time resolution cut is gone (#R229) and stays gone', () => {
  /* ⚠ the SYNTAX, not the mention — the comments that replaced this code name the thing they removed,
     which is the whole point of them (#R227's `code()` helper exists for the same reason) */
  assert.ok(!fs.existsSync(path.join(ROOT, 'js/render-scale.js')), 'js/render-scale.js must not exist');
  assert.doesNotMatch(rd('src/main.js'), /import\s+['"][^'"]*render-scale\.js['"]/, 'nothing imports it');
  assert.doesNotMatch(rd('js/label-occlusion.js'), /IntMapModules\.renderScale\s*\(/, 'nothing mounts it');
});

test('R202 ③g the far plane is corrected from a PRISTINE value, never from its own output', () => {
  const ge = rd('js/geo-engine.js');
  assert.match(ge, /setHorizonReach/, 'the contract has it');
  assert.match(ge, /autoCalculateNearFarZ/, 'and it only multiplies while the transform is calculating automatically');
  assert.match(ge, /clearNearFarZOverride/, 'clearing first');
  assert.match(ge, /Math\.min\(60,mult\)/, 'with a ceiling, so depth precision has a floor');
});

test('R202 ③h the timing tables finally have a writer, and it cannot delete what it did not see', () => {
  const sp = rd('scripts/shard-plan.mjs'), bl = rd('scripts/baseline.mjs'), ci = rd('.github/workflows/ci.yml');
  /* (#R203) the ten steps a browser shard runs moved into a composite action when the suite grew a
     second tier — one copy of the recipe, two callers. The restore/merge half of this lives there. */
  const act = rd('.github/actions/browser-tier/action.yml');
  assert.match(sp, /has\('--merge'\)/, 'shard-plan can union the per-shard fragments');
  assert.match(bl, /has\('--merge'\)/, 'and so can baseline');
  assert.match(sp, /carried over/, 'a partial fragment set must not drop the specs it does not mention');
  assert.match(ci, /timings:/, 'and CI has the job the comment has been promising since #R195');
  /* ⚠ AND IT DOES NOT COMMIT THEM. The first version pushed to main and came back GH013: the
     «Protect main» ruleset requires a pull request and status checks and lists no bypass actors.
     That rule is right, and a DERIVED measurement is the wrong thing to weaken it for — so the
     tables travel by cache, which a pull-request run can read from the default branch. */
  assert.doesNotMatch(ci, /git push origin HEAD:main/, 'nothing in CI pushes to main');
  assert.match(ci, /actions\/cache\/save@v4/, 'the measured times are published as a cache');
  assert.match(act, /actions\/cache\/restore@v4[\s\S]{0,200}intmap-timings-/, 'and the browser job restores them');
  assert.match(act, /--merge _timecache\/durations\.json/, 'merging them into the committed table before planning');
});

test('R202 ③i the seismic mesh got finer, and the sky model is not wired twice', () => {
  /* ⚠ (#R203) A RELATION, NOT A VALUE. This pinned 448 exactly, so the very next round that made the
     mesh finer — the direction the instruction always points — broke a test whose own subject is
     "it got finer". What #R202 established is the FLOOR; #R203 raised the mesh to 640/288. */
  /* ⚠ (#R204) …AND A RELATION ABOUT THE GRID, NOT ABOUT THE LINE THAT DECLARES IT. #R203 fixed the
     VALUE and left the regex pinning one exact source line, so #R204 — which replaced the fixed grid
     with a cell size and a floor/ceiling — broke it again for the same reason. What both rounds mean
     by "finer" is the FLOOR: the coarsest grid this code can ever choose. */
  const seisN = /const CELL_KM=[\d.]+, N_MIN=\(_mob\?(\d+):(\d+)\), N_MAX=\(_mob\?(\d+):(\d+)\);/.exec(rd('js/seismic.js'));
  assert.ok(seisN, 'the intensity field still declares its grid floor and ceiling');
  assert.ok(Number(seisN[2]) >= 448, `the desktop intensity field floor is ${seisN[2]}, coarser than #R202's 448`);
  assert.ok(Number(seisN[1]) >= 192, `the mobile intensity field floor is ${seisN[1]}, coarser than #R202's 192`);
  const th = rd('js/theme-sky.js');
  /* (#R222) the import list grew by `limbViewElev` — the assertion is that the model is imported BY
     NAME (not re-implemented, not reached through a global), which a wider list satisfies. */
  assert.match(th, /import \{ skyColour[^}]*\} from '\.\/sky-model\.js'/, 'theme-sky imports the model by name');
  assert.match(th, /'sky-color':sc/, 'and sky-color comes from it');
  assert.doesNotMatch(th, /'sky-color':_SKY_SPACE/, 'the constant deep-space sky is gone');
});

test('R202 ③j the build stamps name THIS round', () => {
  /* #R174: both stamps sat at R171 through two rounds, so a reload could not be told apart from a
     stale cache. The exact pin lives in the CURRENT round's file and becomes the negative form in
     the next one (tests/r201-checks ⑥ is now that negative form).
     ⚠ AND THIS IS WHY THE WHOLE NODE SUITE RUNS AFTER EVERY CHANGE, NOT ONCE. This round bumped the
     stamp late, re-ran only the two check files it thought were involved, and shipped a red CI: the
     assertion that broke was the PREVIOUS round's pin, in a file nobody had reason to look at. */
  const idx = rd('index.html');
  /* (#R203) …and this is now the NEGATIVE form, which is what the paragraph above says happens to it. */
  assert.doesNotMatch(idx, /window\.__imBuild='R202';/, 'the build marker must move every round');
  assert.doesNotMatch(idx, /window\.INTMAP_BUILD='2026-08-08-R202';/, 'and so must the dated stamp');
});
