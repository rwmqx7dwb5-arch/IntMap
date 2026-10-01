/* ============================================================================
 *  atlas-live-stream — Atlas is read, drawn and answered as it happens
 * ----------------------------------------------------------------------------
 *  What these checks hold (dev-notes/2026-10-01-atlas-live-stream.md has the measurements):
 *    ① the provider's stream is read twice — previews while it arrives, and the SAME body the
 *       non-streaming endpoint returns once it is complete — for all three providers;
 *    ② ai-proxy, RUN: a streamed turn's `done` is byte-for-byte the plain answer, the ledger settles
 *       before `done` leaves, a failure inside the stream is classified, refunded and its billed
 *       usage recorded, a reader who leaves does not stop the bookkeeping, a retry withdraws what it
 *       showed, a refused reasoning summary costs one request once, and nothing but an Atlas turn
 *       streams;
 *    ③ js/ai-core.js reads the stream into the answer it always read, retries a BROKEN stream once
 *       without streaming, and never retries a stop the reader pressed;
 *    ④ js/atlas-live.js reads a reply's JSON while it is written, and what it shows is never the
 *       answer (the draft gives way; a note goes to the trace);
 *    ⑤ the two ends speak the same events, and no limit moved (CONSTITUTION.md §5).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const S = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/ai-stream.js')).href);
const U = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/ai-usage.js')).href);
const G = await import(pathToFileURL(join(ROOT, 'supabase/functions/_shared/relay-guard.js')).href);
const LIVE = await import(pathToFileURL(join(ROOT, 'js/atlas-live.js')).href);

const sseText = (events) => events.map(([e, d]) => 'event: ' + e + '\r\ndata: ' + JSON.stringify(d) + '\r\n\r\n').join('');
const recorder = () => { const seen = []; return { seen, sink: { attempt() { seen.push(['attempt']); }, text(d) { seen.push(['text', d]); }, think(d) { seen.push(['think', d]); }, call(c) { seen.push(['call', c.name]); }, search() { seen.push(['search']); } } }; };
/* feed a body in N-byte slices — a slice may end inside a line or inside a character */
const feed = (ps, text, n) => { const b = new TextEncoder().encode(text); for (let i = 0; i < b.length; i += n) ps.onChunk(b.slice(i, i + n)); return ps.result(); };

/* ══ ① the provider's stream, read twice ════════════════════════════════════════════════════ */
const OA_FINAL = { model: 'gpt-5.6-terra', status: 'completed',
  output: [{ type: 'reasoning', id: 'rs_1', encrypted_content: 'enc' },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"turn":"continuing","final_text":"まず人口を調べます"}', annotations: [] }] },
    { type: 'function_call', call_id: 'call_1', name: 'find_capability', arguments: '{"query":"人口"}' }],
  usage: { input_tokens: 120, input_tokens_details: { cached_tokens: 100 }, output_tokens: 30 } };
