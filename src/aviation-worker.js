/* ============================================================================
 *  IntMap · aviation worker — the whole aircraft store, off the main thread  (#R341)
 * ----------------------------------------------------------------------------
 *  WHAT RUNS HERE, AND WHY IT IS NOT ON THE PAGE
 *  ---------------------------------------------
 *  Fetching, decoding, merging, ageing, filtering and packing tens of thousands of aircraft is
 *  per-aircraft work that arrives every few seconds and must never land in a frame. The layer this
 *  replaces did all of it on the main thread and then handed MapLibre a freshly-built GeoJSON
 *  FeatureCollection, which is a second full pass over the same aircraft inside the renderer.
 *
 *  Here the main thread receives ONE message carrying seven Float32Arrays already in the exact
 *  layout js/aircraft-points.js binds to the GPU, TRANSFERRED rather than copied. Its only work is
 *  to hand them to the engine. Everything below — including the search index and the pick grid —
 *  never touches it.
 *
 *  THE STORE IS SLOTTED, NOT REBUILT
 *  ---------------------------------
 *  Aircraft appear, move and disappear continuously, so the store is a slab of parallel typed
 *  arrays with a free list and a hex→slot index. An update writes to a slot; an arrival takes one
 *  from the free list or grows the slab; a departure returns one. Nothing is reallocated per
 *  update, and an aircraft keeps the same slot for its whole life, which is what makes velocity
 *  (and therefore smooth motion) possible at all.
 *
 *  VELOCITY IS DERIVED FROM THE REPORT, NOT FROM TWO REPORTS
 *  --------------------------------------------------------
 *  A first-differenced velocity needs two sightings, so an aircraft would sit still for one whole
 *  publish after appearing — and would jump when a late position arrived. Ground speed and track
 *  are in the very first report, so the velocity is exact from the first frame:
 *
 *      east  = gs·sin(track)      north = gs·cos(track)      [metres/second]
 *      scale = 1 / (MERC_CIRC·cos φ)                          [mercator units per metre]
 *
 *  Web mercator is conformal, so that one scale is right for both axes; y is negated because
 *  mercator y grows southward.
 *
 *  ⚠ NOTHING HERE INVENTS DATA. A missing altitude stays NaN, a missing position keeps the
 *  aircraft out of the packed buffers entirely, and an aircraft that has aged past the drop
 *  horizon is removed and reported as removed. There is no synthetic fallback in this file and
 *  there must never be one (§25.1) — a failed fetch keeps the last real data and says it is stale.
 * ==========================================================================*/
import '../js/aviation-codec.js';
import '../js/aviation-model.js';

const CODEC = globalThis.IntMapAviationCodec;
const MODEL = globalThis.IntMapAviationModel;

const MERC_CIRC = 2 * Math.PI * 6378137;
const D2R = Math.PI / 180;
const KT_MS = 0.514444;
const FT_M = 0.3048;
const FPM_MS = FT_M / 60;

/* An aircraft the feed has stopped mentioning is dropped here too, so the client's picture cannot
   drift away from the server's. Longer than the server's own horizon on purpose: the client must
   not delete an aircraft the next snapshot would have re-confirmed. */
const CLIENT_DROP_S = 1200;

/* ── the slab ───────────────────────────────────────────────────────────── */
const S = {
  cap: 0, n: 0,                 // capacity, and the highest slot ever used
  icao: null, mx: null, my: null, vx: null, vy: null,
  altFt: null, altV: null, track: null, gs: null, vr: null,
  seenAt: null, flags: null, cat: null, live: null,
  free: [],
  index: new Map(),             // icao (number) → slot
  ident: new Map(),             // icao → {callsign,type,registration,operator}
  seq: 0, serverTimeMs: 0, provider: '', attribution: '', coverage: '', ageMs: 0, oldestMs: 0,
};

