/* ============================================================================
 *  IntMap · PMTILES — window.IntMapGisPmtiles   (js/gis-pmtiles.js)
 * ----------------------------------------------------------------------------
 *  A PMTiles v3 archive is ONE file that holds a whole tile pyramid and an index of it, laid out so
 *  that a reader can have any one tile with a handful of HTTP range requests and never the rest
 *  (https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md — the layout is published so
 *  that a reader can be written against it). Until this file the map said 「PMTiles はまだ読めない」.
 *
 *  ⚠ NO DEPENDENCY WAS ADDED. The format is a 127-byte header, varint-coded directories and tile
 *  bytes; the tiles IntMap can use are Mapbox Vector Tiles, a protobuf subset. Both are READ-ONLY
 *  here, in a few hundred lines — the same decision as js/gis-geopackage.js. (The unpkg `pmtiles`
 *  plugin was loaded once and removed because nothing called it; this is the reader that is called.)
 *
 *  ══ THE CONTRACT ══════════════════════════════════════════════════════════════════════════════
 *    sniff(bytes)                      → true when the first 7 bytes are `PMTiles`
 *    open(supply)                      → { ok:true, archive } | { ok:false, why, detail }
 *    archive.header                    the header, as stated (zooms, bounds in degrees, type, …)
 *    archive.tile(z, x, y)             → Uint8Array (decompressed tile bytes) | null (not in archive)
 *    archive.window({bbox, zoom, maxTiles}) → { ok, fc, stats } — ONLY the tiles that cover `bbox`
 *    readBytes(bytes, o) / readSource(supply, o) / readUrl(url, o)   the three doors, one reader
 *  `supply` is the byte-supply contract js/gis-geotiff.js defined: `{ size, read(offset,length) }`.
 *  An archive at a URL is therefore read by the SAME range-request machinery a COG is (httpSource),
 *  not a second copy of it — what a request costs is `supply.requests`.
 *
 *  ══ WHAT IT REFUSES, AND WHY EACH REFUSAL IS A MEASUREMENT ════════════════════════════════════
 *    pmtiles-not-pmtiles        the first 7 bytes are not the magic string
 *    pmtiles-version            the version byte is not 3 (v1/v2 are a different layout)
 *    pmtiles-truncated          the header, a directory or a tile is past the last byte of the file
 *    pmtiles-corrupt            the bytes contradict themselves (directory counts, varint, run)
 *    pmtiles-compression        a directory or tile is compressed with something other than none/gzip
 *                               (brotli, zstd). Named, not guessed at, with the codec in `detail`.
 *    pmtiles-raster             the tiles are PNG/JPEG/WebP/AVIF pictures, not vectors — they are
 *                               not features, and this reader will not pretend a picture is a table
 *    pmtiles-tile-type          a tile type byte this reader has never met
 *    pmtiles-zoom               a zoom outside the archive's own min..max, or above 24
 *    pmtiles-bbox               a window that is not a finite west<east, south<north box
 *    pmtiles-too-many-tiles     the window at that zoom needs more tiles than `maxTiles` — with the
 *                               number, so the caller can ask for a smaller window or a lower zoom
 *    pmtiles-mvt                a vector tile whose protobuf contradicts itself
 *  ⚠ `why` IS A CODE, NEVER A SENTENCE (docs/GIS-CORE.md §2.2): js/map-ui.js words them.
 *
 *  ══ WHAT THE ANSWER SAYS ABOUT ITSELF ═════════════════════════════════════════════════════════
 *  A tile pyramid is a SERIES OF DRAWINGS, not a table. Two consequences are stated in `stats`
 *  rather than hidden: (1) a feature that crosses a tile edge arrives as one piece per tile
 *  (`stats.clipped: true`) — counting features counts pieces; (2) a lower zoom is a generalised
 *  drawing, so the zoom read is carried (`stats.zoom`) and never presented as the source's own
 *  geometry. `stats.tiles` is how many tiles were opened, `stats.requests` how many ranges asked.
 *  ⚠ Properties are what the tile stored (strings / numbers / booleans); the layer a feature came
 *  from is `_layer`. Nothing is typed or renamed here (the one column-typing rule is
 *  IntMapData.typeColumn). MultiPoint becomes one Point per point, because js/geodesy.js
 *  sanitizeFeatures drops MultiPoint (docs/architecture/07-map.md §7.3d).
 * ==========================================================================*/

