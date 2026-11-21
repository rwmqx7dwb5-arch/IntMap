/* The map-engine switch asks in the app, not through window.confirm().
   Why: a host that does not open native dialogs (the Claude desktop app's browser pane) answers «no»
   without showing anything, so the select snapped back and Cesium could not be chosen there. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the engine switch asks through askInApp, and never window.confirm', () => {
  const src = read('js/app-body.js');
  const at = src.indexOf("case 'setting-engine'");
  assert.ok(at > 0, 'the setting-engine case exists');
  const body = src.slice(at, src.indexOf("case 'setting-sidebar-style'", at));
  assert.match(body, /askInApp\(/, 'it asks in the app');
  assert.doesNotMatch(body, /(^|[^.\w])confirm\(/, 'it does not call the native confirm');
  assert.match(body, /r===null/, 'a cancel puts the choice back');
});

test('there is exactly one in-app asker: its markup is built in one file only', () => {
  const builders = ['js/ask-dialog.js', 'js/auth-ui.js', 'js/app-body.js']
    .filter((p) => /createElement\('div'\);\s*d\.id='acct-ask'/.test(read(p)));
  assert.deepEqual(builders, ['js/ask-dialog.js']);
  assert.match(read('js/auth-ui.js'), /askInApp\(o,\(\)=>HOST\.lang\)/, 'the account sheet uses the shared asker');
});

test('the asker stacks above every modal overlay, so a question asked from Settings can be answered', () => {
  const css = read('css/intmap.css');
  const modal = /\.modal-overlay\{[^}]*z-index:calc\(var\(--z-modal\) - 1\)/.test(css);
  assert.ok(modal, 'modal overlays sit at z-modal − 1 (if this moves, the asker must move with it)');
  assert.match(read('js/ask-dialog.js'), /z-index:calc\(var\(--z-overlay\) \+ \d+\)/, 'the asker is on the overlay layer, above z-modal');
});