function grow(need) {
  if (need <= S.cap) return;
  /* Doubling, from a first allocation big enough that a normal view never reallocates at all. */
  let cap = S.cap || 4096;
  while (cap < need) cap *= 2;
  const f32 = (old) => { const a = new Float32Array(cap); if (old) a.set(old); return a; };
  const u32 = (old) => { const a = new Uint32Array(cap); if (old) a.set(old); return a; };
  const u8 = (old) => { const a = new Uint8Array(cap); if (old) a.set(old); return a; };
  const f64 = (old) => { const a = new Float64Array(cap); if (old) a.set(old); return a; };
  S.icao = u32(S.icao); S.mx = f32(S.mx); S.my = f32(S.my);
  S.vx = f32(S.vx); S.vy = f32(S.vy);
  S.altFt = f32(S.altFt); S.altV = f32(S.altV); S.track = f32(S.track);
  S.gs = f32(S.gs); S.vr = f32(S.vr);
  S.seenAt = f64(S.seenAt); S.flags = u8(S.flags); S.cat = u8(S.cat); S.live = u8(S.live);
  S.cap = cap;
}

function slotFor(icao) {
  const have = S.index.get(icao);
  if (have !== undefined) return have;
  let slot;
  if (S.free.length) slot = S.free.pop();
  else { grow(S.n + 1); slot = S.n++; }
  S.index.set(icao, slot);
  S.live[slot] = 1;
  return slot;
}

function release(icao) {
  const slot = S.index.get(icao);
  if (slot === undefined) return false;
  S.index.delete(icao);
  S.live[slot] = 0;
  S.free.push(slot);
  return true;
}

/* ── applying a decoded message ─────────────────────────────────────────── */
function apply(msg, nowMs, recordTracks) {
  let added = 0, updated = 0, removed = 0, invalid = 0;

  for (let i = 0; i < msg.count; i++) {
    const f = msg.flags[i];
    if (!(f & CODEC.AC_POS_VALID)) { invalid++; continue; }
    const icao = msg.icao[i];
    const isNew = !S.index.has(icao);
    const slot = slotFor(icao);
    if (isNew) added++; else updated++;

    S.icao[slot] = icao;
    S.mx[slot] = msg.mx[i];
    S.my[slot] = msg.my[i];
    S.altFt[slot] = msg.alt[i];
    S.track[slot] = msg.track[i];
    S.gs[slot] = msg.gs[i];
    S.vr[slot] = msg.vr[i];
    S.flags[slot] = f;
    S.cat[slot] = msg.cat[i];
    /* The OBSERVATION time, reconstructed from the age the server measured — not the moment this
       message arrived. Everything downstream that says "N seconds old" reads this. */
    S.seenAt[slot] = nowMs - msg.age[i] * 1000;

    /* Velocity, in mercator units per second. See the header for the derivation. */
    const lat = msg.lat[i];
    const cos = Math.cos(lat * D2R);
    const scale = 1 / Math.max(1, MERC_CIRC * (cos > 1e-4 ? cos : 1e-4));
    const spd = (msg.gs[i] || 0) * KT_MS;
    const tr = (msg.track[i] || 0) * D2R;
    if (f & CODEC.AC_ON_GROUND) {
      /* An aircraft on the ground at a gate reports a track it is not following. Extrapolating it
         walks parked aircraft across the apron between publishes. */
      S.vx[slot] = 0; S.vy[slot] = 0;
    } else {
      S.vx[slot] = spd * Math.sin(tr) * scale;
      S.vy[slot] = -spd * Math.cos(tr) * scale;
    }
    S.altV[slot] = (msg.vr[i] || 0) * FPM_MS;

    if (recordTracks) trackRecord(icao, S.seenAt[slot], msg.mx[i], msg.my[i], msg.alt[i]);
  }

  for (let r = 0; r < msg.remove.length; r++) {
    if (release(msg.remove[r])) removed++;
  }

  for (const it of msg.identity) {
    const n = CODEC.hexToNum(it.hex);
    if (n) S.ident.set(n, it);
  }

  /* Age out anything the feed has stopped mentioning. Walking the index is O(live aircraft) and
     runs once per publish, not per frame. */
  const horizon = nowMs - CLIENT_DROP_S * 1000;
  for (const [icao, slot] of S.index) {
    if (S.seenAt[slot] < horizon) { release(icao); removed++; }
  }

  S.seq = msg.seq;
  S.serverTimeMs = msg.serverTimeMs;
  return { added, updated, removed, invalid };
}

