// R152 source-level regression checks (deterministic, no browser).
// Guards the R152 UX/feature batch:
//   #1  Köppen legend — single-line rows (nowrap + ellipsis, code always visible) so all 30 zones fit the screen
//   #2  Companies UI — TRUE Countries parity: static absolute-overlay dock + rank gating + filter tooltip
//   #3  Atlas typography — flat prose gets a bold LEAD line + bigger headings + more spacing
//   #4  Atlas sources — broadened bad-host blocklist + relevance gate on gathered links + honest relabel
//   #5  Atlas toggles — fullscreen switch + generic on/off control switch (catch-all)
//   #6  Satellite — (documented) Esri z19 is the keyless native ceiling; no risky change
//   #7  Street View coverage line thinner (glow paint dropped)  [asserted in r147-checks]
//   #9  Measure/Share popups fully opaque (var(--card-bg), no backdrop blur)
//   #10 Compass — desktop right-click numeric bearing/pitch/zoom popup
//   #11 Flight sim — open-ocean sea-surface floor + below-sea land exempt + blue water fill
//   #12 Contour lines — density slider (rebuilds contour-src with scaled thresholds), in the legend
//   #13 IntMapGeoEngine — renderer abstraction + MapLibre adapter + Cesium contract; Atlas camera routed through it
//   #8  Companies — monthly high-precision time-series + fresher prices + history floor 1962
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */

