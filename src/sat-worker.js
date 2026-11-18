/* ============================================================================
 *  IntMap · THE SATELLITE TILE PIPELINE, OFF THE MAIN THREAD  (#R192)
 * ----------------------------------------------------------------------------
 *  「MapLibre, Cesiumともに衛星画像、3Dを高速化」「衛星画像の読み込み時の動作を、極限まで
 *    シームレスにして。（高速・違和感低減・点滅軽減）」「モバイル版で、衛星画像が圧倒的に重い」
 *
 *  MEASURED FIRST. Panning Tokyo at z12 with the satellite base on, over six seconds:
 *
 *                       frames/s   long tasks   total blocked   worst task
 *      desktop @2x         4.8        75           8.9 s          275 ms
 *      phone (no @2x)     22.6         7           0.40 s          63 ms
 *
 *  The desktop number is the surprise and it names the cause: the HiDPI path (#R178) builds every
 *  screen tile out of four children, so each tile is four fetches, four `createImageBitmap` decodes,
 *  four `drawImage` calls into a 512² canvas and a `transferToImageBitmap` — and all of it ran on the
 *  thread that also has to draw the map. 8.9 seconds of blocking inside a 6-second pan is not "the
 *  imagery is slow", it is the imagery standing on the renderer's toes.
 *
 *  So the whole resolve — fetch, placeholder detection, the ancestor walk, the crop and the 2× stitch
 *  — happens here, in a worker, and what crosses back is a TRANSFERABLE ImageBitmap: no copy, no
 *  decode on the far side, and MapLibre's protocol contract takes it directly.
 *
 *  WHAT STAYED THE SAME. Every decision this file makes is the one #R158/#R178/#R179 established:
 *  the placeholder is still Esri's fixed grey JPEG (recognised by its bytes — js/esri-imagery.js isImageryPlaceholder), the walk-up still goes 13 levels, the
 *  `have`/`stop` depth memo still learns per z10 neighbourhood (and is mirrored back to the main
 *  thread so the debug hooks and the tests can still ask it synchronously), and any failure still
 *  falls back to the raw bytes so the map is never worse than before.
 * ==========================================================================*/
/* (sat-arcgis-3d) WHERE the tile comes from is js/esri-imagery.js's — keyed or keyless, one URL builder for
   the whole app. This module worker has its own instance of it, so its own `refused` flag: a key this
   worker saw refused falls back here independently of the page, which is what a refusal needs. */
import { imageryTileUrl, imageryKeyed, imageryRefused, isImageryReply, isImageryPlaceholder } from '../js/esri-imagery.js';

let RAW_MAX = 1200, DEPTH_MAX = 4000;
const raw = new Map();            /* z/x/y → {buf, placeholder} — the ANCESTORS are what is worth keeping */
const depth = new Map();          /* z10 neighbourhood → {have, stop} */
const aborts = new Map();         /* request id → AbortController */
const dirty = new Map();          /* depth entries changed since the last reply, mirrored to the main thread */

const cell = (z, x, y) => { const d = z - 10; return d >= 0 ? ((x >> d) + '/' + (y >> d)) : (z + ':' + x + '/' + y); };
function hold(z, x, y) { const k = cell(z, x, y); let v = depth.get(k);
  if (!v) { v = { have: null, stop: null }; depth.set(k, v);
    if (depth.size > DEPTH_MAX) { const f = depth.keys().next().value; depth.delete(f); } }
  return v; }
function noteHave(z, x, y, d) { if (!isFinite(d)) return; const v = hold(z, x, y);
  if (v.have == null || d > v.have) v.have = d;
  if (v.stop != null && v.stop < d) v.stop = null;
  dirty.set(cell(z, x, y), v); }
function noteStop(z, x, y, d) { if (!isFinite(d)) return; const v = hold(z, x, y);
  if (v.have == null || d > v.have) v.have = d;
  if (v.stop == null || d > v.stop) v.stop = d;
  dirty.set(cell(z, x, y), v); }
function knownStop(z, x, y) { const v = depth.get(cell(z, x, y)); return v ? v.stop : null; }

