// ============================================================================
//  IntMap · _shared/gis-fetch-policy.js — WHAT gis-fetch WILL DO, stated once  (gis-remote-fetch)
// ----------------------------------------------------------------------------
//  ⚠ ONE PLACE, TWO READERS. supabase/functions/gis-fetch/index.ts enforces it and js/gis-fetch.js (the
//  page) sizes its requests from it, so the two cannot disagree about what one call may ask for.
//
//  WHY A SECOND RELAY, WHEN fetch-relay EXISTS. fetch-relay forwards an ALLOW-LIST: a host is on it
//  because a caller of the page was written for it (fetch-relay-policy.js §ADDING A RULE). Open geodata
//  does not work that way — a catalogue (STAC, OGC) hands out the address of a file on whatever bucket
//  its operator uses, and the reader asks Atlas for «the 2023 elevation of northern Vietnam» without any
//  of us knowing the bucket in advance. Measured 2026-11-20 (dev-notes/2026-11-20-gis-remote-fetch.md):
//  the Copernicus DEM and ESA WorldCover buckets answer Range with 206 and send no
//  Access-Control-Allow-Origin, so a PAGE cannot read them. A list of buckets is the wrong shape: the
//  next catalogue entry is a bucket nobody wrote down.
//
//  So the rule here is a PRINCIPLE, not a list. A URL is relayed when, and only when:
//    ① it is https, on the default port, with no credentials and a public-looking name;
//    ② the name RESOLVES ONLY TO PUBLIC ADDRESSES (relay-guard.js resolvesPublic, fail-closed), and every
//       redirect hop is asked the same two questions again;
//    ③ it is a READ OF DATA, bounded in bytes — a ranged read of at most RANGE_MAX_BYTES, or an answer
//       fetched whole of at most WHOLE_MAX_BYTES — and the answer is not a web page (a sign-in page is not
//       a file; text/html is refused, which also means this origin never serves a page);
//    ④ the project's own byte budget and the caller's allow it (below), and the stop switch is off.
//  Nothing is forwarded from the caller except the URL and the byte range: no cookies, no credentials, no
//  headers. A host that needs a login is refused by ITS OWN answer, relayed as a code (never as a body).
//
//  THE BYTE BUDGET (no-ad-hoc-hardcoding §4 — observation, expiry, owner):
//    unit = 64 KiB — the block js/gis-geotiff.js reads in (BLOCK_BYTES), so one block costs one unit.
//    project ceiling = 4096 units (256 MiB) capacity, refilled at the same per hour: a sustained
//      256 MiB/h ≈ 6 GiB/day. ESTIMATE, not a measurement: the cost of a page-read COG window measured
//      2026-11-20 was 0.1–6 MiB (a 64×64 window of a 30 m DEM, one 512×512 window of a 10 m tile), so the
//      ceiling is hundreds of windows an hour for every reader together. It FAILS CLOSED (a budget that
//      cannot be consulted cannot be said to bound anything — rate-limit.js). Expires the first time
//      production answers `budget_exhausted` to traffic that was readers; the environment moves it
//      without a deploy (GIS_FETCH_PROJECT_MIB_PER_HOUR).
//    per caller = 512 units (32 MiB) capacity, refilled at the same per minute: one reader's window
//      (≤ ~6 MiB measured) several times over, and a loop meets it inside a minute. FAILS OPEN (the
//      project-wide bucket is still in front). GIS_FETCH_CALLER_MIB_PER_MIN moves it.
//    The charge is the bytes ASKED FOR, taken before the upstream is touched — an upper bound, so a
//    refusal costs the upstream nothing and a cheap answer is never billed less than it could have been.
//  THE STOP SWITCH: GIS_FETCH_DISABLED=1 answers 503 `disabled` to everything, at once, without a deploy.
//
//  ⚠ NO TYPE ANNOTATIONS and no Deno globals: the browser bundle imports this file too.
// ============================================================================

