/* ============================================================================
 *  IntMap · PROJECTION — Globe or Flat, and the flat map's free scroll   (#R7 … #R298, split out #R298)
 * ----------------------------------------------------------------------------
 *  One subject that js/app-body.js kept in five places it never put next to each other: the mobile
 *  min-zoom floor (#R7), the two kernel commands the Globe/Flat buttons and Atlas both run, those
 *  buttons' own wiring, the rule that a flat map ALWAYS wraps (#R297) with the watchdog that keeps
 *  re-asserting it (#R298), and the `?flat` entrance inside the renderer's `load` handler. They are
 *  one thing — five values have to agree for "the map is flat" to be true — and standing two thousand
 *  lines apart is how #R298 found a second entrance that set one of them and none of the other four.
 *
 *  ⚠ ITS OWN FILE BECAUSE THE APP SHELL HAS A LINE CEILING (tests/r168 #8 — index.html + src/main.js
 *  + src/vendor.js + js/app-body.js + js/geo-engine.js + js/lazy-modules.js, under 8,200 lines). That
 *  test writes the rule down beside the number: «a ceiling raised once and never lowered stops
 *  asserting anything at all». So a round that adds to the shell pays by moving a whole SUBJECT out,
 *  the way #R195 (js/sat-proto.js) and #R196 (js/geodesy.js, js/tile-warm.js) did.
 *
 *  A real ES module like js/theme-sky.js: nothing registers it on window.IntMapModules and nothing
 *  orders it in src/main.js. js/app-body.js names it in an `import`, so the bundler resolves the
 *  binding and a rename is a BUILD error rather than a silent undefined.
 *
 *  ⚠ THREE ENTRY POINTS, EACH CALLED FROM EXACTLY WHERE ITS CODE STOOD. The order is load-bearing:
 *      wire()   registers the two kernel commands and binds the two buttons. It must run BEFORE the
 *               renderer's `load` event fires, because boot() looks `view.proj.flat` up BY NAME.
 *      boot()   the `?flat` entrance, from inside GE().events.on('load', …).
 *      watch()  the styledata/idle watchdog, which stood ~900 lines further down the shell. It is a
 *               separate call rather than part of wire() so that its listeners keep the position they
 *               had among the shell's other styledata listeners.
 *
 *  ⚠ MOVED VERBATIM. Every line below stood in js/app-body.js, comments and indentation included;
 *  only the bodies of wire(), boot() and watch() shift two spaces, because they gained a function
 *  around them. `GE`, `isMobile`, `updateOcclusion` and the kernel are rebound under their ORIGINAL
 *  names, so the statements that use them are byte-identical. The only edits are the SEVEN places
 *  that touch a value the shell keeps, listed here because a silent one is how a split loses a whole
 *  branch with nothing in the console (#R162):
 *      currentProj='flat'          -> CTX.setProj('flat')       view.proj.flat
 *      currentProj='globe'         -> CTX.setProj('globe')      view.proj.globe
 *      currentProj!=='flat'        -> CTX.getProj()!=='flat'    applyFlatPanSetting
 *      currentProj!=='flat'        -> CTX.getProj()!=='flat'    _reassertFlatPan
 *      window._cmpFollowProj&&…    -> CTX.cmpFollowProj()       ×3 (both commands + applyFlatPanSetting)
 *
 *  ⚠ `currentProj` STAYS IN THE SHELL and is handed over as a live getter/setter pair, because
 *  js/app-body.js publishes it as IM_HOST's `proj` accessor and ten other modules read that — 33
 *  reads in js/compare.js, js/flight-sim.js, js/label-occlusion.js, js/map-tools.js, js/map-ui.js,
 *  js/weather.js, js/layer-packs.js, js/space.js, js/playground.js and js/feedback.js. A copy taken
 *  at factory time would be the wrong answer for every one of them (#R165's rule).
 * ==========================================================================*/
