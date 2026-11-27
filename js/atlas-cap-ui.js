/* ============================================================================
 *  IntMap · Atlas capabilities — the `ui.*` namespace   (js/atlas-cap-ui.js)
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
import { list, obj, counted } from './atlas-caps.js';
import { checkView, viewSchema, SWITCH, switchCallProblem, blockShapes, BLOCKS, LIMITS, tableMarkdown, metricsHtml, placesHtml, boardHtml, sourceHtml } from './atlas-ui-spec.js';   /* (declarative-workspace) the view's kinds, schema and check */
import { plainText, proseMark } from './atlas-turn-results.js';
import { icon } from './icons.js';
import { IntMapLang } from './lang-registry.js';

/* ══ (declarative-workspace) THE ONE CONTROL RENDERER ════════════════════════════════════════════════════
   ui.inlineControls drew its rows in its run, and a view's "controls" block draws the same rows — so the rows are
   drawn HERE, once, and each item that cannot be drawn says why instead of vanishing. ui.inlineControls keeps what
   it always did with such an item (it leaves it out and draws the rest); ui.compose refuses the view and hands the
   reasons back (js/atlas-ui-spec.js — nothing in a view is dropped silently). */
/* ⚠ (atlas-controls-receipts) WHAT WAS DRAWN IS RETURNED, NOT WHAT WAS ASKED. The rows used to be reported by the arguments, so a call with one good button and
   one broken tab group was recorded as having drawn tabs (the evaluation read `interactive` off the input). Each control that IS drawn gets an id that stands
   on its markup (`data-ctl-id`) and is listed in `drawn` — [{id, kind, at, options?, selected?}] — so a reader of the result (the model, the evaluation, a
   spec) can find exactly that control on the page and press it. An item that was not drawn has no id and is in `problems` instead. */
