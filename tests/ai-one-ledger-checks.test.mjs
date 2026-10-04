/* ============================================================================
 *  ai-one-ledger — every path that calls a model on a reader's behalf is counted and measured
 *  by ONE ledger
 * ----------------------------------------------------------------------------
 *  THE DEFECTS THIS FILE STATES (audit, 2026-09-29), so that the next variant of each fails here:
 *
 *  ① No function read the provider's usage block, so neither the cost of one Atlas turn nor the
 *     prompt-cache hit rate was measured anywhere.
 *     ⇒ _shared/ai-usage.js normalizeUsage turns the three providers' blocks into one shape, and says
 *       null (not zero) when a block is missing; ai-proxy, EVALUATED, writes the total to
 *       record_ai_usage with the right turn key.
 *  ② ai-proxy's Anthropic path sent no cache_control, so the fixed ~7k-token prefix (instructions +
 *     functions) was billed in full on every one of up to TURN_MAX_CALLS calls.
 *     ⇒ withPromptCache marks the last tool and the last system block, never more than four marks,
 *       never edits the caller's object; ai-proxy, EVALUATED on the Anthropic turn path, sends them.
 *  ③ The area-monitor runner's «Run now» called the provider without touching the reader's AI
 *     allowance. (monitors-retire) That runner is removed, and with it the two evaluations that held
 *     it to the ledger; what remains of ③ is the ledger's own doors, asked directly below
 *     (openTurn with a caller's own turn bounds).
 *  ④ The per-caller bucket was keyed by x-forwarded-for even where the caller was a verified account.
 *     ⇒ callerKey(req, verifiedUid) keys by the account when there is one, and never by a value that
 *       is not a UUID (an unverified claim would be a fresh bucket per request).
 *
 *  Runner: the Edge Functions are evaluated in a child process with Deno.serve captured and fetch
 *  stubbed (the shape of tests/edge-spend-and-models-checks.test.mjs); ai-proxy is TypeScript and
 *  runs under Node's type stripping. Nothing here reads a function as text.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = join(ROOT, 'supabase/functions');
const U = await import(pathToFileURL(join(FN, '_shared/ai-usage.js')).href);
const L = await import(pathToFileURL(join(FN, '_shared/ai-ledger.js')).href);
const R = await import(pathToFileURL(join(FN, '_shared/rate-limit.js')).href);
const P = await import(pathToFileURL(join(FN, '_shared/ai-provider.js')).href);
const SUPA = 'https://sb.test';

/* ══ ① one shape for three providers ═══════════════════════════════════════════════════════════ */
test('ai-one-ledger ① normalizeUsage: Anthropic, OpenAI (Responses and Chat), Gemini — one shape', () => {
  /* Anthropic reports the uncached remainder as input_tokens, the cache read and write beside it */
  assert.deepEqual(U.normalizeUsage('anthropic', { usage: { input_tokens: 120, cache_read_input_tokens: 7000, cache_creation_input_tokens: 0, output_tokens: 300 } }),
    { input: 120, cached_read: 7000, cache_write: 0, output: 300 });
  assert.deepEqual(U.normalizeUsage('anthropic', { usage: { input_tokens: 90, cache_creation_input_tokens: 7100, output_tokens: 40 } }),
    { input: 90, cached_read: 0, cache_write: 7100, output: 40 });
  /* OpenAI's input_tokens is the WHOLE prompt; the cached part is subtracted, never counted twice */
  assert.deepEqual(U.normalizeUsage('openai', { usage: { input_tokens: 8000, input_tokens_details: { cached_tokens: 6400 }, output_tokens: 900, output_tokens_details: { reasoning_tokens: 700 } } }),
    { input: 1600, cached_read: 6400, cache_write: 0, output: 900 });
  assert.deepEqual(U.normalizeUsage('openai', { usage: { prompt_tokens: 500, prompt_tokens_details: { cached_tokens: 128 }, completion_tokens: 60 } }),
    { input: 372, cached_read: 128, cache_write: 0, output: 60 });
  /* Gemini: the prompt includes the cached part; tool-use prompt is input; thinking is output */
  assert.deepEqual(U.normalizeUsage('gemini', { usageMetadata: { promptTokenCount: 3000, cachedContentTokenCount: 2048, toolUsePromptTokenCount: 100, candidatesTokenCount: 250, thoughtsTokenCount: 400 } }),
    { input: 1052, cached_read: 2048, cache_write: 0, output: 650 });
  /* a cached count larger than the prompt (a provider inconsistency) never makes input negative */
  assert.equal(U.normalizeUsage('openai', { usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 50 }, output_tokens: 1 } }).input, 0);

  /* ⚠ NOT OBSERVED IS NOT ZERO */
  for (const [p, a] of [['anthropic', { content: [] }], ['openai', { output: [] }], ['gemini', { candidates: [] }], ['anthropic', null], ['someone-else', { usage: { input_tokens: 5 } }]]) {
    assert.equal(U.normalizeUsage(p, a), null, `${p}: an answer with no usage block is «not reported», not «free»`);
  }
});

