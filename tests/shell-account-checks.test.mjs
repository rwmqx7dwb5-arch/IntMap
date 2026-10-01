/* ============================================================================
 *  shell-account-checks — the account sheet
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r231-checks.test.mjs
 *  tests/r467-checks.test.mjs
 *  tests/r753-account-menu-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codeOnly, codeOnly as code } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R231 · from r231-checks.test.mjs ═══════════════════════ */
/* (#R231 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
/* ⚠⚠ A NEGATIVE CHECK MUST READ CODE, NOT PROSE — and this file proved it on its first run. Five of
   the assertions below failed against a correct tree because the thing they were looking for is
   quoted in the COMMENT that explains its removal: `#0a0a0c`, the magnifier, `monitors:'tab.monitors'`
   and `{timeout:2000}` are all named in the note that says they are gone. #R208 and #R229 hit exactly
   this ("a check whose regex matches its own comment"), so the rule is now a helper: strip comments,
   then match syntax. */
const noJs = (p) => codeOnly(read(p));

/* ── ⑧ the profile sheet ────────────────────────────────────────────────────────────────────── */
/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R231 profile: Display name and Bio are gone, and the look left the module', () => {
  const src = read('js/auth-ui.js');
  const bare = noJs('js/auth-ui.js');
  for (const id of ['acct-name', 'acct-bio', 'acct-save']) {
    assert.ok(!bare.includes(`'${id}'`) && !bare.includes(`id="${id}"`), `${id} is gone`);
  }
  assert.match(src, /class="acct-sheet"/, 'the sheet is built from classes');
  assert.match(src, /class="acct-card acct-rows"/, 'grouped cards');
  /* ⚠ THE SETTINGS GO, THE DATA STAYS — nothing here may drop a column. */
  assert.ok(!/\.update\(\{display_name:/.test(src) || /meta\.display_name/.test(src), 'no write of a field the UI no longer offers');
  assert.match(read('css/intmap.css'), /\.acct-sheet\{/, 'and the styling is in the stylesheet');
});
}

/* ═══════════════════════ #R467 · from r467-checks.test.mjs ═══════════════════════ */
/* (#R467 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
const R = read;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ⚠ AND THE CALL SITE HAS TO STAY VISIBLE. Putting these back behind `_authL(…)` would make the
   gate green again without changing what a French reader sees — which is the whole defect. */
/* spelling kept: browser script (js/auth-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R467 ② every writer of the account sheet goes through a callee the instruments can prove', () => {
  const src = R('js/auth-ui.js');
  /* ⚠ BOTH WRITERS OF #am-pass. The markup template sets the placeholder and the tab switcher
     rewrites it a moment later, so a fix to one of them is invisible on screen. */
  /* (module-graph) the callee is the IMPORTED registry binding — `IntMapLang.t(` with the import edge
     present — which is what the instruments resolve now that the readers no longer reach for `window.IntMapLang` */
  assert.match(src, /^import \{ IntMapLang \} from '\.\/lang-registry\.js';/m, 'js/auth-ui.js imports the language registry');
  for (const en of ['Display name', 'Password', 'Password (min. 8 chars, incl. a number)', 'Log In', 'Create account']) {
    assert.match(src, new RegExp('(?<![\\w.$])IntMapLang\\.t\\(HOST\\.lang,\\s*\'' + esc(en) + '\''),
      `${en} must be spelled IntMapLang.t(HOST.lang, …)`);
    assert.doesNotMatch(src, new RegExp('_authL\\(\\s*\'' + esc(en) + '\'\\s*,'),
      `${en} must not go back behind the lazy wrapper _authL`);
  }
  /* …and the submit button had no helper AT ALL — a bare English literal in nine languages */
  assert.doesNotMatch(src, /textContent\s*=\s*mode===·?'login'\s*\?\s*'Log In'/,
    'the submit button must not hold bare English again');
});
}

