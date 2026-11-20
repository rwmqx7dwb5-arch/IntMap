// browser-session — the operated-browser tier (supabase/functions/_shared/web-session.js).
// A fake provider speaks the Chrome DevTools Protocol over a WebSocket-shaped object, so the CDP layer, the grant,
// the transport wall (no write can leave the session) and the credential rule are exercised for real — everything
// except the provider's own HTTP surface, which has no live counterpart yet (said in the module header).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionAction, openState, sealState, credentialField, SESSION_LIMITS, SESSION_PROVIDERS } from '../supabase/functions/_shared/web-session.js';

const UID = '11111111-1111-1111-1111-111111111111';
const sign = async (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(16) + 'sig'; };
const CFG = { provider: 'cloudflare', accountId: 'acct', token: 'tok' };

/* A page the fake browser shows. `ax` are the accessibility nodes; `facts` is what FN_FACTS answers per backend node. */
const PAGES = {
  'https://portal.example/': {
    html: '<html><head><title>Portal</title></head><body><h1>Statistics portal</h1><p>Search the tables.</p></body></html>',
    ax: [
      { id: 10, role: 'searchbox', name: 'Keyword', facts: { tag: 'input', type: 'search', editable: true } },
      { id: 11, role: 'button', name: 'Search', facts: { tag: 'button', type: 'submit' }, goes: 'https://portal.example/results' },
      { id: 12, role: 'button', name: 'Buy dataset', facts: { tag: 'button', type: 'button' }, emits: [{ method: 'POST', url: 'https://portal.example/api/buy' }] },
      { id: 13, role: 'combobox', name: 'Year', facts: { tag: 'select', type: 'select-one' }, options: ['2020', '2021'] },
      { id: 14, role: 'link', name: 'Leave', facts: { tag: 'a', type: '' }, goes: 'https://elsewhere.example/' },
    ],
  },
  'https://portal.example/results': {
    html: '<html><head><title>Results</title></head><body><h1>Results</h1><p>3 tables found.</p><a href="/t1.csv">t1.csv</a></body></html>',
    ax: [{ id: 20, role: 'link', name: 'Table 1', facts: { tag: 'a', type: '' } }],
  },
  'https://portal.example/login': {
    html: '<html><head><title>Sign in</title></head><body><form method="post"><input type="text" name="u"><input type="password" name="p"></form></body></html>',
    ax: [
      { id: 30, role: 'textbox', name: 'User', facts: { tag: 'input', type: 'text', editable: true } },
      { id: 31, role: 'textbox', name: 'Password', facts: { tag: 'input', type: 'password', editable: true } },
    ],
  },
};
PAGES['https://elsewhere.example/'] = { html: '<html><head><title>Else</title></head><body>elsewhere</body></html>', ax: [] };

