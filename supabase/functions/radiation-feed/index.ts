// ============================================================================
//  IntMap · radiation-feed — measured gamma dose rate from six national networks  (#R574)
// ----------------------------------------------------------------------------
//  One layer, one colour scale, one unit (nSv/h). Six upstreams that agree on none of those things.
//  The registry in _shared/radiation-sources.js holds what each network DECLARES about itself; this
//  file is only the transport: it decides who to ask, asks them under bounds, and merges the answers.
//  There is no `switch (country)` anywhere in either file, and adding a seventh network is an object
//  in the registry, not an edit here.
//
//  ── WHY THIS IS A RELAY AT ALL (measured 2026-09-09, with `Origin:` set to the Pages origin) ──
//      www.imis.bfs.de (BfS ODL)        200  Access-Control-Allow-Origin: *
//      opendata.fmi.fi (STUK)           200  Access-Control-Allow-Origin: *
//      data.rivm.nl                     200  Access-Control-Allow-Origin: *
//      data.weather.gov.hk              200  Access-Control-Allow-Origin: *
//      www.ramis.nra.go.jp (NRA)        200  ACAO: https://www.ramis.nra.go.jp   ← unreadable
//      radnet.epa.gov (RadNet)          200  NO access-control-allow-origin      ← unreadable
//  Two of the six a browser simply cannot read, and #R266 would have this relay only those two. It
//  relays all six anyway, for a reason the other four do not have on their own: the QUESTION is five
//  encodings — GeoJSON, WFS multipointcoverage XML, a bespoke JSON API, 140 CSVs, and a weather
//  bulletin keyed by place name. Handing those to the page means five parsers in the boot bundle.
//  MEASURED end to end, 2026-09-09 (scripts/probe-radiation-sources.mjs --latest): the default sweep
//  costs ~10.3 MB across eleven requests to five upstreams and produces 7,172 current stations plus
//  151 reference points — about 1,159 kB of JSON, 173 kB gzipped (6.7×). That is paid once per
//  edge-cache window for every reader on Earth, instead of once per reader.
//
//  ⚠ NOT AN OPEN PROXY. Every URL is built by the registry from an allow-listed provider id; no
//  caller-supplied URL is ever fetched. GET only. Keyless & public — no user data reaches it.
//
//  Deploy: supabase functions deploy radiation-feed --project-ref vpekfwdpurzejrrmacac --use-api
//  Secrets: none.
//
//  ⚠ NO TYPE ANNOTATIONS. scripts/static-checks.mjs parses every committed .ts with acorn, so the
//  Edge Functions are plain JavaScript in .ts files — see the note at the top of alerts-relay.
// ============================================================================

import { corsFor, fetchGuarded, methodGate, relayFail } from "../_shared/relay-guard.js";
import { PROVIDERS, providerById, mergeLatest } from "../_shared/radiation-sources.js";

const CORS = corsFor();

/* MEASURED 2026-09-09. The largest single upstream body is RAMIS data_type=2 at 5,136,072 bytes;
   the largest of the others is the BfS GeoJSON at 891,879. Eight megabytes is 1.6× the largest body
   that exists today and still a hard bound — an upstream that starts answering with an unbounded
   document costs this function the cap, not the isolate. */
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 20000;

/* ⚠ THE REQUEST BUDGET IS WHY RADNET IS NOT IN THE DEFAULT ANSWER, AND IT IS ARITHMETIC, NOT A NAME.
   Measured: the slowest single upstream (BfS) takes 3.8 s. At CONCURRENCY 4, twelve requests is three
   waves ≈ 12 s, inside TIMEOUT_MS with margin. A provider whose `latest.requests` exceeds this is
   left out of `?mode=latest` and reported with read:false and reason "chunked" — and is reachable
   through `?mode=latest&provider=<id>&chunk=<n>`, which asks for one slice that DOES fit. RadNet
   costs 140 requests / 67.3 MB / 102 s for one sweep, so it is the only provider this excludes. */
const MAX_UPSTREAM_REQUESTS = 12;
const CONCURRENCY = 4;

/* ⚠ THE CACHE WINDOW IS DERIVED FROM THE UPSTREAMS, NOT CHOSEN. A merged answer is exactly as stale
   as its fastest-moving member, so the window is half the shortest averaging period among the
   providers actually included — a reader is then never shown a value more than one upstream sweep
   old. The mapping below is from the averaging window each provider DECLARES (`kind`) to how often a
   new value can appear; it is the same fact stated in seconds, not a second opinion. */
