/* ============================================================================
 *  The source of the ai-proxy Edge Function, as ONE string — for the checks that read it.
 *
 *  (atlas-core-split) The function was one file, supabase/functions/ai-proxy/index.ts, and every
 *  check that reads its source read that path. It is a module graph now: index.ts routes, and the
 *  work is in the modules it imports (ask.ts, config.ts, turn.ts, tasks/*.ts, providers/*.ts …).
 *  A check that asks «does the function say X» must keep asking it of the WHOLE function, whichever
 *  module X moved to — scripts/lib/function-graph.mjs discovers the graph from the import
 *  statements (index.ts first), so a module added next round is read without anyone naming it.
 *
 *  A check that needs a function to RUN imports the module itself (node strips the types) —
 *  reading is for checks about what the source says, not what it does.
 * ==========================================================================*/
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { functionModules, functionSource } from '../../scripts/lib/function-graph.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const AI_PROXY_DIR = join(ROOT, 'supabase', 'functions', 'ai-proxy');

/** The function's own modules, entry point first: [{ rel, abs, src }]. */
export const aiProxyModules = () => functionModules(AI_PROXY_DIR);
/** The whole function's source, one module after another. */
export const aiProxySource = () => functionSource(AI_PROXY_DIR);
