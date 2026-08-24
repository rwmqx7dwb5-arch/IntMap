/* ============================================================================
 *  IntMap · Physical simulations & solar geometry — IntMapModules.{radiation,popArea,slope,sun,transitReach}  (#R166 / #R296)
 * ----------------------------------------------------------------------------
 *  Simulations computed from real data on the client: population inside a drawn area, DEM
 *  slope/aspect, the solar terminator, transit reachability and the radioactive-plume model.
 *  ⚠ (#R296) three of the eight left this file with their features — see the notes where each stood.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R166): each body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang
 *
 *  Every factory is called at the exact spot its block used to occupy, so execution order is
 *  unchanged. The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
/* (#R408) the program's one timer wheel (js/runtime.js), not a private timer of this file's own. */
import { everyTick, stopTick } from './runtime.js';
window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.radiation=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  window.IntMapRadiation=(function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { run(){ return Promise.resolve({ok:false}); }, clear(){}, openPanel(){}, closePanel(){}, isOpen(){ return false; }, ISOTOPES:{}, SOURCES:{} };
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
    const LA=window.IntMapLang.pickArgs();   /* (#R241) see `pickArgs` in js/lang-registry.js */
    const ZONES=[ {min:1480,c:'#8a0f0f',n:LA('Exclusion — permanent resettlement','立入禁止（強制移住）','Sperrzone','Зона отчуждения','Exclusión'),mSv:'>5'},
      {min:555,c:'#ff453a',n:LA('Mandatory evacuation','義務的避難','Zwangsumsiedlung','Обязательное отселение','Evacuación obligatoria'),mSv:'1–5'},
      {min:185,c:'#ff9f0a',n:LA('Relocation right / monitoring','移住権・要監視','Umsiedlungsrecht','Право на отселение','Reubicación'),mSv:'0.5–1'},
      {min:37,c:'#ffd60a',n:LA('Enhanced monitoring','要観察','Verstärkte Überwachung','Усиленный контроль','Vigilancia'),mSv:'0.1–0.5'},
      {min:2,c:'#b7f7b0',n:LA('Trace deposition','微量沈着','Spuren','Следы','Trazas'),mSv:'<0.1'} ];
    async function fetchJSON(url){
      /* (#R276) An Open-Meteo URL goes through the app's ONE guarded client — cache, request
         coalescing and the daily-quota circuit breaker (js/wx-source.js). A proxy ladder in front of
         a 429 is not a retry, it is the same exhausted quota asked three more times through three
         more hops, which is what kept it at zero all day (#R183). */
      try{ if(window.IntMapWx&&window.IntMapWx.isOpenMeteo(url)) return await window.IntMapWx.guardedJSON(url,300000); }catch(_){}
      const PROX=[x=>x, x=>'https://corsproxy.io/?url='+encodeURIComponent(x), x=>'https://api.allorigins.win/raw?url='+encodeURIComponent(x)];
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
      /* (#R408) the generation is IN THE KEY: one Map holds every timer and a second `everyTick`
         on the same key replaces the first, so a superseded run's stop must not be able to reach
         into the run that replaced it. */
      if(!paint()){ let n=0; const t=everyTick('sims:radiation-paint:'+myGen,250,()=>{ if(myGen!==_gen||paint()||n++>56){ stopTick(t); } }); try{ GE().events.once('idle',paint); }catch(_){} }
      return {ok:true,reachKm:estReach,windSpeed:spd,windToward:toward,wet,hours,emitHours,bq,iso:iso.n,halfLifeHours,
        zoneKm2:dz.zoneKm2,peakKBqM2:dz.peak,peakDoseUSvH:dz.peakDoseUSvH,peakLL:dz.peakLL,startISO:F.startISO,zones:ZONES}; }
    try{ GE().events.on('styledata',()=>{ setTimeout(()=>{ try{ const d=GE().layers.sourceData(SRC); if(d&&d.features&&d.features.length) ensureLayers(); }catch(_){} },160); }); }catch(_){}
    /* ══ ⚠⚠⚠ (#R296) THE PANEL #R264 MEASURED MISSING, BUILT ═══════════════════════════════════════
       #R264 measured that the Tools row for this simulator calls `openPanel()` and that this module
       has never had one — `typeof` it was `undefined`, the call threw, the catch returned false, and
       `IntMapOS.exec('sim.radiation')` measured **false**. It reported that rather than fixing it,
       for a stated reason: picking an isotope and a release rate on the reader's behalf is invented
       data. That reason argues against DEFAULTS THAT RUN, not against a panel — a panel is exactly
       where the reader states them, and nothing here computes until they press 実行.
       ⚠ AND THIS ROUND IT BECAME THE ONLY DOOR. 「災害シミュレーターは4つのうち、放射性物質拡散
       シミュレーションを残し全削除」 removed the wrapper whose fourth choice used to reach this model,
       so a row that has never opened anything would have been the whole feature.
       ⚠ EVERY NUMBER IS THE READER'S: the source term, the isotope, the release duration and the
       window come from the controls, and the presets are the ones this module already publishes
       (`SOURCES`), named as the scales they are. */
    let panel=null, site=null, picking=false, pickH=null;
    let uiSrc='fukushima', uiIso='cs137', uiEmit=8, uiHours=48;
    const _esc=(x)=>String(x==null?'':x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    function _endPick(){ picking=false; try{ if(pickH) GE().events.off('click',pickH); }catch(_){} pickH=null;
      try{ const P=window.IntMapPick; if(P&&P.active()) P.abort(); }catch(_){}
      try{ GE().render.canvas().style.cursor=''; }catch(_){} }
    function startPick(){ _endPick(); picking=true;
      const P=window.IntMapPick;
      const hint=LL('Tap the map to place the release source.','地図をタップして放出源を置いてください。','Zum Setzen der Quelle auf die Karte tippen.','Нажмите на карту, чтобы задать источник.','Toca el mapa para colocar la fuente.');
      if(P&&P.start&&P.start({ panel, hint,
        onPick:(ll)=>{ picking=false; site={lng:ll.lng,lat:ll.lat,name:''}; renderPanel(); },
        onCancel:()=>{ picking=false; renderPanel(); } })) return;
      try{ GE().render.canvas().style.cursor='crosshair'; }catch(_){}
      pickH=e=>{ site={lng:e.lngLat.lng,lat:e.lngLat.lat,name:''}; _endPick(); renderPanel(); };
      try{ GE().events.once('click',pickH); }catch(_){} }
    function ensurePanel(){ if(panel) return panel; panel=document.createElement('div'); panel.id='rad-panel';
      panel.style.cssText='position:fixed;left:16px;top:80px;width:min(316px,92vw);z-index:1402;display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
      (document.getElementById('map-container')||document.body).appendChild(panel);
      return panel; }
    function renderPanel(state){ const p=ensurePanel();
      const IN='width:100%;box-sizing:border-box;height:30px;padding:0 8px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;';
      const LB='font-size:10.5px;color:var(--text-muted);';
      const where=site?((site.name?site.name+' · ':'')+site.lat.toFixed(3)+', '+site.lng.toFixed(3))
        :LL('No source placed yet','放出源が未設定です','Keine Quelle gesetzt','Источник не задан','Sin fuente colocada');
      p.innerHTML='<div class="rad-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;"><span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">☢ '
          +LL('Radioactive dispersion','放射性物質の拡散','Radioaktive Ausbreitung','Рассеивание радиации','Dispersión radiactiva')+'</span><button class="rad-x" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">×</button></div>'
        +'<div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;">'
        +'<button class="rad-pick" style="height:34px;border:none;border-radius:9px;background:var(--primary-color);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;">◎ '
          +LL('Place the source on the map','地図で放出源を設定','Quelle auf der Karte setzen','Задать источник на карте','Colocar la fuente en el mapa')+'</button>'
        +'<div style="font-size:11.5px;color:var(--text-main);">'+_esc(where)+'</div>'
        +'<label style="'+LB+'">'+LL('Source term','放出量','Quellterm','Выброс','Término fuente')+'<select class="rad-src" style="'+IN+'">'
          +Object.keys(SOURCES).map(k=>'<option value="'+k+'"'+(k===uiSrc?' selected':'')+'>'+_esc(SOURCES[k].n)+'</option>').join('')+'</select></label>'
        +'<label style="'+LB+'">'+LL('Isotope','核種','Isotop','Изотоп','Isótopo')+'<select class="rad-iso" style="'+IN+'">'
          +Object.keys(ISOTOPES).map(k=>'<option value="'+k+'"'+(k===uiIso?' selected':'')+'>'+_esc(ISOTOPES[k].n)+'</option>').join('')+'</select></label>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        +'<label style="'+LB+'">'+LL('Release (h)','放出時間 (h)','Freisetzung (h)','Выброс (ч)','Emisión (h)')+'<input class="rad-emit" type="number" min="0.25" max="80" step="0.25" value="'+uiEmit+'" style="'+IN+'"></label>'
        +'<label style="'+LB+'">'+LL('Window (h)','追跡時間 (h)','Zeitfenster (h)','Окно (ч)','Ventana (h)')+'<input class="rad-hours" type="number" min="6" max="80" step="1" value="'+uiHours+'" style="'+IN+'"></label>'
        +'</div>'
        +'<button class="rad-go" style="height:34px;border:none;border-radius:9px;background:'+(site?'var(--primary-color)':'var(--input-bg)')+';color:'+(site?'#fff':'var(--text-muted)')+';font-size:12.5px;font-weight:700;cursor:'+(site?'pointer':'default')+';">'
          +LL('Run the dispersion','拡散を実行','Ausbreitung rechnen','Рассчитать','Ejecutar')+'</button>'
        +'<div class="rad-stat" style="font-size:11.5px;color:var(--text-main);min-height:16px;">'+_esc(state||'')+'</div>'
        +'<button class="rad-clr" style="height:30px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));border-radius:9px;background:var(--input-bg);color:var(--text-muted);font-size:12px;cursor:pointer;">'
          +LL('Clear','消去','Löschen','Очистить','Borrar')+'</button>'
        +'<div style="font-size:10px;color:var(--text-muted);line-height:1.5;">'
          +LL('Lagrangian dispersion over the live wind field, with decay and wet deposition. Educational — in a real emergency follow the official authorities.','実際の風の場でのラグランジュ拡散（減衰・湿性沈着を含む）。教育目的の近似です。実際の災害時は公的機関の指示に従ってください。','Lagrange-Ausbreitung im echten Windfeld. Nur zu Bildungszwecken.','Лагранжева модель в реальном поле ветра. Только для обучения.','Dispersión lagrangiana con viento real. Solo educativo.')+'</div></div>';
      p.querySelector('.rad-x').onclick=()=>closePanel();
      p.querySelector('.rad-pick').onclick=()=>startPick();
      p.querySelector('.rad-src').onchange=(e)=>{ uiSrc=e.target.value; };
      p.querySelector('.rad-iso').onchange=(e)=>{ uiIso=e.target.value; };
      p.querySelector('.rad-emit').onchange=(e)=>{ const v=+e.target.value; if(isFinite(v)) uiEmit=Math.max(0.25,Math.min(80,v)); };
      p.querySelector('.rad-hours').onchange=(e)=>{ const v=+e.target.value; if(isFinite(v)) uiHours=Math.max(6,Math.min(80,v)); };
      p.querySelector('.rad-clr').onclick=()=>{ clear(); renderPanel(''); };
      p.querySelector('.rad-go').onclick=async ()=>{ if(!site) return;
        renderPanel(LL('Computing…','計算中…','Berechne…','Расчёт…','Calculando…'));
        let r=null; try{ r=await run(site,{source:uiSrc,isotope:uiIso,emitHours:uiEmit,hours:uiHours}); }catch(_){ r=null; }
        if(r&&r.ok) renderPanel(LL('Reach','到達','Reichweite','Дальность','Alcance')+' ~'+r.reachKm+' km · '+LL('wind','風','Wind','ветер','viento')+' '+r.windSpeed.toFixed(1)+' m/s');
        else renderPanel(LL('Could not run — the live wind field was unavailable.','実行できませんでした（風のデータを取得できません）。','Nicht möglich — keine Winddaten.','Не удалось — нет данных о ветре.','No se pudo — sin datos de viento.')); };
      try{ if(typeof HOST.makeDraggable==='function') HOST.makeDraggable(p,p.querySelector('.rad-head')); }catch(_){}
      return p; }
    function openPanel(ll){ if(ll&&ll.lng!=null&&isFinite(+ll.lng)) site={lng:+ll.lng,lat:+ll.lat,name:ll.name||''};
      renderPanel(''); ensurePanel().style.display='flex';
      try{ if(typeof HOST.bringToFront==='function') HOST.bringToFront(panel); }catch(_){}
      return true; }
    function closePanel(){ _endPick(); if(panel) panel.style.display='none'; return true; }
    const panelOpen=()=>!!(panel&&panel.style.display!=='none');
    /* ══ (#R264) …AND THE PLUME ON THE MAP IS ALSO STATE ═══════════════════════════════════════════
       Read off the source this module fills, so it cannot disagree with what is drawn. The tools row
       lights when EITHER is true — a panel the reader opened, or a plume Atlas drew without one. */
    const isOpen=()=>{ if(panelOpen()) return true; try{ const d=GE().layers.sourceData(SRC); return !!(d&&d.features&&d.features.length); }catch(_){ return false; } };
    return { run, clear, isOpen, openPanel, closePanel,
      close:()=>{ if(!isOpen()) return false; closePanel(); clear(); return true; }, ISOTOPES, SOURCES, ZONES, resolveSite,
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
    /* ══ ⚠ (#R254) THE WORLDPOP TASK ENDPOINT APPENDS PHP WARNINGS TO ITS JSON ═══════════════════════
       MEASURED this round while checking the tiling change (curl, content-type `application/json`):
           {  "status": "created", … }<br /><b>Warning</b>: Trying to access array offset on value of
           type bool in /srv/www/api.worldpop.org/html/app/TasksController.php on line 40 …
       749 bytes, of which the last ~470 are HTML. `response.json()` throws on that, and the polling
       loop below treats a throw as «transient, poll again» — so a body that DID carry the answer
       would be retried until the deadline and reported as a timeout. Read the text and take the JSON
       object out of it; a body with no object at all still throws, as it should. */
    async function _json(r){ const t=await r.text();
      try{ return JSON.parse(t); }catch(_){}
      const i=t.indexOf('{'), k=t.lastIndexOf('}');
      if(i>=0&&k>i) return JSON.parse(t.slice(i,k+1));
      throw new Error('WorldPop: unparseable response'); }
    /* one WorldPop request for a single (sub-limit) polygon → total_population number. `deadlineMs` bounds the WHOLE
       call (create + polling); each individual fetch aborts well inside it (a ≤90k km² tile normally finishes in
       seconds; a single free-form polygon keeps the full ~2 min). */
    async function _estimateOne(g, deadlineMs){
      const t0=Date.now(), DEADLINE=deadlineMs||125000;
      const fc={type:'FeatureCollection',features:[{type:'Feature',geometry:g,properties:{}}]};
      const u='https://api.worldpop.org/v1/services/stats?dataset=wpgppop&year=2020&geojson='+encodeURIComponent(JSON.stringify(fc));
      const r=await _fetchT(u, Math.min(30000, DEADLINE)); const j=await _json(r);
      if(j&&j.error&&!j.taskid) throw new Error(String(j.error_message||'WorldPop error'));
      let data=j&&j.data&&j.data.total_population!=null?j.data:null;
      if(!data&&j&&j.taskid){
        /* (#R123/#R128) poll with a gentle backoff; each poll fetch is itself abortable so a stalled poll can't hang;
           break IMMEDIATELY on a real task error; ignore a transient hiccup. */
        let iv=1200;
        while(Date.now()-t0<DEADLINE){ await new Promise(rs=>setTimeout(rs,iv)); iv=Math.min(4000,iv+250);
          let j2=null; try{ const r2=await _fetchT('https://api.worldpop.org/v1/tasks/'+encodeURIComponent(j.taskid), 18000); j2=await _json(r2); }catch(_){ continue; }
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
      /* ══ (#R254) EVERY SUM IS TILED, SO EVERY SUM HAS A REAL FRACTION ══════════════════════════
         「勝手にほかの進捗バーと違うUIにするな。」 The bar was the app's only INDETERMINATE one — a
         moving band with no percentage — and it was indeterminate because a sub-cap polygon is ONE
         WorldPop request and one request has no fraction to report. Tiling is what creates the
         fraction: the cell side is now also capped so that the bbox is divided into ABOUT FOUR
         cells even when the whole area would fit in a single request, and `done/cells.length` is
         then a measured quantity for every area, not just continental ones.
         ⚠ For a large area this line changes nothing: `sqrt(area/4)` is far bigger than the
         ≤90,000 km² cell the cap already chose, so the min() keeps the cap's own value.
         ⚠ The cost is stated rather than hidden: a small area now costs ~4 WorldPop requests
         instead of 1, which is the trade the instruction accepted. The pieces PARTITION the
         polygon (turf.bboxClip, disjoint boxes), so the sum is the same quantity as before. */
      { const wSpan=Math.max(1e-9,bb[2]-bb[0]), hSpan=Math.max(1e-9,bb[3]-bb[1]);
        d=Math.min(d, Math.sqrt(wSpan*hSpan/4)); }
      const cells=[];
      for(let x=bb[0]; x<bb[2]-1e-9; x+=d){ for(let y=bb[1]; y<bb[3]-1e-9; y+=d){
        const box=[x,y,Math.min(x+d,bb[2]),Math.min(y+d,bb[3])]; let piece=null; try{ piece=turf.bboxClip(feat,box); }catch(_){}
        const gm=piece&&piece.geometry; if(!gm||!gm.coordinates||!gm.coordinates.length) continue;
        /* (#R128) skip a degenerate clip-sliver (< 0.05 km²) — for a jagged coastline the bbox spawns many near-zero
           edge tiles that hold ~0 people yet each cost a full (slow) request; dropping only numerical noise cuts the
           request count sharply for irregular shapes without measurably affecting the sum.
           ⚠ (#R254) …AND «NOISE» IS RELATIVE TO THE SHAPE. Now that every area is tiled, a genuinely small
           selection (a 150 m radius circle is 0.07 km²) reaches this line, and an absolute 0.05 km² floor would
           discard the ONLY cell it has and throw «empty area». The floor applies to shapes big enough for it to
           mean «sliver»; below that, every piece is kept. */
        try{ if(areaKm2>1 && (turf.area(piece)/1e6)<0.05) continue; }catch(_){}
        if((gm.type==='Polygon'&&gm.coordinates[0]&&gm.coordinates[0].length>=4)||(gm.type==='MultiPolygon'&&gm.coordinates.length)){ const pg=_prep(gm); if(pg) cells.push(pg); } } }
      /* (#R254) a clip that produced nothing usable is not a reason to refuse the question — fall back to the
         polygon itself as a single cell (which is exactly what this function replaced). */
      if(!cells.length){ const pg=_prep(g); if(pg) cells.push(pg); }
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
      /* ⚠ (#R254) THE PROVENANCE LINE NAMES THE DATA, NOT THE TRANSPORT. Every sum is tiled now, so
         «4 tiles» would be printed beside every answer the app has ever given — a number about HTTP,
         in the slot that says where the population figure came from. It stays what it was; the tile
         count is still reported when it changes the ANSWER (a partial sum, below) and on the object. */
      const out={ pop:Math.round(total), year:2020, src:'WorldPop (100m grid)', tiles:cells.length, tilesOk:ok };
      if(failed>0){ out.partial=true; out.tilesFailed=failed; out.src='WorldPop (100m grid, '+ok+'/'+cells.length+' tiles, '+failed+' unavailable)'; }
      return out; }
    async function estimate(geom, onProgress){ const g=_prep(geom); if(!g) throw new Error('polygon required');
      const key=JSON.stringify(g); if(cache.has(key)) return cache.get(key);
      let areaKm2=0; try{ areaKm2=turf.area({type:'Feature',geometry:g,properties:{}})/1e6; }catch(_){}
      /* (#R128) even a SINGLE sub-cap request goes through the retry wrapper — a lone stalled connection used to
         hang the panel on "Calculating…" forever; now it aborts and retries, so a transient WorldPop hiccup recovers.
         (#R254) …and there is no longer a separate "single request" branch: EVERY area is tiled, because that is
         where the progress fraction comes from (see _estimateTiled). `_tileWithRetry` is still what runs per cell. */
      const out=await _estimateTiled(g, areaKm2, onProgress);
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

/* ══ ⚠⚠ (#R296) 「電波・通信圏と見通し線解析を統合して」 ═══════════════════════════════
   `IntMapModules.rf` / `window.IntMapRF` stood here. Its physics is a strict subset of js/viewshed.js
   (a 52×52 cell 4/3-earth viewshed vs. the same viewshed at raster resolution with refraction as a
   parameter, first-Fresnel clearance and knife-edge diffraction), so the merged tool is that one,
   with 「電波・通信圏」 as a mode. The only thing this module had that the other did not — the TX
   power and the free-space link budget — was ported, formula for formula. */

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
    /* ══ ⚠⚠⚠ (#R298→#R302) THE POINT THIS PANEL IS ANSWERING FOR ═════════════════════════════════
       「地点を選ばないといけない系のツール、押したら勝手に地図中心を選択しているものとして結果を出すの
         を辞めろ。」 Everything this panel prints is a function of ONE coordinate — the sun's altitude
       and azimuth, sunrise, noon, sunset, the direction the building shadows fall, which hemisphere's
       solstice is the short day — and all five read `GE().camera.getCenter()` directly, so the panel
       answered for wherever the camera happened to be pointing and never said that it had.
       #R298 kept the centre and NAMED it in `.sun-where`. The reader sent the sentence again:
       「いきなり勝手に地図中心を選択しているという前提で勝手に計算して結果を表示するのを辞めろってこと。
         まずは地点を選ばせろってこと。」 — so the fallback itself is gone, not just its silence.
       ⚠ 「NO POINT」 IS A REAL STATE. `site` is null until somebody hands the panel a point (the tools
       list — which asks with #R196's shared bar now — the map's right-click item, Atlas, or the ◎
       probe below), and while it is null NOTHING is computed and NOTHING is drawn: `siteLL()` returns
       null, the readout is blank, the shadow source is empty, and the panel asks for a tap. `mine` is
       gone with the fallback — null and a coordinate are the two states, so nothing can confuse them. */
    let site=null;
    /* the one sentence this panel uses to ask, in the reader's own language — the SAME English source
       string js/map-ui.js and #R196's bar carry, so the three cannot drift apart in nine languages */
    const _pickMsg=()=>SN('Tap the map to choose a point','地図をタップして地点を選んでください','Zum Wählen eines Punktes auf die Karte tippen','Нажмите на карту, чтобы выбрать точку','Toca el mapa para elegir un punto');
    function hasSite(){ return !!(site&&isFinite(site.lng)&&isFinite(site.lat)); }
    function siteLL(){ return hasSite()?{ lng:+site.lng, lat:+site.lat }:null; }
    function setSite(ll){ if(ll&&isFinite(ll.lng)&&isFinite(ll.lat)) site={ lng:+ll.lng, lat:+ll.lat }; return site; }
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
      const c=siteLL();
      /* ⚠ (#R302) NO POINT → NO NUMBERS AND NO SHADOW. The cast polygons are laid out along the sun's
         bearing AT THE OBSERVER, so drawing them for the centre would be the same invented answer the
         readout used to print, only harder to notice because it looks like geometry. */
      if(!c){ updatePanel(null); try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} busy=false; return; }
      const sp=sunPos(when,c.lat,c.lng);
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
    function fmtT(d){ try{ return d.toLocaleTimeString(window.IntMapLang.locale(HOST.lang,"en-GB"),{hour:'2-digit',minute:'2-digit'}); }catch(_){ return '—'; } }
    function updatePanel(sp){ if(!panel) return; const c=siteLL();
      /* (#R298) 「どの地点の話なのか」 — one line, above the numbers it belongs to, in every state the
         panel has. ⚠ (#R302) and one of those states is 「none yet」: with no point the line asks for
         one and the readout stays EMPTY, instead of naming the camera's centre and printing its sun. */
      const wh=panel.querySelector('.sun-where'), rd=panel.querySelector('.sun-read');
      if(!c||!sp){ if(wh) wh.textContent=_pickMsg(); if(rd) rd.innerHTML=''; return; }
      const st=sunTimes(when,c.lat,c.lng);
      if(wh) wh.textContent='◎ '+c.lat.toFixed(4)+', '+c.lng.toFixed(4);
      if(rd){ const dir=window.IntMapCompass.point(sp.azCompass,HOST.lang,8);   /* (#R289) one table, nine languages */
        rd.innerHTML='<b>'+(sp.altDeg>0?'☀️':'🌙')+' '+SN('Altitude','高度','Höhe','Высота','Altura')+' '+sp.altDeg.toFixed(1)+'° · '+SN('Azimuth','方位','Azimut','Азимут','Azimut')+' '+Math.round(sp.azCompass)+'° '+dir+'</b>'
          +'<div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;">'+(st.polar?SN('polar '+st.polar,st.polar==='day'?'白夜':'極夜','Polar','полярный','polar'):('🌅 '+fmtT(st.rise)+' · ☀️ '+fmtT(st.noon)+' · 🌇 '+fmtT(st.set)))+'</div>'; } }
    function setTime(d){ when=(d instanceof Date)?d:new Date(d); if(when<0||isNaN(when)) when=new Date(); syncInputs(); drawShadows();
      try{ drawTerrain(); }catch(_){}   /* (#R176) the terrain shadow follows the same clock as the buildings' */ }
    function syncInputs(){ if(!panel) return; const di=panel.querySelector('.sun-date'), ti=panel.querySelector('.sun-time'), tl=panel.querySelector('.sun-slider');
      try{ if(di) di.value=when.toISOString().slice(0,10); }catch(_){} const mins=when.getHours()*60+when.getMinutes(); if(tl) tl.value=mins; if(ti) ti.textContent=fmtT(when); }
    function ensurePanel(){ if(panel) return panel; panel=document.createElement('div'); panel.id='sun-panel';
      panel.style.cssText='position:fixed;left:16px;top:80px;width:min(320px,92vw);z-index:1402;display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
      panel.innerHTML='<div class="sun-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;"><span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">🌇 '+SN('Sun & shadow','日照・影','Sonne & Schatten','Солнце и тень','Sol y sombra')+'</span><button class="sun-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">×</button></div>'
        +'<div style="padding:10px 12px;display:flex;flex-direction:column;gap:9px;">'
        +'<div style="display:flex;gap:8px;align-items:center;"><input type="date" class="sun-date" style="flex:1;height:30px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;padding:0 6px;"><button class="sun-now" style="height:30px;padding:0 10px;border:none;border-radius:8px;background:var(--input-bg);color:var(--text-main);font-size:11px;cursor:pointer;">'+SN('Now','現在','Jetzt','Сейчас','Ahora')+'</button><button class="sun-play" style="height:30px;width:34px;border:none;border-radius:8px;background:var(--primary-color);color:#fff;font-size:13px;cursor:pointer;">▶</button></div>'
        +'<div style="display:flex;align-items:center;gap:8px;"><input type="range" class="sun-slider" min="0" max="1439" value="720" style="flex:1;"><span class="sun-time" style="font-size:12px;font-weight:700;color:var(--text-main);min-width:44px;text-align:right;">12:00</span></div>'
        /* (#R298) the coordinate every number below is for — filled by updatePanel() */
        +'<div class="sun-where" style="font-size:11px;color:var(--text-muted);"></div>'
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
      const pb=panel.querySelector('.sun-play'); pb.onclick=()=>{ if(playing){ stopTick(playing); playing=0; pb.textContent='▶'; } else { pb.textContent='⏸'; playing=everyTick('sims:sun-play',700,()=>{ const nd=new Date(when.getTime()+15*60000); setTime(nd); }); } };
      try{ if(typeof makeDraggable==='function') makeDraggable(panel,panel.querySelector('.sun-head')); }catch(_){}
      return panel; }
    /* ===== (#R176) the terrain/annual half of the engine — thin controls over js/insolation.js ===== */
    let terrainOn=false, engBusy=false, pickH=null;
    const ENG=()=>window.IntMapInsolation;
    function engSay(h){ const e=panel&&panel.querySelector('.sun-eng'); if(e) e.innerHTML=h; }
    function syncTerrBtn(){ const b=panel&&panel.querySelector('.sun-terr'); if(!b) return;
      b.style.background=terrainOn?'var(--primary-color)':'var(--input-bg)'; b.style.color=terrainOn?'#fff':'var(--text-main)'; }
    const nf=(v,d)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:d==null?0:d});
    async function drawTerrain(){ if(!terrainOn||engBusy||!ENG()) return;
      const at=siteLL(); if(!at) return;   /* (#R302) the sun's altitude is a property of ONE point — with none there is nothing to shade */
      engBusy=true;
      try{ const r=await ENG().shade(when,{refit:true,at});   /* (#R298) the sun is read at the panel's point */
        if(r) engSay('⛰ '+SN('Terrain shadow','地形の影','Geländeschatten','Тень рельефа','Sombra del terreno')+': '
          +nf(r.shadedFrac*100,1)+'% '+SN('of the view','が影','der Ansicht','вида','de la vista')
          +' · '+SN('sun','太陽','Sonne','солнце','sol')+' '+nf(r.altDeg,1)+'° / '+nf(r.azDeg)+'°'
          +' · '+nf(r.cellM)+' m '+SN('cells','セル','Zellen','ячейки','celdas')+' · DEM z'+r.z);
      }catch(_){ } engBusy=false; }
    function toggleTerrain(){ terrainOn=!terrainOn; syncTerrBtn();
      /* (#R302) a button that quietly does nothing is the defect this round is here for — with no
         point chosen it asks for one instead of shading the view from a sun nobody placed */
      if(terrainOn){ if(!hasSite()){ askSite(); return; }
        engSay(SN('Reading the terrain…','地形を読み込み中…','Gelände wird gelesen…','Чтение рельефа…','Leyendo el terreno…')); drawTerrain(); }
      else { try{ ENG()&&ENG().clear(); }catch(_){} engSay(''); } }
    async function solsticeShade(){ if(engBusy||!ENG()) return;
      /* (#R302) WHICH hemisphere's solstice is the short day is a question about a latitude */
      const at=siteLL(); if(!at){ askSite(); return; }
      engBusy=true;
      engSay(SN('Stepping through the solstice day…','冬至の1日を計算中…','Sonnenwendtag wird durchlaufen…','Расчёт дня солнцестояния…','Recorriendo el solsticio…'));
      try{
        const lat=at.lat, y=when.getFullYear();                       /* (#R298) the panel's own point */
        const d=new Date(y, lat>=0?11:5, 21, 12, 0, 0);               /* the SHORT day for this hemisphere */
        const r=await ENG().dayShadow(d,{refit:true,at});
        terrainOn=true; syncTerrBtn();
        if(r) engSay('❄ '+SN('Never sunlit on','日照ゼロ（','Nie besonnt am ','Без солнца ','Sin sol el ')+r.day+SN('','）',': ',': ',': ')+' — <b>'+nf(r.neverSunFrac*100,1)+'%</b> '
          +SN('of the view','の面積','der Ansicht','вида','de la vista')+' · '+r.steps+' '+SN('sun positions','時刻で判定','Sonnenstände','положений','posiciones')
          +' · '+nf(r.cellM)+' m '+SN('cells','セル','Zellen','ячейки','celdas'));
      }catch(_){ } engBusy=false; }
    function endPick(){ try{ if(pickH) GE().events.off('click',pickH); }catch(_){} pickH=null;
      try{ const P=window.IntMapPick; if(P&&P.active()) P.abort(); }catch(_){}
      try{ GE().render.canvas().style.cursor=''; }catch(_){} }
    /* ══ ⚠ (#R302) THE PANEL ASKS FOR ITS OBSERVER — 「まずは地点を選ばせろってこと。」 ══════════════
       Opened without a point (Atlas, a restored share link, anything that forgot), this arms #R196's
       SHARED bar — `#im-pick-bar`, js/map-pick.js, the same crosshair every other tool asks with —
       so the reader answers with one tap and can cancel with × or Esc. No new element and no new
       class: the reader has twice said not to invent chrome for this.
       ⚠ NOT `pickPoint()`. That one runs the whole-year horizon analysis, which #R299 deliberately
       took off the opening path; this only names the observer the panel is already missing. */
    /* ⚠ (#R305) 「いや並行してどちらも出てくるとかあほか。」 — ONE VOICE PER GESTURE. This said the
       sentence twice: `.sun-eng` printed it inside the panel the reader is looking at AND #R196's
       bar printed it again over the map. The panel's own line is the one that belongs to the panel,
       so it keeps it and the banner is armed silently (`announce:false`, js/map-pick.js). The
       ghosting, the crosshair and Esc are unchanged — only the second copy of the sentence is gone. */
    function askSite(){ endPick(); engSay(_pickMsg());
      try{ const P=window.IntMapPick;
        return !!(P&&P.start&&P.start({ panel, hint:_pickMsg(), announce:false,
          onPick:(ll)=>{ engSay(''); setSite(ll); drawShadows(); try{ drawTerrain(); }catch(_){} } })); }catch(_){ return false; } }
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
      /* (#R298) the probe IS a choice of place — the rest of the panel follows it instead of the camera */
      setSite({lng,lat}); try{ drawShadows(); }catch(_){}
      engSay(SN('Building the 360° horizon and stepping a year…','360°の地平線と1年分を計算中…','360°-Horizont und ein Jahr…','Горизонт 360° и целый год…','Horizonte de 360° y un año…'));
      let a=null;
      try{ a=await ENG().analyse(lng,lat,{});
        const d=await ENG().dayAt(lng,lat,when,{});
        const hhmm=t=>{ try{ return t?t.toLocaleTimeString(window.IntMapLang.locale(HOST.lang,"en-GB"),{hour:'2-digit',minute:'2-digit'}):'—'; }catch(_){ return '—'; } };
        engSay('◎ '+lat.toFixed(4)+', '+lng.toFixed(4)+' · '+nf(a.groundM)+' m'
          +'<br><b>'+nf(a.annualHours)+' h</b> '+SN('of sun a year','の年間日照','Sonne pro Jahr','солнца в год','de sol al año')
          +' ('+SN('open horizon would give','遮蔽なしなら','ohne Horizont','без горизонта','sin horizonte')+' '+nf(a.annualOpenHours)+' h · −'+nf(a.lossPct,1)+'%)'
          +'<br>'+SN('Winter solstice','冬至','Wintersonnenwende','Зимнее солнцестояние','Solsticio de invierno')+' <b>'+nf(a.winterSolstice,1)+' h</b>'
          +' · '+SN('summer','夏至','Sommer','лето','verano')+' '+nf(a.summerSolstice,1)+' h'
          +' · '+SN('equinox','春分','Tagundnachtgleiche','равноденствие','equinoccio')+' '+nf(a.equinox,1)+' h'
          +(a.zeroSunDays?('<br><b>'+a.zeroSunDays+'</b> '+SN('days a year with no sun at all','日は終日日が当たりません','Tage ohne Sonne','дней без солнца','días sin sol')):'')
          +'<br>'+SN('Usable for PV','発電可能時間','PV-nutzbar','Пригодно для СЭС','Útil para FV')+' (>'+10+'°): <b>'+nf(a.pvHours)+' h</b> · '
          +SN('clear-sky beam','快晴時の直達日射','klarer Himmel','ясное небо','cielo despejado')+' '+nf(a.beamKWhM2)+' kWh/m²'
          +'<br>'+SN('Selected day','この日','Heute','Сегодня','Hoy')+': '+hhmm(d.first)+' → '+hhmm(d.last)+' ('+nf(d.hours,1)+' h) · '
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
      if(playing){ stopTick(playing); playing=0; }
      try{ panel.remove(); }catch(_){} panel=null;
      if(wasOpen) open(); });
    /* (#R298→#R302) `at` is the point the caller was given by the reader — the tools list asks for one
       (js/map-ui.js `_askPoint`), the map's right-click item has the coordinate it was opened on, Atlas
       resolves the place in the sentence. There is NO camera fallback left: with nothing to answer for,
       the panel opens empty and asks. ⚠ `setSite(undefined)` KEEPS an existing point on purpose — the
       language switch below rebuilds the panel through this same door and must not lose its subject. */
    function open(at){ setSite(at); ensure(); ensurePanel(); panel.style.display='flex'; syncInputs(); syncTerrBtn(); drawShadows(); if(terrainOn) drawTerrain();
      if(!hasSite()) askSite(); }
    function close(){ if(panel) panel.style.display='none'; if(playing){ stopTick(playing); playing=0; const pb=panel&&panel.querySelector('.sun-play'); if(pb) pb.textContent='▶'; } endPick();
      site=null;   /* (#R298) shutting the panel forgets its subject — the next open states its own */
      try{ ENG()&&ENG().clear(); }catch(_){} try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} try{ GE().scene.setLight&&GE().scene.setLight({anchor:'viewport',position:[1.15,210,30]}); }catch(_){} }
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
      try{ if(window.satToast) satToast(window.IntMapLang.t(HOST.lang,'Computing rail reach…','鉄道到達圏を計算中…','Bahn-Erreichbarkeit wird berechnet…','Расчёт зоны доступности по железной дороге…','Calculando el alcance ferroviario…')); }catch(_){}
      const r=await run(from,minutes);
      /* (#R209) the reachable-area hull needs turf's convex+buffer, which are not in the boot bundle
         (see src/vendor.js). Wait for them HERE rather than letting draw() find them missing. */
      try{ await window.turf.ensureHeavy(); }catch(_){}
      if(r&&r.ok){ draw(r); } return r; }
    /* ══ (#R264) THIS ONE HAS NO PANEL — WHAT IT DRAWS *IS* THE ANSWER ═══════════════════════════
       So «open» is «the reach is on the map», read off the source it fills rather than from a flag
       that could disagree with it, and closing takes the drawing off. The tools list needs both to
       light its row and to switch it back off (js/map-ui.js). */
    const isOpen=()=>{ try{ const d=GE().layers.sourceData(SRC); return !!(d&&d.features&&d.features.length); }catch(_){ return false; } };
    function close(){ if(!isOpen()) return false; try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} return true; }
    return { run, open, draw, isOpen, close, clear:()=>{ try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} } }; })();
};

