/* ============================================================================
 *  IntMap · THE DATASET REGISTRY — window.IntMapData   (#R729)
 * ----------------------------------------------------------------------------
 *  「地図に載せたデータ」と「分析できるデータ」が別々の仕組みになっていた。
 *
 *  Before this file the program had two unrelated notions of "a dataset":
 *
 *    · js/geo-import.js → js/map-ui.js made a MapLibre source (ugj-<n>) and three draw layers.
 *      What was kept afterwards was a row in the import list: label, colour, source id. The
 *      features were inside the renderer; the attributes were strings; nothing could ask the
 *      import a question.
 *    · js/atlas-query.js has TABLES — five built-in records that CAN be filtered, joined and
 *      ordered. Its FROM clause names one of those five. A file the reader dropped on the map was
 *      not one of them, and no code path could make it one.
 *
 *  So 「CSV を落としたら地図に出る」 and 「その CSV を他のデータと同じように分析できる」 were
 *  two different mechanisms, and the second one had no entrance.
 *
 *  ══ WHAT A DATASET IS HERE ════════════════════════════════════════════════════════════════════
 *  One record per body of data, whatever produced it — a file the reader dropped, a built-in
 *  record, or the OUTPUT OF AN ANALYSIS. That last one is the point: an op's result is registered
 *  the same way an import is, so it is the input of the next op with no special case.
 *
 *      { id, title, kind:'vector', geometryType, crs, sourceCrs, fields[], count, time,
 *        features(), provenance, createdAt }
 *
 *  ⚠ AND SINCE #R735 THERE IS A SECOND PAYLOAD: `kind:'raster'` carries a numeric grid instead of
 *  features (see addRaster). Everything around it — ids, provenance recipes, lineage, `stale` — is
 *  the same machinery, which is what makes 「区域内の標高分布」 a composition of ops rather than
 *  another bespoke feature. The samples live behind raster(), the way features live behind features().
 *
 *  ⚠ `time` IS PART OF THE CONTRACT SINCE #R735, and null is one of its values: 「時刻の宣言が無い」
 *  is not 「時刻が無い」. A declaration is verified against the data and refused by name when it does
 *  not hold (`timeRefused`), because a time field that is filled in by whoever wrote the caller is a
 *  claim with no author behind it. See the `── time ──` block.
 *
 *  ⚠ THE FIELD TYPES ARE MEASURED, NOT GUESSED FROM THE COLUMN NAME. A column is `number` when
 *  every non-empty value in it parses as a finite number, `date` when every non-empty value parses
 *  as a date, `text` otherwise — and the count of empty cells is carried next to the verdict. A
 *  name list would be the case-by-case shape .agents/rules/no-ad-hoc-hardcoding.md forbids: it
 *  decides about the column the author happened to think of and silently mis-types the next one.
 *  Measuring answers for the column that arrives tomorrow as well.
 *
 *  ⚠ `crs` IS ALWAYS EPSG:4326 AND `sourceCrs` IS WHAT ARRIVED. Everything downstream — the
 *  renderer, the ops, point-in-polygon — assumes lng/lat degrees, so the registry states that as a
 *  value rather than leaving each reader to assume it. `sourceCrs` is null when the bytes did not
 *  say; that is «not stated», which is not the same claim as «it was 4326».
 *
 *  ⚠ PROVENANCE IS NOT A LABEL, IT IS THE RECIPE. {kind:'op', op, inputs:[id…], params:{…}} is
 *  enough to RUN the step again — which is what js/gis-project.js reloads, and what lets a reader
 *  change 5 km to 10 km without repeating the work by hand. An import carries {kind:'import',
 *  file, licence, url} instead, because there is nothing to re-run: the bytes are the origin.
 *
 *  ⚠ FEATURES ARE BEHIND A FUNCTION. A dataset may hold tens of thousands of features; the list
 *  panel, the chain view and the query bridge all want the METADATA and not the geometry.
 *  features() is the only door that materialises it, so «what datasets exist» costs nothing.
 * ==========================================================================*/

