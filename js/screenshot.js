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
 *  ⚠ (#R493) THE PICTURE ITSELF NOW LIVES IN js/atlas-view-capture.js, AND NOTHING ABOUT IT CHANGED.
 *  The frame grab, the #R231 one-coordinate-system fix and the html2canvas overlay pass moved there
 *  unaltered so that Atlas's `view.inspect` and this button take the SAME picture by running the
 *  SAME code — two captures would be two answers to "what does the reader see", and #R231 is the
 *  measurement of what happens when two halves of one picture disagree. What stays here is what is
 *  the BUTTON's and not the picture's: the busy state, the `capture-mode` class across the whole
 *  operation, the flash, and the download.
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
    /* ⚠ HELD ACROSS THE WHOLE OPERATION, AND TAKEN OFF IN `finally` — never on a happy path.
       #R231 measured iOS Safari discarding the tab's JavaScript context mid-capture, and a
       screenshot feature that can leave every control on the map invisible is worse than one that
       fails. It starts empty so the same `finally` is correct when the import below never resolved. */
    let CAPTURE_CLASS='';
    try{
      /* ⚠ (#R493) FETCHED HERE, NOT AT BOOT — the #R224 rule the html2canvas pass already follows.
         This file rides the eager bundle (js/app-body.js imports it so the button is wired before
         anything is pressed); the CAPTURE is only ever needed once someone captures, and a static
         import would put it in every reader's startup for a button most of them never press.
         `npm run check:perf` counts eager modules and is the instrument that says so. */
      const CAP=(await import('./atlas-view-capture.js')).makeViewCapture({ GE:GE, waitIdle:aiWaitMapIdle });
      CAPTURE_CLASS=CAP.CAPTURE_CLASS;
      document.body.classList.add(CAPTURE_CLASS);
      /* `markCapture:false` — the class is this function's, because it must outlive the picture.
         ⚠ THE BUTTON KEEPS A FRAME THAT DID NOT COME FROM A RENDER TICK, and Atlas does not. This
         only ever happens on a page that is not drawing, and a reader who pressed the button is
         looking at the page — whereas a turn can run while the tab is in the background, where the
         same frame would be a black rectangle described to a vision model as «a dark map». */
      const { canvas:out }=await CAP.captureCanvas({ include:'screen', markCapture:false, waitIdleMs:2500 });
      if(!out) return;
      const flash=document.createElement('div'); flash.className='screenshot-flash'; document.body.appendChild(flash);
      requestAnimationFrame(()=>{ flash.classList.add('go'); setTimeout(()=>flash.remove(),520); });
      out.toBlob(b=>{ if(!b) return; const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='IntMap_'+ymdISO(new Date())+'_'+Date.now().toString().slice(-5)+'.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),6000); }, 'image/png');
      try{ imToast(t('screenshotSaved')); }catch(_){}
    }catch(e){ console.warn('screenshot',e); }
    finally{ if(CAPTURE_CLASS) document.body.classList.remove(CAPTURE_CLASS); if(btn) btn.disabled=false; }
  }
  { const b=document.getElementById('btn-screenshot'); if(b) b.onclick=takeScreenshot; }
}
