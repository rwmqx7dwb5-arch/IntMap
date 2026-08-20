// ============================================================================
//  IntMap · alerts-relay  —  official weather-warning feeds  (Supabase Edge Function, Deno)
// ----------------------------------------------------------------------------
//  WHY THIS EXISTS (#R266 — 「気象災害警報レイヤーはくそ。対応する国をもっと増やせ。
//  少なくとも G7, 中露には対応しろ。」):
//
//  The layer covered Japan (JMA) and the United States (NWS) at the issuing unit and
//  everything else through GDACS, which is a DISASTER feed, not a national warning
//  service. The reason was never that other services do not publish — it is that they
//  do not publish with CORS. MEASURED, this build, same second:
//
//      feeds.meteoalarm.org     200, valid CAP JSON, NO access-control-allow-origin
//      www.nmc.cn (CMA)         200, 927 live warnings, http only, no ACAO
//      api.weather.gc.ca        200 AND `Access-Control-Allow-Origin: *`   ← no relay needed
//
//  So the two that a browser cannot read go server-side, where browser CORS does not
//  apply, and come back with ACAO — the same answer #R145 (sv-cov), #R190 (cable-geo)
//  and #R216 (news-relay) already gave. Canada is fetched DIRECTLY by the page, because
//  it can be: a relay that is not needed is just another thing to be down.
//
//  ⚠ NOT AN OPEN PROXY. Two hosts, three path shapes, GET only, and the response must
//  parse as JSON. Anything else is a 400. Keyless & public — no user data reaches it.
//
//  ⚠ SIXTY SECONDS OF EDGE CACHE, NOT FIVE MINUTES. 「全然現実の発令に追い付いていない。
//  リアルタイムで反映しろ。」 A warning is a safety claim with a clock on it; the cache is
//  there to turn a burst of readers into one upstream request, not to age the answer.
//
//  Deploy: supabase functions deploy alerts-relay --no-verify-jwt --project-ref vpekfwdpurzejrrmacac
//  Secrets: none.
// ============================================================================

import { corsFor, fetchGuarded, methodGate, relayFail, MAX_QUERY_URL } from "../_shared/relay-guard.js";

const CORS = corsFor();
const CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

/* ══ ⚠⚠ ONE CALLER-SIZED REQUEST WAS BUYING FORTY UPSTREAM-SIZED ONES ═══════════════════════════
   `?ma=` took `.slice(0, 40)` country slugs and fetched them ALL, in parallel, with a 45-second
   deadline each. MEASURED (the note further down): feeds-germany is 10,284,904 bytes. So a single
   unauthenticated GET of ~300 characters could ask this function to pull up to FOUR HUNDRED
   MEGABYTES from EUMETNET, hold it in one isolate, and JSON.parse it — and repeating names
   (`?ma=germany,germany,…`) multiplied the same feed forty times over.

   The client never asks for more than six. js/world-packs.js seeds MA_DEFAULT = the four European
   G7 members and then washes the rest MA_PER_TICK = 6 at a time, precisely so that «37 × 10 MB
   upstream is not a page load». The relay now says the same number the caller already obeys, and
   deduplicates before counting, so normal use is bit-for-bit unchanged and the amplifier is gone. */
const MA_MAX_COUNTRIES = 6;
/* Germany measured 10.28 MB; 24 MB is more than twice the largest observed feed and still a bound. */
const MA_MAX_BYTES = 24 * 1024 * 1024;
const MA_TIMEOUT_MS = 45000;
/* The CMA list is ~300 items of JSON — hundreds of kilobytes at the outside. */
const U_MAX_BYTES = 8 * 1024 * 1024;
const U_TIMEOUT_MS = 45000;

/* The allow-list, checked structurally rather than with a `startsWith` so a crafted
   string cannot smuggle a different host past it. */