/* ── observed tracks ────────────────────────────────────────────────────────
 *  The layer this replaces recorded a track for every aircraft the sweep returned (TRACK_MAX 400
 *  points, TRACK_TTL 20 min) so that selecting one showed where it had already been rather than
 *  starting a fresh line. That behaviour is kept — it is a real feature and CONSTITUTION §0.3
 *  forbids shrinking one — but it cannot be kept UNBOUNDED: at 50,000 aircraft a 400-point history
 *  each is gigabytes.
 *
 *  So: a fixed slab of ring buffers, least-recently-updated evicted, and tracks recorded only for
 *  aircraft that arrive on the VIEWPORT channel. That is exactly the scope the old sweep had — it
 *  only ever saw the viewport — so nothing that used to have a history loses one.
 *
 *  ⚠ ONLY RECEIVED OBSERVATIONS GO IN HERE. The shader's extrapolated positions are a display
 *  convenience, not evidence, and §17.1 forbids storing them as history.
 */
const TRACK = {
  cap: 2000, per: 64,
  slot: new Map(),            // icao → track slot
  icao: null, t: null, x: null, y: null, a: null, head: null, count: null, used: null,
  next: 0,
};
function trackInit() {
  if (TRACK.t) return;
  const N = TRACK.cap * TRACK.per;
  TRACK.icao = new Uint32Array(TRACK.cap);
  TRACK.head = new Uint16Array(TRACK.cap);
  TRACK.count = new Uint16Array(TRACK.cap);
  TRACK.used = new Float64Array(TRACK.cap);
  TRACK.t = new Float64Array(N);
  TRACK.x = new Float32Array(N);
  TRACK.y = new Float32Array(N);
  TRACK.a = new Float32Array(N);
}
function trackSlot(icao, nowMs) {
  trackInit();
  let ts = TRACK.slot.get(icao);
  if (ts !== undefined) { TRACK.used[ts] = nowMs; return ts; }
  if (TRACK.next < TRACK.cap) ts = TRACK.next++;
  else {
    /* evict the least recently updated — never the selected aircraft, whose history is the one
       the user is actually looking at */
    let oldest = 0, oldestT = Infinity;
    for (let i = 0; i < TRACK.cap; i++) {
      if (TRACK.icao[i] === SELECTED) continue;
      if (TRACK.used[i] < oldestT) { oldestT = TRACK.used[i]; oldest = i; }
    }
    ts = oldest;
    TRACK.slot.delete(TRACK.icao[ts]);
  }
  TRACK.icao[ts] = icao; TRACK.head[ts] = 0; TRACK.count[ts] = 0; TRACK.used[ts] = nowMs;
  TRACK.slot.set(icao, ts);
  return ts;
}
function trackRecord(icao, tMs, mx, my, altFt) {
  const ts = trackSlot(icao, tMs);
  const base = ts * TRACK.per;
  if (TRACK.count[ts]) {
    /* the same position twice is not two observations — the old path de-duplicated here too */
    const last = base + ((TRACK.head[ts] + TRACK.per - 1) % TRACK.per);
    if (TRACK.x[last] === mx && TRACK.y[last] === my) return;
    if (tMs <= TRACK.t[last]) return;          // never record backwards in time
  }
  const at = base + TRACK.head[ts];
  TRACK.t[at] = tMs; TRACK.x[at] = mx; TRACK.y[at] = my; TRACK.a[at] = altFt;
  TRACK.head[ts] = (TRACK.head[ts] + 1) % TRACK.per;
  if (TRACK.count[ts] < TRACK.per) TRACK.count[ts]++;
}
function trackOf(hex) {
  const icao = CODEC.hexToNum(hex);
  const ts = TRACK.slot.get(icao);
  if (ts === undefined || !TRACK.count[ts]) return [];
  const base = ts * TRACK.per, n = TRACK.count[ts];
  const start = (TRACK.head[ts] - n + TRACK.per) % TRACK.per;
  const out = [];
  for (let k = 0; k < n; k++) {
    const i = base + ((start + k) % TRACK.per);
    out.push({ t: TRACK.t[i], lon: mx2lon(TRACK.x[i]), lat: my2lat(TRACK.y[i]), altFt: TRACK.a[i] });
  }
  return out;
}

/* ── filtering ──────────────────────────────────────────────────────────── */
/*  A filter is evaluated once per aircraft per publish, in this worker, and its result is the
 *  packed buffer itself — there is no second "filtered copy" of the fleet and no per-aircraft
 *  object anywhere in the path. */
