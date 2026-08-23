/* ============================================================================
 *  IntMap · Analysis panels — the EAGER SHELL of IntMapModules.{timeSeries,aiResearch,correlate,worldEvents,edu}
 * ----------------------------------------------------------------------------
 *  Panels that analyse the loaded data rather than draw layers: the shared time-series chart,
 *  the AI research brief, the two-layer correlation/scatter plot, the world-events archive and the
 *  geography quiz. The blocks were moved verbatim out of index.html's DOMContentLoaded closure
 *  (#R166); closure values which are REASSIGNED at runtime are read through the live host
 *  interface (Architecture.md §3.1): countryGeo → HOST.countryGeo, currentLang → HOST.lang,
 *  globalData → HOST.globalData, toolMode → HOST.toolMode.
 *
 *  ══ (#R322) WHAT IS STILL HERE, AND WHY IT IS NOT ALL OF IT ═══════════════════════════════════
 *  This file was 909 lines / 122 kB of the boot bundle, and #R311 measured why it could not simply
 *  be deferred like the other six: counting the statements a factory EXECUTES (rather than the code
 *  it defines) showed two of the five build UI at boot — `correlate` appends #btn-correlate to the
 *  Layers panel and `edu` mounts #edu-mount / #btn-edu and subscribes to map clicks. Deferring the
 *  file would have deleted two Layers buttons until something asked for a panel nobody could see.
 *
 *  So it is split by WHAT RUNS AT BOOT instead of by feature:
 *    · this file keeps the five factories, the boot-time DOM and listeners, and a thin async facade
 *      on each public global (window.IntMapTimeSeries / IntMapAIResearch / IntMapCorrelate /
 *      IntMapEdu / _dashView / _setDashView / _renderEventsArchive) — so every reader that existed
 *      before still finds what it expects, at boot, with the same name;
 *    · js/analysis-{timeseries,research,correlate,world-events,edu}.js hold the bodies, fetched by
 *      js/lazy-modules.js the first time a facade is called.
 *
 *  ⚠ THE FACADES ARE NOT STUBS. A stub answers open() and nothing else, which is the same silent
 *  hole one layer down (js/lazy-modules.js's header says why). Each facade awaits the loader and
 *  then calls the real function; the two entry points that must NOT fetch — IntMapEdu.close() and
 *  the map-click forwarder — ask `IntMapLazy.ready()` instead and do nothing when the answer is no,
 *  which is exactly what they did before the quiz had been opened.
 *
 *  Every factory is still called at the exact spot its block used to occupy (js/app-body.js), so
 *  execution order is unchanged. The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.timeSeries=function(HOST){
  window.IntMapTimeSeries=(function(){
    /* ⚠ (#R322) A LOAD FAILURE IS NEVER SILENT. This project's most expensive recurring defect is a
       feature that quietly stops existing (#R162, #R200, #R205, #R208), and "the file is not here
       yet" is a machine for producing it. js/lazy-modules.js records and console.errors every
       failure; this says it on the screen the user is looking at, because a button that does
       nothing at all tells them nothing at all. ⚠ The pair below is spelled out once per factory
       because a js/ module may hold no top-level declaration (tests/r175-checks ③) — the same reason
       GE / esc / jp are already written five times in this file. */
    function _lazyFail(){ const m=window.IntMapLang.t(HOST.lang,"This panel could not be loaded — check your connection and try again.","このパネルを読み込めませんでした。接続を確認して、もう一度お試しください。","Dieses Panel konnte nicht geladen werden — bitte Verbindung prüfen und erneut versuchen.","Не удалось загрузить эту панель — проверьте соединение и попробуйте ещё раз.","No se pudo cargar este panel: comprueba la conexión e inténtalo de nuevo.");
      try{ HOST.imToast(m); }catch(_){ try{ console.error('[IntMap] analysisTimeSeries: '+m); }catch(__){} } }
    function _impl(){ try{ if(!window.IntMapLazy) { _lazyFail(); return Promise.resolve(null); }
        return window.IntMapLazy.need('analysisTimeSeries').then(ok=>{ const I=window.__imAnalysisTimeSeries; if(!ok||!I){ _lazyFail(); return null; } return I; },()=>{ _lazyFail(); return null; });
      }catch(_){ _lazyFail(); return Promise.resolve(null); } }
    /* the chart, the six World Bank indicators and the crosshair are in js/analysis-timeseries.js */
    async function open(){ const I=await _impl(); if(I) return I.open(); }
    return { open };
  })();
};