/* ══ (#R196) A TILE IS FETCHED ONCE ═══════════════════════════════════════════════════════════════
   「モバイル版で、衛星画像が圧倒的に重い」— MEASURED on an emulated iPhone (390×844, DPR 3), satellite
   on over Tokyo at z12, a six-second pan of twenty-four steps:

       satellite tile requests        891
       DISTINCT tiles among them      137
       tiles asked for more than once  73
       worst single tile              24 times — once per pan step

   6.5× the bytes the view needs, on the connection least able to afford them. The cause is not the
   cache size: it is that the request was CANCELLED. MapLibre aborts a tile the moment it leaves the
   set it needs, the abort reached `fetch`, the response was discarded mid-flight, and nothing was
   ever stored — so the next step asked for the same tile from scratch. A pan is exactly the motion
   that keeps tiles crossing that boundary, which is why the worst offender matches the step count.

   Two changes, both here:

   ① THE HTTP FETCH IS NOT ABORTABLE. Once the bytes are on the wire, cancelling them costs the same
      bandwidth and guarantees paying it again. The fetch runs to completion and populates `raw`, so
      the re-request that follows is free and INSTANT — which is also the seam the same round was
      asked to close (「点滅軽減」): a tile panned back into view is already here.
      The abort still does its job where the saving is real — the ancestor WALK stops between levels,
      and an abandoned tile's reply is never posted.

   ② IN-FLIGHT REQUESTS ARE SHARED. The ancestor walk means many z18 tiles resolve through the same
      z8 parent, and four stitch children are asked for at once; without this they raced and fetched
      the same URL several times over. */
const inflight = new Map();       /* z/x/y → Promise<{buf,placeholder}> while it is waiting for a socket or on the wire */

/* ══ (sat-arcgis-3d) A FETCH THAT HAS NOT LEFT YET HAS COST NOTHING — SO IT CAN BE WITHDRAWN ═════════
   「3D の衛星画像が鮮明になるまでが遅い」. MEASURED (production, desktop DPR 2, pitched 70°, cold): after
   the camera stops, 54–91 % of the time a needed tile waits is spent QUEUED FOR A SOCKET — Esri answers
   over HTTP/1.1 (CDP `response.protocol`, both hosts), so the browser opens six connections per host and
   every other `fetch()` waits in its own pool. A pitched pan asked for ~260 tiles (~1,020 fetches with
   the @2x stitch) while the view it stopped on needed ~45, and every one of the 260 had already been
   handed to `fetch()`, so the 45 waited behind tiles MapLibre had long since abandoned.

   ① #R196 STANDS: a request that has LEFT is never cancelled — the bytes are on the wire and a cancel
      only guarantees paying for them twice. What changes is that a request is not handed to the browser
      while `LANES` of its host's fetches are already with the browser, so everything beyond that still
      WAITING is here, in a queue this worker owns, where it is free to take back.
   ② EACH WAITING FETCH KNOWS WHO WANTS IT. A tile request (one message id) is an `owner`; the ancestor
      walk and the four stitch children all fetch on its behalf, and a fetch shared by two tiles has two
      owners. When MapLibre abandons a tile (abort) or the tile finishes without needing a fetch it had
      queued (a stitch that fell back), the owner lets go — and a waiting fetch nobody holds any more is
      withdrawn. A fetch with no owner at all (a debug call) is never withdrawn.
   ③ ORDER is the renderer's own (FIFO). MEASURED against newest-frame-first on the same build (lanes 6, desktop
      DPR 2, pitched 70°, cold, 6 reps): newest-first was slower to sharp in jump (5.2 s vs 3.3 s) and pan
      (5.3 s vs 4.0 s) — MapLibre already asks centre-first, and reordering undid that. Not kept.
   MEASURED (one build, `setTuning({lanes})`, cold rural places, ABBA, 4 reps, median time-to-sharp after
   the camera stops), desktop DPR 2, pitched 70°: lanes 0 (no queue) → 12: pan 12.1 s → 1.7 s (Esri
   requests 870 → 474), jump 5.2 s → 3.1 s; flat 2D unchanged (jump 1.5 s → 1.3 s, the queue withdraws
   ~0 there because nothing is abandoned) and the phone unchanged (3-D jump 1.8 s → 1.5 s).
   `LANES` = 12 — OBSERVATION: the browser opens 6 sockets per HTTP/1.1 host (Chromium `kMaxSocketsPerGroup`,
   Firefox, Safari) and both Esri hosts negotiate http/1.1 (CDP, 2026-11-17). Twice that is held by the
   browser so a freed socket never waits for this worker to hand it the next fetch. MEASURED on the same
   build: 6 (exactly the sockets) made flat 2D SLOWER (jump 0.64 s → 1.67 s, pan 0.18 s → 1.57 s — the
   hand-off gap); 24 kept less of the pitched gain (pan 2.7 s, jump 4.5 s). 12 is the measured optimum,
   not a derivation: it expires with the browser's per-host cap or a faster worker hand-off.
   The worker cannot see the protocol itself — Esri sends no Timing-Allow-Origin, so `nextHopProtocol` is
   '' here (measured). EXPIRY: a host that speaks h2/h3 has no per-host cap, and 12 would then throttle it.
   The keyed service (js/esri-imagery.js, ibasemaps-api) answers h2 — measured there — so a fetch built
   keyed (`e.keyed`) is never held for a lane; the cap applies to the keyless HTTP/1.1 hosts only.
   A new host means re-measuring its protocol here.
   SOURCE: this constant; js/sat-proto.js passes it through `config` and owns nothing else about it. */
