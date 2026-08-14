/* ============================================================================
 *  IntMap · the late translations, and the ticker’s own settings panel  (#R200)
 * ----------------------------------------------------------------------------
 *  Every UI string a later round added, in all five languages, merged into the shared i18n table
 *  before anything reads it — plus the bottom ticker's settings host, which is where its symbol and
 *  news choices are edited. Pure text and one small panel: nothing here touches the map.
 *
 *  Lifted verbatim out of js/app-body.js (#R200, second pass): 106 of its 107 lines are
 *  byte-identical, and the 1 that are not are all #R165's rule — a closure value
 *  js/app-body.js REASSIGNS at runtime is read through IM_HOST's live accessor
 *  (currentLang → HOST.lang), never captured when this factory ran.
 *  Everything else arrives through CTX under its ORIGINAL name, which is what lets the body stay
 *  word-for-word what it was. A real ES module: no window.IntMapModules entry, no src/main.js order.
 * ==========================================================================*/
export function makeI18nLate(HOST, CTX) {
  const i18n=CTX.i18n;
  /* =====================================================================
   *  ROUND 3 — settings persistence, scrollbars, translucent sidebar,
   *  screenshot, layer favorites, data-source list, unified time slider,
   *  animated wind layer, and assorted polish. Self-contained; runs after
   *  every other declaration so all helpers above are available.
   * ===================================================================== */


  /* (#R114) Accent colour picker — Settings → the UI accent (buttons, active tabs, sliders). 5 languages. */


  try{}catch(_){}
  try{}catch(_){}
  try{}catch(_){}
  /* (#R137) Countries rank-number toggle — 5 languages. */


  try{}catch(_){}
  try{}catch(_){}
  try{}catch(_){}
  /* (#R42) Share-this-view + Atlas console button tooltips — 5 languages. */


  try{}catch(_){}
  try{}catch(_){}
  try{}catch(_){}
  /* (#R62) layer-panel position setting — 5 languages */


  try{}catch(_){}
  try{}catch(_){}
  try{}catch(_){}
  /* (#R72) keyboard-shortcut help entry — 5 languages */


  try{}catch(_){}
  try{}catch(_){}
  try{}catch(_){}
  /* (#R207) the news COUNTRY mode select (now shaped like the language one) and the new OUTLET
     picker — 5 languages, added here for the same reason the ticker's keys are: this file runs before
     anything reads i18n, and these strings belong to controls built at settings-open time. */


  try{}catch(_){}
  try{}catch(_){}
  try{}catch(_){}
  /* (#R63) bottom news/markets ticker setting — 5 languages */


  try{}catch(_){}
  try{}catch(_){}
  try{}catch(_){}
  /* (#R102) new Countries sort keys (indicator pulldown labels + ascending/descending toggle) — 5 languages */


  try{}catch(_){}
  try{}catch(_){}
  try{}catch(_){}
  /* (#R102) ticker symbol/item picker in Settings — builds checkboxes from IntMapTicker's symbol registry + a News toggle,
     grouped by category; each change is applied & persisted immediately via IntMapTicker.setConfig. */
  /* ══ (#R207) THE ITEM PICKER IS PART OF "ON", NOT PART OF THE SETTING ═══════════════════════════
     「設定欄の下部ティッカー（ニュース・マーケット）の表示する項目選択欄は、オフ時は表示せず、オン時にだけ
      表示されるように。」 The picker was built unconditionally, so with the ticker off (which is the
     DEFAULT since #R170) every session opened Settings to a list of checkboxes choosing the contents
     of a strip that is not on screen.
     ⚠ READ FROM THE SELECT, NOT FROM `window.imTicker`. The select is what the user has just chosen;
     `imTicker` is what was last APPLIED, and between the two is exactly the moment this has to react
     in. Falls back to the applied value when the select is absent (Atlas can call this too). */
  window._populateTickerSyms=function(){ try{ const host=document.getElementById('ticker-syms'); const TK=window.IntMapTicker; if(!host||!TK||!TK.getConfig) return;
    const sel=document.getElementById('setting-ticker');
    const on=String((sel&&sel.value)||window.imTicker||'off')!=='off';
    host.style.display=on?'':'none';
    if(!on){ host.innerHTML=''; return; }
    const cf=TK.getConfig(); const L=(k)=>{ try{ return (i18n[HOST.lang]&&i18n[HOST.lang][k])||i18n.en[k]||k; }catch(_){ return k; } };
    const groups=[['fx',L('tkgFx')],['idx',L('tkgIdx')],['com',L('tkgCom')],['crypto',L('tkgCrypto')]];
    let html='<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">'+L('tkItems')+'</div>';
    html+='<div style="display:flex;flex-wrap:wrap;gap:6px 12px;">';
    groups.forEach(([g,gl])=>{ const items=cf.list.filter(s=>s.g===g); if(!items.length) return;
      html+='<div style="flex:1 1 44%;min-width:130px;"><div style="font-size:10.5px;font-weight:700;color:var(--text-muted);letter-spacing:.03em;margin:2px 0 3px;">'+gl+'</div>';
      items.forEach(s=>{ html+='<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;padding:2px 0;cursor:pointer;"><input type="checkbox" data-tks="'+s.k+'"'+(cf.syms.has(s.k)?' checked':'')+'> '+s.l+'</label>'; });
      html+='</div>'; });
    html+='</div>';
    html+='<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;padding:6px 0 0;margin-top:6px;border-top:1px solid var(--glass-border,rgba(128,128,128,0.18));cursor:pointer;"><input type="checkbox" data-tknews="1"'+(cf.news?' checked':'')+'> '+L('tkNews')+'</label>';
    host.innerHTML=html;
    const commit=()=>{ const syms=Array.from(host.querySelectorAll('input[data-tks]:checked')).map(c=>c.getAttribute('data-tks'));
      const news=!!host.querySelector('input[data-tknews]:checked'); try{ TK.setConfig({syms,news}); }catch(_){} };
    host.querySelectorAll('input[data-tks],input[data-tknews]').forEach(c=>c.addEventListener('change',commit));
  }catch(_){} };

}