window.IntMapModules.aiResearch=function(HOST){
  window.IntMapAIResearch=(function(){
    /* the loader and the failure notice — see the note above IntMapTimeSeries */
    function _lazyFail(){ const m=window.IntMapLang.t(HOST.lang,"This panel could not be loaded — check your connection and try again.","このパネルを読み込めませんでした。接続を確認して、もう一度お試しください。","Dieses Panel konnte nicht geladen werden — bitte Verbindung prüfen und erneut versuchen.","Не удалось загрузить эту панель — проверьте соединение и попробуйте ещё раз.","No se pudo cargar este panel: comprueba la conexión e inténtalo de nuevo.");
      try{ HOST.imToast(m); }catch(_){ try{ console.error('[IntMap] analysisResearch: '+m); }catch(__){} } }
    function _impl(){ try{ if(!window.IntMapLazy) { _lazyFail(); return Promise.resolve(null); }
        return window.IntMapLazy.need('analysisResearch').then(ok=>{ const I=window.__imAnalysisResearch; if(!ok||!I){ _lazyFail(); return null; } return I; },()=>{ _lazyFail(); return null; });
      }catch(_){ _lazyFail(); return Promise.resolve(null); } }
    /* the brief, the suggested questions and the chat thread are in js/analysis-research.js — and so
       are its two Atlas-persona prompts, which travelled with the code that builds them (#R285). */
    async function open(name,lngLat){ const I=await _impl(); if(I) return I.open(name,lngLat); }
    async function askHere(lngLat){ const I=await _impl(); if(I) return I.askHere(lngLat); }
    return { open, askHere };
  })();
};

