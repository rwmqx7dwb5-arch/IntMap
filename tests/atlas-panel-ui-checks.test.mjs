/* ============================================================================
 *  Atlas · the panel's own controls — the send/stop button, the choice input, the on/off toggles a
 *  reply offers (js/atlas-styles.js, and markup built inside js/atlas-console.js)
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from R149–R156; every test keeps the title it had there:
 *    tests/r149-checks.test.mjs #5/#6 #8 #2 · tests/r150-checks.test.mjs #5 #2 ·
 *    tests/r151-checks.test.mjs #2 · tests/r156-checks.test.mjs #6
 *  ⚠ The stylesheet assertions read atlasPanelCSS() — the CSS js/atlas-styles.js injects — rather than
 *  the concatenated source. The markup assertions (the stop square, the choice button, the toggle
 *  rows) stay spellings: that markup is built inside js/atlas-console.js's closure, which needs the page.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appSource } from './app-source.mjs';
import { atlasPanelCSS } from '../js/atlas-styles.js';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const CSS = atlasPanelCSS();
test('R149 #5/#6 send button arrow solid black when idle; bigger stop square', () => {
  /* kept as a spelling: the stop square, the choice button and the toggle rows are markup built inside js/atlas-console.js’s closure, which needs the page */
  assert.match(CSS, /\.atl-go\.idle\{background:#fff;box-shadow:0 1px 4px rgba\(0,0,0,0\.12\);color:#111;border-color:rgba\(0,0,0,0\.08\);\}/, 'idle icon is #111 on white (R156 added a border; active/busy are accent — see the #R156 checks)');
  assert.ok(!/\.atl-go\.idle\{[^}]*rgba\(120,120,128,0\.75\)/.test(CSS), 'old faded idle colour removed');
  assert.match(html, /_GO_STOP_SVG='<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4\.25" y="4\.25" width="15\.5" height="15\.5"/, 'stop square slightly smaller (R150 17.5→15.5)');
});
test('R149 #8 choice free-input send button = white bg + SVG (no plain-text →)', () => {
  /* kept as a spelling: the stop square, the choice button and the toggle rows are markup built inside js/atlas-console.js’s closure, which needs the page */
  // the .atl-choice-go button must no longer be accent bg with a plain-text arrow
  assert.match(html, /class="atl-choice-go"/, 'atl-choice-go button present');
  assert.match(html, /background:#fff;color:#111;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;box-shadow:0 1px 4px rgba\(0,0,0,0\.14\);"><svg/, 'white bg + black + SVG icon');
  assert.ok(!/;">→<\/button>/.test(html), 'no plain-text → glyph in a send button');
});
test('R149 #2 ticker gets an on/off toggle', () => {
  /* kept as a spelling: the stop square, the choice button and the toggle rows are markup built inside js/atlas-console.js’s closure, which needs the page */
  assert.match(html, /ticker:\{ lbl:\(\)=>L\('Bottom ticker'/, 'ticker in _FEAT_TOG');
  assert.match(html, /note\('✓ '\+L\('Bottom ticker'[\s\S]*?\)\)\+_featTogHtml\('ticker'\)/, 'ticker reply offers the toggle');
});
test('R150 #5 stop-answering square trimmed 17.5 → 15.5', () => {
  /* kept as a spelling: the stop square, the choice button and the toggle rows are markup built inside js/atlas-console.js’s closure, which needs the page */
  assert.match(html, /_GO_STOP_SVG='<svg viewBox="0 0 24 24" width="20" height="20"><rect x="4\.25" y="4\.25" width="15\.5" height="15\.5"/, 'rect is 15.5 in a 24 viewBox');
  assert.ok(!/width="17\.5" height="17\.5" rx="3\.5"/.test(html), 'the R149 17.5 square is gone');
});
test('R150 #2 Atlas Street-View OFF reply offers the on/off toggle', () => {
  /* kept as a spelling: the stop square, the choice button and the toggle rows are markup built inside js/atlas-console.js’s closure, which needs the page */
  assert.match(html, /Street View off','ストリートビューをオフ'[\s\S]{0,120}\)\)\+_featTogHtml\('streetview'\)\)/, 'the OFF reply carries the toggle to flip it back on');
});
test('R151 #2 Atlas on/off toggles gain globe + compare switches', () => {
  /* kept as a spelling: the stop square, the choice button and the toggle rows are markup built inside js/atlas-console.js’s closure, which needs the page */
  assert.match(html, /globe:\{ lbl:\(\)=>L\('3D globe'/, 'globe feature toggle added');
  assert.match(html, /compare:\{ lbl:\(\)=>L\('Compare panel'/, 'compare feature toggle added');
  // projection + compare dispatch cases now append the toggle
  assert.match(html, /L\('Globe','地球儀','Globus','Глобус','Globo'\)\)\)\+_featTogHtml\('globe'\)/, 'projection case offers the globe toggle');
  assert.match(html, /_featTogHtml\('compare'\)/, 'compare case offers the compare toggle');
});
test('R156 #6 send/stop button = accent (idle keeps the previous white/black)', () => {
  assert.match(CSS, /#atlas-panel \.atl-go\{flex:0 0 auto;width:38px;height:38px;border-radius:50%;border:1px solid transparent;background:var\(--primary-fill\);color:#fff;/, 'base (active) button = accent fill + white icon (the FILL token: white on it is ≥4.5:1 in both themes, tests/ui-a11y-polish-checks ⑥)');
  assert.match(CSS, /#atlas-panel \.atl-go\.idle\{background:#fff;box-shadow:0 1px 4px rgba\(0,0,0,0\.12\);color:#111;/, 'idle (empty input) keeps the previous white bg + black ↑');
  assert.match(CSS, /#atlas-panel \.atl-go\.busy\{background:var\(--primary-fill\);box-shadow:0 2px 8px rgba\(0,0,0,0\.2\);color:#fff;/, 'Stop (busy) button = accent fill + white square');
});
