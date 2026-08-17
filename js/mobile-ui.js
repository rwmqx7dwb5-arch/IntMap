/* ============================================================================
 *  IntMap · Mobile UI & responsive layout chrome  (#R167)
 * ----------------------------------------------------------------------------
 *  initMobileUI() — the bottom sheet, the FAB column and the mobile tab bar — plus the three
 *  responsive-layout blocks that follow it (map-search reflow, sidebar width, device class).
 *  initMobileUI is RETURNED rather than instantiated: index.html still calls it by name at the
 *  end of boot, so the factory only has to hand the function back.
 * ==========================================================================*/

window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.mobileUI=function(HOST){
  /* (#R172) CAMERA + EVENTS THROUGH IntMapGeoEngine — this module no longer names the renderer.
     Everything it did to the map was camera work: read the bearing/pitch for the compass, pad the view
     for the bottom sheet, cancel an in-flight ease when the finger grabs it again, and resize. */
  const _GE=()=>window.IntMapGeoEngine;
  const _cam=()=>{ try{ const E=_GE(); return (E&&E.camera)?E.camera:null; }catch(_){ return null; } };
  /* =====================================================================
   *  iOS-native mobile UI controller — built from scratch.
   *  Only active at <=768px; desktop layout is left completely untouched.
   *  Owns: the draggable bottom sheet, the round control FABs + their
   *  slide-up option sheets, the place-search FAB, and the auto compass.
   * ===================================================================== */
  function initMobileUI(){
    const mq=window.matchMedia('(max-width:768px)');
    const sidebar=document.getElementById('sidebar');
    const mapContainer=document.getElementById('map-container');
    if(!sidebar) return;

    /* ---- node relocation (keeps handlers + state across orientation flips) ---- */
    function rememberHome(node){ if(node && !node.__home && node.parentNode){ const ph=document.createComment('home'); node.parentNode.insertBefore(ph,node); node.__home=ph; } }
    function moveTo(node,target){ if(node && target){ rememberHome(node); target.appendChild(node); } }
    function restoreHome(node){ if(node && node.__home && node.__home.parentNode){ node.__home.parentNode.insertBefore(node,node.__home); } }
    const layerDropdown=document.getElementById('layer-dropdown');
    const satController=document.getElementById('sat-controller');
    const moMountLayers=document.getElementById('mo-mount-layers');
    const moMountSat=document.getElementById('mo-mount-sat');

    /* ---- option sheets (Map / Tools) ---- */
    const scrim=document.getElementById('m-scrim');
    const moSheet=document.getElementById('mo-sheet');
    const toolsSheet=document.getElementById('tools-sheet');
    const fabMap=document.getElementById('m-fab-map');
    const fabTools=document.getElementById('m-fab-tools');
    let openSheetEl=null;
    function openSheet(el){ if(!el) return; if(openSheetEl && openSheetEl!==el) openSheetEl.classList.remove('show'); openSheetEl=el; syncControls(); if(scrim) scrim.classList.add('show'); el.classList.add('show');
      /* (#R18) The Layers list inside the Map sheet must never carry desktop collapse state. */
      if(el===moSheet){ try{ window._expandAllLayerGroups&&window._expandAllLayerGroups(); }catch(_){}
        /* (#R232) …and the tile grid re-reads the row set on every open, because rows are still being
           built for ~1.5 s after boot (eco / l9 / beta) and because Atlas or a legend may have toggled
           something while the sheet was shut. mountInto() is idempotent and only rebuilds on a change. */
        try{ window.IntMapLayerSidebar&&window.IntMapLayerSidebar.mountInto&&window.IntMapLayerSidebar.mountInto(moMountLayers); }catch(_){} } }
    function closeSheet(){ if(openSheetEl){ openSheetEl.classList.remove('show'); openSheetEl=null; } if(scrim) scrim.classList.remove('show'); }
    if(scrim) scrim.addEventListener('click',closeSheet);
    const moDone=document.getElementById('mo-done'); if(moDone) moDone.addEventListener('click',closeSheet);
    const toolsDone=document.getElementById('tools-done'); if(toolsDone) toolsDone.addEventListener('click',closeSheet);
    if(fabMap) fabMap.addEventListener('click',()=>{ openSheetEl===moSheet?closeSheet():openSheet(moSheet); });
    if(fabTools) fabTools.addEventListener('click',()=>{ openSheetEl===toolsSheet?closeSheet():openSheet(toolsSheet); });

    /* ---- proxy buttons drive the real (hidden) desktop controls ---- */
    /* (#R231) `#bm-pop` joins the two sheets: the base-map / projection segments moved out of
       #mo-sheet into the square's popover (js/basemap-switch.js) and they are the SAME [data-proxy]
       buttons, so they must be relabelled and mirrored by the same pass. A selector that still named
       only the two sheets would have left "Globe/Flat/Satellite" in English on a Japanese phone —
       which is exactly the #R8 defect this function was written to fix. */
    const PROXY_SEL='#mo-sheet [data-proxy], #tools-sheet [data-proxy], #bm-pop [data-proxy]';
    function proxy(btn){ const id=btn.getAttribute('data-proxy'); const real=document.getElementById(id); if(!real) return; real.click(); setTimeout(syncControls,0); if(/^btn-tool-/.test(id)) closeSheet(); }
    document.querySelectorAll('#mo-sheet [data-proxy], #tools-sheet [data-proxy]').forEach(b=>b.addEventListener('click',()=>proxy(b)));
    function syncControls(){
      document.querySelectorAll(PROXY_SEL).forEach(b=>{
        const real=document.getElementById(b.getAttribute('data-proxy')); if(!real) return;
        if(b.classList.contains('m-seg-btn')){ const txt=(real.textContent||'').trim(); if(txt) b.textContent=txt; }
        else if(b.classList.contains('m-tool-btn')){ const m=(real.textContent||'').trim().match(/^(\S+)\s+([\s\S]+)$/); const lbl=b.querySelector('span:last-child'); if(lbl&&m) lbl.textContent=m[2].trim(); }
        b.classList.toggle('active', real.classList.contains('active')||real.classList.contains('tool-on'));
      });
      /* (#R139) the "Map & layers" FAB is accent-coloured ONLY when a thematic layer is selected (was tied to
         the satellite basemap). `_imActiveLayerCount` is published by _refreshActiveLayers on every change. */
      if(fabMap) fabMap.classList.toggle('on', (window._imActiveLayerCount||0)>0);
      if(fabTools) fabTools.classList.toggle('on', !!HOST.toolMode || HOST.isGridOn);
      /* (#R231) the base-map square's own two headings and its caption are not [data-proxy] labels —
         they are its own words — so they are re-read here, where every other mobile label is. */
      try{ const B=window.IntMapBasemapSwitch; if(B){ B.relabel(); B.redraw(); } }catch(_){ }
    }
    /* (#R231) THE LANGUAGE BUTTONS COME FROM THE REGISTRY, NOT FROM A LIST WRITTEN HERE.
       This was `['lang-en','lang-jp','lang-de','lang-ru','lang-es']` — one of the places a sixth and
       seventh language had to be remembered by hand, and were not: tapping 繁 or 简 in the header did
       NOT relabel the mobile proxies, so the phone kept Globe/Flat/Satellite in the previous language
       until something else called syncControls. js/lang-registry.js already knows every code and
       js/lang-registry.js `syncChrome` already creates every button, so ask it. */
    (window.IntMapLang ? window.IntMapLang.codes() : ['en','jp','de','ru','es'])
      .forEach(code=>{ const b=document.getElementById('lang-'+code); if(b) b.addEventListener('click',()=>setTimeout(syncControls,40)); });
    /* (#R8 JP/EN) Re-label the mobile segment/tool proxies on EVERY language change — not just the lang
       toggle buttons. Changing language via the Settings dropdown (or any programmatic switch) used to
       leave "Globe/Flat/Satellite" in English on the phone ("日本語版で英語が出てくる"). updateI18n() now
       calls this after it relabels the desktop controls the proxies copy from. */
    window._imSyncMobile=syncControls;

    /* ---- compass FAB: appears only when the map is rotated/tilted ---- */
    const fabCompass=document.getElementById('m-fab-compass');
    const compassSvg=fabCompass?fabCompass.querySelector('.m-compass-svg'):null;
    if(fabCompass) fabCompass.addEventListener('click',()=>{ const r=document.getElementById('btn-compass'); if(r) r.click(); });
    function updateCompass(){ if(!_cam()||!fabCompass) return; let b=0,p=0; try{ b=_cam().getBearing()||0; p=_cam().getPitch()||0; }catch(_){}
      fabCompass.classList.toggle('show', Math.abs(b)>1 || p>1); if(compassSvg) compassSvg.style.transform='rotate('+(-b)+'deg)'; }
    try{ const E=_GE(); if(E){ E.events.on('rotate',updateCompass); E.events.on('pitch',updateCompass); E.events.on('moveend',updateCompass); } }catch(_){}

    /* ---- (#R137) locate FAB: fly to my location + show the accent dot / accuracy circle (they follow me) ---- */
    { const fabLoc=document.getElementById('m-fab-locate');
      if(fabLoc) fabLoc.addEventListener('click',()=>{ try{ window.IntMapLocate&&window.IntMapLocate.toggleOrRecenter(); }catch(_){} }); }

    /* ---- swipe down on an option-sheet grip to dismiss it ---- */
    function makeDismiss(sheet){ if(!sheet) return; const grip=sheet.querySelector('.m-sheet-grip'); if(!grip) return; let drag=false,sy=0;
      grip.addEventListener('pointerdown',e=>{ drag=true; sy=e.clientY; sheet.style.transition='none'; try{grip.setPointerCapture(e.pointerId);}catch(_){} });
      grip.addEventListener('pointermove',e=>{ if(!drag) return; sheet.style.transform='translateY('+Math.max(0,e.clientY-sy)+'px)'; });
      const end=e=>{ if(!drag) return; drag=false; sheet.style.transition=''; const dy=((e&&e.clientY)||sy)-sy; sheet.style.transform=''; if(dy>90) closeSheet(); };
      grip.addEventListener('pointerup',end); grip.addEventListener('pointercancel',()=>{ if(drag){ drag=false; sheet.style.transition=''; sheet.style.transform=''; } });
    }
    makeDismiss(moSheet); makeDismiss(toolsSheet);

    /* ---- responsive: relocate config panels in/out of the sheets ---- */
    function applyLayout(isM){
      /* ══ ⚠ (#R235) 「モバイル版のレイヤー選択欄は、デスクトップ版とおなじUIに。下部の比較ビューや
             衛星画像プロバイダ等のやつはなくていい。」 ════════════════════════════════════════════════
         #R232 mounted the desktop's tile grid at the TOP of this sheet, which made the layer list
         itself identical. What was still different was everything UNDER it: the satellite-imagery
         provider panel (`#sat-controller`, moved in here by the line below since #R12) and the
         `#layer-tools` strip that `reorganizeLayerPanel` fills with 比較ビュー / 相関分析. Neither is
         in the desktop layer sidebar — that is search + tiles + the Active-layers bar and nothing
         else — so they are what the two panels still had to stop differing by.
         ⚠ `#sat-controller` IS NO LONGER REACHABLE ON A PHONE. That is the instruction 「なくていい」
         and it is a real reduction, so it is called out in the round's notes rather than left to be
         discovered. Nothing is deleted: the element keeps its desktop home and the phone simply
         stops borrowing it, so widening the window brings it straight back. */
      if(isM){ moveTo(layerDropdown,moMountLayers);
        /* Mobile shows every layer group expanded (the carets are hidden there, #12) so nothing stays
           hidden behind a collapsed header the user can no longer toggle. */
        try{ layerDropdown.querySelectorAll('.layer-group-title,.lyr-head,.premium-group-title').forEach(h=>{ h.classList.remove('lyr-collapsed'); let el=h.nextElementSibling; while(el && !el.matches('.layer-group-title,.lyr-head,.premium-group-title') && el.tagName!=='HR'){ if(el.style) el.style.display=''; el=el.nextElementSibling; } }); }catch(_){}
        /* (#R28) every group (incl. Others(beta)) shows fully expanded on mobile — no pulldown. */
        try{ window._expandAllLayerGroups&&window._expandAllLayerGroups(); }catch(_){}
        /* ══ (#R232) 「モバイル版のレイヤー選択欄についても、タイル形式のものに。」 ═══════════════════
           The classic dropdown stays mounted here and stays the source of truth — every tile toggles a
           REAL checkbox in it — but on a phone it is now the hidden data source rather than the UI
           (`body.m-lyr-tiles` hides its rows; see css/intmap.css). Nothing is lost by hiding them: the
           per-row sliders and date pickers have been `display:none !important` app-wide since #R16
           (every such control lives in that layer's legend), so a row was only ever a checkbox and a
           name — which is exactly what a tile is, plus the picture. */
        try{ window.IntMapLayerSidebar&&window.IntMapLayerSidebar.mountInto&&window.IntMapLayerSidebar.mountInto(moMountLayers); document.body.classList.add('m-lyr-tiles'); }catch(_){}
      }
      else{ restoreHome(layerDropdown); restoreHome(satController); closeSheet(); document.body.classList.remove('sheet-full');
        /* ⚠ restoreHome(satController) STAYS: a session that was narrow when #R234 shipped may still
           have the element parked in #mo-mount-sat, and widening has to bring it back either way. */
        /* (#R232) back to the desktop: drop the phone's grid so it cannot go stale behind the real one */
        try{ window.IntMapLayerSidebar&&window.IntMapLayerSidebar.unmountFrom&&window.IntMapLayerSidebar.unmountFrom(moMountLayers); }catch(_){}
        document.body.classList.remove('m-lyr-tiles'); }
      try{ window._placeActiveSection&&window._placeActiveSection(); }catch(_){}   /* (#R34) re-home the Active-layers bar for the new layout */
    }

    /* =================== THE BOTTOM SHEET =================== */
    let currentDetent='peek';
    function curTy(){ return parseFloat(getComputedStyle(sidebar).getPropertyValue('--sheet-ty'))||0; }
    function detents(){
      /* (#R240) the fallback follows `--sheet-h` (was a second copy of the old 0.92) — the sheet's
         height has one owner in the stylesheet and this is the only place that has to guess. */
      const H=sidebar.offsetHeight||Math.round(window.innerHeight*0.86);
      /* Peek collapses the sheet down to JUST BELOW the News/Information tab row, so everything
         beneath the tabs (pin toggle, filters, the feed) hides away — maximising the map. */
      const tabs=sidebar.querySelector('.control-panel');
      let peek;
      if(tabs && tabs.offsetParent!==null){ peek=tabs.offsetTop+tabs.offsetHeight+10; }
      else { const vis=['live-news-feed','info-dashboard','community-feed','news-reader-pane'].map(id=>document.getElementById(id)).find(e=>e && e.offsetParent!==null); peek=vis?vis.offsetTop:196; }
      peek=Math.min(Math.max(peek,120),Math.round(H*0.62));
      /* (#R22) MINI now collapses BELOW the IntMap logo too ("ロゴが見えなくなるまで格納できるように") —
         only the drag grip stays, maximising the map. The grip remains the handle to pull it back up. */
      const grip=sidebar.querySelector('.sheet-grip');
      const header=sidebar.querySelector('.header-area');
      let mini;
      if(header && header.offsetParent!==null) mini=Math.max(26, header.offsetTop - 4);   /* cut just ABOVE the logo */
      else if(grip && grip.offsetParent!==null) mini=grip.offsetTop+grip.offsetHeight+10;
      else mini=40;
      mini=Math.min(Math.max(mini,26), Math.max(40,peek-24));
      const tyPeek=Math.max(0,H-peek); const tyHalf=Math.min(Math.round(H*0.5),tyPeek); const tyMini=Math.max(0,H-mini);
      return { full:0, half:tyHalf, peek:tyPeek, mini:tyMini, H:H, peekH:peek };
    }
    function recompute(){ const d=detents(); if(mapContainer) mapContainer.style.setProperty('--peek-h',d.peekH+'px'); return d; }
    /* (#R139) exact evaluator for the sheet's CSS timing curve so the map's optical centre re-pads on the SAME
       curve+duration as the sheet slide (was 300ms / default easing vs the sheet's 460ms cubic-bezier — they
       settled out of phase, the "同期がまだよわい"). Newton-Raphson invert of the bezier x, then read y. */
    function _cubicBezier(x1,y1,x2,y2){ const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx, cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
      const fx=t=>((ax*t+bx)*t+cx)*t, dfx=t=>(3*ax*t+2*bx)*t+cx, fy=t=>((ay*t+by)*t+cy)*t;
      return function(x){ if(x<=0)return 0; if(x>=1)return 1; let t=x; for(let i=0;i<6;i++){ const e=fx(t)-x; if(Math.abs(e)<1e-4)break; const dv=dfx(t); if(Math.abs(dv)<1e-6)break; t-=e/dv; } return fy(t); }; }
    const _sheetEase=_cubicBezier(0.32,0.72,0,1);   /* === --sheet-ease in CSS */
    function setDetent(name,animate){
      if(animate===undefined) animate=true; const d=recompute(); currentDetent=name;
      const ty=(d[name]!=null)?d[name]:d.half;
      if(!animate) sidebar.classList.add('sheet-dragging');
      sidebar.style.setProperty('--sheet-ty',ty+'px');
      if(!animate){ void sidebar.offsetHeight; sidebar.classList.remove('sheet-dragging'); }
      document.body.classList.toggle('sheet-full', name==='full');
      /* keep the map's optical center inside the area visible ABOVE the sheet — but ONLY on mobile.
         (#R13) On desktop there is no bottom sheet; if this ever runs there it must not pad the bottom,
         which was dropping the map's optical center toward the bottom of the screen. */
      const covered=mq.matches?Math.min(Math.max(0,d.H-ty), Math.round(window.innerHeight*0.82)):0;
      /* --sheet-cover tracks how much the sheet currently covers, so floating controls (timebar,
         Summarize, legends) sit just above the sheet's CURRENT top — not the fixed peek line — and
         therefore stay visible at every detent (#32). */
      if(mapContainer) mapContainer.style.setProperty('--sheet-cover', covered+'px');
      /* (#R140) glide the camera in TRUE lock-step with the sheet. R139 tried map.setPadding(pad,{duration,easing})
         but in MapLibre GL JS v5 setPadding is INSTANTANEOUS — its 2nd arg is eventData, NOT animation options — so
         that duration/easing was silently ignored and the camera JUMPED in one frame while the sheet slid 460ms
         ("同期がまだよわい"). The real animated-padding API is easeTo({padding,…}); feed it the SAME 460ms + the sheet's
         own cubic-bezier so the optical centre and the sheet ride the identical curve. Non-animated → instant setPadding. */
      const _pad={top:0,left:0,right:0,bottom:covered};
      /* (#R142) A live-drag setPadding can still be queued for the NEXT animation frame at this moment (liveMapPad's
         rAF). MapLibre GL JS v5 setPadding IS jumpTo(), and jumpTo() begins with stop() — so that one stale frame would
         ABORT this settle easeTo and freeze the camera padding at the drag-RELEASE value, leaving the map's optical
         centre offset from the settled sheet until the next drag ("ボトムシートを移動した際に地図中心がずれる・再び動かすと
         直る"). Cancel the pending rAF and sync the live-pad bookkeeping so nothing can interrupt the settle. */
      if(_padRAF){ try{ cancelAnimationFrame(_padRAF); }catch(_){} _padRAF=0; } _lastPad=_padPending=covered;
      try{ const C=_cam(); if(C){ if(animate) C.easeTo({padding:_pad, duration:460, easing:_sheetEase}); else C.setPadding(_pad); } }catch(_){}
    }
    window.__setDetent=setDetent;

    let dragging=false,startY=0,startTy=0,lastY=0,lastT=0,vel=0,maxTy=0,dragD=null,_padRAF=0,_lastPad=-1,_padPending=-1;
    /* Keep the map's optical center inside the area visible ABOVE the sheet, live (no animation)
       so the centerd point never drifts while the sheet is being dragged.
       (#R12) map.setPadding reprojects the whole camera — doing it 60×/s on a WebGL globe is what made
       the live re-center feel janky. The --sheet-cover CSS var still tracks every frame (cheap, so the
       floating controls glide), but the expensive setPadding is gated to ≥2px movement and one call/rAF. */
    function liveMapPad(ty,d){ d=d||dragD||recompute();
      const covered=mq.matches?Math.min(Math.max(0,d.H-ty), Math.round(window.innerHeight*0.82)):0;
      if(mapContainer) mapContainer.style.setProperty('--sheet-cover', covered+'px');   /* controls follow the sheet live (#32) */
      if(!_cam()) return;
      /* (#R140) map padding is rAF-coalesced for perf (setPadding reprojects the whole camera), but R139 applied the
         value captured when the rAF was SCHEDULED — the OLDEST move in the frame — so during a fast flick the camera
         trailed the finger by the whole flick. Store the NEWEST covered value and read it inside the rAF; the sheet
         transform is written synchronously in dragMove, so sheet+map now stay within one frame (~16ms) of each other. */
      _padPending=covered;
      if(_padRAF) return; _padRAF=requestAnimationFrame(()=>{ _padRAF=0; if(_padPending===_lastPad) return; _lastPad=_padPending; try{ const C=_cam(); if(C) C.setPadding({top:0,left:0,right:0,bottom:_padPending}); }catch(_){} }); }
    function dragStart(y){ try{ const C=_cam(); if(C) C.stop(); }catch(_){}   /* (#R140) cancel any in-flight snap easeTo so a re-grab mid-animation hands control straight back to the finger */
      dragD=recompute(); maxTy=dragD.peek; dragging=true; startY=y; startTy=curTy(); lastY=y; lastT=performance.now(); vel=0; _lastPad=-1; _padPending=-1; sidebar.classList.add('sheet-dragging'); }   /* (#R107) PEEK is now the lowest detent — the MINI (logo-hidden) stop is disabled per request */
    function dragMove(y){ if(!dragging) return; let ty=Math.max(0,Math.min(maxTy,startTy+(y-startY))); sidebar.style.setProperty('--sheet-ty',ty+'px'); liveMapPad(ty,dragD); const now=performance.now(),dt=now-lastT; if(dt>0) vel=(y-lastY)/dt; lastY=y; lastT=now; }
    function dragEnd(){ if(!dragging) return; dragging=false; sidebar.classList.remove('sheet-dragging'); const d=recompute(); const ty=curTy();
      const order=[{n:'full',v:d.full},{n:'half',v:d.half},{n:'peek',v:d.peek}]; let target;   /* (#R107) 'mini' removed — 'peek' is the lowest detent now */
      if(vel>0.45) target=order.find(o=>o.v>ty+2)||order[order.length-1];
      else if(vel<-0.45){ const rev=order.slice().reverse(); target=rev.find(o=>o.v<ty-2)||order[0]; }
      else target=order.reduce((a,b)=>Math.abs(b.v-ty)<Math.abs(a.v-ty)?b:a);
      setDetent(target.n);
    }
    const grip=sidebar.querySelector('.sheet-grip');
    if(grip){
      grip.addEventListener('pointerdown',e=>{ if(!mq.matches) return; try{grip.setPointerCapture(e.pointerId);}catch(_){} dragStart(e.clientY); });
      grip.addEventListener('pointermove',e=>{ if(dragging) dragMove(e.clientY); });
      grip.addEventListener('pointerup',dragEnd); grip.addEventListener('pointercancel',dragEnd);
    }
    /* ══ (#R231) SCROLL TO THE TOP AND KEEP PULLING → THE SHEET COMES DOWN ═══════════════════════
       「モバイル版で、ウィジェットを上下スクロールした時に、一番上までスクロールしたら、そこから
         ボトムシートを下げる動作に自然に移行するように。（Countries、Atlasでも）」

       This existed, and it was a LIST OF FIVE ELEMENT IDS — so the two tabs the report names were the
       two it did not cover (#countries-feed was split out of the news feed in #R78e and #atlas-feed was
       added in #R112; neither was added here), and neither was any scroller NESTED inside a tab, which
       is what an Atlas reply or a Countries card actually is.

       ⚠ SO IT NO LONGER NAMES ELEMENTS. One delegated listener on the sheet finds, at touchstart, the
       nearest genuinely-scrollable ancestor of whatever was touched, and hands over to the sheet drag
       when that scroller is at its top (or when there is nothing scrollable under the finger at all).
       A tab added later is covered for free, which is the property the id list never had.

       ⚠ AND THE `currentDetent==='full'` GATE IS GONE. The instruction is about scrolling a widget to
       the top, not about the sheet being at its maximum; at 'half' the same pull now lowers it to
       'peek' instead of doing nothing. `dragStart(y)` is called with the CURRENT finger position, so
       the sheet picks the gesture up exactly where the scroll ended — that is the 自然に移行. */
    {
      let active=false, sy=0, sx=0, sc=null, armed=false;
      /* computed ONCE per gesture (getComputedStyle in a touchmove would be a per-frame cost) */
      function scrollerUnder(node){
        for(let el=node; el && el!==sidebar && el.nodeType===1; el=el.parentElement){
          let ov=''; try{ ov=getComputedStyle(el).overflowY; }catch(_){ }
          if((ov==='auto'||ov==='scroll') && el.scrollHeight>el.clientHeight+1) return el;
        }
        return null;
      }
      sidebar.addEventListener('touchstart',e=>{
        active=false; armed=false; sc=null;
        if(!mq.matches || dragging || currentDetent==='peek') return;
        const t=e.touches[0]; sy=t.clientY; sx=t.clientX;
        /* the grip has its own drag; anything that takes a horizontal gesture keeps it */
        if(e.target.closest && (e.target.closest('.sheet-grip')||e.target.closest('input[type=range]')||e.target.closest('.m-sheet'))) return;
        sc=scrollerUnder(e.target); armed=true;
      },{passive:true});
      sidebar.addEventListener('touchmove',e=>{
        if(!armed || !mq.matches) return;
        const t=e.touches[0], y=t.clientY, dy=y-sy, dx=t.clientX-sx;
        if(!active){
          if(dy<=6 || Math.abs(dx)>Math.abs(dy)) return;      /* an upward or sideways gesture is not ours */
          if(sc && sc.scrollTop>0) return;                    /* still scrolling content — leave it alone */
          active=true; dragStart(y);
        }
        e.preventDefault(); dragMove(y);
      },{passive:false});
      const end=()=>{ armed=false; if(active){ active=false; dragEnd(); } };
      sidebar.addEventListener('touchend',end,{passive:true});
      sidebar.addEventListener('touchcancel',end,{passive:true});
    }

    /* ══ (#R231) A FULLY-RAISED SHEET MAKES THE VISIBLE MAP UNTAPPABLE ══════════════════════════
       「ボトムシートを最大まで上げた時点では、地図が見えている部分のタップは無効化し、（ホバーは
         可能）タップすればボトムシートを中の高さまで自動で下げるように。」

       ⚠ IT IS A `click` SWALLOW, NOT A POINTER BLOCK, AND THAT IS THE WHOLE DESIGN. The two obvious
       implementations — `pointer-events:none` on #map, or a transparent catcher over it — both take
       the HOVER with them, and hover is explicitly to be kept. Pointer events are therefore never
       touched: the canvas still gets pointerover/pointermove (hover, the coordinate readout, the
       feature highlight) and still gets pointerdown/move/up, so the map can still be panned and
       pinched with the sheet up. Only the tap's `click` (and its long-press `contextmenu`) is caught,
       in the CAPTURE phase on window — which runs before the renderer's own listeners on #map — and
       turned into "lower the sheet to the middle detent".

       ⚠ The target test is `#map` and not `.map-container`: the search pill, the time machine, the
       legends and the readout are siblings inside the container, and they are chrome, not map. */
    window.addEventListener('click',e=>{
      if(!mq.matches || currentDetent!=='full') return;
      const t=e.target;
      if(!t || !t.closest || !t.closest('#map')) return;
      e.stopPropagation(); e.preventDefault();
      setDetent('half');
    },true);
    window.addEventListener('contextmenu',e=>{
      if(!mq.matches || currentDetent!=='full') return;
      const t=e.target;
      if(!t || !t.closest || !t.closest('#map')) return;
      e.stopPropagation(); e.preventDefault();
      setDetent('half');
    },true);
    /* tapping a tab while collapsed lifts the sheet; focusing search expands it */
    /* (#R112) The Atlas tab is a chat whose INPUT sits at the bottom of the panel, so 'half' would leave it off-screen —
       it lifts the sheet to FULL (matching how a messaging sheet opens). Other tabs keep the peek→half behaviour. The
       Atlas lift uses animate=false because (per #R110) changing --sheet-ty while the transform-transition is live does
       NOT re-trigger it in Chromium (the sheet stays stuck at peek); animate=false forces the reflow so it snaps to full.
       The delay lets this win over any earlier detent set in the same click. */
    document.querySelectorAll('.control-panel .mode-btn').forEach(b=>{
      const isAtlas=(b.id==='btn-community');
      b.addEventListener('click',()=>{ if(!mq.matches) return; const wasPeek=currentDetent==='peek'; setTimeout(()=>{ if(isAtlas) setDetent('full', false); else if(wasPeek) setDetent('half'); else setDetent(currentDetent,false); },70); });
    });
    const si=document.getElementById('search-input'); if(si) si.addEventListener('focus',()=>{ if(mq.matches && currentDetent!=='full') setDetent('full'); });

    /* =================== place-search FAB =================== */
    (function(){
      const ms=document.getElementById('map-search'); const input=document.getElementById('ms-input'); if(!ms) return;
      function open(){ ms.classList.add('ms-open'); document.body.classList.add('search-open'); setTimeout(()=>{ try{input.focus();}catch(_){} },60); }
      function close(){ ms.classList.remove('ms-open'); document.body.classList.remove('search-open'); }
      ms.addEventListener('click',e=>{ if(!mq.matches) return; if(!ms.classList.contains('ms-open')){ e.stopPropagation(); e.preventDefault(); open(); } },true);
      if(input) input.addEventListener('blur',()=>{ if(mq.matches && !input.value.trim()) setTimeout(close,150); });
      document.addEventListener('click',e=>{ if(mq.matches && ms.classList.contains('ms-open') && !ms.contains(e.target) && (!input||!input.value.trim())) close(); });
    })();

    /* =================== boot + responsive (self-healing) =================== */
    let lastIsM=null;
    function syncResponsive(){
      const isM=mq.matches; const crossed=(isM!==lastIsM);
      if(crossed){ applyLayout(isM); lastIsM=isM; }
      /* (#R15b) Entering the mobile layout (first load OR crossing 768px) snaps to PEEK — the requested
         default — synchronously, so there's no half→peek flash and no dependency on the rAF below firing. */
      if(isM){ recompute(); setDetent(crossed?'peek':currentDetent,false); if(crossed){ try{ window._expandAllLayerGroups&&window._expandAllLayerGroups(); }catch(_){} } }
      else{ document.body.classList.remove('sheet-full'); try{ const C=_cam(); if(C) C.setPadding({top:0,left:0,right:0,bottom:0}); }catch(_){} }
    }
    syncResponsive();                                                     // initial layout at load width
    /* (#R15) Default the sheet to PEEK on load: the News/Information/Stats/Community tab row stays visible
       but everything beneath it is tucked away, maximising the map (the user's requested default). */
    if(mq.matches) requestAnimationFrame(()=>setDetent('peek',true));     // animated entrance on phones
    if(mq.addEventListener) mq.addEventListener('change',syncResponsive); // width crosses 768 in either direction
    window.addEventListener('resize',syncResponsive);                    // dvh / toolbar / rotation changes
    window.addEventListener('orientationchange',()=>setTimeout(syncResponsive,220));
    updateCompass();
    /* (#R231) the base-map square lives under the search FAB and owns the five view controls that used
       to sit at the top of the Map & layers sheet. It builds itself only at phone widths and watches
       the same 768 px query this function does, so it is installed once, here, next to the chrome it
       belongs with. */
    try{ window.IntMapBasemapSwitch && window.IntMapBasemapSwitch.install(); }catch(_){ }
  }
  return initMobileUI;
};

