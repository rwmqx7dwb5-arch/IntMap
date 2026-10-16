/* ============================================================================
 *  IntMap · Terms of Service & Privacy Policy — THE IN-APP MODAL  (#R167)
 * ----------------------------------------------------------------------------
 *  The words are NOT here. They live in js/legal-text.js, which this modal and the two public
 *  pages (privacy.html / terms.html) all read, so the app and the linkable page can never say
 *  different things. Changing the policy means editing that file, not this one.
 * ==========================================================================*/

/* the words. NOT imported here: this modal is the only thing in the app that reads them, and most
   visits never open it — so they arrive on demand through the loader (js/lazy-modules.js `legalText`,
   which publishes window.IntMapLegalText), the same file privacy.html / terms.html load with a plain
   <script src>. (wave4-train) Measured 2026-10-13: 59 kB of the start-up bundle was this prose. */



export function legal(HOST){
  function textOf(which){
    var T=window.IntMapLegalText;
    return T ? T.html(which,HOST.lang) : null;          /* null: the words have not arrived yet */
  }
  (function(){
    const lm=document.getElementById('legal-modal'), body=document.getElementById('legal-body');
    let shown='';                                       /* the tab the reader asked for last — a slow arrival paints that one */
    function put(which){ const t=textOf(which); body.innerHTML=t||''; body.scrollTop=0; return t!=null; }
    function paint(which){
      shown=which;
      document.getElementById('legal-tab-terms').classList.toggle('active',which==='terms');
      document.getElementById('legal-tab-privacy').classList.toggle('active',which==='privacy');
      if(put(which)) return;
      body.setAttribute('aria-busy','true');
      window.IntMapLazy.need('legalText').then((ok)=>{
        body.removeAttribute('aria-busy');
        if(ok && shown===which) put(which);
      });
    }
    window.openLegal=function(which){ paint(which||'terms'); lm.style.display='flex'; };
    document.getElementById('legal-tab-terms').onclick=()=>paint('terms');
    document.getElementById('legal-tab-privacy').onclick=()=>paint('privacy');
    document.getElementById('legal-close-x').onclick=()=>{ lm.style.display='none'; };
    lm.addEventListener('click',(e)=>{ if(e.target===lm) lm.style.display='none'; });
    /* (a11y-shared-dialog) registered: Escape, Tab trap, focus back. Named by its two tabs — the dialog has no heading of its own */
    window.IntMapDialog.adopt(lm,{ panel:lm.querySelector('.modal-content'), labelledby:'legal-tab-terms legal-tab-privacy' });
    const lt=document.getElementById('link-terms'); if(lt) lt.onclick=(e)=>{ e.preventDefault(); openLegal('terms'); };
    const lp=document.getElementById('link-privacy'); if(lp) lp.onclick=(e)=>{ e.preventDefault(); openLegal('privacy'); };
  })();
}