function fakeProvider() {
  const log = { acquired: 0, closed: [], sockets: [], sent: [], headers: [], liveViews: 0 };
  const sessions = new Map();           /* sessionId → { url, typed:[] } */
  const fetcher = async (url, init) => {
    const u = String(url);
    if (init.method === 'POST' && /\/devtools\/browser\?keep_alive=\d+$/.test(u)) { const id = 'sess-' + (++log.acquired) + '-abcdef'; sessions.set(id, { url: 'about:blank', typed: [], hist: [] }); return new Response(JSON.stringify({ sessionId: id }), { status: 200 }); }
    if (init.method === 'POST' && /\/live_view$/.test(u)) { log.liveViews++; return new Response(JSON.stringify({ devtoolsFrontendUrl: 'https://live.example/view/abc' }), { status: 200 }); }
    if (init.method === 'DELETE') { log.closed.push(u.split('/').pop()); return new Response('{}', { status: 200 }); }
    return new Response('nope', { status: 404 });
  };
  const openSocket = async (url, headers) => {
    const id = decodeURIComponent(url.split('/').pop());
    if (!sessions.has(id)) throw new Error('no such session');
    const s = sessions.get(id);
    const keyOf = (u) => String(u).split('?')[0];
    log.headers.push(headers);
    const sock = { readyState: 1, onmessage: null, onclose: null, onerror: null, close() { this.readyState = 3; } };
    const reply = (m) => queueMicrotask(() => sock.onmessage && sock.onmessage({ data: JSON.stringify(m) }));
    const node = (backend) => (PAGES[s.url] ? PAGES[s.url].ax.find((n) => n.id === backend) : null);
    let fetchOn = false, curSession = 'S1';
    const navigate = async (to) => {
      if (s.url !== 'about:blank') s.hist.push(s.url); s.url = keyOf(to); reply({ method: 'Page.loadEventFired', params: {}, sessionId: curSession });
    };
    const firePaused = (method, url, type = 'XHR') => new Promise((res) => { const rid = 'r' + Math.random(); log.sent.push({ paused: { method, url } }); pending.set(rid, res); reply({ method: 'Fetch.requestPaused', sessionId: curSession, params: { requestId: rid, request: { method, url }, resourceType: type, frameId: 'MAIN' } }); });
    const pending = new Map();
    sock.send = async (str) => {
      const m = JSON.parse(str); log.sent.push({ method: m.method, params: m.params });
      const ok = (result) => reply({ id: m.id, result: result || {} });
      switch (m.method) {
        case 'Fetch.failRequest': case 'Fetch.continueRequest': { const r = pending.get(m.params.requestId); if (r) { pending.delete(m.params.requestId); r(m.method === 'Fetch.failRequest' ? 'failed' : 'continued'); } return ok(); }
        case 'Fetch.enable': fetchOn = true; return ok();
        case 'Target.getTargets': return ok({ targetInfos: [{ targetId: 'T1', type: 'page' }] });
        case 'Target.attachToTarget': return ok({ sessionId: 'S1' });
        case 'Page.getFrameTree': return ok({ frameTree: { frame: { id: 'MAIN' } } });
        case 'Page.navigate': {
          const verdict = await firePaused('GET', m.params.url, 'Document');
          if (verdict === 'failed') return ok({ errorText: 'net::ERR_BLOCKED_BY_CLIENT' });
          ok({ frameId: 'MAIN' }); return navigate(m.params.url);
        }
        case 'Runtime.evaluate': return ok({ result: { value: m.params.expression === 'location.href' ? s.url : (PAGES[s.url] || { html: '' }).html } });
        case 'Accessibility.getFullAXTree': return ok({ nodes: ((PAGES[s.url] || { ax: [] }).ax).map((n) => ({ backendDOMNodeId: n.id, role: { value: n.role }, name: { value: n.name }, properties: [] })) });
        case 'Page.captureScreenshot': return ok({ data: Buffer.from('jpegbytes').toString('base64') });
        case 'DOM.resolveNode': return ok({ object: { objectId: 'o' + m.params.backendNodeId } });
        case 'DOM.getBoxModel': return ok({ model: { content: [0, 0, 10, 0, 10, 10, 0, 10] } });
        case 'DOM.getNodeForLocation': return ok({ backendNodeId: 10 });
        case 'Runtime.callFunctionOn': {
          const n = node(+m.params.objectId.slice(1));
          if (/option/.test(m.params.functionDeclaration)) { const v = m.params.arguments[0].value; return ok({ result: { value: n && n.options.includes(v) ? 'ok' : 'no_option' } }); }
          return ok({ result: { value: JSON.stringify(n ? n.facts : {}) } });
        }
        case 'Page.getNavigationHistory': return ok({ currentIndex: s.hist.length, entries: [...s.hist, s.url].map((u, i) => ({ id: i, url: u })) });
        case 'Page.navigateToHistoryEntry': { s.url = s.hist[m.params.entryId]; s.hist.length = m.params.entryId; return ok(); }
        case 'Input.insertText': s.typed.push(m.params.text); return ok();
        case 'Input.dispatchMouseEvent': {
          if (m.params.type === 'mouseReleased' && sock._click) { const n = sock._click; sock._click = null;
            for (const e of (n.emits || [])) await firePaused(e.method, e.url);
            if (n.goes) { const v = await firePaused('GET', n.goes, 'Document'); if (v === 'continued') await navigate(n.goes); } }
          return ok();
        }
        case 'DOM.scrollIntoViewIfNeeded': { sock._click = null; return ok(); }
        case 'DOM.focus': return ok();
        default: return ok();
      }
    };
    /* remember which node a click is on: DOM.resolveNode precedes the click */
    const origSend = sock.send;
    sock.send = async (str) => { const m = JSON.parse(str); if (m.method === 'DOM.getBoxModel') sock._click = node(m.params.backendNodeId); return origSend(str); };
    return sock;
  };
  return { log, sessions, fetcher, openSocket };
}

