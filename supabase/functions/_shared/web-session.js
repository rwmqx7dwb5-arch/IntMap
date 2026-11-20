// ============================================================================
//  IntMap · _shared/web-session.js — the SESSION tier of the real browser, as pure logic  (browser-session)
// ----------------------------------------------------------------------------
//  WHY. web-browse is a light reader and web-render is a one-shot, read-only picture. Some pages cannot be
//  investigated from either: a portal that must be CLICKED through, a search box that must be TYPED into, a
//  list that opens only after a select, several screens in a row that share one logged-in state. This tier is
//  an operated browser session: Atlas looks at the page (text + the controls on it + a screenshot), then
//  clicks / types / selects / presses / scrolls / goes back, and looks again. The session persists between
//  calls — the browser lives at the provider (Cloudflare Browser Run, over CDP) and each Edge call re-attaches
//  to it by id, acts, answers, and detaches without closing it.
//
//  WHO DECIDES WHAT. Atlas decides what to do and how many steps (CONSTITUTION §5, one-pass-or-a-reason).
//  This file never counts Atlas's steps. It owns only what can be said as a FACT ABOUT THE REQUEST:
//
//   · A SITE IS OPENED UNDER A GRANT, ASKED ONCE. `grant` (the reader confirms once, per site — the capability
//     row is risk 'external' / confirm 'explicit') adds a host to a signed token for GRANT_MS. After that every look and every
//     step on that site needs no further approval: reading is not asked for each time. A host with no grant is
//     `needs_grant`, with the host named, never an attempt.
//   · THE SESSION CANNOT EMIT A WRITE. While we are attached, CDP Fetch pauses every request; anything that is
//     not GET/HEAD is failed (`blocked_writes` is reported), and so is a top-level navigation to a host outside
//     the grant. A purchase, a post, a form that POSTs, a delete issued by script — none can leave this
//     session, whatever the model decides and whatever the page says. This is a property of the transport,
//     not a list of words on buttons. (The reader may do anything in the provider's live view: that is the
//     reader, not Atlas.)
//   · NO CREDENTIAL IS TYPED. A password field (or one-time-code / card-number autocomplete) refuses `type`;
//     a login wall or CAPTCHA on the page is a `handoff` carrying a live-view address, so the READER signs
//     in on the provider's browser and Atlas carries on from the logged-in session. The password never
//     passes through IntMap, the model, or the journal.
//   · THE CALLER CHOOSES NO SCRIPT, NO HEADER, NO COOKIE. Actions are a closed set of verbs with typed
//     arguments; every function evaluated in the page is a constant in this file, and text arrives only as an
//     argument. The provider receives a URL, a key press, a coordinate, or text for a non-credential field.
//   · A SESSION BELONGS TO AN ACCOUNT. The state token is HMAC-signed over {account, hosts, provider session,
//     expiry}; another account's token, or an edited one, is `bad_state`.
//   · EVERY CALL IS JOURNALLED (account, action, host, path without query, outcome, milliseconds) — never the
//     typed text, never the page. The shell owns the table and its retention.
//   · PAGE TEXT IS DATA — same notice, same hidden-element drop (the parser is the light tier's).
//
//  ⚠ UNVERIFIED AGAINST A LIVE PROVIDER (no contract yet — the reader chose «adapter first»): the provider
//  paths and fields below follow Cloudflare's published Browser Run documentation as read on 2026-11-20
//  (sessions: POST …/devtools/browser → {sessionId}; reconnect wss …/devtools/browser/{id}; live view: POST
//  …/devtools/browser/{id}/live_view → {devtoolsFrontendUrl}; guardrails header cf-brapi-guardrails;
//  Authorization: Bearer on the WebSocket). The CDP layer itself is the standard protocol and is exercised
//  by tests against a fake that speaks it. Expires when the first live session runs
//  (scripts/web-browse-probe.mjs): a mismatch is fixed in SESSION_PROVIDERS.cloudflare alone.
//
//  ⚠ NO TYPE ANNOTATIONS and no Deno globals (Node runs this under test).
// ============================================================================

import { browseUrlAllowed, parseHtml, snapshotOf, handoffOf, decodeBody } from "./web-browse.js";