let LANES = 12;
const waiting = [];               /* entries handed to nobody yet — the ONLY ones that may be withdrawn */
const lanesLive = new Map();      /* origin → fetches handed to the browser and not yet settled */
let entrySeq = 0;
const sched = { queued: 0, started: 0, withdrawn: 0, specStarted: 0 };
function newOwner() { return { entries: new Set() }; }
function adopt(e, owner) {
  if (!owner) { e.pinned = true; return; }
  if (!e.owners.has(owner)) { e.owners.add(owner); owner.entries.add(e); }
}
function release(owner) {
  if (!owner) return;
  for (const e of owner.entries) {
    e.owners.delete(owner);
    if (e.started || e.pinned || e.owners.size) continue;
    const i = waiting.indexOf(e); if (i < 0) continue;
    waiting.splice(i, 1); inflight.delete(e.k); sched.withdrawn++;
    const err = new Error('withdrawn'); err.name = 'AbortError'; e.rej(err);
  }
  owner.entries.clear();
}
function start(e) {
  e.started = true; sched.started++;
  lanesLive.set(e.host, (lanesLive.get(e.host) || 0) + 1);
  if (e.spec) { sched.specStarted++; specLive.set(e.host, (specLive.get(e.host) || 0) + 1); }
  (async () => {
    /* built when it LEAVES, not when it was queued: a refusal seen meanwhile already moved this worker to the keyless hosts */
    let u = imageryTileUrl(e.z, e.y, e.x), r = null;
    /* ⚠ A REFUSED KEY MUST NOT BLANK THE MAP (js/esri-imagery.js): the keyed service answers an expired or
       over-quota token with 200 + JSON, so the test is "is this an image", not the status. The first
       refusal switches this worker to the keyless hosts and the SAME tile is asked again, once. */
    for (let tries = 0; tries < 2; tries++) {
      const keyed = imageryKeyed();
      /* a speculative fetch says so to the browser too: below a visible one in its own queue (where supported) */
      r = await fetch(u, e.spec ? { mode: 'cors', credentials: 'omit', priority: 'low' } : { mode: 'cors', credentials: 'omit' });
      if (!keyed || (r.ok && isImageryReply(r))) break;
      imageryRefused(r.ok ? String(r.headers.get('content-type')) : String(r.status));
      u = imageryTileUrl(e.z, e.y, e.x);
    }
    if (!r.ok) throw new Error('sat http ' + r.status);
    const buf = await r.arrayBuffer();
    const out = { buf, placeholder: isImageryPlaceholder(buf) };
    raw.set(e.k, out);
    if (raw.size > RAW_MAX) { const f = raw.keys().next().value; raw.delete(f); }
    return out;
  })().then(e.res, e.rej).finally(() => { lanesLive.set(e.host, lanesLive.get(e.host) - 1);
    if (e.spec) specLive.set(e.host, specLive.get(e.host) - 1);
    pump(); });
}
function pump() {
  const cap = LANES > 0 ? LANES : Infinity;
  for (let i = 0; i < waiting.length;) {
    const e = waiting[i];
    /* a refusal since it was queued makes it a keyless (HTTP/1.1) fetch again — it takes a lane like one */
    if (e.keyed && !imageryKeyed()) { e.keyed = false; const u = imageryTileUrl(e.z, e.y, e.x); e.host = u.slice(0, u.indexOf('/', 8)); }
    if (e.keyed || (lanesLive.get(e.host) || 0) < cap) { waiting.splice(i, 1); start(e); } else i++;
  }
  specPump();
}

