// IntMap · ai-proxy · tasks/analysis — an Atlas analysis in prose
import { defineTask } from "./spec.ts";

export default defineTask({
  name: "analysis",
  maxOutput: 2400,
  reasoning: "medium",
  effortHint: true,
});
