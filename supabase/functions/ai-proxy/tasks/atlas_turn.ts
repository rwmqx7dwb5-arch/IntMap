// IntMap · ai-proxy · tasks/atlas_turn — the Atlas turn loop (js/atlas-agent.js), protocol 2
import { defineTask } from "./spec.ts";

/* (#R406) `atlas_turn` is the turn loop (js/atlas-agent.js). */

export default defineTask({
  name: "atlas_turn",
  maxOutput: 2600,   // (#R406) one step: the answer, or the calls. Prose answers arrive HERE now rather than only through a separate analysis call, so it needs more room than atlas_plan's action list did.
  reasoning: "medium",
  effortHint: true,
  json: true,   /* (#R406) its envelope is enforced on EVERY provider */
  protocol2: true,   /* (atlas-native-tools) the turn as items and functions — turn.ts */
});
