/* ============================================================================
 *  IntMap · Mobile UI & responsive layout chrome  (#R167)
 * ----------------------------------------------------------------------------
 *  initMobileUI() — the phone shell: the one bottom sheet (four detents, a spring, its screens), the control
 *  group, the legend tray and the mobile tab bar — plus the three responsive-layout blocks that follow it
 *  (map-search reflow, sidebar width, device class). The sheet's arithmetic, the spring, the screens and
 *  the tray live in js/mobile-sheet.js; this file wires them to the page.
 *  initMobileUI is RETURNED rather than instantiated: index.html still calls it by name at the
 *  end of boot, so the factory only has to hand the function back.
 * ==========================================================================*/

import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { detentHeights, settleDetent, spring, detentFor, MAP_ANSWER_EVENT, makeScreens, makeLegendTray } from './mobile-sheet.js';
import { BootStage } from './boot-stage.js';
import * as bus from './bus.js';


export function mobileUI(HOST){
  /* (#R172) CAMERA + EVENTS THROUGH IntMapGeoEngine — this module no longer names the renderer.
     Everything it did to the map was camera work: read the bearing/pitch for the compass, pad the view
     for the bottom sheet, cancel an in-flight ease when the finger grabs it again, and resize. */
  const _GE=()=>IntMapGeoEngine;
  const _cam=()=>{ try{ const E=_GE(); return (E&&E.camera)?E.camera:null; }catch(_){ return null; } };
  /* =====================================================================
   *  iOS-native mobile UI controller (mobile-shell: rebuilt as the map-app pattern).
   *  Only active at <=768px; desktop layout is left completely untouched.
   *  Owns: the bottom sheet and its head (the one search field + Chronos), the screens lent into it
   *  (Layers, Tools, Map, Chronos, Settings), the control group, the legend tray and the auto compass.
   * ===================================================================== */
  function initMobileUI(){
    const mq=window.matchMedia(window.IntMapDevice.COMPACT);
    const sidebar=document.getElementById('sidebar');
    const mapContainer=document.getElementById('map-container');
    if(!sidebar) return;
    const RT=()=>window.IntMapRuntime;
    const frame=(key,fn)=>{ const R=RT(); if(R&&R.frame) R.frame(key,fn); else requestAnimationFrame(fn); };

    /* ---- node relocation (keeps handlers + state across orientation flips) ---- */
    function rememberHome(node){ if(node && !node.__home && node.parentNode){ const ph=document.createComment('home'); node.parentNode.insertBefore(ph,node); node.__home=ph; } }
    function moveTo(node,target){ if(node && target){ rememberHome(node); target.appendChild(node); } }
    function restoreHome(node){ if(node && node.__home && node.__home.parentNode){ node.__home.parentNode.insertBefore(node,node.__home); } }
    const layerDropdown=document.getElementById('layer-dropdown');
    const satController=document.getElementById('sat-controller');
    const moMountLayers=document.getElementById('mo-mount-layers');
    /* (mobile-shell) the head of the sheet: the place search and the readout are LENT into it on a phone */
    const mSearch=document.getElementById('map-search'), mSearchSlot=document.getElementById('m-search-slot');
    const mReadout=document.getElementById('coord-readout'), mReadoutSlot=document.getElementById('m-readout-slot');
    const mHead=document.getElementById('m-head');
    /* ⚠ (mobile-shell) WHERE THE SHEET'S COVER IS WRITTEN. `--sheet-cover` was written on #map-container only, and
       the map credit is NOT inside it (it is #map-container's sibling in .map-column since #R485) — so on a phone
       the credit read the stylesheet's fixed `--peek-h` fallback and sat 196 px up whatever the sheet did. It is
       written on the column too, so everything above the sheet follows the same number; #map-container keeps its
       inline copy because js/mobile-map-input.js reads it from there as a CSSOM string. */
    const coverHosts=[mapContainer, mapContainer&&mapContainer.parentElement].filter(Boolean);
    const setCover=(px)=>{ for(const h of coverHosts) h.style.setProperty('--sheet-cover', px+'px'); };
    /* (mobile-card-reach) the data credit sits just above the sheet, and its height is not fixed (the attribution grows
       to two lines as layers are switched on). A card the map holds ends above it, so the height is MEASURED, here, and
       written beside --sheet-cover; css/intmap.css `#map-container > .country-popup` reads it. */
    try{ const credit=document.getElementById('map-credit');
      if(credit && window.ResizeObserver) new ResizeObserver(()=>{ const h=credit.checkVisibility&&!credit.checkVisibility()?0:Math.round(credit.getBoundingClientRect().height);
        for(const host of coverHosts) host.style.setProperty('--m-credit-h',(h>0?h:23)+'px'); }).observe(credit); }catch(_){}

    /* ══ (mobile-shell) LAYERS / TOOLS / MAP / CHRONOS / SETTINGS ARE SCREENS OF THE ONE SHEET ═══════════════
       They were separate overlays — #mo-sheet and #tools-sheet slid up over a full-viewport scrim, the base-map
       square opened its own popover, Chronos floated over the map and Settings was a modal. Now each is lent
       into #m-screens while its OWNER says it is open (js/mobile-sheet.js makeScreens), so the reader stays in
       one sheet whose height they control, and the map above it stays visible and live.
       ⚠ The two option sheets keep their own open state (`.show`), their own Done, their own data-proxy
       buttons and their own dialog registration — what changed is only where they are drawn. */
    const moSheet=document.getElementById('mo-sheet');
    const toolsSheet=document.getElementById('tools-sheet');
    const fabMap=document.getElementById('m-fab-map');
    const fabTools=document.getElementById('m-fab-tools');
    const fabBase=document.getElementById('m-fab-base');
    let openSheetEl=null;
    function openSheet(el){ if(!el) return; if(openSheetEl && openSheetEl!==el) openSheetEl.classList.remove('show'); openSheetEl=el; syncControls(); el.classList.add('show');
      /* (#R18) The Layers list inside the Map sheet must never carry desktop collapse state. */
      if(el===moSheet){ try{ window._expandAllLayerGroups&&window._expandAllLayerGroups(); }catch(_){}
        /* (#R232) …and the tile grid re-reads the row set on every open, because rows are still being
           built for ~1.5 s after boot (eco / l9 / beta) and because Atlas or a legend may have toggled
           something while the sheet was shut. mountInto() is idempotent and only rebuilds on a change. */
        try{ window.IntMapLayerSidebar&&window.IntMapLayerSidebar.mountInto&&window.IntMapLayerSidebar.mountInto(moMountLayers); }catch(_){} } }
    function closeSheet(){ if(openSheetEl){ openSheetEl.classList.remove('show'); openSheetEl=null; } }
    /* (a11y-shared-dialog) both sheets already say role=dialog aria-modal — now they keep it: Escape closes, Tab stays in.
       Open is the .show class; focus is not moved on a phone. */
    [moSheet,toolsSheet].forEach(sh=>{ if(sh) window.IntMapDialog.adopt(sh,{ close:closeSheet, isOpen:()=>sh.classList.contains('show'), focus:false }); });
    const moDone=document.getElementById('mo-done'); if(moDone) moDone.addEventListener('click',closeSheet);
    const toolsDone=document.getElementById('tools-done'); if(toolsDone) toolsDone.addEventListener('click',closeSheet);
    if(fabMap) fabMap.addEventListener('click',()=>{ openSheetEl===moSheet?closeSheet():openSheet(moSheet); });
    if(fabTools) fabTools.addEventListener('click',()=>{ openSheetEl===toolsSheet?closeSheet():openSheet(toolsSheet); });
    if(fabBase) fabBase.addEventListener('click',()=>{ try{ const B=window.IntMapBasemapSwitch; if(B) B.toggle(); }catch(_){} });

    /* ---- proxy buttons drive the real (hidden) desktop controls ---- */
    /* (#R231) `#bm-pop` joins the two sheets: the base-map / projection segments live in the Map screen
       (js/basemap-switch.js) and they are the SAME [data-proxy] buttons, so they must be relabelled and
       mirrored by the same pass. A selector that still named only the two sheets would have left
       "Globe/Flat/Satellite" in English on a Japanese phone — the #R8 defect this function was written to fix. */
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
      /* (#R139) the Layers button is accent-coloured ONLY when a thematic layer is selected.
         `_imActiveLayerCount` is published by _refreshActiveLayers on every change. */
      if(fabMap) fabMap.classList.toggle('on', (window._imActiveLayerCount||0)>0);
      if(fabTools) fabTools.classList.toggle('on', !!HOST.toolMode || HOST.isGridOn);
      /* (#R231) the Map screen's own headings are not [data-proxy] labels — they are its own words — so they
         are re-read here, where every other mobile label is. */
      try{ const B=window.IntMapBasemapSwitch; if(B){ B.relabel(); B.redraw(); } }catch(_){ }
    }
    /* (#R231) THE LANGUAGE BUTTONS COME FROM THE REGISTRY, NOT FROM A LIST WRITTEN HERE — js/lang-registry.js
       knows every code, so a sixth and seventh language relabel the proxies without anyone remembering them. */
    (IntMapLang ? IntMapLang.codes() : ['en','jp','de','ru','es'])
      .forEach(code=>{ const b=document.getElementById('lang-'+code); if(b) b.addEventListener('click',()=>setTimeout(syncControls,40)); });
    /* (#R8 JP/EN) updateI18n() calls this after it relabels the desktop controls the proxies copy from. */
    window._imSyncMobile=syncControls;

    /* ---- compass: exists only while the map is rotated/tilted ---- */
    const fabCompass=document.getElementById('m-fab-compass');
    const compassSvg=fabCompass?fabCompass.querySelector('.m-compass-svg'):null;
    if(fabCompass) fabCompass.addEventListener('click',()=>{ const r=document.getElementById('btn-compass'); if(r) r.click(); });
    function updateCompass(){ if(!_cam()||!fabCompass) return; let b=0,p=0; try{ b=_cam().getBearing()||0; p=_cam().getPitch()||0; }catch(_){}
      fabCompass.classList.toggle('show', Math.abs(b)>1 || p>1); if(compassSvg) compassSvg.style.transform='rotate('+(-b)+'deg)'; }
    try{ const E=_GE(); if(E){ E.events.on('rotate',updateCompass); E.events.on('pitch',updateCompass); E.events.on('moveend',updateCompass); } }catch(_){}

    /* ---- (#R137) locate: fly to my location + show the accent dot / accuracy circle (they follow me) ---- */
    { const fabLoc=document.getElementById('m-fab-locate');
      if(fabLoc) fabLoc.addEventListener('click',()=>{ try{ window.IntMapLocate&&window.IntMapLocate.toggleOrRecenter(); }catch(_){} }); }

    /* ---- (mobile-shell) Chronos is entered from the sheet's head ---- */
    const tl=document.getElementById('news-timeline'), clock=document.getElementById('m-clock');
    if(clock && tl){
      clock.addEventListener('click',()=>{ const tg=document.getElementById('ntl-toggle'); if(tg) tg.click(); });
      /* the clock says what the collapsed Chronos button says: accent while the map shows another time, and
         its accessible name is that button's own two lines (js/news-timeline.js writes them) */
      const mirror=()=>{ clock.classList.toggle('on', tl.classList.contains('active'));
        const t=document.getElementById('ntl-open-t'), s=document.getElementById('ntl-open-s');
        const name=[t&&t.textContent,s&&s.textContent].filter(Boolean).join(' — ');
        if(name && clock.getAttribute('aria-label')!==name){ clock.setAttribute('aria-label',name); clock.title=name; } };
      try{ new MutationObserver(mirror).observe(tl,{attributes:true,attributeFilter:['class']}); const so=document.getElementById('ntl-open-s'); if(so) new MutationObserver(mirror).observe(so,{childList:true,characterData:true,subtree:true}); }catch(_){}
      mirror();
    }

    /* ══ (mobile-heavy-work) THE LAYER GRID, BUILT WHEN IT IS NEEDED ═══════════════════════════════════
       Asked for by the reader: openSheet() mounts it (that path never waits). Not asked for yet: built ONCE,
       as a settled job (js/boot-stage.js — one job per idle period, after the deferred reads), no sooner
       than GRID_PREBUILD_AFTER_MS after the launch screen lifted.
       ⚠ GRID_PREBUILD_AFTER_MS: OBSERVED, the first seconds after the launch screen lifts are where the
       deferred reads land and where the reader's first touches are (tests/perf-phone-ledger.json measures
       that window as `afterReady3s`); the grid is a 0.2–0.4 s build on a phone at CPU ×4, so it must not be
       one more thing in that window. EXPIRES IF the build becomes cheap enough to run inside a frame, or the
       ledger's window changes. A desktop (no sheet) never reaches this. */
    const GRID_PREBUILD_AFTER_MS=3000;
    let _gridAsked=false;
    function prebuildGrid(){
      if(_gridAsked) return; _gridAsked=true;
      const build=()=>{ try{ if(mq.matches&&window.IntMapLayerSidebar&&window.IntMapLayerSidebar.mountInto) window.IntMapLayerSidebar.mountInto(moMountLayers); }catch(_){} };
      const S=BootStage;
      if(!S||typeof S.interactive!=='function'){ build(); return; }   /* no stage table → the old order */
      S.interactive().then(()=>setTimeout(()=>{
        /* the job runs at its turn; requestIdleCallback puts the build itself in an idle period */
        S.whenStage('settled',()=>new Promise((res)=>{ const go=()=>{ build(); res(); };
          try{ if(typeof requestIdleCallback==='function'){ requestIdleCallback(go,{timeout:S.SETTLE_CEILING_MS||6000}); return; } }catch(_){}
          setTimeout(go,0); }));
      },GRID_PREBUILD_AFTER_MS));
    }
    /* ---- responsive: relocate config panels in/out of the sheets ---- */
    function applyLayout(isM){
      /* ══ ⚠ (#R235) 「モバイル版のレイヤー選択欄は、デスクトップ版とおなじUIに。下部の比較ビューや
             衛星画像プロバイダ等のやつはなくていい。」 — the desktop layer sidebar is search + tiles + the
         Active-layers bar, so the phone's is too. ⚠ `#sat-controller` IS NOT REACHABLE ON A PHONE (the
         instruction 「なくていい」); nothing is deleted — widening the window brings it straight back. */
      if(isM){ moveTo(layerDropdown,moMountLayers);
        /* Mobile shows every layer group expanded (the carets are hidden there, #12). */
        try{ layerDropdown.querySelectorAll('.layer-group-title,.lyr-head,.premium-group-title').forEach(h=>{ h.classList.remove('lyr-collapsed'); let el=h.nextElementSibling; while(el && !el.matches('.layer-group-title,.lyr-head,.premium-group-title') && el.tagName!=='HR'){ if(el.style) el.style.display=''; el=el.nextElementSibling; } }); }catch(_){}
        /* (#R28) every group (incl. Others(beta)) shows fully expanded on mobile — no pulldown. */
        try{ window._expandAllLayerGroups&&window._expandAllLayerGroups(); }catch(_){}
        /* (#R232) the classic dropdown stays mounted here as the CHECKBOX STORE — every tile toggles a real
           checkbox in it — and the tile grid is the phone's UI (`body.m-lyr-tiles` hides the rows).
           ⚠ (mobile-heavy-work) THE GRID IS NOT BUILT HERE ANY MORE. This line built it at boot, inside the
           DOMContentLoaded handler, for a sheet nobody had opened — MEASURED (390×844, CPU ×4) 196 ms of script
           plus the forced layouts it triggered (the desktop sidebar's own build and the tools strip asking
           every host for its rects), the largest single item of the boot handler. openSheet() mounts it on
           every open (idempotent), and `prebuildGrid` builds it once in an idle period after the app has been
           usable for a while, so the first pull-up finds it ready. */
        document.body.classList.add('m-lyr-tiles'); prebuildGrid();
        /* (mobile-shell) the search field and the readout belong to the sheet's head on a phone */
        moveTo(mSearch,mSearchSlot); moveTo(mReadout,mReadoutSlot);
      }
      else{ restoreHome(layerDropdown); restoreHome(satController); restoreHome(mSearch); restoreHome(mReadout); closeSheet(); document.body.classList.remove('sheet-full','sheet-min','sheet-hidden');
        /* ⚠ restoreHome(satController) STAYS: a session that was narrow when #R234 shipped may still
           have the element parked in #mo-mount-sat, and widening has to bring it back either way. */
        try{ window.IntMapLayerSidebar&&window.IntMapLayerSidebar.unmountFrom&&window.IntMapLayerSidebar.unmountFrom(moMountLayers); }catch(_){}
        document.body.classList.remove('m-lyr-tiles');
        try{ legendTray&&legendTray.close(); }catch(_){}
        sidebar.style.removeProperty('--sheet-hide'); }
      try{ window._placeActiveSection&&window._placeActiveSection(); }catch(_){}   /* (#R34) re-home the Active-layers bar for the new layout */
      try{ screens&&screens.syncAll(); }catch(_){}
    }

    /* =================== THE BOTTOM SHEET =================== */
    /* (mobile-shell) FOUR resting heights — `hidden` (the grip), `min` (the search row), `half`, `full` — and a
       spring on release (js/mobile-sheet.js). The names other modules have always passed still work:
       'peek' was the lowest stop the reader used and is `min` now; 'mini' was the stop below it. */
    const ALIAS={ peek:'min', mini:'hidden' };
    const RANK={ hidden:0, min:1, half:2, full:3 };
    let currentDetent='min';
    /* where the sheet was when the search field raised it — the field's raise is transient, the reader's is not */
    let fieldBefore=null;
    /* (mobile-shell-flow) every «what is the reader doing» signal lands here; js/mobile-sheet.js detentFor decides */
    function go(activity){ const want=detentFor(activity,{current:currentDetent, before:fieldBefore});
      if(activity!=='type') fieldBefore=null;
      if(want!==currentDetent) setDetent(want); }
    let _safeProbe=null;
    function safeBottom(){ try{ if(!_safeProbe){ _safeProbe=document.createElement('div'); _safeProbe.style.cssText='position:fixed;left:0;bottom:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:var(--safe-bottom)'; document.body.appendChild(_safeProbe); }
      return parseFloat(getComputedStyle(_safeProbe).paddingBottom)||0; }catch(_){ return 0; } }
    function recompute(){
      /* (#R240) the sheet's height has one owner in the stylesheet (`--sheet-h`); this is the only guess */
      const H=sidebar.offsetHeight||Math.round(window.innerHeight*0.86);
      const headH=(mHead && mHead.offsetParent!==null)? mHead.offsetTop+mHead.offsetHeight : 64;
      const h=detentHeights({ H, vh:window.innerHeight, headH, safeBottom:safeBottom() });
      if(mapContainer) mapContainer.style.setProperty('--peek-h',h.min+'px');
      return { H, h, ty:(n)=>Math.max(0,H-h[n]) };
    }
    /* How much of the map the sheet covers at translate `ty` — what the camera padding and --sheet-cover
       follow. ONE formula for the settled detent and the live drag.
       ⚠ (share-embed-distribution) An EMBED draws no sheet (js/ui-device.js embedded() is the one answer), so it
       covers nothing. */
    function sheetCovers(d,ty){ if(!mq.matches||window.IntMapDevice.embedded()) return 0; return Math.min(Math.max(0,d.H-ty), Math.round(window.innerHeight*0.82)); }
    const _reduceMotion=()=>{ try{ return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(_){ return false; } };
    const _cssLinear=(()=>{ try{ return CSS.supports('transition-timing-function','linear(0, 1)'); }catch(_){ return false; } })();
    function setDetent(name,animate,v0){
      if(animate===undefined) animate=true;
      name=ALIAS[name]||name; if(!(name in RANK)) name='half';
      const d=recompute(); currentDetent=name;
      const ty=d.ty(name);
      /* the spring this release rides: the finger's velocity at release is its initial velocity, so a
         hard flick arrives faster than a gentle let-go (the motion UIKit gives a sheet) */
      let sp=null;
      if(animate && !_reduceMotion()){ sp=spring(v0||0);
        sidebar.style.setProperty('--sheet-dur',sp.duration.toFixed(3)+'s');
        sidebar.style.setProperty('--sheet-curve',_cssLinear?sp.css:'var(--sheet-ease)'); }
      if(!animate) sidebar.classList.add('sheet-dragging');
      sidebar.style.setProperty('--sheet-ty',ty+'px');
      /* the content ends where the screen ends: everything below the fold is padding, so a feed scrolls to
         its last row and Atlas's composer sits on the screen at `half` (written once per settle, never per frame) */
      sidebar.style.setProperty('--sheet-hide',ty+'px');
      if(!animate){ void sidebar.offsetHeight; sidebar.classList.remove('sheet-dragging'); }
      const b=document.body.classList;
      b.toggle('sheet-full', name==='full'); b.toggle('sheet-min', name==='min'); b.toggle('sheet-hidden', name==='hidden');
      /* keep the map's optical centre inside the area visible ABOVE the sheet — ONLY on a phone (#R13) */
      const covered=sheetCovers(d,ty);
      /* --sheet-cover tracks how much the sheet covers, so the floating controls and the legend tray sit just
         above the sheet's CURRENT top at every detent (#32) */
      setCover(covered);
      /* (#R140) the camera's padding glides on the SAME curve and duration as the sheet — easeTo({padding}) is the
         animated form (setPadding is instantaneous). (#R142) a queued live-drag setPadding would abort it. */
      const _pad={top:0,left:0,right:0,bottom:covered};
      if(_padRAF){ try{ cancelAnimationFrame(_padRAF); }catch(_){} _padRAF=0; } _lastPad=_padPending=covered;
      camPad(_pad,sp);
    }
    window.__setDetent=setDetent;
    /* ══ (mobile-shell-flow) THE SHEET'S OWN CAMERA WRITES ARE MARKED, AND THEY WAIT FOR THE APP'S FLIGHT ══════════
       Two facts the detent rule needs. ① A camera move the SHEET starts (its padding) is not an answer, so it is
       counted while it is being issued (MapLibre fires movestart inside easeTo/setPadding, synchronously).
       ② While the app is flying somewhere (a picked place, an Atlas fit), easing the padding would CANCEL that
       flight — an easeTo stops the animation in progress — so the sheet moves now and the camera's padding
       follows when the flight lands: the place then glides into the middle of the map the sheet left visible. */
    let _selfCam=0, _appMoving=false, _padLater=null;
    function camPad(pad,sp){ const C=_cam(); if(!C) return;
      if(_appMoving){ _padLater={pad,sp}; return; }
      _selfCam++;
      try{ if(sp) C.easeTo({padding:pad, duration:Math.round(sp.duration*1000), easing:sp.ease}); else C.setPadding(pad); }catch(_){}
      finally{ _selfCam--; } }

    let dragging=false,startY=0,startTy=0,lastY=0,lastT=0,vel=0,maxTy=0,dragD=null,_padRAF=0,_lastPad=-1,_padPending=-1;
    /* Keep the map's optical centre inside the area visible ABOVE the sheet, live. (#R12) setPadding reprojects
       the whole camera, so it is one call per frame with the NEWEST value (#R140); --sheet-cover tracks every move. */
    function liveMapPad(ty,d){ d=d||dragD||recompute();
      const covered=sheetCovers(d,ty);
      setCover(covered);
      if(!_cam()) return;
      _padPending=covered;
      if(_padRAF) return; _padRAF=requestAnimationFrame(()=>{ _padRAF=0; if(_padPending===_lastPad) return; _lastPad=_padPending; _selfCam++; try{ const C=_cam(); if(C) C.setPadding({top:0,left:0,right:0,bottom:_padPending}); }catch(_){} finally{ _selfCam--; } }); }
    function curTy(){ return parseFloat(sidebar.style.getPropertyValue('--sheet-ty'))||0; }
    function dragStart(y){ try{ const C=_cam(); if(C) C.stop(); }catch(_){}   /* (#R140) a re-grab mid-animation hands control straight back to the finger */
      dragD=recompute(); maxTy=dragD.ty('hidden'); dragging=true; startY=y;
      /* the sheet is where it is DRAWN — mid-spring that is not its target, so read the transform, not the variable */
      let t=curTy(); try{ const m=/matrix(?:3d)?\(([^)]+)\)/.exec(getComputedStyle(sidebar).transform||''); if(m){ const v=m[1].split(',').map(Number); const y=v.length===16?v[13]:v[5]; if(isFinite(y)) t=y; } }catch(_){}
      startTy=t; lastY=y; lastT=performance.now(); vel=0; _lastPad=-1; _padPending=-1;
      sidebar.classList.add('sheet-dragging'); sidebar.style.setProperty('--sheet-ty',t+'px'); }
    /* past `full` the sheet follows a third of the finger — the rubber band that says «this is the top» */
    function dragMove(y){ if(!dragging) return; let ty=startTy+(y-startY); if(ty<0) ty=ty/3; ty=Math.min(maxTy,ty);
      sidebar.style.setProperty('--sheet-ty',ty+'px'); liveMapPad(Math.max(0,ty),dragD); const now=performance.now(),dt=now-lastT; if(dt>0) vel=0.6*((y-lastY)/dt)+0.4*vel; lastY=y; lastT=now; }
    function dragEnd(){ if(!dragging) return; dragging=false; sidebar.classList.remove('sheet-dragging'); const d=recompute(); const ty=curTy();
      if(performance.now()-lastT>80) vel=0;   /* the finger stopped before it lifted: that is a placement, not a flick */
      const target=settleDetent(d.H-Math.max(0,ty), vel, d.h);
      const dist=d.ty(target)-ty;
      setDetent(target,true, Math.abs(dist)>1 ? (vel*1000*Math.sign(dist))/Math.abs(dist) : 0);
    }
    /* ══ (mobile-shell) THE WHOLE HEAD IS THE HANDLE, NOT A 48 px GRIP ═══════════════════════════════════════
       The grip, the search row, the title row and the tab row are one handle: a vertical stroke on any of them
       moves the sheet, and a tap on a control in them is still a tap (the stroke has to travel 7 px, more up or
       down than sideways, before it becomes a drag; the click that follows a drag is swallowed). */
    function grabbable(zone){ if(!zone) return; let armed=false,on=false,sy=0,sx=0,pid=null;
      zone.addEventListener('pointerdown',e=>{ if(!mq.matches||(e.button||0)>0||dragging) return; armed=true; on=false; sy=e.clientY; sx=e.clientX; pid=e.pointerId; });
      zone.addEventListener('pointermove',e=>{ if(!armed||e.pointerId!==pid) return;
        if(!on){ const dy=e.clientY-sy, dx=e.clientX-sx; if(Math.abs(dy)<7||Math.abs(dx)>Math.abs(dy)) return;
          on=true; try{ zone.setPointerCapture(pid); }catch(_){} dragStart(sy); }
        dragMove(e.clientY); });
      const end=()=>{ if(!armed) return; armed=false; if(!on) return; on=false; dragEnd();
        const swallow=(ev)=>{ ev.stopPropagation(); ev.preventDefault(); }; window.addEventListener('click',swallow,true); setTimeout(()=>window.removeEventListener('click',swallow,true),60); };
      zone.addEventListener('pointerup',end); zone.addEventListener('pointercancel',end); }
    [mHead, sidebar.querySelector('.header-area'), sidebar.querySelector('.control-panel')].forEach(grabbable);
    /* a TAP on the grip steps the sheet: up from the bottom two stops, down from the top two */
    const grip=sidebar.querySelector('.sheet-grip');
    if(grip) grip.addEventListener('click',()=>{ if(!mq.matches) return; setDetent({hidden:'min',min:'half',half:'min',full:'half'}[currentDetent]||'min'); });
    /* ══ (#R231) SCROLL TO THE TOP AND KEEP PULLING → THE SHEET COMES DOWN ═══════════════════════
       「モバイル版で、ウィジェットを上下スクロールした時に、一番上までスクロールしたら、そこから
         ボトムシートを下げる動作に自然に移行するように。（Countries、Atlasでも）」
       ⚠ IT DOES NOT NAME ELEMENTS. One delegated listener finds, at touchstart, the nearest genuinely-scrollable
       ancestor of whatever was touched and hands over to the sheet drag when that scroller is at its top — so a
       tab, or a SCREEN (Layers, Tools, Chronos, Settings), added later is covered for free. */
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
        if(!mq.matches || dragging || RANK[currentDetent]<=RANK.min) return;
        const t=e.touches[0]; sy=t.clientY; sx=t.clientX;
        /* the head has its own drag (grabbable above); anything that takes a horizontal gesture keeps it */
        if(e.target.closest && (e.target.closest('#m-head,.header-area,.control-panel')||e.target.closest('input[type=range]'))) return;
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
       ⚠ IT IS A `click` SWALLOW, NOT A POINTER BLOCK: pointer events (hover, panning, pinching) are never
       touched; only the tap's `click` (and its long-press `contextmenu`) is caught, in the CAPTURE phase on
       window, and turned into "lower the sheet to the middle detent". ⚠ The target test is `#map`, not
       `.map-container` — the chrome inside the container is not map. */
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
    /* ══ (mobile-shell) A TAB OPENS AT HALF — ATLAS INCLUDED ══════════════════════════════════════════════
       (#R112) lifted Atlas to FULL because its composer sits at the bottom of the panel and a translated sheet
       left it below the screen at `half`. The sheet's content now ENDS where the screen ends (`--sheet-hide`,
       written in setDetent), so the composer is on screen at `half` — and at `half` the reader watches Atlas
       draw its answer on the map; reading a long reply is one pull to `full`.
       The delay lets this win over any earlier detent set in the same click. */
    document.querySelectorAll('.control-panel .mode-btn').forEach(b=>{
      b.addEventListener('click',()=>{ if(!mq.matches) return; const want=detentFor('tab',{current:currentDetent, before:fieldBefore}); fieldBefore=null;
        setTimeout(()=>{ if(want!==currentDetent) setDetent(want); else setDetent(currentDetent,false); },70); });
    });
    const si=document.getElementById('search-input'); if(si) si.addEventListener('focus',()=>{ if(mq.matches) go('type'); });

    /* ══ (mobile-shell) THE ONE FIELD: A PLACE, OR A QUESTION FOR ATLAS ═════════════════════════════════════
       Focusing it raises the sheet to `full` so the candidates (js/search-geocode.js, which offers «Ask Atlas»
       as the last row on a phone) have the room; leaving it empty puts the sheet back where it was. */
    (function(){
      const input=document.getElementById('ms-input'); if(!input) return;
      input.addEventListener('focus',()=>{ if(!mq.matches) return; if(currentDetent!=='full' && fieldBefore==null) fieldBefore=currentDetent; go('type'); });
      input.addEventListener('blur',()=>{ if(!mq.matches) return; setTimeout(()=>{ if(fieldBefore==null || document.activeElement===input) return;
        const res=document.getElementById('ms-results');
        const showing=res && res.style.display!=='none' && res.childElementCount>0;
        if(!input.value.trim() && !showing) go('leave'); },180); });
    })();

    /* ══ (mobile-shell-flow) AN ANSWER ON THE MAP BRINGS THE SHEET DOWN ═══════════════════════════════════════
       ① a module that put a card on the map says so (MAP_ANSWER_EVENT — js/search-geocode.js when a place is
         picked); ② a flight that no finger started is the app showing the reader somewhere (an Atlas fit, a
         picked place, a feed item's location). Which detent each means is js/mobile-sheet.js detentFor's table.
       ⚠ «no finger started it» is read twice: MapLibre hands a gesture's movestart its originalEvent, and the
       3-D engine does not, so the fingers down OFF the sheet are counted too. The sheet's own padding moves are
       marked by camPad and are not answers. */
    bus.on(MAP_ANSWER_EVENT,(e)=>{ if(!mq.matches) return; const k=e&&e.detail&&e.detail.kind; if(k) go(k); });
    /* (mobile-card-reach) ③ a card the map HOLDS (a `.country-popup` mounted in #map-container: volcano, aircraft, satellite,
       company, news-intel…) is an answer on the map by being there — nine modules open one, and none of them says so.
       The fact is read once, here: a direct child of the map that is a card and has just become visible. (Direct children only:
       the map's subtree is every marker, and its style writes are not this question.) */
    try{ if(mapContainer){ const watched=new WeakSet(), shown=new WeakSet();
      const cardOpened=(recs)=>{ if(!mq.matches) return; let opened=false;
        for(const r of recs){ const t=r.target; const vis=t.style.display!=='none' && t.isConnected && getComputedStyle(t).display!=='none';
          if(vis&&!shown.has(t)) opened=true; if(vis) shown.add(t); else shown.delete(t); }
        if(opened) go('card'); };
      const cardIo=new MutationObserver(cardOpened);
      const watch=(n)=>{ if(n.nodeType===1 && n.classList.contains('country-popup') && !watched.has(n)){ watched.add(n); cardIo.observe(n,{ attributes:true, attributeFilter:['style'] }); } };
      mapContainer.querySelectorAll(':scope > .country-popup').forEach(watch);
      new MutationObserver((recs)=>{ for(const r of recs) r.addedNodes.forEach(watch); }).observe(mapContainer,{ childList:true }); } }catch(_){}
    { const fingers=new Set();
      window.addEventListener('pointerdown',(e)=>{ if(!sidebar.contains(e.target)) fingers.add(e.pointerId); },true);
      ['pointerup','pointercancel'].forEach((t)=>window.addEventListener(t,(e)=>{ fingers.delete(e.pointerId); },true));
      try{ const E=_GE(); if(E){
        E.events.on('movestart',(e)=>{ if(!mq.matches || _selfCam || fingers.size || (e&&e.originalEvent)) return; _appMoving=true; go('move'); });
        E.events.on('moveend',()=>{ if(!_appMoving) return; _appMoving=false; const p=_padLater; _padLater=null; if(p) camPad(p.pad,p.sp); });
      } }catch(_){} }

    /* =================== screens =================== */
    let _beforeScreen=null;
    const screens=makeScreens({ host:document.getElementById('m-screens'), sheet:sidebar, active:()=>mq.matches,
      onChange:(top,how)=>{
        if(how==='open' && top){ if(screens.depth()===1) _beforeScreen=currentDetent; const want=top.detent||'half'; if(RANK[currentDetent]<RANK[want]) setDetent(want); }
        else if(how==='close' && !top){ const back=_beforeScreen; _beforeScreen=null; if(back && RANK[back]<RANK[currentDetent]) setDetent(back); }
      } });
    if(moSheet) screens.adopt(moSheet,{ isOpen:()=>moSheet.classList.contains('show'), close:closeSheet, detent:'half', dialog:true });
    if(toolsSheet) screens.adopt(toolsSheet,{ isOpen:()=>toolsSheet.classList.contains('show'), close:closeSheet, detent:'half', dialog:true });
    if(tl) screens.adopt(tl,{ isOpen:()=>!tl.classList.contains('collapsed'), close:()=>{ const x=document.getElementById('ntl-x'); if(x) x.click(); else tl.classList.add('collapsed'); }, detent:'half' });
    { const sm=document.getElementById('settings-modal');
      if(sm) screens.adopt(sm,{ isOpen:()=>!!sm.style.display && sm.style.display!=='none', close:()=>{ const x=document.getElementById('settings-close-x'); if(x) x.click(); else sm.style.display='none'; }, detent:'full', dialog:true }); }
    /* Escape closes the screen on top when it is not a registered dialog (a dialog's own registration
       already answers Escape — js/dialog.js — and two answers would close two screens) */
    document.addEventListener('keydown',e=>{ if(e.key!=='Escape' || !mq.matches || e.defaultPrevented) return; const t=screens.top(); if(t && !t.dialog) screens.closeTop(); });

    /* =================== the legend tray =================== */
    const chip=document.getElementById('m-legend-chip');
    /* the cards are laid out while they are invisible (the tiler measures them all the same), so opening is a
       class change and nothing has to be asked to place them */
    const legendTray=(chip && mapContainer)? makeLegendTray({ container:mapContainer, chip, count:document.getElementById('m-legend-n'), frame }) : null;

    /* the head grows a line while the centre readout is on (js/mobile-map-input.js) — the lowest two
       detents are measured from the head, so they are re-taken when it changes size */
    /* …and the screens and the search candidates are placed under it (`--m-head-h`, read by the stylesheet) */
    const headSize=()=>{ if(!mHead) return 0; const h=mHead.offsetParent!==null? mHead.offsetTop+mHead.offsetHeight : 0; if(h) sidebar.style.setProperty('--m-head-h',h+'px'); return h; };
    try{ if(mHead && typeof ResizeObserver==='function'){ let last=0; new ResizeObserver(()=>{ const h=headSize(); if(h===last) return; last=h; if(mq.matches && RANK[currentDetent]<=RANK.min && !dragging) setDetent(currentDetent,false); }).observe(mHead); } }catch(_){}

    /* =================== boot + responsive (self-healing) =================== */
    let lastIsM=null;
    function syncResponsive(){
      const isM=mq.matches; const crossed=(isM!==lastIsM);
      if(crossed){ applyLayout(isM); lastIsM=isM; }
      /* (#R15b) Entering the phone layout (first load OR crossing 768px) snaps to the lowest reading stop
         synchronously, so there is no half→min flash. */
      if(isM){ recompute(); setDetent(crossed?'min':currentDetent,false); if(crossed){ try{ window._expandAllLayerGroups&&window._expandAllLayerGroups(); }catch(_){} } }
      else{ document.body.classList.remove('sheet-full','sheet-min','sheet-hidden'); try{ const C=_cam(); if(C) C.setPadding({top:0,left:0,right:0,bottom:0}); }catch(_){} }
    }
    syncResponsive();                                                     // initial layout at load width
    if(mq.addEventListener) mq.addEventListener('change',syncResponsive); // width crosses 768 in either direction
    window.addEventListener('resize',()=>frame('mobile.sheet.resize',syncResponsive));   // dvh / toolbar / rotation changes, once a frame
    window.addEventListener('orientationchange',()=>setTimeout(syncResponsive,220));
    updateCompass();
    /* (#R231) the Map screen (base map · projection · map display) builds itself only at phone widths
       and watches the same 768 px query; it is installed here, next to the chrome it belongs with, and lent
       to the sheet like the other screens. */
    try{ const B=window.IntMapBasemapSwitch; if(B){ B.install(); const pop=document.getElementById('bm-pop');
      if(pop) screens.adopt(pop,{ isOpen:()=>pop.classList.contains('show'), close:()=>B.close(), detent:'half' }); } }catch(_){ }
  }
  return initMobileUI;
}

