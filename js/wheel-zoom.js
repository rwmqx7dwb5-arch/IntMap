/* ============================================================================
 *  IntMap · the wheel, and how fast the map answers it  (#R200)
 * ----------------------------------------------------------------------------
 *  MapLibre's own cursor-anchored scroll zoom (#R20 put it back), plus the user-tunable
 *  navigation sensitivity behind it: the wheel/pinch rate and the drag inertia, their Settings
 *  controls, and the five-language strings that name them.
 *
 *  Lifted verbatim out of js/app-body.js (#R200, second pass): 66 of its 66 lines are
 *  byte-identical, and the 0 that are not are all #R165's rule — a closure value
 *  js/app-body.js REASSIGNS at runtime is read through IM_HOST's live accessor
 *  (none here), never captured when this factory ran.
 *  Everything else arrives through CTX under its ORIGINAL name, which is what lets the body stay
 *  word-for-word what it was. A real ES module: no window.IntMapModules entry, no src/main.js order.
 * ==========================================================================*/
export function makeWheelZoom(HOST, CTX) {
  const GE=CTX.GE, i18n=CTX.i18n;
  /* ===== (#R20) Wheel zoom RESTORED to the built-in cursor-anchored behavior. =====
     The R19 custom "glide" accumulator (easeTo + around per frame) broke the universal
     zoom-toward-the-cursor UX on the globe ("カーソル地点へとズームされるというUXがなくなってしまった").
     MapLibre's native scrollZoom zooms about the pointer correctly under every projection, so it is
     back as the single wheel path. On top of it, a user-tunable NAVIGATION SENSITIVITY (Settings →
     "Map navigation"): zoom multiplies the wheel/pinch rates, pan scales the drag inertia. Defaults
     (1.0×) reproduce the long-standing feel exactly. */
  try{
}catch(_){}
  if(GE().hasRenderer()){
    window.imNavZoomSens = window.imNavZoomSens || 1;
    window.imNavPanSens  = window.imNavPanSens  || 1;
    if(window.imNavInertia==null) window.imNavInertia=1;   /* (#R23) 1=default glide, 0=instant stop */
    window._applyNavSens = function(){
      const z=Math.max(0.25,Math.min(3,+window.imNavZoomSens||1));
      const p=Math.max(0.25,Math.min(3,+window.imNavPanSens||1));
      const iner=Math.max(0,Math.min(1.5, window.imNavInertia==null?1:+window.imNavInertia));
      try{
        GE().input.set('scrollZoom',true);
        GE().input.setZoomRate(z*(1/300),true);   /* 1.0 = the long-standing default feel */
        GE().input.setZoomRate(z*(1/90));         /* trackpad pinch */
      }catch(_){}
      /* (#R22/#R23) iOS-like momentum, now with a dedicated INERTIA control ("慣性を0から既定まで調整可能に"):
         Pan scales the fling speed, Inertia scales the glide DURATION and can disable it entirely (0). On a
         1:1 touch/mouse drag the glide is the only thing these sliders can change — so this is also what makes
         the Pan/Inertia sliders visibly affect MOBILE behavior. */
      try{
        if(iner<=0.02){ GE().input.set('dragPan',true); }   /* glide off → stops on release */
        else { GE().input.set('dragPan',true); }
      }catch(_){}
      try{ GE().input.set('touchZoomRotate',true); }catch(_){}
      /* (#R25/#21) Take over double-tap zoom so its amount follows the Zoom slider on touch (built-in is a
         fixed +1). The custom dblclick handler does the sensitivity-scaled easeTo. */
      try{ GE().input.set('doubleClickZoom',false); }catch(_){}
    };
    window._applyNavSens();
    /* (#R27) MOBILE PINCH-ZOOM sensitivity. MapLibre exposes no pinch-rate API, so the slider used to do
       NOTHING for the most common mobile zoom gesture ("zoomの感度設定をしても動作に反映されない"). This is a
       custom 2-finger pinch that scales the zoom delta by the slider. It engages ONLY when the user has
       CHANGED the setting (sens !== 1) — at the default, MapLibre's native pinch is left fully intact, so
       there is zero regression risk for everyone who never touched the slider. */
    /* ══ ⚠⚠⚠ (#R499) …AND IT WAS THE MOST EXPENSIVE INPUT PATH IN THE APP ════════════════════════
       Everything below is the #R27 gesture, unchanged in what it does. What changed is how often it
       asks the DOM and the renderer, because it did BOTH once per finger event:
         · `midLngLat` opened with `cv.getBoundingClientRect()` — a layout read on the pointer's own
           path, to learn an offset that changes when the WINDOW changes and at no other time. It is
           the same defect #R498 removed from the long-press handler, in the handler right beside it;
         · and it drove `camera.easeTo({duration:0})` from the event, so a 120 Hz touch digitiser —
           which every recent phone has — ran the renderer's whole camera update TWICE per displayed
           frame and threw one of them away. The listener is `passive:false`, so all of that is
           between the finger and the browser's own scroll/zoom decision.
       ⚠ THIS RUNS ONLY WHEN THE READER HAS MOVED THE ZOOM SLIDER (`sens()!==1`) — which is exactly
       why it survived: at the default MapLibre handles the pinch and this path is never entered, so
       「感度を変えると特にピンチが重い」 is a report only the people who changed the setting can make.
       ⚠ THE GESTURE IS BYTE-FOR-BYTE THE SAME GESTURE. Same `log2(d/startDist)*sens()`, same clamp,
       same anchor pixel, same preventDefault. The zoom is applied on the frame, and the LAST pending
       one is flushed on touchend so the gesture cannot end on a stale value. */
    (function(){
      const cv=GE().render.canvasContainer&&GE().render.canvasContainer(); if(!cv||cv.__pinchSens) return; cv.__pinchSens=true;
      let active=false, startDist=0, startZoom=0, pend=null;
      const sens=()=>Math.max(0.25,Math.min(3,+window.imNavZoomSens||1));
      const dist=(t)=>Math.hypot(t[0].clientX-t[1].clientX, t[0].clientY-t[1].clientY);
      /* (#R499) the observed box — js/runtime.js §5. The direct read is the pre-runtime fallback and
         nothing else: this listener cannot be reached before the map exists. */
      const boxOf=()=>{ try{ const R=window.IntMapRuntime; if(R&&R.box) return R.box(cv); }catch(_){} return cv.getBoundingClientRect(); };
      const apply=()=>{ const p=pend; pend=null; if(!p) return;
        const r=boxOf();
        try{ GE().camera.easeTo({ zoom:Math.max(GE().camera.getMinZoom(),Math.min(GE().camera.getMaxZoom(),p.z)),
          around:GE().coords.unproject([p.mx-r.left,p.my-r.top]), duration:0 }); }catch(_){} };
      cv.addEventListener('touchstart',(e)=>{
        if(sens()===1) return;                                 /* default feel → MapLibre handles it */
        if(e.touches&&e.touches.length===2){ active=true; startDist=dist(e.touches); startZoom=GE().camera.getZoom(); pend=null;
          try{ GE().input.set('touchZoomRotate',false); }catch(_){} }
      },{passive:true});
      cv.addEventListener('touchmove',(e)=>{
        if(!active||!e.touches||e.touches.length!==2) return;
        const t=e.touches, d=dist(t); if(startDist<=0) return;
        pend={ z:startZoom + Math.log2(d/startDist)*sens(), mx:(t[0].clientX+t[1].clientX)/2, my:(t[0].clientY+t[1].clientY)/2 };
        let queued=false; try{ const R=window.IntMapRuntime; if(R&&R.frame){ R.frame('wheel-zoom.pinch',apply); queued=true; } }catch(_){}
        if(!queued) apply();
        if(e.cancelable) e.preventDefault();
      },{passive:false});
      const end=(e)=>{ if(active && (!e.touches||e.touches.length<2)){ active=false; apply();   /* (#R499) never end on a frame that was never drawn */
        try{ GE().input.set('touchZoomRotate',true); }catch(_){} } };
      cv.addEventListener('touchend',end); cv.addEventListener('touchcancel',end);
    })();
    /* (#R23) re-assert once the map first settles — some gesture handlers (e.g. the Draw tool) re-enable
       dragPan with defaults, which would silently drop the user's inertia choice. */
    try{ GE().events.once('idle',()=>{ try{ window._applyNavSens(); }catch(_){} }); }catch(_){}
  }
}