/* ⚠ NO TYPE ANNOTATIONS IN THIS FILE. The repo's static gate runs `node --check` over every .ts,
   and Node checks a .ts as CommonJS unless it is told otherwise — so the existing Edge Functions
   (news-relay, cable-geo, sv-cov) are plain JS in a .ts file, and this one is too. */
function allowed(raw) {
  let u;
  try { u = new URL(raw); } catch (_) { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = u.hostname.toLowerCase();
  // MeteoAlarm — the EUMETNET aggregation: 37 European services, incl. DWD, Météo-France,
  // the Met Office and the Servizio Meteorologico. One feed per country.
  if (h === "feeds.meteoalarm.org") {
    return /^\/api\/v1\/warnings\/feeds-[a-z-]{3,40}$/.test(u.pathname) ? u : null;
  }
  // CMA — the China Meteorological Administration's public warning list.
  if (h === "www.nmc.cn") {
    return u.pathname === "/rest/findAlarm" ? u : null;
  }
  return null;
}

/* ══ ⚠⚠ THE METEOALARM FEED IS TEN MEGABYTES, AND NINE OF THEM ARE TRANSLATIONS ═══════════════
   MEASURED: feeds-germany is 10,284,904 bytes — 532 warnings, each carried in eight languages
   (de-DE, en, fr, es, ar, ru, tr, pl) with the full CAP description and instruction text. Shipping
   that to a phone to draw a colour and a region name would be absurd, and thirty-seven of them
   would be four hundred megabytes.

   So the relay SUMMARISES: one row per warning per region, with the region name, the hazard, the
   severity and the times, in the caller's language when the feed carries it and English otherwise.
   That is everything the layer draws and everything the tap prints. Germany's 10 MB becomes tens of
   kilobytes, and the 60-second edge cache means one reader pays for all of them.
   ⚠ THE SUMMARY IS A PROJECTION, NOT AN EDIT: nothing is reworded, reclassified or dropped for
   being small — every warning in the feed produces a row. */
const SEV = { Extreme: 3, Severe: 2, Moderate: 1, Minor: 1, Unknown: 1 };

/* == (#R271) THE AREA IS WHAT GETS COLOURED, SO THE AREA HAS TO SURVIVE THE SUMMARY ============
   The layer used to paint whole countries because that is all this summary told it: every area of a
   warning was flattened into one comma-joined string. MEASURED over ten national feeds the same
   minute, that threw away exactly what a map needs — the United Kingdom's and Norway's feeds carry
   a CAP <polygon> per area, and the rest carry an `areaDesc` that IS the region's published name
   (Italy「Toscana」, the Netherlands「Drenthe」, France「Cantal」), which the app matches against
   Eurostat's NUTS geometry.

   So the summary now carries a SECOND projection: one row per REGION, deduplicated by EMMA_ID (or
   by name where the feed publishes none), holding the worst tier in force there and the hazards by
   name. Deduplication is what keeps it small — Spain publishes 15,170 area entries across roughly a
   hundred and eighty distinct zones — and it is still a projection, not an edit: every warning in
   the feed contributes to the region it names.
   WARNING THE CAP POLYGON IS PASSED THROUGH VERBATIM, not parsed here: the app turns "lat,lon ..."
   into GeoJSON, and doing it in one place is what stops the two ends disagreeing about the order. */
const AREA_CAP = 400;      /* per country; `areaTotal` states the real number either way */

function summariseMeteoAlarm(raw, lang) {
  const j = JSON.parse(raw);
  const rows = [];
  const areaMap = new Map();
  for (const w of (j.warnings || [])) {
    const infos = (w?.alert?.info) || [];
    if (!infos.length) continue;
    const pick = infos.find((i) => String(i.language || "").toLowerCase().startsWith(lang))
      || infos.find((i) => String(i.language || "").toLowerCase().startsWith("en"))
      || infos[0];
    const areas = (pick.area || []).map((a) => String(a.areaDesc || "")).filter(Boolean);
    const tier = SEV[String(pick.severity)] || 1;
    for (const a of (pick.area || [])) {
      const name = String(a.areaDesc || "").trim();
      if (!name) continue;
      const emma = ((a.geocode || []).find((g) => String(g.valueName || "") === "EMMA_ID") || {}).value || "";
      const key = String(emma || name);
      const bucket = areaMap.get(key) || { name, emma: String(emma || ""), tier: 0, events: [], poly: "" };
      areaMap.set(key, bucket);
      if (tier > bucket.tier) bucket.tier = tier;
      if (!bucket.poly && a.polygon) bucket.poly = String(Array.isArray(a.polygon) ? a.polygon[0] : a.polygon).slice(0, 20000);
      const ev = String(pick.event || "").slice(0, 80);
      if (ev && !bucket.events.some((e) => e.event === ev)) {
        bucket.events.push({ event: ev, severity: String(pick.severity || ""), tier });
      }
    }
    rows.push({
      area: areas.join(", ").slice(0, 160),
      event: String(pick.event || "").slice(0, 80),
      headline: String(pick.headline || "").slice(0, 160),
      tier,
      severity: String(pick.severity || ""),
      onset: pick.onset || pick.effective || "",
      expires: pick.expires || "",
    });
  }
  const areas = [...areaMap.values()].sort((a, b) => b.tier - a.tier).slice(0, AREA_CAP);
  /* ⚠ (#R269) `fetchedAt` — WHEN THIS SUMMARY WAS READ FROM MeteoAlarm. The rows carry `onset` and
     `expires`, which are the VALIDITY WINDOW and are normally in the FUTURE: the app's freshness
     instrument used them and reported MeteoAlarm as 82 hours «newer than now». A validity window is
     not an issue time, and a feed with no clock at all is the blind spot the instrument exists for,
     so the relay states the one timestamp it can actually vouch for. */
  return { source: "MeteoAlarm (EUMETNET)", fetchedAt: new Date().toISOString(), count: rows.length,
    warnings: rows, areas, areaTotal: areaMap.size };
}

/* ══ ⚠⚠ (#R271 追記2) THE PHILIPPINES — A NEW COUNTRY, AND ITS OWN PROVINCE POLYGONS ══════════
   「対応国も増やせ。」 #R268 probed PAGASA and #R271 measured it again: `publicalert.pagasa.dost.gov.ph`
   answers 200 with an Atom index of CAP messages and NO Access-Control-Allow-Origin, so it needs the
   relay. The first look stopped at the Tropical Cyclone Alert bulletins, whose only `<area>` is
   「Philippine Area of Responsibility」 — a 16°×17° box over the open sea, which would be a lie to
   draw. Looking at the REST of the feed is what changed the answer: the General Flood Advisories
   carry one `<area>` PER PROVINCE with a real `<polygon>` and a `<geocode>`, and their `<event>`
   names the band (Extreme / Severe / Moderate). MEASURED, one minute: 51 entries, 43 of them GFAs
   over 17 regions, La Union / Ilocos Sur / Pangasinan / … with 3–9 polygons each.

   So: the Atom index, the newest bulletin per region (a GFA is numbered and each supersedes the one
   before — `references` chains them, and the newest `<updated>` per region title is the state), the
   CAP files for those, and one row per province.
   ⚠ THE PAR BOX IS DROPPED BY NAME. An area that is the whole area of responsibility is not an
   issuing unit, and drawing it would put a rectangle over the Philippine Sea.
   ⚠ AND AN EXPIRED BULLETIN IS NOT IN FORCE — `expires` is checked here rather than shipped for the
   app to check, because the number the panel prints has to be the number that is current. */
const PH_FEED = "https://publicalert.pagasa.dost.gov.ph/feeds/";
const PH_MAX = 24;                    /* CAP files fetched per refresh; `capTotal` states the real number */
/* ⚠ (#R269's rule) FORTY-FIVE SECONDS, NOT TWENTY — a budget shorter than the upstream's bad days
   turns an available feed into 「取得不可」 at random. The CAP files are fetched in parallel, so this
   is a per-request ceiling rather than a sum, and tests/r269 ④ holds every upstream fetch to it. */
const PH_PAR = /philippine area of responsibility/i;

function xmlAll(src, tag) {
  const out = [];
  const re = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + tag + ">", "g");
  let m;
  while ((m = re.exec(src))) out.push(m[1]);
  return out;
}
const xmlOne = (src, tag) => (xmlAll(src, tag)[0] || "").trim();
const unesc = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&amp;/g, "&");

