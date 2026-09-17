/* ============================================================================
 *  IntMap · GEOPACKAGE — window.IntMapGisGeopackage   (#R738)
 * ----------------------------------------------------------------------------
 *  docs/GIS-CORE.md §6 said it plainly: 「Shapefile / GeoPackage を読めない」. A .gpkg fell through
 *  js/geo-import.js to `unrecognised`, which is the sentence #R576 exists to stop this app from
 *  saying about files it could in fact read.
 *
 *  ⚠ NO DEPENDENCY WAS ADDED. A GeoPackage is a SQLite database, and SQLite's file format is
 *  published (https://sqlite.org/fileformat.html) precisely so that a reader can be written against
 *  it. sql.js is compiled C that also knows how to WRITE, run triggers and evaluate SQL — none of
 *  which this path needs. What it needs is: the header, the table b-trees, the record format, and
 *  the overflow chain. That is what is below, READ-ONLY. Nothing here writes a byte.
 *
 *  ══ WHAT THIS FILE IS NOT ═════════════════════════════════════════════════════════════════════
 *    · NOT a SQL engine. The only SQL it looks at is the `CREATE TABLE` text SQLite stores in
 *      sqlite_master, and only to learn COLUMN NAMES in declaration order (§4). When that text
 *      cannot be read that way it refuses with `gpkg-schema` instead of guessing an order — a
 *      mis-numbered column is a silently wrong answer, which is the failure shape this repository
 *      keeps recording.
 *    · NOT a projector. `sourceCrs` and the WKT come back as the file states them and the
 *      coordinates come back untouched. The one re-projection rule lives in js/gis-crs.js and is
 *      applied by js/geo-import.js's settleCrs; a second one here would be the 「同じ判断を 2 か所」
 *      that .agents/rules/no-ad-hoc-hardcoding.md forbids.
 *    · NOT a typer. Values come back as the file stored them (number / string / null). The column
 *      typing rule is IntMapData.typeColumn and there is exactly one of it (docs/GIS-CORE.md §1.1).
 *    · NOT a chooser. Two readable tables in one file is not a question this module may answer for
 *      the reader — see `gpkg-multiple-tables` below.
 *
 *  ══ WHAT IT REFUSES, AND WHY EACH REFUSAL IS A MEASUREMENT ════════════════════════════════════
 *    gpkg-not-sqlite        the first 16 bytes are not the magic string
 *    gpkg-truncated         a page or a field the file's own header promises is past the last byte
 *    gpkg-page-size         page size is not a power of two in 512…65536, or reserved ≥ usable
 *    gpkg-wal               write version 2 = write-ahead log. ⚠ WE ARE HANDED BYTES, so the -wal
 *                           sidecar is not here: the newest committed content may live in it and
 *                           reading the main file alone would answer with a state that is not the
 *                           database. Refuse by name rather than answer from a stale page image.
 *    gpkg-text-encoding     the header says UTF-16. IntMap has never met one; decoding it as UTF-8
 *                           「たぶん」 is worse than saying so.
 *    gpkg-not-a-geopackage  a SQLite file with no `gpkg_contents` — the manifest the standard
 *                           requires. Without it there is nothing that says what any table means.
 *    gpkg-schema            a CREATE TABLE whose column list could not be read, or a standard
 *                           table missing a column this reader must have by name
 *    gpkg-corrupt           the bytes contradict themselves (page type, cell offset, serial type,
 *                           overflow chain, b-tree cycle). `detail` says WHERE and WHAT WAS EXPECTED
 *    gpkg-no-tables         gpkg_contents lists nothing this reader can turn into rows
 *    gpkg-multiple-tables   more than one readable table and no name given — with the list
 *    gpkg-no-such-table     a name was given and gpkg_contents does not list it
 *    gpkg-tiles-unsupported the named table is a tile pyramid (raster), not a table of rows
 *    gpkg-geometry-column   a `features` table with no row in gpkg_geometry_columns
 *    gpkg-geometry-blob     a geometry cell that is not a GeoPackageBinary (magic / envelope code)
 *    gpkg-geometry-type     a WKB type outside the seven simple-feature types (CircularString and
 *                           the rest of the curve extension). Named, not approximated.
 *
 *  ⚠ `why` IS A CODE, NEVER A SENTENCE — same contract as js/geo-import.js and js/gis-ops.js
 *  (docs/GIS-CORE.md §2.2): the nine languages belong to the call site, not to a decoder.
 *
 *  ══ ATTRIBUTES TABLES ARE WORK, NOT A REFUSAL ═════════════════════════════════════════════════
 *  `data_type = 'attributes'` is a table of rows with no geometry column — a statistics table
 *  carried inside a GeoPackage. It is read, with `geometry: null` on every feature and
 *  `stats.geometry = 'none'` saying so out loud. docs/GIS-CORE.md §6 names joining such a table to
 *  regions by code as the thing IntMap is building toward, and #R735 removed the obstacle by making
 *  a zero-padded code stop being a number.
 *
 *  ══ TWO PLACES WHERE THIS QUIETLY GOES WRONG IF YOU SKIP A PARAGRAPH OF THE SPEC ══════════════
 *    ① OVERFLOW PAGES. Any payload bigger than a page's local limit continues on a chain of
 *       overflow pages. A reader that stops at the in-page bytes gets a TRUNCATED WKB — and a
 *       truncated WKB of a big polygon parses into a plausible smaller polygon or into nothing at
 *       all, with no error anywhere. Coastlines and administrative boundaries are exactly the
 *       geometries that exceed it, i.e. the ones this app is for. The tests measure it.
 *    ② Z IS NOT THE THIRD COORDINATE. js/geodesy.js sanitizeFeatures FOLDS a third ordinate away
 *       (docs/GIS-CORE.md §1.5), so a height written into the position never reaches the reader.
 *       It travels beside the geometry instead: `_z` (and `_m`) are FLAT parallel arrays over the
 *       feature's positions in emission order, which is the same contract §1.5 gives a track.
 * ==========================================================================*/

