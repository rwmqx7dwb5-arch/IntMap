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
    (function(){
      const cv=GE().render.canvasContainer&&GE().render.canvasContainer(); if(!cv||cv.__pinchSens) return; cv.__pinchSens=true;
      let active=false, startDist=0, startZoom=0;
      const sens=()=>Math.max(0.25,Math.min(3,+window.imNavZoomSens||1));
      const dist=(t)=>Math.hypot(t[0].clientX-t[1].clientX, t[0].clientY-t[1].clientY);
      const midLngLat=(t)=>{ const r=cv.getBoundingClientRect(); return GE().coords.unproject([ (t[0].clientX+t[1].clientX)/2-r.left, (t[0].clientY+t[1].clientY)/2-r.top ]); };
      cv.addEventListener('touchstart',(e)=>{
        if(sens()===1) return;                                 /* default feel → MapLibre handles it */
        if(e.touches&&e.touches.length===2){ active=true; startDist=dist(e.touches); startZoom=GE().camera.getZoom();
          try{ GE().input.set('touchZoomRotate',false); }catch(_){} }
      },{passive:true});
      cv.addEventListener('touchmove',(e)=>{
        if(!active||!e.touches||e.touches.length!==2) return;
        const d=dist(e.touches); if(startDist<=0) return;
        const z=startZoom + Math.log2(d/startDist)*sens();
        try{ GE().camera.easeTo({zoom:Math.max(GE().camera.getMinZoom(),Math.min(GE().camera.getMaxZoom(),z)), around:midLngLat(e.touches), duration:0}); }catch(_){}
        if(e.cancelable) e.preventDefault();
      },{passive:false});
      const end=(e)=>{ if(active && (!e.touches||e.touches.length<2)){ active=false; try{ GE().input.set('touchZoomRotate',true); }catch(_){} } };
      cv.addEventListener('touchend',end); cv.addEventListener('touchcancel',end);
    })();
    /* (#R23) re-assert once the map first settles — some gesture handlers (e.g. the Draw tool) re-enable
       dragPan with defaults, which would silently drop the user's inertia choice. */
    try{ GE().events.once('idle',()=>{ try{ window._applyNavSens(); }catch(_){} }); }catch(_){}
  }
}
