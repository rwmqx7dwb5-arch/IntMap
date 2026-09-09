#!/usr/bin/env node
// ============================================================================
//  IntMap · scripts/probe-radiation-sources.mjs — what the radiation upstreams actually return (#R574)
// ----------------------------------------------------------------------------
//  supabase/functions/_shared/radiation-sources.js states, in comments, a lot of MEASUREMENTS: how
//  many stations each network has, in what unit, how large the body is, whether it needs a proxy,
//  how far back the history goes. Those numbers rot silently. This is the tool that re-takes them.
//
//  It is deliberately NOT part of `npm test`: every mode here talks to six governments' servers, and
//  a test suite that does that is a test suite that fails when somebody else's certificate expires.
//  tests/r574-radiation-sources.test.mjs runs the same parsers against captured fixtures instead.
//
//    node scripts/probe-radiation-sources.mjs --latest     every provider's latest(), end to end
//    node scripts/probe-radiation-sources.mjs --epa        re-derive the RadNet station list, diff it
//    node scripts/probe-radiation-sources.mjs --geocode    re-resolve the HKO/RadNet coordinates
//    node scripts/probe-radiation-sources.mjs --fixtures <dir>   capture parser fixtures
// ============================================================================

import { gzipSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY = join(HERE, "..", "supabase", "functions", "_shared", "radiation-sources.js");

const { PROVIDERS, providerById, mergeLatest } = await import("file://" + REGISTRY.replace(/\\/g, "/"));

const UA = "IntMap/radiation-feed probe (+https://github.com/rwmqx7dwb5-arch/IntMap)";
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);

async function get(url) {
  const t0 = Date.now();
  const r = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow" });
  const body = await r.text();
  return { status: r.status, ok: r.ok, body, bytes: Buffer.byteLength(body), ms: Date.now() - t0,
    acao: r.headers.get("access-control-allow-origin"), ct: r.headers.get("content-type") };
}

async function fetchMany(urls, concurrency) {
  const out = new Array(urls.length).fill(null);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= urls.length) return;
      try { out[i] = await get(urls[i]); } catch (e) { out[i] = { status: 0, ok: false, body: null, bytes: 0, err: e.message }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return out;
}

/* ── --latest ────────────────────────────────────────────────────────────────────────────────────
   Runs each provider's declared latest() against the live upstream and reports, per provider, what
   the header comments in the registry claim: request count, bytes, wall time, records, value range.
   For the one provider whose sweep does not fit the endpoint budget it probes chunk 0 only. */
async function probeLatest() {
  const now = Date.now();
  const results = [];
  let upstreamBytes = 0;
  for (const p of PROVIDERS) {
    const chunked = p.latest.requests > 12;
    const query = chunked ? { now, chunk: 0, chunked: true } : { now };
    const urls = p.latest.urls(query);
    const t0 = Date.now();
    const answers = await fetchMany(urls, 4);
    const bodies = answers.map((a) => (a && a.ok ? a.body : null));
    const bytes = answers.reduce((n, a) => n + (a ? a.bytes : 0), 0);
    upstreamBytes += bytes;
    let records = [];
    let err = null;
    try { records = p.latest.parse(bodies, query); } catch (e) { err = e.message; }
    const vals = records.map((r) => r.nsvh).filter((v) => typeof v === "number");
    const noPos = records.filter((r) => r.lat == null).length;
    console.log(
      [
        p.id.padEnd(8),
        (chunked ? "chunk0 " : "") + urls.length + " req",
        (bytes / 1024).toFixed(0) + " kB",
        (Date.now() - t0) + " ms",
        records.length + " rec",
        vals.length ? Math.min(...vals).toFixed(1) + "–" + Math.max(...vals).toFixed(1) + " nSv/h" : "no values",
        noPos ? noPos + " without position" : "",
        "acao=" + (answers[0] ? answers[0].acao : "?"),
        err ? "PARSE ERROR: " + err : "",
      ].filter(Boolean).join("  ")
    );
    results.push({ provider: p, read: bodies.some((b) => b != null) && !err, records, reason: chunked ? "chunk0" : null });
  }

  const merged = mergeLatest(results);
  const payload = JSON.stringify({
    v: 1, at: new Date(now).toISOString(), unit: "nSv/h",
    sources: merged.sources, stations: merged.stations, reference: merged.reference,
  });
  const raw = Buffer.byteLength(payload);
  const gz = gzipSync(Buffer.from(payload)).length;
  console.log("");
  console.log("upstream total   " + (upstreamBytes / 1048576).toFixed(2) + " MB");
  console.log("stations         " + merged.stations.length + " current, " + merged.reference.length + " reference");
  console.log("response raw     " + raw + " B (" + (raw / 1024).toFixed(0) + " kB)");
  console.log("response gzip    " + gz + " B (" + (gz / 1024).toFixed(0) + " kB, " + (raw / gz).toFixed(1) + "×)");
}

/* ── --epa ───────────────────────────────────────────────────────────────────────────────────────
   EPA's download page is the canonical register of RadNet station files. This re-derives the list
   and diffs it against EPA_STATIONS in the registry, which is how a station that EPA added, removed
   or renamed stops being invisible. */
