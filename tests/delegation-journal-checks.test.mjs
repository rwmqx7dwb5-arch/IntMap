/* ============================================================================
 *  atlas-delegation · orchestration foundation — the journal, the idempotent worker, the model tier
 * ----------------------------------------------------------------------------
 *  supabase/migrations/20261119120000_delegation_journal.sql · ai-proxy ask.ts / config.ts / replay.ts ·
 *  _shared/ai-ledger.js (journalArgs / recordJournal).
 *
 *  ai-proxy is RUN here (imported and served in this process, with fetch stubbed: the provider, the auth server
 *  and the database RPCs; nothing of the function under test is replaced) — reading the source would not see an
 *  evaluation-order failure, or a journal call on a path nobody walked.
 *    ① config: ATLAS_DELEGATION_MODEL is a priced model id or it is ignored, with a reason (never run unpriced);
 *       unset changes nothing; the policy is untouched
 *    ② the journal's row: what is written, sanitised, and that no row is a request that read no account
 *    ③ the replay predicate: an Atlas turn and a worker's call hold their answer; no other task does
 *    ④ EVERY worker call and every Atlas root turn leaves a row — on success and on each refusal / failure
 *       path — and a journal that cannot be written never fails the request
 *    ⑤ a duplicate worker call receives the stored answer: one provider call, one child allowance slot, one row
 *    ⑥ the model tier reaches the provider for workers and only for workers
 *    ⑦ the migration: table, owner-only read, service-role-only writer, retention job, admin-only overview,
 *       the account's data inventory. (The SQL itself runs in supabase/tests/50_delegation_journal_test.sql.)
 *  ⚠ The database here is a JS model of the doors this function calls; the pgTAP file is the second reader.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { journalArgs, recordJournal, JOURNAL_OUTCOMES } from '../supabase/functions/_shared/ai-ledger.js';
import { delegationModel, delegationPolicy, DELEGATION_DEFAULTS, REPLAY_KEY_OK, MAX_TURN_KEY } from '../supabase/functions/ai-proxy/config.ts';
import { replayKeyFor } from '../supabase/functions/ai-proxy/replay.ts';
import { priceOf, MODEL_PRICE_USD_PER_MTOK } from '../supabase/functions/_shared/ai-provider.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── ① config ─────────────────────────────────────────────────────────────────────────────────── */
test('① ATLAS_DELEGATION_MODEL: a priced model id is used; anything else is ignored WITH a reason; unset is unchanged', () => {
  const env = (o) => (k) => o[k] || '';
  const priced = Object.keys(MODEL_PRICE_USD_PER_MTOK)[0];
  assert.deepEqual(delegationModel(env({})), { model: '', ignored: '' }, 'unset = behaviour unchanged');
  assert.deepEqual(delegationModel(env({ ATLAS_DELEGATION_MODEL: '   ' })), { model: '', ignored: '' }, 'blank is "not given"');
  assert.deepEqual(delegationModel(env({ ATLAS_DELEGATION_MODEL: ' ' + priced + ' ' })), { model: priced, ignored: '' });
  assert.equal(priceOf('gpt-99-unpriced').known, false, 'the premise: a model with no row is unpriced');
  assert.deepEqual(delegationModel(env({ ATLAS_DELEGATION_MODEL: 'gpt-99-unpriced' })), { model: '', ignored: 'unpriced' }, 'an unpriced model is never silently run');
  assert.deepEqual(delegationModel(env({ ATLAS_DELEGATION_MODEL: 'not a model;' })), { model: '', ignored: 'not_a_model_id' });
  /* a withdrawn id is NOT refused here: WITHDRAWN_MODELS only filters what the picker OFFERS (a refusal would be a capability boundary,
     CONSTITUTION §0.3); an operator who sets one, and it is priced, has chosen it. What is priced is the only rule. */
  assert.equal(delegationModel(env({ ATLAS_DELEGATION_MODEL: 'gpt-6-astra' })).ignored, priceOf('gpt-6-astra').known ? '' : 'unpriced');
  /* the policy object the page reads is not widened by it */
  assert.deepEqual(Object.keys(delegationPolicy(env({ ATLAS_DELEGATION_MODEL: priced }))).sort(), ['childMaxCalls', 'maxChildren', 'maxConcurrent', 'mode']);   /* (atlas-unbounded-turns) maxConcurrent: the page's worker queue */
  assert.equal(delegationPolicy(env({})).maxChildren, DELEGATION_DEFAULTS.maxChildren);
});

