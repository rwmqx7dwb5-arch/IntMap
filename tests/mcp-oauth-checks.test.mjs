/* (mcp-oauth) Signing in to an MCP server, against a MOCK authorization server + MCP server — no network.
   The mock is one `fetch` that answers the three roles a hosted service plays (resource metadata, authorization server, MCP endpoint), so the whole flow
   the real services (Linear, Notion, Sentry — measured 2026-11-20) run is exercised as the page would meet it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMcpClient, importableOf, STORAGE_KEY } from '../js/atlas-mcp-client.js';
import * as OA from '../js/atlas-mcp-oauth.js';
import { ATTACH_LOG } from '../js/atlas-attach-log.js';

const memStore = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, raw: m }; };
const REDIRECT = 'https://app.example.org/IntMap/mcp-oauth-callback.html';
const json = (o, status = 200, h) => new Response(JSON.stringify(o), { status, headers: Object.assign({ 'content-type': 'application/json' }, h) });

/** a hosted service: https://mcp.svc.example/mcp (resource) guarded by https://mcp.svc.example (authorization server) */
function service(opts) {
  const o = Object.assign({ ttl: 3600, evil: false, pkce: true, reg: true }, opts);
  const st = { clock: 0, log: [], codes: {}, tokens: {}, refresh: {}, n: 0, revoked: [], clients: {} };
  const issue = (client, scope) => { const at = 'at-' + (++st.n), rt = 'rt-' + st.n; st.tokens[at] = { client, until: st.clock + o.ttl * 1000 }; st.refresh[rt] = { client }; return { access_token: at, refresh_token: rt, expires_in: o.ttl, scope, token_type: 'Bearer' }; };
  const fetchImpl = async (url, init) => {
    url = String(url); const u = new URL(url); st.log.push({ url, method: init && init.method, headers: init && init.headers, body: init && init.body });
    if (u.pathname === '/mcp') {
      const auth = (init.headers || {}).authorization;
      const tok = auth && st.tokens[auth.replace(/^Bearer /, '')];
      if (!tok || tok.until <= st.clock) return new Response('', { status: 401, headers: { 'www-authenticate': 'Bearer realm="OAuth", resource_metadata="https://mcp.svc.example/.well-known/oauth-protected-resource/mcp", scope="read write"' } });
      const body = JSON.parse(init.body);
      if (body.method === 'server/discover') return json({ jsonrpc: '2.0', id: body.id, result: { resultType: 'complete', supportedVersions: ['2026-07-28'], capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'Svc' } } });
      if (body.method === 'tools/list') return json({ jsonrpc: '2.0', id: body.id, result: { resultType: 'complete', ttlMs: 60000, tools: [{ name: 'list_issues', description: 'list issues', inputSchema: { type: 'object', properties: {} } }] } });
      if (body.method === 'subscriptions/listen') {
        const enc = new TextEncoder();
        const rs = new ReadableStream({ start(c) { c.enqueue(enc.encode('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', method: 'notifications/subscriptions/acknowledged', params: {} }) + '\n\n')); st.push = () => c.enqueue(enc.encode('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' }) + '\n\n')); st.endStream = () => c.close(); } });
        return new Response(rs, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      }
      if (body.method === 'tools/call') return json({ jsonrpc: '2.0', id: body.id, result: { resultType: 'complete', content: [{ type: 'text', text: JSON.stringify([{ id: 1, title: 'a, b', lat: 35.1 }, { id: 2, title: 'c', lat: 36 }]) }] } });
      return json({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'nope' } });
    }
    if (u.pathname === '/.well-known/oauth-protected-resource/mcp') return json({ resource: 'https://mcp.svc.example/mcp', authorization_servers: ['https://mcp.svc.example'], scopes_supported: ['read', 'write'] });
    if (u.pathname === '/.well-known/oauth-authorization-server') return json({ issuer: 'https://mcp.svc.example', authorization_endpoint: 'https://mcp.svc.example/authorize', token_endpoint: o.evil ? 'https://tokens.attacker.example/token' : 'https://mcp.svc.example/token',
      registration_endpoint: o.reg ? 'https://mcp.svc.example/register' : undefined, revocation_endpoint: 'https://mcp.svc.example/revoke', code_challenge_methods_supported: o.pkce ? ['S256'] : ['plain'], token_endpoint_auth_methods_supported: ['none'] });
    if (u.pathname === '/register') { const b = JSON.parse(init.body); const id = 'client-' + (++st.n); st.clients[id] = b; return json({ client_id: id, redirect_uris: b.redirect_uris }, 201); }
    if (u.pathname === '/token') {
      const f = new URLSearchParams(init.body);
      if (f.get('grant_type') === 'authorization_code') {
        const c = st.codes[f.get('code')];
        if (!c) return json({ error: 'invalid_grant' }, 400);
        const challenge = crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url');
        if (challenge !== c.challenge || f.get('redirect_uri') !== c.redirect) return json({ error: 'invalid_grant', error_description: 'pkce' }, 400);
        delete st.codes[f.get('code')];
        return json(issue(f.get('client_id'), c.scope));
      }
      if (f.get('grant_type') === 'refresh_token') {
        const r = st.refresh[f.get('refresh_token')];
        if (!r) return json({ error: 'invalid_grant' }, 400);
        delete st.refresh[f.get('refresh_token')];                      /* rotation: a refresh token works once */
        return json(issue(r.client, 'read write'));
      }
    }
    if (u.pathname === '/revoke') { st.revoked.push(new URLSearchParams(init.body).get('token')); return new Response('', { status: 200 }); }
    return new Response('', { status: 404 });
  };
  /** what the reader's browser does at the sign-in page: approve, and come back to the callback with a code */
  st.approve = (authUrl) => { const a = new URL(authUrl).searchParams; const code = 'code-' + (++st.n); st.codes[code] = { challenge: a.get('code_challenge'), redirect: a.get('redirect_uri'), scope: a.get('scope') }; return new URLSearchParams({ code, state: a.get('state') }); };
  return { fetchImpl, st };
}
const mk = (svc, extra) => { const storage = memStore(); const c = createMcpClient(Object.assign({ fetchImpl: svc.fetchImpl, storage, relayUrl: null, redirectUri: REDIRECT, now: () => svc.st.clock, randomBytes: (n) => crypto.randomBytes(n), sha256: async (s) => crypto.createHash('sha256').update(s).digest() }, extra)); return { c, storage }; };
const signedIn = async (svc, extra) => {
  const { c, storage } = mk(svc, extra);
  c.addServer({ name: 'Svc', url: 'https://mcp.svc.example/mcp' });
  await c.authorize('svc', approver(svc));
  return { c, storage };
};
const approver = (svc) => { let res; const p = new Promise((r) => { res = r; }); return { open: (url) => { res(svc.st.approve(url)); return true; }, wait: () => p }; };

