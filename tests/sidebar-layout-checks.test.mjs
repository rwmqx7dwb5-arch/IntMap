/* ============================================================================
 *  IntMap · the two sidebars — they overlay the map and never move it, and there is one layer panel
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r160-checks.test.mjs (A)–(C), tests/r154-checks.test.mjs #8 #9 and
 *  tests/r155-checks.test.mjs (R155 / R296). The renderer-facade half of #R160, (D1)–(D3), is
 *  tests/renderer-facade-checks.test.mjs. From their headers:
 * ==========================================================================*/
// Batch: (A) right-sidebar default width smaller (340→300); (B) BOTH sidebars OVERLAY a fixed full-width map so
// opening/closing a panel can NEVER resize or recentre the map ("左サイドバー/右サイドバー開閉で地図が勝手に動く"
// の根絶) — the R158/R159 per-frame-resize + edge-anchor machinery is deleted; (C) settings save no longer
// force-reopens the right sidebar ("設定を変更すると勝手に右サイドバーが出てくる"). Literal-substring assertions
// guard the load-bearing lines.
//   #8  Normal-mode layer panel defaults to the RIGHT sidebar
//   #9  Right sidebar is drag-resizable (left edge) + smaller default width (430→380) + honours the saved width
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const index = html;             /* #R155's name for the same concatenation */
const has = (s) => html.includes(s);
const ok = (s, msg) => assert.ok(has(s), msg || ('missing: ' + s.slice(0, 90)));
const gone = (s, msg) => assert.ok(!has(s), msg || ('should be removed: ' + s.slice(0, 90)));
/* ⚠ WHY THESE READ THE SOURCE. Sidebar geometry is CSS plus DOM handlers in the app shell; whether the map
   moves is a browser measurement. What is pinned is the rule text, and — for the removals — that
   the mechanisms #R160 deleted are not back. */
test('R160 (A) right sidebar default width smaller (340 → 300)', () => {
  /* spelling kept — sidebar geometry is CSS + shell DOM handlers; whether the map moves is a browser measurement */
  ok(':root{--lsr-w:min(300px,92vw);}', 'CSS default width 300');
  ok('Math.max(280,Math.min(300,', 'JS default cap 300 (floor 280 kept)');
  gone('--lsr-w:min(340px,92vw)', 'the old 340 default is gone');
  gone('--lsr-w:min(380px,92vw)', 'the old 380 default is gone');
});

test('R160 (B1) the LEFT sidebar keeps its ORIGINAL mechanism, UNCHANGED — SOLID=beside-flex, FROSTED=overlay', () => {
  /* spelling kept — sidebar geometry is CSS + shell DOM handlers; whether the map moves is a browser measurement */
  // SOLID mode: the sidebar is a flex sibling and the map sits beside it (position:relative, NOT an overlay).
  ok('.sidebar{ position:relative; }', 'solid sidebar stays a flex sibling');
  // FROSTED mode ONLY overlays the map (unchanged #23 behaviour).
  ok('body.sidebar-glass .map-container{ position:absolute; inset:0; width:100%; }', 'only the frosted sidebar overlays a full-width map');
  ok('body.sidebar-glass .sidebar{ position:absolute; left:0; top:0; bottom:0; height:100%; z-index:var(--z-controls);', 'frosted sidebar is the overlay');   /* (map-a11y-structure) the controls layer — tests/z-layers-baseline.json holds its number */
  // the wrong overlay-for-everything generalisation AND the transition:none tweak are both reverted — the sidebar
  // CSS is exactly the original (nothing about the mechanism or its animation was touched).
  gone('body:not(.ws-mode) .map-container{ position:absolute; inset:0; width:100%; }', 'the map-container is NOT force-overlaid in solid mode');
  gone('body:not(.sidebar-glass) .sidebar{ transition:none; }', 'the sidebar animation is left as the original (no transition tweak)');
});

test('R160 (B2) the R158/R159 per-frame resize + edge-anchor machinery is DELETED (nothing replaces it)', () => {
  /* spelling kept — sidebar geometry is CSS + shell DOM handlers; whether the map moves is a browser measurement */
  gone('function _sbCaptureAnchor(side){', 'per-frame anchor-capture helper deleted');
  gone('function _sbReanchor(){', 'per-frame reanchor helper deleted');
  gone('function _sbFrame(){', 'per-frame resize loop deleted');
  gone('function _sbFinishAnim(){', 'finish-anim helper deleted');
  // a plain coalesced resize survives, for GENUINE viewport changes only (keyed on _rsRAF, not the old _sbRAF loop)
  ok('const coalescedResize=()=>{ if(_rsRAF) return;', 'plain coalesced resize kept for real window/container resizes');
});