export const SESSION_LIMITS = Object.freeze({
  /* How long the provider keeps an idle browser (ms). Range the provider accepts: 10 s–20 min. Atlas's steps are seconds
     apart, a reader's login in the live view takes minutes — 10 min covers both and costs idle time only. ESTIMATE. */
  keepAliveMs: 600000,
  /* How long ONE grant lasts. A reader who asked Atlas to investigate a site is at the screen for the task, not for a day;
     4 h is a working session. ESTIMATE — expires with the first complaint of an early re-ask or a stale grant. */
  grantMs: 4 * 3600 * 1000,
  grantHosts: 8,
  callMs: 45000,               /* the whole exchange (Edge isolate wall clock is the outer bound) */
  gotoMs: 25000,
  settleMs: 700,               /* after a step: let the page's own scripts react before looking */
  waitMaxMs: 5000,
  htmlBytes: 3 * 1024 * 1024,
  shotBytes: 1.5 * 1024 * 1024,
  controls: 80,
  controlNameChars: 120,
  typeChars: 2000,
  viewport: Object.freeze({ width: 1280, height: 800 }),
  jpegQuality: 70,
});

export const SESSION_ACTIONS = Object.freeze(["grant", "open", "observe", "click", "type", "select", "press", "scroll", "back", "wait", "live", "close"]);
const KEYS = Object.freeze({ Enter: 13, Tab: 9, Escape: 27, ArrowDown: 40, ArrowUp: 38, PageDown: 34, PageUp: 33, Home: 36, End: 35 });
/* Roles that are a control the reader could operate. From the ARIA role list: the widget roles that take a click, text or a choice. */
const CONTROL_ROLES = new Set(["link", "button", "textbox", "searchbox", "combobox", "listbox", "option", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "slider", "spinbutton", "treeitem"]);

/* ── the provider ────────────────────────────────────────────────────────────────────────────── */
function b64url(s) { return btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

export const SESSION_PROVIDERS = Object.freeze({
  cloudflare: Object.freeze({
    configured: (cfg) => !!(cfg && cfg.accountId && cfg.token),
    base: (cfg) => "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(cfg.accountId) + "/browser-rendering/devtools/browser",
    headers: (cfg, hosts) => {
      const h = { authorization: "Bearer " + cfg.token };
      /* the provider enforces the grant too (a second wall behind our own request filter) */
      if (hosts && hosts.length) h["cf-brapi-guardrails"] = b64url(JSON.stringify({ allowedDomains: hosts }));
      return h;
    },
    /* POST …/devtools/browser?keep_alive=… → { sessionId } */
    acquire: async (cfg, deps, keepAliveMs) => {
      const res = await (deps.fetch || fetch)(SESSION_PROVIDERS.cloudflare.base(cfg) + "?keep_alive=" + keepAliveMs, { method: "POST", headers: SESSION_PROVIDERS.cloudflare.headers(cfg), redirect: "error", signal: deps.signal });
      if (!res.ok) { try { await res.body?.cancel(); } catch (_) { /* headers were enough */ } return { status: res.status }; }
      let j = null; try { j = await res.json(); } catch (_) { j = null; }
      const id = j && (j.sessionId || (j.result && j.result.sessionId));
      return typeof id === "string" && /^[\w-]{6,128}$/.test(id) ? { sessionId: id } : { status: 502 };
    },
    wsUrl: (cfg, sessionId) => "wss://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(cfg.accountId) + "/browser-rendering/devtools/browser/" + encodeURIComponent(sessionId),
    /* POST …/{id}/live_view → { devtoolsFrontendUrl }: where the READER may watch and use the browser (to sign in). Mode 'tab' = the page only. */
    liveView: async (cfg, deps, sessionId) => {
      const res = await (deps.fetch || fetch)(SESSION_PROVIDERS.cloudflare.base(cfg) + "/" + encodeURIComponent(sessionId) + "/live_view", { method: "POST", headers: { ...SESSION_PROVIDERS.cloudflare.headers(cfg), "content-type": "application/json" }, body: JSON.stringify({ mode: "tab" }), redirect: "error", signal: deps.signal });
      if (!res.ok) { try { await res.body?.cancel(); } catch (_) { /* headers were enough */ } return null; }
      let j = null; try { j = await res.json(); } catch (_) { j = null; }
      const u = j && (j.devtoolsFrontendUrl || (j.result && j.result.devtoolsFrontendUrl));
      return typeof u === "string" && /^https:\/\//i.test(u) ? u : null;
    },
    close: async (cfg, deps, sessionId) => {
      try {
        const res = await (deps.fetch || fetch)(SESSION_PROVIDERS.cloudflare.base(cfg) + "/" + encodeURIComponent(sessionId), { method: "DELETE", headers: SESSION_PROVIDERS.cloudflare.headers(cfg), redirect: "error", signal: deps.signal });
        try { await res.body?.cancel(); } catch (_) { /* nothing to drain */ }
        return res.ok;
      } catch (_) { return false; }
    },
  }),
});

export function chooseSessionProvider(cfg) {
  const kind = String((cfg && cfg.provider) || "cloudflare");
  const p = SESSION_PROVIDERS[kind];
  return p && p.configured(cfg) ? { kind, p } : null;
}

/* ── the signed state ────────────────────────────────────────────────────────────────────────── */
export async function sealState(payload, sign) { const body = b64url(JSON.stringify(payload)); return body + "." + (await sign(body)); }
export async function openState(token, sign, uid, now) {
  const t = String(token || "");
  const i = t.lastIndexOf(".");
  if (i < 1) return null;
  const body = t.slice(0, i);
  if ((await sign(body)) !== t.slice(i + 1)) return null;
  let p = null;
  try { p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)))); } catch (_) { return null; }
  if (!p || p.u !== uid || !Array.isArray(p.h)) return null;
  return { u: p.u, h: p.h.filter((x) => typeof x === "string").slice(0, SESSION_LIMITS.grantHosts), e: Number(p.e) || 0, s: typeof p.s === "string" ? p.s : "" };
}