/* ══ ⚠⚠ (#R296) 「災害シミュレーターは4つのうち、放射性物質拡散シミュレーションを残し全削除」 ═════
   `IntMapModules.disaster` / `window.IntMapDisaster` stood here with four hazards — 洪水 / 火山灰 /
   煙 / 放射性物質 — and the fourth was never a model of its own: picking it dispatched to
   `IntMapRadiation`, which is a separate simulator with its own tools row. Deleting the other three
   leaves a one-choice panel whose only act is to open another panel, which is the placeholder the
   standing rules forbid, so the wrapper goes and the radioactive-dispersion model stays — with the
   panel it has never had (see `openPanel` above), because it is now the only door. */

/* ══ ⚠⚠ (#R296) 「「地球リプレイ」は存在意義が不明だから全削除」 ═══════════════════════════
   `IntMapModules.earthReplay` / `window.IntMapEarthReplay` stood here — a play button that swept the
   master clock through a day and let the night-side terminator follow it. Everything it could show,
   Chronos shows: the same clock, the same terminator, with a date, a time and a transport of its own
   (#R293 put the model's player in Chronos's Time tab). Removed whole rather than left as a second
   door onto the same state — the tools row (js/map-ui.js), the Atlas `sunPath` branch that opened it
   (js/atlas-console.js) and the module go together. */