/* ══ (sat-mobile-speed) SPECULATION YIELDS TO NEED ═════════════════════════════════════════════════════
   「携帯で衛星画像を一瞬で」. MEASURED (production, phone 390×844 DPR 3, CPU 4×, 9 Mbps / 150 ms): the
   page's ring prefetch (js/tile-warm.js, up to 60 URLs, through sw.js) and this worker's destination warm
   (four lanes of its own) ran at the same time as the tiles on screen, on the same six sockets per
   Esri host. 30–73 % of the satellite requests were never drawn, and a visible tile waited p95 0.6–2.2 s
   behind them (0.05–0.11 s with both off). Off entirely, though, a drag got worse (tile p50 176→379 ms):
   some of it is worth having.
   So speculation has ONE scheduler, this one, and one rule: a speculative fetch (`spec`: the camera's
   destination, then the ring around the view) is handed to the browser only while NO tile the renderer
   asked for is waiting here for the same host, while that host has a socket nobody is using
   (HOST_SOCKETS), and at most SPEC_CAP at a time per host. It is never withdrawn once it left (#R196) and
   a visible request for the same tile joins it (`inflight`).
   HOST_SOCKETS = 6 — OBSERVATION, the same one `LANES` rests on: browsers open six sockets per HTTP/1.1
   host and both Esri hosts negotiate http/1.1. EXPIRY: an h2/h3 host (the keyed service) has no per-host
   socket count; there only SPEC_CAP and the "nothing waiting" rule apply.
   SPEC_CAP = 1 — MEASURED (one build, `setTuning({specCap})`, ABBA, 3 seeds, phone CPU 4× 9 Mbps/150 ms and
   desktop DPR 2): 0 (no speculation) left a drag unsharp after it stopped (phone pan 0 → 100 ms, unsharp while
   moving 9 → 16 %); 2 was no faster than 1 anywhere and fetched 19–40 % more (phone zoom 0.75 → 1.02 s to
   sharp). EXPIRY: a host without the six-socket cap (h2), or a renderer that asks ahead by itself.
   (dev-notes/2026-11-18-sat-mobile-speed.md) — changeable live through js/sat-proto.js `setTuning`. */