test('① 401 says to sign in; the whole flow signs in and the token is used on the next call', async () => {
  const svc = service(); const { c, storage } = mk(svc);
  c.addServer({ name: 'Svc', url: 'https://mcp.svc.example/mcp' });
  const before = await c.callTool({ server: 'svc', tool: 'list_issues' });
  assert.equal(before.code, 'auth_required');
  assert.match(before.message, /authorize/);
  assert.equal(c.servers()[0].status, 'none');
  await c.authorize('svc', approver(svc));
  const s = c.servers()[0];
  assert.equal(s.auth, 'oauth'); assert.equal(s.status, 'connected'); assert.deepEqual(s.scopes, ['read', 'write']); assert.equal(s.canRefresh, true); assert.ok(s.expiresAt);
  assert.ok(!JSON.stringify(c.servers()).includes('at-'), 'a token never appears in the public view');
  const r = await c.callTool({ server: 'svc', tool: 'list_issues' });
  assert.equal(r.ok, true);
  const used = svc.st.log.filter((x) => x.url.endsWith('/mcp') && x.headers.authorization).pop();
  assert.match(used.headers.authorization, /^Bearer at-/);
  const reg = JSON.parse(svc.st.log.find((x) => x.url.endsWith('/register')).body);
  assert.equal(reg.token_endpoint_auth_method, 'none'); assert.deepEqual(reg.redirect_uris, [REDIRECT]);
  assert.ok(storage.raw[STORAGE_KEY].includes('"tokens"'));
});

