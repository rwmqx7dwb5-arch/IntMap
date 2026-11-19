// relay-rule: principle — tests/gis-remote-fetch-checks.test.mjs
// ============================================================================
//  IntMap · gis-fetch  —  the page's reader for public geodata its host will not let a page read  (Edge Function, Deno)
// ----------------------------------------------------------------------------
//  WHY: a Cloud-Optimised GeoTIFF on an object store is read by HTTP Range, and the Copernicus DEM and ESA
//  WorldCover buckets answer Range with 206 and NO Access-Control-Allow-Origin — readable by a server,
//  never by a page (dev-notes/2026-11-19-gis-live-probe.md §2). fetch-relay is an allow-list and cannot
//  follow a catalogue to a bucket nobody wrote down, so this is the principle-shaped one.
//
//  ⚠ IT IS NOT AN OPEN PROXY, and what stops it being one is written in supabase/functions/_shared/
//  gis-fetch-policy.js (the one place; js/gis-fetch.js imports it too): https on the default port, no
//  credentials, a name that resolves ONLY to public addresses (every redirect hop asked again), a read of
//  DATA bounded in bytes, never a page, nothing forwarded from the caller but the URL and a byte range,
//  a project-wide byte budget that fails CLOSED, a per-caller budget, and a stop switch.
//
//  ENDPOINT (GET only):
//    ?u=<encoded https URL>[&range=<from>-<to>]
//      range given → 206 + content-range (the upstream's own total) with the bytes asked for
//      range absent → 200, the answer whole (≤ WHOLE_MAX_BYTES)
//    every failure is {"error":<code>[, "status":<upstream status>, "said":<the upstream's own words, ≤200 chars,
//    markup stripped>, "redirectedTo":<origin+path of a sign-in/other host>]} with a status that says what kind:
//      400 bad_url/not_https/credentials_in_url/port_not_default/host_not_public/bad_range/not_allowed
//      429 rate_limit (this caller) · 429 budget_exhausted (the project) · 503 disabled (the stop switch)
//      502 upstream_status/upstream_is_a_page/upstream_range_ignored/upstream_too_large/upstream_redirect
//      502/503 upstream_unreachable/upstream_timeout
//    ⚠ THE UPSTREAM'S WORDS ARE RELAYED AS DATA (a JSON string, clipped, markup stripped), because the reason a
//    bucket refuses («PublicAccessNotPermitted», «AccessDenied») is the fact the reader needs. Never as a body.
//
//  Deploy:  supabase functions deploy gis-fetch --no-verify-jwt --use-api --project-ref vpekfwdpurzejrrmacac
//  Secrets: none (SUPABASE_URL and the project key are injected, for the buckets — _shared/supabase-keys.js).
//  Stop:    set GIS_FETCH_DISABLED=1 (supabase secrets set …) — answered at once, no deploy.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — the repo's static gate parses every committed .ts as plain JavaScript.
// ============================================================================

import { corsFor, followRedirects, methodGate, readCapped, resolvesPublic, RelayError } from "../_shared/relay-guard.js";
import { callerKey, callerKeySecret, makeLimiter, restRpcClient } from "../_shared/rate-limit.js";
import { secretKey } from "../_shared/supabase-keys.js";
import {
  RANGE_MAX_BYTES, WHOLE_MAX_BYTES, TIMEOUT_MS, UNIT_BYTES, PROJECT_UNITS_DEFAULT, CALLER_UNITS_DEFAULT,
  costUnits, parseRange, relayableUrl,
} from "../_shared/gis-fetch-policy.js";

const EXPOSE = "content-range, accept-ranges, content-length, x-gis-upstream-status, x-gis-redirected-to, x-gis-total";
const CORS = { ...corsFor(), "Access-Control-Expose-Headers": EXPOSE };
const env = (k) => Deno.env.get(k) || "";

