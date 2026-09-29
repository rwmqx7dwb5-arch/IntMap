/* ============================================================================
 *  IntMap · line of sight and the point-to-point link (js/viewshed.js)
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r176-checks ② and tests/r183-checks (the link).
 *  #R176 ② — the old engine stopped each of 900 rays at the FIRST ridge and joined the stopping points
 *  into one polygon, so nothing beyond a ridge could ever be drawn as visible.
 *  #R183 — the link runs at the DEM's native zoom, ranks obstacles against the Fresnel radius, shares
 *  the sweep's four verdicts, solves the minimum mast, and never lets a DEM gap vote.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { lazyFiles } from './app-source.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { liftFunction } from './helpers/lift-function.mjs';

const root = new URL('../', import.meta.url);
const ROOT = fileURLToPath(root);
const R = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = R;
const entry = R('src/main.js');
const LAZY = lazyFiles(root);
const reached = (rel) => entry.includes(`import '../${rel}';`) || LAZY.includes(rel);
const body = [R('js/app-body.js'), R('js/geo-engine.js'), R('js/camera-math.js')].join(String.fromCharCode(10));
const instantiated = () => body + String.fromCharCode(10) + R('js/lazy-modules.js');
const los = R('js/viewshed.js');

/* ── ② Line of sight ────────────────────────────────────────────────────────────────────────────
   The old engine stopped each of 900 rays at the FIRST ridge and joined the stopping points into one
   polygon, so nothing beyond a ridge could ever be drawn as visible and the coverage edge was
   straight-line-interpolated across 419 m at 60 km. */
