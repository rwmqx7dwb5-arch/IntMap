/* ============================================================================
 *  IntMap · THE SHAPEFILE READER — window.IntMapGisShapefile   (#R738)
 * ----------------------------------------------------------------------------
 *  docs/GIS-CORE.md §6 said it plainly: 「Shapefile / GeoPackage を読めない。ZIP の中の `.shp` は
 *  名指しで断る（`.prj` も開かない）」 — js/geo-import.js line 690 returned `{why:'shapefile'}` for any
 *  archive containing one. That refusal was honest while there was no reader; it is this file's
 *  absence that it was reporting, and this file is that absence closed.
 *
 *  ⚠ THIS MODULE IS A DECODER AND NOTHING ELSE. Same contract as js/geo-import.js:
 *
 *      read(entries) → { ok:true,  fc, format:'shapefile', sourceCrs, prj, stats }
 *                    | { ok:false, why, detail }
 *
 *  `why` is a CODE, never a sentence — the nine languages live at the call site, because a decoder
 *  has no business knowing what UI it is in (docs/GIS-CORE.md §2.2). It does not register a dataset,
 *  it does not touch the map, and — deliberately — IT DOES NOT RE-PROJECT: the transform rule lives
 *  once, in js/geo-import.js's settleCrs over js/gis-crs.js, and a second one here would be the
 *  「同じ判断を 2 か所に持たせる」 that .agents/rules/no-ad-hoc-hardcoding.md forbids. What this file
 *  does about the coordinate system is give the caller everything needed to apply that one rule:
 *  the `.prj` TEXT verbatim (so `IntMapGisCrs.define()` has its first caller) and `sourceCrs` read
 *  out of the WKT's own AUTHORITY clause — or `null`. ⚠ It never NAMES 4326 on a guess: a GEOGCS
 *  that merely looks like WGS 84 is the file's prose, not its statement of a code.
 *
 *  ══ WHAT A SHAPEFILE IS ═══════════════════════════════════════════════════════════════════════
 *  Not a file — a set of files that share a base name, defined by ESRI Shapefile Technical
 *  Description 3-7855 (July 1998) for the .shp, and by dBASE III+/IV for the .dbf. Read here:
 *      .shp  the geometry           .dbf  the attributes       .prj  the coordinate system (WKT)
 *      .cpg  the attribute encoding
 *  ⚠ NOT read: .shx. It is an index of offsets into the .shp, and walking the .shp's own record
 *  headers from byte 100 visits exactly the same records in exactly the same order — the index
 *  answers 「where is record n」, a question a sequential reader never asks. Opening it would give a
 *  second opinion about the record count, which is a way to disagree and not a way to be right.
 *
 *  ══ ⚠⚠⚠ Z DOES NOT GO IN THE THIRD ORDINATE ══════════════════════════════════════════════════
 *  docs/GIS-CORE.md §1.5 holds the measurement: `IntMapGeodesy.sanitizeFeatures` DROPS positions it
 *  cannot repair and COLLAPSES the third coordinate member, so a height written as coordinates[2]
 *  never reaches a reader. Heights therefore travel BESIDE the positions, as the parallel array
 *  `_z` (and measures as `_m`) — the same shape a GPX track already uses, and the same invariant:
 *  the array is an axis only while its length equals the number of positions in that feature. So
 *  this file emits `_z` in the EMITTED traversal order, after ring reversal, never before.
 *
 *  ⚠ An M value below −10^38 is the specification's own "no measure" (3-7855, "Measures"), so it
 *  becomes null rather than a number 10^38 wide that every statistic would then average.
 *
 *  ══ ⚠⚠⚠ THE PARTS OF A POLYGON ARE TOLD APART BY ORIENTATION, NOT BY COUNT ════════════════════
 *  A Polygon record is one flat list of parts with no nesting and no flag: 3-7855 says the vertices
 *  of an outer ring run CLOCKWISE and those of a hole run counter-clockwise, and that is the ONLY
 *  thing that distinguishes them. Reading 「more than one part ⇒ the rest are holes」 turns an island
 *  group into a punched continent — Japan's 47 prefectures are mostly multi-part and hole-free.
 *  So each ring's signed area decides, and a counter-clockwise ring joins the outer ring before it.
 *  Output is normalised to RFC 7946 §3.1.6 (exterior counter-clockwise, holes clockwise), which is
 *  the reverse of ESRI's for both — so every ring is reversed, together with its `_z`/`_m` values.
 *
 *  ══ ⚠ TYPING IS NOT DONE HERE ═════════════════════════════════════════════════════════════════
 *  dBASE field values come back as TRIMMED STRINGS. `IntMapData.typeColumn` is the single place that
 *  decides what a column is (docs/GIS-CORE.md §1.1 — 「この判定は 1 か所にしかない」), and it already
 *  holds the rule this format most needs: a leading zero makes a code, not a number, so "01100"
 *  stays "01100" and does not join the next municipality's row (#R735). Typing here would be the
 *  second opinion that §1.1's last warning is about.
 *  ⚠ ONE EXCEPTION, AND IT IS A TRANSLATION RATHER THAN A TYPING: dBASE writes a date as the eight
 *  digits YYYYMMDD, which every 「is this a number」 test on earth answers yes to — 20200304 would be
 *  summed and averaged as twenty million. It is rewritten as the ISO YYYY-MM-DD it already means,
 *  so the date column is read as dates by the one place that decides.
 * ==========================================================================*/

