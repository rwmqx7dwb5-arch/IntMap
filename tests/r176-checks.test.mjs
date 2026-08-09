/* ============================================================================
 *  R176 source-level checks
 * ----------------------------------------------------------------------------
 *  Six subjects this round:
 *    ① the eye-anchored tilt must be solved in MERCATOR units, not metres-per-degree
 *    ② Line of sight must answer per raster cell, with a target height, refraction and Fresnel
 *    ③ the drone launcher must be gone from every menu while the planner itself stays reachable
 *    ④ the terrain/water solver must be priority-flood + volume routing, and exact about inflow
 *    ⑤ the seismic simulator must ray-trace a published Earth model and name its ground-motion chain
 *    ⑥ the sunlight engine must sweep, not ray-march per pixel, and must own a real horizon profile
 *
 *  Each of these encodes a defect that was MEASURED this round, so the assertion is written against
 *  the mechanism that fixes it rather than against a symptom.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as acorn from 'acorn';
import { lazyFiles } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const ROOT = fileURLToPath(root);
const R = (p) => readFileSync(join(ROOT, p), 'utf8');
const index = R('index.html');
/* (#R178) the application body is TWO files now: js/geo-engine.js was carved out of app-body.js
   this round (the renderer adapter + the IntMapGeoEngine facade, moved verbatim), because the engine
   had been created inside map.on('load') and therefore did not exist when the modules — now written
   against it — run their factories. Every invariant below is about the same program, so `body` is
   still that program; it just spans both files. */
const body = [R('js/app-body.js'), R('js/geo-engine.js')].join('\n');
const entry = R('src/main.js');
/* (#R209) …or fetched on demand. Every assertion below that reads the entry is asking one thing:
   "is this file REACHED — does the feature it carries exist at all?" Eight modules left the entry's
   list this round and are `import()`-ed by js/lazy-modules.js instead, so the same question is now
   asked of both loaders. The lazy list is DERIVED from that loader's own literal specifiers, which
   is the only place they can live (static-checks sees no other form), so this cannot drift. */
const LAZY = lazyFiles(root);
const reached = (rel) => entry.includes(`import '../${rel}';`) || LAZY.includes(rel);
/* …and the same for "is its factory instantiated": the call itself is unchanged (same name, same
   IM_HOST); it is made from the loader now instead of from the boot closure. */
const instantiated = () => body + '\n' + R('js/lazy-modules.js');

const los = R('js/viewshed.js');
const water = R('js/terrain-water.js');
const quake = R('js/seismic.js');
const insol = R('js/insolation.js');
const sims = R('js/sims.js');
const atlas = R('js/atlas-console.js');
const toolPanel = R('js/tool-panel.js');
const refs = R('js/reference-data.js');
const legal = R('js/legal.js');

/* ── ① the tilt anchor lives in Mercator units ──────────────────────────────────────────────────
   Measured before the fix, on a real ctrl-drag with the ceiling lifted: the viewpoint moved 22,218 km
   at z3 and 58,506 m at z6 over Tromsø, with a 23,152 km single-frame snap when the old |lat|>89.5
   guard declined a frame. Both come from the same cause — the solve converted metres to degrees with
   110,574 and 111,320·cos(lat), a tangent plane, while the look distance at z3 is 8,573 km. */
/* (#R177) SUPERSEDED IN MECHANISM, KEPT IN INTENT — and this time the mechanism was only half right.
   Mercator units ARE the renderer's camera model, but only for one of the two transforms `globe`
   owns: it draws vertical-perspective below z12 and mercator above, and a vertical-perspective
   camera pivots about a point welded to the SPHERE, which no plane algebra describes. Measured on
   the #R176 build against the matrix MapLibre draws with — 7,115 km of drift at globe z3, 475 km at
   z6, 64.4 km at flat z6 Tromsø — while #R176's own ruler read 0 m for all of them, because that
   ruler was the fix's equation. The intent below is unchanged: solve where the renderer's camera
   really is, and never decline a frame. */
