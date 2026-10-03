// IntMap · ai-proxy · tasks/research_map
import { defineTask } from "./spec.ts";

export default defineTask({
  name: "research_map",
  maxOutput: 2600, // (#R135) time-axis research/situation map: written explanation + related mappable places (historical/current/mixed)
  reasoning: "medium",   // (#R135) a grounded historical/situation answer + naming real related places needs real reasoning
  json: true,
});
