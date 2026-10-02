/* ============================================================================
 *  IntMap · js/layer-pkg-radar.js — LAYER PACKAGE: the RainViewer radar loop (dl-radar)
 * ----------------------------------------------------------------------------
 *  (layer-packages) The implementation of every row whose declaration says `pkg: 'radar'`
 *  (js/layers/dl-radar.js): the frame index read under a clock, the frames, the player in the legend
 *  (window._rvPlayer), the four-minute refresh, the switch and the opacity.
 *  It was the RainViewer block of js/data-layers.js, and moved here with its notes. Every moved line is the same bytes it was
 *  there — indented as it stood inside that file's factory, which is why the body sits one level deeper than this
 *  function needs — except that the names it shared with the rest of that file arrive in the kit (`K`) instead of
 *  through the closure; that the radar legend — which js/data-layers.js rebuilds on a language change — is read as
 *  `live.lgdRadar` where it is used; and the switch at the end, which was the row's branches of toggleLayer
 *  (the off half was the default `lyr-<id>` hide, the legend line and the timer line) and setLayerOpacity's default.
 *  The legend card itself is still built by js/data-layers.js (buildCoreLegends), with the others.
 *  js/data-layers.js fetches this module the first time the row is switched and calls the factory once; until then
 *  layerReads.radarIndex (the Layers-browser thumbnail) fetches it too. What the kit holds is written there
 *  (`packageKit`). tests/layer-manifest.spec.js ⑥ holds what the row draws equal to what it drew before the move.
 * ==========================================================================*/
import { jsonWithin } from './fetch-deadline.js';
import { IntMapLang } from './lang-registry.js';
import { layerState } from './layer-state.js';
import { clockFor } from './proxy-fetch.js';
import { everyTick, stopTick } from './runtime.js';
import { iconNode } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */

/** @param {any} K the layer kit js/data-layers.js hands every package (`packageKit` there)
    @returns {{ rows: Record<string, { on: () => any, off: () => void, opacity: (v: number) => void }> }} */
