/* (mcp-oauth) «Same site» is the Public Suffix List's registrable domain, not the last two labels. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registrableDomain, publicSuffix, sameRegistrableDomain } from '../js/public-suffix.js';
import { discover } from '../js/atlas-mcp-oauth.js';

test('registrable domain follows the list (multi-label suffixes, wildcards, exceptions, private suffixes, IPs)', () => {
  assert.equal(registrableDomain('mcp.linear.app'), 'linear.app');
  assert.equal(registrableDomain('a.b.co.jp'), 'b.co.jp');
  assert.equal(registrableDomain('x.example.co.uk'), 'example.co.uk');
  assert.equal(registrableDomain('co.jp'), '', 'a public suffix has no registrable domain');
  assert.equal(registrableDomain('a.github.io'), 'a.github.io', 'private-section suffixes count');
  assert.equal(publicSuffix('foo.bar.ck'), 'bar.ck', 'wildcard *.ck');
  assert.equal(publicSuffix('www.ck'), 'ck', 'exception !www.ck');
  assert.equal(registrableDomain('xn--fiqs8s.xn--fiqs8s'), 'xn--fiqs8s.xn--fiqs8s');
  assert.equal(registrableDomain('10.0.0.1'), '');
  assert.equal(registrableDomain('localhost'), '');
});
test('a.co.jp and b.co.jp are not one site; a.github.io and b.github.io are not one site; subdomains of one organisation are', () => {
  assert.equal(sameRegistrableDomain('a.co.jp', 'b.co.jp'), false);
  assert.equal(sameRegistrableDomain('a.github.io', 'b.github.io'), false);
  assert.equal(sameRegistrableDomain('a.com.au', 'b.com.au'), false);
  assert.equal(sameRegistrableDomain('mcp.notion.com', 'api.notion.com'), true);
  assert.equal(sameRegistrableDomain('10.0.0.1', '10.0.0.1'), true);
  assert.equal(sameRegistrableDomain('10.0.0.1', '10.0.0.2'), false);
});
test('discover() refuses a token endpoint on a different organisation under the same two-label suffix', async () => {
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url)); const u = new URL(url);
    if (u.pathname.startsWith('/.well-known/oauth-protected-resource')) return json({ resource: 'https://a.co.jp/mcp', authorization_servers: ['https://auth.a.co.jp'] });
    if (u.pathname === '/.well-known/oauth-authorization-server') return json({ issuer: 'https://auth.a.co.jp', authorization_endpoint: 'https://auth.a.co.jp/authorize', token_endpoint: 'https://evil.b.co.jp/token', code_challenge_methods_supported: ['S256'] });
    return new Response('', { status: 404 });
  };
  await assert.rejects(() => discover(fetchImpl, { serverUrl: 'https://a.co.jp/mcp' }), (e) => e.code === 'oauth_endpoint_mismatch');
  assert.ok(!calls.some((c) => c.includes('evil.b.co.jp')));
});

/* ── Client ID Metadata Documents (MCP 2026-07-28's preferred client identity) ── */
import { registerClient, clientMetadataDocument, CLIENT_METADATA_FILE, buildAuthUrl } from '../js/atlas-mcp-oauth.js';
import { siteUrlPlugin } from '../scripts/site-url.mjs';
import { SITE_URL } from '../supabase/functions/_shared/site-origin.js';

const CB = 'https://x.example/app/mcp-oauth-callback.html';
const DOC = 'https://x.example/app/' + CLIENT_METADATA_FILE;
const meta = (o) => Object.assign({ authorizationEndpoint: 'https://as.example/authorize', resource: 'https://as.example/mcp', registrationEndpoint: 'https://as.example/register' }, o);

test('CIMD: a server that advertises support gets the document address as client_id, with no registration call', async () => {
  let calls = 0;
  const r = await registerClient(async () => { calls++; throw new Error('must not be called'); }, meta({ clientIdMetadataSupported: true }), { redirectUri: CB, clientMetadata: { url: DOC, redirectUri: CB } });
  assert.deepEqual(r, { clientId: DOC, via: 'metadata-document' });
  assert.equal(calls, 0);
  const a = await buildAuthUrl(meta({}), { clientId: r.clientId, redirectUri: CB, randomBytes: (n) => new Uint8Array(n).fill(7), sha256: async () => new Uint8Array(32) });
  assert.equal(new URL(a.url).searchParams.get('client_id'), DOC);
});
test('CIMD: no support, or a callback the document does not list (local/preview origin), falls back to registration', async () => {
  const reg = async () => new Response(JSON.stringify({ client_id: 'dcr-1' }), { status: 201, headers: { 'content-type': 'application/json' } });
  assert.equal((await registerClient(reg, meta({ clientIdMetadataSupported: false }), { redirectUri: CB, clientMetadata: { url: DOC, redirectUri: CB } })).via, 'registration');
  assert.equal((await registerClient(reg, meta({ clientIdMetadataSupported: true }), { redirectUri: 'http://127.0.0.1:4173/mcp-oauth-callback.html', clientMetadata: { url: DOC, redirectUri: CB } })).clientId, 'dcr-1');
});
test('CIMD: the build emits the document, its client_id is its own address and its redirect is the callback page', () => {
  const emitted = [];
  const plugin = siteUrlPlugin({ SITE_URL, CUSTOM_DOMAIN: '' });
  plugin.generateBundle.call({ emitFile: (f) => emitted.push(f) });
  const f = emitted.find((e) => e.fileName === CLIENT_METADATA_FILE);
  assert.ok(f, 'mcp-client-metadata.json is emitted');
  const d = JSON.parse(f.source);
  assert.equal(d.client_id, SITE_URL + CLIENT_METADATA_FILE);
  assert.deepEqual(d.redirect_uris, [SITE_URL + 'mcp-oauth-callback.html']);
  assert.equal(d.token_endpoint_auth_method, 'none');
  assert.deepEqual(d, clientMetadataDocument(d.client_id, d.redirect_uris[0]));
});
