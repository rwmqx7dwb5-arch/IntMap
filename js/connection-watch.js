/* ============================================================================
 *  IntMap · connection-watch — what THIS page has actually contacted, as the browser reports it   (security-next)
 * ----------------------------------------------------------------------------
 *  IntMap publishes which hosts its browser code can contact and what each is sent (Privacy §4, held
 *  against the source by check:datagov through scripts/outbound-hosts.json). That statement is about the
 *  CODE. A reader could not see what the page they have open is doing — and the statement cannot see the
 *  addresses that are chosen at run time (a webcam's image server, a tile server the reader typed in, the
 *  publisher of an article). This module records what the page really contacts, from the browser's own
 *  accounts, and js/connections-panel.js holds each host against the published statement.
 *
 *  FOUR WITNESSES, each the browser's own (nothing here guesses from IntMap's code):
 *    · page    — Resource Timing (PerformanceObserver, `buffered`, so the requests made before this module
 *                ran are read too): every fetch, XHR, image, script, stylesheet, font, beacon and frame
 *                document the page's own thread loaded.
 *    · socket  — every WebSocket the page opens. Resource Timing does not report WebSockets, so the
 *                constructor is wrapped ONCE here (a subclass: same prototype, same constants, same
 *                behaviour; the address is noted after the browser accepted it).
 *    · worker  — requests made by background workers (the map engine loads tiles and GeoJSON in its own
 *                workers, and those never reach the page's Resource Timing). sw.js sees them and posts
 *                `connections-seen` batches here; only while sw.js controls the page, which is reported.
 *    · blocked — `securitypolicyviolation`: an address the page TRIED and the Content Security Policy
 *                refused. It never left the browser, so it is kept apart from what was contacted.
 *  Same-origin requests are IntMap itself and are counted, not listed. URLs are not kept — only the
 *  scheme and host (a tile URL can carry a key; the reader is shown who, not the full request).
 *
 *  Reached from: Settings ▸ Privacy ▸ «This page's connections» (index.html #btn-connections — one document
 *  listener below) and Atlas (`system.connections`, js/atlas-cap-system.js). The panel and the ledger
 *  (data/connection-ledger.json, derived from scripts/outbound-hosts.json) load on demand; this file is the
 *  only part on the boot path, because a witness that starts late has missed the start.
 * ==========================================================================*/

/* ⚠ A HOST TABLE THAT GROWS WITH THE PAGE MUST HAVE AN END. MEASURED 2026-10-03: the ledger names 177 hosts
   and a session that turns on every layer touches fewer than that; 2,000 distinct hosts is an order of magnitude
   above anything the code can reach and only data-chosen hosts (webcam servers, article publishers) could approach
   it. Past it a host is counted in `overflow` rather than listed, and the panel says so — never silently dropped.
   Expires if a feature starts contacting hosts by the thousand (then the panel needs paging, not a bigger table). */
export const MAX_HOSTS = 2000;
/* ⚠ A REFUSED REQUEST STILL GETS A RESOURCE TIMING ENTRY. MEASURED 2026-10-03 (Chromium, tests/security-next.spec.js): a
   <script src> the CSP refused appears in the page's Resource Timing AND fires securitypolicyviolation — so without this,
   an address that never left the browser was listed as «contacted». The two reports are matched by the exact URL (the
   violation's blockedURI is the entry's name), in either order: the entry already noted is taken back, or the refusal
   waits for its entry. RECENT_URLS bounds both memories — OBSERVED: the two reports of one refusal arrive within the
   same task or the next; 256 recent URLs is far more than can arrive between them. Expires if a browser starts
   reporting the violation long after the entry (then a refused URL older than the memory would stay listed). */
export const RECENT_URLS = 256;

/** The key a URL is recorded under — `scheme//host[:port]` — or '' for anything that is not a network
    request to another origin (data:, blob:, about:, the page's own origin). */
