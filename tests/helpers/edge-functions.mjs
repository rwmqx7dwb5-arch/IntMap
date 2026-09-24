/* The Edge Functions as the repository DECLARES them, and the ones that import a shared module —
 * read from the tree every time, so a test that needs «how many there are» never carries a copy.
 *
 * ⚠ WHY THIS EXISTS (atlas-semantic-search). tests/r403 and tests/r699 mutate a documented count to prove that
 * check:docs goes red. They located the sentence by its number — 「Edge Functions は 17 本」,
 * «All seventeen», 「共有するのは15本」 — so every added function broke two test files that were
 * not about that function, and the fix each time was to type the next number
 * ([[intmap-gate-universe-decided-by-spelling]]: a number copied into a test is always the one
 * that is wrong). Whether the document's number is RIGHT is scripts/doc-facts.mjs's business; the
 * tests only need to find the sentence, and the sentence's number is the fact it states.
 *
 * The declaration is `supabase/config.toml` — every function has a [functions.*] block there
 * (tests/r801-edge-config-checks.test.mjs holds that to the directories under supabase/functions).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function declaredEdgeFunctions(root) {
  const toml = readFileSync(join(root, 'supabase/config.toml'), 'utf8');
  return [...toml.matchAll(/^\[functions\.([^\]\s]+)\]/gm)].map((m) => m[1]);
}

/* the functions any of whose own files import `_shared/<module>` */
export function functionsImporting(root, module) {
  const base = join(root, 'supabase/functions');
  const out = [];
  for (const name of readdirSync(base)) {
    if (name === '_shared') continue;
    const dir = join(base, name);
    if (!statSync(dir).isDirectory()) continue;
    const files = readdirSync(dir).filter((f) => /\.(ts|js|mjs)$/.test(f));
    if (files.some((f) => readFileSync(join(dir, f), 'utf8').includes('_shared/' + module))) out.push(name);
  }
  return out.sort();
}