function controlRows(items, K) {
  const esc = K.esc, L = K.L, resolveLayer = K.resolveLayer, layerOpacityControl = K.layerOpacityControl;
  let h = ''; const problems = [], drawn = []; const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);   /* unique per call and beyond this page load (a reply restored from a saved conversation keeps its ids); no module state — a capability module holds none (scripts/atlas-caps-split.mjs) */
  (items || []).forEach((it, i) => {
    const kind = String((it && it.kind) || '').toLowerCase();
    const cid = 'ctl' + run + '-' + i; const did = ' data-ctl-id="' + cid + '"';
    const drew = (k, extra) => { drawn.push(Object.assign({ id: cid, kind: k, at: '[' + i + ']' }, extra || {})); };
    const no = (code, why) => { problems.push({ at: '[' + i + ']', code, why }); };
    const noAt = (path, why) => { problems.push({ at: '[' + i + '].' + path, code: 'invalid_option', why }); };
    if (kind === 'layertoggle' || kind === 'layer') {
      const rl = resolveLayer(String(it.layer || it.name || '')); if (!rl) return no('unknown_layer', L('names no layer this map has', 'この地図にあるレイヤーを指していません'));
      drew('layerToggle', { layer: rl.label });
      h += '<div class="atl-ctl-row"' + did + '><span class="atl-ctl-lbl">' + esc(rl.label) + '</span><button class="atl-ctl-toggle' + (rl.cb.checked ? ' on' : '') + '" data-layer="' + esc(rl.label) + '" data-cb="' + esc(rl.cb.id || '') + '" role="switch" aria-checked="' + (rl.cb.checked ? 'true' : 'false') + '"><span class="atl-ctl-knob"></span></button></div>';
    } else if (kind === 'opacity' || kind === 'slider') {
      const rl = resolveLayer(String(it.layer || it.name || '')); if (!rl) return no('unknown_layer', L('names no layer this map has', 'この地図にあるレイヤーを指していません'));
      const sl = layerOpacityControl(rl.cb); if (!sl) return no('no_opacity', L('this layer has no opacity control', 'このレイヤーには不透明度の調整がありません'));
      drew('opacity', { layer: rl.label });
      h += '<div class="atl-ctl-row"' + did + '><span class="atl-ctl-lbl">' + esc(rl.label) + ' · ' + L('opacity', '不透明度', 'Deckkraft', 'непрозрачность', 'opacidad') + '</span><input type="range" class="atl-ctl-op" data-layer="' + esc(rl.label) + '" data-cb="' + esc(rl.cb.id || '') + '" min="0" max="1" step="0.05" value="' + esc(sl.value) + '"></div>';
    } else if (kind === 'button') {
      const lbl = String(it.label || '').slice(0, 40); const cmd = String(it.run || it.command || '').slice(0, 160);
      if (!lbl || !cmd) return no('missing', L('a button needs "label" and "run"', 'ボタンには "label" と "run" が必要です'));
      drew('button');
      h += '<button class="atl-ctl-btn"' + did + ' data-run="' + esc(encodeURIComponent(cmd)) + '">' + esc(lbl) + '</button>';
    } else if (kind === 'tabs' || kind === 'steps') {
      /* (atlas-ui-parts) A SWITCH THE ANSWER INVENTS: a row of segments (tabs) or a slider over named stops (steps), each option bound to
         capability calls that run on the press with no model call. What an option does is the CAPABILITIES' vocabulary
         (switchCallProblem names what is allowed), not a list of subjects. */
      const opts = Array.isArray(it.options) ? it.options : [];
      if (opts.length < 2 || opts.length > SWITCH.options) return noAt('options', L('needs 2 to ' + SWITCH.options + ' "options"', '"options" は 2〜' + SWITCH.options + ' 個必要です'));
      const seg = []; let bad = false;
      opts.forEach((o, j) => {
        const lbl = String((o && o.label) || '').slice(0, SWITCH.label), calls = o && Array.isArray(o.calls) ? o.calls : [];
        if (!lbl) { bad = true; return noAt('options[' + j + '].label', L('an option needs a "label"', 'オプションには "label" が必要です')); }
        if (!calls.length || calls.length > SWITCH.calls) { bad = true; return noAt('options[' + j + '].calls', L('needs 1 to ' + SWITCH.calls + ' calls', 'calls は 1〜' + SWITCH.calls + ' 個必要です')); }
        for (let c = 0; c < calls.length; c++) { const why = switchCallProblem(calls[c], K.CAPS, L); if (why) { bad = true; return noAt('options[' + j + '].calls[' + c + ']', why); } }
        seg.push({ lbl, calls });
      });
      if (bad) return;
      const sel = Number.isInteger(it.selected) && it.selected >= 0 && it.selected < seg.length ? it.selected : 0;
      const title = String(it.label || '').slice(0, SWITCH.label);
      const enc = (j) => esc(encodeURIComponent(JSON.stringify(seg[j].calls)));
      drew(kind, { options: seg.length, selected: sel });
      if (kind === 'tabs') {
        h += '<div class="atl-ctl-row atl-ctl-tabrow"' + did + '>' + (title ? '<span class="atl-ctl-lbl">' + esc(title) + '</span>' : '') + '<div class="atl-ctl-tabs" role="tablist">'
          + seg.map((o, j) => '<button type="button" class="atl-ctl-tab' + (j === sel ? ' on' : '') + '" role="tab" aria-selected="' + (j === sel ? 'true' : 'false') + '" data-i="' + j + '" data-calls="' + enc(j) + '">' + esc(o.lbl) + '</button>').join('') + '</div></div>';
      } else {
        h += '<div class="atl-ctl-row atl-ctl-steprow"' + did + '>' + (title ? '<span class="atl-ctl-lbl">' + esc(title) + '</span>' : '')
          + '<div class="atl-ctl-steps"><input type="range" class="atl-ctl-step" min="0" max="' + (seg.length - 1) + '" step="1" value="' + sel + '" aria-label="' + esc(title || seg[sel].lbl) + '"'
          + seg.map((o, j) => ' data-c' + j + '="' + enc(j) + '"').join('') + '>'
          + '<div class="atl-ctl-stops">' + seg.map((o, j) => '<span' + (j === sel ? ' class="on"' : '') + '>' + esc(o.lbl) + '</span>').join('') + '</div></div></div>';
      }
    } else no('unknown_control', L('is not a control kind (layerToggle, opacity, button)', 'はコントロールの種類ではありません（layerToggle, opacity, button）'));
  });
  return { html: h ? '<div style="display:flex;flex-direction:column;gap:7px;margin:4px 0 2px;">' + h + '</div>' : '', problems, drawn };
}

/* the reasons a view was not drawn, as the reader and the model both read them: one line per problem, its path first */
function refusal(problems, K) {
  const esc = K.esc, L = K.L;
  return K.warn(esc(L('The view was not drawn — fix these and send it again:', 'ビューは描いていません——次を直してもう一度送ってください:')))
    + proseMark('<ul class="atl-ui-why">' + problems.map((p) => '<li><code>' + esc(p.at || L('(the view)', '（ビュー）')) + '</code> ' + esc(p.why) + '</li>').join('') + '</ul>');
}