/* ── ② the row ────────────────────────────────────────────────────────────────────────────────── */
test('② journalArgs: the whole prompt, a closed outcome, no code on success, sanitised text — and no row without an account and a family', async () => {
  const a = journalArgs({ user: 'u1', root: 'r'.repeat(300), child: 'c-1', task: 'atlas_delegate', outcome: 'ok', code: 'ignored', http: 200, model: 'gpt-6.1-terra',
    latencyMs: 1234.9, total: { input: 100, cached_read: 20, cache_write: 5, output: 7 }, costMicros: 42.2, web: true });
  assert.equal(a.p_root.length, 120);
  assert.equal(a.p_code, '', 'ok carries no code');
  assert.equal(a.p_input, 125, 'uncached + cache read + cache write = what was sent');
  assert.equal(a.p_output, 7); assert.equal(a.p_latency_ms, 1234); assert.equal(a.p_cost_micros, 42); assert.equal(a.p_web, true);
  const b = journalArgs({ user: 'u1', root: 'r', outcome: 'exploded', code: 'a b;drop', task: 'x y', model: 'm"q' });
  assert.ok(JOURNAL_OUTCOMES.includes(b.p_outcome), 'an unknown outcome is coerced into the closed set');
  assert.equal(b.p_outcome, 'failed'); assert.equal(b.p_code, 'a_b_drop'); assert.equal(b.p_task, 'x_y'); assert.equal(b.p_model, 'm_q');
  assert.equal(journalArgs({ user: 'u', root: 'r', outcome: 'ok', latencyMs: -5, total: { input: NaN } }).p_latency_ms, 0);
  const calls = [];
  const db = { rpc: async (fn, args) => { calls.push([fn, args]); return { error: null }; } };
  assert.equal(await recordJournal(db, { user: '', root: 'r', outcome: 'ok' }), false);
  assert.equal(await recordJournal(db, { user: 'u', root: '', outcome: 'ok' }), false);
  assert.equal(calls.length, 0, 'no account or no family = no row');
  assert.equal(await recordJournal(db, { user: 'u', root: 'r', outcome: 'ok' }), true);
  assert.equal(calls[0][0], 'log_ai_delegation');
  assert.equal(await recordJournal({ rpc: async () => ({ error: { message: 'nope' } }) }, { user: 'u', root: 'r', outcome: 'ok' }), false, 'a refused write is false, not a throw');
  assert.equal(await recordJournal({ rpc: async () => { throw new Error('down'); } }, { user: 'u', root: 'r', outcome: 'ok' }), false, 'a thrown write is false, not a throw');
});

/* ── ③ the predicate ──────────────────────────────────────────────────────────────────────────── */
test('③ replayKeyFor: an Atlas turn and a worker hold their answer under a valid key; nothing else does', () => {
  const K = 'r3f1c0de-0000-4000-8000-00000000abcd';
  const base = { turnId: 'child-1', keyOk: REPLAY_KEY_OK, maxLen: MAX_TURN_KEY };
  assert.ok(REPLAY_KEY_OK.test(K), 'the premise: K is a key the format accepts');
  assert.equal(replayKeyFor({ ...base, protocol2Turn: true, delegate: false, bodyKey: K }), K);
  assert.equal(replayKeyFor({ ...base, protocol2Turn: false, delegate: true, headerKey: K }), K, 'a worker\'s retry names its key in the header');
  assert.equal(replayKeyFor({ ...base, protocol2Turn: false, delegate: true, bodyKey: K, headerKey: 'ignored-because-body-wins-like-the-turn' }), K);
  assert.equal(replayKeyFor({ ...base, protocol2Turn: false, delegate: false, bodyKey: K, headerKey: K }), '', 'any other one-string task is not keyed');
  assert.equal(replayKeyFor({ ...base, turnId: '', protocol2Turn: false, delegate: true, bodyKey: K }), '', 'no turn, no row to hold it under');
  assert.equal(replayKeyFor({ ...base, protocol2Turn: false, delegate: true, bodyKey: 'short' }), '', 'a key the format does not accept is no key');
});

