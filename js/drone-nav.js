/* ============================================================================
 *  IntMap · DRONE NAVIGATION — terrain-aware flight planning  (#R174)
 * ----------------------------------------------------------------------------
 *  「IntMap上で利用できるドローン向けナビゲーション機能を設計・実装する。」
 *
 *  Plan a flight for an unmanned aircraft over the REAL terrain: drop waypoints on the map, give each
 *  one an altitude, describe the machine that has to fly it, and the tool answers with the numbers that
 *  decide whether the flight is possible — distance, time, the altitude and ground-clearance profile,
 *  the highest altitude the route demands, the energy it costs, and every point where the plan breaks a
 *  limit, with the reason and the place.
 *
 *  ── WHAT WAS REUSED, AND WHAT HAD TO BE NEW ────────────────────────────────────────────────
 *  Reused as-is (nothing was forked or re-implemented):
 *    · the keyless terrarium DEM sampler behind the elevation profile — HOST.warmDEMTiles() +
 *      HOST.demElevBilinear() (js/map-readout.js). It works whether or not 3-D terrain is switched on,
 *      it is cached per tile, and it reads BATHYMETRY as negative elevation, so a route over water is
 *      measured against the sea surface rather than a hole. This is the single source of ground truth
 *      here; nothing in this file guesses an elevation.
 *    · the 3-D drawing pattern proved by the live-aircraft track (js/data-layers.js #R173): a
 *      `fill-extrusion` ribbon per leg, extruded between two real altitudes, because MapLibre 5.24 still
 *      has no way to lift a `symbol` (verified in the dist — `symbol-z-offset` does not exist).
 *    · window.IntMapGeoEngine for every source/layer/camera call, so this feature inherits a future
 *      Earth/Cesium adapter for free (the rule since #R152).
 *    · the tool-panel look (.tool-panel / .tp-*) and HOST.makeDraggable, so the planner is the same
 *      object as Measure / Radius / 3-D volume rather than a second UI vocabulary.
 *  NOT reused, deliberately:
 *    · js/flight-sim.js. It is a manned-cockpit simulator with a 6-DOF rigid-body model and it OWNS the
 *      camera for the length of a flight (#R158). A planner needs neither, and taking the camera would
 *      make the two features mutually exclusive. They share only the DEM.
 *    · js/volume3d.js. Its footprint is a closed ring; a route is an open polyline with a different
 *      altitude at every vertex. The shapes have nothing in common beyond both standing in the air.
 *
 *  ── ALTITUDE REFERENCE: THE ONE THING THAT MUST NEVER BE AMBIGUOUS ─────────────────────────
 *  Drone rules are written in AGL (120 m / 400 ft above the ground), terrain and airspace are in AMSL,
 *  and a tool that quietly mixes them will fly someone into a hill. So:
 *    · every waypoint stores its altitude together with the reference it was TYPED in (`ref`: 'agl' |
 *      'amsl') — the reference is part of the datum, not a display setting;
 *    · the model converts through ONE pair of functions (wpAmsl / wpAgl) that always take the ground
 *      elevation at that waypoint's own coordinates;
 *    · every number the UI shows is labelled AMSL or AGL, and the waypoint list shows BOTH;
 *    · switching the reference selector re-labels what you are TYPING, and never silently reinterprets
 *      altitudes already entered (each waypoint keeps the reference it was created with).
 *
 *  ── EXTENSION SEAMS (the "future integration" list in the brief) ───────────────────────────
 *  Everything in that list is an extra opinion about a point in space and time along the route, so they
 *  all attach at one place: `registerHazardSource(id, fn)`. `fn(ctx)` receives the densified route
 *  samples (lng/lat/ground/amsl/agl/distance/eta) plus the aircraft spec, and returns findings
 *  `{i, kind, severity, text}` which are merged into the same violation list and drawn as the same
 *  markers. Weather and wind additionally want to change the ARITHMETIC, so `registerWindField(fn)` is
 *  a second seam: fn(sample) → {u, v, gust} in m/s is folded into ground speed and energy. Neither
 *  seam is filled in this round (no data source is wired), and both are exercised by the tests so they
 *  cannot rot. Multi-aircraft is already the shape of the store: routes are a keyed list, and each
 *  route carries its own aircraft spec.
 *
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.droneNav=function(map,HOST){
  const GE=()=>window.IntMapGeoEngine;
  const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;

  /* ---- geodesy (spherical; the same radius the rest of the app measures with) ---------------- */
  const R_EARTH=6371008.8, D2R=Math.PI/180, R2D=180/Math.PI;
  function distM(a,b){ const la1=a[1]*D2R, la2=b[1]*D2R, dla=(b[1]-a[1])*D2R, dlo=(b[0]-a[0])*D2R;
    const h=Math.sin(dla/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dlo/2)**2;
    return 2*R_EARTH*Math.asin(Math.min(1,Math.sqrt(h))); }
  function bearingDeg(a,b){ const la1=a[1]*D2R, la2=b[1]*D2R, dlo=(b[0]-a[0])*D2R;
    const y=Math.sin(dlo)*Math.cos(la2), x=Math.cos(la1)*Math.sin(la2)-Math.sin(la1)*Math.cos(la2)*Math.cos(dlo);
    return (Math.atan2(y,x)*R2D+360)%360; }
  /* fraction f along the great circle a→b (spherical linear interpolation, so a long leg does not drift
     off the line the map draws) */
  function lerpLL(a,b,f){ const d=distM(a,b)/R_EARTH;
    if(d<1e-12) return [a[0],a[1]];
    const A=Math.sin((1-f)*d)/Math.sin(d), B=Math.sin(f*d)/Math.sin(d);
    const la1=a[1]*D2R, lo1=a[0]*D2R, la2=b[1]*D2R, lo2=b[0]*D2R;
    const x=A*Math.cos(la1)*Math.cos(lo1)+B*Math.cos(la2)*Math.cos(lo2);
    const y=A*Math.cos(la1)*Math.sin(lo1)+B*Math.cos(la2)*Math.sin(lo2);
    const z=A*Math.sin(la1)+B*Math.sin(la2);
    return [Math.atan2(y,x)*R2D, Math.atan2(z,Math.hypot(x,y))*R2D]; }

  /* ---- the aircraft ------------------------------------------------------------------------
     Every field is a REAL quantity with a unit, and every one of them is used by the arithmetic below —
     there are no decorative inputs. The presets are CLASSES of machine, not products: publishing a named
     model's specification as fact is exactly the kind of fabrication this project forbids, and the point
     of the panel is that you type in the numbers from your own aircraft's manual. */
  const SPEC_FIELDS=[
    { k:'cruiseSpeed', unit:'m/s', min:1,   max:120,  step:0.5, lbl:['Cruise speed','巡航速度','Reisegeschw.','Крейсерская скорость','Velocidad de crucero'] },
    { k:'maxSpeed',    unit:'m/s', min:1,   max:200,  step:0.5, lbl:['Max speed','最大速度','Höchstgeschw.','Макс. скорость','Velocidad máxima'] },
    { k:'maxAgl',      unit:'m',   min:5,   max:12000,step:5,   lbl:['Max altitude (AGL)','最大飛行高度（対地）','Max. Höhe (über Grund)','Макс. высота (над землёй)','Altitud máx. (sobre el suelo)'] },
    { k:'minAgl',      unit:'m',   min:0,   max:2000, step:1,   lbl:['Min ground clearance (AGL)','最低地上高（対地）','Min. Bodenabstand','Мин. высота над землёй','Altura mínima sobre el suelo'] },
    { k:'rangeKm',     unit:'km',  min:0.1, max:2000, step:0.5, lbl:['Range','航続距離','Reichweite','Дальность','Alcance'] },
    { k:'batteryWh',   unit:'Wh',  min:1,   max:20000,step:5,   lbl:['Battery capacity','バッテリー容量','Akkukapazität','Ёмкость батареи','Capacidad de batería'] },
    { k:'cruisePowerW',unit:'W',   min:5,   max:20000,step:5,   lbl:['Cruise power draw','巡航時消費電力','Leistung im Reiseflug','Мощность в крейсере','Potencia en crucero'] },
    { k:'massKg',      unit:'kg',  min:0.05,max:600,  step:0.05,lbl:['Empty mass','機体重量','Leermasse','Масса пустого','Masa en vacío'] },
    { k:'payloadKg',   unit:'kg',  min:0,   max:300,  step:0.05,lbl:['Payload','積載重量','Nutzlast','Полезная нагрузка','Carga útil'] },
    { k:'climbRate',   unit:'m/s', min:0.1, max:40,   step:0.1, lbl:['Climb rate','上昇速度','Steigrate','Скороподъёмность','Velocidad de ascenso'] },
    { k:'descentRate', unit:'m/s', min:0.1, max:40,   step:0.1, lbl:['Descent rate','下降速度','Sinkrate','Скорость снижения','Velocidad de descenso'] },
    { k:'reservePct',  unit:'%',   min:0,   max:60,   step:1,   lbl:['Battery reserve','バッテリー予備率','Akkureserve','Резерв батареи','Reserva de batería'] }
  ];
  const PRESETS=[
    { id:'micro', name:['Sub-250 g class quadcopter','250g未満クラス マルチコプター','Klasse unter 250 g','Класс до 250 г','Clase de menos de 250 g'],
      spec:{ cruiseSpeed:10, maxSpeed:16, maxAgl:120, minAgl:5, rangeKm:6, batteryWh:19, cruisePowerW:42, massKg:0.25, payloadKg:0, climbRate:5, descentRate:3.5, reservePct:20 } },
    { id:'prosumer', name:['Prosumer quadcopter (~1 kg)','業務用マルチコプター（約1kg）','Profi-Quadrocopter (~1 kg)','Профессиональный квадрокоптер (~1 кг)','Cuadricóptero profesional (~1 kg)'],
      spec:{ cruiseSpeed:15, maxSpeed:21, maxAgl:120, minAgl:10, rangeKm:15, batteryWh:77, cruisePowerW:150, massKg:0.9, payloadKg:0, climbRate:6, descentRate:4, reservePct:20 } },
    { id:'heavylift', name:['Heavy-lift multirotor','重量物運搬マルチローター','Schwerlast-Multikopter','Тяжёлый мультикоптер','Multirrotor de carga pesada'],
      spec:{ cruiseSpeed:12, maxSpeed:20, maxAgl:120, minAgl:15, rangeKm:12, batteryWh:900, cruisePowerW:2400, massKg:12, payloadKg:6, climbRate:5, descentRate:3, reservePct:25 } },
    { id:'fixedwing', name:['Fixed-wing / VTOL survey aircraft','固定翼・VTOL測量機','Starrflügler / VTOL','Самолётного типа / VTOL','Ala fija / VTOL'],
      spec:{ cruiseSpeed:22, maxSpeed:30, maxAgl:400, minAgl:30, rangeKm:60, batteryWh:400, cruisePowerW:220, massKg:3.5, payloadKg:1, climbRate:4, descentRate:4, reservePct:20 } }
  ];
  const DEFAULT_SPEC=()=>Object.assign({},PRESETS[1].spec);
  const g0=9.80665;
  /* MOMENTUM THEORY, not a fudge factor. Hover induced power goes as (mg)^1.5/√(2ρA), so the power a
     heavier machine needs scales with (m/m_ref)^1.5 — a 20 % heavier aircraft costs ~31 % more, which is
     why payload eats endurance so fast. `cruisePowerW` is quoted by the operator at the aircraft's own
     empty mass, so the payload is what scales it. */
  function powerW(spec){ const m0=Math.max(0.01,+spec.massKg||1), pay=Math.max(0,+spec.payloadKg||0);
    return Math.max(1,+spec.cruisePowerW||1)*Math.pow((m0+pay)/m0,1.5); }
  /* Climbing is WORK against gravity: E = m·g·Δh, divided by the propulsive efficiency of a rotor doing
     it (η≈0.5 is the conventional figure for a multirotor climbing at its rated rate). Descending gives
     nothing back — an electric rotorcraft cannot regenerate — so only positive Δh is charged. */
  const CLIMB_EFF=0.5;
  function climbWh(spec,dz){ if(!(dz>0)) return 0;
    const m=Math.max(0.01,(+spec.massKg||1)+(+spec.payloadKg||0));
    return (m*g0*dz/CLIMB_EFF)/3600; }

  /* ---- wind (extension seam) ---------------------------------------------------------------
     No wind source is wired this round. When one is, it returns metres per second in the map frame and
     the arithmetic below already knows what to do with it: the along-track component changes ground
     speed (and therefore both time and energy), the cross-track component is reported but not modelled
     as a heading correction, which would be a lie without a real airspeed model. */
  let windField=null;
  function registerWindField(fn){ windField=(typeof fn==='function')?fn:null; return !!windField; }
  function windAt(s){ if(!windField) return null; try{ const w=windField(s); return (w&&isFinite(w.u)&&isFinite(w.v))?w:null; }catch(_){ return null; } }

  /* ---- hazard sources (extension seam) ------------------------------------------------------ */
  const hazardSources=Object.create(null);
  function registerHazardSource(id,fn){ if(!id||typeof fn!=='function') return false; hazardSources[String(id)]=fn; return true; }
  function unregisterHazardSource(id){ delete hazardSources[String(id)]; return true; }
  function hazardSourceIds(){ return Object.keys(hazardSources); }

  /* ---- the store ---------------------------------------------------------------------------- */
  const KEY='intmap_drone_routes';
  let routes=[];            /* every saved route (multi-aircraft is a list of these) */
  let route=null;           /* the one being edited */
  let typedRef='agl';       /* which reference NEW waypoints are typed in */
  let lastResult=null;      /* the most recent compute() output */
  let addMode=false;        /* map clicks add waypoints */
  let busy=false;

  function newRoute(){ return { id:'dr_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    name:L('New route','新しい経路','Neue Route','Новый маршрут','Nueva ruta'),
    spec:DEFAULT_SPEC(), presetId:'prosumer', wp:[], created:Date.now(), updated:Date.now() }; }
  function loadStore(){ try{ const j=JSON.parse(localStorage.getItem(KEY)||'[]'); if(Array.isArray(j)) routes=j.filter(r=>r&&r.id&&Array.isArray(r.wp)); }catch(_){ routes=[]; } }
  function saveStore(){ try{ localStorage.setItem(KEY,JSON.stringify(routes.slice(0,60))); return true; }catch(_){ return false; } }
  function saveRoute(){ if(!route) return false; route.updated=Date.now();
    const i=routes.findIndex(r=>r.id===route.id);
    const copy=JSON.parse(JSON.stringify(route));
    if(i>=0) routes[i]=copy; else routes.unshift(copy);
    return saveStore(); }
  function openRoute(id){ const r=routes.find(x=>x.id===id); if(!r) return false;
    route=JSON.parse(JSON.stringify(r)); lastResult=null; return true; }
  function deleteRoute(id){ const i=routes.findIndex(x=>x.id===id); if(i<0) return false;
    routes.splice(i,1); saveStore();
    if(route&&route.id===id){ route=newRoute(); lastResult=null; draw(null); }
    return true; }

  /* ---- waypoints ---------------------------------------------------------------------------- */
  function addWaypoint(lng,lat,alt,ref){ if(!route) route=newRoute();
    const a=isFinite(+alt)?+alt:(route.wp.length?route.wp[route.wp.length-1].alt:60);
    route.wp.push({ lng:+lng, lat:+lat, alt:a, ref:(ref==='amsl'?'amsl':(ref||typedRef)), hold:0 });
    lastResult=null; return route.wp.length; }
  function moveWaypoint(i,dir){ if(!route) return false; const j=i+dir;
    if(i<0||j<0||i>=route.wp.length||j>=route.wp.length) return false;
    const t=route.wp[i]; route.wp[i]=route.wp[j]; route.wp[j]=t; lastResult=null; return true; }
  function removeWaypoint(i){ if(!route||i<0||i>=route.wp.length) return false;
    route.wp.splice(i,1); lastResult=null; return true; }
  function setWaypoint(i,patch){ if(!route||!route.wp[i]) return false;
    Object.assign(route.wp[i],patch||{}); lastResult=null; return true; }
  function clearRoute(){ if(route) route.wp=[]; lastResult=null; draw(null); return true; }

  /* ---- ground truth ------------------------------------------------------------------------
     One DEM read for the whole computation. The zoom is chosen from the route's own span with the same
     rule the elevation profile uses, so a 2 km inspection flight is sampled at the DEM's finest level
     and a 300 km ferry is not asked to load ten thousand tiles. */
  function demZoom(spanKm){ try{ return HOST._demZoomForSpan(Math.max(0.5,spanKm)); }catch(_){ return 12; } }
  async function warm(points,z){ try{ await HOST.warmDEMTiles(points,z,12000); }catch(_){} }
  function groundAt(lng,lat,z){
    let v=null; try{ v=HOST.demElevBilinear(lng,lat,z); }catch(_){}
    if(v==null||!isFinite(v)){ try{ v=HOST.demElevAt(lng,lat,null,z); }catch(_){} }
    return (v==null||!isFinite(v))?null:+v; }

  /* ---- densify ------------------------------------------------------------------------------
     The profile must find the RIDGE between two waypoints, not just the ends — that ridge is the thing
     that kills drones. Sample every ~STEP_M along the ground track, with a floor and a ceiling on the
     count so a 300 m hop is still resolved and a 300 km route still answers in one frame. */
  const MIN_SAMPLES=48, MAX_SAMPLES=900;
  function densify(wp){
    if(wp.length<2) return wp.map((p,i)=>({ lng:p.lng, lat:p.lat, wpIndex:i, atWp:true }));
    const legLen=[]; let total=0;
    for(let i=1;i<wp.length;i++){ const d=distM([wp[i-1].lng,wp[i-1].lat],[wp[i].lng,wp[i].lat]); legLen.push(d); total+=d; }
    const want=Math.max(MIN_SAMPLES,Math.min(MAX_SAMPLES,Math.round(total/40)));
    const out=[];
    for(let i=1;i<wp.length;i++){
      const a=[wp[i-1].lng,wp[i-1].lat], b=[wp[i].lng,wp[i].lat], len=legLen[i-1];
      const n=Math.max(2,Math.round(want*(len/Math.max(1,total))));
      if(i===1) out.push({ lng:a[0], lat:a[1], wpIndex:0, atWp:true, leg:0 });
      for(let k=1;k<=n;k++){ const f=k/n; const p=lerpLL(a,b,f);
        out.push({ lng:p[0], lat:p[1], leg:i-1, f, wpIndex:(k===n?i:null), atWp:k===n }); }
    }
    return out;
  }

  /* ---- the computation ----------------------------------------------------------------------
     Returns everything the panel, the map and the tests read. Nothing is rounded here: the numbers are
     kept in SI and formatted at the edge, so a unit change can never alter a verdict. */
  async function compute(){
    if(!route||route.wp.length<1){ lastResult=null; draw(null); return null; }
    busy=true;
    const spec=route.spec||DEFAULT_SPEC();
    const wp=route.wp;
    const samples=densify(wp);
    /* span → DEM zoom, then warm every tile the samples touch before reading a single one */
    let spanKm=0; for(let i=1;i<samples.length;i++) spanKm+=distM([samples[i-1].lng,samples[i-1].lat],[samples[i].lng,samples[i].lat])/1000;
    const z=demZoom(Math.max(1,spanKm));
    await warm(samples.map(s=>[s.lng,s.lat]),z);
    let demMissing=0;
    samples.forEach(s=>{ const g=groundAt(s.lng,s.lat,z); if(g==null) demMissing++; s.ground=(g==null)?0:g; s.groundKnown=(g!=null); });
    /* the ground under each WAYPOINT is what converts its altitude between references */
    const wpGround=wp.map(p=>{ const g=groundAt(p.lng,p.lat,z); return (g==null)?0:g; });
    const wpAmsl=(i)=>{ const p=wp[i]; return p.ref==='amsl'?(+p.alt||0):((+p.alt||0)+wpGround[i]); };
    const wpAgl =(i)=>{ const p=wp[i]; return p.ref==='amsl'?((+p.alt||0)-wpGround[i]):(+p.alt||0); };

    /* along-track distance + the planned altitude at every sample (linear between waypoints, in AMSL —
       the only reference in which "half way up the climb" means the same thing at both ends) */
    let acc=0;
    samples.forEach((s,i)=>{
      if(i>0) acc+=distM([samples[i-1].lng,samples[i-1].lat],[s.lng,s.lat]);
      s.dist=acc;
      if(wp.length===1){ s.amsl=wpAmsl(0); }
      else { const a=wpAmsl(s.leg), b=wpAmsl(s.leg+1); s.amsl=a+(b-a)*(s.f==null?0:s.f); }
      s.agl=s.amsl-s.ground;
    });

    /* ---- per-leg time and energy ----------------------------------------------------------
       A leg's duration is whichever of the two motions takes longer: covering the ground at cruise
       speed, or gaining/losing the height at the rated climb/descent rate. That is what a real
       autopilot does with a straight-line waypoint transition, and it is why a short steep leg can take
       far longer than its distance suggests. */
    const P=powerW(spec), legs=[];
    let totalGround=0, total3D=0, timeS=0, energyWh=0, climbM=0, descentM=0;
    for(let i=1;i<wp.length;i++){
      const a=[wp[i-1].lng,wp[i-1].lat], b=[wp[i].lng,wp[i].lat];
      const d=distM(a,b), dz=wpAmsl(i)-wpAmsl(i-1);
      const s3=Math.hypot(d,dz);
      let gs=Math.max(0.1,+spec.cruiseSpeed||10);
      /* wind seam: the along-track component changes ground speed, nothing else is invented */
      const w=windAt({ lng:(a[0]+b[0])/2, lat:(a[1]+b[1])/2, amsl:(wpAmsl(i)+wpAmsl(i-1))/2 });
      if(w){ const br=bearingDeg(a,b)*D2R; gs=Math.max(0.5, gs + (w.u*Math.sin(br)+w.v*Math.cos(br))); }
      const tH=d/gs;
      const tV=dz>0 ? dz/Math.max(0.05,+spec.climbRate||3) : (-dz)/Math.max(0.05,+spec.descentRate||3);
      const t=Math.max(tH,tV);
      const e=(P*t)/3600 + climbWh(spec,dz);
      legs.push({ from:i-1, to:i, distM:d, dz, dist3D:s3, timeS:t, wh:e, climbLimited:tV>tH, groundSpeed:gs,
        bearing:bearingDeg(a,b) });
      totalGround+=d; total3D+=s3; timeS+=t; energyWh+=e;
      if(dz>0) climbM+=dz; else descentM+=-dz;
    }
    /* waypoint holds are hover time: full power, no distance */
    wp.forEach(p=>{ const h=Math.max(0,+p.hold||0); if(h){ timeS+=h; energyWh+=(P*h)/3600; } });

    /* ---- limits ----------------------------------------------------------------------------
       Each finding names the limit, the place (distance along the route + the waypoint/leg) and the two
       numbers that failed the comparison. "Somewhere the route is too low" is not an answer. */
    const V=[];
    const minAgl=+spec.minAgl||0, maxAgl=+spec.maxAgl||120;
    let worstClear=Infinity, worstClearAt=-1, maxAmsl=-Infinity, maxAglSeen=-Infinity, maxAmslAt=-1;
    samples.forEach((s,i)=>{
      if(s.agl<worstClear){ worstClear=s.agl; worstClearAt=i; }
      if(s.amsl>maxAmsl){ maxAmsl=s.amsl; maxAmslAt=i; }
      if(s.agl>maxAglSeen) maxAglSeen=s.agl;
    });
    /* group consecutive offending samples into ONE finding per stretch — a 4 km ridge is one problem,
       not ninety, and a list of ninety identical rows is unreadable */
    const stretch=(test,make)=>{ let i=0; while(i<samples.length){
        if(!test(samples[i])){ i++; continue; }
        let j=i; while(j+1<samples.length&&test(samples[j+1])) j++;
        let worst=i; for(let k=i;k<=j;k++) if(Math.abs(make.rank(samples[k]))>Math.abs(make.rank(samples[worst]))) worst=k;
        V.push(make.build(i,j,worst)); i=j+1; } };
    stretch(s=>s.agl<0, { rank:s=>s.agl, build:(i,j,w)=>({ kind:'terrain-collision', severity:'critical', at:w,
      fromKm:samples[i].dist/1000, toKm:samples[j].dist/1000,
      text:L('The route passes BELOW the ground: the terrain reaches '+fmtM(samples[w].ground)+' AMSL where the plan is at '+fmtM(samples[w].amsl)+' AMSL.',
             '経路が地表面より下を通ります。計画高度 '+fmtM(samples[w].amsl)+'（海抜）に対し、地形は '+fmtM(samples[w].ground)+'（海抜）に達します。',
             'Die Route verläuft UNTER dem Boden: das Gelände erreicht '+fmtM(samples[w].ground)+' ü. NN, geplant sind '+fmtM(samples[w].amsl)+' ü. NN.',
             'Маршрут проходит НИЖЕ земли: рельеф достигает '+fmtM(samples[w].ground)+' над уровнем моря при плановой высоте '+fmtM(samples[w].amsl)+'.',
             'La ruta pasa POR DEBAJO del suelo: el terreno alcanza '+fmtM(samples[w].ground)+' AMSL donde el plan va a '+fmtM(samples[w].amsl)+' AMSL.') }) });
    stretch(s=>s.agl>=0&&s.agl<minAgl, { rank:s=>s.agl-minAgl, build:(i,j,w)=>({ kind:'min-clearance', severity:'error', at:w,
      fromKm:samples[i].dist/1000, toKm:samples[j].dist/1000,
      text:L('Ground clearance falls to '+fmtM(samples[w].agl)+' AGL — below the '+fmtM(minAgl)+' minimum.',
             '地上高が '+fmtM(samples[w].agl)+'（対地）まで下がり、最低地上高 '+fmtM(minAgl)+' を下回ります。',
             'Bodenabstand sinkt auf '+fmtM(samples[w].agl)+' über Grund — unter dem Minimum von '+fmtM(minAgl)+'.',
             'Высота над землёй падает до '+fmtM(samples[w].agl)+' — ниже минимума '+fmtM(minAgl)+'.',
             'La altura sobre el suelo baja a '+fmtM(samples[w].agl)+' — por debajo del mínimo de '+fmtM(minAgl)+'.') }) });
    stretch(s=>s.agl>maxAgl, { rank:s=>s.agl-maxAgl, build:(i,j,w)=>({ kind:'max-altitude', severity:'error', at:w,
      fromKm:samples[i].dist/1000, toKm:samples[j].dist/1000,
      text:L('The route climbs to '+fmtM(samples[w].agl)+' AGL — above the aircraft’s '+fmtM(maxAgl)+' ceiling.',
             '対地高度が '+fmtM(samples[w].agl)+' に達し、最大飛行高度 '+fmtM(maxAgl)+' を超えます。',
             'Die Route steigt auf '+fmtM(samples[w].agl)+' über Grund — über der Grenze von '+fmtM(maxAgl)+'.',
             'Маршрут поднимается до '+fmtM(samples[w].agl)+' над землёй — выше предела '+fmtM(maxAgl)+'.',
             'La ruta sube a '+fmtM(samples[w].agl)+' sobre el suelo — por encima del techo de '+fmtM(maxAgl)+'.') }) });

    const rangeM=(+spec.rangeKm||0)*1000;
    if(rangeM>0&&total3D>rangeM) V.push({ kind:'range', severity:'error', at:samples.length-1,
      fromKm:rangeM/1000, toKm:total3D/1000,
      text:L('The route is '+fmtKm(total3D)+' long — beyond the '+fmtKm(rangeM)+' range.',
             '経路長 '+fmtKm(total3D)+' は航続距離 '+fmtKm(rangeM)+' を超えています。',
             'Die Route ist '+fmtKm(total3D)+' lang — über der Reichweite von '+fmtKm(rangeM)+'.',
             'Длина маршрута '+fmtKm(total3D)+' превышает дальность '+fmtKm(rangeM)+'.',
             'La ruta mide '+fmtKm(total3D)+' — más que el alcance de '+fmtKm(rangeM)+'.') });
    const cap=Math.max(0.001,+spec.batteryWh||1), reserve=Math.max(0,Math.min(0.6,(+spec.reservePct||0)/100));
    const usable=cap*(1-reserve);
    if(energyWh>usable) V.push({ kind:'battery', severity:'error', at:samples.length-1,
      fromKm:0, toKm:total3D/1000,
      text:L('Needs '+energyWh.toFixed(1)+' Wh of the '+usable.toFixed(1)+' Wh usable ('+cap.toFixed(0)+' Wh minus a '+Math.round(reserve*100)+' % reserve).',
             '必要電力量 '+energyWh.toFixed(1)+' Wh に対し、使用可能は '+usable.toFixed(1)+' Wh（容量 '+cap.toFixed(0)+' Wh − 予備 '+Math.round(reserve*100)+' %）です。',
             'Benötigt '+energyWh.toFixed(1)+' Wh von '+usable.toFixed(1)+' Wh nutzbar ('+cap.toFixed(0)+' Wh minus '+Math.round(reserve*100)+' % Reserve).',
             'Требуется '+energyWh.toFixed(1)+' Вт·ч из '+usable.toFixed(1)+' Вт·ч доступных ('+cap.toFixed(0)+' Вт·ч минус резерв '+Math.round(reserve*100)+' %).',
             'Necesita '+energyWh.toFixed(1)+' Wh de los '+usable.toFixed(1)+' Wh utilizables ('+cap.toFixed(0)+' Wh menos un '+Math.round(reserve*100)+' % de reserva).') });
    if((+spec.cruiseSpeed||0)>(+spec.maxSpeed||0)) V.push({ kind:'speed', severity:'warn', at:0, fromKm:0, toKm:0,
      text:L('Cruise speed is set above the aircraft’s maximum speed.','巡航速度が最大速度を超えて設定されています。','Reisegeschwindigkeit über der Höchstgeschwindigkeit.','Крейсерская скорость превышает максимальную.','La velocidad de crucero supera la máxima.') });
    if(demMissing) V.push({ kind:'dem', severity:'warn', at:0, fromKm:0, toKm:0,
      text:L(demMissing+' of '+samples.length+' points have no elevation data yet — recompute once the terrain tiles have loaded.',
             samples.length+' 点のうち '+demMissing+' 点の標高が未取得です。地形タイル読み込み後に再計算してください。',
             demMissing+' von '+samples.length+' Punkten ohne Höhendaten — nach dem Laden der Kacheln neu berechnen.',
             'Нет данных о высоте для '+demMissing+' из '+samples.length+' точек — пересчитайте после загрузки тайлов.',
             demMissing+' de '+samples.length+' puntos sin datos de elevación — recalcula cuando carguen las teselas.') });
    legs.forEach((lg,i)=>{ if(lg.climbLimited&&lg.distM>0) V.push({ kind:'climb-limited', severity:'info',
      at:Math.min(samples.length-1, samples.findIndex(s=>s.leg===i&&s.f>=0.99)),
      fromKm:0, toKm:0,
      text:L('Leg '+(i+1)+'→'+(i+2)+' is limited by the climb/descent rate, not by speed: '+fmtT(lg.timeS)+' for '+fmtKm(lg.distM)+'.',
             '区間 '+(i+1)+'→'+(i+2)+' は速度ではなく上昇・下降速度で律速します（'+fmtKm(lg.distM)+' に '+fmtT(lg.timeS)+'）。',
             'Abschnitt '+(i+1)+'→'+(i+2)+' ist durch die Steig-/Sinkrate begrenzt: '+fmtT(lg.timeS)+' für '+fmtKm(lg.distM)+'.',
             'Участок '+(i+1)+'→'+(i+2)+' ограничен скоростью набора/снижения: '+fmtT(lg.timeS)+' на '+fmtKm(lg.distM)+'.',
             'El tramo '+(i+1)+'→'+(i+2)+' está limitado por el ascenso/descenso: '+fmtT(lg.timeS)+' para '+fmtKm(lg.distM)+'.') }); });

    /* ---- extension seam: everything else that has an opinion about a point on this route ---- */
    const ctx={ samples, legs, spec, wp, wpGround, route };
    Object.keys(hazardSources).forEach(id=>{ try{ const out=hazardSources[id](ctx);
      (Array.isArray(out)?out:[]).forEach(h=>{ if(!h) return;
        V.push({ kind:String(h.kind||id), severity:h.severity||'warn', at:(h.i!=null?h.i:0),
          fromKm:(samples[h.i!=null?h.i:0]||{dist:0}).dist/1000, toKm:(samples[h.i!=null?h.i:0]||{dist:0}).dist/1000,
          text:String(h.text||''), source:id }); }); }catch(_){} });

    const res={ samples, legs, wpGround,
      wpAmsl:wp.map((_,i)=>wpAmsl(i)), wpAgl:wp.map((_,i)=>wpAgl(i)),
      groundDistM:totalGround, dist3DM:total3D, timeS, energyWh, usableWh:usable, capacityWh:cap,
      batteryPct:(energyWh/Math.max(0.001,cap))*100,
      climbM, descentM, demZoom:z, demMissing,
      maxAmsl:(maxAmsl===-Infinity?null:maxAmsl), maxAmslAt, maxAgl:(maxAglSeen===-Infinity?null:maxAglSeen),
      minClearance:(worstClear===Infinity?null:worstClear), minClearanceAt:worstClearAt,
      violations:V, ok:!V.some(v=>v.severity==='critical'||v.severity==='error'),
      computedAt:Date.now() };
    lastResult=res; busy=false;
    draw(res);
    /* The panel is a VIEW of this result, so it refreshes here rather than at each of the dozen call
       sites — otherwise a route built by Atlas, by "Follow terrain" or by a test leaves an open panel
       showing the previous answer, which is worse than showing none.
       …but never while a field has focus: rewriting innerHTML under a cursor is exactly the defect
       #R171 had to fix in the 3-D volume panel. */
    try{ if(panelOpen()&&!panelFocused()) render(); }catch(_){}
    return res;
  }

  /* ---- follow the terrain ------------------------------------------------------------------
     「実際の地形標高に応じて飛行経路と高度が変化する」 — this is the button that makes it true. Every
     waypoint is lifted to the minimum clearance where it is too low, and where a RIDGE between two
     waypoints breaks the floor a new waypoint is inserted on top of it, so the plan clears the ground
     along its whole length rather than only at its corners. Idempotent: run it twice and the second run
     changes nothing. Nothing is ever lowered — a plan that was deliberately high stays high. */
  const FOLLOW_PASSES=7, FOLLOW_MAX_WP=80;
  async function followTerrain(){
    if(!route||route.wp.length<1) return null;
    const spec=route.spec||DEFAULT_SPEC();
    const clear=Math.max(1,(+spec.minAgl||0))+2;      /* +2 m so a re-run does not sit exactly on the limit */
    let res=await compute(); if(!res) return null;
    /* One pass is not enough and it is worth saying why: putting a waypoint on top of the ridge splits the
       leg in two, and each half can have a ridge of its own. Over a real mountain (measured across Mt Fuji,
       Kawaguchi → the south-west flank) a single pass still left the path 12 m under the ground. So this
       BISECTS until the whole route clears, re-lifting the existing waypoints each time because a leg that
       has just been split may now need a different height at its ends. It converges in a handful of passes;
       the caps are runaway guards, not tuning, and if it hits one the remaining shortfall is still reported
       as a violation rather than quietly declared fixed. */
    for(let pass=0; pass<FOLLOW_PASSES; pass++){
      let changed=false;
      route.wp.forEach((p,i)=>{ const agl=res.wpAgl[i];
        if(agl<clear-0.01){ p.alt=(+p.alt||0)+(clear-agl); changed=true; } });
      if(changed){ lastResult=null; res=await compute(); if(!res) return null; }
      const ins=[];
      for(let leg=0; leg<route.wp.length-1; leg++){
        const seg=res.samples.filter(s=>s.leg===leg&&!s.atWp);
        if(!seg.length) continue;
        let worst=seg[0]; seg.forEach(s=>{ if(s.agl<worst.agl) worst=s; });
        if(worst.agl<clear-0.5) ins.push({ leg, lng:worst.lng, lat:worst.lat, amsl:worst.ground+clear });
      }
      if(!ins.length) break;
      if(route.wp.length+ins.length>FOLLOW_MAX_WP) break;
      ins.sort((a,b)=>b.leg-a.leg).forEach(x=>{
        route.wp.splice(x.leg+1,0,{ lng:x.lng, lat:x.lat, alt:x.amsl, ref:'amsl', hold:0,
          name:L('terrain','地形','Gelände','рельеф','terreno') }); });
      lastResult=null;
      res=await compute(); if(!res) return null;
    }
    return res;
  }

  /* ---- formatting --------------------------------------------------------------------------- */
  function fmtM(m){ if(m==null||!isFinite(m)) return '—';
    try{ return HOST.fmtElevVal(m); }catch(_){ return Math.round(m).toLocaleString()+' m'; } }
  function fmtKm(m){ if(m==null||!isFinite(m)) return '—';
    const km=m/1000; return (km<1?Math.round(m).toLocaleString()+' m':km.toFixed(km<10?2:1)+' km'); }
  function fmtT(s){ if(s==null||!isFinite(s)) return '—';
    const t=Math.round(s); if(t<60) return t+' s';
    const m=Math.floor(t/60), ss=t%60; if(m<60) return m+' min '+String(ss).padStart(2,'0')+' s';
    return Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' min'; }

  /* ---- the map -------------------------------------------------------------------------------
     Four layers off two sources, all through the engine contract:
       · the ground track (a line on the surface) so the plan is locatable from straight down;
       · the flight path itself — one extruded ribbon per densified segment, standing at that segment's
         own real altitude, so a climb is visibly a climb (the technique the aircraft track proved);
       · a post from the ground up to each waypoint, and a marker cube at the waypoint's altitude;
       · a red marker at every place a limit is broken.
     The ribbon's width is derived from the map scale so it stays visible at any zoom — and, unlike the
     aircraft track before this round, it is REBUILT on zoom for exactly that reason. */
  /* declared before draw() uses it — a `let` read from a hoisted function that ran first would be a TDZ
     throw, which is exactly how #R167 lost an afternoon */
  let drawStats={ path:0, air:0, wp:0, hazard:0, halfM:0 };
  const SRC_PATH='drone-path-src', LYR_GROUND='drone-path-ground', LYR_AIR='drone-path-air';
  const SRC_WP='drone-wp-src', LYR_WP_POST='drone-wp-post', LYR_WP='drone-wp', LYR_HAZ='drone-hazard';
  const COL_OK='#0a84ff', COL_BAD='#ff453a', COL_WP='#ffd23f';
  function mppCentre(){ try{ const c=map.getCenter(); let w=0;
      try{ const v=map.transform&&map.transform.worldSize; if(isFinite(v)&&v>0) w=v; }catch(_){}
      if(!w) w=512*Math.pow(2,map.getZoom()||0);
      const m=(2*Math.PI*R_EARTH*Math.cos((c.lat||0)*D2R))/w; return (isFinite(m)&&m>0)?m:50; }catch(_){ return 50; } }
  /* With 3-D terrain ON the renderer's metres are height ABOVE THE GROUND under the map centre; with it
     off they are metres above sea level. Same trap the 3-D volume tool documents — subtract the centre's
     ground elevation when terrain is on so an AMSL number lands at that altitude either way. */
  function groundOffset(){ try{ if(!HOST.terrain3D) return 0;
      const c=map.getCenter(); const g=map.queryTerrainElevation?map.queryTerrainElevation({lng:c.lng,lat:c.lat}):null;
      return (g==null||!isFinite(g))?0:+g; }catch(_){ return 0; } }
  function ribbon(a,b,halfM){ const mLat=110574, mLng=(111320*Math.cos(((a.lat+b.lat)/2)*D2R))||1;
    let dx=(b.lng-a.lng)*mLng, dy=(b.lat-a.lat)*mLat; const len=Math.hypot(dx,dy)||1; dx/=len; dy/=len;
    const nx=-dy*halfM, ny=dx*halfM, P=(p,ox,oy)=>[p.lng+ox/mLng, p.lat+oy/mLat];
    const r=[P(a,nx,ny),P(b,nx,ny),P(b,-nx,-ny),P(a,-nx,-ny)]; r.push(r[0]); return r; }
  function squareRing(lng,lat,halfM){ const mLat=110574, mLng=(111320*Math.cos(lat*D2R))||1;
    const dx=halfM/mLng, dy=halfM/mLat;
    return [[lng-dx,lat-dy],[lng+dx,lat-dy],[lng+dx,lat+dy],[lng-dx,lat+dy],[lng-dx,lat-dy]]; }
  function ensureLayers(){ const E=GE(); if(!E||!E.canDraw()) return false;
    try{
      if(!E.layers.hasSource(SRC_PATH)) E.layers.addSource(SRC_PATH,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!E.layers.hasSource(SRC_WP)) E.layers.addSource(SRC_WP,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!E.layers.has(LYR_GROUND)) E.layers.add({ id:LYR_GROUND, type:'line', source:SRC_PATH,
        filter:['==',['get','kind'],'ground'],
        layout:{'line-cap':'round','line-join':'round'},
        paint:{'line-color':COL_OK,'line-width':1.6,'line-opacity':0.65,'line-dasharray':[2,2]} });
      if(!E.layers.has(LYR_AIR)) E.layers.addExtrusion({ id:LYR_AIR, source:SRC_PATH,
        filter:['==',['get','kind'],'air'],
        paint:{ 'fill-extrusion-color':['case',['==',['get','bad'],1],COL_BAD,COL_OK],
          'fill-extrusion-opacity':0.85,
          'fill-extrusion-base':['get','base'], 'fill-extrusion-height':['get','top'] } });
      if(!E.layers.has(LYR_WP_POST)) E.layers.addExtrusion({ id:LYR_WP_POST, source:SRC_WP,
        filter:['==',['get','kind'],'post'],
        paint:{ 'fill-extrusion-color':COL_WP, 'fill-extrusion-opacity':0.4,
          'fill-extrusion-base':['get','base'], 'fill-extrusion-height':['get','top'] } });
      if(!E.layers.has(LYR_WP)) E.layers.addExtrusion({ id:LYR_WP, source:SRC_WP,
        filter:['==',['get','kind'],'wp'],
        paint:{ 'fill-extrusion-color':COL_WP, 'fill-extrusion-opacity':0.95,
          'fill-extrusion-base':['get','base'], 'fill-extrusion-height':['get','top'] } });
      if(!E.layers.has(LYR_HAZ)) E.layers.addExtrusion({ id:LYR_HAZ, source:SRC_WP,
        filter:['==',['get','kind'],'hazard'],
        paint:{ 'fill-extrusion-color':COL_BAD, 'fill-extrusion-opacity':0.9,
          'fill-extrusion-base':['get','base'], 'fill-extrusion-height':['get','top'] } });
      return true;
    }catch(_){ return false; }
  }
  function draw(res){ const E=GE(); if(!E) return false;
    if(!res||!res.samples||res.samples.length<1){
      try{ [LYR_GROUND,LYR_AIR,LYR_WP_POST,LYR_WP,LYR_HAZ].forEach(l=>{ if(E.layers.has(l)) E.layers.setVisible(l,false); }); }catch(_){}
      return false; }
    if(!ensureLayers()) return false;
    const mpp=mppCentre(), off=groundOffset();
    const half=Math.max(3, 2.2*mpp), thick=Math.max(3, 2.2*mpp);
    const wpHalf=Math.max(8, 7*mpp), postHalf=Math.max(1.2, 0.9*mpp);
    const minAgl=+((route&&route.spec&&route.spec.minAgl)||0);
    const feats=[];
    if(res.samples.length>=2) feats.push({ type:'Feature', properties:{kind:'ground'},
      geometry:{ type:'LineString', coordinates:res.samples.map(s=>[s.lng,s.lat]) } });
    for(let i=1;i<res.samples.length;i++){
      const a=res.samples[i-1], b=res.samples[i];
      const mid=((a.amsl+b.amsl)/2)-off;
      const bad=(a.agl<minAgl||b.agl<minAgl)?1:0;
      feats.push({ type:'Feature', properties:{ kind:'air', bad, base:Math.max(0,mid-thick/2), top:Math.max(0.5,mid+thick/2) },
        geometry:{ type:'Polygon', coordinates:[ribbon(a,b,half)] } });
    }
    try{ E.layers.setSourceData(SRC_PATH,{type:'FeatureCollection',features:feats}); }catch(_){}
    const wfeats=[];
    (route?route.wp:[]).forEach((p,i)=>{
      const amsl=res.wpAmsl[i], g=res.wpGround[i];
      const top=Math.max(0.5, amsl-off), base=Math.max(0, g-off);
      wfeats.push({ type:'Feature', properties:{ kind:'post', base, top:Math.max(base+0.5,top) },
        geometry:{ type:'Polygon', coordinates:[squareRing(p.lng,p.lat,postHalf)] } });
      wfeats.push({ type:'Feature', properties:{ kind:'wp', idx:i, base:Math.max(0,top-wpHalf/2), top:top+wpHalf/2 },
        geometry:{ type:'Polygon', coordinates:[squareRing(p.lng,p.lat,wpHalf)] } });
    });
    res.violations.forEach(v=>{ const s=res.samples[v.at]; if(!s||v.severity==='info'||v.severity==='warn') return;
      const y=Math.max(0.5,(s.ground-off));
      wfeats.push({ type:'Feature', properties:{ kind:'hazard', base:y, top:y+Math.max(20,6*mpp) },
        geometry:{ type:'Polygon', coordinates:[squareRing(s.lng,s.lat,Math.max(6,4*mpp))] } }); });
    try{ E.layers.setSourceData(SRC_WP,{type:'FeatureCollection',features:wfeats}); }catch(_){}
    try{ [LYR_GROUND,LYR_AIR,LYR_WP_POST,LYR_WP,LYR_HAZ].forEach(l=>{ if(E.layers.has(l)) E.layers.setVisible(l,true); }); }catch(_){}
    /* What was actually handed over, remembered here rather than read back out of the renderer: MapLibre 5
       does not expose a GeoJSON source's data, and querying the rendered features of a fill-extrusion
       answers at its FOOTPRINT, so neither is a straight answer to "did the route get drawn?" (the same
       trap the lifted aircraft documented in #R173). */
    drawStats={ path:feats.length, air:feats.filter(f=>f.properties.kind==='air').length,
      wp:wfeats.filter(f=>f.properties.kind==='wp').length,
      hazard:wfeats.filter(f=>f.properties.kind==='hazard').length, halfM:Math.round(half) };
    return true;
  }
  function eraseMap(){ const E=GE(); if(!E) return;
    try{ [LYR_GROUND,LYR_AIR,LYR_WP_POST,LYR_WP,LYR_HAZ].forEach(l=>{ if(E.layers.has(l)) E.layers.remove(l); });
      E.layers.removeSource(SRC_PATH); E.layers.removeSource(SRC_WP); }catch(_){} }
  /* the ribbon's width is a function of the scale, so it has to be rebuilt when the scale changes —
     the lesson the aircraft track had to learn the hard way this same round */
  let _zoomT=null;
  function onZoom(){ if(!lastResult||!panelOpen()) return;
    clearTimeout(_zoomT); _zoomT=setTimeout(()=>{ try{ draw(lastResult); }catch(_){} },180); }

  /* ---- the panel ----------------------------------------------------------------------------- */
  let panel=null;
  const panelOpen=()=>!!(panel&&panel.style.display!=='none');
  const panelFocused=()=>{ try{ const a=document.activeElement;
    return !!(panel&&a&&panel.contains(a)&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)); }catch(_){ return false; } };
  /* window.IntMapSafe is the app's ONE sanitizer (#R138) — route names are typed by the user and land in
     innerHTML, so they go through it like every other user string in the app. */
  function esc(s){ try{ return window.IntMapSafe.html(String(s)); }
    catch(_){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); } }
  function specLabel(f){ return f.lbl[HOST.lang==='jp'?1:HOST.lang==='de'?2:HOST.lang==='ru'?3:HOST.lang==='es'?4:0]; }
  function presetName(p){ return p.name[HOST.lang==='jp'?1:HOST.lang==='de'?2:HOST.lang==='ru'?3:HOST.lang==='es'?4:0]; }

  function ensurePanel(){
    if(panel) return panel;
    panel=document.createElement('div'); panel.id='drone-panel'; panel.className='tool-panel';
    (document.getElementById('map-container')||document.body).appendChild(panel);
    return panel;
  }
  function render(){
    const p=ensurePanel(); if(!route) route=newRoute();
    const st=lastResult;
    const refSel=`<select id="dn-ref" class="v3d-unitsel">
      <option value="agl"${typedRef==='agl'?' selected':''}>AGL — ${L('above ground','対地高度','über Grund','над землёй','sobre el suelo')}</option>
      <option value="amsl"${typedRef==='amsl'?' selected':''}>AMSL — ${L('above sea level','海抜高度','über NN','над уровнем моря','sobre el nivel del mar')}</option></select>`;
    const wpRows=route.wp.map((w,i)=>{
      const amsl=st&&st.wpAmsl?st.wpAmsl[i]:null, agl=st&&st.wpAgl?st.wpAgl[i]:null;
      return `<div class="dn-wp" data-i="${i}">
        <span class="dn-wp-n">${i+1}</span>
        <span class="dn-wp-ll">${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}</span>
        <input type="number" class="dn-wp-alt" data-i="${i}" step="1" inputmode="decimal" value="${Math.round(+w.alt||0)}">
        <span class="dn-wp-ref">${w.ref==='amsl'?'AMSL':'AGL'}</span>
        <span class="dn-wp-both">${amsl==null?'':(fmtM(amsl)+' AMSL · '+fmtM(agl)+' AGL')}</span>
        <span class="dn-wp-btns"><button type="button" data-up="${i}" title="↑">↑</button><button type="button" data-down="${i}" title="↓">↓</button><button type="button" data-del="${i}" title="✕">✕</button></span>
      </div>`; }).join('');
    const row=(k,v)=>`<div class="tp-row"><span>${k}</span><b>${v}</b></div>`;
    const results=!st?`<div class="tp-hint">${L('Add at least two waypoints, then compute.','ウェイポイントを2点以上追加して計算してください。','Mindestens zwei Wegpunkte hinzufügen und berechnen.','Добавьте не менее двух точек и рассчитайте.','Añade al menos dos puntos y calcula.')}</div>`
      : row(L('Ground distance','水平距離','Grundstrecke','Дистанция по земле','Distancia en tierra'), fmtKm(st.groundDistM))
        +row(L('Path length (3-D)','経路長（立体）','Streckenlänge (3-D)','Длина маршрута (3-D)','Longitud (3-D)'), fmtKm(st.dist3DM))
        +row(L('Estimated time','予想飛行時間','Geschätzte Dauer','Расчётное время','Tiempo estimado'), fmtT(st.timeS))
        +row(L('Highest point','最高高度','Höchster Punkt','Наивысшая точка','Punto más alto'), fmtM(st.maxAmsl)+' AMSL · '+fmtM(st.maxAgl)+' AGL')
        +row(L('Lowest clearance','最小地上高','Geringster Bodenabstand','Мин. высота над землёй','Menor altura sobre el suelo'), fmtM(st.minClearance)+' AGL')
        +row(L('Total climb','総上昇量','Gesamtsteigen','Общий набор','Ascenso total'), fmtM(st.climbM))
        +row(L('Battery','バッテリー消費','Akku','Батарея','Batería'), st.energyWh.toFixed(1)+' Wh · '+Math.round(st.batteryPct)+' %');
    const vio=!st?'':(st.violations.length
      ? `<div class="dn-vio-h">${L('Conditions not met','飛行条件を満たさない点','Nicht erfüllte Bedingungen','Невыполненные условия','Condiciones no cumplidas')} (${st.violations.length})</div>`
        +st.violations.map(v=>`<div class="dn-vio dn-${esc(v.severity)}" data-at="${v.at}"><b>${esc(kindLabel(v.kind))}</b> <span class="dn-vio-at">${v.toKm?('· '+v.fromKm.toFixed(2)+'–'+v.toKm.toFixed(2)+' km'):''}</span><br>${esc(v.text)}</div>`).join('')
      : `<div class="dn-ok">✓ ${L('Every condition is met.','すべての飛行条件を満たしています。','Alle Bedingungen erfüllt.','Все условия выполнены.','Se cumplen todas las condiciones.')}</div>`);
    const specRows=SPEC_FIELDS.map(f=>`<label class="dn-spec"><span>${esc(specLabel(f))}</span><input type="number" data-spec="${f.k}" step="${f.step}" min="${f.min}" max="${f.max}" inputmode="decimal" value="${route.spec[f.k]}"><i>${f.unit}</i></label>`).join('');
    const saved=routes.length?`<div class="dn-saved">${routes.map(r=>`<div class="dn-saved-row"><button type="button" class="dn-open" data-open="${esc(r.id)}">${esc(r.name)}</button><span>${(r.wp||[]).length}</span><button type="button" class="dn-del" data-drop="${esc(r.id)}">✕</button></div>`).join('')}</div>`:'';

    p.innerHTML=`<div class="tp-header"><span class="tp-title">🛸 ${L('Drone navigation','ドローン航法','Drohnen-Navigation','Навигация дрона','Navegación de dron')}</span>
        <span class="tp-hd-btns"><button class="tp-min-btn" type="button" title="–">–</button><button class="tp-close" type="button" title="${HOST.t('close')}">✕</button></span></div>
      <input type="text" id="dn-name" class="dn-name" value="${esc(route.name)}">
      <div class="dn-sec">${L('Aircraft','機体','Fluggerät','Аппарат','Aeronave')}</div>
      <select id="dn-preset" class="tp-select">${PRESETS.map(x=>`<option value="${x.id}"${route.presetId===x.id?' selected':''}>${esc(presetName(x))}</option>`).join('')}<option value="custom"${route.presetId==='custom'?' selected':''}>${L('Custom','カスタム','Eigene','Свой','Personalizado')}</option></select>
      <details class="tp-more" id="dn-specbox"${route.wp.length?'':' open'}><summary>${L('Aircraft limits','機体条件','Grenzwerte','Ограничения','Límites')}</summary><div class="dn-specs">${specRows}</div></details>
      <div class="dn-sec">${L('Waypoints','ウェイポイント','Wegpunkte','Точки маршрута','Puntos de ruta')} <span class="dn-refbox">${refSel}</span></div>
      <div class="dn-wps">${wpRows||`<div class="tp-hint">${addMode?L('Click the map to drop a waypoint.','地図をクリックしてウェイポイントを追加します。','Auf die Karte klicken, um einen Wegpunkt zu setzen.','Нажмите на карту, чтобы добавить точку.','Haz clic en el mapa para añadir un punto.'):L('Press “Add on map”, then click the map.','「地図に追加」を押してから地図をクリックしてください。','„Auf Karte setzen“ drücken und klicken.','Нажмите «Добавить на карте», затем кликните.','Pulsa «Añadir en el mapa» y haz clic.')}</div>`}</div>
      <div class="dn-btns">
        <button type="button" class="ai-action-btn${addMode?' on':''}" id="dn-add">${addMode?('◉ '+L('Click the map','地図をクリック','Karte anklicken','Кликните по карте','Haz clic en el mapa')):('＋ '+L('Add on map','地図に追加','Auf Karte setzen','Добавить на карте','Añadir en el mapa'))}</button>
        ${HOST.isMobile()?`<button type="button" class="ai-action-btn" id="dn-addc">◎ ${L('Add at centre','中心に追加','In der Mitte','В центре','En el centro')}</button>`:''}
        <button type="button" class="ai-action-btn" id="dn-calc">${busy?'…':'⟳ '+L('Compute','計算','Berechnen','Рассчитать','Calcular')}</button>
        <button type="button" class="ai-action-btn" id="dn-follow">⛰ ${L('Follow terrain','地形に沿わせる','Gelände folgen','По рельефу','Seguir el terreno')}</button>
        <button type="button" class="ai-action-btn" id="dn-save">💾 ${L('Save','保存','Speichern','Сохранить','Guardar')}</button>
        <button type="button" class="tp-clear" id="dn-clear">${L('Clear route','経路を消去','Route löschen','Очистить','Borrar ruta')}</button>
      </div>
      <div class="dn-sec">${L('Result','計算結果','Ergebnis','Результат','Resultado')}</div>
      ${results}
      <canvas id="dn-profile" class="dn-profile" width="520" height="150"></canvas>
      <div class="dn-profile-lbl">${L('Altitude profile — terrain (filled) and the planned path','高度推移 — 地形（塗り）と飛行経路','Höhenprofil — Gelände und Flugweg','Профиль высот — рельеф и маршрут','Perfil de altitud — terreno y ruta')}</div>
      ${vio}
      ${routes.length?`<div class="dn-sec">${L('Saved routes','保存した経路','Gespeicherte Routen','Сохранённые маршруты','Rutas guardadas')}</div>`:''}${saved}`;
    wire(p);
    drawProfile();
    return p;
  }
  function kindLabel(k){
    const M={ 'terrain-collision':['Terrain','地形との接触','Gelände','Рельеф','Terreno'],
      'min-clearance':['Ground clearance','最低地上高','Bodenabstand','Высота над землёй','Altura sobre el suelo'],
      'max-altitude':['Altitude limit','最大高度','Höhengrenze','Предел высоты','Límite de altitud'],
      'range':['Range','航続距離','Reichweite','Дальность','Alcance'],
      'battery':['Battery','バッテリー','Akku','Батарея','Batería'],
      'speed':['Speed','速度','Geschwindigkeit','Скорость','Velocidad'],
      'dem':['Elevation data','標高データ','Höhendaten','Данные о высоте','Datos de elevación'],
      'climb-limited':['Climb-limited','上昇律速','Steigbegrenzt','Ограничение набора','Limitado por ascenso'] };
    const a=M[k]; if(!a) return k;
    return a[HOST.lang==='jp'?1:HOST.lang==='de'?2:HOST.lang==='ru'?3:HOST.lang==='es'?4:0]; }

  /* the altitude profile: the terrain silhouette with the flight path over it, plus the minimum-clearance
     envelope, so "why is this leg red" is answerable at a glance */
  function drawProfile(){
    const cv=panel&&panel.querySelector('#dn-profile'); if(!cv) return;
    const ctx=cv.getContext('2d'); if(!ctx) return;
    const W=cv.width, H=cv.height; ctx.clearRect(0,0,W,H);
    const st=lastResult; if(!st||!st.samples.length) return;
    const S=st.samples, minAgl=+((route&&route.spec&&route.spec.minAgl)||0);
    let lo=Infinity, hi=-Infinity;
    S.forEach(s=>{ lo=Math.min(lo,s.ground,s.amsl); hi=Math.max(hi,s.ground+minAgl,s.amsl); });
    if(!(isFinite(lo)&&isFinite(hi))) return;
    if(hi-lo<20){ hi=lo+20; }
    const pad=10, x=i=>pad+(W-2*pad)*(S[i].dist/Math.max(1,S[S.length-1].dist)), y=v=>H-pad-(H-2*pad)*((v-lo)/(hi-lo));
    /* terrain */
    ctx.beginPath(); ctx.moveTo(x(0),H-pad);
    S.forEach((s,i)=>ctx.lineTo(x(i),y(s.ground)));
    ctx.lineTo(x(S.length-1),H-pad); ctx.closePath();
    ctx.fillStyle='rgba(128,128,128,0.35)'; ctx.fill();
    ctx.strokeStyle='rgba(120,120,120,0.9)'; ctx.lineWidth=1; ctx.stroke();
    /* minimum-clearance envelope */
    if(minAgl>0){ ctx.beginPath(); S.forEach((s,i)=>{ const px=x(i), py=y(s.ground+minAgl); i?ctx.lineTo(px,py):ctx.moveTo(px,py); });
      ctx.strokeStyle='rgba(255,69,58,0.55)'; ctx.setLineDash([4,3]); ctx.lineWidth=1; ctx.stroke(); ctx.setLineDash([]); }
    /* the flight path, red where it breaks the floor */
    for(let i=1;i<S.length;i++){ ctx.beginPath(); ctx.moveTo(x(i-1),y(S[i-1].amsl)); ctx.lineTo(x(i),y(S[i].amsl));
      ctx.strokeStyle=(S[i].agl<minAgl||S[i-1].agl<minAgl)?'#ff453a':'#0a84ff'; ctx.lineWidth=2; ctx.stroke(); }
    /* waypoints */
    ctx.fillStyle='#ffd23f'; S.forEach((s,i)=>{ if(s.atWp){ ctx.beginPath(); ctx.arc(x(i),y(s.amsl),3,0,7); ctx.fill(); } });
    /* the scale, so the picture is a measurement and not a sketch */
    ctx.fillStyle='rgba(128,128,128,0.95)'; ctx.font='9px ui-monospace,monospace';
    ctx.fillText(Math.round(hi)+' m', 2, 9); ctx.fillText(Math.round(lo)+' m', 2, H-2);
  }

  function wire(p){
    p.querySelector('.tp-close').onclick=close;
    { const mb=p.querySelector('.tp-min-btn'); if(mb) mb.onclick=(e)=>{ e.stopPropagation(); p.classList.toggle('tp-collapsed'); }; }
    try{ HOST.makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
    const nm=p.querySelector('#dn-name'); if(nm) nm.onchange=()=>{ route.name=nm.value.slice(0,60)||route.name; };
    const pre=p.querySelector('#dn-preset'); if(pre) pre.onchange=()=>{ const x=PRESETS.find(q=>q.id===pre.value);
      route.presetId=pre.value; if(x) route.spec=Object.assign({},x.spec); lastResult=null; render(); };
    p.querySelectorAll('[data-spec]').forEach(inp=>{ inp.onchange=()=>{ const k=inp.getAttribute('data-spec');
      const f=SPEC_FIELDS.find(q=>q.k===k); const v=parseFloat(inp.value);
      if(f&&isFinite(v)){ route.spec[k]=Math.max(f.min,Math.min(f.max,v)); inp.value=route.spec[k]; route.presetId='custom'; lastResult=null; }
      const ps=p.querySelector('#dn-preset'); if(ps) ps.value='custom'; }; });
    const rs=p.querySelector('#dn-ref'); if(rs) rs.onchange=()=>{ typedRef=rs.value==='amsl'?'amsl':'agl'; };
    p.querySelectorAll('.dn-wp-alt').forEach(inp=>{ inp.onchange=()=>{ const i=+inp.getAttribute('data-i');
      const v=parseFloat(inp.value); if(isFinite(v)) setWaypoint(i,{alt:v}); compute().then(render); }; });
    p.querySelectorAll('[data-up]').forEach(b=>{ b.onclick=()=>{ if(moveWaypoint(+b.getAttribute('data-up'),-1)) compute().then(render); }; });
    p.querySelectorAll('[data-down]').forEach(b=>{ b.onclick=()=>{ if(moveWaypoint(+b.getAttribute('data-down'),1)) compute().then(render); }; });
    p.querySelectorAll('[data-del]').forEach(b=>{ b.onclick=()=>{ if(removeWaypoint(+b.getAttribute('data-del'))) compute().then(render); }; });
    { const b=p.querySelector('#dn-add'); if(b) b.onclick=()=>{ addMode=!addMode;
        try{ map.getCanvas().style.cursor=addMode?'crosshair':''; }catch(_){} render(); }; }
    { const b=p.querySelector('#dn-addc'); if(b) b.onclick=()=>{ try{ const c=map.getCenter(); addWaypoint(c.lng,c.lat); }catch(_){} compute().then(render); }; }
    { const b=p.querySelector('#dn-calc'); if(b) b.onclick=()=>{ compute().then(render); }; }
    { const b=p.querySelector('#dn-follow'); if(b) b.onclick=()=>{ followTerrain().then(render); }; }
    { const b=p.querySelector('#dn-save'); if(b) b.onclick=()=>{ if(saveRoute()){ try{ HOST.imToast(L('Route saved','経路を保存しました','Route gespeichert','Маршрут сохранён','Ruta guardada')); }catch(_){} render(); } }; }
    { const b=p.querySelector('#dn-clear'); if(b) b.onclick=()=>{ clearRoute(); render(); }; }
    p.querySelectorAll('[data-open]').forEach(b=>{ b.onclick=()=>{ if(openRoute(b.getAttribute('data-open'))) compute().then(render); }; });
    p.querySelectorAll('[data-drop]').forEach(b=>{ b.onclick=()=>{ if(deleteRoute(b.getAttribute('data-drop'))) render(); }; });
    /* clicking a finding flies to the point it is about — the reason and the place, together */
    p.querySelectorAll('.dn-vio').forEach(d=>{ d.onclick=()=>{ const st=lastResult; if(!st) return;
      const s=st.samples[+d.getAttribute('data-at')]; if(!s) return;
      try{ map.flyTo({ center:[s.lng,s.lat], zoom:Math.max(map.getZoom(),14), pitch:Math.max(map.getPitch(),55), duration:900 }); }catch(_){} }; });
  }

  /* ---- map clicks ---------------------------------------------------------------------------
     The planner takes a click only while "Add on map" is armed, and it is the ONLY thing it takes — no
     handler is installed on the map that could interfere with the measure tools, the aircraft picker or
     anything else when the planner is closed. On phones the app's convention is that a tap never adds a
     point (a tap is a pan that started); the "Add at centre" button is the touch route, exactly as the
     measure tool does it. */
  function onMapClick(e){ if(!addMode||!panelOpen()) return;
    if(HOST.isMobile()) return;
    try{ e.preventDefault&&e.preventDefault(); }catch(_){}
    addWaypoint(e.lngLat.lng,e.lngLat.lat);
    compute().then(render); }

  function open(){ loadStore(); if(!route) route=newRoute();
    const p=render(); p.style.display='block';
    p.style.cssText+=';left:16px;top:74px;width:min(330px,calc(100vw - 24px));max-height:calc(100vh - 120px);overflow:auto;z-index:1500;';
    try{ HOST.bringToFront&&HOST.bringToFront(p); }catch(_){}
    if(lastResult) draw(lastResult);
    return true; }
  function close(){ addMode=false; try{ map.getCanvas().style.cursor=''; }catch(_){}
    if(panel) panel.style.display='none'; draw(null); return true; }
  function toggle(){ return panelOpen()?close():open(); }

  /* ---- boot ---------------------------------------------------------------------------------- */
  loadStore();
  try{ map.on('click',onMapClick); map.on('zoomend',onZoom); map.on('terrain',onZoom); }catch(_){}
  window.addEventListener('intmap-lang',()=>{ if(panelOpen()) render(); });
  function wireButton(){ const b=document.getElementById('btn-tool-drone'); if(b&&!b._dn){ b._dn=1;
      b.onclick=()=>{ toggle(); try{ window._closeMeasureMenu&&window._closeMeasureMenu(); }catch(_){} }; } }
  if(document.readyState!=='loading') setTimeout(wireButton,0); else document.addEventListener('DOMContentLoaded',()=>setTimeout(wireButton,0));
  setTimeout(wireButton,1200);

  const API={ open, close, toggle, isOpen:panelOpen,
    /* the route model */
    newRoute(){ route=newRoute(); lastResult=null; draw(null); return route; },
    route:()=>route?JSON.parse(JSON.stringify(route)):null,
    setRoute(r){ if(!r||!Array.isArray(r.wp)) return false; route=JSON.parse(JSON.stringify(r));
      if(!route.spec) route.spec=DEFAULT_SPEC(); if(!route.id) route.id=newRoute().id; lastResult=null; return true; },
    addWaypoint(lng,lat,alt,ref){ const n=addWaypoint(lng,lat,alt,ref); if(panelOpen()) render(); return n; },
    setWaypoint, removeWaypoint, moveWaypoint, clearRoute,
    setSpec(patch){ if(!route) route=newRoute(); Object.assign(route.spec,patch||{}); route.presetId='custom'; lastResult=null; return route.spec; },
    spec:()=>route?Object.assign({},route.spec):null,
    presets:()=>PRESETS.map(p=>({ id:p.id, name:presetName(p), spec:Object.assign({},p.spec) })),
    usePreset(id){ const x=PRESETS.find(q=>q.id===id); if(!x||!route) return false;
      route.spec=Object.assign({},x.spec); route.presetId=id; lastResult=null; return true; },
    setTypedRef(r){ typedRef=(r==='amsl')?'amsl':'agl'; return typedRef; }, typedRef:()=>typedRef,
    setAddMode(v){ addMode=!!v; try{ map.getCanvas().style.cursor=addMode?'crosshair':''; }catch(_){} if(panelOpen()) render(); return addMode; },
    /* the answer */
    compute, followTerrain, result:()=>lastResult,
    /* storage */
    routes:()=>routes.map(r=>({ id:r.id, name:r.name, waypoints:(r.wp||[]).length, updated:r.updated })),
    /* `open` above is the PANEL. Opening a SAVED route is `load`, deliberately spelled differently —
       two members of the same object cannot both be called open, and the last one silently wins. */
    save:saveRoute, load:openRoute, remove:deleteRoute,
    /* extension seams */
    registerHazardSource, unregisterHazardSource, hazardSourceIds, registerWindField,
    /* diagnostics — Atlas + the tests read these instead of poking at the renderer */
    state:()=>({ open:panelOpen(), addMode, typedRef,
      waypoints:route?route.wp.length:0, name:route?route.name:null, presetId:route?route.presetId:null,
      spec:route?Object.assign({},route.spec):null, savedRoutes:routes.length,
      hazardSources:hazardSourceIds(), windField:!!windField,
      result:lastResult?{ groundDistM:lastResult.groundDistM, dist3DM:lastResult.dist3DM, timeS:lastResult.timeS,
        energyWh:lastResult.energyWh, batteryPct:lastResult.batteryPct, maxAmsl:lastResult.maxAmsl, maxAgl:lastResult.maxAgl,
        minClearance:lastResult.minClearance, samples:lastResult.samples.length, demZoom:lastResult.demZoom,
        demMissing:lastResult.demMissing, ok:lastResult.ok,
        violations:lastResult.violations.map(v=>({ kind:v.kind, severity:v.severity, text:v.text })) }:null,
      drawn:(()=>{ try{ const E=GE(); return !!(E&&E.layers.has(LYR_AIR)&&E.layers.isVisible(LYR_AIR)); }catch(_){ return false; } })(),
      draw:Object.assign({},drawStats) }),
    /* the pure model, exported so it can be tested without a map */
    _math:{ distM, bearingDeg, lerpLL, powerW, climbWh, densify }, eraseMap };
  window.IntMapDrone=API;
  return API;
};
