// R151 source-level regression checks (deterministic, no browser).
// Guards the batch:
//   #1  Companies UI parity — "Tap company rows to select and compare." empty hint (Countries parity)
//   #2  Atlas toggle buttons — globe + compare join the on/off switch set
//   #3  Köppen legend — stops when all classes shown (clamp to content) + stable row width (scrollbar-gutter)
//   #4  Toolbar — Radius folded into the Measure menu; Screenshot + link folded into one Share menu
//   #5  Atlas typography — a standalone **bold line** renders as a real sub-heading (model-independent hierarchy)
//   #6  Monitor highlight cleared on delete (tracked _shownMonId)
//   #7  Satellite — aggressive flight prefetch + tilted-move prefetch (3D keeps up)
//   #8  Street View ON → coverage auto-shown (and turned back off on close)
//   #9  Atlas model = GPT-5.6 Terra (ai-proxy default), Luna only as model-not-found fallback
//   #10 Companies — batched multi-symbol quotes (spark) + full-history cache (deep history, low latency)
//   #11 Atlas sources — SNS / UGC / shortener / video hosts dropped from source cards
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const aiproxy = readFileSync(new URL('supabase/functions/ai-proxy/index.ts', root), 'utf8');

test('R151 #1 Companies compare shows the Countries-parity empty hint', () => {
  // i18n key present in all five languages of the single i18n object
  for (const v of ['Tap company rows to select and compare.', '行をタップして会社を選び比較',
    'Unternehmenszeilen antippen zum Auswählen und Vergleichen.',
    'Нажимайте на строки компаний, чтобы выбрать и сравнить.', 'Toca filas de empresas para elegir y comparar.']) {
    assert.ok(html.includes(v), 'coCompareEmpty translation present: ' + v.slice(0, 24));
  }
  assert.match(html, /coCompareEmpty:/, 'coCompareEmpty key defined');
  // renderCoCompareFixed now renders the empty hint instead of removing the tray
  assert.match(html, /if\(!coCompareSet\.size\)\{ panel\.innerHTML=`<div class="scf-empty">\$\{t\('coCompareEmpty'\)\}<\/div>`; return; \}/, 'empty hint rendered (R152: static #co-compare-fixed panel, Countries parity)');
});

