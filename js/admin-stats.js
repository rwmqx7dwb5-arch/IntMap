/* ============================================================================
 *  IntMap · ADMINISTRATIVE-UNIT STATISTICS — js/admin-stats.js
 * ----------------------------------------------------------------------------
 *  「都道府県を人口で色分け」「州・郡・NUTS 地域の人口」への答え。データは data/admin-stats.json.gz
 *  （scripts/build-admin-stats.mjs が Wikidata から作る・出自は同ファイルの冒頭）。
 *
 *  ══ A NUMBER IS ONLY A NUMBER WITH ITS DATE AND ITS DEFINITION ═══════════════════════════════
 *  Every figure comes back with the date it was stated for (`time`), how it was determined
 *  (`method`: census / estimate / …, as the source states it), and whether that is the year the
 *  reader asked for (`exact`, `gapYears`). Nothing here fills a gap silently:
 *    · a year with no statement is `no-statement-for-year` unless the caller states `toleranceYears`,
 *      and then the answer names the gap;
 *    · an UNDATED statement is never given a year (it is counted in `undated` and left out);
 *    · a choropleth of mixed methods says so (`methods`), because a census count beside an estimate
 *      is two definitions in one colour ramp.
 *
 *  ══ THE KEY NAMES A UNIT; IT DOES NOT MAKE TWO UNITS THE SAME ════════════════════════════════
 *  A code (JP-13, DE21, a JIS code) is reused across reorganisations. Each unit carries its own
 *  lifespan (`inc` / `dis`, from the source's inception and abolition dates) and `valueAt` refuses a
 *  year outside it — `unit-not-yet-established` / `unit-abolished` — instead of handing the present
 *  unit's figure to a past one. `definitionAt(unit, year)` is the same guard for a JOIN: a caller
 *  joining a historical boundary (js/hist-*) to these figures asks it first, so the join is never made
 *  on the year alone. ⚠ It speaks only for what the source states: a unit with no stated lifespan is
 *  `lifespan:'unstated'`, not `'always'`.
 *
 *  ⚠ NO DOM AND NO GLOBALS: the one read is injectable (`deps.load`), so tests/admin-stats-checks.test.mjs
 *  drives THIS module against the REAL shipped file in node.
 * ==========================================================================*/

/* the kind's name, one map per language (not a pair per entry: the i18n gate reads adjacent pairs as untranslated tuples) */
export const KIND_EN = { 'iso3166-2': 'First-level units (ISO 3166-2)', 'nuts': 'EU/EFTA statistical regions (NUTS)', 'us-fips': 'US states and counties (FIPS)', 'jp-jis': 'Japanese prefectures and municipalities (JIS)' };
export const KIND_JA = { 'iso3166-2': '第1級行政区分（ISO 3166-2）', 'nuts': '欧州統計地域（NUTS）', 'us-fips': '米国の州・郡（FIPS）', 'jp-jis': '日本の都道府県・市区町村（地方公共団体コード）' };
export const KIND_LABEL = KIND_EN;
const DATA_URL = 'data/admin-stats.json.gz';

const yearOf = (t) => { if (!t) return null; const m = /^(-?\d{1,6})-/.exec(t); return m ? Number(m[1]) : null; };

