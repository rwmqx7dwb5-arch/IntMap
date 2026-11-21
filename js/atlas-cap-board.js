/* ============================================================================
 *  IntMap · Atlas capabilities — the `board.*` namespace   (js/atlas-cap-board.js)
 * ----------------------------------------------------------------------------
 *  An operable screen as an ANSWER: Atlas declares which widgets (table, chart, filter, map, evidence,
 *  param) look at which data, and js/board.js draws them linked through one shared state. The
 *  declaration is checked by js/board-spec.js — a column the data does not have, an unknown widget kind,
 *  a missing source are refused BY NAME — and no HTML, script or selector ever comes from Atlas.
 *  Entry layout, derivation and the generated files: see js/atlas-cap-ui.js and js/atlas-caps.js.
 * ==========================================================================*/
import { str, num, one, list, obj } from './atlas-caps.js';
import { worldObjects } from './atlas-world-objects.js';   /* the session's real-world objects: handed to the board as ROWS, so js/board.js never imports them */

/* `data.worldObjects` → inline rows. The conversion is here (the capability's side) because the board and its spec stay
   ignorant of where rows come from: one row per object, the columns a reader would sort by. `at` is the ISO moment (the board's
   `timeField`), `related` the number of OTHER session objects it relates to by the index's own rule (linked, or near + concurrent). */
const OBJECT_ROWS_MAX = 500;   /* related() is pairwise over the session's objects: bounded so the call stays instant; the session index itself is small (observed: tens) */
export function objectRows(want) {
  const types = want && Array.isArray(want.types) ? want.types.map(String) : [];
  const all = worldObjects.all().filter((o) => !types.length || types.includes(o.type)).slice(0, OBJECT_ROWS_MAX);
  return all.map((o) => {
    const b = worldObjects.brief(o) || {};
    let related = 0; try { related = worldObjects.related(o).total || 0; } catch (_) { related = 0; }
    return { ref: b.ref, type: b.type, name: b.name || b.ref, country: b.country || '', at: b.at || '', lng: b.lng, lat: b.lat, related, source: (b.sources && b.sources[0] && b.sources[0].name) || (b.provenance && (b.provenance.source || b.provenance.kind)) || '' };
  });
}