const EPA_PAGE = "https://www.epa.gov/radnet/radnet-csv-file-downloads";

async function probeEpa() {
  const page = (await get(EPA_PAGE)).body;
  const live = new Map();
  const re = /href="https:\/\/radnet\.epa\.gov\/cdx-radnet-rest\/api\/rest\/csv\/(\d{4})\/fixed\/([^"]+)"/g;
  for (let m = re.exec(page); m; m = re.exec(page)) {
    const path = decodeURIComponent(m[2]);
    if (!live.has(path)) live.set(path, m[1]);
  }
  const src = readFileSync(REGISTRY, "utf8");
  const block = /const EPA_STATIONS = \[([\s\S]*?)\n\];/.exec(src);
  const known = new Map();
  const rowRe = /\["([^"]+)",\s*([-\d.]+),\s*([-\d.]+),\s*"(\d{4})"\]/g;
  for (let m = rowRe.exec(block[1]); m; m = rowRe.exec(block[1])) known.set(m[1], m[4]);

  console.log("EPA page: " + live.size + " station files.  registry: " + known.size + ".");
  let drift = 0;
  for (const [path, year] of live) {
    if (!known.has(path)) { console.log("  ADDED    " + path + " (" + year + ")"); drift++; }
    else if (known.get(path) !== year) { console.log("  YEAR     " + path + " " + known.get(path) + " -> " + year); drift++; }
  }
  for (const path of known.keys()) if (!live.has(path)) { console.log("  REMOVED  " + path); drift++; }
  console.log(drift ? drift + " differences — update EPA_STATIONS." : "no drift.");
}

/* ── --geocode ───────────────────────────────────────────────────────────────────────────────────
   Neither HKO nor RadNet publishes station coordinates, so the registry carries a resolved table.
   This is how that table was made — and, crucially, it PRINTS the display_name it accepted, because
   a geocoder answers a name it does not know with a different place rather than with nothing
   (#R515). Every line printed here was read before it went into the registry. */
async function probeGeocode() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nominatim = async (q) => {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&q=" +
      encodeURIComponent(q), { headers: { "user-agent": UA, accept: "application/json" } });
    const t = await r.text();
    await sleep(1300);
    try { return JSON.parse(t); } catch { return []; }
  };
  const hk = providerById("hk-hko");
  const bulletin = (await get(hk.latest.urls({ now: Date.now() })[0])).body;
  const names = hk.latest.parse([bulletin]).map((r) => r.name);
  console.log("# HKO — " + names.length + " stations discovered in the bulletin");
  for (const n of names) {
    const j = await nominatim(n + ", Hong Kong");
    const b = j[0];
    console.log("  " + JSON.stringify(n) + ": [" + (b ? (+b.lat).toFixed(4) + ", " + (+b.lon).toFixed(4) : "null, null") +
      "],  // " + (b ? b.type + " :: " + b.display_name : "NO RESULT — verify by hand"));
  }
  console.log("# RadNet — the station's city, resolved with its state");
  const page = (await get(EPA_PAGE)).body;
  const re = /href="https:\/\/radnet\.epa\.gov\/cdx-radnet-rest\/api\/rest\/csv\/(\d{4})\/fixed\/([^"]+)"/g;
  const seen = new Set();
  for (let m = re.exec(page); m; m = re.exec(page)) {
    const path = decodeURIComponent(m[2]);
    if (seen.has(path)) continue;
    seen.add(path);
    const [st, city] = path.split("/");
    const j = await nominatim(city.toUpperCase() + ", " + st.toUpperCase() + ", United States");
    const b = j[0];
    console.log("  [" + JSON.stringify(path) + ", " + (b ? (+b.lat).toFixed(4) + ", " + (+b.lon).toFixed(4) : "null, null") +
      ', "' + m[1] + '"],  // ' + (b ? b.display_name : "NO RESULT — verify by hand"));
  }
}

/* ── --fixtures <dir> ────────────────────────────────────────────────────────────────────────────
   Captures ONE real upstream answer per provider, truncated to the first few features, so the tests
   run the shipped parsers over bytes a real server actually sent. ⚠ The truncation keeps the
   upstream's own envelope; it never rewrites a field into something more convenient, because a
   fixture that is tidier than the upstream tests a parser that does not have to exist (#R552). */
async function probeFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  for (const p of PROVIDERS) {
    const query = p.latest.requests > 12 ? { now: Date.now(), chunk: 0, chunked: true } : { now: Date.now() };
    const url = p.latest.urls(query)[0];
    const a = await get(url);
    writeFileSync(join(dir, p.id + ".txt"), a.body);
    console.log(p.id + "  " + a.status + "  " + a.bytes + " B  -> " + join(dir, p.id + ".txt"));
  }
}

if (has("--epa")) await probeEpa();
else if (has("--geocode")) await probeGeocode();
else if (has("--fixtures")) await probeFixtures(argv[argv.indexOf("--fixtures") + 1] || "fixtures");
else await probeLatest();