export function makeAdminStats(deps) {
  const D = deps || {};
  let LOADING = null;
  function load() {
    if (D.data) return Promise.resolve(D.data);
    return LOADING || (LOADING = (async () => {
      const read = D.load || (await import('./data-door.js')).loadData;
      const j = await read(DATA_URL, { as: 'json' });
      if (!j || !j.units) throw new Error('admin-stats: unreadable');
      return j;
    })().catch((e) => { LOADING = null; throw e; }));
  }

  const bad = (why, detail) => (detail === undefined ? { ok: false, why: why } : { ok: false, why: why, detail: detail });

  function methodOf(data, q) {
    if (!q) return { id: null, en: null, ja: null };
    const m = (data.methods && data.methods[q]) || {};
    return { id: q, en: m.en || null, ja: m.ja || null };
  }

  /* the unit's own lifespan against a year. `inc`/`dis` are ISO dates the source states. */
  function definitionAt(unit, year) {
    if (!unit) return bad('unit-unknown');
    const stated = !!(unit.inc || unit.dis);
    if (year == null) return { ok: true, lifespan: stated ? 'stated' : 'unstated', inc: unit.inc || null, dis: unit.dis || null };
    const iy = yearOf(unit.inc), dy = yearOf(unit.dis);
    if (iy != null && year < iy) return bad('unit-not-yet-established', { year: year, inc: unit.inc });
    if (dy != null && year > dy) return bad('unit-abolished', { year: year, dis: unit.dis });
    return { ok: true, lifespan: stated ? 'stated' : 'unstated', inc: unit.inc || null, dis: unit.dis || null };
  }

  /* One figure for a unit. year omitted → the latest DATED statement. */
  function valueAt(data, unit, o) {
    const opt = o || {};
    if (!unit) return bad('unit-unknown');
    const dated = unit.s.filter((r) => r[0]), undated = unit.s.length - dated.length;
    if (!dated.length) return bad('no-dated-statement', { undated: undated });
    let pick = null, gap = 0;
    if (opt.year == null) {
      pick = dated[dated.length - 1];
    } else {
      const guard = definitionAt(unit, opt.year);
      if (!guard.ok) return guard;
      const tol = Number.isFinite(opt.toleranceYears) ? Math.max(0, opt.toleranceYears) : 0;
      let best = null;
      for (const r of dated) {
        const d = Math.abs(yearOf(r[0]) - opt.year);
        if (d <= tol && (best === null || d < best.d || (d === best.d && r[0] > best.r[0]))) best = { r: r, d: d };
      }
      if (!best) return bad('no-statement-for-year', { year: opt.year, nearest: nearestYear(dated, opt.year), undated: undated });
      pick = best.r; gap = best.d;
    }
    const sameYear = dated.filter((r) => yearOf(r[0]) === yearOf(pick[0])).length;
    const m = methodOf(data, pick[2]);
    return {
      ok: true, value: pick[1], time: pick[0], year: yearOf(pick[0]), method: m,
      exact: opt.year == null ? null : gap === 0, gapYears: opt.year == null ? null : gap,
      statementsThatYear: sameYear, undated: undated,
    };
  }
  function nearestYear(dated, year) {
    let b = null;
    for (const r of dated) { const y = yearOf(r[0]); if (b === null || Math.abs(y - year) < Math.abs(b - year)) b = y; }
    return b;
  }

  /* rows for every unit of a kind whose code starts with `prefix` (a country: 'JP-', 'DE', '13') */
  async function table(o) {
    const opt = o || {};
    const data = await load();
    const kind = opt.kind || 'iso3166-2';
    const set = data.units[kind];
    if (!set) return bad('kind-unknown', { kind: kind, kinds: Object.keys(data.units) });
    const prefix = opt.prefix ? String(opt.prefix).toUpperCase() : '';
    const rows = [], missing = [], refused = {};
    for (const code of Object.keys(set)) {
      if (prefix && !code.toUpperCase().startsWith(prefix)) continue;
      const u = set[code];
      const r = valueAt(data, u, opt);
      if (r.ok) rows.push(Object.assign({ code: code, kind: kind, name: u.n || null, nameJa: u.nj || null, qid: u.q }, r));
      else { refused[r.why] = (refused[r.why] || 0) + 1; missing.push({ code: code, why: r.why }); }
    }
    rows.sort((a, b) => b.value - a.value);
    const methods = {};
    for (const r of rows) { const k = r.method.id || 'unstated'; methods[k] = methods[k] || { label: r.method.en || r.method.id || 'method not stated', rows: 0 }; methods[k].rows++; }
    const years = rows.map((r) => r.year);
    return {
      ok: true, kind: kind, rows: rows, missing: missing, refused: refused,
      years: years.length ? { min: Math.min.apply(null, years), max: Math.max.apply(null, years) } : null,
      methods: methods, mixedMethods: Object.keys(methods).length > 1,
      mixedYears: years.length ? Math.min.apply(null, years) !== Math.max.apply(null, years) : false,
      source: data.source, builtAt: data.builtAt,
    };
  }

  /* A FeatureCollection of the SHIPPED first-level boundaries carrying the figures — what the map colours.
     `units` is js/atlas-admin1.js load()'s answer (their `iso2` is the ISO 3166-2 code); passing it in keeps
     this module free of the 7.5 MB boundary file until somebody draws. */
  async function boundaries(adm1, o) {
    const opt = o || {};
    const t = await table(Object.assign({}, opt, { kind: 'iso3166-2' }));
    if (!t.ok) return t;
    const byCode = new Map(t.rows.map((r) => [r.code, r]));
    const prefix = opt.prefix ? String(opt.prefix).toUpperCase() : '';
    const feats = []; let unmatched = 0;
    for (const u of (adm1 && adm1.units) || []) {
      const code = u.code || '';
      if (!code || (prefix && !code.toUpperCase().startsWith(prefix))) continue;
      const r = byCode.get(code);
      if (!r) { unmatched++; continue; }
      feats.push({
        type: 'Feature', geometry: u.geo,
        properties: {
          code: code, name: u.canonicalName, population: r.value, population_date: r.time,
          population_method: r.method.en || r.method.id || null, year_gap: r.gapYears,
        },
      });
    }
    return { ok: true, fc: { type: 'FeatureCollection', features: feats }, matched: feats.length, boundariesWithoutFigure: unmatched, figuresWithoutBoundary: t.rows.length - feats.length, table: t };
  }

  /* NUTS regions: Eurostat GISCO publishes ONE file per NUTS level (NUTS_RG_20M_2021_4326_LEVL_n.geojson); `fc` is that
     FeatureCollection (the caller fetches it — this module stays free of the network). The join is by IDENTIFIER: the
     feature's NUTS_ID against the code Wikidata states (P605), never by name. ⚠ GISCO's file is ONE classification
     (NUTS 2021) and the NUTS codes were revised in 2013, 2016 and 2021: a Wikidata unit whose code belongs to another
     version has no boundary here, and a boundary whose code Wikidata does not state has no figure. Both are COUNTED
     (figuresWithoutBoundary / boundariesWithoutFigure) and named in `classification`, so the colouring never implies a
     complete cover. The level is read from the feature, not guessed from the code length. */
  async function nutsBoundaries(fc, o) {
    const opt = o || {};
    const t = await table(Object.assign({}, opt, { kind: 'nuts' }));
    if (!t.ok) return t;
    const feats0 = (fc && Array.isArray(fc.features)) ? fc.features : [];
    if (!feats0.length) return bad('no-boundaries');
    const level = (feats0[0].properties || {}).LEVL_CODE;
    const byCode = new Map(t.rows.map((r) => [r.code, r]));
    const feats = []; let unmatched = 0;
    for (const f of feats0) {
      const p = f.properties || {}, code = p.NUTS_ID || '';
      if (!code || !f.geometry) continue;
      const r = byCode.get(code);
      if (!r) { unmatched++; continue; }
      feats.push({ type: 'Feature', geometry: f.geometry, properties: { code: code, name: p.NAME_LATN || p.NUTS_NAME || r.name || code, population: r.value, population_date: r.time, population_method: r.method.en || r.method.id || null, year_gap: r.gapYears, nuts_level: p.LEVL_CODE } });
    }
    const here = new Set(feats0.map((f) => (f.properties || {}).NUTS_ID));
    const sameLevel = t.rows.filter((r) => level != null && r.code.length === level + 2);
    return { ok: true, fc: { type: 'FeatureCollection', features: feats }, matched: feats.length, level: level == null ? null : level, boundariesWithoutFigure: unmatched,
      figuresWithoutBoundary: sameLevel.filter((r) => !here.has(r.code)).length, classification: 'NUTS 2021 (Eurostat GISCO); codes of other NUTS versions are not joined', table: t };
  }

  /* THE HISTORICAL JOIN, BY IDENTIFIER. `bundle` is a historical subdivision bundle in which a row's key (the column after the
     names — data/hist-admin-fill.js: an ISO 3166-2 code) names the unit it outlines: [ name, level, y0,m0,d0, y1,m1,d1, rings,
     names, key, country ], with `inception` {code: YYYYMMDD} the unit's own stated beginning. A figure and an outline are the SAME
     unit only when they state the same CODE — never because the names agree — and only for the years the unit exists
     (the statistic's lifespan, definitionAt, AND the bundle's stated inception). ⚠ THE OUTLINE IS TODAY'S: a fill bundle
     draws the present outline of a unit that still exists (js/border-coast.js todayOutline), so its row span is a
     drawing window, not the unit's life; the answer says `outline:'present-day'` instead of letting a 1990 figure sit
     on a boundary that did not exist in that shape. */
  function historicalAt(bundle, code, year, unit) {
    const feats = (bundle && bundle.feats) || [];
    const rows = feats.filter((f) => f && f[10] === code);
    if (!rows.length) return bad('no-outline-for-code', { code: code });
    const outlines = rows.map((f) => ({ name: f[0], row: f }));
    const inc = bundle.inception && bundle.inception[code] != null ? Math.floor(bundle.inception[code] / 10000) : null;
    if (year == null) return { ok: true, code: code, outline: 'present-day', inceptionYear: inc, outlines: outlines.map((o) => o.name) };
    if (inc != null && year < inc) return bad('unit-not-yet-established', { code: code, year: year, inceptionYear: inc, via: 'bundle-inception' });
    const guard = unit ? definitionAt(unit, year) : { ok: true, lifespan: 'unstated' };
    if (!guard.ok) return Object.assign({ code: code }, guard);
    return { ok: true, code: code, year: year, outline: 'present-day', inceptionYear: inc, unitLifespan: guard.lifespan, outlines: outlines.map((o) => o.name) };
  }

  return { load, table, valueAt: async (kind, code, o) => { const data = await load(); const u = data.units[kind] && data.units[kind][code]; return valueAt(data, u, o); }, definitionAt, boundaries, nutsBoundaries, historicalAt, KIND_LABEL, DATA_URL };
}