test('ai-one-ledger ① usageMeter sums every answer read and counts the ones that said nothing', () => {
  const m = U.usageMeter();
  m.add('openai', { usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 60 }, output_tokens: 5 } });
  m.add('openai', { output: [] });   /* read, but unreported */
  m.add('anthropic', { usage: { input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3, output_tokens: 4 } });
  assert.deepEqual(m.total(), { calls: 3, unmetered: 1, input: 41, cached_read: 62, cache_write: 3, output: 9 });
  const t = m.total(); t.calls = 99;
  assert.equal(m.total().calls, 3, 'total() is a copy, not the meter');
});

/* ══ ② the Anthropic cache breakpoints ═══════════════════════════════════════════════════════ */
test('ai-one-ledger ② withPromptCache marks the end of the tools and of the system prompt, and nothing else', () => {
  const body = {
    model: 'm', max_tokens: 10, system: 'SYSTEM',
    tools: [{ name: 'a', input_schema: {} }, { name: 'b', input_schema: {} }],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'q' }] }],
  };
  const frozen = JSON.stringify(body);
  const out = U.withPromptCache(body);
  assert.equal(JSON.stringify(body), frozen, 'the caller\'s body is not edited');
  assert.deepEqual(out.system, [{ type: 'text', text: 'SYSTEM', cache_control: { type: 'ephemeral' } }]);
  assert.equal(out.tools[0].cache_control, undefined);
  assert.deepEqual(out.tools[1], { name: 'b', input_schema: {}, cache_control: { type: 'ephemeral' } });
  assert.deepEqual(out.messages, body.messages, 'the conversation is untouched');
  /* what the model reads is the same: the same tools in the same order, the same system text */
  assert.deepEqual(out.tools.map((t) => { const { cache_control, ...rest } = t; return rest; }), body.tools);
  assert.equal(out.system.map((b) => b.text).join(''), body.system);

  /* nothing to cache → nothing marked */
  assert.deepEqual(U.withPromptCache({ model: 'm', messages: [] }), { model: 'm', messages: [] });
  /* a system array: the LAST block is marked */
  const arr = U.withPromptCache({ system: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] });
  assert.equal(arr.system[0].cache_control, undefined);
  assert.deepEqual(arr.system[1].cache_control, { type: 'ephemeral' });

  /* never past the provider's four breakpoints, and an existing mark is kept, not doubled */
  const mark = { type: 'ephemeral' };
  const full = { system: 'S', tools: [{ name: 't' }], messages: [{ role: 'user', content: [{ type: 'text', text: '1', cache_control: mark }, { type: 'text', text: '2', cache_control: mark }, { type: 'text', text: '3', cache_control: mark }] }] };
  const f = U.withPromptCache(full);
  const count = (b) => JSON.stringify(b).split('"cache_control"').length - 1;
  assert.equal(count(f), U.ANTHROPIC_MAX_CACHE_BREAKPOINTS, 'one more mark fits, and only one');
  assert.ok(count(U.withPromptCache(f)) <= U.ANTHROPIC_MAX_CACHE_BREAKPOINTS, 'applying it twice never exceeds four');
  const again = U.withPromptCache(out);
  assert.equal(count(again), 2, 'idempotent: an already-marked body gains nothing');
});

