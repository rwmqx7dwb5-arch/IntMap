// IntMap · ai-proxy · tasks/gloss — the term gloss (#R491)
import { defineTask } from "./spec.ts";
import { GLOSS_LANE } from "../config.ts";

/* == (#R491) THE GLOSS CARD'S SHAPE BELONGS TO THE SERVER =====================================
   Same argument as MAP_REPORT_SCHEMA and ANSWER_SCHEMA: a caller-supplied schema is an input, and
   this one is fixed by what the card renders (js/atlas-gloss.js). `background` and `also` are
   optional - plenty of terms are ordinary words with no background worth printing, and the
   converter above gives an optional key a way to say so. */
export const GLOSS_SCHEMA = {
  type: "OBJECT",
  properties: {
    term: { type: "STRING" },        // the phrase as it should be shown (the reader's selection, tidied)
    kind: { type: "STRING" },        // "noun phrase" / "military term" / "place name" - what KIND of thing this is, in the reader's language
    sense: { type: "STRING" },       // the dictionary sense, independent of this answer
    inContext: { type: "STRING" },   // what it means HERE - the half a browser dictionary cannot do
    background: { type: "STRING" },  // 1-3 sentences, only when there is something to know
    also: { type: "ARRAY", items: { type: "STRING" } },   // closely related terms worth looking up next
  },
  required: ["term", "kind", "sense", "inContext"],
};

export default defineTask({
  name: "gloss",
  maxOutput: 700,        // (#R491) a dictionary card: sense + this-context reading + a short background. Deliberately small - it is a gloss, not an essay.
  reasoning: "low",   // (#R491) naming what a term means in a paragraph the caller supplies is reading, not reasoning
  json: true,
  schema: GLOSS_SCHEMA,   // (#R491) server-owned, mirrored by js/atlas-gloss.js
  lane: GLOSS_LANE,   /* (#R491) the term gloss - its own lane, its own counter, its own tiny budget (config.ts) */
});