const FILTER = {
  kind: 'all',            // all | civil | military
  emergencyOnly: false,
  groundOnly: false,
  airborneOnly: false,
  minAltFt: null, maxAltFt: null,
  minGsKt: null, maxGsKt: null,
  maxAgeS: null,
  hideSurfaceVehicles: true,   // C1/C2 are ground vehicles, not aircraft
  hideObstacles: true,
  categories: null,            // null = every category
  hexes: null,                 // a Set of icao numbers, for "watchlist only" and search results
};

function passes(slot, nowMs) {
  const f = S.flags[slot];
  if (FILTER.kind === 'military' && !(f & CODEC.AC_MILITARY)) return false;
  if (FILTER.kind === 'civil' && (f & CODEC.AC_MILITARY)) return false;
  if (FILTER.emergencyOnly && !(f & CODEC.AC_EMERGENCY)) return false;
  if (FILTER.groundOnly && !(f & CODEC.AC_ON_GROUND)) return false;
  if (FILTER.airborneOnly && (f & CODEC.AC_ON_GROUND)) return false;

  const cat = S.cat[slot];
  if (FILTER.hideSurfaceVehicles && MODEL.isSurfaceVehicle(cat)) return false;
  if (FILTER.hideObstacles && MODEL.isObstacle(cat)) return false;
  if (FILTER.categories && !FILTER.categories.has(cat)) return false;

  if (FILTER.minAltFt != null || FILTER.maxAltFt != null) {
    const a = S.altFt[slot];
    /* An unknown altitude cannot satisfy an altitude filter. Treating NaN as 0 would sweep every
       aircraft with no altitude report into "below 10,000 ft". */
    if (!(a === a)) return false;
    if (FILTER.minAltFt != null && a < FILTER.minAltFt) return false;
    if (FILTER.maxAltFt != null && a > FILTER.maxAltFt) return false;
  }
  if (FILTER.minGsKt != null && S.gs[slot] < FILTER.minGsKt) return false;
  if (FILTER.maxGsKt != null && S.gs[slot] > FILTER.maxGsKt) return false;
  if (FILTER.maxAgeS != null && (nowMs - S.seenAt[slot]) / 1000 > FILTER.maxAgeS) return false;
  if (FILTER.hexes && !FILTER.hexes.has(S.icao[slot])) return false;
  return true;
}

/* ── colour ─────────────────────────────────────────────────────────────── */
/*  The palette is the layer's existing one: #R244 fixed PLANE_CIV / PLANE_MIL and three test files
 *  pin those two values, so they are carried over verbatim rather than re-chosen. What is new is
 *  the ALTITUDE ramp — at world zoom a single cyan makes a continent one flat smear, and height is
 *  the cheapest dimension that separates cruise from approach. */
const COL = {
  civLow: [0x35, 0xE0, 0xFF], civHigh: [0x00, 0x8C, 0xFF],
  mil: [0xFF, 0x30, 0x40],
  emerg: [0xFF, 0xD2, 0x3F],
  sel: [0xFF, 0xD2, 0x3F],
  ground: [0x8A, 0x9B, 0xB0],
};
let SELECTED = 0;

function writeColour(out, o, slot, staleMul) {
  const f = S.flags[slot];
  let c;
  if (S.icao[slot] === SELECTED) c = COL.sel;
  else if (f & CODEC.AC_EMERGENCY) c = COL.emerg;
  else if (f & CODEC.AC_MILITARY) c = COL.mil;
  else if (f & CODEC.AC_ON_GROUND) c = COL.ground;
  else {
    const a = S.altFt[slot];
    /* Unknown altitude sits at the low end and is NOT interpolated to a middle colour — a made-up
       midpoint would read as a measurement. */
    const t = (a === a) ? Math.max(0, Math.min(1, a / 40000)) : 0;
    c = [
      COL.civLow[0] + (COL.civHigh[0] - COL.civLow[0]) * t,
      COL.civLow[1] + (COL.civHigh[1] - COL.civLow[1]) * t,
      COL.civLow[2] + (COL.civHigh[2] - COL.civLow[2]) * t,
    ];
  }
  out[o] = c[0] / 255; out[o + 1] = c[1] / 255; out[o + 2] = c[2] / 255;
  out[o + 3] = staleMul;
}

