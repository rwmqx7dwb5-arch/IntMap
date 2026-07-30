/* ============================================================================
 *  IntMap · WHICH ENGINE RUNS THIS SESSION  (#R180)
 * ----------------------------------------------------------------------------
 *  「デフォルトはこれまで通りMapLibreだが、設定から選択すれば、Cesiumも選べるように。」
 *
 *  MapLibre is the default and stays the default: with nothing stored, or with
 *  anything stored that is not exactly 'cesium', this file does nothing at all
 *  and the app boots byte-for-byte as it did before. That is the property to
 *  protect — a second engine must not be able to change the first one's session.
 *
 *  ── WHY THE CHOICE IS MADE HERE, AND AT THIS MOMENT ─────────────────────────
 *  A renderer cannot be swapped after the scene exists: every source, layer,
 *  marker and camera hook in the app was created through whichever adapter was
 *  installed when app-body.js asked the contract for a view. So the decision has
 *  to be final BEFORE that call, and app-body makes it inside its
 *  DOMContentLoaded handler.
 *
 *  A `type="module"` script is deferred, and DOMContentLoaded does not fire until
 *  every deferred script has finished — so simply importing this file from
 *  src/main.js gives it a window in which the app has not started yet. But
 *  `import('cesium')` is ASYNCHRONOUS and this file must not use a top-level
 *  await (that would raise the build target for every visitor, including the
 *  MapLibre majority who never load Cesium at all). So instead: publish the
 *  promise as `window.IntMapEnginePending`, and let app-body's DOMContentLoaded
 *  handler wait for it. When there is no pending engine — the default — the
 *  handler runs synchronously exactly as before, with no promise in the path.
 *
 *  ── SWITCHING IS A RELOAD, AND SAYS SO ──────────────────────────────────────
 *  Changing the setting cannot re-render the live scene into a different
 *  renderer; the honest thing is to reload, and the Settings panel says that in
 *  all five languages rather than leaving the user to discover that nothing
 *  happened.
 * ==========================================================================*/
window.IntMapEngineSelect=(function(){
  'use strict';
  const KEY='intmap_engine';
  const VALID=['maplibre','cesium'];

  /* What the user chose. Anything unrecognised — a stale value, a hand-edited
     localStorage, a future engine name this build does not have — reads as the
     default, because an unknown engine is not a reason to fail to draw a map. */
  function choice(){
    try{ const v=localStorage.getItem(KEY); return VALID.indexOf(v)>0?v:'maplibre'; }
    catch(_){ return 'maplibre'; }
  }
  function set(v){
    const want=VALID.indexOf(v)>0?v:'maplibre';
    try{ localStorage.setItem(KEY,want); }catch(_){}
    return want;
  }
  /* Did this session actually END UP on the engine that was asked for? Not the
     same question as choice(): Cesium can fail to load (an offline first visit, a
     blocked chunk, no WebGL2) and the app then runs on MapLibre. #R162's lesson
     is that a silent fallback is a feature that vanishes without anyone knowing,
     so the Settings panel reads THIS, not the stored value. */
  function active(){
    try{ const id=window.IntMapGeoEngine&&window.IntMapGeoEngine.id&&window.IntMapGeoEngine.id();
      return id||'maplibre'; }catch(_){ return 'maplibre'; }
  }
  let _failed=null;
  function failure(){ return _failed; }

  /* Kicked off at import time — see the header for why this is early enough. */
  function begin(){
    if(choice()!=='cesium') return null;
    const p=(async()=>{
      try{
        /* WebGL2 is not optional for this engine, and finding that out from a
           blank canvas is worse than not starting: check first and stay on the
           renderer that works. */
        let ok2=false;
        try{ const c=document.createElement('canvas'); ok2=!!(c.getContext('webgl2')); }catch(_){}
        if(!ok2){ _failed='webgl2'; return false; }
        await import('./cesium-style.js');
        await import('./cesium-layers.js');
        await import('./cesium-vector-tiles.js');
        const mod=await import('./cesium-engine.js');
        void mod;
        const ok=await window.IntMapCesiumEngine.boot();
        if(!ok) _failed='boot';
        return ok;
      }catch(e){ _failed=String((e&&e.message)||e); console.warn('[IntMap] falling back to MapLibre:',e); return false; }
    })();
    try{ window.IntMapEnginePending=p; }catch(_){}
    return p;
  }

  const api={ KEY, VALID, choice, set, active, failure, begin,
    /* the label the UI shows, in the five languages the standing instructions
       require every user-visible string to exist in */
    label(id,lang){
      const L={ maplibre:{ en:'MapLibre (default)', jp:'MapLibre（既定）', de:'MapLibre (Standard)',
                           ru:'MapLibre (по умолчанию)', es:'MapLibre (predeterminado)' },
                cesium:{ en:'Cesium — true 3-D globe', jp:'Cesium — 真の3D地球儀',
                         de:'Cesium — echter 3-D-Globus', ru:'Cesium — настоящий 3D-глобус',
                         es:'Cesium — globo 3-D real' } }[id]||{};
      return L[lang]||L.en||id;
    } };
  api.begin();
  return api;
})();