window.IntMapModules.layoutReflow=function(HOST){
  const applySidebarStyle=HOST.applySidebarStyle;
  /* (#R172) the resize below goes through IntMapGeoEngine too — this is a SEPARATE factory closure from
     mobileUI above, so it needs its own handle (the split-scope check catches exactly this). */
  const _GE=()=>window.IntMapGeoEngine;
  /* (#R21) Narrow-desktop watcher: body.ms-narrow drops the search pill to a second row whenever
     the visible map area is too narrow for pill + view buttons side-by-side. */
  (function(){
    /* No isMobile() early-return — the page can LOAD at a mobile width and later widen (or vice
       versa), so the check lives inside the handler and the observer runs for the page's life. */
    function wire(){
      const ms=document.querySelector('.map-search'); if(!ms||!ms.parentElement) return;
      const host=ms.parentElement;
      /* (#R22) Trigger the second-row drop sooner (640→760) so the centerd pill can never graze the
         map/satellite view buttons or the sidebar at in-between widths ("画面幅によってはかぶる"). */
      /* (#R25) ROOT CAUSE of "still overlaps / can't type at narrow desktop": the old fixed 760px width
         threshold did NOT fire at e.g. 820px even though the CENTERED pill physically collided with the
         right-hand view buttons (measured overlap; the input then hit-tested under map-controls-top). Drop
         to row 2 based on REAL collision geometry instead — would a centered pill cross the right controls'
         left edge or the left controls' right edge? (The controls don't move when the pill drops, so this
         is stable — no flicker loop.) */
      const upd=()=>{ try{ const desk=window.matchMedia('(min-width:769px)').matches;
        if(document.body.classList.contains('ws-mode')){ document.body.classList.remove('ms-narrow'); document.body.classList.remove('ms-hide'); return; }   /* (#R78d) ws-mode pins the search bar inside the map window itself */
        if(!desk){ document.body.classList.remove('ms-narrow'); return; }
        const winW=window.innerWidth;
        /* (#R65) the pill anchors are VIEWPORT-fixed but the map area is not the viewport anymore: the
           in-flow RIGHT layer sidebar (and future flex siblings) shrink it. Everything below works against
           the visible map area's edges, so the pill can never be stretched across the right sidebar (the
           reported bug: ms-narrow's full-width branch set --ms-right:14px = across the open sidebar). */
        let mapL=0, mapR=winW, mapCX=winW/2;
        /* (#R66) use the map rect even when it is squeezed to ~0 — discarding it re-enabled the overlap */
        try{ const mc=document.querySelector('.map-container'); if(mc){ const r=mc.getBoundingClientRect(); if(r.right>0){ mapL=r.left; mapR=r.right; mapCX=r.left+r.width/2; } } }catch(_){}
        let rightLeft=mapR, stackBottom=66;
        document.querySelectorAll('.map-controls-top .map-view-group, #btn-layers').forEach(el=>{ const r=el.getBoundingClientRect(); if(r.width>0){ rightLeft=Math.min(rightLeft,r.left); stackBottom=Math.max(stackBottom,r.bottom); } });
        let leftRight=mapL;
        try{ if(document.body.classList.contains('sidebar-glass')){ const sb=document.querySelector('.sidebar'); if(sb&&!sb.classList.contains('collapsed')) leftRight=Math.max(leftRight, sb.getBoundingClientRect().right); } }catch(_){}
        try{ const tg=document.querySelector('.btn-toggle-sidebar'); if(tg){ const r=tg.getBoundingClientRect(); if(r.width>0) leftRight=Math.max(leftRight,r.right); } }catch(_){}
        const half=110, margin=14;   /* half = half of a comfortable ~220px centered pill */
        const collide = ((mapCX + half + margin) > rightLeft) || ((mapCX - half - margin) < leftRight);
        const bs=document.body.style;
        if(collide){
          /* (#R122) KEEP the pill at the TOP whenever the horizontal gap between the (expanded) sidebar and the
             right-hand controls is wide enough for it — centered in that gap at a CAPPED width, so expanding the
             left panel no longer drops the place-search to a second row and stretches it full-width ("下に下がって
             きて、不用意に長くなる"). Only when the top gap is genuinely too narrow does it fall BELOW the controls. */
          const gapL=leftRight+14, gapR=rightLeft-14, gapW=gapR-gapL;
          if(gapW>=180){
            const pill=Math.min(380,gapW), cx=(gapL+gapR)/2;
            bs.setProperty('--ms-top','14px');
            bs.setProperty('--ms-left', Math.round(cx-pill/2)+'px');
            bs.setProperty('--ms-right', Math.round(winW-(cx+pill/2))+'px');
            document.body.classList.remove('ms-hide'); document.body.classList.add('ms-narrow');
          } else {
            /* not enough room beside the controls at the top → go BELOW the whole stack, map-wide */
            let mLeft=leftRight+14, mRight=winW - mapR + 14;
            bs.setProperty('--ms-top', (stackBottom+10)+'px');
            const maxLeft=(winW - mRight) - 160;
            if(mLeft>maxLeft) mLeft=Math.max(mapL+14, maxLeft);
            const usable=(winW - mRight) - mLeft;
            if(usable<120){ document.body.classList.add('ms-hide'); document.body.classList.remove('ms-narrow'); }
            else{
              document.body.classList.remove('ms-hide');
              bs.setProperty('--ms-left', Math.round(mLeft)+'px');
              bs.setProperty('--ms-right', Math.round(mRight)+'px');
              document.body.classList.add('ms-narrow');
            }
          }
        } else { document.body.classList.remove('ms-narrow'); document.body.classList.remove('ms-hide'); }
      }catch(_){} };
      try{ const ro=new ResizeObserver(upd); ro.observe(host); const sb=document.querySelector('.sidebar'); if(sb) ro.observe(sb); }catch(_){ window.addEventListener('resize',upd); }
      window.addEventListener('resize',upd); window.addEventListener('intmap-sidebar-resize',upd); setTimeout(upd,300); upd(); }
    if(document.readyState!=='loading') setTimeout(wire,0); else document.addEventListener('DOMContentLoaded',wire);
  })();

  /* (#R21) Desktop sidebar width is user-resizable — a slim col-resize handle on the sidebar's
     right edge drives --sidebar-w; persists in intmap_sidebar_w; camera padding re-follows. */
  (function(){
    function init(){
      const sb=document.getElementById('sidebar'); if(!sb) return;
      /* The width override lives in a DESKTOP-ONLY media rule (NOT an inline :root style — that
         would beat the mobile @media :root{--sidebar-w:100vw} and shrink the bottom sheet). */
      const styleEl=document.createElement('style'); styleEl.id='sb-w-style'; document.head.appendChild(styleEl);
      const setW=(w)=>{ styleEl.textContent='@media(min-width:769px){ :root{ --sidebar-w:'+w+'px; } }'
        +'@media(max-width:768px){ #sb-resizer{ display:none; } }'; };
      styleEl.textContent='@media(max-width:768px){ #sb-resizer{ display:none; } }';
      try{ const w=parseInt(localStorage.getItem('intmap_sidebar_w')||'',10); if(w>=320&&w<=Math.max(760,window.innerWidth-60)) setW(w); }catch(_){}   /* (#R62) may span almost the full window */
      const h=document.createElement('div'); h.id='sb-resizer'; h.title=window.IntMapLang.t(HOST.lang,'Drag to resize','高さを調節','Zum Ändern der Höhe ziehen','Потяните, чтобы изменить размер','Arrastra para redimensionar');   /* (#R251) was a bare English literal */
      h.style.cssText='position:absolute;top:0;right:-3px;width:8px;height:100%;cursor:col-resize;z-index:1200;touch-action:none;';
      sb.appendChild(h);
      let drag=false,sx=0,sw=0;
      h.addEventListener('mouseenter',()=>{ h.style.background='linear-gradient(to right,transparent,rgba(0,122,255,0.35),transparent)'; });
      h.addEventListener('mouseleave',()=>{ if(!drag) h.style.background=''; });
      h.addEventListener('pointerdown',e=>{ drag=true; sx=e.clientX; sw=sb.offsetWidth;
        try{ h.setPointerCapture(e.pointerId); }catch(_){}
        document.body.style.userSelect='none'; sb.style.transition='none'; e.preventDefault(); });
      h.addEventListener('pointermove',e=>{ if(!drag) return;
        let w=sw+(e.clientX-sx); w=Math.max(320,Math.min(window.innerWidth-60,w));   /* (#R62) "地図がほぼ隠れるレベルまで広げられるように" — cap only at window−60px */
        setW(w);
        try{ const E=_GE(); if(E) E.render.resize(); }catch(_){} });
      h.addEventListener('pointerup',()=>{ if(!drag) return; drag=false;
        document.body.style.userSelect=''; sb.style.transition=''; h.style.background='';
        try{ localStorage.setItem('intmap_sidebar_w',String(sb.offsetWidth)); }catch(_){}
        try{ applySidebarStyle(false); }catch(_){} });
    }
    if(document.readyState!=='loading') setTimeout(init,0); else document.addEventListener('DOMContentLoaded',init);
  })();

  /* ---------- Custom scrollbars (#34) — non-Apple only; auto-hide ---------- */
  (function(){
    const ua=navigator.userAgent, plat=navigator.platform||'';
    const isApple=/Mac|iPhone|iPad|iPod/.test(plat) || (/Mac/.test(ua)&&navigator.maxTouchPoints>1) || /iPhone|iPad|iPod/.test(ua);
    if(isApple) return;                              /* macOS/iOS overlay scrollbars are already ideal */
    document.documentElement.classList.add('custom-scrollbars');
    /* (#R103) mark ONLY the element that actually scrolled (`.sb-on`), auto-clearing after 900 ms — so its scrollbar
       appears and every OTHER scrollbar on the page stays hidden. */
    const ping=(e)=>{ let el=e&&e.target; if(el===document||el===window) el=document.scrollingElement||document.documentElement;
      if(!el||el.nodeType!==1) return; el.classList.add('sb-on'); clearTimeout(el.__sbT); el.__sbT=setTimeout(()=>{ try{ el.classList.remove('sb-on'); }catch(_){} },900); };
    window.addEventListener('scroll',ping,{passive:true,capture:true});
  })();
};
