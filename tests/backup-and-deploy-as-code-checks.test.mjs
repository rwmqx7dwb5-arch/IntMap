/* ============================================================================
 *  R822 — a workflow that could not do its job is RED; the Supabase deploy is code
 * ----------------------------------------------------------------------------
 *  THE DEFECT, as observed: `.github/workflows/db-backup.yml` answered a missing secret with a
 *  ::notice:: and exit 0. Run 35975392869 (2026-09-24) printed 「DB backup is DORMANT」 and was
 *  GREEN — as every night had been — while docs/INCIDENT-RESPONSE.md told a reader in a data-loss
 *  incident to take 「the newest backup」. No backup had ever been taken. Nothing could see it: the
 *  run list is where a person looks, and it was green.
 *
 *  So the property is stated about EVERY workflow the repository has (discovered, not listed):
 *    ① a job that reads a secret has a gate step that runs before anything else reading one, and
 *       that gate — actually EXECUTED here with the secrets empty — exits non-zero and names each
 *       missing secret; with them present it exits 0.
 *    ② a job or step whose `if:` reads a secret or a variable (a skip that GitHub reports as
 *       success) exists only where the workflow declares, in a comment, why that green skip is the
 *       job done — and every declaration still names a gate that exists.
 *  Plus the Supabase deploy that this round moved into CI, and the cron migration's secrets.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { functionRosterFromConfig, planDeploy, parseNameStatus, pendingFromDryRun, migrationMismatch } from '../scripts/supabase-deploy.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WF_DIR = path.join(ROOT, '.github', 'workflows');
/* the directory under test can be pointed elsewhere (used once to prove ① goes red on the old file) */
const WORKFLOWS = (process.env.R822_WORKFLOW_DIR || WF_DIR);
const files = readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f)).sort();

/* GitHub runs `run:` with bash. On Windows `bash` on PATH may be WSL's; use Git's own. */
const findBash = () => {
  if (process.platform !== 'win32') return 'bash';
  const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();   // …/Git/mingw64/libexec/git-core
  for (const rel of ['../../../usr/bin/bash.exe', '../../../bin/bash.exe']) {
    const p = path.resolve(exec, rel);
    if (existsSync(p)) return p;
  }
  return null;
};

/* an expression reference, not a word ending in «secrets.» (scripts/ci-require-secrets.sh is not a secret named sh) */
const SECRET = /(?<![\w.-])secrets\.([A-Za-z_][A-Za-z0-9_]*)/g;
const ignoredSecret = (n) => n === 'GITHUB_TOKEN';
const secretsIn = (v) => [...new Set([...JSON.stringify(v ?? '').matchAll(SECRET)].map((m) => m[1]).filter((n) => !ignoredSecret(n)))];

const docs = files.map((f) => {
  const text = readFileSync(path.join(WORKFLOWS, f), 'utf8');
  return { f, text, doc: yaml.load(text) };
});

test('the workflow universe was discovered (not listed)', () => {
  assert.ok(docs.length >= 5, `found ${docs.length} workflow file(s) in ${WORKFLOWS}`);
  for (const { f, doc } of docs) assert.ok(doc && doc.jobs, `${f} parses and has jobs`);
});

