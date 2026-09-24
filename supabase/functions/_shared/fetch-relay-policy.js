// ============================================================================
//  IntMap · _shared/fetch-relay-policy.js — WHAT fetch-relay WILL FORWARD, stated once  (own-fetch-relay)
// ----------------------------------------------------------------------------
//  ⚠ THE ONE PLACE THIS LIST EXISTS. Two readers import it and neither keeps a copy:
//
//    · supabase/functions/fetch-relay/index.ts — refuses every URL no rule below admits, and
//      re-asks the same question of every redirect hop;
//    · js/proxy-fetch.js — offers the relay only the URLs a rule admits (a URL the relay would
//      refuse costs a round trip to earn a 400), and sizes its clock from the rule's timeoutMs.
//
//  WHY IT EXISTS. Until own-fetch-relay the page reached upstreams that send no Access-Control-Allow-Origin
//  through PUBLIC CORS proxies (corsproxy.io, api.allorigins.win, api.codetabs.com,
//  proxy.corsfix.com), written out by hand in eighteen files. Measured on the live site they
//  answered 403 / 503 / 522 or not at all (js/proxy-fetch.js carries the tables), and every answer
//  that did arrive had passed through a third party that could read which URL the reader asked
//  for and rewrite what came back. A rule here is the replacement: the upstream is fetched by this
//  project's own function, and only upstreams somebody wrote down are fetched at all.
//
//  WHAT A RULE IS. An upstream the page needs and cannot read directly, as narrowly as the page
//  asks for it: the exact host names, the path shape, the exact set of query keys (each with the
//  shape of its value), the content type an answer must declare, and three bounds — bytes, time,
//  and how long a shared cache may keep the answer. A URL is admitted only if ONE rule admits all
//  of it; there is no rule that admits a host «and anything under it».
//
//  ⚠ ADDING A RULE. The caller comes first: tests/own-fetch-relay-checks.test.mjs discovers
//  every URL the page hands to js/proxy-fetch.js and fails if a caller that relies on a relay names
//  an upstream no rule admits — so the rule is written because a caller exists, never in advance.
//  Measure the upstream (does it send ACAO? — if it does, the page reads it directly and it does
//  not belong here), and write the measurement beside the rule.
//
//  ⚠ NO TYPE ANNOTATIONS and no Deno globals: the browser bundle imports this file too.
// ============================================================================

import { publicHostname } from "./relay-guard.js";

export const FETCH_RELAY_FUNCTION = "fetch-relay";

/* One rule per upstream. `hosts` is exact (no wildcards); `path` is anchored; `query` maps EVERY
   key the URL may carry to the shape of its value, and every key it names must be present.
   `redirectHosts` (optional) are names the rule admits only as a redirect hop — see fetchRelayRule.
   `probe` is ONE concrete URL the rule admits and the upstream answers (the smallest one measured):
   scripts/probe-relay-ladder.mjs asks our relay for it every six hours, and tests/own-fetch-relay-checks holds it to
   the rule, so the monitor cannot drift from the list. */