const OA_SSE = [
  ['response.created', { type: 'response.created', response: { status: 'in_progress' } }],
  ['response.reasoning_summary_part.added', { type: 'response.reasoning_summary_part.added' }],
  ['response.reasoning_summary_text.delta', { type: 'response.reasoning_summary_text.delta', delta: '**人口を比べる**' }],
  ['response.output_text.delta', { type: 'response.output_text.delta', delta: '{"turn":"continuing","final_text":"まず人口' }],
  ['response.output_text.delta', { type: 'response.output_text.delta', delta: 'を調べます"}' }],
  ['response.output_item.added', { type: 'response.output_item.added', item: { type: 'function_call', call_id: 'call_1', name: 'find_capability', arguments: '' } }],
  ['response.function_call_arguments.delta', { type: 'response.function_call_arguments.delta', delta: '{"query":"人口"}' }],
  ['response.completed', { type: 'response.completed', response: OA_FINAL }],
];
test('atlas-live-stream ① OpenAI: previews in order, and the terminal event IS the body', () => {
  for (const n of [1, 3, 7, 4096]) {
    const r = recorder();
    const out = feed(S.providerStream('openai', r.sink), sseText(OA_SSE), n);
    assert.deepEqual(out.json, OA_FINAL, 'slice ' + n);
    assert.deepEqual(r.seen.map((x) => x[0]), ['attempt', 'think', 'think', 'text', 'text', 'call']);
    assert.equal(r.seen.filter((x) => x[0] === 'text').map((x) => x[1]).join(''), OA_FINAL.output[1].content[0].text, 'the text previews are the message, character for character');
  }
  /* a failure inside a 200 stream is a failure, and carries what was billed */
  const failed = feed(S.providerStream('openai', null), sseText([['response.failed', { type: 'response.failed', response: { status: 'failed', error: { code: 'server_error', message: 'x' }, usage: { input_tokens: 9, output_tokens: 0 } } }]]), 5);
  assert.equal(failed.fail.status, 503);
  assert.equal(U.normalizeUsage('openai', failed.fail.partial).input, 9);
  /* a stream that just stops answered nothing */
  assert.equal(feed(S.providerStream('openai', null), sseText(OA_SSE.slice(0, 4)), 9).fail.text, 'stream_incomplete');
});

const AN_FINAL = { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', stop_reason: 'tool_use',
  content: [{ type: 'text', text: '人口を調べます。', citations: [{ type: 'web_search_result_location', url: 'https://example.org/a', title: 'A' }] },
    { type: 'tool_use', id: 'toolu_1', name: 'find_capability', input: { query: '人口' } }],
  usage: { input_tokens: 50, cache_read_input_tokens: 40, cache_creation_input_tokens: 0, output_tokens: 22 } };
const AN_SSE = [
  ['message_start', { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [], stop_reason: null, usage: { input_tokens: 50, cache_read_input_tokens: 40, cache_creation_input_tokens: 0, output_tokens: 1 } } }],
  ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '人口を' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: { type: 'web_search_result_location', url: 'https://example.org/a', title: 'A' } } }],
  ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '調べます。' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 0 }],
  ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'find_capability', input: {} } }],
  ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"query":' } }],
  ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"人口"}' } }],
  ['content_block_stop', { type: 'content_block_stop', index: 1 }],
  ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 22 } }],
  ['message_stop', { type: 'message_stop' }],
];
test('atlas-live-stream ① Anthropic: the message is folded back from its parts, usage and all', () => {
  for (const n of [2, 11, 9999]) {
    const r = recorder();
    const out = feed(S.providerStream('anthropic', r.sink), sseText(AN_SSE), n);
    assert.deepEqual(out.json, AN_FINAL, 'slice ' + n);
    assert.deepEqual(U.normalizeUsage('anthropic', out.json), U.normalizeUsage('anthropic', AN_FINAL));
    assert.deepEqual(r.seen, [['attempt'], ['text', '人口を'], ['text', '調べます。'], ['call', 'find_capability']]);
  }
  const cut = feed(S.providerStream('anthropic', null), sseText(AN_SSE.slice(0, 5)), 4);
  assert.equal(cut.fail.text, 'stream_incomplete');
  assert.equal(U.normalizeUsage('anthropic', cut.fail.partial).input, 50, 'the input it was billed for is recorded even though it never finished');
  assert.equal(feed(S.providerStream('anthropic', null), sseText([AN_SSE[0], ['error', { type: 'error', error: { type: 'overloaded_error', message: 'busy' } }]]), 6).fail.status, 503);
});

