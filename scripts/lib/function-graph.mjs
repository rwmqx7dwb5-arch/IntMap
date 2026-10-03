/* ============================================================================
 *  An Edge Function's OWN modules — its entry point and every file of its directory the entry
 *  point reaches through relative imports. Read by the readers that ask «what does function X
 *  say» (scripts/doc-facts.mjs, tests/helpers/fn-cors.js, tests/helpers/ai-proxy-source.mjs).
 *
 *  (atlas-core-split) Those readers used to read `supabase/functions/<name>/index.ts` and nothing
 *  else, which was the whole function while every function was one file. ai-proxy is a module graph
 *  now (index.ts routes; ask.ts imports _shared/relay-guard.js, config.ts holds the CORS table), and
 *  a reader of index.ts alone would say ai-proxy imports no relay guard and declares no CORS
 *  contract — about a function that does both. So the graph is DISCOVERED from the import
 *  statements, never listed: a module added next round is read without anyone naming it.
 *  ⚠ Only files the entry point REACHES are read — a file in the directory that nothing imports is
 *    not deployed, and reading it would describe a ghost (tests/helpers/fn-cors.js says why that
 *    matters). `../_shared/*` is not followed: it is shared, and is read by its own path.
 *
 *  Order: the entry point first, then each module the first time an import reaches it (depth
 *  first, in the order the imports are written).
 * ==========================================================================*/
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

const SPEC = /(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;

/** [{ rel, abs, src }] for one function directory; [] when it has no entry point. */
export function functionModules(fnDir, entry = 'index.ts') {
  const root = resolve(fnDir);
  const first = join(root, entry);
  if (!existsSync(first)) return [];
  const seen = new Set();
  const out = [];
  const visit = (abs) => {
    if (seen.has(abs)) return;
    seen.add(abs);
    const src = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
    out.push({ rel: relative(root, abs).split(sep).join('/'), abs, src });
    for (const m of src.matchAll(SPEC)) {
      const spec = m[1] || m[2];
      if (!spec || !spec.startsWith('.')) continue;
      const next = resolve(dirname(abs), spec);
      if (!next.startsWith(root + sep)) continue;   /* ../_shared — not this function's own */
      if (!existsSync(next)) throw new Error(relative(root, abs) + ' imports ' + spec + ', which does not exist');
      visit(next);
    }
  };
  visit(first);
  return out;
}

/** The function's own source, one module after another; '' when it has no entry point. */
export function functionSource(fnDir, entry = 'index.ts') {
  return functionModules(fnDir, entry).map((m) => m.src).join('\n');
}
