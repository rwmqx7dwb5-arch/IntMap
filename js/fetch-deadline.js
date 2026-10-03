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
 *  ⚠ TWO EXPORTS, ONE CLOCK — tests/layer-boot-graph-checks.test.mjs #R175 ③ requires that a js/ module has no unexported
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
 *  What a caller does when the clock runs out is decided once, below the two readers
 *  (`isUnobserved`, `untilObserved` — unobserved-is-not-refused).
 */
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
  /* (data-one-door) …and the body as BYTES, for the one reader whose files are not text: js/data-door.js
     reads the shipped `data/*.gz`, whose gzip body a TextDecoder would corrupt. Same clock, same re-arm
     per chunk — it is the text reader above with the decode step left out, not a second clock. */
  const bodyBytes = async (r, rearm) => {
    const s = r.body;
    if (!rearm || !s || typeof s.getReader !== 'function') return r.arrayBuffer();
    const rd = s.getReader(), parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      rearm();
      parts.push(value); n += value.byteLength;
    }
    const out = new Uint8Array(n);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.byteLength; }
    return out.buffer;
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
   *                                   (or `bytes`, an ArrayBuffer, in place of `text` when `opts.bytes`)
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
    /* ══ (fetch-deadline-layer) THE CLOCK COUNTS THE HOST'S SILENCE, NOT THIS PAGE'S OWN STALL ══════
       MEASURED (nightly deep tier, tests/restored-layer-before-style.spec.js, 2026-09-28/29): a tab
       restoring many layers froze its own main thread for 3.8–30 s while RainViewer answered in
       0.2–2.9 s. One `setTimeout(ms)` fires the moment the thread comes back — before the response
       that has been sitting in the queue — so a 6 s deadline reported 「the host did not answer」 and
       the radar row was switched off. The deadline measured the READER, which is exactly what
       .agents/rules/one-pass-or-a-reason.md §2 ① forbids (an observer that reports success as failure).
       So the clock is a count of steps of at most STEP_MS, each credited with exactly its own length
       when its timer runs: a frozen stretch delays the next step and so counts as one step, however
       long it was, and time the page could not have observed a reply in is never charged to the host.
       (Counting timer runs rather than reading a wall clock is also what lets a test drive it with
       mocked timers.) If the LAST step was itself delayed by a freeze, one more step is
       taken instead of aborting, so a reply queued behind the freeze is read first. Cost: one timer per step per request in
       flight. Side effect, intended: a background tab (timers throttled to ~1 s) waits longer before
       calling a host silent.
       STEP_MS — observation: the freezes above are seconds long and every clock in clockFor is
       ≥ 1,500 ms, so 250 ms keeps ≥ 6 steps per deadline. Invalid if a clock under ~1 s appears (the
       step then shrinks to ms/4 on its own). Canonical here; nothing else uses it. */
    const STEP_MS = 250;
    let timedOut = false, t = null, silent = 0, done = false;
    const step = Math.max(1, Math.min(STEP_MS, ms / 4));
    const now = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
    const next = () => { const d = Math.min(step, ms - silent), at = now(); t = setTimeout(() => tick(d, at), d); };
    const tick = (d, at) => {
      silent += d;
      if (silent < ms) { next(); return; }
      if (now() - at > 2 * d + 50) { silent -= d; next(); return; }   /* the last step was a freeze, not silence */
      t = null; if (!done) { timedOut = true; relay(); }
    };
    const arm = () => { if (t) clearTimeout(t); t = null; silent = 0; if (c && ms > 0) next(); };
    arm();
    try {
      const opt = Object.assign({}, init || {});
      if (c) opt.signal = c.signal;
      const r = await fetch(url, opt);
      const idle = !!(opts && opts.idle);
      if (idle) arm();   /* the headers are a sign of life too */
      let type = '';
      try { type = String((r.headers && r.headers.get && r.headers.get('content-type')) || ''); } catch (_) { type = ''; }
      if (opts && opts.bytes) {
        const bytes = await bodyBytes(r, idle ? arm : null);
        done = true;
        return { ok: !!r.ok, status: r.status, type, bytes };
      }
      const text = await bodyText(r, idle ? arm : null);
      done = true;
      return { ok: !!r.ok, status: r.status, type, text };
    } catch (e) {
      done = true;
      /* (shell-experience) …AND WHICH URL IT WAS. js/layer-state.js keeps it on the row's record so the
         reader can be told what last night's check said about that supplier (js/service-status.js
         upstreamNote) — the request names its host; no table maps a layer to one. It stays in the page. */
      if (timedOut) throw failed(new Error('deadline ' + ms + 'ms'), 'timeout', { url: String(url) });
      throw failed(e, ((outer && outer.aborted) || (e && e.name === 'AbortError')) ? 'aborted' : 'network', { url: String(url) });
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
    if (!r.ok) throw failed(new Error('http ' + r.status), 'http', { status: r.status, url: String(url) });
    try { return JSON.parse(r.text); } catch (e) { throw failed(e, 'parse', { status: r.status, url: String(url) }); }
  }

  return { jsonWithin, readWithin };
})();