/* ── a minimal CDP client over a WebSocket-shaped object ─────────────────────────────────────────── */
export function cdpClient(socket) {
  let seq = 0;
  const waiting = new Map();
  const listeners = new Map();
  let closed = false;
  const dead = (why) => { closed = true; for (const [, w] of waiting) w.reject(new Error(why)); waiting.clear(); };
  socket.onmessage = (ev) => {
    let m = null;
    try { m = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data)); } catch (_) { return; }
    if (m && m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w.reject(Object.assign(new Error(String(m.error.message || "cdp")), { cdp: m.error })) : w.resolve(m.result || {}); }
    else if (m && m.method) for (const f of (listeners.get(m.method) || [])) { try { f(m.params || {}, m.sessionId); } catch (_) { /* a listener's own failure is not the protocol's */ } }
  };
  socket.onclose = () => dead("socket closed");
  socket.onerror = () => dead("socket error");
  return {
    send(method, params, sessionId, ms) {
      if (closed) return Promise.reject(new Error("socket closed"));
      const id = ++seq;
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => { waiting.delete(id); reject(new Error("cdp timeout " + method)); }, ms || 15000);
        waiting.set(id, { resolve: (r) => { clearTimeout(t); resolve(r); }, reject: (e) => { clearTimeout(t); reject(e); } });
        socket.send(JSON.stringify({ id, method, params: params || {}, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    on(method, f) { (listeners.get(method) || listeners.set(method, []).get(method)).push(f); },
    once(method, ms) { return new Promise((resolve) => { const t = setTimeout(() => resolve(null), ms); const f = (p) => { clearTimeout(t); resolve(p); }; this.on(method, f); }); },
    close() { closed = true; try { socket.close(); } catch (_) { /* already gone */ } },
  };
}

/* The functions evaluated in the page. Constants: the caller's words reach them only as arguments. */
const FN_FACTS = "function(){var e=this,f=e.form||(e.closest&&e.closest('form'))||null,t=(e.type||'').toLowerCase(),a=((e.getAttribute&&e.getAttribute('autocomplete'))||'').toLowerCase();return JSON.stringify({tag:(e.tagName||'').toLowerCase(),type:t,auto:a,editable:!!(e.isContentEditable||/^(input|textarea)$/i.test(e.tagName||'')),disabled:!!e.disabled})}";
const FN_SELECT = "function(v){var e=this;if(!e||(e.tagName||'').toLowerCase()!=='select')return 'not_select';var o=Array.prototype.find.call(e.options,function(x){return x.value===v||x.label===v||x.text===v});if(!o)return 'no_option';e.value=o.value;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'}";
const EXPR_HTML = "document.documentElement.outerHTML";
const EXPR_URL = "location.href";

/* A field a credential or a payment goes into. Read from the element's own declaration (type / autocomplete), not from a label. */
export function credentialField(facts) {
  if (!facts) return false;
  return facts.type === "password" || /\b(current-password|new-password|one-time-code|cc-[a-z-]+)\b/.test(facts.auto || "");
}

function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch (_) { return ""; } }
function pathOf(u) { try { return new URL(u).pathname.slice(0, 120); } catch (_) { return ""; } }
function inGrant(hosts, host) { return !!host && hosts.some((h) => host === h || host.endsWith("." + h)); }
function bytesOfB64(b64) { return Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* sessionAction(input, deps) → { ok, state, code?, page?, controls?, screenshot?, handoff?, viaBrowser:true, ... }
   input : { action, state?, host?, url?, ref?, x?, y?, text?, value?, key?, dy?, ms?, textChars?, screenshot? }
   deps  : { cfg, uid, sign(str)→hex, resolvesPublic(host,{signal}), openSocket(url, headers)→Promise<WebSocket-like>,
             fetch?, now?, journal?(entry) } — the shell supplies the world */
export async function sessionAction(input, deps) {
  const a = input || {};
  const t0 = (deps.now || Date.now)();
  const action = SESSION_ACTIONS.includes(a.action) ? a.action : "";
  let st = null;               /* the verified state, or a fresh empty one */
  let result;
  const journal = (r, host, path) => {
    if (!deps.journal) return;
    try { deps.journal({ action: action || "invalid", host: host || "", path: path || "", ok: !!r.ok, code: r.ok ? "" : String(r.code || ""), ms: Math.max(0, (deps.now || Date.now)() - t0), blocked: r.blockedWrites || 0 }); } catch (_) { /* best effort: a journal that fails never fails the step */ }
  };
  const fail = (code, extra) => ({ ok: false, code, viaBrowser: true, ...(extra || {}) });
  let jHost = "", jPath = "";
  try {
    if (!action) return (result = fail("bad_action"));
    const chosen = chooseSessionProvider(deps.cfg);
    if (!chosen) return (result = fail("session_unconfigured", { say: "The operated-browser tier has no provider configured, so no session was started." }));
    const now = (deps.now || Date.now)();

    if (a.state) {
      st = await openState(a.state, deps.sign, deps.uid, now);
      if (!st) return (result = fail("bad_state"));
    } else st = { u: deps.uid, h: [], e: 0, s: "" };
    const grantLive = st.e > now;
    const hosts = grantLive ? st.h : [];
    const seal = (over) => sealState({ u: deps.uid, h: (over && over.h) || st.h, e: (over && over.e) || st.e, s: over && "s" in over ? over.s : st.s }, deps.sign);

    /* ── grant: the one approval ── */
    if (action === "grant") {
      const u = browseUrlAllowed("https://" + String(a.host || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
      if (!u) return (result = fail("not_allowed"));
      if (!(await deps.resolvesPublic(u.hostname, { signal: AbortSignal.timeout(8000) }))) return (result = fail("not_allowed"));
      const nextHosts = Array.from(new Set([...(grantLive ? st.h : []), u.hostname])).slice(-SESSION_LIMITS.grantHosts);
      const e = now + SESSION_LIMITS.grantMs;
      jHost = u.hostname;
      return (result = { ok: true, viaBrowser: true, state: await seal({ h: nextHosts, e }), granted: { host: u.hostname, hosts: nextHosts, expiresAt: new Date(e).toISOString() } });
    }

    const signal = AbortSignal.timeout(SESSION_LIMITS.callMs);
    const world = { ...deps, signal };

    /* ── close: no grant needed to stop a session ── */
    if (action === "close") {
      if (st.s) await chosen.p.close(deps.cfg, world, st.s);
      return (result = { ok: true, viaBrowser: true, closed: !!st.s, state: await seal({ s: "" }) });
    }

    if (!hosts.length) return (result = fail(st.h.length ? "grant_expired" : "needs_grant", { hosts: st.h }));

    /* ── open: a new look at an address ── */
    let target = null;
    if (action === "open") {
      target = browseUrlAllowed(String(a.url || ""));
      if (!target) return (result = fail("not_allowed"));
      jHost = target.hostname;
      if (!inGrant(hosts, target.hostname)) return (result = fail("needs_grant", { host: target.hostname, hosts }));
      if (!(await deps.resolvesPublic(target.hostname, { signal }))) return (result = fail("not_allowed"));
    } else if (!st.s) return (result = fail("no_session"));

    /* the provider session: reuse, or acquire */
    let sessionId = st.s;
    if (!sessionId) {
      let acq;
      try { acq = await chosen.p.acquire(deps.cfg, world, SESSION_LIMITS.keepAliveMs); } catch (_) { return (result = fail(signal.aborted ? "upstream_timeout" : "session_unreachable")); }
      if (!acq.sessionId) return (result = fail(acq.status === 401 || acq.status === 403 ? "session_auth" : acq.status === 429 ? "session_busy" : "session_failed", { status: acq.status }));
      sessionId = acq.sessionId;
    }

    let socket;
    try { socket = await deps.openSocket(chosen.p.wsUrl(deps.cfg, sessionId), chosen.p.headers(deps.cfg, hosts)); }
    catch (_) { return (result = { ...fail(st.s ? "session_expired" : "session_unreachable"), state: await seal({ s: "" }) }); }
    const cdp = cdpClient(socket);
    try {
      /* attach to the (first) page, creating one if the browser has none */
      let targets = (await cdp.send("Target.getTargets")).targetInfos || [];
      let page = targets.find((x) => x.type === "page");
      if (!page) page = { targetId: (await cdp.send("Target.createTarget", { url: "about:blank" })).targetId };
      const sid = (await cdp.send("Target.attachToTarget", { targetId: page.targetId, flatten: true })).sessionId;
      const send = (m, p, ms) => cdp.send(m, p, sid, ms);
      await send("Page.enable"); await send("DOM.enable"); await send("Accessibility.enable");

      /* THE WALL: pause every request; fail writes and out-of-grant top-level navigations */
      let blockedWrites = 0, blockedNav = 0;
      const mainFrame = (((await send("Page.getFrameTree")).frameTree || {}).frame || {}).id;
      cdp.on("Fetch.requestPaused", (p, from) => {
        const req = p.request || {};
        const m = String(req.method || "GET").toUpperCase();
        let verdict = null;
        if (m !== "GET" && m !== "HEAD" && m !== "OPTIONS") { verdict = "write"; blockedWrites++; }
        else if (p.resourceType === "Document" && p.frameId === mainFrame && !inGrant(hosts, hostOf(req.url)) && !/^(about|data|blob):/i.test(req.url || "")) { verdict = "nav"; blockedNav++; }
        cdp.send(verdict ? "Fetch.failRequest" : "Fetch.continueRequest", verdict ? { requestId: p.requestId, errorReason: "BlockedByClient" } : { requestId: p.requestId }, from || sid).catch(() => {});
      });
      await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });

      const step = await perform(action, a, { send, cdp, sid, target, hosts, signal });
      if (step.code) { result = { ...fail(step.code, step.extra), state: await seal({ s: sessionId }), blockedWrites: blockedWrites || undefined }; return result; }

      await sleep(deps.settleMs === undefined ? SESSION_LIMITS.settleMs : deps.settleMs);
      const url = String(((await send("Runtime.evaluate", { expression: EXPR_URL, returnByValue: true })).result || {}).value || "");
      jHost = hostOf(url) || jHost; jPath = pathOf(url);

      /* look */
      const htmlRes = (await send("Runtime.evaluate", { expression: EXPR_HTML, returnByValue: true, timeout: 8000 })).result || {};
      const html = typeof htmlRes.value === "string" ? htmlRes.value : "";
      const htmlBytes = new TextEncoder().encode(html);
      if (htmlBytes.length > SESSION_LIMITS.htmlBytes) return (result = { ...fail("upstream_too_large"), state: await seal({ s: sessionId }) });
      const parsed = parseHtml(decodeBody(htmlBytes, "text/html; charset=utf-8"), url || (target && target.toString()) || "https://invalid.invalid/");
      const controls = await controlsOf(send);
      let shot;
      if (a.screenshot !== false) {
        try {
          const s = await send("Page.captureScreenshot", { format: "jpeg", quality: SESSION_LIMITS.jpegQuality }, 15000);
          const b = typeof s.data === "string" ? s.data : "";
          if (b && bytesOfB64(b) <= SESSION_LIMITS.shotBytes) shot = { mime: "image/jpeg", b64: b, bytes: bytesOfB64(b), width: SESSION_LIMITS.viewport.width, height: SESSION_LIMITS.viewport.height };
        } catch (_) { shot = undefined; }
      }
      const outOfGrant = url && !inGrant(hosts, hostOf(url)) && !/^(about|data|blob):/i.test(url);
      const ho = handoffOf(parsed, 200, null, url);
      let handoff = ho;
      if (ho && (ho.kind === "login" || ho.kind === "captcha" || ho.kind === "challenge")) {
        let live = null;
        try { live = await chosen.p.liveView(deps.cfg, world, sessionId); } catch (_) { live = null; }
        handoff = { ...ho, sessionLive: true, liveView: live || undefined };
      }
      let liveView;
      if (action === "live") { try { liveView = (await chosen.p.liveView(deps.cfg, world, sessionId)) || undefined; } catch (_) { liveView = undefined; } }
      const snap = snapshotOf(parsed, a);
      result = {
        ok: !handoff && !outOfGrant, viaBrowser: true, provider: chosen.kind, action,
        state: await seal({ s: sessionId }), url,
        page: { title: snap.title, text: snap.text, textTruncated: snap.textTruncated },
        controls, liveView, screenshot: shot, screenshotOmitted: a.screenshot !== false && !shot ? true : undefined,
        blockedWrites: blockedWrites || undefined, blockedNavigations: blockedNav || undefined,
        ...(handoff ? { code: "handoff", handoff } : {}),
        ...(outOfGrant ? { code: "left_scope", host: hostOf(url) } : {}),
      };
      return result;
    } catch (e) {
      const why = String((e && e.message) || "");
      result = { ...fail(signal.aborted ? "upstream_timeout" : /socket/.test(why) ? "session_expired" : "session_failed"), state: await seal({ s: /socket/.test(why) ? "" : sessionId }) };
      return result;
    } finally { cdp.close(); }
  } catch (_) {
    return (result = fail("session_failed"));
  } finally {
    if (result) journal(result, jHost, jPath);
  }
}

/* The interactive controls on the page, from the browser's own accessibility tree. A ref is the DOM node's backend id (`n<id>`): stable while the
   node lives, and needs no table carried between calls. */
async function controlsOf(send) {
  let nodes = [];
  try { nodes = (await send("Accessibility.getFullAXTree", {}, 15000)).nodes || []; } catch (_) { return []; }
  const out = [];
  for (const n of nodes) {
    if (n.ignored || !n.backendDOMNodeId) continue;
    const role = String((n.role && n.role.value) || "");
    if (!CONTROL_ROLES.has(role)) continue;
    const props = {};
    for (const p of (n.properties || [])) props[p.name] = p.value && p.value.value;
    if (props.hidden) continue;
    const c = { ref: "n" + n.backendDOMNodeId, role, name: String((n.name && n.name.value) || "").slice(0, SESSION_LIMITS.controlNameChars) };
    if (n.value && n.value.value !== undefined && n.value.value !== "") c.value = String(n.value.value).slice(0, 80);
    if (props.disabled) c.disabled = true;
    if (props.checked !== undefined) c.checked = props.checked === true || props.checked === "true";
    out.push(c);
    if (out.length >= SESSION_LIMITS.controls) break;
  }
  return out;
}

const REF_RE = /^n(\d{1,9})$/;
async function centerOf(send, backendNodeId) {
  try { await send("DOM.scrollIntoViewIfNeeded", { backendNodeId }); } catch (_) { /* a node already in view */ }
  const q = ((await send("DOM.getBoxModel", { backendNodeId })).model || {}).content;
  if (!Array.isArray(q) || q.length < 8) return null;
  return { x: (q[0] + q[2] + q[4] + q[6]) / 4, y: (q[1] + q[3] + q[5] + q[7]) / 4 };
}
async function factsOf(send, backendNodeId) {
  const obj = (await send("DOM.resolveNode", { backendNodeId })).object;
  if (!obj || !obj.objectId) return null;
  const r = (await send("Runtime.callFunctionOn", { objectId: obj.objectId, functionDeclaration: FN_FACTS, returnByValue: true })).result || {};
  try { return { objectId: obj.objectId, ...JSON.parse(r.value) }; } catch (_) { return { objectId: obj.objectId }; }
}
async function resolveTarget(send, a) {
  const m = REF_RE.exec(String(a.ref || ""));
  if (m) return +m[1];
  if (Number.isFinite(+a.x) && Number.isFinite(+a.y) && a.x !== undefined && a.y !== undefined) {
    const r = await send("DOM.getNodeForLocation", { x: Math.round(+a.x), y: Math.round(+a.y), includeUserAgentShadowDOM: false });
    return r.backendNodeId || null;
  }
  return null;
}
async function mouseClick(send, p) {
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
}

/* One verb. Returns {} when done, or {code, extra} for a refusal that is NOT a transport failure. */
async function perform(action, a, ctx) {
  const { send, cdp } = ctx;
  switch (action) {
    case "open": {
      await send("Emulation.setDeviceMetricsOverride", { width: SESSION_LIMITS.viewport.width, height: SESSION_LIMITS.viewport.height, deviceScaleFactor: 1, mobile: false });
      const loaded = cdp.once("Page.loadEventFired", SESSION_LIMITS.gotoMs);
      const r = await send("Page.navigate", { url: ctx.target.toString() }, SESSION_LIMITS.gotoMs);
      if (r.errorText) return { code: "navigation_failed", extra: { say: String(r.errorText).slice(0, 80) } };
      await loaded;
      return {};
    }
    case "observe": return {};
    case "wait": await sleep(Math.min(SESSION_LIMITS.waitMaxMs, Math.max(0, Math.floor(+a.ms || 1000)))); return {};
    case "live": return {};
    case "scroll": {
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: SESSION_LIMITS.viewport.width / 2, y: SESSION_LIMITS.viewport.height / 2, deltaX: 0, deltaY: Math.max(-4000, Math.min(4000, Math.floor(+a.dy || 600))) });
      return {};
    }
    case "back": {
      const h = await send("Page.getNavigationHistory");
      if (!h.currentIndex) return { code: "no_history" };
      await send("Page.navigateToHistoryEntry", { entryId: h.entries[h.currentIndex - 1].id });
      return {};
    }
    case "press": {
      const key = String(a.key || "");
      if (!(key in KEYS)) return { code: "bad_key" };
      for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key, windowsVirtualKeyCode: KEYS[key] });
      return {};
    }
    case "click": {
      const id = await resolveTarget(send, a);
      if (!id) return { code: "no_target" };
      const f = await factsOf(send, id);
      if (!f) return { code: "no_target" };
      if (f.disabled) return { code: "control_disabled" };
      const p = await centerOf(send, id);
      if (!p) return { code: "not_visible" };
      await mouseClick(send, p);
      return {};
    }
    case "type": {
      const id = await resolveTarget(send, { ref: a.ref });
      if (!id) return { code: "no_target" };
      const f = await factsOf(send, id);
      if (!f) return { code: "no_target" };
      if (credentialField(f)) return { code: "credential_field", extra: { say: "A password / one-time-code / card field is the reader's to fill in the live view." } };
      if (!f.editable) return { code: "not_editable" };
      const text = String(a.text === undefined ? "" : a.text).slice(0, SESSION_LIMITS.typeChars);
      await send("DOM.focus", { backendNodeId: id });
      if (a.clear !== false) { await send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", modifiers: 2, commands: ["selectAll"] }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", modifiers: 2 }); }
      if (text) await send("Input.insertText", { text });
      return {};
    }
    case "select": {
      const id = await resolveTarget(send, { ref: a.ref });
      if (!id) return { code: "no_target" };
      const f = await factsOf(send, id);
      if (!f) return { code: "no_target" };
      const r = await send("Runtime.callFunctionOn", { objectId: f.objectId, functionDeclaration: FN_SELECT, arguments: [{ value: String(a.value === undefined ? "" : a.value).slice(0, 300) }], returnByValue: true });
      const v = (r.result || {}).value;
      return v === "ok" ? {} : { code: v === "no_option" ? "no_option" : "not_select" };
    }
    default: return { code: "bad_action" };
  }
}
