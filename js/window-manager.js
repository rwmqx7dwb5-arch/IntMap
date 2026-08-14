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
    /* ══ ⚠⚠⚠ (#R239) A DOCKED PANEL DOES NOT DRAG, AND THAT IS WHY THEY WERE «DISAPPEARING» ═══════
       「パネル内のポップアップや凡例は×可能だがドラッグ可能にはしないように。」
       「タップしたらどんどん消えていく現象ふざけるな。」
       Those two are ONE defect. #R238 flattened a docked panel with `.im-docked` in the stylesheet —
       `position:relative; left:auto; top:auto` — every declaration `!important` because it is
       overriding an inline style. But `move()` below writes `left`/`top` as INLINE `!important`
       (#R16, so a phone's stylesheet cannot pin a dragged panel back), and inline-important beats
       stylesheet-important. So the drag still ran inside the sidebar, and it wrote the panel's own
       `offsetTop` — which for a child of the scrolling column is «how far down the column it sits»,
       several hundred pixels — as a RELATIVE offset. One touch that moved a few pixels therefore
       shoved the panel that far down again, out of the column: it did not close, it left. Tap the
       next one and the same thing happens to it. 「どんどん消えていく」.
       ⚠ THE CURE IS NOT A STRONGER RULE IN THE SHEET. A docked panel has nowhere to be dragged TO,
       so the gesture must not start — the same answer #R79b/#R153 already give for a panel that is a
       workspace window's content, and the same answer for edge-resize below (which is also what
       「中で左右に動かせないように」 is asking for: with no resize and no drag, and `width:100%`,
       there is nothing left that can move it sideways). */
    handle.onmousedown=(e)=>{ if(onCtl(e)||panel.dataset.resizing||_inWsWin()||isDocked(panel)) return; HOST.panelDrag={x:e.clientX,y:e.clientY,l:panel.offsetLeft,t:panel.offsetTop}; e.preventDefault(); document.onmousemove=(ev)=>move(ev.clientX,ev.clientY); document.onmouseup=()=>{ HOST.panelDrag=null; document.onmousemove=null; document.onmouseup=null; }; };
    handle.addEventListener('touchstart',(e)=>{ if(onCtl(e)||panel.dataset.resizing||_inWsWin()||isDocked(panel)) return; const tc=e.touches[0]; if(!tc)return; HOST.panelDrag={x:tc.clientX,y:tc.clientY,l:panel.offsetLeft,t:panel.offsetTop}; e.preventDefault();
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
    /* (#R238) a window that appears while the dock is on goes straight into it — see below.
       (#R239) …and is watched, so that switching it off later takes it back out again. */
    if(__dockOn) try{ _watchEl(el); _dockOne(el); }catch(_){} }
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
  /* (#R242) `__dockBulk` is «this dock is part of a sweep the reader asked for», and `__dockOps` is
     the app-side glue `wireDock` was handed — both are read by `_reveal` below. */
  let __dockBulk=false, __dockOps=null;
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
  /* ══ ⚠⚠⚠ (#R239) ONLY WHAT IS SWITCHED ON ═══════════════════════════════════════════════════════
     「パネルに入れるのは現在オンしてるレイヤーや機能の凡例やポップアップのみです。全部入れるわけ
       じゃない。」 and, asked which of the two readings that is:
     「画面に出てる出てないじゃなくてオンになってるかそうじゃないか」.

     #R238 docked the whole of `__winReg` plus every legend under the map container, and BOTH sets
     hold things that are not on: a legend for a layer that was never switched on is in the DOM from
     the moment its module builds it, and a tool window that has been closed is still registered. So
     the tab opened onto a stack of panels for layers the reader had not turned on.

     ⚠ AND «ON» IS SPELLED THE SAME WAY EVERYWHERE IN THIS APP: the owner writes `display` INLINE.
     js/data-layers.js does `legend.style.display='flex'` on toggle-on and `='none'` on toggle-off
     (34 sites); js/map-tools.js's Objects panel is built with `display:none` in its cssText and
     opened by writing `flex`. So the element's OWN inline display is the layer's switch, read at
     first hand — no registry of «which legend belongs to which layer» to keep in step with
     js/data-layers.js, which is the two-lists defect ([[intmap-recurring-lessons]] G) this file's
     `DOCK_SEL` note already refused once.
     ⚠ A panel with no inline display at all is treated as ON — that is the state it is in while it
     is docked and while a stylesheet rules it, and guessing «off» there would empty the tab. */
  function _isOn(el){
    try{
      if(!el||!el.isConnected) return false;
      const d=el.style&&el.style.display;
      if(d==='none') return false;
      if(el.hidden) return false;
      /* while it is still in its own home, the computed value catches the few that a CLASS hides */
      if(!__docked.has(el)&&d===''){ try{ if(getComputedStyle(el).display==='none') return false; }catch(_){} }
      return true;
    }catch(_){ return true; }
  }
  function _dockables(){
    const out=[];
    try{ __winReg.forEach(el=>{ if(_isOn(el)) out.push(el); }); }catch(_){}
    try{
      const mc=document.getElementById('map-container');
      if(mc) mc.querySelectorAll(DOCK_SEL).forEach(el=>{ if(_isOn(el)&&out.indexOf(el)<0) out.push(el); });
    }catch(_){}
    return out;
  }
  /* a legend created while the dock is on has to land in it without anything asking */
  /* ══ ⚠⚠ (#R239) …AND ONE THAT IS SWITCHED OFF HAS TO LEAVE IT AGAIN ════════════════════════════
     #R238 watched only for legends BEING CREATED. With membership now meaning «switched on»
     (`_isOn`), the tab has to follow the switch in both directions, and the switch is an inline
     `display` write on the element itself — so the watch is an ATTRIBUTE watch, attached per
     candidate element rather than to a subtree. A subtree attribute observer under the map
     container would fire on every tile transform the renderer writes, every frame.
     ⚠ AND IT MUST NOT WATCH ITSELF: `_dockOne`/`_undockOne` write `style` and `class`, so the flag
     below drops the records this module caused. Without it, docking one panel re-enters the
     observer, which is the shape of every runaway MutationObserver ever written. */
  let __attrBusy=false;
  function _watchEl(el){
    try{ if(!__dockObs||!el||el.__imDockWatched) return; el.__imDockWatched=1;
      __dockObs.observe(el,{attributes:true,attributeFilter:['style','class','hidden']}); }catch(_){}
  }
  function _dockWatch(on){
    try{
      if(!on){ if(__dockObs){ __dockObs.disconnect(); __dockObs=null; }
        try{ __winReg.forEach(el=>{ try{ delete el.__imDockWatched; }catch(_){} }); }catch(_){}
        return; }
      if(__dockObs) return;
      const mc=document.getElementById('map-container'); if(!mc||!window.MutationObserver) return;
      /* ⚠ childList on the CONTAINER ONLY (no subtree): the set this watches is «direct children of
         the map container», which is exactly what `_dockables` matches, and a subtree observer would
         fire on every tile, marker and popup the renderer creates. */
      __dockObs=new MutationObserver((recs)=>{ if(!__dockOn||__attrBusy) return;
        __attrBusy=true;
        try{
          for(const r of recs){
            if(r.type==='childList'){
              for(const n of r.addedNodes){
                if(!n||n.nodeType!==1||n.parentNode!==mc) continue;
                try{ if(n.matches&&n.matches('[class*="legend"],[id*="legend"]')){ _watchEl(n); _dockOne(n); } }catch(_){}
              }
              continue;
            }
            const el=r.target; if(!el||el.nodeType!==1) continue;
            if(__docked.has(el)){ if(!_isOn(el)) _undockOne(el); }
            else if(_isOn(el)&&(__winReg.has(el)||el.parentNode===mc)) _dockOne(el);
          }
        }catch(_){}
        __attrBusy=false;
      });
      __dockObs.observe(mc,{childList:true});
      _dockables().forEach(_watchEl);
      try{ __winReg.forEach(_watchEl); }catch(_){}
      try{ mc.querySelectorAll(DOCK_SEL).forEach(_watchEl); }catch(_){}
    }catch(_){}
  }
  /* ══ ⚠⚠⚠ (#R239) STRIP THE GEOMETRY, KEEP THE PANEL ═════════════════════════════════════════════
     「勝手に透明度選択とかの凡例の機能削除してんじゃねーよボケ。これまでのポップアップや凡例と
       完全対応させろ。勝手に作り直して別の新たな例外を生み出すな。」

     Nothing was re-implemented — #R238 re-parented the real elements — and a control still went
     missing, because of two lines: `el.removeAttribute('style')` threw the WHOLE inline style away,
     and `.im-docked` put back `display:block !important`.
       · js/map-tools.js builds the Objects panel with `display:none;flex-direction:column` inline
         and js/data-layers.js opens each legend with `display:flex`. Those panels are FLEX COLUMNS
         whose footer — the opacity slider and the hint — is the last flex child. Forced to
         `display:block` inside a box that still carried `overflow:hidden`, the footer went under
         the fold: the slider was not deleted, it was cropped. From the reader's side that is a
         removed feature, which is exactly what it was called.
       · and it broke switching OFF: with `display` forced `!important` by a stylesheet, the
         owner's `legend.style.display='none'` could no longer hide it.
     ⚠ SO ONLY THE PROPERTIES THAT PLACE A FLOATING BOX ON A MAP ARE REMOVED, and everything the
     panel says about ITSELF — display, flex-direction, background, border, radius, the lot — is
     left exactly as its author wrote it. The full original string is still stored and re-applied on
     the way out, so the panel returns to the pixel it was dragged to. */
  const GEOM=['position','left','top','right','bottom','inset','width','min-width','max-width',
    'height','min-height','max-height','transform','z-index','margin','margin-top','margin-right',
    'margin-bottom','margin-left','resize','float'];
  function _flatten(el){
    GEOM.forEach(p=>{ try{ el.style.removeProperty(p); }catch(_){} });
  }
  function _dockOne(el){
    if(!el||__docked.has(el)) return false;
    if(!_isOn(el)) return false;
    try{ if(el.dataset&&el.dataset.nodock==='1') return false; }catch(_){}
    /* workspace mode gives every panel its own window frame; docking would fight it */
    try{ if(document.body.classList.contains('ws-mode')) return false; }catch(_){}
    const host=_dockHost(); if(!host) return false;
    try{
      __docked.set(el,{ parent:el.parentNode, next:el.nextSibling, css:el.getAttribute('style')||'' });
      /* ⚠⚠⚠ (#R239b) WATCH IT BEFORE IT MOVES, NOT AFTER. Measured on production: a legend that was
         already switched on when the mode was turned on stayed in the tab after its layer was
         switched off. `setDocked(true)` docked everything first and armed the observer second, and
         by then `_dockables()` could no longer find those elements — they were in #docked-feed, not
         under the map container, and a legend is not in `__winReg` either. So the ONE place that is
         guaranteed to see every docked element is this function, and it is where the watch belongs.
         (`_watchEl` is idempotent and a no-op while the observer does not exist.) */
      _watchEl(el);
      el.classList.add('im-docked');
      _flatten(el);
      /* ⚠ (#R242) 「凡例やポップアップは一番上に詰めてパネルに表示しろ。（最初のうちは上に詰められて
         いないことがある）」 — the "first few" case is the EMPTY LINE: #R238 created it in
         js/news-ui.js's renderUI and removed it there too, so a panel that arrived while the tab was
         already open was appended AFTER it and the column started with 114 px of «nothing here yet».
         `_dockEmptySync()` runs on every membership change, so the line is present exactly when the
         count is zero and the first panel is always the first child. */
      host.appendChild(el);
      /* ⚠ (#R240) 「パネル内のポップアップや凡例は最小化された状態でスタートしないように。」 — a legend
         that was auto-collapsed while it floated over a phone's map (js/data-layers.js
         `ensureLegendMinimize`) must arrive in the column OPEN. This calls the panel's own toggle;
         nothing here re-implements it, and it is deliberately NOT undone on the way out — how a
         panel is left is the reader's, not this file's. */
      try{ window._legendExpand&&window._legendExpand(el); }catch(_){}
      try{ if(el.classList.contains('tp-collapsed')){ const b=el.querySelector('.tp-min-btn'); if(b) b.click(); } }catch(_){}
      _dockEmptySync();
      if(!__dockBulk) _reveal(el);
      return true;
    }catch(_){ __docked.delete(el); return false; }
  }
  /* ══ ⚠⚠ (#R242) A PANEL THAT APPEARS HAS TO BE SOMEWHERE THE READER IS LOOKING ══════════════════
     「新たなポップアップが出現したときは、自動的にサイドバーのパネルを開き、該当ポップアップが見える
       ようにそこまでスクロール。（設定でパネルを選択時の話）」
     With the mode on, a legend or tool window no longer appears over the map — so unless the reader
     already happens to be on the Panels tab, switching a layer on now LOOKS LIKE NOTHING HAPPENED.
     This is the other half of the mode: the tab comes forward and the column scrolls to the panel
     that just arrived.
     ⚠ ONLY for a panel that arrives ON ITS OWN — the bulk passes (`setDocked`, `dockRefresh`) set
     `__dockBulk`, because switching the mode on, or opening the tab, is already the reader looking
     at it, and yanking the tab forward there would fight the tab they just pressed.
     ⚠ The tab is opened through the OS action (#R150), not by poking `currentMode`, so the button
     state, the sheet detent and the save all happen exactly once and in one place. */
  function _reveal(el){
    try{
      if(!__dockOn||!el) return;
      const OS=window.IntMapOS;
      const already=(__dockOps&&__dockOps.mode&&__dockOps.mode()==='docked');
      if(!already&&OS&&OS.exec) OS.exec('tab.docked',{source:'auto'});
      /* a phone's sheet is at 'peek' most of the time; a panel behind it is not visible either */
      try{ if(!already&&window.matchMedia&&window.matchMedia('(max-width:768px)').matches&&window.__setDetent) window.__setDetent('half'); }catch(_){}
      setTimeout(()=>{ try{
        const host=_dockHost(); if(!host||!el.isConnected||el.parentNode!==host) return;
        const hr=host.getBoundingClientRect(), er=el.getBoundingClientRect();
        if(er.top<hr.top||er.bottom>hr.bottom) host.scrollTop+=(er.top-hr.top)-8;
      }catch(_){} },260);
    }catch(_){}
  }
  /* the empty line belongs to whoever knows the COUNT; the words belong to whoever knows the
     language (js/news-ui.js registers `_dockEmptyRender`). One trigger, one text. */
  function _dockEmptySync(){ try{ window._dockEmptyRender&&window._dockEmptyRender(__docked.size); }catch(_){} }
  /* ⚠⚠ (#R239) UNDOCKING IS THE EXACT INVERSE OF `_flatten`, AND IT HAS TO BE. The first cut put the
     stored style string back whole, which was right while docking removed the string whole — and
     wrong the moment docking started REMOVING ONLY THE GEOMETRY. Measured: switching a docked layer
     off wrote `display:none`, the observer undocked it, the restore put back the string as it was AT
     DOCK TIME — `display:flex` — the legend came back to life, the observer saw a live panel outside
     the dock and docked it again. A three-line loop that ends with the panel exactly where it was and
     the layer's own switch quietly undone. So only the geometry properties come back; everything the
     panel has said about itself since is left alone, because it is current and the stored copy is
     not. */
  function _restoreGeom(el,css){
    try{
      const probe=document.createElement('div'); probe.style.cssText=css||'';
      GEOM.forEach(p=>{ const v=probe.style.getPropertyValue(p);
        if(v) el.style.setProperty(p,v,probe.style.getPropertyPriority(p)); });
    }catch(_){}
  }
  function _undockOne(el){
    const s=__docked.get(el); if(!s) return false;
    __docked.delete(el);
    try{
      el.classList.remove('im-docked');
      _restoreGeom(el,s.css);
      if(!el.getAttribute('style')) el.removeAttribute('style');
      if(s.parent&&s.parent.isConnected){ s.parent.insertBefore(el,(s.next&&s.next.parentNode===s.parent)?s.next:null); }
      _dockEmptySync();   /* (#R242) 「全部凡例やポップアップを消した後も出せ」— the last one leaving puts the line back */
      return true;
    }catch(_){ return false; }
  }
  /* the panels that are gone (closed while docked) drop out on their own */
  function _sweep(){ __docked.forEach((_,el)=>{ if(!el.isConnected) __docked.delete(el); }); }
  function setDocked(on){
    on=!!on; __dockOn=on;
    /* (#R239b) …and the observer is armed BEFORE the first pass, so `_dockOne` above has one to
       register with. Turning the mode off still tears it down after the panels have gone home. */
    __dockBulk=true;   /* (#R242) the reader asked for THIS pass; `_reveal` stays out of it */
    try{
      if(on) _dockWatch(true);
      if(on){ _dockables().forEach(_dockOne); }
      else { Array.from(__docked.keys()).forEach(_undockOne); _dockWatch(false); }
    } finally { __dockBulk=false; }
    _sweep();
    _dockEmptySync();
    try{ document.body.classList.toggle('im-dock-mode',on); }catch(_){}
    return __docked.size;
  }
  function dockedCount(){ _sweep(); return __docked.size; }
  /* (#R239) `isDocked()` still answers «is the mode on»; `isDocked(el)` answers «is THIS panel in
     the sidebar», which is what makeDraggable and addEdgeResize ask before starting a gesture. */
  function isDocked(el){ return el===undefined ? __dockOn : __docked.has(el); }
  /* (#R238) …and re-run the sweep when the mode is on and the tab is shown, so a window opened while
     another tab was up is in the list the moment the reader looks at it. */
  function dockRefresh(){ if(!__dockOn) return 0;
    /* (#R239) a panel switched OFF while another tab was up leaves the list too — the sweep runs in
       both directions, exactly like the observer, so what the tab shows is what is switched on. */
    __dockBulk=true;   /* (#R242) opening the tab IS the reader looking; `_reveal` would fight the press */
    try{
      try{ Array.from(__docked.keys()).forEach(el=>{ if(!_isOn(el)) _undockOne(el); }); }catch(_){}
      _dockables().forEach(el=>{ _watchEl(el); _dockOne(el); });
    } finally { __dockBulk=false; }
    const n=dockedCount(); _dockEmptySync(); return n; }
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
    /* (#R239) …and a DOCKED panel, for the same reason and with the same consequence: the sidebar
       pins it to `width:100%`, and an invisible border-zone that fought that is precisely the
       「サイドバー内Atlasに左右方向のリサイズ機構があり、変なことになる」 report #R130 fixed for
       `atl-tab`. 「中で左右に動かせないようにきちんと幅を左右詰めて固定して。」 */
    const _inWsWin2=()=>{ try{ if(isDocked(panel)) return true; if(panel.classList&&panel.classList.contains('atl-tab')) return true; return !!(panel.parentElement&&panel.parentElement.classList&&panel.parentElement.classList.contains('ws-body')); }catch(_){ return false; } }; /* (#R153) same fix as _inWsWin: only the window's own content (direct .ws-body child) is exempt from edge-resize — in-map popups nested in the relocated #map-container resize normally */
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
    __dockOps=ops;   /* (#R242) `_reveal` asks it which tab is up before pulling the Panels tab forward */
    const applyDockMode=()=>{
      const on=(window.imDockPanels==='on');
      /* ⚠⚠⚠ (#R242) THE ATLAS OPT-OUT USED TO BE WRITTEN HERE, AND THAT WAS THE BUG. This function
         runs from loadSettings() at boot; Atlas is lazy, so `getElementById('atlas-panel')` was null
         for exactly the reader whose saved setting is already 「on」 — the flag was never written and
         the panel was docked the first time it was opened (measured: parent `docked-feed`, class
         `atl-tab im-docked`). `data-nodock` is now set where the panel is CREATED, in
         js/atlas-console.js's `ensure()`, so no ordering can miss it. Nothing to do here. */
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