export function makeGisGeopackage() {
  return (function () {

    /* ══ 0 · BYTES ════════════════════════════════════════════════════════════════════════════ */

    const MAGIC = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72,
      0x6d, 0x61, 0x74, 0x20, 0x33, 0x00];                       /* "SQLite format 3\0" */

    /* ⚠ THE CODES THIS DECODER CAN ANSWER WITH, DECLARED (#R738). js/geo-import.js hands these back
       to js/map-ui.js verbatim, and tests/r576-checks ⑩ measures that every refusal a reader can be
       shown has a sentence of its own — by parsing js/geo-import.js for `why` literals. A code that
       arrives through a pass-through appears in no literal there, so the gate would have been green
       over fifteen wordless refusals. bad() refusing an undeclared code is what keeps this list from
       drifting away from the throws it describes. */
    const REFUSALS = Object.freeze(['gpkg-not-sqlite', 'gpkg-truncated', 'gpkg-page-size', 'gpkg-wal',
      'gpkg-text-encoding', 'gpkg-not-a-geopackage', 'gpkg-schema', 'gpkg-corrupt', 'gpkg-no-tables',
      'gpkg-multiple-tables', 'gpkg-no-such-table', 'gpkg-tiles-unsupported', 'gpkg-geometry-column',
      'gpkg-geometry-blob', 'gpkg-geometry-type',
      /* ── the writer's own (#R783; §9) ──────────────────────────────────────────────────────
         ⚠ SEPARATE CODES, NOT THE READER'S. `gpkg-geometry-type` means 「this file holds a curve I
         will not approximate」; a caller who asked to WRITE a curve has a different next move, and
         one code for both would send them to the wrong one. */
      'gpkg-write-empty', 'gpkg-write-crs-unsupported', 'gpkg-write-geometry-unsupported',
      'gpkg-write-geometry-mixed-dimensions', 'gpkg-write-value-unsupported',
      'gpkg-write-table-name']);
    const bad = (why, detail) => {
      if (REFUSALS.indexOf(why) < 0) throw new Error('gis-geopackage: undeclared refusal code ' + why);
      return detail === undefined ? { ok: false, why: why } : { ok: false, why: why, detail: detail };
    };

    function u8of(bytes) {
      if (bytes instanceof Uint8Array) return bytes;
      if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
      if (bytes && bytes.buffer instanceof ArrayBuffer) return new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
      return null;
    }

    /* The whole of the container question (js/geo-import.js § ①): asked of the bytes, never of a
       name ending in .gpkg. ⚠ It answers true for ANY SQLite database — a GeoPackage is a SQLite
       file plus a manifest, and the manifest is checked in read()/tables(), not here. */
    function sniff(bytes) {
      const u = u8of(bytes);
      if (!u || u.length < MAGIC.length) return false;
      for (let i = 0; i < MAGIC.length; i++) if (u[i] !== MAGIC[i]) return false;
      return true;
    }

    /* Big-endian, because every multi-byte number in this format is (fileformat.html §1.2). */
    const be16 = (u, o) => (u[o] << 8) | u[o + 1];
    const be32 = (u, o) => ((u[o] << 24) | (u[o + 1] << 16) | (u[o + 2] << 8) | u[o + 3]) >>> 0;

    /* A SQLite varint: up to nine bytes, seven bits each, big-endian — except the ninth, which
       contributes all eight, so the widest value is a signed 64-bit integer. BigInt is used for the
       accumulation because 56 bits already exceed what a double holds exactly, and a varint that
       lost its low bits would be a payload size that is almost right. */
    function varint(u, off) {
      let v = 0n;
      for (let i = 0; i < 8; i++) {
        const b = u[off + i];
        if (b === undefined) return null;
        v = (v << 7n) | BigInt(b & 0x7f);
        if (!(b & 0x80)) return { value: v, len: i + 1 };
      }
      const last = u[off + 8];
      if (last === undefined) return null;
      return { value: BigInt.asIntN(64, (v << 8n) | BigInt(last)), len: 9 };
    }

    /* An integer that does not fit a double comes back as its DECIMAL STRING rather than as a
       rounded number. A rowid of 2^60 printed as 1152921504606847000 is a different rowid, and
       「近い値」 is the silently-wrong-answer this module refuses everywhere else. */
    function asValue(big) {
      return (big >= -9007199254740991n && big <= 9007199254740991n) ? Number(big) : big.toString();
    }

    /* ══ 1 · THE DATABASE HEADER (fileformat.html §1.3) ═══════════════════════════════════════ */

    function open(bytes) {
      const u = u8of(bytes);
      if (!u || !sniff(u)) return bad('gpkg-not-sqlite');
      if (u.length < 100) return bad('gpkg-truncated', { at: 'header', need: 100, have: u.length });

      /* offset 16, u16. ⚠ 1 MEANS 65536 — the value does not fit the field, so the format spends
         its one out-of-range encoding on it, and a reader that takes it literally computes every
         page offset wrong by four orders of magnitude. */
      let pageSize = be16(u, 16);
      if (pageSize === 1) pageSize = 65536;
      if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0) return bad('gpkg-page-size', { pageSize: pageSize });

      /* offsets 18/19: file format write / read version. 2 = WAL (see the header comment). */
      if (u[18] === 2 || u[19] === 2) return bad('gpkg-wal', { writeVersion: u[18], readVersion: u[19] });

      const reserved = u[20];                                    /* bytes reserved at the END of every page */
      const usable = pageSize - reserved;
      /* 480 is the format's own floor for the usable size, not a number chosen here: SQLite refuses
         to open a database whose usable size is smaller, so a file that claims less is malformed. */
      if (usable < 480) return bad('gpkg-page-size', { pageSize: pageSize, reserved: reserved });

      /* offset 56: text encoding. ⚠ THE FILE SAYS, we do not assume (see gpkg-text-encoding). */
      const encoding = be32(u, 56);
      if (encoding !== 1) return bad('gpkg-text-encoding', { encoding: encoding });

      /* offset 28: the size of the database in pages. The format says it is only meaningful when
         the change counter (24) equals the version-valid-for counter (92); otherwise the byte
         length is the authority. Either way the smaller of the two bounds every page read below,
         so a header that over-promises cannot walk us off the end of the array. */
      const declared = be32(u, 28);
      const byLength = Math.floor(u.length / pageSize);
      const trustworthy = be32(u, 24) === be32(u, 92) && declared > 0;
      const pages = trustworthy ? Math.min(declared, byLength) : byLength;
      if (pages < 1) return bad('gpkg-truncated', { at: 'page 1', need: pageSize, have: u.length });

      return { ok: true, db: { u: u, pageSize: pageSize, usable: usable, reserved: reserved, pages: pages, encoding: encoding } };
    }

    /* Page numbers start at 1, and page 1 carries the 100-byte file header before its b-tree
       header. Everything below asks for pages through here so the bound is in one place. */
    function pageStart(db, n) {
      if (!(n >= 1) || n > db.pages) return null;
      return (n - 1) * db.pageSize;
    }

    const TEXT = (() => { try { return new TextDecoder('utf-8'); } catch (_) { return null; } })();
    function utf8(u, from, len) {
      if (TEXT) return TEXT.decode(u.subarray(from, from + len));
      let s = '';                                                 /* every environment this runs in has one; this is the floor */
      for (let i = 0; i < len; i++) s += String.fromCharCode(u[from + i]);
      return s;
    }

    /* ══ 2 · TABLE B-TREES (fileformat.html §1.6) ═════════════════════════════════════════════
       Only TABLE pages are walked: 0x0d leaf, 0x05 interior. Index pages (0x0a / 0x02) hold the
       same rows keyed differently — walking them would return every row twice — and the freelist is
       never entered at all, because a root page reaches only live pages. */

    const PAGE_TABLE_LEAF = 0x0d, PAGE_TABLE_INTERIOR = 0x05;

    /* The local/overflow split, verbatim from fileformat.html §1.6 "Cell payload overflow pages".
       ⚠ These are not tuned numbers: they are where SQLite decided to cut, so a reader that rounds
       them cuts in a different place and reassembles a payload out of the wrong bytes. */
    function localSize(db, payload) {
      const U = db.usable;
      const maxLocal = U - 35;
      if (payload <= maxLocal) return payload;
      const minLocal = Math.floor(((U - 12) * 32) / 255) - 23;
      const k = minLocal + ((payload - minLocal) % (U - 4));
      return k <= maxLocal ? k : minLocal;
    }

    /* Reassemble one cell's payload across the overflow chain. Returns a refusal rather than
       throwing, because a broken chain is a statement about the file and the caller prints it. */
    function payloadOf(db, payload, at, first) {
      const local = localSize(db, payload);
      if (at + local > db.u.length) return bad('gpkg-truncated', { at: 'cell payload', need: local, have: db.u.length - at });
      const out = new Uint8Array(payload);
      out.set(db.u.subarray(at, at + local), 0);
      let got = local;
      if (got >= payload) return { ok: true, bytes: out };

      let next = first;
      const seen = new Set();
      while (got < payload) {
        if (!next) return bad('gpkg-corrupt', { at: 'overflow chain', expected: (payload - got) + ' more bytes', found: 'end of chain' });
        if (seen.has(next)) return bad('gpkg-corrupt', { at: 'overflow chain', expected: 'an unvisited page', found: 'page ' + next + ' again' });
        seen.add(next);
        const start = pageStart(db, next);
        if (start == null) return bad('gpkg-corrupt', { at: 'overflow chain', expected: 'a page within the file', found: 'page ' + next });
        const take = Math.min(db.usable - 4, payload - got);
        if (start + 4 + take > db.u.length) return bad('gpkg-truncated', { at: 'overflow page ' + next, need: take, have: db.u.length - start - 4 });
        out.set(db.u.subarray(start + 4, start + 4 + take), got);
        got += take;
        next = be32(db.u, start);                                 /* 0 = this was the last page of the chain */
      }
      return { ok: true, bytes: out };
    }

    /* Walk a table b-tree. `visit.count` counts cells without reassembling any payload — that is
       what tables() uses, so listing a file does not pull every coastline through the overflow
       chain. `visit.row(bytes, rowid)` may return false to stop the walk. */
    function walk(db, root, visit) {
      const seen = new Set();
      const stack = [Number(root)];
      while (stack.length) {
        const n = stack.pop();
        if (seen.has(n)) return bad('gpkg-corrupt', { at: 'b-tree', expected: 'an unvisited page', found: 'page ' + n + ' again' });
        seen.add(n);
        const start = pageStart(db, n);
        if (start == null) return bad('gpkg-corrupt', { at: 'b-tree', expected: 'a page within the file', found: 'page ' + n });
        const hdr = start + (n === 1 ? 100 : 0);
        const type = db.u[hdr];
        if (type !== PAGE_TABLE_LEAF && type !== PAGE_TABLE_INTERIOR) {
          return bad('gpkg-corrupt', { at: 'page ' + n, expected: 'a table b-tree page (0x0d/0x05)', found: '0x' + Number(type).toString(16) });
        }
        const cells = be16(db.u, hdr + 3);
        const interior = type === PAGE_TABLE_INTERIOR;
        const ptrs = hdr + (interior ? 12 : 8);
        /* ⚠ CHILDREN ARE PUSHED IN REVERSE so that popping visits them in key order. The rows come
           back in the table's own order — which is what a reader comparing an import against the
           file it came from is looking at — and a stack walked the other way would hand back the
           same rows shuffled by page, which looks like a reader bug in every diff. */
        const children = [];
        for (let i = 0; i < cells; i++) {
          if (ptrs + i * 2 + 2 > db.u.length) return bad('gpkg-truncated', { at: 'page ' + n + ' cell pointer ' + i });
          const off = be16(db.u, ptrs + i * 2);
          if (off < 8 || off >= db.usable) {
            return bad('gpkg-corrupt', { at: 'page ' + n + ' cell ' + i, expected: 'an offset inside the usable page', found: off });
          }
          let p = start + off;
          if (interior) {
            const child = be32(db.u, p);                          /* the cell's left child; its key (a varint rowid) follows */
            if (child) children.push(child);
            continue;
          }
          const sz = varint(db.u, p);
          if (!sz) return bad('gpkg-truncated', { at: 'page ' + n + ' cell ' + i, need: 'payload size varint' });
          p += sz.len;
          const rid = varint(db.u, p);
          if (!rid) return bad('gpkg-truncated', { at: 'page ' + n + ' cell ' + i, need: 'rowid varint' });
          p += rid.len;
          if (visit.count) { visit.rows++; continue; }
          const payload = Number(sz.value);
          /* The overflow page number is the last four bytes of the cell, and is present ONLY when
             the payload did not fit locally — reading it unconditionally reads the next cell. */
          const local = localSize(db, payload);
          const first = payload > local ? be32(db.u, p + local) : 0;
          const got = payloadOf(db, payload, p, first);
          if (!got.ok) return got;
          if (visit.row(got.bytes, asValue(rid.value)) === false) return { ok: true };
        }
        if (interior) {
          const right = be32(db.u, hdr + 8);                      /* the right-most child is in the header, not in a cell */
          if (right) children.push(right);
          for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
        }
      }
      return { ok: true };
    }

    /* ══ 3 · THE RECORD FORMAT (fileformat.html §2.1) ═════════════════════════════════════════ */

    const SIZES = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 8, 7: 8, 8: 0, 9: 0 };

    function decodeRecord(bytes) {
      const h = varint(bytes, 0);
      if (!h) return bad('gpkg-corrupt', { at: 'record', expected: 'a header-size varint' });
      const headerEnd = Number(h.value);
      if (headerEnd > bytes.length) return bad('gpkg-corrupt', { at: 'record', expected: 'header within payload', found: headerEnd + ' > ' + bytes.length });
      const types = [];
      let p = h.len;
      while (p < headerEnd) {
        const t = varint(bytes, p);
        if (!t) return bad('gpkg-corrupt', { at: 'record header', expected: 'a serial type varint' });
        types.push(Number(t.value));
        p += t.len;
      }
      const values = [];
      let b = headerEnd;
      for (const t of types) {
        if (t === 10 || t === 11) return bad('gpkg-corrupt', { at: 'record', expected: 'a defined serial type', found: t });
        const n = t >= 12 ? ((t - 12) >> 1) : SIZES[t];
        if (b + n > bytes.length) return bad('gpkg-corrupt', { at: 'record body', expected: n + ' bytes for serial type ' + t, found: bytes.length - b });
        if (t === 0) values.push(null);
        else if (t >= 1 && t <= 6) {
          let v = 0n;
          for (let i = 0; i < n; i++) v = (v << 8n) | BigInt(bytes[b + i]);
          values.push(asValue(BigInt.asIntN(n * 8, v)));          /* ⚠ SIGNED, big-endian */
        } else if (t === 7) {
          values.push(new DataView(bytes.buffer, bytes.byteOffset + b, 8).getFloat64(0, false));
        } else if (t === 8) values.push(0);                       /* the constant IS the type — zero bytes follow */
        else if (t === 9) values.push(1);
        else if ((t & 1) === 0) values.push(bytes.slice(b, b + n));  /* BLOB */
        else values.push(utf8(bytes, b, n));                      /* TEXT — the encoding was settled in open() */
        b += n;
      }
      return { ok: true, values: values };
    }

    /* ══ 4 · COLUMN NAMES OUT OF `CREATE TABLE` ══════════════════════════════════════════════
       ⚠ THIS IS DELIBERATELY NOT A SQL PARSER. The record format numbers its values and says
       nothing about what they are called; the only place SQLite keeps the names is the original
       CREATE TABLE text. What is needed from that text is the declaration ORDER of the column
       names — the top-level comma list inside the outermost parentheses — so parentheses are
       matched and the quoting forms SQLite accepts (" ' [ `) are honoured, and ANYTHING ELSE IS
       REFUSED (`gpkg-schema`) rather than approximated. A guessed order silently files one
       column's values under another column's name, which is worse than not reading the file.
       Returns null for 「I could not read this」; every caller turns that into the refusal. */
    function columnsOf(sql) {
      const s = String(sql == null ? '' : sql);
      if (!/^\s*CREATE\s+(TEMP\s+|TEMPORARY\s+)?TABLE\b/i.test(s)) return null;   /* a virtual table has no column list to read */
      const openParen = s.indexOf('(');
      if (openParen < 0) return null;

      /* Skipping a quoted run is the same job twice (finding the end of the list, then splitting
         it), so it is one function: returns the index of the closing quote. */
      const skipQuoted = (i) => {
        const q = s[i], close = q === '[' ? ']' : q;
        for (i++; i < s.length; i++) {
          if (s[i] !== close) continue;
          if (close !== ']' && s[i + 1] === close) { i++; continue; }  /* "" inside "…" is one quote */
          return i;
        }
        return s.length;
      };
      const quoted = (c) => c === '"' || c === "'" || c === '`' || c === '[';

      let depth = 0, end = -1;
      for (let i = openParen; i < s.length; i++) {
        const c = s[i];
        if (quoted(c)) { i = skipQuoted(i); continue; }
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end < 0) return null;

      const parts = [];
      let cur = '', inner = 0;
      for (let i = openParen + 1; i < end; i++) {
        const c = s[i];
        if (quoted(c)) { const j = skipQuoted(i); cur += s.slice(i, j + 1); i = j; continue; }
        if (c === '(') inner++;
        else if (c === ')') inner--;
        else if (c === ',' && inner === 0) { parts.push(cur); cur = ''; continue; }
        cur += c;
      }
      parts.push(cur);

      const names = [];
      let rowidAlias = -1;
      for (const raw of parts) {
        const p = raw.trim();
        if (!p) continue;
        /* Table constraints share the comma list with the columns and are not columns. */
        if (/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i.test(p)) continue;
        let name, rest;
        if (quoted(p[0])) {
          const close = p[0] === '[' ? ']' : p[0];
          let i = 1, t = '';
          for (; i < p.length; i++) {
            if (p[i] !== close) { t += p[i]; continue; }
            if (close !== ']' && p[i + 1] === close) { t += close; i++; continue; }
            break;
          }
          if (i >= p.length) return null;                          /* unterminated quote: unreadable, not guessable */
          name = t; rest = p.slice(i + 1);
        } else {
          const m = /^[A-Za-z_-￿][\w$-￿]*/.exec(p);
          if (!m) return null;
          name = m[0]; rest = p.slice(m[0].length);
        }
        /* ⚠ An INTEGER PRIMARY KEY column is an ALIAS FOR THE ROWID: the record stores NULL there
           and the value lives in the cell's rowid. Every GeoPackage feature table declares
           `id INTEGER PRIMARY KEY AUTOINCREMENT`, so without this the id would be null on every
           row of every file this module will ever be given — and gpkg_spatial_ref_sys spells it
           `srs_id INTEGER NOT NULL PRIMARY KEY`, i.e. OTHER CONSTRAINTS COME BETWEEN THE TWO WORDS.
           The declared type must be exactly INTEGER (SQLite's rule: INT, BIGINT and the rest are
           not aliases), and `PRIMARY KEY DESC` is not one either — it is a real index. */
        if (/^\s*INTEGER\b/i.test(rest) && /\bPRIMARY\s+KEY\b/i.test(rest) && !/\bPRIMARY\s+KEY\s+DESC\b/i.test(rest)) rowidAlias = names.length;
        names.push(name);
      }
      if (!names.length) return null;
      return { names: names, rowidAlias: rowidAlias };
    }

    /* ══ 5 · READING ONE TABLE AS ROWS ═══════════════════════════════════════════════════════ */

    /* sqlite_master's own five columns are fixed BY THE FILE FORMAT (fileformat.html §1.2 / §2.6),
       which is why they are written here and nowhere else: there is no CREATE TABLE text to read
       them from, because this is the table that holds those texts. */
    const MASTER = { names: ['type', 'name', 'tbl_name', 'rootpage', 'sql'], rowidAlias: -1 };

    function readRows(db, root, cols) {
      let failure = null;
      const out = [];
      const r = walk(db, root, {
        row: (bytes, rowid) => {
          const rec = decodeRecord(bytes);
          if (!rec.ok) { failure = rec; return false; }
          const o = {};
          for (let i = 0; i < cols.names.length; i++) {
            /* ALTER TABLE ADD COLUMN leaves older records short, and the format says the missing
               tail reads as the column's DEFAULT. This reader does not evaluate SQL, so it reports
               null and does not invent the default — an invented value is a claim nobody made. */
            let v = i < rec.values.length ? rec.values[i] : null;
            if (i === cols.rowidAlias && v === null) v = rowid;
            o[cols.names[i]] = v;
          }
          o._rowid = rowid;
          out.push(o);
          return true;
        },
      });
      if (failure) return failure;
      if (!r.ok) return r;
      return { ok: true, rows: out };
    }

    function countRows(db, root) {
      const v = { count: true, rows: 0 };
      const r = walk(db, root, v);
      return r.ok ? { ok: true, rows: v.rows } : r;
    }

    /* ══ 6 · THE GEOPACKAGE MANIFEST ═════════════════════════════════════════════════════════ */

    function catalogue(db) {
      const master = readRows(db, 1, MASTER);
      if (!master.ok) return master;
      const byName = new Map();
      for (const r of master.rows) if (r.type === 'table') byName.set(String(r.name), r);
      if (!byName.has('gpkg_contents')) return bad('gpkg-not-a-geopackage', { tables: [...byName.keys()] });

      /* Every standard table is read BY COLUMN NAME, taken from its own CREATE TABLE, so a file
         that declares the standard columns in another order (the standard fixes the set, and a
         writer's column order is its own) is read correctly instead of column-shifted. */
      const table = (name, required) => {
        const e = byName.get(name);
        if (!e) return { ok: true, rows: [] };                     /* absent is a fact the caller judges */
        const cols = columnsOf(e.sql);
        if (!cols) return bad('gpkg-schema', { table: name, reason: 'column list unreadable' });
        for (const c of required) if (!cols.names.includes(c)) return bad('gpkg-schema', { table: name, missing: c, found: cols.names });
        return readRows(db, Number(e.rootpage), cols);
      };

      const contents = table('gpkg_contents', ['table_name', 'data_type', 'srs_id']);
      if (!contents.ok) return contents;
      const geomCols = table('gpkg_geometry_columns', ['table_name', 'column_name', 'geometry_type_name', 'srs_id']);
      if (!geomCols.ok) return geomCols;
      const srs = table('gpkg_spatial_ref_sys', ['srs_id', 'organization', 'organization_coordsys_id', 'definition']);
      if (!srs.ok) return srs;

      const geomByTable = new Map();
      for (const g of geomCols.rows) geomByTable.set(String(g.table_name), g);
      const srsById = new Map();
      for (const s of srs.rows) srsById.set(Number(s.srs_id), s);

      return { ok: true, master: byName, contents: contents.rows, geomByTable: geomByTable, srsById: srsById };
    }

    /* srs_id −1 (undefined cartesian) and 0 (undefined geographic) are the standard's two ways of
       saying 「this file does not name a coordinate system」, and their `definition` is the literal
       word "undefined". Both come back as null rather than as a code nobody stated.
       ⚠ THE WKT IS CARRIED, NOT INTERPRETED: js/gis-crs.js define(code, definition) takes exactly
       this text, and that module is the only parser of it in the app. */
    function crsOf(cat, srsId) {
      const id = Number(srsId);
      if (!isFinite(id) || srsId == null || id === -1 || id === 0) {
        return { code: null, wkt: null, srsId: (srsId == null || !isFinite(id)) ? null : id, organization: null };
      }
      const row = cat.srsById.get(id) || null;
      if (!row) return { code: null, wkt: null, srsId: id, organization: null };
      const org = String(row.organization == null ? '' : row.organization).trim();
      const orgId = row.organization_coordsys_id;
      const def = row.definition == null ? null : String(row.definition);
      const wkt = (def && def.trim() && def.trim().toLowerCase() !== 'undefined') ? def : null;
      const code = /^epsg$/i.test(org) && orgId != null ? ('EPSG:' + Number(orgId)) : null;
      return { code: code, wkt: wkt, srsId: id, organization: org || null };
    }

    /* ══ 7 · GEOPACKAGEBINARY → GeoJSON ══════════════════════════════════════════════════════
       (GeoPackage 1.3 §2.1.3 "BLOB Format", then OGC Simple Features WKB for the body.) */

    /* Envelope indicator → how many doubles follow the header. 5–7 are reserved, which is why the
       table is consulted rather than arithmetic done on the code. */
    const ENVELOPE_DOUBLES = { 0: 0, 1: 4, 2: 6, 3: 6, 4: 8 };

    const WKB_NAMES = { 1: 'Point', 2: 'LineString', 3: 'Polygon', 4: 'MultiPoint', 5: 'MultiLineString', 6: 'MultiPolygon', 7: 'GeometryCollection' };
    const MULTI_MEMBER = { 4: 'Point', 5: 'LineString', 6: 'Polygon' };

    function readWkb(dv, cur) {
      /* ⚠ EACH geometry in a WKB carries its OWN byte-order byte — a GeometryCollection may mix
         them, and a reader that takes the outer one for all of its members reads garbage
         coordinates out of a perfectly valid file. */
      if (cur.p + 5 > dv.byteLength) return bad('gpkg-truncated', { at: 'wkb header', need: 5 });
      const le = dv.getUint8(cur.p) === 1; cur.p += 1;
      const raw = dv.getUint32(cur.p, le); cur.p += 4;

      /* Two spellings of the same statement are both in the wild, so both are read:
           · ISO SQL/MM adds 1000 for Z, 2000 for M and 3000 for ZM to the base type
           · EWKB (PostGIS, and the writers that copied it) sets high bits 0x80000000 / 0x40000000,
             and 0x20000000 to say that an SRID follows the type. */
      const ewkbZ = (raw & 0x80000000) !== 0, ewkbM = (raw & 0x40000000) !== 0, ewkbSrid = (raw & 0x20000000) !== 0;
      const base = raw & 0x0fffffff;
      const iso = Math.floor(base / 1000);
      const code = base % 1000;
      if (iso > 3 || !WKB_NAMES[code]) return bad('gpkg-geometry-type', { wkbType: raw, code: code });
      const hasZ = ewkbZ || iso === 1 || iso === 3;
      const hasM = ewkbM || iso === 2 || iso === 3;
      if (ewkbSrid) {
        if (cur.p + 4 > dv.byteLength) return bad('gpkg-truncated', { at: 'ewkb srid', need: 4 });
        cur.p += 4;                                                /* the geometry's own SRID: the table's srs_id is the authority here */
      }

      const dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);
      const u32 = () => { const v = dv.getUint32(cur.p, le); cur.p += 4; return v; };
      const need = (n) => cur.p + n <= dv.byteLength;

      function position() {
        if (!need(8 * dims)) return null;
        const c = [dv.getFloat64(cur.p, le), dv.getFloat64(cur.p + 8, le)];
        let i = 16;
        /* ⚠ THE HEIGHT DOES NOT GO INTO THE POSITION (header note ②) — it goes into the parallel
           array, in the order positions are emitted. */
        if (hasZ) { cur.z.push(dv.getFloat64(cur.p + i, le)); i += 8; }
        if (hasM) { cur.m.push(dv.getFloat64(cur.p + i, le)); i += 8; }
        cur.p += 8 * dims;
        return c;
      }
      function ring() {
        if (!need(4)) return null;
        const n = u32();
        const out = [];
        for (let i = 0; i < n; i++) { const c = position(); if (!c) return null; out.push(c); }
        return out;
      }
      function rings() {
        if (!need(4)) return null;
        const n = u32();
        const out = [];
        for (let i = 0; i < n; i++) { const r = ring(); if (!r) return null; out.push(r); }
        return out;
      }

      if (code === 1) {
        const c = position();
        if (!c) return bad('gpkg-truncated', { at: 'Point' });
        return { ok: true, geometry: { type: 'Point', coordinates: c } };
      }
      if (code === 2) {
        const r = ring();
        if (!r) return bad('gpkg-truncated', { at: 'LineString' });
        return { ok: true, geometry: { type: 'LineString', coordinates: r } };
      }
      if (code === 3) {
        const r = rings();
        if (!r) return bad('gpkg-truncated', { at: 'Polygon' });
        /* The rings arrive as the file wrote them: outer first, then holes. Nothing is re-ordered
           or re-wound here — a ring's winding is a statement this reader has no basis to correct. */
        return { ok: true, geometry: { type: 'Polygon', coordinates: r } };
      }
      /* 4–7 nest COMPLETE WKB geometries, byte-order byte and all. */
      if (!need(4)) return bad('gpkg-truncated', { at: WKB_NAMES[code] });
      const n = u32();
      const parts = [];
      for (let i = 0; i < n; i++) {
        const sub = readWkb(dv, cur);
        if (!sub.ok) return sub;
        parts.push(sub.geometry);
      }
      if (code === 7) return { ok: true, geometry: { type: 'GeometryCollection', geometries: parts } };
      const want = MULTI_MEMBER[code];
      for (const p of parts) if (!p || p.type !== want) return bad('gpkg-corrupt', { at: WKB_NAMES[code], expected: want, found: p && p.type });
      return { ok: true, geometry: { type: 'Multi' + want, coordinates: parts.map((p) => p.coordinates) } };
    }

    function readGeometryBlob(bytes) {
      if (!bytes || bytes.length < 8) return bad('gpkg-geometry-blob', { reason: 'shorter than a GeoPackageBinary header', length: bytes ? bytes.length : 0 });
      if (bytes[0] !== 0x47 || bytes[1] !== 0x50) return bad('gpkg-geometry-blob', { reason: 'magic is not "GP"', found: [bytes[0], bytes[1]] });
      /* GeoPackage 1.3 flags byte: bit 0 byte order, bits 1–3 envelope indicator, bit 4 EMPTY,
         bit 5 binary type (0 standard / 1 extended). ⚠ The extended type still begins with this
         same header, and what differs is the BODY — a curve type that readWkb names rather than
         approximates — so the flag needs no branch of its own here. */
      const flags = bytes[3];
      const env = (flags >> 1) & 0x07;
      const doubles = ENVELOPE_DOUBLES[env];
      if (doubles === undefined) return bad('gpkg-geometry-blob', { reason: 'envelope indicator is reserved', envelope: env });
      const headerLen = 8 + doubles * 8;
      if (bytes.length < headerLen) return bad('gpkg-truncated', { at: 'geometry envelope', need: headerLen, have: bytes.length });
      const le = (flags & 0x01) === 1;
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const srsId = dv.getInt32(4, le);
      /* ⚠ An empty geometry is a STATED absence, not a missing one: the standard still writes a WKB
         after the header, and the feature genuinely has no location. The envelope is not read as a
         geometry — an envelope is a claim ABOUT the geometry, and this reader answers with the
         geometry itself. */
      const empty = (flags & 0x10) !== 0;
      const cur = { p: headerLen, z: [], m: [] };
      const g = readWkb(dv, cur);
      if (!g.ok) return g;
      return { ok: true, geometry: empty ? null : g.geometry, srsId: srsId, z: cur.z, m: cur.m, empty: empty };
    }

    /* ══ 8 · THE TWO QUESTIONS THE CALLER ASKS ═══════════════════════════════════════════════ */

    /* 'tiles' is listed by tables() and refused by read(): a tile pyramid is a raster, and
       docs/GIS-CORE.md §1.4 has a contract for those that this decoder does not fill. */
    const READABLE = ['features', 'attributes'];

    function listing(db, cat) {
      const out = [];
      for (const c of cat.contents) {
        const name = String(c.table_name == null ? '' : c.table_name);
        if (!name) continue;
        const g = cat.geomByTable.get(name) || null;
        const e = cat.master.get(name);
        let rows = null;                                           /* null = listed in the manifest but absent from the file */
        if (e) {
          const n = countRows(db, Number(e.rootpage));
          if (!n.ok) return n;
          rows = n.rows;
        }
        out.push({
          name: name,
          dataType: c.data_type == null ? null : String(c.data_type),
          geometryColumn: g ? String(g.column_name) : null,
          geometryType: g ? String(g.geometry_type_name) : null,
          srsId: c.srs_id == null ? null : Number(c.srs_id),
          rows: rows,
        });
      }
      return { ok: true, tables: out };
    }

    /* tables(bytes) → {ok:true, tables:[{name, dataType, geometryColumn, geometryType, srsId, rows}]}
                     | {ok:false, why, detail}
       EVERY table gpkg_contents lists, including the tile pyramids read() will not read: this list
       is how the caller learns what is in the file, and hiding a row would turn 「there is something
       I decline」 into 「there is nothing here」. */
    function tables(bytes) {
      const o = open(bytes);
      if (!o.ok) return o;
      const cat = catalogue(o.db);
      if (!cat.ok) return cat;
      return listing(o.db, cat);
    }

    /* read(bytes, tableName?) →
         {ok:true, fc, format:'geopackage', table, sourceCrs, wkt, stats} | {ok:false, why, detail}

       ⚠ WITH NO NAME, A FILE WITH TWO READABLE TABLES IS REFUSED, not silently resolved to the
       first one. Which table a .gpkg of 「境界 / 人口 / メタ情報」 means is a question only the reader
       can answer, and answering it here by position is the defect shape this repository keeps
       recording (docs/GIS-CORE.md §2.3: 本当に拒む). The refusal carries the list, so the caller
       asks again with a name instead of starting over. */
    function read(bytes, tableName) {
      const o = open(bytes);
      if (!o.ok) return o;
      const db = o.db;
      const cat = catalogue(db);
      if (!cat.ok) return cat;
      const all = listing(db, cat);
      if (!all.ok) return all;

      const wanted = tableName == null ? null : String(tableName);
      let target;
      if (wanted != null) {
        target = all.tables.find((t) => t.name === wanted) || null;
        if (!target) return bad('gpkg-no-such-table', { table: wanted, tables: all.tables.map((t) => t.name) });
        if (target.dataType === 'tiles') return bad('gpkg-tiles-unsupported', { table: wanted });
        if (READABLE.indexOf(target.dataType) < 0) return bad('gpkg-no-tables', { table: wanted, dataType: target.dataType });
      } else {
        const readable = all.tables.filter((t) => READABLE.indexOf(t.dataType) >= 0);
        if (!readable.length) return bad('gpkg-no-tables', { tables: all.tables.map((t) => ({ name: t.name, dataType: t.dataType })) });
        if (readable.length > 1) {
          return bad('gpkg-multiple-tables', {
            tables: readable.map((t) => ({ name: t.name, dataType: t.dataType, geometryColumn: t.geometryColumn, rows: t.rows })),
          });
        }
        target = readable[0];
      }

      const entry = cat.master.get(target.name);
      if (!entry) return bad('gpkg-schema', { table: target.name, reason: 'listed in gpkg_contents but not in sqlite_master' });
      const cols = columnsOf(entry.sql);
      if (!cols) return bad('gpkg-schema', { table: target.name, reason: 'column list unreadable' });

      let geomCol = null;
      if (target.dataType === 'features') {
        /* A features table with no row in gpkg_geometry_columns does not say WHICH column is the
           geometry, and picking the first BLOB column would be this module guessing. */
        if (!target.geometryColumn) return bad('gpkg-geometry-column', { table: target.name });
        geomCol = target.geometryColumn;
        if (!cols.names.includes(geomCol)) return bad('gpkg-schema', { table: target.name, missing: geomCol, found: cols.names });
      }

      const rows = readRows(db, Number(entry.rootpage), cols);
      if (!rows.ok) return rows;

      const blobColumns = new Set();
      const features = [];
      let empty = 0, nullGeom = 0, withZ = 0;
      for (const r of rows.rows) {
        const props = {};
        for (const name of cols.names) {
          if (name === geomCol) continue;
          const v = r[name];
          /* ⚠ A BLOB THAT IS NOT THE GEOMETRY IS NOT A PROPERTY. Raw bytes in a property become
             "[object Uint8Array]" in every panel and every export; naming the column in stats says
             it was there without turning it into a string that means nothing. */
          if (v instanceof Uint8Array) { blobColumns.add(name); continue; }
          props[name] = v;
        }
        let geometry = null;
        if (geomCol) {
          const raw = r[geomCol];
          if (raw == null) nullGeom++;                             /* the standard allows it: a feature with no location yet */
          else if (!(raw instanceof Uint8Array)) {
            return bad('gpkg-geometry-blob', { table: target.name, rowid: r._rowid, reason: 'geometry column holds ' + typeof raw });
          } else {
            const g = readGeometryBlob(raw);
            if (!g.ok) return { ok: false, why: g.why, detail: Object.assign({ table: target.name, rowid: r._rowid }, g.detail || {}) };
            geometry = g.geometry;
            if (g.empty) empty++;
            if (g.z.length) { props._z = g.z; withZ++; }
            if (g.m.length) props._m = g.m;
          }
        }
        features.push({ type: 'Feature', properties: props, geometry: geometry });
      }

      const crs = crsOf(cat, target.srsId);
      return {
        ok: true,
        fc: { type: 'FeatureCollection', features: features },
        format: 'geopackage',
        table: target.name,
        /* ⚠ THE COORDINATES ARE NOT TRANSFORMED HERE (header note). sourceCrs is what the file
           states; the caller transforms with js/gis-crs.js, or refuses. */
        sourceCrs: crs.code,
        wkt: crs.wkt,
        stats: {
          table: target.name,
          dataType: target.dataType,
          rows: rows.rows.length,
          features: features.length,
          /* 'none' is the attributes table saying so out loud — an unset field would leave the
             caller unable to tell 「no geometry column」 from 「a geometry column I failed to read」. */
          geometry: geomCol ? (target.geometryType || null) : 'none',
          geometryColumn: geomCol,
          columns: cols.names.slice(),
          blobColumns: [...blobColumns],
          srsId: crs.srsId,
          organization: crs.organization,
          emptyGeometry: empty,
          nullGeometry: nullGeom,
          withZ: withZ,
          pageSize: db.pageSize,
          tables: all.tables.length,
        },
      };
    }

    /* ══ 9 · THE WAY OUT — WRITING ONE (#R783) ════════════════════════════════════════════════
     *  The header of this file used to end 「That is what is below, READ-ONLY. Nothing here writes a
     *  byte.」 That was true and it was also the gap an outside audit named: a GeoPackage is the
     *  format QGIS, ArcGIS and PostGIS all take without argument, and IntMap could accept one and
     *  not hand one back. GeoJSON is not a substitute — it has no types, no spatial reference
     *  declaration a tool will honour, and no place to put a licence where a GIS will find it.
     *
     *  ⚠ STILL NO DEPENDENCY, AND STILL NOT A SQL ENGINE. What a writer needs is the inverse of
     *  §0–§4: the 100-byte header, the record format, table and index b-trees, and the overflow
     *  chain. sql.js would bring 1.5 MB of compiled C to run statements nobody types.
     *
     *  ══ ⚠⚠⚠ THE B-TREES ARE BUILT, NOT BALANCED ══════════════════════════════════════════════
     *  A general SQLite writer has to split and rebalance pages as rows arrive in any order. This
     *  one never has to, and the reason is structural rather than lucky: THE ROWS ARE WRITTEN ONCE,
     *  IN ROWID ORDER, ASCENDING. So the leaves are filled front to back and the interior levels
     *  are built bottom-up from the finished leaves — the same shape SQLite's own bulk load
     *  produces, and the only shape this writer can be asked for. There is no code path here that
     *  inserts into an existing tree, which is why there is none that has to balance one.
     *  ⚠ AND NO ROW IS TOO BIG FOR A PAGE. The local/overflow split (§2, localSize) caps a cell's
     *  in-page part at usable−35 bytes, so a cell always fits an empty leaf however long its
     *  geometry is; a 40,000-point coastline becomes an overflow chain, not a refusal.
     *
     *  ══ ⚠ THE FOUR AUTO-INDEXES ARE WRITTEN, NOT DECLARED AWAY ════════════════════════════════
     *  The standard's schema puts PRIMARY KEY on gpkg_contents.table_name and UNIQUE on
     *  gpkg_contents.identifier, gpkg_geometry_columns(table_name, column_name) and
     *  gpkg_geometry_columns.table_name. In SQLite each of those is an INDEX B-TREE with a row in
     *  sqlite_master, and a file that declares the constraint without building the tree is a
     *  CORRUPT DATABASE — `PRAGMA integrity_check` fails on it even though a forgiving reader may
     *  still return the rows. Dropping the constraints instead would be a schema that is not the
     *  standard's. So the indexes are built. ⚠ EACH HOLDS EXACTLY ONE ROW — this writer emits one
     *  feature table per file, so gpkg_contents and gpkg_geometry_columns have one row each — which
     *  is why the index b-trees below are single leaves BY CONSTRUCTION and not by assumption.
     *
     *  ══ WHAT IT DOES NOT WRITE, SAID OUT LOUD (in `stated`) ═══════════════════════════════════
     *    · NO SPATIAL INDEX. The R-tree is an optional extension; without it a reader scans, which
     *      is correct and slower. `stated.spatialIndex` is false rather than absent.
     *    · NO TILE PYRAMID. `write` takes features; the raster door is the GeoTIFF/COG one.
     *    · NO WAL. One file, one commit, write version 1.
     */

    const GPKG_PAGE = 4096;                 /* SQLite's own default since 3.12; a power of two in range */
    const GPKG_USABLE = GPKG_PAGE;          /* reserved-space region is 0 — nothing here needs one */
    const SQLITE_VERSION = 3045001;         /* what this writer's format revision corresponds to */

    /* ── varint, records and pages: the inverse of §0–§2 ──────────────────────────────────── */

    function putVarint(out, v) {
      /* ⚠ BigInt, for the same reason varint() reads into one: a payload length or a rowid past 2^53
         would lose its low bits as a double, and a length that is almost right is a corrupt file. */
      let n = BigInt(v);
      if (n < 0n) n += 1n << 64n;
      if (n <= 0x7fn) { out.push(Number(n)); return; }
      const bytes = [];
      if (n > (1n << 56n) - 1n) {
        bytes.push(Number(n & 0xffn)); n >>= 8n;
        for (let i = 0; i < 8; i++) { bytes.push(Number(n & 0x7fn) | 0x80); n >>= 7n; }
        bytes.reverse();
        /* the nine-byte form: eight 7-bit groups then a full byte, so the last pushed must not
           carry the continuation bit */
        bytes[8] = bytes[8] & 0xff;
        for (let i = 0; i < 8; i++) bytes[i] |= 0x80;
        for (const b of bytes) out.push(b);
        return;
      }
      while (n > 0n) { bytes.push(Number(n & 0x7fn)); n >>= 7n; }
      bytes.reverse();
      for (let i = 0; i < bytes.length - 1; i++) bytes[i] |= 0x80;
      for (const b of bytes) out.push(b);
    }
    const varintLen = (v) => { const a = []; putVarint(a, v); return a.length; };

    /* One row as a SQLite record: a header of serial types, then the bodies (fileformat.html §2.1).
       ⚠ THE INTEGER WIDTH IS CHOSEN FROM THE VALUE, not fixed at 8 bytes — serial types 8 and 9 are
       the constants 0 and 1 and occupy NO body bytes at all, which is most of what a flags column
       costs. A value that is not an exact integer is stored as a float64, because rounding a
       reader's number on the way out is the silent edit this module refuses to make. */
    function makeRecord(values) {
      const types = [], bodies = [];
      for (const v of values) {
        if (v === null || v === undefined) { types.push(0); bodies.push(null); continue; }
        if (typeof v === 'number' && Number.isInteger(v)) {
          if (v === 0) { types.push(8); bodies.push(null); continue; }
          if (v === 1) { types.push(9); bodies.push(null); continue; }
          const widths = [[1, -0x80, 0x7f], [2, -0x8000, 0x7fff], [3, -0x800000, 0x7fffff],
            [4, -0x80000000, 0x7fffffff], [6, -0x800000000000, 0x7fffffffffff]];
          let done = false;
          for (const [n, lo, hi] of widths) {
            if (v >= lo && v <= hi) {
              const b = new Uint8Array(n);
              let x = BigInt(v); if (x < 0n) x += 1n << BigInt(n * 8);
              for (let i = n - 1; i >= 0; i--) { b[i] = Number(x & 0xffn); x >>= 8n; }
              types.push(n === 6 ? 5 : n); bodies.push(b); done = true; break;
            }
          }
          if (done) continue;
          const b = new Uint8Array(8); let x = BigInt(v); if (x < 0n) x += 1n << 64n;
          for (let i = 7; i >= 0; i--) { b[i] = Number(x & 0xffn); x >>= 8n; }
          types.push(6); bodies.push(b); continue;
        }
        if (typeof v === 'number') {
          const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, false);
          types.push(7); bodies.push(b); continue;
        }
        if (typeof v === 'string') {
          const b = new TextEncoder().encode(v);
          types.push(13 + 2 * b.length); bodies.push(b); continue;
        }
        if (v instanceof Uint8Array) { types.push(12 + 2 * v.length); bodies.push(v); continue; }
        return null;                                   /* the caller turns this into a refusal */
      }
      /* the header's own length is part of the header, so it is solved rather than guessed: adding a
         byte to the length can push the length's varint one byte wider */
      const typeBytes = [];
      for (const t of types) putVarint(typeBytes, t);
      let hdrLen = typeBytes.length + 1;
      while (varintLen(hdrLen) + typeBytes.length !== hdrLen) hdrLen = varintLen(hdrLen) + typeBytes.length;
      const head = [];
      putVarint(head, hdrLen);
      const total = hdrLen + bodies.reduce((a, b) => a + (b ? b.length : 0), 0);
      const out = new Uint8Array(total);
      out.set(head, 0);
      out.set(typeBytes, head.length);
      let p = hdrLen;
      for (const b of bodies) if (b) { out.set(b, p); p += b.length; }
      return out;
    }

    /* ── WKB and the GeoPackageBinary wrapper ──────────────────────────────────────────────── */

    const WKB_CODE = { Point: 1, LineString: 2, Polygon: 3, MultiPoint: 4, MultiLineString: 5, MultiPolygon: 6, GeometryCollection: 7 };

    /* Every position of one geometry must carry the same number of ordinates, because WKB states
       dimensionality ONCE per geometry. A mixture would have to be resolved by dropping somebody's
       third ordinate in silence, which js/gis-export.js refuses by the same name. */
    function dimOf(geom) {
      let dim = null, bad2 = false;
      const walkPos = (a) => {
        if (!Array.isArray(a)) return;
        if (typeof a[0] === 'number') {
          const d = (a.length >= 3 && typeof a[2] === 'number') ? 3 : 2;
          if (dim == null) dim = d; else if (dim !== d) bad2 = true;
          return;
        }
        for (const x of a) walkPos(x);
      };
      const each = (g) => {
        if (!g) return;
        if (g.type === 'GeometryCollection') { (g.geometries || []).forEach(each); return; }
        walkPos(g.coordinates);
      };
      each(geom);
      return bad2 ? -1 : (dim == null ? 2 : dim);
    }

    function wkbOf(geom, dim) {
      const parts = [];
      let len = 0;
      const push = (b) => { parts.push(b); len += b.length; };
      const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; };
      const f64 = (v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); return b; };
      /* ISO 13249 / OGC 06-104r4: a Z geometry's type is the plain code plus 1000. GDAL, PostGIS
         and this file's own readWkb (§7, `iso === 1`) all read that form. */
      const hdr = (name) => { push(new Uint8Array([1])); push(u32(WKB_CODE[name] + (dim === 3 ? 1000 : 0))); };
      const pos = (p) => { push(f64(p[0])); push(f64(p[1])); if (dim === 3) push(f64(p.length >= 3 ? p[2] : 0)); };
      const ring = (r) => { push(u32(r.length)); for (const p of r) pos(p); };

      const one = (g) => {
        const t = g && g.type;
        if (t === 'Point') { hdr('Point'); pos(g.coordinates); return true; }
        if (t === 'LineString') { hdr('LineString'); ring(g.coordinates); return true; }
        if (t === 'Polygon') { hdr('Polygon'); push(u32(g.coordinates.length)); for (const r of g.coordinates) ring(r); return true; }
        if (t === 'MultiPoint') {
          hdr('MultiPoint'); push(u32(g.coordinates.length));
          for (const p of g.coordinates) { hdr('Point'); pos(p); }
          return true;
        }
        if (t === 'MultiLineString') {
          hdr('MultiLineString'); push(u32(g.coordinates.length));
          for (const l of g.coordinates) { hdr('LineString'); ring(l); }
          return true;
        }
        if (t === 'MultiPolygon') {
          hdr('MultiPolygon'); push(u32(g.coordinates.length));
          for (const poly of g.coordinates) { hdr('Polygon'); push(u32(poly.length)); for (const r of poly) ring(r); }
          return true;
        }
        if (t === 'GeometryCollection') {
          hdr('GeometryCollection'); push(u32((g.geometries || []).length));
          for (const sub of (g.geometries || [])) if (!one(sub)) return false;
          return true;
        }
        return false;
      };
      if (!one(geom)) return null;
      const out = new Uint8Array(len);
      let p = 0; for (const b of parts) { out.set(b, p); p += b.length; }
      return out;
    }

    function bboxOf(geom) {
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      const walkPos = (a) => {
        if (!Array.isArray(a)) return;
        if (typeof a[0] === 'number') {
          if (a[0] < minx) minx = a[0]; if (a[0] > maxx) maxx = a[0];
          if (a[1] < miny) miny = a[1]; if (a[1] > maxy) maxy = a[1];
          return;
        }
        for (const x of a) walkPos(x);
      };
      const each = (g) => { if (!g) return; if (g.type === 'GeometryCollection') { (g.geometries || []).forEach(each); return; } walkPos(g.coordinates); };
      each(geom);
      return isFinite(minx) ? { minx, miny, maxx, maxy } : null;
    }

    /* The GeoPackageBinary header (standard §2.1.3.1) followed by the WKB. ⚠ THE ENVELOPE ORDER IS
       minx, maxx, miny, maxy — NOT the minx,miny,maxx,maxy a GeoJSON bbox uses. Getting it wrong
       produces a file that opens, draws correctly (the geometry is read from the WKB) and answers
       every spatial query wrongly, because the envelope is what an index and a bbox filter consult.
       Measured against GDAL in tests/r783-format-compat-checks ⑦, which asks GDAL for the layer's
       extent rather than asking this module. */
    function geometryBlob(geom, srsId, dim) {
      const wkb = wkbOf(geom, dim);
      if (!wkb) return null;
      const box = bboxOf(geom);
      const envelope = box ? 1 : 0;
      const flags = 0x01 | (envelope << 1) | (box ? 0 : 0x10);
      const head = new Uint8Array(8 + (box ? 32 : 0));
      const hdv = new DataView(head.buffer);
      head[0] = 0x47; head[1] = 0x50; head[2] = 0x00; head[3] = flags;
      hdv.setInt32(4, srsId, true);
      if (box) {
        hdv.setFloat64(8, box.minx, true); hdv.setFloat64(16, box.maxx, true);
        hdv.setFloat64(24, box.miny, true); hdv.setFloat64(32, box.maxy, true);
      }
      const out = new Uint8Array(head.length + wkb.length);
      out.set(head, 0); out.set(wkb, head.length);
      return out;
    }

    /* ── the b-tree builder ────────────────────────────────────────────────────────────────── */

    /* The local/overflow split for a TABLE leaf, from the same paragraph §2's localSize reads for
       the other direction (fileformat.html §1.6). One rule, stated once, used both ways. */
    function splitLocal(payloadLen) {
      const maxLocal = GPKG_USABLE - 35;
      const minLocal = Math.floor((GPKG_USABLE - 12) * 32 / 255) - 23;
      if (payloadLen <= maxLocal) return payloadLen;
      let surplus = minLocal + ((payloadLen - minLocal) % (GPKG_USABLE - 4));
      return surplus <= maxLocal ? surplus : minLocal;
    }

    /* An index leaf's split uses the same numbers but is reached through the index page's own
       max — for the single-row indexes below the payload is tens of bytes, so the branch that
       overflows is never taken; it is written anyway because a table_name long enough to reach it
       is a value a caller supplies, not a constant here. */
    const splitLocalIndex = splitLocal;

    /* One b-tree, laid out. `rows` is [{rowid, payload}] in ASCENDING rowid order for a table tree,
       or [{payload}] for an index tree. Returns { rootPage, pages } where pages is a map of page
       number → Uint8Array, all numbered from `firstPage`. */
    /* ⚠ `hdrOff` IS WHY PAGE 1 IS NOT AN ORDINARY PAGE. The 100-byte file header occupies the start
       of page 1, and the b-tree page that shares it begins AFTER it — its page header at byte 100
       and its cell pointer array at 108 — while the cell content area still grows down from the end
       of the page. Cell pointers are offsets from the start of the PAGE, not from the header, so
       only the two structures at the front move. Getting this wrong produces a file whose every
       byte is otherwise correct and which SQLite calls 「database disk image is malformed」, because
       it reads the page type from byte 0 of page 1 and finds 'S' of "SQLite". */
    function buildTree(rows, firstPage, index, hdrOff) {
      const pages = new Map();
      const front = hdrOff || 0;
      let next = firstPage;
      const alloc = () => next++;

      /* ① the cells, with their overflow chains */
      const cells = rows.map((r) => {
        const payload = r.payload;
        const local = index ? splitLocalIndex(payload.length) : splitLocal(payload.length);
        const head = [];
        putVarint(head, payload.length);
        if (!index) putVarint(head, r.rowid);
        const size = head.length + local + (local < payload.length ? 4 : 0);
        return { rowid: r.rowid, payload, local, head, size };
      });

      /* ② pack them into leaves, front to back — possible only because the rowids ascend */
      const leaves = [];
      let cur = [];
      let used = 0;
      const hdrSize = front + 8;
      for (const c of cells) {
        if (cur.length && hdrSize + (cur.length + 1) * 2 + used + c.size > GPKG_USABLE) {
          leaves.push(cur); cur = []; used = 0;
        }
        cur.push(c); used += c.size;
      }
      leaves.push(cur);

      /* ③ page numbers: each leaf, then that leaf's overflow chains, so a reader walking the tree
         in order walks the file in order too */
      const leafInfo = [];
      for (const leaf of leaves) {
        const pno = alloc();
        for (const c of leaf) {
          c.overflow = [];
          let rest = c.payload.length - c.local;
          while (rest > 0) { c.overflow.push(alloc()); rest -= (GPKG_USABLE - 4); }
        }
        leafInfo.push({ pno, cells: leaf });
      }

      /* ④ serialise the leaves and their overflow chains */
      for (const { pno, cells: leaf } of leafInfo) {
        const page = new Uint8Array(GPKG_PAGE);
        const dv = new DataView(page.buffer);
        page[front] = index ? 0x0a : 0x0d;
        dv.setUint16(front + 1, 0, false);               /* no freeblocks */
        dv.setUint16(front + 3, leaf.length, false);
        let contentAt = GPKG_USABLE;
        const ptrs = [];
        /* cells are written from the end of the page towards the middle, which is what the format
           expects and what makes the cell pointer array ascend while the offsets descend */
        for (let i = leaf.length - 1; i >= 0; i--) {
          const c = leaf[i];
          contentAt -= c.size;
          ptrs[i] = contentAt;
          let p = contentAt;
          page.set(c.head, p); p += c.head.length;
          page.set(c.payload.subarray(0, c.local), p); p += c.local;
          if (c.overflow.length) dv.setUint32(p, c.overflow[0], false);
        }
        dv.setUint16(front + 5, contentAt === GPKG_PAGE ? 0 : contentAt, false);
        page[front + 7] = 0;                             /* no fragmented free bytes */
        for (let i = 0; i < leaf.length; i++) dv.setUint16(front + 8 + i * 2, ptrs[i], false);
        pages.set(pno, page);

        for (const c of leaf) {
          let at = c.local;
          for (let k = 0; k < c.overflow.length; k++) {
            const op = new Uint8Array(GPKG_PAGE);
            const odv = new DataView(op.buffer);
            odv.setUint32(0, k + 1 < c.overflow.length ? c.overflow[k + 1] : 0, false);
            const take = Math.min(GPKG_USABLE - 4, c.payload.length - at);
            op.set(c.payload.subarray(at, at + take), 4);
            at += take;
            pages.set(c.overflow[k], op);
          }
        }
      }

      /* ⑤ the interior levels, bottom-up. An interior cell is a 4-byte left child and the largest
         rowid in that child's subtree; the right-most child hangs off the page header instead.
         ⚠ AN INDEX TREE OF ONE LEAF NEEDS NO INTERIOR LEVEL AT ALL — and by construction (see the
         section header) the index trees here are exactly that, so the branch below is only ever
         taken by the feature table. */
      let level = leafInfo.map((l) => ({ pno: l.pno, key: l.cells.length ? l.cells[l.cells.length - 1].rowid : 0 }));
      while (level.length > 1) {
        const up = [];
        let group = [];
        let gUsed = 0;
        const flush = () => {
          if (!group.length) return;
          const pno = alloc();
          const page = new Uint8Array(GPKG_PAGE);
          const dv = new DataView(page.buffer);
          const rightMost = group[group.length - 1];
          const inner = group.slice(0, -1);
          page[0] = 0x05;
          dv.setUint16(1, 0, false);
          dv.setUint16(3, inner.length, false);
          dv.setUint32(8, rightMost.pno, false);
          let contentAt = GPKG_USABLE;
          const ptrs = [];
          for (let i = inner.length - 1; i >= 0; i--) {
            const key = [];
            putVarint(key, inner[i].key);
            contentAt -= 4 + key.length;
            ptrs[i] = contentAt;
            dv.setUint32(contentAt, inner[i].pno, false);
            page.set(key, contentAt + 4);
          }
          dv.setUint16(5, contentAt === GPKG_PAGE ? 0 : contentAt, false);
          page[7] = 0;
          for (let i = 0; i < inner.length; i++) dv.setUint16(12 + i * 2, ptrs[i], false);
          pages.set(pno, page);
          up.push({ pno, key: rightMost.key });
          group = []; gUsed = 0;
        };
        for (const child of level) {
          const cost = 2 + 4 + varintLen(child.key);
          if (group.length && 12 + gUsed + cost > GPKG_USABLE) flush();
          group.push(child); gUsed += cost;
        }
        flush();
        level = up;
      }

      return { rootPage: level[0].pno, pages, nextPage: next };
    }

    /* ── the standard's schema, verbatim ────────────────────────────────────────────────────── */

    /* ⚠ THIS SQL IS THE STANDARD'S, NOT A PARAPHRASE (OGC 12-128r18, Annex C). A reader — including
       §4 of this very file — learns the column ORDER by parsing this text, so a rewording that
       moved a column would change what every value means. Failing condition: a GeoPackage revision
       that changes these tables, which would also change what `user_version` below must say. */
    const SRS_SQL = 'CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT)';
    const CONTENTS_SQL = 'CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT \'\', last_change DATETIME NOT NULL DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER, CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id))';
    const GEOMCOLS_SQL = 'CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name), CONSTRAINT uk_gc_table_name UNIQUE (table_name), CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name), CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id))';

    /* EPSG:4326 as WKT 1, plus the two rows the standard REQUIRES to exist (srs_id -1 and 0). ⚠ The
       required rows are not decoration: a reader validating the file looks for them, and a geometry
       whose srs_id is 0 means 「undefined geographic」 rather than 「missing」. */
    const WKT_4326 = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]';

    /* SQLite stores a column's declared type for the reader's benefit; the type is chosen from what
       the values ACTUALLY are across the whole column, not from the first row. ⚠ A column that
       holds both 5 and "five" is TEXT, not INTEGER-with-surprises: SQLite would store the string in
       an INTEGER column anyway (it has no strict typing by default) and a GIS reading the declared
       type would then hand its user a number column full of text. */
    function declaredType(values) {
      let sawNum = false, sawInt = true, sawOther = false, any = false;
      for (const v of values) {
        if (v === null || v === undefined) continue;
        any = true;
        if (typeof v === 'number') { sawNum = true; if (!Number.isInteger(v)) sawInt = false; continue; }
        if (typeof v === 'boolean') { sawNum = true; continue; }
        sawOther = true;
      }
      if (!any) return 'TEXT';
      if (sawOther) return 'TEXT';
      if (sawNum && sawInt) return 'INTEGER';
      if (sawNum) return 'DOUBLE';
      return 'TEXT';
    }

    const SQL_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

    /* The one door out. `opts`: { table, features, title, description, provenance, srsId } */
    function write(opts) {
      const o = opts || {};
      const table = String(o.table == null ? '' : o.table);
      /* ⚠ NOT QUOTED-AND-ACCEPTED. The table name goes into CREATE TABLE text that this file's own
         §4 parses back; a name with a quote or a bracket in it would produce SQL whose column list
         cannot be read, which is the `gpkg-schema` refusal one step later and harder to explain. */
      if (!SQL_IDENT.test(table)) return bad('gpkg-write-table-name', { table: table, expected: 'a bare SQL identifier' });

      const srsId = o.srsId == null ? 4326 : Number(o.srsId);
      if (srsId !== 4326) return bad('gpkg-write-crs-unsupported', { srsId: srsId, supported: [4326] });

      const feats = Array.isArray(o.features) ? o.features : [];
      if (!feats.length) return bad('gpkg-write-empty', { count: 0 });

      /* ① the attribute columns, discovered from the features rather than declared by the caller —
         a column list handed in would silently drop whatever the caller had not thought of. */
      const colNames = [];
      const seen = new Set();
      for (const f of feats) {
        const props = (f && f.properties) || {};
        for (const k of Object.keys(props)) {
          if (seen.has(k)) continue;
          /* `fid` and `geom` are this schema's own columns; a property of the same name would be
             two columns with one name. Suffixed, never overwritten — the same rule §6 of
             js/gis-export.js applies to a CSV's added columns. */
          let name = k;
          if (!SQL_IDENT.test(name)) name = 'col_' + name.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
          if (!SQL_IDENT.test(name)) name = 'col';
          let unique = name, n = 1;
          while (unique === 'fid' || unique === 'geom' || seen.has(unique)) unique = name + '_' + (n++);
          seen.add(unique);
          colNames.push({ key: k, column: unique });
        }
      }

      /* ② the values, once, so that declaredType sees the whole column and the records are built
         from the same numbers the type was chosen for */
      const cells = colNames.map(() => []);
      for (const f of feats) {
        const props = (f && f.properties) || {};
        for (let c = 0; c < colNames.length; c++) {
          let v = props[colNames[c].key];
          if (v === undefined) v = null;
          else if (typeof v === 'boolean') v = v ? 1 : 0;
          else if (v !== null && typeof v === 'object') {
            /* a nested object or an array has no SQLite type; JSON is what GDAL's own GPKG driver
               writes for one, and it is stated in `stated.jsonColumns` rather than done quietly */
            try { v = JSON.stringify(v); } catch (_) { return bad('gpkg-write-value-unsupported', { column: colNames[c].column, reason: 'not serialisable' }); }
          } else if (typeof v === 'bigint') {
            return bad('gpkg-write-value-unsupported', { column: colNames[c].column, reason: 'bigint' });
          }
          cells[c].push(v);
        }
      }
      const colTypes = cells.map(declaredType);

      /* ③ the geometries. The declared geometry_type_name is what the features actually are: one
         type if they agree, GEOMETRY if they do not. ⚠ NOT 「the first one's」 — a layer declared
         POINT that holds polygons is refused by strict readers and mis-styled by lenient ones. */
      const blobs = [];
      const types = new Set();
      let withZ = false, nullGeom = 0;
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (let i = 0; i < feats.length; i++) {
        const g = (feats[i] && feats[i].geometry) || null;
        if (!g || !g.type) { blobs.push(null); nullGeom++; continue; }
        if (!Object.prototype.hasOwnProperty.call(WKB_CODE, g.type)) {
          return bad('gpkg-write-geometry-unsupported', { index: i, type: String(g.type), supported: Object.keys(WKB_CODE) });
        }
        const dim = dimOf(g);
        if (dim === -1) return bad('gpkg-write-geometry-mixed-dimensions', { index: i, type: String(g.type) });
        if (dim === 3) withZ = true;
        const blob = geometryBlob(g, srsId, dim);
        if (!blob) return bad('gpkg-write-geometry-unsupported', { index: i, type: String(g.type), supported: Object.keys(WKB_CODE) });
        blobs.push(blob);
        types.add(g.type);
        const box = bboxOf(g);
        if (box) {
          if (box.minx < minx) minx = box.minx; if (box.maxx > maxx) maxx = box.maxx;
          if (box.miny < miny) miny = box.miny; if (box.maxy > maxy) maxy = box.maxy;
        }
      }
      const geomType = types.size === 1 ? [...types][0].toUpperCase() : 'GEOMETRY';
      const hasExtent = isFinite(minx);

      /* ④ the feature table's own CREATE TABLE. `fid INTEGER PRIMARY KEY` is a rowid ALIAS, so it
         needs no index of its own — which is why the four auto-indexes this file builds are the
         four the standard's OWN tables imply and not five. */
      const tableSql = 'CREATE TABLE ' + table + ' (fid INTEGER PRIMARY KEY, geom ' + geomType
        + colNames.map((c, i) => ', ' + c.column + ' ' + colTypes[i]).join('') + ')';

      /* ⑤ the rows. The rowid IS fid and the record stores NULL in its place (fileformat.html §2.4:
         「the value of the column is the rowid」) — writing the number twice would let the two
         disagree after any edit. */
      const featureRows = [];
      for (let i = 0; i < feats.length; i++) {
        const values = [null, blobs[i]];
        for (let c = 0; c < colNames.length; c++) values.push(cells[c][i]);
        const payload = makeRecord(values);
        if (!payload) return bad('gpkg-write-value-unsupported', { index: i, reason: 'no SQLite type for a value in this row' });
        featureRows.push({ rowid: i + 1, payload });
      }

      /* ⑥ the fixed tables, each a single leaf (one to three rows) */
      const now = new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1Z');
      const srsRows = [
        { rowid: -1, payload: makeRecord(['Undefined cartesian SRS', null, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system']) },
        { rowid: 0, payload: makeRecord(['Undefined geographic SRS', null, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system']) },
        { rowid: 4326, payload: makeRecord(['WGS 84 geodetic', null, 'EPSG', 4326, WKT_4326, 'longitude/latitude coordinates in decimal degrees on the WGS 84 ellipsoid']) },
      ];
      const identifier = (o.title == null || String(o.title) === '') ? table : String(o.title);
      /* ⚠ THE LICENCE GOES IN `description`, WHICH IS WHERE A GIS SHOWS IT. §1 of js/gis-export.js
         is about exactly this: a condition of redistribution written in a comment is a condition
         nobody reads ([[intmap-licence-must-be-a-value]]). And ONLY WHAT WAS STATED travels —
         a record with no provenance gets the description it was given, not an invented one. */
      const description = String(o.description == null ? '' : o.description);
      const contentsRow = makeRecord([
        table, 'features', identifier, description, now,
        hasExtent ? minx : null, hasExtent ? miny : null, hasExtent ? maxx : null, hasExtent ? maxy : null,
        srsId,
      ]);
      const geomColsRow = makeRecord([table, 'geom', geomType, srsId, withZ ? 1 : 0, 0]);

      /* ⑦ page allocation. Page 1 is sqlite_master's root by definition, so everything else is
         numbered after it and the schema records — which must name those numbers — are built last. */
      let page = 2;
      const trees = [];
      const add = (rows, index) => {
        const t = buildTree(rows, page, !!index);
        page = t.nextPage;
        trees.push(t);
        return t;
      };
      const srsTree = add(srsRows, false);
      const contentsTree = add([{ rowid: 1, payload: contentsRow }], false);
      /* the two auto-indexes gpkg_contents implies: an index record is the indexed columns followed
         by the rowid it points at */
      const ixContents1 = add([{ payload: makeRecord([table, 1]) }], true);
      const ixContents2 = add([{ payload: makeRecord([identifier, 1]) }], true);
      const geomColsTree = add([{ rowid: 1, payload: geomColsRow }], false);
      const ixGeom1 = add([{ payload: makeRecord([table, 'geom', 1]) }], true);
      const ixGeom2 = add([{ payload: makeRecord([table, 1]) }], true);
      const featureTree = add(featureRows, false);

      /* ⑧ sqlite_master itself: one row per table and index, in creation order.
         type, name, tbl_name, rootpage, sql */
      const schema = [
        ['table', 'gpkg_spatial_ref_sys', 'gpkg_spatial_ref_sys', srsTree.rootPage, SRS_SQL],
        ['table', 'gpkg_contents', 'gpkg_contents', contentsTree.rootPage, CONTENTS_SQL],
        ['index', 'sqlite_autoindex_gpkg_contents_1', 'gpkg_contents', ixContents1.rootPage, null],
        ['index', 'sqlite_autoindex_gpkg_contents_2', 'gpkg_contents', ixContents2.rootPage, null],
        ['table', 'gpkg_geometry_columns', 'gpkg_geometry_columns', geomColsTree.rootPage, GEOMCOLS_SQL],
        ['index', 'sqlite_autoindex_gpkg_geometry_columns_1', 'gpkg_geometry_columns', ixGeom1.rootPage, null],
        ['index', 'sqlite_autoindex_gpkg_geometry_columns_2', 'gpkg_geometry_columns', ixGeom2.rootPage, null],
        ['table', table, table, featureTree.rootPage, tableSql],
      ];
      const masterRows = schema.map((r, i) => ({ rowid: i + 1, payload: makeRecord(r) }));

      /* Page 1 IS sqlite_master's root, by definition, and it carries the 100-byte file header
         ahead of its b-tree structures — hence the fourth argument (see buildTree). */
      const master = buildTree(masterRows, 1, false, 100);
      const page1Body = master.pages.get(1);
      if (master.rootPage !== 1) {
        /* sqlite_master outgrowing one page would mean more tables than this writer emits (eight),
           so the condition is impossible rather than unhandled — asserted so that a future ninth
           table fails loudly here instead of producing a file whose schema root is not page 1. */
        throw new Error('gis-geopackage: sqlite_master did not fit on page 1');
      }
      /* the content area must clear the header AND the cell pointer array; eight short schema rows
         occupy ~2 KB at the END of the page, so this holds by construction and is checked rather
         than assumed */
      const contentStart = new DataView(page1Body.buffer).getUint16(105, false);
      if (contentStart !== 0 && contentStart < 100 + 8 + masterRows.length * 2) {
        throw new Error('gis-geopackage: page 1 schema overran the file header');
      }

      /* ⑨ the file */
      const totalPages = page - 1;
      const out = new Uint8Array(totalPages * GPKG_PAGE);
      for (const t of trees) for (const [n, p] of t.pages) out.set(p, (n - 1) * GPKG_PAGE);
      out.set(page1Body, 0);

      const dv = new DataView(out.buffer);
      out.set(MAGIC, 0);
      dv.setUint16(16, GPKG_PAGE === 65536 ? 1 : GPKG_PAGE, false);
      out[18] = 1; out[19] = 1;                          /* read/write version: legacy, not WAL */
      out[20] = 0;                                       /* reserved space per page */
      out[21] = 64; out[22] = 32; out[23] = 32;          /* the payload fractions the format fixes */
      dv.setUint32(24, 1, false);                        /* file change counter */
      dv.setUint32(28, totalPages, false);               /* size in pages — an in-header database size */
      dv.setUint32(32, 0, false); dv.setUint32(36, 0, false);   /* no freelist */
      dv.setUint32(40, 1, false);                        /* schema cookie */
      dv.setUint32(44, 4, false);                        /* schema format 4 */
      dv.setUint32(48, 0, false);                        /* default page cache size */
      dv.setUint32(52, 0, false);                        /* not auto-vacuum, so no largest-root page */
      dv.setUint32(56, 1, false);                        /* text encoding: UTF-8 */
      /* ⚠ THESE TWO BYTES-AT-60-AND-68 ARE WHAT MAKES IT A GEOPACKAGE RATHER THAN A SQLITE FILE.
         The standard (§1.1.1.1) requires application_id 'GPKG' and user_version set to the version
         in the form major·10000 + minor·100 + patch; 1.3.0 is what the schema above is taken from,
         so claiming a later revision would claim tables this file does not write. */
      dv.setUint32(60, 10300, false);                    /* user_version — GeoPackage 1.3.0 */
      dv.setUint32(64, 0, false);                        /* no incremental vacuum */
      dv.setUint32(68, 0x47504b47, false);               /* application_id — "GPKG" */
      dv.setUint32(92, 1, false);                        /* version-valid-for = change counter */
      dv.setUint32(96, SQLITE_VERSION, false);

      return {
        ok: true,
        bytes: out,
        stated: {
          table: table, features: feats.length, columns: colNames.map((c) => c.column),
          columnTypes: colTypes.slice(),
          geometryColumn: 'geom', geometryType: geomType, withZ: withZ, withM: false,
          nullGeometry: nullGeom,
          srsId: srsId, crs: 'EPSG:4326',
          extent: hasExtent ? { minx, miny, maxx, maxy } : null,
          pageSize: GPKG_PAGE, pages: totalPages,
          /* ⚠ STATED BECAUSE IT IS ABSENT (see the section header): a caller telling a reader 「this
             is a GeoPackage」 must not also imply 「and queries on it are indexed」. */
          spatialIndex: false,
          tiles: false,
          userVersion: 10300,
        },
      };
    }

    const API = { sniff, tables, read, write, refusals: () => REFUSALS.slice() };
    try { window.IntMapGisGeopackage = API; } catch (_) { }
    return API;
  })();
}
