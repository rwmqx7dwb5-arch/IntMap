/* ============================================================================
 *  atlas-stream-replay — a broken stream is RECEIVED again, not COMPUTED again
 * ----------------------------------------------------------------------------
 *  dev-notes/2026-10-01-atlas-stream-replay.md has the finding. A streamed Atlas request runs to its
 *  end on the server even when the reader's connection drops; the page then retried without
 *  streaming, and the server could only answer that retry with a NEW provider call — a second answer
 *  and a second provider bill for a result that already existed (one-pass-or-a-reason §2, cause 2).
 *
 *  What these checks hold — ai-proxy is RUN (imported and served in this process, with fetch
 *  stubbed: the provider, the auth server and the database RPCs; nothing of the function under test
 *  is replaced):
 *    ① a retry after a broken stream receives the first request's own answer: the provider is asked
 *       ONCE, the turn is consumed ONCE, the usage is recorded ONCE, nothing is refunded, and the
 *       retry says it is a replay (meta.replay) and that it charged nothing;
 *    ② a retry that arrives while the first request is still running waits for it — no second run;
 *    ③ only an OBSERVED failure (or a run whose isolate stopped beating) is run again, and the run
 *       says why and which attempt it is;
 *    ④ a request without a replay key, and a ledger that does not answer, behave as before (the
 *       latter says the answer is not held);
 *    ⑤ js/ai-core.js mints one replay key per streamed request, sends it again in x-intmap-replay on
 *       its one retry, and reports what the server said that retry was — never a guess;
 *    ⑥ the migration: RLS, owner-only read, writes only through service_role RPCs, a sweep; and no
 *       limit moved (CONSTITUTION.md §5).
 *
 *  ⚠ The database here is a JS model of claim / peek / beat / finish — the SQL itself is exercised by
 *  supabase/tests/15_ai_turn_answers_test.sql (`supabase test db`). A model written beside the code it
 *  checks can agree with it about the wrong thing; the pgTAP file is the second reader.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importModule } from './helpers/import-module.mjs';
import { SITE_HOST } from '../supabase/functions/_shared/site-origin.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══ the world ai-proxy runs in ══════════════════════════════════════════════════════════════ */
const ENV = { SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', AI_PROVIDER: 'openai', OPENAI_API_KEY: 'stub' };
const USER = { id: '00000000-0000-4000-8000-000000000002', aud: 'authenticated', role: 'authenticated', created_at: '2020-01-01T00:00:00Z' };
const OA_FINAL = { model: 'gpt-5.6-terra', status: 'completed',
  output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"turn":"final","final_text":"東京は約1400万人です"}', annotations: [] }] }],
  usage: { input_tokens: 120, input_tokens_details: { cached_tokens: 100 }, output_tokens: 30 } };
const OA_SECOND = JSON.parse(JSON.stringify(OA_FINAL).replace('約1400万人', '1,400万人ほど'));   /* what a second run would have said */
const OA_SSE = [
  ['response.created', { type: 'response.created', response: { status: 'in_progress' } }],
  ['response.output_text.delta', { type: 'response.output_text.delta', delta: '{"turn":"final","final_text":"東京は' }],
  ['response.output_text.delta', { type: 'response.output_text.delta', delta: '約1400万人です"}' }],
  ['response.completed', { type: 'response.completed', response: OA_FINAL }],
];
const OA_FAILED = [['response.created', { type: 'response.created', response: {} }],
  ['response.failed', { type: 'response.failed', response: { status: 'failed', error: { code: 'server_error', message: 'boom' }, usage: { input_tokens: 77, output_tokens: 3 } } }]];
const TURN = { task: 'atlas_turn', protocol: 2, input: [{ type: 'message', role: 'user', content: '東京の人口は？' }], tools: [] };
const KEY = 'r3f1c0de-0000-4000-8000-00000000abcd';

