#!/usr/bin/env node
/* ============================================================================
 *  IntMap · WHO CLAIMS TO SAY WHAT IS IN `supabase/functions/_shared/`?  (#R694)
 * ----------------------------------------------------------------------------
 *  `_shared/` is a library directory, not an Edge Function, so the rule that counts
 *  functions never sees it. Several documents write out its contents by hand, and
 *  that hand-written roster is what goes stale.
 *
 *  This module is the ONE copy of the judgement «is this passage claiming to list
 *  the directory, and does the list match?». `scripts/doc-facts.mjs` runs it over
 *  every current-state document; the regression test imports the same function
 *  instead of restating the rule, because a rule written twice is two rules
 *  (.agents/rules/no-ad-hoc-hardcoding.md §2.3).
 *
 *  ⚠ IT IS SEPARATE FROM doc-facts.mjs SO THAT IT CAN BE MEASURED. doc-facts is a
 *  script whose checks run on import and whose one run costs ~7.5 s; a sweep of
 *  «every name, dropped from every roster» through it is four minutes and so never
 *  gets written. Here the same sweep is milliseconds. The lesson is #R575's: the
 *  arithmetic nobody can reach is the arithmetic nobody measures.
 * ==========================================================================*/
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** the fact itself: what the directory actually holds, sorted */
export const sharedRoster = (root) =>
  readdirSync(join(root, 'supabase/functions/_shared')).filter((f) => f.endsWith('.js')).sort();

/* a list that hedges is honestly partial and is left alone — Architecture.md §6.2's prose
   names three of them followed by `など`, and that sentence is not wrong */
const HEDGE = /など|ほか|その他|etc\.|e\.g\./;
const OPEN = { '（': '）', '(': ')' };

/* an inventory does not span a blank line */
const paraEnd = (body, from) => {
  const m = /\r?\n[ \t>]*\r?\n/.exec(body.slice(from));
  return m ? from + m.index : body.length;
};

/* The parenthesis ATTACHED to a mention: one that opens on the mention's own line or the line
   just after it, read to its matching close.
   ⚠ THE DISTANCE TO THE CLOSE IS NOT EVIDENCE ABOUT WHETHER IT BELONGS. The rule this replaces
   read a 260-CHARACTER WINDOW and required the close inside it. docs/FILES.md wrapped its roster
   over three indented lines, the close landed at ~290, the group came back null and the whole
   roster was skipped — so check:docs printed «_shared/ holds 11: …», naming all eleven, while
   passing a document that listed nine. Cutting the same roster to eight pulled the close back
   inside the window and it went red at once: the number of omissions tolerated was decided by
   the LENGTH OF THE TEXT. So there is no cap here, and a parenthesis that never closes is
   reported rather than skipped — «I could not read it» must never leave as «it is fine». */
const attached = (body, from) => {
  const stop = paraEnd(body, from);
  let newlines = 0;
  for (let i = from; i < stop; i++) {
    const c = body[i];
    if (c === '\n' && ++newlines > 1) return null;      /* the mention's sentence has ended */
    if (!OPEN[c]) continue;
    const close = body.indexOf(OPEN[c], i + 1);
    if (close < 0 || close > paraEnd(body, i)) return { text: null };
    return { text: body.slice(i, close + 1) };
  }
  return null;
};

/* ⚠ the mention has to be of the DIRECTORY, not of a file inside it. `_shared/newsgeo.js`
   （＝ブラウザの `js/newsgeo.js` と1バイト同一） is a true sentence about ONE file, and reading its
   parenthesis as an inventory calls it a roster that omits the other ten. That — not a count of
   names — is what separates «here is what the directory holds» from «here is one thing in it».
   The rule this replaces used «three or more names», which excused dropping nine of eleven names
   but not nine of ten: the threshold was never what made a passage an inventory. */
const MENTION = /_shared\/(?![A-Za-z0-9_.-])/g;
const NAME = /\b([a-z0-9-]+\.js)\b/g;

/**
 * Every passage in `body` that presents itself as the contents of `_shared/`.
 * @returns {{names: string[], text: string, unclosed: boolean}[]}
 */
export function inventories(body) {
  const found = [];
  for (const at of body.matchAll(MENTION)) {
    const g = attached(body, at.index + at[0].length);
    if (!g) continue;                                   /* nothing attached: a passing mention */
    if (g.text === null) { found.push({ names: [], text: '', unclosed: true }); continue; }
    if (HEDGE.test(g.text)) continue;                   /* says so itself that it is partial */
    const names = [...new Set([...g.text.matchAll(NAME)].map((m) => m[1]))].sort();
    if (names.length) found.push({ names, text: g.text, unclosed: false });
  }
  return found;
}

/**
 * What is wrong with this document's rosters, if anything.
 * @returns {{kind: 'unreadable'|'omits'|'extra', names: string[]}[]}
 */
export function auditRoster(body, roster) {
  const problems = [];
  for (const inv of inventories(body)) {
    if (inv.unclosed) { problems.push({ kind: 'unreadable', names: [] }); continue; }
    /* a parenthesis full of names none of which are in _shared/ is about some other directory */
    if (!inv.names.some((n) => roster.includes(n))) continue;
    const omits = roster.filter((n) => !inv.names.includes(n));
    const extra = inv.names.filter((n) => !roster.includes(n));
    if (omits.length) problems.push({ kind: 'omits', names: omits });
    if (extra.length) problems.push({ kind: 'extra', names: extra });
  }
  return problems;
}
