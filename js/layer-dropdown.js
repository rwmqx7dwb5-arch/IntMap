/* ============================================================================
 *  IntMap · the layers menu and its accordion  (#R200)
 * ----------------------------------------------------------------------------
 *  Opening and closing the Layers dropdown, the outside-click that dismisses it, and the collapsible
 *  group headers (which fold themselves on a phone so the panel never fills the screen).
 *
 *  Lifted verbatim out of js/app-body.js (#R200): 82 of its 82 lines are byte-identical,
 *  and the 0 that are not are all the same rule — #R165's: a closure value js/app-body.js
 *  REASSIGNS at runtime is read through IM_HOST's live accessor (none here),
 *  never captured when this factory ran. Everything else arrives through CTX under its ORIGINAL name,
 *  which is what lets the body below stay word-for-word what it was.
 *
 *  It is a REAL ES module: nothing registers it on window.IntMapModules, nothing in src/main.js orders
 *  it, and js/app-body.js reaches it only through a static `import`. tests/r200-checks.test.mjs derives
 *  both halves of the hand-off — what this file returns and reads, what the core takes and passes — from
 *  the two files themselves, so neither list can drift into a silent `undefined`.
 * ==========================================================================*/
export function makeLayerDropdown(HOST, CTX) {
  const GE=CTX.GE;
  /* ===== Layer dropdown ===== */
  const layerDropdown=document.getElementById('layer-dropdown');
  document.getElementById('btn-layers').addEventListener('click',(e)=>{ e.stopPropagation();
    /* (#R62) opt-in RIGHT layer sidebar (Settings → Layer panel) intercepts on desktop */
    if(window.imLayerPanel==='right' && window.IntMapLayerSidebar){ try{ window.IntMapLayerSidebar.toggle(); return; }catch(_){} }   /* (#R107) also intercept on mobile — the right sidebar layer panel now works on phones */
    layerDropdown.classList.toggle('show');
    /* (#R18) Frosted-glass fix: a backdrop-filter NESTED inside another backdrop-filtered surface
       (.map-view-group toolbar) can only sample within the parent's backdrop root — the map behind was
       never blurred, so in the frosted modes the dropdown read as "完全に透明". Hoist it out to
       #map-container (top of the stacking/backdrop tree) and aim it under the Layers button; the shared
       --glass-* material then frosts it exactly like every other surface. Mobile keeps its sheet mount. */
    try{
      if(layerDropdown.classList.contains('show') && !(window.matchMedia&&window.matchMedia('(max-width:768px)').matches)){
        const mc=document.getElementById('map-container');
        if(!layerDropdown.__home && layerDropdown.parentNode){ const ph=document.createComment('home'); layerDropdown.parentNode.insertBefore(ph,layerDropdown); layerDropdown.__home=ph; }
        if(mc && layerDropdown.parentElement!==mc) mc.appendChild(layerDropdown);
        const br=e.currentTarget.getBoundingClientRect(), mr=mc.getBoundingClientRect();
        layerDropdown.style.top=(br.bottom-mr.top+8)+'px';
        layerDropdown.style.right=Math.max(8,Math.round(mr.right-br.right))+'px';
        layerDropdown.style.left='auto'; layerDropdown.style.marginTop='0'; layerDropdown.style.zIndex='1300';
      }
    }catch(_){}
  });
  /* (#R7-legend-x) A click anywhere on the document used to collapse the Layers dropdown — including a
     click on a layer's legend × (which sits OUTSIDE the dropdown). Keep the dropdown open when the
     click originates inside any legend / its controls, so toggling a legend off doesn't shut the tab. */
  document.addEventListener('click',(e)=>{ if(e.target.closest&&e.target.closest('.data-legend,.koppen-legend,.koppen-info-pop,.layer-popup-x,.legend-min,#layer-sidebar-r')) return; if(layerDropdown.classList.contains('lsr-mode')) return; layerDropdown.classList.remove('show'); });
  /* (#R27) Robust, idempotent fallback for every legend × that carries a data-x layer id. A legend's
     innerHTML is rebuilt on date/opacity/era changes, which replaces the × node and can drop its direct
     .onclick — leaving "凡例の×を押しても反応しない". This delegated listener survives every rebuild. It is
     idempotent (acts only if the layer is still checked), so it never double-fires with a surviving
     direct onclick (that one runs first and unchecks; this then sees checked===false and no-ops). */
  document.addEventListener('click',(e)=>{
    const x=e.target.closest&&e.target.closest('.layer-popup-x'); if(!x) return;
    const lg=x.closest&&x.closest('.data-legend');
    /* (#R40) Resolve the controlling id from data-x → the legend's cbId → its container id, then try EVERY
       checkbox-id convention used across the app. This is what makes "凡例の×を押してもレイヤーが消えない"
       finally reliable for every legend type (generic, worldcover/eco, GIBS, round-9, beta), not just dl-*. */
    let id=x.getAttribute('data-x');
    if(!id && lg){ id=(lg.dataset&&lg.dataset.cbId)||''; if(!id && lg.id) id=lg.id.replace(/^data-legend-/,''); }
    const bare=(id||'').replace(/^eco-/,'').replace(/^gx-/,'').replace(/^dl-/,'');
    if(id){
      const cands=[id,'dl-'+id,'eco-dl-'+id,'gx-'+id,'l9-dl-'+id,'beta-dl-'+id,bare,'dl-'+bare,'eco-dl-'+bare,'gx-'+bare,'ox-'+bare];
      let cb=null; for(const k of cands){ cb=document.getElementById(k); if(cb) break; }
      if(cb&&cb.checked){ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); }
      /* (#R41) BELT-AND-SUSPENDERS — the canonical uncheck above is the clean path, but "凡例の×を押しても
         レイヤーが消えない" still happened when the controlling checkbox couldn't be resolved (custom/legacy
         legends) or its change handler didn't fully hide. So ALSO hide every map layer that matches this id
         directly, regardless of the checkbox. Idempotent + specific (exact ids + lyr-/-fill/-line variants). */
      try{ if(GE().scene.getStyle){ const pats=new Set([id,bare,'lyr-'+id,'lyr-'+bare,id+'-fill',bare+'-fill',id+'-line',bare+'-line','gxlyr-'+bare,'oxl-ox'+bare,'oxl-'+id]);
        GE().scene.getStyle().layers.forEach(L=>{ const lid=L.id; if(pats.has(lid)||lid.indexOf('lyr-'+bare+'-')===0||lid.indexOf('lyr-'+id+'-')===0){ try{ GE().layers.setLayout(lid,'visibility','none'); }catch(_){} } }); } }catch(_){}
    }
    /* always close the legend element itself + re-tile, so the × is never a dead button */
    if(lg){ try{ lg.style.display='none'; }catch(_){} }
    try{ window.tileLegends&&window.tileLegends(); }catch(_){}
    try{ window._sweepOrphanLayers&&window._sweepOrphanLayers(); }catch(_){}
  });
  /* ---- Collapsible layer groups (accordion): tap a section header to fold its layers ---- */
  function _lyrGroupItems(header){ const out=[]; let el=header.nextElementSibling;
    while(el && !el.matches('.layer-group-title,.lyr-head,.premium-group-title') && el.tagName!=='HR'){ out.push(el); el=el.nextElementSibling; } return out; }
  function _layerGroupToggle(header){ const collapsed=header.classList.toggle('lyr-collapsed'); header.dataset.userToggled='1';
    _lyrGroupItems(header).forEach(el=>{ el.style.display=collapsed?'none':''; }); }
  function _collapseGroup(header){ if(header.classList.contains('lyr-collapsed')) return; header.classList.add('lyr-collapsed');
    _lyrGroupItems(header).forEach(el=>{ el.style.display='none'; }); }
  /* (#R18) Mobile shows EVERY group expanded. If groups were collapsed on desktop and the layout then
     crossed to mobile (rotation / resize / split-screen), the collapse's display:none rows survived the
     move into the sheet → rows missing / headers stacked ("Toolsの欄がぐちゃっと"). Reset on mobile entry. */
  window._expandAllLayerGroups=function(){ try{
    layerDropdown.querySelectorAll('.layer-group-title,.lyr-head,.premium-group-title').forEach(h=>h.classList.remove('lyr-collapsed'));
    layerDropdown.querySelectorAll(':scope > .lyr-row, :scope > label.layer-option, :scope > hr, :scope > .lyr-others-note, :scope > .lyr-head, :scope > .layer-group-title').forEach(el=>{ if(el.style && el.style.display==='none') el.style.display=''; });
    /* (#R29) On mobile, re-collapse ONLY "Others (beta)" so it stays a pulldown ("Others(beta)だけプルダウン")
       — unless the user has explicitly opened it this session. Every other group stays expanded. */
    try{ if(window.matchMedia && window.matchMedia('(max-width:768px)').matches){ const oh=Array.from(layerDropdown.querySelectorAll('.lyr-head')).find(h=>h.getAttribute('data-i18n')==='lyrGrpOthers'); if(oh && !oh.dataset.userToggled) _collapseGroup(oh); } }catch(_){}
  }catch(_){} };
  layerDropdown.addEventListener('click',(e)=>{ const h=e.target.closest('.layer-group-title,.lyr-head,.premium-group-title'); if(h && !h.classList.contains('lyr-section-label') && layerDropdown.contains(h)){ e.stopPropagation();
    /* (#R29) Mobile: every group is expanded EXCEPT "Others (beta)", which IS a pulldown the user can
       collapse/expand ("Others(beta)だけプルダウン…元に戻せ"). Other headers stay plain labels on mobile. */
    if(window.matchMedia && window.matchMedia('(max-width:768px)').matches){ if(h.getAttribute('data-i18n')!=='lyrGrpOthers') return; }
    _layerGroupToggle(h); } });
  /* On each open, collapse any group the user hasn't explicitly opened (covers late-added groups). */
  document.getElementById('btn-layers').addEventListener('click',()=>{ try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} setTimeout(()=>{ layerDropdown.querySelectorAll('.layer-group-title,.lyr-head,.premium-group-title').forEach(h=>{ if(!h.dataset.userToggled && !h.classList.contains('lyr-section-label')) _collapseGroup(h); }); },30); });
  layerDropdown.addEventListener('click',(e)=>e.stopPropagation());
  return { _collapseGroup };
}
