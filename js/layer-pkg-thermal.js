/* ============================================================================
 *  IntMap · js/layer-pkg-thermal.js — LAYER PACKAGE: active fire / thermal anomalies (dl-thermal)
 * ----------------------------------------------------------------------------
 *  (layer-packages) The implementation of every row whose declaration says `pkg: 'thermal'`
 *  (js/layers/dl-thermal.js): the per-day GIBS probe, the stacked day layers of the 24/48/72 h window,
 *  their rebuild (window._refreshThermal) and opacity (window._setThermalOpacity), the switch.
 *  It was the FIRMS block of js/data-layers.js, and moved here with its notes. Every moved line is the same bytes it was
 *  there — indented as it stood inside that file's factory, which is why the body sits one level deeper than this
 *  function needs — except that the names it shared with the rest of that file arrive in the kit (`K`) instead of
 *  through the closure; that the fire legend — which js/data-layers.js rebuilds on a language change — is read as
 *  `live.lgdThermal` where it is used; and the switch at the end, which was the row's branches of toggleLayer and
 *  setLayerOpacity.
 *  The window itself (`window._thermalWindow`) stays in js/data-layers.js: it is the reader's setting, read by the
 *  legend and by js/map-ui.js before the row is ever switched.
 *  js/data-layers.js fetches this module the first time the row is switched and calls the factory once; what the
 *  kit holds is written there (`packageKit`). tests/layer-manifest.spec.js ⑥ holds what the row draws equal to
 *  what it drew before the move.
 * ==========================================================================*/
import { readWithin } from './fetch-deadline.js';
import { IntMapLang } from './lang-registry.js';
import { layerState } from './layer-state.js';
import { clockFor } from './proxy-fetch.js';

/** @param {any} K the layer kit js/data-layers.js hands every package (`packageKit` there)
    @returns {{ rows: Record<string, { on: () => any, off: () => void, opacity: (v: number) => void }> }} */