export function makeGisPmtiles(deps) {
  const D = deps || {};
  const bad = (why, detail) => (detail === undefined ? { ok: false, why: why } : { ok: false, why: why, detail: detail });
  const MAGIC = [0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73]; // "PMTiles"
  const HEADER_BYTES = 127;
  /* The spec recommends the root directory fit in the first 16 KiB; reading that much with the
     header makes a cold open ONE request when the supply is a URL (the first-block seed). */
  const FIRST_BLOCK = 16384;
  const MAX_ZOOM = 24; // 4^24 < 2^53: tile ids stay exact in a double. Archives above this are refused by name.
  const TILE_TYPES = { 1: 'mvt', 2: 'png', 3: 'jpeg', 4: 'webp', 5: 'avif' };
  const COMPRESSION = { 0: 'unknown', 1: 'none', 2: 'gzip', 3: 'brotli', 4: 'zstd' };
  /* a window's tile count at the zoom asked; the caller may state another. Observed 2026-11-20: a
     single viewport at z14 is ~12-30 tiles; 256 keeps one read within a few MB. It is a request
     budget, not a refusal of the format — raise it by saying so. */
  const DEFAULT_MAX_TILES = 256;

  class Fail extends Error { constructor(why, detail) { super(why); this.why = why; this.detail = detail; } }
  const fail = (why, detail) => { throw new Fail(why, detail); };

  const u8of = (b) => (b instanceof Uint8Array ? b : (b && b.buffer instanceof ArrayBuffer ? new Uint8Array(b.buffer, b.byteOffset || 0, b.byteLength) : (b instanceof ArrayBuffer ? new Uint8Array(b) : null)));

  function sniff(bytes) {
    const u = u8of(bytes);
    if (!u || u.length < MAGIC.length) return false;
    for (let i = 0; i < MAGIC.length; i++) if (u[i] !== MAGIC[i]) return false;
    return true;
  }

  /* ── resident supply ─────────────────────────────────────────────────────────────────────── */
  function residentSource(u) {
    return { size: u.length, resident: u, requests: 0, read: async (off, len) => u.subarray(off, Math.min(u.length, off + len)) };
  }
  const isSupply = (v) => !!(v && typeof v === 'object' && typeof v.read === 'function' && v.size >= 0);

  /* ── decompression: gzip via the platform; the rest is refused by name ───────────────────── */
  async function gunzip(bytes) {
    if (typeof D.gunzip === 'function') return D.gunzip(bytes);
    if (typeof DecompressionStream !== 'function') fail('pmtiles-compression', { codec: 'gzip', reason: 'no-DecompressionStream-in-this-runtime' });
    const ds = new DecompressionStream('gzip');
    const w = ds.writable.getWriter();
    w.write(bytes).catch(() => { }); w.close().catch(() => { });
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  async function inflate(bytes, comp, what) {
    if (comp === 1) return bytes;
    if (comp === 2) {
      try { return await gunzip(bytes); } catch (e) { if (e && e.why) throw e; fail('pmtiles-corrupt', { at: what, reason: 'gzip' }); }
    }
    return fail('pmtiles-compression', { codec: COMPRESSION[comp] || ('code ' + comp), at: what });
  }

  /* ── varint (LEB128). Offsets in an archive can exceed 2^32, so this multiplies, not shifts. ─ */
  function varintReader(u) {
    let p = 0;
    return {
      get pos() { return p; },
      set pos(v) { p = v; },
      eof: () => p >= u.length,
      next() {
        let r = 0, mul = 1;
        for (let i = 0; i < 10; i++) {
          if (p >= u.length) fail('pmtiles-corrupt', { reason: 'varint-past-end' });
          const b = u[p++];
          r += (b & 0x7f) * mul;
          if (b < 0x80) return r;
          mul *= 128;
        }
        return fail('pmtiles-corrupt', { reason: 'varint-too-long' });
      },
    };
  }

  /* ── header ──────────────────────────────────────────────────────────────────────────────── */
  function parseHeader(u) {
    if (!u || u.length < HEADER_BYTES) fail('pmtiles-truncated', { bytes: u ? u.length : 0, need: HEADER_BYTES });
    if (!sniff(u)) fail('pmtiles-not-pmtiles');
    if (u[7] !== 3) fail('pmtiles-version', { version: u[7] });
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    /* uint64 little-endian as a double: exact below 2^53, and a file that large is not one this
       reader is asked to open (the byte supply's size is a double too). */
    const u64 = (o) => dv.getUint32(o, true) + dv.getUint32(o + 4, true) * 4294967296;
    const e7 = (o) => dv.getInt32(o, true) / 1e7;
    const h = {
      version: 3,
      rootDir: { offset: u64(8), length: u64(16) },
      metadata: { offset: u64(24), length: u64(32) },
      leafDirs: { offset: u64(40), length: u64(48) },
      tileData: { offset: u64(56), length: u64(64) },
      addressedTiles: u64(72), tileEntries: u64(80), tileContents: u64(88),
      clustered: u[96] === 1,
      internalCompression: u[97], tileCompression: u[98], tileTypeCode: u[99],
      tileType: TILE_TYPES[u[99]] || null,
      minZoom: u[100], maxZoom: u[101],
      bounds: { west: e7(102), south: e7(106), east: e7(110), north: e7(114) },
      center: { zoom: u[118], lon: e7(119), lat: e7(123) },
    };
    return h;
  }

  /* ── tile ids: the Hilbert curve the spec orders tiles by ────────────────────────────────── */
  function zxyToTileId(z, x, y) {
    if (!(z >= 0 && z <= MAX_ZOOM)) fail('pmtiles-zoom', { zoom: z, max: MAX_ZOOM });
    const n = Math.pow(2, z);
    if (!(x >= 0 && y >= 0 && x < n && y < n)) fail('pmtiles-zoom', { zoom: z, x: x, y: y, reason: 'tile-outside-the-grid' });
    let acc = 0;
    for (let i = 0; i < z; i++) acc += Math.pow(4, i);
    let d = 0, tx = x, ty = y;
    for (let s = n / 2; s >= 1; s /= 2) {
      const rx = (tx & s) > 0 ? 1 : 0, ry = (ty & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      if (ry === 0) {
        if (rx === 1) { tx = n - 1 - tx; ty = n - 1 - ty; }
        const t = tx; tx = ty; ty = t;
      }
    }
    return acc + d;
  }

  /* ── directories ─────────────────────────────────────────────────────────────────────────── */
  function parseDirectory(u) {
    const r = varintReader(u);
    const n = r.next();
    if (n > u.length) fail('pmtiles-corrupt', { reason: 'directory-count', count: n });
    const e = new Array(n);
    let last = 0;
    for (let i = 0; i < n; i++) { last += r.next(); e[i] = { tileId: last, offset: 0, length: 0, run: 0 }; }
    for (let i = 0; i < n; i++) e[i].run = r.next();
    for (let i = 0; i < n; i++) e[i].length = r.next();
    for (let i = 0; i < n; i++) {
      const v = r.next();
      if (v === 0 && i > 0) e[i].offset = e[i - 1].offset + e[i - 1].length;
      else e[i].offset = v - 1;
    }
    return e;
  }

  /* entry that holds `tileId`: binary search for the last entry with id ≤ tileId, then a run or a leaf */
  function findEntry(entries, tileId) {
    let lo = 0, hi = entries.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (entries[m].tileId <= tileId) lo = m + 1; else hi = m - 1;
    }
    const i = hi;
    if (i < 0) return null;
    const e = entries[i];
    if (e.run === 0) return e; // a leaf-directory pointer: it covers every id from here to the next entry
    if (tileId - e.tileId < e.run) return e;
    return null;
  }

  /* ── open ────────────────────────────────────────────────────────────────────────────────── */
  async function openSupply(src) {
    if (!(src.size >= HEADER_BYTES)) fail('pmtiles-truncated', { bytes: src.size, need: HEADER_BYTES });
    const first = u8of(src.seed) && src.seed.length >= HEADER_BYTES ? src.seed : await src.read(0, Math.min(src.size, FIRST_BLOCK));
    const head = u8of(first);
    const header = parseHeader(head);
    if (header.tileType === null) fail('pmtiles-tile-type', { code: header.tileTypeCode });
    for (const [what, p] of [['root', header.rootDir], ['tiles', header.tileData]]) {
      if (p.offset + p.length > src.size) fail('pmtiles-truncated', { section: what, end: p.offset + p.length, size: src.size });
    }
    const dirCache = new Map();
    async function range(off, len, what) {
      if (off + len > src.size) fail('pmtiles-truncated', { section: what, end: off + len, size: src.size });
      let u = null;
      if (off + len <= head.length) u = head.subarray(off, off + len);
      else u = u8of(await src.read(off, len));
      if (!u || u.length < len) fail('pmtiles-truncated', { section: what, offset: off, wanted: len, got: u ? u.length : 0 });
      return u;
    }
    async function directory(off, len, what) {
      const key = off + ':' + len;
      if (dirCache.has(key)) return dirCache.get(key);
      const raw = await range(off, len, what);
      const entries = parseDirectory(await inflate(raw, header.internalCompression, what));
      dirCache.set(key, entries);
      return entries;
    }
    async function locate(tileId) {
      let d = await directory(header.rootDir.offset, header.rootDir.length, 'root-directory');
      for (let depth = 0; depth < 4; depth++) { // the spec allows at most root + 3 leaf levels
        const e = findEntry(d, tileId);
        if (!e) return null;
        if (e.run > 0) return e;
        d = await directory(header.leafDirs.offset + e.offset, e.length, 'leaf-directory');
      }
      return fail('pmtiles-corrupt', { reason: 'leaf-depth' });
    }
    async function tile(z, x, y) {
      const id = zxyToTileId(z, x, y);
      const e = await locate(id);
      if (!e) return null;
      const raw = await range(header.tileData.offset + e.offset, e.length, 'tile');
      return inflate(raw, header.tileCompression, 'tile');
    }
    async function metadata() {
      if (!header.metadata.length) return null;
      const raw = await range(header.metadata.offset, header.metadata.length, 'metadata');
      try { return JSON.parse(new TextDecoder('utf-8').decode(await inflate(raw, header.internalCompression, 'metadata'))); }
      catch (e) { if (e && e.why) throw e; return null; }
    }
    return { header, tile, metadata, supply: src };
  }

  /* ── Mapbox Vector Tile (protobuf) ───────────────────────────────────────────────────────── */
  function pbReader(u, start, end) {
    let p = start;
    const vi = () => {
      let r = 0, mul = 1;
      for (let i = 0; i < 10; i++) {
        if (p >= end) fail('pmtiles-mvt', { reason: 'varint-past-end' });
        const b = u[p++];
        r += (b & 0x7f) * mul;
        if (b < 0x80) return r;
        mul *= 128;
      }
      return fail('pmtiles-mvt', { reason: 'varint-too-long' });
    };
    return {
      more: () => p < end,
      varint: vi,
      /* tag → [field, wire] */
      tag() { const t = vi(); return [Math.floor(t / 8), t % 8]; },
      bytes() { const n = vi(); if (p + n > end) fail('pmtiles-mvt', { reason: 'length-past-end' }); const s = p; p += n; return [s, s + n]; },
      skip(wire) {
        if (wire === 0) vi();
        else if (wire === 1) p += 8;
        else if (wire === 5) p += 4;
        else if (wire === 2) { const n = vi(); p += n; }
        else fail('pmtiles-mvt', { reason: 'wire-type', wire: wire });
        if (p > end) fail('pmtiles-mvt', { reason: 'past-end' });
      },
      f32() { const v = new DataView(u.buffer, u.byteOffset + p, 4).getFloat32(0, true); p += 4; return v; },
      f64() { const v = new DataView(u.buffer, u.byteOffset + p, 8).getFloat64(0, true); p += 8; return v; },
    };
  }
  const zigzag = (n) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);

  function parseValue(u, s, e) {
    const r = pbReader(u, s, e);
    let out = null;
    while (r.more()) {
      const [f, w] = r.tag();
      if (f === 1 && w === 2) { const [a, b] = r.bytes(); out = new TextDecoder('utf-8').decode(u.subarray(a, b)); }
      else if (f === 2 && w === 5) out = r.f32();
      else if (f === 3 && w === 1) out = r.f64();
      else if (f === 4 && w === 0) { const v = r.varint(); out = v > 9007199254740991 ? v : (v >= 18446744073709551616 / 2 ? v - 18446744073709551616 : v); }
      else if (f === 5 && w === 0) out = r.varint();
      else if (f === 6 && w === 0) out = zigzag(r.varint());
      else if (f === 7 && w === 0) out = r.varint() !== 0;
      else r.skip(w);
    }
    return out;
  }

  /* geometry command stream → arrays of [x,y] in tile units (parts), per the spec's command integers */
  function decodeGeometry(cmds, type) {
    const parts = [];
    let cur = null, x = 0, y = 0, i = 0;
    while (i < cmds.length) {
      const ci = cmds[i++], id = ci & 7, count = Math.floor(ci / 8);
      if (id === 1) { // MoveTo
        for (let k = 0; k < count; k++) {
          if (i + 2 > cmds.length) fail('pmtiles-mvt', { reason: 'geometry-truncated' });
          x += zigzag(cmds[i++]); y += zigzag(cmds[i++]);
          if (type === 1) parts.push([[x, y]]);
          else { cur = [[x, y]]; parts.push(cur); }
        }
      } else if (id === 2) { // LineTo
        if (!cur) fail('pmtiles-mvt', { reason: 'lineto-without-moveto' });
        for (let k = 0; k < count; k++) { x += zigzag(cmds[i++]); y += zigzag(cmds[i++]); cur.push([x, y]); }
      } else if (id === 7) { // ClosePath
        if (cur && cur.length) cur.push([cur[0][0], cur[0][1]]);
      } else fail('pmtiles-mvt', { reason: 'command', id: id });
    }
    return parts;
  }
  const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length - 1; i < n; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };

  function decodeTile(u, z, tx, ty) {
    const n = Math.pow(2, z);
    const feats = [];
    const top = pbReader(u, 0, u.length);
    while (top.more()) {
      const [f, w] = top.tag();
      if (!(f === 3 && w === 2)) { top.skip(w); continue; }
      const [ls, le] = top.bytes();
      const lr = pbReader(u, ls, le);
      let name = '', extent = 4096;
      const keys = [], vals = [], fspans = [];
      while (lr.more()) {
        const [lf, lw] = lr.tag();
        if (lf === 1 && lw === 2) { const [a, b] = lr.bytes(); name = new TextDecoder('utf-8').decode(u.subarray(a, b)); }
        else if (lf === 2 && lw === 2) fspans.push(lr.bytes());
        else if (lf === 3 && lw === 2) { const [a, b] = lr.bytes(); keys.push(new TextDecoder('utf-8').decode(u.subarray(a, b))); }
        else if (lf === 4 && lw === 2) { const [a, b] = lr.bytes(); vals.push(parseValue(u, a, b)); }
        else if (lf === 5 && lw === 0) extent = lr.varint();
        else lr.skip(lw);
      }
      if (!(extent > 0)) fail('pmtiles-mvt', { reason: 'extent', extent: extent });
      const lon = (px) => (tx + px / extent) / n * 360 - 180;
      const lat = (py) => { const m = Math.PI * (1 - 2 * (ty + py / extent) / n); return Math.atan(Math.sinh(m)) * 180 / Math.PI; };
      const pt = (p) => [lon(p[0]), lat(p[1])];
      for (const [fs, fe] of fspans) {
        const fr = pbReader(u, fs, fe);
        let id = null, type = 0, tags = [], cmds = [];
        while (fr.more()) {
          const [ff, fw] = fr.tag();
          if (ff === 1 && fw === 0) id = fr.varint();
          else if (ff === 2 && fw === 2) { const [a, b] = fr.bytes(); const pr = pbReader(u, a, b); while (pr.more()) tags.push(pr.varint()); }
          else if (ff === 3 && fw === 0) type = fr.varint();
          else if (ff === 4 && fw === 2) { const [a, b] = fr.bytes(); const pr = pbReader(u, a, b); while (pr.more()) cmds.push(pr.varint()); }
          else fr.skip(fw);
        }
        const props = { _layer: name };
        for (let k = 0; k + 1 < tags.length; k += 2) {
          const key = keys[tags[k]];
          if (key === undefined || tags[k + 1] >= vals.length) fail('pmtiles-mvt', { reason: 'tag-index' });
          props[key] = vals[tags[k + 1]];
        }
        if (id !== null) props._id = id;
        const parts = decodeGeometry(cmds, type);
        if (!parts.length) continue;
        if (type === 1) {
          for (const p of parts) feats.push({ type: 'Feature', properties: Object.assign({}, props), geometry: { type: 'Point', coordinates: pt(p[0]) } });
        } else if (type === 2) {
          const lines = parts.filter((p) => p.length >= 2).map((p) => p.map(pt));
          if (lines.length) feats.push({ type: 'Feature', properties: props, geometry: lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines } });
        } else if (type === 3) {
          /* The spec's winding rule: an EXTERIOR ring has positive area in tile coordinates (y down),
             an interior ring negative — that is how rings are grouped into polygons. */
          const polys = [];
          for (const ring of parts) {
            if (ring.length < 4) continue;
            const a = ringArea(ring);
            if (a === 0) continue;
            const r = ring.map(pt);
            if (a > 0 || !polys.length) polys.push([r]); else polys[polys.length - 1].push(r);
          }
          if (polys.length) feats.push({ type: 'Feature', properties: props, geometry: polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys } });
        }
      }
    }
    return feats;
  }

  /* ── a window of the archive → features ──────────────────────────────────────────────────── */
  const lonToX = (lon, n) => Math.floor((lon + 180) / 360 * n);
  const latToY = (lat, n) => {
    const s = Math.sin(Math.max(-85.0511287798, Math.min(85.0511287798, lat)) * Math.PI / 180);
    return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
  };

  /* the highest zoom at which the whole bbox needs ≤ maxTiles tiles, clamped to the archive's zooms */
  function zoomFor(header, bbox, maxTiles) {
    let best = header.minZoom;
    for (let z = header.minZoom; z <= header.maxZoom && z <= MAX_ZOOM; z++) {
      const n = Math.pow(2, z);
      const c = (Math.min(n - 1, lonToX(bbox.east, n)) - Math.max(0, lonToX(bbox.west, n)) + 1) * (Math.min(n - 1, latToY(bbox.south, n)) - Math.max(0, latToY(bbox.north, n)) + 1);
      if (c <= maxTiles) best = z; else break;
    }
    return best;
  }

  async function windowOf(archive, o) {
    const h = archive.header;
    if (h.tileType !== 'mvt') fail('pmtiles-raster', { tileType: h.tileType });
    const opt = o || {};
    const bb = opt.bbox || h.bounds;
    const bbox = Array.isArray(bb) ? { west: bb[0], south: bb[1], east: bb[2], north: bb[3] } : bb;
    if (!bbox || ![bbox.west, bbox.south, bbox.east, bbox.north].every(Number.isFinite) || !(bbox.west < bbox.east) || !(bbox.south < bbox.north)) fail('pmtiles-bbox', { bbox: bbox || null });
    const maxTiles = Number.isFinite(opt.maxTiles) ? opt.maxTiles : DEFAULT_MAX_TILES;
    const stated = opt.zoom !== undefined && opt.zoom !== null;
    const z = stated ? opt.zoom : zoomFor(h, bbox, maxTiles);
    if (!Number.isInteger(z) || z < h.minZoom || z > h.maxZoom || z > MAX_ZOOM) fail('pmtiles-zoom', { zoom: z, min: h.minZoom, max: h.maxZoom });
    const n = Math.pow(2, z);
    const x0 = Math.max(0, lonToX(bbox.west, n)), x1 = Math.min(n - 1, lonToX(bbox.east, n));
    const y0 = Math.max(0, latToY(bbox.north, n)), y1 = Math.min(n - 1, latToY(bbox.south, n));
    const need = (x1 - x0 + 1) * (y1 - y0 + 1);
    if (need > maxTiles) fail('pmtiles-too-many-tiles', { tiles: need, maxTiles: maxTiles, zoom: z });
    const req0 = archive.supply.requests || 0;
    const feats = [];
    let opened = 0, empty = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = await archive.tile(z, x, y);
        if (!t) { empty++; continue; }
        opened++;
        for (const f of decodeTile(t, z, x, y)) feats.push(f);
      }
    }
    return {
      ok: true,
      fc: { type: 'FeatureCollection', features: feats },
      stats: {
        zoom: z, zoomStated: stated, tiles: opened, tilesAbsent: empty, tilesWanted: need,
        clipped: true, features: feats.length,
        requests: (archive.supply.requests || 0) - req0,
        bounds: { west: bbox.west, south: bbox.south, east: bbox.east, north: bbox.north },
        layers: Array.from(new Set(feats.map((f) => f.properties._layer))),
      },
    };
  }

  /* ── the doors ───────────────────────────────────────────────────────────────────────────── */
  async function guarded(fn) {
    try { return await fn(); }
    catch (e) {
      if (e && typeof e.why === 'string') return bad(e.why, e.detail === undefined || e.detail === null ? undefined : e.detail);
      throw e;
    }
  }
  function readSource(supply, o) {
    return guarded(async () => {
      if (!isSupply(supply)) return bad('source-unreadable', { reason: 'not-a-byte-supply' });
      const archive = await openSupply(supply);
      const r = await windowOf(archive, o);
      r.format = 'pmtiles';
      r.header = archive.header;
      return r;
    });
  }
  function readBytes(bytes, o) {
    const u = u8of(bytes);
    if (!u) return Promise.resolve(bad('pmtiles-not-pmtiles'));
    return readSource(residentSource(u), o);
  }
  /* an archive at an https URL, by the SAME range machinery a COG uses (js/gis-geotiff.js httpSource) */
  async function readUrl(url, o) {
    const opts = o || {};
    let made;
    if (opts.supply) made = { ok: true, source: opts.supply };
    else {
      const G = D.geotiff || (await import('./gis-geotiff.js')).makeGisGeotiff();
      made = await G.httpSource(url, opts);
    }
    if (!made.ok) return made;
    return readSource(made.source, opts);
  }
  /* open once, ask many windows (a pan does not re-read the directories) */
  function open(supply) {
    return guarded(async () => {
      if (!isSupply(supply)) return bad('source-unreadable', { reason: 'not-a-byte-supply' });
      const archive = await openSupply(supply);
      return { ok: true, archive: { header: archive.header, tile: archive.tile, metadata: archive.metadata, window: (o) => guarded(() => windowOf(archive, o)) } };
    });
  }

  const REFUSALS = ['pmtiles-not-pmtiles', 'pmtiles-version', 'pmtiles-truncated', 'pmtiles-corrupt', 'pmtiles-compression', 'pmtiles-raster', 'pmtiles-tile-type', 'pmtiles-zoom', 'pmtiles-bbox', 'pmtiles-too-many-tiles', 'pmtiles-mvt'];
  const API = { sniff, open, readBytes, readSource, readUrl, zxyToTileId, refusals: () => REFUSALS.slice(), _decodeTile: decodeTile };
  try { window.IntMapGisPmtiles = API; } catch (_) { }
  return API;
}