/* ══ (unobserved-is-not-refused) «NOTHING WAS OBSERVED» IS NOT «THE HOST SAID NO» ═══════════════════
   MEASURED (nightly deep tier, run 36493764477, tests/restored-layer-before-style.spec.js): the radar
   row's frame index timed out under load, and the row's failure arm — written for a refusal — toasted
   「Live weather data unavailable」, UNTICKED the box and never asked again. The layer was gone for
   the session because the page had been too busy to read an answer, which is the confusion
   .agents/rules/one-pass-or-a-reason.md §5 forbids: 「could not observe」 is not 「failed」.
   Every throw above already carries `reason`; this is the ONE reading of it that a caller branches on,
   so no caller spells the list of reasons itself.
     · 'timeout'  — the clock ran out: the host may have answered and nobody was there to read it.
                    UNOBSERVED.
     · 'aborted'  — the caller's own Stop. Neither observed nor failed; the caller that stopped knows.
     · 'network' / 'http' / 'parse' / anything else — an answer (or the platform's refusal) arrived.
                    OBSERVED: the existing failure arms are right for these. */
export function isUnobserved(err) { return !!(err && err.reason === 'timeout'); }

/* untilObserved(read, opts) -> the value `read` resolved with
 *
 * THE ONE POLICY for a read that a map row waits on. `read(scale)` is called with scale 1, and — only
 * after an UNOBSERVED failure (isUnobserved) — again with the clock doubled (2, 4, 8): each retry does
 * something the last one did not (it waits longer before calling the host silent), which is what §5
 * requires of a retry. An observed failure is re-thrown at once, untouched, so the caller's failure arm
 * is exactly what it was.
 *   opts.base    — the caller's clock at scale 1, in ms. The pause before retry n is the clock the
 *                  failed attempt had (base × its scale): a page too loaded to read an answer gets that
 *                  long to drain before it is asked to read another, so retries never take more than
 *                  half the wall time.
 *   opts.wait    — (ms) => Promise. The scheduler; js/data-layers.js passes js/runtime.js `afterTick`
 *                  (the one timer wheel). Defaults to setTimeout for a caller with no runtime.
 *   opts.wanted  — () => boolean, asked before every retry. false ends the loop with reason 'aborted'
 *                  (the reader unticked the row, or a newer switch-on superseded this one).
 *   opts.onWait  — ({ attempt, scale, delay, error }) called before each retry: the record of it.
 * When the last retry is unobserved too, its error is re-thrown with `retries` set — at 8 × the host's
 * clock of SILENCE (js/fetch-deadline.js counts only time the page could have read a reply in) the host
 * has been asked four times, which is an observation of its own.
 *   UNOBSERVED_RETRIES — observation: a 6 s host clock (DIRECT_TIMEOUT_MS) × 8 = 48 s of counted silence,
 *   longer than the longest main-thread freeze measured on the nightly runner (30 s, the note on the
 *   clock above). Lapses if a host's answer is legitimately slower than 8 × its row in clockFor — that
 *   host then needs its own row there, not more retries here. Canonical here. */
export const UNOBSERVED_RETRIES = 3;
export async function untilObserved(read, opts) {
  const o = opts || {};
  const base = Math.max(0, +o.base || 0);
  const wait = (typeof o.wait === 'function') ? o.wait : ((ms) => new Promise((res) => setTimeout(res, ms)));
  for (let attempt = 0; ; attempt++) {
    const scale = 2 ** attempt;
    try { return await read(scale); } catch (e) {
      if (!isUnobserved(e)) throw e;
      if (attempt >= UNOBSERVED_RETRIES) { try { e.retries = attempt; } catch (_) { /* a frozen error keeps its own shape */ } throw e; }
      const delay = base * scale;
      if (typeof o.onWait === 'function') { try { o.onWait({ attempt: attempt + 1, scale: scale * 2, delay, error: e }); } catch (_) { /* a recorder does not decide the read */ } }
      await wait(delay);
      if (typeof o.wanted === 'function' && !o.wanted()) {
        const stop = new Error('no longer wanted');
        stop.reason = 'aborted'; stop.retries = attempt + 1;
        throw stop;
      }
    }
  }
}

/* ══ (fetch-deadline-layer) THE SAME CLOCK FOR THE FILES THAT CANNOT IMPORT IT ════════════════════
   js/countries-ui.js and js/routing-ops.js are run as CLASSIC scripts by the node harnesses (tests/shell-data-layers-checks.test.mjs #R453 ⑤
   and the loader harnesses of tests/news-countries-checks.test.mjs (#R375) / r423 execute them with `new Function`; tests/layer-space-satellites-checks.test.mjs (#R184) #5 parses
   routing-ops as a script), so an `import` line is not open to them — and both held a read with no end
   (the Natural Earth loader, the earthquakes along a route). They reach this module the way classic
   scripts reach js/nominatim-gate.js: through one window name, `window.IntMapFetchWithin`, carrying the
   two readers and the host table's clock, so there is still exactly one of each.
   ⚠ THAT NAME IS PUBLISHED BY js/app-body.js, NOT HERE, AND THIS FILE IMPORTS NOTHING — ON PURPOSE.
   It was published here once, with `import { clockFor } from './proxy-fetch.js'` to carry the clock, and
   that one import line added a request to EVERY session: MEASURED `npm run check:perf` eager.requests
   9 → 10, proxy-fetch split out of main into a chunk of its own (modules unchanged, 284). Both files are
   shared by main and by lazy chunks, so the bundler first gives each a chunk of its own and then merges
   them back into main — and it refuses a merge that would make a chunk cycle. With this file importing
   proxy-fetch, merging proxy-fetch first would have made main ⇄ fetch-deadline a cycle, so it stayed
   out (the full measurement: vite.config.js, codeSplitting). js/app-body.js is in main alone and already
   imports both, so the one handle is assembled there with no edge between the two shared files. */
