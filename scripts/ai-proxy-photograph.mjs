#!/usr/bin/env node
/* ============================================================================
 *  IntMap · photograph what ai-proxy does with the requests of tests/atlas-core-split-checks ①
 * ----------------------------------------------------------------------------
 *    node scripts/ai-proxy-photograph.mjs <git ref>
 *
 *  Runs the ref's supabase/functions/ai-proxy/index.ts on every request of
 *  tests/helpers/ai-proxy-contract-cases.mjs CASES and writes the status, headers, body and every
 *  request the function made to tests/fixtures/atlas-core-split-before.json. The check then holds
 *  the function as it is to that photograph.
 *  (atlas-core-split) Taken from b7978872 — the last commit in which index.ts was the whole
 *  function. A later change that alters an answer ON PURPOSE photographs again from a ref that has
 *  it; the diff of the fixture is then the statement of what that change altered.
 *  ⚠ The ref must be one whose ai-proxy is a single index.ts (the photograph runs that one file from
 *    a temporary directory, with its imports pointed back at this checkout's supabase/functions/).
 * ==========================================================================*/
import { writeFileSync } from 'node:fs';
import { photograph, FIXTURE } from '../tests/helpers/ai-proxy-contract-cases.mjs';

const ref = process.argv[2];
if (!ref) { console.error('usage: node scripts/ai-proxy-photograph.mjs <git ref>'); process.exit(2); }
const p = await photograph(ref);
writeFileSync(FIXTURE, JSON.stringify({
  '//': 'tests/atlas-core-split-checks.test.mjs ① — what ai-proxy did with each request of CASES (tests/helpers/ai-proxy-contract-cases.mjs), run from `source`. Regenerate: node scripts/ai-proxy-photograph.mjs <git ref>',
  ...p,
}, null, 1) + '\n');
console.log('photographed ' + p.source + ' → ' + Object.values(p.cases).flat().length + ' answers');
