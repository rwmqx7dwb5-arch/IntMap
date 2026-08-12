/* ============================================================================
 *  IntMap · Physical simulations & solar geometry — IntMapModules.{popArea,slope,rf,sun,transitReach,disaster,earthReplay,radiation}  (#R166)
 * ----------------------------------------------------------------------------
 *  Simulations computed from real data on the client: population inside a drawn area, DEM
 *  slope/aspect, RF line-of-sight coverage, the solar terminator, transit reachability, flood/tsunami
 *  hazard, the Earth-replay sun animation and the radioactive-plume model.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R166): each body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang
 *
 *  Every factory is called at the exact spot its block used to occupy, so execution order is
 *  unchanged. The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.radiation=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  window.IntMapRadiation=(function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { run(){ return Promise.resolve({ok:false}); }, clear(){}, openPanel(){}, ISOTOPES:{}, SOURCES:{} };
    const LL=window.IntMapLang.pick(()=>HOST.lang);
    const SRC='imrad-src', DEP='imrad-dep-src'; let _run=null, _gen=0;
    /* (#R85) isotope + source-term presets ("放出量や放出時間、日時等も選べるように"). Half-lives in HOURS. */
    const ISOTOPES={ 'cs137':{n:'Cs-137',h:264289,dose:2.0e-6}, 'i131':{n:'I-131',h:192.5,dose:1.5e-6}, 'cs134':{n:'Cs-134',h:18045,dose:5.4e-6}, 'sr90':{n:'Sr-90',h:252648,dose:0.2e-6} };
    const SOURCES={ 'chernobyl':{n:'Chernobyl-scale',bq:8.5e16,ll:[30.0997,51.3892]}, 'fukushima':{n:'Fukushima-scale',bq:1.5e16,ll:[141.0329,37.4211]}, 'dirtybomb':{n:'Dirty bomb (RDD)',bq:3.7e13}, 'research':{n:'Small/research',bq:1e12} };
    /* (#R85b) built-in gazetteer of major nuclear sites so "福島第一原発 / Fukushima Daiichi / Chernobyl / Zaporizhzhia"
       ALWAYS resolve even when the online geocoder truncates/misses the name ("Where is the release source?"). */
    const SITES=[
      {re:/fukushima\s*dai\s*ichi|福島第一|fukushima\s*i\b|fukushima\s*(nuclear|daiichi)|福島原発/i, ll:[141.0329,37.4211], n:'Fukushima Daiichi'},
      {re:/fukushima\s*daini|福島第二|fukushima\s*ii\b/i, ll:[141.0210,37.3160], n:'Fukushima Daini'},
      {re:/chernobyl|chornobyl|チェルノブイリ|チョルノービリ|чорнобиль|чернобыль/i, ll:[30.0997,51.3892], n:'Chernobyl'},
      {re:/zaporizh|zaporozh|запор|ザポリージャ|ザポロジエ/i, ll:[34.5857,47.5122], n:'Zaporizhzhia NPP'},
      {re:/three\s*mile|スリーマイル/i, ll:[-76.7247,40.1533], n:'Three Mile Island'},
      {re:/kashiwazaki|柏崎刈羽|柏崎/i, ll:[138.5959,37.4290], n:'Kashiwazaki-Kariwa'},
      {re:/sellafield|windscale|セラフィールド/i, ll:[-3.4986,54.4200], n:'Sellafield'},
      {re:/la\s*hague|ラアーグ/i, ll:[-1.8792,49.6781], n:'La Hague'},
      {re:/mayak|マヤーク|kyshtym|マヤク/i, ll:[60.8028,55.6900], n:'Mayak'},
      {re:/hanford|ハンフォード/i, ll:[-119.4880,46.5500], n:'Hanford'},
      {re:/bushehr|ブーシェフル/i, ll:[52.2300,28.8290], n:'Bushehr'},
      {re:/ohi|大飯|takahama|高浜|sendai\s*nuclear|川内原発|hamaoka|浜岡/i, ll:[135.6520,35.5420], n:'Ōi / Kansai NPP'}
    ];
    function resolveSite(q){ q=String(q||'').trim(); if(!q) return null; for(const s of SITES){ if(s.re.test(q)) return {lng:s.ll[0],lat:s.ll[1],name:s.n}; } return null; }
    /* Cs-137 ground-deposition zones — the real Chernobyl thresholds (Ci/km² → kBq/m²): 40/15/5/1 */
    const ZONES=[ {min:1480,c:'#8a0f0f',n:['Exclusion — permanent resettlement','立入禁止（強制移住）','Sperrzone','Зона отчуждения','Exclusión'],mSv:'>5'},
      {min:555,c:'#ff453a',n:['Mandatory evacuation','義務的避難','Zwangsumsiedlung','Обязательное отселение','Evacuación obligatoria'],mSv:'1–5'},
      {min:185,c:'#ff9f0a',n:['Relocation right / monitoring','移住権・要監視','Umsiedlungsrecht','Право на отселение','Reubicación'],mSv:'0.5–1'},
      {min:37,c:'#ffd60a',n:['Enhanced monitoring','要観察','Verstärkte Überwachung','Усиленный контроль','Vigilancia'],mSv:'0.1–0.5'},
      {min:2,c:'#b7f7b0',n:['Trace deposition','微量沈着','Spuren','Следы','Trazas'],mSv:'<0.1'} ];
    async function fetchJSON(url){ const PROX=[x=>x, x=>'https://corsproxy.io/?url='+encodeURIComponent(x), x=>'https://api.allorigins.win/raw?url='+encodeURIComponent(x)];
      for(const p of PROX){ try{ const r=await fetch(p(url)); if(r&&r.ok) return await r.json(); }catch(_){} } return null; }
    function ensureLayers(){ try{ if(GE().layers.hasSource(SRC)) return true; if(!_imCanDraw()) return false;
      GE().layers.addSource(DEP,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      GE().layers.add({id:'imrad-dep',type:'fill',source:DEP,paint:{'fill-color':['get','c'],'fill-opacity':0.5}});
      GE().layers.add({id:'imrad-dep-line',type:'line',source:DEP,paint:{'line-color':['get','c'],'line-width':0.4,'line-opacity':0.5}});
      GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      GE().layers.add({id:'imrad-heat',type:'heatmap',source:SRC,maxzoom:10,paint:{'heatmap-weight':['coalesce',['get','w'],0.4],'heatmap-intensity':1.1,'heatmap-radius':['interpolate',['linear'],['zoom'],2,7,5,16,8,34],'heatmap-opacity':0.55,'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(0,0,0,0)',0.15,'rgba(120,220,120,0.45)',0.35,'#ffe08a',0.55,'#ff9f0a',0.78,'#ff453a',1,'#8a0f0f']}});
      GE().layers.add({id:'imrad-pt',type:'circle',source:SRC,minzoom:4.5,paint:{'circle-radius':2.1,'circle-color':['coalesce',['get','c'],'#ff453a'],'circle-opacity':0.5}});
      GE().layers.add({id:'imrad-srcpt',type:'circle',source:SRC,filter:['==',['get','src'],1],paint:{'circle-radius':7,'circle-color':'#ffe000','circle-stroke-color':'#8a0f0f','circle-stroke-width':3}});
      return true; }catch(_){ return false; } }
    function clear(){ if(_run){ _run.cancel=true; _run=null; } try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} try{ GE().layers.setSourceData(DEP,{type:'FeatureCollection',features:[]}); }catch(_){} }
    /* wind/precip/temperature field — FORECAST (now / next 3 days) or, for a PAST start date, the ERA5 ARCHIVE.
       Returns hourly u,v,precip,temp on a 6×6 grid; startHour = the field-hour the release begins at. */
    async function fetchField(cx,cy,opts){ opts=opts||{}; const nx=6, ny=6, half=2.6; const lons=[],lats=[];
      for(let i=0;i<nx;i++) lons.push(cx-half+(2*half)*i/(nx-1)); for(let j=0;j<ny;j++) lats.push(cy-half+(2*half)*j/(ny-1));
      const LA=[],LO=[]; for(let j=0;j<ny;j++) for(let i=0;i<nx;i++){ LO.push(+lons[i].toFixed(3)); LA.push(+lats[j].toFixed(3)); }
      const hourly='wind_speed_10m,wind_direction_10m,precipitation,temperature_2m';
      let url, startHour=0, startISO=null;
      const dt=opts.date?new Date(opts.date):null, now=Date.now();
      if(dt&&isFinite(dt.getTime())&&dt.getTime()<now-3*3600e3){   /* past → archive (ERA5) */
        const d0=new Date(dt.getTime()); const sD=d0.toISOString().slice(0,10); const eD=new Date(dt.getTime()+ (Math.min(72,+opts.hours||48)+6)*3600e3).toISOString().slice(0,10);
        url='https://archive-api.open-meteo.com/v1/archive?latitude='+LA.join(',')+'&longitude='+LO.join(',')+'&start_date='+sD+'&end_date='+eD+'&hourly='+hourly+'&wind_speed_unit=ms';
        startISO=dt.toISOString();
      } else {   /* now / future within the forecast window */
        url='https://api.open-meteo.com/v1/forecast?latitude='+LA.join(',')+'&longitude='+LO.join(',')+'&hourly='+hourly+'&forecast_days=3&wind_speed_unit=ms';
        if(dt&&isFinite(dt.getTime())) startISO=dt.toISOString();
      }
      const j=await fetchJSON(url); if(!j) return null; const arr=Array.isArray(j)?j:[j]; if(!arr.length||!arr[0].hourly) return null;
      const times=arr[0].hourly.time||[]; const H=Math.min(80,times.length||48);
      if(startISO&&times.length){ const target=startISO.slice(0,13); let idx=times.findIndex(t=>String(t).slice(0,13)===target); if(idx<0){ idx=times.findIndex(t=>new Date(t).getTime()>=new Date(startISO).getTime()); } if(idx>0) startHour=idx; }
      const u=[],v=[],pr=[],tp=[]; for(let h=0;h<H;h++){ u.push(new Float32Array(nx*ny)); v.push(new Float32Array(nx*ny)); pr.push(new Float32Array(nx*ny)); tp.push(new Float32Array(nx*ny)); }
      arr.forEach((loc,idx)=>{ const hh=loc.hourly||{}; const ws=hh.wind_speed_10m||[], wd=hh.wind_direction_10m||[], pp=hh.precipitation||[], tt=hh.temperature_2m||[];
        for(let h=0;h<H;h++){ const sp=+ws[h]||0, dr=(+wd[h]||0)*Math.PI/180; u[h][idx]=-sp*Math.sin(dr); v[h][idx]=-sp*Math.cos(dr); pr[h][idx]=+pp[h]||0; tp[h][idx]=(tt[h]!=null?+tt[h]:15); } });
      return {nx,ny,lons,lats,H,u,v,pr,tp,dLon:(2*half)/(nx-1),dLat:(2*half)/(ny-1),cx,cy,half,startHour,startISO,times}; }
    function sample(F,lng,lat,h){ let fx=(lng-F.lons[0])/F.dLon, fy=(lat-F.lats[0])/F.dLat;
      fx=Math.max(0,Math.min(F.nx-1.001,fx)); fy=Math.max(0,Math.min(F.ny-1.001,fy));
      const i0=Math.floor(fx), j0=Math.floor(fy), tx=fx-i0, ty=fy-j0, hi=Math.max(0,Math.min(F.H-1,Math.floor(h)));
      const id=(i,j)=>j*F.nx+i; const bil=A=>{ const a=A[id(i0,j0)],b=A[id(i0+1,j0)],c=A[id(i0,j0+1)],d=A[id(i0+1,j0+1)]; return a*(1-tx)*(1-ty)+b*tx*(1-ty)+c*(1-tx)*ty+d*tx*ty; };
      return { u:bil(F.u[hi]), v:bil(F.v[hi]), pr:bil(F.pr[hi]), tp:bil(F.tp[hi]) }; }
    function estimateWet(F){ try{ for(let h=0;h<F.H;h++){ const pr=F.pr[h]; for(let i=0;i<pr.length;i++){ if(pr[i]>0.1) return true; } } }catch(_){} return false; }
    const grnd=()=>{ const u1=Math.random()||1e-6,u2=Math.random(); return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2); };
    /* (#R85) FULL Lagrangian run computed once (fast, headless) → the FINAL DEPOSITION field (Bq/m² per cell) that
       both the settled-ground map layer AND the dose report read from. q0 = per-particle activity so a real Bq
       source term maps to a real deposition density. */
    function computeDeposition(F,src,opts){ const maxP=opts.pN||2600, hours=opts.hours, emitHours=Math.min(hours,opts.emitHours), halfLifeH=opts.halfLifeHours;
      /* (#R85d) higher-quality model: only a DEPOSITABLE FRACTION of the source term is ground-depositable particulate
         (the rest is noble gas / stays aloft), so near-source deposition isn't an unrealistic solid blob; a modest
         PLUME RISE + gravitational settling velocity per particle; a size-dependent dry-deposition velocity. */
      const DEP_FRAC=0.55, q0=opts.bq*DEP_FRAC/maxP;
      const steps=Math.max(72,Math.round(hours*3)), dH=hours/steps, depRes=opts.depRes||0.03, base=opts.startHour||0;
      const key=(lng,lat)=>Math.round(lng/depRes)+'_'+Math.round(lat/depRes);
      const parts=[], dep=new Map(); let emitted=0; const perStep=Math.max(1,Math.ceil(maxP/Math.max(1,emitHours/dH)));
      for(let st=0;st<=steps;st++){ const simH=st*dH;
        if(simH<=emitHours&&emitted<maxP){ const want=Math.min(maxP-emitted,perStep); for(let k=0;k<want;k++){ parts.push({lng:src.lng+(Math.random()-0.5)*0.012,lat:src.lat+(Math.random()-0.5)*0.012,z:200+Math.random()*600,vs:0.002+Math.random()*0.02,act:1,dead:false}); emitted++; } }
        for(const p of parts){ if(p.dead) continue; const s=sample(F,p.lng,p.lat,base+simH);
          const stab=Math.max(0.4,Math.min(2.2,0.6+(s.tp-5)/25)), K=380*stab, sig=Math.sqrt(2*K*dH*3600);
          const mLat=111000, mLon=111000*Math.cos(p.lat*Math.PI/180)||1;
          p.lng+=(s.u*dH*3600+grnd()*sig)/mLon; p.lat+=(s.v*dH*3600+grnd()*sig)/mLat;
          p.z=Math.max(0,p.z - p.vs*dH*3600 + grnd()*Math.sqrt(2*20*dH*3600));   /* settle + vertical turbulence */
          p.act*=Math.pow(0.5,dH/halfLifeH);
          let dv=false; if(s.pr>0.05&&Math.random()<Math.min(0.96,s.pr*0.18*dH)) dv=true;    /* wet scavenging */
          else if(p.z<=40) dv=true;                                                          /* touched ground */
          else if(Math.random()<0.006*dH*(p.z<300?2:1)) dv=true;                             /* dry deposition (faster low) */
          if(dv){ p.dead=true; const kk=key(p.lng,p.lat); dep.set(kk,(dep.get(kk)||0)+p.act*q0); } }
      }
      for(const p of parts){ if(p.dead) continue; const kk=key(p.lng,p.lat); dep.set(kk,(dep.get(kk)||0)+p.act*q0*0.5); }   /* settle the remainder */
      return {dep,depRes}; }
    function depFeatures(res,iso){ const {dep,depRes}=res; const feats=[]; const zoneKm2=[0,0,0,0,0]; let peak=0,peakLL=null,totBq=0;
      dep.forEach((bq,kk)=>{ const [gx,gy]=kk.split('_').map(Number); const lng=gx*depRes, lat=gy*depRes;
        const wM=depRes*111320*Math.cos(lat*Math.PI/180), hM=depRes*111320, areaM2=Math.max(1,wM*hM);
        const densBqM2=bq/areaM2, densKBqM2=densBqM2/1000; totBq+=bq;
        if(densKBqM2>peak){ peak=densKBqM2; peakLL=[lng,lat]; }
        let zi=-1; for(let z=0;z<ZONES.length;z++){ if(densKBqM2>=ZONES[z].min){ zi=z; break; } } if(zi<0) return;
        zoneKm2[zi]+=areaM2/1e6;
        const hw=depRes/2, hh=depRes/2;
        feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[[lng-hw,lat-hh],[lng+hw,lat-hh],[lng+hw,lat+hh],[lng-hw,lat+hh],[lng-hw,lat-hh]]]},properties:{c:ZONES[zi].c,z:zi,d:densKBqM2}}); });
      const doseK=(iso&&iso.dose)||2.0e-6; const peakDoseUSvH=peak*1000*doseK;   /* µSv/h at peak (density kBq→Bq/m² × conv) */
      return {feats,zoneKm2,peak,peakLL,peakDoseUSvH,totBq}; }
    /* visual plume animation (eye-candy over the already-drawn deposition) */
    function animate(F,src,secs,simHours,opts){
      const maxP=700, emitHours=Math.min(simHours,+opts.emitHours||8), halfLifeH=(+opts.halfLifeHours>0)?+opts.halfLifeHours:264289;
      const parts=[]; const rn={cancel:false}; _run=rn; const base=opts.startHour||0;
      const t0=performance.now(), dur=secs*1000; let lastH=0;
      const frame=now=>{ if(rn.cancel) return;
        const tau=Math.min(1,(now-t0)/dur), simH=tau*simHours, dH=Math.max(0,simH-lastH); lastH=simH; const dtSec=dH*3600;
        if(simH<=emitHours){ const want=Math.min(maxP-parts.length,Math.ceil(maxP/emitHours*dH)+1); for(let k=0;k<want;k++) parts.push({lng:src.lng+(Math.random()-0.5)*0.015,lat:src.lat+(Math.random()-0.5)*0.015,act:1,dead:false}); }
        for(const p of parts){ if(p.dead) continue; const s=sample(F,p.lng,p.lat,base+simH);
          const stab=Math.max(0.4,Math.min(2.2,0.6+(s.tp-5)/25)); const K=380*stab; const sig=Math.sqrt(2*K*dtSec);
          const mLat=111000, mLon=111000*Math.cos(p.lat*Math.PI/180)||1;
          p.lng+=(s.u*dtSec+grnd()*sig)/mLon; p.lat+=(s.v*dtSec+grnd()*sig)/mLat;
          p.act*=Math.pow(0.5,dH/halfLifeH);
          if(s.pr>0.05&&Math.random()<Math.min(0.9,s.pr*0.14*dH)) p.dead=true;
          if(Math.random()<0.008*dH) p.dead=true; }
        const feats=[{type:'Feature',geometry:{type:'Point',coordinates:[src.lng,src.lat]},properties:{src:1,w:1,c:'#ffe000'}}];
        for(const p of parts){ if(p.dead) continue; const a=p.act; feats.push({type:'Feature',geometry:{type:'Point',coordinates:[p.lng,p.lat]},properties:{w:Math.max(0.15,a),c:(a>0.7?'#ff453a':a>0.4?'#ff9f0a':'#ffe08a')}}); }
        try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); }catch(_){}
        if(tau>=1) return; requestAnimationFrame(frame); };
      requestAnimationFrame(frame); }
    let _lastRun=null;   /* (#R214) what the last plume was ASKED, so a link can reproduce it */
    async function run(src,opts){ opts=opts||{}; clear(); const myGen=++_gen;
      try{ _lastRun={ s:{lng:+src.lng,lat:+src.lat,name:src.name||''}, o:Object.assign({},opts) }; }catch(_){}
      const iso=ISOTOPES[String(opts.isotope||'cs137').toLowerCase()]||ISOTOPES.cs137;
      const bq=(opts.bq!=null&&isFinite(+opts.bq)&&+opts.bq>0)?+opts.bq:(SOURCES[String(opts.source||'').toLowerCase()]||SOURCES.fukushima).bq;
      const hours=Math.max(6,Math.min(80,+opts.hours||48)), emitHours=Math.max(0.25,Math.min(hours,+opts.emitHours||8));
      const halfLifeHours=(+opts.halfLifeHours>0)?+opts.halfLifeHours:iso.h;
      /* (#R85b) DECOUPLE the model from the map ("放射線拡散シミュレーションが使えない" — the old code returned
         reason:'style' and gave up if map.isStyleLoaded() was briefly false when the sim was launched). Fetch the
         wind + compute the deposition FIRST (both map-independent); return the dose report immediately; then PAINT
         the layers when the style is ready, retrying up to ~14 s + on the next idle. The report never depends on the
         layer being paintable at that instant. */
      const F=await fetchField(src.lng,src.lat,{date:opts.date,hours}); if(!F) return {ok:false,reason:'wind'};
      const P={bq,hours,emitHours,halfLifeHours,startHour:F.startHour,depRes:0.03,pN:2600};
      const dr=computeDeposition(F,src,P); const dz=depFeatures(dr,iso);
      const s0=sample(F,src.lng,src.lat,F.startHour); const spd=Math.hypot(s0.u,s0.v), toward=(Math.atan2(s0.u,s0.v)*180/Math.PI+360)%360;
      const estReach=Math.round(Math.min(spd*hours*3600/1000,900)), wet=estimateWet(F);
      const secs=Math.max(15,Math.min(60,+opts.seconds||38));
      let painted=false;
      const paint=()=>{ if(myGen!==_gen) return true; if(painted) return true; if(!ensureLayers()) return false; painted=true;
        try{ GE().layers.setSourceData(DEP,{type:'FeatureCollection',features:dz.feats}); }catch(_){}
        try{ if(dz.feats.length){ let a2=180,b2=90,c2=-180,d2=-90; dz.feats.forEach(f=>f.geometry.coordinates[0].forEach(p=>{ a2=Math.min(a2,p[0]);b2=Math.min(b2,p[1]);c2=Math.max(c2,p[0]);d2=Math.max(d2,p[1]); })); GE().camera.fitBounds([[a2,b2],[c2,d2]],{padding:70,maxZoom:8,duration:900}); } else GE().camera.flyTo({center:[src.lng,src.lat],zoom:Math.max(GE().camera.getZoom(),6),duration:800}); }catch(_){}
        animate(F,src,secs,hours,{emitHours,halfLifeHours,startHour:F.startHour}); return true; };
      if(!paint()){ let n=0; const t=setInterval(()=>{ if(myGen!==_gen||paint()||n++>56){ clearInterval(t); } },250); try{ GE().events.once('idle',paint); }catch(_){} }
      return {ok:true,reachKm:estReach,windSpeed:spd,windToward:toward,wet,hours,emitHours,bq,iso:iso.n,halfLifeHours,
        zoneKm2:dz.zoneKm2,peakKBqM2:dz.peak,peakDoseUSvH:dz.peakDoseUSvH,peakLL:dz.peakLL,startISO:F.startISO,zones:ZONES}; }
    try{ GE().events.on('styledata',()=>{ setTimeout(()=>{ try{ const d=GE().layers.sourceData(SRC); if(d&&d.features&&d.features.length) ensureLayers(); }catch(_){} },160); }); }catch(_){}
    return { run, clear, ISOTOPES, SOURCES, ZONES, resolveSite,
      /* ⚠ (#R214) THE ONLY WAY TO RESTORE A PLUME IS TO RUN IT AGAIN. There is no stored field to
         reopen: the answer is a Lagrangian solve over a LIVE wind field, so the state of this
         module is the QUESTION, not the picture. `set` therefore re-runs — which is the honest
         reading of 「その状態に戻ってくる」 — and only ever when a link actually carried one, so a
         plain reload of a session that never ran a plume costs nothing. */
      _share:{ get(){ return _lastRun?{ s:[+_lastRun.s.lng.toFixed(5),+_lastRun.s.lat.toFixed(5),_lastRun.s.name], o:_lastRun.o }:null; },
        set(v){ if(!v||!Array.isArray(v.s)) return;
          try{ setTimeout(()=>{ try{ run({lng:+v.s[0],lat:+v.s[1],name:v.s[2]||''}, v.o||{}); }catch(_){} },1200); }catch(_){} } } };
  })();
  /* (#R214) …and handed to the share registry (see the note on the sunlight simulator above). */
  try{ if(window.IntMapRadiation._share){ const _io=window.IntMapRadiation._share;
    if(window.IntMapShareState) window.IntMapShareState.register('radiation',_io);
    else (window._imShareEarly||(window._imShareEarly=[])).push(['radiation',_io]); } }catch(_){}
};

