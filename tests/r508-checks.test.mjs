/* ============================================================================
 *  IntMap · #R508 source checks
 * ----------------------------------------------------------------------------
 *  One report: 「Terms of Service · Privacy Policy をクリックして読もうとしても、設定に邪魔されて
 *  読めない。」 The behaviour itself is measured in tests/r508.spec.js, because it is a computed
 *  z-index and no source file holds it. What CAN be held here is the pair of facts that made the
 *  defect possible, and the one that makes the fix work:
 *
 *  ① the number in js/map-ui.js and the number in css/intmap.css are the SAME number
 *     — the fix compares a panel's z-index against `.im-front`'s own level, so a build where the
 *       CSS moved and the JS did not is a build where the guard silently stops guarding;
 *  ② the guard runs BEFORE the machinery, and it is asked of the layout rather than of a list of
 *     dialog ids — a name list is the shape #R253 already refused;
 *  ③ the dialogs are still above the band, i.e. the fix did not "solve" this by demoting them.
 *
 *  ⚠ Assertions that match on TEXT read the source with COMMENTS STRIPPED — this round's own note
 *  in js/map-ui.js quotes `.im-front`, `2650` and `#legal-modal` while explaining the defect.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① ONE NUMBER, TWO FILES ─────────────────────────────────────────────────────────────────── */
test('#R508 ① the front-band level in js/map-ui.js is the level css/intmap.css actually applies', () => {
  const css = read('css/intmap.css');
  const fromCss = /\.im-front\{\s*z-index:(\d+)\s*!important/.exec(css);
  assert.ok(fromCss, '.im-front no longer sets a z-index — the guard has nothing to compare against');

  const ui = code(read('js/map-ui.js'));
  const fromJs = /const\s+_FRONT_Z\s*=\s*(\d+)/.exec(ui);
  assert.ok(fromJs, '_FRONT_Z is gone from js/map-ui.js — re-derive this check against whatever replaced it');

  assert.equal(fromJs[1], fromCss[1],
    `the two copies of the front-band level have drifted: js/map-ui.js says ${fromJs[1]}, css/intmap.css applies ${fromCss[1]}`);
});

/* ── ② THE GUARD IS ASKED OF THE LAYOUT, AND IT RUNS FIRST ───────────────────────────────────── */
test('#R508 ② a layer above the band is exempted, by measurement rather than by name', () => {
  const ui = code(read('js/map-ui.js'));

  const guard = /const\s+_aboveBand\s*=\s*\(el\)\s*=>\s*\{([\s\S]*?)\n\s{6}return false; \};/.exec(ui);
  assert.ok(guard, 'the _aboveBand walk is gone');
  assert.match(guard[1], /getComputedStyle\(n\)\.zIndex/,
    'the guard no longer READS the resolved z-index — a hand-written list of dialog ids is the shape #R253 refused');
  assert.match(guard[1], />\s*_FRONT_Z/,
    'the comparison is not strictly above the band: a panel already wearing .im-front computes to exactly that level and must stay demotable');
  assert.match(guard[1], /contains\('im-front'\)/,
    'the walk no longer skips the mark it set itself — a raised panel would exempt itself for ever');

  /* it has to be the FIRST thing act() does: below the demote branch it would still clear the mark */
  const act = /const\s+act\s*=\s*\(t,\s*mayDemote\)\s*=>\s*\{([\s\S]*?)raise\(p\); \};/.exec(ui);
  assert.ok(act, 'act() no longer has the shape this check was written against');
  const iGuard = act[1].indexOf('_aboveBand(t)');
  const iPanel = act[1].indexOf('panelOf(t)');
  assert.ok(iGuard >= 0, 'act() no longer consults _aboveBand — the machinery is back to marking dialogs');
  assert.ok(iGuard < iPanel, 'the guard runs after the panel is chosen; it has to run before anything else in act()');
  assert.match(act[1].slice(iGuard, iGuard + 60), /return/,
    'the guard does not RETURN — a dialog would still fall through to the demote branch');
});

/* ── ③ THE DIALOGS ARE STILL ABOVE THE BAND ──────────────────────────────────────────────────── */
test('#R508 ③ the fix did not lower the dialogs into the band to get out of the way', () => {
  const css = read('css/intmap.css');
  const band = +(/\.im-front\{\s*z-index:(\d+)\s*!important/.exec(css) || [])[1];
  const overlay = /\.modal-overlay\{[^}]*z-index:(\d+)/.exec(css);
  assert.ok(overlay, '.modal-overlay no longer carries a z-index');
  assert.ok(+overlay[1] > band,
    `.modal-overlay is at ${overlay[1]}, at or below the front band (${band}) — a dialog must outrank every panel, and the exemption in js/map-ui.js is written for that`);
});
