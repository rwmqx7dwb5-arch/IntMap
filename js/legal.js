/* ============================================================================
 *  IntMap · Terms of Service & Privacy Policy — THE IN-APP MODAL  (#R167)
 * ----------------------------------------------------------------------------
 *  The words are NOT here. They live in js/legal-text.js, which this modal and the two public
 *  pages (privacy.html / terms.html) all read, so the app and the linkable page can never say
 *  different things. Changing the policy means editing that file, not this one.
 * ==========================================================================*/

/* the words. A sibling import rather than a line in src/main.js: this file is the only thing in
   the app that reads them, so it is the file that should say so — and privacy.html / terms.html
   load the same module with a plain <script src>. */
import './legal-text.js';

window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.legal=function(HOST){
  function textOf(which){
    var T=window.IntMapLegalText;
    if(!T) return '';                                   /* the shell never renders without it */
    return T.html(which,HOST.lang);
  }
  (function(){
    const lm=document.getElementById('legal-modal'), body=document.getElementById('legal-body');
    function paint(which){
      document.getElementById('legal-tab-terms').classList.toggle('active',which==='terms');
      document.getElementById('legal-tab-privacy').classList.toggle('active',which==='privacy');
      body.innerHTML=textOf(which); body.scrollTop=0;
    }
    window.openLegal=function(which){ paint(which||'terms'); lm.style.display='flex'; };
    document.getElementById('legal-tab-terms').onclick=()=>paint('terms');
    document.getElementById('legal-tab-privacy').onclick=()=>paint('privacy');
    document.getElementById('legal-close-x').onclick=()=>{ lm.style.display='none'; };
    lm.addEventListener('click',(e)=>{ if(e.target===lm) lm.style.display='none'; });
    const lt=document.getElementById('link-terms'); if(lt) lt.onclick=(e)=>{ e.preventDefault(); openLegal('terms'); };
    const lp=document.getElementById('link-privacy'); if(lp) lp.onclick=(e)=>{ e.preventDefault(); openLegal('privacy'); };
  })();
};
