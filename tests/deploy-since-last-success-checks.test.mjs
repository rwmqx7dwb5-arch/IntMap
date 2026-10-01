/* ============================================================================
 *  deploy-since-last-success — the Supabase deploy diffs from the last SUCCESSFUL deploy
 * ----------------------------------------------------------------------------
 *  THE DEFECT, as observed 2026-10-01: supabase-deploy.yml deployed the functions changed by
 *  HEAD^..HEAD. #869 (added usage-count, changed config.toml) was red at the migration dry run and
 *  deployed nothing; #874 (changed _shared/) was red for the same reason; #878 fixed the migrations
 *  and was GREEN — and deployed no function, because #878 itself changed none. usage-count was
 *  absent from production (404) and #874's _shared change undeployed, under a green run.
 *
 *  The run list and the name-status lines below are the real ones (gh run list / git diff,
 *  recorded 2026-10-02), restricted to supabase/. They are a replay, not a list the code consults.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import {
  functionRosterFromConfig, planDeploy, parseNameStatus, chooseDeployBase, carriesContract,
  DEPLOY_BASE_CONTRACT, missingFromProduction, withMissing, workflowFileFromRef,
} from '../scripts/supabase-deploy.mjs';
import { parseFunctionsList } from '../scripts/release-state.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const roster = functionRosterFromConfig(readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8'));
const SCRIPT = readFileSync(path.join(ROOT, 'scripts', 'supabase-deploy.mjs'), 'utf8');

/* the commits, in order (squash merges on main) */
const S0 = 'dec394cf791ad3c2950110e30678391b91b6e363';      // last green deploy before #869
const P869 = '680f61025a83346088e800f8168f592f30ced66e';
const P874 = '6814144316bd73b1298ad735d0faddaf66bb0f27';
const P878 = 'c553b0be031d8381e9a1d231cb6e34b6caf0250e';
const LINE = [S0, P869, P874, P878];
const isAncestor = (a, b) => LINE.indexOf(a) >= 0 && LINE.indexOf(a) <= LINE.indexOf(b);

/* git diff --name-status --no-renames <parent> <commit> -- supabase */
const DIFF = {
  [P869]: 'M\tsupabase/config.toml\nA\tsupabase/functions/usage-count/index.ts\nA\tsupabase/functions/usage-count/shape.js\nA\tsupabase/migrations/20261002090000_usage_counts.sql\nM\tsupabase/tests/00_structure_test.sql\nA\tsupabase/tests/16_usage_counts_test.sql',
  [P874]: 'M\tsupabase/functions/_shared/ai-ledger.js\nA\tsupabase/functions/_shared/plans.js\nM\tsupabase/functions/ai-proxy/index.ts\nA\tsupabase/migrations/20261001120000_operating_stats.sql',
  [P878]: 'D\tsupabase/migrations/20261001120000_operating_stats.sql\nD\tsupabase/migrations/20261002090000_usage_counts.sql\nA\tsupabase/migrations/20261002110000_operating_stats.sql\nA\tsupabase/migrations/20261002120000_usage_counts.sql',
};
/* git diff --name-status --no-renames S0 P878 -- supabase (the composition, as git reports it) */
const DIFF_S0_878 = 'M\tsupabase/config.toml\nM\tsupabase/functions/_shared/ai-ledger.js\nA\tsupabase/functions/_shared/plans.js\nM\tsupabase/functions/ai-proxy/index.ts\nA\tsupabase/functions/usage-count/index.ts\nA\tsupabase/functions/usage-count/shape.js\nA\tsupabase/migrations/20261002110000_operating_stats.sql\nA\tsupabase/migrations/20261002120000_usage_counts.sql\nM\tsupabase/tests/00_structure_test.sql\nA\tsupabase/tests/16_usage_counts_test.sql';

/* gh run list --workflow supabase-deploy.yml --event push, as it stood when #878's run started */
const RUNS_AT_878 = [
  { databaseId: 36901713528, headSha: P874, createdAt: '2026-10-01T17:45:18Z', conclusion: 'failure' },
  { databaseId: 36898827404, headSha: P869, createdAt: '2026-10-01T17:21:54Z', conclusion: 'failure' },
  { databaseId: 36892329088, headSha: S0, createdAt: '2026-10-01T16:29:02Z', conclusion: 'success' },
];

test('the defect, replayed: HEAD^..HEAD at #878 deploys no function', () => {
  const old = planDeploy(parseNameStatus(DIFF[P878]), roster);
  assert.deepEqual(old.functions, [], 'the old rule had nothing to deploy at #878 — that was the outage');
  assert.ok(roster.includes('usage-count'), 'usage-count is declared (config.toml) — the function production did not have');
});