test('R160 (B3) the LEFT toggle never PANS the camera (no pin, no panBy — panBy ROTATES a globe)', () => {
  /* spelling kept — sidebar geometry is CSS + shell DOM handlers; whether the map moves is a browser measurement */
  // The whole point: the toggle only flips `collapsed` + syncs material classes + nudges the pill. It must not call
  // panBy / easeTo / map.resize — every one of those moved or rotated the map. The ResizeObserver re-fits.
  /* ⚠ (#R299) THIS PINNED A TRAILING COMMENT AND THE COMMENT HAD BECOME FALSE. 「フロストガラス設定の時だけ、
     左サイドバーの余白に地図中心を合わせるという機構がない。同じ動きになるようにしろ。」 In SOLID mode the sidebar
     is a flex sibling, so the canvas itself is narrower and no compensation is owed — that is #R160's finding and
     it still holds. In FROSTED mode the canvas keeps the whole window and the sidebar stands ON it, so the two
     modes were not doing the same thing at all. Camera PADDING is the statement 「the usable box is narrower than
     the canvas」; it is not a pan, and it is exactly what the flex layout already states for solid.
     So the relation is pinned instead of the sentence: the toggle still routes through `applySidebarStyle`, and
     the padding it may write is FROSTED-ONLY and is 0 for solid. */
  ok('try{ applySidebarStyle(false); }catch(_){}', 'toggle routes through the one style/material function');
  ok('function _glassInset()', 'the frosted overlay measures its own width');
  ok("if(!document.body.classList.contains('sidebar-glass')) return 0;", 'solid gets no inset — #R160’s double shift stays gone');
  ok("try{ window.dispatchEvent(new Event('intmap-sidebar-resize')); }catch(_){}   /* recompute the search-pill layout only */", 'toggle only nudges the search-pill layout');
  // no camera manipulation of ANY kind lives in the toggle handler
  gone('if(solidBeside && map){', 'the R160 edge-pin block is gone');
  gone('map.panBy([-dx,-dy],{duration:0}); }', 'no panBy in the toggle (it would spin the globe)');
});

test('R160 (B4) applySidebarStyle no longer shifts the camera on toggle/style change', () => {
  /* spelling kept — sidebar geometry is CSS + shell DOM handlers; whether the map moves is a browser measurement */
  gone('map.easeTo({padding:_pad, duration:400', 'the frosted optical-center easeTo is gone');
  gone('const pad=(document.body.classList.contains(\'ws-mode\')) ? 0 : (collapsed ? 0 : (sb ? sb.offsetWidth : 440));', 'no sidebar-width padding computed on toggle');
  ok('NO camera padding on toggle or style change anymore', 'documented: the sidebar style change never pans the map');
  ok("document.body.classList.toggle('sidebar-glass', frosted);", 'the frosted material class is still applied');
});

test('R160 (B5) the RIGHT sidebar no longer pushes the map; right HUD slides to clear it; left HUD stays glass-only', () => {
  /* spelling kept — sidebar geometry is CSS + shell DOM handlers; whether the map moves is a browser measurement */
  gone('body.lsr-open .map-container{margin-right', 'the desktop margin-right push is gone (both desktop + mobile variants)');
  gone("mc.style.marginRight=isMob()?'':'var(--lsr-w)'", 'open() no longer pushes the map via inline margin');
  ok('if(mc&&mc.style.marginRight) mc.style.marginRight=', 'open() clears any stale inline margin instead');
  // right-anchored HUD slides left by the panel width while the panel is open
  ok('body.lsr-open:not(.ws-mode) .map-controls-top{ right:calc(var(--lsr-w) + 10px); }', 'top-right controls clear the open right panel');
  /* ⚠ (#R504) THE OFFSET IN EACH RULE IS THAT ELEMENT'S OWN CORNER INSET, PLUS THE PANEL. The two
     numbers below differ because the two elements sit at different distances from the edge —
     .map-controls-top at 10 px, Chronos at 6 px since the coord readout was tucked in to meet it —
     and what this test is about is that each one CLEARS the panel, not that they agree. Reading the
     inset from the element's own rule is what keeps that true when either corner moves again. */
  ok('body.lsr-open:not(.ws-mode) .news-timeline{ right:calc(var(--lsr-w) + 6px); }', 'the news timeline clears the open right panel');
  // the LEFT sidebar is beside the map in solid mode, so its HUD shift stays FROSTED-only (reverted the generalisation)
  ok('body.sidebar-glass .coord-readout{ left:calc(var(--sidebar-w) + 12px); }', 'coord readout shift is frosted-only again');
  gone('body:not(.ws-mode) .coord-readout{ left:calc(var(--sidebar-w) + 12px); }', 'left HUD is NOT shifted in solid (beside) mode');
});

