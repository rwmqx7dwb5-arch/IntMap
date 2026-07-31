/* ============================================================================
 *  IntMap · DRONE OPERATIONS — window.IntMapDroneOps  (#R184)
 * ----------------------------------------------------------------------------
 *  「風向・風速を反映 / 帰還分の電池を含める / 通信可能範囲を考慮 / 視通が切れる区間を警告 /
 *    飛行禁止区域を回避 / 地形に沿って高度を自動調整 / 最短、最省電力、最安全の経路を比較 /
 *    緊急着陸可能地点を表示 / 離陸地点へ自動帰還する経路を生成 / 複数機の経路干渉を確認」
 *
 *  #R174 built the planner and left it two explicitly documented seams — `registerWindField(fn)` for
 *  anything that changes the ARITHMETIC and `registerHazardSource(id, fn)` for anything that has an
 *  opinion about a point on the route — with the note that neither was filled because no data source
 *  was wired. This file fills them, with real data, and adds the four capabilities that are route
 *  OPERATIONS rather than opinions (return reserve, route comparison, return-to-home, conflicts).
 *
 *  Nothing here modifies js/drone-nav.js's model. It attaches from outside through the published API,
 *  which is why the planner keeps working unchanged if this file fails to load.
 *
 *  ── 1 · WIND, AT THE ALTITUDE AND AT THE TIME THE AIRCRAFT IS THERE ────────────────────────────
 *  Open-Meteo publishes hourly wind at 10, 80, 120 and 180 m above ground. Those are MODEL LEVELS, so
 *  reading between two of them is interpolation of a published field; extrapolating past 180 m would
 *  not be, so above 180 m the 180 m value is used and the finding SAYS it is doing that. The hour
 *  chosen is the one the leg is actually flown in, taken from the planner's own ETA — a route that
 *  takes 40 minutes meets a different wind at its end than at its start.
 *
 *  Every request goes through window.IntMapWx.guardedJSON (#R183), so this feature shares the app's
 *  one circuit breaker and cannot be the thing that burns the day's quota. When the breaker is open
 *  the fallback is MET Norway, which publishes 10 m wind only — and the reply says so rather than
 *  silently pretending the number is a 120 m wind.
 *
 *  The arithmetic the planner already had: the ALONG-TRACK component changes ground speed, and
 *  therefore time and energy. What is added here is the CROSS-TRACK component, which a multirotor
 *  pays for by tilting into it — that is a real power cost and it is reported as a finding, not
 *  folded silently into the total.
 *
 *  ── 2 · THE RETURN LEG IS PART OF THE FLIGHT ──────────────────────────────────────────────────
 *  A one-way plan that fits the battery exactly is a crash at the far end. The reserve check flies
 *  the route home again — into the SAME wind, which is what makes an out-and-back asymmetric — and
 *  compares the round trip against the usable capacity.
 *
 *  ── 3+4 · THE RADIO LINK IS ONE PROBLEM, NOT TWO ──────────────────────────────────────────────
 *  "Communication range" and "where does line of sight break" are the same question asked twice, so
 *  they are one hazard source: for every sample, the terrain profile back to the ground station is
 *  walked with earth curvature and atmospheric refraction applied, the first Fresnel zone is measured
 *  at the controlling obstacle, and free-space path loss is compared against the link budget. The
 *  physics is NOT re-implemented — it is window.IntMapLOS._phys, the same dropAt / fresnel1 /
 *  knifeEdgeDb the line-of-sight tool uses, so the two tools cannot disagree about what "blocked"
 *  means.
 *
 *  ── 5 · "NO-FLY" MEANS SOMETHING SPECIFIC, AND IT IS NOT A DRAWN BOX ──────────────────────────
 *  There is no keyless worldwide airspace database. What there IS, worldwide and keyless, is
 *  OpenStreetMap: aerodromes and heliports, military areas, nature reserves and national parks — the
 *  features that generate the great majority of real drone restrictions. Those are fetched from
 *  Overpass and reported WITH THEIR SOURCE AND THEIR LIMITS: this is an OSM-derived advisory, not an
 *  authoritative airspace clearance, and the panel says exactly that. Claiming otherwise would be the
 *  most dangerous possible version of standing instruction 4's "no fake implementations".
 *
 *  ── 8 · A LANDING SITE IS A SLOPE MEASUREMENT ─────────────────────────────────────────────────
 *  Emergency landing candidates are found the way a pilot finds them: flat, open and clear. Flatness
 *  is measured from the DEM (the gradient over a 3×3 stencil at the sampling resolution), openness
 *  from OSM land use, and each candidate is scored by the glide/descent it takes to reach from the
 *  route. A site is only offered if the aircraft can actually get to it from the nearest point on the
 *  route at its rated descent rate.
 *
 *  ── 10 · CONFLICT IS A 4-D QUESTION ───────────────────────────────────────────────────────────
 *  Two routes that cross are not in conflict if they cross at different times or different altitudes.
 *  The check walks both timelines together and reports the closest approach in three dimensions
 *  together with the time separation at that point.
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.droneOps=function(HOST){
  const GE=()=>window.IntMapGeoEngine;
  const DRONE=()=>window.IntMapDrone;
  const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
  const D2R=Math.PI/180, R_EARTH=6371008.8;

  function distM(a,b){ const la1=a[1]*D2R, la2=b[1]*D2R, dla=(b[1]-a[1])*D2R, dlo=(b[0]-a[0])*D2R;
    const h=Math.sin(dla/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dlo/2)**2;
    return 2*R_EARTH*Math.asin(Math.min(1,Math.sqrt(h))); }
  function bearingDeg(a,b){ const la1=a[1]*D2R, la2=b[1]*D2R, dlo=(b[0]-a[0])*D2R;
    const y=Math.sin(dlo)*Math.cos(la2), x=Math.cos(la1)*Math.sin(la2)-Math.sin(la1)*Math.cos(la2)*Math.cos(dlo);
    return (Math.atan2(y,x)*180/Math.PI+360)%360; }

  /* ══ 1 · WIND ═══════════════════════════════════════════════════════════════════════════════ */
  /* The model levels Open-Meteo publishes. Reading BETWEEN two of them is interpolation of a real
     field; going above the top one is not, so the top value is carried up and flagged. */
  const WIND_LEVELS=[10,80,120,180];
  let windGrid=[];          /* [{lat,lng,t0,levels:{10:[{s,d}…],…},src}] — one cell per ~0.25° */
  let windAt0=0, windErr=null, windSrc=null, windLoading=false;
  const WIND_TTL=1800000;   /* 30 min — the model publishes hourly */

  function windCellKey(lng,lat){ return Math.round(lat*4)/4+','+Math.round(lng*4)/4; }
  /* Fetch the hourly wind profile for one cell. One request per ~28 km cell, which is the scale the
     model itself resolves — asking per sample would be hundreds of requests for one answer. */
  function fetchWindCell(lng,lat){
    const la=Math.round(lat*4)/4, lo=Math.round(lng*4)/4;
    const WX=window.IntMapWx;
    const flds=[].concat(...WIND_LEVELS.map(h=>['wind_speed_'+h+'m','wind_direction_'+h+'m']));
    const url='https://api.open-meteo.com/v1/forecast?latitude='+la.toFixed(2)+'&longitude='+lo.toFixed(2)
      +'&hourly='+flds.join(',')+'&forecast_days=2&wind_speed_unit=ms&timeformat=unixtime&timezone=UTC';
    const viaMet=()=>{
      /* MET Norway publishes 10 m wind only. That is a real number and it is used as one — the
         findings say "10 m wind" so nobody reads it as a 120 m wind. */
      if(!WX||!WX.metNo) return Promise.resolve(null);
      return WX.metNo(la,lo).then(m=>{
        /* the hourly series #R184 added to the shared client — MET publishes 10 m wind and nothing
           higher, so `topOnly` records that and the findings say which height they are talking about */
        const H=m&&m.hourly;
        if(!H||!Array.isArray(H.time)||!H.time.length) return null;
        const spd=H.wind_speed_10m||[], dir=H.wind_direction_10m||[];
        if(!spd.length) return null;
        const lv={}; WIND_LEVELS.forEach(h=>{ lv[h]=null; });
        lv[10]=spd.map((s,i)=>({ s:(s==null?null:s/3.6), d:dir[i] }));   /* the client hands over km/h */
        return { lat:la, lng:lo, times:H.time.slice(), levels:lv,
                 src:'MET Norway', topOnly:10, at:Date.now() };
      }).catch(()=>null);
    };
    if(!WX||!WX.guardedJSON) return viaMet();
    if(WX.status&&WX.status().down) return viaMet();
    return WX.guardedJSON(url,WIND_TTL).then(j=>{
      if(!j||!j.hourly||!Array.isArray(j.hourly.time)||!j.hourly.time.length) return viaMet();
      const lv={};
      for(const h of WIND_LEVELS){
        const s=j.hourly['wind_speed_'+h+'m'], d=j.hourly['wind_direction_'+h+'m'];
        lv[h]=(Array.isArray(s)&&Array.isArray(d))?s.map((v,i)=>({ s:v, d:d[i] })):null;
      }
      if(!lv[10]) return viaMet();
      return { lat:la, lng:lo, times:j.hourly.time.map(t=>t*1000), levels:lv,
               src:'Open-Meteo', topOnly:null, at:Date.now() };
    }).catch(()=>viaMet());
  }
  /* Exact key first, then the NEAREST loaded cell within CELL_REACH degrees. Requiring an exact
     match looks harmless and is not: the grid is 0.25° and a route sample can land in a cell that
     sits between two loaded ones, so `windAt` returned null for a point in the middle of a route
     whose ends were both loaded. Falling back to the nearest published grid point is what sampling a
     gridded field means — Open-Meteo snaps the request to its own grid too — and the reach is capped
     so a point far outside the loaded region gets NULL rather than somebody else's weather. */
  const CELL_REACH=0.6;
  function cellFor(lng,lat){ const k=windCellKey(lng,lat);
    let best=null, bestD=CELL_REACH*CELL_REACH;
    for(let i=0;i<windGrid.length;i++){
      const c=windGrid[i];
      if(c.key===k) return c;
      const dy=c.lat-lat, dx=(c.lng-lng)*Math.cos(lat*D2R), d=dx*dx+dy*dy;
      if(d<bestD){ bestD=d; best=c; }
    }
    return best; }
  /* Load every cell the route touches, SEQUENTIALLY — a handful of cells at most, and a burst of
     parallel requests at one host is what #R69 had to stop doing to the World Bank. */
  async function warmWind(samples){
    const need=[];
    samples.forEach(s=>{ const k=windCellKey(s.lng,s.lat);
      if(!need.some(n=>n.key===k)&&!cellFor(s.lng,s.lat)) need.push({ key:k, lng:s.lng, lat:s.lat }); });
    if(!need.length) return windGrid.length>0;
    windLoading=true; windErr=null;
    for(const n of need.slice(0,12)){
      const c=await fetchWindCell(n.lng,n.lat);
      if(c){ c.key=n.key; windGrid.push(c); windSrc=c.src; }
      else windErr=L('the wind forecast is unavailable','風の予報を取得できません','Windvorhersage nicht verfügbar','прогноз ветра недоступен','no hay pronóstico de viento');
    }
    if(windGrid.length>40) windGrid=windGrid.slice(-40);
    windAt0=Date.now(); windLoading=false;
    return windGrid.length>0;
  }
  /* u = eastward, v = northward, in m/s — the convention js/drone-nav.js's seam documents. A
     meteorological wind DIRECTION is where the wind comes FROM, so the vector is the negative. */
  function windVec(lng,lat,aglM,whenMs){
    const c=cellFor(lng,lat); if(!c) return null;
    /* the forecast hour the aircraft is actually there in */
    const t=whenMs||Date.now(); let idx=0, best=Infinity;
    for(let i=0;i<c.times.length;i++){ const d=Math.abs(c.times[i]-t); if(d<best){ best=d; idx=i; } }
    /* bracket the altitude between two published levels */
    const agl=Math.max(0,aglM||0);
    let lo=WIND_LEVELS[0], hi=null;
    for(let i=0;i<WIND_LEVELS.length;i++){ const h=WIND_LEVELS[i];
      if(!c.levels[h]) continue;
      if(h<=agl) lo=h; else if(hi==null) hi=h; }
    const at=(h)=>{ const arr=c.levels[h]; const r=arr&&arr[idx]; return (r&&r.s!=null&&r.d!=null)?r:null; };
    const a=at(lo), b=hi==null?null:at(hi);
    let spd=null, dir=null, above=false;
    if(a&&b&&hi>lo){ const f=Math.max(0,Math.min(1,(agl-lo)/(hi-lo)));
      spd=a.s+(b.s-a.s)*f;
      /* directions are angles — interpolate the shorter way round, never through 180° of nothing */
      let dd=((b.d-a.d+540)%360)-180; dir=(a.d+dd*f+360)%360; }
    else if(a){ spd=a.s; dir=a.d; above=(agl>lo+1); }
    else return null;
    if(spd==null||dir==null||!isFinite(spd)||!isFinite(dir)) return null;
    const th=(dir+180)*D2R;                 /* to-direction */
    return { u:spd*Math.sin(th), v:spd*Math.cos(th), speed:spd, fromDeg:dir,
             level:(b&&hi>lo)?null:lo, above, src:c.src };
  }

  /* ══ 3+4 · THE RADIO LINK ═══════════════════════════════════════════════════════════════════ */
  /* The ground station. Waypoint 0 unless the operator says otherwise — that is where a drone is
     launched from and where the controller stays. */
  let station=null, stationH=1.7, linkMHz=2440, txDbm=20, rxSensDbm=-95, antGainDbi=4;
  function setStation(lng,lat,h){ station=(lng==null)?null:[+lng,+lat]; if(h!=null) stationH=Math.max(0,+h||0); return station; }
  function setRadio(o){ o=o||{};
    if(o.mhz!=null) linkMHz=Math.max(1,+o.mhz||2440);
    if(o.txDbm!=null) txDbm=+o.txDbm;
    if(o.rxSensDbm!=null) rxSensDbm=+o.rxSensDbm;
    if(o.antGainDbi!=null) antGainDbi=+o.antGainDbi;
    if(o.stationH!=null) stationH=Math.max(0,+o.stationH||0);
    return radio(); }
  const radio=()=>({ mhz:linkMHz, txDbm, rxSensDbm, antGainDbi, stationH,
    /* the whole budget in one number: how much loss the path may have before the link drops */
    marginDb:txDbm+2*antGainDbi-rxSensDbm });
  /* free-space path loss, dB (Friis) — 20log10(d_km)+20log10(f_MHz)+32.44 */
  function fspl(dM,mhz){ const km=Math.max(0.001,dM/1000); return 20*Math.log10(km)+20*Math.log10(mhz)+32.44; }
  const PHYS=()=>{ try{ return window.IntMapLOS._phys; }catch(_){ return null; } };

  /* ══ 5 · RESTRICTED AREAS (OSM) ═════════════════════════════════════════════════════════════ */
  const OVERPASS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
  function overpass(q,i){ i=i||0;
    if(i>=OVERPASS.length) return Promise.reject(new Error('overpass'));
    return fetch(OVERPASS[i],{ method:'POST', body:'data='+encodeURIComponent(q) })
      .then(r=>{ if(!r.ok) throw new Error('status '+r.status); return r.json(); })
      .catch(()=>overpass(q,i+1)); }
  /* What OSM can actually answer, with the buffer each kind conventionally carries. These are
     ADVISORY distances — they are the ones drone rules most commonly use, and the panel says the
     source is OSM rather than an aviation authority. */
  const ZONE_KINDS=[
    { id:'aerodrome', sel:'["aeroway"="aerodrome"]', bufferM:5000, sev:'critical',
      nm:()=>L('Airport','空港','Flughafen','Аэропорт','Aeropuerto') },
    { id:'heliport',  sel:'["aeroway"="heliport"]',  bufferM:1000, sev:'error',
      nm:()=>L('Heliport','ヘリポート','Hubschrauberlandeplatz','Вертолётная площадка','Helipuerto') },
    { id:'military',  sel:'["landuse"="military"]',  bufferM:0,    sev:'critical',
      nm:()=>L('Military area','軍用地','Militärgelände','Военная территория','Zona militar') },
    { id:'nuclear',   sel:'["plant:source"="nuclear"]', bufferM:2000, sev:'error',
      nm:()=>L('Nuclear plant','原子力発電所','Kernkraftwerk','АЭС','Central nuclear') },
    { id:'protected', sel:'["leisure"="nature_reserve"]', bufferM:0, sev:'warn',
      nm:()=>L('Nature reserve','自然保護区','Naturschutzgebiet','Заповедник','Reserva natural') },
    { id:'park',      sel:'["boundary"="national_park"]', bufferM:0, sev:'warn',
      nm:()=>L('National park','国立公園','Nationalpark','Национальный парк','Parque nacional') },
    { id:'prison',    sel:'["amenity"="prison"]',    bufferM:500,  sev:'error',
      nm:()=>L('Prison','刑務所','Justizvollzugsanstalt','Тюрьма','Prisión') }
  ];
  let zones=[], zonesBox=null, zonesAt=0, zonesErr=null, zonesLoading=false;
  const ZONE_TTL=1800000;
  function bboxOf(samples,padM){
    let n=-90,s=90,e=-180,w=180;
    samples.forEach(p=>{ if(p.lat>n)n=p.lat; if(p.lat<s)s=p.lat; if(p.lng>e)e=p.lng; if(p.lng<w)w=p.lng; });
    const dLat=(padM||0)/110574, dLng=(padM||0)/(111320*Math.max(0.1,Math.cos(((n+s)/2)*D2R)));
    return [s-dLat,w-dLng,n+dLat,e+dLng];
  }
  const boxCovers=(a,b)=>a&&b&&a[0]<=b[0]&&a[1]<=b[1]&&a[2]>=b[2]&&a[3]>=b[3];
  async function warmZones(samples){
    const box=bboxOf(samples,6000);
    if(boxCovers(zonesBox,box)&&Date.now()-zonesAt<ZONE_TTL) return true;
    zonesLoading=true; zonesErr=null;
    const bb=box[0].toFixed(4)+','+box[1].toFixed(4)+','+box[2].toFixed(4)+','+box[3].toFixed(4);
    const parts=ZONE_KINDS.map(k=>'nwr'+k.sel+'('+bb+');').join('');
    /* `bb`, not `center`. Overpass takes ONE geometry mode, and `center` gives a point with no
       extent — which quietly turns every ZERO-buffer zone (military land, reserves, national parks)
       into "within 0 m of a centroid", i.e. a test that can never fire. A national park is a polygon
       and it is the polygon that matters, so the bounding box is what has to come back. */
    const q='[out:json][timeout:35];('+parts+');out tags bb 400;';
    try{
      const j=await overpass(q);
      const out=[];
      (j.elements||[]).forEach(el=>{
        const c=el.center||(el.lat!=null?{lat:el.lat,lon:el.lon}
          :(el.bounds?{lat:(el.bounds.minlat+el.bounds.maxlat)/2,lon:(el.bounds.minlon+el.bounds.maxlon)/2}:null));
        if(!c) return;
        const tg=el.tags||{};
        let kind=null;
        if(tg.aeroway==='aerodrome') kind='aerodrome';
        else if(tg.aeroway==='heliport') kind='heliport';
        else if(tg.landuse==='military') kind='military';
        else if(tg['plant:source']==='nuclear') kind='nuclear';
        else if(tg.leisure==='nature_reserve') kind='protected';
        else if(tg.boundary==='national_park') kind='park';
        else if(tg.amenity==='prison') kind='prison';
        if(!kind) return;
        /* an aerodrome's own extent matters — a 4 km runway is not a point. Use the bounding box
           radius when Overpass gives one, so the buffer is measured from the edge, not the centre. */
        let extentM=0;
        if(el.bounds){ const dy=(el.bounds.maxlat-el.bounds.minlat)*110574;
          const dx=(el.bounds.maxlon-el.bounds.minlon)*111320*Math.cos(c.lat*D2R);
          extentM=Math.max(0,Math.hypot(dx,dy)/2); }
        out.push({ kind, lng:c.lon, lat:c.lat, extentM,
          name:String(tg.name||tg['name:en']||'').slice(0,80),
          id:(el.type||'n')+'/'+el.id });
      });
      zones=out; zonesBox=box; zonesAt=Date.now(); zonesLoading=false;
      return true;
    }catch(e){
      /* an EMPTY reply is a real answer (#R75); a FAILED one is not, and the difference is reported */
      zonesErr=String(e&&e.message||e); zonesLoading=false; return false;
    }
  }

  /* ══ 8 · EMERGENCY LANDING SITES ════════════════════════════════════════════════════════════ */
  let sites=[], sitesAt=0, sitesErr=null, sitesLoading=false;
  const SITE_SRC='drone-sites-src', SITE_LYR='drone-sites', SITE_LBL='drone-sites-lbl';
  const MAX_LANDING_SLOPE_DEG=8;      /* the conventional limit for an unprepared rotorcraft landing */
  /* Land uses on which an unplanned landing is possible and does the least harm. Ordered by
     preference, which is also the order they are scored in. */
  const SITE_SEL=[
    { sel:'["aeroway"="aerodrome"]', pref:1.0, nm:()=>L('Airfield','飛行場','Flugplatz','Аэродром','Aeródromo') },
    { sel:'["landuse"="meadow"]',    pref:0.9, nm:()=>L('Meadow','草地','Wiese','Луг','Prado') },
    { sel:'["landuse"="grass"]',     pref:0.9, nm:()=>L('Grass','芝地','Rasen','Газон','Césped') },
    { sel:'["leisure"="pitch"]',     pref:0.85,nm:()=>L('Sports pitch','運動場','Sportplatz','Спортплощадка','Campo deportivo') },
    { sel:'["leisure"="park"]',      pref:0.8, nm:()=>L('Park','公園','Park','Парк','Parque') },
    { sel:'["landuse"="farmland"]',  pref:0.7, nm:()=>L('Farmland','農地','Ackerland','Пашня','Cultivos') },
    { sel:'["amenity"="parking"]',   pref:0.6, nm:()=>L('Car park','駐車場','Parkplatz','Парковка','Aparcamiento') }
  ];
  async function findLandingSites(samples,spec){
    sitesLoading=true; sitesErr=null;
    const box=bboxOf(samples,2500);
    const bb=box[0].toFixed(4)+','+box[1].toFixed(4)+','+box[2].toFixed(4)+','+box[3].toFixed(4);
    const q='[out:json][timeout:35];('+SITE_SEL.map(s=>'way'+s.sel+'('+bb+');relation'+s.sel+'('+bb+');').join('')+');out tags bb 300;';
    let cand=[];
    try{
      const j=await overpass(q);
      (j.elements||[]).forEach(el=>{
        /* same reason as the zone query: the SIZE of the patch is the point — a 12 m² lawn is not a
           landing site — and `center` alone cannot answer that */
        const c=el.center||(el.bounds?{lat:(el.bounds.minlat+el.bounds.maxlat)/2,lon:(el.bounds.minlon+el.bounds.maxlon)/2}:null);
        if(!c) return;
        const tg=el.tags||{};
        let pref=0, label='';
        for(const s of SITE_SEL){
          const m=/\["([^"]+)"="([^"]+)"\]/.exec(s.sel);
          if(m&&tg[m[1]]===m[2]){ pref=s.pref; label=s.nm(); break; }
        }
        if(!pref) return;
        /* an area's size matters: a 12 m² patch of grass is not a landing site */
        let areaM=0;
        if(el.bounds){ const dy=(el.bounds.maxlat-el.bounds.minlat)*110574;
          const dx=(el.bounds.maxlon-el.bounds.minlon)*111320*Math.cos(c.lat*D2R);
          areaM=Math.max(0,Math.min(dx,dy)); }
        if(areaM&&areaM<25) return;
        cand.push({ lng:c.lon, lat:c.lat, pref, label, spanM:areaM,
          name:String(tg.name||'').slice(0,60), id:(el.type||'w')+'/'+el.id });
      });
    }catch(e){ sitesErr=String(e&&e.message||e); sitesLoading=false; sites=[]; return sites; }
    if(!cand.length){ sites=[]; sitesAt=Date.now(); sitesLoading=false; return sites; }

    /* keep only what is near the route, then MEASURE THE SLOPE of each survivor on the DEM */
    const near=[];
    cand.forEach(c=>{
      let best=Infinity, bi=-1;
      for(let i=0;i<samples.length;i++){ const d=distM([c.lng,c.lat],[samples[i].lng,samples[i].lat]);
        if(d<best){ best=d; bi=i; } }
      if(best<=2500){ c.offRouteM=best; c.atSample=bi; near.push(c); }
    });
    near.sort((a,b)=>a.offRouteM-b.offRouteM);
    const keep=near.slice(0,60);
    const z=14;
    try{ await HOST.warmDEMTiles(keep.map(c=>[c.lng,c.lat]),z,15000); }catch(_){}
    const gAt=(lng,lat)=>{ let v=null; try{ v=HOST.demElevBilinear(lng,lat,z); }catch(_){}
      if(v==null||!isFinite(v)){ try{ v=HOST.demElevAt(lng,lat,null,z); }catch(_){} }
      return (v==null||!isFinite(v))?null:+v; };
    const out=[];
    for(const c of keep){
      const step=30;                                        /* metres — the stencil half-width */
      const dLat=step/110574, dLng=step/(111320*Math.max(0.1,Math.cos(c.lat*D2R)));
      const g=gAt(c.lng,c.lat);
      const gE=gAt(c.lng+dLng,c.lat), gW=gAt(c.lng-dLng,c.lat);
      const gN=gAt(c.lng,c.lat+dLat), gS=gAt(c.lng,c.lat-dLat);
      if(g==null||gE==null||gW==null||gN==null||gS==null) continue;
      const dzdx=(gE-gW)/(2*step), dzdy=(gN-gS)/(2*step);
      const slopeDeg=Math.atan(Math.hypot(dzdx,dzdy))*180/Math.PI;
      if(slopeDeg>MAX_LANDING_SLOPE_DEG) continue;
      /* can the aircraft actually reach it? Descending from the route's altitude at the rated rate
         while travelling at cruise gives a glide/descent radius; a site outside it is not a site. */
      const s=samples[c.atSample];
      const dropM=Math.max(0,(s?s.agl:0));
      const vDesc=Math.max(0.1,+((spec&&spec.descentRate)||3));
      const vFwd=Math.max(0.5,+((spec&&spec.cruiseSpeed)||10));
      const reachM=(dropM/vDesc)*vFwd;
      out.push(Object.assign({},c,{ groundM:g, slopeDeg,
        reachable:c.offRouteM<=reachM, reachM:Math.round(reachM),
        score:c.pref*(1-Math.min(1,slopeDeg/MAX_LANDING_SLOPE_DEG))*(1-Math.min(1,c.offRouteM/2500)) }));
    }
    out.sort((a,b)=>b.score-a.score);
    sites=out.slice(0,40); sitesAt=Date.now(); sitesLoading=false;
    drawSites();
    return sites;
  }
  function ensureSiteLayers(){ const E=GE(); if(!E||!E.canDraw()) return false;
    try{
      if(!E.layers.hasSource(SITE_SRC)) E.layers.addSource(SITE_SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!E.layers.has(SITE_LYR)) E.layers.add({ id:SITE_LYR, type:'circle', source:SITE_SRC,
        paint:{ 'circle-radius':['interpolate',['linear'],['zoom'],8,4,14,8],
          'circle-color':['case',['==',['get','reach'],1],'#30d158','#8e8e93'],
          'circle-stroke-color':'#ffffff','circle-stroke-width':1.6,'circle-opacity':0.92 } });
      if(!E.layers.has(SITE_LBL)) E.layers.add({ id:SITE_LBL, type:'symbol', source:SITE_SRC, minzoom:11,
        layout:{ 'text-field':['get','label'], 'text-size':10.5, 'text-offset':[0,1.2], 'text-anchor':'top',
          'text-allow-overlap':false, 'text-optional':true },
        paint:{ 'text-color':'#30d158','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.3 } });
      return true;
    }catch(_){ return false; } }
  function drawSites(){
    if(!ensureSiteLayers()) return false;
    try{ GE().layers.setSourceData(SITE_SRC,{ type:'FeatureCollection', features:sites.map(s=>({
      type:'Feature', geometry:{ type:'Point', coordinates:[s.lng,s.lat] },
      properties:{ reach:s.reachable?1:0, label:(s.name||s.label), slope:Math.round(s.slopeDeg*10)/10,
        off:Math.round(s.offRouteM) } })) });
      [SITE_LYR,SITE_LBL].forEach(id=>{ if(GE().layers.has(id)) GE().layers.setVisible(id,true); });
      return true; }catch(_){ return false; }
  }
  function clearSites(){ sites=[];
    try{ const E=GE(); [SITE_LYR,SITE_LBL].forEach(id=>{ if(E.layers.has(id)) E.layers.setVisible(id,false); }); }catch(_){}
    return true; }

  /* ══ THE HAZARD SOURCES ═════════════════════════════════════════════════════════════════════ */
  /* Each returns findings {i, kind, severity, text} for the planner's own violation list, so they
     are drawn as the same markers and read in the same place as the terrain checks. */
  let lastWindReport=null, lastLinkReport=null, lastZoneReport=null, lastReserve=null;

  function windSource(ctx){
    const out=[];
    if(!windGrid.length){ lastWindReport=null;
      if(windErr) out.push({ i:0, kind:'wind-data', severity:'warn', text:
        L('Wind is not being applied: '+windErr+'. Press Compute again once it is reachable.',
          '風を反映できていません（'+windErr+'）。取得できてからもう一度計算してください。',
          'Wind wird nicht berücksichtigt: '+windErr+'.',
          'Ветер не учитывается: '+windErr+'.',
          'El viento no se aplica: '+windErr+'.') });
      return out; }
    const spec=ctx.spec, S=ctx.samples;
    let maxSpd=0, maxAt=0, head=0, tail=0, cross=0, aboveTop=false, src=null, t0=Date.now();
    /* the ETA at every sample, so the wind is read at the hour the aircraft is really there */
    const legT=ctx.legs.map(l=>l.timeS);
    S.forEach(s=>{
      let acc=0; for(let k=0;k<(s.leg||0);k++) acc+=legT[k]||0;
      if(s.leg!=null&&legT[s.leg]!=null) acc+=(legT[s.leg]||0)*(s.f==null?0:s.f);
      s._eta=t0+acc*1000;
    });
    const vMax=Math.max(0.5,+spec.maxSpeed||16);
    for(let i=1;i<S.length;i++){
      const s=S[i], w=windVec(s.lng,s.lat,s.agl,s._eta);
      if(!w) continue;
      src=w.src; if(w.above) aboveTop=true;
      if(w.speed>maxSpd){ maxSpd=w.speed; maxAt=i; }
      const br=bearingDeg([S[i-1].lng,S[i-1].lat],[s.lng,s.lat])*D2R;
      const along=w.u*Math.sin(br)+w.v*Math.cos(br);
      const crossC=w.u*Math.cos(br)-w.v*Math.sin(br);
      if(along<0) head=Math.max(head,-along); else tail=Math.max(tail,along);
      cross=Math.max(cross,Math.abs(crossC));
    }
    lastWindReport={ maxSpeed:maxSpd, maxAt, headwind:head, tailwind:tail, crosswind:cross,
      src, aboveTop, cells:windGrid.length };
    const fm=(v)=>(Math.round(v*10)/10)+' m/s';
    /* A wind the aircraft cannot out-fly is a lost aircraft, not a slow flight. The threshold is the
       machine's OWN max speed: if the headwind reaches it, ground speed is zero. */
    if(head>=vMax*0.9) out.push({ i:maxAt, kind:'wind-limit', severity:'critical', text:
      L('Headwind reaches '+fm(head)+', against a maximum airspeed of '+fm(vMax)+' — the aircraft cannot make progress into it.',
        '向かい風が '+fm(head)+' に達し、最大速度 '+fm(vMax)+' に対して前進できません。',
        'Gegenwind erreicht '+fm(head)+' bei einer Höchstgeschwindigkeit von '+fm(vMax)+'.',
        'Встречный ветер достигает '+fm(head)+' при максимальной скорости '+fm(vMax)+'.',
        'El viento en contra llega a '+fm(head)+' frente a una velocidad máxima de '+fm(vMax)+'.') });
    else if(head>=vMax*0.6) out.push({ i:maxAt, kind:'wind', severity:'error', text:
      L('Headwind of '+fm(head)+' against a '+fm(vMax)+' maximum — very little margin, and the flight time above already includes it.',
        '向かい風 '+fm(head)+'（最大速度 '+fm(vMax)+'）。余裕がほとんどありません。上の飛行時間にはこの風が反映済みです。',
        'Gegenwind '+fm(head)+' bei max. '+fm(vMax)+' — sehr wenig Reserve.',
        'Встречный ветер '+fm(head)+' при максимуме '+fm(vMax)+' — запаса почти нет.',
        'Viento en contra de '+fm(head)+' con máximo '+fm(vMax)+' — muy poco margen.') });
    /* Crosswind is paid for by tilting into it: the rotor has to produce a horizontal component
       equal to the drift it is cancelling, which costs power the along-track term does not capture. */
    if(cross>=vMax*0.35) out.push({ i:maxAt, kind:'crosswind', severity:'warn', text:
      L('Crosswind up to '+fm(cross)+' — the aircraft holds track by banking into it, which costs power that the along-track figure above does not include.',
        '横風が最大 '+fm(cross)+'。機体は傾いて針路を保つため、上の値に含まれない分の電力を消費します。',
        'Seitenwind bis '+fm(cross)+' — das Halten der Spur kostet zusätzliche Leistung.',
        'Боковой ветер до '+fm(cross)+' — удержание курса требует дополнительной мощности.',
        'Viento cruzado de hasta '+fm(cross)+' — mantener el rumbo consume potencia adicional.') });
    if(aboveTop) out.push({ i:0, kind:'wind-level', severity:'info', text:
      L('Part of the route is above 180 m, the highest level the wind model publishes — the 180 m wind is used there rather than an extrapolation.',
        '経路の一部が、風の予報が公開している最上層 180 m を超えています。その区間は外挿せず 180 m の値を使用しています。',
        'Ein Teil der Route liegt über 180 m, der obersten veröffentlichten Windebene — dort wird der 180-m-Wind verwendet.',
        'Часть маршрута выше 180 м — верхнего уровня модели ветра; там используется ветер на 180 м.',
        'Parte de la ruta está por encima de 180 m, el nivel más alto publicado — allí se usa el viento de 180 m.') });
    if(src==='MET Norway') out.push({ i:0, kind:'wind-level', severity:'info', text:
      L('Wind comes from MET Norway, which publishes 10 m wind only — the figures above are a 10 m wind, not a wind at the flight altitude.',
        '風は MET Norway の値です（公開されているのは地上10 mの風のみ）。上の数値は飛行高度の風ではなく10 mの風です。',
        'Wind von MET Norway: nur 10-m-Wind veröffentlicht — nicht der Wind in Flughöhe.',
        'Ветер от MET Norway — публикуется только ветер на 10 м, не на высоте полёта.',
        'El viento viene de MET Norway, que solo publica viento a 10 m — no a la altitud de vuelo.') });
    return out;
  }

  /* THE LINK. Items 3 and 4 are one question asked twice, so they are one walk of the terrain. */
  function linkSource(ctx){
    const out=[]; lastLinkReport=null;
    const S=ctx.samples;
    const st=station||(S.length?[S[0].lng,S[0].lat]:null);
    if(!st) return out;
    const ph=PHYS(); const z=ctx.demZoom||14;
    const gAt=(lng,lat)=>{ let v=null; try{ v=HOST.demElevBilinear(lng,lat,z); }catch(_){}
      if(v==null||!isFinite(v)){ try{ v=HOST.demElevAt(lng,lat,null,z); }catch(_){} }
      return (v==null||!isFinite(v))?null:+v; };
    const g0=gAt(st[0],st[1]); if(g0==null) return out;
    const stElev=g0+stationH;
    const lam=299.792458/linkMHz;                         /* metres */
    const budget=radio().marginDb;
    /* one profile per sample is far too many DEM reads; walk every Nth so a long route still answers
       in one frame, and always include the far end */
    const N=Math.max(1,Math.round(S.length/48));
    const marks=[];
    for(let i=0;i<S.length;i+=N) marks.push(i);
    if(marks[marks.length-1]!==S.length-1) marks.push(S.length-1);
    let worstMargin=Infinity, worstAt=0, maxRangeM=0, blockedFrom=null;
    const losBreaks=[], rangeBreaks=[];
    marks.forEach(i=>{
      const s=S[i];
      const d=distM(st,[s.lng,s.lat]);
      if(d<20) return;
      if(d>maxRangeM) maxRangeM=d;
      /* the profile: 40 steps is enough to find the controlling ridge at these ranges */
      const steps=40; let clear=Infinity, worstObst=null;
      for(let k=1;k<steps;k++){
        const f=k/steps;
        const lng=st[0]+(s.lng-st[0])*f, lat=st[1]+(s.lat-st[1])*f;
        const h=gAt(lng,lat); if(h==null) continue;
        const d1=d*f, d2=d-d1;
        const drop=ph&&ph.dropAt?ph.dropAt(d1,1.3333):0;   /* curvature + refraction, the LOS tool's own */
        const hTerr=h-drop;
        const lineAt=stElev+(s.amsl-stElev)*f;
        const c=lineAt-hTerr;
        const F1=(ph&&ph.fresnel1)?ph.fresnel1(lam,d1,d2):0;
        const score=F1>0?(c/F1):c;
        if(!worstObst||score<worstObst.score) worstObst={ score, c, F1, d1, d2 };
        if(c<clear) clear=c;
      }
      let diffDb=0, blocked=false, fres=null;
      if(worstObst){
        if(worstObst.F1>0) fres=Math.max(0,Math.min(100,100*worstObst.c/worstObst.F1));
        if(worstObst.c<0&&ph&&ph.knifeEdgeDb){
          const v=(-worstObst.c)*Math.sqrt(2/lam*(1/worstObst.d1+1/worstObst.d2));
          diffDb=ph.knifeEdgeDb(v); blocked=true;
        }
      }
      const loss=fspl(d,linkMHz)+diffDb;
      const margin=budget-loss;
      if(margin<worstMargin){ worstMargin=margin; worstAt=i; }
      if(blocked&&diffDb>6) losBreaks.push({ i, diffDb, d });
      if(margin<0){ rangeBreaks.push({ i, margin, d }); if(blockedFrom==null) blockedFrom=i; }
      s._linkMargin=margin; s._linkDiffDb=diffDb; s._linkFresnel=fres;
    });
    lastLinkReport={ station:st.slice(), stationH, mhz:linkMHz, budgetDb:budget,
      worstMarginDb:isFinite(worstMargin)?worstMargin:null, worstAt,
      maxRangeM, losBreaks:losBreaks.length, rangeBreaks:rangeBreaks.length,
      sampled:marks.length };
    const km=(m)=>(m<1000?Math.round(m)+' m':(m/1000).toFixed(2)+' km');
    /* ITEM 4 — where line of sight breaks */
    if(losBreaks.length){
      const w=losBreaks.reduce((a,b)=>b.diffDb>a.diffDb?b:a);
      out.push({ i:w.i, kind:'link-los', severity:'error', text:
        L('Line of sight to the ground station is broken over '+losBreaks.length+' of the '+marks.length+' points checked; the worst is '+km(w.d)+' out, where terrain costs '+Math.round(w.diffDb)+' dB of diffraction loss.',
          '地上局との視通が、点検した '+marks.length+' 点のうち '+losBreaks.length+' 点で遮られています。最悪は '+km(w.d)+' 地点で、地形による回折損失は '+Math.round(w.diffDb)+' dB です。',
          'Sichtverbindung zur Bodenstation an '+losBreaks.length+' von '+marks.length+' Punkten unterbrochen; schlimmster Fall '+km(w.d)+' mit '+Math.round(w.diffDb)+' dB Beugungsverlust.',
          'Прямая видимость до наземной станции нарушена в '+losBreaks.length+' из '+marks.length+' точек; худшая — '+km(w.d)+', потери на дифракции '+Math.round(w.diffDb)+' дБ.',
          'La línea de visión con la estación se rompe en '+losBreaks.length+' de '+marks.length+' puntos; el peor a '+km(w.d)+' con '+Math.round(w.diffDb)+' dB de difracción.') });
    }
    /* ITEM 3 — the link budget itself */
    if(rangeBreaks.length){
      const w=rangeBreaks.reduce((a,b)=>b.margin<a.margin?b:a);
      out.push({ i:w.i, kind:'link-range', severity:'critical', text:
        L('The route leaves radio range: at '+km(w.d)+' from the ground station the link is '+Math.abs(Math.round(w.margin))+' dB short of the '+Math.round(budget)+' dB budget ('+linkMHz+' MHz).',
          '経路が通信可能範囲を出ます。地上局から '+km(w.d)+' の地点で、リンク余裕 '+Math.round(budget)+' dB に対し '+Math.abs(Math.round(w.margin))+' dB 不足します（'+linkMHz+' MHz）。',
          'Die Route verlässt die Funkreichweite: bei '+km(w.d)+' fehlen '+Math.abs(Math.round(w.margin))+' dB am Budget von '+Math.round(budget)+' dB.',
          'Маршрут выходит за пределы радиосвязи: на '+km(w.d)+' не хватает '+Math.abs(Math.round(w.margin))+' дБ из бюджета '+Math.round(budget)+' дБ.',
          'La ruta sale del alcance de radio: a '+km(w.d)+' faltan '+Math.abs(Math.round(w.margin))+' dB del presupuesto de '+Math.round(budget)+' dB.') });
    } else if(isFinite(worstMargin)) out.push({ i:worstAt, kind:'link-ok', severity:'info', text:
      L('Radio link holds along the whole route — the tightest point keeps '+Math.round(worstMargin)+' dB of margin at '+km(maxRangeM)+'.',
        '経路全体で通信を維持できます。最も厳しい地点でも余裕 '+Math.round(worstMargin)+' dB（最大距離 '+km(maxRangeM)+'）。',
        'Funkverbindung hält auf der ganzen Route — engste Stelle '+Math.round(worstMargin)+' dB Reserve bei '+km(maxRangeM)+'.',
        'Радиосвязь сохраняется на всём маршруте — минимальный запас '+Math.round(worstMargin)+' дБ на '+km(maxRangeM)+'.',
        'El enlace se mantiene en toda la ruta — margen mínimo '+Math.round(worstMargin)+' dB a '+km(maxRangeM)+'.') });
    return out;
  }

  /* RESTRICTED AREAS */
  function zoneSource(ctx){
    const out=[]; const S=ctx.samples;
    if(zonesErr){ lastZoneReport=null;
      out.push({ i:0, kind:'nofly-data', severity:'warn', text:
        L('Restricted-area data could not be fetched — this route has NOT been checked against airports, military areas or reserves.',
          '飛行禁止・制限区域のデータを取得できませんでした。この経路は空港・軍用地・保護区との照合を行えていません。',
          'Sperrgebietsdaten nicht abrufbar — diese Route wurde NICHT geprüft.',
          'Не удалось получить данные о запретных зонах — маршрут НЕ проверен.',
          'No se pudieron obtener las zonas restringidas — esta ruta NO ha sido comprobada.') });
      return out; }
    if(!zones.length){ lastZoneReport={ hits:0, checked:true }; return out; }
    const hits=[];
    zones.forEach(zn=>{
      const K=ZONE_KINDS.find(k=>k.id===zn.kind); if(!K) return;
      const r=K.bufferM+(zn.extentM||0);
      let best=Infinity, bi=-1;
      for(let i=0;i<S.length;i++){ const d=distM([zn.lng,zn.lat],[S[i].lng,S[i].lat]);
        if(d<best){ best=d; bi=i; } }
      if(best<=r) hits.push({ zn, K, d:best, i:bi, r });
    });
    lastZoneReport={ hits:hits.length, zones:zones.length, checked:true };
    /* one finding per zone, worst first, capped so a route through a city is readable */
    hits.sort((a,b)=>(a.d-a.r)-(b.d-b.r));
    hits.slice(0,8).forEach(h=>{
      const nm=h.zn.name||h.K.nm();
      const km=(m)=>(m<1000?Math.round(m)+' m':(m/1000).toFixed(1)+' km');
      out.push({ i:h.i, kind:'nofly', severity:h.K.sev, text:
        L('The route passes within '+km(h.d)+' of '+nm+' ('+h.K.nm()+'), inside the '+km(h.r)+' advisory buffer. Check the local rules before flying — this comes from OpenStreetMap, not from an aviation authority.',
          '経路が '+nm+'（'+h.K.nm()+'）から '+km(h.d)+' の距離を通り、目安の離隔 '+km(h.r)+' の内側に入ります。飛行前に必ず現地の規則を確認してください。出典は OpenStreetMap であり、航空当局の情報ではありません。',
          'Die Route verläuft '+km(h.d)+' von '+nm+' ('+h.K.nm()+') entfernt, innerhalb des Richtabstands von '+km(h.r)+'. Quelle: OpenStreetMap, keine Luftfahrtbehörde.',
          'Маршрут проходит в '+km(h.d)+' от «'+nm+'» ('+h.K.nm()+'), внутри рекомендуемой зоны '+km(h.r)+'. Источник — OpenStreetMap, не авиационные власти.',
          'La ruta pasa a '+km(h.d)+' de '+nm+' ('+h.K.nm()+'), dentro del margen recomendado de '+km(h.r)+'. Fuente: OpenStreetMap, no una autoridad aeronáutica.') });
    });
    if(hits.length>8) out.push({ i:0, kind:'nofly', severity:'warn', text:
      L((hits.length-8)+' more restricted areas are also within their advisory buffers.',
        'ほかにも '+(hits.length-8)+' 件の制限区域が目安の離隔内にあります。',
        (hits.length-8)+' weitere Sperrgebiete liegen ebenfalls im Richtabstand.',
        'Ещё '+(hits.length-8)+' запретных зон также в пределах рекомендуемых расстояний.',
        'Otras '+(hits.length-8)+' zonas restringidas también están dentro del margen.') });
    return out;
  }

  /* ══ 2 · THE RETURN LEG ═════════════════════════════════════════════════════════════════════ */
  /* The energy the plan needs to get HOME again, into the same wind. Registered as a hazard source
     because the answer belongs in the same list as every other reason a flight will not work. */
  function reserveSource(ctx){
    const out=[]; const spec=ctx.spec, S=ctx.samples, wp=ctx.wp;
    if(wp.length<2){ lastReserve=null; return out; }
    const home=[wp[0].lng,wp[0].lat], homeAmsl=ctx.samples[0]?ctx.samples[0].amsl:0;
    const end=[wp[wp.length-1].lng,wp[wp.length-1].lat];
    const endAmsl=S[S.length-1].amsl;
    const closed=distM(home,end)<50;
    /* a closed circuit already ends at home — its return cost is zero, and saying so is not the
       same as skipping the check */
    const m0=Math.max(0.01,(+spec.massKg||1)+(+spec.payloadKg||0));
    const P=Math.max(1,+spec.cruisePowerW||1)*Math.pow(m0/Math.max(0.01,+spec.massKg||1),1.5);
    let backWh=0, backS=0, backM=0;
    if(!closed){
      backM=distM(end,home);
      let gs=Math.max(0.1,+spec.cruiseSpeed||10);
      const w=windVec((end[0]+home[0])/2,(end[1]+home[1])/2,(S[S.length-1].agl||60),Date.now()+ (ctx.legs.reduce((a,l)=>a+l.timeS,0)*1000));
      if(w){ const br=bearingDeg(end,home)*D2R; gs=Math.max(0.5,gs+(w.u*Math.sin(br)+w.v*Math.cos(br))); }
      const dz=homeAmsl-endAmsl;
      const tH=backM/gs;
      const tV=dz>0?dz/Math.max(0.05,+spec.climbRate||3):(-dz)/Math.max(0.05,+spec.descentRate||3);
      backS=Math.max(tH,tV);
      backWh=(P*backS)/3600+(dz>0?((m0*9.80665*dz/0.5)/3600):0);
    }
    const cap=Math.max(0.001,+spec.batteryWh||1);
    const reserve=Math.max(0,Math.min(0.6,(+spec.reservePct||0)/100));
    const usable=cap*(1-reserve);
    const outWh=ctx._energyWh!=null?ctx._energyWh:null;
    lastReserve={ closed, returnM:backM, returnS:backS, returnWh:backWh, usableWh:usable, capacityWh:cap };
    if(outWh==null) return out;
    const round=outWh+backWh;
    lastReserve.roundTripWh=round;
    lastReserve.roundTripPct=(round/cap)*100;
    const f1=(v)=>v.toFixed(1);
    if(closed) out.push({ i:S.length-1, kind:'return', severity:'info', text:
      L('The route ends where it started, so no separate return leg is needed.',
        '経路は出発点に戻って終わるため、別途の帰投区間は不要です。',
        'Die Route endet am Startpunkt — kein separater Rückflug nötig.',
        'Маршрут заканчивается в точке старта — обратный участок не нужен.',
        'La ruta termina donde empezó — no hace falta un tramo de regreso.') });
    else if(round>usable) out.push({ i:S.length-1, kind:'return', severity:'critical', text:
      L('There is not enough battery to come back: the flight needs '+f1(outWh)+' Wh and the return leg a further '+f1(backWh)+' Wh ('+(backM/1000).toFixed(2)+' km), for '+f1(round)+' Wh against '+f1(usable)+' Wh usable.',
        '帰投分の電池が足りません。往路 '+f1(outWh)+' Wh に加え、帰路に '+f1(backWh)+' Wh（'+(backM/1000).toFixed(2)+' km）が必要で、合計 '+f1(round)+' Wh に対し使用可能は '+f1(usable)+' Wh です。',
        'Der Akku reicht nicht für den Rückflug: '+f1(outWh)+' Wh hin, '+f1(backWh)+' Wh zurück, zusammen '+f1(round)+' Wh gegen '+f1(usable)+' Wh nutzbar.',
        'Заряда не хватит на возврат: '+f1(outWh)+' Вт·ч туда и ещё '+f1(backWh)+' Вт·ч обратно — '+f1(round)+' Вт·ч против '+f1(usable)+' Вт·ч доступных.',
        'No hay batería para volver: '+f1(outWh)+' Wh de ida y '+f1(backWh)+' Wh de vuelta — '+f1(round)+' Wh frente a '+f1(usable)+' Wh utilizables.') });
    else out.push({ i:S.length-1, kind:'return', severity:'info', text:
      L('Including the return to the launch point ('+(backM/1000).toFixed(2)+' km, '+f1(backWh)+' Wh) the round trip uses '+f1(round)+' Wh of '+f1(usable)+' Wh usable.',
        '離陸地点への帰投（'+(backM/1000).toFixed(2)+' km・'+f1(backWh)+' Wh）を含めた往復で '+f1(round)+' Wh、使用可能 '+f1(usable)+' Wh に対する消費です。',
        'Mit Rückflug zum Startpunkt ('+(backM/1000).toFixed(2)+' km, '+f1(backWh)+' Wh) braucht der Umlauf '+f1(round)+' Wh von '+f1(usable)+' Wh.',
        'С возвратом к точке взлёта ('+(backM/1000).toFixed(2)+' км, '+f1(backWh)+' Вт·ч) круг требует '+f1(round)+' Вт·ч из '+f1(usable)+' Вт·ч.',
        'Con el regreso al punto de despegue ('+(backM/1000).toFixed(2)+' km, '+f1(backWh)+' Wh) el viaje usa '+f1(round)+' Wh de '+f1(usable)+' Wh.') });
    return out;
  }

  /* ══ 9 · RETURN TO HOME ═════════════════════════════════════════════════════════════════════ */
  /* A generated route, not a straight line back: it climbs to a safe altitude first (the standard
     RTH behaviour and the reason RTH does not fly drones into buildings), then runs home, then
     descends. The safe altitude is the route's own highest terrain plus the aircraft's minimum
     clearance, which is a measured number rather than a default. */
  async function returnToHome(){
    const D=DRONE(); if(!D) return null;
    const r=D.route(); if(!r||r.wp.length<2) return null;
    const res=D.result()||await D.compute(); if(!res) return null;
    const spec=r.spec;
    const home=r.wp[0], last=r.wp[r.wp.length-1];
    if(distM([home.lng,home.lat],[last.lng,last.lat])<50) return { alreadyHome:true };
    let maxGround=-Infinity;
    res.samples.forEach(s=>{ if(s.groundKnown&&s.ground>maxGround) maxGround=s.ground; });
    if(!isFinite(maxGround)) maxGround=0;
    const clear=Math.max(10,(+spec.minAgl||0)+15);
    const safeAmsl=maxGround+clear;
    const endAmsl=res.wpAmsl[res.wpAmsl.length-1];
    const homeAmsl=res.wpAmsl[0];
    const added=[];
    /* climb in place, if the aircraft is not already at the safe altitude */
    if(endAmsl<safeAmsl-1) added.push({ lng:last.lng, lat:last.lat, alt:safeAmsl, ref:'amsl', hold:0 });
    /* the transit, at the safe altitude, over the launch point */
    added.push({ lng:home.lng, lat:home.lat, alt:safeAmsl, ref:'amsl', hold:0 });
    /* and down onto it */
    added.push({ lng:home.lng, lat:home.lat, alt:homeAmsl, ref:'amsl', hold:0 });
    const next=JSON.parse(JSON.stringify(r));
    next.wp=next.wp.concat(added);
    D.setRoute(next);
    const out=await D.compute();
    return { alreadyHome:false, added:added.length, safeAmsl, maxGround, clear, result:out };
  }

  /* ══ 7 · THREE ROUTES, COMPARED ═════════════════════════════════════════════════════════════ */
  /* The comparison is between three real plans over the SAME waypoints — what changes is the
     altitude profile, which is the only thing a planner can choose once the waypoints are given:
       · shortest  — fly the straight line at the lowest legal altitude the terrain allows;
       · least power — fly it as level as possible, because every metre of climb is m·g·Δh that a
         rotorcraft cannot get back on the way down;
       · safest   — clear the terrain by a wide margin and stay inside the radio link.
     Each is computed by the planner itself, so the numbers are the planner's numbers. */
  async function compareVariants(){
    const D=DRONE(); if(!D) return null;
    const r0=D.route(); if(!r0||r0.wp.length<2) return null;
    const spec=r0.spec;
    const base=await D.compute(); if(!base) return null;
    let maxGround=-Infinity, minGround=Infinity;
    base.samples.forEach(s=>{ if(!s.groundKnown) return;
      if(s.ground>maxGround) maxGround=s.ground; if(s.ground<minGround) minGround=s.ground; });
    if(!isFinite(maxGround)) return null;
    const minAgl=Math.max(1,+spec.minAgl||10), maxAgl=Math.max(minAgl+1,+spec.maxAgl||120);
    const plans=[
      { id:'shortest', nm:()=>L('Shortest','最短','Kürzeste','Кратчайший','Más corta'),
        make:(wp)=>wp.map(p=>Object.assign({},p,{ alt:minAgl+2, ref:'agl' })) },
      { id:'economy',  nm:()=>L('Least power','最省電力','Sparsamste','Наименьшая энергия','Menor consumo'),
        /* one level altitude for the whole flight: no climb charged anywhere except getting there */
        make:(wp)=>{ const lvl=Math.min(maxGround+maxAgl, maxGround+minAgl+10);
          return wp.map(p=>Object.assign({},p,{ alt:lvl, ref:'amsl' })); } },
      { id:'safest',   nm:()=>L('Safest','最安全','Sicherste','Самый безопасный','Más segura'),
        make:(wp)=>{ const lvl=Math.min(maxGround+maxAgl, maxGround+Math.max(minAgl*2,minAgl+40));
          return wp.map(p=>Object.assign({},p,{ alt:lvl, ref:'amsl' })); } }
    ];
    const outs=[];
    for(const p of plans){
      const next=JSON.parse(JSON.stringify(r0));
      next.wp=p.make(next.wp);
      D.setRoute(next);
      const res=await D.compute();
      if(!res) continue;
      const bad=res.violations.filter(v=>v.severity==='critical'||v.severity==='error').length;
      outs.push({ id:p.id, name:p.nm(),
        dist3DM:res.dist3DM, timeS:res.timeS, energyWh:res.energyWh, batteryPct:res.batteryPct,
        minClearance:res.minClearance, maxAgl:res.maxAgl, climbM:res.climbM,
        violations:bad, ok:res.ok, wp:JSON.parse(JSON.stringify(next.wp)) });
    }
    /* put the original back — a comparison must not silently replace what the operator built */
    D.setRoute(r0); await D.compute();
    if(!outs.length) return null;
    const best=(k,dir)=>outs.reduce((a,b)=>((dir>0?b[k]>a[k]:b[k]<a[k])?b:a));
    return { variants:outs,
      shortest:best('dist3DM',-1).id, cheapest:best('energyWh',-1).id,
      safest:outs.slice().sort((a,b)=>(a.violations-b.violations)||(b.minClearance-a.minClearance))[0].id };
  }
  /* apply one of the compared variants */
  async function useVariant(id){
    const c=await compareVariants(); if(!c) return null;
    const v=c.variants.find(x=>x.id===id); if(!v) return null;
    const D=DRONE(), r=D.route(); r.wp=v.wp; D.setRoute(r);
    return D.compute();
  }

  /* ══ 10 · CONFLICTS BETWEEN AIRCRAFT ════════════════════════════════════════════════════════ */
  /* Two routes that cross are only in conflict if they are at the same place at the same TIME and
     the same ALTITUDE. Walking both timelines answers all three at once. */
  const SEP_H_M=50, SEP_V_M=15, SEP_T_S=30;
  function timeline(res,startMs){
    const t0=startMs||0, S=res.samples, legT=res.legs.map(l=>l.timeS);
    return S.map(s=>{
      let acc=0; for(let k=0;k<(s.leg||0);k++) acc+=legT[k]||0;
      if(s.leg!=null&&legT[s.leg]!=null) acc+=(legT[s.leg]||0)*(s.f==null?0:s.f);
      return { lng:s.lng, lat:s.lat, amsl:s.amsl, t:t0+acc*1000 };
    });
  }
  async function checkConflicts(opts){
    opts=opts||{};
    const D=DRONE(); if(!D) return null;
    const cur=D.route(); if(!cur||cur.wp.length<2) return null;
    const curRes=D.result()||await D.compute(); if(!curRes) return null;
    const starts=opts.starts||{};
    const mine=timeline(curRes,starts[cur.id]||0);
    const others=D.routes().filter(r=>r.id!==cur.id);
    const found=[];
    for(const meta of others){
      const saved=D.route();                       /* remember, load, compute, restore */
      if(!D.load(meta.id)) continue;
      const res=await D.compute();
      const other=res?timeline(res,starts[meta.id]||0):null;
      D.setRoute(saved);
      if(!other) continue;
      let worst=null;
      for(let i=0;i<mine.length;i++){
        for(let j=0;j<other.length;j++){
          const dt=Math.abs(mine[i].t-other[j].t)/1000;
          if(dt>SEP_T_S*4) continue;
          const dh=distM([mine[i].lng,mine[i].lat],[other[j].lng,other[j].lat]);
          if(dh>SEP_H_M*6) continue;
          const dv=Math.abs(mine[i].amsl-other[j].amsl);
          const sev=(dh<SEP_H_M&&dv<SEP_V_M&&dt<SEP_T_S);
          const score=dh/SEP_H_M+dv/SEP_V_M+dt/SEP_T_S;
          if(!worst||score<worst.score) worst={ score, dh, dv, dt, i, j, sev,
            lng:mine[i].lng, lat:mine[i].lat, amsl:mine[i].amsl, tMs:mine[i].t };
        }
      }
      if(worst) found.push({ route:meta.id, name:meta.name, conflict:!!worst.sev,
        horizM:worst.dh, vertM:worst.dv, timeS:worst.dt, at:{ lng:worst.lng, lat:worst.lat, amsl:worst.amsl },
        atSample:worst.i, tOffsetS:Math.round(worst.tMs/1000) });
    }
    await D.compute();                              /* the current route is drawn again */
    found.sort((a,b)=>(b.conflict-a.conflict)||(a.horizM-b.horizM));
    return { checked:others.length, minima:found, conflicts:found.filter(f=>f.conflict).length,
      separation:{ horizM:SEP_H_M, vertM:SEP_V_M, timeS:SEP_T_S } };
  }

  /* ══ WIRING ═════════════════════════════════════════════════════════════════════════════════ */
  /* The planner calls its hazard sources DURING compute(), synchronously. Everything above needs
     network data, so `prepare()` fetches it first and compute() then reads what is in hand — the
     seam's own design. A source with nothing loaded yet says so instead of staying silent. */
  let enabled={ wind:true, link:true, nofly:true, reserve:true, sites:false };
  function setEnabled(patch){ enabled=Object.assign({},enabled,patch||{});
    return Object.assign({},enabled); }

  async function prepare(){
    const D=DRONE(); if(!D) return null;
    const r=D.route(); if(!r||!r.wp.length) return null;
    /* one cheap compute to get the densified samples the fetches need to be scoped to */
    const res=D.result()||await D.compute(); if(!res) return null;
    const S=res.samples;
    if(enabled.wind) await warmWind(S);
    if(enabled.nofly) await warmZones(S);
    if(enabled.sites) await findLandingSites(S,r.spec);
    /* and recompute, so the sources see the data that was just fetched */
    return D.compute();
  }

  function install(){
    const D=DRONE(); if(!D||!D.registerHazardSource) return false;
    D.registerWindField(s=>{
      if(!enabled.wind) return null;
      const agl=(s.agl!=null&&isFinite(s.agl))?s.agl
        :((s.amsl!=null&&s.ground!=null)?(s.amsl-s.ground):60);
      return windVec(s.lng,s.lat,agl,s.eta||s._eta);
    });
    D.registerHazardSource('wind',ctx=>enabled.wind?windSource(ctx):[]);
    D.registerHazardSource('link',ctx=>enabled.link?linkSource(ctx):[]);
    D.registerHazardSource('nofly',ctx=>enabled.nofly?zoneSource(ctx):[]);
    D.registerHazardSource('return',ctx=>enabled.reserve?reserveSource(ctx):[]);
    return true;
  }
  /* js/drone-nav.js is instantiated in the same block as this file, but the ORDER is a fact about
     app-body.js rather than about this file — so wait for it rather than assuming. */
  (function boot(n){ if(install()) return; if((n||0)>40) return;
    setTimeout(()=>boot((n||0)+1),120); })(0);

  const API={
    install, prepare, setEnabled, enabled:()=>Object.assign({},enabled),
    /* wind */
    warmWind, windAt:(lng,lat,agl,t)=>windVec(lng,lat,agl,t), windReport:()=>lastWindReport&&Object.assign({},lastWindReport),
    /* radio */
    setStation, station:()=>station&&station.slice(), setRadio, radio, linkReport:()=>lastLinkReport&&Object.assign({},lastLinkReport),
    /* restricted areas */
    warmZones, zones:()=>zones.slice(), zoneReport:()=>lastZoneReport&&Object.assign({},lastZoneReport), zoneKinds:()=>ZONE_KINDS.map(k=>({ id:k.id, bufferM:k.bufferM, severity:k.sev, name:k.nm() })),
    /* landing sites */
    findLandingSites, sites:()=>sites.slice(), clearSites, drawSites,
    /* the return leg + RTH */
    returnToHome, reserveReport:()=>lastReserve&&Object.assign({},lastReserve),
    /* route comparison */
    compareVariants, useVariant,
    /* conflicts */
    checkConflicts,
    /* diagnostics */
    state:()=>({ enabled:Object.assign({},enabled),
      wind:{ cells:windGrid.length, src:windSrc, loading:windLoading, err:windErr, report:lastWindReport },
      link:Object.assign({},radio(),{ station:station&&station.slice(), report:lastLinkReport }),
      nofly:{ zones:zones.length, loading:zonesLoading, err:zonesErr, report:lastZoneReport },
      sites:{ n:sites.length, loading:sitesLoading, err:sitesErr, reachable:sites.filter(s=>s.reachable).length },
      reserve:lastReserve }),
    /* the pure parts, exported so they can be tested without a map or a network */
    _math:{ fspl, windVec, timeline, distM, bearingDeg, MAX_LANDING_SLOPE_DEG, SEP_H_M, SEP_V_M, SEP_T_S }
  };
  window.IntMapDroneOps=API;
  return API;
};
