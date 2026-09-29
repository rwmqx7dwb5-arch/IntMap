/* ============================================================================
 *  IntMap · the map tools — measure/share popups, compass, contours, draw profile, locate, flight-sim sea
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r152-checks.test.mjs #9 #10 #11 #12, tests/r153-checks.test.mjs #2 #8,
 *  tests/r154-checks.test.mjs #5 and tests/r233-checks.test.mjs ⑦. From their headers:
 * ==========================================================================*/
//   #9  Measure/Share popups fully opaque (var(--card-bg), no backdrop blur)
//   #10 Compass — desktop right-click numeric bearing/pitch/zoom popup
//   #11 Flight sim — open-ocean sea-surface floor + below-sea land exempt + blue water fill
//   #12 Contour lines — density slider (rebuilds contour-src with scaled thresholds), in the legend
//   #2  Measure/Share popups — follow the Solid/Frosted-Glass appearance setting (--glass-fill), not forced-opaque
//   #8  Workspace mode — in-map popups drag again (_inWsWin guards on direct .ws-body child, not any .ws-win descendant)
//   #5  Draw — Elevation profile available for freehand lines (_profileFromCoords + draw-profile button)
//   ⑦  the locate badge means 「ピッタリ」, and the satellite globe is surrounded by space in
//       light mode too
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const noJs = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
/* ⚠ WHY THESE READ THE SOURCE. Each of these tools is DOM + renderer code inside a map-host module
   (popups, compass, contour source rebuild, draw panel, flight sim, locate badge); none runs
   without the map. What is pinned is the rule or handler each round wrote. */
test('R153 #2 Measure/Share popups follow the shared glass material', () => {
  /* spelling kept — the tool is DOM + renderer code inside a map-host module and does not run without the map */
  /* ⚠ FOLDED HERE: 'R152 #9 → R153 Measure/Share popups follow the Solid/Glass appearance setting (not
     unconditionally opaque)' asserted exactly the first two lines below and nothing else. */
  assert.match(html, /\.measure-dropdown, \.share-dropdown\{[^}]*background:var\(--glass-fill\);/, 'uses --glass-fill (opaque in Solid, frosted in glass modes)');
  assert.match(html, /\.measure-dropdown, \.share-dropdown\{[^}]*backdrop-filter:saturate\(var\(--glass-sat\)\) blur\(var\(--glass-blur\)\)/, 'blur reads the shared glass vars');
  assert.ok(!/\.measure-dropdown, \.share-dropdown\{[^}]*background:var\(--card-bg\);/.test(html), 'the R152 forced-opaque --card-bg is gone');
});