function mk(over) {
  const p = fakeProvider();
  const journal = [];
  const deps = { settleMs: 0, cfg: CFG, uid: UID, sign, resolvesPublic: async () => true, fetch: p.fetcher, openSocket: p.openSocket, journal: (e) => journal.push(e), now: () => 1_000_000, ...(over || {}) };
  return { p, deps, journal, run: (input, d2) => sessionAction(input, { ...deps, ...(d2 || {}) }) };
}
async function granted(h, host = 'portal.example') { const g = await h.run({ action: 'grant', host }); assert.ok(g.ok, 'grant: ' + g.code); return g.state; }

test('unconfigured is a state, and nothing is opened', async () => {
  const h = mk({ cfg: {} });
  const r = await h.run({ action: 'open', url: 'https://portal.example/' });
  assert.equal(r.code, 'session_unconfigured');
  assert.equal(h.p.log.acquired, 0);
  assert.equal((await mk().run({ action: 'format-disk' })).code, 'bad_action');
});

test('a site is opened only under a grant, asked once; reads need no further approval', async () => {
  const h = mk();
  const none = await h.run({ action: 'open', url: 'https://portal.example/' });
  assert.equal(none.code, 'needs_grant');
  assert.equal(h.p.log.acquired, 0, 'no provider session is started without a grant');
  let state = await granted(h);
  let r = await h.run({ action: 'open', url: 'https://portal.example/', state });
  assert.ok(r.ok, r.code);
  /* many later looks and steps carry no new approval */
  for (let i = 0; i < 3; i++) { r = await h.run({ action: 'observe', state: r.state }); assert.ok(r.ok); }
  /* another host is a different grant */
  const other = await h.run({ action: 'open', url: 'https://other.example/', state: r.state });
  assert.equal(other.code, 'needs_grant'); assert.equal(other.host, 'other.example');
});

test('a grant expires, and an expired grant is named', async () => {
  const h = mk();
  const state = await granted(h);
  const late = await h.run({ action: 'open', url: 'https://portal.example/', state }, { now: () => 1_000_000 + SESSION_LIMITS.grantMs + 1 });
  assert.equal(late.code, 'grant_expired');
});

test('the state is bound to the account and cannot be edited', async () => {
  const h = mk();
  const state = await granted(h);
  assert.equal((await h.run({ action: 'observe', state }, { uid: '22222222-2222-2222-2222-222222222222' })).code, 'bad_state');
  const [body, sig] = state.split('.');
  assert.equal((await h.run({ action: 'observe', state: body + 'x.' + sig })).code, 'bad_state');
  assert.equal((await h.run({ action: 'observe', state: 'garbage' })).code, 'bad_state');
  /* a hand-forged token with a host the reader never granted fails the signature */
  const forged = await sealState({ u: UID, h: ['evil.example'], e: 9e12, s: '' }, async () => 'bad');
  assert.equal((await h.run({ action: 'open', url: 'https://evil.example/', state: forged })).code, 'bad_state');
  assert.ok(await openState(state, sign, UID, 0));
});

test('an address that is not public is refused before any provider is touched', async () => {
  const h = mk({ resolvesPublic: async () => false });
  assert.equal((await h.run({ action: 'grant', host: 'portal.example' })).code, 'not_allowed');
  const h2 = mk();
  assert.equal((await h2.run({ action: 'grant', host: 'localhost' })).code, 'not_allowed');
  assert.equal((await h2.run({ action: 'grant', host: '169.254.169.254' })).code, 'not_allowed');
  assert.equal(h2.p.log.acquired, 0);
});

