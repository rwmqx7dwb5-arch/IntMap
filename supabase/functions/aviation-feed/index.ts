// ============================================================================
//  IntMap · aviation-feed  —  the ONE upstream reader for live air traffic  (#R341)
// ----------------------------------------------------------------------------
//  WHY THIS EXISTS
//  ---------------
//  Until this round every browser rebuilt the world by itself. js/data-layers.js issued up to 128
//  separate `api.airplanes.live/v2/point/…` requests, one every 1.2 s, per user, per sweep — about
//  154 seconds of issuing to cover one continent, repeated in every open tab. That is a structure
//  in which upstream load is proportional to the number of IntMap users, which is the thing a
//  public community feed cannot absorb and the reason the layer is now answered with:
//
//      HTTP 403  {"error": "Please contact us at contact@airplanes.live…"}   (every request, #R341)
//
//  The layer has been dead in production, falling through to genSyntheticPlanes() — invented
//  aircraft — for as long as that has been true. This function is the replacement structure:
//
//      IntMap users  ──►  aviation-feed  ──►  ONE upstream read per TTL  ──►  provider
//
//  Upstream reads scale with TIME, not with users. That is the whole point; everything else here
//  is bookkeeping in service of it.
//
//  WHAT IT IS NOT
//  --------------
//  It is not a stream collector. Deno Edge Functions are request-scoped, so a persistent Firehose
//  socket does not belong here (CLAUDE.md §5.2) — the providers wired below are REST, polled, and
//  need no persistent connection. If IntMap ever contracts a streaming provider, that collector is
//  an always-on container and this function becomes its edge cache, not its host.
//
//  PROVIDERS — chosen in docs/AVIATION-DATA-SOURCES.md, summarised here
//  -------------------------------------------------------------------
//   · adsblol      DEFAULT. ODbL 1.0, open, no key, no agreement needed, working. No global
//                  all-aircraft endpoint — position queries are documented "up to 250 nm" — and a
//                  measured burst budget of ~4 requests (see the bounds below) that puts a 980-tile
//                  global sweep out of reach. It is therefore an excellent VIEWPORT provider and
//                  not a world one, and this function says which it is rather than implying the
//                  gap is empty sky.
//   · opensky      A TRUE global snapshot in one request (/states/all). Gated behind
//                  OPENSKY_AGREEMENT=1 because OpenSky's terms require a prior WRITTEN agreement
//                  for operational use — integrating it into a live product without one is a
//                  licence violation, not a rate-limit question.
//   · airplaneslive The previous source. Left wired so it can be re-enabled the day IntMap has the
//                  contact they now ask for, and disabled by default because it answers 403.
//
//  NORMALISATION AND THE WIRE FORMAT ARE NOT IN THIS FILE. They are in _shared/aviation-model.js
//  and _shared/aviation-codec.js — byte-identical mirrors of js/aviation-model.js and
//  js/aviation-codec.js, kept in step by scripts/sync-aviation.mjs and CI-enforced. The server
//  normalises and the browser interprets; if the two ever disagreed about what `military` means,
//  the filter would disagree with the colour.
//
//  ⚠ NO TYPE ANNOTATIONS IN THIS FILE. scripts/static-checks.mjs runs `node --check` over every
//  committed .ts/.js, so the Edge Functions are plain JavaScript that happens to live in a .ts
//  file — the same rule the header of alerts-relay states.
// ============================================================================

import { corsFor, fetchGuarded, relayFail, methodGate } from "../_shared/relay-guard.js";
// Both imported for their side effect: they set globalThis.IntMapAviationCodec / …Model.
import "../_shared/aviation-codec.js";
import "../_shared/aviation-model.js";

const CODEC = globalThis.IntMapAviationCodec;
const MODEL = globalThis.IntMapAviationModel;

/* ⚠ A CUSTOM RESPONSE HEADER IS INVISIBLE TO JAVASCRIPT UNLESS IT IS EXPOSED. Cross-origin,
   `fetch().headers.get("x-intmap-provider")` returns null for every header outside the CORS-safelist
   — no error, no warning, just null. Measured (#R341): the browser had 176 aircraft on screen and
   reported provider "", attribution "" and coverage "", so the layer could not name its source at
   all. The default provider's data is ODbL 1.0, which REQUIRES naming it, so this line is a licence
   obligation and not a nicety.
   Declared here rather than in the shared builder in _shared/relay-guard.js: the other four relays
   do not send these headers, and widening their CORS for a header they never set would be a
   change to four endpoints for the benefit of none.
   ⚠ The name of that builder is deliberately NOT written with parentheses above:
   tests/helpers/fn-cors.js finds each function's contract with a regex that does not strip
   comments, so a mention in prose reads as a second call and the contract becomes
   "ambiguous" (measured, #R341). */
const CORS = {
  ...corsFor("x-intmap-channel"),
  "Access-Control-Expose-Headers":
    "x-intmap-provider, x-intmap-attribution, x-intmap-count, x-intmap-age-ms, " +
    "x-intmap-seq, x-intmap-channel, x-intmap-coverage, x-intmap-save",
};

