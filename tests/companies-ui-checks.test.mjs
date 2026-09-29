/* ============================================================================
 *  IntMap · the Companies tab — Countries parity, and how far back its history reaches
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r152-checks.test.mjs #2 #8 and tests/r153-checks.test.mjs #5 #7.
 *  From their headers:
 * ==========================================================================*/
//   #2  Companies UI — TRUE Countries parity: static absolute-overlay dock + rank gating + filter tooltip
//   #8  Companies — monthly high-precision time-series + fresher prices + history floor 1962
//   #5  Companies deeper history — Time-series default range widened to 20y (picker still reaches Yahoo's 1962 floor)
//   #7  Companies↔Countries parity — the Time-series metric picker DRIVES the chart (mcap absolute / price indexed) with a
//       crosshair tooltip; /8→/10 labels; a workspace-mode filter box; a real price sparkline in the detail overlay
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
/* ⚠ WHY THESE READ THE SOURCE. The Companies UI is DOM rendering inside js/companies-ui.js / js/news-ui.js,
   driven by the app host and live price data; what is pinned is the markup, the defaults and the
   history floor each round set. */
test('R152 #2 Companies compare dock is the static absolute-overlay (Countries parity)', () => {
  /* spelling kept — Companies UI is DOM rendering driven by the app host and live price data */
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

test('R152 #8 Companies — monthly time-series, fresher prices, deeper history floor', () => {
  /* spelling kept — Companies UI is DOM rendering driven by the app host and live price data */
  assert.match(html, /priceSeriesFine, histYear/, 'priceSeriesFine exported');
  assert.match(html, /data:await IntMapCompanies\.priceSeriesFine\(c\.tk,from,to\)/, 'time-series chart uses monthly data');
  assert.match(html, /now-_loaded\)<120000\) return;/, 'live-price cache 5min→2min (低遅延)');
  assert.match(html, /for\(let y=cur;y>=1962;y--\)/, 'history floor extended 1990→1962 (もっと昔)');
});

test('R153 #5 Companies Time-series defaults to a deeper 20-year window; picker still reaches 1962', () => {
  /* spelling kept — Companies UI is DOM rendering driven by the app host and live price data */
  assert.match(html, /if\(_coCmpTsFrom==null\) _coCmpTsFrom=cur-20;/, 'TS default range 10→20 years');
  assert.match(html, /for\(let y=cur;y>=1962;y--\)/, 'picker still reaches Yahoo\'s keyless 1962 floor');
});

test('R153 #7 Companies compare Time-series metric picker DRIVES the chart', () => {
  /* spelling kept — Companies UI is DOM rendering driven by the app host and live price data */
  assert.match(html, /let _coCmpTsMetric='mcap';/, 'TS metric state exists');
  assert.match(html, /const metric=\(_coCmpTsMetric==='price'\)\?'price':'mcap'/, 'the metric drives the chart');
  assert.match(html, /pts=arr\.filter\(p=>p\[1\]>0\)\.map\(p=>\(\{fy:p\[0\],v:p\[1\]\*sh,ts:p\[2\]\}\)\)/, 'Market cap view plots absolute $ (shares × price), R158 carries the timestamp');
  assert.match(html, /data-cmptsm="/, 'TS metric toggle buttons rendered');
  assert.match(html, /if\(_coCmpMode!=='ts'\)/, 'the generic (do-nothing-in-TS) metric picker is hidden in TS mode');
  assert.match(html, /class="co-ts-tip"/, 'crosshair tooltip (Countries parity)');
});

test('R153 #7 Companies — /10 labels, workspace filter box, detail sparkline', () => {
  /* spelling kept — Companies UI is DOM rendering driven by the app host and live price data */
  assert.match(html, /cos\.length\+'\/10/, 'compare subtitle reads /10 (was /8)');
  assert.match(html, /\$\{coCompareSet\.size\}\/10/, 'detail Compare button reads /10 (was /8)');
  assert.match(html, /function _companiesSearchVal\(\)\{/, 'ws-mode Companies search value helper');
  assert.match(html, /id="companies-search-input"/, 'Companies filter input exists');
  assert.match(html, /sels:\['#info-search-bar','#info-dashboard','#co-compare-fixed'\]/, 'Companies ws window bundles its search bar + compare dock');
  assert.match(html, /filterCompaniesPh:"Filter companies\.\.\."/, 'EN placeholder i18n key');
  assert.match(html, /filterCompaniesPh:"企業を絞り込み\.\.\."/, 'JP placeholder i18n key');
  assert.match(html, /class="co-detail-spark"/, 'real price sparkline in the company detail');
  assert.match(html, /priceSeriesFine\(c\.tk, from, to\)/, 'sparkline uses real monthly price history');
});
