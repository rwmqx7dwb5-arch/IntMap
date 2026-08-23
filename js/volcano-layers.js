/* ============================================================================
 *  IntMap · VOLCANO INTELLIGENCE — the three map overlays  (#R353)
 *  window.IntMapVolcanoLayers
 * ----------------------------------------------------------------------------
 *  The parts of Volcano Intelligence that are DRAWN rather than read: the volcanic-ash areas an
 *  aviation authority has in force right now, the hazard zones a geological survey has published as
 *  GIS, and the satellite SO₂ column. js/volcano-intel.js owns the catalog, the status ladder and
 *  the card; this file owns the sources and layers, and the two are separate modules because a
 *  reader who opens a volcano card must not pay for three map layers they did not switch on.
 *
 *  ── ① ASH: SIGMETs, NOT A CIRCLE AROUND A VOLCANO ──────────────────────────────────────────
 *  A VAAC issues a Volcanic Ash Advisory as formatted text and a picture. The ash CLOUD as a polygon
 *  with an altitude band on it exists in the SIGMET that the FIR issues from that advisory, and
 *  aviationweather.gov publishes those with real coordinates. Measured this round: 127 international
 *  SIGMETs live, 8 of them volcanic ash — Krakatau SFC/FL090 moving SW at 5 kt intensifying, Ibu
 *  SFC/FL070 moving NE at 10 kt. That is a promulgated hazard area, so it is drawn as one and
 *  labelled with the flight levels it was promulgated with.
 *  ⚠ SIGMETs are AMENDED inside their validity. The layer re-reads while it is visible; a SIGMET
 *  whose validity has passed is dropped by the clock here rather than left on the map as history.
 *
 *  ── ② HAZARD ZONES: WHAT EXISTS AS DATA, AND NOTHING ELSE ─────────────────────────────────
 *  Pyroclastic-flow, ashfall and lahar zones exist on paper for a great many volcanoes and as
 *  machine-readable GIS for very few. Searched this round: the one authoritative, keyless,
 *  CORS-enabled service is the USGS-owned `Volcano_Hazard_Zones` feature service — 26 polygons over
 *  seven Californian volcanic centres, classed Ash / Lahars / Floods / Near-vent / Lava flows.
 *  Those seven are drawn. For every other volcano js/volcano-intel.js says, per volcano, that none
 *  is published — because 「1,200 volcanoes with no hazard zone drawn」 must not read as
 *  「1,200 volcanoes with no hazard」. NOTHING here draws a modelled reach.
 *
 *  ── ③ SO₂: THE SATELLITE COLUMN ────────────────────────────────────────────────────────────
 *  GVP's own SO₂ emission table is advertised by the WFS and is BROKEN upstream (`Invalid object
 *  name 'vrf.Emission'`, both WFS versions, every request — see scripts/build-volcanoes.mjs). The
 *  measurement that does exist is the satellite column, and NASA GIBS serves it reprojected through
 *  its EPSG:3857 WMS with `Access-Control-Allow-Origin: *` — the same door js/layer-packs.js already
 *  uses for sea ice. `OMPS_SO2_Upper_Troposphere_and_Stratosphere` is the volcanic band: the one
 *  that shows an eruption plume rather than industrial haze in the boundary layer.
 *
 *  ── RENDERER / MODULE RULES ────────────────────────────────────────────────────────────────
 *  · No <style> — CSS in css/intmap.css.  · Every DOM value through window.IntMapSafe.
 *  · Five languages inline; the rest in js/locales/ui.*.js.
 *  · Load-on-demand (js/lazy-modules.js → `volcanoLayers`).
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.volcanoLayers=function(HOST){
  const L=window.IntMapLang.pick(()=>HOST.lang);
  const LA=window.IntMapLang.pickArgs();
  const GE=()=>window.IntMapGeoEngine;
  const S=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
  function canDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const setVis=(ids,on)=>ids.forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',on?'visible':'none'); }catch(_){} });
  const before=()=>{ try{ return GE().layers.has('tool-poly')?'tool-poly':undefined; }catch(_){ return undefined; } };

  const state={ ash:false, hazard:false, so2:false };
  const subs=new Set();
  const notify=()=>{ for(const fn of subs){ try{ fn(); }catch(_){} } };

  /* ══ ① VOLCANIC-ASH AREAS ══════════════════════════════════════════════════════════════════ */
  const ASH_IDS=['volc-ash-fill','volc-ash-line','volc-ash-lbl'];
  const RELAY=(qs)=>{ let b=''; try{ b=String(window.SUPABASE_URL||'').replace(/\/$/,''); }catch(_){ b=''; }
    return b?(b+'/functions/v1/volcano-feed?'+qs):''; };
  let ashFC=null, ashTimer=null, ashState='idle', ashRead=0, ashAt=0;

  /* FL notation the way the SIGMET itself writes it: 0 ft is the surface, everything else is a
     flight level in hundreds of feet. SFC/FL090 is the promulgated string, not a conversion. */
  function flBand(base,top){
    const one=(v,sfc)=>(v==null?'':(v<=0?(sfc?'SFC':'SFC'):'FL'+String(Math.round(v/100)).padStart(3,'0')));
    if(base==null&&top==null) return '';
    return one(base,true)+'/'+one(top,false);
  }
  function ashEnsure(){
    if(GE().layers.hasSource('volc-ash-src')) return true;
    if(!canDraw()) return false;
    try{
      GE().layers.addSource('volc-ash-src',{type:'geojson',data:ashFC||{type:'FeatureCollection',features:[]},
        attribution:'International SIGMET · NOAA Aviation Weather Center'});
      GE().layers.add({id:'volc-ash-fill',type:'fill',source:'volc-ash-src',layout:{visibility:'none'},
        paint:{'fill-color':'#7b5cff','fill-opacity':0.26}},before());
      GE().layers.add({id:'volc-ash-line',type:'line',source:'volc-ash-src',layout:{visibility:'none','line-join':'round'},
        paint:{'line-color':'#b3a1ff','line-width':1.6,'line-opacity':0.95}},before());
      GE().layers.add({id:'volc-ash-lbl',type:'symbol',source:'volc-ash-src',layout:{visibility:'none',
        'text-field':['get','label'],'text-size':window.IntMapLabelScale.sub(0.86),'text-font':['literal',['Noto Sans Regular']],
        'text-allow-overlap':false,'symbol-placement':'point'},
        paint:{'text-color':'#e6dcff','text-halo-color':'rgba(0,0,0,0.85)','text-halo-width':1.3}},before());
      GE().events.onLayer('click','volc-ash-fill',e=>{
        const f=e.features&&e.features[0]; if(!f) return; const p=f.properties||{};
        const html='<div style="min-width:200px;max-width:320px;">'
          +'<div style="font-weight:700;font-size:14px;color:var(--text-main);">'+S(p.volcano||L('Volcanic ash','火山灰','Vulkanasche','Вулканический пепел','Ceniza volcánica'))+'</div>'
          +'<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">'+S(p.label||'')+'<br>'+S(p.fir||'')+'</div>'
          +(p.raw?'<pre style="font-size:10.5px;white-space:pre-wrap;margin:6px 0 0;color:var(--text-muted);">'+S(p.raw)+'</pre>':'')
          +'</div>';
        try{ GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,className:'plc-popup',maxWidth:'340px'})
          .setLngLat(e.lngLat).setHTML(html)); }catch(_){}
      });
      return true;
    }catch(_){ return false; }
  }
  function ashToFC(rows){
    const now=Date.now()/1000;
    const feats=[];
    for(const a of rows||[]){
      /* ⚠ the clock, not the fetch, decides what is in force. An expired SIGMET left on the map is a
         claim that ash is where it no longer is. */
      if(a.to&&+a.to<now) continue;
      const ring=a.coords.slice();
      if(ring.length&&(ring[0][0]!==ring[ring.length-1][0]||ring[0][1]!==ring[ring.length-1][1])) ring.push(ring[0]);
      const band=flBand(a.base,a.top);
      const label=[a.volcano||'',band,(a.dir&&a.spd)?(a.dir+' '+a.spd+'kt'):''].filter(Boolean).join(' · ');
      feats.push({ type:'Feature', geometry:{type:'Polygon',coordinates:[ring]},
        properties:{ volcano:a.volcano||'', fir:a.fir||'', label, band, raw:a.raw||'',
          base:a.base, top:a.top, to:a.to } });
    }
    return { type:'FeatureCollection', features:feats };
  }
  async function ashLoad(){
    const u=RELAY('feed=ash');
    if(!u){ ashState='failed'; notify(); return; }
    ashState=ashState==='ok'?'ok':'loading'; notify();
    try{
      const ctrl=new AbortController(); const to=setTimeout(()=>{ try{ctrl.abort();}catch(_){} },20000);
      const r=await fetch(u,{signal:ctrl.signal}); clearTimeout(to);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j=await r.json();
      ashRead=+j.read||0; ashFC=ashToFC(j.areas||[]); ashAt=Date.now(); ashState='ok';
      try{ GE().layers.setSourceData('volc-ash-src',ashFC); }catch(_){}
    }catch(_){ ashState='failed'; }
    notify(); legend();
  }
  function ashToggle(on){
    state.ash=!!on;
    const go=()=>{ if(!ashEnsure()){ try{ GE().events.once('idle',go); }catch(_){} return; }
      setVis(ASH_IDS,state.ash);
      if(state.ash){ ashLoad(); if(!ashTimer) ashTimer=setInterval(()=>{ if(state.ash) ashLoad(); },60000); }
      else if(ashTimer){ clearInterval(ashTimer); ashTimer=null; } };
    go(); legend(); notify();
  }

  /* ══ ② USGS HAZARD ZONES ═══════════════════════════════════════════════════════════════════
     The service is queried once and kept; 26 polygons is not a stream. ⚠ The `Volcano` field is the
     USGS's own zone name and it is shown verbatim — «Long Valley Volcanic Region» is a USGS mapping
     unit whose Holocene entry in GVP is Mono-Inyo Craters, and rewriting one into the other on
     screen would attribute a USGS map to a name USGS did not use. */
  const HAZ_IDS=['volc-haz-fill','volc-haz-line'];
  const HAZ_URL='https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Volcano_Hazard_Zones/FeatureServer/0/query'
    +'?where=1%3D1&outFields=Volcano,Hazard&outSR=4326&f=geojson';
  /* USGS zone name → the GVP volcano number this map places it on. Checked against
     data/volcanoes_gvp.json by tests/r353-checks.test.mjs. */
  const HAZ_TO_GVP={
    'Mount Shasta':323010, 'Medicine Lake Volcano':323020, 'Lassen Volcanic Center':323080,
    'Clear Lake Volcanic Field':323100, 'Ubehebe Craters':323160, 'Salton Buttes':323200,
    'Long Valley Volcanic Region':323120,
  };
  const HAZ_COLOR={ 'Ash (2 in. or greater)':'#c9a227', 'Lahars':'#8b5a2b', 'Floods':'#2f7fbf',
    'Near-vent (multiple hazards)':'#d1381f', 'Lava flows':'#e2622f' };
  let hazFC=null, hazState='idle';
  function hazEnsure(){
    if(GE().layers.hasSource('volc-haz-src')) return true;
    if(!canDraw()) return false;
    try{
      GE().layers.addSource('volc-haz-src',{type:'geojson',data:hazFC||{type:'FeatureCollection',features:[]},
        attribution:'U.S. Geological Survey — Volcano Hazards Program'});
      const colorExpr=['match',['get','Hazard']];
      for(const k of Object.keys(HAZ_COLOR)){ colorExpr.push(k,HAZ_COLOR[k]); }
      colorExpr.push('#9aa3b2');
      GE().layers.add({id:'volc-haz-fill',type:'fill',source:'volc-haz-src',layout:{visibility:'none'},
        paint:{'fill-color':colorExpr,'fill-opacity':0.3}},before());
      GE().layers.add({id:'volc-haz-line',type:'line',source:'volc-haz-src',layout:{visibility:'none'},
        paint:{'line-color':colorExpr,'line-width':1.2,'line-opacity':0.9}},before());
      GE().events.onLayer('click','volc-haz-fill',e=>{
        const f=e.features&&e.features[0]; if(!f) return; const p=f.properties||{};
        const html='<div style="min-width:180px;"><div style="font-weight:700;font-size:14px;color:var(--text-main);">'+S(p.Volcano||'')+'</div>'
          +'<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">'+S(p.Hazard||'')+'</div>'
          +'<div style="font-size:10px;color:var(--text-muted);margin-top:5px;">U.S. Geological Survey</div></div>';
        try{ GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,className:'plc-popup',maxWidth:'300px'})
          .setLngLat(e.lngLat).setHTML(html)); }catch(_){}
      });
      return true;
    }catch(_){ return false; }
  }
  async function hazLoad(){
    if(hazFC) return hazFC;
    hazState='loading'; notify();
    try{
      const ctrl=new AbortController(); const to=setTimeout(()=>{ try{ctrl.abort();}catch(_){} },20000);
      const r=await fetch(HAZ_URL,{signal:ctrl.signal}); clearTimeout(to);
      if(!r.ok) throw new Error('HTTP '+r.status);
      const j=await r.json();
      if(!j||!Array.isArray(j.features)) throw new Error('shape');
      hazFC=j; hazState='ok';
      try{ GE().layers.setSourceData('volc-haz-src',hazFC); }catch(_){}
    }catch(_){ hazState='failed'; }
    notify(); legend(); return hazFC;
  }
  /* which hazard classes USGS publishes for a GVP volcano — answerable BEFORE the service is
     fetched, because the name table is what decides it. Returns [] for the 1,207 volcanoes for
     which nothing is published, which is what js/volcano-intel.js prints as an absence. */
  function hazardFor(vn){
    const names=Object.keys(HAZ_TO_GVP).filter(k=>HAZ_TO_GVP[k]===+vn);
    if(!names.length) return [];
    if(!hazFC) return names;                    /* the zone name, until the classes are known */
    const out=[];
    for(const f of hazFC.features){
      const p=f.properties||{};
      if(names.indexOf(p.Volcano)>=0&&p.Hazard&&out.indexOf(p.Hazard)<0) out.push(p.Hazard);
    }
    return out.length?out:names;
  }
  function hazToggle(on,vn){
    state.hazard=!!on;
    const go=async()=>{ if(!hazEnsure()){ try{ GE().events.once('idle',go); }catch(_){} return; }
      setVis(HAZ_IDS,state.hazard);
      if(state.hazard){ await hazLoad(); if(vn!=null) fitHazard(vn); } };
    go(); legend(); notify();
  }
  function fitHazard(vn){
    if(!hazFC) return false;
    const names=Object.keys(HAZ_TO_GVP).filter(k=>HAZ_TO_GVP[k]===+vn);
    if(!names.length) return false;
    let minX=180,minY=90,maxX=-180,maxY=-90,hit=false;
    for(const f of hazFC.features){
      if(names.indexOf((f.properties||{}).Volcano)<0) continue;
      const walk=(c)=>{ if(typeof c[0]==='number'){ hit=true;
          if(c[0]<minX)minX=c[0]; if(c[0]>maxX)maxX=c[0]; if(c[1]<minY)minY=c[1]; if(c[1]>maxY)maxY=c[1]; }
        else for(const x of c) walk(x); };
      try{ walk(f.geometry.coordinates); }catch(_){}
    }
    if(!hit) return false;
    try{ GE().camera.fitBounds([[minX,minY],[maxX,maxY]],{padding:60,duration:900}); return true; }catch(_){ return false; }
  }

  /* ══ ③ SATELLITE SO₂ ═══════════════════════════════════════════════════════════════════════ */
  const SO2_LAYER='OMPS_SO2_Upper_Troposphere_and_Stratosphere';
  /* GIBS publishes this product about a day behind; two days is the lag js/layer-packs.js already
     found to be safe for the daily GIBS products, and the reader can step the day in the legend. */
  const so2Fallback=()=>new Date(Date.now()-2*864e5).toISOString().slice(0,10);
  let so2Date=null;
  const so2At=()=>so2Date||so2Fallback();
  const so2Url=()=>'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&VERSION=1.3.0'
    +'&REQUEST=GetMap&LAYERS='+SO2_LAYER+'&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'
    +'&FORMAT=image/png&TRANSPARENT=TRUE&STYLES=&TIME='+so2At();
  function so2Ensure(){
    if(GE().layers.has('volc-so2')) return true;
    if(!canDraw()) return false;
    try{
      if(!GE().layers.hasSource('volc-so2-src'))
        GE().layers.addSource('volc-so2-src',{type:'raster',tiles:[so2Url()],tileSize:256,
          attribution:'NASA EOSDIS GIBS — OMPS SO₂ (upper troposphere & stratosphere)'});
      GE().layers.add({id:'volc-so2',type:'raster',source:'volc-so2-src',layout:{visibility:'none'},
        paint:{'raster-opacity':0.8,'raster-fade-duration':0}},before());
      return true;
    }catch(_){ return false; }
  }
  function so2Repoint(){ try{ if(GE().layers.hasSource('volc-so2-src')) GE().layers.setSourceTiles('volc-so2-src',[so2Url()]); }catch(_){} legend(); }
  function so2Toggle(on){
    state.so2=!!on;
    const go=()=>{ if(!so2Ensure()){ try{ GE().events.once('idle',go); }catch(_){} return; } setVis(['volc-so2'],state.so2); };
    go(); legend(); notify();
  }
  function setSo2Date(iso){ if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))) return false; so2Date=iso; so2Repoint(); return true; }
  /* follow the master clock when the reader moves it (js/chronos.js) */
  try{ window.IntMapTime.on((e)=>{ if(!state.so2) return; const iso=e&&e.isLive?null:(e&&e.iso); if(so2Date!==iso){ so2Date=iso; so2Repoint(); } }); }catch(_){}

  /* ══ THE LEGEND ════════════════════════════════════════════════════════════════════════════
     One box per overlay, through the app's own legend registry, so these behave like every other
     layer's legend (drag, opacity, close). ⚠ Each says which of the three states it is in — data /
     nothing in force / the feed did not answer — because "no polygons" and "no answer" look
     identical on a map and are opposite claims. */
  function legend(){
    try{
      if(state.ash&&window._registerLayerOpacity){
        const el=window._registerLayerOpacity('volc-ash',
          LA('Volcanic ash areas in force (SIGMET)','有効な火山灰域（SIGMET）','Gültige Vulkanasche-Gebiete (SIGMET)','Действующие зоны вулканического пепла (SIGMET)','Zonas de ceniza volcánica vigentes (SIGMET)'),
          ASH_IDS,'volc-ash');
        if(el){
          let n=el.querySelector('.volc-ash-note');
          if(!n){ n=document.createElement('div'); n.className='volc-ash-note'; n.style.cssText='margin-top:6px;font-size:11px;color:var(--text-main);';
            const op=el.querySelector('.dl-op-row'); if(op) el.insertBefore(n,op); else el.appendChild(n); }
          const count=ashFC?ashFC.features.length:0;
          n.innerHTML=(ashState==='failed'
            ? S(L('The SIGMET feed did not answer.','SIGMET フィードが応答しませんでした。','Der SIGMET-Feed hat nicht geantwortet.','Лента SIGMET не ответила.','El feed SIGMET no respondió.'))
            : ashState!=='ok'
            ? S(L('Reading…','読み込み中…','Wird gelesen…','Чтение…','Leyendo…'))
            : count
            ? S(count+L(' ash area(s) in force',' 件の火山灰域が有効',' Aschegebiet(e) in Kraft',' зон пепла действует',' zona(s) de ceniza vigente(s)'))
            : S(L('No volcanic-ash SIGMET is in force anywhere right now.','現在、世界のどこにも有効な火山灰 SIGMET はありません。','Derzeit ist weltweit kein Vulkanasche-SIGMET in Kraft.','Сейчас нигде в мире не действует SIGMET по вулканическому пеплу.','Ahora mismo no hay ningún SIGMET de ceniza volcánica vigente.')))
            +(ashState==='ok'?'<div style="font-size:10px;color:var(--text-muted);margin-top:3px;">'
              +S(L('read from ','読み取り元 ','gelesen aus ','прочитано из ','leído de ')+ashRead+L(' international SIGMETs',' 件の国際SIGMET',' internationalen SIGMETs',' международных SIGMET',' SIGMET internacionales'))+'</div>':'');
        }
      } else if(window._hideGenericLegend) window._hideGenericLegend('volc-ash');

      if(state.hazard&&window._registerLayerOpacity){
        const el=window._registerLayerOpacity('volc-haz',
          LA('Published volcano hazard zones (USGS)','公表された火山ハザード域（USGS）','Veröffentlichte Vulkangefahrenzonen (USGS)','Опубликованные зоны вулканической опасности (USGS)','Zonas de peligro volcánico publicadas (USGS)'),
          HAZ_IDS,'volc-haz');
        if(el){
          let k=el.querySelector('.volc-haz-key');
          if(!k){ k=document.createElement('div'); k.className='volc-haz-key'; k.style.cssText='display:flex;flex-direction:column;gap:4px;margin-top:6px;font-size:11px;color:var(--text-main);';
            const op=el.querySelector('.dl-op-row'); if(op) el.insertBefore(k,op); else el.appendChild(k); }
          const sw=(c)=>'<span style="width:11px;height:11px;border-radius:3px;flex:none;background:'+c+';border:1px solid rgba(255,255,255,0.45);"></span>';
          const NAME={ 'Ash (2 in. or greater)':L('Ashfall (2 in. or more)','降灰（2インチ以上）','Ascheregen (ab 2 in.)','Пеплопад (от 2 дюймов)','Caída de ceniza (2 in o más)'),
            'Lahars':L('Lahars','ラハール（火山泥流）','Lahare','Лахары','Lahares'),
            'Floods':L('Floods','洪水','Überschwemmungen','Наводнения','Inundaciones'),
            'Near-vent (multiple hazards)':L('Near-vent (multiple hazards)','火口近傍（複合災害）','Kraternah (mehrere Gefahren)','Вблизи жерла (несколько опасностей)','Cerca del cráter (múltiples peligros)'),
            'Lava flows':L('Lava flows','溶岩流','Lavaströme','Лавовые потоки','Coladas de lava') };
          k.innerHTML=Object.keys(HAZ_COLOR).map(key=>'<div style="display:flex;align-items:center;gap:7px;">'+sw(HAZ_COLOR[key])+S(NAME[key]||key)+'</div>').join('')
            +'<div style="font-size:10px;color:var(--text-muted);">'
            +S(hazState==='failed'
              ?L('The USGS hazard service did not answer.','USGS のハザードサービスが応答しませんでした。','Der USGS-Gefahrendienst hat nicht geantwortet.','Служба USGS не ответила.','El servicio de peligros del USGS no respondió.')
              :L('U.S. Geological Survey · published for 7 volcanic centres in California and for no others','U.S. Geological Survey · カリフォルニアの7火山地域についてのみ公表','U.S. Geological Survey · nur für 7 vulkanische Zentren in Kalifornien veröffentlicht','U.S. Geological Survey · опубликовано только для 7 вулканических центров Калифорнии','U.S. Geological Survey · publicado solo para 7 centros volcánicos de California'))
            +'</div>';
        }
      } else if(window._hideGenericLegend) window._hideGenericLegend('volc-haz');

      if(state.so2&&window._registerLayerOpacity){
        const el=window._registerLayerOpacity('volc-so2',
          LA('Satellite SO₂ column (OMPS)','衛星 SO₂ 全量（OMPS）','Satelliten-SO₂-Säule (OMPS)','Столб SO₂ со спутника (OMPS)','Columna de SO₂ satelital (OMPS)'),
          ['volc-so2'],'volc-so2');
        if(el){
          let n=el.querySelector('.volc-so2-note');
          if(!n){ n=document.createElement('div'); n.className='volc-so2-note'; n.style.cssText='margin-top:6px;font-size:11px;color:var(--text-main);';
            const op=el.querySelector('.dl-op-row'); if(op) el.insertBefore(n,op); else el.appendChild(n); }
          n.innerHTML=S(L('Upper troposphere & stratosphere — the band an eruption plume appears in','上部対流圏・成層圏 — 噴煙が現れる高度帯','Obere Troposphäre & Stratosphäre — das Band, in dem eine Eruptionswolke erscheint','Верхняя тропосфера и стратосфера — слой, где виден эруптивный шлейф','Troposfera alta y estratosfera — la banda donde aparece la pluma eruptiva'))
            +'<div style="font-size:10px;color:var(--text-muted);margin-top:3px;">'+S(so2At()+' · NASA EOSDIS GIBS')+'</div>';
        }
      } else if(window._hideGenericLegend) window._hideGenericLegend('volc-so2');
    }catch(_){}
  }

  const API={
    ash:ashToggle, hazard:hazToggle, so2:so2Toggle,
    hazardFor, hazardLoad:hazLoad, fitHazard, setSo2Date, so2Date:so2At,
    state:()=>({ ash:state.ash, hazard:state.hazard, so2:state.so2,
      ashState, ashCount:ashFC?ashFC.features.length:0, ashRead, ashAt, hazState }),
    ashData:()=>ashFC, hazardData:()=>hazFC,
    onChange:(fn)=>{ subs.add(fn); return ()=>subs.delete(fn); },
    _flBand:flBand, _ashToFC:ashToFC, _hazMap:HAZ_TO_GVP, _so2Layer:SO2_LAYER,
  };
  window.IntMapVolcanoLayers=API;
  return API;
};
