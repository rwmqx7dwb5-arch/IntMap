/* ============================================================================
 *  IntMap · THE BOARD'S EDITING RULES — pure   (js/board-edit.js)
 * ----------------------------------------------------------------------------
 *  A board's table is not read-only: the reader (or Atlas, through the same `board.edit` capability) may
 *  change a value, add / rename / remove a column. The WRITES are js/gis-datasets.js's (editValues, addField,
 *  renameField, removeField — each checked whole before any is applied, each undoable); this file is what the
 *  board adds around them, with no DOM and no window so node:test measures it directly:
 *
 *    parseCell      what a typed string means in a column that already holds numbers or text
 *    columnUses     which widgets of a spec read a column — a column that a chart is drawn from is not removed
 *                   from under it, it is refused BY NAME (the same shape as the data layer's own refusals)
 *    renameInSpec   a rename carries the widgets with it
 *    diffRows       the delta: what differs from the rows the board was opened with — the thing Atlas is handed
 *                   to continue from ("the reader changed these, redo the analysis")
 *    deltaText      that delta as the sentence Atlas receives
 *
 *  ⚠ THE DELTA IS COMPUTED, NOT RECORDED. An edit log would be a second copy of what the rows already say, and
 *  would drift the first time a value is edited twice or undone; comparing the rows with the opening snapshot
 *  is right by construction, and an undone edit simply isn't in it.
 * ==========================================================================*/

/** What a typed string means given the cells already in the column. A column whose existing values are
 *  numbers takes a number (a non-number is REFUSED, not stored as text in a number column); otherwise text.
 *  An empty string clears the cell to null. */
export function parseCell(text, existing) {
  const t = String(text == null ? '' : text);
  if (t.trim() === '') return { ok: true, value: null };
  const numeric = existing.some((v) => typeof v === 'number') && !existing.some((v) => typeof v === 'string' && v.trim() !== '');
  if (numeric) {
    const n = Number(t.replace(/,/g, ''));
    if (!Number.isFinite(n)) return { ok: false, why: 'not-a-number', value: t };
    return { ok: true, value: n };
  }
  return { ok: true, value: t };
}

/** Every place a spec names `column`: [{widget, kind, role}]. `data.*Field` roles are reported with widget ''. */
export function columnUses(spec, column) {
  const out = [], d = (spec && spec.data) || {};
  for (const k of ['lngField', 'latField', 'timeField']) if (d[k] === column) out.push({ widget: '', kind: 'data', role: k });
  for (const w of (spec && spec.widgets) || []) {
    for (const k of ['x', 'y', 'field', 'typeField', 'nameField']) if (w[k] === column) out.push({ widget: w.id, kind: w.kind, role: k });
    if (Array.isArray(w.columns) && w.columns.includes(column)) out.push({ widget: w.id, kind: w.kind, role: 'columns' });
    if (Array.isArray(w.items)) w.items.forEach((m, i) => { if (m && m.field === column) out.push({ widget: w.id, kind: w.kind, role: 'items[' + i + '].field' }); });
  }
  return out;
}

/** A copy of `spec` in which every reference to `from` reads `to`. */
export function renameInSpec(spec, from, to) {
  const s = JSON.parse(JSON.stringify(spec || {}));
  if (s.data) for (const k of ['lngField', 'latField', 'timeField']) if (s.data[k] === from) s.data[k] = to;
  for (const w of s.widgets || []) {
    for (const k of ['x', 'y', 'field', 'typeField', 'nameField']) if (w[k] === from) w[k] = to;
    if (Array.isArray(w.columns)) w.columns = w.columns.map((c) => (c === from ? to : c));
    if (Array.isArray(w.items)) w.items.forEach((m) => { if (m && m.field === from) m.field = to; });
  }
  return s;
}

/** The properties of every row, as plain objects — the snapshot a delta is later measured against. */
export function snapshotRows(rows) { return (rows || []).map((r) => ({ ...((r && r.properties) || {}) })); }

const same = (a, b) => (a == null && b == null) || a === b;

/**
 * diffRows(base, rows) → {cells:[{index, field, from, to}], added:[col], removed:[col], rows:{base, now}}
 * Rows are matched by position (an edit never reorders; a feed appends, so rows past the snapshot are `rows.now - rows.base`).
 */
export function diffRows(base, rows) {
  const now = snapshotRows(rows), cells = [], bcols = new Set(), ncols = new Set();
  base.forEach((p) => Object.keys(p).forEach((k) => bcols.add(k)));
  now.forEach((p) => Object.keys(p).forEach((k) => ncols.add(k)));
  const added = [...ncols].filter((k) => !bcols.has(k)), removed = [...bcols].filter((k) => !ncols.has(k));
  const n = Math.min(base.length, now.length);
  for (let i = 0; i < n; i++) for (const k of ncols) if (bcols.has(k) && !same(base[i][k], now[i][k])) cells.push({ index: i, field: k, from: base[i][k] == null ? null : base[i][k], to: now[i][k] == null ? null : now[i][k] });
  return { cells, added, removed, rows: { base: base.length, now: now.length } };
}

