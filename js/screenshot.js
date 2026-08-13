/* ============================================================================
 *  IntMap · the screenshot button  (#R200)
 * ----------------------------------------------------------------------------
 *  Compose a PNG of what the user is looking at: the map canvas, plus the legends and scale that
 *  sit on top of it, minus the controls. It waits for the renderer to be idle so the picture is of a
 *  finished frame rather than a half-loaded one.
 *
 *  Lifted verbatim out of js/app-body.js (#R200): 36 of its 36 lines are byte-identical,
 *  and the 0 that are not are all the same rule — #R165's: a closure value js/app-body.js
 *  REASSIGNS at runtime is read through IM_HOST's live accessor (none here),
 *  never captured when this factory ran. Everything else arrives through CTX under its ORIGINAL name,
 *  which is what lets the body below stay word-for-word what it was.
 *
 *  It is a REAL ES module: nothing registers it on window.IntMapModules, nothing in src/main.js orders
 *  it, and js/app-body.js reaches it only through a static `import`. tests/r200-checks.test.mjs derives
 *  both halves of the hand-off — what this file returns and reads, what the core takes and passes — from
 *  the two files themselves, so neither list can drift into a silent `undefined`.
 * ==========================================================================*/
export function makeScreenshot(HOST, CTX) {
  const GE=CTX.GE, aiWaitMapIdle=CTX.aiWaitMapIdle, imToast=CTX.imToast, t=CTX.t, ymdISO=CTX.ymdISO;
  /* ---------- Screenshot (#18) — keeps legends, hides controls ---------- */
  async function takeScreenshot(){
    if(!GE().hasRenderer()) return;
    const btn=document.getElementById('btn-screenshot'); if(btn) btn.disabled=true;
    document.body.classList.add('capture-mode');
    try{
      /* let in-flight tiles finish so we don't capture a half-loaded frame */
      try{ await aiWaitMapIdle(2500); }catch(_){}
      /* 1 — read the WebGL frame synchronously INSIDE a render tick (the reliable way to capture a
         canvas created without preserveDrawingBuffer), and composite the animated-wind 2D canvas. */
      const mapCv=await new Promise(res=>{ let done=false; const grab=()=>{ if(done)return; done=true; try{ const c=GE().render.canvas(); const o=document.createElement('canvas'); o.width=c.width; o.height=c.height; const cx=o.getContext('2d'); cx.drawImage(c,0,0);
        try{ const wb=document.getElementById('wind-bg-canvas'); if(wb && wb.style.display!=='none' && wb.width) cx.drawImage(wb,0,0,o.width,o.height); }catch(_){}
        try{ const wc=document.getElementById('wind-canvas'); if(wc && wc.style.display!=='none' && wc.width) cx.drawImage(wc,0,0,o.width,o.height); }catch(_){}
        res(o); }catch(_){ res(null); } }; try{ GE().events.once('render',grab); GE().render.triggerRepaint(); }catch(_){ grab(); } setTimeout(grab,1200); });
      /* ══ ⚠⚠ (#R231) TWO LAYERS, TWO COORDINATE SYSTEMS, AND NOTHING MADE THEM AGREE ═════════════
         「モバイル版でのスクショ機能がクソ。UIが壊れる」

         The output canvas was sized from the RENDERER'S BACKING STORE and the overlay pass was
         scaled from the CONTAINER'S CSS BOX, on the unstated assumption that
         `canvas.height / canvas.width === clientHeight / clientWidth`. On a desktop that holds. On a
         phone it routinely does not, and iOS is where it does not hardest:

           · `.map-container` is `height:100dvh`, and 100dvh CHANGES the moment Safari's URL bar
             collapses or expands — which is what happens while you are panning the map right before
             you press the button;
           · the renderer resizes its drawing buffer on its own schedule (a resize observer, then a
             frame), so between the change and the next resize the two boxes have DIFFERENT ASPECT
             RATIOS;
           · and `drawImage(ov, 0, 0, out.width, out.height)` then stretches the whole overlay layer
             — every legend, every label, every scale bar — to an aspect ratio that is not its own.

         That is the report, precisely: the map looks right and the UI on top of it is stretched.

         ⚠ THE FIX IS ONE COORDINATE SYSTEM, TAKEN FROM THE BOX BOTH LAYERS ACTUALLY OCCUPY. The
         container's CSS box is what the user is looking at, so the output is that box at the
         renderer's own pixel density, and BOTH layers are drawn into it — the map explicitly mapped
         from its full backing store onto the box, the overlays at the same density. When the two
         agree (every desktop, and a phone that is not mid-resize) this is byte-for-byte the old
         behaviour: `scale` comes out as the same number and the map's source rect is the whole
         canvas. When they disagree, nothing is stretched any more. */
      const out=document.createElement('canvas');
      const cont=document.getElementById('map-container');
      const cw=Math.max(1,cont.clientWidth), ch=Math.max(1,cont.clientHeight);
      /* the renderer's density — from the canvas when there is one, so a @2x / MSAA buffer is not
         thrown away, and never below 1 */
      const scale=Math.max(1, mapCv ? (mapCv.width/cw) : (window.devicePixelRatio||1));
      out.width=Math.round(cw*scale); out.height=Math.round(ch*scale);
      const ctx=out.getContext('2d');
      if(mapCv) ctx.drawImage(mapCv,0,0,mapCv.width,mapCv.height,0,0,out.width,out.height);
      /* 2 — DOM overlays (legends, markers, timebar) via html2canvas, skipping the WebGL canvases */
      /* (#R224) FETCHED HERE, NOT AT BOOT. html2canvas is 198 kB that only a screenshot needs, and
         this is the only place that needs it — see src/vendor.js. The overlay pass is skipped if it
         cannot be had, which is exactly what the old `typeof` guard meant. */
      try{ if(window.IntMapVendor) await window.IntMapVendor.html2canvas(); }catch(_){}
      if(typeof html2canvas!=='undefined'){
        try{
          const ov=await html2canvas(cont,{backgroundColor:null,useCORS:true,logging:false,scale,
            ignoreElements:el=> el.tagName==='CANVAS' || (el.classList&&el.classList.contains('maplibregl-canvas')) });
          ctx.drawImage(ov,0,0,out.width,out.height);
        }catch(_){}
      }
      const flash=document.createElement('div'); flash.className='screenshot-flash'; document.body.appendChild(flash);
      requestAnimationFrame(()=>{ flash.classList.add('go'); setTimeout(()=>flash.remove(),520); });
      out.toBlob(b=>{ if(!b) return; const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='IntMap_'+ymdISO(new Date())+'_'+Date.now().toString().slice(-5)+'.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),6000); }, 'image/png');
      try{ imToast(t('screenshotSaved')); }catch(_){}
    }catch(e){ console.warn('screenshot',e); }
    /* ⚠ (#R231) `capture-mode` COMES OFF IN `finally`, NOT ON THE TWO HAPPY-ISH PATHS. It used to be
       removed once at the end of the try and once in the catch — which covers a throw, but not a
       RETURN and not the case that actually bites on a phone: iOS Safari discarding the tab's
       JavaScript context mid-capture (`aiWaitMapIdle` waits up to 2.5 s, html2canvas allocates a
       full-viewport raster) leaves the class on, and with it every control on the map hidden. A
       screenshot feature that can leave the UI invisible is worse than one that fails. */
    finally{ document.body.classList.remove('capture-mode'); if(btn) btn.disabled=false; }
  }
  { const b=document.getElementById('btn-screenshot'); if(b) b.onclick=takeScreenshot; }
}
