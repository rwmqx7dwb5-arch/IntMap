/* ============================================================================
 *  IntMap · Atlas — OAuth for MCP servers   (js/atlas-mcp-oauth.js)   (mcp-oauth)
 * ----------------------------------------------------------------------------
 *  A hosted MCP server (Linear, Notion, Sentry, GitHub …) answers 401 with a WWW-Authenticate `resource_metadata`
 *  address. This module is the whole of MCP's authorization flow for a browser client (spec: basic/authorization):
 *
 *    ① protected-resource metadata (RFC 9728)   → which authorization server guards the endpoint
 *    ② authorization-server metadata (RFC 8414, or OpenID configuration)   → its endpoints and what it supports
 *    ③ dynamic client registration (RFC 7591)   → a PUBLIC client (no secret) for IntMap's own callback page
 *    ④ authorization code + PKCE S256, with `state` and the `resource` indicator (RFC 8707)
 *    ⑤ code → tokens, refresh when they expire, revoke on disconnect
 *
 *  ⚠ PURE: no DOM, no storage. `fetchImpl`, `randomBytes` and `sha256` are injected so the node tests drive the whole
 *  flow against a mock authorization server (tests/mcp-oauth-checks.test.mjs); js/atlas-mcp-client.js owns where the
 *  result is kept (the same device-only record as a pasted token — one credential store, one ledger row).
 *
 *  ⚠ WHERE A CREDENTIAL GOES (measured against Linear, Notion and Sentry, 2026-11-20): the browser reaches each
 *  server's metadata, /register and /token endpoints directly (they answer CORS for the site's origin), so a token is
 *  sent to exactly two places — the authorization server's token endpoint (to get / refresh it) and the MCP endpoint
 *  it was issued for (as `Authorization: Bearer`; through the mcp-relay Edge Function only when that server refuses browser calls, and then only
 *  forwarded to that same server, never stored). OAuth's own endpoints are never relayed: a server that blocks them is reported, not bypassed.
 *  Nothing is sent to a third address a metadata document names: every endpoint this module will call is checked to be an https
 *  address on the SAME registrable site as the issuer, or is refused (`oauth_endpoint_mismatch`).
 * ==========================================================================*/

export class OAuthError extends Error {
  constructor(code, message, extra) { super(message || code); this.name = 'OAuthError'; this.code = code; if (extra) Object.assign(this, extra); }
}

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩]/g, '').slice(0, n || 300);
export const CLIENT_NAME = 'IntMap Atlas';
const REFRESH_SKEW_MS = 60 * 1000;      /* refresh a minute early: a token that expires mid-request is a failed request */
const DEFAULT_TTL_S = 3600;             /* a token response with no expires_in: assume an hour and say so (expiresAssumed) */

function b64url(bytes) {
  let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** PKCE (RFC 7636): a 43-character verifier from 32 random bytes and its S256 challenge. */
export async function pkcePair(randomBytes, sha256) {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(await sha256(verifier)), method: 'S256' };
}
export const randomState = (randomBytes) => b64url(randomBytes(16));

/** The last two labels of a host — the unit «same site» is judged in. (A public-suffix list would be exact; two labels is the strict side for the
 *  hosted MCP services measured, and a mismatch is refused with a reason, never accepted.) */
const siteOf = (host) => { const p = String(host).toLowerCase().split('.'); return p.length <= 2 ? p.join('.') : p.slice(-2).join('.'); };
function httpsUrl(raw, what) {
  let u; try { u = new URL(String(raw || '')); } catch (_) { throw new OAuthError('oauth_bad_metadata', what + ' is not a URL.'); }
  if (u.protocol !== 'https:' || u.username || u.password) throw new OAuthError('oauth_bad_metadata', what + ' must be an https address without credentials.');
  return u;
}
function sameSite(url, issuer, what) {
  const u = httpsUrl(url, what), i = httpsUrl(issuer, 'the issuer');
  if (siteOf(u.hostname) !== siteOf(i.hostname)) throw new OAuthError('oauth_endpoint_mismatch', what + ' (' + clean(u.hostname, 80) + ') is not on the authorization server\'s own site (' + clean(i.hostname, 80) + '); refusing to send anything there.');
  return u.toString();
}

async function getJson(fetchImpl, url, what, signal) {
  let r;
  try { r = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal }); }
  catch (e) { throw new OAuthError('oauth_unreachable', 'Could not read ' + what + ' — the server is unreachable or does not allow this page to read it (CORS).'); }
  if (!r.ok) throw new OAuthError('oauth_no_metadata', what + ' answered HTTP ' + r.status + '.', { status: r.status });
  try { return await r.json(); } catch (_) { throw new OAuthError('oauth_bad_metadata', what + ' is not JSON.'); }
}

