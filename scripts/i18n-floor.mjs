/* ============================================================================
 *  IntMap · THE FLOOR UNDER THE CARRIED LANGUAGES                            (#R700)
 * ----------------------------------------------------------------------------
 *  scripts/lang-policy.mjs narrowed AUTHORING to en+jp. The seven languages IntMap no longer
 *  writes into still HAVE what they have — 421 keyed rows, 463 page strings and 6,000 or 7,336
 *  call-site strings each — and «stop asking about them» would have let those rot out one deletion
 *  at a time with nothing red. CONSTITUTION.md §7 draws the line: new English-only text is allowed
 *  because it lowers no count; deleting a Korean row is not.
 *
 *  ⚠ THIS IS A SEPARATE FILE BECAUSE THE RULE HAS TO BE EVALUATED, NOT READ.
 *  scripts/i18n-audit.mjs takes 28.7 s (MEASURED #R700) because it spawns thirteen instruments, so
 *  a regression that ran it twice to see the floor fire would cost a minute of every `npm test`.
 *  The alternative — a check that greps the audit for the words «lost» and «floor» — is #R488
 *  exactly: it would pin the SPELLING of a rule and stay green the day the rule stops running
 *  (#R505: source-reading checks cannot see evaluation). So the comparison is a pure function with
 *  no I/O, the gate calls it on what it measured, and tests/r700-lang-policy-checks.test.mjs calls
 *  it on synthetic pairs. One rule, two callers, no copy.
 * ==========================================================================*/

/** The surfaces a language can be short on, and the words the gate uses for them. */
export const SURFACES = [
  ['keyed', 'the keyed ui table'],
  ['inline', 'the inline L(…) table'],
  ['positional', 'the positional L(…) arguments'],
  ['pages', 'the reading pages'],
];

/** What a measured row says this language actually HAS, surface by surface (absent surfaces drop out). */
export const coverageOf = (r) => Object.fromEntries(SURFACES
  .map(([k]) => [k, r && r[k] ? r[k][0] : null]).filter(([, v]) => v !== null));

/**
 * Compare what the carried languages have against the floor they may not go under.
 * Pure: no fs, no spawn. `have` / `floor` are `{code: {surface: count}}`.
 * ⚠ FAILS IN BOTH DIRECTIONS (#R194): a floor with headroom it no longer needs asserts nothing.
 * @returns {string[]} one sentence per problem; empty means the floor holds.
 */
export function floorProblems({ carried, have, floor, file = 'tests/i18n-coverage-floor.json' }) {
  const out = [];
  for (const code of carried) {
    const mine = have[code], want = floor[code];
    if (!mine) { out.push(`scripts/lang-policy.mjs carries «${code}» but no such language was measured`); continue; }
    if (!want) { out.push(`«${code}» is carried but ${file} holds no floor for it — run scripts/i18n-audit.mjs --update-floor`); continue; }
    for (const [k, label] of SURFACES) {
      const h = mine[k] ?? null, w = want[k] ?? null;
      if (h == null && w == null) continue;
      if (h == null) { out.push(`«${code}» no longer has ${label} at all, and the floor says it had ${w}`); continue; }
      if (w == null) { out.push(`«${code}» now has ${label} (${h}) and ${file} does not mention it — run scripts/i18n-audit.mjs --update-floor`); continue; }
      if (h < w) out.push(`«${code}» lost ${w - h} row(s) of ${label} (${h} < the floor's ${w}). Narrowing what IntMap WRITES NEXT to en+jp is not licence to delete what a reader already has (CONSTITUTION.md §0-3) — restore them, or say why and lower ${file}`);
      else if (h > w) out.push(`«${code}» has gained ${h - w} row(s) of ${label} (${h} > the floor's ${w}) — raise it with scripts/i18n-audit.mjs --update-floor, or the floor keeps headroom it no longer needs and stops asserting anything (#R194)`);
    }
  }
  return out;
}