function positive(name, fallback) {
  const n = Number(env(name));
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

/* the upstream's words, as data: tags stripped, whitespace folded, clipped — never relayed as markup */
const said = (text) => String(text || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

function fail(code, status, extra) {
  return new Response(JSON.stringify({ error: code, ...(extra || {}) }), {
    status,
    headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" },
  });
}

/* A redirect that lands on another origin is a FACT the reader needs (a sign-in page is not a file), so the last
   origin+path is reported. The hop's own address is never used to answer — only to say where it went. */
const where = (u) => (u ? u.origin + u.pathname : null);

Deno.serve(async (req) => {
  const gate = methodGate(req, CORS);
  if (gate) return gate;

  /* the stop switch comes before everything that costs anything, including the budget */
  const off = env("GIS_FETCH_DISABLED").toLowerCase();
  if (off === "1" || off === "true") return fail("disabled", 503);

  const q = new URL(req.url).searchParams;
  const target = relayableUrl(q.get("u"));
  if (!target.ok) return fail(target.why, 400);
  const range = parseRange(q.get("range"));
  if (range && range.bad) return fail("bad_range", 400, range.tooLong ? { max: RANGE_MAX_BYTES } : undefined);

  const budget = AbortSignal.timeout(TIMEOUT_MS);
  /* the name must resolve, and only to public addresses — a public NAME can point inward */
  if (!(await resolvesPublic(target.url.hostname, { signal: budget }))) {
    if (budget.aborted) return fail("upstream_timeout", 503);
    return fail("not_allowed", 400);
  }

  /* the bytes are paid for BEFORE the upstream is touched, by what was asked for */
  const units = costUnits(range);
  const db = restRpcClient({ url: env("SUPABASE_URL"), serviceKey: secretKey(env) });
  if (db.configured) {
    const limiter = makeLimiter({ db });
    /* MiB → units (policy file: unit = one 64 KiB block) */
    const toUnits = (mib) => Math.floor(mib * 1048576 / UNIT_BYTES);
    const projectCap = positive("GIS_FETCH_PROJECT_MIB_PER_HOUR", PROJECT_UNITS_DEFAULT * UNIT_BYTES / 1048576) * 1048576 / UNIT_BYTES;
    const project = await limiter.take("gis-fetch:project-bytes", "*", {
      capacity: projectCap, refillPerSec: projectCap / 3600, cost: units, onUnavailable: "deny",
    });
    if (!project.allowed) return fail("budget_exhausted", 429, { scope: "project", unavailable: project.source === "unavailable" });
    const cap = toUnits(positive("GIS_FETCH_CALLER_MIB_PER_MIN", CALLER_UNITS_DEFAULT * UNIT_BYTES / 1048576));
    const mine = await limiter.take("gis-fetch:caller-bytes", await callerKey(req, { secret: callerKeySecret(env) }), {
      capacity: cap, refillPerSec: cap / 60, cost: units, onUnavailable: "allow",
    });
    if (!mine.allowed) return fail("rate_limit", 429, { scope: "caller" });
  } else {
    /* no database to keep a budget in means no budget can be said to bound anything: closed, like the project bucket */
    return fail("budget_exhausted", 429, { scope: "project", unavailable: true });
  }

  let last = null;       /* the last redirect hop, to say where a request ended up */
  try {
    const res = await followRedirects(target.url.toString(), {
      method: "GET",
      headers: {
        "user-agent": "IntMap/gis-fetch (+https://github.com/rwmqx7dwb5-arch/IntMap)",
        accept: "*/*",
        ...(range ? { range: "bytes=" + range.from + "-" + range.to } : {}),
      },
      signal: budget,
    }, {
      /* ⚠ EVERY HOP IS ASKED WHAT THE FIRST WAS: https, public name, resolves only to public addresses */
      allowRedirect: async (next) => {
        const s = relayableUrl(next.toString());
        if (!s.ok || !(await resolvesPublic(s.url.hostname, { signal: budget }))) return false;
        last = s.url;
        return true;
      },
    });
    const meta = { "x-gis-upstream-status": String(res.status) };
    if (last && last.origin !== target.url.origin) meta["x-gis-redirected-to"] = where(last);

    if (!res.ok) {
      /* the upstream's words are the reason: read a little of them, as data */
      let text = "";
      try { text = new TextDecoder().decode(await readCapped(res, 4096)); } catch (_) { try { await res.body?.cancel(); } catch (_e) { /* nothing */ } }
      return fail("upstream_status", 502, { status: res.status, said: said(text), redirectedTo: meta["x-gis-redirected-to"] || null });
    }
    const type = res.headers.get("content-type") || "application/octet-stream";
    /* a page is not data: a sign-in screen, an error page, a portal's front door. Refused, which also keeps this origin from serving one. */
    if (/^text\/html|^application\/xhtml/i.test(type)) {
      try { await res.body?.cancel(); } catch (_) { /* nothing to drain */ }
      return fail("upstream_is_a_page", 502, { status: res.status, redirectedTo: meta["x-gis-redirected-to"] || null });
    }
    const common = {
      ...CORS, ...meta,
      "content-type": type,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "content-disposition": "attachment",
      /* an immutable open-data object is the same bytes for the next reader: the page keeps its own copy (measured: the platform CDN does not share it) */
      "cache-control": "public, max-age=3600, s-maxage=3600",
    };

    if (range) {
      if (res.status === 206) {
        const cr = res.headers.get("content-range") || "";
        const m = /bytes\s+(\d+)-(\d+)\/(\d+|\*)/i.exec(cr);
        const bytes = await readCapped(res, RANGE_MAX_BYTES);
        return new Response(bytes, { status: 206, headers: { ...common, "content-range": cr, ...(m && m[3] !== "*" ? { "x-gis-total": m[3] } : {}), "accept-ranges": "bytes" } });
      }
      /* the upstream ignored Range and is sending a whole file. A small one may go on as it is — the page then reads it as «the
         server ignores Range», which is the fact; a large one is not read at all, because that would be a download. */
      const declared = Number(res.headers.get("content-length"));
      if (!(Number.isFinite(declared) && declared <= WHOLE_MAX_BYTES)) {
        try { await res.body?.cancel(); } catch (_) { /* nothing to drain */ }
        return fail("upstream_range_ignored", 502, { status: res.status, contentLength: Number.isFinite(declared) ? declared : null });
      }
    }
    const bytes = await readCapped(res, WHOLE_MAX_BYTES);
    return new Response(bytes, { status: 200, headers: { ...common, ...(range ? { "x-gis-range-ignored": "1" } : {}) } });
  } catch (e) {
    if (e instanceof RelayError) {
      /* followRedirects answers every failed connection «unreachable»; when this exchange's own clock ran out it was a timeout */
      if (e.code === "upstream_unreachable" && budget.aborted) return fail("upstream_timeout", 503);
      return fail(e.code, e.status, e.code === "upstream_redirect" && last ? { redirectedTo: where(last) } : undefined);
    }
    return fail(budget.aborted ? "upstream_timeout" : "upstream_unreachable", budget.aborted ? 503 : 502);
  }
});