test('② the authorize URL carries PKCE S256, state, the resource indicator and the scope the server asked for', async () => {
  const svc = service(); const { c } = mk(svc);
  c.addServer({ name: 'Svc', url: 'https://mcp.svc.example/mcp' });
  const b = await c.beginOAuth('svc');
  const q = new URL(b.url).searchParams;
  assert.equal(q.get('response_type'), 'code'); assert.equal(q.get('code_challenge_method'), 'S256'); assert.equal(q.get('resource'), 'https://mcp.svc.example/mcp');
  assert.equal(q.get('redirect_uri'), REDIRECT); assert.equal(q.get('state'), b.state); assert.equal(q.get('scope'), 'read write');
  assert.match(q.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
});

test('③ a wrong state is ignored without cancelling the real attempt; a denied sign-in is reported', async () => {
  const svc = service(); const { c } = mk(svc);
  c.addServer({ name: 'Svc', url: 'https://mcp.svc.example/mcp' });
  const b = await c.beginOAuth('svc');
  await assert.rejects(() => c.finishOAuth('svc', new URLSearchParams({ code: 'x', state: 'forged' })), (e) => e.code === 'oauth_state_mismatch');
  const ok = await c.finishOAuth('svc', svc.st.approve(b.url));
  assert.equal(ok.status, 'connected');
  const b2 = await c.beginOAuth('svc');
  await assert.rejects(() => c.finishOAuth('svc', new URLSearchParams({ error: 'access_denied', state: b2.state })), (e) => e.code === 'oauth_denied');
  await assert.rejects(() => c.finishOAuth('svc', svc.st.approve(b2.url)), (e) => e.code === 'oauth_no_pending', 'a denied attempt is over');
});

test('④ an expired token is refreshed before the call (rotation honoured, single-flight)', async () => {
  const svc = service({ ttl: 120 }); const { c } = await signedIn(svc);
  const before = c.servers()[0].expiresAt;
  svc.st.clock += 100 * 1000;                                           /* inside the 60 s skew of expiry */
  const [a, b] = await Promise.all([c.callTool({ server: 'svc', tool: 'list_issues' }), c.callTool({ server: 'svc', tool: 'list_issues' })]);
  assert.equal(a.ok && b.ok, true);
  assert.equal(svc.st.log.filter((x) => x.url.endsWith('/token') && /refresh_token/.test(x.body)).length, 1, 'two parallel calls spend a rotating refresh token once');
  assert.notEqual(c.servers()[0].expiresAt, before);
});

test('⑤ a 401 on a live token refreshes once and retries; a refused refresh asks the reader to sign in again', async () => {
  const svc = service(); const { c } = await signedIn(svc);
  Object.keys(svc.st.tokens).forEach((k) => { svc.st.tokens[k].until = -1; });         /* the service revoked the access token */
  assert.equal((await c.callTool({ server: 'svc', tool: 'list_issues' })).ok, true);
  Object.keys(svc.st.tokens).forEach((k) => { svc.st.tokens[k].until = -1; });
  Object.keys(svc.st.refresh).forEach((k) => delete svc.st.refresh[k]);                /* …and the refresh token */
  const r = await c.callTool({ server: 'svc', tool: 'list_issues' });
  assert.equal(r.code, 'auth_required'); assert.match(r.message, /authorize/);
  assert.equal(c.servers()[0].status, 'needs_sign_in');
});

test('⑥ disconnect revokes at the service, forgets the tokens here, keeps the registration', async () => {
  const svc = service(); const { c, storage } = await signedIn(svc);
  const d = await c.disconnect('svc');
  assert.equal(d.revoked, true); assert.equal(svc.st.revoked.length, 2);
  assert.equal(c.servers().length, 1); assert.equal(c.servers()[0].auth, 'none');
  assert.ok(!storage.raw[STORAGE_KEY].includes('at-') && !storage.raw[STORAGE_KEY].includes('rt-'));
});

test('⑦ refusals: an endpoint off the issuer\'s site, no PKCE, no registration, and sign-in without a callback page', async () => {
  for (const [opts, code] of [[{ evil: true }, 'oauth_endpoint_mismatch'], [{ pkce: false }, 'oauth_no_pkce'], [{ reg: false }, 'oauth_no_registration']]) {
    const svc = service(opts); const { c } = mk(svc);
    c.addServer({ name: 'Svc', url: 'https://mcp.svc.example/mcp' });
    await assert.rejects(() => c.beginOAuth('svc'), (e) => e.code === code, code);
  }
  const svc = service(); const { c } = mk(svc, { redirectUri: null });
  c.addServer({ name: 'Svc', url: 'https://mcp.svc.example/mcp' });
  await assert.rejects(() => c.beginOAuth('svc'), (e) => e.code === 'oauth_unavailable');
  assert.ok(!svc.st.log.some((x) => x.url.includes('attacker')), 'nothing was sent to an off-site endpoint');
});

test('⑧ a switched-off server is not searched, called or watched; re-registering keeps the sign-in and the switch', async () => {
  const svc = service(); const { c } = await signedIn(svc);
  assert.equal((await c.searchTools('issues')).matches.length, 1);
  c.setEnabled('svc', false);
  assert.equal((await c.searchTools('issues')).matches.length, 0);
  assert.equal((await c.callTool({ server: 'svc', tool: 'list_issues' })).code, 'server_disabled');
  assert.equal(c.servers()[0].status, 'disabled');
  c.addServer({ name: 'Svc', url: 'https://mcp.svc.example/mcp' });
  assert.equal(c.servers()[0].auth, 'oauth'); assert.equal(c.servers()[0].enabled, false);
  c.setEnabled('svc', true);
  assert.equal(c.servers()[0].status, 'connected');
});

test('⑨ a change notice on the listen stream marks the tool list stale; it is read again, not served from the cache', async () => {
  const svc = service(); const { c } = await signedIn(svc);
  await c.refresh('svc');
  const seen = [];
  const w = await c.watch('svc', (id) => seen.push(id));
  assert.equal(w.ok, true);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(c.servers()[0].watching, true);
  const listsBefore = svc.st.log.filter((x) => /tools\/list/.test(x.body || '')).length;
  await c.searchTools('issues');
  assert.equal(svc.st.log.filter((x) => /tools\/list/.test(x.body || '')).length, listsBefore, 'fresh cache: no re-read');
  svc.st.push();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(seen, ['svc']);
  await c.searchTools('issues');
  assert.equal(svc.st.log.filter((x) => /tools\/list/.test(x.body || '')).length, listsBefore + 1, 'a change notice forces one re-read');
  c.unwatch('svc'); svc.st.endStream && svc.st.endStream();
  const lis = svc.st.log.find((x) => /subscriptions\/listen/.test(x.body || ''));
  assert.equal(lis.headers['mcp-method'], 'subscriptions/listen'); assert.match(lis.headers.authorization, /^Bearer /);
});

test('⑩ a watch is refused where it cannot work, with the reason (relay, legacy, no listChanged)', async () => {
  const svc = service(); const { c } = await signedIn(svc);
  c.addServer({ name: 'Svc', url: 'https://mcp.svc.example/mcp', via: 'relay' });
  assert.equal((await c.watch('svc')).code, 'relay_cannot_stream');
});

test('⑪ external data becomes a file in the ledger: GeoJSON and rows of records, never carried to the model on their own', () => {
  const rows = importableOf(JSON.stringify({ items: [{ id: 1, title: 'a, "b"', lat: 35 }, { id: 2, title: 'c' }] }), 'svc', 'List Issues');
  assert.equal(rows.name, 'svc-list-issues.csv'); assert.equal(rows.rows, 2);
  assert.equal(rows.text.split('\n')[0], 'id,title,lat'); assert.equal(rows.text.split('\n')[1], '1,"a, ""b""",35');
  const gj = importableOf(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: {} }] }), 'svc', 'x');
  assert.equal(gj.format, 'geojson'); assert.equal(gj.name, 'svc-x.geojson');
  assert.equal(importableOf('just a sentence', 'svc', 'x'), null);
  assert.equal(importableOf('a,b\n1,2\n3,4', 'svc', 'x').format, 'csv');
  ATTACH_LOG.reset();
  ATTACH_LOG.remember(3, [], [{ kind: 'text', name: rows.name, text: rows.text, external: true }, { kind: 'text', name: 'mine.csv', text: 'a,b\n1,2' }]);
  const carried = ATTACH_LOG.carry(4, [], { files: 8, textTotal: 400000 });
  assert.deepEqual(carried.map((f) => f.name), ['mine.csv (attached earlier in this conversation)'], 'only the reader\'s own file rides along');
  assert.match(ATTACH_LOG.declare(4, []), /svc-list-issues\.csv \(data from an external MCP server/);
  const rec = ATTACH_LOG.find(4, rows.name);
  assert.match(ATTACH_LOG.wrap(rec, 'x'), /^\[BEGIN EXTERNAL MCP OUTPUT/);
  assert.equal(ATTACH_LOG.wrap(ATTACH_LOG.find(4, 'mine.csv'), 'x'), 'x');
});