export function layoutReflow(HOST){
  const applySidebarStyle=HOST.applySidebarStyle;
  /* (#R172) the resize below goes through IntMapGeoEngine too — this is a SEPARATE factory closure from
     mobileUI above, so it needs its own handle (the split-scope check catches exactly this). */
  const _GE=()=>IntMapGeoEngine;
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
      const upd=()=>{ try{ const desk=window.matchMedia(window.IntMapDevice.WIDE).matches;
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
        /* ⚠ (#R480) THE ROWS OF THE STACK, NOT THE PILLS SOMEONE REMEMBERED. `stackBottom` is where the
           search pill is dropped to when it cannot fit beside the controls, so it has to be the bottom of
           the WHOLE right-hand stack. Naming `.map-view-group` made that true only while every row happened
           to be one of those pills — and #R480 moved the compass OUT of a pill into a row of its own, which
           under the old selector would have left a 42px circle sitting on top of the search field with the
           geometry reporting no collision. Every ROW is a direct child of .map-controls-top by construction,
           so measuring the children measures the stack, including rows added after this line was written.
           (#btn-layers stays named: it is measured for its dropdown's left edge, not for a row.) */
        document.querySelectorAll('.map-controls-top > *, #btn-layers').forEach(el=>{ const r=el.getBoundingClientRect(); if(r.width>0){ rightLeft=Math.min(rightLeft,r.left); stackBottom=Math.max(stackBottom,r.bottom); } });
        let leftRight=mapL;
        try{ if(document.body.classList.contains('sidebar-glass')){ const sb=document.querySelector('.sidebar'); if(sb&&!sb.classList.contains('collapsed')) leftRight=Math.max(leftRight, sb.getBoundingClientRect().right); } }catch(_){}
        try{ const tg=document.querySelector('.btn-toggle-sidebar'); if(tg){ const r=tg.getBoundingClientRect(); if(r.width>0) leftRight=Math.max(leftRight,r.right); } }catch(_){}
        /* ⚠⚠⚠ (#R484) THIS PREDICTED A PILL THAT IS NOT THE ONE ON SCREEN. `half=110` said "a comfortable
           ~220px centered pill"; the element is `width:min(380px,55vw)` plus 16px padding and 2px border
           = 398px, so its real half is 199. The test therefore cleared a collision the pill was already in,
           and the gap only stayed hidden because the widest row of the right-hand stack used to be the
           TOOLS row at y=50 — which barely shares a y-band with the pill at y=10.
           #R480 put a 317px row at y=10 and the 89px of under-estimate became visible: MEASURED at 1310x900,
           pill 656–1054 against the row's left edge at 982.56 = 71.44px of overlap, and
           `elementFromPoint` at the centre of #ms-btn returned `btn-view-map` — the search button could
           not be clicked at all. The unprotected band was ~1303–1453px, which contains 1366 and 1440.
           ⚠⚠ MEASURING IT AT RUNTIME IS WORSE, WHICH THIS ROUND FOUND BY DOING IT FIRST. Under `ms-narrow`
           the width IS the watcher's own output, so it can only be read while the watcher is off — and the
           moment it latches a wrong early reading (before the stylesheet's max-width applies, the pill is
           its container's full width) nothing ever re-measures, because the watcher is now on. MEASURED:
           1500x900 stayed anchored with both collision tests false, since the stale half was ~455 not 199.
           A stuck layout at a width that was never in trouble is a worse failure than the one being fixed.
           So the number is written here, and `tests/chrome-overlap-checks.test.mjs (#R484)` ② DERIVES it from the `.map-search` rule
           in css/intmap.css (380 content + 16 padding + 2 border) and fails if the two ever disagree —
           which is the thing #R25 had no way to notice. */
        const half=199, margin=14;
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
      window.addEventListener('resize',upd); window.addEventListener('intmap-sidebar-resize',upd); setTimeout(upd,300); upd();
      /* ══ ⚠⚠⚠ (#R252) …AND AGAIN ONCE THE RIGHT PANEL HAS FINISHED MOVING ═══════════════════════════
         「右サイドバーを開閉後、地名検索バーが変な位置に行く。」

         Everything `upd()` measures on the right is `.map-controls-top`'s left edge, and since #R160
         the right layer sidebar OVERLAYS the map: `.map-container` does not resize, so neither the
         ResizeObserver above nor `resize` ever fires. js/map-ui.js does dispatch
         `intmap-sidebar-resize` from `open()` and `close()` — but SYNCHRONOUSLY, at t=0 of the HUD's
         own `transition:right .38s` (css/intmap.css, the #R160 block). So the one recomputation this
         watcher gets reads the HUD where it was BEFORE the slide, pins `--ms-left`/`--ms-right` to the
         geometry of the state being left, and nothing ever corrects it: opening leaves the pill
         stretched under the panel, closing leaves it squeezed into the strip the panel used to fill.

         ⚠ THE SIGNAL IS THE THING THAT MOVES, not a timer matching a duration typed in a stylesheet.
         `transitionend` fires when the HUD has actually landed (and `transitioncancel` when a second
         toggle interrupts the first), so the pill is laid out against a geometry that has stopped
         changing, whatever the duration or `prefers-reduced-motion` make it. The early dispatch is
         KEPT: it is what moves the pill at the start of the animation instead of after it. */
      try{ const hud=document.querySelector('.map-controls-top');
        if(hud) ['transitionend','transitioncancel'].forEach(ev=>hud.addEventListener(ev,(e)=>{ if(!e||e.propertyName==='right') upd(); })); }catch(_){} }
    if(document.readyState!=='loading') setTimeout(wire,0); else document.addEventListener('DOMContentLoaded',wire);
  })();
  /* ══ (ui-a11y-polish) …AND THE PLACEHOLDER IS THE ONE THAT FITS THE PILL THIS WATCHER LEFT ══════════
     MEASURED on production (2026-09-27, 1280 × 800, first visit — the right layer panel opens itself):
     the watcher above centres the pill in the gap between the two sidebars at 203 px, which leaves the
     field 105 px, and 「Search any place on Earth...」 is 185 px — it read 「Search any pla」. Widening
     the pill is the one thing this layout must not do (it would slide under the controls, #R25/#R484)
     and dropping it to a second row is what #R122 was asked to stop, so the WORDS give way instead:
     the full sentence while it fits the field's measured room, the short one when it does not, and the
     stylesheet's `text-overflow:ellipsis` below either.
     ⚠ THE FULL FORM IS WHATEVER js/i18n.js LAST WROTE (`data-i18n-ph="msPh"`), read back through a
     MutationObserver, so a language switch re-measures and nothing here restates the locale tables.
     ⚠ MEASURED, NOT ASSUMED: the room is the field's own clientWidth less its padding, and the text is
     measured in the field's own computed font — a width threshold would be wrong in the other language. */
  (function(){
    function wire(){
      const inp=document.getElementById('ms-input'); if(!inp||typeof ResizeObserver!=='function') return;
      let full=inp.placeholder, mine=null, ctx=null;
      const fits=(txt)=>{ try{ const cs=getComputedStyle(inp); ctx=ctx||document.createElement('canvas').getContext('2d');
        ctx.font=[cs.fontStyle,cs.fontWeight,cs.fontSize,cs.fontFamily].join(' ');
        return ctx.measureText(txt).width<=inp.clientWidth-(parseFloat(cs.paddingLeft)||0)-(parseFloat(cs.paddingRight)||0); }catch(_){ return true; } };
      /* (mobile-shell) on a phone the field is the ONE entry — a place or a question for Atlas — and says so */
      const fit=()=>{ if(!inp.clientWidth) return;
        const want=HOST.isMobile()? IntMapLang.t(HOST.lang,'Search places or ask Atlas','場所を検索・Atlas に質問')
          : (fits(full)?full:IntMapLang.t(HOST.lang,'Search places','地名を検索'));
        if(inp.placeholder!==want){ mine=want; inp.placeholder=want; } };
      new MutationObserver(()=>{ if(inp.placeholder!==mine){ full=inp.placeholder; fit(); } }).observe(inp,{attributes:true,attributeFilter:['placeholder']});
      new ResizeObserver(fit).observe(inp); fit(); }
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
      const setW=(w)=>{ styleEl.textContent='@media'+window.IntMapDevice.WIDE+'{ :root{ --sidebar-w:'+w+'px; } }'
        +'@media'+window.IntMapDevice.COMPACT+'{ #sb-resizer{ display:none; } }'; };
      styleEl.textContent='@media'+window.IntMapDevice.COMPACT+'{ #sb-resizer{ display:none; } }';
      try{ const w=parseInt(localStorage.getItem('intmap_sidebar_w')||'',10); if(w>=320&&w<=Math.max(760,window.innerWidth-60)) setW(w); }catch(_){}   /* (#R62) may span almost the full window */
      /* ⚠ (#R251) this title was a bare English literal, so it read the same in all nine languages;
         and it is set ONCE on an element that outlives the language, so it also has to follow it.
         Found by tests/r251.spec.js, which reads `title` as well as text. */
      const h=document.createElement('div'); h.id='sb-resizer';
      const _ht=()=>{ h.title=IntMapLang.t(HOST.lang,'Drag to resize','高さを調節','Zum Ändern der Höhe ziehen','Потяните, чтобы изменить размер','Arrastra para redimensionar'); };
      _ht(); bus.on('intmap-lang',()=>setTimeout(_ht,30));
      h.style.cssText='position:absolute;top:0;right:-3px;width:8px;height:100%;cursor:col-resize;z-index:calc(var(--z-dropdown) - 100);touch-action:none;';
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
}
