// IntMap · ai-proxy · tasks/vision_read
import { defineTask } from "./spec.ts";

export default defineTask({
  name: "vision_read",
  maxOutput: 3000, // (#R156) multimodal read: classify → transcribe → solve (LaTeX/Markdown) → verify-checks → optional places. Needs room for a transcription + working + the checks matrices.
  reasoning: "medium",   // (#R156) reading small text + transcribing + solving a maths problem needs real reasoning (effortHint:"high" bumps it further)
  effortHint: true,   // (#R156) vision reading small text + maths earns "high"
  json: true,   /* (#R156) vision_read returns a strict JSON object (contentClass/answer/checks/places) */
});
