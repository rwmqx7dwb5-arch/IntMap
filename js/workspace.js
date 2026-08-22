/* ============================================================================
 *  IntMap · Floating-window workspace mode (desktop) — IntMapModules.workspace  (#R164)
 * ----------------------------------------------------------------------------
 *  window.IntMapWorkspace — News / Countries / map / layers / Atlas as free-floating, resizable,
 *  stackable windows with a persisted layout (intmap_ws4), plus the ticker strip integration.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R164): the body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang, currentMode -> HOST.mode, globalData -> HOST.globalData, newsFeatures -> HOST.newsFeatures, renderUI -> HOST.renderUI
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.workspace=function(HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const bringToFront=HOST.bringToFront, fetchData=HOST.fetchData, i18n=HOST.i18n, imToast=HOST.imToast, loadCommunity=HOST.loadCommunity, registerWindow=HOST.registerWindow, renderCompanies=HOST.renderCompanies, renderDashboard=HOST.renderDashboard, setMode=HOST.setMode, startNews=HOST.startNews;
  return (function(){
    const KEY='intmap_ws4';   /* (#R84) bumped — default restored to Countries·Map·Layers·Atlas (role-based tiling); old saved layouts not carried over */
    const T=window.IntMapLang.pick(()=>HOST.lang);
    const isMob=()=>window.matchMedia&&window.matchMedia('(max-width:768px)').matches;
    try{



}catch(_){}
    let on=false, wraps={}, holders={}, dock=null, saveT=null, ro=null, styled=false, scanT=null, _tickerBtn=null, _escH=null, _lastBottom=null;   /* (#R101) menu-bar ticker toggle; (#R102) ESC-fullscreen handler + last ticker-adjusted bottom */
    /* (#R78c) window set per the re-report: NO ticker window (「画面外の最下部に固定と何度も言っている」— it is a
       fixed bottom strip above the workspace), NO separate map-controls window (「操作パネルを新設するな」— the
       controls stay inside the map, where they belong), NO emoji in the titles. */
    /* (#R78e) The sidebar's four tabs become FOUR real windows (News & Countries now use separate feed divs, so
       they finally separate — "NewsとCountriesを分離しろ"). The News window stacks the search bar + filter +
       geocode row + feed + reader. Map & Layers as before. The sidebar chrome (title / language / login /
       feedback / settings) is duplicated in the top bar, so it is removed from the windows — no duplication. */
    const DEFS=[
      /* (#R79b) NEW default per request: Countries(left) · Map(center) · Layers(top-right) · Atlas(bottom-right).
         News is now hidden by default (available from the Window menu). Because it is hidden, its map pins must
         NOT appear — startNews() is gated on the News window being visible (see _wsNewsHidden), and enable()
         calls onHide for any window that starts hidden. */
      {id:'news',  sels:['#sidebar-search-bar','#news-filter-toggle','#ai-geocode-row','#live-news-feed','#news-reader-pane'], t:()=>T('News','ニュース','Nachrichten','Новости','Noticias'), min:[300,280], defHidden:true,
        /* (#R79) ROOT CAUSE of "workspace still shows no news": the old code called setMode('news') with NO
           btnId. setMode sets currentMode='news' then does getElementById(btnId).classList.add(...) — with
           btnId undefined that THROWS before renderUI() runs, so startNews() never fires and the feed stays
           empty on fresh boot (data was in globalData all along). Do it deterministically: if we're already on
           news/saved just renderUI(); otherwise switch via setMode WITH the real button id ('btn-news'). */
        onWrap:()=>{ try{
            if(HOST.mode==='news'||HOST.mode==='saved'){ if(typeof HOST.renderUI==='function') HOST.renderUI(); }
            else if(typeof setMode==='function'){ setMode('news','btn-news'); }
            /* if the feed is still empty (globalData not fetched yet), kick a fetch; its completion re-renders
               via `if(currentMode==='news') startNews()` now that currentMode is correctly 'news'. */
            try{ const f=document.getElementById('live-news-feed'); if(f&&!f.querySelector('.news-item')&&typeof fetchData==='function'&&(typeof HOST.globalData==='undefined'||!HOST.globalData.length)) fetchData(); }catch(_){}
          }catch(_){} },
        /* (#R78f) closing the News window must stop its map pins + the "summarize view" button ("永遠に地図に
           ニュース記事や要約ボタンがあるまま。news windowを閉じたらやめろ") */
        onHide:()=>{ try{ const E=window.IntMapGeoEngine; if(E&&E.layers.hasSource('news-points')) E.layers.setSourceData('news-points',{type:'FeatureCollection',features:[]}); }catch(_){} try{ const b=document.getElementById('ai-view-summary-btn'); if(b) b.style.display='none'; }catch(_){} },
        onShow:()=>{ /* restore pins directly (setMode('news') no-ops when currentMode is already 'news') */
          try{ const E=window.IntMapGeoEngine; if(E&&E.layers.hasSource('news-points')&&typeof HOST.newsFeatures!=='undefined') E.layers.setSourceData('news-points',{type:'FeatureCollection',features:HOST.newsFeatures}); }catch(_){}
          try{ const b=document.getElementById('ai-view-summary-btn'); if(b&&(HOST.mode==='news'||HOST.mode==='saved')) b.style.display=''; }catch(_){} } },
      /* (#R79b) Countries window now carries its OWN search bar + the compare dock (#stats-compare-fixed),
         stacked in the window body, so its search & country-comparison features work in workspace mode. */
      {id:'countries', sels:['#countries-search-bar','#countries-feed','#stats-compare-fixed'], t:()=>T('Countries','国別統計','Länder','Страны','Países'), min:[300,280],
        /* (#R79d) the Countries window pairs with the map's country-info layer, exactly like the Countries tab:
           showing it enables country hover/click on the map; HIDING it turns that OFF and clears the compare
           selection + any open country popup ("国ウィンドウを閉じてもcountriesが選択されている判定になっている"). */
        /* (#R83) the Countries window no longer force-enables the map's Countries(info) overlay (user request);
           it renders its own country rows/compare. cb-countries stays a manual layer toggle. */
        onWrap:()=>{ try{ window._wsRenderCountries&&window._wsRenderCountries(); }catch(_){} },
        onShow:()=>{ try{ window._wsRenderCountries&&window._wsRenderCountries(); }catch(_){} },
        onHide:()=>{ try{ window._clearCompare&&window._clearCompare(); }catch(_){} try{ const p=document.getElementById('country-popup'); if(p) p.style.display='none'; }catch(_){} } },
      {id:'info',     sels:['#info-search-bar','#info-dashboard','#co-compare-fixed'],  t:()=>T('Companies','企業','Unternehmen','Компании','Empresas'), min:[280,260], defHidden:true, onWrap:()=>{ try{ if(typeof renderCompanies==='function') renderCompanies(); }catch(_){} }, onShow:()=>{ try{ if(typeof renderCompanies==='function') renderCompanies(); }catch(_){} }},   /* (#R153) Companies window now carries its OWN search bar + compare dock (Countries parity) so filtering & comparison work in workspace mode */
      /* (#R231) THE MONITORS WINDOW IS WITHDRAWN with the sidebar tab it mirrors — 「MonitorsはNews/
         Companies/Countries/Atlasの並びから一旦撤去。」 Workspace mode listed it in its window menu,
         which is one of the 導線 the withdrawal has to close; leaving it would let a desktop reader
         open by name exactly the panel the phone and the sidebar no longer offer.
         ⚠ #monitors-feed still exists in index.html and js/monitors.js still builds it — nothing is
         deleted, this row is. Its default rect below (`monitors:flo(3)`) goes with it. */
      /* (#R101) Community window removed from workspace mode ("まだコミュニティ機能が残っている") — the community
         feature was already retired from the sidebar (R98); this leftover window/menu entry is gone too. */
      {id:'map',   sels:['#map-container'],   t:()=>T('Map','地図','Karte','Карта','Mapa'), min:[380,300]},
      {id:'layers',sels:['#layer-sidebar-r'], t:()=>T('Layers','レイヤー','Ebenen','Слои','Capas'), min:[260,300]},
      /* (#R84) DEFAULT layout per request = Countries(left) · Map(center) · Layers(top-right) · Atlas(bottom-right).
         News/Information/Community remain on-demand (defHidden). ensure() builds #atlas-panel before it is wrapped. */
      {id:'atlas', sels:['#atlas-panel'], t:()=>T('Atlas','Atlas','Atlas','Atlas','Atlas'), min:[300,300], ensure:()=>{ try{ if(window.IntMapAtlas) window.IntMapAtlas.call('open'); else if(window.IntMapConsole&&IntMapConsole.open) IntMapConsole.open(); }catch(_){} } }   /* (#R224) the kernel is on demand */
    ];
    /* ==== (#R78b) real window mechanics ("隣接ウィンドウの境界線で調節する機構がないし、隣接判定機構もない"):
       dedicated drag/resize with MAGNETIC SNAPPING to screen padding and other windows' edges (guide lines),
       and SHARED-BORDER resize — dragging an edge that abuts a neighbour resizes BOTH windows like a splitter. */
    let gV=null,gH=null;
    function _guides(){ if(gV) return; gV=document.createElement('div'); gV.className='ws-guide ws-gv'; gH=document.createElement('div'); gH.className='ws-guide ws-gh'; document.body.appendChild(gV); document.body.appendChild(gH); }
    function showG(ax,pos){ _guides(); const g=ax==='v'?gV:gH; g.style.display='block'; if(ax==='v') g.style.left=(pos-0.5)+'px'; else g.style.top=(pos-0.5)+'px'; }
    function hideG(){ if(gV){ gV.style.display='none'; gH.style.display='none'; } }
    function others(w){ const a=[]; for(const id in wraps){ const o=wraps[id]; if(o&&o!==w&&o.isConnected&&o.style.display!=='none'&&!o.dataset.min) a.push(o); } return a; }
    /* (#R102) ADJACENCY highlight: given a window + the hovered edge (n/s/e/w[+corner]), find the neighbour whose
       opposite edge sits on the same line and return the OVERLAPPING segment [x,y,w,h] to light up (the shared,
       draggable divider). Returns null when that edge isn't joined to anything. */
    let _adjEl=null;
    function _adjBox(){ if(_adjEl) return _adjEl; _adjEl=document.createElement('div'); _adjEl.className='ws-adj'; document.body.appendChild(_adjEl); return _adjEl; }
    function hideAdj(){ if(_adjEl) _adjEl.style.display='none'; }
    /* (#R104) EPS widened (6→10) so the join lights up a touch sooner, and the shared bar is 4px for clear visibility. */
    function sharedSeg(w,d){ try{ const l=w.offsetLeft,r=l+w.offsetWidth,t=w.offsetTop,bt=t+w.offsetHeight,EPS=10;
      for(const o of others(w)){ const ol=o.offsetLeft,or=ol+o.offsetWidth,ot=o.offsetTop,obt=ot+o.offsetHeight;
        if(d.indexOf('e')>=0&&Math.abs(r-ol)<EPS){ const a=Math.max(t,ot),b=Math.min(bt,obt); if(b-a>24) return [r-2,a,4,b-a]; }
        if(d.indexOf('w')>=0&&Math.abs(l-or)<EPS){ const a=Math.max(t,ot),b=Math.min(bt,obt); if(b-a>24) return [l-2,a,4,b-a]; }
        if(d.indexOf('s')>=0&&Math.abs(bt-ot)<EPS){ const a=Math.max(l,ol),b=Math.min(r,or); if(b-a>24) return [a,bt-2,b-a,4]; }
        if(d.indexOf('n')>=0&&Math.abs(t-obt)<EPS){ const a=Math.max(l,ol),b=Math.min(r,or); if(b-a>24) return [a,t-2,b-a,4]; }
      } }catch(_){} return null; }
    /* (#R102) show on hover; (#R103) ALSO show live while RESIZING/DRAGGING so you SEE the exact moment an edge joins a
       neighbour ("片方のウィンドウをのばしてもう片方に隣接して接合されるときが、どこでそうなるのかわからない"). */
    function showAdjFor(w,d){ const seg=d?sharedSeg(w,d):null; if(!seg){ hideAdj(); return; }
      const el=_adjBox(); el.style.display='block'; el.style.left=seg[0]+'px'; el.style.top=seg[1]+'px'; el.style.width=seg[2]+'px'; el.style.height=seg[3]+'px'; }
    /* (#R103) while DRAGGING a window (any edge can newly meet a neighbour) show whichever edge is currently joined. */
    function showAdjAny(w){ for(const d of ['e','w','s','n']){ const seg=sharedSeg(w,d); if(seg){ const el=_adjBox(); el.style.display='block'; el.style.left=seg[0]+'px'; el.style.top=seg[1]+'px'; el.style.width=seg[2]+'px'; el.style.height=seg[3]+'px'; return; } } hideAdj(); }
    /* (#R116) 8px snap on EVERY edge line made slow drags across a tiled layout stick repeatedly ("見えない壁の
       ように動かせないゾーン"): each of the many candidate lines held the window for a 16px band of mouse travel.
       6px keeps the magnetic join while roughly halving the sticky zones. */
    const SNAP=6;
    /* (#R117) invisible-wall killer #1: in a tiled layout MANY candidate lines sit 1–3px apart (each neighbour
       contributes 2 edges), so their ±SNAP bands OVERLAPPED into wide sticky corridors. Merge candidates closer
       than 3px into one line before snapping. #2: holding Alt disables snapping entirely (free drag/resize). */
    function _dedupe(a){ const s=a.slice().sort((x,y)=>x-y), out=[]; for(const v of s){ if(!out.length||v-out[out.length-1]>3) out.push(v); } return out; }
    /* (#R79d) the workspace's usable rectangle: BELOW the 34px top menu bar, down to the TOP of the ticker
       (the ticker owns the real screen bottom — "下端はティッカーであり実画面の下端ではない"), full width.
       Everything measures against this so windows reach the real edges but never overlap the menu or hide
       behind the ticker. */
    function wsBounds(){ let tkH=0; try{ const tb=document.getElementById('ticker-bar'); if(document.body.classList.contains('ticker-on')&&tb&&getComputedStyle(tb).display!=='none') tkH=tb.offsetHeight||30; }catch(_){} return {top:34, bottom:innerHeight-tkH, left:0, right:innerWidth}; }
    function xCands(w){ const b=wsBounds(); const a=[b.left,b.right]; others(w).forEach(o=>a.push(o.offsetLeft,o.offsetLeft+o.offsetWidth)); return _dedupe(a); }
    function yCands(w){ const b=wsBounds(); const a=[b.top,b.bottom]; others(w).forEach(o=>a.push(o.offsetTop,o.offsetTop+o.offsetHeight)); return _dedupe(a); }
    function nearest(cands,v){ let b=null,bd=SNAP+0.001; cands.forEach(c=>{ const d=Math.abs(v-c); if(d<bd){ bd=d; b=c; } }); return b; }
    function minOf(w){ return (w&&w.__wsMin)||[220,140]; }
    function wsDrag(w,tb){
      tb.addEventListener('pointerdown',e=>{ if(e.target.closest('button,input,select,a')) return; if(w.dataset.resizing) return; e.preventDefault();
        try{ bringToFront(w); }catch(_){}
        const sx=e.clientX,sy=e.clientY,sl=w.offsetLeft,st=w.offsetTop,cx=xCands(w),cy=yCands(w),B=wsBounds();
        const mv=ev=>{ let l=sl+ev.clientX-sx,t=st+ev.clientY-sy; hideG();
          if(ev.altKey){ l=Math.max(-w.offsetWidth+90,Math.min(innerWidth-90,l)); t=Math.max(B.top,Math.min(B.bottom-28,t)); w.style.left=l+'px'; w.style.top=t+'px'; _wsBump(); try{ showAdjAny(w); }catch(_){} return; }   /* (#R117) Alt = free drag, no magnetism; (#R311) the window just moved */
          /* snap either edge (left/right, top/bottom) to any candidate line */
          const sxl=nearest(cx,l), sxr=nearest(cx,l+w.offsetWidth);
          if(sxl!=null&&(sxr==null||Math.abs(sxl-l)<=Math.abs(sxr-(l+w.offsetWidth)))){ l=sxl; showG('v',sxl); }
          else if(sxr!=null){ l=sxr-w.offsetWidth; showG('v',sxr); }
          const syt=nearest(cy,t), syb=nearest(cy,t+w.offsetHeight);
          if(syt!=null&&(syb==null||Math.abs(syt-t)<=Math.abs(syb-(t+w.offsetHeight)))){ t=syt; showG('h',syt); }
          else if(syb!=null){ t=syb-w.offsetHeight; showG('h',syb); }
          l=Math.max(-w.offsetWidth+90,Math.min(innerWidth-90,l)); t=Math.max(B.top,Math.min(B.bottom-28,t));   /* (#R79d) title bar stays below the menu & above the ticker */
          w.style.left=l+'px'; w.style.top=t+'px'; _wsBump(); try{ showAdjAny(w); }catch(_){} };   /* (#R311) the window just moved */
        const up=()=>{ hideG(); try{ hideAdj(); }catch(_){} document.removeEventListener('pointermove',mv); document.removeEventListener('pointerup',up); schedSave(); buildJunctions(); };
        document.addEventListener('pointermove',mv); document.addEventListener('pointerup',up); });
    }
    /* ══ ⚠⚠⚠ (#R311) THE WINDOW'S RECTANGLE IS READ WHEN IT CHANGES, NOT WHEN THE POINTER MOVES ══
       `wsResize` hangs a `pointermove` on the window itself, and in ws-mode #map-container IS the
       body of the map window — so every pointer move while panning or zooming the map ran `edgeAt`,
       and `edgeAt` called `w.getBoundingClientRect()`, which forces a synchronous layout. No
       throttle. The hit test is unchanged (M/MN/OUT below are untouched); only the moment the
       rectangle is read moves. A cached entry is valid while its generation matches, and the
       generation is bumped by everything that can move or resize a `.ws-win`:
         · this file's own movers — `wsDrag`'s mv, `wsResize`'s mv, `wsGrip`'s mv and the junction
           drag — bumped in line, so the next event of the same gesture measures again;
         · every OTHER write of a window's inline style / class (retile, applyRects, the traffic
           lights' minimise / restore / close, enable / disable) — a MutationObserver per window;
         · the window changing size for any other reason — a ResizeObserver per window;
         · the viewport — `resize` and `orientationchange` (`wsBounds` is derived from innerWidth /
           innerHeight, so a retile follows, but the cache must not wait for its 180 ms debounce).
       ⚠ Scroll is deliberately absent: `.ws-win` is `position:fixed` (this file's own stylesheet),
       so no scroller can move one, and a listener for it would be a claim that is not true.
       ⚠ AND A BACKSTOP: an entry older than WS_GEO_TTL is stale whatever the observers saw. The
       worst an unknown channel can cost is a quarter second of late CURSOR — never a grab, because
       the pointerdown below still measures live, exactly as it did before. */
    const WS_GEO_TTL=250;
    const __wsGeo=new WeakMap();
    let __wsGen=0, __wsAt=0, __wsMO=null, __wsRO=null, __wsGeoArmed=false;
    function _wsBump(){ __wsGen++; }
    /* the TTL is charged once per event, so one pointer move never sees two generations */
    function _wsGen(){ const t=(window.performance&&performance.now)?performance.now():Date.now();
      if(t-__wsAt>WS_GEO_TTL){ __wsAt=t; __wsGen++; } return __wsGen; }
    function _wsRect(w){ const gen=_wsGen(), had=__wsGeo.get(w);
      if(had&&had.gen===gen) return had.r;
      const b=w.getBoundingClientRect(), r={left:b.left,top:b.top,width:b.width,height:b.height};
      __wsGeo.set(w,{gen:gen,r:r}); return r; }
    function _wsGeoWatch(w){
      if(!__wsGeoArmed){ __wsGeoArmed=true;
        try{ window.addEventListener('resize',_wsBump); window.addEventListener('orientationchange',_wsBump); }catch(_){} }
      try{ if(window.ResizeObserver){ if(!__wsRO) __wsRO=new ResizeObserver(_wsBump); __wsRO.observe(w); } }catch(_){}
      try{ if(window.MutationObserver){ if(!__wsMO) __wsMO=new MutationObserver(_wsBump);
        __wsMO.observe(w,{attributes:true,attributeFilter:['style','class','hidden']}); } }catch(_){}
      _wsBump(); }
    function wsResize(w){
      /* (#R116) BALANCED edge zones ("リサイズ判定ホバー範囲が広すぎたり、狭すぎたり"): R106's 22px band fixed the
         "too thin" feel but STOLE clicks on content near three window edges (a 22px frame where list taps started a
         resize instead). Now that the R107 cursor feedback works, 12px inside + 6px outside reach is comfortable to
         grab yet stops swallowing content clicks. The TOP edge stays a slim MN so it never steals the title-bar drag. */
      const M=12, MN=8, OUT=6, CUR={n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',ne:'nesw-resize',sw:'nesw-resize',nw:'nwse-resize',se:'nwse-resize'};
      /* (#R311) `rect` is the ONE addition; the arithmetic is byte-for-byte what it was, and a
         caller that passes nothing still measures live. Note the reach: this test answers for
         `-OUT … width+OUT`, so the box the hover path tests is the rectangle grown by OUT on every
         side — the cached rectangle is fed to the SAME expression, so that reach is unchanged. */
      const edgeAt=(cx,cy,rect)=>{ const r=rect||w.getBoundingClientRect(); const x=cx-r.left,y=cy-r.top; if(x<-OUT||y<-OUT||x>r.width+OUT||y>r.height+OUT) return ''; let h='',v=''; if(x<=M)h='w'; else if(x>=r.width-M)h='e'; if(y<=MN)v='n'; else if(y>=r.height-M)v='s'; return v+h; };
      _wsGeoWatch(w);   /* (#R311) …and this window's rectangle is watched instead of re-measured per event */
      /* (#R107) ROOT CAUSE of "リサイズのホバー判定範囲が狭すぎる" (re-report after R106 widened M): over the MAP CANVAS
         (and any child that sets its own cursor) the resize cursor set on `w` was OVERRIDDEN, so the edge felt dead
         even though the hit-zone was wide. Toggle a `.rz-hover` class in the edge zone; a CSS rule then forces every
         descendant to inherit `w`'s resize cursor while there — so the feedback shows over the canvas / lists too. */
      /* (#R311) the hover reads the cached rectangle (the press below still measures live). ⚠ AND
         THE CURSOR IS ONLY WRITTEN WHEN IT DIFFERS: writing the same value back would churn the
         `style` attribute, the MutationObserver would bump the generation, and the cache would
         invalidate itself once per pointer event — the exact cost this is removing. (`classList.
         toggle` with an explicit force already performs no update when nothing changes.) */
      w.addEventListener('pointermove',e=>{ if(w.dataset.resizing) return; const d=edgeAt(e.clientX,e.clientY,_wsRect(w)); const cv=d?CUR[d]:''; if(w.style.cursor!==cv) w.style.cursor=cv; w.classList.toggle('rz-hover',!!d); try{ showAdjFor(w,d); }catch(_){} });
      w.addEventListener('pointerleave',()=>{ if(!w.dataset.resizing){ w.style.cursor=''; w.classList.remove('rz-hover'); } try{ hideAdj(); }catch(_){} });
      w.addEventListener('pointerdown',e=>{ if(e.target.closest('button,input,select,textarea,a,[role="button"]')) return;
        const d=edgeAt(e.clientX,e.clientY); if(!d) return; if(w.dataset.min) return;
        e.preventDefault(); e.stopPropagation(); w.dataset.resizing=d; try{ bringToFront(w); }catch(_){}
        const sx=e.clientX,sy=e.clientY, sw=w.offsetWidth,sh=w.offsetHeight, sl=w.offsetLeft, st=w.offsetTop;
        const B=wsBounds(), EPS=5;
        /* (#R84) DIVIDER model — a grabbed edge is a shared divider LINE. Moving it moves EVERY window whose
           same edge sits on that line, on BOTH sides — so all column-mates (the same-column neighbours that share
           the edge) follow, not just the one window across the divider (the reported "隣接ウィンドウのみしか
           ついてこない" bug). Falls back to plain single-window resize when no window shares the line. */
        const allW=[w].concat(others(w));
        let vX=null, vLeft=[], vRight=[];
        if(d.indexOf('e')>=0||d.indexOf('w')>=0){ vX=(d.indexOf('e')>=0)?(sl+sw):sl;
          allW.forEach(o=>{ const l=o.offsetLeft,r=l+o.offsetWidth; if(Math.abs(r-vX)<EPS) vLeft.push({o,l,r}); if(Math.abs(l-vX)<EPS) vRight.push({o,l,r}); }); }
        let hY=null, hTop=[], hBot=[];
        if(d.indexOf('s')>=0||d.indexOf('n')>=0){ hY=(d.indexOf('s')>=0)?(st+sh):st;
          allW.forEach(o=>{ const t=o.offsetTop,bt=t+o.offsetHeight; if(Math.abs(bt-hY)<EPS) hTop.push({o,t,bt}); if(Math.abs(t-hY)<EPS) hBot.push({o,t,bt}); }); }
        /* (#R105) MAGNETIC SNAP while resizing: a FREE edge (not already a shared divider) snaps onto a neighbour's
           edge / the screen bound as you drag it there, so the moment two windows JOIN is deterministic AND shown
           (guide line + pulsing join bar). A divider edge already abuts, so it moves freely (no self-snap). */
        const cxSnap=xCands(w), cySnap=yCands(w);
        const vShared=vLeft.some(p=>p.o!==w)||vRight.some(p=>p.o!==w);
        const hShared=hTop.some(p=>p.o!==w)||hBot.some(p=>p.o!==w);
        const mv=ev=>{ const dx=ev.clientX-sx, dy=ev.clientY-sy; hideG();
          if(vX!=null){ let nx=vX+dx, lo=B.left+90, hi=B.right-90;
            vLeft.forEach(p=>{ lo=Math.max(lo,p.l+(minOf(p.o)[0]||160)); }); vRight.forEach(p=>{ hi=Math.min(hi,p.r-(minOf(p.o)[0]||160)); });
            if(!vShared&&!ev.altKey){ const sn=nearest(cxSnap,nx); if(sn!=null&&sn>=lo&&sn<=hi) nx=sn; }   /* (#R117) Alt = free resize */
            nx=Math.max(lo,Math.min(hi,nx)); showG('v',nx);
            vLeft.forEach(p=>{ p.o.style.left=p.l+'px'; p.o.style.width=Math.max(120,nx-p.l)+'px'; });
            vRight.forEach(p=>{ p.o.style.left=nx+'px'; p.o.style.width=Math.max(120,p.r-nx)+'px'; }); }
          if(hY!=null){ let ny=hY+dy, lo=B.top+70, hi=B.bottom-70;
            hTop.forEach(p=>{ lo=Math.max(lo,p.t+(minOf(p.o)[1]||120)); }); hBot.forEach(p=>{ hi=Math.min(hi,p.bt-(minOf(p.o)[1]||120)); });
            if(!hShared&&!ev.altKey){ const sn=nearest(cySnap,ny); if(sn!=null&&sn>=lo&&sn<=hi) ny=sn; }   /* (#R117) Alt = free resize */
            ny=Math.max(lo,Math.min(hi,ny)); showG('h',ny);
            hTop.forEach(p=>{ p.o.style.top=p.t+'px'; p.o.style.height=Math.max(90,ny-p.t)+'px'; });
            hBot.forEach(p=>{ p.o.style.top=ny+'px'; p.o.style.height=Math.max(90,p.bt-ny)+'px'; }); }
          _wsBump();   /* (#R311) the divider just moved every window on both sides of it */
          fitMap(); try{ showAdjFor(w,d); }catch(_){} };
        const up=()=>{ delete w.dataset.resizing; hideG(); try{ hideAdj(); }catch(_){} w.style.cursor=''; document.removeEventListener('pointermove',mv); document.removeEventListener('pointerup',up); _wsBump(); fitMap(); schedSave(); buildJunctions(); };
        document.addEventListener('pointermove',mv); document.addEventListener('pointerup',up); });
    }
    /* (#R79b) a big, visible bottom-right grip that resizes the window (no neighbour-splitter logic — a plain,
       obvious "grab and drag to resize" the user asked for). Works alongside the invisible edge zones. */
    function wsGrip(w){ const g=document.createElement('div'); g.className='ws-grip'; g.title=T('Drag to resize','ドラッグでリサイズ','Zum Größenändern ziehen','Тяните, чтобы изменить размер','Arrastra para redimensionar'); w.appendChild(g);
      g.addEventListener('pointerdown',e=>{ if(w.dataset.min) return; e.preventDefault(); e.stopPropagation(); w.dataset.resizing='se'; try{ bringToFront(w); }catch(_){}
        const sx=e.clientX,sy=e.clientY,sw=w.offsetWidth,sh=w.offsetHeight,mn=minOf(w),B=wsBounds();
        try{ g.setPointerCapture&&g.setPointerCapture(e.pointerId); }catch(_){}
        /* (#R79d) clamp to the usable rect: right → screen edge, bottom → TICKER TOP (not the real screen bottom) */
        const mv=ev=>{ const wd=Math.max(mn[0],Math.min(B.right-w.offsetLeft,sw+ev.clientX-sx)), hg=Math.max(mn[1],Math.min(B.bottom-w.offsetTop,sh+ev.clientY-sy)); w.style.width=wd+'px'; w.style.height=hg+'px'; _wsBump(); fitMap(); try{ showAdjFor(w,'se'); }catch(_){} };   /* (#R311) the grip just resized it */
        const up=ev=>{ delete w.dataset.resizing; try{ g.releasePointerCapture&&g.releasePointerCapture(ev.pointerId); }catch(_){} try{ hideAdj(); }catch(_){} document.removeEventListener('pointermove',mv); document.removeEventListener('pointerup',up); fitMap(); schedSave(); buildJunctions(); };
        document.addEventListener('pointermove',mv); document.addEventListener('pointerup',up); }); }
    function css(){ if(styled) return; styled=true; const st=document.createElement('style'); st.id='ws-style';
      st.textContent=
        /* (#R115) theme-aware: --bg-main was NEVER defined, so the fallback #0d1117 made ws-mode BLACK even in
           light mode ("In light mode, in workspace mode, do not make background black"). --bg-color follows the theme. */
        'body.ws-mode{background:var(--bg-color,#0d1117);}'
        +'body.ws-mode .operation-room{display:block;background:radial-gradient(circle at 1px 1px, rgba(128,148,178,0.13) 1px, transparent 1.5px);background-size:22px 22px;}'
        /* (#R101) all windows share ONE background (the Countries window colour = --bg-color) so the title bars read
           uniformly ("上部の色が濃い黒とグレーで混在" → unified). Big 0 18px 50px shadow REMOVED — on tiled windows it
           radiated a halo over the neighbours around whichever window was in front ("操作中ウィンドウの放射する影は不要"). */
        +'.ws-win{position:fixed;z-index:900;display:flex;flex-direction:column;box-sizing:border-box;background:var(--bg-color,#0b0b0d);border:1px solid var(--glass-border,rgba(128,128,128,0.26));border-radius:13px;box-shadow:0 1px 5px rgba(0,0,0,0.16);overflow:hidden;min-width:120px;}'
        +'.ws-win.ws-ovis,.ws-win.ws-ovis .ws-body{overflow:visible;}'
        /* (#R107) while hovering a window's resize edge, force EVERY descendant (incl. the map canvas, which sets its
           own grab cursor) to show the window\'s resize cursor — otherwise the edge felt "dead" over content. */
        +'.ws-win.rz-hover *{cursor:inherit !important;}'
        /* (#R105) every window title bar is a UNIFORM grey (task: 全ウィンドウで共通の色・グレー). */
        +'.ws-tb{flex:0 0 25px;display:flex;align-items:center;gap:9px;padding:0 10px;background:#e4e6ea;border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));cursor:grab;user-select:none;-webkit-user-select:none;}'
        +'[data-theme="dark"] .ws-tb{background:#2b2b30;}'
        +'.ws-tb:active{cursor:grabbing;}'
        +'.ws-title{font-size:11.5px;font-weight:600;color:var(--text-muted);letter-spacing:0.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none;}'
        +'.ws-dots{display:flex;gap:7px;flex:0 0 auto;}'
        /* (#R78b) macOS-style traffic lights: plain dots at rest, the ×/−/+ glyphs appear on HOVER of the group */
        +'.ws-dot{width:12.5px;height:12.5px;border-radius:50%;border:none;cursor:pointer;padding:0;transition:filter .15s ease;display:flex;align-items:center;justify-content:center;position:relative;}'
        +'.ws-d-close{background:#ff5f57;}.ws-d-min{background:#febc2e;}.ws-d-max{background:#28c840;}'
        +'.ws-dot::before{font-size:9.5px;line-height:1;font-weight:800;color:rgba(60,20,10,0.6);opacity:0;transition:opacity .1s ease;pointer-events:none;transform:translateY(-0.5px);}'
        +'.ws-d-close::before{content:"\\00d7";}.ws-d-min::before{content:"\\2212";}.ws-d-max::before{content:"+";}'
        +'.ws-dots:hover .ws-dot::before{opacity:1;}'
        +'.ws-dot:active{filter:brightness(0.85);}'
        /* (#R116) join/snap indicators TONED DOWN ("ハイライトアニメーションが大げさすぎる"): a slim guide with a
           faint glow — visible, not theatrical. */
        +'.ws-guide{position:fixed;z-index:5995;background:var(--primary-color,#0a84ff);display:none;pointer-events:none;opacity:0.5;box-shadow:none;}'   /* (#R117) quieter still: hairline, no glow ("ハイライトアニメーションが大げさ") */
        /* (#R83) draggable junction handle where 3+ panes meet — moves both dividers at once */
        +'.ws-junction{position:fixed;z-index:947;width:18px;height:18px;border-radius:50%;transform:translate(-50%,-50%);cursor:move;background:rgba(10,132,255,0.16);border:1.5px solid rgba(10,132,255,0.55);touch-action:none;transition:background .12s ease,transform .12s ease;}'
        +'.ws-junction:hover{background:rgba(10,132,255,0.38);}'   /* (#R117) no grow-on-hover — the scale pop read as an exaggerated highlight */
        +'body.capture-mode .ws-junction{display:none !important;}'
        +'.ws-gv{top:0;bottom:0;width:3px;}.ws-gh{left:0;right:0;height:3px;}'
        /* (#R102) ADJACENCY indicator — hovering a window edge that is shared with a neighbour lights up exactly that
           join (the draggable divider), so you can SEE where two windows are joined ("どこで接合されるのかわかるUI").
           Minimal: only on hover, only the shared segment. */
        /* (#R104) join indicator made clearly visible ("接合されるときが、どこでそうなるのかわからない → わかるUI"):
           a crisp bright bar on the shared edge with a soft glow + a gentle pulse so the exact join reads at a glance.
           Simple & minimal — only the shared segment, only while hovering/dragging/resizing an abutting edge. */
        /* (#R116) NO pulse, faint glow — the pulsing glow bar was "大げさ". A steady slim bar reads just as well. */
        +'.ws-adj{position:fixed;z-index:944;background:var(--primary-color,#0a84ff);opacity:0.5;border-radius:3px;pointer-events:none;display:none;box-shadow:none;}'   /* (#R117) steady, subtle join bar — no glow */
        +'body.capture-mode .ws-adj{display:none !important;}'
        +'.ws-body{flex:1 1 auto;min-height:0;position:relative;display:flex;}'
        +'.ws-body>*{flex:1 1 auto;min-width:0;min-height:0;box-shadow:none !important;border-radius:0 !important;}'
        /* (#R104) the search field keeps its Atlas-pill rounding even inside a window (the blanket border-radius:0 above squared it). */
        +'body.ws-mode .ws-body>.search-bar{border-radius:21px !important;flex:0 0 auto !important;}'
        /* (#R79b) VISIBLE, easy-to-grab resize grip in the bottom-right corner ("リサイズがやりにくい。ドラッグ
           アンドドロップで簡単に") — the invisible edge zones stay, but this gives an obvious drag target. */
        +'.ws-win .ws-grip{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;z-index:946;touch-action:none;}'
        +'.ws-win .ws-grip::after{content:"";position:absolute;right:3px;bottom:3px;width:9px;height:9px;border-right:2px solid var(--text-muted,#8a8a94);border-bottom:2px solid var(--text-muted,#8a8a94);border-bottom-right-radius:3px;opacity:0.5;transition:opacity .15s ease;}'
        +'.ws-win .ws-grip:hover::after{opacity:1;}'
        +'.ws-win[data-min] .ws-grip{display:none;}'
        /* (#R78c) FILL the window, always: the app's own width/height rules are calc(100vw−…) formulas tied to
           body classes — inside a window they collapsed the map to 38px (measured; the "search bar flying away"
           and "map not centred" were the same bug). 100%!important pins every wrapped element to its window. */
        /* (#R78e) the sidebar shell (title / language / login / feedback / settings + tab buttons) is a duplicate
           of the top menu bar → hide it entirely; its content divs are pulled into their own windows */
        +'body.ws-mode #sidebar{display:none !important;}'
        +'body.ws-mode #map-container{position:relative !important;width:100% !important;max-width:none !important;height:100% !important;margin:0 !important;flex:1 1 auto !important;}'
        /* (#R101) the map View controls (Map/Satellite/Flat/Globe/3D + the compass reset-north button) are shown in
           the MAP WINDOW's top-right, exactly like normal mode (in addition to the menu-bar View menu) — per request. */
        +'body.ws-mode .map-controls-top{display:flex !important;position:absolute !important;top:10px !important;right:10px !important;left:auto !important;z-index:950 !important;gap:4px !important;}'
        /* (#R103) tighter view-control bars in ws mode: less vertical padding around the buttons + a smaller gap between the two bars */
        +'body.ws-mode .map-controls-top .map-view-group{padding:2px 4px !important;}'
        /* (#R102) the map window does NOT need the Measure / Radius / Screenshot / Share / Atlas / Layers tool bar —
           every one of those lives in the top menu bar (Tools) or as its own window (Layers). Only the view controls
           (Map/Sat/Flat/Globe/3D + compass) stay in the map window's top-right, per the attached mock. */
        +'body.ws-mode #map-tools-group{display:none !important;}'
        /* (#R78d) the place-search bar has a stack of responsive rules (absolute-centre, ms-narrow fixed-to-viewport,
           ms-hide) that all break inside a window — the "search bar flies away / is crushed" bug. Pin it cleanly
           to the top-left of the MAP window and neutralise every one of them. */
        +'body.ws-mode #map-search{position:absolute !important;left:12px !important;right:auto !important;top:12px !important;bottom:auto !important;transform:none !important;width:min(330px,calc(100% - 24px)) !important;max-width:none !important;min-width:0 !important;opacity:1 !important;pointer-events:auto !important;}'
        +'body.ws-mode #map-search input{width:auto !important;opacity:1 !important;padding:8px 4px !important;}'
        +'body.ws-mode #btn-toggle-sidebar{display:none !important;}'
        +'body.ws-mode #lsr-toggle{display:none !important;}'
        /* (#R78d) keep the layers panel ALWAYS visible inside its window — the classic "map click closes it"
           behaviour (open._mapCloser) pushed it off-screen with transform/visibility, making the window go black */
        +'body.ws-mode #layer-sidebar-r{position:static !important;width:100% !important;min-width:0 !important;height:100% !important;margin:0 !important;border:none !important;transform:none !important;visibility:visible !important;pointer-events:auto !important;opacity:1 !important;display:flex !important;flex-direction:column;}'
        /* (#R78e) each tab is its own window now → force its content div visible & filling, regardless of the
           sidebar tab state that renderUI() would otherwise impose */
        +'body.ws-mode .ws-news #live-news-feed,body.ws-mode .ws-news #sidebar-search-bar,body.ws-mode .ws-countries #countries-feed,body.ws-mode .ws-info #info-dashboard,body.ws-mode .ws-community #community-feed{display:flex !important;}'
        +'body.ws-mode .ws-news #live-news-feed,body.ws-mode .ws-countries #countries-feed,body.ws-mode .ws-info #info-dashboard,body.ws-mode .ws-community #community-feed{flex:1 1 auto !important;width:100% !important;min-height:0 !important;overflow-y:auto;}'
        +'body.ws-mode .ws-news .ws-body,body.ws-mode .ws-countries .ws-body,body.ws-mode .ws-info .ws-body,body.ws-mode .ws-community .ws-body{flex-direction:column;}'
        +'body.ws-mode .ws-news #sidebar-search-bar,body.ws-mode .ws-news #news-filter-toggle,body.ws-mode .ws-news #ai-geocode-row{flex:0 0 auto !important;}'
        /* (#R78f) BALANCED padding — the .content-area scrollbar hack (margin-right:-10px) made content flush-left
           but 10px past the right; neutralise it and give even 10px gutters. Search bar was overflowing right. */
        +'body.ws-mode .ws-news #live-news-feed,body.ws-mode .ws-countries #countries-feed{margin:0 !important;padding:10px 12px !important;box-sizing:border-box;gap:8px;}'
        /* (#R105) Countries cards: a little more gap BETWEEN cards (in-card padding tightened on .stat-row); the sort toolbar hugs the search field above. */
        +'body.ws-mode .ws-countries #countries-feed{gap:7px !important;padding-top:0 !important;}'   /* (#R107) flush the compare header + sort toolbar to the window top (was a 2px see-through gap) */
        /* (#R79) the news READER pane is stacked in the same window — kill its -10px scrollbar-hack margin too
           (otherwise it overflows the window's right edge when a user opens an article to read) */
        +'body.ws-mode .ws-news #news-reader-pane{flex:1 1 auto !important;width:100% !important;min-height:0 !important;margin:0 !important;padding:10px 12px !important;box-sizing:border-box !important;}'
        +'body.ws-mode .ws-news #sidebar-search-bar{box-sizing:border-box !important;width:auto !important;margin:10px 12px 4px !important;}'
        +'body.ws-mode .ws-news #news-filter-toggle,body.ws-mode .ws-news #ai-geocode-row{box-sizing:border-box !important;margin-left:12px !important;margin-right:12px !important;}'
        /* (#R79b) Countries window: its OWN search bar (top) + the compare dock (bottom) stacked in the body */
        +'body.ws-mode .ws-countries .ws-body{flex-direction:column;}'
        +'body.ws-mode .ws-countries #countries-search-bar{display:flex !important;flex:0 0 auto !important;box-sizing:border-box !important;width:auto !important;margin:8px 12px 0 !important;padding:0 !important;}'   /* (#R106) 2→0 bottom margin: hug the sort toolbar below */
        /* (#R106) LIGHT-MODE colored bar: the sticky Countries toolbar + Compare header used the grey --panel-bg,
           which stands out against the ws window's --bg-color background ("上部スティック欄の背景に色がついてる、やめて").
           In a window, paint them with the window's own background so they blend (no distinct bar), light or dark. */
        +'body.ws-mode .ws-countries #countries-feed .stats-toolbar,body.ws-mode #scp-view .scp-stickhead{background:var(--bg-color) !important;}'
        +'body.ws-mode .ws-countries #countries-search-bar input{width:100% !important;box-sizing:border-box !important;}'
        /* (#R153) Companies window mirrors Countries — its own filter box (top) stacked in the body, toolbar blended into the window bg */
        +'body.ws-mode .ws-info .ws-body{flex-direction:column;}'
        +'body.ws-mode .ws-info #info-search-bar{display:flex !important;flex:0 0 auto !important;box-sizing:border-box !important;width:auto !important;margin:8px 12px 0 !important;padding:0 !important;}'
        +'body.ws-mode .ws-info #info-search-bar input{width:100% !important;box-sizing:border-box !important;}'
        +'body.ws-mode .ws-info #info-dashboard .stats-toolbar{background:var(--bg-color) !important;}'
        /* (#R102) hide the "Filter countries…" box while the compare view owns the feed — a higher-specificity override
           of the show-rule above (which, with its !important, previously beat the inline display:none → "変化なし"). */
        +'body.ws-mode.scp-open .ws-countries #countries-search-bar{display:none !important;}'
        +'body.scp-open #sidebar-search-bar{display:none !important;}'
        +'body.ws-mode .ws-countries #stats-compare-fixed{position:static !important;left:auto !important;right:auto !important;bottom:auto !important;top:auto !important;transform:none !important;width:100% !important;flex:0 0 auto !important;box-sizing:border-box !important;margin:0 !important;}'
        /* (#R84) narrow Countries window: shrink the compare bar name/value columns so the tracks stay big and
           UNIFORM ("compareのbar-chartの長さが統一されていない") instead of being squeezed to nothing. */
        +'body.ws-mode #scp-view .scp-bnm{flex:0 0 84px !important;} body.ws-mode #scp-view .scp-bval{flex:0 0 78px !important;font-size:10.5px !important;}'
        /* (#R79b) Layers search box balance ("上に余白なし・下が空きすぎ"): the .lsr-head above it is hidden in
           ws-mode, so give the search breathing room on top and tighten the gap to the list below. */
        +'body.ws-mode #layer-sidebar-r .lsr-search{padding:6px 14px 3px !important;}'   /* (#R106) tighter cluster: less top slack, a small flush gap to the Active-layers bar */
        /* (#R104) "Active layers" must NOT be ALL-CAPS in the layers window, and the gap up to the Search box is tightened. */
        +'body.ws-mode #layer-sidebar-r #layer-active-section .lyr-head{text-transform:none !important;letter-spacing:0.01em !important;}'
        +'body.ws-mode #layer-sidebar-r #layer-active-section{padding-top:0 !important;}'
        +'body.ws-mode #layer-sidebar-r #layer-active-section .lyr-head{margin-top:0 !important;}'
        /* (#R115) ws Layers window: an ON layer must be clearly visible ("Make on-layer more visible") —
           thicker accent ring, an accent-tinted tile fill (color-mix; older engines just skip it and keep
           the ring), and the layer NAME itself in the accent colour + bold. */
        +'body.ws-mode #layer-sidebar-r .lst-tile.on{border-color:var(--primary-color);box-shadow:0 0 0 2px var(--primary-color);background:color-mix(in srgb, var(--primary-color) 14%, var(--card-bg));}'
        +'body.ws-mode #layer-sidebar-r .lst-tile.on .lst-nm{color:var(--primary-color);}'   /* (#R116) accent colour only — NO bold (requested) */
        /* (#R79b) Atlas window: keep the INPUT BAR always visible when the window is short — the suggested-
           question chips (.atl-ex) were tall + non-shrinking and pushed the input below the window on resize.
           Cap + scroll them so the chat area and input never get clipped. */
        +'body.ws-mode .ws-atlas .atl-ex{flex:0 1 auto !important;min-height:0 !important;max-height:38% !important;overflow-y:auto !important;}'
        +'body.ws-mode .ws-atlas .atl-chat{min-height:0 !important;}'
        +'body.ws-mode .ws-atlas .atl-inbar{flex:0 0 auto !important;}'
        /* (#R103) the window already has its own title bar + close, so the in-panel "Atlas beta / – ×" header is redundant in ws mode. */
        +'body.ws-mode .ws-atlas .atl-head{display:none !important;}'
        /* (#R104) tighten the empty space above & below the "Atlas can be inaccurate…" disclaimer in the Atlas window. */
        +'body.ws-mode .ws-atlas .atl-inbar{padding-bottom:2px !important;}'
        +'body.ws-mode .ws-atlas .atl-ainote{padding:0 12px 3px !important;line-height:1.25 !important;}'
        /* (#R105) the Atlas window now uses the SAME uniform grey title bar as every other window (task 19), which is
           itself the "painted background like normal mode" for its "Atlas" title — no bespoke transparent bar / chip. */
        /* (#R78g) CONTENT WAS INVISIBLE: the window background == --card-bg == the cards' own background, and the
           card border is only 8% opacity → in dark theme the cards vanished into the window. Give the content
           windows the app's BASE background so the --card-bg cards/rows stand out, and strengthen their border. */
        +'body.ws-mode .ws-news,body.ws-mode .ws-countries,body.ws-mode .ws-info,body.ws-mode .ws-community{background:var(--bg-color,#0b0b0d) !important;}'
        +'body.ws-mode .ws-news .news-item{border:1px solid rgba(128,128,128,0.26) !important;box-shadow:0 1px 4px rgba(0,0,0,0.22) !important;}'
        +'body.ws-mode .ws-countries .stat-row{border-bottom:1px solid rgba(128,128,128,0.14) !important;}'
        /* (#R104) the !important border-bottom above overrode the hover ring on the BOTTOM edge only, so the blue
           hover outline looked "cut off at the bottom" ("下は途切れている"). Re-assert all four edges on hover. */
        +'body.ws-mode .ws-countries .stat-row:hover{border-color:var(--primary-color) !important;}'
        /* (#R78g) pin the elevation/coordinate readout to the MAP window's bottom-left, above the canvas */
        +'body.ws-mode #coord-readout{position:absolute !important;left:7px !important;bottom:7px !important;right:auto !important;top:auto !important;z-index:950 !important;}'
        /* (#R78f) COMPACT news cards so more fit per screen ("上下方向に冗長") */
        +'body.ws-mode .ws-news .news-item{padding:9px 11px !important;border-radius:11px !important;}'
        +'body.ws-mode .ws-news .news-item .news-title{margin-top:4px !important;line-height:1.32 !important;}'
        +'body.ws-mode .ws-news #live-news-feed{gap:7px !important;}'
        /* (#R78f) Atlas as a window: fill it, drop its floating chrome */
        +'body.ws-mode .ws-atlas #atlas-panel{position:static !important;left:auto !important;top:auto !important;width:100% !important;height:100% !important;max-width:none !important;max-height:none !important;min-width:0 !important;min-height:0 !important;transform:none !important;display:flex !important;border:none !important;border-radius:0 !important;box-shadow:none !important;background:transparent !important;}'
        /* (#R78b) de-chrome the transplanted content — the window IS the chrome now */
        +'body.ws-mode #layer-sidebar-r .lsr-head{display:none !important;}'
        /* (#R78c) the ticker is NOT a window — it is pinned to the very bottom of the screen, full width,
           above the workspace ("画面外の最下部に固定と何度も言っている") */
        +'body.ws-mode #ticker-bar{position:fixed !important;left:0 !important;right:0 !important;bottom:0 !important;width:100% !important;z-index:5985 !important;}'
        /* (#R78c) TOP MENU BAR ("上部から、ソフトのように選択できるようにしろ") — a real application menu strip */
        +'#ws-menu{position:fixed;left:0;top:0;right:0;height:34px;z-index:5990;display:flex;align-items:center;gap:2px;padding:0 12px;background:var(--card-bg);border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.26));-webkit-backdrop-filter:saturate(160%) blur(14px);backdrop-filter:saturate(160%) blur(14px);}'
        /* (#R102) "IntMap" NOT bold per request ("ワークスペースモードでのIntMapの文字は太字ではなくして") — medium weight,
           same UI font as normal mode (inherited, no font-family override) */
        +'#ws-menu .ws-brand{font-size:20px;font-weight:500;color:var(--text-main);margin-right:16px;letter-spacing:0.01em;}'
        +'#ws-menu .ws-brand span{display:none;}'
        +'#ws-menu .ws-m{position:relative;}'
        +'#ws-menu .ws-m>button{border:none;background:transparent;color:var(--text-main);font-size:12px;padding:5px 11px;border-radius:7px;cursor:pointer;}'
        +'#ws-menu .ws-m>button:hover,#ws-menu .ws-m.open>button{background:var(--input-bg);}'
        +'#ws-menu .ws-dd{display:none;position:absolute;left:0;top:32px;min-width:210px;background:var(--card-bg);border:1px solid var(--glass-border,rgba(128,128,128,0.26));border-radius:10px;box-shadow:0 14px 40px rgba(0,0,0,0.35);padding:5px;z-index:5991;}'
        +'#ws-menu .ws-m.open .ws-dd{display:block;}'
        +'#ws-menu .ws-dd button{display:flex;width:100%;align-items:center;gap:8px;border:none;background:transparent;color:var(--text-main);font-size:12px;padding:7px 10px;border-radius:7px;cursor:pointer;text-align:left;white-space:nowrap;}'
        +'#ws-menu .ws-dd button:hover{background:var(--input-bg);}'
        +'#ws-menu .ws-dd .ws-ck{width:14px;flex:0 0 14px;font-weight:700;color:var(--primary-color,#0a84ff);}'
        +'#ws-menu .ws-dd .ws-dd-sep{height:1px;background:var(--glass-border,rgba(128,128,128,0.22));margin:5px 6px;}'
        +'#ws-menu .ws-spacer{flex:1;}'
        +'body.capture-mode #ws-menu{display:none !important;}'
        +'@media(max-width:768px){ #ws-menu{display:none !important;} }';
      document.head.appendChild(st); }
    const state=()=>{ try{ return JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(_){ return {}; } };
    const save=p=>{ try{ localStorage.setItem(KEY,JSON.stringify(Object.assign(state(),p))); }catch(_){} };
    function defRects(){ const W=innerWidth,H=innerHeight;
      /* (#R78e) EDGE-TO-EDGE tiled default with NO gaps ("上部と各ウィンドウ間に隙間があるのが気になる" /
         "ティッカーの上端までウィンドウを伸ばしておけ"): windows abut the menu bar (top), each other, the screen
         sides, and the ticker's top edge. Shared-border splitters then work from the start. */
      const _b=wsBounds(); const top=_b.top, bottom=_b.bottom, B=bottom-top;
      /* (#R79b) default layout: Countries (left) · Map (center) · Layers (top-right) · Atlas (bottom-right).
         The right column is split into Layers on top and Atlas below (they share a horizontal splitter). */
      /* (#R102) the side columns (Countries · Layers/Atlas) open at their MINIMUM width so the map gets the most room
         ("Countries, Layers, Atlasの左右幅を、最小幅に") — NOT minimized, just as narrow as each window's min allows. */
      const _dmin=id=>{ const d=DEFS.find(x=>x.id===id); return (d&&d.min)||[300,280]; };
      const sideW=_dmin('countries')[0], rightW=Math.max(_dmin('layers')[0],_dmin('atlas')[0]); const rightX=W-rightW;
      const layersH=Math.round(B*0.50);
      const flo=(i)=>[Math.round(W*0.30)+i*28,top+40+i*32,Math.round(W*0.32),Math.round(B*0.62)];   /* hidden windows' fallback when opened from the menu */
      return { countries:[0,top,sideW,B], map:[sideW,top,rightX-sideW,B],
        layers:[rightX,top,rightW,layersH], atlas:[rightX,top+layersH,rightW,B-layersH],
        news:flo(0), info:flo(1), community:flo(2) }; }   /* (#R142) a window with NO default rect gave mkWin undefined → clampRect threw at every desktop ws-mode boot (silently swallowed); (#R231) `monitors:flo(3)` left with its window above */
    function clampRect(r,min){ const b=wsBounds(); r=r||[];   /* (#R142) never throw on a missing default rect — fall back to a sensible box instead */
      /* (#R79d) clamp to the usable rect — full width, from the menu bottom down to the TICKER TOP (so a window
         can fill the real area edge-to-edge but never overlaps the menu bar or hides behind the ticker). */
      const maxW=b.right-b.left, maxH=b.bottom-b.top;
      let w=Math.max((min&&min[0])||220,Math.min(maxW,r[2]||300)), h=Math.max((min&&min[1])||140,Math.min(maxH,r[3]||300));
      let x=Math.max(b.left,Math.min(b.right-w,r[0]!=null?r[0]:b.left)), y=Math.max(b.top,Math.min(b.bottom-h,r[1]!=null?r[1]:b.top));
      return [x,y,w,h]; }
    /* (#R78e) the map's geographic centre was landing off-window because frosted-sidebar mode sets
       map.setPadding({left: sidebarWidth}) so the optical centre sits right of the overlay — stale in a
       window. Zero the padding here so the map truly centres in its window, then resize. */
    function fitMap(){ try{ const E=window.IntMapGeoEngine; if(!(E&&E.hasRenderer())) return; try{ E.camera.setPadding({top:0,right:0,bottom:0,left:0},{duration:0}); }catch(_){} E.render.resize(); }catch(_){} }
    function schedSave(){ if(!on) return; clearTimeout(saveT); saveT=setTimeout(saveRects,400); }
    function saveRects(){ if(!on) return; const rects={},vis={},minz={};
      for(const id in wraps){ const w=wraps[id]; if(!w||!w.isConnected) continue;
        rects[id]=[w.offsetLeft,w.offsetTop,w.offsetWidth,(w.dataset.min?(+w.dataset.h0||300):w.offsetHeight)];
        vis[id]=(w.style.display!=='none'); if(w.dataset.min) minz[id]=1; }
      save({rects,vis,minz}); }
    /* ==== (#R83) AUTO-TILING + JUNCTION DRAG ("手動でドラッグアンドドロップするのではなく、自動で隙間に配置…
       二つと一つの間の境界なども、三つ同時に境界を動かせるように"). Opening/closing a window auto-arranges the
       VISIBLE ones into a gapless partition (Map = main pane, the rest stack in a side column). Where three
       panes meet, a junction handle lets you drag BOTH the vertical and the horizontal divider at once — moving
       all the borders that meet there simultaneously. ==== */
    /* (#R101) minimized windows are KEPT in the tiling order so their cell/area stays RESERVED — a minimize no longer
       lets the neighbours swallow the space ("最小化後も有効な領域として扱って"). Only hidden windows are excluded. */
    function tileOrder(){ const order=DEFS.map(d=>d.id);
      return order.filter(id=>wraps[id]&&wraps[id].style.display!=='none'); }
    /* (#R84) ROLE-BASED tiling to match the requested default (Countries | Map | [Layers/Atlas stacked]):
       'countries' → the LEFT column, 'map' → the CENTER (widest), every other pane stacks in a RIGHT column.
       Generalises when panes are opened/closed (a new window joins the right stack; hiding countries lets the
       map take the left; hiding the map leaves left + right columns). Always a gapless partition. */
    function computeTiles(ids,rect){ const x=rect[0],y=rect[1],w=rect[2],h=rect[3],out={},n=ids.length;
      if(!n) return out;
      if(n===1){ out[ids[0]]=[x,y,w,h]; return out; }
      const hasC=ids.indexOf('countries')>=0, hasM=ids.indexOf('map')>=0;
      const left=hasC?'countries':null;
      const center=hasM?'map':ids.find(id=>id!==left);
      const right=ids.filter(id=>id!==left&&id!==center);
      /* column widths */
      const nCols=(left?1:0)+(center?1:0)+(right.length?1:0);
      if(nCols<=1){ /* everything stacks in one column */ let cy=y; const all=ids; all.forEach((id,i)=>{ const hh=(i===all.length-1)?(y+h-cy):Math.round(h/all.length); out[id]=[x,cy,w,hh]; cy+=hh; }); return out; }
      /* (#R102) side columns at MINIMUM width (map keeps the rest) — matches the requested default. Falls back to a
         fraction only if a window has no registered min. rw = the widest min among the stacked right-column windows. */
      const lw=left?Math.min(Math.round(w*0.42),(minOf(wraps[left])[0]||Math.round(w*0.24))):0;
      const rw=right.length?Math.min(Math.round(w*0.42),Math.max.apply(null,right.map(id=>minOf(wraps[id])[0]||Math.round(w*0.26)))):0;
      const cw=w-lw-rw; let cx=x;
      if(left){ out[left]=[cx,y,lw,h]; cx+=lw; }
      if(center){ out[center]=[cx,y,cw,h]; cx+=cw; }
      if(right.length){ let cy=y; right.forEach((id,i)=>{ const hh=(i===right.length-1)?(y+h-cy):Math.round(h/right.length); out[id]=[cx,cy,rw,hh]; cy+=hh; }); }
      return out; }
    function retile(){ if(!on) return; const ids=tileOrder();
      if(ids.length){ const b=wsBounds(); const r=computeTiles(ids,[b.left,b.top,b.right-b.left,b.bottom-b.top]);
        ids.forEach(id=>{ const rr=r[id],w=wraps[id]; if(!rr||!w) return; delete w.dataset.maxed;
          w.style.left=rr[0]+'px'; w.style.top=rr[1]+'px'; w.style.width=rr[2]+'px';
          /* (#R101) a minimized window keeps its collapsed (title-bar) height; its cell area below stays reserved */
          if(!w.dataset.min) w.style.height=rr[3]+'px'; }); }
      _lastBottom=wsBounds().bottom; fitMap(); buildJunctions(); schedSave(); }
    /* (#R102) when the ticker is toggled the usable bottom edge moves by the ticker's height. Grow/shrink the windows
       whose bottom sits on the old edge so they fill (or vacate) that strip automatically ("ティッカーをオンオフしたら、
       自動的にウィンドウがその隙間を埋めるように") — WITHOUT re-tiling everything, so a custom layout is preserved. */
    function tickerReflow(){ if(!on) return; const nb=wsBounds().bottom; const ob=(_lastBottom==null)?nb:_lastBottom; const d=Math.round(nb-ob);
      if(d){ for(const id in wraps){ const w=wraps[id]; if(!w||w.style.display==='none'||w.dataset.min) continue;
        if(w.dataset.maxed){ w.style.height=Math.max(120,(nb-w.offsetTop))+'px'; continue; }
        const bot=w.offsetTop+w.offsetHeight;
        if(Math.abs(bot-ob)<=8) w.style.height=Math.max((minOf(w)[1]||120), w.offsetHeight+d)+'px'; } }
      _lastBottom=nb; fitMap(); schedSave(); }
    let _junc=[];
    function clearJunctions(){ _junc.forEach(j=>{ try{ j.remove(); }catch(_){} }); _junc=[]; }
    /* (#R101) junction CIRCLES removed per request ("結合点にある青い丸は不要"). Adjacency is now shown by the clearer
       snap GUIDE line while dragging/resizing a window (see .ws-guide + showG), which is exactly the moment two
       windows join. The shared-border resize (drag an abutting edge → both windows move) still works via wsResize. */
    function buildJunctions(){ clearJunctions(); }
    function addJunction(jx,jy){ const h=document.createElement('div'); h.className='ws-junction';
      h.title=T('Drag to move all the borders that meet here','ドラッグでここに集まる境界をまとめて動かす','Ziehen, um alle hier zusammenlaufenden Ränder zu bewegen','Тяните, чтобы двигать все сходящиеся здесь границы','Arrastra para mover todos los bordes que se juntan aquí');
      h.style.left=jx+'px'; h.style.top=jy+'px'; document.body.appendChild(h); _junc.push(h);
      h.addEventListener('pointerdown',e=>{ e.preventDefault(); e.stopPropagation();
        const B=wsBounds(), EPS=6, L=[],R=[],TT=[],D=[];
        for(const id in wraps){ const w=wraps[id]; if(!w||w.style.display==='none'||w.dataset.min) continue;
          const l=w.offsetLeft,r=l+w.offsetWidth,t=w.offsetTop,bt=t+w.offsetHeight;
          if(Math.abs(r-jx)<EPS) L.push({w,l,r,t,bt});
          if(Math.abs(l-jx)<EPS) R.push({w,l,r,t,bt});
          if(Math.abs(bt-jy)<EPS&&l>=jx-EPS) TT.push({w,l,r,t,bt});
          if(Math.abs(t-jy)<EPS&&l>=jx-EPS) D.push({w,l,r,t,bt}); }
        let minVx=B.left+90, maxVx=B.right-90, minHy=B.top+70, maxHy=B.bottom-70;
        L.forEach(o=>{ minVx=Math.max(minVx,o.l+(minOf(o.w)[0]||160)); });
        R.forEach(o=>{ maxVx=Math.min(maxVx,o.r-(minOf(o.w)[0]||160)); });
        TT.forEach(o=>{ minHy=Math.max(minHy,o.t+(minOf(o.w)[1]||120)); });
        D.forEach(o=>{ maxHy=Math.min(maxHy,o.bt-(minOf(o.w)[1]||120)); });
        const sx=e.clientX, sy=e.clientY; try{ h.setPointerCapture&&h.setPointerCapture(e.pointerId); }catch(_){}
        const mv=ev=>{ const vx=Math.max(minVx,Math.min(maxVx, jx+ev.clientX-sx)), hy=Math.max(minHy,Math.min(maxHy, jy+ev.clientY-sy));
          L.forEach(o=>{ o.w.style.width=(vx-o.l)+'px'; });
          R.forEach(o=>{ o.w.style.left=vx+'px'; o.w.style.width=(o.r-vx)+'px'; });
          TT.forEach(o=>{ o.w.style.height=(hy-o.t)+'px'; });
          D.forEach(o=>{ o.w.style.top=hy+'px'; o.w.style.height=(o.bt-hy)+'px'; });
          h.style.left=vx+'px'; h.style.top=hy+'px'; _wsBump(); fitMap(); };   /* (#R311) the junction just moved every window that meets here */
        const up=ev=>{ try{ h.releasePointerCapture&&h.releasePointerCapture(ev.pointerId); }catch(_){} document.removeEventListener('pointermove',mv); document.removeEventListener('pointerup',up); buildJunctions(); schedSave(); };
        document.addEventListener('pointermove',mv); document.addEventListener('pointerup',up); }); }
    function mkWin(def,rect,skipWrap){
      /* (#R78e) a window can host MULTIPLE source elements stacked in its body (the News window = search bar +
         filter + geocode row + feed + reader), each restored to its exact original slot on exit */
      if(def.ensure){ try{ def.ensure(); }catch(_){} }   /* (#R78f) create the element first (Atlas panel) */
      const sels=def.sels||[def.sel];
      const els=sels.map(s=>document.querySelector(s)).filter(Boolean);
      if(!els.length) return null;
      const w=document.createElement('div'); w.className='ws-win ws-'+def.id; if(def.ovis) w.classList.add('ws-ovis');
      const tb=document.createElement('div'); tb.className='ws-tb';
      tb.innerHTML='<span class="ws-dots">'
        +'<button class="ws-dot ws-d-close" title="'+T('Hide (reopen from the dock)','隠す（下のドックから再表示）','Ausblenden (Dock unten)','Скрыть (док внизу)','Ocultar (dock abajo)')+'"></button>'
        +'<button class="ws-dot ws-d-min" title="'+T('Collapse to title bar','タイトルバーに折りたたむ','Auf Titelleiste einklappen','Свернуть в заголовок','Plegar a la barra')+'"></button>'
        +'<button class="ws-dot ws-d-max" title="'+T('Maximize / restore','最大化 / 元に戻す','Maximieren / wiederherstellen','Развернуть / восстановить','Maximizar / restaurar')+'"></button></span>'
        +'<span class="ws-title">'+def.t()+'</span>';
      const body=document.createElement('div'); body.className='ws-body';
      const phs=[]; els.forEach(el=>{ const ph=document.createComment('ws-ph-'+def.id); el.parentNode.insertBefore(ph,el); phs.push([el,ph]); body.appendChild(el); });
      holders[def.id]=phs;
      w.appendChild(tb); w.appendChild(body); document.body.appendChild(w);
      const r=clampRect(rect,def.min);
      w.style.left=r[0]+'px'; w.style.top=r[1]+'px'; w.style.width=r[2]+'px'; w.style.height=r[3]+'px';
      w.__wsMin=def.min;
      wsDrag(w,tb); wsResize(w); wsGrip(w);
      try{ registerWindow(w); }catch(_){}
      tb.querySelector('.ws-d-close').onclick=()=>{ w.style.display='none'; w.dataset.userHid='1'; try{ if(def.onHide) def.onHide(); }catch(_){} syncDock(); retile(); };   /* (#R83) fill the gap */
      tb.querySelector('.ws-d-min').onclick=()=>{ if(w.dataset.min){ delete w.dataset.min; body.style.display=''; w.style.height=(+w.dataset.h0||300)+'px'; } else { w.dataset.h0=String(w.offsetHeight); w.dataset.min='1'; body.style.display='none'; w.style.height='auto'; } retile(); };
      tb.querySelector('.ws-d-max').onclick=()=>{ if(w.dataset.maxed){ try{ const r2=JSON.parse(w.dataset.maxed); w.style.left=r2[0]+'px'; w.style.top=r2[1]+'px'; w.style.width=r2[2]+'px'; w.style.height=r2[3]+'px'; }catch(_){} delete w.dataset.maxed; }
        /* (#R79d) maximize FITS the usable area (below the menu, down to the ticker top) — it no longer spills
           off-screen ("画面に収まりきらないとこまで拡大されてしまう"). */
        else { w.dataset.maxed=JSON.stringify([w.offsetLeft,w.offsetTop,w.offsetWidth,w.offsetHeight]); const b=wsBounds(); w.style.left=b.left+'px'; w.style.top=b.top+'px'; w.style.width=(b.right-b.left)+'px'; w.style.height=(b.bottom-b.top)+'px'; }
        try{ bringToFront(w); }catch(_){} fitMap(); schedSave(); };
      tb.addEventListener('dblclick',e=>{ if(e.target.closest('.ws-dot')) return; tb.querySelector('.ws-d-max').click(); });
      /* (#R122) skip onWrap for a window that starts HIDDEN — running it (e.g. News → setMode('news') → pins) only
         to hide it again a beat later caused the "起動時にニュースが一瞬オンになってからオフ" flicker. */
      try{ if(def.onWrap && !skipWrap) def.onWrap(); }catch(_){}
      return w; }
    /* (#R78c) TOP MENU BAR replaces the toy dock ("上部から、ソフトのように選択できるようにしろ"):
       IntMap — Workspace | ウィンドウ▾ (checkmarked show/hide list + reset) | … | 終了 */
    /* (#R83) reset to the DEFAULT visible set (Map + Layers — respecting defHidden, no longer "all windows on")
       then auto-tile. */
    function resetLayout(){ DEFS.forEach(def=>{ const w=wraps[def.id]; if(!w) return;
        delete w.dataset.min; delete w.dataset.maxed; const bd=w.querySelector('.ws-body'); if(bd) bd.style.display='';
        if(def.defHidden){ if(w.style.display!=='none'){ w.style.display='none'; try{ if(def.onHide) def.onHide(); }catch(_){} } w.dataset.userHid='1'; }
        else { if(w.style.display==='none'){ w.style.display='flex'; try{ if(def.onShow) def.onShow(); }catch(_){} } delete w.dataset.userHid; } });
      retile(); syncDock(); }
    function mkDock(){ if(dock) return; dock=document.createElement('div'); dock.id='ws-menu';
      const brand=document.createElement('div'); brand.className='ws-brand'; brand.innerHTML='IntMap <span>— '+T('Workspace','ワークスペース','Arbeitsbereich','Рабочая область','Espacio de trabajo')+'</span>'; dock.appendChild(brand);
      const clk=id=>{ const b=document.getElementById(id); if(b) b.click(); };
      const opens=[];   /* remember every menu so opening one closes the rest + outside-click closes all */
      /* generic dropdown builder: items = {label, run, check?} | 'sep' */
      function menu(label,items){ const mm=document.createElement('div'); mm.className='ws-m';
        const mb=document.createElement('button'); mb.textContent=label+' ▾'; mm.appendChild(mb);
        const dd=document.createElement('div'); dd.className='ws-dd'; mm.appendChild(dd);
        const rows=[];
        items.forEach(it=>{ if(it==='sep'){ const s=document.createElement('div'); s.className='ws-dd-sep'; dd.appendChild(s); return; }
          const b=document.createElement('button'); b.innerHTML='<span class="ws-ck"></span><span>'+it.label+'</span>';
          b.onclick=()=>{ try{ it.run(); }catch(_){} if(it.stay){ refresh(); } else { mm.classList.remove('open'); } };
          if(it.win) b.dataset.win=it.win; dd.appendChild(b); rows.push({it,ck:b.querySelector('.ws-ck')}); });
        function refresh(){ rows.forEach(r=>{ if(r.it.check) r.ck.textContent=r.it.check()?'✓':''; }); }
        mb.onclick=e=>{ e.stopPropagation(); const wasOpen=mm.classList.contains('open'); opens.forEach(o=>o.classList.remove('open')); if(!wasOpen){ refresh(); mm.classList.add('open'); } };
        opens.push(mm); mm._refresh=refresh; dock.appendChild(mm); return mm; }
      /* View — base map + projection (checkmarks reflect the real active button) */
      const act=id=>{ const b=document.getElementById(id); return !!(b&&b.classList.contains('active')); };
      menu(T('View','表示','Ansicht','Вид','Vista'),[
        {label:T('Map','地図','Karte','Карта','Mapa'),run:()=>clk('btn-view-map'),check:()=>act('btn-view-map'),stay:1},
        {label:T('Satellite','衛星','Satellit','Спутник','Satélite'),run:()=>clk('btn-view-sat'),check:()=>act('btn-view-sat'),stay:1},'sep',
        {label:T('Globe','地球儀','Globus','Глобус','Globo'),run:()=>clk('btn-view-globe'),check:()=>act('btn-view-globe'),stay:1},
        {label:T('Flat','平面','Flach','Плоская','Plano'),run:()=>clk('btn-view-flat'),check:()=>act('btn-view-flat'),stay:1},
        {label:T('3D terrain','3D地形','3D-Gelände','3D-рельеф','Terreno 3D'),run:()=>clk('btn-view-3d'),check:()=>act('btn-view-3d'),stay:1},'sep',
        {label:T('Reset north','北を上に','Norden zurück','Сброс севера','Restablecer norte'),run:()=>clk('btn-compass')} ]);
      /* Tools */
      menu(T('Tools','ツール','Werkzeuge','Инструменты','Herramientas'),[
        {label:T('Measure distance / area','距離・面積を計測','Entfernung / Fläche','Расстояние / площадь','Distancia / área'),run:()=>clk('btn-tool-measure')},
        {label:T('Draw / trace','描画・トレース','Zeichnen','Рисование','Dibujar'),run:()=>clk('btn-tool-draw')},
        {label:T('Radius','半径','Radius','Радиус','Radio'),run:()=>clk('btn-tool-radius')},'sep',
        {label:T('Screenshot','スクリーンショット','Screenshot','Скриншот','Captura'),run:()=>clk('btn-screenshot')},
        {label:T('Share this view','この表示を共有','Ansicht teilen','Поделиться','Compartir'),run:()=>clk('btn-share')},'sep',
        {label:T('Atlas (assistant)','Atlas（アシスタント）','Atlas','Atlas','Atlas'),run:()=>{ try{ if(window.IntMapAtlas){ window.IntMapAtlas.call('toggle'); return; } if(window.IntMapConsole&&window.IntMapConsole.toggle){ window.IntMapConsole.toggle(); return; } }catch(_){} clk('btn-community'); }},   /* (#R114) top-bar #btn-atlas removed → open the console directly (fallback: sidebar Atlas tab) */
        {label:T('Grid + labels','グリッド＋ラベル','Gitter','Сетка','Cuadrícula'),run:()=>clk('btn-tool-grid')} ]);
      /* Window — show/hide each window + reset */
      const winItems=DEFS.filter(d=>wraps[d.id]).map(def=>({label:def.t(),win:def.id,stay:1,
        check:()=>{ const w=wraps[def.id]; return !!(w&&w.style.display!=='none'); },
        run:()=>{ const w=wraps[def.id]; if(!w) return;
          if(w.style.display==='none'){ w.style.display='flex'; delete w.dataset.userHid; try{ if(def.onShow) def.onShow(); }catch(_){} }
          else { w.style.display='none'; w.dataset.userHid='1'; try{ if(def.onHide) def.onHide(); }catch(_){} }
          /* (#R83) opening/closing a window auto-arranges the rest into the gap ("自動で隙間に配置") */
          retile(); } }));
      /* (#R101) "Auto-arrange" button removed per request (自動整列ボタンはいらない). Reset layout still re-tiles. */
      winItems.push('sep',
        {label:T('Reset layout','配置をリセット','Layout zurücksetzen','Сбросить раскладку','Restablecer diseño'),run:resetLayout});
      menu(T('Window','ウィンドウ','Fenster','Окно','Ventana'),winItems);
      /* (#R101) Ticker on/off toggle in the menu bar (per request — not just in Settings). The check mark tracks state. */
      { const tm=document.createElement('div'); tm.className='ws-m';
        const tb2=document.createElement('button'); tb2.className='ws-ticker-btn'; tb2.style.display='inline-flex'; tb2.style.alignItems='center'; tb2.style.gap='5px';
        tb2.onclick=e=>{ e.stopPropagation(); opens.forEach(o=>o.classList.remove('open')); try{ window.IntMapTicker&&window.IntMapTicker.toggle(); }catch(_){} try{ syncDock(); }catch(_){} };
        tm.appendChild(tb2); dock.appendChild(tm); _tickerBtn=tb2; _syncTicker(); }
      /* (#R78e) direct action buttons (NOT dropdowns) — "「設定」を押すと設定を開くとボタンが出るというクソUI" */
      const directBtn=(label,id)=>{ const dm=document.createElement('div'); dm.className='ws-m';
        const b=document.createElement('button'); b.textContent=label; b.onclick=e=>{ e.stopPropagation(); opens.forEach(o=>o.classList.remove('open')); clk(id); }; dm.appendChild(b); dock.appendChild(dm); };
      directBtn(T('Settings','設定','Einstellungen','Настройки','Ajustes'),'btn-open-settings');
      directBtn(T('Feedback','フィードバック','Feedback','Обратная связь','Comentarios'),'btn-feedback-hdr');
      directBtn(T('Support','支援','Unterstützen','Поддержать','Apoyar'),'btn-blueberry');   /* (#R103) Support button to the right of Feedback */
      { const acEl=document.getElementById('btn-account'); directBtn((acEl&&acEl.textContent.trim())||T('Account','アカウント','Konto','Аккаунт','Cuenta'),'btn-account'); }
      document.addEventListener('click',()=>{ opens.forEach(o=>{ try{ o.classList.remove('open'); }catch(_){} }); });
      const sp=document.createElement('div'); sp.className='ws-spacer'; dock.appendChild(sp);
      const exm=document.createElement('div'); exm.className='ws-m';
      const ex=document.createElement('button'); ex.textContent=T('Exit workspace','ワークスペースを終了','Workspace beenden','Выйти из режима','Salir del espacio');
      ex.onclick=()=>{ disable(); };   /* (#R79g) disable() now syncs the settings mode button itself */
      exm.appendChild(ex); dock.appendChild(exm);
      document.body.appendChild(dock); }
    /* (#R101) reflect the ticker on/off state in the menu-bar toggle */
    function _syncTicker(){ if(!_tickerBtn) return; const onT=document.body.classList.contains('ticker-on');
      _tickerBtn.innerHTML='<span class="ws-ck"'+(onT?'':' style="color:transparent;"')+'>✓</span>'+T('Ticker','ティッカー','Ticker','Тикер','Cinta'); }
    function syncDock(){ if(!dock) return; dock.querySelectorAll('button[data-win]').forEach(b=>{ const w=wraps[b.dataset.win]; const onW=w&&w.style.display!=='none'; const ck=b.querySelector('.ws-ck'); if(ck) ck.textContent=onW?'✓':''; }); try{ _syncTicker(); }catch(_){} }
    function rebuildDock(){ if(dock){ dock.remove(); dock=null; } mkDock(); syncDock(); }
    /* (#R78b) elements that appear AFTER enable (the ticker when turned on in Settings) become windows the
       moment they exist; windows whose element was removed from the DOM are retired. "全機能使えないと意味ない". */
    function scan(){ if(!on) return; let changed=false;
      DEFS.forEach(def=>{ const w=wraps[def.id];
        if(!w){ const st=state(); const rect=(st.rects&&st.rects[def.id])||defRects()[def.id]||[80,80,420,320];
            const nw=mkWin(def,rect); if(nw){ if(def.defHidden){ nw.style.display='none'; nw.dataset.userHid='1'; } wraps[def.id]=nw; changed=true; } }
        else { const el=w.querySelector('.ws-body')&&w.querySelector('.ws-body').firstElementChild;
          if(!el||!el.isConnected){ try{ w.remove(); }catch(_){} delete wraps[def.id]; delete holders[def.id]; changed=true; } } });
      if(changed){ rebuildDock(); retile(); } }
    /* (#R142) full-viewport loading overlay for the manual ws-mode toggle. The pre-boot #ws-boot-style only covers
       AUTO-enter on page load; a mid-session toggle froze on a blank frame while enable() reparented ~130 layer rows and
       re-rendered every window ("ワークスペースモードを起動時にラグがあるため、読み込み画面を用意するように"). */
    function _wsLoadingOn(){ try{ if(!document.getElementById('ws-load-style')){ const s=document.createElement('style'); s.id='ws-load-style'; s.textContent='@keyframes wsSpin{to{transform:rotate(360deg)}}'; (document.head||document.documentElement).appendChild(s); }
      let o=document.getElementById('ws-loading'); if(!o){ o=document.createElement('div'); o.id='ws-loading';
        o.style.cssText='position:fixed;inset:0;z-index:99998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:15px;background:var(--bg-color,#0d1117);color:var(--text-main,#e6edf3);font-size:14px;font-weight:500;';
        o.innerHTML='<div style="width:34px;height:34px;border-radius:50%;border:3px solid rgba(128,128,128,0.3);border-top-color:var(--primary-color,#0a84ff);animation:wsSpin .8s linear infinite;"></div><div>'+T('Entering workspace…','ワークスペースを準備中…','Arbeitsbereich wird geöffnet…','Открываю рабочую область…','Abriendo el espacio de trabajo…')+'</div>';
        document.body.appendChild(o); }
      o.style.display='flex'; o.style.opacity='1'; }catch(_){} }
    function _wsLoadingOff(){ try{ const o=document.getElementById('ws-loading'); if(o){ o.style.transition='opacity .25s ease'; o.style.opacity='0'; setTimeout(()=>{ try{ o.style.display='none'; }catch(_){} },300); } }catch(_){} }
    function enable(){ if(on) return true;
      if(isMob()){ try{ imToast(T('Workspace mode is desktop-only','ワークスペースモードはデスクトップ専用です','Workspace nur am Desktop','Оконный режим — только для десктопа','Solo escritorio')); }catch(_){} return false; }
      on=true;   /* (#R142) claim synchronously so a rapid re-toggle can't re-enter while the heavy build is deferred a frame */
      _wsLoadingOn();
      const _core=()=>{ try{
      css();
      /* build + open the layer panel so its window has content, and clear any leftover close() inline styles */
      try{ if(window.IntMapLayerSidebar&&window.IntMapLayerSidebar.open) window.IntMapLayerSidebar.open(); }catch(_){}
      try{ const lsr=document.getElementById('layer-sidebar-r'); if(lsr){ lsr.style.transform=''; lsr.style.visibility=''; lsr.style.pointerEvents=''; lsr.classList.add('open'); } }catch(_){}
      try{ document.body.classList.remove('sidebar-hidden'); }catch(_){}
      on=true; document.body.classList.add('ws-mode');
      try{ document.documentElement.classList.remove('ws-boot'); }catch(_){}   /* (#R101) release the anti-flicker pre-hide — the windows are being built now */
      const st=state(), dr=defRects();
      DEFS.forEach(def=>{
        /* (#R79f) The default state is ONLY the layout windows (Countries/Map/Layers/Atlas). The on-demand
           windows (News/Information/Community, def.defHidden) NEVER auto-open — they don't persist their open
           state, so a saved layout can't accumulate them ("デフォルト状態で全部のウィンドウをオンにするのは
           やめろ" — keep open only the default-layout ones). The 4 layout windows still persist open/closed. */
        const shown = def.defHidden ? false : ((st.vis&&st.vis[def.id]!==undefined)?st.vis[def.id]:true);
        const w=mkWin(def,(st.rects&&st.rects[def.id])||dr[def.id], !shown); if(!w) return;   /* (#R122) compute `shown` FIRST → skip onWrap for windows that start hidden (no news flicker) */
        if(st.minz&&st.minz[def.id]) w.querySelector('.ws-d-min').click();
        if(!shown){ w.style.display='none'; w.dataset.userHid='1'; }
        wraps[def.id]=w; });
      /* (#R79b) onWrap ran while every window was still visible — so a window that STARTS hidden must run its
         onHide now to leave no artifacts on the map (a hidden News window's pins + "summarize view" button). */
      DEFS.forEach(def=>{ const w=wraps[def.id]; if(w&&w.style.display==='none'&&def.onHide){ try{ def.onHide(); }catch(_){} } });
      mkDock(); syncDock();
      /* (#R83) auto-tile the visible panes into a gapless layout; only override a saved custom layout on a fresh
         start (so junction/divider adjustments persist within a session, but the default opens cleanly tiled). */
      if(!(st.rects&&Object.keys(st.rects).length)) retile(); else buildJunctions();
      try{ ro=new ResizeObserver(()=>{ fitMap(); schedSave(); }); if(wraps.map) ro.observe(wraps.map); }catch(_){}
      document.addEventListener('pointerup',schedSave,true);
      scanT=setInterval(scan,2500);   /* late-appearing elements (ticker) auto-join the workspace */
      /* (#R102) ESC toggles the MAP window between fullscreen and its tiled size ("escキーを押すと、地図ウィンドウを
         全画面化/解除"). Bails when an input is focused, a modal/flight-sim overlay is open, or the flight sim is flying
         (those own ESC), so it never hijacks another ESC action. */
      _escH=(e)=>{ try{ if(!on||e.key!=='Escape'||e.repeat) return;
        const t=e.target; if(t&&(/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable)) return;
        if(document.body.classList.contains('fs-flying')||document.getElementById('fs-setup')||document.getElementById('fs-result')) return;
        const openModal=[...document.querySelectorAll('.modal-overlay,.modal,#compose-modal,.lightbox')].some(m=>{ try{ const s=getComputedStyle(m); return s.display!=='none'&&s.visibility!=='hidden'; }catch(_){ return false; } });
        if(openModal) return;
        const mw=wraps.map; if(!mw||mw.style.display==='none') return;
        const mx=mw.querySelector('.ws-d-max'); if(mx){ e.preventDefault(); e.stopPropagation(); mx.click(); } }catch(_){} };
      document.addEventListener('keydown',_escH,true);
      _lastBottom=wsBounds().bottom;
      fitMap(); setTimeout(fitMap,350); save({on:1});
      try{ syncModeBtn(); }catch(_){}
      try{ window.tileLegends&&window.tileLegends(); setTimeout(()=>{ try{ window.tileLegends&&window.tileLegends(); }catch(_){} },400); }catch(_){}   /* (#R85) re-dock open legends to the map's bottom-left */
      }catch(_e){ try{ console.warn('ws enable',_e); }catch(_){} } finally{ try{ _wsLoadingOff(); }catch(_){} } };   /* warn (not error) — matches the original swallow behaviour while still hiding the overlay on any failure */
      /* (#R142) two rAFs so the overlay actually PAINTS before the synchronous build freezes the frame, then hide it. */
      try{ requestAnimationFrame(()=>requestAnimationFrame(_core)); }catch(_){ _core(); }
      return true; }
    function disable(){ if(!on) return; on=false;
      try{ ro&&ro.disconnect(); }catch(_){} ro=null;
      clearInterval(scanT); scanT=null; hideG(); clearJunctions();
      try{ if(_escH) document.removeEventListener('keydown',_escH,true); }catch(_){} _escH=null;   /* (#R102) drop the ESC-fullscreen handler */
      document.removeEventListener('pointerup',schedSave,true); clearTimeout(saveT);
      for(const id in wraps){ const w=wraps[id]; if(!w) continue;
        const phs=holders[id]; if(Array.isArray(phs)) phs.forEach(pr=>{ const el=pr[0],ph=pr[1]; if(el&&ph&&ph.parentNode){ ph.parentNode.insertBefore(el,ph); ph.remove(); } });
        w.remove(); }
      wraps={}; holders={};
      if(dock){ dock.remove(); dock=null; }
      document.body.classList.remove('ws-mode');
      /* (#R142) restore the RIGHT LAYER PANEL to its normal-mode state. Leaving ws-mode moved #layer-sidebar-r back to its
         DOM slot but left it stuck in the workspace window's full-bleed inline sizing, still carrying the ws open/lsr-open
         classes, with the Active-layers bar mis-homed ("レイヤー選択欄が通常モードにならない"). Clear the window's inline
         geometry, drop the ws classes, then let apply() reconcile to the imLayerPanel setting (close() is safe now that
         ws-mode is off) and re-home the Active bar. Runs BEFORE setMode below. */
      try{ const lsr=document.getElementById('layer-sidebar-r');
        if(lsr){ ['width','height','transform','left','top','right','bottom','position','inset','max-width','max-height','min-width','min-height','flex','margin','z-index'].forEach(pp=>{ try{ lsr.style.removeProperty(pp); }catch(_){} }); lsr.classList.remove('open'); } }catch(_){}
      try{ document.body.classList.remove('lsr-open'); }catch(_){}
      try{ if(window.IntMapLayerSidebar&&window.IntMapLayerSidebar.apply) window.IntMapLayerSidebar.apply(); }catch(_){}
      try{ window._placeActiveSection&&window._placeActiveSection(); }catch(_){} try{ window._refreshActiveLayers&&window._refreshActiveLayers(); }catch(_){}
      /* Information / Community were force-shown in ws-mode; restore the normal tab behaviour by handing control
         back to the sidebar's own tab logic (they hide unless their tab is active). */
      try{ ['info-dashboard','community-feed'].forEach(idc=>{ const e=document.getElementById(idc); if(e) e.style.display='none'; }); }catch(_){}
      try{ const ap=document.getElementById('atlas-panel'); if(ap){ ap.style.display='none'; ap.style.width=''; ap.style.height=''; ap.style.left=''; ap.style.top=''; ap.style.transform=''; } }catch(_){}   /* (#R78f) Atlas back to its floating default, hidden */
      try{ if(typeof setMode==='function'&&typeof HOST.mode!=='undefined') setMode(HOST.mode); }catch(_){}
      /* (#R122) after leaving ws-mode, the map must reflect the NORMAL sidebar — clear the news pins the ws News
         window may have left on the map unless the sidebar is actually on News/Saved ("オフ時にもニュースウィンドウ
         がオンのときの地図表示になる"). */
      try{ const _m=(typeof HOST.mode!=='undefined')?HOST.mode:null; if(_m!=='news'&&_m!=='saved'){ const E=window.IntMapGeoEngine; if(E&&E.layers.hasSource('news-points')) E.layers.setSourceData('news-points',{type:'FeatureCollection',features:[]}); const b=document.getElementById('ai-view-summary-btn'); if(b) b.style.display='none'; } }catch(_){}
      save({on:0}); fitMap(); setTimeout(fitMap,350); try{ syncModeBtn(); }catch(_){}
      try{ window.tileLegends&&window.tileLegends(); setTimeout(()=>{ try{ window.tileLegends&&window.tileLegends(); }catch(_){} },400); }catch(_){}   /* (#R85) restore legends to their normal position */
    }
    function toggle(){ if(on) disable(); else enable(); }
    /* (#R79g) mode switch is a BUTTON now (not a dropdown) — "設定の移動ボタンを置く形式にして". It toggles the
       workspace on/off and reflects the current state; syncModeBtn() keeps it correct however the mode changes
       (button, Atlas, the menu-bar Exit button, or auto-enable on load). */
    function syncModeBtn(){ const b=document.getElementById('setting-wsmode-btn'); if(!b) return;
      if(on){ b.textContent=T('← Exit workspace','← 通常モードに戻る','← Workspace verlassen','← Выйти из режима','← Salir del espacio');
        b.style.background='var(--input-bg)'; b.style.color='var(--text-main)'; b.style.borderColor='var(--glass-border,rgba(128,128,128,0.35))'; }
      else{ b.textContent=T('Switch to workspace →','ワークスペースに切り替え →','Zum Workspace-Modus →','Перейти в оконный режим →','Cambiar al espacio de ventanas →');
        b.style.background='var(--primary-color)'; b.style.color='#fff'; b.style.borderColor='var(--primary-color)'; } }
    function bind(){ const b=document.getElementById('setting-wsmode-btn'); if(!b) return;
      b.addEventListener('click',()=>{ if(on) disable(); else enable(); syncModeBtn();
        /* (#R102) close the Settings popup when switching between normal ⇔ workspace mode ("設定のポップアップが消える
           ように") — a mode switch is a whole-app transition, so leaving the modal floating over it felt broken. */
        try{ const m=document.getElementById('settings-modal'); if(m) m.style.display='none'; }catch(_){} });
      syncModeBtn();
      /* ⚠ (#R233) …AND AGAIN WHENEVER THE LANGUAGE CHANGES. This label is written by JS, not by a
         `data-i18n` attribute, so js/app-body.js's updateI18n() sweep cannot reach it: whatever
         language was current when bind() ran was frozen into the button. Measured with the UI set to
         Japanese — 「Switch to workspace →」 was the ONE English string left in Settings. */
      try{ window.addEventListener('intmap-lang',syncModeBtn); }catch(_){} }
    /* (#R170) DESKTOP DEFAULT = NORMAL mode ("デスクトップ版は通常モードをデフォルトに"), reversing the #R101
       default. Workspace mode is now strictly opt-in: only an explicitly saved on:1 enters it, so a first-time
       desktop visitor lands on the normal sidebar layout with the Countries tab open (see the fresh-boot tab
       default in index.html). Anyone who already switched it on keeps their workspace — their saved on:1 wins. */
    const _wantWS=()=>{ try{ const s=state(); return (s.on===1||s.on===true); }catch(_){ return false; } };
    /* (#R101) ANTI-FLICKER: pre-hide the normal-mode sidebar SYNCHRONOUSLY (before first paint) whenever we intend to
       enter workspace mode, so the page never flashes the normal layout before the windows build ("一度通常モードに
       なってからワークスペースに戻る挙動が気持ち悪い"). enable() removes .ws-boot once the windows exist; a safety
       timer clears it no matter what. The map is a flex child, so hiding the sidebar lets it fill immediately. */
    try{ if(_wantWS()&&!isMob()){ const de=document.documentElement; de.classList.add('ws-boot');
        if(!document.getElementById('ws-boot-style')){ const bs=document.createElement('style'); bs.id='ws-boot-style';
          bs.textContent='html.ws-boot #sidebar,html.ws-boot .map-controls-top,html.ws-boot #layer-sidebar-r,html.ws-boot #lsr-toggle,html.ws-boot #btn-toggle-sidebar{display:none !important;}html.ws-boot .operation-room{background:var(--bg-color,#0d1117);}';   /* (#R115) theme-aware (was the undefined --bg-main → always black) */
          (document.head||de).appendChild(bs); }
        setTimeout(()=>{ try{ de.classList.remove('ws-boot'); }catch(_){} },6000); } }catch(_){}
    /* (#R102) enter workspace mode AS EARLY AS POSSIBLE — the old fixed 900 ms delay left the desktop staring at the
       empty pre-hide background before the windows built ("読み込み開始時から開始するように…何もない画面が気持ち悪い").
       Boot the moment the Atlas kernel exists (it's the one window that must be created via IntMapConsole.open); a
       Promise microtask fires right after the main script finishes parsing (when IntMapConsole is already defined), then
       a short poll as a fallback, and a hard cap so we never wait long. */
    function _bootWS(tries){ try{ bind(); }catch(_){}
      if(!(_wantWS()&&!isMob())){ try{ document.documentElement.classList.remove('ws-boot'); }catch(_){} try{ syncModeBtn(); }catch(_){} return; }
      /* ⚠ (#R224) WORKSPACE MODE IS THE ONE SESSION THAT GENUINELY NEEDS ATLAS AT BOOT — it has an
         Atlas WINDOW, and that window can only be created through IntMapConsole.open(). The kernel is
         on demand now, so without this the poll below would spin its full 3 s and then enter without
         it. Asking for it here is what keeps workspace boot as fast as it was, and it is asked for
         ONLY here: a normal desktop or phone session still never downloads it. */
      try{ if(!window.IntMapConsole&&window.IntMapAtlas) window.IntMapAtlas.hint(); }catch(_){}
      if(window.IntMapConsole&&window.IntMapConsole.open){ try{ enable(); }catch(_){ try{ document.documentElement.classList.remove('ws-boot'); }catch(__){} } return; }
      if((tries||0)<120){ setTimeout(()=>_bootWS((tries||0)+1),25); return; }
      try{ enable(); }catch(_){ try{ document.documentElement.classList.remove('ws-boot'); }catch(__){} }   /* give up waiting → enter anyway */
    }
    try{ Promise.resolve().then(()=>_bootWS(0)); }catch(_){ setTimeout(()=>_bootWS(0),0); }
    /* (#R83) reflow the auto-tiled layout when the browser window resizes (debounced) */
    let _wsRT=null; window.addEventListener('resize',()=>{ if(!on) return; clearTimeout(_wsRT); _wsRT=setTimeout(()=>{ try{ retile(); }catch(_){} },180); });
    /* (#R103) re-localize the workspace chrome (top menu bar + window titles) when the language changes — it used to
       stay in the old language until reload ("言語設定を変えたときに、すべてがその言語にすぐ変わらない"). The wrapped
       content re-localizes via the app's own updateI18n; this covers the ws-only chrome. */
    window.addEventListener('intmap-lang',()=>{ if(!on) return;
      try{ rebuildDock(); }catch(_){}
      try{ DEFS.forEach(def=>{ const w=wraps[def.id]; if(w){ const ti=w.querySelector('.ws-title'); if(ti) ti.textContent=def.t(); } }); }catch(_){}
      try{ syncModeBtn(); }catch(_){}
      /* updateI18n() only re-renders the CURRENT-mode feed (renderUI) — in ws mode the other windows would keep the
         old language, so re-render the ones that carry localized dynamic content. */
      try{ if(wraps.countries&&wraps.countries.style.display!=='none'&&window._wsRenderCountries) window._wsRenderCountries(); }catch(_){}
      try{ if(wraps.info&&wraps.info.style.display!=='none'&&typeof renderDashboard==='function') renderDashboard(); }catch(_){}
      /* (#R104) also re-render the News & Community windows so EVERYTHING follows the language at once, not only the
         current-mode feed that renderUI() handles ("すべてがその言語にすぐ変わらない（再読み込みの必要）"). News is
         re-rendered from the ALREADY-LOADED feed (no re-fetch). */
      try{ if(wraps.news&&wraps.news.style.display!=='none'&&typeof HOST.globalData!=='undefined'&&HOST.globalData&&HOST.globalData.length&&typeof startNews==='function') startNews(); }catch(_){}
      try{ if(wraps.community&&wraps.community.style.display!=='none'&&typeof loadCommunity==='function') loadCommunity(); }catch(_){} });
    return { open:enable, close:disable, toggle, active:()=>on, tickerReflow, syncTicker:()=>{ try{ _syncTicker(); }catch(_){} } };
  })();
};