const GE_SSE = [
  ['message', { candidates: [{ content: { role: 'model', parts: [{ text: '考えています', thought: true }] } }], modelVersion: 'gemini-3.5-flash' }],
  ['message', { candidates: [{ content: { role: 'model', parts: [{ text: '人口を' }] } }], modelVersion: 'gemini-3.5-flash' }],
  ['message', { candidates: [{ content: { role: 'model', parts: [{ text: '調べます。' }] } }], modelVersion: 'gemini-3.5-flash' }],
  ['message', { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ functionCall: { name: 'find_capability', args: { query: '人口' } }, thoughtSignature: 'sig' }] } }],
    usageMetadata: { promptTokenCount: 70, candidatesTokenCount: 12, thoughtsTokenCount: 5 }, modelVersion: 'gemini-3.5-flash' }],
];
test('atlas-live-stream ① Gemini: parts of the same kind are joined, a call arrives whole with its signature', () => {
  const r = recorder();
  const out = feed(S.providerStream('gemini', r.sink), GE_SSE.map(([, d]) => 'data: ' + JSON.stringify(d) + '\n\n').join(''), 13).json;
  assert.deepEqual(out.candidates[0].content.parts, [{ text: '考えています', thought: true }, { text: '人口を調べます。' },
    { functionCall: { name: 'find_capability', args: { query: '人口' } }, thoughtSignature: 'sig' }]);
  assert.equal(out.candidates[0].finishReason, 'STOP');
  assert.deepEqual(U.normalizeUsage('gemini', out), { input: 70, cached_read: 0, cache_write: 0, output: 17 });
  assert.deepEqual(r.seen.map((x) => x[0]), ['attempt', 'think', 'text', 'text', 'call']);
});

test('atlas-live-stream ① a new provider attempt withdraws what the last one showed — and only then', () => {
  const sent = [];
  const sink = S.previewSink((e, d) => sent.push(e));
  S.providerStream('openai', sink);                 /* first attempt: nothing shown yet */
  assert.deepEqual(sent, []);
  sink.think('x');
  S.providerStream('openai', sink);                 /* the ladder asks again */
  assert.deepEqual(sent, ['think', 'reset']);
  S.providerStream('openai', sink);
  assert.deepEqual(sent, ['think', 'reset'], 'nothing shown since — nothing to withdraw');
});

test('atlas-live-stream ① fetchBounded forwards a 2xx body while it is read, and only a 2xx body', async () => {
  const real = globalThis.fetch;
  try {
    for (const status of [200, 503]) {
      globalThis.fetch = async () => new Response('abcdef', { status });
      const seen = [];
      const r = await G.fetchBounded('https://api.openai.com/v1/responses', { method: 'POST' }, { onChunk: (b) => seen.push(new TextDecoder().decode(b)) });
      assert.equal(await r.text(), 'abcdef', 'the returned body is whole either way');
      assert.equal(seen.join(''), status === 200 ? 'abcdef' : '', 'status ' + status);
    }
  } finally { globalThis.fetch = real; }
});

