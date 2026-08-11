/* ============================================================================
 *  IntMap · names on top, and the markers the far side of the globe should hide  (#R200)
 * ----------------------------------------------------------------------------
 *  Two self-heals that share one idea — re-assert the truth on idle instead of chasing every
 *  site that could disturb it. Place names and borders are kept ABOVE every data layer (#R19), and on
 *  the globe the DOM markers standing on the hemisphere facing away from the camera are hidden, which
 *  no renderer does for you because they are HTML, not geometry.
 *
 *  Lifted verbatim out of js/app-body.js (#R200, second pass): 95 of its 99 lines are
 *  byte-identical. Three of the four that are not are #R165's rule — a closure value js/app-body.js
 *  REASSIGNS at runtime is read through IM_HOST's live accessor, never captured when this factory
 *  ran: currentProj → HOST.proj, and markersArray → HOST.markersArray (clearMarkers() REPLACES that
 *  array, so a captured copy would go on hiding markers that are no longer on the map). The fourth is
 *  the host's own name: `IM_HOST` inside the moved body is this factory's `HOST` parameter.
 *  Everything else arrives through CTX under its ORIGINAL name, which is what lets the body stay
 *  word-for-word what it was. A real ES module: no window.IntMapModules entry, no src/main.js order.
 * ==========================================================================*/