/* The world is reset per check; the function is imported once (Deno.serve is captured once). */
const W = { provider: [], providerN: 0, seq: [], rows: new Map(), rpcFail: new Set(), consume: () => ({ allowed: true, used: 1, charged: true, calls: 1 }) };
const reset = () => { W.provider = []; W.providerN = 0; W.seq = []; W.rows = new Map(); W.rpcFail = new Set(); W.consume = () => ({ allowed: true, used: 1, charged: true, calls: 1 }); };
const now = () => Date.now();
const rowKey = (a) => [a.p_user, a.p_turn, a.p_key].join('|');
/* The JS model of supabase/migrations/20261001090000_ai_turn_answers.sql §3–§5. */
const DB = {
  claim_ai_answer(a) {
    const k = rowKey(a);
    let r = W.rows.get(k);
    if (r && r.expires < now()) { W.rows.delete(k); r = null; }
    if (!r) { W.rows.set(k, { state: 'running', attempts: 1, status: null, body: null, lease: now() + a.p_lease_seconds * 1000, expires: now() + a.p_ttl_seconds * 1000 }); return [{ outcome: 'claimed', attempts: 1, status: null, body: null, after_state: '' }]; }
    if (r.state === 'done') return [{ outcome: 'done', attempts: r.attempts, status: r.status, body: r.body, after_state: '' }];
    if (r.state === 'running' && r.lease >= now()) return [{ outcome: 'running', attempts: r.attempts, status: null, body: null, after_state: '' }];
    const after = r.state === 'failed' ? 'failed' : 'abandoned';
    Object.assign(r, { state: 'running', attempts: r.attempts + 1, status: null, body: null, lease: now() + a.p_lease_seconds * 1000, expires: now() + a.p_ttl_seconds * 1000 });
    return [{ outcome: 'claimed', attempts: r.attempts, status: null, body: null, after_state: after }];
  },
  peek_ai_answer(a) {
    const r = W.rows.get(rowKey(a));
    if (!r || r.expires < now()) return [];
    return [{ state: r.state === 'running' && r.lease < now() ? 'abandoned' : r.state, attempts: r.attempts, status: r.status, body: r.state === 'done' ? r.body : null }];
  },
  beat_ai_answer(a) { const r = W.rows.get(rowKey(a)); if (r && r.state === 'running' && r.attempts === a.p_attempt) { r.lease = now() + a.p_lease_seconds * 1000; return true; } return false; },
  finish_ai_answer(a) {
    const r = W.rows.get(rowKey(a));
    if (!r || r.state !== 'running' || r.attempts !== a.p_attempt) return false;
    Object.assign(r, { state: a.p_ok ? 'done' : 'failed', status: a.p_status, body: a.p_ok ? JSON.parse(JSON.stringify(a.p_body)) : null });
    return true;
  },
  consume_ai_turn() { return [W.consume()]; },
  refund_ai_turn() { return null; },
  settle_ai_turn() { return true; },
  record_ai_usage() { return null; },
};

const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const sseBody = (events, gate) => {
  const bytes = new TextEncoder().encode(events.map(([e, d]) => 'event: ' + e + '\r\ndata: ' + JSON.stringify(d) + '\r\n\r\n').join(''));
  let off = 0;
  return new ReadableStream({ async pull(c) {
    if (gate && off > 0) await gate;   /* the first bytes go out, the rest wait for the gate */
    if (off >= bytes.length) { c.close(); return; }
    c.enqueue(bytes.slice(off, off + 40)); off += 40;
  } });
};
const HOSTS = ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com'];
globalThis.Deno = { env: { get: (k) => ENV[k] || '' }, serve: (h) => { globalThis.__aiProxy = h; } };
globalThis.fetch = async (u, init) => {
  const s = String(u && u.url ? u.url : u);
  let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
  const host = new URL(s).hostname;
  if (HOSTS.includes(host)) {
    W.seq.push({ provider: true, body });
    const r = W.provider[Math.min(W.providerN, W.provider.length - 1)] || { status: 404, json: {} };
    W.providerN++;
    if (r.sse) return new Response(sseBody(r.sse, r.gate), { status: 200, headers: { 'content-type': 'text/event-stream' } });
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

const headers = (extra) => ({ authorization: 'Bearer good', 'content-type': 'application/json', 'x-intmap-turn': 't-replay', ...(extra || {}) });
const post = (body, extra) => serve(new Request('https://fn.test/', { method: 'POST', headers: headers(extra), body: JSON.stringify(body) }));
/* read a stream until `event`, then leave — the reader whose connection broke */
async function readUntilThenLeave(res, event) {
  const rd = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const st = await rd.read(); if (st.done) return false;
    buf += dec.decode(st.value, { stream: true });
    if (new RegExp('^event: ' + event + '$', 'm').test(buf)) { await rd.cancel(); return true; }
  }
}
const settled = async (pred, ms = 8000) => { const t = now(); while (!pred()) { if (now() - t > ms) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 20)); } };
const count = (name) => W.seq.filter((c) => c.rpc === name).length;
const providerCalls = () => W.seq.filter((c) => c.provider).length;
const theRow = () => [...W.rows.values()][0];

