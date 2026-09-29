/*  IntMap · A fetch that is guaranteed to end  (#R452)
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ WHY THIS IS A FILE AND NOT THREE `setTimeout`s.
 *
 *  Reported: 「Atlas が回答を描画しないまま止まり、2分待っても Searching のまま」. `ai-proxy`
 *  answered 200 both times; what never came back was the evidence. Counting the awaits between
 *  「Atlas chose a tool」 and 「the reply is drawn」 on the live build, the ones with no clock of any
 *  kind were:
 *
 *      js/atlas-geo-resolve.js  geocode()      → nominatim.openstreetmap.org, no signal
 *      js/atlas-geo-resolve.js  _nomExtent()   → nominatim, no signal — placeExtent() calls it 3×
 *      js/atlas-verify.js       _atlGeocodeStrict() → nominatim, no signal, and the mapping audit
 *                                                     awaits up to 24 of them ONE AFTER ANOTHER,
 *                                                     immediately before the answer is drawn
 *
 *  All three are the same host, and Nominatim's answer to a client it does not like is to stop
 *  answering. A request with no deadline against a host that has stopped answering is not slow —
 *  it is permanent, and everything downstream of it inherits that.
 *
 *  ⚠ THE CLOCK HAS TO COVER THE BODY. The pattern that was already in the codebase cleared its
 *  timeout the moment the HEADERS arrived and then awaited `r.json()` outside it, so a response
 *  that began and stalled was bounded by nothing (js/proxy-fetch.js carries the measurement).
 *  This helper does not hand back a Response for exactly that reason: it reads the body itself,
 *  inside the same clock, and hands back the parsed value.
 *
 *  ⚠ TWO EXPORTS, ONE CLOCK — tests/r175-checks ③ requires that a js/ module has no unexported
 *  top-level declaration and no export nobody imports, so both readers come out of one closure.
 *
 *  ══ (stalled-fetch-and-surface-gauge) THE SAME CLOCK FOR A LAYER'S OWN READS ═════════════════════
 *  A map row's request (js/data-layers.js `toggleLayer`, recorded in js/layer-rows.js `layerInflight`)
 *  is waited on by the self-heal until it settles, so a read with no end kept its row «in flight» for
 *  the session: never judged, never reported. Two of those reads were not JSON — the GIBS WMS probe
 *  of the fire layer reads a status, a content type and, on failure, the ServiceException text — and
 *  one is a 2.2 MB file, for which a deadline on the WHOLE read measures the reader's line rather
 *  than a stall. So:
 *    · readWithin() hands back { ok, status, type, text }, the body read inside the clock;
 *    · `opts.idle` restarts the clock on every chunk of the body, so `ms` bounds the longest SILENCE
 *      (the wait for the headers included) instead of the length of the download. A slow line that
 *      keeps delivering is not a stall; a connection that stops is, at any size.
 *  How long a given URL may take is not decided here — js/proxy-fetch.js `clockFor` says, per host.
 */
