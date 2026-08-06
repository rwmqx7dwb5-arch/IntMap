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
      const out=document.createElement('canvas');
      const cont=document.getElementById('map-container');
      out.width=mapCv?mapCv.width:cont.clientWidth; out.height=mapCv?mapCv.height:cont.clientHeight;
      const ctx=out.getContext('2d'); if(mapCv) ctx.drawImage(mapCv,0,0);
      const scale=out.width/cont.clientWidth;
      /* 2 — DOM overlays (legends, markers, timebar) via html2canvas, skipping the WebGL canvases */
      if(typeof html2canvas!=='undefined'){
        try{
          const ov=await html2canvas(cont,{backgroundColor:null,useCORS:true,logging:false,scale,
            ignoreElements:el=> el.tagName==='CANVAS' || (el.classList&&el.classList.contains('maplibregl-canvas')) });
          ctx.drawImage(ov,0,0,out.width,out.height);
        }catch(_){}
      }
      document.body.classList.remove('capture-mode');
      const flash=document.createElement('div'); flash.className='screenshot-flash'; document.body.appendChild(flash);
      requestAnimationFrame(()=>{ flash.classList.add('go'); setTimeout(()=>flash.remove(),520); });
      out.toBlob(b=>{ if(!b) return; const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='IntMap_'+ymdISO(new Date())+'_'+Date.now().toString().slice(-5)+'.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),6000); }, 'image/png');
      try{ imToast(t('screenshotSaved')); }catch(_){}
    }catch(e){ document.body.classList.remove('capture-mode'); console.warn('screenshot',e); }
    finally{ if(btn) btn.disabled=false; }
  }
  { const b=document.getElementById('btn-screenshot'); if(b) b.onclick=takeScreenshot; }
}
