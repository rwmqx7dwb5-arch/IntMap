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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

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

function summariseMeteoAlarm(raw, lang) {
  const j = JSON.parse(raw);
  const rows = [];
  for (const w of (j.warnings || [])) {
    const infos = (w?.alert?.info) || [];
    if (!infos.length) continue;
    const pick = infos.find((i) => String(i.language || "").toLowerCase().startsWith(lang))
      || infos.find((i) => String(i.language || "").toLowerCase().startsWith("en"))
      || infos[0];
    const areas = (pick.area || []).map((a) => String(a.areaDesc || "")).filter(Boolean);
    rows.push({
      area: areas.join(", ").slice(0, 160),
      event: String(pick.event || "").slice(0, 80),
      headline: String(pick.headline || "").slice(0, 160),
      tier: SEV[String(pick.severity)] || 1,
      severity: String(pick.severity || ""),
      onset: pick.onset || pick.effective || "",
      expires: pick.expires || "",
    });
  }
  return { source: "MeteoAlarm (EUMETNET)", count: rows.length, warnings: rows };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return new Response("method", { status: 405, headers: CORS });

  const q = new URL(req.url).searchParams;
  /* `?ma=germany,france,…` — one call, several countries, each summarised */
  const ma = (q.get("ma") || "").trim();
  if (ma) {
    const lang = (q.get("lang") || "en").toLowerCase().slice(0, 5);
    const names = ma.split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z-]{3,40}$/.test(x)).slice(0, 40);
    if (!names.length) {
      return new Response(JSON.stringify({ error: "no country named" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });
    }
    const out = {};
    await Promise.all(names.map(async (n) => {
      try {
        const r = await fetch("https://feeds.meteoalarm.org/api/v1/warnings/feeds-" + n, {
          headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)", accept: "application/json" },
          signal: AbortSignal.timeout(45000),
        });
        if (!r.ok) { out[n] = { error: "upstream " + r.status }; return; }
        out[n] = summariseMeteoAlarm(await r.text(), lang);
      } catch (e) { out[n] = { error: String((e && e.message) || e) }; }
    }));
    return new Response(JSON.stringify({ countries: out }), {
      headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": CACHE },
    });
  }

  const target = q.get("u") || "";
  const ok = allowed(target);
  if (!ok) {
    return new Response(JSON.stringify({ error: "not an allowed feed" }), {
      status: 400, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  try {
    const r = await fetch(ok.toString(), {
      headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)", accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    const body = await r.text();
    // the response must BE the kind of document the layer is about to parse; a login
    // page or an error HTML must not reach the app as "the warnings"
    try { JSON.parse(body); } catch (_) {
      return new Response(JSON.stringify({ error: "upstream did not return JSON", status: r.status }), {
        status: 502, headers: { ...CORS, "content-type": "application/json" },
      });
    }
    return new Response(body, {
      status: r.status,
      headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": CACHE },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e && e.message) || e) }), {
      status: 502, headers: { ...CORS, "content-type": "application/json" },
    });
  }
});