const HOST_SOCKETS = 6;
let SPEC_CAP = 1;
const specLive = new Map();       /* origin → speculative fetches handed to the browser and not yet settled */
let specDest = [], specRing = []; /* [z, y, x] — the destination's tiles first, then the ring's */
const keyOf = (z, y, x) => z + '/' + x + '/' + y;
function specPump() {
  if (!specDest.length && !specRing.length) return;
  const needy = new Set(waiting.map((e) => e.host));   /* a host with a visible tile still waiting gets no speculation */
  for (const list of [specDest, specRing]) {
    for (let i = 0; i < list.length;) {
      const [z, y, x] = list[i], k = keyOf(z, y, x);
      if (raw.has(k) || inflight.has(k)) { list.splice(i, 1); continue; }      /* already here or already coming */
      const u = imageryTileUrl(z, y, x), host = u.slice(0, u.indexOf('/', 8)), keyed = imageryKeyed();
      if (needy.has(host) || (specLive.get(host) || 0) >= SPEC_CAP || (!keyed && (lanesLive.get(host) || 0) >= HOST_SOCKETS)) { i++; continue; }
      list.splice(i, 1);
      const e = { k, u, z, y, x, keyed, host, owners: new Set(), seq: ++entrySeq, started: false, pinned: true, spec: true, res: null, rej: null };
      const p = new Promise((res, rej) => { e.res = res; e.rej = rej; }).finally(() => { if (inflight.get(k) && inflight.get(k).e === e) inflight.delete(k); });
      p.catch(() => null);
      inflight.set(k, { e, p });
      start(e);
    }
  }
}
/* a newer list replaces the old one (the camera changed its mind); `more` appends what is not already there */
function speculate(kind, tiles, more) {
  const list = (Array.isArray(tiles) ? tiles : []).filter((t) => Array.isArray(t) && !raw.has(keyOf(t[0], t[1], t[2])));
  if (kind === 'dest') specDest = list;
  else if (more) { const have = new Set(specRing.map((t) => keyOf(t[0], t[1], t[2]))); for (const t of list) if (!have.has(keyOf(t[0], t[1], t[2]))) specRing.push(t); }
  else specRing = list;
  specPump();
}
function fetchTile(z, y, x, owner) {
  const k = z + '/' + x + '/' + y;
  const c = raw.get(k); if (c) { raw.delete(k); raw.set(k, c); return Promise.resolve(c); }
  const live = inflight.get(k); if (live) { if (!live.e.started) adopt(live.e, owner); return live.p; }
  const u = imageryTileUrl(z, y, x);
  const e = { k, u, z, y, x, keyed: imageryKeyed(), host: u.slice(0, u.indexOf('/', 8)), owners: new Set(), seq: ++entrySeq, started: false, pinned: false, res: null, rej: null };
  const p = new Promise((res, rej) => { e.res = res; e.rej = rej; }).finally(() => { if (inflight.get(k) && inflight.get(k).e === e) inflight.delete(k); });
  inflight.set(k, { e, p });
  adopt(e, owner);
  sched.queued++; waiting.push(e); pump();
  return p;
}
function canvas(w, h) { return new OffscreenCanvas(w, h); }
async function crop(buf, dz, sx, sy) {
  const bmp = await createImageBitmap(new Blob([buf]));
  const n = 1 << dz, size = bmp.width / n;
  const c = canvas(256, 256), ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx * size, sy * size, size, size, 0, 0, 256, 256);
  try { bmp.close && bmp.close(); } catch (_) { }
  return c.transferToImageBitmap();
}
/* the four z+1 children as ONE 512² tile, or null when they are not all real imagery */
async function stitch2x(z, y, x, signal, owner) {
  if (z >= 20) return null;
  if (signal && signal.aborted) return null;
  const stop = knownStop(z, x, y);
  if (stop != null && z + 1 > stop) return null;
  const q = [[0, 0], [1, 0], [0, 1], [1, 1]];
  let kids;
  try { kids = await Promise.all(q.map(([dx, dy]) => fetchTile(z + 1, 2 * y + dy, 2 * x + dx, owner))); } catch (_) { return null; }
  if (!kids.every(k => k && !k.placeholder)) return null;
  noteHave(z, x, y, z + 1);
  let bmps = null;
  try {
    bmps = await Promise.all(kids.map(k => createImageBitmap(new Blob([k.buf]))));
    const c = canvas(512, 512), ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    q.forEach(([dx, dy], i) => ctx.drawImage(bmps[i], dx * 256, dy * 256, 256, 256));
    return c.transferToImageBitmap();
  } catch (_) { return null; }
  finally { if (bmps) bmps.forEach(b => { try { b && b.close && b.close(); } catch (_) { } }); }
}
/* ══ (#R193) THE WALK ALREADY KNEW WHERE IT WAS GOING ══════════════════════════════════════════════
   「衛星画像の読み込み時の動作を、極限までシームレスにして。」

   #R179 built a memo of how deep Esri's imagery actually goes, per z10 neighbourhood, and #R178's
   stitch consults it. The ANCESTOR WALK never did. So over open ocean — where imagery ends around z8
   and a z16 request is nine levels short — every single tile climbed one level at a time, and each
   level is a SEQUENTIAL round trip: nine requests and nine latencies before the first pixel of that
   tile could be drawn, repeated for every tile on screen, even though the first tile to arrive had
   already established the answer for the whole neighbourhood.

   Now the walk STARTS at the known stop level. The memo is only ever a hint — it is a fact about a
   neighbourhood and imagery can end at different levels inside one — so the jump is verified: if the
   tile at the remembered level turns out to be a placeholder after all, the ordinary one-level-at-a-
   time walk resumes from there and the memo is corrected. Same answer, same bytes, one round trip
   instead of nine.

   ⚠ It cannot start ABOVE the remembered level either: `stop` is "the deepest level that is real", so
   the tile there is exactly the one we want and asking for its parent would throw away detail. */