/* ── packing for the GPU ────────────────────────────────────────────────── */
/*  Produces exactly the arrays js/aircraft-points.js binds. Called once per publish and once per
 *  filter change — never per frame, because the shader carries the motion. */
function pack(nowMs, liftAltitude) {
  /* One counting pass, then one writing pass. Counting first means the buffers are allocated at
     the exact size, so nothing is transferred that the GPU will not read. */
  let n = 0;
  for (const slot of S.index.values()) if (passes(slot, nowMs)) n++;

  const pos = new Float32Array(n * 2);
  const vel = new Float32Array(n * 2);
  const alt = new Float32Array(n);
  const altv = new Float32Array(n);
  const ms = new Float32Array(n);
  const col = new Float32Array(n * 4);
  const form = new Float32Array(n * 2);
  const ids = new Uint32Array(n);          // slot order → icao, so a pick can name what it hit

  let k = 0;
  for (const slot of S.index.values()) {
    if (!passes(slot, nowMs)) continue;
    const ageS = (nowMs - S.seenAt[slot]) / 1000;

    pos[k * 2] = S.mx[slot]; pos[k * 2 + 1] = S.my[slot];
    vel[k * 2] = S.vx[slot]; vel[k * 2 + 1] = S.vy[slot];

    if (liftAltitude) {
      const a = S.altFt[slot];
      alt[k] = (a === a) ? a * FT_M : 0;
      altv[k] = S.altV[slot];
    } else { alt[k] = 0; altv[k] = 0; }

    /* metres → mercator units at this aircraft's latitude, recovered from its mercator y rather
       than kept as a third copy of the latitude. */
    const lat = my2lat(S.my[slot]);
    ms[k] = 1 / Math.max(1, MERC_CIRC * Math.max(1e-4, Math.cos(lat * D2R)));

    /* A stale aircraft fades rather than vanishing: it IS still the last thing we know, and a
       disappearing glyph would read as "it landed". §25.2 item 9. */
    const fresh = MODEL.freshness(ageS);
    const staleMul = fresh === 'live' ? 1 : (fresh === 'lagging' ? 0.72 : 0.4);
    writeColour(col, k * 4, slot, staleMul);

    const f = S.flags[slot];
    let size = 1;
    if (S.icao[slot] === SELECTED) size = 1.75;
    else if (f & CODEC.AC_EMERGENCY) size = 1.4;
    else if (f & CODEC.AC_MILITARY) size = 1.15;
    form[k * 2] = size;
    form[k * 2 + 1] = (S.track[slot] || 0) * D2R;

    ids[k] = S.icao[slot];
    k++;
  }
  return { pos, vel, alt, altv, ms, col, form, ids, n };
}

function my2lat(y) {
  return (Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) * 2 - Math.PI / 2) / D2R;
}

/* ── search ─────────────────────────────────────────────────────────────── */
/*  Local search over what is already loaded, answered from the identity table. Exact matches
 *  first, then prefix, then substring — a controller typing "ANA2" wants ANA2xx before an aircraft
 *  whose registration happens to contain those letters. */
function search(q, limit) {
  const needle = String(q || '').trim().toUpperCase();
  if (!needle) return [];
  const exact = [], prefix = [], loose = [];
  for (const [icao, it] of S.ident) {
    if (!S.index.has(icao)) continue;
    const cs = (it.callsign || '').toUpperCase();
    const reg = (it.registration || '').toUpperCase();
    const ty = (it.type || '').toUpperCase();
    const hex = CODEC.numToHex(icao).toUpperCase();
    let bucket = null;
    if (cs === needle || reg === needle || hex === needle) bucket = exact;
    else if (cs.startsWith(needle) || reg.startsWith(needle) || hex.startsWith(needle) || ty === needle) bucket = prefix;
    else if (cs.includes(needle) || reg.includes(needle) || ty.includes(needle)) bucket = loose;
    if (!bucket) continue;
    bucket.push({ hex: CODEC.numToHex(icao), callsign: it.callsign, type: it.type, registration: it.registration });
    if (exact.length >= (limit || 25)) break;
  }
  return exact.concat(prefix, loose).slice(0, limit || 25);
}

