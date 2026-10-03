// IntMap · ai-proxy · tasks — the accepted tasks, by wire name (derived from tasks/all.ts; nothing is listed here)
import * as ALL from "./all.ts";
import type { TaskSpec } from "./spec.ts";

export { maxOutputFor, HARD_MAX_OUTPUT, FALLBACK_MAX_OUTPUT } from "./spec.ts";
export type { TaskSpec } from "./spec.ts";

/* A Map, not an object: the key is caller-controlled text, and `TASKS.get("__proto__")` is undefined. */
export const TASKS: ReadonlyMap<string, TaskSpec> = new Map(Object.values(ALL).map((t: TaskSpec) => [t.name, t]));