export function radarPackage(K) {
    const { GE, HOST, addRaster, layerReads, rowUntilObserved, satToast, setVis, tileLegends, whenStyleReady } = K;
    const live = K.live;   /* lgdRadar — reassigned in js/data-layers.js (a language change rebuilds the legends), so read where used, never copied */
    /* ══ (#R276) RAINVIEWER IS A LOOP NOW, AND THE DEAD HALF OF IT IS GONE ═══════════════════
       「RainViewerは最新1枚だけでなく、利用可能な過去フレームをアニメーション可能にする。フレーム時刻と
         経過時間を表示する。廃止済みSatellite IRと旧配色番号への依存は削除または現行データ源へ置換する。」

       MEASURED against the live API on 2026-08-20:
         · radar.past           -> 13 frames, 10 min apart, covering the last two hours;
         · radar.nowcast        -> 0 frames (a paid feature; handled if it ever appears);
         · satellite.infrared   -> 0 frames. The free satellite product is RETIRED, so `frames[len-1]`
           read `undefined`, rvTiles returned null, and the Clouds layer could only ever toast
           「Live weather data unavailable」 and untick itself. It has not worked since RainViewer
           withdrew it. It is replaced below by NASA GIBS geostationary clean-IR, which is current.
         · the colour-scheme number: schemes 0/2/3/6/7/8 return BYTE-IDENTICAL tiles and 1/4/5/9
           return the other one, so the free tier serves two palettes behind ten numbers. The app
           asked for 「4」 as if it were a choice. RV_SCHEME names the one we actually get. */
    let _rvData=null, _rvAt=0, _rvPending=null, _rvTimer=null;
    let _rvFrames=[], _rvIdx=-1, _rvPlay=false, _rvPlayT=0;
    const RV_SCHEME=4;                 /* the blue->red palette the two-palette free tier gives back */
    const RV_STEP_MS=520;              /* one radar frame per ~half second, the RainViewer pace */
    /* ══ ⚠⚠⚠ (#R482) THE FREE TILE CACHE STOPS AT z7, AND IT SAYS SO **IN THE PICTURE** ═════════
       「降水レーダー（実時間）レイヤーはある程度以上ズームしたら zoom level not supported と
         透かしがなります」
       MEASURED against tilecache.rainviewer.com on 2026-08-28, four continents, both tile sizes:
         z4-z7  real radar (neighbouring tiles differ from one another: 435 B – 19,100 B)
         z8+    ONE byte-identical 1,370 B PNG everywhere — a grey plate reading
                「Zoom Level Not Supported」. HTTP **200**. Same at z9…z15, over Tokyo / New York /
                London / Miami / Sydney, at /256/ and at /512/.
       ⚠ This is #R479's shape again: the request SUCCEEDS and the failure is painted into the
       image, so no error path, no onerror, no tile-count instrument can ever see it. The only
       place it is visible is the source's own zoom ceiling — which said **12**, five levels past
       the data, so MapLibre and Cesium dutifully asked for z8…z12 and got the plate back.
       ⚠ The fix is NOT to hide the layer above z7. Overzooming the z7 tile keeps the rain field on
       screen at every zoom, which is what the reader asked for, and the free mosaic is ~2 km/px:
       z7 (~1.2 km/px at the equator) is already at its native resolution, so the stretch adds
       blur, not error. ⚠ Do not raise this number again — a taller ceiling does not buy detail the
       free tier has, it buys the grey plate. */
    const RV_MAX_Z=7;                  /* deepest zoom the free tile cache serves radar at (measured) */
    /* ══ ⚠⚠ (stalled-fetch) THE FRAME INDEX IS READ UNDER A CLOCK — A STALLED READ IS A FAILED ONE ════
       The radar row's request (toggleLayer → `req`, handed to js/layer-rows.js `layerInflight`) is this
       read. With a bare `fetch` it had no end: a host that stopped answering left `_rvPending` pending
       for ever, so (a) the box stayed «in flight» and the reconciler never judged it again, (b) no toast
       ever said the weather could not be fetched, and (c) every later tick got the SAME dead promise
       back, because `_rvPending` is what a second caller is handed while a read is on its way.
       js/fetch-deadline.js `jsonWithin` is the app's clock for a direct JSON read, and it covers the
       BODY as well as the headers (#R452). Its deadline clears `_rvPending` (the next request starts a
       new read). ⚠ (unobserved-is-not-refused) It no longer reaches the row's failure arm the way a
       refusal does: the deadline is `isUnobserved`, so the row keeps its box and asks again with a longer
       clock (rowUntilObserved); only an answer — a status, a refusal, no frames — toasts 「Live weather
       data unavailable」 and unticks it.
       THE CLOCK is js/proxy-fetch.js `clockFor` — the host read directly, so DIRECT_TIMEOUT_MS (6 s,
       «hosts that answer quickly»), stated once, there.
         · observed 2026-09-28: five reads of the index from a home line, 0.97–1.24 s to the last byte,
           818 B each.
         · lapses if RainViewer's index stops being a sub-kilobyte file answered in about a second (the
           host then needs its own row in proxy-fetch's per-host table, as GDELT and the World Bank have). */
    const RV_INDEX_URL='https://api.rainviewer.com/public/weather-maps.json';
    /* (unobserved-is-not-refused) `scale` multiplies the clock — js/fetch-deadline.js `untilObserved` asks
       again with it doubled after a read that was not observed — and `_rvWhy` keeps what the last failed
       read threw, so the row can tell 「nothing was read in time」 from 「RainViewer said no」. The
       thumbnail (layerReads.radarIndex) still receives the index or null, as before. */
    let _rvWhy=null;
    function rvFetch(scale){
      if(_rvData && Date.now()-_rvAt<5*60000) return Promise.resolve(_rvData);
      if(_rvPending) return _rvPending;
      _rvPending=jsonWithin(RV_INDEX_URL,clockFor(RV_INDEX_URL)*Math.max(1,+scale||1))
        .then(j=>{ if(j){ _rvData=j; _rvAt=Date.now(); _rvWhy=null; rvRefreshFrames(); } _rvPending=null; return _rvData; })
        .catch(e=>{ _rvWhy=e||null; _rvPending=null; return null; });
      return _rvPending;
    }
    /* the row's read: the index, or a throw carrying why there is none */
    function rvRead(scale){ return rvFetch(scale).then(d=>{ if(d) return d;
      throw (_rvWhy||Object.assign(new Error('no radar index'),{reason:'empty'})); }); }
    layerReads.radarIndex=rvFetch;   /* (fetch-deadline-layer) the preview reads the frame index through the row's own read */
    function rvRefreshFrames(){
      const r=(_rvData&&_rvData.radar)||{};
      const was=(_rvIdx>=0)?_rvFrames[_rvIdx]:null;
      _rvFrames=(r.past||[]).concat(r.nowcast||[]);
      /* stay on the SAME INSTANT across a refresh; a reader watching -60 min should not be jumped to
         «now» just because a newer frame arrived at the end of the list */
      if(was&&_rvFrames.length){ let best=_rvFrames.length-1,bd=Infinity;
        _rvFrames.forEach((f,i)=>{ const d=Math.abs(f.time-was.time); if(d<bd){bd=d;best=i;} });
        _rvIdx=best; }
      else _rvIdx=_rvFrames.length-1;
    }
    function rvTiles(idx){
      if(!_rvData||!_rvFrames.length) return null;
      const host=_rvData.host||'https://tilecache.rainviewer.com';
      const f=_rvFrames[Math.max(0,Math.min(_rvFrames.length-1,idx==null?_rvIdx:idx))];
      if(!f) return null;
      return [host+f.path+'/256/{z}/{x}/{y}/'+RV_SCHEME+'/1_1.png'];
    }
    function rvFrameTime(){ const f=_rvFrames[_rvIdx]; return f?f.time*1000:null; }
    function addRainViewer(){
      const tiles=rvTiles(); if(!tiles) return false;
      try{ if(GE().layers.has('lyr-radar')) GE().layers.remove('lyr-radar'); if(GE().layers.hasSource('src-radar')) GE().layers.removeSource('src-radar'); }catch(_){}
      addRaster('radar',tiles,RV_MAX_Z);
      setVis('lyr-radar',true);
      rvUpdateLegend();
      return true;
    }
    /* Re-point the tiles rather than rebuild the source — MapLibre cross-fades between the old and the
       new tile set (raster-fade-duration), which is what stops a step looking like a blink. */
    function rvShow(idx){
      if(!_rvFrames.length) return;
      _rvIdx=Math.max(0,Math.min(_rvFrames.length-1,idx));
      const tiles=rvTiles();
      if(!(tiles&&GE().layers.setSourceTiles('src-radar',tiles))&&tiles) addRainViewer();
      rvUpdateLegend();
    }
    function rvStep(n){ if(!_rvFrames.length) return; rvShow((_rvIdx+n+_rvFrames.length)%_rvFrames.length); }
    function rvSetPlay(on){
      _rvPlay=!!on; clearTimeout(_rvPlayT);
      if(_rvPlay){ const tick=()=>{ if(!_rvPlay) return; rvStep(1);
        /* hold the newest frame a beat longer so the loop reads as a loop, not a stutter */
        _rvPlayT=setTimeout(tick,(_rvIdx===_rvFrames.length-1)?RV_STEP_MS*3:RV_STEP_MS); };
        _rvPlayT=setTimeout(tick,RV_STEP_MS); }
      rvUpdateLegend();
    }
    window._rvPlayer={ show:rvShow, step:rvStep, play:rvSetPlay, playing:()=>_rvPlay,
      frames:()=>_rvFrames.slice(), index:()=>_rvIdx, time:rvFrameTime };
    function rvUpdateLegend(){
      const box=live.lgdRadar&&live.lgdRadar.querySelector('.rv-player'); if(!box) return;
      const n=_rvFrames.length, tt=rvFrameTime();
      const sl=box.querySelector('#rv-time'); if(sl){ sl.max=Math.max(0,n-1); sl.value=Math.max(0,_rvIdx); }
      const pb=box.querySelector('.rv-b[data-act="play"]'); if(pb) pb.replaceChildren(iconNode(_rvPlay?'pause':'play'));
      const cap=box.querySelector('.rv-when');
      if(cap){
        if(!tt) cap.textContent=IntMapLang.t(HOST.lang,'no frames','フレームなし','keine Bilder','нет кадров','sin fotogramas');
        else{
          const mins=Math.round((Date.now()-tt)/60000);
          const clock=new Date(tt).toLocaleTimeString(IntMapLang.locale(HOST.lang,'en-GB'),{hour:'2-digit',minute:'2-digit'});
          const rel=(mins<=0)?IntMapLang.t(HOST.lang,'now','現在','jetzt','сейчас','ahora')
            :('−'+mins+' '+IntMapLang.t(HOST.lang,'min','分','Min.','мин','min'));
          cap.textContent=clock+' · '+rel+' · '+(_rvIdx+1)+'/'+n;
        }
      }
    }
    function rvAutoRefresh(){
      if(_rvTimer) return;
      _rvTimer=everyTick('data-layers:rainviewer-frames',240000,()=>{ _rvAt=0; rvFetch().then(()=>{
        if(GE().layers.has('lyr-radar')&&GE().layers.getLayout('lyr-radar','visibility')==='visible'){
          try{ const tiles=rvTiles(); if(!(tiles&&GE().layers.setSourceTiles('src-radar',tiles))&&tiles) addRainViewer(); }catch(_){}
          rvUpdateLegend();
        }
      }); });
    }
    /* (layer-packages) the row: what toggleLayer's branches and setLayerOpacity's default did for it */
    return { rows: {
      'dl-radar': {
        on: () => {
      let req;
          live.lgdRadar.style.display='block'; tileLegends();
          /* (unobserved-is-not-refused) a read that was not observed keeps the box ticked and asks again
             (rowUntilObserved); only an answer — a status, a refusal, an index with no frames — reaches
             the failure arm below. 'aborted' = unticked or re-ticked meanwhile: that switch owns the row. */
          /* (layer-failure-state) `why` is what the read threw — kept so the row's state says whether the host
             refused (failed) or never answered in time (unobserved); js/layer-state.js classifies it */
          let why=null;
          req=whenStyleReady().then(()=>rowUntilObserved('dl-radar',rvRead,clockFor(RV_INDEX_URL)))
            .then(()=>true,e=>{ if(e&&e.reason==='aborted') return null; why=e; return false; }).then(got=>{
            if(got===null) return;
            const on=document.getElementById('dl-radar'); if(!(on&&on.checked)) return;   /* nothing drawn behind a box that is off (CONSTITUTION §3) */
            if(!got||!addRainViewer()){
              try{ satToast(IntMapLang.t(HOST.lang,'Live weather data unavailable','気象データを取得できませんでした','Wetterdaten nicht verfügbar','Данные о погоде недоступны','Datos meteorológicos no disponibles')); }catch(_){}
              try{ layerState.report('dl-radar',got?{reason:'not-drawn'}:why,{told:true}); }catch(_){}
              const cb=document.getElementById('dl-radar'); if(cb){ cb.checked=false; const row=cb.closest('.lyr-row'); if(row) row.classList.remove('on'); }
              live.lgdRadar.style.display='none'; tileLegends();
              return;
            }
            rvAutoRefresh();
          });
      return req;
        },
        off: () => { setVis('lyr-radar',false); live.lgdRadar.style.display='none'; if(_rvTimer){ stopTick(_rvTimer); _rvTimer=null; } try{ rvSetPlay(false); }catch(_){} },
        opacity: (v) => { if(GE().layers.has('lyr-radar'))GE().layers.setPaint('lyr-radar','raster-opacity',v); },
      },
    } };
}
