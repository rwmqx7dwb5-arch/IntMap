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

/* ══ SHELLS HELD BY COLUMN ════════════════════════════════════════════════════════════════════════
   MEASURED (scripts/gis-scale-bench.mjs --worker --spill, node 24, 2026-11-20): with every position spilled, 1,000,000 rows
   still held +550 MB of heap — the rows themselves, one {type, properties:{…}, geometry:null} object graph per feature
   (≈550 B each for four properties). The same rows as columns are a Float64Array per numeric property and one pointer per
   string (the strings are the ones the rows already shared), so a chunk's shells are held that way when they can be.
   ⚠ IT IS A CODEC, LIKE pack(): expandShells(compactShells(x)) is x — the same keys in the same order, the same values
   (-0, NaN and Infinity included, which JSON would not keep). A chunk it cannot lay out that way — rows whose keys differ,
   a property that is an object or an array, a geometry still on the shell — is NOT compacted and is held as rows, exactly as
   before, so the codec never has a reason to refuse and never a way to change a row. */
function isPlain(o) { return o !== null && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null); }
function isPrim(v) { return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'; }
function sameKeys(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
export function compactShells(shells) {
  const n = shells.length;
  if (!n) return null;
  const s0 = shells[0];
  if (!isPlain(s0)) return null;
  const top = Object.keys(s0);
  const propsAsColumns = isPlain(s0.properties);
  /* ⚠ THE PROPERTY KEYS ARE THE UNION OF THE ROWS', in the order they first appear. A join leaves a matched row with the
     partner's columns and an unmatched one with its own only — the same keys in the same order, some of them absent — and
     that is the common case, so a column may be ABSENT on a row (a bitmap says so) and an absent key is not written back. A row whose keys
     are in a different ORDER from the union is the one thing that cannot be laid out this way, and the chunk is held as rows. */
  const union = [], at = new Map();
  if (propsAsColumns) {
    for (let i = 0; i < n; i++) {
      const sh = shells[i];
      if (!isPlain(sh) || !isPlain(sh.properties)) return null;
      for (const q of Object.keys(sh.properties)) if (!at.has(q)) { at.set(q, union.length); union.push(q); }
    }
  }
  const cols = [];
  for (const k of top) {
    if (k === 'geometry') { if (s0.geometry !== null) return null; continue; }
    if (k === 'properties' && propsAsColumns) { for (const q of union) cols.push({ top: k, prop: q, vals: new Array(n), present: null }); continue; }
    if (!isPrim(s0[k])) return null;
    cols.push({ top: k, prop: null, vals: new Array(n), present: null });
  }
  /* ⚠ A ROW MAY WRITE THE SAME TOP-LEVEL KEYS IN ANOTHER ORDER (a join writes a matched row {type, geometry, properties} and hands an unmatched one on as it came, {type, properties, geometry}). The orders are kept as variants and each row says which it was, so it reads back with its keys where it had them. */
  const topSet = new Set(top), variants = [top], vkey = new Map([[top.join(' '), 0]]);
  let vid = null;
  for (let i = 0; i < n; i++) {
    const sh = shells[i];
    if (!isPlain(sh)) return null;
    const ks = Object.keys(sh), kj = ks.join(' ');
    let vi = vkey.get(kj);
    if (vi === undefined) {
      if (ks.length !== top.length || variants.length >= 255) return null;
      for (const k of ks) if (!topSet.has(k)) return null;
      vi = variants.length; variants.push(ks); vkey.set(kj, vi);
    }
    if (vi) (vid || (vid = new Uint8Array(n)))[i] = vi;
    if (sh.geometry !== null && 'geometry' in sh) return null;
    let c = 0;
    for (const k of top) {
      if (k === 'geometry') continue;
      if (k === 'properties' && propsAsColumns) {
        const pr = sh.properties, ks = Object.keys(pr);
        let last = -1;
        for (const q of ks) { const j = at.get(q); if (j <= last) return null; last = j; }   /* an order the union does not have */
        const base = c;
        for (const q of ks) { const v = pr[q]; if (!isPrim(v)) return null; cols[base + at.get(q)].vals[i] = v; }
        if (ks.length !== union.length) {
          const here = new Set(ks);
          for (let j = 0; j < union.length; j++) if (!here.has(union[j])) { const col = cols[base + j]; (col.present || (col.present = new Uint8Array(n).fill(1)))[i] = 0; }
        }
        c += union.length;
        continue;
      }
      const v = sh[k]; if (!isPrim(v)) return null; cols[c++].vals[i] = v;
    }
  }
  for (const c of cols) {
    const v = c.vals, pr = c.present;
    let same = !pr, nums = true;
    for (let i = 0; i < n; i++) {
      if (pr && !pr[i]) continue;
      if (same && !Object.is(v[i], v[0])) same = false;
      if (typeof v[i] !== 'number') nums = false;
      if (!same && !nums) break;
    }
    if (same) { c.kind = 'const'; c.value = v[0]; c.vals = null; }
    else if (nums) { const f = new Float64Array(n); for (let i = 0; i < n; i++) if (!pr || pr[i]) f[i] = v[i]; c.kind = 'f64'; c.vals = f; }
    else c.kind = 'arr';
  }
  return { n: n, top: top, variants: vid ? variants : null, vid: vid, pk: propsAsColumns ? union : null, cols: cols };
}
export function expandShells(cm) {
  const out = new Array(cm.n);
  for (let i = 0; i < cm.n; i++) {
    const sh = {}, pr = cm.pk ? {} : null;
    /* each key's first column, found once: the row's own key order (a variant) is then free to differ from the columns' */
    const start = cm.start || (cm.start = (() => { const m = new Map(); let c = 0; for (const k of cm.top) { if (k === 'geometry') continue; m.set(k, c); c += (k === 'properties' && cm.pk) ? cm.pk.length : 1; } return m; })());
    for (const k of (cm.vid ? cm.variants[cm.vid[i]] : cm.top)) {
      if (k === 'geometry') { sh.geometry = null; continue; }
      let c = start.get(k);
      if (k === 'properties' && cm.pk) {
        for (let q = 0; q < cm.pk.length; q++) { const col = cm.cols[c++]; if (col.present && !col.present[i]) continue; pr[col.prop] = col.kind === 'const' ? col.value : col.vals[i]; }
        sh.properties = pr; continue;
      }
      const col = cm.cols[c]; sh[k] = col.kind === 'const' ? col.value : col.vals[i];
    }
    out[i] = sh;
  }
  return out;
}
/* bytes the columns hold (an array of mixed cells counted as pointers) — what the registry and the bench report as the shells' weight */
export function shellBytes(cm) { let b = 0; for (const c of cm.cols) b += c.kind === 'f64' ? c.vals.byteLength : c.kind === 'arr' ? c.vals.length * 8 : 8; return b; }

/* ══ THE CHUNK STORE ═════════════════════════════════════════════════════════════════════════════
   A result that does not fit the heap as GeoJSON is held as chunks in the order its input arrived. A chunk is
   the feature SHELLS (everything but the geometry — properties, id, whatever the op wrote) and the geometries
   packed flat. Reading chunk i hands the features back whole, and only that chunk is ever a JS object graph.
   ⚠ ORDER IS THE INPUT'S: chunks are added in input order, so reading them front to back is the same sequence a
   single array would have held (the property every comparison against the in-memory path depends on). */
export function makeChunkStore() {
  const chunks = [];
  let count = 0, positions = 0, bytes = 0, resident = 0, cursor = 0, spilled = 0, shellsCompacted = 0, spillError = null, backend = null, backendAsked = false;
  const owner = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  function add(shells, packed) {
    const b = bytesOf(packed);
    const cm = compactShells(shells);
    chunks.push({ shells: cm ? null : shells, cshells: cm, nShells: shells.length, packed: packed, key: null, bytes: b, n: packed.n, nParts: packed.parts.length, nXy: packed.xy.length });
    if (cm) shellsCompacted++;
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
    for (const c of chunks) { c.shells = []; c.cshells = null; c.nShells = 0; c.packed = { n: 0, type: new Uint8Array(0), parts: new Uint32Array(0), xy: new Float64Array(0), odd: null }; c.key = null; }
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
  /* a chunk's rows, rebuilt from its columns when it was compacted */
  function shellsOf(c) { return c.cshells ? expandShells(c.cshells) : c.shells; }
  function build(c, packed) {
    const rd = reader(packed), shells = shellsOf(c), out = new Array(shells.length);
    for (let j = 0; j < out.length; j++) {
      const s = shells[j];
      if (!s || typeof s !== 'object') { out[j] = s; rd.next(); continue; }
      const g = rd.next();
      out[j] = ('geometry' in s) ? Object.assign({}, s, { geometry: g }) : Object.assign({}, s);
    }
    return out;
  }
  /* ══ ONLY WHAT IS ON SCREEN ═══════════════════════════════════════════════════════════════════════
     A table shows rows from..from+count and no coordinates. The rows live in the shells (held by column, never spilled), so
     the slice is built from the chunks that overlap it — a result of a million rows answers its first two hundred without
     reading one position back and without building the other 999,800.
     ⚠ THE ROWS HAVE NO GEOMETRY (`geometry: null` where the shell carried the key): this door says what the attributes are,
     not where anything is. A reader that needs the shape asks chunk()/chunkAsync(). */
  function attributeRows(from, n) {
    const out = [];
    let at = 0;
    const lo = Math.max(0, Math.floor(from) || 0), hi = lo + Math.max(0, Math.floor(n) || 0);
    for (const c of chunks) {
      const end = at + c.nShells;
      if (end > lo && at < hi) {
        const shells = shellsOf(c);
        for (let j = Math.max(lo, at) - at; j < shells.length && at + j < hi; j++) out.push(shells[j]);
      }
      at = end;
      if (at >= hi) break;
    }
    return out;
  }
  /* what a registry measures a record by — type and properties, never the coordinates */
  function stubs() {
    const out = [];
    for (const c of chunks) { const shells = shellsOf(c); for (let j = 0; j < shells.length; j++) {
      const s = shells[j], t = typeOf(c.packed, j);
      out.push({ properties: (s && s.properties) || {}, geometry: t ? { type: t } : null });
    } }
    return out;
  }
  return {
    add, addFeatures, chunk, chunkAsync, stubs, settle, dispose, attributeRows,
    get chunkCount() { return chunks.length; },
    get spilledCount() { return spilled; },
    get residentBytes() { return resident; },
    get spillError() { return spillError; },
    /* how many chunks hold their rows as columns, and the weight of those columns */
    get shellsCompacted() { return shellsCompacted; },
    get shellBytes() { let b = 0; for (const c of chunks) if (c.cshells) b += shellBytes(c.cshells); return b; },
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
function pickBackend() {
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