/* ══ ④ the bucket key ════════════════════════════════════════════════════════════════════════ */
test('ai-one-ledger ④ callerKey: the verified account when there is one, the address otherwise', () => {
  const req = (h) => new Request('https://fn.test/', { headers: h || {} });
  const uid = '6F1D2C3B-0000-4000-8000-00000000ABCD';
  assert.equal(R.callerKey(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }), uid), 'uid:' + uid.toLowerCase());
  assert.equal(R.callerKey(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })), '203.0.113.7');
  assert.equal(R.callerKey(req({ 'x-forwarded-for': '203.0.113.9' }), uid), R.callerKey(req({ 'x-forwarded-for': '198.51.100.2' }), uid),
    'an account keeps its bucket across networks');
  /* a value that is not a verified-looking id is not an identity: the address decides */
  for (const bad of ['', null, 'u1', 'uid:x', '../../etc', uid + 'x', ' ']) {
    assert.equal(R.callerKey(req({ 'x-forwarded-for': '203.0.113.7' }), bad), '203.0.113.7', `«${bad}» was taken as an account`);
  }
  assert.equal(R.callerKey(req()), 'unknown', 'no address → the shared bucket, never an exemption');
  assert.equal(R.callerAddress(req({ 'x-forwarded-for': ' 192.0.2.1 ,x' })), '192.0.2.1');
  /* an address can never take an account's key: a header that spells one is not an address */
  assert.equal(R.callerKey(req({ 'x-forwarded-for': 'uid:' + uid.toLowerCase() })), 'unknown');
  assert.equal(R.callerKey(req({ 'x-forwarded-for': '2001:db8::1' })), '2001:db8::1', 'an IPv6 address is still an address');
});

/* ══ the ledger's doors, against a fake database ══════════════════════════════════════════════ */
function fakeDb(replies) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => { calls.push({ name, args }); const r = replies[name]; if (r instanceof Error) throw r; return r || { data: null, error: null }; },
    from: (t) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { calls.push({ name: 'from:' + t }); return replies['from:' + t] || { data: null }; } }) }) }),
  };
}

test('ai-one-ledger ③ the ledger doors: the account, the charge, the refusal, the silence', async () => {
  const uid = '00000000-0000-4000-8000-000000000001';
  const env = (k) => (k === 'DEV_USER_IDS' ? ' 00000000-0000-4000-8000-0000000000DE ,x' : '');
  /* the plan comes from profiles; unknown plans fall to free; the developer is unlimited */
  let db = fakeDb({ 'from:profiles': { data: { plan: 'pro' } } });
  assert.deepEqual(await L.accountFor(db, uid, env), { id: uid, plan: 'pro', isDev: false, limit: L.PLAN_LIMITS.pro });
  db = fakeDb({ 'from:profiles': { data: { plan: 'mystery' } } });
  assert.equal((await L.accountFor(db, uid, env)).limit, L.PLAN_LIMITS.free);
  const dev = await L.accountFor(fakeDb({}), '00000000-0000-4000-8000-0000000000de', env);
  assert.deepEqual([dev.isDev, dev.plan], [true, 'unlimited']);

  /* the developer consumes nothing and asks nothing */
  db = fakeDb({});
  assert.deepEqual(await L.openTurn(db, dev, { turn: 't' }), { allowed: true, charged: false, used: 0, calls: 0, reason: '' });
  assert.equal(db.calls.length, 0);

  const acct = { id: uid, plan: 'free', isDev: false, limit: 10 };
  db = fakeDb({ consume_ai_turn: { data: [{ used: 3, allowed: true, charged: true, calls: 1, reason: '' }], error: null } });
  assert.deepEqual(await L.openTurn(db, acct, { turn: 'job:r1', maxCalls: 1, ttlSeconds: 900 }), { allowed: true, charged: true, used: 3, calls: 1, reason: '' });
  assert.deepEqual(db.calls[0].args, { p_user: uid, p_limit: 10, p_turn: 'job:r1', p_max_calls: 1, p_ttl_seconds: 900 });
  db = fakeDb({ consume_ai_turn: { data: [{ used: 10, allowed: false, charged: false, calls: 1, reason: 'limit' }], error: null } });
  assert.equal((await L.openTurn(db, acct, { turn: 'x' })).reason, 'limit');
  /* the ledger's silence is not permission */
  for (const r of [{ data: null, error: { message: 'relation "public.ai_turns" …' } }, new Error('boom'), { data: [], error: null }]) {
    await assert.rejects(L.openTurn(fakeDb({ consume_ai_turn: r }), acct, { turn: 'x' }), (e) => e instanceof L.LedgerUnavailable && !/ai_turns/.test(e.message));
  }

  /* record: nothing read → nothing written; otherwise one call with clean integers */
  db = fakeDb({});
  assert.equal(await L.recordUsage(db, uid, 't', { calls: 0 }), false);
  assert.equal(db.calls.length, 0);
  await L.recordUsage(db, uid, 't', { calls: 2, unmetered: 1, input: 10.7, cached_read: -3, cache_write: 'x', output: 5 });
  assert.deepEqual(db.calls[0], { name: 'record_ai_usage', args: { p_user: uid, p_turn: 't', p_calls: 2, p_unmetered: 1, p_input: 10, p_cached_read: 0, p_cache_write: 0, p_output: 5 } });
  /* a failing write does not throw into the answer it measures */
  assert.equal(await L.recordUsage(fakeDb({ record_ai_usage: new Error('down') }), uid, '', { calls: 1 }), false);
});