async function resolve(z, y, x, signal, owner) {
  const first = await fetchTile(z, y, x, owner);
  if (!first.placeholder) { noteHave(z, x, y, z); return { mode: 'native', buf: first.buf }; }
  let az = z, ax = x, ay = y, dz = 0, real = null;
  const hint = knownStop(z, x, y);
  if (hint != null && hint < z && hint >= 1) {
    const d = z - hint;
    if (d > 1 && d <= 13) {
      let got = null;
      try { got = await fetchTile(hint, y >> d, x >> d, owner); } catch (_) { got = null; }
      if (got && !got.placeholder) { real = got; az = hint; dz = d; }
      else if (got) { az = hint; ax = x >> d; ay = y >> d; dz = d; }   /* the hint was stale — walk on from here */
    }
  }
  if (!real) {
    for (let up = 0; up < 13 && az > 1; up++) {
      /* (#R196) THIS is where an abort is worth honouring: each level is its own round trip, so
         stopping between them saves requests that have not been made yet. */
      if (signal && signal.aborted) break;
      az--; ax = ax >> 1; ay = ay >> 1; dz++;
      let got = null; try { got = await fetchTile(az, ay, ax, owner); } catch (_) { break; }
      if (!got.placeholder) { real = got; break; }
    }
  }
  if (real) { noteStop(z, x, y, az);
    try { return { mode: 'cropped', bitmap: await crop(real.buf, dz, x - ((x >> dz) << dz), y - ((y >> dz) << dz)) }; } catch (_) { } }
  return { mode: 'raw', buf: first.buf };
}

function flushDepth() { if (!dirty.size) return null;
  const out = []; for (const [k, v] of dirty) out.push([k, v.have, v.stop]); dirty.clear(); return out; }

/* ══ (#R204) THE JPEG IS DECODED HERE, NOT ON THE THREAD THAT DRAWS THE MAP ═══════════════════════
   「モバイル版が、特に衛星画像含め圧倒的に重い」「衛星画像の読み込み時の動作を、極限までシームレスに」
   「地図のホバー、ズームのfpsを劇的に高くしろ」

   #R202 and #R203 both profiled the phone sweep and both ended at the same sentence: 51.4 % of self
   time is `(program)`, the largest gap is 1,856 ms with nothing but `(program)` on the stack, and
   this app's own JavaScript is under 8 % of the whole — i.e. JPEG DECODE AND TEXTURE UPLOAD. #R203
   then wrote down that the remaining levers "belong to the imagery pipeline, not to render-scale".
   This is that lever, and it was hiding in plain sight in this file.

   #R192 moved the fetch, the placeholder test, the ancestor walk, the crop and the 2× stitch into
   this worker — but only the CROPPED and STITCHED paths came back as an ImageBitmap. The `native`
   path, which is every tile over a city and most tiles anywhere, came back as an ArrayBuffer, and
   MapLibre's image request decodes those with `createImageBitmap` ON THE MAIN THREAD (see
   src/util/image_request.ts). So the common case — a real Esri tile — was still paying a full JPEG
   decode on the thread with the frame budget, in a round whose whole subject was moving it off.

   Decoding it here costs the same milliseconds on a thread that owes nobody a frame, and the result
   is TRANSFERABLE, so the hand-back is a pointer move rather than a copy. What is left on the main
   thread is the texture upload, which is the part only the GL context can do.

   ⚠ THE BYTES ARE STILL THE FALLBACK. `createImageBitmap` is not obliged to accept every JPEG Esri
   serves, and a worker that answers "no image" would be a blank tile where there used to be a
   picture. Anything that throws returns the ArrayBuffer exactly as before, so this can only ever
   move work off the main thread, never remove a tile.
   ⚠ AND NO COLOUR-MANAGEMENT SHORTCUT. Skipping the ICC transform measurably speeds the decode up
   and would let these tiles disagree with the whole-Earth floor underneath them, which #R190 spent a
   round matching pixel for pixel (RMSE 29 → 12). Speed that changes the picture is not free. */