/* ══ ② ai-proxy, run ═════════════════════════════════════════════════════════════════════════ */
function run(cfg) {
  const out = execFileSync(process.execPath, ['--no-warnings', join(ROOT, 'tests/helpers/ai-proxy-stream-run.mjs')],
    { cwd: ROOT, env: { ...process.env, AIPS_CFG: JSON.stringify(cfg) }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(out);
}
const ENV = (provider) => ({ SUPABASE_URL: 'https://sb.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', AI_PROVIDER: provider,
  [{ openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', gemini: 'GEMINI_API_KEY' }[provider]]: 'stub' });
const USER = { id: '00000000-0000-4000-8000-000000000002', aud: 'authenticated', role: 'authenticated', created_at: '2020-01-01T00:00:00Z' };
const TURN = { task: 'atlas_turn', protocol: 2, input: [{ type: 'message', role: 'user', content: '人口は？' }], tools: [{ name: 'find_capability', description: 'search', parameters: { type: 'object', properties: { query: { type: 'string' } } } }] };
const rq = (turn, body) => ({ headers: { authorization: 'Bearer good', 'content-type': 'application/json', 'x-intmap-turn': turn }, body });
const doneOf = (o) => (o.events.find((e) => e.event === 'done') || {}).data;
/* meta.streamed says which way it travelled; a Gemini call id is minted from the clock at parse time
   (callGeminiTurn), so two parses of one answer differ there and nowhere else */
const strip = (b) => { const c = JSON.parse(JSON.stringify(b)); if (c.meta) delete c.meta.streamed;
  (c.output || []).forEach((it) => { if (it.type === 'function_call' && /^g[0-9a-z]+_\d+$/.test(it.call_id || '')) it.call_id = 'g'; }); return c; };
const GE_FINAL = { modelVersion: 'gemini-3.5-flash', candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: '人口を調べます。' }, { functionCall: { name: 'find_capability', args: { query: '人口' } }, thoughtSignature: 'sig' }] } }],
  usageMetadata: { promptTokenCount: 70, candidatesTokenCount: 12, thoughtsTokenCount: 5 } };
const CASES = {
  openai: { sse: OA_SSE, json: OA_FINAL },
  anthropic: { sse: AN_SSE, json: AN_FINAL },
  gemini: { sse: GE_SSE, json: GE_FINAL },
};

for (const provider of Object.keys(CASES)) {
  test(`atlas-live-stream ② ai-proxy (${provider}): the streamed answer IS the plain answer, settled before it leaves`, () => {
    const C = CASES[provider];
    const [streamed, plain] = run({ env: ENV(provider), user: USER, provider: [{ sse: C.sse, chunk: 5 }, { json: C.json }],
      requests: [rq('t-s', { ...TURN, stream: true }), rq('t-p', TURN)] });
    assert.equal(streamed.status, 200);
    assert.match(streamed.ctype, /^text\/event-stream/);
    assert.equal(streamed.events[0].event, 'open');
    const done = doneOf(streamed);
    assert.equal(done.status, 200, JSON.stringify(done));
    assert.equal(done.body.meta.streamed, true);
    assert.deepEqual(strip(done.body), strip(plain.json), 'the done body differs from what the same turn answers without streaming');
    const previews = streamed.events.filter((e) => ['think', 'text', 'call'].includes(e.event));
    assert.ok(previews.some((e) => e.event === 'text') && previews.some((e) => e.event === 'call'), streamed.events.map((e) => e.event).join(' '));
    assert.ok(streamed.events.findIndex((e) => e.event === 'done') > streamed.events.findIndex((e) => e.event === 'call'), 'previews come before the answer');
    /* the request to the provider asked to stream; the plain one did not */
    const pbody = (o) => o.calls.find((c) => c.provider).body;
    if (provider === 'gemini') {
      assert.match(streamed.calls.find((c) => c.provider).url, /:streamGenerateContent\?alt=sse$/);
      assert.match(plain.calls.find((c) => c.provider).url, /:generateContent$/);
    } else {
      assert.equal(pbody(streamed).stream, true);
      assert.equal(pbody(plain).stream, undefined);
    }
    /* #R801: the turn is settled before the answer leaves — `done` was read after the settle was made */
    const settleAt = streamed.calls.findIndex((c) => c.rpc === 'settle_ai_turn');
    assert.ok(settleAt >= 0, 'never settled');
    assert.ok(streamed.events.find((e) => e.event === 'done').callsAt > settleAt, 'done left before the turn was settled');
    assert.ok(!streamed.calls.some((c) => c.rpc === 'refund_ai_turn'), 'an answered turn was refunded');
    /* the cost recorded is the provider's own usage, the same as the plain answer's */
    const rec = (o) => o.calls.find((c) => c.rpc === 'record_ai_usage').body;
    for (const k of ['p_input', 'p_cached_read', 'p_cache_write', 'p_output', 'p_calls', 'p_unmetered']) assert.equal(rec(streamed)[k], rec(plain)[k], k);
  });
}

test('atlas-live-stream ② a failure inside the stream is classified, refunded, and its billed usage recorded', () => {
  const failed = [['response.created', { type: 'response.created', response: {} }],
    ['response.output_text.delta', { type: 'response.output_text.delta', delta: '{"final_text":"途中' }],
    ['response.failed', { type: 'response.failed', response: { status: 'failed', error: { code: 'server_error', message: 'boom' }, usage: { input_tokens: 77, output_tokens: 3 } } }]];
  const cut = OA_SSE.slice(0, 4);   /* no terminal event at all */
  const [a, b] = run({ env: ENV('openai'), user: USER, provider: [{ sse: failed }, { sse: cut }],
    requests: [rq('t-f', { ...TURN, stream: true }), rq('t-c', { ...TURN, stream: true })] });
  for (const [o, why] of [[a, 'failed'], [b, 'cut']]) {
    const d = doneOf(o);
    assert.equal(d.status, 503, why + ' ' + JSON.stringify(d));
    assert.equal(d.body.error, 'provider_unavailable', why);
    assert.equal(d.body.text, undefined, why + ': a failure carries no answer text');
    assert.ok(o.calls.some((c) => c.rpc === 'refund_ai_turn'), why + ': not refunded');
    assert.ok(!o.calls.some((c) => c.rpc === 'settle_ai_turn'), why + ': settled a turn that has no answer');
  }
  assert.equal(a.calls.find((c) => c.rpc === 'record_ai_usage').body.p_input, 77, 'what the provider billed before failing is a cost');
});

test('atlas-live-stream ② a reader who leaves does not stop the bookkeeping', () => {
  const [o] = run({ env: ENV('openai'), user: USER, provider: [{ sse: OA_SSE, chunk: 3 }],
    requests: [{ ...rq('t-x', { ...TURN, stream: true }), cancelAfter: 'open' }] });
  assert.deepEqual(o.events.map((e) => e.event), ['open']);
  assert.ok(o.calls.some((c) => c.provider), 'the provider was never asked');
  assert.ok(o.calls.some((c) => c.rpc === 'settle_ai_turn'), 'leaving turned a charged, answered call into an unsettled one: ' + o.calls.map((c) => c.rpc || c.url).join(' '));
  assert.ok(o.calls.some((c) => c.rpc === 'record_ai_usage'), 'leaving dropped the usage record');
  assert.ok(!o.calls.some((c) => c.rpc === 'refund_ai_turn'), 'leaving refunded an answered call');
});

test('atlas-live-stream ② an empty answer retried with a bigger budget withdraws what it previewed', () => {
  const empty = [['response.reasoning_summary_text.delta', { type: 'response.reasoning_summary_text.delta', delta: '**考え中**' }],
    ['response.incomplete', { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'reasoning', id: 'rs_0', encrypted_content: 'e' }], usage: { input_tokens: 5, output_tokens: 900 } } }]];
  const [o] = run({ env: ENV('openai'), user: USER, provider: [{ sse: empty }, { sse: OA_SSE }], requests: [rq('t-e', { ...TURN, stream: true })] });
  const names = o.events.map((e) => e.event);
  assert.ok(names.indexOf('reset') > names.indexOf('think') && names.indexOf('reset') < names.indexOf('text'), names.join(' '));
  assert.equal(doneOf(o).status, 200);
  assert.equal(o.calls.filter((c) => c.provider).length, 2);
});

