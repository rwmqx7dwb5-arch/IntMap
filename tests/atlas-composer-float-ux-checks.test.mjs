/* ============================================================================
 *  Atlas — the composer, the floating card, the long press and the place field   (atlas-composer-float-ux)
 * ----------------------------------------------------------------------------
 *  ⚠ THE DEFECTS, RESTATED — not the fixes ([[intmap-restate-the-defect-not-the-fix]]):
 *    ① a one-line input showed a scrollbar on hover: it was border-box and its height was set to the text's height without the
 *       border, so it was 2px short of its own text and always "overflowed";
 *    ② clicking into the in-place editor drew a blue ring around it;
 *    ③ a touch screen has no hover, so the copy/edit bar under every message of the reader's was either always on or unreachable
 *       — and a long press on iOS opens the system's text selection over anything else;
 *    ④ the floating card ended on a hard edge, sat above where the Chronos bar sits, carried a button and a name that restated
 *       what the sidebar tab already is, and its words were hard to read on a bright map;
 *    ⑤ the place field offered «Ask Atlas», a second way into Atlas from a field that is for places.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('① the scrollbar belongs to text that overflows, not to a box that is hovered', () => {
  const styles = read('js/atlas-styles.js'), tools = read('js/atlas-msg-tools.js'), con = read('js/atlas-console.js');
  assert.match(styles, /#atlas-panel \.atl-in\{[^}]*overflow-y:hidden;/, 'the composer rests with no scrollbar');
  assert.match(tools, /\.atl-edit-in\{[^}]*overflow-y:hidden;/, 'and so does the editor');
  assert.match(con, /inEl\.style\.overflowY=\(inEl\.scrollHeight>inEl\.clientHeight\+2\)\?'auto':'hidden'/, 'it turns on when the text overflows');
  assert.match(tools, /ta\.style\.overflowY=\(ta\.scrollHeight>ta\.clientHeight\+2\)\?'auto':'hidden'/, 'the editor too');
  assert.match(con, /inEl\.scrollHeight\+\(inEl\.offsetHeight-inEl\.clientHeight\)/, 'the height counts the border (border-box), so a box is never short of its own text');
  assert.match(tools, /ta\.scrollHeight\+\(ta\.offsetHeight-ta\.clientHeight\)/);
});

test('② the editor draws no ring around itself when focused', () => {
  const tools = read('js/atlas-msg-tools.js');
  const rule = /\.atl-edit-in:focus,#atlas-panel \.atl-edit-in:focus-visible\{([^}]*)\}/.exec(tools);
  assert.ok(rule, 'a focus rule exists');
  assert.match(rule[1], /outline:none/);
  assert.match(rule[1], /box-shadow:none/);
  assert.ok(!/0 0 0 3px rgba\(10,132,255/.test(tools), 'the blue ring is gone');
});

test('③ a touch screen opens a menu on a long press instead of showing a bar', () => {
  const tools = read('js/atlas-msg-tools.js'), con = read('js/atlas-console.js');
  assert.match(tools, /@media\(hover:none\)\{#atlas-panel \.atl-msgt-u\{display:none;\}/, 'the bar is gone on touch');
  assert.match(tools, /\.atl-b\.u\{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;\}/, 'iOS callout and selection are off on the bubble');
  assert.match(tools, /e\.pointerType!=='touch'/, 'only a touch pointer starts it');
  assert.match(tools, /addEventListener\('contextmenu',e=>\{ if\(Date\.now\(\)-lastTouch<2500\) e\.preventDefault\(\); \}\)/, "the system's menu is suppressed after a touch press");
  assert.match(tools, /timer=setTimeout\(\(\)=>\{ timer=0; open\(\); \},430\)/, 'held for less than the ~500 ms of the system menu');
  assert.match(tools, /orig\.click\(\)/, "the menu presses the bar's own buttons: one implementation of copy and edit");
  assert.match(con, /pressMenu\(d,bar\)/, "every bubble of the reader's gets it");
});

test('④ the floating card fades, sits at the Chronos bar, and says nothing the tab already says', () => {
  const f = read('js/atlas-float.js');
  assert.ok(!/atlFloatToTab|atl-float-tab|atl-float-name/.test(f), 'no «open in the Atlas» button and no «Atlas» name');
  assert.match(f, /#atlas-float\{position:absolute;left:16px;top:36px;bottom:6px;/, "higher top, input at the Chronos bar's height");
  assert.match(f, /mask-image:linear-gradient\(to bottom,transparent 0,#000 56px,#000 calc\(100% - 30px\),transparent 100%\)/, 'both ends dissolve');
  assert.match(f, /\.atl-chat\{[^}]*padding:56px 4px 30px/, 'the padding equals the fades, so resting text is never in one');
  const i = f.indexOf('--atl-glow:');
  const halo = /--atl-glow:([^;]*);/.exec(f.slice(i));
  assert.ok(halo && (halo[1].match(/rgba\(var\(--atl-halo\)/g) || []).length >= 5, 'a five-layer halo');
  /* the way to the tab is still there: the sidebar's own Atlas button */
  assert.match(read('index.html'), /id="btn-community"/);
});

test('⑤ the place field finds places only', () => {
  const g = read('js/search-geocode.js'), m = read('js/mobile-ui.js');
  assert.ok(!/_askAtlasRow|ms-atlas/.test(g), 'no «Ask Atlas» row');
  assert.match(m, /IntMapLang\.t\(HOST\.lang,'Search places','場所を検索'\)/);
  assert.ok(!/Search places or ask Atlas/.test(m));
});

test('⑥ the composer is closer to the edge and its send button is smaller', () => {
  const s = read('js/atlas-styles.js');
  assert.match(s, /#atlas-panel \.atl-go\{flex:0 0 auto;width:34px;height:34px;/);
  assert.match(s, /#atlas-panel \.atl-inbar\{[^}]*padding:6px 9px 2px;/);
  assert.match(s, /\.atl-ainote\{[^}]*padding:0 12px 3px;/);
});
