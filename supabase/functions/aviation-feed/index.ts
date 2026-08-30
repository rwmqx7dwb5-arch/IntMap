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
//  socket does not belong here (AGENTS.md §5.2) — the providers wired below are REST, polled, and
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
    "x-intmap-oldest-ms, " +
    "x-intmap-seq, x-intmap-channel, x-intmap-coverage, x-intmap-save, x-intmap-note",
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
const VIEW_STALE_S = 45;                       // sky asked about longer ago than this is worth a read

/* ── (#R504) HOW FAST THIS FUNCTION MAY ASK — AND WHY THAT IS NOT ONE BURST PER 45 SECONDS ─────
   「航空トラフィックレイヤーはもっと多くの航空機が表示されるように。」 Measured against production
   BEFORE any change here: `x-intmap-count` was 2699 and `x-intmap-coverage` was `lattice 0/980`,
   at a minute when the provider's own network held 10,924 aircraft with a position. So four out of
   every five aircraft that exist were missing, and the reason was not the drawing, the wire or the
   client — it was how little sky this function is allowed to ask about.

   #R434 gave the WHOLE function one burst of VIEW_MAX_TILES tiles per VIEW_STALE_S — 4 tiles per
   45 s, or 0.089 reads a second — and it did so from #R341's reading of the provider: "a small
   BURST BUDGET (~4 requests) that refills slowly, not a requests-per-second ceiling". Re-measured
   2026-08-31 against api.adsb.lol from one address, with the load-bearing User-Agent below:

       back to back    5 of  6 answered 200
       1.0 s apart     8 of 12 answered 200
       2.0 s apart    31 of 40 answered 200        ← the knee is ~0.5 req/s, not 0.089

   A budget that does not move with the gap but DOES answer 78 % at 2 s spacing is a leaky bucket
   that refills continuously, not a four-shot magazine. #R341 read four successes out of ten and
   concluded the refill was measured in minutes; ten requests is simply too short a window to see a
   bucket refilling at one token every two seconds. So this is a rate, and the rate this function
   spent was a fifth of the one it is granted.

   ⚠ THE CEILING IS DELIBERATELY BELOW THE KNEE. 0.34 reads a second is about two thirds of the
   measured 0.5, which leaves the provider's own headroom intact; the alternative — asking at the
   knee — buys 45 % more sky and spends it on 429s, and a 429 silences EVERY channel at once
   (see the backoff below). api.adsb.lol's published terms say the API is free, that a key tied to
   feeding is coming, and that production users should make contact; docs/AVIATION-ARCHITECTURE.md
   records that as the next step rather than something a constant here can decide.
   ⚠ AND IT IS A BUCKET, NOT A GAP, because the two channels are not the same shape. A viewport
   read wants its four tiles NOW (the caller is waiting); the lattice sweep is happy to take one
   tile whenever there is one going. A bucket serves both from one honest ceiling — burst up to
   READ_BURST after a quiet spell, never more than READ_RATE_PER_S on average.
   ⚠ IT IS ISOLATE STATE, AND THAT BOUNDS WHAT IT CAN CLAIM (the same caveat #R434 wrote about the
   asked-ledger). Two warm isolates hold two buckets. What keeps that honest is that the bucket's
   clock is SEEDED FROM THE SHARED LEDGER on hydrate: a cold isolate adopts the last read time
   every isolate agreed on, so it starts with what has actually refilled since, not with a free
   full burst. */
const READ_RATE_PER_S = 0.34;
const READ_BURST = 6;
/* (#R504) …and what `?refresh=1&tiles=N` may raise WORLD_SLICE_TILES to. The sweeper is the one
   caller that is not a browser waiting for a response, so it can afford to sit through a whole
   bucket; the cap is READ_BURST because nothing may take more tokens than the bucket can ever hold.
   ⚠ (#R505) IT LIVES HERE, BELOW READ_BURST, AND THAT IS THE WHOLE BUG #R504 SHIPPED. It was
   declared beside WORLD_SLICE_TILES, forty-five lines ABOVE the `const READ_BURST` it reads — a
   temporal dead zone, so evaluating this module threw ReferenceError before Deno.serve was ever
   reached and EVERY request answered 500 WORKER_ERROR. Nothing caught it: the file parses
   (check:static reads syntax, not order), and #R504's own thirteen checks read the source as TEXT.
   The gate that catches it now actually EVALUATES this constant block — tests/r505 ①. */
const SWEEP_TILES_MAX = READ_BURST;