export function thermalPackage(K) {
    const { GE, HOST, beforeId, opacities, satToast, tileLegends, whenStyleReady } = K;
    const live = K.live;   /* lgdThermal — reassigned in js/data-layers.js (a language change rebuilds the legends), so read where used, never copied */
    /* Thermal anomalies / active fire (#R7) — REAL NASA FIRMS detections served through NASA GIBS WMS.
       Why GIBS, not FIRMS' own WMS: the FIRMS MapServer caps requests per IP, so a tiled web map (dozens
       of tiles per view) quickly trips its quota and every tile comes back as the red error image
       "You have exceeded the transaction limit" — exactly what the user saw. GIBS is NASA's purpose-built
       high-volume tile/WMS service (no per-IP transaction cap), it rasterizes the VIIRS (NOAA-20 + SNPP)
       and MODIS (Terra + Aqua) thermal-anomaly point layers to PNG, needs no key and returns CORS:*.
       Verified live: 200 image/png, Access-Control-Allow-Origin:*.
       Each WMS GetMap takes a single day (TIME=YYYY-MM-DD), so the 24/48/72 h "window" is built by
       stacking the most-recent N UTC days as separate raster layers (today + previous days). */
    const GIBS_FIRE_LAYERS='VIIRS_NOAA20_Thermal_Anomalies_375m_All,VIIRS_SNPP_Thermal_Anomalies_375m_All,MODIS_Terra_Thermal_Anomalies_All,MODIS_Aqua_Thermal_Anomalies_All';
    const THERMAL_IDS=['lyr-thermal','lyr-thermal-1','lyr-thermal-2','lyr-thermal-3'];
    let _thermalOn=false;
    function _utcDayISO(back){ return new Date(Date.now()-back*86400000).toISOString().slice(0,10); }
    function gibsThermalWMS(dayISO,layers){ return 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS='+(layers||GIBS_FIRE_LAYERS)+'&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+dayISO; }
    function thermalDayOffsets(){ const n={'24':2,'48':3,'72':4}[window._thermalWindow||'24']||2; const out=[]; for(let i=0;i<n;i++) out.push(i); return out; }
    /* (#R121) ROOT FIX — a combined LAYERS= GetMap fails ENTIRELY ("msShapefileOpen(): The requested shapefile
       cannot be found") when ANY one product has no data for that day (live-verified: VIIRS_SNPP missing for
       today & yesterday blanked the whole thermal layer). Probe each day once with a tiny GetMap, parse the
       failing product out of the ServiceException, and request only the products that actually draw. */
    /* (stalled-fetch) THE PROBE IS READ UNDER A CLOCK. It is the fire row's request (addFirmsThermal
       returns the day slots, each waiting on this), and a bare `fetch` to a GIBS that stopped answering
       held the row «in flight» for the session. js/fetch-deadline.js `readWithin` hands back the status,
       the type and the ServiceException text, all read inside the clock js/proxy-fetch.js `clockFor`
       gives the host read directly (DIRECT_TIMEOUT_MS, 6 s). A timed-out probe lands in the `catch`
       below — the path a refused one always took: keep the current list and let the layer try to draw.
         · observed 2026-09-28: three 4×4 probes, 1.19–1.35 s, 83 B image/png.
         · lapses if GIBS's WMS stops answering a 4×4 GetMap in about a second. */
    const _thermalDayCache={};
    async function _thermalLayersFor(day){ if(_thermalDayCache[day]!==undefined) return _thermalDayCache[day];
      let list=GIBS_FIRE_LAYERS.split(',');
      for(let t=0;t<4&&list.length;t++){
        try{ const M=20037508.34;
          const u='https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS='+list.join(',')+'&CRS=EPSG:3857&BBOX='+(-M)+','+(-M)+','+M+','+M+'&WIDTH=4&HEIGHT=4&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+day;
          const r=await readWithin(u,clockFor(u));
          const ct=r.type;
          if(r.ok&&ct.indexOf('image')>=0) break;
          const tx=r.text; const m=tx.match(/named '([^']+)'/)||tx.match(/named &#39;([^&#]+)&#39;/);
          if(!m||list.indexOf(m[1])<0){ list=[]; break; }
          list=list.filter(x=>x!==m[1]);
        }catch(_){ break; } }   /* network error or the clock → keep the current list (the layer may still draw) */
      _thermalDayCache[day]=list; return list; }
    function _clearThermal(){ THERMAL_IDS.forEach((lid,i)=>{ try{ if(GE().layers.has(lid)) GE().layers.remove(lid); }catch(_){} try{ const sid='src-thermal-'+i; if(GE().layers.hasSource(sid)) GE().layers.removeSource(sid); }catch(_){} }); }
    /* (heal-waits-for-inflight) returns the request — every day slot settled (js/layer-rows.js ④) */
    function addFirmsThermal(){
      _clearThermal();
      return Promise.all(thermalDayOffsets().map((off,i)=>{
        const sid='src-thermal-'+i, lid=THERMAL_IDS[i], day=_utcDayISO(off);
        return _thermalLayersFor(day).then(list=>{
          if(!list||!list.length) return;   /* no fire product at all for that day (yet) — skip the slot honestly */
          try{
            if(GE().layers.hasSource(sid)||GE().layers.has(lid)) return;   /* a re-toggle raced us */
            GE().layers.addSource(sid,{type:'raster',tiles:[gibsThermalWMS(day,list.join(','))],tileSize:256,attribution:'NASA FIRMS / GIBS — MODIS & VIIRS active fire'});
            GE().layers.add({id:lid,type:'raster',source:sid,layout:{visibility:_thermalOn?'visible':'none'},paint:{'raster-opacity':opacities.thermal}},beforeId);
          }catch(_){}
        }).catch(()=>{});
      }));
    }
    function setThermalVis(on){ _thermalOn=on; THERMAL_IDS.forEach(lid=>{ if(GE().layers.has(lid)) GE().layers.setLayout(lid,'visibility',on?'visible':'none'); }); }
    window._setThermalOpacity=function(v){ THERMAL_IDS.forEach(lid=>{ if(GE().layers.has(lid)) GE().layers.setPaint(lid,'raster-opacity',v); }); };
    /* Rebuild the stacked layers when the user switches the 24/48/72 h window in the legend. */
    window._refreshThermal=function(){
      const was=_thermalOn;
      try{ addFirmsThermal(); setThermalVis(was); }catch(e){ console.warn('thermal rebuild fail',e); }
    };
    /* (layer-packages) the row: what toggleLayer's branches and setLayerOpacity's one did for it */
    return { rows: {
      'dl-thermal': {
        on: () => {
      let req;
          live.lgdThermal.style.display='block'; tileLegends();
          req=whenStyleReady().then(()=>{ try{ const built=addFirmsThermal(); setThermalVis(true); return built; }catch(e){ console.warn('thermal (GIBS) fail',e); try{ layerState.report('dl-thermal',e,{told:true}); }catch(_){} const cb=document.getElementById('dl-thermal'); if(cb){cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on');} try{ satToast(IntMapLang.t(HOST.lang,'Active-fire data unavailable','火災データを取得できませんでした','Branddaten nicht verfügbar','Данные о пожарах недоступны','Datos de incendios no disponibles')); }catch(_){} } });
      return req;
        },
        off: () => { setThermalVis(false); live.lgdThermal.style.display='none'; },
        opacity: (v) => { try{ window._setThermalOpacity(v); }catch(_){} },
      },
    } };
}