window.IntMapModules.popArea=function(HOST){
  window.IntMapPopArea=(function(){
    const cache=new Map();
    function _decim(ring){ const r=ring.map(p=>[+(+p[0]).toFixed(5),+(+p[1]).toFixed(5)]);
      if(r.length<=80) return r;
      const step=Math.ceil(r.length/79), out=[];
      for(let i=0;i<r.length;i+=step) out.push(r[i]);
      if(out[out.length-1][0]!==r[r.length-1][0]||out[out.length-1][1]!==r[r.length-1][1]) out.push(r[r.length-1]);
      return out; }
    function _prep(geom){ try{
      if(!geom) return null;
      if(geom.type==='Polygon') return {type:'Polygon',coordinates:geom.coordinates.map(_decim)};
      if(geom.type==='MultiPolygon') return {type:'MultiPolygon',coordinates:geom.coordinates.map(poly=>poly.map(_decim))};
      return null; }catch(_){ return null; } }
    /* (#R128) fetch with a HARD per-request timeout (AbortController). ROOT CAUSE of "大きい範囲になると失敗する":
       the public WorldPop endpoint frequently STALLS a connection under load (measured: 30s+ with NO response when
       several requests are in flight) and a bare fetch() has no timeout, so ONE hung tile froze the whole Promise.all
       batch until the browser's default socket timeout (minutes) — the tiled sum then never finished and the panel
       looked broken. R124/R127 bounded only the POLLING loop, never the create/poll fetch()es themselves. Aborting
       each request turns a stall into a fast retry instead of a permanent freeze. */
    function _fetchT(url, ms){
      let ctl=null, timer=null; try{ ctl=new AbortController(); }catch(_){ ctl=null; }
      const opt=ctl?{signal:ctl.signal}:{};
      if(ctl) timer=setTimeout(()=>{ try{ ctl.abort(); }catch(_){} }, ms||28000);
      return fetch(url,opt).finally(()=>{ if(timer) clearTimeout(timer); }); }
    /* one WorldPop request for a single (sub-limit) polygon → total_population number. `deadlineMs` bounds the WHOLE
       call (create + polling); each individual fetch aborts well inside it (a ≤90k km² tile normally finishes in
       seconds; a single free-form polygon keeps the full ~2 min). */
    async function _estimateOne(g, deadlineMs){
      const t0=Date.now(), DEADLINE=deadlineMs||125000;
      const fc={type:'FeatureCollection',features:[{type:'Feature',geometry:g,properties:{}}]};
      const u='https://api.worldpop.org/v1/services/stats?dataset=wpgppop&year=2020&geojson='+encodeURIComponent(JSON.stringify(fc));
      const r=await _fetchT(u, Math.min(30000, DEADLINE)); const j=await r.json();
      if(j&&j.error&&!j.taskid) throw new Error(String(j.error_message||'WorldPop error'));
      let data=j&&j.data&&j.data.total_population!=null?j.data:null;
      if(!data&&j&&j.taskid){
        /* (#R123/#R128) poll with a gentle backoff; each poll fetch is itself abortable so a stalled poll can't hang;
           break IMMEDIATELY on a real task error; ignore a transient hiccup. */
        let iv=1200;
        while(Date.now()-t0<DEADLINE){ await new Promise(rs=>setTimeout(rs,iv)); iv=Math.min(4000,iv+250);
          let j2=null; try{ const r2=await _fetchT('https://api.worldpop.org/v1/tasks/'+encodeURIComponent(j.taskid), 18000); j2=await r2.json(); }catch(_){ continue; }
          if(!j2) continue;
          if(j2.status==='finished'){ if(j2.error) throw new Error(String(j2.error_message||'WorldPop task error')); data=j2.data; break; }
          if(j2.status==='error'){ throw new Error(String(j2.error_message||'WorldPop task error')); } }
      }
      if(!data||data.total_population==null) throw new Error('WorldPop: no result (timeout or empty)');
      return +data.total_population; }
    /* one tile, with retries — the public WorldPop API rate-limits/stalls on bursts, so a lone transient failure must
       NOT be silently counted as 0 (that was the R124 undercount bug). (#R128) 3 attempts with a growing backoff and
       a 90s per-attempt budget (create can take ~15s under load + task processing); a stalled request now aborts fast
       (see _fetchT) so a retry actually gets a fresh connection instead of waiting on a dead socket. A "too large"
       error is FATAL (retrying can't help) and bubbles up. Returns {ok,v} or {ok:false,err,fatal?}. */
    async function _tileWithRetry(cell, tries){
      let lastErr=null; const N=tries||4;
      for(let t=0;t<N;t++){ if(t) await new Promise(rs=>setTimeout(rs, 2000+3000*t));   /* 2s,5s,8s,11s — long enough to ride out a WorldPop rate-limit window */
        try{ const v=await _estimateOne(cell, 105000); if(v!=null&&isFinite(v)) return {ok:true, v:+v}; }
        catch(e){ lastErr=e; if(/too large/i.test(String(e&&e.message||''))) return {ok:false, err:e.message, fatal:true}; } }
      return {ok:false, err:(lastErr&&lastErr.message)||'failed'}; }
    /* (#R124/#R127) FIX "大きい範囲になると失敗する": WorldPop caps EACH request at 100,000 km² (it returns
       "The requested area was too large … allowance was 100000"), which a poll-extension can't help because it
       isn't a timeout. Tile any larger polygon into sub-limit cells, clip each to the polygon with turf.bboxClip,
       and SUM them. R124 capped this at 80 cells (→ threw for anything past ~7M km², or a wide/ocean-spanning bbox
       with modest land) and swallowed every tile error as 0 (→ a rate-limited land tile silently undercounted, and
       an all-fail returned 0 as a bogus "success"). R127: raise the ceiling to cover continental selections, retry
       transient tile failures, and account for real failures HONESTLY (partial flag) instead of zeroing them. */
    async function _estimateTiled(g, areaKm2, onProgress){
      const feat={type:'Feature',geometry:g,properties:{}}; const bb=turf.bbox(feat);   /* [w,s,e,n] */
      /* size cells for the WORST case = the bbox's equator-ward edge (highest cos → largest cells); every cell
         poleward of it is then smaller, so ALL cells stay ≤ ~90,000 km² (safely under the 100k cap) while using the
         fewest requests. */
      const cLat=(bb[1]<=0&&bb[3]>=0)?0:Math.min(Math.abs(bb[1]),Math.abs(bb[3]));
      const cosl=Math.max(0.15,Math.cos(cLat*Math.PI/180));
      let d=Math.sqrt(90000/(12392*cosl)); d=Math.max(0.35,d);   /* cell side (deg) */
      const cells=[];
      for(let x=bb[0]; x<bb[2]-1e-9; x+=d){ for(let y=bb[1]; y<bb[3]-1e-9; y+=d){
        const box=[x,y,Math.min(x+d,bb[2]),Math.min(y+d,bb[3])]; let piece=null; try{ piece=turf.bboxClip(feat,box); }catch(_){}
        const gm=piece&&piece.geometry; if(!gm||!gm.coordinates||!gm.coordinates.length) continue;
        /* (#R128) skip a degenerate clip-sliver (< 0.05 km²) — for a jagged coastline the bbox spawns many near-zero
           edge tiles that hold ~0 people yet each cost a full (slow) request; dropping only numerical noise cuts the
           request count sharply for irregular shapes without measurably affecting the sum. */
        try{ if((turf.area(piece)/1e6)<0.05) continue; }catch(_){}
        if((gm.type==='Polygon'&&gm.coordinates[0]&&gm.coordinates[0].length>=4)||(gm.type==='MultiPolygon'&&gm.coordinates.length)){ const pg=_prep(gm); if(pg) cells.push(pg); } } }
      if(!cells.length) throw new Error('WorldPop: empty area');
      /* (#R127) ~90k km²/cell → 340 cells ≈ 30M km², larger than any single country; only a near-hemispheric
         selection exceeds it (and that genuinely can't be summed precisely at 100m). */
      if(cells.length>340) throw new Error('WorldPop: area too large to tile precisely ('+Math.round(areaKm2).toLocaleString()+' km²)');
      /* (#R128) STAGGERED WORKER POOL rather than fixed Promise.all batches. A batch waits for its slowest tile, so a
         single 30s-stall stalled the whole batch; a pool keeps CONC requests continuously in flight and pulls the next
         cell the instant one finishes. CONC=2 — measured: WorldPop serves ~4 concurrent CREATES but rate-limits under
         the SUSTAINED create+poll load of a many-tile sum (a 6-tile run during a self-inflicted burst lost 3 tiles);
         2-wide + patient retries trades a little speed for actually completing. Worker starts staggered ~300ms. */
      let total=0, done=0, ok=0, failed=0, fatal=null; let idx=0; const CONC=Math.min(2, cells.length);
      async function _worker(w){ if(w) await new Promise(rs=>setTimeout(rs, w*300));
        for(;;){ const my=idx++; if(my>=cells.length) return;
          const rr=await _tileWithRetry(cells[my], 3);
          if(rr.ok){ total+=rr.v; ok++; } else { failed++; if(rr.fatal&&!fatal) fatal=rr.err; }
          done++; if(onProgress){ try{ onProgress(Math.min(1, done/cells.length)); }catch(_){} } } }
      await Promise.all(Array.from({length:CONC}, (_,w)=>_worker(w)));
      if(fatal) throw new Error(fatal);
      /* HONEST accounting: an ocean/edge tile returns a real number (usually 0) — it is NOT a failure. A failure
         means the request itself errored after retries; never pretend those tiles are empty. */
      if(ok===0) throw new Error('WorldPop: no tiles could be fetched (service busy) — try again');
      const out={ pop:Math.round(total), year:2020, src:'WorldPop (100m grid, '+cells.length+' tiles)', tiles:cells.length, tilesOk:ok };
      if(failed>0){ out.partial=true; out.tilesFailed=failed; out.src='WorldPop (100m grid, '+ok+'/'+cells.length+' tiles, '+failed+' unavailable)'; }
      return out; }
    async function estimate(geom, onProgress){ const g=_prep(geom); if(!g) throw new Error('polygon required');
      const key=JSON.stringify(g); if(cache.has(key)) return cache.get(key);
      let areaKm2=0; try{ areaKm2=turf.area({type:'Feature',geometry:g,properties:{}})/1e6; }catch(_){}
      let out;
      if(areaKm2>95000){ out=await _estimateTiled(g, areaKm2, onProgress); }   /* over the per-request cap → tile + sum */
      /* (#R128) even a SINGLE sub-cap request now goes through the retry wrapper — a lone stalled connection used to
         hang the panel on "Calculating…" forever; now it aborts and retries, so a transient WorldPop hiccup recovers. */
      else { const rr=await _tileWithRetry(g, 3); if(!rr.ok) throw new Error(rr.err||'WorldPop failed'); out={ pop:Math.round(rr.v), year:2020, src:'WorldPop (100m grid)' }; }
      if(!out.partial) cache.set(key,out); return out; }   /* never cache a partial (undercounted) sum */
    function circleGeom(center,km){ try{ if(typeof turf!=='undefined'&&turf.circle){ return turf.circle(center,km,{units:'kilometers',steps:48}).geometry; } }catch(_){}
      const lat=center[1]*Math.PI/180; const dLat=km/111.32, dLng=km/(111.32*Math.cos(lat)||1);
      const ring=[]; for(let i=0;i<=48;i++){ const a=i/48*2*Math.PI; ring.push([center[0]+Math.sin(a)*dLng, center[1]+Math.cos(a)*dLat]); }
      return {type:'Polygon',coordinates:[ring]}; }
    return { estimate, circleGeom };
  })();
};