/* ══ the world ai-proxy runs in (the shape tests/atlas-stream-replay-checks.test.mjs uses) ═══════════ */
const ENV = { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', AI_PROVIDER: 'openai', OPENAI_API_KEY: 'stub' };
const USER = { id: '00000000-0000-4000-8000-000000000002', aud: 'authenticated', role: 'authenticated', created_at: '2020-01-01T00:00:00Z' };
const OK_ANSWER = (model = 'gpt-6.1-terra') => ({ model, status: 'completed',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"summary":"found it","findings":[]}', annotations: [] }] }],
  usage: { input_tokens: 120, input_tokens_details: { cached_tokens: 100 }, output_tokens: 30 } });
const TURN_FINAL = { model: 'gpt-6.1-terra', status: 'completed',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"turn":"final","final_text":"ok"}', annotations: [] }] }],
  usage: { input_tokens: 50, output_tokens: 10 } };
const WORKER = { task: 'atlas_delegate', prompt: 'Find the ports on the Persian Gulf.', system: 'You are a research worker.' };
const ROOTBODY = { task: 'atlas_turn', protocol: 2, input: [{ type: 'message', role: 'user', content: 'hi' }], tools: [] };
const KEY = 'r3f1c0de-0000-4000-8000-00000000beef';

const W = { provider: [], providerN: 0, seq: [], rows: new Map(), journal: [], rpcFail: new Set(), logs: [], childCalls: 0 };
const reset = () => {
  W.provider = []; W.providerN = 0; W.seq = []; W.rows = new Map(); W.journal = []; W.rpcFail = new Set(); W.logs = []; W.childCalls = 0;
  for (const k of Object.keys(ENV)) if (k.startsWith('ATLAS_')) delete ENV[k];
};
const now = () => Date.now();
const rowKey = (a) => [a.p_user, a.p_turn, a.p_key].join('|');
const DB = {
  claim_ai_answer(a) {
    const k = rowKey(a); let r = W.rows.get(k);
    if (r && r.expires < now()) { W.rows.delete(k); r = null; }
    if (!r) { W.rows.set(k, { state: 'running', attempts: 1, status: null, body: null, lease: now() + a.p_lease_seconds * 1000, expires: now() + a.p_ttl_seconds * 1000 }); return [{ outcome: 'claimed', attempts: 1, status: null, body: null, after_state: '' }]; }
    if (r.state === 'done') return [{ outcome: 'done', attempts: r.attempts, status: r.status, body: r.body, after_state: '' }];
    if (r.state === 'running' && r.lease >= now()) return [{ outcome: 'running', attempts: r.attempts, status: null, body: null, after_state: '' }];
    const after = r.state === 'failed' ? 'failed' : 'abandoned';
    Object.assign(r, { state: 'running', attempts: r.attempts + 1, lease: now() + a.p_lease_seconds * 1000 });
    return [{ outcome: 'claimed', attempts: r.attempts, status: null, body: null, after_state: after }];
  },
  peek_ai_answer(a) { const r = W.rows.get(rowKey(a)); if (!r || r.expires < now()) return []; return [{ state: r.state, attempts: r.attempts, status: r.status, body: r.state === 'done' ? r.body : null }]; },
  beat_ai_answer() { return true; },
  finish_ai_answer(a) { const r = W.rows.get(rowKey(a)); if (!r || r.attempts !== a.p_attempt) return false; Object.assign(r, { state: a.p_ok ? 'done' : 'failed', status: a.p_status, body: a.p_ok ? JSON.parse(JSON.stringify(a.p_body)) : null }); return true; },
  consume_ai_turn() { return [{ allowed: true, used: 1, charged: true, calls: 1 }]; },
  consume_ai_child_turn() { W.childCalls += 1; return [{ allowed: true, used: 1, calls: W.childCalls, children: 1, reason: '', gen: null }]; },
  reserve_ai_spend(a) { return [{ allowed: true, reserved_micros: a.p_micros, spent_micros: 0 }]; },
  settle_ai_spend() { return true; },
  refund_ai_turn() { return null; },
  settle_ai_turn() { return true; },
  record_ai_usage() { return null; },
  record_usage_counts() { return null; },
  log_ai_delegation(a) { W.journal.push(a); return true; },
};
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
globalThis.Deno = { env: { get: (k) => ENV[k] || '' }, serve: (h) => { globalThis.__aiProxy = h; } };
console.error = (...a) => { W.logs.push(a.map(String).join(' ')); };
const HOSTS = ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com'];
globalThis.fetch = async (u, init) => {
  const s = String(u && u.url ? u.url : u);
  let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
  const host = new URL(s).hostname;
  if (HOSTS.includes(host)) {
    W.seq.push({ provider: true, body });
    const r = W.provider[Math.min(W.providerN, W.provider.length - 1)] || { status: 404, json: {} };
    W.providerN++;
    if (r.gate) await r.gate;
    return json(r.json === undefined ? {} : r.json, r.status || 200);
  }
  if (/\/auth\/v1\/user$/.test(s)) return json(USER);
  if (/\/rest\/v1\/profiles/.test(s)) return json([]);
  if (/\/rest\/v1\/rpc\/relay_take$/.test(s)) return json([{ allowed: true, remaining: 9 }]);
  const rpc = (/\/rest\/v1\/rpc\/([a-z_]+)$/.exec(s) || [])[1];
  if (rpc && DB[rpc]) {
    W.seq.push({ rpc, body });
    if (W.rpcFail.has(rpc)) return json({ message: 'relation does not exist', code: '42P01' }, 404);
    return json(DB[rpc](body || {}));
  }
  return json({ message: 'no route' }, 404);
};
await import(pathToFileURL(join(ROOT, 'supabase/functions/ai-proxy/index.ts')).href);
const serve = globalThis.__aiProxy;
const post = (body, extra) => serve(new Request('https://fn.test/', { method: 'POST', headers: { authorization: 'Bearer good', 'content-type': 'application/json', ...(extra || {}) }, body: JSON.stringify(body) }));
const asWorker = (extra) => ({ 'x-intmap-turn': 'child-1', 'x-intmap-parent-turn': 'root-1', ...(extra || {}) });
const asRoot = (extra) => ({ 'x-intmap-turn': 'root-1', ...(extra || {}) });
const count = (name) => W.seq.filter((c) => c.rpc === name).length;
const providerCalls = () => W.seq.filter((c) => c.provider).length;
const settled = async (pred, ms = 8000) => { const t = now(); while (!pred()) { if (now() - t > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 20)); } };

