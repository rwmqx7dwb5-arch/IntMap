/* ============================================================================
 *  THE SKY — js/sky-model.js, js/theme-sky.js and js/limb-layer.js
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. js/sky-model.js is RUN. js/theme-sky.js and
 *    js/limb-layer.js drive the live renderer from inside page closures; those pins read the source.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import path, { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r202-checks.test.mjs (tests #1, #2, #3, #4, #5 of 17) ═══
    R202 — the sky is computed, the source is integrated, and the far plane reaches the horizon
    Twelve instructions, and the ones with physics or arithmetic behind them are checked by RUNNING
    that arithmetic rather than by asserting on the text that contains it:

      ① js/sky-model.js is pure — no DOM, no renderer — so the scattering integral runs here.
      ② src/tsunami-worker.js loads into a Node vm (the harness tests/r197-checks.test.mjs built), so
         the cell-averaged source is compared against the centre sample it replaces.

    The rest are seam checks of the kind this suite has used since #R162: a capability that is
    declared must be implemented, a contract method that is called must exist, and a value that two
    files have to agree on is derived from one of them rather than written down twice. */
{
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
}

/* ═══ from tests/r218-checks.test.mjs (tests #9, #10 of 28) ═══
    #R218 — source-level checks (Node only; no browser, no network)
    The rule this file follows is #R217's: where a round replaced a NUMERICAL METHOD, the test RUNS
    it rather than looking for its text. ①–④ execute real arithmetic (the streamline integrator, the
    ear clipper, the profile interpolation, the sky model). The rest check wiring and contracts that
    cannot be run without a renderer. */
{
/* ⚠ block comments are stripped before a "this string must NOT appear" test — a comment that
   explains a defect otherwise trips the check for the defect (#R216's own note). */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '');

/* ── ④ the sky: ozone is present, published, and only changes what it should ────────────── */
test('#R218 ④ ozone is in the optical depth of BOTH rays, and absorbs only', async () => {
  const s = code('js/sky-model.js');
  assert.match(s, /const BO = \[0\.650e-6, 1\.881e-6, 0\.085e-6\];/, 'the published Chappuis extinction is not there');
  assert.match(s, /ozone = \(h\) => Math\.max\(0, 1 - Math\.abs\(h - 25000\) \/ 15000\)/, 'the tent profile is not there');
  assert.match(s, /BO\[k\] \* \(odO \+ odOs\)/, 'ozone is not applied to both the view ray and the sun ray');
  /* …and it must not appear in any phase function: ozone scatters nothing */
  assert.equal(/pR[\s\S]{0,200}BO|BO[\s\S]{0,80}(pR|pM)/.test(s), false, 'ozone entered a phase function');
});
test('#R218 ④ …and it makes twilight bluer without moving the noon calibration', async () => {
  const src = read('js/sky-model.js');
  const load = async (code2) => (await import('data:text/javascript;base64,' + Buffer.from(code2, 'utf8').toString('base64'))).skyColour;
  const withO = await load(src);
  const noO = await load(src.replace('const BO = [0.650e-6, 1.881e-6, 0.085e-6];', 'const BO = [0,0,0];'));
  const br = (c) => c[2] / Math.max(1, c[0]);
  /* twilight: measurably bluer */
  const a = br(noO(-4, 0, 90, 20).rgb), b = br(withO(-4, 0, 90, 20).rgb);
  /* ⚠ (#R224) THE THRESHOLD MOVED BECAUSE THE REST OF THE MODEL GOT MORE ACCURATE, and the number is
     written down rather than quietly lowered. #R218 measured 1.042 → 1.190 (+14.3 %) with the march
     at 16 UNIFORM steps; that march under-sampled the dense air at low view elevations and part of
     what ozone was doing was making up for it. With #R224's density-warped march the ozone-free sky
     is ALREADY bluer at −4° (1.042 → 1.083) and ozone adds 1.083 → 1.136 (+4.9 %). The claim this
     test exists to defend — «ozone is what makes the blue hour blue, measurably» — is unchanged;
     what shrank is how much of it ozone had to carry alone. */
  assert.ok(b > a * 1.04, `ozone moved the blue/red ratio at −4° only from ${a.toFixed(3)} to ${b.toFixed(3)}`);
  /* noon: #R202's Cesium calibration must not move — the far end of the gradient stays put */
  const n0 = noO(75, 30, 90).rgb, n1 = withO(75, 30, 90).rgb;
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(n0[k] - n1[k]) <= 3,
    `ozone moved the noon sky by ${Math.abs(n0[k] - n1[k])} counts on channel ${k}`);
});
}

