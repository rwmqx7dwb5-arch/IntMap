// IntMap · ai-proxy · tasks/atlas_plan — the planner before the turn loop; kept for cached bundles
import { defineTask } from "./spec.ts";

/* (#R406) `atlas_plan` STAYS in this set even
   though nothing sends it any more: GitHub Pages serves a cached bundle for a while after a
   deploy, and a reader still holding the previous one would get a 400 on every Atlas message. */

export default defineTask({
  name: "atlas_plan",
  maxOutput: 2200,   // (#R115) 1800→2200: multi-action plans + "say" were clipping on complex requests
  reasoning: "medium",
  effortHint: true,
  // (#R113c) atlas_plan is INTENTIONALLY excluded: forcing responseMimeType on the very large planner prompt added
  // latency (feeding the 45s timeouts) and the planner worked fine before with prompt-only JSON (aiParseJSON on the
  // client strips any fence). map_report / json_extract keep structured output where it matters most.
  // (#R115) On OpenAI, atlas_plan ALSO runs in JSON mode — see the wantJson line in ask.ts.
  jsonOn: ["openai"],
});