/* ⚠ THIS FILE IMPORTS NOTHING. js/gis-fetch.js (lazy) imports it, and js/proxy-fetch.js (eager, main bundle) imports relay-guard.js: if this file
   imported relay-guard too, the bundler would hoist relay-guard into a chunk both share and the page would fetch it before first paint
   (measured 2026-11-20: eager requests 10 → 11, check:perf). The one predicate that needs relay-guard (publicHostname) is therefore handed in. */

export const GIS_FETCH_FUNCTION = "gis-fetch";

export const UNIT_BYTES = 64 * 1024;
/* the most ONE ranged read may ask for. 4 MiB = four of the page's 1 MiB chunks (js/gis-fetch.js CHUNK_BYTES);
   a COG tile row is ~100 KiB–1 MiB in every file measured, so one call is never the file. */
export const RANGE_MAX_BYTES = 4 * 1024 * 1024;
/* an answer fetched whole (a catalogue page, a small JSON, a tiny file). Measured: the largest STAC /collections
   page seen was < 3 MiB (js/gis-remote.js MAX_JSON_BYTES says the same); 8 MiB is a runaway, not a catalogue. */
export const WHOLE_MAX_BYTES = 8 * 1024 * 1024;
/* one deadline for the whole exchange. 観測 2026-11-20: a 1 MiB range of an S3 COG answered in 0.2–1.5 s; NASA
   CMR-STAC answered a search in 25 s, so the clock is sized for a slow catalogue, not for a bucket. */
export const TIMEOUT_MS = 28000;
export const MAX_QUERY_URL = 4096;   /* a SAS-signed address is ~700 characters; 4096 is a probe, not a file */

export const PROJECT_UNITS_DEFAULT = 4096;
export const CALLER_UNITS_DEFAULT = 512;

/* units a request costs = what it ASKED for, rounded up to whole units */
export function costUnits(range) {
  const bytes = range ? range.len : WHOLE_MAX_BYTES;
  return Math.max(1, Math.ceil(bytes / UNIT_BYTES));
}

/* ?range=<from>-<to> (decimal, inclusive, to ≥ from) → {from,to,len} | null. Not the header spelling: a query
   parameter is a simple request (no preflight) and a cacheable address. */
export function parseRange(raw) {
  if (raw == null || raw === "") return null;
  const m = /^(\d{1,15})-(\d{1,15})$/.exec(String(raw));
  if (!m) return { bad: true };
  const from = Number(m[1]), to = Number(m[2]);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || to < from) return { bad: true };
  const len = to - from + 1;
  if (len > RANGE_MAX_BYTES) return { bad: true, tooLong: true, max: RANGE_MAX_BYTES };
  return { from, to, len };
}

/* the URL's shape, before any DNS or network. → {ok, url:URL} | {ok:false, why} */
export function relayableUrl(raw, publicHostname) {
  const s = String(raw == null ? "" : raw);
  if (!s || s.length > MAX_QUERY_URL) return { ok: false, why: "bad_url" };
  let u;
  try { u = new URL(s); } catch (_) { return { ok: false, why: "bad_url" }; }
  if (u.protocol !== "https:") return { ok: false, why: "not_https" };
  if (u.username || u.password) return { ok: false, why: "credentials_in_url" };
  if (u.port !== "") return { ok: false, why: "port_not_default" };
  if (typeof publicHostname !== "function" || !publicHostname(u.hostname)) return { ok: false, why: "host_not_public" };
  u.hash = "";
  return { ok: true, url: u };
}

/* the codes the function answers with — declared so a test can hold the page's wording to them */
export const FAILURE_CODES = Object.freeze([
  "disabled", "bad_url", "not_https", "credentials_in_url", "port_not_default", "host_not_public",
  "bad_range", "not_allowed", "rate_limit", "budget_exhausted",
  "upstream_unreachable", "upstream_timeout", "upstream_redirect", "upstream_status",
  "upstream_is_a_page", "upstream_range_ignored", "upstream_too_large", "method_not_allowed",
]);
