/* ============================================================================
 *  #R216 — source-level checks
 * ----------------------------------------------------------------------------
 *  The same shape as tests/r215-checks: these assert IDENTITIES and SELF-DECLARATIONS,
 *  not pixel values. Each one is the invariant a defect this round fixed would break,
 *  written so a future edit that reintroduces the defect fails here rather than in a
 *  report six rounds later.
 *
 *  ⚠ REGEXES, NOT LITERAL SUBSTRINGS WITH NEWLINES IN THEM — #R215 recorded that Windows
 *  checks the tree out with CRLF, so a literal '…\n  if(' silently stops matching the
 *  moment a branch is switched.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
/* ⚠ a comment that DESCRIBES a defect is not the defect. Two checks below assert that a string does
   NOT appear in a file, and both files explain in prose why it must not — so they are read with the
   block comments taken out, or the note about the bug would trip the test for the bug. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ── ① the news relay: our own origin first, and the URL allow-list is real ──────────── */
test('① proxy-fetch offers the Supabase relay FIRST, and reads SUPABASE_URL at call time', () => {
  const s = read('js/proxy-fetch.js');
  assert.match(s, /news-relay\?u=/, 'the Edge Function relay is not wired in');
  /* it must be built inside a function — a base captured when the module is evaluated would be ''
     for the whole session, because src/vendor.js may not have run yet */
  assert.match(s, /const\s+proxiesFor\s*=\s*\(\s*u\s*\)\s*=>/, 'the proxy list is not computed per call');
  const first = s.indexOf('news-relay?u='), pub = s.indexOf('api.allorigins.win');
  assert.ok(first > 0 && pub > 0, 'both entries must exist');
  assert.match(s, /\?\s*\[\s*\(x\)\s*=>\s*`\$\{base\}\/functions\/v1\/news-relay/, 'the relay is not the head of the list');
  /* and it is only offered for the URLs the function will actually answer */
  assert.match(s, /relayable\s*=\s*\(u\)\s*=>\s*\/\^https:\\\/\\\/news\\\.google\\\.com/, 'the relay is offered for URLs it does not serve');
});

test('① the news-relay function is an allow-list, and refuses a non-feed body', () => {
  const s = read('supabase/functions/news-relay/index.ts');
  assert.match(s, /u\.hostname\s*!==\s*"news\.google\.com"/, 'the host is not pinned');
  assert.match(s, /u\.pathname\.startsWith\("\/rss\/"\)/, 'the path is not pinned');
  /* Google answers a blocked request with 200 + an HTML interstitial; passing it through would let
     the browser's race declare this relay the winner and then parse zero items */
  assert.match(s, /includes\("<rss"\)[\s\S]{0,40}includes\("<feed"\)/, 'a non-feed body is not rejected');
  assert.match(s, /status:\s*502/, 'a bad upstream must not be reported as success');
});

/* ── ② closing a world-data legend must stay closed ──────────────────────────────────── */
test('② makePanel.claim() cannot re-open a panel the user closed', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /let\s+_want\s*=\s*false/, 'the panel has no idea whether it should be shown');
  /* hide() records the intent and claim() restores it — _registerLayerOpacity ends with
     display='block', which is what made the trade window come back a moment after every close */
  assert.match(s, /hide\(\)\s*\{\s*_want\s*=\s*false/, 'hide() does not record the intent');
  assert.match(s, /claim\(\)\s*\{[\s\S]{0,220}if\(!_want\)/, 'claim() does not respect it');
});

/* ── ③ the industry picker must reach the map ────────────────────────────────────────── */
test('③ industry-web uses the engine contract name for source data', () => {
  const s = code('js/industry-web.js');
  assert.equal(/layers\.setData\s*\(/.test(s), false,
    'layers.setData is not on the renderer contract — it is setSourceData (js/geo-engine.js)');
  assert.match(s, /layers\.setSourceData\(\s*SRC_EDGE/, 'the edge source is never updated');
  assert.match(s, /layers\.setSourceData\(\s*SRC_NODE/, 'the node source is never updated');
});
test('③ …and nothing else in js/ calls the non-existent name either', () => {
  /* the contract is one word; a second caller of the wrong one would fail the same silent way */
  const files = ['js/industry-web.js', 'js/world-packs.js', 'js/ocean-currents.js'];
  for (const f of files) assert.equal(/\.layers\.setData\s*\(/.test(code(f)), false, f + ' calls layers.setData');
});

/* ── ④ the choropleths get the 10 m outline ──────────────────────────────────────────── */
test('④ the country-geometry flush can be forced by a layer that is about to draw', () => {
  const a = read('js/app-body.js');
  assert.match(a, /_imFlushCountryGeo\s*=\s*function\(force\)/, 'the flush takes no force flag');
  assert.match(a, /force\s*===\s*true\s*\|\|\s*countryInfoOn/, 'the Countries-info gate is still the only way in');
  const w = read('js/world-packs.js');
  assert.match(w, /_imFlushCountryGeo\(true\)/, 'the world-data families do not ask for it');
  /* setSourceData clears feature state, so a flush that lands after the paint must repaint */
  assert.match(w, /function hiResCountries\(after\)/, 'the retry cannot repaint');
  assert.match(w, /hiResCountries\(\(\)=>\{\s*if\(on\)\s*paint\(\);\s*\}\)/, 'energy does not repaint after a late flush');
});

/* ── ⑤ the crop raster is opaque where it has data ───────────────────────────────────── */
test('⑤ crops bake no alpha ramp — opacity belongs to the slider', () => {
  const s = read('js/world-packs.js');
  assert.equal(/0\.30\s*\+\s*0\.70\s*\*\s*\(g\s*\/\s*255\)/.test(s), false,
    'the value is being written into the PNG alpha again, so 100 % can never be 100 %');
  assert.match(s, /px\[i\s*\+\s*3\]\s*=\s*255|px\[i\+3\]=255/, 'a data cell is not opaque');
});

/* ── ⑥ the tide panel drives the ONE clock ──────────────────────────────────────────── */
test('⑥ tides get a date field and playback, and no clock of their own', () => {
  const s = read('js/world-packs.js');
  assert.match(s, /class="wp-t-when"\s+type="datetime-local"/, 'no date/time field');
  assert.match(s, /class="wp-t-play"/, 'no play button');
  assert.match(s, /window\.IntMapTime\.set\(new Date\(ms\),\{allowFuture:true,source:'tides'\}\)/,
    'playback does not go through the master clock');
  /* and a step inside the cached window must not be a request */
  assert.match(s, /function covered\(t0\)/, 'there is no cached-window test');
  assert.match(s, /function restatAll\(t0\)/, 'there is no recompute-from-cache path');
});

/* ── ⑦ the right-click menu says which point once ───────────────────────────────────── */
test('⑦ the context menu does not repeat 「この」「ここ」 on every entry', () => {
  const s = read('js/tool-panel.js');
  const menu = s.slice(s.indexOf('function showContextMenu'), s.indexOf('function place('));
  assert.ok(menu.length > 500, 'the menu body was not found');
  const hits = (menu.match(/'(ここ|この地点|ここの|この表示)/g) || []);
  assert.deepEqual(hits, [], 'deictic labels are back in the context menu: ' + hits.join(', '));
  /* the coordinate row is the coordinate, not a label plus the coordinate */
  assert.match(s, /\{coord:`📍 \$\{HOST\.fmtLL/, 'the coordinate row still carries a label');
});
test('⑦ …and the i18n keys it shares carry no deixis either, in all five languages', () => {
  const s = read('js/i18n.js');
  for (const bad of ['ここにピンを刺す', 'ここから計測を開始', 'ここに投稿', 'Drop pin here', 'Start measure from here', 'Post here (community)'])
    assert.equal(s.includes(bad), false, 'js/i18n.js still has ' + bad);
});

/* ── ⑧ the space explorer ───────────────────────────────────────────────────────────── */
test('⑧ space: the hint starts earlier, the ✕ animates, and the deep sky is named', () => {
  const s = read('js/space.js');
  const m = /const\s+NEAR_FLOOR\s*=\s*([\d.]+)/.exec(s);
  assert.ok(m, 'NEAR_FLOOR is gone');
  assert.ok(parseFloat(m[1]) >= 2, 'the space hint still starts less than two zoom levels out');
  assert.match(s, /\.sp-close'\)\.onclick=\(\)=>\{\s*if\(!leaveToMap\(\)\)\s*close\(\);\s*\}/,
    'the close button still drops back to the map with no transition');
  assert.equal(s.includes('太陽系の外'), false, 'the deep-sky button is named after where it is not');
  assert.match(s, /L\('Galaxies & nebulae','銀河・星雲'/, 'the deep-sky button lost its name');
});
test('⑧ space: the selected planet\'s satellites are drawn in the SYSTEM view', () => {
  const s = read('js/space.js');
  assert.match(s, /function drawSysMoons\(/, 'there is no system-view satellite pass');
  const sys = s.slice(s.indexOf("if(mode==='system')"), s.indexOf('const taken=drawSystemLabels'));
  assert.match(sys, /drawSysMoons\(jd,pos,VP,centre,cam,extraLabels\)/, 'it is never called from the system branch');
  /* placed by the Moon's own law, or model scale puts them inside the planet (#R203) */
  assert.match(s, /moonSep\(rr\*b\.rKm\)/, 'satellites are placed with a raw separation');
  /* and the Moon is not drawn twice: it is already a BODY */
  assert.match(s, /if\(focus==='earth'&&\(m\.code===301\|\|m\.name==='Moon'\)\)\s*continue/, 'the Moon would be drawn twice');
});
test('⑧ space: six display switches live behind one button', () => {
  const s = read('js/space.js');
  assert.match(s, /class="sp-show"/, 'the Show menu is gone');
  ['sp-orbits', 'sp-moons', 'sp-names', 'sp-craft', 'sp-small', 'sp-deep'].forEach((c) =>
    assert.ok(s.includes('class="' + c + '"'), c + ' is not in the HUD'));
  /* the two right-hand panels are one column — the old literal top offset is what made them overlap */
  assert.equal(/top:calc\(52px \+ 232px\)/.test(s), false, 'the events panel is positioned by a guessed height again');
  assert.match(s, /class="sp-col"/, 'there is no panel column');
  const css = read('css/intmap.css');
  assert.match(css, /#space-view \.sp-bar\{[^}]*flex-wrap:nowrap/, 'the phone bar still stacks');
  assert.match(css, /#space-view \.sp-col\{/, 'the phone has no bottom sheet');
});

/* ── ⑨ the 3-D solid is always fully triangulated ───────────────────────────────────── */
test('⑨ ear clipping never abandons a ring half-covered', () => {
  const s = read('js/solid3d.js');
  const fn = s.slice(s.indexOf('function triangulate('), s.indexOf('/* ---- shaders'));
  assert.equal(/if\(!clipped\)\s*break;/.test(fn), false, 'the clipper can still give up and leave a hole');
  assert.match(fn, /if\(cut<0\)\s*cut=\(bestConvex>=0\)\?bestConvex:0/, 'there is no forced ear');
  assert.match(fn, /1e-13/, 'consecutive duplicates are not removed');
});

/* ── ⑩ the flight simulator on a phone ──────────────────────────────────────────────── */
test('⑩ the touch controls are the four arrows again, and they hold the same keys', () => {
  const s = read('js/flight-sim.js');
  assert.match(s, /class="fs-dpad"/, 'there is no four-way pad');
  for (const k of ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'])
    assert.ok(s.includes('data-k="' + k + '"'), 'the pad is missing ' + k);
  assert.equal(/class="fs-stick"/.test(s), false, 'the analog stick is still the touch control');
  /* a finger that slides off a button must release it, or the elevator stays hard over */
  assert.match(s, /b\.addEventListener\('pointercancel',up\)/, 'a cancelled press is never released');
});
test('⑩ …and a flight asks for landscape, then says so if it cannot have it', () => {
  const s = read('js/flight-sim.js');
  assert.match(s, /function _goLandscape\(\)/, 'nothing asks for landscape');
  assert.match(s, /orientation[\s\S]{0,40}lock\('landscape'\)/, 'the orientation is never locked');
  assert.match(s, /id="fs-rotate"|_rotEl\.id='fs-rotate'/, 'there is no rotate prompt for a browser that refuses');
  assert.match(s, /function start\(opts\)\{[\s\S]{0,200}_goLandscape\(\)/, 'start() does not ask');
  assert.match(s, /_endLandscape\(\)/, 'the lock outlives the flight');
});

/* ── ⑪ ocean currents: measured, never a shipped table ──────────────────────────────── */
test('⑪ the ocean-current layer ships no currents of its own', () => {
  const s = read('js/ocean-currents.js');
  assert.match(s, /ocean_current_velocity/, 'the arrows are not model values');
  assert.match(s, /ocean_current_direction/, 'the direction is not model values');
  /* warm/cold is a MEASUREMENT against the water upstream, not a table of famous currents */
  assert.match(s, /UPSTREAM_KM\s*=\s*\d+/, 'there is no upstream comparison');
  assert.match(s, /const dT=\(a\.sst!=null&&tu!=null\)\?\(tu-a\.sst\):null/, 'the classification is not from two temperatures');
  assert.match(s, /Math\.abs\(dT\)<DT_MIN\)\?'neutral'/, 'a difference inside the noise is still coloured');
  /* the names are third-party statements with a source, not strings in this file */
  assert.match(s, /wd:Q129558/, 'the names do not come from Wikidata');
  assert.equal(/Gulf Stream|Kuroshio|黒潮|メキシコ湾流/.test(code('js/ocean-currents.js')), false, 'a current name is hard-coded in the module');
});
test('⑪ …and its arrow image is registered on the object that actually has addImage', () => {
  const s = code('js/ocean-currents.js');
  /* ⚠ THE SAME CLASS AS ③: a plausible member name on the wrong object. `GE().layers.addImage` is
     undefined — images live on `scene`, beside the sky and the terrain (js/geo-engine.js) — and the
     TypeError was swallowed by ensureIcon's own catch, leaving a symbol layer whose `icon-image`
     named an image nobody had registered. MEASURED: layer `visible`, 37 features,
     `queryRenderedFeatures` = 0, and only the speed labels on the map. */
  assert.equal(/layers\.addImage/.test(s), false, 'addImage is on scene, not layers');
  assert.match(s, /GE\(\)\.scene\.addImage\('oc-arrow-img'/, 'the arrow image is never registered');
  /* ⚠ …and getImageData is NOT transformed: reading at (−S/2, −S/2) after a translate returns a
     fully transparent block, which registers happily and then draws nothing at all. */
  assert.match(s, /getImageData\(0,0,S,S\)/, 'the icon is read from outside the canvas again');
  assert.match(s, /iconDone=GE\(\)\.scene\.hasImage\('oc-arrow-img'\)/, 'a failed registration is not detected');
});
test('⑪ …and both of its sources are in the registry', () => {
  const r = read('js/reference-data.js');
  assert.match(r, /Open-Meteo Marine/, 'the marine model is not registered');
  assert.match(r, /ocean-current velocity and direction/, 'what it is used for is not stated');
  assert.match(r, /ocean currents with their published coordinates/, 'the Wikidata use is not stated');
});

/* ── ⑫ the atmosphere has air in it ─────────────────────────────────────────────────── */
test('⑫ aerial perspective is on near the ground and off above the atmosphere', async () => {
  const s = read('js/theme-sky.js');
  assert.match(s, /function _aerial\(\)/, 'there is no aerial-perspective term');
  assert.match(s, /'horizon-fog-blend':fg\.horizon/, 'the sky block still hard-codes fog off');
  assert.match(s, /'fog-ground-blend':fg\.ground/, 'the sky block still hard-codes fog off');
  assert.match(s, /if\(h>=80000\)\s*return\s*\{\s*ground:1,\s*horizon:0\s*\}/,
    'haze would be drawn from above the atmosphere, where there is none in the line of sight');
  /* and it must never wash the middle of the screen — #R174's white fog */
  const m = /ground:\+\(1-([\d.]+)\*f\)/.exec(s);
  assert.ok(m && 1 - parseFloat(m[1]) >= 0.6, 'the haze reaches too far in from the horizon');
});

/* ── ⑬ the intensity field does not fall back to rings ──────────────────────────────── */
test('⑬ seismic raises the DEM zoom instead of discarding the site term', () => {
  const s = read('js/seismic.js');
  assert.match(s, /while\(z<12&&\(40075017\*Math\.max\(0\.05,cosC\)\/\(Math\.pow\(2,z\)\*256\)\)>2000/,
    'the zoom is not raised to keep the slope baseline usable');
  /* and a build whose tiles missed the deadline gets one more bounded pass */
  assert.match(s, /snap\.missing>Math\.max\(8,snap\.have\*0\.35\)/, 'a mostly-missing DEM is not retried');
});
test('⑬ …and a drawn rupture is screened over its AREA, not at one point', () => {
  const s = read('js/seismic.js');
  assert.match(s, /function _rupSeaDepth\(\)/, 'the rupture is not sampled');
  assert.match(s, /function srcPoint\(\)/, 'the model is not centred on the wet part');
  assert.match(s, /const rs=_rupSeaDepth\(\);/, 'tsunamiCase still asks a single point');
  assert.match(s, /rs\.frac>=0\.25/, 'there is no submarine-fraction test');
  /* the point handed to the tsunami model is the one srcPoint decides */
  assert.match(s, /T\.open\(\{ lng:P\[0\], lat:P\[1\]/, 'openTsunami still hands over the raw epicentre');
  assert.match(s, /T\.follow\(\{ lng:P\[0\], lat:P\[1\]/, 'follow still hands over the raw epicentre');
});

/* ── ⑭ the sources page is written for readers ──────────────────────────────────────── */
test('⑭ sources.html has no essayistic register left in it', () => {
  const s = read('sources.html');
  const bad = [
    'その「誰か」の一覧です',            /* an aphorism, not a sentence a reader needs */
    '色は国境で止まりますが、現実はそこで止まりません',
    '古いものを新しいふりをして見せることはしません',
    'ここは注意',
    'いつの数字なのか',
    '作った人たちと利用条件',
  ];
  for (const b of bad) assert.equal(s.includes(b), false, 'sources.html still says: ' + b);
  /* …and it still says the things a reader needs */
  assert.match(s, /このページでは、その提供元を一覧にしています/);
  assert.match(s, /緊急時には、必ず公的機関の発表に従ってください/);
});