/* ⚠ (#R504) A 429 IS NO LONGER A MINUTE OF SILENCE ON THE FIRST OFFENCE. At 0.089 reads a second a
   429 meant something had gone badly wrong, so a flat 60 s stop was proportionate. At 0.34 an
   occasional 429 is the bucket telling us it is empty — measured, 9 of 40 at 2 s spacing — and
   answering that by stopping every channel for a minute costs 20 tiles to save one. So the pause
   STARTS short and doubles while the refusals keep coming, and any successful read puts it back:
   the response to a provider that means it is still a minute, and the response to ordinary bucket
   pressure is to wait for a token. */
const RATE_BACKOFF_MIN_MS = 8000;
const RATE_BACKOFF_MS = 60000;                 // the ceiling the escalation walks up to
// (#R434) how many candidate tiles the viewport ranks before spending its VIEW_MAX_TILES on the
// stalest of them. Six deep is a 24-tile fan around the view centre — enough that a wide view has
// somewhere to walk to, small enough that ranking them is arithmetic on two dozen numbers.
const VIEW_FAN = 6;
// …and the grain of the ledger that remembers when a patch of sky was last asked about. A tile is
// RADIUS_NM = 250 nm ≈ 4.2° of latitude across, so 2° cells are about half a tile: fine enough that
// two tile centres one cell apart really are different sky, coarse enough that the view-anchored
// lattice (tilesForBbox centres its rows on the CAMERA, so panning shifts every centre) still lands
// on the same cell twice. 90 × 180 cells is the whole planet; the cap is a backstop, not a budget.
const ASK_CELL_DEG = 2;
const ASK_MAX = 32768;

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
  /* (#R352) the earliest `seenAt` in `world`, so "how old is the oldest thing in this answer"
     is a field rather than a scan. 0 = nothing observed yet. */
  worldOldestAt: 0,
  worldBuilt: null,        // encoded Uint8Array
  views: new Map(),        // bboxKey → { at, bytes, count, seq }
  /* (#R434) cell → epoch ms of the last COMPLETED tile read there, whatever it returned. The
     viewport picks the stalest cells it can see; see the note in the view channel. */
  asked: new Map(),
  viewReadAt: 0,           // (#R434) when the viewport channel last spent the shared burst budget
  /* (#R504) the leaky bucket every upstream read is drawn from, and the clock it refills against.
     Seeded from the shared ledger on hydrate so a cold isolate does not start with a free burst. */
  readTokens: READ_BURST,
  readTokensAt: 0,
  readAt: 0,               // last completed read, ANY channel — this is what the ledger carries
  backoffStep: 0,          // (#R504) the current escalating pause; a successful read clears it
  sweepSavedAt: 0,         // when the sweep ledger was last written
  sweepLoaded: false,
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

/* ── (#R504) …AND THE SWEEP'S OWN PROGRESS, WHICH WAS NOT IN IT ────────────────────────────────
   The snapshot above carries AIRCRAFT. Everything that says WHERE WE HAVE ALREADY LOOKED —
   `STATE.cursor`, each lattice tile's `last` and `miss`, and the asked-cell ledger #R434 added —
   lived only in isolate memory, and Supabase hands out cold isolates constantly. The consequences
   were not subtle, and all three were visible in production on 2026-08-31:

     · `x-intmap-coverage: lattice 0/980` on every isolate, for as long as the header has existed.
       Not "the sweep is behind" — the sweep has never been able to report a single probed tile,
       because the isolate that answers is essentially never the isolate that swept.
     · The sweeper restarted at `cursor 0` every run, so the scrambled visiting order that exists
       precisely so a small budget samples the whole planet re-bought the SAME first tiles
       ~6 times a day and never reached tile 7. The lattice has 980 entries and the sweep was a
       loop over three of them.
     · `miss` — the counter that exists so two thirds of the planet (ocean without receivers) is
       re-probed at a reduced rate — reset to 0 with every isolate, so it never reduced anything.

   ⚠ THE SWEEP LEDGER IS INDEXED BY LATTICE POSITION, WHICH IS ONLY MEANINGFUL BECAUSE THE LATTICE
   IS DETERMINISTIC. buildLattice(RADIUS_NM, LAT_LIMIT) and the golden-ratio stride below both
   depend on nothing but constants in this file, so tile #412 is the same patch of sky in every
   isolate for as long as those constants hold. `n` is stored WITH the arrays and a mismatch
   discards them rather than mapping old numbers onto new sky — which is what changing RADIUS_NM
   would otherwise silently do.
   ⚠ IT IS SMALL AND IT IS WRITTEN RARELY. Two arrays of 980 numbers plus the newest
   SWEEP_ASKED_MAX cells is tens of kilobytes, and SWEEP_SAVE_MS keeps it to one PUT a minute —
   next to a world snapshot that is already written after every viewport read, it is noise. */
const SWEEP_OBJECT = "sweep.json";
const SWEEP_MAX_BYTES = 4 * 1024 * 1024;
const SWEEP_SAVE_MS = 60000;
const SWEEP_ASKED_MAX = 3000;

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