test('① every job that reads a secret FAILS without it, and names it (executed, not read)', () => {
  const bash = findBash();
  assert.ok(bash, 'could not locate bash (Git for Windows) — the gate cannot be executed, which is not a pass');
  const problems = [];
  let gates = 0;
  for (const { f, doc } of docs) {
    for (const [jobId, job] of Object.entries(doc.jobs)) {
      const needed = secretsIn(job);
      if (!needed.length) continue;
      const where = `${f} → ${jobId}`;
      const steps = job.steps || [];
      if (secretsIn(job.env).length) { problems.push(`${where}: job-level env reads ${secretsIn(job.env).join(', ')} — move it to the steps behind a gate`); continue; }
      const gateIdx = steps.findIndex((s) => s.run && secretsIn(s.env).length && needed.every((n) => secretsIn(s.env).includes(n)));
      const firstUse = steps.findIndex((s) => secretsIn(s).length);
      if (gateIdx < 0) { problems.push(`${where}: reads ${needed.join(', ')} but no \`run\` step maps all of them into env to check them`); continue; }
      if (firstUse < gateIdx) { problems.push(`${where}: step ${firstUse} reads a secret before the gate (step ${gateIdx})`); continue; }
      const gate = steps[gateIdx];
      const varsFor = Object.keys(gate.env).filter((k) => secretsIn(gate.env[k]).length);
      const out = path.join(mkdtempSync(path.join(tmpdir(), 'r822-')), 'out');
      const runGate = (value) => {
        writeFileSync(out, '');
        const env = { ...process.env, GITHUB_OUTPUT: out };
        for (const k of varsFor) env[k] = value;
        const r = spawnSync(bash, ['--noprofile', '--norc', '-eo', 'pipefail', '-c', gate.run], { cwd: ROOT, env, encoding: 'utf8', timeout: 30_000 });
        return { code: r.status, text: `${r.stdout || ''}${r.stderr || ''}` };
      };
      gates++;
      const absent = runGate('');
      if (absent.code === 0) problems.push(`${where}: with ${needed.join(', ')} EMPTY the gate step 「${gate.name || gateIdx}」 exits 0 — the run is green and did nothing (the db-backup DORMANT defect)`);
      for (const n of needed) {
        if (!new RegExp(`::error::[^\\n]*\\b${n}\\b`).test(absent.text)) problems.push(`${where}: with the secrets empty, no ::error:: line names ${n} — the red run does not say what is missing`);
      }
      const present = runGate('x-not-a-secret');
      if (present.code !== 0) problems.push(`${where}: with every secret present the gate still fails (exit ${present.code}): ${present.text.trim().slice(0, 200)}`);
      rmSync(path.dirname(out), { recursive: true, force: true });
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
  assert.ok(gates >= 1, 'at least one secret-reading job was measured (the backup reads two)');
});

test('② an `if:` that reads a secret or variable (a green skip) exists only with a declared reason', () => {
  const problems = [];
  for (const { f, doc, text } of docs) {
    const declared = new Map([...text.matchAll(/^#\s*green-skip-by-design\s+((?:vars|secrets)\.[A-Za-z0-9_]+):\s*(.*)$/gm)].map((m) => [m[1], m[2].trim()]));
    const used = new Set();
    const ifs = [];
    for (const [jobId, job] of Object.entries(doc.jobs)) {
      ifs.push([`${jobId}`, job.if]);
      (job.steps || []).forEach((s, i) => ifs.push([`${jobId}.steps[${i}]`, s.if]));
    }
    for (const [at, cond] of ifs) {
      for (const m of String(cond ?? '').matchAll(/(?<![\w.-])(vars|secrets)\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        const key = `${m[1]}.${m[2]}`;
        used.add(key);
        if (!declared.has(key)) problems.push(`${f} → ${at}: \`if:\` reads ${key}, so when it is unset the job SKIPS and the run is GREEN. Fail instead, or declare why with a comment 「# green-skip-by-design ${key}: <reason>」`);
        else if (declared.get(key).length < 40) problems.push(`${f}: the green-skip declaration for ${key} has no reason worth the name («${declared.get(key)}»)`);
      }
    }
    for (const key of declared.keys()) if (!used.has(key)) problems.push(`${f}: declares a green skip on ${key}, but no \`if:\` reads it any more — delete the declaration`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

/* ---------------------------------------------------------------- the Supabase deploy */

const toml = readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8');
const roster = functionRosterFromConfig(toml);

test('③ the deploy roster is config.toml\'s [functions.*], and it matches the function directories', () => {
  const dirs = readdirSync(path.join(ROOT, 'supabase', 'functions'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name).sort();
  assert.deepEqual([...roster].sort(), dirs);
});

test('④ planDeploy: one function, _shared → all, config.toml → all, added migrations only', () => {
  const one = roster[0];
  let p = planDeploy(parseNameStatus(`M\tsupabase/functions/${one}/index.ts\nM\tjs/app.js`), roster);
  assert.deepEqual(p.functions, [one]);
  assert.equal(p.all, null);
  p = planDeploy([{ status: 'M', file: 'supabase/functions/_shared/relay-guard.js' }], roster);
  assert.deepEqual(p.functions, roster);
  /* #R806's fix was a config.toml-only change; a deploy that looks at function directories only
     would never have shipped it */
  p = planDeploy([{ status: 'M', file: 'supabase/config.toml' }], roster);
  assert.deepEqual(p.functions, roster);
  p = planDeploy(parseNameStatus('A\tsupabase/migrations/20990101000000_x.sql\nM\tsupabase/migrations/20260718090000_baseline.sql'), roster);
  assert.deepEqual(p.migrations.added, ['20990101000000']);
  assert.deepEqual(p.migrations.edited, ['20260718090000']);
  assert.deepEqual(p.functions, []);
  p = planDeploy([{ status: 'A', file: 'supabase/functions/not-declared-anywhere/index.ts' }], roster);
  assert.deepEqual(p.unknownFunctionDirs, ['not-declared-anywhere'], 'an undeclared function is reported, not deployed with default settings');
});

test('⑤ db push runs only when it would apply exactly what the push added (else it would re-run the baseline)', () => {
  const dry = 'DRY RUN: migrations will *not* be pushed to the database.\nWould push these migrations:\n • 20260718090000_baseline.sql\n • 20990101000000_x.sql\n';
  const pending = pendingFromDryRun(dry);
  assert.deepEqual(pending, ['20260718090000', '20990101000000']);
  assert.match(migrationMismatch(pending, ['20990101000000']), /ALSO apply 20260718090000/);
  assert.equal(migrationMismatch(['20990101000000'], ['20990101000000']), null);
  assert.match(migrationMismatch([], ['20990101000000']), /would NOT apply 20990101000000/);
  /* the refusal CLI 2.106.0 printed against production on 2026-09-25 lists versions without .sql —
     it must not be read as «these would be pushed» */
  assert.deepEqual(pendingFromDryRun('Remote migration versions not found in local migrations directory.\nsupabase migration repair --status reverted 20260722000000 20260722120000'), []);
});

test('⑥ supabase-deploy.yml: every path the planner reacts to triggers it; drift is nightly and --check', () => {
  const wf = yaml.load(readFileSync(path.join(WF_DIR, 'supabase-deploy.yml'), 'utf8'));
  const on = wf.on || wf[true];
  const globs = on.push.paths;
  const toRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');
  const reacts = [`supabase/functions/${roster[0]}/index.ts`, 'supabase/functions/_shared/x.js', 'supabase/config.toml', 'supabase/migrations/20990101000000_x.sql'];
  for (const file of reacts) {
    assert.ok(planDeploy([{ status: 'A', file }], roster).functions.length || planDeploy([{ status: 'A', file }], roster).migrations.added.length, `the planner acts on ${file}`);
    assert.ok(globs.some((g) => toRe(g).test(file)), `a push changing ${file} starts the workflow`);
  }
  assert.deepEqual(on.push.branches, ['main']);
  assert.ok(on.schedule && on.schedule.length, 'the drift check has a schedule');
  const drift = JSON.stringify(wf.jobs.drift);
  assert.match(drift, /release-state\.mjs[^"]*--check/, 'drift runs release-state with --check (exit 1 = drift, 2 = unmeasured — both red)');
  const deploy = JSON.stringify(wf.jobs.deploy);
  assert.match(deploy, /supabase-deploy\.mjs/);
  assert.match(readFileSync(path.join(ROOT, 'scripts', 'supabase-deploy.mjs'), 'utf8'), /'functions', 'deploy', name, '--project-ref', REF, '--use-api'/, 'functions deploy is --use-api (docs/AGENT-SETUP.md §9)');
});

/* ---------------------------------------------------------------- migrations carry no secret */

test('⑦ no migration writes a secret into a header literal, and every cron.schedule is named (idempotent)', () => {
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const problems = [];
  let scheduled = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
    const sql = readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join('\n');
    if (/'x-[a-z-]*secret'\s*,\s*'[^']+'/i.test(sql)) problems.push(`${f}: a *-secret header is given a string literal — read it from vault`);
    for (const m of sql.matchAll(/cron\.schedule\s*\(\s*([^,]+),/g)) {
      scheduled++;
      if (!/^'[^']+'$/.test(m[1].trim()) && !/newcmd|\$/.test(m[1])) problems.push(`${f}: cron.schedule without a literal job name — re-applying it would add a second job`);
    }
  }
  assert.ok(scheduled >= 4, `the four production jobs are scheduled by a migration (found ${scheduled} cron.schedule calls)`);
  assert.deepEqual(problems, [], problems.join('\n'));
});

/* ---------------------------------------------------------------- the incident issue */

test('⑧ the incident issue: opened on red, body REWRITTEN while red, closed on green', async () => {
  const incident = createRequire(import.meta.url)('../scripts/ci-incident-issue.cjs');
  const calls = [];
  let open = [];
  const github = { rest: { issues: {
    listForRepo: async () => ({ data: open }),
    getLabel: async () => { const e = new Error('nf'); e.status = 404; throw e; },
    createLabel: async (a) => { calls.push(['label', a.name]); },
    create: async (a) => { calls.push(['create', a.body]); open = [{ number: 7 }]; return { data: { number: 7 } }; },
    update: async (a) => { calls.push(['update', a.state || a.body]); },
    createComment: async () => { calls.push(['comment']); },
  } } };
  const context = { serverUrl: 'https://github.com', repo: { owner: 'o', repo: 'r' }, runId: 1 };
  const base = { label: 'status:x', title: 'X failing', runbook: 'docs' };
  assert.equal((await incident({ github, context }, { ...base, ok: false, cause: 'secret A missing' })).action, 'opened');
  assert.match(calls.find((c) => c[0] === 'create')[1], /secret A missing/);
  assert.equal((await incident({ github, context }, { ...base, ok: false, cause: 'secret B missing' })).action, 'rewritten');
  assert.match(calls.at(-1)[1], /secret B missing/, 'the body says what is wrong NOW, not what was wrong first');
  assert.equal((await incident({ github, context }, { ...base, ok: true })).action, 'closed');
  assert.equal(calls.at(-1)[1], 'closed');
});
