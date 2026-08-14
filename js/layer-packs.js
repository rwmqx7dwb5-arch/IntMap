/* ============================================================================
 *  IntMap · Extra layer packs — IntMapModules.{earthSky,landCover,betaPack2,religionLang,timeZones,gibsScience}  (#R166)
 * ----------------------------------------------------------------------------
 *  Six self-contained packs of data-layer rows that register themselves into the Layers panel:
 *  earth/sky/airspace (dams · volcanoes · aurora · ADIZ), land cover & ecoregions & tectonics, the
 *  second beta pack, religion & language choropleths, real time-zone boundaries with live local time,
 *  and the NASA GIBS science rasters.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R166): each body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      countryGeo -> HOST.countryGeo
 *      currentLang -> HOST.lang
 *      currentProj -> HOST.proj
 *
 *  Every factory is called at the exact spot its block used to occupy, so execution order is
 *  unchanged. The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.earthSky=function(HOST){
  const LPK=window.IntMapLang.pick(()=>HOST.lang);
  /* (#R241) the ARRAY form — see `pickArgs` in js/lang-registry.js. Four tables in this file held
     their translations JP-first and indexed them with a private `{jp:0,en:1,…}` map, i.e. a second
     copy of the language order that named four languages: every one of these layer names was
     English on es/fr/ko/zh and invisible to every instrument. */
  const LA=window.IntMapLang.pickArgs();
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const imToast=HOST.imToast;
  (function(){
    if(!GE().hasRenderer()) return;
    const jp=()=>HOST.lang==='jp';
    const setVis=(ids,on)=>ids.forEach(l=>{ try{ if(GE().layers.has(l)) GE().layers.setLayout(l,'visibility',on?'visible':'none'); }catch(_){} });
    const state={dams:false,volcanoes:false,aurora:false,adiz:false};
    /* Curated point datasets (famous, well-located). dam: capacity MW; volcano: summit m. */
    const DAMS=[['Three Gorges','China',22500,111.003,30.823],['Itaipú','Brazil/Paraguay',14000,-54.589,-25.408],['Xiluodu','China',13860,103.65,28.25],['Belo Monte','Brazil',11233,-51.79,-3.13],['Guri','Venezuela',10235,-62.999,7.766],['Tucuruí','Brazil',8370,-49.64,-3.83],['Grand Coulee','USA',6809,-118.982,47.957],['Xiangjiaba','China',6448,104.42,28.64],['Longtan','China',6426,107.04,25.02],['Sayano-Shushenskaya','Russia',6400,91.37,52.83],['Krasnoyarsk','Russia',6000,92.30,55.93],['Robert-Bourassa','Canada',5616,-77.44,53.79],['Churchill Falls','Canada',5428,-64.10,53.53],['Bratsk','Russia',4500,101.77,56.28],['Jinping-I','China',3600,101.63,28.19],['Aswan High','Egypt',2100,32.877,23.971],['GERD','Ethiopia',5150,35.093,11.215],['Kariba','Zambia/Zimbabwe',1830,28.762,-16.522],['Cahora Bassa','Mozambique',2075,32.70,-15.585],['Akosombo','Ghana',1020,0.06,6.30],['Tarbela','Pakistan',4888,72.69,34.09],['Bhakra','India',1325,76.43,31.41],['Sardar Sarovar','India',1450,73.75,21.83],['Atatürk','Türkiye',2400,38.32,37.49],['Hoover','USA',2078,-114.738,36.016],['Glen Canyon','USA',1320,-111.485,36.937],['Oroville','USA',819,-121.49,39.54],['Nurek','Tajikistan',3015,69.35,38.37],['Rogun','Tajikistan',3600,69.77,38.69],['Merowe','Sudan',1250,31.84,18.68],['Daniel-Johnson','Canada',2660,-68.74,50.66],['Mosul','Iraq',1052,42.82,36.63]];
    const VOLC=[['Etna','Italy',3357,14.999,37.748],['Stromboli','Italy',924,15.213,38.789],['Vesuvius','Italy',1281,14.426,40.821],['Mt Fuji','Japan',3776,138.728,35.361],['Sakurajima','Japan',1117,130.657,31.585],['Aso','Japan',1592,131.104,32.884],['Kīlauea','USA',1247,-155.287,19.421],['Mauna Loa','USA',4169,-155.608,19.475],['Mt St. Helens','USA',2549,-122.18,46.20],['Yellowstone','USA',2805,-110.67,44.43],['Popocatépetl','Mexico',5426,-98.622,19.023],['Colima','Mexico',3850,-103.62,19.514],['Fuego','Guatemala',3763,-90.88,14.473],['Pacaya','Guatemala',2552,-90.601,14.381],['Arenal','Costa Rica',1670,-84.703,10.463],['Cotopaxi','Ecuador',5897,-78.437,-0.677],['Villarrica','Chile',2860,-71.93,-39.42],['Nevado del Ruiz','Colombia',5321,-75.324,4.892],['Cumbre Vieja','Spain',1949,-17.84,28.57],['Merapi','Indonesia',2910,110.446,-7.54],['Anak Krakatau','Indonesia',155,105.423,-6.102],['Sinabung','Indonesia',2460,98.392,3.17],['Semeru','Indonesia',3676,112.92,-8.108],['Tambora','Indonesia',2850,118.0,-8.25],['Rinjani','Indonesia',3726,116.47,-8.42],['Pinatubo','Philippines',1486,120.35,15.13],['Mayon','Philippines',2462,123.685,13.257],['Taal','Philippines',311,120.993,14.002],['Erebus','Antarctica',3794,167.17,-77.53],['Nyiragongo','DR Congo',3470,29.25,-1.52],['Ol Doinyo Lengai','Tanzania',2962,35.914,-2.764],['Erta Ale','Ethiopia',613,40.67,13.6],['Piton de la Fournaise','Réunion',2632,55.708,-21.244],['Eyjafjallajökull','Iceland',1651,-19.62,63.63],['Grímsvötn','Iceland',1725,-17.33,64.42],['Hekla','Iceland',1491,-19.70,63.98],['Bárðarbunga','Iceland',2009,-17.53,64.64],['Klyuchevskoy','Russia',4750,160.642,56.056],['Shiveluch','Russia',3283,161.36,56.653],['Whakaari','New Zealand',321,177.18,-37.52],['Ruapehu','New Zealand',2797,175.57,-39.28],['Kelud','Indonesia',1731,112.31,-7.93]];
    /* Approximate ADIZ extents (labeled ≈) — illustrative, not survey-grade. */
    const ADIZ=[
      {n:'China ECS ADIZ',c:'#ff453a',ring:[[121.9,33.2],[125.0,33.2],[128.3,31.0],[127.5,29.0],[123.0,25.8],[120.6,27.4],[120.0,30.2],[121.9,33.2]]},
      {n:'KADIZ (Korea)',c:'#ffcc00',ring:[[124.0,39.6],[129.5,39.6],[131.5,37.0],[131.0,33.8],[127.0,32.2],[124.5,33.0],[123.0,35.5],[124.0,39.6]]},
      {n:'Taiwan ADIZ',c:'#34c759',ring:[[117.5,27.5],[123.0,27.5],[123.0,21.0],[117.5,21.0],[117.5,27.5]]}
    ];
    function ptFC(arr,kind){ return {type:'FeatureCollection',features:arr.map(d=>({type:'Feature',geometry:{type:'Point',coordinates:[d[3],d[4]]},properties:{name:d[0],info:(kind==='dam'?(d[2]?d[2].toLocaleString()+' MW · ':''):(d[2]?d[2].toLocaleString()+' m · ':''))+d[1]}}))}; }
    function adizFC(){ return {type:'FeatureCollection',features:ADIZ.map(a=>({type:'Feature',geometry:{type:'Polygon',coordinates:[a.ring]},properties:{name:'≈ '+a.n,color:a.c}}))}; }
    let popup=null;
    function showPop(c,title,info){ try{ if(popup) popup.remove(); }catch(_){}
      const html='<div style="min-width:140px;"><div style="font-weight:700;font-size:14px;color:var(--text-main);">'+title+'</div><div style="font-size:12px;color:var(--text-muted);margin-top:3px;">'+info+'</div></div>';
      try{ popup=GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,className:'plc-popup',maxWidth:'260px'}).setLngLat(c).setHTML(html)); }catch(_){}
    }
    let wired=false;
    function ensureLayers(){ if(!_imCanDraw()) return false;
      try{
        if(!GE().layers.hasSource('l9-dams')){ GE().layers.addSource('l9-dams',{type:'geojson',data:ptFC(DAMS,'dam')});
          GE().layers.add({id:'l9-dams-pt',type:'circle',source:'l9-dams',layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],2,3.4,7,7],'circle-color':'#34c7ff','circle-stroke-color':'#fff','circle-stroke-width':1.3,'circle-opacity':0.92}});
          GE().layers.add({id:'l9-dams-lbl',type:'symbol',source:'l9-dams',minzoom:4,layout:{visibility:'none','text-field':['get','name'],'text-size':window.IntMapLabelScale.sub(0.82),'text-offset':[0,1.1],'text-anchor':'top','text-font':['literal',['Noto Sans Regular']]},paint:{'text-color':'#bdeaff','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.2}});
        }
        if(!GE().layers.hasSource('l9-volc')){ GE().layers.addSource('l9-volc',{type:'geojson',data:ptFC(VOLC,'volcano')});
          GE().layers.add({id:'l9-volc-pt',type:'circle',source:'l9-volc',layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],2,3.6,7,7.5],'circle-color':'#ff6a3d','circle-stroke-color':'#fff2e0','circle-stroke-width':1.3,'circle-opacity':0.95}});
          GE().layers.add({id:'l9-volc-lbl',type:'symbol',source:'l9-volc',minzoom:4,layout:{visibility:'none','text-field':['get','name'],'text-size':window.IntMapLabelScale.sub(0.82),'text-offset':[0,1.1],'text-anchor':'top','text-font':['literal',['Noto Sans Regular']]},paint:{'text-color':'#ffc8ad','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.2}});
        }
        if(!GE().layers.hasSource('l9-adiz')){ GE().layers.addSource('l9-adiz',{type:'geojson',data:adizFC()});
          GE().layers.add({id:'l9-adiz-fill',type:'fill',source:'l9-adiz',layout:{visibility:'none'},paint:{'fill-color':['get','color'],'fill-opacity':0.08}});
          GE().layers.add({id:'l9-adiz-line',type:'line',source:'l9-adiz',layout:{visibility:'none'},paint:{'line-color':['get','color'],'line-width':1.6,'line-dasharray':[3,2],'line-opacity':0.8}});
          GE().layers.add({id:'l9-adiz-lbl',type:'symbol',source:'l9-adiz',layout:{visibility:'none','symbol-placement':'point','text-field':['get','name'],'text-size':window.IntMapLabelScale.sub(0.9),'text-font':['literal',['Noto Sans Regular']]},paint:{'text-color':['get','color'],'text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1.3}});
        }
        if(!GE().layers.hasSource('l9-aurora')){ GE().layers.addSource('l9-aurora',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
          GE().layers.add({id:'l9-aurora-heat',type:'heatmap',source:'l9-aurora',layout:{visibility:'none'},paint:{'heatmap-weight':['interpolate',['linear'],['get','a'],0,0,100,1],
          /* (#R123) FIX "ズームレベルによって輝度が落ちる": the OVATION source is a dense ~1° grid, so its point
             spacing in SCREEN pixels grows ~2× per zoom. The old radius grew only linearly (10→30), so on zoom-in
             the points separated, per-pixel density collapsed and the oval faded. Grow the radius geometrically to
             track the grid spacing (keeps points overlapping) AND ramp intensity gently with zoom — together they
             hold the oval's brightness roughly constant across all zoom levels. */
          'heatmap-intensity':['interpolate',['linear'],['zoom'],1,1.1,4,1.35,7,1.9,10,2.6],
          'heatmap-radius':['interpolate',['linear'],['zoom'],1,10,3,20,4,30,5,52,6,88,7,150,8,250,9,380,10,480],
          /* (#R124) FIX re-report "ズームインすると見えなくなる": a heatmap thins on zoom-in once the ~1° grid points
             separate past any affordable radius, so we FADE IT OUT as zoom rises and hand off to a soft-circle GLOW
             (below) that renders regardless of point density — the oval now stays visible at every zoom. */
          'heatmap-opacity':['interpolate',['linear'],['zoom'],1,0.78,6,0.78,8,0.42,10,0.16],'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,0,0)',0.2,'rgba(0,120,60,0.45)',0.5,'rgba(0,220,120,0.6)',0.8,'rgba(140,255,170,0.85)',1,'rgba(210,255,220,0.95)']}});
          GE().layers.add({id:'l9-aurora-glow',type:'circle',source:'l9-aurora',layout:{visibility:'none'},paint:{
            'circle-radius':['interpolate',['exponential',2],['zoom'],3,8,5,26,7,110,9,430,11,1700],   /* ~grid spacing so soft circles keep overlapping */
            'circle-color':['interpolate',['linear'],['get','a'],8,'#00753b',20,'#00d072',50,'#7dffa6',100,'#d2ffdc'],
            'circle-blur':0.85,
            'circle-opacity':['interpolate',['linear'],['zoom'],4,0,6,0.32,8,0.62,10,0.8]}},'l9-aurora-heat');   /* under the heatmap; fades IN as the heatmap fades OUT */
        }
        /* Sea ice (#7) — AMSR2 concentration via NASA GIBS WMS GetMap (the WMTS tiles aren't in 3857, but
           the WMS GetMap IS). Date = today−2 (resolves to a real, processed day in the user's browser). */
        if(!GE().layers.hasSource('l9-seaice')){ const sd=new Date(Date.now()-2*864e5).toISOString().slice(0,10);
          GE().layers.addSource('l9-seaice',{type:'raster',tiles:['https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=AMSRU2_Sea_Ice_Concentration_12km&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+sd],tileSize:256,attribution:'NASA GIBS — AMSR2 sea-ice concentration'});
          GE().layers.add({id:'l9-seaice',type:'raster',source:'l9-seaice',layout:{visibility:'none'},paint:{'raster-opacity':0.82}});
        }
        if(!wired){ wired=true;
          GE().events.onLayer('click','l9-dams-pt',e=>{ if(!e.features[0])return; const p=e.features[0].properties; showPop(e.features[0].geometry.coordinates,'🏞 '+p.name,p.info); });
          GE().events.onLayer('click','l9-volc-pt',e=>{ if(!e.features[0])return; const p=e.features[0].properties; showPop(e.features[0].geometry.coordinates,'🌋 '+p.name,p.info); });
          ['l9-dams-pt','l9-volc-pt'].forEach(l=>{ GE().events.onLayer('mouseenter',l,()=>{ GE().render.canvas().style.cursor='pointer'; }); GE().events.onLayer('mouseleave',l,()=>{ GE().render.canvas().style.cursor=''; }); });
        }
        return true;
      }catch(e){ return false; }
    }
    /* (#R122) time shown in the Aurora legend — the NOAA OVATION feed carries an Observation + Forecast time */
    let _auroraTime=null, _auroraLegEl=null;
    function _fmtAuroraTime(iso){ try{ const d=new Date(iso); if(!isFinite(d.getTime())) return String(iso);
      const p=n=>String(n).padStart(2,'0'); return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate())+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes())+' UTC'; }catch(_){ return String(iso); } }
    function _auroraSyncNote(){ try{ if(!_auroraLegEl) return; let n=_auroraLegEl.querySelector('.l9-aur-note');
      if(!_auroraTime){ if(n) n.remove(); return; }
      if(!n){ n=document.createElement('div'); n.className='l9-aur-note'; n.style.cssText='font-size:9.5px;color:var(--text-muted);margin-top:5px;line-height:1.4;'; _auroraLegEl.appendChild(n); }
      n.textContent=(window.IntMapLang.t(HOST.lang,'Forecast time: ','予測時刻: ','Vorhersagezeit: ','Время прогноза: ','Hora del pronóstico: '))+_fmtAuroraTime(_auroraTime); }catch(_){} }
    async function loadAurora(){ try{
      const r=await fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'); const j=await r.json();
      try{ const ft=j['Forecast Time']||j['Observation Time']; if(ft){ _auroraTime=ft; _auroraSyncNote(); } }catch(_){}
      const co=j.coordinates||[], feats=[];
      for(let i=0;i<co.length;i+=2){ const c=co[i]; if(!c) continue; const a=c[2]; if(a<8) continue; let lng=c[0]; if(lng>180) lng-=360; feats.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,c[1]]},properties:{a:a}}); }
      if(GE().layers.hasSource('l9-aurora')) GE().layers.setSourceData('l9-aurora',{type:'FeatureCollection',features:feats});
    }catch(e){ try{ imToast(window.IntMapLang.t(HOST.lang,"Aurora forecast unavailable","オーロラ予測を取得できませんでした","Polarlicht-Vorhersage nicht verfügbar","Прогноз полярных сияний недоступен","Previsión de auroras no disponible")); }catch(_){} } }
    const SETS={dams:['l9-dams-pt','l9-dams-lbl'],volcanoes:['l9-volc-pt','l9-volc-lbl'],adiz:['l9-adiz-fill','l9-adiz-line','l9-adiz-lbl'],aurora:['l9-aurora-heat','l9-aurora-glow'],seaice:['l9-seaice']};
    let auroraTimer=null;
    function toggle(which,on){ state[which]=on;
      const apply=()=>{ if(!ensureLayers()){ GE().events.once('idle',apply); return; } setVis(SETS[which],on);
        if(which==='aurora'){ if(on){ loadAurora(); if(!auroraTimer) auroraTimer=setInterval(loadAurora,300000); } else if(auroraTimer){ clearInterval(auroraTimer); auroraTimer=null; } } };
      apply(); }
    GE().events.on('styledata',()=>{ if(state.dams||state.volcanoes||state.adiz||state.aurora){ setTimeout(()=>{ if(ensureLayers()){ Object.keys(SETS).forEach(k=>setVis(SETS[k],state[k])); if(state.aurora) loadAurora(); } },60); } });
    /* (#R38) [JP, EN, DE, RU]; l9Lbl() picks the active language. */
    const L9LBL={dams:LA('Major dams','主要ダム・水インフラ','Große Talsperren','Крупные плотины','Grandes presas'),volcanoes:LA('Active volcanoes','活火山','Aktive Vulkane','Действующие вулканы','Volcanes activos'),aurora:LA('Aurora forecast (NOAA)','オーロラ予測（NOAA）','Polarlicht-Vorhersage (NOAA)','Прогноз полярных сияний (NOAA)','Pronóstico de auroras (NOAA)'),seaice:LA('Sea ice (Arctic/Antarctic)','海氷（北極・南極）','Meereis (Arktis/Antarktis)','Морской лёд (Арктика/Антарктика)','Hielo marino (Ártico/Antártico)'),adiz:LA('Air-defense zones (ADIZ ≈)','防空識別圏 (ADIZ ≈)','Luftverteidigungszonen (ADIZ ≈)','Зоны ПВО (ADIZ ≈)','Zonas de defensa aérea (ADIZ ≈)')};
    const l9Lbl=(k)=>LPK.arr(L9LBL[k]);
    function buildUI(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('l9-dl-dams')) return;
      const head=document.createElement('div'); head.className='lyr-head'; head.setAttribute('data-l9head','1'); head.textContent=window.IntMapLang.t(HOST.lang,"Earth, sky & airspace","地球・大気・空域","Erde, Himmel & Luftraum","Земля, небо и воздушное пространство","Tierra, cielo y espacio aéreo"); dd.appendChild(head);
      function row(id,label,sw){ const w=document.createElement('div'); w.className='lyr-row'; w.innerHTML='<label class="layer-option"><input type="checkbox" id="'+id+'"> <span class="lyr-sw" style="background:'+sw+'"></span> <span id="'+id+'-lbl">'+label+'</span></label>'; dd.appendChild(w); return w.querySelector('input'); }
      /* (#R20) the curated 42-point volcano layer is REMOVED ("現状を削除したうえで新規追加して") —
         replaced by the full Smithsonian GVP Holocene layer (1,215 volcanoes) in the beta module below. */
      [['dams','#34c7ff'],['aurora','#34ffa6']].forEach(([k,sw])=>{ const cb=row('l9-dl-'+k, l9Lbl(k), sw); cb.addEventListener('change',e=>{ e.target.closest('.lyr-row').classList.toggle('on',e.target.checked); toggle(k,e.target.checked);
        /* (#R19) opacity-in-legend for these point/heat layers too */
        try{ if(e.target.checked&&window._registerLayerOpacity){ const _el=window._registerLayerOpacity('l9-'+k,L9LBL[k],SETS[k],'l9-dl-'+k); if(k==='aurora'&&_el){ _auroraLegEl=_el; _auroraSyncNote(); } } else if(window._hideGenericLegend){ window._hideGenericLegend('l9-'+k); if(k==='aurora') _auroraLegEl=null; } }catch(_){} }); });
    }
    if(document.readyState!=='loading') setTimeout(buildUI,0); else document.addEventListener('DOMContentLoaded',buildUI);
    function relabel(){ const h=document.querySelector('[data-l9head]'); if(h) h.textContent=window.IntMapLang.t(HOST.lang,'Earth, sky & airspace','地球・大気・空域','Erde, Himmel & Luftraum','Земля, небо и воздушное пространство','Tierra, cielo y espacio aéreo'); Object.keys(L9LBL).forEach(k=>{ const e=document.getElementById('l9-dl-'+k+'-lbl'); if(e) e.textContent=l9Lbl(k); }); }
    ['lang-jp','lang-en','lang-de','lang-ru','lang-es'].forEach(id=>{ const b=document.getElementById(id); if(b) b.addEventListener('click',()=>setTimeout(relabel,20)); });
    window.addEventListener('intmap-lang',()=>{ setTimeout(relabel,20); setTimeout(_auroraSyncNote,25); });   /* (#R11) relabel on Settings language change; (#R122) re-localize the aurora forecast-time note */
    window.IntMapLayers9={ toggle };
  })();
};

