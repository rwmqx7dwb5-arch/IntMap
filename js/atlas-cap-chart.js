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
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
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
    doc: [
      { in: 'chart.compose', text: 'DRAW THE NUMBERS (a chart as an OUTPUT of your answer, the way `compose` is for the map): {"type":"chart","kind":"line"|"bar"|"scatter"|"timeline","source":str,"title"?:str,"series"?:[{"label"?:str,"points":[{"x":num,"y":num,"label"?:str}]}],"events"?:[{"t":ISO_DATE,"label":str}],"x"?:{"label"?:str,"type"?:"number"|"year"},"y"?:{"label"?:str}}. "bar" is a ranked comparison and keeps YOUR order — put the rows in the order the answer argues for them, and give every row a `label`. "line" and "scatter" plot x against y. "timeline" takes `events` with a real date each and lays them on a time axis, which is how to show a stretch of history in one figure instead of the map at one instant of it. Use it whenever your answer turns on how values COMPARE, how something MOVED over time, whether two quantities go together, or WHEN a sequence of events happened — 「推移をグラフで」「上位10か国を比べて」「年表にして」, "chart that", "plot x against y", "show me the trend", "make a timeline". It draws into the reply and changes nothing on the map, so it costs the reader no undo and combines freely with `compose`. ⚠ "source" IS REQUIRED AND THE CALL IS REFUSED WITHOUT IT: name where the numbers came from — the capability whose result you are drawing ("data.rank", "the compareStats run above"), the dataset ("World Bank WDI 2024"), or your own knowledge, said plainly. A chart is the most credible shape a claim can take, so it has to carry its origin. ⚠ NEVER INVENT A NUMBER TO MAKE A CURVE LOOK RIGHT, and never pad a series to reach the minimum: a line or scatter needs 3 real points, a bar needs 2 labelled values, a timeline needs 2 dated events, and the call is REFUSED below those rather than drawn thin — the refusal names what was missing so you can answer in words instead. Values that are not numbers are DROPPED and the caption says how many, so a chart never quietly plots only the rows that happened to parse. When the chart carries part of your answer, declare answer_mode "chart" (or "mixed" when the map carries part of it too).\n' },
    ],
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
