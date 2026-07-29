/* ============================================================================
 *  IntMap · Seismic wave simulator  (#R176)
 * ----------------------------------------------------------------------------
 *  「地震波シミュレーター — 震源地、深さ、規模を設定すると、P波・S波・表面波が地球上を伝わる様子を
 *    時間付きで表示。任意都市への到達時刻、揺れの継続時間、推定震度を出す。」
 *
 *  WHERE EVERY NUMBER COMES FROM (standing instruction 4 — nothing here is a fitted curve invented
 *  to look plausible; each quantity is derived from a named model, and the panel says which).
 *
 *  ARRIVAL TIMES — ray theory through IASP91 (Kennett & Engdahl 1991), the reference Earth model the
 *  ISC and the USGS locate earthquakes with. The model is a set of polynomials in x = r/6371 giving
 *  P and S velocity at every radius; those polynomials are the DATA in this file, and the travel
 *  times are COMPUTED from them, not tabulated. The Earth is cut into thin homogeneous shells and
 *  the ray is followed shell by shell with Snell's law: inside a homogeneous shell the ray is a
 *  straight chord, so the angular step and the time step have closed forms and the turning point —
 *  where a continuous integral goes singular — is just the shell in which sin(i) would exceed 1.
 *  The travel-time curve T(Δ) comes out with its triplications and its core shadow intact, because
 *  both are consequences of the velocity model rather than special cases in the code.
 *
 *  SURFACE WAVES — group velocity, not ray theory: Rayleigh 3.5 km/s and Love 4.4 km/s along the
 *  great circle, the standard values for 20-40 s periods on continental paths. Labelled as such.
 *
 *  SOURCE — seismic moment from Hanks & Kanamori (1979): log10 M0 = 1.5 Mw + 9.1. Corner frequency
 *  from the Brune (1970) circular crack: fc = 0.49 β (Δσ/M0)^(1/3).
 *
 *  GROUND MOTION — the far-field S pulse of that source, which is textbook radiation, not a regional
 *  regression: Ω0 = R·F·M0 / (4π ρ β³ r) with the average radiation pattern R = 0.55 and the free
 *  surface factor F = 2, attenuated by exp(−π f r / (Q β)). PGV ≈ 2π fc Ω0 and PGA ≈ (2π fc)² Ω0.
 *  Doing it this way means the assumptions are visible and adjustable (stress drop, Q, rock density)
 *  instead of hidden inside coefficients — and it is honest about what it omits: a point source, no
 *  finite rupture, no site amplification, no basin resonance.
 *
 *  INTENSITY — MMI from PGV by Wald, Quitoriano, Heaton & Kanamori (1999): MMI = 3.47 log10(PGV) +
 *  2.35, PGV in cm/s. This is the Modified Mercalli scale. It is NOT the JMA 震度 scale, and the
 *  panel says so rather than quietly presenting one as the other.
 *
 *  DURATION — from this model's own arrivals, so it explains itself: the ground is moving from the S
 *  arrival until the surface-wave train has gone by, and the rupture adds its own length 1/fc.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.seismic=function(map,HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ const m=window.__imap||map; return !!(m&&m.isStyleLoaded()); }catch(__){ return false; } } }
  const makeDraggable=HOST.makeDraggable;

  window.IntMapSeismic=(function(){
    if(!map) return { open(){}, close(){}, state:()=>({open:false}) };
    const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
    const D=Math.PI/180, RE=6371.0;                       /* IASP91 works in km */
    const SRC='seis-src';

    /* ======================================================================================
     *  IASP91 — the velocity model. x = r / 6371. Depth ranges in km, velocities in km/s.
     *  (Kennett & Engdahl, Geophys. J. Int. 105, 429-465, 1991.)
     * ====================================================================================*/
    const IASP91=[
      /* depthTop, depthBottom, vp(x) coefficients, vs(x) coefficients  (ascending powers of x) */
      { d0:0,    d1:20,    p:[5.80],                                  s:[3.36] },
      { d0:20,   d1:35,    p:[6.50],                                  s:[3.75] },
      { d0:35,   d1:120,   p:[8.78541,-0.74953],                      s:[6.706231,-2.248585] },
      { d0:120,  d1:210,   p:[25.41389,-17.69722],                    s:[5.75020,-1.27420] },
      { d0:210,  d1:410,   p:[30.78765,-23.25415],                    s:[15.24213,-11.08552] },
      { d0:410,  d1:660,   p:[29.38896,-21.40656],                    s:[17.70732,-13.50652] },
      { d0:660,  d1:760,   p:[25.96984,-16.93412],                    s:[20.76890,-16.53147] },
      { d0:760,  d1:2740,  p:[25.1486,-41.1538,51.9932,-26.6083],     s:[12.9303,-21.2590,27.9805,-14.1080] },
      { d0:2740, d1:2889,  p:[14.49470,-1.47089],                     s:[8.16616,-1.58206] },
      { d0:2889, d1:5153.9,p:[10.03904,3.75665,-13.67046],            s:[0] },            /* outer core: no S */
      { d0:5153.9,d1:6371, p:[11.24094,0,-4.09689],                   s:[3.56454,0,-3.45241] }
    ];
    function poly(c,x){ let v=0, xp=1; for(let i=0;i<c.length;i++){ v+=c[i]*xp; xp*=x; } return v; }
    function vel(depth,phase){ const x=(RE-depth)/RE;
      for(let i=0;i<IASP91.length;i++){ const L2=IASP91[i];
        if(depth>=L2.d0&&depth<=L2.d1) return poly(phase==='S'?L2.s:L2.p,x); }
      return poly(phase==='S'?IASP91[IASP91.length-1].s:IASP91[IASP91.length-1].p,x); }

    /* ---- shell model ------------------------------------------------------------------------- */
    /* One shell per DR km. Inside a shell the medium is homogeneous, so the ray is a straight chord
       and there is no singular integral to fight at the turning point. */
    const DR=1;                                            /* km — 6,371 shells; a curve costs ~90 ms, cached */
    const NS=Math.round(RE/DR);
    const SHELL_V={ P:null, S:null };
    function shells(phase){ if(SHELL_V[phase]) return SHELL_V[phase];
      const v=new Float64Array(NS);
      for(let i=0;i<NS;i++){ const rMid=RE-(i+0.5)*DR; v[i]=vel(RE-rMid,phase); }
      SHELL_V[phase]=v; return v; }
    const shellIndexOfDepth=d=>Math.max(0,Math.min(NS-1,Math.floor(d/DR)));

    /* Trace one ray of parameter p (s/rad, i.e. r·sin(i)/v with r in km) from the source shell.
       dir = -1 goes down first, +1 goes straight up. Returns {delta (deg), time (s)} or null when
       the ray cannot reach the surface (S entering the outer core, for instance). */
    function trace(p,srcDepth,phase,dir){
      const v=shells(phase);
      let idx=shellIndexOfDepth(srcDepth);
      let r=RE-srcDepth, delta=0, time=0, going=dir;
      let guard=0;
      while(guard++<4*NS){
        const vv=v[idx]; if(!(vv>0)) return null;              /* no S in the outer core */
        const rTop=RE-idx*DR, rBot=RE-(idx+1)*DR;
        const d=p*vv;                                          /* perpendicular distance of the chord */
        const rHi=Math.min(r,rTop), rLo=(going<0)?rBot:rTop;
        if(going<0){
          if(d>=rBot){                                          /* turns inside this shell */
            if(d>=r) { /* already at or above the turning radius — turn here */ going=1; continue; }
            const x1=Math.sqrt(Math.max(0,r*r-d*d));
            delta+=Math.atan2(x1,d)*2; time+=2*x1/vv;           /* down to the turn and back up */
            going=1; continue;
          }
          const xTop=Math.sqrt(Math.max(0,r*r-d*d)), xBot=Math.sqrt(Math.max(0,rBot*rBot-d*d));
          delta+=Math.atan2(xTop,d)-Math.atan2(xBot,d);
          time+=(xTop-xBot)/vv;
          r=rBot; idx++; if(idx>=NS){ going=1; idx=NS-1; }
        } else {
          const rNext=RE-idx*DR;
          if(d>=r) return null;
          const xNow=Math.sqrt(Math.max(0,r*r-d*d)), xNext=Math.sqrt(Math.max(0,rNext*rNext-d*d));
          delta+=Math.atan2(xNext,d)-Math.atan2(xNow,d);
          time+=(xNext-xNow)/vv;
          r=rNext;
          if(idx===0){ return { delta:delta/D, time }; }
          idx--;
        }
      }
      return null;
    }

    /* The travel-time curve for one phase and source depth, sampled over ray parameter. Kept per
       (phase, depth) because a curve costs a few million cheap steps and the depth rarely changes. */
    const curveCache=new Map();
    function curve(phase,srcDepth){
      const key=phase+'@'+Math.round(srcDepth);
      if(curveCache.has(key)) return curveCache.get(key);
      const pts=[];
      const vSrc=vel(srcDepth,phase)||1, rSrc=RE-srcDepth;
      const pMax=rSrc/vSrc;                                     /* horizontal ray at the source */
      const NP=520;
      for(let i=0;i<=NP;i++){
        const p=pMax*(i/NP);
        for(const dir of [-1,1]){
          const r=trace(p,srcDepth,phase,dir);
          if(r&&isFinite(r.delta)&&isFinite(r.time)&&r.delta>=0&&r.delta<=180) pts.push([r.delta,r.time]);
        }
      }
      pts.sort((a,b)=>a[0]-b[0]);
      curveCache.set(key,pts); return pts;
    }
    /* First arrival at Δ: the smallest time on any branch that reaches it. */
    function arrival(phase,srcDepth,deltaDeg){
      const pts=curve(phase,srcDepth); if(!pts.length) return null;
      let best=null;
      for(let i=1;i<pts.length;i++){
        const a=pts[i-1], b=pts[i];
        if((a[0]-deltaDeg)*(b[0]-deltaDeg)<=0&&a[0]!==b[0]){
          const f=(deltaDeg-a[0])/(b[0]-a[0]); const t=a[1]+f*(b[1]-a[1]);
          if(best==null||t<best) best=t;
        }
      }
      /* the sampled curve may not straddle Δ exactly at its ends */
      if(best==null){ let dmin=Infinity; for(const q of pts){ const dd=Math.abs(q[0]-deltaDeg); if(dd<dmin&&dd<0.6){ dmin=dd; best=q[1]; } } }
      return best;
    }
    /* …and the inverse, for drawing a wavefront: how far has the phase got by time t? */
    function frontDelta(phase,srcDepth,t){
      const pts=curve(phase,srcDepth); if(!pts.length) return null;
      let best=null;
      for(const q of pts){ if(q[1]<=t&&(best==null||q[0]>best)) best=q[0]; }
      return best;
    }

    /* ---- source and ground motion --------------------------------------------------------------- */
    const RHO=2700, BETA=3500, QS=300, RAD=0.55, FREE=2.0, KAPPA=0.035;
    /* rock density kg/m³, S velocity m/s, quality factor, average S radiation pattern, free-surface
       factor, and the near-surface high-frequency decay κ (s) — Anderson & Hough 1984. */
    let stressDropMPa=3.0;
    function source(mw){
      const M0=Math.pow(10,1.5*mw+9.1);                          /* N·m — Hanks & Kanamori 1979 */
      const dSigma=stressDropMPa*1e6;
      const fc=0.49*BETA*Math.pow(dSigma/M0,1/3);                /* Hz — Brune 1970 */
      const rupKm=Math.pow(7*M0/(16*dSigma),1/3)/1000;           /* circular-crack radius */
      return { M0, fc, rupKm, durS:1/fc };
    }
    /* GEOMETRICAL SPREADING — 1/R only holds while the direct S wave is the biggest arrival. Past about
       70 km the post-critical Moho reflection takes over and the decay flattens, then surface waves
       spread as 1/√R. The trilinear form (Atkinson & Boore 1995) is the standard way to say that. */
    function spread(rKm){ const r=Math.max(1,rKm);
      if(r<=70) return 1/r;
      if(r<=130) return 1/70;
      return (1/70)*Math.sqrt(130/r); }

    /* PEAK GROUND MOTION — the stochastic point-source method (Boore 1983, 2003) with random-vibration
       theory, NOT "the amplitude of a pulse at the corner frequency". That shortcut is what the first
       version of this file used, and it is wrong for a reason worth writing down: peak ACCELERATION is
       carried by frequencies far above fc, where the Brune spectrum is flat, so a single-frequency
       estimate misses almost all of it — measured against reality it came out roughly ten times too
       small for an M6 at 20 km. RVT does it properly: integrate the Fourier spectrum to get the rms,
       then convert rms to peak with the Cartwright & Longuet-Higgins (1956) peak factor.  */
    function rvt(spec,Td){
      /* spectral moments m0, m2 by log-spaced Simpson over 0.05-40 Hz */
      const f0=0.02, f1=40, N=400; let m0=0, m2=0;
      const lg0=Math.log(f0), lg1=Math.log(f1), dl=(lg1-lg0)/N;
      for(let i=0;i<=N;i++){ const f=Math.exp(lg0+i*dl); const w=(i===0||i===N)?1:(i%2?4:2);
        const A=spec(f), df=f*dl;                                  /* df = f·d(ln f) */
        m0+=w*A*A*df/3; m2+=w*A*A*(2*Math.PI*f)*(2*Math.PI*f)*df/3; }
      m0*=2/Td; m2*=2/Td;                                          /* Parseval over the duration */
      const rms=Math.sqrt(Math.max(0,m0));
      const fz=Math.sqrt(Math.max(1e-12,m2/Math.max(1e-30,m0)))/(2*Math.PI);
      const Nz=Math.max(2,2*fz*Td), lnN=Math.log(Nz);
      const pf=Math.sqrt(2*lnN)+0.5772/Math.sqrt(2*lnN);            /* peak / rms */
      return rms*pf;
    }
    /* SITE AMPLIFICATION — the quarter-wavelength impedance ratio √(ρ_source·β_source / ρ_site·Vs30).
       Waves slow down as they approach the surface and have to grow to carry the same energy; leaving
       this out is not conservative, it is simply the answer for a site made of the same rock as the
       source, which no real site is. Vs30 is the parameter every building code already uses, so the
       four choices are the NEHRP class boundaries. The 1/√2 also below splits the motion onto the two
       horizontal components, as the stochastic method defines it. */
    const MMI_MAX_KM=1000;                                    /* the ground-motion model's range */
    const SITES=[ {id:'hard', vs30:1500, rho:2600}, {id:'rock', vs30:760, rho:2200},
                  {id:'stiff',vs30:360,  rho:2000}, {id:'soft', vs30:180, rho:1800} ];
    let siteId='rock';
    function siteAmp(){ const st=SITES.find(s=>s.id===siteId)||SITES[1];
      return Math.sqrt((RHO*BETA)/(st.rho*st.vs30)); }
    function motion(mw,rM){
      const s=source(mw), r=Math.max(1000,rM), rKm=r/1000;
      /* the displacement spectral level, with the trilinear spreading folded in */
      const omega0=RAD*FREE*(1/Math.SQRT2)*siteAmp()*s.M0/(4*Math.PI*RHO*BETA*BETA*BETA)*spread(rKm)/1000;
      const path=f=>Math.exp(-Math.PI*f*r/(QS*BETA))*Math.exp(-Math.PI*KAPPA*f);
      const disp=f=>omega0/(1+(f/s.fc)*(f/s.fc))*path(f);           /* Brune ω⁻² source */
      const velS=f=>2*Math.PI*f*disp(f);
      const accS=f=>(2*Math.PI*f)*(2*Math.PI*f)*disp(f);
      /* ground-motion duration = the rupture's own length plus the path's scattering (Boore 2003) */
      const Td=s.durS+0.05*rKm;
      const pgvMs=rvt(velS,Td), pgaMs2=rvt(accS,Td);
      const pgv=pgvMs*100, pga=pgaMs2*100;                          /* cm/s, cm/s² */
      /* Wald et al. (1999) was regressed on MMI V-IX and is an extrapolation outside it; below about
         0.5 cm/s it returns numbers under I, which is not a scale value but "not felt". Say that
         rather than printing a Roman numeral the relation cannot support. */
      const mmi=Math.max(1,Math.min(12,3.47*Math.log10(Math.max(1e-6,pgv))+2.35));   /* Wald et al. 1999 */
      /* AND THE MODEL HAS A RANGE. The trilinear spreading is a REGIONAL law: past roughly a thousand
         kilometres the wave is travelling through the mantle, not along the crust, and extrapolating
         1/√R there gave MMI III at 7,500 km for an M9 — a number with no meaning. Beyond MMI_MAX_KM
         the arrival times are still ray theory and still good; the intensity simply is not offered. */
      const inRange=rKm<=MMI_MAX_KM;
      return { pgv, pga, pgaG:pgaMs2/9.80665, mmi, inRange, calibrated:(inRange&&pgv>=0.5&&mmi<=9.5),
        fc:s.fc, M0:s.M0, rupKm:s.rupKm, srcDurS:s.durS, gmDurS:Td, amp:siteAmp() };
    }
    const ROMAN=['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    function mmiWord(v){ const i=Math.max(1,Math.min(12,Math.round(v)));
      const w=[ '', L('not felt','無感','nicht spürbar','не ощущается','no sentido'),
        L('barely felt','ほとんど無感','kaum spürbar','едва ощутимо','apenas sentido'),
        L('weak','弱い','schwach','слабое','débil'),
        L('light','やや強い','leicht','лёгкое','ligero'),
        L('moderate','中程度','mäßig','умеренное','moderado'),
        L('strong','強い','stark','сильное','fuerte'),
        L('very strong','非常に強い','sehr stark','очень сильное','muy fuerte'),
        L('severe','激しい','schwer','разрушительное','severo'),
        L('violent','極めて激しい','verheerend','опустошительное','violento'),
        L('extreme','壊滅的','extrem','катастрофическое','extremo'),
        L('extreme','壊滅的','extrem','катастрофическое','extremo'),
        L('extreme','壊滅的','extrem','катастрофическое','extremo')][i];
      return ROMAN[i]+' — '+w; }

    /* ---- geometry ------------------------------------------------------------------------------- */
    function gcDelta(a,b){ const la1=a[1]*D, la2=b[1]*D, dl=(b[0]-a[0])*D;
      return Math.acos(Math.max(-1,Math.min(1,Math.sin(la1)*Math.sin(la2)+Math.cos(la1)*Math.cos(la2)*Math.cos(dl))))/D; }
    function destAng(a,brgDeg,angDeg){ const la1=a[1]*D, lo1=a[0]*D, dR=angDeg*D, br=brgDeg*D;
      const la2=Math.asin(Math.sin(la1)*Math.cos(dR)+Math.cos(la1)*Math.sin(dR)*Math.cos(br));
      const lo2=lo1+Math.atan2(Math.sin(br)*Math.sin(dR)*Math.cos(la1),Math.cos(dR)-Math.sin(la1)*Math.sin(la2));
      return [((lo2/D+540)%360)-180, la2/D]; }
    function ring(centre,angDeg,steps){ const out=[]; const n=steps||180;
      for(let i=0;i<=n;i++) out.push(destAng(centre,i*360/n,Math.min(179.9,Math.max(0.02,angDeg))));
      return out; }

    /* ---- state ---------------------------------------------------------------------------------- */
    let epi=null, depthKm=10, mw=7.0, tSec=0, playing=0, panel=null, opened=false, stations=[], picking=false;
    const MAXT=2400;

    function ensure(){ try{ if(!_imCanDraw()) return false;
      if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!GE().layers.has('seis-ring')) GE().layers.add({id:'seis-ring',type:'line',source:SRC,filter:['==',['get','kind'],'ring'],
        paint:{'line-color':['get','col'],'line-width':['get','w'],'line-opacity':0.92}});
      if(!GE().layers.has('seis-mmi')) GE().layers.add({id:'seis-mmi',type:'line',source:SRC,filter:['==',['get','kind'],'mmi'],
        paint:{'line-color':['get','col'],'line-width':1.4,'line-opacity':0.75,'line-dasharray':[3,2]}});
      if(!GE().layers.has('seis-mmi-lbl')) GE().layers.add({id:'seis-mmi-lbl',type:'symbol',source:SRC,filter:['==',['get','kind'],'mmilbl'],
        layout:{'text-field':['get','label'],'text-size':11,'text-allow-overlap':true},
        paint:{'text-color':['get','col'],'text-halo-color':'rgba(0,0,0,0.75)','text-halo-width':1.4}});
      if(!GE().layers.has('seis-sta')) GE().layers.add({id:'seis-sta',type:'circle',source:SRC,filter:['==',['get','kind'],'station'],
        paint:{'circle-radius':5,'circle-color':'#ffffff','circle-stroke-color':'#222','circle-stroke-width':1.6}});
      if(!GE().layers.has('seis-epi')) GE().layers.add({id:'seis-epi',type:'circle',source:SRC,filter:['==',['get','kind'],'epi'],
        paint:{'circle-radius':7,'circle-color':'#ff3b30','circle-stroke-color':'#fff','circle-stroke-width':2.4}});
      return true; }catch(_){ return false; } }
    function setData(f){ try{ if(ensure()) GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:f||[]}); }catch(_){} }

    /* the radius at which MMI falls through each integer — the spatial answer to 「推定震度」 */
    function mmiRings(){ const out=[]; if(!epi) return out;
      const peak=motion(mw,depthKm*1000).mmi;
      const maxDeg=MMI_MAX_KM/(RE*D);
      for(let I=Math.min(11,Math.floor(peak));I>=2;I--){
        let lo=0, hi=maxDeg;
        for(let k=0;k<40;k++){ const mid=(lo+hi)/2;
          const km=mid*D*RE, rM=Math.sqrt(km*km+depthKm*depthKm)*1000;
          if(motion(mw,rM).mmi>=I) lo=mid; else hi=mid; }
        /* only where the model still applies — a contour pinned to its own range limit is not a contour */
        if(lo>0.02&&lo<maxDeg*0.999) out.push({ I, deg:lo, km:lo*D*RE });
      }
      return out; }

    const PH=[ {k:'P',col:'#ff3b30',w:2.6}, {k:'S',col:'#ff9f0a',w:2.6} ];
    function draw(){
      if(!epi){ setData([]); return; }
      const feats=[{type:'Feature',geometry:{type:'Point',coordinates:epi},properties:{kind:'epi'}}];
      PH.forEach(ph=>{ const d=frontDelta(ph.k,depthKm,tSec);
        if(d!=null&&d>0.02) feats.push({type:'Feature',geometry:{type:'LineString',coordinates:ring(epi,d)},properties:{kind:'ring',col:ph.col,w:ph.w}}); });
      /* surface waves — group velocity along the great circle, not ray theory */
      [['#0a84ff',3.5],['#bf5af2',4.4]].forEach(([col,vkm])=>{ const d=(vkm*tSec)/(RE*D);
        if(d>0.02&&d<179) feats.push({type:'Feature',geometry:{type:'LineString',coordinates:ring(epi,d)},properties:{kind:'ring',col,w:1.8}}); });
      mmiRings().forEach(r=>{ const col=r.I>=8?'#ff2d2d':r.I>=6?'#ff9f0a':r.I>=4?'#ffd60a':'#8e8e93';
        feats.push({type:'Feature',geometry:{type:'LineString',coordinates:ring(epi,r.deg,120)},properties:{kind:'mmi',col}});
        feats.push({type:'Feature',geometry:{type:'Point',coordinates:destAng(epi,90,r.deg)},properties:{kind:'mmilbl',col,label:ROMAN[r.I]}}); });
      stations.forEach(s=>feats.push({type:'Feature',geometry:{type:'Point',coordinates:[s.lng,s.lat]},properties:{kind:'station'}}));
      setData(feats);
      report();
    }

    /* ---- the answer for one place ----------------------------------------------------------------- */
    function at(lng,lat){
      if(!epi) return null;
      const deg=gcDelta(epi,[lng,lat]), km=deg*D*RE;
      const rM=Math.sqrt(km*km+depthKm*depthKm)*1000;
      const tP=arrival('P',depthKm,deg), tS=arrival('S',depthKm,deg);
      const tR=km/3.5, tL=km/4.4;
      const m=motion(mw,rM);
      /* the ground is moving from S until the surface train has passed, plus the rupture's own length */
      const dur=(tS!=null)?Math.max(m.srcDurS, (tR-tS)+m.srcDurS):m.srcDurS;
      return { deg, km, tP, tS, tRayleigh:tR, tLove:tL, durS:dur, mmi:m.mmi, pgv:m.pgv, pga:m.pga, pgaG:m.pgaG,
        inRange:m.inRange, calibrated:m.calibrated };   /* carried through, or the table prints an MMI the model does not claim */
    }
    const fmtT=s=>{ if(s==null||!isFinite(s)) return '—'; let t=Math.round(s); const m=Math.floor(t/60), ss=t%60;
      return m?(m+'m '+String(ss).padStart(2,'0')+'s'):(ss+'s'); };   /* round first, or 13m 59.6s prints "13m 60s" */

    /* ---- panel ------------------------------------------------------------------------------------ */
    const NUM='width:84px;height:26px;border-radius:7px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;padding:0 6px;box-sizing:border-box;';
    const ROW='font-size:11.5px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;gap:8px;';
    const BTN='padding:6px 8px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:11.5px;cursor:pointer;';
    function render(){ if(!panel) return;
      panel.innerHTML='<div class="sq-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;">'
        +'<span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">🌐 '+L('Seismic waves','地震波シミュレーター','Seismische Wellen','Сейсмические волны','Ondas sísmicas')+'</span>'
        +'<button class="sq-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>'
        +'<div style="padding:10px 12px;display:flex;flex-direction:column;gap:9px;">'
        +'<button class="sq-pick" style="'+BTN+'width:100%;background:var(--primary-color);color:#fff;border:none;font-weight:700;">◎ '+L('Place the epicentre','震源地を設置','Epizentrum setzen','Указать эпицентр','Colocar el epicentro')+'</button>'
        +'<label style="'+ROW+'">'+L('Depth (km)','深さ (km)','Tiefe (km)','Глубина (км)','Profundidad (km)')+'<input class="sq-d" type="number" min="0" max="700" step="5" value="'+depthKm+'" style="'+NUM+'"></label>'
        +'<label style="'+ROW+'">'+L('Magnitude (Mw)','規模 (Mw)','Magnitude (Mw)','Магнитуда (Mw)','Magnitud (Mw)')+'<input class="sq-m" type="number" min="3" max="9.6" step="0.1" value="'+mw+'" style="'+NUM+'"></label>'
        +'<label style="'+ROW+'">'+L('Stress drop (MPa)','応力降下量 (MPa)','Spannungsabfall (MPa)','Сброс напряжений (МПа)','Caída de esfuerzo (MPa)')+'<input class="sq-sd" type="number" min="0.3" max="30" step="0.5" value="'+stressDropMPa+'" style="'+NUM+'"></label>'
        +'<label style="'+ROW+'">'+L('Ground at the site','地盤','Untergrund','Грунт','Terreno')
          +'<select class="sq-site" style="'+NUM+'width:132px;">'
          +'<option value="hard">'+L('hard rock (Vs30 1500)','固い岩盤 (Vs30 1500)','Festgestein (Vs30 1500)','скала (Vs30 1500)','roca dura (Vs30 1500)')+'</option>'
          +'<option value="rock">'+L('rock (Vs30 760)','岩盤 (Vs30 760)','Fels (Vs30 760)','порода (Vs30 760)','roca (Vs30 760)')+'</option>'
          +'<option value="stiff">'+L('stiff soil (Vs30 360)','硬い地盤 (Vs30 360)','steifer Boden (Vs30 360)','плотный грунт (Vs30 360)','suelo firme (Vs30 360)')+'</option>'
          +'<option value="soft">'+L('soft soil (Vs30 180)','軟弱地盤 (Vs30 180)','weicher Boden (Vs30 180)','мягкий грунт (Vs30 180)','suelo blando (Vs30 180)')+'</option>'
          +'</select></label>'
        +'<div style="display:flex;align-items:center;gap:8px;"><button class="sq-play" style="'+BTN+'width:36px;">▶</button>'
          +'<input type="range" class="sq-t" min="0" max="'+MAXT+'" step="1" value="'+tSec+'" style="flex:1;">'
          +'<span class="sq-tv" style="font-size:12px;font-weight:700;color:var(--text-main);min-width:52px;text-align:right;">'+fmtT(tSec)+'</span></div>'
        +'<button class="sq-real" style="'+BTN+'width:100%;">🌎 '+L('Load a recent real earthquake','最近の実際の地震を読み込む','Echtes Beben laden','Загрузить реальное землетрясение','Cargar un sismo real')+'</button>'
        +'<div class="sq-out" style="font-size:11.5px;color:var(--text-main);line-height:1.6;"></div>'
        +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
        +L('Arrivals are ray-traced through the IASP91 Earth model; surface waves use 3.5 / 4.4 km/s group velocity. Ground motion is the stochastic point source (Brune spectrum, trilinear spreading, Q=300, κ=0.035 s, quarter-wavelength site amplification) and the intensity is Modified Mercalli from PGV (Wald et al. 1999) — it is NOT the JMA shindo scale, and MMI is only shown where that relation is calibrated. A point source has no fault plane and no basin, so near a large rupture the real shaking is stronger than this. Educational model: in a real emergency follow the official authorities.',
           '到達時刻は地球モデルIASP91のレイトレーシング、表面波は群速度3.5／4.4 km/sです。地動は確率論的点震源モデル（Bruneスペクトル・三折れ幾何減衰・Q=300・κ=0.035秒・1/4波長則による地盤増幅）、震度はPGVから求めた改正メルカリ震度（Wald et al. 1999）で、気象庁震度階級ではありません。相関式の適用範囲外では震度を表示しません。点震源のため断層面や堆積盆地の効果は含まれず、大地震の震源近傍では実際の揺れはこれより強くなります。教育目的のモデルです。実際の災害時は公的機関の指示に従ってください。',
           'Laufzeiten per Strahlverfolgung durch IASP91; Oberflächenwellen 3,5/4,4 km/s. Bodenbewegung: stochastische Punktquelle (Brune, trilineare Ausbreitung, Q=300, κ=0,035 s, Viertelwellenlängen-Verstärkung). Intensität = Modified Mercalli aus PGV (Wald et al. 1999), NICHT die JMA-Skala. Eine Punktquelle kennt keine Bruchfläche: nahe grossen Beben ist es real stärker. Nur Bildungsmodell.',
           'Времена — трассировка лучей по IASP91; поверхностные волны 3,5/4,4 км/с. Движение грунта — стохастический точечный источник (Брун, трёхзвенное расхождение, Q=300, κ=0,035 с, усиление по четверти длины волны). Интенсивность — MMI по PGV (Wald et al. 1999), а не шкала JMA. Точечный источник не знает плоскости разрыва: вблизи крупных землетрясений реально сильнее. Учебная модель.',
           'Llegadas por trazado de rayos en IASP91; ondas superficiales a 3,5/4,4 km/s. Movimiento: fuente puntual estocástica (Brune, dispersión trilineal, Q=300, κ=0,035 s, amplificación de cuarto de onda). Intensidad = Mercalli Modificada desde PGV (Wald et al. 1999), NO la escala JMA. Una fuente puntual no tiene plano de falla: cerca de grandes rupturas el sacudimiento real es mayor. Modelo educativo.')
        +'</div></div>';
      panel.querySelector('.sq-close').onclick=()=>close();
      panel.querySelector('.sq-pick').onclick=()=>startPick();
      panel.querySelector('.sq-d').onchange=e=>{ depthKm=Math.max(0,Math.min(700,+e.target.value||10)); draw(); };
      panel.querySelector('.sq-m').onchange=e=>{ mw=Math.max(3,Math.min(9.6,+e.target.value||7)); draw(); };
      panel.querySelector('.sq-sd').onchange=e=>{ stressDropMPa=Math.max(0.3,Math.min(30,+e.target.value||3)); draw(); };
      const sel=panel.querySelector('.sq-site'); if(sel){ sel.value=siteId; sel.onchange=e=>{ siteId=e.target.value; draw(); }; }
      const tl=panel.querySelector('.sq-t'); tl.oninput=()=>{ tSec=+tl.value; panel.querySelector('.sq-tv').textContent=fmtT(tSec); draw(); };
      const pb=panel.querySelector('.sq-play'); pb.onclick=()=>{ if(playing){ clearInterval(playing); playing=0; pb.textContent='▶'; }
        else { pb.textContent='⏸'; playing=setInterval(()=>{ tSec=(tSec+10)%MAXT; tl.value=tSec; panel.querySelector('.sq-tv').textContent=fmtT(tSec); draw(); },90); } };
      panel.querySelector('.sq-real').onclick=()=>loadReal();
      try{ makeDraggable(panel,panel.querySelector('.sq-head')); }catch(_){}
      report();
    }
    function report(){ const o=panel&&panel.querySelector('.sq-out'); if(!o) return;
      if(!epi){ o.innerHTML=L('Place an epicentre to begin.','震源地を設置してください。','Epizentrum setzen.','Укажите эпицентр.','Coloque un epicentro.'); return; }
      const s=source(mw);
      const notFelt=L('not felt','無感','—','—','—');
      const rows=nearby().map(c=>{ const a=at(c.lng,c.lat); if(!a) return '';
        return '<tr><td style="padding:1px 6px 1px 0;white-space:nowrap;">'+c.name+'</td>'
          +'<td style="padding:1px 6px;text-align:right;">'+Math.round(a.km).toLocaleString()+' km</td>'
          +'<td style="padding:1px 6px;text-align:right;color:#ff6b6b;">'+fmtT(a.tP)+'</td>'
          +'<td style="padding:1px 6px;text-align:right;color:#ffb020;">'+fmtT(a.tS)+'</td>'
          +'<td style="padding:1px 6px;text-align:right;">'+fmtT(a.durS)+'</td>'
          +'<td style="padding:1px 6px;text-align:right;">'+(a.pgv>=0.05?a.pgv.toFixed(1):'—')+'</td>'
          +'<td style="padding:1px 0 1px 6px;text-align:right;font-weight:700;">'
            +(a.calibrated?ROMAN[Math.max(1,Math.min(12,Math.round(a.mmi)))]:'<span style="opacity:0.6;font-weight:400;">'+notFelt+'</span>')+'</td></tr>'; }).join('');
      o.innerHTML='<div><b>M'+mw.toFixed(1)+'</b> · '+L('depth','深さ','Tiefe','глубина','prof.')+' '+depthKm+' km · M<sub>0</sub> '+s.M0.toExponential(2)+' N·m'
        +' · f<sub>c</sub> '+s.fc.toFixed(3)+' Hz · '+L('rupture radius','破壊半径','Bruchradius','радиус разрыва','radio de ruptura')+' '+s.rupKm.toFixed(1)+' km</div>'
        +'<table style="margin-top:6px;font-size:11px;border-collapse:collapse;width:100%;"><thead><tr style="color:var(--text-muted);">'
        +'<th style="text-align:left;font-weight:600;">'+L('Place','地点','Ort','Место','Lugar')+'</th>'
        +'<th style="text-align:right;font-weight:600;">Δ</th><th style="text-align:right;font-weight:600;color:#ff6b6b;">P</th>'
        +'<th style="text-align:right;font-weight:600;color:#ffb020;">S</th>'
        +'<th style="text-align:right;font-weight:600;">'+L('shaking','継続','Dauer','длит.','durac.')+'</th>'
        +'<th style="text-align:right;font-weight:600;">PGV</th>'
        +'<th style="text-align:right;font-weight:600;">MMI</th></tr></thead><tbody>'+rows+'</tbody></table>'
        +'<div style="margin-top:5px;opacity:0.75;">'+L('Click the map to add a place to this table.','地図をクリックすると地点を追加できます。','Karte klicken, um einen Ort hinzuzufügen.','Кликните по карте, чтобы добавить место.','Haga clic en el mapa para añadir un lugar.')+'</div>';
    }
    /* the table: whatever the user clicked, plus the nearest well-known places already in the app */
    function nearby(){
      const out=stations.map(s=>({name:s.name,lng:s.lng,lat:s.lat}));
      try{ const gz=window.IntMapGazetteer&&window.IntMapGazetteer.builtin;
        if(gz&&epi){ const cities=gz.filter(r=>r[0]==='city'||r[0]==='capital')
            .map(r=>({name:HOST.lang==='jp'?(r[5]||r[4]):r[4], lng:r[2], lat:r[3], d:gcDelta(epi,[r[2],r[3]])}))
            .sort((a,b)=>a.d-b.d).slice(0,6);
          cities.forEach(c=>{ if(!out.some(o=>o.name===c.name)) out.push(c); }); } }catch(_){}
      return out.slice(0,12);
    }
    let pickH=null;
    function endPick(){ picking=false; try{ if(pickH) GE().events.off('click',pickH); }catch(_){} pickH=null; try{ GE().render.canvas().style.cursor=''; }catch(_){} }
    function startPick(){ endPick(); picking=true; try{ GE().render.canvas().style.cursor='crosshair'; }catch(_){}
      pickH=e=>{ epi=[e.lngLat.lng,e.lngLat.lat]; endPick(); draw(); }; try{ GE().events.once('click',pickH); }catch(_){} }
    function onClick(e){ if(!opened||picking||!epi) return;
      stations.push({ lng:e.lngLat.lng, lat:e.lngLat.lat, name:e.lngLat.lat.toFixed(2)+', '+e.lngLat.lng.toFixed(2) });
      if(stations.length>6) stations.shift(); draw(); }
    GE().events.on('click',onClick);

    /* A real event, from the USGS feed the app already uses (and already declares in the privacy page). */
    async function loadReal(){
      const o=panel&&panel.querySelector('.sq-out'); if(o) o.innerHTML=L('Fetching USGS…','USGSから取得中…','USGS wird abgefragt…','Запрос к USGS…','Consultando USGS…');
      try{
        const r=await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson');
        const j=await r.json();
        const f=(j.features||[]).filter(x=>x.properties&&x.properties.mag>=5.5&&x.geometry).sort((a,b)=>b.properties.mag-a.properties.mag)[0];
        if(!f) throw 0;
        epi=[f.geometry.coordinates[0],f.geometry.coordinates[1]];
        depthKm=Math.max(0,Math.round(f.geometry.coordinates[2]||10));
        mw=Math.round(f.properties.mag*10)/10;
        const d=panel.querySelector('.sq-d'), m=panel.querySelector('.sq-m'); if(d) d.value=depthKm; if(m) m.value=mw;
        try{ GE().camera.flyTo({center:epi,zoom:3,duration:900}); }catch(_){}
        tSec=0; const tl=panel.querySelector('.sq-t'); if(tl) tl.value=0;
        draw();
        if(o) o.insertAdjacentHTML('afterbegin','<div style="margin-bottom:5px;">📡 '+String(f.properties.place||'').replace(/[<>&]/g,'')+'</div>');
      }catch(_){ if(o) o.innerHTML=L('Could not reach the USGS feed.','USGSのフィードに接続できませんでした。','USGS-Feed nicht erreichbar.','Не удалось получить данные USGS.','No se pudo acceder al feed del USGS.'); }
    }

    function open(o){
      if(!panel){ panel=document.createElement('div'); panel.id='sq-panel';
        panel.style.cssText='position:fixed;left:16px;top:80px;width:min(360px,94vw);z-index:1402;display:none;flex-direction:column;background:var(--popup-bg,#141414);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
        document.body.appendChild(panel); }
      panel.style.display='flex'; opened=true; render();
      if(o&&o.lng!=null){ epi=[o.lng,o.lat]; if(o.depth!=null) depthKm=Math.max(0,+o.depth); if(o.mw!=null) mw=Math.max(3,Math.min(9.6,+o.mw)); render(); draw(); }
      else draw();
      return true; }
    function close(){ opened=false; endPick(); if(playing){ clearInterval(playing); playing=0; }
      if(panel) panel.style.display='none'; setData([]); return true; }
    window.addEventListener('intmap-lang',()=>{ if(opened) render(); });

    return { open, close, draw, at, arrival, curve, source, motion, mmiRings,
      setEpicentre(lng,lat){ epi=[lng,lat]; draw(); return true; },
      setParams(o){ o=o||{}; if(o.depth!=null) depthKm=Math.max(0,Math.min(700,+o.depth));
        if(o.mw!=null) mw=Math.max(3,Math.min(9.6,+o.mw)); if(o.t!=null) tSec=Math.max(0,Math.min(MAXT,+o.t));
        if(o.stressDrop!=null) stressDropMPa=Math.max(0.3,Math.min(30,+o.stressDrop));
        if(opened) render(); draw(); return true; },
      loadReal,
      setSite(id){ if(SITES.some(s=>s.id===id)){ siteId=id; if(opened) render(); draw(); return true; } return false; },
      state:()=>({ open:opened, epi:epi?epi.slice():null, depthKm, mw, tSec, stressDropMPa, siteId, siteAmp:siteAmp(),
        stations:stations.length, mmiRings:mmiRings().map(r=>({I:r.I,km:Math.round(r.km)})) }) };
  })();
};
