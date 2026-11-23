/* ============================================================================
 *  IntMap · THE SEMANTIC LAYER — window.IntMapGisSemantics   (gis-semantic-layer)
 * ----------------------------------------------------------------------------
 *  「その列・その指標は現実で何を意味し、どのデータと比べてよいのか」を機械が読める形で持つ。
 *
 *  Five modules each held a piece of the answer and none could be asked the whole of it:
 *    js/gis-datasets.js   the column's TYPE (measured), its unit and its `quantity`, the dataset's `time`
 *    js/gis-units.js      whether two quantities are the same measurement, and which aggregation is honest
 *    js/data-governance.js  where it came from, on what terms, how old it is
 *    js/gis-project.js    the recipe an output came from (provenance.inputs / op / params)
 *    the world objects    which entity a row is about
 *  What nothing stated: 「これは行政区域の統計か、都市圏か、半径 5 km の円か」「その年は観測の年か、対象の
 *  年か、発表の年か」「この人口は『当時の国境』か『いまの国境』で数えた系列か」「この列は施設 ID で結べるのか」.
 *  The audit's own example is the one this file exists for: a population series counted inside TODAY'S
 *  borders (Maddison) joined onto the borders OF THE YEAR it describes — every gate green, the answer
 *  about a country that did not exist (dev-notes/2026-11-19-spatiotemporal-1914.md).
 *
 *  ══ THE FACETS ════════════════════════════════════════════════════════════════════════════════
 *      definition      what the measure IS, in words (declared; nothing can verify it)
 *      scope           what a row is a measurement OF: admin-area / metro / radius / grid-cell / point / global
 *      time            four different dates: observed / target / published / acquired — and `valid`, the
 *                      registry's verified time declaration, which is a fifth thing
 *      granularity     spatial (geometry kind, cell size) and temporal (cadence)
 *      aggregation     per column: sum / mean / weighted — the unit kernel's verdicts, or a declared rule
 *      keys            per column: which identifier a join may use (facility-id / company-id / iso3 / …)
 *      basis           the borders the numbers were COUNTED in: present-day / as-of-time / unstated
 *      terms           licence and attribution — governance.read, never a copy
 *      constraints     codes stating what the data may NOT be compared with
 *
 *  ⚠ EACH FACET HAS A STATE, AND SILENCE IS ITS OWN STATE. `stated` (a person or a file said it),
 *  `derived` (read off the record, the recipe or the governance vocabulary — with `from` naming where),
 *  `unstated`. 「述べていない」 is never read as 「問題ない」 and never filled with a guess: the same rule
 *  js/gis-units.js ⑵ keeps, and the one that keeps this from becoming a table of opinions.
 *
 *  ⚠ NOTHING IS WRITTEN HERE THAT A RECORD CAN STATE. There is no table of datasets, countries, or
 *  columns in this file (.agents/rules/no-ad-hoc-hardcoding.md §2-4). What can be derived is derived:
 *  a buffer's radius from its recipe, a grid's cell size from its grid, the licence from governance,
 *  the basis through the lineage (an output of a present-day input is present-day until something says
 *  otherwise), join-key candidates from the column typing's own evidence. What cannot — what a
 *  measure MEANS — is DECLARED by whoever supplies the data, through declare() or `provenance.semantics`.
 *
 *  ⚠ A CHECK WARNS; IT DOES NOT REFUSE. check() returns warnings for the step Atlas is about to run and
 *  changes no result, so no saved recipe replays differently and this file is not an engine kernel
 *  (scripts/gis-kernel-versions.mjs NOT_A_KERNEL). A caller that wants refusal passes strict:true and gets
 *  one — a decision of the caller's, made knowingly.
 *
 *  ⚠ NO DOM, NO fetch. The registry, the unit kernel and the governance vocabulary are read from the scope
 *  at CALL time, the way every kernel in this layer reads its neighbours.
 * ========================================================================== */

/* ⚠ ONE EXPORTED TOP-LEVEL BINDING, AND THE WHOLE FILE INSIDE IT (tests/layer-boot-graph-checks.test.mjs
   #R175 ③ — the same shape js/data-governance.js and js/gis-core.js hold). */
