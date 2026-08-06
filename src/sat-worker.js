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
 *  the placeholder is still Esri's fixed ~2.5 KB grey JPEG, the walk-up still goes 13 levels, the
 *  `have`/`stop` depth memo still learns per z10 neighbourhood (and is mirrored back to the main
 *  thread so the debug hooks and the tests can still ask it synchronously), and any failure still
 *  falls back to the raw bytes so the map is never worse than before.
 * ==========================================================================*/
const HOSTS = ['https://server.arcgisonline.com', 'https://services.arcgisonline.com'];
const url = (z, y, x) => HOSTS[(x + y) & 1] + '/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + z + '/' + y + '/' + x;
const PLACEHOLDER_MAX = 3500;

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
const inflight = new Map();       /* z/x/y → Promise<{buf,placeholder}> while the bytes are on the wire */
function fetchTile(z, y, x) {
  const k = z + '/' + x + '/' + y;
  const c = raw.get(k); if (c) { raw.delete(k); raw.set(k, c); return Promise.resolve(c); }
  const live = inflight.get(k); if (live) return live;
  const p = (async () => {
    const r = await fetch(url(z, y, x), { mode: 'cors', credentials: 'omit' });
    if (!r.ok) throw new Error('sat http ' + r.status);
    const buf = await r.arrayBuffer();
    const out = { buf, placeholder: buf.byteLength <= PLACEHOLDER_MAX };
    raw.set(k, out);
    if (raw.size > RAW_MAX) { const f = raw.keys().next().value; raw.delete(f); }
    return out;
  })().finally(() => { inflight.delete(k); });
  inflight.set(k, p);
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
async function stitch2x(z, y, x, signal) {
  if (z >= 20) return null;
  if (signal && signal.aborted) return null;
  const stop = knownStop(z, x, y);
  if (stop != null && z + 1 > stop) return null;
  const q = [[0, 0], [1, 0], [0, 1], [1, 1]];
  let kids;
  try { kids = await Promise.all(q.map(([dx, dy]) => fetchTile(z + 1, 2 * y + dy, 2 * x + dx))); } catch (_) { return null; }
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
async function resolve(z, y, x, signal) {
  const first = await fetchTile(z, y, x);
  if (!first.placeholder) { noteHave(z, x, y, z); return { mode: 'native', buf: first.buf }; }
  let az = z, ax = x, ay = y, dz = 0, real = null;
  const hint = knownStop(z, x, y);
  if (hint != null && hint < z && hint >= 1) {
    const d = z - hint;
    if (d > 1 && d <= 13) {
      let got = null;
      try { got = await fetchTile(hint, y >> d, x >> d); } catch (_) { got = null; }
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
      let got = null; try { got = await fetchTile(az, ay, ax); } catch (_) { break; }
      if (!got.placeholder) { real = got; break; }
    }
  }
  if (real) { noteStop(z, x, y, az);
    try { return { mode: 'cropped', bitmap: await crop(real.buf, dz, x - ((x >> dz) << dz), y - ((y >> dz) << dz)) }; } catch (_) { } }
  return { mode: 'raw', buf: first.buf };
}

function flushDepth() { if (!dirty.size) return null;
  const out = []; for (const [k, v] of dirty) out.push([k, v.have, v.stop]); dirty.clear(); return out; }

self.onmessage = async (ev) => {
  const m = ev.data || {};
  if (m.type === 'config') { if (m.rawMax) RAW_MAX = m.rawMax; if (m.depthMax) DEPTH_MAX = m.depthMax; return; }
  if (m.type === 'abort') { const a = aborts.get(m.id); if (a) { try { a.abort(); } catch (_) { } aborts.delete(m.id); } return; }
  if (m.type !== 'tile') return;
  const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  if (ac) aborts.set(m.id, ac);
  const signal = ac ? ac.signal : undefined;
  try {
    let bitmap = null, mode = null, buf = null;
    if (m.hi) { const hi = await stitch2x(m.z, m.y, m.x, signal); if (hi) { bitmap = hi; mode = 'stitched'; } }
    if (!bitmap) { const r = await resolve(m.z, m.y, m.x, signal); mode = r.mode;
      if (r.bitmap) bitmap = r.bitmap; else buf = r.buf.slice(0); }
    const msg = { id: m.id, ok: true, mode, depth: flushDepth() };
    if (bitmap) { msg.bitmap = bitmap; self.postMessage(msg, [bitmap]); }
    else { msg.buf = buf; self.postMessage(msg, [buf]); }
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, err: String((e && e.message) || e), depth: flushDepth() });
  } finally { aborts.delete(m.id); }
};
