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
  // WMO Severe Weather Information Centre — see the `?swic=` block below.
  if (h === "severeweather.wmo.int") {
    return (u.pathname === "/f/wfs" || /^\/json\/[a-z_-]{3,30}\.json$/.test(u.pathname)) ? u : null;
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

/* ══ ⚠⚠⚠ GREEN IS NOT A WARNING, AND THE MAP WAS PAINTING IT AS ONE ═══════════════════════════
   「発令されていないだけの地域は灰色に。」「正確にリアルタイムな情報に基づき正確で忠実な色分けを。」

   MEASURED against feeds.meteoalarm.org, this build: Italy publishes 474 warnings and **201 of them
   are 「Green Thunderstorm Warning」** — MeteoAlarm's own awareness level 1, which means NO awareness
   is required. Belgium's whole feed is green (67 heatwave + 18 rain, ten regions, tier 1 on every
   one), and Belgium came out of this relay as ten warned regions. The summary read `severity`, and
   CAP severity for a green row is 「Minor」 or 「Moderate」, which `SEV` mapped to a warning tier.

   The level is published as a PARAMETER and it is language-independent:

       { valueName: "awareness_level", value: "1; green; Minor" }     ← nothing in force
       { valueName: "awareness_level", value: "2; yellow; Moderate" }
       { valueName: "awareness_level", value: "3; orange; Severe" }
       { valueName: "awareness_level", value: "4; red; Extreme" }

   ⚠ THE EVENT TEXT IS NOT A SUBSTITUTE. Italy names the colour in the event («Green Thunderstorm
   Warning»); Austria does not («Thunderstormwarning», 796 of them, every one awareness level 2).
   Reading the word out of a translated string would have found Italy and missed Austria entirely.

   So: level 1 is DROPPED (and counted, so the panel can say how many), and 2/3/4 become the CAP
   ladder tiers 1/2/3 the rest of this layer paints. A feed without the parameter falls back to
   `severity`, which is what it did before. */
const AWARENESS = /^\s*([1-4])\s*;/;
function awarenessOf(info) {
  const p = ((info && info.parameter) || []).find(
    (x) => String((x && x.valueName) || "").toLowerCase() === "awareness_level",
  );
  if (!p) return 0;
  const m = AWARENESS.exec(String(p.value || ""));
  return m ? Number(m[1]) : 0;
}

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
  let green = 0;
  for (const w of (j.warnings || [])) {
    const infos = (w?.alert?.info) || [];
    if (!infos.length) continue;
    const pick = infos.find((i) => String(i.language || "").toLowerCase().startsWith(lang))
      || infos.find((i) => String(i.language || "").toLowerCase().startsWith("en"))
      || infos[0];
    const areas = (pick.area || []).map((a) => String(a.areaDesc || "")).filter(Boolean);
    /* ⚠ the awareness level decides both whether this is a warning at all and how bad it is —
       see the note on `awarenessOf`. Level 1 is green: the service is saying nothing is needed. */
    const aw = awarenessOf(pick);
    if (aw === 1) { green++; continue; }
    const tier = aw ? Math.max(1, aw - 1) : (SEV[String(pick.severity)] || 1);
    for (const a of (pick.area || [])) {
      const name = String(a.areaDesc || "").trim();
      if (!name) continue;
      const emma = ((a.geocode || []).find((g) => String(g.valueName || "") === "EMMA_ID") || {}).value || "";
      const key = String(emma || name);
      const bucket = areaMap.get(key) || { name, emma: String(emma || ""), tier: 0, events: [], poly: "", sent: "" };
      areaMap.set(key, bucket);
      /* ⚠⚠ (#R293) 「いつ発表の情報か、そしてIntMapがいつ取得した情報かも書け」 — TWO CLOCKS, AND THIS
         IS THE AGENCY'S. `fetchedAt` (below) is when the RELAY read the service; the CAP bulletin's
         own `sent` is when the service ISSUED the warning, and until now only the first of them
         reached the map — so a card could not answer 「この情報はいつのものか」 at all. An area keeps
         the NEWEST `sent` among the bulletins folded into it. (SWIC already tracked this; MeteoAlarm
         and the CAP services did not.) */
      { const st = String((w?.alert?.sent) || pick.onset || pick.effective || "");
        if (st > bucket.sent) bucket.sent = st; }
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
  /* `green` is printed rather than hidden: 「nothing in force」 for a country whose feed is all
     green is a STATEMENT, and the number is the evidence for it (no silent filtering). */
  /* ⚠ (#R269) `fetchedAt` — WHEN THIS SUMMARY WAS READ FROM MeteoAlarm. The rows carry `onset` and
     `expires`, which are the VALIDITY WINDOW and are normally in the FUTURE: the app's freshness
     instrument used them and reported MeteoAlarm as 82 hours «newer than now». A validity window is
     not an issue time, and a feed with no clock at all is the blind spot the instrument exists for,
     so the relay states the one timestamp it can actually vouch for. */
  return { source: "MeteoAlarm (EUMETNET)", fetchedAt: new Date().toISOString(), count: rows.length,
    warnings: rows, areas, areaTotal: areaMap.size, green };
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
        const b = areas.get(name) || { name, tier: 0, events: [], poly: "", sent: "" };
        areas.set(name, b);
        if (sent > b.sent) b.sent = sent;      /* (#R293) the agency's own issue time — see MeteoAlarm above */
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

/* == (#R273) ONE READER FOR EVERY "CAP INDEX + CAP FILES" SERVICE =============================
   'taiou-koku mo fuyase. source wa ikkoku ichi source.' -- and 'GDACS wo kanzen ni teppai shiro',
   which is what makes this necessary rather than nice: with the global event feed gone, a country
   with no national service wired is a country the map says nothing about, so the cost of adding
   one has to be one table entry.

   The Philippines reader above was written for PAGASA and is the same three steps every national
   CAP service publishes: an RSS/Atom INDEX of bulletins, one CAP file per bulletin, and one
   <area> per issuing unit inside it. MEASURED this round, from a real request:

       alerts.ncdr.nat.gov.tw/RssAtomFeed.ashx   200 - Atom - 1,029 entries, 157 of them the
                                                 CWA's own (the rest are the water utility, the
                                                 railway and the fire service) -- CAP 1.2 with a
                                                 <polygon> per area and the CWA's OWN colour in an
                                                 alert_color parameter
       alerts.metservice.com/cap/rss             200 - RSS - CAP index, EMPTY at the time of
                                                 writing (no warning in force in New Zealand that
                                                 minute) -- recorded as such rather than claimed
                                                 as verified
       caps.weathersa.co.za                      200 - RSS - 306 items, and every <link> in it
                                                 points at weathersa.co.za, which answered
                                                 "521 Web server is down". NOT wired.

   WARNING THE AGENCY'S OWN COLOUR TRAVELS WITH THE ROW. `acol` is whatever word the service
   publishes for the rank it assigned (Taiwan's own colour word, a CAP awareness level elsewhere);
   the app maps it to that agency's published palette, which is the whole point of the
   "each agency's official colours" mode. Nothing is inferred from the text of a headline. */
const CAPSRC = {
  tw: { url: "https://alerts.ncdr.nat.gov.tw/RssAtomFeed.ashx", kind: "atom",
        only: /\u4e2d\u592e\u6c23\u8c61\u7f72/, source: "CWA (Taiwan), via NCDR", max: 60 },
  nz: { url: "https://alerts.metservice.com/cap/rss", kind: "rss",
        source: "MetService (New Zealand)", max: 40 },
};
/* an <area> that is the whole area of responsibility is not an issuing unit (#R271 tsuiki2) */
const AREA_SKIP = /area of responsibility|whole country|nationwide/i;

function capLinks(feed, kind) {
  const out = [];
  const blocks = xmlAll(feed, kind === "rss" ? "item" : "entry");
  for (const e of blocks) {
    let href = "";
    if (kind === "rss") href = unesc(xmlOne(e, "link"));
    else href = (/<link[^>]*href="([^"]+)"/.exec(e) || [])[1] || "";
    if (!/^https?:/.test(href)) continue;
    const updated = xmlOne(e, kind === "rss" ? "pubDate" : "updated");
    out.push({ href, updated, block: e, title: unesc(xmlOne(e, "title")) });
  }
  return out;
}

async function summariseCAP(key) {
  const cfg = CAPSRC[key];
  const r = await fetch(cfg.url, {
    headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)" },
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(key + " " + r.status);
  const feed = await r.text();
  let picks = capLinks(feed, cfg.kind);
  if (cfg.only) picks = picks.filter((p) => cfg.only.test(p.block));
  const capTotal = picks.length;
  /* newest first, so a cap on how many files are read drops the OLDEST rather than a random set */
  picks.sort((a, b) => (Date.parse(b.updated) || 0) - (Date.parse(a.updated) || 0));
  const now = Date.now();
  const areas = new Map();
  const rows = [];
  await Promise.all(picks.slice(0, cfg.max).map(async (pk) => {
    try {
      const rr = await fetch(pk.href, {
        headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)" },
        signal: AbortSignal.timeout(45000),
      });
      if (!rr.ok) return;
      const cap = await rr.text();
      if (!/<alert/i.test(cap)) return;                    /* an error page is not a bulletin */
      const status = unesc(xmlOne(cap, "status"));
      const msgType = unesc(xmlOne(cap, "msgType"));
      if (status && !/actual/i.test(status)) return;
      if (/cancel/i.test(msgType)) return;
      const event = unesc(xmlOne(cap, "event")) || pk.title;
      const severity = unesc(xmlOne(cap, "severity"));
      const expires = xmlOne(cap, "expires");
      const sent = xmlOne(cap, "sent");
      if (expires) { const t = Date.parse(expires); if (isFinite(t) && t < now) return; }
      const tier = SEV[severity] || 1;
      /* the agency's own word for the rank, where it publishes one as a CAP <parameter> */
      let acol = "";
      for (const pm of xmlAll(cap, "parameter")) {
        if (/alert_color|awareness_level|colour|color/i.test(xmlOne(pm, "valueName"))) {
          acol = unesc(xmlOne(pm, "value")).slice(0, 40); break;
        }
      }
      for (const a of xmlAll(cap, "area")) {
        const name = unesc(xmlOne(a, "areaDesc"));
        if (!name || AREA_SKIP.test(name)) continue;
        const poly = xmlOne(a, "polygon");
        const b = areas.get(name) || { name, tier: 0, events: [], poly: "", acol: "", sent: "" };
        areas.set(name, b);
        if (sent > b.sent) b.sent = sent;      /* (#R293) the agency's own issue time — see MeteoAlarm above */
        if (tier > b.tier) { b.tier = tier; b.acol = acol; }
        if (!b.poly && poly) b.poly = poly.replace(/\s+/g, " ").trim().slice(0, 20000);
        if (event && !b.events.some((x) => x.event === event)) b.events.push({ event, severity, tier, acol });
        rows.push({ area: name, event, headline: unesc(xmlOne(cap, "headline")).slice(0, 160),
          tier, severity, acol, onset: sent, expires });
      }
    } catch (_e) { /* one unreachable bulletin is not the whole country */ }
  }));
  return { source: cfg.source, fetchedAt: new Date().toISOString(),
    count: rows.length, warnings: rows.slice(0, 400),
    areas: [...areas.values()].sort((a, b) => b.tier - a.tier).slice(0, AREA_CAP),
    areaTotal: areas.size, capTotal, capRead: Math.min(cfg.max, capTotal) };
}


/* ══ ⚠⚠⚠ (#R275) 「対応国も増やせ。」 — NINETY-FOUR MORE COUNTRIES, FROM THEIR OWN SERVICES ═══════
   #R273 answered the same sentence with two hand-picked countries (Taiwan, New Zealand), because
   every candidate had to be probed, mapped to a geometry source and wired one at a time. MEASURED
   this round, one by one: India needs its caller's IP whitelisted (401), Türkiye's MGM answers
   「Not allowed by MGM」 (500), Argentina's SMN is 503, Mexico's and South Africa's warning services
   serve HTML pages, Korea's RSS path returns the portal, Chile's JSON is a 404. Wiring countries by
   hand does not scale, and it was never the bottleneck — the bottleneck was that most NMHSs do not
   publish a CORS-open machine-readable feed OF THEIR OWN.

   They publish CAP into the WMO's register, and the WMO republishes it, VERBATIM AND WITH GEOMETRY:

       severeweather.wmo.int/f/wfs   GeoServer, `local_postgis:postgis_geojsons`
                                    → one GeoJSON feature per CAP <area>, carrying the issuing
                                      member (`mem`), the member's own `event` wording, the CAP
                                      severity (`s`, 0–4 = Unknown/Minor/Moderate/Severe/Extreme,
                                      the site's own `severityMapping`), `sent`, `expires` and the
                                      member's `capurl`.
   MEASURED, one minute, live: 4,358 warning polygons; Kazakhstan 150 areas, Russia 84, Saudi Arabia
   37, Indonesia 5, Korea 6, Chile 4, Thailand 1, Ukraine 1 — all countries this map was drawing as
   「未対応」 an hour ago, including the two (Russia, Korea) that #R266 recorded as having no
   machine-readable public feed at all.

   ⚠ THIS IS NOT GDACS COMING BACK. 「GDACSを完全に撤廃しろ。」 GDACS was an EVENT feed: its own model,
   its own severity, its unit a whole COUNTRY. This is the national service's OWN warning, at the
   polygon that service drew, with that service's own words and its own CAP severity — one source
   per country, which is what 「ソースは一国一ソース。各国の気象台やその他それに相当する機関の情報をもと
   にしろ」 asks for. The WMO is the transport, not the author, and the panel names the AUTHOR.
   ⚠ AND A COUNTRY WITH ANOTHER FEED DOES NOT GET THIS ONE. The app asks only for members it has no
   national or MeteoAlarm feed for, so Canada is still ECCC and Italy is still MeteoAlarm.

   ⚠ 「SUPPORTED」 IS THE WMO'S OWN REGISTER, NOT 「we saw a warning once」. `/json/cap-status.json`
   states, per member, whether its CAP implementation is 1 Completed / 2 Development / 3 Not started.
   Only 1 is wired, because drawing 「発表なし」 grey over a country that files nothing would be the
   exact lie the hatch exists to prevent. */
const SWIC = "https://severeweather.wmo.int";
const SWIC_TYPE = "local_postgis:postgis_geojsons";
const SWIC_MAX_MEMBERS = 6;
const SWIC_MAX_BYTES = 24 * 1024 * 1024;   /* Saudi Arabia measured 5.3 MB; the largest bound here */
const SWIC_TIMEOUT_MS = 45000;
/* one area's geometry can be a coastline; a member's whole answer is bounded and what was dropped
   for the bound is COUNTED and returned (no silent truncation — #R185) */
const SWIC_GEOM_BYTES = 1_400_000;
const SWIC_SEV = ["Unknown", "Minor", "Moderate", "Severe", "Extreme"];

/* ══ ⚠⚠ THE SCAN: WHO HAS ANYTHING IN FORCE, WITHOUT DOWNLOADING ANY SHAPES ═══════════════════
   Ninety-three wired members fetched six at a time is a four-minute first sweep, and for most of it
   the map would be painting 「発表なし」 grey over countries it had not read yet — a claim, not an
   observation. GeoServer honours `propertyName` for the geometry column as well (that is the trap
   the note on `swicUrl` records), so the SAME query with `wkb_geometry` left OUT is the whole
   register with every shape stripped: MEASURED 1.53 MB and 1.5 s for all 4,427 warning areas
   worldwide, against ~20 MB if the polygons came too.

   So one call answers 「どの国に何かが出ているか」 for every member at once — measured, 40 of them —
   and the per-member geometry calls are only made for those. A member the scan does not list has
   been READ and has nothing in force, which is the grey the map is entitled to draw. */
function swicScanUrl() {
  return SWIC + "/f/wfs?service=WFS&version=1.1.0&request=GetFeature"
    + "&typeName=" + encodeURIComponent(SWIC_TYPE)
    + "&outputFormat=" + encodeURIComponent("application/json")
    + "&propertyName=" + encodeURIComponent("mem,areadesc,s,sent,expires")
    + "&cql_filter=" + encodeURIComponent("row_type='POLYGON'");
}
function summariseSWICScan(raw) {
  const j = JSON.parse(raw);
  const now = Date.now();
  const by = new Map();
  let total = 0, expired = 0, newest = "";
  for (const f of (j.features || [])) {
    const pr = (f && f.properties) || {};
    const mem = String(pr.mem || "").trim();
    const name = String(pr.areadesc || "").trim();
    if (!mem || !name) continue;
    const exp = Date.parse(String(pr.expires || ""));
    if (Number.isFinite(exp) && exp < now) { expired++; continue; }
    total++;
    const sent = String(pr.sent || "");
    if (sent > newest) newest = sent;
    const b = by.get(mem) || { areas: new Set(), worst: 0, sent: "" };
    by.set(mem, b);
    b.areas.add(name);
    const sev = Math.max(0, Math.min(4, Number(pr.s) || 0));
    if (sev > b.worst) b.worst = sev;
    if (sent > b.sent) b.sent = sent;
  }
  const members = {};
  for (const [mem, b] of by) members[mem] = { areas: b.areas.size, worst: b.worst, sent: b.sent };
  return { fetchedAt: new Date().toISOString(), newest, total, expired, members };
}

function swicUrl(mid) {
  const cql = "row_type='POLYGON' AND mem='" + String(mid).replace(/[^0-9A-Za-z]/g, "") + "'";
  return SWIC + "/f/wfs?service=WFS&version=1.1.0&request=GetFeature"
    + "&typeName=" + encodeURIComponent(SWIC_TYPE)
    + "&outputFormat=" + encodeURIComponent("application/json")
    /* ⚠ `wkb_geometry` HAS TO BE NAMED. GeoServer honours `propertyName` for the geometry column
       too: leaving it out returns every feature with `"geometry": null` — measured, 37 Korean areas
       with no shape at all and a summary that looked complete. */
    + "&propertyName=" + encodeURIComponent("event,areadesc,sent,mem,s,expires,capurl,wkb_geometry")
    + "&cql_filter=" + encodeURIComponent(cql);
}

/* ══ ⚠⚠⚠ (#R277) THE SHAPE LIBRARY — 「漏れが多すぎる」、測った数字で ════════════════════
   MEASURED over all thirty-five MeteoAlarm countries the same minute: the app could place
   **754 of 1,127** published areas. The other 373 were dropped from the map in silence-by-numbers
   — Austria 86, Slovakia 59, Moldova 42, Spain 64, Portugal 18, Croatia 13, Belgium 9 … because
   MeteoAlarm's CAP carries NO polygon for them (`geocode` is a bare `EMMA_ID`) and their region
   names are not Eurostat NUTS names: 「Rijeka region」, 「Meseta cacereña」, 「Wien Brigittenau」.

   The shapes exist, published by the SAME national service, in the WMO register this relay already
   reads: measured, mem 006 (GeoSphere Austria) answers 164 rows with a real `<polygon>` on 109
   distinct area names — 「Lienz」, 「Graz-Umgebung」, 「Leoben」 — which is exactly the vocabulary
   MeteoAlarm names. So this endpoint is a NAME → SHAPE index for one member.

   ⚠ IT IS NOT A SECOND SOURCE OF WARNINGS. Nothing here carries an event, a severity or a time;
   「ソースは一国一ソース」 is untouched — the warning still comes from the country's own feed, and
   this supplies the outline the same agency drew for the same named unit.
   ⚠ AND THE EXPIRY FILTER IS DELIBERATELY OFF. A warning expires; the district it was drawn on
   does not. Filtering by `expires` would make the library only as complete as this minute's
   weather, which is the opposite of what an index is for.
   ⚠ COORDINATES ARE ROUNDED TO FOUR DECIMALS (~11 m). Austria measured 1.5 MB raw; a warning
   region is not a cadastral boundary and the rounding is stated rather than silent. */
const SWIC_GEO_MAX_MEMBERS = 3;
const SWIC_GEO_DP = 4;
function swicGeoUrl(mid) {
  const cql = "row_type='POLYGON' AND mem='" + String(mid).replace(/[^0-9A-Za-z]/g, "") + "'";
  return SWIC + "/f/wfs?service=WFS&version=1.1.0&request=GetFeature"
    + "&typeName=" + encodeURIComponent(SWIC_TYPE)
    + "&outputFormat=" + encodeURIComponent("application/json")
    + "&propertyName=" + encodeURIComponent("areadesc,sent,wkb_geometry")
    + "&cql_filter=" + encodeURIComponent(cql);
}
const _rnd = (v) => Math.round(v * 1e4) / 1e4;
function trimGeom(g) {
  if (!g || !g.coordinates) return g;
  const walk = (a) => Array.isArray(a[0]) ? a.map(walk) : [_rnd(a[0]), _rnd(a[1])];
  return { type: g.type, coordinates: walk(g.coordinates) };
}
function summariseSWICGeo(raw, mid) {
  const j = JSON.parse(raw);
  const by = new Map();
  for (const f of (j.features || [])) {
    if (!f || !f.geometry) continue;
    const name = String(((f.properties || {}).areadesc) || "").trim();
    if (!name) continue;
    const sent = String(((f.properties || {}).sent) || "");
    const b = by.get(name);
    if (!b || sent >= b.sent) by.set(name, { sent, geom: f.geometry });
  }
  const areas = []; let bytes = 0, dropped = 0;
  for (const [name, b] of by) {
    const g = trimGeom(b.geom);
    const n = JSON.stringify(g).length;
    if (bytes + n > SWIC_GEOM_BYTES) { dropped++; continue; }
    bytes += n;
    areas.push({ name, geom: g });
  }
  return { mid: String(mid), fetchedAt: new Date().toISOString(),
    areas, areaTotal: by.size, dropped, dp: SWIC_GEO_DP };
}

/* One member → one row per AREA, the way MeteoAlarm and the CAP services are summarised: the worst
   severity in force there, the distinct hazards by the member's own name for them, and ONE geometry
   — the one from the most recently SENT warning, because that is the shape currently in force. */
function summariseSWIC(raw, mid) {
  const j = JSON.parse(raw);
  const now = Date.now();
  const areas = new Map();
  let total = 0, expired = 0, geomBytes = 0, geomDropped = 0;
  for (const f of (j.features || [])) {
    const pr = (f && f.properties) || {};
    const name = String(pr.areadesc || "").trim();
    if (!name) continue;
    /* an expired bulletin is not in force — the number the panel prints has to be current */
    const exp = Date.parse(String(pr.expires || ""));
    if (Number.isFinite(exp) && exp < now) { expired++; continue; }
    total++;
    const sev = Math.max(0, Math.min(4, Number(pr.s) || 0));
    const tier = sev >= 4 ? 3 : sev === 3 ? 2 : 1;
    const event = String(pr.event || "").slice(0, 80);
    const sent = String(pr.sent || "");
    const b = areas.get(name) || { name, tier: 0, events: [], geom: null, sent: "", capurl: "" };
    areas.set(name, b);
    if (tier > b.tier) b.tier = tier;
    if (sent > b.sent) { b.sent = sent; b.capurl = String(pr.capurl || "").slice(0, 200); }
    if (event && !b.events.some((x) => x.event === event)) {
      b.events.push({ event, severity: SWIC_SEV[sev] || "Unknown", tier });
    }
    /* ⚠ THE SHAPE COMES FROM THE NEWEST BULLETIN FOR THIS AREA, and «newest» has to be tracked
       separately from `b.sent`: that field is already updated above, so comparing against it would
       be comparing this row with itself and every row would win in turn. */
    if (f.geometry && (!b._pendAt || sent >= b._pendAt)) { b._pending = f.geometry; b._pendAt = sent; }
  }
  const out = [...areas.values()].sort((a, b) => b.tier - a.tier).slice(0, AREA_CAP);
  for (const a of out) {
    const g = a._pending || null;
    delete a._pending; delete a._pendAt;
    if (!g) continue;
    const n = JSON.stringify(g).length;
    if (geomBytes + n > SWIC_GEOM_BYTES) { geomDropped++; continue; }
    geomBytes += n;
    a.geom = g;
  }
  return { source: "WMO Severe Weather Information Centre", mid: String(mid),
    fetchedAt: new Date().toISOString(), count: total, expired,
    areas: out, areaTotal: areas.size, geomDropped };
}

Deno.serve(async (req) => {
  const gate = methodGate(req, CORS);
  if (gate) return gate;

  const q = new URL(req.url).searchParams;
  /* `?swicmeta=1` — the WMO's own two tables: which member is which country, which service issues
     for it, and whether that member's CAP implementation is Completed. Small, and it is what
     decides which countries this map claims to cover at all. */
  if (q.get("swicmeta")) {
    try {
      const [mr, cr] = await Promise.all([
        fetchGuarded(SWIC + "/json/wmo_member.json", { timeoutMs: SWIC_TIMEOUT_MS, maxBytes: 2 * 1024 * 1024, contentTypeRe: /json|text\//i,
          headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)", accept: "application/json" } }),
        fetchGuarded(SWIC + "/json/cap-status.json", { timeoutMs: SWIC_TIMEOUT_MS, maxBytes: 512 * 1024, contentTypeRe: /json|text\//i,
          headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)", accept: "application/json" } }),
      ]);
      if (!mr.ok || !cr.ok) throw new Error("upstream_error");
      const members = [];
      for (const ra of JSON.parse(mr.text())) {
        for (const m of ((ra && ra.members) || [])) {
          if (m && m.code && m.mid) members.push({ mid: String(m.mid), code: String(m.code), dept: String(m.dept || m.name || "") });
        }
      }
      const cs = JSON.parse(cr.text());
      const status = {};
      for (const k of Object.keys(cs)) {
        if (!/^ra/.test(k)) continue;
        for (const [iso, v] of Object.entries(cs[k])) status[iso] = Number(v) || 0;
      }
      return new Response(JSON.stringify({ members, status, month: cs.month || "", year: cs.year || "" }), {
        headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=21600, s-maxage=21600" },
      });
    } catch (_e) {
      return new Response(JSON.stringify({ error: "upstream unreachable" }), {
        status: 502, headers: { ...CORS, "content-type": "application/json" },
      });
    }
  }
  /* `?swicscan=1` — which members have anything in force at all, shapes excluded (see above) */
  if (q.get("swicscan")) {
    try {
      const r = await fetchGuarded(swicScanUrl(), {
        timeoutMs: SWIC_TIMEOUT_MS,
        maxBytes: SWIC_MAX_BYTES,
        contentTypeRe: /json|text\//i,
        headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)", accept: "application/json" },
      });
      if (!r.ok) throw new Error("upstream_error");
      return new Response(JSON.stringify(summariseSWICScan(r.text())), {
        headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": CACHE },
      });
    } catch (_e) {
      return new Response(JSON.stringify({ error: "upstream unreachable" }), {
        status: 502, headers: { ...CORS, "content-type": "application/json" },
      });
    }
  }
  /* `?swic=070,107,…` — the warnings those WMO members have in force, one summary each */
  const swic = (q.get("swic") || "").trim();
  if (swic) {
    const mids = [...new Set(
      swic.split(",").map((x) => x.trim()).filter((x) => /^[0-9A-Za-z]{2,4}$/.test(x)),
    )].slice(0, SWIC_MAX_MEMBERS);
    if (!mids.length) {
      return new Response(JSON.stringify({ error: "no member named" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });
    }
    /* ⚠ ONE AT A TIME. Six members in parallel is up to six × SWIC_MAX_BYTES held in one isolate,
       which is how a relay walks into its memory ceiling and takes every concurrent caller with it
       (the reason _shared/relay-guard exists). Measured, each member answers in 0.2–1.3 s. */
    const out = {};
    for (const m of mids) {
      try {
        const r = await fetchGuarded(swicUrl(m), {
          timeoutMs: SWIC_TIMEOUT_MS,
          maxBytes: SWIC_MAX_BYTES,
          contentTypeRe: /json|text\//i,
          headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)", accept: "application/json" },
        });
        if (!r.ok) { out[m] = { error: "upstream_error" }; continue; }
        out[m] = summariseSWIC(r.text(), m);
      } catch (_e) { out[m] = { error: "unreachable" }; }
    }
    return new Response(JSON.stringify({ members: out }), {
      headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": CACHE },
    });
  }
  /* `?swicgeo=006,011,…` — the SHAPE LIBRARY for those members (see summariseSWICGeo) */
  const swicgeo = (q.get("swicgeo") || "").trim();
  if (swicgeo) {
    const mids = [...new Set(
      swicgeo.split(",").map((x) => x.trim()).filter((x) => /^[0-9A-Za-z]{2,4}$/.test(x)),
    )].slice(0, SWIC_GEO_MAX_MEMBERS);
    if (!mids.length) {
      return new Response(JSON.stringify({ error: "no member named" }), { status: 400, headers: { ...CORS, "content-type": "application/json" } });
    }
    const out = {};
    for (const m of mids) {
      try {
        const r = await fetchGuarded(swicGeoUrl(m), {
          timeoutMs: SWIC_TIMEOUT_MS,
          maxBytes: SWIC_MAX_BYTES,
          contentTypeRe: /json|text\//i,
          headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)", accept: "application/json" },
        });
        if (!r.ok) { out[m] = { error: "upstream_error" }; continue; }
        out[m] = summariseSWICGeo(r.text(), m);
      } catch (_e) { out[m] = { error: "unreachable" }; }
    }
    /* a district boundary is not this minute's weather — an hour of edge cache, not sixty seconds */
    return new Response(JSON.stringify({ members: out }), {
      headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
    });
  }
  /* ══ ⚠⚠⚠ `?cngeo=100000_full_city` — THE CHINESE DIVISION BOUNDARIES ════════════════
     DataV.GeoAtlas is CORS-open, and the browser still cannot read it FROM THE DEPLOYED ORIGIN.
     MEASURED, same second, same url: `Referer: http://127.0.0.1:4277/` → **200, 569 KB**;
     `Referer: https://rwmqx7dwb5-arch.github.io/IntMap/` → **403**. A hotlink guard, and one a
     localhost preview cannot see — which is exactly why this shipped drawing China locally and
     nothing at all in production. A relay has no Referer, so it reads what the page cannot.
     ⚠ A boundary set is not this minute's weather: a DAY of edge cache, not sixty seconds. */
  const cngeo = (q.get("cngeo") || "").trim();
  if (cngeo) {
    if (!/^[0-9]{6}(_full(_city)?)?$/.test(cngeo)) {
      return new Response(JSON.stringify({ error: "not an allowed feed" }), {
        status: 400, headers: { ...CORS, "content-type": "application/json" } });
    }
    try {
      const r = await fetchGuarded("https://geo.datav.aliyun.com/areas_v3/bound/" + cngeo + ".json", {
        timeoutMs: U_TIMEOUT_MS,
        maxBytes: 12 * 1024 * 1024,
        contentTypeRe: /json|text\//i,
        headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)", accept: "application/json" },
      });
      if (!r.ok) throw new Error("upstream_error");
      const body = r.text();
      try { JSON.parse(body); } catch (_) { throw new Error("upstream_not_json"); }
      return new Response(body, {
        headers: { ...CORS, "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800" },
      });
    } catch (_e) {
      return new Response(JSON.stringify({ error: "upstream unreachable" }), {
        status: 502, headers: { ...CORS, "content-type": "application/json" } });
    }
  }
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
  /* (#R273) `?cap=tw` -- any national service that publishes a CAP index (see CAPSRC) */
  const capKey = String(q.get("cap") || "").trim().toLowerCase();
  if (capKey) {
    if (!Object.prototype.hasOwnProperty.call(CAPSRC, capKey)) {
      return new Response(JSON.stringify({ error: "not an allowed feed" }), {
        status: 400, headers: { ...CORS, "content-type": "application/json" } });
    }
    try {
      const body = await summariseCAP(capKey);
      return new Response(JSON.stringify(body), {
        headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": CACHE },
      });
    } catch (_e) {
      return new Response(JSON.stringify({ error: "upstream unreachable" }), {
        status: 502, headers: { ...CORS, "content-type": "application/json" } });
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
    /* ⚠⚠ (#R277) A NON-2xx WAS NOT RETRIED, ONLY A THROWN ONE. `fetchGuarded` RESOLVES with
       `ok:false` for an upstream 5xx, so `r` was truthy, the loop ended, and the error page fell
       through to the JSON check and out as 502. MEASURED on the built page: 「cma 502」 in the
       console with the SAME url answering 200 from a shell one second later, i.e. China vanished
       from the map on an upstream hiccup. A failed status is a failed attempt. */
    let r = null;
    for (let i = 0; i < 2 && !(r && r.ok); i++) {
      try {
        r = await fetchGuarded(ok.toString(), {
          timeoutMs: U_TIMEOUT_MS,
          maxBytes: U_MAX_BYTES,
          contentTypeRe: /json|text\//i,
          headers: { "user-agent": "IntMap/1.0 (+https://rwmqx7dwb5-arch.github.io/IntMap/)", accept: "application/json" },
        });
      } catch (_e) { r = null; if (i) throw _e; }
    }
    if (!r) throw new Error("upstream_error");
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
