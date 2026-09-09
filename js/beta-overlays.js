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
import { everyTick, stopTick } from './runtime.js';   /* (#R408) the one timer wheel — see js/runtime.js */
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
    const state={ukr:false,bldg:false,hist:false,volc:false,whs:false,radobs:false};
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
      if(on){ if(!ukrTimer) ukrTimer=everyTick('beta-overlays:ukr-frontline',10*60*1000,()=>{ if(state.ukr) ukrLoad(true); }); }   /* refresh every 10 min while on */
      else if(ukrTimer){ stopTick(ukrTimer); ukrTimer=null; }
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
          filter:['all',HALO_BASE].concat(volcFilterTerms()),
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
      /* ⚠ (#R395) this is the module-unavailable fallback, so the vocabulary may or may not be here.
         When it is, the country and the type are shown in the reader's language like everywhere else;
         when it is not, the catalog's own English is a truthful answer and an empty line is not. */
      const V=window.IntMapVolcano;
      const cN=(V&&V.countryName)?V.countryName(p.c):(p.c||'');
      const tN=(V&&V.term)?V.term('type',p.t):(p.t||'');
      const html='<div style="min-width:160px;"><div style="font-weight:700;font-size:14px;color:var(--text-main);">🌋 '+(p.n||'')+'</div><div style="font-size:12px;color:var(--text-muted);margin-top:3px;">'+(cN||'')+(p.e!=null&&p.e!=='null'?' · '+p.e+' m':'')+'<br>'+(tN||'')+'<br>'+yr+'</div></div>';
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

    /* ══ (#R395) NARROWING THE 1,214 DOWN TO A QUESTION ═══════════════════════════════════════════
       The catalog answers four questions in colour, and colour alone cannot answer «show me only
       the ones that matter for THIS question» — 1,214 dots stay 1,214 dots. These four predicates
       are independent and AND together; each is a property the bundled file already carries, so
       nothing is fetched and nothing is estimated.
       ⚠ `spoken` IS THE ABSENCE TEST, AND IT IS THE ONE THAT NEEDED SAYING. `st` is absent for every
       volcano no observatory has spoken about (see volcApplyStatus above), so «only where somebody
       publishes a level» is `has st` — and the legend says that it is a statement about publishing,
       not about the volcanoes. */
    const VOLC_FILTERS={ spoken:false, elevated:false, big:false, recent:false };
    const volcFilterTerms=()=>{
      const t=[];
      if(VOLC_FILTERS.spoken) t.push(['has','st']);
      if(VOLC_FILTERS.elevated) t.push(['>=',['coalesce',['get','st'],-1],2]);
      if(VOLC_FILTERS.big) t.push(['>=',['coalesce',['get','x'],-1],4]);
      if(VOLC_FILTERS.recent) t.push(['>=',['coalesce',['get','y'],-99999],1950]);
      if(volcTime.on) t.push(['has','ty']);
      return t;
    };
    /* ⚠ THE HALO KEEPS ITS OWN CONDITION. It marks «an observatory is speaking about this one
       today»; a reader's filter narrows WHICH volcanoes are drawn, it does not change what the ring
       means. So the two are ANDed rather than one replacing the other. */
    const HALO_BASE=['>=',['coalesce',['get','st'],-1],2];
    function volcApplyFilter(){
      const t=volcFilterTerms();
      try{
        if(GE().layers.has('volc2-pt')) GE().layers.setFilter('volc2-pt',t.length?['all'].concat(t):null);
        if(GE().layers.has('volc2-lbl')) GE().layers.setFilter('volc2-lbl',t.length?['all'].concat(t):null);
        if(GE().layers.has('volc2-halo')) GE().layers.setFilter('volc2-halo',['all',HALO_BASE].concat(t));
      }catch(_){}
    }
    function volcSetFilter(k,on){
      if(!(k in VOLC_FILTERS)) return false;
      VOLC_FILTERS[k]=!!on;
      if(VOLC_FILTERS.spoken||VOLC_FILTERS.elevated){ try{ window.IntMapLazy.need('volcanoIntel').then(ok=>{ if(ok&&window.IntMapVolcano) window.IntMapVolcano.warm().then(volcApplyStatus); }); }catch(_){} }
      volcApplyFilter(); volcLegend(); return true;
    }

    /* ══ (#R395) THE ERUPTION RECORD ON THE MASTER CLOCK ══════════════════════════════════════════
       The bundled dated eruptions were readable only one volcano at a time, in a card. On the clock
       they answer a different question: «which volcanoes were erupting when the map is set to 1883?»
       ⚠ THE DATES COME FROM THE BUNDLED HISTORY, so this costs one fetch of the file the card
       already uses (data/volcano-detail.json.gz) and nothing per year afterwards.
       ⚠ AN ERUPTION WITH NO END YEAR IS NOT AN ERUPTION THAT NEVER ENDED. GVP leaves the end blank
       both for «still going» and for «not recorded», so a blank end counts for the start year alone
       unless the volcano is one the catalog still lists as active — anything else would paint a
       19th-century eruption across every year since.
       ⚠ AND THE CLOCK'S FLOOR IS 1850 (js/chronos.js), which is stated in the legend rather than
       silently truncating the record: the card still shows every eruption back to −10450. */
    const volcTime={ on:false, index:null, year:null, off:null };
    function volcTimeIndex(doc){
      const m=new Map();
      const vols=(doc&&doc.volcanoes)||{};
      for(const k of Object.keys(vols)){
        const rows=vols[k].er||[]; const spans=[];
        for(const r of rows){
          if(r[9]!==1||r[1]==null) continue;                  /* confirmed, dated */
          spans.push([r[1], r[4]==null?r[1]:r[4], r[7]==null?1:r[7]]);
        }
        if(spans.length) m.set(+k,spans);
      }
      return m;
    }
    function volcApplyTime(){
      if(!volcFC) return 0;
      let n=0;
      if(volcTime.on&&volcTime.index){
        const y=nowYear();
        for(const f of volcFC.features){
          const spans=volcTime.index.get(f.properties.v); let best=null;
          if(spans) for(const s of spans){ if(y>=s[0]&&y<=s[1]&&(best==null||s[2]>best)) best=s[2]; }
          if(best!=null){ f.properties.ty=best; n++; }
          else if('ty' in f.properties) delete f.properties.ty;
        }
        volcTime.year=y;
      } else {
        for(const f of volcFC.features) if('ty' in f.properties) delete f.properties.ty;
        volcTime.year=null;
      }
      try{ GE().layers.setSourceData('volc2-src',volcFC); }catch(_){}
      volcApplyFilter(); volcLegend(); return n;
    }
    function volcSetTime(on){
      volcTime.on=!!on;
      if(!volcTime.on){ if(volcTime.off){ try{ volcTime.off(); }catch(_){} volcTime.off=null; } volcApplyTime(); return true; }
      if(!volcTime.off){ try{ volcTime.off=window.IntMapTime.on(()=>{ if(volcTime.on&&nowYear()!==volcTime.year) volcApplyTime(); }); }catch(_){} }
      if(volcTime.index){ volcApplyTime(); return true; }
      try{ window.IntMapLazy.need('volcanoIntel').then(ok=>{
        if(!ok||!window.IntMapVolcano) return;
        window.IntMapVolcano.detail().then(doc=>{ if(doc) volcTime.index=volcTimeIndex(doc); volcApplyTime(); });
      }); }catch(_){}
      volcLegend(); return true;
    }

    /* the legend: the mode switch, the key for the mode that is on, and — for the status mode — the
       three states the ladder can be in, said in words. */
    function volcLegend(){
      if(!state.volc){ try{ window._hideGenericLegend&&window._hideGenericLegend('volc2'); }catch(_){} return; }
      try{
        if(!window._registerLayerOpacity) return;
        /* ⚠ (#R432) THE EPOCH CAME OUT OF THE LABEL, for the reason #R353 took the count out of it:
           a fact written into a name cannot check itself, and this one stopped being true when the
           catalog gained the volcanoes an observatory publishes a level for. The legend below
           states the composition from the file. */
        const el=window._registerLayerOpacity('volc2',LA('Volcanoes (Smithsonian GVP)','火山（スミソニアンGVP）','Vulkane (Smithsonian GVP)','Вулканы (Smithsonian GVP)','Volcanes (Smithsonian GVP)'),VL_IDS,'beta-dl-volc2');
        if(!el) return;
        let key=el.querySelector('.volc-key');
        if(!key){ key=document.createElement('div'); key.className='volc-key';
          const op=el.querySelector('.dl-op-row'); if(op) el.insertBefore(key,op); else el.appendChild(key);
          key.addEventListener('click',(ev)=>{ const t2=ev.target&&ev.target.closest?ev.target:null; if(!t2) return;
            const m=t2.closest('[data-vmode]'); if(m){ volcSetMode(m.dataset.vmode); return; }
            const fl=t2.closest('[data-vfilter]'); if(fl){ volcSetFilter(fl.dataset.vfilter,!VOLC_FILTERS[fl.dataset.vfilter]); return; }
            const tm=t2.closest('[data-vtime]'); if(tm) volcSetTime(!volcTime.on); }); }
        const SF=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
        const dot=(c)=>'<span class="volc-dot" style="background:'+c+'"></span>';
        const line=(c,t2)=>'<div class="volc-key-row">'+dot(c)+SF(t2)+'</div>';
        const MODE_LABEL={ recency:L('Last eruption','最終噴火','Letzter Ausbruch','Последнее извержение','Última erupción'),
          vei:L('Explosivity','爆発規模','Explosivität','Взрывная сила','Explosividad'),
          status:L('Now','現在','Jetzt','Сейчас','Ahora'),
          people:L('People nearby','周辺人口','Menschen in der Nähe','Население рядом','Población cercana') };
        let body='<div class="volc-modes">'+VOLC_MODES.map(m=>'<button type="button" class="volc-mode'+(volcMode===m?' on':'')+'" data-vmode="'+m+'">'+SF(MODE_LABEL[m])+'</button>').join('')+'</div>';
        /* (#R395) the narrowing row, and the clock switch beside it */
        const FILT=[['spoken',L('Somebody publishes a level','状況の発表がある','Stufe wird veröffentlicht','Уровень публикуется','Alguien publica un nivel')],
          ['elevated',L('Above normal','平常より上','Über Normal','Выше нормы','Por encima de lo normal')],
          ['big',L('Has produced VEI 4+','VEI 4 以上の実績','Hat VEI 4+ erzeugt','Производил VEI 4+','Ha producido VEI 4+')],
          ['recent',L('Erupted since 1950','1950年以降に噴火','Ausbruch seit 1950','Извергался с 1950 года','Con erupción desde 1950')]];
        body+='<div class="volc-filters">'+FILT.map(([k,lab])=>'<button type="button" class="volc-filter'+(VOLC_FILTERS[k]?' on':'')+'" data-vfilter="'+k+'">'+SF(lab)+'</button>').join('')
          +'<button type="button" class="volc-filter'+(volcTime.on?' on':'')+'" data-vtime="1">'+SF(L('Erupting in the map’s year','地図の年に噴火中','Im Kartenjahr im Ausbruch','Извергался в году карты','En erupción en el año del mapa'))+'</button></div>';
        if(volcTime.on){
          /* ⚠ ONE STRING WITH PLACEHOLDERS, not five fragments concatenated round a number (#R355):
             a sentence assembled from pieces cannot be reordered by a translator, and the pieces are
             not literals the inline tables can hold. */
          const shown=volcFC?volcFC.features.filter(f=>f.properties.ty!=null).length:0;
          body+='<div class="volc-key-note">'+SF(volcTime.index
            ?L('GVP records {n} volcano(es) as erupting in {y}. The clock reaches back to 1850; the card shows every eruption in the record.',
              'GVP の記録で {y} 年に噴火していた火山は {n} 座です。時計は1850年までさかのぼれます（カードにはそれ以前の噴火も出ます）。',
              'Das GVP führt {n} Vulkan(e) als im Jahr {y} ausbrechend. Die Uhr reicht bis 1850 zurück; die Karte zeigt jeden Ausbruch des Datensatzes.',
              'По данным GVP в {y} году извергались {n} вулкан(ов). Часы доходят до 1850 года; в карточке есть все извержения записи.',
              'El GVP registra {n} volcán(es) en erupción en {y}. El reloj llega hasta 1850; la ficha muestra todas las erupciones del registro.')
              .split('{n}').join(shown).split('{y}').join(nowYear())
            :L('Reading the eruption record…','噴火記録を読み込み中…','Ausbruchsdatensatz wird gelesen…','Чтение записи извержений…','Leyendo el registro de erupciones…'))+'</div>';
        }
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
        /* ⚠ (#R432) THE WORD «HOLOCENE» WENT THE WAY THE COUNT WENT. #R353 took 「全1,215座」 out of
           the row label because the catalog moved to 1,214 and the label could not follow; this
           round the catalog stopped being Holocene-only — it also carries the volcanoes an
           observatory publishes a current level for, and four of those (Yellowstone among them) are
           older than the Holocene. Both numbers are READ FROM THE FILE, and the composition is
           stated here rather than asserted in a label that cannot check itself.
           ⚠ ONE STRING WITH PLACEHOLDERS (#R355), not fragments concatenated round a number. */
        const n=volcFC?volcFC.features.length:0;
        const hol=(volcFC&&Number.isFinite(volcFC.holocene))?volcFC.holocene:n;
        const extra=Math.max(0,n-hol);
        const NUMF=(x)=>{ try{ return x.toLocaleString(window.IntMapLang.locale(HOST.lang,'en-GB')); }catch(_){ return String(x); } };
        let cat='';
        if(n) cat=(extra
          ?L('{h} Holocene volcanoes + {m} older ones an observatory watches',
             '完新世の火山 {h} 座 ＋ 観測機関が監視する、それより古い火山 {m} 座',
             '{h} holozäne Vulkane + {m} ältere, die ein Observatorium überwacht',
             '{h} вулканов голоцена + {m} более древних под наблюдением обсерватории',
             '{h} volcanes del Holoceno + {m} más antiguos vigilados por un observatorio')
          :L('{h} Holocene volcanoes','完新世の火山 {h} 座','{h} holozäne Vulkane',
             '{h} вулканов голоцена','{h} volcanes del Holoceno')
        ).split('{h}').join(NUMF(hol)).split('{m}').join(NUMF(extra));
        body+='<div class="volc-key-src">'+SF('Smithsonian GVP'+(cat?' · '+cat:''))+'</div>';
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
      applyStatus:volcApplyStatus, on:()=>state.volc, count:()=>volcFC?volcFC.features.length:0,
      /* (#R395) the narrowing and the clock, for Atlas and for the tests */
      filters:()=>Object.assign({},VOLC_FILTERS), setFilter:volcSetFilter, filterKeys:()=>Object.keys(VOLC_FILTERS),
      timeOn:()=>volcTime.on, setTime:volcSetTime, timeYear:()=>volcTime.year,
      shown:()=>{ if(!volcFC) return 0; const t=volcFilterTerms(); if(!t.length) return volcFC.features.length;
        return volcFC.features.filter(f=>{ const p=f.properties;
          if(VOLC_FILTERS.spoken&&p.st==null) return false;
          if(VOLC_FILTERS.elevated&&!(p.st>=2)) return false;
          if(VOLC_FILTERS.big&&!(p.x>=4)) return false;
          if(VOLC_FILTERS.recent&&!(p.y>=1950)) return false;
          if(volcTime.on&&p.ty==null) return false;
          return true; }).length; } };

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
        /* (#R395) narrowing the catalog, and putting the eruption record on the master clock. Both
           switch the layer on first: a filter over a layer nobody can see answers nothing. */
        OS.register('volcano.filter',(ctx)=>{
          const p=(ctx&&ctx.params)||{};
          try{ const cb=document.getElementById('beta-dl-volc2'); if(cb&&!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change')); } }catch(_){}
          if(p.clear){ for(const k of Object.keys(VOLC_FILTERS)) volcSetFilter(k,false); return {ok:true,shown:window.__imVolcLayer.shown()}; }
          let any=false;
          for(const k of Object.keys(VOLC_FILTERS)) if(k in p){ volcSetFilter(k,p[k]!==false); any=true; }
          return any?{ok:true,shown:window.__imVolcLayer.shown()}:{ok:false,err:'no volcano filter named'};
        },{label:'Narrow the volcano catalog',group:'volcano'});
        OS.register('volcano.time',(ctx)=>{
          const p=(ctx&&ctx.params)||{};
          try{ const cb=document.getElementById('beta-dl-volc2'); if(cb&&!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change')); } }catch(_){}
          if(p.year!=null){ try{ window.IntMapTime.setYear(+p.year); }catch(_){} }
          return { ok:volcSetTime(p.on!==false), year:nowYear() };
        },{label:'Volcanoes erupting in the map’s year',group:'volcano'});
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

    /* ══ UNESCO WORLD HERITAGE — THE WHOLE LIST, AND EVERY COMPONENT PART OF IT ═════════════════
       「世界遺産をすべてマッピングしたレイヤーを作って。」 data/whc-sites.json, built by
       scripts/build-whs.mjs from the World Heritage Centre's own XML (that file carries the whole
       measurement: why the feed cannot be read from the browser, why the languages are probed, and
       why the <danger> column in it is not used).

       ⚠ «すべて» IS 6,009 POINTS, NOT 1,273. 484 of the inscribed properties are serial or
       transboundary and UNESCO publishes a coordinate for EACH component part — the 93 beech
       forests in 18 countries are one property and ninety-three places. A layer that drew one pin
       per row would leave two thirds of what is inscribed off the map, and would put the single pin
       for the Routes of Santiago in the middle of France. So the file ships the parts, and the
       feature carries the property id that owns it.

       ⚠ AND THE POINTS ARE A FLAT NUMBER ARRAY, NOT GeoJSON. The names are needed in one language
       at a time and the geometry is needed in all of them, so the file holds `sites` (the facts and
       every language's name, once each) and `points` ([siteIndex, lng, lat, countryIndex] × 6,009),
       and the FeatureCollection is composed here in whatever language the reader is in. Switching
       language rebuilds it; it does not re-download anything. */
    const WHS_IDS=['whs-halo','whs-pt','whs-lbl'];
    /* ⚠ KEYED BY THE VOCABULARY UPSTREAM PUBLISHES, AND THE FILE CARRIES THAT VOCABULARY, NOT THIS
       LINE. `whsDoc.categories` is whatever the List actually used this build; a category these two
       tables do not know is still drawn (in the neutral colour) and still named (with UNESCO's own
       word), so a new one appears on the map instead of disappearing from it. */
    const WHS_COLOUR={Cultural:'#c9903a',Natural:'#2fa87a',Mixed:'#5a8fe6'};
    const WHS_NEUTRAL='#8e8e93', WHS_DANGER='#e0332f';
    const WHS_CAT={Cultural:LA('Cultural','文化遺産','Kultur','Культурный','Cultural'),
      Natural:LA('Natural','自然遺産','Natur','Природный','Natural'),
      Mixed:LA('Mixed','複合遺産','Gemischt','Смешанный','Mixto')};
    let whsDoc=null, whsFC=null, whsLoading=false, whsPopup=null;
    /* ⚠⚠⚠ ONE WRITE PER TICK, AND THE SAME COLLECTION IS NEVER WRITTEN TWICE. Measured in
       production (#R567 verification): a language change put FIVE `setSourceData('whs-src',…)`
       calls into the same tick — the lang listener rebuilds, the style event that the relabel
       causes runs the self-heal, and the self-heal calls whsLoad(), which writes again. Every one
       of them carried the CORRECT new collection, and the map still drew the old language: the
       burst leaves MapLibre's geojson worker holding the tiles it had, and 66 seconds of polling,
       a triggerRepaint() and a jump to another continent did not shift it. A single hand-made
       setData with the SAME data fixed it within four seconds — so the data was never wrong and
       the number of calls was.
       ⚠ THE FIX IS NOT «call it less often somewhere». Four independent places are all correct to
       want the source refreshed; what none of them can know is whether another one is about to ask
       in the same tick. So they all ask HERE, and this is the only place that writes: it collapses
       a tick's worth of asks into one, and skips a write of the collection it last wrote (whsBuild
       makes a NEW object every time, so a genuine rebuild is never mistaken for a repeat). */
    let whsQueued=false, whsWrote=null;
    function whsPush(){
      if(whsQueued) return; whsQueued=true;
      Promise.resolve().then(()=>{ whsQueued=false;
        if(!whsFC||whsWrote===whsFC) return;
        try{ GE().layers.setSourceData('whs-src',whsFC); whsWrote=whsFC; }catch(_){}
      });
    }
    let whsDetail=null, whsDetailTag='', whsDetailPending=null;
    const whsOff=new Set();        /* category terms the reader has switched off */
    let whsDangerOnly=false;

    /* ⚠ THE READER'S TAG, NOT ITS FIRST TWO LETTERS. js/lang-registry.js settled (#R223) that
       handing one script's reader the other because the prefix matches is a guess, and UNESCO
       publishes no Traditional Chinese List — so a zh-Hant reader is shown the English name, which
       is true, rather than a Simplified one, which would be the guess. */
    function whsLocale(){
      let t='en'; try{ t=window.IntMapLang.htmlTag(HOST.lang)||'en'; }catch(_){}
      const has=(whsDoc&&whsDoc.locales)||['en'];
      return has.indexOf(t)>=0?t:'en';
    }
    const whsCatName=(i)=>{ const c=whsDoc&&whsDoc.categories[i]; if(c==null) return '';
      return WHS_CAT[c]?L.arr(WHS_CAT[c]):c; };

    function whsBuild(){
      if(!whsDoc) return null;
      const lc=whsLocale(), P=whsDoc.points, S=whsDoc.sites, out=[];
      for(let i=0;i<P.length;i+=4){
        const s=S[P[i]]; if(!s) continue;
        out.push({type:'Feature',geometry:{type:'Point',coordinates:[P[i+1],P[i+2]]},
          properties:{id:s.id,n:s.n[lc]||s.n.en,c:s.c,d:s.d,y:s.y,t:s.t}});
      }
      whsFC={type:'FeatureCollection',features:out};
      return whsFC;
    }
    /* the colour ladder is built from the file's vocabulary for the same reason the labels are */
    function whsColour(){
      const cats=(whsDoc&&whsDoc.categories)||[];
      if(!cats.length) return WHS_NEUTRAL;
      const e=['match',['get','c']];
      cats.forEach((c,i)=>{ e.push(i,WHS_COLOUR[c]||WHS_NEUTRAL); });
      e.push(WHS_NEUTRAL); return e;
    }
    function whsTerms(){
      const t=[];
      if(whsDangerOnly) t.push(['!=',['get','d'],0]);
      if(whsOff.size&&whsDoc){
        const keep=whsDoc.categories.map((c,i)=>i).filter(i=>!whsOff.has(whsDoc.categories[i]));
        t.push(['in',['get','c'],['literal',keep]]);
      }
      return t;
    }
    /* ⚠ THE HALO IS A SECOND CLAIM ABOUT THE SAME DOT, so it carries the reader's narrowing too —
       a danger ring left under a point the filter has removed is a ring round nothing. */
    function whsApplyFilter(){
      const t=whsTerms();
      try{ if(GE().layers.has('whs-pt')) GE().layers.setFilter('whs-pt',t.length?['all'].concat(t):null); }catch(_){}
      try{ if(GE().layers.has('whs-lbl')) GE().layers.setFilter('whs-lbl',t.length?['all'].concat(t):null); }catch(_){}
      try{ if(GE().layers.has('whs-halo')) GE().layers.setFilter('whs-halo',['all',['!=',['get','d'],0]].concat(t)); }catch(_){}
    }
    function whsShown(){
      if(!whsFC) return 0;
      const t=whsTerms(); if(!t.length) return whsFC.features.length;
      return whsFC.features.filter(f=>{ const p=f.properties;
        if(whsDangerOnly&&!p.d) return false;
        if(whsOff.size&&whsDoc&&whsOff.has(whsDoc.categories[p.c])) return false;
        return true; }).length;
    }
    function whsEnsure(){ if(GE().layers.hasSource('whs-src')) return true; if(!_imCanDraw()) return false;
      try{
        /* ⚠ a NEW source holds nothing this module wrote, so the «already wrote that» memory has
           to be dropped with it — otherwise a basemap swap leaves the skip believing the empty
           source already carries the collection. */
        whsWrote=null;
        GE().layers.addSource('whs-src',{type:'geojson',data:whsFC||{type:'FeatureCollection',features:[]},
          attribution:'UNESCO World Heritage Centre'});
        const before=GE().layers.has('tool-poly')?'tool-poly':undefined;
        const r=['interpolate',['linear'],['zoom'],2,2.2,5,3.6,9,5.8,14,8.5];
        GE().layers.add({id:'whs-halo',type:'circle',source:'whs-src',layout:{visibility:'none'},
          filter:['all',['!=',['get','d'],0]],
          paint:{'circle-radius':['interpolate',['linear'],['zoom'],2,5,5,7.5,9,11,14,15],
                 'circle-color':WHS_DANGER,'circle-opacity':0.26,'circle-blur':0.5}},before);
        GE().layers.add({id:'whs-pt',type:'circle',source:'whs-src',layout:{visibility:'none'},
          paint:{'circle-radius':r,'circle-color':whsColour(),
                 'circle-stroke-color':'rgba(255,255,255,0.88)','circle-stroke-width':0.9,'circle-opacity':0.94}},before);
        GE().layers.add({id:'whs-lbl',type:'symbol',source:'whs-src',minzoom:6,layout:{visibility:'none',
          'text-field':['get','n'],'text-size':window.IntMapLabelScale.sub(0.8),'text-offset':[0,1.05],
          'text-anchor':'top','text-font':['literal',['Noto Sans Regular']],'text-max-width':11},
          paint:{'text-color':'#f0dcb8','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.2}},before);
        GE().events.onLayer('click','whs-pt',e=>{ const f=e.features&&e.features[0]; if(!f) return;
          whsPanel(f,(f.properties||{}).id); });
        GE().events.onLayer('mouseenter','whs-pt',()=>{ GE().render.canvas().style.cursor='pointer'; });
        GE().events.onLayer('mouseleave','whs-pt',()=>{ GE().render.canvas().style.cursor=''; });
        whsApplyFilter();
        return true;
      }catch(_){ return false; } }

    async function whsLoad(){
      if(whsDoc){ if(!whsFC) whsBuild(); whsPush(); return; }
      if(whsLoading) return; whsLoading=true;
      try{
        const r=await fetch('data/whc-sites.json'); const j=await r.json();
        if(j&&Array.isArray(j.sites)&&Array.isArray(j.points)){
          whsDoc=j; whsBuild();
          whsPush();
          try{ if(GE().layers.has('whs-pt')) GE().layers.setPaint('whs-pt','circle-color',whsColour()); }catch(_){}
          whsApplyFilter(); whsLegend();
        }
      }catch(_){ try{ imToast(window.IntMapLang.t(HOST.lang,'Could not load the World Heritage list','世界遺産の一覧を読み込めませんでした','Die Welterbeliste konnte nicht geladen werden','Не удалось загрузить список всемирного наследия','No se pudo cargar la lista del Patrimonio Mundial')); }catch(_){} }
      whsLoading=false;
    }
    /* ⚠ THE DESCRIPTIONS ARE ONE FILE PER LANGUAGE and the reader fetches one of them, once, on the
       first panel — see the note in scripts/build-whs.mjs. The URL is computed from the locale, so
       scripts/asset-report.mjs classifies these files as `prefix` rather than `exact`; the stem is
       written out here in one literal so the classification can be made at all. */
    function whsDetailLoad(){
      const lc=whsLocale();
      if(whsDetail&&whsDetailTag===lc) return Promise.resolve(whsDetail);
      if(whsDetailPending&&whsDetailPending.tag===lc) return whsDetailPending.p;
      if(typeof DecompressionStream!=='function') return Promise.reject(new Error('DecompressionStream unavailable'));
      const p=fetch('data/whc-detail.'+lc+'.json.gz').then(r=>{
        if(!r.ok||!r.body) throw new Error('whc detail '+r.status);
        return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
      }).then(t=>JSON.parse(t)).then(j=>{ whsDetail=j; whsDetailTag=lc; whsDetailPending=null; return j; })
        .catch(e=>{ whsDetailPending=null; throw e; });
      whsDetailPending={tag:lc,p}; return p;
    }
    const whsSite=(id)=>{ if(!whsDoc) return null; const n=+id;
      return whsDoc.sites.find(s=>s.id===n)||null; };
    function whsByName(q){ if(!whsDoc||!q) return [];
      const needle=String(q).toLowerCase(), lc=whsLocale();
      return whsDoc.sites.filter(s=>{ const a=(s.n[lc]||'').toLowerCase(), b=(s.n.en||'').toLowerCase();
        return a.indexOf(needle)>=0||b.indexOf(needle)>=0; });
    }
    /* the first component part of a property, for «show me this site» */
    function whsWhere(id){ if(!whsDoc) return null; const i=whsDoc.sites.findIndex(s=>s.id===+id); if(i<0) return null;
      const P=whsDoc.points; for(let k=0;k<P.length;k+=4) if(P[k]===i) return [P[k+1],P[k+2]];
      return null; }

    function whsPanel(f,id){
      const s=whsSite(id); if(!s) return;
      const SF=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
      const lc=whsLocale();
      const seg=(whsDoc&&whsDoc.localePath&&whsDoc.localePath[lc])||'en';
      const head=(d)=>{
        const bits=[whsCatName(s.c)];
        if(d&&d.st) bits.push(d.st);
        const yr=s.y?L('Inscribed {y}','{y}年登録','Eingeschrieben {y}','Внесён в {y}','Inscrito en {y}').split('{y}').join(s.y):'';
        if(yr) bits.push(yr);
        if(s.cr&&s.cr.length) bits.push(s.cr.map(c=>'('+c+')').join(''));
        let html='<div style="font-weight:700;font-size:14px;color:var(--text-main);">'+SF(s.n[lc]||s.n.en)+'</div>'
          +'<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">'+SF(bits.filter(Boolean).join(' · '))+'</div>';
        if(s.d) html+='<div style="font-size:12px;color:'+WHS_DANGER+';margin-top:3px;font-weight:600;">'+SF(
          s.d>0?L('On the List in Danger since {y}','{y}年から危機遺産','Seit {y} auf der Roten Liste','В списке под угрозой с {y} года','En la Lista en Peligro desde {y}').split('{y}').join(s.d)
               :L('On the List in Danger','危機遺産','Auf der Roten Liste','В списке под угрозой','En la Lista en Peligro'))+'</div>';
        return html;
      };
      const show=(html)=>{ try{ if(whsPopup) whsPopup.remove(); }catch(_){}
        try{ whsPopup=GE().ui.attach(GE().ui.popup({closeButton:true,closeOnClick:true,className:'plc-popup',maxWidth:'320px'})
          .setLngLat(f.geometry.coordinates).setHTML('<div style="min-width:200px;max-width:300px;">'+html+'</div>')); }catch(_){} };
      /* the panel opens with what the LAYER file already knows, and fills in the description when
         the language's description file lands — a card that waits for a 340 kB fetch before showing
         anything is a card that looks broken on a slow connection. */
      show(head(null));
      whsDetailLoad().then(j=>{
        const d=j&&j.sites&&j.sites[String(s.id)]; if(!d) return;
        let html=head(d);
        if(d.img) html+='<img src="'+SF(d.img)+'" alt="" loading="lazy" style="width:100%;border-radius:8px;margin-top:8px;display:block;">';
        if(d.d) html+='<div style="font-size:12px;color:var(--text-main);margin-top:8px;line-height:1.5;max-height:190px;overflow:auto;">'+SF(d.d)+'</div>';
        html+='<div style="margin-top:8px;"><a href="https://whc.unesco.org/'+SF(seg)+'/list/'+SF(s.id)
          +'/" target="_blank" rel="noopener" style="font-size:12px;">'+SF(L('UNESCO page','ユネスコの解説ページ','UNESCO-Seite','Страница ЮНЕСКО','Página de la UNESCO'))+' ↗</a></div>';
        show(html);
      }).catch(()=>{});
    }
    /* Atlas and the kernel command: bring the property into view AND open its card. A card about a
       dot the reader cannot see is half an answer (the volcano rule above, #R353). */
    function whsOpen(id){
      const at=whsWhere(id); if(!at) return false;
      try{ GE().camera.flyTo({center:at,zoom:Math.max(GE().camera.getZoom(),8)}); }catch(_){}
      whsPanel({geometry:{coordinates:at}},id); return true;
    }
    function whsSetCategory(term,on){
      if(!whsDoc||whsDoc.categories.indexOf(term)<0) return false;
      if(on) whsOff.delete(term); else whsOff.add(term);
      whsApplyFilter(); whsLegend(); return true;
    }
    function whsSetDanger(on){ whsDangerOnly=!!on; whsApplyFilter(); whsLegend(); return true; }

    function whsLegend(){
      if(!state.whs){ try{ window._hideGenericLegend&&window._hideGenericLegend('whs'); }catch(_){} return; }
      try{
        if(!window._registerLayerOpacity) return;
        const el=window._registerLayerOpacity('whs',LA('World Heritage (UNESCO)','世界遺産（ユネスコ）','Welterbe (UNESCO)','Всемирное наследие (ЮНЕСКО)','Patrimonio Mundial (UNESCO)'),WHS_IDS,'beta-dl-whs');
        if(!el) return;
        let key=el.querySelector('.volc-key');
        if(!key){ key=document.createElement('div'); key.className='volc-key';
          const op=el.querySelector('.dl-op-row'); if(op) el.insertBefore(key,op); else el.appendChild(key);
          key.addEventListener('click',(ev)=>{ const t=ev.target&&ev.target.closest?ev.target:null; if(!t) return;
            const c=t.closest('[data-whscat]'); if(c){ whsSetCategory(c.dataset.whscat,whsOff.has(c.dataset.whscat)); return; }
            const d=t.closest('[data-whsdanger]'); if(d) whsSetDanger(!whsDangerOnly); }); }
        const SF=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
        const dot=(c)=>'<span class="volc-dot" style="background:'+c+'"></span>';
        const cats=(whsDoc&&whsDoc.categories)||[];
        let body='<div class="volc-filters">'+cats.map((c,i)=>'<button type="button" class="volc-filter'
          +(whsOff.has(c)?'':' on')+'" data-whscat="'+SF(c)+'">'+dot(WHS_COLOUR[c]||WHS_NEUTRAL)+SF(whsCatName(i))+'</button>').join('')
          +'<button type="button" class="volc-filter'+(whsDangerOnly?' on':'')+'" data-whsdanger="1">'
          +SF(L('In danger','危機遺産','In Gefahr','Под угрозой','En peligro'))+'</button></div>';
        /* ⚠ ONE STRING WITH PLACEHOLDERS (#R355), and every number in it is READ FROM THE FILE. The
           three properties that publish no coordinate at all are counted here rather than quietly
           dropped: a map that shows 1,270 of 1,273 and says «1,273» is telling the reader something
           it did not do. */
        const NUMF=(x)=>{ try{ return x.toLocaleString(window.IntMapLang.locale(HOST.lang,'en-GB')); }catch(_){ return String(x); } };
        if(whsDoc){
          const drawn=new Set(); for(let i=0;i<whsDoc.points.length;i+=4) drawn.add(whsDoc.points[i]);
          const undrawn=whsDoc.sites.length-drawn.size;
          const dang=whsDoc.sites.filter(s=>s.d).length;
          body+='<div class="volc-key-note">'+SF(L(
            '{s} inscribed properties, drawn as {p} component parts. {d} are on the List in Danger.',
            '登録物件 {s} 件を、構成資産 {p} 地点として描いています。うち {d} 件が危機遺産です。',
            '{s} eingeschriebene Stätten, gezeichnet als {p} Bestandteile. {d} stehen auf der Roten Liste.',
            '{s} объектов, показанных как {p} составных частей. {d} — в списке под угрозой.',
            '{s} bienes inscritos, dibujados como {p} partes componentes. {d} están en la Lista en Peligro.')
            .split('{s}').join(NUMF(whsDoc.sites.length)).split('{p}').join(NUMF(whsFC?whsFC.features.length:0))
            .split('{d}').join(NUMF(dang)))+'</div>';
          if(undrawn) body+='<div class="volc-key-note">'+SF(L(
            'UNESCO publishes no coordinate for {n} of them, so they are not on the map.',
            'そのうち {n} 件はユネスコが座標を公表しておらず、地図には出ていません。',
            'Für {n} davon veröffentlicht die UNESCO keine Koordinate; sie fehlen auf der Karte.',
            'Для {n} из них ЮНЕСКО не публикует координат, поэтому их нет на карте.',
            'La UNESCO no publica coordenadas de {n} de ellos, así que no están en el mapa.')
            .split('{n}').join(NUMF(undrawn)))+'</div>';
          /* the name a reader sees is the name UNESCO publishes in that language — when it does. */
          const lc=whsLocale();
          if(lc==='en'&&(whsDoc.locales||[]).length>1) body+='<div class="volc-key-note">'+SF(L(
            'UNESCO publishes the List in English, French, Spanish, Russian, Arabic, Chinese and Japanese only, so the names here are in English.',
            'ユネスコが一覧を公表しているのは英・仏・西・露・アラビア・中・日の各語だけなので、ここでは英語名で表示しています。',
            'Die UNESCO veröffentlicht die Liste nur auf Englisch, Französisch, Spanisch, Russisch, Arabisch, Chinesisch und Japanisch — die Namen stehen deshalb auf Englisch.',
            'ЮНЕСКО публикует список только на английском, французском, испанском, русском, арабском, китайском и японском, поэтому названия даны по-английски.',
            'La UNESCO publica la Lista solo en inglés, francés, español, ruso, árabe, chino y japonés, por lo que los nombres aparecen en inglés.'))+'</div>';
        }
        body+='<div class="volc-key-src">'+SF('UNESCO World Heritage Centre'
          +((whsDoc&&whsDoc.danger&&whsDoc.danger.attribution)?' · '+whsDoc.danger.attribution:''))+'</div>';
        key.innerHTML=body;
      }catch(_){}
    }
    function whsToggle(on){ state.whs=on;
      const a=()=>{ if(!whsEnsure()){ GE().events.once('idle',a); return; } setVis(WHS_IDS,on); if(on) whsLoad(); };
      a(); whsLegend();
    }
    /* the same reasoning as `__imVolcLayer` above: NOT an `IntMap*` name, because
       js/atlas-controls.js enumerates those to build the module catalog (#R320). */
    window.__imWhsLayer={ data:()=>whsDoc, on:()=>state.whs, locale:whsLocale,
      count:()=>whsDoc?whsDoc.sites.length:0, points:()=>whsFC?whsFC.features.length:0,
      categories:()=>whsDoc?whsDoc.categories.slice():[], off:()=>[...whsOff], setCategory:whsSetCategory,
      dangerOnly:()=>whsDangerOnly, setDangerOnly:whsSetDanger, shown:whsShown,
      byName:whsByName, site:whsSite, where:whsWhere, open:whsOpen, load:whsLoad, filterTerms:whsTerms,
      /* the composed collection itself, so «did the language event recompose the names?» can be
         asked of THIS module rather than of the renderer's tile cache — two different questions,
         and only the first one is ours. */
      fc:()=>whsFC, wrote:()=>whsWrote, push:whsPush };
    /* ══ THE KERNEL COMMANDS ════════════════════════════════════════════════════════
       CONSTITUTION §: the button and Atlas call the SAME registered command — Atlas does not
       simulate a click. Registered here, beside the layer, because this file is eager: a command
       that only exists once something has been downloaded is a capability Atlas cannot offer. */
    try{
      const OS2=window.IntMapOS;
      if(OS2&&OS2.register){
        const whsOn=()=>{ try{ const cb=document.getElementById('beta-dl-whs'); if(cb&&!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change')); } }catch(_){} };
        OS2.register('heritage.open',(ctx)=>{
          const p2=(ctx&&ctx.params)||{};
          whsOn();
          const go=()=>{
            let id=p2.id!=null?+p2.id:null;
            if(id==null&&p2.name){ const hit=whsByName(p2.name)[0]; if(hit) id=hit.id; }
            if(id==null) return {ok:false,err:'no World Heritage property named'};
            const s2=whsSite(id);
            if(!s2) return {ok:false,err:'no such World Heritage property'};
            /* ⚠ A PROPERTY WITH NO PUBLISHED COORDINATE IS NOT A FAILURE TO FIND IT. Three of them
               exist; saying so is the answer, and pretending the lookup failed is not. */
            if(!whsWhere(id)) return {ok:false,err:'UNESCO publishes no coordinate for this property',id};
            return { ok:whsOpen(id), id };
          };
          return whsDoc?Promise.resolve(go()):whsLoad().then(go);
        },{label:'World Heritage property card',group:'heritage',btn:'beta-dl-whs'});
        OS2.register('heritage.filter',(ctx)=>{
          const p2=(ctx&&ctx.params)||{};
          whsOn();
          const go=()=>{
            let any=false;
            /* ⚠ `clear` RESETS AND THEN LETS THE REST OF THE CALL APPLY — it is a starting point,
               not a terminator. Returning here made {clear:true,danger:true} answer «all 6,009 of
               them», which is the opposite of what that call asks for (measured in the browser). */
            if(p2.clear){ whsOff.clear(); whsSetDanger(false); any=true; }
            if(p2.danger!=null){ whsSetDanger(p2.danger!==false); any=true; }
            const cats=Array.isArray(p2.categories)?p2.categories:(p2.category?[p2.category]:null);
            if(cats&&whsDoc){
              /* naming the categories to KEEP is the whole request — the ones not named go off */
              const want=cats.map(c=>String(c));
              const known=whsDoc.categories.filter(c=>want.some(w=>w.toLowerCase()===c.toLowerCase()));
              if(!known.length) return {ok:false,err:'no such category',categories:whsDoc.categories.slice()};
              whsOff.clear(); whsDoc.categories.forEach(c=>{ if(known.indexOf(c)<0) whsOff.add(c); });
              whsApplyFilter(); whsLegend(); any=true;
            }
            return any?{ok:true,shown:whsShown()}:{ok:false,err:'no World Heritage filter named'};
          };
          return whsDoc?Promise.resolve(go()):whsLoad().then(go);
        },{label:'Narrow the World Heritage list',group:'heritage',btn:'beta-dl-whs'});
      }
    }catch(_){}
    /* ---------- (#R585) MEASURED RADIATION — the row is here, the layer is not -------------------
       Same split as the volcano overlays: the Layers row and the IntMapOS command must exist from
       boot (a command that appears only after its module is downloaded is a capability Atlas can
       never offer — see the note above volcano.open), while js/radiation-layer.js and the ~8,500
       station readings it fetches arrive on the FIRST switch-on and not a byte before.
       ⚠ This is the MEASURED layer. The plume SIMULATION is IntMapRadiation in js/sims.js and the
       two are deliberately different things; docs/RADIATION.md says why they must not share a ramp. */
    function radobsToggle(on){
      state.radobs=!!on;
      return window.IntMapLazy.need('radiationLayer').then(ok=>{
        if(!ok||!window.IntMapRadiationObs){
          /* a feature that silently stops existing is this project's most expensive recurring
             defect — so the row un-checks itself rather than sitting on with nothing under it. */
          try{ const cb=document.getElementById('beta-dl-radobs'); if(cb&&cb.checked){ cb.checked=false; cb.closest('.lyr-row').classList.remove('on'); } }catch(_){}
          try{ imToast(L(LA('Radiation measurements are unavailable right now.','放射線の実測値をいま取得できません。','Strahlungsmesswerte sind derzeit nicht verfügbar.','Измерения радиации сейчас недоступны.','Las mediciones de radiación no están disponibles ahora.'))); }catch(_){}
          return false;
        }
        return window.IntMapRadiationObs.toggle(state.radobs);
      });
    }
    try{
      const OS=window.IntMapOS;
      if(OS&&OS.register){
        OS.register('radiation.observed',(ctx)=>{
          const on=((ctx&&ctx.params)||{}).on!==false;
          try{ const cb=document.getElementById('beta-dl-radobs'); if(cb&&cb.checked!==on){ cb.checked=on; cb.dispatchEvent(new Event('change')); return {ok:true}; } }catch(_){}
          return Promise.resolve(radobsToggle(on)).then(ok=>({ok:!!ok}));
        },{label:'Measured radiation (ambient gamma dose rate)',group:'radiation',btn:'beta-dl-radobs'});
        /* the join that makes 「原発 → 実測線量 → 風 → 拡散」 one chain rather than four features:
           any point on earth, and the instruments that are actually reading around it. */
        OS.register('radiation.near',(ctx)=>{
          const p=(ctx&&ctx.params)||{};
          if(typeof p.lat!=='number'||typeof p.lon!=='number') return {ok:false,err:'no point given'};
          return window.IntMapLazy.need('radiationLayer').then(ok=>{
            if(!ok||!window.IntMapRadiationObs) return {ok:false,err:'radiation module unavailable'};
            const go=()=>({ok:true,stations:window.IntMapRadiationObs.near(p.lat,p.lon,p.km).slice(0,40)});
            return window.IntMapRadiationObs.state().stations?go():window.IntMapRadiationObs.load(null).then(go);
          });
        },{label:'Measuring stations around a point',group:'radiation'});
      }
    }catch(_){}

    /* ---------- rows in the Layers panel (histb/ukrfront now file into "Strategic geography" via
       reorganizeLayerPanel — promoted out of beta (#R20); bldg3d + volc2 stay in Others(beta)) ---------- */
    /* ⚠ (#R251) ENGLISH FIRST, AND RESOLVED THROUGH pick(). These four were `[ja, en]` read by
       `jp()?BLBL[k][0]:BLBL[k][1]` — the English string was in slot 1, so even the positional
       languages could not have been added without reversing the row, and the inline table is keyed
       by the English source string, which was not in slot 0. */
    const BLBL={ukrfront:LA('Ukraine frontline (live)','ウクライナ前線（リアルタイム）','Ukraine-Frontlinie (live)','Линия фронта в Украине (в реальном времени)','Frente de Ucrania (en vivo)'),bldg3d:LA('3D buildings (cities)','3D建物（都市）','3D-Gebäude (Städte)','3D-здания (города)','Edificios 3D (ciudades)'),histb:LA('Historical borders','過去の国境','Historische Grenzen','Исторические границы','Fronteras históricas'),volc2:LA('Volcanoes — the Smithsonian GVP catalog','火山 — スミソニアンGVPカタログ','Vulkane — der Smithsonian-GVP-Katalog','Вулканы — каталог Смитсоновского GVP','Volcanes — el catálogo del Smithsonian GVP'),
      volcash:LA('Volcanic ash areas in force (SIGMET)','有効な火山灰域（SIGMET）','Gültige Vulkanasche-Gebiete (SIGMET)','Действующие зоны вулканического пепла (SIGMET)','Zonas de ceniza volcánica vigentes (SIGMET)'),
      volchaz:LA('Volcano hazard zones (USGS)','火山ハザード域（USGS）','Vulkangefahrenzonen (USGS)','Зоны вулканической опасности (USGS)','Zonas de peligro volcánico (USGS)'),
      volcso2:LA('Satellite SO₂ column (OMPS)','衛星 SO₂ 全量（OMPS）','Satelliten-SO₂-Säule (OMPS)','Столб SO₂ со спутника (OMPS)','Columna de SO₂ satelital (OMPS)'),
      whs:LA('World Heritage — every UNESCO property','世界遺産 — ユネスコの全登録物件','Welterbe — alle UNESCO-Stätten','Всемирное наследие — все объекты ЮНЕСКО','Patrimonio Mundial — todos los bienes de la UNESCO'),
      radobs:LA('Measured radiation — ambient gamma dose rate','実測放射線 — 周辺γ線量率','Gemessene Strahlung — Umgebungs-Gammadosisleistung','Измеренная радиация — мощность амбиентной дозы гамма-излучения','Radiación medida — tasa de dosis gamma ambiental')};
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
       ['volcso2','#8ad3c8',(on)=>volcOverlay('so2',on)],['whs','#c9903a',whsToggle],
       ['radobs','#39c07c',radobsToggle]].forEach(([k,sw,fn])=>{   /* (#R122) 'histb' (Historical borders overlay) removed per request — the time-machine's own past-year borders remain */
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
    /* ⚠ THE HERITAGE NAMES ARE IN THE DATA, NOT IN THE UI TABLES, so a language event has to
       recompose the FeatureCollection — the label layer reads `n` off the feature and nothing else
       can change it. Nothing is re-downloaded: every language's name is already in the file. The
       description file IS per language, so the cached one is dropped and refetched on the next card. */
    window.addEventListener('intmap-lang',()=>setTimeout(()=>{ try{
      if(!whsDoc) return;
      whsDetail=null; whsDetailTag=''; whsDetailPending=null;
      whsBuild(); whsPush();
      whsLegend();
    }catch(_){} },20));
    /* self-heal across basemap swaps */
    GE().events.on('styledata',()=>{ if(state.ukr||state.bldg||state.hist||state.volc||state.whs){ setTimeout(()=>{
      if(state.ukr&&ukrEnsure()){ setVis(UKR_IDS,true); if(ukrFC){ try{ GE().layers.setSourceData('ukr-src',ukrFC); }catch(_){} } }
      if(state.bldg&&bldgEnsure()) setVis(['ofm-bldg-3d'],true);
      if(state.hist&&hbEnsure()){ setVis(HB_IDS,true); const fc=hbCache.get(hbYear); if(fc){ try{ GE().layers.setSourceData('hb-src',fc); }catch(_){} } }
      if(state.volc&&volcEnsure()){ setVis(VL_IDS,true); if(volcFC){ try{ GE().layers.setSourceData('volc2-src',volcFC); }catch(_){} } }
      /* ⚠ THE SELF-HEAL LOADS THE DATA TOO, and that is not belt-and-braces — it is the only path
         that survives an ENGINE SWAP. Measured: switching Globe→Flat re-creates the renderer, so the
         `once('idle')` retry whsToggle() registered on the old one never fires; the layers came back
         through this handler with an empty source and the reader saw an empty map with the switch on.
         whsLoad() is idempotent (it returns early once the file is in hand and guards its own
         in-flight fetch), so the invariant can simply be stated: the layer is on, therefore its data
         is loaded. */
      if(state.whs&&whsEnsure()){ setVis(WHS_IDS,true); whsPush(); whsApplyFilter(); whsLoad(); }
    },80); } });
    /* (#R21) under memory pressure, keep only the displayed year's borders */
    window.addEventListener('intmap-mem-pressure',()=>{ try{ const keep=hbCache.get(hbYear); hbCache.clear(); if(keep&&state.hist) hbCache.set(hbYear,keep); }catch(_){} });
    window.IntMapBeta={ukrToggle,bldgToggle,hbToggle,volcToggle,whsToggle,hbCurrent:()=>({year:hbYear,fc:hbCache.get(hbYear)||null})};
  })();
};
