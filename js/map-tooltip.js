/* ============================================================================
 *  IntMap * THE MAP HOVER TOOLTIP -- ensureMapTooltip / positionTooltip / setMapTooltipHTML  (#R311)
 * ----------------------------------------------------------------------------
 *  Moved out of js/app-body.js VERBATIM. Not one character of the geometry below was retyped:
 *  the clamps, the flip-below rule and the --tip-ax arrow offset are the #R175 text, and their
 *  comment came with them.
 *
 *  WHY IT LEFT THE SHELL. tests/r168 #8 budgets the app shell -- index.html + src/main.js +
 *  src/vendor.js + js/app-body.js + js/geo-engine.js -- at 8,200 lines, and #R195/#R196 set the
 *  rule that the ceiling follows the floor DOWN and is never raised to let a change through.
 *  This round made the hover path cheaper (a ResizeObserver instead of a forced layout on every
 *  pointer event, and a setter that does not rewrite identical markup) and that cost the shell
 *  46 lines. So the debt is paid the way #R195 paid it: the surface leaves whole.
 *
 *  It is ONE surface and it belongs together: every hover handler in the app -- news dots, news
 *  labels, the dashboard, the choropleths, NATO, the EU, the World-Bank layers, the alert units,
 *  the community pins, live aircraft -- reaches all three of these through `window`, and they share
 *  one element and one cached map size.
 *
 *  js/app-body.js keeps two-line forwarders so `HOST.ensureMapTooltip` / `HOST.positionTooltip` /
 *  `HOST.mapTooltipEl` answer exactly what they answered before (#R23's beta choropleths and the
 *  #R168/#R175 host invariants both read them).
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.mapTooltip=function(){
  let mapTooltipEl=null;

  function ensureMapTooltip(){
    if(mapTooltipEl) return mapTooltipEl;
    mapTooltipEl=document.createElement('div'); mapTooltipEl.className='map-tooltip';
    document.getElementById('map-container').appendChild(mapTooltipEl);
    return mapTooltipEl;
  }
  /* (#R175) 「Live air traffic のホバー時に出るポップアップは、画面外に出ないように。」
     The tooltip is drawn ABOVE its anchor — `transform: translate(-50%, calc(-100% - 18px))` — so the
     box the user actually sees runs from point.y − h − 18 down to point.y − 18. Every clamp before this
     round measured a box that STARTS at point.y, so the taller the tooltip the further off the top it
     hung: the live-aircraft card is ~300 px of ADS-B fields, and `Math.max(160, …)` put its top edge at
     160 − 300 − 18 = −158 px, i.e. the callsign, the aircraft type and the altitude were all above the
     window. The bottom clamp had the opposite sign error — `mc.height − h − 12` pushed a tall tooltip
     hundreds of pixels away from an aircraft near the bottom of the map, which is what made it read as
     "floating somewhere else".
     So: clamp the RENDERED box, flip it below the anchor when it cannot fit above (the arrow flips with
     it), and keep the arrow on the anchor after a horizontal clamp via --tip-ax. */
  const TIP_GAP=18, TIP_EDGE=8;
  /* ══ (#R311) THE MAP'S SIZE IS NOT A PROPERTY OF THE POINTER ════════════════════════════════════
     `positionTooltip` is called by EVERY hover handler in the app — news dots, news labels, the
     dashboard dots, the choropleths, NATO, the EU, the World-Bank layers, the alert units, the
     community pins, live aircraft — on every mousemove. It opened with
     `document.getElementById('map-container').getBoundingClientRect()`, and only `.width`/`.height`
     were ever read from it: a forced synchronous layout, sixty times a second, to re-learn a number
     that changes when the WINDOW changes and at no other time.
     A ResizeObserver is the exact instrument for that — it fires after layout when the box actually
     changes, so the measurement is taken once per resize instead of once per pointer event, and the
     read inside the callback is not a forced one. The element is re-looked-up whenever the observed
     node is gone, so a rebuilt container cannot leave a stale size behind.
     ⚠ NOTHING ABOUT THE PLACEMENT CHANGES. Same clamps, same flip-below rule, same arrow offset —
     see the note above, which is the geometry this round did not touch. */
  let _mcEl=null, _mcW=0, _mcH=0, _mcRO=null;
  function _mcSize(){
    const el=document.getElementById('map-container');
    if(!el) return {width:_mcW,height:_mcH};
    if(el!==_mcEl){
      _mcEl=el;
      try{ if(_mcRO) _mcRO.disconnect(); }catch(_){}
      const read=()=>{ try{ const r=_mcEl.getBoundingClientRect(); _mcW=r.width; _mcH=r.height; }catch(_){} };
      read();
      try{ _mcRO=new ResizeObserver(read); _mcRO.observe(_mcEl); }
      catch(_){ _mcRO=null; try{ window.addEventListener('resize',read); }catch(__){} }   /* no RO → fall back to the event */
    }
    return {width:_mcW,height:_mcH};
  }
  /* ══ ⚠⚠⚠ (#R499) …AND NEITHER IS THE TOOLTIP'S OWN SIZE ═══════════════════════════════════════
     #R311 took the MAP's size off the pointer's path and left the TOOLTIP's on it: `offsetWidth` and
     `offsetHeight`, twice per mousemove, on an element that is only ever a different size when its
     markup changed. On its own that is a cheap read — but the callers write `display:block` on the
     same element on the same line, and #R311's own note says why that matters: a style write
     invalidates layout even when it assigns the string that is already there, so every one of those
     reads was a FORCED synchronous layout, once per pointer event, for the whole of a hover.
     So the size is cached and invalidated by the only three things that can move it: new markup
     (setMapTooltipHTML, which already knows), the element becoming visible (showMapTooltip), and a
     ResizeObserver as the backstop for anything else — a font arriving, a theme changing a padding.
     ⚠ THE NUMBERS ARE THE SAME NUMBERS. Still `offsetWidth`/`offsetHeight` — not a DOMRect, whose
     fractional width would move every clamp below by a sub-pixel — and still the same `||280`/`||80`
     fallbacks for the frame before anything has been measured. */
  let _tw=0,_th=0,_tDirty=true,_tRO=null;
  function _tipSize(el){
    if(!_tRO){ try{ _tRO=new ResizeObserver(()=>{ _tDirty=true; }); _tRO.observe(el); }catch(_){ _tRO=true; } }
    if(_tDirty){ _tDirty=false; _tw=el.offsetWidth; _th=el.offsetHeight; }
    return {w:_tw,h:_th};
  }
  /* ⚠ (#R499) ONE PLACE THAT DECIDES WHETHER THE TOOLTIP IS SHOWN, for the same reason #R311 gave
     for the markup: thirty-seven sites across eight files wrote `el.style.display='block'` on every
     mousemove and `'none'` on every mouseleave, unconditionally. tests/r499-checks ③ is what keeps
     the thirty-eighth from being written, because #R498 measured what happens to an optimisation
     that is merely available: `setMapTooltipHTML` had ONE adopter out of eight files. */
  /* ⚠ the guard reads the INLINE declaration rather than a remembered copy: `el.style.display` is a
     CSSOM read and costs no layout, and a copy would go stale the moment anything else wrote it. */
  function showMapTooltip(el){ el=el||mapTooltipEl; if(!el) return el;
    if(el.style.display!=='block'){ el.style.display='block'; _tDirty=true; } return el; }
  function hideMapTooltip(el){ el=el||mapTooltipEl; if(!el) return el;
    if(el.style.display!=='none'){ el.style.display='none'; } return el; }
  function positionTooltip(point){
    const el=ensureMapTooltip();
    const mc=_mcSize();
    const _sz=_tipSize(el);
    const w=_sz.w||280, half=w/2, h=_sz.h||80;
    const px=(+point.x||0), py=(+point.y||0);
    const x=Math.max(half+TIP_EDGE, Math.min(Math.max(half+TIP_EDGE, mc.width-half-TIP_EDGE), px));
    /* above is the long-standing look and stays the default; below only when above cannot fit and below can */
    const below=(h+TIP_GAP>py-TIP_EDGE)&&(h+TIP_GAP<=mc.height-py-TIP_EDGE);
    el.classList.toggle('map-tooltip-below',below);
    let top=below?(py+TIP_GAP):(py-h-TIP_GAP);
    top=Math.max(TIP_EDGE,Math.min(mc.height-h-TIP_EDGE,top));   /* a tooltip taller than the map keeps its HEAD on screen */
    const y=below?(top-TIP_GAP):(top+h+TIP_GAP);
    /* (#R311) …and the three writes only happen when the value actually differs. A style write
       invalidates layout even when it assigns the string that was already there, so a pointer that
       moves within one pixel used to schedule a recalculation that could not change anything. */
    const ax=Math.max(12,Math.min(w-12,px-(x-half)));
    if(el._tipX!==x){ el._tipX=x; el.style.left=x+'px'; }
    if(el._tipY!==y){ el._tipY=y; el.style.top=y+'px'; }
    if(el._tipAx!==ax){ el._tipAx=ax; el.style.setProperty('--tip-ax',ax+'px'); }
  }
  /* ══ (#R311) ONE PLACE THAT DECIDES WHETHER THE TOOLTIP'S MARKUP CHANGED ════════════════════════
     Every hover handler in the app builds a string and assigns it to `.innerHTML` on each mousemove.
     While the pointer stays over the SAME feature — which is most of the time — that string is
     identical, and assigning it anyway destroys and rebuilds the subtree, invalidates layout, and
     makes the `offsetWidth`/`offsetHeight` read in positionTooltip a forced reflow. Comparing
     against the last string this helper wrote costs one string comparison and produces exactly the
     same DOM. Callers that pass different markup are unaffected — they write, as before. */
  function setMapTooltipHTML(el,html){
    if(!el) return el;
    if(el._tipHTML===html) return el;
    el._tipHTML=html; el.innerHTML=html; _tDirty=true;   /* (#R499) new markup is the one thing that changes the size */
    return el;
  }
  window.ensureMapTooltip=ensureMapTooltip; window.positionTooltip=positionTooltip;   /* (#R23) beta choropleths reuse the same hover tooltip as HDI */
  window.setMapTooltipHTML=setMapTooltipHTML;   /* (#R311) see above — used by the always-on hover handlers */
  window.showMapTooltip=showMapTooltip; window.hideMapTooltip=hideMapTooltip;   /* (#R499) the guarded display writes — see above */
  /* the element itself, for js/app-body.js's `HOST.mapTooltipEl` getter -- a live read, never a copy. */
  const API={ ensureMapTooltip, positionTooltip, setMapTooltipHTML, showMapTooltip, hideMapTooltip, element:()=>mapTooltipEl };
  try{ window.IntMapMapTooltip=API; }catch(_){ }
  return API;
};
