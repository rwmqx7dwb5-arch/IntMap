/* ============================================================================
 *  IntMap · Floating-panel drag / resize / z-order  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.windowManager=function(HOST){
  /* (#R14) Draggable panels now support TOUCH too (mobile users reported the tool panel "couldn't be
     moved" — only onmousedown was wired) and CLAMP to the offset-parent so a panel can never be dragged
     off-screen and become unreachable (the other half of the mobile measure complaint, #7). */
  function makeDraggable(panel,handle){
    /* (#R27) ROOT CAUSE of "ポップアップや凡例の×を押しても反応しない" on mobile: the drag handle is the
       panel HEADER, which CONTAINS the close ×. The touchstart below calls preventDefault() — and on
       touch devices preventDefault on touchstart CANCELS the synthesized click, so the ×'s onclick never
       fired. (On desktop, mousedown-preventDefault does NOT cancel click, which is why it worked there.)
       Fix: if the gesture STARTS on a button / control, don't start a drag and don't preventDefault —
       let the tap become a normal click. Dragging from the empty header area still works. */
    const NODRAG='button, input, select, textarea, a, label, [role="button"], .layer-popup-x, .legend-min, .tp-close, .kip-x, .country-popup-close, .pin-popup-close, .src-card-close, .satc-close, .wgt-x, .wgt-cfg';
    const onCtl=(e)=>{ try{ return !!(e.target&&e.target.closest&&e.target.closest(NODRAG)); }catch(_){ return false; } };
    const clampTo=(l,t)=>{ const op=panel.offsetParent||document.documentElement; const ow=op.clientWidth||window.innerWidth, oh=op.clientHeight||window.innerHeight; const pw=panel.offsetWidth||0, ph=panel.offsetHeight||0; return [Math.max(6,Math.min(ow-Math.min(pw,ow)-6,l)), Math.max(6,Math.min(oh-Math.min(ph,oh)-6,t))]; };
    /* (#R16) Write position with INLINE !important. On mobile the .tool-panel rule pins
       `left:12px!important; top:auto!important`, which silently beat the drag's plain inline styles —
       so panels "couldn't be moved" / "only moved left-right". Inline-!important beats stylesheet-
       !important, so the drag now fully controls BOTH axes on phones. data-dragged lets any
       :not([data-dragged]) auto-placement leave it alone. */
    const move=(cx,cy)=>{ if(!HOST.panelDrag)return; const c=clampTo(HOST.panelDrag.l+cx-HOST.panelDrag.x, HOST.panelDrag.t+cy-HOST.panelDrag.y);
      panel.style.setProperty('left',c[0]+'px','important'); panel.style.setProperty('top',c[1]+'px','important');
      panel.style.setProperty('right','auto','important'); panel.style.setProperty('bottom','auto','important');
      panel.setAttribute('data-dragged','1'); };
    /* (#R79b) when this panel is wrapped inside a workspace window, the WINDOW owns drag/resize — the panel's
       own handlers would fight it (the Atlas input field "moved freely" while resizing). Bail out cleanly. */
    /* (#R79b/#R153) Disable a panel's OWN drag ONLY when it IS a workspace window's content — i.e. a DIRECT child of
       .ws-body (the moved source elements: Atlas panel, News/Countries feed, #map-container). In workspace mode the whole
       #map-container is relocated INTO the map window, so every in-map popup (tool-panel, legends, etc.) became a DEEP
       descendant of a .ws-win and the old `closest('.ws-win')` test wrongly killed their drag ("ワークスペースモード内の
       地図内のポップアップは自由に動かせない"). A direct-child-of-.ws-body test protects the window content while letting
       genuinely-floating in-map popups drag again (their offset-parent-relative math already clamps them inside the map). */
    const _inWsWin=()=>{ try{ return !!(panel.parentElement&&panel.parentElement.classList&&panel.parentElement.classList.contains('ws-body')); }catch(_){ return false; } };
    handle.onmousedown=(e)=>{ if(onCtl(e)||panel.dataset.resizing||_inWsWin()) return; HOST.panelDrag={x:e.clientX,y:e.clientY,l:panel.offsetLeft,t:panel.offsetTop}; e.preventDefault(); document.onmousemove=(ev)=>move(ev.clientX,ev.clientY); document.onmouseup=()=>{ HOST.panelDrag=null; document.onmousemove=null; document.onmouseup=null; }; };
    handle.addEventListener('touchstart',(e)=>{ if(onCtl(e)||panel.dataset.resizing||_inWsWin()) return; const tc=e.touches[0]; if(!tc)return; HOST.panelDrag={x:tc.clientX,y:tc.clientY,l:panel.offsetLeft,t:panel.offsetTop}; e.preventDefault();
      const mv=(ev)=>{ const t2=ev.touches[0]; if(t2) move(t2.clientX,t2.clientY); };
      const up=()=>{ HOST.panelDrag=null; document.removeEventListener('touchmove',mv); document.removeEventListener('touchend',up); };
      document.addEventListener('touchmove',mv,{passive:false}); document.addEventListener('touchend',up); },{passive:false});
    registerWindow(panel);   /* (#R47) any draggable panel also gets click-to-front + all-edge resize */
  }
  /* ================= (#R47) Window manager — the user: "前後位置が切り替わらない／触れたものを全面に／右下だけの
     リサイズは不便／移動・リサイズのマークは要らない". One small system applied to every floating window+popup:
       • bringToFront(el): clicking ANY managed window raises it above the others (capped below modals).
       • addEdgeResize(el): resize from ANY edge or corner with NO visible handle (hit-tested border zone),
         replacing the native bottom-right-only `resize:both` grab-mark.
     makeDraggable auto-registers its panel; bigger windows (Atlas, Compare) also add edge-resize. ================= */
  const __winReg=new Set();