window.IntMapModules.correlate=function(HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const countryStats=HOST.countryStats;
  (function(){
    if(typeof countryStats==='undefined') return;
    const L=()=>HOST.lang;
    const tr=window.IntMapLang.pick(()=>L());
    function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    /* the loader and the failure notice — see the note above IntMapTimeSeries */
    function _lazyFail(){ const m=window.IntMapLang.t(HOST.lang,"This panel could not be loaded — check your connection and try again.","このパネルを読み込めませんでした。接続を確認して、もう一度お試しください。","Dieses Panel konnte nicht geladen werden — bitte Verbindung prüfen und erneut versuchen.","Не удалось загрузить эту панель — проверьте соединение и попробуйте ещё раз.","No se pudo cargar este panel: comprueba la conexión e inténtalo de nuevo.");
      try{ HOST.imToast(m); }catch(_){ try{ console.error('[IntMap] analysisCorrelate: '+m); }catch(__){} } }
    function _impl(){ try{ if(!window.IntMapLazy) { _lazyFail(); return Promise.resolve(null); }
        return window.IntMapLazy.need('analysisCorrelate').then(ok=>{ const I=window.__imAnalysisCorrelate; if(!ok||!I){ _lazyFail(); return null; } return I; },()=>{ _lazyFail(); return null; });
      }catch(_){ _lazyFail(); return Promise.resolve(null); } }
    /* the overlay, the 62 metrics, the regression and the residual map are in js/analysis-correlate.js */
    function open(){ _impl().then(I=>{ if(I) I.open(); }); }
    window.IntMapCorrelate={open};
    /* (#R322) the residual-colour refresh is a READER, not a door: it repaints only when the residual
       fill is ALREADY on the map, which cannot be true before js/analysis-correlate.js has run — and
       that module replaces this global with its own the moment it does. Keeping the name here means it
       never disappears from window, and "there is nothing to repaint" is the same answer it gave
       before the panel had been opened. It must not fetch: a style reload is not a request for a panel. */
    window._refreshResidualColors=()=>{};
    const btnLbl=()=>tr('Correlation / scatter','相関・散布図','Korrelation / Streudiagramm','Корреляция / диаграмма','Correlación / dispersión');
    /* ⚠ THE BUTTON IS BUILT AT BOOT and it always was: #btn-correlate is a row of the Layers panel,
       and js/data-layers.js's reorganizeLayerPanel() MOVES it rather than creating it. Deferring this
       would delete a Layers button until somebody asked for the panel it opens (#R311 measured it). */
    (function mkBtn(){ if(document.getElementById('btn-correlate'))return; const b=document.createElement('button'); b.id='btn-correlate'; b.type='button'; b.className='ai-test-btn'; b.style.cssText='width:100%;text-align:center;'; b.innerHTML='📊 <span>'+esc(btnLbl())+'</span>'; b.onclick=open; (document.getElementById('layer-tools')||document.body).appendChild(b); try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} })();
    /* (#R322) the other half of what this listener always did — relabelling the two metric <select>s
       and re-rendering an open overlay — needs the overlay, so it is in js/analysis-correlate.js and is
       forwarded only when the loader says that file is here. A language switch must never be the thing
       that downloads a panel nobody opened; before the module has run there is no overlay to relabel,
       which is exactly what the `if(ov)` it replaces answered. */
    function _onLang(){ try{ if(window.IntMapLazy&&window.IntMapLazy.ready('analysisCorrelate')){ const I=window.__imAnalysisCorrelate; if(I&&I.onLang) I.onLang(); } }catch(_){} }
    window.addEventListener('intmap-lang',()=>{ const b=document.getElementById('btn-correlate'); if(b){ const sp=b.querySelector('span'); if(sp) sp.textContent=btnLbl(); } _onLang(); });
  })();
};

window.IntMapModules.worldEvents=function(HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const renderDashboard=HOST.renderDashboard;
  (function(){
    /* ⚠ THE VIEW FLAG IS SET AT BOOT. js/companies-ui.js reads window._dashView on every dashboard
       render, so it has to exist from the first one — the 132-event archive behind it does not. */
    window._dashView=window._dashView||'places';
    /* the loader and the failure notice — see the note above IntMapTimeSeries */
    function _lazyFail(){ const m=window.IntMapLang.t(HOST.lang,"This panel could not be loaded — check your connection and try again.","このパネルを読み込めませんでした。接続を確認して、もう一度お試しください。","Dieses Panel konnte nicht geladen werden — bitte Verbindung prüfen und erneut versuchen.","Не удалось загрузить эту панель — проверьте соединение и попробуйте ещё раз.","No se pudo cargar este panel: comprueba la conexión e inténtalo de nuevo.");
      try{ HOST.imToast(m); }catch(_){ try{ console.error('[IntMap] analysisEvents: '+m); }catch(__){} } }
    function _impl(){ try{ if(!window.IntMapLazy) { _lazyFail(); return Promise.resolve(null); }
        return window.IntMapLazy.need('analysisEvents').then(ok=>{ const I=window.__imAnalysisEvents; if(!ok||!I){ _lazyFail(); return null; } return I; },()=>{ _lazyFail(); return null; });
      }catch(_){ _lazyFail(); return Promise.resolve(null); } }
    /* EVENTS_DB, the year range and the card renderer are in js/analysis-world-events.js. Both doors
       below await the loader; the module then replaces window._renderEventsArchive with its own, so
       js/companies-ui.js's `typeof window._renderEventsArchive==='function'` test answers the same
       thing it always answered. */
    window._setDashView=function(v){ _impl().then(()=>{ window._dashView=v; try{ renderDashboard(); }catch(_){} }); };
    window._renderEventsArchive=function(dash,q){ _impl().then(I=>{ if(I&&I.render) I.render(dash,q); }); };
  })();
};