export function connectionKey(url, selfOrigin) {
  let u;
  try { u = new URL(String(url), selfOrigin || undefined); } catch (_) { return ''; }
  if (!/^(https?|wss?|ftp):$/.test(u.protocol)) return '';
  if (selfOrigin) {
    try {
      const o = new URL(selfOrigin);
      /* a WebSocket to the page's own host is the page itself in another scheme */
      if (u.host === o.host && (u.protocol === o.protocol || (u.protocol === 'wss:' && o.protocol === 'https:') || (u.protocol === 'ws:' && o.protocol === 'http:'))) return '';
    } catch (_) { /* no origin to compare */ }
  }
  return u.protocol + '//' + u.host;
}

/** The record. `deps.now()` is the clock (ms since the epoch). Pure — a test drives it with plain objects. */
export function createWatch(deps) {
  const d = deps || {};
  const now = d.now || (() => Date.now());
  const hosts = new Map();
  const blocked = new Map();
  const listeners = new Set();
  const recent = new Map();     /* exact URL → [{ key, via, kind, n }] the last notes, newest last (see RECENT_URLS) */
  const refusedFirst = new Set();   /* URLs the policy refused before their entry arrived */
  const remember = (m, k, v) => { m.delete(k); m.set(k, v); if (m.size > RECENT_URLS) m.delete(m.keys().next().value); };
  const state = { since: now(), selfRequests: 0, overflow: 0, workerWindows: 0, workerSeen: false };
  const emit = () => { for (const fn of listeners) { try { fn(); } catch (_) { /* a listener's error is its own */ } } };

  function into(table, key, via, kind, n, bytes, at) {
    let r = table.get(key);
    if (!r) {
      if (table.size >= MAX_HOSTS) { state.overflow += n; return false; }
      const i = key.indexOf('//');
      r = { key, scheme: key.slice(0, i - 1), host: key.slice(i + 2), count: 0, bytes: 0, first: at, last: at, via: {}, kinds: {} };
      table.set(key, r);
    }
    r.count += n; r.bytes += bytes || 0;
    if (at < r.first) r.first = at;
    if (at > r.last) r.last = at;
    r.via[via] = (r.via[via] || 0) + n;
    if (kind) r.kinds[kind] = (r.kinds[kind] || 0) + n;
    return true;
  }
  /* take back one note that turned out to be a refusal */
  function takeBack(u) {
    const list = recent.get(u);
    const last = list && list.pop();
    if (!list || !list.length) recent.delete(u);
    const r = last && hosts.get(last.key);
    if (!r) return false;
    r.count -= last.n; r.via[last.via] -= last.n;
    if (!r.via[last.via]) delete r.via[last.via];
    if (last.kind && r.kinds[last.kind]) { r.kinds[last.kind] -= last.n; if (!r.kinds[last.kind]) delete r.kinds[last.kind]; }
    if (r.count <= 0) hosts.delete(last.key);
    return true;
  }

  return {
    /** one request the browser reported. `via` is the witness: 'page' | 'socket' | 'worker'. */
    note(url, via, kind, opts) {
      const o = opts || {};
      const key = connectionKey(url, d.origin);
      if (!key) { if (via === 'page' && /^https?:/i.test(String(url))) state.selfRequests++; return; }
      const u = String(url), n = o.n || 1;
      if (refusedFirst.delete(u)) return;            /* the policy already said this one never left */
      if (into(hosts, key, via, kind || '', n, o.bytes || 0, o.at || now())) {
        const list = recent.get(u) || [];
        list.push({ key, via, kind: kind || '', n });
        remember(recent, u, list);
      }
      emit();
    },
    /** a batch from sw.js: { 'https://host': count } of requests made by background workers */
    noteWorkerBatch(batch, windows) {
      if (!batch || typeof batch !== 'object') return;
      state.workerSeen = true;
      state.workerWindows = Math.max(state.workerWindows, Number(windows) || 0);
      const at = now();
      for (const k of Object.keys(batch)) {
        const key = connectionKey(k, d.origin);
        const n = Math.max(1, Math.min(1e6, Number(batch[k]) || 1));
        if (key) into(hosts, key, 'worker', 'worker', n, 0, at);
      }
      emit();
    },
    /** an address the Content Security Policy refused (it was never contacted) */
    noteBlocked(url, directive) {
      const key = connectionKey(url, d.origin);
      if (!key) return;
      const u = String(url);
      if (!takeBack(u)) { refusedFirst.add(u); if (refusedFirst.size > RECENT_URLS) refusedFirst.delete(refusedFirst.values().next().value); }
      into(blocked, key, 'policy', String(directive || ''), 1, 0, now());
      emit();
    },
    /** a copy the panel and Atlas read — plain data, safe to serialise */
    snapshot() {
      const copy = (r) => ({ ...r, via: { ...r.via }, kinds: { ...r.kinds } });
      return {
        since: state.since, at: now(),
        selfRequests: state.selfRequests, overflow: state.overflow,
        workerSeen: state.workerSeen, workerWindows: state.workerWindows,
        hosts: [...hosts.values()].map(copy),
        blocked: [...blocked.values()].map(copy),
      };
    },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

/* ── the page's one instance, wired to the browser ─────────────────────────────────────────────── */
const W = (typeof window !== 'undefined') ? window : null;
/* a global named window is not always a page: a worker, or Node with a window shim (tests that read the generators), has no
   location — origin '' is the same «nothing to compare against» the absent window already gets */
export const connections = createWatch({ origin: (W && W.location) ? W.location.origin : '' });

/** What this page can and cannot witness right now — read by the panel so it states its own coverage. */
export function coverage() {
  const out = { page: false, socket: false, worker: false, workerReason: '', policy: false };
  if (!W) return out;
  out.page = typeof PerformanceObserver === 'function';
  out.socket = !!_socketWrapped;
  out.policy = true;
  try {
    if (!('serviceWorker' in navigator)) out.workerReason = 'unsupported';
    else if (!navigator.serviceWorker.controller) out.workerReason = 'not-controlled';
    else out.worker = true;
  } catch (_) { out.workerReason = 'unsupported'; }
  return out;
}

let _socketWrapped = false;
if (W) {
  /* ① page — Resource Timing. The default buffer holds 250 entries; `buffered` replays the buffer, so it is
     raised first (a boot makes more requests than that before the panel is ever opened). */
  try { if (performance && typeof performance.setResourceTimingBufferSize === 'function') performance.setResourceTimingBufferSize(4000); } catch (_) { /* not supported */ }
  try {
    const origin = performance.timeOrigin || (Date.now() - performance.now());
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        connections.note(e.name, 'page', e.initiatorType || 'other', { bytes: e.transferSize || 0, at: Math.round(origin + e.startTime) });
      }
    });
    po.observe({ type: 'resource', buffered: true });
  } catch (_) { /* no Resource Timing: coverage() says so */ }

  /* ② socket — the one constructor every WebSocket goes through */
  try {
    const Native = W.WebSocket;
    if (typeof Native === 'function' && !Native.__intmapWatched) {
      class WatchedWebSocket extends Native {
        constructor(url, protocols) {
          super(url, protocols);
          try { connections.note(this.url || url, 'socket', 'websocket'); } catch (_) { /* the socket is the point, not the record */ }
        }
      }
      Object.defineProperty(WatchedWebSocket, 'name', { value: 'WebSocket' });
      Object.defineProperty(WatchedWebSocket, '__intmapWatched', { value: true });
      W.WebSocket = WatchedWebSocket;
      _socketWrapped = true;
    }
  } catch (_) { /* left as the browser made it */ }

  /* ③ blocked — what the security policy refused */
  try {
    document.addEventListener('securitypolicyviolation', (e) => {
      const u = e.blockedURI || '';
      if (/^https?:|^wss?:/i.test(u)) connections.noteBlocked(u, e.effectiveDirective || e.violatedDirective);
    });
  } catch (_) { /* no DOM */ }

  /* ④ worker — sw.js's batches of what background workers requested */
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (ev) => {
        const m = ev && ev.data;
        if (m && m.type === 'connections-seen') connections.noteWorkerBatch(m.hosts, m.windows);
      });
    }
  } catch (_) { /* unsupported */ }

  /* the Settings entry — one document listener, like the status page's (js/layer-state.js) */
  try {
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('#btn-connections') : null;
      if (!b) return;
      try { const sm = document.getElementById('settings-modal'); if (sm) sm.style.display = 'none'; } catch (_) { /* no settings */ }
      import('./connections-panel.js').then((M) => M.open()).catch(() => { /* the chunk did not load; the button stays */ });
    });
  } catch (_) { /* no DOM */ }
}
