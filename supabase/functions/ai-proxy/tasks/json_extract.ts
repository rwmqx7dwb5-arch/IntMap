// IntMap · ai-proxy · tasks/json_extract
import { defineTask } from "./spec.ts";

export default defineTask({
  name: "json_extract",
  maxOutput: 1200,
  reasoning: "low",
  json: true,
});