export default [
  {
    row: ['ui.inlineControls',          'controls',       '',                                                            'ui',      'none',    '',                       'panel',               'session', 'none',   '',         ''],
    ui: { none: '2026-11-16' },
    doc: [
      { in: 'ui.inlineControls', text: 'INLINE CONTROLS: {"type":"controls","items":[{"kind":"layerToggle","layer":EXACT_LAYER_NAME}|{"kind":"opacity","layer":EXACT_LAYER_NAME}|{"kind":"button","label":str,"run":str}|{"kind":"tabs"|"steps","label"?:str,"selected"?:int,"options":[{"label":str,"calls":[{"type":CAPABILITY_SPELLING,...its arguments}]}]}]} renders WORKING switches/sliders/buttons inside your chat reply ("run" = the Atlas command the button fires). "tabs" (segments) and "steps" (a slider over named stops) are SWITCHES YOU INVENT: each option is the capability calls (2-6 options, up to 4 calls each: a camera move, a time change, a layer toggle, a dataset drawn ... the same ones you would make yourself, session-reversible only) that run the moment the reader presses it, with no further model call. Use them whenever the answer is the SAME question seen in several states the reader will want to flip between (then and now, one theme and another, before and after) instead of describing each state in words or drawing all of them at once; first leave the map in the state of option "selected" (default 0). Append it when the user would plausibly want to adjust what you just did (e.g. after enabling layers, offer their toggles + opacity sliders; after a comparison, offer "add Korea" buttons). Max 8 items.\n' },
    ],
    /* (§14) a FALLBACK: reachable, but not a user-facing feature — kept out of the search's front rank so it cannot crowd out a real capability */
    policy: { fallback: true },
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { items: list(obj(), 1) }, required: ['items'] }), /* `controls` */
    async run(a, dctx, K) { const R = K.R, warn = K.warn;
      { /* (#R72) interactive UI inside the reply ("Atlasの返答内からもボタンやスライダーを配置") — the rows are drawn by controlRows above */
          const itemCut=counted(a.items,8), items=itemCut.kept, cutMeta={ received: itemCut.received, used: itemCut.used, dropped: itemCut.dropped };
          if(!items.length) return R(false, warn(''));
          const c=controlRows(items, K);
          if (!c.html && c.problems.length) return R(false, refusal(c.problems, K), { meta: { code: 'invalid_controls', drawn: [], problems: c.problems.map((p) => ({ at: p.at, code: p.code })) } });
          const cutW=itemCut.dropped?K.warn(K.L('Only the first '+itemCut.used+' of '+itemCut.received+' controls were drawn; '+itemCut.dropped+' were left out.','コントロール '+itemCut.received+' 件のうち先頭 '+itemCut.used+' 件だけを描きました。残り '+itemCut.dropped+' 件は描いていません。')):'';
          /* (atlas-controls-receipts) meta.drawn is what is on the page; meta.problems what was asked and is not */
          const meta = Object.assign({ drawn: c.drawn }, itemCut.dropped ? { counted: cutMeta, userGoalSatisfied: false } : {}, c.problems.length ? { problems: c.problems.map((p) => ({ at: p.at, code: p.code })) } : {});
          return R(!!c.html, (c.html||warn(''))+cutW, { meta }); }
    },
  },
  /* ⚠⚠ (declarative-workspace) A VIEW — the third thing an answer may BE, after the map (map.compose) and the chart
     (chart.compose): Atlas declares a titled arrangement of figures, a table, prose, a chart, controls and places as
     JSON, and it is drawn ONLY with IntMap's own parts (js/atlas-ui-spec.js says which, checks the whole spec first and
     names every problem). Nothing is executed and no markup from the spec reaches the page. A "chart" block runs
     chart.compose and a "controls" block draws ui.inlineControls' rows — one renderer each, not a second copy.
     `risk` 'session' and `writes` '' as ui.inlineControls: it changes nothing the reader must undo, and a notebook
     replay draws it again (js/atlas-notebook-store.js replayable). */
  {
    row: ['ui.compose',                 'dashboard',      'uiCompose',                                                   'ui',      'none',    '',                       'panel,explanation',   'session', 'none',   '',         ''],
    ui: { none: '2026-11-20' },
    doc: [
      { in: 'ui.inlineControls', at: 10, text: () => '{"type":"dashboard","title"?:str,"blocks":[BLOCK,…]} = A VIEW IN YOUR REPLY (ダッシュボード・ビュー — 結果を1つの画面に組む), where BLOCK is one of: ' + blockShapes()
        + '. Every block may carry "title". Use it when the answer is SEVERAL THINGS the reader will want to look at together and come back to — headline figures with the table behind them, a chart with the switches that change the map under it, the places it is about — 「ダッシュボードにして」「一覧で見せて」「まとめて表示」「比較表とグラフを並べて」, "make a dashboard", "put it in one view". It is drawn into the reply with IntMap\'s own parts and executes nothing; a "chart" block is drawn by `chart` and a "controls" block by `controls`, under their own rules (a chart still needs its source). "source" IS REQUIRED on "metrics" and "table" blocks, as on a chart: name where the numbers came from. NEVER INVENT A VALUE TO FILL A TILE OR A CELL. NO LINKS AND NO HTML anywhere in the spec — a string carrying a URL or a tag is refused (cite sources in your answer). The whole spec is checked before anything is drawn; when it is refused, the result lists EVERY problem with its path (e.g. blocks[2].rows[4]) and the reason — fix them all and send it once. Limits: '
        + LIMITS.blocks + ' blocks, ' + LIMITS.metrics + ' tiles, ' + LIMITS.columns + ' columns, ' + LIMITS.rows + ' rows, ' + LIMITS.places + ' places, ' + LIMITS.specChars + ' characters of JSON.\n' },
    ],
    schema: () => viewSchema(),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, mdMini = K.mdMini, CAPS = K.CAPS;
      const chk = checkView(a, L);
      if (!chk.ok) return R(false, refusal(chk.problems, K), { meta: { code: 'invalid_view', problems: chk.problems.map((p) => ({ at: p.at, code: p.code })) } });
      let nf = null; try { nf = new Intl.NumberFormat(IntMapLang.locale(K.HOST && K.HOST.lang, 'en-GB')); } catch (_) { nf = null; }
      const X = { esc, L, num: (v) => (nf ? nf.format(v) : String(v)), icon: (n) => icon(n, { size: 14 }) };
      const problems = [], parts = [], drawnCtl = [];
      /* a delegated block is the capability's own arguments; the executor's `__` stamps are its bookkeeping, never the spec's */
      const own = (o) => { const c = {}; Object.keys(o || {}).forEach((k) => { if (k.slice(0, 2) !== '__') c[k] = o[k]; }); return c; };
      for (let i = 0; i < a.blocks.length; i++) {
        const b = a.blocks[i], at = 'blocks[' + i + ']', via = BLOCKS[b.kind].via;
        if (via && !(CAPS && CAPS.ofSpelling(via))) { problems.push({ at: at + '.kind', code: 'unavailable', why: L('the capability that draws this block is not in this build', 'このブロックを描く能力がこのビルドにありません') }); continue; }
        let h = '';
        if (b.kind === 'text') h = '<div class="atl-md">' + mdMini(b.md) + '</div>';
        else if (b.kind === 'table') h = '<div class="atl-md">' + mdMini(tableMarkdown(b, X.num)) + '</div>' + (b.caption ? '<div class="atl-ui-cap">' + esc(b.caption) + '</div>' : '') + sourceHtml(b, X);
        else if (b.kind === 'metrics') h = metricsHtml(b, X) + sourceHtml(b, X);
        else if (b.kind === 'places') h = placesHtml(b, X);
        else if (b.kind === 'board') {
          /* the card is drawn from the same declaration board.compose takes; the spec is staged with the board module (not put in markup) and the button opens it */
          try { await window.IntMapLazy.need('board'); } catch (_) { /* reported below */ }
          const BD = window.IntMapBoard; const key = BD && BD.stage ? BD.stage(own(b.board)) : null;
          if (!key) { problems.push({ at: at + '.board', code: 'unavailable', why: L('the workspace could not be loaded', 'ワークスペースを読み込めませんでした') }); continue; }
          h = boardHtml(b, key, X);
        }
        else if (b.kind === 'controls') { const c = controlRows(b.items, K); c.problems.forEach((p) => problems.push({ at: at + '.items' + p.at, code: p.code, why: p.why })); h = c.html; c.drawn.forEach((d) => drawnCtl.push(Object.assign({}, d, { at: at + '.items' + d.at }))); }
        else if (b.kind === 'chart') {
          const r = await K.dispatch(Object.assign(own(b.chart), { type: via }), dctx);
          if (!r || r.ok === false) { problems.push({ at: at + '.chart', code: (r && r.meta && r.meta.code) || 'not_drawn', why: plainText((r && r.html) || '') || L('the chart was not drawn', 'グラフを描けませんでした') }); continue; }
          h = r.html;
        }
        parts.push('<div class="atl-ui-b" data-kind="' + esc(b.kind) + '">' + (b.title ? '<div class="atl-ui-bt">' + esc(b.title) + '</div>' : '') + h + '</div>');
      }
      if (problems.length) return R(false, refusal(problems, K), { meta: { code: 'invalid_view', problems: problems.map((p) => ({ at: p.at, code: p.code })) } });
      const title = a.title ? String(a.title) : '';
      return R(true, '<section class="atl-ui"' + (title ? ' aria-label="' + esc(title) + '"' : '') + '>' + (title ? '<div class="atl-ui-t">' + esc(title) + '</div>' : '') + parts.join('') + '</section>',
        { meta: { view: { blocks: a.blocks.length, kinds: a.blocks.map((b) => b.kind) }, drawn: drawnCtl } });
    },
  },
];