test('open → look → type → select → click → a second screen, in ONE provider session', async () => {
  const h = mk();
  let state = await granted(h);
  let r = await h.run({ action: 'open', url: 'https://portal.example/', state });
  assert.ok(r.ok, r.code);
  assert.match(r.page.text, /Statistics portal/);
  assert.ok(r.controls.some((c) => c.name === 'Search' && /^n\d+$/.test(c.ref)), 'controls carry node refs');
  assert.equal(r.screenshot.mime, 'image/jpeg');
  assert.ok(r.provider === 'cloudflare' && r.viaBrowser);
  const kw = r.controls.find((c) => c.name === 'Keyword'), btn = r.controls.find((c) => c.name === 'Search'), year = r.controls.find((c) => c.name === 'Year');
  r = await h.run({ action: 'type', ref: kw.ref, text: 'population', state: r.state }); assert.ok(r.ok, r.code);
  r = await h.run({ action: 'select', ref: year.ref, value: '2021', state: r.state }); assert.ok(r.ok, r.code);
  r = await h.run({ action: 'select', ref: year.ref, value: '1999', state: r.state }); assert.equal(r.code, 'no_option');
  r = await h.run({ action: 'click', ref: btn.ref, state: r.state }); assert.ok(r.ok, r.code);
  assert.match(r.page.text, /3 tables found/);
  assert.equal(r.url, 'https://portal.example/results');
  assert.equal(h.p.log.acquired, 1, 'the whole task shared one browser session');
  assert.deepEqual(h.p.sessions.get('sess-1-abcdef').typed, ['population']);
  /* the provider was handed the grant as a guardrail on every connection */
  assert.ok(h.p.log.headers.every((x) => /^[\w-]+$/.test(x['cf-brapi-guardrails'])));
  assert.equal(JSON.parse(Buffer.from(h.p.log.headers[0]['cf-brapi-guardrails'], 'base64url').toString()).allowedDomains[0], 'portal.example');
  /* go back, and close */
  r = await h.run({ action: 'back', state: r.state }); assert.ok(r.ok, r.code);
  assert.equal(r.url, 'https://portal.example/');
  const c = await h.run({ action: 'close', state: r.state });
  assert.ok(c.ok && c.closed); assert.deepEqual(h.p.log.closed, ['sess-1-abcdef']);
  assert.equal((await openState(c.state, sign, UID, 0)).s, '', 'a closed session is not carried');
});

test('THE WALL: no write can leave the session, whatever the model clicks', async () => {
  const h = mk();
  let state = await granted(h);
  let r = await h.run({ action: 'open', url: 'https://portal.example/', state });
  const buy = r.controls.find((c) => c.name === 'Buy dataset');
  r = await h.run({ action: 'click', ref: buy.ref, state: r.state });
  assert.equal(r.blockedWrites, 1, 'the POST the page fired was failed by the transport');
  const fails = h.p.log.sent.filter((x) => x.method === 'Fetch.failRequest');
  assert.equal(fails.length, 1);
  assert.equal(fails[0].params.errorReason, 'BlockedByClient');
  assert.equal(h.p.log.sent.filter((x) => x.paused && x.paused.method === 'POST').length, 1);
});

test('THE WALL: a top-level navigation out of the grant is failed, and the page stays on the granted site', async () => {
  const h = mk();
  let state = await granted(h);
  let r = await h.run({ action: 'open', url: 'https://portal.example/', state });
  const leave = r.controls.find((c) => c.name === 'Leave');
  r = await h.run({ action: 'click', ref: leave.ref, state: r.state });
  assert.equal(r.blockedNavigations, 1);
  assert.equal(r.url, 'https://portal.example/');
  assert.ok(r.ok);
});

