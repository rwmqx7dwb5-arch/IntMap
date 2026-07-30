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
  function registerWindow(el){ if(!el||__winReg.has(el)) return; __winReg.add(el); try{ el.addEventListener('pointerdown',()=>bringToFront(el),true); }catch(_){ try{ el.addEventListener('mousedown',()=>bringToFront(el),true); }catch(__){} } }
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
  return { addEdgeResize, bringToFront, makeDraggable, registerWindow };
};