window.IntMapModules.slope=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  window.IntMapSlope=(function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { toggle(){}, run(){}, clear(){}, setMode(){} };
    const SRC='imslope-src'; let on=false, mode='slope', busy=false, moveT=null, lastKey='';
    const SL=window.IntMapLang.pick(()=>HOST.lang);
    function slopeColor(d){ return d<2?'#1a9850':d<5?'#66bd63':d<10?'#a6d96a':d<15?'#fee08b':d<20?'#fdae61':d<30?'#f46d43':d<40?'#d73027':'#a50026'; }
    function aspectColor(a){ return 'hsl('+Math.round(a)+',72%,55%)'; }
    function ensure(){ try{ if(GE().layers.hasSource(SRC)) return true; if(!_imCanDraw()) return false;
      GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      GE().layers.add({id:'imslope-fill',type:'fill',source:SRC,paint:{'fill-color':['coalesce',['get','col'],'#888'],'fill-opacity':0.55,'fill-antialias':false}});
      return true; }catch(_){ return false; } }
    async function run(){ if(busy||!on||!GE().hasRenderer()) return; let b; try{ b=GE().camera.getBounds(); }catch(_){ return; }
      const w=b.getWest(),s=b.getSouth(),e=b.getEast(),n=b.getNorth(); const z=Math.max(3,Math.min(13,Math.round(GE().camera.getZoom())));
      const key=[mode,z,w.toFixed(3),s.toFixed(3),e.toFixed(3),n.toFixed(3)].join(','); if(key===lastKey) return; lastKey=key; busy=true;
      try{ const samp=await window.IntMapTerrain.sampler([w,s,e,n],z); if(!samp||!on){ busy=false; return; }
        const COLS=48, dLng=(e-w)/COLS, dLat=(n-s)/COLS, midLat=(s+n)/2;
        const mLat=110540, mLng=111320*Math.cos(midLat*Math.PI/180); const feats=[];
        for(let i=0;i<COLS;i++)for(let j=0;j<COLS;j++){ const lng=w+(i+0.5)*dLng, lat=s+(j+0.5)*dLat;
          const zE=samp.elevAt(lng+dLng,lat), zW=samp.elevAt(lng-dLng,lat), zN=samp.elevAt(lng,lat+dLat), zS=samp.elevAt(lng,lat-dLat);
          if(zE==null||zW==null||zN==null||zS==null) continue;
          const dzdx=(zE-zW)/(2*dLng*mLng), dzdy=(zN-zS)/(2*dLat*mLat);
          const slope=Math.atan(Math.hypot(dzdx,dzdy))*180/Math.PI; let col;
          if(mode==='aspect'){ let asp=(Math.atan2(-dzdx,-dzdy)*180/Math.PI+360)%360; col=slope<1.5?'#b8b8b8':aspectColor(asp); } else col=slopeColor(slope);   /* downslope azimuth (the direction the slope faces), clockwise from north */
          feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[[w+i*dLng,s+j*dLat],[w+(i+1)*dLng,s+j*dLat],[w+(i+1)*dLng,s+(j+1)*dLat],[w+i*dLng,s+(j+1)*dLat],[w+i*dLng,s+j*dLat]]]},properties:{col:col}});
        }
        if(on){ try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); }catch(_){} updateLegend(feats.length); }
      }catch(_){}
      busy=false; }
    function updateLegend(nc){ try{ const el=window._registerLayerOpacity&&window._registerLayerOpacity('slope',[lbl(),lbl(),lbl(),lbl()],['imslope-fill'],'dl-slope'); if(!el) return; let h=el.querySelector('.sl-note'); if(!h){ h=document.createElement('div'); h.className='sl-note'; h.style.cssText='font-size:10.5px;color:var(--text-muted);margin-top:6px;line-height:1.5;'; el.appendChild(h);}
      const modeBtn='<button id="sl-mode" style="margin-top:5px;padding:3px 9px;border-radius:7px;border:1px solid var(--glass-border,rgba(128,128,128,0.3));background:var(--input-bg);color:var(--text-main);font-size:11px;cursor:pointer;">'+(mode==='slope'?SL('▸ Show aspect (direction)','▸ 斜面方向を表示','▸ Exposition','▸ Экспозиция','▸ Orientación'):SL('▸ Show slope (steepness)','▸ 傾斜角を表示','▸ Neigung','▸ Крутизна','▸ Pendiente'))+'</button>';
      const ramp=mode==='slope'?SL('flat → steep: green · yellow · orange · red (° gradient)','平坦→急: 緑・黄・橙・赤（傾斜角）','flach→steil','пологий→крутой','llano→empinado'):SL('slope direction (hue = compass bearing it faces)','斜面の向き（色相＝方位）','Hangrichtung','направление склона','orientación');
      h.innerHTML=ramp+'<br>'+modeBtn; const mb=h.querySelector('#sl-mode'); if(mb) mb.onclick=()=>setMode(mode==='slope'?'aspect':'slope'); }catch(_){} }
    const lbl=()=>SL('Slope / aspect','傾斜・斜面方向','Neigung / Exposition','Уклон / экспозиция','Pendiente / orientación');
    function setMode(m){ mode=(m==='aspect')?'aspect':'slope'; lastKey=''; run(); }
    function toggle(v){ on=v; const apply=()=>{ if(!ensure()){ GE().events.once('idle',apply); return; }
      try{ GE().layers.setLayout('imslope-fill','visibility',on?'visible':'none'); }catch(_){}
      if(on){ lastKey=''; run(); try{ window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){} } else { try{ window._hideGenericLegend&&window._hideGenericLegend('slope'); }catch(_){} try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} } };
      apply(); if(on)[400,1500].forEach(ms=>setTimeout(apply,ms)); }
    GE().events.on('moveend',()=>{ if(!on) return; clearTimeout(moveT); moveT=setTimeout(run,500); });
    GE().events.on('styledata',()=>{ if(on) setTimeout(()=>{ if(ensure()){ try{ GE().layers.setLayout('imslope-fill','visibility','visible'); }catch(_){} } },80); });
    function buildUI(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('dl-slope')) return;
      const w=document.createElement('div'); w.className='lyr-row'; w.id='lyrrow-slope';
      const lab=document.createElement('label'); lab.className='layer-option';
      const cb=document.createElement('input'); cb.type='checkbox'; cb.id='dl-slope';
      const sw=document.createElement('span'); sw.className='lyr-sw'; sw.style.background='#f46d43';
      const sp=document.createElement('span'); sp.id='dl-slope-lbl'; sp.textContent='⛰ '+lbl();
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ')); lab.appendChild(sw); lab.appendChild(document.createTextNode(' ')); lab.appendChild(sp);
      w.appendChild(lab); dd.appendChild(w);
      cb.addEventListener('change',ev=>{ w.classList.toggle('on',ev.target.checked); toggle(ev.target.checked); });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    window.addEventListener('intmap-lang',()=>{ const s=document.getElementById('dl-slope-lbl'); if(s) s.textContent='⛰ '+lbl(); });
    if(document.readyState!=='loading') setTimeout(buildUI,950); else document.addEventListener('DOMContentLoaded',()=>setTimeout(buildUI,950));
    return { toggle, run, clear:()=>toggle(false), setMode }; })();
};

