// ============================================================================
//  IntMap · ai-proxy · tasks/spec — what a TASK is: one record, read by the request (ask.ts)
// ----------------------------------------------------------------------------
//  (atlas-core-split) A task used to be a key into four tables in index.ts (TASKS, TASK_MAX_OUTPUT,
//  TASK_REASONING, JSON_TASKS) plus a `task === "…"` comparison wherever one task behaved
//  differently — its server-owned schema, its lane, its protocol, its grader rule, its answer
//  check, its budget that scales with the item count. Adding a task meant editing all of them, and
//  a task present in one table and missing from another ran on a fallback nobody chose.
//  Each task is now ONE FILE in this directory that states all of it, and ONE LINE in all.ts that
//  registers it (tasks/index.ts derives TASKS from that list). ask.ts reads only the record.
// ============================================================================

/* ⚠ A TASK IS A KEY INTO FOUR CONFIGURATION TABLES, and it arrived as an arbitrary string:
   `String(payload.task || "free_text").toLowerCase()`, then `TASK_MAX_OUTPUT[task] ?? FALLBACK`. So an
   unknown task silently ran on fallback budgets, was echoed back in `meta.task`, and — because a
   plain object was being indexed with caller-controlled text — `task: "__proto__"` or
   `"constructor"` read an inherited value instead of a missing one. The registry (tasks/all.ts) is exactly
   the tasks this directory defines; anything else is a 400. */

// (#R113) Per-TASK output budgets (replaces the single MAX_TOKENS = 1600). A 20-item
// map_report can't fit in 1600 tokens; a quick json_extract shouldn't be allowed 3000.
// Kept modest for cost; map_report additionally scales with the requested item count.
// (#R116) Per-task REASONING effort (OpenAI path). "low" was starving the PLANNER — complex or
// ambiguous requests came back with wrong/empty plans ("実行できませんでした / 出力が間違ってる").
// Planning + analysis get "medium" (the quality bottleneck); the mechanical/extraction tasks stay
// "low" for cost & latency. The brief's freshness comes from the forced web search, not reasoning.
// (#R113) Which tasks want JSON output (structured-output / responseMimeType json).
export interface TaskSpec {
  /** the wire name — `payload.task`, lower-cased */
  name: string;
  /** the visible-output budget, in tokens (the provider adds the reasoning allowance on top) */
  maxOutput: number;
  /** (map_report) the budget grows with the item count the caller asked for: base + count × each */
  perRequestedItem: { base: number; each: number } | null;
  /** the OpenAI path's reasoning.effort */
  reasoning: string;
  /** may the client's complexity hint (effortHint:"high") raise `reasoning` to "high" */
  effortHint: boolean;
  /** structured output on every provider (the former JSON_TASKS) */
  json: boolean;
  /** …or only on these providers */
  jsonOn: readonly string[];
  /** the response schema the SERVER owns for this task; undefined = the caller's, if it sends one */
  schema: unknown;
  /** an answer this task must not return as prose — a failed check is invalid_structured_output */
  accept: ((text: string) => boolean) | null;
  /** the quota lane the task is charged from ("" = the reader's questions) */
  lane: string;
  /** the task is the Atlas turn: protocol 2 (turn.ts normalizeTurn) */
  protocol2: boolean;
  /** the independent grader: provider chosen by the server, never by a developer pick */
  grader: boolean;
}

/** A task's file states only what differs from these. */
export function defineTask(t: Partial<TaskSpec> & { name: string; maxOutput: number; reasoning: string }): TaskSpec {
  return Object.freeze({
    perRequestedItem: null, effortHint: false, json: false, jsonOn: [], schema: undefined,
    accept: null, lane: "", protocol2: false, grader: false,
    ...t,
  });
}

export const FALLBACK_MAX_OUTPUT = 1800;
export const HARD_MAX_OUTPUT = 5000;   // absolute ceiling (cost guard)

export function maxOutputFor(spec: TaskSpec | undefined, requestedCount?: number): number {
  let n = spec?.maxOutput ?? FALLBACK_MAX_OUTPUT;
  if (spec?.perRequestedItem && typeof requestedCount === "number" && isFinite(requestedCount) && requestedCount > 0) {
    n = Math.max(n, spec.perRequestedItem.base + Math.round(requestedCount) * spec.perRequestedItem.each);
  }
  return Math.min(HARD_MAX_OUTPUT, n);
}
