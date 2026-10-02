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
import { list, obj } from './atlas-caps.js';

export default [
  {
    row: ['ui.inlineControls',          'controls',       '',                                                            'ui',      'none',    '',                       'panel',               'session', 'none',   '',         ''],
    doc: [
      { in: 'ui.inlineControls', text: 'INLINE CONTROLS: {"type":"controls","items":[{"kind":"layerToggle","layer":EXACT_LAYER_NAME}|{"kind":"opacity","layer":EXACT_LAYER_NAME}|{"kind":"button","label":str,"run":str}]} renders WORKING switches/sliders/buttons inside your chat reply ("run" = the Atlas command the button fires). Append it when the user would plausibly want to adjust what you just did (e.g. after enabling layers, offer their toggles + opacity sliders; after a comparison, offer "add Korea" buttons). Max 8 items.\n' },
    ],
    /* (§14) a FALLBACK: reachable, but not a user-facing feature — kept out of the search's front rank so it cannot crowd out a real capability */
    policy: { fallback: true },
    catalogueSilent: '2026-09-18',   /* ㉓'s ledger (#R802, measured that day): its `doc` does not yet name its own subject in both en and jp — delete this line when it does */
    schema: () => ({ type: 'object', properties: { items: list(obj(), 1) }, required: ['items'] }), /* `controls` */
    async run(a, dctx, K) { const R = K.R, warn = K.warn, resolveLayer = K.resolveLayer, esc = K.esc, layerOpacityControl = K.layerOpacityControl, L = K.L;
      { /* (#R72) interactive UI inside the reply ("Atlasの返答内からもボタンやスライダーを配置") */
          const items=Array.isArray(a.items)?a.items.slice(0,8):[];
          if(!items.length) return R(false, warn('⚠'));
          let h='<div style="display:flex;flex-direction:column;gap:7px;margin:4px 0 2px;">'; let any=false;
          for(const it of items){ const kind=String((it&&it.kind)||'').toLowerCase();
            if(kind==='layertoggle'||kind==='layer'){ const rl=resolveLayer(String(it.layer||it.name||'')); if(!rl) continue; any=true;
              h+='<div class="atl-ctl-row"><span class="atl-ctl-lbl">'+esc(rl.label)+'</span><button class="atl-ctl-toggle'+(rl.cb.checked?' on':'')+'" data-layer="'+esc(rl.label)+'" data-cb="'+esc(rl.cb.id||'')+'" role="switch" aria-checked="'+(rl.cb.checked?'true':'false')+'"><span class="atl-ctl-knob"></span></button></div>'; }
            else if(kind==='opacity'||kind==='slider'){ const rl=resolveLayer(String(it.layer||it.name||'')); if(!rl) continue; const sl=layerOpacityControl(rl.cb); if(!sl) continue; any=true;
              h+='<div class="atl-ctl-row"><span class="atl-ctl-lbl">'+esc(rl.label)+' · '+L('opacity','不透明度','Deckkraft','непрозрачность','opacidad')+'</span><input type="range" class="atl-ctl-op" data-layer="'+esc(rl.label)+'" data-cb="'+esc(rl.cb.id||'')+'" min="0" max="1" step="0.05" value="'+esc(sl.value)+'"></div>'; }
            else if(kind==='button'){ const lbl=String(it.label||'').slice(0,40); const cmd=String(it.run||it.command||'').slice(0,160); if(!lbl||!cmd) continue; any=true;
              h+='<button class="atl-ctl-btn" data-run="'+esc(encodeURIComponent(cmd))+'">'+esc(lbl)+'</button>'; } }
          h+='</div>';
          return R(any, any?h:warn('⚠')); }
    },
  },
];
