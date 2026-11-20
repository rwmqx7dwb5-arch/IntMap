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
 *    time       the MASTER CLOCK's instant (epoch ms) or null — a MIRROR of window.IntMapTime that js/board.js keeps
 *               current, never saved (the clock is the session's, js/session-tabs.js) and never set by a widget
 *               directly: the `time` widget moves the clock and the clock's own broadcast comes back here, so
 *               there is one time and the board cannot disagree with the map.
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
  let st = { selection: [], filters: {}, params: {} };
  let time = null;   /* outside `st`: not part of the snapshot (see above) */
  const clean = (o) => {
    const s = { selection: [], filters: {}, params: {} };
    if (o && Array.isArray(o.selection)) s.selection = [...new Set(o.selection.filter((i) => Number.isInteger(i) && i >= 0))];
    if (o && o.filters && typeof o.filters === 'object') for (const k of Object.keys(o.filters)) { const f = o.filters[k]; if (f && typeof f.field === 'string') s.filters[k] = { field: f.field, min: f.min == null ? null : Number(f.min), max: f.max == null ? null : Number(f.max), values: Array.isArray(f.values) ? f.values.map(String) : null }; }
    if (o && o.params && typeof o.params === 'object') for (const k of Object.keys(o.params)) { const n = Number(o.params[k]); if (Number.isFinite(n)) s.params[k] = n; }
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
    setParam(id, value, source) { const n = Number(value); if (!Number.isFinite(n)) return; st = { ...st, params: { ...st.params, [id]: n } }; emit({ what: 'param', id, source }); },
    /* the rows that pass every filter, as indexes into `rows` (an array of GeoJSON Features or plain {properties}).
       `timeOf(row)` → epoch ms | null, when the board has a time column: with a clock set, a row is visible "as of" it — its
       moment is at or before the clock. A row with no readable moment is counted OUT, like a missing filter value. */
    visible(rows, timeOf) { const fs = Object.values(st.filters); const asOf = (time != null && typeof timeOf === 'function'); const out = [];
      for (let i = 0; i < rows.length; i++) { const p = rows[i] && rows[i].properties; if (!fs.every((f) => passes(f, p))) continue;
        if (asOf) { const t = timeOf(rows[i]); if (!(Number.isFinite(t) && t <= time)) continue; }
        out.push(i); }
      return out; },
    getTime: () => time,
    setTime(ms, source) { const n = ms == null ? null : Number(ms); const v = Number.isFinite(n) ? n : null; if (v === time) return; time = v; emit({ what: 'time', source }); },
    snapshot: () => JSON.parse(JSON.stringify(st)),
    restore(saved, source) { st = clean(saved); emit({ what: 'restore', source }); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
