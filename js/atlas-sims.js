/* ============================================================================
 *  IntMap · Atlas — animated flight, ballistic, blast, elevation and faction overlays  (#R199)
 * ----------------------------------------------------------------------------
 *  The time-stepped overlays: great-circle flight (#R72), the Keplerian ballistic solve with its
 *  Coriolis-corrected ground track and altitude profile, the blast-ring builder, the elevation grid and
 *  the historical faction painter. All of them are "compute a geometry, hand it to the engine, step it".
 *
 *  Lifted out of js/atlas-console.js's 239-line block verbatim (#R199). It is a REAL ES module:
 *  nothing registers it on window.IntMapModules and nothing depends on load order — js/atlas-console.js
 *  names it in an `import`, so the bundler resolves the binding and orders the graph.
 *
 *  Everything the block used to read from the console's closure arrives through `CTX` (and the app's
 *  live host through `HOST`), rebound below under the ORIGINAL names so the body stays byte-identical.
 *  tests/r199-checks.test.mjs re-derives that byte-identity from the two files on every commit.
 * ==========================================================================*/
export function makeAtlasSims(HOST, CTX) {
  const GE=CTX.GE, L=CTX.L, _fetchJSON=CTX._fetchJSON, diskFillPolys=CTX.diskFillPolys, geo=CTX.geo;
    /* ---- (#R72) animated FLIGHT engine (ICBM / plane / cruise viewpoint along a great circle) ---- */
    let _flyRun=null;
    function _gcPoint(A,B,t){ /* spherical linear interpolation */
      const d2r=Math.PI/180, r2d=180/Math.PI;
      const f1=A.lat*d2r,l1=A.lng*d2r,f2=B.lat*d2r,l2=B.lng*d2r;
      const dd=2*Math.asin(Math.sqrt(Math.sin((f2-f1)/2)**2+Math.cos(f1)*Math.cos(f2)*Math.sin((l2-l1)/2)**2));
      if(dd<1e-9) return {lng:A.lng,lat:A.lat};
      const a2=Math.sin((1-t)*dd)/Math.sin(dd), b2=Math.sin(t*dd)/Math.sin(dd);
      const x=a2*Math.cos(f1)*Math.cos(l1)+b2*Math.cos(f2)*Math.cos(l2);
      const y=a2*Math.cos(f1)*Math.sin(l1)+b2*Math.cos(f2)*Math.sin(l2);
      const z=a2*Math.sin(f1)+b2*Math.sin(f2);
      return {lng:Math.atan2(y,x)*r2d, lat:Math.atan2(z,Math.sqrt(x*x+y*y))*r2d}; }
    function _gcKm(A,B){ const d2r=Math.PI/180; const f1=A.lat*d2r,f2=B.lat*d2r,dl=(B.lng-A.lng)*d2r;
      return 6371*2*Math.asin(Math.sqrt(Math.sin((f2-f1)/2)**2+Math.cos(f1)*Math.cos(f2)*Math.sin(dl/2)**2)); }
    function _gcBearing(A,B){ const d2r=Math.PI/180,r2d=180/Math.PI; const f1=A.lat*d2r,f2=B.lat*d2r,dl=(B.lng-A.lng)*d2r;
      return (Math.atan2(Math.sin(dl)*Math.cos(f2),Math.cos(f1)*Math.sin(f2)-Math.sin(f1)*Math.cos(f2)*Math.cos(dl))*r2d+360)%360; }
    function ensureFlyLayers(){ try{
      if(!GE().layers.hasSource('nlq-fly-src')) GE().layers.addSource('nlq-fly-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!GE().layers.has('nlq-fly-line')) GE().layers.add({id:'nlq-fly-line',type:'line',source:'nlq-fly-src',filter:['==','$type','LineString'],layout:{'line-cap':'round'},paint:{'line-color':['coalesce',['get','color'],'#ff453a'],'line-width':2.5,'line-dasharray':[2,1.6],'line-opacity':0.9}});
      if(!GE().layers.has('nlq-fly-head')) GE().layers.add({id:'nlq-fly-head',type:'circle',source:'nlq-fly-src',filter:['==','$type','Point'],paint:{'circle-radius':6,'circle-color':'#ffd60a','circle-stroke-color':'#ff453a','circle-stroke-width':2.5}});
      return true; }catch(_){ return false; } }
    function clearFly(){ if(_flyRun){ _flyRun.cancel=true; _flyRun=null; }
      try{ GE().layers.setSourceData('nlq-fly-src',{type:'FeatureCollection',features:[]}); }catch(_){} }
    async function flyAnimate(A,B,mode,secs){
      const km=_gcKm(A,B); if(!isFinite(km)||km<1) return {ok:false,km:0,real:''};
      clearFly(); if(!ensureFlyLayers()) return {ok:false,km,real:''};
      /* real-world flight time for the honest note */
      const spd=mode==='icbm'?(km>5500?6.5:4.5):mode==='cruise'?0.24:0.25;   /* km/s: ICBM midcourse ~4.5-6.5, cruise ~880 km/h, airliner ~900 km/h */
      const realMin=Math.round(km/spd/60);
      const real=(mode==='icbm')?L('real ICBM flight time ≈ '+realMin+' min','実際のICBM飛行時間 ≈ 約'+realMin+'分','reale ICBM-Flugzeit ≈ '+realMin+' Min.','реальное время полёта МБР ≈ '+realMin+' мин','tiempo real de vuelo ≈ '+realMin+' min')
        :L('real flight time ≈ '+(realMin>=90?(Math.round(realMin/6)/10+' h'):(realMin+' min')),'実際の飛行時間 ≈ '+(realMin>=90?(Math.round(realMin/6)/10+'時間'):('約'+realMin+'分')),'reale Flugzeit ≈ '+realMin+' Min.','реальное время ≈ '+realMin+' мин','tiempo real ≈ '+realMin+' min');
      /* zoom/pitch profile: ICBM boosts up (zoom out to apogee), re-enters (zoom back in); plane/cruise stay level */
      const zEnd=Math.max(3,9.5-Math.log2(Math.max(1,km/60)));
      const zMid=(mode==='icbm')?Math.max(1.8,zEnd-3.6):(mode==='cruise')?zEnd+1.2:zEnd;
      const pStart=(mode==='icbm')?52:62, pMid=(mode==='icbm')?18:(mode==='cruise')?68:60, pEnd=(mode==='icbm')?58:55;
      const run={cancel:false}; _flyRun=run;
      const cancelEvt=()=>{ run.cancel=true; };
      try{ GE().events.on('mousedown',cancelEvt); GE().events.on('touchstart',cancelEvt); GE().events.on('wheel',cancelEvt); }catch(_){}
      const t0=performance.now(); const dur=secs*1000;
      const path=[];
      try{ GE().camera.jumpTo({center:[A.lng,A.lat],zoom:zEnd+0.5,bearing:_gcBearing(A,B),pitch:pStart}); }catch(_){}
      await new Promise(res=>{
        const frame=(now)=>{ if(run.cancel){ res(); return; }
          let t=Math.min(1,(now-t0)/dur);
          /* ease in/out */ const te=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
          const pos=_gcPoint(A,B,te);
          path.push([pos.lng,pos.lat]);
          const ahead=_gcPoint(A,B,Math.min(1,te+0.02));
          const brg=_gcBearing(pos,ahead);
          /* parabolic altitude: blend zEnd↔zMid by 4t(1-t) */
          const bl=4*te*(1-te);
          const z=zEnd*(1-bl)+zMid*bl;
          const pitch=(te<0.5?(pStart*(1-bl)+pMid*bl):(pEnd*(1-bl)+pMid*bl));
          try{ GE().camera.jumpTo({center:[pos.lng,pos.lat],zoom:z,bearing:brg,pitch:Math.max(0,Math.min(85,pitch))}); }catch(_){}
          try{ if(!GE().layers.hasSource('nlq-fly-src')) ensureFlyLayers();
            if(GE().layers.hasSource('nlq-fly-src')) GE().layers.setSourceData('nlq-fly-src',{type:'FeatureCollection',features:[
              {type:'Feature',geometry:{type:'LineString',coordinates:path},properties:{}},
              {type:'Feature',geometry:{type:'Point',coordinates:[pos.lng,pos.lat]},properties:{}}]}); }catch(_){}
          if(t>=1){ res(); return; }
          requestAnimationFrame(frame); };
        requestAnimationFrame(frame); });
      try{ GE().events.off('mousedown',cancelEvt); GE().events.off('touchstart',cancelEvt); GE().events.off('wheel',cancelEvt); }catch(_){}
      const cancelled=run.cancel; _flyRun=null;
      if(!cancelled){ try{ GE().camera.easeTo({pitch:30,zoom:Math.max(GE().camera.getZoom(),zEnd-0.4),duration:900}); }catch(_){} }
      return {ok:true,km,real:real+(cancelled?(' · '+L('(interrupted)','（中断されました）','(abgebrochen)','(прервано)','(interrumpido)')):'')}; }
    /* ==== (#R83) REAL ballistic-missile simulator ("弾道ミサイルシミュレーターが粗悪すぎる"). The old ICBM mode
       was a parabolic camera zoom with no physics. This solves the actual minimum-energy KEPLERIAN trajectory
       for the great-circle range (the classic Bate/Mueller/White surface-to-surface ballistic solution):
       true apogee altitude, burnout & re-entry velocity, and Kepler-timed flight — then animates the re-entry
       vehicle along the ground track with a physically-timed pace (fast at launch/re-entry, slow near apogee)
       and draws a to-scale altitude cross-section. Optional warhead effects use cube-root blast scaling. ==== */
    const _MU=398600.4418, _RE=6371.0, _OMEGA=7.2921159e-5;   /* km³/s² grav. parameter, mean Earth radius (km), Earth spin (rad/s) */
    /* (#R85) ICBM rebuild ("立体軌道が全くのでたらめ … 現実に忠実に … ブースト推力・空気抵抗・機動再突入体・コリオリ力も
       考慮 … 軌道もボタンで変更可能に"). The core is still the exact Keplerian two-body solution, but the launch angle
       is now a FREE parameter so the same range can be flown minimum-energy, LOFTED (steep, high apogee) or
       DEPRESSED (flat, low apogee) — all three are valid ellipses through the same two surface points. Drag
       (Allen–Eggers re-entry), a boost estimate and Coriolis cross-range are computed on top. */
    function ballisticSolve(rangeKm, loft){ const R=_RE; const d=Math.max(1,Math.min(rangeKm,Math.PI*R-40));
      const theta=d/R, half=theta/2, c=Math.cos(half), s=Math.sin(half);
      const eME=Math.max(1e-4,Math.min(0.98,(1-s)/c));      /* minimum-energy eccentricity for a symmetric arc */
      const eCap=Math.min(0.985, 0.94/Math.max(1e-3,c));    /* r(νL)=R needs e·cos(half)<1 → keep a margin */
      const mode=String(loft||'').toLowerCase();
      let e;
      if(mode==='lofted'||mode==='loft'||mode==='high') e=eME+0.6*(eCap-eME);
      else if(mode==='depressed'||mode==='depress'||mode==='flat'||mode==='low') e=Math.max(1e-4,eME*0.42);
      else if(typeof loft==='number'&&isFinite(loft)) e=Math.max(1e-4,Math.min(eCap,eME*loft));
      else e=eME;                                            /* minimum energy (default) */
      const p=R*(1-e*c);                                     /* semi-latus rectum from the launch-radius condition */
      const a=p/(1-e*e), ra=a*(1+e), apogee=ra-R;
      const vLaunch=Math.sqrt(_MU*(2/R-1/a));                /* vis-viva speed at burnout radius R (km/s) */
      const nuL=Math.PI-half;                                /* true anomaly at launch (apogee = π) */
      const gammaL=Math.atan2(e*Math.sin(nuL),1+e*Math.cos(nuL));   /* launch flight-path angle above local horizontal (rad) */
      const EL=2*Math.atan2(Math.sqrt(1-e)*Math.sin(nuL/2),Math.sqrt(1+e)*Math.cos(nuL/2));
      const ML=EL-e*Math.sin(EL), P=2*Math.PI*Math.sqrt(a*a*a/_MU);
      const tof=(P/Math.PI)*(Math.PI-ML);                    /* launch→impact time (s), symmetric about apogee */
      /* (#R85) atmospheric drag on the re-entry vehicle — Allen–Eggers ballistic-entry closed form. β = ballistic
         coefficient (kg/m²); a heavy MIRV RV is ~8000. v_impact = v_entry·exp(−ρ0·H/(2β·sinγ)). Vacuum energy gives
         v_entry at the ~100 km interface; drag then bleeds it to the ground impact speed. */
      const vEntry=Math.sqrt(Math.max(0,_MU*(2/(R+100)-1/a)));      /* speed at 100 km altitude (km/s) */
      const beta=8000, rho0=1.225, Hs=7160;                        /* kg/m², kg/m³, m */
      const kDrag=(rho0*Hs)/(2*beta*Math.max(0.09,Math.sin(gammaL)));
      const vImpact=vEntry*Math.exp(-kDrag);                       /* drag-reduced ground impact speed (km/s) */
      return {theta,e,eME,a,p,ra,apogee,vLaunch,vEntry,vImpact,tof,half,nuL,ML,gammaL,mode:mode||'minenergy'}; }
    function ballisticAlt(sol,f){ const nu=sol.nuL+f*sol.theta; const r=sol.p/(1+sol.e*Math.cos(nu)); return Math.max(0,r-_RE); }
    function ballisticTimeFrac(sol,f){ const nu=sol.nuL+f*sol.theta;
      const E=2*Math.atan2(Math.sqrt(1-sol.e)*Math.sin(nu/2),Math.sqrt(1+sol.e)*Math.cos(nu/2));
      const M=E-sol.e*Math.sin(E); const denom=2*(Math.PI-sol.ML); return denom>1e-9?((M-sol.ML)/denom):f; }
    /* named missile classes → published max range (km) & rough warhead yield (kt) for the effects overlay */
    const MISSILE_CLASS={ 'iskander':{name:'Iskander',range:500,yield:50},'atacms':{name:'ATACMS',range:300,yield:0},
      'tomahawk':{name:'Tomahawk',range:1600,yield:0},'kalibr':{name:'Kalibr',range:2000,yield:0},'kinzhal':{name:'Kh-47M2 Kinzhal',range:2000,yield:0},
      'df-21':{name:'DF-21',range:1500,yield:0},'df-26':{name:'DF-26',range:4000,yield:300},'pershing':{name:'Pershing II',range:1800,yield:80},
      'minuteman':{name:'Minuteman III',range:13000,yield:335},'trident':{name:'Trident II D5',range:12000,yield:475},
      'df-41':{name:'DF-41',range:14000,yield:250},'df-31':{name:'DF-31',range:11000,yield:1000},'df-5':{name:'DF-5',range:13000,yield:3000},
      'sarmat':{name:'RS-28 Sarmat',range:18000,yield:750},'topol':{name:'RS-24 Yars',range:11000,yield:300},'hwasong':{name:'Hwasong-17',range:15000,yield:250},
      'agni':{name:'Agni-V',range:7000,yield:200},'no-dong':{name:'Nodong',range:1300,yield:20},'scud':{name:'Scud',range:300,yield:0} };
    function missileClass(name){ if(!name) return null; const s=String(name).toLowerCase().replace(/[\s\-_.]/g,''); let best=null;
      for(const k in MISSILE_CLASS){ const kk=k.replace(/[\s\-_.]/g,''); if(s.indexOf(kk)>=0||kk.indexOf(s)>=0){ if(!best||kk.length>best[0].length) best=[kk,MISSILE_CLASS[k]]; } }
      return best?best[1]:null; }
    /* draw concentric warhead-effect rings at the impact point (cube-root scaling from a 1 kt reference) */
    let _blastActive=false;
    function ensureBlastLayers(){ try{ if(!GE().layers.hasSource('nlq-blast-src')) GE().layers.addSource('nlq-blast-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!GE().layers.has('nlq-blast-fill')){ const before=['nlq-fly-line','nlq-poi-c'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
        GE().layers.add({id:'nlq-blast-fill',type:'fill',source:'nlq-blast-src',paint:{'fill-color':['get','color'],'fill-opacity':0.16}},before);
        GE().layers.add({id:'nlq-blast-line',type:'line',source:'nlq-blast-src',paint:{'line-color':['get','color'],'line-width':1.3,'line-opacity':0.85}},before); }
      return true; }catch(_){ return false; } }
    function clearBlast(){ _blastActive=false; try{ GE().layers.setSourceData('nlq-blast-src',{type:'FeatureCollection',features:[]}); }catch(_){} }
    function drawBlastRings(center,Y){ if(!(Y>0)||!ensureBlastLayers()) return null; const cb=Math.cbrt(Y);   /* km per kt^(1/3), airburst-optimised for 5 psi */
      const rings=[ {r:1.7*cb,c:'#64b5ff',l:L('1 psi — windows shatter, light injuries','1 psi — 窓ガラス破損・軽傷','1 psi — Fenster bersten','1 psi — стёкла, лёгкие ранения','1 psi — ventanas rotas')},
        {r:1.2*cb,c:'#ffd60a',l:L('thermal — 3rd-degree burns','熱線 — 3度熱傷','thermisch — Verbrennungen 3.','тепловое — ожоги 3-й ст.','térmico — quemaduras 3.er grado')},
        {r:0.62*cb,c:'#ff9f0a',l:L('5 psi — most buildings collapse','5 psi — 大半の建物が倒壊','5 psi — Gebäude stürzen ein','5 psi — здания рушатся','5 psi — edificios colapsan')},
        {r:0.26*cb,c:'#ff453a',l:L('20 psi — total destruction','20 psi — 完全破壊','20 psi — Totalzerstörung','20 psi — полное разрушение','20 psi — destrucción total')} ];
      const feats=[]; rings.forEach(rg=>{ try{ (diskFillPolys([center.lng,center.lat],rg.r,96)||[]).forEach(poly=>feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:poly},properties:{color:rg.c}})); }catch(_){} });
      try{ GE().layers.setSourceData('nlq-blast-src',{type:'FeatureCollection',features:feats}); _blastActive=true; }catch(_){}
      return rings; }
    /* (#R85) ground track with CORIOLIS + optional MaRV terminal manoeuvre. In an inertial (non-rotating) frame a
       ballistic trajectory projects to a great circle; the spinning Earth then smears it. We aim the inertial arc
       at where the target will have rotated to after the flight time (lead = Ω·T in longitude) and un-rotate each
       point by the Earth spin elapsed up to its OWN time — reproducing the real cross-range curvature. A MaRV adds
       a damped terminal S-weave that still converges on the aim point. */
    function _ballTrack(A,B,sol,N,opts){ opts=opts||{}; const coriolis=opts.coriolis!==false, marv=!!opts.marv;
      const T=sol.tof||0, leadDeg=coriolis?((_OMEGA*T)*180/Math.PI):0;
      const Bin={lng:B.lng+leadDeg,lat:B.lat};
      const perp=(_gcBearing(A,B)+90)*Math.PI/180;
      const pts=[],alts=[]; let maxDev=0;
      for(let i=0;i<=N;i++){ const f=i/N; const ip=_gcPoint(A,Bin,f); const tau=ballisticTimeFrac(sol,f);
        let lng=ip.lng-leadDeg*tau, lat=ip.lat;
        if(marv&&f>0.86){ const u=(f-0.86)/0.14, amp=0.6*Math.sin(3*Math.PI*u)*(1-u); lat+=amp*Math.cos(perp); lng+=amp*Math.sin(perp)/Math.max(0.2,Math.cos(lat*Math.PI/180)); }
        try{ const gc=_gcPoint(A,B,f); const dev=_gcKm({lng,lat},gc); if(dev>maxDev) maxDev=dev; }catch(_){}
        pts.push([lng,lat]); alts.push(ballisticAlt(sol,f)); }
      return {pts,alts,Bin,leadDeg,crossRangeKm:maxDev}; }
    async function ballisticAnimate(A,B,opts){ opts=opts||{}; const km=_gcKm(A,B); if(!isFinite(km)||km<1) return {ok:false,km:0};
      const sol=ballisticSolve(km); clearFly(); if(!ensureFlyLayers()) return {ok:false,km,sol};
      const secs=Math.max(8,Math.min(55,+opts.seconds||Math.round(10+km/850)));
      const N=Math.max(64,Math.min(360,Math.round(km/50))); const track=[]; for(let i=0;i<=N;i++){ const p=_gcPoint(A,B,i/N); track.push([p.lng,p.lat]); }
      const zBase=Math.max(2.2,8.5-Math.log2(Math.max(1,km/60)));
      const run={cancel:false}; _flyRun=run; const cancelEvt=()=>{ run.cancel=true; };
      try{ GE().events.on('mousedown',cancelEvt); GE().events.on('touchstart',cancelEvt); GE().events.on('wheel',cancelEvt); }catch(_){}
      const fAtTime=tau=>{ let lo=0,hi=1; for(let i=0;i<24;i++){ const mid=(lo+hi)/2; if(ballisticTimeFrac(sol,mid)<tau) lo=mid; else hi=mid; } return (lo+hi)/2; };
      const t0=performance.now(), dur=secs*1000;
      try{ GE().camera.jumpTo({center:[A.lng,A.lat],zoom:zBase+0.4,bearing:_gcBearing(A,B),pitch:55}); }catch(_){}
      await new Promise(res=>{ const frame=now=>{ if(run.cancel){ res(); return; }
        const tau=Math.min(1,(now-t0)/dur); const f=fAtTime(tau); const pos=_gcPoint(A,B,f); const alt=ballisticAlt(sol,f);
        const ahead=_gcPoint(A,B,Math.min(1,f+0.01)), brg=_gcBearing(pos,ahead);
        const z=zBase-3.4*(alt/(sol.apogee||1)), pitch=40+30*(alt/(sol.apogee||1));
        try{ GE().camera.jumpTo({center:[pos.lng,pos.lat],zoom:Math.max(1.3,z),bearing:brg,pitch:Math.max(0,Math.min(80,pitch))}); }catch(_){}
        try{ GE().layers.setSourceData('nlq-fly-src',{type:'FeatureCollection',features:[
          {type:'Feature',geometry:{type:'LineString',coordinates:track},properties:{color:'#ff453a'}},
          {type:'Feature',geometry:{type:'Point',coordinates:[pos.lng,pos.lat]},properties:{}}]}); }catch(_){}
        if(tau>=1){ res(); return; } requestAnimationFrame(frame); }; requestAnimationFrame(frame); });
      try{ GE().events.off('mousedown',cancelEvt); GE().events.off('touchstart',cancelEvt); GE().events.off('wheel',cancelEvt); }catch(_){}
      const cancelled=run.cancel; _flyRun=null;
      try{ GE().layers.setSourceData('nlq-fly-src',{type:'FeatureCollection',features:[
        {type:'Feature',geometry:{type:'LineString',coordinates:track},properties:{color:'#ff453a'}},
        {type:'Feature',geometry:{type:'Point',coordinates:[B.lng,B.lat]},properties:{}}]}); }catch(_){}
      if(!cancelled){ try{ GE().camera.easeTo({pitch:22,zoom:Math.max(GE().camera.getZoom(),zBase-0.6),duration:900}); }catch(_){} }
      return {ok:true,km,sol,cancelled}; }
    function ballisticProfileSVG(sol,km){ const W=300,H=124,pL=30,pR=10,pT=12,pB=20, iw=W-pL-pR, ih=H-pT-pB;
      const N=90; let d=''; for(let i=0;i<=N;i++){ const f=i/N, x=pL+f*iw, y=pT+ih-(ballisticAlt(sol,f)/(sol.apogee||1))*ih; d+=(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)+' '; }
      const apX=pL+0.5*iw;
      return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-width:340px;margin:4px 0;">'
        +'<rect x="'+pL+'" y="'+pT+'" width="'+iw+'" height="'+ih+'" fill="rgba(120,150,200,0.06)" stroke="rgba(128,128,128,0.3)" stroke-width="0.6"/>'
        +'<line x1="'+pL+'" y1="'+(pT+ih)+'" x2="'+(pL+iw)+'" y2="'+(pT+ih)+'" stroke="rgba(128,128,128,0.5)" stroke-width="0.8"/>'
        +'<path d="'+d+'" fill="none" stroke="#ff453a" stroke-width="2"/>'
        +'<circle cx="'+apX.toFixed(1)+'" cy="'+pT+'" r="2.6" fill="#ffd60a"/>'
        +'<text x="'+apX.toFixed(1)+'" y="'+(pT-2)+'" font-size="8.5" fill="var(--text-muted)" text-anchor="middle">'+Math.round(sol.apogee).toLocaleString()+' km</text>'
        +'<text x="'+pL+'" y="'+(pT+ih+13)+'" font-size="8.5" fill="var(--text-muted)" text-anchor="start">'+L('launch','発射','Start','пуск','lanz.')+'</text>'
        +'<text x="'+(pL+iw)+'" y="'+(pT+ih+13)+'" font-size="8.5" fill="var(--text-muted)" text-anchor="end">'+L('impact','着弾','Einschlag','удар','impacto')+'</text>'
        +'<text x="4" y="'+(pT+6)+'" font-size="8" fill="var(--text-muted)">'+L('alt','高度','Höhe','высота','alt')+'</text>'
        +'<text x="'+(pL+iw/2).toFixed(1)+'" y="'+(H-4)+'" font-size="8.5" fill="var(--text-muted)" text-anchor="middle">'+Math.round(km).toLocaleString()+' km '+L('downrange','水平距離','Bodenreichweite','дальность','alcance')+'</text>'
        +'</svg>'; }
    /* ==== (#R83) ELEVATION HIGHLIGHT — real Copernicus-DEM sampling (Open-Meteo elevation API) to shade every
       grid cell below/above a threshold. Answers "カスピ海周辺の海抜0m以下地点をハイライトして" with genuine data,
       not a guess: the depression around the Caspian shades in graduated blue by depth below sea level. ==== */
    function ensureElevLayers(){ try{ if(!GE().layers.hasSource('nlq-elev-src')) GE().layers.addSource('nlq-elev-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!GE().layers.has('nlq-elev-fill')){ const before=['nlq-fly-line','nlq-poi-c','nlq-fill'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
        GE().layers.add({id:'nlq-elev-fill',type:'fill',source:'nlq-elev-src',paint:{'fill-color':['get','color'],'fill-opacity':0.6}},before); }
      return true; }catch(_){ return false; } }
    function clearElev(){ try{ GE().layers.setSourceData('nlq-elev-src',{type:'FeatureCollection',features:[]}); }catch(_){} }
    async function elevGrid(box,maxPts){ const w=box[0][0],s=box[0][1],e=box[1][0],n=box[1][1];
      const aspect=Math.max(0.25,Math.min(4,((e-w)*Math.cos((n+s)/2*Math.PI/180))/(Math.abs(n-s)||1e-6)));
      let ny=Math.round(Math.sqrt((maxPts||800)/aspect)); ny=Math.max(8,Math.min(44,ny)); let nx=Math.max(8,Math.min(60,Math.round(ny*aspect)));
      const dx=(e-w)/nx, dy=(n-s)/ny; const lats=[],lngs=[];
      for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){ lngs.push(+(w+(i+0.5)*dx).toFixed(4)); lats.push(+(s+(j+0.5)*dy).toFixed(4)); }
      const out=[]; const CH=100;
      for(let k=0;k<lats.length;k+=CH){ const la=lats.slice(k,k+CH), lo=lngs.slice(k,k+CH);
        let j=null; try{ j=await _fetchJSON('https://api.open-meteo.com/v1/elevation?latitude='+la.join(',')+'&longitude='+lo.join(',')); }catch(_){}
        const el=(j&&j.elevation)||[]; for(let m=0;m<la.length;m++) out.push({lng:lo[m],lat:la[m],el:(el[m]!=null&&isFinite(el[m]))?+el[m]:null}); }
      return {pts:out,nx,ny,dx,dy}; }
    /* ==== (#R83) FACTION / HISTORICAL MAP — colour modern country fills by faction. Answers "第一次世界大戦
       1916年3月の勢力図をマッピングして" with a curated, historically-accurate March-1916 belligerent map, and can
       paint any AI-supplied {faction→countries,color} set for other eras. Independent categorical fill source. ==== */
    function ensureFacLayers(){ try{ const g=geo(); if(!g) return false;
      if(!GE().layers.hasSource('nlq-fac-src')) GE().layers.addSource('nlq-fac-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!GE().layers.has('nlq-fac-fill')){ const before=['nlq-fill','ofm-country','ofm-city','ofm-other','tool-poly'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
        GE().layers.add({id:'nlq-fac-fill',type:'fill',source:'nlq-fac-src',paint:{'fill-color':['get','color'],'fill-opacity':0.5}},before);
        GE().layers.add({id:'nlq-fac-line',type:'line',source:'nlq-fac-src',paint:{'line-color':['get','color'],'line-width':0.8,'line-opacity':0.7}},before); }
      return true; }catch(_){ return false; } }
    function clearFac(){ try{ GE().layers.setSourceData('nlq-fac-src',{type:'FeatureCollection',features:[]}); }catch(_){} }
    function paintFactions(groups){ if(!ensureFacLayers()) return 0; const g=geo(); if(!g) return 0;
      const byCode={}; (groups||[]).forEach(gr=>{ (gr.codes||[]).forEach(cd=>{ byCode[String(cd).toUpperCase()]=gr.color; }); });
      const feats=[]; g.features.forEach(f=>{ const cd=String(f.id!=null?f.id:(f.properties&&f.properties.__code)).toUpperCase(); const col=byCode[cd]; if(!col||!f.geometry) return; feats.push({type:'Feature',geometry:f.geometry,properties:{color:col}}); });
      try{ GE().layers.setSourceData('nlq-fac-src',{type:'FeatureCollection',features:feats}); }catch(_){}
      return feats.length; }
    /* curated scenarios keyed on era — modern ISO3 members grouped by faction (approximate: empires span
       several modern states; painted onto today's borders and clearly labelled as such). */
    const HIST_SCENARIOS={
      ww1_1916:{ title:L('World War I — March 1916','第一次世界大戦 — 1916年3月','Erster Weltkrieg — März 1916','Первая мировая — март 1916','Primera Guerra Mundial — marzo 1916'),
        factions:[
          {name:L('Central Powers','中央同盟国','Mittelmächte','Центральные державы','Imperios Centrales'),color:'#3a6ea5',
           codes:['DEU','AUT','HUN','CZE','SVK','SVN','HRV','BIH','TUR','BGR','ISR','PSE','LBN','SYR','IRQ','JOR','SAU','YEM','ARE','KWT','QAT','BHR','OMN']},
          {name:L('Allied / Entente Powers','連合国（協商国）','Alliierte / Entente','Антанта','Aliados / Entente'),color:'#c1443c',
           codes:['FRA','GBR','RUS','ITA','SRB','MNE','BEL','JPN','PRT','MNG','UKR','BLR','EST','LVA','LTU','FIN','POL','GEO','ARM','AZE','KAZ','UZB','TKM','KGZ','TJK','IND','PAK','BGD','MMR','LKA','AUS','NZL','CAN','ZAF','EGY','SDN','NGA','GHA','KEN','TZA','UGA','ZWE','ZMB','MWI']},
          {name:L('Neutral','中立国','Neutral','Нейтральные','Neutrales'),color:'#8a8f98',
           codes:['USA','ESP','NLD','CHE','SWE','NOR','DNK','ROU','GRC','ALB','MEX','ARG','BRA','CHL','COL','VEN','PER','BOL','ECU','URY','PRY','NIC','CRI','PAN','CUB','IRN','AFG','THA','ETH','LBR','CHN','ISL']}
        ], note:L('Approximate — 1916 empires (German, Austro-Hungarian, Ottoman, Russian, British) are shown on today’s borders. Romania & the US were still neutral in March 1916; both joined the Allies later (Aug 1916 / 1917).','概略です。1916年当時の帝国（ドイツ・オーストリア＝ハンガリー・オスマン・ロシア・イギリス）を現代の国境上に表示しています。ルーマニアと米国は1916年3月時点では中立で、のちに連合国側で参戦（1916年8月／1917年）。','Näherung — die Reiche von 1916 auf heutigen Grenzen. Rumänien und die USA waren im März 1916 noch neutral.','Приблизительно — империи 1916 г. на современных границах. Румыния и США в марте 1916 г. ещё нейтральны.','Aproximado — imperios de 1916 sobre fronteras actuales. Rumanía y EE. UU. aún neutrales en marzo de 1916.') }
    };
    function histMatch(q){ const s=String(q||'').toLowerCase();
      if(/(ww ?1|wwi|world war (1|i|one)|first world war|第一次世界大戦|第一次大戦|一次大戦|1914|1915|1916|1917|1918|central powers|entente|中央同盟|協商|連合国)/.test(s)) return 'ww1_1916';
      return null; }
  return { HIST_SCENARIOS, _ballTrack, _gcKm, ballisticProfileSVG, ballisticSolve, clearBlast, clearElev, clearFac, clearFly, drawBlastRings, elevGrid, ensureElevLayers, flyAnimate, histMatch, missileClass, paintFactions };
}