export const FETCH_RELAY_RULES = Object.freeze([
  {
    id: "imf-datamapper",
    probe: "https://www.imf.org/external/datamapper/api/v1/NGDPD",
    /* js/stats-compare.js — the IMF indicator series for the comparison chart.
       MEASURED 2026-09-25 with Origin set to the Pages origin: 200 application/json, NO
       Access-Control-Allow-Origin; NGDPD 157,531 B in 9.98 s, PPPPC 179,847 B in 11.03 s. The
       clock is sized for an upstream that routinely takes ten seconds. */
    hosts: ["www.imf.org"],
    path: /^\/external\/datamapper\/api\/v1\/[A-Za-z0-9_]{1,40}$/,
    query: {},
    type: /^application\/json/i,
    maxBytes: 4 * 1024 * 1024,
    timeoutMs: 20000,
    cacheSeconds: 21600,
  },
  {
    id: "iteris-511-cameras",
    probe: "https://511yukon.ca/map/mapIcons/Cameras",
    /* js/cameras.js — the traffic-camera lists of the thirteen 511 sites that run the same
       platform. MEASURED 2026-09-25: every one answers application/json with NO ACAO; the largest
       is fl511.com at 811,300 B (1.48 s). 511wi.gov answered 403 to a non-browser client.
       drivenc.gov and nvroads.com answer 302/301 to their www. name on :443 — so those two names
       are `redirectHosts`: admitted as a HOP of a request this rule already admitted, never as a
       request of their own (no caller names them; tests/own-fetch-relay-checks holds every `hosts` entry to a caller). */
    hosts: [
      "fl511.com", "511ga.org", "511ny.org", "www.511pa.com", "drivenc.gov", "511on.ca",
      "nvroads.com", "511wi.gov", "511.idaho.gov", "newengland511.org", "511.alberta.ca",
      "511la.org", "511yukon.ca",
    ],
    redirectHosts: ["www.drivenc.gov", "www.nvroads.com"],
    path: /^\/map\/mapIcons\/Cameras$/,
    query: {},
    type: /^application\/json/i,
    maxBytes: 4 * 1024 * 1024,
    timeoutMs: 15000,
    cacheSeconds: 3600,
  },
  {
    id: "opentopodata-gebco",
    probe: "https://api.opentopodata.org/v1/gebco2020?locations=35.0000,140.0000",
    /* js/map-readout.js — sea-floor depth under the cursor (Open-Meteo answers 0 over water).
       MEASURED 2026-09-25: 200 application/json, 179 B, 0.68 s, NO ACAO. GEBCO 2020 is a fixed
       release, so an answer never changes and a week of shared cache costs nothing. */
    hosts: ["api.opentopodata.org"],
    path: /^\/v1\/gebco2020$/,
    query: { locations: /^-?\d{1,2}(?:\.\d{1,6})?,-?\d{1,3}(?:\.\d{1,6})?$/ },
    type: /^application\/json/i,
    maxBytes: 64 * 1024,
    timeoutMs: 10000,
    cacheSeconds: 604800,
  },
  {
    id: "celestrak-gp",
    probe: "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
    /* js/satellites-live.js — the second way to CelesTrak's element sets, for when the page cannot
       reach the host itself (measured 2026-08-01: it refused every connection for hours). The
       bundled catalogue stays the third way. ⚠ NOT MEASURED THIS ROUND: celestrak.org did not
       accept a connection from the machine this rule was written on (21 s, no answer), so the
       content type below is the one CelesTrak documents for FORMAT=tle and the ceiling is sized
       from the bundled catalogue (data/tle/catalogue.tle, the `active` group: 2,514,557 B on
       2026-09-25, so 8 MB is three times the largest group there is). CelesTrak asks
       that one group is not fetched more often than every two hours — hence the cache. */
    hosts: ["celestrak.org"],
    path: /^\/NORAD\/elements\/gp\.php$/,
    query: { GROUP: /^[a-z0-9-]{1,40}$/, FORMAT: /^tle$/ },
    type: /^text\/plain/i,
    maxBytes: 8 * 1024 * 1024,
    timeoutMs: 20000,
    cacheSeconds: 7200,
  },
]);

/* The rule that admits `raw`, or null. Structural, never a prefix test: the URL is parsed, and a
   string that merely starts like an admitted one cannot carry another host past it.
   `opts.hop` — `raw` is where an admitted request was redirected to, so the rule's redirectHosts
   count as well (fetch-relay then also requires that it is the SAME rule as the first request). */