test('R176 ②: the viewshed answers per raster cell, not per bearing', () => {
  /* ⚠ READ, NOT RUN: the sweep reads DEM tiles through the renderer and paints a raster; its per-sample rule and helpers are asked of the text. */
  assert.ok(existsSync(join(ROOT, 'js/viewshed.js')), 'the engine has its own file');
  assert.ok(reached('js/viewshed.js'), 'loaded by the Vite entry, or fetched on demand by js/lazy-modules.js');
  assert.match(instantiated(), /window\.IntMapModules\.los\((IM_HOST)\);/, 'and instantiated under the same factory name');
  assert.doesNotMatch(R('js/map-tools.js'), /window\.IntMapModules\.los=function/, 'and no longer defined in map-tools.js');
  /* a ray is never truncated: every sample is classified, so a valley beyond a ridge can come back */
  assert.match(los, /if\(angTgt>=hznAng-1e-12\)\{ c=VIS; \}/, 'each sample is tested against the running horizon');
  assert.match(los, /if\(angTerr>hznAng\)\{ hznAng=angTerr; hznIdx=s; hznH=hTerr; hznD=d; \}/, 'which is updated by TERRAIN, not by the target');
  /* the four things the old panel could not express */
  assert.match(los, /const dropAt=\(d,k\)=>d\*d\/\(2\*k\*R_EARTH\);/, 'curvature with a settable effective-earth factor');
  assert.match(los, /const fresnel1=\(lam,d1,d2\)=>Math\.sqrt\(lam\*d1\*d2\/Math\.max\(1e-9,d1\+d2\)\);/, 'first Fresnel radius');
  assert.match(los, /function knifeEdgeDb\(v\)\{/, 'ITU-R P.526 knife-edge diffraction');
  assert.match(los, /tgtH\?Math\.atan2\(hTerr\+tgtH-obsElev,d\):angTerr/, 'and a target height, not just an observer height');
  /* no-data must not become sea level — that invents a hole and reports it as visible */
  assert.match(los, /if\(h==null\)\{ demMissing\+\+; continue; \}/, 'a missing DEM sample is left unanswered');
  /* the tile budget must stay under the DEM cache cap, or the cache evicts what the sweep is reading */
  assert.match(los, /const budget=mob\?130:500,/, 'the tile budget fits inside the 560-tile LRU (#R19)');
  /* five languages (standing instruction 3) */
  const L5 = los.match(/L\(/g) || [];
  assert.ok(L5.length > 25, 'the panel is written through the 5-language helper');
  /* (#R221) the hand-rolled five-argument helper became the shared, variadic one — which is what
     makes a sixth language possible at all (js/lang-registry.js). The claim is unchanged. */
  assert.match(los, /window\.IntMapLang\.pick\(\(\)=>HOST\.lang\)/, 'EN/JP/DE/RU/ES');
});

/* -- js/viewshed.js -- the point-to-point link ------------------------------------------------- */
const LOS = los;

test('R183: the link runs at the DEM native zoom, which the area sweep cannot', () => {
  /* ⚠ READ, NOT RUN: linkRun fetches DEM tiles over the network and draws on the map. */
  // A line's tile count grows with LENGTH, not area, so a profile can afford terrarium's z15 where
  // the 360-degree sweep must back off to stay inside the tile-cache budget (#R176: exceeding it
  // evicts the tiles the sweep is still reading). That is the precision claim, so pin it.
  const fn = LOS.slice(LOS.indexOf('async function linkRun('), LOS.indexOf('function drawLinkOnMap('));
  assert.match(fn, /let z=15/, 'the profile starts at the DEM maximum');
  assert.match(fn, /while\(z>6/, 'and only backs off for a link long enough to blow the budget');
  assert.match(fn, /demElevBilinear/, 'samples are bilinear, like the sweep');
});

/* EVALUATED: `judgeProfile` is lifted out of the comment-stripped js/viewshed.js together with the
   four physical helpers it calls (curvature, first Fresnel radius, ITU-R P.526 knife edge, and the
   sweep's diffraction threshold), each taken from the file rather than retyped. */
function judge() {
  const s = codeOnly(LOS);
  const one = (re, what) => { const m = re.exec(s); assert.ok(m, what + ' is no longer one declaration in js/viewshed.js'); return m[0]; };
  const src = [
    one(/const R_EARTH=[^,;]+[,;]/, 'R_EARTH').replace(/,$/, ';'),
    one(/const DIFF_DB=[^;]+;/, 'DIFF_DB'),
    one(/const dropAt=[^;]+;/, 'dropAt'),
    one(/const fresnel1=[^;]+;/, 'fresnel1'),
    liftFunction(s, 'knifeEdgeDb'),
    liftFunction(s, 'judgeProfile'),
  ].join('\n');
  return new Function(src + '\nreturn { judgeProfile, DIFF_DB, knifeEdgeDb };')();
}
/* a 10 km path at 100 m, with obstacles at the given distances and heights */
const profile = (bumps) => {
  const out = [];
  for (let d = 0; d <= 10000; d += 100) out.push({ d, h: 0 });
  for (const [d, h] of bumps) out[Math.round(d / 100)].h = h;
  return out;
};
const LAM_5G8 = 299792458 / 5.8e9;

test('R183: the controlling obstacle is ranked against the Fresnel radius, not raw clearance', () => {
  // The first Fresnel zone is widest at mid-path, so ranking obstacles by raw metres of clearance
  // lets a close-in hillock outrank the mid-path ridge that actually decides the link.
  const J = judge();
  /* hillock 200 m out with ~5 m of clearance, ridge at mid-path with ~8 m — curvature included */
  const prof = profile([[200, 95], [5000, 92 - 5000 * 5000 / (2 * 4 / 3 * 6371008.8)]]);
  const withF = J.judgeProfile(prof, 100, 100, 4 / 3, LAM_5G8);
  assert.equal(withF.worst.d1, 5000, 'with a frequency, the mid-path ridge decides the link (clearance ÷ F1)');
  const raw = J.judgeProfile(prof, 100, 100, 4 / 3, 0);
  assert.equal(raw.worst.d1, 200, 'without one, raw metres decide — the lowest clearance wins');
  /* curvature and refraction are applied to the terrain: the same profile under a different
     effective-earth factor is judged differently */
  const k1 = J.judgeProfile(profile([]), 10, 10, 1, 0), k4 = J.judgeProfile(profile([]), 10, 10, 4 / 3, 0);
  assert.notEqual(k1.worst.clearance, k4.worst.clearance, 'curvature and refraction are applied to the terrain');
});

test('R183: the four verdicts are the same words the raster sweep uses', () => {
  // Two tools that disagree about what "blocked" means are worse than one tool.
  const J = judge();
  const at = (h) => J.judgeProfile(profile([[5000, h]]), 100, 100, 4 / 3, LAM_5G8);
  const seen = new Set([60, 97, 103, 160].map((h) => at(h).verdict));
  assert.deepEqual([...seen].sort(), ['blocked', 'clear', 'diffraction', 'fresnel'].sort(),
    'a rising ridge walks the link through clear → fresnel → diffraction → blocked');
  assert.equal(at(60).verdict, 'clear');
  assert.equal(at(97).verdict, 'fresnel', 'inside 60 % of the first Fresnel zone is not clear');
  /* ITU-R P.526 decides diffraction vs blocked, against the same threshold the sweep uses */
  const d = at(103);
  assert.equal(d.verdict, 'diffraction');
  assert.ok(d.diffDb > 0 && d.diffDb <= J.DIFF_DB);
  const b = at(160);
  assert.equal(b.verdict, 'blocked');
  assert.ok(b.diffDb > J.DIFF_DB, 'past the sweep’s threshold the shadow is not usable');
  /* ⚠ READ, NOT RUN: that the raster sweep uses the same four words is a property of its own markup. */
  for (const v of ['clear', 'fresnel', 'diffraction', 'blocked']) {
    assert.ok(LOS.includes("'" + v + "'"), v);
  }
});

test('R183: the minimum antenna height is SOLVED, and only the observer end moves', () => {
  /* ⚠ READ, NOT RUN: the solver is inside linkRun, which needs the DEM fetch; the verdict function it bisects is run above. */
  // Terrain does not move when the mast gets taller, so the solver re-judges the same samples.
  const fn = LOS.slice(LOS.indexOf('let needH=null;'), LOS.indexOf('if(!live()) return null;', LOS.indexOf('let needH=null;')));
  assert.match(fn, /judgeProfile\(prof,g0\+/, 'bisection raises the observer ground, not the terrain');
  assert.match(fn, /for\(let it=0;it<24;it\+\+\)/, 'bisection, not a scan');
  assert.match(fn, /obsH\+500/, 'capped -- past that the answer is "not from here", not a taller tower');
});

test('R183: a gap in the DEM never votes on the verdict', () => {
  /* ⚠ READ, NOT RUN: the gap handling is inside linkRun's sampling loop over fetched tiles. */
  // "NO DATA IS NOT SEA LEVEL" -- the rule the sweep states. A gap is interpolated for DRAWING only.
  const fn = LOS.slice(LOS.indexOf('NO DATA IS NOT SEA LEVEL', LOS.indexOf('async function linkRun(')), LOS.indexOf('const g0=prof[0].h'));
  assert.match(fn, /gap=true/, 'gaps are marked');
  assert.match(fn, /ONLY for drawing|only for drawing/i, 'and the reason is written down');
});
