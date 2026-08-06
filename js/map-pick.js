/* ============================================================================
 *  IntMap · PICK A POINT ON THE MAP — window.IntMapPick  (#R196)
 * ----------------------------------------------------------------------------
 *  「地震シミュレーター、地点を選びなおせない。」
 *
 *  ── WHAT WAS WRONG, MEASURED ───────────────────────────────────────────────────────────────────
 *  Every "◎ place X on the map" button in this app did the same three things: set the cursor to a
 *  crosshair, register `GE().events.once('click', …)`, and LEAVE ITS OWN PANEL ON SCREEN. On a
 *  desktop that is fine. On a phone it is not, and the numbers say so — measured on a 390 × 844
 *  viewport with the seismic panel open:
 *
 *      #sq-panel   x 16 … 378   y 80 … 749      (362 × 669)
 *      #map        x  0 … 390   y  0 … 844
 *
 *  i.e. the panel covers 82 % of the map's height across all but two 16 px slivers, and what is
 *  left below it is the app's own collapsed sidebar. The app asked the user to tap the map and then
 *  stood on the map. `document.elementsFromPoint` at the only plausible tap point returned
 *  `DIV.sidebar collapsed`, never the canvas — so the epicentre could be placed once (by whoever
 *  opened the panel) and never moved. That is the report, exactly.
 *
 *  ── THE FIX IS ONE PLACE, NOT FIVE ─────────────────────────────────────────────────────────────
 *  The defect is not "the seismic panel is too big"; it is that a panel asks for a click on a
 *  surface it is covering. So the gesture itself is a module: while a pick is live the requesting
 *  panel is HIDDEN and a slim banner names what is being placed and offers ✕/Esc to cancel. The map
 *  is fully reachable on every screen size, on both engines, with no per-panel geometry to tune.
 *
 *  ⚠ `once('click')` is kept as the delivery mechanism — the panels' own handlers, the station
 *  table's click handler, and the tsunami probe's all still see the same event in the same order
 *  they always did (see the ⚠ note in js/seismic.js `onClick`). Nothing about event semantics
 *  changes here; only who is standing in front of the canvas.
 * ==========================================================================*/
window.IntMapPick=(function(){
  'use strict';
  const GE=()=>window.IntMapGeoEngine;
  function lang(){ try{ const s=JSON.parse(localStorage.getItem('intmap_settings')||'{}');
      if(s&&['en','jp','de','ru','es'].includes(s.lang)) return s.lang; }catch(_){}
    try{ const l=window.IntMapI18N&&window.IntMapI18N.lang&&window.IntMapI18N.lang(); if(l) return l; }catch(_){}
    return 'en'; }
  const L=(en,jp,de,ru,es)=>({en,jp,de,ru,es})[lang()]||en;

  let live=null, bar=null;

  function ensureBar(){
    if(bar) return bar;
    bar=document.createElement('div'); bar.id='im-pick-bar';
    /* ⚠ NOT a wide bar. It has to name the gesture without becoming the next thing that covers the
       map, so it is one line, centred, and pinned under the top chrome. */
    bar.style.cssText='position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 64px);'
      +'z-index:1600;display:none;align-items:center;gap:10px;max-width:min(440px,92vw);padding:8px 10px 8px 13px;'
      +'border-radius:999px;background:var(--card-bg,#1c1c1e);color:var(--text-main,#fff);'
      +'border:1px solid var(--glass-border,rgba(128,128,128,0.3));box-shadow:0 10px 30px rgba(0,0,0,0.4);'
      +'font-size:12.5px;font-weight:600;pointer-events:auto;';
    bar.innerHTML='<span class="im-pick-msg" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>'
      +'<button class="im-pick-x" style="flex:none;border:none;background:rgba(128,128,128,0.22);color:var(--text-main,#fff);'
      +'width:24px;height:24px;border-radius:50%;font-size:14px;line-height:1;cursor:pointer;">✕</button>';
    document.body.appendChild(bar);
    bar.querySelector('.im-pick-x').onclick=()=>cancel();
    return bar;
  }

  function _hide(el){ if(!el) return null; const prev=el.style.display; el.style.display='none'; return prev; }
  function _show(el,prev){ if(!el) return; el.style.display=(prev==null||prev==='none')?'flex':prev; }

  function _teardown(){
    if(!live) return;
    const s=live; live=null;
    try{ if(s.h) GE().events.off('click',s.h); }catch(_){}
    try{ GE().render.canvas().style.cursor=''; }catch(_){}
    try{ document.removeEventListener('keydown',s.esc,true); }catch(_){}
    if(bar) bar.style.display='none';
    /* the panel comes back exactly as it was — display, not a guess at 'flex' vs 'block' */
    if(s.panel&&s.hid) _show(s.panel,s.prevDisplay);
    return s;
  }

  /* Start a pick. o = { panel, hint, hidePanel, onPick(lngLat), onCancel } */
  function start(o){
    o=o||{};
    cancel();                                  /* only one gesture at a time — a second ◎ replaces the first */
    const panel=o.panel||null;
    const s={ panel, hid:false, prevDisplay:null, h:null, esc:null, onPick:o.onPick, onCancel:o.onCancel };
    if(panel&&o.hidePanel!==false){ s.prevDisplay=_hide(panel); s.hid=true; }
    const b=ensureBar();
    b.querySelector('.im-pick-msg').textContent=o.hint
      ||L('Tap the map to place it.','地図をタップして配置してください。','Zum Platzieren auf die Karte tippen.',
           'Нажмите на карту, чтобы разместить.','Toca el mapa para colocarlo.');
    b.style.display='flex';
    try{ GE().render.canvas().style.cursor='crosshair'; }catch(_){}
    s.esc=(e)=>{ if(e.key==='Escape'){ e.preventDefault(); cancel(); } };
    document.addEventListener('keydown',s.esc,true);
    s.h=(e)=>{ const ll=e&&e.lngLat; const st=_teardown();
      if(!ll||!st) return;
      try{ st.onPick&&st.onPick({ lng:(ll.lng!=null?ll.lng:ll[0]), lat:(ll.lat!=null?ll.lat:ll[1]) }, e); }catch(_){} };
    live=s;
    try{ GE().events.once('click',s.h); }catch(_){ /* no renderer — restore rather than strand the panel */
      const st=_teardown(); try{ st&&st.onCancel&&st.onCancel(); }catch(__){} return false; }
    return true;
  }

  function cancel(){ const s=_teardown(); if(s){ try{ s.onCancel&&s.onCancel(); }catch(_){} return true; } return false; }
  function active(){ return !!live; }

  /* the map is being taken away (a panel closed, the engine swapped) — drop the gesture silently */
  function abort(){ return !!_teardown(); }

  return { start, cancel, abort, active };
})();
