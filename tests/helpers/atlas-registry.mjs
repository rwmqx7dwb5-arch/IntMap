/* ============================================================================
 *  IntMap · tests/helpers/atlas-registry.mjs — what the registry DECLARES  (#R475)
 * ----------------------------------------------------------------------------
 *  `js/atlas-capabilities.js` is the one list of what IntMap can do (#R318). A test that wants to
 *  know whether the BUILT bundle still carries that list has to compare it against something. For
 *  two hundred rounds that something was a typed integer, and a typed integer is a claim about a
 *  number nobody is steering:
 *
 *    · #R406 wrote `expect(r.caps).toBe(126)` — true on the day it was written.
 *    · #R439 added `layers.isobars`            → 127. The assertion went red, every night.
 *    · #R469 removed `sim.slopeAspect`         → 126. The assertion went green again, and NOBODY
 *      TOUCHED IT. A verdict that flips red and back on rounds that never opened the file is not
 *      measuring the thing it names.
 *
 *  ⚠ THE ANSWER IS NOT A BIGGER NUMBER (#R433, CONSTITUTION.md §5). The claim the spec is actually
 *  making is «the registry survived the build» — so it is asked as such: the ids the source
 *  declares, against the ids the built app answers with. That comparison is strictly stronger than
 *  a count (a swapped id has the same length) and it cannot go stale, because both sides move
 *  together the moment a capability is added or withdrawn.
 *
 *  ⚠ NOT A REGEX OVER THE LITERAL. `makeAtlasCapabilities` is a plain factory that needs no DOM —
 *  the module is imported and ASKED, the way tests/helpers/layer-groups.mjs evaluates the taxonomy
 *  rather than spelling-matching it (#R469 broke twelve checks at once doing the latter).
 * ==========================================================================*/
import { makeAtlasCapabilities } from '../../js/atlas-capabilities.js';

/** Every capability id the registry declares, sorted — withdrawn ones included, exactly as
 *  `IntMapCapabilities.all()` reports them in the browser. */
export function declaredCapabilityIds() {
  return makeAtlasCapabilities({}).all().map((c) => c.id).sort();
}

/** The ceiling on the tool block that crosses the wire (JSON.stringify of the core tools, schemas included).
 *  Observation (atlas-completion): 12,000 → 13,000 because compose_map gained `basis` / `via`. It is a guard against
 *  the 64,250-character catalogue coming back, NOT a policy on the core tools' length. Expires if the core tool set is
 *  redesigned. Canonical home: here — tests/atlas-agent-loop-checks.test.mjs and the deep spec r318-atlas.spec.js read it. */
export const CORE_TOOL_BLOCK_MAX = 13_000;