/* ══ the functions, evaluated ════════════════════════════════════════════════════════════════ */
/* routes: [method or '*', regex source, reply] — reply { status, json, headers } */
function runEdge(fn, requests, o) {
  const url = pathToFileURL(join(FN, fn, 'index.ts')).href;
  const src = `
    const ENV = ${JSON.stringify(o.env || {})};
    globalThis.Deno = { env: { get: (k) => ENV[k] || "" }, serve: (h) => { globalThis.__h = h; } };
    const routes = ${JSON.stringify(o.routes || [])}.map(([m, re, r]) => [m, new RegExp(re), r]);
    const hosts = ${JSON.stringify(P.PROVIDER_HOSTS)};
    globalThis.__calls = [];
    globalThis.fetch = async (u, init) => {
      const s = String(u && u.url ? u.url : u);
      const method = String((init && init.method) || (u && u.method) || "GET").toUpperCase();
      let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
      globalThis.__calls.push({ url: s, method, provider: hosts.includes(new URL(s).hostname), body });
      if (/\\/rest\\/v1\\/rpc\\/relay_take$/.test(s)) return new Response(JSON.stringify([{ allowed: true, remaining: 9 }]), { status: 200, headers: { "content-type": "application/json" } });
      const hit = routes.find(([m, re]) => (m === "*" || m === method) && re.test(s));
      const r = hit ? hit[2] : { status: 404, json: { message: "no route" } };
      const text = method === "HEAD" ? null : JSON.stringify(r.json === undefined ? {} : r.json);
      return new Response(text, { status: r.status || 200, headers: { "content-type": "application/json", ...(r.headers || {}) } });
    };
    await import(${JSON.stringify(url)});
    const out = [];
    for (const q of ${JSON.stringify(requests)}) {
      const before = globalThis.__calls.length;
      let status = 0, json = null;
      try {
        const r = await globalThis.__h(new Request("https://fn.test/", { method: "POST", headers: q.headers || {}, body: JSON.stringify(q.body || {}) }));
        status = r.status; try { json = await r.json(); } catch (_) { json = null; }
      } catch (e) { status = -1; json = { thrown: String(e && e.message || e) }; }
      out.push({ status, json, calls: globalThis.__calls.slice(before) });
    }
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  `;
  const raw = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(raw);
}
const rpcArgs = (calls, name) => calls.filter((c) => c.url.endsWith('/rest/v1/rpc/' + name)).map((c) => c.body);
const USER = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'r@example.test' };

