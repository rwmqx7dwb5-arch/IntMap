// IntMap · ai-proxy · tasks/geo_resolve
import { defineTask } from "./spec.ts";

export default defineTask({
  name: "geo_resolve",
  maxOutput: 1800, // (#R132) web-search-grounded STRUCTURED region resolution (metadata + boundary anchors, NOT a dense polygon)
  reasoning: "medium",   // (#R132) classifying an ambiguous / natural / historical region + picking a geometry strategy needs real reasoning
  json: true,
});
