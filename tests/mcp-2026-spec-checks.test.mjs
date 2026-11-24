/* ============================================================================
 *  MCP 2026-07-28 — the client (js/atlas-mcp-client.js) and the server (supabase/functions/mcp-server) speak BOTH the
 *  stateless protocol and the initialize-based one, and every claim is measured against a mock or the real handler.
 * ----------------------------------------------------------------------------
 *  Spec read for this round (modelcontextprotocol.io/specification/2026-07-28/…): changelog, server/discover,
 *  basic/transports/streamable-http, server/tools, server/utilities/caching, client/elicitation, basic/authorization,
 *  extensions/tasks. NOT read (so not claimed): schema.ts, the exact params of the tasks/* methods, MCP Apps' capability.
 *
 *    ① the client asks which protocol a server speaks: discover → stateless (no initialize, no session id, _meta and the
 *       routing headers on every request); 400 + UnsupportedProtocolVersion → legacy; an old server → initialize
 *    ② an auth failure / network failure is NOT read as «old server» (one-pass-or-a-reason)
 *    ③ the tool list is cached for ttlMs and re-read when stale; a legacy list lives with the session as before
 *    ④ tasks: polled to completion; still running → a pending record that taskId continues or cancels (cancel is a write)
 *    ⑤ input_required is surfaced for the reader and retried with inputResponses; the client never answers for them
 *    ⑥ a 401's WWW-Authenticate is reported; provenance and jobSafe ride on every result
 *    ⑦ the relay forwards the new methods and headers
 *    ⑧ the server: discover, header/body mismatch, unsupported version, 404, resultType, ttl, no session, legacy unchanged
 *    ⑨ the server's tool declarations: every tool states its effects (a write tool is refused), outputSchema is what it returns
 *    ⑩ client ↔ server end to end, over the real handler
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createMcpClient, parseAuthChallenge, MCP_PROTOCOL_VERSION, MCP_LEGACY_PROTOCOL_VERSION } from '../js/atlas-mcp-client.js';
import { checkRelayRequest, MCP_RELAY_METHODS } from '../supabase/functions/_shared/mcp-relay-policy.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const modUrl = (rel) => pathToFileURL(join(ROOT, rel)).href;
const META = 'io.modelcontextprotocol/';

const memStore = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const jsonRes = (o, status, headers) => new Response(JSON.stringify(o), { status: status || 200, headers: Object.assign({ 'content-type': 'application/json' }, headers || null) });
const ok = (id, result) => jsonRes({ jsonrpc: '2.0', id, result });
const TOOLS = [
  { name: 'lookup', description: 'Look a thing up', inputSchema: { type: 'object', properties: { q: { type: 'string' } } }, annotations: { readOnlyHint: true, idempotentHint: true } },
  { name: 'slow', description: 'A long job', inputSchema: { type: 'object', properties: {} } },
  { name: 'ask', description: 'Needs the reader', inputSchema: { type: 'object', properties: {} } },
];

/** a 2026-07-28 mock. opts: { ttlMs, tasks: ['working','working','completed'], log } — everything the client sent is in log. */
function statelessServer(opts) {
  const o = Object.assign({ ttlMs: 60000, tasks: ['completed'], log: [] }, opts || null);
  let polls = 0, listCalls = 0;
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    o.log.push({ method: body.method, headers: init.headers, params: body.params });
    const meta = (body.params && body.params._meta) || {};
    if (init.headers['mcp-protocol-version'] !== '2026-07-28' || meta[META + 'protocolVersion'] !== '2026-07-28') return jsonRes({ jsonrpc: '2.0', id: body.id, error: { code: -32022, message: 'unsupported', data: { supported: ['2026-07-28'] } } }, 400);
    switch (body.method) {
      case 'server/discover': return ok(body.id, { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: { tools: {} }, ttlMs: 3600000, cacheScope: 'public', _meta: { [META + 'serverInfo']: { name: 'Stateless Mock', version: '2' } } });
      case 'tools/list': listCalls++; impl.listCalls = listCalls; return ok(body.id, { resultType: 'complete', tools: TOOLS, ttlMs: o.ttlMs, cacheScope: 'public' });
      case 'tools/call': {
        const n = body.params.name;
        if (n === 'lookup') return ok(body.id, { resultType: 'complete', content: [{ type: 'text', text: 'found ' + (body.params.arguments.q || '') }] });
        if (n === 'slow') return ok(body.id, { resultType: 'task', task: { taskId: 'task-1', status: 'working', ttlMs: 60000, pollIntervalMs: 250 } });
        if (n === 'ask') {
          if (body.params.inputResponses) return ok(body.id, { resultType: 'complete', content: [{ type: 'text', text: 'ok ' + JSON.stringify(body.params.inputResponses) + ' state=' + body.params.requestState }] });
          return ok(body.id, { resultType: 'input_required', inputRequests: { who: { method: 'elicitation/create', params: { mode: 'form', message: 'Which city?', requestedSchema: { type: 'object', properties: { city: { type: 'string' } } } } } }, requestState: 'st-1' });
        }
        return ok(body.id, { resultType: 'complete', content: [], isError: true });
      }
      case 'tasks/get': { const status = o.tasks[Math.min(polls++, o.tasks.length - 1)]; return ok(body.id, status === 'completed' ? { resultType: 'complete', taskId: body.params.taskId, status, result: { content: [{ type: 'text', text: 'done after ' + polls + ' polls' }] } } : { resultType: 'complete', taskId: body.params.taskId, status, pollIntervalMs: 250 }); }
      case 'tasks/cancel': return ok(body.id, { resultType: 'complete' });
      default: return jsonRes({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'method_not_found' } }, 404);
    }
  };
  impl.opts = o;
  return impl;
}
/** an initialize-based mock (what #1279 was written against): a session id, no discover. */
function legacyServer(log) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    (log || []).push({ method: body.method, headers: init.headers });
    if (body.method === 'notifications/initialized') return new Response('', { status: 202 });
    if (body.method === 'initialize') return jsonRes({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'Old', version: '1' } } }, 200, { 'mcp-session-id': 's1' });
    if (init.headers['mcp-session-id'] !== 's1') return new Response('bad session', { status: 400 });
    if (body.method === 'tools/list') return ok(body.id, { tools: TOOLS });
    return ok(body.id, { content: [{ type: 'text', text: 'old ' + body.params.name }] });
  };
}
const mk = (fetchImpl, extra) => { const c = createMcpClient(Object.assign({ fetchImpl, storage: memStore(), relayUrl: null, sleep: async () => {} }, extra || null)); c.addServer({ name: 'Mock', url: 'https://mcp.example.com/mcp', readOnly: ['lookup', 'slow', 'ask'] }); return c; };