export function makeGisShapefile() {
  return (function () {

    /* ══ 1 · THE SET OF FILES ══════════════════════════════════════════════════════════════════ */

    /* The four members this reader can use, plus the one it names to explain itself. Extensions are
       a property of the FORMAT here (3-7855 fixes these suffixes), not the operating-system hint
       js/geo-import.js refuses to read a grammar from — a .shp is identified by its 9994 header
       below, and the suffix only says which member of the set a byte range belongs to. */
    const MEMBERS = ['shp', 'dbf', 'shx', 'prj', 'cpg'];

    function baseAndExt(name) {
      const n = String(name == null ? '' : name).replace(/\\/g, '/');
      const slash = n.lastIndexOf('/');
      const leaf = n.slice(slash + 1);
      const dot = leaf.lastIndexOf('.');
      if (dot <= 0) return null;
      return { base: n.slice(0, slash + 1) + leaf.slice(0, dot), ext: leaf.slice(dot + 1).toLowerCase() };
    }

    /* `__MACOSX/` holds AppleDouble twins of every entry — same names, resource forks for bytes.
       Reading them as a second set is how an archive with one shapefile reports two. */
    function usable(name) {
      const n = String(name == null ? '' : name).replace(/\\/g, '/');
      if (!n || n.charAt(n.length - 1) === '/') return false;
      if (/^__MACOSX\//.test(n)) return false;
      return !/(^|\/)\._/.test(n);
    }

    /* entries → the groups that contain a .shp, keyed by base name (case-insensitively, because
       FOO.SHP and foo.dbf are one set on the filesystems that wrote them). */
    function group(entries) {
      const groups = new Map();
      for (const e of (Array.isArray(entries) ? entries : [])) {
        if (!e || !usable(e.name)) continue;
        const p = baseAndExt(e.name);
        if (!p || MEMBERS.indexOf(p.ext) < 0) continue;
        const key = p.base.toLowerCase();
        let g = groups.get(key);
        if (!g) { g = { base: p.base, files: {} }; groups.set(key, g); }
        /* First writer wins: a ZIP may legitimately carry a duplicate name, and picking the later
           one silently would make the answer depend on archive order. */
        if (!g.files[p.ext]) g.files[p.ext] = bytesOf(e.bytes);
      }
      const out = [];
      for (const g of groups.values()) if (g.files.shp) out.push(g);
      return out;
    }

    function bytesOf(b) {
      if (b instanceof Uint8Array) return b;
      if (b instanceof ArrayBuffer) return new Uint8Array(b);
      if (b && typeof b.byteLength === 'number' && b.buffer) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
      return null;
    }

    /* ══ 2 · THE .shp ══════════════════════════════════════════════════════════════════════════ */

    /* 3-7855's shape types, decomposed into the three facts a parser needs. The Z forms carry M as
       well (and the M part is OPTIONAL — the record simply ends early when the writer had none),
       which is why `m` here says 「may be present」 and the byte count decides. */
    const SHAPES = {
      0: { kind: 'null', z: false, m: false },
      1: { kind: 'point', z: false, m: false },
      3: { kind: 'line', z: false, m: false },
      5: { kind: 'polygon', z: false, m: false },
      8: { kind: 'multipoint', z: false, m: false },
      11: { kind: 'point', z: true, m: true },
      13: { kind: 'line', z: true, m: true },
      15: { kind: 'polygon', z: true, m: true },
      18: { kind: 'multipoint', z: true, m: true },
      21: { kind: 'point', z: false, m: true },
      23: { kind: 'line', z: false, m: true },
      25: { kind: 'polygon', z: false, m: true },
      28: { kind: 'multipoint', z: false, m: true },
    };

    /* 3-7855, "Measures": 「Any floating point number smaller than –10^38 is considered by a
       shapefile reader to represent a 'no data' value」. */
    const NO_MEASURE = -1e38;
    const measure = (v) => (typeof v === 'number' && isFinite(v) && v > NO_MEASURE) ? v : null;

    function corrupt(at, expected, got) {
      return { ok: false, why: 'shapefile-corrupt', detail: { at: at, expected: expected, got: got === undefined ? null : got } };
    }

    function readShp(bytes) {
      if (!bytes || bytes.length < 100) return corrupt(0, 'header-100-bytes', bytes ? bytes.length : 0);
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      /* The file code and the version are the only two things that say 「this is a .shp」 — the name
         said nothing (js/geo-import.js §①②). Both are in the specification's own words. */
      const code = dv.getUint32(0, false);
      if (code !== 9994) return corrupt(0, 'file-code-9994', code);
      const version = dv.getInt32(28, true);
      if (version !== 1000) return corrupt(28, 'version-1000', version);
      const headerType = dv.getInt32(32, true);
      if (!SHAPES[headerType]) return { ok: false, why: 'shapefile-type', detail: { type: headerType } };

      /* The header's length is in 16-bit words and covers the whole file. It is used as a BOUND
         rather than as the truth: a truncated archive writes a header that still claims the whole
         file, so the walk below stops at the bytes that are actually here and says so. */
      const declared = dv.getInt32(24, false) * 2;

      const shapes = [];
      let nulls = 0, mixed = 0;
      let p = 100;
      while (p + 8 <= bytes.length) {
        const contentWords = dv.getInt32(p + 4, false);
        if (!(contentWords >= 2)) return corrupt(p + 4, 'record-content-length', contentWords);
        const contentBytes = contentWords * 2;
        if (p + 8 + contentBytes > bytes.length) return corrupt(p + 8, 'record-content-' + contentBytes + '-bytes', bytes.length - p - 8);
        const o = p + 8;
        const type = dv.getInt32(o, true);
        const spec = SHAPES[type];
        if (!spec) return { ok: false, why: 'shapefile-type', detail: { type: type, record: shapes.length + 1 } };
        /* 3-7855 allows a Null shape inside any file; anything else that differs from the header's
           type is a file whose records disagree with its own declaration. */
        if (type !== 0 && type !== headerType) { mixed++; }
        const parsed = readShape(dv, o, contentBytes, spec);
        if (!parsed) return corrupt(o, 'shape-' + type + '-body', contentBytes);
        if (spec.kind === 'null') nulls++;
        shapes.push(parsed);
        p = o + contentBytes;
      }
      if (mixed) return corrupt(100, 'records-of-type-' + headerType, 'mixed:' + mixed);
      return { ok: true, shapes: shapes, headerType: headerType, nulls: nulls, declaredBytes: declared, readBytes: p };
    }

    /* One record body → { kind, xy, z, m, parts } in the file's own order. Positions stay flat and
       `parts` holds the start index of each part, because that is exactly how the format writes it
       and the assembly below wants both. */
    function readShape(dv, o, len, spec) {
      const end = o + len;
      if (spec.kind === 'null') return { kind: 'null' };

      if (spec.kind === 'point') {
        if (o + 20 > end) return null;
        const xy = [[dv.getFloat64(o + 4, true), dv.getFloat64(o + 12, true)]];
        let q = o + 20;
        const z = [], m = [];
        if (spec.z) { if (q + 8 > end) return null; z.push(dv.getFloat64(q, true)); q += 8; }
        if (spec.m && q + 8 <= end) { m.push(measure(dv.getFloat64(q, true))); q += 8; }
        return { kind: 'point', xy: xy, z: spec.z ? z : null, m: m.length ? m : null, parts: [0] };
      }

      if (spec.kind === 'multipoint') {
        if (o + 40 > end) return null;
        const n = dv.getInt32(o + 36, true);
        if (!(n >= 0) || o + 40 + n * 16 > end) return null;
        const xy = [];
        for (let i = 0; i < n; i++) xy.push([dv.getFloat64(o + 40 + i * 16, true), dv.getFloat64(o + 48 + i * 16, true)]);
        let q = o + 40 + n * 16;
        const zm = readZM(dv, q, end, n, spec);
        if (!zm) return null;
        return { kind: 'multipoint', xy: xy, z: zm.z, m: zm.m, parts: xy.map((_, i) => i) };
      }

      /* PolyLine and Polygon share a body exactly; only the meaning of the parts differs. */
      if (o + 44 > end) return null;
      const numParts = dv.getInt32(o + 36, true);
      const numPoints = dv.getInt32(o + 40, true);
      if (!(numParts >= 0) || !(numPoints >= 0)) return null;
      const partsAt = o + 44;
      const pointsAt = partsAt + numParts * 4;
      if (pointsAt + numPoints * 16 > end) return null;
      const parts = [];
      for (let i = 0; i < numParts; i++) parts.push(dv.getInt32(partsAt + i * 4, true));
      const xy = [];
      for (let i = 0; i < numPoints; i++) xy.push([dv.getFloat64(pointsAt + i * 16, true), dv.getFloat64(pointsAt + i * 16 + 8, true)]);
      const zm = readZM(dv, pointsAt + numPoints * 16, end, numPoints, spec);
      if (!zm) return null;
      return { kind: spec.kind, xy: xy, z: zm.z, m: zm.m, parts: parts };
    }

    /* The Z and M blocks that follow the positions: a two-double range this reader ignores (it is
       the min/max of the array that follows, i.e. a restatement) and then one double per position.
       ⚠ The M block is optional even where the type declares it — that is the specification's, not
       a tolerance of ours — so its absence is «no measures», never a parse failure. */
    function readZM(dv, q, end, n, spec) {
      let z = null, m = null;
      if (spec.z) {
        if (q + 16 + n * 8 > end) return null;
        q += 16;
        z = [];
        for (let i = 0; i < n; i++) { z.push(dv.getFloat64(q, true)); q += 8; }
      }
      if (spec.m && q + 16 + n * 8 <= end) {
        q += 16;
        m = [];
        for (let i = 0; i < n; i++) { m.push(measure(dv.getFloat64(q, true))); q += 8; }
      }
      return { z: z, m: m };
    }

    /* ══ 3 · RINGS → GeoJSON ═══════════════════════════════════════════════════════════════════ */

    /* The shoelace of a ring in raw lng/lat. Positive is counter-clockwise, negative clockwise —
       the sign is all that is read, so the fact that degrees are not a metric plane does not enter:
       orientation is invariant under any orientation-preserving map, which every projection this
       app can receive is. */
    function signedArea(pts) {
      let a = 0;
      for (let i = 0, n = pts.length; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n];
        a += p[0] * q[1] - q[0] * p[1];
      }
      return a / 2;
    }

    /* A part of the flat position list, with its parallel values, as one ring/line. */
    function slicePart(shape, from, to) {
      return {
        xy: shape.xy.slice(from, to),
        z: shape.z ? shape.z.slice(from, to) : null,
        m: shape.m ? shape.m.slice(from, to) : null,
      };
    }

    function partsOf(shape) {
      const out = [];
      const starts = shape.parts.length ? shape.parts : [0];
      for (let i = 0; i < starts.length; i++) {
        const from = starts[i], to = (i + 1 < starts.length) ? starts[i + 1] : shape.xy.length;
        if (to > from) out.push(slicePart(shape, from, to));
      }
      return out;
    }

    function reverse(ring) {
      ring.xy.reverse();
      if (ring.z) ring.z.reverse();
      if (ring.m) ring.m.reverse();
      return ring;
    }

    function close(ring) {
      const n = ring.xy.length;
      if (n < 2) return ring;
      const a = ring.xy[0], b = ring.xy[n - 1];
      if (a[0] === b[0] && a[1] === b[1]) return ring;
      ring.xy.push([a[0], a[1]]);
      if (ring.z) ring.z.push(ring.z[0]);
      if (ring.m) ring.m.push(ring.m[0]);
      return ring;
    }

    /* Collects the parallel values in the order the coordinates were emitted — the only order in
       which `_z` is an axis (docs/GIS-CORE.md §1.5). */
    function collector() {
      const z = [], m = [];
      let anyZ = false, anyM = false;
      return {
        take(ring) {
          for (let i = 0; i < ring.xy.length; i++) {
            const zv = ring.z ? ring.z[i] : null;
            const mv = ring.m ? ring.m[i] : null;
            if (zv != null && isFinite(zv)) anyZ = true;
            if (mv != null) anyM = true;
            z.push(zv == null || !isFinite(zv) ? null : zv);
            m.push(mv == null ? null : mv);
          }
        },
        write(props) {
          if (anyZ) props._z = z;
          if (anyM) props._m = m;
        },
      };
    }

    function buildGeometry(shape, notes) {
      if (shape.kind === 'null') return { geometry: null, values: null };
      const c = collector();

      if (shape.kind === 'point') {
        c.take({ xy: shape.xy, z: shape.z, m: shape.m });
        return { geometry: { type: 'Point', coordinates: shape.xy[0] }, values: c };
      }

      if (shape.kind === 'multipoint') {
        /* ⚠ Emitted as one Feature per point rather than as a MultiPoint: js/geo-import.js's
           flatten() already does exactly this for the same measured reason (sanitizeFeatures drops
           MultiPoint outright), and a flattened point keeps its own single-valued `_z`, which a
           shared one could not. */
        const feats = [];
        for (let i = 0; i < shape.xy.length; i++) {
          const one = collector();
          one.take({ xy: [shape.xy[i]], z: shape.z ? [shape.z[i]] : null, m: shape.m ? [shape.m[i]] : null });
          feats.push({ geometry: { type: 'Point', coordinates: shape.xy[i] }, values: one });
        }
        return { multi: feats };
      }

      const parts = partsOf(shape);
      if (!parts.length) return { geometry: null, values: null };

      if (shape.kind === 'line') {
        const lines = [];
        for (const p of parts) { c.take(p); lines.push(p.xy); }
        return { geometry: lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines }, values: c };
      }

      /* Polygon: orientation decides, and nothing else does. */
      const polys = [];
      for (const raw of parts) {
        const ring = close(raw);
        if (ring.xy.length < 4) { notes.degenerateRings++; continue; }
        const a = signedArea(ring.xy);
        if (a === 0) notes.zeroAreaRings++;
        const outer = a < 0;                                   /* ESRI: clockwise is the outside */
        if (outer || !polys.length) {
          if (!outer) notes.orphanHoles++;                     /* a hole with nothing to be a hole of */
          polys.push([ring]);
        } else polys[polys.length - 1].push(ring);
      }
      if (!polys.length) return { geometry: null, values: null };
      const out = [];
      for (const rings of polys) {
        const r = [];
        for (const ring of rings) { reverse(ring); c.take(ring); r.push(ring.xy); }   /* → RFC 7946 winding */
        out.push(r);
      }
      return { geometry: out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out }, values: c };
    }

    /* ══ 4 · THE .dbf ══════════════════════════════════════════════════════════════════════════ */

    /* The field types dBASE III+/IV stores as TEXT inside the fixed-width record. Anything else
       (binary, OLE, autoincrement, timestamp) holds bytes whose meaning is not in this file, so it
       is refused BY NAME instead of being handed over as mojibake. */
    const FIELD_TYPES = ['C', 'N', 'F', 'D', 'L', 'M'];

    /* dBASE's published Language Driver ID table: byte 29 of the header names a code page. This is a
       table in the FORMAT, not a list of cases — every value is somebody's published assignment, and
       the alternative is to read every non-ASCII attribute in the wrong alphabet. */
    const LDID = {
      0x01: 437, 0x02: 850, 0x03: 1252, 0x04: 10000, 0x08: 865, 0x09: 437, 0x0A: 850, 0x0B: 437,
      0x0D: 437, 0x0E: 850, 0x0F: 437, 0x10: 850, 0x11: 437, 0x12: 850, 0x13: 932, 0x14: 850,
      0x15: 437, 0x16: 850, 0x17: 865, 0x18: 437, 0x19: 437, 0x1A: 850, 0x1B: 437, 0x1C: 863,
      0x1D: 850, 0x1F: 852, 0x22: 852, 0x23: 852, 0x24: 860, 0x25: 850, 0x26: 866, 0x37: 850,
      0x40: 852, 0x4D: 936, 0x4E: 949, 0x4F: 950, 0x50: 874, 0x57: 1252, 0x58: 1252, 0x59: 1252,
      0x64: 852, 0x65: 866, 0x66: 865, 0x67: 861, 0x6A: 737, 0x6B: 857, 0x78: 950, 0x79: 949,
      0x7A: 936, 0x7B: 932, 0x7C: 874, 0x7D: 1255, 0x7E: 1256, 0x87: 852, 0x88: 857, 0x89: 861,
      0x8A: 737, 0x8B: 852, 0x8C: 852, 0xC8: 1250, 0xC9: 1251, 0xCA: 1254, 0xCB: 1253, 0xCC: 1257,
    };

    /* A code page NUMBER → the labels the Encoding Standard might know it by. The single-byte pages
       are `cpNNN` / `windows-NNN` / `ibmNNN` there, which is a naming rule rather than a list; the
       three that are not are Microsoft's Unicode and Mac pages, named here because no rule derives
       them. ⚠ TextDecoder THROWS on a label it does not know, so every candidate is tried by
       construction and the first that exists wins — the decoder itself is the authority on what it
       supports, and this file never claims an encoding the runtime cannot actually apply. */
    const CODEPAGE_NAMED = { 65001: 'utf-8', 1200: 'utf-16le', 10000: 'macintosh' };
    function decoderFor(label) {
      if (!label) return null;
      try { return new TextDecoder(String(label)); } catch (_) { return null; }
    }
    function decoderForCodepage(n) {
      const named = CODEPAGE_NAMED[n];
      if (named) { const d = decoderFor(named); if (d) return { dec: d, label: named }; return null; }
      for (const label of ['cp' + n, 'windows-' + n, 'ibm' + n]) {
        const d = decoderFor(label);
        if (d) return { dec: d, label: label };
      }
      return null;
    }

    /* Which decoder reads the attribute bytes, and WHERE THAT WAS DECIDED — never silently. Order:
       the .cpg the writer shipped, then the header's LDID, then a measurement (does the record area
       decode as strict UTF-8?), and only then the fallback. */
    function chooseEncoding(bytes, from, to, cpgBytes) {
      if (cpgBytes && cpgBytes.length) {
        let text = '';
        try { text = new TextDecoder('utf-8').decode(cpgBytes).trim(); } catch (_) { text = ''; }
        if (text) {
          const direct = decoderFor(text);
          if (direct) return { dec: direct, label: text.toLowerCase(), from: 'cpg' };
          const n = /^\d+$/.test(text) ? Number(text) : null;
          const byNumber = n == null ? null : decoderForCodepage(n);
          if (byNumber) return { dec: byNumber.dec, label: byNumber.label, from: 'cpg' };
        }
      }
      const ldid = bytes[29];
      if (ldid && LDID[ldid]) {
        const byLdid = decoderForCodepage(LDID[ldid]);
        if (byLdid) return { dec: byLdid.dec, label: byLdid.label, from: 'ldid' };
      }
      try {
        const strict = new TextDecoder('utf-8', { fatal: true });
        strict.decode(bytes.subarray(from, to));
        return { dec: new TextDecoder('utf-8'), label: 'utf-8', from: 'utf-8-valid' };
      } catch (_) { }
      /* ⚠ Last, and stated as such: iso-8859-1 maps every byte to a character, so it never fails —
         which makes it a fallback and not a finding. `stats.encoding.from` says which it was. */
      return { dec: decoderFor('iso-8859-1') || new TextDecoder(), label: 'iso-8859-1', from: 'fallback' };
    }

    function readDbf(bytes, cpgBytes) {
      if (!bytes || bytes.length < 33) return corrupt(0, 'dbf-header-32-bytes', bytes ? bytes.length : 0);
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const numRecords = dv.getUint32(4, true);
      const headerLen = dv.getUint16(8, true);
      const recordLen = dv.getUint16(10, true);
      if (headerLen < 33 || headerLen > bytes.length) return corrupt(8, 'header-length-within-file', headerLen);
      if (recordLen < 1) return corrupt(10, 'record-length', recordLen);

      const fields = [];
      let p = 32, offset = 1;                                  /* byte 0 of a record is the deletion flag */
      while (p + 32 <= headerLen && bytes[p] !== 0x0D) {
        let nameEnd = 0;
        while (nameEnd < 11 && bytes[p + nameEnd] !== 0) nameEnd++;
        const rawName = bytes.subarray(p, p + nameEnd);
        const type = String.fromCharCode(bytes[p + 11]);
        const len = bytes[p + 16];
        if (FIELD_TYPES.indexOf(type) < 0) return { ok: false, why: 'shapefile-dbf-field-type', detail: { type: type, at: fields.length } };
        fields.push({ raw: rawName, type: type, at: offset, len: len });
        offset += len;
        p += 32;
      }
      if (!fields.length) return corrupt(32, 'at-least-one-field', 0);

      const dataFrom = headerLen;
      const dataTo = Math.min(bytes.length, headerLen + numRecords * recordLen);
      const enc = chooseEncoding(bytes, dataFrom, dataTo, cpgBytes);
      const name = (b) => enc.dec.decode(b).replace(/\0+$/, '').trim();
      for (const f of fields) f.name = name(f.raw);

      const available = Math.floor((bytes.length - headerLen) / recordLen);
      if (available < numRecords) return corrupt(dataFrom, numRecords + '-records', available);

      const rows = [];
      let deleted = 0;
      const memoFields = fields.filter((f) => f.type === 'M').map((f) => f.name);
      for (let i = 0; i < numRecords; i++) {
        const at = headerLen + i * recordLen;
        if (bytes[at] === 0x2A) { deleted++; rows.push(null); continue; }   /* '*' — the row is gone */
        const row = {};
        for (const f of fields) {
          let v = enc.dec.decode(bytes.subarray(at + f.at, at + f.at + f.len)).replace(/\0/g, '').trim();
          /* ⚠ The one rewrite (see the header): YYYYMMDD is a date written as eight digits, and
             every numeric test answers yes to it. Anything else in a D field is left alone rather
             than repaired — an unreadable date is the file's statement, not ours to invent. */
          if (f.type === 'D' && /^\d{8}$/.test(v)) v = v.slice(0, 4) + '-' + v.slice(4, 6) + '-' + v.slice(6, 8);
          /* ⚠ A memo field holds a block number pointing into a .dbt, which is not part of a
             shapefile and is not in the archive. The VALUE is not available — reporting the block
             number as the text would be a number pretending to be a sentence. */
          if (f.type === 'M') v = '';
          row[f.name] = v;
        }
        rows.push(row);
      }
      return {
        ok: true, rows: rows, deleted: deleted, fields: fields.map((f) => f.name),
        memoFields: memoFields, encoding: { label: enc.label, from: enc.from },
      };
    }

    /* ══ 5 · THE .prj ══════════════════════════════════════════════════════════════════════════ */

    /* The WKT's own AUTHORITY (WKT1) or ID (WKT2) clause, and nothing inferred. ⚠ The LAST match is
       the answer: a WKT nests — the datum, the spheroid, the primem and each axis may carry their
       own authority — and the outermost object is the one whose closing clause comes last. A file
       whose CRS states no authority returns null, and null means 「the file did not say」, which is a
       different claim from 「it was 4326」 (js/geo-import.js says the same sentence about CSV). */
    const AUTHORITY_RE = /\b(?:AUTHORITY|ID)\s*\[\s*"EPSG"\s*,\s*"?(\d{3,6})"?\s*\]/gi;
    function crsFromWkt(text) {
      if (!text) return null;
      AUTHORITY_RE.lastIndex = 0;
      let m, last = null;
      while ((m = AUTHORITY_RE.exec(text))) last = m[1];
      return last ? ('EPSG:' + last) : null;
    }

    function prjText(bytes) {
      if (!bytes || !bytes.length) return null;
      let t = '';
      try { t = new TextDecoder('utf-8').decode(bytes); } catch (_) { return null; }
      t = t.replace(/^﻿/, '').trim();
      return t || null;
    }

    /* ══ 6 · THE ONE QUESTION A CALLER ASKS ════════════════════════════════════════════════════ */

    /* Every refusal this module can answer with. Published rather than described so that the call
       site's nine sentences can be checked against it (docs/GIS-CORE.md §2.2: 「コードを足したら文も
       足す」) instead of against somebody's reading of this file. */
    const REFUSALS = Object.freeze([
      'shapefile-missing-shp',
      'shapefile-multiple',
      'shapefile-type',
      'shapefile-corrupt',
      'shapefile-dbf-field-type',
      'shapefile-count-mismatch',
      'no-features',
    ]);

    async function read(entries) {
      const groups = group(entries);
      if (!groups.length) {
        const names = (Array.isArray(entries) ? entries : []).map((e) => (e && e.name) || '').filter(Boolean);
        return { ok: false, why: 'shapefile-missing-shp', detail: { entries: names.length } };
      }
      /* ⚠ MORE THAN ONE SET IS NOT THIS MODULE'S CHOICE TO MAKE. 「1 つ目を使う」 is the defect this
         repository keeps recording: an answer that depends on archive order, given silently. The
         base names go back so the reader can be asked which one. */
      if (groups.length > 1) {
        return { ok: false, why: 'shapefile-multiple', detail: { bases: groups.map((g) => g.base).sort() } };
      }
      const g = groups[0];

      const shp = readShp(g.files.shp);
      if (!shp.ok) return shp;

      let dbf = null;
      if (g.files.dbf) {
        dbf = readDbf(g.files.dbf, g.files.cpg);
        if (!dbf.ok) return dbf;
        /* ⚠ Aligning by index is the whole contract between the two files: record n of the .shp is
           row n of the .dbf. Trimming to the shorter one would not fail — it would produce a map
           whose attributes are one row out, which no later check can detect. */
        if (dbf.rows.length !== shp.shapes.length) {
          return { ok: false, why: 'shapefile-count-mismatch', detail: { shapes: shp.shapes.length, records: dbf.rows.length } };
        }
      }

      const notes = { degenerateRings: 0, zeroAreaRings: 0, orphanHoles: 0 };
      const features = [];
      let emptyShapes = 0;
      for (let i = 0; i < shp.shapes.length; i++) {
        const row = dbf ? dbf.rows[i] : {};
        if (row === null) continue;                            /* deleted in the .dbf ⇒ the pair is gone */
        const built = buildGeometry(shp.shapes[i], notes);
        const parts = built.multi || [built];
        for (const one of parts) {
          const props = Object.assign({}, row);
          if (one.values) one.values.write(props);
          if (one.geometry === null && shp.shapes[i].kind !== 'null') emptyShapes++;
          /* ⚠ A Null shape keeps its attributes and carries `geometry:null`, which RFC 7946 §3.2
             allows explicitly. Dropping it would silently delete a row of the table. */
          features.push({ type: 'Feature', geometry: one.geometry, properties: props });
        }
      }
      if (!features.length) return { ok: false, why: 'no-features', detail: { shapes: shp.shapes.length } };

      const prj = prjText(g.files.prj);
      return {
        ok: true,
        fc: { type: 'FeatureCollection', features: features },
        format: 'shapefile',
        /* ⚠ Read from the .prj's AUTHORITY, never guessed, and NOT applied: transforming is
           js/geo-import.js's settleCrs over js/gis-crs.js, and `prj` is here so that
           IntMapGisCrs.define(sourceCrs, prj) can give that one rule a definition it lacks. */
        sourceCrs: crsFromWkt(prj),
        prj: prj,
        stats: {
          base: g.base,
          files: MEMBERS.filter((e) => !!g.files[e]),
          shapeType: shp.headerType,
          shapes: shp.shapes.length,
          features: features.length,
          nullShapes: shp.nulls,
          emptyShapes: emptyShapes,
          records: dbf ? dbf.rows.length : 0,
          deleted: dbf ? dbf.deleted : 0,
          fields: dbf ? dbf.fields : [],
          memoFields: dbf ? dbf.memoFields : [],
          encoding: dbf ? dbf.encoding : null,
          degenerateRings: notes.degenerateRings,
          zeroAreaRings: notes.zeroAreaRings,
          orphanHoles: notes.orphanHoles,
        },
      };
    }

    const API = {
      read,
      /* exposed because a caller that wants to ASK the reader which sets an archive holds (to offer
         the choice `shapefile-multiple` refuses to make for it) must not re-implement the grouping */
      group: (entries) => group(entries).map((g) => ({ base: g.base, files: MEMBERS.filter((e) => !!g.files[e]) })),
      refusals: () => REFUSALS.slice(),
    };
    try { window.IntMapGisShapefile = API; } catch (_) { }
    return API;
  })();
}