window.IntMapModules.landCover=function(HOST){
  const LPK=window.IntMapLang.pick(()=>HOST.lang);
  /* (#R241) the ARRAY form — see `pickArgs` in js/lang-registry.js. The label table below held
     its translations JP-first and subscripted them with a private `{jp:0,en:1,…}` map: a second
     copy of the language order, naming four languages, invisible to every instrument. */
  const LA=window.IntMapLang.pickArgs();
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const imToast=HOST.imToast, t=HOST.t, isMobile=HOST.isMobile;
  (function(){
    if(!GE().hasRenderer()) return;
    const jp=()=>HOST.lang==='jp';
    const setVis=(ids,on)=>ids.forEach(l=>{ try{ if(GE().layers.has(l)) GE().layers.setLayout(l,'visibility',on?'visible':'none'); }catch(_){} });
    const state={worldcover:false,ecoregions:false,plates:false};
    const PAL=['#e8590c','#1c7ed6','#2f9e44','#9c36b5','#f08c00','#0c8599','#e64980','#5c940d','#3b5bdb','#c2255c','#087f5b','#d9480f','#5f3dc4','#1971c2','#66a80f'];
    /* ---- ESA WorldCover (raster) ---- */
    function ensureRaster(){ if(GE().layers.hasSource('eco-worldcover')) return true; if(!_imCanDraw()) return false;
      /* (#R18) maxzoom 13→14: ESA WorldCover is 10 m/px (≈ native z14), so this keeps the classes crisp one
         zoom deeper instead of upscaling a z13 tile ("画質も高めて"). At normal regional zooms the tile
         count is unchanged (maxzoom only bites when zoomed right in), so it doesn't slow the common case;
         the SW (R17) caches every Terrascope tile so revisits are instant — the controllable speed win on a
         single slow host. */
      try{ GE().layers.addSource('eco-worldcover',{type:'raster',tiles:['https://wmts.terrascope.be/?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=esa-worldcover-map-10m-2021-v2_map&STYLE=default&TILEMATRIXSET=EPSG:3857&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png&TIME=2021-01-01'],tileSize:256,maxzoom:14,attribution:'ESA WorldCover 2021 · Terrascope'});
        /* (#R15 / #19,#29) The Terrascope WMTS is a single slow host (can't multi-host it), so squeeze what
           we can: raster-fade-duration:0 shows each tile the instant it arrives (no 300 ms fade → feels
           faster); raster-resampling:nearest keeps the CATEGORICAL land-cover classes crisp instead of
           blurring class edges (画質); maxzoom 12→13 sharpens deep zoom. */
        GE().layers.add({id:'eco-worldcover',type:'raster',source:'eco-worldcover',layout:{visibility:'none'},paint:{'raster-opacity':1,'raster-fade-duration':0,'raster-resampling':'nearest'}}); return true; }catch(_){ return false; } }   /* (#R40) Land cover default opacity 100% (was 0.85) per request */
    /* ---- Tectonic plates (geojson) ---- */
    let platesLoaded=false, platesLoading=false, platePop=null;
    /* the plate a feature belongs to, by whichever of the source's own fields is present */
    const plateName=(p)=>String((p&&(p.PlateName||p.Name||p.plate||p.Code))||'').trim();
    function ensurePlateLayers(){ if(GE().layers.hasSource('eco-plates')) return true; if(!_imCanDraw()) return false;
      try{ GE().layers.addSource('eco-plates',{type:'geojson',data:{type:'FeatureCollection',features:[]}}); GE().layers.addSource('eco-plates-b',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        GE().layers.add({id:'eco-plates-fill',type:'fill',source:'eco-plates',layout:{visibility:'none'},paint:{'fill-color':['coalesce',['get','_color'],'#e8590c'],'fill-opacity':0.18}});
        GE().layers.add({id:'eco-plates-line',type:'line',source:'eco-plates-b',layout:{visibility:'none'},paint:{'line-color':'#ff5a3c','line-width':1.5,'line-opacity':0.92}});
        /* ══ (#R204) A PLATE NAME IS THE BIGGEST NON-PLACE LABEL THE LADDER ALLOWS ══════════════════
           「プレート境界レイヤーのプレート名のテキストサイズが小さすぎる。」
           It was asking for `sub(0.9)`, i.e. 90 % of the non-place tier — 7.4 px at z1 and 10.2 px from
           z4 — for a label that names a continent-sized object. `sub(1)` is the top of that tier
           (8.3 → 11.4 px), and it is the ceiling rather than a preference: #R198's instruction
           「地名ラベル以外のテキストは地名ラベルよりも小さめに」 is what js/label-scale.js exists to keep
           true, and tests/r198-checks re-derives it, so anything above this would be undoing that
           round to satisfy this one. What is NOT capped is weight and contrast, and that is where the
           rest of the legibility comes from: Bold (the openfreemap glyph server serves the stack —
           checked, 200) with a wider, darker halo reads considerably larger at the same px.
           ⚠ AND THE STACK IS A PLAIN ARRAY. `['literal',['Noto Sans Regular']]` is valid MapLibre and
           was silently wrong under the other renderer: js/cesium-layers.js `fontOf()` takes spec[0] of
           an array, which was the string 'literal', so this layer asked Cesium for a font family
           called "literal". Every other symbol layer in the app writes the plain form. */
        /* ══ (#R205) THE NAME IS NOT TRANSPARENT ════════════════════════════════════════════════════
           「プレート境界レイヤーのプレート名は透過するな」 — two separate transparencies, both measured
           on the running app:

             text-opacity  0.3   ← NOT set here. #R20's 「プレートは30%から」 slider default reaches this
                                   layer through window._applyGenericOpacity, which dims a symbol
                                   layer's text along with the fill it was meant for. The layer now
                                   declares itself in `_opacityOpaqueText` (see js/data-layers.js), so
                                   the slider still governs the polygon and the line and the NAME
                                   stays at 1 — including when the user drags the slider afterwards.
             halo          0.85   ← the outline the glyph stands on let the map through by 15 %, so the
                                   coastline under a name showed inside its own outline.

           `text-opacity` is stated here as well, so the layer is opaque from the first frame rather
           than only after the opacity registry has run. */
        GE().layers.add({id:'eco-plates-lbl',type:'symbol',source:'eco-plates',minzoom:2,layout:{visibility:'none','symbol-placement':'point','text-field':['coalesce',['get','PlateName'],['get','Name'],['get','Code'],''],'text-size':window.IntMapLabelScale.sub(1),'text-font':['Noto Sans Bold'],'text-letter-spacing':0.06,'text-padding':3},paint:{'text-color':'#ffe2d8','text-halo-color':'rgba(0,0,0,1)','text-halo-width':2,'text-opacity':1}});
        try{ (window._opacityOpaqueText=window._opacityOpaqueText||{})['eco-plates-lbl']=true; }catch(_){}
        /* ⚠ …AND IT IS CLICKABLE, WHICH THE LABEL ALONE IS NOT ENOUGH FOR. 「また、クリック可能に。」
           A symbol layer answers a click only where a glyph actually is; the plate is the whole
           polygon, so both layers are wired and the popup is the same one either way. */
        ['eco-plates-lbl','eco-plates-fill'].forEach(id=>{
          try{
            GE().events.onLayer('click',id,(e)=>{ const f=e.features&&e.features[0]; if(!f) return; platePopup(e.lngLat,f.properties||{}); });
            GE().events.onLayer('mouseenter',id,()=>{ try{ GE().render.canvas().style.cursor='pointer'; }catch(_){} });
            GE().events.onLayer('mouseleave',id,()=>{ try{ GE().render.canvas().style.cursor=''; }catch(_){} });
          }catch(_){}
        });
        /* (#R204) …and whatever has already been fetched goes in NOW — see the ⚠ in loadPlates */
        installPlates();
        return true; }catch(_){ return false; } }
    /* What the click says. Only what the source actually carries — the PB2002 plate name and its
       code — plus the boundary types that touch it, counted from the boundary file that is already
       loaded. No invented tectonics (標準指示 4). */
    function platePopup(lngLat,p){
      const nm=plateName(p)||(window.IntMapLang.t(HOST.lang,"(unnamed)","（名称なし）","(ohne Namen)","(без названия)","(sin nombre)"));
      const code=String(p.Code||p.code||'').trim();
      /* ⚠ `IntMapSafe.html` — the project's ONE sanitizer (#R138). The first draft of this line called
         an `escapeHtml` that does not exist on it: it threw, the catch returned '', and the popup
         opened with an empty name and an empty code under a heading that was still there. Measured on
         the first click. There is no `escapeHtml` anywhere in js/ except that mistake. */
      const esc=(s)=>{ try{ return window.IntMapSafe?window.IntMapSafe.html(String(s)):String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
        catch(_){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); } };
      const L=window.IntMapLang.pick(()=>HOST.lang);
      let html='<div style="font-weight:700;font-size:13px;color:var(--text-main);">'+esc(nm)+'</div>';
      if(code) html+='<div style="font-size:11.5px;color:var(--text-muted);margin-top:1px;">'+L('Plate code','プレートコード','Plattencode','Код плиты','Código de placa')+': <b style="color:var(--text-main);">'+esc(code)+'</b></div>';
      html+='<div style="font-size:11px;color:var(--text-muted);margin-top:5px;">'+L('Bird (2002) plate model','Bird (2002) プレートモデル','Plattenmodell nach Bird (2002)','Модель плит Bird (2002)','Modelo de placas de Bird (2002)')+'</div>';
      try{ if(platePop) platePop.remove(); }catch(_){}
      try{ platePop=GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,className:'plc-popup',maxWidth:'250px'}).setLngLat(lngLat).setHTML(html)); }catch(_){}
    }
    /* ══ (#R204) THE PLATES ARRIVED AND WERE THROWN AWAY, ONE RUN IN THREE ═════════════════════════
       Measured while wiring the click below: three identical loads of the built site, toggling the
       layer the same way, both fetches answering 200 every time — and one of the three ended with
       `querySourceFeatures('eco-plates') === 0` and the layer invisible. The map showed no plates and
       nothing anywhere said why.

       The cause is in these eight lines. `setSourceData` was guarded on `hasSource(…)`, and if the
       promise resolved before `ensurePlateLayers()` had created the source — which is a race between
       one network fetch and one `styledata` event — the guard was false, the parsed GeoJSON was
       DROPPED, and `platesLoaded = true` was set anyway. Every later call then short-circuited on
       that flag and returned "already loaded" for data that had never been installed. The state was
       permanent for the session: the only way back was a reload.

       So the fetched collections are KEPT (`plateGJ`), installing them is its own idempotent step,
       and `platesLoaded` means "the bytes are here" rather than "the map has them". `ensurePlateLayers`
       installs whatever is already in hand the moment it builds the source, which also closes the
       other half of the same race — the style being rebuilt under a layer that was already on. */
    let plateGJ=null, plateBD=null;
    function installPlates(){
      let ok=false;
      try{ if(plateGJ && GE().layers.hasSource('eco-plates')){ GE().layers.setSourceData('eco-plates',plateGJ); ok=true; } }catch(_){}
      try{ if(plateBD && GE().layers.hasSource('eco-plates-b')) GE().layers.setSourceData('eco-plates-b',plateBD); }catch(_){}
      return ok;
    }
    function loadPlates(cb){
      if(platesLoaded){ installPlates(); cb(true); return; }
      if(platesLoading){ cb(false); return; }
      platesLoading=true;
      Promise.all([
        fetch('https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_plates.json').then(r=>r.json()),
        fetch('https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json').then(r=>r.json()).catch(()=>null)
      ]).then(([pl,bd])=>{ try{ (pl.features||[]).forEach((f,i)=>{ f.properties=f.properties||{}; f.properties._color=PAL[i%PAL.length]; }); }catch(_){}
        plateGJ=pl; plateBD=bd||null;
        platesLoaded=true; platesLoading=false;
        installPlates();
        /* ⚠ AND THE VISIBILITY IS ASSERTED FROM `state`, NOT LEFT TO THE CALLBACK. `loadPlates` has
           several callers (the toggle, the styledata re-assert) and only one of them passes a
           callback that shows the layer; whichever call happens to be the one that owns the fetch is
           then the one that decides whether anything is drawn. Reading the state the user set is the
           same fact from the one place that always knows it. */
        try{ if(state.plates) setVis(SETS.plates,true); }catch(_){}
        cb(true);
      }).catch(()=>{ platesLoading=false; try{ imToast(window.IntMapLang.t(HOST.lang,"Could not load plate data","プレートデータを取得できませんでした","Plattendaten konnten nicht geladen werden","Не удалось загрузить данные о плитах","No se pudieron cargar los datos de placas")); }catch(_){} cb(false); }); }
    /* ---- Ecoregions (PMTiles vector) ---- */
    let pmReady=false, pmLoading=false; const pmQ=[];
    function loadPMTiles(cb){ if(pmReady){ cb(true); return; } pmQ.push(cb); if(pmLoading) return; pmLoading=true;
      const s=document.createElement('script'); s.src='https://unpkg.com/pmtiles@3.0.6/dist/pmtiles.js';
      s.onload=()=>{ try{ if(typeof pmtiles!=='undefined'){ const proto=new pmtiles.Protocol(); GE().scene.addProtocol('pmtiles', proto.tile); pmReady=true; } }catch(_){} pmLoading=false; pmQ.splice(0).forEach(fn=>fn(pmReady)); };
      s.onerror=()=>{ pmLoading=false; pmQ.splice(0).forEach(fn=>fn(false)); };
      document.head.appendChild(s); }
    let ecoBuilt=false;
    /* (#R13) The protomaps `resolved_ecoregions_2017.pmtiles` sample was REMOVED from r2-public
       (404 — that's why Ecoregions "wouldn't add"). Switched to a self-hosted, simplified copy of the
       authoritative RESOLVE/WWF Ecoregions 2017 (ArcGIS FeatureServer → data/ecoregions_2017.geojson,
       846 ecoregions, per-feature COLOR), lazy-loaded as a normal GeoJSON source — no external
       dependency, no dead URL, no plugin needed. */
    function ecoBefore(){ try{ for(const l of (GE().scene.getStyle().layers||[])){ if(l.type==='symbol') return l.id; } }catch(_){} return undefined; }
    /* (#R13b) The public site is opened from `file://`, where `fetch()` of a LOCAL file is blocked by
       Chrome (only http/https/data). So the ecoregions GeoJSON is shipped as a JS global
       (`data/ecoregions_2017.js` → window.__ECOREGIONS_2017) and loaded with a <script> tag, which works
       under file:// AND http. Falls back to fetch() of the .geojson when served over http. Exposed as
       window.__loadEcoregions so the Compare window can reuse it. */
    window.__loadEcoregions=function(cb){
      if(window.__ECOREGIONS_2017){ cb(window.__ECOREGIONS_2017); return; }
      if(window.__ecoQ){ window.__ecoQ.push(cb); return; }
      window.__ecoQ=[cb];
      const done=(d)=>{ if(d) window.__ECOREGIONS_2017=d; const q=window.__ecoQ||[]; window.__ecoQ=null; q.forEach(f=>{ try{ f(window.__ECOREGIONS_2017||null); }catch(_){} }); };
      const s=document.createElement('script'); s.src='data/ecoregions_2017.js';
      s.onload=()=>done(window.__ECOREGIONS_2017||null);
      s.onerror=()=>{ fetch('data/ecoregions_2017.geojson').then(r=>r.ok?r.json():Promise.reject(new Error('HTTP '+r.status))).then(gj=>done(gj)).catch(()=>done(null)); };
      document.head.appendChild(s);
    };
    function ensureEco(cb){ if(GE().layers.hasSource('eco-regions')){ cb(true); return; }
      window.__loadEcoregions(gj=>{ if(!gj){ try{ imToast(window.IntMapLang.t(HOST.lang,"Could not load ecoregions","生態地域データを読み込めませんでした","Ökoregionen konnten nicht geladen werden","Не удалось загрузить экорегионы","No se pudieron cargar las ecorregiones")); }catch(_){} cb(false); return; } addEcoLayers(gj); cb(true); }); }
    function addEcoLayers(gj){ window._ecoGJ=gj; if(ecoBuilt||GE().layers.hasSource('eco-regions')) return; ecoBuilt=true;
      try{ const before=ecoBefore();
        GE().layers.addSource('eco-regions',{type:'geojson',data:gj,attribution:'RESOLVE/WWF Ecoregions 2017'});
        GE().layers.add({id:'eco-regions-fill',type:'fill',source:'eco-regions',layout:{visibility:'visible'},paint:{'fill-color':['coalesce',['to-color',['get','COLOR']],'#4caf50'],'fill-opacity':0.55}},before);
        GE().layers.add({id:'eco-regions-line',type:'line',source:'eco-regions',layout:{visibility:'visible'},paint:{'line-color':'rgba(0,0,0,0.22)','line-width':0.4}},before);
        /* (#R13c) self-theme the popup (.plc-popup → var(--popup-bg)/var(--text-main)) so it stays
           readable in DARK mode — the default white-popup text was invisible on the dark UI. */
        if(!window._ecoPop) window._ecoPop=GE().ui.popup({closeButton:true,maxWidth:'240px',className:'plc-popup'});
        GE().events.onLayer('mouseenter','eco-regions-fill',()=>{ GE().render.canvas().style.cursor='pointer'; });
        GE().events.onLayer('mouseleave','eco-regions-fill',()=>{ GE().render.canvas().style.cursor=''; });
        GE().events.onLayer('click','eco-regions-fill',(e)=>{ const f=e.features&&e.features[0]; if(!f) return; const p=f.properties||{};
          const html='<div style="font-size:12px;line-height:1.5;"><b>'+(p.ECO_NAME||'')+'</b><br>'+(window.IntMapLang.t(HOST.lang,"Biome: ","バイオーム: ","Biom: ","Биом: ","Bioma: "))+(p.BIOME_NAME||'—')+'</div>';
          GE().ui.attach(window._ecoPop.setLngLat(e.lngLat).setHTML(html)); });
      }catch(e){ try{ console.warn('ecoregions add failed',e); }catch(_){} } }
    const SETS={worldcover:['eco-worldcover'],plates:['eco-plates-fill','eco-plates-line','eco-plates-lbl'],ecoregions:['eco-regions-fill','eco-regions-line']};
    /* (#R13c) Land-cover legend — the official ESA WorldCover 2021 11-class palette + labels (EN/JP).
       Draggable + minimisable like every other legend; the ✕ unchecks the layer. */
    const WC_CLASSES=[['#006400','Tree cover','樹木'],['#ffbb22','Shrubland','低木地'],['#ffff4c','Grassland','草地'],
      ['#f096ff','Cropland','農地'],['#fa0000','Built-up','市街地'],['#b4b4b4','Bare / sparse vegetation','裸地・希少植生'],
      ['#f0f0f0','Snow and ice','雪氷'],['#0064c8','Permanent water bodies','水域'],['#0096a0','Herbaceous wetland','湿地（草本）'],
      ['#00cf75','Mangroves','マングローブ'],['#fae6a0','Moss and lichen','苔・地衣類']];
    function wcLegend(show){
      let lg=document.getElementById('data-legend-worldcover');
      if(show){
        if(!lg){ lg=document.createElement('div'); lg.className='data-legend'; lg.id='data-legend-worldcover'; lg.style.bottom='140px';
          (document.getElementById('map-container')||document.body).appendChild(lg); }
        const dragT=window.IntMapLang.t(HOST.lang,"Drag to move","ドラッグして移動","Zum Verschieben ziehen","Потяните, чтобы переместить","Arrastre para mover");
        lg.innerHTML='<span class="dl-drag" title="'+dragT+'">⋮⋮</span><button class="layer-popup-x" title="'+(t('close'))+'">✕</button>'+
          '<h4>'+(window.IntMapLang.t(HOST.lang,"Land cover (ESA 2021)","土地被覆 (ESA 2021)","Landbedeckung (ESA 2021)","Земной покров (ESA 2021)","Cobertura del suelo (ESA 2021)"))+'</h4>'+
          '<div style="display:flex;flex-direction:column;gap:3px;margin-top:4px;">'+
          WC_CLASSES.map(([c,en,ja])=>'<div style="display:flex;align-items:center;gap:7px;"><span style="width:13px;height:13px;border-radius:3px;flex:none;border:1px solid rgba(128,128,128,0.4);background:'+c+';"></span><span>'+(jp()?ja:en)+'</span></div>').join('')+
          '</div>';
        lg.style.display='block';
        lg.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('eco-dl-worldcover'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
        try{ window._wireLegendDrag&&window._wireLegendDrag(lg); window._ensureLegendMinimize&&window._ensureLegendMinimize(lg); }catch(_){}
      } else if(lg){ lg.style.display='none'; }
    }
    /* ══ (#R204) `once('idle')` IS NOT A RETRY — IT IS A COIN TOSS ═════════════════════════════════
       MEASURED: four identical loads of the built site, each ticking the Tectonic-plates box the same
       way at the same moment; two came up with the layer drawn and two with NOTHING — no plates, no
       labels, no error, `querySourceFeatures` zero — and the failure was permanent for the session.
       Both of these branches said "if the renderer will not take a layer yet, wait for the next
       `idle`". A map that has already settled does not necessarily emit another one, so on the runs
       where the box was ticked into a quiet map the retry never happened at all. It is #R170's own
       finding one level up (`isStyleLoaded()` is not "may I add layers") and #R41's remedy is the one
       used everywhere else in this file — POLL, with a bounded number of tries, and keep the idle as
       the last resort rather than the only one. js/layer-packs.js's own time-zone module has done
       exactly this since #R79c; these two were the copies that never got it. */
    function retry(fn){ let n=0; const a=()=>{ if(fn()) return; if(n++<60) setTimeout(a,150); else { try{ GE().events.once('idle',a); }catch(_){} } }; a(); }
    function toggle(which,on){ state[which]=on;
      if(which==='worldcover'){ retry(()=>{ if(!ensureRaster()) return false; setVis(SETS.worldcover,on); return true; }); wcLegend(on); }
      else if(which==='plates'){ retry(()=>{ if(!ensurePlateLayers()) return false; if(on){ loadPlates(()=>setVis(SETS.plates,true)); } else setVis(SETS.plates,false); return true; }); }
      else if(which==='ecoregions'){ if(on){ ensureEco(ok=>{ if(ok) setVis(SETS.ecoregions,true); }); } else { setVis(SETS.ecoregions,false);
        /* (#R20) phones: toggling OFF releases the ~10 MB parsed GeoJSON + the source copy (OOM
           pressure); it lazily re-fetches/re-parses on the next toggle. Desktop keeps the warm cache. */
        if(typeof isMobile==='function'&&isMobile()){ try{ SETS.ecoregions.forEach(l=>{ if(GE().layers.has(l)) GE().layers.remove(l); }); if(GE().layers.hasSource('eco-regions')) GE().layers.removeSource('eco-regions'); }catch(_){} ecoBuilt=false; window._ecoGJ=null; window.__ECOREGIONS_2017=null; }
      } }
      /* (#R19) opacity slider for these too — worldcover reuses its own class legend, the rest get a generic one */
      try{ const nm=[ECLBL[which][1],ECLBL[which][0],ECLBL[which][2],ECLBL[which][3]];
        if(on&&window._registerLayerOpacity) window._registerLayerOpacity(which==='worldcover'?'worldcover':'eco-'+which, nm, SETS[which], 'eco-dl-'+which);
        else if(!on&&window._hideGenericLegend&&which!=='worldcover') window._hideGenericLegend('eco-'+which);
      }catch(_){}
    }
    GE().events.on('styledata',()=>{ if(state.worldcover||state.plates||state.ecoregions){ setTimeout(()=>{ if(ensureRaster()&&ensurePlateLayers()){ setVis(SETS.worldcover,state.worldcover); setVis(SETS.plates,state.plates); if(state.plates) loadPlates(()=>{}); } if(state.ecoregions){ if(!GE().layers.hasSource('eco-regions')&&window._ecoGJ){ ecoBuilt=false; addEcoLayers(window._ecoGJ); } setVis(SETS.ecoregions,true); } },60); } });
    /* (#R38) [JP, EN, DE, RU]; ecoLbl() picks the active language. */
    const ECLBL={worldcover:LA('Land cover (ESA 2021)','土地被覆 (ESA 2021)','Bodenbedeckung (ESA 2021)','Земной покров (ESA 2021)','Cobertura del suelo (ESA 2021)'),ecoregions:LA('Ecoregions (WWF/RESOLVE)','生態地域 (WWF/RESOLVE)','Ökoregionen (WWF/RESOLVE)','Экорегионы (WWF/RESOLVE)','Ecorregiones (WWF/RESOLVE)'),plates:LA('Tectonic plates','プレート境界','Tektonische Platten','Тектонические плиты','Placas tectónicas')};
    const ecoLbl=(k)=>LPK.arr(ECLBL[k]);
    function buildUI(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('eco-dl-worldcover')) return;
      const head=document.createElement('div'); head.className='lyr-head'; head.setAttribute('data-ecohead','1'); head.textContent=window.IntMapLang.t(HOST.lang,"Land cover & earth science","土地被覆・地球科学","Landbedeckung & Geowissenschaft","Земной покров и науки о Земле","Cobertura del suelo y ciencias de la Tierra"); dd.appendChild(head);
      function row(id,label,sw){ const w=document.createElement('div'); w.className='lyr-row'; w.innerHTML='<label class="layer-option"><input type="checkbox" id="'+id+'"> <span class="lyr-sw" style="background:'+sw+'"></span> <span id="'+id+'-lbl">'+label+'</span></label>'; dd.appendChild(w); return w.querySelector('input'); }
      [['worldcover','#4caf50'],['ecoregions','#2f9e44'],['plates','#e8590c']].forEach(([k,sw])=>{ const cb=row('eco-dl-'+k, ecoLbl(k), sw); cb.addEventListener('change',e=>{ e.target.closest('.lyr-row').classList.toggle('on',e.target.checked); toggle(k,e.target.checked); }); });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){}
    }
    if(document.readyState!=='loading') setTimeout(buildUI,0); else document.addEventListener('DOMContentLoaded',buildUI);
    function relabel(){ const h=document.querySelector('[data-ecohead]'); if(h) h.textContent=window.IntMapLang.t(HOST.lang,'Land cover & earth science','土地被覆・地球科学','Bodenbedeckung & Geowissenschaft','Земной покров и науки о Земле','Cobertura del suelo y ciencias de la Tierra'); Object.keys(ECLBL).forEach(k=>{ const e=document.getElementById('eco-dl-'+k+'-lbl'); if(e) e.textContent=ecoLbl(k); }); }
    ['lang-jp','lang-en','lang-de','lang-ru','lang-es'].forEach(id=>{ const b=document.getElementById(id); if(b) b.addEventListener('click',()=>setTimeout(relabel,20)); });
    window.addEventListener('intmap-lang',()=>setTimeout(relabel,20));   /* (#R11) header lang toggle is hidden → relabel on Settings change */
    window.IntMapEco={ toggle };
  })();
};

