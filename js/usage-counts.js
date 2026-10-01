/* ============================================================================
 *  IntMap · usage-counts — this page load's ANONYMOUS usage counts, sent to IntMap's own counters  (anonymous-usage-counts)
 * ----------------------------------------------------------------------------
 *  THE DECISION (operator, 2026-10-01): measure what marketing reaches with IntMap's own aggregate
 *  counters only — no cookie, no analytics vendor, no IP, no person. What may be counted is declared
 *  ONCE, in supabase/functions/usage-count/shape.js, which this file and the usage-count Edge
 *  Function both import (one file, two readers, no mirror). The privacy policy (js/legal-text.js §1)
 *  states the same list.
 *
 *  WHAT IS COUNTED, AND WHERE IT IS HEARD — each from ONE place the app already has, never by a line
 *  added to a feature:
 *    · at load: one page view; the entry (a link carrying a map view / ?embed=1); the referring
 *      HOST NAME only; the three utm_* tags of the address. At the first send: the app language as
 *      en/jp/other and the device as mobile/desktop (js/ui-device.js IntMapDevice.kind()).
 *    · a LAYER the reader switches on: the Layers registry's checkboxes (`#layer-dropdown`), heard as
 *      their `change` — the one path every layer row, the session restore and Atlas use. Only a change
 *      the READER caused counts (a trusted event, or one inside the browser's user-activation window),
 *      so restoring last session's layers at boot is not counted as using them. Only ids
 *      js/layer-manifest.js holds are sent.
 *    · a FEATURE (FEATURES below): a click on its control (one delegated listener on the document), or
 *      its Atlas capability completing (IntMapOS's bus — the kernel broadcasts every operation's
 *      lifecycle there), or the browser's own `appinstalled` event. Counted once per page load.
 *    · an ATLAS QUESTION: the console's turn-start event on the same bus — the COUNT only. The
 *      question is never read here and never sent.
 *  Nothing else is read: no User-Agent string, no account, no time, no address beyond the above.
 *
 *  WHEN NOTHING IS SENT AT ALL:
 *    · Do Not Track or Global Privacy Control is on in the browser;
 *    · the reader switched «Anonymous usage statistics» off in Settings (or asked Atlas to) — it stops
 *      AT ONCE: what this page had counted and not yet sent is discarded;
 *    · the page is not on the production origin — a local preview and the test suite never send.
 *  HOW IT IS SENT: batched, and sent only when the page is hidden or closed (navigator.sendBeacon,
 *  fetch({ keepalive }) without it), as text/plain so no CORS preflight is needed.
 *  A failure to SEND is swallowed: counting must never become an error of its own.
 * ==========================================================================*/
import { PRODUCTION_ORIGIN } from '../supabase/functions/_shared/client-error-shape.js';
import {
  METRICS,
  MAX_ROWS_PER_REQUEST,
  acceptRow,
  encode,
  langBucket,
  referrerOf,
  campaignOf,
  entryOf,
} from '../supabase/functions/usage-count/shape.js';
import { isLayer } from './layer-manifest.js';

const FUNCTION = 'usage-count';
/* the one stored preference — present only when the reader changed it; absent = on (the default) */
export const PREF_KEY = 'intmap_usage_counts';
const SEND_DEADLINE_MS = 15000;   /* the fetch fallback's deadline — the reason is beside its one use */

/* ══ WHERE EACH FEATURE IS HEARD ══════════════════════════════════════════════════════════════
   The keys are the `feature` metric's dimensions in shape.js — the test holds the two sets equal.
     capability  the Atlas capability whose `completed` phase means the feature was used
     control     a selector; a click inside it means the same
     linkTo      the addresses a clicked link may point at (read at click time from what the app
                 publishes — js/app-body.js writes the two donation links — not copied here)
     event       a window event the browser itself fires */
