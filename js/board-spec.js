/* ============================================================================
 *  IntMap · THE BOARD SPEC — what Atlas (or the reader) DECLARES   (js/board-spec.js)
 * ----------------------------------------------------------------------------
 *  A board is declared, never written: no HTML, no script, no selector. Atlas says which widgets, over
 *  which data, and js/board.js draws them from parts that already exist. This file is the gate that
 *  decides whether a declaration is one — it returns the normalised spec, or the list of what was refused
 *  by name. Nothing is guessed in: a widget that names a column the data does not have is REFUSED, not
 *  quietly drawn empty (the shape `.agents/rules/historical-verification.md` §2-3 names for data).
 *
 *  THE SECTIONS. A board is one face of a Geospatial Artifact, so every widget kind belongs to one of its
 *  parts. `SECTION_OF` is the only place that mapping is written; js/board.js groups and labels by it.
 *      Map · Data · Analysis · Time · Objects · Evidence · Presentation · Execution
 *  Time is the `time` widget (the MASTER CLOCK, window.IntMapTime, as a slider; rows are filtered "as of" the
 *  clock through `data.timeField`) and Objects is the `objects` widget (the real-world objects a session has surfaced,
 *  js/atlas-world-objects.js, handed in as rows by js/atlas-cap-board.js — this file and js/board.js never import them).
 *  `metrics` computes headline figures FROM THE VISIBLE ROWS, so a filter, a selection or the clock moving updates them.
 *
 *  THE DATA. Either `data.dataset` — an id already in window.IntMapData (a GIS result, a dropped file) —
 *  or `data.rows` — plain records Atlas already holds, which the board registers as a dataset of its own
 *  so every widget reads ONE shape. `lngField`/`latField` turn rows into points for the map widget.
 *
 *  Pure: no DOM, no window.
 * ==========================================================================*/

import { textProblems } from './ui-text-rules.js';   /* the url / markup refusals — one copy, shared with js/atlas-ui-spec.js */

export const KINDS = ['table', 'chart', 'filter', 'map', 'evidence', 'param', 'metrics', 'time', 'objects'];
const SECTION_OF = { map: 'Map', table: 'Data', filter: 'Data', chart: 'Analysis', metrics: 'Analysis', time: 'Time', objects: 'Objects', evidence: 'Evidence', param: 'Execution' };
export const AGGS = ['count', 'sum', 'mean', 'min', 'max'];
const MAX_METRICS = 8;
/* Bounds, not caps on what Atlas may do: a spec is stored and re-sent, so its size has to be a number somebody can state.
   Observed 2026-11-20: a 40-row × 8-column answer is ~6 KB; 2000 rows keeps a record under ~1 MB of IndexedDB. */
export const MAX_ROWS = 2000;
const MAX_WIDGETS = 12;

const s = (v, n) => (v == null ? '' : String(v).slice(0, n || 200));
const id = (v) => /^[A-Za-z0-9_.-]{1,64}$/.test(String(v || '')) ? String(v) : '';

/** The column names a spec's data actually has (from features' properties). */
export function columnsOf(features) {
  const seen = new Set(), out = [];
  for (const f of features || []) for (const k of Object.keys((f && f.properties) || {})) if (!seen.has(k)) { seen.add(k); out.push(k); }
  return out;
}

/** rows → GeoJSON-ish features (properties always; a Point when both coordinate fields are finite numbers). */
export function rowsToFeatures(rows, lngField, latField) {
  return rows.slice(0, MAX_ROWS).map((r) => {
    const props = {}; for (const k of Object.keys(r || {})) props[k] = r[k];
    const x = Number(props[lngField]), y = Number(props[latField]);
    const geometry = (lngField && latField && props[lngField] != null && props[latField] != null && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 180 && Math.abs(y) <= 90) ? { type: 'Point', coordinates: [x, y] } : null;
    return { type: 'Feature', properties: props, geometry };
  });
}

/**
 * normalise(raw, columns) → {ok:true, spec} | {ok:false, issues:[{path, why}]}
 * `columns` is what the data really has, so a widget naming a missing column is refused by name.
 * When `columns` is null the data is not known yet (the dataset is not loaded) and column checks wait.
 */