window.IntMapModules.betaPack2=function(HOST){
  const LPK=window.IntMapLang.pick(()=>HOST.lang);
  /* (#R241) the ARRAY form — see `pickArgs` in js/lang-registry.js. The label table below held
     its translations JP-first and subscripted them with a private `{jp:0,en:1,…}` map: a second
     copy of the language order, naming four languages, invisible to every instrument. */
  const LA=window.IntMapLang.pickArgs();
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const imToast=HOST.imToast, isMobile=HOST.isMobile, loadCountryData=HOST.loadCountryData, countryStats=HOST.countryStats;
  (function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return;
    const jp=()=>HOST.lang==='jp';
    const setVis=(ids,on)=>ids.forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',on?'visible':'none'); }catch(_){} });
    const before=()=>GE().layers.has('tool-poly')?'tool-poly':undefined;
    const state={rail:false,dc:false,pharma:false,cpi:false,lifeexp:false,spin:false};
    const cache={};
    let pop2=null;
    const esc=(s)=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    /* ---------- curated datasets (city-level coordinates) ---------- */
    const DC_COL={aws:'#ff9900',azure:'#0078d4',gcp:'#34a853',ai:'#af52de'};
    const DC=[
      [-77.49,39.04,'AWS us-east-1 · N. Virginia (Ashburn)','aws'],[-83.0,40.0,'AWS us-east-2 · Ohio','aws'],[-121.9,37.35,'AWS us-west-1 · N. California','aws'],[-119.7,45.84,'AWS us-west-2 · Oregon (Boardman)','aws'],[-73.57,45.5,'AWS ca-central-1 · Montréal','aws'],[-114.07,51.05,'AWS ca-west-1 · Calgary','aws'],[-46.63,-23.55,'AWS sa-east-1 · São Paulo','aws'],[-6.26,53.35,'AWS eu-west-1 · Dublin','aws'],[-0.1,51.5,'AWS eu-west-2 · London','aws'],[2.35,48.86,'AWS eu-west-3 · Paris','aws'],[8.68,50.11,'AWS eu-central-1 · Frankfurt','aws'],[8.54,47.37,'AWS eu-central-2 · Zürich','aws'],[18.07,59.33,'AWS eu-north-1 · Stockholm','aws'],[9.19,45.46,'AWS eu-south-1 · Milan','aws'],[-0.88,41.65,'AWS eu-south-2 · Spain (Aragón)','aws'],[50.58,26.23,'AWS me-south-1 · Bahrain','aws'],[54.37,24.45,'AWS me-central-1 · UAE','aws'],[34.78,32.08,'AWS il-central-1 · Tel Aviv','aws'],[18.42,-33.93,'AWS af-south-1 · Cape Town','aws'],[72.88,19.08,'AWS ap-south-1 · Mumbai','aws'],[78.49,17.38,'AWS ap-south-2 · Hyderabad','aws'],[103.85,1.29,'AWS ap-southeast-1 · Singapore','aws'],[151.21,-33.87,'AWS ap-southeast-2 · Sydney','aws'],[106.85,-6.21,'AWS ap-southeast-3 · Jakarta','aws'],[144.96,-37.81,'AWS ap-southeast-4 · Melbourne','aws'],[139.76,35.68,'AWS ap-northeast-1 · Tokyo','aws'],[126.98,37.57,'AWS ap-northeast-2 · Seoul','aws'],[135.5,34.69,'AWS ap-northeast-3 · Osaka','aws'],[114.17,22.32,'AWS ap-east-1 · Hong Kong','aws'],[116.4,39.9,'AWS cn-north-1 · Beijing','aws'],[106.27,38.47,'AWS cn-northwest-1 · Ningxia','aws'],
      [-93.6,41.6,'Azure Central US · Iowa','azure'],[-119.85,47.23,'Azure West US 2 · Washington (Quincy)','azure'],[-98.49,29.42,'Azure South Central US · Texas','azure'],[-112.07,33.45,'Azure West US 3 · Arizona','azure'],[4.9,52.37,'Azure West Europe · Amsterdam','azure'],[17.14,60.67,'Azure Sweden Central · Gävle','azure'],[10.75,59.91,'Azure Norway East · Oslo','azure'],[21.01,52.23,'Azure Poland Central · Warsaw','azure'],[-3.7,40.42,'Azure Spain Central · Madrid','azure'],[55.27,25.2,'Azure UAE North · Dubai','azure'],[51.53,25.29,'Azure Qatar Central · Doha','azure'],[28.05,-26.2,'Azure South Africa North · Johannesburg','azure'],[73.86,18.52,'Azure Central India · Pune','azure'],[80.27,13.08,'Azure South India · Chennai','azure'],[129.07,35.18,'Azure Korea South · Busan','azure'],[149.13,-35.28,'Azure Australia Central · Canberra','azure'],[-100.39,20.59,'Azure Mexico Central · Querétaro','azure'],[121.47,31.23,'Azure China East · Shanghai','azure'],
      [-95.86,41.26,'Google Cloud · Council Bluffs, Iowa','gcp'],[-121.18,45.59,'Google Cloud · The Dalles, Oregon','gcp'],[-81.54,35.91,'Google Cloud · Lenoir, N. Carolina','gcp'],[-80.06,33.06,'Google Cloud · Berkeley County, S. Carolina','gcp'],[-95.31,36.3,'Google Cloud · Pryor, Oklahoma','gcp'],[-115.0,36.04,'Google Cloud · Henderson, Nevada','gcp'],[-79.38,43.65,'Google Cloud · Toronto','gcp'],[-70.67,-33.45,'Google Cloud · Santiago','gcp'],[3.82,50.45,'Google Cloud · St-Ghislain, Belgium','gcp'],[27.2,60.57,'Google Cloud · Hamina, Finland','gcp'],[6.83,53.43,'Google Cloud · Eemshaven, Netherlands','gcp'],[50.1,26.43,'Google Cloud · Dammam, Saudi Arabia','gcp'],[77.1,28.7,'Google Cloud · Delhi NCR','gcp'],[120.43,24.08,'Google Cloud · Changhua, Taiwan','gcp'],
      [-90.05,35.15,'xAI Colossus · Memphis, Tennessee','ai'],[-99.73,32.45,'Stargate (OpenAI/Oracle) · Abilene, Texas','ai'],[-120.8,44.3,'Meta · Prineville, Oregon','ai'],[-91.79,32.35,'Meta AI DC · Richland Parish, Louisiana','ai'],[-97.74,30.27,'Tesla Cortex · Austin, Texas','ai'],[-96.7,33.02,'CoreWeave · Plano, Texas','ai'],[-93.62,41.59,'Microsoft AI · West Des Moines, Iowa','ai'],[5.47,59.3,'AI DC cluster · Norway (hydro-powered)','ai']
    ];
    const PH=[
      [7.59,47.56,'Basel — Novartis / Roche HQ & plants'],[6.99,51.03,'Leverkusen — Bayer'],[8.06,49.97,'Ingelheim — Boehringer Ingelheim'],[12.45,55.76,'Copenhagen — Novo Nordisk'],[11.09,55.68,'Kalundborg — Novo Nordisk API site'],[-0.31,51.48,'London/Brentford — GSK'],[0.13,52.2,'Cambridge — AstraZeneca'],[2.35,48.86,'Paris — Sanofi'],[-86.16,39.77,'Indianapolis — Eli Lilly'],[-74.45,40.49,'New Brunswick — Johnson & Johnson'],[-73.97,40.75,'New York — Pfizer HQ'],[-74.29,40.68,'Rahway/Kenilworth — Merck & Co.'],[-87.86,42.33,'North Chicago — AbbVie'],[-118.84,34.18,'Thousand Oaks — Amgen'],[-122.4,37.65,'South San Francisco — Genentech'],[-8.47,51.9,'Cork — Irish pharma cluster'],[103.64,1.32,'Singapore Tuas — biologics plants'],[78.6,17.6,'Hyderabad — Genome Valley (vaccines)'],[72.88,19.08,'Mumbai — Sun Pharma'],[72.57,23.02,'Ahmedabad — Zydus / Torrent'],[83.3,17.69,'Visakhapatnam — API hub'],[-66.54,18.45,'Barceloneta — Puerto Rico pharma'],[139.76,35.68,'Tokyo — Takeda / Astellas'],[135.5,34.69,'Osaka — Shionogi / Takeda'],[116.4,39.9,'Beijing — Sinopharm'],[121.47,31.23,'Shanghai — Fosun Pharma'],[126.64,37.39,'Songdo — Samsung Biologics'],[34.89,32.09,'Petah Tikva — Teva'],[-46.63,-23.55,'São Paulo — EMS / Eurofarma'],[28.05,-26.2,'Johannesburg — Aspen Pharmacare']
    ];
    const RAIL_COL={1435:'#3a7bd5',1520:'#e03131',1067:'#2f9e44',1000:'#12b886',1676:'#9c36b5',1668:'#f08c00',1600:'#d6336c',0:'#868e96'};
    const RAIL_LBL=[[1435,'標準軌 1435mm','Standard 1435 mm'],[1520,'ロシア軌間 1520/1524mm','Russian 1520/1524 mm'],[1676,'広軌 1676mm（印・亜）','Broad 1676 mm (India, Argentina)'],[1668,'イベリア軌間 1668mm','Iberian 1668 mm'],[1600,'アイルランド軌間 1600mm','Irish 1600 mm'],[1067,'狭軌 1067mm（日本など）','Cape 1067 mm (Japan etc.)'],[1000,'メーターゲージ 1000mm','Meter 1000 mm'],[0,'不明・その他','Unknown / other']];
    function fcPoints(arr,colFn){ return {type:'FeatureCollection',features:arr.map(d=>({type:'Feature',geometry:{type:'Point',coordinates:[d[0],d[1]]},properties:{n:d[2],k:d[3]||'',col:colFn(d)}}))}; }
    function load(key,cb){
      if(cache[key]){ cb(cache[key]); return; }
      if(key==='dc'){ cache.dc=fcPoints(DC,d=>DC_COL[d[3]]||'#5e8bff'); cb(cache.dc); }
      else if(key==='pharma'){ cache.pharma=fcPoints(PH,()=> '#2bb3a3'); cb(cache.pharma); }
      else if(key==='rail'){ fetch('data/railways_gauge.json').then(r=>r.json()).then(j=>{ if(!j||!Array.isArray(j.features)) return;
        j.features.forEach(f=>{ f.properties.col=RAIL_COL[f.properties.g]||RAIL_COL[0]; }); cache.rail=j; cb(j); }).catch(()=>{ try{ imToast(window.IntMapLang.t(HOST.lang,"Could not load railway data","鉄道データを読み込めませんでした","Eisenbahndaten konnten nicht geladen werden","Не удалось загрузить данные о железных дорогах","No se pudieron cargar los datos ferroviarios")); }catch(_){} }); }
    }
    function clickPop(layerId){
      GE().events.onLayer('click',layerId,e=>{ const f=e.features&&e.features[0]; if(!f) return; const p=f.properties||{};
        try{ if(pop2) pop2.remove(); }catch(_){}
        const kind=p.k?('<div style="font-size:11px;color:var(--text-muted);margin-top:2px;text-transform:uppercase;">'+esc(p.k)+'</div>'):'';
        try{ pop2=GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,className:'plc-popup',maxWidth:'280px'}).setLngLat(f.geometry.coordinates).setHTML('<div style="min-width:150px;font-weight:600;font-size:13px;color:var(--text-main);">'+esc(p.n)+'</div>'+kind)); }catch(_){}
      });
      GE().events.onLayer('mouseenter',layerId,()=>{ GE().render.canvas().style.cursor='pointer'; });
      GE().events.onLayer('mouseleave',layerId,()=>{ GE().render.canvas().style.cursor=''; });
    }
    /* ---------- point/line layer toggles ---------- */
    function ptEnsure(key,src,ids){ if(GE().layers.hasSource(src)) return true; if(!_imCanDraw()) return false;
      try{
        GE().layers.addSource(src,{type:'geojson',data:cache[key]||{type:'FeatureCollection',features:[]}});
        GE().layers.add({id:ids[0],type:'circle',source:src,layout:{visibility:'none'},paint:{
          'circle-radius':['interpolate',['linear'],['zoom'],1,2.6,5,4.6,9,7.5],
          'circle-color':['coalesce',['get','col'],'#5e8bff'],'circle-stroke-color':'#ffffff','circle-stroke-width':0.9,'circle-opacity':0.92}},before());
        GE().layers.add({id:ids[1],type:'symbol',source:src,minzoom:4.5,layout:{visibility:'none','text-field':['get','n'],'text-size':window.IntMapLabelScale.sub(0.82),'text-offset':[0,1.0],'text-anchor':'top','text-font':['literal',['Noto Sans Regular']],'text-max-width':16},paint:{'text-color':'#dce6f5','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.2}},before());
        clickPop(ids[0]);
        return true;
      }catch(_){ return false; } }
    function dcToggle(on){ state.dc=on;
      const a=()=>{ if(!ptEnsure('dc','dc-src',['dc-pt','dc-lbl'])){ GE().events.once('idle',a); return; }
        load('dc',fc=>{ try{ GE().layers.setSourceData('dc-src',fc); }catch(_){} }); setVis(['dc-pt','dc-lbl'],on); };
      a();
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity('dc2',['Data centers & AI infra','データセンター・AIインフラ'],['dc-pt','dc-lbl'],'beta-dl-dc');
            if(el&&!el.querySelector('.dc-key')){ const k=document.createElement('div'); k.className='dc-key'; k.style.cssText='display:flex;flex-direction:column;gap:4px;margin-top:6px;font-size:11px;color:var(--text-main);';
              k.innerHTML=[['aws','AWS'],['azure','Azure'],['gcp','Google Cloud'],['ai',window.IntMapLang.t(HOST.lang,"AI superclusters","AIスーパークラスター","KI-Supercluster","ИИ-суперкластеры","Superclústeres de IA")]].map(([t,l])=>'<div style="display:flex;align-items:center;gap:7px;"><span style="width:11px;height:11px;border-radius:6px;flex:none;background:'+DC_COL[t]+';"></span>'+l+'</div>').join('');
              el.appendChild(k); } }
           else if(window._hideGenericLegend) window._hideGenericLegend('dc2'); }catch(_){}
    }
    function phToggle(on){ state.pharma=on;
      const a=()=>{ if(!ptEnsure('pharma','ph-src',['ph-pt','ph-lbl'])){ GE().events.once('idle',a); return; }
        load('pharma',fc=>{ try{ GE().layers.setSourceData('ph-src',fc); }catch(_){} }); setVis(['ph-pt','ph-lbl'],on); };
      a();
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity('ph2',['Pharma manufacturing hubs','製薬・医薬品製造拠点'],['ph-pt','ph-lbl'],'beta-dl-pharma');
            if(el&&!el.querySelector('.ph-note')){ const d=document.createElement('div'); d.className='ph-note'; d.style.cssText='font-size:10px;color:var(--text-muted);margin-top:5px;'; d.textContent=window.IntMapLang.t(HOST.lang,"Major pharma HQ / manufacturing clusters (representative sites). Pairs with the Life-expectancy layer.","主要な製薬企業の本社・製造クラスター（代表地点）。平均寿命レイヤーと併用を。","Zentralen und Produktionscluster großer Pharmaunternehmen (repräsentative Standorte). Passt zur Ebene Lebenserwartung.","Штаб-квартиры и производственные кластеры крупных фармкомпаний (репрезентативные точки). Хорошо сочетается со слоем ожидаемой продолжительности жизни.","Sedes y clústeres de fabricación de las grandes farmacéuticas (puntos representativos). Combina con la capa de esperanza de vida."); el.appendChild(d); } }
           else if(window._hideGenericLegend) window._hideGenericLegend('ph2'); }catch(_){}
    }
    function railEnsure(){ if(GE().layers.hasSource('rail-src')) return true; if(!_imCanDraw()) return false;
      try{
        GE().layers.addSource('rail-src',{type:'geojson',data:cache.rail||{type:'FeatureCollection',features:[]},attribution:'Natural Earth'});
        GE().layers.add({id:'rail-ln',type:'line',source:'rail-src',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','col'],'#868e96'],'line-width':['interpolate',['linear'],['zoom'],2,0.7,6,1.5,10,2.6],'line-opacity':0.9}},before());
        return true;
      }catch(_){ return false; } }
    function railToggle(on){ state.rail=on;
      const a=()=>{ if(!railEnsure()){ GE().events.once('idle',a); return; }
        if(on) load('rail',fc=>{ try{ GE().layers.setSourceData('rail-src',fc); }catch(_){} });
        setVis(['rail-ln'],on); };
      a();
      /* (#R21) phones: toggling OFF releases the ~25k-feature parsed geojson + source copy (same
         OOM-pressure policy as ecoregions); it lazily re-fetches on the next toggle. */
      if(!on&&typeof isMobile==='function'&&isMobile()){ try{ if(GE().layers.has('rail-ln')) GE().layers.remove('rail-ln'); if(GE().layers.hasSource('rail-src')) GE().layers.removeSource('rail-src'); }catch(_){} cache.rail=null; }
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity('rail2',['World railways (by gauge)','世界の鉄道（軌間別）'],['rail-ln'],'beta-dl-rail');
            if(el&&!el.querySelector('.rail-key')){ const k=document.createElement('div'); k.className='rail-key'; k.style.cssText='display:flex;flex-direction:column;gap:3px;margin-top:6px;font-size:11px;color:var(--text-main);';
              k.innerHTML=RAIL_LBL.map(([g,ja,en])=>'<div style="display:flex;align-items:center;gap:7px;"><span style="width:14px;height:3px;border-radius:2px;flex:none;background:'+RAIL_COL[g]+';"></span>'+(jp()?ja:en)+'</div>').join('')+
                '<div style="font-size:10px;color:var(--text-muted);margin-top:3px;">'+(window.IntMapLang.t(HOST.lang,"Classified by each country’s predominant gauge (Natural Earth 10m)","各国の主流軌間で分類（Natural Earth 10m）","Nach der vorherrschenden Spurweite je Land klassifiziert (Natural Earth 10m)","Классифицировано по преобладающей колее каждой страны (Natural Earth 10m)","Clasificado por el ancho de vía predominante de cada país (Natural Earth 10m)"))+'</div>';
              el.appendChild(k); } }
           else if(window._hideGenericLegend) window._hideGenericLegend('rail2'); }catch(_){}
    }
    /* ---------- World-Bank-backed country choropleths (live, keyless, CORS*) ---------- */
    /* cpi: WGI "Control of Corruption" GOVERNANCE SCORE (0–100, higher = cleaner) — the WGI database
       moved to GOV_WGI_* ids under source=3 (the old CC.EST id now returns 0 rows; curl-verified). */
    const WB={cpi:{ind:'GOV_WGI_CC.SC',date:'2023',q:'&source=3',ids:['wb-cpi-f','wb-cpi-l'],src:'wb-cpi',
        ramp:['interpolate',['linear'],['get','s'],10,'#a50026',30,'#f46d43',50,'#fee08b',70,'#74c476',90,'#1a9850'],
        score:v=>Math.max(0,Math.min(100,v)),
        nm:['Corruption (control, WGI)','汚職・腐敗指標（世界銀行WGI）'],
        note:()=>window.IntMapLang.t(HOST.lang,"World Bank WGI “Control of Corruption” score (0–100, higher = cleaner) — the open-API counterpart of TI’s CPI.","世界銀行ガバナンス指標「腐敗の統制」スコア（0–100、高い=クリーン）。TIのCPIに相当する公開API系指標。","Weltbank-WGI-Wert „Korruptionskontrolle“ (0–100, höher = sauberer) — das Open-API-Gegenstück zum CPI von TI.","Показатель Всемирного банка WGI «Контроль коррупции» (0–100, выше = чище) — аналог CPI от TI с открытым API.","Puntuación WGI del Banco Mundial «Control de la corrupción» (0–100, más alto = más limpio): el equivalente con API abierta al IPC de TI.")},
      lifeexp:{ind:'SP.DYN.LE00.IN',date:'2022',q:'',ids:['wb-le-f','wb-le-l'],src:'wb-le',
        ramp:['interpolate',['linear'],['get','s'],52,'#a50026',62,'#f46d43',70,'#fee08b',78,'#74add1',85,'#313695'],
        score:v=>v,
        nm:['Life expectancy (years)','平均寿命（年）'],
        note:()=>window.IntMapLang.t(HOST.lang,"Life expectancy at birth (World Bank, 2022).","出生時平均余命（世界銀行 2022）。","Lebenserwartung bei Geburt (Weltbank, 2022).","Ожидаемая продолжительность жизни при рождении (Всемирный банк, 2022).","Esperanza de vida al nacer (Banco Mundial, 2022).")},
      /* (#R22) New beta choropleths — all live World Bank, keyless + CORS, latest value per country. */
      unemp:{ind:'SL.UEM.TOTL.ZS',date:'',q:'&mrnev=1',ids:['wb-unemp-f','wb-unemp-l'],src:'wb-unemp',
        ramp:['interpolate',['linear'],['get','s'],2,'#1a9850',5,'#a6d96a',9,'#fee08b',15,'#f46d43',25,'#a50026'],
        score:v=>v, fmt:v=>(+v).toFixed(1)+'%',
        nm:['Unemployment rate (%)','失業率（%）'],
        note:()=>window.IntMapLang.t(HOST.lang,"Unemployment, total (% of labor force; modeled ILO / World Bank, latest year).","失業率（労働力人口比、ILO推計・世界銀行、最新年）。","Arbeitslosenquote insgesamt (% der Erwerbsbevölkerung; ILO-Modellrechnung / Weltbank, letztes Jahr).","Уровень безработицы, всего (% рабочей силы; модель МОТ / Всемирный банк, последний год).","Desempleo total (% de la población activa; estimación modelada OIT / Banco Mundial, último año).")},
      internet:{ind:'IT.NET.USER.ZS',date:'',q:'&mrnev=1',ids:['wb-internet-f','wb-internet-l'],src:'wb-internet',
        ramp:['interpolate',['linear'],['get','s'],10,'#a50026',30,'#f46d43',55,'#fee08b',75,'#74c476',95,'#1a9850'],
        score:v=>v, fmt:v=>(+v).toFixed(1)+'%',
        nm:['Internet users (%)','インターネット普及率（%）'],
        note:()=>window.IntMapLang.t(HOST.lang,"Individuals using the Internet (% of population; World Bank, latest year).","人口に占めるインターネット利用者の割合（世界銀行、最新年）。","Internetnutzer (% der Bevölkerung; Weltbank, letztes Jahr).","Пользователи интернета (% населения; Всемирный банк, последний год).","Personas que usan Internet (% de la población; Banco Mundial, último año).")},
      precip:{ind:'AG.LND.PRCP.MM',date:'',q:'&mrnev=1',ids:['wb-precip-f','wb-precip-l'],src:'wb-precip',
        ramp:['interpolate',['linear'],['get','s'],100,'#f6e8c3',400,'#c7eae5',800,'#80cdc1',1500,'#35978f',2800,'#01665e'],
        score:v=>v, fmt:v=>Math.round(v)+' mm',
        nm:['Annual precipitation (mm)','年降水量（mm）'],
        note:()=>window.IntMapLang.t(HOST.lang,"Average annual precipitation (depth in mm, long-term; World Bank).","年間平均降水量（深さmm、長期平均・世界銀行）。","Durchschnittlicher Jahresniederschlag (Höhe in mm, langjährig; Weltbank).","Среднегодовое количество осадков (в мм, многолетнее; Всемирный банк).","Precipitación media anual (altura en mm, a largo plazo; Banco Mundial).")}};
    function wbToggle(key,on){ state[key]=on; const W=WB[key];
      const show=()=>setVis(W.ids,on);
      if(!on){ show(); try{ window._hideGenericLegend&&window._hideGenericLegend('wb-'+key); }catch(_){} return; }
      const build=async()=>{
        if(!_imCanDraw()){ GE().events.once('idle',build); return; }
        if(GE().layers.hasSource(W.src)){ show(); legend(); return; }
        try{ await loadCountryData(); }catch(_){}
        if(!HOST.countryGeo||!Array.isArray(HOST.countryGeo.features)){ setTimeout(build,1200); return; }
        let vals=cache['wb_'+key];
        if(!vals){ vals={};
          try{ const r=await fetch('https://api.worldbank.org/v2/country/all/indicator/'+W.ind+'?format=json&per_page=400'+(W.date?('&date='+W.date):'')+(W.q||''));
            const j=await r.json(); (j&&j[1]||[]).forEach(row=>{ if(row&&row.value!=null){ const iso=row.countryiso3code||(row.country&&row.country.id); if(iso&&iso.length===3) vals[iso]=+row.value; } });
          }catch(_){}
          if(!Object.keys(vals).length){ try{ imToast(window.IntMapLang.t(HOST.lang,"Could not load the data","データを取得できませんでした","Daten konnten nicht geladen werden","Не удалось загрузить данные","No se pudieron cargar los datos")); }catch(_){} return; }
          cache['wb_'+key]=vals;
        }
        try{
          const feats=HOST.countryGeo.features.filter(f=>f.id!=null&&vals[f.id]!=null).map(f=>({type:'Feature',geometry:f.geometry,properties:{s:W.score(vals[f.id]),raw:vals[f.id],iso:f.id}}));
          GE().layers.addSource(W.src,{type:'geojson',data:{type:'FeatureCollection',features:feats},attribution:'World Bank'});
          GE().layers.add({id:W.ids[0],type:'fill',source:W.src,layout:{visibility:'none'},paint:{'fill-color':W.ramp,'fill-opacity':0.68}},before());
          GE().layers.add({id:W.ids[1],type:'line',source:W.src,layout:{visibility:'none'},paint:{'line-color':'rgba(40,40,46,0.35)','line-width':0.5}},before());
          const _valOf=(p)=>W.fmt?W.fmt(p.raw):((key==='cpi')?(Math.round(p.s)+' / 100'):((+p.raw).toFixed(1)+(window.IntMapLang.t(HOST.lang," yrs"," 年"," J."," лет"," años"))));
          const _nmOf=(p)=>{ let nm=p.iso; try{ const s=countryStats[p.iso]; if(s) nm=(jp()?(s.nameJp||s.nameEn):s.nameEn)||p.iso; }catch(_){} return nm; };
          /* (#R25) Only show the TAP popup on touch devices. On a hover device the mousemove tooltip below
             already shows the exact same value, so a click popup was redundant ("ホバーでポップアップが出る
             レイヤーは、クリック時に新たなポップアップも出さなくていい"). Touch has no hover → keep it there. */
          if(!window._imTouchPrimary||window._imTouchPrimary()) GE().events.onLayer('click',W.ids[0],e=>{ const f=e.features&&e.features[0]; if(!f) return; const p=f.properties||{};
            try{ if(pop2) pop2.remove(); }catch(_){}
            try{ pop2=GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,className:'plc-popup',maxWidth:'260px'}).setLngLat(e.lngLat).setHTML('<div style="font-weight:700;font-size:13px;color:var(--text-main);">'+esc(_nmOf(p))+'</div><div style="font-size:12px;color:var(--text-muted);margin-top:2px;">'+(jp()?W.nm[1]:W.nm[0])+': <b style="color:var(--text-main);">'+_valOf(p)+'</b></div>')); }catch(_){}
          });
          /* (#R23) per-country HOVER like HDI ("国別の数値があるレイヤーは…ホバーで表示") — reuses the shared
             map tooltip (desktop pointer; mobile keeps the tap popup above). */
          GE().events.onLayer('mousemove',W.ids[0],e=>{ const f=e.features&&e.features[0]; if(!f) return; const p=f.properties||{};
            try{ const el=window.ensureMapTooltip&&window.ensureMapTooltip(); if(!el) return; el.style.display='block';
              el.innerHTML='<div style="font-weight:600;font-size:14px;">'+esc(_nmOf(p))+'</div><div style="margin-top:5px;color:var(--text-muted);font-size:12px;">'+(jp()?W.nm[1]:W.nm[0])+': <b style="color:var(--text-main);">'+_valOf(p)+'</b></div>';
              window.positionTooltip&&window.positionTooltip(e.point); GE().render.canvas().style.cursor='pointer'; }catch(_){}
          });
          GE().events.onLayer('mouseleave',W.ids[0],()=>{ try{ const el=window.ensureMapTooltip&&window.ensureMapTooltip(); if(el) el.style.display='none'; GE().render.canvas().style.cursor=''; }catch(_){} });
          show(); legend();
        }catch(_){}
      };
      function legend(){ try{ if(window._registerLayerOpacity){ const el=window._registerLayerOpacity('wb-'+key,[W.nm[0],W.nm[1]],W.ids,'beta-dl-'+key);
        if(el&&!el.querySelector('.wb-note')){ const d=document.createElement('div'); d.className='wb-note'; d.style.cssText='font-size:10px;color:var(--text-muted);margin-top:5px;line-height:1.5;'; d.textContent=W.note(); el.appendChild(d); } } }catch(_){} }
      build();
    }
    /* ---------- Globe tour — slow endless rotation with the whole earth in view ---------- */
    let spinRAF=null,lastT=0;
    function spinStep(ts){ if(!state.spin) return;
      if(lastT){ const dt=Math.min(100,ts-lastT); try{ const c=GE().camera.getCenter(); GE().camera.setCenter([c.lng+dt*0.0035,c.lat*0.999]); }catch(_){} }
      lastT=ts; spinRAF=requestAnimationFrame(spinStep); }
    function spinToggle(on){ state.spin=on;
      const cb=document.getElementById('beta-dl-spin');
      if(on){
        try{ if(typeof HOST.proj!=='undefined'&&HOST.proj==='flat'){ const b=document.getElementById('btn-view-globe'); b&&b.click(); } }catch(_){}
        try{ GE().camera.easeTo({zoom:Math.min(GE().camera.getZoom(),1.7),pitch:0,duration:1200}); }catch(_){}
        lastT=0; if(!spinRAF) spinRAF=requestAnimationFrame(spinStep);
        if(!spinToggle._wired){ spinToggle._wired=true;
          ['pointerdown','wheel','touchstart'].forEach(ev=>GE().render.canvas().addEventListener(ev,()=>{ if(state.spin){ state.spin=false; if(spinRAF){ cancelAnimationFrame(spinRAF); spinRAF=null; } const c2=document.getElementById('beta-dl-spin'); if(c2){ c2.checked=false; const r=c2.closest('.lyr-row'); r&&r.classList.remove('on'); } } },{passive:true})); }
      } else if(spinRAF){ cancelAnimationFrame(spinRAF); spinRAF=null; }
    }
    /* ---------- rows (swept into Others(beta) by reorganizeLayerPanel) ---------- */
    /* (#R38) [JP, EN, DE, RU] — b2Lbl() picks the active UI language (was JP/EN only → English in DE/RU). */
    const B2LBL={dc:LA('Data centers & AI infra','データセンター・AIインフラ','Rechenzentren & KI-Infrastruktur','Дата-центры и ИИ-инфраструктура','Centros de datos e infraestructura de IA'),pharma:LA('Pharma manufacturing hubs','製薬・医薬品製造拠点','Pharma-Produktionszentren','Центры фармпроизводства','Centros de fabricación farmacéutica'),lifeexp:LA('Life expectancy','平均寿命','Lebenserwartung','Продолжительность жизни','Esperanza de vida'),cpi:LA('Corruption indicator','汚職・腐敗指標','Korruptionsindex','Индекс коррупции','Indicador de corrupción'),rail:LA('World railways (by gauge)','世界の鉄道（軌間別）','Welt-Eisenbahnen (nach Spurweite)','Железные дороги мира (по колее)','Ferrocarriles del mundo (por ancho de vía)'),unemp:LA('Unemployment rate','失業率','Arbeitslosenquote','Уровень безработицы','Tasa de desempleo'),internet:LA('Internet penetration','インターネット普及率','Internetverbreitung','Проникновение интернета','Penetración de internet'),precip:LA('Annual precipitation','年降水量','Jahresniederschlag','Годовое количество осадков','Precipitación anual'),spin:LA('Globe tour (slow spin)','地球をゆっくり回す','Globus-Tour (langsame Drehung)','Тур по глобусу (медленное вращение)','Recorrido del globo (giro lento)')};
    const b2Lbl=(k)=>LPK.arr(B2LBL[k]);
    const B2SW={dc:'#5e8bff',pharma:'#2bb3a3',lifeexp:'#74add1',cpi:'#f46d43',rail:'#3a7bd5',unemp:'#f46d43',internet:'#1a9850',precip:'#35978f',spin:'#ffd166'};
    const B2FN={dc:dcToggle,pharma:phToggle,lifeexp:(on)=>wbToggle('lifeexp',on),cpi:(on)=>wbToggle('cpi',on),rail:railToggle,unemp:(on)=>wbToggle('unemp',on),internet:(on)=>wbToggle('internet',on),precip:(on)=>wbToggle('precip',on),spin:spinToggle};
    function buildUI(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('beta-dl-dc')) return;
      Object.keys(B2LBL).forEach(k=>{
        const w=document.createElement('div'); w.className='lyr-row';
        w.innerHTML='<label class="layer-option"><input type="checkbox" id="beta-dl-'+k+'"> <span class="lyr-sw" style="background:'+B2SW[k]+'"></span> <span id="beta-dl-'+k+'-lbl">'+(b2Lbl(k))+'</span></label>';
        dd.appendChild(w);
        w.querySelector('input').addEventListener('change',e=>{ e.target.closest('.lyr-row').classList.toggle('on',e.target.checked); B2FN[k](e.target.checked); });
      });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){}
    }
    if(document.readyState!=='loading') setTimeout(buildUI,0); else document.addEventListener('DOMContentLoaded',buildUI);
    function relabel(){ Object.keys(B2LBL).forEach(k=>{ const e=document.getElementById('beta-dl-'+k+'-lbl'); if(e) e.textContent=b2Lbl(k); }); }
    window.addEventListener('intmap-lang',()=>setTimeout(relabel,20));
    /* self-heal across basemap swaps */
    GE().events.on('styledata',()=>{ if(state.dc||state.pharma||state.rail||state.cpi||state.lifeexp||state.unemp||state.internet||state.precip){ setTimeout(()=>{
      if(state.dc&&ptEnsure('dc','dc-src',['dc-pt','dc-lbl'])){ setVis(['dc-pt','dc-lbl'],true); load('dc',fc=>{ try{ GE().layers.setSourceData('dc-src',fc); }catch(_){} }); }
      if(state.pharma&&ptEnsure('pharma','ph-src',['ph-pt','ph-lbl'])){ setVis(['ph-pt','ph-lbl'],true); load('pharma',fc=>{ try{ GE().layers.setSourceData('ph-src',fc); }catch(_){} }); }
      if(state.rail&&railEnsure()){ setVis(['rail-ln'],true); if(cache.rail){ try{ GE().layers.setSourceData('rail-src',cache.rail); }catch(_){} } }
      ['cpi','lifeexp','unemp','internet','precip'].forEach(k=>{ if(state[k]) wbToggle(k,true); });   /* (#R22) new WB choropleths self-heal too */
    },90); } });
    window.addEventListener('intmap-mem-pressure',()=>{ if(!state.rail) cache.rail=null; });
    window.IntMapBeta2={load,_state:state};
  })();
};