/* ⚠ (#R296) #R160's defect was 「設定を変更すると勝手に右サイドバーが出てくる」: `apply()` re-opens the
   panel and ran on EVERY settings save. Its fix was to run it only when the layer-panel mode changed.
   This round removed the mode, and with it the save path — so the guard is not weakened, its whole
   subject is gone. What must stay true is that saving a setting cannot call `apply()` at all. */
test('R160 (C) / R296: saving a setting cannot reopen the layer sidebar', () => {
  /* spelling kept — sidebar geometry is CSS + shell DOM handlers; whether the map moves is a browser measurement */
  gone("v('setting-layerpanel')", 'the layer-panel control is not read on save');
  gone('_oldLP', 'the previous-mode capture the guard needed is gone with the mode');
  /* ⚠ `IntMapLayerSidebar.apply()` itself STAYS — js/workspace.js calls it when a workspace window
     is torn down, which is a real reconciliation and not a settings save. The check is about the
     SETTINGS path, so it names what only that path had. */
});

/* ⚠ (#R296) THIS ROUND REMOVED THE CHOICE, SO THE CHECK BECAME AN INVARIANT ABOUT THERE BEING ONE.
   「レイヤー選択欄はclassic dropdownを完全削除。（右サイドバー形式に一本化し、設定から該当項目を削除。）」
   #R154 asserted the DEFAULT was 'right' and #R155 that a saved value could override it. There is no
   longer anything to default away from: what has to stay true is that the value is fixed and that no
   saved setting can move it — which is a stronger statement than either of the two it replaces. */
test('R154 #8 / R296: the layer panel is the right sidebar, and nothing can choose otherwise', () => {
  /* spelling kept — sidebar geometry is CSS + shell DOM handlers; whether the map moves is a browser measurement */
  assert.match(html, /window\.imLayerPanel='right';/, "the one value");
  assert.doesNotMatch(html, /window\.imLayerPanel=s\.layerPanel/, 'a saved setting cannot reassign it');
  assert.doesNotMatch(html, /window\.imLayerPanel=v\('setting-layerpanel'\)/, 'and neither can a control');
  assert.doesNotMatch(html, /id="setting-layerpanel"/, 'the Settings row is gone');
});

test('R154 #9 Right sidebar resizable + smaller default', () => {
  /* spelling kept — sidebar geometry is CSS + shell DOM handlers; whether the map moves is a browser measurement */
  assert.match(html, /:root\{--lsr-w:min\(300px,92vw\);\}/, 'default width 430→380→340→300 (R160)');
  assert.match(html, /#layer-sidebar-r \.lsr-resizer\{position:absolute;top:0;left:-3px;/, 'left-edge resize handle CSS');
  assert.match(html, /rh\.className='lsr-resizer';/, 'resizer element created in build()');
  assert.match(html, /let w=rsw-\(e\.clientX-rsx\);/, 'grows as the cursor moves left');
  assert.match(html, /localStorage\.setItem\('intmap_lsr_w', String\(sb\.offsetWidth\)\)/, 'persists the dragged width');
  assert.match(html, /let saved=parseInt\(localStorage\.getItem\('intmap_lsr_w'\)\|\|'',10\);/, 'open() honours the saved width');
  assert.match(html, /\(saved>=260\)\?Math\.min\(saved,cap\):Math\.max\(280,Math\.min\(300/, 'saved width used, else the 300 default (R160)');
});

/* ⚠ (#R296) the explicit-choice gate this asserted existed to let a saved 'classic' survive the
   right-hand default. 「classic dropdownを完全削除」 removed the thing that was chosen, so the gate is
   gone and the invariant is that NO stored value reaches `imLayerPanel` — a reader who had picked
   'classic' gets the sidebar rather than a panel that no longer opens. */
/* ⚠ (#R296) READ THE CODE, NOT THE PROSE — this is the twentieth round in which a check aimed at a
   removed name matched the COMMENT that explains the removal. `appSource` concatenates whole files,
   so the note beside the `collect()` line (「layerPanel / layerPanelSet are no longer saved」) is a
   perfectly good occurrence of the very word this asserts is gone. Assert about what RUNS. */
test('R155 / R296: no stored value can select a layer panel, because there is only one', () => {
  /* spelling kept — sidebar geometry is CSS + shell DOM handlers; whether the map moves is a browser measurement */
  const code = codeOnly(index);
  assert.doesNotMatch(code, /layerPanelSet/, 'the explicit-choice flag is gone from the settings round trip');
  assert.doesNotMatch(code, /layerPanel:\s*window\.imLayerPanel/, 'and the value is no longer saved');
});