test('atlas-live-stream ② a refused reasoning summary costs one request, once, and nothing else is given up', () => {
  const [first, second] = run({ env: ENV('openai'), user: USER,
    provider: [{ status: 400, json: { error: { message: 'Your organization must be verified to generate reasoning summaries.' } } }, { sse: OA_SSE }, { sse: OA_SSE }],
    requests: [rq('t-1', { ...TURN, stream: true }), rq('t-2', { ...TURN, stream: true })] });
  const p1 = first.calls.filter((c) => c.provider).map((c) => c.body);
  assert.equal(p1.length, 2);
  assert.equal(p1[0].reasoning.summary, 'auto');
  assert.equal(p1[1].reasoning.summary, undefined);
  assert.deepEqual(p1[1].include, ['reasoning.encrypted_content'], 'the summary rung took the replayed reasoning with it');
  assert.deepEqual(p1[1].text, p1[0].text, 'the summary rung took the JSON shape with it');
  assert.deepEqual(p1[1].tools, p1[0].tools, 'the summary rung took the functions with it');
  const p2 = second.calls.filter((c) => c.provider).map((c) => c.body);
  assert.equal(p2.length, 1, 'the isolate asked for a summary it had already been refused');
  assert.equal(p2[0].reasoning.summary, undefined);
  assert.equal(doneOf(second).status, 200);
});

