/* ============================================================================
 *  IntMap · Atlas capabilities — the `chart.*` namespace   (js/atlas-cap-chart.js)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place:
 *    row     its registry row (its columns are documented at «THE TABLE» in js/atlas-capabilities.js) — the id, the dispatch
 *            spelling, the aliases, the observer, the effects that are also its conflict keys …
 *    schema  its argument schema, built fresh on every call (the builders are in js/atlas-caps.js)
 *    run     what the dispatch runs for it: `run(a, dctx, K)` — the action, the execution context, and
 *            K, the Atlas kernel's internals it needs (js/atlas-console.js builds K; a `let` there is
 *            read and written as `K.name`, so the value is always the live one).
 *  The registry rows (copied into js/atlas-capabilities.js), the dispatch and the schema table are
 *  DERIVED from these entries — `node scripts/atlas-caps.mjs --write` rewrites what is generated after
 *  an entry is added or removed, and `npm run check:capabilities` fails while they disagree.
 *  The prose the planner reads stays in js/atlas-catalog-text.js (a block names the ids it documents).
 * ==========================================================================*/
import { str, num, one, list } from './atlas-caps.js';

export default [
  /* ⚠⚠ (#R543) THE CHART — the second thing an answer is allowed to BE. #R511 made the map an
     output of the answer rather than a side effect of it; the numbers stayed prose. Every row
     above that ranks, compares, relates or queries produces values, and the only way any of them
     reached the reader as a picture was if one of three panels happened to be the thing opened.
     `writes` is empty and `risk` is `read` on purpose: a chart changes nothing the reader has to
     undo — it is drawn INTO the reply, which is also why its observer is `chart` and not `paint`
     (nothing on the map moves, so a map observer would call every chart `not_rendered`). */
  {
    row: ['chart.compose',              'chart',          'chartCompose,plot,graph',                                     'data',    'chart',   '',                       'chart,explanation',   'read',    'none',   '',         'atlasChart'],
    /* (#R543) one chart. `source` is REQUIRED and js/atlas-chart.js refuses the call without it —
       a chart is the most credible shape a claim can take, so it is the shape that has to name
       where its numbers came from. `points` carry x/y as numbers and an optional label; a timeline
       takes `events` with an ISO date instead, because its rows are events and not measurements. */
    schema: () => ({ type: 'object', required: ['kind', 'source'], properties: { kind: one('line', 'bar', 'scatter', 'timeline'), title: str(), source: str(),
        x: { type: 'object', properties: { label: str(), type: one('number', 'year') } }, y: { type: 'object', properties: { label: str() } },
        series: list({ type: 'object', required: ['points'], properties: { label: str(),
          points: list({ type: 'object', properties: { x: num(), y: num(), label: str() } }, 1) } }, 1),
        events: list({ type: 'object', required: ['t', 'label'], properties: { t: str(), label: str() } }, 2) } }),
    async run(a, dctx, K) { const R = K.R, warn = K.warn, L = K.L;
      { await window.IntMapLazy.need('atlasChart'); const _CH=window.IntMapAtlasChart; if(!_CH) return R(false, warn('⚠ '+L('The chart renderer could not be loaded.','グラフ描画モジュールを読み込めませんでした。','Der Diagramm-Renderer konnte nicht geladen werden.','Не удалось загрузить модуль диаграмм.','No se pudo cargar el renderizador de gráficos.'))); const _cr=_CH.render(a); return _cr.ok ? R(true,_cr.html,{meta:{chart:{kind:_cr.kind,plotted:_cr.plotted}}}) : R(false, warn('⚠ '+_cr.detail), {meta:{code:_cr.reason}}); }   /* (#R543) chart.compose — js/atlas-chart.js. The renderer is LAZY (tests/perf-baseline.json pins eager.modules at 284) so there is no import line and no factory line, only this door. ⚠ THE LINE CAME FROM THE FILE'S LAST BLANK LINE — the ceiling (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ, r419 ⓓ, r511 ⑨) is shrink-only and is now at zero: the next capability has to move a SUBJECT out, the way js/atlas-styles.js and js/atlas-sims.js were born. */
    },
  },
];
