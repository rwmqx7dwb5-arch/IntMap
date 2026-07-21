// R153 source-level regression checks (deterministic, no browser).
// Guards the R153 UX/feature batch (8 user-reported items):
//   #1  Köppen legend — widened to 264px (full names read, no ellipsis clip) + shorter 30-row block (padding 0) so
//       the LAST zone is reachable on a laptop; RU/ES climate names added (were English fallback)
//   #2  Measure/Share popups — follow the Solid/Frosted-Glass appearance setting (--glass-fill), not forced-opaque
//   #3  Atlas typography — _atlStanza synthesises structure from ANY unstructured reply (multi-paragraph too, CJK-weighted;
//       model "Label:" leads → ## headings; opening sentence → bold lead); bigger lead + more paragraph spacing
//   #4  Street View coverage line — genuinely thinner via tileSize:128 overzoom + maxzoom:21
//   #5  Companies deeper history — Time-series default range widened to 20y (picker still reaches Yahoo's 1962 floor)
//   #6  Atlas sources — one _atlCleanUrl filter used by linkCards AND inline evidence links; relevance runs AFTER host-clean
//       (never blanks when real sources exist); the planner `answer` path now renders web-verified sources
//   #7  Companies↔Countries parity — the Time-series metric picker DRIVES the chart (mcap absolute / price indexed) with a
//       crosshair tooltip; /8→/10 labels; a workspace-mode filter box; a real price sparkline in the detail overlay
//   #8  Workspace mode — in-map popups drag again (_inWsWin guards on direct .ws-body child, not any .ws-win descendant)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');

test('R153 #1 Köppen legend widened to 264px + shorter rows + RU/ES names', () => {
  assert.match(html, /\.koppen-legend\{[^}]*width:264px; min-width:264px; max-width:264px;/, 'legend 200→264px (full names read)');
  assert.match(html, /\.kl-item\{[^}]*padding:0 4px;[^}]*line-height:1\.2;/, 'row block shortened (padding 0, line-height 1.2) so the last zone is reachable');
  assert.match(html, /window\.KNAME\[k\]\.ru=_kru\[k\]/, 'Russian climate names applied to KNAME');
  assert.match(html, /window\.KNAME\[k\]\.es=_kes\[k\]/, 'Spanish climate names applied to KNAME');
  assert.match(html, /Влажный тропический лес/, 'a real Russian climate name is present');
  assert.match(html, /Selva tropical/, 'a real Spanish climate name is present');
});

test('R153 #2 Measure/Share popups follow the shared glass material', () => {
  assert.match(html, /\.measure-dropdown, \.share-dropdown\{[^}]*background:var\(--glass-fill\);/, 'uses --glass-fill (opaque in Solid, frosted in glass modes)');
  assert.match(html, /\.measure-dropdown, \.share-dropdown\{[^}]*backdrop-filter:saturate\(var\(--glass-sat\)\) blur\(var\(--glass-blur\)\)/, 'blur reads the shared glass vars');
  assert.ok(!/\.measure-dropdown, \.share-dropdown\{[^}]*background:var\(--card-bg\);/.test(html), 'the R152 forced-opaque --card-bg is gone');
});

test('R153 #3 Atlas typography — deterministic structure synthesis (multi-paragraph + CJK + labels)', () => {
  assert.match(html, /function _atlStanza\(raw\)\{/, 'stanza restructurer exists');
  assert.ok(!/\(raw\.match\(\/\\n\/g\)\|\|\[\]\)\.length>1\) return raw;/.test(html), 'the >1-newline bail (why multi-paragraph prose stayed flat) is removed');
  assert.match(html, /const cjk=\(plainAll\.match/, 'CJK-weighted so dense Japanese replies still restructure');
  assert.match(html, /out\.push\('## '\+label\)/, 'a model "Label:" lead becomes a ## heading');
  assert.match(html, /out\.push\('\*\*'\+first\+'\*\*'\)/, 'the opening sentence becomes a bold lead');
  assert.match(html, /font-size:1\.3em;line-height:1\.28/, 'bold-lead heading is 1.3em (clearer step above body)');
  assert.match(html, /<div style="height:1\.2em"><\/div>/, 'paragraph gap widened to 1.2em');
});

test('R153 #4 Street View coverage line thinner via overzoom', () => {
  assert.match(html, /type:'raster',tileSize:128,minzoom:0,maxzoom:21/, 'svv source overzooms (tileSize 128) up to z21 for a ~2x thinner stroke');
});

test('R153 #5 Companies Time-series defaults to a deeper 20-year window; picker still reaches 1962', () => {
  assert.match(html, /if\(_coCmpTsFrom==null\) _coCmpTsFrom=cur-20;/, 'TS default range 10→20 years');
  assert.match(html, /for\(let y=cur;y>=1962;y--\)/, 'picker still reaches Yahoo\'s keyless 1962 floor');
});

test('R153 #6 Atlas sources — one cleaner, relevance-after-host-clean, answer path shows sources', () => {
  assert.match(html, /function _atlCleanUrl\(u\)\{/, 'single URL cleaner (decode aggregator + drop SNS)');
  assert.match(html, /function linkCards\(list, refText\)\{/, 'linkCards takes optional refText');
  assert.match(html, /if\(refText\) clean=_atlRelevantCards\(clean, refText\)/, 'relevance runs on the HOST-CLEANED set (never blanks to only-SNS)');
  assert.match(html, /const pu=_atlCleanUrl\(p\.url\)/, 'mapReport inline evidence link is cleaned');
  assert.match(html, /const eu=_atlCleanUrl\(latest\.it\.link\)/, 'events inline evidence link is cleaned');
  assert.match(html, /const sc=linkCards\(_acit\.map/, 'the planner `answer` path now renders web-verified sources (was zero)');
  assert.match(html, /if\(\(refCJK&&!refLat&&cardLat&&!cardCJK\)/, 'relevance is cross-script safe (keeps a same-topic card in the other language)');
});

test('R153 #7 Companies compare Time-series metric picker DRIVES the chart', () => {
  assert.match(html, /let _coCmpTsMetric='mcap';/, 'TS metric state exists');
  assert.match(html, /const metric=\(_coCmpTsMetric==='price'\)\?'price':'mcap'/, 'the metric drives the chart');
  assert.match(html, /pts=arr\.filter\(p=>p\[1\]>0\)\.map\(p=>\(\{fy:p\[0\],v:p\[1\]\*sh\}\)\)/, 'Market cap view plots absolute $ (shares × price)');
  assert.match(html, /data-cmptsm="/, 'TS metric toggle buttons rendered');
  assert.match(html, /if\(_coCmpMode!=='ts'\)/, 'the generic (do-nothing-in-TS) metric picker is hidden in TS mode');
  assert.match(html, /class="co-ts-tip"/, 'crosshair tooltip (Countries parity)');
});

test('R153 #7 Companies — /10 labels, workspace filter box, detail sparkline', () => {
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

test('R153 #8 Workspace map popups drag again (guard on direct .ws-body child)', () => {
  assert.match(html, /const _inWsWin=\(\)=>\{ try\{ return !!\(panel\.parentElement&&panel\.parentElement\.classList&&panel\.parentElement\.classList\.contains\('ws-body'\)\)/, 'drag guard fires only for window CONTENT (direct .ws-body child), not in-map popups');
  assert.ok(!/const _inWsWin=\(\)=>\{ try\{ return !!\(panel\.closest&&panel\.closest\('\.ws-win'\)\)/.test(html), 'the old over-broad closest(.ws-win) drag guard is gone');
});
