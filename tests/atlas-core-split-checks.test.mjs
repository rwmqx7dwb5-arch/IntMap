/* ============================================================================
 *  atlas-core-split — supabase/functions/ai-proxy, from one 2,327-line file to a module per job.
 *
 *  index.ts routes; ask.ts is the request; tasks/<task>.ts is everything one TASK decides, registered
 *  by one line in tasks/all.ts; config.ts / turn.ts / schema.ts / media.ts / provider-call.ts /
 *  providers/*.ts / models.ts / replay.ts hold what was moved out of the one file, unchanged.
 *
 *  ① THE SAME REQUESTS GET THE SAME ANSWERS. tests/fixtures/atlas-core-split-before.json is a
 *     PHOTOGRAPH of what the function did before the split (commit b7978872, the last one in which
 *     index.ts was the whole function) with every request below: the status, every response header,
 *     the body, and every request the function made to the auth server, the database and the
 *     providers — in order, with their headers and bodies. The function as it is now is run on the
 *     same requests (tests/helpers/ai-proxy-contract-run.mjs: Deno.serve captured, fetch stubbed,
 *     nothing of the function replaced) and must do exactly the same.
 *     The requests are tests/helpers/ai-proxy-contract-cases.mjs CASES; the photograph is taken by
 *     `node scripts/ai-proxy-photograph.mjs <git ref>` (a test does not write the checkout).
 *  ② index.ts ROUTES: it decides nothing about a task, an account or a provider.
 *  ③ A TASK IS ONE FILE AND ONE LINE: the registry is the directory, and each file states its name.
 *  ④ What Architecture says the tasks are is what the registry holds.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { aiProxyModules, AI_PROXY_DIR } from './helpers/ai-proxy-source.mjs';
import { CASES, runAll, FIXTURE } from './helpers/ai-proxy-contract-cases.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ① ─────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-core-split ① every request of the photograph gets the same answer, and causes the same requests, as before the split', async () => {
  const before = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  assert.deepEqual(Object.keys(before.cases), Object.keys(CASES), 'the photograph was taken of a different list of cases — take it again');
  const now = await runAll(pathToFileURL(join(AI_PROXY_DIR, 'index.ts')).href);
  for (const name of Object.keys(CASES)) {
    const b = before.cases[name], n = now[name];
    assert.equal(n.length, b.length, name + ': a different number of answers');
    n.forEach((r, i) => assert.deepEqual(r, b[i], name + ' #' + i + ' (' + JSON.stringify(CASES[name].requests[i].body || CASES[name].requests[i].method).slice(0, 90) + ') answers differently'));
  }
  /* the photograph is not vacuous: it holds answers of every kind the function gives */
  const all = Object.values(before.cases).flat();
  for (const s of [200, 400, 401, 405, 413, 429, 500, 502, 503]) assert.ok(all.some((r) => r.status === s), 'no ' + s + ' in the photograph');
  assert.ok(all.some((r) => /event-stream/.test(r.headers['content-type'] || '')), 'no stream in the photograph');
  for (const host of ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com']) {
    assert.ok(all.some((r) => r.calls.some((c) => c.url.includes(host))), 'no request to ' + host + ' in the photograph');
  }
});

test('atlas-core-split ① the comparison sees a change: an answer altered in the module it lives in is caught', async () => {
  const before = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const name = 'refusals before the provider (openai)';
  const altered = JSON.parse(JSON.stringify(before.cases[name]));
  altered[3].body.message = 'Unknown task!';
  assert.notDeepEqual(altered, before.cases[name]);
  /* and the bounds are read from config.ts, not restated: the photograph's too-large turn is MAX_INPUT_CHARS's */
  const cfg = await import('../supabase/functions/ai-proxy/turn.ts');
  assert.ok(6 * 96_000 > cfg.MAX_INPUT_CHARS, 'the too-large case no longer exceeds the bound it is about');
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-core-split ② index.ts routes: no task, account, provider or ledger is decided in it', () => {
  const idx = readFileSync(join(AI_PROXY_DIR, 'index.ts'), 'utf8');
  const code = codeOnly(idx);
  for (const word of ['task', 'payload', 'provider', 'openTurn', 'refund', 'Deno.env', 'createClient']) {
    assert.ok(!new RegExp('\\b' + word.replace('.', '\\.') + '\\b').test(code), 'index.ts decides something about «' + word + '» — that belongs in the module that does that job');
  }
  const imports = [...idx.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(imports.every((s) => s.startsWith('./')), 'index.ts imports from outside its own function: ' + imports.join(', '));
  assert.match(code, /const ROUTES: Route\[\] = \[/);
});

test('atlas-core-split ② every module of the function is read by the source checks, and every file in it is a module', () => {
  const graph = new Set(aiProxyModules().map((m) => m.rel));
  const walk = (d, pre = '') => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name), pre + e.name + '/') : [pre + e.name]);
  const files = walk(AI_PROXY_DIR).filter((f) => /\.(ts|js|mjs)$/.test(f));
  assert.deepEqual(files.filter((f) => !graph.has(f)), [], 'a code file in ai-proxy/ that index.ts does not reach — dead, or not deployed');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-core-split ③ a task is one file and one line: the registry is the directory', async () => {
  const dir = join(AI_PROXY_DIR, 'tasks');
  const SUPPORT = new Set(['spec.ts', 'index.ts', 'all.ts']);
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !SUPPORT.has(f)).map((f) => f.slice(0, -3)).sort();
  const lines = readFileSync(join(dir, 'all.ts'), 'utf8').split('\n').filter((l) => /^export /.test(l));
  const listed = lines.map((l) => (/^export \{ default as (\w+) \} from "\.\/(\w+)\.ts";$/.exec(l) || []).slice(1));
  listed.forEach(([a, b], i) => assert.equal(a, b, 'tasks/all.ts line ' + (i + 1) + ' exports a file under another name: ' + lines[i]));
  assert.deepEqual(listed.map((x) => x[0]).sort(), files, 'a task file that is not registered, or a registration with no file');
  const { TASKS } = await import('../supabase/functions/ai-proxy/tasks/index.ts');
  assert.deepEqual([...TASKS.keys()].sort(), files, 'a task whose `name` is not its file name');
  for (const t of TASKS.values()) {
    assert.ok(Number.isInteger(t.maxOutput) && t.maxOutput > 0, t.name + ': no output budget');
    assert.ok(['low', 'medium', 'high'].includes(t.reasoning), t.name + ': reasoning ' + t.reasoning);
    assert.ok(Object.isFrozen(t), t.name + ' can be changed at run time');
  }
  assert.equal(TASKS.get('__proto__'), undefined);
  assert.equal(TASKS.get('constructor'), undefined);
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-core-split ④ the tasks docs/architecture/05-ai.md names are the registry\'s', async () => {
  const { TASKS } = await import('../supabase/functions/ai-proxy/tasks/index.ts');
  const doc = rd('docs/architecture/05-ai.md');
  const at = doc.indexOf('タスクは allowlist');
  assert.ok(at >= 0, 'docs/architecture/05-ai.md no longer lists the tasks');
  const para = doc.slice(at, doc.indexOf('（正本は', at));
  const named = [...para.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);
  assert.deepEqual([...named].sort(), [...TASKS.keys()].sort());
  assert.match(doc.slice(at, at + 1200), /supabase\/functions\/ai-proxy\/tasks\//, 'the doc does not point at the registry');
});
