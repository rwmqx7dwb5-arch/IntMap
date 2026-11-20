/* ============================================================================
 *  IntMap · THE WAY OUT — window.IntMapGisExport   (#R756)
 * ----------------------------------------------------------------------------
 *  THE GIS LAYER HAD NO EXIT. Measured before this file was written: `.download =` appears four
 *  times in the whole of js/ (companies-ui.js, routing.js, screenshot.js, stats-compare.js) and not
 *  one of them is about data; the only `createObjectURL` under js/gis-*.js is js/gis-worker.js
 *  building its own worker source. So a reader could drop a GeoJSON, a Shapefile, a GeoPackage or a
 *  GeoTIFF on the map, clip it, buffer it, join a table onto it, resample a grid — and then had no
 *  way to take the answer anywhere. js/gis-project.js:39 even tells such a reader that 「store が
 *  使えないなら書き出せばよい」, and THE EXPORT IT NAMED DID NOT EXIST.
 *
 *  ══ THE CONTRACT ══════════════════════════════════════════════════════════════════════════════
 *      formats(kind?)        → [{id, kinds, mediaType, extension, carries, readBackBy, …}, …]
 *      refusals()            → [code, …]  every code this module can answer with
 *      write(target, opts)   → { ok:true, format, filename, mediaType, bytes, text, stated }
 *                            | { ok:false, why, detail }
 *      save(answer)          → true | false   the browser download of a write() answer
 *  `target` is a registry record or the id of one (looked up in window.IntMapData at CALL time, the
 *  same rule every other module here follows). `why` is a CODE, never a sentence — the languages
 *  belong to the call site (docs/GIS-CORE.md §2.2); js/gis-panel.js has the row for each one.
 *
 *  ══ ⚠⚠⚠ 「書き出せた」 IS NOT 「読み直せた」 ═══════════════════════════════════════════════════
 *  A door that emits bytes nobody can read is not a door. So every format here is written against a
 *  READER THAT ALREADY EXISTS IN THIS REPOSITORY, and tests/r754-gis-export-checks.test.mjs closes
 *  the loop with that reader rather than with an assertion about this file:
 *      geojson → js/geo-import.js  readGeoFile()      (the same path a dropped file takes)
 *      csv     → js/geo-import.js  readGeoFile()      (points only — see §2)
 *      geotiff → js/gis-geotiff.js read()             (the reader #R749 built)
 *      kml, gpx → js/geo-import.js readGeoFile()      (its KML and GPX decoders)
 *  ⚠ AND THE TOLERANCE OF THAT LOOP IS ZERO, which is a measurement and not a mercy: JSON.stringify
 *  of a double is the shortest decimal that parses back to the SAME double (ECMA-262, Number::
 *  toString), and a float32 sample is exactly Math.fround of the value it was given. There is no
 *  epsilon anywhere in this file or its checks; a difference is a defect.
 *
 *  ══ ⚠ WHAT IT REFUSES, AND WHY EACH REFUSAL IS A MEASUREMENT ══════════════════════════════════
 *    export-registry-missing    an id was given and there is no registry to resolve it in
 *    export-dataset-missing     the id names nothing
 *    export-format-not-named    no format was chosen. ⚠ NOT DEFAULTED: GeoJSON and CSV keep
 *                               different things, and picking one would drop the other silently
 *    export-format-unknown      a format this module does not write, WITH the list it does
 *    export-format-not-for-kind a vector asked to be a GeoTIFF, or a grid a CSV. Named rather than
 *                               「失敗しました」, because the reader's next move differs
 *    export-empty               nothing to write — 0 features, or a grid with no band asked for.
 *                               ⚠ A FILE WITH NOTHING IN IT, HANDED OVER IN SILENCE, is the shape
 *                               this repository keeps re-finding: the reader saves it, opens it
 *                               tomorrow and concludes the analysis produced nothing
 *    export-band-out-of-range   read(i) for a band the grid does not have
 *    export-band-unreadable     read() threw, or handed back something that is not width·height
 *                               samples. ⚠ A short band written as a short image would place every
 *                               row after the gap one row too far north
 *    export-datatype-unknown    a sample type this writer does not emit, WITH the list it does
 *    export-value-out-of-range  an integer type was asked for and a sample does not fit in it (or
 *                               is not a whole number). Truncating it would be a different grid
 *    export-missing-not-representable
 *                               an integer type, a missing sample, and NO nodata value stated by
 *                               the band. ⚠ docs/GIS-CORE.md §1.4: 「欠損を 0 で埋めない」 — 0 is a
 *                               sea-level elevation and a rainless day, so there is no honest
 *                               integer to write and the refusal says which pixel
 *    export-nodata-conflict     two bands in one file stating different nodata values. GDAL_NODATA
 *                               is ONE tag for the file; writing either one would mislabel the other
 *    export-nodata-not-representable  the stated nodata does not fit the sample type asked for
 *    export-crs-unsupported     a record whose coordinates are not EPSG:4326. This writer states
 *                               4326 in the GeoKeys because the registry pins it there; writing
 *                               those keys over anything else would place the grid by assertion
 *    export-geometry-mixed-dimensions  one geometry whose positions do not all have the same number
 *                               of ordinates — WKT has one dimensionality per geometry, and picking
 *                               one would drop the third ordinate of half the shape in silence
 *    export-serialise-failed    a property value that cannot be serialised (a cycle, a BigInt)
 *    export-geometry-not-representable  a shape the format has no element for — GPX has points and
 *                               lines and no area, so polygons are refused BY NAME AND COUNT (§7.4)
 *
 *  ══ §1 · PROVENANCE TRAVELS AS A VALUE, AND ONLY WHAT IS THERE TRAVELS ════════════════════════
 *  [[intmap-licence-must-be-a-value]]: 739 cities shipped under CC BY 3.0 with no attribution
 *  anywhere, because the condition had been written in PROSE in a comment. So the record's own
 *  provenance goes INTO the file:
 *    · GeoJSON — verbatim under the foreign member `intmap.provenance`, plus the interoperable
 *      `license` / `attribution` / `source` members at the top level
 *    · GeoTIFF — ImageDescription (270), Copyright (33432), DateTime (306), Software (305) and a
 *      GDAL_METADATA (42112) document
 *  ⚠ AND NOTHING ELSE. [[intmap-data-must-not-claim-an-author-it-lacks]]: a record whose provenance
 *  states no licence gets NO licence member — not an empty string, not 「unknown」. The test measures
 *  both directions, because a field that is always present is a field that says nothing.
 *  ⚠ THE SYNONYM TABLE IS A SYNONYM MAP, NOT A CASE LIST. The verbatim copy is the real
 *  carrier: a provenance key that table has never heard of still travels, in full, under
 *  `intmap.provenance`. The table exists only so that a reader's OTHER tools find the licence where
 *  their conventions put it. ⚠ (#729) IT IS NO LONGER IN THIS FILE — js/data-governance.js
 *  `SPELLINGS` holds it, because the same synonyms decide what a gate reads out of a shipped bundle
 *  and what js/reference-data.js credits. One vocabulary, several readers.
 *
 *  ══ §2 · WHAT A CSV CAN AND CANNOT CARRY, SAID OUT LOUD ═══════════════════════════════════════
 *  A CSV is a table. Everything below is in `stated`, in the answer, next to the bytes:
 *    · POINTS get `longitude` / `latitude` columns, because that is what js/geo-import.js reads back
 *      — `stated.geometryRoundTrip` is true and the loop is closed in the checks.
 *    · ANYTHING ELSE gets ONE `geometry_wkt` column holding the full WKT. ⚠ THE SHAPE IS NOT
 *      DROPPED — but IntMap's own CSV door does not reconstruct it, so `stated.geometryRoundTrip` is
 *      FALSE and `stated.geometry` says `wkt`. Saying 「書き出しました」 about a polygon that comes
 *      back as a row of attributes is the silent loss this field exists to prevent.
 *    · ROWS WITH NO GEOMETRY are counted into `stated.rowsWithoutGeometry` — a statistics table is a
 *      legitimate export, an unannounced one is not.
 *    · QUOTING is RFC 4180: a value is quoted when it holds the delimiter, a double quote, CR or LF,
 *      and an inner quote is doubled. ⚠ NEWLINES ARE NOT STRIPPED — a cell that holds two lines is
 *      two lines, and removing them would edit the reader's data on the way out. The line ending is
 *      CRLF, the delimiter is stated, and a non-scalar value (`_z`, `_m`, a nested object) is JSON.
 *    · A COLUMN NAME COLLISION is resolved by suffixing the ADDED column (`longitude_1`), never by
 *      overwriting the reader's own column, and `stated.geometryColumns` names what was written.
 * ==========================================================================*/

/* ⚠ (#729) THE SYNONYM TABLE THAT USED TO LIVE IN THIS FILE NOW LIVES IN ONE PLACE. It was
   `INTEROP` in the closure below — correct for what this file read, and unreachable from anywhere
   else, so the 53 build scripts that write the same facts used their own spellings (`src`,
   `generated`, `lic`) and js/reference-data.js used a third. One vocabulary with several readers is
   the point; two vocabularies is how 「ライセンス」 and 「licence」 become two facts. */
import { statedValue } from './data-governance.js';

