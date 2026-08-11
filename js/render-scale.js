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
    low=Math.max(1,Math.round(base*LOW_RATIO*100)/100);
    at=base;
  }
  function flying(){ try{ const F=window.IntMapFlightSim; return !!(F&&F.active&&F.active()); }catch(_){ return false; } }
  /* ══ (#R203) HOW FAR THE RATIO DROPS, AND THE TWO THINGS THAT DO NOT WORK ═══════════════════════
     「モバイル版で、特に衛星画像含め圧倒的に重い」「地図のホバー、ズームのfpsを劇的に高くしろ」

     Re-measured on the shipped build (390×844, DPR 3, CPU ×4, satellite over Tokyo, three sweeps):
     38.7 / 40.1 / 30.7 fps, and one 747 ms frame inside the third. A CDP profile of that sweep says
     51.4 % of self time is `(program)` — native — the largest single gap is 1,856 ms with nothing but
     `(program)` on the stack, and this app's own JavaScript is under 8 % of the whole. That is image
     decode and texture upload, exactly where #R202 left it.

     ⚠ TWO THINGS WERE TRIED AGAINST IT AND ONE IS RECORDED HERE BECAUSE IT FAILED. Throttling
     MapLibre's parallel-image cap from 48 to 4 while the camera moves — on the theory that a
     fourteen-notch sweep crosses eleven zoom levels and asks for every one of them — measured
     9.5 / 10.9 / 20.9 and 13.9 / 28.2 / 22.4 fps against a 31–40 baseline, i.e. materially WORSE in
     both runs, because a tile that arrives late is a tile that repaints late and the queue simply
     moves the work into the gesture's tail. The queue was not the problem, so it is not throttled.

     ⚠ AND SO IS THE SECOND ONE. This file's own lever was turned FURTHER down — 0.70 → 0.55 of the
     base ratio while the camera moves — and measured 20.9 / 23.5 / 20.0 and 14.8 / 18.9 / 28.0, worse
     than 0.70 in all six comparisons while panning was unchanged at 59.5 / 60.1. Fewer fragments is
     not the binding cost either; past a point the drawing-buffer reallocation the change itself
     causes costs more than the shading it saves. #R202's 0.70 is the measured best of the three
     settings tried and it is what ships — written down here so the next round does not sweep it again.

     WHAT IS ACTUALLY LEFT IS NATIVE, and this round says so with a stack rather than a guess: on a
     phone-class CPU the sweep spends its time decoding JPEG tiles and uploading them, and this app's
     own arithmetic is under 8 % of a profile in which it would have had to be most of it to matter.
     The remaining levers belong to the imagery pipeline (fewer intermediate levels; ancestor crops
     while the camera moves), not to this file. */
  const LOW_RATIO=0.70;
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
  /* ══ ⚠⚠ (#R221) THIS MODULE WAS DRIVING ITSELF, FOR EVER, ON EVERY PHONE ═══════════════════════
     「モバイル版がまだ劇的に遅い…マップのスクロール、ズームがかなりラグい。」

     Changing the render scale RESIZES the drawing buffer, and MapLibre emits `movestart` → `resize`
     → `moveend` when it does. Those are the very events this module arms on. So:

         gesture ends → up() → set(base) → resize → movestart → down() → set(low)
                      → resize → moveend → up() → set(base) → …

     — a closed cycle with nothing in it that stops. Measured on the built site, phone viewport, with
     NOBODY TOUCHING THE MAP: `movestart(prog) / resize / moveend(prog)` repeating about every 130 ms
     for as long as the tab is open, the camera provably still (Δcentre 0, Δzoom 0, Δbearing 0 over
     four seconds), and `getRenderScale()` sitting at 1.4 — i.e. the phone has been rendering at 70 %
     of its device ratio PERMANENTLY, and reallocating its drawing buffer and every framebuffer
     hanging off it several times a second, since #R202 shipped.

     It also explains #R203's puzzling sweep: it measured 0.55 against 0.70 and found 0.55 WORSE in
     all six comparisons, which is not how fewer fragments behave. It was not measuring a resolution;
     it was measuring how often this loop reallocated.

     ⚠ THE FIX IS TO IGNORE OUR OWN ECHO, NOT TO DEBOUNCE IT. One resize emits exactly one movestart
     and one moveend, so two credits are put on the counter before the call and spent by the next two
     events. A debounce would only change the period of the loop. ⚠ `dragstart`/`zoomstart` and their
     ends are NOT counted: a resize never emits those, so a real gesture that begins inside the window
     still arms immediately. */
  let echo=0;
  function selfResize(){ echo=2; }
  function isEcho(){ if(echo>0){ echo--; return true; } return false; }
  function safeSet(r){ if(!armed) return; clearTimeout(setT); setT=setTimeout(()=>{
    try{ if(GE().canDraw()&&at!==r){ selfResize(); set(r); } }catch(_){} },0); }
  function down(ev){ if(ev===1&&isEcho()) return; ratios(); if(flying()||low>=base) return; clearTimeout(offT); safeSet(low); }
  function up(ev){ if(ev===1&&isEcho()) return; ratios(); clearTimeout(offT);
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
      /* ⚠ ONLY `movestart`/`moveend` CARRY THE ECHO FLAG (the `1`). A resize emits those two and
         nothing else, so a real drag/zoom/rotate/pitch that begins right after a scale change is
         still armed on the first frame. */
      E.on('movestart',()=>down(1)); E.on('moveend',()=>up(1));
      ['zoomstart','rotatestart','pitchstart','dragstart'].forEach(e=>E.on(e,()=>down(0)));
      ['zoomend','rotateend','pitchend','dragend'].forEach(e=>E.on(e,()=>up(0)));
      /* armed only once the renderer has finished a frame on its own terms */
      E.once('idle',()=>{ try{ ratios(); armed=true; }catch(_){} });
    }catch(_){ on=false; return false; }
    return true;
  }
  window.IntMapRenderScale={ start, active:()=>on, state:()=>({ base, low, at, on, armed, lowRatio:LOW_RATIO }) };
  return window.IntMapRenderScale;
};