export function makeGisSemantics() {
  return (function () {

    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
    const str = (v) => (v == null ? null : (String(v).trim() === '' ? null : String(v).trim()));
    const scopeOf = () => (typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {}));
    const reg = () => { try { return scopeOf().IntMapData || null; } catch (_) { return null; } };
    const unitsK = () => { try { return scopeOf().IntMapGisUnits || null; } catch (_) { return null; } };
    const govK = () => { try { return scopeOf().IntMapDataGovernance || null; } catch (_) { return null; } };

    /* ── the vocabulary ─────────────────────────────────────────────────────────────────────────
       Published (vocabulary()) so that the one who declares and the one who reads use the same list,
       the way js/gis-units.js publishes quantityVocabulary(). The words are CLASSES of thing, not
       instances: no country, source or column is named. */
    const SCOPE_KINDS = ['admin-area', 'metro-area', 'radius', 'grid-cell', 'point', 'facility', 'company', 'global', 'route', 'other'];
    const BASES = ['present-day', 'as-of-time'];
    const TIME_MEANINGS = ['observed', 'target', 'published', 'acquired'];
    const KEY_KINDS = ['facility-id', 'company-id', 'country-code', 'admin-code', 'polity-id', 'wikidata-qid', 'station-id', 'row-position', 'other'];
    const COLUMN_FIELDS = ['definition', 'keyKind', 'aggregation', 'basis', 'timeMeaning', 'comparableOnlyWith', 'notComparableWith'];
    const DATASET_FIELDS = ['definition', 'scope', 'basis', 'timeMeaning', 'cadence', 'constraints', 'columns'];
    const AGG_RULES = ['sum', 'mean', 'weightedMean', 'areaWeightedMean', 'min', 'max', 'median', 'majority', 'none'];
    const SEVERITIES = ['caution', 'note'];

    /* ── the declarations ───────────────────────────────────────────────────────────────────────
       Held beside the registry, not inside it: the registry's own contract (a measured record) has
       no place for a claim that cannot be measured, and putting a free-text field into every record
       would give every reader a field nobody verifies. A supplier states one here, or in
       `provenance.semantics` of the record it registers (read by declared()). */
    const DECL = new Map();

    const refuse = (why, detail) => ({ ok: false, why, detail: detail || {} });

    function oneOf(v, list) { return list.indexOf(v) >= 0; }

    function checkTimeMeaning(tm, where) {
      if (tm == null) return null;
      if (!isObj(tm)) return refuse('semantics-time-meaning-not-an-object', { where });
      for (const k of Object.keys(tm)) {
        if (!oneOf(k, TIME_MEANINGS)) return refuse('semantics-time-meaning-unknown', { where, key: k, known: TIME_MEANINGS.slice() });
        if (str(tm[k]) == null) return refuse('semantics-time-meaning-empty', { where, key: k });
      }
      return null;
    }

    /* Validates the SHAPE of a declaration (unknown keys are refused by name, with the vocabulary —
       the way every refusal in js/gis-ops.js names what it wanted). It cannot validate the CLAIM,
       except where the registry can be asked: a column named here must exist. */
    function validate(spec, rec) {
      if (!isObj(spec)) return refuse('semantics-not-an-object');
      for (const k of Object.keys(spec)) {
        if (!oneOf(k, DATASET_FIELDS)) return refuse('semantics-field-unknown', { key: k, known: DATASET_FIELDS.slice() });
      }
      if (spec.scope != null) {
        const sc = isObj(spec.scope) ? spec.scope : { kind: spec.scope };
        if (!oneOf(str(sc.kind), SCOPE_KINDS)) return refuse('semantics-scope-unknown', { scope: sc.kind, known: SCOPE_KINDS.slice() });
      }
      if (spec.basis != null && !oneOf(str(spec.basis), BASES)) return refuse('semantics-basis-unknown', { basis: spec.basis, known: BASES.slice() });
      const t0 = checkTimeMeaning(spec.timeMeaning, 'dataset'); if (t0) return t0;
      if (spec.constraints != null && !(Array.isArray(spec.constraints) && spec.constraints.every((c) => str(c) != null))) {
        return refuse('semantics-constraints-not-a-list');
      }
      if (spec.columns != null) {
        if (!isObj(spec.columns)) return refuse('semantics-columns-not-an-object');
        const have = rec ? (rec.fields || []).map((f) => f.name) : null;
        for (const name of Object.keys(spec.columns)) {
          if (have && have.indexOf(name) < 0) return refuse('unknown-field', { field: name, fields: have });
          const c = spec.columns[name];
          if (!isObj(c)) return refuse('semantics-column-not-an-object', { field: name });
          for (const k of Object.keys(c)) {
            if (!oneOf(k, COLUMN_FIELDS)) return refuse('semantics-field-unknown', { field: name, key: k, known: COLUMN_FIELDS.slice() });
          }
          if (c.keyKind != null && !oneOf(str(c.keyKind), KEY_KINDS)) return refuse('semantics-key-kind-unknown', { field: name, keyKind: c.keyKind, known: KEY_KINDS.slice() });
          if (c.aggregation != null && !oneOf(str(c.aggregation), AGG_RULES)) return refuse('semantics-aggregation-unknown', { field: name, aggregation: c.aggregation, known: AGG_RULES.slice() });
          if (c.basis != null && !oneOf(str(c.basis), BASES)) return refuse('semantics-basis-unknown', { field: name, basis: c.basis, known: BASES.slice() });
          const t1 = checkTimeMeaning(c.timeMeaning, name); if (t1) return t1;
        }
      }
      return null;
    }

    function declare(id, spec) {
      const R = reg();
      const rec = R && R.get ? R.get(id) : null;
      if (!rec) return refuse('dataset-missing', { id });
      const bad = validate(spec, rec);
      if (bad) return bad;
      DECL.set(id, JSON.parse(JSON.stringify(spec)));
      return { ok: true, id };
    }

    /* What a record's supplier stated: the side store first (a reader or Atlas declared it on THIS
       session), then `provenance.semantics` (a loader stated it at registration). A malformed one
       is not used and is reported, never half-applied. */
    function declared(rec) {
      if (!rec) return { spec: null, from: null, refused: null };
      if (DECL.has(rec.id)) return { spec: DECL.get(rec.id), from: 'declared', refused: null };
      const p = rec.provenance && rec.provenance.semantics;
      if (p != null) {
        const bad = validate(p, rec);
        if (bad) return { spec: null, from: null, refused: bad };
        return { spec: p, from: 'provenance', refused: null };
      }
      return { spec: null, from: null, refused: null };
    }

    /* ── derivation ─────────────────────────────────────────────────────────────────────────────── */

    const stated = (value, from) => ({ state: 'stated', value, from });
    const derived = (value, from) => ({ state: 'derived', value, from });
    const unstated = () => ({ state: 'unstated', value: null, from: null });

    /* The recipe's ancestors, nearest first, each once. The lineage is `provenance.inputs`, which a
       registry record carries for every op output (js/gis-ops.js), so no new bookkeeping exists. */
    function lineage(rec, seen) {
      const R = reg();
      const out = [];
      const visited = seen || new Set();
      const walk = (r) => {
        const ins = (r && r.provenance && Array.isArray(r.provenance.inputs)) ? r.provenance.inputs : [];
        for (const id of ins) {
          if (visited.has(id)) continue;
          visited.add(id);
          const a = R && R.get ? R.get(id) : null;
          if (a) { out.push(a); walk(a); }
        }
      };
      visited.add(rec && rec.id);
      walk(rec);
      return out;
    }

    function scopeFacet(rec, d) {
      if (d.spec && d.spec.scope != null) {
        const sc = isObj(d.spec.scope) ? d.spec.scope : { kind: d.spec.scope };
        return stated({ kind: str(sc.kind), detail: sc.detail != null ? sc.detail : null }, d.from);
      }
      const prov = rec.provenance || {};
      /* A buffer is a circle by its own recipe: the radius is what was asked, not a guess. */
      if (prov.kind === 'op' && prov.op === 'buffer' && isObj(prov.params) && Number.isFinite(prov.params.radiusKm) && prov.params.radiusKm > 0) {
        return derived({ kind: 'radius', detail: { radiusKm: prov.params.radiusKm } }, 'recipe:buffer');
      }
      if (rec.kind === 'raster' && rec.grid) {
        return derived({ kind: 'grid-cell', detail: { pixelKmLat: Number.isFinite(rec.grid.pixelLat) ? rec.grid.pixelLat * 111.32 : null } }, 'grid');
      }
      if (rec.geometryType === 'Point') return derived({ kind: 'point', detail: null }, 'geometry');
      return unstated();
    }

    /* The borders the numbers were counted in. Declared on the dataset or on a column; otherwise read
       through the lineage — an output of a present-day input stays present-day until something says
       otherwise, because the op moved the shapes and not the counting. */
    function basisFacet(rec, d, colName) {
      if (colName && d.spec && d.spec.columns && d.spec.columns[colName] && d.spec.columns[colName].basis != null) {
        return stated(str(d.spec.columns[colName].basis), d.from);
      }
      if (d.spec && d.spec.basis != null) return stated(str(d.spec.basis), d.from);
      for (const a of lineage(rec)) {
        const ad = declared(a);
        if (colName && ad.spec && ad.spec.columns && ad.spec.columns[colName] && ad.spec.columns[colName].basis != null) {
          return derived(str(ad.spec.columns[colName].basis), 'lineage:' + a.id);
        }
        if (ad.spec && ad.spec.basis != null) return derived(str(ad.spec.basis), 'lineage:' + a.id);
      }
      return unstated();
    }

    function timeFacet(rec, d) {
      const tm = (d.spec && d.spec.timeMeaning) || {};
      const prov = rec.provenance || {};
      const out = { valid: rec.time ? derived(rec.time, 'registry') : unstated() };
      for (const k of TIME_MEANINGS) {
        if (str(tm[k]) != null) out[k] = stated(str(tm[k]), d.from);
        else out[k] = unstated();
      }
      /* The recording / retrieval instant IS stated by the registry and the recipe — they are the
         `acquired` and `recorded` axes, different from the validity of the data itself. */
      const at = prov.recordedAt || prov.readAt || prov.at || prov.retrievedAt;
      if (out.acquired.state === 'unstated' && at != null) out.acquired = derived(String(at), 'provenance');
      if (rec.timeRefused) out.refused = rec.timeRefused;
      return out;
    }

    function granularityFacet(rec, d) {
      const g = { spatial: { geometryType: rec.geometryType || null, rows: rec.count == null ? null : rec.count, withGeometry: rec.withGeometry == null ? null : rec.withGeometry } };
      if (rec.kind === 'raster' && rec.grid) g.spatial.grid = rec.grid;
      g.temporal = (d.spec && str(d.spec.cadence) != null) ? stated(str(d.spec.cadence), d.from)
        : (rec.time && rec.time.kind ? derived(rec.time.kind, 'registry') : unstated());
      return g;
    }

    function termsFacet(rec) {
      const G = govK();
      if (!G || typeof G.read !== 'function') return { state: 'unstated', value: null, from: null };
      let r = null;
      try { r = G.read(rec.provenance || {}); } catch (_) { r = null; }
      if (!r) return unstated();
      const t = { publisher: r.publisher || null, url: r.url || null, licence: r.licence || null, credit: r.credit || null, creditRequired: r.creditRequired == null ? null : r.creditRequired };
      const any = t.publisher || t.url || t.licence || t.credit;
      return any ? derived(t, 'governance') : unstated();
    }

    function columnFacet(rec, d, f) {
      const dc = (d.spec && d.spec.columns && d.spec.columns[f.name]) || {};
      const U = unitsK();
      const col = {
        name: f.name, type: f.type || null,
        unit: f.unit != null ? { state: 'stated', value: f.unit, from: f.unitStated || 'record' } : unstated(),
        definition: str(dc.definition) != null ? stated(str(dc.definition), d.from) : unstated(),
        quantity: f.quantity != null ? stated(f.quantity, f.quantityStated || 'record') : unstated(),
        basis: basisFacet(rec, d, f.name),
        timeMeaning: dc.timeMeaning ? stated(dc.timeMeaning, d.from) : unstated(),
        keyKind: unstated(),
        aggregation: unstated(),
      };
      if (str(dc.keyKind) != null) col.keyKind = stated(str(dc.keyKind), d.from);
      else if (f.padded > 0) {
        /* Evidence, not a verdict: the registry measured zero-padded numerals here, which is how a code
           is written (js/gis-datasets.js numberRule). It says THIS COLUMN LOOKS LIKE A CODE and says
           nothing of WHICH coding system — the kind stays unstated. */
        col.keyKind = derived({ kind: null, looksLikeCode: true, padded: f.padded }, 'column-typing');
      }
      if (str(dc.aggregation) != null) col.aggregation = stated(str(dc.aggregation), d.from);
      else if (f.quantity != null && U && typeof U.aggregations === 'function') {
        const verdicts = U.aggregations(f.quantity);
        const allowed = Object.keys(verdicts).filter((m) => verdicts[m].verdict === 'allowed');
        col.aggregation = derived({ allowed, verdicts: Object.fromEntries(Object.keys(verdicts).map((m) => [m, verdicts[m].verdict])) }, 'units');
      }
      if (dc.comparableOnlyWith != null) col.comparableOnlyWith = dc.comparableOnlyWith;
      if (dc.notComparableWith != null) col.notComparableWith = dc.notComparableWith;
      return col;
    }

    /* describe(id) — the whole semantic record of one dataset, every facet with its state. */
    function describe(id) {
      const R = reg();
      const rec = R && R.get ? R.get(id) : null;
      if (!rec) return refuse('dataset-missing', { id });
      const d = declared(rec);
      const cols = (rec.fields || []).filter((f) => f && f.name).map((f) => columnFacet(rec, d, f));
      const unstatedFacets = [];
      const sc = scopeFacet(rec, d), bs = basisFacet(rec, d, null), tf = timeFacet(rec, d);
      if (sc.state === 'unstated') unstatedFacets.push('scope');
      if (bs.state === 'unstated') unstatedFacets.push('basis');
      if (tf.valid.state === 'unstated') unstatedFacets.push('time.valid');
      for (const k of TIME_MEANINGS) if (tf[k].state === 'unstated' && k !== 'acquired') unstatedFacets.push('time.' + k);
      return {
        ok: true, id: rec.id, title: rec.title,
        definition: d.spec && str(d.spec.definition) != null ? stated(str(d.spec.definition), d.from) : unstated(),
        scope: sc, basis: bs, time: tf,
        granularity: granularityFacet(rec, d),
        terms: termsFacet(rec),
        columns: cols,
        constraints: d.spec && Array.isArray(d.spec.constraints) ? stated(d.spec.constraints.slice(), d.from) : unstated(),
        lineage: lineage(rec).map((a) => a.id),
        declaredBy: d.from, declarationRefused: d.refused,
        /* What nobody has said. A planner reading this knows which comparisons it is making blind. */
        unstated: unstatedFacets,
      };
    }

    /* ── the checks ─────────────────────────────────────────────────────────────────────────────── */

    const W = (code, severity, en, jp, detail) => ({ code, severity, message: { en, jp }, detail: detail || {} });

    function span(rec) {
      const t = rec && rec.time;
      if (!t || t.kind !== 'constant' || !Number.isFinite(t.start) || !Number.isFinite(t.end)) return null;
      return { start: t.start, end: t.end };
    }
    const yearOf = (ms) => { const d = new Date(ms); return d.getUTCFullYear(); };

    /* Two datasets about the same place at different times: the join runs and the answer is about
       nothing. Only the registry's VERIFIED `time` is compared — a meaning nobody stated is not
       invented into one. */
    function timeWarnings(a, b, ids) {
      const out = [];
      const sa = span(a), sb = span(b);
      if (sa && sb && (sa.end < sb.start || sb.end < sa.start)) {
        out.push(W('time-periods-disjoint', 'caution',
          'The two datasets describe periods that do not overlap (' + yearOf(sa.start) + '–' + yearOf(sa.end) + ' and ' + yearOf(sb.start) + '–' + yearOf(sb.end) + ').',
          '2 つのデータの有効期間が重なりません（' + yearOf(sa.start) + '–' + yearOf(sa.end) + ' と ' + yearOf(sb.start) + '–' + yearOf(sb.end) + '）。',
          { inputs: ids, a: sa, b: sb }));
      }
      return out;
    }

    /* The Maddison case, stated as a rule over the FACTS rather than over a name: one side's numbers
       were counted inside today's borders; the other side's shapes belong to a stated past period. The
       join keys agree and the meaning does not. */
    function basisWarnings(da, db, a, b, ids, cols) {
      const out = [];
      const sides = [[da, db, a, b, 0, 1], [db, da, b, a, 1, 0]];
      const consider = (stmt) => stmt && stmt.state !== 'unstated';
      for (const [x, y, rx, ry, ix, iy] of sides) {
        const bx = (cols && cols[ix] && cols[ix].basis) ? cols[ix].basis : x.basis;
        const by = y.basis;
        const hist = span(ry);
        if (consider(bx) && bx.value === 'present-day' && hist && yearOf(hist.end) < new Date().getUTCFullYear() - 1 && !(consider(by) && by.value === 'present-day')) {
          out.push(W('present-day-basis-on-historical-shapes', 'caution',
            'Dataset ' + ids[ix] + ' counts inside present-day borders, but ' + ids[iy] + ' is a shape set for ' + yearOf(hist.start) + '–' + yearOf(hist.end)
            + ': the values are about today\'s territory, not the territory drawn for that period.',
            'データ ' + ids[ix] + ' は現在の国境の内側で数えた値ですが、' + ids[iy] + ' は ' + yearOf(hist.start) + '–' + yearOf(hist.end) + ' 年の形です。値は当時ではなく現在の領域についてのものです。',
            { inputs: ids, countedIn: ix, shapesOf: iy, period: hist }));
        }
      }
      if (consider(da.basis) && consider(db.basis) && da.basis.value !== db.basis.value) {
        out.push(W('basis-differs', 'caution',
          'The two datasets count in different borders (' + da.basis.value + ' vs ' + db.basis.value + ').',
          '2 つのデータは数える境界が違います（' + da.basis.value + ' と ' + db.basis.value + '）。', { inputs: ids }));
      }
      return out;
    }

    function scopeWarnings(da, db, ids) {
      const out = [];
      if (da.scope.state !== 'unstated' && db.scope.state !== 'unstated' && da.scope.value.kind !== db.scope.value.kind) {
        out.push(W('scope-differs', 'note',
          'The rows describe different kinds of thing (' + da.scope.value.kind + ' vs ' + db.scope.value.kind + ').',
          '行が表す対象の種類が違います（' + da.scope.value.kind + ' と ' + db.scope.value.kind + '）。', { inputs: ids }));
      }
      return out;
    }

    function colOf(d, name) { return d.columns.find((c) => c.name === name) || null; }

    /* A join key must be the SAME identifier in both files. Two declared kinds that differ is a fact;
       a column the typing measured as code-like and nobody labelled is a note, not an accusation. */
    function keyWarnings(da, db, leftField, rightField, ids) {
      const out = [];
      const l = leftField ? colOf(da, leftField) : null, r = rightField ? colOf(db, rightField) : null;
      if (!l || !r) return out;
      const kl = l.keyKind, kr = r.keyKind;
      const sk = (k) => (k.state !== 'unstated' && k.value) ? (typeof k.value === 'string' ? k.value : (k.value.kind || null)) : null;
      const a = sk(kl), b = sk(kr);
      if (a && b && a !== b) {
        out.push(W('join-key-kinds-differ', 'caution',
          'The join keys are different identifiers (' + leftField + ': ' + a + ', ' + rightField + ': ' + b + '); equal-looking values may name different things.',
          '結合キーが別の種類の識別子です（' + leftField + ': ' + a + '、' + rightField + ': ' + b + '）。見た目が同じ値でも別のものを指すことがあります。',
          { left: leftField, right: rightField, leftKind: a, rightKind: b }));
      } else if ((!a || !b) && ((kl.state === 'derived' && kl.value.looksLikeCode) || (kr.state === 'derived' && kr.value.looksLikeCode))) {
        out.push(W('join-key-kind-unstated', 'note',
          'A join key looks like a code but nobody stated which coding system it is (' + (a ? rightField : leftField) + ').',
          '結合キーはコードに見えますが、どの体系のコードかは述べられていません。', { left: leftField, right: rightField }));
      }
      for (const [col, other, who] of [[l, r, 'left'], [r, l, 'right']]) {
        if (col.comparableOnlyWith != null) {
          const only = [].concat(col.comparableOnlyWith).map(String);
          const ok = (sk(other.keyKind) && only.indexOf(sk(other.keyKind)) >= 0);
          if (!ok) out.push(W('declared-comparison-limit', 'caution',
            'Column ' + col.name + ' is declared comparable only with ' + only.join(', ') + '.',
            '列 ' + col.name + ' は ' + only.join('、') + ' とだけ比べられると述べられています。', { column: col.name, side: who, only }));
        }
      }
      return out;
    }

    function declaredConstraintWarnings(ds, ids) {
      const out = [];
      ds.forEach((d, i) => {
        if (d.constraints && d.constraints.state === 'stated') {
          for (const c of d.constraints.value) {
            out.push(W('declared-constraint', 'note', 'Dataset ' + ids[i] + ' states a limit on comparison: ' + c, 'データ ' + ids[i] + ' は比較の制約を述べています: ' + c, { dataset: ids[i], constraint: c }));
          }
        }
      });
      return out;
    }

    /* The aggregation the step asks for, against what the column is. The unit kernel owns the verdicts;
       this only carries them out of the op's own refusal path so a PLANNER sees them before running. A
       declared aggregation rule is a second, caller-visible statement, and a contradiction is reported. */
    function aggregationWarnings(d, field, stat, quantity, ids) {
      const out = [];
      const U = unitsK();
      if (!field || !stat || stat === 'count') return out;
      const col = colOf(d, field);
      if (!col) return out;
      const rule = col.aggregation;
      if (rule.state === 'stated') {
        const allowed = { sum: ['sum'], mean: ['mean', 'weightedMean', 'areaWeightedMean', 'median', 'min', 'max'], weightedMean: ['weightedMean', 'areaWeightedMean', 'min', 'max', 'median'], areaWeightedMean: ['areaWeightedMean', 'weightedMean', 'min', 'max', 'median'], min: ['min'], max: ['max'], median: ['median'], majority: ['majority'], none: [] }[rule.value];
        if (allowed && allowed.indexOf(stat) < 0) {
          out.push(W('aggregation-contradicts-declared-rule', 'caution',
            'Column ' + field + ' is declared to aggregate by ' + rule.value + ', but the step asks for ' + stat + '.',
            '列 ' + field + ' は ' + rule.value + ' で集計すると述べられていますが、' + stat + ' が要求されています。', { field, stat, rule: rule.value }));
        }
      }
      const q = quantity != null ? quantity : (col.quantity.state === 'stated' ? col.quantity.value : null);
      if (q && U && typeof U.aggregation === 'function') {
        const v = U.aggregation(q, stat);
        if (v.verdict === 'refused' || v.verdict === 'needs-weight') {
          out.push(W('aggregation-' + v.verdict, 'caution',
            'Aggregating ' + field + ' by ' + stat + ' is ' + v.verdict + ' (' + v.why + ')' + (v.remedy ? '; ' + v.remedy + ' instead.' : '.'),
            '列 ' + field + ' を ' + stat + ' で集計することは ' + v.verdict + ' です（' + v.why + '）' + (v.remedy ? '。代わりに ' + v.remedy + '。' : '。'),
            { field, stat, verdict: v.verdict, why: v.why, remedy: v.remedy || null }));
        }
      } else if (!q && rule.state === 'unstated') {
        out.push(W('aggregation-rule-unstated', 'note',
          'Nobody stated what ' + field + ' measures, so whether ' + stat + ' is meaningful is unknown.',
          '列 ' + field + ' が何の量かは述べられていないため、' + stat + ' が意味を持つかは分かりません。', { field, stat }));
      }
      return out;
    }

    const PAIR_OPS = ['join', 'spatialJoin', 'nearestJoin', 'timeJoin', 'intersect', 'union', 'difference', 'clip', 'relate', 'aggregate', 'sample', 'zonal', 'compareZones'];

    /* check(step) — step is {op, inputs:[id…], params}. Returns {ok:true, warnings:[…], caution:n}. A
       step the layer has nothing to say about answers an empty list, which is not 「問題ない」: the
       `unstated` array of describe() is how a caller learns what was not known. */
    function check(step) {
      const R = reg();
      const s = step || {};
      const ids = Array.isArray(s.inputs) ? s.inputs.slice() : [];
      const params = isObj(s.params) ? s.params : {};
      const recs = ids.map((id) => (R && R.get ? R.get(id) : null));
      if (recs.some((r) => !r)) return refuse('dataset-missing', { inputs: ids });
      const ds = ids.map((id) => describe(id));
      const out = [];
      if (ids.length === 2 && PAIR_OPS.indexOf(s.op) >= 0) {
        out.push(...timeWarnings(recs[0], recs[1], ids));
        const cols = s.op === 'join'
          ? [colOf(ds[0], params.leftField), colOf(ds[1], params.rightField)]
          : null;
        out.push(...basisWarnings(ds[0], ds[1], recs[0], recs[1], ids, cols));
        out.push(...scopeWarnings(ds[0], ds[1], ids));
        if (s.op === 'join') out.push(...keyWarnings(ds[0], ds[1], params.leftField, params.rightField, ids));
      }
      if (s.op === 'aggregate' && ids.length === 2) {
        out.push(...aggregationWarnings(ds[1], params.field, params.stat, params.quantity, ids));
      }
      out.push(...declaredConstraintWarnings(ds, ids));
      return { ok: true, op: s.op || null, warnings: out, caution: out.filter((w) => w.severity === 'caution').length };
    }

    /* comparable(a, b) — 「この列とあの列を並べてよいか」, for two columns of two datasets. The unit kernel
       answers the quantity half; basis and time are asked of the facets. */
    function comparable(a, b) {
      const R = reg(), U = unitsK();
      const ra = R && R.get ? R.get(a && a.dataset) : null, rb = R && R.get ? R.get(b && b.dataset) : null;
      if (!ra || !rb) return refuse('dataset-missing', { a: a && a.dataset, b: b && b.dataset });
      const da = describe(ra.id), db = describe(rb.id);
      const ca = colOf(da, a.field), cb = colOf(db, b.field);
      if (!ca) return refuse('unknown-field', { dataset: ra.id, field: a.field, fields: da.columns.map((c) => c.name) });
      if (!cb) return refuse('unknown-field', { dataset: rb.id, field: b.field, fields: db.columns.map((c) => c.name) });
      const warnings = [];
      let quantity = { verdict: 'undeclared', why: 'quantity-undeclared' };
      if (ca.quantity.state === 'stated' && cb.quantity.state === 'stated' && U) quantity = U.comparableQuantity(ca.quantity.value, cb.quantity.value);
      else if (ca.unit.state === 'stated' && cb.unit.state === 'stated' && U && typeof U.compare === 'function') quantity = Object.assign({ via: 'unit-only' }, U.compare(ca.unit.value, cb.unit.value));
      if (quantity.verdict && quantity.verdict !== 'comparable' && quantity.verdict !== 'identical' && quantity.verdict !== 'convertible') {
        warnings.push(W('quantity-not-comparable', quantity.verdict === 'undeclared' ? 'note' : 'caution',
          'The two columns are not shown to be the same measurement (' + quantity.verdict + ').',
          '2 つの列が同じ量であることは示されていません（' + quantity.verdict + '）。', { quantity }));
      }
      const ba = ca.basis, bb = cb.basis;
      if (ba.state !== 'unstated' && bb.state !== 'unstated' && ba.value !== bb.value) {
        warnings.push(W('basis-differs', 'caution', 'The columns count in different borders (' + ba.value + ' vs ' + bb.value + ').', '2 つの列は数える境界が違います（' + ba.value + ' と ' + bb.value + '）。', {}));
      }
      warnings.push(...timeWarnings(ra, rb, [ra.id, rb.id]));
      const tma = ca.timeMeaning, tmb = cb.timeMeaning;
      if (tma.state !== 'unstated' && tmb.state !== 'unstated') {
        const ka = Object.keys(tma.value).sort().join(','), kb = Object.keys(tmb.value).sort().join(',');
        if (ka !== kb) warnings.push(W('time-meaning-differs', 'note', 'The columns date their values differently (' + ka + ' vs ' + kb + ').', '2 つの列は値の日付の意味が違います（' + ka + ' と ' + kb + '）。', {}));
      }
      return { ok: true, comparable: !warnings.some((w) => w.severity === 'caution'), quantity, warnings };
    }

    function vocabulary() {
      return {
        scopeKinds: SCOPE_KINDS.slice(), bases: BASES.slice(), timeMeanings: TIME_MEANINGS.slice(), keyKinds: KEY_KINDS.slice(),
        aggregationRules: AGG_RULES.slice(), datasetFields: DATASET_FIELDS.slice(), columnFields: COLUMN_FIELDS.slice(), severities: SEVERITIES.slice(),
        checkedOps: PAIR_OPS.slice(),
      };
    }

    const API = {
      declare, declared: (id) => { const R = reg(); const r = R && R.get ? R.get(id) : null; return declared(r); },
      describe, check, comparable, vocabulary,
      forget: (id) => DECL.delete(id),
    };
    try { window.IntMapGisSemantics = API; } catch (_) { }
    return API;
  })();
}
