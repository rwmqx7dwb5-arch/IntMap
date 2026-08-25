/* ============================================================================
 *  IntMap · R466 — the gate said 100 %, production said «Display name»
 * ----------------------------------------------------------------------------
 *  #R459 widened scripts/i18n-attr-audit.mjs and translated the 29 reader-facing attributes it
 *  found. Production verification in French and Korean then showed two of them STILL English:
 *
 *      #am-name  placeholder="Display name"
 *      #am-pass  placeholder="Password"
 *
 *  ⚠⚠⚠ AND `npm run check:i18n` PRINTED fr 100 % WHILE THAT WAS ON SCREEN. #R459 wrapped both in
 *  `_authL(…)`, which is js/auth-ui.js's LAZY WRAPPER —
 *
 *      function _authL(){ if(!_authL._p) _authL._p = window.IntMapLang.pick(()=>HOST.lang);
 *                         return _authL._p.apply(null, arguments); }
 *
 *  — and that is the ONE shape scripts/i18n-helpers.mjs cannot prove is a helper. Architecture.md
 *  §10.1 already records the same case for js/map-readout.js. An unproven callee means the English
 *  strings never enter the inline `want` set; `pick()` resolves the first five languages
 *  POSITIONALLY and the other four out of the inline table, so fr / ko / zh fell through to
 *  argument 0 — the English — and no percentage anywhere could go down.
 *
 *  ⚠ SO THE LESSON IS NOT «add two rows». It is that «translated» was decided by the CALL GRAPH,
 *  and the call graph has a shape it cannot see. This file therefore asks the question the reader
 *  asks, of the TABLES rather than of the call graph: for each English string this family put on
 *  screen, does the French / Korean / Chinese table actually carry something else?
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readFileSync(path.join(ROOT, p), 'utf8');

/* the four languages that have NO positional slot: they can only resolve out of the inline table,
   keyed by the English string. The other five are pinned by the positional surface of the gate. */
const INLINE = { fr: 'ui.fr.js', ko: 'ui.ko.js', zh: 'ui.zh.js', 'zh-hans': 'ui.zh-hans.js' };

/* every English string #R459/#R466 put behind a reader-facing attribute through the inline table */
const SHIPPED = [
  'Close', 'Close popup', 'Base map', 'Base map and projection',
  'Display name', 'Password', 'email', 'API key', 'remove', 'file: ',
  'Expand', 'Minimize',
  /* ⚠ THE ACCOUNT SHEET HAS A SECOND WRITER. `#am-pass`'s placeholder is set by the markup
     template AND rewritten by the tab switcher, so fixing one arm leaves the other — the same
     shape as the ★ that #R459 was reported for. The switcher's own strings are these three. */
  'Password (min. 8 chars, incl. a number)', 'Log In', 'Create account',
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* the row as the locale file writes it: 'English': 'translation', either quote, either side */
function lookup(src, en) {
  const re = new RegExp('(["\'])' + esc(en) + '\\1\\s*:\\s*(["\'])((?:\\\\.|(?!\\2)[^\\\\])*)\\2');
  const m = src.match(re);
  return m ? m[3] : null;
}

test('R466 ① every attribute string this family ships resolves in fr / ko / zh, and is not the English word', () => {
  const bad = [];
  for (const [code, file] of Object.entries(INLINE)) {
    const src = R('js/locales/' + file);
    for (const en of SHIPPED) {
      const got = lookup(src, en);
      if (got == null) bad.push(`${code}: "${en}" has no row`);
      else if (got === en) bad.push(`${code}: "${en}" is still the English word`);
    }
  }
  assert.deepEqual(bad, [], bad.join(' · '));
});

/* ⚠ AND THE CALL SITE HAS TO STAY VISIBLE. Putting these back behind `_authL(…)` would make the
   gate green again without changing what a French reader sees — which is the whole defect. */
test('R466 ② every writer of the account sheet goes through a callee the instruments can prove', () => {
  const src = R('js/auth-ui.js');
  /* ⚠ BOTH WRITERS OF #am-pass. The markup template sets the placeholder and the tab switcher
     rewrites it a moment later, so a fix to one of them is invisible on screen. */
  for (const en of ['Display name', 'Password', 'Password (min. 8 chars, incl. a number)', 'Log In', 'Create account']) {
    assert.match(src, new RegExp('window\\.IntMapLang\\.t\\(HOST\\.lang,\\s*\'' + esc(en) + '\''),
      `${en} must be spelled window.IntMapLang.t(HOST.lang, …)`);
    assert.doesNotMatch(src, new RegExp('_authL\\(\\s*\'' + esc(en) + '\'\\s*,'),
      `${en} must not go back behind the lazy wrapper _authL`);
  }
  /* …and the submit button had no helper AT ALL — a bare English literal in nine languages */
  assert.doesNotMatch(src, /textContent\s*=\s*mode===·?'login'\s*\?\s*'Log In'/,
    'the submit button must not hold bare English again');
});

/* ⚠ THE SHAPE ITSELF IS STILL THERE, AND IT IS NOT A DEFECT ON ITS OWN — js/auth-ui.js keeps
   `_authL` for ~60 other strings, all of them textContent rather than attributes. What this pins is
   that the shape is DECLARED where the next reader will look, rather than rediscovered from
   production for a third time (js/map-readout.js was the first). */
test('R466 ③ the lazy-wrapper blind spot is written down where the instruments are described', () => {
  const arch = R('Architecture.md');
  assert.match(arch, /map-readout/, '§10.1 still names the first instance');
  assert.match(arch, /_authL/, '…and now names js/auth-ui.js as the second');
});