/** The metadata URLs to try for a resource, in the spec's order: the challenge's resource_metadata, then the well-known path-suffixed, then the root. */
export function resourceMetadataCandidates(serverUrl, challenge) {
  const out = [];
  if (challenge && challenge.resourceMetadata) out.push(challenge.resourceMetadata);
  const u = new URL(serverUrl);
  const path = u.pathname.replace(/\/+$/, '');
  if (path) out.push(u.origin + '/.well-known/oauth-protected-resource' + path);
  out.push(u.origin + '/.well-known/oauth-protected-resource');
  return Array.from(new Set(out));
}
/** Authorization-server metadata URLs (RFC 8414 insertion, then OpenID). */
export function authServerMetadataCandidates(issuer) {
  const u = new URL(issuer); const path = u.pathname.replace(/\/+$/, '');
  return path
    ? [u.origin + '/.well-known/oauth-authorization-server' + path, u.origin + '/.well-known/openid-configuration' + path, u.origin + path + '/.well-known/openid-configuration']
    : [u.origin + '/.well-known/oauth-authorization-server', u.origin + '/.well-known/openid-configuration'];
}

/**
 * discover({ serverUrl, challenge }) → { resource, issuer, authorizationEndpoint, tokenEndpoint, registrationEndpoint?, revocationEndpoint?, scopesSupported, scope, authMethods }
 * Every endpoint is checked to belong to the issuer's site. A server that does not offer PKCE S256 is refused (the flow cannot be made safe without it).
 */
export async function discover(fetchImpl, { serverUrl, challenge, signal }) {
  let prm = null, lastErr = null;
  for (const c of resourceMetadataCandidates(serverUrl, challenge)) {
    try { httpsUrl(c, 'the resource-metadata address'); prm = await getJson(fetchImpl, c, 'the server\'s OAuth resource metadata', signal); if (prm && Array.isArray(prm.authorization_servers) && prm.authorization_servers.length) break; prm = null; }
    catch (e) { lastErr = e; }
  }
  if (!prm) throw lastErr instanceof OAuthError ? lastErr : new OAuthError('oauth_no_metadata', 'The server does not publish OAuth resource metadata, so it cannot be connected by sign-in. Paste an access token instead.');
  const issuer = clean(prm.authorization_servers[0], 300);
  httpsUrl(issuer, 'the authorization server');
  let meta = null; lastErr = null;
  for (const c of authServerMetadataCandidates(issuer)) {
    try { meta = await getJson(fetchImpl, c, 'the authorization server\'s metadata', signal); if (meta && meta.authorization_endpoint && meta.token_endpoint) break; meta = null; }
    catch (e) { lastErr = e; }
  }
  if (!meta) throw lastErr instanceof OAuthError ? lastErr : new OAuthError('oauth_no_metadata', 'The authorization server publishes no metadata.');
  if (Array.isArray(meta.code_challenge_methods_supported) && !meta.code_challenge_methods_supported.includes('S256')) throw new OAuthError('oauth_no_pkce', 'The authorization server does not offer PKCE (S256); IntMap will not sign in without it.');
  const metaIssuer = meta.issuer ? clean(meta.issuer, 300) : issuer;
  const scopesSupported = Array.isArray(prm.scopes_supported) ? prm.scopes_supported.map((s) => clean(s, 60)).slice(0, 40) : (Array.isArray(meta.scopes_supported) ? meta.scopes_supported.map((s) => clean(s, 60)).slice(0, 40) : []);
  return {
    resource: clean(prm.resource || new URL(serverUrl).origin + new URL(serverUrl).pathname, 300),
    issuer: metaIssuer,
    authorizationEndpoint: sameSite(meta.authorization_endpoint, metaIssuer, 'the authorization endpoint'),
    tokenEndpoint: sameSite(meta.token_endpoint, metaIssuer, 'the token endpoint'),
    registrationEndpoint: meta.registration_endpoint ? sameSite(meta.registration_endpoint, metaIssuer, 'the registration endpoint') : undefined,
    revocationEndpoint: meta.revocation_endpoint ? sameSite(meta.revocation_endpoint, metaIssuer, 'the revocation endpoint') : undefined,
    scopesSupported,
    scope: challenge && challenge.scope ? clean(challenge.scope, 200) : scopesSupported.join(' '),
    authMethods: Array.isArray(meta.token_endpoint_auth_methods_supported) ? meta.token_endpoint_auth_methods_supported.map((s) => clean(s, 40)) : ['client_secret_basic'],
  };
}

/** RFC 7591 registration of a PUBLIC client for this page's callback. → { clientId } */
export async function registerClient(fetchImpl, meta, { redirectUri, signal }) {
  if (!meta.registrationEndpoint) throw new OAuthError('oauth_no_registration', 'This authorization server does not allow IntMap to register itself (no dynamic client registration), and IntMap has no pre-registered client for it. Paste an access token instead.');
  let r;
  try {
    r = await fetchImpl(meta.registrationEndpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal,
      body: JSON.stringify({ client_name: CLIENT_NAME, redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: meta.scope || undefined }) });
  } catch (_) { throw new OAuthError('oauth_unreachable', 'Could not reach the registration endpoint (the server unreachable or CORS).'); }
  let j = null; try { j = await r.json(); } catch (_) { j = null; }
  if (!r.ok || !j || !j.client_id) throw new OAuthError('oauth_registration_failed', 'Client registration was refused (HTTP ' + r.status + (j && j.error ? ', ' + clean(j.error, 80) : '') + ').');
  return { clientId: clean(j.client_id, 200) };
}

