/* ============================================================================
 *  IntMap · ASKING INSIDE THE APP, NOT THROUGH THE BROWSER
 * ----------------------------------------------------------------------------
 *  window.confirm() / window.prompt() are the one piece of UI IntMap cannot style, cannot translate
 *  beyond the string it passes, and cannot show a hint or a danger colour in. They also depend on the
 *  host letting a page open a native dialog at all: on iOS they arrive as "127.0.0.1 says…", naming
 *  the origin instead of the app, and in an embedded view (the Claude desktop app's browser pane) the
 *  host swallows them and answers "no" — so a choice that needed a confirmation silently did nothing.
 *
 *  This is the one asker. It was written for the account sheet (js/auth-ui.js, five dialogs) and lifted
 *  here so the next caller does not write a second one: the same judgement written twice is the shape
 *  .agents/rules/no-ad-hoc-hardcoding.md §2-3 forbids. The markup keeps its `acct-ask-*` class names
 *  (css/intmap.css) — they are styling hooks, and renaming them would move every rule for no change in
 *  what a reader sees.
 *
 *  askInApp(options, getLang) → Promise
 *    resolves to the typed text on confirm ('' when there is no field), and to null on cancel, so a
 *    caller reads it exactly the way it read prompt()/confirm().
 *    options: { title, body?, input?:{type,placeholder,autocomplete}, confirmLabel?, danger?, effect? }
 *    getLang: the live language accessor, used for the two default button labels.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';

export function askInApp(o, getLang){
  o=o||{};
  const L=IntMapLang.pick(getLang||(()=>undefined));
  return new Promise(resolve=>{
    let d=document.getElementById('acct-ask');
    if(!d){ d=document.createElement('div'); d.id='acct-ask';
      d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:calc(var(--z-overlay) + 20);padding:20px;';   /* ⚠ ABOVE every .modal-overlay (z-modal − 1): a question asked from inside Settings must sit over Settings. At z-toast + 2400 it opened under the settings dialog, where its buttons could not be pressed — the only reason the account sheet got away with it is that its own panel is lower. */
      d.innerHTML='<div class="acct-ask-box" role="dialog" aria-modal="true" aria-labelledby="acct-ask-h">'
        +'<h3 class="acct-ask-h" id="acct-ask-h"></h3>'
        +'<p class="acct-ask-b" id="acct-ask-b"></p>'
        +'<input id="acct-ask-in" class="acct-ask-in" hidden>'
        +'<button class="acct-ask-go" id="acct-ask-go"></button>'
        +'<button class="acct-ask-no" id="acct-ask-no"></button></div>';
      document.body.appendChild(d);
    }
    const box=d.querySelector('.acct-ask-box'), h=document.getElementById('acct-ask-h'), b=document.getElementById('acct-ask-b'),
          inp=document.getElementById('acct-ask-in'), go=document.getElementById('acct-ask-go'), no=document.getElementById('acct-ask-no');
    h.textContent=o.title||''; b.textContent=o.body||''; b.hidden=!o.body;
    inp.hidden=!o.input; inp.value=''; inp.type=(o.input&&o.input.type)||'text';
    inp.placeholder=(o.input&&o.input.placeholder)||''; inp.autocomplete=(o.input&&o.input.autocomplete)||'off';
    go.textContent=o.confirmLabel||L('Confirm','確認','Bestätigen','Подтвердить','Confirmar');
    no.textContent=L('Cancel','キャンセル','Abbrechen','Отмена','Cancelar');
    go.classList.toggle('acct-ask-danger',!!o.danger);
    /* (atlas-outward-effects) the confirm button — and the field whose Enter confirms — declare what they
       confirm, so a press that did not come from the reader is asked about (js/atlas-controls.js _effectOf) */
    [go,inp].forEach(x=>{ if(o.effect) x.setAttribute('data-effect',o.effect); else x.removeAttribute('data-effect'); });
    /* one live listener set per call — replaced wholesale, never accumulated */
    const done=(v)=>{ d.style.display='none'; document.removeEventListener('keydown',key,true); resolve(v); };
    /* Escape is the dialog registry's (js/dialog.js) — it closes the topmost dialog, which is this one when it is up */
    const key=(e)=>{ if(e.key==='Enter'&&(o.input?document.activeElement===inp:true)){ done(inp.hidden?'':inp.value); } };
    go.onclick=()=>done(inp.hidden?'':inp.value);
    no.onclick=()=>done(null);
    d.onclick=(e)=>{ if(e.target===d) done(null); };
    document.addEventListener('keydown',key,true);
    d.style.display='flex';
    window.IntMapDialog.adopt(d,{ panel:box, labelledby:'acct-ask-h', close:()=>done(null), focus:false });
    try{ (o.input?inp:go).focus(); }catch(_){}
    try{ box.scrollTop=0; }catch(_){}
  });
}