window.IntMapModules.religionLang=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const loadCountryData=HOST.loadCountryData, countryStats=HOST.countryStats;
  (function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return;
    const jp=()=>HOST.lang==='jp';
    const before=()=>GE().layers.has('tool-poly')?'tool-poly':undefined;
    const esc=(s)=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    let pop=null;
    const expand=(o)=>{ const m={}; Object.keys(o).forEach(cat=>String(o[cat]).split(/\s+/).forEach(iso=>{ if(iso) m[iso]=cat; })); return m; };
    /* dominant religion by population */
    const REL=expand({
      christian:'USA CAN MEX BRA ARG COL CHL PER VEN ECU BOL PRY URY GTM HND SLV NIC CRI PAN CUB DOM HTI JAM GBR FRA DEU ITA ESP PRT POL ROU GRC HUN AUT BEL IRL CHE HRV SVK SVN SRB BGR GEO ARM RUS UKR BLR MDA AUS NZL FJI ZAF COD ETH KEN GHA UGA TZA AGO MOZ ZMB ZWE NGA CMR RWA BDI MWI MDG NAM BWA LSO SWZ SSD CAF GAB COG PHL TLS PNG',
      muslim:'SAU IRN IRQ EGY TUR PAK BGD IDN MYS AFG DZA MAR TUN LBY SDN SOM YEM JOR SYR KWT ARE QAT OMN BHR KAZ UZB TKM TJK KGZ AZE MLI NER SEN TCD MRT GMB GIN GNB SLE BRN MDV DJI COM',
      hindu:'IND NPL MUS',
      buddhist:'THA MMR KHM LAO LKA BTN MNG JPN VNM',
      jewish:'ISR',
      unaffiliated:'CHN KOR PRK CZE EST NLD SWE'
    });
    const REL_COL={christian:'#4e79a7',muslim:'#59a14f',hindu:'#e15759',buddhist:'#f0a93b',jewish:'#76b7b2',unaffiliated:'#9aa0a6'};
    const REL_LBL={christian:['Christianity','キリスト教'],muslim:['Islam','イスラム教'],hindu:['Hinduism','ヒンドゥー教'],buddhist:['Buddhism','仏教'],jewish:['Judaism','ユダヤ教'],unaffiliated:['Unaffiliated','無宗教']};
    /* primary official / most-used language */
    const LANG=expand({
      english:'USA GBR CAN AUS NZL IRL NGA GHA KEN UGA ZAF ZWE ZMB BWA NAM SSD LBR SLE GMB MWI PNG FJI JAM TTO GUY',
      spanish:'MEX ESP ARG COL PER VEN ECU BOL PRY URY GTM HND SLV NIC CRI PAN CUB DOM',
      portuguese:'BRA PRT AGO MOZ TLS GNB CPV',
      french:'FRA COD CIV CMR SEN MLI NER BFA BEN GIN TGO BDI RWA GAB COG MDG TCD DJI HTI LUX',
      arabic:'SAU EGY IRQ DZA MAR TUN LBY SDN SYR JOR YEM ARE KWT QAT OMN BHR LBN MRT',
      chinese:'CHN TWN SGP',
      russian:'RUS BLR KAZ KGZ',
      hindi:'IND',
      bengali:'BGD',
      german:'DEU AUT CHE',
      japanese:'JPN',
      korean:'KOR PRK',
      turkish:'TUR',
      persian:'IRN AFG TJK',
      malay:'IDN MYS BRN',
      italian:'ITA'
    });
    const LANG_COL={english:'#4e79a7',spanish:'#f28e2b',arabic:'#59a14f',chinese:'#e15759',french:'#76b7b2',portuguese:'#edc948',russian:'#b07aa1',hindi:'#ff9da7',bengali:'#9c755f',german:'#bab0ac',japanese:'#86bcb6',korean:'#d37295',turkish:'#a0cbe8',persian:'#8cd17d',malay:'#e377c2',italian:'#79706e'};
    const LANG_LBL={english:['English','英語'],spanish:['Spanish','スペイン語'],arabic:['Arabic','アラビア語'],chinese:['Chinese','中国語'],french:['French','フランス語'],portuguese:['Portuguese','ポルトガル語'],russian:['Russian','ロシア語'],hindi:['Hindi','ヒンディー語'],bengali:['Bengali','ベンガル語'],german:['German','ドイツ語'],japanese:['Japanese','日本語'],korean:['Korean','韓国語'],turkish:['Turkish','トルコ語'],persian:['Persian','ペルシャ語'],malay:['Malay/Indonesian','マレー・インドネシア語'],italian:['Italian','イタリア語']};
    const CFG={
      religion:{map:REL,col:REL_COL,lbl:REL_LBL,ids:['cat-rel-f','cat-rel-l'],src:'cat-rel',nm:['Dominant religion','宗教分布（主流）']},
      language:{map:LANG,col:LANG_COL,lbl:LANG_LBL,ids:['cat-lang-f','cat-lang-l'],src:'cat-lang',nm:['Primary language','言語分布（主要）']}
    };
    const state={religion:false,language:false};
    function colorExpr(C){ const e=['match',['get','cat']]; Object.keys(C.col).forEach(cat=>{ e.push(cat, C.col[cat]); }); e.push('#9aa0a6'); return e; }
    async function build(key){ const C=CFG[key];
      if(GE().layers.hasSource(C.src)){ setVis(key,true); legend(key); return; }
      try{ await loadCountryData(); }catch(_){}
      const cg=(typeof HOST.countryGeo!=='undefined'&&HOST.countryGeo)||window.countryGeo;
      if(!cg||!Array.isArray(cg.features)){ setTimeout(()=>build(key),1200); return; }
      const feats=cg.features.filter(f=>f.id!=null&&C.map[f.id]).map(f=>({type:'Feature',geometry:f.geometry,properties:{cat:C.map[f.id],iso:f.id}}));
      try{
        GE().layers.addSource(C.src,{type:'geojson',data:{type:'FeatureCollection',features:feats}});
        GE().layers.add({id:C.ids[0],type:'fill',source:C.src,layout:{visibility:'none'},paint:{'fill-color':colorExpr(C),'fill-opacity':0.62}},before());
        GE().layers.add({id:C.ids[1],type:'line',source:C.src,layout:{visibility:'none'},paint:{'line-color':'rgba(40,40,46,0.35)','line-width':0.5}},before());
        GE().events.onLayer('click',C.ids[0],e=>{ const f=e.features&&e.features[0]; if(!f) return; const p=f.properties||{};
          let nm=p.iso; try{ const s=countryStats[p.iso]; if(s) nm=(jp()?(s.nameJp||s.nameEn):s.nameEn)||p.iso; }catch(_){}
          const catLbl=(C.lbl[p.cat]?(jp()?C.lbl[p.cat][1]:C.lbl[p.cat][0]):p.cat);
          try{ if(pop) pop.remove(); }catch(_){}
          try{ pop=GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,className:'plc-popup',maxWidth:'260px'}).setLngLat(e.lngLat).setHTML('<div style="font-weight:700;font-size:13px;color:var(--text-main);">'+esc(nm)+'</div><div style="font-size:12px;color:var(--text-muted);margin-top:2px;">'+(jp()?C.nm[1]:C.nm[0])+': <b style="color:var(--text-main);">'+esc(catLbl)+'</b></div>')); }catch(_){}
        });
        GE().events.onLayer('mouseenter',C.ids[0],()=>{ GE().render.canvas().style.cursor='pointer'; });
        GE().events.onLayer('mouseleave',C.ids[0],()=>{ GE().render.canvas().style.cursor=''; });
        setVis(key,true); legend(key);
      }catch(_){}
    }
    function setVis(key,on){ const C=CFG[key]; C.ids.forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',on?'visible':'none'); }catch(_){} }); }
    function legend(key){ const C=CFG[key];
      try{ if(!window._registerLayerOpacity) return;
        const el=window._registerLayerOpacity('cat-'+key,[C.nm[0],C.nm[1]],C.ids,'beta-dl-cat-'+key);
        if(el&&!el.querySelector('.cat-key')){ const k=document.createElement('div'); k.className='cat-key'; k.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;margin-top:6px;font-size:10.5px;color:var(--text-main);';
          k.innerHTML=Object.keys(C.col).map(cat=>'<div style="display:flex;align-items:center;gap:6px;"><span style="width:11px;height:11px;border-radius:3px;flex:none;background:'+C.col[cat]+';"></span>'+(jp()?C.lbl[cat][1]:C.lbl[cat][0])+'</div>').join('');
          el.appendChild(k); }
      }catch(_){} }
    function toggle(key,on){ state[key]=on;
      if(!on){ setVis(key,false); try{ window._hideGenericLegend&&window._hideGenericLegend('cat-'+key); }catch(_){} return; }
      if(!_imCanDraw()){ GE().events.once('idle',()=>toggle(key,true)); return; }
      build(key);
    }
    const CLBL={religion:['宗教分布','Religion distribution'],language:['言語分布','Language distribution']};
    const CSW={religion:'#4e79a7',language:'#f28e2b'};
    function buildUI(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('beta-dl-cat-religion')) return;
      Object.keys(CLBL).forEach(k=>{ const w=document.createElement('div'); w.className='lyr-row';
        w.innerHTML='<label class="layer-option"><input type="checkbox" id="beta-dl-cat-'+k+'"> <span class="lyr-sw" style="background:'+CSW[k]+'"></span> <span id="beta-dl-cat-'+k+'-lbl">'+(jp()?CLBL[k][0]:CLBL[k][1])+'</span></label>';
        dd.appendChild(w);
        w.querySelector('input').addEventListener('change',e=>{ e.target.closest('.lyr-row').classList.toggle('on',e.target.checked); toggle(k,e.target.checked); }); });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){}
    }
    if(document.readyState!=='loading') setTimeout(buildUI,0); else document.addEventListener('DOMContentLoaded',buildUI);
    window.addEventListener('intmap-lang',()=>setTimeout(()=>{ Object.keys(CLBL).forEach(k=>{ const e=document.getElementById('beta-dl-cat-'+k+'-lbl'); if(e) e.textContent=jp()?CLBL[k][0]:CLBL[k][1]; }); },20));
    GE().events.on('styledata',()=>{ if(state.religion||state.language){ setTimeout(()=>{ ['religion','language'].forEach(k=>{ if(state[k]){ if(GE().layers.hasSource(CFG[k].src)) setVis(k,true); else build(k); } }); },90); } });
  })();
};