test('R152 #10 Compass right-click numeric popup (desktop)', () => {
  /* spelling kept — the tool is DOM + renderer code inside a map-host module and does not run without the map */
  assert.match(html, /\.compass-num-pop\{ position:fixed;/, 'popup CSS present');
  /* (#R180) `if(!map)` became `if(!GE().hasRenderer())` when the last value references to the raw
     handle went — the claim (a right-click handler that bails without a renderer) is unchanged. */
  assert.match(html, /btn\.addEventListener\('contextmenu',\(e\)=>\{ e\.preventDefault\(\); if\(!GE\(\)\.hasRenderer\(\)\) return;/, 'right-click handler on the compass');
  assert.match(html, /id="cnp-bear"[\s\S]{0,300}id="cnp-pitch"/, 'bearing + pitch inputs');
  assert.match(html, /if\(typeof _imTouchPrimary==='function' && _imTouchPrimary\(\)\) return;/, 'desktop-only guard');
});

test('R152 #11 Flight sim — open-ocean sea-surface floor + below-sea land exempt (water-fill REMOVED in R158)', () => {
  /* spelling kept — the tool is DOM + renderer code inside a map-host module and does not run without the map */
  assert.match(html, /function _isOpenOcean\(lng,lat\)\{/, 'ocean discriminator via countryGeo (physics kept)');
  assert.match(html, /if\(st\._overOcean && terr<0\)\{ terr=0;/, 'sea-surface floor over open ocean (physics kept)');
  assert.match(html, /st\._overOcean=_isOpenOcean\(st\.lng,st\.lat\)/, 'ocean flag refreshed once per frame');
  // (#R158) the blue water-FILL overlay was retired per request ("海を水で満たす加工は廃止") — its layer + builders are gone
  assert.doesNotMatch(html, /addLayer\(\{id:'fs-ocean-water',type:'fill'/, 'blue water-fill layer removed (R158)');
  assert.doesNotMatch(html, /function _fsAddOcean\(\)\{/, 'water-fill builder removed (R158)');
});

test('R152 #12 Contour density slider rebuilds the source with scaled thresholds, in the legend', () => {
  /* spelling kept — the tool is DOM + renderer code inside a map-host module and does not run without the map */
  assert.match(html, /function _contourThresholds\(\)\{ const d=Math\.max\(0\.25,Math\.min\(4,\+window\._contourDensity/, 'thresholds scaled by density');
  assert.match(html, /window\._setContourDensity=function\(d\)\{[^}]*_rebuildContours\(\)/, 'setter rebuilds contour-src');
  assert.match(html, /thresholds:_contourThresholds\(\)/, 'addContours uses the scaled thresholds');
  assert.match(html, /function ensureContourDensity\(el\)\{/, 'density slider lives in the legend (R16 rule)');
  assert.match(html, /ensureContourDensity\(el\);/, 'density row wired into legend refresh');
});

test('R154 #5 Draw — elevation profile for freehand lines', () => {
  /* spelling kept — the tool is DOM + renderer code inside a map-host module and does not run without the map */
  assert.match(html, /window\._profileFromCoords=function\(pts\)\{/, 'reusable coords→profile core extracted');
  assert.match(html, /window\._elevationProfile=function\(\)\{[\s\S]*window\._profileFromCoords\(pts\);/, 'measure/area path delegates to the core');
  assert.match(html, /id="draw-profile"[^>]*>📈 \$\{t\('elevProfile'\)\}/, 'Draw panel shows an Elevation profile button');
  assert.match(html, /profBtn\.onclick=\(\)=>\{ const c=\(simplified&&simplified\.length>=2\)\?simplified/, 'button profiles the traced line (simplified, raw fallback)');
});

test('R153 #8 Workspace map popups drag again (guard on direct .ws-body child)', () => {
  /* spelling kept — the tool is DOM + renderer code inside a map-host module and does not run without the map */
  assert.match(html, /const _inWsWin=\(\)=>\{ try\{ return !!\(panel\.parentElement&&panel\.parentElement\.classList&&panel\.parentElement\.classList\.contains\('ws-body'\)\)/, 'drag guard fires only for window CONTENT (direct .ws-body child), not in-map popups');
  assert.ok(!/const _inWsWin=\(\)=>\{ try\{ return !!\(panel\.closest&&panel\.closest\('\.ws-win'\)\)/.test(html), 'the old over-broad closest(.ws-win) drag guard is gone');
});

/* ── ⑦ the two small ones ────────────────────────────────────────────────────────────────────── */
test('R233 the locate badge is ピッタリ, and the satellite globe has space around it in light mode', () => {
  /* spelling kept — the tool is DOM + renderer code inside a map-host module and does not run without the map */
  const mx = read('js/map-extras.js');
  const px = /const _CENTER_PX=(\d+);/.exec(mx);
  assert.ok(px, 'the badge is still decided by a pixel distance');
  assert.ok(+px[1] <= 8, `the locate badge lights within ${px[1]} px of the fix — 「ピッタリ」 is not 44`);

  const sky = read('js/space-sky.js');
  assert.match(sky, /function _satBase\(\)/, 'the satellite basemap is a question this file can ask');
  assert.match(noJs(sky), /data-theme'\)!=='dark' && !_satBase\(\)/,
    'light mode + satellite draws the star field — the surround of a photographed Earth is space');
  /* asked of the renderer, the same way js/night-side.js asks it — not a second copy of the state */
  assert.match(sky, /getLayout\('layer-sat','visibility'\)==='visible'/, 'one predicate, shared shape');
});
