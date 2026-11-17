/* ============================================================================
 *  IntMap · Guided demo door & progress control  (#R167)
 * ----------------------------------------------------------------------------
 *  First-run onboarding: the door to the guide tour reachable from Settings (the tour itself is js/tour-player.js's), and
 *  the shared honest progress control (window._imProgCtl) that js/map-tools.js also uses.
 *  Two factories, each called where its block used to run — the progress control sits much
 *  further down the closure than the demo.
 * ==========================================================================*/

import { isLayer, isDisplay } from './layer-manifest.js';


export function onboarding(HOST){
  const isMobile=HOST.isMobile;
  /* (guide-unify) The guided tour is no longer a mechanism of its own. It used to be a hand-written list of four
     layers a timer switched on (SHOW, 9 s each) with a pill of its own; it is now the tour the player already
     has — js/tour-player.js plays `guide`, whose steps js/tours.js derives from the examples marked `guide` in
     js/showcase.js. This function is only the DOOR: Settings ▸ Tutorial calls it with force=true.
     What the first-visit rules were, they still are (nothing calls it unforced today — the welcome card is off
     and so is the auto-run — but the rules stay with the door): once only (`intmap_demo_seen`), not on a phone
     (#R16: the heavy layers slowed the mobile start-up), and not over a thematic layer the reader already has on. */
  function _imStartDemo(force){
    if(!force){
      try{ if(localStorage.getItem('intmap_demo_seen')==='1') return; }catch(_){}
      try{ if(window.IntMapDevice.compact()) return; }catch(_){}
      /* (basic-display-not-layers) …a LAYER: the day & night and 3-D buildings rows are `.lyr-row`s too, and they are the
         map display, not layers (the manifest's `kind`) — so this asks the manifest instead of the row's class */
      if(Array.prototype.some.call(document.querySelectorAll('#layer-dropdown input[type=checkbox]:checked'),
        (cb)=>cb.classList.contains('geo-layer-cb') || (isLayer(cb.id) && !isDisplay(cb.id) && !!cb.closest('.lyr-row')))) return;
    }
    try{ localStorage.setItem('intmap_demo_seen','1'); }catch(_){}   /* a guide that has been opened has been seen — what × used to record */
    /* ⚠ the player only, by import(): a static import of js/tours.js pulled it and js/showcase.js into the start-up chunk (check:perf) */
    import('./tour-player.js').then((m)=>m.startGuide()).catch(()=>{});
  }
  window._imStartDemo=_imStartDemo;
}

export function progressCtl(HOST){
  /* (#R139) HONEST population-progress control shared by the measure/radius panel and the Draw tool. The bar it
     drives replaced a time-based ease-out that DECELERATED toward 92% and snapped to 100%
     ("100%に近づくほど遅くなる／グラフの意味を成さない"): every number it shows is measured.
     ══ ⚠⚠ (#R254) …AND IT WAS THE ONLY BAR IN THE APP WITH A UI OF ITS OWN ════════════════════════
     「進捗バーがおかしい。勝手にほかの進捗バーと違うUIにするな。」 MEASURED on the shipped build: this
     control's `busy()` put the fill into an `.indet` class — a 42%-wide accent band swept across the
     track by a CSS animation, with the percentage element EMPTIED. Every other progress bar in the
     app (js/seismic.js `sq-progb`, js/terrain-water.js `tw-prog-bar`, js/viewshed.js) is the same
     shape as each other and a different shape from this one: a plain `var(--prog-grad)` fill whose
     WIDTH is the fraction, with the number beside it.
     The reason it was different was real — a sub-cap WorldPop sum is ONE request and one request has
     no fraction — so the fix is upstream of the UI: js/sims.js now tiles EVERY area, which makes
     `done/total` a measured fraction for every sum there is. With a real fraction always available,
     the indeterminate mode has nothing left to represent: `busy()` is «started, nothing finished
     yet» = 0%, drawn exactly like the other bars, and the `.indet` CSS is gone. */
  window._imProgCtl=function(box){
    const fill=box&&box.querySelector('.tp-prog-fill'), pct=box&&box.querySelector('.tp-prog-pct');
    let shown=0;
    const put=(f)=>{ try{ if(fill) fill.style.width=(f*100).toFixed(0)+'%'; if(pct) pct.textContent=(f*100).toFixed(0)+'%'; }catch(_){} };
    return {
      busy(){ shown=0; put(0); },
      set(f){ f=Math.max(0,Math.min(1,+f||0)); if(f<shown) f=shown; shown=f; put(f); },
      done(){ shown=1; put(1); }
    };
  };
}
