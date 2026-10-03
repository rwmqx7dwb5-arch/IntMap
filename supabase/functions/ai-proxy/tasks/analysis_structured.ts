// IntMap · ai-proxy · tasks/analysis_structured — the analysis as an AnswerEnvelope (#R350)
import { defineTask } from "./spec.ts";

/* ══ (#R350) THE ANSWER ENVELOPE — the shape an ANALYSIS must arrive in ═══════════════════════════
   ⚠ THE SERVER OWNS IT, LIKE MAP_REPORT_SCHEMA, and js/atlas-answer-contract.js holds the copy the
   client validates and renders against. Two copies of one fact is exactly what this repository does
   not allow to drift, so tests/news-cluster-checks.test.mjs (#R334) compares them field by field and fails when they
   disagree — the same rule #R323 applied to the three capability tables.

   ⚠ THERE IS NO url FIELD ANYWHERE IN IT. That is not an omission: the model has nowhere to put a
   URL, so it cannot supply one, and every link the reader sees is built by the client from the
   evidence registry (js/atlas-evidence.js). */
// (#R397) `places[].geoId` is how a coordinate CODE already resolved survives into the answer without
// the model inventing one. There are still no lat/lng fields and there must not be. The mirror of this
// literal is ANSWER_SCHEMA in js/atlas-answer-contract.js, and tests/atlas-answer-audit-checks.test.mjs #R350 ①a JSON.parses THIS ONE to
// compare them — so nothing inside the braces below may carry a comment, however useful. Notes go here.
export const ANSWER_SCHEMA = {
  type: "OBJECT",
  properties: {
    directAnswer: {
      type: "OBJECT",
      properties: { text: { type: "STRING" }, claimIds: { type: "ARRAY", items: { type: "STRING" } } },
      required: ["text", "claimIds"],
    },
    sections: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          heading: { type: "STRING" },
          blocks: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                type: { type: "STRING" },
                text: { type: "STRING" },
                claimIds: { type: "ARRAY", items: { type: "STRING" } },
              },
              required: ["type", "text", "claimIds"],
            },
          },
        },
        required: ["id", "heading", "blocks"],
      },
    },
    limitations: { type: "ARRAY", items: { type: "STRING" } },
    claims: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          text: { type: "STRING" },
          claimType: { type: "STRING" },
          importance: { type: "STRING" },
          dimension: { type: "STRING" },
          basedOn: { type: "ARRAY", items: { type: "STRING" } },
          metric: {
            type: "OBJECT",
            properties: {
              seriesId: { type: "STRING" }, concept: { type: "STRING" },
              value: { type: "NUMBER" }, unit: { type: "STRING" }, basis: { type: "STRING" },
              adjustment: { type: "STRING" }, geography: { type: "STRING" }, period: { type: "STRING" },
            },
          },
          evidenceIds: { type: "ARRAY", items: { type: "STRING" } },
          confidence: { type: "STRING" },
          qualifier: { type: "STRING" },
        },
        required: ["id", "text", "claimType", "importance", "dimension", "evidenceIds", "confidence"],
      },
    },
    places: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" }, country: { type: "STRING" }, kind: { type: "STRING" },
          geoId: { type: "STRING" },
          claimIds: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["name", "country"],
      },
    },
  },
  required: ["directAnswer", "sections", "claims"],
};

/* ⚠ A SHAPE THE CLIENT CANNOT RENDER IS A TYPED ERROR, NOT A STRING TO DISPLAY. Without this the
   client received prose where it expected an object, could not audit it, and had to choose between
   showing unverified text and showing nothing. `invalid_structured_output` already has its
   nine-language message in js/ai-core.js. */
export function structuredAnswerOk(text: string): boolean {
  let v: unknown;
  try { v = JSON.parse(String(text || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "")); } catch (_) { return false; }
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const da = o.directAnswer as Record<string, unknown> | undefined;
  if (!da || typeof da !== "object" || typeof da.text !== "string" || !da.text.trim()) return false;
  if (!Array.isArray(o.claims)) return false;
  return true;
}

export default defineTask({
  name: "analysis_structured",
  maxOutput: 3400,   // (#R350) the SAME answer as `analysis`, plus the claims, their metrics and the evidence ids that make each figure checkable. The prose is not longer; the structure around it is what costs.
  reasoning: "medium",   // (#R350) same bottleneck as `analysis`; the schema does not make the thinking easier
  effortHint: true,
  json: true,   /* (#R350) analysis_structured returns the AnswerEnvelope */
  schema: ANSWER_SCHEMA,   // (#R350) server-owned, mirrored by js/atlas-answer-contract.js
  // (#R350) 5a) A structured answer that will not parse is a TYPED failure, refunded like any
  // other provider failure — the client must never be handed prose it cannot audit.
  accept: structuredAnswerOk,
});