/* ═══ from tests/r223-checks.test.mjs (tests #1 of 14) ═══
    #R223 — source-level checks
    ⚠ These pin RELATIONS and CONTRACTS, not values this round happened to measure (#R199/#R203:
    a test that pins my own number falls over the next time the same instruction arrives). */
{

/* ── ① the white ground haze is gone, and one place says so ───────────────────────────────────── */
test('R223 ① the aerial haze is off on every basemap, from one function', () => {
  const s = read('js/theme-sky.js');
  const m = /function _aerial\(\)\{([^}]*)\}/.exec(s);
  assert.ok(m, '_aerial() must still exist — it is what _skyFollowCamera compares');
  assert.match(m[1], /ground:\s*1\s*,\s*horizon:\s*0/, 'ground-blend 1 and horizon-fog-blend 0 = off');
  assert.ok(!/_eyeAltM\(\)/.test(m[1]), 'the haze must not come back as a function of altitude');
  /* setSky still reads the pair from _aerial rather than writing literals */
  assert.match(s, /'horizon-fog-blend':fg\.horizon/);
  assert.match(s, /'fog-ground-blend':fg\.ground/);
  /* …and nothing else in the app turns it back on */
  const fs2 = read('js/flight-sim.js');
  assert.match(fs2, /'fog-ground-blend':1/, 'the flight sim already had it off and must keep it');
});
}

/* ═══ from tests/r226-checks.test.mjs (tests #5 of 5) ═══
    #R226 — the round's own contracts, checked in Node
    100 % means 100 % · a 1.0 km cell · one bilinear, prepared per row ·
    the limb was lilac because the march was coarse · progress is written when it changes. */
{
const root = new URL('../', import.meta.url);

/* ── ⑤ THE LIMB IS BLUE ───────────────────────────────────────────────────────────────────────────
   「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。」 (confirmed: 宇宙から見た地球の縁.)
   #R224 convergence-tested the GROUND ray and settled the march at 32. The limb ray — 2,200 km of
   air with all of it near the tangent point — was 20 counts short in BLUE at 32, which is the whole
   difference between a pale-blue collar and a pink one. Measured live on the shipped build at
   24,422 km: `horizon-color` = #cebfce, a mauve-grey ring. */
test('R226 ⑤ the sky march resolves the limb, and the limb comes out blue', async () => {
  const src = read('js/sky-model.js');
  const m = src.match(/const N = (\d+), M = (\d+), KWARP = (\d+);/);
  assert.ok(m, 'the march states its counts');
  assert.ok(+m[1] >= 256, `the view march resolves the limb (found N=${m[1]})`);
  const { skyColour, limbViewElev } = await import(new URL('js/sky-model.js', root));
  /* the band `horizon-color` is set from: a 6 km tangent ray seen from orbit, day side */
  for (const alt of [5.286e6, 24.422e6]) {
    const c = skyColour(80, alt, 90, limbViewElev(alt, 6000)).rgb;
    assert.ok(c[2] > c[0] && c[2] > c[1], `the sunlit limb at ${alt / 1e6} Mm is blue-dominant, got ${c.map(Math.round)}`);
    assert.ok(c[2] - c[0] >= 12, `and not merely neutral (B−R = ${(c[2] - c[0]).toFixed(1)})`);
  }
  /* and the far end of the same limb is still the deep blue that fades to space (#R222) */
  const hi = skyColour(80, 24.422e6, 90, limbViewElev(24.422e6, 55000)).rgb;
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(hi) < lum(skyColour(80, 24.422e6, 90, limbViewElev(24.422e6, 6000)).rgb), 'the limb darkens with height');
  /* #R224's ground finding is not walked back: a low-elevation daytime sky is still B>G>R */
  for (const ve of [1, 3, 5, 10]) {
    const c = skyColour(60, 0, 90, ve).rgb;
    assert.ok(c[2] > c[1] && c[1] > c[0], `sun 60°, view ${ve}°: ${c.map(Math.round)} is not B>G>R`);
  }
  /* …and a low Sun is still warm (#R224) */
  const set = skyColour(2, 0, 90, 3).rgb;
  assert.ok(set[0] > set[1] && set[1] > set[2], `sunset horizon ${set.map(Math.round)} should be R>G>B`);
});
}