let __winZ=4300;
  function bringToFront(el){ if(!el) return; try{ let mx=4300; __winReg.forEach(w=>{ if(w===el||!w.isConnected) return; const z=parseInt(w.style.zIndex,10)||0; if(z>mx&&z<6000) mx=z; }); __winZ=Math.min(5999,Math.max(__winZ,mx)+1); el.style.zIndex=String(__winZ); }catch(_){} }
  function registerWindow(el){ if(!el||__winReg.has(el)) return; __winReg.add(el); try{ el.addEventListener('pointerdown',()=>bringToFront(el),true); }catch(_){ try{ el.addEventListener('mousedown',()=>bringToFront(el),true); }catch(__){} }
    /* (#R238) a window that appears while the dock is on goes straight into it — see below */
    if(__dockOn) try{ _dockOne(el); }catch(_){} }
  /* ══ ⚠⚠ (#R238) THE DOCK — every floating thing in one sidebar tab ═══════════════════════════════
     「設定から変更すれば、それまで地図上に表示されていたポップアップや凡例の類を、地名クリック時の
       ポップアップのような地図と直接結びついたもの以外すべて、左サイドバーに新たなタブを作り、
       そこにすべてまとめて表示というモードを作って。」 — asked for in #R236, #R237 and again now.
     Scope confirmed with the reader in #R237: tool windows are included, the tab exists only while
     the mode is on, desktop AND mobile, off by default.

     ⚠ WHY THIS FILE. `__winReg` above is ALREADY the set of every floating window the app makes —
     `makeDraggable` and `addEdgeResize` both register into it, which is 33 call sites across 22
     files. So «everything that floats» is a set that exists, is maintained by the two functions that
     create floating things, and needs no list for a new panel to join. ⚠ And it draws the reader's
     boundary exactly: a place-click popup is a RENDERER popup anchored to a coordinate inside the
     map container, it never goes through makeDraggable, so it is outside `__winReg` and stays on the
     map without a single exception being written down. `data-nodock` is for the two windows that
     have their own home in the sidebar already (Atlas has `atl-tab`) — see the caller.

     ⚠ WHAT IS REMEMBERED, AND WHY IT IS THE WHOLE INLINE STYLE. A docked panel is re-parented and
     then forced flat by CSS, so switching the mode off has to put back BOTH where it was in the DOM
     and the geometry it was dragged/resized to. `cssText` is that geometry — #R47's drag and resize
     write `left/top/width/height` as inline `!important` — so the string is stored and re-applied
     rather than re-derived, which is the only way a window comes back exactly where it was left. */
  const __docked=new Map();      /* el -> { parent, next, css } */
  let __dockOn=false, __dockObs=null;
  function _dockHost(){ try{ return document.getElementById('docked-feed'); }catch(_){ return null; } }
  /* ══ ⚠⚠ (#R238) …AND THE LEGENDS, WHICH ARE NOT WINDOWS ═══════════════════════════════════════════
     Measured on the first build of this feature: with the dock on, `iol-panel` and `sq-panel` moved
     and `koppen-legend` and `data-legend-subcables` DID NOT — because a legend is not draggable, so
     it never goes through makeDraggable and `__winReg` has never heard of it. The instruction names
     legends FIRST (「ポップアップや凡例の類」), so a dock that collects only the draggable things is
     the wrong half of the feature.

     ⚠ A SELECTOR, NOT A LIST OF IDs. js/data-layers.js alone creates fifteen of these
     (`data-legend-eez`, `-temp`, `-thermal`, `-radar`, `-sst`, `-popgrid`, `-relief`, …) and the next
     round will add more; an enumeration here would be a second list that has to be kept in step with
     the first, which is #R220's defect exactly ("a list in two places means one of them is stale").
     What every one of them shares is the WORD — the class or the id says `legend` — so that is what
     is matched, inside the map container only.
     ⚠ AND MAP CONTROLS ARE NOT LEGENDS. The search box, the compass, the zoom buttons and the
     basemap switch are how the reader drives the map; they are not 「ポップアップや凡例の類」 and
     they stay. That is why this is a narrow selector rather than "every absolutely-positioned child
     of the map container".

     ⚠⚠ AND IT IS A DIRECT CHILD, WHICH IS THE WHOLE DIFFERENCE BETWEEN «a legend» AND «the word
     legend». Measured on the first build of this rule: a descendant match pulled in 58 elements —
     the twelve `lyrrow-*` rows of the LAYERS PANEL among them, because each row carries a legend
     swatch inside it. Ripping rows out of the layer panel is not docking a legend, it is dismantling
     a control. A legend that floats over the map is appended to the map container itself
     (js/data-layers.js: `mc.appendChild(legend)`), so `:scope >` is exactly the set that floats, and
     anything nested inside another panel belongs to that panel and travels with it. */
  const DOCK_SEL=':scope > [class*="legend"], :scope > [id*="legend"]';
  function _dockables(){
    const out=[];
    try{ __winReg.forEach(el=>{ if(el&&el.isConnected) out.push(el); }); }catch(_){}
    try{
      const mc=document.getElementById('map-container');
      if(mc) mc.querySelectorAll(DOCK_SEL).forEach(el=>{ if(out.indexOf(el)<0) out.push(el); });
    }catch(_){}
    return out;
  }
  /* a legend created while the dock is on has to land in it without anything asking */
  function _dockWatch(on){
    try{
      if(!on){ if(__dockObs){ __dockObs.disconnect(); __dockObs=null; } return; }
      if(__dockObs) return;
      const mc=document.getElementById('map-container'); if(!mc||!window.MutationObserver) return;
      /* ⚠ childList on the CONTAINER ONLY (no subtree): the set this watches is «direct children of
         the map container», which is exactly what `_dockables` matches, and a subtree observer would
         fire on every tile, marker and popup the renderer creates. */
      __dockObs=new MutationObserver((recs)=>{ if(!__dockOn) return;
        for(const r of recs) for(const n of r.addedNodes){
          if(!n||n.nodeType!==1||n.parentNode!==mc) continue;
          try{ if(n.matches&&n.matches('[class*="legend"],[id*="legend"]')) _dockOne(n); }catch(_){}
        } });
      __dockObs.observe(mc,{childList:true});
    }catch(_){}
  }
  function _dockOne(el){
    if(!el||__docked.has(el)) return false;
    if(!el.isConnected) return false;
    try{ if(el.dataset&&el.dataset.nodock==='1') return false; }catch(_){}
    /* workspace mode gives every panel its own window frame; docking would fight it */
    try{ if(document.body.classList.contains('ws-mode')) return false; }catch(_){}
    const host=_dockHost(); if(!host) return false;
    try{
      __docked.set(el,{ parent:el.parentNode, next:el.nextSibling, css:el.getAttribute('style')||'' });
      el.classList.add('im-docked');
      el.removeAttribute('style');
      host.appendChild(el);
      return true;
    }catch(_){ __docked.delete(el); return false; }
  }
  function _undockOne(el){
    const s=__docked.get(el); if(!s) return false;
    __docked.delete(el);
    try{
      el.classList.remove('im-docked');
      if(s.css) el.setAttribute('style',s.css); else el.removeAttribute('style');
      if(s.parent&&s.parent.isConnected){ s.parent.insertBefore(el,(s.next&&s.next.parentNode===s.parent)?s.next:null); }
      return true;
    }catch(_){ return false; }
  }
  /* the panels that are gone (closed while docked) drop out on their own */
  function _sweep(){ __docked.forEach((_,el)=>{ if(!el.isConnected) __docked.delete(el); }); }
  function setDocked(on){
    on=!!on; __dockOn=on;
    if(on){ _dockables().forEach(_dockOne); }
    else { Array.from(__docked.keys()).forEach(_undockOne); }
    _dockWatch(on);
    _sweep();
    try{ document.body.classList.toggle('im-dock-mode',on); }catch(_){}
    return __docked.size;
  }
  function dockedCount(){ _sweep(); return __docked.size; }
  function isDocked(){ return __dockOn; }
  /* (#R238) …and re-run the sweep when the mode is on and the tab is shown, so a window opened while
     another tab was up is in the list the moment the reader looks at it. */
  function dockRefresh(){ if(!__dockOn) return 0; _dockables().forEach(_dockOne); return dockedCount(); }
  function addEdgeResize(panel,opts){ opts=opts||{}; if(!panel||panel.dataset.edgeResize) return; panel.dataset.edgeResize='1';
    const M=9, minW=(opts.min&&opts.min[0])||220, minH=(opts.min&&opts.min[1])||130;
    const CUR={n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',ne:'nesw-resize',sw:'nesw-resize',nw:'nwse-resize',se:'nwse-resize'};
    const edgeAt=(cx,cy)=>{ const r=panel.getBoundingClientRect(); const x=cx-r.left,y=cy-r.top; if(x<0||y<0||x>r.width||y>r.height) return ''; let h='',v=''; if(x<=M)h='w'; else if(x>=r.width-M)h='e'; if(y<=M)v='n'; else if(y>=r.height-M)v='s'; return v+h; };
    /* (#R79b) inside a workspace window the WINDOW handles resize — skip the panel's own edge-resize */
    /* (#R79b) inside a workspace window the WINDOW handles resize — skip the panel's own edge-resize.
       (#R130) ALSO skip when the panel is the Atlas SIDEBAR TAB (class `atl-tab`): in tab mode the Atlas panel is
       pinned to width:100%!important inside #atlas-feed, so the invisible edge-resize border-zone let the user drag
       (incl. left/right) and fought the forced width — the reported "サイドバー内Atlasに左右方向のリサイズ機構があり、
       変なことになる". `atl-tab` is present only in tab mode (removed in ws-mode), so the floating Atlas window and the
       Compare window keep edge-resize. */
    const _inWsWin2=()=>{ try{ if(panel.classList&&panel.classList.contains('atl-tab')) return true; return !!(panel.parentElement&&panel.parentElement.classList&&panel.parentElement.classList.contains('ws-body')); }catch(_){ return false; } };   /* (#R153) same fix as _inWsWin: only the window's own content (direct .ws-body child) is exempt from edge-resize — in-map popups nested in the relocated #map-container resize normally */
    panel.addEventListener('pointermove',(e)=>{ if(panel.dataset.resizing||_inWsWin2()) return; const d=edgeAt(e.clientX,e.clientY); panel.style.cursor=d?CUR[d]:''; });
    panel.addEventListener('pointerleave',()=>{ if(!panel.dataset.resizing) panel.style.cursor=''; });
    panel.addEventListener('pointerdown',(e)=>{ if(_inWsWin2()) return; if(e.target.closest&&e.target.closest('button,input,select,textarea,a,[role="button"],.atl-go,.atl-in')) return; const d=edgeAt(e.clientX,e.clientY); if(!d) return; e.preventDefault(); e.stopPropagation(); panel.dataset.resizing=d; bringToFront(panel);
      const r=panel.getBoundingClientRect(), op=panel.offsetParent||document.documentElement, opr=op.getBoundingClientRect();
      /* (#R48) ROOT CAUSE of the buggy resize: the Atlas panel is centred with transform:translateX(-50%) (from
         left:50%). The old code pinned left to the VISUAL rect but LEFT THE TRANSFORM ON, so on grab the panel
         jumped half its width and drifted while resizing. Neutralise the transform + bottom/right anchors first,
         pin to the exact on-screen box, then read the transform-free offset. */
      panel.style.setProperty('transform','none','important'); panel.style.setProperty('right','auto','important'); panel.style.setProperty('bottom','auto','important');
      panel.style.setProperty('left',(r.left-opr.left)+'px','important'); panel.style.setProperty('top',(r.top-opr.top)+'px','important');
      const sx=e.clientX, sy=e.clientY, sw=r.width, sh=r.height, sl=panel.offsetLeft, st=panel.offsetTop;
      try{ panel.setPointerCapture&&panel.setPointerCapture(e.pointerId); }catch(_){}
      const mv=(ev)=>{ let w=sw,h=sh,l=sl,t=st; const dx=ev.clientX-sx, dy=ev.clientY-sy;
        if(d.indexOf('e')>=0) w=Math.max(minW,sw+dx); if(d.indexOf('s')>=0) h=Math.max(minH,sh+dy);
        if(d.indexOf('w')>=0){ w=Math.max(minW,sw-dx); l=sl+(sw-w); } if(d.indexOf('n')>=0){ h=Math.max(minH,sh-dy); t=st+(sh-h); }
        panel.style.setProperty('width',w+'px','important'); panel.style.setProperty('height',h+'px','important');
        panel.style.setProperty('left',l+'px','important'); panel.style.setProperty('top',t+'px','important'); panel.setAttribute('data-dragged','1'); };
      const up=(ev)=>{ delete panel.dataset.resizing; try{ panel.releasePointerCapture&&panel.releasePointerCapture(ev.pointerId); }catch(_){} document.removeEventListener('pointermove',mv); document.removeEventListener('pointerup',up); panel.style.cursor=''; };
      document.addEventListener('pointermove',mv); document.addEventListener('pointerup',up); });
    registerWindow(panel); }
  /* ══ ⚠⚠ (#R238) THE APP-SIDE GLUE, HERE RATHER THAN IN THE SHELL ═════════════════════════════════
     Three things, and only three: the tab exists while the setting is on, the panels are re-parented
     above, and leaving the mode while the dock tab is open has to leave the reader somewhere. It
     lives in this file — beside the mechanism it drives — rather than in js/app-body.js, and that is
     not only tidiness: tests/r168 #8 budgets the app SHELL (index.html + src/main.js + src/vendor.js
     + js/app-body.js + js/geo-engine.js) at 8,200 lines and the first cut of this feature put it at
     8,232. ⚠ The rule that test states is that THE CEILING FOLLOWS THE FLOOR DOWN, never the other
     way, so the answer to a shell over its budget is to move a feature out of the shell — which is
     standing rule 13's direction anyway — and never to raise the number.
     `ops` carries the four things only app-body's closure has: setMode, renderUI, saveSettings, and
     read/write access to the live `currentMode`.
     ⚠ THE ATLAS PANEL OPTS OUT — it already has a sidebar home (`atl-tab`, #R112/#R130), so docking
     it would put a tab inside a tab. */
  function wireDock(ops){
    ops=ops||{};
    const applyDockMode=()=>{
      const on=(window.imDockPanels==='on');
      try{ const ap=document.getElementById('atlas-panel'); if(ap) ap.dataset.nodock='1'; }catch(_){}
      let n=0; try{ n=setDocked(on); }catch(_){}
      try{ const b=document.getElementById('btn-docked'); if(b) b.style.display=on?'':'none'; }catch(_){}
      /* ⚠ the tab row is FIVE buttons wide now, and #R122's auto-fit only ran on load, on resize and
         on a language change — so the first build shipped 「Companies」 clipped to 「Compani」, which
         is visible in that build's screenshot. A tab appearing IS the row changing width. */
      try{ window._fitTabFont&&window._fitTabFont(); }catch(_){}
      /* switching it off with the dock tab open would leave a tab selected that no longer exists */
      if(!on&&ops.mode&&ops.mode()==='docked'){ try{ ops.clearMode&&ops.clearMode();
        document.querySelectorAll('.control-panel .mode-btn').forEach(b=>b.classList.remove('active')); }catch(_){} }
      try{ ops.renderUI&&ops.renderUI(); }catch(_){}
      return n;
    };
    try{
      const OS=window.IntMapOS;
      OS.register('tab.docked', ()=>{ if(window.imDockPanels!=='on'){ window.imDockPanels='on'; applyDockMode(); }
        ops.setMode&&ops.setMode('docked','btn-docked'); }, {label:'Docked panels tab', btn:'btn-docked', group:'tab'});
      OS.register('view.dock.on',  ()=>{ window.imDockPanels='on';  applyDockMode(); try{ ops.saveSettings&&ops.saveSettings(); }catch(_){} }, {label:'Collect panels in the sidebar', group:'view'});
      OS.register('view.dock.off', ()=>{ window.imDockPanels='off'; applyDockMode(); try{ ops.saveSettings&&ops.saveSettings(); }catch(_){} }, {label:'Put panels back on the map', group:'view'});
      const b=document.getElementById('btn-docked');
      if(b) b.addEventListener('click',()=>OS.exec('tab.docked',{source:'ui'}));
    }catch(_){}
    return applyDockMode;
  }
  return { addEdgeResize, bringToFront, makeDraggable, registerWindow,
           setDocked, isDocked, dockedCount, dockRefresh, wireDock };
};
