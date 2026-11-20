/* ============================================================================
 *  IntMap · ROWS → A DATASET THE GIS OPS CAN READ   (js/atlas-table.js)
 * ----------------------------------------------------------------------------
 *  A long investigation ends up holding ROWS it gathered itself: the fabs a worker found, the value each
 *  source stated for each of them, the unit and the year it stated it in. Until this file those rows had
 *  no door into analysis — `data.gis` ops read DATASETS, a delegated worker returns findings/facts and
 *  never a dataset, and the only way in was to paste the numbers into a Python string (`compute.run`) where
 *  a transcription error is invisible. This is the one door: rows in, a registered dataset out, and from
 *  there it is the input of convert / compute / nearestJoin / spatialJoin like any other.
 *
 *  ⚠ NOTHING IS INVENTED. A row with no usable position stays a row (geometry:null — the registry's own
 *  rule for tables, js/gis-datasets.js #R738); a unit or a source is carried only where the caller stated
 *  it, and a unit that is not stated is recorded as not stated rather than filled in. The registry
 *  MEASURES the column types, so a number the caller wrote as "12,5 MW" stays text and is reported as
 *  such instead of being coerced.
 *  ⚠ NO LIMIT ON ROWS. The size of the table is the caller's decision.
 *  ⚠ PURE: no DOM, no registry — `toSpec()` builds the object `IntMapData.add` takes, so the checks run it in node.
 * ==========================================================================*/

const LAT_KEYS = ['lat', 'latitude', 'lat_deg', 'y'];
const LNG_KEYS = ['lng', 'lon', 'long', 'longitude', 'lng_deg', 'x'];

/** the first of `names` that at least one row carries as an own key (case-insensitive) — the COLUMN's real spelling, or null */
function pickColumn(rows, names, forced) {
  const seen = new Map();
  for (const r of rows) for (const k of Object.keys(r || {})) if (!seen.has(k.toLowerCase())) seen.set(k.toLowerCase(), k);
  if (forced) return seen.get(String(forced).toLowerCase()) || null;
  for (const n of names) if (seen.has(n)) return seen.get(n);
  return null;
}

function finite(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * toSpec(a) — {title?, rows:[{…}], lat?, lng?, columns?:{name:{unit?,quantity?,from?}}, time?, source?, licence?}
 * → { ok:true, spec, stats } | { ok:false, code, reason }
 * stats says what happened to the rows: how many have a position, which column was read for each axis,
 * which declared columns do not exist, and which declared columns hold text although a unit was declared.
 */
export function toSpec(a) {
  const rows = Array.isArray(a && a.rows) ? a.rows.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) : [];
  if (!rows.length) return { ok: false, code: 'no_rows', reason: 'rows must be a non-empty list of objects ({column: value, …}).' };
  const latCol = pickColumn(rows, LAT_KEYS, a.lat), lngCol = pickColumn(rows, LNG_KEYS, a.lng);
  if ((a.lat && !latCol) || (a.lng && !lngCol)) return { ok: false, code: 'position_column_missing', reason: 'the named ' + (a.lat && !latCol ? 'lat' : 'lng') + ' column is in no row; the columns are: ' + Object.keys(rows[0]).join(', ') };
  const columns = Object.keys(a.columns || {});
  const allCols = new Set(); rows.forEach((r) => Object.keys(r).forEach((k) => allCols.add(k)));
  const unknownColumns = columns.filter((c) => !allCols.has(c));
  let withPosition = 0, badPosition = 0;
  const features = rows.map((r) => {
    const props = {};
    for (const k of Object.keys(r)) props[k] = r[k] === undefined ? null : r[k];
    let geometry = null;
    if (latCol && lngCol) {
      const la = finite(r[latCol]), ln = finite(r[lngCol]);
      if (la !== null && ln !== null && Math.abs(la) <= 90 && Math.abs(ln) <= 180) { geometry = { type: 'Point', coordinates: [ln, la] }; withPosition++; }
      else if (r[latCol] != null || r[lngCol] != null) badPosition++;
    }
    return { type: 'Feature', geometry, properties: props };
  });
  /* what the caller stated about a column travels as the registry's own field statement: the unit is the caller's word
     ('source' = it arrived with the payload), never measured, and a column with no statement has none. */
  const fieldStatements = {};
  const textWithUnit = [];
  for (const c of columns) {
    const d = a.columns[c] || {};
    if (!allCols.has(c)) continue;
    const st = {};
    if (d.unit != null && String(d.unit).trim()) { st.unit = String(d.unit).trim(); st.unitStated = 'source'; if (d.from != null) st.unitFrom = String(d.from); }
    if (d.quantity && typeof d.quantity === 'object') st.quantity = d.quantity;
    if (Object.keys(st).length) fieldStatements[c] = st;
    if (st.unit) { const nonNum = rows.some((r) => r[c] != null && r[c] !== '' && finite(r[c]) === null); if (nonNum) textWithUnit.push(c); }
  }
  const spec = {
    title: String(a.title || 'Atlas table'),
    features,
    time: a.time || null,
    provenance: { kind: 'import', file: String(a.title || 'atlas-table'), origin: 'atlas-rows', url: a.source ? String(a.source) : null, licence: a.licence ? String(a.licence) : null },
    fieldStatements,
  };
  return { ok: true, spec, stats: { rows: rows.length, withPosition, withoutPosition: rows.length - withPosition, badPosition, latColumn: latCol, lngColumn: lngCol, unknownColumns, textWithUnit } };
}