export const FEATURES = Object.freeze({
  compare:   { capability: 'panel.compare', control: '#btn-compare' },
  /* every time-animation player's play button carries data-act="play": the forecast/clock player
     js/weather.js IntMapWxPlayer builds, and the radar loop's (js/data-layers.js) */
  timelapse: { control: '[data-act="play"]' },
  share:     { capability: 'panel.share', control: '#btn-share' },
  donate:    { linkTo: () => { try { return [window.INTMAP_STRIPE_URL_EN, window.INTMAP_STRIPE_URL_JP]; } catch (_) { return []; } } },
  install:   { event: 'appinstalled' },
});

/** Why nothing would be sent, or null when counting is on. */
export function optOutReason(env) {
  const e = env || {};
  if (e.dnt) return 'dnt';
  if (e.gpc) return 'gpc';
  if (e.pref === 'off') return 'off';
  if (e.origin !== PRODUCTION_ORIGIN) return 'local';
  return null;
}

/* The counter, built from what it needs rather than reaching for globals, so a test evaluates the
   real thing with a fake transport.
     deps = { reason() → null|'dnt'|'gpc'|'off'|'local', endpoint() → url, send(url, text) → boolean }
   ⚠ `reason()` is asked on EVERY add and every flush — switching the preference off is effective on
   the next event, not the next page load. */
export function createCounter(deps) {
  const d = deps || {};
  const pending = new Map();          // metric \0 dimension → row
  const once = new Set();             // what this page load has already counted once
  let sentRequests = 0;
  const reason = () => { try { return d.reason ? d.reason() : 'local'; } catch (_) { return 'local'; } };
  const recording = () => { const r = reason(); return r === null || r === 'local'; };

  /** add(metric, dimension, n) — counts it (once per page load unless the metric allows more) */
  function add(metric, dimension, n) {
    try {
      if (!recording()) { pending.clear(); return false; }
      const r = acceptRow(metric, dimension, n == null ? 1 : n);
      if (!r) return false;
      const key = r.m + '\u0000' + r.d;
      if (METRICS[r.m].max === 1) {
        if (once.has(key)) return false;
        once.add(key);
      }
      const prev = pending.get(key);
      if (prev) prev.n += r.n;
      else pending.set(key, r);
      return true;
    } catch (_) { return false; }
  }

  /** the request bodies a flush would send now (split at MAX_ROWS_PER_REQUEST; a row whose count
      passed its per-request max is split across requests too, never inflated or truncated) */
  function bodies() {
    /* an opt-out that arrived since the last event (Do Not Track switched on, the setting turned off)
       discards here too — what is pending is never shown as if it would still go */
    if (!recording()) { pending.clear(); return []; }
    const rows = [];
    for (const r of pending.values()) {
      const max = METRICS[r.m].max;
      for (let left = r.n; left > 0; left -= max) rows.push({ m: r.m, d: r.d, n: Math.min(left, max) });
    }
    const out = [];
    for (let i = 0; i < rows.length; i += MAX_ROWS_PER_REQUEST) out.push(encode(rows.slice(i, i + MAX_ROWS_PER_REQUEST)));
    return out;
  }

  /** flush() — sends what is pending; returns how many requests went. Discards when opted out. */
  function flush() {
    try {
      const r = reason();
      if (r !== null) { if (r !== 'local') pending.clear(); return 0; }
      if (!pending.size) return 0;
      const url = d.endpoint ? d.endpoint() : '';
      if (!url) return 0;
      const list = bodies();
      pending.clear();
      let n = 0;
      for (const b of list) { try { if (d.send(url, b) !== false) n++; } catch (_) { /* swallowed */ } }
      sentRequests += n;
      return n;
    } catch (_) { return 0; }
  }

  return {
    add, flush, bodies, reason,
    pending: () => Array.from(pending.values()).map((r) => ({ m: r.m, d: r.d, n: r.n })),
    discard: () => pending.clear(),
    get sent() { return sentRequests; },
  };
}

/* ── what the page says about itself at load ─────────────────────────────────────────────────── */

