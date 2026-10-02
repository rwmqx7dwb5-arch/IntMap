/* ============================================================================
 *  IntMap · the map shell: flight-sim camera, satellite protocol, sidebars, hover, boot and theme lines
 * ----------------------------------------------------------------------------
 *  ⚠ Source-level pins over the shipped app. What they guard runs inside the map engine, the DOM
 *  or a MapLibre protocol handler — closures a Node test cannot construct without the app — so the
 *  lines the behaviour rests on are held here and the browser specs exercise the behaviour.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r158 #3 #6 #7 #8/#9 #10, r195 ①③④⑤, r205 ①③④⑤, r301 ⑥
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs, { readdirSync, readFileSync } from 'node:fs';
import path, { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { entries, latestEntry, renderIndex } from '../scripts/dev-notes.mjs';
import { allSpecs, CORE_ALWAYS, CORE_MAX_S, coreNames, fixedCoreNames, tierSpecs } from '../scripts/tiers.mjs';
import { appSource } from './app-source.mjs';
import { generatedStampProblems } from './helpers/build-stamp.mjs';
import { localCommands } from './helpers/ci-reach.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R158 — was tests/r158-checks.test.mjs #3 #6 #7 #8/#9 #10
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
// R158 source-level regression checks (deterministic, no browser).
// One batch across 10 items: Atlas/Terra execution authority, flight-sim camera teleport, sea water-fill removal,
// satellite quality + grey-tile suppression, Atlas typography + sources, +-attach with files, Companies hover month/day,
// sidebar flicker. Literal-substring assertions guard the exact load-bearing lines against silent regressions.

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const has = (s) => html.includes(s);
const ok = (s, msg) => assert.ok(has(s), msg || ('missing: ' + s.slice(0, 80)));
const gone = (s, msg) => assert.ok(!has(s), msg || ('should be removed: ' + s.slice(0, 80)));

test('R158 #7 Companies time-series hover shows the real month/day (not just the year)', () => {
  ok('series.push([d.getUTCFullYear()+d.getUTCMonth()/12, cv, ts[i]*1000]);', 'full-history keeps the raw ms timestamp');
  ok('series.push([d.getUTCFullYear()+d.getUTCMonth()/12, +q[i], ts[i]*1000]);', 'per-symbol fine series keeps the timestamp');
  ok('.map(p=>({fy:p[0],v:p[1]*sh,ts:p[2]}))', 'the mcap points carry the timestamp');
  ok('return new Date(+ts).toLocaleDateString(_tsLoc,{year:\'numeric\',month:\'short\',day:\'numeric\'});', 'tooltip formats the real localized date');
  gone("'<div class=\"co-ts-tth\">'+Math.round(Math.min(to,Math.max(from,fyr)))", 'the old year-only header is gone');
});

test('R158 #3 flight-sim sea water-FILL removed; physics floor kept', () => {
  gone("addLayer({id:'fs-ocean-water',type:'fill'", 'no blue water-fill layer');
  gone('function _fsAddOcean(){', 'water-fill builder removed');
  gone('function _fsOceanFC(){', 'inverse-mask ocean polygon builder removed');
  gone('function _fsOceanStyleGuard(){', 'the style-guard is gone');
  ok('function _isOpenOcean(lng,lat){', 'physics ocean discriminator kept');
  ok('if(st._overOcean && terr<0){ terr=0;', 'physics sea-surface floor kept');
});

test('R158 #6 flight-sim camera teleport — look-ahead target + smoothing + validation + clearance + pinned MapLibre', () => {
  /* The DEFENCE is unchanged since #R158 — a look-ahead target keeps centre and zoom stable at every
     attitude, the pitch is low-passed, the quaternion is normalised, every camera is validated and an
     abnormal one-frame jump is skipped. #R173 briefly replaced the fixed look distance with a solve on the
     round Earth; (#R174) that was withdrawn because it could not look up (measured: the map froze at 85.4°
     while the pilot looked to 165°), so the assertions follow the #R158 geometry again. */
  /* (#R178) spelled through the engine contract — camera.fromTo IS calculateCameraOptionsFromTo,
     asked of the adapter instead of of MapLibre. Same geometry, same arguments. */
  /* (#R189) the eye and the look-arm ride the intro blend now (cEye* / _Darm), whose STEADY-STATE
     initialisers are exactly the #R158 values — the blend only exists while _camSeed is alive. */
  ok('cam=GE().camera.fromTo({lng:cEyeLng,lat:cEyeLat},cEyeAlt,{lng:tLng,lat:tLat},tAlt);',
    'the camera comes from one look-ahead geometry');
  ok('let cEyeLng=eLng, cEyeLat=eLat, cEyeAlt=camAlt, _Darm=_D_LOOK;',
    'whose steady state is the eye at the aircraft and the FIXED #R158 look distance');
  ok('const _D=_Darm', 'the arm is a constant once the intro seed is dropped');
  /* (#R188) the STEADY-STATE constant is still 0.055 and the filter is still time-based; the only
     change is that an airborne "current map view" start runs a 1.2 s intro at a slower tau so the
     first frame is the view the user pressed START on. `_camSeed` is dropped when the window ends,
     after which this line evaluates to exactly the #R158 expression. */
  ok('const _pk=1-Math.exp(-Math.max(0.001,dt)/(_intro>0?0.42:0.055)); st._cP+=(pitchT-st._cP)*_pk;',
    'time-based pitch low-pass (no 1-frame spike)');
  ok('if(age>=st._camSeed.ms) st._camSeed=null;', 'and the intro is bounded, so 0.055 comes back');
  ok('if(_qn>1e-9&&Math.abs(_qn-1)>1e-6) st.q=', 'attitude quaternion normalised');
  ok('const sane=!!(cam&&cam.center&&_fin(cam.center.lng)', 'every camera output validated (NaN/Inf/range)');
  ok('if(_dC>9000||_dZ>3){ okCam=false;', 'abnormal one-frame jump is skipped (safety net)');
  ok('const camAlt=Math.max(st.alt, _grd+2.5);', 'camera eye altitude floored above smoothed terrain (decoupled from aircraft)');
  ok('try{ if(GE().camera.stop) GE().camera.stop(); }catch(_){} try{ window.__fsCamSkips=0', 'flight start halts other camera animations (sole controller)');
  /* (#R175) the pin survived the move to npm — and matters for the same reason it was made in #R158:
     the camera APIs this flight-sim fix rides on are exact-version behaviour, not a documented API.
     (maplibre-6-migration) …so it stays EXACT, and what it protected is now MEASURED rather than frozen:
     tests/maplibre-6-migration.spec.js ⑤ builds the cockpit camera through camera.fromTo and checks the
     eye lands where it was asked, on whatever version is installed. This line used to be the literal
     '5.24.0', which could only say «nobody moved it» — not «the cockpit still works». */
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.match(pkg.dependencies['maplibre-gl'], /^\d+\.\d+\.\d+$/, 'MapLibre pinned to an exact version');
  assert.ok(!/unpkg\.com\/maplibre-gl@/.test(html), 'and the unpinnable CDN copy is gone');
  /* (#R178) the CALL is what must be gone, not the name — js/flight-sim.js still explains in a comment
     why that API was abandoned, and deleting the explanation would lose the reason. */
  gone('=GE().camera.fromRotation(', 'the near-horizontal-unstable rotation API is no longer the primary path');
  gone('map.calculateCameraOptionsFromCameraLngLatAltRotation(', '…and not through the raw handle either');
});