/* ── one aircraft, in full ──────────────────────────────────────────────── */
function detail(hex, nowMs) {
  const icao = CODEC.hexToNum(hex);
  const slot = S.index.get(icao);
  if (slot === undefined) return null;
  const f = S.flags[slot];
  const ageS = (nowMs - S.seenAt[slot]) / 1000;
  const it = S.ident.get(icao) || {};
  const a = S.altFt[slot];
  return {
    hex: CODEC.numToHex(icao),
    callsign: it.callsign || '', type: it.type || '',
    registration: it.registration || '', operator: it.operator || '',
    lon: mx2lon(S.mx[slot]), lat: my2lat(S.my[slot]),
    /* null, not 0, when the provider did not report it — the card renders the two differently. */
    altFt: (a === a) ? a : null,
    geometric: !!(f & CODEC.AC_ALT_GEOM),
    gsKt: S.gs[slot], vrFpm: S.vr[slot], track: S.track[slot],
    onGround: !!(f & CODEC.AC_ON_GROUND),
    military: !!(f & CODEC.AC_MILITARY),
    emergency: !!(f & CODEC.AC_EMERGENCY),
    spi: !!(f & CODEC.AC_SPI),
    category: S.cat[slot], categoryName: MODEL.categoryName(S.cat[slot]),
    ageS: ageS, freshness: MODEL.freshness(ageS),
    observedAt: S.seenAt[slot],
    provider: S.provider,
  };
}
function mx2lon(x) { return x * 360 - 180; }

/* ── fetching ───────────────────────────────────────────────────────────── */
/*  The worker owns the network so a slow response cannot land in a frame. One request at a time
 *  per channel: overlapping polls of the same channel would only race each other to write the same
 *  slots. */
let ENDPOINT = '';
const inflight = new Set();

async function poll(channel, query) {
  if (!ENDPOINT || inflight.has(channel)) return null;
  inflight.add(channel);
  try {
    const url = ENDPOINT + '?ch=' + encodeURIComponent(channel) + (query || '');
    const r = await fetch(url, { headers: { accept: 'application/octet-stream' } });
    if (!r.ok) throw new Error('http_' + r.status);
    const buf = new Uint8Array(await r.arrayBuffer());
    S.provider = r.headers.get('x-intmap-provider') || S.provider;
    /* ODbL requires the source to be named; the NAME travels with the data so a change of
       provider changes what the UI credits without a code change. */
    S.attribution = r.headers.get('x-intmap-attribution') || S.attribution;
    S.coverage = r.headers.get('x-intmap-coverage') || S.coverage;
    /* (#R352) TWO AGES, KEPT APART. `ageMs` is how old the ANSWER is; `oldestMs` is how old
       the oldest observation in it is. They used to be one field carrying whichever the
       channel felt like, which made both unreadable (§22.2). */
    S.ageMs = Number(r.headers.get('x-intmap-age-ms')) || 0;
    S.oldestMs = Number(r.headers.get('x-intmap-oldest-ms')) || 0;
    const t0 = performance.now();
    const msg = CODEC.decode(buf);
    const decodeMs = performance.now() - t0;
    const nowMs = Date.now();
    const t1 = performance.now();
    /* Only the viewport channel records history — see the TRACK header. */
    const counts = apply(msg, nowMs, channel === 'view');
    const applyMs = performance.now() - t1;
    return { bytes: buf.length, decodeMs, applyMs, counts, seq: msg.seq };
  } finally {
    inflight.delete(channel);
  }
}

/* ── messages ───────────────────────────────────────────────────────────── */
let liftAltitude = false;

function publish(id, nowMs, extra) {
  const t0 = performance.now();
  const p = pack(nowMs, liftAltitude);
  const packMs = performance.now() - t0;
  const msg = {
    id, type: 'frame',
    n: p.n,
    total: S.index.size,
    seq: S.seq, provider: S.provider, attribution: S.attribution, coverage: S.coverage,
    serverAgeMs: S.ageMs, oldestObservationMs: S.oldestMs,
    packMs,
    buffers: { pos: p.pos, vel: p.vel, alt: p.alt, altv: p.altv, ms: p.ms, col: p.col, form: p.form },
    ids: p.ids,
  };
  if (extra) Object.assign(msg, extra);
  /* TRANSFERRED, not copied — after this the worker no longer owns these buffers, which is exactly
     what makes handing 50,000 aircraft to the page free. */
  self.postMessage(msg, [
    p.pos.buffer, p.vel.buffer, p.alt.buffer, p.altv.buffer,
    p.ms.buffer, p.col.buffer, p.form.buffer, p.ids.buffer,
  ]);
}