test('no credential is typed: a password field refuses, and the text never reaches the browser', async () => {
  const h = mk();
  let state = await granted(h);
  let r = await h.run({ action: 'open', url: 'https://portal.example/login', state });
  assert.equal(r.code, 'handoff');
  assert.equal(r.handoff.kind, 'login');
  assert.equal(r.handoff.liveView, 'https://live.example/view/abc', 'the reader is given where to sign in');
  assert.equal(r.handoff.sessionLive, true);
  const pw = r.controls.find((c) => c.name === 'Password');
  const t = await h.run({ action: 'type', ref: pw.ref, text: 'hunter2', state: r.state });
  assert.equal(t.code, 'credential_field');
  assert.ok(!h.p.log.sent.some((x) => x.method === 'Input.insertText'), 'the secret was never sent');
  assert.ok(!JSON.stringify(h.journal).includes('hunter2'));
  /* after the READER signs in on the live view, Atlas carries on in the SAME session */
  const again = await h.run({ action: 'observe', state: t.state });
  assert.equal(h.p.log.acquired, 1);
  assert.ok(again.state);
  assert.equal(credentialField({ type: 'text', auto: 'cc-number' }), true);
  assert.equal(credentialField({ type: 'text', auto: 'one-time-code' }), true);
  assert.equal(credentialField({ type: 'search', auto: '' }), false);
});

test('live: the reader can always be handed the live view of the session', async () => {
  const h = mk();
  let state = await granted(h);
  let r = await h.run({ action: 'open', url: 'https://portal.example/', state });
  r = await h.run({ action: 'live', state: r.state });
  assert.equal(r.liveView, 'https://live.example/view/abc');
});

test('a session that is gone at the provider is said so and is not carried', async () => {
  const h = mk();
  let state = await granted(h);
  let r = await h.run({ action: 'open', url: 'https://portal.example/', state });
  h.p.sessions.clear();
  const gone = await h.run({ action: 'observe', state: r.state });
  assert.equal(gone.code, 'session_expired');
  assert.equal((await openState(gone.state, sign, UID, 0)).s, '');
  assert.equal((await h.run({ action: 'click', ref: 'n1', state })).code, 'no_session');
});

test('the journal records what was done and where — never what was typed or shown', async () => {
  const h = mk();
  let state = await granted(h);
  let r = await h.run({ action: 'open', url: 'https://portal.example/?q=secret', state });
  const kw = r.controls.find((c) => c.name === 'Keyword');
  await h.run({ action: 'type', ref: kw.ref, text: 'private words', state: r.state });
  const blob = JSON.stringify(h.journal);
  assert.ok(h.journal.length >= 3);
  assert.ok(!/private words|secret|Statistics/.test(blob), 'neither the typed text, the query string nor the page is journalled');
  assert.deepEqual(Object.keys(h.journal[1]).sort(), ['action', 'blocked', 'code', 'host', 'ms', 'ok', 'path']);
  assert.equal(h.journal[1].host, 'portal.example');
});

test('the provider surface is read from the adapter alone (a provider is one entry)', () => {
  assert.deepEqual(Object.keys(SESSION_PROVIDERS), ['cloudflare']);
  const p = SESSION_PROVIDERS.cloudflare;
  assert.equal(p.configured({ accountId: 'a' }), false);
  assert.match(p.wsUrl(CFG, 'abc-123'), /^wss:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/acct\/browser-rendering\/devtools\/browser\/abc-123$/);
  /* nothing the caller sends can reach the provider's headers */
  assert.deepEqual(Object.keys(p.headers(CFG)), ['authorization']);
});

/* ── the shell and the capability rows ─────────────────────────────────────────────────────────────── */
import { readFileSync } from 'node:fs';
import { makeAtlasCapabilities } from '../js/atlas-capabilities.js';

