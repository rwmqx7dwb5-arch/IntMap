/* ============================================================================
 *  IntMap · Beta overlays — IntMapModules.betaOverlays  (#R164)
 * ----------------------------------------------------------------------------
 *  window.IntMapBeta — Ukraine frontline (DeepState), OpenFreeMap 3D buildings, historical-borders
 *  snapshots (aourednik) and Holocene volcanoes, with their layer rows and style-swap self-healing.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R164): the body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.betaOverlays=function(HOST){
  /* (#R251) the language helper and its ARRAY form — see `pickArgs` in js/lang-registry.js. The tuples below were bare array literals, which no instrument can see, so every language past the two they listed read English. */
  const L=window.IntMapLang.pick(()=>HOST.lang), LA=window.IntMapLang.pickArgs();
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */

  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const imToast=HOST.imToast, isMobile=HOST.isMobile, satToast=HOST.satToast;
  (function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return;
    const jp=()=>HOST.lang==='jp';
    const state={ukr:false,bldg:false,hist:false,volc:false};
    const PROX=[x=>x, x=>`https://corsproxy.io/?url=${encodeURIComponent(x)}`, x=>`https://api.allorigins.win/raw?url=${encodeURIComponent(x)}`];
    const setVis=(ids,on)=>ids.forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility',on?'visible':'none'); }catch(_){} });

    /* ---------- Ukraine frontline (DeepState — curl-verified 200 + Access-Control-Allow-Origin:*) ---------- */
    const UKR_IDS=['ukr-fill','ukr-line','ukr-front'];
    let ukrFC=null, ukrTimer=null;
    /* (#R313) published so js/layer-home.js frames the data that was actually downloaded rather
       than a typed-in box. Null until the first load lands; that module falls back to Ukraine. */
    window.IntMapUkrFrontFC=()=>ukrFC;
    function ukrEnsure(){ if(GE().layers.hasSource('ukr-src')) return true; if(!_imCanDraw()) return false;
      try{
        GE().layers.addSource('ukr-src',{type:'geojson',data:{type:'FeatureCollection',features:[]},attribution:'DeepStateMap'});
        const before=GE().layers.has('tool-poly')?'tool-poly':undefined;
        GE().layers.add({id:'ukr-fill',type:'fill',source:'ukr-src',filter:['any',['==',['geometry-type'],'Polygon'],['==',['geometry-type'],'MultiPolygon']],layout:{visibility:'none'},paint:{'fill-color':['coalesce',['get','fill'],'#d62b2b'],'fill-opacity':['*',0.32,['coalesce',['get','fill-opacity'],1]]}},before);
        GE().layers.add({id:'ukr-line',type:'line',source:'ukr-src',filter:['any',['==',['geometry-type'],'Polygon'],['==',['geometry-type'],'MultiPolygon']],layout:{visibility:'none'},paint:{'line-color':['coalesce',['get','stroke'],'#c01616'],'line-width':1.4,'line-opacity':0.9}},before);
        GE().layers.add({id:'ukr-front',type:'line',source:'ukr-src',filter:['any',['==',['geometry-type'],'LineString'],['==',['geometry-type'],'MultiLineString']],layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','stroke'],'#ff3b30'],'line-width':2.4,'line-opacity':0.95}},before);
        return true;
      }catch(_){ return false; } }
    async function ukrLoad(force){
      if(ukrFC&&!force){ try{ GE().layers.setSourceData('ukr-src',ukrFC); }catch(_){} return true; }
      for(const wrap of PROX){ try{
        const ctrl=new AbortController(); const to=setTimeout(()=>{ try{ctrl.abort();}catch(_){} },15000);
        const r=await fetch(wrap('https://deepstatemap.live/api/history/last'),{signal:ctrl.signal}); clearTimeout(to);
        if(!r.ok) continue;
        const j=await r.json();
        let fc=(j&&j.map)?j.map:j; if(typeof fc==='string'){ try{ fc=JSON.parse(fc); }catch(_){ continue; } }
        if(!fc||!Array.isArray(fc.features)) continue;
        /* (#R21) Keep only features around Ukraine ("表示するのはウクライナ周辺だけでよい") — any stray
           far-away geometry in the feed is dropped via a cheap first-vertex bbox test. */
        const firstLL=(g)=>{ try{ let c=g.coordinates; while(Array.isArray(c[0])) c=c[0]; return c; }catch(_){ return null; } };
        /* (#R22) Min latitude raised 42.5 → 43.9 so DeepState's "Occupied Abkhazia" (~43.0 N) and
           "South Ossetia / Tskhinvali" (~42.2 N) polygons are dropped — they are NOT the Ukraine front
           ("アブハジアは表示しなくて良い"). Crimea's southern tip is 44.4 N, so all of Ukraine is kept. */
        const inUA=(f)=>{ const c=firstLL(f.geometry); return !c || (c[0]>20&&c[0]<42.5&&c[1]>43.9&&c[1]<54.5); };
        const feats=fc.features.filter(f=>f&&f.geometry&&/Polygon/.test(f.geometry.type)&&inUA(f));
        if(!feats.length) continue;
        ukrFC={type:'FeatureCollection',features:feats};
        try{ GE().layers.setSourceData('ukr-src',ukrFC); }catch(_){}
        try{ ukrKeyFromData(feats); }catch(_){}
        const when=j.createdAt||j.datetime||j.updatedAt||null;
        const el=document.getElementById('data-legend-ukrfront');
        if(el){ let d=el.querySelector('.ukr-asof'); if(!d){ d=document.createElement('div'); d.className='ukr-asof'; d.style.cssText='font-size:10px;color:var(--text-muted);margin-top:5px;'; el.appendChild(d); }
          /* DeepState's datetime is a non-ISO string ("11.06 o 13:56") — show it verbatim if unparsable */
          let ws=new Date().toLocaleString(); if(when){ const dt=new Date(when); ws=isNaN(dt.getTime())?String(when):dt.toLocaleString(); }
          d.textContent=(window.IntMapLang.t(HOST.lang,"As of: ","更新: ","Stand: ","По состоянию на: ","Actualizado: "))+ws+' · DeepState'; }
        return true;
      }catch(_){} }
      const el=document.getElementById('data-legend-ukrfront');
      if(el){ let d=el.querySelector('.ukr-asof'); if(!d){ d=document.createElement('div'); d.className='ukr-asof'; d.style.cssText='font-size:10px;color:var(--text-muted);margin-top:5px;'; el.appendChild(d); }
        d.textContent=window.IntMapLang.t(HOST.lang,"Could not load — toggle again later.","取得できませんでした — 後でもう一度オンにしてください。","Laden fehlgeschlagen — später erneut einschalten.","Не удалось загрузить — включите позже ещё раз.","No se pudo cargar; vuelva a activarlo más tarde."); }
      return false;
    }
    /* (#R21) Legend mismatch fix ("凡例が、地図とあっていない") — the color key is rebuilt FROM the
       loaded DeepState data (its real per-feature fill/stroke colors), so legend === map, always. */
    /* (#R22) Classify each polygon by DeepState's OWN status token in `name`
       ("Ukr /// English /// geoJSON.status.<key>") so the legend is the ground truth. The feed has NO
       LineStrings (the old "Front line" row never matched anything → "凡例が地図とあっていない"); the real
       polygon classes are Occupied / Liberated / Unknown status / Crimea-Donbas. */
    function ukrStatusOf(p){ const n=String((p&&p.name)||'');
      if(/status\.occupied/i.test(n)) return 'occupied';
      if(/status\.liberated/i.test(n)) return 'liberated';
      if(/status\.unknown/i.test(n)) return 'unknown';
      if(/crimea|cadr|calr|donbas/i.test(n)) return 'crimea';
      if(/liberated|deoccup/i.test(n)) return 'liberated';
      if(/occupied/i.test(n)) return 'occupied';
      return 'other'; }
    function ukrKeyFromData(feats){
      const el=document.getElementById('data-legend-ukrfront'); if(!el) return;
      const key=el.querySelector('.ukr-key'); if(!key) return;
      const polys=feats.filter(f=>f.geometry&&/Polygon/.test(f.geometry.type));
      const groups=new Map();
      polys.forEach(f=>{ const p=f.properties||{}; const s=ukrStatusOf(p); const c=String(p.fill||'#a52714').toLowerCase();
        const g=groups.get(s)||{n:0,colors:{}}; g.n++; g.colors[c]=(g.colors[c]||0)+1; groups.set(s,g); });
      groups.forEach(g=>{ g.color=Object.entries(g.colors).sort((a,b)=>b[1]-a[1])[0][0]; });
      const label=(s)=>({ occupied:window.IntMapLang.t(HOST.lang,"Russian-occupied","ロシア占領地域","Russisch besetzt","Оккупировано Россией","Ocupado por Rusia"),
                          crimea:window.IntMapLang.t(HOST.lang,"Crimea / Donbas (pre-2022)","クリミア・ドンバス（2022年以前）","Krim / Donbas (vor 2022)","Крым / Донбасс (до 2022)","Crimea / Dombás (antes de 2022)"),
                          liberated:window.IntMapLang.t(HOST.lang,"Liberated","解放地域","Befreit","Освобождено","Liberado"),
                          unknown:window.IntMapLang.t(HOST.lang,"Unknown status","状況不明の区域","Status unbekannt","Статус неизвестен","Estado desconocido"),
                          other:window.IntMapLang.t(HOST.lang,"Other claimed area","その他の主張地域","Sonstiges beanspruchtes Gebiet","Прочие спорные территории","Otra zona reclamada") }[s]||s);
      const order=['occupied','crimea','liberated','unknown','other'];
      const rows=order.filter(s=>groups.has(s)).map(s=>{ const g=groups.get(s);
        return '<div style="display:flex;align-items:center;gap:7px;"><span style="width:14px;height:10px;border-radius:2px;flex:none;background:'+g.color+';opacity:0.6;"></span>'+label(s)+' <span style="opacity:0.5;font-size:10px;">('+g.n+')</span></div>'; });
      if(rows.length) key.innerHTML=rows.join('');
    }
    function ukrToggle(on){ state.ukr=on;
      const a=()=>{ if(!ukrEnsure()){ GE().events.once('idle',a); return; } setVis(UKR_IDS,on); if(on) ukrLoad(false).then(()=>{ if(ukrFC) ukrKeyFromData(ukrFC.features); }); };
      a();
      /* ══ ⚠⚠⚠ (#R313) THE READER REVERSED #R30 — THIS LAYER MAY TAKE THEM TO UKRAINE ══════════
         「いや、それを言ったらアメリカ大統領選挙もですよね？ EUも、ウクライナも、両方自動で
           行くようにして。」
         #R30 removed R21's auto-flyTo to honour CONSTITUTION §3 and left a toast in its place — a
         sentence asking the reader to do by hand the one thing the layer needed. The rule is now
         narrowed rather than restored wholesale: js/layer-home.js holds the SET of layers whose data
         only exists in one region, and it alone decides «once per session» and «the reader asked,
         a session restore did not». The toast is gone because the map now answers instead.
         ⚠ The frame is the frontline collection's OWN extent when it has landed — see there. */
      if(on){ try{ window.IntMapLayerHome&&window.IntMapLayerHome.arrive('beta-dl-ukrfront'); }catch(_){} }
      if(on){ if(!ukrTimer) ukrTimer=setInterval(()=>{ if(state.ukr) ukrLoad(true); },10*60*1000); }   /* refresh every 10 min while on */
      else if(ukrTimer){ clearInterval(ukrTimer); ukrTimer=null; }
      try{ if(on&&window._registerLayerOpacity){
            const el=window._registerLayerOpacity('ukrfront',LA('Ukraine frontline (DeepState)','ウクライナ前線（DeepState）','Ukraine-Frontlinie (DeepState)','Линия фронта в Украине (DeepState)','Frente de Ucrania (DeepState)'),UKR_IDS,'beta-dl-ukrfront');
            /* (#R20) proper LEGEND ("Ukraine frontlineは、凡例を作って") — color key for the DeepState classes */
            if(el&&!el.querySelector('.ukr-key')){
              const key=document.createElement('div'); key.className='ukr-key'; key.style.cssText='display:flex;flex-direction:column;gap:4px;margin-top:6px;font-size:11px;color:var(--text-main);';
              const sw=(c,solid)=>'<span style="width:14px;height:'+(solid?'10px':'3px')+';border-radius:2px;flex:none;background:'+c+';'+(solid?'opacity:0.55;':'')+'"></span>';
              key.innerHTML=
                '<div style="display:flex;align-items:center;gap:7px;">'+sw('#a52714',true)+(window.IntMapLang.t(HOST.lang,"Russian-occupied","ロシア占領地域","Russisch besetzt","Оккупировано Россией","Ocupado por Rusia"))+'</div>'+
                '<div style="display:flex;align-items:center;gap:7px;">'+sw('#0f9d58',true)+(window.IntMapLang.t(HOST.lang,"Liberated","解放地域","Befreit","Освобождено","Liberado"))+'</div>'+
                '<div style="display:flex;align-items:center;gap:7px;">'+sw('#bcaaa4',true)+(window.IntMapLang.t(HOST.lang,"Unknown status","状況不明の区域","Status unbekannt","Статус неизвестен","Estado desconocido"))+'</div>';
              const op=el.querySelector('.dl-op-row'); if(op) el.insertBefore(key,op); else el.appendChild(key);
            }
          }
           else if(window._hideGenericLegend) window._hideGenericLegend('ukrfront'); }catch(_){}
    }

    /* ---------- 3D city buildings (OpenFreeMap `building` source-layer → fill-extrusion) ---------- */
    function bldgEnsure(){ if(GE().layers.has('ofm-bldg-3d')) return true; if(!_imCanDraw()) return false;
      try{
        if(!GE().layers.hasSource('ofm')) GE().layers.addSource('ofm',{type:'vector',url:'https://tiles.openfreemap.org/planet',attribution:'© OpenFreeMap © OpenMapTiles © OSM'});
        const before=GE().layers.has('ofm-country')?'ofm-country':(GE().layers.has('tool-poly')?'tool-poly':undefined);
        GE().layers.add({id:'ofm-bldg-3d',type:'fill-extrusion',source:'ofm','source-layer':'building',minzoom:13.5,layout:{visibility:'none'},paint:{
          'fill-extrusion-color':['interpolate',['linear'],['coalesce',['get','render_height'],8],0,'#c7cfdb',25,'#a8b3c5',80,'#8794ad',200,'#67759a',400,'#4d5c85'],
          'fill-extrusion-height':['coalesce',['get','render_height'],8],
          'fill-extrusion-base':['coalesce',['get','render_min_height'],0],
          'fill-extrusion-opacity':0.88}},before);
        return true;
      }catch(_){ return false; } }
    function bldgToggle(on){ state.bldg=on;
      const a=()=>{ if(!bldgEnsure()){ GE().events.once('idle',a); return; } setVis(['ofm-bldg-3d'],on); };
      a();
      try{ if(on&&window._registerLayerOpacity){ const el=window._registerLayerOpacity('bldg3d',LA('3D buildings (cities)','3D建物（都市）','3D-Gebäude (Städte)','3D-здания (города)','Edificios 3D (ciudades)'),['ofm-bldg-3d'],'beta-dl-bldg3d');
             if(el&&!el.querySelector('.bldg-hint')){ const d=document.createElement('div'); d.className='bldg-hint'; d.style.cssText='font-size:10px;color:var(--text-muted);margin-top:5px;'; d.textContent=window.IntMapLang.t(HOST.lang,"Shows from zoom 14. Tilt (3D button / right-drag) to see depth.","ズーム14以上で表示。3D/ドラッグ右クリックで傾けると立体に。","Ab Zoomstufe 14 sichtbar. Neigen (3D-Schaltfläche / Rechtsziehen) zeigt die Tiefe.","Показывается с 14-го зума. Наклоните (кнопка 3D / перетаскивание правой кнопкой), чтобы увидеть объём.","Se muestra a partir del zoom 14. Incline (botón 3D / arrastrar con el botón derecho) para ver el relieve."); el.appendChild(d); } }
           else if(window._hideGenericLegend) window._hideGenericLegend('bldg3d'); }catch(_){}
    }

    /* ---------- Historical borders (aourednik/historical-basemaps; raw.githubusercontent = CORS*) ---------- */
    const HB_IDS=['hb-fill','hb-line','hb-lbl'];
    /* (#R23) 1970 & 1980 REMOVED — they return 404 from aourednik/historical-basemaps (the upstream repo
       has no world_1970/1980.geojson), so those years silently showed nothing ("1970,1980が機能していない").
       Mapping them to a nearby year would misrepresent the borders, so we drop the two dead years and add
       1930 (which exists) — every offered year now actually loads. */
    /* (#R349) 1815 and 1880 join the picker for the same reason js/time-borders.js gained them: the
       clock now reaches 1850 and those are the only two snapshots the upstream repo has below 1900.
       Both were verified to load (world_1815.geojson / world_1880.geojson exist) — the rule this list
       has carried since #R23 is that every year OFFERED here actually resolves, and a year that 404s
       is worse than an absent one because it shows an empty map and says nothing. */
    const HB_YEARS=[1815,1880,1900,1914,1920,1930,1938,1945,1960,1994,2000,2010];
    let hbYear=1920; const hbCache=new Map();
    const HB_PAL=['#e6a176','#7eb6e8','#9fd29a','#e8a4c2','#cbb1e6','#ffd78a','#9adfd2','#e8938c','#b9c98a','#a7b8d9','#dcc4a1','#90c7e0'];
    function hbEnsure(){ if(GE().layers.hasSource('hb-src')) return true; if(!_imCanDraw()) return false;
      try{
        GE().layers.addSource('hb-src',{type:'geojson',data:{type:'FeatureCollection',features:[]},attribution:'historical-basemaps (aourednik)'});
        const before=GE().layers.has('tool-poly')?'tool-poly':undefined;
        GE().layers.add({id:'hb-fill',type:'fill',source:'hb-src',layout:{visibility:'none'},paint:{'fill-color':['coalesce',['get','__col'],'#c9b18a'],'fill-opacity':0.30}},before);
        GE().layers.add({id:'hb-line',type:'line',source:'hb-src',layout:{visibility:'none'},paint:{'line-color':'#5e4a33','line-width':0.9,'line-opacity':0.85}},before);
        GE().layers.add({id:'hb-lbl',type:'symbol',source:'hb-src',minzoom:2.2,layout:{visibility:'none','symbol-placement':'point','text-field':['coalesce',['get','NAME'],['get','name'],''],'text-size':window.IntMapLabelScale.sub(0.9),'text-font':['literal',['Noto Sans Regular']]},paint:{'text-color':'#4a3a26','text-halo-color':'rgba(255,250,240,0.9)','text-halo-width':1.4}},before);
        return true;
      }catch(_){ return false; } }
    async function hbLoad(year){
      const lbl=document.querySelector('#data-legend-histb .hb-year-val'); if(lbl) lbl.textContent=year;
      let fc=hbCache.get(year);
      /* (#R20) "読み込みが遅い" — persistent IndexedDB cache: after the first visit a year swaps in
         instantly from disk, no network round-trip. */
      if(!fc&&window.IntMapCache){ try{ const c=await window.IntMapCache.get('hb_'+year); if(c&&Array.isArray(c.features)){ fc=c; hbCache.set(year,fc); } }catch(_){} }
      if(!fc){
        const note=document.querySelector('#data-legend-histb .hb-note'); if(note) note.textContent=jp()?(year+'年の国境を取得中…'):('Loading '+year+' borders…');
        for(const wrap of PROX){ try{
          const ctrl=new AbortController(); const to=setTimeout(()=>{ try{ctrl.abort();}catch(_){} },20000);
          const r=await fetch(wrap('https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/world_'+year+'.geojson'),{signal:ctrl.signal}); clearTimeout(to);
          if(!r.ok) continue;
          const j=await r.json(); if(!j||!Array.isArray(j.features)) continue;
          j.features.forEach((f,i)=>{ if(!f.properties) f.properties={}; const nm=f.properties.NAME||f.properties.name||String(i);
            let h=0; for(let k=0;k<nm.length;k++) h=(h*31+nm.charCodeAt(k))>>>0; f.properties.__col=HB_PAL[h%HB_PAL.length]; });
          fc=j; hbCache.set(year,fc);
          try{ window.IntMapCache&&window.IntMapCache.set('hb_'+year,fc); }catch(_){}
          break;
        }catch(_){} }
        const note2=document.querySelector('#data-legend-histb .hb-note');
        if(note2) note2.textContent=fc?(window.IntMapLang.t(HOST.lang,"Source: historical-basemaps (boundaries approximate)","出典: historical-basemaps（境界は概略）","Quelle: historical-basemaps (Grenzen näherungsweise)","Источник: historical-basemaps (границы приблизительные)","Fuente: historical-basemaps (fronteras aproximadas)")):(window.IntMapLang.t(HOST.lang,"Could not load.","取得できませんでした。","Laden fehlgeschlagen.","Не удалось загрузить.","No se pudo cargar."));
      } else {
        const note=document.querySelector('#data-legend-histb .hb-note');
        if(note) note.textContent=window.IntMapLang.t(HOST.lang,"Source: historical-basemaps (boundaries approximate)","出典: historical-basemaps（境界は概略）","Quelle: historical-basemaps (Grenzen näherungsweise)","Источник: historical-basemaps (границы приблизительные)","Fuente: historical-basemaps (fronteras aproximadas)");
      }
      if(fc&&hbYear===year){ try{ GE().layers.setSourceData('hb-src',fc); }catch(_){} }
      /* warm the neighboring years in the background so slider scrubbing is instant */
      try{ const i=HB_YEARS.indexOf(year); [HB_YEARS[i-1],HB_YEARS[i+1]].forEach(y=>{ if(y&&!hbCache.has(y)) setTimeout(()=>{ if(state.hist&&!hbCache.has(y)) hbPrefetch(y); },1200); }); }catch(_){}
    }
    async function hbPrefetch(year){
      if(hbCache.has(year)) return;
      try{ if(window.IntMapCache){ const c=await window.IntMapCache.get('hb_'+year); if(c&&Array.isArray(c.features)){ hbCache.set(year,c); return; } } }catch(_){}
      for(const wrap of PROX){ try{
        const r=await fetch(wrap('https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson/world_'+year+'.geojson')); if(!r.ok) continue;
        const j=await r.json(); if(!j||!Array.isArray(j.features)) continue;
        j.features.forEach((f,i)=>{ if(!f.properties) f.properties={}; const nm=f.properties.NAME||f.properties.name||String(i);
          let h=0; for(let k=0;k<nm.length;k++) h=(h*31+nm.charCodeAt(k))>>>0; f.properties.__col=HB_PAL[h%HB_PAL.length]; });
        hbCache.set(year,j); try{ window.IntMapCache&&window.IntMapCache.set('hb_'+year,j); }catch(_){}
        return;
      }catch(_){} }
    }
    function hbToggle(on){ state.hist=on;
      const a=()=>{ if(!hbEnsure()){ GE().events.once('idle',a); return; } setVis(HB_IDS,on); if(on) hbLoad(hbYear); };
      a();
      try{
        if(on&&window._registerLayerOpacity){
          const el=window._registerLayerOpacity('histb',LA('Historical borders','過去の国境','Historische Grenzen','Исторические границы','Fronteras históricas'),HB_IDS,'beta-dl-histb');
          if(el&&!el.querySelector('.hb-year-row')){
            const row=document.createElement('div'); row.className='hb-year-row'; row.style.cssText='font-size:11px;color:var(--text-muted);margin-top:6px;display:flex;align-items:center;gap:7px;';
            const note=document.createElement('div'); note.className='hb-note'; note.style.cssText='font-size:10px;color:var(--text-muted);margin-top:8px;';
            const isMob=(typeof isMobile==='function'&&isMobile());
            if(isMob){
              /* (#R22) MOBILE: a native iOS pulldown of the available years instead of the fiddly slider
                 ("Historic bordersの凡例は、モバイル版ではiOS対応のプルダウンに"). */
              row.innerHTML=(window.IntMapLang.t(HOST.lang,"Year","年代","Jahr","Год","Año"))+' <select class="hb-year-sel" style="flex:1;min-width:0;font-size:14px;padding:7px 9px;border-radius:8px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);">'+
                HB_YEARS.map(y=>'<option value="'+y+'"'+(y===hbYear?' selected':'')+'>'+y+'</option>').join('')+'</select>';
              el.appendChild(row); el.appendChild(note);
              row.querySelector('.hb-year-sel').addEventListener('change',(e)=>{ hbYear=+e.target.value||1920; hbLoad(hbYear); });
            } else {
              /* (#R21) Tick alignment fix: ticks live INSIDE the same flex cell as the range input,
                 each positioned at the exact center of its thumb stop. */
              row.style.alignItems='flex-start';
              row.innerHTML=(window.IntMapLang.t(HOST.lang,"Year","年代","Jahr","Год","Año"))+' <span class="hb-slider-wrap" style="flex:1;position:relative;display:block;min-width:0;">'+
                '<input type="range" min="0" max="'+(HB_YEARS.length-1)+'" step="1" value="'+HB_YEARS.indexOf(hbYear)+'" style="width:100%;display:block;margin:0;box-sizing:border-box;">'+
                '<span class="hb-ticks" style="display:block;position:relative;height:15px;">'+
                HB_YEARS.map((y,i)=>'<span style="position:absolute;top:1px;left:calc(8px + (100% - 16px) * '+(i/(HB_YEARS.length-1)).toFixed(4)+');transform:translateX(-50%);font-size:8.5px;color:var(--text-muted);white-space:nowrap;">'+String(y).slice(2)+'</span>').join('')+
                '</span></span> <b class="hb-year-val" style="color:var(--text-main);min-width:38px;text-align:right;">'+hbYear+'</b>';
              el.appendChild(row); el.appendChild(note);
              row.querySelector('input').addEventListener('input',(e)=>{ hbYear=HB_YEARS[+e.target.value]||1920; const v=el.querySelector('.hb-year-val'); if(v) v.textContent=hbYear; clearTimeout(hbToggle._t); hbToggle._t=setTimeout(()=>hbLoad(hbYear),250); });
            }
          }
        } else if(window._hideGenericLegend) window._hideGenericLegend('histb');
      }catch(_){}
    }
    /* (#R94) Historical borders follow the master clock: travel to a year → the nearest snapshot at/before it;
       back to "Now" → the newest snapshot (2010). Only reloads the geojson while the layer is on. */
    try{ if(window.IntMapTime) window.IntMapTime.on(e=>{
      let ny; if(e.isLive) ny=HB_YEARS[HB_YEARS.length-1]; else { ny=HB_YEARS[0]; for(const v of HB_YEARS){ if(v<=e.year) ny=v; } }
      if(ny===hbYear) return; hbYear=ny;
      try{ const val=document.querySelector('#data-legend-histb .hb-year-val'); if(val) val.textContent=hbYear;
        const rg=document.querySelector('#data-legend-histb .hb-year-row input[type=range]'); if(rg) rg.value=HB_YEARS.indexOf(hbYear);
        const se=document.querySelector('#data-legend-histb .hb-year-sel'); if(se) se.value=hbYear; }catch(_){}
      if(state.hist){ clearTimeout(hbToggle._kt); hbToggle._kt=setTimeout(()=>hbLoad(hbYear),260); }
    }); }catch(_){}

    /* ══ (#R20 / #R353) VOLCANOES — the Smithsonian GVP Holocene catalog ══════════════════════
       Bundled locally as data/volcanoes_gvp.json (scripts/build-volcanoes.mjs, from the GVP WFS).
       ⚠ (#R353) THE THREE COLOURS WERE THE WHOLE OF WHAT THE FILE KNEW. Until this round the layer
       carried six properties per volcano and no GVP volcano number, so «1950年以降 / 1500年以降 /
       古い・不明» was not a choice about depth — it was the only question the data could answer. The
       file now carries the join key (`v`) and four more measured numbers per volcano — largest VEI
       in its own eruption record (`x`), confirmed eruptions (`q`), people within 30 km (`p`),
       magma composition and tectonic setting as indices into the file's own vocabularies (`k`,`s`)
       — and the layer draws with them:

         · COLOUR is one of four questions the reader picks (last eruption / explosivity / what an
           observatory is saying right now / how many people live around it). The legend switches it.
         · RADIUS always encodes the largest VEI that volcano has actually produced, in every mode,
           so «how explosive» and «the chosen question» are two independent channels rather than one.
         · A HALO marks the volcanoes an observatory has something to say about today — drawn from
           the live status ladder in js/volcano-intel.js, never from the catalog.

       ⚠ THE COUNT IS READ FROM THE FILE, NEVER TYPED. It was «1,215» in six places and the upstream
       catalog now holds 1,214; a number written down in six places is a number that will disagree
       with itself the next time the Smithsonian revises the catalog. ---------- */
    const VL_IDS=['volc2-halo','volc2-pt','volc2-lbl'];
    let volcFC=null, volcLoading=false, volcMode='recency';
    const VOLC_MODES=['recency','vei','status','people'];
    const nowYear=()=>{ try{ return window.IntMapTime.year(); }catch(_){ return new Date().getFullYear(); } };

    /* radius: the largest VEI this volcano has produced, on top of the zoom ramp. An undated volcano
       with no VEI on record sits at the VEI-1 size rather than at zero — absence of a record is not
       a record of a small eruption. */
    const VOLC_SIZE=['+',0.65,['*',0.14,['max',0,['coalesce',['get','x'],1]]]];
    const volcRadius=['interpolate',['linear'],['zoom'],
      1,['*',2.2,VOLC_SIZE], 5,['*',4.6,VOLC_SIZE], 9,['*',8,VOLC_SIZE]];
    /* ⚠ THE HALO NEEDS ITS OWN TOP-LEVEL `interpolate`, NOT `['*', 2.6, volcRadius]`.
       MapLibre requires a `zoom` expression to be the OUTERMOST expression of a paint property, and
       it does not THROW when it is not: `addLayer` validates, fires an ErrorEvent and skips the
       layer. So the multiplied form left `volc2-halo` silently absent — the layer file loaded, the
       points drew, the colour modes worked, and the one thing that marks the volcanoes an
       observatory is speaking about today was simply not on the map. Found in production
       verification, in the console, after every local test had passed (#R353 追記). */
    const volcHaloRadius=['interpolate',['linear'],['zoom'],
      1,['*',5.72,VOLC_SIZE], 5,['*',11.96,VOLC_SIZE], 9,['*',20.8,VOLC_SIZE]];

    function volcColor(mode){
      const y=['coalesce',['get','y'],-99999];
      if(mode==='vei')
        return ['step',['coalesce',['get','x'],-1],'#6b7280', 0,'#4c8dff', 1,'#39c07c', 2,'#d8c53a',
                3,'#f0912d', 4,'#ef5b2b', 5,'#e02f2f', 6,'#b01f6a', 7,'#7a1fb0'];
      if(mode==='status')
        return ['step',['coalesce',['get','st'],-1],'#6b7280', 0,'#3ba55d', 1,'#8fbf3f', 2,'#e8c53a',
                3,'#f08a2d', 4,'#e0332f'];
      if(mode==='people')
        return ['step',['coalesce',['get','p'],-1],'#6b7280', 0,'#4c8dff', 1000,'#39c07c',
                10000,'#d8c53a', 100000,'#f0912d', 1000000,'#e02f2f'];
      /* recency — the original question, with «erupting or erupted this year» split out of «since 1950» */
      return ['case',['>=',y,nowYear()-1],'#ff2d20',['>=',y,1950],'#ff6a3d',['>=',y,1500],'#ffab4d',
              ['>',y,-99999],'#c98f6b','#8e8e93'];
    }
    function volcEnsure(){ if(GE().layers.hasSource('volc2-src')) return true; if(!_imCanDraw()) return false;
      try{
        GE().layers.addSource('volc2-src',{type:'geojson',data:volcFC||{type:'FeatureCollection',features:[]},attribution:'Smithsonian GVP'});
        const before=GE().layers.has('tool-poly')?'tool-poly':undefined;
        /* the halo goes UNDER the points: it is a second claim about the same dot, not a bigger dot */
        GE().layers.add({id:'volc2-halo',type:'circle',source:'volc2-src',layout:{visibility:'none'},
          filter:['>=',['coalesce',['get','st'],-1],2],
          paint:{'circle-radius':volcHaloRadius,'circle-color':['step',['coalesce',['get','st'],-1],'#6b7280',2,'#e8c53a',3,'#f08a2d',4,'#e0332f'],
                 'circle-opacity':0.24,'circle-blur':0.55}},before);
        GE().layers.add({id:'volc2-pt',type:'circle',source:'volc2-src',layout:{visibility:'none'},paint:{
          'circle-radius':volcRadius,
          'circle-color':volcColor(volcMode),
          'circle-stroke-color':'#fff2e0','circle-stroke-width':0.9,'circle-opacity':0.92}},before);
        GE().layers.add({id:'volc2-lbl',type:'symbol',source:'volc2-src',minzoom:5,layout:{visibility:'none','text-field':['get','n'],'text-size':window.IntMapLabelScale.sub(0.82),'text-offset':[0,1.05],'text-anchor':'top','text-font':['literal',['Noto Sans Regular']]},paint:{'text-color':'#ffc8ad','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.2}},before);
        /* ⚠ (#R353) A CLICK NOW OPENS THE INTELLIGENCE CARD, and the four-line popup it replaces is
           kept only as the answer when that module cannot be downloaded — a feature that silently
           stops existing is this project's most expensive recurring defect. */
        GE().events.onLayer('click','volc2-pt',e=>{ const f=e.features&&e.features[0]; if(!f) return; const p=f.properties||{};
          if(p.v!=null){ try{ window.IntMapLazy.need('volcanoIntel').then(ok=>{
              if(ok&&window.IntMapVolcano) window.IntMapVolcano.open(+p.v); else volcMiniPopup(f,p); }); return; }catch(_){} }
          volcMiniPopup(f,p);
        });
        GE().events.onLayer('mouseenter','volc2-pt',()=>{ GE().render.canvas().style.cursor='pointer'; });
        GE().events.onLayer('mouseleave','volc2-pt',()=>{ GE().render.canvas().style.cursor=''; });
        return true;
      }catch(_){ return false; } }
    let popup=null;
    function volcMiniPopup(f,p){
      const yr=(p.y==null||p.y==='null')?(window.IntMapLang.t(HOST.lang,"No dated eruption","噴火記録なし","Kein datierter Ausbruch","Датированных извержений нет","Sin erupción datada")):((p.y<0?(jp()?('紀元前'+(-p.y)):('BCE '+(-p.y))):p.y)+(window.IntMapLang.t(HOST.lang," last eruption","年に最終噴火"," letzter Ausbruch"," последнее извержение"," última erupción")));
      const html='<div style="min-width:160px;"><div style="font-weight:700;font-size:14px;color:var(--text-main);">🌋 '+(p.n||'')+'</div><div style="font-size:12px;color:var(--text-muted);margin-top:3px;">'+(p.c||'')+(p.e!=null&&p.e!=='null'?' · '+p.e+' m':'')+'<br>'+(p.t||'')+'<br>'+yr+'</div></div>';
      try{ if(popup) popup.remove(); }catch(_){}
      try{ popup=GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,className:'plc-popup',maxWidth:'280px'}).setLngLat(f.geometry.coordinates).setHTML(html)); }catch(_){}
    }
    async function volcLoad(){ if(volcFC){ try{ GE().layers.setSourceData('volc2-src',volcFC); }catch(_){} return; }
      if(volcLoading) return; volcLoading=true;
      try{ const r=await fetch('data/volcanoes_gvp.json'); const j=await r.json();
        if(j&&Array.isArray(j.features)){ volcFC=j; try{ GE().layers.setSourceData('volc2-src',volcFC); }catch(_){} volcLegend(); }
      }catch(_){ try{ imToast(window.IntMapLang.t(HOST.lang,"Could not load volcano data","火山データを読み込めませんでした","Vulkandaten konnten nicht geladen werden","Не удалось загрузить данные о вулканах","No se pudieron cargar los datos de volcanes")); }catch(_){} }
      volcLoading=false; }

    /* ⚠ THE LIVE STATUS IS WRITTEN ONTO THE FEATURES, NOT LOOKED UP AT PAINT TIME. A paint
       expression cannot call a function, and 1,214 point updates is one setSourceData. `st` is
       ABSENT for every volcano no observatory has spoken about — which is what makes «nothing is
       published here» a distinct colour from «an observatory says it is normal». */
    function volcApplyStatus(){
      if(!volcFC||!window.IntMapVolcano) return false;
      let idx; try{ idx=window.IntMapVolcano.statusIndex(); }catch(_){ return false; }
      let n=0;
      for(const f of volcFC.features){
        const st=idx.get(f.properties.v);
        if(st&&st.rank!=null){ f.properties.st=st.rank; n++; }
        else if('st' in f.properties) delete f.properties.st;
      }
      try{ GE().layers.setSourceData('volc2-src',volcFC); }catch(_){}
      volcLegend(); return n;
    }
    function volcSetMode(m){
      if(VOLC_MODES.indexOf(m)<0) return false;
      volcMode=m;
      try{ if(GE().layers.has('volc2-pt')) GE().layers.setPaint('volc2-pt','circle-color',volcColor(m)); }catch(_){}
      if(m==='status'&&state.volc){ try{ window.IntMapLazy.need('volcanoIntel').then(ok=>{ if(ok&&window.IntMapVolcano) window.IntMapVolcano.warm().then(volcApplyStatus); }); }catch(_){} }
      volcLegend(); return true;
    }

    /* the legend: the mode switch, the key for the mode that is on, and — for the status mode — the
       three states the ladder can be in, said in words. */
    function volcLegend(){
      if(!state.volc){ try{ window._hideGenericLegend&&window._hideGenericLegend('volc2'); }catch(_){} return; }
      try{
        if(!window._registerLayerOpacity) return;
        const el=window._registerLayerOpacity('volc2',LA('Volcanoes (GVP Holocene)','火山（GVP完新世）','Vulkane (GVP, Holozän)','Вулканы (GVP, голоцен)','Volcanes (GVP, Holoceno)'),VL_IDS,'beta-dl-volc2');
        if(!el) return;
        let key=el.querySelector('.volc-key');
        if(!key){ key=document.createElement('div'); key.className='volc-key';
          const op=el.querySelector('.dl-op-row'); if(op) el.insertBefore(key,op); else el.appendChild(key);
          key.addEventListener('click',(ev)=>{ const b=ev.target&&ev.target.closest?ev.target.closest('[data-vmode]'):null;
            if(b) volcSetMode(b.dataset.vmode); }); }
        const SF=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
        const dot=(c)=>'<span class="volc-dot" style="background:'+c+'"></span>';
        const line=(c,t2)=>'<div class="volc-key-row">'+dot(c)+SF(t2)+'</div>';
        const MODE_LABEL={ recency:L('Last eruption','最終噴火','Letzter Ausbruch','Последнее извержение','Última erupción'),
          vei:L('Explosivity','爆発規模','Explosivität','Взрывная сила','Explosividad'),
          status:L('Now','現在','Jetzt','Сейчас','Ahora'),
          people:L('People nearby','周辺人口','Menschen in der Nähe','Население рядом','Población cercana') };
        let body='<div class="volc-modes">'+VOLC_MODES.map(m=>'<button type="button" class="volc-mode'+(volcMode===m?' on':'')+'" data-vmode="'+m+'">'+SF(MODE_LABEL[m])+'</button>').join('')+'</div>';
        if(volcMode==='recency'){
          body+=line('#ff2d20',L('Erupting or erupted this year','今年噴火／噴火中','Ausbruch in diesem Jahr','Извергается или извергался в этом году','En erupción o con erupción este año'))
            +line('#ff6a3d',L('Erupted since 1950','1950年以降に噴火','Ausbruch seit 1950','Извергался с 1950 года','Con erupción desde 1950'))
            +line('#ffab4d',L('Erupted since 1500','1500年以降に噴火','Ausbruch seit 1500','Извергался с 1500 года','Con erupción desde 1500'))
            +line('#c98f6b',L('Older dated eruption','それ以前の噴火記録','Älterer datierter Ausbruch','Более раннее датированное извержение','Erupción datada anterior'))
            +line('#8e8e93',L('No dated eruption','噴火の記録なし','Kein datierter Ausbruch','Датированных извержений нет','Sin erupción datada'));
        } else if(volcMode==='vei'){
          body+=line('#4c8dff','VEI 0')+line('#39c07c','VEI 1')+line('#d8c53a','VEI 2')+line('#f0912d','VEI 3')
            +line('#ef5b2b','VEI 4')+line('#e02f2f','VEI 5')+line('#b01f6a','VEI 6')+line('#7a1fb0','VEI 7')
            +line('#6b7280',L('No VEI on record','VEIの記録なし','Kein VEI erfasst','VEI не зафиксирован','Sin VEI registrado'))
            +'<div class="volc-key-note">'+SF(L('The largest VEI this volcano has actually produced, from its own eruption record.','その火山自身の噴火記録にある最大のVEI。','Der größte VEI, den dieser Vulkan tatsächlich erzeugt hat.','Наибольший VEI, который этот вулкан действительно производил.','El mayor VEI que este volcán ha producido realmente.'))+'</div>';
        } else if(volcMode==='status'){
          body+=line('#e0332f',L('Warning / RED','警報級／RED','Warnung / RED','Тревога / RED','Aviso / RED'))
            +line('#f08a2d',L('Watch / ORANGE','警戒／ORANGE','Beobachtung / ORANGE','Внимание / ORANGE','Vigilancia / ORANGE'))
            +line('#e8c53a',L('Advisory / YELLOW','注意／YELLOW','Hinweis / YELLOW','Предупреждение / YELLOW','Aviso / YELLOW'))
            +line('#8fbf3f',L('Watched, at its baseline','常時観測・平常','Überwacht, Grundzustand','Наблюдается, базовый уровень','Vigilado, en su nivel base'))
            +line('#3ba55d',L('Normal / GREEN','平常／GREEN','Normalstufe / GREEN','Норма / GREEN','Nivel normal / GREEN'))
            +line('#6b7280',L('No observatory statement published','公表している観測機関なし','Keine Angabe eines Observatoriums','Заявлений обсерваторий нет','Sin declaración de observatorio'))
            +'<div class="volc-key-note">'+SF(L('Grey is not “calm”. It means no volcano observatory publishes a current level for that volcano in a form a map can read — USGS covers the United States, JMA covers Japan, and the Smithsonian/USGS weekly report covers whatever was reported this week anywhere.','灰色は「静穏」ではありません。その火山について、現在の警戒レベルを地図が読める形で公表している観測機関が無いという意味です。USGS は米国、気象庁は日本、スミソニアン／USGS 週間報告は今週報告された世界中の火山を扱います。','Grau heißt nicht „ruhig“. Es heißt, dass kein Observatorium für diesen Vulkan eine maschinenlesbare aktuelle Stufe veröffentlicht — USGS deckt die USA ab, JMA Japan, der wöchentliche Bericht alles, was diese Woche gemeldet wurde.','Серый — не «спокоен». Это значит, что ни одна обсерватория не публикует машиночитаемый текущий уровень: USGS охватывает США, JMA — Японию, еженедельный отчёт — то, о чём сообщили на этой неделе.','El gris no significa «en calma». Significa que ningún observatorio publica un nivel actual legible por máquina: el USGS cubre EE. UU., la JMA cubre Japón, y el informe semanal cubre lo que se haya reportado esta semana.'))+'</div>';
        } else {
          body+=line('#e02f2f',L('1 million or more within 30 km','30 km 以内に100万人以上','1 Mio. oder mehr im Umkreis von 30 km','1 млн и более в радиусе 30 км','1 millón o más en 30 km'))
            +line('#f0912d',L('100,000 – 1 million','10万〜100万人','100.000 – 1 Mio.','100 тыс. – 1 млн','100.000 – 1 millón'))
            +line('#d8c53a',L('10,000 – 100,000','1万〜10万人','10.000 – 100.000','10 тыс. – 100 тыс.','10.000 – 100.000'))
            +line('#39c07c',L('1,000 – 10,000','1千〜1万人','1.000 – 10.000','1 тыс. – 10 тыс.','1.000 – 10.000'))
            +line('#4c8dff',L('Under 1,000','1千人未満','Unter 1.000','Менее 1 тыс.','Menos de 1.000'))
            +line('#6b7280',L('No figure published','公表値なし','Keine Angabe','Нет данных','Sin cifra publicada'));
        }
        body+='<div class="volc-key-note">'+SF(L('Dot size is the largest VEI on record, in every mode.','点の大きさは、どのモードでも記録された最大VEIを表します。','Die Punktgröße ist in jedem Modus der größte erfasste VEI.','Размер точки во всех режимах — наибольший зафиксированный VEI.','El tamaño del punto es el mayor VEI registrado, en todos los modos.'))+'</div>';
        const n=volcFC?volcFC.features.length:0;
        body+='<div class="volc-key-src">'+SF('Smithsonian GVP'+(n?' · '+n.toLocaleString(window.IntMapLang.locale(HOST.lang,'en-GB'))+L(' Holocene volcanoes','座（完新世）',' holozäne Vulkane',' вулканов голоцена',' volcanes del Holoceno'):''))+'</div>';
        key.innerHTML=body;
      }catch(_){}
    }

    function volcToggle(on){ state.volc=on;
      const a=()=>{ if(!volcEnsure()){ GE().events.once('idle',a); return; } setVis(VL_IDS,on); if(on) volcLoad(); };
      a();
      volcLegend();
      /* switching the layer on warms the status ladder once, so the «Now» mode is not empty the
         first time it is picked. It is one request per feed and they are shared with the card. */
      if(on){ try{ window.IntMapLazy.hint('volcanoIntel'); }catch(_){} }
    }
    /* js/volcano-intel.js and Atlas reach the layer through this, deliberately NOT under an
       `IntMap*` name: js/atlas-controls.js discovers capabilities by enumerating window.IntMap*, and
       a second volcano-named global would offer the planner a subsystem nothing dispatches (#R320). */
    window.__imVolcLayer={ data:()=>volcFC, mode:()=>volcMode, setMode:volcSetMode, modes:()=>VOLC_MODES.slice(),
      applyStatus:volcApplyStatus, on:()=>state.volc, count:()=>volcFC?volcFC.features.length:0 };

    /* the three overlay rows. ⚠ The checkbox is put BACK to unchecked if the module cannot be
       downloaded — a switch that stays on while nothing is drawn is the silent-hole shape this
       project keeps rediscovering (#R209's whole premise). */
    function volcOverlay(which,on){
      if(!on){ try{ if(window.IntMapVolcanoLayers) window.IntMapVolcanoLayers[which](false); }catch(_){} return; }
      try{
        window.IntMapLazy.need('volcanoLayers').then(ok=>{
          if(ok&&window.IntMapVolcanoLayers){ window.IntMapVolcanoLayers[which](true); return; }
          const cb=document.getElementById('beta-dl-volc'+(which==='hazard'?'haz':which));
          if(cb){ cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on'); }
          try{ imToast(window.IntMapLang.t(HOST.lang,'Could not load the volcano overlays','火山オーバーレイを読み込めませんでした','Vulkan-Overlays konnten nicht geladen werden','Не удалось загрузить слои вулканов','No se pudieron cargar las capas volcánicas')); }catch(_){}
        });
      }catch(_){}
    }

    /* ══ (#R353) THE KERNEL COMMANDS ═══════════════════════════════════════════════════════════
       CONSTITUTION §: every feature is operable from Atlas, and the way that is true is that the
       button and Atlas call the SAME registered command — not that Atlas simulates a click. Five
       commands, registered here because this file is EAGER and the two modules behind them are not:
       a command that only exists after its module is downloaded is a capability Atlas cannot offer.
       `js/atlas-controls.js` enumerates window.IntMap* for the module catalog, and js/lazy-modules.js
       publishes `IntMapVolcano` / `IntMapVolcanoLayers` in its manifest from boot, so the planner can
       name the subsystem before the code for it exists (#R320). */
    try{
      const OS=window.IntMapOS;
      if(OS&&OS.register){
        OS.register('volcano.open',(ctx)=>{
          const p=(ctx&&ctx.params)||{};
          return window.IntMapLazy.need('volcanoIntel').then(ok=>{
            if(!ok||!window.IntMapVolcano) return {ok:false,err:'volcano module unavailable'};
            let v=p.v!=null?+p.v:null;
            if(v==null&&p.name){ const hit=window.IntMapVolcano.byName(p.name)[0]; if(hit) v=hit.v; }
            if(v==null) return {ok:false,err:'no volcano named'};
            /* switching the layer on first: a card about a dot the reader cannot see is half an answer */
            try{ const cb=document.getElementById('beta-dl-volc2'); if(cb&&!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change')); } }catch(_){}
            return { ok:!!window.IntMapVolcano.open(v) };
          });
        },{label:'Volcano intelligence card',group:'volcano'});
        OS.register('volcano.mode',(ctx)=>({ ok:volcSetMode(((ctx&&ctx.params)||{}).mode) }),
          {label:'Volcano map colour mode',group:'volcano'});
        [['volcano.ash','ash','Volcanic ash areas (SIGMET)','beta-dl-volcash'],
         ['volcano.hazard','hazard','Volcano hazard zones (USGS)','beta-dl-volchaz'],
         ['volcano.so2','so2','Satellite SO₂ column','beta-dl-volcso2']].forEach(([id,which,label,cbId])=>{
          OS.register(id,(ctx)=>{
            const on=((ctx&&ctx.params)||{}).on!==false;
            try{ const cb=document.getElementById(cbId); if(cb&&cb.checked!==on){ cb.checked=on; cb.dispatchEvent(new Event('change')); return {ok:true}; } }catch(_){}
            volcOverlay(which,on); return {ok:true};
          },{label,group:'volcano',btn:cbId});
        });
      }
    }catch(_){}

    /* ---------- rows in the Layers panel (histb/ukrfront now file into "Strategic geography" via
       reorganizeLayerPanel — promoted out of beta (#R20); bldg3d + volc2 stay in Others(beta)) ---------- */
    /* ⚠ (#R251) ENGLISH FIRST, AND RESOLVED THROUGH pick(). These four were `[ja, en]` read by
       `jp()?BLBL[k][0]:BLBL[k][1]` — the English string was in slot 1, so even the positional
       languages could not have been added without reversing the row, and the inline table is keyed
       by the English source string, which was not in slot 0. */
    const BLBL={ukrfront:LA('Ukraine frontline (live)','ウクライナ前線（リアルタイム）','Ukraine-Frontlinie (live)','Линия фронта в Украине (в реальном времени)','Frente de Ucrania (en vivo)'),bldg3d:LA('3D buildings (cities)','3D建物（都市）','3D-Gebäude (Städte)','3D-здания (города)','Edificios 3D (ciudades)'),histb:LA('Historical borders','過去の国境','Historische Grenzen','Исторические границы','Fronteras históricas'),volc2:LA('Volcanoes — full Holocene catalog','火山 — 完新世カタログ全件','Vulkane — vollständiger Holozän-Katalog','Вулканы — полный каталог голоцена','Volcanes — catálogo completo del Holoceno'),
      volcash:LA('Volcanic ash areas in force (SIGMET)','有効な火山灰域（SIGMET）','Gültige Vulkanasche-Gebiete (SIGMET)','Действующие зоны вулканического пепла (SIGMET)','Zonas de ceniza volcánica vigentes (SIGMET)'),
      volchaz:LA('Volcano hazard zones (USGS)','火山ハザード域（USGS）','Vulkangefahrenzonen (USGS)','Зоны вулканической опасности (USGS)','Zonas de peligro volcánico (USGS)'),
      volcso2:LA('Satellite SO₂ column (OMPS)','衛星 SO₂ 全量（OMPS）','Satelliten-SO₂-Säule (OMPS)','Столб SO₂ со спутника (OMPS)','Columna de SO₂ satelital (OMPS)')};
    function buildUI(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('beta-dl-ukrfront')) return;
      function row(id,label,sw){ const w=document.createElement('div'); w.className='lyr-row'; w.innerHTML='<label class="layer-option"><input type="checkbox" id="'+id+'"> <span class="lyr-sw" style="background:'+sw+'"></span> <span id="'+id+'-lbl">'+label+'</span></label>'; dd.appendChild(w); return w.querySelector('input'); }
      /* ⚠ (#R353) THE COUNT CAME OUT OF THE ROW LABEL. It read 「全1,215座」 in five languages while
         the catalog holds 1,214 — the legend now prints the number the FILE has, so a Smithsonian
         revision can never make the label a lie again.
         (#R353) …and the three overlays join the same panel rather than hiding inside the card: a
         feature reachable only from a popup is a feature most readers never learn exists. Each one
         fetches js/volcano-layers.js on its FIRST switch-on and nothing before that. */
      [['ukrfront','#d62b2b',ukrToggle],['bldg3d','#8794ad',bldgToggle],['volc2','#ff6a3d',volcToggle],
       ['volcash','#7b5cff',(on)=>volcOverlay('ash',on)],['volchaz','#d1381f',(on)=>volcOverlay('hazard',on)],
       ['volcso2','#8ad3c8',(on)=>volcOverlay('so2',on)]].forEach(([k,sw,fn])=>{   /* (#R122) 'histb' (Historical borders overlay) removed per request — the time-machine's own past-year borders remain */
        const cb=row('beta-dl-'+k, L.arr(BLBL[k]), sw);
        cb.addEventListener('change',e=>{ e.target.closest('.lyr-row').classList.toggle('on',e.target.checked); fn(e.target.checked); });
      });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){}
    }
    if(document.readyState!=='loading') setTimeout(buildUI,0); else document.addEventListener('DOMContentLoaded',buildUI);
    /* == (#R271) THE THREE ROWS THAT WERE JAPANESE IN EVERY OTHER LANGUAGE ======================
       #R270 reported 「3D建物（都市）」「火山（GVP完新世・全1,215座）」「ウクライナ前線（リアルタイム）」
       as still Japanese in the English UI and left it as out of scope. The cause is one line, and it
       is the ninth translation shape #R242 named: a two-branch `jp() ? … : …` over a table whose
       slot 0 is ENGLISH and slot 1 is Japanese. The branches were the wrong way round, so a Japanese
       reader got English and EVERY OTHER LANGUAGE got Japanese — measured on the built page, the
       English layer panel printed all three Japanese names. `buildUI` above is correct (`L.arr`), so
       the row was right until the first language event and wrong from then on.
       WARNING a two-branch ternary cannot serve nine languages whichever way round it is. */
    function relabel(){ Object.keys(BLBL).forEach(k=>{ const e=document.getElementById('beta-dl-'+k+'-lbl'); if(e) e.textContent=L.arr(BLBL[k]); }); }
    window.addEventListener('intmap-lang',()=>setTimeout(relabel,20));
    /* self-heal across basemap swaps */
    GE().events.on('styledata',()=>{ if(state.ukr||state.bldg||state.hist||state.volc){ setTimeout(()=>{
      if(state.ukr&&ukrEnsure()){ setVis(UKR_IDS,true); if(ukrFC){ try{ GE().layers.setSourceData('ukr-src',ukrFC); }catch(_){} } }
      if(state.bldg&&bldgEnsure()) setVis(['ofm-bldg-3d'],true);
      if(state.hist&&hbEnsure()){ setVis(HB_IDS,true); const fc=hbCache.get(hbYear); if(fc){ try{ GE().layers.setSourceData('hb-src',fc); }catch(_){} } }
      if(state.volc&&volcEnsure()){ setVis(VL_IDS,true); if(volcFC){ try{ GE().layers.setSourceData('volc2-src',volcFC); }catch(_){} } }
    },80); } });
    /* (#R21) under memory pressure, keep only the displayed year's borders */
    window.addEventListener('intmap-mem-pressure',()=>{ try{ const keep=hbCache.get(hbYear); hbCache.clear(); if(keep&&state.hist) hbCache.set(hbYear,keep); }catch(_){} });
    window.IntMapBeta={ukrToggle,bldgToggle,hbToggle,volcToggle,hbCurrent:()=>({year:hbYear,fc:hbCache.get(hbYear)||null})};
  })();
};
