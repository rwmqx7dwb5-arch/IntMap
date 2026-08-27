/* ============================================================================
 *  IntMap · THE MOBILE MAP INPUT SURFACE — long-press, crosshair, centre readout  (#R496)
 * ----------------------------------------------------------------------------
 *  Moved out of js/app-body.js VERBATIM, together with the two ⚠ boxes #R496 wrote into them. Not
 *  one character of the geometry was retyped: the #R16 uncovered-centre rule, the #R12 unproject of
 *  the visual centre, the #R13/#R15/#R33 visibility rules and the 12 px / 550 ms long-press
 *  thresholds are the text they have always been. What changed on the way out is only the names the
 *  closure used to supply — `toolMode`, `isMobile`, `renderCoordReadout`, `demElevAt`, `elevText`,
 *  `lastElev`, `updateLayerReadout`, `handleMapClick`, `showContextMenu`, `currentLang` — which now
 *  arrive through HOST, because a moved module that inherits a closure name silently skips a whole
 *  branch instead of failing (scripts/check-split-scope.mjs, #R162).
 *
 *  WHY IT LEFT THE SHELL. tests/r168 #8 and tests/r479 ⑧ budget the app shell — index.html +
 *  src/main.js + src/vendor.js + js/app-body.js + js/geo-engine.js + js/lazy-modules.js — and on
 *  origin/main it stood at 8,049 lines against a ceiling of 8,050. #R496 made the input path cheaper
 *  and that cost the shell 124 lines. The rule #R194/#R195/#R196 set is that the ceiling follows the
 *  floor DOWN and is never raised to let a change through, so the debt is paid the way #R311 paid
 *  it for the hover tooltip: the surface leaves whole.
 *
 *  IT IS ONE SURFACE. Everything here is how a FINGER reaches the map — the long-press that opens
 *  the context menu, the crosshair that marks the point a tap would act on, the readout that says
 *  what is under it, and the "Add point" pill that commits it. They share the mobile predicate, the
 *  container box and the centre-of-the-uncovered-area rule; splitting them would duplicate all three.
 *
 *  ⚠ TWO MOUNT POINTS, ON PURPOSE. `longPress()` is called from the map-event wiring and
 *  `crosshair()` from the position the block occupied ~2,400 lines later, because both register
 *  listeners whose order relative to their neighbours is observable. A single mount would have moved
 *  one of them.
 *
 *  ⚠ THE READS IN HERE ARE THE SUBJECT OF #R496, not an accident of the move — see the two ⚠ boxes
 *  below, and Architecture.md §9.3.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.mobileMapInput=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  const RT=()=>window.IntMapRuntime;     /* (#R234) one frame, one camera subscription, one timer */

  /* ══ the long-press that opens the context menu ══════════════════════════════════════════════ */
  function longPress(){
  /* Long-press → context menu on touch devices */
  (function(){
    /* ══ ⚠⚠⚠ (#R496) getBoundingClientRect() ON EVERY SINGLE touchmove ═══════════════════════════
       「スマホで地図が指に付いてこない」. The move test read the canvas box and then computed
           dx = touch.clientX − rect.left − startPt.x     where startPt.x = start.clientX − rect.left
       — the two rect.left cancel, so the whole expression is (clientX − startClientX) and the box
       was being measured, on the pointer's own path, to subtract a number from itself.
       ⚠ AND IT WAS MEASURED FOR THE WHOLE GESTURE, NOT JUST THE PRESS. Passing the 12 px threshold
       cleared the timer but left startPt set, and the handler's only early-exit tested startPt — so
       a pan of 100 touchmoves paid 101 layout reads, every one of them AFTER the long-press had
       already been abandoned, and every one interleaved with the crosshair task's display writes
       below (see the ⚠ box there). That read-after-write pair is what turns a cheap read into a
       forced synchronous layout, once per finger event, for the length of a drag.
       So: keep the start point in CLIENT coordinates, compare in CLIENT coordinates, and DISARM on
       cancel so the rest of the gesture costs nothing at all.
       ⚠ NOTHING ABOUT THE GESTURE CHANGES. The threshold is the same threshold — hypot(dx,dy)>12
       and dx*dx+dy*dy>144 are the same predicate on the same dx,dy — the 550 ms is the same, and
       startPt (canvas-relative, which is what unproject wants) still feeds the menu unchanged. */
    const canvas=GE().render.canvas(); let pressTimer=null, startPt=null, startClient=null, fired=false;
    canvas.addEventListener('touchstart',(e)=>{
      if(e.touches.length!==1) return;
      const tx=e.touches[0].clientX, ty=e.touches[0].clientY;
      const rect=canvas.getBoundingClientRect();   /* ⚠ ONCE, at the start of the press — never again in this gesture */
      startPt={x:tx-rect.left,y:ty-rect.top}; startClient={x:tx,y:ty}; fired=false;
      /* (#R13) Long-press → context menu re-enabled. The center "Add point" button now only appears
         while a measurement tool is active (per the user), so long-press is again the way to reach the
         right-click menu on touch when idle. Suppressed while a tool is active (the button handles that). */
      if(HOST.toolMode) return;
      pressTimer=setTimeout(()=>{ fired=true; try{ const ll=GE().coords.unproject([startPt.x,startPt.y]); HOST.showContextMenu({x:startPt.x,y:startPt.y}, ll); }catch(_){} }, 550);
    },{passive:true});
    const cancel=(e)=>{
      if(pressTimer){ clearTimeout(pressTimer); pressTimer=null; }
      startClient=null;   /* (#R496) disarm — every later touchmove in this gesture returns on its first line */
      if(fired && e && e.cancelable){ e.preventDefault(); }
    };
    canvas.addEventListener('touchmove',(e)=>{
      if(!startClient) return;                      /* (#R496) already cancelled: no read, no work */
      if(!e.touches.length){ cancel(e); return; }
      const dx=e.touches[0].clientX-startClient.x, dy=e.touches[0].clientY-startClient.y;
      if(dx*dx+dy*dy>144) cancel(e);                /* the #R13 threshold, squared — no rect, no hypot */
    },{passive:true});
    canvas.addEventListener('touchend',cancel,{passive:false});
    canvas.addEventListener('touchcancel',cancel,{passive:true});
  })();
  }

  /* ══ the crosshair, the centre readout and the "Add point" pill ══════════════════════════════ */
  function crosshair(){
  /* ===== (#R11) Mobile measuring is CENTER-FIXED: a subtle crosshair marks the map center, a bottom-
   center "Add point" button adds the center coordinate (for measure / area / radius), and a small
   bottom-left readout shows the center's coords + active-layer value. The button also replaces the
   (now-disabled) long-press context menu when no tool is active. On desktop it shows only while a
   measurement tool is active (so right-click still drives the menu). ===== */
    (function(){
  if(!GE().hasRenderer()) return;
  const mob=()=>{ try{ return HOST.isMobile(); }catch(_){ return !!(window.matchMedia&&window.matchMedia('(max-width:768px)').matches); } };
  const mc=document.getElementById('map-container')||document.body;
  const st=document.createElement('style'); st.textContent=`
    #m-crosshair{ display:none; position:absolute; top:50%; left:50%; width:28px; height:28px; margin:-14px 0 0 -14px; pointer-events:none; z-index:600; }
    #m-crosshair::before,#m-crosshair::after{ content:''; position:absolute; background:rgba(255,255,255,0.6); box-shadow:0 0 1.5px rgba(0,0,0,0.7); }
    #m-crosshair::before{ left:50%; top:0; width:1.4px; height:100%; margin-left:-0.7px; }
    #m-crosshair::after{ top:50%; left:0; height:1.4px; width:100%; margin-top:-0.7px; }
    #m-addpoint{ display:none; position:absolute; left:50%; bottom:calc(var(--sheet-cover, 80px) + 14px); transform:translateX(-50%); z-index:1200; background:var(--primary-color); color:#fff; border:none; border-radius:999px; padding:11px 22px; font-size:14px; font-weight:700; box-shadow:0 4px 16px rgba(0,0,0,0.32); cursor:pointer; }
    #m-addpoint:active{ transform:translateX(-50%) scale(0.96); }
    /* (#R15c) Mobile readout: ALWAYS one line (was wrapping to two when the layer value was long),
       smaller, and tucked into the very corner. nowrap + ellipsis keeps it compact. */
    /* (#R18) The always-on readout hugs the sheet — only a sliver of a gap ("ボトムシートとの間にわずかに隙間がある程度まで下げて"). */
    @media(max-width:768px){ .coord-readout{ left:6px !important; right:auto !important; bottom:calc(var(--sheet-cover, 80px) + 4px) !important; top:auto !important; font-size:9.5px !important; padding:3px 7px !important; gap:7px !important; max-width:calc(100vw - 12px); flex-wrap:nowrap !important; white-space:nowrap !important; overflow:hidden; text-overflow:ellipsis; border-radius:8px !important; }
      .coord-readout span{ white-space:nowrap; flex-shrink:0; }
      /* (#R16) The crosshair must mark the center of the VISIBLE map space — the area NOT covered by the
         bottom sheet — not the center of the phone screen. Sit it halfway down the uncovered area. */
      #m-crosshair{ top:calc((100% - var(--sheet-cover, var(--peek-h, 196px))) / 2) !important; } }`;
  document.head.appendChild(st);
  const cross=document.createElement('div'); cross.id='m-crosshair'; cross.innerHTML=''; mc.appendChild(cross);
  const btn=document.createElement('button'); btn.id='m-addpoint'; btn.type='button'; mc.appendChild(btn);
  function setLabel(){ btn.textContent=(window.IntMapLang.t(HOST.lang,'＋ Add point','＋ 地点を追加','＋ Punkt hinzufügen','＋ Добавить точку','＋ Añadir punto')); }
  setLabel(); window.addEventListener('intmap-lang',setLabel);
  /* (#R12) The crosshair sits at the GEOMETRIC center of the map (50%/50%). map.getCenter() returns the
     PADDED center (the bottom-sheet/sidebar shift the map padding), so it was offset from the crosshair
     — adding measure points in the wrong place. Unproject the visual center pixel instead so the
     crosshair's center IS the exact point. */
  /* ══ ⚠⚠⚠ (#R496) THE TWO READS INSIDE THIS FUNCTION RAN ON EVERY CAMERA FRAME ═════════════════
     centerLL is called from the per-frame crosshair task below, and it opened with
     mc.getBoundingClientRect() followed by getComputedStyle(mc) — the two most expensive questions
     you can ask the DOM — to learn two numbers that change when the WINDOW changes and, for the
     second, while the bottom sheet is being dragged. Neither changes because the camera moved.
     Worse, the task that calls it is registered in the runtime's WRITE phase and writes display on
     two elements FIRST, so both reads were forced synchronous layout, on the phone, sixty times a
     second, for the whole of every pan. js/runtime.js's header is about exactly this shape; this
     callback contained it internally, where the phase split could not see it.
     ① THE BOX comes from a ResizeObserver — js/map-tooltip.js's instrument (#R311), adopted here
        for the reason stated there: the map's size is not a property of the pointer, or the camera.
     ② THE COVER is re-read only when it can have changed. js/mobile-ui.js writes --sheet-cover as
        an INLINE declaration on #map-container, so reading that string is a CSSOM read and costs no
        style recalculation; the computed value behind it is re-taken only when that string — or
        document.body.className, which is what js/playground.js's !important override and sheet-full
        ride on — differs from the one the cached number was taken with.
     ⚠ THE ANSWER IS BYTE-FOR-BYTE THE OLD ANSWER. Same getPropertyValue pair, same fallback to
     --peek-h, same (height − cover) / 2; only the number of times it is asked has changed. */
  let _mcW=0,_mcH=0,_mcRO=null,_cover=null,_coverKey=null;
  function _mcBox(){
    if(!_mcRO){
      const read=()=>{ try{ const r=mc.getBoundingClientRect(); _mcW=r.width; _mcH=r.height; }catch(_){} _cover=null; _coverKey=null; };
      read();
      try{ _mcRO=new ResizeObserver(read); _mcRO.observe(mc); }
      catch(_){ _mcRO=true; try{ window.addEventListener('resize',read); }catch(__){} }   /* no RO → fall back to the event */
    }
    return {width:_mcW,height:_mcH};
  }
  function _sheetCover(){
    let key='';
    try{ key=(mc.style.getPropertyValue('--sheet-cover')||'')+'|'+(document.body.className||''); }catch(_){}
    if(_cover!=null && key===_coverKey) return _cover;
    _coverKey=key;
    try{ const cs=getComputedStyle(mc); _cover=parseFloat(cs.getPropertyValue('--sheet-cover'))||parseFloat(cs.getPropertyValue('--peek-h'))||0; }catch(_){ _cover=0; }
    return _cover;
  }
  function centerLL(){ const r=_mcBox();
    /* (#R16) Match the crosshair: on mobile the target point is the center of the UNCOVERED map area
       (above the sheet), so unproject that exact pixel — keeps Add-point and long-press accurate. */
    let cy=r.height/2;
    if(mob()){ cy=(r.height-_sheetCover())/2; }
    const px=[r.width/2, cy]; const ll=GE().coords.unproject(px); return {lng:ll.lng, lat:ll.lat, px:{x:px[0],y:px[1]}}; }
  window._mCenterLL=centerLL;
  /* (#R13) The +Add point button (and the center crosshair) now appear ONLY while a measurement tool
     is active — the user didn't want a permanent button cluttering the mobile map. When idle, long-press
     drives the context menu instead. */
  /* (#R15 / #1) The crosshair is now ALWAYS visible on mobile (the user wants the center point's
     coords/elevation/layer value shown at all times), while the +Add-point button stays tool-only. */
  /* (#R33) "Add point" pill is MOBILE-ONLY now — on desktop you add points by clicking the map, so the
     pill is redundant ("Don't show 'Add point' pill in desktop mode"). */
  /* (#R496) …and the two display writes only happen when the value actually differs. Assigning the
     string that is already there still invalidates layout, which is what made the reads above
     forced ones — #R311 learned this on the tooltip's left/top; it is the same defect here. */
  function update(){ const m=mob(); const tool=!!(HOST.toolMode);
    const cd=m?'block':'none', bd=(tool&&m)?'block':'none';
    if(cross._imDisp!==cd){ cross._imDisp=cd; cross.style.display=cd; }
    if(btn._imDisp!==bd){ btn._imDisp=bd; btn.style.display=bd; } }
  /* (#R12) Mobile bottom-left readout = coords + elevation + active-layer value at the crosshair
     center, mirroring desktop. updateCoord() early-returns on mobile, so compute them here directly. */
  function readout(){ if(!mob()) return; try{ const c=centerLL();
    const dem=HOST.demElevAt(c.lng,c.lat,()=>{ const d2=HOST.demElevAt(c.lng,c.lat); if(d2!=null){ HOST.lastElev=HOST.elevText(d2); HOST.renderCoordReadout(c.lng,c.lat); } });
    if(dem!=null) HOST.lastElev=HOST.elevText(dem);
    try{ HOST.updateLayerReadout(c.lng,c.lat); }catch(_){}
    HOST.renderCoordReadout(c.lng,c.lat); }catch(_){} }
  let _roT=0;
  GE().events.on('moveend',()=>{ readout(); update(); });
  /* (#R25/#R37) Smoother pan/zoom ("動きがカクツク" / "抜本的に滑らかに"): during motion render only the
     cheap coordinate text. The heavy crosshair readout — DEM lookup + queryRenderedFeatures for the
     active-layer value — settles once on moveend above instead of spiking the main thread mid-gesture.
     ⚠ (#R234) the private rAF is gone, not the work: same frames, same inputs, now through
     js/runtime.js's single WRITE phase so this cannot invalidate another follower's read. */
  /* ⚠ (#R496) SPLIT ALONG THE RUNTIME'S OWN SEAM. js/runtime.js runs every phase:'read' entry
     before the first WRITE entry precisely so that a frame samples geometry once; this task was a
     single WRITE entry that wrote display, then measured the container, then wrote text — the
     forced-layout sandwich the register exists to prevent, hidden inside one callback where the
     phases could not separate it. The READ half samples the centre; the WRITE half applies it. */
  let _crossSample=null;
  RT().onCamera('shell.crosshair.read',()=>{ _crossSample=null;
    if(!mob()) return;
    try{ const c=centerLL(); _crossSample={lng:c.lng,lat:c.lat}; }catch(_){} },{phase:'read'});
  RT().onCamera('shell.crosshair',()=>{ update();
    const s=_crossSample; if(s){ try{ HOST.renderCoordReadout(s.lng,s.lat); }catch(_){} } });
  window.addEventListener('resize',update);
  btn.onclick=()=>{ try{ const c=centerLL(); if(HOST.toolMode){ HOST.handleMapClick(c.lng,c.lat,c.px,true); } else { HOST.showContextMenu({x:c.px.x,y:c.px.y},{lng:c.lng,lat:c.lat}); } }catch(_){} };
  setTimeout(()=>{ update(); readout(); },400);
  window._mAddPoint=btn; window._mAddPointUpdate=update;
    })();
  }

  const API={ longPress, crosshair };
  try{ window.IntMapMobileMapInput=API; }catch(_){ }
  return API;
};