const KIND_SECONDS = {
  "instant": 600,
  "10min-mean": 600,
  "hourly-mean": 3600,
  "daily-mean": 86400,
  "annual-mean": 31536000,
};

function cacheControlFor(providers) {
  let fastest = KIND_SECONDS["annual-mean"];
  for (const p of providers) {
    const s = KIND_SECONDS[p.kind];
    if (s && s < fastest) fastest = s;
  }
  const sMax = Math.max(60, Math.floor(fastest / 2));
  return "public, max-age=" + Math.floor(sMax / 2) + ", s-maxage=" + sMax +
    ", stale-while-revalidate=" + (sMax * 4);
}

/* Fetch a provider's URL list under the shared bounds. A body that never arrived is `null` rather
   than an exception, because one dead network must not take the other five with it. */
async function fetchMany(urls, contentTypeRe) {
  const bodies = new Array(urls.length).fill(null);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= urls.length) return;
      try {
        const r = await fetchGuarded(urls[i], {
          timeoutMs: TIMEOUT_MS,
          maxBytes: MAX_BYTES,
          contentTypeRe,
          headers: {
            "user-agent": "IntMap/radiation-feed (+https://github.com/rwmqx7dwb5-arch/IntMap)",
            accept: "application/json, application/xml, text/xml, text/csv, text/plain",
          },
        });
        if (r.ok) bodies[i] = r.text();
      } catch (_e) {
        /* Left as null. Which bound was hit is not the caller's business, and the caller is told
           only that this provider was not read. */
      }
    }
  }
  const n = Math.min(CONCURRENCY, urls.length);
  const workers = [];
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);
  return bodies;
}

/* Run one mode of one provider. Returns the shape mergeLatest() expects.
   ⚠ `read` MEANS "AN UPSTREAM ANSWERED", NOT "RECORDS CAME BACK". A network that is up and reports
   zero live stations, and a network that is unreachable, are different facts about the world, and a
   legend that renders them identically is wrong about one of them.  (#R499, #R536) */
async function runProvider(provider, modeName, query) {
  const mode = provider[modeName];
  if (!mode) return { provider, read: false, records: [], reason: "no-" + modeName };
  if (modeName === "latest" && mode.requests > MAX_UPSTREAM_REQUESTS && !(query && query.chunked)) {
    return { provider, read: false, records: [], reason: "chunked" };
  }
  const urls = mode.urls(query || {});
  if (urls.length > MAX_UPSTREAM_REQUESTS) {
    return { provider, read: false, records: [], reason: "chunked" };
  }
  const bodies = await fetchMany(urls, mode.contentTypeRe);
  let got = 0;
  for (const b of bodies) if (b != null) got++;
  if (!got) return { provider, read: false, records: [], reason: "upstream_unreachable" };
  let records;
  try {
    records = mode.parse(bodies, query || {});
  } catch (_e) {
    /* A body arrived and did not parse: the upstream changed shape, or answered 200 with an error
       page. That is NOT "read" — caching an unparseable answer for the window as if it were data is
       the failure this branch exists for. */
    return { provider, read: false, records: [], reason: "upstream_unparseable" };
  }
  return {
    provider,
    read: true,
    records,
    reason: got < bodies.length ? "partial:" + got + "/" + bodies.length : null,
  };
}

function json(payload, status, extraHeaders) {
  const headers = { ...CORS, "content-type": "application/json" };
  if (extraHeaders) for (const k of Object.keys(extraHeaders)) headers[k] = extraHeaders[k];
  return new Response(JSON.stringify(payload), { status, headers });
}

function bad(message) {
  return json({ error: message }, 400, null);
}

Deno.serve(async (req) => {
  const gate = methodGate(req, CORS);
  if (gate) return gate;

  const url = new URL(req.url);
  const params = url.searchParams;
  const mode = params.get("mode") || "latest";

  try {
    if (mode === "latest") return await handleLatest(params);
    if (mode === "series") return await handleSeries(params);
    if (mode === "day") return await handleDay(params);
    return bad("mode must be 'latest', 'series' or 'day'");
  } catch (e) {
    /* ⚠ THE EXCEPTION IS NEVER THE MESSAGE — relayFail says only which bound was hit. This endpoint
       is world-readable (CodeQL js/stack-trace-exposure). */
    return relayFail(e, CORS);
  }
});

