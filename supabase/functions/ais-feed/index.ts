/* ============================================================================
 *  IntMap · ais-feed — the live-ship layer's ONLY upstream reader        (#R510)
 * ----------------------------------------------------------------------------
 *  WHY THIS EXISTS
 *  ---------------
 *  The ship layer was BYOK: every visitor had to paste their own aisstream.io key into Settings,
 *  and without one the map said "API key required" and drew nothing. That is the structure #R341
 *  removed for aircraft — upstream load proportional to USERS, and a feature that only works for
 *  the people who went and got a credential. This function is the ship half of the same answer:
 *  ONE key, held here, never sent to a browser; one shared snapshot; every visitor served from it.
 *
 *  ⚠ THE BYOK PATH IS NOT REMOVED. A reader who HAS a key still streams aisstream.io directly from
 *  their browser, which is fresher than any snapshot can be (AGENTS.md §3.1 — existing behaviour is
 *  not withdrawn without asking). What changed is what happens when there is no key: real ships
 *  instead of a prompt.
 *
 *  TWO PROVIDERS, AND THEY ARE NOT INTERCHANGEABLE
 *  ----------------------------------------------
 *  · aisstream.io — GLOBAL, and needs AISSTREAM_API_KEY. A WebSocket firehose: this function opens
 *    it, subscribes to the whole planet, listens for a few seconds, and closes. Free, and its own
 *    documentation caps a key at three concurrent connections — one short read per refresh is well
 *    inside that.
 *  · Digitraffic (Finnish Transport Infrastructure Agency) — the BALTIC, and needs NOTHING. No key,
 *    no registration, CC BY 4.0, and it sends `access-control-allow-origin: *`. Measured 2026-08-31:
 *    890 vessel positions and 854 static records (name, call sign, IMO, ship type, destination,
 *    draught) in two requests. It is here so that the layer is never empty and never asks the reader
 *    for anything — including on the day the aisstream key expires.
 *
 *  ⚠ WHAT IS NOT USED, AND WHY. There is no free, keyless, GLOBAL AIS feed. AISHub gives its data to
 *  people who feed it (like adsb.lol's re-api — see docs/AVIATION-ARCHITECTURE.md §4.5c); the
 *  commercial trackers sell it. Nothing here scrapes a site's private endpoint to get around that.
 *
 *  HONESTY (§22.1, §25.2)
 *  ----------------------
 *  · A vessel is drawn where its own AIS message put it. Nothing is interpolated on the server and
 *    nothing is invented — a failed refresh keeps the last real snapshot and SAYS how old it is.
 *  · `x-intmap-coverage` names which providers actually answered, so "the Baltic is busy and the
 *    Pacific is empty" reads as coverage rather than as fact about the sea.
 * ==========================================================================*/
import { corsFor, fetchGuarded, relayFail, methodGate } from "../_shared/relay-guard.js";

const CORS = {
  ...corsFor(),
  /* ⚠ A CUSTOM HEADER IS INVISIBLE TO JAVASCRIPT UNLESS IT IS EXPOSED — cross-origin,
     `headers.get()` answers null with no error at all (#R341 measured exactly this, and the layer
     could not name its own source). Attribution is a licence obligation for both providers. */
  "Access-Control-Expose-Headers":
    "x-intmap-provider, x-intmap-attribution, x-intmap-count, x-intmap-world, x-intmap-channel, " +
    "x-intmap-age-ms, x-intmap-oldest-ms, x-intmap-coverage, x-intmap-save, x-intmap-note",
};

// ── bounds ──────────────────────────────────────────────────────────────────
const WORLD_TTL_MS = 30000;          // how old a snapshot may be before a caller triggers a refresh
const STALE_DROP_S = 1800;           // a vessel unheard-of for 30 min leaves the set (ships are slow)
const AIS_MAX = 60000;               // hard ceiling on what this function will ever hold
const SNAP_MAX_BYTES = 32 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 12000;

/* ⚠ HOW LONG THE FIREHOSE IS HELD OPEN, AND WHY IT IS SHORT. aisstream pushes continuously; the
   longer this listens the more vessels it hears, and the longer the caller waits. Four seconds is
   the compromise the refresh path can afford, and the sweeper (?refresh=1) may ask for more. The
   cap is what stops a query parameter from holding a function invocation open for a minute. */
const WS_MS_DEFAULT = 4000;
const WS_MS_MAX = 20000;

const BUCKET = "ais";
const WORLD_OBJECT = "world.json";

const DIGITRAFFIC_LOCATIONS = "https://meri.digitraffic.fi/api/ais/v1/locations";
const DIGITRAFFIC_VESSELS = "https://meri.digitraffic.fi/api/ais/v1/vessels";
/* Digitraffic asks every caller to identify itself with this header and answers 406 to a request
   that does not accept gzip. Both are documented requirements, not guesses. */
const DIGITRAFFIC_UA = "IntMap/ais-feed (+https://github.com/rwmqx7dwb5-arch/IntMap)";

const ATTRIBUTION = {
  aisstream: "aisstream.io — AIS",
  digitraffic: "Digitraffic / Fintraffic — CC BY 4.0",
};

/* ⚠ TRIMMED. A secret pasted through a shell or a dashboard field arrives with whatever whitespace
   came with it, and a WebSocket handshake carrying a trailing newline in its credential is refused
   with no message at all — which is indistinguishable from a wrong key. Measured (#R510). */
function env(k: string): string { try { return (Deno.env.get(k) || "").trim(); } catch (_) { return ""; } }

