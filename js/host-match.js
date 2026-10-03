/* ============================================================================
 *  IntMap · js/host-match.js — DOES THIS HOST NAME A ROW OF THE OUTBOUND LEDGER   (shell-experience)
 * ----------------------------------------------------------------------------
 *  scripts/outbound-hosts.json names a host either exactly (`api.gdeltproject.org`) or as a pattern
 *  (`*.wikipedia.org`, `mts*.google.com`). Two readers ask the same question of it:
 *    · scripts/upstream-liveness.mjs — «does this probe ask the host the row declares?» (Node);
 *    · js/service-status.js — «which row of last night's measurement is the host this request went
 *      to?» (the browser, when a layer could not load and when the status page is drawn).
 *  The rule was written once, in the script; it moved here, whole, the moment a second reader needed
 *  it — a copy in the browser would be the same judgement in two places
 *  (.agents/rules/no-ad-hoc-hardcoding.md §1, 「既にある仕組みの写し」).
 *
 *  Matched as text, not by building a RegExp from the pattern: the literal parts are compared exactly
 *  (a `.` is a dot, never "any character"), and what a `*` stands for must be host characters —
 *  letters, digits and hyphens, with a dot only before a non-empty label — so a `*` can widen a label
 *  (`mts0`) or add labels (`de.`) but never swallow a foreign suffix.
 *
 *  ⚠ ONE EXPORTED BINDING AND NOTHING ELSE AT TOP LEVEL — the rule every js/ module keeps
 *  (tests/layer-boot-graph-checks.test.mjs #R175 ③). No DOM, no window: Node imports it as it is.
 * ==========================================================================*/
export function hostMatches(pattern, host) {
  const WILD_LABEL = /^[a-z0-9-]*$/;
  const wildcardSpan = (s) => s.split('.').every((label, i) => (i === 0 || label !== '') && WILD_LABEL.test(label));
  const parts = String(pattern).toLowerCase().split('*');
  const h = String(host).toLowerCase();
  if (!h.startsWith(parts[0])) return false;
  /* parts[0..k] are matched and end at pos; next come a wildcard and parts[k + 1] */
  const rest = (k, pos) => {
    if (k === parts.length - 1) return pos === h.length;
    const lit = parts[k + 1];
    for (let end = pos; end + lit.length <= h.length; end++) {
      if (h.startsWith(lit, end) && wildcardSpan(h.slice(pos, end)) && rest(k + 1, end + lit.length)) return true;
    }
    return false;
  };
  return rest(0, parts[0].length);
}
