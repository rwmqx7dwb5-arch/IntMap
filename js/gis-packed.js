/* ============================================================================
 *  IntMap · PACKED GEOMETRY  (gis-scale)
 * ----------------------------------------------------------------------------
 *  A GeoJSON polygon held as nested JS arrays costs about 108 bytes per position on the heap (MEASURED,
 *  scripts/gis-scale-bench.mjs, 2026-11-19: 100,000 buffered points = 65 positions each = +716 MB). The same
 *  position in a Float64Array is 16 bytes, it is NOT part of the garbage-collected object graph, and it moves
 *  between threads by transfer instead of by structured clone. That is the only reason this file exists: it
 *  lets a result that is thousands of times its input be held — or handed on — without the heap being the wall.
 *
 *  ⚠ IT IS A CODEC, NOT AN OPTIMISATION OF THE ANSWER. unpack(pack(g)) is the same GeoJSON, number for number
 *  (a Float64Array stores the double it was given, -0 and all). A geometry this codec does not know how to lay
 *  out flat — a GeometryCollection, a position with a third coordinate, a non-numeric coordinate — is kept
 *  AS IT IS in `odd` and handed back unchanged, so the codec never has a reason to refuse and never has a way
 *  to change an answer.
 *  ⚠ NOTHING HERE DECIDES ANYTHING ABOUT A SHAPE: no area, no validity, no clipping.
 *
 *  packed = {
 *    n,                      features in the block
 *    type:  Uint8Array(n),   0 none · 1 Point · 2 MultiPoint · 3 LineString · 4 MultiLineString · 5 Polygon · 6 MultiPolygon · 255 kept whole (see odd)
 *    parts: Uint32Array,     per feature, then per part, then per ring: a count (see `walk`)
 *    xy:    Float64Array,    every position, x then y
 *    odd:   {i: geometry}    the features this codec left alone
 *  }
 * ==========================================================================*/

const T = { Point: 1, MultiPoint: 2, LineString: 3, MultiLineString: 4, Polygon: 5, MultiPolygon: 6 };
const NAME = [null, 'Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'];

function isPos(p) { return Array.isArray(p) && p.length === 2 && typeof p[0] === 'number' && typeof p[1] === 'number'; }
function ringOk(r) { if (!Array.isArray(r)) return false; for (let i = 0; i < r.length; i++) if (!isPos(r[i])) return false; return true; }
function polyOk(p) { if (!Array.isArray(p)) return false; for (let i = 0; i < p.length; i++) if (!ringOk(p[i])) return false; return true; }

/* → the code of a geometry this codec lays out flat, or 255 */
function kindOf(g) {
  if (!g || typeof g !== 'object') return 0;
  const t = T[g.type], c = g.coordinates;
  if (!t || !Array.isArray(c)) return 255;
  if (t === 1) return isPos(c) ? 1 : 255;
  if (t === 2 || t === 3) return ringOk(c) ? t : 255;
  if (t === 4 || t === 5) return polyOk(c) ? t : 255;
  for (let i = 0; i < c.length; i++) if (!polyOk(c[i])) return 255;
  return 6;
}

/* every count and every position, two passes: the first sizes the two arrays, the second fills them */
export function pack(geometries) {
  const n = geometries.length;
  const type = new Uint8Array(n);
  let nParts = 0, nPos = 0;
  for (let i = 0; i < n; i++) {
    const g = geometries[i], k = kindOf(g);
    type[i] = k;
    if (k === 0 || k === 255) continue;
    const c = g.coordinates;
    if (k === 1) { nPos += 1; continue; }
    if (k === 2 || k === 3) { nParts += 1; nPos += c.length; continue; }
    if (k === 4 || k === 5) { nParts += 1 + c.length; for (const r of c) nPos += r.length; continue; }
    nParts += 1; for (const p of c) { nParts += 1 + p.length; for (const r of p) nPos += r.length; }
  }
  const parts = new Uint32Array(nParts), xy = new Float64Array(nPos * 2);
  let a = 0, b = 0, odd = null;
  for (let i = 0; i < n; i++) {
    const k = type[i];
    if (k === 255) { (odd || (odd = {}))[i] = geometries[i]; continue; }
    if (k === 0) continue;
    const c = geometries[i].coordinates;
    if (k === 1) { xy[b++] = c[0]; xy[b++] = c[1]; continue; }
    const ring = (r) => { for (let j = 0; j < r.length; j++) { xy[b++] = r[j][0]; xy[b++] = r[j][1]; } };
    if (k === 2 || k === 3) { parts[a++] = c.length; ring(c); continue; }
    if (k === 4 || k === 5) { parts[a++] = c.length; for (const r of c) { parts[a++] = r.length; ring(r); } continue; }
    parts[a++] = c.length;
    for (const p of c) { parts[a++] = p.length; for (const r of p) { parts[a++] = r.length; ring(r); } }
  }
  return { n, type, parts, xy, odd };
}