/* ══ ① ═══════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-stream-replay ① a retry after a broken stream receives the first answer: one provider call, one charge, no refund', async () => {
  reset();
  W.provider = [{ sse: OA_SSE }, { json: OA_SECOND }];
  const first = await post({ ...TURN, stream: true, replayKey: KEY });
  assert.match(first.headers.get('content-type'), /event-stream/);
  assert.ok(await readUntilThenLeave(first, 'open'), 'the stream never opened');
  await settled(() => theRow() && theRow().state === 'done');   /* the server ran it to its end anyway */

  const before = W.seq.length;
  const again = await post({ ...TURN, replayKey: KEY }, { 'x-intmap-replay': KEY });
  const j = await again.json();
  const retrySeq = W.seq.slice(before);
  assert.equal(again.status, 200);
  assert.equal(JSON.parse(j.text).final_text, '東京は約1400万人です', 'the retry is not the answer the first request produced');
  assert.equal(providerCalls(), 1, 'the provider was asked again for an answer that already existed');
  assert.equal(count('consume_ai_turn'), 1, 'the retry consulted the allowance (it must not spend one of TURN_MAX_CALLS)');
  assert.ok(!retrySeq.some((c) => c.rpc === 'consume_ai_turn' || c.rpc === 'claim_ai_answer' || c.provider), retrySeq.map((c) => c.rpc || 'provider').join(' '));
  assert.equal(count('record_ai_usage'), 1, 'the cost of one run was recorded twice');
  assert.equal(count('refund_ai_turn'), 0);
  assert.equal(j.charged, false, 'the replay charged nothing and must say so');
  assert.deepEqual(j.meta.replay, { kind: 'replayed', attempts: 1 });
  assert.equal(j.meta.streamed, undefined, 'the replay did not travel as a stream');
  assert.deepEqual(j.output, theRow().body.output, 'the items differ from the stored answer');
  /* the stored answer was written BEFORE `done` would have left (finish precedes settle's answer to the reader) */
  const order = W.seq.map((c) => c.rpc).filter(Boolean);
  assert.ok(order.indexOf('settle_ai_turn') < order.indexOf('finish_ai_answer'), order.join(' '));
});

test('atlas-stream-replay ① the stored answer is written before `done` is sent', async () => {
  reset();
  W.provider = [{ sse: OA_SSE }];
  const res = await post({ ...TURN, stream: true, replayKey: KEY });
  const text = await res.text();
  assert.match(text, /event: done/);
  assert.equal(theRow().state, 'done', 'the reader received `done` while the answer was not yet held');
  assert.equal(count('finish_ai_answer'), 1);
});