export function makeLabelOcclusion(HOST, CTX) {
  const GE=CTX.GE, isMobile=CTX.isMobile;
  /* ===== (#R19) Place names + borders ALWAYS above every data layer ("地名や国境はどのレイヤーよりも
     最前部に"). Overlays are added/re-added at arbitrary times (toggles, basemap swaps, styledata
     re-adds), so instead of chasing every add-site, re-assert the label/border stack on idle+styledata —
     the same self-heal pattern as the country-isolation mask. They are slotted just BELOW the measurement
     tool layers (your own drawings stay on top of everything). Guarded: only moves when actually out of
     place, so there's no repaint loop. */
  if(GE().hasRenderer()){ (function(){
    /* (#R72) 'geo-sea' moved ABOVE the city/other labels: symbol collision gives priority to the TOPMOST layer,
       so coastal city names were eating the sea names — a view framing the whole East China Sea showed harbour
       towns but not 東シナ海. Seas now lose only to country names. */
    /* (#R104) the era time-travel layers (imtb-*) are part of the label stack too, so the historical borders + era
       country names are guaranteed to sit ABOVE the raster base and data layers while travelling — the map's borders
       & names actually change ("年代を変更しても国境や国名が変化しない" root: era layers could be buried after a
       styledata/base swap once the old R94m moveLayer-to-top was removed to stop a flicker loop). inPlace() already
       guards against thrashing, so this cannot re-introduce the loop. imtb layers only exist while travelling. */
    /* (#R198) 'ofm-admin1' (states / provinces / prefectures) enters the stack BELOW ofm-city, which by the
       rule stated just above means a city name wins the collision against the region containing it. It sits
       above the peaks for the same reason in the other direction. This list is what decides that — the order
       these layers are ADDED in is transient, because raise() re-asserts this one on idle and styledata. */
    const STACK=['layer-sat-labels','borders-only-line','ofm-river','ofm-water','ofm-water2','ofm-peak','ofm-admin1','ofm-city','ofm-other','geo-sea','imtb-line','ofm-country','imtb-lbl2','imtb-lbl'];
    /* (#R25) "own" overlays — the user's active drawings / measurements / analysis + the isolation mask +
       the place highlight — legitimately sit ABOVE the labels. Everything else is a DATA layer that the
       user wants BENEATH the place-name/border labels ("地名や国境はどのレイヤーよりも最前部に"). */
    /* (#R37) News pins/bands + the user pin + community pins are ANNOTATIONS, not data layers — they belong
       ABOVE the place-name labels ("地名ラベルは、ニュースピンの帯よりも後ろに表示して。いまは帯が地名ラベルに
       さえぎられてしまっている"). Adding them here keeps the bands fully visible over labels instead of being
       clipped by them, while real DATA layers (choropleths, rasters) still sit beneath the labels. */
    const isOwn=(id)=>/^(tool|draw|los|route|place-hl|news|dash|user-pin|comm)-/.test(id)||id==='iso-mask';
    /* (#R25) ROOT CAUSE labels kept getting buried by land-cover/relief/etc.: the old top-scan declared
       "in place" the instant the first non-tool layer from the top was ANY one label layer — so once the
       label stack was SPLIT (one label on top, the others under a freshly-added raster) it stopped
       re-raising. Now require EVERY label layer to sit above EVERY data layer. */
    function inPlace(){ try{ const ls=GE().scene.getStyle().layers.map(l=>l.id);
      let lowestStack=Infinity, highestData=-1;
      ls.forEach((id,i)=>{ if(STACK.includes(id)){ if(i<lowestStack) lowestStack=i; } else if(!isOwn(id)){ if(i>highestData) highestData=i; } });
      if(lowestStack===Infinity) return true;     /* no labels present yet */
      return lowestStack>highestData;             /* all labels above all data → nothing to do */
    }catch(_){ return true; } }
    /* (#R26) ROOT CAUSE the labels STAYED buried: the old raise moved labels to just-below `tool-poly`, but a
       raster added with NO beforeId (or above tool-poly) then sat ABOVE the labels — and re-raising kept
       putting them below it (and could thrash). Now: move the labels to the ABSOLUTE TOP, THEN lift the
       user's own overlays (tools/drawings/mask) back above the labels in their existing order. Result:
       data BELOW labels BELOW your own drawings — labels are visible over EVERY data layer, every time. */
    function raise(){ try{ if(inPlace()) return;
      STACK.forEach(id=>{ if(GE().layers.has(id)) try{ GE().layers.move(id); }catch(_){} });   /* labels → top */
      const ls=GE().scene.getStyle().layers.map(l=>l.id);
      ls.forEach(id=>{ if(isOwn(id) && GE().layers.has(id)) try{ GE().layers.move(id); }catch(_){} });   /* own overlays back above labels */
    }catch(_){} }
    window._raiseLabelLayers=raise;
    let t=null; const sched=()=>{ clearTimeout(t); t=setTimeout(raise,140); };
    GE().events.on('idle',sched); GE().events.on('styledata',sched);
  })(); }

  /* (#R21) Mobile memory-pressure guard: Chrome-on-Android exposes performance.memory; when the JS
     heap nears its limit we proactively drop the big REBUILDABLE caches before the OS kills the tab
     ("重い動作をすると頻繁にブラウザが落ちます") — display quality is untouched, everything lazily
     reloads on next use. No-op where the API doesn't exist (iOS Safari). */
  (function(){
    if(!(typeof isMobile==='function'&&isMobile())) return;
    const frac=()=>{ try{ const m=performance.memory; return m?m.usedJSHeapSize/m.jsHeapSizeLimit:0; }catch(_){ return 0; } };
    let hot=0;
    setInterval(()=>{ const f=frac(); if(!f) return;
      if(f>0.85){ if(++hot<2) return; hot=0;
        try{ const cb=document.getElementById('dl-climate'); if(!cb||!cb.checked){
          window._koppenImg=null; window._koppenCanvas=null; window._koppenReady=false; window._koppenLoadStarted=false;
          window._koppenCodeIdx=null; window._koppenSrcData=null; window._koppenFull=null; } }catch(_){}
        try{ window.dispatchEvent(new Event('intmap-mem-pressure')); }catch(_){}
      } else hot=0;
    },8000);
  })();

  /* ══ (#R196) MOVED TO js/tile-warm.js ═════════════════════════════════════════════
     110 lines: the service-worker tile cache and the predictive prefetch, including the memo this
     round added after measuring 865 Esri requests for 112 distinct tiles in one six-second phone pan.
     It is called from HERE, at the point the code used to occupy, because it registers `moveend` and
     `move` handlers and their order relative to the rest of this file's handlers is observable.
     ⚠ The five values it needs (mapType, satState, satProviderById, satBuildTiles, isMobile) are
     handed over through HOST rather than closed over — see scripts/check-split-scope.mjs. */
  try{ window.IntMapModules.tileWarm(HOST); }catch(_){}
  /* (#R202) …and beside it, the gesture-time render resolution (js/render-scale.js). Same reason for
     the placement: it registers movestart/moveend handlers, and it is a no-op on desktop. */
  try{ const RS=window.IntMapModules.renderScale(HOST); RS&&RS.start&&RS.start(); }catch(_){}
  /* (#R221) …and beside THAT, the gesture-time frosted glass (js/glass-motion.js), for exactly the
     same three reasons: it registers movestart/moveend handlers, it is a no-op on desktop, and the
     order of those handlers relative to this file's is observable. It measured more expensive than
     the render scale did — fifteen backdrop-filters over 153 % of a phone viewport, none of them
     cacheable while the camera moves. */
  try{ window.IntMapModules.glassMotion(HOST); }catch(_){}
  /* (#R202) …and the far plane that was cutting distant mountains off at a tenth of the horizon.
     Switched on once for the life of the view: the adapter re-evaluates it on movement and leaves
     the renderer's own number alone at pitches where the horizon is not what is binding. */
  try{ GE().camera.setHorizonReach(true); }catch(_){}

  function angDist(lo1,la1,lo2,la2){ const r=Math.PI/180; const a=Math.sin(la1*r)*Math.sin(la2*r)+Math.cos(la1*r)*Math.cos(la2*r)*Math.cos((lo2-lo1)*r); return Math.acos(Math.max(-1,Math.min(1,a)))/r; }
  let _occAllVis=false;
  function updateOcclusion(){
    if(!GE().hasRenderer()) return;
    /* Flat map: every marker is visible. Do the bulk write ONCE (guarded) instead of on every pan
       frame — redundant style writes were a needless per-move cost on phones (#3). */
    if(HOST.proj!=='globe'){ if(!_occAllVis){ HOST.markersArray.forEach(m=>m.getElement().style.visibility='visible'); _occAllVis=true; } return; }
    _occAllVis=false;
    /* Globe: hide markers on the far hemisphere. Use a unit-vector DOT PRODUCT (no per-marker acos)
       and only touch the DOM when a marker's visibility actually flips — this removes the layout
       thrash that made globe pan/zoom stutter on mobile (#3). */
    const c=GE().camera.getCenter(), r=Math.PI/180, cla=c.lat*r, clo=c.lng*r;
    const cx=Math.cos(cla)*Math.cos(clo), cy=Math.cos(cla)*Math.sin(clo), cz=Math.sin(cla);
    const TH=Math.cos(88*r);   /* dot >= TH ⇒ within ~88° of center ⇒ on the near side */
    HOST.markersArray.forEach(m=>{ const ll=m.getLngLat(), la=ll.lat*r, lo=ll.lng*r, cla2=Math.cos(la);
      const dot=cla2*Math.cos(lo)*cx + cla2*Math.sin(lo)*cy + Math.sin(la)*cz;
      const el=m.getElement(), vis=dot>TH?'visible':'hidden'; if(el.style.visibility!==vis) el.style.visibility=vis; });
  }

  return { updateOcclusion };
}
