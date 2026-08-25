/* ============================================================================
 *  IntMap · Dashboard cache & extended info cards  (#R167)
 * ----------------------------------------------------------------------------
 *  (A) window.IntMapCache — the IndexedDB key/value store several modules share, and
 *  (B) the extended dashboard cards it warms on boot.
 *  WRITES one host member: the cached card list is assigned back to extendedDashDB, whose
 *  declaration stays in index.html as the single source of truth.
 * ==========================================================================*/

import { everyTick } from './runtime.js';   /* (#R408) the one timer wheel — see js/runtime.js */

window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.dashExtended=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const loadDashFromSupabase=HOST.loadDashFromSupabase, renderDashboard=HOST.renderDashboard, diskFillPolys=HOST.diskFillPolys, diskOutlineLines=HOST.diskOutlineLines, satToast=HOST.satToast;
  /* ===================== R7 — Next-gen ADDITIVE architecture & intelligence overlays =====================
     100% additive & self-contained — it never mutates the existing MapLibre / Supabase / i18n / timezone
     logic, honouring the repeated "全ロジックを破壊せずに" constraint. It delivers the achievable core of the
     next-gen brief WITHOUT a risky full CesiumJS rewrite of a working 8k-line app (that swap would break
     every feature; the app is instead made modular so a Cesium globe can later be fed through IntMapSim):
       (A) IndexedDB persistence  (B) per-frame simulation bridge for external Wasm fluid/ballistic compute
       (C) Web-Worker offload bridge  (D) speculative camera-lookahead tile prefetch
       (E) new overlays: sovereignty-dispute lines + geodesic air-defense coverage "domes". */
  (function(){
    if(!GE().hasRenderer()) return;

    /* ---------- (A) IndexedDB persistence — instant next-load + offline resilience ---------- */
    window.IntMapCache=(function(){
      const DBN='intmap', STORE='kv'; let dbp=null;
      function open(){ if(dbp) return dbp; dbp=new Promise((res,rej)=>{ try{ const r=indexedDB.open(DBN,1); r.onupgradeneeded=()=>{ try{ r.result.createObjectStore(STORE); }catch(_){} }; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }catch(e){ rej(e); } }); return dbp; }
      async function set(k,v){ try{ const db=await open(); return await new Promise(res=>{ const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(v,k); tx.oncomplete=()=>res(true); tx.onerror=()=>res(false); }); }catch(_){ try{ localStorage.setItem('imc_'+k,JSON.stringify(v)); }catch(__){} return false; } }
      async function get(k){ try{ const db=await open(); return await new Promise(res=>{ const tx=db.transaction(STORE,'readonly'); const rq=tx.objectStore(STORE).get(k); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>res(null); }); }catch(_){ try{ return JSON.parse(localStorage.getItem('imc_'+k)||'null'); }catch(__){ return null; } } }
      return { get, set };
    })();
    /* Mirror Supabase intelligence (dashboard cards) into IndexedDB for an instant warm start next time. */
    try{ const _origLoadDash=(typeof loadDashFromSupabase==='function')?loadDashFromSupabase:null;
      window.IntMapCache.get('dash_cards').then(c=>{ try{ if(c&&c.length && typeof HOST.extendedDashDB!=='undefined' && (!HOST.extendedDashDB||!HOST.extendedDashDB.length)){ HOST.extendedDashDB=c; if(HOST.mode==='info'&&typeof renderDashboard==='function') renderDashboard(); } }catch(_){} });
      /* ⚠ (#R408) NOT `whenHidden`, and the write is why the question had to be asked. What it mirrors is a copy of a
         REMOTE list (loadDashFromSupabase), used only to paint the cards instantly on the NEXT load before the fetch
         answers — so a tick skipped while hidden loses nothing on return (the wheel runs it once when the tab comes
         back, and nothing reads the key until the next boot), and the worst case, hidden-then-closed, costs a colder
         start of a cache the network refills. Nothing the reader made lives here. */
      everyTick('dash-extended:cache-cards', 60000, ()=>{ try{ if(typeof HOST.extendedDashDB!=='undefined' && HOST.extendedDashDB && HOST.extendedDashDB.length) window.IntMapCache.set('dash_cards', HOST.extendedDashDB); }catch(_){} });
    }catch(_){}

    /* ---------- (B) Simulation bridge — external compute → per-frame render ----------
       External (Wasm-side) fluid (wind/rain) or ballistic (satellite/missile) compute feeds 64-bit
       absolute coords here every frame; the bridge owns a geojson source per channel and streams it
       straight into MapLibre. Future Cesium engine subscribes the same way. */
    window.IntMapSim=(function(){
      const ids={};
      function ensure(id, makeLayers){ if(ids[id]) return ids[id]; const sid='sim-'+id; try{ if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'geojson',data:{type:'FeatureCollection',features:[]}}); if(makeLayers) makeLayers(sid); ids[id]=sid; }catch(_){} return sid; }
      function update(id, geojson){ const sid=ids[id]||('sim-'+id); try{ GE().layers.setSourceData(sid,geojson||{type:'FeatureCollection',features:[]}); }catch(_){} }
      function feedParticles(id, arr){ update(id,{type:'FeatureCollection',features:(arr||[]).map(p=>({type:'Feature',geometry:{type:'Point',coordinates:[p.lng,p.lat,(p.alt||0)]},properties:p}))}); }
      function feedTracks(id, tracks){ update(id,{type:'FeatureCollection',features:(tracks||[]).map(t=>({type:'Feature',geometry:{type:'LineString',coordinates:t.path||t},properties:t.props||{}}))}); }
      return { ensure, update, feedParticles, feedTracks, _ids:ids };
    })();

    /* ---------- (C) Web-Worker offload bridge — keep heavy compute off the paint thread ---------- */
    window.IntMapWorker=(function(){
      let worker=null, seq=0; const pending={};
      const SRC="self.onmessage=function(e){var d=e.data||{},id=d.id,task=d.task,p=d.payload||{},out=null,err=null;try{"+
        "if(task==='haversineTotal'){var pts=p.points||[],R=6371,s=0;for(var i=1;i<pts.length;i++){var a=pts[i-1],b=pts[i],dLat=(b[1]-a[1])*Math.PI/180,dLon=(b[0]-a[0])*Math.PI/180,la1=a[1]*Math.PI/180,la2=b[1]*Math.PI/180,h=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)*Math.sin(dLon/2);s+=2*R*Math.asin(Math.min(1,Math.sqrt(h)));}out=s;}"+
        "else if(task==='echo'){out=p;}else{err='unknown task '+task;}"+
        "}catch(ex){err=String(ex);} self.postMessage({id:id,out:out,err:err});};";
      function ensure(){ if(worker) return worker; try{ const blob=new Blob([SRC],{type:'application/javascript'}); worker=new Worker(URL.createObjectURL(blob)); worker.onmessage=e=>{ const m=e.data||{},cb=pending[m.id]; if(cb){ delete pending[m.id]; m.err?cb.rej(new Error(m.err)):cb.res(m.out); } }; }catch(_){ worker=null; } return worker; }
      function run(task,payload){ return new Promise((res,rej)=>{ const w=ensure(); if(!w){ rej(new Error('worker unavailable')); return; } const id=++seq; pending[id]={res,rej}; w.postMessage({id,task,payload}); }); }
      return { run, ensure };
    })();

    /* ---------- (D) Speculative tile prefetch — camera-direction lookahead ---------- */
    (function(){
      let hist=[];
      function activeTpl(){ try{ const st=GE().scene.getStyle(); if(!st) return null;
        if(typeof HOST.mapType!=='undefined' && HOST.mapType==='sat'){ const s=st.sources['satellite']; return s&&s.tiles&&s.tiles[0]; }
        for(const id of ['bd','bdn','bl','bln']){ const s=st.sources[id]; if(s&&s.tiles){ const lyr=(st.layers||[]).find(l=>l.source===id); if(lyr && GE().layers.has(lyr.id) && GE().layers.getLayout(lyr.id,'visibility')!=='none') return s.tiles[0]; } }
        const s=st.sources['bd']; return s&&s.tiles&&s.tiles[0]; }catch(_){ return null; } }
      /* ══ (#R286) A STYLE TILE TEMPLATE IS NOT ALWAYS A URL THE BROWSER CAN LOAD ═════════════
         This warmed a tile by substituting the numbers into the ACTIVE STYLE's own template and
         assigning the result to `new Image().src` — which means something only for `http(s):`. The
         satellite source has been served by the REGISTERED `imapsat://` protocol since #R158
         (js/sat-proto.js), and satellite is the DEFAULT basemap since #R207, so the ordinary case
         handed the browser `imapsat://2/0/2`. MEASURED: twenty of them per prefetch, every one
         refused against index.html's `img-src 'self' https: data: blob:`, and the protocol handler
         never consulted — so the warm warmed NOTHING and paid for it in console errors. It surfaced
         as an INTERMITTENT failure of tests/monitors.spec.js's console-error gate, intermittent only
         because this block fires on a fast `moveend` PAIR; the leak itself was not.
         The app registers seven protocols (`imapsat`, `pmtiles`, `om`, and the DEM / world-base /
         crop ones), so the rule is about the SCHEME and not about a name: warm what the browser can
         load, and warm nothing for a template it cannot.
         ⚠ REFUSING IS NOT SILENCING, AND SATELLITE IS NOT LEFT UNWARMED. js/tile-warm.js OWNS the
         satellite prefetch: on this same `moveend` it warms that imagery through the protocol's own
         network URL (`IntMapSatProto.tileUrl`, #R206), at the level the render path actually asks
         for, across both Esri hosts, behind the dedupe memory #R196 added after measuring 865
         requests for 112 distinct tiles on a phone. A second, memory-less, twenty-five-tile block
         built here would re-create THAT defect while repairing this one. */
      const browserLoadable=(tpl)=>{ const m=/^\s*([a-z0-9+.-]+):/i.exec(tpl||''); return !m||/^https?$/i.test(m[1]); };
      /* …and the refusal is OBSERVABLE, so 「this path is dead」 can never pass for 「this path is quiet」. */
      let _last=null;
      function prefetch(lng,lat,z){ const tpl=activeTpl(); if(!tpl) return;
        if(!browserLoadable(tpl)){ _last={tpl:tpl,warmed:0,refused:true}; return; }
        z=Math.max(0,Math.min(18,Math.round(z))); const n=Math.pow(2,z);
        const xc=Math.floor((lng+180)/360*n), latR=lat*Math.PI/180, yc=Math.floor((1-Math.log(Math.tan(latR)+1/Math.cos(latR))/Math.PI)/2*n);
        let cnt=0; for(let dx=-2;dx<=2;dx++){ for(let dy=-2;dy<=2;dy++){ if(cnt>=22) break; const x=((xc+dx)%n+n)%n, y=yc+dy; if(y<0||y>=n) continue; const url=tpl.replace('{z}',z).replace('{x}',x).replace('{y}',y).replace('{s}','a'); try{ const im=new Image(); im.decoding='async'; im.src=url; }catch(_){} cnt++; } }
        _last={tpl:tpl,warmed:cnt,refused:false}; }
      GE().events.on('moveend',()=>{ try{ const c=GE().camera.getCenter(), z=GE().camera.getZoom(), now=performance.now(); hist.push({lng:c.lng,lat:c.lat,t:now}); if(hist.length>3) hist.shift(); if(hist.length<2) return; const a=hist[hist.length-2], b=hist[hist.length-1], dt=Math.max(1,b.t-a.t); let dl=b.lng-a.lng; if(dl>180)dl-=360; else if(dl<-180)dl+=360; const vlng=dl/dt, vlat=(b.lat-a.lat)/dt, look=550, pl=b.lng+vlng*look, pa=Math.max(-85,Math.min(85,b.lat+vlat*look)); if(Math.abs(vlng*look)<0.15 && Math.abs(vlat*look)<0.15) return; prefetch(pl,pa,z); }catch(_){} });
      window.SpeculativePrefetch={ prefetch, last:()=>_last };
    })();

    /* ---------- (E) New intelligence overlays ---------- */
    const jp=()=>HOST.lang==='jp';
    /* (#R243) …and the tuples this file holds AS DATA go through the same resolver — see pickArgs()
       in js/lang-registry.js. A {en,jp} object is the seventh shape #R241 named and is invisible to
       every instrument; written as a call it is measured like any other call site. */
    const L=window.IntMapLang.pick(()=>HOST.lang), LA=window.IntMapLang.pickArgs();
    /* Sovereignty disputes — international lines whose recognition is split. */
    /* (#R8c) FAITHFUL real-geography traces — NOT mathematically smoothed. The user clarified that
       "smooth" must mean true-to-real-data, not a Catmull-Rom curve (which invents shape). So these are
       dense vertices that follow the actual lines; rendered as-is (real boundary data IS short straight
       segments). Authoritative geometry would come from a bundled GeoJSON — same drop-in path as the
       languages layer — left as documented future work. */
    const DISPUTES=[
      { name:LA('Nine-dash line (S. China Sea)','九段線（南シナ海）','Neun-Striche-Linie (Südchinesisches Meer)','Линия из девяти пунктиров (Южно-Китайское море)','Línea de nueve puntos (mar de China Meridional)'), c:[[120.6,21.0],[119.8,19.8],[119.1,18.0],[118.3,16.2],[117.6,14.4],[116.7,12.6],[115.6,10.9],[114.3,9.3],[113.0,7.9],[111.6,6.5],[110.2,5.2],[109.6,4.2],[110.4,3.8],[111.8,3.9],[113.4,4.3],[114.9,5.4],[116.2,7.0],[117.2,8.9],[118.0,11.0],[118.6,13.2],[119.0,15.4],[119.4,17.6],[119.9,19.6],[120.5,21.2]] },
      { name:LA('Ukraine front line (approx.)','ウクライナ前線（概略）','Frontlinie Ukraine (ungefähr)','Линия фронта в Украине (примерно)','Frente de Ucrania (aprox.)'), c:[[37.4,50.05],[37.7,49.6],[38.0,49.2],[38.2,48.8],[38.3,48.5],[38.25,48.2],[38.0,48.0],[37.75,47.9],[37.6,47.65],[37.1,47.4],[36.4,47.3],[35.8,47.45],[35.3,47.55],[34.5,47.2],[33.7,46.8],[32.9,46.6],[32.5,46.55]] },
      { name:LA('Kashmir Line of Control','カシミール管理線','Kaschmir-Kontrolllinie','Линия контроля в Кашмире','Línea de Control de Cachemira'), c:[[77.0,35.5],[76.8,35.25],[76.5,35.0],[76.2,34.75],[75.8,34.55],[75.4,34.45],[75.0,34.35],[74.6,34.25],[74.25,34.1],[74.05,33.85],[73.95,33.5],[74.1,33.25],[74.3,32.95],[74.5,32.75],[74.65,32.66]] },
      { name:LA('Korean DMZ','朝鮮半島軍事境界線','Koreanische DMZ','Корейская ДМЗ','Zona desmilitarizada de Corea'), c:[[126.68,37.78],[126.85,37.88],[127.05,37.98],[127.28,38.12],[127.5,38.22],[127.72,38.28],[127.95,38.32],[128.18,38.45],[128.36,38.62]] },
      { name:LA('Taiwan Strait median line','台湾海峡中間線','Mittellinie der Taiwanstraße','Срединная линия Тайваньского пролива','Línea media del estrecho de Taiwán'), c:[[120.4,26.8],[120.0,25.7],[119.5,24.5],[119.0,23.3],[118.6,22.4],[118.4,21.6]] }
    ];
    function disputesFC(){ return {type:'FeatureCollection',features:DISPUTES.map(d=>({type:'Feature',geometry:{type:'LineString',coordinates:d.c},properties:{label:L.arr(d.name)}}))}; }
    /* Geodesic air-defense coverage "domes" — reuse the radius tool's geodesic-disk builders. */
    const AD_SITES=[
      {n:'Moscow · S-400',at:[37.6,55.75],r:400,c:'#e0312e'},{n:'St Petersburg · S-400',at:[30.3,59.95],r:400,c:'#e0312e'},
      {n:'Kaliningrad · S-400',at:[20.5,54.7],r:400,c:'#e0312e'},{n:'Khmeimim · S-400',at:[35.95,35.41],r:380,c:'#e0312e'},
      {n:'Crimea · S-400',at:[34.0,45.0],r:400,c:'#e0312e'},
      {n:'Beijing · HQ-9/S-400',at:[116.4,39.9],r:300,c:'#d98c00'},{n:'Fujian · HQ-9',at:[119.3,26.1],r:300,c:'#d98c00'},
      {n:'Seoul · Patriot/THAAD',at:[127,37.5],r:200,c:'#2f6bff'},{n:'Taiwan · Patriot',at:[121,23.7],r:160,c:'#2f6bff'},
      {n:'Guam · THAAD',at:[144.8,13.4],r:200,c:'#2f6bff'},{n:'Warsaw · Patriot',at:[21,52.2],r:160,c:'#2f6bff'},
      {n:'Israel · multilayer',at:[34.9,31.5],r:150,c:'#2f6bff'},{n:'Tehran · S-300/Bavar',at:[51.4,35.7],r:200,c:'#9b59b6'},
      {n:'Pyongyang · KN-06',at:[125.75,39.03],r:250,c:'#9b59b6'}
    ];
    function airDefFC(){ const f=[];
      AD_SITES.forEach(s=>{ try{
        diskFillPolys(s.at,s.r,128).forEach(poly=>f.push({type:'Feature',geometry:{type:'Polygon',coordinates:poly},properties:{color:s.c}}));
        diskOutlineLines(s.at,s.r,128).forEach(ln=>f.push({type:'Feature',geometry:{type:'LineString',coordinates:ln},properties:{color:s.c}}));
        f.push({type:'Feature',geometry:{type:'Point',coordinates:s.at},properties:{color:s.c,label:s.n}});
      }catch(_){} });
      return {type:'FeatureCollection',features:f}; }
    function ensureOverlays(){
      if(!_imCanDraw()) return false;
      try{
        if(!GE().layers.hasSource('r7-disputes')){ GE().layers.addSource('r7-disputes',{type:'geojson',data:disputesFC()});
          GE().layers.add({id:'r7-disputes-line',type:'line',source:'r7-disputes',layout:{visibility:'none','line-cap':'round'},paint:{'line-color':'#ff4d4d','line-width':2.2,'line-dasharray':[2,2],'line-opacity':0.92}});
          GE().layers.add({id:'r7-disputes-label',type:'symbol',source:'r7-disputes',layout:{visibility:'none','symbol-placement':'line-center','text-field':['get','label'],'text-size':window.IntMapLabelScale.sub(0.9),'text-font':['literal',['Noto Sans Regular']]},paint:{'text-color':'#ff7a7a','text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1.3}});
        }
        if(!GE().layers.hasSource('r7-airdef')){ GE().layers.addSource('r7-airdef',{type:'geojson',data:airDefFC()});
          GE().layers.add({id:'r7-airdef-fill',type:'fill',source:'r7-airdef',filter:['==','$type','Polygon'],layout:{visibility:'none'},paint:{'fill-color':['get','color'],'fill-opacity':0.1}});
          GE().layers.add({id:'r7-airdef-line',type:'line',source:'r7-airdef',filter:['==','$type','LineString'],layout:{visibility:'none'},paint:{'line-color':['get','color'],'line-width':1.1,'line-opacity':0.55}});
          GE().layers.add({id:'r7-airdef-pt',type:'circle',source:'r7-airdef',filter:['==','$type','Point'],layout:{visibility:'none'},paint:{'circle-radius':4,'circle-color':['get','color'],'circle-stroke-color':'#fff','circle-stroke-width':1.5}});
          GE().layers.add({id:'r7-airdef-label',type:'symbol',source:'r7-airdef',filter:['==','$type','Point'],layout:{visibility:'none','text-field':['get','label'],'text-size':window.IntMapLabelScale.sub(0.82),'text-offset':[0,1.1],'text-anchor':'top','text-font':['literal',['Noto Sans Regular']]},paint:{'text-color':'#fff','text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1.2}});
        }
        return true;
      }catch(e){ return false; }
    }
    const DSET=['r7-disputes-line','r7-disputes-label'], ASET=['r7-airdef-fill','r7-airdef-line','r7-airdef-pt','r7-airdef-label'];
    const state={disputes:false,airdef:false,langs:false};
    function setVis(ids,on){ ids.forEach(l=>{ if(GE().layers.has(l)) GE().layers.setLayout(l,'visibility',on?'visible':'none'); }); }
    function refreshDisputeLabels(){ try{ GE().layers.setSourceData('r7-disputes',disputesFC()); }catch(_){} }

    /* ===== (#R8b) World-languages overlay — Jake Jing's digitisation of the Atlas of the World's
       Languages (Asher & Moseley). It's a heavy global polygon set, so it is: LAZY-loaded on first
       toggle; simplified at the source (tolerance + low maxzoom) so the worker tiling never janks the
       UI; kept IN MEMORY (langData) so a theme/basemap swap re-adds it without re-fetching; and inserted
       UNDER the place labels. Future-proof: set window.LANGUAGES_TILES_URL to an MVT/PMTiles endpoint and
       it transparently uses a vector source instead of the local GeoJSON. Hover reuses the .map-tooltip
       material to pop Language + Family. ===== */
    const LANG_SRC='langs-src', LANG_FILL='langs-fill', LANG_LINE='langs-line', LSET=[LANG_FILL,LANG_LINE];
    let langData=null, langFetching=false, langHoverWired=false, langTip=null;
    const _esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const _langHash=s=>{ let h=0; for(let i=0;i<(s||'').length;i++) h=(h*31+s.charCodeAt(i))>>>0; return h; };
    const _firstLabelId=()=>{ try{ for(const l of (GE().scene.getStyle().layers||[])) if(l.type==='symbol') return l.id; }catch(_){} return undefined; };
    const _langProp=(p,keys)=>{ for(const k of keys){ if(p&&p[k]!=null&&p[k]!=='') return p[k]; } return ''; };
    function addLangLayers(isVector){ const before=_firstLabelId(); const ext=isVector?{'source-layer':'languages'}:{};
      if(!GE().layers.has(LANG_FILL)) GE().layers.add(Object.assign({id:LANG_FILL,type:'fill',source:LANG_SRC,layout:{visibility:'none'},paint:{'fill-color':['coalesce',['get','__col'],'#6f9be8'],'fill-opacity':0.34,'fill-antialias':true}},ext),before);
      if(!GE().layers.has(LANG_LINE)) GE().layers.add(Object.assign({id:LANG_LINE,type:'line',source:LANG_SRC,layout:{visibility:'none'},paint:{'line-color':'rgba(255,255,255,0.45)','line-width':['interpolate',['linear'],['zoom'],2,0.3,7,0.9]}},ext),before);
    }
    function ensureLangSource(cb){
      if(GE().layers.hasSource(LANG_SRC)){ cb&&cb(true); return; }
      if(window.LANGUAGES_TILES_URL){ try{ GE().layers.addSource(LANG_SRC,{type:'vector',tiles:[window.LANGUAGES_TILES_URL],maxzoom:10}); addLangLayers(true); cb&&cb(true); return; }catch(_){} }
      if(langData){ try{ GE().layers.addSource(LANG_SRC,{type:'geojson',data:langData,tolerance:1.4,maxzoom:8,buffer:0}); addLangLayers(false); cb&&cb(true); return; }catch(_){} }
      if(langFetching) return;
      langFetching=true;
      fetch('data/asher_languages.geojson').then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }).then(gj=>{
        try{ (gj.features||[]).forEach(f=>{ const p=f.properties||(f.properties={}); const fam=_langProp(p,['family','Family','FAMILY','fam','Fam','classification']); const hue=_langHash(fam||_langProp(p,['name','Language','language']))%360; p.__col='hsl('+hue+',58%,56%)'; }); }catch(_){}
        langData=gj; langFetching=false;
        try{ GE().layers.addSource(LANG_SRC,{type:'geojson',data:gj,tolerance:1.4,maxzoom:8,buffer:0}); addLangLayers(false); cb&&cb(true); }catch(_){ cb&&cb(false); }
      }).catch(()=>{ langFetching=false; try{ satToast(window.IntMapLang.t(HOST.lang,"Language data not found — add data/asher_languages.geojson","言語データが見つかりません（data/asher_languages.geojson を配置）","Sprachdaten nicht gefunden — data/asher_languages.geojson hinzufügen","Языковые данные не найдены — добавьте data/asher_languages.geojson","No se encontraron los datos de idiomas: añada data/asher_languages.geojson")); }catch(_){}
        const x=document.getElementById('r7-dl-langs'); if(x){ x.checked=false; const r=x.closest('.lyr-row'); if(r) r.classList.remove('on'); } cb&&cb(false); });
    }
    function wireLangHover(){ if(langHoverWired) return; langHoverWired=true;
      langTip=document.createElement('div'); langTip.className='map-tooltip'; (document.getElementById('map-container')||document.body).appendChild(langTip);
      GE().events.onLayer('mousemove',LANG_FILL,(e)=>{ const f=e.features&&e.features[0]; if(!f){ langTip.style.display='none'; return; } const p=f.properties||{};
        const lang=_langProp(p,['Language','language','name','NAME','Name','PRNAME','label'])||'—', fam=_langProp(p,['Family','family','FAMILY','fam','classification'])||'—';
        langTip.innerHTML='<div style="font-weight:600;margin-bottom:3px;">'+_esc(lang)+'</div><div style="color:var(--text-muted);font-size:12px;">'+(window.IntMapLang.t(HOST.lang,"Family: ","語族: ","Sprachfamilie: ","Семья: ","Familia: "))+_esc(fam)+'</div>';
        langTip.style.display='block'; langTip.style.left=e.point.x+'px'; langTip.style.top=e.point.y+'px'; });
      GE().events.onLayer('mouseenter',LANG_FILL,()=>{ GE().render.canvas().style.cursor='pointer'; });
      GE().events.onLayer('mouseleave',LANG_FILL,()=>{ if(langTip) langTip.style.display='none'; GE().render.canvas().style.cursor=''; });
    }
    function toggle(which,on){ state[which]=on;
      if(which==='langs'){ if(on){ ensureLangSource(ok=>{ if(ok){ wireLangHover(); setVis(LSET,true); } }); } else { setVis(LSET,false); if(langTip) langTip.style.display='none'; } return; }
      const apply=()=>{ if(!ensureOverlays()){ GE().events.once('idle',apply); return; } setVis(which==='disputes'?DSET:ASET,on); }; apply(); }
    /* re-apply after a style swap (theme / satellite engine) so the overlays survive */
    GE().events.on('styledata',()=>{ if(state.disputes||state.airdef){ setTimeout(()=>{ if(ensureOverlays()){ setVis(DSET,state.disputes); setVis(ASET,state.airdef); } },60); }
      if(state.langs){ setTimeout(()=>{ ensureLangSource(ok=>{ if(ok) setVis(LSET,true); }); },80); } });

    /* dropdown UI — appended after the existing layer groups, non-destructive */
    /* (#R10) The "Intelligence (advanced)" category (disputes / air-defense / languages) was removed per
       request. The toggle/state machinery is kept (harmless, unused) so nothing else needs touching. */
    function buildUI(){ return; }
    if(document.readyState!=='loading') setTimeout(buildUI,0); else document.addEventListener('DOMContentLoaded',buildUI);
    /* keep the advanced labels localized on language switch */
    const _origUpdateI18n=window.updateI18n;
    function _r7Relabel(){ const h=document.querySelector('[data-r7head]'); if(h) h.textContent=window.IntMapLang.t(HOST.lang,"Intelligence (advanced)","インテリジェンス（高度）","Aufklärung (erweitert)","Разведка (расширенно)","Inteligencia (avanzado)"); const d=document.getElementById('r7-dl-disputes-lbl'), a=document.getElementById('r7-dl-airdef-lbl'), l=document.getElementById('r7-dl-langs-lbl'); if(d) d.textContent=window.IntMapLang.t(HOST.lang,"Disputed boundaries","係争境界線","Umstrittene Grenzen","Спорные границы","Fronteras en disputa"); if(a) a.textContent=window.IntMapLang.t(HOST.lang,"Air-defense coverage","防空カバレッジ（射程ドーム）","Luftverteidigungsabdeckung","Зоны ПВО","Cobertura de defensa aérea"); if(l) l.textContent=window.IntMapLang.t(HOST.lang,"World languages","世界の言語分布","Sprachen der Welt","Языки мира","Idiomas del mundo"); refreshDisputeLabels(); }
    /* ⚠ (#R466) THIS USED TO LISTEN TO THE HEADER LANGUAGE PILLS, and #R11 hid those permanently
       (`css/intmap.css` `.lang-toggle{display:none!important}` — «language is changed from Settings
       only»), so the relabel had no reachable trigger left: the five buttons it wired are still in
       the markup and can never be clicked. It listens to the event the switch actually dispatches
       now, which also reaches the map itself — `refreshDisputeLabels()` re-pushes the dispute
       geometry, whose labels are language-dependent. */
    window.addEventListener('intmap-lang',()=>setTimeout(_r7Relabel,20));
    window.IntMapOverlays={ toggle, _ensure:ensureOverlays };
  })();
};
