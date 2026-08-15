/* ============================================================================
 *  R191 — source-level checks for the round's eight reports.
 *  Node's own test runner; no browser. The things that need a real renderer or
 *  live pixels are in tests/r191.spec.js.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

/* ⚠ (#R221) js/i18n.js IS NO LONGER THE TABLE — it is the assembler. The five-language UI strings
   live in js/locales/ui.<code>.js, one file per language, so that adding a sixth is one file plus
   one row (see js/lang-registry.js). Every assertion below that searches "the i18n source" for a key
   is asking about the TABLE, so asking for js/i18n.js hands back the whole of it. */
const IM_I18N_FILES = ['js/i18n.js', 'js/lang-registry.js']
  .concat(readdirSync(new URL('../js/locales/', import.meta.url))
    .filter((f) => /^ui\.[a-z-]+\.js$/.test(f)).map((f) => 'js/locales/' + f));
const read = (p) => (p === 'js/i18n.js'
  ? IM_I18N_FILES.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n')
  : fs.readFileSync(path.join(root, p), 'utf8'));

/* ── 1 · the aircraft mark: the glyph's colour AND the glyph's stroke, lifted ─────────────────── */
test('R191 aircraft: the lifted mark carries the glyph colour and the glyph stroke', () => {
  const src = read('js/data-layers.js');
  /* the compensation exists, is derived, and is applied through ONE helper */
  assert.match(src, /const _FE_AMBIENT=0\.03;/, 'the shader ambient is named');
  assert.match(src, /const _FE_DIR_GLOBE=0\.933, _FE_DIR_MERC=1\.0;/, 'both measured roof factors are named');
  assert.match(src, /function _feHex\(hex,dir\)/, 'one place turns a wanted colour into a declared one');
  assert.match(src, /const _feRamp=\(mk\)=>\['interpolate',\['linear'\],\['zoom'\],_FE_Z0,mk\(_FE_DIR_GLOBE\),_FE_Z1,mk\(_FE_DIR_MERC\)\]/,
    'and the zoom ramp is the OUTERMOST expression — MapLibre rejects a nested zoom expression');
  /* every plane colour goes through it — a raw hex on these layers is the bug this round fixed */
  const paint = src.slice(src.indexOf("id:PLANE3D_LYR"), src.indexOf("id:PLANE3D_LYR") + 1400);
  assert.match(paint, /'fill-extrusion-color':_feRamp\(/, 'the lifted body asks the ramp for its colours');
  assert.ok(!/(^|[^(])'#1e90ff'/.test(paint.replace(/_feHex\('#[0-9a-f]{6}'/g, '_feHex(X')),
    'and no colour on this layer is declared raw — every one goes through _feHex');
  /* ⚠ (#R244) the colour itself moved — 「Live aircraft trafficの民間機の色は山吹色に」 — and with it
     the point this line has always made: the lifted body must ask for THE SAME colour the flat glyph
     is drawn in. That is now a shared constant rather than a repeated literal (which is the stronger
     form of the same invariant: #R173's drift is impossible when there is one name), so this checks
     the name reaches the ramp and tests/r244 ⑧ checks what the name is worth. */
  assert.match(paint, /_feHex\(PLANE_CIV,d\)/, 'it asks for the colour that COMES OUT as the glyph colour');
  assert.match(paint, /\['==',\['get','part'\],'rim'\],_feHex\('#ffffff',d\)/, 'and the stroke is white');
  /* the stroke is the glyph's own 1.6-px stroke, mitred — not #R185's scaled plate */
  assert.match(src, /const _PLANE_STROKE=0\.8;/, 'half of ensurePlaneIcons’ 1.6-px line');
  assert.match(src, /function _outsetRing\(pts,w\)/, 'a real offset, not a scale about the centre');
  assert.match(src, /const _PLANE_RIM=_outsetRing\(_PLANE_OUTLINE,_PLANE_STROKE\);/, 'outward half');
  assert.match(src, /const _PLANE_CORE=_outsetRing\(_PLANE_OUTLINE,-_PLANE_STROKE\);/, 'inward half');
  assert.ok(src.indexOf('const _PLANE_OUTLINE=') < src.indexOf('const _PLANE_RIM='),
    'the outline is declared before the two rings derived from it (#R167/#R183/#R189/#R190 TDZ)');
  /* the rim is pushed FIRST, and (#R192) it is a RING rather than a larger plate drawn 8 % lower:
     two coplanar surfaces 0.35 px apart are a tie the depth buffer cannot break, and disjoint
     geometry has no tie to break. See tests/r192-checks. */
  const rimAt = src.indexOf("part:'rim'"), bodyAt = src.indexOf("part:'body'");
  assert.ok(rimAt > 0 && bodyAt > rimAt, 'the stroke is emitted before the body');
  assert.match(src, /planeRingPts\(d\.lng,d\.lat,d\.heading,half,_PLANE_CORE\)\.slice\(\)\.reverse\(\)/,
    'and the body outline is the stroke ring’s hole');
  /* #R185's plate and halo stay gone */
  assert.doesNotMatch(src, /rgba\(255,255,255,0\.97\)/, 'the rim PLATE is still gone');
  assert.doesNotMatch(src, /_P_LEVELS|_PLANE_PLAN/, 'and so is the eight-part airliner');
});

/* ── 2 · the coverage hint answers about the view on screen ──────────────────────────────────── */
test('R191 aircraft: the coverage notice is about the current view, not the running sweep', () => {
  const src = read('js/data-layers.js');
  assert.match(src, /function planeCircles\(commit\)/, 'the planner can plan without adopting');
  assert.match(src, /if\(commit!==false\) _planeCover=cover;/, 'and only commits when asked to');
  const hint = src.slice(src.indexOf('function updatePlanesZoomHint'), src.indexOf('function updatePlanesZoomHint') + 1400);
  assert.match(hint, /planeCircles\(false\)/, 'the hint re-plans for the viewport it is describing');
  assert.ok(!/_planeCover&&_planeCover\.clipped/.test(hint),
    'and never reads the running sweep’s answer, which can be minutes old');
  assert.match(src, /updatePlanesZoomHint\(\);\s*\/\* \(#R191\) a PAN changes/, 'a pan re-asks too, not just a zoom');
});

/* ── 3 · no magnifier emoji in the desktop strings ───────────────────────────────────────────── */
test('R191 UI: the desktop chrome carries no magnifier emoji', () => {
  for (const f of ['js/i18n.js', 'js/data-layers.js', 'js/map-extras.js']) {
    assert.ok(!read(f).includes('\u{1F50D}'), `${f} has no \u{1F50D}`);
  }
  /* ⚠ (#R231) …AND THE PHONE NO LONGER KEEPS ONE EITHER. This block used to REQUIRE the magnifier
     inside the mobile media query. 「地名検索ボタンの絵文字は、絵文字ではなく独自のシンプルなアイコンに置換して」
     reverses that, so the requirement is INVERTED rather than deleted — a check that merely
     disappears is a hole, and the app must not grow the glyph back on either breakpoint. What
     replaces it (the drawn <svg>, the word/mark swap, the two display rules) is asserted in
     tests/r231-checks.test.mjs ②. */
  const css = read('css/intmap.css');
  /* ⚠ COMMENTS STRIPPED FIRST. The notes that record the removal quote the glyph, and a negative
     check that reads prose fails on a correct tree — #R208's and #R229's recurring defect. */
  const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(!cssCode.includes('\u{1F50D}'), 'no magnifier in any rule, the mobile block included');
});

/* ── 4 · the layer sidebar follows the appearance setting ────────────────────────────────────── */
test('R191 UI: the layer sidebar is solid in Solid mode and frosted in the frosted modes', () => {
  const src = read('js/map-ui.js');
  assert.match(src, /body:not\(\.sidebar-translucent\):not\(\.sidebar-glass2\) #layer-sidebar-r\{background:var\(--panel-bg,var\(--card-bg\)\);backdrop-filter:none;-webkit-backdrop-filter:none;\}/,
    'Solid paints the opaque panel tone and drops the blur');
  /* the frosted material is still there for the other two modes */
  assert.match(src, /#layer-sidebar-r\{position:absolute;[^}]*background:var\(--sidebar-bg\);backdrop-filter:blur\(25px\)/,
    'the frosted base rule is untouched');
});

/* ── 5 · seismic: the published models, by name and by coefficient ───────────────────────────── */
test('R191 seismic: the ground-motion chain names its models and uses their numbers', () => {
  const s = read('js/seismic.js');
  /* Worden et al. 2012 GMICE — the ShakeMap PGV relation, replacing Wald et al. 1999 */
  assert.match(s, /\(lg<=0\.53\)\?\(3\.78\+1\.47\*lg\):\(2\.89\+3\.16\*lg\)/, 'Worden 2012, both segments');
  assert.ok(!/3\.47\*Math\.log10\(Math\.max\(1e-6,pgv\)\)\+2\.35/.test(s),
    'and NO copy of Wald 1999 survives — at() carried a third one');
  /* the two class floors are inverted from the same relations, not written out again */
  assert.match(s, /function pgvAtMMI\(I\)/, 'the MMI inverse');
  /* (#R192) the JMA side is no longer a PGV regression at all — see tests/r192-checks. The inverse
     that bounds the painted edge is now the one for the level 計測震度 is defined on. */
  assert.match(s, /function a0AtJMA\(I\)/, 'the JMA inverse, in the quantity the scale is computed from');
  /* (#R232) …of whichever profile reaches furthest, which with rupture directivity is the forward
     lobe rather than the azimuth average — taking the edge from the average would clip the one
     direction the directivity term exists to draw. The scale-picks-its-own-quantity rule is what is
     being pinned, and it stands. */
  assert.match(s, /const arr=jmaScale\?prof(?:Edge)?\.a0s:prof(?:Edge)?\.out, floor=jmaScale\?A0_FLOOR_JMA:PGV_FLOOR_MMI;/,
    'and the paint edge walks whichever profile the active scale reads');
  /* ⚠ (#R223) THE NEAR-FIELD SATURATION MOVED FROM A PSEUDO-DEPTH TO THE GEOMETRY, and the
     assertion moved with it. #R191's point was that a POINT source must not report ground motion
     no instrument has recorded, and that a DRAWN rupture must not be given the same term twice;
     both still hold, and the reader's report («点震源のほうが明らかに過小評価») was that the two
     branches disagreed at the same magnitude. A point now stands for the rupture its magnitude
     implies (Wells & Coppersmith 1994), so the finiteness is in the distance metric for both and
     the curves are one curve. The claim here is STRONGER than the one it replaces: there is no
     branch on `fault` inside the ground-motion chain at all. */
  assert.ok(!/heffKm/.test(s), 'the equivalent point-source depth is gone (see #R223 ④)');
  assert.match(s, /RUP_A=\(mw\)=>Math\.pow\(10,-3\.49\+0\.91\*mw\)/, 'Wells & Coppersmith 1994 instead');
  assert.match(s, /function rupCutKm\(\)\{ return fault\?0:impliedRupKm\(mw\); \}/,
    'and a drawn rupture is still never given the finiteness twice');
  /* Atkinson & Boore 1995 path duration — the same paper as the trilinear spreading above it */
  assert.match(s, /const Tp=\(rKm<=10\)\?0:\(rKm<=70\)\?\(0\.16\*\(rKm-10\)\):\(rKm<=130\)\?\(9\.6-0\.03\*\(rKm-70\)\):\(7\.8\+0\.04\*\(rKm-130\)\);/,
    'the four published segments');
  assert.ok(!/0\.05\*rKm/.test(s), 'and the sourceless flat line is gone');
  /* Cartwright & Longuet-Higgins peak factor — needs the fourth moment */
  assert.match(s, /m4\+=a2\*w2\*w2;/, 'the fourth spectral moment is computed');
  assert.match(s, /const xi=Math\.max\(1e-4,Math\.min\(1,m2\/Math\.sqrt\(Math\.max\(1e-60,m0\*m4\)\)\)\);/, 'the irregularity factor');
  assert.ok(!/Math\.sqrt\(2\*lnN\)\+0\.5772/.test(s), 'and the Davenport asymptote is gone');
});

test('R191 seismic: the field is painted to the end of the lowest class', () => {
  const s = read('js/seismic.js');
  assert.match(s, /const MMI_CALIB_KM=1000;/, 'where the law is calibrated — unchanged');
  assert.match(s, /const MMI_TERRAIN_KM=1500;/, 'how far the terrain-driven fine field goes');
  assert.match(s, /const MMI_MAX_KM=8000;/, 'and where the lowest class finally ends');
  assert.match(s, /const rFine=Math\.min\(rEdge,MMI_TERRAIN_KM\);/, 'the fine box is bounded by the terrain');
  /* (#R232) it takes the azimuth-indexed profile PICKER now, not a single profile — see the
     directivity note in js/seismic.js. Its own pass is what is being pinned. */
  assert.match(s, /async function buildFar\(prof(?:At)?,box,rFine,rEdge,seq\)/, 'the annulus has its own pass');
  assert.match(s, /coords:\[\[-180,85\],\[180,85\],\[180,-85\],\[-180,-85\]\]/,
    'drawn as a WHOLE-WORLD raster, so no box can wrap the antimeridian or degenerate at a pole');
  /* (#R192) …and the land test is no longer a DEM read at all — a mask that half-arrives is what
     painted the ocean. It is the bundled raster, and a missing one means no annulus rather than a
     painted sea. See tests/r192-checks. */
  assert.match(s, /if\(land\.isLand\(lo,la\)!==true\)\{ seaSkipped\+\+; continue; \}/,
    'and it does not paint the sea, because the fine field does not either');
  assert.ok(/the far field is not drawn rather than painted over the sea/.test(s),
    'and with no mask at all it draws nothing — it never falls back to painting everything');
});

test('R191 seismic: the intensity field reads a FROZEN DEM, so it cannot come out striped', () => {
  const s = read('js/seismic.js');
  const build = s.slice(s.indexOf('async function buildField'), s.indexOf('function ensure()'));
  /* (#R216) the binding became `let`: #R216 re-warms ONCE when more than a third of the tiles missed
     the deadline and replaces the snapshot before the loop starts, because a field built from mostly
     missing DEM is painted with one site class — i.e. as concentric circles, which is what that round
     was asked to remove. The invariant this test exists for is unchanged: the LOOP reads one frozen
     snapshot, so a row's answer cannot depend on when it was computed. */
  /* (#R223) …and the same call now carries the land filter, so `want`/`missing` describe the set
     that was actually asked for rather than counting the open ocean as a failure. */
  assert.match(build, /(?:const|let) snap=\(typeof demSnapshot==='function'\)\?demSnapshot\(W,Ss,E,Nn,z,_keepTile\):null;/,
    'one snapshot for the whole picture');
  /* ⚠ (#R226) THE INVARIANT IS «THE LOOP READS THE SNAPSHOT», NOT «IT CALLS at()». #R226 made the
     read row-coherent — one sampler prepared per latitude instead of `at()` per sample, because the
     four transcendentals inside `_ll2tile` and the Map key are all latitude and the latitude is
     constant along a row. `at()` is now that same sampler (js/map-readout.js), so the frozen-DEM
     property this test exists for is untouched; what changed is how often the row half is evaluated. */
  assert.match(build, /const _rowAt=\(snap&&snap\.rowSampler\)/, 'and the loop reads it — by row');
  assert.match(build, /const _hereAt=_rowAt\(la\), _northAt=_rowAt\(/, 'both of the row\'s latitudes, prepared once');
  assert.ok(!/demElevAt\(/.test(build),
    'and no demElevAt in the loop: it REQUESTS, which is what evicted the tiles the field was reading');
  assert.ok(!/demElevBilinear\(lo\+dLngS,la,z\)/.test(build), 'the slope samples come from the snapshot too');
  const ro = read('js/map-readout.js');
  assert.match(ro, /function demSnapshot\(w,s,e,n,z,keep\)/, 'the snapshot holds decoded buffers');
  /* (#R221) demTilePoints joined the export list between demSnapshot and demZoomForMap — the field
     now warms the TILE GRID rather than a fixed lattice of positions. */
  assert.match(ro, /demElevBilinear, demSnapshot, demTilePoints, demZoomForMap/, 'and is exported');
  assert.match(read('js/app-body.js'), /get demSnapshot\(\)\{ return demSnapshot; \}/, 'through the host contract');
});

test('R191 seismic: Japanese defaults to the JMA scale, and a chosen scale latches', () => {
  const s = read('js/seismic.js');
  assert.match(s, /const scaleForLang=\(\)=>\(HOST\.lang==='jp'\)\?'jma':'mmi';/, 'the language picks the default');
  assert.match(s, /let scale=scaleForLang\(\);/, 'at construction');
  assert.match(s, /function pickScale\(v\)\{[^}]*scaleSet=true; return true; \}/, 'and a choice latches');
  assert.match(s, /window\.addEventListener\('intmap-lang',\(\)=>\{ if\(!scaleSet\)\{ const want=scaleForLang\(\);/,
    'a later language change moves the DEFAULT only');
  for (const call of [/sc\.onchange=e=>\{ pickScale\(/, /if\(o\.scale==='mmi'\|\|o\.scale==='jma'\) pickScale\(o\.scale\)/, /setScale\(v\)\{ if\(pickScale\(v\)\)/])
    assert.match(s, call, 'every entry point latches through pickScale');
});

/* ── 6 · the satellite path ──────────────────────────────────────────────────────────────────── */
test('R191 satellite: the cropped tile is no longer transcoded twice', () => {
  const a = read('js/sat-proto.js');   /* (#R195) the protocol moved out of the shell, byte for byte */
  const crop = a.slice(a.indexOf('async function _satCrop'), a.indexOf('async function _satResolve'));
  assert.ok(!/convertToBlob|toBlob/.test(crop), 'no JPEG re-encode');
  assert.match(crop, /return c\.transferToImageBitmap\?c\.transferToImageBitmap\(\):await createImageBitmap\(c\);/,
    'the bitmap MapLibre already accepts goes straight back');
  assert.match(a, /return \{data:bmp, mode:'cropped'\};/, 'and the cropped result is not held as bytes');
  /* the byte paths still copy, because MapLibre transfers what it is handed */
  assert.match(a, /return \{data:\(res\.data&&res\.data\.byteLength!==undefined\)\?res\.data\.slice\(0\):res\.data\};/,
    'a cached ArrayBuffer is copied; a bitmap is not');
});

test('R191 satellite: a phone gets phone-sized caches, and tiles arrive instead of appearing', () => {
  const a = read('js/sat-proto.js') + read('js/app-body.js');   /* (#R195) protocol + the shell's own tile budgets */
  assert.match(a, /const _satMob=\/Mobi\|Android\|iPhone\|iPad\/\.test\(navigator\.userAgent\);/, 'one device test');
  assert.match(a, /_SAT_CACHE_MAX=\(_satMob\?200:800\)/, 'the resolved-tile cache is quartered on a phone');
  assert.match(a, /_SAT_RAW_MAX=\(_satMob\?300:1200\)/, 'and so is the raw-fetch cache');
  assert.match(a, /id:'layer-sat',type:'raster',source:'satellite',layout:\{visibility:'none'\},paint:\{'raster-fade-duration':180\}/,
    'the satellite raster cross-fades instead of swapping');
  assert.match(read('js/world-base.js'), /'raster-fade-duration':180/, 'and the floor it fades from matches');
});

/* ── 7 · the profiling command actually runs the profiler ────────────────────────────────────── */
test('R191 ops: npm run test:profile cannot silently do nothing', () => {
  const pkg = JSON.parse(read('package.json'));
  const p = pkg.scripts['test:profile'];
  assert.match(p, /shell:process\.platform==='win32'/, 'the Windows launcher is resolvable');
  assert.match(p, /process\.exit\(r\.status==null\?1:r\.status\)/,
    'and a spawn that never started is a failure, not a pass');
});
