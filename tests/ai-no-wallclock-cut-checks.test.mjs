/* (ai-no-wallclock-cut) A READER'S AI REQUEST ANSWERS TO THE PLATFORM'S CLOCK, NOT TO A NUMBER OF OURS.
 *
 *  MEASURED 2026-11-20 on production, logged in: a screenshot attached to «same angle, zoom and place as
 *  this» → ai-proxy answered 503 after 57,458 ms
 *      {"error":"provider_unavailable","message":"The AI provider timed out.","retryable":true,
 *       "meta":{"provider":"openai","model":"gpt-6.2-sol","task":"vision_read","timeout":true}}
 *  The provider was working. providerCall cut it at PROVIDER_TIMEOUT_MS (55 s), a number this project chose.
 *
 *  Everything here RUNS the code: providerBudgetMs is evaluated, and providerCall / callOpenAI are called
 *  with fetch and setTimeout stubbed so the deadline that reaches the abort timer is read, not the source.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = join(ROOT, 'supabase', 'functions');
const imp = (p) => import(pathToFileURL(join(FN, p)).href);

test('the budget is the platform window minus what settlement needs, and it is shared across the rungs', async () => {
  const P = await imp('_shared/ai-provider.js');
  assert.equal(P.EDGE_WALL_CLOCK_MS, 400000, 'Supabase paid-plan worker lifetime (docs/guides/functions/limits, read 2026-11-20)');
  assert.equal(P.EDGE_RESPONSE_START_MS, 150000, 'a response has to start within the gateway idle window');
  const t0 = 1_000_000;
  assert.equal(P.providerBudgetMs(true, t0, t0), 370000, 'a streamed call, nothing spent: the whole window less the margin');
  assert.equal(P.providerBudgetMs(false, t0, t0), 120000, 'a call that cannot stream must start answering inside the gateway window');
  assert.ok(P.providerBudgetMs(true, t0, t0) > 55000 * 5, 'the 55 s that cut the vision read is nowhere near what a request may run');
  assert.equal(P.providerBudgetMs(true, t0, t0 + 100000), 270000, 'a second rung gets what is left, never a fresh window');
  assert.equal(P.providerBudgetMs(true, t0, t0 + 10_000_000), 1, 'an exhausted budget fails at once as a timeout');
  assert.equal(P.providerBudgetMs(true, undefined, 5), 370000, 'a caller that never started the clock gets the window (it cannot be shorter than it knows)');
});

/* ── providerCall, evaluated: the abort timer that fetchBounded arms is the one that is read ── */
const ceiling = { take: async () => ({ ok: true }) };
async function armedTimers(run) {
  const armed = [];
  const realSet = globalThis.setTimeout;
  const keepFetch = globalThis.fetch;
  globalThis.setTimeout = (fn, ms, ...rest) => { if (ms >= 1000) armed.push(ms); return realSet(fn, ms, ...rest); };
  globalThis.fetch = async () => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  try { await run(); } finally { globalThis.setTimeout = realSet; globalThis.fetch = keepFetch; }
  return armed;
}

test('providerCall: no caller number → the platform budget reaches the abort timer', async () => {
  const { providerCall } = await imp('ai-proxy/provider-call.ts');
  const stream = await armedTimers(() => providerCall('https://api.openai.com/v1/responses', { method: 'POST' }, undefined,
    { ceiling, add() {}, startedAt: Date.now() }, () => {}));
  assert.ok(stream.some((ms) => ms > 360000 && ms <= 370000), 'streamed: ~370 s, got ' + JSON.stringify(stream));
  const plain = await armedTimers(() => providerCall('https://api.openai.com/v1/responses', { method: 'POST' }, undefined,
    { ceiling, add() {}, startedAt: Date.now() }));
  assert.ok(plain.some((ms) => ms > 110000 && ms <= 120000), 'not streamed: ~120 s, got ' + JSON.stringify(plain));
  const spent = await armedTimers(() => providerCall('https://api.openai.com/v1/responses', { method: 'POST' }, undefined,
    { ceiling, add() {}, startedAt: Date.now() - 200000 }, () => {}));
  assert.ok(spent.some((ms) => ms > 160000 && ms <= 170000), 'a request that already spent 200 s has ~170 s, got ' + JSON.stringify(spent));
});

test('callOpenAI: the vision read, the search call and its tool-free retry all take the budget — none a number of ours', async () => {
  const { callOpenAI } = await imp('ai-proxy/providers/openai.ts');
  const msg = (text) => ({ type: 'message', content: [{ type: 'output_text', text, annotations: [] }] });
  const armed = await armedTimers(() => callOpenAI('gpt-6.2-sol', 'k', 'p', 's', [], [], [], false, 500, false, false, 'low', 'auto', true, null, null, '',
    { ceiling, add() {}, startedAt: Date.now() }).catch(() => null));
  assert.ok(armed.length && armed.every((ms) => ms > 100000), 'every armed deadline is the platform\'s: ' + JSON.stringify(armed));
  assert.ok(!armed.includes(55000) && !armed.includes(90000) && !armed.includes(40000), 'neither 55 s, 90 s nor 40 s is armed');
  void msg;
});

test('the proxy source passes no timeout of its own (the model list lookups, a different job, keep theirs)', () => {
  const dir = join(FN, 'ai-proxy');
  const files = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.ts$/.test(e.name)) files.push(p); } };
  walk(dir);
  const bad = [];
  for (const f of files) {
    if (/PROVIDER_TIMEOUT_MS|WEB_TIMEOUT|\b90_000\b/.test(codeOnly(readFileSync(f, 'utf8')))) bad.push(f.slice(ROOT.length + 1));
  }
  assert.deepEqual(bad, [], 'a fixed number of ours is back in ai-proxy');
  assert.match(readFileSync(join(dir, 'ask.ts'), 'utf8'), /startedAt:\s*Date\.now\(\)/, 'the request clock the rungs share is started');
});

test('atlas-delegation-efficiency: a request answered as a stream keeps the long window even when the provider call itself is not streamed (a worker)', async () => {
  const { providerCall } = await imp('ai-proxy/provider-call.ts');
  const long = await armedTimers(() => providerCall('https://api.openai.com/v1/responses', { method: 'POST' }, undefined,
    { ceiling, add() {}, startedAt: Date.now(), longWindow: true }));
  assert.ok(long.some((ms) => ms > 360000 && ms <= 370000), 'longWindow: ~370 s, got ' + JSON.stringify(long));
});