async function summarisePAGASA() {
  const r = await fetch(PH_FEED, {
    headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)" },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error("pagasa " + r.status);
  const feed = await r.text();
  /* newest bulletin per REGION: the title is 「GFA #7 - Region 3 (Central Luzon)」, so the region is
     what follows the first « - » and the number is what changes between generations. */
  const newest = new Map();
  for (const e of xmlAll(feed, "entry")) {
    const title = unesc(xmlOne(e, "title"));
    const updated = xmlOne(e, "updated");
    const href = (/<link[^>]*href="([^"]+)"/.exec(e) || [])[1];
    if (!href || !/^https:\/\/publicalert\.pagasa\.dost\.gov\.ph\//.test(href)) continue;
    const region = title.replace(/^[^-]*-\s*/, "").trim() || title;
    const prev = newest.get(region);
    if (!prev || String(updated) > String(prev.updated)) newest.set(region, { updated, href, title });
  }
  const picks = [...newest.values()].sort((a, b) => (a.updated < b.updated ? 1 : -1));
  const capTotal = picks.length;
  const now = Date.now();
  const areas = new Map();
  const rows = [];
  await Promise.all(picks.slice(0, PH_MAX).map(async (pk) => {
    try {
      const rr = await fetch(pk.href, {
        headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)" },
        signal: AbortSignal.timeout(45000),
      });
      if (!rr.ok) return;
      const cap = await rr.text();
      if (/<status>\s*Exercise|Test\s*<\/status>/i.test(cap)) return;
      const event = unesc(xmlOne(cap, "event"));
      const severity = unesc(xmlOne(cap, "severity"));
      const expires = xmlOne(cap, "expires");
      const sent = xmlOne(cap, "sent");
      if (expires) { const t = Date.parse(expires); if (isFinite(t) && t < now) return; }
      const tier = SEV[severity] || 1;
      for (const a of xmlAll(cap, "area")) {
        const name = unesc(xmlOne(a, "areaDesc"));
        if (!name || PH_PAR.test(name)) continue;
        const poly = xmlOne(a, "polygon");
        const b = areas.get(name) || { name, tier: 0, events: [], poly: "" };
        areas.set(name, b);
        if (tier > b.tier) b.tier = tier;
        if (!b.poly && poly) b.poly = poly.replace(/\s+/g, " ").trim().slice(0, 20000);
        if (event && !b.events.some((x) => x.event === event)) b.events.push({ event, severity, tier });
        rows.push({ area: name, event, headline: unesc(xmlOne(cap, "headline")).slice(0, 160),
          tier, severity, onset: sent, expires });
      }
    } catch (_e) { /* one unreachable bulletin is not the whole country */ }
  }));
  return { source: "PAGASA-DOST (Philippines)", fetchedAt: new Date().toISOString(),
    count: rows.length, warnings: rows.slice(0, 400),
    areas: [...areas.values()].sort((a, b) => b.tier - a.tier).slice(0, AREA_CAP),
    areaTotal: areas.size, capTotal, capRead: Math.min(PH_MAX, capTotal) };
}