async function decode(buf) {
  try { return await createImageBitmap(new Blob([buf])); } catch (_) { return null; }
}

/* ══ (map-motion) WARMING WHERE THE CAMERA IS GOING ═════════════════════════════════════════════════
   js/sat-proto.js names the tiles the camera's DESTINATION will draw (the wheel's target, the end of a
   glide) before the renderer asks for them — it asks only when the camera gets there. Their bytes are
   fetched into `raw`, so the renderer's request is answered by a decode instead of a round trip. Bytes
   only: no decode, no bitmap, nothing posted back. A newer destination REPLACES the old list (the camera
   changed its mind). (sat-mobile-speed) It is speculation, so it goes through `specPump` like the ring:
   it used to have four lanes of its own beside the visible tiles' queue, which is one of the two things
   the phone measurement found standing in front of them. */
self.onmessage = async (ev) => {
  const m = ev.data || {};
  if (m.type === 'config') { if (m.rawMax) RAW_MAX = m.rawMax; if (m.depthMax) DEPTH_MAX = m.depthMax;
    if (m.lanes != null && isFinite(m.lanes)) LANES = +m.lanes;
    if (m.specCap != null && isFinite(m.specCap)) SPEC_CAP = +m.specCap;
    pump(); return; }
  if (m.type === 'stats') { self.postMessage({ id: m.id, ok: true, stats: { ...sched, waiting: waiting.length, live: [...lanesLive.values()].reduce((p, c) => p + c, 0), lanes: LANES, specCap: SPEC_CAP, specQueued: specDest.length + specRing.length } }); return; }
  /* speculation: the destination ('dest') and the ring around the view ('ring') — see `specPump` */
  if (m.type === 'spec') { speculate(m.kind, m.tiles, !!m.more); return; }
  if (m.type === 'abort') { const a = aborts.get(m.id); if (a) { try { a.ac && a.ac.abort(); } catch (_) { } release(a.owner); aborts.delete(m.id); } return; }
  if (m.type !== 'tile') return;
  const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const owner = newOwner();
  aborts.set(m.id, { ac, owner });
  const signal = ac ? ac.signal : undefined;
  try {
    let bitmap = null, mode = null, buf = null;
    if (m.hi) { const hi = await stitch2x(m.z, m.y, m.x, signal, owner); if (hi) { bitmap = hi; mode = 'stitched'; } }
    /* (sat-arcgis-3d) an abandoned tile goes no further: its reply would be dropped by the page anyway,
       so neither the fallback walk nor a decode is worth starting for it */
    if (!bitmap && signal && signal.aborted) throw new Error('aborted');
    if (!bitmap) { const r = await resolve(m.z, m.y, m.x, signal, owner); mode = r.mode;
      if (r.bitmap) bitmap = r.bitmap;
      else if (signal && signal.aborted) throw new Error('aborted');
      else {
        /* (#R204) decode HERE — see the note above `decode`. The bytes remain the fallback. */
        bitmap = await decode(r.buf);
        if (!bitmap) buf = r.buf.slice(0);
      } }
    const msg = { id: m.id, ok: true, mode, depth: flushDepth() };
    if (bitmap) { msg.bitmap = bitmap; self.postMessage(msg, [bitmap]); }
    else { msg.buf = buf; self.postMessage(msg, [buf]); }
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, err: String((e && e.message) || e), depth: flushDepth() });
  } finally { aborts.delete(m.id); release(owner); }
};
