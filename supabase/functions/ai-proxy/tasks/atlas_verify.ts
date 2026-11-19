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
    unmet: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          need: { type: "STRING" },   // the part of the request the record does not cover, in the reader's words
          why: { type: "STRING" },    // what the record shows (or lacks) that says so
        },
        required: ["need"],
      },
    },
  },
  required: ["unmet"],
};

export default defineTask({
  name: "atlas_verify",
  maxOutput: 500,   // a short list of unmet needs, usually empty
  reasoning: "low",   // comparing a request with a record it is GIVEN is reading, not research
  json: true,
  schema: ATLAS_VERIFY_SCHEMA,
});