window.IntMapModules.rf=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const makeDraggable=HOST.makeDraggable;
  window.IntMapRF=(function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { open(){}, run(){}, clear(){} };
    const SRC='imrf-src'; let panel=null, ant=null, busy=false, picking=false, pickH=null;
    let antH=30, txDbm=30, freq=900;   /* metres, dBm (1 W), MHz */
    const RF=window.IntMapLang.pick(()=>HOST.lang);
    const R2=6371008, Reff=R2*4/3;
    function dest(lng,lat,brg,dkm){ const dr=dkm/6371, la=lat*Math.PI/180, lo=lng*Math.PI/180; const la2=Math.asin(Math.sin(la)*Math.cos(dr)+Math.cos(la)*Math.sin(dr)*Math.cos(brg)); const lo2=lo+Math.atan2(Math.sin(brg)*Math.sin(dr)*Math.cos(la),Math.cos(dr)-Math.sin(la)*Math.sin(la2)); return [lo2*180/Math.PI,la2*180/Math.PI]; }
    function horizonKm(h){ return 4.12*(Math.sqrt(Math.max(1,h))+Math.sqrt(2)); }   /* 4/3-earth radio horizon, RX at 2 m */
    function fsplKm(){ const budget=txDbm-(-100)+3;   /* RX sensitivity −100 dBm, small antenna gain */ const d=Math.pow(10,(budget-32.44-20*Math.log10(freq))/20); return isFinite(d)?d:60; }
    function ensure(){ try{ if(GE().layers.hasSource(SRC)) return true; if(!_imCanDraw()) return false;
      GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      GE().layers.add({id:'imrf-fill',type:'fill',source:SRC,filter:['==','$type','Polygon'],paint:{'fill-color':'#12b886','fill-opacity':0.32}});
      GE().layers.add({id:'imrf-line',type:'line',source:SRC,filter:['==','$type','Polygon'],paint:{'line-color':'#0ca678','line-width':1.6}});
      GE().layers.add({id:'imrf-ant',type:'circle',source:SRC,filter:['==','$type','Point'],paint:{'circle-radius':6,'circle-color':'#ff3b30','circle-stroke-color':'#fff','circle-stroke-width':2.5}});
      return true; }catch(_){ return false; } }
    /* proper terrain VIEWSHED: a cell is covered only if NO closer terrain rises into the line of sight from the
       mast top to that cell (4/3-earth curvature drop applied). Marks true shadow gaps — no overstated coverage. */
    async function compute(lng,lat){ const maxR=Math.min(horizonKm(antH), fsplKm(), 80);
      const buf=maxR/110*1.12, z=Math.max(6,Math.min(13,Math.round(14-Math.log2(maxR+1))));
      const samp=await window.IntMapTerrain.sampler([lng-buf,lat-buf,lng+buf,lat+buf],z); if(!samp) return null;
      const g0=samp.elevAt(lng,lat); if(g0==null) return null; const top=g0+antH;
      const N=52, w0=lng-buf, s0=lat-buf, dLng=(2*buf)/N, dLat=(2*buf)/N;
      const mLat=110540, mLng=111320*Math.cos(lat*Math.PI/180); const feats=[]; let covered=0;
      for(let i=0;i<N;i++)for(let j=0;j<N;j++){ const clng=w0+(i+0.5)*dLng, clat=s0+(j+0.5)*dLat;
        const dx=(clng-lng)*mLng, dy=(clat-lat)*mLat, dm=Math.hypot(dx,dy); if(dm<60) continue; if(dm/1000>maxR) continue;
        const ce=samp.elevAt(clng,clat); if(ce==null) continue;
        const steps=Math.max(3,Math.min(70,Math.round(dm/(dLng*mLng)))); let maxAng=-Infinity;
        for(let k=1;k<steps;k++){ const t=k/steps, plng=lng+(clng-lng)*t, plat=lat+(clat-lat)*t, pe=samp.elevAt(plng,plat); if(pe==null) continue;
          const pdm=dm*t, drop=pdm*pdm/(2*Reff), ang=Math.atan2((pe-drop)-top,pdm); if(ang>maxAng) maxAng=ang; }
        const cdrop=dm*dm/(2*Reff), cAng=Math.atan2((ce-cdrop)-top,dm);
        if(cAng>=maxAng-1e-9){ covered++; feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[[w0+i*dLng,s0+j*dLat],[w0+(i+1)*dLng,s0+j*dLat],[w0+(i+1)*dLng,s0+(j+1)*dLat],[w0+i*dLng,s0+(j+1)*dLat],[w0+i*dLng,s0+j*dLat]]]},properties:{}}); }
      }
      return { maxR, g0, feats, covered, cellKm2:(dLng*mLng/1000)*(dLat*mLat/1000) }; }
    async function run(){ if(!ant||busy) return; busy=true; try{ ensure();
      if(panel){ const st=panel.querySelector('.rf-stat'); if(st) st.textContent=RF('Computing…','計算中…','Berechne…','Расчёт…','Calculando…'); }
      const r=await compute(ant.lng,ant.lat);
      if(r){ const feats=r.feats.concat([{type:'Feature',geometry:{type:'Point',coordinates:[ant.lng,ant.lat]},properties:{}}]);
        try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); }catch(_){}
        try{ GE().camera.fitBounds([[ant.lng-r.maxR/95,ant.lat-r.maxR/111],[ant.lng+r.maxR/95,ant.lat+r.maxR/111]],{padding:50,duration:800}); }catch(_){}
        if(panel){ const st=panel.querySelector('.rf-stat'); if(st) st.innerHTML='<b>'+RF('Max range','最大到達','Max. Reichweite','Дальность','Alcance')+':</b> '+r.maxR.toFixed(1)+' km · <b>'+RF('covered','受信域','abgedeckt','покрытие','cubierto')+':</b> ~'+Math.round(r.covered*r.cellKm2).toLocaleString()+' km² · '+RF('base','基地標高','Basis','база','base')+' '+Math.round(r.g0)+' m'; }
      } else if(panel){ const st=panel.querySelector('.rf-stat'); if(st) st.textContent=RF('No terrain data here.','この地点の地形データがありません。','Keine Geländedaten.','Нет данных.','Sin datos.'); }
    }catch(_){}
      busy=false; }
    function _endPick(){ picking=false; try{ if(pickH) GE().events.off('click',pickH); }catch(_){} pickH=null;
      try{ const P=window.IntMapPick; if(P&&P.active()) P.abort(); }catch(_){}
      try{ GE().render.canvas().style.cursor=''; }catch(_){} }
    /* (#R196) the panel steps aside while the map is being tapped — see js/map-pick.js */
    function startPick(){ _endPick(); picking=true;
      const P=window.IntMapPick;
      if(P&&P.start&&P.start({ panel,
        hint:RF('Tap the map to place the antenna.','地図をタップしてアンテナを設置してください。','Zum Setzen der Antenne auf die Karte tippen.','Нажмите на карту, чтобы разместить антенну.','Toca el mapa para colocar la antena.'),
        onPick:(ll)=>{ picking=false; ant={lng:ll.lng,lat:ll.lat}; run(); },
        onCancel:()=>{ picking=false; } })) return;
      try{ GE().render.canvas().style.cursor='crosshair'; }catch(_){} pickH=e=>{ ant={lng:e.lngLat.lng,lat:e.lngLat.lat}; _endPick(); run(); }; try{ GE().events.once('click',pickH); }catch(_){} }
    function ensurePanel(){ if(panel) return panel; panel=document.createElement('div'); panel.id='rf-panel';
      panel.style.cssText='position:fixed;left:16px;top:80px;width:min(320px,92vw);z-index:1402;display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
      const inC='width:100%;box-sizing:border-box;height:30px;padding:0 8px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;';
      panel.innerHTML='<div class="rf-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;"><span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">📡 '+RF('Radio coverage','電波・通信圏','Funkabdeckung','Радиопокрытие','Cobertura')+'</span><button class="rf-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>'
        +'<div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        +'<label style="font-size:10.5px;color:var(--text-muted);">'+RF('Antenna height (m)','アンテナ高 (m)','Höhe (m)','Высота (м)','Altura (m)')+'<input class="rf-h" type="number" min="1" max="1000" value="'+antH+'" style="'+inC+'"></label>'
        +'<label style="font-size:10.5px;color:var(--text-muted);">'+RF('TX power (dBm)','送信出力 (dBm)','Leistung (dBm)','Мощность','Potencia')+'<input class="rf-p" type="number" min="0" max="60" value="'+txDbm+'" style="'+inC+'"></label>'
        +'<label style="font-size:10.5px;color:var(--text-muted);grid-column:1 / span 2;">'+RF('Frequency (MHz)','周波数 (MHz)','Frequenz (MHz)','Частота','Frecuencia')+'<input class="rf-f" type="number" min="30" max="6000" value="'+freq+'" style="'+inC+'"></label>'
        +'</div>'
        +'<button class="rf-pick" style="height:34px;border:none;border-radius:9px;background:var(--primary-color);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;">◎ '+RF('Place antenna on map','地図でアンテナを設置','Antenne setzen','Разместить','Colocar')+'</button>'
        +'<div class="rf-stat" style="font-size:11.5px;color:var(--text-main);min-height:16px;"></div>'
        +'<div style="font-size:10px;color:var(--text-muted);line-height:1.5;">'+RF('Line-of-sight service area over real terrain (4/3-earth horizon + free-space path loss). A first approximation — no diffraction/clutter.','実地形上の見通し（4/3地球の電波見通し＋自由空間損失）。回折・遮蔽物は未考慮の一次近似です。','Sichtlinie über echtem Gelände.','Прямая видимость по рельефу.','Línea de vista sobre terreno real.')+'</div></div>';
      document.body.appendChild(panel);
      panel.querySelector('.rf-close').onclick=()=>{ panel.style.display='none'; _endPick(); try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} };
      const gv=(sel,d)=>{ const el=panel.querySelector(sel); const v=+el.value; return isFinite(v)?v:d; };
      panel.querySelector('.rf-h').onchange=()=>{ antH=Math.max(1,gv('.rf-h',30)); if(ant) run(); };
      panel.querySelector('.rf-p').onchange=()=>{ txDbm=gv('.rf-p',30); if(ant) run(); };
      panel.querySelector('.rf-f').onchange=()=>{ freq=Math.max(30,gv('.rf-f',900)); if(ant) run(); };
      panel.querySelector('.rf-pick').onclick=()=>startPick();
      try{ if(typeof makeDraggable==='function') makeDraggable(panel,panel.querySelector('.rf-head')); }catch(_){}
      return panel; }
    function open(ll){ ensure(); ensurePanel(); panel.style.display='flex'; if(ll&&ll.lng!=null){ ant={lng:ll.lng,lat:ll.lat}; run(); } }
    return { open, run, clear:()=>{ if(panel) panel.style.display='none'; try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} }, _compute:compute, setParams:(h,p,f)=>{ if(h)antH=h; if(p!=null)txDbm=p; if(f)freq=f; } }; })();
};