export function normalise(raw, columns) {
  const issues = [], bad = (path, why) => issues.push({ path, why });
  if (!raw || typeof raw !== 'object') return { ok: false, issues: [{ path: '', why: 'not-an-object' }] };
  const data = {};
  if (raw.data && raw.data.dataset) data.dataset = s(raw.data.dataset, 80);
  else if (raw.data && Array.isArray(raw.data.rows) && raw.data.rows.length) {
    data.rows = raw.data.rows.filter((r) => r && typeof r === 'object' && !Array.isArray(r)).slice(0, MAX_ROWS);
    if (!data.rows.length) bad('data.rows', 'no-records');
    if (raw.data.lngField) data.lngField = s(raw.data.lngField, 64);
    if (raw.data.latField) data.latField = s(raw.data.latField, 64);
  } else bad('data', 'needs-dataset-or-rows');
  if (raw.data && raw.data.timeField) data.timeField = s(raw.data.timeField, 64);   /* the column the clock filters by; checked against the columns below */
  if (!Array.isArray(raw.widgets) || !raw.widgets.length) bad('widgets', 'no-widgets');
  const cols = columns || (data.rows ? columnsOf(data.rows.map((r) => ({ properties: r }))) : null);
  const has = (c) => !cols || cols.includes(c);
  const need = (w, path, key) => { if (!w[key] || !has(w[key])) { bad(path + '.' + key, 'unknown-column:' + s(w[key], 64)); return false; } return true; };
  if (data.timeField && !has(data.timeField)) bad('data.timeField', 'unknown-column:' + data.timeField);
  /* every string Atlas AUTHORED (not the data's own cells) is judged by the same two rules as a view's — a URL or a tag is refused by name */
  const L1 = (en) => en;   /* the reason codes are what a caller reads; the sentence is the view checker's */
  const scan = (path, v) => { if (typeof v === 'string') textProblems(v, L1).forEach((p) => bad(path, p.code)); };
  scan('title', raw.title); scan('source', raw.source);
  const widgets = [], used = new Set();
  (Array.isArray(raw.widgets) ? raw.widgets : []).slice(0, MAX_WIDGETS).forEach((w, i) => {
    const path = 'widgets[' + i + ']';
    if (!w || !KINDS.includes(w.kind)) { bad(path + '.kind', 'unknown-kind:' + s(w && w.kind, 40)); return; }
    let wid = id(w.id) || (w.kind + (i + 1)); while (used.has(wid)) wid += '_'; used.add(wid);
    const o = { id: wid, kind: w.kind, section: SECTION_OF[w.kind], title: s(w.title, 80) };
    scan(path + '.title', w.title);
    if (w.kind === 'metrics') {
      /* headline figures computed from the rows that pass the filters and the clock: {label, agg, field?, unit?} */
      const items = Array.isArray(w.items) ? w.items.slice(0, MAX_METRICS) : [];
      if (!items.length) { bad(path + '.items', 'metrics-need-items'); return; }
      o.items = [];
      items.forEach((m, j) => {
        const ip = path + '.items[' + j + ']', agg = AGGS.includes(m && m.agg) ? m.agg : '';
        if (!m || !s(m.label, 60)) { bad(ip + '.label', 'missing'); return; }
        if (!agg) { bad(ip + '.agg', 'unknown-agg:' + s(m.agg, 20)); return; }
        if (agg !== 'count' && (!m.field || !has(m.field))) { bad(ip + '.field', 'unknown-column:' + s(m.field, 64)); return; }
        scan(ip + '.label', m.label); scan(ip + '.unit', m.unit);
        o.items.push({ label: s(m.label, 60), agg, field: m.field ? s(m.field, 64) : '', unit: s(m.unit, 16) });
      });
    }
    if (w.kind === 'time' && !data.timeField) { bad(path, 'time-needs-data.timeField'); return; }
    if (w.kind === 'objects') { o.typeField = s(w.typeField, 64) || 'type'; o.nameField = s(w.nameField, 64) || 'name'; if (!has(o.typeField)) { bad(path + '.typeField', 'unknown-column:' + o.typeField); return; } if (!has(o.nameField)) { bad(path + '.nameField', 'unknown-column:' + o.nameField); return; } }
    if (w.kind === 'table') { if (Array.isArray(w.columns)) { o.columns = w.columns.map((c) => s(c, 64)).filter((c) => has(c)).slice(0, 12); } }
    if (w.kind === 'chart') {
      if (!need(w, path, 'x') || !need(w, path, 'y')) return;
      o.chart = w.chart === 'line' ? 'line' : 'bar'; o.x = s(w.x, 64); o.y = s(w.y, 64);
    }
    if (w.kind === 'filter') {
      if (!need(w, path, 'field')) return;
      o.field = s(w.field, 64); o.control = w.control === 'category' ? 'category' : 'range';
    }
    if (w.kind === 'param') {
      /* an execution knob: the value of ONE parameter of the op that made `dataset`; js/board.js hands it to IntMapGisProject.setParams */
      const key = s(w.key, 64), ds = s(w.dataset || data.dataset, 80);
      const min = Number(w.min), max = Number(w.max);
      if (!key || !ds || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) { bad(path, 'param-needs-dataset-key-min<max'); return; }
      o.dataset = ds; o.key = key; o.min = min; o.max = max; o.step = Number.isFinite(Number(w.step)) && Number(w.step) > 0 ? Number(w.step) : (max - min) / 20;
      if (Number.isFinite(Number(w.value))) o.value = Number(w.value);
    }
    widgets.push(o);
  });
  if (issues.length) return { ok: false, issues };
  const spec = { v: 1, title: s(raw.title, 120) || 'Board', source: s(raw.source, 300), data, widgets };
  if (!spec.source) return { ok: false, issues: [{ path: 'source', why: 'source-required' }] };   /* every board states where its numbers came from, as a chart must (js/atlas-chart.js) */
  return { ok: true, spec };
}
