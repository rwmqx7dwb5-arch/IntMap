/* ============================================================================
 *  IntMap · ROUTE ANALYSIS — window.IntMapRoutingOps  (#R184)
 * ----------------------------------------------------------------------------
 *  「任意の経由地点追加 / 通過禁止範囲を地図で描画 / フェリー、鉄道、徒歩区間の個別除外 /
 *    標高差を加味 / 国境通過回数を表示 / ルート沿いの天候、災害、ニュース表示 /
 *    途中地点ごとの到着時刻 / 過去の道路・鉄道路線で経路計算 / 複数ルートの差を地図上で強調」
 *
 *  Three of those nine change how the ROUTE IS ASKED FOR, so they live in js/routing.js where the
 *  request is built (via points were already in the API and only needed a UI; a drawn area becomes
 *  Valhalla's `exclude_polygons`; excluding ferry/rail/walk becomes MOTIS's `transitModes` and its
 *  walk-time caps). The other six are questions ABOUT a route that already exists, and they are here.
 *
 *  ── EVERY ANSWER IS MEASURED, NOT ESTIMATED ─────────────────────────────────────────────────
 *  · ELEVATION — the same keyless terrarium DEM sampler the elevation profile and the drone planner
 *    use (HOST.warmDEMTiles + demElevBilinear). Ascent and descent are accumulated with a small
 *    hysteresis so DEM noise on a flat road does not manufacture 200 m of "climbing"; the threshold
 *    is stated rather than hidden, because a total that depends on an invisible constant is not a
 *    measurement.
 *  · BORDERS — the app's own country polygons (window.countryGeo, Natural Earth), point-in-polygon
 *    along the route. A crossing is a CHANGE in which polygon contains the line, so a road that runs
 *    along a border and re-enters is counted once per real transition, and the answer names the
 *    countries in order instead of just counting.
 *  · WEATHER / DISASTER / NEWS — the forecast comes from window.IntMapWx (one circuit breaker for the
 *    whole app, #R183) at points spaced along the route AND at the time the traveller is there, which
 *    is what makes it different from "the weather at the destination". Earthquakes are the live USGS
 *    feed; news is the geolocated set this session already has, so it costs nothing and can never
 *    disagree with the map.
 *  · ARRIVAL TIMES — from the route's own leg durations, offset from the departure time the panel is
 *    set to. With `arriveBy` the clock runs backwards from the deadline, which is the only reading
 *    that makes the numbers mean anything.
 *  · WHERE ALTERNATIVES DIFFER — a shared-prefix/suffix comparison on the geometry: what is drawn is
 *    the part that is NOT in common, so "these two are the same except through the town centre" is
 *    visible rather than something to be inferred from two overlapping lines.
 *
 *  ── ROUTING ON A HISTORICAL NETWORK ─────────────────────────────────────────────────────────
 *  There is no worldwide historical road/rail graph to route on, and inventing one would be exactly
 *  the fabrication standing instruction 4 forbids. What exists, worldwide and keyless, is
 *  OpenStreetMap's own record of WHEN things existed: `start_date`, `opening_date`, `end_date`, and
 *  the `abandoned:railway` / `disused:railway` / `razed:railway` / `historic:railway` namespaces that
 *  hold lines which are no longer there. So the historical mode fetches the ways in the corridor,
 *  keeps only those that existed in the chosen year, builds a graph from their real geometry and runs
 *  Dijkstra over it. The result is a route on the network as OSM records it for that year — which is
 *  a real answer with a real and stated limitation: OSM's date coverage is uneven, so the panel
 *  reports how many of the ways it used actually carried a date.
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.routingOps=function(HOST){
  const GE=()=>window.IntMapGeoEngine;
  const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
  const D2R=Math.PI/180, R_EARTH=6371008.8;
  function distM(a,b){ const la1=a[1]*D2R, la2=b[1]*D2R, dla=(b[1]-a[1])*D2R, dlo=(b[0]-a[0])*D2R;
    const h=Math.sin(dla/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dlo/2)**2;
    return 2*R_EARTH*Math.asin(Math.min(1,Math.sqrt(h))); }

  /* Resample a polyline to points ~stepM apart, keeping the along-track distance of each — every
     analysis below wants "every N metres along the route", never "every vertex" (a motorway has one
     vertex per kilometre and a roundabout has forty). */
  function resample(coords,stepM,maxN){
    if(!coords||coords.length<2) return [];
    const out=[]; let acc=0, carry=0;
    out.push({ lng:coords[0][0], lat:coords[0][1], d:0 });
    for(let i=1;i<coords.length;i++){
      const a=coords[i-1], b=coords[i], seg=distM(a,b);
      if(!(seg>0)) continue;
      let t=stepM-carry;
      while(t<=seg){ const f=t/seg;
        out.push({ lng:a[0]+(b[0]-a[0])*f, lat:a[1]+(b[1]-a[1])*f, d:acc+t });
        t+=stepM; }
      carry=(carry+seg)%stepM; acc+=seg;
    }
    out.push({ lng:coords[coords.length-1][0], lat:coords[coords.length-1][1], d:acc });
    if(maxN&&out.length>maxN){ const k=Math.ceil(out.length/maxN);
      return out.filter((_,i)=>i%k===0||i===out.length-1); }
    return out;
  }

  /* ══ ELEVATION ══════════════════════════════════════════════════════════════════════════════ */
  /* Below this, a change is DEM noise rather than a hill. Terrarium's vertical quantum is 0.1 m and
     bilinear sampling of a 30 m grid along a road wanders by a metre or two; accumulating every
     wiggle turns a flat 200 km motorway into 900 m of "climb". Stated, not hidden. */
  const CLIMB_NOISE_M=3;
  let lastElev=null;
  async function elevation(coords,opt){
    opt=opt||{};
    if(!coords||coords.length<2) return null;
    let total=0; for(let i=1;i<coords.length;i++) total+=distM(coords[i-1],coords[i]);
    const step=Math.max(25,Math.min(500,total/700));
    const pts=resample(coords,step,900);
    let z=12; try{ z=HOST._demZoomForSpan(Math.max(0.5,total/1000)); }catch(_){}
    try{ await HOST.warmDEMTiles(pts.map(p=>[p.lng,p.lat]),z,20000); }catch(_){}
    const gAt=(lng,lat)=>{ let v=null; try{ v=HOST.demElevBilinear(lng,lat,z); }catch(_){}
      if(v==null||!isFinite(v)){ try{ v=HOST.demElevAt(lng,lat,null,z); }catch(_){} }
      return (v==null||!isFinite(v))?null:+v; };
    let missing=0;
    pts.forEach(p=>{ const g=gAt(p.lng,p.lat); if(g==null) missing++; p.h=g; });
    const known=pts.filter(p=>p.h!=null);
    if(known.length<3) return (lastElev={ err:'nodem', samples:pts.length, missing });
    /* fill the gaps for the PROFILE only; a gap never votes on the totals */
    for(let i=0;i<pts.length;i++) if(pts[i].h==null){
      let lo=i-1; while(lo>=0&&pts[lo].h==null) lo--;
      let hi=i+1; while(hi<pts.length&&pts[hi].h==null) hi++;
      pts[i].h=(lo>=0&&hi<pts.length)?(pts[lo].h+(pts[hi].h-pts[lo].h)*((i-lo)/(hi-lo))):(lo>=0?pts[lo].h:pts[hi].h);
    }
    let up=0, down=0, ref=pts[0].h, maxGrade=0, maxGradeAt=0;
    for(let i=1;i<pts.length;i++){
      const dh=pts[i].h-ref;
      if(dh>=CLIMB_NOISE_M){ up+=dh; ref=pts[i].h; }
      else if(dh<=-CLIMB_NOISE_M){ down+=-dh; ref=pts[i].h; }
      const run=pts[i].d-pts[i-1].d;
      if(run>10){ const g=Math.abs((pts[i].h-pts[i-1].h)/run)*100;
        if(g>maxGrade&&g<40){ maxGrade=g; maxGradeAt=pts[i].d; } }
    }
    const hs=pts.map(p=>p.h);
    lastElev={ ascentM:up, descentM:down, minM:Math.min.apply(null,hs), maxM:Math.max.apply(null,hs),
      startM:pts[0].h, endM:pts[pts.length-1].h, netM:pts[pts.length-1].h-pts[0].h,
      maxGradePct:maxGrade, maxGradeAtM:maxGradeAt, samples:pts.length, missing, demZoom:z,
      noiseFloorM:CLIMB_NOISE_M, profile:pts.map(p=>[p.d,p.h]) };
    return lastElev;
  }

  /* ══ BORDER CROSSINGS ═══════════════════════════════════════════════════════════════════════ */
  function ptInRing(p,ring){ let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
      if(((yi>p[1])!==(yj>p[1]))&&(p[0]<(xj-xi)*(p[1]-yi)/((yj-yi)||1e-12)+xi)) inside=!inside; }
    return inside; }
  function ptInPoly(p,geom){
    if(!geom) return false;
    const polys=(geom.type==='Polygon')?[geom.coordinates]:(geom.type==='MultiPolygon'?geom.coordinates:[]);
    for(const poly of polys){
      if(!poly.length||!ptInRing(p,poly[0])) continue;
      let hole=false; for(let k=1;k<poly.length;k++) if(ptInRing(p,poly[k])){ hole=true; break; }
      if(!hole) return true; }
    return false; }
  function countryAt(lng,lat,feats){
    for(let i=0;i<feats.length;i++){
      const f=feats[i], b=f.bbox||f._bb;
      if(b&&(lng<b[0]||lng>b[2]||lat<b[1]||lat>b[3])) continue;
      if(ptInPoly([lng,lat],f.geometry)) return f;
    }
    return null; }
  let lastBorders=null;
  function borders(coords){
    const geo=window.countryGeo;
    if(!geo||!geo.features||!geo.features.length) return (lastBorders={ err:'nodata' });
    /* a cheap bbox per feature, computed once — point-in-polygon over 250 countries per sample is
       otherwise the slowest thing in this file by an order of magnitude */
    geo.features.forEach(f=>{ if(f._bb||!f.geometry) return;
      let n=-90,s=90,e=-180,w=180;
      const walk=(c)=>{ if(typeof c[0]==='number'){ if(c[0]<w)w=c[0]; if(c[0]>e)e=c[0]; if(c[1]<s)s=c[1]; if(c[1]>n)n=c[1]; return; } c.forEach(walk); };
      try{ walk(f.geometry.coordinates); f._bb=[w,s,e,n]; }catch(_){}
    });
    let total=0; for(let i=1;i<coords.length;i++) total+=distM(coords[i-1],coords[i]);
    const pts=resample(coords,Math.max(200,total/500),700);
    const nameOf=(f)=>{ const p=f&&f.properties||{};
      return String(p.NAME||p.name||p.ADMIN||p.NAME_EN||p.iso_a3||p.ISO_A3||'').trim(); };
    const seq=[]; let prev=null, prevKey=null;
    pts.forEach(p=>{
      const f=countryAt(p.lng,p.lat,geo.features);
      const key=f?nameOf(f):'';
      if(key!==prevKey){ seq.push({ name:key, atM:p.d, lng:p.lng, lat:p.lat }); prevKey=key; prev=f; }
    });
    /* an empty name is open sea or a gap in the polygons, not a country; it is not a crossing on its
       own, so a land→sea→land pair with the same country either side collapses back to nothing */
    const named=[]; seq.forEach(s=>{ if(!s.name) return;
      if(named.length&&named[named.length-1].name===s.name) return; named.push(s); });
    const crossings=[];
    for(let i=1;i<named.length;i++) crossings.push({ from:named[i-1].name, to:named[i].name,
      atM:named[i].atM, lng:named[i].lng, lat:named[i].lat });
    /* HOW LONG the route is in each country, which is the number that makes a crossing readable.
       It also exposes this analysis's real limitation: the polygons are the app's country outlines,
       simplified for drawing, so a road running a couple of hundred metres from a river border can
       be recorded on the wrong side of it. A 9 km transit is a transit; a 200 m one is the outline's
       resolution talking, and the length is what lets a reader tell them apart. */
    const legLen=[];
    for(let i=0;i<named.length;i++){
      const from=named[i].atM, to=(i+1<named.length)?named[i+1].atM:total;
      legLen.push({ name:named[i].name, m:Math.max(0,to-from) });
    }
    lastBorders={ countries:named.map(s=>s.name), crossings, count:crossings.length,
      segments:legLen, samples:pts.length, sampleStepM:Math.round(total/Math.max(1,pts.length-1)),
      totalM:total };
    return lastBorders;
  }

  /* ══ ALONG THE ROUTE: WEATHER · DISASTER · NEWS ═════════════════════════════════════════════ */
  let lastAlong=null;
  async function along(coords,opt){
    opt=opt||{};
    const durationS=+opt.durationS||0, departMs=+opt.departMs||Date.now();
    let total=0; for(let i=1;i<coords.length;i++) total+=distM(coords[i-1],coords[i]);
    /* six probes is enough to see a front cross a 500 km drive and few enough to be one request each
       through the shared, rate-limited weather client */
    const N=Math.max(2,Math.min(6,Math.round(total/60000)+2));
    const probes=[];
    for(let k=0;k<N;k++){
      const f=k/(N-1), want=total*f;
      let acc=0, p=coords[0];
      for(let i=1;i<coords.length;i++){ const seg=distM(coords[i-1],coords[i]);
        if(acc+seg>=want){ const t=(want-acc)/(seg||1);
          p=[coords[i-1][0]+(coords[i][0]-coords[i-1][0])*t, coords[i-1][1]+(coords[i][1]-coords[i-1][1])*t]; break; }
        acc+=seg; p=coords[i]; }
      probes.push({ lng:p[0], lat:p[1], atM:want, etaMs:departMs+durationS*1000*f });
    }
    /* WEATHER — sequential, through the app's one guarded client */
    const WX=window.IntMapWx;
    for(const pr of probes){
      if(!WX||!WX.point){ pr.wx=null; continue; }
      try{
        const j=await WX.point(pr.lat,pr.lng,{days:2,uv:false});
        const cur=j&&j.current;
        pr.wx=cur?{ tempC:cur.temperature_2m, code:cur.weather_code,
          windKmh:cur.wind_speed_10m, precip:cur.precipitation, src:j._src||null }:null;
      }catch(_){ pr.wx=null; }
    }
    /* DISASTER — the live USGS feed, filtered to what is actually near the line */
    let quakes=[];
    try{
      const r=await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',{cache:'no-store'});
      if(r.ok){ const j=await r.json();
        (j.features||[]).forEach(f=>{ const c=f.geometry&&f.geometry.coordinates; if(!c) return;
          let best=Infinity, at=0;
          probes.forEach(pr=>{ const d=distM([c[0],c[1]],[pr.lng,pr.lat]); if(d<best){ best=d; at=pr.atM; } });
          if(best<=250000) quakes.push({ mag:f.properties&&f.properties.mag, place:f.properties&&f.properties.place,
            time:f.properties&&f.properties.time, lng:c[0], lat:c[1], km:best/1000, atM:at }); });
        quakes.sort((a,b)=>(b.mag||0)-(a.mag||0)); quakes=quakes.slice(0,6); }
    }catch(_){}
    /* NEWS — what this session already has, geolocated. No request, and it cannot disagree with the
       pins on the map because it IS the pins on the map. */
    let news=[];
    try{
      const feats=HOST.newsFeatures||[];
      feats.forEach(f=>{ const c=f.geometry&&f.geometry.coordinates; if(!c) return;
        let best=Infinity, at=0;
        probes.forEach(pr=>{ const d=distM([c[0],c[1]],[pr.lng,pr.lat]); if(d<best){ best=d; at=pr.atM; } });
        if(best<=60000){ const p=f.properties||{};
          news.push({ title:String(p.title||p.headline||'').slice(0,140), url:p.url||p.link||'',
            source:p.source||'', km:best/1000, atM:at }); } });
      news.sort((a,b)=>a.km-b.km); news=news.slice(0,8);
    }catch(_){}
    lastAlong={ probes, quakes, news, totalM:total, departMs, durationS };
    return lastAlong;
  }

  /* ══ ARRIVAL TIME AT EVERY POINT ON THE WAY ═════════════════════════════════════════════════ */
  /* From the route's own leg durations. With `arriveBy` the clock runs BACKWARDS from the deadline —
     the same number read forwards from "now" would be a different journey. */
  function schedule(legDurations,opt){
    opt=opt||{};
    const durs=(legDurations||[]).map(d=>Math.max(0,+d||0));
    const total=durs.reduce((a,b)=>a+b,0);
    const t0=opt.arriveBy ? ((+opt.timeMs||Date.now())-total*1000) : (+opt.timeMs||Date.now());
    const out=[{ i:0, tMs:t0, cumS:0 }];
    let acc=0;
    durs.forEach((d,i)=>{ acc+=d; out.push({ i:i+1, tMs:t0+acc*1000, cumS:acc }); });
    return { departMs:t0, arriveMs:t0+total*1000, totalS:total, points:out, arriveBy:!!opt.arriveBy };
  }

  /* ══ WHERE TWO ROUTES DIFFER ════════════════════════════════════════════════════════════════ */
  const DIFF_SRC='imroute-diff-src', DIFF_LYR='imroute-diff';
  const SAME_M=60;                   /* two lines closer than this are "the same road" */
  function nearAny(p,coords,fromIdx){
    for(let i=Math.max(0,fromIdx-40);i<coords.length;i++){
      if(distM(p,coords[i])<=SAME_M) return i; }
    return -1; }
  /* The part of A that is NOT on B, as one or more sub-lines. Walked forwards with a moving cursor
     into B so a route that doubles back does not match its own earlier half. */
  function uniqueOf(a,b){
    const segs=[]; let cur=[], cursor=0;
    for(let i=0;i<a.length;i++){
      const hit=nearAny(a[i],b,cursor);
      if(hit>=0){ cursor=hit; if(cur.length>1) segs.push(cur); cur=[]; }
      else cur.push(a[i]);
    }
    if(cur.length>1) segs.push(cur);
    return segs; }
  function ensureDiffLayers(){ const E=GE(); if(!E||!E.canDraw()) return false;
    try{
      if(!E.layers.hasSource(DIFF_SRC)) E.layers.addSource(DIFF_SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!E.layers.has(DIFF_LYR)) E.layers.add({ id:DIFF_LYR, type:'line', source:DIFF_SRC,
        layout:{ 'line-cap':'round','line-join':'round' },
        paint:{ 'line-color':['coalesce',['get','col'],'#ff9f0a'], 'line-width':9, 'line-opacity':0.35, 'line-blur':2 } });
      return true;
    }catch(_){ return false; } }
  let lastDiff=null;
  function highlightDifferences(alts){
    if(!Array.isArray(alts)||alts.length<2){ clearDifferences(); return (lastDiff={ n:0 }); }
    const geom=alts.map(a=>a.coords||(a.lines&&a.lines[0]&&a.lines[0].coords)||[]);
    const base=geom[0];
    const feats=[]; const per=[];
    for(let i=0;i<geom.length;i++){
      const other=(i===0)?geom[1]:base;
      const segs=uniqueOf(geom[i],other);
      let m=0; segs.forEach(s=>{ for(let k=1;k<s.length;k++) m+=distM(s[k-1],s[k]); });
      per.push({ i, segments:segs.length, uniqueM:m, color:alts[i].color||'#ff9f0a' });
      segs.forEach(s=>feats.push({ type:'Feature', geometry:{ type:'LineString', coordinates:s },
        properties:{ col:alts[i].color||'#ff9f0a', alt:i } }));
    }
    if(!ensureDiffLayers()) return (lastDiff={ n:feats.length, drawn:false, per });
    try{ GE().layers.setSourceData(DIFF_SRC,{type:'FeatureCollection',features:feats});
      GE().layers.setVisible(DIFF_LYR,true); }catch(_){}
    lastDiff={ n:feats.length, drawn:true, per, sameThresholdM:SAME_M };
    return lastDiff; }
  function clearDifferences(){
    try{ const E=GE(); if(E.layers.has(DIFF_LYR)) E.layers.setVisible(DIFF_LYR,false); }catch(_){}
    lastDiff=null; return true; }

  /* ══ ROUTING ON A HISTORICAL NETWORK ════════════════════════════════════════════════════════ */
  const OVERPASS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
  function overpass(q,i){ i=i||0;
    if(i>=OVERPASS.length) return Promise.reject(new Error('overpass'));
    return fetch(OVERPASS[i],{ method:'POST', body:'data='+encodeURIComponent(q) })
      .then(r=>{ if(!r.ok) throw new Error('status '+r.status); return r.json(); })
      .catch(()=>overpass(q,i+1)); }
  /* OSM writes dates in a lot of shapes: "1889", "1889-06", "1889-06-15", "C19", "~1890", "1889..1892".
     A YEAR is the only part this needs, and a value it cannot read is treated as UNKNOWN rather than
     as a pass or a fail — an unknown date is exactly what "we do not know" means. */
  function osmYear(v){
    if(v==null) return null;
    const s=String(v);
    const m=/(-?\d{3,4})/.exec(s);
    if(!m) return null;
    const y=+m[1];
    return (isFinite(y)&&y>-4000&&y<3000)?y:null; }
  function existedIn(tags,year){
    const start=osmYear(tags.start_date||tags['start_date:railway']||tags.opening_date||tags.opened);
    const end=osmYear(tags.end_date||tags.closed||tags.demolished||tags['demolished:railway']);
    if(start!=null&&year<start) return false;
    if(end!=null&&year>end) return false;
    /* a line recorded ONLY in the abandoned/razed namespaces is not there now; without an end date
       the honest reading is that it existed earlier and no longer does */
    return { known:(start!=null||end!=null), start, end };
  }
  let lastHist=null;
  async function historicalRoute(from,to,opt){
    opt=opt||{};
    const year=Math.round(+opt.year||1900);
    const kind=(String(opt.kind||'rail').toLowerCase()==='road')?'road':'rail';
    const a=[+from.lng,+from.lat], b=[+to.lng,+to.lat];
    const span=distM(a,b);
    if(!(span>0)) return (lastHist={ err:'same' });
    if(span>400000) return (lastHist={ err:'too-far', km:Math.round(span/1000), maxKm:400 });
    /* A corridor around the straight line: wide enough for a real detour, narrow enough to be ONE
       Overpass request. The first cut of this scaled the padding with the span and reached 1.2° for a
       130 km journey — ±130 km of padding, i.e. the whole of southern England, which took minutes to
       fetch. A historical line that wanders more than ~40 km off the direct route is rare; a query
       that never returns is not a feature. */
    const pad=Math.max(0.12,Math.min(0.35,span/1000/400));
    const s=Math.min(a[1],b[1])-pad, n=Math.max(a[1],b[1])+pad;
    const w=Math.min(a[0],b[0])-pad, e=Math.max(a[0],b[0])+pad;
    const bb=s.toFixed(4)+','+w.toFixed(4)+','+n.toFixed(4)+','+e.toFixed(4);
    /* OSM records a line that is gone in TWO different ways and both have to be asked for: as a VALUE
       (`railway=abandoned` / `disused` / `razed` / `dismantled`) and as a NAMESPACE PREFIX
       (`abandoned:railway=rail`). Asking only for the prefix form misses most of a country's closed
       network — the Oxford–Cambridge Varsity Line came back "disconnected" for 1950 for exactly that
       reason, because its formation is tagged with the value form. */
    const sel=kind==='rail'
      ? ['way["railway"~"^(rail|light_rail|narrow_gauge|subway|tram|abandoned|disused|razed|dismantled)$"]('+bb+');',
         'way["abandoned:railway"]('+bb+');','way["disused:railway"]('+bb+');',
         'way["razed:railway"]('+bb+');','way["historic:railway"]('+bb+');',
         'way["demolished:railway"]('+bb+');'].join('')
      : ['way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|track)$"]('+bb+');',
         'way["abandoned:highway"]('+bb+');','way["disused:highway"]('+bb+');',
         'way["razed:highway"]('+bb+');','way["historic"="road"]('+bb+');'].join('');
    const q='[out:json][timeout:60];('+sel+');out geom 6000;';
    let els=null;
    try{ const j=await overpass(q); els=j.elements||[]; }
    catch(e){ return (lastHist={ err:'overpass', msg:String(e&&e.message||e) }); }
    /* Keep the ways that existed in `year`. THREE kinds of evidence, counted separately, because the
       difference between them is the difference between a record and an assumption and the panel has
       to be able to say which it used:
         · DATED     — OSM carries a start and/or an end date, and the year is inside it. A record.
         · STILL THERE, UNDATED — the line is on the map today with no date. Assumed to have existed
           in the requested year only back to 1900; before that, most of today's network did not
           exist and carrying it back would invent a Victorian motorway network.
         · GONE, UNDATED — recorded as abandoned/disused/razed with no end date. It is not there NOW,
           so it is offered only for a year in the past, never for the present. */
    const NOW_Y=new Date().getUTCFullYear();
    const ways=[]; let dated=0, assumedLive=0, assumedGone=0;
    els.forEach(el=>{
      if(!el.geometry||el.geometry.length<2) return;
      const tg=el.tags||{};
      /* "no longer there", in either of the two forms OSM uses */
      const gone=/^(abandoned|disused|razed|dismantled)$/.test(String(tg.railway||tg.highway||''))
        || Object.keys(tg).some(k=>/^(abandoned|disused|razed|demolished|historic):/.test(k));
      const ex=existedIn(tg,year);
      if(ex===false) return;
      if(ex.known) dated++;
      else if(gone){ if(year>=NOW_Y) return; assumedGone++; }
      else { if(year<1900) return; assumedLive++; }
      ways.push({ id:el.id, tags:tg, geom:el.geometry.map(g=>[g.lon,g.lat]), gone,
        start:ex.start, end:ex.end, dated:!!ex.known });
    });
    if(ways.length<2) return (lastHist={ err:'empty', year, kind, fetched:els.length });
    /* ---- the graph. Nodes are snapped to a grid so ways that share an endpoint really join. */
    const CELL=0.00025;                       /* ~28 m — finer than any real junction offset */
    const key=(p)=>Math.round(p[1]/CELL)+'_'+Math.round(p[0]/CELL);
    const nodes=new Map(), adj=new Map();
    const nodeAt=(p)=>{ const k=key(p); let id=nodes.get(k);
      if(id==null){ id=nodes.size; nodes.set(k,id); adj.set(id,[]); nodes.set(id,p); } return id; };
    /* `nodes` holds both k→id and id→point; the two key spaces cannot collide (string vs number) */
    ways.forEach(wy=>{
      for(let i=1;i<wy.geom.length;i++){
        const u=nodeAt(wy.geom[i-1]), v=nodeAt(wy.geom[i]);
        if(u===v) continue;
        const d=distM(wy.geom[i-1],wy.geom[i]);
        adj.get(u).push({ to:v, d, way:wy.id }); adj.get(v).push({ to:u, d, way:wy.id });
      }
    });
    const pointOf=(id)=>nodes.get(id);
    /* Snap the endpoints to the nearest graph node. A linear scan over every node is O(N) per snap
       and N is a quarter of a million for a national rail corridor, so the nodes are bucketed by the
       same grid the keys already use and the search widens ring by ring until it finds one. */
    const buckets=new Map();
    for(const [k,v] of nodes){ if(typeof k!=='number') continue;
      const bk=Math.round(v[1]/0.02)+'_'+Math.round(v[0]/0.02);
      let arr=buckets.get(bk); if(!arr) buckets.set(bk,arr=[]); arr.push(k); }
    const snap=(p)=>{ const by=Math.round(p[1]/0.02), bx=Math.round(p[0]/0.02);
      let best=-1, bd=Infinity;
      for(let r=0;r<=12&&best<0;r++){
        for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){
          if(r&&Math.abs(dy)!==r&&Math.abs(dx)!==r) continue;      /* only the new ring */
          const arr=buckets.get((by+dy)+'_'+(bx+dx)); if(!arr) continue;
          for(const id of arr){ const d=distM(p,pointOf(id)); if(d<bd){ bd=d; best=id; } }
        }
        /* one more ring after the first hit, so a node just over a bucket edge still wins */
        if(best>=0&&r<12){ for(let dy=-(r+1);dy<=r+1;dy++) for(let dx=-(r+1);dx<=r+1;dx++){
            if(Math.abs(dy)!==r+1&&Math.abs(dx)!==r+1) continue;
            const arr=buckets.get((by+dy)+'_'+(bx+dx)); if(!arr) continue;
            for(const id of arr){ const d=distM(p,pointOf(id)); if(d<bd){ bd=d; best=id; } } } }
      }
      return { id:best, d:bd }; };
    const S=snap(a), T=snap(b);
    if(S.id<0||T.id<0) return (lastHist={ err:'empty', year, kind });
    if(S.d>20000||T.d>20000) return (lastHist={ err:'no-network', year, kind,
      snapKm:Math.round(Math.max(S.d,T.d)/1000) });
    /* ---- Dijkstra, on a real binary heap ----
       The obvious "scan the array for the smallest" queue is O(V²), which on a 250,000-node corridor
       is 6×10^10 comparisons — it does not finish. A binary heap makes the same search O(E log V),
       which is about 10^7 and runs in a fraction of a second. */
    const dist=new Map(), prev=new Map(), done=new Set();
    dist.set(S.id,0);
    const hd=[0], hn=[S.id];                     /* parallel arrays: distance, node */
    const push=(d,n)=>{ let i=hd.length; hd.push(d); hn.push(n);
      while(i>0){ const p2=(i-1)>>1; if(hd[p2]<=hd[i]) break;
        const td=hd[p2]; hd[p2]=hd[i]; hd[i]=td; const tn=hn[p2]; hn[p2]=hn[i]; hn[i]=tn; i=p2; } };
    const pop=()=>{ const rd=hd[0], rn=hn[0], last=hd.length-1;
      hd[0]=hd[last]; hn[0]=hn[last]; hd.pop(); hn.pop();
      let i=0, n2=hd.length;
      for(;;){ const l=2*i+1, r=l+1; let m=i;
        if(l<n2&&hd[l]<hd[m]) m=l; if(r<n2&&hd[r]<hd[m]) m=r;
        if(m===i) break;
        const td=hd[m]; hd[m]=hd[i]; hd[i]=td; const tn=hn[m]; hn[m]=hn[i]; hn[i]=tn; i=m; }
      return [rd,rn]; };
    let found=false, guard=0;
    while(hd.length&&guard++<3000000){
      const [d0,u]=pop();
      if(done.has(u)) continue; done.add(u);
      if(u===T.id){ found=true; break; }
      const es=adj.get(u)||[];
      for(const e of es){
        if(done.has(e.to)) continue;
        const nd=d0+e.d;
        if(nd<(dist.has(e.to)?dist.get(e.to):Infinity)){ dist.set(e.to,nd); prev.set(e.to,u); push(nd,e.to); }
      }
    }
    if(!found) return (lastHist={ err:'disconnected', year, kind, nodes:nodes.size/2, ways:ways.length });
    const path=[]; let cur=T.id;
    while(cur!=null){ path.push(pointOf(cur)); cur=prev.has(cur)?prev.get(cur):null; }
    path.reverse();
    let len=0; for(let i=1;i<path.length;i++) len+=distM(path[i-1],path[i]);
    /* WHICH of the three kinds the ANSWER actually rides on. "3 % of the corridor is dated" is a much
       weaker statement than "the route itself runs on dated line", and only the second is about the
       route the user is looking at. Attribution is by proximity to the path, which is what the graph
       lost when it flattened ways into edges. */
    let onDated=0, onAssumedGone=0, onAssumedLive=0, checked=0;
    const near=(p,g)=>{ for(let i=0;i<g.length;i++) if(distM(p,g[i])<40) return true; return false; };
    for(let i=1;i<path.length;i+=Math.max(1,Math.round(path.length/60))){
      checked++;
      const w2=ways.find(wy=>near(path[i],wy.geom));
      if(!w2) continue;
      if(w2.dated) onDated++; else if(w2.gone) onAssumedGone++; else onAssumedLive++;
    }
    lastHist={ year, kind, coords:path, lengthM:len, nodes:nodes.size/2, ways:ways.length,
      dated, assumedLive, assumedGone, snapFromM:S.d, snapToM:T.d, fetched:els.length,
      datedPct:ways.length?Math.round(100*dated/ways.length):0,
      onRoute:{ checked, dated:onDated, assumedGone:onAssumedGone, assumedLive:onAssumedLive },
      onRouteDatedPct:checked?Math.round(100*onDated/checked):0,
      nowYear:NOW_Y };
    return lastHist;
  }
  /* Draw a historical route on the same source the live router uses, so it is styled and cleared the
     same way and cannot end up as a second orphaned line. */
  const HIST_SRC='imroute-hist-src', HIST_LYR='imroute-hist';
  function drawHistorical(res){
    const E=GE(); if(!E||!E.canDraw()||!res||!res.coords) return false;
    try{
      if(!E.layers.hasSource(HIST_SRC)) E.layers.addSource(HIST_SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!E.layers.has(HIST_LYR)) E.layers.add({ id:HIST_LYR, type:'line', source:HIST_SRC,
        layout:{ 'line-cap':'round','line-join':'round' },
        paint:{ 'line-color':'#c9a227','line-width':4.5,'line-opacity':0.95,'line-dasharray':[3,1.4] } });
      E.layers.setSourceData(HIST_SRC,{ type:'FeatureCollection', features:[
        { type:'Feature', geometry:{ type:'LineString', coordinates:res.coords }, properties:{ year:res.year } }] });
      E.layers.setVisible(HIST_LYR,true);
      const lngs=res.coords.map(c=>c[0]), lats=res.coords.map(c=>c[1]);
      E.camera.fitBounds([[Math.min.apply(null,lngs),Math.min.apply(null,lats)],
        [Math.max.apply(null,lngs),Math.max.apply(null,lats)]],{padding:70,maxZoom:13,duration:900});
      return true;
    }catch(_){ return false; }
  }
  function clearHistorical(){ try{ const E=GE(); if(E.layers.has(HIST_LYR)) E.layers.setVisible(HIST_LYR,false); }catch(_){} return true; }

  const API={
    elevation, borders, along, schedule,
    highlightDifferences, clearDifferences,
    historicalRoute, drawHistorical, clearHistorical,
    lastElevation:()=>lastElev&&Object.assign({},lastElev),
    lastBorders:()=>lastBorders&&Object.assign({},lastBorders),
    lastAlong:()=>lastAlong&&Object.assign({},lastAlong),
    lastDifferences:()=>lastDiff&&Object.assign({},lastDiff),
    lastHistorical:()=>lastHist&&Object.assign({},lastHist),
    state:()=>({ elevation:lastElev&&{ ascentM:lastElev.ascentM, descentM:lastElev.descentM, maxGradePct:lastElev.maxGradePct, samples:lastElev.samples, missing:lastElev.missing, err:lastElev.err },
      borders:lastBorders&&{ count:lastBorders.count, countries:lastBorders.countries, err:lastBorders.err },
      along:lastAlong&&{ probes:lastAlong.probes.length, quakes:lastAlong.quakes.length, news:lastAlong.news.length },
      differences:lastDiff, historical:lastHist&&{ year:lastHist.year, kind:lastHist.kind, lengthM:lastHist.lengthM, ways:lastHist.ways, datedPct:lastHist.datedPct, err:lastHist.err } }),
    /* the pure parts, exported so they can be tested without a map or a network */
    _math:{ distM, resample, ptInPoly, uniqueOf, osmYear, existedIn, CLIMB_NOISE_M, SAME_M }
  };
  window.IntMapRoutingOps=API;
  return API;
};
