/* ============================================================================
 *  IntMap · WHY A REMOTE READ FAILED — js/gis-http.js
 * ----------------------------------------------------------------------------
 *  The remote readers (js/gis-geotiff.js readUrl, js/gis-ogcapi.js) used to say one of two things when a
 *  public service did not answer: `fetch-failed` ("could not be made at all") and `http-status`.
 *  Measured against real services (dev-notes/2026-11-19-gis-live-probe.md) that hid three different
 *  facts, each of which asks the reader to do something different:
 *
 *    ① THE HOST ANSWERS BUT SENDS NO CORS HEADERS. A browser reports it as the same TypeError as a
 *      dead network ("Failed to fetch"). It is the commonest way a public bucket (Copernicus DEM, ESA
 *      WorldCover) cannot be read by a page, and no amount of retrying changes it. It IS observable: a
 *      `no-cors` HEAD to the same address resolves with an OPAQUE response exactly when the host is
 *      reachable and merely not readable from here. (Node has no CORS and never returns `opaque`, so
 *      a genuine network failure there is never relabelled.)
 *    ② THE SERVER SAID WHY. A 403/409 from an object store carries the reason in its body
 *      (`PublicAccessNotPermitted`, `AccessDenied`); dropping it leaves "HTTP 409" to be guessed at.
 *    ③ A LOGIN PAGE IS NOT A FILE. A data portal that redirects an anonymous request to a sign-in page
 *      answers 200 with HTML; that is not "the server ignores Range".
 *
 *  Nothing here knows a service by name: each is a fact about the response, read from the response.
 * ==========================================================================*/

const clip = (s, n) => String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/* the reason string for a request that threw; `doFetch` is the caller's fetch (tests hand a fake) */
export async function explainFetchFailure(url, doFetch, err) {
  /* an error that already says WHY (js/gis-fetch.js: the data relay refused, the budget is spent, the stop switch is on) is not
     re-diagnosed: a no-cors probe would find the host reachable and call a refused relay «the host sends no CORS headers» */
  if (err && err.explained && typeof err.explained === 'object') return err.explained;
  const base = String((err && err.message) || err);
  if (typeof doFetch !== 'function') return { reason: base };
  try {
    const probe = await doFetch(url, { method: 'HEAD', mode: 'no-cors' });
    if (probe && probe.type === 'opaque') {
      return { reason: 'cors-blocked: the host answers, but sends no Access-Control-Allow-Origin, so a browser page cannot read it', corsBlocked: true };
    }
  } catch (_) { /* the probe failing too means the failure was real */ }
  return { reason: base };
}

/* extra facts about a response that is not the data: what the server said, and where it sent us */
export async function describeResponse(url, res) {
  const out = {};
  try {
    if (res.redirected && res.url) {
      const to = new URL(res.url);
      if (to.origin !== new URL(url).origin) out.redirectedTo = to.origin + to.pathname;
    }
  } catch (_) { }
  /* the data relay (js/gis-fetch.js) says where a request ended up in a header, because a synthetic response has no `url` */
  try { const via = res.headers && typeof res.headers.get === 'function' ? res.headers.get('x-gis-redirected-to') : null; if (via) out.redirectedTo = String(via); } catch (_) { }
  try {
    if (res.status >= 400 && typeof res.text === 'function') {
      const t = clip(await res.text(), 200);
      if (t) out.serverSaid = t;
    }
  } catch (_) { }
  return out;
}

/* a 200 that is HTML where bytes or JSON were asked for: a page, not the data */
export function looksLikeAPage(res) {
  const ct = res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-type') : null;
  return !!ct && /^text\/html/i.test(ct);
}
