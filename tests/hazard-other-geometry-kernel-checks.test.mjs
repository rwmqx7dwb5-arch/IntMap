/* ============================================================================
 *  GEOMETRY KERNELS — the streamline integrator, the ear clipper and the river-name closure, RUN
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A HAZARD SUBJECT. These tests were in round files assigned to the hazards/simulator
 *  consolidation; the `hazard-` prefix only keeps this file from colliding with the other
 *  consolidations. The owning subject is named in the title — merge it there when both exist.
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The kernels are RUN. The one pin left (#R218 ② «the
 *    bound is taken ONCE») has no observable: the fan after the loop covers whatever an early exit
 *    leaves, so the triangle count is n−2 either way — measured by restoring the old bound, which
 *    this suite does not see.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* ═══ from tests/r218-checks.test.mjs (tests #1, #2, #3, #4, #5, #26, #27 of 28) ═══
    #R218 — source-level checks (Node only; no browser, no network)
    The rule this file follows is #R217's: where a round replaced a NUMERICAL METHOD, the test RUNS
    it rather than looking for its text. ①–④ execute real arithmetic (the streamline integrator, the
    ear clipper, the profile interpolation, the sky model). The rest check wiring and contracts that
    cannot be run without a renderer. */
{
/* ⚠ block comments are stripped before a "this string must NOT appear" test — a comment that
   explains a defect otherwise trips the check for the defect (#R216's own note). */
const code = (p) => codeOnly(read(p));

/* ── ① the streamline integrator, RUN against a field whose answer is known ─────────────── */
test('#R218 ① a solid-body rotation field integrates to a circle, to better than 1 %', () => {
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('js/streamline.js'), ctx, { filename: 'streamline.js' });
  const S = ctx.window.IntMapStreamline;
  assert.ok(S && S.sampler && S.trace && S.spacingIndex, 'js/streamline.js publishes nothing');

  const NX = 41, NY = 41, W = -20, So = -20, dx = 1, dy = 1;
  const u = new Float64Array(NX * NY), v = new Float64Array(NX * NY);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const lo = W + i * dx, la = So + j * dy;
    const x = lo * S.KM_PER_DEG_LNG * S.cosLat(la), y = la * S.KM_PER_DEG_LAT;
    u[j * NX + i] = -y / 500; v[j * NX + i] = x / 500;          /* rotation about (0,0) */
  }
  const sample = S.sampler({ W, S: So, dx, dy, NX, NY, u, v });
  const seed = [0, 10];
  const r = S.trace(sample, seed, { sign: 1, hKm: 20, maxSteps: 400, vMin: 0.001,
    bounds: { W: -20, E: 20, S: -20, N: 20 } });
  assert.equal(r.pts.length, 401, 'the trace stopped early in a field with no boundary');
  const r0 = S.kmBetween(0, 0, seed[0], seed[1]);
  let worst = 0;
  for (const p of r.pts) worst = Math.max(worst, Math.abs(S.kmBetween(0, 0, p[0], p[1]) - r0) / r0);
  assert.ok(worst < 0.01, `a circle came back with ${(worst * 100).toFixed(2)} % radius error`);
});
test('#R218 ① …a hole in the field is interpolated from the corners that HAVE a value, and nothing else', () => {
  const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read('js/streamline.js'), ctx, { filename: 'streamline.js' });
  const S = ctx.window.IntMapStreamline;
  const g = { W: 0, S: 0, dx: 1, dy: 1, NX: 2, NY: 2,
    u: [1, 1, 1, NaN], v: [0, 0, 0, NaN], t: [10, 10, 10, NaN] };
  const s = S.sampler(g);
  assert.ok(s(0.1, 0.1), 'a cell with three good corners has no answer');
  assert.equal(s(0.1, 0.1).u, 1, 'the renormalised weights changed a value every corner agreed on');
  const dead = S.sampler({ W: 0, S: 0, dx: 1, dy: 1, NX: 2, NY: 2, u: [NaN, NaN, NaN, NaN], v: [NaN, NaN, NaN, NaN] });
  assert.equal(dead(0.5, 0.5), null, 'a cell with NO data returned a number');
});
test('#R218 ① …and the evenly-spaced rule actually rejects a nearby seed', () => {
  const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(read('js/streamline.js'), ctx, { filename: 'streamline.js' });
  const S = ctx.window.IntMapStreamline;
  const idx = S.spacingIndex(100);
  idx.add(0, 0);
  assert.equal(idx.tooClose(0, 0.4), true, '44 km away was not rejected at d_sep = 100 km');
  assert.equal(idx.tooClose(0, 1.9), false, '210 km away was rejected at d_sep = 100 km');
});