self.onmessage = async (ev) => {
  const m = ev.data || {};
  const nowMs = Date.now();
  try {
    switch (m.cmd) {
      case 'config':
        if (m.endpoint) ENDPOINT = m.endpoint;
        if (m.liftAltitude != null) liftAltitude = !!m.liftAltitude;
        self.postMessage({ id: m.id, type: 'ok' });
        break;

      case 'poll': {
        const stat = await poll(m.channel, m.query);
        publish(m.id, nowMs, { stat, channel: m.channel });
        break;
      }

      case 'filter':
        Object.assign(FILTER, m.filter || {});
        if (m.filter && m.filter.hexes) FILTER.hexes = new Set(m.filter.hexes.map(CODEC.hexToNum));
        else if (m.filter && 'hexes' in m.filter) FILTER.hexes = null;
        if (m.filter && m.filter.categories) FILTER.categories = new Set(m.filter.categories);
        publish(m.id, nowMs);
        break;

      case 'select':
        SELECTED = m.hex ? CODEC.hexToNum(m.hex) : 0;
        publish(m.id, nowMs);
        break;

      case 'lift':
        liftAltitude = !!m.on;
        publish(m.id, nowMs);
        break;

      case 'repack':
        publish(m.id, nowMs);
        break;

      case 'search':
        self.postMessage({ id: m.id, type: 'search', results: search(m.q, m.limit) });
        break;

      case 'detail':
        self.postMessage({ id: m.id, type: 'detail', detail: detail(m.hex, nowMs) });
        break;

      case 'track':
        self.postMessage({ id: m.id, type: 'track', hex: m.hex, track: trackOf(m.hex) });
        break;

      case 'stats': {
        let live = 0, stale = 0, ground = 0, mil = 0, emerg = 0, noAlt = 0;
        for (const slot of S.index.values()) {
          const ageS = (nowMs - S.seenAt[slot]) / 1000;
          const fr = MODEL.freshness(ageS);
          if (fr === 'live') live++; else stale++;
          const f = S.flags[slot];
          if (f & CODEC.AC_ON_GROUND) ground++;
          if (f & CODEC.AC_MILITARY) mil++;
          if (f & CODEC.AC_EMERGENCY) emerg++;
          if (!(S.altFt[slot] === S.altFt[slot])) noAlt++;
        }
        self.postMessage({
          id: m.id, type: 'stats',
          stats: {
            total: S.index.size, live, stale, ground, military: mil, emergency: emerg,
            noAltitude: noAlt, identities: S.ident.size,
            capacity: S.cap, slotsUsed: S.n, freeSlots: S.free.length,
            tracked: TRACK.slot.size, trackCapacity: TRACK.cap, trackPoints: TRACK.per,
            seq: S.seq, provider: S.provider, attribution: S.attribution, coverage: S.coverage,
            serverAgeMs: S.ageMs, oldestObservationMs: S.oldestMs,
            /* Every typed array in the slab, so §23.4's memory budget is measurable rather than
               estimated. 4 bytes per f32/u32 slot, 8 per f64, 1 per u8. */
            cpuBytes: S.cap * (4 * 10 + 8 + 1 * 3) + (TRACK.t ? TRACK.cap * TRACK.per * (8 + 4 * 3) + TRACK.cap * (4 + 2 + 2 + 8) : 0),
          },
        });
        break;
      }

      default:
        self.postMessage({ id: m.id, type: 'error', error: 'unknown_cmd' });
    }
  } catch (e) {
    /* A failure NEVER empties the store. The page keeps the last real aircraft and is told the
       fetch failed, which is what lets it show "not updating" instead of "no aircraft" (§25.2). */
    self.postMessage({ id: m.id, type: 'error', error: (e && e.message) || 'worker_error' });
  }
};