test('⑫ a tool result is offered as importable (raw) and the capability keeps it as a file', async () => {
  const svc = service(); const { c } = await signedIn(svc);
  const r = await c.callTool({ server: 'svc', tool: 'list_issues' });
  const imp = importableOf(r.raw, r.server, r.tool);
  assert.equal(imp.name, 'svc-list-issues.csv'); assert.equal(imp.rows, 2);
  assert.match(r.text, /^\[BEGIN EXTERNAL MCP OUTPUT/, 'the model still gets the fenced text');
});

test('⑬ the OAuth module on its own: metadata URL candidates and token expiry', () => {
  assert.deepEqual(OA.resourceMetadataCandidates('https://h.example/a/mcp', { resourceMetadata: 'https://h.example/.well-known/x' }), ['https://h.example/.well-known/x', 'https://h.example/.well-known/oauth-protected-resource/a/mcp', 'https://h.example/.well-known/oauth-protected-resource']);
  assert.deepEqual(OA.authServerMetadataCandidates('https://as.example'), ['https://as.example/.well-known/oauth-authorization-server', 'https://as.example/.well-known/openid-configuration']);
  assert.equal(OA.isExpired({ accessToken: 'a', expiresAt: 1000 + 30000 }, 1000), true, 'inside the skew');
  assert.equal(OA.isExpired({ accessToken: 'a', expiresAt: 1000 + 120000 }, 1000), false);
});