// ── bounds ──────────────────────────────────────────────────────────────────
const UPSTREAM_TIMEOUT_MS = 12000;
const UPSTREAM_MAX_BYTES = 24 * 1024 * 1024;   // OpenSky's global snapshot measured 0.9 MB; a
                                               // provider that suddenly sends 24 MB is a fault.
// ⚠ THESE NUMBERS ARE MEASURED, NOT CHOSEN (#R341). Probing api.adsb.lol from one address:
//
//      gap 2000 ms → 4 of 10 OK, 6 × HTTP 429
//      gap 1500 ms → 4 of 10 OK, 6 × HTTP 429
//      gap 1000 ms → 4 of 10 OK, 6 × HTTP 429
//
//  The success count does not move with the gap, so this is a small BURST BUDGET (~4 requests)
//  that refills slowly — not a requests-per-second ceiling that a longer sleep would satisfy. A
//  single request after a 45 s pause succeeds every time. Two consequences, both structural:
//
//   1. A tile read must be SERIAL with a real gap. Concurrency spends the whole budget at once.
//   2. The 980-tile world lattice is NOT reachable through this provider. At the measured refill
//      a full rotation is hours, so `world` on adsb.lol is built from the union of tiles that
//      viewport reads have already paid for — genuine data, honestly aged, and NOT a claim of
//      global coverage. `coveragePct` in the meta channel is what says so out loud.
//
//  A provider that answers the whole planet in one request (OpenSky /states/all — measured 6,838
//  aircraft, 900 kB, 2.7 s) turns `world` back into one upstream read. That is why the OpenSky
//  adapter exists and why AVIATION_PROVIDER is configuration rather than a code change.
const VIEW_TTL_MS = 15000;                     // viewport channel: what the user is actually watching
const WORLD_TTL_MS = 30000;                    // world channel: one small slice per refresh
const VIEW_MAX_TILES = 4;                      // = the measured burst budget
const WORLD_SLICE_TILES = 3;                   // lattice tiles advanced per world refresh (adsb.lol)
const TILE_GAP_MS = 1200;                      // serial spacing between tile reads
const AC_MAX = 200000;                         // hard ceiling on what this function will ever hold
const STALE_DROP_S = 900;                      // an aircraft unseen for 15 min leaves the world set
const VIEW_CACHE_MAX = 256;
const VIEW_STALE_S = 45;                       // a box whose best observation is older is re-read
const RATE_BACKOFF_MS = 60000;                 // how long the whole function stays quiet after a 429

const RADIUS_NM = 250;                         // the DOCUMENTED maximum for adsb.lol point queries.
                                               // Larger radii do answer, and using them would be
                                               // relying on undocumented behaviour of someone
                                               // else's free service. We do not.
const LAT_LIMIT = 75;

// ── provider selection ──────────────────────────────────────────────────────
function env(k) { try { return Deno.env.get(k) || ""; } catch (_) { return ""; } }

// OpenSky's General Terms require a prior written agreement for ANY operational use — including
// integration into a live product — even for non-profit use. This flag is the operator asserting
// that the agreement exists. It is deliberately separate from the credentials: holding a client id
// is not the same as holding permission to run a service on it.
function openskyAllowed() {
  return env("OPENSKY_AGREEMENT") === "1" && !!env("OPENSKY_CLIENT_ID") && !!env("OPENSKY_CLIENT_SECRET");
}

function providerName() {
  const want = (env("AVIATION_PROVIDER") || "adsblol").toLowerCase();
  if (want === "opensky") return openskyAllowed() ? "opensky" : "adsblol";
  if (want === "airplaneslive") return env("AIRPLANESLIVE_ENABLED") === "1" ? "airplaneslive" : "adsblol";
  return "adsblol";
}

const ATTRIBUTION = {
  adsblol: "adsb.lol — ODbL 1.0",
  opensky: "The OpenSky Network — opensky-network.org",
  airplaneslive: "airplanes.live",
};

const TILE_BASE = {
  adsblol: "https://api.adsb.lol/v2/point/",
  airplaneslive: "https://api.airplanes.live/v2/point/",
};

// ── state that survives between requests in one isolate ─────────────────────
//  Supabase gives no guarantee about how many isolates are warm or how long one lives. That is
//  precisely why this is the ONLY state: everything here is a cache that a cold isolate rebuilds by
//  asking upstream, never a source of truth. The honest bound this buys is
//
//      upstream reads  ≈  (warm isolates) × (1 / TTL)      instead of      (users) × 128 / sweep
//
//  and it needs no migration, no bucket and no cron. docs/AVIATION-ARCHITECTURE.md records what a
//  stronger bound (a Storage object refreshed by pg_cron) would take, for the day traffic justifies
//  it — and why that is a change of degree, not of structure.
const STATE = {
  lattice: null,
  cursor: 0,
  world: new Map(),        // hex → normalised AircraftState
  worldSeq: 0,
  worldAt: 0,
  worldBuilt: null,        // encoded Uint8Array
  views: new Map(),        // bboxKey → { at, bytes, count, seq }
  inflight: new Map(),     // key → Promise, so N concurrent callers make ONE upstream read
  identitySent: new Set(), // hexes whose identity line has already gone out from this isolate
  backoffUntil: 0,         // set on a 429; nothing asks upstream again until this passes
  hydrated: false,         // has this isolate loaded the shared snapshot yet?
  saveNote: "",            // outcome CODE of the last snapshot write (never a body, never a key)
  stats: { upstream: 0, upstreamFail: 0, served: 0, sweeps: 0, merged: 0, rateLimited: 0, hydrated: 0, saved: 0 },
};