export function makeProjection(CTX){
  /* the four the shell does NOT reassign, rebound under their own names so the body is verbatim */
  const GE=CTX.GE, isMobile=CTX.isMobile, updateOcclusion=CTX.updateOcclusion, IntMapOS=CTX.os;

  /* (#R7-mobile-zoom) Mobile Mercator must zoom out far enough to see the whole world. A min-zoom of
     1.4 left the world bigger than a portrait phone, so it felt "stuck" — phones get 0 (full world),
     desktop keeps a sensible floor. */
  function flatMinZoom(){ return isMobile()?0:1.2; }

  /* ══ ⚠⚠ (#R297) THE FLAT MAP WRAPS. THERE IS NO OTHER KIND ═══════════════════════════════════
     「平面地図は自由スクロールに一本化し、ヨーロッパ中心の固定地図は完全削除。設定の該当項目も削除。」
     「Fixed extent (Europe-centered)」 was a single, non-repeating world: pan east from Japan and the
     map stopped dead at the antimeridian, in a frame centred on Europe because that is where
     longitude 0 is. #R223 made 「free」 the default and kept 「fixed」 behind an explicit-choice latch;
     this removes the MODE — option, saved value, latch, Settings row — so `imFlatPan` no longer
     exists anywhere in the app. ⚠ NEVER cage the camera with maxBounds (the original 「locked near
     Europe」 bug); the line below clears a cage anything else may have set, and it stays. */
  function applyFlatPanSetting(){
    if(!GE().hasRenderer()) return;
    try{ GE().camera.setMaxBounds(null); }catch(_){}
    if(CTX.getProj()!=='flat') return;
    try{ GE().camera.setRenderWorldCopies(true); }catch(_){}
    /* (#R28) keep the compare map's world-copies in step with the main map's free-pan setting */
    CTX.cmpFollowProj();
  }

  /* ══ ⚠⚠ (#R298) …AND IT IS RE-ASSERTED, because a rule nothing checks is a rule nothing keeps ═══
     The flat map wraps: that is the whole mode (#R297 removed the other one). But it is set ONCE, by
     whoever last switched projection, and everything else in this app that touches the transform —
     a basemap swap, the country-isolate tool's cage, an engine change, a restore that runs before
     the renderer exists — can leave it off with nobody to notice. So the invariant is CHECKED on the
     events that could have broken it, and only WRITTEN when the answer is wrong: `_update()` on every
     style mutation is the oscillation #R297 spent a round finding. */
  let _flatT=0;
  function _reassertFlatPan(){
    if(_flatT) return;
    _flatT=setTimeout(()=>{ _flatT=0;
      try{ if(CTX.getProj()!=='flat'||!GE().hasRenderer()) return;
        const c=GE().camera;
        if(c.getRenderWorldCopies&&c.getRenderWorldCopies()) return;   /* already free — cost nothing */
        applyFlatPanSetting();
      }catch(_){}
    },600);
  }

  /* projection — TRUE kernel commands (UI + Atlas both call these). */
  function wire(){
    IntMapOS.register('view.proj.flat', ()=>{ CTX.setProj('flat'); document.getElementById('btn-view-flat').classList.add('active'); document.getElementById('btn-view-globe').classList.remove('active'); if(!GE().hasRenderer())return; GE().camera.setProjection('flat'); GE().camera.setMinZoom(flatMinZoom()); try{ applyFlatPanSetting(); }catch(_){} updateOcclusion(); CTX.cmpFollowProj(); }, {label:'Flat map', btn:'btn-view-flat', group:'view'});
    IntMapOS.register('view.proj.globe', ()=>{ CTX.setProj('globe'); document.getElementById('btn-view-globe').classList.add('active'); document.getElementById('btn-view-flat').classList.remove('active'); if(!GE().hasRenderer())return; try{ GE().camera.setMaxBounds(null); GE().camera.setRenderWorldCopies(false); }catch(_){} GE().camera.setMinZoom(0); GE().camera.setProjection('globe'); updateOcclusion(); CTX.cmpFollowProj(); }, {label:'Globe', btn:'btn-view-globe', group:'view'});
    document.getElementById('btn-view-flat').onclick=()=>IntMapOS.exec('view.proj.flat',{source:'ui'});
    document.getElementById('btn-view-globe').onclick=()=>IntMapOS.exec('view.proj.globe',{source:'ui'});
  }

  function boot(){
    /* ══ ⚠⚠⚠ (#R298) 「平面地図は自由スクロールに一本化して」 — THERE IS ONE WAY TO BE FLAT ═══════
       MEASURED on the built app with `?flat`: this branch set NO projection at all, so
       `getProjection()` answered nothing, `currentProj` stayed 'globe', the Globe button stayed
       lit over a flat map, `minZoom` stayed 0 instead of `flatMinZoom()`, `renderWorldCopies`
       stayed at the CONSTRUCTION value (false) — and the camera did not pan AT ALL: five 600-px
       pans left the centre on 141.3°. 「自由スクロールできない」, exactly.
       The projection is a kernel command with five things to set; a second entrance that sets one
       of them is not a shortcut, it is a state nothing else in the app knows how to repair. */
    try{ if(/[?&]flat\b/.test(location.search)){
        if(IntMapOS.has&&IntMapOS.has('view.proj.flat')) IntMapOS.exec('view.proj.flat',{source:'url'});
        else { GE().camera.setProjection('flat'); GE().camera.setMinZoom(flatMinZoom()); applyFlatPanSetting(); } }
      else GE().camera.setProjection('globe'); }catch(e){}
  }

  function watch(){
    try{ if(GE().hasRenderer()){ GE().events.on('styledata',_reassertFlatPan); GE().events.on('idle',_reassertFlatPan); } }catch(_){}
  }

  return { flatMinZoom, applyFlatPanSetting, boot, wire, watch };
}