export function makeGisDatasets() {
  return (function () {

    /* id → record. Insertion order is the order the reader sees; Map keeps it. */
    const DS = new Map();
    let seq = 0;
    const subs = [];

    function emit(what, ds) {
      for (const fn of subs.slice()) { try { fn(what, ds); } catch (_) { } }
    }

    /* ── field typing ───────────────────────────────────────────────────────────────────────── */

    /* A value is "empty" when there is nothing to type: null, undefined, or a string of spaces.
       Empty cells never decide a type — a column of 900 numbers and 3 blanks is a number column
       with 3 blanks, and saying text there would take arithmetic away from the whole column. */
    function isEmpty(v) { return v == null || (typeof v === 'string' && v.trim() === ''); }

    /* ⚠ A ZERO-PADDED CELL IS A CODE, NOT A NUMBER (#R735). `"01100"` is 札幌市中央区 and `"1100"`
       is nothing at all; decimal notation carries no insignificant leading zeros, so a cell that has
       one was written by something that was spelling an IDENTIFIER. Before this rule the regex below
       accepted it, the column typed as `number`, and every comparison in js/gis-ops.js goes through
       asNumber — which made `"01100" == "1100"` TRUE, would have joined a statistic onto the wrong
       municipality, and printed a min/max for a column that has no magnitude. The import never lost
       the digits (js/geo-import.js keeps every cell as a string); what was lost was the VERDICT.
       ⚠ THE RULE IS THE NOTATION, NOT A LIST OF CODE COLUMNS. A name list (`/code|id|_cd$/`) is the
       case-by-case shape .agents/rules/no-ad-hoc-hardcoding.md forbids, and it would mis-type the
       next country's spelling of 「市区町村コード」. `0`, `0.5`, `-0.25`, `0e3` stay numbers — their
       zero is significant. `01`, `00`, `+007` are not numbers. */
    function leadingZero(s) { return /^[+-]?0\d/.test(s); }

    function asNumber(v) {
      if (typeof v === 'number') return isFinite(v) ? v : null;
      if (typeof v !== 'string') return null;
      const s = v.trim().replace(/ /g, '');
      if (s === '') return null;
      /* A number is the whole cell or it is not a number. "12 km" is text: parseFloat would call it
         12 and the column would start pretending it can be summed. */
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
      if (leadingZero(s)) return null;
      const n = Number(s);
      return isFinite(n) ? n : null;
    }

    /* Dates are accepted only in forms that state the year first (ISO-8601 and its date-only and
       year-month prefixes). ⚠ Date.parse alone would accept 「東京」 in some engines and would read
       03/04/2020 as one of two different days depending on the locale of whoever runs it — a column
       whose meaning changes with the reader is worse than a text column. */
    function asDate(v) {
      if (v instanceof Date) return isFinite(+v) ? +v : null;
      if (typeof v !== 'string') return null;
      const s = v.trim();
      if (!/^\d{4}(-\d{2}(-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?)?)?$/.test(s)) return null;
      const t = Date.parse(s.length === 4 ? s + '-01-01' : s.replace(' ', 'T'));
      return isFinite(t) ? t : null;
    }

    /* Evidence for the verdict below: a cell made of digits that was refused as a number ONLY
       because of its leading zero. A column with 1,900 of them is a code column, and the count is
       what lets the panel say so instead of leaving the reader to wonder why 「番号なのに
       計算できない」. ⚠ Same notation rule as asNumber, asked once — a second spelling of it here
       would drift from the one that decides. */
    function paddedNumeral(v) {
      if (typeof v !== 'string') return false;
      const s = v.trim().replace(/ /g, '');
      return leadingZero(s) && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s);
    }

    /* Walk the values of one column once and say what it is, with the evidence next to the verdict. */
    function typeColumn(name, values) {
      let empty = 0, nums = 0, dates = 0, total = 0, padded = 0;
      let min = null, max = null;
      for (const v of values) {
        total++;
        if (isEmpty(v)) { empty++; continue; }
        const n = asNumber(v);
        if (n != null) { nums++; if (min == null || n < min) min = n; if (max == null || n > max) max = n; }
        else if (paddedNumeral(v)) padded++;
        if (asDate(v) != null) dates++;
      }
      const filled = total - empty;
      /* ⚠ ORDER MATTERS AND IT IS NOT ARBITRARY: 2020 parses as both. A column of bare years is more
         useful as a number (it can be compared, summed, bucketed) and a reader who wants it as a
         time axis loses nothing, because the number IS the year. So number wins the tie. */
      let type = 'text';
      if (filled > 0 && nums === filled) type = 'number';
      else if (filled > 0 && dates === filled) type = 'date';
      const col = { name, type, empty, filled, total };
      if (type === 'number') { col.min = min; col.max = max; }
      if (padded > 0) col.padded = padded;
      return col;
    }

    /* The column set is the UNION over features, not the keys of the first one — a GeoJSON file may
       carry different properties per feature, and reading only feature 0 drops every column that
       starts later. */
    function describeFields(features) {
      const names = [];
      const seen = new Set();
      for (const f of features) {
        const p = (f && f.properties) || {};
        for (const k of Object.keys(p)) if (!seen.has(k)) { seen.add(k); names.push(k); }
      }
      return names.map((k) => typeColumn(k, features.map((f) => ((f && f.properties) || {})[k])));
    }

    /* Point / LineString / Polygon when every feature agrees (Multi* counts as its singular, because
       an op that can clip a Polygon can clip a MultiPolygon), Mixed when they do not, null when
       there are no features. ⚠ An op that needs one kind asks for it and REFUSES a mixed dataset by
       name; it does not silently work on the subset it recognises. */
    function geometryKind(features) {
      let kind = null;
      for (const f of features) {
        const t = f && f.geometry && f.geometry.type;
        if (!t) continue;
        const base = String(t).replace(/^Multi/, '');
        if (kind == null) kind = base;
        else if (kind !== base) return 'Mixed';
      }
      return kind;
    }

    /* ── time ───────────────────────────────────────────────────────────────────────────────────
       ⚠ A DATASET HAD NO WAY TO SAY WHEN IT IS (#R735). The registry typed a column as `date` and
       stopped there: which column is the time axis, whether a row is an instant or a span, and what
       the time of a trajectory's 4,000th point is, were facts nothing could state — so 「この時間帯
       だけ」 and 「時間帯ごとに集計」 had no entrance, and js/gis-layers.js threw the layer's own
       time away when it made a dataset out of what is on the map.

       Four shapes, and `null` is one of them:

         null                                                 nothing was declared. NOT 「時刻が無い」.
         { kind:'instant',  field }                            one moment per feature
         { kind:'interval', startField, endField }              a span; either end may be empty = open
         { kind:'track',    timesField, elevationField }        one time (and height) PER POSITION
         { kind:'constant', start, end }                        the whole dataset is one moment/span
                                                                — a map layer's validity, a raster epoch

       ⚠ THE DECLARATION IS VERIFIED AGAINST THE DATA, AND A DECLARATION THAT DOES NOT HOLD IS
       REFUSED BY NAME. `timeRefused` carries why. The alternative — storing what the caller said —
       is the shape .agents/rules/historical-verification.md and the memory note
       「データが誰かが述べたことを主張してよいのは、誰かが述べたときだけ」 forbid: a `time` field
       that is present because somebody filled it in, with no author behind the claim.

       ⚠ THE TRACK CASE IS THE ONE THAT CANNOT BE TAKEN ON TRUST. A parallel array is only a time
       axis while its length equals the number of positions, and IntMap has a path that breaks
       exactly that: js/geodesy.js sanitizeFeatures DROPS a position it cannot fix (and flattens the
       third ordinate, which is why elevation is carried beside the coordinates rather than inside
       them). One dropped position silently shifts every later timestamp onto the wrong place. So the
       lengths are MEASURED, per feature, and one mismatch refuses the whole declaration. */

    function positionCount(geometry) {
      const g = geometry;
      if (!g || !g.coordinates) return 0;
      let n = 0;
      (function walk(c) {
        if (!Array.isArray(c)) return;
        if (typeof c[0] === 'number') { n++; return; }
        for (const x of c) walk(x);
      })(g.coordinates);
      return n;
    }

    /* A stated moment, from whatever the cell holds. A bare year is a number here (number wins the
       tie in typeColumn) and it is still a year, so it is read as one: the alternative is telling a
       reader with a column of 1889s that their dataset has no time in it. ⚠ The window is the WHOLE
       year — 1889 means 1889-01-01 to 1889-12-31, not midnight on New Year's Day — because that is
       what the cell says and narrowing it would answer a question nobody asked. */
    const YEAR_MIN = -9999, YEAR_MAX = 9999;

    /* ⚠ NOT Date.UTC(y, …) (#R602 was the round that paid for this). Date.UTC maps a year below 100
       onto 1900+y, so a dataset of Roman-era years would be silently stamped in the twentieth century
       and a BC year would not be expressible at all. setUTCFullYear has no such rule, and IntMap has
       layers that reach 紀元前. */
    function utcYear(y, end) {
      const d = new Date(0);
      if (end) { d.setUTCFullYear(y, 11, 31); d.setUTCHours(23, 59, 59, 999); }
      else { d.setUTCFullYear(y, 0, 1); d.setUTCHours(0, 0, 0, 0); }
      const t = +d;
      return isFinite(t) ? t : null;
    }
    function momentOf(v) {
      /* ⚠ THE YEAR RULE IS ASKED FIRST, and that order is the whole of it. asDate accepts `1889` as
         a date — it is a legal ISO year-prefix — and answers 1889-01-01T00:00:00Z, so a year put
         through asDate first becomes ONE MILLISECOND. A dataset of years would then overlap almost no
         window a reader asks for: 「1889 年から 1890 年まで」 would keep a row stamped 1889 and drop
         one stamped 1890-06, because the second one's single instant is outside a span the first one
         starts. Asking the year rule first is what makes the year mean the year. */
      /* A four-digit string is read as a year even when it is zero-padded: `0005` is how ISO-8601
         spells the year 5, so the padding there is the notation and not the code-column notation
         asNumber refuses. Without this, `5` and `0005` — the same year — would get a whole year and a
         single millisecond. */
      const n = (typeof v === 'string' && /^\d{4}$/.test(v.trim())) ? Number(v.trim()) : asNumber(v);
      if (n != null && Number.isInteger(n) && n >= YEAR_MIN && n <= YEAR_MAX) {
        const s = utcYear(n, false), e = utcYear(n, true);
        if (s != null && e != null) return { start: s, end: e, year: n };
      }
      const d = asDate(v);
      if (d != null) return { start: d, end: d };
      return null;
    }

    function fieldExists(features, name) {
      for (const f of features) { const p = (f && f.properties) || {}; if (Object.prototype.hasOwnProperty.call(p, name)) return true; }
      return false;
    }

    function declareTime(decl, features) {
      if (decl == null) return { time: null, refused: null };
      if (typeof decl !== 'object') return { time: null, refused: { why: 'time-declaration-not-an-object' } };
      const kind = String(decl.kind || '');
      const no = (why, detail) => ({ time: null, refused: detail ? { why, detail } : { why } });

      if (kind === 'constant') {
        const s = decl.start == null ? null : momentOf(decl.start);
        const e = decl.end == null ? null : momentOf(decl.end);
        if (decl.start != null && s == null) return no('time-unreadable', { end: 'start', value: String(decl.start) });
        if (decl.end != null && e == null) return no('time-unreadable', { end: 'end', value: String(decl.end) });
        if (s == null && e == null) return no('time-constant-empty');
        return { time: { kind: 'constant', start: s ? s.start : null, end: e ? e.end : (s ? s.end : null) }, refused: null };
      }

      if (kind === 'instant' || kind === 'interval') {
        const names = (kind === 'instant') ? [decl.field] : [decl.startField, decl.endField];
        for (const nm of names) {
          if (nm == null) continue;                       /* an open end of an interval may be unnamed */
          if (typeof nm !== 'string' || nm === '') return no('time-field-not-named');
          if (!fieldExists(features, nm)) return no('time-field-missing', { field: nm });
        }
        if (kind === 'instant' && !decl.field) return no('time-field-not-named');
        if (kind === 'interval' && !decl.startField && !decl.endField) return no('time-field-not-named');
        /* ⚠ THE FIELD MUST ACTUALLY READ AS TIME, and how often is measured rather than assumed: a
           column named 「年」 full of 「明治22年」 parses in no engine. A declaration whose cells
           never parse is refused; one whose cells parse sometimes is kept WITH the count, because a
           gappy time axis is still a time axis and the number is how a reader knows. */
        let read = 0, seen = 0;
        for (const f of features) {
          const p = (f && f.properties) || {};
          let any = false, ok = false;
          for (const nm of names) {
            if (!nm) continue;
            const v = p[nm];
            if (isEmpty(v)) continue;
            any = true;
            if (momentOf(v) != null) ok = true;
          }
          if (any) { seen++; if (ok) read++; }
        }
        if (seen > 0 && read === 0) return no('time-unreadable', { checked: seen });
        const t = { kind, readable: read, stated: seen };
        if (kind === 'instant') t.field = decl.field;
        else { t.startField = decl.startField || null; t.endField = decl.endField || null; }
        return { time: t, refused: null };
      }

      if (kind === 'track') {
        const tf = decl.timesField;
        if (typeof tf !== 'string' || tf === '') return no('time-field-not-named');
        const ef = (typeof decl.elevationField === 'string' && decl.elevationField) ? decl.elevationField : null;
        let carried = 0, bad = null, read = 0;
        for (const f of features) {
          const p = (f && f.properties) || {};
          const arr = p[tf];
          if (arr == null) continue;
          if (!Array.isArray(arr)) { bad = { why: 'time-track-not-an-array', detail: { field: tf } }; break; }
          const want = positionCount(f && f.geometry);
          if (arr.length !== want) { bad = { why: 'time-track-misaligned', detail: { field: tf, positions: want, times: arr.length } }; break; }
          if (ef) {
            const el = p[ef];
            if (el != null && (!Array.isArray(el) || el.length !== want)) {
              bad = { why: 'time-track-misaligned', detail: { field: ef, positions: want, values: Array.isArray(el) ? el.length : null } };
              break;
            }
          }
          carried++;
          for (const v of arr) if (!isEmpty(v) && momentOf(v) != null) { read++; break; }
        }
        if (bad) return no(bad.why, bad.detail);
        if (!carried) return no('time-field-missing', { field: tf });
        return { time: { kind: 'track', timesField: tf, elevationField: ef, features: carried, readable: read }, refused: null };
      }

      return no('time-kind-unknown', { kind: kind || null });
    }

    /* What ONE feature's time is, asked of the dataset's declaration — the single reader of it, so
       js/gis-ops.js does not carry a second interpretation of the same four shapes. Returns
       `{start, end}` in ms (either may be null = open), or null when this feature says nothing. */
    function timeSpan(rec, feature) {
      const t = rec && rec.time;
      if (!t) return null;
      if (t.kind === 'constant') return { start: t.start, end: t.end };
      const p = (feature && feature.properties) || {};
      if (t.kind === 'instant') { const m = momentOf(p[t.field]); return m ? { start: m.start, end: m.end } : null; }
      if (t.kind === 'interval') {
        const s = t.startField ? momentOf(p[t.startField]) : null;
        const e = t.endField ? momentOf(p[t.endField]) : null;
        if (!s && !e) return null;
        return { start: s ? s.start : null, end: e ? e.end : null };
      }
      if (t.kind === 'track') {
        const arr = p[t.timesField];
        if (!Array.isArray(arr)) return null;
        let lo = null, hi = null;
        for (const v of arr) {
          const m = momentOf(v);
          if (!m) continue;
          if (lo == null || m.start < lo) lo = m.start;
          if (hi == null || m.end > hi) hi = m.end;
        }
        return (lo == null && hi == null) ? null : { start: lo, end: hi };
      }
      return null;
    }

    /* ── registration ───────────────────────────────────────────────────────────────────────── */

    /* One door for every origin. `features` is an array; it is held and handed back by features().
       Nothing here samples or truncates — a dataset that quietly holds fewer rows than it says it
       has would make every count downstream a lie. */
    /* One id generator, asked by both doors (#R735 — the raster door is the second one). Keeping the
       counter's rule inside add() would have meant copying it, and a second copy of THIS rule is the
       exact defect the comment below describes. */
    function claimId(given) {
      const id = given || ('ds-' + (++seq));
      if (DS.has(id)) throw new Error('dataset id already registered: ' + id);
      /* ⚠ THE GENERATOR OBSERVES THE NAMESPACE IT SHARES. Callers supply ids of their own — the
         project loader restores `ds-1` by name, because a saved recipe names its inputs — and the
         counter used to be moved only by the ids IT made. So a reload that restored ds-1..ds-3 left
         seq at 0, and the next import generated `ds-1` again: add() threw, js/geo-import.js swallows
         a failed registration, and the file was on the map while being absent from the registry the
         panel and the query bridge read. Raising the counter past every id that could have come out
         of it is the whole of the fix; a retry loop here would only rename the symptom, and the
         symptom is not the collision but a counter that was not looking at its own namespace.
         ⚠ It never goes DOWN — not on remove(): an id that has been issued may still be named by a
         saved project, and reissuing it would attach that recipe to different data. */
      const auto = /^ds-(\d+)$/.exec(id);
      if (auto) { const n = Number(auto[1]); if (isFinite(n) && n > seq) seq = n; }
      return id;
    }

    function add(spec) {
      if (spec && (spec.kind === 'raster' || spec.raster)) return addRaster(spec);
      const features = Array.isArray(spec && spec.features) ? spec.features : [];
      const id = claimId((spec && spec.id) || null);
      const declared = declareTime((spec && spec.time) || null, features);
      const rec = {
        id,
        title: String((spec && spec.title) || id),
        kind: 'vector',
        crs: 'EPSG:4326',
        sourceCrs: (spec && spec.sourceCrs) || null,
        geometryType: geometryKind(features),
        fields: describeFields(features),
        count: features.length,
        /* The verified declaration, or null — and the refusal next to it when a caller stated one
           that the data does not bear out. See declareTime(). */
        time: declared.time,
        timeRefused: declared.refused,
        provenance: (spec && spec.provenance) || { kind: 'unknown' },
        createdAt: (spec && spec.createdAt) || Date.now(),
        /* Null means «these features are the ones this record's recipe produces». A record is only
           ever born fresh: a rebuild removes the old record and adds a new one, so freshness is not
           a flag anybody has to remember to clear. See invalidate(). */
        stale: null,
        features: () => features,
      };
      DS.set(id, rec);
      emit('add', rec);
      return rec;
    }

    /* ── the raster door ────────────────────────────────────────────────────────────────────────
       ⚠ THE REGISTRY HELD ONE KIND OF DATA AND THE APP HELD TWO (#R735). `kind` was the literal
       string 'vector' — a field that stated a fact nothing could contradict. Meanwhile the program
       reads numeric grids all over itself (precipitation, temperature, land cover, the DEM): every
       one of them behind its own bespoke reader, none of them something an op could be pointed at.
       So 「この区域の人口」「区域内の標高分布」「土地被覆ごとの面積」 each had to be built as a
       separate feature, and none of them composed with the next.

       A raster record is the same record with a different payload — same ids, same provenance recipe,
       same lineage, same `stale`, so an op's raster output is the input of the next op with no
       special case, exactly as a vector output is:

         { id, title, kind:'raster', crs:'EPSG:4326', sourceCrs, width, height,
           grid:{west,north,pixelLng,pixelLat}, bands:[{name,unit,nodata}], time, count, raster() }

       ⚠ `raster()` IS THE DOOR, THE WAY features() IS. A grid of 4,000 × 4,000 is 128 MB as doubles;
       the panel, the chain view and the save file all want the METADATA. Nothing in this file touches
       the samples.
       ⚠ THE GEOMETRY OF THE GRID IS REFUSED IF IT IS NOT A GRID. A zero or negative pixel size, a
       non-integer width, a read() that is not a function: each of those produces a record whose every
       later sample is silently wrong, and this is the last place that can still say no. The rule for
       the rest (row 0 is the NORTH row, pixel sizes are positive) is stated in js/gis-raster.js,
       which is the only reader of the samples. */
    function addRaster(spec) {
      const src = spec || {};
      const g = src.grid || {};
      const num = (v) => (typeof v === 'number' && isFinite(v));
      const int = (v) => (num(v) && Number.isInteger(v) && v > 0);
      if (!int(src.width) || !int(src.height)) throw new Error('raster needs positive integer width/height');
      if (!num(g.west) || !num(g.north) || !num(g.pixelLng) || !num(g.pixelLat)) throw new Error('raster grid needs numeric west/north/pixelLng/pixelLat');
      if (g.pixelLng <= 0 || g.pixelLat <= 0) throw new Error('raster pixel size must be positive (row 0 is the north row)');
      if (typeof src.read !== 'function') throw new Error('raster needs read(bandIndex)');
      const bands = Array.isArray(src.bands) ? src.bands : [];
      if (!bands.length) throw new Error('raster needs at least one band');

      const id = claimId(src.id || null);
      /* A raster's time is the epoch of the grid, so only the whole-dataset shape can apply: there
         are no features to carry a column. A caller declaring a per-feature shape is told so rather
         than having it quietly ignored. */
      const wanted = src.time || null;
      const declared = (wanted && wanted.kind && wanted.kind !== 'constant')
        ? { time: null, refused: { why: 'time-kind-not-for-raster', detail: { kind: String(wanted.kind) } } }
        : declareTime(wanted, []);
      const rec = {
        id,
        title: String(src.title || id),
        kind: 'raster',
        crs: 'EPSG:4326',
        sourceCrs: src.sourceCrs || null,
        width: src.width,
        height: src.height,
        grid: { west: g.west, north: g.north, pixelLng: g.pixelLng, pixelLat: g.pixelLat },
        bands: bands.map((b, i) => ({
          name: String((b && b.name) || ('band' + (i + 1))),
          unit: (b && b.unit != null) ? String(b.unit) : null,
          nodata: (b && typeof b.nodata === 'number' && isFinite(b.nodata)) ? b.nodata : null,
        })),
        fields: bands.map((b, i) => ({
          name: String((b && b.name) || ('band' + (i + 1))),
          type: 'number', band: i,
          unit: (b && b.unit != null) ? String(b.unit) : null,
        })),
        /* `geometryType` is stated as the empty answer rather than left undefined: the panel and
           js/gis-project.js read it on every record, and «a grid has no geometry type» is a different
           claim from «nobody looked».
           ⚠ A RASTER'S COLUMNS ARE ITS BANDS, and saying so in the field a panel already reads is
           what makes 「どのバンドで」 the same control as 「どの列で」 — one picker, not two. The type
           is `number` because samples are numbers; a band's `min`/`max` are NOT written here because
           this file does not touch the samples (js/gis-raster.js describeBands() measures them, and
           a declared range nobody measured would be the shape #R735 removed elsewhere). */
        geometryType: null,
        count: src.width * src.height,
        time: declared.time,
        timeRefused: declared.refused,
        provenance: src.provenance || { kind: 'unknown' },
        createdAt: src.createdAt || Date.now(),
        stale: null,
        read: src.read,
        raster: () => rec,
      };
      DS.set(id, rec);
      emit('add', rec);
      return rec;
    }

    function remove(id) {
      const rec = DS.get(id);
      if (!rec) return false;
      DS.delete(id);
      emit('remove', rec);
      return true;
    }

    /* Which datasets were made FROM this one. A reader deleting an input must be told what else
       goes, and js/gis-project.js re-runs exactly this set when a parameter changes. */
    function dependents(id) {
      const out = [];
      for (const rec of DS.values()) {
        const inputs = (rec.provenance && rec.provenance.inputs) || [];
        if (inputs.indexOf(id) >= 0) out.push(rec);
      }
      return out;
    }

    /* ── invalidation ───────────────────────────────────────────────────────────────────────
       ⚠ A RECOMPUTATION THAT STOPS HALFWAY LEAVES REAL DATA THAT IS NO LONGER THE ANSWER TO ITS OWN
       RECIPE. js/gis-project.js rebuilds a chain upstream first and stops at the first failure; the
       steps below the failure were never removed, so they sat in the registry holding the output of
       the OLD parameters, with nothing about them saying so. The panel listed them, draw() drew
       them, the query bridge answered from them, and the next op consumed them — all of it correct
       work on a number the reader had just changed.
       `stale` is that missing state, and it travels the way the error does: down. What it is NOT is
       a deletion — the features are still the last answer that was actually computed, which is worth
       more to a reader than an empty panel, as long as the map, the table and the ops all say so.
       ⚠ IT IS THE OPS THAT MAKE IT BINDING (js/gis-ops.js refuses a stale input by name). A state
       nothing inspects is a decoration. */
    function invalidate(id, why) {
      const touched = [];
      const queue = [id];
      const seen = new Set();
      while (queue.length) {
        const cur = queue.shift();
        if (seen.has(cur)) continue;
        seen.add(cur);
        const rec = DS.get(cur);
        if (!rec) continue;
        /* The reason is the FIRST one that reached this record: the step that actually failed is
           what the reader has to fix, and overwriting it with 'upstream-failed' on a second pass
           would replace the diagnosis with its own consequence. */
        if (!rec.stale) {
          rec.stale = { why: String(why || 'invalidated'), since: Date.now() };
          touched.push(cur);
          emit('stale', rec);
        }
        for (const d of dependents(cur)) queue.push(d.id);
      }
      return touched;
    }

    /* The whole chain that produced a dataset, oldest first — what the reader sees as 「この結果は
       どこから来たか」 and what a saved project replays in order. */
    function lineage(id) {
      const seen = new Set(), out = [];
      (function walk(x) {
        if (!x || seen.has(x)) return;
        seen.add(x);
        const rec = DS.get(x);
        if (!rec) return;
        for (const i of ((rec.provenance && rec.provenance.inputs) || [])) walk(i);
        out.push(rec);
      })(id);
      return out;
    }

    /* Everything but features() — the shape js/gis-project.js writes and the panel lists. */
    function describe(id) {
      const r = DS.get(id);
      if (!r) return null;
      const out = {};
      /* The accessors are the payload doors, not description: features() for a vector, raster()/read()
         for a grid. Naming all three keeps 「記述」 the same size whatever the record holds. */
      for (const k of Object.keys(r)) if (k !== 'features' && k !== 'raster' && k !== 'read') out[k] = r[k];
      return JSON.parse(JSON.stringify(out));
    }

    const API = {
      add, remove, dependents, lineage, describe, invalidate,
      stale: (id) => { const r = DS.get(id); return (r && r.stale) || null; },
      get: (id) => DS.get(id) || null,
      list: () => Array.from(DS.values()),
      ids: () => Array.from(DS.keys()),
      has: (id) => DS.has(id),
      /* ⚠ THE COUNTER IS NOT RESET (#R735). It used to be, one line under the comment in claimId that
         says it never goes down — and for the same reason that comment gives: clear() is what
         js/gis-project.js calls before restoring a saved project, so the very next thing that happens
         is `ds-1`..`ds-n` arriving BY NAME. Zeroing the counter put the generator back behind ids that
         are about to exist, which is the collision #R732 fixed, reintroduced by the one caller that
         empties the registry. Emptiness is not a reason to forget which names have been issued. */
      clear: () => { for (const id of Array.from(DS.keys())) remove(id); },
      subscribe: (fn) => { if (typeof fn === 'function') subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
      /* exposed because js/gis-ops.js must type the columns of its OWN output the same way an import
         is typed — two typing rules would drift, and the drift would show up as a column that can be
         compared in one panel and not in the other */
      typeColumn, describeFields, geometryKind, asNumber, asDate, isEmpty,
      /* The one reader of a `time` declaration (#R735): js/gis-ops.js asks it rather than carrying a
         second interpretation of the four shapes, and the checks measure the same answer the ops use. */
      timeSpan, momentOf, positionCount,
    };
    try { window.IntMapData = API; } catch (_) { }
    return API;
  })();
}
