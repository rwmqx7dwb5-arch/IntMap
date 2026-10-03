// IntMap · ai-proxy · tasks/brief — a latest-information brief
import { defineTask } from "./spec.ts";

export default defineTask({
  name: "brief",
  maxOutput: 1800,
  reasoning: "low",   // the brief's freshness comes from the forced web search, not reasoning (#R116)
});