/** → { url, state, verifier } — the address the reader signs in at. `state` and the verifier are kept by the caller until the callback. */
export async function buildAuthUrl(meta, { clientId, redirectUri, randomBytes, sha256, scope }) {
  const { verifier, challenge, method } = await pkcePair(randomBytes, sha256);
  const state = randomState(randomBytes);
  const u = new URL(meta.authorizationEndpoint);
  const p = u.searchParams;
  p.set('response_type', 'code'); p.set('client_id', clientId); p.set('redirect_uri', redirectUri);
  p.set('code_challenge', challenge); p.set('code_challenge_method', method); p.set('state', state);
  p.set('resource', meta.resource);
  const sc = scope != null ? scope : meta.scope; if (sc) p.set('scope', sc);
  return { url: u.toString(), state, verifier };
}

async function tokenRequest(fetchImpl, meta, form, signal) {
  let r;
  try { r = await fetchImpl(meta.tokenEndpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, credentials: 'omit', redirect: 'error', signal, body: new URLSearchParams(form).toString() }); }
  catch (_) { throw new OAuthError('oauth_unreachable', 'Could not reach the token endpoint (the server unreachable or CORS).'); }
  let j = null; try { j = await r.json(); } catch (_) { j = null; }
  if (!r.ok || !j || !j.access_token) {
    const err = j && j.error ? clean(j.error, 80) : 'http_' + r.status;
    throw new OAuthError(err === 'invalid_grant' ? 'oauth_invalid_grant' : 'oauth_token_failed', 'The token endpoint refused the request (' + err + (j && j.error_description ? ': ' + clean(j.error_description, 200) : '') + ').', { status: r.status });
  }
  return j;
}
function toTokens(j, prev, now) {
  const ttl = Number(j.expires_in);
  return {
    accessToken: String(j.access_token),
    refreshToken: j.refresh_token ? String(j.refresh_token) : (prev && prev.refreshToken) || '',   /* a refresh response may omit the refresh token: keep the one we have */
    expiresAt: now + (Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_S) * 1000,
    expiresAssumed: !(Number.isFinite(ttl) && ttl > 0),
    scope: j.scope ? clean(j.scope, 300) : (prev && prev.scope) || '',
    tokenType: clean(j.token_type || 'Bearer', 20),
  };
}
/** The callback's query → code, after the `state` check. A mismatch is a forged or stale callback. */
export function checkCallback(params, expectedState) {
  const get = (k) => (params && typeof params.get === 'function' ? params.get(k) : params && params[k]) || '';
  if (get('error')) throw new OAuthError('oauth_denied', 'The sign-in was not completed (' + clean(get('error'), 60) + (get('error_description') ? ': ' + clean(get('error_description'), 160) : '') + ').');
  if (!expectedState || get('state') !== expectedState) throw new OAuthError('oauth_state_mismatch', 'The sign-in response did not match the request IntMap started, so it was ignored.');
  const code = get('code'); if (!code) throw new OAuthError('oauth_no_code', 'The sign-in response carried no authorization code.');
  return code;
}
export async function exchangeCode(fetchImpl, meta, { clientId, redirectUri, code, verifier, now, signal }) {
  const j = await tokenRequest(fetchImpl, meta, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource: meta.resource }, signal);
  return toTokens(j, null, now == null ? Date.now() : now);
}
export async function refreshTokens(fetchImpl, meta, { clientId, tokens, now, signal }) {
  if (!tokens || !tokens.refreshToken) throw new OAuthError('oauth_no_refresh', 'The sign-in has expired and carries no refresh token; sign in again.');
  const j = await tokenRequest(fetchImpl, meta, { grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: clientId, resource: meta.resource }, signal);
  return toTokens(j, tokens, now == null ? Date.now() : now);
}
/** RFC 7009. Best effort: the local credential is removed regardless; the result says whether the server was told. */
export async function revokeToken(fetchImpl, meta, { clientId, tokens, signal }) {
  if (!meta || !meta.revocationEndpoint || !tokens) return { revoked: false, why: 'no_revocation_endpoint' };
  let any = false;
  for (const [tok, hint] of [[tokens.refreshToken, 'refresh_token'], [tokens.accessToken, 'access_token']]) {
    if (!tok) continue;
    try { const r = await fetchImpl(meta.revocationEndpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, credentials: 'omit', redirect: 'error', signal, body: new URLSearchParams({ token: tok, token_type_hint: hint, client_id: clientId }).toString() }); if (r.ok) any = true; } catch (_) { /* best effort */ }
  }
  return { revoked: any, why: any ? undefined : 'server_did_not_confirm' };
}
export const isExpired = (tokens, now) => !tokens || !tokens.accessToken || (tokens.expiresAt != null && (now == null ? Date.now() : now) >= tokens.expiresAt - REFRESH_SKEW_MS);
