/* ============================================================================
 *  IntMap · THE ATLAS GRADE — one shape, two readers
 * ----------------------------------------------------------------------------
 *  ai-proxy's `atlas_grade` task forces the independent grader to answer in this schema (the server
 *  owns it: a caller cannot widen what the grader returns), and scripts/atlas-eval/grade.mjs reads
 *  the grade back against the same criteria. Deno imports this file in the function; node imports it
 *  in the evaluation. Written once so the two cannot disagree about what a grade is.
 *
 *  The schema is in the dialect ai-proxy's other server-owned schemas use (GLOSS_SCHEMA): upper-case
 *  types, which Gemini reads directly and ai-proxy's strictJsonSchema converts for OpenAI. A score is
 *  an INTEGER and not an enum — Gemini's response schema takes an enum on strings only — and
 *  scripts/atlas-eval/grade.mjs readRubric refuses anything other than 0, 1 or 2 as 「not graded」.
 *
 *  The criteria are the rubric. Each is scored 0, 1 or 2; the evaluation re-derives the verdict from
 *  the scores (pass = correctness 2 and nothing 0) rather than trusting the grader's own word for it.
 * ==========================================================================*/

export const ATLAS_GRADE_CRITERIA = Object.freeze([
  { id: 'correctness', asks: 'Does the reply state the verified answer (within the precision a careful answer would give)?', zero: 'wrong, or no answer', two: 'states it' },
  { id: 'commitment', asks: 'Does the reply commit to one answer the reader can use, rather than hedging between several or only describing what it did?', zero: 'no usable answer', two: 'one clear answer' },
  { id: 'grounding', asks: 'Does the reply say where its figure comes from (a named source, dataset, or the tool that computed it), and claim nothing the question did not need that is false?', zero: 'unsourced and contains a false claim', two: 'sourced and nothing false' },
  { id: 'language', asks: 'Is the reply written in the language of the question?', zero: 'another language', two: 'the question\'s language' },
]);

export const ATLAS_GRADE_SCHEMA = Object.freeze({
  type: 'OBJECT',
  properties: {
    scores: {
      type: 'OBJECT',
      properties: Object.fromEntries(ATLAS_GRADE_CRITERIA.map((c) => [c.id, { type: 'INTEGER', description: '0, 1 or 2 — ' + c.asks }])),
      required: ATLAS_GRADE_CRITERIA.map((c) => c.id),
    },
    verdict: { type: 'STRING', enum: ['pass', 'fail'] },
    evidence: { type: 'STRING', description: 'at most one short phrase quoted from the reply' },
  },
  required: ['scores', 'verdict', 'evidence'],
});

/* The task's output is a few hundred characters of JSON; 700 tokens is the gloss lane's budget for a
   card of the same order, and the same expiry applies: raise it when a grade carries more fields. */
export const ATLAS_GRADE_MAX_OUTPUT = 700;

/**
 * graderProviderFor(answering, keyed) — the provider that grades: the first, in the order below, that
 * is NOT the provider answering Atlas's turns and whose key is set. `null` when there is none — a model
 * grading its own provider's answer is not an independent grade, so the task refuses rather than
 * quietly grading with the answerer. The order is the cost order of the default models
 * (_shared/ai-provider.js PROVIDER_DEFAULT_MODEL: gemini-3.5-flash, claude-haiku-4-5, gpt-5.6-terra).
 */
export const GRADER_ORDER = Object.freeze(['gemini', 'anthropic', 'openai']);
export function graderProviderFor(answering, keyed) {
  const a = String(answering || '').toLowerCase();
  for (const p of GRADER_ORDER) if (p !== a && keyed(p)) return p;
  return null;
}