window.IntMapModules.timeZones=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const satToast=HOST.satToast;
  (function(){
    if(!GE().hasRenderer()) return;
    const TZURL='https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_10m_time_zones.geojson';
    let on=false, geo=null, loading=false, timer=null;
    const lbl=()=>({en:'Time zones (live clock)',jp:'タイムゾーン（現在時刻）',de:'Zeitzonen (Uhr)',ru:'Часовые пояса (время)',es:'Husos horarios (hora)'})[HOST.lang]||'Time zones';
    const T=window.IntMapLang.pick(()=>HOST.lang);
    function zoneTime(off){ const n=new Date(); const z=new Date(n.getTime()+n.getTimezoneOffset()*60000+off*3600000); const h=z.getHours(),m=z.getMinutes(); return (h<10?'0':'')+h+':'+(m<10?'0':'')+m; }
    function offLabel(off){ const s=off<0?'−':'+'; const a=Math.abs(off); const hh=Math.floor(a); const mm=Math.round((a-hh)*60); return 'UTC'+s+hh+(mm?(':'+(mm<10?'0':'')+mm):''); }
    function bboxOf(f){ if(f.bbox) return f.bbox; let mnx=180,mny=90,mxx=-180,mxy=-90; const eat=r=>r.forEach(p=>{ if(p[0]<mnx)mnx=p[0]; if(p[0]>mxx)mxx=p[0]; if(p[1]<mny)mny=p[1]; if(p[1]>mxy)mxy=p[1]; }); const g=f.geometry; if(!g) return null; const polys=g.type==='Polygon'?g.coordinates:g.type==='MultiPolygon'?[].concat.apply([],g.coordinates):[]; polys.forEach(eat); return [mnx,mny,mxx,mxy]; }
    function labelFC(){ if(!geo) return {type:'FeatureCollection',features:[]}; const best={};
      geo.features.forEach(f=>{ const z=f.properties&&f.properties.zone; if(z==null) return; const bb=bboxOf(f); if(!bb) return; const area=(bb[2]-bb[0])*(bb[3]-bb[1]); if(!best[z]||area>best[z].area) best[z]={area,cx:(bb[0]+bb[2])/2,cy:(bb[1]+bb[3])/2,z}; });
      /* ⚠ (#R204) THE OFFSET TRAVELS WITH THE LABEL. 「Time zonesでその時間帯のテキスト（UTC+9など）を
         押したら、同じ時間の部分をハイライトするように。」 — the click arrives on the SYMBOL feature, and
         a symbol feature that carries only its rendered string cannot say which zone it names
         (「UTC+9」 would have to be parsed back out of the text). `zone` is the number the polygons
         are keyed on, so the highlight filter is an equality on the same field the fill uses. */
      return {type:'FeatureCollection',features:Object.keys(best).map(k=>{ const b=best[k]; return {type:'Feature',geometry:{type:'Point',coordinates:[b.cx,Math.max(-58,Math.min(72,b.cy))]},properties:{label:offLabel(b.z)+'\n'+zoneTime(b.z),zone:b.z}}; })}; }
    function refreshTimes(){ try{ GE().layers.setSourceData('tzl-lbl-src',labelFC()); }catch(_){} }
    function addLayers(){ if(!geo) return;
      if(!GE().layers.hasSource('tzl-src')) GE().layers.addSource('tzl-src',{type:'geojson',data:geo});
      if(!GE().layers.hasSource('tzl-lbl-src')) GE().layers.addSource('tzl-lbl-src',{type:'geojson',data:labelFC()});
      const before=['ofm-river','ofm-water','ofm-country','ofm-city','ofm-other','borders-only-line'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
      const PAL=['match',['get','map_color8'],1,'#8dd3c7',2,'#ffffb3',3,'#bebada',4,'#fb8072',5,'#80b1d3',6,'#fdb462',7,'#b3de69',8,'#fccde5','#cfd8e3'];
      if(!GE().layers.has('tzl-fill')) GE().layers.add({id:'tzl-fill',type:'fill',source:'tzl-src',layout:{visibility:'none'},paint:{'fill-color':PAL,'fill-opacity':0.5}},before);   /* (#R79c) initial opacity 50% (matches the registered default) */
      if(!GE().layers.has('tzl-line')) GE().layers.add({id:'tzl-line',type:'line',source:'tzl-src',layout:{visibility:'none','line-join':'round'},paint:{'line-color':'rgba(120,140,170,0.95)','line-width':['interpolate',['linear'],['zoom'],1,0.6,5,1.4],'line-dasharray':[2,1.6]}},before);
      /* the highlight sits BETWEEN the fill and the outline so it reads as the same band lit up
         rather than as a new shape on top; `-1e9` is a zone no feature has, i.e. "nothing selected". */
      if(!GE().layers.has('tzl-hl')) GE().layers.add({id:'tzl-hl',type:'fill',source:'tzl-src',layout:{visibility:'none'},filter:['==',['get','zone'],-1e9],paint:{'fill-color':'#ffd43b','fill-opacity':0.55}},before);
      if(!GE().layers.has('tzl-hl-line')) GE().layers.add({id:'tzl-hl-line',type:'line',source:'tzl-src',layout:{visibility:'none','line-join':'round'},filter:['==',['get','zone'],-1e9],paint:{'line-color':'#ffd43b','line-width':['interpolate',['linear'],['zoom'],1,1.6,5,3],'line-opacity':0.95}},before);
      if(!GE().layers.has('tzl-time')) GE().layers.add({id:'tzl-time',type:'symbol',source:'tzl-lbl-src',layout:{visibility:'none','text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':window.IntMapLabelScale.sub(1),'text-line-height':1.1,'text-allow-overlap':false,'text-padding':5},paint:{'text-color':'#ffffff','text-halo-color':'rgba(0,38,76,0.92)','text-halo-width':1.7}});
      wireHighlight(); }
    /* ══ (#R204) PRESSING 「UTC+9」 LIGHTS UP EVERY BAND ON THAT OFFSET ═════════════════════════════
       One offset is not one polygon: UTC+9 is Japan, Korea, eastern Indonesia, Palau and a slice of
       Russia, and that is exactly what the request is about — 「同じ時間の部分をハイライト」. The
       filter is an equality on `zone`, so every polygon sharing the offset lights at once, however
       many and wherever they are. Pressing the same label again clears it (a highlight with no way
       off is a mode); pressing another switches. The polygons answer the click too, so the same
       question can be asked of a country as of its label. */
    let hlZone=null;
    function setHighlight(z){
      hlZone=(z==null?null:+z);
      const f=['==',['get','zone'],(hlZone==null?-1e9:hlZone)];
      ['tzl-hl','tzl-hl-line'].forEach(id=>{ try{ if(GE().layers.has(id)){ GE().layers.setFilter(id,f); GE().layers.setLayout(id,'visibility',(on&&hlZone!=null)?'visible':'none'); } }catch(_){} });
    }
    let wired=false;
    function wireHighlight(){ if(wired) return; wired=true;
      /* ⚠ THE LABEL WINS, AND IT HAS TO BE SAID EXPLICITLY. Both the text and the polygon answer a
         click, and one press lands on BOTH — the label is anchored at the centre of its zone's
         largest polygon, which on a globe at low zoom is often drawn over a NEIGHBOURING band. The
         two handlers then ran in registration order and the fill's won: measured, pressing 「UTC+8」
         highlighted zone 7. The renderer hands the same event object to every delegated layer
         handler for one click, so the label marks it and the fill stands down. */
      const hit=(e,fromLabel)=>{
        if(e && e.__tzTaken) return;
        const f=e.features&&e.features[0]; if(!f) return;
        const z=f.properties&&f.properties.zone; if(z==null) return;
        if(fromLabel && e) e.__tzTaken=true;
        setHighlight((hlZone!=null&&+z===hlZone)?null:z);
      };
      /* ⚠ …and the label is wired FIRST, because "the same event object" only helps if the handler
         that claims it runs first. */
      [['tzl-time',true],['tzl-fill',false]].forEach(([id,isLabel])=>{ try{
        GE().events.onLayer('click',id,(e)=>hit(e,isLabel));
        GE().events.onLayer('mouseenter',id,()=>{ try{ GE().render.canvas().style.cursor='pointer'; }catch(_){} });
        GE().events.onLayer('mouseleave',id,()=>{ try{ GE().render.canvas().style.cursor=''; }catch(_){} });
      }catch(_){} });
    }
    function setVis(v){ ['tzl-fill','tzl-line','tzl-time'].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',v?'visible':'none'); }catch(_){} });
      ['tzl-hl','tzl-hl-line'].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',(v&&hlZone!=null)?'visible':'none'); }catch(_){} }); }
    function toggle(v){ on=v;
      if(v){
        const go=()=>{ let tries=0; const apply=()=>{ if(!_imCanDraw()){ if(tries++<60) setTimeout(apply,150); else GE().events.once('idle',apply); return; } addLayers(); setVis(true);
          try{ window._registerLayerOpacity&&window._registerLayerOpacity('tz',[lbl(),lbl(),lbl(),lbl()],['tzl-fill'],'dl-tz'); }catch(_){}
          try{ window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){} if(!timer) timer=setInterval(refreshTimes,60000); refreshTimes(); }; apply(); [400,1500].forEach(ms=>setTimeout(apply,ms)); };
        if(geo) go();
        else if(!loading){ loading=true; try{ satToast(T('Loading time-zone boundaries…','タイムゾーン境界を読み込み中…','Zeitzonengrenzen werden geladen…','Загрузка часовых поясов…','Cargando husos horarios…')); }catch(_){}
          fetch(TZURL).then(r=>r.json()).then(j=>{ geo=j; loading=false; if(on) go(); }).catch(()=>{ loading=false; try{ satToast(T('Time-zone data unavailable','タイムゾーンデータを取得できません','Zeitzonendaten nicht verfügbar','Данные часовых поясов недоступны','Datos de husos no disponibles')); }catch(_){} const cb=document.getElementById('dl-tz'); if(cb){ cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on'); } }); }
        else go();
      } else { setVis(false); if(timer){ clearInterval(timer); timer=null; } try{ window._hideGenericLegend&&window._hideGenericLegend('tz'); }catch(_){} } }
    GE().events.on('styledata',()=>{ if(on) setTimeout(()=>{ if(_imCanDraw()&&geo){ addLayers(); setVis(true); refreshTimes(); } },80); });
    function buildUI(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('dl-tz')) return;
      const w=document.createElement('div'); w.className='lyr-row'; w.id='lyrrow-tz';
      const lab=document.createElement('label'); lab.className='layer-option';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.id='dl-tz';
      const sw=document.createElement('span'); sw.className='lyr-sw'; sw.style.background='#80b1d3';
      const sp=document.createElement('span'); sp.id='dl-tz-lbl'; sp.textContent='🕒 '+lbl();
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ')); lab.appendChild(sw); lab.appendChild(document.createTextNode(' ')); lab.appendChild(sp);
      w.appendChild(lab); dd.appendChild(w);
      cb.addEventListener('change',e=>{ w.classList.toggle('on',e.target.checked); toggle(e.target.checked); });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    window.addEventListener('intmap-lang',()=>{ const s=document.getElementById('dl-tz-lbl'); if(s) s.textContent='🕒 '+lbl(); });
    /* (#R204) the highlight as a fact the app publishes — Atlas and the E2E tests both ask it here
       rather than reading a filter expression back off the renderer. */
    window.IntMapTimeZones={ highlight:(z)=>setHighlight(z), highlighted:()=>hlZone, clear:()=>setHighlight(null) };
    if(document.readyState!=='loading') setTimeout(buildUI,1000); else document.addEventListener('DOMContentLoaded',()=>setTimeout(buildUI,1000));
  })();
};

window.IntMapModules.gibsScience=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  (function(){
    if(!GE().hasRenderer()) return;
    const GDATE=()=>new Date(Date.now()-2*864e5).toISOString().slice(0,10);
    const LGX=window.IntMapLang.pick(()=>HOST.lang);
    /* ⚠ (#R241) THE ORDER USED TO BE [JP, EN, DE, RU] — the registry's is [EN, JP, DE, RU, ES], and a
       table with its own order needs its own index map, which is a second copy of the language list.
       This file had one (`{jp:0,en:1,de:2,ru:3,es:4}`), it named five languages, and every GIBS layer
       name was therefore English on fr/ko/zh — while every translation instrument reported 100 %,
       because an array literal is not a call. Written as `LA(en, jp, de, ru, es)` these are ordinary
       L(…) sites: same order as the rest of the app, seen by the audits, and resolved through
       `pick()` so a language past the arguments gets its inline-table entry. */
    const LA=window.IntMapLang.pickArgs();
    const LIST=[
      {id:'gxtruecolor', gibs:'MODIS_Terra_CorrectedReflectance_TrueColor', max:9, ext:'jpg', sw:'#9ec7ff',
        label:LA('Daily satellite (true color)','当日の衛星画像（自然色）','Satellit (Echtfarben, täglich)','Спутник (естеств. цвет, ежедн.)','Satélite diario (color natural)'),
        note:LA('MODIS Terra daily true-color mosaic','MODIS Terra 当日のトゥルーカラー合成','MODIS Terra Echtfarben-Mosaik (täglich)','MODIS Terra естеств. цвет (ежедневно)','Mosaico diario en color natural de MODIS Terra')},
      {id:'gxlst', gibs:'MODIS_Terra_Land_Surface_Temp_Day', max:7, ext:'png', sw:'#f0651b',
        label:LA('Land surface temp (day)','地表面温度（昼）','Bodentemperatur (Tag)','Темп. поверхности (день)','Temp. de superficie (día)'),
        note:LA('MODIS land-surface temperature, daytime','MODIS 地表面温度（日中）','MODIS Landoberflächentemperatur (Tag)','MODIS темп. поверхности суши (день)','Temperatura de la superficie terrestre (MODIS), de día')},
      {id:'gxndvi', gibs:'MODIS_Terra_NDVI_8Day', max:9, ext:'png', sw:'#2e7d32',
        label:LA('Vegetation index (NDVI)','植生指数 (NDVI)','Vegetationsindex (NDVI)','Индекс растительности (NDVI)','Índice de vegetación (NDVI)'),
        note:LA('MODIS vegetation index (8-day)','MODIS 植生指数（8日合成）','MODIS Vegetationsindex (8 Tage)','MODIS индекс растительности (8 дней)','Índice de vegetación MODIS (8 días)')},
      {id:'gxwvapor', gibs:'MODIS_Terra_Water_Vapor_5km_Day', max:6, ext:'png', sw:'#4fc3f7',
        label:LA('Water vapor','可降水量（水蒸気）','Wasserdampf','Водяной пар','Vapor de agua'),
        note:LA('MODIS atmospheric water vapor','MODIS 大気可降水量','MODIS atmosphärischer Wasserdampf','MODIS атмосферный водяной пар','Vapor de agua atmosférico (MODIS)')},
      {id:'gxcloud', gibs:'MODIS_Terra_Cloud_Fraction_Day', max:6, ext:'png', sw:'#e2e2e2',
        label:LA('Cloud fraction (day)','雲量割合（昼）','Wolkenanteil (Tag)','Доля облачности (день)','Fracción de nubes (día)'),
        note:LA('MODIS cloud fraction, daytime','MODIS 雲量割合（日中）','MODIS Wolkenanteil (Tag)','MODIS доля облачности (день)','Fracción de nubes MODIS, de día')},
      {id:'gxseaice', gibs:'GHRSST_L4_MUR_Sea_Ice_Concentration', max:7, ext:'png', sw:'#cfe8ff',
        label:LA('Sea-ice concentration','海氷密接度','Meereiskonzentration','Концентрация морского льда','Concentración de hielo marino'),
        note:LA('GHRSST MUR sea-ice concentration','GHRSST MUR 海氷密接度','GHRSST MUR Meereiskonzentration','GHRSST MUR концентрация льда','Concentración de hielo marino GHRSST MUR')},
      {id:'gxsstanom', gibs:'GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies', max:7, ext:'png', sw:'#ef5350',
        label:LA('Sea-surface temp anomaly','海面水温 偏差','Meeresoberflächentemp.-Anomalie','Аномалия темп. поверхности моря','Anomalía de temp. superficial del mar'),
        note:LA('Anomaly vs climatology (ENSO signal)','平年差（エルニーニョ等の指標）','Abweichung vom Mittel (ENSO)','Аномалия к норме (сигнал Эль-Ниньо)','Anomalía respecto a la climatología (señal ENSO)')},
      /* (#R40) Blue Marble (relief + bathymetry) was DELETED per request. */
      /* (#R39) +4 more curl-verified GIBS rasters (HTTP 200 / image/*). */
      {id:'gxcloudtop', gibs:'MODIS_Terra_Cloud_Top_Temp_Day', max:6, ext:'png', sw:'#b3d4fc',
        label:LA('Cloud-top temperature','雲頂温度（昼）','Wolkenobergrenzentemperatur','Температура вершин облаков','Temperatura del tope de nubes'),
        note:LA('MODIS cloud-top temperature; colder = taller storm clouds','MODIS 雲頂温度。低いほど高く発達した雲（積乱雲など）','MODIS Wolkenobergrenzentemperatur; kälter = höhere Gewitterwolken','MODIS температура вершин облаков; холоднее = выше грозовые облака','Temperatura del tope de nubes (MODIS); más frío = nubes de tormenta más altas')},
      {id:'gxlstnight', gibs:'MODIS_Terra_Land_Surface_Temp_Night', max:7, ext:'png', sw:'#5c6bc0',
        label:LA('Land surface temp (night)','地表面温度（夜）','Bodentemperatur (Nacht)','Темп. поверхности (ночь)','Temp. de superficie (noche)'),
        note:LA('MODIS land-surface temperature, nighttime','MODIS 夜間の地表面温度','MODIS Landoberflächentemperatur (Nacht)','MODIS темп. поверхности суши (ночь)','Temperatura de la superficie terrestre (MODIS), de noche')},
      {id:'gxbtday', gibs:'MODIS_Terra_Brightness_Temp_Band31_Day', max:7, ext:'png', sw:'#ff8a65',
        label:LA('Brightness temp (thermal IR)','輝度温度（熱赤外・昼）','Strahlungstemperatur (Thermal-IR)','Яркостная температура (ИК)','Temperatura de brillo (IR térmico)'),
        note:LA('MODIS band-31 thermal-IR brightness temperature','MODIS バンド31熱赤外の輝度温度（雲・地表の熱）','MODIS Band-31 thermische IR-Strahlungstemperatur','MODIS яркостная температура (тепловой ИК, канал 31)','Temperatura de brillo en IR térmico (banda 31) de MODIS')},
      {id:'gxrelief', gibs:'ASTER_GDEM_Color_Shaded_Relief', max:12, ext:'jpg', staticDate:'2024-01-01', sw:'#8d6e63',
        label:LA('Color relief (ASTER GDEM)','カラー段彩・陰影（ASTER）','Farbrelief (ASTER GDEM)','Цветной рельеф (ASTER GDEM)','Relieve en color (ASTER GDEM)'),
        note:LA('ASTER global DEM color + shaded relief (static)','ASTER 全球標高モデルのカラー段彩＋陰影起伏（静止画）','ASTER globales DEM, Farb- + Schummerung (statisch)','ASTER глобальная ЦМР: цвет + отмывка (статично)','MDE global ASTER: color + relieve sombreado (estático)')},
      /* (#R41) +OMPS UV Aerosol Index — endpoint curl-verified (HTTP 200/png). Highlights UV-absorbing aerosols
         (smoke, dust, volcanic ash); distinct from the existing AOD layer. */
      {id:'gxaero', gibs:'OMPS_Aerosol_Index', max:6, ext:'png', sw:'#c97b3c',
        label:LA('UV Aerosol Index','紫外線エアロゾル指数','UV-Aerosolindex','УФ-индекс аэрозолей','Índice UV de aerosoles'),
        note:LA('OMPS UV-absorbing aerosols — smoke, dust, volcanic ash','煙・砂じん・火山灰など紫外線を吸収するエアロゾルを検出（OMPS）','OMPS UV-absorbierende Aerosole — Rauch, Staub, Vulkanasche','OMPS поглощающие УФ аэрозоли — дым, пыль, пепел','OMPS aerosoles que absorben UV — humo, polvo, ceniza')},
      /* (#R42) THREE new objective NASA GIBS science rasters (endpoints + colormaps curl-verified). Distinct new
         categories — ocean biology / air pollution / soil — placed straight into REAL groups (same objective+
         sourced+legend bar as gxaero/gxndvi). Daily products at −2 d via the shared GDATE(). */
      {id:'gxchlor', gibs:'VIIRS_NOAA20_Chlorophyll_a', max:7, ext:'png', sw:'#1bb37a',
        label:LA('Chlorophyll-a (ocean color)','クロロフィルa（海色）','Chlorophyll a (Ozeanfarbe)','Хлорофилл-а (цвет океана)','Clorofila-a (color del océano)'),
        note:LA('Ocean-surface chlorophyll-a — phytoplankton / marine productivity (VIIRS)','海洋表層のクロロフィルa濃度 — 植物プランクトン＝海の生産性（VIIRS）','Chlorophyll a an der Meeresoberfläche — Phytoplankton/Produktivität (VIIRS)','Хлорофилл-а у поверхности океана — фитопланктон/продуктивность (VIIRS)','Clorofila-a superficial — fitoplancton/productividad marina (VIIRS)')},
      {id:'gxco', gibs:'AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Day', max:6, ext:'png', sw:'#cb3220',
        label:LA('Carbon monoxide (CO)','一酸化炭素 (CO)','Kohlenmonoxid (CO)','Угарный газ (CO)','Monóxido de carbono (CO)'),
        note:LA('Mid-tropospheric CO — wildfire smoke, combustion & air pollution (AIRS)','対流圏中層のCO濃度 — 山火事の煙・燃焼・大気汚染の指標（AIRS）','CO in der mittleren Troposphäre — Rauch, Verbrennung, Luftverschmutzung (AIRS)','CO в средней тропосфере — дым пожаров, горение, загрязнение (AIRS)','CO en la troposfera media — humo, combustión y contaminación (AIRS)')},
      {id:'gxsoil', gibs:'AMSRU2_Soil_Moisture_SCA_Day', max:6, ext:'png', sw:'#1bf74d',
        label:LA('Soil moisture','土壌水分','Bodenfeuchte','Влажность почвы','Humedad del suelo'),
        note:LA('Surface soil moisture — drought & agriculture (AMSR2)','表層土壌の水分量 — 干ばつ・農業の指標（AMSR2）','Oberflächen-Bodenfeuchte — Dürre & Landwirtschaft (AMSR2)','Влажность поверхностного слоя почвы — засуха и сельское хозяйство (AMSR2)','Humedad superficial del suelo — sequía y agricultura (AMSR2)')}
    ];
    const state={}; LIST.forEach(L=>state[L.id]=false);
    /* (#R41) Color-SCALE legends for the GIBS rasters ("Sea-ice / SST anomaly に凡例がない！" + "凡例が必要な
       のにないレイヤーが多い"). Each is a CSS gradient approximating the GIBS colormap + min/max labels. Temps
       are unit-aware (°C/°F); the SST field is an ANOMALY so its endpoints convert as a DIFFERENCE (×9/5, no +32). */
    const _tEnd=(c)=>((window.imUnitTemp==='f')?(Math.round(c*9/5+32)+'°F'):(Math.round(c)+'°C'));
    const _aEnd=(c)=>{ const v=(window.imUnitTemp==='f')?Math.round(c*9/5):c; return (v>0?'+':'')+v+(window.imUnitTemp==='f'?'°F':'°C'); };
    /* (#R42) Legends rebuilt from the ACTUAL NASA GIBS colormap XMLs (colormaps/v1.3/<name>.xml), sampled at
       even stops — the old gradients were invented ("凡例の色がでたらめ"): Sea-ice was a flat blue→white but
       GIBS renders a full near-black→magenta→blue→cyan→green→yellow→orange→red→white rainbow (0→100 %); SST
       anomaly used ±5 °C blue→white→red but GIBS is ±3 °C purple→blue→cyan→green→GREY(0)→yellow→orange→red→
       magenta→dark-red. The temp rasters span the colormap's true Kelvin clamp range (e.g. LST 200–350 K =
       −73…+77 °C). Every gradient below now MATCHES what the tiles actually paint. */
    const SCALES={
      gxlst:{temp:[-73,77],grad:'#c900ff,#3900ff,#0075ff,#24ffab,#a4ff00,#ffdc00,#ff6d00,#ff0100'},
      gxlstnight:{temp:[-73,77],grad:'#c900ff,#3900ff,#0075ff,#24ffab,#a4ff00,#ffdc00,#ff6d00,#ff0100'},
      gxseaice:{lo:'0%',hi:'100%',grad:'#111111,#950095,#b100ff,#0700ff,#00bdff,#00d98e,#1eb400,#d2f000,#ff7f00,#ff3333,#ffffff'},
      gxsstanom:{anom:[-3,3],grad:'#6b00db,#7f1ad1,#0094ff,#18fce5,#88ff84,#bff4a3,#cacab7,#fff679,#ffb601,#ff7100,#f90113,#d30085,#800000'},
      gxndvi:{loK:LA('sparse','まばら','spärlich','редкая','escasa'),hiK:LA('dense','密','dicht','густая','densa'),grad:'#f1ecec,#ddc9bc,#b19883,#bfde77,#78ad01,#3e8a01,#086701,#001801'},
      gxwvapor:{loK:LA('dry','乾燥','trocken','сухо','seco'),hiK:LA('humid','湿潤','feucht','влажно','húmedo'),grad:'#a900ab,#2c02de,#0064ee,#00c64f,#e5fc00,#ffb800,#ff5900,#b40000'},
      gxcloud:{lo:'0%',hi:'100%',grad:'#660077,#000264,#0004ff,#055000,#ffff00,#bb8802,#6e0004,#ff0005'},
      gxcloudtop:{temp:[-123,77],grad:'#660077,#010264,#0203ff,#045004,#ffff01,#bb8804,#6e0303,#ff0405'},
      gxbtday:{temp:[-93,67],grad:'#000016,#2e347e,#684f92,#a16995,#c68289,#ebc7b0,#fffadf,#ffffff'},
      gxrelief:{loK:LA('low','低い','niedrig','низко','bajo'),hiK:LA('high','高い','hoch','высоко','alto'),grad:'#1a7a3c,#a6d96a,#e6e08b,#a87b52,#ffffff'},
      gxaero:{lo:'0',hi:'≥5',grad:'#ffffff,#dddd8d,#f1f12a,#e5e300,#de8800,#f30f00,#c60001,#730019'},
      gxchlor:{loK:LA('low','低い','niedrig','низкая','baja'),hiK:LA('high','高い','hoch','высокая','alta'),grad:'#93006c,#2700d8,#0080ff,#00ff9f,#88ff00,#ffab00,#ff1700,#690000'},
      gxco:{loK:LA('low','低い','niedrig','низкий','bajo'),hiK:LA('high','高い','hoch','высокий','alto'),grad:'#fffdda,#fffcbb,#fcd76e,#fd704e,#cb3220,#a12259,#8a34f0,#2f054a'},
      gxsoil:{loK:LA('dry','乾燥','trocken','сухо','seco'),hiK:LA('wet','湿潤','feucht','влажно','húmedo'),grad:'#cc8029,#cadb25,#65eb21,#1bf74d,#16f7cc,#0e97e8,#0714d9,#6600cc'}
    };
    const _lx=(arr)=>LGX.arr(arr);
    const gxLbl=(L)=>LGX.arr(L.label);
    const gxNote=(L)=>LGX.arr(L.note);
    const srcId=(L)=>'gxsrc-'+L.id, layId=(L)=>'gxlyr-'+L.id;
    const beforeLabels=()=>['layer-sat-labels','borders-only-line','ofm-country','ofm-city','ofm-other'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
    const urlFor=(L)=>'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/'+L.gibs+'/default/'+(L.staticDate||GDATE())+'/GoogleMapsCompatible_Level'+L.max+'/{z}/{y}/{x}.'+L.ext;
    function ensure(L){ try{ if(!_imCanDraw()) return false;
      if(!GE().layers.hasSource(srcId(L))) GE().layers.addSource(srcId(L),{type:'raster',tiles:[urlFor(L)],tileSize:256,maxzoom:L.max,attribution:'NASA EOSDIS GIBS'});
      if(!GE().layers.has(layId(L))) GE().layers.add({id:layId(L),type:'raster',source:srcId(L),layout:{visibility:'none'},paint:{'raster-opacity':0.85,'raster-fade-duration':0}}, beforeLabels());
      return true; }catch(e){ return false; } }
    function legendNote(L){ try{ const el=window._registerLayerOpacity&&window._registerLayerOpacity('gx-'+L.id,L.label,[layId(L)],'gx-'+L.id);
      if(el){
        /* (#R41) color-scale bar (above the note) for the rasters that encode a measurable quantity */
        const sc=SCALES[L.id];
        if(sc){ let bar=el.querySelector('.gx-scale'); if(!bar){ bar=document.createElement('div'); bar.className='gx-scale'; bar.style.cssText='margin-top:5px;'; el.appendChild(bar); }
          const lo=sc.temp?_tEnd(sc.temp[0]):sc.anom?_aEnd(sc.anom[0]):sc.loK?_lx(sc.loK):sc.lo;
          const hi=sc.temp?_tEnd(sc.temp[1]):sc.anom?_aEnd(sc.anom[1]):sc.hiK?_lx(sc.hiK):sc.hi;
          const mid=sc.anom?'<span>0</span>':'';
          bar.innerHTML='<div style="height:8px;border-radius:3px;background:linear-gradient(to right,'+sc.grad+');border:1px solid rgba(128,128,128,0.28);"></div>'
            +'<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text-muted);margin-top:1px;"><span>'+lo+'</span>'+mid+'<span>'+hi+'</span></div>'; }
        let h=el.querySelector('.gx-note'); if(!h){ h=document.createElement('div'); h.className='gx-note'; h.style.cssText='font-size:9.5px;color:var(--text-muted);margin-top:4px;line-height:1.35;'; el.appendChild(h);} h.textContent=gxNote(L); } }catch(_){} }
    function toggle(L,on){ state[L.id]=on;
      const apply=()=>{ if(!ensure(L)){ GE().events.once('idle',apply); return; }
        try{ GE().layers.setLayout(layId(L),'visibility',on?'visible':'none'); }catch(_){}
        if(on){ legendNote(L); try{ window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){} }
        else { try{ window._hideGenericLegend&&window._hideGenericLegend('gx-'+L.id); }catch(_){} } };
      apply();
      if(on) [400,1500].forEach(ms=>setTimeout(apply,ms)); }
    GE().events.on('styledata',()=>{ if(LIST.some(L=>state[L.id])) setTimeout(()=>{ LIST.forEach(L=>{ if(state[L.id]&&ensure(L)){ try{ GE().layers.setLayout(layId(L),'visibility','visible'); }catch(_){} } }); },80); });
    /* ===== (#R120) GIBS PIXEL → PHYSICAL VALUE — the reverse of the legend: fetch the actual rendered tile
       (same URL the layer paints), read the pixel under the point, project its colour onto the layer's
       colormap gradient (the SCALES stops were sampled from the REAL GIBS colormap XMLs in R42), and map the
       gradient position back onto the legend's value range. Transparent pixel = no data; a colour far from
       every gradient segment (coastlines, labels) = null, never a guess. Registered into IntMapLayers so
       Atlas's layerData / analyze read real numbers off every science raster. ===== */
    const _gxPix=new Map();
    async function _gxTilePix(L,lng,lat){ const z=Math.min(L.max,6), n=Math.pow(2,z);
      const xf=(lng+180)/360*n, latR=lat*Math.PI/180, yf=(1-Math.log(Math.tan(latR)+1/Math.cos(latR))/Math.PI)/2*n;
      const tx=Math.floor(xf), ty=Math.floor(yf); if(!(ty>=0&&ty<n)) return null;
      const px=Math.max(0,Math.min(255,Math.floor((xf-tx)*256))), py=Math.max(0,Math.min(255,Math.floor((yf-ty)*256)));
      const url='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/'+L.gibs+'/default/'+(L.staticDate||GDATE())+'/GoogleMapsCompatible_Level'+L.max+'/'+z+'/'+ty+'/'+tx+'.'+L.ext;
      let imgd=_gxPix.get(url);
      if(imgd===undefined){ imgd=await new Promise(res=>{ const im=new Image(); im.crossOrigin='anonymous';
          im.onload=()=>{ try{ const cv=document.createElement('canvas'); cv.width=cv.height=256; const cx=cv.getContext('2d',{willReadFrequently:true}); cx.drawImage(im,0,0); res(cx.getImageData(0,0,256,256)); }catch(_){ res(null); } };
          im.onerror=()=>res(null); im.src=url; });
        if(_gxPix.size>30) _gxPix.clear(); _gxPix.set(url,imgd); }
      if(!imgd) return null;
      const i=(py*256+px)*4; return [imgd.data[i],imgd.data[i+1],imgd.data[i+2],imgd.data[i+3]]; }
    function _gxFrac(sc,rgb){ const stops=sc.grad.split(',').map(hx=>{ const v=parseInt(hx.trim().slice(1),16); return [(v>>16)&255,(v>>8)&255,v&255]; });
      let bestT=null,bestD=Infinity;
      for(let s2=0;s2<stops.length-1;s2++){ const A2=stops[s2],B2=stops[s2+1];
        const ab=[B2[0]-A2[0],B2[1]-A2[1],B2[2]-A2[2]], ap=[rgb[0]-A2[0],rgb[1]-A2[1],rgb[2]-A2[2]];
        const den=ab[0]*ab[0]+ab[1]*ab[1]+ab[2]*ab[2]; let t=den>0?(ap[0]*ab[0]+ap[1]*ab[1]+ap[2]*ab[2])/den:0; t=Math.max(0,Math.min(1,t));
        const dx=ap[0]-ab[0]*t, dy=ap[1]-ab[1]*t, dz2=ap[2]-ab[2]*t, d2=dx*dx+dy*dy+dz2*dz2;
        if(d2<bestD){ bestD=d2; bestT=(s2+t)/(stops.length-1); } }
      return (bestD<=3600&&bestT!=null)?bestT:null; }   /* >60 RGB distance from every segment = not a data colour */
    async function sampleGx(L,lng,lat){ const sc=SCALES[L.id]; if(!sc) return null;
      const p=await _gxTilePix(L,lng,lat); if(!p||p[3]<40) return null;   /* transparent = no data at this point */
      const fr=_gxFrac(sc,p); if(fr==null) return null;
      const useF=(window.imUnitTemp==='f');
      if(sc.temp){ let v=sc.temp[0]+fr*(sc.temp[1]-sc.temp[0]); if(useF) v=v*9/5+32; return Math.round(v)+(useF?'°F':'°C'); }
      if(sc.anom){ let v=sc.anom[0]+fr*(sc.anom[1]-sc.anom[0]); if(useF) v=v*9/5; return (v>0?'+':'')+v.toFixed(1)+(useF?'°F':'°C'); }
      if(L.id==='gxaero') return (fr*5).toFixed(1)+' AI';
      if(sc.lo!=null&&/%$/.test(String(sc.hi))) return Math.round(fr*100)+'%';
      if(sc.loK) return Math.round(fr*100)+'% ('+_lx(sc.loK)+' → '+_lx(sc.hiK)+')';
      return Math.round(fr*100)+'%'; }
    try{ if(window.IntMapLayers){ LIST.forEach(L=>{ if(!SCALES[L.id]) return;
      window.IntMapLayers.register('gx-'+L.id,{ on:()=>!!state[L.id], label:()=>gxLbl(L),
        sampleAt:(x,y)=>sampleGx(L,x,y), time:()=>(L.staticDate||GDATE()), source:()=>'NASA GIBS · '+L.gibs }); }); } }catch(_){}
    function buildUI(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('gx-gxlst')) return;
      LIST.forEach(L=>{ const w=document.createElement('div'); w.className='lyr-row'; w.id='lyrrow-'+L.id;
        const lab=document.createElement('label'); lab.className='layer-option';
        const cb=document.createElement('input'); cb.type='checkbox'; cb.id='gx-'+L.id;
        const swp=document.createElement('span'); swp.className='lyr-sw'; swp.style.background=L.sw;
        const sp=document.createElement('span'); sp.id='gx-'+L.id+'-lbl'; sp.textContent=gxLbl(L);
        lab.appendChild(cb); lab.appendChild(document.createTextNode(' ')); lab.appendChild(swp); lab.appendChild(document.createTextNode(' ')); lab.appendChild(sp);
        w.appendChild(lab); dd.appendChild(w);
        cb.addEventListener('change',e=>{ w.classList.toggle('on',e.target.checked); toggle(L,e.target.checked); }); });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    window.addEventListener('intmap-lang',()=>{ LIST.forEach(L=>{ const s=document.getElementById('gx-'+L.id+'-lbl'); if(s) s.textContent=gxLbl(L); }); });
    if(document.readyState!=='loading') setTimeout(buildUI,800); else document.addEventListener('DOMContentLoaded',()=>setTimeout(buildUI,800));
  })();
};
