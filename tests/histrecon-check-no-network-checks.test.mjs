/* tests/histrecon-check-no-network-checks.test.mjs — `check:histrecon` proves the committed bytes and never
   reads a live upstream.

   MEASURED 2026-10-06: PR #1022, an unrelated infra change, went red on CI run 37406113749 (Gates 2/3 and
   Regression 3/3) because `scripts/build-hist-admin-recon.mjs --check` asked dataverse.nl for the RISTAT
   1897 districts (scripts/histrecon/atoms/ristat-1897-uyezd.mjs) and got HTTP 504. The gate now reads the
   atom ids from scripts/histrecon/atoms/catalogue-lock.json; these checks keep it there. They run the gate
   with every outbound connection refused (scripts/no-network.mjs) AND an empty atom cache, so a read that
   a warm local cache would hide still fails here, on any machine, not only when the upstream is down. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = pathToFileURL(path.join(ROOT, 'scripts', 'no-network.mjs')).href;

function offline(args) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'intmap-no-network-'));
  const log = path.join(dir, 'refused.log');
  try {
    const r = spawnSync(process.execPath, ['--import', GUARD, ...args], {
      cwd: ROOT, encoding: 'utf8',
      env: { ...process.env, INTMAP_HISTRECON_CACHE: path.join(dir, 'cache'), INTMAP_NO_NETWORK_LOG: log },
    });
    return { ...r, refused: fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [] };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('the guard is not vacuous: an atom read with an empty cache is refused, not fetched', () => {
  /* the exact call that went red on #1022 — if this passed, the gate test below would prove nothing */
  const r = offline(['--input-type=module', '-e',
    "const m = await import('./scripts/histrecon/atoms/ristat-1897-uyezd.mjs'); await m.catalogue();"]);
  assert.notEqual(r.status, 0, 'the RISTAT read must fail offline');
  assert.match(r.stderr, /no-network: fetch https:\/\/dataverse\.nl\//);
  assert.equal(r.refused.length, 1);
});

test('check:histrecon passes with the network refused and no atom cache (it reads the catalogue lock)', () => {
  const r = offline(['scripts/build-hist-admin-recon.mjs', '--check']);
  assert.deepEqual(r.refused, [], 'the gate asked for the network:\n' + r.refused.join('\n'));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✓ check:histrecon/);
});

/* ── the rule is attached to every gate, not to check:histrecon ─────────────────────────────────
   Both runners (scripts/ci-gates.mjs in CI, scripts/test-parallel.mjs for `npm test`) hand each declared gate
   gateEnv() from scripts/gate-universe.mjs. MEASURED 2026-10-06: all 35 declared gates (the 33 that do not read the
   build, and check:perf + check:assets after a build) passed this way with an empty atom cache and no refusal. */
import { gateEnv, NO_NETWORK } from '../scripts/gate-universe.mjs';
import { localPlan } from '../scripts/test-parallel.mjs';

test('gateEnv loads the guard once, keeps the caller\'s NODE_OPTIONS, and its children are refused too', () => {
  const e = gateEnv({ NODE_OPTIONS: '--max-old-space-size=4096' });
  assert.equal(e.NODE_OPTIONS, '--max-old-space-size=4096 --import=' + NO_NETWORK);
  assert.equal(gateEnv(e).NODE_OPTIONS, e.NODE_OPTIONS, 'handing it twice must not load it twice');
  assert.ok(fs.existsSync(fileURLToPath(NO_NETWORK)));
  /* a grandchild (npm → node) inherits NODE_OPTIONS, which is how `npm run <gate>` is covered */
  const r = spawnSync(process.execPath, ['-e', "require('node:child_process').execFileSync(process.execPath, ['-e', \"fetch('https://example.org/').catch((e) => { console.log(e.message); })\"], { stdio: 'inherit' })"],
    { cwd: ROOT, encoding: 'utf8', env: gateEnv() });
  assert.match(r.stdout, /^no-network: fetch https:\/\/example\.org\//);
});

test('npm test runs every gate offline and nothing else (its plan marks each gate step)', () => {
  const plan = localPlan({ declared: ['check:aa', 'check:bb'], readsBuild: (g) => g === 'check:bb', command: (g) => ['node', [g]] });
  const steps = plan.halves.flatMap((h) => h.steps);
  assert.deepEqual(steps.filter((s) => s.offline).map((s) => s.gate), ['check:aa', 'check:bb']);
  assert.ok(steps.filter((s) => !s.gate).every((s) => !s.offline), 'the build and the test runners are not gates');
});

test('a CI shard turns a gate that reaches the network red, whatever the upstream answers', () => {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'no-network-shard-'));
  try {
    fs.mkdirSync(path.join(T, 'scripts'), { recursive: true });
    const take = (f) => {
      if (fs.existsSync(path.join(T, 'scripts', f))) return;
      fs.cpSync(path.join(ROOT, 'scripts', f), path.join(T, 'scripts', f));
      for (const m of fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8').matchAll(/(?:\bfrom\s*|\bnew URL\(\s*)['"]\.\/([^'"]+)['"]/g)) take(m[1]);
    };
    take('ci-gates.mjs');
    fs.writeFileSync(path.join(T, 'scripts', 'online.mjs'), "await fetch('https://example.org/');\n");
    fs.writeFileSync(path.join(T, 'scripts', 'offline.mjs'), "process.exit(0);\n");
    fs.writeFileSync(path.join(T, 'package.json'), JSON.stringify({ name: 'nn', private: true, scripts: {
      'check:online': 'node scripts/online.mjs', 'check:offline': 'node scripts/offline.mjs' } }));
    const r = spawnSync(process.execPath, [path.join(T, 'scripts', 'ci-gates.mjs'), '--shard', '1/1'], { cwd: T, encoding: 'utf8', env: { ...process.env, IM_PREBUILT_DIST: '' } });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /no-network: fetch https:\/\/example\.org\//);
    assert.match(r.stderr, /落ちたゲート 1 件: check:online/);
  } finally { fs.rmSync(T, { recursive: true, force: true }); }
});
