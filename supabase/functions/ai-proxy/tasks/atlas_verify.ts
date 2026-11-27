// IntMap · ai-proxy · tasks/atlas_verify — the independent reader of a request (atlas-goal-verifier)
import { defineTask } from "./spec.ts";

/* == THE ANSWERER IS NOT THE ONLY ONE WHO READS THE REQUEST ===================================
   js/atlas-agent.js holds Atlas to what Atlas DECLARED; a turn that declares nothing is measured
   against nothing. This task reads the REQUEST and the turn's RECORD (what was produced, which
   operations completed or failed) and says which parts of the request the record does not cover.
   It composes nothing for the reader: its output goes back to Atlas as a note, once. The schema
   is the server's — a caller-supplied one would be an input (same argument as GLOSS_SCHEMA). It
   rides the turn's key (turnId), so it is neither a second question nor a second charge. */
export const ATLAS_VERIFY_SCHEMA = {
  type: "OBJECT",
  properties: {
    met: {   // the parts of the request the record does cover, so Atlas sees where it stands (optional)
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { need: { type: "STRING" }, how: { type: "STRING" } },
        required: ["need"],
      },
    },
    unmet: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          need: { type: "STRING" },   // the part of the request the record does not cover, in the reader's words
          why: { type: "STRING" },    // what the record shows (or lacks) that says so
          /* "missing" — the record SHOWS the part is not there; "unconfirmed" — the record cannot show either way.
             Only "missing" is a finding about the turn (js/atlas-goal-verify.js): not observed is not unmet. */
          seen: { type: "STRING" },
          prev: { type: "STRING" },   // the id of the same need in the reader's previous reading of this turn, when it is one
        },
        required: ["need", "seen"],
      },
    },
  },
  required: ["unmet"],
};

export default defineTask({
  name: "atlas_verify",
  maxOutput: 900,   // the covered parts and the unmet needs, a line each
  reasoning: "low",   // comparing a request with a record it is GIVEN is reading, not research
  json: true,
  schema: ATLAS_VERIFY_SCHEMA,
});