export function fetchRelayRule(raw, opts) {
  const hop = !!(opts && opts.hop);
  let u;
  try { u = new URL(String(raw || "")); } catch (_) { return null; }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password || u.port || u.hash) return null;
  const host = u.hostname.toLowerCase();
  if (!publicHostname(host)) return null;
  for (const rule of FETCH_RELAY_RULES) {
    if (!rule.hosts.includes(host) && !(hop && (rule.redirectHosts || []).includes(host))) continue;
    if (!rule.path.test(u.pathname)) continue;
    const want = Object.keys(rule.query);
    const seen = new Set();
    let ok = true;
    for (const [k, v] of u.searchParams) {
      /* own keys only — `constructor` / `__proto__` in a query must not reach Object.prototype */
      const re = Object.prototype.hasOwnProperty.call(rule.query, k) ? rule.query[k] : null;
      if (!re || seen.has(k) || !re.test(v)) { ok = false; break; }
      seen.add(k);
    }
    if (!ok || seen.size !== want.length) continue;
    return rule;
  }
  return null;
}

/* ══ THE ONE RULE WITHOUT A HOST LIST: A NEWS ARTICLE PAGE (the reader's second strategy) ═══════
   js/article-reader.js reads an article off ANY publisher a feed or GDELT linked to, so no list of
   hosts can hold it. Until own-fetch-relay the public relays carried it; without them, a publisher that sends
   no ACAO (measured 2026-09-25: aljazeera.com, bbc.com, theguardian.com, lemonde.fr) could only be
   shown embedded. This rule keeps that capability on our own relay — and is the narrowest thing that
   still does:
     · only when the caller ASKS for it (`as=article` beside `u=`), so it can never widen what any
       listed rule admits, and js/proxy-fetch.js asks only for `as:'html'` calls;
     · https on the default port, no userinfo, a name `publicHostname()` accepts, AND a name that
       resolves only to public addresses (`resolvesPublic()`, fail-closed) — the host is on no list,
       so the address is what is checked; every redirect hop is checked the same way;
     · an answer that declares text/html, under ARTICLE_MAX_BYTES, that `looksLikeArticle()` accepts
       (the same predicate the page applies — defined once, below) — so the relay hands back article
       pages, not arbitrary bytes;
     · its own, smaller bucket (fetch-relay declares it).
   ARTICLE_MAX_BYTES: the two article pages #R446 measured were 198,238 B and 217,509 B; 3 MB is
   about fourteen times the larger and still refuses a download that is not a page. Expires if
   production shows `upstream_too_large` for article pages. The clock is the reader's: fetchReadable
   gives both strategies 20 s, so 12 s here leaves the page its own margin. */
export const ARTICLE_RULE = Object.freeze({
  id: "article-html",
  probe: "https://en.wikipedia.org/wiki/Main_Page",
  type: /^text\/html/i,
  maxBytes: 3 * 1024 * 1024,
  timeoutMs: 12000,
  cacheSeconds: 1800,
});

/* May this URL be asked for as an article? Everything except the address check, which needs DNS. */
export function articleUrlAllowed(raw) {
  let u;
  try { u = new URL(String(raw || "")); } catch (_) { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  return publicHostname(u.hostname);
}

/* ⚠ ONE PREDICATE FOR BOTH SIDES. (#R446) An article page is an HTML DOCUMENT THAT IS NOT A STUB:
   it declares itself HTML, is at least ARTICLE_MIN_BYTES long — measured, relay and interstitial
   bodies were 314 B, 2,041 B and 7,594 B, and real articles ~200 KB — and carries a `<p>` or a
   description meta (a document with neither cannot yield a single block). js/proxy-fetch.js uses it
   to accept an answer; fetch-relay uses it to decide what it will hand back at all. */
export const ARTICLE_MIN_BYTES = 4096;
export function looksLikeArticle(txt) {
  if (!txt || txt.length < ARTICLE_MIN_BYTES) return false;
  if (!/<!doctype\s+html|<html[\s>]/i.test(txt)) return false;
  return /<p[\s>]/i.test(txt) || /<meta[^>]+(?:og:description|name=["']description)/i.test(txt);
}
