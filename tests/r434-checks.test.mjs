/* ============================================================================
 *  R434 — the aircraft mark tilts with the map, and a wide view buys new sky
 * ----------------------------------------------------------------------------
 *  「地図を傾けても、航空レイヤーの飛行機アイコンが同じ向きなのを修正して。傾けてるのに上から
 *    見たときとおなじとかあほかボケ。また、より低ズームでもより多くの航空機が表示されるように。」
 *
 *  THE SAME TWO SENTENCES FOR THE THIRD TIME (#R401, #R411, here), and the first one is now
 *  unambiguous: the mark must not be the picture it is at pitch 0. Both earlier rounds used HALF of
 *  the same 2×2 — #R401 kept the projected ANGLE and left the silhouette its full plan-view size,
 *  #R411 kept only the rotation, which pure pitch does not move at all. Measured in the running
 *  application with #R411's shader (tests/r379.spec.js, probe at the canvas centre, sprite 128 px):
 *
 *      pitch                       0°       60°
 *      drawn angle              45.0°     45.0°      ← the report, as one number
 *      the projection says      45.0°     63.5°
 *      mark's own area        1368 px   1368 px
 *
 *  Not "close to" the flat picture: THE flat picture. What ①–③ below pin is the whole transform —
 *  the plan-form lying in the aircraft's own horizontal plane — together with the one thing that
 *  must not follow the projection all the way, which is a mark squashed thinner than the width at
 *  which this shader stops drawing an aeroplane at all.
 *
 *  ④–⑥ are the second sentence. The viewport channel's budget is unchanged, because the provider's
 *  is; what was wrong is that BOTH halves of "spend it on what?" were decided by the wrong quantity.
 *
 *  ⚠ EVERY SOURCE CHECK READS CODE ONLY (scripts/code-only.mjs) — this file's own prose contains
 *  most of what it greps for.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { readLF } = await import('../scripts/eol.mjs');
const { codeOnly } = await import('../scripts/code-only.mjs');
const code = (rel) => codeOnly(readLF(join(ROOT, rel)));

const CLOUD = code('js/aircraft-points.js');
const FEED = code('supabase/functions/aviation-feed/index.ts');
const vertOf = () => {
  const m = /const VERT = `([\s\S]*?)`;/.exec(CLOUD);
  assert.ok(m, 'the vertex shader source is still a template literal named VERT');
  return m[1];
};
const fragOf = () => {
  const m = /const FRAG = `([\s\S]*?)`;/.exec(CLOUD);
  assert.ok(m, 'the fragment shader source is still a template literal named FRAG');
  return m[1];
};
/* a GLSL scalar expression, as a JS function — the same lift tests/r411-checks.test.mjs ③ uses on
   the anti-aliasing line, and the reason these are GATES rather than second copies */