/* ── ④ every path leaves a row ────────────────────────────────────────────────────────────────── */
test('④ a worker call that answers leaves ONE row: its own key, the family, the model that served it, tokens, cost, latency', async () => {
  reset();
  W.provider = [{ json: OK_ANSWER('gpt-6.1-terra-2026-11-01') }];
  const res = await post(WORKER, asWorker());
  assert.equal(res.status, 200);
  assert.equal(W.journal.length, 1);
  const r = W.journal[0];
  assert.deepEqual({ user: r.p_user, root: r.p_root, child: r.p_child, task: r.p_task, outcome: r.p_outcome, code: r.p_code, http: r.p_http },
    { user: USER.id, root: 'root-1', child: 'child-1', task: 'atlas_delegate', outcome: 'ok', code: '', http: 200 });
  assert.equal(r.p_input, 120, 'the whole prompt: 20 uncached + 100 read from the cache');
  assert.equal(r.p_output, 30);
  assert.ok(r.p_cost_micros > 0, 'a cost, from the same price table as the spend fence');
  assert.ok(r.p_latency_ms >= 0);
  assert.equal(r.p_model, 'gpt-6.1-terra-2026-11-01', 'the model the provider says answered');
});

test('④ an Atlas root turn leaves a row with no child key; a one-string task that is neither does not', async () => {
  reset();
  W.provider = [{ json: TURN_FINAL }, { json: OK_ANSWER() }];
  assert.equal((await post(ROOTBODY, asRoot())).status, 200);
  assert.equal(W.journal.length, 1);
  assert.equal(W.journal[0].p_task, 'atlas_turn'); assert.equal(W.journal[0].p_child, ''); assert.equal(W.journal[0].p_root, 'root-1');
  assert.equal((await post({ task: 'free_text', prompt: 'hello' }, { 'x-intmap-turn': 'other-1' })).status, 200);
  assert.equal(W.journal.length, 1, 'a brief is not a delegation or a root turn');
});