/* → an unpacker: next() returns the next feature's geometry, in the order they were packed. Sequential on
   purpose — a block is read once, front to back, and a sequential reader needs no per-feature index. */
export function reader(packed) {
  const { type, parts, xy, odd } = packed;
  let i = 0, a = 0, b = 0;
  const ring = (len) => { const r = new Array(len); for (let j = 0; j < len; j++) { r[j] = [xy[b], xy[b + 1]]; b += 2; } return r; };
  return {
    get done() { return i >= packed.n; },
    next() {
      const k = type[i], at = i++;
      if (k === 0) return null;
      if (k === 255) return odd[at];
      if (k === 1) { const p = [xy[b], xy[b + 1]]; b += 2; return { type: 'Point', coordinates: p }; }
      if (k === 2 || k === 3) return { type: NAME[k], coordinates: ring(parts[a++]) };
      if (k === 4 || k === 5) { const m = parts[a++], rs = new Array(m); for (let j = 0; j < m; j++) rs[j] = ring(parts[a++]); return { type: NAME[k], coordinates: rs }; }
      const m = parts[a++], ps = new Array(m);
      for (let j = 0; j < m; j++) { const q = parts[a++], rs = new Array(q); for (let h = 0; h < q; h++) rs[h] = ring(parts[a++]); ps[j] = rs; }
      return { type: 'MultiPolygon', coordinates: ps };
    },
  };
}

export function unpackAll(packed) { const r = reader(packed), out = new Array(packed.n); for (let i = 0; i < packed.n; i++) out[i] = r.next(); return out; }

/* the geometry type of feature i without unpacking it — what a registry needs to say `geometryType` */
export function typeOf(packed, i) {
  const k = packed.type[i];
  if (k === 0) return null;
  if (k === 255) return (packed.odd[i] && packed.odd[i].type) || null;
  return NAME[k];
}

/* bytes held outside the object graph, plus the `odd` ones counted as positions would be on the heap */
function bytesOf(packed) { return packed.type.byteLength + packed.parts.byteLength + packed.xy.byteLength; }

/* the buffers to hand to postMessage's transfer list */
export function transferables(packed) { return [packed.type.buffer, packed.parts.buffer, packed.xy.buffer]; }

/* ══ THE CHUNK STORE ═════════════════════════════════════════════════════════════════════════════
   A result that does not fit the heap as GeoJSON is held as chunks in the order its input arrived. A chunk is
   the feature SHELLS (everything but the geometry — properties, id, whatever the op wrote) and the geometries
   packed flat. Reading chunk i hands the features back whole, and only that chunk is ever a JS object graph.
   ⚠ ORDER IS THE INPUT'S: chunks are added in input order, so reading them front to back is the same sequence a
   single array would have held (the property every comparison against the in-memory path depends on). */
