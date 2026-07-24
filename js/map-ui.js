/* ============================================================================
 *  IntMap · Map chrome — IntMapModules.{layerRegistry,layerSidebar,ticker,layerPresets,labelPopup,geojsonUpload,viewHash,share}  (#R166)
 * ----------------------------------------------------------------------------
 *  The UI wrapped around the map: the layer registry, the right-hand layer sidebar, the news
 *  ticker strip, layer presets, the click-a-label popup, user GeoJSON upload, the shareable view hash
 *  and the share panel.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R166): each body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang
 *      currentMapType -> HOST.mapType
 *      currentProj -> HOST.proj
 *      globalData -> HOST.globalData
 *      toolMode -> HOST.toolMode
 *
 *  Every factory is called at the exact spot its block used to occupy, so execution order is
 *  unchanged. The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.layerRegistry=function(map,HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const demElevAt=HOST.demElevAt;
  window.IntMapLayers=(function(){
    const REG={};
    const L5=(en,jp2,de,ru,es)=>({en,jp:jp2,de,ru,es})[typeof HOST.lang!=='undefined'?HOST.lang:'en']||en;
    const isOn=id=>{ const cb=document.getElementById('dl-'+id)||document.getElementById(id); return !!(cb&&cb.checked); };
    const _numCache=new Map();   /* per (kind,0.25°cell) numeric cache shared by all Open-Meteo samplers */
    async function _om(kind,lng,lat){ const q=v=>Math.round(v*4)/4, qla=q(lat), qlo=q(lng), key=kind+':'+qla+','+qlo;
      if(_numCache.has(key)) return _numCache.get(key);
      let url=null,pick=null,unit='';
      if(kind==='temp'){ url='https://api.open-meteo.com/v1/forecast?latitude='+qla+'&longitude='+qlo+'&current=temperature_2m'; pick=j=>j.current&&j.current.temperature_2m; unit='°C'; }
      else if(kind==='sst'){ url='https://marine-api.open-meteo.com/v1/marine?latitude='+qla+'&longitude='+qlo+'&current=sea_surface_temperature'; pick=j=>j.current&&j.current.sea_surface_temperature; unit='°C'; }
      else if(kind==='wind'){ url='https://api.open-meteo.com/v1/forecast?latitude='+qla+'&longitude='+qlo+'&current=wind_speed_10m,wind_direction_10m'; pick=j=>j.current&&(j.current.wind_speed_10m!=null?(j.current.wind_speed_10m+' km/h @'+Math.round(j.current.wind_direction_10m||0)+'°'):null); unit=''; }
      else if(kind==='precip'){ url='https://api.open-meteo.com/v1/forecast?latitude='+qla+'&longitude='+qlo+'&current=precipitation'; pick=j=>j.current&&j.current.precipitation; unit=' mm/h'; }
      else if(kind==='snow'){ url='https://api.open-meteo.com/v1/forecast?latitude='+qla+'&longitude='+qlo+'&hourly=snow_depth&forecast_days=1'; pick=j=>j.hourly&&j.hourly.snow_depth&&j.hourly.snow_depth[0]; unit=' m'; }
      else if(kind==='aod'){ url='https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+qla+'&longitude='+qlo+'&current=aerosol_optical_depth'; pick=j=>j.current&&j.current.aerosol_optical_depth; unit=''; }
      else if(kind==='no2'){ url='https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+qla+'&longitude='+qlo+'&current=nitrogen_dioxide'; pick=j=>j.current&&j.current.nitrogen_dioxide; unit=' µg/m³'; }
      else if(kind==='co'){ url='https://air-quality-api.open-meteo.com/v1/air-quality?latitude='+qla+'&longitude='+qlo+'&current=carbon_monoxide'; pick=j=>j.current&&j.current.carbon_monoxide; unit=' µg/m³'; }
      if(!url) return null;
      try{ const r=await fetch(url); if(!r.ok) return null; const j=await r.json(); const v=pick(j);
        const out=(v==null||v==='')?null:(typeof v==='number'?(Math.round(v*100)/100+unit):String(v));
        if(out!=null) _numCache.set(key,out); return out; }catch(_){ return null; } }
    function _srcFeatsIn(srcId,bounds){ try{ const s=map.getSource(srcId); if(!s||!s.serialize) return null; const d=s.serialize().data; if(!d||!Array.isArray(d.features)) return null;
      const b=bounds||map.getBounds(); const w=b.getWest?b.getWest():b[0][0], e=b.getEast?b.getEast():b[1][0], so=b.getSouth?b.getSouth():b[0][1], n=b.getNorth?b.getNorth():b[1][1];
      return d.features.filter(f=>{ try{ const c=f.geometry&&f.geometry.type==='Point'&&f.geometry.coordinates; return c&&c[0]>=w&&c[0]<=e&&c[1]>=so&&c[1]<=n; }catch(_){ return false; } }); }catch(_){ return null; } }
    function register(id,impl){ REG[id]=impl||{}; }
    function list(){ return Object.keys(REG); }
    function activeIds(){ return Object.keys(REG).filter(id=>{ try{ const r=REG[id]; return r.on?!!r.on():isOn(id); }catch(_){ return false; } }); }
    function state(id){ const r=REG[id]; if(!r) return null; const g=(fn,fb)=>{ try{ return r[fn]?r[fn]():fb; }catch(_){ return fb; } };
      return { id, on:(r.on?!!r.on():isOn(id)), label:g('label',id), time:g('time',null), source:g('source',null), legend:g('legend',null) }; }
    async function sampleAt(lng,lat,ids){ const out=[]; const use=(ids&&ids.length)?ids:activeIds();
      for(const id of use){ const r=REG[id]; if(!r||!r.sampleAt) continue;
        try{ const v=await Promise.resolve(r.sampleAt(lng,lat)); if(v!=null&&v!=='') out.push({ id, label:state(id).label, value:v }); }catch(_){} }
      return out; }
    function featuresIn(id,bounds){ const r=REG[id]; if(!r||!r.featuresIn) return null; try{ return r.featuresIn(bounds); }catch(_){ return null; } }
    function context(){ try{ return activeIds().map(id=>{ const s=state(id); if(!s) return null; const bits=[];
        if(s.time) bits.push('time='+s.time); if(s.source) bits.push('src='+s.source);
        try{ const r=REG[id]; if(r.summary){ const sm=r.summary(); if(sm) bits.push(sm); } }catch(_){}
        return s.label+(bits.length?(' ['+bits.join(' · ')+']'):''); }).filter(Boolean); }catch(_){ return []; } }
    /* ---- first registration set: the layers with REAL live data hooks ---- */
    const _ld=k=>{ try{ return (window._imLayerDates&&window._imLayerDates[k])||null; }catch(_){ return null; } };
    register('temp',   { label:()=>L5('Air temperature','気温','Lufttemperatur','Темп. воздуха','Temp. del aire'), sampleAt:(x,y)=>_om('temp',x,y), time:()=>_ld('temp'), source:()=>'NASA GIBS (AIRS) / Open-Meteo' });
    register('sst',    { label:()=>L5('Sea surface temp','海面水温','Meerestemperatur','Темп. моря','Temp. del mar'), sampleAt:(x,y)=>_om('sst',x,y), time:()=>_ld('sst'), source:()=>'NASA GIBS / Open-Meteo marine' });
    register('wind',   { label:()=>L5('Wind','風','Wind','Ветер','Viento'), sampleAt:(x,y)=>_om('wind',x,y), source:()=>'Open-Meteo' });
    register('precip', { label:()=>L5('Precipitation','降水','Niederschlag','Осадки','Precipitación'), sampleAt:(x,y)=>_om('precip',x,y), time:()=>_ld('precip'), source:()=>'NASA GIBS (IMERG) / Open-Meteo' });
    register('snow',   { label:()=>L5('Snow & ice','積雪・氷','Schnee & Eis','Снег и лёд','Nieve y hielo'), sampleAt:(x,y)=>_om('snow',x,y), time:()=>_ld('snow'), source:()=>'NASA GIBS / Open-Meteo' });
    register('aod',    { label:()=>L5('Aerosol / haze','エアロゾル','Aerosol','Аэрозоль','Aerosol'), sampleAt:(x,y)=>_om('aod',x,y), time:()=>_ld('aod'), source:()=>'NASA GIBS / Open-Meteo air-quality' });
    register('no2',    { label:()=>'NO₂', sampleAt:(x,y)=>_om('no2',x,y), time:()=>_ld('no2'), source:()=>'NASA GIBS / Open-Meteo air-quality' });
    register('co',     { label:()=>'CO', sampleAt:(x,y)=>_om('co',x,y), time:()=>_ld('co'), source:()=>'NASA GIBS / Open-Meteo air-quality' });
    register('climate',{ label:()=>L5('Köppen climate','ケッペン気候区分','Köppen-Klima','Климат Кёппена','Clima de Köppen'),
      sampleAt:(x,y)=>{ try{ const c=window.sampleKoppenAt&&window.sampleKoppenAt(x,y); if(!c) return null; const nm=window.KNAME&&window.KNAME[c]; return c+(nm?(' · '+(nm[HOST.lang]||nm.en)):''); }catch(_){ return null; } },
      time:()=>{ try{ return window._koppenPeriod||null; }catch(_){ return null; } }, source:()=>'Beck et al. Köppen-Geiger' });
    register('webcams',{ label:()=>L5('Live cameras','ライブカメラ','Live-Kameras','Камеры','Cámaras en vivo'),
      featuresIn:b=>_srcFeatsIn('webcams-src',b), summary:()=>{ const f=_srcFeatsIn('webcams-src',null); return f?(f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')):null; }, source:()=>'OSM/DOT public cams' });
    register('news',   { label:()=>L5('News points','ニュース地点','Nachrichtenpunkte','Точки новостей','Puntos de noticias'),
      on:()=>{ const f=_srcFeatsIn('news-points',null); return !!(f&&f.length); },
      featuresIn:b=>_srcFeatsIn('news-points',b), summary:()=>{ const f=_srcFeatsIn('news-points',null); return f?(f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')):null; } });
    register('volcanoes',{ label:()=>L5('Volcanoes','火山','Vulkane','Вулканы','Volcanes'), on:()=>{ try{ return !!(map.getLayer('volc2-pt')&&map.getLayoutProperty('volc2-pt','visibility')!=='none'); }catch(_){ return false; } },
      featuresIn:b=>_srcFeatsIn('volc2-src',b), source:()=>'Smithsonian GVP' });
    register('elevation',{ label:()=>L5('Elevation','標高','Höhe','Высота','Elevación'), on:()=>true,
      sampleAt:(x,y)=>{ try{ const v=(typeof demElevAt==='function')?demElevAt(x,y):null; return (v==null)?null:(Math.round(v)+' m'); }catch(_){ return null; } }, source:()=>'Mapzen/AWS terrarium DEM' });
    /* ---- (#R120) live traffic layers — the REAL features currently on the map (same geojson the symbols paint) ---- */
    const _lyrVis=id=>{ try{ return !!(map.getLayer(id)&&map.getLayoutProperty(id,'visibility')==='visible'); }catch(_){ return false; } };
    register('aircraft',{ label:()=>L5('Live aircraft','航空機（リアルタイム）','Live-Flugverkehr','Самолёты (онлайн)','Aviones en vivo'),
      on:()=>_lyrVis('lyr-planes'), featuresIn:b=>_srcFeatsIn('src-planes',b),
      summary:()=>{ const f=_srcFeatsIn('src-planes',null); return f?(f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')):null; }, source:()=>'airplanes.live ADS-B' });
    register('ships',{ label:()=>L5('Live ships','船舶（リアルタイム）','Live-Schiffe','Суда (онлайн)','Barcos en vivo'),
      on:()=>_lyrVis('lyr-ships'), featuresIn:b=>_srcFeatsIn('src-ships',b),
      summary:()=>{ const f=_srcFeatsIn('src-ships',null); return f?(f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')):null; }, source:()=>'aisstream.io AIS' });
    /* ---- (#R120/#R121) country choropleths — the value of every VISIBLE choropleth family at a point.
       Core stat fills go through window.choroValueAt (countryStats; R121: works OFF-SCREEN too via
       point-in-polygon over countryGeo), the World-Bank beta fills carry their raw value in the feature
       properties (R121: PIP over the source data when the point is off screen), and the ~40 bx World-Bank
       choropleths report through window._imBxChoroValueAt (registered by their own module). ---- */
    /* shared point-in-polygon (Polygon/MultiPolygon with holes) — also used by choroValueAt & the bx module */
    window._imPipGeo=function(x,y,g){ const ring=r=>{ let ins=false; for(let i=0,j=r.length-1;i<r.length;j=i++){ const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1]; if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi)) ins=!ins; } return ins; };
      const poly=p=>{ if(!p||!p.length||!ring(p[0])) return false; for(let k=1;k<p.length;k++){ if(ring(p[k])) return false; } return true; };
      try{ if(!g) return false; if(g.type==='Polygon') return poly(g.coordinates); if(g.type==='MultiPolygon') return g.coordinates.some(poly); }catch(_){} return false; };
    const _WBF={ 'wb-cpi-f':{src:'wb-cpi',lb:()=>L5('Corruption (control, WGI)','汚職・腐敗指標','Korruptionsindex','Индекс коррупции','Índice de corrupción'),fmt:p=>Math.round(+p.s)+' / 100'},
      'wb-le-f':{src:'wb-le',lb:()=>L5('Life expectancy','平均寿命','Lebenserwartung','Продолжительность жизни','Esperanza de vida'),fmt:p=>(+p.raw).toFixed(1)+' '+L5('yrs','年','J.','лет','años')},
      'wb-unemp-f':{src:'wb-unemp',lb:()=>L5('Unemployment','失業率','Arbeitslosenquote','Безработица','Desempleo'),fmt:p=>(+p.raw).toFixed(1)+'%'},
      'wb-internet-f':{src:'wb-internet',lb:()=>L5('Internet users','インターネット普及率','Internetnutzer','Пользователи интернета','Usuarios de internet'),fmt:p=>(+p.raw).toFixed(1)+'%'},
      'wb-precip-f':{src:'wb-precip',lb:()=>L5('Annual precipitation','年降水量','Jahresniederschlag','Годовые осадки','Precipitación anual'),fmt:p=>Math.round(+p.raw)+' mm'} };
    const _CHF=['pop','hdi','dem','milSpend','milSpendGDP','gdppc','tfr'].map(id=>id+'-fill');
    const _srcData=sid=>{ try{ const s=map.getSource(sid); if(!s) return null; if(s._data&&s._data.features) return s._data; const d=s.serialize&&s.serialize().data; return (d&&d.features)?d:null; }catch(_){ return null; } };
    register('choropleth',{ label:()=>L5('Country choropleth','国別コロプレス','Länder-Choroplethe','Хороплет по странам','Coropleta por países'),
      on:()=>_CHF.some(_lyrVis)||Object.keys(_WBF).some(_lyrVis)||!!(window._imBxChoroOn&&window._imBxChoroOn()),
      sampleAt:(x,y)=>{ const outs=[];
        try{ const v=window.choroValueAt&&window.choroValueAt(x,y); if(v) outs.push(v); }catch(_){}
        try{ const ids=Object.keys(_WBF).filter(_lyrVis);
          if(ids.length){ let hit=null;
            try{ const pt=map.project([x,y]); const cv=map.getCanvas();
              if(pt&&pt.x>=0&&pt.y>=0&&pt.x<=((cv&&cv.clientWidth)||1e9)&&pt.y<=((cv&&cv.clientHeight)||1e9)){ const h=map.queryRenderedFeatures(pt,{layers:ids}); if(h&&h.length) hit={id:h[0].layer.id,p:h[0].properties||{}}; } }catch(_){}
            if(!hit){ for(const id of ids){ const d=_srcData(_WBF[id].src); if(!d) continue;   /* (#R121) off-screen → PIP over the layer's own data */
              const f=d.features.find(ft=>window._imPipGeo(x,y,ft.geometry)); if(f&&f.properties&&f.properties.raw!=null){ hit={id,p:f.properties}; break; } } }
            if(hit){ const W=_WBF[hit.id]; if(W) outs.push(W.lb()+': '+W.fmt(hit.p)+(hit.p.iso?(' ('+hit.p.iso+')'):'')); } } }catch(_){}
        try{ const bx=window._imBxChoroValueAt&&window._imBxChoroValueAt(x,y); if(bx&&bx.length) outs.push.apply(outs,bx.slice(0,4)); }catch(_){}
        return outs.length?outs.join(' | '):null; }, source:()=>'World Bank / SIPRI / UNDP' });
    /* ---- (#R121) more REAL feature layers on the contract ---- */
    register('earthquakes',{ label:()=>L5('Earthquakes','地震','Erdbeben','Землетрясения','Terremotos'),
      on:()=>_lyrVis('eq-pt'), featuresIn:b=>_srcFeatsIn('src-eq',b),
      summary:()=>{ const f=_srcFeatsIn('src-eq',null); if(!f) return null; let mx=null; f.forEach(q=>{ const m=q.properties&&+q.properties.mag; if(m!=null&&isFinite(m)&&(mx==null||m>mx)) mx=m; });
        return f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')+(mx!=null?(' · max M'+mx.toFixed(1)):''); }, source:()=>'USGS' });
    register('datacenters',{ label:()=>L5('Data centers & AI infra','データセンター・AIインフラ','Rechenzentren & KI-Infrastruktur','Дата-центры и ИИ-инфраструктура','Centros de datos e infra de IA'),
      on:()=>_lyrVis('dc-pt'), featuresIn:b=>_srcFeatsIn('dc-src',b),
      summary:()=>{ const f=_srcFeatsIn('dc-src',null); return f?(f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')):null; } });
    register('pharma',{ label:()=>L5('Pharma manufacturing hubs','製薬・医薬品製造拠点','Pharma-Produktionszentren','Центры фармпроизводства','Centros farmacéuticos'),
      on:()=>_lyrVis('ph-pt'), featuresIn:b=>_srcFeatsIn('ph-src',b),
      summary:()=>{ const f=_srcFeatsIn('ph-src',null); return f?(f.length+' '+L5('in view','表示範囲内','im Blick','в поле зрения','a la vista')):null; } });
    /* (#R121) thermal anomalies (active fires) — REAL pixel count from the same NASA FIRMS/GIBS WMS imagery the
       layer paints: fetch a small GetMap around the point (per day-offset of the user's 24/48/72h window) and
       count non-transparent pixels. 0 = "none detected" (a real answer); fetch failure = null (no data). */
    const _fireCache=new Map();
    async function _fireCount(lng,lat){ const R=20037508.342789244;
      const mx=lng/180*R, my=Math.log(Math.tan((90+lat)*Math.PI/360))/Math.PI*R; if(!isFinite(my)) return null;
      const half=15000, n={'24':2,'48':3,'72':4}[window._thermalWindow||'24']||2, W=96;
      /* one GetMap PER PRODUCT (a combined LAYERS= request fails ENTIRELY with a ServiceException when any one
         product has no shapefile for that day — live-verified with VIIRS_SNPP); the detections are OR-ed into a
         pixel mask so the count matches the UNION the painted layer shows (no sensor double-counting). */
      const days=[]; for(let off=0;off<n;off++) days.push(new Date(Date.now()-off*86400000).toISOString().slice(0,10));
      const key=days[0]+':'+n+':'+Math.round(mx/5000)+','+Math.round(my/5000);
      if(_fireCache.has(key)) return _fireCache.get(key);
      const PRODUCTS=['VIIRS_NOAA20_Thermal_Anomalies_375m_All','VIIRS_SNPP_Thermal_Anomalies_375m_All','MODIS_Terra_Thermal_Anomalies_All','MODIS_Aqua_Thermal_Anomalies_All'];
      const mask=new Uint8Array(W*W); let got=false;
      await Promise.all(days.map(day=>Promise.all(PRODUCTS.map(ly=>new Promise(res=>{ const im=new Image(); im.crossOrigin='anonymous';
        im.onload=()=>{ try{ const cv=document.createElement('canvas'); cv.width=cv.height=W; const cx=cv.getContext('2d',{willReadFrequently:true}); cx.drawImage(im,0,0,W,W); const d=cx.getImageData(0,0,W,W).data;
          for(let i=0;i<W*W;i++){ if(d[i*4+3]>60) mask[i]=1; } got=true; }catch(_){} res(); };
        im.onerror=()=>res();
        im.src='https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS='+ly+'&CRS=EPSG:3857&BBOX='+(mx-half)+','+(my-half)+','+(mx+half)+','+(my+half)+'&WIDTH='+W+'&HEIGHT='+W+'&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+day; })))));
      if(!got) return null;
      let total=0; for(let i=0;i<W*W;i++) total+=mask[i];
      const out= total>0 ? (total+' '+L5('fire pixels within ~15 km','火災ピクセル（約15km圏）','Feuerpixel in ~15 km','пикс. пожаров в ~15 км','píxeles de fuego en ~15 km'))
                         : L5('none detected within ~15 km','約15km圏で検出なし','keine in ~15 km erkannt','не обнаружено в ~15 км','ninguno en ~15 km');
      if(_fireCache.size>60) _fireCache.clear(); _fireCache.set(key,out); return out; }
    register('thermal',{ label:()=>L5('Thermal anomalies (fires)','熱異常（火災）','Thermale Anomalien (Brände)','Тепловые аномалии (пожары)','Anomalías térmicas (incendios)'),
      on:()=>['lyr-thermal','lyr-thermal-1','lyr-thermal-2','lyr-thermal-3'].some(_lyrVis), sampleAt:(x,y)=>_fireCount(x,y),
      time:()=>L5('last','直近','letzte','последние','últimas')+' '+(window._thermalWindow||'24')+' h', source:()=>'NASA FIRMS / GIBS (MODIS+VIIRS)' });
    return { register, list, active:activeIds, state, sampleAt, featuresIn, context };
  })();
};

window.IntMapModules.layerSidebar=function(map,HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const layerCbInfo=HOST.layerCbInfo, saveSettings=HOST.saveSettings, renderLayerFavs=HOST.renderLayerFavs;
  window.IntMapLayerSidebar=(function(){
    let sb=null,built=false;
    const isMob=()=>window.matchMedia&&window.matchMedia('(max-width:768px)').matches;
    const T=(en,j,de,ru,es)=>HOST.lang==='jp'?j:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?(es||en):en;
    /* (#R70) REBUILT FROM SCRATCH ("単にデフォルトの Layers選択欄を移植するな。一から同じ機能かつ洗練された
       UIで作り直せ。タイル形式にして"): the sidebar no longer adopts/reparents #layer-dropdown. It is its own
       TILE GRID — every layer row of the classic panel becomes a visual tile (preview image via
       IntMapLayerPreviews, full name, ✓ active state, ★ favorite), grouped under the same category headers,
       with live search. The classic dropdown stays untouched in its home (hidden) and remains the single
       source of truth: a tile click toggles the REAL checkbox and dispatches its change event, so every
       existing layer engine, legend, Active-layers chip and Atlas action keeps working unchanged. */
    function css(){ const st=document.createElement('style');
      /* (#R66) DECOUPLED layout ("右サイドバーそのものが覆いかぶさる" report): the MAP cedes the strip itself —
         `.map-container{margin-right:var(--lsr-w)}` (also set INLINE by open()) — and the sidebar merely fills
         the vacated strip as an absolute panel. The map's width never depends on the sidebar's flex/transition
         state, so no failure mode of the panel can ever leave it covering the map: worst case is an empty strip. */
      st.textContent=':root{--lsr-w:min(300px,92vw);}'   /* (#R154/#R159/#R160) smaller default width ("もう少し小さく") — 430→380→340→300 */
        +'body.lsr-avail .operation-room{position:relative;}'
        /* (#R154) LEFT-EDGE drag-resizer — mirror of the left sidebar's #sb-resizer so the right sidebar is
           left-right adjustable too ("左サイドバーと同様に左右に調整"). Grows as the cursor moves LEFT. Desktop only. */
        +'#layer-sidebar-r .lsr-resizer{position:absolute;top:0;left:-3px;width:8px;height:100%;cursor:col-resize;z-index:1200;touch-action:none;}'
        +'#layer-sidebar-r .lsr-resizer:hover{background:linear-gradient(to left,transparent,rgba(0,122,255,0.35),transparent);}'
        +'@media(max-width:768px){#layer-sidebar-r .lsr-resizer{display:none;}}'
        /* (#R160) The right sidebar now OVERLAYS the map on DESKTOP too (previously it pushed the map with
           margin-right, which resized + recentred the map = "地図領域の位置が動く"). The map-container keeps its
           fixed full width; the panel slides over the right strip. The right-anchored HUD slides left to clear
           it (rules above). Mobile already overlaid — this just makes desktop match. */
        +'@media(max-width:768px){#layer-sidebar-r{z-index:1460;box-shadow:-6px 0 30px rgba(0,0,0,0.32);}#lsr-toggle{display:none !important;}}'
        +'#layer-sidebar-r{position:absolute;top:0;right:0;bottom:0;width:var(--lsr-w);z-index:1000;background:var(--sidebar-bg);backdrop-filter:blur(25px) saturate(160%);-webkit-backdrop-filter:blur(25px) saturate(160%);border-left:1px solid rgba(128,128,128,0.18);display:flex;flex-direction:column;box-sizing:border-box;transform:translateX(102%);transition:transform .38s cubic-bezier(0.25,1,0.5,1);min-height:0;pointer-events:none;visibility:hidden;}'
        +'#layer-sidebar-r.open{transform:translateX(0);pointer-events:auto;visibility:visible;}'
        +'#layer-sidebar-r .lsr-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px 8px;padding-top:max(14px,env(safe-area-inset-top));}'
        +'#layer-sidebar-r .lsr-head b{font-size:16px;color:var(--text-main);}'
        +'#layer-sidebar-r .lsr-x{background:none;border:none;font-size:20px;color:var(--text-muted);cursor:pointer;border-radius:8px;padding:2px 8px;}'
        +'#layer-sidebar-r .lsr-x:hover{background:var(--input-bg);color:var(--text-main);}'
        /* (#R70) the sidebar's OWN search pill (it filters the tile grid — the classic dropdown is untouched) */
        +'#layer-sidebar-r .lsr-search{display:block;padding:2px 14px 10px;}'
        +'#layer-sidebar-r .lsr-search input{width:100%;box-sizing:border-box;height:36px;border-radius:18px;border:1px solid rgba(128,128,128,0.28);background:var(--card-bg);color:var(--text-main);font-size:12.5px;padding:0 14px;outline:none;}'
        +'#layer-sidebar-r .lsr-search input:focus{border-color:var(--primary-color);}'
        +'#layer-sidebar-r .lsr-body{flex:1;overflow-y:auto;padding:0 12px 24px;min-height:0;}'
        /* (#R70/#R71) TILE GRID — 3 columns, mercator-true previews (aspect matches the canvas exactly:
           nothing stretched), tightened typography, quieter card chrome ("素人が作ったようなダサい"対策). */
        /* (#R72) category headers: real COLLAPSIBLE section controls (chevron + name + count), normal-case,
           readable size — the old tiny all-caps row read as decoration ("形骸化しており、折りたたみが不可能かつ
           …テキストやフォント、UIがダサい"). */
        +'#layer-sidebar-r .lst-sech{font-size:13.5px;font-weight:500;letter-spacing:0;text-transform:none;color:var(--text-main);margin:16px 0 8px;display:flex;align-items:center;gap:7px;cursor:pointer;user-select:none;padding:3px 2px;border-radius:8px;}'   /* (#R108) slightly larger, not bold */
        +'#layer-sidebar-r .lst-sech:hover{background:var(--input-bg);}'
        +'#layer-sidebar-r .lst-sech .lst-chev{flex:0 0 auto;width:7px;height:7px;border-right:1.8px solid var(--text-muted);border-bottom:1.8px solid var(--text-muted);transform:rotate(45deg);transition:transform .18s ease;position:relative;top:-1px;}'
        +'#layer-sidebar-r .lst-sech.closed .lst-chev{transform:rotate(-45deg);top:0;}'
        +'#layer-sidebar-r .lst-sech .lst-cnt{font-weight:500;font-size:10.5px;color:var(--text-muted);background:var(--input-bg);border-radius:999px;padding:1px 7px;}'
        +'#layer-sidebar-r .lst-sech::after{content:"";flex:1;height:1px;background:rgba(128,128,128,0.14);}'
        +'#layer-sidebar-r .lst-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}'
        +'#layer-sidebar-r .lst-grid.closed{display:none;}'
        +'#layer-sidebar-r .lst-tile{position:relative;border-radius:11px;overflow:hidden;border:1px solid rgba(128,128,128,0.18);cursor:pointer;background:var(--card-bg);transition:border-color .13s ease,box-shadow .13s ease;-webkit-tap-highlight-color:transparent;}'
        +'#layer-sidebar-r .lst-tile:hover{box-shadow:0 4px 14px rgba(0,0,0,0.20);border-color:rgba(128,128,128,0.38);}'
        +'#layer-sidebar-r .lst-tile.on{border-color:var(--primary-color);box-shadow:0 0 0 1px var(--primary-color);}'
        /* (#R101) shorter tiles per request — flatter preview thumbnail */
        +'#layer-sidebar-r .lst-prev{aspect-ratio:240/96;background-size:cover;background-position:center;background-color:#14212f;border-bottom:1px solid rgba(128,128,128,0.14);}'
        /* (#R72) tile caption: slightly larger, evenly padded, vertically centered within its fixed 2-line box */
        +'#layer-sidebar-r .lst-nm{padding:5px 8px 5px;font-size:11px;font-weight:500;line-height:1.3;color:var(--text-main);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:26px;box-sizing:content-box;text-align:left;overflow-wrap:break-word;}'   /* (#R103) reverted to the original 11px per request */
        /* (#R114) .lst-check ✓ badge removed — the `.on` accent border is the ON-layer highlight now. */
        +'#layer-sidebar-r .lst-star{position:absolute;top:3px;right:3px;width:19px;height:19px;border:none;border-radius:50%;background:rgba(10,14,22,0.5);color:rgba(255,255,255,0.8);font-size:10.5px;line-height:1;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;}'
        +'#layer-sidebar-r .lst-tile:hover .lst-star,#layer-sidebar-r .lst-star.on{display:flex;}'
        +'#layer-sidebar-r .lst-star.on{color:#ffd60a;}'
        +'#layer-sidebar-r .lst-empty{color:var(--text-muted);font-size:12px;padding:18px 4px;text-align:center;}'
        /* Active-layers bar pinned at the top of the tile browser — COMPACT here: the chip strip is hidden
           (it turns into clutter as layers pile up — "選択レイヤーが増加すると煩雑"); the counter + List
           overlay + Clear-all carry the same functions in one constant-height row. */
        /* (#R102) tighten the always-shown ACTIVE-LAYERS bar's LEFT + BOTTOM gap a little more (kept non-flush) */
        +'#layer-sidebar-r #layer-active-section{position:sticky;top:0;bottom:auto;background:var(--card-bg);z-index:6;margin:0 -8px 1px;padding:5px 7px 3px;border-radius:0;}'   /* (#R115) opaque — never transparent */
        +'#layer-sidebar-r #layer-active-section .active-lyr-chips{display:none;}'
        +'#layer-sidebar-r .lsr-body{padding-top:0;}'   /* (#R106) flush the Search box to the Active-layers bar (was a 2px see-through seam) */
        /* (#R63) left-style edge toggle — mirrors .btn-toggle-sidebar */
        +'#lsr-toggle{position:fixed;top:50%;right:0;z-index:1460;background:var(--sidebar-bg);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(128,128,128,0.18);border-right:none;color:var(--text-muted);width:22px;height:64px;padding:0;border-radius:10px 0 0 10px;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:-4px 0 16px rgba(0,0,0,0.12);transition:right 0.38s cubic-bezier(0.25,1,0.5,1),background .2s,color .2s;transform:translateY(-50%);}'
        +'body.lsr-avail #lsr-toggle{display:flex;}'
        +'body.lsr-open #lsr-toggle{right:var(--lsr-w);}'
        +'#lsr-toggle:hover{background:var(--card-bg);color:var(--primary-color);}'
        +'#lsr-toggle .chev{width:7px;height:7px;border-left:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform 0.38s cubic-bezier(0.25,1,0.5,1);}'
        +'body.lsr-open #lsr-toggle .chev{transform:rotate(-135deg);}'
        +'@media(max-width:768px){ #layer-sidebar-r{display:none;} #lsr-toggle{display:none !important;} }';
      document.head.appendChild(st); }
    function build(){ if(built) return; built=true; css();
      sb=document.createElement('div'); sb.id='layer-sidebar-r';
      sb.innerHTML='<div class="lsr-head"><b>▤ '+T('Layers','レイヤー','Ebenen','Слои','Capas')+'</b><button class="lsr-x" title="'+T('Close','閉じる','Schließen','Закрыть','Cerrar')+'">✕</button></div>'
        +'<div class="lsr-search"><input id="lsr-q" type="text" placeholder="'+T('Search layers…','レイヤーを検索…','Ebenen suchen…','Поиск слоёв…','Buscar capas…')+'"></div>'
        +'<div class="lsr-body"></div>';
      /* (#R64) live INSIDE the app shell flex row (last child) so opening pushes the map like the left sidebar */
      (document.querySelector('.operation-room')||document.body).appendChild(sb);
      /* (#R154) drag-to-resize handle on the LEFT edge (the right sidebar grows as the cursor moves left).
         Persists to intmap_lsr_w; open() honours the saved width instead of the auto-formula. Desktop only. */
      (function(){ const rh=document.createElement('div'); rh.className='lsr-resizer'; rh.title='Drag to resize'; sb.appendChild(rh);
        let rdrag=false, rsx=0, rsw=0;
        rh.addEventListener('pointerdown',e=>{ if(isMob()) return; rdrag=true; rsx=e.clientX; rsw=sb.offsetWidth; try{ rh.setPointerCapture(e.pointerId); }catch(_){} document.body.style.userSelect='none'; sb.style.transition='none'; e.preventDefault(); e.stopPropagation(); });
        rh.addEventListener('pointermove',e=>{ if(!rdrag) return; const ls=document.getElementById('sidebar'); const lw=(ls&&!ls.classList.contains('collapsed'))?ls.getBoundingClientRect().width:0;
          let w=rsw-(e.clientX-rsx); w=Math.max(260,Math.min(Math.max(300,window.innerWidth-lw-320),w));   /* keep ≥320px of map, ≥260px panel */
          document.documentElement.style.setProperty('--lsr-w', w+'px');   /* (#R160) overlay: only the panel width changes; the map stays full-width behind it (no margin push, no resize) */
          try{ window.dispatchEvent(new Event('intmap-sidebar-resize')); }catch(_){} });
        const end=e=>{ if(!rdrag) return; rdrag=false; try{ rh.releasePointerCapture(e.pointerId); }catch(_){} document.body.style.userSelect=''; sb.style.transition='';
          try{ localStorage.setItem('intmap_lsr_w', String(sb.offsetWidth)); }catch(_){} try{ if(typeof map!=='undefined'&&map) map.resize(); }catch(_){} };
        rh.addEventListener('pointerup',end); rh.addEventListener('pointercancel',end);
      })();
      sb.querySelector('.lsr-x').onclick=close;
      sb.querySelector('#lsr-q').addEventListener('input',filterTiles);
      sb.addEventListener('click',e=>e.stopPropagation());
      /* keep every tile's ✓ in sync with its real checkbox, whoever toggles it (classic panel, Atlas, legends) */
      document.addEventListener('change',e=>{ try{ const t2=e.target; if(!t2||t2.type!=='checkbox'||!sb) return; if(!t2.closest||!t2.closest('#layer-dropdown')) return;
        const id=t2.id||t2.getAttribute('data-layer'); if(!id) return;
        const tile=sb.querySelector('.lst-tile[data-lid="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]'); if(tile) tile.classList.toggle('on',t2.checked); }catch(_){} });
      /* (#R63) left-style edge toggle button (open AND close, like the left sidebar's chevron) */
      const tg=document.createElement('button'); tg.id='lsr-toggle'; tg.title='Layers'; tg.innerHTML='<span class="chev"></span>';
      tg.addEventListener('click',e=>{ e.stopPropagation(); toggle(); });
      document.body.appendChild(tg); }
    /* ---- (#R70) tile-grid builder: the classic dropdown is the data source, never the UI ---- */
    function rowsFromDropdown(){ const dd=document.getElementById('layer-dropdown'); const out=[]; if(!dd) return out;
      let sec='', secBeta=false;   /* (#R101) track the beta section by data-i18n, not translated text */
      const skipIn=el=>el.closest&&(el.closest('#layer-active-section')||el.closest('#layer-fav-section')||el.closest('#layer-search-wrap')||el.closest('#layer-tools'));
      const walk=(el)=>{ for(const ch of el.children){ if(skipIn(ch)) continue;
        if(ch.classList&&(ch.classList.contains('lyr-head')||ch.classList.contains('lyr-section-label'))){ const t2=(ch.textContent||'').replace(/\s+/g,' ').trim(); if(t2){ sec=t2; secBeta=(ch.getAttribute&&ch.getAttribute('data-i18n')==='lyrGrpOthers'); } continue; }
        if(ch.matches&&ch.matches('label')){ const cb=ch.querySelector('input[type=checkbox]');
          if(cb){ const sp=ch.querySelector('span:not(.lyr-sw):not(.lfc-sw):not(.lsr-thumb)');
            const name=((sp?sp.textContent:ch.textContent)||'').replace(/★/g,'').replace(/\s+/g,' ').trim();
            const id=cb.id||cb.getAttribute('data-layer')||'';
            if(name&&id) out.push({cb,id,name,sec,secBeta,gk:cb.getAttribute('data-layer')||''}); }
          continue; }
        if(ch.children&&ch.children.length) walk(ch); } };
      walk(dd); return out; }
    function tileFor(r){ const d=document.createElement('div'); d.className='lst-tile'+(r.cb.checked?' on':''); d.dataset.lid=r.id; d.dataset.nm=r.name.toLowerCase();
      const pv=document.createElement('div'); pv.className='lst-prev'; if(r.gk) pv.dataset.gk=r.gk;
      try{ window.IntMapLayerPreviews&&window.IntMapLayerPreviews.into(pv,r.id,r.name); }catch(_){}
      const nm=document.createElement('div'); nm.className='lst-nm'; nm.textContent=r.name; nm.title=r.name;
      /* (#R114) no ✓ badge on the ON-layer highlight (requested): the `.on` accent border already marks an
         enabled layer, and a bare ✓ is exactly what the standing UI rule tells us to drop. */
      d.appendChild(pv); d.appendChild(nm);
      /* ★ favorite — the SAME store as the classic panel (imLayerFavs), mirrored both ways */
      try{ if(typeof layerCbInfo==='function'&&Array.isArray(window.imLayerFavs)){ const info=layerCbInfo(r.cb);
        if(info){ const st=document.createElement('button'); st.className='lst-star'+(window.imLayerFavs.includes(info.key)?' on':''); st.type='button'; st.textContent='★'; st.title='Favorite';
          st.onclick=(e)=>{ e.preventDefault(); e.stopPropagation();
            const i=window.imLayerFavs.indexOf(info.key); if(i>=0) window.imLayerFavs.splice(i,1); else window.imLayerFavs.push(info.key);
            st.classList.toggle('on');
            try{ saveSettings(); }catch(_){} try{ renderLayerFavs(); }catch(_){}
            try{ const cls=document.querySelector('#layer-dropdown .lyr-star[data-key="'+info.key+'"]'); if(cls) cls.classList.toggle('on',st.classList.contains('on')); }catch(_){} };
          d.appendChild(st); } } }catch(_){}
      /* (#R72) toggle the LIVE checkbox, not a possibly-stale captured node ("押しても反応しないレイヤーがある" /
         "レイヤーのオンオフが地図上と一致していない"): reorganizeLayerPanel / language switches can rebuild the
         classic dropdown, detaching the element this tile captured — clicking it then toggled a dead node and
         nothing happened on the map. Resolve by id at CLICK TIME, and re-read the final state a tick later so
         rows whose handlers reject the toggle (login-gated etc.) can't leave the tile out of sync. */
      d.addEventListener('click',()=>{ try{
        let cb=r.cb;
        if(!cb||!cb.isConnected){ cb=(r.id&&document.getElementById(r.id))||null;
          if(!cb){ const dd2=document.getElementById('layer-dropdown'); if(dd2&&r.gk) cb=dd2.querySelector('input[type=checkbox][data-layer="'+(window.CSS&&CSS.escape?CSS.escape(r.gk):r.gk)+'"]'); }
          if(cb) r.cb=cb; }
        if(!cb) return;
        cb.checked=!cb.checked; cb.dispatchEvent(new Event('change',{bubbles:true}));
        d.classList.toggle('on',cb.checked);
        setTimeout(()=>{ try{ d.classList.toggle('on',cb.checked); }catch(_){} },320);
      }catch(_){} });
      return d; }
    /* (#R72) collapse state per section title — default OPEN, Others (beta) starts CLOSED ("デフォルト状態では
       すべてのレイヤーが見える状態にし、折りたたまないように。ただし、Others(beta)は折りたたんでおくこと") */
    const _secClosed={};
    /* (#R101) match the beta group across ALL languages (was English-only, so JP/DE/RU/ES showed it EXPANDED) */
    const _isBeta=(t2)=>/others?\s*\(?\s*beta|ベータ|бета/i.test(String(t2||''));
    function buildTiles(){ if(!sb) return; const bodyEl=sb.querySelector('.lsr-body'); if(!bodyEl) return;
      const rows=rowsFromDropdown(); if(!rows.length) return;
      const root=document.createElement('div'); root.id='lst-root';
      const basics=T('Base map & labels','基本表示','Grundkarte & Labels','Основа и подписи','Base y etiquetas');
      let curSec=null,curGrid=null;
      rows.forEach(r=>{ const secName=r.sec||basics;
        if(secName!==curSec){ curSec=secName;
          /* (#R101) default the beta section CLOSED, detected by the header's data-i18n (robust across languages) */
          /* (#R108) "Base map & labels" also defaults CLOSED per request (kept openable + remembered per session). */
          if(!(secName in _secClosed)) _secClosed[secName]=(!!r.secBeta || _isBeta(secName) || secName===basics);
          const closed=!!_secClosed[secName];
          const h=document.createElement('div'); h.className='lst-sech'+(closed?' closed':''); h.setAttribute('role','button'); h.setAttribute('aria-expanded',closed?'false':'true');
          const ch=document.createElement('span'); ch.className='lst-chev'; h.appendChild(ch);
          const tt=document.createElement('span'); tt.textContent=secName; h.appendChild(tt);
          root.appendChild(h);
          curGrid=document.createElement('div'); curGrid.className='lst-grid'+(closed?' closed':''); root.appendChild(curGrid);
          h.addEventListener('click',()=>{ const now=!h.classList.contains('closed');
            h.classList.toggle('closed',now); h.setAttribute('aria-expanded',now?'false':'true');
            const g2=h.nextElementSibling; if(g2&&g2.classList.contains('lst-grid')) g2.classList.toggle('closed',now);
            _secClosed[secName]=now; }); }
        curGrid.appendChild(tileFor(r)); });
      root.querySelectorAll('.lst-grid').forEach(g=>{ const h=g.previousElementSibling; if(h&&h.classList.contains('lst-sech')){ const c=document.createElement('span'); c.className='lst-cnt'; c.textContent=g.children.length; h.appendChild(c); } });
      const old=sb.querySelector('#lst-root'); if(old) old.replaceWith(root); else bodyEl.appendChild(root);
      filterTiles(); }
    /* cheap state re-sync (no rebuild): reflect the live checkboxes onto the existing tiles */
    function syncTiles(){ try{ if(!sb) return; sb.querySelectorAll('.lst-tile').forEach(t2=>{ const id=t2.dataset.lid; if(!id) return;
      const cb=document.getElementById(id); if(cb) t2.classList.toggle('on',!!cb.checked); }); }catch(_){} }
    function filterTiles(){ if(!sb) return; const q=(((sb.querySelector('#lsr-q')||{}).value)||'').toLowerCase().trim();
      const root=sb.querySelector('#lst-root'); if(!root) return;
      root.querySelectorAll('.lst-grid').forEach(g=>{ let vis=0;
        g.querySelectorAll('.lst-tile').forEach(t2=>{ const show=!q||t2.dataset.nm.indexOf(q)>=0; t2.style.display=show?'':'none'; if(show) vis++; });
        /* while searching, a collapsed section with matches is forced open (inline display beats .closed) */
        g.style.display=vis?(q?'grid':''):'none'; const h=g.previousElementSibling; if(h&&h.classList.contains('lst-sech')) h.style.display=vis?'':'none'; }); }
    function open(){ build();   /* (#R107) mobile allowed — the right-sidebar layer panel now works on phones too (overlay, no map push) */
      /* (#R72) SPEED ("layersをクリックしたときの反応が非常に遅い"): the full reorganize+rebuild ran on EVERY
         open. Now the grid is rebuilt only when the row set actually changed; an unchanged grid just re-syncs
         its ✓ states (milliseconds). */
      try{ const have=sb.querySelectorAll('.lst-tile').length;
        if(!have){ try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} buildTiles(); }
        else{ const want=rowsFromDropdown().length; if(want&&want!==have) buildTiles(); else syncTiles(); } }catch(_){ try{ buildTiles(); }catch(__){} }
      /* (#R66) dynamic width: the map ALWAYS keeps ≥320px when geometrically possible — on a narrow window or
         with a widened left sidebar, a fixed 430px panel swallowed the map ("覆いかぶさる" perception). */
      try{ if(isMob()){ document.documentElement.style.setProperty('--lsr-w','min(430px,92vw)'); }   /* (#R107) mobile: near-full-width overlay */
        else { const ls=document.getElementById('sidebar');
        /* (#R160) the LEFT sidebar now always OVERLAYS the map (absolute), but it still visually covers its strip,
           so subtract its width whenever it is open — keep ≥320px of VISIBLE map between the two overlays. */
        const lw=(ls&&!ls.classList.contains('collapsed'))?ls.getBoundingClientRect().width:0;
        const cap=Math.max(300, Math.round(window.innerWidth-lw-320));   /* keep ≥320px of map */
        let saved=parseInt(localStorage.getItem('intmap_lsr_w')||'',10);   /* (#R154) honour a user-dragged width instead of clobbering it every open */
        const w=(saved>=260)?Math.min(saved,cap):Math.max(280,Math.min(300, Math.round(window.innerWidth-lw-320)));   /* (#R154/#R159/#R160) default cap 430→380→340→300 (smaller) */
        document.documentElement.style.setProperty('--lsr-w', w+'px'); } }catch(_){}
      sb.classList.add('open'); document.body.classList.add('lsr-open');
      /* (#R73) fire any lazy previews that IO missed while the panel was prebuilt off-screen */
      setTimeout(()=>{ try{ window.IntMapLayerPreviews&&window.IntMapLayerPreviews.kick&&window.IntMapLayerPreviews.kick(sb); }catch(_){} },450);
      /* (#R66) INLINE, decoupled: the MAP cedes the strip via its own margin (one line, no cascade, no flex
         math), the panel just slides into the vacated strip. Neither depends on the other. */
      sb.style.transform='translateX(0)'; sb.style.visibility='visible'; sb.style.pointerEvents='auto';
      try{ const mc=document.querySelector('.map-container'); if(mc&&mc.style.marginRight) mc.style.marginRight=''; }catch(_){}   /* (#R160) overlay: the panel never pushes the map — clear any stale inline margin from an older session */
      /* the Active-layers bar re-homes to the top of the tile browser (returns to the dropdown on close) */
      try{ window._placeActiveSection&&window._placeActiveSection(); }catch(_){} try{ window._refreshActiveLayers&&window._refreshActiveLayers(); }catch(_){}
      /* rows built by late modules (eco/l9/beta, ~1.5 s) — one deferred rebuild picks them up */
      setTimeout(()=>{ try{ if(sb.classList.contains('open')&&sb.querySelectorAll('.lst-tile').length<rowsFromDropdown().length) buildTiles(); }catch(_){} },900);
      /* (#R72) clicking the MAP closes the sidebar, same as the classic dropdown ("地図上のどこかをクリックしたら
         閉まるように") */
      if(!open._mapCloser){ open._mapCloser=()=>{ try{ if(sb&&sb.classList.contains('open')) close(); }catch(_){} }; }
      try{ map&&map.on('click',open._mapCloser); }catch(_){}
      /* (#R160) overlay: the map-container did NOT change size, so no resize/recentre — just let the search-pill
         layout recompute against the now-open panel (the right-anchored HUD slides left via CSS). */
      try{ window.dispatchEvent(new Event('intmap-sidebar-resize')); }catch(_){} }
    function close(){ if(document.body.classList.contains('ws-mode')) return;   /* (#R78d) in workspace mode the layer panel lives in its own window and must never auto-close (that turned the window black) */
      if(sb){ sb.classList.remove('open'); sb.style.transform='translateX(102%)'; sb.style.pointerEvents='none'; setTimeout(()=>{ try{ if(!sb.classList.contains('open')) sb.style.visibility='hidden'; }catch(_){} },400); }
      try{ if(open._mapCloser&&map) map.off('click',open._mapCloser); }catch(_){}
      document.body.classList.remove('lsr-open');
      try{ const mc=document.querySelector('.map-container'); if(mc) mc.style.marginRight=''; }catch(_){}
      try{ window._placeActiveSection&&window._placeActiveSection(); }catch(_){}   /* Active bar back to the classic dropdown */
      /* (#R160) overlay: closing the panel doesn't resize the map — just recompute the search-pill layout. */
      try{ window.dispatchEvent(new Event('intmap-sidebar-resize')); }catch(_){} }
    function toggle(){ if(sb&&sb.classList.contains('open')) close(); else open(); }
    function apply(){ if(window.imLayerPanel==='right'){ build(); document.body.classList.add('lsr-avail'); if(!isMob()) open(); } else { close(); document.body.classList.remove('lsr-avail'); } }   /* (#R107) build on mobile too; only auto-OPEN on desktop (mobile opens on the layer button) */
    setTimeout(()=>{ try{ if(window.imLayerPanel==='right'){ build(); document.body.classList.add('lsr-avail');
      /* (#R72) PRE-BUILD the tile grid while idle so the FIRST open is instant too */
      const pre=()=>{ try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} try{ buildTiles(); }catch(_){} };
      if('requestIdleCallback' in window) requestIdleCallback(pre,{timeout:4000}); else setTimeout(pre,2500);
    } }catch(_){} },1500);   /* edge toggle available on boot in right mode (without auto-opening) */
    /* (#R104) rebuild the tile grid on a language change so the layer NAMES follow the new language immediately
       (the tiles are a copy of the classic dropdown, which updateI18n localizes — rebuild AFTER that). This was
       the biggest "ワークスペースで言語を変えてもすぐ変わらない（再読み込みが必要）" offender (dozens of layer names). */
    window.addEventListener('intmap-lang',()=>{ if(!sb) return;
      /* (#R106) the "Search layers…" placeholder was set once at build and never re-localized ("言語設定を変えても
         すぐ変わらない" in ws mode — the layers window search stayed English). Update it live on a language change. */
      try{ const q=sb.querySelector('#lsr-q'); if(q) q.placeholder=T('Search layers…','レイヤーを検索…','Ebenen suchen…','Поиск слоёв…','Buscar capas…'); }catch(_){}
      setTimeout(()=>{ try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} try{ buildTiles(); }catch(_){} },40); });
    return { open, close, toggle, apply };
  })();
};

window.IntMapModules.ticker=function(map,HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const fetchData=HOST.fetchData, saveSettings=HOST.saveSettings;
  window.IntMapTicker=(function(){
    const T=(en,j,de,ru,es)=>HOST.lang==='jp'?j:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?(es||en):en;
    const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const isMob=()=>window.matchMedia&&window.matchMedia('(max-width:768px)').matches;
    let bar=null,track=null,built=false,timer=0,mkt=[],news=[];
    /* (#R102) which symbols / items the ticker shows is user-configurable in Settings ("表示銘柄や表示項目を設定から
       変更可能に"). Each market instrument carries a stable key; `cfg.syms` is the enabled set, `cfg.news` gates the
       news headlines. Defaults = everything on. */
    const TK_SYMS=[
      {k:'usdjpy',l:'USD/JPY',g:'fx'},{k:'eurusd',l:'EUR/USD',g:'fx'},{k:'gbpusd',l:'GBP/USD',g:'fx'},{k:'usdcny',l:'USD/CNY',g:'fx'},
      {k:'spx',l:'S&P 500',g:'idx'},{k:'dow',l:'Dow',g:'idx'},{k:'nasdaq',l:'Nasdaq',g:'idx'},{k:'nikkei',l:'Nikkei 225',g:'idx'},{k:'dax',l:'DAX',g:'idx'},
      {k:'gold',l:()=>T('Gold','金','Gold','Золото','Oro'),g:'com'},{k:'silver',l:()=>T('Silver','銀','Silber','Серебро','Plata'),g:'com'},
      {k:'btc',l:'BTC',g:'crypto'},{k:'eth',l:'ETH',g:'crypto'} ];
    const CFG_KEY='intmap_ticker_cfg';
    function loadCfg(){ try{ const j=JSON.parse(localStorage.getItem(CFG_KEY)||'null'); if(j&&Array.isArray(j.syms)) return {syms:new Set(j.syms),news:j.news!==false}; }catch(_){} return {syms:new Set(TK_SYMS.map(s=>s.k)),news:true}; }
    let cfg=loadCfg();
    function saveCfg(){ try{ localStorage.setItem(CFG_KEY,JSON.stringify({syms:[...cfg.syms],news:cfg.news})); }catch(_){} }
    const PROX=[x=>x, x=>'https://corsproxy.io/?url='+encodeURIComponent(x), x=>'https://api.allorigins.win/raw?url='+encodeURIComponent(x)];
    async function fjson(url){ for(const p of PROX){ try{ const r=await fetch(p(url)); if(r&&r.ok) return await r.json(); }catch(_){} } return null; }
    async function ftext(url){ for(const p of PROX){ try{ const r=await fetch(p(url)); if(r&&r.ok) return await r.text(); }catch(_){} } return null; }
    function css(){ const st=document.createElement('style');
      /* (#R65) DETERMINISTIC column layout — no height calc at all: body becomes a flex column, the app shell
         takes the remaining space and the bar its fixed 30px row BELOW it. There is no arithmetic (dvh/scaling
         rounding) that can ever make the bar overlap the map. */
      st.textContent='body.ticker-on{display:flex;flex-direction:column;height:100vh;height:100dvh;overflow:hidden;}'
        +'body.ticker-on .operation-room{flex:1 1 auto;min-height:0;height:auto !important;}'
        +'#ticker-bar{position:relative;flex:0 0 30px;width:100%;height:30px;z-index:500;display:flex;align-items:center;background:var(--bg-color);border-top:1px solid rgba(128,128,128,0.25);overflow:hidden;font-size:12px;font-variant-numeric:tabular-nums;box-sizing:border-box;}'
        +'#ticker-bar .tk-track{display:inline-flex;white-space:nowrap;will-change:transform;animation:tkScroll var(--tk-dur,70s) linear infinite;align-items:center;}'
        +'#ticker-bar:hover .tk-track{animation-play-state:paused;}'
        +'@keyframes tkScroll{from{transform:translateX(0);}to{transform:translateX(-50%);}}'
        +'#ticker-bar .tk-half{display:inline-flex;align-items:center;gap:30px;padding-right:30px;}'
        +'#ticker-bar .tk-item{display:inline-flex;align-items:center;gap:6px;color:var(--text-main);}'
        +'#ticker-bar .tk-lbl{color:var(--text-muted);}'
        +'#ticker-bar .tk-up{color:#34c759;} #ticker-bar .tk-dn{color:#ff453a;}'
        +'#ticker-bar a{color:var(--text-main);text-decoration:none;} #ticker-bar a:hover{color:var(--primary-color);}'
        /* (#R102/#R103) a small hide button at the FAR RIGHT of the ticker — clicking it turns the whole ticker off.
           The scrolling text lives in a CLIPPED flex wrap (.tk-scroll) and the button is a real flex sibling, so the
           text can never run under the button (the earlier absolute overlay overlapped it — "重なって汚い"). */
        +'#ticker-bar .tk-scroll{flex:1 1 auto;min-width:0;height:100%;overflow:hidden;display:flex;align-items:center;}'
        +'#ticker-bar .tk-hide{flex:0 0 auto;width:28px;align-self:stretch;display:flex;align-items:center;justify-content:center;background:transparent;border-left:1px solid rgba(128,128,128,0.22);color:var(--text-muted);cursor:pointer;font-size:15px;line-height:1;padding:0;}'
        +'#ticker-bar .tk-hide:hover{color:var(--text-main);background:var(--input-bg);}'
        +'@media(max-width:768px){ #ticker-bar{display:none !important;} body.ticker-on{display:block;} body.ticker-on .operation-room{height:100vh !important;height:100dvh !important;} }';
      document.head.appendChild(st); }
    async function loadMarkets(){ const out=[];
      let rt=null; try{ const j=await fjson('https://api.fxratesapi.com/latest?base=USD&currencies=JPY,EUR,GBP,CNY'); rt=j&&j.rates; }catch(_){}
      if(!rt){ try{ const j2=await fjson('https://open.er-api.com/v6/latest/USD'); rt=j2&&j2.rates; }catch(_){} }
      if(rt){ if(rt.JPY!=null) out.push({l:'USD/JPY',v:(+rt.JPY).toFixed(2),k:'usdjpy'}); if(rt.EUR!=null&&+rt.EUR>0) out.push({l:'EUR/USD',v:(1/+rt.EUR).toFixed(4),k:'eurusd'}); if(rt.GBP!=null&&+rt.GBP>0) out.push({l:'GBP/USD',v:(1/+rt.GBP).toFixed(4),k:'gbpusd'}); if(rt.CNY!=null) out.push({l:'USD/CNY',v:(+rt.CNY).toFixed(3),k:'usdcny'}); }
      /* stock indices — Yahoo Finance chart endpoint (real price + true day change vs previous close);
         Stooq rejected datacenter/proxy requests, Yahoo verified working through the proxy ladder. */
      const YSYM=[['%5EGSPC','S&P 500','spx'],['%5EDJI','Dow','dow'],['%5EIXIC','Nasdaq','nasdaq'],['%5EN225','Nikkei 225','nikkei'],['%5EGDAXI','DAX','dax']];
      for(const ys of YSYM){ if(!cfg.syms.has(ys[2])) continue; try{ const j=await fjson('https://query1.finance.yahoo.com/v8/finance/chart/'+ys[0]+'?range=1d&interval=1d');
        const m=j&&j.chart&&j.chart.result&&j.chart.result[0]&&j.chart.result[0].meta;
        if(m&&m.regularMarketPrice!=null){ const prev=(m.chartPreviousClose!=null)?+m.chartPreviousClose:(+m.previousClose||null);
          const d=(prev&&prev>0)?((+m.regularMarketPrice-prev)/prev*100):null;
          out.push({l:ys[1],v:(+m.regularMarketPrice).toLocaleString(undefined,{maximumFractionDigits:2}),d,k:ys[2]}); } }catch(_){} }
      if(cfg.syms.has('gold')){ try{ const g=await fjson('https://api.gold-api.com/price/XAU'); if(g&&g.price) out.push({l:T('Gold','金','Gold','Золото','Oro'),v:'$'+(+g.price).toLocaleString(undefined,{maximumFractionDigits:0})+'/oz',k:'gold'}); }catch(_){} }
      if(cfg.syms.has('silver')){ try{ const s2=await fjson('https://api.gold-api.com/price/XAG'); if(s2&&s2.price) out.push({l:T('Silver','銀','Silber','Серебро','Plata'),v:'$'+(+s2.price).toFixed(2)+'/oz',k:'silver'}); }catch(_){} }
      if(cfg.syms.has('btc')||cfg.syms.has('eth')){ try{ const c=await fjson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true');
        if(cfg.syms.has('btc')&&c&&c.bitcoin&&c.bitcoin.usd!=null) out.push({l:'BTC',v:'$'+(+c.bitcoin.usd).toLocaleString(),d:c.bitcoin.usd_24h_change,k:'btc'});
        if(cfg.syms.has('eth')&&c&&c.ethereum&&c.ethereum.usd!=null) out.push({l:'ETH',v:'$'+(+c.ethereum.usd).toLocaleString(),d:c.ethereum.usd_24h_change,k:'eth'}); }catch(_){} }
      mkt=out; }
    function loadNews(){ try{ if(typeof HOST.globalData!=='undefined'&&HOST.globalData&&HOST.globalData.length){ news=HOST.globalData.slice(0,14).map(it=>({t:String(it.title||'').slice(0,110),u:it.link||''})); }
      else { news=[]; if(typeof fetchData==='function'&&!loadNews._asked){ loadNews._asked=1; try{ fetchData(); }catch(_){} [8000,16000,30000].forEach(ms=>setTimeout(()=>{ try{ loadNews(); render(); }catch(_){} },ms)); } } }catch(_){ news=[]; } }
    function render(){ if(!track) return; const parts=[];
      mkt.forEach(m=>{ if(m.k&&!cfg.syms.has(m.k)) return;   /* (#R102) respect the user's ticker symbol selection */
        const dd=(m.d!=null&&isFinite(m.d))?(' <span class="'+(m.d>=0?'tk-up':'tk-dn')+'">'+(m.d>=0?'▲':'▼')+Math.abs(m.d).toFixed(2)+'%</span>'):''; parts.push('<span class="tk-item"><span class="tk-lbl">'+esc(m.l)+'</span>'+esc(m.v)+dd+'</span>'); });
      /* (#R72) no 📰 emoji on ticker items ("Tickerに📰の絵文字はいらない") */
      if(cfg.news) news.forEach(n=>{ parts.push('<span class="tk-item">'+(n.u?('<a href="'+esc(n.u)+'" target="_blank" rel="noopener">'+esc(n.t)+'</a>'):esc(n.t))+'</span>'); });
      if(!parts.length) parts.push('<span class="tk-item tk-lbl">'+T('Loading ticker…','ティッカー読込中…','Ticker lädt…','Загрузка ленты…','Cargando cinta…')+'</span>');
      const html=parts.join('');
      track.innerHTML='<span class="tk-half">'+html+'</span><span class="tk-half" aria-hidden="true">'+html+'</span>';
      requestAnimationFrame(()=>{ try{ const w=track.scrollWidth/2; if(w>0) track.style.setProperty('--tk-dur',Math.max(28,Math.round(w/65))+'s'); }catch(_){} }); }
    async function refresh(){ loadNews(); render(); await loadMarkets(); render(); }
    function build(){ if(built) return; built=true; css();
      bar=document.createElement('div'); bar.id='ticker-bar'; bar.innerHTML='<div class="tk-scroll"><div class="tk-track"></div></div>';
      /* (#R102/#R103) far-right hide button — a real flex sibling (not an overlay) so it never overlaps the text */
      const hb=document.createElement('button'); hb.className='tk-hide'; hb.type='button'; hb.setAttribute('aria-label',T('Hide ticker','ティッカーを隠す','Ticker ausblenden','Скрыть ленту','Ocultar cinta')); hb.title=T('Hide ticker','ティッカーを隠す','Ticker ausblenden','Скрыть ленту','Ocultar cinta'); hb.textContent='×';
      hb.onclick=(e)=>{ e.stopPropagation(); if(document.body.classList.contains('ticker-on')) toggle(); };
      bar.appendChild(hb);
      /* insert directly after the app shell so the bar occupies the vacated strip in normal flow */
      const or=document.querySelector('.operation-room');
      if(or&&or.parentNode){ or.parentNode.insertBefore(bar,or.nextSibling); } else document.body.appendChild(bar);
      track=bar.querySelector('.tk-track'); }
    function open(){ build(); document.body.classList.add('ticker-on'); bar.style.display='flex'; refresh(); if(!timer) timer=setInterval(refresh,300000);
      try{ map&&map.resize(); }catch(_){} setTimeout(()=>{ try{ map&&map.resize(); }catch(_){} },350);
      try{ window.IntMapWorkspace&&IntMapWorkspace.tickerReflow&&IntMapWorkspace.tickerReflow(); IntMapWorkspace.syncTicker&&IntMapWorkspace.syncTicker(); }catch(_){} }   /* (#R102) ws windows fill the vacated strip */
    function close(){ if(bar) bar.style.display='none'; document.body.classList.remove('ticker-on'); if(timer){ clearInterval(timer); timer=0; }
      try{ map&&map.resize(); }catch(_){} setTimeout(()=>{ try{ map&&map.resize(); }catch(_){} },350);
      try{ window.IntMapWorkspace&&IntMapWorkspace.tickerReflow&&IntMapWorkspace.tickerReflow(); IntMapWorkspace.syncTicker&&IntMapWorkspace.syncTicker(); }catch(_){} }
    function toggle(){ if(document.body.classList.contains('ticker-on')){ window.imTicker='off'; close(); } else { window.imTicker='on'; open(); } try{ saveSettings&&saveSettings(); }catch(_){} }
    function apply(){ if(window.imTicker==='on') open(); else close(); }
    setTimeout(()=>{ try{ apply(); }catch(_){} },1500);   /* honour the saved setting on boot */
    /* (#R102) config API for the Settings ticker panel: read the symbol list + current selection, write a new one
       (persisted) and re-pull/re-render immediately. */
    function getConfig(){ return { syms:new Set(cfg.syms), news:cfg.news, list:TK_SYMS.map(s=>({k:s.k,g:s.g,l:(typeof s.l==='function'?s.l():s.l)})) }; }
    function setConfig(nc){ try{ if(nc){ if(nc.syms) cfg.syms=(nc.syms instanceof Set)?new Set(nc.syms):new Set(nc.syms||[]); if(nc.news!=null) cfg.news=!!nc.news; } saveCfg();
      try{ render(); }catch(_){} try{ if(document.body.classList.contains('ticker-on')) refresh(); }catch(_){} }catch(_){} }
    return { open, close, toggle, apply, getConfig, setConfig, isOpen:()=>document.body.classList.contains('ticker-on') };
  })();
};

window.IntMapModules.layerPresets=function(map,HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const imToast=HOST.imToast;
  (function(){
    const jp=()=>HOST.lang==='jp';
    const KEY='intmap_layer_presets';
    let presets=[]; try{ const s=JSON.parse(localStorage.getItem(KEY)||'[]'); if(Array.isArray(s)) presets=s; }catch(_){}
    function save(){ try{ localStorage.setItem(KEY,JSON.stringify(presets)); }catch(_){} try{ window._syncPrefsUp&&window._syncPrefsUp(); }catch(_){} }
    function cbKey(cb){ if(cb.id) return 'id:'+cb.id; const dl=cb.getAttribute&&cb.getAttribute('data-layer'); return dl?('dl:'+dl):null; }
    function findCb(key){ if(!key) return null; if(key.startsWith('id:')) return document.getElementById(key.slice(3));
      if(key.startsWith('dl:')){ const dd=document.getElementById('layer-dropdown'); return dd&&dd.querySelector('input[data-layer="'+key.slice(3)+'"]'); } return null; }
    const SKIP=new Set(['cb-names','cb-geolabels','cb-borders','cb-grid','cb-countries','cb-admin1','cb-roads','cb-rail2']);
    function capture(){ const dd=document.getElementById('layer-dropdown'); if(!dd) return null;
      const ids=[]; dd.querySelectorAll('input[type=checkbox]').forEach(cb=>{ if(!cb.checked||SKIP.has(cb.id)) return; const k=cbKey(cb); if(k&&!ids.includes(k)) ids.push(k); });
      let ops={}; try{ ops=JSON.parse(JSON.stringify(opacities)); }catch(_){}
      return { ids, ops }; }
    function clearAll(){ const dd=document.getElementById('layer-dropdown'); if(!dd) return;
      dd.querySelectorAll('input[type=checkbox]').forEach(cb=>{ if(!cb.checked||SKIP.has(cb.id)) return; cb.checked=false; try{ cb.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} }); }
    function apply(p){ if(!p) return;
      try{ if(p.ops) Object.keys(p.ops).forEach(k=>{ opacities[k]=p.ops[k]; }); }catch(_){}
      clearAll();
      setTimeout(()=>{ (p.ids||[]).forEach(k=>{ const cb=findCb(k); if(cb&&!cb.checked){ cb.checked=true; try{ cb.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} } });
        /* re-assert the saved opacities once the layers exist */
        setTimeout(()=>{ try{ if(p.ops) Object.keys(p.ops).forEach(k=>{ try{ setLayerOpacity(k,p.ops[k]); }catch(_){} }); }catch(_){} },900);
      },60); }
    function render(){ const host=document.getElementById('lyr-presets'); if(!host) return;
      host.innerHTML='<button id="lp-save" class="ai-test-btn" style="width:100%;">💾 <span>'+(jp()?'現在のレイヤー構成を保存':'Save current layers as preset')+'</span></button>'+
        (presets.length?('<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">'+presets.map((p,i)=>
          '<div style="display:flex;align-items:center;gap:6px;">'+
          '<button data-ap="'+i+'" style="flex:1;text-align:left;background:var(--input-bg);border:1px solid rgba(128,128,128,0.2);color:var(--text-main);border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">▶ '+String(p.name).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+' <span style="color:var(--text-muted);font-size:10px;">('+(p.ids||[]).length+')</span></button>'+
          '<button data-del="'+i+'" title="'+(jp()?'削除':'Delete')+'" style="flex:0 0 auto;width:26px;height:26px;border:none;border-radius:7px;background:var(--input-bg);color:var(--text-muted);cursor:pointer;font-size:12px;">✕</button></div>').join('')+'</div>'):'');
      const sv=host.querySelector('#lp-save');
      if(sv) sv.onclick=()=>{ const snap=capture(); if(!snap||!snap.ids.length){ try{ imToast(jp()?'表示中のレイヤーがありません':'No layers are on'); }catch(_){} return; }
        const name=prompt(jp()?'プリセット名:':'Preset name:', jp()?('プリセット '+(presets.length+1)):('Preset '+(presets.length+1)));
        if(!name) return; presets.push({name:String(name).slice(0,40), ids:snap.ids, ops:snap.ops}); save(); render(); };
      host.querySelectorAll('[data-ap]').forEach(b=>b.onclick=()=>{ apply(presets[+b.getAttribute('data-ap')]); try{ imToast(jp()?'プリセットを適用しました':'Preset applied'); }catch(_){} });
      host.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{ presets.splice(+b.getAttribute('data-del'),1); save(); render(); });
    }
    function mount(){ if(document.getElementById('lyr-presets')) { render(); return; }
      const host=document.createElement('div'); host.id='lyr-presets'; host.style.marginTop='4px';
      const tools=document.getElementById('layer-tools'); const dd=document.getElementById('layer-dropdown');
      (tools||dd||document.body).appendChild(host); render();
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    if(document.readyState!=='loading') setTimeout(mount,400); else document.addEventListener('DOMContentLoaded',()=>setTimeout(mount,400));
    window.addEventListener('intmap-lang',render);
    window.IntMapPresets={ render, _get:()=>presets, _set:(a)=>{ if(Array.isArray(a)){ presets=a; try{ localStorage.setItem(KEY,JSON.stringify(presets)); }catch(_){} render(); } } };
  })();
};

window.IntMapModules.labelPopup=function(map,HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const imToast=HOST.imToast, isMobile=HOST.isMobile;
  (function(){
    if(!map) return;
    let popup=null, wired=false;
    function firstSym(){ try{ for(const l of (map.getStyle().layers||[])) if(l.type==='symbol') return l.id; }catch(_){} }
    function ensureHL(){ if(map.getSource('place-hl-src')) return true; if(!map.isStyleLoaded()) return false;
      try{ map.addSource('place-hl-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}}); const before=firstSym();
        map.addLayer({id:'place-hl-fill',type:'fill',source:'place-hl-src',filter:['==','$type','Polygon'],paint:{'fill-color':'#ff3b30','fill-opacity':0.30}},before);
        map.addLayer({id:'place-hl-line',type:'line',source:'place-hl-src',filter:['==','$type','Polygon'],paint:{'line-color':'#ff3b30','line-width':1.8,'line-opacity':0.9}},before);
        map.addLayer({id:'place-hl-dot',type:'circle',source:'place-hl-src',filter:['==','$type','Point'],paint:{'circle-radius':9,'circle-color':'#ff3b30','circle-opacity':0.35,'circle-stroke-color':'#ff3b30','circle-stroke-width':2.5}},before);
        return true; }catch(_){ return false; }
    }
    function clearHL(){ try{ const s=map.getSource('place-hl-src'); if(s) s.setData({type:'FeatureCollection',features:[]}); }catch(_){} if(popup){ try{popup.remove();}catch(_){} popup=null; }
      /* (#R59) the place popup now OWNS the boundary outline (#R8c popup + IntMapOutline unified) — closing/clearing
         the popup (×, click-away, or a new label) also clears the blue boundary, so it can never linger. */
      try{ window.IntMapOutline && window.IntMapOutline.clear && window.IntMapOutline.clear(); }catch(_){} }
    function showPopup(lngLat,name,isCountry,opts){ opts=opts||{}; if(popup){ try{popup.remove();}catch(_){} } const jp=HOST.lang==='jp', safe=String(name).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      /* (#R22) Cleaner layout: name on its own line, then an even button row (equal widths on desktop,
         stacked vertically on mobile via .plc-acts — "ボタンの配置が不格好／モバイルでは縦に三つ"). */
      const btnBase='border:none;color:var(--text-main);border-radius:8px;padding:7px 10px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;';
      /* (#R33) Isolate now lives in this SAME action row as Copy/Wikipedia/AI brief (for countries) — no more
         separate floating button ("既存のcopy, wikipedia, AI briefと同じ並びに、同じUIで"). */
      const de=HOST.lang==='de';   /* (#R33) 3-language labels */
      /* (#R122) Isolate is available for ANY outlined place now (not just countries) via the outline geometry;
         Move drags the place (true-size) to a new spot. */
      const isoLbl=de?'Isolieren':jp?'この地域だけ':HOST.lang==='ru'?'Только это':HOST.lang==='es'?'Aislar':'Isolate';
      const moveLbl=de?'Verschieben':jp?'移動':HOST.lang==='ru'?'Переместить':HOST.lang==='es'?'Mover':'Move';
      /* (#R123) Isolate/Move are only meaningful for AREA-bearing places (countries, regions, cities with a
         boundary) — NOT for point/line classifications like mountains (ofm-peak), rivers (ofm-river) or seas
         (geo-sea) which have no polygon ("領域のない分類のものはボタンをつけないように"). The terrain/water label
         handler passes opts.noAreaTools to suppress both buttons. */
      const areaTools=!opts.noAreaTools;
      const isoBtn=areaTools?`<button class="plc-iso" style="background:var(--input-bg);${btnBase}">${isoLbl}</button>`:'';
      const moveBtn=areaTools?`<button class="plc-move" style="background:var(--input-bg);${btnBase}">${moveLbl}</button>`:'';
      /* (#R127) historical entities pass their flag (opts.flag = the countryStats/registry flag HTML) so the click
         popup shows it too — previously the flag only appeared in the full country card, never here ("国旗…まだ詰め
         られる箇所が大量にある"). Modern place labels pass no flag, so their popup is unchanged. */
      const flagHtml=(opts&&opts.flag)?('<span class="plc-flag" style="flex:0 0 auto;line-height:0;display:inline-flex;align-items:center;font-size:19px;">'+opts.flag+'</span>'):'';
      const html=`<div style="min-width:172px;"><div style="font-weight:700;font-size:14px;color:var(--text-main);margin-bottom:9px;padding-right:34px;display:flex;align-items:center;gap:8px;">${flagHtml}<span>${safe}</span></div><div class="plc-acts"><button class="plc-copy" style="background:var(--input-bg);${btnBase}">${de?'Kopieren':jp?'コピー':'Copy'}</button><button class="plc-wiki" style="display:none;background:var(--input-bg);${btnBase}">Wikipedia</button><button class="plc-ai" style="background:linear-gradient(135deg,rgba(106,90,205,0.30),rgba(30,144,255,0.30));${btnBase}">${de?'KI-Bericht':jp?'AI調査':'AI brief'}</button>${isoBtn}${moveBtn}</div></div>`;
      try{ popup=new maplibregl.Popup({closeButton:true,closeOnClick:false,maxWidth:'300px',className:'plc-popup'}).setLngLat(lngLat).setHTML(html).addTo(map);
        /* (#R59) draw this place's REAL boundary as a polygon (cities/towns/regions; NOT countries). IntMapOutline
           uses point-in-polygon (no fixed threshold → no far same-named place) and draws NOTHING if there is no real
           boundary (no ugly rectangle). The popup's × / click-away clears it (clearHL → IntMapOutline.clear). */
        if(!opts.noOutline){
          /* (#R122) the place-label click highlight uses the user's ACCENT colour (falls back to the default blue). */
          try{ if(window.IntMapOutline&&window.IntMapOutline.setColor){ const ac=(window.imAccent&&/^#[0-9a-fA-F]{6}$/.test(window.imAccent))?window.imAccent:'#0a84ff'; window.IntMapOutline.setColor(ac); } }catch(_){}
          if(opts.geojson){ try{ window.IntMapOutline && window.IntMapOutline.show && window.IntMapOutline.show(name,{geojson:opts.geojson,lng:lngLat.lng,lat:lngLat.lat,fit:false}); }catch(_){} }   /* (#R94m) caller-supplied polygon (historical era border) */
          else if(!isCountry){ try{ window.IntMapOutline && window.IntMapOutline.show && window.IntMapOutline.show(name,{lng:lngLat.lng,lat:lngLat.lat,fit:false}); }catch(_){} }
          /* (#R62) "国名のラベルをクリックしても国の範囲がハイライトされない" — countries now outline too, from the
             LOCAL countryGeo polygon (point-in-polygon; no network, no wrong-namesake risk). */
          else { try{ const cg=window.countryGeo; if(cg&&cg.features&&typeof turf!=='undefined'){ const pt=turf.point([lngLat.lng,lngLat.lat]);
            for(const f of cg.features){ try{ if(turf.booleanPointInPolygon(pt,f)){ window.IntMapOutline&&window.IntMapOutline.show&&window.IntMapOutline.show(name,{geojson:f.geometry,lng:lngLat.lng,lat:lngLat.lat,fit:false}); break; } }catch(_){} } } }catch(_){} }
        }
        setTimeout(()=>{ try{ const xb=document.querySelector('.plc-popup .maplibregl-popup-close-button'); if(xb) xb.addEventListener('click',()=>{ try{ clearHL(); }catch(_){} }); }catch(_){}
          const b=document.querySelector('.plc-copy'); if(b) b.onclick=()=>{ try{ navigator.clipboard.writeText(name); }catch(_){} b.textContent=jp?'✓ コピーしました':'✓ Copied'; };
          /* (#R20) Wikipedia button — shown only when an article actually EXISTS for this name
             (REST summary probe, CORS*). Opens the article in a new tab. */
          const w=document.querySelector('.plc-wiki');
          if(w){ const wl=({jp:'ja',de:'de',ru:'ru',es:'es'})[HOST.lang]||'en';   /* (#R108) all languages, not just ja/en */
            /* (#R94n) a historical entity passes an explicit Wikipedia title (opts.wiki: "German Empire",
               "Kingdom of Italy", "Qajar Iran"…) so the button opens the ERA article, not the modern namesake. */
            const wtitle=(opts&&opts.wiki)||name;
            const _probe=(lang,title)=>fetch('https://'+lang+'.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(String(title).replace(/ /g,'_'))).then(r=>r.ok?r.json():null).catch(()=>null);
            const _showW=(j)=>{ const url=j&&j.content_urls&&j.content_urls.desktop&&j.content_urls.desktop.page; if(url){ w.style.display='inline-block'; w.onclick=()=>{ try{ window.open(url,'_blank','noopener'); }catch(_){} }; return true; } return false; };
            /* (#R108) FIX "設定言語ではなく英語Wikipediaに飛ばされる": for a historical entity the passed title is
               ENGLISH, so a direct ja/de/ru/es probe with that title fails → it fell back to English. Resolve the
               CURRENT-language article title via the EN langlinks API first, then open that; only fall back to the
               English article when no langlink exists (fallback is acceptable per request). */
            const _langlink=(title)=>fetch('https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=langlinks&lllang='+wl+'&lllimit=1&titles='+encodeURIComponent(String(title).replace(/ /g,'_'))).then(r=>r.ok?r.json():null).then(j=>{ try{ const pg=j&&j.query&&j.query.pages; for(const k in pg){ const ll=pg[k].langlinks; if(ll&&ll[0]&&ll[0]['*']) return ll[0]['*']; } }catch(_){} return null; }).catch(()=>null);
            if(wl==='en'){ _probe('en',wtitle).then(_showW); }
            else if(opts&&opts.wiki){   /* historical: English title → localized via langlinks, else EN fallback */
              _langlink(wtitle).then(loc=>{ const t2=loc||wtitle; _probe(wl,t2).then(j=>{ if(!_showW(j)) _probe('en',wtitle).then(_showW); }); }); }
            else { /* modern place: name is already in the current language */ _probe(wl,wtitle).then(j=>{ if(_showW(j)) return; _probe('en',wtitle).then(_showW); }); } }
          /* (#R20) AI Research Assistant entry point */
          const ai=document.querySelector('.plc-ai');
          if(ai) ai.onclick=()=>{ try{ if(window.IntMapConsole&&window.IntMapConsole.brief){ window.IntMapConsole.brief(name,lngLat); } else if(window.IntMapAIResearch){ window.IntMapAIResearch.open(name,lngLat); } }catch(_){} };   /* (#R62) brief runs inside Atlas */
          /* (#R122) resolve the clicked place's polygon: the caller-supplied era border, else the outline this
             popup drew (works for sub-national regions / cities too), else the modern country polygon under the point. */
          const _placeGeo=()=>{ try{ if(opts&&opts.geojson&&/Polygon/.test(opts.geojson.type||'')) return opts.geojson;
              const c=window.IntMapOutline&&window.IntMapOutline.current&&window.IntMapOutline.current(); if(c&&c.geo&&/Polygon/.test(c.geo.type||'')) return c.geo; }catch(_){}
            try{ if(window.countryGeo&&typeof turf!=='undefined'){ const pt=turf.point([lngLat.lng,lngLat.lat]); for(const f of window.countryGeo.features){ try{ if(turf.booleanPointInPolygon(pt,f)) return f.geometry; }catch(_){} } } }catch(_){}
            return null; };
          /* the outline may still be loading (async Nominatim for a non-country) — resolve now or poll briefly */
          const _withGeo=(cb)=>{ let g=_placeGeo(); if(g){ cb(g); return; } let n=0; const iv=setInterval(()=>{ n++; const g2=_placeGeo(); if(g2){ clearInterval(iv); cb(g2); } else if(n>15){ clearInterval(iv); cb(null); } },200); };
          const iso=document.querySelector('.plc-iso');
          if(iso) iso.onclick=()=>{ _withGeo(g=>{ try{ popup&&popup.remove(); }catch(_){}
            /* (#R106/#R122) isolate the EXACT clicked shape — era polygon, outlined sub-national region, city, or the
               modern country — via enterGeom; only fall back to the point-based country path when no polygon exists. */
            try{ if(g&&window.IntMapIsolate&&window.IntMapIsolate.enterGeom){ window.IntMapIsolate.enterGeom(g,name); }
              else if(window.IntMapIsolate&&window.IntMapIsolate.enterAt){ window.IntMapIsolate.enterAt(lngLat.lng,lngLat.lat,name); } }catch(_){} }); };
          const mv=document.querySelector('.plc-move');
          if(mv) mv.onclick=()=>{ _withGeo(g=>{ if(!g){ try{ if(typeof imToast==='function') imToast(jp?'この場所の範囲が取得できませんでした':'No boundary available for this place'); }catch(_){} return; }
            try{ popup&&popup.remove(); }catch(_){} try{ window.IntMapOutline&&window.IntMapOutline.clear&&window.IntMapOutline.clear(); }catch(_){}
            try{ window.IntMapMoveShape&&window.IntMapMoveShape.start(g,name); }catch(_){} }); };
        },0);
      }catch(_){}
    }
    function highlight(lngLat,isCountry){ if(!ensureHL()) return; const set=(fc)=>{ try{ map.getSource('place-hl-src').setData(fc); }catch(_){} };
      const dot={type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[lngLat.lng,lngLat.lat]},properties:{}}]};
      if(!isCountry){ set(dot); return; }
      const fill=()=>{ try{ const cg=window.countryGeo; if(cg&&cg.features&&typeof turf!=='undefined'){ const pt=turf.point([lngLat.lng,lngLat.lat]);
          for(const f of cg.features){ try{ if(turf.booleanPointInPolygon(pt,f)){ set({type:'FeatureCollection',features:[{type:'Feature',geometry:f.geometry,properties:{}}]}); return; } }catch(_){} } } set(dot); }catch(_){ set(dot); } };
      if(typeof withCountries==='function'){ try{ withCountries(fill); }catch(_){ fill(); } } else fill();
    }
    /* (#R62) anchor the popup at the LABEL's own point (its symbol geometry), not the raw click position —
       "ポップアップの位置は、クリック地点に固定ではなく、地名ラベルの位置に固定に". Line-placed labels (rivers)
       have no single point, so those keep the click position. */
    function labelAnchor(f,e){ try{ const g=f&&f.geometry; if(g&&g.type==='Point'&&Array.isArray(g.coordinates)){ let lng=+g.coordinates[0]; const lat=+g.coordinates[1];
      if(isFinite(lng)&&isFinite(lat)){ try{ const c=e&&e.lngLat?e.lngLat.lng:lng; while(lng-c>180) lng-=360; while(lng-c<-180) lng+=360; }catch(_){} return {lng,lat}; } } }catch(_){} return e.lngLat; }
    function onLabel(isCountry){ return (e)=>{ if(!e.features||!e.features.length) return; const p=e.features[0].properties||{}; const name=p.name||p['name:en']||p['name_en']||p.name_en||''; if(!name) return;
      /* (#R9/#12) The red area/dot highlight was unwanted — only the copyable popup remains. */
      showPopup(labelAnchor(e.features[0],e),name,isCountry); }; }
    /* (#R62) water / terrain labels are now clickable too (popup with Copy/Wikipedia/AI brief; NO highlight). */
    function onGeoLabel(){ return (e)=>{ if(!e.features||!e.features.length) return; const f=e.features[0]; const p=f.properties||{};
      const gl=(({jp:'jp',de:'de',ru:'ru',es:'es'})[HOST.lang])||'en';
      const name=(f.layer&&f.layer.id==='geo-sea')?(p[gl]||p.en||''):(p.name||p['name:en']||p.name_en||''); if(!name) return;
      showPopup(labelAnchor(f,e),name,false,{noOutline:true,noAreaTools:true}); }; }   /* (#R123) water/terrain = no area → no Isolate/Move */
    function wire(){ if(wired) return; if(!map.getLayer('ofm-country')) return; wired=true;
      map.on('click','ofm-country',onLabel(true)); map.on('click','ofm-city',onLabel(false)); map.on('click','ofm-other',onLabel(false));
      ['geo-sea','ofm-water','ofm-water2','ofm-river','ofm-peak'].forEach(id=>{ try{ map.on('click',id,onGeoLabel()); }catch(_){} });
      ['ofm-country','ofm-city','ofm-other','geo-sea','ofm-water','ofm-water2','ofm-river','ofm-peak'].forEach(id=>{ map.on('mouseenter',id,()=>{ map.getCanvas().style.cursor='pointer'; }); map.on('mouseleave',id,()=>{ map.getCanvas().style.cursor=''; }); });
      /* clicking the map away from any label clears the highlight */
      map.on('click',(e)=>{ try{
        const ls=['ofm-country','ofm-city','ofm-other','geo-sea','ofm-water','ofm-water2','ofm-river','ofm-peak'].filter(id=>map.getLayer(id)); if(!ls.length) return;
        const hit=map.queryRenderedFeatures(e.point,{layers:ls});
        if(hit.length) return;   /* exact glyph hit → the per-layer onLabel handler already opened the popup */
        /* (#R23) PADDED hit-box: a finger tap almost never lands on the exact label glyph, so the popup
           "モバイル版では出ない". Re-query a small box around the tap (bigger on touch) and open the nearest
           label's popup. Skipped while a measurement/draw tool owns the gesture. */
        if(typeof HOST.toolMode==='undefined' || !HOST.toolMode){
          const pad=(typeof isMobile==='function'&&isMobile())?15:6;
          const near=map.queryRenderedFeatures([[e.point.x-pad,e.point.y-pad],[e.point.x+pad,e.point.y+pad]],{layers:ls});
          if(near.length){ const lid=(near[0].layer&&near[0].layer.id)||''; const p=near[0].properties||{}; const geoLbl=/^(geo-sea|ofm-water|ofm-river|ofm-peak)$/.test(lid);
            const gl=(({jp:'jp',de:'de',ru:'ru',es:'es'})[HOST.lang])||'en';
            const nm=(lid==='geo-sea')?(p[gl]||p.en||''):(p.name||p['name:en']||p.name_en||p['name_en']||'');
            if(nm){ showPopup(labelAnchor(near[0],e),nm,lid==='ofm-country',geoLbl?{noOutline:true,noAreaTools:true}:undefined); return; } }
        }
        clearHL();
      }catch(_){} });
    }
    function tryWire(n){ if(map.getLayer('ofm-country')){ wire(); return; } if((n||0)<300) setTimeout(()=>tryWire((n||0)+1),200); }
    if(map.isStyleLoaded()) tryWire(0); else map.on('load',()=>tryWire(0));
    /* (#R101) RE-ARM the label-click wiring on every style/source update. The old bounded 12 s retry could give up
       before the (sometimes slow) OpenFreeMap label layers finished loading — and because BOTH the per-layer
       handlers AND the padded-hit fallback live inside wire(), that left place-name labels completely UNCLICKABLE
       in the present (and past). styledata fires whenever the ofm source settles / after a basemap swap, so wire()
       now binds the moment ofm-country exists, however late. Also re-creates the highlight layers after a swap. */
    map.on('styledata',()=>{ if(!wired){ try{ tryWire(0); }catch(_){} } setTimeout(()=>{ try{ ensureHL(); }catch(_){} }, 120); });
    /* (#R94m) EXACT same reaction for historical labels: reuse this place popup (Copy/Wikipedia/AI brief/Isolate
       + blue outline). `geojson` lets the caller outline the era polygon (an empire, not just one modern country). */
    window._imPlacePopup=(lngLat,name,isCountry,opts)=>{ try{ showPopup(lngLat,name,isCountry,opts); }catch(_){} };
  })();
};

window.IntMapModules.geojsonUpload=function(map,HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const imToast=HOST.imToast;
  (function(){
    if(!map) return;
    let seq=0; const items=[]; let listEl=null;
    const PALETTE=['#ff9500','#34c759','#5856d6','#ff2d55','#00b8d4','#ffcc00','#af52de','#0a84ff'];
    const jp=()=>HOST.lang==='jp';
    const toast=(m)=>{ try{ imToast(m); }catch(_){} };
    const fileInput=document.createElement('input'); fileInput.type='file'; fileInput.accept='.geojson,.json,application/geo+json,application/json'; fileInput.multiple=true; fileInput.style.display='none'; document.body.appendChild(fileInput);
    function toFC(g){ if(!g||typeof g!=='object') return null;
      if(g.type==='FeatureCollection' && Array.isArray(g.features)) return g;
      if(g.type==='Feature') return {type:'FeatureCollection',features:[g]};
      if(g.type && g.coordinates) return {type:'FeatureCollection',features:[{type:'Feature',geometry:g,properties:{}}]};
      if(Array.isArray(g.features)) return {type:'FeatureCollection',features:g.features};
      return null; }
    function fit(fc){ try{ if(typeof turf!=='undefined'){ const bb=turf.bbox(fc); if(bb.every(isFinite) && bb[0]>=-180 && bb[2]<=180) map.fitBounds([[bb[0],bb[1]],[bb[2],bb[3]]],{padding:60,duration:900,maxZoom:12}); } }catch(_){} }
    function addFC(fc,name){
      const n=++seq, sid='ugj-'+n, col=PALETTE[(n-1)%PALETTE.length];
      try{ map.addSource(sid,{type:'geojson',data:fc}); }catch(e){ toast(jp()?'読み込みに失敗しました':'Failed to add layer'); return; }
      const before = map.getLayer('tool-poly')?'tool-poly':undefined;
      try{
        map.addLayer({id:sid+'-fill',type:'fill',source:sid,filter:['==','$type','Polygon'],paint:{'fill-color':col,'fill-opacity':0.22}},before);
        map.addLayer({id:sid+'-line',type:'line',source:sid,filter:['in','$type','Polygon','LineString'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':col,'line-width':2.2}},before);
        map.addLayer({id:sid+'-pt',type:'circle',source:sid,filter:['==','$type','Point'],paint:{'circle-radius':5,'circle-color':col,'circle-stroke-color':'#fff','circle-stroke-width':1.4}},before);
      }catch(_){}
      items.push({n,sid,name,col}); renderList(); fit(fc);
      try{ window._imNoteObjects&&window._imNoteObjects(['up_'+n]); }catch(_){}   /* (#R120) uploads join Atlas's "さっき作ったやつ" deixis */
      toast((jp()?'GeoJSONを表示: ':'GeoJSON added: ')+name);
    }
    function removeItem(n){ const i=items.findIndex(x=>x.n===n); if(i<0) return; const it=items[i];
      [it.sid+'-fill',it.sid+'-line',it.sid+'-pt'].forEach(l=>{ try{ if(map.getLayer(l)) map.removeLayer(l); }catch(_){} });
      try{ if(map.getSource(it.sid)) map.removeSource(it.sid); }catch(_){}
      items.splice(i,1); renderList(); }
    function renderList(){ if(!listEl) return;
      listEl.innerHTML=items.map(it=>`<div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:2px 0;"><span style="width:11px;height:11px;border-radius:3px;background:${it.col};flex:0 0 auto;"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${String(it.name).replace(/[<>&]/g,'')}</span><button data-rm="${it.n}" title="${jp()?'削除':'Remove'}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:13px;line-height:1;">✕</button></div>`).join('');
      listEl.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>removeItem(+b.getAttribute('data-rm'))); }
    function handleFiles(files){ Array.from(files||[]).forEach(f=>{ const r=new FileReader();
      r.onload=()=>{ let g=null; try{ g=JSON.parse(r.result); }catch(_){ toast(jp()?'JSONの解析に失敗しました':'Could not parse JSON'); return; }
        const fc=toFC(g); if(!fc||!fc.features||!fc.features.length){ toast(jp()?'有効なGeoJSONではありません':'Not valid GeoJSON'); return; }
        addFC(fc, f.name||'GeoJSON'); };
      r.readAsText(f); }); }
    fileInput.addEventListener('change',()=>{ handleFiles(fileInput.files); fileInput.value=''; });
    function mountButton(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('btn-upload-geojson')) return;
      const wrap=document.createElement('div'); wrap.id='ugj-mount'; wrap.style.marginTop='6px';
      wrap.innerHTML=`<hr style="border:0;border-top:1px solid rgba(128,128,128,0.2);width:100%;margin:6px 0;"><button id="btn-upload-geojson" class="ai-test-btn" style="width:100%;">📂 <span data-i18n="uploadGeoJSON">Upload GeoJSON</span></button><div id="ugj-list" style="margin-top:5px;"></div>`;
      dd.appendChild(wrap); listEl=wrap.querySelector('#ugj-list');
      wrap.querySelector('#btn-upload-geojson').onclick=()=>fileInput.click();
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    mountButton(); setTimeout(mountButton,1500);
    const mc=document.getElementById('map-container');
    if(mc){ mc.addEventListener('dragover',e=>{ if(e.dataTransfer&&Array.from(e.dataTransfer.types||[]).includes('Files')) e.preventDefault(); });
      mc.addEventListener('drop',e=>{ if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length){ e.preventDefault(); handleFiles(e.dataTransfer.files); } }); }
    window.GeoJSONUpload={ open:()=>fileInput.click(), add:addFC, remove:removeItem, _items:items };   /* (#R88) expose remove so the universal Object List can delete an uploaded layer */
  })();
};

window.IntMapModules.viewHash=function(map,HOST){
  (function(){
    if(!map) return;
    let restoring=false, t=null;
    /* (#R42b) Per-TAB flag: true on the FIRST load of a tab (a fresh open / a shared link / a copied address
       bar opened on another device), false on a plain RELOAD of the same tab. sessionStorage survives reload
       but is absent in a new tab. This lets a shared/opened URL restore the FULL state while a reload of your
       own tab stays clean (the R33 "落ちても通常の初期時に" intent) — WITHOUT the old self=1 marker, so the
       address bar is now itself a complete, copy-and-share link. */
    let firstLoad; try{ firstLoad = (sessionStorage.getItem('intmap_session')!=='1'); sessionStorage.setItem('intmap_session','1'); }catch(_){ firstLoad=null; }
    function activeLayers(){ const ids=new Set(); try{
      /* (#R40) capture EVERY data-layer checkbox convention so the share link carries ALL selected layers
         (previously only dl-* / geo-layer-cb → GIBS gx-*, eco-dl-*, round-9 l9-dl-*, beta-dl-* were lost). */
      document.querySelectorAll('input[id^="dl-"]:checked, input[id^="gx-"]:checked, input[id^="eco-dl-"]:checked, input[id^="l9-dl-"]:checked, input[id^="beta-dl-"]:checked, .geo-layer-cb:checked, #r7-dl-disputes:checked, #r7-dl-airdef:checked, #r7-dl-langs:checked').forEach(cb=>{ const k=cb.id||cb.getAttribute('data-layer'); if(k) ids.add(k); });
    }catch(_){} return Array.from(ids); }
    function encode(){ try{ const c=map.getCenter(); const v=[c.lng.toFixed(4),c.lat.toFixed(4),map.getZoom().toFixed(2),Math.round(map.getBearing()),Math.round(map.getPitch()),(HOST.proj==='globe'?'g':'f')].join(',');
      const ls=activeLayers(); let h='#v='+v; if(ls.length) h+='&l='+ls.join(',');
      /* (#R101) time-travel state saved as the kernel's ISO instant (mode-independent — the slider is now year-based),
         so a shared link reproduces the exact moment; compare state too. */
      try{ const T=window.IntMapTime; if(T&&T.state){ const s=T.state(); if(s&&!s.isLive&&s.iso) h+='&tt='+encodeURIComponent(s.iso); } }catch(_){}
      try{ const cw=document.getElementById('compare-window'); if(cw && getComputedStyle(cw).display!=='none') h+='&cmp='+(cw.classList.contains('cmp-xray')?'x':'1'); }catch(_){}
      /* (#R42) satellite base view too, so "今の状態をそのまま" share/restore reproduces Map-vs-Satellite. */
      try{ if(typeof HOST.mapType!=='undefined' && HOST.mapType==='sat') h+='&sat=1'; }catch(_){}
      return h; }catch(_){ return ''; } }
    /* (#R23) never persist layers while the intro AUTO-demo is toggling them — otherwise a demo layer
       lands in the URL hash and gets restored on the next load, so a layer the user never chose appears
       on its own ("なにも操作していないのに勝手にレイヤーがオンになる"). */
    /* (#R33→#R42b) The R33 "reload returns clean" intent ("落ちても通常の初期時に") used a self=1 URL marker,
       but that made the address bar non-shareable (copying it lost the layers). R42b drops the marker and writes
       the FULL state straight to the address bar — so the URL is itself a complete copy-and-share link — while
       the SAME reload-clean behaviour is preserved via the per-tab `firstLoad` sessionStorage flag (a reload of
       your own tab restores the view only; a fresh open / shared link / same-tab paste restores everything). */
    function save(){ if(restoring || window._imDemoActive) return; const h=encode(); if(!h) return; try{ history.replaceState(null,'',location.pathname+location.search+h); }catch(_){} }
    /* (#R42b) restore. The VIEW (center/zoom/bearing/pitch/projection) is ALWAYS restored. The FULL state
       (layers + time-travel + compare + base map, EXACTLY) is restored when this is a shared/explicit open —
       i.e. a hashchange navigation (opts.shared, e.g. pasting a link in the same tab) OR the first load of the
       tab (firstLoad: a new tab / another device / a copied link). A plain RELOAD of the same tab restores the
       view only (R33). Legacy self=1 links still fully restore (firstLoad handles them). */
    function restore(opts){ const m=/[#&]v=([^&]+)/.exec(location.hash); if(!m) return; restoring=true;
      const full = !!(opts&&opts.shared===true) || (firstLoad!==false);   /* firstLoad null (no sessionStorage) → favour restore */
      try{ const p=decodeURIComponent(m[1]).split(','); const lng=+p[0],lat=+p[1],z=+p[2],br=+p[3]||0,pi=+p[4]||0,proj=p[5];
        if(proj==='f'&&HOST.proj!=='flat'){ const b=document.getElementById('btn-view-flat'); if(b) b.click(); }
        else if(proj==='g'&&HOST.proj!=='globe'){ const b=document.getElementById('btn-view-globe'); if(b) b.click(); }
        if(isFinite(lng)&&isFinite(lat)) map.jumpTo({center:[lng,lat],zoom:isFinite(z)?z:2,bearing:br,pitch:pi});
        /* satellite base view: switch ON if wanted; on a FULL restore also switch back to Map if NOT wanted (so a
           shared link reproduces the base exactly, e.g. pasting a no-sat link over a satellite session). */
        try{ const wantSat=/[#&]sat=1/.test(location.hash);
          if(wantSat){ const sb=document.getElementById('btn-view-sat'); if(sb&&typeof HOST.mapType!=='undefined'&&HOST.mapType!=='sat') setTimeout(()=>{ try{ sb.click(); }catch(_){} },300); }
          else if(full){ const mb=document.getElementById('btn-view-map'); if(mb&&typeof HOST.mapType!=='undefined'&&HOST.mapType==='sat') setTimeout(()=>{ try{ mb.click(); }catch(_){} },300); } }catch(_){}
      }catch(_){}
      if(full){
        const lm=/[#&]l=([^&]+)/.exec(location.hash);
        const want=lm?decodeURIComponent(lm[1]).split(','):[]; const wantSet=new Set(want);
        const DATASEL='input[id^="dl-"]:checked, input[id^="gx-"]:checked, input[id^="eco-dl-"]:checked, input[id^="l9-dl-"]:checked, input[id^="beta-dl-"]:checked, .geo-layer-cb:checked, #r7-dl-disputes:checked, #r7-dl-airdef:checked, #r7-dl-langs:checked';
        const apply=()=>{
          want.forEach(k=>{ const cb=document.getElementById(k)||document.querySelector('.geo-layer-cb[data-layer="'+k+'"]'); if(cb&&!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); } });
          /* turn OFF any data layer NOT in the link so the shared state is reproduced EXACTLY (matters when a
             link is pasted into a tab that already had layers on). Base toggles (names/borders/…) are untouched. */
          document.querySelectorAll(DATASEL).forEach(cb=>{ const k=cb.id||cb.getAttribute('data-layer'); if(k && !wantSet.has(k)){ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); } });
        };
        [700,1800,3200].forEach(ms=>setTimeout(apply,ms));
        /* (#R101) restore time-travel via the kernel (mode-independent). `tt`=ISO instant; keep `ts` (old day-based
           links) for backward compatibility. */
        const tt=/[#&]tt=([^&]+)/.exec(location.hash);
        if(tt){ setTimeout(()=>{ try{ const d=new Date(decodeURIComponent(tt[1])); if(!isNaN(d.getTime())&&window.IntMapTime) window.IntMapTime.set(d,{source:'ui'}); }catch(_){} },900); }
        else { const tm=/[#&]ts=(\d+)/.exec(location.hash);
          if(tm){ setTimeout(()=>{ try{ if(window.IntMapTime) window.IntMapTime.setDaysAgo(3650-parseInt(tm[1],10),{source:'ui'}); }catch(_){} },900); } }
        const cm2=/[#&]cmp=([^&]+)/.exec(location.hash);
        if(cm2){ setTimeout(()=>{ try{ window.IntMapCompare&&window.IntMapCompare.open(); if(cm2[1]==='x'){ setTimeout(()=>{ const xb=Array.from(document.querySelectorAll('#compare-window .cmp-btn')).find(b=>/x-ray/i.test(b.textContent)); if(xb) xb.click(); },700); } }catch(_){} },1300); }
      }
      setTimeout(()=>{ restoring=false; },3500);
    }
    map.on('moveend',()=>{ clearTimeout(t); t=setTimeout(save,400); });
    /* (#R42b) ROOT CAUSE of "コピーしたリンクを開いてもそのままにならない": pasting a link into the SAME tab is a
       hash-only navigation — no reload — so restore() never re-ran. history.replaceState (used by save) does NOT
       fire hashchange, so this can't loop. Re-run a FULL restore on any user hash navigation to a state link. */
    window.addEventListener('hashchange',()=>{ try{ if(restoring) return; if(/[#&]v=/.test(location.hash)) restore({shared:true}); }catch(_){} });
    /* (#R16) GHOST-LAYER fix: the hash (which restore() re-applies on reload) used to update ONLY on pan,
       so toggling a layer OFF without panning left it in the hash → it "came back" on the next/crash reload
       ("表示を辞めたはずのレイヤーが残り続ける"). Persist the hash on EVERY layer change so the restored set
       always matches what's actually on. */
    document.addEventListener('change',(e)=>{ const el=e.target; if(el && (el.id&&/^dl-/.test(el.id) || (el.classList&&el.classList.contains('geo-layer-cb')))){ clearTimeout(t); t=setTimeout(save,300); } });
    if(map.isStyleLoaded()) restore(); else map.on('load',restore);
    window.IntMapBookmark={ link:()=>location.origin+location.pathname+location.search+encode(), save:save, restore:restore };
  })();
};

window.IntMapModules.share=function(map,HOST){
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const t=HOST.t;
  window.IntMapShare=(function(){
    const L=(en,j,de,ru,es)=>HOST.lang==='jp'?j:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?(es||en):en;
    let panel=null, styled=false;
    function ensureStyle(){ if(styled) return; styled=true; const s=document.createElement('style');
      s.textContent='#share-panel{position:absolute;z-index:1800;left:50%;top:80px;transform:translateX(-50%);width:min(440px,calc(100vw - 24px));background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));border-radius:16px;box-shadow:var(--shadow);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);padding:16px 18px;font-size:13px;}'
        +'#share-panel h4{margin:0 0 4px;font-size:15px;font-weight:700;}'
        +'#share-panel .sh-x{position:absolute;top:10px;right:12px;background:none;border:none;color:var(--text-muted);font-size:20px;line-height:1;cursor:pointer;padding:2px 7px;border-radius:8px;}'
        +'#share-panel .sh-x:hover{background:var(--input-bg);color:var(--text-main);}'
        +'#share-panel .sh-row{display:flex;gap:8px;margin-top:12px;}'
        +'#share-panel .sh-url{flex:1;min-width:0;height:40px;padding:0 12px;border-radius:11px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);font-size:12px;box-sizing:border-box;}'
        +'#share-panel .sh-btn{flex:0 0 auto;height:40px;padding:0 16px;border:none;border-radius:11px;background:var(--primary-color);color:#fff;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:transform .08s ease,filter .15s ease;}'
        +'#share-panel .sh-btn.sec{background:var(--input-bg);color:var(--text-main);}'
        +'#share-panel .sh-btn:hover{filter:brightness(1.06);}'
        +'#share-panel .sh-btn:active{transform:scale(0.96);}'
        +'#share-panel .sh-inc{margin-top:13px;font-size:11px;color:var(--text-muted);line-height:1.6;border-top:1px solid rgba(128,128,128,0.16);padding-top:10px;}'
        +'#share-panel .sh-inc b{color:var(--text-main);font-weight:600;}'
        +'@media(max-width:768px){#share-panel{left:8px;right:8px;width:auto;transform:none;top:auto;bottom:calc(var(--sheet-cover, var(--peek-h)) + 12px);}}';
      document.head.appendChild(s); }
    function close(){ if(panel) panel.style.display='none'; }
    function open(){
      ensureStyle();
      const link=(window.IntMapBookmark&&window.IntMapBookmark.link)?window.IntMapBookmark.link():location.href;
      if(!panel){ panel=document.createElement('div'); panel.id='share-panel'; (document.getElementById('map-container')||document.body).appendChild(panel); }
      panel.style.display='block';
      const inc=L('Includes: position, zoom, projection, base map, every active layer, time-travel & compare state.',
        '含まれる情報: 位置・ズーム・投影・ベースマップ・選択中の全レイヤー・時刻（タイムトラベル）・比較状態。',
        'Enthalten: Position, Zoom, Projektion, Basiskarte, alle aktiven Ebenen, Zeitreise & Vergleich.',
        'Включено: позиция, зум, проекция, базовая карта, все активные слои, время и режим сравнения.',
        'Incluye: posición, zoom, proyección, mapa base, todas las capas activas, viaje en el tiempo y comparación.');
      panel.innerHTML='<button class="sh-x" title="'+t('close')+'">✕</button>'
        +'<h4>🔗 '+L('Share this view','このビューを共有','Diese Ansicht teilen','Поделиться видом','Compartir esta vista')+'</h4>'
        +'<div style="font-size:11.5px;color:var(--text-muted);">'+L('Anyone who opens this link sees the map exactly as you do now.','このリンクを開くと、今あなたが見ている状態がそのまま再現されます。','Wer den Link öffnet, sieht die Karte genau wie Sie jetzt.','Открывший ссылку увидит карту точно как вы сейчас.','Quien abra el enlace verá el mapa tal como lo ves ahora.')+'</div>'
        +'<div class="sh-row"><input class="sh-url" type="text" readonly value="'+String(link).replace(/"/g,'&quot;')+'"><button class="sh-btn sh-copy">📋 '+L('Copy','コピー','Kopieren','Копировать','Copiar')+'</button></div>'
        +(navigator.share?('<div class="sh-row"><button class="sh-btn sec sh-native" style="flex:1;">📤 '+L('Share…','共有…','Teilen…','Поделиться…','Compartir…')+'</button></div>'):'')
        +'<div class="sh-inc">'+inc+'</div>';
      const urlEl=panel.querySelector('.sh-url'); try{ urlEl.focus(); urlEl.select(); }catch(_){}
      panel.querySelector('.sh-x').onclick=close;
      const copyBtn=panel.querySelector('.sh-copy');
      copyBtn.onclick=async()=>{ let ok=false;
        try{ await navigator.clipboard.writeText(link); ok=true; }catch(_){ try{ urlEl.select(); ok=document.execCommand('copy'); }catch(__){} }
        copyBtn.textContent=ok?('✓ '+L('Copied!','コピー完了','Kopiert!','Скопировано!','¡Copiado!')):('⚠ Ctrl+C');
        setTimeout(()=>{ copyBtn.textContent='📋 '+L('Copy','コピー','Kopieren','Копировать','Copiar'); },1900); };
      const nb=panel.querySelector('.sh-native'); if(nb) nb.onclick=()=>{ try{ navigator.share({title:'IntMap',url:link}); }catch(_){} };
    }
    return { open, close };
  })();
};