test('④ a provider failure is a row (failed, its typed code and status), with what was billed before it failed', async () => {
  reset();
  W.provider = [{ status: 503, json: { error: { message: 'overloaded' } } }];
  const res = await post(WORKER, asWorker());
  assert.ok(res.status >= 500);
  assert.equal(W.journal.length, 1);
  assert.equal(W.journal[0].p_outcome, 'failed');
  assert.equal(W.journal[0].p_code, 'provider_unavailable');
  assert.equal(W.journal[0].p_http, res.status);
  reset();
  W.provider = [{ status: 503, json: {} }];
  assert.ok((await post(ROOTBODY, asRoot())).status >= 500);
  assert.deepEqual(W.journal.map((r) => [r.p_task, r.p_child, r.p_outcome]), [['atlas_turn', '', 'failed']]);
});

test('④ every refusal of a worker call is a row: delegation_off, a missing key, a refused child door, a wrong task, a spend cap', async () => {
  reset();
  ENV.ATLAS_DELEGATION = 'off';
  assert.equal((await post(WORKER, asWorker())).status, 409);
  delete ENV.ATLAS_DELEGATION;
  assert.equal((await post(WORKER, { 'x-intmap-parent-turn': 'root-1' })).status, 400, 'no key of its own');
  DB.consume_ai_child_turn = () => [{ allowed: false, used: 0, calls: 0, children: 2, reason: 'delegation_children', gen: null }];
  assert.equal((await post(WORKER, asWorker())).status, 409);
  const originalChild = () => { W.childCalls += 1; return [{ allowed: true, used: 1, calls: W.childCalls, children: 1, reason: '', gen: null }]; };
  DB.consume_ai_child_turn = originalChild;
  assert.equal((await post({ ...ROOTBODY }, asWorker())).status, 400, 'a worker call carries only the delegated task');
  DB.reserve_ai_spend = (a) => [{ allowed: false, reserved_micros: 1, spent_micros: a.p_cap_micros }];
  assert.equal((await post(WORKER, asWorker())).status, 409);
  DB.reserve_ai_spend = (a) => [{ allowed: true, reserved_micros: a.p_micros, spent_micros: 0 }];
  assert.deepEqual(W.journal.map((r) => [r.p_outcome, r.p_code, r.p_child]), [
    ['refused', 'delegation_off', 'child-1'],
    ['refused', 'delegation_key', ''],
    ['refused', 'delegation_children', 'child-1'],
    ['refused', 'bad_task', 'child-1'],
    ['refused', 'turn_cost', 'child-1'],
  ]);
  assert.equal(providerCalls(), 0, 'none of them reached a provider');
});