function glslExpr(src, decl, args) {
  const m = new RegExp('float ' + decl + ' = ([^;]+);').exec(src);
  assert.ok(m, 'the shader still declares `' + decl + '` in one place');
  /* ⚠ THE TEMPLATE HOLE IS FILLED FROM THE JS CONSTANT IT NAMES, which is the part that makes this
     a gate on the SHIPPED number: change LOD_DOT_PX and this arithmetic changes with it. */
  const lod = /const LOD_DOT_PX = (\d+);/.exec(CLOUD);
  assert.ok(lod, 'the LOD threshold is a named constant');
  const js = m[1]
    .replace(/\$\{LOD_DOT_PX\.toFixed\(1\)\}/g, (+lod[1]).toFixed(1))
    .replace(/\bclamp\(/g, 'CLAMP(').replace(/\bmin\(/g, 'Math.min(')
    .replace(/\bmax\(/g, 'Math.max(').replace(/\babs\(/g, 'Math.abs(');
  assert.ok(!js.includes('${'), 'nothing else in `' + decl + '` is a template hole');
  // eslint-disable-next-line no-new-func
  return new Function('CLAMP', ...args, 'return ' + js + ';')
    .bind(null, (x, lo, hi) => Math.max(lo, Math.min(hi, x)));
}

/* ── ① THE MARK'S OWN AXES, PROJECTED ────────────────────────────────────────────────────────
   The pixels are tests/r379.spec.js's — a source check cannot see a rendered frame. What is here is
   the SHAPE of the derivation: the two ground steps still span the Jacobian, the track turns that
   basis into the mark's starboard and nose, the largest singular value normalises it, and the
   fragment shader is handed the INVERSE so one matrix multiply replaces a per-pixel rotation. */
test('R434 ① the vertex shader builds the mark\'s two axes and hands over the inverse', () => {
  const v = vertOf();
  assert.match(v, /vec2 F = st \* dE \+ ct \* dN;/, 'the nose is the track, in the ground basis');
  assert.match(v, /vec2 R = ct \* dE - st \* dN;/, 'and starboard is a right angle from it');
  assert.match(v, /float s1 = sqrt\(max\(0\.0, 0\.5 \* \(tr \+ sqrt\(/,
    'the larger singular value of [R F] is what the pair is normalised by');
  assert.match(v, /v_minv = vec4\(fw\.y, -rw\.y, -fw\.x, rw\.x\) \/ det;/,
    'and the varying is that 2×2 INVERTED — once per aircraft, not once per pixel');
  /* ⚠ NOT A ROTATION ANY MORE. A single angle cannot carry a squash, so a `v_rot` reappearing here
     is the #R411 behaviour coming back whatever it is called. */
  assert.ok(!/\bv_rot\b/.test(v), 'no single angle survives into the fragment shader');
  assert.ok(!/\bv_rot\b/.test(fragOf()), '…and none is read there');

  const f = fragOf();
  assert.match(f, /mat2 minv = mat2\(v_minv\.xy, v_minv\.zw\);/, 'the fragment shader rebuilds it');
  assert.match(f, /planeSD\(minv \* q, g\)/, 'and samples the field through it');
});

/* ── ② THE EDGE IS STILL ONE PIXEL, AND THE PIXEL IS ON THE SCREEN ───────────────────────────
   `planeSD` measures in the MARK's units, and under foreshortening one of those is worth as little
   as LOD_DOT_PX/v_px of a screen pixel — so a ramp of a fixed number of mark-units is a ramp of a
   fraction of a pixel across the squashed axis, which is an aliased edge. #R411's whole round was
   about this edge; keeping its declaration and dividing by the field's own screen gradient is what
   leaves the flat map bit-for-bit unchanged (the gradient is exactly 1 where minv is a rotation)
   while holding the ramp at one pixel on a steep one. */
test('R434 ② the anti-aliasing ramp is measured through the same transform', () => {
  const f = fragOf();
  assert.match(f, /float aa = 1\.0 \/ max\(v_px, 1\.0\);/,
    '#R411\'s one-pixel declaration is untouched — tests/r411-checks.test.mjs ③ evaluates it');
  assert.match(f, /aa \*= length\(vec2\(dot\(minv\[0\], g\), dot\(minv\[1\], g\)\)\);/,
    'and it is scaled by how fast the field runs across the SCREEN at this pixel');
  assert.match(f, /float planeSD\(vec2 p, out vec2 grad\)\{/, 'the field reports its own gradient');
  assert.match(f, /grad = nb \* inversesqrt\(max\(d, 1e-12\)\);/, 'as a unit vector, guarded at the outline');
  /* ⚠ THE NEAREST POINT HAS TO BE TRACKED, NOT JUST THE DISTANCE. `d = min(d, dot(b,b))` keeps the
     number and throws away the direction, and a gradient recovered from the wrong edge is a ramp
     measured along the wrong axis. */
  assert.match(f, /if \(dd < d\) \{ d = dd; nb = b; \}/, 'the winning edge is remembered');
  assert.ok(!/d = min\(d, dot\(b, b\)\);/.test(f), 'and the distance-only form is gone');
});

/* ── ③ THE FLOOR, AND WHY IT IS A BLEND RATHER THAN A CLAMP ──────────────────────────────────
   The sprite's SIZE does not fall off with distance — that is deliberate, it is what makes every
   aircraft legible — so its foreshortening must not be allowed to run away either: an aircraft near
   the horizon of a steep view would keep its full width and be squashed to a fraction of a pixel
   across. The floor is the layer's own LOD threshold, and it is reached by mixing the transform
   towards its polar ROTATION, which is exactly the mark #R411 shipped. */
test('R434 ③ the squash stops where the shader stops drawing an aeroplane', () => {
  const v = vertOf();
  /* ONE declaration of the threshold, injected into both shaders */
  assert.match(CLOUD, /const LOD_DOT_PX = 5;/, 'the LOD threshold is a named constant');
  assert.match(CLOUD, /kmin = min\(1\.0, \$\{LOD_DOT_PX\.toFixed\(1\)\} \/ max\(px, 1\.0\)\)/,
    'the vertex shader reads it from there');
  assert.match(CLOUD, /if \(v_px < \$\{LOD_DOT_PX\.toFixed\(1\)\}\)/,
    '…and so does the fragment shader, so the two cannot drift apart');

  const kmin = glslExpr(v, 'kmin', ['px']);
  const tOf = glslExpr(v, 't', ['kmin', 'k']);
  /* the sizes the layer actually draws at: sizePx 11 is its default, 3.5–43 its ramp, and v_px is
     that times the device pixel ratio */
  assert.equal(+kmin(5).toFixed(6), 1, 'a mark at the LOD threshold is not squashed at all');
  assert.equal(+kmin(11).toFixed(4), 0.4545, 'at the default size on a 1× screen the floor is 5/11');
  assert.equal(+kmin(22).toFixed(4), 0.2273, 'and half that on a 2× one, because it has the pixels');

  /* ⚠ AND IT IS INERT WHERE THE MARK IS BIG, which is where a reader is looking at aeroplanes
     rather than at traffic. At the centre of the screen the ground foreshortens to cos(pitch), so
     against the layer's own size ramp (3.5 px at z0 … 42.9 px from z9, times the device ratio):

         v_px                       11      16      22      43      86
         floor  = 5/v_px         0.455   0.313   0.227   0.116   0.058
         held at pitch 78°       0.455   0.313   0.227   0.208   0.208   ← 0.208 is the projection
         held at pitch 60°       0.500   0.500   0.500   0.500   0.500   ← untouched

     So the tilt a reader sees is exact everywhere up to about 63° whatever the screen, exact at
     every tilt once the mark is drawn at 40 px or more, and held short of the projection only where
     the alternative is a sliver. A floor that fired everywhere would be a clamp wearing a blend's
     clothes; this one is off in most of the table. */
  const cos78 = Math.cos(78 * Math.PI / 180), cos60 = Math.cos(60 * Math.PI / 180);
  const held = (px, k) => { const t = tOf(kmin(px), k); return (1 - t) * k + t; };
  assert.deepEqual([11, 16, 22, 43, 86].map((px) => +held(px, cos78).toFixed(3)),
    [0.455, 0.313, 0.227, 0.208, 0.208], 'the short axis at pitch 78, by mark size');
  assert.deepEqual([11, 16, 22, 43, 86].map((px) => +held(px, cos60).toFixed(3)),
    [0.5, 0.5, 0.5, 0.5, 0.5], 'and at pitch 60, where the floor never fires');
  assert.equal(tOf(kmin(43), cos78), 0, 'a mark drawn at 43 px follows the projection exactly');

  /* ⚠ AND IT REACHES THE FLOOR EXACTLY. `mix(A, R, t)` is R·((1−t)S + tI) for the polar factor
     A = R·S, so it lifts BOTH singular values to (1−t)σ + t; with σ₁ normalised to 1 that leaves
     σ₁ alone and takes σ₂ from k to (1−t)k + t. This is the identity the one line rests on, so it
     is checked as an identity rather than asserted as a comment. */
  for (const px of [8, 11, 22, 44]) {
    for (const k of [1e-4, 0.01, 0.05, 0.2, 0.5, 0.9, 1]) {
      const t = tOf(kmin(px), k);
      const got = (1 - t) * k + t;
      const want = Math.max(k, kmin(px));
      assert.ok(Math.abs(got - want) < 1e-9,
        'px ' + px + ', k ' + k + ': the short axis lands on ' + got.toFixed(6) + ', wanted ' + want.toFixed(6));
      assert.ok(got * px >= Math.min(px, 5) - 1e-9,
        'px ' + px + ', k ' + k + ': the mark never gets thinner than the LOD threshold');
    }
  }
});

/* ── ③ b THE OTHER ENGINE CANNOT DO THIS, AND THAT IS ARITHMETIC ─────────────────────────────
   Cesium draws the aircraft as billboards, and BillboardCollectionVS sizes an axis-aligned quad and
   THEN rotates it — so every image it can produce is (rotation × diagonal), while the image of a
   plan-form lying in the ground plane is (diagonal × rotation). The two families agree only where
   the rotation is a multiple of a right angle. The quantity below is what a reader would see: the
   artwork's wingspan and fuselage are square, and this is how far out of square the projection puts
   them. js/cesium-engine.js states the same table beside `_airHeading`. */
test('R434 ③ b the shear a billboard cannot express is most of the shape at tilt', () => {
  const outOfSquare = (pitchDeg, trackDeg) => {
    const cp = Math.cos(pitchDeg * Math.PI / 180);
    const T = trackDeg * Math.PI / 180, st = Math.sin(T), ct = Math.cos(T);
    const dE = [1, 0], dN = [0, cp];
    const F = [st * dE[0] + ct * dN[0], st * dE[1] + ct * dN[1]];
    const R = [ct * dE[0] - st * dN[0], ct * dE[1] - st * dN[1]];
    const cos = (F[0] * R[0] + F[1] * R[1]) / (Math.hypot(...F) * Math.hypot(...R));
    return Math.abs(90 - Math.acos(Math.abs(cos)) * 180 / Math.PI);
  };
  const at45 = [0, 30, 60, 78].map((p) => +outOfSquare(p, 45).toFixed(1));
  assert.deepEqual(at45, [0, 8.2, 36.9, 66.5], 'the mark\'s own axes, out of square, at track 045°');
  /* the same rotation-only answer is what js/cesium-engine.js keeps, and it says so */
  const ces = code('js/cesium-engine.js');
  assert.match(ces, /return th-track;/, 'Cesium still returns the rotation alone');
  const rot = /_airHeading\(p,track\)\{([\s\S]*?)\n {4}\}/.exec(ces);
  assert.ok(rot, '_airHeading is still a method of the engine');
  assert.ok(!/width\s*=|height\s*=/.test(rot[1]),
    'and does not pretend to a squash by resizing the quad, which is the #R401 failure again');
});

/* ── ④ THE LEDGER RECORDS THE ASK, NOT THE CATCH ─────────────────────────────────────────────
   Two thirds of the planet is ocean without receiver coverage. A tile that answered "nothing here"
   thirty seconds ago is not the same as one nobody has ever looked at, and a ledger that only
   remembered aircraft could never tell them apart — so a wide view would spend its whole budget on
   the same empty water for ever. */
test('R434 ④ every completed tile read stamps the sky it asked about, wherever it came from', () => {
  assert.match(FEED, /markAsked\(tiles\[i\]\.lat, tiles\[i\]\.lon, at\);/,
    'readSerial stamps each tile it actually read');
  /* ⚠ THE WRITERS ARE NAMED BY COUNTING THE DOOR, NOT THE CALLERS (#R504 widened this). Upstream
     reads reach the ledger through readSerial — the ONE place both the viewport channel and the
     lattice sweep go through, so a ledger only one of them wrote would lie about half the sky (the
     #R411 ① c shape); hydration seeds it from the shared snapshot (#R434 addendum); and #R504's
     persisted ledger restores it from Storage. Three writers, and the cap and the latest-wins rule
     have to hold for all of them — so what is counted is the single assignment they must all go
     through. A fourth writer that does its own STATE.asked.set() is what this forbids. */
  const doors = (FEED.match(/STATE\.asked\.set\(/g) || []).length;
  assert.equal(doors, 1, 'the ledger has exactly one assignment, in stampCell (found ' + doors + ')');
  assert.match(FEED, /function markAsked\(lat, lon, at\) \{[\s\S]*?stampCell\(askCell\(lat, lon\), at\);/,
    'markAsked is the lat/lon door onto it');
  const serials = (FEED.match(/await readSerial\(/g) || []).length;
  assert.equal(serials, 2, 'and both upstream readers go through readSerial (found ' + serials + ')');
  /* the stamp is inside the loop and AFTER the rate-limit check, because a 429 taught us nothing */
  const rs = /async function readSerial\(provider, tiles\) \{([\s\S]*?)\n\}/.exec(FEED);
  assert.ok(rs, 'readSerial is still one function');
  assert.ok(rs[1].indexOf('RATE_LIMITED') < rs[1].indexOf('markAsked'),
    'a refused read does not count as having looked');

  /* the cell grain, evaluated from the shipped expression */
  const m = /const askCell = \(lat, lon\) =>\s*([\s\S]*?);\n/.exec(FEED);
  assert.ok(m, 'askCell is one expression');
  const deg = +(/const ASK_CELL_DEG = (\d+);/.exec(FEED) || [])[1];
  assert.equal(deg, 2, 'the ledger\'s grain is 2° — about half a 250 nm tile');
  // eslint-disable-next-line no-new-func
  const askCell = new Function('ASK_CELL_DEG', 'lat', 'lon', 'return ' + m[1] + ';').bind(null, deg);
  assert.equal(askCell(35.0, 139.0), askCell(35.6, 139.6), 'sky within one cell is one entry');
  assert.notEqual(askCell(35.0, 139.0), askCell(38.0, 139.0), 'three degrees north is different sky');
  assert.equal(askCell(0, 180), askCell(0, -180), 'and the antimeridian is not a seam');
});

/* ── ④ b …AND A COLD ISOLATE INHERITS IT FROM THE SNAPSHOT ──────────────────────────────────
   Supabase hands out cold isolates often enough that the function treats isolate memory as not a
   cache at all (the snapshot exists for exactly that reason). An empty ledger makes a cold isolate
   decide the view centre is the stalest sky on the planet and spend its one read there, whatever
   the shared snapshot already holds — measured in production immediately after this round
   deployed, three consecutive polls of one wide view were answered by three isolates reporting
   askedCells 3, 0 and 0. An aircraft observed in a cell at time T is proof somebody asked about
   that cell at least at T, so hydration can seed the ledger with no new state and no new format. */
test('R434 ④ b the hydrated snapshot seeds the ledger, so a cold isolate does not restart the walk', () => {
  const hyd = /function hydrate\(msg\) \{([\s\S]*?)\n\}/.exec(FEED);
  assert.ok(hyd, 'hydrate is still one function');
  assert.match(hyd[1], /markAsked\(msg\.lat\[i\], msg\.lon\[i\], seenAt\);/,
    'every hydrated aircraft stamps the sky it was seen in, at the time it was seen');
  /* ⚠ THE LATEST WINS. Hydration arrives out of order — fifty aircraft in one cell carry fifty
     observation times — so an unconditional set would leave the OLDEST of them in the ledger and
     make well-covered sky look stale. */
  /* (#R504) the rule is unchanged; it moved one function inwards so all three writers obey it. */
  const mk = /function stampCell\(key, at\) \{([\s\S]*?)\n\}/.exec(FEED);
  assert.ok(mk, 'stampCell is the one place the ledger is written');
  assert.match(mk[1], /if \(at > prev\) STATE\.asked\.set\(key, at\);/, 'the latest stamp wins');
  assert.ok(!/^\s*STATE\.asked\.set\(askCell\(lat, lon\), at\);/m.test(mk[1]),
    'and the unconditional write is gone');
  assert.match(mk[1], /if \(STATE\.asked\.size >= ASK_MAX\) STATE\.asked\.clear\(\);/,
    'the cap is inside the one door, so no writer can miss it');
  const mk2 = /function markAsked\(lat, lon, at\) \{([\s\S]*?)\n\}/.exec(FEED);
  assert.ok(mk2, 'markAsked is still one function');
  assert.match(mk2[1], /if \(!\(at > 0\) \|\| lat == null \|\| lon == null\) return;/,
    'a record with no position and no time stamps nothing');
});

/* ── ⑤ A WIDE VIEW WALKS ACROSS ITSELF INSTEAD OF RE-READING ITS MIDDLE ──────────────────────
   The simulation below is the real `tilesForBbox` and the real ranking, lifted out of the shipped
   file, over the bbox the application really reports for Japan at z3 (tests/r411-checks.test.mjs ①
   measured that box in the running app). What it counts is patches of sky bought per ten polls. */
test('R434 ⑤ ten polls of the same wide view buy twenty-four patches of sky, not four', async () => {
  globalThis.window = globalThis.window || {};
  await import('../js/aviation-model.js');
  const M = globalThis.IntMapAviationModel || globalThis.window.IntMapAviationModel;

  const num = (name) => {
    const m = new RegExp('const ' + name + ' = (\\d+);').exec(FEED);
    assert.ok(m, name + ' is a named constant');
    return +m[1];
  };
  const MAX = num('VIEW_MAX_TILES'), FAN = num('VIEW_FAN'), DEG = num('ASK_CELL_DEG');
  const RADIUS = num('RADIUS_NM'), LAT = num('LAT_LIMIT');
  assert.equal(MAX, 4, 'the per-read budget is unchanged — the provider\'s is');

  const rank = /const ranked = cands\n([\s\S]*?);\n/.exec(FEED);
  assert.ok(rank, 'the ranking is one expression');
  // eslint-disable-next-line no-new-func
  const rankFn = new Function('cands', 'askedAt', 'VIEW_MAX_TILES',
    'const ranked = cands' + rank[1] + '; return ranked;');

  const cell = (t) => Math.round(t.lat / DEG) * 1000 + Math.round((((t.lon + 540) % 360) - 180) / DEG);
  const BOX = [43.568, -15.743, 232.432, 75.347];   /* Japan at z3, as the app reports it */

  /* what #R341 did: the same `max` tiles, nearest the centre, every time */
  const before = new Set();
  for (let poll = 0; poll < 10; poll++) {
    for (const t of M.tilesForBbox(...BOX, RADIUS, MAX, LAT)) before.add(cell(t));
  }
  /* what it does now: rank a wider fan by when that sky was last asked about */
  const ledger = new Map();
  const after = new Set();
  for (let poll = 0; poll < 10; poll++) {
    const cands = M.tilesForBbox(...BOX, RADIUS, MAX * FAN, LAT);
    const picked = rankFn(cands, (la, lo) => ledger.get(cell({ lat: la, lon: lo })) || 0, MAX);
    assert.equal(picked.length, MAX, 'a poll still spends exactly ' + MAX + ' tiles');
    for (const r of picked) { after.add(cell(r.t)); ledger.set(cell(r.t), poll + 1); }
  }
  assert.equal(before.size, MAX, 'ten polls used to buy the same ' + MAX + ' patches (' + before.size + ')');
  assert.equal(after.size, MAX * FAN, 'and now buy ' + MAX * FAN + ' (' + after.size + ')');
  /* ⚠ THE FIRST POLL IS UNCHANGED, which is what makes this a widening and not a different answer:
     an empty ledger leaves the sort on the tie-break, and the tie-break is tilesForBbox's own
     centre-out order. A narrow view — one that has only `max` candidates — never moves at all. */
  const first = rankFn(M.tilesForBbox(...BOX, RADIUS, MAX * FAN, LAT), () => 0, MAX);
  const centre = M.tilesForBbox(...BOX, RADIUS, MAX, LAT);
  assert.deepEqual(first.map((r) => cell(r.t)), centre.map(cell),
    'a cold ledger still reads the middle of the view first');
});

/* ── ⑥ THE READ IS NOT STARTED UNLESS IT IS WANTED ───────────────────────────────────────────
   `once()` hands back a RUNNING promise, not a thunk. #R341 built it above the branch and let
   `boxStale` decide only whether the caller waited — so four upstream reads went out on every
   request that missed the 15 s cache, which is three times the whole measured burst budget and
   therefore a 429 and RATE_BACKOFF_MS of silence for every channel at once. */
test('R434 ⑥ the viewport spends the burst budget once per VIEW_STALE_S, for the whole function', () => {
  assert.match(FEED, /function once\(key, make\) \{\s*const running = STATE\.inflight\.get\(key\);/,
    'once() is still the single-flight, and still starts what it is handed');
  const view = /if \(channel === "view"\) \{([\s\S]*?)\n {4}\}\n/.exec(FEED);
  assert.ok(view, 'the viewport channel is still one block');
  const body = view[1];
  /* ⚠ (#R504) THE CONDITION KEPT ITS JOB AND CHANGED ITS NAME. `spaced` asked "has the whole
     function waited VIEW_STALE_S?"; that was a fact about the PROVIDER wearing a constant named
     after the sky, and it was measured at a fifth of what the provider grants. It is now a token
     taken from the one bucket — still global, still synchronous, still decided before anything
     awaits, and now it also says HOW MANY tiles may go. */
  const gate = body.indexOf('if (grant > 0) {');
  assert.ok(gate > 0, 'the decision is one condition');
  assert.ok(body.indexOf('await once(key,') > gate,
    'and the read is built INSIDE it, not above it');
  assert.ok(!/const work = once\(/.test(body), 'nothing holds a started read outside the branch');

  /* the ceiling is the function's, not the bbox's: the budget belongs to one address */
  assert.match(body, /const grant = worthIt \? takeTokens\(ranked\.length, now\) : 0;/,
    'the ceiling is global, and it is the same bucket the lattice sweep draws from');
  assert.ok(!/const spaced = /.test(FEED),
    'the old per-45-s spacing is gone — see tests/r504-checks.test.mjs ④');
  assert.match(body, /const spent = ranked\.slice\(0, grant\);/,
    'and the read is over what was granted, not over what was ranked');
  assert.match(body, /STATE\.viewReadAt = now;\n\s*await once\(/,
    '…and is stamped BEFORE the await, so two callers in one tick cannot both pass');
  assert.match(body, /const worthIt = ranked\.length > 0 && \(now - stalest\) \/ 1000 > VIEW_STALE_S;/,
    'and the read has to be worth something: the stalest chosen tile is actually stale');
  /* ⚠ WHAT IS GONE, NAMED SO IT CANNOT COME BACK. Deciding by the freshest aircraft ANYWHERE in the
     box is what made a view containing Europe never read and a view over open ocean read on every
     cache miss. */
  assert.ok(!/const boxStale =/.test(FEED), 'the box-wide freshness gate is gone');
  assert.ok(!/!inBox\.length \|\|/.test(FEED), '…and so is "an empty box is always worth four reads"');
});