Deno.serve(async (req) => {
  const gate = methodGate(req, CORS);
  if (gate) return gate;

  const q = new URL(req.url).searchParams;
  /* `?ph=1` — the Philippines, summarised the same way MeteoAlarm is (see summarisePAGASA) */
  if (q.get("ph")) {
    try {
      const body = await summarisePAGASA();
      return new Response(JSON.stringify(body), {
        headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": CACHE },
      });
    } catch (_e) {
      return new Response(JSON.stringify({ error: "upstream unreachable" }), {
        status: 502, headers: { ...CORS, "content-type": "application/json" },
      });
    }
  }
  /* `?ma=germany,france,…` — one call, several countries, each summarised */
  const ma = (q.get("ma") || "").trim();
  if (ma) {
    const lang = (q.get("lang") || "en").toLowerCase().slice(0, 5);
    /* Deduplicate BEFORE the cap, so `germany,germany,…` costs one fetch rather than six. */
    const names = [...new Set(
      ma.split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z-]{3,40}$/.test(x)),
    )].slice(0, MA_MAX_COUNTRIES);
    if (!names.length) {
      return new Response(JSON.stringify({ error: "no country named" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });
    }
    const out = {};
    await Promise.all(names.map(async (n) => {
      try {
        const r = await fetchGuarded("https://feeds.meteoalarm.org/api/v1/warnings/feeds-" + n, {
          timeoutMs: MA_TIMEOUT_MS,
          maxBytes: MA_MAX_BYTES,
          contentTypeRe: /json|text\//i,
          headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)", accept: "application/json" },
        });
        if (!r.ok) { out[n] = { error: "upstream_error" }; return; }
        out[n] = summariseMeteoAlarm(r.text(), lang);
      } catch (_e) { out[n] = { error: "unreachable" }; }   /* ⚠ the upstream exception is NOT echoed:
           it can carry a stack, and this response is public (CodeQL js/stack-trace-exposure) */
    }));
    return new Response(JSON.stringify({ countries: out }), {
      headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": CACHE },
    });
  }

  const target = q.get("u") || "";
  const ok = target.length <= MAX_QUERY_URL ? allowed(target) : null;
  if (!ok) {
    return new Response(JSON.stringify({ error: "not an allowed feed" }), {
      status: 400, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  /* ⚠ (#R269) TWENTY SECONDS WAS NOT A BUDGET, IT WAS A COIN TOSS. MEASURED on production: this
     relay answered `502 upstream unreachable` after exactly 20,140 ms for the CMA list while the
     SAME url fetched from a laptop returned 300 items in 1.0 s. www.nmc.cn is reachable from the
     edge region but not always quickly, and a timeout shorter than the upstream's bad days turns an
     available feed into 「取得不可」 at random. Forty-five seconds and ONE retry; the 60-second edge
     cache means a reader still pays for at most one upstream request a minute either way. */
  try {
    let r = null;
    for (let i = 0; i < 2 && !r; i++) {
      try {
        r = await fetchGuarded(ok.toString(), {
          timeoutMs: U_TIMEOUT_MS,
          maxBytes: U_MAX_BYTES,
          contentTypeRe: /json|text\//i,
          headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)", accept: "application/json" },
        });
      } catch (_e) { if (i) throw _e; }
    }
    const body = r.text();
    // the response must BE the kind of document the layer is about to parse; a login
    // page or an error HTML must not reach the app as "the warnings"
    try { JSON.parse(body); } catch (_) {
      return new Response(JSON.stringify({ error: "upstream_not_json" }), {
        status: 502, headers: { ...CORS, "content-type": "application/json" },
      });
    }
    return new Response(body, {
      status: r.status,
      headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": CACHE },
    });
  } catch (e) {
    /* ⚠ ONE WORD, NOT THE EXCEPTION. Whatever went wrong upstream is a server-side fact; echoing it
       hands a stack trace to anyone who can call this URL (CodeQL js/stack-trace-exposure), and the
       layer's own legend already says «this feed could not be fetched just now», which is the only
       thing a reader can act on. relayFail names the BOUND that was hit and nothing else. */
    return relayFail(e, CORS);
  }
});
