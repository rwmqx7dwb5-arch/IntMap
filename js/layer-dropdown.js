/* ============================================================================
 *  IntMap · the layers menu and its accordion  (#R200)
 * ----------------------------------------------------------------------------
 *  ══ ⚠⚠⚠ (#R296) THERE IS NO CLASSIC DROPDOWN ANY MORE ════════════════════════════════════════
 *  「レイヤー選択欄はclassic dropdownを完全削除。（右サイドバー形式に一本化し、設定から該当項目を削除。）」
 *
 *  What is gone is the SURFACE: the panel that opened under the Layers button, its outside-click
 *  dismissal, its hoist-and-position, its own search box (js/map-extras.js) and the Settings row that
 *  chose between it and the right sidebar. `#btn-layers` opens `IntMapLayerSidebar` and nothing else,
 *  on every device — the phone's «Map & layers» sheet already mounted that same tile grid (#R232).
 *
 *  ⚠ WHAT IS NOT GONE, AND WHY. `#layer-dropdown` is not only a panel — it is where EVERY layer
 *  checkbox in this program lives. Counted before touching it: 71 references across 20 files, and the
 *  right sidebar itself is built by walking it (`rowsFromDropdown()` in js/map-ui.js), as are the
 *  layer presets, Atlas's layer catalogue, the feedback report and the share links. So the element
 *  stays as the REGISTRY it always also was, permanently `display:none`, and every module that puts a
 *  checkbox in it keeps working unchanged. Deleting the node would not have removed a dropdown; it
 *  would have removed the layers.
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
  /* ⚠ (#R296) ONE DESTINATION. The button used to have three behaviours (right sidebar / classic
     dropdown / phone sheet) chosen by a setting that no longer exists; now it has one, and the phone
     reaches the same grid through its own sheet. The `.show` class, the hoist into #map-container and
     the document-level click that dismissed the panel all went with the surface — there is nothing to
     dismiss, so the legend-× exception that existed only to stop it dismissing went too. */
  document.getElementById('btn-layers').addEventListener('click',(e)=>{ e.stopPropagation();
    try{ if(window.IntMapLayerSidebar) window.IntMapLayerSidebar.toggle(); }catch(_){}
  });
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
  /* ⚠ (#R296) THREE LISTENERS ON THE REGISTRY WENT WITH THE SURFACE — a click handler on a node that
     is permanently `display:none` can never fire, and #R268's lesson is that a line nothing calls is
     worse than no line: the accordion toggle, the collapse-on-open pass and the stopPropagation guard
     all only ever ran because the panel was on screen. `_collapseGroup` and `_expandAllLayerGroups`
     STAY — they are called from js/data-layers.js and js/map-extras.js, which reorganise the registry
     itself, and the right sidebar reads that structure (`rowsFromDropdown`) to group its tiles. */
  document.getElementById('btn-layers').addEventListener('click',()=>{ try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} });
  return { _collapseGroup };
}
