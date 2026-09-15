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
 *      { id, title, kind:'vector', geometryType, crs, sourceCrs, fields[], count,
 *        features(), provenance, createdAt }
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

    function asNumber(v) {
      if (typeof v === 'number') return isFinite(v) ? v : null;
      if (typeof v !== 'string') return null;
      const s = v.trim().replace(/ /g, '');
      if (s === '') return null;
      /* A number is the whole cell or it is not a number. "12 km" is text: parseFloat would call it
         12 and the column would start pretending it can be summed. */
      if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
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

    /* Walk the values of one column once and say what it is, with the evidence next to the verdict. */
    function typeColumn(name, values) {
      let empty = 0, nums = 0, dates = 0, total = 0;
      let min = null, max = null;
      for (const v of values) {
        total++;
        if (isEmpty(v)) { empty++; continue; }
        const n = asNumber(v);
        if (n != null) { nums++; if (min == null || n < min) min = n; if (max == null || n > max) max = n; }
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

    /* ── registration ───────────────────────────────────────────────────────────────────────── */

    /* One door for every origin. `features` is an array; it is held and handed back by features().
       Nothing here samples or truncates — a dataset that quietly holds fewer rows than it says it
       has would make every count downstream a lie. */
    function add(spec) {
      const features = Array.isArray(spec && spec.features) ? spec.features : [];
      const id = (spec && spec.id) || ('ds-' + (++seq));
      if (DS.has(id)) throw new Error('dataset id already registered: ' + id);
      const rec = {
        id,
        title: String((spec && spec.title) || id),
        kind: 'vector',
        crs: 'EPSG:4326',
        sourceCrs: (spec && spec.sourceCrs) || null,
        geometryType: geometryKind(features),
        fields: describeFields(features),
        count: features.length,
        provenance: (spec && spec.provenance) || { kind: 'unknown' },
        createdAt: (spec && spec.createdAt) || Date.now(),
        features: () => features,
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
      for (const k of Object.keys(r)) if (k !== 'features') out[k] = r[k];
      return JSON.parse(JSON.stringify(out));
    }

    const API = {
      add, remove, dependents, lineage, describe,
      get: (id) => DS.get(id) || null,
      list: () => Array.from(DS.values()),
      ids: () => Array.from(DS.keys()),
      has: (id) => DS.has(id),
      clear: () => { for (const id of Array.from(DS.keys())) remove(id); seq = 0; },
      subscribe: (fn) => { if (typeof fn === 'function') subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
      /* exposed because js/gis-ops.js must type the columns of its OWN output the same way an import
         is typed — two typing rules would drift, and the drift would show up as a column that can be
         compared in one panel and not in the other */
      typeColumn, describeFields, geometryKind, asNumber, asDate, isEmpty,
    };
    try { window.IntMapData = API; } catch (_) { }
    return API;
  })();
}