const show = (v) => (v == null ? '(empty)' : String(v));

/**
 * deltaText({delta, state, title, label(i), L, max}) → the message Atlas continues from.
 * `label(i)` names a row for a human (its name-like cell). The count of cells beyond `max` is stated, never silently dropped.
 */
export function deltaText(o) {
  const { delta, state, title, label, L, max = 30 } = o;
  const lines = [];
  lines.push(L('I edited the workspace "' + title + '". Re-run the analysis on the edited data and tell me what changed.', 'ワークスペース「' + title + '」を編集しました。編集後のデータで分析をやり直し、何が変わったか教えてください。'));
  if (delta.cells.length) {
    lines.push(L('Edited values (' + delta.cells.length + '):', '編集した値 (' + delta.cells.length + ' 件):'));
    delta.cells.slice(0, max).forEach((c) => lines.push('- ' + (label ? label(c.index) : '#' + (c.index + 1)) + ' · ' + c.field + ': ' + show(c.from) + ' → ' + show(c.to)));
    if (delta.cells.length > max) lines.push(L('… and ' + (delta.cells.length - max) + ' more', '… ほか ' + (delta.cells.length - max) + ' 件'));
  }
  if (delta.added.length) lines.push(L('Added columns: ', '追加した列: ') + delta.added.join(', '));
  if (delta.removed.length) lines.push(L('Removed columns: ', '削除した列: ') + delta.removed.join(', '));
  const fs = Object.values((state && state.filters) || {});
  if (fs.length) lines.push(L('Active filters: ', '適用中のフィルタ: ') + fs.map((f) => f.field + (Array.isArray(f.values) ? ' ∈ {' + f.values.join(', ') + '}' : ' ' + (f.min != null ? f.min : '…') + '–' + (f.max != null ? f.max : '…'))).join('; '));
  if (state && state.time) lines.push(L('Time window: up to ' + state.time.year, '時間窓: ' + state.time.year + ' 年まで'));
  const sel = (state && state.selection) || [];
  if (sel.length) lines.push(L('Selected rows: ', '選択中の行: ') + sel.slice(0, 10).map((i) => (label ? label(i) : '#' + (i + 1))).join(', ') + (sel.length > 10 ? ' …' : ''));
  if (!delta.cells.length && !delta.added.length && !delta.removed.length && !fs.length && !sel.length) lines.push(L('(No edits yet — use the current data as it is.)', '(まだ編集はありません。現在のデータのままで)'));
  return lines.join('\n');
}

/** The reader's words for the data layer's refusals. A code with no entry is shown as itself — never guessed at. */
export function editRefusal(why, detail, L) {
  const d = (detail && typeof detail === 'object') ? detail : {};
  const T = {
    'edit-would-contradict-recipe': () => L('This table is the result of a GIS step, so editing it would contradict how it was made. Change the step\'s parameter instead.', 'この表は GIS 処理の結果なので、編集すると作り方と食い違います。処理側のパラメータを変えてください。'),
    'field-has-dependents': () => L('Another dataset is built from this column (' + (d.dependents || []).join(', ') + '), so it is not changed.', 'この列から別のデータセット (' + (d.dependents || []).join(', ') + ') が作られているため、変更しません。'),
    'field-in-time-axis': () => L('This column is the time axis, so it is not renamed or removed.', 'この列は時間軸なので、名前変更・削除はしません。'),
    'field-exists': () => L('A column named "' + d.field + '" already exists.', '「' + d.field + '」という列が既にあります。'),
    'unknown-field': () => L('There is no column "' + d.field + '".', '「' + d.field + '」という列はありません。'),
    'input-stale': () => L('The data this one came from changed; recalculate it first.', '元のデータが変わっているため、先に再計算してください。'),
    'column-in-use': () => L('A widget is drawn from this column (' + (d.uses || []).map((u) => (u.widget || u.role)).join(', ') + '); change that first.', 'この列から描いている部品があります (' + (d.uses || []).map((u) => (u.widget || u.role)).join(', ') + ')。先にそちらを変えてください。'),
    'not-a-number': () => L('"' + d.value + '" is not a number, and this column holds numbers.', '「' + d.value + '」は数値ではありません。この列は数値です。'),
    'no-dataset': () => L('This board has no editable data behind it.', 'このボードには編集できるデータがありません。'),
    'nothing-to-undo': () => L('Nothing to undo.', '取り消せる編集がありません。'),
    'nothing-to-redo': () => L('Nothing to redo.', 'やり直せる編集がありません。'),
  };
  const t = T[why];
  return t ? t() : String(why || 'refused');
}