export function makeChunkStore() {
  const chunks = [];
  let count = 0, positions = 0, bytes = 0, resident = 0, cursor = 0, spilled = 0, spillError = null, backend = null, backendAsked = false;
  const owner = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function add(shells, packed) {
    const b = bytesOf(packed);
    chunks.push({ shells: shells, packed: packed, key: null, bytes: b, n: packed.n, nParts: packed.parts.length, nXy: packed.xy.length });
    count += shells.length; positions += packed.xy.length / 2; bytes += b; resident += b;
    return chunks.length - 1;
  }
  /* ══ SPILL — the coordinates leave the heap, the rows do not ════════════════════════════════════════
     MEASURED (scripts/gis-scale-bench.mjs --worker, 2026-11-19): 1,000,000 buffered points are 65 M positions =
     1.04 GB of Float64Array that stay in memory for as long as the result is held; a tab's budget is about 1.5 GiB
     (js/gis-worker.js). The positions are what is big (16 B each); the rows (properties + the type byte) are
     rows × a few hundred bytes. So when more than limits().residentBytes of positions are held, the OLDEST
     chunks' positions (parts + xy) are written to a backend (OPFS, else IndexedDB) and dropped; the shell, the
     per-feature type byte and any `odd` geometry stay, so stubs() / typeOf / count / withGeometry are exact without
     reading anything back. A chunk is read back whole, one at a time (chunkAsync), never the result.
     ⚠ SPILLING NEVER CHANGES AN ANSWER: the bytes written are the bytes read (a Float64Array round trip is exact),
     and every consumer reads chunks in the same order. ⚠ WITH NO BACKEND (a loader that cannot reach OPFS or IndexedDB, a
     refused write) NOTHING IS SPILLED and the result is held as before — named in `spillError`, never a failure. */
  async function backendFor() {
    if (backendAsked) return backend;
    backendAsked = true;
    const inj = limits().backend;
    try { backend = inj || await pickBackend(); } catch (_) { backend = null; }
    return backend;
  }
  async function settle() {
    const L = limits();
    if (resident <= L.residentBytes) return;
    const be = await backendFor();
    if (!be) return;
    /* the newest chunk stays: the next op reads front to back, and the one just written is not read first */
    while (resident > L.residentBytes && cursor < chunks.length - 1) {
      const c = chunks[cursor++];
      if (!c.packed || !c.packed.xy) continue;
      const key = owner + '-' + (cursor - 1);
      try { await be.put(key, encodeBody(c.packed)); }
      catch (e) { spillError = String((e && e.message) || e); cursor--; backend = null; return; }
      c.key = key; resident -= c.bytes; spilled++;
      c.packed = { n: c.packed.n, type: c.packed.type, parts: null, xy: null, odd: c.packed.odd };
    }
  }
  async function chunkAsync(i) {
    const c = chunks[i]; if (!c) return null;
    if (c.packed.xy) return chunk(i);
    const be = await backendFor();
    const raw = be ? await be.get(c.key) : null;
    if (!raw) { const e = new Error('chunk-lost'); e.why = 'chunk-lost'; e.detail = { chunk: i, key: c.key }; throw e; }
    return build(c, decodeBody(raw, c));
  }
  async function dispose() {
    const be = backend;
    for (const c of chunks) if (c.key && be) { try { await be.del(c.key); } catch (_) { } }
    for (const c of chunks) { c.shells = []; c.packed = { n: 0, type: new Uint8Array(0), parts: new Uint32Array(0), xy: new Float64Array(0), odd: null }; c.key = null; }
    resident = 0; spilled = 0;
  }
  /* features whose geometry is still on them: the geometry leaves the shell and is packed */
  function addFeatures(features) {
    const shells = new Array(features.length), gs = new Array(features.length);
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      if (!f || typeof f !== 'object') { shells[i] = f; gs[i] = null; continue; }
      const s = {};
      for (const k of Object.keys(f)) s[k] = (k === 'geometry') ? null : f[k]; /* the key stays, in its place: a row reads back with its members in the order it was written */
      shells[i] = s; gs[i] = f.geometry || null;
    }
    return add(shells, pack(gs));
  }
  function chunk(i) {
    const c = chunks[i]; if (!c) return null;
    if (!c.packed.xy) { const e = new Error('chunk-spilled'); e.why = 'chunk-spilled'; e.detail = { chunk: i }; throw e; }
    return build(c, c.packed);
  }
  function build(c, packed) {
    const rd = reader(packed), out = new Array(c.shells.length);
    for (let j = 0; j < out.length; j++) {
      const s = c.shells[j];
      if (!s || typeof s !== 'object') { out[j] = s; rd.next(); continue; }
      const g = rd.next();
      out[j] = ('geometry' in s) ? Object.assign({}, s, { geometry: g }) : Object.assign({}, s);
    }
    return out;
  }
  /* what a registry measures a record by — type and properties, never the coordinates */
  function stubs() {
    const out = [];
    for (const c of chunks) for (let j = 0; j < c.shells.length; j++) {
      const s = c.shells[j], t = typeOf(c.packed, j);
      out.push({ properties: (s && s.properties) || {}, geometry: t ? { type: t } : null });
    }
    return out;
  }
  return {
    add, addFeatures, chunk, chunkAsync, stubs, settle, dispose,
    get chunkCount() { return chunks.length; },
    get spilledCount() { return spilled; },
    get residentBytes() { return resident; },
    get spillError() { return spillError; },
    get spilled() { return spilled > 0; },
    get count() { return count; },
    get positions() { return positions; },
    get bytes() { return bytes; },
    /* asked of the store so the registry needs no import of this file (some loaders read a module as source text) */
    get materializeMax() { return limits().materializeMaxPositions; },
  };
}

