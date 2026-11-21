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

export default [
  {
    row: ['board.compose',              'board',          'composeBoard'                                ,                           'panel',   'none',    'panel.board',            'panel,explanation',   'session', 'none',   '',         'board'],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'board.compose', text: 'OPERABLE WORKSPACE (a screen the reader can work, as an OUTPUT of your answer): {"type":"board","title":str,"source":str,"data":{"dataset":ID}|{"rows":[{col:value,…}],"lngField"?:str,"latField"?:str},"widgets":[{"kind":"table","columns"?:[str]}|{"kind":"chart","chart":"bar"|"line","x":COL,"y":COL}|{"kind":"filter","field":COL,"control":"range"|"category"}|{"kind":"map"}|{"kind":"evidence"}|{"kind":"param","dataset":ID,"key":str,"min":num,"max":num,"step"?:num}],"save"?:bool}. Use it when the answer is DATA the reader will want to sort, filter, select and compare (a ranking, a comparison, the result of a GIS step) — one click on a row, mark or point highlights it everywhere, a filter narrows every widget, and a `param` re-runs the GIS step it names and everything made from it. `source` is REQUIRED (where the numbers came from). Columns must exist in the data; `data.rows` are your own records (max 2000), `data.dataset` is an id from a GIS result. Prefer 2-4 widgets: table + chart + filter (+ map when rows have lng/lat). Never invent rows. "save":true keeps it on this device so board.restore can bring it back.\n操作できる画面を答えとして出す宣言。表・グラフ・フィルタ・地図を組み合わせ、1つの要素の選択が他の要素に連動更新する。出典は必須、列名は実在するものだけ。\n' },
    ],
    schema: () => ({ type: 'object', required: ['source', 'data', 'widgets'], properties: { title: str(), source: str(), save: { type: 'boolean' },
      data: { type: 'object', properties: { dataset: str(), rows: list(obj(), 1, 2000), lngField: str(), latField: str() } },
      widgets: list({ type: 'object', required: ['kind'], properties: { kind: one('table', 'chart', 'filter', 'map', 'evidence', 'param'), id: str(), title: str(), columns: list(str()), chart: one('bar', 'line'), x: str(), y: str(), field: str(), control: one('range', 'category'), dataset: str(), key: str(), min: num(), max: num(), step: num() } }, 1, 12) } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, esc = K.esc, L = K.L;
      await window.IntMapLazy.need('board');
      const B = window.IntMapBoard; if (!B) return R(false, warn(L('The workspace could not be loaded.', 'ワークスペースを読み込めませんでした。')));
      const r = B.open(a);
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
];
