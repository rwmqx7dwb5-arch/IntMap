/* ============================================================================
 *  IntMap · the sidebar's material, and the inset it owes the camera  (#R299)
 * ----------------------------------------------------------------------------
 *  「フロストガラス設定の時だけ、左サイドバーの余白に地図中心を合わせるという機構がない。同じ動きに
 *  しろ。」 The two sidebar modes are not the same layout, and #R160's rule — 「the toggle does nothing
 *  to the camera」 — was written when only one of them existed on screen:
 *
 *    SOLID    css/intmap.css:112-114 — the sidebar is a flex sibling. The canvas ENDS where the
 *             sidebar ends, so the centre of the canvas already is the centre of what can be seen,
 *             and compensating here would shift the picture TWICE (that double shift IS #R160).
 *    FROSTED  css/intmap.css:2265-2266 — `.map-container{position:absolute;inset:0;width:100%}`.
 *             The canvas keeps the whole window and the sidebar stands ON it, so the geometric
 *             centre sits under the panel by half the sidebar's width. MEASURED in production
 *             (1280×800, sidebar 400): the visible strip is 400–1280, its centre is x=840, and the
 *             map's centre is x=640 — 200 px out. `getPadding()` was {0,0,0,0} in all three modes.
 *
 *  Camera padding is the one control that says 「the usable box is narrower than the canvas」 — the
 *  same fact the flex layout states for solid — so writing it for frosted and nothing for solid is
 *  what makes the two modes behave alike.
 *
 *  Lifted verbatim out of js/app-body.js: every line below is byte-identical to what was there,
 *  because index.html + src/* + js/app-body.js + js/geo-engine.js + js/lazy-modules.js is a BUDGETED
 *  shell (tests/r168 #8) and the rule that budget states is 「a feature moves out, never that the
 *  ceiling moves up」. It is a REAL ES module: nothing registers it on window.IntMapModules, nothing
 *  in src/main.js orders it, and js/app-body.js reaches it only through a static `import`.
 * ==========================================================================*/
export function makeSidebarStyle(CTX) {
  const GE = CTX.GE, isMobile = CTX.isMobile;
function applySidebarStyle(animate){ const s=window.imSidebarStyle;
  const frosted=(s==='translucent'||s==='glass2');
  document.body.classList.toggle('sidebar-translucent', frosted);
  document.body.classList.toggle('sidebar-glass2', s==='glass2');
  document.body.classList.toggle('sidebar-glass', frosted);   /* drives the desktop overlay-frost MATERIAL only (blur/translucency) */
  /* (#R160) NO camera padding on toggle or style change anymore — in SOLID mode the sidebar is a flex sibling, i.e. the map
     container is physically narrower, so compensating there shifted the picture TWICE, and that double shift was exactly the
     "地図が勝手に動いてしまう" the user reported. That half is unchanged and is why `_glassInset()` answers 0 for solid. The
     `animate` argument is kept only for call-site compatibility and is a no-op; the mobile bottom sheet's padding is owned
     by the detent system elsewhere and is deliberately left untouched.
     ══ ⚠⚠⚠ (#R299) …EXCEPT IN FROSTED MODE, WHERE THE MAP IS NOT NARROWER ═══════════════════════════════════════════════
     「フロストガラス設定の時だけ、左サイドバーの余白に地図中心を合わせるという機構がない。同じ動きになるようにしろ。」 The two modes
     are not the same layout and the sentence above quietly treated them as one. SOLID: `.operation-room` is a flex row, the
     canvas ENDS where the sidebar ends, and its centre is already the centre of what can be seen. FROSTED (css/intmap.css
     `body.sidebar-glass .map-container{position:absolute;inset:0;width:100%}`): the canvas keeps the whole window and the
     sidebar stands ON it, so the geometric centre sits under the panel by half the sidebar's width. Camera padding is the
     one control that says «the usable box is narrower than the canvas» — the same fact the flex layout states for solid —
     so with it both modes put the centre in the middle of what the reader can actually see, and NOTHING is written for
     solid, where #R160's double shift would otherwise return.
     ⚠ A COLLAPSED SIDEBAR STILL HAS ITS WIDTH (`.collapsed` only parks it off-screen with a negative margin), so
     `offsetWidth` alone would keep the map pushed aside after it was shut. The STATE is read — collapsed, or display:none
     in ws-mode — rather than the position, because at the moment this runs the 0.4 s slide has not started yet and a live
     rect would still be the OLD one.
     ⚠ IT IS WRITTEN ONLY WHEN THE NUMBER CHANGED — a layer toggle, a theme change and a settings save all reach this
     function and none of them may move the map by a pixel (CONSTITUTION §3). ⚠ AND THE OTHER SIDES ARE READ BEFORE THEY
     ARE WRITTEN: js/mobile-ui.js owns `bottom` for the sheet, so only `left` is decided here (`right` keeps #R160's
     one-time cleanup of a stray value). */
  try{ if(GE().camera.getPadding && GE().camera.setPadding && !isMobile()){ const cur=GE().camera.getPadding()||{};
    const want=_glassInset();
    if((cur.left||0)!==want || (cur.right||0)!==0) GE().camera.setPadding({top:cur.top||0,right:0,bottom:cur.bottom||0,left:want}); } }catch(_){}
}
/* the width of the sidebar that is actually covering the map right now — 0 whenever nothing is */
function _glassInset(){ try{
  if(!document.body.classList.contains('sidebar-glass')) return 0;   /* solid: the canvas is already narrower */
  const sb=document.getElementById('sidebar'); if(!sb) return 0;
  if(sb.classList.contains('collapsed')) return 0;                   /* parked off-screen, width intact */
  const cs=getComputedStyle(sb);
  if(cs.display==='none'||cs.visibility==='hidden') return 0;        /* ws-mode hides it outright */
  const w=Math.round(sb.getBoundingClientRect().width);
  return (isFinite(w)&&w>0&&w<window.innerWidth)?w:0; }catch(_){ return 0; } }
/* ⚠ (#R299) THE THREE OTHER MOMENTS THE COLUMN'S GEOMETRY CHANGES, none of which calls the function above: ① `intmap-sidebar-resize`
   is dispatched by EVERY path that opens, shuts or re-widths the column — the toggle, the `ui.sidebar.open` action,
   js/article-reader.js, js/playground.js — so it is the one subscription that covers them all, and a repeat costs nothing (the
   write is skipped when equal). ② the renderer's first `load`, because loadSettings() applies a saved frosted sidebar and can run
   before the map has a transform to give padding to. ③ leaving WORKSPACE mode: js/workspace.js `enable()` zeroes the padding
   (`fitMap`) — correct, the sidebar is `display:none` there — and `disable()` zeroes it again at t=0 AND at t=350 ms while the
   sidebar comes back, so a re-sync at t=0 would be overwritten by the second one. That file announces nothing, so the body's own
   class list is what is watched. */
(function(){ try{
  let was=document.body.className.indexOf('ws-mode')>=0;
  const sync=()=>{ try{ applySidebarStyle(false); }catch(_){} };
  window.addEventListener('intmap-sidebar-resize',sync);
  try{ GE().events.on('load',sync); }catch(_){}
  new MutationObserver(()=>{ const now=document.body.className.indexOf('ws-mode')>=0;
    if(now===was) return; was=now; sync(); if(!now) setTimeout(sync,450); })
    .observe(document.body,{attributes:true,attributeFilter:['class']});
}catch(_){} })();
  return applySidebarStyle;
}