test('R151 #2 Atlas on/off toggles gain globe + compare switches', () => {
  assert.match(html, /globe:\{ lbl:\(\)=>L\('3D globe'/, 'globe feature toggle added');
  assert.match(html, /compare:\{ lbl:\(\)=>L\('Compare panel'/, 'compare feature toggle added');
  // projection + compare dispatch cases now append the toggle
  assert.match(html, /L\('Globe','地球儀','Globus','Глобус','Globo'\)\)\)\+_featTogHtml\('globe'\)/, 'projection case offers the globe toggle');
  assert.match(html, /_featTogHtml\('compare'\)/, 'compare case offers the compare toggle');
});

test('R151 #3 Köppen legend clamps to content (stops when all shown) + stable row width', () => {
  // ceiling = min(viewport, natural content height) — no more stretching into empty space past the last class
  assert.match(html, /const ceil=Math\.min\(renderedMax, Math\.ceil\(naturalBorderBox\)\);/, 'clamp to content OR viewport');
  assert.match(html, /lg\.style\.maxHeight='none'; lg\.style\.height='auto';/, 'measures natural height with a temporary auto');
  // scrollbar gutter reserved so the row text width is constant while resizing
  assert.match(html, /\.koppen-legend \.kl-scroll\{[^}]*scrollbar-gutter:stable;/, 'scrollbar-gutter:stable on the inner scroll');
});

test('R151 #4 toolbar: Radius under Measure menu, Screenshot + link under one Share menu', () => {
  // Radius button now lives INSIDE the measure dropdown
  assert.match(html, /<div class="measure-dropdown" id="measure-dropdown">[\s\S]*?id="btn-tool-radius"[\s\S]*?<\/div>\s*<\/div>/, 'radius inside measure dropdown');
  // a share menu container wraps the screenshot + share buttons
  assert.match(html, /<div class="share-menu-container">/, 'share menu container exists');
  assert.match(html, /id="btn-share-menu"/, 'share menu trigger exists');
  assert.match(html, /<div class="share-dropdown" id="share-dropdown">[\s\S]*?id="btn-screenshot"[\s\S]*?id="btn-share"[\s\S]*?<\/div>/, 'screenshot + share inside the share dropdown');
  // share menu wiring + i18n
  assert.match(html, /window\._closeShareMenu=/, 'share menu close helper wired');
  assert.match(html, /shareMenuBtn:"Share"/, 'Share menu label (EN)');
  // the measure-menu trigger now reflects an active Radius too
  assert.match(html, /toolMode==='radius'\|\|!!\(window\.DrawTool/, 'measure trigger reflects active radius');
});

test('R151 #5 Atlas typography: a standalone bold line becomes a real sub-heading', () => {
  assert.match(html, /\.replace\(\/\^\\\*\\\*\(\[\^\*\\n\]\{2,90\}\)\\\*\\\*\[ \\t\]\*:\?\[ \\t\]\*\$\/gm/, 'standalone **bold line** → heading rule');
  assert.match(html, /<div style="height:1\.5em"><\/div>/, 'generous explicit-paragraph gap (R158 1.5em)');
});

test('R151 #6 monitor highlight is cleared when the monitor is deleted', () => {
  assert.match(html, /let _shownMonId=null;/, 'tracks which monitor area is painted');
  assert.match(html, /function showOnMap\(area,points,monId\)\{ try\{ if\(!_ensureLayers\(\)\) return; _shownMonId=\(monId!=null\?monId:null\);/, 'showOnMap records the monitor id');
  assert.match(html, /if\(!error && \(_shownMonId===id \|\| _shownMonId==null\)\) clearMap\(\);/, 'remove() clears the leftover highlight');
});

test('R151 #7 satellite: flight + tilted-move prefetch keeps 3D imagery ahead', () => {
  assert.match(html, /function predictivePrefetch\(aggressive\)\{/, 'prefetch takes an aggressive flag');
  assert.match(html, /const RING=aggressive\?7:3/, 'flight uses a deeper directional ring');
  assert.match(html, /window\._imPredictivePrefetch\(true\)/, 'flight loop calls it aggressively');
  assert.match(html, /if\(currentMapType!=='sat'\) return; const now=Date\.now\(\); if\(\(map\.getPitch\(\)\|\|0\)>25 && now-_movePfT>320\)\{ _movePfT=now; predictivePrefetch\(true\); \}/, 'tilted 3D drag warms tiles mid-move');
});

test('R151 #8 Street View ON auto-shows coverage (restored on close)', () => {
  assert.match(html, /_covAuto=false/, 'auto-coverage flag declared');
  assert.match(html, /if\(!_cov\)\{ try\{ coverage\(true\); _covAuto=true; \}catch\(_\)\{\} \}/, 'open() enables coverage when it was off');
  assert.match(html, /if\(_covAuto\)\{ _covAuto=false; try\{ coverage\(false\); \}catch\(_\)\{\} \}/, 'close() restores coverage state');
});

test('R151 #9 Atlas model = GPT-5.6 Terra (Luna only as model-not-found fallback)', () => {
  assert.match(aiproxy, /const OPENAI_DEFAULT_MODEL = "gpt-5\.6-terra";/, 'ai-proxy default = Terra');
  assert.match(aiproxy, /const FALLBACK_MODEL = "gpt-5\.6-luna";/, 'Luna is the fallback');
  assert.match(aiproxy, /model_not_found\|does not have access to model/, 'fallback only on model-not-found');
});

test('R151 #10 Companies: batched spark quotes + full-history cache', () => {
  assert.match(html, /async function _spark\(syms, range, interval\)\{/, 'batched multi-symbol spark helper');
  assert.match(html, /finance\/spark\?symbols='/, 'uses the keyless spark endpoint');
  assert.match(html, /function _histAll\(\)\{/, 'full-history cache builder');
  assert.match(html, /const sp=await _spark\(live\.map\(c=>c\.tk\),'1d','1d'\)/, 'loadPrices fast path uses one batched request');
  assert.match(html, /let all=null; try\{ all=await _histAll\(\); \}catch\(_\)\{\} if\(my!==_hSeq\) return;/, 'setYear reads the year from the cache');
});

test('R151 #11 Atlas source cards drop SNS / UGC / shorteners / video hosts', () => {
  assert.match(html, /function _atlBadSourceHost\(h\)\{/, 'bad-source-host predicate exists');
  assert.match(html, /twitter\\\.com\|x\\\.com/, 'X/Twitter in the drop list');
  assert.match(html, /youtube\\\.com\|youtu\\\.be/, 'YouTube in the drop list');
  assert.match(html, /if\(_atlBadSourceHost\(host\)\) return null;/, 'R153: _atlCleanUrl (used by linkCards AND the inline evidence links) drops bad hosts');
  // prompt reinforcement
  assert.match(html, /NEVER cite social media, user-generated forums, link shorteners or video platforms/, 'analysis prompt forbids SNS sources');
  // exposed for hermetic tests
  assert.match(html, /badSourceHost:function\(h\)\{/, 'exposed on IntMapAtlasDebug');
});