test('R152 #1 Köppen rows are single-line (nowrap) with an always-visible code + ellipsised name', () => {
  assert.match(html, /\.kl-item\{[^}]*white-space:nowrap;/, 'kl-item nowrap (kills the 2-line wrap)');
  assert.match(html, /\.kl-item \.kl-code\{ flex-shrink:0;/, 'code never shrinks / stays visible');
  assert.match(html, /\.kl-item \.kl-nm\{ flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis;/, 'name ellipsises on one line');
  assert.match(html, /\.koppen-legend\{[^}]*width:220px; min-width:180px; max-width:460px;/, 'legend width is now dynamic per-language (R154: hugs content, clamped 172–340; _fitKoppenLegend sets the exact px)');
  // the build template splits code + name and adds a full-text title tooltip
  assert.match(html, /<span class="kl-code">\$\{code\}<\/span>/, 'row template emits .kl-code');
  assert.match(html, /title="\$\{code\}\$\{_knm\?' · '\+_knm:''\}"/, 'row has full-text title tooltip');
});

test('R152 #2 Companies compare dock is the static absolute-overlay (Countries parity)', () => {
  assert.match(html, /<div class="co-compare-fixed" id="co-compare-fixed"><\/div>/, 'static dock element exists');
  assert.match(html, /\.stats-compare-fixed, \.co-compare-fixed\{ display:none; position:absolute;/, 'shares the Countries dock styling');
  assert.match(html, /\.stats-compare-fixed\.show, \.co-compare-fixed\.show\{ display:block; \}/, 'shown via .show');
  assert.match(html, /function _companiesActive\(\)\{/, 'active-tab test mirrors _countriesActive');
  /* (#R168) renderUI moved into js/news-ui.js, where the active tab is read through the host, so the
     same line now spells it HOST.mode. Both forms are accepted: what is being guarded is that the
     Companies dock is hidden when the tab is not 'info', not which scope the value came from. */
  assert.match(html, /(?:currentMode|HOST\.mode)!=='info'\)\{ const cof=document\.getElementById\('co-compare-fixed'\)/, 'hidden on tab-switch like Countries');
  assert.match(html, /\(window\.imShowRank!=='off'\)\?`<span class="stat-rank">/, 'Companies honours the rank setting');
});

test('R152 #3 Atlas typography — size + spacing hierarchy, NO fabricated headings', () => {
  // (#R154) the opening-sentence→bold-lead fabrication was the "テキストを大きくする箇所がおかしい／判定がおかしい" cause — REMOVED
  assert.ok(!/out\.push\('\*\*'\+first\+'\*\*'\)/.test(html), 'R154: opening sentence is NOT promoted to a bold lead (no wrong enlargement)');
  // (#R158) hierarchy strengthened (bigger jumps + stronger neutral divider) — still no colour, no fabricated headings
  assert.match(html, /font-size:1\.9em;letter-spacing:\.012em/, 'h1 (1.9em, R158)');
  assert.match(html, /font-size:1\.56em;line-height:1\.25;letter-spacing:\.006em/, 'h2 (1.56em, R158)');
  assert.match(html, /<div style="height:1\.5em"><\/div>/, 'generous paragraph gap (1.5em, R158)');
});

test('R152 #4 Atlas sources — broadened blocklist (not medium/substack), relevance gate, honest relabel', () => {
  assert.match(html, /const _SNS_RE=\/[^\n]*blogspot\\\.\[a-z\.\]\+/, 'blog platforms added to the bad-host blocklist');
  assert.match(html, /note\\\.com\|fc2\\\.com/, 'note.com / fc2 added');
  assert.ok(!/medium\\\.com/.test(html.slice(html.indexOf('const _SNS_RE='), html.indexOf('const _SNS_RE=') + 900)), 'medium NOT banned (can be legit journalism)');
  assert.match(html, /function _atlRelevantCards\(cards, refText\)\{/, 'relevance gate exists');
  assert.match(html, /linkCards\(rest,txt\)/, 'analyze rest bucket relevance-filtered (R153: relevance runs inside linkCards after host-clean)');
  assert.match(html, /L\('Related articles','関連記事'/, 'no-basis links honestly labelled "Related articles" (not "Sources")');
});

test('R152 #5 Atlas toggles — fullscreen switch + generic on/off control switch', () => {
  assert.match(html, /fullscreen:\{ lbl:\(\)=>L\('Fullscreen'/, 'fullscreen has a _FEAT_TOG entry');
  assert.match(html, /_featTogHtml\('fullscreen'\)/, 'fullscreen case renders the switch');
  assert.match(html, /function _ctlTogHtml\(target, el\)\{/, 'generic control toggle exists');
  assert.match(html, /note\('✓ '\+nm\+': '\+\(want\?'on':'off'\)\)\+_ctlTogHtml\(a\.target\|\|el\.id,el\)/, 'checkbox controls get a switch');
  assert.match(html, /closest\('\.atl-ctl-gen'\)/, 'generic-toggle click handler (before the layer-toggle branch)');
});

test('R152 #9 → R153 Measure/Share popups follow the Solid/Glass appearance setting (not unconditionally opaque)', () => {
  // (R153) --glass-fill resolves to the opaque --card-bg in Solid mode and to a translucent rgba in the two glass modes,
  // so the popups are NOT unconditionally transparent NOR unconditionally opaque — they follow the one shared material.
  assert.match(html, /\.measure-dropdown, \.share-dropdown\{[^}]*background:var\(--glass-fill\);/, 'shared glass material (opaque in Solid, frosted in glass modes)');
  assert.match(html, /\.measure-dropdown, \.share-dropdown\{[^}]*backdrop-filter:saturate\(var\(--glass-sat\)\) blur\(var\(--glass-blur\)\)/, 'blur reads the shared glass vars');
});

test('R152 #10 Compass right-click numeric popup (desktop)', () => {
  assert.match(html, /\.compass-num-pop\{ position:fixed;/, 'popup CSS present');
  assert.match(html, /btn\.addEventListener\('contextmenu',\(e\)=>\{ e\.preventDefault\(\); if\(!map\) return;/, 'right-click handler on the compass');
  assert.match(html, /id="cnp-bear"[\s\S]{0,300}id="cnp-pitch"/, 'bearing + pitch inputs');
  assert.match(html, /if\(typeof _imTouchPrimary==='function' && _imTouchPrimary\(\)\) return;/, 'desktop-only guard');
});

test('R152 #11 Flight sim — open-ocean sea-surface floor + below-sea land exempt (water-fill REMOVED in R158)', () => {
  assert.match(html, /function _isOpenOcean\(lng,lat\)\{/, 'ocean discriminator via countryGeo (physics kept)');
  assert.match(html, /if\(st\._overOcean && terr<0\)\{ terr=0;/, 'sea-surface floor over open ocean (physics kept)');
  assert.match(html, /st\._overOcean=_isOpenOcean\(st\.lng,st\.lat\)/, 'ocean flag refreshed once per frame');
  // (#R158) the blue water-FILL overlay was retired per request ("海を水で満たす加工は廃止") — its layer + builders are gone
  assert.doesNotMatch(html, /addLayer\(\{id:'fs-ocean-water',type:'fill'/, 'blue water-fill layer removed (R158)');
  assert.doesNotMatch(html, /function _fsAddOcean\(\)\{/, 'water-fill builder removed (R158)');
});

test('R152 #12 Contour density slider rebuilds the source with scaled thresholds, in the legend', () => {
  assert.match(html, /function _contourThresholds\(\)\{ const d=Math\.max\(0\.25,Math\.min\(4,\+window\._contourDensity/, 'thresholds scaled by density');
  assert.match(html, /window\._setContourDensity=function\(d\)\{[^}]*_rebuildContours\(\)/, 'setter rebuilds contour-src');
  assert.match(html, /thresholds:_contourThresholds\(\)/, 'addContours uses the scaled thresholds');
  assert.match(html, /function ensureContourDensity\(el\)\{/, 'density slider lives in the legend (R16 rule)');
  assert.match(html, /ensureContourDensity\(el\);/, 'density row wired into legend refresh');
});

test('R152 #13 IntMapGeoEngine renderer abstraction + MapLibre adapter + Cesium contract', () => {
  assert.match(html, /window\.IntMapGeoEngine=\(function\(\)\{/, 'engine defined');
  assert.match(html, /const MapLibreAdapter=\{ id:'maplibre', capabilities:MAPLIBRE_CAPS,/, 'MapLibre adapter');
  assert.match(html, /const CESIUM_CONTRACT=\{ id:'cesium', implemented:false,/, 'Cesium contract (no SDK)');
  assert.match(html, /camera:\{ flyTo:o=>_adapter\.flyTo\(o\)/, 'camera facade delegates to the adapter');
  assert.match(html, /use\(a\)\{ if\(a&&a\.id\) _adapter=a;/, 'a future renderer can be swapped in');
  // Atlas camera execution routes through the engine (R160 aliases `const GE=IntMapGeoEngine.camera` in these cases)
  /* (#R171) The pitch case now builds its easeTo options first, because the tilt ceiling is a user setting
     and an angle past the top also turns the bearing around — so the literal `GE.easeTo({pitch:tp,…})` is
     gone while the claim (Atlas drives the camera through the engine) is unchanged. */
  assert.match(html, /const GE=IntMapGeoEngine\.camera;[\s\S]*?GE\.easeTo\(opt\)/, 'Atlas pitch routes through the engine');
  assert.match(html, /GE\.easeTo\(\{bearing:tb/, 'Atlas bearing routes through the engine');
});

test('R152 #8 Companies — monthly time-series, fresher prices, deeper history floor', () => {
  assert.match(html, /priceSeriesFine, histYear/, 'priceSeriesFine exported');
  assert.match(html, /data:await IntMapCompanies\.priceSeriesFine\(c\.tk,from,to\)/, 'time-series chart uses monthly data');
  assert.match(html, /now-_loaded\)<120000\) return;/, 'live-price cache 5min→2min (低遅延)');
  assert.match(html, /for\(let y=cur;y>=1962;y--\)/, 'history floor extended 1990→1962 (もっと昔)');
});