/*  WARN (#R556) THE STORED VALUE IS NOT ALWAYS THE CREDENTIAL.
 *  #R510 measured a secret that was 79 characters and not alphanumeric, which is not the shape
 *  aisstream issues, and concluded "the value had something else in it" -- then left this function
 *  reading that value verbatim for ever. A credential travels through a shell, a clipboard and a
 *  dashboard field before it lands here, and every one of those can wrap it: quotes a shell did not
 *  strip, a whole NAME=value line, the URL of the page it was copied from, a label glued in front.
 *
 *  WARN THE ANSWER IS NOT TO GUESS THE KEY. It is to try the credentials the stored value ACTUALLY
 *  CONTAINS and let the upstream say which one it accepts. Nothing here knows any key: every
 *  candidate is derived from the value by structure alone, so the day the value is replaced with a
 *  clean one, "stored" is the first candidate, it works, and nothing else is ever tried.
 *
 *  WARN NEVER A SUBSTRING IN A RESPONSE. The shape report is length and character CLASSES only.
 *  Two different keys of the same length report identically; no key can be reconstructed from it.
 */
type Cand = { form: string; key: string };
const CRED_MIN = 8, CRED_MAX = 200;
const BACKTICK = String.fromCharCode(96);
function credentialCandidates(rawV: string): Cand[] {
  const out: Cand[] = [];
  const seen = new Set<string>();
  const add = (form: string, key: string | undefined) => {
    const k = String(key == null ? "" : key).trim();
    if (k.length < CRED_MIN || k.length > CRED_MAX || seen.has(k)) return;
    seen.add(k);
    out.push({ form, key: k });
  };
  const v = String(rawV == null ? "" : rawV).trim();
  /* the value as stored, always first: a clean secret must cost nothing */
  add("stored", v);
  /*  wrapped in quotes a shell did not strip.
      WARN NOT A REGEXP, AND THIS IS WHY. The first version built one by concatenation and put
      '([\\s\\S]*)' inside a SINGLE-QUOTED string, where \\s and \\S are just the letters s and S —
      so the pattern only ever matched a quoted value whose contents were entirely s and S. No test
      here could see it (the value this round had to recover was not quoted); CodeQL could, and did.
      Comparing the two characters says what is meant and says it better: the closing quote must be
      the SAME character as the opening one. */
  const QUOTES = ['"', "'", BACKTICK];
  if (v.length >= 2 && QUOTES.indexOf(v[0]) >= 0 && v[v.length - 1] === v[0]) add("dequoted", v.slice(1, -1));
  /* a whole NAME=value line, or a "key: value" copied out of a dashboard */
  const kv = v.match(/[=:][ \t]*([^=:\s]+)[ \t]*$/);
  if (kv) add("after-delimiter", kv[1]);
  /* the last path segment of a URL -- the page the key was read from */
  const u = v.match(/^[a-z][a-z0-9+.-]*:\/\/\S*?\/([^/?#\s]+)[/?#]*$/i);
  if (u) add("url-tail", u[1]);
  /* a UUID sitting inside something else */
  const uu = v.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (uu) add("uuid", uu[0]);
  /* the longest unbroken alphanumeric run */
  const runs = v.match(/[A-Za-z0-9]{16,}/g) || [];
  let longest = "";
  for (const r of runs) if (r.length > longest.length) longest = r;
  if (longest) add("longest-alnum", longest);
  return out;
}
/*  WARN (#R556) A WEBSOCKET FRAME IS TEXT OR IT IS BYTES, AND THE READER DOES NOT CHOOSE WHICH.
    Reading it as whatever it actually is costs nothing; assuming cost this layer every vessel
    outside the Baltic. Returns "" for a frame that carries no text, so the caller can tell
    "nothing to read" from "read it and it was not JSON". */
const FRAME_DECODER = new TextDecoder();
function frameText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return FRAME_DECODER.decode(new Uint8Array(data));
  if (ArrayBuffer.isView(data as any)) {
    const v = data as ArrayBufferView;
    return FRAME_DECODER.decode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
  }
  return "";
}
function shapeOf(k: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return "uuid";
  if (/^[0-9a-f]+$/i.test(k)) return "hex";
  if (/^[A-Za-z0-9]+$/.test(k)) return "alnum";
  return "other";
}
/* length and character CLASSES -- never a character of the value itself */
function credentialShape(rawV: string): Record<string, unknown> {
  const orig = String(rawV == null ? "" : rawV);
  const v = orig.trim();
  const cls: Record<string, number> = {
    alnum: 0, dash: 0, dot: 0, colon: 0, equals: 0, slash: 0, quote: 0, space: 0, other: 0,
  };
  for (const ch of v) {
    if (/[A-Za-z0-9]/.test(ch)) cls.alnum++;
    else if (ch === "-" || ch === "_") cls.dash++;
    else if (ch === ".") cls.dot++;
    else if (ch === ":") cls.colon++;
    else if (ch === "=") cls.equals++;
    else if (ch === "/") cls.slash++;
    else if (ch === '"' || ch === "'" || ch === BACKTICK) cls.quote++;
    else if (/\s/.test(ch)) cls.space++;
    else cls.other++;
  }
  return {
    len: v.length,
    rawLen: orig.length,
    classes: cls,
    candidates: credentialCandidates(v).map((c) => ({ form: c.form, len: c.key.length, shape: shapeOf(c.key) })),
  };
}

// ── state that survives between requests in one isolate ─────────────────────
//  Everything here is a CACHE that a cold isolate rebuilds from the shared snapshot — never a
//  source of truth. Supabase hands out cold isolates constantly (#R341 measured it, #R504 paid for
//  forgetting it), so nothing may depend on this surviving.
const STATE = {
  ships: new Map<number, any>(),   // mmsi → vessel
  builtAt: 0,
  built: "",
  oldestAt: 0,
  hydrated: false,
  saveNote: "",
  lastNote: "",
  /* (#R510) what happened to the WebSocket, in order. See the note in readAisstream. */
  wsTrace: [] as string[],
  /* (#R556) which candidate FORM aisstream accepted, once one has. A form, never a key. */
  credForm: "" as string,
  /* vessels per provider in the last refresh (or from the snapshot's `p`) — coverageLine reads it */
  counts: {} as Record<string, number>,
  stats: { refreshes: 0, served: 0, hydrated: 0, saved: 0, wsMessages: 0, wsVessels: 0, dtVessels: 0, fails: 0 },
};

function svcUrl(path: string): string {
  const base = (env("SUPABASE_URL") || "").replace(/\/$/, "");
  return base ? base + path : "";
}
function storageKey(): string {
  return env("AIS_STORAGE_KEY") || env("AVIATION_STORAGE_KEY") ||
    env("SUPABASE_SERVICE_ROLE_KEY") || env("SB_SECRET_KEY");
}

// ── the shared snapshot ─────────────────────────────────────────────────────
async function loadSnapshot(): Promise<any> {
  const u = svcUrl("/storage/v1/object/public/" + BUCKET + "/" + WORLD_OBJECT);
  if (!u) return null;
  try {
    const r = await fetch(u + "?t=" + Date.now(), { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const txt = await r.text();
    if (!txt || txt.length > SNAP_MAX_BYTES) return null;
    const j = JSON.parse(txt);
    return (j && j.v === 1) ? j : null;
  } catch (_) { return null; }
}

let BUCKET_TRIED = false;
async function ensureBucket(): Promise<void> {
  if (BUCKET_TRIED) return;
  BUCKET_TRIED = true;
  const key = storageKey(), u = svcUrl("/storage/v1/bucket");
  if (!key || !u) return;
  try {
    await fetch(u, {
      method: "POST",
      headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({
        id: BUCKET, name: BUCKET, public: true, file_size_limit: SNAP_MAX_BYTES,
        /* ⚠ BOTH TYPES, AND THE WRITE BELOW MUST BE ONE OF THEM. #R505's aviation bucket allows
           only octet-stream, so an honest `application/json` upload was refused with 415 and the
           write silently never happened while everything else looked fine. Declared here and
           checked against what is actually sent by tests/r507. */
        allowed_mime_types: ["application/json", "application/octet-stream"],
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (_) { /* the upload below reports the real outcome */ }
}

async function saveSnapshot(body: string): Promise<boolean> {
  const key = storageKey(), u = svcUrl("/storage/v1/object/" + BUCKET + "/" + WORLD_OBJECT);
  if (!key || !u || !body) return false;
  const put = () => fetch(u, {
    method: "POST",
    headers: {
      authorization: "Bearer " + key,
      "content-type": "application/json",
      "cache-control": "max-age=5",
      "x-upsert": "true",
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  try {
    let r = await put();
    if (r.ok) { STATE.saveNote = "ok"; return true; }
    /* ⚠ 400, NOT ONLY 404. Supabase Storage answers a PUT into a bucket that does not exist with
       HTTP 400 and code NoSuchBucket — measured (#R510), and a retry gated on 404 alone never fired,
       so the very first snapshot silently never persisted. */
    if (r.status === 404 || r.status === 400) { await ensureBucket(); r = await put(); }
    if (!r.ok) {
      let code = "";
      try { const j = JSON.parse(await r.text()); code = String((j && j.code) || "").slice(0, 40); } catch (_) { code = ""; }
      STATE.saveNote = "http" + r.status + (code ? ":" + code : "");
    } else STATE.saveNote = "ok-retry";
    return r.ok;
  } catch (e) { STATE.saveNote = "throw:" + ((e as any)?.name || "err"); return false; }
}

// ── normalising ─────────────────────────────────────────────────────────────
/*  ONE vessel shape, whatever answered. The browser's existing ship layer already draws exactly
 *  these fields (js/data-layers.js shipMaterialize), so nothing downstream has to learn a second
 *  vocabulary — which is how a product ends up with two answers to "what is a ship" (§22.1).
 */
function put(mmsi: number, patch: any, seenAt: number): void {
  if (!(mmsi > 0)) return;
  const prev = STATE.ships.get(mmsi);
  /* keep the FRESHER observation — two providers overlap in the Baltic by design */
  if (prev && prev.seenAt > seenAt) {
    /* …but identity is not a position: a name learned from either provider is kept */
    for (const k of ["name", "callsign", "imo", "dest", "draught", "shipType"]) {
      if (prev[k] == null && patch[k] != null) prev[k] = patch[k];
    }
    return;
  }
  const rec = prev || { mmsi };
  for (const k of Object.keys(patch)) if (patch[k] != null) rec[k] = patch[k];
  rec.seenAt = seenAt;
  STATE.ships.set(mmsi, rec);
}

function prune(nowMs: number): void {
  let oldest = 0;
  for (const [mmsi, rec] of STATE.ships) {
    if ((nowMs - rec.seenAt) / 1000 > STALE_DROP_S) { STATE.ships.delete(mmsi); continue; }
    if (!oldest || rec.seenAt < oldest) oldest = rec.seenAt;
  }
  STATE.oldestAt = oldest;
}

// ── provider: Digitraffic (keyless, the Baltic) ─────────────────────────────
async function readDigitraffic(nowMs: number): Promise<number> {
  const head = { "user-agent": DIGITRAFFIC_UA, "digitraffic-user": "IntMap/ais-feed", accept: "application/json" };
  let n = 0;
  try {
    const r = await fetchGuarded(DIGITRAFFIC_LOCATIONS, {
      timeoutMs: UPSTREAM_TIMEOUT_MS, maxBytes: 8 * 1024 * 1024, contentTypeRe: /json/i, headers: head,
    });
    if (!r.ok) { STATE.stats.fails++; return 0; }
    const j = JSON.parse(r.text());
    for (const f of (j && j.features) || []) {
      const p = f.properties || {}, g = f.geometry || {};
      const c = g.coordinates || [];
      if (!(c.length === 2) || c[0] == null || c[1] == null) continue;
      /* Digitraffic timestamps are epoch ms; a message from the future is a clock, not a ship */
      const t = Math.min(nowMs, Number(p.timestampExternal) || nowMs);
      put(Number(f.mmsi || p.mmsi), {
        lon: c[0], lat: c[1],
        sog: p.sog != null && p.sog < 102 ? p.sog : null,
        cog: p.cog != null && p.cog < 360 ? p.cog : null,
        /* 511 is AIS for "heading not available" — carrying it through would point every such
           vessel due north-by-151-degrees, which is a drawing of a value that means "unknown" */
        heading: (p.heading != null && p.heading < 360) ? p.heading : null,
        navStatus: p.navStat != null && p.navStat <= 15 ? p.navStat : null,
        src: "digitraffic",
      }, t);
      n++;
    }
  } catch (_) { STATE.stats.fails++; return 0; }
  /* …and the static half, joined by MMSI: name, call sign, IMO, type, destination, draught */
  try {
    const r = await fetchGuarded(DIGITRAFFIC_VESSELS, {
      timeoutMs: UPSTREAM_TIMEOUT_MS, maxBytes: 8 * 1024 * 1024, contentTypeRe: /json/i, headers: head,
    });
    if (r.ok) {
      const list = JSON.parse(r.text());
      for (const v of Array.isArray(list) ? list : []) {
        const mmsi = Number(v.mmsi);
        const rec = STATE.ships.get(mmsi);
        if (!rec) continue;
        if (v.name) rec.name = String(v.name).trim();
        if (v.callSign) rec.callsign = String(v.callSign).trim();
        if (v.imo) rec.imo = Number(v.imo);
        if (v.shipType != null) rec.shipType = Number(v.shipType);
        if (v.destination) rec.dest = String(v.destination).trim();
        /* Digitraffic reports draught in DECIMETRES; AIS and the browser's card use metres */
        if (v.draught != null) rec.draught = Number(v.draught) / 10;
      }
    }
  } catch (_) { /* positions without names are still ships */ }
  STATE.stats.dtVessels = n;
  return n;
}

// ── provider: aisstream.io (global, keyed) ──────────────────────────────────
/*  ⚠ A WEBSOCKET INSIDE A REQUEST, ON PURPOSE. #R341 measured that a promise handed to
 *  EdgeRuntime.waitUntil does NOT survive the response here, so a design that "keeps a stream open
 *  in the background" would look right in every single test and never collect a byte in production.
 *  What does work is a stream opened, drained and closed WITHIN one invocation.
 */
type Probe = { n: number; verdict: string };
type Attempt = { refused: Promise<boolean>; done: Promise<Probe> };
/*  WARN (#R556) ONE SOCKET PER CANDIDATE, AND IT IS THE SAME SOCKET THAT GOES ON TO DO THE WORK.
    The first version of this probed a candidate on one socket and then opened a SECOND to drain it,
    which is how a working credential ended up looking silent: aisstream caps a key at three
    concurrent connections and refuses the fourth WITHOUT SAYING ANYTHING (#R510) -- the exact
    picture of "open | sent | nothing" this was trying to interpret. So the decision and the drain
    now share one connection, and the next candidate is not opened until this one has closed. */
function attemptAisstream(cand: Cand, ms: number, decideMs: number, nowMs: number): Attempt {
  const key = cand.key;
  let markRefused: (v: boolean) => void = () => {};
  const refused = new Promise<boolean>((r) => { markRefused = r; });
  const done = new Promise<Probe>((resolve) => {
    let ws: WebSocket;
    let n = 0, done = false, rejected = false, frames = 0;
    /* ⚠ (#R510) THE SOCKET SAYS WHAT HAPPENED TO IT, AND THAT IS THE WHOLE DIFFERENCE BETWEEN
       "aisstream is not answering" AND "aisstream is refusing this key". Measured, both from here
       and from a laptop with a deliberately WRONG key, the refusal looks like this:

           open | sent | error | close:1006      ← and not one frame in between

       There is no error message to read, so without this trace the two are the same symptom.
       ⚠ THE KEY'S LENGTH AND SHAPE ARE REPORTED; THE KEY IS NOT. That was the fact that solved it:
       the stored secret measured 79 characters and was not alphanumeric, which is not the shape
       aisstream issues — the value had something else in it. A digest of the credential would have
       said nothing, and the credential itself must never reach a response, a log or a header. */
    STATE.wsTrace.push("try:" + cand.form + ":len" + key.length + ":" + shapeOf(key));
    /*  WARN (#R556) HOW THE SOCKET ENDED IS THE ANSWER, NOT HOW MANY FRAMES IT CARRIED.
        A REFUSED credential is closed on us within a moment and never sends anything (#R510:
        open | sent | error | close, zero frames). An ACCEPTED one simply stays open -- and may
        still be silent for the first seconds of a short probe, because the firehose starts when it
        starts. Judging a candidate by "did it deliver in 3 s" therefore throws away the credential
        that actually works, which is exactly what happened here before this was written. */
    const finish = (verdict: string) => {
      if (done) return;
      done = true;
      clearTimeout(decider);
      /* WARN (#R556) HOW MANY FRAMES ARRIVED IS ALWAYS SAID. Without it, "the socket stayed open"
         and "the socket stayed open and carried thousands of vessels we could not read" are the
         same line in the trace -- and only one of them is a credential problem. */
      STATE.wsTrace.push("end:" + verdict + ":frames" + frames + ":pos" + n);
      try { ws.close(); } catch (_) { /* already closing */ }
      STATE.stats.wsVessels = n;
      const v = rejected ? "rejected" : verdict;
      markRefused(n === 0 && v !== "alive" && v !== "full");
      resolve({ n, verdict: v });
    };
    const timer = setTimeout(() => finish("alive"), Math.max(1000, Math.min(WS_MS_MAX, ms)));
    /*  the decision point: a refusal has already happened by now, or it is not coming */
    const decider = setTimeout(() => markRefused(false), Math.max(500, Math.min(ms, decideMs)));
    try {
      ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
      /*  WARN (#R556) AISSTREAM SENDS BINARY FRAMES, AND A BINARY FRAME IS NOT A STRING.
          The default binaryType is "blob", so String(ev.data) on a delivered vessel is the literal
          text "[object Blob]" -- JSON.parse throws, the catch swallows it, and the layer shows an
          empty ocean while the socket is in fact carrying THOUSANDS of ships. Measured here:
          `end:alive:frames1224:pos0` with a credential that was working the whole time.
          Asking for arraybuffer makes the frame decodable synchronously; frameText below still
          handles a string, because nothing promises which one arrives. */
      ws.binaryType = "arraybuffer";
    } catch (_) { clearTimeout(timer); clearTimeout(decider); markRefused(true); resolve({ n: 0, verdict: "nosocket" }); return; }
    ws.onopen = () => {
      STATE.wsTrace.push("open:rs" + ws.readyState);
      try {
        ws.send(JSON.stringify({
          APIKey: key,
          /* the whole planet — this function's job is the world set, and a viewport is the
             browser's business */
          BoundingBoxes: [[[-90, -180], [90, 180]]],
          FilterMessageTypes: ["PositionReport", "ShipStaticData"],
        }));
        STATE.wsTrace.push("sent");
      } catch (e) { STATE.wsTrace.push("sendfail:" + String((e as any)?.message || "").slice(0, 60)); finish("sendfail"); }
    };
    ws.onmessage = (ev: MessageEvent) => {
      STATE.stats.wsMessages++; frames++;
      let m: any = null;
      const raw = frameText(ev.data);
      try { m = JSON.parse(raw); } catch (_) { if (frames <= 3) STATE.wsTrace.push("nonjson:" + raw.slice(0, 90)); return; }
      /* aisstream answers a bad subscription with an error object rather than a close reason */
      if (m && m.error) { if (frames <= 3) STATE.wsTrace.push("err:" + String(m.error).slice(0, 90)); rejected = true; return; }
      if (frames <= 3) STATE.wsTrace.push("msg:" + String((m && m.MessageType) || "?").slice(0, 30));
      const md = m.MetaData || m.metadata || {};
      const mmsi = Number(md.MMSI || md.mmsi);
      if (!(mmsi > 0)) return;
      const t = md.time_utc ? (Date.parse(md.time_utc) || nowMs) : nowMs;
      const seenAt = Math.min(nowMs, t);
      const body = m.Message || m.message || {};
      if (m.MessageType === "PositionReport") {
        const p = body.PositionReport || {};
        if (p.Latitude == null || p.Longitude == null) return;
        put(mmsi, {
          lon: p.Longitude, lat: p.Latitude,
          sog: p.Sog != null && p.Sog < 102 ? p.Sog : null,
          cog: p.Cog != null && p.Cog < 360 ? p.Cog : null,
          heading: (p.TrueHeading != null && p.TrueHeading < 360) ? p.TrueHeading : null,
          navStatus: p.NavigationalStatus != null && p.NavigationalStatus <= 15 ? p.NavigationalStatus : null,
          name: md.ShipName ? String(md.ShipName).trim() : null,
          src: "aisstream",
        }, seenAt);
        n++;
      } else if (m.MessageType === "ShipStaticData") {
        const p = body.ShipStaticData || {};
        const rec = STATE.ships.get(mmsi);
        if (!rec) return;   /* identity without a position is nothing to draw */
        if (p.Name) rec.name = String(p.Name).trim();
        if (p.CallSign) rec.callsign = String(p.CallSign).trim();
        if (p.Type != null) rec.shipType = Number(p.Type);
        if (p.Destination) rec.dest = String(p.Destination).trim();
        if (p.MaximumStaticDraught != null) rec.draught = Number(p.MaximumStaticDraught);
        if (p.ImoNumber != null) rec.imo = Number(p.ImoNumber);
      }
      if (STATE.ships.size >= AIS_MAX) finish("full");
    };
    ws.onerror = (e: any) => { STATE.wsTrace.push("error:" + String((e && e.message) || "").slice(0, 90)); finish("error"); };
    ws.onclose = (e: any) => { STATE.wsTrace.push("close:" + (e && e.code) + ":" + String((e && e.reason) || "").slice(0, 90)); clearTimeout(timer); finish("closed"); };
  });
  return { refused, done };
}

/*  WARN (#R556) ONE SECRET, SEVERAL CREDENTIALS TO TRY -- AND THE UPSTREAM DECIDES.
 *  aisstream refuses a wrong key with no message (#R510: open | sent | error | close, zero frames),
 *  so the only thing that can tell a good credential from a bad one is aisstream itself. This tries
 *  each candidate the stored value contains, SHORTLY, and stops at the first that delivers a frame.
 *
 *  WARN THE WINNING FORM IS REMEMBERED FOR THE ISOLATE, so the cost of probing is paid once per
 *  cold isolate, not once per refresh -- and a clean secret pays nothing at all, because "stored"
 *  is tried first and answers first.
 *
 *  WARN THE PROBING IS BUDGETED. A caller is waiting on this. Six candidates at the full window
 *  would hold an invocation open for two minutes; the budget is what stops that.
 */
const WS_DECIDE_MS = 3000;
const PROBE_BUDGET_MS = 25000;
/* aisstream allows three connections per key; opening the next candidate before the last one has
   let go is how a good credential gets refused in silence. This settles between attempts. */
const SOCKET_SETTLE_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function readAisstream(rawKey: string, ms: number, nowMs: number): Promise<number> {
  const cands = credentialCandidates(rawKey);
  if (!cands.length) { STATE.wsTrace.push("nocandidate"); return 0; }
  /* the form that worked last time goes first: a clean secret never pays for the others */
  cands.sort((a, b) => (b.form === STATE.credForm ? 1 : 0) - (a.form === STATE.credForm ? 1 : 0));
  const started = Date.now();
  for (const c of cands) {
    const at = attemptAisstream(c, ms, WS_DECIDE_MS, nowMs);
    const refused = await at.refused;
    if (!refused) {
      STATE.credForm = c.form;
      const r = await at.done;      /* the SAME socket goes on to drain the full window */
      return r.n;
    }
    await at.done;                  /* let the refused socket go before opening another */
    if (STATE.credForm === c.form) STATE.credForm = "";
    await sleep(SOCKET_SETTLE_MS);
    if (Date.now() - started > PROBE_BUDGET_MS) { STATE.wsTrace.push("budget"); break; }
  }
  return 0;
}

// ── building the wire form ──────────────────────────────────────────────────
/*  Compact arrays rather than objects: at several thousand vessels the key names ARE the payload.
 *  The identity half travels separately because a name changes at most once a voyage while a
 *  position changes every message — the same split the aviation codec makes, for the same reason.
 */
/*  WARN (#R556) THE SET SAYS HOW FAR IT REACHES, AND IT SAYS IT FROM THE VESSELS THEMSELVES.
    An empty answer is two completely different facts -- "no ship is there" and "nothing here can
    see there" -- and a reader shown an empty ocean cannot tell them apart (#R510 fixed exactly this
    for the coverage HEADER and left the browser with no way to act on it). The envelope of the
    vessels actually held is the honest, derived answer: no place name, no hardcoded sea, nothing to
    go stale. The day aisstream answers, this IS the world and the note stops appearing on its own.
    WARN IT CAN ONLY OVER-CLAIM. An envelope covers gaps inside it, so a sparse sea inside the box
    reads as "covered, and empty" -- which is the safe direction: it never tells a reader that a sea
    this function can actually see is out of range. */
function coverageBox(): number[] | null {
  let w = 181, e = -181, s2 = 91, n2 = -91, seen = 0;
  for (const rec of STATE.ships.values()) {
    if (rec.lon == null || rec.lat == null) continue;
    if (rec.lon < w) w = rec.lon;
    if (rec.lon > e) e = rec.lon;
    if (rec.lat < s2) s2 = rec.lat;
    if (rec.lat > n2) n2 = rec.lat;
    seen++;
  }
  if (!seen) return null;
  const r = (x: number) => Math.round(x * 100) / 100;
  return [r(w), r(s2), r(e), r(n2)];
}

function build(nowMs: number): string {
  const a: any[] = [];
  const id: any[] = [];
  for (const rec of STATE.ships.values()) {
    if (a.length >= AIS_MAX) break;
    if (rec.lon == null || rec.lat == null) continue;
    a.push(row(rec, nowMs));
    const ir = idRow(rec); if (ir) id.push(ir);
  }
  /* `p` = how many vessels each provider contributed to the LAST refresh, carried in the snapshot
     so a cold isolate that only hydrated can still say what its set is made of (coverageLine) */
  /* `cf` is the candidate FORM the upstream accepted — a word like "after-delimiter", never a
     credential. Supabase hands out cold isolates constantly (#R341/#R504), and without this every
     one of them re-tries the broken stored value first, burning a socket and seconds of the
     listening window on a candidate that is already known to be refused. */
  return JSON.stringify({ v: 1, t: nowMs, n: a.length, a, id, p: STATE.counts, cov: coverageBox(), cf: STATE.credForm || undefined });
}

function hydrate(j: any): number {
  if (!j || !Array.isArray(j.a)) return 0;
  const nowMs = Date.now();
  if (typeof j.cf === "string" && /^[a-z-]{1,32}$/.test(j.cf)) STATE.credForm = j.cf;
  if (j.p && typeof j.p === "object") {
    const c: Record<string, number> = {};
    for (const k of Object.keys(j.p)) if (/^[a-z]+$/.test(k) && Number(j.p[k]) >= 0) c[k] = Number(j.p[k]);
    STATE.counts = c;
  }
  const names = new Map<number, any[]>();
  for (const it of (j.id || [])) names.set(Number(it[0]), it);
  let n = 0;
  for (const row of j.a) {
    const mmsi = Number(row[0]);
    const seenAt = nowMs - (Number(row[8]) || 0) * 1000;
    if ((nowMs - seenAt) / 1000 > STALE_DROP_S) continue;
    const idr = names.get(mmsi);
    STATE.ships.set(mmsi, {
      mmsi, lon: row[1], lat: row[2], sog: row[3], cog: row[4], heading: row[5],
      navStatus: row[6], shipType: row[7], seenAt,
      name: idr ? idr[1] : "", callsign: idr ? idr[2] : "", imo: idr ? idr[3] : 0,
      dest: idr ? idr[4] : "", draught: idr ? idr[5] : 0, src: "snapshot",
    });
    n++;
  }
  STATE.builtAt = Number(j.t) || nowMs;
  prune(nowMs);
  return n;
}

function ensureHydrated(): Promise<number> {
  if (STATE.hydrated) return Promise.resolve(0);
  STATE.hydrated = true;
  return loadSnapshot().then((j) => {
    const n = hydrate(j);
    STATE.stats.hydrated = n;
    return n;
  }).catch(() => 0);
}

function providers(): string[] {
  const out: string[] = ["digitraffic"];
  if (env("AISSTREAM_API_KEY")) out.push("aisstream");
  return out;
}

async function refresh(wsMs: number): Promise<void> {
  const now = Date.now();
  const key = env("AISSTREAM_API_KEY");
  const notes: string[] = [];
  /* Digitraffic first and awaited: it is two plain HTTP reads and it is the half that works
     without a credential, so a broken key can never take the layer down. */
  const dt = await readDigitraffic(now);
  notes.push("digitraffic=" + dt);
  const counts: Record<string, number> = { digitraffic: dt };
  if (key) {
    STATE.wsTrace = [];
    const got = await readAisstream(key, wsMs, now);
    counts.aisstream = got;
    notes.push("aisstream=" + got + "[" + STATE.wsTrace.join("|") + "]");
  } else {
    notes.push("aisstream=nokey");
  }
  STATE.counts = counts;
  prune(Date.now());
  STATE.stats.refreshes++;
  STATE.builtAt = Date.now();
  STATE.built = build(STATE.builtAt);
  STATE.lastNote = notes.join(",");
  /* ⚠ AN EMPTY SET IS NEVER WRITTEN OVER THE SHARED ONE (#R504). Every path in here can end with
     nothing — the key expired, both providers refused, Storage was unreachable during hydration —
     and in all of those the snapshot on disk is the best knowledge that exists. Overwriting it with
     zero ships would take the layer down for every visitor at once and look like an outage at sea. */
  if (STATE.ships.size && await saveSnapshot(STATE.built)) STATE.stats.saved++;
}

/* ⚠ ONE REFRESH AT A TIME PER ISOLATE. Every caller past the TTL would otherwise open its own
   firehose socket, and aisstream caps a key at three concurrent connections — the fourth is
   refused with no message, which is exactly the shape of a rejected key (readAisstream). */
let INFLIGHT: Promise<void> | null = null;
function refreshOnce(wsMs: number): Promise<void> {
  if (INFLIGHT) return INFLIGHT;
  INFLIGHT = refresh(wsMs).finally(() => { INFLIGHT = null; });
  return INFLIGHT;
}

/* `w,s,e,n` in degrees; w > e means the box crosses the antimeridian (the same reading as
   _shared/aviation-model.js lonInSpan). Anything else is "no box", never an error: a malformed
   bbox is served the world, which is what the caller would have got before the parameter existed. */
function parseBbox(s: string | null): number[] | null {
  if (!s) return null;
  const v = s.split(",").map(Number);
  if (v.length !== 4 || v.some((x) => !isFinite(x))) return null;
  const [w, sLat, e, n] = v;
  if (sLat > n || sLat < -90 || n > 90 || w < -180 || w > 180 || e < -180 || e > 180) return null;
  return [w, sLat, e, n];
}
function lonInSpan(lon: number, w: number, e: number): boolean {
  let span = e - w;
  if (!(span > 0)) span += 360;
  if (span >= 360) return true;
  return ((((lon - w) % 360) + 360) % 360) <= span;
}
function row(rec: any, nowMs: number): any[] {
  return [
    rec.mmsi,
    Math.round(rec.lon * 1e5) / 1e5,
    Math.round(rec.lat * 1e5) / 1e5,
    rec.sog != null ? Math.round(rec.sog * 10) / 10 : null,
    rec.cog != null ? Math.round(rec.cog * 10) / 10 : null,
    rec.heading != null ? Math.round(rec.heading) : null,
    rec.navStatus != null ? rec.navStatus : null,
    rec.shipType != null ? rec.shipType : null,
    Math.max(0, Math.round((nowMs - rec.seenAt) / 1000)),
  ];
}
function idRow(rec: any): any[] | null {
  if (!(rec.name || rec.callsign || rec.imo || rec.dest)) return null;
  return [rec.mmsi, rec.name || "", rec.callsign || "", rec.imo || 0, rec.dest || "", rec.draught || 0];
}
function buildInBox(box: number[], nowMs: number): { text: string; n: number } {
  const [w, s, e, n] = box;
  const a: any[] = [], id: any[] = [];
  for (const rec of STATE.ships.values()) {
    if (rec.lon == null || rec.lat == null) continue;
    if (rec.lat < s || rec.lat > n || !lonInSpan(rec.lon, w, e)) continue;
    a.push(row(rec, nowMs));
    const ir = idRow(rec); if (ir) id.push(ir);
  }
  /* `cov` describes the WHOLE set, never the box that was asked for: a caller who got nothing needs
     to know what this function can see, not what it just failed to find. */
  return { text: JSON.stringify({ v: 1, t: nowMs, n: a.length, a, id, p: STATE.counts, cov: coverageBox() }), n: a.length };
}
/* what ACTUALLY answered, by count — not which providers are configured. A configured key that
   aisstream refuses contributes 0, and saying "digitraffic+aisstream" over a Baltic-only set would
   present the empty Pacific as fact about the sea (§25.2). */
function coverageLine(): string {
  const c = STATE.counts || {};
  const parts = Object.keys(c).filter((k) => c[k] > 0).map((k) => k + ":" + c[k]);
  return parts.length ? parts.join("+") : "none";
}

function hdr(v: unknown): string {
  return String(v == null ? "" : v)
    .replace(/[‐-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^ -~]/g, "");
}

// ── request ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const gate = methodGate(req, CORS);
  if (gate) return gate;
  const url = new URL(req.url);
  const now = Date.now();

  try {
    await ensureHydrated();

    if (url.searchParams.get("meta") === "1" || url.searchParams.get("ch") === "meta") {
      return new Response(JSON.stringify({
        providers: providers(),
        attribution: providers().map((p) => (ATTRIBUTION as any)[p]).filter(Boolean),
        aisstreamConfigured: !!env("AISSTREAM_API_KEY"),
        /* (#R556) PRESENCE AND SHAPE, NEVER THE VALUE -- length and character classes only, plus
           which derived candidates exist. This is what says whether a refused key is the wrong
           credential or a right one with something wrapped around it. */
        aisstreamCredential: {
          ...credentialShape(Deno.env.get("AISSTREAM_API_KEY") || ""),
          acceptedForm: STATE.credForm || null,
        },
        world: {
          ships: STATE.ships.size,
          ageMs: STATE.builtAt ? now - STATE.builtAt : null,
          oldestMs: STATE.oldestAt ? now - STATE.oldestAt : 0,
          byProvider: STATE.counts,
          coverage: coverageLine(),
        },
        channels: ["world", "view (?bbox=w,s,e,n)", "meta"],
        upstream: STATE.stats,
        lastRefresh: STATE.lastNote,
        /* PRESENCE ONLY, NEVER VALUES (#R341) — whether the credentials this function needs exist */
        storage: {
          bucket: BUCKET, hasUrl: !!env("SUPABASE_URL"),
          hasKey: !!storageKey(), save: STATE.saveNote,
        },
        limits: { worldTtlMs: WORLD_TTL_MS, staleDropS: STALE_DROP_S, wsMsDefault: WS_MS_DEFAULT, wsMsMax: WS_MS_MAX, aisMax: AIS_MAX },
      }), { headers: { ...CORS, "content-type": "application/json", "cache-control": "no-store" } });
    }

    const force = url.searchParams.get("refresh") === "1";
    const wsMs = Math.max(1000, Math.min(WS_MS_MAX, Number(url.searchParams.get("ws")) || WS_MS_DEFAULT));
    let age = STATE.builtAt ? now - STATE.builtAt : Infinity;

    /* ⚠ A WARM ISOLATE MUST REFRESH ON ITS OWN. The first version of this handler refreshed only
       when forced, when it held nothing, or when it held nothing AND was stale — so an isolate that
       had built once served the same bytes for its whole life, and nothing else ever asked it to
       refresh (there is no ship sweeper; the aviation one runs about six times a day, #R504).
       Measured in production before this change: one refresh, then `x-intmap-age-ms` climbing for
       as long as the isolate lived. "Live ships" that stop moving when the server is warm is the
       exact opposite of what a warm server is for. So: past the TTL, the caller waits for ONE
       refresh — a few seconds, once per TTL, shared by everyone through `inflight` — and is then
       served fresh bytes. Serving stale and refreshing "after" is not an option here: nothing runs
       after the response (#R341). */
    if (force || !STATE.built || age > WORLD_TTL_MS) {
      await refreshOnce(wsMs);
      age = Date.now() - STATE.builtAt;
    }

    if (!STATE.built) STATE.built = build(now);
    STATE.stats.served++;
    const prov = providers();
    /* (#R510) THE VIEW CHANNEL. `?bbox=w,s,e,n` answers only the vessels inside that box. The world
       set is what this function keeps, but it is not what a browser looking at one strait needs,
       and at global scale the whole set is megabytes per poll — the same reason aviation-feed has a
       view channel. Without a bbox the whole set is served, exactly as before. */
    const box = parseBbox(url.searchParams.get("bbox"));
    const body = box ? buildInBox(box, Date.now()) : { text: STATE.built, n: STATE.ships.size };
    return new Response(body.text, {
      headers: {
        ...CORS,
        "content-type": "application/json",
        "cache-control": "public, max-age=" + Math.round(WORLD_TTL_MS / 1000) +
          ", stale-while-revalidate=60, stale-if-error=300",
        "x-intmap-provider": hdr(prov.join("+")),
        "x-intmap-attribution": hdr(prov.map((p) => (ATTRIBUTION as any)[p]).filter(Boolean).join(" | ")),
        "x-intmap-count": String(body.n),
        "x-intmap-world": String(STATE.ships.size),
        "x-intmap-channel": box ? "view" : "world",
        "x-intmap-age-ms": String(isFinite(age) ? Math.max(0, Math.round(age)) : 0),
        "x-intmap-oldest-ms": String(STATE.oldestAt ? Math.max(0, now - STATE.oldestAt) : 0),
        "x-intmap-coverage": hdr(coverageLine()),
        "x-intmap-save": hdr(STATE.saveNote),
        "x-intmap-note": hdr(STATE.lastNote),
      },
    });
  } catch (e) {
    /* the caller learns THAT the upstream failed, never what the exception said (#R341) */
    return relayFail(e, CORS);
  }
});
