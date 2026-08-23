// ============================================================================
//  IntMap · _shared/volcano-parse.js — the two volcano feeds, turned into rows  (#R353)
// ----------------------------------------------------------------------------
//  The parsing half of supabase/functions/volcano-feed. It lives here, beside the function that uses
//  it, for one reason: a regex scraper of somebody else's feed is exactly the kind of code that is
//  believed rather than tested, and a module that only exists inside `Deno.serve` cannot be run by
//  `node --test`. tests/r353-checks.test.mjs imports THIS file and runs it over captured answers
//  from both upstreams (tests/fixtures/volcano-weekly.xml, tests/fixtures/volcano-isigmet.json), so
//  "the join key is read out of <guid>" and "an ash area keeps its flight levels" are assertions
//  rather than comments.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE — scripts/static-checks.mjs runs `node --check` over every
//  committed .ts/.js. Same rule as _shared/relay-guard.js.
//
//  ⚠ NOTHING HERE INVENTS A VALUE IT DID NOT READ. Every field is optional on the way in and null on
//  the way out; the one field that is REQUIRED is the GVP volcano number, because a weekly report
//  that cannot be joined to a volcano is not something this map can place.
// ============================================================================

export function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, "&");
}

export function stripTags(s) {
  return decodeEntities(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function tag(block, name) {
  const m = new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">").exec(block);
  return m ? m[1] : "";
}

/* ── Smithsonian / USGS Weekly Volcanic Activity Report (RSS) ────────────────────────────────
   One <item> per volcano reported this week. The title is machine-written in one shape —
   «Asosan (Japan) - Report for 13 August-19 August 2026 - New Unrest» — and the <guid> carries the
   GVP volcano number as a fragment, which is the only field this parser refuses to do without. */
export function parseWeekly(xml) {
  const rows = [];
  const items = String(xml || "").match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const it of items) {
    const vn = /#vn_(\d+)/.exec(tag(it, "guid"));
    if (!vn) continue;
    const title = stripTags(tag(it, "title"));
    const parts = title.split(" - ");
    const head = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(parts[0] || "");
    const period = (parts.find((p) => /^Report for /i.test(p)) || "").replace(/^Report for\s*/i, "");
    /* GVP's own status phrase — "New Unrest", "Ongoing Activity", "Ongoing Unrest". A STATEMENT BY
       THE SOURCE; this file does not rank it, and the page prints it as the source wrote it. */
    const status = (parts.length > 2 ? parts[parts.length - 1] : "").trim();
    const pt = /<georss:point>\s*(-?[\d.]+)\s+(-?[\d.]+)\s*<\/georss:point>/.exec(it);
    rows.push({
      v: +vn[1],
      name: head ? head[1].trim() : (parts[0] || "").trim(),
      country: head ? head[2].trim() : "",
      period,
      status,
      text: stripTags(tag(it, "description")),
      lat: pt ? +pt[1] : null,
      lng: pt ? +pt[2] : null,
      at: stripTags(tag(it, "pubDate")) || null,
    });
  }
  return rows;
}

/* ── international SIGMETs → the volcanic-ash ones ───────────────────────────────────────────
   `read` is the number of SIGMETs the feed contained, and it travels with the answer on purpose:
   without it, "no ash anywhere on Earth right now" (the usual case) and "the feed did not answer"
   are the same empty array, and the map would draw the same nothing for both. */
export function parseAsh(json) {
  const all = typeof json === "string" ? JSON.parse(json) : json;
  if (!Array.isArray(all)) throw new Error("shape");
  const areas = [];
  for (const s of all) {
    if (!s || s.hazard !== "VA" || !Array.isArray(s.coords) || s.coords.length < 3) continue;
    areas.push({
      fir: s.firName || s.firId || "",
      icao: s.icaoId || "",
      series: s.seriesId || "",
      volcano: s.qualifier || "",
      from: s.validTimeFrom || null,
      to: s.validTimeTo || null,
      base: s.base == null ? null : +s.base,     /* feet above sea level; 0 = SFC */
      top: s.top == null ? null : +s.top,        /* feet above sea level */
      dir: s.dir || null,
      spd: s.spd == null ? null : String(s.spd),
      chng: s.chng || null,
      raw: String(s.rawSigmet || "").slice(0, 1200),
      coords: s.coords.map((c) => [+c.lon, +c.lat]),
    });
  }
  return { read: all.length, areas };
}
