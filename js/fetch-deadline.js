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
 *  ⚠ ONE EXPORT — tests/r175-checks ③ requires that a js/ module has no unexported top-level
 *  declaration and no export nobody imports.
 */
export const jsonWithin = (() => {
  /* An AbortController is standard everywhere IntMap runs; the guard is for the node checks, which
     evaluate this module without a DOM. Without one the deadline simply cannot be enforced, and the
     honest thing is to say so rather than to pretend the call was bounded. */
  const canAbort = () => { try { return typeof AbortController === 'function'; } catch (_) { return false; } };

  /* jsonWithin(url, ms, init) -> the parsed JSON body
   *
   * THROWS on anything that is not a parsed JSON body: a network refusal, a non-2xx status, a body
   * that is not JSON, or the deadline. Callers already distinguish 「the source said nothing」 from
   * 「the source could not be reached」 with try/catch, so a throw is the shape that fits them —
   * and a timeout reaching the same branch as a refusal is correct: in both cases nothing arrived. */
  return async function jsonWithin(url, ms, init) {
    const c = canAbort() ? new AbortController() : null;
    /* ⚠ THE CALLER'S SIGNAL IS CHAINED, NOT REPLACED. `init.signal` is how Stop and a superseding
       turn reach a request that is already in flight; overwriting it with our own controller — the
       obvious way to write this — would silently disconnect it. */
    const outer = (init && init.signal) || null;
    const relay = () => { try { c && c.abort(); } catch (_) { /* already done */ } };
    if (outer && c) { if (outer.aborted) relay(); else { try { outer.addEventListener('abort', relay); } catch (_) { /* no listener support */ } } }
    let timedOut = false;
    const t = (c && ms > 0) ? setTimeout(() => { timedOut = true; relay(); }, ms) : null;
    try {
      const opt = Object.assign({}, init || {});
      if (c) opt.signal = c.signal;
      const r = await fetch(url, opt);
      if (!r.ok) throw new Error('http ' + r.status);
      return JSON.parse(await r.text());
    } catch (e) {
      throw timedOut ? new Error('deadline ' + ms + 'ms') : e;
    } finally {
      if (t) clearTimeout(t);
      if (outer && c) { try { outer.removeEventListener('abort', relay); } catch (_) { /* nothing to remove */ } }
    }
  };
})();