/** the counts a page load records before anything is used */
export function arrivalRows(page) {
  const p = page || {};
  const rows = [{ m: 'view', d: '' }];
  const entry = entryOf(p.search, p.hash, p.navType);
  if (entry) rows.push({ m: 'entry', d: entry });
  const ref = referrerOf(p.referrer, p.host);
  if (ref) rows.push({ m: 'ref', d: ref });
  return rows.concat(campaignOf(p.search));
}

/** the feature a click inside `el` uses, or null */
export function featureOfClick(el) {
  if (!el || typeof el.closest !== 'function') return null;
  for (const k of Object.keys(FEATURES)) {
    const f = FEATURES[k];
    try {
      if (f.control && el.closest(f.control)) return k;
      if (f.linkTo) {
        const a = el.closest('a[href]');
        if (!a) continue;
        const href = String(a.href || a.getAttribute('href') || '');
        const strip = (u) => { try { const x = new URL(String(u)); return x.origin + x.pathname; } catch (_) { return null; } };
        const at = strip(href);
        if (at && f.linkTo().some((u) => u && strip(u) === at)) return k;
      }
    } catch (_) { /* a selector a browser cannot parse is not a click on it */ }
  }
  return null;
}

/** the feature a bus event says was used, or null. Only the executor's own lifecycle event (it
    carries `capabilityId`) is read; the syscall-log copy of the same phase carries `cmd` instead. */
export function featureOfOperation(ev) {
  if (!ev || ev.phase !== 'completed' || !ev.capabilityId) return null;
  for (const k of Object.keys(FEATURES)) if (FEATURES[k].capability === ev.capabilityId) return k;
  return null;
}

/** the page's switch — { status(), set(on), preview(), pending() } in a browser, null where nothing
    was installed (Node). A live binding: Atlas's settings.usageCounts imports it. */
export let usage = null;

/** the console's turn-start event (js/atlas-console.js emits it on IntMapOS when a question is sent) */
export function isAtlasQuestion(ev) {
  return !!(ev && ev.kernel === 'atlas' && ev.phase === 'turn' && !ev.capabilityId);
}