test('① a stateless server: discover first, no initialize, no session id, _meta and routing headers on every request', async () => {
  const log = []; const c = mk(statelessServer({ log }));
  const r = await c.callTool({ server: 'mock', tool: 'lookup', arguments: { q: 'x' } });
  assert.equal(r.ok, true);
  assert.deepEqual(log.map((l) => l.method), ['server/discover', 'tools/list', 'tools/call']);
  assert.ok(!log.some((l) => l.method === 'initialize' || l.method === 'notifications/initialized'), 'no handshake');
  log.forEach((l) => {
    assert.equal(l.headers['mcp-protocol-version'], MCP_PROTOCOL_VERSION);
    assert.equal(l.headers['mcp-method'], l.method);
    assert.equal(l.headers['mcp-session-id'], undefined, 'no session');
    assert.equal(l.params._meta[META + 'protocolVersion'], '2026-07-28');
    assert.equal(l.params._meta[META + 'clientInfo'].name, 'IntMap-Atlas');
    assert.ok(l.params._meta[META + 'clientCapabilities'], 'capabilities are declared on every request');
  });
  assert.equal(log[2].headers['mcp-name'], 'lookup');
  assert.equal(r.provenance.protocol, '2026-07-28');
  assert.equal(r.provenance.serverSays.name, 'Stateless Mock');
});