// -- the shared snapshot, outside the isolate --------------------------------
//  MEASURED, not assumed (#R341): three identical viewport requests against the deployed function,
//  15 s TTL, all three answered with x-intmap-age-ms of 1-2 ms and took 5.6-6.4 s each. Supabase
//  hands a request a cold isolate often enough that isolate memory is NOT a cache, so upstream
//  reads were proportional to requests — the very structure this function exists to remove, moved
//  from the browser to the server rather than eliminated.
//
//  The snapshot therefore lives in Supabase Storage (migration 20260823130000). Three consequences:
//    · a cold isolate HYDRATES from it and can answer immediately with real aircraft;
//    · the refresh happens AFTER the response, so a caller never waits for upstream;
//    · the object is public, so a browser can read it straight from the CDN and never invoke this
//      function at all — the cheapest fan-out there is.
const BUCKET = "aviation";
const WORLD_OBJECT = "world.bin";
const SNAP_MAX_BYTES = 32 * 1024 * 1024;

function svcUrl(path) {
  const base = (env("SUPABASE_URL") || "").replace(/\/$/, "");
  return base ? base + path : "";
}

async function loadSnapshot() {
  const u = svcUrl("/storage/v1/object/public/" + BUCKET + "/" + WORLD_OBJECT);
  if (!u) return null;
  try {
    const r = await fetch(u + "?t=" + Date.now(), { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (!buf.length || buf.length > SNAP_MAX_BYTES) return null;
    return CODEC.decode(buf);
  } catch (_) { return null; }
}

/*  The bucket is declared by migration 20260823130000, which is the record of intent. This is the
 *  BOOTSTRAP: applying a migration to production needs the database password (docs/MIGRATIONS.md
 *  explains why `db push` is not usable here), and the function already holds the service role key,
 *  so it can make the bucket exist on first use instead of the layer staying dark until a human is
 *  free. Idempotent, and tried once per isolate — a 409 "already exists" is success. */
let BUCKET_TRIED = false;
async function ensureBucket() {
  if (BUCKET_TRIED) return;
  BUCKET_TRIED = true;
  const key = storageKey();
  const u = svcUrl("/storage/v1/bucket");
  if (!key || !u) return;
  try {
    await fetch(u, {
      method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({
        id: BUCKET, name: BUCKET, public: true,
        file_size_limit: SNAP_MAX_BYTES,
        allowed_mime_types: ["application/octet-stream"],
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (_) { /* the upload below reports the real outcome */ }
}

/*  Supabase has injected this under more than one name over time (SUPABASE_SERVICE_ROLE_KEY, and
 *  SB_SECRET_KEY on newer key formats), and a project may also set its own. Trying the names in
 *  order costs nothing and means the snapshot does not silently stop persisting the day the
 *  platform renames the variable — which is a failure that looks exactly like "the layer is slow". */
function storageKey() {
  return env("AVIATION_STORAGE_KEY") || env("SUPABASE_SERVICE_ROLE_KEY") || env("SB_SECRET_KEY");
}

async function saveSnapshot(bytes) {
  const key = storageKey();
  const u = svcUrl("/storage/v1/object/" + BUCKET + "/" + WORLD_OBJECT);
  if (!key || !u || !bytes) return false;
  const put = () => fetch(u, {
    method: "POST",
    headers: {
      authorization: "Bearer " + key,
      "content-type": "application/octet-stream",
      "cache-control": "max-age=5",
      "x-upsert": "true",
    },
    body: bytes,
    signal: AbortSignal.timeout(10000),
  });
  try {
    let r = await put();
    if (r.ok) { STATE.saveNote = "ok"; return true; }
    /* 404 = no such bucket. Make it, once, and try again. */
    if (r.status === 404) { await ensureBucket(); r = await put(); }
    if (!r.ok) {
      STATE.stats.saveFail = (STATE.stats.saveFail || 0) + 1;
      /* The status, plus Storage's own `code` enum and nothing else. The message field can echo a
         path; the code is a fixed identifier (NoSuchBucket / KeyAlreadyExists / InvalidJWT …) and
         is the one thing that distinguishes "wrong credential" from "wrong request" without
         leaking either. */
      let code = "";
      try { const j = JSON.parse(await r.text()); code = String(j && j.code || "").slice(0, 40); } catch (_) { code = ""; }
      STATE.saveNote = "http" + r.status + (code ? ":" + code : "");
    } else STATE.saveNote = "ok-retry";
    return r.ok;
  } catch (e) { STATE.saveNote = "throw:" + ((e && e.name) || "err"); return false; }
}

//  Turn a decoded snapshot back into the record shape the world Map holds. The wire is lossy about
//  identity on purpose (it is sent once per aircraft, not per refresh), so an aircraft whose
//  identity line was in an earlier message hydrates with empty strings — which is correct: empty
//  means "not known here", and the next viewport read that sees it fills it in.
function hydrate(msg) {
  if (!msg || !msg.count) return 0;
  const nowMs = Date.now();
  const ident = new Map();
  for (const it of msg.identity) ident.set(it.hex, it);
  let n = 0;
  for (let i = 0; i < msg.count; i++) {
    const f = msg.flags[i];
    if (!(f & CODEC.AC_POS_VALID)) continue;
    const hex = CODEC.numToHex(msg.icao[i]);
    const seenAt = nowMs - msg.age[i] * 1000;
    if ((nowMs - seenAt) / 1000 > STALE_DROP_S) continue;
    const id = ident.get(hex) || {};
    const prev = STATE.world.get(hex);
    if (prev && prev.seenAt >= seenAt) continue;
    STATE.world.set(hex, {
      hex,
      lon: msg.lon[i], lat: msg.lat[i],
      altFt: (f & CODEC.AC_ALT_VALID) ? msg.alt[i] : null,
      geometric: !!(f & CODEC.AC_ALT_GEOM),
      track: msg.track[i], gsKt: msg.gs[i], vrFpm: msg.vr[i],
      onGround: !!(f & CODEC.AC_ON_GROUND),
      military: !!(f & CODEC.AC_MILITARY),
      emergency: !!(f & CODEC.AC_EMERGENCY),
      spi: !!(f & CODEC.AC_SPI),
      squawk: null, category: msg.cat[i],
      callsign: id.callsign || "", type: id.type || "",
      registration: id.registration || "", operator: id.operator || "",
      seenAt, source: "snapshot",
    });
    n++;
  }
  STATE.worldSeq = Math.max(STATE.worldSeq, msg.seq || 0);
  STATE.worldAt = msg.serverTimeMs || nowMs;
  STATE.hydrated = true;
  return n;
}

//  Hydrate at most once per isolate, and never twice concurrently.
function ensureHydrated() {
  if (STATE.hydrated) return Promise.resolve(0);
  return once("hydrate", async () => {
    const msg = await loadSnapshot();
    const n = hydrate(msg);
    STATE.hydrated = true;
    STATE.stats.hydrated = n;
    return n;
  });
}

//  Work that must outlive the response. Supabase exposes EdgeRuntime.waitUntil; where it is absent
//  the promise is simply left running and may be cut short — which is why nothing here is required
//  for correctness, only for freshness.
/*  MEASURED (#R341): a promise handed to EdgeRuntime.waitUntil did NOT survive the response here —
 *  six consecutive world requests answered from the snapshot, and the world stayed at 27 aircraft
 *  and 0/980 tiles the whole time, with no save attempted. So `after()` is OPPORTUNISTIC and
 *  nothing depends on it: what actually keeps the snapshot fresh is
 *    · a viewport request whose box is stale, which reads its tiles synchronously, and
 *    · ?refresh=1, which .github/workflows/aviation-sweep.yml calls on a schedule.
 *  A design that relied on background work would have looked fine in every single-request test and
 *  never advanced in production. */
function after(promise) {
  try {
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime && typeof EdgeRuntime.waitUntil === "function") {
      EdgeRuntime.waitUntil(promise);
      return;
    }
  } catch (_) { /* fall through */ }
  promise.catch(() => { /* a background refresh failing is not the caller's problem */ });
}

function lattice() {
  // Tiles that came back empty are re-probed at a reduced rate — two thirds of the globe is ocean
  // without receiver coverage. `miss` counts consecutive empties; a single hit resets it.
  //
  // ⚠ THE VISITING ORDER IS SCRAMBLED, and that is the point. buildLattice() returns tiles in
  // row-major order, so a sweep that walks it in order spends its first hour inside one band of
  // latitude — and with a budget this small it never leaves. Stepping by a stride co-prime with
  // the length visits the whole globe coarsely first and refines later, so N tiles of budget buy
  // an evenly-spread sample of the planet instead of a stripe of it. The stride is the
  // golden-ratio fraction of the length, nudged up until it is co-prime, which is the standard
  // low-discrepancy choice and is deterministic — the same lattice always sweeps the same way.
  if (!STATE.lattice) {
    const base = MODEL.buildLattice(RADIUS_NM, LAT_LIMIT);
    const n = base.length;
    let stride = Math.max(1, Math.round(n * 0.6180339887));
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    while (stride > 1 && gcd(stride, n) !== 1) stride++;
    const order = [];
    for (let i = 0; i < n; i++) order.push(base[(i * stride) % n]);
    STATE.lattice = order;
  }
  return STATE.lattice;
}

// ── upstream reads ──────────────────────────────────────────────────────────
/* A sentinel, not an empty array: "the provider refused" and "there are no aircraft there" must not
   look the same to the caller — the first must stop the sweep and mark a tile unprobed, the second
   is a real answer that lets the tile be de-prioritised. Conflating them is how an empty ocean and
   a rate-limited request become the same "0 aircraft" (§22.1, §25.2). */
const RATE_LIMITED = Symbol("rate_limited");

/* ⚠ THE USER-AGENT IS LOAD-BEARING. api.adsb.lol answers a generic one with
      "User-Agent too generic; include valid contact info."
   — measured, #R341. It must name the project and carry a way to reach us. */
const UA = "IntMap/aviation-feed (+https://github.com/rwmqx7dwb5-arch/IntMap)";

async function readTile(provider, lat, lon) {
  const base = TILE_BASE[provider] || TILE_BASE.adsblol;
  const url = base + lat.toFixed(3) + "/" + lon.toFixed(3) + "/" + RADIUS_NM;
  STATE.stats.upstream++;
  let r;
  try {
    r = await fetchGuarded(url, {
      timeoutMs: UPSTREAM_TIMEOUT_MS,
      maxBytes: UPSTREAM_MAX_BYTES,
      contentTypeRe: /json/i,
      headers: { "user-agent": UA, accept: "application/json" },
    });
  } catch (_) { STATE.stats.upstreamFail++; return []; }
  if (r.status === 429 || r.status === 403) { STATE.stats.upstreamFail++; return RATE_LIMITED; }
  if (!r.ok) { STATE.stats.upstreamFail++; return []; }
  let j = null;
  try { j = JSON.parse(r.text()); } catch (_) { STATE.stats.upstreamFail++; return []; }
  const ac = (j && Array.isArray(j.ac)) ? j.ac : [];
  const now = Date.now();
  const out = [];
  for (const a of ac) {
    const s = MODEL.normalizeAdsbLol(a, now, provider);
    if (s) out.push(s);
  }
  return out;
}

// OpenSky uses OAuth2 client-credentials (basic auth was retired in March 2026). The token is
// cached for its lifetime minus a minute; fetching one per request would burn the credit budget on
// authentication alone.
let OSK_TOKEN = { value: "", expires: 0 };
async function openskyToken() {
  const now = Date.now();
  if (OSK_TOKEN.value && now < OSK_TOKEN.expires) return OSK_TOKEN.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env("OPENSKY_CLIENT_ID"),
    client_secret: env("OPENSKY_CLIENT_SECRET"),
  });
  const r = await fetch(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    },
  );
  if (!r.ok) throw new Error("opensky_auth");
  const j = await r.json();
  OSK_TOKEN = { value: j.access_token, expires: now + Math.max(30, (j.expires_in || 300) - 60) * 1000 };
  return OSK_TOKEN.value;
}

async function readOpenSkyWorld() {
  STATE.stats.upstream++;
  const token = await openskyToken();
  const r = await fetchGuarded("https://opensky-network.org/api/states/all", {
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    maxBytes: UPSTREAM_MAX_BYTES,
    contentTypeRe: /json/i,
    headers: {
      authorization: "Bearer " + token,
      "user-agent": UA,
      accept: "application/json",
    },
  });
  if (!r.ok) { STATE.stats.upstreamFail++; return []; }
  let j = null;
  try { j = JSON.parse(r.text()); } catch (_) { STATE.stats.upstreamFail++; return []; }
  const states = (j && Array.isArray(j.states)) ? j.states : [];
  const now = Date.now();
  const out = [];
  for (const s of states) {
    const n = MODEL.normalizeOpenSky(s, now);
    if (n) out.push(n);
  }
  return out;
}

// ── single-flight ───────────────────────────────────────────────────────────
//  Ten browsers asking for the same viewport in the same second must produce ONE upstream read.
//  Without this the isolate cache still bounds reads over time but does nothing about a burst,
//  which is exactly the shape a popular link produces.
function once(key, make) {
  const running = STATE.inflight.get(key);
  if (running) return running;
  const p = (async () => { try { return await make(); } finally { STATE.inflight.delete(key); } })();
  STATE.inflight.set(key, p);
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*  Read tiles ONE AT A TIME with a gap. See the measurement note above the bounds: the provider's
 *  budget is a small burst, so issuing four in parallel spends all of it and three come back 429.
 *
 *  A 429 STOPS THE SLICE. Continuing to ask after being told to stop is how an address gets
 *  blocked, and the aircraft we already have are worth more than the ones we would not be given.
 *  `backoffUntil` then keeps the whole function quiet for a while — it is isolate state, so the
 *  worst case is one slice per isolate before everyone backs off. */
async function readSerial(provider, tiles) {
  const out = [];
  for (let i = 0; i < tiles.length; i++) {
    if (Date.now() < STATE.backoffUntil) break;
    const got = await readTile(provider, tiles[i].lat, tiles[i].lon);
    if (got === RATE_LIMITED) {
      STATE.backoffUntil = Date.now() + RATE_BACKOFF_MS;
      STATE.stats.rateLimited++;
      break;
    }
    out.push({ tile: tiles[i], recs: got });
    if (i < tiles.length - 1) await sleep(TILE_GAP_MS);
  }
  return out;
}

// ── the world set ───────────────────────────────────────────────────────────
function mergeIntoWorld(records, nowMs) {
  for (const rec of records) {
    if (!rec || !rec.hex) continue;
    const prev = STATE.world.get(rec.hex);
    // Keep the FRESHER observation. Two tiles overlap by design, and a lattice sweep can hand back
    // the same aircraft twice with different ages; taking the later one is what makes the overlap
    // free instead of a source of jitter.
    if (prev && prev.seenAt > rec.seenAt) continue;
    STATE.world.set(rec.hex, rec);
    STATE.stats.merged++;
  }
  // Age out. An aircraft no sweep has re-seen for STALE_DROP_S is gone — it landed, or it left
  // receiver coverage. Dropping it is honest; keeping it forever would draw a world that is mostly
  // memory.
  for (const [hex, rec] of STATE.world) {
    if ((nowMs - rec.seenAt) / 1000 > STALE_DROP_S) STATE.world.delete(hex);
  }
}

async function refreshWorld() {
  const now = Date.now();
  const provider = providerName();

  if (provider === "opensky") {
    // One request, the whole planet. This is the shape every other part of this file is working
    // around the absence of.
    const recs = await readOpenSkyWorld();
    if (recs.length) {
      STATE.world.clear();
      mergeIntoWorld(recs, now);
    }
    STATE.stats.sweeps++;
  } else {
    const L = lattice();
    const picked = [];
    let scanned = 0;
    while (picked.length < WORLD_SLICE_TILES && scanned < L.length) {
      const t = L[STATE.cursor % L.length];
      STATE.cursor++;
      scanned++;
      if (t.miss > 0 && (STATE.cursor % (1 << Math.min(3, t.miss))) !== 0) continue;
      picked.push(t);
    }
    const results = await readSerial(provider, picked);
    for (const got of results) {
      // Only a tile that actually ANSWERED is marked probed. A tile skipped by the backoff is
      // still unknown sky, and recording it as seen-and-empty would make coveragePct a lie.
      got.tile.last = Date.now();
      got.tile.miss = got.recs.length ? 0 : Math.min(8, got.tile.miss + 1);
      mergeIntoWorld(got.recs, Date.now());
    }
    STATE.stats.sweeps++;
  }

  STATE.worldAt = now;
  STATE.worldSeq++;
  STATE.worldBuilt = encodeSet(Array.from(STATE.world.values()), STATE.worldSeq, now);
  /* ⚠ THE SNAPSHOT IS WRITTEN WITH EVERY IDENTITY IT HAS, not with the once-per-isolate subset the
     wire normally carries. A hydrating isolate has never sent anything, so an incremental identity
     section would leave it with 20,000 aircraft and no callsigns. */
  if (await saveSnapshot(encodeSet(Array.from(STATE.world.values()), STATE.worldSeq, now, true))) STATE.stats.saved++;
  return STATE.worldBuilt;
}

// ── encoding ────────────────────────────────────────────────────────────────
function encodeSet(records, seq, nowMs, fullIdentity) {
  const aircraft = [];
  const identity = [];
  for (const rec of records) {
    if (aircraft.length >= AC_MAX) break;
    const ageSec = Math.max(0, (nowMs - rec.seenAt) / 1000);
    aircraft.push({
      hex: rec.hex,
      lon: rec.lon, lat: rec.lat,
      altFt: rec.altFt, geometric: rec.geometric,
      track: rec.track, gsKt: rec.gsKt, vrFpm: rec.vrFpm,
      ageSec: ageSec,
      onGround: rec.onGround, military: rec.military,
      emergency: rec.emergency, spi: rec.spi,
      stale: MODEL.freshness(ageSec) !== "live",
      category: rec.category,
    });
    // Identity travels once per isolate per aircraft. A callsign changes at most once a flight, so
    // re-sending 50,000 of them every refresh would be most of the wire carrying no new
    // information. A client that missed the line asks for it on selection.
    if ((fullIdentity || !STATE.identitySent.has(rec.hex)) && (rec.callsign || rec.registration || rec.type)) {
      if (!fullIdentity) STATE.identitySent.add(rec.hex);
      identity.push({
        hex: rec.hex, callsign: rec.callsign, type: rec.type,
        registration: rec.registration, operator: rec.operator,
      });
    }
  }
  if (STATE.identitySent.size > AC_MAX) STATE.identitySent.clear();
  return CODEC.encode({ seq: seq, serverTimeMs: nowMs, aircraft: aircraft, identity: identity });
}

function coverageLine(provider) {
  if (provider === "opensky") return "provider-global";
  const L = lattice();
  let probed = 0;
  for (const t of L) if (t.last) probed++;
  return "lattice " + probed + "/" + L.length;
}

/* ⚠ AN HTTP HEADER VALUE IS A ByteString — every character must be <= 255, and Deno throws a
   TypeError building the Response if one is not. ATTRIBUTION.adsblol is "adsb.lol — ODbL 1.0" and
   that em dash is U+2014, so EVERY binary answer threw, the outer catch turned it into
   relayFail(), and the caller was told "upstream_unreachable" — a network error, for a string
   literal in this file. `?meta=1` kept working throughout because it sets no such header, which is
   exactly what made it look like a fetch problem (#R341, measured against the deployed function).
   Sanitising HERE rather than fixing the one string means the next attribution line with a dash,
   an accent or a CJK character cannot bring the endpoint down again. */
function hdr(v) {
  return String(v == null ? "" : v)
    .replace(/[‐-―]/g, "-")     /* the dash family */
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^ -~]/g, "");        /* anything else non-printable-ASCII is dropped */
}

function binResponse(bytes, meta) {
  const h = {
    ...CORS,
    "content-type": "application/octet-stream",
    "cache-control": "public, max-age=" + Math.round(meta.ttlMs / 1000) +
      ", stale-while-revalidate=" + Math.round(meta.ttlMs / 500) +
      ", stale-if-error=120",
    "x-intmap-provider": hdr(meta.provider),
    "x-intmap-attribution": hdr(ATTRIBUTION[meta.provider] || meta.provider),
    "x-intmap-count": String(meta.count | 0),
    /* Infinity is what `now - 0` gives before the first refresh, and String(Infinity) is a header
       value no client can parse as a number. */
    "x-intmap-age-ms": String(isFinite(meta.ageMs) ? Math.max(0, Math.round(meta.ageMs)) : 0),
    "x-intmap-seq": String(meta.seq | 0),
    "x-intmap-channel": hdr(meta.channel),
    "x-intmap-coverage": hdr(meta.coverage),
    "x-intmap-save": hdr(STATE.saveNote),
  };
  return new Response(bytes, { headers: h });
}

// ── request ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const gate = methodGate(req, CORS);
  if (gate) return gate;

  const url = new URL(req.url);
  const channel = (url.searchParams.get("ch") || "world").toLowerCase();
  const provider = providerName();
  const now = Date.now();

  try {
    /* Every path below is better for having the shared snapshot in hand: `world` answers from it,
       `view` merges its tiles into it, and `meta` reports coverage that means something. */
    await ensureHydrated();
    // ── status, for the UI's coverage panel and for monitoring ──────────────
    if (url.searchParams.get("meta") === "1" || channel === "meta") {
      const L = lattice();
      let probed = 0;
      for (const t of L) if (t.last) probed++;
      return new Response(JSON.stringify({
        provider: provider,
        attribution: ATTRIBUTION[provider] || provider,
        openskyConfigured: openskyAllowed(),
        codecVersion: CODEC.VERSION,
        reports: MODEL.PROVIDER_FIELDS[provider] || null,
        world: {
          aircraft: STATE.world.size,
          seq: STATE.worldSeq,
          ageMs: STATE.worldAt ? now - STATE.worldAt : null,
          latticeTiles: L.length,
          latticeProbed: probed,
          // Honest coverage: the fraction of the lattice this isolate has ever asked about. A cold
          // isolate says 0 %, and that is the truth — not "there are no aircraft there".
          coveragePct: L.length ? Math.round((probed / L.length) * 1000) / 10 : 0,
        },
        upstream: STATE.stats,
        backoffMs: Math.max(0, STATE.backoffUntil - now),
        /* ⚠ PRESENCE ONLY, NEVER VALUES. This endpoint is world-readable; what it may say is
           WHETHER the function has the credential it needs to persist the shared snapshot, because
           without that the snapshot silently does not survive an isolate and upstream reads go back
           to being proportional to requests (which is exactly what happened, #R341). A boolean is
           the whole diagnostic; the key itself must never appear in a response, a log or a header. */
        storage: {
          bucket: BUCKET,
          hasUrl: !!env("SUPABASE_URL"),
          hasServiceKey: !!env("SUPABASE_SERVICE_ROLE_KEY"),
          hasSecretKey: !!env("SB_SECRET_KEY"),
          hasAviationKey: !!env("AVIATION_STORAGE_KEY"),
        },
        limits: {
          viewTtlMs: VIEW_TTL_MS, worldTtlMs: WORLD_TTL_MS,
          viewMaxTiles: VIEW_MAX_TILES, worldSliceTiles: WORLD_SLICE_TILES,
          radiusNm: RADIUS_NM, staleDropS: STALE_DROP_S, latLimit: LAT_LIMIT,
        },
      }), { headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });
    }

    // ── viewport channel ────────────────────────────────────────────────────
    if (channel === "view") {
      const parts = (url.searchParams.get("bbox") || "").split(",").map(Number);
      if (parts.length !== 4 || parts.some((v) => !isFinite(v))) {
        return new Response(JSON.stringify({ error: "bbox=w,s,e,n required" }),
          { status: 400, headers: { ...CORS, "content-type": "application/json" } });
      }
      const w = parts[0], s = parts[1], e = parts[2], n = parts[3];
      // Round the key so two users looking at almost the same place share one upstream read.
      const key = "v:" + [w, s, e, n].map((v) => Math.round(v * 2) / 2).join(",");
      const hit = STATE.views.get(key);
      if (hit && now - hit.at < VIEW_TTL_MS) {
        STATE.stats.served++;
        return binResponse(hit.bytes, {
          provider, count: hit.count, ageMs: now - hit.at, seq: hit.seq,
          channel: "view", ttlMs: VIEW_TTL_MS, coverage: coverageLine(provider),
        });
      }
      /* ANSWER FROM WHAT WE ALREADY KNOW, then go and get more. The world set is hydrated from the
         shared snapshot, so even a cold isolate has real aircraft for this box; waiting for
         VIEW_MAX_TILES serial reads before replying is what made every response 5-6 seconds
         (measured). The tiles land in the snapshot and the next poll — 12 s later — carries them. */
      const inBox = [];
      for (const rec of STATE.world.values()) {
        if (rec.lat == null || rec.lon == null) continue;
        if (rec.lat < s || rec.lat > n) continue;
        let lo = rec.lon;
        if (e < w) { if (!(lo >= w || lo <= e)) continue; }      /* the box crosses the antimeridian */
        else if (lo < w || lo > e) continue;
        inBox.push(rec);
      }
      /* Is what we already know about this box good enough to answer with? "Good enough" is a
         measurement, not a timer: the freshest aircraft IN THE BOX. An empty box, or one whose best
         observation is older than VIEW_STALE_S, is worth the serial tile reads — and because the
         result goes into the shared snapshot, the next viewer of the same sky pays nothing. */
      let freshest = 0;
      for (const rec of inBox) if (rec.seenAt > freshest) freshest = rec.seenAt;
      const boxStale = !inBox.length || (Date.now() - freshest) / 1000 > VIEW_STALE_S;
      const work = once(key, async () => {
        const tiles = MODEL.tilesForBbox(w, s, e, n, RADIUS_NM, VIEW_MAX_TILES, LAT_LIMIT);
        const results = await readSerial(provider, tiles);
        const seen = new Map();
        for (const got of results) {
          for (const r of got.recs) {
            const prev = seen.get(r.hex);
            if (!prev || prev.seenAt < r.seenAt) seen.set(r.hex, r);
          }
        }
        const at = Date.now();
        // A viewport read is also world knowledge — every user looking anywhere improves the world
        // set for every other user. This is the compounding the old per-browser design threw away.
        const list = Array.from(seen.values());
        mergeIntoWorld(list, at);
        const seq = ++STATE.worldSeq;
        const entry = { at, bytes: encodeSet(list, seq, at), count: list.length, seq };
        STATE.views.set(key, entry);
        if (STATE.views.size > VIEW_CACHE_MAX) STATE.views.delete(STATE.views.keys().next().value);
        /* the tiles this viewport paid for belong in the shared snapshot too */
        await saveSnapshot(encodeSet(Array.from(STATE.world.values()), ++STATE.worldSeq, Date.now(), true));
        return entry;
      });
      if (boxStale) {
        await work;
        /* re-collect: the read just added aircraft to this box */
        inBox.length = 0;
        for (const rec of STATE.world.values()) {
          if (rec.lat == null || rec.lon == null) continue;
          if (rec.lat < s || rec.lat > n) continue;
          const lo = rec.lon;
          if (e < w) { if (!(lo >= w || lo <= e)) continue; }
          else if (lo < w || lo > e) continue;
          inBox.push(rec);
        }
      } else {
        after(work);
      }
      STATE.stats.served++;
      const at = Date.now();
      const seq = ++STATE.worldSeq;
      let oldest = 0;
      for (const rec of inBox) { const a = at - rec.seenAt; if (a > oldest) oldest = a; }
      return binResponse(encodeSet(inBox, seq, at, true), {
        provider, count: inBox.length, ageMs: oldest, seq,
        channel: "view", ttlMs: VIEW_TTL_MS, coverage: coverageLine(provider),
      });
    }

    // ── world channel ───────────────────────────────────────────────────────
    if (channel === "world") {
      /* ?refresh=1 is the SWEEPER's entry point, not a browser's: it advances the lattice and
         writes the snapshot, and it is the only caller that pays for a sweep slice. Everyone else
         answers from the snapshot immediately, however old it is, and is TOLD how old it is —
         which is the honest thing to show and the fast thing to serve. */
      const force = url.searchParams.get("refresh") === "1";
      let bytes = STATE.worldBuilt;
      let age = STATE.worldAt ? now - STATE.worldAt : Infinity;
      if (!bytes && STATE.world.size) {
        /* hydrated, but this isolate has not encoded it yet */
        STATE.worldBuilt = bytes = encodeSet(Array.from(STATE.world.values()), STATE.worldSeq, now, true);
      }
      if (force || !bytes) {
        bytes = await once("world", refreshWorld);
        age = Date.now() - STATE.worldAt;
      } else if (age > WORLD_TTL_MS) {
        after(once("world", refreshWorld));
      }
      STATE.stats.served++;
      return binResponse(bytes || CODEC.encode({ seq: 0, serverTimeMs: now, aircraft: [] }), {
        provider, count: STATE.world.size, ageMs: age, seq: STATE.worldSeq,
        channel: "world", ttlMs: WORLD_TTL_MS, coverage: coverageLine(provider),
      });
    }

    return new Response(JSON.stringify({ error: "ch must be world, view or meta" }),
      { status: 400, headers: { ...CORS, "content-type": "application/json" } });
  } catch (e) {
    // ⚠ The caller learns THAT the upstream failed, never what the exception said — these responses
    // are world-readable (CodeQL js/stack-trace-exposure), and relayFail names only which BOUND was
    // hit. A failure here must NOT become "0 aircraft" downstream: the client keeps its last real
    // data and marks it stale (§25.2).
    return relayFail(e, CORS);
  }
});
