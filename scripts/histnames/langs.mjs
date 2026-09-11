/* ============================================================================
 *  IntMap · WHICH LANGUAGES THE HISTORICAL NAME TABLE SHIPS          (#R695 → #R700)
 * ----------------------------------------------------------------------------
 *  ⚠ THE POLICY MOVED OUT OF THIS FILE AND DID NOT CHANGE. #R695 wrote the amendment here because
 *  the historical name table was the only thing it governed. #R700 extended the same amendment to
 *  the UI (AGENTS.md §3-5, CONSTITUTION.md §7), and a policy that two gates read may not be
 *  written twice — [[intmap-recurring-lessons]] G, and .agents/rules/no-ad-hoc-hardcoding.md §2-3:
 *  a judgement that already exists somewhere is DISTRIBUTED, not copied.
 *
 *  The one place it is written is now ../lang-policy.mjs. This file exists so that every caller
 *  that already reads `shipLangs` keeps reading it, and so that the historical-name build says in
 *  its own imports which of the two sets it means.
 *
 *  ⚠ ONE EDIT STILL RESTORES THE FULL SET, and it is in ../lang-policy.mjs (`return all;`).
 * ==========================================================================*/
export { appLangs, harvestLangs, attestedLangs, carriedLangs } from '../lang-policy.mjs';
import { authoredLangs } from '../lang-policy.mjs';

/**
 * Languages IntMap itself writes text in for this table.
 * The historical-name build's name for `authoredLangs` — one policy, two readers.
 */
export function shipLangs(root) { return authoredLangs(root); }