window.IntMapModules.sun=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const makeDraggable=HOST.makeDraggable;
  window.IntMapSun=(function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { open(){}, close(){}, setTime(){} };
    const SRC='imsun-src'; const rad=Math.PI/180, J1970=2440588, J2000=2451545, dayMs=86400000, e=rad*23.4397;
    let panel=null, when=new Date(), busy=false, moveT=null, playing=0, bbldCache=null, bboxKey='';
    const SN=window.IntMapLang.pick(()=>HOST.lang);
    /* (#R176) shared style for the three engine buttons added below */
    const SBTN='flex:1 1 auto;padding:5px 7px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:11px;cursor:pointer;white-space:nowrap;';
    const toDays=d=>d.valueOf()/dayMs-0.5+J1970-J2000;
    function sunPos(date,lat,lng){ const lw=rad*-lng, phi=rad*lat, d=toDays(date);
      const M=rad*(357.5291+0.98560028*d), C=rad*(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M)), L=M+C+rad*102.9372+Math.PI;
      const dec=Math.asin(Math.sin(e)*Math.sin(L)), ra=Math.atan2(Math.sin(L)*Math.cos(e),Math.cos(L));
      const th=rad*(280.16+360.9856235*d)-lw, H=th-ra;
      const alt=Math.asin(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H));
      const az=Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(phi)-Math.tan(dec)*Math.cos(phi));   /* from south, +west */
      return { altitude:alt, azimuth:az, azCompass:(az/rad+180+360)%360, altDeg:alt/rad, dec:dec }; }
    function sunTimes(date,lat,lng){ /* SunCalc times: proper Julian-cycle transit (integer n, not the fractional day) */
      const lw=rad*-lng, phi=rad*lat, d=toDays(date), J0=0.0009;
      const n=Math.round(d-J0-lw/(2*Math.PI)), ds=J0+lw/(2*Math.PI)+n;
      const M=rad*(357.5291+0.98560028*ds), C=rad*(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M)), L=M+C+rad*102.9372+Math.PI, dec=Math.asin(Math.sin(e)*Math.sin(L));
      const solarTransitJ=dss=>J2000+dss+0.0053*Math.sin(M)-0.0069*Math.sin(2*L);
      const Jnoon=solarTransitJ(ds), toDate=J=>new Date((J+0.5-J1970)*dayMs);
      const h0=rad*-0.833, cosH=(Math.sin(h0)-Math.sin(phi)*Math.sin(dec))/(Math.cos(phi)*Math.cos(dec));
      if(cosH>1) return {polar:'night'}; if(cosH<-1) return {polar:'day'};
      const w0=Math.acos(cosH), a=J0+(w0+lw)/(2*Math.PI)+n, Jset=solarTransitJ(a), Jrise=Jnoon-(Jset-Jnoon);
      return { rise:toDate(Jrise), set:toDate(Jset), noon:toDate(Jnoon) }; }
    /* ══ (#R210) HOW DARK THE SHADOW IS, IS THE USER'S CHOICE ═════════════════════════════════════
       「影の透明度を選択可能に」. 0.30 was a literal in two places — this fill and the terrain-shade
       raster in js/insolation.js — so "the shadow" had two different opacities that no control
       reached. One number here now drives both: this layer directly, and the raster through
       IntMapInsolation.setShadowOpacity(). Persisted, because it is a preference and not a mode.
       ⚠ (#R212) 「ポップアップを透過するな。」 — every floating panel in this file was drawn on
       `--popup-bg`, which is rgba(…,0.74), and unlike the CSS classes that use it these have no
       `backdrop-filter`: the map showed straight through the numbers. They now sit on `--card-bg`,
       which is opaque in both themes, the same surface js/world-packs.js's panels use. */
    const SHADOW_OP_KEY='intmap_shadow_opacity';
    let shadowOp=(function(){ try{ const v=parseFloat(localStorage.getItem(SHADOW_OP_KEY)); return (isFinite(v)&&v>0&&v<=1)?v:0.30; }catch(_){ return 0.30; } })();
    function setShadowOpacity(v){
      /* (#R212) 「透明度100%は全然100%ではない。」 — the ceiling was 0.95 here and, worse, the terrain
         raster could only reach 30 % of black however far the slider went. Both ends are honest now:
         1.0 is opaque here, and js/insolation.js re-bakes its PNG's alpha instead of dimming it. */
      v=Math.max(0.05,Math.min(1,+v||0.30)); shadowOp=v;
      try{ localStorage.setItem(SHADOW_OP_KEY,String(v)); }catch(_){}
      try{ if(GE().layers.has('imsun-shadow')) GE().layers.setPaint('imsun-shadow','fill-opacity',v); }catch(_){}
      try{ const I=window.IntMapInsolation; if(I&&I.setShadowOpacity) I.setShadowOpacity(v); }catch(_){}
      return v; }
    function ensure(){ try{ if(GE().layers.hasSource(SRC)) return true; if(!_imCanDraw()) return false;
      GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      GE().layers.add({id:'imsun-shadow',type:'fill',source:SRC,paint:{'fill-color':'#0b1021','fill-opacity':shadowOp}});
      return true; }catch(_){ return false; } }
    /* OSM buildings in view → cast-shadow polygons (only when zoomed in enough to be useful) */
    async function fetchBld(){ let b; try{ b=GE().camera.getBounds(); }catch(_){ return []; } if(GE().camera.getZoom()<14.5) return [];
      const s=b.getSouth().toFixed(4),w=b.getWest().toFixed(4),n=b.getNorth().toFixed(4),eA=b.getEast().toFixed(4); const key=[s,w,n,eA].join(',');
      if(key===bboxKey&&bbldCache) return bbldCache; bboxKey=key;
      const q='[out:json][timeout:25];(way["building"]('+s+','+w+','+n+','+eA+'););out geom 900;';
      const EPS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
      for(const ep of EPS){ try{ const r=await fetch(ep,{method:'POST',body:'data='+encodeURIComponent(q)}); if(!r.ok) continue; const j=await r.json();
        const bld=(j.elements||[]).filter(el=>el.geometry&&el.geometry.length>2).map(el=>{ const t=el.tags||{}; let h=parseFloat(t.height)||((parseFloat(t['building:levels'])||0)*3)||10; return { ring:el.geometry.map(g=>[g.lon,g.lat]), h:Math.min(h,400) }; });
        bbldCache=bld; return bld; }catch(_){} }
      return bbldCache||[]; }
    async function drawShadows(){ if(busy) return; busy=true; try{ ensure();
      const c=GE().camera.getCenter(); const sp=sunPos(when,c.lat,c.lng);
      updatePanel(sp);
      try{ if(sp.altDeg>0) GE().scene.setLight&&GE().scene.setLight({anchor:'map',position:[1.5,sp.azCompass,Math.max(1,90-sp.altDeg)],color:'#fff5e6',intensity:0.5}); else GE().scene.setLight&&GE().scene.setLight({anchor:'map',position:[1.5,0,60],color:'#213',intensity:0.25}); }catch(_){}
      if(sp.altDeg<=0.5){ try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} busy=false; return; }   /* sun down → no cast shadows */
      const bld=await fetchBld(); const shadowBrg=(sp.azCompass+180)%360, br=shadowBrg*rad;
      const Lm=1/Math.tan(sp.altitude); const feats=[]; const clat=c.lat;
      const offLng=m=>m*Math.sin(br)/(111320*Math.cos(clat*rad)), offLat=m=>m*Math.cos(br)/110540;
      bld.forEach(bd=>{ const L=bd.h*Lm; if(!(L>0)) return; const oL=offLng(L), oA=offLat(L); const r0=bd.ring;
        for(let i=0;i<r0.length-1;i++){ const a=r0[i], b2=r0[i+1]; feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[[a[0],a[1]],[b2[0],b2[1]],[b2[0]+oL,b2[1]+oA],[a[0]+oL,a[1]+oA],[a[0],a[1]]]]},properties:{}}); }
        feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[r0.map(p=>[p[0]+oL,p[1]+oA])]},properties:{}}); });
      try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); }catch(_){}
    }catch(_){} busy=false; }
    function fmtT(d){ try{ return d.toLocaleTimeString(HOST.lang==='jp'?'ja-JP':'en-GB',{hour:'2-digit',minute:'2-digit'}); }catch(_){ return '—'; } }
    function updatePanel(sp){ if(!panel) return; const c=GE().camera.getCenter(); const st=sunTimes(when,c.lat,c.lng);
      const rd=panel.querySelector('.sun-read'); if(rd){ const dir=['N','NE','E','SE','S','SW','W','NW'][Math.round(sp.azCompass/45)%8];
        rd.innerHTML='<b>'+(sp.altDeg>0?'☀️':'🌙')+' '+SN('Altitude','高度','Höhe','Высота','Altura')+' '+sp.altDeg.toFixed(1)+'° · '+SN('Azimuth','方位','Azimut','Азимут','Azimut')+' '+Math.round(sp.azCompass)+'° '+dir+'</b>'
          +'<div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;">'+(st.polar?SN('polar '+st.polar,st.polar==='day'?'白夜':'極夜','Polar','полярный','polar'):('🌅 '+fmtT(st.rise)+' · ☀️ '+fmtT(st.noon)+' · 🌇 '+fmtT(st.set)))+'</div>'; } }
    function setTime(d){ when=(d instanceof Date)?d:new Date(d); if(when<0||isNaN(when)) when=new Date(); syncInputs(); drawShadows();
      try{ drawTerrain(); }catch(_){}   /* (#R176) the terrain shadow follows the same clock as the buildings' */ }
    function syncInputs(){ if(!panel) return; const di=panel.querySelector('.sun-date'), ti=panel.querySelector('.sun-time'), tl=panel.querySelector('.sun-slider');
      try{ if(di) di.value=when.toISOString().slice(0,10); }catch(_){} const mins=when.getHours()*60+when.getMinutes(); if(tl) tl.value=mins; if(ti) ti.textContent=fmtT(when); }
    function ensurePanel(){ if(panel) return panel; panel=document.createElement('div'); panel.id='sun-panel';
      panel.style.cssText='position:fixed;left:16px;top:80px;width:min(320px,92vw);z-index:1402;display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
      panel.innerHTML='<div class="sun-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;"><span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">🌇 '+SN('Sun & shadow','日照・影','Sonne & Schatten','Солнце и тень','Sol y sombra')+'</span><button class="sun-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>'
        +'<div style="padding:10px 12px;display:flex;flex-direction:column;gap:9px;">'
        +'<div style="display:flex;gap:8px;align-items:center;"><input type="date" class="sun-date" style="flex:1;height:30px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;padding:0 6px;"><button class="sun-now" style="height:30px;padding:0 10px;border:none;border-radius:8px;background:var(--input-bg);color:var(--text-main);font-size:11px;cursor:pointer;">'+SN('Now','現在','Jetzt','Сейчас','Ahora')+'</button><button class="sun-play" style="height:30px;width:34px;border:none;border-radius:8px;background:var(--primary-color);color:#fff;font-size:13px;cursor:pointer;">▶</button></div>'
        +'<div style="display:flex;align-items:center;gap:8px;"><input type="range" class="sun-slider" min="0" max="1439" value="720" style="flex:1;"><span class="sun-time" style="font-size:12px;font-weight:700;color:var(--text-main);min-width:44px;text-align:right;">12:00</span></div>'
        +'<div class="sun-read" style="font-size:12px;color:var(--text-main);"></div>'
        /* (#R210) 「影の透明度を選択可能に」 — one control for BOTH shadow layers (the buildings'
           cast polygons and the terrain shade raster), because to a user there is one shadow. */
        +'<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:11.5px;color:var(--text-muted);white-space:nowrap;">'
          +SN('Shadow opacity','影の濃さ','Schattenstärke','Плотность тени','Opacidad de la sombra')
          +'</span><input type="range" class="sun-op" min="5" max="100" step="5" value="30" style="flex:1;accent-color:var(--primary-color);">'
          +'<span class="sun-op-v" style="font-size:11.5px;font-weight:700;color:var(--text-main);min-width:34px;text-align:right;">30%</span></div>'
        /* (#R210) 「操作方法が分かりにくい」 — the panel had three buttons and a paragraph of physics,
           and nothing that said what to DO. Three sentences, in the order a first-time user needs
           them, above the buttons they describe. */
        +'<div style="font-size:11px;color:var(--text-muted);line-height:1.55;background:var(--input-bg);border-radius:8px;padding:7px 9px;">'
          +SN('Drag the slider to move the time of day, or press ▶ to run it. ⛰ adds the shade the terrain itself casts. ◎ then a click on the map reports that spot’s sunlight hours over a whole year.',
              'スライダーで時刻を動かし、▶ で再生します。⛰ を押すと地形自身が落とす影が加わります。◎ を押してから地図をクリックすると、その地点の年間日照時間が出ます。',
              'Mit dem Regler die Tageszeit bewegen, ▶ spielt sie ab. ⛰ ergänzt den Schatten des Geländes. ◎ und dann ein Klick auf die Karte liefert die Sonnenstunden dieses Punktes über ein ganzes Jahr.',
              'Ползунком двигайте время суток, ▶ — воспроизведение. ⛰ добавляет тень самого рельефа. ◎, затем клик по карте — часы солнца в этой точке за год.',
              'Arrastra el control para mover la hora del día, ▶ lo reproduce. ⛰ añade la sombra del propio terreno. ◎ y luego un clic en el mapa da las horas de sol de ese punto durante un año.')
        +'</div>'
        /* (#R176) 「影・日照時間エンジン」 — the terrain's own shadow, the whole-day shadow union and the
           annual sunlight budget at a point. The heavy work is js/insolation.js; this panel owns the
           controls so there is ONE sun tool, not two (the user's choice for this round). */
        +'<div style="display:flex;flex-wrap:wrap;gap:5px;">'
          +'<button class="sun-terr" style="'+SBTN+'">⛰ '+SN('Terrain shadow','地形の影','Geländeschatten','Тень рельефа','Sombra del terreno')+'</button>'
          +'<button class="sun-solst" style="'+SBTN+'">❄ '+SN('Winter-solstice shade','冬至の影','Wintersonnenwende','Зимнее солнцестояние','Solsticio de invierno')+'</button>'
          +'<button class="sun-point" style="'+SBTN+'">◎ '+SN('Sunlight at a point','地点の日照時間','Sonnenstunden am Punkt','Часы солнца в точке','Horas de sol en un punto')+'</button>'
        +'</div>'
        +'<div class="sun-eng" style="font-size:11.5px;color:var(--text-main);line-height:1.55;"></div>'
        +'<div style="font-size:10px;color:var(--text-muted);line-height:1.5;">'+SN('Shadows are cast by OSM buildings in view (zoom in past ~z15) and, with the terrain button on, by the real elevation model. Sun path from the SunCalc algorithm; 3D building faces are lit from the sun. The point analysis reads a 360° horizon off the DEM (curvature + refraction) and steps a whole year against it; the irradiance is CLEAR-SKY, not a weather forecast.','影は表示中のOSM建物から算出（z15以上に拡大）、「地形の影」を押すと実標高データによる山影も加わります。太陽の位置はSunCalcアルゴリズム、3D建物は太陽方向から陰影付け。地点解析はDEMから360°の地平線（地球曲率＋大気屈折を考慮）を求め、1年分の太陽位置と比較します。日射量は快晴時の値で、天気予報ではありません。','Schatten aus OSM-Gebäuden und – mit der Geländetaste – aus dem echten Höhenmodell. Die Punktanalyse liest einen 360°-Horizont aus dem DEM und prüft ein ganzes Jahr dagegen; die Einstrahlung gilt für klaren Himmel.','Тени от зданий OSM и, с кнопкой рельефа, от реальной модели высот. Анализ точки строит горизонт 360° по DEM и проверяет весь год; инсоляция — для ясного неба.','Sombras de edificios OSM y, con el botón de terreno, del modelo real de elevación. El análisis de punto obtiene un horizonte de 360° del DEM y recorre un año entero; la irradiancia es de cielo despejado.')+'</div></div>';
      document.body.appendChild(panel);
      panel.querySelector('.sun-close').onclick=()=>close();
      panel.querySelector('.sun-terr').onclick=()=>toggleTerrain();
      panel.querySelector('.sun-solst').onclick=()=>solsticeShade();
      panel.querySelector('.sun-point').onclick=()=>pickPoint();
      panel.querySelector('.sun-now').onclick=()=>setTime(new Date());
      { const op=panel.querySelector('.sun-op'); if(op){ op.value=String(Math.round(shadowOp*100)); const lab=panel.querySelector('.sun-op-v'); if(lab) lab.textContent=Math.round(shadowOp*100)+'%';
        op.oninput=e=>{ setShadowOpacity((+e.target.value||30)/100); const l2=panel.querySelector('.sun-op-v'); if(l2) l2.textContent=Math.round(shadowOp*100)+'%'; }; } }   /* (#R210) */
      panel.querySelector('.sun-date').onchange=e=>{ const p=e.target.value.split('-'); const nd=new Date(when); nd.setFullYear(+p[0],+p[1]-1,+p[2]); setTime(nd); };
      panel.querySelector('.sun-slider').oninput=e=>{ const m=+e.target.value; const nd=new Date(when); nd.setHours(Math.floor(m/60),m%60,0,0); when=nd; syncInputs(); clearTimeout(moveT); moveT=setTimeout(()=>{ drawShadows(); drawTerrain(); },120); };
      const pb=panel.querySelector('.sun-play'); pb.onclick=()=>{ if(playing){ clearInterval(playing); playing=0; pb.textContent='▶'; } else { pb.textContent='⏸'; playing=setInterval(()=>{ const nd=new Date(when.getTime()+15*60000); setTime(nd); },700); } };
      try{ if(typeof makeDraggable==='function') makeDraggable(panel,panel.querySelector('.sun-head')); }catch(_){}
      return panel; }
    /* ===== (#R176) the terrain/annual half of the engine — thin controls over js/insolation.js ===== */
    let terrainOn=false, engBusy=false, pickH=null;
    const ENG=()=>window.IntMapInsolation;
    function engSay(h){ const e=panel&&panel.querySelector('.sun-eng'); if(e) e.innerHTML=h; }
    function syncTerrBtn(){ const b=panel&&panel.querySelector('.sun-terr'); if(!b) return;
      b.style.background=terrainOn?'var(--primary-color)':'var(--input-bg)'; b.style.color=terrainOn?'#fff':'var(--text-main)'; }
    const nf=(v,d)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:d==null?0:d});
    async function drawTerrain(){ if(!terrainOn||engBusy||!ENG()) return; engBusy=true;
      try{ const r=await ENG().shade(when,{refit:true});
        if(r) engSay('⛰ '+SN('Terrain shadow','地形の影','Geländeschatten','Тень рельефа','Sombra del terreno')+': '
          +nf(r.shadedFrac*100,1)+'% '+SN('of the view','が影','der Ansicht','вида','de la vista')
          +' · '+SN('sun','太陽','Sonne','солнце','sol')+' '+nf(r.altDeg,1)+'° / '+nf(r.azDeg)+'°'
          +' · '+nf(r.cellM)+' m '+SN('cells','セル','Zellen','ячейки','celdas')+' · DEM z'+r.z);
      }catch(_){ } engBusy=false; }
    function toggleTerrain(){ terrainOn=!terrainOn; syncTerrBtn();
      if(terrainOn){ engSay(SN('Reading the terrain…','地形を読み込み中…','Gelände wird gelesen…','Чтение рельефа…','Leyendo el terreno…')); drawTerrain(); }
      else { try{ ENG()&&ENG().clear(); }catch(_){} engSay(''); } }
    async function solsticeShade(){ if(engBusy||!ENG()) return; engBusy=true;
      engSay(SN('Stepping through the solstice day…','冬至の1日を計算中…','Sonnenwendtag wird durchlaufen…','Расчёт дня солнцестояния…','Recorriendo el solsticio…'));
      try{
        const lat=GE().camera.getCenter().lat, y=when.getFullYear();
        const d=new Date(y, lat>=0?11:5, 21, 12, 0, 0);               /* the SHORT day for this hemisphere */
        const r=await ENG().dayShadow(d,{refit:true});
        terrainOn=true; syncTerrBtn();
        if(r) engSay('❄ '+SN('Never sunlit on','日照ゼロ（','Nie besonnt am ','Без солнца ','Sin sol el ')+r.day+SN('','）',': ',': ',': ')+' — <b>'+nf(r.neverSunFrac*100,1)+'%</b> '
          +SN('of the view','の面積','der Ansicht','вида','de la vista')+' · '+r.steps+' '+SN('sun positions','時刻で判定','Sonnenstände','положений','posiciones')
          +' · '+nf(r.cellM)+' m '+SN('cells','セル','Zellen','ячейки','celdas'));
      }catch(_){ } engBusy=false; }
    function endPick(){ try{ if(pickH) GE().events.off('click',pickH); }catch(_){} pickH=null;
      try{ const P=window.IntMapPick; if(P&&P.active()) P.abort(); }catch(_){}
      try{ GE().render.canvas().style.cursor=''; }catch(_){} }
    /* (#R196) the panel steps aside while the map is being tapped — see js/map-pick.js */
    function pickPoint(){ endPick();
      engSay(SN('Click the point to analyze.','解析する地点をクリックしてください。','Punkt anklicken.','Кликните точку.','Haga clic en el punto.'));
      const P=window.IntMapPick;
      if(P&&P.start&&P.start({ panel,
        hint:SN('Tap the point to analyze.','解析する地点をタップしてください。','Auf den zu analysierenden Punkt tippen.','Нажмите на точку для анализа.','Toca el punto a analizar.'),
        onPick:(ll)=>{ analysePoint(ll.lng,ll.lat); } })) return;
      try{ GE().render.canvas().style.cursor='crosshair'; }catch(_){}
      pickH=async e=>{ endPick(); await analysePoint(e.lngLat.lng,e.lngLat.lat); };
      try{ GE().events.once('click',pickH); }catch(_){} }
    async function analysePoint(lng,lat){ if(engBusy||!ENG()) return null; engBusy=true;
      engSay(SN('Building the 360° horizon and stepping a year…','360°の地平線と1年分を計算中…','360°-Horizont und ein Jahr…','Горизонт 360° и целый год…','Horizonte de 360° y un año…'));
      let a=null;
      try{ a=await ENG().analyse(lng,lat,{});
        const d=await ENG().dayAt(lng,lat,when,{});
        const hhmm=t=>{ try{ return t?t.toLocaleTimeString(HOST.lang==='jp'?'ja-JP':'en-GB',{hour:'2-digit',minute:'2-digit'}):'—'; }catch(_){ return '—'; } };
        engSay('◎ '+lat.toFixed(4)+', '+lng.toFixed(4)+' · '+nf(a.groundM)+' m'
          +'<br><b>'+nf(a.annualHours)+' h</b> '+SN('of sun a year','の年間日照','Sonne pro Jahr','солнца в год','de sol al año')
          +' ('+SN('open horizon would give','遮蔽なしなら','ohne Horizont','без горизонта','sin horizonte')+' '+nf(a.annualOpenHours)+' h · −'+nf(a.lossPct,1)+'%)'
          +'<br>'+SN('Winter solstice','冬至','Wintersonnenwende','Зимнее солнцестояние','Solsticio de invierno')+' <b>'+nf(a.winterSolstice,1)+' h</b>'
          +' · '+SN('summer','夏至','Sommer','лето','verano')+' '+nf(a.summerSolstice,1)+' h'
          +' · '+SN('equinox','春分','Tagundnachtgleiche','равноденствие','equinoccio')+' '+nf(a.equinox,1)+' h'
          +(a.zeroSunDays?('<br><b>'+a.zeroSunDays+'</b> '+SN('days a year with no sun at all','日は終日日が当たりません','Tage ohne Sonne','дней без солнца','días sin sol')):'')
          +'<br>'+SN('Usable for PV','発電可能時間','PV-nutzbar','Пригодно для СЭС','Útil para FV')+' (>'+10+'°): <b>'+nf(a.pvHours)+' h</b> · '
          +SN('clear-sky beam','快晴時の直達日射','klarer Himmel','ясное небо','cielo despejado')+' '+nf(a.beamKWhM2)+' kWh/m²'
          +'<br>'+SN('Today','この日','Heute','Сегодня','Hoy')+': '+hhmm(d.first)+' → '+hhmm(d.last)+' ('+nf(d.hours,1)+' h) · '
          +SN('highest ridge','最も高い稜線','höchster Grat','высший гребень','cresta más alta')+' '+nf(a.maxHorizonDeg.deg,1)+'° @ '+nf(a.maxHorizonDeg.azimuth)+'°'
          +'<br><span style="opacity:0.72;">'+SN('horizon scanned to','地平線の探索半径','Horizont bis','горизонт до','horizonte hasta')+' '+nf(a.radiusKm)+' km · DEM z'+a.demZ+' · '+a.year+'</span>');
      }catch(_){ engSay(SN('Could not read enough terrain here.','この地点の地形データを取得できませんでした。','Zu wenig Geländedaten.','Недостаточно данных рельефа.','Terreno insuficiente aquí.')); }
      engBusy=false; return a; }

    GE().events.on('moveend',()=>{ if(panel&&panel.style.display!=='none') { clearTimeout(moveT); moveT=setTimeout(()=>{ drawShadows(); drawTerrain(); },500); } });
    /* (#R176) This panel bakes every label at construction and was built once, so switching language
       left it in the old one — measured: the three new buttons stayed English after a switch to JP.
       Nothing here holds state that `when` and the module-level flags do not, so the honest fix is to
       throw the panel away and let ensurePanel() rebuild it in the new language. */
    window.addEventListener('intmap-lang',()=>{ if(!panel) return;
      const wasOpen=panel.style.display!=='none';
      if(playing){ clearInterval(playing); playing=0; }
      try{ panel.remove(); }catch(_){} panel=null;
      if(wasOpen) open(); });
    function open(){ ensure(); ensurePanel(); panel.style.display='flex'; syncInputs(); syncTerrBtn(); drawShadows(); if(terrainOn) drawTerrain(); }
    function close(){ if(panel) panel.style.display='none'; if(playing){ clearInterval(playing); playing=0; const pb=panel&&panel.querySelector('.sun-play'); if(pb) pb.textContent='▶'; } endPick(); try{ ENG()&&ENG().clear(); }catch(_){} try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} try{ GE().scene.setLight&&GE().scene.setLight({anchor:'viewport',position:[1.15,210,30]}); }catch(_){} }
    return { open, close, setTime, _sunPos:sunPos, _sunTimes:sunTimes,
      /* (#R176) the new half, so Atlas and the tests can drive it */
      terrainShadow:(on)=>{ const want=(on==null)?!terrainOn:!!on; if(want!==terrainOn) toggleTerrain(); return terrainOn; },
      solsticeShade, analysePoint,
      /* (#R214) the instant being studied and whether the terrain shadow is on — a shared sunlight
         link that reopened at 'now' would be answering a different question than the one sent. */
      _share:{ get(){ if(!(panel&&panel.style.display!=='none')) return null;
          return { w:when.toISOString(), tr:terrainOn?1:0 }; },
        set(v){ if(!v) return; try{ open(); }catch(_){}
          try{ if(v.w){ const d=new Date(v.w); if(!isNaN(d.getTime())) setTime(d); } }catch(_){}
          try{ if(v.tr!=null&&!!v.tr!==terrainOn) toggleTerrain(); }catch(_){} } },
      state:()=>({ open:!!(panel&&panel.style.display!=='none'), when:when.toISOString(), terrainOn }) }; })();
  /* (#R214) 「再読み込みした際に、できる限りその状態に戻ってくるようにして。」 — the simulators
     #R211 left unregistered. `_share` is the module's own {get,set}; this is the one line that
     hands it to the registry js/map-ui.js packs into the link's `s=` parameter. ⚠ The KEY is the
     lazy-module name where there is one, because `apply()` fetches by that name at restore. */
  try{ if(window.IntMapSun._share){ const _io=window.IntMapSun._share;
    if(window.IntMapShareState) window.IntMapShareState.register('sun',_io);
    else (window._imShareEarly||(window._imShareEarly=[])).push(['sun',_io]); } }catch(_){}

};

