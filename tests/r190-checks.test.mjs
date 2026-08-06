/* ============================================================================
 *  #R190 — static checks for the eight reports of this round
 * ----------------------------------------------------------------------------
 *  Same contract as every r1NN-checks file: these read the SOURCE and assert the
 *  structural decisions, so a later round cannot quietly undo one of them without
 *  a red test explaining what it was for. The numbers quoted in the assertions
 *  are the ones measured in the browser this round (see DEV-NOTES R190).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/* ── 1 · the aircraft mark, in BOTH renderings ───────────────────────────────────────────────── */
test('R190 aircraft: the lifted body is the original glyph, and "at real altitude" is the default', () => {
  const src = read('js/data-layers.js');
  /* the 3-D silhouette and the 2-D icon are literally the same outline now */
  assert.match(src, /const _PLANE_OUTLINE=_PLANE_ORIG;/,
    'the lifted body draws the outline the flat glyph draws');
  assert.match(src, /const _PLANE_ORIG=\[\[0,-19\]/, 'and that outline is the original one');
  /* …declared ABOVE both uses. #R167/#R183/#R189 all lost a module to this exact TDZ. */
  assert.ok(src.indexOf('const _PLANE_ORIG=') < src.indexOf('const _PLANE_OUTLINE=_PLANE_ORIG'),
    '_PLANE_ORIG must be declared before the alias that reads it');
  assert.ok(src.indexOf('const _PLANE_ORIG=') < src.indexOf('function ensurePlaneIcons'),
    '…and before the icon factory, or the module dies in its own temporal dead zone');
  /* the #R183/#R185 construction is gone with the plan-form it was grown from */
  assert.doesNotMatch(src, /_P_LEVELS/, 'the part-height table is gone');
  assert.doesNotMatch(src, /_PLANE_PLAN/, 'and the airliner plan-form it was grown from');
  assert.doesNotMatch(src, /DETAIL_MAX_AIRCRAFT/, 'and the budget that switched between the two bodies');
  assert.doesNotMatch(src, /rgba\(255,255,255,0\.97\)/, 'the white rim plate is gone');
  /* one aeroplane per aircraft, at the #R172 size.
     (#R191) the body ring is now the shared outline INSET by the glyph's own stroke and a second ring
     carries the stroke itself (see _PLANE_CORE / _PLANE_RIM) — still the one silhouette this test is
     about, and still one aeroplane per aircraft. The stroke's own geometry is pinned in tests/r191. */
  assert.match(src, /coordinates:\[planeRingPts\(d\.lng,d\.lat,d\.heading,half,_PLANE_CORE\)\]/, 'one aeroplane per aircraft');
  /* (#R192) the size is the GLYPH's own ramp now, at every zoom — the 60 m floor was making the
     lifted mark 2.7x too big past z14.5. See tests/r192-checks. */
  assert.match(src, /const half=iconHalfPx\*mpp;/, 'and the original 13-px half-length');
  /* the default, and the storage generation that makes the default reachable */
  assert.match(src, /const PLANES3D_KEY='intmap_planes3d3';/, 'a new key generation');
  assert.match(src, /let planes3D=true;/, 'default ON — 「at real altitudeはデフォルトで選択状態に」');
  assert.match(src, /removeItem\('intmap_planes3d'\); localStorage\.removeItem\('intmap_planes3d2'\)/,
    'both older keys are removed, so neither can override the new default');
});

/* ── 2 · the submarine cables stop depending on a volunteer proxy ────────────────────────────── */
test('R190 default layers: the cables come through our own origin', () => {
  const fn = read('supabase/functions/cable-geo/index.ts');
  assert.match(fn, /Access-Control-Allow-Origin/, 'the relay sends ACAO — the whole reason it exists');
  assert.match(fn, /const ALLOWED = new Set\(\[/, 'an allowlist, not an open proxy');
  assert.match(fn, /submarinecablemap\.com\/api\/v3\/cable\/cable-geo\.json/, 'the cable routes');
  assert.match(fn, /submarinecablemap\.com\/api\/v3\/landing-point\/landing-point-geo\.json/, 'and the landing points');
  assert.match(fn, /if \(!ALLOWED\.has\(u\)\)/, 'anything else is refused');
  assert.match(fn, /Array\.isArray\(j\.features\)/,
    'an HTTP-200 error page is not cached for a day as if it were data');
  assert.doesNotMatch(fn, /:\s*Request\b/, 'no TypeScript annotations — scripts/static-checks parses .ts with acorn');

  const dl = read('js/data-layers.js');
  assert.match(dl, /functions\/v1\/cable-geo\?u=/, 'the client asks our relay…');
  const list = /const _cableProxies=\(function\(\)\{[\s\S]*?\}\)\(\);/.exec(dl);
  assert.ok(list, 'the proxy ladder is built from the configured Supabase URL');
  assert.ok(list[0].indexOf('x=>x') < list[0].indexOf('cable-geo'),
    '…after the direct URL, which is still tried first');
  assert.ok(list[0].indexOf('cable-geo') < list[0].indexOf('corsproxy.io'),
    '…and before the volunteer proxies, which are now only the last resort');

  /* the stored sessions written while that dependency existed are healed once */
  const body = read('js/app-body.js');
  assert.match(body, /defv:190/, 'the snapshot stamps the new generation');
  assert.match(body, /if\(!\(\+s\.defv>=190\)\)/, 'and an older stamp gets the default-on ids back once');
});

/* ── 3 · the pre-load satellite floor looks like the tiles it stands in for ──────────────────── */
test('R190 satellite: the bundled floor is colour-matched to the tiles that paint over it', () => {
  const src = read('js/world-base.js');
  /* measured from the page over the sixteen z2 World_Imagery tiles: Esri 85.5/121.3/125.9 against
     Blue Marble 72.4/84.3/101.1 — a 37-unit green gap. Per-channel least squares, R² 0.97/0.98/0.96. */
  assert.match(src, /const TONE=\[\[1\.1011,5\.81\],\[0\.9225,43\.53\],\[0\.9787,26\.94\]\];/,
    'the fitted per-channel transform');
  assert.match(src, /function toneMap\(im\)\{/, 'applied once to the decoded picture');
  assert.match(src, /im\.onload=\(\)=>\{ img=toneMap\(im\);/, '…on the load path everything waits on');
  assert.match(src, /function bitmapUrl\(\)\{/, 'and exported for the other engine');
  const ces = read('js/cesium-engine.js');
  assert.match(ces, /_wb\.bitmapUrl\(\)/, 'Cesium takes the colour-matched picture, not the raw file');
  /* …and it now covers deeper zooms, because a blurry patch of the RIGHT imagery beats a hole */
  assert.match(src, /minzoom:0, maxzoom:6,/, 'the floor reaches z6');
});

/* ── 4 · water: below sea level on land is not an ending ─────────────────────────────────────── */
test('R190 water: a course under 0 m on land keeps going, and edits re-trace it', () => {
  const src = read('js/terrain-water.js');
  /* the sea test still runs, and its NEGATIVE answer no longer stops the walk */
  assert.match(src, /belowSea=true; endInfo=null;/, 'not-the-sea means carry on');
  assert.match(src, /const SEA_CHECK_MAX=8;/, 'bounded — the test costs a flood window');
  assert.match(src, /gcM\(lastSeaCheck,\[lng,lat\]\)>20000/, 'and never twice within 20 km');
  assert.match(src, /if\(v&&v\.sea\)\{[\s\S]{0,180}?end='sea'; break; \}/, 'only a verified sea ends the trace');
  assert.doesNotMatch(src, /end='sink'; endInfo=\{ depthM:null/, 'the below-sea-level "sink" ending is gone');
  assert.match(src, /belowSea:!!trace\.belowSea/, 'and the fact is reported instead');
  /* every edit goes through solve(), so that is where the re-trace lives */
  assert.match(src, /draw\(\);\s*_retrace\(\);\s*return result;/, 'solve() re-traces');
  assert.match(src, /function _retrace\(\)\{/, 'debounced, and it says why when it declines');
  assert.match(src, /retraceState:\(\)=>\(\{ why:_reWhy/, 'a silent no-op is the defect class here');
  /* and the DEM refusal is a last resort behind a resolution ladder */
  assert.match(src, /if\(miss<=MISS_MAX\|\|z<=7\|\|tries>=6\) break;/, 'a coarser level is tried first');
  assert.match(src, /const _DEM_FAIL=\(\)=>L\(/, 'one message, in one place');
  /* the old wording survives only in the note that quotes the report it came from */
  assert.equal((src.match(/elevation data for this area could not be read/gi) || []).length, 1,
    'and it no longer blames the place for a level that did not arrive');
});

/* ── 5 · the flight simulator flies the angle the view was showing ───────────────────────────── */
test('R190 flight sim: the view\'s tilt becomes the aeroplane\'s flight path', () => {
  const src = read('js/flight-sim.js');
  assert.match(src, /function _flyViewGamma\(vg\)\{/, 'the attitude is set from the view');
  /* the limit is the height the recovery needs, not a round number */
  assert.match(src, /const c=1-h\*g0\*\(n-1\)\/Math\.max\(1,Vt\*Vt\);/,
    'h = V²(1−cos γ)/(g(n−1)) solved for the steepest recoverable dive');
  assert.match(src, /st\.q=qFromEuler\(0,aT\+gam,yaw\)/, 'the nose really points there');
  assert.match(src, /st\.vb=\[Vt\*Math\.cos\(aT\),0,Vt\*Math\.sin\(aT\)\];/,
    'body-axis velocity is the trim’s — rotating the nose rotates the PATH');
  /* it runs AFTER the terrain read, or the pull-out room is unknown */
  assert.ok(src.indexOf('const tr0=_terrRead(st.lng,st.lat)') < src.indexOf('_flyViewGamma(st._wantGamma)'),
    'the height under the aeroplane has to be known first');
  /* the pre-flight card stops being silent about a clamped altitude */
  assert.match(src, /class="fss-note"/, 'the card previews what an airborne start will use');
  assert.match(src, /limited by this aircraft’s ceiling/, '…and says when the ceiling is what decided it');
});

/* ── 6 · the launch screen ───────────────────────────────────────────────────────────────────── */
test('R190 boot: the default layers are fired at style-ready, and the screen waits for them', () => {
  const body = read('js/app-body.js');
  const m = /window\.__imBoot\.set\(80,'style'\);([\s\S]{0,3600}?)setTimeout\(settle,4000\);/.exec(body);
  assert.ok(m, 'the launch-screen block must still be one readable sequence');
  assert.ok(m[1].indexOf('__imFireDefaultLayers') < m[1].indexOf('GE().events.once(\'idle\',settle)'),
    'the layers are asked for BEFORE the first idle, so the downloads overlap');
  assert.match(m[1], /window\.__imLayerPainted&&window\.__imLayerPainted\(id\)/,
    'and the screen lifts on layers that are really on the map, not on ticked boxes');
  const dl = read('js/data-layers.js');
  assert.match(dl, /window\.__imLayerPainted=check;/, 'answered by the existing reconciler, not a second id table');
  /* ⚠ the ending NAMES are tests/r186's contract: exactly one of idle / timeout / no-renderer, because
     "a launch screen that lifts without saying why is the failure mode". Inventing `idle-timeout` and
     `layers-timeout` made a slow runner record NO recognised ending (measured in CI: layers at
     9,290 ms, escape at 12,134 ms). Which escape fired is said in the console instead. */
  for (const bad of ['idle-timeout', 'layers-timeout']) {
    assert.ok(!body.includes(`go('${bad}')`), `${bad} is outside the ending vocabulary r186 pins`);
  }
  assert.match(body, /const go=\(why\)=>\{ if\(ended\) return; ended=true; try\{ window\.__imBoot\.done\(why\|\|'idle'\)/,
    'and the default ending is one of them');
});

/* ── 7 · the seismic simulator ───────────────────────────────────────────────────────────────── */
test('R190 seismic: opacity, a compute button, LOS-style progress, and no borrowed draw panel', () => {
  const src = read('js/seismic.js');
  assert.match(src, /let fldOpacity=0\.85;/, 'the default fill is opaque enough to read the classes');
  assert.match(src, /function setFieldOpacity\(v\)\{/, 'and it is a control');
  assert.match(src, /class="sq-op"/, 'with a slider in the panel');
  assert.match(src, /class="sq-run"/, 'the compute button');
  assert.match(src, /function markStale\(\)\{/, 'parameters mark the field stale instead of rebuilding');
  /* (#R196) …and it now also pushes the changed event to the propagation model next door, which is
     the whole of 「津波シミュレーターも、初期の地震しか対応していない」. The three things this test
     is about — draw, warm, mark stale — are unchanged and still in that order. */
  assert.match(src, /function touch\(\)\{ draw\(\); warmEpi\(\); markStale\(\); syncTsunamiSource\(\); \}/, '…for the panel’s own spinners');
  assert.match(src, /class="sq-progb"/, 'the LOS-style bar');
  assert.match(src, /fldPct\+'%'/, 'with a real percentage');
  assert.match(src, /await warmDEMTiles\(warm,z,12000,\(f\)=>prog\(6\+34\*\(\+f\|\|0\)\)\)/,
    'driven by the DEM warm’s own progress');
  /* the shared draw tool is borrowed without its panel */
  assert.match(src, /DT\.start\(null,\{silent:true\}\)/, 'the rupture draw hides the draw tool’s panel');
  const mt = read('js/map-tools.js');
  assert.match(mt, /function renderPanel\(\)\{ const p=ensurePanel\(\); if\(silent\)\{ p\.style\.display='none'; return; \}/,
    '…which the tool itself implements, so nothing reaches into its DOM');
  assert.match(mt, /exit\(\)\{ state='off'; silent=false;/, 'and an ordinary Draw is unaffected afterwards');
});

test('R190 seismic: the field reaches the end of the lowest class and declares its extrapolation', () => {
  const src = read('js/seismic.js');
  assert.match(src, /const MMI_CALIB_KM=1000;/, 'where the regional law is calibrated');
  /* (#R191) 1,500 km is still the number this test was written about — it is the range the DEM can
     support, and #R190's measurement (3,000 km ⇒ 71 % of cells with no elevation at all) is exactly
     why. It is now called MMI_TERRAIN_KM, because #R191 separated "how far the terrain-driven field
     goes" from "where the lowest class ends" — the second was what the report was about, and it is
     MMI_MAX_KM. The rest of this test is unchanged and still passes. */
  assert.match(src, /const MMI_TERRAIN_KM=1500;/, 'and where the terrain-driven paint stops (measured: 3,000 km was 71 % no-DEM)');
  assert.match(src, /const rFine=Math\.min\(rEdge,MMI_TERRAIN_KM\);/, 'the fine field is bounded by it');
  assert.match(src, /const inRange=rKm<=MMI_CALIB_KM;/,
    'the TABLE still refuses to print an intensity outside the calibrated range');
  assert.match(src, /if\(km>MMI_CALIB_KM\) beyondCalib\+\+;/, 'and the painted cells beyond it are counted');
  /* ⚠ the RINGS are quoted numbers, not a labelled picture, so they stay inside the calibrated range.
     Splitting the two constants moved them by accident; tests/r176 ⑤ caught it at 1,129 km. */
  assert.match(src, /const maxDeg=MMI_CALIB_KM\/\(RE\*D\);/, 'mmiRings stays inside the calibrated range');
  /* the readout cannot speak a scale the field was not painted in */
  /* (#R192) …and the a0 the JMA scale is computed from, beside it: the argument is unchanged (store
     the QUANTITY, not an intensity), it just needs two quantities now that the two scales read
     different bands of the same motion. */
  assert.match(src, /pgvArr=new Float32Array\(N\*N\), a0Arr=new Float32Array\(N\*N\)/,
    'the field stores the quantities, not the intensity of whichever scale was active');
  assert.match(src, /pgvAt\(lo,la\)\{/, 'and the readout converts it');
  assert.match(src, /function mmiOf\(pgv\)\{/, 'one MMI conversion, not two copies that can drift');
  const ro = read('js/map-readout.js');
  assert.match(ro, /S\.intensityAt\(HOST\._crLng,HOST\._crLat\)/,
    'the always-on corner readout asks the simulator, never a second computation');
  assert.match(ro, /class="cr-seis" style="color:\$\{q\.col\}/, 'and shows it in the class colour');
});

test('R190 seismic: frequency-dependent Q, a slope measured at the DEM’s own spacing, tsunami hand-off', () => {
  const src = read('js/seismic.js');
  /* Q(f) = Q₀·f^η — Raoof, Herrmann & Malagnini 1999, and both numbers stay visible */
  assert.match(src, /let QS0=180, QETA=0\.45;/, 'the published southern-California crustal Q');
  assert.match(src, /QS0\*Math\.pow\(Math\.max\(0\.01,f\),QETA\)/, 'used as a frequency-dependent Q');
  assert.doesNotMatch(src, /QS=300/, 'the constant Q is gone');
  assert.match(src, /class="sq-q0"/, 'and it is adjustable, like the stress drop');
  /* the Vs30 slope proxy stops inventing a 900 m gradient out of kilometre pixels */
  assert.match(src, /const demSpacingM=40075017\*Math\.max\(0\.05,cosC\)\/\(Math\.pow\(2,z\)\*256\);/,
    'the DEM’s real sample spacing');
  assert.match(src, /const dsM=Math\.max\(900,demSpacingM\*1\.25\), slopeUsable=demSpacingM<=2000;/,
    'the baseline follows it, and past 2 km the proxy is not used at all');
  assert.match(src, /else if\(!slopeUsable\)\{ coarse\+\+;/, '…and those cells are counted, not faked');
  /* the tsunami hand-off screens on the operational conditions and hands over a derived height */
  assert.match(src, /function tsunamiCase\(\)\{/, 'the screening');
  assert.match(src, /if\(!\(M>=6\.5\)\|\|!\(depthKm<=100\)\) return null;/, 'M≥6.5 and ≤100 km');
  assert.match(src, /if\(e0==null\|\|e0>0\) return null;/, 'and under the sea, read from the DEM');
  assert.match(src, /Math\.pow\(10,0\.5\*M-3\.3\)/, 'wave height from the Abe tsunami-magnitude relation');
  assert.match(src, /D2\.open\(\{ lng:epi\[0\], lat:epi\[1\], hazard:'tsunami', waveH:t\.waveM \}\)/,
    'handed to the existing inundation model — no second model is written');
  /* ⚠ the screening asks the DEM, and render() asks the screening — so it has to survive a tile that
     has not arrived yet. Measured before this: an offshore M9.0 screened correctly through the API
     and the BUTTON was never drawn, because render() had already asked and got "unknown". */
  assert.match(src, /function _epiSeaDepth\(\)\{/, 'the depth is asked for at every zoom that might be warm');
  assert.match(src, /if\(fld&&fld\.z\) zs\.push\(fld\.z\);/, 'the field’s own level first — its warm grid covers the epicentre');
  assert.match(src, /function warmEpi\(\)\{/, 'and one tile is warmed so the answer exists before it is needed');
  /* ⚠ measured on production: the button rendered and a screening call a moment later returned null,
     because the DEM LRU had evicted that tile while the field build warmed a thousand others. */
  assert.match(src, /if\(_epiElev&&_epiElev\.k===k\) return _epiElev\.v;/, 'a known sea depth is remembered…');
  assert.match(src, /\{ _epiElev=\{k,v:e\}; return e; \}/, '…keyed on the epicentre, so moving it re-reads');
  assert.doesNotMatch(src, /_epiElev=\{k,v:null\}/, 'and "not known yet" is never cached as an answer');
  assert.match(src, /_tsuShown=!!tsunamiCase\(\);/, 'render records what it drew…');
  assert.match(src, /if\(opened&&_t!==_tsuShown\)\{ _tsuShown=_t; render\(\); \}/,
    '…so the panel re-renders exactly once, when the availability flips');
  const sims = read('js/sims.js');
  assert.match(sims, /if\(ll&&ll\.hazard&&HAZ\(\)\.some\(h=>h\[0\]===ll\.hazard\)\)/,
    'which accepts the hazard with the location, so it never runs once under the previous one');
});

/* ── 8 · the two engines ─────────────────────────────────────────────────────────────────────── */
test('R190 renderers: the caches that hold what a moving camera touches', () => {
  const ces = read('js/cesium-engine.js');
  assert.match(ces, /this\._globe\.tileCacheSize=_mob\?320:768;/, 'Cesium’s working set');
  /* the knob #R189 measured and withdrew is named only in the note that warns about it */
  assert.equal((ces.match(/preloadSiblings/g) || []).length, 2,
    '⚠ #R189 measured that this one changes the meaning of "the globe is quiet" — it stays out of the code');
  assert.doesNotMatch(ces, /\.preloadSiblings\s*=/, 'never assigned');
});
