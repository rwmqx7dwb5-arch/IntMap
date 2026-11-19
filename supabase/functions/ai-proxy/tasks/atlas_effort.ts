// IntMap · ai-proxy · tasks/atlas_effort — how hard the answering model should think about THIS request
import { defineTask } from "./spec.ts";

/* == THE ANSWERER DOES NOT KNOW HOW HARD THE QUESTION IS UNTIL IT HAS SPENT THE EFFORT =============
   Atlas's own reasoning tier is fixed before the first step runs, so something has to read the
   request first. That something is a model, not a word list: this task reads the reader's request
   (and what rides with it) and names a tier. It composes nothing for the reader. It rides the turn's
   key (turnId), so it is neither a second question nor a second charge, and a failure of it means
   the turn runs at the server's default tier — it never blocks the turn. The schema is the
   server's, for the reason ATLAS_VERIFY_SCHEMA is. */
export const ATLAS_EFFORT_SCHEMA = {
  type: "OBJECT",
  properties: {
    effort: { type: "STRING" },   // "low" | "medium" | "high" | "xhigh" — the caller validates; anything else is ignored
  },
  required: ["effort"],
};

export default defineTask({
  name: "atlas_effort",
  maxOutput: 200,   // one word of JSON
  reasoning: "low",   // sizing a request is reading, not research
  json: true,
  schema: ATLAS_EFFORT_SCHEMA,
});