export function makeGisExport() {
  return (function () {

    /* ══ 0 · REFUSALS ═════════════════════════════════════════════════════════════════════════
       ⚠ DECLARED, and bad() refuses an undeclared one — the same contract js/gis-geopackage.js and
       js/gis-geotiff.js hold, and for the same reason: js/gis-panel.js turns each of these into a
       sentence, and a code that exists only as a throw reaches a reader wordless. */
    const REFUSALS = Object.freeze([
      'export-registry-missing', 'export-dataset-missing', 'export-format-not-named',
      'export-format-unknown', 'export-format-not-for-kind', 'export-empty',
      'export-band-out-of-range', 'export-band-unreadable', 'export-datatype-unknown',
      'export-value-out-of-range', 'export-missing-not-representable', 'export-nodata-conflict',
      'export-nodata-not-representable', 'export-crs-unsupported',
      'export-geometry-mixed-dimensions', 'export-serialise-failed', 'export-geometry-not-representable',
    ]);
    function bad(why, detail) {
      if (REFUSALS.indexOf(why) < 0) throw new Error('gis-export: undeclared refusal code ' + why);
      return detail === undefined ? { ok: false, why: why } : { ok: false, why: why, detail: detail };
    }
    const refusals = () => REFUSALS.slice();

    /* ══ 1 · WHAT CAN BE WRITTEN ══════════════════════════════════════════════════════════════
       A DECLARATION, read by js/gis-panel.js to build its control — the same rule the ops follow
       (js/gis-panel.js §1: 「宣言から作る、一覧を書き写さない」). `readBackBy` is the module that
       reads the bytes again, and it is in the declaration because it is the claim the round-trip
       checks measure; a format with nothing on that line would be bytes with no reader. */
    const FORMATS = Object.freeze([
      Object.freeze({
        id: 'geojson', kinds: Object.freeze(['vector']),
        mediaType: 'application/geo+json', extension: 'geojson',
        carries: Object.freeze(['geometry', 'attributes', 'time', 'provenance']),
        readBackBy: 'js/geo-import.js', geometryRoundTrip: true,
      }),
      Object.freeze({
        id: 'csv', kinds: Object.freeze(['vector']),
        mediaType: 'text/csv', extension: 'csv',
        carries: Object.freeze(['attributes', 'geometry-as-columns-or-wkt']),
        readBackBy: 'js/geo-import.js', geometryRoundTrip: null,   /* points yes, shapes no — §2 */
      }),
      Object.freeze({
        id: 'geotiff', kinds: Object.freeze(['raster']),
        mediaType: 'image/tiff', extension: 'tif',
        carries: Object.freeze(['samples', 'georeference', 'band-names', 'nodata', 'provenance']),
        readBackBy: 'js/gis-geotiff.js', geometryRoundTrip: true,
      }),
      /* (#R783) THE FORMAT A GIS TAKES WITHOUT ARGUMENT. GeoJSON has no declared types, no spatial
         reference a tool will honour and nowhere a licence survives being opened in QGIS; this
         module could READ a GeoPackage since #R738 and not write one. ⚠ THE WRITER IS NOT HERE —
         js/gis-geopackage.js §9 owns the format, both directions, so that the CREATE TABLE text its
         own §4 parses is generated by the file that parses it. This entry is the door; that file is
         the format. Its refusals (`gpkg-write-…`) travel out through `why` unchanged. */
      Object.freeze({
        id: 'geopackage', kinds: Object.freeze(['vector']),
        mediaType: 'application/geopackage+sqlite3', extension: 'gpkg',
        carries: Object.freeze(['geometry', 'attributes', 'column-types', 'crs', 'extent', 'provenance']),
        readBackBy: 'js/gis-geopackage.js', geometryRoundTrip: true,
      }),
      /* KML 2.2 and GPX 1.1 (docs/GIS-CORE.md §7.4). Both state WGS 84 and are read back by
         js/geo-import.js; GPX has no area, so a dataset with polygons is refused by name there. */
      Object.freeze({
        id: 'kml', kinds: Object.freeze(['vector']),
        mediaType: 'application/vnd.google-earth.kml+xml', extension: 'kml',
        carries: Object.freeze(['geometry', 'attributes', 'time-if-declared', 'provenance-as-description']),
        readBackBy: 'js/geo-import.js', geometryRoundTrip: true,
      }),
      Object.freeze({
        id: 'gpx', kinds: Object.freeze(['vector']),
        mediaType: 'application/gpx+xml', extension: 'gpx',
        carries: Object.freeze(['points-and-lines', 'attributes', 'time-if-declared', 'provenance-as-description']),
        readBackBy: 'js/geo-import.js', geometryRoundTrip: true,
      }),
      /* ⚠⚠⚠ `cog` IS A LAYOUT CLAIM, NOT A COMPRESSION CLAIM (#R783). The Cloud-Optimized GeoTIFF
         convention is about WHERE the bytes are — tiles, internal overviews, and every IFD ahead of
         every pixel so that one HTTP range gets the header and a second gets the tile a viewer
         needs. A Deflate-compressed strip TIFF is NOT a COG, and naming one that would be the
         「ハリボテ」 AGENTS.md §3-3 forbids; see §7.1 for the five conditions this writer meets and
         the one it does not claim. The name is earned by an outside verdict, not by this table:
         tests/r783-format-compat-checks.test.mjs puts the bytes through rio-cogeo's cog_validate,
         which is the COG specification's own checker and has nothing to do with this repository. */
      Object.freeze({
        id: 'cog', kinds: Object.freeze(['raster']),
        mediaType: 'image/tiff; application=geotiff; profile=cloud-optimized', extension: 'tif',
        carries: Object.freeze(['samples', 'georeference', 'band-names', 'nodata', 'provenance', 'overviews']),
        readBackBy: 'js/gis-geotiff.js', geometryRoundTrip: true,
      }),
    ]);
    function formats(kind) {
      if (kind == null) return FORMATS.slice();
      return FORMATS.filter((f) => f.kinds.indexOf(String(kind)) >= 0);
    }
    const formatById = (id) => FORMATS.find((f) => f.id === String(id)) || null;

    /* ══ 2 · PROVENANCE, READ AND NEVER INVENTED (§1) ═════════════════════════════════════════ */

    /* Synonyms for one fact, in the spellings this repository's own provenance writers use:
       js/map-ui.js writes `file` / `format` / `readAt`, js/gis-layers.js writes `layer` / `at`, and
       js/gis-datasets.js's header states `{kind:'import', file, licence, url}`. ⚠ `licence` and
       `license` are two spellings of ONE word, not two facts. A key that is in none of these lists
       is NOT lost: the whole provenance object travels verbatim beside them.
       ⚠⚠⚠ (#729) AND THE TABLE IS NO LONGER HERE. The groups come from js/data-governance.js,
       which every gate, every build script and the reader-visible credits now read, so a spelling
       added for a bundle is a spelling this exporter understands the same day. The only thing left
       in this file is the NAMES THE WRITERS BELOW USE — `license` is the key of the returned object,
       `licence` is the group in the shared vocabulary, and mapping one to the other here keeps both
       halves of the contract unchanged. */
    const GROUP = Object.freeze({ license: 'licence', attribution: 'attribution', source: 'source', retrievedAt: 'retrievedAt' });

    /* The first key of the group that the provenance ACTUALLY carries, or null. ⚠ An empty string is
       not a statement: a licence field somebody left blank must not become a licence claim — the
       rule now lives beside the vocabulary it guards, so the blank that this exporter refuses is the
       blank a gate refuses.
       ⚠ THE IMPORT IS NOT RENAMED; THE LOCAL WRAPPER IS. scripts/check-split-scope.mjs walks an
       `import { a as b }` specifier as a REFERENCE to `a`, so an aliased import reads as a free
       identifier that resolves to nothing. js/nominatim-gate.js:86 and js/pandemic-world.js:40 both
       record the same encounter and the same answer — take the name the module exports. */
    const statedOf = (prov, group) => statedValue(prov, GROUP[group]);

    /* What the record's provenance states, as four values plus the whole object. Used by both
       writers, so a licence that reaches a GeoJSON reaches a GeoTIFF too — one rule, two carriers. */
    function provenanceOf(rec) {
      const prov = (rec && rec.provenance) || null;
      /* (#gov) 演算の出力は入力の条件を `upstreams` に持つ（js/gis-ops.js inheritTerms）。
         ⚠ license は**全ての入力が述べているときだけ**書く: 1 つでも黙っていれば、残りの条件を束全体の
         条件として主張しない（沈黙は許諾ではない）。credit の文は、述べた入力の分を全部載せる——表示の義務は
         黙った入力の分だけ消えてよいものではない。どちらも完全な行は `intmap.provenance` に残る。 */
      const ups = prov && Array.isArray(prov.upstreams) ? prov.upstreams.filter((u) => u && typeof u === 'object') : null;
      const uniq = (a) => a.filter((v, i) => a.indexOf(v) === i);
      let lic = statedOf(prov, 'license'), att = statedOf(prov, 'attribution');
      if (ups && ups.length) {
        const ls = ups.map((u) => statedOf(u, 'license'));
        if (lic == null && ls.every((v) => typeof v === 'string')) lic = uniq(ls).join('; ');
        const as = ups.map((u) => (typeof u.credit === 'string' ? u.credit : statedOf(u, 'attribution'))).filter((v) => typeof v === 'string' && v.trim());
        if (att == null && as.length) att = uniq(as).join(' / ');
      }
      return {
        license: lic,
        attribution: att,
        source: statedOf(prov, 'source'),
        retrievedAt: statedOf(prov, 'retrievedAt'),
        /* verbatim — the real carrier. null when the record states nothing at all. */
        raw: prov ? clone(prov) : null,
      };
    }

    function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; } }

    /* ══ 3 · NAMES ════════════════════════════════════════════════════════════════════════════ */

    /* ⚠ 120 IS NOT A ROUND NUMBER SOMEBODY LIKED. Observation: NTFS, APFS and ext4 all cap a single
       name at 255 bytes, and a title in Japanese is 3 bytes per character in UTF-8 — 120 characters
       is 360 bytes, so the cap is applied in CHARACTERS after the 255-byte limit is converted at the
       worst case (255 ÷ 3 = 85) and then the extension and a browser's 「(1)」 suffix are left room.
       Expires if this ever writes into a filesystem with a different limit; it does not name a file
       itself — the browser does, from this suggestion. */
    const NAME_MAX = 80;
    function filenameFor(rec, fmt) {
      const base = String((rec && rec.title) || (rec && rec.id) || 'dataset')
        .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-')     /* the characters Windows and POSIX refuse */
        .replace(/\s+/g, ' ').trim()
        .slice(0, NAME_MAX)
        .replace(/[.\s]+$/, '');                          /* Windows drops a trailing dot or space */
      return (base || 'dataset') + '.' + fmt.extension;
    }

    /* ══ 4 · GEOJSON ══════════════════════════════════════════════════════════════════════════ */

    function writeGeoJson(rec, feats, opts) {
      const prov = provenanceOf(rec);
      let without = 0;
      const out = new Array(feats.length);
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i] || {};
        const g = f.geometry || null;
        if (!g) without++;
        const one = { type: 'Feature', geometry: g, properties: (f.properties == null ? {} : f.properties) };
        /* A feature id and a bbox are the reader's, not ours: carried when they are there, never
           manufactured when they are not. */
        if (f.id !== undefined) one.id = f.id;
        if (f.bbox !== undefined) one.bbox = f.bbox;
        out[i] = one;
      }

      const fc = { type: 'FeatureCollection', features: out };
      /* ⚠ ONLY WHAT THE RECORD STATES (§1). Absent, not null — `'license' in fc` is the question a
         downstream tool asks, and a null answers it wrongly. */
      if (prov.license != null) fc.license = prov.license;
      if (prov.attribution != null) fc.attribution = prov.attribution;
      if (prov.source != null) fc.source = prov.source;
      fc.intmap = {
        dataset: {
          id: rec.id == null ? null : String(rec.id),
          title: rec.title == null ? null : String(rec.title),
          kind: rec.kind || 'vector',
          crs: rec.crs || null,
          sourceCrs: rec.sourceCrs == null ? null : rec.sourceCrs,
          geometryType: rec.geometryType == null ? null : rec.geometryType,
          count: rec.count == null ? feats.length : rec.count,
          withGeometry: rec.withGeometry === undefined ? (feats.length - without) : rec.withGeometry,
          /* the VERIFIED declaration the registry holds, and the refusal beside it — a time axis
             that the data did not bear out must not leave here looking like one that did */
          time: rec.time == null ? null : clone(rec.time),
          timeRefused: rec.timeRefused == null ? null : clone(rec.timeRefused),
          createdAt: rec.createdAt == null ? null : rec.createdAt,
        },
        provenance: prov.raw,
        retrievedAt: prov.retrievedAt == null ? null : prov.retrievedAt,
        export: { by: 'IntMap', format: 'geojson', at: new Date().toISOString() },
      };

      let text;
      try { text = JSON.stringify(fc, null, opts && opts.pretty === false ? 0 : 1); }
      catch (e) { return bad('export-serialise-failed', { message: String((e && e.message) || e) }); }
      return {
        text: text,
        stated: {
          features: out.length,
          rowsWithoutGeometry: without,
          geometry: without === out.length ? 'none' : 'verbatim',
          geometryRoundTrip: true,
          license: prov.license == null ? null : prov.license,
          attribution: prov.attribution == null ? null : prov.attribution,
          source: prov.source == null ? null : prov.source,
          retrievedAt: prov.retrievedAt == null ? null : prov.retrievedAt,
          provenanceCarried: prov.raw != null,
        },
      };
    }

    /* ══ 5 · WKT — SO THAT A SHAPE IN A CSV IS STILL A SHAPE ══════════════════════════════════ */

    const WKT_NAME = {
      Point: 'POINT', MultiPoint: 'MULTIPOINT', LineString: 'LINESTRING',
      MultiLineString: 'MULTILINESTRING', Polygon: 'POLYGON', MultiPolygon: 'MULTIPOLYGON',
      GeometryCollection: 'GEOMETRYCOLLECTION',
    };

    /* How many ordinates each position of this geometry has — ONE number or a refusal. ⚠ WKT states
       its dimensionality once per geometry (`POINT Z`), so a shape whose positions disagree cannot
       be written without choosing which half to damage. */
    function dimsOf(g, seen) {
      if (!g) return { ok: true, dims: seen };
      if (g.type === 'GeometryCollection') {
        let d = seen;
        for (const sub of (g.geometries || [])) {
          const r = dimsOf(sub, d);
          if (!r.ok) return r;
          d = r.dims;
        }
        return { ok: true, dims: d };
      }
      let d = seen, mixed = false;
      (function walk(c) {
        if (!Array.isArray(c) || mixed) return;
        if (typeof c[0] === 'number') {
          const n = c.length >= 3 ? 3 : 2;
          if (d == null) d = n;
          else if (d !== n) mixed = true;
          return;
        }
        for (const x of c) walk(x);
      })(g.coordinates);
      return mixed ? { ok: false } : { ok: true, dims: d };
    }

    function wktOf(g) {
      if (!g || !g.type) return { ok: true, text: '' };
      const dim = dimsOf(g, null);
      if (!dim.ok) return { ok: false };
      const z = dim.dims === 3;
      /* ⚠ A non-finite ordinate has no WKT notation. It cannot be written as 0 — that is a position
         on the equator — so the geometry is refused through the same door a mixed one is. */
      let unwritable = false;
      const num = (v) => { const n = Number(v); if (!isFinite(n)) { unwritable = true; return '0'; } return String(n); };
      const pos = (p) => {
        const parts = [num(p[0]), num(p[1])];
        if (z) parts.push(num(p[2]));
        return parts.join(' ');
      };
      const list = (a, depth) => (depth === 0 ? pos(a) : '(' + a.map((x) => list(x, depth - 1)).join(', ') + ')');
      const DEPTH = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
      const tag = WKT_NAME[g.type];
      if (!tag) return { ok: true, text: '' };                    /* an unknown type is not a WKT */
      const head = tag + (z ? ' Z ' : ' ');
      if (g.type === 'GeometryCollection') {
        const subs = [];
        for (const sub of (g.geometries || [])) {
          const r = wktOf(sub);
          if (!r.ok) return r;
          if (r.text) subs.push(r.text);
        }
        return { ok: true, text: head + '(' + subs.join(', ') + ')' };
      }
      const c = g.coordinates;
      if (!Array.isArray(c) || c.length === 0) return { ok: true, text: head + 'EMPTY' };
      const text = (g.type === 'Point') ? head + '(' + pos(c) + ')' : head + list(c, DEPTH[g.type]);
      return unwritable ? { ok: false } : { ok: true, text: text };
    }

    /* ══ 6 · CSV (§2) ═════════════════════════════════════════════════════════════════════════ */

    /* RFC 4180. ⚠ The newline inside a cell is KEPT — see §2. */
    function csvCell(v, delim) {
      const s = String(v);
      const needs = s.indexOf(delim) >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0;
      return needs ? '"' + s.split('"').join('""') + '"' : s;
    }

    /* A name that is not already taken, by suffixing the ADDED column rather than the reader's. */
    function freeName(want, taken) {
      if (taken.indexOf(want) < 0) return want;
      for (let i = 1; ; i++) { const n = want + '_' + i; if (taken.indexOf(n) < 0) return n; }
    }

    function writeCsv(rec, feats, opts) {
      const delim = (opts && typeof opts.delimiter === 'string' && opts.delimiter.length === 1) ? opts.delimiter : ',';
      const bom = !!(opts && opts.bom);

      /* ⚠ THE COLUMNS ARE MEASURED FROM THE ROWS, in first-seen order — the same rule
         js/gis-datasets.js types them by. A list taken from `fields` alone would drop a property
         that arrived after the record was described. */
      const cols = [];
      let without = 0, allPoints = true, anyGeometry = false;
      for (const f of feats) {
        const p = (f && f.properties) || {};
        for (const k of Object.keys(p)) if (cols.indexOf(k) < 0) cols.push(k);
        const g = f && f.geometry;
        if (!g) { without++; continue; }
        anyGeometry = true;
        if (g.type !== 'Point') allPoints = false;
      }

      const asPoints = anyGeometry && allPoints;
      const added = [];
      let lonCol = null, latCol = null, wktCol = null;
      if (anyGeometry) {
        if (asPoints) {
          /* the spellings js/geo-import.js scores highest — see tests/file-import-checks.test.mjs #R576 ① */
          lonCol = freeName('longitude', cols.concat(added)); added.push(lonCol);
          latCol = freeName('latitude', cols.concat(added)); added.push(latCol);
        } else {
          wktCol = freeName('geometry_wkt', cols.concat(added)); added.push(wktCol);
        }
      }

      const header = cols.concat(added).map((c) => csvCell(c, delim)).join(delim);
      const lines = [header];
      let nonFinite = 0, complex = 0;
      for (const f of feats) {
        const p = (f && f.properties) || {};
        const cells = [];
        for (const k of cols) {
          const v = Object.prototype.hasOwnProperty.call(p, k) ? p[k] : null;
          if (v == null) { cells.push(''); continue; }
          if (typeof v === 'number') {
            /* ⚠ COUNTED, NOT HIDDEN: NaN and ±Infinity have no CSV notation, so the cell is empty
               and `stated.nonFiniteCells` says how many times that happened. */
            if (!isFinite(v)) { nonFinite++; cells.push(''); continue; }
            cells.push(csvCell(String(v), delim)); continue;
          }
          if (typeof v === 'string') { cells.push(csvCell(v, delim)); continue; }
          if (typeof v === 'boolean') { cells.push(v ? 'true' : 'false'); continue; }
          let j;
          try { j = JSON.stringify(v); } catch (e) { return bad('export-serialise-failed', { column: k, message: String((e && e.message) || e) }); }
          if (j === undefined) { cells.push(''); continue; }
          complex++;
          cells.push(csvCell(j, delim));
        }
        const g = f && f.geometry;
        if (asPoints) {
          const c = (g && Array.isArray(g.coordinates)) ? g.coordinates : null;
          cells.push(c ? String(c[0]) : '');
          cells.push(c ? String(c[1]) : '');
        } else if (wktCol) {
          const r = wktOf(g);
          if (!r.ok) return bad('export-geometry-mixed-dimensions', { geometryType: (g && g.type) || null });
          cells.push(csvCell(r.text, delim));
        }
        lines.push(cells.join(delim));
      }

      /* CRLF, RFC 4180 §2.1, and a trailing one so that the last record is terminated like the
         others rather than by end-of-file. */
      const text = (bom ? '﻿' : '') + lines.join('\r\n') + '\r\n';
      return {
        text: text,
        stated: {
          rows: feats.length,
          columns: cols.concat(added),
          rowsWithoutGeometry: without,
          /* ⚠ THE THREE ANSWERS ARE DIFFERENT CLAIMS (§2). */
          geometry: !anyGeometry ? 'none' : (asPoints ? 'lon-lat-columns' : 'wkt'),
          geometryColumns: asPoints ? [lonCol, latCol] : (wktCol ? [wktCol] : []),
          /* ⚠ FALSE FOR WKT, and that is the point of the field: the shape is in the file, and
             IntMap's own CSV door will hand it back as text rather than as a geometry. */
          geometryRoundTrip: asPoints,
          delimiter: delim,
          quote: '"',
          lineEnding: 'CRLF',
          bom: bom,
          nonFiniteCells: nonFinite,
          complexCells: complex,
          /* A CSV has no room for a licence, so the answer says where it went instead of pretending
             it travelled. ⚠ This is why the panel offers GeoJSON beside it. */
          provenanceCarried: false,
          license: null, attribution: null, source: null, retrievedAt: null,
        },
      };
    }

    /* ══ 7 · GEOTIFF ══════════════════════════════════════════════════════════════════════════
       Written against TIFF 6.0 (Adobe, 1992) and OGC GeoTIFF 1.1, and read back by
       js/gis-geotiff.js — uncompressed, one strip, little-endian, PlanarConfiguration 1. There is no
       compressor here on purpose: a Deflate writer would be a second implementation of something
       DecompressionStream's partner CompressionStream already does, and it is not what was missing. */

    const DTYPES = Object.freeze({
      /* name → {bits, sampleFormat, min, max, put} — the three numbers TIFF needs and the two that
         decide whether a sample FITS. An integer that does not fit is refused, never wrapped. */
      float32: { bits: 32, fmt: 3, float: true },
      float64: { bits: 64, fmt: 3, float: true },
      int8: { bits: 8, fmt: 2, min: -128, max: 127 },
      int16: { bits: 16, fmt: 2, min: -32768, max: 32767 },
      int32: { bits: 32, fmt: 2, min: -2147483648, max: 2147483647 },
      uint8: { bits: 8, fmt: 1, min: 0, max: 255 },
      uint16: { bits: 16, fmt: 1, min: 0, max: 65535 },
      uint32: { bits: 32, fmt: 1, min: 0, max: 4294967295 },
    });

    function putSample(dv, at, v, t, le) {
      if (t.fmt === 3) return t.bits === 32 ? dv.setFloat32(at, v, le) : dv.setFloat64(at, v, le);
      if (t.fmt === 2) {
        if (t.bits === 8) return dv.setInt8(at, v);
        if (t.bits === 16) return dv.setInt16(at, v, le);
        return dv.setInt32(at, v, le);
      }
      if (t.bits === 8) return dv.setUint8(at, v);
      if (t.bits === 16) return dv.setUint16(at, v, le);
      return dv.setUint32(at, v, le);
    }

    const TFIELD = { BYTE: 1, ASCII: 2, SHORT: 3, LONG: 4, DOUBLE: 12 };
    const TSIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 };

    /* ⚠ UTF-8, NOT 7-BIT. TIFF 6.0 calls the type ASCII, and the literal reading of that would turn
       「CC BY 4.0 — 国土地理院」 into 「CC BY 4.0 ? ??????」 — a licence and an attribution DAMAGED on
       the way out, which is the whole of what [[intmap-licence-must-be-a-value]] is about. A NUL-
       terminated UTF-8 byte string is what GDAL, QGIS and ExifTool write and read in these fields,
       and it is byte-identical to ASCII for text that happens to be 7-bit. MEASURED in
       tests/r754-gis-export-checks ⑥ with an em dash and with Japanese. */
    function asciiValues(s) {
      const out = Array.from(new TextEncoder().encode(String(s)));
      out.push(0);
      return out;
    }

    /* ONE XML escaper in this file (scripts/safe-output.mjs): the GDAL metadata block is the same
       grammar the KML/GPX writers below emit, so it reads through xe() — which also drops the
       characters XML 1.0 cannot carry instead of writing a file no reader parses. Quote-safe (attr). */
    const xmlEsc = (s) => xe(s, { charactersRemoved: 0 }, true);

    /* The inverse of putSample, needed because the overviews below are computed from the samples
       AS WRITTEN rather than from rec.read()'s numbers again. ⚠ THAT IS THE POINT: the write loop is
       the only place that decides what a missing sample becomes and whether a value fits the type,
       and an overview derived from a second, unvalidated pass could disagree with the image it
       claims to reduce — a small picture of a different raster. */
    function getSample(dv, at, t, le) {
      if (t.fmt === 3) return t.bits === 32 ? dv.getFloat32(at, le) : dv.getFloat64(at, le);
      if (t.fmt === 2) {
        if (t.bits === 8) return dv.getInt8(at);
        if (t.bits === 16) return dv.getInt16(at, le);
        return dv.getInt32(at, le);
      }
      if (t.bits === 8) return dv.getUint8(at);
      if (t.bits === 16) return dv.getUint16(at, le);
      return dv.getUint32(at, le);
    }

    /* ══ 7.1 · THE COG LAYOUT ═════════════════════════════════════════════════════════════════
       A Cloud-Optimized GeoTIFF is an ordinary GeoTIFF whose BYTES ARE IN A PARTICULAR ORDER, so
       that a reader with HTTP range requests can draw a preview without fetching the file. The five
       conditions, each of which is asserted from outside in tests/r783-format-compat-checks:
         1. TILED, not stripped — a tile is a square window, so a viewport costs the tiles it covers
            instead of every row it crosses.
         2. INTERNAL OVERVIEWS — reduced-resolution copies as further IFDs, halving until the whole
            level fits in one tile, so a zoomed-out view is one small read.
         3. EVERY IFD BEFORE EVERY PIXEL, and IFD 0 near the front, so one read at the start of the
            file yields the entire structure.
         4. OVERVIEW PIXELS BEFORE FULL-RESOLUTION PIXELS, smallest level first — the order a reader
            zooming in asks for them.
         5. TILES IN ROW-MAJOR ORDER within each level, at increasing offsets, so that neighbouring
            tiles are adjacent bytes and a viewport is one contiguous range rather than n.
       ⚠ WHAT IS NOT CLAIMED: compression. Every tile here is uncompressed, for the reason §7 already
       states — and a COG does not require compression, so this is a complete COG and a large one.
       The `carries` row says `overviews`; it does not say `compressed`.

       ⚠ THE GHOST AREA IS A SET OF ASSERTIONS ABOUT THIS FILE, SO IT STATES ONLY WHAT IS TRUE.
       GDAL puts a plain-text block between the header and IFD 0 declaring the layout it used; its
       GTiff driver reads that block back and reports `LAYOUT=COG` in the IMAGE_STRUCTURE domain
       only when all four properties hold. So all four ARE implemented — including the block leader
       (a uint32 of the tile's length immediately before it) and the block trailer (the tile's last
       four bytes repeated immediately after), which let a reader that over-fetched a range detect
       a truncated or concurrently-rewritten tile. Writing the declaration without the bytes would
       be a file that describes itself incorrectly, which is worse than one that says nothing. */

    /* 512 is GDAL's own COG default (BLOCKSIZE), and the number every COG reader is tuned for; TIFF
       6.0 §15 requires tile dimensions to be a multiple of 16, which 512 is. Failing condition: a
       reader population whose typical viewport makes 256 or 1024 cheaper, which would be measured
       as bytes-per-viewport rather than chosen. The COG specification names no size. */
    const COG_TILE = 512;

    /* Chunky (PlanarConfiguration 1) samples for one level, halved from the level above by averaging
       each 2×2 block. ⚠ MISSING SAMPLES ARE NOT AVERAGED IN. Averaging a nodata sentinel — a -9999
       elevation, a 0 that means 「no observation」 — would manufacture a value that is neither the
       data nor the gap (docs/GIS-CORE.md §1.4). A block with no valid sample stays missing; a block
       with some yields the mean of those, which is what GDAL's AVERAGE resampling does. */
    function halveChunky(src, sw, sh, spp, T, nodata) {
      const bytesPer = T.bits >> 3;
      const dw = Math.max(1, Math.ceil(sw / 2)), dh = Math.max(1, Math.ceil(sh / 2));
      const sdv = new DataView(src.buffer, src.byteOffset, src.byteLength);
      const out = new Uint8Array(dw * dh * spp * bytesPer);
      const odv = new DataView(out.buffer);
      const missing = (v) => (!isFinite(v) || (nodata != null && v === nodata));
      const fill = (nodata != null ? nodata : (T.float ? NaN : 0));
      for (let y = 0; y < dh; y++) {
        for (let x = 0; x < dw; x++) {
          for (let s = 0; s < spp; s++) {
            let sum = 0, n = 0;
            for (let dy = 0; dy < 2; dy++) {
              const sy = y * 2 + dy; if (sy >= sh) continue;
              for (let dx = 0; dx < 2; dx++) {
                const sx = x * 2 + dx; if (sx >= sw) continue;
                const v = getSample(sdv, ((sy * sw + sx) * spp + s) * bytesPer, T, true);
                if (missing(v)) continue;
                sum += v; n++;
              }
            }
            /* ⚠ ROUNDED FOR AN INTEGER TYPE, NOT TRUNCATED: truncation biases every overview
               downwards, and the bias compounds with each level. */
            const v = n === 0 ? fill : (T.float ? (sum / n) : Math.round(sum / n));
            putSample(odv, ((y * dw + x) * spp + s) * bytesPer, v, T, true);
          }
        }
      }
      return { bytes: out, width: dw, height: dh };
    }

    /* One level's chunky samples cut into row-major tiles (condition 5). Every tile is the full
       COG_TILE² regardless of where the image edge falls — TIFF 6.0 requires it — and the part
       outside the image is filled with the stated missing value, never with 0: an edge tile padded
       with zeroes hands a reader sea level and a rainless day past the end of the data. */
    function tilesOf(src, w, h, spp, T, nodata, tile) {
      const bytesPer = T.bits >> 3;
      const across = Math.ceil(w / tile), down = Math.ceil(h / tile);
      const sdv = new DataView(src.buffer, src.byteOffset, src.byteLength);
      const pad = (nodata != null ? nodata : (T.float ? NaN : 0));
      const out = [];
      for (let ty = 0; ty < down; ty++) {
        for (let tx = 0; tx < across; tx++) {
          const buf = new Uint8Array(tile * tile * spp * bytesPer);
          const bdv = new DataView(buf.buffer);
          for (let y = 0; y < tile; y++) {
            const sy = ty * tile + y;
            for (let x = 0; x < tile; x++) {
              const sx = tx * tile + x;
              const inside = (sy < h && sx < w);
              for (let s = 0; s < spp; s++) {
                const at = ((y * tile + x) * spp + s) * bytesPer;
                if (inside) putSample(bdv, at, getSample(sdv, ((sy * w + sx) * spp + s) * bytesPer, T, true), T, true);
                else putSample(bdv, at, pad, T, true);
              }
            }
          }
          out.push(buf);
        }
      }
      return { tiles: out, across: across, down: down };
    }

    /* ══ 7.2 · ONE ASSEMBLER FOR BOTH LAYOUTS ═════════════════════════════════════════════════
       A strip TIFF and a COG differ in HOW MANY IFDs there are, WHICH tag carries the chunk offsets,
       and IN WHAT ORDER the chunk data is placed. Everything else — sorting the entries, deciding
       which values fit in the four bytes of the entry and which need space of their own, chaining
       the IFDs, patching the offsets once they are known — is identical, and was written once here
       rather than twice. ⚠ THE OFFSETS CANNOT BE COMPUTED LAZILY: an entry's VALUES are patched after
       placement, but its SIZE is known from the start (the tile count does not change), so the
       layout is computed in full and only then serialised.

       ifds: [{ entries, offsetTag, countTag, chunks }]  — entries may name offsetTag/countTag with
       any placeholder values; they are overwritten.
       dataOrder: indexes into ifds, in the order their chunk bytes go into the file.
       leaderTrailer: write the uint32 length before and the repeated last four bytes after each
       chunk (what the ghost area declares for a COG). */
    function assembleTiff(o) {
      const ifds = o.ifds, ghost = o.ghost || null;
      const dataOrder = o.dataOrder || ifds.map((_, i) => i);
      const lt = !!o.leaderTrailer;

      const plans = ifds.map((ifd) => {
        const entries = ifd.entries.slice().sort((a, b) => a.tag - b.tag);
        /* ⚠⚠⚠ A DUPLICATE TAG IS REFUSED HERE RATHER THAN AT THE CALL SITE, because the caller is
           where it happened once already: the COG path assembles one IFD from three sources (the
           image structure, the tile tags, the dataset metadata) and gave IFD 0 two 42113s. TIFF 6.0
           §2 lets a reader binary-search a sorted, unique entry list, so a duplicate makes WHICH
           VALUE WINS a property of the reader — and both GDAL and the COG validator accepted it,
           each silently taking the first. Put on the fact (「an IFD has one entry per tag」) rather
           than on the one path that broke it, so a fourth source of entries cannot repeat it. */
        for (let i = 1; i < entries.length; i++) {
          if (entries[i].tag === entries[i - 1].tag) {
            throw new Error('gis-export: IFD names tag ' + entries[i].tag + ' twice');
          }
        }
        return { ifd: ifd, entries: entries, sizes: entries.map((e) => TSIZE[e.type] * e.values.length) };
      });

      let p = 8 + (ghost ? ghost.length : 0);
      if (p & 1) p++;
      /* the IFD structures themselves, contiguous and ahead of everything (condition 3) */
      for (const pl of plans) { pl.at = p; p += 2 + 12 * pl.entries.length + 4; }
      /* then the values too big to live inside an entry */
      for (const pl of plans) {
        pl.extraAt = pl.sizes.map((sz) => {
          if (sz <= 4) return -1;
          const at = p; p += sz + (sz & 1); return at;
        });
      }
      /* then the pixels, in the order asked for (condition 4) */
      for (const idx of dataOrder) {
        const pl = plans[idx];
        if (p & 1) p++;
        pl.chunkAt = [];
        for (const c of pl.ifd.chunks) {
          if (lt) p += 4;
          pl.chunkAt.push(p);
          p += c.length + (lt ? 4 : 0);
        }
      }

      const out = new Uint8Array(p);
      const dv = new DataView(out.buffer);
      out[0] = 0x49; out[1] = 0x49;                      /* II — little-endian */
      dv.setUint16(2, 42, true);
      dv.setUint32(4, plans[0].at, true);
      if (ghost) out.set(ghost, 8);

      for (let i = 0; i < plans.length; i++) {
        const pl = plans[i];
        /* the offsets are known now, so the two tags that carry them are told the truth */
        for (let k = 0; k < pl.entries.length; k++) {
          const e = pl.entries[k];
          if (e.tag === pl.ifd.offsetTag) e.values = pl.chunkAt.slice();
          else if (e.tag === pl.ifd.countTag) e.values = pl.ifd.chunks.map((c) => c.length);
        }
        const n = pl.entries.length;
        dv.setUint16(pl.at, n, true);
        for (let k = 0; k < n; k++) {
          const e = pl.entries[k], at = pl.at + 2 + k * 12;
          dv.setUint16(at, e.tag, true);
          dv.setUint16(at + 2, e.type, true);
          dv.setUint32(at + 4, e.values.length, true);
          const put = (base) => {
            for (let j = 0; j < e.values.length; j++) {
              const o2 = base + j * TSIZE[e.type], v = e.values[j];
              if (e.type === TFIELD.ASCII || e.type === TFIELD.BYTE) dv.setUint8(o2, v);
              else if (e.type === TFIELD.SHORT) dv.setUint16(o2, v, true);
              else if (e.type === TFIELD.LONG) dv.setUint32(o2, v, true);
              else dv.setFloat64(o2, v, true);
            }
          };
          if (pl.sizes[k] > 4) { dv.setUint32(at + 8, pl.extraAt[k], true); put(pl.extraAt[k]); }
          else put(at + 8);
        }
        /* the chain: each IFD points at the next, the last at 0 */
        dv.setUint32(pl.at + 2 + n * 12, i + 1 < plans.length ? plans[i + 1].at : 0, true);
      }

      for (const pl of plans) {
        for (let c = 0; c < pl.ifd.chunks.length; c++) {
          const buf = pl.ifd.chunks[c], at = pl.chunkAt[c];
          out.set(buf, at);
          if (lt) {
            dv.setUint32(at - 4, buf.length, true);
            out.set(buf.subarray(buf.length - 4), at + buf.length);
          }
        }
      }
      return out;
    }

    /* The plain-text block GDAL reads back to recognise its own layout. Every line is a claim
       assembleTiff above actually satisfies (§7.1). */
    function cogGhost() {
      const body = 'LAYOUT=IFDS_BEFORE_DATA\nBLOCK_ORDER=ROW_MAJOR\n'
        + 'BLOCK_LEADER=SIZE_AS_UINT4\nBLOCK_TRAILER=LAST_4_BYTES_REPEATED\n'
        + 'KNOWN_INCOMPATIBLE_EDITION=NO\n';
      /* ⚠ THE DECLARED SIZE COUNTS THE BODY ONLY, and GDAL reads exactly that many bytes — so the
         six digits are the body's byte length and not the block's. */
      const head = 'GDAL_STRUCTURAL_METADATA_SIZE=' + String(body.length).padStart(6, '0') + ' bytes\n';
      return new TextEncoder().encode(head + body);
    }

    function writeGeoTiff(rec, opts) {
      const o = opts || {};
      if (rec.crs && String(rec.crs) !== 'EPSG:4326') return bad('export-crs-unsupported', { crs: String(rec.crs) });

      if (typeof rec.read !== 'function') return bad('export-band-unreadable', { reason: 'no-read-door' });
      const all = Array.isArray(rec.bands) ? rec.bands : [];
      let want;
      if (Array.isArray(o.bands)) want = o.bands.map((b) => Math.trunc(Number(b)));
      else if (o.band != null) want = [Math.trunc(Number(o.band))];
      else want = all.map((_, i) => i);
      if (!want.length) return bad('export-empty', { reason: 'no-band-selected', bands: all.length });
      for (const b of want) {
        if (!(Number.isInteger(b) && b >= 0 && b < all.length)) return bad('export-band-out-of-range', { band: b, bands: all.length });
      }

      const typeName = String(o.dataType || 'float32');
      const T = Object.prototype.hasOwnProperty.call(DTYPES, typeName) ? DTYPES[typeName] : null;
      if (!T) return bad('export-datatype-unknown', { dataType: typeName, dataTypes: Object.keys(DTYPES) });

      const w = rec.width, h = rec.height, n = w * h;
      if (!(n > 0)) return bad('export-empty', { width: w, height: h });

      /* ⚠ ONE GDAL_NODATA TAG FOR THE FILE. Two bands stating different missing values cannot both
         be labelled, and labelling one of them would tell the reader that the other band's missing
         pixels are data. */
      let nodata = null, nodataFrom = null;
      for (const b of want) {
        const v = all[b] && all[b].nodata;
        if (v == null || !isFinite(v)) continue;
        if (nodata == null) { nodata = v; nodataFrom = b; continue; }
        if (nodata !== v) return bad('export-nodata-conflict', { bands: [nodataFrom, b], values: [nodata, v] });
      }
      if (nodata != null && !T.float) {
        if (!Number.isInteger(nodata) || nodata < T.min || nodata > T.max) {
          return bad('export-nodata-not-representable', { nodata: nodata, dataType: typeName });
        }
      }

      /* ── the samples ─────────────────────────────────────────────────────────────────────── */
      const planes = [];
      for (const b of want) {
        let arr;
        try { arr = rec.read(b); } catch (e) { return bad('export-band-unreadable', { band: b, message: String((e && e.message) || e) }); }
        if (!arr || typeof arr.length !== 'number') return bad('export-band-unreadable', { band: b, reason: 'not-an-array' });
        if (arr.length !== n) return bad('export-band-unreadable', { band: b, got: arr.length, expected: n });
        planes.push(arr);
      }

      const spp = planes.length;
      const bytesPer = T.bits >> 3;
      const strip = new Uint8Array(n * spp * bytesPer);
      const sdv = new DataView(strip.buffer);
      for (let i = 0; i < n; i++) {
        for (let s = 0; s < spp; s++) {
          let v = Number(planes[s][i]);
          if (!isFinite(v)) {
            /* ⚠ docs/GIS-CORE.md §1.4: 「欠損を 0 で埋めない」. A float carries NaN itself; an
               integer has no such value, so the band must have STATED one or the write stops and
               says which pixel. */
            if (T.float) v = (nodata == null ? NaN : nodata);
            else if (nodata != null) v = nodata;
            else return bad('export-missing-not-representable', { band: want[s], pixel: i, dataType: typeName });
          } else if (!T.float) {
            if (!Number.isInteger(v) || v < T.min || v > T.max) {
              return bad('export-value-out-of-range', { band: want[s], pixel: i, value: v, dataType: typeName });
            }
          }
          putSample(sdv, (i * spp + s) * bytesPer, v, T, true);
        }
      }

      /* ── the tags ────────────────────────────────────────────────────────────────────────── */
      const g = rec.grid || {};
      const prov = provenanceOf(rec);
      const entries = [];
      const E = (tag, type, values) => entries.push({ tag: tag, type: type, values: values });

      /* WHAT EVERY IFD MUST SAY ABOUT ITS OWN PIXELS — the full-resolution image and each overview
         alike. ⚠ ONE BUILDER, because an overview that disagreed with the image about bit depth,
         sample format or interleave would be decoded as a different kind of number. Only the two
         dimensions differ between levels.
         ⚠ LONG, NOT SHORT, for 256/257. TIFF 6.0 allows either, and a 70,000-pixel-wide grid written
         as a SHORT wraps to 4,464 — a file that opens, reads and is a different raster. */
      const imageEntries = (wi, hi) => [
        { tag: 256, type: TFIELD.LONG, values: [wi] },
        { tag: 257, type: TFIELD.LONG, values: [hi] },
        { tag: 258, type: TFIELD.SHORT, values: new Array(spp).fill(T.bits) },
        { tag: 259, type: TFIELD.SHORT, values: [1] },   /* no compression */
        { tag: 262, type: TFIELD.SHORT, values: [1] },   /* BlackIsZero */
        { tag: 277, type: TFIELD.SHORT, values: [spp] },
        { tag: 284, type: TFIELD.SHORT, values: [1] },   /* chunky */
        { tag: 317, type: TFIELD.SHORT, values: [1] },   /* no predictor */
        { tag: 339, type: TFIELD.SHORT, values: new Array(spp).fill(T.fmt) },
      ];

      /* ⚠ THE GEOREFERENCE IS NOT OPTIONAL. A TIFF without these is a picture: js/gis-geotiff.js
         refuses it as `no-georeference`, and rightly — a grid whose place is unstated gets placed by
         whoever opens it. Tiepoint maps raster (0,0) to the UPPER-LEFT CORNER of the north-west
         pixel, which is the corner js/gis-raster.js's west/north already mean. */
      E(33550, TFIELD.DOUBLE, [g.pixelLng, g.pixelLat, 0]);
      E(33922, TFIELD.DOUBLE, [0, 0, 0, g.west, g.north, 0]);
      /* GeoKeyDirectory: version 1, revision 1.1, 3 keys.
         1024 GTModelType = 2 (geographic 2-D), 1025 GTRasterType = 1 (PixelIsArea — the corner
         convention above), 2048 GeographicType = 4326. */
      E(34735, TFIELD.SHORT, [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]);

      if (nodata != null) E(42113, TFIELD.ASCII, asciiValues(String(nodata)));

      /* GDAL_METADATA (42112): the per-band DESCRIPTION/UNITTYPE items js/gis-geotiff.js reads back
         (`sample=`), and the provenance items it ignores — which is why they are safe to add here:
         an item with no `sample` attribute is skipped by that reader and read by GDAL and QGIS.
         ⚠⚠⚠ THE `role` SPELLINGS ARE GDAL'S, NOT A DESCRIPTION OF THEM (#R774). GDAL's GTiff driver
         pairs each metadata item name with a role — DESCRIPTION↔"description", UNITTYPE↔"unittype",
         SCALE↔"scale", OFFSET↔"offset" — and it is the ROLE, not the name, that it reads back into
         the band. This file wrote role="unit" for the unit, so GDAL 3.12.1 opened an IntMap GeoTIFF
         with the unit reported as None: the value was in the file and no GIS could see it.
         ⚠ IT COULD NOT BE CAUGHT BY READING THE FILE BACK, because js/gis-geotiff.js keys on `name`
         and ignores `role` — writer and reader agreed about a file no one else could open
         ([[intmap-co-designed-reader-cannot-falsify]]). The reader stays as it is; what measures this
         is tests/geo-gis-export-checks.test.mjs (#R774), which parses the emitted bytes with a parser of its
         own. ⚠ Failing condition for this constant: GDAL renaming the role, which would also break
         every file GDAL itself has written since the item was introduced. */
      const items = [];
      want.forEach((b, s) => {
        const bd = all[b] || {};
        if (bd.name != null && String(bd.name) !== '') items.push('<Item name="DESCRIPTION" sample="' + s + '" role="description">' + xmlEsc(bd.name) + '</Item>');
        if (bd.unit != null && String(bd.unit) !== '') items.push('<Item name="UNITTYPE" sample="' + s + '" role="unittype">' + xmlEsc(bd.unit) + '</Item>');
      });
      /* §1 — only what is stated. */
      if (rec.id != null) items.push('<Item name="INTMAP_DATASET_ID">' + xmlEsc(rec.id) + '</Item>');
      if (prov.license != null) items.push('<Item name="INTMAP_LICENCE">' + xmlEsc(prov.license) + '</Item>');
      if (prov.attribution != null) items.push('<Item name="INTMAP_ATTRIBUTION">' + xmlEsc(prov.attribution) + '</Item>');
      if (prov.source != null) items.push('<Item name="INTMAP_SOURCE">' + xmlEsc(prov.source) + '</Item>');
      if (prov.retrievedAt != null) items.push('<Item name="INTMAP_RETRIEVED_AT">' + xmlEsc(prov.retrievedAt) + '</Item>');
      if (prov.raw != null) {
        let j = null;
        try { j = JSON.stringify(prov.raw); } catch (_) { j = null; }
        if (j != null) items.push('<Item name="INTMAP_PROVENANCE">' + xmlEsc(j) + '</Item>');
      }
      if (items.length) E(42112, TFIELD.ASCII, asciiValues('<GDALMetadata>' + items.join('') + '</GDALMetadata>'));

      if (rec.title != null && String(rec.title) !== '') E(270, TFIELD.ASCII, asciiValues(rec.title));
      E(305, TFIELD.ASCII, asciiValues('IntMap'));
      /* TIFF 6.0 DateTime: "YYYY:MM:DD HH:MM:SS", 20 bytes with the NUL, in local time by the
         specification's wording. UTC is written because the file may be read anywhere, and the ISO
         instant also travels in GDAL_METADATA where it can carry a zone. */
      const now = new Date();
      const p2 = (x) => String(x).padStart(2, '0');
      E(306, TFIELD.ASCII, asciiValues(now.getUTCFullYear() + ':' + p2(now.getUTCMonth() + 1) + ':' + p2(now.getUTCDate()) + ' ' + p2(now.getUTCHours()) + ':' + p2(now.getUTCMinutes()) + ':' + p2(now.getUTCSeconds())));
      /* ⚠ NO Copyright TAG WHEN NOTHING WAS STATED (§1). An empty 33432 is a licence claim of 「none」. */
      if (prov.license != null) E(33432, TFIELD.ASCII, asciiValues(prov.license));

      /* ── the layout ──────────────────────────────────────────────────────────────────────── */
      let out, levels = null;
      if (o.layout === 'cog') {
        /* Condition 2: halve until the whole level fits in one tile. ⚠ THE LOOP IS BOUNDED BY THE
           GEOMETRY, not by a level count somebody picked: each step at least halves the larger side,
           so a 2^31-pixel grid terminates in 31 steps and a grid already inside one tile makes no
           overviews at all (and needs none — the COG specification asks for them only above the
           tile size). */
        levels = [{ bytes: strip, width: w, height: h }];
        while (Math.max(levels[levels.length - 1].width, levels[levels.length - 1].height) > COG_TILE) {
          const prev = levels[levels.length - 1];
          levels.push(halveChunky(prev.bytes, prev.width, prev.height, spp, T, nodata));
        }

        const ifds = levels.map((lv, i) => {
          const cut = tilesOf(lv.bytes, lv.width, lv.height, spp, T, nodata, COG_TILE);
          const es = imageEntries(lv.width, lv.height);
          es.push({ tag: 322, type: TFIELD.LONG, values: [COG_TILE] });
          es.push({ tag: 323, type: TFIELD.LONG, values: [COG_TILE] });
          /* placeholders — assembleTiff overwrites both once the file's shape is known */
          es.push({ tag: 324, type: TFIELD.LONG, values: cut.tiles.map(() => 0) });
          es.push({ tag: 325, type: TFIELD.LONG, values: cut.tiles.map(() => 0) });
          /* ⚠ NODATA ON EVERY LEVEL — BUT ONCE PER LEVEL. A reader that opens an overview directly,
             which is the whole reason the overview is there, must be told which of its samples are
             gaps; inheritance from IFD 0 is a convention, not a guarantee. IFD 0 already carries the
             tag among the dataset entries below, so only the overviews add their own.
             ⚠⚠⚠ THE FIRST VERSION ADDED IT HERE UNCONDITIONALLY AND GAVE IFD 0 TWO COPIES OF TAG
             42113. TIFF 6.0 §2 requires the entries to be unique and sorted so that a reader may
             binary-search them; a duplicate makes which value wins a property of the reader. GDAL
             and rio-cogeo's cog_validate BOTH ACCEPTED IT — they take the first match — so the
             third-party verdict was green on a malformed file, and what caught it was the
             independent IFD walker in tests/r783-format-compat-checks (② and its tag-order check).
             A third party is a necessary witness and not a sufficient one. */
          if (nodata != null && i > 0) es.push({ tag: 42113, type: TFIELD.ASCII, values: asciiValues(String(nodata)) });
          if (i === 0) {
            /* the georeference, the band names and the provenance belong to the DATASET, and GDAL
               writes them on IFD 0 alone (js/gis-geotiff.js:945 reads them from there and derives an
               overview's pixel size from its own dimensions rather than from a restated tag). */
            for (const e of entries) es.push(e);
          } else {
            /* 254 NewSubfileType bit 0: 「this is a reduced-resolution version of another image in
               this file」. Without it a reader sees a multi-page TIFF and may draw page 2 as data. */
            es.push({ tag: 254, type: TFIELD.LONG, values: [1] });
          }
          return { entries: es, offsetTag: 324, countTag: 325, chunks: cut.tiles };
        });

        /* Condition 4: smallest overview first, full resolution last. */
        const dataOrder = ifds.map((_, i) => i).reverse();
        out = assembleTiff({ ifds: ifds, dataOrder: dataOrder, ghost: cogGhost(), leaderTrailer: true });
      } else {
        const es = imageEntries(w, h);
        es.push({ tag: 273, type: TFIELD.LONG, values: [0] });   /* StripOffsets — patched */
        es.push({ tag: 278, type: TFIELD.LONG, values: [h] });   /* one strip: the whole image */
        es.push({ tag: 279, type: TFIELD.LONG, values: [0] });   /* StripByteCounts — patched */
        for (const e of entries) es.push(e);
        out = assembleTiff({
          ifds: [{ entries: es, offsetTag: 273, countTag: 279, chunks: [strip] }],
        });
      }

      return {
        bytes: out,
        stated: {
          width: w, height: h, bands: want.length, bandIndexes: want.slice(),
          dataType: typeName, compression: 'none',
          layout: levels ? 'cog' : 'strip',
          rowsPerStrip: levels ? null : h,
          tileWidth: levels ? COG_TILE : null,
          tileHeight: levels ? COG_TILE : null,
          /* the overview levels as DIMENSIONS, not as a count — a caller deciding whether a preview
             is cheap needs to know how big the smallest one is */
          overviews: levels ? levels.slice(1).map((lv) => ({ width: lv.width, height: lv.height })) : [],
          byteOrder: 'II',
          /* ⚠ THE PLACE, AS VALUES — a file that reads but does not know where it is has not been
             exported (the `no-georeference` refusal on the reading side, from the other end). */
          crs: 'EPSG:4326',
          georeference: { west: g.west, north: g.north, pixelLng: g.pixelLng, pixelLat: g.pixelLat },
          nodata: nodata,
          bandNames: want.map((b) => ((all[b] && all[b].name) == null ? null : String(all[b].name))),
          bandUnits: want.map((b) => ((all[b] && all[b].unit) == null ? null : String(all[b].unit))),
          license: prov.license == null ? null : prov.license,
          attribution: prov.attribution == null ? null : prov.attribution,
          source: prov.source == null ? null : prov.source,
          retrievedAt: prov.retrievedAt == null ? null : prov.retrievedAt,
          provenanceCarried: prov.raw != null,
        },
      };
    }

    /* ══ 7.3 · GEOPACKAGE (#R783) ═════════════════════════════════════════════════════════════
       The format's own module writes the bytes; this is the adaptor that turns a registry record
       into what it asks for, and turns its answer back into this module's shape.

       ⚠ THE MODULE IS LOOKED UP AT CALL TIME, on `window`, which is the rule every other module
       here follows (§8's resolve() looks up the registry the same way). Captured at load it would
       be captured before js/gis-geopackage.js had run. ⚠ AND ITS ABSENCE IS A REFUSAL, NOT A
       GUESS: there is no second GeoPackage writer to fall back to, and emitting a GeoJSON under a
       .gpkg name would be the silent substitution the whole `stated` contract exists to stop. */
    function writeGeopackage(rec, feats, o) {
      let gp = null;
      try { gp = window.IntMapGisGeopackage || null; } catch (_) { gp = null; }
      if (!gp || typeof gp.write !== 'function') {
        return bad('export-format-unknown', { format: 'geopackage', reason: 'js/gis-geopackage.js is not loaded', formats: FORMATS.map((f) => f.id) });
      }
      if (rec.crs && String(rec.crs) !== 'EPSG:4326') return bad('export-crs-unsupported', { crs: String(rec.crs) });

      const prov = provenanceOf(rec);
      /* §1 — ONLY WHAT IS STATED. gpkg_contents.description is where a GIS shows a layer's note, so
         the licence and the attribution go there as a VALUE; a record that states neither gets the
         empty string the standard's own DEFAULT uses, not the word 「unknown」. */
      const notes = provenanceNotes(prov);

      /* A GeoPackage table name is a SQL identifier, and a record's id may be anything. The
         transliteration is the module's own (`gpkg-write-table-name` refuses what it cannot take);
         what is chosen here is only WHICH of the record's names to offer. */
      const raw = String((rec.id == null ? '' : rec.id) || (rec.title == null ? '' : rec.title) || 'features');
      let table = raw.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      if (!/^[A-Za-z_]/.test(table)) table = 't_' + table;
      if (table === '') table = 'features';

      const res = gp.write({
        table: table,
        features: feats,
        title: rec.title == null ? null : String(rec.title),
        description: notes.join(' · '),
        srsId: 4326,
      });
      /* ⚠ ITS REFUSAL CODE TRAVELS UNCHANGED. Rewriting it as an `export-…` code would lose which
         feature and which column the detail names, and js/gis-panel.js already has a row for every
         code js/gis-geopackage.js declares (docs/GIS-CORE.md §2.2). */
      if (!res || res.ok === false) return res;

      return {
        bytes: res.bytes,
        stated: Object.assign({}, res.stated, {
          features: feats.length,
          license: prov.license == null ? null : prov.license,
          attribution: prov.attribution == null ? null : prov.attribution,
          source: prov.source == null ? null : prov.source,
          retrievedAt: prov.retrievedAt == null ? null : prov.retrievedAt,
          /* ⚠ FALSE, AND SAID SO. A GeoPackage has no foreign-member slot like GeoJSON's, so the
             verbatim provenance object does NOT travel — the four interoperable values above do,
             inside gpkg_contents.description. A caller that needs the whole object writes a
             GeoJSON beside it, and this field is how it knows to. */
          provenanceCarried: false,
          provenanceAs: 'gpkg_contents.description',
        }),
      };
    }

    /* ══ 7.4 · KML AND GPX (vector — the two files every phone and every handheld GPS reads) ═════
       Both are XML that states WGS 84 and nothing else, so a record in another CRS is refused by
       the door GeoPackage uses (`export-crs-unsupported`) rather than reprojected here.
       js/geo-import.js reads both back (its DECODERS `kml` and `gpx`), and that loop is what
       tests/gis-foundation-refine-export-checks.test.mjs measures.

       ⚠ EVERYTHING A READER SEES IS STATED, NOTHING IS GUESSED.
         · THE PLACEMARK NAME is the first of the properties `name`, `title`, `label` (compared
           without regard to case) that holds a non-blank string or number; `stated.nameFrom` counts
           which one each feature used. A dataset with none of them gets no <name> — not its row
           number, not its id.
         · TIME is written ONLY where the dataset DECLARES it (`rec.time`, the verified declaration
           js/gis-datasets.js holds — the one the GeoJSON writer hands on): `instant` → one
           <TimeStamp> / <time>, `interval` → <TimeSpan> (KML only), `track` → a per-position axis.
           A property that merely looks like a date is an attribute and nothing else. A declared value
           that is not an XML Schema date / dateTime is NOT reformatted: it stays an attribute and
           `stated.time.notCarried` counts it.
         · A SHAPE THE FORMAT CANNOT HOLD IS REFUSED BY NAME, WITH THE COUNT (GPX has no area:
           `export-geometry-not-representable`). Leaving the polygons out and saying 「書き出しました」
           would be the silent drop this module exists to stop.
         · CHARACTERS XML 1.0 CANNOT CONTAIN (control codes, lone surrogates) are removed and COUNTED
           (`stated.charactersRemoved`), because the alternative is a file no parser will open. */
    const XML_ILLEGAL = /[^\u0009\u000A\u000D -퟿-�\u{10000}-\u{10FFFF}]/gu;
    /* xsd:dateTime (the type GPX 1.1's <time> has and KML's <when> accepts) and the shorter date
       forms KML's <when> also accepts — the schema's own lexical spaces, not a guess at what a
       source might write. */
    const XSD_DATETIME = /^-?\d{4,}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
    const XSD_DATE = /^-?\d{4,}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
    const kmlWhen = (v) => typeof v === 'string' && (XSD_DATETIME.test(v) || XSD_DATE.test(v));
    const gpxTime = (v) => typeof v === 'string' && XSD_DATETIME.test(v);
    const NAME_FIELDS = Object.freeze(['name', 'title', 'label']);
    /* the namespace GPX 1.1 requires foreign data to live in; a URN is an identifier, not a URL
       anybody is asked to fetch */
    const GPX_NS_ATTR = 'urn:intmap:gpx-attributes:1';

    function xe(s, st, attr) {
      let t = String(s);
      const illegal = t.match(XML_ILLEGAL);
      if (illegal) { st.charactersRemoved += illegal.length; t = t.replace(XML_ILLEGAL, ''); }
      t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');
      if (attr) t = t.replace(/"/g, '&quot;').replace(/'/g, '&apos;').replace(/\t/g, '&#9;').replace(/\n/g, '&#10;');
      return t;
    }
    /* One cell as text, or null when it has none. A non-finite number has no XML notation, so it is
       left out and counted — never written as 0 (docs/GIS-CORE.md §1.4). */
    function cellText(v, st) {
      if (v == null) return null;
      if (typeof v === 'string') return v;
      if (typeof v === 'number') { if (!isFinite(v)) { st.cellsNotWritten++; return null; } return String(v); }
      if (typeof v === 'boolean') return String(v);
      try { return JSON.stringify(v); } catch (_) { st.cellsNotWritten++; return null; }
    }
    function posText(p, index, sep) {
      if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number' || !isFinite(p[0]) || !isFinite(p[1])) {
        throw { refusal: bad('export-serialise-failed', { message: 'non-finite-coordinate', column: 'feature ' + index }) };
      }
      return p[0] + sep + p[1] + ((p.length > 2 && typeof p[2] === 'number' && isFinite(p[2])) ? sep + p[2] : '');
    }
    function timeDeclOf(rec) {
      const t = rec && rec.time;
      if (!t || typeof t !== 'object') return null;
      if (t.kind === 'instant' && t.field) return { kind: 'instant', fields: [String(t.field)] };
      if (t.kind === 'interval' && (t.startField || t.endField)) {
        return { kind: 'interval', startField: t.startField ? String(t.startField) : null, endField: t.endField ? String(t.endField) : null, fields: [t.startField, t.endField].filter(Boolean).map(String) };
      }
      if (t.kind === 'track' && t.timesField) return { kind: 'track', timesField: String(t.timesField), elevationField: t.elevationField ? String(t.elevationField) : null, fields: [String(t.timesField)] };
      return null;
    }
    const filled = (v) => v != null && v !== '';
    function propsOf(f) { return (f && f.properties && typeof f.properties === 'object' && !Array.isArray(f.properties)) ? f.properties : {}; }
    function nameOf(props, st) {
      const keys = Object.keys(props);
      for (const want of NAME_FIELDS) {
        const k = keys.find((x) => x.toLowerCase() === want);
        if (k === undefined) continue;
        const v = props[k];
        const s = typeof v === 'string' ? v.trim() : (typeof v === 'number' && isFinite(v) ? String(v) : '');
        if (s) { st.nameFrom[want] = (st.nameFrom[want] || 0) + 1; return { text: s, key: k }; }
      }
      return null;
    }
    function provenanceNotes(prov) {
      const notes = [];
      if (prov.license != null) notes.push('Licence: ' + prov.license);
      if (prov.attribution != null) notes.push('Attribution: ' + prov.attribution);
      if (prov.source != null) notes.push('Source: ' + prov.source);
      if (prov.retrievedAt != null) notes.push('Retrieved: ' + prov.retrievedAt);
      return notes;
    }
    /* A per-position axis is an axis only while its length equals the number of positions
       (js/gis-datasets.js measures the same equality). Returns the array, or null. */
    const alignedAxis = (v, n) => (Array.isArray(v) && v.length === n) ? v : null;

    function newStats() { return { charactersRemoved: 0, cellsNotWritten: 0, nameFrom: {}, timeCarried: 0, timeNotCarried: 0 }; }
    function statedXml(st, prov, extra) {
      return Object.assign({
        license: prov.license == null ? null : prov.license,
        attribution: prov.attribution == null ? null : prov.attribution,
        source: prov.source == null ? null : prov.source,
        retrievedAt: prov.retrievedAt == null ? null : prov.retrievedAt,
        /* FALSE, AND SAID SO: neither format has a foreign-member slot, so the verbatim provenance
           object does not travel — the four interoperable values do, as the document's description. */
        provenanceCarried: false,
        charactersRemoved: st.charactersRemoved,
        cellsNotWritten: st.cellsNotWritten,
        nameFrom: st.nameFrom,
        time: { carried: st.timeCarried, notCarried: st.timeNotCarried },
      }, extra);
    }

    /* ── KML ─────────────────────────────────────────────────────────────────────────────────── */
    function kmlGeometry(g, index) {
      if (!g || typeof g !== 'object') return null;
      const line = (c) => (Array.isArray(c) ? c : []).map((p) => posText(p, index, ',')).join(' ');
      const ring = (c) => '<LinearRing><coordinates>' + line(c) + '</coordinates></LinearRing>';
      const poly = (rings) => {
        if (!Array.isArray(rings) || !rings.length) return null;
        let s = '<Polygon><outerBoundaryIs>' + ring(rings[0]) + '</outerBoundaryIs>';
        for (let i = 1; i < rings.length; i++) s += '<innerBoundaryIs>' + ring(rings[i]) + '</innerBoundaryIs>';
        return s + '</Polygon>';
      };
      const point = (p) => '<Point><coordinates>' + posText(p, index, ',') + '</coordinates></Point>';
      const lineString = (l) => '<LineString><coordinates>' + line(l) + '</coordinates></LineString>';
      const t = g.type, c = g.coordinates;
      if (t === 'Point') return Array.isArray(c) && c.length ? point(c) : null;
      if (t === 'LineString') return Array.isArray(c) && c.length ? lineString(c) : null;
      if (t === 'Polygon') return poly(c);
      if (t === 'MultiPoint' || t === 'MultiLineString' || t === 'MultiPolygon') {
        const one = t === 'MultiPoint' ? point : (t === 'MultiLineString' ? lineString : poly);
        const parts = (Array.isArray(c) ? c : []).map(one).filter(Boolean);
        return parts.length ? '<MultiGeometry>' + parts.join('') + '</MultiGeometry>' : null;
      }
      if (t === 'GeometryCollection') {
        const parts = (Array.isArray(g.geometries) ? g.geometries : []).map((x) => kmlGeometry(x, index)).filter(Boolean);
        return parts.length ? '<MultiGeometry>' + parts.join('') + '</MultiGeometry>' : null;
      }
      throw { refusal: bad('export-geometry-not-representable', { format: 'kml', geometryType: String(t), feature: index }) };
    }

    function writeKml(rec, feats) {
      const prov = provenanceOf(rec);
      const td = timeDeclOf(rec);
      const st = newStats();
      let without = 0, tracks = 0;
      let body = '';
      try {
        for (let i = 0; i < feats.length; i++) {
          const f = feats[i] || {};
          const props = propsOf(f);
          const g = f.geometry || null;
          const used = new Set();
          let pm = '<Placemark>';
          const nm = nameOf(props, st);
          if (nm) pm += '<name>' + xe(nm.text, st) + '</name>';

          let gx = null;   /* a gx:Track in place of the LineString, when the dataset declares a per-position axis */
          if (td && td.kind === 'instant') {
            const v = props[td.fields[0]];
            if (kmlWhen(v)) { pm += '<TimeStamp><when>' + xe(v, st) + '</when></TimeStamp>'; st.timeCarried++; }
            else if (filled(v)) st.timeNotCarried++;
          } else if (td && td.kind === 'interval') {
            const b = td.startField ? props[td.startField] : null, e = td.endField ? props[td.endField] : null;
            const hasB = kmlWhen(b), hasE = kmlWhen(e);
            if (hasB || hasE) { pm += '<TimeSpan>' + (hasB ? '<begin>' + xe(b, st) + '</begin>' : '') + (hasE ? '<end>' + xe(e, st) + '</end>' : '') + '</TimeSpan>'; st.timeCarried++; }
            else if (filled(b) || filled(e)) st.timeNotCarried++;
          } else if (td && td.kind === 'track') {
            const raw = props[td.timesField];
            const times = (g && g.type === 'LineString' && Array.isArray(g.coordinates)) ? alignedAxis(raw, g.coordinates.length) : null;
            if (times && times.length && times.every(kmlWhen)) {
              const eles = td.elevationField ? alignedAxis(props[td.elevationField], g.coordinates.length) : null;
              gx = '<gx:Track>' + times.map((x) => '<when>' + xe(x, st) + '</when>').join('')
                + g.coordinates.map((p, k) => {
                  const e = eles && typeof eles[k] === 'number' && isFinite(eles[k]) ? eles[k] : (Array.isArray(p) && typeof p[2] === 'number' && isFinite(p[2]) ? p[2] : null);
                  return '<gx:coord>' + posText([p[0], p[1]], i, ' ') + (e == null ? '' : ' ' + e) + '</gx:coord>';
                }).join('') + '</gx:Track>';
              used.add(td.timesField); if (eles) used.add(td.elevationField);
              st.timeCarried++; tracks++;
            } else if (filled(raw)) st.timeNotCarried++;
          }

          let ext = '';
          for (const k of Object.keys(props)) {
            if (used.has(k)) continue;
            const t = cellText(props[k], st);
            if (t == null) continue;
            ext += '<Data name="' + xe(k, st, true) + '"><value>' + xe(t, st) + '</value></Data>';
          }
          if (ext) pm += '<ExtendedData>' + ext + '</ExtendedData>';

          const geom = gx || kmlGeometry(g, i);
          if (!geom) without++; else pm += geom;
          body += pm + '</Placemark>\n';
        }
      } catch (e) { if (e && e.refusal) return e.refusal; throw e; }

      const title = rec.title != null ? String(rec.title) : (rec.id != null ? String(rec.id) : '');
      const notes = provenanceNotes(prov).join(' · ');
      const text = '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">\n<Document>\n'
        + (title ? '<name>' + xe(title, st) + '</name>\n' : '')
        + (notes ? '<description>' + xe(notes, st) + '</description>\n' : '')
        + body + '</Document>\n</kml>\n';
      return {
        text: text,
        stated: statedXml(st, prov, {
          features: feats.length, rowsWithoutGeometry: without,
          geometry: without === feats.length ? 'none' : 'verbatim', geometryRoundTrip: true,
          attributesAs: 'ExtendedData', provenanceAs: notes ? 'Document/description' : null, tracks: tracks,
        }),
      };
    }

    /* ── GPX ─────────────────────────────────────────────────────────────────────────────────── */
    const GPX_POINT_TYPES = Object.freeze(['Point', 'MultiPoint']);
    const GPX_LINE_TYPES = Object.freeze(['LineString', 'MultiLineString']);

    function writeGpx(rec, feats) {
      const prov = provenanceOf(rec);
      const td = timeDeclOf(rec);
      const st = newStats();

      /* ⚠ REFUSE BEFORE WRITING ANYTHING: GPX has waypoints and tracks and no area. */
      const refused = {};
      let refusedCount = 0, without = 0;
      for (const f of feats) {
        const g = f && f.geometry;
        if (!g) { without++; continue; }
        if (GPX_POINT_TYPES.indexOf(g.type) < 0 && GPX_LINE_TYPES.indexOf(g.type) < 0) { refused[String(g.type)] = (refused[String(g.type)] || 0) + 1; refusedCount++; }
      }
      if (refusedCount) {
        return bad('export-geometry-not-representable', { format: 'gpx', count: refusedCount, writable: feats.length - without - refusedCount, geometryTypes: refused, accepts: GPX_POINT_TYPES.concat(GPX_LINE_TYPES) });
      }
      if (without === feats.length) return bad('export-empty', { reason: 'no-geometry', count: feats.length });

      const finiteNum = (v) => (typeof v === 'number' && isFinite(v)) ? v : null;
      const slot = (props, k, used) => {
        const v = props[k];
        if (typeof v !== 'string' || v === '') return null;
        used.add(k); return xe(v, st);
      };
      /* what is left of the attributes goes into <extensions>, in a namespace of its own — the only
         place GPX 1.1 allows foreign data */
      const extensions = (props, used) => {
        let s = '';
        for (const k of Object.keys(props)) {
          if (used.has(k)) continue;
          const t = cellText(props[k], st);
          if (t == null) continue;
          s += '<intmap:attr name="' + xe(k, st, true) + '">' + xe(t, st) + '</intmap:attr>';
        }
        return s ? '<extensions>' + s + '</extensions>' : '';
      };
      const el = (n, v) => (v == null || v === '') ? '' : '<' + n + '>' + v + '</' + n + '>';

      let wpts = '', trks = '', written = 0;
      try {
        for (let i = 0; i < feats.length; i++) {
          const f = feats[i] || {};
          const g = f.geometry;
          if (!g) continue;
          const props = propsOf(f);
          const used = new Set();
          const nm = nameOf(props, st);
          const name = nm ? (used.add(nm.key), xe(nm.text, st)) : null;
          const cmt = slot(props, 'cmt', used), desc = slot(props, 'desc', used), type = slot(props, 'type', used);

          if (g.type === 'Point' || g.type === 'MultiPoint') {
            const sym = slot(props, 'sym', used);
            const pts = g.type === 'Point' ? [g.coordinates] : g.coordinates;
            let time = null;
            if (td && td.kind === 'instant') {
              const v = props[td.fields[0]];
              if (gpxTime(v)) { time = xe(v, st); used.add(td.fields[0]); st.timeCarried++; }
              else if (filled(v)) st.timeNotCarried++;
            } else if (td && td.kind !== 'track' && td.fields.some((k) => filled(props[k]))) st.timeNotCarried++;   /* a span has no <time> in GPX */
            let e = finiteNum(props.ele);
            if (e == null && typeof props.ele === 'string' && props.ele.trim() !== '' && isFinite(Number(props.ele))) e = Number(props.ele);
            if (e != null) used.add('ele');
            const ext = extensions(props, used);
            for (const p of (Array.isArray(pts) ? pts : [])) {
              posText(p, i, ',');   /* the refusal for a non-finite position */
              const pe = e != null ? e : finiteNum(p[2]);
              wpts += '<wpt lat="' + p[1] + '" lon="' + p[0] + '">' + el('ele', pe) + el('time', time) + el('name', name) + el('cmt', cmt)
                + el('desc', desc) + el('sym', sym) + el('type', type) + ext + '</wpt>\n';
              written++;
            }
          } else {
            const segs = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
            let times = null, eles = null;
            if (td && td.kind === 'track') {
              const raw = props[td.timesField];
              const t = g.type === 'LineString' ? alignedAxis(raw, g.coordinates.length) : null;
              if (t && t.every((x) => x == null || gpxTime(x))) {
                times = t; used.add(td.timesField);
                const e = td.elevationField ? alignedAxis(props[td.elevationField], g.coordinates.length) : null;
                if (e) { eles = e; used.add(td.elevationField); }
                st.timeCarried++;
              } else if (filled(raw)) st.timeNotCarried++;
            } else if (td && td.fields.some((k) => filled(props[k]))) st.timeNotCarried++;   /* a line has no single moment in GPX */
            const ext = extensions(props, used);
            let seg = '';
            for (const s of (Array.isArray(segs) ? segs : [])) {
              seg += '<trkseg>' + (Array.isArray(s) ? s : []).map((p, k) => {
                posText(p, i, ',');
                const pe = eles && finiteNum(eles[k]) != null ? eles[k] : finiteNum(p[2]);
                const pt = times && times[k] != null ? xe(times[k], st) : null;
                return '<trkpt lat="' + p[1] + '" lon="' + p[0] + '">' + el('ele', pe) + el('time', pt) + '</trkpt>';
              }).join('') + '</trkseg>';
            }
            trks += '<trk>' + el('name', name) + el('cmt', cmt) + el('desc', desc) + el('type', type) + ext + seg + '</trk>\n';
            written++;
          }
        }
      } catch (e) { if (e && e.refusal) return e.refusal; throw e; }

      const title = rec.title != null ? String(rec.title) : (rec.id != null ? String(rec.id) : '');
      const notes = provenanceNotes(prov).join(' · ');
      const meta = (title || notes) ? '<metadata>' + el('name', title ? xe(title, st) : null) + el('desc', notes ? xe(notes, st) : null) + '</metadata>\n' : '';
      const text = '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<gpx version="1.1" creator="IntMap" xmlns="http://www.topografix.com/GPX/1/1" xmlns:intmap="' + GPX_NS_ATTR + '">\n'
        + meta + wpts + trks + '</gpx>\n';
      return {
        text: text,
        stated: statedXml(st, prov, {
          features: feats.length - without, rowsWithoutGeometry: without, elementsWritten: written,
          geometry: 'verbatim',
          /* a Multi* comes back as one feature per part, and waypoints precede tracks (the schema's order) */
          geometryRoundTrip: true, order: 'waypoints-then-tracks',
          attributesAs: 'name/cmt/desc/type/sym/ele as the standard elements; the rest in <extensions>',
          provenanceAs: notes ? 'metadata/desc' : null,
        }),
      };
    }

    function writeXmlFormat(id, rec, feats) {
      if (rec.crs && String(rec.crs) !== 'EPSG:4326') return bad('export-crs-unsupported', { crs: String(rec.crs) });
      return id === 'kml' ? writeKml(rec, feats) : writeGpx(rec, feats);
    }

    /* ══ 8 · THE ONE DOOR ═════════════════════════════════════════════════════════════════════ */

    function resolve(target) {
      if (target && typeof target === 'object') return { ok: true, rec: target };
      const id = String(target == null ? '' : target);
      let reg = null;
      try { reg = window.IntMapData || null; } catch (_) { reg = null; }
      if (!reg || typeof reg.get !== 'function') return { ok: false, res: bad('export-registry-missing', { id: id }) };
      const rec = reg.get(id);
      if (!rec) return { ok: false, res: bad('export-dataset-missing', { id: id }) };
      return { ok: true, rec: rec };
    }

    function write(target, opts) {
      const o = opts || {};
      const got = resolve(target);
      if (!got.ok) return got.res;
      const rec = got.rec;

      if (o.format == null || String(o.format) === '') {
        return bad('export-format-not-named', { formats: FORMATS.map((f) => f.id) });
      }
      const fmt = formatById(o.format);
      if (!fmt) return bad('export-format-unknown', { format: String(o.format), formats: FORMATS.map((f) => f.id) });
      const kind = rec.kind === 'raster' ? 'raster' : 'vector';
      if (fmt.kinds.indexOf(kind) < 0) return bad('export-format-not-for-kind', { format: fmt.id, kind: kind, kinds: fmt.kinds.slice() });

      let made;
      if (fmt.id === 'geotiff' || fmt.id === 'cog') {
        /* ⚠ THE FORMAT ID CHOOSES THE LAYOUT, NOT THE CALLER'S opts. `cog` and `geotiff` are the
           same writer and the same tags; what differs is where the bytes go (§7.1). Letting
           `{format:'geotiff', layout:'cog'}` through as well would give one file two names, and the
           answer's `format` is what a caller reports to a reader. */
        made = writeGeoTiff(rec, Object.assign({}, o, { layout: fmt.id === 'cog' ? 'cog' : 'strip' }));
      } else {
        let feats = [];
        try { feats = (typeof rec.features === 'function' ? rec.features() : rec.features) || []; }
        catch (e) { return bad('export-band-unreadable', { message: String((e && e.message) || e) }); }
        if (!Array.isArray(feats) || feats.length === 0) return bad('export-empty', { id: rec.id == null ? null : String(rec.id), count: 0 });
        if (fmt.id === 'geopackage') made = writeGeopackage(rec, feats, o);
        else if (fmt.id === 'kml' || fmt.id === 'gpx') made = writeXmlFormat(fmt.id, rec, feats);
        else made = fmt.id === 'geojson' ? writeGeoJson(rec, feats, o) : writeCsv(rec, feats, o);
      }
      if (made && made.ok === false) return made;

      const bytes = made.bytes || new TextEncoder().encode(made.text);
      return {
        ok: true,
        format: fmt.id,
        mediaType: fmt.mediaType,
        filename: filenameFor(rec, fmt),
        bytes: bytes,
        text: made.text == null ? null : made.text,
        stated: made.stated,
      };
    }

    /* ══ (gis-scale) A RESULT HELD AS CHUNKS, WRITTEN WITHOUT EVER BEING ONE STRING ═════════════════
       JSON.stringify of a million buffered features is over a gigabyte of text, and one JS string cannot be
       that long (V8's limit is about 512 MB). So the document is assembled as a Blob, one chunk at a time:
       the frame (everything but the features) comes from the SAME writeGeoJson the whole-array path uses, with
       an empty feature list, and the features are written between its brackets. A Blob may be built from
       Blobs, which is what lets each chunk's text be dropped as soon as it is part of the file.
       ⚠ THE YIELD IS BY ELAPSED TIME, the way every runner in js/gis-ops.js does it: a loop that serialises a
       million features without handing the thread back is a frozen page, and a stop button cannot reach it. */
    async function writeChunkedGeoJson(rec, opts, signal) {
      const frame = writeGeoJson(rec, [], opts);
      if (frame && frame.ok === false) return frame;
      const mark = /"features": ?\[\]/.exec(frame.text), at = mark ? mark.index : -1;
      if (at < 0) return bad('export-serialise-failed', { message: 'frame-without-features' });
      const pretty = !(opts && opts.pretty === false);
      let blob = new Blob([frame.text.slice(0, at) + (pretty ? '"features": [' : '"features":[')]);
      let first = true, last = Date.now();
      const it = typeof rec.chunksAsync === 'function' ? rec.chunksAsync() : rec.chunks();
      for (let n = await it.next(); !n.done; n = await it.next()) {
        const parts = [];
        for (const f0 of n.value) {
          const f = f0 || {};
          const one = { type: 'Feature', geometry: f.geometry || null, properties: (f.properties == null ? {} : f.properties) };
          if (f.id !== undefined) one.id = f.id;
          if (f.bbox !== undefined) one.bbox = f.bbox;
          let s;
          try { s = pretty ? JSON.stringify(one, null, 1).replace(/\n/g, '\n  ') : JSON.stringify(one); }
          catch (e) { return bad('export-serialise-failed', { message: String((e && e.message) || e) }); }
          parts.push((first ? (pretty ? '\n  ' : '') : (pretty ? ',\n  ' : ',')) + s);
          first = false;
        }
        blob = new Blob([blob, parts.join('')]);
        if (signal && signal.aborted) return bad('export-serialise-failed', { message: 'cancelled' });
        if (Date.now() - last >= 16) { last = Date.now(); await new Promise((r) => setTimeout(r, 0)); }
      }
      blob = new Blob([blob, (pretty && !first ? '\n ' : '') + ']' + frame.text.slice(at + mark[0].length)]);
      const stated = Object.assign({}, frame.stated, {
        features: rec.count, rowsWithoutGeometry: rec.count - (rec.withGeometry || 0),
        geometry: (rec.withGeometry || 0) === 0 ? 'none' : 'verbatim',
      });
      return { blob: blob, stated: stated };
    }

    /* The door for a record that may be chunked. Anything else is the sync `write`, unchanged. A chunked record
       is written as GeoJSON here; another format needs the whole result as arrays, which `write` asks of the
       registry and which refuses by name above its ceiling (the same error a reader gets for any other op). */
    async function writeAsync(target, opts, signal) {
      const got = resolve(target);
      if (!got.ok) return got.res;
      const rec = got.rec, o = opts || {};
      const fmt = (o.format == null || String(o.format) === '') ? null : formatById(o.format);
      if (!(rec && typeof rec.chunks === 'function' && fmt && fmt.id === 'geojson')) return write(target, opts);
      if (!(rec.count > 0)) return bad('export-empty', { id: rec.id == null ? null : String(rec.id), count: 0 });
      const made = await writeChunkedGeoJson(rec, o, signal);
      if (made && made.ok === false) return made;
      return { ok: true, format: fmt.id, mediaType: fmt.mediaType, filename: filenameFor(rec, fmt), bytes: made.blob, text: null, stated: made.stated };
    }

    /* The one place the bytes of an answer become a download in a browser — the GIS panel and the
       Atlas door both end here. ⚠ The anchor is attached before it is clicked (a detached one does
       nothing in Firefox) and the object URL is revoked on the next turn of the loop, because
       revoking it synchronously cancels the download just started. false = no way to save here. */
    function save(res) {
      let d = null;
      try { d = window.document; } catch (_) { d = null; }
      if (!res || res.ok === false || !d || typeof Blob === 'undefined' || !window.URL || typeof URL.createObjectURL !== 'function') return false;
      let url = null;
      try {
        url = URL.createObjectURL(new Blob([res.bytes], { type: res.mediaType || 'application/octet-stream' }));
        const a = d.createElement('a');
        a.href = url; a.download = res.filename; a.style.display = 'none';
        (d.body || d.documentElement).appendChild(a);
        a.click(); a.remove();
        setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) { } }, 0);
        return true;
      } catch (_) {
        if (url) { try { URL.revokeObjectURL(url); } catch (_) { } }
        return false;
      }
    }

    const API = { formats, refusals, write, writeAsync, filenameFor, save };
    try { window.IntMapGisExport = API; } catch (_) { }
    return API;
  })();
}
