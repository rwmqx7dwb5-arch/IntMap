/* ============================================================================
 *  IntMap · THE BOARD'S ONE SHARED STATE   (js/board-state.js)
 * ----------------------------------------------------------------------------
 *  A board (js/board.js) is several widgets — a table, a chart, a map, a filter — looking at ONE
 *  dataset. What links them is not each widget knowing about the others; it is this store. A click on
 *  a table row does not repaint the chart: it says «row 3 is selected», and every widget that draws
 *  rows reads that. The same store is what the reader's hand-made board and an Atlas-composed board
 *  both write to, so there is one way for «one element changes the others» to happen, not two.
 *
 *  WHAT IS STATE, WHAT IS NOT
 *    selection  the row indexes the reader (or Atlas) pointed at
 *    filters    one entry per filter widget: {field, min, max} or {field, values}
 *    params     the execution knobs: {[widgetId]: number} — the value the reader set for an op
 *               parameter. The store only holds the number; js/board.js is what hands it to
 *               window.IntMapGisProject.setParams, so «re-run what depends on it» stays the project's job.
 *  The rows themselves are NOT state: they are the dataset's (window.IntMapData) and are read through
 *  `visible(rows)` on every draw, never copied here — a copy would be the second place the data
 *  could be stale.
 *
 *  Pure: no DOM, no window. node:test measures it directly.
 * ==========================================================================*/

/** One filter's verdict on one row's properties. A row with no value in the field does NOT pass a
 *  range or a category filter: «unknown» is not «inside the range», it is counted out and the board says so. */
export function passes(filter, props) {
  const v = props ? props[filter.field] : undefined;
  if (v == null || v === '') return false;
  if (Array.isArray(filter.values)) return filter.values.length === 0 || filter.values.map(String).includes(String(v));
  const n = Number(v);
  if (!Number.isFinite(n)) return false;
  if (filter.min != null && n < filter.min) return false;
  if (filter.max != null && n > filter.max) return false;
  return true;
}

export function createBoardState(initial) {
  const subs = new Set();
  let st = { selection: [], filters: {}, params: {}, time: null };
  const clean = (o) => {
    const s = { selection: [], filters: {}, params: {}, time: null };
    if (o && Array.isArray(o.selection)) s.selection = [...new Set(o.selection.filter((i) => Number.isInteger(i) && i >= 0))];
    if (o && o.filters && typeof o.filters === 'object') for (const k of Object.keys(o.filters)) { const f = o.filters[k]; if (f && typeof f.field === 'string') s.filters[k] = { field: f.field, min: f.min == null ? null : Number(f.min), max: f.max == null ? null : Number(f.max), values: Array.isArray(f.values) ? f.values.map(String) : null }; }
    if (o && o.params && typeof o.params === 'object') for (const k of Object.keys(o.params)) { const n = Number(o.params[k]); if (Number.isFinite(n)) s.params[k] = n; }
    if (o && o.time && Number.isFinite(Number(o.time.year))) s.time = { year: Math.round(Number(o.time.year)), mode: o.time.mode === 'at' ? 'at' : 'upto' };
    return s;
  };
  st = clean(initial);
  const emit = (what) => { for (const fn of [...subs]) { try { fn(what, st); } catch (_) { /* one broken widget must not stop the rest hearing it */ } } };
  return {
    get: () => st,
    /* `source` is who changed it, so a widget can skip repainting what it just did itself */
    select(indexes, source) { st = { ...st, selection: clean({ selection: indexes }).selection }; emit({ what: 'selection', source }); },
    toggle(index, source) { const has = st.selection.includes(index); this.select(has ? st.selection.filter((i) => i !== index) : [...st.selection, index], source); },
    setFilter(id, filter, source) {
      const f = { ...st.filters }; if (filter) f[id] = clean({ filters: { [id]: filter } }).filters[id]; else delete f[id];
      /* the selection is left alone: a selected row that a filter hides is simply not drawn, and is drawn again when the filter relaxes */
      st ={ ...st, filters: f }; emit({ what: 'filter', id, source });
    },
    /* the clock the board follows: rows whose year is <= `year` ('upto') or == `year` ('at'). null releases it. js/board.js mirrors it with window.IntMapTime in BOTH directions; the store only holds the number */
    setTime(t, source) { st = { ...st, time: t ? clean({ time: t }).time : null }; emit({ what: 'time', source }); },
    setParam(id, value, source) { const n = Number(value); if (!Number.isFinite(n)) return; st = { ...st, params: { ...st.params, [id]: n } }; emit({ what: 'param', id, source }); },
    /* the rows that pass every filter, as indexes into `rows` (an array of GeoJSON Features or plain {properties}) */
    /* `yearOf(row)` reads the row's year (js/board-spec.js yearOf over the declared timeField). A row with no year does not pass a time window: unknown is not «inside» (same rule as passes()) */
    visible(rows, yearOf) { const fs = Object.values(st.filters), t = yearOf ? st.time : null; const out = []; for (let i = 0; i < rows.length; i++) { const p = rows[i] && rows[i].properties; if (!fs.every((f) => passes(f, p))) continue; if (t) { const y = yearOf(rows[i]); if (y == null || (t.mode === 'at' ? y !== t.year : y > t.year)) continue; } out.push(i); } return out; },
    snapshot: () => JSON.parse(JSON.stringify(st)),
    restore(saved, source) { st = clean(saved); emit({ what: 'restore', source }); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