test('the Edge Function: its own switch, the account asked before any bucket, unconfigured costs nothing', async () => {
  const src = readFileSync(new URL('../supabase/functions/web-browse/index.ts', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('async function sessionTier'), src.indexOf('Deno.serve'));
  const at = (s) => fn.indexOf(s);
  assert.ok(at('WEB_SESSION_DISABLED') > -1 && at('WEB_SESSION_DISABLED') < at('session_unconfigured'), 'switch, then configuration');
  assert.ok(at('session_unconfigured') < at('callerId(req)'), 'unconfigured is answered before the Auth server is asked');
  assert.ok(at('callerId(req)') < at('callerGate'), 'the account is established before a bucket is spent');
  assert.ok(at('callerGate') < at('forceGrant'), 'per caller, then project-wide');
  assert.match(fn, /scope: "web-session"/); assert.match(fn, /"web-session-project"/, 'its own buckets — not the light tier’s and not the render tier’s');
  assert.match(fn, /grant !== "granted"/, 'fail closed');
  assert.match(fn, /Promise\.allSettled\(pending\)/, 'journal rows are written before the isolate may end');
  const iSession = src.indexOf('sessionTier(req)'), iLight = src.indexOf('scope: "web-browse"');
  assert.ok(iSession > 0 && iSession < iLight, 'taken before the light tier’s caps');

  const saved = { Deno: globalThis.Deno };
  let handler = null; const envs = {};
  globalThis.Deno = { serve: (h) => { handler = h; }, env: { get: (k) => envs[k] }, resolveDns: async () => [] };
  try {
    await import('../supabase/functions/web-browse/index.ts?t=' + Date.now());
    const call = (body) => handler(new Request('https://x.supabase.co/functions/v1/web-browse?tier=session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || { action: 'observe' }) }));
    const un = await call(); const uj = await un.json();
    assert.equal(un.status, 200); assert.equal(uj.code, 'session_unconfigured');
    envs.WEB_SESSION_DISABLED = '1';
    const off = await call(); assert.equal(off.status, 503); assert.equal((await off.json()).error, 'disabled');
    delete envs.WEB_SESSION_DISABLED;
    envs.CF_BROWSER_ACCOUNT_ID = 'a'; envs.CF_BROWSER_API_TOKEN = 't';
    const anon = await call(); assert.equal(anon.status, 401, 'no verifiable account → nothing'); assert.equal((await anon.json()).error, 'signed_out');
  } finally { globalThis.Deno = saved.Deno; }
});

test('the capability rows: operating asks nothing per step; widening asks the reader every time', () => {
  const CAPS = makeAtlasCapabilities({}, { publish: false });
  const s = CAPS.resolve('web.session'), g = CAPS.resolve('web.sessionGrant');
  assert.ok(s && g, 'registered (rows are generated: node scripts/atlas-caps.mjs --write)');
  assert.equal(s.confirmation, 'none', 'a look or a step is not asked about — the grant already was');
  assert.equal(s.ingests, 'external', 'what the page says is a third party’s');
  assert.equal(g.confirmation, 'always', 'the grant is the one approval, and Atlas cannot give it to itself');
  const web = readFileSync(new URL('../js/atlas-cap-web.js', import.meta.url), 'utf8');
  assert.match(web, /CANNOT SEND ANYTHING/); assert.match(web, /never types a password/); assert.match(web, /NO approval is asked/);
  /* the door sends a fixed set of fields: no script, header, cookie or method can ride a step */
  const door = readFileSync(new URL('../js/web-browse.js', import.meta.url), 'utf8');
  const body = /const body = \{ action: a\.action, host: a\.host[^}]*\}/.exec(door);
  assert.ok(body, 'session sends a fixed set of fields');
  for (const bad of ['script', 'cookie', 'headers', 'method', 'evaluate', 'expression']) assert.ok(!new RegExp('\b' + bad + '\b').test(body[0]), 'the session body names no ' + bad);
  /* and the engine’s verbs are a closed set, with every in-page function a constant */
  const eng = readFileSync(new URL('../supabase/functions/_shared/web-session.js', import.meta.url), 'utf8');
  assert.ok(!/a\.(script|expression|headers|cookie|method)\b/.test(eng), 'no caller field reaches the provider as code or header');
  assert.ok(!/Runtime\.evaluate", \{ expression: [^EU]/.test(eng.replace(/EXPR_HTML|EXPR_URL/g, 'E')), 'Runtime.evaluate is only ever given a constant');
});