/* ══ ② ═══════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-stream-replay ② a retry while the first request is still running waits for it — the request runs once', async () => {
  reset();
  let open; const gate = new Promise((r) => { open = r; });
  W.provider = [{ sse: OA_SSE, gate }, { json: OA_SECOND }];
  const first = await post({ ...TURN, stream: true, replayKey: KEY });
  assert.ok(await readUntilThenLeave(first, 'open'));
  await settled(() => providerCalls() === 1);
  assert.equal(theRow().state, 'running');
  const pending = post({ ...TURN, replayKey: KEY }, { 'x-intmap-replay': KEY }).then((r) => r.json());
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(providerCalls(), 1, 'the retry ran the request while the first run was alive');
  open();
  const j = await pending;
  assert.equal(JSON.parse(j.text).final_text, '東京は約1400万人です');
  assert.equal(j.meta.replay.kind, 'replayed');
  assert.equal(providerCalls(), 1);
  assert.equal(count('consume_ai_turn'), 1);
});

test('atlas-stream-replay ② two requests with one key, at once: one runs, the other receives its answer', async () => {
  reset();
  let open; const gate = new Promise((r) => { open = r; });
  W.provider = [{ json: OA_FINAL, gate }, { json: OA_SECOND }];
  const a = post({ ...TURN, replayKey: KEY }).then((r) => r.json());
  await settled(() => providerCalls() === 1);
  const b = post({ ...TURN, replayKey: KEY }).then((r) => r.json());   /* a duplicate without the header: claims, finds it running */
  await new Promise((r) => setTimeout(r, 300));
  open();
  const [ja, jb] = await Promise.all([a, b]);
  assert.equal(providerCalls(), 1, 'the same keyed request ran twice');
  assert.equal(ja.text, jb.text);
  assert.equal(ja.meta.replay, undefined, 'a first run is not a replay');
  assert.equal(jb.meta.replay.kind, 'replayed');
});

/* ══ ③ ═══════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-stream-replay ③ only an observed failure is run again — and the run says why and which attempt', async () => {
  reset();
  W.provider = [{ sse: OA_FAILED }, { json: OA_SECOND }];
  const first = await post({ ...TURN, stream: true, replayKey: KEY });
  assert.match(await first.text(), /"status":503/);
  assert.equal(theRow().state, 'failed');
  assert.equal(theRow().body, null, 'a failure is held as a fact, never as an answer to replay');
  assert.equal(count('refund_ai_turn'), 1, 'the failed run was not refunded');
  const j = await (await post({ ...TURN, replayKey: KEY }, { 'x-intmap-replay': KEY })).json();
  assert.equal(providerCalls(), 2);
  assert.equal(JSON.parse(j.text).final_text, '東京は1,400万人ほどです');
  assert.deepEqual(j.meta.replay, { kind: 'rerun', after: 'failed', attempt: 2 });
  assert.equal(count('consume_ai_turn'), 2, 'the re-run is a request like any other: the ledger decides its charge');
  assert.equal(theRow().state, 'done');
  assert.equal(theRow().attempts, 2);
});

test('atlas-stream-replay ③ a run whose isolate stopped beating is run again, as `abandoned`', async () => {
  reset();
  W.provider = [{ json: OA_SECOND }];
  W.rows.set([USER.id, 't-replay', KEY].join('|'), { state: 'running', attempts: 1, status: null, body: null, lease: now() - 1000, expires: now() + 600000 });
  const j = await (await post({ ...TURN, replayKey: KEY }, { 'x-intmap-replay': KEY })).json();
  assert.equal(providerCalls(), 1);
  assert.deepEqual(j.meta.replay, { kind: 'rerun', after: 'abandoned', attempt: 2 });
});

test('atlas-stream-replay ③ a running request renews its lease, so a slow answer is not mistaken for a dead one', () => {
  const fn = read('supabase/functions/ai-proxy/index.ts');
  assert.match(fn, /const ANSWER_LEASE_S = Math\.ceil\(\(2 \* HEARTBEAT_MS\) \/ 1000\);/, 'the lease is two heartbeats');
  assert.match(fn, /setInterval\(\(\) => \{ beatAnswer\(db, user\.id, turnId, replayKey, c\.attempts\); \}, HEARTBEAT_MS\)/);
  assert.match(fn, /try \{ a = await answer\(sink\); \} finally \{ clearInterval\(beat\); \}/);
});

/* ══ ④ ═══════════════════════════════════════════════════════════════════════════════════════ */
test('atlas-stream-replay ④ a request without a replay key runs exactly as before; a ledger that does not answer runs and says so', async () => {
  reset();
  W.provider = [{ json: OA_FINAL }];
  const j = await (await post(TURN)).json();
  assert.equal(j.meta.replay, undefined);
  assert.ok(!W.seq.some((c) => /_ai_answer$/.test(c.rpc || '')), 'an unkeyed request touched the held answers');
  reset();
  W.provider = [{ json: OA_FINAL }];
  W.rpcFail = new Set(['claim_ai_answer', 'peek_ai_answer']);
  const j2 = await (await post({ ...TURN, replayKey: KEY }, { 'x-intmap-replay': KEY })).json();
  assert.equal(providerCalls(), 1);
  assert.deepEqual(j2.meta.replay, { kind: 'unheld' });
  reset();
  W.provider = [{ json: OA_FINAL }];
  const j3 = await (await post({ ...TURN, replayKey: 'short' })).json();   /* not a key this file minted */
  assert.equal(j3.meta.replay, undefined);
  assert.ok(!W.seq.some((c) => /_ai_answer$/.test(c.rpc || '')));
});