test('atlas-live-stream ② only an Atlas turn streams; every refusal before the provider is plain JSON', () => {
  const [plainTask, badTask, emptyTurn] = run({ env: ENV('openai'), user: USER, provider: [{ json: OA_FINAL }],
    requests: [rq('t-a', { task: 'free_text', prompt: 'hi', stream: true }), rq('t-b', { ...TURN, task: 'no_such_task', stream: true }), rq('t-c', { ...TURN, input: [], stream: true })] });
  assert.match(plainTask.ctype, /application\/json/);
  assert.equal(plainTask.status, 200);
  assert.equal(plainTask.calls.find((c) => c.provider).body.stream, undefined, 'a non-turn task asked the provider to stream');
  for (const [o, code] of [[badTask, 'bad_task'], [emptyTurn, 'empty_turn']]) {
    assert.match(o.ctype, /application\/json/, code);
    assert.equal(o.json.error, code);
    assert.ok(!o.calls.some((c) => c.provider), code + ': the provider was asked');
  }
});

/* ══ ③ js/ai-core.js reads the stream into the answer it always read ═══════════════════════════ */
function core(respond) {
  const calls = [];
  const win = { IntMapModules: {}, INTMAP_AI_PROXY: { url: 'https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/ai-proxy' }, SUPABASE_ANON_KEY: 'anon-key' };
  win.window = win;
  const localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); } };
  const location = { protocol: 'https:', hostname: 'rwmqx7dwb5-arch.github.io' };
  const document = { getElementById() { return null; }, createElement() { return { classList: { add() {}, remove() {} }, style: {}, addEventListener() {}, querySelector() { return null; } }; }, body: { appendChild() {} } };
  const row = () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { count: 0 } }; } });
  win.sb = { auth: { async getSession() { return { data: { session: { access_token: 'jwt' } } }; } }, from() { return row(); } };
  const fetchStub = async (url, opts) => { calls.push(JSON.parse(opts.body)); return respond(calls.length, opts); };
  const load = (p) => new Function('window', 'document', 'location', 'localStorage', 'navigator', 'fetch', read(p))(win, document, location, localStorage, {}, fetchStub);
  load('js/lang-registry.js');
  load('js/ai-core.js');
  const HOST = { lang: 'jp', user: { id: 'u' }, aiUsage: { date: '', used: 0, limit: 10 }, AI_FREE_DAILY: 10, aiButtonSyncers: [], openAuthModal() {}, t(k) { return k; } };
  return { IM: win.IntMapModules.aiCore(HOST), calls };
}
const ANSWER = { text: '{"turn":"final","final_text":"東京"}', used: 1, limit: 10, remaining: 9, charged: true, meta: { protocol: 2, provider: 'openai' }, output: [{ type: 'message', role: 'assistant', content: '{"turn":"final","final_text":"東京"}' }], citations: [] };
const sseResponse = (text, cut) => {
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return new Response(new ReadableStream({ pull(c) {
    if (i >= bytes.length) { if (cut) c.error(new TypeError('network error')); else c.close(); return; }
    c.enqueue(bytes.slice(i, i + 4)); i += 4;
  } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
};
const TURN_OPTS = (onEvent, signal) => ({ task: 'atlas_turn', protocol: 2, input: [{ type: 'message', role: 'user', content: 'x' }], tools: [], turnId: 't1', stream: { onEvent }, signal });

test('atlas-live-stream ③ the done event becomes the answer every line after the fetch already reads', async () => {
  const seen = [];
  const { IM, calls } = core(() => sseResponse('event: open\ndata: {}\n\n: keep-alive\n\nevent: text\ndata: {"d":"東"}\n\nevent: done\ndata: ' + JSON.stringify({ status: 200, body: ANSWER }) + '\n\n'));
  const env = await IM.askAIJSONEnvelope('', 'sys', [], TURN_OPTS((n, d) => seen.push([n, d])));
  assert.equal(calls[0].stream, true);
  assert.deepEqual(env.output, ANSWER.output);
  assert.equal(env.text, ANSWER.text);
  assert.equal(env.streamRetried, undefined);
  assert.deepEqual(seen, [['open', {}], ['text', { d: '東' }]], 'the keep-alive comment and `done` are not previews');
  /* a typed provider error delivered as `done` is the same typed error a plain 503 raises */
  const { IM: IM2 } = core(() => sseResponse('event: done\ndata: ' + JSON.stringify({ status: 503, body: { error: 'provider_unavailable', retryable: true } }) + '\n\n'));
  await assert.rejects(IM2.askAIJSONEnvelope('', 'sys', [], TURN_OPTS(() => {})), (e) => e.code === 'provider_unavailable');
});

test('atlas-live-stream ③ a stream that breaks before done is retried ONCE, plainly, under the same turn key', async () => {
  const seen = [];
  const { IM, calls } = core((n) => n === 1
    ? sseResponse('event: open\ndata: {}\n\nevent: text\ndata: {"d":"途中"}\n\n', true)
    : new Response(JSON.stringify(ANSWER), { status: 200, headers: { 'content-type': 'application/json' } }));
  const env = await IM.askAIJSONEnvelope('', 'sys', [], TURN_OPTS((n) => seen.push(n)));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].stream, true);
  assert.equal(calls[1].stream, undefined, 'the retry streamed again — it must ask the other way');
  assert.equal(env.streamRetried, true);
  assert.equal(env.text, ANSWER.text);
  assert.deepEqual(seen, ['open', 'text', 'reset'], 'what the broken stream showed was not withdrawn');
  /* …and a body that simply ends without `done` is the same broken stream */
  const { IM: IM3, calls: c3 } = core((n) => n === 1 ? sseResponse('event: open\ndata: {}\n\n') : new Response(JSON.stringify(ANSWER), { status: 200, headers: { 'content-type': 'application/json' } }));
  assert.equal((await IM3.askAIJSONEnvelope('', 'sys', [], TURN_OPTS(() => {}))).streamRetried, true);
  assert.equal(c3.length, 2);
});

test('atlas-live-stream ③ a stop the reader pressed is not a broken stream — nothing is retried', async () => {
  const ac = new AbortController();
  const { IM, calls } = core(() => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('event: open\ndata: {}\n\n')); ac.signal.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError'))); } }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  const p = IM.askAIJSONEnvelope('', 'sys', [], TURN_OPTS(() => { ac.abort(); }, ac.signal));
  await assert.rejects(p, (e) => e.name === 'AbortError');
  assert.equal(calls.length, 1);
});

/* ══ ④ js/atlas-live.js reads the reply while it is written ═════════════════════════════════════ */
test('atlas-live-stream ④ the draft reader: any split, every escape, the declaration before the words', () => {
  const doc = JSON.stringify({ turn: 'final', answer_mode: 'mixed', final_text: '東京は「首都」\n\t"quoted" \\ back — 😀 {not:json} [x]', extra: { final_text: 'nested is not the answer' } });
  for (const n of [1, 2, 3, 5, 8, 1000]) {
    const r = LIVE.makeDraftReader();
    let last = null;
    for (let i = 0; i < doc.length; i += n) last = r.feed(doc.slice(i, i + n));
    assert.deepEqual(last, { mode: 'json', turn: 'final', answerMode: 'mixed', text: '東京は「首都」\n\t"quoted" \\ back — 😀 {not:json} [x]' }, 'slice ' + n);
  }
  /* the value is exposed WHILE it is written, and never shows half an escape */
  const r = LIVE.makeDraftReader();
  assert.equal(r.feed('{"turn":"continuing","final_text":"まず').turn, 'continuing');
  assert.equal(r.feed('\\u').text, 'まず');
  assert.equal(r.feed('3042').text, 'まずあ');
  /* prose is shown as written; a fenced JSON is still JSON */
  assert.deepEqual(LIVE.makeDraftReader().feed('  ただの文章'), { mode: 'prose', turn: '', answerMode: '', text: 'ただの文章' });
  assert.equal(LIVE.makeDraftReader().feed('```json\n{"final_text":"柵の中"}\n```').text, '柵の中');
});

test('atlas-live-stream ④ the thinking headline is the latest title, or the latest sentence', () => {
  assert.equal(LIVE.thoughtHeadline('**Plan**\n\nfirst.\n\n**Comparing the two rankings**\n\nNow.'), 'Comparing the two rankings');
  assert.equal(LIVE.thoughtHeadline('人口を調べる。次に面積を比べる。'), '次に面積を比べる。');
  assert.equal(LIVE.thoughtHeadline(''), '');
});

test('atlas-live-stream ④ a preview is never the answer: the console replaces the draft and a call makes it a note', () => {
  const con = read('js/atlas-console.js');
  /* the draft stands only where there is no answer yet */
  assert.match(con, /let head=say\?\([^\n]*\):LIVE\.draftHtml\(ai\);/);
  /* the answer path ends the live state BEFORE it composes, so `__atlSay` is what is rendered */
  assert.ok(con.indexOf("LIVE.end(ai,'answered')") > 0 && con.indexOf("LIVE.end(ai,'answered')") < con.indexOf('_atlCompose(ai); try{ LIVE.answered(ai)'));
  /* a stopped turn keeps its draft marked unfinished; a failed one does not keep it */
  assert.match(con, /function _markCancelled\(b\)\{ try\{ LIVE\.end\(b,'cancelled'\); \}catch\(_\)\{\}/);
  assert.match(con, /LIVE\.end\(ai,'error'\)/);
  const live = read('js/atlas-live.js');
  assert.match(live, /if \(r\.turn === 'continuing' \|\| st\.callNames\.length\) \{ narrate\(ai, st, r\.text\); return; \}/);
  /* the HUD opens a chip only for an operation the executor STARTED — never from a preview */
  assert.match(live, /if \(ev\.phase !== 'started'\) return;/);
  assert.doesNotMatch(live.slice(live.indexOf('function hooks('), live.indexOf('function wordForTool(')), /hudOps|atl-hud-op/, 'a stream preview put a chip on the map');
});

/* ══ ⑤ the two ends speak the same events, and no limit moved ═════════════════════════════════ */
test('atlas-live-stream ⑤ every preview ai-proxy can send is one the page handles, and nothing else', () => {
  const sent = new Set();
  const sink = S.previewSink((e) => sent.add(e));
  sink.text('a'); sink.think('b'); sink.call({ id: '', name: 'x' }); sink.search(); sink.attempt();
  const live = read('js/atlas-live.js');
  const handled = new Set([...live.matchAll(/name === '([a-z]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...sent].sort(), [...handled].sort());
  const proxy = read('supabase/functions/ai-proxy/index.ts');
  assert.match(proxy, /send\("open", \{ protocol: 2 \}\)/);
  assert.match(proxy, /send\("done", a\)/);
});

test('atlas-live-stream ⑤ CONSTITUTION §5: the loop does not know there is a stream', () => {
  /* the ceilings themselves are held where they are defined (tests/ai-quota-fairness-checks ④,
     tests/atlas-turn-engine-checks); what this round could have moved is the loop, and it must not
     have learned about the transport — a preview that reached it could decide something. */
  const agent = read('js/atlas-agent.js');
  assert.doesNotMatch(agent, /\bstream\b|onEvent|aiReadStream/,'the loop learned about the transport — it must not: streaming is the adapter\'s and the page\'s');
});
