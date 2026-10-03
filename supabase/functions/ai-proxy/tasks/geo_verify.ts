// IntMap · ai-proxy · tasks/geo_verify
import { defineTask } from "./spec.ts";

export default defineTask({
  name: "geo_verify",
  maxOutput: 500,   // (#R130) web-search-grounded place verification for the Atlas highlight/outline resolver — tiny JSON
  reasoning: "low",   // (#R130) freshness comes from the forced web search, not reasoning
  json: true,
});