/* ══ ⑤ js/ai-core.js ════════════════════════════════════════════════════════════════════════ */
async function core(respond) {
  const calls = [];
  const win = { INTMAP_AI_PROXY: { url: 'https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/ai-proxy' }, SUPABASE_ANON_KEY: 'anon-key' };
  win.window = win;
  const localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); } };
  const location = { protocol: 'https:', hostname: SITE_HOST };
  const document = { getElementById() { return null; }, createElement() { return { classList: { add() {}, remove() {} }, style: {}, addEventListener() {}, querySelector() { return null; } }; }, body: { appendChild() {} } };
  const row = () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { count: 0 } }; } });
  win.sb = { auth: { async getSession() { return { data: { session: { access_token: 'jwt' } } }; } }, from() { return row(); } };
  const fetchStub = async (url, opts) => { calls.push({ body: JSON.parse(opts.body), headers: { ...opts.headers } }); return respond(calls.length, opts); };
  const { aiCore } = await importModule('js/ai-core.js', {
    globals: { window: win, document, location, localStorage, navigator: {}, fetch: fetchStub, crypto: globalThis.crypto },
  });
  const HOST = { lang: 'jp', user: { id: 'u' }, aiUsage: { date: '', used: 0, limit: 10 }, AI_FREE_DAILY: 10, aiButtonSyncers: [], openAuthModal() {}, t(k) { return k; } };
  return { IM: aiCore(HOST), calls, win };
}
const ANSWER = (replay) => ({ text: '{"turn":"final","final_text":"東京"}', used: 1, limit: 10, remaining: 9, charged: !replay, meta: { protocol: 2, provider: 'openai', ...(replay ? { replay } : {}) }, output: [], citations: [] });
const broken = () => { const b = new TextEncoder().encode('event: open\ndata: {}\n\n'); let sent = false;
  return new Response(new ReadableStream({ pull(c) { if (!sent) { sent = true; c.enqueue(b); return; } c.error(new TypeError('network error')); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } }); };
const TURN_OPTS = () => ({ task: 'atlas_turn', protocol: 2, input: [{ type: 'message', role: 'user', content: 'x' }], tools: [], turnId: 't1', stream: { onEvent() {} } });

test('atlas-stream-replay ⑤ the retry carries the same replay key, and the envelope repeats what the server said it was', async () => {
  const { IM, calls, win } = await core((n) => n === 1 ? broken() : json(ANSWER({ kind: 'replayed', attempts: 1 })));
  const env = await IM.askAIJSONEnvelope('', 'sys', [], TURN_OPTS());
  assert.equal(calls.length, 2);
  const key = calls[0].body.replayKey;
  assert.match(key, /^[A-Za-z0-9._:-]{8,120}$/, 'the key is not one ai-proxy accepts (REPLAY_KEY_OK)');
  assert.equal(calls[0].headers['x-intmap-replay'], undefined, 'the first request is not a retry');
  assert.equal(calls[1].headers['x-intmap-replay'], key, 'the retry did not name the request it re-receives');
  assert.equal(calls[1].body.replayKey, key);
  assert.equal(calls[1].body.stream, undefined);
  assert.equal(calls[1].headers['x-intmap-turn'], 't1');
  assert.equal(env.streamRetried, true);
  assert.deepEqual(env.streamReplay, { kind: 'replayed', attempts: 1 });
  /* a server that says nothing about the retry is reported as saying nothing — not as a replay */
  const { IM: IM2 } = await core((n) => n === 1 ? broken() : json(ANSWER(null)));
  assert.deepEqual((await IM2.askAIJSONEnvelope('', 'sys', [], TURN_OPTS())).streamReplay, { kind: 'unreported' });
  /* and an answer that was not a retry carries no replay statement at all */
  const { IM: IM3, calls: c3 } = await core(() => new Response('event: done\ndata: ' + JSON.stringify({ status: 200, body: ANSWER(null) }) + '\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  assert.equal((await IM3.askAIJSONEnvelope('', 'sys', [], TURN_OPTS())).streamReplay, undefined);
  assert.equal(c3.length, 1);
});

test('atlas-stream-replay ⑤ every streamed request has its own key; a request that does not stream has none', async () => {
  const { IM, calls } = await core(() => new Response('event: done\ndata: ' + JSON.stringify({ status: 200, body: ANSWER(null) }) + '\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  await IM.askAIJSONEnvelope('', 'sys', [], TURN_OPTS());
  await IM.askAIJSONEnvelope('', 'sys', [], { ...TURN_OPTS(), callId: 'same' });
  await IM.askAIJSONEnvelope('', 'sys', [], { ...TURN_OPTS(), callId: 'same' });
  const keys = calls.map((c) => c.body.replayKey);
  assert.equal(new Set(keys).size, 3, 'two requests shared a replay key — one would receive the other\'s answer');
  const { IM: P, calls: pc } = await core(() => json(ANSWER(null)));
  await P.askAIJSONEnvelope('', 'sys', [], { ...TURN_OPTS(), stream: undefined });
  assert.equal(pc[0].body.replayKey, undefined);
});

/* ══ ⑥ the migration, and what did not move ════════════════════════════════════════════════════ */
test('atlas-stream-replay ⑥ the held answers: RLS on, the owner reads, only service_role writes, and they are swept', () => {
  const sql = read('supabase/migrations/20261001090000_ai_turn_answers.sql');
  assert.match(sql, /alter table public\.ai_turn_answers enable row level security;/);
  assert.match(sql, /revoke all on public\.ai_turn_answers from anon, authenticated;/);
  assert.match(sql, /create policy ai_turn_answers_select_own on public\.ai_turn_answers\s+for select to authenticated\s+using \(user_id = \(select auth\.uid\(\)\)\);/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*on public\.ai_turn_answers/i);
  for (const fn of ['claim_ai_answer', 'peek_ai_answer', 'beat_ai_answer', 'finish_ai_answer', 'sweep_ai_turn_answers']) {
    assert.match(sql, new RegExp('revoke execute on function public\\.' + fn + '\\([^)]*\\)\\s+from public, anon, authenticated;'), fn);
    assert.match(sql, new RegExp('grant  execute on function public\\.' + fn + '\\([^)]*\\)\\s+to service_role;'), fn);
  }
  /* every SECURITY DEFINER function pins an empty search_path */
  const definers = sql.split(/create or replace function /).slice(1);
  assert.equal(definers.length, 5);
  for (const d of definers) assert.match(d, /security definer\s+set search_path = ''/, d.slice(0, 40));
  assert.match(sql, /cron\.schedule\('ai-turn-answers-sweep', '\*\/15 \* \* \* \*', 'select public\.sweep_ai_turn_answers\(\)'\)/);
  assert.match(sql, /if to_regclass\('cron\.job'\) is null then/, 'the schedule must not fail where pg_cron is absent');
  /* a failure is never replayed */
  assert.match(sql, /body = case when coalesce\(p_ok, false\) then p_body else null end/);
});

test('atlas-stream-replay ⑥ CONSTITUTION §5: no limit moved, and the retry header passes the preflight', () => {
  const fn = read('supabase/functions/ai-proxy/index.ts');
  assert.match(fn, /const TURN_MAX_CALLS = 12;/);
  assert.match(fn, /const TURN_TTL_S = 900;/);
  assert.match(fn, /"Access-Control-Allow-Headers": "[^"]*\bx-intmap-replay\b[^"]*"/, 'the browser would refuse the retry before it is sent');
  /* the replay is answered before the allowance is consulted */
  const serveAt = fn.indexOf('Deno.serve(');
  const body = fn.slice(serveAt);
  assert.ok(body.indexOf('awaitAnswer(db, user.id, turnId, replayHdr)') < body.indexOf('openTurn(db, account'), 'a replay must not spend one of TURN_MAX_CALLS');
});