test('① an old server: discover is refused (400 with no new-style error) → initialize, session id, as before', async () => {
  const log = []; const c = mk(legacyServer(log));
  const r = await c.callTool({ server: 'mock', tool: 'lookup' });
  assert.equal(r.ok, true);
  assert.deepEqual(log.map((l) => l.method), ['server/discover', 'initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
  log.slice(1).forEach((l) => { assert.equal(l.headers['mcp-protocol-version'], MCP_LEGACY_PROTOCOL_VERSION); if (l.method !== 'initialize') assert.equal(l.headers['mcp-session-id'], 's1'); });
  assert.match(r.provenance.protocol, /^legacy:/);
});

test('① a server that answers discover with UnsupportedProtocolVersion: we speak the version it lists, or fall back, or say we cannot', async () => {
  const both = async (u, init) => { const b = JSON.parse(init.body); if (b.method === 'server/discover') return jsonRes({ jsonrpc: '2.0', id: b.id, error: { code: -32022, message: 'x', data: { supported: ['2025-03-26'] } } }, 400); return legacyServer()(u, init); };
  assert.equal((await mk(both).callTool({ server: 'mock', tool: 'lookup' })).ok, true, 'it lists an older version → initialize');
  const future = async (u, init) => { const b = JSON.parse(init.body); return jsonRes({ jsonrpc: '2.0', id: b.id, error: { code: -32022, message: 'x', data: { supported: ['2099-01-01'] } } }, 400); };
  const r = await mk(future).callTool({ server: 'mock', tool: 'lookup' });
  assert.equal(r.ok, false); assert.equal(r.code, 'unsupported_protocol_version');
});

test('② an auth failure or an unreachable host is NOT a verdict that the server is old', async () => {
  const log = [];
  const r1 = await mk(async (u, i) => { log.push(JSON.parse(i.body).method); return new Response('no', { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource", scope="files:read"' } }); }).callTool({ server: 'mock', tool: 'lookup' });
  assert.equal(r1.code, 'auth_required');
  assert.deepEqual(log, ['server/discover'], 'no initialize attempt after a 401');
  assert.equal(r1.auth.resourceMetadata, 'https://mcp.example.com/.well-known/oauth-protected-resource');
  assert.match(r1.message, /OAuth/);
  const log2 = [];
  const r2 = await mk(async (u, i) => { log2.push(JSON.parse(i.body).method); throw new TypeError('Failed to fetch'); }).callTool({ server: 'mock', tool: 'lookup' });
  assert.equal(r2.code, 'network_or_cors');
  assert.deepEqual(log2, ['server/discover']);
  assert.deepEqual(parseAuthChallenge('Bearer error="insufficient_scope", scope="a b"'), { resourceMetadata: undefined, scope: 'a b', error: 'insufficient_scope' });
  assert.equal(parseAuthChallenge('Basic realm="x"'), null);
});

test('③ the tool list is kept for ttlMs and re-read when stale; a legacy list lives with the session', async () => {
  const fake = statelessServer({ ttlMs: 60000 }); const c = mk(fake);
  await c.searchTools('lookup'); await c.searchTools('lookup');
  assert.equal(fake.listCalls, 1, 'second search is served from the cache');
  c._live.mock.toolsAt = Date.now() - 61000;
  await c.searchTools('lookup');
  assert.equal(fake.listCalls, 2, 'stale → re-read');
  const zero = statelessServer({ ttlMs: 0 }); const c0 = mk(zero);
  await c0.searchTools('lookup'); await c0.searchTools('lookup');
  assert.equal(zero.listCalls, 2, 'ttlMs 0 is stale at once (caching spec)');
  const legacyLog = []; const cl = mk(legacyServer(legacyLog));
  await cl.searchTools('lookup'); await cl.searchTools('lookup');
  assert.equal(legacyLog.filter((l) => l.method === 'tools/list').length, 1, 'legacy: unchanged');
});

test('④ a task is polled to completion; one still running comes back pending, and taskId continues it', async () => {
  const done = mk(statelessServer({ tasks: ['working', 'working', 'completed'] }));
  const r = await done.callTool({ server: 'mock', tool: 'slow' });
  assert.equal(r.ok, true); assert.ok(!r.pending); assert.match(r.text, /done after 3 polls/); assert.equal(r.provenance.taskId, 'task-1');
  const fake = statelessServer({ tasks: ['working'] }); const c = mk(fake);
  const p = await c.callTool({ server: 'mock', tool: 'slow' }, { waitMs: 300 });
  assert.equal(p.pending, true); assert.equal(p.code, 'task_pending'); assert.equal(p.task.id, 'task-1');
  assert.match(p.message, /taskId "task-1"/);
  fake.opts.tasks = ['completed'];
  const q = await c.callTool({ server: 'mock', taskId: 'task-1', taskAction: 'get' }, { mustBeReadOnly: true });
  assert.equal(q.ok, true); assert.match(q.text, /done after/);
  const refused = await c.callTool({ server: 'mock', taskId: 'task-1', taskAction: 'cancel' }, { mustBeReadOnly: true });
  assert.equal(refused.code, 'not_declared_read_only', 'cancel is a write: not through mcp.call');
  const cancelled = await c.callTool({ server: 'mock', taskId: 'task-1', taskAction: 'cancel' });
  assert.equal(cancelled.ok, true);
  const old = await mk(legacyServer()).callTool({ server: 'mock', taskId: 't', taskAction: 'get' });
  assert.equal(old.code, 'tasks_unsupported');
});

test('⑤ input_required is surfaced for the READER and retried with inputResponses + requestState; never answered by the client', async () => {
  const log = []; const c = mk(statelessServer({ log }));
  const r = await c.callTool({ server: 'mock', tool: 'ask' });
  assert.equal(r.ok, false); assert.equal(r.code, 'input_required');
  assert.equal(r.inputRequests.who.message, 'Which city?'); assert.equal(r.requestState, 'st-1');
  assert.match(r.message, /never answer for them/);
  assert.equal(log.filter((l) => l.method === 'tools/call').length, 1, 'no automatic retry');
  const r2 = await c.callTool({ server: 'mock', tool: 'ask', inputResponses: { who: { action: 'accept', content: { city: 'Osaka' } } }, requestState: r.requestState });
  assert.equal(r2.ok, true); assert.match(r2.text, /Osaka.*state=st-1/);
});

test('⑥ jobSafe is only what the reader declared read-only (the server\'s idempotentHint does not decide it); provenance rides on a result', async () => {
  const c = createMcpClient({ fetchImpl: statelessServer(), storage: memStore(), relayUrl: null });
  c.addServer({ name: 'Mock', url: 'https://mcp.example.com/mcp', readOnly: ['lookup'] });
  const m = (await c.searchTools('lookup')).matches.find((x) => x.tool === 'lookup');
  assert.equal(m.effects.jobSafe, true); assert.equal(m.effects.hint.idempotent, true);
  const slow = (await c.searchTools('long job')).matches.find((x) => x.tool === 'slow');
  assert.equal(slow.effects.jobSafe, false);
  const r = await c.callTool({ server: 'mock', tool: 'lookup', arguments: { q: 'a' } }, { mustBeReadOnly: true });
  assert.ok(Date.parse(r.provenance.fetchedAt) > 0); assert.equal(r.provenance.tool, 'lookup');
});

test('⑦ the relay forwards server/discover, tasks/*, and the two routing headers — nothing wider', () => {
  ['server/discover', 'tasks/get', 'tasks/update', 'tasks/cancel', 'initialize', 'tools/call'].forEach((m) => assert.ok(MCP_RELAY_METHODS.includes(m), m));
  const good = checkRelayRequest({ url: 'https://mcp.example.com/mcp', headers: { 'MCP-Method': 'tools/call', 'mcp-name': 'lookup', 'mcp-protocol-version': '2026-07-28', cookie: 'x', 'x-evil': '1' }, body: { jsonrpc: '2.0', id: 1, method: 'server/discover', params: {} } });
  assert.equal(good.ok, true);
  assert.deepEqual(Object.keys(good.headers).sort(), ['accept', 'content-type', 'mcp-method', 'mcp-name', 'mcp-protocol-version']);
  assert.equal(checkRelayRequest({ url: 'https://mcp.example.com/mcp', body: { jsonrpc: '2.0', id: 1, method: 'resources/read' } }).error, 'method_not_allowed');
});

/* ── the server ─────────────────────────────────────────────────────────────────────────────────────────── */
const ENV = { SUPABASE_URL: 'https://stub.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'stub-service-key' };
globalThis.Deno = { env: { get: (n) => ENV[n] || '' }, serve: () => {} };
const FN = await import(modUrl('supabase/functions/mcp-server/index.ts'));
const H = await import(modUrl('supabase/functions/mcp-server/handler.js'));
const KEY = 'imk_' + 'b'.repeat(64);
const KEY_HASH = await H.sha256Hex(KEY);
function fakeDb() {
  globalThis.fetch = async (url, init) => {
    const name = String(url).split('/rpc/')[1]; const o = (d) => new Response(JSON.stringify(d), { status: 200 });
    if (name === 'mcp_authorize') return o(init && JSON.parse(String(init.body)).p_key_hash === KEY_HASH ? [{ ok: true, reason: 'ok', key_id: 'k1', daily_limit: 500 }] : [{ ok: false, reason: 'invalid_key' }]);
    if (name === 'relay_take') return o([{ allowed: true, remaining: 5 }]);
    if (name === 'world_graph_find') return o([{ ref: 'terminal:sakai' }]);
    if (name === 'world_graph_subgraph') return o({ nodes: [], edges: [], claims: [] });
    if (name === 'world_graph_near') return o([]);
    return new Response('{}', { status: 404 });
  };
}
const meta = () => ({ _meta: { [META + 'protocolVersion']: '2026-07-28', [META + 'clientCapabilities']: {}, [META + 'clientInfo']: { name: 't', version: '1' } } });
const stl = (method, params, headers) => new Request('https://stub.supabase.test/functions/v1/mcp-server', {
  method: 'POST',
  headers: { authorization: 'Bearer ' + KEY, 'content-type': 'application/json', 'mcp-protocol-version': '2026-07-28', 'mcp-method': method, ...(headers || {}) },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: Object.assign(meta(), params || {}) }),
});

test('⑧ the server: server/discover, resultType, ttl, no session — and the old dialect untouched', async () => {
  fakeDb();
  const d = await (await FN.handle(stl('server/discover'))).json();
  assert.equal(d.result.resultType, 'complete');
  assert.ok(d.result.supportedVersions.includes('2026-07-28') && d.result.supportedVersions.includes('2025-06-18'));
  assert.equal(d.result.cacheScope, 'public'); assert.equal(d.result.ttlMs, H.LIST_TTL_MS);
  assert.equal(d.result._meta[META + 'serverInfo'].name, 'intmap');
  const res = await FN.handle(stl('tools/list'));
  assert.equal(res.headers.get('mcp-session-id'), null, 'the server issues no session id');
  const l = (await res.json()).result;
  assert.equal(l.resultType, 'complete'); assert.equal(l.ttlMs, H.LIST_TTL_MS); assert.ok(l.tools.length >= 6);
  const c = await (await FN.handle(stl('tools/call', { name: 'intmap_capabilities', arguments: {} }, { 'mcp-name': 'intmap_capabilities', 'mcp-session-id': 'ignored-if-sent' }))).json();
  assert.equal(c.result.resultType, 'complete'); assert.equal(c.result.structuredContent.untrusted_data, true);
  /* the 2025 dialect: no resultType, initialize and ping still answer */
  const init = await (await FN.handle(new Request('https://x.test/', { method: 'POST', headers: { authorization: 'Bearer ' + KEY }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) }))).json();
  assert.equal(init.result.protocolVersion, '2025-06-18'); assert.equal(init.result.resultType, undefined);
});

test('⑧ the server: a header that disagrees with the body is 400 -32020; an unknown newer version is 400 -32022; an unknown method is 404', async () => {
  fakeDb();
  let r = await FN.handle(stl('tools/list', null, { 'mcp-protocol-version': '2025-06-18' }));
  assert.equal(r.status, 200, 'a legacy version header with a stray _meta is just the old dialect');
  r = await FN.handle(stl('tools/call', { name: 'intmap_gis_ops', arguments: {} }, { 'mcp-name': 'something_else' }));
  assert.equal(r.status, 400); assert.equal((await r.json()).error.code, -32020);
  r = await FN.handle(stl('tools/list', null, { 'mcp-method': 'tools/call' }));
  assert.equal(r.status, 400); assert.equal((await r.json()).error.code, -32020);
  r = await FN.handle(new Request('https://x.test/', { method: 'POST', headers: { authorization: 'Bearer ' + KEY, 'mcp-protocol-version': '2099-01-01' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }));
  const e = (await r.json()).error;
  assert.equal(r.status, 400); assert.equal(e.code, -32022); assert.ok(e.data.supported.includes('2026-07-28'));
  r = await FN.handle(new Request('https://x.test/', { method: 'POST', headers: { authorization: 'Bearer ' + KEY }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: meta() }) }));
  assert.equal(r.status, 400, 'a 2026 _meta without the mandatory header is a mismatch'); assert.equal((await r.json()).error.code, -32020);
  r = await FN.handle(stl('ping'));
  assert.equal(r.status, 404, 'ping is gone in 2026-07-28'); assert.equal((await r.json()).error.code, -32601);
  r = await FN.handle(stl('initialize'));
  assert.equal(r.status, 404, 'no initialize in 2026-07-28');
});

test('⑨ every tool the server offers states its effects, none writes, and structuredContent conforms to its outputSchema', async () => {
  fakeDb();
  const tools = (await (await FN.handle(stl('tools/list'))).json()).result.tools;
  for (const t of tools) {
    const fx = t._meta && t._meta['io.intmap/effects'];
    assert.ok(fx, t.name + ' declares its effects');
    assert.equal(fx.writes, false, t.name + ' must not write (a write tool needs identity + scope + confirmation first)');
    assert.equal(fx.stores, false, t.name);
    assert.equal(t.annotations.readOnlyHint, true); assert.equal(t.annotations.destructiveHint, false); assert.equal(t.annotations.openWorldHint, false);
    assert.equal(t.outputSchema.required.join(), 'untrusted_data,source,data');
  }
  const cap = (await (await FN.handle(stl('tools/call', { name: 'intmap_capabilities', arguments: {} }))).json()).result.structuredContent;
  assert.deepEqual(cap.data.tools.map((t) => t.name).sort(), tools.map((t) => t.name).sort(), 'the self-description is derived from the declarations, not a second list');
  assert.ok(cap.data.not_offered.some((x) => /write/.test(x.what)), 'what is deliberately not offered is said');
  const fnd = (await (await FN.handle(stl('tools/call', { name: 'intmap_world_find', arguments: { query: 'sakai' } }))).json()).result.structuredContent;
  assert.equal(fnd.untrusted_data, true); assert.equal(typeof fnd.source, 'string'); assert.ok('data' in fnd);
});

test('⑩ the client talks to the real server handler in both dialects', async () => {
  fakeDb();
  const viaHandler = (u, init) => FN.handle(new Request(u, init));
  const c = createMcpClient({ fetchImpl: viaHandler, storage: memStore(), relayUrl: null });
  c.addServer({ name: 'IntMap', url: 'https://stub.supabase.test/functions/v1/mcp-server', authToken: KEY, readOnly: true });
  const r = await c.callTool({ server: 'intmap', tool: 'intmap_capabilities' }, { mustBeReadOnly: true });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.provenance.protocol, '2026-07-28', 'discover answered → stateless');
  assert.match(r.text, /untrusted_data/);
  assert.equal(c._live.intmap.toolsTtlMs, H.LIST_TTL_MS, 'the server\'s ttl is honoured');
  /* the same server seen as an old one (a front that drops the new headers/_meta): the client falls back and still works */
  const legacyView = (u, init) => { const b = JSON.parse(init.body); const h = { ...init.headers }; delete h['mcp-protocol-version']; delete h['mcp-method']; delete h['mcp-name']; if (b.params) delete b.params._meta; if (b.method === 'server/discover') return Promise.resolve(jsonRes({ jsonrpc: '2.0', id: b.id, error: { code: -32601, message: 'x' } }, 404)); return FN.handle(new Request(u, { ...init, headers: h, body: JSON.stringify(b) })); };
  const c2 = createMcpClient({ fetchImpl: legacyView, storage: memStore(), relayUrl: null });
  c2.addServer({ name: 'IntMap', url: 'https://stub.supabase.test/functions/v1/mcp-server', authToken: KEY, readOnly: true });
  const r2 = await c2.callTool({ server: 'intmap', tool: 'intmap_capabilities' }, { mustBeReadOnly: true });
  assert.equal(r2.ok, true, r2.message); assert.match(r2.provenance.protocol, /^legacy:/);
});