window.IntMapModules.transitReach=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const satToast=HOST.satToast;
  window.IntMapTransitReach=(function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { run(){ return Promise.resolve({ok:false}); }, open(){}, clear(){} };
    const SRC='imtr-src'; let busy=false;
    const _hav=(a,b)=>{ const R=6371,dLat=(b[1]-a[1])*Math.PI/180,dLng=(b[0]-a[0])*Math.PI/180,la1=a[1]*Math.PI/180,la2=b[1]*Math.PI/180; const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.min(1,Math.sqrt(h))); };
    function ensure(){ try{ if(GE().layers.hasSource(SRC)) return true; if(!_imCanDraw()) return false;
      GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      GE().layers.add({id:'imtr-area',type:'fill',source:SRC,filter:['==','$type','Polygon'],paint:{'fill-color':'#1558d6','fill-opacity':0.14}});
      GE().layers.add({id:'imtr-area-l',type:'line',source:SRC,filter:['==','$type','Polygon'],paint:{'line-color':'#1558d6','line-width':1.4,'line-dasharray':[2,1.5]}});
      GE().layers.add({id:'imtr-stn',type:'circle',source:SRC,filter:['==','$type','Point'],paint:{'circle-radius':['interpolate',['linear'],['zoom'],6,3,12,5.5],'circle-color':['coalesce',['get','col'],'#1558d6'],'circle-stroke-color':'#fff','circle-stroke-width':1.4}});
      return true; }catch(_){ return false; } }
    const EPS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
    async function fetchNet(bb){ const q='[out:json][timeout:60];(way["railway"~"^(rail|light_rail|subway|tram|narrow_gauge|monorail)$"][!"service"]('+bb+');node["railway"~"^(station|halt)$"]('+bb+'););out body;>;out skel qt;';
      const _partial=j=>/timed out|out of memory|runtime error/i.test((j&&j.remark)||'');
      const _fetchT=(u,o)=>{ const ac=new AbortController(),t=setTimeout(()=>{try{ac.abort();}catch(_){}} ,55000); return fetch(u,Object.assign({signal:ac.signal},o||{})).finally(()=>clearTimeout(t)); };
      for(const ep of EPS){ try{ const r=await _fetchT(ep,{method:'POST',body:'data='+encodeURIComponent(q)}); if(r&&r.ok){ const j=await r.json(); if(j&&j.elements&&j.elements.length&&!_partial(j)) return j; } }catch(_){} }
      try{ const r=await _fetchT('https://corsproxy.io/?url='+encodeURIComponent(EPS[0]+'?data='+encodeURIComponent(q))); if(r&&r.ok){ const j=await r.json(); if(j&&j.elements&&!_partial(j)) return j; } }catch(_){}
      return null; }
    const SPD={rail:70,light_rail:38,subway:35,tram:22,narrow_gauge:45,monorail:40};
    async function run(from,minutes){ if(busy) return {ok:false,reason:'busy'}; minutes=Math.max(10,Math.min(120,+minutes||60));
      const A=[+from.lng,+from.lat]; const radKm=Math.min(90,minutes*1.4); const buf=radKm/111;
      const bb=(A[1]-buf).toFixed(4)+','+(A[0]-buf/Math.cos(A[1]*Math.PI/180)).toFixed(4)+','+(A[1]+buf).toFixed(4)+','+(A[0]+buf/Math.cos(A[1]*Math.PI/180)).toFixed(4);
      busy=true; try{
        const data=await fetchNet(bb); if(!data){ busy=false; return {ok:false,reason:'overpass'}; }
        const coord={}, ways=[], stns=[];
        data.elements.forEach(el=>{ if(el.type==='node'){ coord[el.id]=[el.lon,el.lat]; const t=el.tags; if(t&&/^(station|halt)$/.test(t.railway||'')){ const nm=t.name||t['name:en']||t['name:ja']; stns.push({ll:[el.lon,el.lat],name:nm||'',id:el.id}); } }
          else if(el.type==='way'&&el.nodes&&el.nodes.length>1){ ways.push(el); } });
        const idx={}, xy=[]; for(const id in coord){ idx[id]=xy.length; xy.push(coord[id]); }
        const N=xy.length; if(N<2){ busy=false; return {ok:false,reason:'no-rail'}; }
        const adj=Array.from({length:N},()=>[]);
        ways.forEach(el=>{ const t=el.tags||{}; const sp=SPD[t.railway]||60;
          for(let i=0;i<el.nodes.length-1;i++){ const a=idx[el.nodes[i]], b=idx[el.nodes[i+1]]; if(a==null||b==null) continue; const mins=_hav(xy[a],xy[b])/sp*60; adj[a].push([b,mins]); adj[b].push([a,mins]); } });
        /* weld near-coincident nodes so separate ways connect (walk-free transfer ≤ small penalty) */
        const CELL=0.03*1.15/111, grid=new Map();
        for(let i=0;i<N;i++){ const k=Math.round(xy[i][0]/CELL)+'_'+Math.round(xy[i][1]/CELL); let a=grid.get(k); if(!a){a=[];grid.set(k,a);} a.push(i); }
        for(let i=0;i<N;i++){ const cx=Math.round(xy[i][0]/CELL), cy=Math.round(xy[i][1]/CELL);
          for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){ const cell=grid.get((cx+dx)+'_'+(cy+dy)); if(!cell) continue; for(const j of cell){ if(j<=i) continue; const d=_hav(xy[i],xy[j]); if(d<0.03){ const m=d/4*60; adj[i].push([j,m]); adj[j].push([i,m]); } } } }
        /* nearest rail node to origin + walk time to it (4 km/h); budget minus that walk starts Dijkstra */
        let sN=-1,sd=1e18; for(let i=0;i<N;i++){ const d=_hav(xy[i],A); if(d<sd){sd=d;sN=i;} } if(sN<0){ busy=false; return {ok:false,reason:'no-rail'}; }
        const walkToStart=sd/4*60; if(walkToStart>minutes){ busy=false; return {ok:false,reason:'too-far-from-rail'}; }
        const dist=new Float64Array(N).fill(Infinity); dist[sN]=walkToStart;
        const heap=[[walkToStart,sN]]; const up=i=>{ while(i>0){ const p=(i-1)>>1; if(heap[p][0]<=heap[i][0])break; const t=heap[p];heap[p]=heap[i];heap[i]=t; i=p; } };
        const down=()=>{ const top=heap[0],last=heap.pop(); if(heap.length){ heap[0]=last; let i=0; for(;;){ let l=2*i+1,r=2*i+2,m=i; if(l<heap.length&&heap[l][0]<heap[m][0])m=l; if(r<heap.length&&heap[r][0]<heap[m][0])m=r; if(m===i)break; const t=heap[m];heap[m]=heap[i];heap[i]=t; i=m; } } return top; };
        let guard=0; while(heap.length&&guard++<8000000){ const t=down(); const d=t[0],u=t[1]; if(d>dist[u]) continue; if(d>minutes) continue; const au=adj[u];
          for(let k=0;k<au.length;k++){ const v=au[k][0], nd=d+au[k][1]; if(nd<dist[v]&&nd<=minutes){ dist[v]=nd; heap.push([nd,v]); up(heap.length-1); } } }
        /* reachable stations (nearest graph node within budget) + build the reachable point cloud for the hull */
        const stride=Math.max(1,Math.floor(N/6000)); const reachPts=[]; for(let i=0;i<N;i+=stride){ if(isFinite(dist[i])&&dist[i]<=minutes) reachPts.push({ll:xy[i],t:dist[i]}); }
        const rStns=[]; stns.forEach(st=>{ let bi=-1,bd=1e18; for(let i=0;i<N;i++){ const d=_hav(xy[i],st.ll); if(d<bd){bd=d;bi=i;} } if(bi>=0&&isFinite(dist[bi])&&dist[bi]<=minutes&&bd<0.4){ rStns.push({name:st.name,ll:st.ll,t:dist[bi]}); } });
        busy=false; return { ok:true, minutes, origin:A, walkToStart, reachPts, stations:rStns, nodesReached:reachPts.length };
      }catch(err){ busy=false; return {ok:false,reason:'error'}; } }
    function colFor(t,minutes){ const f=t/minutes; return f<0.33?'#12a150':f<0.66?'#e8a70a':'#e8500a'; }
    function draw(r){ ensure(); const feats=[];
      /* reachable-area hull: buffer the reachable node cloud by the leftover-walk radius, via turf if present */
      try{ if(typeof turf!=='undefined'&&r.reachPts.length>=3){ const pts=turf.featureCollection(r.reachPts.map(p=>turf.point(p.ll)));
        let hull=turf.convex(pts); if(hull){ try{ hull=turf.buffer(hull,Math.min(3,(r.minutes*0.02)),{units:'kilometers'}); }catch(_){} feats.push({type:'Feature',geometry:hull.geometry,properties:{}}); } } }catch(_){}
      r.stations.forEach(s=>feats.push({type:'Feature',geometry:{type:'Point',coordinates:s.ll},properties:{col:colFor(s.t,r.minutes),k:'stn',name:s.name,t:Math.round(s.t)}}));
      feats.push({type:'Feature',geometry:{type:'Point',coordinates:r.origin},properties:{col:'#ff3b30',k:'origin'}});
      try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); }catch(_){}
      try{ let a=180,b=90,c=-180,d=-90; r.stations.concat([{ll:r.origin}]).forEach(s=>{ a=Math.min(a,s.ll[0]);b=Math.min(b,s.ll[1]);c=Math.max(c,s.ll[0]);d=Math.max(d,s.ll[1]); }); if(isFinite(a)&&c>a) GE().camera.fitBounds([[a,b],[c,d]],{padding:70,maxZoom:12,duration:900}); }catch(_){} }
    async function open(from,minutes){ ensure();
      try{ if(window.satToast) satToast(HOST.lang==='jp'?'鉄道到達圏を計算中…':'Computing rail reach…'); }catch(_){}
      const r=await run(from,minutes);
      /* (#R209) the reachable-area hull needs turf's convex+buffer, which are not in the boot bundle
         (see src/vendor.js). Wait for them HERE rather than letting draw() find them missing. */
      try{ await window.turf.ensureHeavy(); }catch(_){}
      if(r&&r.ok){ draw(r); } return r; }
    return { run, open, draw, clear:()=>{ try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} } }; })();
};