import { clockFor } from './proxy-fetch.js';   /* (fetch-deadline-layer) only to hand it on, with the readers, to the classic scripts below */
export const { jsonWithin, readWithin } = (() => {
  /* An AbortController is standard everywhere IntMap runs; the guard is for the node checks, which
     evaluate this module without a DOM. Without one the deadline simply cannot be enforced, and the
     honest thing is to say so rather than to pretend the call was bounded. */
  const canAbort = () => { try { return typeof AbortController === 'function'; } catch (_) { return false; } };

  /* the body as text, re-arming the clock on every chunk when the caller asked for an idle clock */
  const bodyText = async (r, rearm) => {
    const s = r.body;
    if (!rearm || !s || typeof s.getReader !== 'function' || typeof TextDecoder !== 'function') return r.text();
    const rd = s.getReader(), dec = new TextDecoder();
    let out = '';
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      rearm();
      out += dec.decode(value, { stream: true });
    }
    return out + dec.decode();
  };

  /* ══ (fetch-deadline-layer) WHY NOTHING ARRIVED IS PART OF THE ANSWER ══════════════════════════
     Every throw below carries `reason` — 'timeout' | 'aborted' | 'network' | 'http' | 'parse' — and,
     for 'http' and 'parse', `status`. Before, the deadline and a refusal reached the caller as two
     Errors that differed only in their message text, so the callers that needed to say which (js/wx-source.js
     guardedJSON, whose `.catch(() => null)` made 「the host stopped answering」, 「the host said no」
     and 「there is nothing here」 one null) had nothing to read. ⚠ 'aborted' is the CALLER's signal —
     a Stop or a superseding turn — and must never be reported as the host's failure
     (.agents/rules/one-pass-or-a-reason.md §5: 「could not observe」 is not 「failed」). The error is
     the one the platform threw, so a caller testing `e.name === 'AbortError'` still sees it. */
  const failed = (e, reason, extra) => {
    const err = (e && typeof e === 'object') ? e : new Error(String(e));
    try { err.reason = reason; if (extra) Object.assign(err, extra); } catch (_) { /* a frozen error keeps its own shape */ }
    return err;
  };

  /* readWithin(url, ms, init, opts) -> { ok, status, type, text }
   *
   * THROWS on a network refusal or the deadline — «nothing arrived». A non-2xx status is NOT a throw:
   * it is an answer, and a caller that reads the error body (the fire probe does) needs it. */
  async function readWithin(url, ms, init, opts) {
    const c = canAbort() ? new AbortController() : null;
    /* ⚠ THE CALLER'S SIGNAL IS CHAINED, NOT REPLACED. `init.signal` is how Stop and a superseding
       turn reach a request that is already in flight; overwriting it with our own controller — the
       obvious way to write this — would silently disconnect it. */
    const outer = (init && init.signal) || null;
    const relay = () => { try { c && c.abort(); } catch (_) { /* already done */ } };
    if (outer && c) { if (outer.aborted) relay(); else { try { outer.addEventListener('abort', relay); } catch (_) { /* no listener support */ } } }
    let timedOut = false, t = null;
    const arm = () => { if (t) clearTimeout(t); t = (c && ms > 0) ? setTimeout(() => { timedOut = true; relay(); }, ms) : null; };
    arm();
    try {
      const opt = Object.assign({}, init || {});
      if (c) opt.signal = c.signal;
      const r = await fetch(url, opt);
      const idle = !!(opts && opts.idle);
      if (idle) arm();   /* the headers are a sign of life too */
      let type = '';
      try { type = String((r.headers && r.headers.get && r.headers.get('content-type')) || ''); } catch (_) { type = ''; }
      const text = await bodyText(r, idle ? arm : null);
      return { ok: !!r.ok, status: r.status, type, text };
    } catch (e) {
      if (timedOut) throw failed(new Error('deadline ' + ms + 'ms'), 'timeout');
      throw failed(e, ((outer && outer.aborted) || (e && e.name === 'AbortError')) ? 'aborted' : 'network');
    } finally {
      if (t) clearTimeout(t);
      if (outer && c) { try { outer.removeEventListener('abort', relay); } catch (_) { /* nothing to remove */ } }
    }
  }

  /* jsonWithin(url, ms, init, opts) -> the parsed JSON body
   *
   * THROWS on anything that is not a parsed JSON body: a network refusal, a non-2xx status, a body
   * that is not JSON, or the deadline. Callers already distinguish 「the source said nothing」 from
   * 「the source could not be reached」 with try/catch, so a throw is the shape that fits them —
   * and a timeout reaching the same branch as a refusal is correct: in both cases nothing arrived. */
  async function jsonWithin(url, ms, init, opts) {
    const r = await readWithin(url, ms, init, opts);
    if (!r.ok) throw failed(new Error('http ' + r.status), 'http', { status: r.status });
    try { return JSON.parse(r.text); } catch (e) { throw failed(e, 'parse', { status: r.status }); }
  }

  return { jsonWithin, readWithin };
})();

/* ══ (fetch-deadline-layer) THE SAME CLOCK FOR THE FILES THAT CANNOT IMPORT IT ════════════════════
   js/countries-ui.js and js/routing-ops.js are run as CLASSIC scripts by the node harnesses (tests/r453 ⑤
   and the loader harnesses of tests/r375 / r423 execute them with `new Function`; tests/r184 #5 parses
   routing-ops as a script), so an `import` line is not open to them — and both held a read with no end
   (the Natural Earth loader, the earthquakes along a route). They reach this module the way classic
   scripts reach js/nominatim-gate.js: through one window name, carrying the two readers and the host
   table's clock, so there is still exactly one of each. Guarded for node, where there is no window. */
if (typeof window !== 'undefined') window.IntMapFetchWithin = { jsonWithin, readWithin, clockFor };
