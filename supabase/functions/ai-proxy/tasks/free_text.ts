// IntMap · ai-proxy · tasks/free_text
import { defineTask } from "./spec.ts";

export default defineTask({
  name: "free_text",
  maxOutput: 1800,
  reasoning: "low",
});
