// IntMap · ai-proxy · tasks/atlas_grade — the evaluation's independent grader (atlas-quality-lab)
import { defineTask } from "./spec.ts";
/* (atlas-quality-lab) the independent grader's shape, budget and provider rule — shared with
   scripts/atlas-eval/grade.mjs, which reads the grade back against the same criteria */
import { ATLAS_GRADE_SCHEMA, ATLAS_GRADE_MAX_OUTPUT } from "../../_shared/atlas-grade-schema.js";

export default defineTask({
  name: "atlas_grade",
  maxOutput: ATLAS_GRADE_MAX_OUTPUT,   // (atlas-quality-lab) a four-score JSON grade — _shared/atlas-grade-schema.js says why this number
  reasoning: "low",   // (atlas-quality-lab) comparing a reply with an answer it is GIVEN is reading, not research
  json: true,
  schema: ATLAS_GRADE_SCHEMA,   // (atlas-quality-lab) server-owned, read back by scripts/atlas-eval/grade.mjs
  grader: true,   /* the provider is the server's choice and never the answerer — see graderProvider in ask.ts */
});
