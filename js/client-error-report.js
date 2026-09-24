/* ============================================================================
 *  IntMap · client-error-report — send this tab's uncaught exceptions to IntMap's own record  (client-error-log)
 * ----------------------------------------------------------------------------
 *  THE DEFECT: error monitoring was a Sentry loader in index.html that no DSN was ever configured
 *  for. It returned on its first line for every visit, so an exception in a reader's browser was
 *  recorded nowhere but this tab's ring buffer (window.__imErrors, which a Bug Report carries out and
 *  nothing else reads). Nobody could learn that the live site was throwing until a reader said so.
 *
 *  NOW: `error` and `unhandledrejection` are scrubbed here with the SAME function the server uses
 *  (supabase/functions/_shared/client-error-shape.js — one file, two readers, no mirror) and sent to
 *  the client-errors Edge Function, which stores one row per distinct defect in public.client_errors
 *  for admin.html's «Errors» tab. What is and is not recorded is stated in the privacy policy
 *  (js/legal-text.js §1 and §6) and in that shape file's header.
 *
 *  THE BOUNDS, all on this side of the wire so a broken page cannot flood the endpoint:
 *    · the same fingerprint is sent ONCE per page load, however often it fires;
 *    · at most MAX_PER_SESSION reports per page load, then silence;
 *    · only from the production origin — a local preview (127.0.0.1, localhost) and any other host
 *      never send, so development and the test suite write nothing;
 *    · navigator.sendBeacon (survives the page being closed by the very error it reports), and
 *      fetch({ keepalive }) where there is no beacon. The body is text/plain so neither needs a CORS
 *      preflight; the server parses it as JSON regardless of the declared type.
 *  A failure to REPORT is swallowed: the reporter must never become an error of its own.
 *
 *  ⚠ THERE IS NO PER-READER OPT-OUT, because IntMap has no telemetry-consent setting to follow —
 *  the only switch of that kind is the site-wide `window.INTMAP_ANALYTICS`, which governs third-party
 *  analytics and is off. What this sends carries no identity (the shape file's header), which is why
 *  it is not behind that switch; the privacy policy §1 states exactly what is sent.
 * ==========================================================================*/
import {
  MAX_PER_SESSION,
  PRODUCTION_ORIGIN,
  fingerprint,
  shapeReport,
} from '../supabase/functions/_shared/client-error-shape.js';

const FUNCTION = 'client-errors';

/* The reporter, built from what it needs rather than reaching for globals, so a test can evaluate
   the real thing with a fake transport and a fake origin.
     deps = { origin, release, path(), endpoint(), send(url, text) → boolean }
   Returns { report(raw) → Promise<'sent'|'dropped'|'duplicate'|'capped'|'off'>, seen, sent }. */
export function createReporter(deps) {
  const d = deps || {};
  const seen = new Set();
  let sent = 0;
  const on = d.origin === PRODUCTION_ORIGIN;
  async function report(raw) {
    try {
      if (!on) return 'off';
      if (sent >= MAX_PER_SESSION) return 'capped';
      const shaped = shapeReport(raw, { release: d.release, path: d.path ? d.path() : '' });
      if (!shaped) return 'dropped';
      const fp = await fingerprint(shaped);
      if (seen.has(fp)) return 'duplicate';
      /* re-checked after the await: two errors in one tick both passed the first check */
      if (sent >= MAX_PER_SESSION) return 'capped';
      seen.add(fp);
      sent++;
      const url = d.endpoint ? d.endpoint() : '';
      if (!url) return 'dropped';
      const body = JSON.stringify({
        release: shaped.release,
        path: shaped.path,
        errors: [{ kind: shaped.kind, message: shaped.message, stack: shaped.stack }],
      });
      d.send(url, body);
      return 'sent';
    } catch (_) {
      return 'dropped';
    }
  }
  return { report, seen, get sent() { return sent; } };
}

/* One ErrorEvent / PromiseRejectionEvent as { kind, message, stack }. A rejection whose reason is
   not an Error carries no stack and may carry any value at all, so it is described by its type —
   and that description is one of the benign classes, i.e. it is not stored (the same decision the
   Sentry filter made: docs/MONITORING.md «Error classification»). */
export function fromEvent(ev, kind) {
  if (kind === 'rejection') {
    const r = ev && ev.reason;
    if (r instanceof Error || (r && typeof r === 'object' && typeof r.message === 'string' && typeof r.stack === 'string')) {
      return { kind: 'rejection', message: (r.name && r.name !== 'Error' ? r.name + ': ' : '') + r.message, stack: r.stack || '' };
    }
    return { kind: 'rejection', message: 'Non-Error promise rejection', stack: '' };
  }
  const e = ev && ev.error;
  /* Chromium prefixes the event's message with «Uncaught »; the same defect should fingerprint the
     same whichever engine threw it. */
  const message = String((ev && ev.message) || (e && e.message) || '').replace(/^Uncaught\s+/, '');
  return { kind: 'error', message, stack: (e && typeof e.stack === 'string') ? e.stack : '' };
}

function beacon(url, text) {
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([text], { type: 'text/plain' }))) return true;
  } catch (_) { /* fall through to fetch */ }
  try {
    fetch(url, { method: 'POST', body: text, keepalive: true, mode: 'cors', credentials: 'omit', headers: { 'content-type': 'text/plain' } }).catch(() => {});
    return true;
  } catch (_) {
    return false;
  }
}

/* ── install, in a browser only (Node evaluates this file for the tests; Deno never loads it) ── */
if (typeof window !== 'undefined' && typeof document !== 'undefined' && typeof window.addEventListener === 'function') {
  const reporter = createReporter({
    origin: location.origin,
    release: window.INTMAP_BUILD || '',
    path: () => location.pathname,
    /* window.SUPABASE_URL is published by src/vendor.js, which is imported before this file; read at
       report time anyway, the way js/proxy-fetch.js does, so the order is not load-bearing. */
    endpoint: () => { const b = String(window.SUPABASE_URL || '').replace(/\/$/, ''); return b ? b + '/functions/v1/' + FUNCTION : ''; },
    send: beacon,
  });
  window.addEventListener('error', (ev) => { reporter.report(fromEvent(ev, 'error')); });
  window.addEventListener('unhandledrejection', (ev) => { reporter.report(fromEvent(ev, 'rejection')); });
}