test('R176 ①: the eye anchor is solved in the renderer’s own geometry, with no bail-out frame', () => {
  assert.match(body, /const gmX=lng=>\(180\+lng\)\/360;/, 'the Mercator forward projection is in the geometry');
  assert.match(body, /const glatOf=y=>360\/Math\.PI\*Math\.atan\(Math\.exp\(\(180-y\*360\)\*GEO_RAD\)\)-90;/, 'and its inverse');
  assert.match(body, /circ=GEO_CIRC\*Math\.cos\(cam\.lat\*GEO_RAD\)/, 'altitude enters against circumferenceAtLatitude');
  /* the camera offset is the pixel look distance over the world size — no metres anywhere */
  assert.match(body, /const d=k\*c2c\/world, circ=/, 'the look distance is cameraToCenterDistance / worldSize, in merc units');
  assert.match(body, /const ex=gmX\(cam\.lng\)-d\*Math\.sin\(p\)\*Math\.sin\(b\), ey=gmY\(cam\.lat\)\+d\*Math\.sin\(p\)\*Math\.cos\(b\);/,
    'the eye is the applied centre plus the camera offset');
  assert.match(body, /const tx=gmX\(anchor\.lng\)\+d\*Math\.sin\(p\)\*Math\.sin\(b\), ty=gmY\(anchor\.lat\)-d\*Math\.sin\(p\)\*Math\.cos\(b\);/,
    'and the target is one subtraction away at the new attitude');
  /* (#R177) …AND THE SPHERE, which #R176 had no expression for at all */
  assert.match(body, /const gSpherical=t=>\{ try\{ return !!\(t&&t\.isGlobeRendering\); \}/,
    'the hook asks the renderer WHICH camera model is on screen');
  assert.match(body, /const dg=-cp\+Math\.sqrt\(Math\.max\(0,cp\*cp-1\+r\*r\)\);/   /* (#R178) the radius bisection is gone — the solve answers at the eye's OWN radius r and gLimitPitch clamps the TILT instead, so `rr` is simply `r` now */,
    'on the sphere the eye’s own radius fixes the look distance — |eye|² = 1 + dg² + 2·dg·cos p');
  assert.match(body, /return \{ lng:oLng, lat:oLat, zoom:z, elevation:0,\s*ok:/   /* (#R178) the sphere branch still answers with a ZOOM and a zero elevation — it just returns the one exact solve plus whether it is feasible, and gLimitPitch decides the tilt */,
    'so the ZOOM is what a tilt spends there — the pivot is on the surface, there is no other freedom');
  /* THE regression that produced the jerk: a declined frame applies the proposal verbatim (#R173) */
  assert.doesNotMatch(body, /Math\.abs\(lat\)>89\.5\) return \{\};/, 'the 89.5° bail-out must be gone');
  assert.match(body, /const lat=glatOf\(Math\.min\(GEO_YHI,Math\.max\(GEO_YLO,ty\)\)\), lng=glngOf\(tx\);/,
    'out-of-world is CLAMPED, never declined');
  /* the #R175 dolly must survive: the look distance scales by k in both models */
  assert.match(body, /const anchor=gEye\(was,c2c,tile,sphere,k\);/, 'the eye is still pre-scaled by k for a zoom (#R175)');
  /* and the measuring stick that hid the bug for FIVE rounds is fixed too — by there being one */
  assert.match(body, /return gEye\(cam,gC2C\(t,m\),tile,gSpherical\(t\),1\);/,
    'eyePosition reports the eye from the same geometry the anchor solves, so they cannot disagree');
  assert.doesNotMatch(body, /const mLat=110574, mLng=\(111320\*Math\.cos\(c\.lat\*r\)\)\|\|1;/, 'no metres-per-degree left in eyePosition');
});

/* ── ② Line of sight ────────────────────────────────────────────────────────────────────────────
   The old engine stopped each of 900 rays at the FIRST ridge and joined the stopping points into one
   polygon, so nothing beyond a ridge could ever be drawn as visible and the coverage edge was
   straight-line-interpolated across 419 m at 60 km. */
test('R176 ②: the viewshed answers per raster cell, not per bearing', () => {
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
  assert.match(los, /HOST\.lang==='jp'\?jp:HOST\.lang==='de'\?de:HOST\.lang==='ru'\?ru:HOST\.lang==='es'\?es:en/, 'EN/JP/DE/RU/ES');
});

/* ── ③ 「DronesはMeasureに置くな。どこにも置くな。」 ─────────────────────────────────────────── */
test('R176 ③: the drone launcher is gone from every menu, the planner is not', () => {
  assert.doesNotMatch(index, /id="btn-tool-drone"/, 'not in the Measure dropdown');
  assert.doesNotMatch(index, /data-proxy="btn-tool-drone"/, 'not in the mobile tools sheet');
  assert.doesNotMatch(R('js/drone-nav.js'), /getElementById\('btn-tool-drone'\)/, 'and nothing hunts for the button any more');
  /* the feature itself is untouched — the user asked for the BUTTON to go, not the planner */
  assert.match(entry, /import '\.\.\/js\/drone-nav\.js';/, 'the planner is still loaded');
  assert.match(body, /window\.IntMapModules\.droneNav\((IM_HOST)\)/, 'and still instantiated');
  assert.match(atlas, /window\.IntMapDrone&&window\.IntMapDrone\.toggle\(\)/, 'and Atlas opens it directly now');
  assert.ok(atlas.includes("case 'drone':"), 'the full drone action still exists');
});

/* ── ④ the terrain/water solver ─────────────────────────────────────────────────────────────────
   Measured: dropping 20 million m³ into a dug pit reported ZERO inflow, because the basin's inflow was
   read at "the first cell whose drainage parent is outside it" and a basin can have several. */
test('R176 ④: water is priority-flood + volume routing, and the inflow is exact', () => {
  assert.ok(existsSync(join(ROOT, 'js/terrain-water.js')), 'the simulator has its own file');
  assert.ok(reached('js/terrain-water.js'), 'loaded by the Vite entry, or fetched on demand by js/lazy-modules.js');
  assert.match(instantiated(), /window\.IntMapModules\.terrainWater\((IM_HOST)\);/, 'and instantiated');
  assert.match(water, /function Heap\(cap\)\{/, 'a real min-heap, so the flood is O(n log n)');
  assert.match(water, /filled\[nk\]=Math\.max\(surf\[nk\],filled\[k\]\);/, 'priority-flood fills to the spill level');
  assert.match(water, /parent\[nk\]=k;/, 'and the pop order doubles as the drainage tree');
  assert.match(water, /for\(let q=cnt-1;q>=0;q--\)\{\s*\n?\s*const k=order\[q\]; const v=own\[k\]\+inflow\[k\]; through\[k\]=v;/,
    'one reverse sweep routes every cubic metre downstream');
  /* (#R186) The FIX this test was written for — "a basin's inflow is what reaches it, not what one
     outlet cell happens to carry" — is now stated more strongly than the R176 form it pinned. Every
     cell inside a basin hands its water to the BASIN, so the sum has no outlet in it at all, and the
     basin is settled once (when the last of its cells has been visited) rather than read off a cell.
     Same guarantee, expressed by the code that replaced it. */
  assert.match(water, /const depIn=new Float64Array\(deps\.length\);/, 'inflow is accumulated per basin, exactly');
  assert.match(water, /if\(myDep>=0\)\{ depIn\[myDep\]\+=v;/, 'every cell inside a basin contributes to the basin, not to a neighbour');
  assert.match(water, /if\(depOrder\[myDep\]===q\) settle\(myDep\)/, 'and the level is solved once its inflow is complete');
  assert.doesNotMatch(water, /vin=through\[dp\.outlet\];/, 'and never read off a single outlet cell again');
  /* the products the request names */
  assert.match(water, /dp\.level=dp\.spill; dp\.over=vin-dp\.capacity;/, '決壊: a full basin overtops by exactly the excess');
  assert.match(water, /properties:\{kind:'breach', rot, label:'➤ '\+fmtM3\(b\.over\)\}/, 'and the spill direction is drawn as an arrow');
  assert.match(water, /function stampLevees\(out\)\{/, '堤防・ダム are stamped into the same height field');
  assert.match(water, /sculpt\[j\*G\.NX\+i\]\+=amp\*0\.5\*\(1\+Math\.cos\(Math\.PI\*d\)\);/, 'the brush is a raised cosine');
});

/* ── ⑤ the seismic simulator ────────────────────────────────────────────────────────────────────
   Validated against the real 2011 Tohoku event (M9.1, 29 km, 372 km to Tokyo): P at 52 s, S at 1m32s,
   about three minutes of shaking — and against published IASP91 P times at 30°/60°/90°. */
test('R176 ⑤: arrivals are ray-traced through IASP91 and the ground motion names its chain', () => {
  assert.ok(existsSync(join(ROOT, 'js/seismic.js')), 'the simulator has its own file');
  assert.ok(reached('js/seismic.js'), 'loaded by the Vite entry, or fetched on demand by js/lazy-modules.js');
  assert.match(instantiated(), /window\.IntMapModules\.seismic\((IM_HOST)\);/, 'and instantiated');
  assert.match(quake, /const IASP91=\[/, 'the velocity model is the data in the file');
  assert.match(quake, /\{ d0:2889, d1:5153\.9,p:\[10\.03904,3\.75665,-13\.67046\], *s:\[0\] \}/, 'including an outer core with no S');
  assert.match(quake, /function trace\(p,srcDepth,phase,dir\)\{/, 'and the travel times are TRACED, not tabulated');
  assert.match(quake, /const DR=1;/, 'through 1 km homogeneous shells (no singular turning-point integral)');
  /* the ground-motion chain, each step attributable */
  assert.match(quake, /Math\.pow\(10,1\.5\*mw\+9\.1\)/, 'Hanks & Kanamori for the moment');
  assert.match(quake, /const fc=0\.49\*BETA\*Math\.pow\(dSigma\/M0,1\/3\);/, 'Brune for the corner frequency');
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

/* ── ⑥ the sunlight engine ──────────────────────────────────────────────────────────────────────
   Measured on Mt Fuji: 38.9 % of the view in terrain shadow at a 10.7° winter-morning sun, 0 % at a
   77.7° summer noon; a valley floor in the Northern Alps gets 2,343 h of sun a year against 4,396 h
   with an open horizon. */
test('R176 ⑥: terrain shade is a sweep, and the year is read off a real horizon profile', () => {
  assert.ok(existsSync(join(ROOT, 'js/insolation.js')), 'the engine has its own file');
  assert.match(entry, /import '\.\.\/js\/insolation\.js';/, 'loaded by the Vite entry');
  assert.match(body, /window\.IntMapModules\.insolation\((IM_HOST)\);/, 'and instantiated');
  assert.match(insol, /function shadowMask\(g,azCompass,altDeg\)\{/, 'the shadow is one pass over the grid');
  assert.match(insol, /M\[k\]=Math\.max\(z,S\);/, 'carrying max(z, S) along the ray — O(N²), not O(N² · ray)');
  assert.match(insol, /async function horizon\(lng,lat,o\)\{/, 'a point owns a 360° horizon profile');
  assert.match(insol, /const drop=d\*d\/\(2\*K\*R_EARTH\);/, 'with curvature and refraction, which decide the low winter sun');
  assert.match(insol, /function dni\(altDeg\)\{/, 'clear-sky beam via Kasten & Young air mass');
  assert.match(insol, /async function dayShadow\(date,o\)\{/, '冬至の影: the union of a whole day’s shade');
  /* the user asked for ONE sun tool, not two — the existing panel drives it */
  assert.match(sims, /panel\.querySelector\('\.sun-terr'\)\.onclick=\(\)=>toggleTerrain\(\);/, 'the terrain toggle is on the existing Sun panel');
  assert.match(sims, /panel\.querySelector\('\.sun-solst'\)\.onclick=\(\)=>solsticeShade\(\);/, 'and so is the solstice button');
  assert.match(sims, /terrainShadow:\(on\)=>\{/, 'exposed so Atlas and tests can drive it');
  assert.ok(/PV/.test(sims) && /発電可能時間/.test(sims), 'and the PV-usable hours are reported');
  /* the Sun panel bakes every label at construction and was built once, so a language switch left it
     in the old one — measured: the three new buttons stayed English after switching to JP */
  assert.match(sims, /window\.addEventListener\('intmap-lang',\(\)=>\{ if\(!panel\) return;[\s\S]{0,220}panel=null;/,
    'the panel is rebuilt when the language changes');
});

/* ── the wiring every new feature owes the app (standing instructions 3 and 4, and the Atlas rule) ── */
test('R176: the three simulators are in the right places, catalogued, and sourced', () => {
  /* NOT in the Measure menu — the whole point of ③ */
  assert.doesNotMatch(index, /btn-tool-(terrain|water|quake|seismic|sun)/, 'no new buttons were added to the toolbar');
  /* the map right-click menu, like Line of sight */
  assert.match(toolPanel, /window\.IntMapTerrainWater&&window\.IntMapTerrainWater\.open/, 'terrain & water is on the right-click menu');
  assert.match(toolPanel, /window\.IntMapSeismic&&window\.IntMapSeismic\.open/, 'and the seismic simulator');
  assert.match(toolPanel, /window\.IntMapSun\.analysePoint\(lngLat\.lng,lngLat\.lat\)/, 'and the sunlight analysis');
  /* Atlas: an action AND a catalogue entry, or the planner cannot reach it (#R115) */
  for (const [c, cat] of [["case 'terrainWater':", 'TERRAIN EDITING & WATER ROUTING'],
                          ["case 'earthquake':", 'SEISMIC WAVE SIMULATION'],
                          ["case 'sunHours':", 'SUNLIGHT HOURS & TERRAIN SHADE']]) {
    assert.ok(atlas.includes(c), `Atlas implements ${cat}`);
    assert.ok(atlas.includes(cat), `and advertises ${cat} in the SYS catalogue`);
  }
  /* and a way to turn each of them off again (#R85) */
  assert.match(atlas, /window\.IntMapTerrainWater\.close\(\); did\.push/, 'clear knows about terrain & water');
  assert.match(atlas, /window\.IntMapSeismic\.close\(\); did\.push/, 'and the seismic overlay');
  assert.match(atlas, /window\.IntMapInsolation\) window\.IntMapInsolation\.clear\(\);/, 'and the terrain shade');
  /* every model that produces a number on screen is attributed (standing instruction 4) */
  for (const s of ['IASP91', 'Brune (1970)', 'Wald, Quitoriano', 'Kasten & Young'])
    assert.ok(refs.includes(s), `${s} is credited in the sources list`);
  assert.match(legal, /the seismic-wave simulator computes everything in your browser/, 'and the privacy page says what each new tool sends');
  assert.match(legal, /terrain-sculpting &amp; water-routing/, 'including the DEM the water simulator reads');
});

test('R176: the build stamp was bumped', () => {
  /* (#R177) #R176's own notes say "do not pin your round's value into a test that checks the stamp
     MOVED — it is meaningless the next round", and then this line pinned '2026-07-29-R176'. What it
     is really guarding is that the stamp did not sit still (it was stuck at R171 through #R172 and
     #R173), so: it must name a round AT OR AFTER the one that wrote this check, forever. */
  const m = /window\.INTMAP_BUILD='(\d{4}-\d{2}-\d{2})-R(\d+)'/.exec(index);
  assert.ok(m, 'the anti-stale-version stamp is present and well-formed');
  assert.ok(Number(m[2]) >= 176, `the stamp names R${m[2]}, which is older than the round that added this check`);
});

/* ── the split invariants every round since #R162 has to keep ─────────────────────────────────── */
test('R176: the new files are modules, with no top-level declarations', () => {
  for (const f of ['js/viewshed.js', 'js/terrain-water.js', 'js/seismic.js', 'js/insolation.js']) {
    const src = R(f);
    const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script' });
    const decls = ast.body.filter((n) => /Declaration$/.test(n.type) && n.type !== 'ExpressionStatement');
    assert.equal(decls.length, 0,
      `${f} must declare nothing at top level (module scope is private; ${decls.map((d) => d.type).join(',')})`);
    /* …and it must be reachable from the single entry point, or it simply does not run */
    assert.ok(reached(f), `${f} is imported by src/main.js, or import()-ed by js/lazy-modules.js`);
  }
});