/* ── install, in a browser only (Node evaluates this file for the tests; Deno never loads it) ──── */
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof window.addEventListener === 'function') {
  const readPref = () => { try { return localStorage.getItem(PREF_KEY) === 'off' ? 'off' : 'on'; } catch (_) { return 'on'; } };
  const env = () => {
    let dnt = false, gpc = false;
    try {
      const n = navigator || {};
      dnt = n.doNotTrack === '1' || n.doNotTrack === 'yes' || window.doNotTrack === '1' || n.msDoNotTrack === '1';
      gpc = n.globalPrivacyControl === true;
    } catch (_) { /* unreadable = not set */ }
    return { dnt, gpc, pref: readPref(), origin: location.origin };
  };
  const beacon = (url, text) => {
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([text], { type: 'text/plain' }))) return true;
    } catch (_) { /* fall through to fetch */ }
    try {
      /* SEND_DEADLINE_MS = 15 s: the answer is never read, so the deadline only bounds how long a
         browser without sendBeacon keeps the request open; 15 s is far past the function's measured
         sibling (client-errors answers in well under a second) and short of any tab lifetime that
         matters. Expires if the function ever has to wait on something slower than one RPC. */
      const signal = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(SEND_DEADLINE_MS) : undefined;
      fetch(url, { method: 'POST', body: text, keepalive: true, mode: 'cors', credentials: 'omit', headers: { 'content-type': 'text/plain' }, signal }).catch(() => {});
      return true;
    } catch (_) { return false; }
  };
  const counter = createCounter({
    reason: () => optOutReason(env()),
    /* window.SUPABASE_URL is published by src/vendor.js; read at send time, as js/client-error-report.js does */
    endpoint: () => { const b = String(window.SUPABASE_URL || '').replace(/\/$/, ''); return b ? b + '/functions/v1/' + FUNCTION : ''; },
    send: beacon,
  });

  /* ① the arrival — read NOW, before js/map-ui.js rewrites the hash with this session's own view */
  let navType = null;
  try { const nav = performance.getEntriesByType('navigation')[0]; navType = nav ? nav.type : null; } catch (_) { navType = null; }
  for (const r of arrivalRows({ search: location.search, hash: location.hash, navType, referrer: document.referrer, host: location.hostname })) counter.add(r.m, r.d);

  /* ② language and device, once, at the first send — the app has chosen its language by then */
  let described = false;
  const describe = () => {
    if (described) return;
    described = true;
    let lang = '';
    try { lang = (window.IM_HOST && window.IM_HOST.lang) || document.documentElement.getAttribute('lang') || ''; } catch (_) { lang = ''; }
    counter.add('lang', langBucket(lang));
    let kind = 'desktop';
    try { const D = window.IntMapDevice; if (D) kind = D.kind(); } catch (_) { kind = 'desktop'; }
    counter.add('device', kind === 'desktop' ? 'desktop' : 'mobile');
  };
  const flush = () => { describe(); counter.flush(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);

  /* ③ a layer the READER switched on */
  document.addEventListener('change', (e) => {
    const cb = e.target;
    if (!cb || cb.type !== 'checkbox' || !cb.checked || !cb.id || !isLayer(cb.id)) return;
    try { if (!(cb.closest && cb.closest('#layer-dropdown'))) return; } catch (_) { return; }
    let byReader = !!e.isTrusted;
    try { if (!byReader && navigator.userActivation) byReader = !!navigator.userActivation.isActive; } catch (_) { /* unknown = not the reader */ }
    if (byReader) counter.add('layer', cb.id);
  }, true);

  /* ④ features: clicks, the browser's install event … */
  document.addEventListener('click', (e) => { const f = featureOfClick(e.target); if (f) counter.add('feature', f); }, true);
  for (const k of Object.keys(FEATURES)) {
    const ev = FEATURES[k].event;
    if (ev) window.addEventListener(ev, () => counter.add('feature', k));
  }
  /* … and the kernel's bus (capabilities completing, Atlas questions). IntMapOS is created by
     js/app-body.js's boot — after this module, and later still when the 3-D engine is pending — so
     the subscription is attempted at each moment it could first exist, and made once. */
  let attached = false;
  const attach = () => {
    if (attached) return;
    let os = null;
    try { os = window.IntMapOS; } catch (_) { os = null; }
    if (!os || typeof os.on !== 'function') return;
    attached = true;
    os.on((ev) => {
      if (isAtlasQuestion(ev)) { counter.add('atlas', ''); return; }
      const f = featureOfOperation(ev);
      if (f) counter.add('feature', f);
    });
  };
  document.addEventListener('DOMContentLoaded', () => setTimeout(attach, 0));
  window.addEventListener('load', attach);
  for (const t of ['pointerdown', 'keydown']) document.addEventListener(t, attach, { capture: true, passive: true });

  /* ⑤ the switch — Settings and Atlas (settings.usageCounts) both go through set() */
  const SELECT_ID = 'setting-usage-counts';
  const paint = () => { try { const s = document.getElementById(SELECT_ID); if (s) s.value = readPref(); } catch (_) { /* no settings panel */ } };
  function set(on) {
    try {
      if (on) localStorage.removeItem(PREF_KEY);
      else localStorage.setItem(PREF_KEY, 'off');
    } catch (_) { /* storage blocked: the default stands */ }
    if (!on) counter.discard();
    paint();
    return status();
  }
  function status() {
    const r = optOutReason(env());
    return { on: readPref() === 'on', sending: r === null, reason: r };
  }
  document.addEventListener('DOMContentLoaded', () => {
    paint();
    const s = document.getElementById(SELECT_ID);
    if (s) s.addEventListener('change', () => set(s.value !== 'off'));
  });

  /* what the settings panel and Atlas use (by import — `usage` below) and a test may read on `window`
     (the built page has no import path a spec can reach) — and nothing that sends */
  usage = {
    status,
    set,
    /** the request bodies a send would carry right now (what the page would tell the server) */
    preview: () => { describe(); return counter.bodies(); },
    pending: () => counter.pending(),
  };
  window.IntMapUsage = usage;
}