/* ═══════════════════════ #R753 · from r753-account-menu-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  R753 · WHAT THE ACCOUNT PANEL MUST NOT GO BACK TO
 * ----------------------------------------------------------------------------
 *  The behaviour is measured in a real browser (tests/r753-account-menu.spec.js). These are the two
 *  statements a browser cannot make, because they are about WHERE a decision lives rather than what
 *  the panel shows:
 *
 *   ① the panel asks inside itself. Five window.confirm/prompt calls were the app handing its own
 *      questions to the browser chrome — unstyleable, untranslatable past the string passed in, and
 *      labelled with the ORIGIN ("127.0.0.1 says…") rather than with IntMap.
 *   ② the panel does not re-derive the AI quota. It now states both daily counters, and the moment a
 *      second surface computes «left» from the mirror itself there are two answers to one question
 *      (.agents/rules/no-ad-hoc-hardcoding.md §2-3). js/ai-core.js answers it; this file reads that.
 * ==========================================================================*/
{
const rd = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
/* comments quote the defect on purpose, so they must not be what is measured */

const AUTH = code(rd('js/auth-ui.js'));
const AI = rd('js/ai-core.js');

/* spelling kept: browser script (js/auth-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R753 ① the account panel raises no browser dialog of its own', () => {
  for (const call of ['window.confirm(', 'window.prompt(', 'window.alert(']) {
    assert.equal(AUTH.split(call).length - 1, 0, `js/auth-ui.js must not call ${call} — it has its own asker`);
  }
  assert.ok(/function _acctAsk\(/.test(AUTH), 'and that asker is declared in the module');
  /* one asker, not one per action: every question goes through it */
  assert.ok(AUTH.split('_acctAsk(').length - 1 >= 6, 'every question in the panel goes through the one asker');
});

/* spelling kept: browser script (js/auth-ui.js, js/ai-core.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R753 ② the two daily counters are described once, in js/ai-core.js', () => {
  assert.ok(/function aiUsageSummary\(\)/.test(AI), 'js/ai-core.js answers where both counters stand');
  assert.ok(/async function aiRefreshUsage\(\)/.test(AI), 'and re-reads both server rows');
  assert.ok(/aiUsageSummary,/.test(AI) && /aiRefreshUsage,/.test(AI), 'both are exported');
  /* #R447: a surface states a number the SERVER sent. The account panel therefore asks for a
     re-read when it opens rather than trusting whatever the mirror held. */
  assert.ok(/HOST\.aiRefreshUsage/.test(AUTH), 'the account panel re-reads the rows when it opens');
  assert.ok(/HOST\.aiUsageSummary/.test(AUTH), 'and paints the answer it is given');
  /* ⚠ word-bounded: `HOST.aiUsageSummary` CONTAINS `HOST.aiUsage`, and a substring test would ban
     the one call this round is built on while claiming to ban the mirror. */
  for (const own of [/HOST\.aiUsage(?![A-Za-z])/, /\bAI_FREE_DAILY\b/, /\baiUsesLeft\s*\(/, /\baiDailyLimit\s*\(/]) {
    assert.equal(own.test(AUTH), false, `js/auth-ui.js must not re-derive the quota itself (${own})`);
  }
});

/* spelling kept: browser script (js/auth-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R753 ③ the sign-in method is read from the session by ONE function, used by both constructions', () => {
  /* Measured this round: onAuthStateChange builds a provisional user synchronously and
     refreshCurrentUser builds the enriched one later; `provider` was set by only the second, so
     every panel that opened before the profile row arrived — or at all, when the network is gone —
     read a user with no provider at all. Both constructions call the same function now. */
  assert.ok(/function _sessionProvider\(session\)/.test(AUTH), 'one function reads app_metadata');
  assert.equal(AUTH.split('_sessionProvider(session)').length - 1, 3,
    'declared once and called by both places that build HOST.user');
  assert.equal(AUTH.split('app_metadata').length - 1, 1,
    'and the session record is reached into in exactly that one place');
});
}
