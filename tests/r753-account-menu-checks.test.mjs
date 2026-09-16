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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
/* comments quote the defect on purpose, so they must not be what is measured */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const AUTH = code(rd('js/auth-ui.js'));
const AI = rd('js/ai-core.js');

test('R753 ① the account panel raises no browser dialog of its own', () => {
  for (const call of ['window.confirm(', 'window.prompt(', 'window.alert(']) {
    assert.equal(AUTH.split(call).length - 1, 0, `js/auth-ui.js must not call ${call} — it has its own asker`);
  }
  assert.ok(/function _acctAsk\(/.test(AUTH), 'and that asker is declared in the module');
  /* one asker, not one per action: every question goes through it */
  assert.ok(AUTH.split('_acctAsk(').length - 1 >= 6, 'every question in the panel goes through the one asker');
});

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
