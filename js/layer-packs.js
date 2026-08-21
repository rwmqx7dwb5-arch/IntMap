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
 *
 *  ⚠ (#R254) THE DATA-CENTER LAYER IS IMPORTED HERE, NOT FROM src/main.js. `betaPack2`'s `dcToggle`
 *  delegates to js/datacenters.js and instantiates it below, so the dependency belongs beside the
 *  consumer — and the shell (index.html + src/main.js + js/app-body.js + …) is BUDGETED at 8,200
 *  lines by tests/r168 #8. Routing the import and the instantiation through the shell cost it seven
 *  lines and tripped that budget, which is the tripwire doing its job: the shell is not where a
 *  module's dependencies go. Nothing about load order is lost — an ES import is hoisted, so
 *  `window.IntMapModules.dataCenters` exists before this file's body runs.
 * ==========================================================================*/
import './datacenters.js';
/* (#R255) …and the four surveyed-facility layers (js/osm-facilities.js), for the same reason: the
   shell's line budget is a real check (tests/r168 #8) and an import belongs beside a consumer
   rather than in src/main.js. This file is where the extra layer rows those four sit beside live. */
import './osm-facilities.js';
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
    /* ══ (#R268) …AND ITS TWO EPOCHS ══════════════════════════════════════════════════════════════
       「年を変えることに意味があるレイヤーは一つ残らずすべて、変えられるようにしろ。」 ESA WorldCover
       exists as v100 (2020) and v200 (2021) and the layer was pinned to 2021 with no way to ask for
       the other. Both layer names were read out of Terrascope's own «Invalid LAYER parameter» reply,
       which lists every layer it serves, and both were fetched as tiles before being written here —
       `esa-worldcover-map-10m-2020-v1_map` answers 200 image/png with TIME=2020-01-01. */
    const WC_EPOCHS=[['2021','esa-worldcover-map-10m-2021-v2_map','2021-01-01'],
                     ['2020','esa-worldcover-map-10m-2020-v1_map','2020-01-01']];
    let wcYear='2021';
    const wcTiles=()=>{ const e=WC_EPOCHS.find(x=>x[0]===wcYear)||WC_EPOCHS[0];
      return ['https://wmts.terrascope.be/?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER='+e[1]
        +'&STYLE=default&TILEMATRIXSET=EPSG:3857&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png&TIME='+e[2]]; };
    function wcSetYear(y){ if(!WC_EPOCHS.some(e=>e[0]===y)) return wcYear;
      wcYear=y;
      try{ if(GE().layers.hasSource('eco-worldcover')) GE().layers.setSourceTiles('eco-worldcover',wcTiles()); }catch(_){}
      try{ wcLegend(state.worldcover); }catch(_){}
      return wcYear; }
    /* ---- ESA WorldCover (raster) ---- */
    function ensureRaster(){ if(GE().layers.hasSource('eco-worldcover')) return true; if(!_imCanDraw()) return false;
      /* (#R18) maxzoom 13→14: ESA WorldCover is 10 m/px (≈ native z14), so this keeps the classes crisp one
         zoom deeper instead of upscaling a z13 tile ("画質も高めて"). At normal regional zooms the tile
         count is unchanged (maxzoom only bites when zoomed right in), so it doesn't slow the common case;
         the SW (R17) caches every Terrascope tile so revisits are instant — the controllable speed win on a
         single slow host. */
      try{ GE().layers.addSource('eco-worldcover',{type:'raster',tiles:wcTiles(),tileSize:256,maxzoom:14,attribution:'ESA WorldCover · Terrascope'});
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
       Draggable + minimisable like every other legend; the × unchecks the layer. */
    const WC_CLASSES=[['#006400',LA('Tree cover','樹木','Baumbestand','Древесный покров','Cubierta arbórea')],['#ffbb22',LA('Shrubland','低木地','Strauchland','Кустарники','Matorral')],['#ffff4c',LA('Grassland','草地','Grasland','Травяные земли','Pastizal')],
      ['#f096ff',LA('Cropland','農地','Ackerland','Пашня','Cultivos')],['#fa0000',LA('Built-up','市街地','Bebauung','Застройка','Zona urbanizada')],['#b4b4b4',LA('Bare / sparse vegetation','裸地・希少植生','Kahl / spärliche Vegetation','Оголённая / разреженная растительность','Suelo desnudo / vegetación escasa')],
      ['#f0f0f0',LA('Snow and ice','雪氷','Schnee und Eis','Снег и лёд','Nieve y hielo')],['#0064c8',LA('Permanent water bodies','水域','Dauerhafte Gewässer','Постоянные водоёмы','Masas de agua permanentes')],['#0096a0',LA('Herbaceous wetland','湿地（草本）','Krautiges Feuchtgebiet','Травянистые водно-болотные угодья','Humedal herbáceo')],
      ['#00cf75',LA('Mangroves','マングローブ','Mangroven','Мангры','Manglares')],['#fae6a0',LA('Moss and lichen','苔・地衣類','Moos und Flechten','Мхи и лишайники','Musgos y líquenes')]];
    function wcLegend(show){
      let lg=document.getElementById('data-legend-worldcover');
      if(show){
        if(!lg){ lg=document.createElement('div'); lg.className='data-legend'; lg.id='data-legend-worldcover'; lg.style.bottom='140px';
          (document.getElementById('map-container')||document.body).appendChild(lg); }
        const dragT=window.IntMapLang.t(HOST.lang,"Drag to move","ドラッグして移動","Zum Verschieben ziehen","Потяните, чтобы переместить","Arrastre para mover");
        lg.innerHTML='<span class="dl-drag" title="'+dragT+'">⋮⋮</span><button class="layer-popup-x" title="'+(t('close'))+'">×</button>'+
          /* (#R268) the year is chosen, so it is no longer baked into the title */
          '<h4>'+(window.IntMapLang.t(HOST.lang,"Land cover (ESA)","土地被覆 (ESA)","Landbedeckung (ESA)","Земной покров (ESA)","Cobertura del suelo (ESA)"))+'</h4>'+
          '<div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:10.5px;color:var(--text-muted);"><span>'
            +(window.IntMapLang.t(HOST.lang,'Year','年','Jahr','Год','Año'))+'</span>'
            +'<select class="wc-year" style="flex:1;padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px;">'
            +WC_EPOCHS.map(e=>'<option value="'+e[0]+'"'+(e[0]===wcYear?' selected':'')+'>'+e[0]+'</option>').join('')+'</select></div>'+
          '<div style="display:flex;flex-direction:column;gap:3px;margin-top:4px;">'+
          /* ⚠ (#R251) the two name slots are ONE tuple now, resolved through pick() itself, so a
             language past the five arguments reaches the inline table instead of falling to English. */
          WC_CLASSES.map(([c,t])=>'<div style="display:flex;align-items:center;gap:7px;"><span style="width:13px;height:13px;border-radius:3px;flex:none;border:1px solid rgba(128,128,128,0.4);background:'+c+';"></span><span>'+LPK.arr(t)+'</span></div>').join('')+
          '</div>';
        lg.style.display='block';
        lg.querySelector('.layer-popup-x').onclick=()=>{ const cb=document.getElementById('eco-dl-worldcover'); if(cb){ cb.checked=false; cb.dispatchEvent(new Event('change')); } };
        { const ys=lg.querySelector('.wc-year'); if(ys) ys.onchange=()=>wcSetYear(ys.value); }
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
    /* (#R254) the data-center table left this file with the layer — js/datacenters.js. What was
       here was 73 rows of [lng, lat, name, kind]; the module that replaced it carries the operator,
       the region code, the published capacity and commissioning year, the source, and OpenStreetMap.
       `load('dc')` below asks that module for its curated FeatureCollection, so js/compare.js keeps
       drawing the SAME table in its second map rather than a second copy of it. */
    const PH=[
      [7.59,47.56,'Basel — Novartis / Roche HQ & plants'],[6.99,51.03,'Leverkusen — Bayer'],[8.06,49.97,'Ingelheim — Boehringer Ingelheim'],[12.45,55.76,'Copenhagen — Novo Nordisk'],[11.09,55.68,'Kalundborg — Novo Nordisk API site'],[-0.31,51.48,'London/Brentford — GSK'],[0.13,52.2,'Cambridge — AstraZeneca'],[2.35,48.86,'Paris — Sanofi'],[-86.16,39.77,'Indianapolis — Eli Lilly'],[-74.45,40.49,'New Brunswick — Johnson & Johnson'],[-73.97,40.75,'New York — Pfizer HQ'],[-74.29,40.68,'Rahway/Kenilworth — Merck & Co.'],[-87.86,42.33,'North Chicago — AbbVie'],[-118.84,34.18,'Thousand Oaks — Amgen'],[-122.4,37.65,'South San Francisco — Genentech'],[-8.47,51.9,'Cork — Irish pharma cluster'],[103.64,1.32,'Singapore Tuas — biologics plants'],[78.6,17.6,'Hyderabad — Genome Valley (vaccines)'],[72.88,19.08,'Mumbai — Sun Pharma'],[72.57,23.02,'Ahmedabad — Zydus / Torrent'],[83.3,17.69,'Visakhapatnam — API hub'],[-66.54,18.45,'Barceloneta — Puerto Rico pharma'],[139.76,35.68,'Tokyo — Takeda / Astellas'],[135.5,34.69,'Osaka — Shionogi / Takeda'],[116.4,39.9,'Beijing — Sinopharm'],[121.47,31.23,'Shanghai — Fosun Pharma'],[126.64,37.39,'Songdo — Samsung Biologics'],[34.89,32.09,'Petah Tikva — Teva'],[-46.63,-23.55,'São Paulo — EMS / Eurofarma'],[28.05,-26.2,'Johannesburg — Aspen Pharmacare']
    ];
    /* ⚠ (#R266) 1520 AND 1524 ARE TWO GAUGES, AND THE MAP NOW SAYS SO. 「ロシア軌間 1520/1524mm の
       この二つの軌間を区別して描画して。」 — _rail_convert.py had Finland in the 1520 list with the
       comment «FIN 1524 ~ Russian family», i.e. the difference was known and then thrown away. They
       are 4 mm apart, which is why through running works at all, but they are not the same standard:
       1524 mm (5 ft) is what the Grand Duchy was built to and what Finland still maintains, and
       1520 mm is the Soviet 1970s re-standardisation everything east of it was converted to.
       The colour stays in the same red family so the relationship is still visible at a glance. */
    const RAIL_COL={1435:'#3a7bd5',1520:'#e03131',1524:'#f08080',1067:'#2f9e44',1000:'#12b886',1676:'#9c36b5',1668:'#f08c00',1600:'#d6336c',0:'#868e96'};
    const RAIL_LBL=[[1435,LA('Standard 1435 mm','標準軌 1435mm','Normalspur 1435 mm','Стандартная колея 1435 мм','Ancho estándar 1435 mm')],[1520,LA('Russian 1520 mm','ロシア軌間 1520mm','Russische Breitspur 1520 mm','Русская колея 1520 мм','Ancho ruso 1520 mm')],[1524,LA('Finnish 1524 mm','フィンランド軌間 1524mm','Finnische Breitspur 1524 mm','Финская колея 1524 мм','Ancho finlandés 1524 mm')],[1676,LA('Broad 1676 mm (India, Argentina)','広軌 1676mm（印・亜）','Breitspur 1676 mm (Indien, Argentinien)','Широкая колея 1676 мм (Индия, Аргентина)','Ancho 1676 mm (India, Argentina)')],[1668,LA('Iberian 1668 mm','イベリア軌間 1668mm','Iberische Spur 1668 mm','Иберийская колея 1668 мм','Ancho ibérico 1668 mm')],[1600,LA('Irish 1600 mm','アイルランド軌間 1600mm','Irische Spur 1600 mm','Ирландская колея 1600 мм','Ancho irlandés 1600 mm')],[1067,LA('Cape 1067 mm (Japan etc.)','狭軌 1067mm（日本など）','Kapspur 1067 mm (Japan usw.)','Капская колея 1067 мм (Япония и др.)','Ancho Cape 1067 mm (Japón, etc.)')],[1000,LA('Meter 1000 mm','メーターゲージ 1000mm','Meterspur 1000 mm','Метровая колея 1000 мм','Ancho métrico 1000 mm')],[0,LA('Unknown / other','不明・その他','Unbekannt / sonstige','Неизвестно / прочее','Desconocido / otro')]];
    function fcPoints(arr,colFn){ return {type:'FeatureCollection',features:arr.map(d=>({type:'Feature',geometry:{type:'Point',coordinates:[d[0],d[1]]},properties:{n:d[2],k:d[3]||'',col:colFn(d)}}))}; }
    function load(key,cb){
      if(cache[key]){ cb(cache[key]); return; }
      if(key==='dc'){ const M=window.IntMapDataCenters; if(!M||!M.features) return;   /* (#R254) one table, in js/datacenters.js */
        cache.dc=M.features(); cb(cache.dc); }
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
    /* ══ ⚠ (#R254) THE DATA-CENTER LAYER MOVED OUT — THIS IS THE ROW, NOT THE LAYER ═════════════════
       「データセンター、AIインフラレイヤーを爆発的に強化し、クリックすれば詳細情報まで見れるように。」
       What lived here was a 73-entry array of `[lng, lat, name, kind]` painted as flat dots with a
       two-line popup. The layer is now js/datacenters.js — a curated table with operator / region
       code / capacity / commissioning year / source per entry, OpenStreetMap's own 4,703 surveyed
       data centres for the current view, and a detail card behind the click. The layer IDS are
       unchanged (`dc-pt` / `dc-lbl`), because the session restore, the opacity registration and
       Atlas's `beta-dl-dc` mapping all name them.
       ⚠ IF THE MODULE IS ABSENT THIS SAYS SO rather than silently drawing nothing — the shape this
       project keeps paying for is a toggle that looks alive and does nothing. */
    function dcToggle(on){ state.dc=on;
      const DCM=window.IntMapDataCenters;
      if(!DCM||!DCM.toggle){ try{ console.warn('IntMapDataCenters is not loaded — the data-center layer cannot draw'); }catch(_){} return; }
      DCM.toggle(on);
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity('dc2',LA('Data centers & AI infra','データセンター・AIインフラ','Rechenzentren & KI-Infrastruktur','Дата-центры и ИИ-инфраструктура','Centros de datos e infraestructura de IA'),['dc-pt','dc-lbl'],'beta-dl-dc');
            if(el&&!el.querySelector('.dc-key')){ const k=document.createElement('div'); k.className='dc-key'; k.style.cssText='display:flex;flex-direction:column;gap:4px;margin-top:6px;font-size:11px;color:var(--text-main);';
              /* the key is asked of the layer, so a colour cannot be right in one place and wrong here.
                 (#R258) each row is a SWITCH for its own class — see IntMapDataCenters.toggleKey. */
              k.innerHTML=DCM.key().map(([c,l,id])=>'<button type="button" class="dc-keyrow" data-k="'+(id||'')+'" style="display:flex;align-items:center;gap:7px;border:none;background:none;color:inherit;font:inherit;padding:1px 0;cursor:pointer;text-align:left;"><span style="width:11px;height:11px;border-radius:6px;flex:none;background:'+c+';"></span>'+l+'</button>').join('')
                +'<div style="font-size:10px;color:var(--text-muted);margin-top:4px;line-height:1.5;">'
                +window.IntMapLang.t(HOST.lang,
                  'Published cloud regions, AI campuses, carrier hotels and TOP500 sites, plus every data centre mapped in OpenStreetMap for the current view (zoom in past z6). Click any point for the full record.',
                  '公表されているクラウドリージョン・AI拠点・接続拠点・TOP500施設に加え、表示範囲の OpenStreetMap に登録された全データセンター（z6 以上で取得）。点をクリックすると詳細が出ます。',
                  'Veröffentlichte Cloud-Regionen, KI-Campus, Carrier-Hotels und TOP500-Standorte plus alle in OpenStreetMap erfassten Rechenzentren im Ausschnitt (ab z6). Punkt anklicken für den vollen Datensatz.',
                  'Опубликованные облачные регионы, ИИ-кампусы, точки обмена и объекты TOP500, плюс все дата-центры OpenStreetMap в текущем виде (от z6). Нажмите точку для полной карточки.',
                  'Regiones de nube publicadas, campus de IA, hoteles de operadores y sitios TOP500, más todos los centros de datos de OpenStreetMap en la vista (desde z6). Haga clic en un punto para la ficha completa.')
                +'</div>';
              el.appendChild(k);
              /* (#R258) the row is a class switch; a switched-off class is dimmed rather than removed,
                 so the reader can always see what has been taken off the map */
              k.querySelectorAll('.dc-keyrow').forEach(b=>{ const id=b.getAttribute('data-k'); if(!id) return;
                b.onclick=()=>{ let on2=true; try{ on2=DCM.toggleKey(id); }catch(_){}
                  b.style.opacity=on2?'1':'0.38'; b.style.textDecoration=on2?'':'line-through'; }; }); }
            /* ══ (#R265) 「表示範囲内のものを表示する機能はいらない」 — AND THE SUMMARY IS GONE ══════
               #R261 gave this layer an in-view readout and #R264 moved it into this row. This round
               it is deleted outright (js/datacenters.js). What stays in this row is what the row was
               for: the colour key, and #R258's per-class SWITCHES — the filter is unaffected. */ }
           else { if(!on){ if(window._hideGenericLegend) window._hideGenericLegend('dc2'); } } }catch(_){}
    }
    function phToggle(on){ state.pharma=on;
      const a=()=>{ if(!ptEnsure('pharma','ph-src',['ph-pt','ph-lbl'])){ GE().events.once('idle',a); return; }
        load('pharma',fc=>{ try{ GE().layers.setSourceData('ph-src',fc); }catch(_){} }); setVis(['ph-pt','ph-lbl'],on); };
      a();
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity('ph2',LA('Pharma manufacturing hubs','製薬・医薬品製造拠点','Pharma-Produktionsstandorte','Центры фармацевтического производства','Centros de fabricación farmacéutica'),['ph-pt','ph-lbl'],'beta-dl-pharma');
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
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity('rail2',LA('World railways (by gauge)','世界の鉄道（軌間別）','Eisenbahnen weltweit (nach Spurweite)','Железные дороги мира (по колее)','Ferrocarriles del mundo (por ancho de vía)'),['rail-ln'],'beta-dl-rail');
            if(el&&!el.querySelector('.rail-key')){ const k=document.createElement('div'); k.className='rail-key'; k.style.cssText='display:flex;flex-direction:column;gap:3px;margin-top:6px;font-size:11px;color:var(--text-main);';
              /* ⚠ (#R251) …and the gauge rows were `[gauge, ja, en]` — ENGLISH IN SLOT 2, so the
                 inline table (keyed by the English source string) could not have matched even after
                 the languages were added. The tuple is English-first and resolved by pick(). */
              k.innerHTML=RAIL_LBL.map(([g,t])=>'<div style="display:flex;align-items:center;gap:7px;"><span style="width:14px;height:3px;border-radius:2px;flex:none;background:'+RAIL_COL[g]+';"></span>'+LPK.arr(t)+'</div>').join('')+
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
        nm:LA('Corruption (control, WGI)','汚職・腐敗指標（世界銀行WGI）','Korruptionskontrolle (WGI)','Контроль коррупции (WGI)','Control de la corrupción (WGI)'),
        note:()=>window.IntMapLang.t(HOST.lang,"World Bank WGI “Control of Corruption” score (0–100, higher = cleaner) — the open-API counterpart of TI’s CPI.","世界銀行ガバナンス指標「腐敗の統制」スコア（0–100、高い=クリーン）。TIのCPIに相当する公開API系指標。","Weltbank-WGI-Wert „Korruptionskontrolle“ (0–100, höher = sauberer) — das Open-API-Gegenstück zum CPI von TI.","Показатель Всемирного банка WGI «Контроль коррупции» (0–100, выше = чище) — аналог CPI от TI с открытым API.","Puntuación WGI del Banco Mundial «Control de la corrupción» (0–100, más alto = más limpio): el equivalente con API abierta al IPC de TI.")},
      lifeexp:{ind:'SP.DYN.LE00.IN',date:'2022',q:'',ids:['wb-le-f','wb-le-l'],src:'wb-le',
        ramp:['interpolate',['linear'],['get','s'],52,'#a50026',62,'#f46d43',70,'#fee08b',78,'#74add1',85,'#313695'],
        score:v=>v,
        nm:LA('Life expectancy (years)','平均寿命（年）','Lebenserwartung (Jahre)','Ожидаемая продолжительность жизни (лет)','Esperanza de vida (años)'),
        note:()=>window.IntMapLang.t(HOST.lang,"Life expectancy at birth (World Bank, 2022).","出生時平均余命（世界銀行 2022）。","Lebenserwartung bei Geburt (Weltbank, 2022).","Ожидаемая продолжительность жизни при рождении (Всемирный банк, 2022).","Esperanza de vida al nacer (Banco Mundial, 2022).")},
      /* (#R22) New beta choropleths — all live World Bank, keyless + CORS, latest value per country. */
      unemp:{ind:'SL.UEM.TOTL.ZS',date:'',q:'&mrnev=1',ids:['wb-unemp-f','wb-unemp-l'],src:'wb-unemp',
        ramp:['interpolate',['linear'],['get','s'],2,'#1a9850',5,'#a6d96a',9,'#fee08b',15,'#f46d43',25,'#a50026'],
        score:v=>v, fmt:v=>(+v).toFixed(1)+'%',
        nm:LA('Unemployment rate (%)','失業率（%）','Arbeitslosenquote (%)','Уровень безработицы (%)','Tasa de desempleo (%)'),
        note:()=>window.IntMapLang.t(HOST.lang,"Unemployment, total (% of labor force; modeled ILO / World Bank, latest year).","失業率（労働力人口比、ILO推計・世界銀行、最新年）。","Arbeitslosenquote insgesamt (% der Erwerbsbevölkerung; ILO-Modellrechnung / Weltbank, letztes Jahr).","Уровень безработицы, всего (% рабочей силы; модель МОТ / Всемирный банк, последний год).","Desempleo total (% de la población activa; estimación modelada OIT / Banco Mundial, último año).")},
      internet:{ind:'IT.NET.USER.ZS',date:'',q:'&mrnev=1',ids:['wb-internet-f','wb-internet-l'],src:'wb-internet',
        ramp:['interpolate',['linear'],['get','s'],10,'#a50026',30,'#f46d43',55,'#fee08b',75,'#74c476',95,'#1a9850'],
        score:v=>v, fmt:v=>(+v).toFixed(1)+'%',
        nm:LA('Internet users (%)','インターネット普及率（%）','Internetnutzer (%)','Пользователи интернета (%)','Usuarios de internet (%)'),
        note:()=>window.IntMapLang.t(HOST.lang,"Individuals using the Internet (% of population; World Bank, latest year).","人口に占めるインターネット利用者の割合（世界銀行、最新年）。","Internetnutzer (% der Bevölkerung; Weltbank, letztes Jahr).","Пользователи интернета (% населения; Всемирный банк, последний год).","Personas que usan Internet (% de la población; Banco Mundial, último año).")},
      precip:{ind:'AG.LND.PRCP.MM',date:'',q:'&mrnev=1',ids:['wb-precip-f','wb-precip-l'],src:'wb-precip',
        ramp:['interpolate',['linear'],['get','s'],100,'#f6e8c3',400,'#c7eae5',800,'#80cdc1',1500,'#35978f',2800,'#01665e'],
        score:v=>v, fmt:v=>Math.round(v)+' mm',
        nm:LA('Annual precipitation (mm)','年降水量（mm）','Jahresniederschlag (mm)','Годовое количество осадков (мм)','Precipitación anual (mm)'),
        note:()=>window.IntMapLang.t(HOST.lang,"Average annual precipitation (depth in mm, long-term; World Bank).","年間平均降水量（深さmm、長期平均・世界銀行）。","Durchschnittlicher Jahresniederschlag (Höhe in mm, langjährig; Weltbank).","Среднегодовое количество осадков (в мм, многолетнее; Всемирный банк).","Precipitación media anual (altura en mm, a largo plazo; Banco Mundial).")}};
    /* ══ (#R266) THESE FIVE ALSO PAINT ONE YEAR AT A TIME ══════════════════════════════════════════
       「その他、年を変えることに意味があるレイヤーは一つ残らずすべて、変えられるようにしろ。」 — and this
       family is the OTHER World-Bank family in the app (corruption / life expectancy / unemployment /
       internet / annual precipitation). Two of them had a year HARD-CODED in the table (`date:'2023'`,
       `date:'2022'`) and the other three asked for `mrnev=1`, so the reader could not move any of
       them. The series itself comes from js/wb-layers.js's `window.IntMapWB.series` — the same fetch,
       the same cache, one network path for the whole app — and `date`/`q` stay in the table only as
       the fallback for a build that somehow runs before that module is up.
       ⚠ THE SOURCE IS BUILT ONCE AND THEN RE-FED. `build()` used to early-return the moment the
       source existed, which is correct for «turn it back on» and wrong for «show me 2010»: the year
       change has to reach `setSourceData`, or the picker moves and the map does not. */
    const wbYr={};
    function wbToggle(key,on){ state[key]=on; const W=WB[key];
      const show=()=>setVis(W.ids,on);
      if(!on){ show(); try{ window._hideGenericLegend&&window._hideGenericLegend('wb-'+key); }catch(_){} return; }
      const build=async()=>{
        if(!_imCanDraw()){ GE().events.once('idle',build); return; }
        const S=await (async()=>{ try{ if(window.IntMapWB&&window.IntMapWB.series) return await window.IntMapWB.series(W.ind); }catch(_){} return null; })();
        const year=(wbYr[key]!==undefined)?wbYr[key]:((S&&S.best)||'');
        let vals=null;
        if(S&&year&&S.by[year]){ vals={}; const row=S.by[year]; Object.keys(row).forEach(k2=>{ if(k2&&k2.length===3) vals[k2]=row[k2]; }); }
        else if(S){ vals={}; const m=(window.IntMapWB&&window.IntMapWB.get(W.ind))||{}; Object.keys(m).forEach(k2=>{ if(k2&&k2.length===3) vals[k2]=m[k2].v; }); }
        if(!vals||!Object.keys(vals).length){
          /* the pre-#R266 single-year read, kept as the fallback for a build that beats wbLayers up */
          vals=cache['wb_'+key];
          if(!vals){ vals={};
            try{ const r=await fetch('https://api.worldbank.org/v2/country/all/indicator/'+W.ind+'?format=json&per_page=400'+(W.date?('&date='+W.date):'')+(W.q||''));
              const j=await r.json(); (j&&j[1]||[]).forEach(row=>{ if(row&&row.value!=null){ const iso=row.countryiso3code||(row.country&&row.country.id); if(iso&&iso.length===3) vals[iso]=+row.value; } });
            }catch(_){}
            if(!Object.keys(vals).length){ try{ imToast(window.IntMapLang.t(HOST.lang,"Could not load the data","データを取得できませんでした","Daten konnten nicht geladen werden","Не удалось загрузить данные","No se pudieron cargar los datos")); }catch(_){} return; }
            cache['wb_'+key]=vals;
          }
        }
        wbYr[key]=year;
        if(GE().layers.hasSource(W.src)){
          try{ const g=HOST.countryGeo; if(g&&g.features) GE().layers.setSourceData(W.src,{type:'FeatureCollection',
            features:g.features.filter(f=>f.id!=null&&vals[f.id]!=null).map(f=>({type:'Feature',geometry:f.geometry,properties:{s:W.score(vals[f.id]),raw:vals[f.id],iso:f.id}}))}); }catch(_){}
          show(); legend(S,year); return; }
        try{
          /* ══ ⚠⚠ (#R254) …AND THIS FAMILY MAKES ITS OWN COPY OF THE BORDERS ═══════════════════════
             「以下のレイヤーは国境線が雑い（…汚職・腐敗指標…）。勝手に解像度の低い国境線に変えるな。」
             These five choropleths do not use the shared `countries` source; each builds a GeoJSON of
             its own out of `HOST.countryGeo.features` and hands it to the renderer ONCE (the
             `hasSource` early-return above means it is never rebuilt). js/countries-ui.js boots on
             Natural Earth 110 m and REPLACES `countryGeo` with the 10 m collection 4-15 s later, so
             whichever of the two happened to be in place at the moment the reader ticked the row is
             the border this layer keeps for the whole session — measured, Japan at 65 vertices
             against 6,952.
             The build takes whatever is current, and then WATCHES for the replacement: `countryGeo`
             is a new OBJECT when the fine one lands (countries-ui assigns, it does not mutate), so
             identity is the signal — no new global, no second copy of the timing rules. */
          const geoOf=()=>HOST.countryGeo;
          let usedGeo=geoOf();
          const featsFrom=(g)=>g.features.filter(f=>f.id!=null&&vals[f.id]!=null).map(f=>({type:'Feature',geometry:f.geometry,properties:{s:W.score(vals[f.id]),raw:vals[f.id],iso:f.id}}));
          const feats=featsFrom(usedGeo);
          (function watchHiRes(n){ n=n||0;
            if(geoOf()!==usedGeo){ usedGeo=geoOf();
              try{ GE().layers.setSourceData(W.src,{type:'FeatureCollection',features:featsFrom(usedGeo)}); }catch(_){}
              return; }
            if(n<20) setTimeout(()=>watchHiRes(n+1),1500); })();
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
          show(); legend(S,year);
        }catch(_){}
      };
      /* ══ ⚠⚠ (#R254) THE BOX WAS THERE; THE LEGEND WAS NOT ═══════════════════════════════════════════
         「平均寿命レイヤーに凡例がない。（凡例自体はある）」 — exactly right, and the parenthesis is the
         whole diagnosis. MEASURED on the shipped build: `#data-legend-wb-lifeexp` exists and is
         displayed, and it contains a title, an opacity slider and the source sentence — and no colour
         scale at all (`querySelector('[style*=linear-gradient]')` → null). Every core choropleth beside
         it has one (`data-legend-hdi` prints 0.45 → 0.95 under its ramp), so a country painted blue
         answers nothing here: there is no way to read a colour back into a number.
         ⚠ THE SCALE IS GENERATED FROM THE LAYER'S OWN `ramp`, never typed a second time. `W.ramp` is
         the renderer expression `['interpolate',['linear'],['get','s'], v,c, v,c …]`; the pairs after
         index 3 ARE the legend, so the two cannot drift apart. All five layers in this family get it
         (corruption / life expectancy / unemployment / internet / precipitation) — the reader named
         one, but they are one mechanism and the other four were equally blind. */
      function rampKey(){
        const st=[]; try{ for(let i=3;i+1<W.ramp.length;i+=2) st.push([W.ramp[i],W.ramp[i+1]]); }catch(_){}
        if(st.length<2) return null;
        const grad=st.map((s,i)=>s[1]+' '+(i/(st.length-1)*100).toFixed(1)+'%').join(',');
        const num=(v)=>{ try{ return W.fmt?W.fmt(v):String(Math.round(v*10)/10); }catch(_){ return String(v); } };
        const d=document.createElement('div'); d.className='wb-key'; d.style.cssText='margin-top:6px;';
        d.innerHTML='<div style="height:11px;border-radius:4px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:linear-gradient(90deg,'+grad+');"></div>'
          +'<div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-muted);margin-top:2px;">'
          +st.map(s=>'<span>'+esc(num(s[0]))+'</span>').join('')+'</div>'
          +'<div style="font-size:9.5px;color:var(--text-muted);margin-top:2px;display:flex;align-items:center;gap:5px;">'
          +'<span style="width:9px;height:9px;border-radius:2px;background:#9aa0a6;opacity:.55;flex:none;"></span>'
          +esc(window.IntMapLang.t(HOST.lang,'no data','データなし','keine Daten','нет данных','sin datos'))+'</div>';
        return d; }
      function legend(S,year){ try{ if(window._registerLayerOpacity){ const el=window._registerLayerOpacity('wb-'+key,[W.nm[0],W.nm[1]],W.ids,'beta-dl-'+key);
        if(el&&!el.querySelector('.wb-key')){ const k=rampKey(); if(k) el.appendChild(k); }
        /* (#R266) the year picker — same shape as the one on the js/wb-layers.js choropleths, built
           once and then only re-VALUED, so an open dropdown is not torn out from under the finger */
        if(el&&S&&S.years&&S.years.length){ let yr=el.querySelector('.wb-yearrow');
          if(!yr){ yr=document.createElement('div'); yr.className='wb-yearrow'; yr.style.cssText='display:flex;align-items:center;gap:6px;margin-top:6px;font-size:10.5px;color:var(--text-muted);';
            yr.innerHTML='<span class="wb-yearlbl"></span><select class="wb-year" style="padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px;"></select>';
            el.appendChild(yr);
            yr.querySelector('.wb-year').addEventListener('change',(e)=>{ wbYr[key]=e.target.value; wbToggle(key,true); }); }
          yr.querySelector('.wb-yearlbl').textContent=window.IntMapLang.t(HOST.lang,'Year','年','Jahr','Год','Año');
          const sel=yr.querySelector('.wb-year');
          const latestTxt=window.IntMapLang.t(HOST.lang,'Latest per country','最新（国ごと）','Neuester je Land','Последний по стране','Más reciente por país');
          if(sel.getAttribute('data-built')!==String(S.years.length)){
            sel.innerHTML=S.years.slice().reverse().map(y=>'<option value="'+y+'">'+y+' ('+S.counts[y]+')</option>').join('')
              +'<option value="">'+esc(latestTxt)+'</option>';
            sel.setAttribute('data-built',String(S.years.length)); }
          sel.value=year||''; }
        let d=el&&el.querySelector('.wb-note'); if(el&&!d){ d=document.createElement('div'); d.className='wb-note'; d.style.cssText='font-size:10px;color:var(--text-muted);margin-top:5px;line-height:1.5;'; el.appendChild(d); }
        if(d) d.textContent=W.note()+((S&&year&&S.counts[year])?(' · '+year+(window.IntMapLang.t(HOST.lang,' · ','・',' · ',' · ',' · '))+S.counts[year]+(window.IntMapLang.t(HOST.lang,' countries reporting','か国が報告',' Länder mit Daten',' стран с данными',' países con datos'))):''); } }catch(_){} }
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
    const B2LBL={dc:LA('Data centers & AI infra','データセンター・AIインフラ','Rechenzentren & KI-Infrastruktur','Дата-центры и ИИ-инфраструктура','Centros de datos e infraestructura de IA'),pharma:LA('Pharma manufacturing hubs','製薬・医薬品製造拠点','Pharma-Produktionszentren','Центры фармпроизводства','Centros de fabricación farmacéutica'),lifeexp:LA('Life expectancy','平均寿命','Lebenserwartung','Продолжительность жизни','Esperanza de vida'),cpi:LA('Corruption indicator','汚職・腐敗指標','Korruptionsindex','Индекс коррупции','Indicador de corrupción'),rail:LA('World railways (by gauge)','世界の鉄道（軌間別）','Welt-Eisenbahnen (nach Spurweite)','Железные дороги мира (по колее)','Ferrocarriles del mundo (por ancho de vía)'),unemp:LA('Unemployment rate','失業率','Arbeitslosenquote','Уровень безработицы','Tasa de desempleo'),internet:LA('Internet penetration','インターネット普及率','Internetverbreitung','Проникновение интернета','Penetración de internet'),precip:LA('Annual precipitation (by country)','年降水量（国別平均）','Jahresniederschlag (nach Land)','Годовое количество осадков (по странам)','Precipitación anual (por país)'),spin:LA('Auto-rotate','自動回転','Automatisch drehen','Автовращение','Rotación automática')};
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
      /* (#R254) the data-center layer rebuilds itself — its module owns the source, the OSM half and the card */
      if(state.dc){ try{ window.IntMapDataCenters&&window.IntMapDataCenters.toggle(true); }catch(_){} }
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
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const loadCountryData=HOST.loadCountryData, countryStats=HOST.countryStats;
  (function(){
    if(!GE().hasRenderer()) return;
    const jp=()=>HOST.lang==='jp';
    /* ⚠ (#R248) THIS IIFE HAD NO LANGUAGE HELPER OF ITS OWN — declared at the TOP of the scope on
       purpose ([[intmap-recurring-lessons]] L: a binding added in the middle puts everything above
       it in the temporal dead zone). */
    const LPK=window.IntMapLang.pick(()=>HOST.lang);
    const LA=window.IntMapLang.pickArgs();
    const esc=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
    const before=()=>{ try{ return GE().layers.has('tool-poly')?'tool-poly':undefined; }catch(_){ return undefined; } };
    let pop=null;

    /* ══ ⚠⚠⚠ (#R266) THESE TWO LAYERS WERE TWO LISTS OF ISO CODES, TYPED BY HAND ══════════════════
       「宗教分布レイヤーはカトリック、プロテスタント、正教会を区別しろ。」
       「言語分布レイヤーはもっと正確に。表示言語数も増やして。」

       What was here: `christian:'USA CAN MEX BRA … GBR FRA DEU ITA … RUS UKR BLR …'`, one bucket for
       all of Christianity — so Poland, Russia and Sweden were literally the same colour — and
       sixteen languages assigned the same way. No share, no year, no source, and no way for a wrong
       country to be noticed by anything but a human reading the string.

       What is here now: data/religion.json and data/language.json, built by
       scripts/build-culture.mjs out of the CIA World Factbook's own «Religions» and «Languages»
       fields (a US Government work, public domain). 202 countries carry a religious composition and
       196 a linguistic one, each as a SHARE, so the map can colour by which group leads and the tap
       can print the whole composition with the Factbook's own sentence underneath it.

       ⚠ WHERE THE SOURCE DOES NOT SEPARATE THE DENOMINATIONS, NEITHER DOES THIS MAP. The United
       Kingdom's entry reads «Christian (includes Anglican, Roman Catholic, Presbyterian, Methodist)
       59.5%»; that is «Christian», not «Catholic», and the first version of the build read the
       Roman Catholic out of that list and painted the UK Catholic. Italy's «Christian 80.8%
       (overwhelmingly Roman Catholic …)» IS Catholic, because the source says overwhelmingly.
       ⚠ THE CATEGORY LIST IS DERIVED FROM THE DATA, NOT DECLARED. Which languages exist, and in
       what order, comes from counting the file — so a rebuild that adds a country adds its language
       to the legend without anyone editing a palette. */
    /* (#R268) `sikh` and `unspecified` are REAL buckets in data/religion.json (4 and 152 countries)
       and neither had a colour or a name, so both fell through to 「その他」 — two rows labelled the
       same thing in a composition that now draws a bar per row. */
    const REL_COL={catholic:'#4e79a7',protestant:'#7fb3d5',orthodox:'#2e5f8a',christian_other:'#a6c8e0',
      muslim:'#59a14f',hindu:'#e15759',buddhist:'#f0a93b',jewish:'#76b7b2',shinto:'#d4a5c8',
      sikh:'#e8913a',folk:'#b07d34',unaffiliated:'#9aa0a6',unspecified:'#bdc3c7',other:'#c9c9c9'};
    const REL_LBL={
      catholic:LA('Catholic','カトリック','Katholisch','Католицизм','Católica'),
      protestant:LA('Protestant','プロテスタント','Protestantisch','Протестантизм','Protestante'),
      orthodox:LA('Orthodox','正教会','Orthodoxes Christentum','Православие','Ortodoxa'),
      christian_other:LA('Christian (not separated)','キリスト教（宗派の内訳なし）','Christlich (nicht aufgeschlüsselt)','Христианство (без разделения)','Cristiana (sin desglose)'),
      muslim:LA('Islam','イスラム教','Islam','Ислам','Islam'),
      hindu:LA('Hinduism','ヒンドゥー教','Hinduismus','Индуизм','Hinduismo'),
      buddhist:LA('Buddhism','仏教','Buddhismus','Буддизм','Budismo'),
      jewish:LA('Judaism','ユダヤ教','Judentum','Иудаизм','Judaísmo'),
      shinto:LA('Shinto','神道','Shintō','Синто','Sintoísmo'),
      sikh:LA('Sikhism','シク教','Sikhismus','Сикхизм','Sijismo'),
      folk:LA('Folk & traditional','民族宗教・伝統宗教','Volks- & Naturreligionen','Народные религии','Religiones populares'),
      unaffiliated:LA('Unaffiliated','無宗教','Konfessionslos','Не относят себя','Sin filiación'),
      unspecified:LA('Unspecified / no answer','不明・無回答','Ohne Angabe','Не указано','Sin especificar'),
      other:LA('Other','その他','Sonstige','Прочие','Otras')};

    /* the legend palette for languages: ordered by how many countries a language leads, so the
       common ones get the hand-picked hues */
    const LPAL=['#4e79a7','#f28e2b','#59a14f','#e15759','#76b7b2','#edc948','#b07aa1','#ff9da7','#9c755f','#bab0ac',
      '#86bcb6','#d37295','#a0cbe8','#8cd17d','#e377c2','#79706e','#5254a3','#e7ba52','#31a354','#843c39',
      '#7b4173','#637939','#8c6d31','#ad494a','#a55194','#6b6ecf','#b5cf6b','#e7969c','#9c9ede','#cedb9c'];
    /* ══ ⚠⚠⚠ (#R271) A KEY WHOSE SWATCHES ARE NOT DISTINCT IS NOT A KEY — SECOND TIME ═════════════
       「凡例内はまだ単に「セルビア語」のまま」 (third report of this sentence: #R268, #R270, now)

       #R270 wrote that line about the four Yugoslav standards, took away their shared fill and gave
       each its own colour. MEASURED on the built site this round, with the layer on and the key
       open: **89 rows, 30 colours, and all thirty of them are shared by three languages.** The
       palette above was indexed `LPAL[i % LPAL.length]`, so rank 8, rank 38 and rank 68 are the
       same swatch — and the row a colour is READ by is the first one that uses it. Croatian is rank
       38, Italian is rank 8, so the brown Croatia is painted is labelled 「イタリア語」 in the key.
       #R270's own sentence, one level up: the palette was still doing the merging that the labels
       had stopped doing. Montenegro is the same story from the data side — the Factbook's leading
       language there IS Serbian (42.9 % against 37 % for Montenegrin), so the country is Serbian on
       the map, correctly; what was wrong was that the key could not tell you which Serbian.

       → THE PALETTE CONTINUES INSTEAD OF REPEATING. Past the hand-picked thirty the hue advances by
       the golden angle (137.508°, the arrangement that keeps successive values as far apart as a
       cycle allows) and the lightness/saturation pair rotates through three settings, so the 31st
       colour is not near the 1st. Uniqueness is not assumed: the builder keeps a set and nudges the
       lightness until the value has not been used, and the test asserts that every category in the
       layer's own order carries a different swatch. */
    const _hex2=(v)=>{ const n=Math.max(0,Math.min(255,Math.round(v))).toString(16); return n.length<2?('0'+n):n; };
    function _hsl(h,sp,lp){
      const s=sp/100, l=lp/100, c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs(((h/60)%2)-1)), m=l-c/2;
      const t=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
      return '#'+_hex2((t[0]+m)*255)+_hex2((t[1]+m)*255)+_hex2((t[2]+m)*255); }
    /* ══ ⚠⚠⚠ (#R273) THE SERBIAN FAMILY IS ONE HUE, ON PURPOSE ══════════════════════════
       「凡例内はまだ単に「セルビア語」のまま（追記：セルビア語系言語は似た色味にするように。ほとんど同じ色味に。）」

       MEASURED first, because this sentence has come back four times. On the built page with the
       layer on and the key open, the three standards ARE three rows with three names and three
       distinct swatches — #R268 split the names, #R270 split the fill, #R271 made all 89 unique.
       What they were NOT was recognisable as one family: Serbian came out #31a354 (green), Croatian
       #33d2e1 (cyan) and Bosnian #6b6ecf (blue-violet), i.e. as unrelated as English and Arabic,
       because a rank in the most-led order decided the hue and those ranks are 18, 38 and 25.

       → BCMS gets ONE HUE and separates by lightness alone: the map reads as one area at a glance
       and the key still answers which standard a given shade is. The colours are RESERVED before the
       generated palette runs, so nothing else can be handed the same value. */
    const FAM_BCMS={ sr:0, cnr:1, bs:2, hr:3, sh:4 };
    const FAM_COL=['#7b2e8e','#8f3fa3','#a453b7','#b96ccb','#cd88dd'];
    const _palCache={};
    function paletteOf(n){
      n=Math.max(0,n|0);
      if(_palCache[n]) return _palCache[n];
      const out=LPAL.slice(0,Math.min(n,LPAL.length));
      const seen=Object.create(null); out.forEach(c=>{ seen[c.toLowerCase()]=1; });
      FAM_COL.forEach(c=>{ seen[c.toLowerCase()]=1; });
      for(let i=out.length;i<n;i++){
        const h=Math.round((i*137.508)%360), k=(i-LPAL.length)%3;
        const sat=[58,40,74][k]; let lig=[44,64,54][k];
        let c=_hsl(h,sat,lig), guard=0;
        while(seen[c.toLowerCase()]&&guard<24){ lig=((lig+7-28)%44)+28; c=_hsl(h,sat,lig); guard++; }
        seen[c.toLowerCase()]=1; out.push(c); }
      return (_palCache[n]=out); }
    /* == ⚠⚠⚠ (#R268) THREE CODES WHERE `Intl.DisplayNames` IS WRONG, RISKY OR SILENT ===========
       「ユーゴスラビアの言語をすべてセルビア語 (ラテン文字)でまとめるのはやめろ。不正確なうえ名称も
         リスキー。」 MEASURED: `Intl.DisplayNames(['ja']).of('sh')` is 「セルビア語 (ラテン文字)」 and
       `.of('cnr')` is 「セルビア語 (モンテネグロ)」 — so even after scripts/build-culture.mjs stopped
       merging the four standards into `sh` (it does now), Montenegro would still have been labelled
       Serbian, and the joint standard would be labelled Serbian rather than Serbo-Croatian.
       `crp` is not in the CLDR list at all and came back as the raw string «crp».
       These three are named here; everything else stays with the platform, which is right about the
       other seventy-nine. */
    const LANG_FIX={
      sh:LA('Serbo-Croatian','セルビア・クロアチア語','Serbokroatisch','Сербскохорватский','Serbocroata'),
      cnr:LA('Montenegrin','モンテネグロ語','Montenegrinisch','Черногорский','Montenegrino'),
      crp:LA('Creoles & pidgins','クレオール語・ピジン語','Kreol- und Pidginsprachen','Креольские и пиджины','Criollos y pidgins'),
      /* ⚠ (#R268) …AND TWELVE THAT THE BROWSER SIMPLY HAS NO NAME FOR. MEASURED in the running page
         over all 102 codes the data carries: `Intl.DisplayNames` returns the CODE ITSELF for these
         twelve in EVERY one of the app's languages — Chromium ships the «modern» CLDR subset — and
         eleven of them are the LEADING language of a country (Kiribati, Nauru, Vanuatu, Palau, the
         Marshall Islands, Tuvalu, Papua New Guinea, Greenland, Bhutan, the Cook Islands, Niue), so
         the legend and the tap read 「gil」「na」「bi」 for those countries. Named here, so a small
         country's language is a word rather than a code. */
      ff:LA('Fula','フラ語','Fulfulde','Фула','Fulfulde'),
      rar:LA('Cook Islands Māori','クック諸島マオリ語','Cookinseln-Maori','Кукский маори','Maorí de las Islas Cook'),
      gil:LA('Gilbertese','キリバス語','Gilbertesisch','Кирибати','Gilbertés'),
      niu:LA('Niuean','ニウエ語','Niueanisch','Ниуэ','Niueano'),
      bi:LA('Bislama','ビスラマ語','Bislama (Vanuatu)','Бислама','bislama (Vanuatu)'),
      na:LA('Nauruan','ナウル語','Nauruisch','Науруанский','Nauruano'),
      pau:LA('Palauan','パラオ語','Palauisch','Палауский','Palauano'),
      mh:LA('Marshallese','マーシャル語','Marshallesisch','Маршалльский','Marshalés'),
      tvl:LA('Tuvaluan','ツバル語','Tuvaluisch','Тувалу','Tuvaluano'),
      tpi:LA('Tok Pisin','トク・ピシン語','Neumelanesisch','Ток-писин','tok pisin'),
      kl:LA('Greenlandic','グリーンランド語','Grönländisch','Гренландский','Groenlandés'),
      dz:LA('Dzongkha','ゾンカ語','Dzongkha (Bhutan)','Дзонг-кэ','dzongkha'),};
    const langName=(tag)=>{ if(LANG_FIX[tag]) return LPK.arr(LANG_FIX[tag]);
      let nm=null;
      try{ nm=new Intl.DisplayNames([window.IntMapLang.htmlTag(HOST.lang)],{type:'language'}).of(tag); }catch(_){}
      return (nm&&nm!==tag)?nm:tag; };
    /* ══ ⚠⚠⚠ (#R270) THE SHARED FILL IS WHAT KEPT THE KEY SAYING «SERBIAN» ═══════════════════════
       「凡例はまだ単に『セルビア語』のまま」 (confirmed: 色の凡例のこと).

       #R268 separated the NAMES — measured on the built page, the key really does carry
       「セルビア語」「クロアチア語」「ボスニア語」 as three rows — and kept ONE fill for all of them
       because 「塗は同じ色のままでいい」. That permission is what is being withdrawn here, and the
       reason is exactly what a colour key is FOR: with one fill, those three rows carry the SAME
       swatch, so the colour on the map has no name but the first row that happens to use it, and
       that row is 「セルビア語」 (it leads two countries; Croatian and Bosnian lead one each and sort
       19 and 32 places below it). Reading the map through the key, Croatia and Bosnia were still
       Serbian — the thing #R268 was told to stop saying, said by the palette instead of by the
       label. A key whose swatches are not distinct is not a key.
       → Each standard gets its own colour, so the legend answers the question it exists to answer.
       Nothing else changes: the names, the popup and the per-country data are #R268's. */

    const DATA={religion:null,language:null};
    const CFG={
      religion:{ file:'data/religion.json', ids:['cat-rel-f','cat-rel-l'], src:'cat-rel',
        nm:LA('Dominant religion','宗教分布（主流）','Vorherrschende Religion','Преобладающая религия','Religión predominante'),
        label:(k)=>LPK.arr(REL_LBL[k]||REL_LBL.other), col:(k)=>REL_COL[k]||REL_COL.other },
      language:{ file:'data/language.json', ids:['cat-lang-f','cat-lang-l'], src:'cat-lang',
        nm:LA('Primary language','言語分布（主要）','Vorherrschende Sprache','Основной язык','Idioma principal'),
        label:(k)=>langName(k), col:null }
    };
    const state={religion:false,language:false};
    const order={};      /* key -> [category, …] most-led first; decides the colour AND the legend */

    function load(key){ const C=CFG[key];
      if(DATA[key]) return Promise.resolve(DATA[key]);
      const u=(()=>{ try{ return new URL(C.file,document.baseURI).toString(); }catch(_){ return C.file; } })();
      return fetch(u).then(r=>r.json()).then(j=>{
        DATA[key]=j;
        const n={}; Object.values(j.countries||{}).forEach(v=>{ n[v.top]=(n[v.top]||0)+1; });
        order[key]=Object.keys(n).sort((a,b)=>(n[b]-n[a])||(a<b?-1:1));
        return j; }).catch(()=>null);
    }
    /* (#R270) one category, one colour — see the note by LANG_FIX. #R268's family-grouping is gone
       with the shared fill it existed for; a rank in the most-led order IS the colour now. */
    const colOf=(key,cat)=>{ const C=CFG[key]; if(C.col) return C.col(cat);
      /* (#R273) the Serbo-Croatian standards share a hue — see FAM_COL */
      if(key==='language'&&FAM_BCMS[cat]!=null) return FAM_COL[FAM_BCMS[cat]];
      const ord=order[key]||[];
      const i=ord.indexOf(cat);
      if(i<0) return '#9aa0a6';
      const pal=paletteOf(ord.length);
      return pal[i]||'#9aa0a6'; };
    function colorExpr(key){ const e=['match',['get','cat']];
      (order[key]||[]).forEach(cat=>{ e.push(cat,colOf(key,cat)); }); e.push('#9aa0a6'); return e; }

    /* ══ (#R268) THE TAP IS A BAR CHART, AND IT CARRIES THE YEAR ══════════════════════════════════
       「宗教分布レイヤーで国をクリックしたときのポップアップに棒グラフを入れろ。また、データの年も
         記載しろ。言語分布レイヤーも。」
       The composition was a list of numbers, which is the one form in which 「48.6 % と 46.4 % は
       ほぼ同じ」 and 「79.8 % と 2.3 % は桁が違う」 read the same. Each row now has a bar scaled to
       the LARGEST share in that country, so the shape of the country's composition is the first
       thing seen, and the exact percentage stays beside it. The year comes from `rec.y`, which
       scripts/build-culture.mjs reads out of the Factbook's own «(2011 est.)» — and when the source
       states no year the popup says so rather than leaving a date-less percentage looking current. */
    function popupHTML(key,iso,p){
      const C=CFG[key], rec=(DATA[key]&&DATA[key].countries&&DATA[key].countries[iso])||null;
      let nm=iso; try{ const s=countryStats[iso]; if(s) nm=(jp()?(s.nameJp||s.nameEn):s.nameEn)||iso; }catch(_){}
      if(!rec) return '<div style="font-weight:700;font-size:13px;color:var(--text-main);">'+esc(nm)+'</div>';
      const mix=Object.entries(rec.mix||{}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
      const top=mix.length?mix[0][1]:0;
      const rows=mix.map(([k,v])=>{
        const w=top>0?Math.max(1.5,v/top*100):0;
        return '<div style="font-size:11.5px;padding:2px 0;">'
          +'<div style="display:flex;align-items:center;gap:6px;">'
            +'<span style="width:9px;height:9px;border-radius:2px;flex:none;background:'+esc(colOf(key,k))+';"></span>'
            +'<span style="flex:1;">'+esc(C.label(k))+'</span>'
            +'<b style="font-variant-numeric:tabular-nums;">'+(Math.round(v*10)/10)+'%</b></div>'
          +'<div style="height:6px;border-radius:3px;background:rgba(128,128,128,0.18);margin:2px 0 0 15px;overflow:hidden;">'
            +'<div style="height:100%;width:'+w.toFixed(1)+'%;background:'+esc(colOf(key,k))+';border-radius:3px;"></div></div>'
          +'</div>'; }).join('');
      const yr=rec.y?('<span style="font-variant-numeric:tabular-nums;">'+esc(String(rec.y))+'</span>')
        :esc(LPK('year not stated','年の記載なし','Jahr nicht angegeben','год не указан','año no indicado'));
      return '<div style="font-weight:700;font-size:13px;color:var(--text-main);">'+esc(nm)+'</div>'
        +'<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">'+esc(LPK.arr(C.nm))+': <b style="color:var(--text-main);">'+esc(C.label(rec.top))+'</b>'
        +(rec.pct!=null?(' '+(Math.round(rec.pct*10)/10)+'%'):'')+'</div>'
        +'<div style="font-size:10.5px;color:var(--text-muted);margin-top:1px;">'+esc(LPK('Data year','データの年','Datenjahr','Год данных','Año de los datos'))+': '+yr+'</div>'
        +(rows?('<div style="margin-top:6px;">'+rows+'</div>'):'')
        +'<details class="im-more"><summary>'+esc(LPK('Source text','出典の原文','Quelltext','Текст источника','Texto de la fuente'))+'</summary>'
        +'<div style="font-size:10px;color:var(--text-muted);line-height:1.5;">'+esc(rec.src||'')+'</div></details>';
    }

    async function build(key){ const C=CFG[key];
      const j=await load(key); if(!j) return;
      if(GE().layers.hasSource(C.src)){ setVis(key,true); legend(key); return; }
      try{ await loadCountryData(); }catch(_){}
      const cg=(typeof HOST.countryGeo!=='undefined'&&HOST.countryGeo)||window.countryGeo;
      if(!cg||!Array.isArray(cg.features)){ setTimeout(()=>build(key),1200); return; }
      const M=j.countries||{};
      const feats=cg.features.filter(f=>f.id!=null&&M[f.id]).map(f=>({type:'Feature',geometry:f.geometry,properties:{cat:M[f.id].top,iso:f.id}}));
      try{
        GE().layers.addSource(C.src,{type:'geojson',data:{type:'FeatureCollection',features:feats}});
        GE().layers.add({id:C.ids[0],type:'fill',source:C.src,layout:{visibility:'none'},paint:{'fill-color':colorExpr(key),'fill-opacity':0.62}},before());
        GE().layers.add({id:C.ids[1],type:'line',source:C.src,layout:{visibility:'none'},paint:{'line-color':'rgba(40,40,46,0.35)','line-width':0.5}},before());
        GE().events.onLayer('click',C.ids[0],e=>{ const f=e.features&&e.features[0]; if(!f) return; const p=f.properties||{};
          try{ if(pop) pop.remove(); }catch(_){}
          try{ pop=GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,className:'plc-popup',maxWidth:'280px'})
            .setLngLat(e.lngLat).setHTML(popupHTML(key,p.iso,p))); }catch(_){}
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
        if(!el) return;
        let k=el.querySelector('.cat-key');
        if(!k){ k=document.createElement('div'); k.className='cat-key'; el.appendChild(k); }
        /* ⚠ the language key can be 85 rows long — that is the point of 「表示言語数も増やして」 —
           so it scrolls inside the legend rather than growing the legend past the screen. */
        k.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;margin-top:6px;font-size:10.5px;color:var(--text-main);max-height:30vh;overflow:auto;';
        const cats=order[key]||[];
        k.innerHTML=cats.map(cat=>'<div style="display:flex;align-items:center;gap:6px;"><span style="width:11px;height:11px;border-radius:3px;flex:none;background:'
          +esc(colOf(key,cat))+';"></span>'+esc(C.label(cat))+'</div>').join('');
        let n=el.querySelector('.cat-note');
        if(!n){ n=document.createElement('div'); n.className='cat-note'; n.style.cssText='font-size:9.5px;color:var(--text-muted);line-height:1.5;margin-top:6px;'; el.appendChild(n); }
        const j=DATA[key];
        n.textContent=LPK('Each country is coloured by the group with the largest share; tap a country for the full composition. Source: CIA World Factbook (public domain).',
          '各国は最大シェアのグループで色分けしています。国をタップすると内訳が出ます。出典: CIA World Factbook（パブリックドメイン）。',
          'Jedes Land ist nach der größten Gruppe eingefärbt; Land antippen für die volle Zusammensetzung. Quelle: CIA World Factbook (gemeinfrei).',
          'Каждая страна окрашена по крупнейшей группе; нажмите страну, чтобы увидеть состав. Источник: CIA World Factbook (общественное достояние).',
          'Cada país se colorea por el grupo mayoritario; toque un país para ver la composición. Fuente: CIA World Factbook (dominio público).')
          +(j&&j.countries?(' '+Object.keys(j.countries).length+LPK(' countries','か国',' Länder',' стран',' países')):'');
      }catch(_){} }

    function toggle(key,on){ state[key]=on;
      if(!on){ setVis(key,false); try{ if(pop) pop.remove(); }catch(_){} try{ window._hideGenericLegend&&window._hideGenericLegend('cat-'+key); }catch(_){} return; }
      if(!_imCanDraw()){ GE().events.once('idle',()=>toggle(key,true)); return; }
      build(key);
    }
    const CLBL={religion:LA('Religion distribution','宗教分布','Religionsverteilung','Распределение религий','Distribución religiosa'),language:LA('Language distribution','言語分布','Sprachverteilung','Распределение языков','Distribución lingüística')};
    const CSW={religion:'#4e79a7',language:'#f28e2b'};
    function buildUI(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('beta-dl-cat-religion')) return;
      Object.keys(CLBL).forEach(k=>{ const w=document.createElement('div'); w.className='lyr-row';
        w.innerHTML='<label class="layer-option"><input type="checkbox" id="beta-dl-cat-'+k+'"> <span class="lyr-sw" style="background:'+CSW[k]+'"></span> <span id="beta-dl-cat-'+k+'-lbl">'+LPK.arr(CLBL[k])+'</span></label>';
        dd.appendChild(w);
        w.querySelector('input').addEventListener('change',e=>{ e.target.closest('.lyr-row').classList.toggle('on',e.target.checked); toggle(k,e.target.checked); }); });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){}
    }
    if(document.readyState!=='loading') setTimeout(buildUI,0); else document.addEventListener('DOMContentLoaded',buildUI);
    window.addEventListener('intmap-lang',()=>setTimeout(()=>{ Object.keys(CLBL).forEach(k=>{ const e=document.getElementById('beta-dl-cat-'+k+'-lbl'); if(e) e.textContent=LPK.arr(CLBL[k]); if(state[k]) legend(k); }); },20));
    GE().events.on('styledata',()=>{ if(state.religion||state.language){ setTimeout(()=>{ ['religion','language'].forEach(k=>{ if(state[k]){ if(GE().layers.hasSource(CFG[k].src)) setVis(k,true); else build(k); } }); },90); } });
    /* the facts the layer publishes — Atlas and the tests read these instead of the paint expression */
    window.IntMapCulture={ toggle, isOn:(k)=>!!state[k], data:(k)=>DATA[k],
      categories:(k)=>(order[k]||[]).slice(), of:(k,iso)=>((DATA[k]&&DATA[k].countries&&DATA[k].countries[iso])||null),
      ready:(k)=>load(k),
      /* (#R271) the colour a category is drawn in, and the palette itself — so «no two rows share a
         swatch» is a thing a test can assert rather than a thing a comment claims */
      colourOf:(k,cat)=>colOf(k,cat), palette:(n)=>paletteOf(n).slice(),
      /* (#R273) the Serbo-Croatian standards and the one hue they share */
      family:()=>Object.keys(FAM_BCMS).slice(), familyColours:()=>FAM_COL.slice() };
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
    const lbl=()=>window.IntMapLang.t(HOST.lang,'Time zones (live clock)','タイムゾーン（現在時刻）','Zeitzonen (Uhr)','Часовые пояса (время)','Husos horarios (hora)');
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
    /* ══ (#R289) THE SAME BOUNDARIES, ASKED A DIFFERENT QUESTION — window.IntMapTimeZones ═════════
       Chronos's clock selector offers 「the standard time where the map is centred」, and the answer
       to that is already downloaded here whenever this layer has been on. Publishing an accessor
       beside the layer keeps ONE owner of the dataset ([[intmap-recurring-lessons]] G) instead of a
       second fetch of the same 10 m polygons from js/news-timeline.js.
       ⚠ `ensure()` is what fetches; `offsetAt()` NEVER does. A getter that starts a network request
       would be called once per repaint of a panel, and the caller could not tell 「not yet」 from
       「no zone here」 — so it answers null until the data is in hand and the caller re-renders.
       ⚠ THE OFFSET IS STANDARD TIME. Natural Earth's `zone` is the UTC offset with no DST rules in
       it, and the option in the picker says so rather than implying a wall clock it cannot give. */
    /* ══ ⚠⚠⚠ (#R290) TWO OBJECTS, ONE NAME — AND THE SECOND ONE WON ═══════════════════════════
       「Chronosの地図中心の標準時にする機能、機能していない。」 MEASURED on the built page:
       `Object.keys(window.IntMapTimeZones)` was **['highlight','highlighted','clear']** — the
       #R204 accessor forty lines below this one is assigned unconditionally at module evaluation,
       AFTER this block, so `ensure` / `ready` / `offsetAt` never existed by the time anything
       could call them. js/news-timeline.js's `zSpec()` therefore fell to `{local:true}` for every
       reader who chose 「地図の中心の標準時」, i.e. the option silently gave them their own device
       clock — and the fallback was written to be silent, so nothing said so.
       → ONE object with all five members, assigned once. The #R204 assignment below now EXTENDS
       this one instead of replacing it, and `tests/r290` counts the members so a third assignment
       cannot quietly win again. */
    try{ window.IntMapTimeZones=Object.assign(window.IntMapTimeZones||{},{
      ensure:function(){ if(geo) return Promise.resolve(true);
        if(!this._p) this._p=fetch(TZURL).then(r=>r.json()).then(j=>{ geo=j; return true; }).catch(()=>{ this._p=null; return false; });
        return this._p; },
      ready:function(){ return !!geo; },
      offsetAt:function(lng,lat){ if(!geo||!geo.features||!window._imPipGeo) return null;
        for(const f of geo.features){ const z=f.properties&&f.properties.zone;
          if(z==null||!f.geometry) continue;
          try{ if(window._imPipGeo(lng,lat,f.geometry)) return +z; }catch(_){} }
        return null; } }); }catch(_){}
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
    /* ⚠ (#R290) EXTENDS — it used to REPLACE, and that is the whole of the defect above. */
    window.IntMapTimeZones=Object.assign(window.IntMapTimeZones||{},{ highlight:(z)=>setHighlight(z), highlighted:()=>hlZone, clear:()=>setHighlight(null) });
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
      {id:'gxndvi', gibs:'MODIS_Terra_NDVI_8Day', max:9, ext:'png', sw:'#2e7d32',
        label:LA('Vegetation index (NDVI)','植生指数 (NDVI)','Vegetationsindex (NDVI)','Индекс растительности (NDVI)','Índice de vegetación (NDVI)'),
        note:LA('MODIS vegetation index (8-day)','MODIS 植生指数（8日合成）','MODIS Vegetationsindex (8 Tage)','MODIS индекс растительности (8 дней)','Índice de vegetación MODIS (8 días)')},
      {id:'gxseaice', gibs:'GHRSST_L4_MUR_Sea_Ice_Concentration', max:7, ext:'png', sw:'#cfe8ff',
        label:LA('Sea-ice concentration','海氷密接度','Meereiskonzentration','Концентрация морского льда','Concentración de hielo marino'),
        note:LA('GHRSST MUR sea-ice concentration','GHRSST MUR 海氷密接度','GHRSST MUR Meereiskonzentration','GHRSST MUR концентрация льда','Concentración de hielo marino GHRSST MUR')},
      {id:'gxsstanom', gibs:'GHRSST_L4_MUR_Sea_Surface_Temperature_Anomalies', max:7, ext:'png', sw:'#ef5350',
        label:LA('Sea-surface temp anomaly','海面水温 偏差','Meeresoberflächentemp.-Anomalie','Аномалия темп. поверхности моря','Anomalía de temp. superficial del mar'),
        note:LA('How far today’s sea-surface temperature is from normal for this place and this time of year',
                '今日の海面水温が、その場所・その時期の平年値からどれだけ離れているか',
                'Wie weit die heutige Meeresoberflächentemperatur vom Normalwert für Ort und Jahreszeit abweicht',
                'Насколько сегодняшняя температура поверхности моря отличается от нормы для этого места и сезона',
                'Cuánto se aparta la temperatura del mar de hoy de lo normal para este lugar y esta época'),
        /* ⚠ (#R266) 「海面水温 偏差レイヤー、海面水温 偏差がなんなのか説明するように。」 — and the old
           note was 「平年差（エルニーニョ等の指標）」, which explains an anomaly to somebody who already
           knows what one is. The three things a reader actually needs are: it is a DIFFERENCE and not
           a temperature; which sign is which colour; and what «normal» is measured against. */
        more:LA('An anomaly is a DIFFERENCE, not a temperature. Each pixel is today’s sea-surface temperature minus the 1985–2014 average for that same spot on that same day of the year, so red means warmer than usual there and blue means cooler than usual there — a +2 °C patch in the Arctic and a +2 °C patch in the tropics are the same departure from normal, not the same water. Grey is normal. The scale is clamped at ±3 °C. This is the map El Niño and La Niña are read off: a warm tongue along the equatorial Pacific is El Niño, a cool one is La Niña.',
                '偏差（平年差）とは「水温そのもの」ではなく「ずれ」です。各画素は、その日のその場所の海面水温から、同じ場所・同じ暦日の 1985–2014 年平均を引いた値です。赤はその場所として平年より暖かい、青は平年より冷たい、灰色は平年並みを意味します。北極の +2°C と熱帯の +2°C は「同じずれ幅」であって「同じ水温」ではありません。目盛りは ±3°C で頭打ちです。エルニーニョ／ラニーニャはこの図で読み取れます — 赤道太平洋に赤い舌が伸びればエルニーニョ、青ければラニーニャです。',
                'Eine Anomalie ist eine DIFFERENZ, keine Temperatur: heutige Meeresoberflächentemperatur minus dem Mittel 1985–2014 für denselben Ort und denselben Kalendertag. Rot = wärmer als dort üblich, Blau = kälter, Grau = normal; Skala bei ±3 °C begrenzt. El Niño/La Niña liest man an der Zunge entlang des äquatorialen Pazifiks ab.',
                'Аномалия — это РАЗНОСТЬ, а не температура: сегодняшняя температура поверхности моря минус среднее за 1985–2014 для того же места и того же дня года. Красный — теплее обычного здесь, синий — холоднее, серый — норма; шкала обрезана на ±3 °C. Эль-Ниньо и Ла-Нинья видны как язык вдоль экваториальной части Тихого океана.',
                'Una anomalía es una DIFERENCIA, no una temperatura: la temperatura del mar de hoy menos la media 1985–2014 del mismo punto y el mismo día del año. Rojo = más cálido de lo habitual allí, azul = más frío, gris = normal; escala limitada a ±3 °C. El Niño y La Niña se leen en la lengua del Pacífico ecuatorial.')},
      /* (#R40) Blue Marble (relief + bathymetry) was DELETED per request. */
      /* (#R39) +4 more curl-verified GIBS rasters (HTTP 200 / image/*). */
      {id:'gxrelief', gibs:'ASTER_GDEM_Color_Shaded_Relief', max:12, ext:'jpg', staticDate:'2024-01-01', sw:'#8d6e63',
        label:LA('Color relief (ASTER GDEM)','カラー段彩・陰影（ASTER）','Farbrelief (ASTER GDEM)','Цветной рельеф (ASTER GDEM)','Relieve en color (ASTER GDEM)'),
        note:LA('ASTER global DEM color + shaded relief (static)','ASTER 全球標高モデルのカラー段彩＋陰影起伏（静止画）','ASTER globales DEM, Farb- + Schummerung (statisch)','ASTER глобальная ЦМР: цвет + отмывка (статично)','MDE global ASTER: color + relieve sombreado (estático)')},
      /* ⚠ (#R289) TWO ENTRIES ARE GONE FROM THIS LIST — 「紫外線エアロゾル指数」(gxaero, OMPS_Aerosol_Index,
         #R41) and 「一酸化炭素 (CO)」(gxco, AIRS mid-tropospheric CO, #R42), deleted per request together
         with the 雲・赤外 layer in js/data-layers.js. Their colour scales, their previews, their Atlas
         aliases, their probe rows and their measured extents in data/gibs-range.json went with them.
         ⚠ THE OTHER FIVE ARE UNTOUCHED: a deletion instruction is a list, not a sweep (#R266 ①). */
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
      gxseaice:{lo:'0%',hi:'100%',grad:'#111111,#950095,#b100ff,#0700ff,#00bdff,#00d98e,#1eb400,#d2f000,#ff7f00,#ff3333,#ffffff'},
      gxsstanom:{anom:[-3,3],grad:'#6b00db,#7f1ad1,#0094ff,#18fce5,#88ff84,#bff4a3,#cacab7,#fff679,#ffb601,#ff7100,#f90113,#d30085,#800000'},
      gxndvi:{loK:LA('sparse','まばら','spärlich','редкая','escasa'),hiK:LA('dense','密','dicht','густая','densa'),grad:'#f1ecec,#ddc9bc,#b19883,#bfde77,#78ad01,#3e8a01,#086701,#001801'},
      gxrelief:{loK:LA('low','低い','niedrig','низко','bajo'),hiK:LA('high','高い','hoch','высоко','alto'),grad:'#1a7a3c,#a6d96a,#e6e08b,#a87b52,#ffffff'},
      gxsoil:{loK:LA('dry','乾燥','trocken','сухо','seco'),hiK:LA('wet','湿潤','feucht','влажно','húmedo'),grad:'#cc8029,#cadb25,#65eb21,#1bf74d,#16f7cc,#0e97e8,#0714d9,#6600cc'}
    };
    const _lx=(arr)=>LGX.arr(arr);
    const gxLbl=(L)=>LGX.arr(L.label);
    const gxNote=(L)=>LGX.arr(L.note);
    const srcId=(L)=>'gxsrc-'+L.id, layId=(L)=>'gxlyr-'+L.id;
    const beforeLabels=()=>['layer-sat-labels','borders-only-line','ofm-country','ofm-city','ofm-other'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
    /* ══ ⚠⚠⚠ (#R268) THESE SIX RASTERS HAVE AN ARCHIVE, AND THE APP ASKED ONLY FOR TODAY ══════════
       「年を変えることに意味があるレイヤーは一つ残らずすべて、変えられるようにしろ。」

       Every one of these was pinned to `GDATE()` — today minus two days — with no control at all,
       and they are exactly the layers whose meaning is the comparison between years: sea-ice
       concentration, the sea-surface-temperature ANOMALY, NDVI, soil moisture, CO, the aerosol
       index. GIBS serves the whole archive at the same URL shape; only the date segment changes.

       ⚠ THE RANGE IS MEASURED, NOT ASSUMED. data/gibs-range.json is written by
       scripts/probe-gibs-range.mjs, which bisects on real tile requests (GIBS answers 404 outside a
       layer's extent and 200 inside). A picker whose bounds were invented would offer dates that
       draw an empty ocean and call it data. What that probe found, and nothing else would have:

         · MODIS_Terra_NDVI_8Day is a ROLLING WINDOW — 2025-02-18 onwards, not 2000.
         · AMSRU2_Soil_Moisture_SCA_Day STOPPED at 2025-09-01. Every date in 2026 answers 404, so
           the 土壌水分 layer as shipped (today − 2 d) has been drawing NOTHING, silently, for as
           long as that has been true. Defaulting to the latest date the product actually HAS is
           what fixes it, and the legend says which date is on screen.
       ⚠ The 8-day composite is served on its period start days only (DOY 1, 9, 17 …), so the
       stepper and the date box snap to those; a date typed in between is moved to its period. */
    /* ⚠ (#R268) THE IN-FLIGHT PROMISE IS WHAT IS SHARED, NOT A FLAG. MEASURED on the built site with
       sea-ice and soil moisture switched on together: the first legend started the fetch and set the
       «tried» flag, the second got `Promise.resolve(null)` back because the answer had not landed
       yet, and its `.then` therefore never re-pointed the source — the picker showed 2025-09-01
       (correct) while the tiles were still being asked for 2026-08-17 (empty). A layer whose control
       says one thing and whose URL says another is the failure this project has paid for repeatedly;
       one promise, handed to everybody, is what makes the two the same statement. */
    let gxRange=null, gxRangeP=null;
    const gxDate={};              /* id → 'YYYY-MM-DD' the reader asked for */
    function gxRanges(){
      if(gxRange) return Promise.resolve(gxRange);
      if(gxRangeP) return gxRangeP;
      const u=(()=>{ try{ return new URL('data/gibs-range.json',document.baseURI).toString(); }catch(_){ return 'data/gibs-range.json'; } })();
      gxRangeP=fetch(u).then(r=>r.json()).then(j=>{ gxRange=(j&&j.layers)||null; return gxRange; })
        .catch(()=>{ gxRangeP=null; return null; });
      return gxRangeP;
    }
    const gxR=(L)=>(gxRange&&gxRange[L.id])||null;
    const DAYMS=864e5;
    const gxIso=(t)=>new Date(t).toISOString().slice(0,10);
    /* the period start day an arbitrary date belongs to — identical arithmetic to the probe script */
    function gxSnap(iso,period){
      if(!(period>1)) return iso;
      const t=Date.parse(iso+'T00:00:00Z'); if(!isFinite(t)) return iso;
      const y=new Date(t).getUTCFullYear(), j0=Date.UTC(y,0,1);
      const d=Math.floor((t-j0)/DAYMS)+1;
      return gxIso(j0+(Math.floor((d-1)/period)*period)*DAYMS);
    }
    function gxClamp(L,iso){ const R=gxR(L); if(!R) return iso;
      let v=gxSnap(iso,R.period||1);
      if(R.from&&v<R.from) v=gxSnap(R.from,R.period||1);
      if(R.to&&v>R.to) v=R.to;
      return v; }
    /* the date this layer is drawing: the reader's choice, else the newest the product HAS */
    function gxAt(L){ if(L.staticDate) return L.staticDate;
      const R=gxR(L);
      if(gxDate[L.id]) return gxClamp(L,gxDate[L.id]);
      return (R&&R.to)||GDATE(); }
    function gxStep(L,dir){ const R=gxR(L); if(!R) return;
      const per=R.period||1;
      const t=Date.parse(gxAt(L)+'T00:00:00Z')+dir*per*DAYMS;
      gxDate[L.id]=gxClamp(L,gxIso(t));
      gxRepoint(L); }
    function gxRepoint(L){ try{ if(GE().layers.hasSource(srcId(L))) GE().layers.setSourceTiles(srcId(L),[urlFor(L)]); }catch(_){}
      legendNote(L); }
    const urlFor=(L)=>'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/'+L.gibs+'/default/'+gxAt(L)+'/GoogleMapsCompatible_Level'+L.max+'/{z}/{y}/{x}.'+L.ext;
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
        /* (#R268) the date, for every layer that HAS an archive — static products have none and
           show nothing here, which is the honest difference between the two kinds */
        if(!L.staticDate){
          if(!gxRange) gxRanges().then(r=>{ if(r&&state[L.id]){ gxRepoint(L); } });
          /* …and once they are in hand, every render of this legend re-asserts the URL, so a source
             built before the ranges landed cannot stay pointed at a date the product does not have */
          else { try{ if(GE().layers.hasSource(srcId(L))) GE().layers.setSourceTiles(srcId(L),[urlFor(L)]); }catch(_){} }
          const R=gxR(L);
          let d=el.querySelector('.gx-daterow');
          if(!d){ d=document.createElement('div'); d.className='gx-daterow';
            d.style.cssText='display:flex;align-items:center;gap:5px;margin-top:6px;font-size:10.5px;color:var(--text-muted);';
            d.innerHTML='<span class="gx-dlbl"></span>'
              +'<button type="button" class="gx-prev" style="border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);border-radius:6px;width:20px;height:20px;line-height:1;cursor:pointer;padding:0;">‹</button>'
              +'<input type="date" class="gx-date" style="flex:1;min-width:0;padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px;">'
              +'<button type="button" class="gx-next" style="border:1px solid var(--glass-border,rgba(128,128,128,0.25));background:var(--input-bg);color:var(--text-main);border-radius:6px;width:20px;height:20px;line-height:1;cursor:pointer;padding:0;">›</button>';
            el.appendChild(d);
            d.querySelector('.gx-prev').onclick=()=>gxStep(L,-1);
            d.querySelector('.gx-next').onclick=()=>gxStep(L,1);
            d.querySelector('.gx-date').addEventListener('change',(e)=>{ gxDate[L.id]=gxClamp(L,e.target.value); gxRepoint(L); });
          }
          d.querySelector('.gx-dlbl').textContent=LGX('Date','日付','Datum','Дата','Fecha');
          const inp=d.querySelector('.gx-date');
          inp.value=gxAt(L);
          if(R){ inp.min=R.from||''; inp.max=R.to||''; }
          d.querySelector('.gx-prev').disabled=!!(R&&R.from&&gxAt(L)<=R.from);
          d.querySelector('.gx-next').disabled=!!(R&&R.to&&gxAt(L)>=R.to);
          /* …and when the product itself has ENDED, the legend says so instead of showing a blank
             map — measured for AMSR2 soil moisture, which stops at 2025-09-01 */
          let en=el.querySelector('.gx-end');
          if(!en){ en=document.createElement('div'); en.className='gx-end'; en.style.cssText='font-size:9.5px;line-height:1.4;margin-top:3px;'; el.appendChild(en); }
          const stale=!!(R&&R.to&&(Date.now()-Date.parse(R.to+'T00:00:00Z'))>45*DAYMS);
          en.style.color=stale?'#ff9f0a':'var(--text-muted)';
          en.textContent=R?((stale?(LGX('This product ends at','このデータは次の日付で終了しています','Dieses Produkt endet am','Продукт заканчивается','Este producto termina el')+' '):'')
              +(R.from||'?')+' – '+(R.to||'?')):'';
        }
        let h=el.querySelector('.gx-note'); if(!h){ h=document.createElement('div'); h.className='gx-note'; h.style.cssText='font-size:9.5px;color:var(--text-muted);margin-top:4px;line-height:1.35;'; el.appendChild(h);} h.textContent=gxNote(L);
        /* (#R266) the layers whose UNIT needs explaining carry a `more` paragraph; it folds into the
           same <details> the ocean-current and company legends use, so a legend never grows a wall. */
        if(L.more){ let m=el.querySelector('.gx-more');
          if(!m){ m=document.createElement('details'); m.className='im-more gx-more';
            m.innerHTML='<summary></summary><div class="gx-more-b" style="font-size:9.5px;color:var(--text-muted);line-height:1.5;"></div>'; el.appendChild(m); }
          m.querySelector('summary').textContent=LGX('What is an anomaly?','偏差とは','Was ist eine Anomalie?','Что такое аномалия?','¿Qué es una anomalía?');
          m.querySelector('.gx-more-b').textContent=_lx(L.more); }
      } }catch(_){} }
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
      /* (#R268) the same date the layer is PAINTING — a readout off a different day would be a
         second answer to «what is the value here», which is the defect this project has paid for */
      const url='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/'+L.gibs+'/default/'+gxAt(L)+'/GoogleMapsCompatible_Level'+L.max+'/'+z+'/'+ty+'/'+tx+'.'+L.ext;
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
      if(sc.lo!=null&&/%$/.test(String(sc.hi))) return Math.round(fr*100)+'%';
      if(sc.loK) return Math.round(fr*100)+'% ('+_lx(sc.loK)+' → '+_lx(sc.hiK)+')';
      return Math.round(fr*100)+'%'; }
    try{ if(window.IntMapLayers){ LIST.forEach(L=>{ if(!SCALES[L.id]) return;
      window.IntMapLayers.register('gx-'+L.id,{ on:()=>!!state[L.id], label:()=>gxLbl(L),
        sampleAt:(x,y)=>sampleGx(L,x,y), time:()=>(L.staticDate||GDATE()), source:()=>'NASA GIBS · '+L.gibs }); }); } }catch(_){}
    function buildUI(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('gx-gxndvi')) return;
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
