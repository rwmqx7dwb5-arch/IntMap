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

  /* ══ (#R207) THE PANEL STOPS BLOCKING THE MAP WITHOUT LEAVING THE SCREEN ═══════════════════════
     「震源地を設置ボタンを押すとポップアップが消えるのは不要。」

     #R196 (the block above) is right about the defect and its fix went one step too far: the problem
     it measured is that the panel STANDS ON the canvas, and the remedy it chose was to take the panel
     away. Those are not the same thing. `pointer-events:none` removes the panel from hit-testing
     entirely — `document.elementsFromPoint` at any point over it then returns the canvas — so the tap
     reaches the map through the panel, and the panel is still there to read while it does.

     That keeps BOTH halves: the phone case #R196 measured (82 % of the map covered) still works,
     because coverage stops mattering once the cover is transparent to input, and the panel no longer
     vanishes on a desktop where it never needed to.

     ⚠ (#R210) THE FADE IS GONE. #R207 also set `opacity:0.55` so that "a panel that cannot be
     touched must not look like one that can" — and the reply to that was 「震源地を設置ボタンを押すと
     ポップアップが透過されるのをやめろ。クソ挙動。」 The fade was solving a problem the panel already
     solves in text: the ◎ button flips to 「地図をタップ…」 with the accent fill, and the hint bar
     appears at the top of the screen. Those say "armed" without making the numbers underneath hard
     to read at the exact moment the user is reading them to decide where to tap.

     `pointerEvents` is the half that does the work and it stays. `op` stays in the saved record
     (and is restored) so a caller that had set its own inline opacity still gets it back untouched. */
  /* ══ ⚠ (#R219) …AND THE BUTTONS WENT WITH IT ═══════════════════════════════════════════════════
     「◎ 震源地を設置・移動をクリックしたら、その後にポップアップ上でクリックしても、その直下の地図が
      クリックされた判定になってしまう。」 `pointer-events:none` on the panel is inherited by everything
     inside it, so while the pick was armed the ◎ button that armed it — and the depth, the magnitude,
     the ✕ — were all transparent too: pressing ◎ again to change your mind DROPPED THE EPICENTRE
     UNDER THE BUTTON. The panel could be read and not touched, and nothing said so.

     What #R196/#R207 need is that the panel's SURFACE lets a tap through, not that its controls stop
     being controls. Those are separable in one line of CSS: the box is `none`, its own interactive
     descendants are `auto` (css/intmap.css `.im-pick-ghost`). Tapping the panel's background still
     places the epicentre underneath — the phone case #R196 measured — and tapping a control still
     works the control. */
  function _ghost(el){ if(!el) return null;
    const prev={ pe:el.style.pointerEvents, op:el.style.opacity };
    el.style.pointerEvents='none';
    try{ el.classList.add('im-pick-ghost'); }catch(_){}
    return prev; }
  function _unghost(el,prev){ if(!el||!prev) return;
    try{ el.classList.remove('im-pick-ghost'); }catch(_){}
    el.style.pointerEvents=prev.pe||''; el.style.opacity=prev.op||''; }

  function _teardown(){
    if(!live) return;
    const s=live; live=null;
    try{ if(s.h) GE().events.off('click',s.h); }catch(_){}
    try{ GE().render.canvas().style.cursor=''; }catch(_){}
    try{ document.removeEventListener('keydown',s.esc,true); }catch(_){}
    if(bar) bar.style.display='none';
    /* (#R207) the panel comes back exactly as it was — the two inline properties that were changed */
    if(s.panel&&s.hid) _unghost(s.panel,s.prevStyle);
    return s;
  }

  /* Start a pick. o = { panel, hint, hidePanel, onPick(lngLat), onCancel } */
  function start(o){
    o=o||{};
    cancel();                                  /* only one gesture at a time — a second ◎ replaces the first */
    const panel=o.panel||null;
    const s={ panel, hid:false, prevStyle:null, h:null, esc:null, onPick:o.onPick, onCancel:o.onCancel };
    /* (#R207) `hidePanel` keeps its name and its callers — what it does is now "get the panel out of
       the way of the pointer", which is the thing every caller actually wanted. */
    if(panel&&o.hidePanel!==false){ s.prevStyle=_ghost(panel); s.hid=true; }
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