/* The spilled body of one chunk: [u32 nParts][u32 nXy][parts][pad to 8][xy]. Little-endian typed-array views over the
   bytes, the same machine that wrote them reading them back (a backend is local storage, never a file that travels). */
function encodeBody(packed) {
  const np = packed.parts.length, nx = packed.xy.length;
  const partsAt = 8, xyAt = (partsAt + np * 4 + 7) & ~7;
  const buf = new ArrayBuffer(xyAt + nx * 8);
  const h = new Uint32Array(buf, 0, 2); h[0] = np; h[1] = nx;
  new Uint32Array(buf, partsAt, np).set(packed.parts);
  new Float64Array(buf, xyAt, nx).set(packed.xy);
  return buf;
}
function decodeBody(raw, c) {
  const buf = (raw instanceof ArrayBuffer) ? raw : (raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const h = new Uint32Array(buf, 0, 2), np = h[0], nx = h[1];
  if (np !== c.nParts || nx !== c.nXy) { const e = new Error('chunk-corrupt'); e.why = 'chunk-corrupt'; e.detail = { parts: np, xy: nx, expected: [c.nParts, c.nXy] }; throw e; }
  const xyAt = (8 + np * 4 + 7) & ~7;
  return { n: c.n, type: c.packed.type, parts: new Uint32Array(buf, 8, np), xy: new Float64Array(buf, xyAt, nx), odd: c.packed.odd };
}

/* ══ THE BACKENDS — OPFS, else IndexedDB, else none ════════════════════════════════════════════════════
   put(key, ArrayBuffer) / get(key) → ArrayBuffer | null / del(key). OPFS is the first choice (a file per chunk, no
   structured-clone copy of a gigabyte); IndexedDB is the fallback where OPFS has no writable handle on this thread
   (Safari's createWritable is worker-only). A backend that cannot write a byte answers null from pickBackend and the
   store keeps the result in memory. Files older than STALE_MS left by a tab that died are removed when OPFS is first
   opened (a chunk written a day ago belongs to no live result: a result lives as long as its tab). */
const SPILL_DIR = 'intmap-gis-spill';
const STALE_MS = 24 * 3600 * 1000;
export function memoryBackend() {
  const m = new Map();
  return { name: 'memory', size: () => m.size, keys: () => Array.from(m.keys()), put: async (k, b) => { m.set(k, b); }, get: async (k) => (m.has(k) ? m.get(k) : null), del: async (k) => { m.delete(k); } };
}
async function opfsBackend() {
  const nav = (typeof navigator !== 'undefined') ? navigator : null;
  if (!nav || !nav.storage || typeof nav.storage.getDirectory !== 'function') return null;
  const root = await nav.storage.getDirectory();
  const dir = await root.getDirectoryHandle(SPILL_DIR, { create: true });
  /* prove a write works here before promising it */
  const probe = await dir.getFileHandle('probe-' + Math.random().toString(36).slice(2), { create: true });
  if (typeof probe.createWritable !== 'function') { try { await dir.removeEntry(probe.name); } catch (_) { } return null; }
  const w = await probe.createWritable(); await w.write(new Uint8Array(8)); await w.close();
  try { await dir.removeEntry(probe.name); } catch (_) { }
  try {
    const now = Date.now();
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file') continue;
      const f = await h.getFile();
      if (now - f.lastModified > STALE_MS) { try { await dir.removeEntry(name); } catch (_) { } }
    }
  } catch (_) { }
  return {
    name: 'opfs',
    put: async (k, b) => { const fh = await dir.getFileHandle(k, { create: true }); const w2 = await fh.createWritable(); await w2.write(b); await w2.close(); },
    get: async (k) => { try { const fh = await dir.getFileHandle(k); return await (await fh.getFile()).arrayBuffer(); } catch (_) { return null; } },
    del: async (k) => { try { await dir.removeEntry(k); } catch (_) { } },
  };
}
async function idbBackend() {
  if (typeof indexedDB === 'undefined') return null;
  const db = await new Promise((res, rej) => { const rq = indexedDB.open(SPILL_DIR, 1); rq.onupgradeneeded = () => rq.result.createObjectStore('c'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  const tx = (mode, fn) => new Promise((res, rej) => { const t = db.transaction('c', mode); const r = fn(t.objectStore('c')); t.oncomplete = () => res(r && r.result !== undefined ? r.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  const be = { name: 'idb', put: (k, b) => tx('readwrite', (st) => st.put(b, k)), get: async (k) => { const v = await tx('readonly', (st) => st.get(k)); return v === undefined ? null : v; }, del: (k) => tx('readwrite', (st) => st.delete(k)) };
  await be.put('probe', new ArrayBuffer(8)); await be.del('probe');
  return be;
}
let PICKED = null;
export function pickBackend() {
  if (!PICKED) PICKED = (async () => { try { const o = await opfsBackend(); if (o) return o; } catch (_) { } try { return await idbBackend(); } catch (_) { return null; } })();
  return PICKED;
}

/* ══ WHERE THE HEAP STOPS BEING ENOUGH ═══════════════════════════════════════════════════════════
   OBSERVED (scripts/gis-scale-bench.mjs, node 24, 2026-11-19): a buffered point is 65 positions and 100,000 of
   them (6.5 M positions) held +716 MB of heap ≈ 108 B per position as nested arrays; 1,000,000 of them held
   +7,006 MB and took the node default heap (≈4 GB) well past its limit. A browser tab's JS heap is of the same
   order, so a result past a few million positions is held packed (16 B per position, outside the heap).
   · CHUNK_ABOVE_POSITIONS — an op whose output is estimated above this keeps it as chunks. Set above the 6.5 M
     that ran as plain arrays, so every size that worked before still takes the path it took (and answers in
     the same representation).
   · MATERIALIZE_MAX_POSITIONS — features() on a chunked record builds the whole array only up to this
     (≈1.7 GB as arrays); above it the call is refused by name instead of taking the tab down.
   Both expire with the per-position heap cost (a change of engine) or the tab's heap limit. */
const HEAP_BYTES_PER_POSITION = 108;
const CHUNK_ABOVE_POSITIONS = 8000000;
const MATERIALIZE_MAX_POSITIONS = 16000000;
/* Positions of a chunked result materialised at once while an op is mapped over it (≈216 MB as arrays). */
const MAP_GROUP_POSITIONS = 2000000;
/* Bytes of a chunked result's positions held in memory before the oldest chunks are written to a backend (see SPILL above).
   Observed (2026-11-19): a 1,000,000-point buffer = 1.04 GB of positions; js/gis-worker.js states a tab's budget as about 1.5 GiB. 256 MiB is the
   size MATERIALIZE_MAX_POSITIONS already refuses to build as arrays, so a result that is spilled is one no op that needs the whole
   array could have been given anyway. Expires with that budget. */
const RESIDENT_BYTES = 256 * 1024 * 1024;

/* The two numbers above, read at the moment of asking. `globalThis.IntMapGisScale` is how a check states a smaller
   world (a check that must cross the threshold with 40 points rather than 130,000) — the same shape as the
   `budgetBytes` a caller of planBlocks may state. Nothing in the product sets it. */
export function limits() {
  let s = null;
  try { s = (typeof globalThis !== 'undefined' && globalThis.IntMapGisScale) || null; } catch (_) { s = null; }
  const num = (v, d) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : d);
  return {
    chunkAbovePositions: num(s && s.chunkAbovePositions, CHUNK_ABOVE_POSITIONS),
    materializeMaxPositions: num(s && s.materializeMaxPositions, MATERIALIZE_MAX_POSITIONS),
    mapGroupPositions: num(s && s.mapGroupPositions, MAP_GROUP_POSITIONS),
    residentBytes: num(s && s.residentBytes, RESIDENT_BYTES),
    /* a backend object a check (or the bench in node, which has no OPFS) states; nothing in the product sets it */
    backend: (s && s.backend && typeof s.backend.put === 'function') ? s.backend : null,
  };
}
