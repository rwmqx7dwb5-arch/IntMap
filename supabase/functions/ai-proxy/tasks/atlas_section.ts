// IntMap · ai-proxy · tasks/atlas_section — ONE section of a long document written section by section (js/atlas-longform.js)
import { defineTask } from "./spec.ts";

export default defineTask({
  name: "atlas_section",
  maxOutput: 4800,   // (atlas-longform) one chapter: prose or code, not JSON. Just under HARD_MAX_OUTPUT (5000) — a chapter that still runs past it is CONTINUED by the client (meta.incompleteReason), never allowed a higher ceiling here: the cost guard stays one number for every task
  reasoning: "low",   // the section's content comes from the outline and the sources, not from extra reasoning; the length is what costs
});
