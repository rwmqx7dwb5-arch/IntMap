/*
 * IntMap · ci-reach — DOES CI ACTUALLY RUN THIS GATE?  (#R771)
 *
 *  Five test files asked that question, and all five asked it the same wrong way: by looking for the
 *  literal `npm run check:<name>` inside `.github/workflows/ci.yml`. That was true for as long as
 *  every declared gate had a step of its own. #R771 split the 28 gates across three machines —
 *  scripts/ci-gates.mjs DISCOVERS them from package.json and runs the bin it planned — and every one
 *  of those assertions went red while every gate still ran. They were measuring the workflow's
 *  spelling, not what it executes.
 *
 *  ⚠ SO THE RULE LIVES IN ONE PLACE, NOT FIVE. A judgement copied into five files drifts in five
 *  directions, and #R660 already recorded the shape: 「規則が2か所にあると片方を直しても本番に
 *  届かない」. Callers ask this module; nobody re-implements it.
 *
 *  ⚠ AND IT IS ANSWERED BY EVALUATION, NOT BY READING. The planner is executed. A gate that falls
 *  out of the plan — or a planner that stops planning — turns its caller red, which is the whole
 *  reason those assertions exist. Reading ci-gates.mjs' source instead would re-create exactly the
 *  defect this module was written to remove.
 *
 *  ⚠ COMMENTS ARE NOT CALLERS (#R628). The workflow is stripped of `#` lines before it is trusted to
 *  reach the planner: a sentence explaining the shard step looks exactly like the shard step, and
 *  #R628 measured a deleted step passing because the comment quoting it was still there.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CI = join(ROOT, '.github', 'workflows', 'ci.yml');

/** ci.yml with its comment lines removed — the only form any of this may be judged on. */
export function liveWorkflow() {
  return readFileSync(CI, 'utf8').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
}

let cached = null;

/**
 * The gates a CI shard run would actually execute, asked of the planner itself.
 * Empty when the workflow does not invoke it on a non-comment line — so deleting the shard step
 * makes every caller go red rather than quietly widening.
 */
export function plannedGates() {
  if (cached) return cached;
  if (!/scripts\/ci-gates\.mjs\s+--shard/.test(liveWorkflow())) return (cached = []);
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'ci-gates.mjs'), '--planned'],
    { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  return (cached = JSON.parse(out.trim()));
}

/**
 * True when CI runs `gate` — either as a step that still names it directly (both forms stay valid;
 * a gate does not have to go through the planner), or because the planner places it on a shard.
 * @param {string} gate e.g. 'check:histfill'
 */
export function ciRuns(gate) {
  const live = liveWorkflow();
  if (live.includes('npm run ' + gate)) return true;
  return plannedGates().includes(gate);
}

/**
 * The same question asked about a gate's SCRIPT rather than its npm alias, for the callers that
 * know a file name (`atlas-capability-audit`) and not the alias it is declared under.
 */
export function ciRunsScript(scriptStem) {
  const live = liveWorkflow();
  if (live.includes('scripts/' + scriptStem + '.mjs')) return true;
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts || {};
  return plannedGates().some((g) => String(pkg[g] || '').includes('scripts/' + scriptStem + '.mjs'));
}

/**
 * True when the build runs before `gate` in whatever CI actually does — for the gates that read what
 * `npm run build` wrote rather than what the tree contains.
 *
 * ⚠ (#R771) THIS USED TO BE ASKED AS A STRING OFFSET: `ci.indexOf('npm run build') < ci.indexOf('check:perf')`.
 * That was a fact about where two lines sat in a file, and it stopped being answerable the moment
 * the gates were planned rather than listed — while the ordering it cared about became STRONGER
 * (the planner packs the build and its dependants into one task, so they cannot be separated onto
 * different machines at all). The question is asked of the plan.
 */
export function ciBuildsBefore(gate) {
  const live = liveWorkflow();
  if (live.includes('npm run ' + gate)) {
    const b = live.indexOf('npm run build');
    return b >= 0 && b < live.indexOf('npm run ' + gate);
  }
  if (!plannedGates().includes(gate)) return false;
  const plan = execFileSync(process.execPath, [join(ROOT, 'scripts', 'ci-gates.mjs'), '--plan'],
    { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  const line = plan.split('\n').find((l) => l.includes('npm run build'));
  return Boolean(line && line.includes(gate));
}
