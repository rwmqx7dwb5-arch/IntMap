/* ============================================================================
 *  IntMap · Road / foot / bike / transit routing — IntMapRouting  (#R163)
 * ----------------------------------------------------------------------------
 *  Real turn-by-turn directions from public OSRM + Valhalla + Transitous/MOTIS, drawn on the map
 *  with per-mode leg styling, alternatives, lane/heading guidance and GPX/GeoJSON export.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R163). The values it used
 *  to inherit from that closure are now passed in explicitly — see Architecture.md §3.1.
 *   Reassigned at runtime, so read LIVE through HOST (never captured):
 *      currentLang -> HOST.lang
 *  Never rebound, so bound once under the original name:
 *      bringToFront, makeDraggable
 * 
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.routing=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const bringToFront=HOST.bringToFront, makeDraggable=HOST.makeDraggable;
  return (function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { route(){ return Promise.resolve({ok:false}); }, clear(){} };
    const SRC='imroute-src';
    /* (#R85) per-mode leg styling ("どこで徒歩、どこで鉄道なのか地図上で一切わからない") — walking legs draw as a
       DOTTED line in grey, transit legs as a SOLID line coloured by vehicle mode (rail blue, subway orange, tram
       green, bus purple, ferry teal), with a white casing under everything and a ring marker at every stop. */
    function _modeColor(m){ m=String(m||'').toUpperCase();
      if(/SUBWAY|METRO/.test(m)) return '#ff6d00';
      if(/TRAM|STREETCAR|LIGHT_RAIL/.test(m)) return '#00a152';
      if(/BUS|COACH/.test(m)) return '#7b1fa2';
      if(/FERRY|BOAT|SHIP/.test(m)) return '#0097a7';
      if(/WALK|FOOT/.test(m)) return '#7a7f87';
      if(/BIKE|CYCL/.test(m)) return '#00897b';
      if(/HIGHSPEED|LONG_DISTANCE|NIGHT|REGIONAL|SUBURBAN|RAIL|TRAIN/.test(m)) return '#1558d6';
      if(/CAR|DRIV/.test(m)) return '#1a73e8';
      return '#d81b60'; }
    function _modeIcon(m){ m=String(m||'').toUpperCase();
      if(/SUBWAY|METRO/.test(m)) return '🚇'; if(/TRAM|STREETCAR|LIGHT_RAIL/.test(m)) return '🚊';
      if(/BUS|COACH/.test(m)) return '🚌'; if(/FERRY|BOAT/.test(m)) return '⛴';
      if(/WALK|FOOT/.test(m)) return '🚶'; if(/BIKE|CYCL/.test(m)) return '🚲';
      if(/HIGHSPEED|LONG_DISTANCE/.test(m)) return '🚄'; if(/RAIL|TRAIN|REGIONAL|SUBURBAN|NIGHT/.test(m)) return '🚆';
      if(/CAR|DRIV/.test(m)) return '🚗'; return '🚈'; }
    /* (#R105) ROOT CAUSE of "鉄道経路が実際の路線を無視した直線になる": the old decoder used 32-bit bitwise ops
       (`<<shift`, `>>1`, `&1`), which OVERFLOW for precision-7 polylines wherever the coordinate exceeds ~2^31 — i.e.
       any longitude > ~107° (all of East Asia, incl. Tokyo 139°). The longitude decoded to garbage (−74.98 for
       Tokyo's 139.77), the R103 >3° guard then DISCARDED the geometry, and the straight from→to fallback drew the
       "直線". Decode with plain arithmetic (Math.pow / %2 / /2) so values up to 2^53 stay exact. Verified: the Tokyo→
       Yokohama rail leg now decodes to 139 points that follow the real JR track. */
    function _decodePoly(str,precision){ let index=0,lat=0,lng=0,coords=[],factor=Math.pow(10,precision||5);
      const rd=()=>{ let shift=0,result=0,b; do{ b=str.charCodeAt(index++)-63; result+=(b&0x1f)*Math.pow(2,shift); shift+=5; }while(b>=0x20);
        return (result%2===1)?(-(result+1)/2):(result/2); };
      while(index<str.length){ lat+=rd(); lng+=rd(); coords.push([lng/factor,lat/factor]); } return coords; }
    function ensureLayers(){ try{ if(GE().layers.hasSource(SRC)) return true; if(!_imCanDraw()) return false;
      GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      GE().layers.add({id:'imroute-cas',type:'line',source:SRC,filter:['==',['geometry-type'],'LineString'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':['+',['coalesce',['get','w'],5],4],'line-opacity':0.6}});
      GE().layers.add({id:'imroute-walk',type:'line',source:SRC,filter:['all',['==',['geometry-type'],'LineString'],['==',['get','walk'],1]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','col'],'#7a7f87'],'line-width':['coalesce',['get','w'],4],'line-dasharray':[0,2],'line-opacity':['coalesce',['get','op'],0.95]}});
      GE().layers.add({id:'imroute-rail',type:'line',source:SRC,filter:['all',['==',['geometry-type'],'LineString'],['!=',['get','walk'],1]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','col'],'#1a73e8'],'line-width':['coalesce',['get','w'],5],'line-opacity':['coalesce',['get','op'],1]}});
      GE().layers.add({id:'imroute-line',type:'line',source:SRC,filter:['all',['==',['geometry-type'],'LineString'],['==',['get','walk'],9]],layout:{},paint:{'line-color':'#1a73e8','line-width':4.5}});   /* legacy no-op filter kept for _OVL id */
      GE().layers.add({id:'imroute-transfer',type:'circle',source:SRC,filter:['all',['==',['geometry-type'],'Point'],['==',['get','k'],'stop']],paint:{'circle-radius':4.6,'circle-color':'#fff','circle-stroke-color':['coalesce',['get','col'],'#1a73e8'],'circle-stroke-width':2.6}});
      GE().layers.add({id:'imroute-pt',type:'circle',source:SRC,filter:['all',['==',['geometry-type'],'Point'],['!=',['get','k'],'stop']],paint:{'circle-radius':6.5,'circle-color':['coalesce',['get','color'],'#1a73e8'],'circle-stroke-color':'#fff','circle-stroke-width':2.5}});
      return true; }catch(_){ return false; } }
    function clear(){ _lastPaint=null; _abortInflight(); try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} }
    const PROFILES={ driving:['router.project-osrm.org','driving'], car:['router.project-osrm.org','driving'], drive:['router.project-osrm.org','driving'],
      walking:['routing.openstreetmap.de/routed-foot','foot'], walk:['routing.openstreetmap.de/routed-foot','foot'], foot:['routing.openstreetmap.de/routed-foot','foot'],
      cycling:['routing.openstreetmap.de/routed-bike','bike'], cycle:['routing.openstreetmap.de/routed-bike','bike'], bike:['routing.openstreetmap.de/routed-bike','bike'] };
    const _isTransit=m=>/transit|train|rail|public|metro|subway|tram|bus|ferry|電車|鉄道|地下鉄|バス|公共|列車/i.test(String(m||''));
    /* (#R85) REAL public-transit routing via Transitous / MOTIS (free, GTFS worldwide): typed legs (WALK / RAIL /
       SUBWAY / BUS / FERRY …) each with real geometry — so "電車" actually rides the rails, and the map shows
       exactly where you walk vs ride. No silent fallback to roads: if there is no transit here we say so. */
    function _hav(a,b){ const R=6371,dLat=(b[1]-a[1])*Math.PI/180,dLng=(b[0]-a[0])*Math.PI/180,la1=a[1]*Math.PI/180,la2=b[1]*Math.PI/180; const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.min(1,Math.sqrt(h))); }
    /* ===== (#R126) request lifecycle — 経路10-10 §3.4/§17.1/§24.12: every route computation gets a requestId; a NEW
       request aborts all in-flight fetches of the previous one, and a completed request whose id is no longer current
       returns status 'cancelled' WITHOUT drawing — a stale response can never overwrite a newer route on screen. */
    let _reqSeq=0, _acPool=[];
    function _mkAC(ms){ const ac=new AbortController(); ac._t=setTimeout(()=>{ try{ac.abort();}catch(_){}} ,ms||30000); _acPool.push(ac); return ac; }
    function _rmAC(ac){ try{ clearTimeout(ac._t); }catch(_){} const i=_acPool.indexOf(ac); if(i>=0) _acPool.splice(i,1); }
    function _abortInflight(){ _acPool.forEach(a=>{ try{ clearTimeout(a._t); a.abort(); }catch(_){} }); _acPool=[]; }
    /* (#R86) transit alternatives — ALL alternatives are drawn at once (like the Google/Apple-Maps screenshot): the
       selected one bright & on top, the others dimmed & thin in their own DISTINCT palette colour; tapping one in the
       reply selects it. (#R86d) The SELECTED route is coloured PER LEG BY MODE on the map (walk grey-dotted, subway
       orange, rail blue, bus purple, tram green, ferry teal) — matching the itinerary detail list — so you can see at
       a glance where you walk vs ride and on what. Unselected alternatives keep their single palette colour. */
    const ALT_PAL=['#1a73e8','#e8710a','#12a150','#a142f4','#e52592'];
    /* ===== (#R126) RouteStore — 経路10-10指示書 §4.2/§24.3: alternatives + selection live in a store keyed by
       routeSetId (one per computed route set), NOT in shared module globals, so a tap on an OLD Atlas message's
       alternative selects within THAT message's route set instead of whatever was computed last. */
    let _rsSeq=0; const _rsets=new Map(); let _rsActive=null;
    function _rsNew(alts,ends){ const id='rs'+(++_rsSeq); _rsets.set(id,{alts,ends,sel:0});
      if(_rsets.size>12){ const k=_rsets.keys().next().value; if(k!==id) _rsets.delete(k); } _rsActive=id; return id; }
    /* (#R126) §2.1/§24.2: CALC and DRAW are separate — _paint stashes the last feature set and repaints it once the
       style is ready (styledata below), so a route computed while the style is loading still SUCCEEDS. */
    let _lastPaint=null;
    function _bounds(coords){ if(!coords||!coords.length) return null;
      /* §3.19/§14.6 dateline-safe: unwrap longitudes onto a continuous axis before min/max */
      let lo=1e9,hi=-1e9; coords.forEach(p=>{ if(p[0]<lo)lo=p[0]; if(p[0]>hi)hi=p[0]; });
      const wrap=(hi-lo>180); let a=1e9,b=1e9,c=-1e9,d=-1e9;
      coords.forEach(p=>{ const x=(wrap&&p[0]<0)?p[0]+360:p[0]; if(x<a)a=x; if(x>c)c=x; if(p[1]<b)b=p[1]; if(p[1]>d)d=p[1]; });
      return (isFinite(a)&&c>=a)?[[a,b],[c,d]]:null; }
    function _paint(feats,fitCoords,maxZoom){ _lastPaint={feats:feats,fit:fitCoords||null,mz:maxZoom||14};
      if(!ensureLayers()) return false;   /* stashed — styledata repaints (and fits, once) when the style is ready */
      try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); }catch(_){}
      if(fitCoords){ try{ const bb=_bounds(fitCoords); if(bb) GE().camera.fitBounds(bb,{padding:70,maxZoom:maxZoom||14,duration:900}); }catch(_){} }
      _lastPaint.fit=null;   /* fit only once — a later style-swap repaint must not re-fly the camera */
      return true; }
    function _drawAlts(sel,setId){ const rs=_rsets.get(setId||_rsActive); if(!rs||!rs.alts.length) return;
      const alts=rs.alts; sel=Math.max(0,Math.min(alts.length-1,sel|0)); rs.sel=sel; if(setId) _rsActive=setId;
      const feats=[]; const order=[]; for(let i=0;i<alts.length;i++) if(i!==sel) order.push(i); order.push(sel);   /* selected last = on top within each layer */
      order.forEach(i=>{ const a=alts[i], on=(i===sel); (a.lines||[]).forEach(ln=>{ const col=on?(ln.col||a.color):a.color; feats.push({type:'Feature',geometry:{type:'LineString',coordinates:ln.coords},properties:{col:col,walk:ln.walk,w:on?(ln.walk?4.5:6):(ln.walk?3:3.5),op:on?1:0.4}}); }); });   /* (#R86d) selected route → each leg its MODE colour (walk grey-dotted, subway orange, rail blue, bus purple, tram green, ferry teal); other alternatives → their distinct palette colour, dimmed */
      const sa=alts[sel]; (sa.stops||[]).forEach(s=>feats.push({type:'Feature',geometry:{type:'Point',coordinates:s},properties:{k:'stop',col:sa.color}}));
      if(rs.ends){ feats.push({type:'Feature',geometry:{type:'Point',coordinates:rs.ends[0]},properties:{color:'#34a853'}}); feats.push({type:'Feature',geometry:{type:'Point',coordinates:rs.ends[1]},properties:{color:'#ea4335'}}); }
      const fc=[]; (sa.lines||[]).forEach(ln=>ln.coords.forEach(p=>fc.push(p)));
      _paint(feats,fc.length?fc:null,15); }
    function selectAlt(i,setId){ const rs=_rsets.get(setId||_rsActive); if(rs&&rs.alts[i]){ _drawAlts(i,setId||_rsActive); return true; } return false; }
    /* (#R132) 経路10-10 §12.5: highlight ONE step's segment on the currently-selected road route + fly to it. Steps
       carry a start/end coordinate index into the selected alternative's full geometry; we paint the sub-segment on
       top and ease the camera onto it. Returns false if the set/step is unknown (a stale message card). */
    function selectStep(setId,stepIdx,coords){ try{ const rs=_rsets.get(setId||_rsActive); if(!rs) return false;
      const a=rs.alts[rs.sel]||rs.alts[0]; if(!a) return false;
      _drawAlts(rs.sel,setId||_rsActive);   /* repaint base first so a previous step highlight is cleared (_lastPaint.feats now = the base) */
      if((!coords||coords.length<2)&&a.steps&&a.steps[stepIdx]&&a.steps[stepIdx].geometry){ coords=a.steps[stepIdx].geometry.coordinates; }   /* (#R132) derive from the store so Atlas needn't carry step geometry in the DOM */
      if(!coords||coords.length<2) return true;
      const hi={type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{col:'#ffd23f',walk:0,w:9,op:1}};
      const base=(_lastPaint&&_lastPaint.feats)?_lastPaint.feats:[];   /* (#R132) use our OWN paint store, not MapLibre's {geojson:…}-wrapped source._data */
      try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:base.concat([hi])}); }catch(_){}
      try{ const bb=_bounds(coords); if(bb) GE().camera.fitBounds(bb,{padding:120,maxZoom:16,duration:800}); }catch(_){}
      return true; }catch(_){ return false; } }
    /* (#R132) 経路10-10 §3.3/§7.1-7.2/§10: road ALTERNATIVES — coarse-grid overlap so near-identical OSRM alternatives
       collapse to one (keep the faster), then rank fastest-first and give each a meaningful differentiator label. */
    function _roadSig(coords){ const s=new Set(); (coords||[]).forEach(p=>s.add(Math.round(p[0]*200)+'_'+Math.round(p[1]*200))); return s; }
    /* OSRM's `alternatives` already guarantees the routes are meaningfully distinct (built-in sharing factor), so
       dedup ONLY removes a near-exact repeat: high geometric overlap AND near-equal time (else two routes that share
       a motorway corridor but diverge — e.g. Munich→Nuremberg 109 vs 119 min — get wrongly collapsed). */
    function _roadDedup(alts){ const out=[]; alts.forEach(a=>{ a._sig=_roadSig(a.lines[0]&&a.lines[0].coords);
      const dup=out.find(b=>{ let inter=0; const small=(a._sig.size<b._sig.size)?a._sig:b._sig, big=(a._sig.size<b._sig.size)?b._sig:a._sig; small.forEach(k=>{ if(big.has(k)) inter++; }); const ov=small.size?(inter/small.size):0;
        const dt=Math.abs((a.duration||0)-(b.duration||0))/Math.max(1,Math.min(a.duration||1,b.duration||1)); return ov>0.92&&dt<0.03; });
      if(dup){ if(a.duration<dup.duration){ const i=out.indexOf(dup); out[i]=a; } } else out.push(a); }); return out; }
    function _labelRoad(alts,avoid){ if(!alts.length) return; const fast=alts[0];
      let si=0,sd=alts[0].distance; for(let i=1;i<alts.length;i++){ if(alts[i].distance<sd){ sd=alts[i].distance; si=i; } }
      const avoidTx=(avoid&&avoid.length)?(' · '+LL('avoids ','回避: ','ohne ','без ','evita ')+avoid.map(x=>({toll:LL('tolls','有料','Maut','платн.','peajes'),motorway:LL('highways','高速','Autobahn','магистр.','autopistas'),ferry:LL('ferries','フェリー','Fähren','паромы','ferris')}[x]||x)).join(', ')):'';
      alts.forEach((a,i)=>{ if(i===0) a.label=LL('Fastest','最速','Schnellste','Быстрейший','Más rápido')+avoidTx;
        else if(i===si) a.label=LL('Shortest','最短距離','Kürzeste','Кратчайший','Más corto')+avoidTx;
        else { const dMin=Math.round((a.duration-fast.duration)/60); a.label=(dMin>0?('+'+dMin+' '+LL('min','分','Min','мин','min')):LL('Alternative','代替','Alternative','Альтернатива','Alternativa'))+avoidTx; } }); }
    /* (#R132) 経路10-10 §7.3/§4.7: AVOID toll / highway / ferry. The public OSRM demo REJECTS `exclude=` ("Exclude
       flag combination is not supported"), so an avoid request would be a broken button — instead we route it on
       Valhalla (FOSSGIS, keyless — the same server used for isochrones), which honours costing_options.use_* and
       genuinely reroutes (measured: Munich→Nuremberg avoiding highways = 218 km/252 min vs 169 km/109 min). This is
       real provider-selection-by-feature, not a facade. Valhalla's maneuver `type` maps onto the SAME _maneuver()
       pseudo-step so the 5-language turn-by-turn + lane/step-highlight all work unchanged. */
    function _vhStep(m){ const T=m.type;
      const MAP={1:['depart',''],2:['depart',''],3:['depart',''],7:['new name','straight'],8:['continue','straight'],
        9:['turn','slight right'],10:['turn','right'],11:['turn','sharp right'],12:['turn','uturn'],13:['turn','uturn'],
        14:['turn','sharp left'],15:['turn','left'],16:['turn','slight left'],
        17:['on ramp','straight'],18:['on ramp','right'],19:['on ramp','left'],20:['off ramp','right'],21:['off ramp','left'],
        22:['fork','straight'],23:['fork','slight right'],24:['fork','slight left'],25:['merge','straight'],
        26:['roundabout',''],27:['continue','straight'],28:['notification',''],29:['notification',''],
        4:['arrive',''],5:['arrive','right'],6:['arrive','left'],37:['arrive','']};
      const e=MAP[T]||['continue','straight'];
      const step={maneuver:{type:e[0],modifier:e[1]},name:(m.street_names&&m.street_names[0])||'',distance:(m.length||0)*1000};
      if(T===26&&m.roundabout_exit_count) step.maneuver.exit=m.roundabout_exit_count;
      return step; }
    /* (#R184) Valhalla's costing name for each of the road modes, so an AREA to avoid can be honoured
       on foot and by bike as well as by car. OSRM has no equivalent at all — the demo server rejects
       `exclude=` — which is why the whole avoid path goes through Valhalla. */
    const _vhCosting=(m)=>/walk|foot|pedestr/i.test(m||'')?'pedestrian':/cycl|bike/i.test(m||'')?'bicycle':'auto';
    async function _roadValhalla(from,to,opts){ const rid=opts._rid; const av=new Set(opts.avoid||[]);
      const co={}; if(av.has('toll')) co.use_tolls=0; if(av.has('motorway')) co.use_highways=0.1; if(av.has('ferry')) co.use_ferry=0;
      const costing=_vhCosting(opts.mode);
      const cOpts={}; cOpts[costing]=co;
      const body={locations:[{lat:+from.lat,lon:+from.lng}].concat((Array.isArray(opts.via)?opts.via:[]).map(p=>({lat:+p.lat,lon:+p.lng}))).concat([{lat:+to.lat,lon:+to.lng}]),
        costing:costing,costing_options:cOpts,directions_options:{units:'kilometers'}};
      /* (#R184) 「通過禁止範囲を地図で描画」 — the drawn areas, as Valhalla's own exclude_polygons. Rings
         are [lon,lat], which is the order Valhalla documents and the order this app stores anyway.
         Measured on the public FOSSGIS server (Munich, one 2 km box across the direct line):
         4.675 km / 725 s becomes 5.444 km / 834 s — it really reroutes, it does not merely accept the
         parameter. Degenerate rings are dropped rather than sent, because a 2-point "polygon" makes
         the whole request fail and the user would see "no route" instead of "your box is empty". */
      const ex=(Array.isArray(opts.avoidAreas)?opts.avoidAreas:[])
        .map(r=>(Array.isArray(r)?r.filter(p=>Array.isArray(p)&&isFinite(+p[0])&&isFinite(+p[1])).map(p=>[+p[0],+p[1]]):[]))
        .filter(r=>r.length>=4);
      if(ex.length) body.exclude_polygons=ex;
      const url='https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(body));
      let j=null,errKind='provider_unavailable'; const ac=_mkAC(22000);
      try{ const r=await fetch(url,{signal:ac.signal});
        if(r.status===429) errKind='rate_limited';
        else if(r.ok){ const jj=await r.json(); if(jj&&jj.trip&&jj.trip.status===0&&jj.trip.legs&&jj.trip.legs.length) j=jj; else errKind='no_route'; }
        else if(r.status>=400&&r.status<500) errKind='no_route'; }
      catch(e){ errKind=(e&&e.name==='AbortError')?((rid!==_reqSeq)?'cancelled':'provider_timeout'):'provider_unavailable'; }
      finally{ _rmAC(ac); }
      if(rid!==_reqSeq) return {ok:false,status:'cancelled'};
      if(!j) return {ok:false,status:errKind,provider:'valhalla'};
      const trip=j.trip; let shape=[]; const steps=[];
      trip.legs.forEach(leg=>{ const seg=_decodePoly(leg.shape,6);
        (leg.maneuvers||[]).forEach(m=>{ const st=_vhStep(m); const b=Math.max(0,m.begin_shape_index||0), e2=Math.max(b,m.end_shape_index||0);
          st.geometry={type:'LineString',coordinates:seg.slice(b,e2+1)}; steps.push(st); });
        shape=shape.length?shape.concat(seg):seg; });
      const avoidTx=(opts.avoid&&opts.avoid.length)?(LL('avoids ','回避: ','ohne ','без ','evita ')+opts.avoid.map(x=>({toll:LL('tolls','有料道路','Maut','платные','peajes'),motorway:LL('highways','高速道路','Autobahn','магистрали','autopistas'),ferry:LL('ferries','フェリー','Fähren','паромы','ferris')}[x]||x)).join(', ')):LL('Route','経路','Route','Маршрут','Ruta');
      const alt={lines:[{coords:shape,walk:0,col:'#1a73e8'}],stops:[],geometry:{type:'LineString',coordinates:shape},coords:shape,steps:steps,
        duration:trip.summary.time,distance:(trip.summary.length||0)*1000,color:ALT_PAL[0],label:avoidTx,
        legDurations:(trip.legs||[]).map(l=>(l.summary&&l.summary.time)||0)};
      const setId=_rsNew([alt],[[+from.lng,+from.lat],[+to.lng,+to.lat]]); _drawAlts(0,setId);
      return {ok:true,status:'success',road:true,provider:'valhalla',routeSetId:setId,sel:0,
        mode:(costing==='pedestrian'?'walking':costing==='bicycle'?'cycling':'driving'),
        avoid:opts.avoid, avoidAreas:ex.length||0,
        distance:alt.distance,duration:alt.duration,steps:steps,coords:shape,legDurations:alt.legDurations,
        alternatives:[{duration:alt.duration,distance:alt.distance,steps:steps,label:alt.label,color:alt.color,coords:shape}]}; }
    /* (#R125) plan fetch extracted from transit() so the intercity JR bridge can reuse it for ACCESS/EGRESS legs.
       (#R126) 経路10-10 §3.2/§24.1: public CORS proxies REMOVED from the routing path (api.transitous.org serves CORS
       headers directly — proxying routed third parties through corsproxy.io/allorigins leaked origin/destination
       coordinates and mangled polylines). Direct fetch with one backoff retry; requests register in the module abort
       pool so a newer route request cancels them. _planItins._fail carries WHY it failed (§2.5 error taxonomy). */
    async function _planItins(from,to,opts){ opts=opts||{};
      const when=(opts.time?new Date(opts.time):new Date()); const tISO=isFinite(when.getTime())?when.toISOString():new Date().toISOString();
      /* (#R184) 「フェリー、鉄道、徒歩区間の個別除外」 — MOTIS takes the transit modes it MAY use as an
         allow-list, so excluding one means sending the others. Verified against the live server: a
         valid list answers 200, an invalid mode name answers 500, so the parameter is really read
         rather than ignored. Walking is not a transit mode — it is how you reach a stop — so
         excluding it is expressed by capping the access/egress distance instead (below). */
      const url='https://api.transitous.org/api/v1/plan?fromPlace='+(+from.lat).toFixed(6)+','+(+from.lng).toFixed(6)+'&toPlace='+(+to.lat).toFixed(6)+','+(+to.lng).toFixed(6)+'&time='+encodeURIComponent(tISO)+(opts.arriveBy?'&arriveBy=true':'')
        +(Array.isArray(opts.transitModes)&&opts.transitModes.length?('&transitModes='+encodeURIComponent(opts.transitModes.join(','))):'')
        +(isFinite(+opts.maxWalkM)&&+opts.maxWalkM>0
          ? (()=>{ const s=Math.round(Math.max(60,Math.min(3600,(+opts.maxWalkM)/1.35)));   /* 1.35 m/s walking */
                   return '&maxPreTransitTime='+s+'&maxPostTransitTime='+s; })() : '');
      const tmo=opts.quick?15000:32000;
      let fail='provider_unavailable';
      const _fetchPlan=async(u)=>{ const ac=_mkAC(tmo);
        try{ const r=await fetch(u,{signal:ac.signal});
          if(r){ if(r.status===429){ fail='rate_limited'; return null; }
            if(r.ok){ const jj=await r.json(); const it=jj&&(jj.itineraries||(jj.plan&&jj.plan.itineraries));
              if(it&&it.length) return jj; fail='no_transit'; return null; }   /* provider answered: genuinely no itineraries */
            fail='provider_unavailable'; } }
        catch(e){ fail=(e&&e.name==='AbortError')?'provider_timeout':'provider_unavailable'; }
        finally{ _rmAC(ac); } return null; };
      const attempts=opts.quick?[url]:[url,url,url];
      let j=null; for(let i=0;i<attempts.length;i++){ j=await _fetchPlan(attempts[i]); if(j||fail==='no_transit') break; if(!opts.quick&&i<attempts.length-1) await new Promise(r=>setTimeout(r,800)); }
      const its=j&&(j.itineraries||(j.plan&&j.plan.itineraries));
      _planItins._fail=(its&&its.length)?null:fail;
      return (its&&its.length)?its:null; }
    const _P=l=>({lng:+(l.lon!=null?l.lon:l.lng),lat:+l.lat});
    /* ===== (#R125) INTERCITY JAPAN RAIL BRIDGE ("瑞穂区役所から新宿まで電車で、というのに対応していない").
       Transitous/MOTIS only carries Japan's OPEN GTFS (Tokyo/ODPT etc. — Shinjuku→Tokyo works), but JR Central and
       the Shinkansen publish no open timetable, so any Nagoya↔Tokyo ask returned a flat "no transit". This bridge
       answers intercity Japan asks with REAL infrastructure: a curated registry of the actual Shinkansen network
       (real lines, real stations + coordinates, express-pattern segment minutes and service headways from the
       operators' PUBLISHED timetables) routed with Dijkstra, plus local access/egress legs planned on Transitous
       where it HAS coverage and otherwise shown as clearly-labelled distance estimates. Times are frequency-based
       estimates (headway/2 boarding wait), NEVER invented clock times, and the reply says so. The drawn intercity
       line passes through the real stations it stops at (the alignment BETWEEN stations is schematic — labelled,
       not passed off as track geometry; the R122 rule against fake OSM-graph passenger routes stands). */
    const _SHINK=[
      {jp:'東海道・山陽新幹線',en:'Tokaido–Sanyo Shinkansen',head:8,st:[
        ['東京','Tokyo',139.7671,35.6812,0],['品川','Shinagawa',139.7387,35.6284,7],['新横浜','Shin-Yokohama',139.6178,35.5093,18],
        ['小田原','Odawara',139.1557,35.2565,34],['熱海','Atami',139.0776,35.1039,44],['三島','Mishima',138.9109,35.1265,52],
        ['静岡','Shizuoka',138.3890,34.9719,66],['浜松','Hamamatsu',137.7345,34.7038,88],['豊橋','Toyohashi',137.3820,34.7629,97],
        ['名古屋','Nagoya',136.8816,35.1706,100],['岐阜羽島','Gifu-Hashima',136.6856,35.3155,112],['米原','Maibara',136.2897,35.3143,124],
        ['京都','Kyoto',135.7585,34.9855,135],['新大阪','Shin-Osaka',135.5000,34.7335,150],['新神戸','Shin-Kobe',135.1950,34.7067,163],
        ['姫路','Himeji',134.6903,34.8290,180],['岡山','Okayama',133.9184,34.6669,201],['福山','Fukuyama',133.3627,34.4877,217],
        ['広島','Hiroshima',132.4753,34.3979,237],['徳山','Tokuyama',131.8065,34.0522,261],['新山口','Shin-Yamaguchi',131.3963,34.0938,273],
        ['小倉','Kokura',130.8823,33.8870,288],['博多','Hakata',130.4207,33.5902,304]]},
      {jp:'東北新幹線',en:'Tohoku Shinkansen',head:14,st:[
        ['東京','Tokyo',139.7671,35.6812,0],['上野','Ueno',139.7770,35.7138,6],['大宮','Omiya',139.6236,35.9064,25],
        ['宇都宮','Utsunomiya',139.8987,36.5594,49],['郡山','Koriyama',140.3889,37.3986,78],['福島','Fukushima',140.4590,37.7541,92],
        ['仙台','Sendai',140.8824,38.2600,112],['盛岡','Morioka',141.1367,39.7015,154],['八戸','Hachinohe',141.4883,40.5123,183],
        ['新青森','Shin-Aomori',140.6932,40.8272,209]]},
      {jp:'上越新幹線',en:'Joetsu Shinkansen',head:18,st:[
        ['東京','Tokyo',139.7671,35.6812,0],['大宮','Omiya',139.6236,35.9064,25],['高崎','Takasaki',139.0128,36.3229,50],
        ['越後湯沢','Echigo-Yuzawa',138.8087,36.9351,71],['長岡','Nagaoka',138.8513,37.4468,89],['新潟','Niigata',139.0614,37.9124,104]]},
      {jp:'北陸新幹線',en:'Hokuriku Shinkansen',head:22,st:[
        ['東京','Tokyo',139.7671,35.6812,0],['大宮','Omiya',139.6236,35.9064,25],['高崎','Takasaki',139.0128,36.3229,50],
        ['軽井沢','Karuizawa',138.6356,36.3428,66],['長野','Nagano',138.1889,36.6433,84],['富山','Toyama',137.2137,36.7008,130],
        ['金沢','Kanazawa',136.6576,36.5783,149],['福井','Fukui',136.2237,36.0621,172],['敦賀','Tsuruga',136.0553,35.6453,189]]},
      {jp:'九州新幹線',en:'Kyushu Shinkansen',head:22,st:[
        ['博多','Hakata',130.4207,33.5902,0],['熊本','Kumamoto',130.6884,32.7900,35],['鹿児島中央','Kagoshima-Chuo',130.5427,31.5838,78]]},
      {jp:'北海道新幹線',en:'Hokkaido Shinkansen',head:60,st:[
        ['新青森','Shin-Aomori',140.6932,40.8272,0],['新函館北斗','Shin-Hakodate-Hokuto',140.6488,41.9054,58]]}
    ];
    let _jrG=null;
    function _jrGraph(){ if(_jrG) return _jrG;
      const nodes=[]; const byName=new Map();
      _SHINK.forEach((Ln,li)=>{ Ln.st.forEach((s,si)=>{ const id=nodes.length; nodes.push({li,si,s,Ln});
        if(!byName.has(s[0])) byName.set(s[0],[]); byName.get(s[0]).push(id); }); });
      const adj=nodes.map(()=>[]);
      nodes.forEach((n,id)=>{ const st=n.Ln.st; if(n.si+1<st.length){ const o=id+1, dt=Math.abs(st[n.si+1][4]-n.s[4]); adj[id].push([o,dt]); adj[o].push([id,dt]); } });
      byName.forEach(ids=>{ for(let i=0;i<ids.length;i++) for(let j2=i+1;j2<ids.length;j2++){ adj[ids[i]].push([ids[j2],15]); adj[ids[j2]].push([ids[i],15]); } });
      return _jrG={nodes,adj,byName}; }
    function _jrRoute(fromName,toName){ const G=_jrGraph(); const S=G.byName.get(fromName)||[], T=new Set(G.byName.get(toName)||[]);
      if(!S.length||!T.size) return null;
      const dist=G.nodes.map(()=>Infinity), prev=G.nodes.map(()=>-1), done=G.nodes.map(()=>false);
      S.forEach(id=>{ dist[id]=0; });
      for(;;){ let u=-1,bd=Infinity; for(let i=0;i<dist.length;i++) if(!done[i]&&dist[i]<bd){ bd=dist[i]; u=i; }
        if(u<0) break; done[u]=true; if(T.has(u)) break;
        for(const [v,w] of G.adj[u]) if(!done[v]&&dist[u]+w<dist[v]){ dist[v]=dist[u]+w; prev[v]=u; } }
      let end=-1,bd=Infinity; T.forEach(id=>{ if(dist[id]<bd){ bd=dist[id]; end=id; } });
      if(end<0||!isFinite(bd)) return null;
      const path=[]; for(let u=end;u>=0;u=prev[u]) path.unshift(u);
      /* group into per-line ride segments (skip 0-length transfer hops) */
      const G2=_jrGraph(); const segs=[]; let cur=null;
      for(let i=0;i<path.length;i++){ const n=G2.nodes[path[i]];
        if(cur&&cur.li===n.li) cur.stops.push(n);
        else { if(cur&&cur.stops.length>1) segs.push(cur); cur={li:n.li,Ln:n.Ln,stops:[n]}; } }
      if(cur&&cur.stops.length>1) segs.push(cur);
      return {segs, rideMin:bd}; }
    async function _jrAccess(p,st,toStation,opts){ const d=_hav([p.lng,p.lat],[st[2],st[3]]);
      const jpn=(typeof HOST.lang!=='undefined'&&HOST.lang==='jp');
      const stName=jpn?st[0]:st[1];
      if(d<=1.2){ const sec=Math.round(d*14*60);
        return {legs:[{mode:'WALK',walk:1,route:'',headsign:'',from:toStation?'':stName,to:toStation?stName:'',duration:sec,color:_modeColor('WALK')}],
          lines:[{coords:toStation?[[p.lng,p.lat],[st[2],st[3]]]:[[st[2],st[3]],[p.lng,p.lat]],walk:1,col:_modeColor('WALK')}],stops:[],sec}; }
      try{ const A=toStation?p:{lng:st[2],lat:st[3]}, B=toStation?{lng:st[2],lat:st[3]}:p;
        const its=await _planItins(A,B,{quick:true,time:opts&&opts.time});
        if(its&&its.length){ const b=_buildItin(its[0]); return {legs:b.legs,lines:b.lines,stops:b.stops,sec:(b.duration||0),live:true}; } }catch(_){}
      /* no open timetable here (e.g. Nagoya subway) → an honest, clearly-labelled local estimate leg */
      const sec=Math.round((8+d*2.4)*60);
      const lbl=jpn?'ローカル区間（公開時刻表なし・目安）':(window.IntMapLang.t(HOST.lang,'Local segment (no open timetable, estimate)',undefined,'Lokaler Abschnitt (kein offener Fahrplan, Schätzung)','Местный участок (нет открытого расписания, оценка)','Tramo local (sin horario abierto, estimación)'));
      return {legs:[{mode:'LOCAL',walk:0,route:'',headsign:lbl,from:toStation?'':stName,to:toStation?stName:'',duration:sec,color:'#9aa0a6',est:1}],
        lines:[{coords:toStation?[[p.lng,p.lat],[st[2],st[3]]]:[[st[2],st[3]],[p.lng,p.lat]],walk:1,col:'#9aa0a6'}],stops:[],sec,est:true}; }
    async function _jrPlan(from,to,opts){
      const inJP=p=>p&&isFinite(+p.lng)&&p.lng>=127&&p.lng<=146.5&&p.lat>=30&&p.lat<=46;
      if(!inJP(from)||!inJP(to)) return null;
      const gc=_hav([from.lng,from.lat],[to.lng,to.lat]); if(gc<70) return null;
      const near=p=>{ let b=null,bd=Infinity; _SHINK.forEach(Ln=>Ln.st.forEach(s=>{ const d=_hav([p.lng,p.lat],[s[2],s[3]]); if(d<bd){ bd=d; b={s,d}; } })); return (b&&b.d<=130)?b:null; };
      const A=near(from), B=near(to); if(!A||!B||A.s[0]===B.s[0]) return null;
      const jr=_jrRoute(A.s[0],B.s[0]); if(!jr||!jr.segs.length) return null;
      const jpn=(typeof HOST.lang!=='undefined'&&HOST.lang==='jp');
      const [acc,egr]=await Promise.all([_jrAccess(from,A.s,true,opts),_jrAccess(to,B.s,false,opts)]);
      const legs=[],lines=[],stops=[]; let waitMin=0;
      legs.push.apply(legs,acc.legs); lines.push.apply(lines,acc.lines); stops.push.apply(stops,acc.stops);
      jr.segs.forEach(seg=>{ const st0=seg.stops[0].s, st1=seg.stops[seg.stops.length-1].s;
        const min=Math.abs(st1[4]-st0[4]); waitMin+=seg.Ln.head/2;
        legs.push({mode:'HIGHSPEED_RAIL',walk:0,route:jpn?seg.Ln.jp:seg.Ln.en,headsign:jpn?st1[0]:st1[1],from:jpn?st0[0]:st0[1],to:jpn?st1[0]:st1[1],duration:min*60,color:_modeColor('HIGHSPEED')});
        lines.push({coords:seg.stops.map(n=>[n.s[2],n.s[3]]),walk:0,col:_modeColor('HIGHSPEED')});
        seg.stops.forEach(n=>stops.push([n.s[2],n.s[3]])); });
      legs.push.apply(legs,egr.legs); lines.push.apply(lines,egr.lines); stops.push.apply(stops,egr.stops);
      const durSec=acc.sec+egr.sec+(jr.rideMin+waitMin)*60;
      const transfers=Math.max(0,legs.filter(l=>!l.walk).length-1);
      if(opts&&opts._rid&&opts._rid!==_reqSeq) return {ok:false,status:'cancelled'};   /* stale — do not draw */
      const itin={lines,stops,legs,duration:durSec,transfers,startTime:null,endTime:null,color:ALT_PAL[0],jrEstimate:true};
      const setId=_rsNew([itin],[[+from.lng,+from.lat],[+to.lng,+to.lat]]); _drawAlts(0,setId);
      return {ok:true,status:'success',transit:true,jrEstimate:true,routeSetId:setId,duration:durSec,transfers,legs,startTime:null,endTime:null,mode:'transit',sel:0,
        alternatives:[{duration:durSec,transfers,legs,startTime:null,endTime:null,color:itin.color}]}; }
    async function transit(from,to,opts){ opts=opts||{};
      const its=await _planItins(from,to,opts);
      if(!its||!its.length){ /* (#R122) OSM rail-corridor fallback stays DISABLED (freight/non-passenger nonsense).
           (#R125) but intercity JAPAN gets the curated Shinkansen bridge above — real stations, published-timetable
           estimates — before we give up with an honest "no transit". */
        const fail=_planItins._fail||'no_transit';
        if(fail==='no_transit'){ try{ const jr=await _jrPlan(from,to,opts); if(jr) return jr; }catch(_){} }
        /* (#R126) §2.5: provider outage/timeout/429 is NOT the same answer as "no transit here" */
        return {ok:false,reason:'no-transit',status:fail}; }
      if(opts._rid&&opts._rid!==_reqSeq) return {ok:false,status:'cancelled'};   /* stale — a newer request superseded us; do not draw */
      return _transitBuild(its,from,to); }
    function _buildItin(it){ const P=_P; const legOut=[], lines=[], stops=[];
        (it.legs||[]).forEach(l=>{ const col=_modeColor(l.mode), walk=/WALK|FOOT/i.test(l.mode)?1:0;
          let coords=null; try{ if(l.legGeometry&&l.legGeometry.points) coords=_decodePoly(l.legGeometry.points,l.legGeometry.precision||7); }catch(_){}
          /* (#R103) FIX "経路がアメリカ沖の大西洋に描画される": a CORS-proxied MOTIS response can mangle the encoded
             polyline → _decodePoly yields garbage coords (near 0,0 / wrong hemisphere). Validate the decoded geometry
             against the leg's OWN endpoints (which come as plain lat/lon, not encoded) and DISCARD it if any point is
             absurdly far (>3°) — then the straight-line from/to fallback below draws a sane leg instead. */
          if(coords&&coords.length&&l.from&&l.to&&l.from.lat!=null&&l.to.lat!=null){ const a=P(l.from),b=P(l.to);
            if(isFinite(a.lng)&&isFinite(b.lng)){ const lo=Math.min(a.lng,b.lng)-3,hi=Math.max(a.lng,b.lng)+3,slo=Math.min(a.lat,b.lat)-3,shi=Math.max(a.lat,b.lat)+3;
              if(coords.some(c=>!(isFinite(c[0])&&isFinite(c[1])&&c[0]>=lo&&c[0]<=hi&&c[1]>=slo&&c[1]<=shi))) coords=null; } }
          /* (#R126) 経路10-10 §3.8/§22.3/§24.4: a broken/absent TRANSIT leg shape is NEVER replaced by a station-to-
             station straight line dressed up as the route. Only a WALK leg may fall back to a short straight dashed
             connector (its two endpoints are real and it is drawn in the walk style). A ride leg with no usable
             geometry contributes NO line — the leg stays in the itinerary list and the result is flagged shapeGap. */
          let gap=false;
          if((!coords||coords.length<2)&&l.from&&l.to&&l.from.lat!=null&&l.to.lat!=null){
            const a=P(l.from),b=P(l.to);
            if(isFinite(a.lng)&&isFinite(b.lng)){ if(walk) coords=[[a.lng,a.lat],[b.lng,b.lat]]; else gap=true; } }
          if(coords&&coords.length>1) lines.push({coords:coords,walk:walk,col:col});   /* (#R86d) keep the per-leg MODE colour on the geometry so the map can colour each leg by type (walk/subway/rail/bus/…) — not just one colour per alternative */
          if(gap) legOut._gap=true;
          if(!walk){ if(l.from&&l.from.lat!=null){ const a=P(l.from); if(isFinite(a.lng)) stops.push([a.lng,a.lat]); }
            if(l.to&&l.to.lat!=null){ const b=P(l.to); if(isFinite(b.lng)) stops.push([b.lng,b.lat]); } }
          /* (#R132) 経路10-10 §2.4/§9.6: MOTIS marks each leg realTime true/false and carries scheduledStartTime.
             Surface whether a leg's time is LIVE (real-time) or timetable-based, and any delay (actual − scheduled),
             so the reply can say "real-time" only when it truly is — never dress a static timetable as live. */
          const rt=(l.realTime===true); let delay=0;
          try{ if(rt&&l.startTime&&l.scheduledStartTime){ delay=Math.round((new Date(l.startTime).getTime()-new Date(l.scheduledStartTime).getTime())/60000); if(!isFinite(delay)) delay=0; } }catch(_){ delay=0; }
          legOut.push({mode:l.mode,walk,route:(l.routeShortName||l.tripShortName||l.routeLongName||l.route||''),headsign:(l.headsign||l.tripHeadsign||''),from:(l.from&&l.from.name)||'',to:(l.to&&l.to.name)||'',duration:l.duration||0,dep:l.startTime||l.scheduledStartTime||'',arr:l.endTime||l.scheduledEndTime||'',color:col,rt:rt,delay:delay}); });
        const anyRt=legOut.some(l=>!l.walk&&l.rt);
        return {lines:lines,stops:stops,legs:legOut,shapeGap:!!legOut._gap,realtime:anyRt,duration:it.duration||0,transfers:(it.transfers!=null?it.transfers:Math.max(0,legOut.filter(l=>!l.walk).length-1)),startTime:it.startTime,endTime:it.endTime}; }
    function _transitBuild(its,from,to){
      /* rank: itineraries that actually ride something first (a bare all-walk plan is unhelpful), then by duration; keep up to 5 */
      const ranked=its.slice().sort((x,y)=>{ const rx=(x.legs||[]).some(l=>!/WALK|FOOT/i.test(l.mode))?0:1, ry=(y.legs||[]).some(l=>!/WALK|FOOT/i.test(l.mode))?0:1; return (rx-ry)||((x.duration||1e9)-(y.duration||1e9)); });
      const alts=ranked.slice(0,5).map(_buildItin); if(!alts.length) return {ok:false,reason:'no-transit',status:'no_transit'};
      alts.forEach((a,i)=>{ a.color=ALT_PAL[i%ALT_PAL.length]; });
      const setId=_rsNew(alts,[[+from.lng,+from.lat],[+to.lng,+to.lat]]);
      _drawAlts(0,setId);
      const b0=alts[0];
      return {ok:true,status:'success',transit:true,routeSetId:setId,duration:b0.duration,transfers:b0.transfers,legs:b0.legs,shapeGap:alts.some(a=>a.shapeGap),realtime:alts.some(a=>a.realtime),startTime:b0.startTime,endTime:b0.endTime,mode:'transit',sel:0,
        alternatives:alts.map(a=>({duration:a.duration,transfers:a.transfers,legs:a.legs,realtime:a.realtime,startTime:a.startTime,endTime:a.endTime,color:a.color}))}; }
    /* (#R126) 経路10-10 §3.1–§3.5/§17/§24: road routing goes DIRECT to the router (no public CORS proxy — §24.1),
       carries a requestId so stale responses never draw (§24.12), separates calculation from drawing (§24.2 — a
       route computed while the style is loading still succeeds; _paint repaints on styledata), and returns a TYPED
       status (§5.7) instead of one generic failure: success / invalid_request / no_route / provider_timeout /
       provider_unavailable / rate_limited / cancelled. */
    async function route(from,to,opts){ opts=opts||{};
      if(!from||to==null||!isFinite(+from.lng)||!isFinite(+from.lat)||!isFinite(+to.lng)||!isFinite(+to.lat)) return {ok:false,status:'invalid_request'};
      const rid=++_reqSeq; _abortInflight(); opts._rid=rid;
      const mode=String(opts.mode||'driving').toLowerCase();
      if(_isTransit(mode)) return await transit(from,to,opts);
      /* (#R132) §7.3/§4.7: an AVOID request (driving) goes to Valhalla, which actually honours it. If Valhalla is
         unreachable, fall through to OSRM without the avoid and flag it so the reply is honest (avoid not applied). */
      if(opts.avoid&&opts.avoid.length&&/driv|car|auto/.test(mode)){ const vr=await _roadValhalla(from,to,opts);
        if(vr&&(vr.ok||vr.status==='cancelled')) return vr; opts._avoidDropped=true; }
      /* (#R184) …and a DRAWN AREA to keep out of goes the same way, for every road mode. OSRM cannot
         express it at all, so this is provider selection by capability rather than by preference: if
         Valhalla is unreachable we fall through to OSRM WITHOUT the area and flag it, because a route
         that quietly ignores the box the user drew is worse than one that says it could not. */
      if(Array.isArray(opts.avoidAreas)&&opts.avoidAreas.length&&!_isTransit(mode)){
        const vr=await _roadValhalla(from,to,opts);
        if(vr&&(vr.ok||vr.status==='cancelled')) return vr; opts._avoidDropped=true; }
      const prof=PROFILES[mode]||PROFILES.driving;
      const via=Array.isArray(opts.via)?opts.via:[];
      const pts=[from].concat(via).concat([to]);
      const coordStr=pts.map(p=>(+p.lng).toFixed(6)+','+(+p.lat).toFixed(6)).join(';');
      /* (#R132) §3.3/§7.1/§10: ask OSRM for up to 3 ALTERNATIVES (only for a plain A→B — the demo returns none when
         there are via points). */
      const url='https://'+prof[0]+'/route/v1/'+prof[1]+'/'+coordStr+'?overview=full&geometries=geojson&steps=true'+(via.length?'':'&alternatives=3');
      let j=null, errKind='provider_unavailable';
      for(let att=0;att<2&&!j;att++){
        if(rid!==_reqSeq) return {ok:false,status:'cancelled'};
        const ac=_mkAC(20000);
        try{ const r=await fetch(url,{signal:ac.signal});
          if(r.status===429){ errKind='rate_limited'; }
          else if(r.ok){ const jj=await r.json();
            if(jj&&jj.routes&&jj.routes.length) j=jj;
            else return {ok:false,status:'no_route'}; }   /* router answered: there IS no route */
          else if(r.status>=400&&r.status<500){ const jj=await r.json().catch(()=>null);
            if(jj&&/NoRoute|NoSegment|NoMatch/i.test(String(jj.code||''))) return {ok:false,status:'no_route'};
            errKind='invalid_request'; }
          else errKind='provider_unavailable'; }
        catch(e){ errKind=(e&&e.name==='AbortError')?((rid!==_reqSeq)?'cancelled':'provider_timeout'):'provider_unavailable'; }
        finally{ _rmAC(ac); }
        if(!j&&att===0&&errKind!=='rate_limited'&&errKind!=='cancelled') await new Promise(r2=>setTimeout(r2,600)); }
      if(rid!==_reqSeq) return {ok:false,status:'cancelled'};
      if(!j) return {ok:false,status:errKind};
      /* (#R126) 経路10-10 §21.3/§2.2: the demo router SNAPS a point outside its road data to the nearest road it
         knows — even 5,500 km away across the Atlantic — and answers "Ok" (measured: Lisbon→New York snapped NY to
         Cascais, Portugal). A snap that far is a FAKE route; report no_route with the snap distance instead. */
      const _farM=(j.waypoints||[]).reduce((mx,w)=>Math.max(mx,(w&&w.distance)||0),0);
      if(_farM>30000) return {ok:false,status:'no_route',snapKm:Math.round(_farM/1000)};
      const rcol=(mode==='foot'||mode==='walk'||mode==='walking')?'#7a7f87':(mode==='bike'||mode==='cycle'||mode==='cycling')?'#00897b':'#1a73e8';
      const rwalk=(mode==='foot'||mode==='walk'||mode==='walking')?1:0;
      /* (#R132) build every returned route into a RouteStore alternative (unified with transit — §10.1). Each carries
         its full geometry + steps (with per-step geometry indices for §12.5 step→map), a palette colour and a
         differentiator label; near-identical alternatives are collapsed and the set is ranked fastest-first. */
      let alts=j.routes.slice(0,3).map((rt,i)=>{ const steps=[]; (rt.legs||[]).forEach(l=>(l.steps||[]).forEach(s=>steps.push(s)));
        const coords=(rt.geometry&&rt.geometry.coordinates)||[];
        return {lines:[{coords:coords,walk:rwalk,col:rcol}],stops:[],geometry:rt.geometry,coords:coords,steps:steps,
          /* (#R184) the per-LEG durations — one leg per via-point section. This is what "arrival time
             at each point on the way" is made of, and it is only available here: the total duration
             cannot be split back into legs after the fact. */
          legDurations:(rt.legs||[]).map(l=>l.duration||0),
          duration:rt.duration,distance:rt.distance,color:ALT_PAL[i%ALT_PAL.length]}; });
      alts=_roadDedup(alts); alts.sort((a,b)=>(a.duration||0)-(b.duration||0));
      alts.forEach((a,i)=>{ a.color=ALT_PAL[i%ALT_PAL.length]; }); _labelRoad(alts,opts.avoid);
      const setId=_rsNew(alts,[[+from.lng,+from.lat],[+to.lng,+to.lat]]); _drawAlts(0,setId);
      const b0=alts[0];
      return {ok:true,status:'success',road:true,routeSetId:setId,sel:0,mode,avoid:opts.avoid||null,avoidDropped:!!opts._avoidDropped,
        distance:b0.distance,duration:b0.duration,steps:b0.steps,coords:b0.coords,legDurations:b0.legDurations,
        alternatives:alts.map(a=>({duration:a.duration,distance:a.distance,steps:a.steps,label:a.label,color:a.color,coords:a.coords,legDurations:a.legDurations}))}; }
    /* (#R126) §3.7: restore from the module's OWN last-paint store on style swap — not MapLibre's private source._data */
    try{ GE().events.on('styledata',()=>{ setTimeout(()=>{ try{ if(_lastPaint&&_lastPaint.feats&&_lastPaint.feats.length) _paint(_lastPaint.feats,_lastPaint.fit,_lastPaint.mz); }catch(_){} },160); }); }catch(_){}
    /* ===== (#R84) RICH ROUTING UI ("経路のUIをもっと充実させて。Google MapやApple Mapのように") — a proper
       directions panel: editable start/destination, one-tap mode switch (drive/walk/cycle), swap, live recompute,
       distance + time, and a scrollable turn-by-turn list. ===== */
    const LL=window.IntMapLang.pick(()=>HOST.lang);
    const escp=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    /* (#R126) 経路10-10 §6.3/§6.4: SAME-NAME disambiguation — fetch several candidates and prefer the one near the
       current map view (then the most populous), instead of blindly taking hit #1 ("Potsdam" from a Germany view
       geocoded to Potsdam NY, USA). refLL (optional) = the point to bias toward (map centre / other endpoint). */
    function _mapCtr(){ try{ const c=GE().camera.getCenter(); return [c.lng,c.lat]; }catch(_){ return null; } }
    function _pickNear(cands,refLL){ if(!cands.length) return null; const ref=refLL||_mapCtr(); if(!ref) return cands[0];
      const scored=cands.map(c=>({c,d:_hav(ref,[c.lng,c.lat])}));
      const near=scored.filter(s=>s.d<=300).sort((a,b)=>a.d-b.d);
      if(near.length) return near[0].c;
      scored.sort((a,b)=>((b.c.pop||0)-(a.c.pop||0))||(a.d-b.d)); return scored[0].c; }
    async function geo1(q,refLL){ q=String(q||'').trim(); if(!q) return null;
      const m=q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/); if(m) return {lng:+m[2],lat:+m[1],name:(+m[1]).toFixed(3)+', '+(+m[2]).toFixed(3)};
      try{ const st=stationLL(q); if(st) return st; }catch(_){}
      try{ const r=await fetch('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(q)+'&count=5&language='+(window.IntMapLang.locale(HOST.lang,"en"))); const j=await r.json();
        const cs=(j&&j.results||[]).map(g=>({lng:+g.longitude,lat:+g.latitude,pop:+g.population||0,name:g.name+(g.admin1?(', '+g.admin1):'')+(g.country?(', '+g.country):'')}));
        const b=_pickNear(cs,refLL); if(b) return b; }catch(_){}
      try{ const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&q='+encodeURIComponent(q)); const j=await r.json();
        const cs=(j||[]).map(x=>({lng:+x.lon,lat:+x.lat,pop:+x.importance*1e6||0,name:(x.display_name||q).split(',').slice(0,2).join(', ')}));
        const b=_pickNear(cs,refLL); if(b) return b; }catch(_){}
      return null; }
    let panel=null,pFrom=null,pTo=null,pMode='driving',pickTarget=null,pickHandler=null; const pAvoid=new Set();   /* (#R132) §7.3 avoid set */
    /* (#R184) via points, drawn keep-out areas, and the transit mode allow-list. `pVia` holds the
       RESOLVED places (or null while a field is being typed), which is why it is parallel to pFrom /
       pTo rather than being read out of the DOM — the same rule #R126 established for the endpoints. */
    let pVia=[], pAreas=[], pAreaDraw=null, pTModes=null, pMaxWalk=null, pLastResult=null, opsBusy='';
    /* (#R132) 経路10-10 §12: proper turn-by-turn — interpret the FULL OSRM maneuver vocabulary (turn / merge / on-ramp
       / off-ramp / fork / end-of-road / roundabout+exit-number / U-turn / arrive-side), plus road ref, signposted
       destinations (方面), motorway exit numbers, and lane guidance (▮ valid / ▯ not) — not just "arrow + road name".
       Natural 5-language phrasing. Returns {icon,text,lane}. */
    function _ord(n){ n=+n||0; if(HOST.lang==='jp') return n+'番目の'; if(HOST.lang==='de') return n+'.'; if(HOST.lang==='es') return n+'ª'; if(HOST.lang==='ru') return n+'-й'; const s=['th','st','nd','rd'],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }
    function _maneuver(s){ const m=s.maneuver||{}, type=String(m.type||''), mod=String(m.modifier||'');
      const nm=String(s.name||'').trim(), ref=String(s.ref||'').trim(), dest=String(s.destinations||'').trim(), exits=String(s.exits||'').trim();
      const road=(ref&&nm)?(nm+' ('+ref+')'):(nm||ref||'');
      const ARW={left:'←','slight left':'↖','sharp left':'⬅',right:'→','slight right':'↗','sharp right':'➡',straight:'↑',uturn:'↩'};
      const TURN={ 'left':LL('Turn left','左折','Links abbiegen','Поверните налево','Gira a la izquierda'),'right':LL('Turn right','右折','Rechts abbiegen','Поверните направо','Gira a la derecha'),
        'slight left':LL('Bear slightly left','斜め左へ','Leicht links halten','Держитесь левее','Ligeramente a la izquierda'),'slight right':LL('Bear slightly right','斜め右へ','Leicht rechts halten','Держитесь правее','Ligeramente a la derecha'),
        'sharp left':LL('Turn sharply left','鋭く左折','Scharf links','Резко налево','Giro cerrado izq.'),'sharp right':LL('Turn sharply right','鋭く右折','Scharf rechts','Резко направо','Giro cerrado der.'),
        'straight':LL('Continue straight','直進','Geradeaus','Прямо','Recto'),'uturn':LL('Make a U-turn','Uターン','Wenden','Развернитесь','Cambio de sentido') };
      const onto=road?(LL(' onto ',' → ',' auf ',' на ',' hacia ')+road):'';
      let icon=ARW[mod]||'↑', text='';
      switch(type){
        case 'depart': icon='🚩'; text=LL('Start','出発','Start','Старт','Salida')+(road?(' · '+road):''); break;
        case 'arrive': icon='🏁'; text=LL('Arrive at destination','目的地に到着','Ziel erreicht','Прибытие','Llegar al destino')+(mod==='left'?(' — '+LL('on your left','左側','links','слева','a la izquierda')):mod==='right'?(' — '+LL('on your right','右側','rechts','справа','a la derecha')):''); break;
        case 'roundabout': case 'rotary': { icon='◯'; const ex=m.exit?_ord(m.exit):''; text=LL('At the roundabout take the ','ラウンドアバウトで','Im Kreisverkehr die ','На кольце ','En la rotonda toma la ')+(ex?ex+' ':'')+LL('exit','出口','Ausfahrt','съезд','salida')+onto; break; }
        case 'roundabout turn': case 'exit roundabout': case 'exit rotary': icon='◯'; text=(TURN[mod]||LL('Continue','道なり','weiter','далее','continúa'))+onto; break;
        case 'merge': icon='⇱'; text=LL('Merge','合流','Einfädeln','Перестроение','Incorpórate')+(TURN[mod]&&mod!=='straight'?(' ('+TURN[mod]+')'):'')+onto; break;
        case 'on ramp': icon='⇗'; text=LL('Take the on-ramp','入口ランプへ','Auffahrt nehmen','На въезд','Toma la rampa de acceso')+onto; break;
        case 'off ramp': icon='⇘'; text=LL('Take the exit ramp','出口ランプへ','Ausfahrt nehmen','Съезд','Toma la salida')+(exits?(' '+exits):'')+onto; break;
        case 'fork': icon=(mod.indexOf('left')>=0)?'↖':(mod.indexOf('right')>=0)?'↗':'↑'; text=LL('Keep ','分岐を','Halte dich ','На развилке держитесь ','En la bifurcación mantente ')+(mod?(TURN[mod]||mod).toLowerCase().replace(/^(turn |bear |continue )/,''):LL('straight','直進','geradeaus','прямо','recto'))+onto; break;
        case 'end of road': icon=ARW[mod]||'↑'; text=LL('At the end of the road, ','突き当りを','Am Straßenende ','В конце дороги ','Al final de la vía ')+((TURN[mod]||'').toLowerCase()||LL('turn','曲がる','abbiegen','поверните','gira'))+onto; break;
        case 'new name': icon=ARW[mod]||'↑'; text=(mod&&mod!=='straight')?((TURN[mod]||'')+onto):(LL('Continue','道なりに進む','Weiter','Продолжайте','Continúa')+(road?(' · '+road):'')); break;
        case 'notification': case 'continue': icon=ARW[mod]||'↑'; text=(mod&&mod!=='straight'&&mod!=='uturn')?((TURN[mod]||'')+onto):(LL('Continue','道なりに進む','Weiter','Продолжайте','Continúa')+(road?(' · '+road):'')); break;
        default: icon=ARW[mod]||'↑'; text=(TURN[mod]||(road?(LL('Continue on ','道なり: ','Weiter auf ','Продолжайте по ','Continúa por ')+road):LL('Continue','道なり','weiter','далее','continuar')))+(mod&&road?onto:''); break;
      }
      if(dest) text+=' · '+LL('toward ','方面: ','Ri. ','в сторону ','hacia ')+dest.replace(/[;,]+/g,' / ').replace(/:/g,' ');
      if(exits&&type!=='off ramp') text+=' · '+LL('exit ','出口 ','Ausf. ','съезд ','salida ')+exits;
      let lane=''; try{ const li=(s.intersections||[]).find(it=>it.lanes&&it.lanes.length); if(li) lane=li.lanes.map(l=>l.valid?'▮':'▯').join(''); }catch(_){}
      return {icon,text,lane}; }
    function stepRows(steps,mode){
      return (steps||[]).map((s,i)=>{ const dm=s.distance||0; const mv=_maneuver(s);
        const dist=dm>=1000?((dm/1000).toFixed(1)+' km'):(Math.round(dm)+' m');
        const lane=mv.lane?('<span style="letter-spacing:1px;color:var(--primary-color);font-size:11px;margin-left:6px;">'+mv.lane+'</span>'):'';
        return '<div class="rp-step" data-si="'+i+'" style="display:flex;gap:9px;align-items:baseline;padding:6px 2px;border-top:1px solid rgba(128,128,128,0.12);cursor:pointer;"><span style="flex:0 0 auto;width:18px;text-align:center;">'+mv.icon+'</span><span style="flex:1;min-width:0;font-size:12px;">'+escp(mv.text)+lane+'</span><span style="flex:0 0 auto;color:var(--text-muted);font-size:10.5px;">'+dist+'</span></div>'; }).join(''); }
    function ensurePanel(){ if(panel) return panel;
      panel=document.createElement('div'); panel.id='route-panel';
      panel.style.cssText='position:fixed;left:16px;top:78px;width:min(346px,92vw);max-height:76vh;z-index:1401;display:none;flex-direction:column;background:var(--popup-bg,#141414);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
      const inCss='flex:1;min-width:0;height:34px;padding:0 10px;border-radius:9px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12.5px;outline:none;box-sizing:border-box;';
      const mBtn='flex:1;height:32px;border:none;background:transparent;color:var(--text-muted);font-size:15px;cursor:pointer;border-radius:8px;';
      panel.innerHTML='<div class="rp-head" style="flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:8px 11px;background:var(--input-bg);cursor:move;"><span style="flex:1;font-size:13px;font-weight:600;color:var(--text-main);">🧭 '+LL('Directions','経路案内','Route','Маршрут','Cómo llegar')+'</span><button class="rp-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>'
        +'<div style="flex:0 0 auto;padding:10px 12px 6px;display:flex;flex-direction:column;gap:7px;">'
          +'<div style="display:flex;align-items:center;gap:8px;"><span style="flex:0 0 auto;">🟢</span><input class="rp-from" placeholder="'+escp(LL('Choose start (or click the map)','出発地（または地図をクリック）','Start (oder Karte anklicken)','Начало (или клик по карте)','Origen (o clic en el mapa)'))+'" style="'+inCss+'"><button class="rp-pick-from" title="'+LL('Pick on map','地図で選ぶ','Auf Karte wählen','Выбрать на карте','Elegir en el mapa')+'" style="flex:0 0 auto;width:30px;height:30px;border:none;background:var(--input-bg);border-radius:8px;color:var(--text-muted);cursor:pointer;">◎</button></div>'
          /* (#R184) 「任意の経由地点追加」 — the via points. opts.via has been honoured by both routers
             since #R132; what was missing was any way for a person to say so. Rendered between the
             two endpoints because that is where they are in the journey. */
          +'<div class="rp-vias" style="display:flex;flex-direction:column;gap:6px;"></div>'
          +'<button class="rp-addvia" style="align-self:flex-start;height:26px;padding:0 9px;border:1px dashed var(--glass-border,rgba(128,128,128,0.35));background:transparent;color:var(--text-muted);border-radius:13px;cursor:pointer;font-size:11px;">＋ '+escp(LL('Add a stop','経由地を追加','Zwischenziel','Промежуточная точка','Añadir parada'))+'</button>'
          +'<div style="display:flex;align-items:center;gap:8px;"><span style="flex:0 0 auto;">🔴</span><input class="rp-to" placeholder="'+escp(LL('Choose destination','目的地','Ziel','Пункт назначения','Destino'))+'" style="'+inCss+'"><button class="rp-pick-to" title="'+LL('Pick on map','地図で選ぶ','Auf Karte wählen','Выбрать на карте','Elegir en el mapa')+'" style="flex:0 0 auto;width:30px;height:30px;border:none;background:var(--input-bg);border-radius:8px;color:var(--text-muted);cursor:pointer;">◎</button></div>'
          +'<div style="display:flex;gap:8px;align-items:center;"><div class="rp-modes" style="flex:1;display:flex;gap:3px;background:var(--input-bg);border-radius:9px;padding:3px;">'
            +'<button data-m="driving" class="rp-mode" title="'+LL('Drive','車','Auto','Авто','Coche')+'" style="'+mBtn+'">🚗</button><button data-m="transit" class="rp-mode" title="'+LL('Transit','公共交通','ÖPNV','Транспорт','Transporte')+'" style="'+mBtn+'">🚆</button><button data-m="walking" class="rp-mode" title="'+LL('Walk','徒歩','Zu Fuß','Пешком','A pie')+'" style="'+mBtn+'">🚶</button><button data-m="cycling" class="rp-mode" title="'+LL('Cycle','自転車','Rad','Вело','Bici')+'" style="'+mBtn+'">🚲</button></div>'
            +'<button class="rp-swap" title="'+LL('Swap','入替','Tauschen','Поменять','Intercambiar')+'" style="flex:0 0 auto;width:34px;height:34px;border:none;background:var(--input-bg);border-radius:9px;color:var(--text-main);font-size:15px;cursor:pointer;">⇅</button></div>'
          +'<div style="display:flex;gap:8px;align-items:center;">'
            +'<select class="rp-when" style="flex:0 0 auto;height:30px;padding:0 6px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:11.5px;outline:none;">'
              +'<option value="now">'+escp(LL('Leave now','今すぐ出発','Jetzt losfahren','Отправление сейчас','Salir ahora'))+'</option>'
              +'<option value="depart">'+escp(LL('Depart at','出発時刻を指定','Abfahrt um','Отправление в','Salir a las'))+'</option>'
              +'<option value="arrive">'+escp(LL('Arrive by','到着時刻を指定','Ankunft bis','Прибытие к','Llegar antes de'))+'</option></select>'
            +'<input type="datetime-local" class="rp-time" style="flex:1;min-width:0;height:30px;padding:0 6px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:11.5px;outline:none;display:none;box-sizing:border-box;"></div>'
          /* (#R132) 経路10-10 §7.3: avoid toll / highway / ferry (OSRM exclude=, driving profile). Shown only for driving. */
          +'<div class="rp-avoid" style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">'
            +'<span style="font-size:10.5px;color:var(--text-muted);">'+escp(LL('Avoid:','回避:','Meiden:','Избегать:','Evitar:'))+'</span>'
            +['toll','motorway','ferry'].map(k=>'<button class="rp-av" data-av="'+k+'" style="height:26px;padding:0 8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:transparent;color:var(--text-muted);border-radius:13px;cursor:pointer;font-size:11px;">'+escp({toll:LL('Tolls','有料道路','Maut','Платные','Peajes'),motorway:LL('Highways','高速道路','Autobahn','Магистрали','Autopistas'),ferry:LL('Ferries','フェリー','Fähren','Паромы','Ferris')}[k])+'</button>').join('')
            /* (#R184) 「通過禁止範囲を地図で描画」 — a drawn box the route may not enter. Road modes only:
               Valhalla's exclude_polygons has no transit equivalent, and offering it there would be a
               button that silently does nothing. */
            +'<button class="rp-area" style="height:26px;padding:0 8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:transparent;color:var(--text-muted);border-radius:13px;cursor:pointer;font-size:11px;">▧ '+escp(LL('Draw an area','範囲を描く','Fläche zeichnen','Нарисовать зону','Dibujar zona'))+'</button>'
            +'<span class="rp-arean" style="font-size:10.5px;color:var(--text-muted);"></span></div>'
          /* (#R184) 「フェリー、鉄道、徒歩区間の個別除外」 — transit only. MOTIS takes an ALLOW-list of
             transit modes, so a chip that is off simply leaves its mode out of the list. */
          +'<div class="rp-tmodes" style="display:none;gap:5px;align-items:center;flex-wrap:wrap;">'
            +'<span style="font-size:10.5px;color:var(--text-muted);">'+escp(LL('Use:','利用:','Nutzen:','Использовать:','Usar:'))+'</span>'
            +[['RAIL',LL('Rail','鉄道','Bahn','Ж/д','Tren')],['SUBWAY',LL('Subway','地下鉄','U-Bahn','Метро','Metro')],['TRAM',LL('Tram','路面電車','Tram','Трамвай','Tranvía')],['BUS',LL('Bus','バス','Bus','Автобус','Autobús')],['FERRY',LL('Ferry','フェリー','Fähre','Паром','Ferri')]]
              .map(([k,lb])=>'<button class="rp-tm" data-tm="'+k+'" style="height:26px;padding:0 8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:transparent;color:var(--text-muted);border-radius:13px;cursor:pointer;font-size:11px;">'+escp(lb)+'</button>').join('')
            +'<label style="display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--text-muted);">'+escp(LL('Max walk','徒歩上限','Max. Fußweg','Макс. пешком','Máx. a pie'))
              +'<input type="number" class="rp-maxwalk" min="0" max="5000" step="100" placeholder="—" style="width:64px;height:24px;padding:0 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:11px;"> m</label></div>'
        +'</div>'
        +'<div class="rp-summary" style="flex:0 0 auto;padding:2px 12px;font-size:13px;color:var(--text-main);"></div>'
        +'<div class="rp-export" style="flex:0 0 auto;display:none;gap:6px;align-items:center;padding:2px 12px 4px;">'
          +'<span style="font-size:10.5px;color:var(--text-muted);">'+escp(LL('Export:','エクスポート:','Export:','Экспорт:','Exportar:'))+'</span>'
          +'<button class="rp-exp" data-f="gpx" style="height:26px;padding:0 10px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:transparent;color:var(--text-muted);border-radius:13px;cursor:pointer;font-size:11px;">GPX</button>'
          +'<button class="rp-exp" data-f="geojson" style="height:26px;padding:0 10px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:transparent;color:var(--text-muted);border-radius:13px;cursor:pointer;font-size:11px;">GeoJSON</button></div>'
        /* (#R184) the analyses of a route that already exists — elevation, borders, conditions along
           the way, the schedule, where the alternatives differ, and the historical network. Each is a
           button rather than automatic: they cost DEM tiles, weather requests and an Overpass query,
           and running all of them on every keystroke would be the opposite of helpful. */
        +'<div class="rp-ops" style="flex:0 0 auto;display:none;flex-direction:column;gap:5px;padding:4px 12px 6px;">'
          +'<div style="display:flex;gap:5px;flex-wrap:wrap;">'
            +[['elev','⛰ '+LL('Elevation','標高差','Höhe','Высоты','Desnivel')],
              ['borders','🛂 '+LL('Borders','国境','Grenzen','Границы','Fronteras')],
              ['along','🌦 '+LL('Along the way','沿道の状況','Unterwegs','По пути','Por el camino')],
              ['times','🕒 '+LL('Arrival times','到着時刻','Ankunftszeiten','Время прибытия','Horas de llegada')],
              ['diff','⇄ '+LL('Differences','経路の差','Unterschiede','Различия','Diferencias')]]
              .map(([k,lb])=>'<button class="rp-op" data-op="'+k+'" style="height:26px;padding:0 9px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:transparent;color:var(--text-muted);border-radius:13px;cursor:pointer;font-size:11px;">'+escp(lb)+'</button>').join('')
          +'</div>'
          +'<div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">'
            +'<span style="font-size:10.5px;color:var(--text-muted);">'+escp(LL('Historical network:','過去の路線網:','Historisches Netz:','Историческая сеть:','Red histórica:'))+'</span>'
            +'<input type="number" class="rp-hyear" value="1900" min="1800" max="2025" step="1" style="width:66px;height:24px;padding:0 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:11px;">'
            +'<select class="rp-hkind" style="height:24px;padding:0 4px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:11px;"><option value="rail">'+escp(LL('Railways','鉄道','Bahn','Ж/д','Ferrocarril'))+'</option><option value="road">'+escp(LL('Roads','道路','Straßen','Дороги','Carreteras'))+'</option></select>'
            +'<button class="rp-op" data-op="hist" style="height:24px;padding:0 9px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:transparent;color:var(--text-muted);border-radius:12px;cursor:pointer;font-size:11px;">'+escp(LL('Route on it','この年で計算','Berechnen','Проложить','Calcular'))+'</button>'
          +'</div>'
          +'<div class="rp-opout" style="font-size:11px;color:var(--text-main);line-height:1.5;"></div>'
        +'</div>'
        +'<div class="rp-steps" style="flex:1 1 auto;overflow-y:auto;padding:2px 12px 12px;"></div>';
      document.body.appendChild(panel);
      panel.querySelector('.rp-close').onclick=()=>{ panel.style.display='none'; try{ clear(); }catch(_){} _endPick(); };
      panel.querySelectorAll('.rp-mode').forEach(b=>b.onclick=()=>{ pMode=b.getAttribute('data-m'); _syncModes(); recompute(); });
      panel.querySelector('.rp-swap').onclick=()=>{ const f=panel.querySelector('.rp-from'),t=panel.querySelector('.rp-to'); const tmp=f.value; f.value=t.value; t.value=tmp; const tp=pFrom; pFrom=pTo; pTo=tp; recompute(); };
      const wireIn=(sel,setter,ref)=>{ const el=panel.querySelector(sel);
        /* (#R126) 経路10-10 §3.12/§24.7: the moment the text is EDITED the previously-selected place is invalid —
           never compute a route with stale coordinates behind a changed label. (Programmatic value sets — Enter
           geocode / map pick / openPanel — don't fire 'input', so confirmed selections survive.) */
        el.addEventListener('input',()=>{ setter(null); });
        el.addEventListener('keydown',async e=>{ if(e.key!=='Enter') return; e.preventDefault(); const g=await geo1(el.value,ref?ref():null); if(g){ el.value=g.name; setter(g); recompute(); } }); el.addEventListener('blur',async()=>{ if(!el.value.trim()){ setter(null); return; } }); };
      wireIn('.rp-from',g=>pFrom=g); wireIn('.rp-to',g=>pTo=g,()=>pFrom?[pFrom.lng,pFrom.lat]:null);
      /* (#R126) §1.3/§24.8: leave-now / depart-at / arrive-by (arrive-by applies to transit; road uses the time as-is) */
      const whenSel=panel.querySelector('.rp-when'), timeIn=panel.querySelector('.rp-time');
      whenSel.onchange=()=>{ const now=whenSel.value==='now'; timeIn.style.display=now?'none':'';
        if(!now&&!timeIn.value){ const d=new Date(Date.now()+5*60000); d.setSeconds(0,0); try{ timeIn.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); }catch(_){} }
        recompute(); };
      timeIn.onchange=()=>recompute();
      /* (#R132) §7.3 avoid toggles → pAvoid set, recompute on change */
      panel.querySelectorAll('.rp-av').forEach(b=>b.onclick=()=>{ const k=b.getAttribute('data-av'); if(pAvoid.has(k)) pAvoid.delete(k); else pAvoid.add(k); _syncAvoid(); recompute(); });
      /* (#R132) §15.7 export the shown route */
      panel.querySelectorAll('.rp-exp').forEach(b=>b.onclick=()=>{ try{ exportRoute(b.getAttribute('data-f')); }catch(_){} });
      panel.querySelector('.rp-pick-from').onclick=()=>_startPick('from'); panel.querySelector('.rp-pick-to').onclick=()=>_startPick('to');
      /* (#R184) via points, the drawn area, the transit allow-list and the analyses */
      panel.querySelector('.rp-addvia').onclick=()=>{ pVia.push(null); _renderVias(); };
      panel.querySelector('.rp-area').onclick=()=>_toggleAreaDraw();
      panel.querySelectorAll('.rp-tm').forEach(b=>b.onclick=()=>{ const k=b.getAttribute('data-tm');
        if(!pTModes) pTModes=['RAIL','SUBWAY','TRAM','BUS','FERRY'];
        const i=pTModes.indexOf(k);
        if(i>=0){ if(pTModes.length>1) pTModes.splice(i,1); } else pTModes.push(k);
        _syncTModes(); recompute(); });
      { const mw=panel.querySelector('.rp-maxwalk'); if(mw) mw.onchange=()=>{ const v=parseFloat(mw.value);
        pMaxWalk=isFinite(v)&&v>0?v:null; recompute(); }; }
      panel.querySelectorAll('.rp-op').forEach(b=>b.onclick=()=>_runOp(b.getAttribute('data-op')));
      try{ if(typeof makeDraggable==='function') makeDraggable(panel,panel.querySelector('.rp-head')); }catch(_){}
      _syncModes(); _renderVias(); return panel; }
    /* ---- (#R184) via points ------------------------------------------------------------------ */
    function _renderVias(){ if(!panel) return;
      const box=panel.querySelector('.rp-vias'); if(!box) return;
      const inCss='flex:1;min-width:0;height:30px;padding:0 10px;border-radius:9px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;outline:none;box-sizing:border-box;';
      box.innerHTML=pVia.map((v,i)=>'<div style="display:flex;align-items:center;gap:8px;"><span style="flex:0 0 auto;font-size:11px;color:var(--text-muted);width:14px;text-align:center;">'+(i+1)+'</span>'
        +'<input class="rp-via" data-vi="'+i+'" value="'+escp((v&&v.name)||'')+'" placeholder="'+escp(LL('Stop','経由地','Zwischenziel','Промежуточная точка','Parada'))+'" style="'+inCss+'">'
        +'<button class="rp-via-pick" data-vi="'+i+'" title="'+LL('Pick on map','地図で選ぶ','Auf Karte wählen','Выбрать на карте','Elegir en el mapa')+'" style="flex:0 0 auto;width:26px;height:26px;border:none;background:var(--input-bg);border-radius:7px;color:var(--text-muted);cursor:pointer;">◎</button>'
        +'<button class="rp-via-del" data-vi="'+i+'" style="flex:0 0 auto;width:22px;height:22px;border:none;background:rgba(128,128,128,0.16);border-radius:6px;color:var(--text-main);font-size:10px;cursor:pointer;">✕</button></div>').join('');
      box.querySelectorAll('.rp-via').forEach(el=>{ const i=+el.getAttribute('data-vi');
        el.addEventListener('input',()=>{ pVia[i]=null; });
        el.addEventListener('keydown',async e=>{ if(e.key!=='Enter') return; e.preventDefault();
          const g=await geo1(el.value,pFrom?[pFrom.lng,pFrom.lat]:null);
          if(g){ el.value=g.name; pVia[i]=g; recompute(); } }); });
      box.querySelectorAll('.rp-via-pick').forEach(b=>b.onclick=()=>_startPick('via:'+b.getAttribute('data-vi')));
      box.querySelectorAll('.rp-via-del').forEach(b=>b.onclick=()=>{ pVia.splice(+b.getAttribute('data-vi'),1); _renderVias(); recompute(); });
    }
    /* ---- (#R184) the drawn keep-out area ------------------------------------------------------
       Two clicks give the opposite corners of a box. A box rather than a free polygon because a
       keep-out area is nearly always "not through there" and two clicks say that without a drawing
       mode to learn or exit; the request already accepts arbitrary rings, so a richer editor can
       replace this without touching the routing side. */
    const AREA_SRC='imroute-area-src', AREA_FILL='imroute-area', AREA_LINE='imroute-area-line';
    function _areaLayers(){ try{ const E=GE(); if(!E||!E.canDraw()) return false;
      if(!E.layers.hasSource(AREA_SRC)) E.layers.addSource(AREA_SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!E.layers.has(AREA_FILL)) E.layers.add({id:AREA_FILL,type:'fill',source:AREA_SRC,paint:{'fill-color':'#ff453a','fill-opacity':0.16}});
      if(!E.layers.has(AREA_LINE)) E.layers.add({id:AREA_LINE,type:'line',source:AREA_SRC,paint:{'line-color':'#ff453a','line-width':1.6,'line-dasharray':[3,2]}});
      return true; }catch(_){ return false; } }
    function _drawAreas(){ if(!_areaLayers()) return;
      try{ GE().layers.setSourceData(AREA_SRC,{type:'FeatureCollection',features:pAreas.map(r=>({type:'Feature',geometry:{type:'Polygon',coordinates:[r]},properties:{}}))});
        [AREA_FILL,AREA_LINE].forEach(id=>{ if(GE().layers.has(id)) GE().layers.setVisible(id,pAreas.length>0); }); }catch(_){}
      const n=panel&&panel.querySelector('.rp-arean');
      if(n) n.textContent=pAreas.length?(pAreas.length+' '+LL('area(s)','か所','Fläche(n)','зон','zonas')+' · '+LL('tap to clear','押して消去','tippen zum Löschen','нажмите, чтобы убрать','toca para borrar')):''; }
    function _toggleAreaDraw(){
      if(pAreas.length&&!pAreaDraw){ pAreas=[]; _drawAreas(); recompute(); return; }
      if(pAreaDraw){ _endAreaDraw(); return; }
      let first=null;
      pAreaDraw=(e)=>{ const ll=[e.lngLat.lng,e.lngLat.lat];
        if(!first){ first=ll; try{ GE().events.once('click',pAreaDraw); }catch(_){} return; }
        const w=Math.min(first[0],ll[0]), e2=Math.max(first[0],ll[0]);
        const s=Math.min(first[1],ll[1]), n=Math.max(first[1],ll[1]);
        pAreas.push([[w,s],[e2,s],[e2,n],[w,n],[w,s]]);
        _endAreaDraw(); _drawAreas(); recompute(); };
      try{ GE().render.canvas().style.cursor='crosshair'; GE().events.once('click',pAreaDraw); }catch(_){}
      const b=panel&&panel.querySelector('.rp-area');
      if(b){ b.style.background='var(--primary-color)'; b.style.color='#fff'; b.textContent='◉ '+LL('Click two corners','対角2点をクリック','Zwei Ecken klicken','Кликните два угла','Haz clic en dos esquinas'); } }
    function _endAreaDraw(){ try{ if(pAreaDraw) GE().events.off('click',pAreaDraw); }catch(_){} pAreaDraw=null;
      try{ GE().render.canvas().style.cursor=''; }catch(_){}
      const b=panel&&panel.querySelector('.rp-area');
      if(b){ b.style.background='transparent'; b.style.color='var(--text-muted)'; b.textContent='▧ '+LL('Draw an area','範囲を描く','Fläche zeichnen','Нарисовать зону','Dibujar zona'); } }
    function _syncTModes(){ if(!panel) return;
      const row=panel.querySelector('.rp-tmodes'); if(row) row.style.display=(pMode==='transit')?'flex':'none';
      const on=pTModes||['RAIL','SUBWAY','TRAM','BUS','FERRY'];
      panel.querySelectorAll('.rp-tm').forEach(b=>{ const k=on.indexOf(b.getAttribute('data-tm'))>=0;
        b.style.background=k?'var(--primary-color)':'transparent'; b.style.color=k?'#fff':'var(--text-muted)';
        b.style.borderColor=k?'var(--primary-color)':'var(--glass-border,rgba(128,128,128,0.28))'; }); }
    function _syncAvoid(){ if(!panel) return; const row=panel.querySelector('.rp-avoid');
      /* (#R184) the avoid row is no longer driving-only: a DRAWN AREA is honoured for walking and
         cycling too (Valhalla's pedestrian/bicycle costings take exclude_polygons), so the row shows
         for every road mode and only the three toll/highway/ferry chips stay driving-only. */
      if(row) row.style.display=(pMode==='transit')?'none':'flex';
      panel.querySelectorAll('.rp-av').forEach(b=>{ b.style.display=(pMode==='driving')?'':'none'; });
      _syncTModes();
      panel.querySelectorAll('.rp-av').forEach(b=>{ const on=pAvoid.has(b.getAttribute('data-av')); b.style.background=on?'var(--primary-color)':'transparent'; b.style.color=on?'#fff':'var(--text-muted)'; b.style.borderColor=on?'var(--primary-color)':'var(--glass-border,rgba(128,128,128,0.28))'; }); }
    function _syncModes(){ if(!panel) return; panel.querySelectorAll('.rp-mode').forEach(b=>{ const on=b.getAttribute('data-m')===pMode; b.style.background=on?'var(--primary-color)':'transparent'; b.style.color=on?'#fff':'var(--text-muted)'; }); _syncAvoid(); }
    function _startPick(which){ _endPick(); pickTarget=which; try{ GE().render.canvas().style.cursor='crosshair'; }catch(_){}
      pickHandler=async e=>{ const ll={lng:e.lngLat.lng,lat:e.lngLat.lat}; const g={lng:ll.lng,lat:ll.lat,name:ll.lat.toFixed(4)+', '+ll.lng.toFixed(4)};
        const tgt=pickTarget;
        const vm=/^via:(\d+)$/.exec(String(tgt||''));
        if(vm){ pVia[+vm[1]]=g; _renderVias(); }
        else if(tgt==='from'){ pFrom=g; if(panel) panel.querySelector('.rp-from').value=g.name; } else { pTo=g; if(panel) panel.querySelector('.rp-to').value=g.name; }
        _endPick(); recompute();
        /* (#R126) §6.6: reverse-geocode the picked point (best-effort) so the field shows a place, not bare coords */
        try{ const ac=new AbortController(); setTimeout(()=>{try{ac.abort();}catch(_){}} ,6000);
          const r=await fetch('https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&lat='+ll.lat.toFixed(6)+'&lon='+ll.lng.toFixed(6),{signal:ac.signal}); const j=await r.json();
          if(j&&j.display_name){ const nm=j.display_name.split(',').slice(0,2).join(', ');
            const vm2=/^via:(\d+)$/.exec(String(tgt||''));
            const still=vm2?(pVia[+vm2[1]]===g):(tgt==='from')?(pFrom===g):(pTo===g);   /* only if the user hasn't changed the field since */
            if(still){ g.name=nm;
              if(vm2){ _renderVias(); }
              else { const el=panel&&panel.querySelector(tgt==='from'?'.rp-from':'.rp-to'); if(el) el.value=nm; } } } }catch(_){} };
      try{ GE().events.once('click',pickHandler); }catch(_){} }
    function _endPick(){ pickTarget=null; try{ if(pickHandler) GE().events.off('click',pickHandler); }catch(_){} pickHandler=null; try{ GE().render.canvas().style.cursor=''; }catch(_){} }
    async function recompute(){ if(!panel) return; const sum=panel.querySelector('.rp-summary'), st=panel.querySelector('.rp-steps');
      if(!pFrom||!pTo){ if(sum) sum.textContent=''; if(st) st.innerHTML='<div style="color:var(--text-muted);font-size:11.5px;padding:8px 0;">'+LL('Enter a start and destination.','出発地と目的地を入力してください。','Start und Ziel eingeben.','Введите начало и цель.','Introduce origen y destino.')+'</div>'; return; }
      if(sum) sum.innerHTML='<span style="color:var(--text-muted);">'+LL('Routing…','経路計算中…','Route…','Прокладка…','Calculando…')+'</span>'; if(st) st.innerHTML='';
      const _wsel=panel.querySelector('.rp-when'), _tin=panel.querySelector('.rp-time'); const _opts={mode:pMode};
      if(_wsel&&_wsel.value!=='now'&&_tin&&_tin.value){ const d=new Date(_tin.value); if(isFinite(d.getTime())){ _opts.time=d.toISOString(); _opts.arriveBy=(_wsel.value==='arrive'); } }
      if(pMode==='driving'&&pAvoid.size) _opts.avoid=[...pAvoid];   /* (#R132) §7.3 */
      /* (#R184) the four new inputs. Only resolved via points are sent — a half-typed one must never
         become a coordinate (#R126 §3.12), which is why pVia holds nulls rather than raw text. */
      { const vs=pVia.filter(v=>v&&isFinite(+v.lng)&&isFinite(+v.lat)); if(vs.length) _opts.via=vs; }
      if(pAreas.length&&pMode!=='transit') _opts.avoidAreas=pAreas;
      if(pMode==='transit'){
        if(pTModes&&pTModes.length&&pTModes.length<5) _opts.transitModes=pTModes.slice();
        if(pMaxWalk) _opts.maxWalkM=pMaxWalk; }
      let r=null; try{ r=await route(pFrom,pTo,_opts); }catch(_){}
      if(r&&r.status==='cancelled') return;   /* (#R126) superseded by a newer request — that one updates the UI */
      { const exp=panel.querySelector('.rp-export'); if(exp) exp.style.display=(r&&r.ok)?'flex':'none'; }   /* (#R132) §15.7 show export only when a route exists */
      /* (#R184) a new route invalidates every analysis of the previous one */
      pLastResult=(r&&r.ok)?r:null;
      { const ops=panel.querySelector('.rp-ops'); if(ops) ops.style.display=(r&&r.ok)?'flex':'none';
        const out=panel.querySelector('.rp-opout'); if(out) out.innerHTML=''; }
      try{ window.IntMapRoutingOps&&window.IntMapRoutingOps.clearDifferences(); }catch(_){}
      try{ window.IntMapRoutingOps&&window.IntMapRoutingOps.clearHistorical(); }catch(_){}
      if(!r||!r.ok){
        /* (#R126) 経路10-10 §2.5: outage / timeout / rate-limit / no-route are DIFFERENT answers, not one "not found" */
        const stt=(r&&r.status)||'';
        if(stt==='provider_timeout'||stt==='provider_unavailable'||stt==='rate_limited'){
          const msg=stt==='rate_limited'?LL('Too many requests — wait a moment and try again.','リクエストが多すぎます — 少し待って再試行してください。','Zu viele Anfragen — kurz warten und erneut versuchen.','Слишком много запросов — подождите и повторите.','Demasiadas solicitudes — espera y reintenta.')
            :stt==='provider_timeout'?LL('The routing service timed out — try again.','経路サービスがタイムアウトしました — 再試行してください。','Zeitüberschreitung beim Routingdienst — erneut versuchen.','Тайм-аут сервиса маршрутов — повторите.','El servicio de rutas agotó el tiempo — reintenta.')
            :LL('The routing service is unreachable right now (outage or network) — try again shortly.','経路サービスに接続できません（障害またはネットワーク）— しばらくして再試行してください。','Routingdienst derzeit nicht erreichbar — später erneut versuchen.','Сервис маршрутов недоступен — повторите позже.','El servicio de rutas no está disponible — reintenta en breve.');
          if(sum) sum.innerHTML='<span style="color:#ff9f0a;">⚠ '+msg+'</span>'; if(st) st.innerHTML=''; return; }
        if(pMode==='transit'&&r&&r.reason==='no-transit'){ if(sum) sum.innerHTML='<span style="color:#ff9f0a;">🚆 '+LL('No public-transit route found here','この区間の公共交通経路が見つかりませんでした','Keine ÖPNV-Verbindung gefunden','Транзитный маршрут не найден','Sin ruta de transporte')+'</span>'; if(st) st.innerHTML='<div style="color:var(--text-muted);font-size:11px;padding:6px 0;line-height:1.6;">'+LL('Transit data (GTFS) may not cover this area yet. Try 🚗 driving or 🚶 walking, or a route within a covered city/country.','この地域は公共交通データ（GTFS）が未整備の可能性があります。車・徒歩をお試しください。','ÖPNV-Daten (GTFS) decken dieses Gebiet evtl. nicht ab.','Данные GTFS могут не покрывать этот регион.','Los datos GTFS pueden no cubrir esta zona.')+'</div>'; return; }
        const snapTx=(r&&r.snapKm)?(' '+LL('A point is ~'+r.snapKm+' km from the nearest routable road (outside coverage).','地点が最寄りの経路可能な道路から約'+r.snapKm+' km離れています（対象地域外の可能性）。','Ein Punkt liegt ~'+r.snapKm+' km von der nächsten Straße (außerhalb der Abdeckung).','Точка в ~'+r.snapKm+' км от ближайшей дороги (вне покрытия).','Un punto está a ~'+r.snapKm+' km de la carretera más cercana (fuera de cobertura).')):'';
        if(sum) sum.innerHTML='<span style="color:#ff9f0a;">⚠ '+LL('No route found (maybe no connection).','経路が見つかりません（接続がない可能性）。','Keine Route gefunden.','Маршрут не найден.','Sin ruta.')+snapTx+'</span>'; return; }
      if(r.transit){   /* (#R85) rich transit itinerary: total time, transfers, and a colour-coded leg list */
        const tot=Math.round(r.duration/60), h=Math.floor(tot/60), rem=tot%60, dur=h?(h+' h '+rem+' min'):(tot+' min');
        const tf=r.transfers||0;
        if(sum) sum.innerHTML='<b style="font-size:15px;">'+dur+'</b> · '+tf+' '+LL('transfer'+(tf===1?'':'s'),'回乗換','Umst.','пересад.','transb.')+(r.startTime?(' · '+_hm(r.startTime)+'→'+_hm(r.endTime)):'');
        if(st) st.innerHTML=legRows(r.legs); return; }
      const ml=({driving:'🚗',walking:'🚶',cycling:'🚲'})[pMode]||'';
      const timeHint=_opts.time?('<span style="color:var(--text-muted);font-size:10.5px;"> · '+LL('time option applies to transit (road times are typical, not traffic-aware)','時刻指定は公共交通で有効（道路は交通状況を含まない標準時間）','Zeitwahl gilt für ÖPNV (Straße ohne Verkehrslage)','время действует для транспорта (дорога без пробок)','la hora aplica al transporte público (carretera sin tráfico)')+'</span>'):'';
      const _dur=sec=>{ const t=Math.round(sec/60),hh=Math.floor(t/60),mm=t%60; return hh?(hh+' h '+mm+' min'):(t+' min'); };
      const _km=m=>{ const k=m/1000; return (k<10?k.toFixed(1):Math.round(k).toLocaleString())+' km'; };
      /* (#R132) §7.1/§10.5-10.6: road alternatives as selectable cards (fastest/shortest/+X min), tap → redraw+resync */
      const alts=(r.alternatives&&r.alternatives.length>1)?r.alternatives:null;
      const avNote=(r.avoidDropped)?('<div style="color:#ff9f0a;font-size:10.5px;">⚠ '+LL('Could not apply the avoid options (routing service busy) — showing the normal route.','回避条件を適用できませんでした（経路サービス混雑）— 通常経路を表示。','Meiden-Optionen nicht anwendbar (Dienst ausgelastet) — normale Route.','Не удалось применить исключения — обычный маршрут.','No se pudieron aplicar las exclusiones — ruta normal.')+'</div>'):(r.provider==='valhalla'?('<div style="color:var(--text-muted);font-size:10px;">'+LL('Avoid routing via Valhalla (OSM).','回避経路は Valhalla（OSM）。','Meiden-Route via Valhalla (OSM).','Маршрут с исключениями через Valhalla (OSM).','Ruta con exclusiones vía Valhalla (OSM).')+'</div>'):'');
      if(sum) sum.innerHTML='<b style="font-size:15px;">'+_dur(r.duration)+'</b> · '+_km(r.distance)+' '+ml+timeHint+avNote;
      if(st){ st._ctx={setId:r.routeSetId,alts,steps:r.steps,mode:pMode,sum,dur:_dur,km:_km,ml};
        let html='';
        if(alts){ html+='<div class="rp-alts" style="display:flex;flex-direction:column;gap:4px;margin-bottom:7px;">'+alts.map((a,i)=>'<button class="rp-alt" data-ai="'+i+'" style="text-align:left;border:none;border-left:3px solid '+a.color+';background:'+(i===0?'var(--input-bg)':'transparent')+';border-radius:6px;padding:5px 8px;cursor:pointer;display:flex;justify-content:space-between;gap:6px;align-items:center;color:var(--text-main);"><span style="font-size:11.5px;">'+escp(a.label||'')+'</span><span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">'+_dur(a.duration)+' · '+_km(a.distance)+'</span></button>').join('')+'</div>'; }
        html+='<div class="rp-steplist">'+stepRows(alts?alts[0].steps:r.steps,pMode)+'</div>';
        st.innerHTML=html; st.dataset.sel='0';
        if(!st._wired){ st._wired=true; st.addEventListener('click',ev=>{ const ctx=st._ctx; if(!ctx) return;
          const ab=ev.target.closest&&ev.target.closest('.rp-alt[data-ai]');
          if(ab){ const i=+ab.getAttribute('data-ai'); st.dataset.sel=String(i); st.querySelectorAll('.rp-alt').forEach(x=>x.style.background=(x===ab)?'var(--input-bg)':'transparent');
            try{ selectAlt(i,ctx.setId); }catch(_){} const a=ctx.alts[i]; if(ctx.sum) ctx.sum.innerHTML='<b style="font-size:15px;">'+ctx.dur(a.duration)+'</b> · '+ctx.km(a.distance)+' '+ctx.ml;
            const sl=st.querySelector('.rp-steplist'); if(sl) sl.innerHTML=stepRows(a.steps,ctx.mode); return; }
          const sr=ev.target.closest&&ev.target.closest('.rp-step[data-si]');
          if(sr){ const si=+sr.getAttribute('data-si'); const sel=+(st.dataset.sel||0); const steps=ctx.alts?ctx.alts[sel].steps:ctx.steps; const step=steps&&steps[si];
            const co=step&&step.geometry&&step.geometry.coordinates; try{ selectStep(ctx.setId,si,co); }catch(_){}
            st.querySelectorAll('.rp-step').forEach(x=>x.style.background=(x===sr)?'rgba(255,210,63,0.14)':''); } }); }
      } }
    /* ---- (#R184) THE ANALYSES ------------------------------------------------------------------
       Each button asks js/routing-ops.js one question about the route currently drawn and renders the
       answer. `pLastResult` is the route the answers belong to; recompute() clears it, so an answer
       can never outlive the route it describes. */
    function _opCoords(){
      const r=pLastResult; if(!r) return null;
      if(Array.isArray(r.coords)&&r.coords.length>1) return r.coords;
      const rc=_routeCoords(); return (rc&&rc.coords&&rc.coords.length>1)?rc.coords:null; }
    function _opAlts(){ const rs=_rsets.get(_rsActive); return (rs&&rs.alts&&rs.alts.length>1)?rs.alts:null; }
    function _opOut(html){ const box=panel&&panel.querySelector('.rp-opout'); if(box) box.innerHTML=html; }
    function _opBusy(k){ opsBusy=k;
      if(!panel) return; panel.querySelectorAll('.rp-op').forEach(b=>{ b.style.opacity=(opsBusy&&b.getAttribute('data-op')!==opsBusy)?'0.45':'1'; }); }
    const _m=(v)=>(v==null||!isFinite(v))?'—':(Math.abs(v)>=1000?((v/1000).toFixed(2)+' km'):(Math.round(v)+' m'));
    const _hhmm=(ms)=>{ try{ return new Date(ms).toLocaleTimeString(window.IntMapLang.locale(HOST.lang,"en-GB"),{hour:'2-digit',minute:'2-digit'}); }catch(_){ return ''; } };
    async function _runOp(k){
      const O=window.IntMapRoutingOps;
      if(!O){ _opOut('<span style="color:#ff9f0a;">⚠</span>'); return; }
      if(opsBusy) return;
      const coords=_opCoords();
      if(k!=='hist'&&!coords){ _opOut('<span style="color:var(--text-muted);">'+escp(LL('Compute a route first.','先に経路を計算してください。','Zuerst eine Route berechnen.','Сначала рассчитайте маршрут.','Calcula una ruta primero.'))+'</span>'); return; }
      _opBusy(k); _opOut('<span style="color:var(--text-muted);">…</span>');
      try{
        if(k==='elev'){
          const e=await O.elevation(coords);
          if(!e||e.err) _opOut('<span style="color:#ff9f0a;">⚠ '+escp(LL('No elevation data for this route yet.','この経路の標高データを取得できませんでした。','Keine Höhendaten.','Нет данных о высотах.','Sin datos de elevación.'))+'</span>');
          else _opOut('<b>'+escp(LL('Elevation','標高差','Höhe','Высоты','Desnivel'))+'</b><br>'
            +'▲ '+_m(e.ascentM)+' · ▼ '+_m(e.descentM)+' · '+escp(LL('net','正味','netto','итог','neto'))+' '+((e.netM>=0?'+':'')+Math.round(e.netM))+' m<br>'
            +escp(LL('Highest','最高','Höchster','Максимум','Máximo'))+' '+Math.round(e.maxM)+' m · '+escp(LL('lowest','最低','niedrigster','минимум','mínimo'))+' '+Math.round(e.minM)+' m'
            +' · '+escp(LL('steepest','最急勾配','steilster','макс. уклон','más empinado'))+' '+e.maxGradePct.toFixed(1)+'%'
            +'<br><span style="color:var(--text-muted);font-size:10px;">'+escp(LL('Terrarium DEM z'+e.demZoom+', '+e.samples+' samples, changes under '+e.noiseFloorM+' m ignored as sampling noise'+(e.missing?(', '+e.missing+' without data'):''),
              'Terrarium DEM z'+e.demZoom+'・'+e.samples+'点。'+e.noiseFloorM+'m未満の変化はサンプリング誤差として除外'+(e.missing?('・'+e.missing+'点は標高欠測'):''),
              'Terrarium-DEM z'+e.demZoom+', '+e.samples+' Proben',
              'Terrarium DEM z'+e.demZoom+', '+e.samples+' проб',
              'DEM Terrarium z'+e.demZoom+', '+e.samples+' muestras'))+'</span>');
        } else if(k==='borders'){
          const b=O.borders(coords);
          if(!b||b.err) _opOut('<span style="color:#ff9f0a;">⚠ '+escp(LL('Country outlines are not loaded yet — open the Countries tab once and try again.','国境データが未読み込みです。Countriesタブを一度開いてから再試行してください。','Ländergrenzen noch nicht geladen.','Границы стран ещё не загружены.','Los contornos de países aún no están cargados.'))+'</span>');
          else _opOut('<b>'+escp(LL('Border crossings','国境通過','Grenzübertritte','Пересечения границ','Cruces de frontera'))+': '+b.count+'</b>'
            +(b.segments.length?('<br>'+b.segments.map(sg=>escp(sg.name)+' <span style="color:var(--text-muted);font-size:10.5px;">'+_m(sg.m)+'</span>').join(' → ')):'')
            +(b.crossings.length?('<br>'+b.crossings.map(c=>'<span style="color:var(--text-muted);font-size:10.5px;">'+escp(c.from+' → '+c.to)+' · '+_m(c.atM)+'</span>').join('<br>')):'')
            +'<br><span style="color:var(--text-muted);font-size:10px;">'+escp(LL(
              'From the app’s own country outlines, sampled every '+b.sampleStepM+' m. Those outlines are simplified for drawing, so a very short transit can be the outline’s resolution rather than a real crossing — the length beside each country is what tells them apart.',
              'アプリの国境ポリゴンを '+b.sampleStepM+' m 間隔で判定しています。描画用に簡略化された境界のため、ごく短い通過は実際の越境ではなく境界の解像度である可能性があります。各国の横に出ている距離で判断してください。',
              'Aus den Ländergrenzen der App, alle '+b.sampleStepM+' m abgetastet; sie sind zum Zeichnen vereinfacht.',
              'По контурам стран приложения, шаг '+b.sampleStepM+' м; они упрощены для отрисовки.',
              'Desde los contornos de países de la app, muestreados cada '+b.sampleStepM+' m; están simplificados para el dibujo.'))+'</span>');
        } else if(k==='along'){
          const dep=(()=>{ const w=panel.querySelector('.rp-when'), t=panel.querySelector('.rp-time');
            if(w&&w.value!=='now'&&t&&t.value){ const d=new Date(t.value); if(isFinite(d.getTime())) return d.getTime(); }
            return Date.now(); })();
          const a=await O.along(coords,{ durationS:(pLastResult&&pLastResult.duration)||0, departMs:dep });
          const wx=a.probes.map(p=>{
            const t=p.wx&&p.wx.tempC!=null?(Math.round(p.wx.tempC)+' °C'):'—';
            const w=p.wx&&p.wx.windKmh!=null?(Math.round(p.wx.windKmh)+' km/h'):'';
            const pc=p.wx&&p.wx.precip!=null&&p.wx.precip>0?(' · '+p.wx.precip.toFixed(1)+' mm'):'';
            return '<span style="color:var(--text-muted);font-size:10.5px;">'+_m(p.atM)+' · '+_hhmm(p.etaMs)+'</span> '+escp(t+(w?(' · '+w):'')+pc); }).join('<br>');
          const q=a.quakes.length?('<br><b>'+escp(LL('Earthquakes near the route (last 24 h)','経路付近の地震（24時間）','Erdbeben nahe der Route (24 h)','Землетрясения рядом (24 ч)','Sismos cerca (24 h)'))+'</b><br>'
            +a.quakes.map(x=>'<span style="color:#ff9f0a;">M'+(x.mag||0).toFixed(1)+'</span> '+escp(String(x.place||''))+' <span style="color:var(--text-muted);font-size:10.5px;">'+Math.round(x.km)+' km</span>').join('<br>')):'';
          const nw=a.news.length?('<br><b>'+escp(LL('News along the route','経路沿いのニュース','Nachrichten entlang der Route','Новости по маршруту','Noticias en la ruta'))+'</b><br>'
            +a.news.map(x=>'<span style="color:var(--text-muted);font-size:10.5px;">'+Math.round(x.km)+' km</span> '+escp(x.title)).join('<br>')):'';
          _opOut('<b>'+escp(LL('Weather along the way','沿道の天気','Wetter unterwegs','Погода по пути','Tiempo por el camino'))+'</b><br>'+wx+q+nw
            +(a.quakes.length||a.news.length?'':'<br><span style="color:var(--text-muted);font-size:10.5px;">'+escp(LL('No earthquakes or geolocated news near this route.','経路付近に地震・位置付きニュースはありません。','Keine Erdbeben oder verorteten Nachrichten.','Землетрясений и новостей рядом нет.','Sin sismos ni noticias geolocalizadas.'))+'</span>'));
        } else if(k==='times'){
          const w=panel.querySelector('.rp-when'), t=panel.querySelector('.rp-time');
          const arriveBy=!!(w&&w.value==='arrive');
          const tMs=(w&&w.value!=='now'&&t&&t.value&&isFinite(new Date(t.value).getTime()))?new Date(t.value).getTime():Date.now();
          /* the legs are the via-point sections when there are via points, and one leg otherwise —
             the arrival time "at each point on the way" is exactly the boundary between them */
          const durs=(pLastResult&&pLastResult.legDurations)||[(pLastResult&&pLastResult.duration)||0];
          const sc=O.schedule(durs,{ timeMs:tMs, arriveBy });
          const names=[ (pFrom&&pFrom.name)||'' ].concat(pVia.map((v,i)=>(v&&v.name)||('#'+(i+1)))).concat([ (pTo&&pTo.name)||'' ]);
          _opOut('<b>'+escp(LL('Arrival times','到着時刻','Ankunftszeiten','Время прибытия','Horas de llegada'))+'</b>'
            +(arriveBy?(' <span style="color:var(--text-muted);font-size:10.5px;">'+escp(LL('(working back from the arrival deadline)','（到着時刻から逆算）','(rückwärts von der Ankunft)','(отсчёт назад от прибытия)','(hacia atrás desde la llegada)'))+'</span>'):'')
            +'<br>'+sc.points.map((p,i)=>'<span style="color:var(--text-muted);font-size:10.5px;">'+_hhmm(p.tMs)+'</span> '+escp(names[i]||('#'+i))).join('<br>'));
        } else if(k==='diff'){
          const alts=_opAlts();
          if(!alts){ _opOut('<span style="color:var(--text-muted);">'+escp(LL('Only one route was returned — there is nothing to compare.','経路が1本のみのため比較できません。','Nur eine Route — nichts zu vergleichen.','Только один маршрут — сравнивать нечего.','Solo una ruta — nada que comparar.'))+'</span>'); }
          else { const d=O.highlightDifferences(alts);
            _opOut('<b>'+escp(LL('Where the routes differ','経路が分かれる区間','Wo sich die Routen unterscheiden','Где маршруты расходятся','Dónde difieren las rutas'))+'</b><br>'
              +d.per.map(p=>'<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:'+escp(p.color)+';"></span> '+escp((alts[p.i].label||('#'+(p.i+1)))+' — '+_m(p.uniqueM)+' '+LL('not shared','が非共通','abweichend','не общий','no compartido')+' ('+p.segments+')')).join('<br>')
              +'<br><span style="color:var(--text-muted);font-size:10px;">'+escp(LL('Lines closer than '+d.sameThresholdM+' m count as the same road.','距離 '+d.sameThresholdM+' m 以内は同一の道とみなします。','Linien unter '+d.sameThresholdM+' m gelten als dieselbe Straße.','Линии ближе '+d.sameThresholdM+' м считаются одной дорогой.','Líneas a menos de '+d.sameThresholdM+' m cuentan como la misma vía.'))+'</span>'); }
        } else if(k==='hist'){
          if(!pFrom||!pTo){ _opOut('<span style="color:var(--text-muted);">'+escp(LL('Enter a start and destination.','出発地と目的地を入力してください。','Start und Ziel eingeben.','Введите начало и цель.','Introduce origen y destino.'))+'</span>'); }
          else {
            const y=parseInt((panel.querySelector('.rp-hyear')||{}).value,10)||1900;
            const kind=(panel.querySelector('.rp-hkind')||{}).value||'rail';
            const h=await O.historicalRoute(pFrom,pTo,{ year:y, kind });
            if(!h||h.err){
              const M={ 'too-far':LL('That is too far for a historical-network search (max '+(h&&h.maxKm||400)+' km apart).','この距離は過去路線網の検索範囲を超えています（直線距離で最大 '+(h&&h.maxKm||400)+' km）。','Zu weit für die historische Netzsuche.','Слишком далеко для поиска по исторической сети.','Demasiado lejos para la búsqueda histórica.'),
                'empty':LL('OpenStreetMap has no '+(kind==='rail'?'railway':'road')+' recorded here for '+y+'.','この地域には '+y+' 年の'+(kind==='rail'?'鉄道':'道路')+'の記録が OpenStreetMap にありません。','OSM kennt hier für '+y+' nichts.','В OSM нет записей за '+y+' год здесь.','OSM no tiene registros aquí para '+y+'.'),
                'no-network':LL('The nearest recorded line is '+(h&&h.snapKm)+' km from an endpoint — too far to start from.','最寄りの記録された路線が端点から '+(h&&h.snapKm)+' km 離れており、起点にできません。','Nächste Linie '+(h&&h.snapKm)+' km entfernt.','Ближайшая линия в '+(h&&h.snapKm)+' км.','La línea más cercana está a '+(h&&h.snapKm)+' km.'),
                'disconnected':LL('The network that existed in '+y+' does not connect these two places.','この2地点は '+y+' 年の路線網ではつながっていません。','Das Netz von '+y+' verbindet diese Orte nicht.','Сеть '+y+' года не соединяет эти пункты.','La red de '+y+' no conecta estos lugares.'),
                'overpass':LL('OpenStreetMap could not be reached.','OpenStreetMap に接続できませんでした。','OpenStreetMap nicht erreichbar.','OpenStreetMap недоступен.','No se pudo contactar con OpenStreetMap.') };
              _opOut('<span style="color:#ff9f0a;">⚠ '+escp(M[h&&h.err]||LL('No historical route found.','過去の経路が見つかりませんでした。','Keine historische Route.','Исторический маршрут не найден.','Sin ruta histórica.'))+'</span>');
            } else {
              O.drawHistorical(h);
              _opOut('<b>'+escp(LL('On the '+y+' network','（'+y+' 年の路線網）','Netz '+y,'Сеть '+y+' года','Red de '+y))+'</b><br>'
                +escp(_m(h.lengthM)+' · '+h.ways+' '+LL('ways in the corridor','区間（走査範囲）','Wege im Korridor','участков в коридоре','tramos en el corredor'))
                +'<br><span style="color:var(--text-muted);font-size:10px;">'+escp(LL(
                  'Of the route itself, '+h.onRouteDatedPct+'% runs on line that OpenStreetMap actually dates; '+h.onRoute.assumedGone+' of '+h.onRoute.checked+' sampled points are on line recorded as closed but undated (assumed to have existed in a past year) and '+h.onRoute.assumedLive+' on line still there today but undated (assumed to date back to at least 1900). This is OpenStreetMap’s record, not a historical atlas.',
                  'この経路自体のうち '+h.onRouteDatedPct+'% が、OpenStreetMap に年代の記録がある路線を通ります。標本 '+h.onRoute.checked+' 点のうち '+h.onRoute.assumedGone+' 点は「廃止だが年代不明」（過去には存在したと仮定）、'+h.onRoute.assumedLive+' 点は「現存するが年代不明」（1900年以前から存在したと仮定）の区間です。これは OpenStreetMap の記録であって歴史地図ではありません。',
                  h.onRouteDatedPct+'% der Route liegt auf datierter Linie (OSM-Daten, kein historischer Atlas).',
                  h.onRouteDatedPct+'% маршрута — по линии с датой в OSM (данные OSM, не исторический атлас).',
                  'El '+h.onRouteDatedPct+'% de la ruta va por línea con fecha en OSM (datos de OSM, no un atlas histórico).'))+'</span>');
            }
          }
        }
      }catch(e){ _opOut('<span style="color:#ff9f0a;">⚠ '+escp(String(e&&e.message||e))+'</span>'); }
      _opBusy('');
    }
    function _hm(iso){ try{ const d=new Date(iso); if(!isFinite(d.getTime())) return ''; return d.toLocaleTimeString(window.IntMapLang.locale(HOST.lang,"en-GB"),{hour:'2-digit',minute:'2-digit'}); }catch(_){ return ''; } }
    /* (#R85) transit leg list — one row per leg, mode icon + colour bar + line name + endpoints + duration */
    function legRows(legs){ return (legs||[]).map(l=>{ const mn=Math.round((l.duration||0)/60); const ic=_modeIcon(l.mode);
      const head=l.walk?(LL('Walk','徒歩','Zu Fuß','Пешком','A pie')+(l.to?(' → '+escp(l.to)):'')):((l.route?('<b>'+escp(l.route)+'</b> '):'')+(l.headsign?escp(l.headsign):escp(l.to||'')));
      const sub=l.walk?'':(escp(l.from||'')+(l.dep?(' · '+_hm(l.dep)):''));
      return '<div style="display:flex;gap:8px;align-items:flex-start;padding:7px 2px;border-top:1px solid rgba(128,128,128,0.12);">'
        +'<span style="flex:0 0 auto;width:20px;text-align:center;font-size:14px;">'+ic+'</span>'
        +'<span style="flex:0 0 auto;width:4px;align-self:stretch;border-radius:3px;background:'+(l.color||'#7a7f87')+';"></span>'
        +'<span style="flex:1;min-width:0;font-size:12px;line-height:1.45;">'+head+(sub?('<div style="color:var(--text-muted);font-size:10.5px;margin-top:1px;">'+sub+'</div>'):'')+'</span>'
        +'<span style="flex:0 0 auto;color:var(--text-muted);font-size:10.5px;">'+mn+' '+LL('min','分','Min','мин','min')+'</span></div>'; }).join(''); }
    async function openPanel(from,to,mode){ ensurePanel(); if(mode){ const ml=String(mode).toLowerCase(); const mapped=_isTransit(ml)?'transit':({car:'driving',drive:'driving',driving:'driving',walk:'walking',foot:'walking',walking:'walking',cycle:'cycling',bike:'cycling',cycling:'cycling'})[ml]; if(mapped) pMode=mapped; } _syncModes();
      panel.style.display='flex'; try{ if(typeof bringToFront==='function') bringToFront(panel); }catch(_){}
      const fEl=panel.querySelector('.rp-from'), tEl=panel.querySelector('.rp-to');
      if(from){ if(typeof from==='object'&&from.lng!=null){ pFrom=from; fEl.value=from.name||(from.lat.toFixed(3)+', '+from.lng.toFixed(3)); } else { fEl.value=String(from); pFrom=await geo1(String(from)); if(pFrom) fEl.value=pFrom.name; } }
      if(to){ if(typeof to==='object'&&to.lng!=null){ pTo=to; tEl.value=to.name||(to.lat.toFixed(3)+', '+to.lng.toFixed(3)); } else { tEl.value=String(to); pTo=await geo1(String(to)); if(pTo) tEl.value=pTo.name; } }
      recompute(); }
    /* (#R125) exact station lookup for the curated Shinkansen registry ("仙台駅" → the real 仙台駅, not a fuzzy
       POI hit like 仙太鮨) — accepts the name with/without 駅 and the English name, case-insensitive. */
    function stationLL(q){ q=String(q||'').trim().replace(/駅$/,'').replace(/\s+station$/i,''); if(!q) return null;
      const ql=q.toLowerCase();
      for(const Ln of _SHINK) for(const s of Ln.st){ if(s[0]===q||s[1].toLowerCase()===ql) return {lng:s[2],lat:s[3],name:(typeof HOST.lang!=='undefined'&&HOST.lang==='jp')?(s[0]+'駅'):(s[1]+' Station')}; }
      return null; }
    /* (#R132) 経路10-10 §15.7: export the CURRENTLY-SELECTED route as GPX or GeoJSON (real coordinates, user-initiated
       local download — no location is sent anywhere). _routeExport(fmt) builds the string (testable); exportRoute(fmt)
       downloads it. Uses the active RouteStore alternative's geometry (works for road, transit and the JR bridge). */
    function _routeCoords(){ const rs=_rsets.get(_rsActive); if(!rs||!rs.alts.length) return null; const a=rs.alts[rs.sel]||rs.alts[0];
      let coords=[]; (a.lines||[]).forEach(ln=>{ if(ln.coords&&ln.coords.length) coords=coords.length?coords.concat(ln.coords):ln.coords.slice(); });
      if(!coords.length&&a.coords) coords=a.coords; return {coords, alt:a}; }
    function _routeExport(fmt){ const rc=_routeCoords(); if(!rc||!rc.coords.length) return null; const {coords,alt}=rc;
      if(/gpx/i.test(fmt)){ const seg=coords.map(c=>'<trkpt lat="'+(+c[1]).toFixed(6)+'" lon="'+(+c[0]).toFixed(6)+'"/>').join('');
        return '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="IntMap" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>IntMap route</name><trkseg>'+seg+'</trkseg></trk>\n</gpx>'; }
      const fc={type:'FeatureCollection',features:[{type:'Feature',properties:{source:'IntMap',distance_m:alt.distance||null,duration_s:alt.duration||null},geometry:{type:'LineString',coordinates:coords.map(c=>[+(+c[0]).toFixed(6),+(+c[1]).toFixed(6)])}}]};
      return JSON.stringify(fc,null,0); }
    function exportRoute(fmt){ const s=_routeExport(fmt); if(s==null) return false; fmt=/gpx/i.test(fmt)?'gpx':'geojson';
      try{ const blob=new Blob([s],{type:fmt==='gpx'?'application/gpx+xml':'application/geo+json'}); const url=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download='intmap-route.'+fmt; document.body.appendChild(a); a.click();
        setTimeout(()=>{ try{ document.body.removeChild(a); URL.revokeObjectURL(url); }catch(_){} },1200); return true; }catch(_){ return false; } }
    function hasRoute(){ const rc=_routeCoords(); return !!(rc&&rc.coords&&rc.coords.length); }
    return { route, clear, ensureLayers, openPanel, _src:SRC, selectAlt, selectStep, maneuver:_maneuver, stationLL, geoNear:geo1, exportRoute, _routeExport, hasRoute };
  })();
};
