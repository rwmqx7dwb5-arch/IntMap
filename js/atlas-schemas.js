/* ============================================================================
 *  IntMap · ATLAS — WHAT EACH CAPABILITY'S ARGUMENTS ACTUALLY ARE  (#R406)
 * ----------------------------------------------------------------------------
 *  All 126 capabilities shared ONE schema, written once in js/atlas-capabilities.js:
 *
 *      inputSchema: { type: 'object' }
 *
 *  `{type:'object'}` accepts every object, so it accepted every action. `analyze` with no question
 *  and `highlight` with no target were VALID plans: they passed availability, passed argument
 *  validation, reached the dispatch — and only there did the case answer 「何を分析しますか？」,
 *  after the plan had been accepted, the step counted and the turn spent. A schema that cannot fail
 *  is not a gate; it is a comment. This file is the missing half: one REAL schema per capability,
 *  with REAL required arguments.
 *
 *  WHERE EVERY NAME BELOW COMES FROM, in that order of authority:
 *    · the capability's `run` in js/atlas-cap-<namespace>.js — the code that READS the argument.
 *      If the run reads `a.name`, the property is `name`. The schema sits in the same entry.
 *    · js/atlas-catalog-text.js — the shapes the planner is shown (`{"type":"highlight","targets":…}`).
 *    · js/atlas-capabilities.js `targetPolicyOf` / `hasTarget` — which spellings satisfy a target,
 *      and which 45 capabilities may not run without one.
 *
 *  THREE RULES THE TABLE FOLLOWS, because breaking any of them fails a call that works today:
 *   (1) NO INVENTED NAMES. Where one thing has several spellings (`place` / `from` / `origin` /
 *       `center`), every spelling is a property and `anyOf` says that one of them is needed. A
 *       single "canonical" name the dispatch never reads would reject the plans it does read.
 *   (2) `enum` ONLY WHERE THE DISPATCH COMPARES AGAINST A CLOSED, ASCII SET. Many value tests in
 *       the dispatch are regexes carrying Japanese, German and Russian spellings — an `enum` on
 *       `pan.dir` or `fly.mode` would reject the very spellings the case was written to accept.
 *       Those stay plain strings. Where the set IS closed it was read out of the code, not out of
 *       the prose: `map.object.kind` has ten values here and eight in the catalogue, because
 *       js/map-tools.js really does create `nogo` and `pt` objects.
 *   (3) REQUIRED MEANS THE CASE CANNOT WORK WITHOUT IT. Every on/off toggle, every panel opener,
 *       `map.object` (whose default op is `list`) and `routing.drone` (whose empty form opens the
 *       planner) do something correct on an empty argument set, so they carry neither `required`
 *       nor `anyOf`. Making them "stricter" would delete working features.
 *
 *  ⚠ THE DIALECT IS SMALL ON PURPOSE: type / properties / required / anyOf / enum / minimum /
 *  maximum / minLength / minItems / items. No $ref, no oneOf, no format. `anyOf` here carries only
 *  `required` lists — it is «at least one of these argument sets is present», nothing more.
 *
 *  ⚠ WHY ITS OWN FILE. js/atlas-capabilities.js is 903 lines and is EAGER — it rides in the boot
 *  bundle so that a capability is discoverable before Atlas loads (#R311 measured what mounting
 *  more of the kernel there costs). This is DATA, not logic: one literal per capability, no DOM and
 *  no globals beyond the single publication at the bottom. It sits beside its subject the way
 *  js/atlas-catalog-text.js holds the planner's prose and js/atlas-policy.js holds the planning
 *  rules, for the same reason each of those left the file it was born in.
 * ==========================================================================*/

import { CAPABILITY_MODULES } from './atlas-caps-modules.js';   /* (atlas-capability-modules) every capability's entry — its schema is declared there */
import { capabilitySchemas } from './atlas-caps.js';

export function makeAtlasSchemas() {
  return (function () {

    /* ══ THE TABLE ═══════════════════════════════════════════════════════════════════════════════
       (atlas-capability-modules) Keyed by CAPABILITY ID. Each schema is declared in its capability's
       entry in js/atlas-cap-<namespace>.js — beside the row and the `run` that reads the arguments —
       written with the builders in js/atlas-caps.js. An entry's `schema` is a function, and
       it is called here, so every makeAtlasSchemas() gets FRESH objects: a shared literal would let one
       consumer's annotation reach every capability that happens to take a latitude. */
    var S = capabilitySchemas(CAPABILITY_MODULES);

    function schemaFor(id) { return S[id] || null; }
    function ids() { return Object.keys(S); }

    var API = { ALL: S, schemaFor: schemaFor, ids: ids };
    return API;
  })();
}
