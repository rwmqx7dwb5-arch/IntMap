/* ============================================================================
 *  IntMap · FULL RESOLUTION WHEN IT MATTERS — IntMapModules.renderScale  (#R202)
 * ----------------------------------------------------------------------------
 *  「モバイル版で、衛星画像が圧倒的に重い」「地図のホバー、ズームのfpsを劇的に高く」「爆速・超高画質」
 *
 *  MEASURED FIRST, because #R201 measured the wrong thing and said so: its 10.3 fps was taken in a
 *  browser with no GPU. On a real GPU with the CPU throttled 4× — which is what a phone actually
 *  looks like — the same wheel sweep over Tokyo, satellite basemap, 390×844 at DPR 3, goes:
 *
 *      sweep 1   15.9 fps   worst frame 732 ms
 *      sweep 2   23.5 fps   worst frame 130 ms
 *      sweep 3   39.2 fps   worst frame  39 ms
 *      pan 1/2   54.6 / 58.3 fps
 *
 *  i.e. the map is NOT slow in the steady state — the FIRST gesture is, and by an order of
 *  magnitude. A CPU profile of that first sweep puts 62% of self time inside maplibre-gl, 28% in
 *  native code (decode and texture upload) and 4.6% in this app's own JavaScript, so there is no
 *  amount of our own arithmetic to remove: what costs is turning newly-arrived imagery into
 *  textures, and there is simply more of it at the start.
 *
 *  So this file does the one thing that reduces that work without reducing what the user is left
 *  looking at: WHILE THE CAMERA IS MOVING, render fewer fragments; the instant it stops, go back to
 *  full device resolution. A phone at DPR 3 is capped to 2 already (#3), and 2 → 1.4 during motion is
 *  half the fragments and half the per-frame upload — and the frame it lands on, the one anybody
 *  actually reads, is at the full ratio. 「速度、画質を高めて。どちらか一方犠牲はNG」 is met by
 *  splitting it in time rather than by choosing.
 *
 *  ⚠ NOT ON DESKTOP. Measured there at DPR 1: the sweep never leaves 60 fps, so the only thing a
 *  scale change could do is put a resize in the middle of a gesture.
 *  ⚠ AND NOT WHILE THE FLIGHT SIMULATOR IS FLYING: its camera moves continuously, so "while moving"
 *  would mean "always", which is just a permanent resolution cut.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.renderScale=function(HOST){
  const GE=()=>window.IntMapGeoEngine;
  const isMobile=HOST.isMobile;
  if(!(typeof isMobile==='function'&&isMobile())) return { active:()=>false, reason:'desktop' };
  let base=null, low=null, at=null, offT=null, setT=null, on=false, armed=false;
  function ratios(){
    if(base!=null) return;
    try{ base=GE().render.getRenderScale(); }catch(_){ base=null; }
    if(!(base>0)) base=Math.min(2,window.devicePixelRatio||1);
    low=Math.max(1,Math.round(base*0.7*100)/100);
    at=base;
  }
  function flying(){ try{ const F=window.IntMapFlightSim; return !!(F&&F.active&&F.active()); }catch(_){ return false; } }
  function set(r){
    if(at===r) return false;
    let ok=false; try{ ok=GE().render.setRenderScale(r); }catch(_){ ok=false; }
    if(ok) at=r;
    return ok;
  }
  /* ⚠ NEVER SYNCHRONOUSLY INSIDE THE RENDERER'S OWN EVENT, AND NEVER BEFORE IT HAS SETTLED ONCE.
     Changing the ratio reallocates the drawing buffer and every framebuffer hanging off it, and the
     app's boot does its own camera work — so `movestart` fires while the style is still being built.
     Doing the reallocation there took the GL context down: measured, 2 runs of 2, a hard renderer
     CRASH at load on a 390×844 DPR-3 context (the desktop context survived it, which is exactly the
     kind of asymmetry that ships). Deferring the call out of the handler and refusing to arm until
     the first `idle` both go, and the pair is what makes it safe. */
  function safeSet(r){ if(!armed) return; clearTimeout(setT); setT=setTimeout(()=>{ try{ if(GE().canDraw()) set(r); }catch(_){} },0); }
  function down(){ ratios(); if(flying()||low>=base) return; clearTimeout(offT); safeSet(low); }
  function up(){ ratios(); clearTimeout(offT);
    /* ⚠ AFTER the gesture, not during its tail. A wheel sweep is a run of movestart/moveend pairs a
       few tens of milliseconds apart; restoring on each of them would resize the drawing buffer
       twenty times in one sweep, which costs more than it saves. 220 ms is past the gap between two
       wheel notches and under the delay at which a still picture reads as having stayed soft. */
    offT=setTimeout(()=>{ safeSet(base); },220);
  }
  function start(){
    if(on||!GE().hasRenderer()) return false;
    on=true;
    try{
      const E=GE().events;
      ['movestart','zoomstart','rotatestart','pitchstart','dragstart'].forEach(e=>E.on(e,down));
      ['moveend','zoomend','rotateend','pitchend','dragend'].forEach(e=>E.on(e,up));
      /* armed only once the renderer has finished a frame on its own terms */
      E.once('idle',()=>{ try{ ratios(); armed=true; }catch(_){} });
    }catch(_){ on=false; return false; }
    return true;
  }
  window.IntMapRenderScale={ start, active:()=>on, state:()=>({ base, low, at, on, armed }) };
  return window.IntMapRenderScale;
};