window.IntMapModules.edu=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  window.IntMapEdu=(function(){
    /* the loader and the failure notice — see the note above IntMapTimeSeries */
    function _lazyFail(){ const m=window.IntMapLang.t(HOST.lang,"This panel could not be loaded — check your connection and try again.","このパネルを読み込めませんでした。接続を確認して、もう一度お試しください。","Dieses Panel konnte nicht geladen werden — bitte Verbindung prüfen und erneut versuchen.","Не удалось загрузить эту панель — проверьте соединение и попробуйте ещё раз.","No se pudo cargar este panel: comprueba la conexión e inténtalo de nuevo.");
      try{ HOST.imToast(m); }catch(_){ try{ console.error('[IntMap] analysisEdu: '+m); }catch(__){} } }
    function _impl(){ try{ if(!window.IntMapLazy) { _lazyFail(); return Promise.resolve(null); }
        return window.IntMapLazy.need('analysisEdu').then(ok=>{ const I=window.__imAnalysisEdu; if(!ok||!I){ _lazyFail(); return null; } return I; },()=>{ _lazyFail(); return null; });
      }catch(_){ _lazyFail(); return Promise.resolve(null); } }
    /* the quiz itself — the seven modes, the silhouettes and the learning cards — is in js/analysis-edu.js */
    function open(){ _impl().then(I=>{ if(I) I.open(); }); }
    /* ⚠ CLOSING MUST NOT FETCH. An Atlas "close everything" sweep should not download a quiz in order
       to close one that was never opened (js/lazy-modules.js's header, same rule as `active()`), so
       this asks `ready()` and does nothing when the module is not here — which is what closing an
       unopened panel did before. */
    function _here(){ try{ return (window.IntMapLazy&&window.IntMapLazy.ready('analysisEdu'))?window.__imAnalysisEdu:null; }catch(_){ return null; } }
    function close(){ const I=_here(); if(I) I.close(); }
    /* ⚠ …AND NEITHER MUST A MAP CLICK. The subscription below is made at boot because that is when the
       renderer exists; the handler answers only for an armed map quiz, so before the module is here
       there is nothing to answer and nothing to download. */
    function onMapClick(e){ const I=_here(); if(I&&I.onMapClick) I.onMapClick(e); }
    /* (#R30) The Tools button that used to open Quiz mode now opens the PLAYGROUND (Quiz lives INSIDE the
       Playground hub) — "Playground自体は…旧quiz modeの場所に / Quiz modeをplaygroundに移動". */
    function mount(){ if(document.getElementById('edu-mount')) return;
      const host=document.createElement('div'); host.id='edu-mount'; host.style.marginTop='6px';
      host.innerHTML='<button id="btn-edu" class="ai-test-btn" style="width:100%;">🎮 <span>'+(window.IntMapLang.t(HOST.lang,"Playground","プレイグラウンド","Spielwiese","Песочница","Zona de pruebas"))+'</span></button>';
      const tools=document.getElementById('layer-tools'); const dd=document.getElementById('layer-dropdown');
      (tools||dd||document.body).appendChild(host);
      host.querySelector('#btn-edu').onclick=()=>{ window.IntMapLazy.need('playground').then(()=>{ try{ window._openPlayground&&window._openPlayground(); }catch(_){} }); };
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    if(GE().hasRenderer()) GE().events.on('click',onMapClick);
    if(document.readyState!=='loading') setTimeout(mount,500); else document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,500));
    window.addEventListener('intmap-lang',()=>{ const b=document.getElementById('btn-edu'); if(b) b.innerHTML='🎮 <span>'+(window.IntMapLang.t(HOST.lang,"Playground","プレイグラウンド","Spielwiese","Песочница","Zona de pruebas"))+'</span>'; });
    return { open, close };
  })();
};
