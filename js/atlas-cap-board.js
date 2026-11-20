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
      { in: 'board.compose', text: 'OPERABLE WORKSPACE (a screen the reader can work, as an OUTPUT of your answer): {"type":"board","title":str,"source":str,"data":{"dataset":ID}|{"rows":[{col:value,…}],"lngField"?:str,"latField"?:str},"widgets":[{"kind":"table","columns"?:[str]}|{"kind":"chart","chart":"bar"|"line","x":COL,"y":COL}|{"kind":"filter","field":COL,"control":"range"|"category"}|{"kind":"map"}|{"kind":"metrics","items":[{"label":str,"agg":"count"|"sum"|"mean"|"min"|"max","field"?:COL,"unit"?:str}]}|{"kind":"time"}|{"kind":"objects"}|{"kind":"evidence"}|{"kind":"param","dataset":ID,"key":str,"min":num,"max":num,"step"?:num}],"save"?:bool}; data may also say "timeField":COL (a date or year column) and, instead of rows, "worldObjects":true|{"types"?:[str]} = the real-world objects surfaced in this session (columns ref,type,name,country,at,lng,lat,related,source; use timeField "at"). Use it when the answer is DATA the reader will want to sort, filter, select and compare (a ranking, a comparison, the result of a GIS step) — one click on a row, mark or point highlights it everywhere, a filter narrows every widget, and a `param` re-runs the GIS step it names and everything made from it. `source` is REQUIRED (where the numbers came from). Columns must exist in the data; `data.rows` are your own records (max 2000), `data.dataset` is an id from a GIS result. A board is linked to the REAL map and the master clock, not a copy: choosing a row, mark or object with a place flies the main map there, and the `time` widget (needs data.timeField) moves Chronos — every `metrics` figure, table and chart then shows the rows that exist AS OF that moment. `metrics` are computed from the visible (or, when some are selected, the selected) rows. Prefer 2-4 widgets: table + chart + filter (+ map when rows have lng/lat), or objects + time + metrics for "what exists around this event". Never invent rows. "save":true keeps it on this device so board.restore can bring it back.\n操作できる画面を答えとして出す宣言。表・グラフ・フィルタ・地図を組み合わせ、1つの要素の選択が他の要素に連動更新する。出典は必須、列名は実在するものだけ。\n' },
    ],
    schema: () => ({ type: 'object', required: ['source', 'data', 'widgets'], properties: { title: str(), source: str(), save: { type: 'boolean' },
      data: { type: 'object', properties: { dataset: str(), rows: list(obj(), 1, 2000), lngField: str(), latField: str(), timeField: str(), worldObjects: { type: 'object' } } },
      widgets: list({ type: 'object', required: ['kind'], properties: { kind: one('table', 'chart', 'filter', 'map', 'metrics', 'time', 'objects', 'evidence', 'param'), id: str(), title: str(), columns: list(str()), items: list(obj(), 1, 8), typeField: str(), nameField: str(), chart: one('bar', 'line'), x: str(), y: str(), field: str(), control: one('range', 'category'), dataset: str(), key: str(), min: num(), max: num(), step: num() } }, 1, 12) } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, note = K.note, esc = K.esc, L = K.L;
      const Z = window.IntMapLazy; await Z.need('board');
      try { await Z.need('gisCore'); } catch (_) { /* the board still opens; the map link and the clock's date reader degrade to what is loaded */ }
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
];
