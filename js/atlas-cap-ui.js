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
 *  The prose the planner reads stays in js/atlas-catalog-text.js (a block names the ids it documents).
 * ==========================================================================*/
import { list, obj } from './atlas-caps.js';

export default [
  {
    row: ['ui.inlineControls',          'controls',       '',                                                            'ui',      'none',    '',                       'panel',               'session', 'none',   '',         ''],
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