test('R158 #8/#9 satellite tile protocol — grey placeholder replaced by real cropped imagery, native kept', () => {
  /* (#R178) registered through the contract — js/geo-engine.js is the only file that may say maplibregl */
  ok("GE().scene.addProtocol('imapsat'", 'custom satellite tile protocol registered');
  ok('const _SAT_PLACEHOLDER_MAX=3500;', 'grey "no data" placeholder detected by byte length');
  ok('async function _satCrop(buf, dz, subX, subY)', 'nearest real ancestor cropped to the child quadrant');
  ok('for(let up=0; up<13 && az>1; up++)', 'walk-up deep enough for open ocean (Esri imagery ends ~z8)');
  ok("tiles:(window.__imSatProto?['imapsat://{z}/{y}/{x}']", 'base satellite source uses the protocol, with a direct-Esri fallback');
  /* (#R191) the crop path returns an ImageBitmap now (no JPEG round-trip), so 'never worse than
     before' is stated where it lives: a failed crop still answers with the original bytes. */
  ok("return {data:first.buf, buf:first.buf, mode:'raw'};", 'a failed crop falls back to raw bytes (never worse than before)');
  ok('window.IntMapSatProto=', 'testable resolve hook exposed');
});

test('R158 #10 → R160 sidebar open/close — per-frame/anchor machinery deleted; toggle never touches the camera', () => {
  // R160 deleted the R158 (transitionend snap) and R159 (per-frame resize + anchor) schemes and did NOT replace them:
  // the left sidebar keeps its original mechanism and the toggle does nothing to the camera (no pin, no panBy).
  gone("window._sbBeginAnim=function(onEnd, anchor)", 'the R159 anchor-taking slide gate is gone');
  gone('window._sbBeginAnim(null, _sbAnchor0)', 'the left toggle no longer drives an anchored slide');
  gone('if (time - start < 450) requestAnimationFrame(sync);', 'the old per-frame 450ms resize loop is gone');
  ok('const coalescedResize=()=>{ if(_rsRAF) return;', 'a plain coalesced resize remains for GENUINE viewport changes only');
  gone('map.panBy([-dx,-dy],{duration:0}); }', 'the toggle has no panBy (which would rotate the globe)');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R195 — was tests/r195-checks.test.mjs ①③④⑤
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R195 — the source-level invariants behind this round's four changes.
 *
 *  These are the claims a browser test cannot make cheaply: that a literal is
 *  written in exactly two places and they agree, that a moved body really moved,
 *  and that the one value a split module cannot inherit is handed to it.
 * ==========================================================================*/

const appBody = rd('js/app-body.js');
/* (#R200) the session/tab subject left js/app-body.js for its own real ES module. These assertions
   are pointed at the file that HOLDS each half now rather than at a concatenation: if the snapshot
   ever moves again, "not in this file" is a failure, which is what a source-level guard is for. */
const sessionTabs = rd('js/session-tabs.js');
const mapUi = rd('js/map-ui.js');
const geoEngine = rd('js/geo-engine.js');
const cesium = rd('js/cesium-engine.js');
const tsunami = rd('js/tsunami.js');
const satProto = rd('js/sat-proto.js');
const countries = rd('js/countries-ui.js');
const mainJs = rd('src/main.js');

/* ── ① the sidebar state: one key, written in two places, and they must agree ─────────────────── */
test('R195 ①: the session key the sidebar reads is the key the session writes', () => {
  /* Three sites, one literal: the persistence block's KEY (the only WRITER), the #R122 early read of
     the saved layer list, and #R195's early read of the sidebar states. A fourth appearing without a
     reason, or any of them drifting, is what this pins — the sidebars restore from a key written
     ~2,500 lines away, and a typo there would fail silently as "the state was never saved". */
  /* (#R200) …and the WRITER is now js/session-tabs.js while the two early reads stayed behind, so the
     count is taken across both files and each site is pinned to the file it lives in. */
  const keys = [...appBody.matchAll(/'intmap_session2'/g)].length + [...sessionTabs.matchAll(/'intmap_session2'/g)].length;
  assert.equal(keys, 3, `'intmap_session2' should appear exactly three times across js/app-body.js + js/session-tabs.js `
    + `(the KEY, the early layer read, the early sidebar read); found ${keys}`);
  assert.match(sessionTabs, /const KEY='intmap_session2'/, 'the persistence block still owns the key');
  assert.match(appBody, /localStorage\.getItem\('intmap_session2'\)/, 'the sidebar read uses the same key');
});

test('R195 ①: both sidebars are recorded, and every route out of them records itself', () => {
  assert.match(sessionTabs, /sbOpen,\s*lsrOpen/, 'the snapshot carries both sidebar states');
  assert.match(sessionTabs, /sbOpen=!el\.classList\.contains\('collapsed'\)/, 'the left state is read off the DOM');
  assert.match(sessionTabs, /lsrOpen=el\.classList\.contains\('open'\)/, 'the right state is read off the DOM');
  assert.match(appBody, /window\._imSessionUI=_sessUI/, 'the wanted state is published for the layer panel');
  /* the left toggle, and the right panel's open/close/toggle, all save */
  const saves = [...mapUi.matchAll(/window\._imSaveSession&&window\._imSaveSession\(\)/g)].length;
  assert.ok(saves >= 3, `the right layer panel should record open, close and toggle; found ${saves}`);
  assert.match(appBody, /classList\.toggle\('collapsed'\);[\s\S]{0,400}?_imSaveSession/,
    'the left sidebar toggle records itself');
  /* …and boot restores the right panel from the last session's answer.
     ⚠ (#R210) The claim CHANGED, by a later instruction: 「初回時は、右サイドバーも開かれた状態に」.
     What must still hold is that a SAVED answer wins — an explicit `right:false` keeps it closed —
     and that only the no-saved-answer case opens. Pinning the old expression would have made that
     instruction unimplementable, so the assertion is on the two behaviours, not on the source line. */
  assert.match(mapUi, /typeof ui\.right!=='boolean'/, 'boot distinguishes "no saved answer" from a saved one');
  assert.match(mapUi, /if\(!isMob\(\)&&\(unanswered\|\|ui\.right===true\)\)\{/,
    'a saved right:false still boots closed; only an unanswered first visit opens');
  /* (#R210 follow-up) the unanswered case waits for idle so the tile build does not race boot */
  assert.match(mapUi, /if\(unanswered&&'requestIdleCallback' in window\)/, 'and it opens on idle');
});

/* ── ③ one hit test per pointer move ─────────────────────────────────────────────────────────── */
test('R195 ③: the hover triad is dispatched by the engine, in one query', () => {
  assert.match(geoEngine, /_hoverHub\(\)/, 'the shared dispatcher exists');
  assert.match(geoEngine, /queryRenderedFeatures\(ev\.point,\{layers:ids\}\)/,
    'ONE query naming every registered layer — the whole point of the change');
  assert.match(geoEngine, /e==='mousemove'\|\|e==='mouseenter'\|\|e==='mouseleave'/,
    'onLayer routes the hover triad to the hub');
  /* enter carries features, leave does not — MapLibre's own delegation semantics */
  assert.match(geoEngine, /H\.emit\(id,'mouseleave',ev,null\)/, 'leave is emitted without features');
  assert.match(geoEngine, /H\.emit\(id,'mouseenter',ev,feats\)/, 'enter is emitted with them');
  /* re-wiring is keyed on the map instance, not a boolean (a re-created map must not lose the hub) */
  assert.match(geoEngine, /H\.wired===m/, 'the wiring is keyed on the map instance');
  /* clicks are deliberately left with the renderer */
  assert.doesNotMatch(geoEngine, /e==='click'[^\n]*_hoverHub/, 'click delegation is unchanged');
});

/* ── ④ the split, and the one value it cannot inherit ────────────────────────────────────────── */
test('R195 ④: the satellite protocol lives in js/sat-proto.js and nowhere else', () => {
  /* a needle from deep inside the moved body: a leftover copy in the shell would win silently */
  const needle = "const _satUrl=(z,y,x)=>_SAT_HOSTS[(x+y)&1]";
  assert.ok(satProto.includes(needle), 'js/sat-proto.js really carries the body');
  assert.ok(!appBody.includes(needle), 'js/app-body.js no longer carries a second copy');
  /* (module-graph) the registry is gone: app-body calls the factory by the name it imports it under, and that
     named import is what puts the file in the module graph AND what replaces MODULE_FACTORIES — a missing
     file or export is a link error, so nothing can go silently missing */
  assert.equal((appBody.match(/(?<![\w$.])satProto\(IM_HOST\)/g) || []).length, 1, 'the shell calls the factory');
  assert.match(appBody, /^import \{ satProto \} from '\.\/sat-proto\.js';$/m, 'it is in the module graph');
  assert.match(satProto, /^export function satProto\(HOST\)\{/m, "…and exported by name, or the import is a link error rather than a silent gap");
  assert.doesNotMatch(mainJs, /const MODULE_FACTORIES\b/,'no hand list of factories survives to drift from the imports');
  /* ⚠ the one free reference. Inheriting it would leave it undefined and stop @2x for everyone,
     with no error anywhere — the exact silent failure scripts/check-split-scope.mjs exists for. */
  assert.match(appBody, /get hiDPITiles\(\)\{ return _hiDPITiles; \}/, 'the shell hands the decision over');
  assert.match(satProto, /const _hiDPITiles=HOST\.hiDPITiles/, 'the module takes it rather than inheriting it');
  /* the flag the style below the call site reads is still set by the module */
  assert.match(satProto, /window\.__imSatProto=true/, 'the load-bearing flag moved with the body');
});

/* ── ⑤ boot: the 4.3 MB geometry is no longer what the first seconds pay for ──────────────────── */
test('R195 ⑤: the country table loads coarse-first and upgrades the geometry at idle', () => {
  /* (mobile-performance) the three scales are this site's now (data/ne-countries/), read through
     js/ne-countries.js; \`grab\` takes the SCALE, and the coarsest is the first one it is asked for */
  assert.match(countries, /const grab=async\(scale\)=>\{ try\{ return await loadNECountries\(scale\);/,
    'the rungs read the shipped files through js/ne-countries.js');
  assert.match(countries, /gj=await grab\('110m'\)/, 'the rows come from the small file');
  assert.match(countries, /grab\('10m'\)[\s\S]{0,200}?if\(!\(hi&&hi\.features/,
    'the 10 m geometry still arrives');
  assert.match(countries, /requestIdleCallback\(run,\{timeout:6000\}\)/, 'and it waits for an idle main thread');
  /* ⚠ MERGE, DO NOT REPLACE: countryStats records are enriched in place by the PPP pass, the
     indicator gap-fill and the time machine. Handing each code a fresh object would drop all three. */
  assert.match(countries, /s\.area=Math\.round\(v\.area\); s\._area=v\.area;/, 'the upgrade merges');
  assert.doesNotMatch(countries, /best\.forEach\(\(v,code\)=>\{[\s\S]{0,300}?HOST\.countryStats\[code\]=\{/,
    'the upgrade must never replace a stats record wholesale');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R205 — was tests/r205-checks.test.mjs ①③④⑤
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  IntMap · R205 source-level checks
 * ----------------------------------------------------------------------------
 *  Node tests, no browser. Every assertion is DERIVED from the source or RUN against it — #R203 and
 *  #R204 between them lost seven of their own pins by writing VALUES and FILE NAMES that the next
 *  round, moving in the same direction, had to change. So: relations, not literals; and where a
 *  number is unavoidable it is read out of the file that owns it.
 * ==========================================================================*/

/* ── ① 「プレート境界レイヤーのプレート名は透過するな」 ───────────────────────────────────────
   The 0.3 came from #R20's per-layer default travelling through _applyGenericOpacity, which dimmed a
   symbol layer's TEXT along with the fill the default was about. */
test('R205 ① a layer can keep its text opaque while its fill follows the opacity slider', () => {
  const dl = rd('js/data-layers.js');
  assert.match(dl, /_opacityOpaqueText/, 'js/data-layers.js must own the opt-out registry');
  /* the symbol branch consults it for BOTH text and icon, and the non-symbol branch is untouched */
  const branch = /if\(L\.type==='symbol'\)\{[\s\S]{0,400}?return;\s*\}/.exec(dl);
  assert.ok(branch, 'the symbol branch of _applyGenericOpacity was not found');
  assert.match(branch[0], /_opacityOpaqueText\[lid\]/);
  assert.match(branch[0], /'text-opacity',keep\?1:v/);
  assert.match(branch[0], /'icon-opacity',keep\?1:v/);

  const lp = rd('js/layer-packs.js');
  /* the plate label declares itself, and does so where the layer is created (so the declaration
     cannot be later than the first apply) */
  const add = /GE\(\)\.layers\.add\(\{id:'eco-plates-lbl'[\s\S]{0,900}?\}\);/.exec(lp);
  assert.ok(add, "the eco-plates-lbl layer definition was not found");
  assert.match(add[0], /'text-opacity':1/, 'the label states its own opacity as well');
  assert.match(add[0], /'text-halo-color':'rgba\(0,0,0,1\)'/, 'the halo does not let the map through');
  const after = lp.slice(lp.indexOf(add[0]) + add[0].length, lp.indexOf(add[0]) + add[0].length + 300);
  assert.match(after, /_opacityOpaqueText[\s\S]{0,60}eco-plates-lbl/);
  /* ⚠ and #R204's answer to the previous instruction is still in place — this round does not undo it */
  assert.match(add[0], /IntMapLabelScale\.sub\(1\)/, "#R204's size must survive");
  assert.match(add[0], /Noto Sans Bold/, "#R204's weight must survive");
});

/* ── ③ 「ライトモードかつMapを選択した場合、昼の箇所がまぶしすぎて何も見えない」 ───────────────
   ══ ⚠⚠ (#R241) THE COMPLAINT IS ANSWERED HARDER THAN #R205 ANSWERED IT ═════════════════════════
   #R205 measured the light basemap clipping under 0.80 of blend and gave it 0.15 of its own. This
   round the reader removed the question rather than re-tuning the answer: 「衛生写真ではあっても、
   標準マップでは大気はなしって言ってるだろうがクソが」, confirmed as 「Mapでは大気ゼロ（縁の帯も
   消す）」. Zero is ≤ 0.15 at every zoom, so #R205's own finding — the day side of a light vector
   basemap must not be washed out — is satisfied strictly more than it was. What this test asserts
   is therefore that, and only that: NO atmosphere reaches a vector basemap, from EITHER owner.
   The satellite numbers moved too and live in tests/r241-checks ④ with the screenshots. */
test('R205 ③ the light basemap is never washed out — and now it gets no atmosphere at all', () => {
  const t = rd('js/theme-sky.js');
  const blend = /'atmosphere-blend':\((?:limb\?0:\()?sat[\s\S]{0,200}?\)\}\);/.exec(t);
  assert.ok(blend, "the atmosphere-blend expression was not found");
  assert.match(blend[0], /:0\)\}\);/, 'the non-satellite branch is 0, not a weaker ramp');
  assert.doesNotMatch(blend[0], /_mapIsLight\(\)/, 'so there is no brightness to branch on any more');
  /* ⚠ AND THE OTHER OWNER. js/limb-layer.js draws the app's own air over the disc; leaving it on
     would put back exactly the wash this test exists to forbid, in a place #R205 never looked. */
  const owns = t.slice(t.indexOf('function _limbOwnsRim()'), t.indexOf('function _limbOwnsRim()') + 400);
  assert.match(owns, /if\(!_airOn\(\)\) return false;/, 'the app-drawn limb is off over a vector basemap too');
});

/* ── ④ 「ライトモード時に表示する読み込み画面でのロゴはIntMap.Icon_BW-inverted.pngに」 ───────── */
test('R205 ④ the launch screen picks its mark from the SAVED theme, before the first paint', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'IntMap.Icon_BW-inverted.png')), 'the light mark must be in the repository');
  const html = rd('index.html');
  /* the early attribute script reads the app's own setting, not only the OS */
  const early = /<script>\(function\(\)\{var t='auto';[\s\S]{0,600}?<\/script>/.exec(html);
  assert.ok(early, 'the early data-theme script was not found');
  assert.match(early[0], /intmap_settings/);
  assert.match(early[0], /prefers-color-scheme: dark/);
  assert.match(early[0], /setAttribute\('data-theme',t\)/);
  assert.ok(html.indexOf(early[0]) < html.indexOf('<body>'), 'it must run before the body is parsed');
  /* ONE file is fetched, not two: the mark is a background whose declaration the cascade picks */
  assert.match(html, /<div class="boot-icon" role="img" aria-label="IntMap"><\/div>/);
  assert.ok(!/boot-icon[^>]*>\s*<img/.test(html), 'two <img> tags would fetch both marks');
  const css = rd('css/intmap.css');
  assert.match(css, /\.boot-icon\{[^}]*IntMap\.Icon\.png/);
  /* (mobile-heavy-work) the launch-sized copy of that mark (scripts/boot-icon-flatten.mjs derives it from the master) */
  assert.match(css, /:root\[data-theme="light"\] \.boot-icon\{[^}]*IntMap\.Icon_BW-inverted\.boot\.png/);
});

/* ── ⑤ 「衛星画像の読み込み時の動作を、極限までシームレスに」「ズームのfpsを劇的に」 ─────────── */
test('R205 ⑤ a tile request made while the zoom is changing waits instead of fetching', () => {
  const s = rd('js/sat-proto.js');
  assert.match(s, /function _satZoomHold\(z,signal\)/);
  /* it is the ZOOM, not any movement: a pan asks for tiles it is going to keep */
  const wire = /function _satWireZoom\(\)\{[\s\S]{0,500}?\n    \}/.exec(s);
  assert.ok(wire, '_satWireZoom was not found');
  assert.match(wire[0], /E\.on\('zoomstart'/); assert.match(wire[0], /E\.on\('zoomend'/);
  assert.ok(!/movestart|dragstart/.test(wire[0]), 'holding a pan would be a pure delay');
  const hold = /function _satZoomHold\(z,signal\)\{[\s\S]{0,900}?\n    \}/.exec(s);
  assert.match(hold[0], /signal&&signal\.aborted/, "MapLibre's own abort is what selects the level");
  assert.match(hold[0], /AbortError/, 'an aborted tile must go to unloaded, not errored');
  assert.match(hold[0], /_SAT_MAX_HOLD/, 'a pinch that never settles must still show imagery');
  /* the gate is off for the cheap shared low zooms, and the hold is applied before any fetch */
  assert.match(s, /_SAT_HOLD_MINZ\s*=\s*[1-9]/);
  const proto = /addProtocol\('imapsat',[\s\S]*?window\.__imSatProto=true;/.exec(s);
  assert.ok(proto, 'the imapsat protocol registration was not found');
  assert.ok(proto[0].indexOf('_satZoomHold') < proto[0].indexOf('_satViaWorker'), 'the hold must precede the fetch');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R301 — was tests/r301-checks.test.mjs ⑥
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ── ⑥ the defect the revived file found: no fetch in world-packs reads a body it did not check ── */
test('#R301 ⑥ the crop cell read checks its status, so an outage cannot read as «no cultivation»', () => {
  const src = read('js/world-packs.js');
  const i = src.indexOf("GAEZ+'/identify?");
  assert.ok(i > 0, 'the crop identify call is still there');
  const body = src.slice(i, i + 700);
  /* ⚠ THE ORDER IS THE POINT. ArcGIS answers an outage two ways: an HTTP status, and 200 with an
     error body. Both have to be asked BEFORE `j.value` is read, because the line that reads it
     prints 「no cultivation recorded in this cell」 for a null — a server error handed to the reader
     as a measured fact about the ground. */
  const ok = body.indexOf('if(!r.ok) throw'), errBody = body.indexOf('j.error) throw'), val = body.indexOf('const v=j&&j.value');
  assert.ok(ok >= 0, 'the HTTP status is checked');
  assert.ok(errBody >= 0, 'and the 200-with-an-error-body case is checked');
  assert.ok(val >= 0, 'and the value is still read');
  assert.ok(ok < val && errBody < val, 'both are checked BEFORE the value is read');
  assert.match(src.slice(i, i + 1400), /no cultivation recorded in this cell/,
    'the sentence that must never be printed for an outage is the one downstream of these guards');
});
}