test('④ a root turn refused after its task is known is a row (turn_cost); a journal that cannot be written fails nothing', async () => {
  reset();
  DB.reserve_ai_spend = (a) => [{ allowed: false, reserved_micros: 0, spent_micros: a.p_cap_micros }];
  assert.equal((await post(ROOTBODY, asRoot())).status, 409);
  DB.reserve_ai_spend = (a) => [{ allowed: true, reserved_micros: a.p_micros, spent_micros: 0 }];
  assert.deepEqual(W.journal.map((r) => [r.p_task, r.p_outcome, r.p_code]), [['atlas_turn', 'refused', 'turn_cost']]);
  reset();
  W.rpcFail.add('log_ai_delegation');
  W.provider = [{ json: OK_ANSWER() }];
  const res = await post(WORKER, asWorker());
  assert.equal(res.status, 200, 'the answer is served though the journal could not be written');
  assert.equal((await res.json()).text.includes('found it'), true);
  assert.equal(count('log_ai_delegation'), 1, 'it was tried, once');
  assert.equal(W.journal.length, 0);
});

/* ── ⑤ the idempotent worker ──────────────────────────────────────────────────────────────────── */
test('⑤ a duplicate worker call (same key) receives the stored answer: one provider call, one child slot, one row, replayed, free', async () => {
  reset();
  W.provider = [{ json: OK_ANSWER() }, { json: OK_ANSWER('would-be-a-second-run') }];
  const first = await (await post({ ...WORKER, replayKey: KEY }, asWorker())).json();
  assert.equal(first.meta.replay, undefined, 'a first run is not a replay');
  const again = await (await post({ ...WORKER, replayKey: KEY }, asWorker({ 'x-intmap-replay': KEY }))).json();
  assert.equal(again.text, first.text);
  assert.equal(again.meta.replay.kind, 'replayed');
  assert.equal(again.charged, false);
  assert.equal(providerCalls(), 1, 'the duplicate was neither charged nor re-run');
  assert.equal(count('consume_ai_child_turn'), 1, 'it did not take a second slot of the child\'s call allowance');
  assert.equal(W.journal.length, 1, 'one run, one row');
});

test('⑤ a duplicate that arrives while the first is running waits for it (awaitAnswer) — and an unkeyed worker call is not held', async () => {
  reset();
  let open; const gate = new Promise((r) => { open = r; });
  W.provider = [{ json: OK_ANSWER(), gate }, { json: OK_ANSWER('second') }];
  const a = post({ ...WORKER, replayKey: KEY }, asWorker()).then((r) => r.json());
  await settled(() => providerCalls() === 1);
  const b = post({ ...WORKER, replayKey: KEY }, asWorker({ 'x-intmap-replay': KEY })).then((r) => r.json());
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(providerCalls(), 1, 'the duplicate ran the request while the first was alive');
  open();
  const [ja, jb] = await Promise.all([a, b]);
  assert.equal(ja.text, jb.text);
  assert.equal(jb.meta.replay.kind, 'replayed');
  assert.equal(providerCalls(), 1);
  reset();
  W.provider = [{ json: OK_ANSWER() }, { json: OK_ANSWER() }];
  await post(WORKER, asWorker()); await post(WORKER, asWorker());
  assert.equal(providerCalls(), 2, 'without a key nothing is held: the request runs as it did');
  assert.equal(W.rows.size, 0);
});