/* ═══ from tests/r234-checks.test.mjs (tests #12 of 13) ═══
    R234 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).
    Where the claim is arithmetic rather than text, it is COMPUTED here rather
    than pinned to a number this round happened to produce (#R203/#R229). */
{

/* ── 6 · the atmosphere hands over while the camera is still moving ─────────────────────────── */
test('R234 atmosphere: the limb handover is asked every frame, not only at the settle', () => {
  const s = read('js/theme-sky.js');
  assert.match(s, /function _wireSkyFollow\(\)\{/, 'the follow is wired to the camera');
  assert.match(s, /R\.onCamera\('themesky\.follow',_skyFollowCamera,\{phase:'read'\}\)/,
    'through the runtime, in the read phase');
  assert.match(s, /_wireSkyFollow\(\);\s+\/\* \(#R234\)/, 'and it is armed when the sky is applied');
  /* ⚠ THE STRENGTHS WERE A MEASURED DECISION FROM #R187 / #R205 — and (#R241) the reader has since
     overruled both of them in words: 「大気にもやがかかりすぎ。地図をちゃんと見せろ」 and
     「衛生写真ではあっても、標準マップでは大気はなし」. A measurement answers 「どれくらい」, never
     「要るのか」. So the dark-map assertion is gone (the map basemap has no air at all now) and the
     satellite one asks what THIS test is really about — that the pass is still ON and still chosen
     by basemap. The numbers live in #R241 ④ (this file), with the screenshots that moved them. */
  assert.match(s, /'atmosphere-blend':\(sat\?_airRamp\(/, 'satellite still gets the renderer’s pass…');
  assert.match(s, /:0\)\}\);/, '…and the vector basemap gets none, by the reader’s instruction');
});
}

/* ═══ from tests/r236-checks.test.mjs (tests #6, #7 of 14) ═══
    R236 — the contracts this round established, checked against the source.

    ⚠ EVERY TEST HERE HAS BEEN RUN AGAINST THE UN-FIXED CODE AND SEEN TO FAIL
    (#R228's rule: a check that stays green when you undo the fix is not a check).

    ⚠⚠ AND THE FIRST GROUP DRIVES THE REAL SCHEDULER RATHER THAN GREPPING FOR IT.
    #R235's own lesson was that `_pathDeg`'s unit test passed while the caller threw
    its result away — «関数を検査しても配線は検査されない». The runtime is an
    ES module with one export, so the honest check is to RUN it: stub the four
    globals it touches, pump the frame clock by hand, and count. */
{
/* ⚠ comments quote the instructions, and the instructions quote the strings the checks look for
   (#R208/#R215/#R231/#R232/#R234/#R235 — EIGHT rounds of a check hitting its own explanation).
   Strip the comments and match the SYNTAX. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── 3 · the limb hands the rim back unless it is actually painting ───────────────────────────── */
test('R236 limb: a layer that cannot draw is removed and reported as a refusal', () => {
  const g = code(read('js/geo-engine.js'));
  assert.match(g, /if\(L\.imAlive\s*&&\s*!L\.imAlive\(\)\)\{/,
    'addLimb asks the layer whether it can draw before claiming success');
  assert.match(g, /limbDrawn\(id\)\{/, 'the adapter reports painted frames');
  assert.match(g, /limbDrawn:id=>A\(\)\.limbDrawn\?A\(\)\.limbDrawn\(id\):0/,
    '…and it is on the engine CONTRACT, or callers get a silent undefined (#R216)');
  const l = code(read('js/limb-layer.js'));
  assert.match(l, /imAlive\(\)\{\s*return\s*!dead\s*&&\s*!!prog;\s*\}/, 'the layer answers for itself');
  assert.match(l, /drawn\+\+;/, 'and counts only frames where the draw call issued');
});

test('R236 limb: the watchdog revokes on EVIDENCE (map frames), never on a timeout alone', () => {
  const t = code(read('js/theme-sky.js'));
  assert.match(t, /if\(mapFrames<8\)\{/,
    'with no frames from the map there is no evidence, so nothing is revoked');
  assert.match(t, /_applyLimb\._refused=true;/, 'the revocation is remembered for the session');
  /* the defect this guards: revoking purely because time passed would take the limb away from any
     reader whose map happened to be idle, since maplibre only repaints on demand. */
  assert.doesNotMatch(t, /setTimeout\(\(\)=>\{\s*if\(_limbPainting\(\)\) return;\s*_applyLimb\._refused=true;/,
    'the first, timeout-only version of the watchdog is gone');
});
}

/* ═══ from tests/r237-checks.test.mjs (tests #1, #2, #3 of 8) ═══
    R237 — the air over the disc, the front's resolution, the panel's shape, and the shape of
    string the positional audit cannot see.
    ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). A test that cannot fail
    is a comment with a runner attached. */
{
/* strip comments so a rule is never satisfied by prose ABOUT the rule — the trap #R235 hit eight
   times and #R236 hit once more. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── 1 · the atmosphere is drawn over the disc, not only beside it ──────────────────────────────
   「そもそも前まであったものがない」 — measured, the air over the daylight side of the globe had
   stopped being drawn when #R227 took the rim from maplibre. */
test('R237 limb: a ray that meets the planet is marched, not discarded', () => {
  const s = code(read('js/limb-layer.js'));
  /* #R227's discard was `if (discG >= 0.0 && (-b - sqrt(discG)) > 0.0) discard;` — the whole defect */
  assert.doesNotMatch(s, /discG\s*>=\s*0\.0\s*&&[^;]*discard/,
    'the planet-hit ray must no longer be thrown away');
  assert.match(s, /bool\s+onDisc/, 'the shader knows whether it is over the disc');
  assert.match(s, /if\s*\(onDisc\)\s*tMax\s*=\s*min\(tMax,\s*tHit\)/,
    'and it stops the march at the ground rather than inside the planet');
});

test('R237 limb: the composite is done in radiance, by inverting the tone map', () => {
  const s = code(read('js/limb-layer.js'));
  /* the background is READ, which is what #R227 could not do */
  assert.match(s, /uniform\s+sampler2D\s+u_bg/, 'the frame so far is an input');
  assert.match(s, /copyTexSubImage2D/, '…copied with a blit, not re-rendered');
  /* ⚠ copyTexImage2D RE-ALLOCATES; on a per-frame path that is the difference between a blit and a
     new texture every frame. The allocation must be guarded by a size change. */
  assert.match(s, /if\s*\(W!==bgW\|\|H!==bgH\)/, 'the texture is re-allocated only when the buffer resizes');
  /* the inverse tone map: L = -ln(1 - c^gamma)/exposure */
  assert.match(s, /bgL\s*=\s*-log\(/, 'the background is taken back to radiance');
  assert.match(s, /outL\s*=\s*mix\(bgL,\s*bgL\*T\s*\+\s*L,\s*strength\)/,
    'and the composite is L_bg*T + L_in, mixed by strength');
  /* ⚠ with a composite there is nothing to blend: the shader emits the ANSWER */
  assert.match(s, /gl\.disable\(gl\.BLEND\)/, 'the pass replaces rather than adds');
  assert.doesNotMatch(s, /blendFunc\(gl\.ONE,\s*gl\.ONE_MINUS_SRC_ALPHA\)/,
    "#R227's premultiplied source-over is gone with the alpha it needed");
});

/* ── 2 · the zoom cliff ─────────────────────────────────────────────────────────────────────────
   「ある程度までズームインすると途端に見えなくなってしまう」 — measured on the sweep: ownership
   flipped between z9 (eye 183 km) and z10 (eye 92 km), the 100 km shell. */
test('R237 limb: ownership is decided by globeness, not by the eye crossing 100 km', () => {
  const ts = code(read('js/theme-sky.js'));
  const ge = code(read('js/geo-engine.js'));
  /* the test that made the air vanish in one frame */
  assert.doesNotMatch(ts, /_eyeAltM\(\)\s*>\s*_ATM_TOP_M[\s\S]{0,40}return false/,
    'the eye-above-the-shell gate is gone from _limbOwnsRim');
  assert.match(ts, /_globeness\(\)\s*>\s*0[\s\S]{0,30}return false/, 'the gate is the globe itself');
  assert.doesNotMatch(ge, /if\(!\(eyeR>RT\)\)\s*return null/,
    'and the uniforms no longer refuse to answer from inside the shell');
  /* strength rides globeness, which is the SAME quantity maplibre multiplies its own pass by, so the
     two owners cannot disagree about when there is a globe */
  assert.match(ge, /strength:.*\*gness/, 'strength is tapered by globeness');
  assert.match(ge, /disc:.*\*gness/, '…and so is the disc term');
});
}

/* ═══ from tests/r238-checks.test.mjs (tests #1, #2 of 16) ═══
    R238 — the air that was still missing, the front that could only be a circle, the panel that
    read as three alternatives, and the floating things that now have somewhere to go.
    ⚠ EVERY TEST HERE WAS RUN AGAINST THE UNFIXED CODE FIRST (#R228's rule). A test that cannot fail
    is a comment with a runner attached. Where a check pins a RELATION rather than a value, it says
    so — #R237's chip constant is exactly what happens when a measurement of one browser is written
    into the source as if it were a fact about all of them. */
{
/* strip comments so a rule is never satisfied by prose ABOUT the rule — the trap that has now been
   hit nine times across #R208…#R237. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── 1 · ⑤ the band that was removed is back, and nothing else was moved to compensate ───────────
   「ちげーよ Maplibre固有の大気じゃねーよ だからふざけんな 一度つけてんのに勝手に外すな」

   ⚠⚠⚠ THE FIRST CUT OF THIS ROUND GOT THE CAUSE WRONG AND THIS TEST RECORDED THE WRONG FIX.
   It measured the globe as 25–27 % darker than it used to be, concluded the custom layer's disc air
   was too weak, and raised `_discStrength` 0.20 → 1. The darkness was real; the cause was not.
   Diffing R226 (the last round before #R227) against HEAD settled it: `_horizonColour`, `_skyColour`,
   `_limbHex`, `_horizonBlend` and `_eyeAltM` — every function that produces the band #R213–#R222
   built — are BYTE-FOR-BYTE IDENTICAL. Nothing about the band was rewritten. #R227 zeroed
   `atmosphere-blend`, the one property that carried it to the screen, so that its new layer would
   not add to it. That is the removal, and it was never asked for.

   So this test now checks the two halves of putting it back:
     · the zero is gone and the #R187/#R205 ramps are what is written;
     · `_discStrength` is #R237's 0.20 — the value the reader actually had — because raising it was
       a compensation for a wrong diagnosis, and with the band restored the two add up to 5 % of the
       disc past L235 (#R187's 「質感がチープ」 measure). Measured after: 2.7 %. */
test('R238b sky: the removed band is restored, and nothing was inflated to compensate', () => {
  const s = code(read('js/theme-sky.js'));
  assert.doesNotMatch(s, /'atmosphere-blend':\(limb\?0:/,
    'the band is not switched off to make room for the custom layer');
  assert.match(s, /'atmosphere-blend':\(sat/, 'the ramps are written in their pre-#R227 shape');
  const m = s.match(/function\s+_discStrength\s*\(\)\s*\{\s*return\s+([\d.]+)\s*;\s*\}/);
  assert.ok(m, '_discStrength is still a single-expression function');
  assert.equal(Number(m[1]), 0.20,
    'the custom layer keeps #R237\'s disc strength — restoring the band is the fix, not doubling the air');
  /* and the layer itself is untouched: this restores a removal, it does not undo #R227's own work */
  assert.match(s, /function _limbOwnsRim\(\)/, 'the app still draws its own limb');
  assert.match(s, /limb===_applySkyAtmosphere\._limb/, 'and the camera follow still tracks who owns it');
});

test('R238 sky: the rim is still gated on globeness, not on the eye height', () => {
  const s = code(read('js/theme-sky.js'));
  /* #R237 removed the 100 km shell test; this must not come back — it was the zoom cliff */
  assert.doesNotMatch(s, /_eyeAltM\(\)\s*>\s*_ATM_TOP_M/, 'the shell gate must stay gone');
  assert.match(s, /if\s*\(!\(_globeness\(\)\s*>\s*0\)\)\s*return\s+false/,
    'ownership follows the same globeness maplibre multiplies its own atmosphere by');
});
}

/* ═══ from tests/r240-checks.test.mjs (tests #1 of 9) ═══
    IntMap · R240 source-level checks
    Every assertion below is written against the MECHANISM that was wrong, not against a value this
    round happened to pick (#R203's rule). Each one fails on the tree as it stood before this round. */
{
const R = read;
/* comments out, so a claim in prose can never satisfy a check about code (#R166) */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══ ① THE ATMOSPHERE — «off» must not mean «no sun» ═══════════════════════════════════════════
   maplibre's globe atmosphere takes u_sun_pos from style.light and from nowhere else, so handing
   the light back to maplibre's default («anchor:viewport, position:[1.15,210,30]») switches the air
   off with the terminator. Measured, same camera, only the light changed:
       Congo    71,112,77  →  35,62,13
       Atlantic 44,105,134 →   2,51,72
   and on the vector basemap `_nightSideOff()` is ALWAYS true, so that globe never had air at all. */
test('R240 ① with the day/night side off the Sun is aimed at the camera, never un-aimed', () => {
  const t = R('js/theme-sky.js');
  const aim = t.slice(t.indexOf('function _aimSun()'), t.indexOf('function _aimSun()') + 900);
  assert.ok(aim, '_aimSun was not found');
  assert.match(aim, /_nightSideOff\(\)/, 'the switch is still what decides (#R214/#R215)');
  assert.doesNotMatch(code(aim), /setSunDirection\(null\)/,
    'null is maplibre’s own light, in the wrong frame — it takes the atmosphere with it');
  assert.match(code(aim), /camera\.getCenter\(\)/, 'off aims at the sub-camera point');
  assert.match(code(aim), /setSunDirection\(\{lng:c\.lng,lat:c\.lat\}\)/, 'so no terminator is on screen');
  /* …and a pan must re-aim it, or the terminator walks back into view */
  /* (#R241) the slice is longer because the follow gained the limb's zoom re-push above this block
     — the assertion is the same one. */
  const foll = t.slice(t.indexOf('function _skyFollowCamera()'), t.indexOf('function _skyFollowCamera()') + 4200);
  assert.match(code(foll), /_nightSideOff\(\)/, 'the follow knows about the un-aimed case');
  assert.match(code(foll), /_aimSun\._at/, 'and re-aims when the centre has moved');
});
}

/* ═══ from tests/r241-checks.test.mjs (tests #7, #8 of 11) ═══
    R241 — six reports, and the one that has now been sent five times
    ① 「簡体、繁体、フランス語、韓国語、ドイツ語、ロシア語、スペイン語について、すべての面において
       対応が完璧かどうか点検し、未了点があれば修正して。いつまでたっても言語対応の漏れが見つかる
       ことは許されない。」
    ② 「地震シミュレータの地震波伝播は断層破壊を考慮していない。震央からほぼ同心円状に広がるだけ。」
       → 「いや破壊速度 Vr ≤ 波速 Vだから同心円でオッケーですってどんな理屈やねんアホ」
    ③ 「サイドバーのパネル内モバイル版で、左に合ったスクロールバーが消えているから、つけて。」
    ④ 「MapLibreで大気にもやがかかりすぎ。地図をちゃんと見せろ。それに、ある程度までズームしたら
       いきなりもやが消えるものさらに不自然。」＋「衛生写真ではあっても、標準マップでは大気はなし」
    ⑤ 「各地の表内のJMAの背景の四角は、JMAで大きさをそろえるように。MMIはまた別の幅。」
       → 「左右に大きすぎに見えただけ。（テキストがとっている幅の割に）」
    ⑥ 「地震シミュレータの地点表が左右方向にスクロールできなくなっている。」

    ⚠ Every assertion here is written against a MECHANISM, and comments are stripped before the
    source is matched (`code()`), because this file quotes the instructions it is testing —
    [[intmap-recurring-lessons]] E, eight rounds running. */
{
const R = read;
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══ ④ THE AIR ═════════════════════════════════════════════════════════════════════════════════ */

test('R241 ④ the map basemap has no air at all, from either owner', () => {
  const t = code(R('js/theme-sky.js'));
  const blend = /'atmosphere-blend':\(sat[\s\S]{0,200}?\)\}\);/.exec(t);
  assert.ok(blend, 'the atmosphere-blend expression was not found');
  assert.match(blend[0], /:0\)\}\);/, 'the non-satellite basemap gets exactly 0, not a weaker ramp');
  assert.doesNotMatch(t, /_mapIsLight\(\)/, 'and the light/dark map branch is gone with it');
  /* js/limb-layer.js is the OTHER owner — 「縁の帯も消す」 means it too */
  const owns = t.slice(t.indexOf('function _limbOwnsRim()'), t.indexOf('function _limbOwnsRim()') + 400);
  assert.match(owns, /if\(!_airOn\(\)\) return false;/, 'the app-drawn limb is off over a vector basemap');
  assert.match(t, /function _airOn\(\)\{ try\{ return HOST\.mapType==='sat'/, '«is there air» has one owner');
});

test('R241 ④ one zoom curve, and it is zero before maplibre cuts the globe', () => {
  const t = code(R('js/theme-sky.js'));
  /* ⚠ THE MECHANISM: maplibre 5.24's `case 'globe'` is
       ['interpolate',['linear'],['zoom'], 11,'vertical-perspective', 12,'mercator']
     and `atmosphere-blend` — and js/geo-engine.js's limb strength — are multiplied by that
     transition. Whatever the air is worth at z11, all of it goes in one zoom level. #R240 held the
     ramp FLAT to z11 and made the step bigger; the curve now reaches 0 AT z11. */
  /* (maplibre-6-migration) THAT BAND IS MEASURED ON THE RUNNING RENDERER NOW, not read out of 5.24's
     dist/maplibre-gl-dev.js (6.x ships no such file): tests/maplibre-6-migration.spec.js ④ asks the
     live globe for its globeness at z10.9, z11.5 and z12.1 — 1, between, 0. If that moves, AIR_Z
     moves with it. */

  const air = /const AIR_Z=\[([^\]]+)\]/.exec(t);
  assert.ok(air, 'AIR_Z is the one zoom curve');
  const a = air[1].split(',').map(Number);
  const stops = {}; for (let i = 0; i + 1 < a.length; i += 2) stops[a[i]] = a[i + 1];
  const zs = Object.keys(stops).map(Number).sort((x, y) => x - y);
  assert.equal(stops[zs[0]], 1, 'the curve is normalised — 1 at the wide end');
  assert.ok(zs[zs.length - 1] <= 11, `the curve ends at z${zs[zs.length - 1]}; the globe ends at z11→12`);
  assert.equal(stops[zs[zs.length - 1]], 0, 'and it ends at zero, so the transition has nothing to take');
  for (let i = 1; i < zs.length; i++) {
    assert.ok(stops[zs[i]] <= stops[zs[i - 1]], `the curve must not rise (z${zs[i]})`);
  }
  assert.ok(stops[9] != null && stops[9] <= 0.1, 'and it is nearly out by z9, so the last step is small');

  /* TWO readers, ONE table — [[intmap-recurring-lessons]] G */
  assert.match(t, /function _airRamp\(peak\)/, 'the sky block reads AIR_Z as a maplibre expression');
  assert.match(t, /function _airAtZoom\(z\)/, 'and the limb layer reads the same stops in JS');
  assert.match(t, /setLimb\(_LIMB_ID,\{on:true,strength:az,disc:_discStrength\(\)\*az\}\)/,
    'the follow re-pushes the limb strength — a pure zoom moves nothing else in its comparison');

  const peak = /_airRamp\(([0-9.]+)\)/.exec(t);
  assert.ok(peak, 'the satellite peak is a number this file owns');
  assert.ok(+peak[1] < 0.55, `the satellite peak is ${peak[1]} — 「もやがかかりすぎ」 asked for less than #R187's 0.55`);
  assert.ok(+peak[1] > 0.2, `the satellite peak is ${peak[1]} — 「衛生写真ではあっても」, so not zero`);
});
}