window.IntMapModules.disaster=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const makeDraggable=HOST.makeDraggable;
  window.IntMapDisaster=(function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { open(){}, run(){}, clear(){} };
    const SRC='imdis-src'; let panel=null, origin=null, hazard='flood', busy=false, tstep=3, picking=false, pickH=null;
    const DZ=window.IntMapLang.pick(()=>HOST.lang);
    const _hav=(a,b)=>{ const R=6371,dLat=(b[1]-a[1])*Math.PI/180,dLng=(b[0]-a[0])*Math.PI/180,la1=a[1]*Math.PI/180,la2=b[1]*Math.PI/180; const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.min(1,Math.sqrt(h))); };
    function ensure(){ try{ if(GE().layers.hasSource(SRC)) return true; if(!_imCanDraw()) return false;
      GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      GE().layers.add({id:'imdis-fill',type:'fill',source:SRC,filter:['==','$type','Polygon'],paint:{'fill-color':['coalesce',['get','col'],'#1e6fd0'],'fill-opacity':['coalesce',['get','op'],0.45]}});
      GE().layers.add({id:'imdis-line',type:'line',source:SRC,filter:['all',['==',['geometry-type'],'Polygon'],['==',['get','edge'],1]],paint:{'line-color':'#0b3d91','line-width':1.2}});
      GE().layers.add({id:'imdis-pt',type:'circle',source:SRC,filter:['==','$type','Point'],paint:{'circle-radius':6,'circle-color':'#ff3b30','circle-stroke-color':'#fff','circle-stroke-width':2.5}});
      return true; }catch(_){ return false; } }
    /* connected inundation (bathtub flood-fill) over the real DEM: flood cells reachable from the origin whose
       ground is below the water surface — a uniform level that rises with the time step.
       ⚠ (#R197) THERE IS NO TSUNAMI HAZARD HERE ANY MORE. 「災害シミュレータからは津波シミュレータを削除しろ」.
       #R190 had put one in — the same flood-fill with the level set to a wave height and an attenuation of
       0.35 m/km inland — and #R192 then wrote the real thing (js/tsunami.js: shallow-water propagation over
       the whole sea floor). Two models for one phenomenon, one of them a bathtub, and the seismic panel and
       Atlas could both land on the bathtub. The bathtub is gone; the propagation model is the tsunami. */
    async function inund(){ const bufKm=14, buf=bufKm/111;
      const z=Math.max(6,Math.min(12,Math.round(13-Math.log2(bufKm)))); const bbox=[origin.lng-buf/Math.cos(origin.lat*Math.PI/180),origin.lat-buf,origin.lng+buf/Math.cos(origin.lat*Math.PI/180),origin.lat+buf];
      const samp=await window.IntMapTerrain.sampler(bbox,z); if(!samp) return null;
      const N=100, w0=bbox[0], s0=bbox[1], dLng=(bbox[2]-bbox[0])/N, dLat=(bbox[3]-bbox[1])/N;
      const E=new Float32Array(N*N); for(let j=0;j<N;j++)for(let i=0;i<N;i++){ const e=samp.elevAt(w0+(i+0.5)*dLng,s0+(j+0.5)*dLat); E[j*N+i]=(e==null?9999:e); }
      const g0=samp.elevAt(origin.lng,origin.lat); if(g0==null) return null;
      const level = g0 + floodM*(tstep/6);                          /* flood level rises over the step */
      const ci=Math.min(N-1,Math.max(0,Math.round((origin.lng-w0)/dLng-0.5))), cj=Math.min(N-1,Math.max(0,Math.round((origin.lat-s0)/dLat-0.5)));
      const fl=new Uint8Array(N*N), dep=new Float32Array(N*N); const q=[cj*N+ci]; fl[cj*N+ci]=1; let head=0;
      const lvlAt=()=>level;
      const SEA=-1;   /* elevations below this are existing ocean (terrarium bathymetry) — traversed for connectivity but never counted as "inundated land" */
      dep[cj*N+ci]=Math.max(0,lvlAt(ci,cj)-E[cj*N+ci]);
      while(head<q.length){ const cell=q[head++]; const i=cell%N, j=(cell/N)|0;
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(d=>{ const ni=i+d[0], nj=j+d[1]; if(ni<0||nj<0||ni>=N||nj>=N) return; const nc=nj*N+ni; if(fl[nc]) return; const lv=lvlAt(ni,nj); if(lv<0) return; const e=E[nc]; if(e<lv&&e<9000){ fl[nc]=1; dep[nc]=Math.max(0,lv-e); q.push(nc); } }); }
      const cap=floodM*(tstep/6)+0.5;   /* newly-inundated LAND can only be as deep as the water rise; deeper cells were already below the water body (guards a source dropped on high ground) */
      const feats=[]; let cells=0, maxDep=0; for(let j=0;j<N;j++)for(let i=0;i<N;i++){ const c=j*N+i; if(!fl[c]||dep[c]<=0.05||dep[c]>cap||E[c]<SEA) continue; cells++; if(dep[c]>maxDep)maxDep=dep[c];
        const dd=dep[c], col=dd<1?'#7ec8ff':dd<3?'#3a9bef':dd<6?'#1e6fd0':dd<12?'#12459e':'#0b2f6e';
        feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[[w0+i*dLng,s0+j*dLat],[w0+(i+1)*dLng,s0+j*dLat],[w0+(i+1)*dLng,s0+(j+1)*dLat],[w0+i*dLng,s0+(j+1)*dLat],[w0+i*dLng,s0+j*dLat]]]},properties:{col:col,op:0.5}}); }
      const cellKm2=(dLng*111.32*Math.cos(origin.lat*Math.PI/180))*(dLat*110.54);
      return { feats, areaKm2:Math.round(cells*cellKm2), maxDep:+maxDep.toFixed(1), level:+(floodM*(tstep/6)).toFixed(1) }; }
    /* wind-advected downwind plume (ashfall / smoke): a widening cone from the source along the wind, banded by
       concentration; reach grows with the time step. Uses live Open-Meteo surface wind at the source. */
    let _wind=null, _windKey='';
    async function getWind(){ const key=origin.lng.toFixed(2)+','+origin.lat.toFixed(2); if(key===_windKey&&_wind) return _wind; _windKey=key;
      try{ const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+origin.lat.toFixed(3)+'&longitude='+origin.lng.toFixed(3)+'&current=wind_speed_10m,wind_direction_10m'); const j=await r.json(); const c=j.current||{}; _wind={spd:+c.wind_speed_10m||12,dir:+c.wind_direction_10m||270}; }catch(_){ _wind={spd:12,dir:270}; }
      return _wind; }
    function dest(lng,lat,brgDeg,dkm){ const dr=dkm/6371, br=brgDeg*Math.PI/180, la=lat*Math.PI/180, lo=lng*Math.PI/180; const la2=Math.asin(Math.sin(la)*Math.cos(dr)+Math.cos(la)*Math.sin(dr)*Math.cos(br)); const lo2=lo+Math.atan2(Math.sin(br)*Math.sin(dr)*Math.cos(la),Math.cos(dr)-Math.sin(la)*Math.sin(la2)); return [lo2*180/Math.PI,la2*180/Math.PI]; }
    async function plume(){ const w=await getWind(); const toward=(w.dir+180)%360;   /* wind blows FROM dir → plume goes toward dir+180 */
      const isAsh=hazard==='ash'; const reach=Math.min(isAsh?300:120, w.spd*3.6*tstep*(isAsh?1.1:0.9));   /* km downwind over the step */
      const half=(isAsh?9:14)*Math.PI/180;   /* half-angle of the dispersion cone */
      const bands=[[1,isAsh?'#6b4b2a':'#555',0.5],[0.6,isAsh?'#a07845':'#888',0.4],[0.32,isAsh?'#cbb089':'#bbb',0.3]]; const feats=[];
      bands.forEach(bd=>{ const rr=reach*bd[0]; const ring=[[origin.lng,origin.lat]]; const steps=26;
        for(let k=0;k<=steps;k++){ const t=k/steps; const ang=toward-half*180/Math.PI+(2*half*180/Math.PI)*t; const wobble=0.15+0.85*Math.sin(Math.PI*t); ring.push(dest(origin.lng,origin.lat,ang,rr*(0.6+0.4*wobble))); }
        ring.push([origin.lng,origin.lat]); feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{col:bd[1],op:bd[2]}}); });
      return { feats, reach:Math.round(reach), windSpd:w.spd, toward }; }
    async function run(){ if(!origin||busy) return; busy=true; try{ ensure(); setStat(DZ('Computing…','計算中…','Berechne…','Расчёт…','Calculando…'));
      /* (#R224) Atlas is on demand — fetch it before dispatching, or this quietly did nothing */
      if(hazard==='radiation'){ try{ if(window.IntMapAtlas) await window.IntMapAtlas.call('dispatch',{type:'radiation',place:(origin.name||(origin.lat.toFixed(3)+','+origin.lng.toFixed(3)))}); else if(window.IntMapConsole&&window.IntMapConsole.dispatch) await window.IntMapConsole.dispatch({type:'radiation',place:(origin.name||(origin.lat.toFixed(3)+','+origin.lng.toFixed(3)))}); }catch(_){} setStat(DZ('Opened the radioactive-fallout model.','放射性物質の拡散モデルを起動しました。','Fallout-Modell geöffnet.','Модель радиации открыта.','Modelo de lluvia radiactiva.')); busy=false; return; }
      let r=null; if(hazard==='flood') r=await inund(); else r=await plume();
      if(r){ const feats=(r.feats||[]).concat([{type:'Feature',geometry:{type:'Point',coordinates:[origin.lng,origin.lat]},properties:{}}]);
        try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); }catch(_){}
        if(hazard==='flood') setStat('<b>'+DZ('Inundated area','浸水域','Überflutet','Затоплено','Inundado')+':</b> ~'+r.areaKm2.toLocaleString()+' km² · '+DZ('max depth','最大水深','max. Tiefe','глубина','profundidad')+' '+r.maxDep+' m · '+DZ('water','水位','Wasser','вода','agua')+' +'+r.level+' m');
        else setStat('<b>'+DZ('Plume reach','到達距離','Reichweite','дальность','alcance')+':</b> ~'+r.reach+' km '+DZ('downwind','風下','abwind','по ветру','a favor')+' · '+DZ('wind','風速','Wind','ветер','viento')+' '+r.windSpd.toFixed(1)+' m/s');
      } else setStat(DZ('No terrain/wind data here.','この地点のデータがありません。','Keine Daten.','Нет данных.','Sin datos.'));
    }catch(_){ setStat(DZ('Simulation failed — try again.','計算に失敗しました。','Fehlgeschlagen.','Ошибка.','Falló.')); } busy=false; }
    function setStat(h){ if(panel){ const s=panel.querySelector('.dz-stat'); if(s) s.innerHTML=h; } }
    let floodM=5;
    function _endPick(){ picking=false; try{ if(pickH) GE().events.off('click',pickH); }catch(_){} pickH=null;
      try{ const P=window.IntMapPick; if(P&&P.active()) P.abort(); }catch(_){}
      try{ GE().render.canvas().style.cursor=''; }catch(_){} }
    /* (#R196) the panel steps aside while the map is being tapped — see js/map-pick.js */
    function startPick(){ _endPick(); picking=true;
      const P=window.IntMapPick;
      if(P&&P.start&&P.start({ panel,
        hint:DZ('Tap the map to place the source.','地図をタップして発生地点を置いてください。','Zum Setzen der Quelle auf die Karte tippen.','Нажмите на карту, чтобы указать источник.','Toca el mapa para colocar el origen.'),
        onPick:(ll)=>{ picking=false; origin={lng:ll.lng,lat:ll.lat}; run(); },
        onCancel:()=>{ picking=false; } })) return;
      try{ GE().render.canvas().style.cursor='crosshair'; }catch(_){} pickH=e=>{ origin={lng:e.lngLat.lng,lat:e.lngLat.lat}; _endPick(); run(); }; try{ GE().events.once('click',pickH); }catch(_){} }
    /* (#R197) NO TSUNAMI. The tsunami is js/tsunami.js — the propagation model — and it is not opened
       from here, nor is one launched behind the user's back by anything that lands in this panel. */
    const HAZ=()=>[['flood','🌊 '+DZ('Flood','洪水','Hochwasser','Наводнение','Inundación')],['ash','🌋 '+DZ('Ashfall','火山灰','Aschefall','Пепел','Ceniza')],['smoke','💨 '+DZ('Smoke','煙','Rauch','Дым','Humo')],['radiation','☢ '+DZ('Radioactive','放射性物質','Radioaktiv','Радиация','Radiactivo')]];
    function ensurePanel(){ if(panel) return panel; panel=document.createElement('div'); panel.id='dz-panel';
      panel.style.cssText='position:fixed;left:16px;top:80px;width:min(330px,92vw);z-index:1402;display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
      panel.innerHTML='<div class="dz-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;"><span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">🌐 '+DZ('Disaster simulator','災害シミュレーター','Katastrophen-Simulator','Симулятор ЧС','Simulador de desastres')+'</span><button class="dz-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>'
        +'<div style="padding:10px 12px;display:flex;flex-direction:column;gap:9px;">'
        +'<div class="dz-haz" style="display:flex;flex-wrap:wrap;gap:5px;">'+HAZ().map(h=>'<button class="dz-hz" data-h="'+h[0]+'" style="flex:1 1 auto;padding:5px 7px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:11px;cursor:pointer;white-space:nowrap;">'+h[1]+'</button>').join('')+'</div>'
        +'<div class="dz-param"></div>'
        +'<button class="dz-pick" style="height:34px;border:none;border-radius:9px;background:var(--primary-color);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;">◎ '+DZ('Place source on map','発生地点を設置','Quelle setzen','Разместить','Colocar origen')+'</button>'
        +'<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:10.5px;color:var(--text-muted);white-space:nowrap;">'+DZ('Time','経過時間','Zeit','Время','Tiempo')+'</span><input type="range" class="dz-t" min="1" max="12" value="3" style="flex:1;"><span class="dz-tv" style="font-size:11px;font-weight:700;color:var(--text-main);min-width:36px;text-align:right;">3 h</span></div>'
        +'<div class="dz-stat" style="font-size:11.5px;color:var(--text-main);min-height:16px;"></div>'
        +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'+DZ('Educational approximation only — in a real emergency follow official authorities. Flood = connected inundation from the real elevation model; ash/smoke = wind-advected plume on live wind; radioactive = the Lagrangian fallout model. Tsunamis are modeled separately, by the propagation simulator.','教育目的の近似です。実際の災害時は公的機関の指示に従ってください。洪水＝実標高データからの連結浸水、火山灰・煙＝実風のプルーム、放射性物質＝ラグランジュ拡散モデル。津波は別の伝播シミュレーターで扱います。','Nur Bildungsnäherung. Tsunamis: eigener Ausbreitungssimulator.','Только образовательная модель. Цунами — отдельный симулятор.','Solo aproximación educativa. Los tsunamis tienen su propio simulador.')+'</div></div>';
      document.body.appendChild(panel);
      panel.querySelector('.dz-close').onclick=()=>close();
      panel.querySelector('.dz-pick').onclick=()=>startPick();
      panel.querySelectorAll('.dz-hz').forEach(b=>b.onclick=()=>{ hazard=b.getAttribute('data-h'); syncHaz(); renderParam(); if(origin) run(); });
      const tl=panel.querySelector('.dz-t'); tl.oninput=()=>{ tstep=+tl.value; panel.querySelector('.dz-tv').textContent=tstep+' h'; if(origin){ clearTimeout(panel._t); panel._t=setTimeout(run,150); } };
      try{ if(typeof makeDraggable==='function') makeDraggable(panel,panel.querySelector('.dz-head')); }catch(_){}
      syncHaz(); renderParam(); return panel; }
    function syncHaz(){ if(!panel) return; panel.querySelectorAll('.dz-hz').forEach(b=>{ const on=b.getAttribute('data-h')===hazard; b.style.background=on?'var(--primary-color)':'var(--input-bg)'; b.style.color=on?'#fff':'var(--text-main)'; }); }
    function renderParam(){ if(!panel) return; const p=panel.querySelector('.dz-param'); if(!p) return; const inC='width:100%;box-sizing:border-box;height:28px;border-radius:7px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;padding:0 7px;';
      if(hazard==='flood'){ p.innerHTML='<label style="font-size:10.5px;color:var(--text-muted);">'+DZ('Peak water rise (m)','最大水位上昇 (m)','Pegelanstieg (m)','Подъём воды (м)','Subida (m)')+'<input type="number" class="dz-fm" min="1" max="60" value="'+floodM+'" style="'+inC+'"></label>'; const el=p.querySelector('.dz-fm'); el.onchange=()=>{ floodM=Math.max(1,+el.value||5); if(origin) run(); }; }
      else if(hazard==='radiation'){ p.innerHTML='<div style="font-size:11px;color:var(--text-muted);">'+DZ('Opens the full radioactive-fallout model (source term, isotope, wind).','放出量・核種・風を扱う放射性物質拡散モデルを開きます。','Öffnet das Fallout-Modell.','Открывает модель радиации.','Abre el modelo de lluvia radiactiva.')+'</div>'; }
      else p.innerHTML='<div style="font-size:11px;color:var(--text-muted);">'+DZ('Plume follows the live wind at the source; the time slider extends it downwind.','プルームは発生地点の実風に沿い、時間スライダーで風下へ伸びます。','Fahne folgt dem Live-Wind.','След по ветру.','La pluma sigue el viento real.')+'</div>'; }
    /* (#R190) `hazard` and the hazard's own parameter may arrive WITH the location, so a caller can say
       "this hazard, this place, this parameter" in one call rather than running the model once under the
       previous hazard first. Every other caller passes {lng,lat} only and behaves exactly as before.
       ⚠ (#R197) `hazard:'tsunami'` is no longer one of HAZ(), so it no longer selects anything here —
       the test below is the same membership test it always was, and it now REFUSES the removed hazard
       rather than mapping it to a neighbour. */
    function open(ll){ ensure(); ensurePanel(); panel.style.display='flex';
      if(ll&&ll.hazard&&HAZ().some(h=>h[0]===ll.hazard)){ hazard=ll.hazard; try{ syncHaz&&syncHaz(); }catch(_){} }
      if(ll&&ll.floodM!=null&&isFinite(+ll.floodM)) floodM=Math.max(1,Math.min(60,+ll.floodM));
      try{ renderParam&&renderParam(); }catch(_){}
      if(ll&&ll.lng!=null){ origin=ll; run(); } }
    function close(){ if(panel) panel.style.display='none'; _endPick(); try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} }
    return { open, run, clear:close,
      /* (#R197) an unknown hazard is refused rather than stored: `setHazard('tsunami')` used to leave the
         panel in a state no button could show and no parameter belonged to. */
      setHazard:(h)=>{ if(!HAZ().some(k=>k[0]===h)) return false; hazard=h; syncHaz&&syncHaz(); renderParam&&renderParam(); return true; },
      hazards:()=>HAZ().map(h=>h[0]),
      state:()=>({ hazard, floodM, origin:origin?{lng:origin.lng,lat:origin.lat}:null }),   /* (#R190) */
      _inund:async(o,hz,ts,fm)=>{ origin=o; hazard=hz; tstep=ts||3; if(fm)floodM=fm; return await inund(); },
      /* (#R214) 「再読み込みした際に、できる限りその状態に戻ってくるように」 — the hazard, the water
         depth and WHERE it is coming from are the whole question this panel was asked. Registered
         under the lazy-module name so js/map-ui.js can fetch the module back before applying. */
      _share:{ get(){ if(!panel||panel.style.display==='none') return null;
          const o={ hz:hazard, f:floodM }; if(origin&&origin.lng!=null){ o.o=[+(+origin.lng).toFixed(5),+(+origin.lat).toFixed(5)]; } return o; },
        set(v){ if(!v) return; const ll=(Array.isArray(v.o)&&v.o.length===2)?{lng:+v.o[0],lat:+v.o[1]}:{};
          try{ open(Object.assign({hazard:v.hz, floodM:v.f}, ll)); }catch(_){} } } }; })();
  /* (#R214) 「再読み込みした際に、できる限りその状態に戻ってくるようにして。」 — the simulators
     #R211 left unregistered. `_share` is the module's own {get,set}; this is the one line that
     hands it to the registry js/map-ui.js packs into the link's `s=` parameter. ⚠ The KEY is the
     lazy-module name where there is one, because `apply()` fetches by that name at restore. */
  try{ if(window.IntMapDisaster._share){ const _io=window.IntMapDisaster._share;
    if(window.IntMapShareState) window.IntMapShareState.register('disaster',_io);
    else (window._imShareEarly||(window._imShareEarly=[])).push(['disaster',_io]); } }catch(_){}

};

