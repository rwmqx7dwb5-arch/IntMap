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
 *
 *  ══ #R738 — A TABLE WITH NO GEOMETRY, AND VALUES THE READER CAN CHANGE ════════════════════════
 *  ⚠ THERE IS NO THIRD PAYLOAD, AND THAT IS A DECISION. 「座標を持たない統計表」 is a vector record
 *  whose features carry `geometry:null`: the rows are rows, so filter, timeWindow, the query bridge,
 *  the project save, provenance, lineage and `stale` all work on it with NOT ONE LINE ADDED. A
 *  `kind:'table'` would have meant repeating, for a third payload, the per-slot `kinds` sorting that
 *  #R735 had to do across nine ops when the grid arrived — and it would have made 「幾何を持つ行と
 *  持たない行が混ざった 1 つのファイル」 unrepresentable, which is what a CSV with blank coordinate
 *  cells actually is. What such a record DOES need is a field that says so, because `geometryType`
 *  cannot: it answers `null` for 「地物が 0 件」 and `null` for 「4 万行あるがどれも幾何を持たない」,
 *  and an op that needs shapes has to tell those apart. So `withGeometry` is MEASURED next to
 *  `count` — not taken from what the caller declared, the same rule the fields and the time
 *  declaration follow. `count - withGeometry` is the number of rows with nothing to draw, and a
 *  record where both are non-zero states the mixture rather than picking a side.
 *  ⚠ IT IS NULL ON A RASTER, not 0 — see addRaster.
 *
 *  ⚠ VALUES CAN BE EDITED, AND WHAT THE EDIT LAYER REFUSES IS THE POINT OF IT (see editable()):
 *  an op's output is not editable, because its provenance is a RECIPE and js/gis-project.js re-runs
 *  it — an edit there would be silently erased by the next setParams, and until then the record
 *  would no longer be what its own recipe produces. A grid is not editable (pixels are not
 *  attributes). A `stale` record is not editable, for the reason js/gis-ops.js refuses it as an
 *  input: the staleness would stop being visible.
 *  ⚠ UNDO IS THE INVERSE OPERATION, NOT A SNAPSHOT. The history holds {index, field, previous value}
 *  and, for a column, the sparse list of the cells that were actually there. A snapshot per edit
 *  would be 40,000 features copied twenty times to undo twenty cells; history().bytes measures what
 *  is actually held, so the claim is checkable rather than asserted here.
 *  ⚠ UNDO LIVES IN THE SESSION ONLY. js/gis-project.js saves an import as its BODY (features
 *  verbatim, via rec.features()), so an edited value is already in the save — but a saved undo stack
 *  would be a second history of a file whose features it no longer matches the moment the reader
 *  drops a newer copy, and IndexedDB would be holding the reader's keystrokes rather than their data.
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

    /* How many features actually carry a shape (#R738). ⚠ A ROW WITH NO GEOMETRY DOES NOT VOTE ON
       `geometryType` — 'Mixed' is the claim «two KINDS of shape are present», and answering it for a
       statistical table with one point in it would refuse that table from every op that needs
       polygons for a reason that is not true. So the absence is counted instead, beside `count`:
       `withGeometry === 0 && count > 0` is 「幾何を持たない行の束」, `0 < withGeometry < count` is a
       file where some rows have coordinates and some do not, and `count === 0` is an empty record.
       None of those three can be told apart from `geometryType` alone, which is null for all of them. */
    function countWithGeometry(features) {
      let n = 0;
      for (const f of features) if (f && f.geometry && f.geometry.type) n++;
      return n;
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
        /* Measured, never taken from the caller (#R738). See countWithGeometry: this is the only
           field that separates 「行はあるが幾何が無い」 from 「地物が 0 件」. */
        withGeometry: countWithGeometry(features),
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
          /* ⚠ WHO SAID THE UNIT (#R738). A band's unit arrived WITH the grid — the GeoTIFF, the
             sampler, the layer that was baked — whereas a vector column's unit can only have been
             typed by the reader (declareField). Nothing can verify either one, so the one thing this
             record can honestly carry is the author; leaving both in one `unit` field with no author
             would let a panel present a reader's guess as the source's statement. */
          unitStated: (b && b.unit != null) ? 'source' : null,
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
        /* ⚠ NULL, NOT 0 (#R738). `count` here is PIXELS, so «0 of them carry geometry» would read
           exactly like 「行はあるが幾何を持たない統計表」 — the record this field exists to name. A
           grid has no features at all, so the question does not apply to it, and null is how this
           file already spells that. A reader of this field asks about `kind` first:
           `kind === 'vector' && withGeometry === 0 && count > 0` is the tabular case. */
        withGeometry: null,
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
      /* The edit history and the reader's declarations belong to THIS record. They are dropped with
         it — an id is never reissued (claimId), so nothing can inherit them. */
      EDITS.delete(id);
      DECL.delete(id);
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

    /* ── 属性の編集と、その取り消し（#R738）────────────────────────────────────────────────────
       Everything a reader does to the VALUES goes through this block: declaring what a column is,
       changing a cell, adding / removing / renaming a column, and stepping back out of any of it.

       ⚠ WHAT IT REFUSES IS THE FEATURE. The registry's whole claim is that a record is what its
       provenance says it is; three kinds of record cannot be edited without making that false, and
       each is refused BY NAME rather than half-working:

         edit-would-contradict-recipe  provenance.kind === 'op'. The record is the output of a recipe
                                       js/gis-project.js re-runs; setParams would erase the edit
                                       without telling anyone, and until it did, 「この地物はこの
                                       レコードのレシピが出すもの」 would be a lie. `detail` names the
                                       record and its op so the caller can offer 「編集できる複製を
                                       作る」 — which is an op's job or the panel's, not this file's.
         edit-needs-features           kind !== 'vector'. A grid's samples are not attributes, and
                                       this file does not touch samples at all (that is raster()'s door).
         input-stale                   SPELT THE WAY js/gis-ops.js SPELLS IT, and refused for the same
                                       reason: the features are the answer to parameters that have
                                       already changed, and editing them is the one place where that
                                       stops being visible. Two spellings of one fact would reach the
                                       reader as two facts, one of them with no sentence (#R729).

       ⚠ AND EDITING INVALIDATES WHAT WAS MADE FROM IT. A buffer computed from these rows is no
       longer the answer to its own recipe once a row changes, so every dependent is marked `stale`
       with `input-edited` and the reader re-runs it (js/gis-project.js setParams) — the same
       machinery a changed parameter uses. Doing nothing here would leave outputs that look current
       and were computed from values that no longer exist, which is exactly §4.1's defect.

       ⚠ THE HISTORY DOES NOT SURVIVE A RELOAD, AND THE DECLARATIONS DO (#R749). Both used to be held
       in ONE bag, and therefore had one lifetime, and that made a reload lose the wrong half. An undo
       stack IS keystrokes: js/gis-project.js saves an import as its BODY (`features: rec.features()`),
       so the EDITED VALUES are already in the save, and a saved stack would be a second history of a
       file whose features it no longer matches the moment the reader drops a newer copy. A
       DECLARATION is not of that kind at all — 「この列は人数か、人口密度か」「単位は m か km か」 is
       what the data MEANS, it is the reader's statement about it, and nothing else in the program can
       re-derive it. So the two are held separately (EDITS / DECL) and the save carries the second.
       ⚠ A RESTORED DECLARATION GOES THROUGH THE SAME DOOR AS A NEW ONE (restoreDeclarations →
       declareField). Writing the saved statement straight back into the fields would be the defect
       this block exists against, one reload later: a column that says `number` because somebody once
       said so, over cells that are not numbers. The features may have changed between the save and
       the load; a declaration the data no longer bears out is refused BY NAME and comes back in
       `refused`, which is the reader's to see rather than this file's to hide. */

    /* id → { undo:[entry], redo:[entry] }. Held beside the records rather than on them so that
       describe() — which is what the panel lists and the save file writes — stays the metadata it
       was. ⚠ SESSION ONLY: this is the stack, and the stack is keystrokes (see above). */
    const EDITS = new Map();
    /* id → Map(name → {type, unit, refused, at}). ⚠ A SEPARATE STORE BECAUSE IT HAS A SEPARATE
       LIFETIME, not because it is a different kind of value: this is what the READER declared, it is
       written into the saved project, and it comes back through restoreDeclarations. `at` is part of
       the statement — 「いつそう述べたか」 — and it is carried rather than re-stamped on restore,
       because re-dating it would make every declaration look as though it were made when the project
       was opened.
       ⚠ NOTHING A SOURCE SAID IS HELD HERE. A band's unit arrived WITH the grid (`unitStated:'source'`
       in addRaster) and belongs to the record; a reader's belongs to the reader. The two are told
       apart by WHERE THEY LIVE rather than by a rule at the door, so no later caller can mix them by
       forgetting to ask. */
    const DECL = new Map();
    const EDIT_TYPES = ['number', 'date', 'text'];
    /* undo of an add is a remove and vice versa; a rename and a value edit invert to themselves. */
    const OPPOSITE = { values: 'values', 'add-field': 'remove-field', 'remove-field': 'add-field', 'rename-field': 'rename-field' };

    function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
    function editState(id) {
      let s = EDITS.get(id);
      if (!s) { s = { undo: [], redo: [] }; EDITS.set(id, s); }
      return s;
    }
    function declState(id) {
      let s = DECL.get(id);
      if (!s) { s = new Map(); DECL.set(id, s); }
      return s;
    }
    /* ⚠ THE CODES THIS LAYER CAN ANSWER WITH, DECLARED (#R738). Every refusal here reaches a reader
       through js/gis-panel.js, and tests/r729-gis-core-checks ④ measures that each one has a sentence
       — by SCANNING the sources for the spellings it knows (`why:'…'`, `fail('…')`). These go through
       no(), so the scan found FOUR of the twenty-five and the gate was green over the rest. A scan
       sees the spellings it was taught; a declaration states the fact. no() refusing an undeclared
       code is what stops the two from drifting apart. */
    const REFUSALS = ['no-such-dataset', 'edit-needs-features', 'edit-would-contradict-recipe', 'input-stale',
      'field-not-named', 'unknown-field', 'nothing-declared', 'field-type-unknown', 'field-type-refused',
      'unit-not-a-string', 'no-edits', 'index-not-a-number', 'index-out-of-range', 'value-undefined',
      'field-exists', 'field-in-time-axis', 'field-has-dependents', 'nothing-to-undo', 'nothing-to-redo',
      'edit-not-reversible', 'time-field-not-named', 'time-field-missing', 'time-kind-unknown',
      'time-unreadable', 'time-constant-empty'];
    function no(why, detail) {
      if (REFUSALS.indexOf(why) < 0) throw new Error('gis-datasets: undeclared refusal code ' + why);
      return detail ? { ok: false, why, detail } : { ok: false, why };
    }
    function copy(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return v; } }

    /* The one gate. Every mutating entry point below asks it first, so a new one cannot be written
       that forgets one of the three refusals. */
    function openFor(id) {
      const rec = DS.get(id);
      if (!rec) return no('no-such-dataset', { id: id == null ? null : String(id) });
      if (String(rec.kind || 'vector') !== 'vector') return no('edit-needs-features', { kind: String(rec.kind || '') });
      const prov = rec.provenance || {};
      if (prov.kind === 'op') {
        return no('edit-would-contradict-recipe', {
          id: rec.id, op: prov.op == null ? null : String(prov.op),
          inputs: Array.isArray(prov.inputs) ? prov.inputs.slice() : [],
        });
      }
      if (rec.stale) return no('input-stale', { id: rec.id, why: String(rec.stale.why || '') });
      return { ok: true, rec };
    }

    function columnValues(features, name) {
      return features.map((f) => ((f && f.properties) || {})[name]);
    }

    /* Does the data bear out a declared type? ⚠ `text` always does — every value can be spelt as a
       string, so refusing it would be refusing a claim that cannot be wrong. `number` and `date` are
       asked of the SAME readers the measurement uses (asNumber / asDate), which is why a zero-padded
       column cannot be declared a number: that rule lives in asNumber and is not restated here. */
    function verifyType(type, values) {
      if (type === 'text') return { ok: true, bad: 0, checked: 0, example: null };
      const read = (type === 'number') ? asNumber : asDate;
      let bad = 0, checked = 0, example = null;
      for (const v of values) {
        if (isEmpty(v)) continue;
        checked++;
        if (read(v) == null) { bad++; if (example == null) example = (typeof v === 'string') ? v : String(v); }
      }
      return { ok: bad === 0, bad, checked, example };
    }

    /* Put the reader's declarations back onto the freshly measured fields, and DROP a type
       declaration the data no longer bears out. ⚠ Leaving it would be the defect this file was
       written against: a column that says `number` because somebody once said so, over cells that
       are not numbers. The measured `type` is never overwritten — a reader must be able to see
       「測ると text、読者が number と宣言」 as two facts. */
    function applyDeclarations(rec) {
      const s = DECL.get(rec.id);
      if (!s || !s.size) return;
      const features = rec.features();
      for (const col of rec.fields) {
        const d = s.get(col.name);
        if (!d) continue;
        if (d.unit != null) { col.unit = d.unit; col.unitStated = 'reader'; }
        /* ⚠ A REFUSAL STICKS UNTIL THE READER DECLARES AGAIN. It is held in the declaration state,
           not only written onto the field — `fields` is rebuilt from scratch on every re-measure, so
           a mark that lived only there would vanish on the NEXT edit and the column would quietly
           go back to looking as though nothing had ever been declared about it. */
        if (d.refused) col.typeRefused = copy(d.refused);
        if (!d.type) continue;
        const v = verifyType(d.type, columnValues(features, col.name));
        if (v.ok) { col.typeStated = d.type; col.typeStatedBy = 'reader'; }
        else {
          const r = { type: d.type, bad: v.bad, checked: v.checked, example: v.example };
          col.typeRefused = r;
          s.set(col.name, { type: null, unit: d.unit, refused: r, at: d.at == null ? null : d.at });
        }
      }
    }

    /* ⚠ THE TIME DECLARATION IS RE-VERIFIED AFTER AN EDIT, because it was verified against cells the
       reader has just changed: a column of years edited into 「明治22年」 is no longer a time axis,
       and a track whose parallel array was touched may no longer line up with its positions. The
       verified shape carries the same field names declareTime reads, so it is asked again with
       itself. ⚠ `constant` is skipped — it names no column, so no edit can affect it, and its
       start/end are already milliseconds, which momentOf would refuse as a year. */
    function reverifyTime(rec) {
      const t = rec.time;
      if (!t || t.kind === 'constant') return;
      const again = declareTime(t, rec.features());
      rec.time = again.time;
      rec.timeRefused = again.refused;
    }

    /* Everything the record states about its own contents, measured again. */
    function remeasure(rec) {
      const features = rec.features();
      rec.count = features.length;
      rec.withGeometry = countWithGeometry(features);
      rec.geometryType = geometryKind(features);
      rec.fields = describeFields(features);
      applyDeclarations(rec);
      reverifyTime(rec);
    }

    /* ⚠ THE READER'S HAND IS VISIBLE WITHOUT THE RECIPE CHANGING KIND. An import's provenance stays
       `{kind:'import', …}` — the bytes are still where this data came from, and calling it something
       else would make lineage() and the save file describe an origin that does not exist. What is
       added is the fact that somebody has since changed values in it, which a reader looking at a
       number on a map needs and which nothing else in the record would say. */
    function noteEdit(rec) {
      let prov = rec.provenance;
      if (!prov || typeof prov !== 'object') { prov = { kind: 'unknown' }; rec.provenance = prov; }
      let e = prov.edits;
      if (!e || typeof e !== 'object') { e = { count: 0, lastAt: null }; prov.edits = e; }
      e.count = (typeof e.count === 'number' && isFinite(e.count) ? e.count : 0) + 1;
      e.lastAt = Date.now();
    }

    function cellsOf(payload) {
      if (!payload) return 0;
      if (payload.kind === 'values') return payload.items.length;
      if (payload.kind === 'column-restore') return payload.items.length;
      return 0;
    }

    function moveDeclaration(id, from, to) {
      const s = DECL.get(id);
      if (!s) return;
      const d = s.get(from);
      if (!d) return;
      s.delete(from);
      if (to) s.set(to, d);
    }

    function renameOn(features, from, to) {
      for (const f of features) {
        const p = f && f.properties;
        if (!p || !hasOwn(p, from)) continue;
        p[to] = p[from];
        delete p[from];
      }
    }

    /* ⚠ THE HISTORY IS OPERATIONS, NOT STATES. Applying a payload mutates the features and RETURNS
       the payload that undoes what it just did — so undo and redo are the same code path, the stack
       holds one entry per edit whatever the dataset's size, and nothing here ever copies a feature.
       A cell that did not exist before is restored to not existing (`had`), because creating it with
       `null` would add a column value nobody typed. */
    function applyPayload(rec, p) {
      const features = rec.features();
      if (p.kind === 'values') {
        const back = [];
        for (const it of p.items) {
          const f = features[it.index];
          if (!f) continue;
          if (!f.properties) f.properties = {};
          const had = hasOwn(f.properties, it.field);
          back.push({ index: it.index, field: it.field, had, value: had ? f.properties[it.field] : null });
          if (it.had) f.properties[it.field] = it.value; else delete f.properties[it.field];
        }
        return { kind: 'values', items: back };
      }
      if (p.kind === 'column-remove') {
        const items = [];
        for (let i = 0; i < features.length; i++) {
          const pr = features[i] && features[i].properties;
          if (!pr || !hasOwn(pr, p.name)) continue;
          items.push({ index: i, value: pr[p.name] });
          delete pr[p.name];
        }
        moveDeclaration(rec.id, p.name, null);
        return { kind: 'column-restore', name: p.name, items };
      }
      if (p.kind === 'column-restore') {
        for (const it of p.items) {
          const f = features[it.index];
          if (!f) continue;
          if (!f.properties) f.properties = {};
          f.properties[p.name] = it.value;
        }
        return { kind: 'column-remove', name: p.name };
      }
      if (p.kind === 'column-rename') {
        renameOn(features, p.from, p.to);
        moveDeclaration(rec.id, p.from, p.to);
        return { kind: 'column-rename', from: p.to, to: p.from };
      }
      return null;
    }

    /* One exit for every mutation: record the inverse, re-measure, say so, and mark the things that
       were made from this record as no longer being the answer to their own recipes. */
    function commitEdit(rec, kind, count, undoPayload) {
      const s = editState(rec.id);
      s.undo.push({ at: Date.now(), kind, count, cells: cellsOf(undoPayload), undo: undoPayload });
      /* A new edit ends the redo branch — redoing after it would apply an inverse computed against
         values that no longer exist. */
      s.redo.length = 0;
      remeasure(rec);
      noteEdit(rec);
      emit('edit', rec);
      for (const d of dependents(rec.id)) invalidate(d.id, 'input-edited');
    }

    function fieldNames(rec) { return rec.fields.map((f) => f.name); }
    function hasField(rec, name) { return rec.fields.some((f) => f.name === name); }

    /* Which of the time declaration's columns this name is, or null. ⚠ Removing or renaming one of
       them would leave `time` naming a column that is not there — a declaration about nothing, which
       is the shape §1.5 exists to prevent. Refused rather than quietly rewritten: which column the
       axis should be instead is the reader's statement to make. */
    function timeAxisUse(rec, name) {
      const t = rec.time;
      if (!t) return null;
      for (const k of ['field', 'startField', 'endField', 'timesField', 'elevationField']) {
        if (t[k] && t[k] === name) return k;
      }
      return null;
    }

    function declareField(id, name, spec) {
      const g = openFor(id);
      if (!g.ok) return g;
      const rec = g.rec;
      if (typeof name !== 'string' || name === '') return no('field-not-named');
      if (!hasField(rec, name)) return no('unknown-field', { field: name, fields: fieldNames(rec) });
      const want = (spec && typeof spec === 'object') ? spec : {};
      const hasType = want.type != null, hasUnit = want.unit != null;
      if (!hasType && !hasUnit) return no('nothing-declared', { field: name });

      let type = null;
      if (hasType) {
        type = String(want.type);
        if (EDIT_TYPES.indexOf(type) < 0) return no('field-type-unknown', { field: name, type, types: EDIT_TYPES.slice() });
        /* ⚠ VERIFIED AGAINST THE DATA, WITH THE EVIDENCE IN THE REFUSAL. A declaration stored on the
           caller's word is a claim with no author behind it, and the reader cannot fix what they are
           not shown — so the count of cells that are not of that type, and one of them, come back. */
        const v = verifyType(type, columnValues(rec.features(), name));
        if (!v.ok) return no('field-type-refused', { field: name, type, bad: v.bad, checked: v.checked, example: v.example });
      }

      let unit = null;
      if (hasUnit) {
        if (typeof want.unit !== 'string' && typeof want.unit !== 'number') return no('unit-not-a-string', { field: name });
        unit = String(want.unit).trim();
        if (unit === '') return no('unit-not-a-string', { field: name });
      }

      const s = declState(id);
      const prev = s.get(name) || { type: null, unit: null, refused: null, at: null };
      s.set(name, {
        type: hasType ? type : prev.type,
        unit: hasUnit ? unit : prev.unit,
        /* A type that has just been verified answers the earlier refusal; a unit-only declaration
           says nothing about it and leaves it standing. */
        refused: hasType ? null : (prev.refused || null),
        /* WHEN this was stated. It is part of the statement, which is why it is saved with it and
           why restoreDeclarations puts the SAVED moment back instead of leaving this one. */
        at: Date.now(),
      });
      /* ⚠ NOT AN ENTRY IN THE UNDO STACK, and not a reason to invalidate what was made from this
         record. A declaration changes nothing in the data: js/gis-ops.js compares through asNumber
         whatever a column is called, so no downstream answer moves. Its own inverse is one more call
         to this function, and putting it on the stack would make 「取り消し」 sometimes step back
         over a value and sometimes over a label. */
      const before = rec.fields.find((f) => f.name === name);
      if (before && hasType) { delete before.typeRefused; }
      applyDeclarations(rec);
      emit('edit', rec);
      return { ok: true, field: copy(rec.fields.find((f) => f.name === name)) };
    }

    /* ── 宣言を取り出す扉と、戻す扉（#R749）──────────────────────────────────────────────────
       What the READER declared about this record's columns, in the shape js/gis-project.js writes
       into a saved project: `{ <列名>: {type, unit, at} }`, plus `refused` on a column whose type
       declaration the data did not bear out and the reader has not answered yet.

       ⚠ THE TWO ANSWERS THAT ARE NOT THE SAME ANSWER. `null` is 「そのデータセットが無い」 — there is
       nobody to have declared anything — and `{}` is 「在るが、誰も何も述べていない」. Collapsing them
       would let a caller write 「宣言は無い」 about a record it never found, which is the shape
       「欄が在ることを答えが在ることの代わりにするな」 names.
       ⚠ A SOURCE'S STATEMENT IS NOT IN HERE. A raster band's `unit` came with the grid
       (`unitStated:'source'`); it is part of the record and travels with the record. Only what came
       through declareField is the reader's, and only the reader's is in DECL. */
    function declarations(id) {
      if (!DS.has(id)) return null;
      const s = DECL.get(id);
      const out = {};
      if (!s) return out;
      for (const [name, d] of s) {
        const e = {
          type: d.type == null ? null : String(d.type),
          unit: d.unit == null ? null : String(d.unit),
          at: (typeof d.at === 'number' && isFinite(d.at)) ? d.at : null,
        };
        if (d.refused) e.refused = copy(d.refused);
        out[name] = e;
      }
      return out;
    }

    /* Put saved declarations back. ⚠ THROUGH declareField, NOT INTO THE STORE. A reload is the one
       moment when 「読者が述べたこと」 and 「データが述べていること」 can have drifted apart: the
       reader may have dropped a newer file under the same project, a column may be gone, a column of
       numbers may now hold 「明治22年」. Copying the saved statement in would restore a `number` that
       is not a number and would be exactly the claim-with-no-author this file refuses everywhere
       else. Each column is re-verified against the features that actually arrived, and the ones that
       no longer hold come back NAMED in `refused` — the reader decides, not this file.
       ⚠ `ok` IS ABOUT THE CALL, NOT ABOUT THE COLUMNS. Every ok:false out of this file carries a
       `why`; a partly-restorable set has no single one, so the per-column reasons are the answer and
       `applied` is how many were re-declared. */
    function restoreDeclarations(id, decls) {
      const g = openFor(id);
      if (!g.ok) return g;
      /* Not an object = nothing was handed over that could be a declaration. Told with the same code
         a declaration with neither type nor unit gets, because it is the same fact. */
      if (decls == null || typeof decls !== 'object') return no('nothing-declared', { id: String(id) });
      const refused = [];
      let applied = 0;
      for (const name of Object.keys(decls)) {
        const d = decls[name];
        if (!d || typeof d !== 'object') { refused.push({ field: name, why: 'nothing-declared', detail: { field: name } }); continue; }
        const spec = {};
        if (d.type != null) spec.type = d.type;
        if (d.unit != null) spec.unit = d.unit;
        if (spec.type == null && spec.unit == null) { refused.push({ field: name, why: 'nothing-declared', detail: { field: name } }); continue; }
        const r = declareField(id, name, spec);
        if (!r.ok) { refused.push(r.detail ? { field: name, why: r.why, detail: r.detail } : { field: name, why: r.why }); continue; }
        applied++;
        /* ⚠ WHEN IT WAS SAID IS PART OF WHAT WAS SAID. declareField stamps `now`, which is right for
           a declaration being made and wrong for one being restored: left alone it would re-date
           every statement in the project to the moment the reader opened it. A saved record with no
           moment in it stays without one — null is 「いつとは述べられていない」. */
        const cur = declState(id).get(name);
        if (cur) cur.at = (typeof d.at === 'number' && isFinite(d.at)) ? d.at : null;
      }
      return { ok: true, applied, refused };
    }

    function editValues(id, edits) {
      const g = openFor(id);
      if (!g.ok) return g;
      const rec = g.rec, features = rec.features();
      if (!Array.isArray(edits) || !edits.length) return no('no-edits');

      /* ⚠ EVERY EDIT IS CHECKED BEFORE ANY IS APPLIED. A batch that stops halfway leaves the record
         in a state the reader did not ask for and the undo stack does not describe. */
      const plan = [];
      for (const e of edits) {
        const idx = (e && typeof e.index === 'number' && Number.isInteger(e.index)) ? e.index : null;
        if (idx == null) return no('index-not-a-number', { index: (e && e.index) == null ? null : String(e.index) });
        if (idx < 0 || idx >= features.length) return no('index-out-of-range', { index: idx, count: features.length });
        const field = e.field;
        if (typeof field !== 'string' || field === '') return no('field-not-named');
        /* ⚠ AN UNKNOWN COLUMN IS NOT CREATED HERE. addField is how a column comes into existence,
           on every row at once; writing one cell of a name nobody declared would make a column that
           exists for one feature and is empty for the rest, without the reader asking for it. */
        if (!hasField(rec, field)) return no('unknown-field', { field, fields: fieldNames(rec) });
        if (typeof e.value === 'undefined') return no('value-undefined', { index: idx, field });
        plan.push({ index: idx, field, value: e.value });
      }

      const back = [];
      for (const p of plan) {
        const f = features[p.index];
        if (!f.properties) f.properties = {};
        const had = hasOwn(f.properties, p.field);
        back.push({ index: p.index, field: p.field, had, value: had ? f.properties[p.field] : null });
        f.properties[p.field] = p.value;
      }
      commitEdit(rec, 'values', plan.length, { kind: 'values', items: back });
      return { ok: true, changed: plan.length, fields: copy(rec.fields) };
    }

    function addField(id, name, value) {
      const g = openFor(id);
      if (!g.ok) return g;
      const rec = g.rec;
      if (typeof name !== 'string' || name === '') return no('field-not-named');
      if (hasField(rec, name)) return no('field-exists', { field: name });
      if (typeof value === 'undefined') value = null;
      const features = rec.features();
      for (const f of features) {
        if (!f) continue;
        if (!f.properties) f.properties = {};
        f.properties[name] = value;
      }
      commitEdit(rec, 'add-field', features.length, { kind: 'column-remove', name });
      return { ok: true, field: copy(rec.fields.find((f) => f.name === name)) };
    }

    function removeField(id, name) {
      const g = openFor(id);
      if (!g.ok) return g;
      const rec = g.rec;
      if (typeof name !== 'string' || name === '') return no('field-not-named');
      if (!hasField(rec, name)) return no('unknown-field', { field: name, fields: fieldNames(rec) });
      const axis = timeAxisUse(rec, name);
      if (axis) return no('field-in-time-axis', { field: name, role: axis, kind: rec.time.kind });
      /* ⚠ SOMETHING DOWNSTREAM MAY BE READING THIS COLUMN, AND THIS FILE CANNOT TELL. A recipe's
         params hold column names (aggregate's `field`, dissolve's `by`, filter's `where`), but the
         answer 「この列は使われていない」 would have to be true for every op that exists TODAY and
         for the next one — a list this file would have to keep, which is the case-by-case shape
         .agents/rules/no-ad-hoc-hardcoding.md forbids. Marking the dependents `stale` would be worse
         than refusing: a re-run of a step whose column is gone does not produce a stale answer, it
         produces a refusal the reader meets later, with the column already unrecoverable if they
         have closed the session. So a column with dependents is not removed, and the reader is told
         what is in the way — deleting those steps is a decision they can still make. */
      const deps = dependents(id);
      if (deps.length) return no('field-has-dependents', { field: name, dependents: deps.map((d) => d.id) });
      const undoPayload = applyPayload(rec, { kind: 'column-remove', name });
      commitEdit(rec, 'remove-field', undoPayload.items.length, undoPayload);
      return { ok: true, removed: undoPayload.items.length };
    }

    function renameField(id, from, to) {
      const g = openFor(id);
      if (!g.ok) return g;
      const rec = g.rec;
      if (typeof from !== 'string' || from === '' || typeof to !== 'string' || to === '') return no('field-not-named');
      if (!hasField(rec, from)) return no('unknown-field', { field: from, fields: fieldNames(rec) });
      if (from === to) return no('nothing-declared', { field: from });
      if (hasField(rec, to)) return no('field-exists', { field: to });
      /* Same two guards as removeField, and for the same reason: from the outside, a rename IS a
         removal of that name. */
      const axis = timeAxisUse(rec, from);
      if (axis) return no('field-in-time-axis', { field: from, role: axis, kind: rec.time.kind });
      const deps = dependents(id);
      if (deps.length) return no('field-has-dependents', { field: from, dependents: deps.map((d) => d.id) });
      const undoPayload = applyPayload(rec, { kind: 'column-rename', from, to });
      commitEdit(rec, 'rename-field', 1, undoPayload);
      return { ok: true, from, to };
    }

    function step(id, fromKey, toKey) {
      const g = openFor(id);
      if (!g.ok) return g;
      const s = editState(id);
      if (!s[fromKey].length) return no(fromKey === 'undo' ? 'nothing-to-undo' : 'nothing-to-redo');
      const e = s[fromKey].pop();
      const back = applyPayload(g.rec, e.undo);
      if (!back) return no('edit-not-reversible', { kind: e.kind });
      s[toKey].push({ at: Date.now(), kind: OPPOSITE[e.kind] || e.kind, count: e.count, cells: cellsOf(back), undo: back });
      remeasure(g.rec);
      noteEdit(g.rec);
      emit('edit', g.rec);
      for (const d of dependents(g.rec.id)) invalidate(d.id, 'input-edited');
      return { ok: true, applied: e.kind, undo: s.undo.length, redo: s.redo.length };
    }

    /* What is on the stacks, and HOW MUCH IS ACTUALLY HELD. ⚠ `bytes` is measured, not asserted:
       the claim 「取り消しはスナップショットを積まない」 is only checkable if the size of the log can
       be compared against the size of one copy of the features, which is what
       tests/r737-gis-edits-checks does. It is serialised on demand — the log is small by
       construction, and a number carried on the record would be a second thing to keep correct. */
    function history(id) {
      const s = EDITS.get(id);
      if (!s) return { undo: 0, redo: 0, bytes: 0, entries: [] };
      let bytes = null;
      try { bytes = JSON.stringify({ u: s.undo.map((e) => e.undo), r: s.redo.map((e) => e.undo) }).length; } catch (_) { bytes = null; }
      return {
        undo: s.undo.length,
        redo: s.redo.length,
        bytes,
        entries: s.undo.map((e) => ({ at: e.at, kind: e.kind, count: e.count, cells: e.cells })),
      };
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
      typeColumn, describeFields, geometryKind, countWithGeometry, asNumber, asDate, isEmpty,
      /* (#R738) 属性の編集。⚠ `editable` is the gate the five mutating doors already ask; it is
         exposed so a panel can DISABLE the control instead of offering an edit that will be refused,
         and so that the reason (an op's output, a grid, a stale record) is the same sentence in both
         places. */
      editable: (id) => { const g = openFor(id); return g.ok ? { ok: true } : g; },
      declareField, editValues, addField, removeField, renameField, history,
      /* (#R749) 宣言は取り消し履歴と寿命が違う。js/gis-project.js writes declarations() into the save
         and hands it back to restoreDeclarations() on load; the history is not saved at all. */
      declarations, restoreDeclarations,
      undo: (id) => step(id, 'undo', 'redo'),
      redo: (id) => step(id, 'redo', 'undo'),
      /* The one reader of a `time` declaration (#R735): js/gis-ops.js asks it rather than carrying a
         second interpretation of the four shapes, and the checks measure the same answer the ops use. */
      timeSpan, momentOf, positionCount,
    };
    try { window.IntMapData = API; } catch (_) { }
    return API;
  })();
}