export default [
  {
    row: ['board.compose',              'board',          'composeBoard'                                ,                           'panel',   'none',    'panel.board',            'panel,explanation',   'session', 'none',   '',         'board'],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'board.compose', text: 'OPERABLE WORKSPACE (a screen the reader can work, as an OUTPUT of your answer): {"type":"board","title":str,"source":str,"data":{"dataset":ID}|{"rows":[{col:value,…}],"lngField"?:str,"latField"?:str,"timeField"?:str},"widgets":[{"kind":"table","columns"?:[str]}|{"kind":"chart","chart":"bar"|"line","x":COL,"y":COL}|{"kind":"filter","field":COL,"control":"range"|"category"}|{"kind":"map"}|{"kind":"evidence"}|{"kind":"param","dataset":ID,"key":str,"min":num,"max":num,"step"?:num}|{"kind":"metrics","items":[{"label":str,"agg":"count"|"sum"|"mean"|"min"|"max","field"?:COL,"unit"?:str}]}|{"kind":"objects"}|{"kind":"time","mode"?:"upto"|"at"}],"save"?:bool}; data may also say, instead of rows, "worldObjects":true|{"types"?:[str]} = the real-world objects surfaced in this session (columns ref,type,name,country,at,lng,lat,related,source; timeField defaults to "at"; an `objects` widget links to the real map). `metrics` figures are computed from the visible rows — or the selected ones — so a filter, a selection or the clock moving updates them. Use it when the answer is DATA the reader will want to sort, filter, select and compare (a ranking, a comparison, the result of a GIS step) — one click on a row, mark or point highlights it everywhere, a filter narrows every widget, and a `param` re-runs ONLY the GIS step it names and what depends on it. The map widget with "link":true draws the rows on the real IntMap map and links both ways (a shape clicked there selects here and the reverse); a `time` widget (needs data.timeField, a column of years or ISO dates) follows and moves the master Chronos clock. Several boards may be open at once on a desktop. To put a SMALL version in the answer, use the same declaration as a `board` block of `dashboard`. `source` is REQUIRED (where the numbers came from). Columns must exist in the data; `data.rows` are your own records (max 2000), `data.dataset` is an id from a GIS result. Prefer 2-4 widgets: table + chart + filter (+ map when rows have lng/lat). Never invent rows. "save":true keeps it on this device so board.restore can bring it back.\n操作できる画面を答えとして出す宣言。表・グラフ・フィルタ・地図を組み合わせ、1つの要素の選択が他の要素に連動更新する。出典は必須、列名は実在するものだけ。\n' },
    ],
    schema: () => ({ type: 'object', required: ['source', 'data', 'widgets'], properties: { title: str(), source: str(), save: { type: 'boolean' },
      data: { type: 'object', properties: { dataset: str(), rows: list(obj(), 1, 2000), lngField: str(), latField: str(), timeField: str(), worldObjects: { type: 'object' } } },
      widgets: list({ type: 'object', required: ['kind'], properties: { kind: one('table', 'chart', 'filter', 'map', 'metrics', 'objects', 'evidence', 'param', 'time'), items: list(obj(), 1, 8), typeField: str(), nameField: str(), id: str(), mode: one('upto', 'at'), link: { type: 'boolean' }, title: str(), columns: list(str()), chart: one('bar', 'line'), x: str(), y: str(), field: str(), control: one('range', 'category'), dataset: str(), key: str(), min: num(), max: num(), step: num() } }, 1, 12) } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, esc = K.esc, L = K.L;
      await window.IntMapLazy.need('board');
      const B = window.IntMapBoard; if (!B) return R(false, warn(L('The workspace could not be loaded.', 'ワークスペースを読み込めませんでした。')));
      let spec = a;
      if (a.data && a.data.worldObjects && !a.data.dataset && !(a.data.rows && a.data.rows.length)) {
        const rows = objectRows(a.data.worldObjects);
        if (!rows.length) return R(false, warn(L('No real-world objects have been surfaced in this session yet — ask about an earthquake, a place or a company first.', 'このセッションではまだ実世界のオブジェクトが出ていません——先に地震・場所・企業などを調べてください。')));
        spec = Object.assign({}, a, { data: { rows, lngField: 'lng', latField: 'lat', timeField: (a.data.timeField || 'at') } });
      }
      const r = B.open(spec);
      if (!r.ok) { const why = (r.issues || []).map((i) => i.path + ' ' + i.why).join('; ') || r.why; return R(false, warn(L('The workspace was refused: ', 'ワークスペースを作れませんでした: ') + esc(why))); }
      let saved = ''; if (a.save) { const s = await B.save(); saved = s.ok ? ' · ' + L('saved on this device', 'この端末に保存') : ' · ' + L('could not be saved', '保存できませんでした'); }
      return R(true, note('✓ ' + esc(r.title) + ' — ' + r.widgets.map((w) => w.kind).join(' + ') + ' · ' + r.rows + L(' rows', ' 行') + esc(saved)));
    },
  },
  {
    row: ['board.restore',              'boardRestore',   'openBoard,savedBoards',                                       'panel',   'none',    'panel.board',            'panel,explanation',   'session', 'none',   '',         'board'],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'board.restore', text: 'REOPEN A SAVED WORKSPACE: {"type":"boardRestore","name"?:str}. The name (or part of it) of a board saved earlier; with no name the latest opens. A name that matches nothing answers with the list of saved boards. Selection, filters and parameter values come back as they were.\n保存した操作画面を開き直す。名前を省くと最新。選択・フィルタ・パラメータは保存時のまま戻る。\n' },
    ],
    schema: () => ({ type: 'object', properties: { name: str() } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, esc = K.esc, L = K.L;
      await window.IntMapLazy.need('board');
      const B = window.IntMapBoard; if (!B) return R(false, warn(L('The workspace could not be loaded.', 'ワークスペースを読み込めませんでした。')));
      const r = await B.restore(a && a.name);
      if (!r.ok) { const have = (r.boards || []).map((b) => b.title).join(', '); return R(false, warn(L('No saved workspace opened (' + esc(r.why) + ').', '保存済みのワークスペースを開けませんでした (' + esc(r.why) + ')。') + (have ? ' ' + L('Saved boards: ', '保存済みのボード: ') + esc(have) : ''))); }
      return R(true, note('✓ ' + esc(r.title) + ' — ' + L('restored', '復元しました')));
    },
  },
  {
    row: ['board.edit',                 'boardEdit',      'editBoard,editTable,editWorkspace,changeCell,setCell',        'panel',   'none',    'panel.board',            'panel,explanation',   'session', 'none',   '',         'board'],
    ui: { none: '2026-11-21' },
    doc: [
      { in: 'board.edit', text: 'EDIT THE OPEN WORKSPACE (the same edits the reader makes in its table — one door): {"type":"boardEdit","op":"cells"|"addColumn"|"renameColumn"|"removeColumn"|"filter"|"undo"|"redo","id"?:boardId,"edits"?:[{"index"?:int(0-based row),"where"?:{"field":COL,"equals":value},"field":COL,"value":v}],"name"?:str,"value"?:v,"from"?:COL,"to"?:str,"widget"?:filterWidgetId,"field"?:COL,"values"?:[str],"min"?:num,"max"?:num,"clear"?:bool}. `cells` sets values (a `where` edits EVERY row whose column equals that value; a number column takes a number or the edit is refused); the table, chart, map and metrics redraw at once. `addColumn` adds a column to every row (then fill it with `cells`); `renameColumn` carries the widgets with it; `removeColumn` is refused while a widget is drawn from it. `filter` narrows every widget (a column with no filter widget works too); "clear":true lifts it. All of it is undoable (`undo`/`redo`). A table that is the RESULT of a GIS step is refused by name — change that step\'s parameter instead. Use after the reader says "change this value / add a column / filter to X", or to write your recalculation back into the workspace the reader is looking at. To see what the READER changed, call board.delta.\nいま開いているワークスペースを編集する(表でユーザーが行うのと同じ操作)。値の変更・列の追加/改名/削除・フィルタ・取り消し。表・グラフ・地図が即座に連動する。\n' },
    ],
    schema: () => ({ type: 'object', required: ['op'], properties: { op: one('cells', 'addColumn', 'renameColumn', 'removeColumn', 'filter', 'undo', 'redo'), id: str(),
      edits: list({ type: 'object', required: ['field', 'value'], properties: { index: num(), where: obj(), field: str(), value: {} } }, 1, 500),
      name: str(), value: {}, from: str(), to: str(), widget: str(), field: str(), values: list(str(), 1, 50), min: num(), max: num(), clear: { type: 'boolean' } } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, esc = K.esc, L = K.L;
      await window.IntMapLazy.need('board');
      const B = window.IntMapBoard, W = B && B.api(a.id); if (!W) return R(false, warn(L('No workspace is open to edit — open one first (board.compose or board.restore).', '編集できるワークスペースが開いていません。先に開いてください。')));
      await W.prepare();
      const out = (r, what) => (r && r.ok ? R(true, note('✓ ' + esc(what)), { board: { id: W.id, delta: W.delta(), history: W.history() } }) : R(false, warn(esc((r && r.text) || (r && r.why) || 'refused'))));
      if (a.op === 'cells') {
        const edits = [];
        for (const e of a.edits || []) {
          if (Number.isInteger(e.index)) { edits.push({ index: e.index, field: e.field, value: e.value }); continue; }
          if (e.where && e.where.field) {
            const hit = W.rows().map((r, i) => [i, (r.properties || {})[e.where.field]]).filter(([, v]) => String(v) === String(e.where.equals)).map(([i]) => i);
            if (!hit.length) return R(false, warn(L('No row has ', '該当する行がありません: ') + esc(e.where.field) + ' = ' + esc(String(e.where.equals))));
            hit.forEach((i) => edits.push({ index: i, field: e.field, value: e.value }));
          } else return R(false, warn(L('Each edit needs an index or a where.', '各編集には index か where が必要です。')));
        }
        const r = W.setCells(edits); return out(r, L('Edited ' + edits.length + ' value(s)', edits.length + ' 件の値を編集しました'));
      }
      if (a.op === 'addColumn') return out(W.addColumn(a.name, a.value), L('Column added: ', '列を追加: ') + a.name);
      if (a.op === 'renameColumn') return out(W.renameColumn(a.from, a.to), L('Renamed ', '名前を変更: ') + a.from + ' → ' + a.to);
      if (a.op === 'removeColumn') return out(W.removeColumn(a.name), L('Removed column ', '列を削除: ') + a.name);
      if (a.op === 'undo') return out(W.undo(), L('Undone', '元に戻しました'));
      if (a.op === 'redo') return out(W.redo(), L('Redone', 'やり直しました'));
      if (a.op === 'filter') {
        if (!a.field) return R(false, warn(L('A filter needs a column (field).', 'フィルタには列 (field) が必要です。')));
        const wid = a.widget || ('f_' + a.field);
        if (a.clear) { W.setFilter(wid, null); return R(true, note('✓ ' + esc(L('Filter cleared: ', 'フィルタを解除: ') + a.field)), { board: { id: W.id, delta: W.delta() } }); }
        const f = Array.isArray(a.values) && a.values.length ? { field: a.field, values: a.values.map(String) } : { field: a.field, min: a.min, max: a.max };
        if (!(f.values) && f.min == null && f.max == null) return R(false, warn(L('A filter needs values, or min / max.', 'フィルタには values か min / max が必要です。')));
        W.setFilter(wid, f); return R(true, note('✓ ' + esc(L('Filtered by ', 'フィルタ: ') + a.field)), { board: { id: W.id, delta: W.delta() } });
      }
      return R(false, warn(L('Unknown op.', '不明な op です。')));
    },
  },
  {
    row: ['board.delta',                'boardDelta',     'boardChanges,whatDidIChange,workspaceDiff',                    'panel',   'none',    '',                       'explanation',         'read',    'none',   '',         'board'],
    ui: { none: '2026-11-21' },
    doc: [
      { in: 'board.delta', text: 'WHAT THE READER CHANGED in the open workspace: {"type":"boardDelta","id"?:boardId}. Returns the edited values (row, column, before → after), added/removed columns, active filters, the time window and the selected rows, measured against the data the workspace was opened with. Call it when the reader says "I edited it — redo / update the analysis", then continue FROM those numbers (recalculate, and write the result back with board.edit or answer with board.compose).\nユーザーがワークスペースで何を変えたか(編集値・追加列・フィルタ・時間窓・選択)を返す。「編集したので再分析して」と言われたらこれを呼び、その数値から続ける。\n' },
    ],
    schema: () => ({ type: 'object', properties: { id: str() } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, esc = K.esc, L = K.L;
      await window.IntMapLazy.need('board');
      const B = window.IntMapBoard, W = B && B.api(a && a.id); if (!W) return R(false, warn(L('No workspace is open.', 'ワークスペースが開いていません。')));
      const d = W.delta(), text = W.deltaText();
      return R(true, note('✓ ' + esc(L(d.cells.length + ' edited value(s), ' + d.added.length + ' added and ' + d.removed.length + ' removed column(s)', '編集 ' + d.cells.length + ' 件・列の追加 ' + d.added.length + '・削除 ' + d.removed.length))), { board: { id: W.id, delta: d, text, rows: W.rows().length } });
    },
  },
];