/* ── ② the ear clipper: the guard that used to expire, on rings big enough to expire it ──── */
test('#R218 ② triangulate() covers the whole ring at every size — the guard no longer runs out', () => {
  const src = read('js/solid3d.js');
  const ringArea = /function ringArea\(p\)\{[^\n]*\r?\n/.exec(src)[0];
  const fn = /function triangulate\(p\)\{[\s\S]*?\r?\n  \}/.exec(src)[0];
  const tri = new Function(ringArea + '\n' + fn + '\nreturn triangulate;')();
  for (const n of [64, 276, 300, 400, 800]) {
    const ring = [];
    for (let i = 0; i < n; i++) { const t = i / n * 2 * Math.PI, r = 0.3 + 0.06 * Math.sin(5 * t);
      ring.push([0.5 + r * Math.cos(t), 0.5 + r * Math.sin(t)]); }
    const out = tri(ring);
    assert.equal(out.length / 3, n - 2, `a ${n}-vertex cap came back with a hole (${out.length / 3} of ${n - 2} triangles)`);
  }
});
test('#R218 ② …and the bound is taken ONCE, from the original length', () => {
  const s = code('js/solid3d.js');
  assert.match(s, /const guardMax=idx\.length\*idx\.length\+256;/, 'the guard is not hoisted');
  assert.equal(/guard\+\+<idx\.length\*idx\.length\+256/.test(s), false,
    'the loop bound is still re-evaluated against the shrinking ring');
});
test('#R218 ⑧ the river course is asked about the river, not about the pixel', () => {
  const rc = code('js/river-course.js');
  assert.match(rc, /async function course\(clickedProps,lngLat,opts\)/, 'course() takes no context');
  assert.match(rc, /opts\.names&&opts\.names\.size/, 'the whole closure name set is not used');
  assert.match(rc, /function _minKmToAny\(geo,pts\)/, 'a candidate is still measured against the click alone');
  assert.match(rc, /_overpass\(names,lng,lat,bbox\)/, 'the Overpass box is still drawn round the click');
  const mu = code('js/map-ui.js');
  assert.match(mu, /RC\.course\(props,lngLat,\{ names:allNames, nameList:allList, anchors, bbox:_riverBbox\(tile\) \}\)/,
    'map-ui does not hand the closure over');
});
test('#R218 ⑧ …and the name closure itself is the same for every segment of one river', () => {
  const ctx = { console, fetch: async () => ({ ok: false }) };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('js/river-course.js'), ctx, { filename: 'river-course.js' });
  const RC = ctx.window.IntMapRiverCourse;
  const segs = [
    { properties: { name: 'Donau', 'name:en': 'Danube', class: 'river' } },
    { properties: { name: 'Duna', 'name:en': 'Danube', class: 'river' } },
    { properties: { name: 'Duna', class: 'river' } },
    { properties: { 'name:en': 'Danube', class: 'river' } },
    { properties: { name: 'Donau', class: 'ditch' } },
    { properties: { name: 'Rhein', 'name:en': 'Rhine', class: 'river' } },
  ];
  let first = null;
  for (const i of [0, 1, 2, 3]) {
    const picked = RC.sameRiver(segs[i].properties, segs, { limit: 100 });
    const names = new Set();
    picked.forEach((f) => RC.nameSet(f.properties).forEach((n) => names.add(n)));
    const key = [...names].sort().join('|');
    if (first == null) first = key; else assert.equal(key, first, `segment ${i} asks a different question`);
    assert.equal(picked.length, 4, `segment ${i} matched ${picked.length} of the 4 river ways`);
  }
});
}