async function handleLatest(params) {
  const now = Date.now();
  const wantId = params.get("provider");
  let providers = PROVIDERS;
  let query = { now };

  if (wantId) {
    const p = providerById(wantId);
    if (!p) return bad("unknown provider");
    providers = [p];
    /* A chunk is only meaningful for a provider that declared one, and asking for a slice is what
       makes an over-budget provider readable — the slice itself is inside the budget. */
    const chunk = Math.max(0, Math.floor(Number(params.get("chunk") || 0)));
    query = { now, chunk, chunked: true };
  }

  const results = await Promise.all(providers.map((p) => runProvider(p, "latest", query)));
  const merged = mergeLatest(results);

  /* ⚠ ALL SIX DOWN IS A 502; ONE DOWN IS NOT. `read` on each source is what tells the page which is
     which, so a partial answer must still be served — a radiation map missing Japan is far better
     than no radiation map. Only a total failure to reach anything is an error. */
  let anyRead = false;
  for (const s of merged.sources) if (s.read) anyRead = true;
  if (!anyRead) return json({ error: "upstream_unreachable" }, 502, null);

  const included = [];
  for (let i = 0; i < providers.length; i++) if (merged.sources[i].read) included.push(providers[i]);

  return json({
    v: 1,
    at: new Date(now).toISOString(),
    unit: "nSv/h",
    sources: merged.sources,
    stations: merged.stations,
    reference: merged.reference,
  }, 200, {
    "cache-control": cacheControlFor(included),
    "x-intmap-rows": String(merged.stations.length + merged.reference.length),
  });
}

async function handleSeries(params) {
  const station = params.get("station") || "";
  const cut = station.indexOf(":");
  if (cut < 1) return bad("station must be '<providerId>:<code>'");
  const p = providerById(station.slice(0, cut));
  const code = station.slice(cut + 1);
  if (!p || !code) return bad("unknown station");

  /* ⚠ "THIS NETWORK KEEPS NO HISTORY" IS AN ANSWER, NOT AN ERROR. A 400 would tell the page it asked
     wrongly; it asked correctly and the world has no data. RAMIS and the RIVM 2011 layer are both in
     this position, and a chart that says so is better than an error the page has to interpret. */
  if (!p.series) {
    return json({ v: 1, station, unit: "nSv/h", series: [], reason: "no-history" }, 200, {
      "cache-control": "public, max-age=86400, s-maxage=86400",
    });
  }

  const to = params.get("to") || new Date().toISOString().slice(0, 19) + "Z";
  const from = params.get("from") ||
    new Date(Date.parse(to) - 86400000).toISOString().slice(0, 19) + "Z";
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))) {
    return bad("from/to must be ISO 8601 instants");
  }

  const r = await runProvider(p, "series", { code, from, to });
  if (!r.read) return json({ error: r.reason || "upstream_unreachable" }, 502, null);

  return json({
    v: 1,
    station,
    unit: "nSv/h",
    quantity: p.quantity,
    kind: p.kind,
    source: { id: p.id, name: p.name, attribution: p.attribution, licence: p.licence, url: p.homepage },
    series: r.records,
  }, 200, {
    "cache-control": cacheControlFor([p]),
    "x-intmap-rows": String(r.records.length),
  });
}

/* Chronos asks this one when the clock is in the past: the day mean for a named date, from whichever
   providers publish one. Today, that is HKO. A provider without a `day` mode answers read:false with
   reason "no-day" rather than being silently absent — the page can then say which networks have no
   answer for that date instead of implying they measured nothing. */
async function handleDay(params) {
  const iso = params.get("iso") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return bad("iso must be YYYY-MM-DD");

  const results = await Promise.all(PROVIDERS.map((p) => runProvider(p, "day", { iso })));
  const merged = mergeLatest(results);

  let anyRead = false;
  for (const s of merged.sources) if (s.read) anyRead = true;
  if (!anyRead) {
    return json({
      v: 1, at: iso + "T00:00:00Z", unit: "nSv/h",
      sources: merged.sources, stations: [], reference: [],
    }, 200, { "cache-control": "public, max-age=3600, s-maxage=86400" });
  }

  return json({
    v: 1,
    at: iso + "T00:00:00Z",
    unit: "nSv/h",
    sources: merged.sources,
    stations: merged.stations,
    reference: merged.reference,
  }, 200, {
    /* A completed day never changes again, so this is the one answer here that may sit at the edge. */
    "cache-control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    "x-intmap-rows": String(merged.stations.length + merged.reference.length),
  });
}