/* ── (#R504) the sweep ledger, read once per isolate and written at most once a minute ─────────
   Seconds, not milliseconds, everywhere in the wire form: this file only ever asks "how long ago"
   of these numbers, and a second of resolution turns each entry from 13 digits into 10. */
async function loadSweep() {
  const u = svcUrl("/storage/v1/object/public/" + BUCKET + "/" + SWEEP_OBJECT);
  if (!u) return null;
  try {
    const r = await fetch(u + "?t=" + Date.now(), { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const txt = await r.text();
    if (!txt || txt.length > SWEEP_MAX_BYTES) return null;
    const j = JSON.parse(txt);
    return (j && j.v === 1) ? j : null;
  } catch (_) { return null; }
}

function applySweep(j) {
  if (!j) return false;
  const L = lattice();
  /* ⚠ THE LENGTH IS THE VERSION. Tile #412 is only the same sky as long as the lattice is; a
     different length means RADIUS_NM or LAT_LIMIT moved, and mapping the old numbers onto the new
     tiles would claim coverage of sky nobody has looked at. Dropping them costs one rotation. */
  /* ⚠ `| 0` IS NOT AVAILABLE FOR THE TIMES. These are epoch SECONDS, and a bitwise operator coerces
     to int32 — which is fine today and turns every stored timestamp negative in January 2038. The
     cell keys below are small integers by construction (askCell), so they may have it. */
  const secs = (v) => (Number(v) || 0) * 1000;
  if (Array.isArray(j.last) && Array.isArray(j.miss) && j.n === L.length) {
    for (let i = 0; i < L.length; i++) {
      const last = secs(j.last[i]);
      if (last > 0) L[i].last = last;
      const miss = j.miss[i] | 0;
      if (miss > 0) L[i].miss = Math.min(8, miss);
    }
    STATE.cursor = Math.max(0, j.cursor | 0) % L.length;
  }
  if (Array.isArray(j.asked)) {
    for (const pair of j.asked) {
      if (!Array.isArray(pair) || pair.length !== 2) continue;
      stampCell(pair[0] | 0, secs(pair[1]));
    }
  }
  /* ⚠ AND THE BUCKET'S CLOCK, WHICH IS THE HALF OF THIS THAT BOUNDS UPSTREAM LOAD. Without it a
     cold isolate would refill from `0`, see a gap of fifty-six years, and grant itself a full
     burst on its first request — which is exactly the "load proportional to isolates" shape the
     snapshot exists to remove, moved from aircraft to permission-to-ask. */
  if (j.readAt) {
    STATE.readAt = secs(j.readAt);
    STATE.readTokensAt = STATE.readAt;
    STATE.readTokens = 0;
  }
  STATE.sweepLoaded = true;
  return true;
}

function sweepBody() {
  const L = lattice();
  const last = new Array(L.length);
  const miss = new Array(L.length);
  for (let i = 0; i < L.length; i++) {
    last[i] = Math.round((L[i].last || 0) / 1000);
    miss[i] = L[i].miss | 0;
  }
  /* The newest cells, because the ledger's whole job is "how long ago", and the oldest entries are
     the ones a re-read would be spent on anyway. */
  const asked = Array.from(STATE.asked.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, SWEEP_ASKED_MAX)
    .map((e) => [e[0], Math.round(e[1] / 1000)]);
  return JSON.stringify({
    v: 1, at: Math.round(Date.now() / 1000), n: L.length,
    cursor: STATE.cursor | 0, readAt: Math.round((STATE.readAt || 0) / 1000),
    last, miss, asked,
  });
}

async function saveSweep(force) {
  const now = Date.now();
  if (!force && now - STATE.sweepSavedAt < SWEEP_SAVE_MS) return false;
  const key = storageKey();
  const u = svcUrl("/storage/v1/object/" + BUCKET + "/" + SWEEP_OBJECT);
  if (!key || !u) return false;
  STATE.sweepSavedAt = now;
  try {
    const r = await fetch(u, {
      method: "POST",
      headers: {
        authorization: "Bearer " + key,
        /* ⚠ NOT application/json, EVEN THOUGH THAT IS WHAT THIS IS. The bucket is declared with
           `allowed_mime_types = array['application/octet-stream']` (migration 20260823130000, and
           ensureBucket below repeats it), and Storage refuses an upload whose content-type is not
           on that list — so an honest header here would make every write fail with 415 while
           everything else looked fine, which is precisely the silent half of #R341. Widening the
           bucket instead would need a migration applied with the database password
           (docs/MIGRATIONS.md), i.e. a human step, for a label nobody reads: loadSweep() asks for
           .text() and parses it, and the object is not served to anything else. */
        "content-type": "application/octet-stream",
        "cache-control": "max-age=5",
        "x-upsert": "true",
      },
      body: sweepBody(),
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) { STATE.stats.sweepSaved = (STATE.stats.sweepSaved || 0) + 1; return true; }
    if (r.status === 404) { await ensureBucket(); return false; }
    STATE.stats.sweepSaveFail = (STATE.stats.sweepSaveFail || 0) + 1;
    return false;
  } catch (_) {
    STATE.stats.sweepSaveFail = (STATE.stats.sweepSaveFail || 0) + 1;
    return false;
  }
}

/* ── (#R504) the read budget ───────────────────────────────────────────────────────────────────
   Every upstream read in this file passes through takeTokens(). Nothing else may call readTile or
   readSerial without one, which is what makes READ_RATE_PER_S a fact about the function rather
   than about whichever channel happened to be written most carefully. */
function refillTokens(now) {
  const at = STATE.readTokensAt || now;
  if (now > at) {
    STATE.readTokens = Math.min(READ_BURST, STATE.readTokens + ((now - at) / 1000) * READ_RATE_PER_S);
  }
  STATE.readTokensAt = now;
}

function takeTokens(want, now) {
  refillTokens(now);
  if (now < STATE.backoffUntil) return 0;
  const n = Math.min(want | 0, Math.floor(STATE.readTokens));
  if (n > 0) STATE.readTokens -= n;
  return n;
}

//  Turn a decoded snapshot back into the record shape the world Map holds. The wire is lossy about
//  identity on purpose (it is sent once per aircraft, not per refresh), so an aircraft whose
//  identity line was in an earlier message hydrates with empty strings — which is correct: empty
//  means "not known here", and the next viewport read that sees it fills it in.
/* (#R352) One pass over the world set recording the EARLIEST observation in it. Called from the
   three places that change the set (build, hydrate, prune) so `x-intmap-oldest-ms` costs nothing
   per request. */
function noteOldest() {
  let min = 0;
  for (const rec of STATE.world.values()) {
    if (!min || rec.seenAt < min) min = rec.seenAt;
  }
  STATE.worldOldestAt = min;
}

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
    /* ⚠ (#R434 addendum) AND THE LEDGER IS SEEDED FROM WHAT THE SNAPSHOT ALREADY KNOWS. An
       aircraft observed in this cell at time T is proof that SOMEBODY asked about this cell at
       least at T — the observation could not exist otherwise. Without this a cold isolate starts
       its walk with an empty ledger, decides the view centre is the stalest sky on the planet, and
       spends its one read there whatever the snapshot already holds; measured in production
       immediately after this round deployed, three consecutive polls of the same wide view were
       answered by three isolates reporting askedCells 3, 0 and 0. The ledger cannot learn about
       EMPTY sky this way — nothing observed leaves no trace — and treating that as "never asked"
       is the safe direction: at worst one read is spent re-confirming an empty ocean. */
    markAsked(msg.lat[i], msg.lon[i], seenAt);
    n++;
  }
  STATE.worldSeq = Math.max(STATE.worldSeq, msg.seq || 0);
  STATE.worldAt = msg.serverTimeMs || nowMs;
  STATE.hydrated = true;
  noteOldest();
  return n;
}

//  Hydrate at most once per isolate, and never twice concurrently.
function ensureHydrated() {
  if (STATE.hydrated) return Promise.resolve(0);
  return once("hydrate", async () => {
    /* (#R504) BOTH halves of what survives an isolate, in one round trip's worth of wall clock:
       the aircraft, and the record of where we have already looked. They are independent objects
       and either may be missing — a first deployment has neither — so neither await may fail the
       other. */
    const [msg, sweep] = await Promise.all([loadSnapshot(), loadSweep().catch(() => null)]);
    const n = hydrate(msg);
    /* AFTER hydrate(), because hydrate() seeds the asked-ledger from the snapshot's observations
       (#R434) and the stored ledger is the more precise of the two: markAsked keeps the later
       time, and applySweep writes only where it is later still. */
    if (applySweep(sweep)) STATE.stats.sweepLoaded = 1;
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
/* (#R434) THE LEDGER OF WHEN EACH PATCH OF SKY WAS LAST ASKED ABOUT. It records the ASK and not
   the catch, which is the whole point: two thirds of the planet is ocean with no receiver
   coverage, and a tile that answered "nothing here" thirty seconds ago is not the same as one
   nobody has ever looked at. Every completed read stamps it — the viewport channel's and the
   lattice sweep's alike — so the two channels stop buying the same sky twice. */
const askCell = (lat, lon) =>
  Math.round(lat / ASK_CELL_DEG) * 1000 + Math.round((((lon + 540) % 360) - 180) / ASK_CELL_DEG);
function askedAt(lat, lon) {
  return STATE.asked.get(askCell(lat, lon)) || 0;
}
/* ⚠ (#R504) THE ONLY PLACE THE LEDGER IS WRITTEN. There are now three writers — a completed tile
   read, the hydrated snapshot, and the persisted ledger itself — and the cap and the latest-wins
   rule must hold for all of them. Splitting the key arithmetic off is what lets applySweep(), which
   already holds cell keys and never saw a latitude, come through the same door. */
function stampCell(key, at) {
  if (!(at > 0)) return;
  // A Map that only grows is a leak; the planet needs 16,200 cells at this grain, so anything past
  // the cap is an isolate that has outlived its usefulness as a memory of where we have looked.
  if (STATE.asked.size >= ASK_MAX) STATE.asked.clear();
  /* ⚠ (#R434 addendum) THE LATEST WINS, because the writers do not arrive in order: a completed
     tile read is always the newest thing there is, while the hydrated snapshot carries fifty
     aircraft in one cell with fifty different observation times, and only the newest of them says
     how recently that sky was looked at. */
  const prev = STATE.asked.get(key) || 0;
  if (at > prev) STATE.asked.set(key, at);
}

function markAsked(lat, lon, at) {
  if (!(at > 0) || lat == null || lon == null) return;
  stampCell(askCell(lat, lon), at);
}

async function readSerial(provider, tiles) {
  const out = [];
  for (let i = 0; i < tiles.length; i++) {
    if (Date.now() < STATE.backoffUntil) break;
    const got = await readTile(provider, tiles[i].lat, tiles[i].lon);
    if (got === RATE_LIMITED) {
      /* (#R504) escalating, not flat — see RATE_BACKOFF_MIN_MS. The step doubles for as long as
         the refusals keep arriving and is cleared by the next successful read below, so the
         provider meaning it and the bucket being momentarily empty stop costing the same minute. */
      STATE.backoffStep = Math.min(RATE_BACKOFF_MS, Math.max(RATE_BACKOFF_MIN_MS, STATE.backoffStep * 2));
      STATE.backoffUntil = Date.now() + STATE.backoffStep;
      STATE.stats.rateLimited++;
      /* An empty bucket is not a reason to keep the tokens we already spent on tiles we will now
         never read; hand them back so the next caller is not charged for this one's refusal. */
      STATE.readTokens = Math.min(READ_BURST, STATE.readTokens + (tiles.length - i));
      break;
    }
    STATE.backoffStep = 0;
    /* ⚠ STAMPED HERE, WHERE THE READ ACTUALLY HAPPENED, AND NOT AT THE CALL SITES — there are two
       of them and a ledger only one of them writes is a ledger that lies about half the sky. */
    const at = Date.now();
    markAsked(tiles[i].lat, tiles[i].lon, at);
    /* (#R504) …and the one clock the sweep ledger carries, so a cold isolate inherits how much of
       the bucket has actually refilled rather than assuming all of it. */
    STATE.readAt = at;
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
  noteOldest();
}

async function refreshWorld(wantTiles) {
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
    /* (#R504) The slice is what the SHARED BUDGET grants, not a constant. `?refresh=1&tiles=N`
       asks for more; the bucket decides. A grant of 0 is not a failure — it means a viewport read
       is using the budget right now, which is the better use of it. */
    const want = Math.max(1, Math.min(SWEEP_TILES_MAX, wantTiles | 0 || WORLD_SLICE_TILES));
    const grant = takeTokens(want, now);
    const picked = [];
    let scanned = 0;
    while (picked.length < grant && scanned < L.length) {
      const t = L[STATE.cursor % L.length];
      STATE.cursor++;
      scanned++;
      if (t.miss > 0 && (STATE.cursor % (1 << Math.min(3, t.miss))) !== 0) continue;
      picked.push(t);
    }
    const results = await readSerial(provider, picked);
    /* (#R504) A slice the bucket had nothing for read nothing, so the world is exactly what it was.
       Re-encoding 10,000 aircraft and PUTting 137 kB to say so is work nobody asked for — and
       ?refresh=1 now arrives ten times a run, so it is work nobody asked for ten times over. */
    if (!results.length && STATE.worldBuilt) { STATE.stats.sweeps++; return STATE.worldBuilt; }
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
  /* ⚠ (#R504) AN EMPTY WORLD IS NEVER WRITTEN OVER THE SHARED ONE. Every path into here can end
     with nothing in hand — hydration could not reach Storage, the provider refused, or the budget
     granted no tiles — and in all three cases the snapshot on disk is the best knowledge that
     exists. Overwriting it with 0 aircraft would take the layer down for every browser at once and
     look exactly like an upstream outage. The grant-0 case is what made this reachable often
     enough to matter. */
  if (STATE.world.size &&
      await saveSnapshot(encodeSet(Array.from(STATE.world.values()), STATE.worldSeq, now, true))) STATE.stats.saved++;
  /* (#R504) …and the sweep's own progress, which is the half of this that used to be thrown away.
     Throttled inside saveSweep, so a busy minute writes it once. */
  await saveSweep(false);
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
    /* ⚠ (#R352) ONE HEADER, ONE MEANING. `x-intmap-age-ms` used to carry the snapshot's age on the
       world channel and the OLDEST AIRCRAFT IN THE BOX on the view channel — two different facts
       alternating in one field, so a client could not read either. Measured in production: world
       reported 12.7-13.5 s and view 531-564 s, and neither number meant what the other did.
       §22.2 is explicit that the age of the ANSWER and the age of an OBSERVATION are separate
       things the UI has to be able to tell apart, so they are separate headers. */
    "x-intmap-age-ms": String(isFinite(meta.ageMs) ? Math.max(0, Math.round(meta.ageMs)) : 0),
    "x-intmap-oldest-ms": String(isFinite(meta.oldestMs) ? Math.max(0, Math.round(meta.oldestMs)) : 0),
    "x-intmap-seq": String(meta.seq | 0),
    "x-intmap-channel": hdr(meta.channel),
    "x-intmap-coverage": hdr(meta.coverage),
    "x-intmap-save": hdr(STATE.saveNote),
    /* (#R506) empty on every channel that has no decision to explain */
    "x-intmap-note": hdr(meta.note || ""),
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
          /* (#R434) the viewport's tile CHOICE, so a reader can see the sweep happening rather than
             infer it: how deep the candidate fan is, how many cells of sky this isolate has asked
             about, and how long ago it last spent the shared burst budget. */
          viewFan: VIEW_FAN, askCellDeg: ASK_CELL_DEG,
          askedCells: STATE.asked.size,
          viewReadAgeMs: STATE.viewReadAt ? now - STATE.viewReadAt : null,
          /* (#R504) the read budget, so "why is coverage not moving" is answerable without a
             deploy: what the ceiling is, how much of it is available right now, when this
             function last actually asked anything, and whether the persisted ledger arrived. */
          readRatePerS: READ_RATE_PER_S, readBurst: READ_BURST,
          readTokens: Math.round(Math.min(READ_BURST, STATE.readTokens +
            (STATE.readTokensAt ? ((now - STATE.readTokensAt) / 1000) * READ_RATE_PER_S : 0)) * 100) / 100,
          readAgeMs: STATE.readAt ? now - STATE.readAt : null,
          sweepCursor: STATE.cursor,
          sweepLedger: STATE.sweepLoaded ? "loaded" : "absent",
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
          provider, count: hit.count, ageMs: now - hit.at, oldestMs: 0, seq: hit.seq,
          channel: "view", ttlMs: VIEW_TTL_MS, coverage: coverageLine(provider),
        });
      }
      /* ANSWER FROM WHAT WE ALREADY KNOW, then go and get more. The world set is hydrated from the
         shared snapshot, so even a cold isolate has real aircraft for this box; waiting for
         VIEW_MAX_TILES serial reads before replying is what made every response 5-6 seconds
         (measured). The tiles land in the snapshot and the next poll — 12 s later — carries them. */
      /* ⚠ (#R411) ONE DECLARATION, BECAUSE THERE WERE TWO AND THE FIRST FIX ONLY REACHED ONE. The
         box is collected here and AGAIN after a stale box has waited for its tiles, and both copies
         carried the same ordered comparison on longitude — the second being the path that runs when
         the read actually happened, i.e. the one a wide view depends on most. The report named one
         place and the check found the other. See MODEL.lonInSpan for the bounds the running
         application reports below z4 and what those comparisons did to them. */
      const collectBox = () => {
        const out = [];
        for (const rec of STATE.world.values()) {
          if (rec.lat == null || rec.lon == null) continue;
          if (rec.lat < s || rec.lat > n) continue;
          if (!MODEL.lonInSpan(rec.lon, w, e)) continue;
          out.push(rec);
        }
        return out;
      };
      let inBox = collectBox();
      /* ── (#R434) WHICH FOUR TILES, AND WHETHER TO SPEND THEM AT ALL ─────────────────────────
         「より低ズームでもより多くの航空機が表示されるように。」 The budget below is unchanged —
         VIEW_MAX_TILES tiles, no oftener than VIEW_STALE_S — because the provider's is (see the
         bounds block). What changes is that both halves of the decision used to be made by the
         wrong quantity, and a wide view lost both ways:

           · WHETHER. #R341 asked "is the freshest aircraft ANYWHERE IN THE BOX older than 45 s?".
             A view wide enough to contain Europe always has a fresh aircraft in one corner, so it
             never read at all; a view over empty ocean has none, so `!inBox.length` made it read on
             every miss of the 15 s cache. Measured against production, world set 1,683 aircraft:
             Japan at z6 returned 89 aircraft and Japan at z3 — a hundred and fifty times the area —
             returned 97. Eight more aircraft for half the planet.
           · WHICH. `tilesForBbox` returns the tiles NEAREST THE CENTRE, so a read always bought the
             same four. Repeating it is how a wide view stays exactly as covered as it was.

         Both are now the same question asked once: WHEN WAS THIS PATCH OF SKY LAST ASKED ABOUT.
         `askedAt` is stamped by every completed tile read anywhere in the function — viewport and
         lattice sweep alike — so the choice is the four stalest candidates out of a wider fan, ties
         keeping tilesForBbox's centre-out order, and successive polls walk outward across the view
         instead of re-reading its middle.
         ⚠ THE SPACING IS GLOBAL, NOT PER VIEW, and that is a REDUCTION. The burst budget belongs to
         this function's address, not to a bbox: two viewers of different continents used to spend it
         twice over and collect a 429 that silenced everything for RATE_BACKOFF_MS — which is how
         asking for more sky ends up drawing less of it. One read per VIEW_STALE_S for the whole
         function is what the measurement in the bounds block actually licenses.
         ⚠ AN EMPTY ANSWER IS AN ANSWER. The ledger records the ASK, not the catch; without that,
         ocean tiles stay maximally stale for ever and a wide view spends its whole budget on them.
         ⚠ AND IT IS ISOLATE STATE, WHICH BOUNDS WHAT IT CAN CLAIM. Supabase hands out cold isolates
         often (see the snapshot note above), and a cold one starts its walk at the view centre
         again. What survives an isolate is the AIRCRAFT — every read merges into the shared
         snapshot and stays for STALE_DROP_S — so a restarted walk re-covers sky that is still
         answered from stock; what it costs is the ordering, not the coverage. Persisting the
         ledger would mean changing the snapshot's format, and it is not worth that. */
      const cands = MODEL.tilesForBbox(w, s, e, n, RADIUS_NM, VIEW_MAX_TILES * VIEW_FAN, LAT_LIMIT);
      const ranked = cands
        .map((t, i) => ({ t, i, at: askedAt(t.lat, t.lon) }))
        .sort((a, b) => (a.at - b.at) || (a.i - b.i))
        .slice(0, VIEW_MAX_TILES);
      const stalest = ranked.length ? ranked[0].at : 0;
      const worthIt = ranked.length > 0 && (now - stalest) / 1000 > VIEW_STALE_S;
      /* ⚠ (#R504) THE SPACING WAS THE WHOLE CEILING, AND IT WAS A FIFTH OF THE PROVIDER'S.
         `spaced` used to be `now - STATE.viewReadAt >= VIEW_STALE_S * 1000` — one burst of four
         tiles per 45 seconds for the entire function, which is 0.089 reads a second against a
         provider measured at ~0.5 (see READ_RATE_PER_S). VIEW_STALE_S was doing two unrelated
         jobs at once: "this patch of sky is stale enough to be worth a read", which is a fact
         about the sky and stays above in `worthIt`, and "the function may ask again now", which is
         a fact about the PROVIDER and belongs in one bucket that every channel draws from.
         Measured consequence of conflating them: a browser polls this channel every 12 s and got a
         read on one poll in four, so three quarters of the polls could only re-serve what was
         already in the world set. The grant below is what actually refilled. */
      const grant = worthIt ? takeTokens(ranked.length, now) : 0;
      const spent = ranked.slice(0, grant);
      /* ⚠ (#R506) THE DECISION IS NOW A FACT THE CALLER CAN READ, because guessing at it cost a
         whole afternoon. Measured against production: the same box polled five times, 16 s apart,
         answered `x-intmap-oldest-ms` 252,843 → 258,339 → 258,111 → 263,907 → 264,811 — the sky in
         that box was never refreshed — while `?meta=1` reported a FULL bucket and no backoff. Three
         different things produce that one symptom (nothing ranked, the sky judged fresh enough, or
         the budget granting zero) and from outside they are indistinguishable. §24's rule is that a
         layer must be able to say WHY it did what it did; this is the view channel's half of it. */
      let viewNote = "cands=" + cands.length + ",ranked=" + ranked.length +
        ",stalestS=" + (stalest ? Math.round((now - stalest) / 1000) : -1) +
        ",worth=" + (worthIt ? 1 : 0) + ",grant=" + grant +
        ",tokens=" + Math.floor(STATE.readTokens) + ",inBox=" + inBox.length;
      /* ⚠ THE READ IS NOT BUILT UNLESS IT IS WANTED, AND THAT IS A BUG FIX ON ITS OWN. `once()`
         STARTS what it is handed — it hands back a running promise, not a thunk — so the previous
         `const work = once(key, …)` above the branch spent four upstream reads on EVERY request that
         missed the 15 s cache, and `boxStale` only chose whether the caller waited for them. Four
         tiles per fifteen seconds per bbox is three times the whole measured burst budget, which is
         a 429 and RATE_BACKOFF_MS of silence for every channel at once. */
      const merged0 = STATE.stats.merged, up0 = STATE.stats.upstream, fail0 = STATE.stats.upstreamFail;
      if (grant > 0) {
        /* stamped BEFORE the await, so two callers arriving in the same tick cannot both decide the
           budget is free — an isolate runs one of them to its first await before the other starts.
           (#R504) takeTokens above is the part that actually enforces that now: it is synchronous
           and it debits before anything yields, so the second caller finds an emptier bucket. */
        STATE.viewReadAt = now;
        await once(key, async () => {
          const results = await readSerial(provider, spent.map((r) => r.t));
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
          /* the tiles this viewport paid for belong in the shared snapshot too — but see the note
             in refreshWorld: an empty world is never written over the shared one (#R504). */
          if (STATE.world.size) {
            await saveSnapshot(encodeSet(Array.from(STATE.world.values()), ++STATE.worldSeq, Date.now(), true));
          }
          /* (#R504) …and so does WHERE it looked. Without this the next isolate re-ranks from an
             empty ledger, decides the view centre is the stalest sky on the planet again, and
             spends the budget re-reading the tiles this request just paid for. */
          await saveSweep(false);
          return entry;
        });
        /* re-collect: the read just added aircraft to this box */
        inBox = collectBox();
        /* ⚠ (#R506) …AND SAY WHAT THE READ ACTUALLY BOUGHT. "grant=4" only means four tokens were
           SPENT. Measured in production: six aircraft, one of them at 465 kt, held byte-identical
           coordinates for 6.4 minutes while this channel reported grant=4 on every other poll — so
           the tokens were going somewhere that was not a fresh position. Tiles asked, tiles that
           answered, records returned and records that actually replaced something are four
           different numbers, and only the last one means the sky moved. */
        viewNote += ",up=" + (STATE.stats.upstream - up0) +
                    ",fail=" + (STATE.stats.upstreamFail - fail0) +
                    ",merged=" + (STATE.stats.merged - merged0);
      }
      STATE.stats.served++;
      const at = Date.now();
      const seq = ++STATE.worldSeq;
      let oldest = 0;
      for (const rec of inBox) { const a = at - rec.seenAt; if (a > oldest) oldest = a; }
      return binResponse(encodeSet(inBox, seq, at, true), {
        provider, count: inBox.length, ageMs: Date.now() - at, oldestMs: oldest, seq,
        channel: "view", ttlMs: VIEW_TTL_MS, coverage: coverageLine(provider), note: viewNote,
      });
    }

    // ── world channel ───────────────────────────────────────────────────────
    if (channel === "world") {
      /* ?refresh=1 is the SWEEPER's entry point, not a browser's: it advances the lattice and
         writes the snapshot, and it is the only caller that pays for a sweep slice. Everyone else
         answers from the snapshot immediately, however old it is, and is TOLD how old it is —
         which is the honest thing to show and the fast thing to serve. */
      const force = url.searchParams.get("refresh") === "1";
      /* (#R504) how big a slice the sweeper is asking for. Clamped, and then clamped again by the
         bucket inside refreshWorld — a query parameter may ask, it may not grant. */
      const wantTiles = Math.max(1, Math.min(SWEEP_TILES_MAX, Number(url.searchParams.get("tiles")) || WORLD_SLICE_TILES));
      let bytes = STATE.worldBuilt;
      let age = STATE.worldAt ? now - STATE.worldAt : Infinity;
      if (!bytes && STATE.world.size) {
        /* hydrated, but this isolate has not encoded it yet */
        STATE.worldBuilt = bytes = encodeSet(Array.from(STATE.world.values()), STATE.worldSeq, now, true);
      }
      if (force || !bytes) {
        bytes = await once("world", () => refreshWorld(wantTiles));
        age = Date.now() - STATE.worldAt;
      } else if (age > WORLD_TTL_MS) {
        after(once("world", () => refreshWorld(WORLD_SLICE_TILES)));
      }
      STATE.stats.served++;
      /* O(1): the oldest observation is recorded where the set is already being walked (build,
         hydrate, prune), not re-derived on every request. The cached path serves the SAME bytes
         to everyone, so a per-request scan of up to 50,000 records would buy nothing. */
      const worldOldest = STATE.worldOldestAt ? Date.now() - STATE.worldOldestAt : 0;
      return binResponse(bytes || CODEC.encode({ seq: 0, serverTimeMs: now, aircraft: [] }), {
        provider, count: STATE.world.size, ageMs: age, oldestMs: worldOldest, seq: STATE.worldSeq,
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