test('ai-one-ledger ②① ai-proxy on Anthropic: the fixed prefix is marked for the cache, and the turn\'s cost reaches the ledger', () => {
  const env = { SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-stub' };
  const routes = [
    ['*', '/auth/v1/user$', { json: USER }],
    ['*', '/rest/v1/profiles', { json: [] }],
    ['*', '/rest/v1/rpc/consume_ai_turn$', { json: [{ allowed: true, used: 1, charged: true, calls: 1 }] }],
    ['*', '/rest/v1/rpc/(refund|settle)_ai_turn$', { json: null }],
    ['*', '/rest/v1/rpc/record_ai_usage$', { json: null }],
    ['*', 'api\\.anthropic\\.com/v1/messages', { json: { model: 'claude-x', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_1', name: 'map_fly', input: { place: 'Osaka' } }],
      usage: { input_tokens: 40, cache_read_input_tokens: 7012, cache_creation_input_tokens: 0, output_tokens: 55 } } }],
  ];
  const turn = {
    task: 'atlas_turn', protocol: 2, system: 'You are Atlas. '.repeat(50),
    input: [{ type: 'message', role: 'user', content: 'fly to Osaka' }],
    tools: [{ name: 'map_fly', description: 'fly', parameters: { type: 'object', properties: { place: { type: 'string' } } } },
            { name: 'map_zoom', description: 'zoom', parameters: { type: 'object', properties: {} } }],
  };
  const [r] = runEdge('ai-proxy', [{ headers: { authorization: 'Bearer good', 'content-type': 'application/json', 'x-intmap-turn': 'turn-A' }, body: turn }], { env, routes });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const sent = r.calls.find((c) => c.provider).body;
  assert.deepEqual(sent.tools.map((t) => t.name), ['map_fly', 'map_zoom'], 'the same functions, in the same order');
  assert.equal(sent.tools[0].cache_control, undefined);
  assert.deepEqual(sent.tools[1].cache_control, { type: 'ephemeral' }, 'the end of the tool list is a breakpoint');
  assert.ok(Array.isArray(sent.system) && sent.system.length === 1, 'the system prompt travels as one block');
  assert.equal(sent.system[0].text, turn.system, 'with exactly the text the caller sent');
  assert.deepEqual(sent.system[0].cache_control, { type: 'ephemeral' }, 'the end of the system prompt is a breakpoint');

  const rec = rpcArgs(r.calls, 'record_ai_usage');
  assert.equal(rec.length, 1, 'one record per request');
  assert.deepEqual(rec[0], { p_user: USER.id, p_turn: 'turn-A', p_calls: 1, p_unmetered: 0, p_input: 40, p_cached_read: 7012, p_cache_write: 0, p_output: 55 });
  const order = r.calls.map((c) => c.provider ? 'provider' : (c.url.match(/rpc\/(\w+)$/) || [])[1]).filter(Boolean);
  assert.ok(order.indexOf('provider') < order.indexOf('record_ai_usage'), 'recorded after the provider answered: ' + order.join(' '));
  assert.ok(order.indexOf('consume_ai_turn') < order.indexOf('provider'), 'charged before the provider was asked');
});

test('ai-one-ledger ① ai-proxy records a failed request\'s cost too, and records nothing when no provider answered', () => {
  const env = { SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-stub' };
  const base = [
    ['*', '/auth/v1/user$', { json: USER }],
    ['*', '/rest/v1/profiles', { json: [] }],
    ['*', '/rest/v1/rpc/consume_ai_turn$', { json: [{ allowed: true, used: 1, charged: true, calls: 1 }] }],
    ['*', '/rest/v1/rpc/(refund|settle)_ai_turn$', { json: null }],
    ['*', '/rest/v1/rpc/record_ai_usage$', { json: null }],
  ];
  const ask = { headers: { authorization: 'Bearer good', 'content-type': 'application/json', 'x-intmap-turn': 'turn-B' }, body: { task: 'analysis_structured', prompt: 'hello' } };
  /* the provider answered (and billed) but the answer was not the required shape → refunded, still recorded */
  const [bad] = runEdge('ai-proxy', [ask], { env, routes: [...base, ['*', 'api\\.openai\\.com/v1/responses', { json: { model: 'gpt-x', status: 'completed', output_text: 'not json', output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }],
    usage: { input_tokens: 2000, input_tokens_details: { cached_tokens: 1024 }, output_tokens: 30 } } }]] });
  assert.equal(bad.json.error, 'invalid_structured_output', JSON.stringify(bad.json));
  assert.equal(rpcArgs(bad.calls, 'refund_ai_turn').length, 1, 'the reader gets the use back');
  assert.deepEqual(rpcArgs(bad.calls, 'record_ai_usage'), [{ p_user: USER.id, p_turn: 'turn-B', p_calls: 1, p_unmetered: 0, p_input: 976, p_cached_read: 1024, p_cache_write: 0, p_output: 30 }],
    'the provider\'s bill is still recorded');
  /* the provider refused at the door (500 from the provider → nothing read): no answer, no record */
  const [down] = runEdge('ai-proxy', [ask], { env, routes: [...base, ['*', 'api\\.openai\\.com/v1/responses', { status: 500, json: { error: { message: 'x' } } }]] });
  assert.notEqual(down.status, 200);
  assert.deepEqual(rpcArgs(down.calls, 'record_ai_usage'), [], 'a request that read no provider answer writes no cost');
});