test('#869 → #874 → #878: the base is the last green deploy, and every function is deployed', () => {
  const chosen = chooseDeployBase(RUNS_AT_878, { head: P878, isAncestor, honoursContract: () => true });
  assert.equal(chosen.base, S0, chosen.why);
  const plan = planDeploy(parseNameStatus(DIFF_S0_878), roster);
  assert.deepEqual(plan.functions, roster, 'config.toml (#869) and _shared (#874) changed since the base → all');
  assert.ok(plan.functions.includes('usage-count'));
  assert.ok(plan.functions.includes('ai-proxy'));
  /* #878 renamed the two migrations; from the base only the renamed ones were ever added */
  assert.deepEqual(plan.migrations.added, ['20261002110000', '20261002120000']);
  /* and the composition agrees with the per-commit diffs: no file the three commits touched is lost */
  const union = new Set(Object.values(DIFF).flatMap((d) => parseNameStatus(d).map((c) => c.file)));
  for (const { file } of parseNameStatus(DIFF_S0_878)) assert.ok(union.has(file), file);
});

test('a red run never becomes the base; nor does a green run that predates the rule', () => {
  /* the only green runs are on the old rule (HEAD^..HEAD) → no base → every function */
  const legacy = chooseDeployBase([...RUNS_AT_878, { databaseId: 36904804899, headSha: P878, createdAt: '2026-10-01T18:10:05Z', conclusion: 'success' }],
    { head: P878, isAncestor, honoursContract: () => false });
  assert.equal(legacy.base, null);
  assert.match(legacy.why, new RegExp(DEPLOY_BASE_CONTRACT));
  /* #878 green under the old rule, an older green run under the new one → the older one */
  const mixed = chooseDeployBase([...RUNS_AT_878, { databaseId: 36904804899, headSha: P878, createdAt: '2026-10-01T18:10:05Z', conclusion: 'success' }],
    { head: P878, isAncestor, honoursContract: (sha) => sha === S0 });
  assert.equal(mixed.base, S0, mixed.why);
  assert.equal(chooseDeployBase([], { head: P878, isAncestor, honoursContract: () => true }).base, null, 'no record → every function');
  assert.equal(chooseDeployBase(RUNS_AT_878.filter((r) => r.conclusion !== 'success'), { head: P878, isAncestor, honoursContract: () => true }).base, null);
});

test('a green deploy that is not an ancestor of HEAD (rewritten history) → every function', () => {
  const off = { databaseId: 1, headSha: 'f'.repeat(40), createdAt: '2026-10-01T17:00:00Z', conclusion: 'success' };
  const r = chooseDeployBase([...RUNS_AT_878, off], { head: P878, isAncestor, honoursContract: () => true });
  assert.equal(r.base, null, 'an older ancestor would not redeploy what the off-line commit changed');
  assert.match(r.why, /not an ancestor/);
});

test('the rule marker: this script carries it, an older copy does not', () => {
  assert.ok(carriesContract(SCRIPT), 'scripts/supabase-deploy.mjs declares the rule it runs');
  assert.equal(carriesContract(SCRIPT.replace(/DEPLOY_BASE_CONTRACT = '[^']*'/, "DEPLOY_BASE_CONTRACT = 'x'")), false);
  assert.equal(carriesContract(''), false);
});

test('a declared function absent from production is always deployed; unmeasured is not "none missing"', () => {
  const listed = parseFunctionsList(`A new version of Supabase CLI is available\n${JSON.stringify(roster.filter((n) => n !== 'usage-count').map((slug) => ({ slug })))}\n`).map((f) => f.slug);
  const missing = missingFromProduction(roster, listed);
  assert.deepEqual(missing, ['usage-count']);
  const plan = withMissing(planDeploy([], roster), roster, missing);
  assert.deepEqual(plan.functions, ['usage-count'], 'an empty diff still deploys the function production lacks');
  assert.deepEqual(plan.absentInProduction, ['usage-count']);
  assert.equal(missingFromProduction(roster, null), null);
  assert.throws(() => parseFunctionsList('Unauthorized'), /no JSON array/, 'an unreadable list is an error, not zero functions');
});

test('the workflow asks its own run history, reads green push runs only, and can read it', () => {
  assert.equal(workflowFileFromRef('o/r/.github/workflows/supabase-deploy.yml@refs/heads/main'), 'supabase-deploy.yml');
  assert.equal(workflowFileFromRef(''), null);
  const wf = yaml.load(readFileSync(path.join(ROOT, '.github', 'workflows', 'supabase-deploy.yml'), 'utf8'));
  assert.equal(wf.permissions.actions, 'read', 'gh run list needs actions: read');
  const deploy = wf.jobs.deploy.steps.find((s) => /supabase-deploy\.mjs/.test(s.run || ''));
  assert.match(deploy.run, /--base-from-runs/);
  assert.doesNotMatch(deploy.run, /--before/, 'the push\'s own parent is not the base');
  assert.ok(deploy.env.GH_TOKEN, 'gh is given the job token');
  const checkout = wf.jobs.deploy.steps.find((s) => /actions\/checkout/.test(s.uses || ''));
  assert.equal(checkout.with['fetch-depth'], 0, 'the base commit must exist in the checkout');
  /* the script filters to push runs with success, and checks existence after deploying */
  assert.match(SCRIPT, /'--event', 'push'/);
  assert.match(SCRIPT, /'--status', 'success'/);
  assert.match(SCRIPT, /NOT in production after the deploy/);
});