/* ── ⑥ the model tier ─────────────────────────────────────────────────────────────────────────── */
const askedModels = () => W.seq.filter((c) => c.provider).map((c) => c.body && c.body.model);
test('⑥ ATLAS_DELEGATION_MODEL reaches the provider for a worker and only for a worker; unset changes nothing', async () => {
  reset();
  W.provider = [{ json: OK_ANSWER() }];
  await post(WORKER, asWorker());
  const unchanged = askedModels()[0];
  assert.ok(unchanged, 'the model the server would have used');
  reset();
  ENV.ATLAS_DELEGATION_MODEL = 'gpt-6-luna';
  W.provider = [{ json: OK_ANSWER('gpt-6-luna') }, { json: TURN_FINAL }];
  await post(WORKER, asWorker());
  await post(ROOTBODY, asRoot());
  const [w, root] = askedModels();
  assert.equal(w, 'gpt-6-luna', 'the worker ran on the tier');
  assert.equal(root, unchanged, 'the reader\'s turn did not');
  assert.equal(W.journal[0].p_model, 'gpt-6-luna');
  assert.deepEqual(W.logs.filter((l) => /delegation_model_ignored/.test(l)), []);
});

test('⑥ an unpriced or malformed tier is ignored, loudly, and the worker runs on what its parent would have', async () => {
  reset();
  W.provider = [{ json: OK_ANSWER() }];
  await post(WORKER, asWorker());
  const unchanged = askedModels()[0];
  for (const [value, why] of [['gpt-99-unpriced', 'unpriced'], ['bad id!', 'not_a_model_id']]) {
    reset();
    ENV.ATLAS_DELEGATION_MODEL = value;
    W.provider = [{ json: OK_ANSWER() }];
    await post(WORKER, asWorker());
    assert.equal(askedModels()[0], unchanged, value + ' must not be used');
    assert.ok(W.logs.some((l) => l.includes('delegation_model_ignored') && l.includes(why)), 'the reason is logged: ' + why);
  }
});

/* ── ⑦ the migration ──────────────────────────────────────────────────────────────────────────── */
test('⑦ the migration: owner-only read, a service-role-only writer and purge, a scheduled retention, an admin-only overview, an inventory sentence', () => {
  const sql = read('supabase/migrations/20261119120000_delegation_journal.sql');
  assert.match(sql, /create table if not exists public\.ai_delegation_journal/);
  for (const col of ['user_id uuid', 'root_key', 'child_key', 'task', 'outcome', 'code', 'http_status', 'model', 'latency_ms', 'input_tokens', 'output_tokens', 'cost_micros', 'web', 'created_at']) assert.match(sql, new RegExp('\\b' + col.replace(' ', '\\s+') + '\\b'), col);
  assert.match(sql, /references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /check \(outcome in \('ok', 'failed', 'refused'\)\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.ai_delegation_journal from public, anon, authenticated;\s*grant select on public\.ai_delegation_journal to authenticated;/);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(sql, /revoke execute on function public\.log_ai_delegation\([^)]*\) from public, anon, authenticated;\s*grant\s+execute on function public\.log_ai_delegation\([^)]*\) to service_role;/);
  assert.match(sql, /revoke execute on function public\.purge_ai_delegation_journal\(integer\) from public, anon, authenticated;/);
  assert.match(sql, /cron\.schedule\('ai-delegation-journal-purge', '23 3 \* \* \*', 'select public\.purge_ai_delegation_journal\(30\)'\)/);
  assert.match(sql, /create index if not exists \w+ on public\.ai_delegation_journal \(created_at\)/);
  assert.match(sql, /create index if not exists \w+\s+on public\.ai_delegation_journal \(user_id, root_key\)/);
  assert.match(sql, /function public\.delegation_overview\(p_days integer default 7\)[\s\S]*?if not public\.is_admin\(\) then raise exception 'not authorised'/);
  assert.match(sql, /revoke execute on function public\.delegation_overview\(integer\) from public, anon;/);
  for (const key of ["'days'", "'codes'", "'roots'", "'children'", "'ok'", "'failed'", "'refused'", "'p50_ms'", "'p90_ms'", "'cost_usd'", "'turns'", "'code'", "'n'", "'day'"]) assert.ok(sql.includes(key), 'the overview shape names ' + key);
  assert.match(sql, /percentile_cont\(0\.5\)[\s\S]*percentile_cont\(0\.9\)/);
  assert.match(sql, /insert into public\.account_data_catalog[\s\S]*'ai_delegation_journal', 'intmap'/);
});
