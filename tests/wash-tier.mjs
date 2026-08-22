/* ============================================================================
 *  IntMap · the ONE reader of `washTier`'s unread arm  (#R308 追記2)
 * ----------------------------------------------------------------------------
 *  Five per-round checks — #R275 ⑪, #R277 ③, #R284 ①, #R288 ①, #R299 ② — all
 *  asserted the SAME LINE of js/world-packs.js, character for character:
 *
 *      if(readState(c)!=='ok') return 0;
 *
 *  Each of them is about a different real rule, and every one of those rules is still true. What
 *  they had in common was the spelling, so a round that had to change the spelling turned five
 *  checks red at once for doing what the reader asked. The rules, separated from the line:
 *
 *    · #R275 / #R277  a service that has NOT answered never earns the 「発表なし」 grey.
 *    · #R284 / #R288  「未対応」 and 「データがまだ入っていない」 are the SAME silence, and that
 *                     silence is the hatch — there is no fourth state (#R284's −1 is gone).
 *    · #R299          the country-wide sheet is not painted over a country that is drawing.
 *
 *  ⚠ (#R308 追記2) A COUNTRY THAT IS DRAWING ITS OWN UNITS IS NOT A SILENCE. Measured on production
 *  at Kashmir z6: of 525 points where the hatch sat on an answer, **276 were `CHN OVER CHN/W`** —
 *  China's hatch over China's own warnings, because one failed CMA fetch flips `readState` while the
 *  warnings it had already read stay on the map. That country takes 2 (transparent); it does not
 *  take the grey, and it is not a fourth state.
 * ==========================================================================*/
import assert from 'node:assert/strict';

/* the body of `washTier`, from its declaration to the next top-level function */
export function washTierBody(src) {
  const i = src.indexOf('function washTier(');
  assert.ok(i > 0, 'washTier must exist');
  const j = src.indexOf('function paintCountries(', i);
  return src.slice(i, j > i ? j : undefined);
}

/* the expression a country whose service has not answered resolves to */
export function unreadArm(src) {
  const m = /if\(readState\(c\)!=='ok'\)\s*return\s*([^;]+);/.exec(washTierBody(src));
  assert.ok(m, 'a service that has not answered is decided on its own line');
  return m[1];
}

/* #R275 ⑪ / #R277 ③ — it is never the 「発表なし」 grey (1) and never a wash rank (11–14) */
export function assertUnreadNeverGreys(src) {
  const arm = unreadArm(src);
  const bare = arm.replace(/[A-Za-z_$][\w$]*/g, ' ');
  const nums = bare.match(/\d+/g) || [];
  nums.forEach((n) => assert.ok(+n !== 1 && !(+n >= 11 && +n <= 14),
    'a service that has not answered never earns the grey or a wash rank, got: ' + arm));
}

/* #R284 ① / #R288 ① — 「未対応」 and 「データがまだ入っていない」 are the same silence, and it is
   the hatch (0). ⚠ the arm may ALSO answer 2 for a country that is drawing its own units — that is
   not a fourth state, it is the country speaking for itself. −1 must still be gone. */
export function assertUnreadIsTheHatch(src) {
  const arm = unreadArm(src);
  assert.match(arm, /(^|[^\w.])0([^\w.]|$)/, 'a silence is hatched, exactly as 「未対応」 is');
  assert.ok(!/-\s*1/.test(arm), '#R284’s fourth state must be gone');
  const bare = arm.replace(/[A-Za-z_$][\w$]*/g, ' ');
  (bare.match(/\d+/g) || []).forEach((n) => assert.ok(+n === 0 || +n === 2,
    'the only other answer is 2 — the country is drawing its own units — got: ' + arm));
  if (/2/.test(bare)) assert.match(arm, /drawnISO\[c\]|quietSet\[c\]/,
    'and 2 is earned by the country actually drawing, not by anything else');
}