window.IntMapModules.earthReplay=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const makeDraggable=HOST.makeDraggable;
  window.IntMapEarthReplay=(function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { open(){}, close(){}, setWhen(){} };
    const SRC='imrep-src'; const rad=Math.PI/180, J1970=2440588, J2000=2451545, dayMs=86400000, e=rad*23.4397;
    let panel=null, when=new Date(), playing=0;
    const ER=window.IntMapLang.pick(()=>HOST.lang);
    const toDays=d=>d.valueOf()/dayMs-0.5+J1970-J2000;
    function solar(date){ const d=toDays(date); const M=rad*(357.5291+0.98560028*d), C=rad*(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M)), L=M+C+rad*102.9372+Math.PI;
      const dec=Math.asin(Math.sin(e)*Math.sin(L)), ra=Math.atan2(Math.sin(L)*Math.cos(e),Math.cos(L)); return { d, dec, ra }; }
    /* day/night terminator polygon for the datetime: terminator latitude at each longitude is atan(−cos H / tan dec),
       and the ring is closed over whichever pole is in polar night (the winter pole). */
    function terminatorFC(date){ const {d,dec,ra}=solar(date); if(Math.abs(dec)<1e-4) return null;
      const pts=[]; for(let lng=-180;lng<=180;lng+=3){ const th=rad*(280.16+360.9856235*d)+rad*lng; const H=th-ra; let lat=Math.atan(-Math.cos(H)/Math.tan(dec))/rad; lat=Math.max(-89.5,Math.min(89.5,lat)); pts.push([lng,lat]); }
      const darkPole=dec>0?-90:90;   /* dec>0 = N summer → S pole dark */
      const ring=pts.concat([[180,darkPole],[-180,darkPole],[pts[0][0],pts[0][1]]]);
      return { type:'Feature', geometry:{type:'Polygon',coordinates:[ring]}, properties:{} }; }
    function ensure(){ try{ if(GE().layers.hasSource(SRC)) return true; if(!_imCanDraw()) return false;
      GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      GE().layers.add({id:'imrep-night',type:'fill',source:SRC,paint:{'fill-color':'#04070f','fill-opacity':0.42}});
      return true; }catch(_){ return false; } }
    function ymd(d){ try{ return d.toISOString().slice(0,10); }catch(_){ return ''; } }
    function drawTerminator(){ try{ ensure(); const t=terminatorFC(when); GE().layers.setSourceData(SRC,t?{type:'FeatureCollection',features:[t]}:{type:'FeatureCollection',features:[]}); }catch(_){} }
    /* (#R94) Earth Replay is now a SHELL on the IntMapTime kernel: it draws the day/night terminator for the
       shared instant and plays it forward, while the kernel itself drives news / imagery / quakes / dated
       rasters / countries / borders. apply() therefore only paints the terminator + read-out. */
    function apply(){ drawTerminator(); updateReadout(); }
    function updateReadout(){ if(!panel) return; const r=panel.querySelector('.er-read'); if(!r) return; const now=new Date(), yrsBack=(now-when)/(365.25*dayMs);
      const S=solar(when); const dpole=S.dec>0?ER('S pole in polar night','南極は極夜','Südpol Polarnacht','Ю. полюс — полярная ночь','Polo sur noche polar'):ER('N pole in polar night','北極は極夜','Nordpol Polarnacht','С. полюс — полярная ночь','Polo norte noche polar');
      let scope; if(when>now) scope=ER('future — terminator only','未来 — 昼夜のみ','Zukunft','будущее','futuro'); else if(yrsBack<=10) scope=ER('news · imagery · quakes time-traveled to this date','ニュース・衛星画像・地震をこの日付へ','News/Bilder/Beben zeitversetzt','новости/снимки/толчки','noticias/imágenes/sismos');
        else scope=ER('pre-archive date — day/night terminator + any historical layers','アーカイブ以前 — 昼夜境界＋歴史レイヤー','vor Archiv','до архива','antes del archivo');
      r.innerHTML='<b>🌍 '+ymd(when)+' '+String(when.getUTCHours()).padStart(2,'0')+':'+String(when.getUTCMinutes()).padStart(2,'0')+' UTC</b><div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;">☀️ '+ER('sub-solar lat','太陽直下点緯度','subsolar','подсолнечная','subsolar')+' '+(S.dec/rad).toFixed(1)+'° · '+dpole+'</div><div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">'+scope+'</div>'; }
    /* setWhen now WRITES the shared kernel (allowFuture: the terminator is valid for any date, incl. the
       future); the kernel's broadcast calls our subscriber below, which mirrors `when` and repaints. */
    function setWhen(d){ const nd=(d instanceof Date&&!isNaN(d))?d:new Date();
      try{ if(window.IntMapTime) return window.IntMapTime.set(nd,{allowFuture:true,source:'earthreplay'}); }catch(_){}
      when=nd; syncInputs(); apply(); }
    function syncInputs(){ if(!panel) return; const di=panel.querySelector('.er-date'), yl=panel.querySelector('.er-year'), tl=panel.querySelector('.er-time'), tv=panel.querySelector('.er-tv');
      try{ if(di) di.value=ymd(when); }catch(_){} if(yl) yl.value=when.getUTCFullYear(); const mins=when.getUTCHours()*60+when.getUTCMinutes(); if(tl) tl.value=mins; if(tv) tv.textContent=String(when.getUTCHours()).padStart(2,'0')+':'+String(when.getUTCMinutes()).padStart(2,'0')+'Z'; }
    function ensurePanel(){ if(panel) return panel; panel=document.createElement('div'); panel.id='er-panel';
      panel.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:96px;width:min(440px,94vw);z-index:1402;display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.5);';
      panel.innerHTML='<div class="er-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;"><span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">⏳ '+ER('Earth Replay','アース・リプレイ（世界を巻き戻す）','Earth Replay','Реплей Земли','Earth Replay')+'</span><button class="er-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>'
        +'<div style="padding:10px 12px;display:flex;flex-direction:column;gap:9px;">'
        +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
          +'<input type="date" class="er-date" style="height:30px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;padding:0 6px;">'
          +'<input type="number" class="er-year" min="1800" max="2100" style="width:74px;height:30px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;padding:0 6px;">'
          +'<button class="er-now" style="height:30px;padding:0 10px;border:none;border-radius:8px;background:var(--input-bg);color:var(--text-main);font-size:11px;cursor:pointer;">'+ER('Now','現在','Jetzt','Сейчас','Ahora')+'</button>'
          +'<button class="er-play" style="height:30px;width:36px;border:none;border-radius:8px;background:var(--primary-color);color:#fff;font-size:13px;cursor:pointer;">▶</button></div>'
        +'<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:10px;color:var(--text-muted);">UTC</span><input type="range" class="er-time" min="0" max="1439" value="720" style="flex:1;"><span class="er-tv" style="font-size:11px;font-weight:700;color:var(--text-main);min-width:52px;text-align:right;">12:00Z</span></div>'
        +'<div class="er-read" style="font-size:12px;color:var(--text-main);"></div>'
        +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'+ER('One clock for the whole globe: the day/night terminator is computed for any date; within ~10 years the news, satellite imagery and earthquakes time-travel to the date, and any dated weather/air layers reload for it. Turn on the layers you want to replay.','地球全体を1つの時計で再生：昼夜境界はどの日付でも計算し、約10年以内ならニュース・衛星画像・地震がその日付へ移動、日付付きの気象・大気レイヤーも再読込します。再生したいレイヤーをオンにしてください。','Eine Uhr für die ganze Erde.','Одни часы для всей планеты.','Un reloj para todo el globo.')+'</div></div>';
      document.body.appendChild(panel);
      panel.querySelector('.er-close').onclick=()=>close();
      panel.querySelector('.er-now').onclick=()=>{ try{ if(window.IntMapTime) return window.IntMapTime.setNow({source:'earthreplay'}); }catch(_){} setWhen(new Date()); };
      panel.querySelector('.er-date').onchange=e=>{ const p=(e.target.value||'').split('-'); if(p.length===3){ const nd=new Date(when); nd.setUTCFullYear(+p[0],+p[1]-1,+p[2]); setWhen(nd); } };
      panel.querySelector('.er-year').onchange=e=>{ const y=+e.target.value; if(y>=1800&&y<=2100){ const nd=new Date(when); nd.setUTCFullYear(y); setWhen(nd); } };
      panel.querySelector('.er-time').oninput=e=>{ const m=+e.target.value; const nd=new Date(when); nd.setUTCHours(Math.floor(m/60),m%60,0,0); when=nd; syncInputs(); clearTimeout(panel._t); panel._t=setTimeout(()=>{ try{ if(window.IntMapTime) window.IntMapTime.set(nd,{allowFuture:true,source:'earthreplay'}); else apply(); }catch(_){ apply(); } },140); };
      const pb=panel.querySelector('.er-play'); pb.onclick=()=>{ if(playing){ clearInterval(playing); playing=0; pb.textContent='▶'; } else { pb.textContent='⏸'; playing=setInterval(()=>{ setWhen(new Date(when.getTime()+3*3600000)); },900); } };   /* +3 h per tick */
      try{ if(typeof makeDraggable==='function') makeDraggable(panel,panel.querySelector('.er-head')); }catch(_){}
      return panel; }
    GE().events.on('styledata',()=>{ if(panel&&panel.style.display!=='none') setTimeout(drawTerminator,90); });
    /* (#R94) mirror the shared kernel: any time change (this panel, the main slider, or Atlas) redraws the
       terminator + read-out while the panel is open. */
    try{ if(window.IntMapTime) window.IntMapTime.on(e=>{ when=e.when; syncInputs(); if(panel&&panel.style.display!=='none'){ drawTerminator(); updateReadout(); } }); }catch(_){}
    function open(){ ensure(); ensurePanel(); try{ if(window.IntMapTime) when=window.IntMapTime.when(); }catch(_){} panel.style.display='flex'; syncInputs(); apply(); }
    function close(){ if(panel) panel.style.display='none'; if(playing){ clearInterval(playing); playing=0; const pb=panel&&panel.querySelector('.er-play'); if(pb) pb.textContent='▶'; } try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} }
    return { open, close, setWhen, _terminatorFC:terminatorFC, _solar:solar }; })();
};
