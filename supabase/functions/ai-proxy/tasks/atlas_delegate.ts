// IntMap · ai-proxy · tasks/atlas_delegate — one worker's piece of an Atlas request (atlas-delegation)
import { defineTask } from "./spec.ts";

export default defineTask({
  name: "atlas_delegate",
  maxOutput: 3000,   // (atlas-delegation) a worker returns findings as JSON (claims, places, sources, gaps) for Atlas to integrate — the size of an analysis_structured answer (3400) less its prose
  reasoning: "medium",   // the same research reasoning a brief or an analysis gets; the client's complexity hint may raise it
  effortHint: true,
  outputHint: true,   /* (atlas-unbounded-turns) Atlas may choose a larger output budget per request (payload.maxOutputHint), up to the model's documented ceiling — spec.ts hintedMaxOutput */
  json: true,
  delegate: true,
});
