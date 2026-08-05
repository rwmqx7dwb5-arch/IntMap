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
window.IntMapModules.seismic=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const makeDraggable=HOST.makeDraggable;
  /* (#R189) the DEM the intensity field reads — the same samplers terrain-water uses */
  const warmDEMTiles=HOST.warmDEMTiles, demElevBilinear=HOST.demElevBilinear,
        demElevAt=HOST.demElevAt, _demZoomForSpan=HOST._demZoomForSpan, isMobile=HOST.isMobile,
        demSnapshot=HOST.demSnapshot;   /* (#R191) the frozen DEM the intensity field reads — see buildField */

  window.IntMapSeismic=(function(){
    if(!GE().hasRenderer()) return { open(){}, close(){}, state:()=>({open:false}) };
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
    const RHO=2700, BETA=3500, RAD=0.55, FREE=2.0, KAPPA=0.035;
    /* rock density kg/m³, S velocity m/s, average S radiation pattern, free-surface factor, and the
       near-surface high-frequency decay κ (s) — Anderson & Hough 1984. */
    /* ══ (#R190) THE CRUST DOES NOT ATTENUATE EVERY FREQUENCY EQUALLY ═══════════════════════════════
       「シミュレーションの精度、忠実性を根本的に大幅に高めて。」
       A constant Q was the one clearly-wrong physical assumption left in the ground-motion chain.
       Anelastic attenuation in the crust is measured to be strongly frequency-dependent — Q(f) = Q₀·f^η
       — and the value used here, Q = 180·f^0.45, is the southern-California crustal Q of Raoof,
       Herrmann & Malagnini (1999), the one the stochastic method is normally run with for an active
       region. It is not a fitted curve: it is the published relation, and both numbers are exposed in
       the panel so the assumption stays visible and adjustable, like every other one in this file.
       WHAT IT CHANGES. A single Q = 300 over-attenuates high frequencies close in (where Q(f) is well
       above 300 for f > 3 Hz) and under-attenuates them far out (Q(1 Hz) = 180 < 300). PGA is carried
       by exactly those high frequencies, so the near-field peak was being suppressed and the far-field
       tail exaggerated — the shape of the whole intensity field, not a scale factor on it. */
    let QS0=180, QETA=0.45;
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
    /* ══ (#R191) THE PEAK FACTOR IS AN INTEGRAL, NOT ITS ASYMPTOTE ═══════════════════════════════════
       「シミュレーションの精度、忠実性を根本的に大幅に…高めて。」
       Random-vibration theory turns the rms into a peak with the expected largest value of a Gaussian
       process. #R176 used the Davenport asymptote √(2 ln N) + 0.5772/√(2 ln N), which is the limit of
       Cartwright & Longuet-Higgins (1956) for a NARROW-BAND process with many cycles. Earthquake
       acceleration is neither: it is broadband (which is why PGA is carried far above fc at all), and
       close in it is only a handful of cycles long.
       The exact relation is CL-H's own — Boore (2003), Pageoph 160, eqs. (43)–(46):

           peak/rms = √2 ∫₀^∞ { 1 − [1 − ξ·e^(−z²)]^Nₑ } dz
           Nₑ = (Td/π)·√(m₄/m₂)   extrema        ξ = m₂/√(m₀·m₄)   irregularity factor

       so it needs the FOURTH spectral moment as well, and it reduces to the asymptote exactly when
       ξ → 1 (narrow band). Measured against the old form over this model's own spectra: the peak
       factor falls by 3–7 % for acceleration (broadband, ξ ≈ 0.6-0.7) and is within 1 % for velocity,
       i.e. the correction is where it should be — on PGA, which the asymptote over-predicted. */
    function rvt(spec,Td){
      /* spectral moments m0, m2, m4 by log-spaced Simpson over 0.02-40 Hz */
      const f0=0.02, f1=40, N=400; let m0=0, m2=0, m4=0;
      const lg0=Math.log(f0), lg1=Math.log(f1), dl=(lg1-lg0)/N;
      for(let i=0;i<=N;i++){ const f=Math.exp(lg0+i*dl); const w=(i===0||i===N)?1:(i%2?4:2);
        const A=spec(f), df=f*dl, w2=(2*Math.PI*f)*(2*Math.PI*f);  /* df = f·d(ln f) */
        const a2=w*A*A*df/3;
        m0+=a2; m2+=a2*w2; m4+=a2*w2*w2; }
      m0*=2/Td; m2*=2/Td; m4*=2/Td;                                /* Parseval over the duration */
      const rms=Math.sqrt(Math.max(0,m0));
      if(!(rms>0)) return 0;
      const ne=Math.max(1.33,(Td/Math.PI)*Math.sqrt(Math.max(1e-30,m4)/Math.max(1e-30,m2)));
      const xi=Math.max(1e-4,Math.min(1,m2/Math.sqrt(Math.max(1e-60,m0*m4))));
      /* Simpson over z∈[0,8]: the integrand is 1 near 0 and dies with exp(−z²), so 8 is far past it */
      const ZM=8, NZ=320, dz=ZM/NZ; let I=0;
      for(let i=0;i<=NZ;i++){ const z=i*dz, w=(i===0||i===NZ)?1:(i%2?4:2);
        I+=w*(1-Math.pow(1-xi*Math.exp(-z*z),ne))*dz/3; }
      return rms*Math.SQRT2*I;
    }
    /* SITE AMPLIFICATION — the quarter-wavelength impedance ratio √(ρ_source·β_source / ρ_site·Vs30).
       Waves slow down as they approach the surface and have to grow to carry the same energy; leaving
       this out is not conservative, it is simply the answer for a site made of the same rock as the
       source, which no real site is. Vs30 is the parameter every building code already uses, so the
       four choices are the NEHRP class boundaries. The 1/√2 also below splits the motion onto the two
       horizontal components, as the stochastic method defines it. */
    /* ══ (#R190) THE PAINT REACHES THE EDGE OF THE SCALE, AND SAYS WHERE IT LEFT ITS CALIBRATION ══
       「震度分布の描画は震度1の範囲が終わる範囲まで行うように。」
       #R189 stopped every intensity at 1,000 km, on the correct ground that the trilinear spreading
       (Atkinson & Boore 1995) is a REGIONAL law and extrapolating it across a continent is not
       measurement. Measured this round for an M7.2 at 15 km: MMI II falls at 699 km on rock and past
       1,000 km on the softest ground, so that limit was clipping the outer class off the map — which
       is the report. Bigger events clip far more.
       The distinction the old constant conflated is between "where the model is CALIBRATED" and
       "where it is still worth drawing". Both are stated now: the field is painted to wherever the
       lowest class of the active scale actually ends, and everything past MMI_CALIB_KM is declared as
       extrapolated — in the panel and in the disclaimer. The TABLE is unchanged: `calibrated` still
       goes false past the calibrated range, so no numeric intensity is printed for a city the model
       cannot speak for. A drawn colour that is labelled an extrapolation is honest; a colour that
       silently stops mid-scale is the thing being reported.

       ⚠ AND THE OUTER LIMIT IS 1,500 km, NOT "wherever the arithmetic goes". Measured with 3,000 km:
       an M9 field spans 6,000 km, which is 82,944 cells over a box the DEM cannot cover — 71 % of the
       cells came back with no elevation at all (so no sea mask and no site term), 91 % of what WAS
       painted was extrapolated, and the build took 20.5 s. A picture that is mostly fallback over
       mostly-unknown ground is not more faithful than a smaller one, it just covers more of the
       screen. 1,500 km holds the whole lowest class for every event up to about M8 and most of an M9's,
       at a resolution the terrain data actually supports. */
    /* ══ (#R191) THE LOWEST CLASS REALLY DOES END, AND THE PAINT REALLY DOES GO THERE ════════════════
       「震度分布の描画は震度1の範囲が終わる範囲まで行うように。」 — reported a second time, because
       #R190's 1,500 km still clipped every large event. Measured with this model on the softest ground,
       the radius at which the LOWEST class ends:

              M6      M7       M8       M9      M9.6
        震度1   993 km  2,572 km 5,082 km 7,122 km 8,038 km
        MMI II  263 km    879 km 2,252 km 3,754 km 4,502 km

       so 1,500 km was showing 58 % of an M7's 震度1 radius and 21 % of an M9's. #R190 was right that a
       6,000 km BOX is not the answer — it measured 71 % of the cells with no DEM at all and a 20.5 s
       build. The mistake was assuming one picture had to do both jobs. THREE numbers, not one:

         MMI_CALIB_KM   1,000 km — where the regional spreading law is calibrated. Unchanged; the
                        table still refuses to print an intensity past it.
         MMI_TERRAIN_KM 1,500 km — how far the FINE field goes. It is a statement about the DEM: past
                        it a cell is wider than the terrain that would vary inside it, so a site term
                        there would be invented. Unchanged, and it is why #R190's number was right for
                        the job it was actually doing.
         MMI_MAX_KM     8,000 km — where the lowest class ends for the largest event this simulator
                        accepts. Past MMI_TERRAIN_KM there is no terrain to read, so the field is a
                        function of DISTANCE ALONE — which is drawn as a WHOLE-WORLD raster (see
                        buildFar): no box arithmetic, so no antimeridian wrap and no pole degeneracy
                        (#R189's lesson), and every cell's distance is a real great circle. */
    const MMI_CALIB_KM=1000;                                  /* where the regional law is calibrated */
    const MMI_TERRAIN_KM=1500;                                /* how far the terrain-driven fine field goes */
    const MMI_MAX_KM=8000;                                    /* and where the lowest class finally ends */
    const SITES=[ {id:'hard', vs30:1500, rho:2600}, {id:'rock', vs30:760, rho:2200},
                  {id:'stiff',vs30:360,  rho:2000}, {id:'soft', vs30:180, rho:1800} ];
    let siteId='rock';
    function siteAmp(){ const st=SITES.find(s=>s.id===siteId)||SITES[1];
      return Math.sqrt((RHO*BETA)/(st.rho*st.vs30)); }
    /* ══ (#R191) A POINT SOURCE HAS TO STAND FOR A FAULT THAT IS TENS OF KILOMETRES LONG ═════════════
       An M8 ruptures ~200 km of crust, so "the distance to the earthquake" cannot go to zero the way a
       point's does — the near field SATURATES, and a point-source chain without that saturation reports
       ground motion at the epicentre that no instrument has ever recorded. Yenier & Atkinson (2014,
       BSSA 104(3), 1458-1478) measured the equivalent point-source depth that reproduces the finite
       source's saturation and give it as log₁₀ h = −0.405 + 0.235·M: 5.5 km at M5, 17 km at M7, 51 km
       at M9. It enters in quadrature with the distance already in hand.
       ⚠ ONLY WHEN THE SOURCE IS A POINT. With a rupture drawn (#R189), the distance is Rrup — the real
       finite fault, measured to its real edge — and adding an equivalent depth on top would count the
       same finiteness twice. `fault` is exactly that test.
       MEASURED, M8 at 10 km depth on rock: PGV at the epicentre 209 → 74 cm/s, i.e. MMI 9.8 → 7.4,
       which is where the recordings of M8s actually sit; past ~150 km the two answers agree to 2 %. */
    function heffKm(mw){ return Math.pow(10,-0.405+0.235*mw); }
    function motion(mw,rM){
      const s=source(mw); let r=Math.max(1000,rM);
      if(!fault){ const h=heffKm(mw)*1000; r=Math.sqrt(r*r+h*h); }
      const rKm=r/1000;
      /* the displacement spectral level, with the trilinear spreading folded in */
      const omega0=RAD*FREE*(1/Math.SQRT2)*siteAmp()*s.M0/(4*Math.PI*RHO*BETA*BETA*BETA)*spread(rKm)/1000;
      /* (#R190) Q(f) = Q₀·f^η — see the note by QS0. The exponent leaves f^(1−η) in the exponent, which
         is why a constant Q cannot be tuned to imitate it: the two curves cross. */
      const path=f=>Math.exp(-Math.PI*f*r/(QS0*Math.pow(Math.max(0.01,f),QETA)*BETA))*Math.exp(-Math.PI*KAPPA*f);
      const disp=f=>omega0/(1+(f/s.fc)*(f/s.fc))*path(f);           /* Brune ω⁻² source */
      const velS=f=>2*Math.PI*f*disp(f);
      const accS=f=>(2*Math.PI*f)*(2*Math.PI*f)*disp(f);
      /* ══ (#R191) THE PATH DURATION IS PIECEWISE, AND IT IS THE SAME PAPER AS THE SPREADING ═════════
         The ground shakes for the source's own length plus however much the path scatters into it, and
         RVT divides the energy by that duration — so getting it wrong scales every peak. #R176 used a
         flat 0.05·R, which has no source; Atkinson & Boore (1995) MEASURED the path duration that goes
         with the trilinear spreading this model already uses (see spread(), same paper), and it is not
         a straight line: it climbs while the direct wave dominates, FALLS across the post-critical Moho
         window, then climbs again with the surface-wave train.
             R ≤ 10 : 0                    70 < R ≤ 130 : 9.6 − 0.03(R−70)
             10 < R ≤ 70 : 0.16(R−10)      R > 130      : 7.8 + 0.04(R−130)
         Measured against the flat line: 8.7 s instead of 5.0 s at 100 km (so peaks there fall ~8 %),
         and 42.6 s instead of 50 s at 1,000 km. */
      const Tp=(rKm<=10)?0:(rKm<=70)?(0.16*(rKm-10)):(rKm<=130)?(9.6-0.03*(rKm-70)):(7.8+0.04*(rKm-130));
      const Td=s.durS+Tp;
      const pgvMs=rvt(velS,Td), pgaMs2=rvt(accS,Td);
      const pgv=pgvMs*100, pga=pgaMs2*100;                          /* cm/s, cm/s² */
      /* Wald et al. (1999) was regressed on MMI V-IX and is an extrapolation outside it; below about
         0.5 cm/s it returns numbers under I, which is not a scale value but "not felt". Say that
         rather than printing a Roman numeral the relation cannot support. */
      const mmi=mmiOf(pgv);                                          /* Wald et al. 1999 — see mmiOf */
      /* AND THE MODEL HAS A RANGE. The trilinear spreading is a REGIONAL law: past roughly a thousand
         kilometres the wave is travelling through the mantle, not along the crust, and extrapolating
         1/√R there gave MMI III at 7,500 km for an M9 — a number with no meaning. Beyond MMI_MAX_KM
         the arrival times are still ray theory and still good; the intensity simply is not offered. */
      const inRange=rKm<=MMI_CALIB_KM;
      /* (#R191) "the model has something to say here" is a statement about the INTENSITY SCALES, not a
         PGV constant left over from Wald 1999's validity range. 0.5 cm/s was MMI 1.3 under that line
         and is MMI 3.3 under Worden's, so keeping it would have silenced two whole classes the moment
         the conversion improved. The floor is the lower of the two scales' own lowest classes, so
         neither scale is muted by the other's threshold. */
      return { pgv, pga, pgaG:pgaMs2/9.80665, mmi, inRange, calibrated:(inRange&&pgv>=PGV_FELT&&mmi<=9.5),
        fc:s.fc, M0:s.M0, rupKm:s.rupKm, srcDurS:s.durS, gmDurS:Td, pathDurS:Tp, heffKm:(fault?0:heffKm(mw)), amp:siteAmp() };
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
    /* (#R189) haversine, not the acos law of cosines — acos loses ~√ε of precision at small Δ,
       which is exactly the near-field where the intensity is computed. Same form as app-body's. */
    function gcDelta(a,b){ const la1=a[1]*D, la2=b[1]*D, dla=(b[1]-a[1])*D/2, dlo=(b[0]-a[0])*D/2;
      const h=Math.sin(dla)*Math.sin(dla)+Math.cos(la1)*Math.cos(la2)*Math.sin(dlo)*Math.sin(dlo);
      return 2*Math.asin(Math.min(1,Math.sqrt(h)))/D; }
    function destAng(a,brgDeg,angDeg){ const la1=a[1]*D, lo1=a[0]*D, dR=angDeg*D, br=brgDeg*D;
      const la2=Math.asin(Math.max(-1,Math.min(1,Math.sin(la1)*Math.cos(dR)+Math.cos(la1)*Math.sin(dR)*Math.cos(br))));
      const lo2=lo1+Math.atan2(Math.sin(br)*Math.sin(dR)*Math.cos(la1),Math.cos(dR)-Math.sin(la1)*Math.sin(la2));
      return [((lo2/D+540)%360)-180, Math.max(-89.99,Math.min(89.99,la2/D))]; }   /* (#R189) clamped: asin can emit ±90 exactly */
    /* ══ (#R189) A WAVEFRONT NEAR A POLE IS NOT A LIST OF INDEPENDENTLY WRAPPED VERTICES ═══════════
       「地震波が極地付近を通過するとバグるのをどうにかしろ。」 The old ring() wrapped every vertex
       into [-180,180) on its own, so a front crossing the antimeridian emitted +179.4 → −179.6 and
       the LineString swept horizontally across the whole map; a front enclosing a pole never closed;
       and a source AT a pole degenerated onto one meridian (cos(±90°)=0 kills the atan2 numerator).
       The app already owns the machinery that solves all three — HOST.diskOutlineLines splits at the
       seam with boundary points inserted (#R176, the radius tool's rings) — and seismic.js was the
       ONE consumer that re-derived rings by hand instead of using it. */
    function ringLines(centre,angDeg){
      const a=Math.min(179.9,Math.max(0.02,angDeg));
      try{ const w=HOST.diskOutlineLines(centre,a*D*RE,180); if(w&&w.length) return w; }catch(_){}
      const out=[]; for(let i=0;i<=180;i++) out.push(destAng(centre,i*2,a));   /* renderer-less fallback */
      return [out];
    }

    /* ---- state ---------------------------------------------------------------------------------- */
    let epi=null, depthKm=10, mw=7.0, tSec=0, playing=0, panel=null, opened=false, stations=[], picking=false;
    const MAXT=2400;
    /* (#R189) 「時刻の送りは等倍に。そして速度は変えられるように。」 — the default playback is REAL
       TIME (the old loop ran ~111× and nothing said so), and the rate is a visible control. */
    let speed=1; const SPEEDS=[1,2,5,10,30,60,120,300];
    /* (#R189) which intensity scale the panel and the painted field speak — MMI or JMA (converted).
       ══ (#R191) 「震度は日本語設定中は気象庁震度をデフォルトに。」 ═══════════════════════════════════
       The default follows the UI language, because a 震度 is what 震度分布 means to a reader in
       Japanese; MMI is the default everywhere else. It is a DEFAULT and not a rule: the moment the
       user picks a scale — from the panel, from setScale, or from Atlas — `scaleSet` latches and the
       language stops moving it, so switching to Japanese never overrides a choice that was made. */
    let scaleSet=false;
    const scaleForLang=()=>(HOST.lang==='jp')?'jma':'mmi';
    let scale=scaleForLang();
    function pickScale(v){ if(v!=='mmi'&&v!=='jma') return false; scale=v; scaleSet=true; return true; }

    /* ══ (#R189) JMA INSTRUMENTAL INTENSITY (計測震度への換算) ══════════════════════════════════════
       「震度階級は気象庁のものにも変えられるように。」 The conversion is Fujimoto & Midorikawa (2005):
       I = 2.68 + 1.72·log10(PGV cm/s) — the published regression between PGV and the JMA
       instrumental intensity. It is a CONVERSION from this model's PGV, not the JMA's own
       computation (which band-filters the full three-component waveform), and the disclaimer says
       so. Class boundaries are the real scale: 5弱/5強 split at 5.0, 6弱/6強 at 6.0, 7 from 6.5.
       Colours are the JMA's published map colours (気象庁 配色基準). */
    function jmaI(pgv){ return 2.68+1.72*Math.log10(Math.max(1e-6,pgv)); }
    /* ══ (#R191) THE MODIFIED MERCALLI CONVERSION IS THE ONE SHAKEMAP USES ═══════════════════════════
       (#R190) …as ONE function — it was written out twice (motion() and the field loop) and the two
       copies are what let the readout speak the wrong scale. ⚠ THERE WAS A THIRD COPY, in at(), which
       #R190 did not find; it is gone now and every reader calls this.
       The relation itself moves from Wald, Quitoriano, Heaton & Kanamori (1999) — a single line fitted
       to eight Californian earthquakes over MMI V-IX, and an extrapolation everywhere else — to
       Worden, Gerstenberger, Rhoades & Wald (2012, BSSA 102(1), 204-221), which is the GMICE ShakeMap
       itself converts PGV with. It is bilinear in log₁₀ PGV with the break at 3.4 cm/s:

           MMI = 3.78 + 1.47·log₁₀(PGV)   PGV ≤ 3.39 cm/s
           MMI = 2.89 + 3.16·log₁₀(PGV)   PGV > 3.39 cm/s      (continuous at MMI 4.56)

       VERIFIED against the published Instrumental-Intensity table rather than trusted: the PGV values
       USGS prints for the class boundaries — 1.1, 3.4, 8.1, 16, 31, 60, 116 cm/s — come back as MMI
       3.84 / 4.56 / 5.76 / 6.69 / 7.60 / 8.51 / 9.42, i.e. each within 0.3 of the boundary it is the
       boundary of. Wald 1999 puts the same 1.1 cm/s at MMI 2.5, a class and a half low: the old line
       under-reported everything below "strong", which is most of the map. */
    function mmiOf(pgv){ const lg=Math.log10(Math.max(1e-6,pgv));
      return Math.max(1,Math.min(12,(lg<=0.53)?(3.78+1.47*lg):(2.89+3.16*lg))); }
    /* the PGV at which a scale's LOWEST class begins — inverted from the relations above rather than
       written out again, so a change to either conversion moves the painted edge with it (#R190's
       lesson: two copies of one number always drift). */
    function pgvAtMMI(I){ return Math.pow(10,(I<=4.559)?((I-3.78)/1.47):((I-2.89)/3.16)); }
    function pgvAtJMA(I){ return Math.pow(10,(I-2.68)/1.72); }
    const JMA_CLASSES=[
      { min:0.5, id:'1',  col:'#F2F2FF' }, { min:1.5, id:'2',  col:'#00AAFF' },
      { min:2.5, id:'3',  col:'#0041FF' }, { min:3.5, id:'4',  col:'#FAE696' },
      { min:4.5, id:'5-', col:'#FFE600' }, { min:5.0, id:'5+', col:'#FF9900' },
      { min:5.5, id:'6-', col:'#FF2800' }, { min:6.0, id:'6+', col:'#A50021' },
      { min:6.5, id:'7',  col:'#B40068' } ];
    function jmaClass(I){ let c=null; for(const k of JMA_CLASSES){ if(I>=k.min) c=k; } return c; }
    /* the two scales' lowest classes as PGV, and the lower of them (see motion()'s `calibrated`) */
    const PGV_FLOOR_JMA=pgvAtJMA(JMA_CLASSES[0].min);            /* 震度1 — 0.054 cm/s */
    const PGV_FLOOR_MMI=pgvAtMMI(2);                             /* MMI II — 0.062 cm/s */
    const PGV_FELT=Math.min(PGV_FLOOR_JMA,PGV_FLOOR_MMI);
    function jmaLabel(id){ return id.replace('-',L(' lower','弱',' schwach',' слаб.',' débil')).replace('+',L(' upper','強',' stark',' сильн.',' fuerte')); }
    /* the USGS ShakeMap colours for the MMI fill; nothing painted under II */
    const MMI_CLASSES=[
      { min:2, id:'II–III', col:'#bfccff' }, { min:4, id:'IV',  col:'#a0e6ff' },
      { min:5, id:'V',   col:'#80ffff' },    { min:6, id:'VI',  col:'#7aff93' },
      { min:7, id:'VII', col:'#ffff00' },    { min:8, id:'VIII',col:'#ffc800' },
      { min:9, id:'IX',  col:'#ff9100' },    { min:10,id:'X+',  col:'#ff0000' } ];
    function mmiClass(I){ let c=null; for(const k of MMI_CLASSES){ if(I>=k.min) c=k; } return c; }

    /* ══ (#R189) FINITE RUPTURE FROM A FREE-DRAWN AREA ═════════════════════════════════════════════
       「フリーで描画した範囲の震源域とし、平均滑り幅を設定すればマグニチュードや震度分布が出るようにも
       して。」 The seismic moment of a finite rupture is its DEFINITION: M0 = μ·A·D̄, with the
       rigidity μ = ρβ² from the same constants the ground-motion chain already uses (3.3×10¹⁰ Pa),
       A the drawn area (spherical excess — HOST.ringArea) and D̄ the user's average slip. Mw comes
       back through Hanks & Kanamori. And the rupture is not just a magnitude source: the distance
       every receiver uses becomes Rrup — zero inside the drawn area, the distance to its nearest
       edge outside — which is what makes the intensity field FOLLOW THE FAULT'S SHAPE instead of
       spreading in circles from one point. The wavefronts get the same treatment (see draw()):
       each front is the envelope of fronts from points across the rupture, delayed by the rupture
       propagation itself at Vr = 0.75β from the hypocentre. */
    const MU=RHO*BETA*BETA, VRUP_KMS=0.75*BETA/1000;
    let fault=null;      /* { ring:[[lng,lat]…], areaKm2, slipM, mw, centroid } */
    let faultSlip=2;     /* the average slip D̄ (m) the next drawn rupture is given */
    function faultDerive(areaKm2,slipM){
      const M0=MU*(areaKm2*1e6)*Math.max(0.01,slipM);
      return { M0, mw:(Math.log10(M0)-9.1)/1.5 };
    }
    function faultSet(ring,slipM){
      if(!Array.isArray(ring)||ring.length<3) return false;
      let aKm2=0; try{ aKm2=HOST.ringArea(ring); }catch(_){ aKm2=0; }   /* spherical excess, in km² */
      if(!(aKm2>0)) return false;
      let cx=0, cy=0; ring.forEach(p=>{ cx+=p[0]; cy+=p[1]; });
      const centroid=[cx/ring.length, cy/ring.length];
      const d=faultDerive(aKm2,slipM);
      fault={ ring:ring.map(p=>[+p[0],+p[1]]), areaKm2:aKm2, slipM:+slipM, mw:Math.max(3,Math.min(9.6,d.mw)), M0:d.M0, centroid };
      mw=fault.mw;
      if(!epi) epi=centroid.slice();
      return true;
    }
    function faultClear(){ fault=null; }
    /* surface distance to the rupture: 0 inside, else nearest edge — local-equirect (a hand-drawn
       rupture is a local object; one that crosses the antimeridian is normalised into the
       centroid's window first) */
    function faultDistKm(lng,lat){
      if(!fault||!fault.ring||fault.ring.length<3) return null;
      const R2=fault.ring, cosL=Math.max(0.05,Math.cos(lat*D));
      const nrm=(lo)=>{ let x=lo-lng; while(x>180)x-=360; while(x<-180)x+=360; return x*cosL; };
      let inside=false;
      for(let i=0,j=R2.length-1;i<R2.length;j=i++){
        const xi=nrm(R2[i][0]), yi=R2[i][1]-lat, xj=nrm(R2[j][0]), yj=R2[j][1]-lat;
        if(((yi>0)!==(yj>0))&&(0<(xj-xi)*(0-yi)/(yj-yi)+xi)) inside=!inside; }
      if(inside) return 0;
      let best=Infinity;
      for(let i=0,j=R2.length-1;i<R2.length;j=i++){
        const ax=nrm(R2[j][0]), ay=R2[j][1]-lat, bx=nrm(R2[i][0]), by=R2[i][1]-lat;
        const dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy;
        const t=L2>0?Math.max(0,Math.min(1,(-(ax*dx+ay*dy))/L2)):0;
        const px=ax+dx*t, py=ay+dy*t;
        const dKm=Math.hypot(px*111.320,py*110.574);
        if(dKm<best) best=dKm; }
      return best;
    }
    /* the surface distance every receiver actually uses — Rrup with a fault, epicentral without */
    function distKmTo(lng,lat){
      const f=faultDistKm(lng,lat); if(f!=null) return f;
      return epi?gcDelta(epi,[lng,lat])*D*RE:0;
    }

    /* ══ (#R189) THE INTENSITY IS A PAINTED FIELD, AND THE GROUND IS IN IT ═══════════════════════
       「震度分布は単に線を引くのではなく、地形を考慮したうえで色塗りするように。」「単に震央から同心円状に
       広がるだけのクソシミュレーションはやめろ。忠実なシミュレーションにしろ。」
       Two things made the old dashed contours perfect circles: a POINT distance and ONE site class
       for the whole planet. Both are replaced:
       · the distance is Rrup to the drawn rupture when one exists (faultDistKm above);
       · the site term varies cell by cell, read off the REAL DEM: Vs30 is estimated from
         topographic slope — Wald & Allen (2007), the USGS's own global Vs30 proxy, active-tectonic
         table — with the slope measured over ~900 m (the scale the proxy was regressed at), and it
         enters the SAME quarter-wavelength amplification the model already used. Plains and basins
         amplify, hard steep ground does not: the painted field follows the terrain because the
         terrain is in the numbers, not because anything is drawn by hand.
       COST: PGV scales LINEARLY with the amplification factor (rvt() is linear in the spectral
       scale), so the whole field needs ONE 1-D profile of the full RVT chain over log-spaced Rrup
       plus one multiply per cell — not 30,000 RVT integrals.
       HONESTY: cells at or below 0 m elevation are left unpainted (the slope proxy has no meaning
       on the sea), cells with no DEM fall back to the panel's site class and are counted, and past
       MMI_MAX_KM nothing is painted at all — the same range statement the table already makes. */
    let fld=null, fldSeq=0, fldBusy=false, fldT=null;
    const VS30_BINS=[[1e-4,180],[2.2e-3,240],[6.3e-3,300],[0.018,360],[0.05,490],[0.10,620],[0.138,760]];
    function vs30FromSlope(s){
      if(!(s>0)||s<VS30_BINS[0][0]) return 180;
      let pv=VS30_BINS[0];
      for(let i=1;i<VS30_BINS.length;i++){ const b=VS30_BINS[i];
        if(s<b[0]){ const f=(Math.log(s)-Math.log(pv[0]))/(Math.log(b[0])-Math.log(pv[0]));
          return pv[1]+(b[1]-pv[1])*f; }
        pv=b; }
      return Math.min(1500,760+(s-0.138)*2400);
    }
    function ampOf(vs30){ const rho=1800+(Math.max(150,Math.min(1500,vs30))-180)/(1500-180)*(2600-1800);
      return Math.sqrt((RHO*BETA)/(rho*vs30)); }
    /* one full-chain PGV profile over log-spaced hypocentral distance, interpolated in log-log */
    function pgvProfile(){
      const n=140, rr=new Float64Array(n), out=new Float64Array(n);
      const r0=Math.max(1,depthKm||1), r1=Math.sqrt(MMI_MAX_KM*MMI_MAX_KM+depthKm*depthKm)*1.02;
      for(let i=0;i<n;i++){ const r=r0*Math.pow(r1/r0,i/(n-1)); rr[i]=r; out[i]=Math.max(1e-9,motion(mw,r*1000).pgv); }
      return { rr, out,
        at(rM){ const r=Math.max(rr[0],Math.min(rr[n-1],rM/1000));
          let lo=0,hi=n-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(rr[m]<=r) lo=m; else hi=m; }
          const span=Math.log(rr[hi])-Math.log(rr[lo])||1;
          const f=(Math.log(r)-Math.log(rr[lo]))/span;
          return out[lo]*Math.pow(out[hi]/out[lo],f); } };
    }
    const mX=lng=>(180+lng)/360, mY=lat=>(180-(180/Math.PI)*Math.log(Math.tan(Math.PI/4+lat*D/2)))/360;
    const latOfY=y=>360/Math.PI*Math.atan(Math.exp((180-y*360)*D))-90;
    const SRC_IMG='seis-mmi-img', LYR_IMG='seis-mmi-fill';
    /* ══ (#R190) THE PAINT'S OPACITY IS A CONTROL, AND ITS DEFAULT IS NOT 0.55 ═════════════════════
       「震度の塗は透明度選択を可能に。デフォルト透明度が薄すぎる。」 (confirmed this round: the
       intensity fill — it is the only painted surface the simulator has.) 0.55 let the basemap read
       through strongly enough that the 震度 colours were hard to tell apart, which is the report;
       0.85 keeps the coastline and the place names legible underneath while the colour is the colour
       of the class. The slider writes straight to the layer — no rebuild, so it is instant. */
    let fldOpacity=0.85;
    function paintField(){
      try{
        if(!fld||!fld.url){ if(GE().layers.has(LYR_IMG)) GE().layers.remove(LYR_IMG);
          if(GE().layers.hasSource(SRC_IMG)) GE().layers.removeSource(SRC_IMG); return; }
        if(!_imCanDraw()) return;
        if(GE().layers.hasSource(SRC_IMG)){
          const ok=GE().layers.updateImage&&GE().layers.updateImage(SRC_IMG,{url:fld.url,coordinates:fld.coords});
          if(ok===false){ try{ GE().layers.remove(LYR_IMG); }catch(_){} try{ GE().layers.removeSource(SRC_IMG); }catch(_){} }
        }
        if(!GE().layers.hasSource(SRC_IMG)){
          GE().layers.addSource(SRC_IMG,{type:'image',url:fld.url,coordinates:fld.coords});
          GE().layers.add({id:LYR_IMG,type:'raster',source:SRC_IMG,
            paint:{'raster-opacity':fldOpacity,'raster-fade-duration':0}},
            GE().layers.has('seis-ring')?'seis-ring':undefined);
        }
        setFieldOpacity(fldOpacity);
      }catch(_){}
    }
    function setFieldOpacity(v){ fldOpacity=Math.max(0.05,Math.min(1,+v||0));
      try{ if(GE().layers.has(LYR_IMG)) GE().layers.setPaint(LYR_IMG,'raster-opacity',fldOpacity); }catch(_){}
      try{ if(GE().layers.has(LYR_FAR)) GE().layers.setPaint(LYR_FAR,'raster-opacity',fldOpacity); }catch(_){}   /* (#R191) the far annulus is the same field — one slider */
      return fldOpacity; }
    /* ══ (#R191) THE FAR FIELD: A WHOLE-WORLD RASTER, BECAUSE A BOX CANNOT HOLD IT ══════════════════
       Past MMI_TERRAIN_KM there is no terrain to read — one cell is wider than the landforms that would
       vary inside it — so the field there is a function of DISTANCE ALONE. That is what makes this
       cheap, and it is also what makes it honest: nothing is being invented about ground it cannot see.

       ⚠ IT IS NOT A BOX. An M9's lowest class reaches 7,100 km; centred on Japan that is 81° of
       longitude either side, which runs off the antimeridian, and 64° of latitude, which runs off the
       Mercator cap — the exact family of failures #R189 documented for wavefronts (a ring that wrapped
       swept the whole map; one containing a pole never closed). A whole-world raster in Mercator y has
       no box to wrap: every cell is a real place, every distance is a real great circle, and the poles
       are simply the rows at ±85° like any other.

       COST. 768² cells with a spherical distance each would be ~3.5 M trigonometric calls; the grid is
       regular, so cos(Δλ) is per COLUMN and sin/cos(φ) per ROW, leaving two multiplies and one acos per
       cell. Measured at ~40 ms for the whole world. Δ here is always > 13°, where acos is fine — the
       near field uses haversine for the opposite reason (#R189: acos loses precision at small Δ).

       The cells the FINE image owns are skipped, both inside its radius and inside its box, so this
       never shows through the holes the fine field leaves over the sea. */
    const SRC_FAR='seis-far-img', LYR_FAR='seis-mmi-far';
    let fldFar=null;
    function paintFar(){
      try{
        if(!fldFar||!fldFar.url){ if(GE().layers.has(LYR_FAR)) GE().layers.remove(LYR_FAR);
          if(GE().layers.hasSource(SRC_FAR)) GE().layers.removeSource(SRC_FAR); return; }
        if(!_imCanDraw()) return;
        if(GE().layers.hasSource(SRC_FAR)){
          const ok=GE().layers.updateImage&&GE().layers.updateImage(SRC_FAR,{url:fldFar.url,coordinates:fldFar.coords});
          if(ok===false){ try{ GE().layers.remove(LYR_FAR); }catch(_){} try{ GE().layers.removeSource(SRC_FAR); }catch(_){} }
        }
        if(!GE().layers.hasSource(SRC_FAR)){
          GE().layers.addSource(SRC_FAR,{type:'image',url:fldFar.url,coordinates:fldFar.coords});
          /* under the fine field, which is added before it and therefore sits above */
          GE().layers.add({id:LYR_FAR,type:'raster',source:SRC_FAR,
            paint:{'raster-opacity':fldOpacity,'raster-fade-duration':0}},
            GE().layers.has(LYR_IMG)?LYR_IMG:(GE().layers.has('seis-ring')?'seis-ring':undefined));
        }
        try{ GE().layers.setPaint(LYR_FAR,'raster-opacity',fldOpacity); }catch(_){}
      }catch(_){}
    }
    async function buildFar(prof,box,rFine,rEdge,seq){
      fldFar=null;
      if(!epi||!(rEdge>rFine+1)){ paintFar(); return; }
      const C0=fault?fault.centroid:epi;
      const NF=(typeof isMobile==='function'&&isMobile())?384:768;
      const yT=mY(85), yB=mY(-85), dyF=(yB-yT)/NF, dxF=360/NF;
      const cv=document.createElement('canvas'); cv.width=NF; cv.height=NF;
      const ctx=cv.getContext('2d'), im=ctx.createImageData(NF,NF), px=im.data;
      const hx=(h)=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
      /* ⚠ (#R191) AND IT MUST NOT PAINT THE SEA, BECAUSE THE FINE FIELD DOES NOT.
         The first version skipped the land test — there is no DEM at this scale — and the result was a
         grey RECTANGLE punched through the middle of the rings: the fine field's box, where the ocean
         is left unpainted, surrounded by far-field colour that covered the same ocean. Two rules for
         one picture is worse than either rule.
         A whole-world land mask does not need the terrain, only its sign, so it is read at z3: 64 tiles
         cover the Earth at ~20 km a pixel, which is finer than this raster's own 52 km cell and about
         one twentieth of the tile budget. Phones take z2 (16 tiles) against their 104 km cell. If fewer
         than half the tiles answer, the mask is not used at all and `landMask` says so — a half-loaded
         coastline would carve holes that look like data. */
      const zc=(typeof isMobile==='function'&&isMobile())?2:3;
      let land=null;
      try{
        const pts=[]; const step=180/(1<<zc);
        for(let la=-80;la<=80;la+=step/2) for(let lo=-180;lo<180;lo+=step/2) pts.push([lo,la]);
        await warmDEMTiles(pts,zc,9000,null);
        if(seq!==fldSeq) return;
        const sn=(typeof demSnapshot==='function')?demSnapshot(-180,-85,180,85,zc):null;
        if(sn&&sn.have>=sn.want*0.5) land=sn;
      }catch(_){}
      const la0=C0[1]*D, sinA=Math.sin(la0), cosA=Math.cos(la0);
      const cosDL=new Float64Array(NF);
      for(let i=0;i<NF;i++) cosDL[i]=Math.cos((-180+(i+0.5)*dxF-C0[0])*D);
      let painted=0, extrap=0, seaSkipped=0;
      for(let j=0;j<NF;j++){
        const la=latOfY(yT+(j+0.5)*dyF), lb=la*D, sinB=Math.sin(lb), cosB=Math.cos(lb);
        for(let i=0;i<NF;i++){
          const c=Math.max(-1,Math.min(1,sinA*sinB+cosA*cosB*cosDL[i]));
          const km=Math.acos(c)*RE;
          if(km<=rFine||km>rEdge) continue;
          const lo=-180+(i+0.5)*dxF;
          if(lo>=box.W&&lo<=box.E&&la>=box.Ss&&la<=box.Nn) continue;   /* the fine image owns this */
          if(land){ const e=land.at(lo,la); if(e==null||e<=0){ seaSkipped++; continue; } }
          const rM=Math.sqrt(km*km+depthKm*depthKm)*1000;
          const pgv=prof.at(rM);
          const I=(scale==='jma')?jmaI(pgv):mmiOf(pgv);
          const cl=(scale==='jma')?jmaClass(I):mmiClass(I);
          if(!cl) continue;
          const o=(j*NF+i)*4, rgb=hx(cl.col);
          px[o]=rgb[0]; px[o+1]=rgb[1]; px[o+2]=rgb[2]; px[o+3]=235; painted++;
          if(km>MMI_CALIB_KM) extrap++;
        }
        if((j&63)===63){ await new Promise(r=>setTimeout(r,0)); if(seq!==fldSeq) return; }
      }
      if(seq!==fldSeq) return;
      ctx.putImageData(im,0,0);
      fldFar={ url:cv.toDataURL('image/png'), coords:[[-180,85],[180,85],[180,-85],[-180,-85]],
               N:NF, painted, extrap, sea:seaSkipped, landMask:!!land, landZoom:zc,
               rFineKm:Math.round(rFine), rEdgeKm:Math.round(rEdge) };
      paintFar();
    }
    /* ══ (#R190) THE FIELD IS COMPUTED WHEN IT IS ASKED FOR ═══════════════════════════════════════
       「計算開始ボタンを設置し、LOC方式でローディング表示もして。」 (confirmed: the Line-of-Sight
       style — a real percentage and a progress bar.) Every parameter used to kick off a full DEM read
       260 ms after it was touched, so dragging the magnitude spinner queued a dozen terrain reads and
       the panel spent its life saying 「読み込み中」. Now the physics controls mark the field STALE
       and the ▶ button computes it. `schedField` remains the internal entry point so the callable API
       (setParams / setFault / Atlas) behaves exactly as it did — the button is for the human. */
    let fldStale=false, fldPct=0;
    function markStale(){ fldStale=true; if(opened) report(); }
    function schedField(){ clearTimeout(fldT); fldT=setTimeout(()=>{ buildField(); },260); }
    async function buildField(){
      const seq=++fldSeq;
      if(!epi){ fld=null; fldFar=null; paintField(); paintFar(); return; }
      fldBusy=true; fldStale=false; fldPct=0; if(opened) report();
      const t0=performance.now();
      const prog=(p)=>{ fldPct=Math.max(0,Math.min(100,Math.round(p))); if(opened) _setProg(); };
      try{
        const prof=pgvProfile();
        const ampRef=siteAmp();
        /* how far anything at all is painted: the softest plausible site against the lowest class.
           (#R191) inverted from the SAME conversions the colours use (pgvAtJMA / pgvAtMMI), so the
           edge follows the relation instead of repeating two of its constants. */
        const floorPgv=(scale==='jma')?PGV_FLOOR_JMA:PGV_FLOOR_MMI;
        const ampMax=ampOf(180);
        let rEdge=30;
        for(let k=prof.rr.length-1;k>=0;k--){ if(prof.out[k]*(ampMax/ampRef)>=floorPgv){ rEdge=Math.max(30,prof.rr[k]); break; } }
        rEdge=Math.min(rEdge,MMI_MAX_KM);
        /* (#R191) the FINE field is bounded by the terrain, not by the class — see MMI_TERRAIN_KM.
           Everything past it is the far field, which needs no DEM and is drawn by buildFar(). */
        const rFine=Math.min(rEdge,MMI_TERRAIN_KM);
        const C0=fault?fault.centroid:epi;
        let halfKm=rFine; if(fault){ let mx=0; fault.ring.forEach(p=>{ const d2=gcDelta(C0,p)*D*RE; if(d2>mx) mx=d2; }); halfKm+=mx; }
        const cosC=Math.max(0.1,Math.cos(C0[1]*D));
        const dLng=halfKm/(111.32*cosC), dLat=halfKm/110.574;
        const W=C0[0]-dLng, E=C0[0]+dLng;
        const Nn=Math.min(85,C0[1]+dLat), Ss=Math.max(-85,C0[1]-dLat);
        /* (#R190) MORE CELLS. 176 across a 2,000 km field is an 11 km cell, which is coarser than the
           terrain the site term is read off — the picture was quantised well below the information in
           it. 288 on desktop is 2.7× the cells for 2.7× the work, which the ms figure in the panel
           reports as always; phones stay proportionally smaller. */
        const N=(typeof isMobile==='function'&&isMobile())?128:288;
        const y0=mY(Nn), y1=mY(Ss), dy=(y1-y0)/N, dx=(E-W)/N;
        const spanKm=2*halfKm;
        let z=Math.max(4,Math.min(12,(_demZoomForSpan?_demZoomForSpan(Math.max(1,spanKm)):7)+1));
        const est=(zz)=>{ const tk=40075*cosC/Math.pow(2,zz); const nn=spanKm/tk+1; return nn*nn*0.85; };
        while(z>4&&est(z)>520) z--;
        try{
          const warm=[]; for(let j=0;j<=32;j++) for(let i=0;i<=32;i++)
            warm.push([W+(E-W)*i/32, Math.max(-85,Math.min(85,latOfY(y0+(y1-y0)*j/32)))]);
          prog(6);
          /* (#R190) 20 s was the whole of a slow build: the timeout, not the arithmetic. A field this
             wide is answered by whatever arrived — the cells that did not are counted and declared. */
          await warmDEMTiles(warm,z,12000,(f)=>prog(6+34*(+f||0)));
        }catch(_){}
        prog(40);
        if(seq!==fldSeq) return;
        /* ⚠ (#R190) THE FIELD STORES PGV, NOT AN INTENSITY. It used to store the intensity of the
           scale that happened to be active when it was built, and the cursor readout then read that
           array — so switching MMI→JMA reported an MMI number as a 震度 (measured: 8.63 → 「震度7」)
           until the next rebuild. PGV is what the model computes; both scales are one line from it.
           The PAINT still belongs to the scale it was drawn for, and `fld.scale` records which. */
        const vs=new Float32Array(N*N), pgvArr=new Float32Array(N*N);
        let painted=0, sea=0, noDem=0, coarse=0, beyondCalib=0;
        /* ══ (#R190) A SLOPE MEASURED FINER THAN THE DATA IS NOT A SLOPE ═══════════════════════════
           Wald & Allen's Vs30 proxy is regressed on slope at ~30 arc-seconds (≈900 m), and #R189 asked
           the DEM for exactly that baseline — at whatever zoom the tile budget allowed. At the zooms a
           continental field actually uses, one DEM pixel is kilometres across, so a ±900 m pair lands
           INSIDE one pixel and comes back with the interpolated (i.e. flattened) gradient. A flattened
           gradient is a small slope, a small slope is the softest Vs30 bin, and the softest bin is the
           largest amplification — so the coarser the field, the softer the whole world got. That is a
           systematic bias, not noise, and it ran in the direction that makes the map look worst.
           Two things fix it: measure the slope over the DEM'S OWN sample spacing when that is coarser
           than 900 m (a real gradient at a stated scale, rather than a fictional one at 900 m), and
           when the spacing is coarser than 2 km, do not pretend at all — fall back to the panel's site
           class for that cell and COUNT it, the way a missing DEM is counted. */
        const demSpacingM=40075017*Math.max(0.05,cosC)/(Math.pow(2,z)*256);
        const dsM=Math.max(900,demSpacingM*1.25), slopeUsable=demSpacingM<=2000;
        const dLngS=dsM/(111320*cosC), dLatS=dsM/110574;
        const cv=document.createElement('canvas'); cv.width=N; cv.height=N;
        const ctx=cv.getContext('2d'), im=ctx.createImageData(N,N), px=im.data;
        const hex=(h)=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
        /* ⚠ (#R191) EVERY ELEVATION IN THIS LOOP COMES OUT OF ONE FROZEN SET OF TILES. The loop yields
           to the event loop every eight rows, and the shared DEM cache changes between yields — tiles
           arrive, and `_demCacheTrim` evicts. That made a row's answer depend on WHEN it was computed,
           in bands as wide as the yield interval: the reported 縞々. See demSnapshot in map-readout.js.
           The old `demElevAt` fallback is gone with it: it was a REQUEST, so it was also what pushed
           the cache past its budget and evicted the tiles this very field was reading. */
        const snap=(typeof demSnapshot==='function')?demSnapshot(W,Ss,E,Nn,z):null;
        const demAt=snap?((lo,la)=>snap.at(lo,la)):((lo,la)=>demElevBilinear(lo,la,z));
        for(let j=0;j<N;j++){
          const la=latOfY(y0+(j+0.5)*dy);
          for(let i=0;i<N;i++){
            const lo=W+(i+0.5)*dx, k=j*N+i, o=k*4;
            const km=distKmTo(lo,la);
            if(km>MMI_MAX_KM){ vs[k]=0; continue; }
            const e0=demAt(lo,la);
            let amp;
            if(e0==null){ noDem++; vs[k]=0; amp=ampRef; }
            else if(e0<=0){ sea++; vs[k]=-1; continue; }
            else if(!slopeUsable){ coarse++; vs[k]=0; amp=ampRef; }   /* (#R190) see the note by dsM */
            else {
              let ex=demAt(lo+dLngS,la); if(ex==null) ex=e0;
              let ey=demAt(lo,Math.max(-85,Math.min(85,la+dLatS))); if(ey==null) ey=e0;
              const slope=Math.hypot(ex-e0,ey-e0)/dsM;
              const v=vs30FromSlope(slope); vs[k]=v; amp=ampOf(v);
            }
            const rM=Math.sqrt(km*km+depthKm*depthKm)*1000;
            const pgv=prof.at(rM)*(amp/ampRef);
            pgvArr[k]=pgv;
            const I=(scale==='jma')?jmaI(pgv):mmiOf(pgv);
            const cls=(scale==='jma')?jmaClass(I):mmiClass(I);
            if(!cls) continue;
            if(km>MMI_CALIB_KM) beyondCalib++;   /* (#R190) drawn, and declared as extrapolated */
            const c=hex(cls.col); px[o]=c[0]; px[o+1]=c[1]; px[o+2]=c[2]; px[o+3]=235; painted++;
          }
          if((j&7)===7){ prog(40+58*(j+1)/N); await new Promise(r=>setTimeout(r,0)); if(seq!==fldSeq) return; }
        }
        ctx.putImageData(im,0,0);
        prog(99);
        fld={ url:cv.toDataURL('image/png'),
          coords:[[W,Nn],[E,Nn],[E,Ss],[W,Ss]],
          W, E, y0, dy, dx, N, vs, pgv:pgvArr, z, scale,
          vs30At(lo,la){ const i=Math.floor((lo-this.W)/this.dx), j=Math.floor((mY(la)-this.y0)/this.dy);
            if(i<0||j<0||i>=this.N||j>=this.N) return null; const v=this.vs[j*this.N+i]; return v>0?v:null; },
          /* (#R190) the PGV the FIELD computed at one point — what the readout under the cursor
             converts, so the number in the corner and the colour on the map come from the same cell
             and cannot drift apart (#R136's lesson: a detector and a painter written twice). */
          pgvAt(lo,la){ const i=Math.floor((lo-this.W)/this.dx), j=Math.floor((mY(la)-this.y0)/this.dy);
            if(i<0||j<0||i>=this.N||j>=this.N) return null; const v=this.pgv[j*this.N+i]; return v>0?v:null; },
          stats:{ cells:N*N, painted, sea, noDem, coarse, beyondCalib, calibKm:MMI_CALIB_KM, z, demSpacingM:Math.round(demSpacingM),
                  slopeBaselineM:Math.round(dsM), slopeUsable,
                  spanKm:Math.round(spanKm), rEdgeKm:Math.round(rEdge), rFineKm:Math.round(rFine),
                  demTiles:snap?snap.have:null, demTilesMissing:snap?snap.missing:null,
                  terrain:(noDem+coarse)<N*N*0.5, ms:Math.round(performance.now()-t0) } };
        paintField();
        /* (#R191) …and the annulus the terrain cannot reach, out to the end of the lowest class */
        await buildFar(prof,{W,E,Ss,Nn},rFine,rEdge,seq);
        if(fld&&fld.stats) fld.stats.ms=Math.round(performance.now()-t0);
        prog(100);
      } finally { if(seq===fldSeq){ fldBusy=false;
        /* (#R190) the build warmed the DEM around the epicentre, so the tsunami screening may have an
           answer now that it did not have when the panel was drawn — see syncTsunami. */
        const _t=!!tsunamiCase();
        if(opened&&_t!==_tsuShown){ _tsuShown=_t; render(); } else if(opened) report(); } }
    }

    function ensure(){ try{ if(!_imCanDraw()) return false;
      if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      /* (#R189) the intensity CONTOUR LINES ('seis-mmi' + labels) are gone — the intensity is the
         painted field (see buildField/paintField), which is what the instruction asks for. */
      if(!GE().layers.has('seis-fault-fill')) GE().layers.add({id:'seis-fault-fill',type:'fill',source:SRC,filter:['==',['get','kind'],'fault'],
        paint:{'fill-color':'#ff3b30','fill-opacity':0.13}});
      if(!GE().layers.has('seis-fault-line')) GE().layers.add({id:'seis-fault-line',type:'line',source:SRC,filter:['==',['get','kind'],'fault'],
        paint:{'line-color':'#ff3b30','line-width':1.8,'line-dasharray':[2,1.5],'line-opacity':0.9}});
      if(!GE().layers.has('seis-ring')) GE().layers.add({id:'seis-ring',type:'line',source:SRC,filter:['==',['get','kind'],'ring'],
        paint:{'line-color':['get','col'],'line-width':['get','w'],'line-opacity':0.92}});
      if(!GE().layers.has('seis-sta')) GE().layers.add({id:'seis-sta',type:'circle',source:SRC,filter:['==',['get','kind'],'station'],
        paint:{'circle-radius':5,'circle-color':'#ffffff','circle-stroke-color':'#222','circle-stroke-width':1.6}});
      if(!GE().layers.has('seis-epi')) GE().layers.add({id:'seis-epi',type:'circle',source:SRC,filter:['==',['get','kind'],'epi'],
        paint:{'circle-radius':7,'circle-color':'#ff3b30','circle-stroke-color':'#fff','circle-stroke-width':2.4}});
      return true; }catch(_){ return false; } }
    function setData(f){ try{ if(ensure()) GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:f||[]}); }catch(_){} }

    /* The radius at which MMI falls through each integer — the spatial answer to 「推定震度」.
       ⚠ (#R190) These are QUOTED NUMBERS, like the table, so they live inside MMI_CALIB_KM and not
       inside the painting limit. Splitting the two constants moved this by accident and tests/r176 ⑤
       caught it immediately (a ring at 1,129 km against its "stay inside the model's stated range"
       assertion). The painted field may reach further BECAUSE it is labelled an extrapolation on
       screen; a number in a list carries no such label, so it does not go there. */
    function mmiRings(){ const out=[]; if(!epi) return out;
      const peak=motion(mw,depthKm*1000).mmi;
      const maxDeg=MMI_CALIB_KM/(RE*D);
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
    /* (#R189) initial great-circle bearing — for the finite-source front envelope below */
    function bearingTo(a,b){ const la1=a[1]*D, la2=b[1]*D, dl=(b[0]-a[0])*D;
      return (Math.atan2(Math.sin(dl)*Math.cos(la2),Math.cos(la1)*Math.sin(la2)-Math.sin(la1)*Math.cos(la2)*Math.cos(dl))/D+360)%360; }
    /* ══ (#R189) A FINITE SOURCE HAS A FINITE FRONT ══════════════════════════════════════════════
       With a drawn rupture the front at time t is the ENVELOPE of the fronts from every point of
       the rupture, each delayed by the rupture's own propagation from the hypocentre (Vr = 0.75β).
       The envelope of a union of circles is evaluated as its support function per bearing —
       exact for the convex hull of the union, which is what a wavefront looks like within the
       sampling of the ring — and the hypocentre's own circle keeps every bearing defined. The ring
       is built in CONTINUOUS longitude and split at the seam by the same helper every other ring
       uses, so the polar/antimeridian behaviour is identical to ringLines(). */
    function faultFrontLines(radiusAtDelay){
      const r0=radiusAtDelay(0); if(r0==null) return null;
      const K=[{off:0,phi:0,delay:0}];
      if(fault&&fault.ring&&fault.ring.length>=3){
        const R2=fault.ring, step=Math.max(1,Math.floor(R2.length/20));
        for(let i=0;i<R2.length;i+=step){ const p=R2[i];
          K.push({ off:gcDelta(epi,p), phi:bearingTo(epi,p), delay:gcDelta(epi,p)*D*RE/VRUP_KMS }); } }
      const NB2=144, ringPts=[]; let prev=null;
      for(let a2=0;a2<=NB2;a2++){ const b=a2*360/NB2; let R=r0;
        for(let k2=1;k2<K.length;k2++){ const k=K[k2], r=radiusAtDelay(k.delay); if(r==null) continue;
          const cand=k.off*Math.cos((b-k.phi)*D)+r; if(cand>R) R=cand; }
        const p=destAng(epi,b,Math.min(179.9,Math.max(0.02,R)));
        let lo=p[0]; if(prev!=null){ while(lo-prev>180)lo-=360; while(lo-prev<-180)lo+=360; }
        ringPts.push([lo,p[1]]); prev=lo; }
      try{ const w=HOST._splitLineToWindows(ringPts); if(w&&w.length) return w; }catch(_){}
      return [ringPts.map(p=>[((p[0]+540)%360)-180,p[1]])];
    }
    /* the wavefront features alone — cheap enough for a real-time tick (the intensity field and the
       report do NOT depend on tSec, so the playback loop calls this and only this) */
    function drawFronts(){
      if(!epi){ setData([]); return; }
      const feats=[{type:'Feature',geometry:{type:'Point',coordinates:epi},properties:{kind:'epi'}}];
      if(fault&&fault.ring&&fault.ring.length>=3)
        feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[...fault.ring,fault.ring[0]]]},properties:{kind:'fault'}});
      const emit=(lines,props)=>{ (lines||[]).forEach(seg=>feats.push({type:'Feature',geometry:{type:'LineString',coordinates:seg},properties:props})); };
      PH.forEach(ph=>{ const rad=(delay)=>{ const d=frontDelta(ph.k,depthKm,Math.max(0,tSec-delay)); return (d!=null&&d>0.02)?d:null; };
        const lines=fault?faultFrontLines(rad):((rad(0)!=null)?ringLines(epi,rad(0)):null);
        if(lines) emit(lines,{kind:'ring',col:ph.col,w:ph.w}); });
      /* surface waves — group velocity along the great circle, not ray theory */
      [['#0a84ff',3.5],['#bf5af2',4.4]].forEach(([col,vkm])=>{
        const rad=(delay)=>{ const d=(vkm*Math.max(0,tSec-delay))/(RE*D); return (d>0.02&&d<179)?d:null; };
        const lines=fault?faultFrontLines(rad):((rad(0)!=null)?ringLines(epi,rad(0)):null);
        if(lines) emit(lines,{kind:'ring',col,w:1.8}); });
      stations.forEach(s=>feats.push({type:'Feature',geometry:{type:'Point',coordinates:[s.lng,s.lat]},properties:{kind:'station'}}));
      setData(feats);
    }
    function draw(){ drawFronts(); report(); }

    /* ---- the answer for one place ----------------------------------------------------------------- */
    function at(lng,lat){
      if(!epi) return null;
      /* travel times run from the HYPOCENTRE (where the rupture starts); the shaking runs from the
         RUPTURE (Rrup — zero over the drawn fault), which is what a finite source means (#R189) */
      const deg=gcDelta(epi,[lng,lat]), kmEpi=deg*D*RE;
      const km=distKmTo(lng,lat);
      const rM=Math.sqrt(km*km+depthKm*depthKm)*1000;
      const tP=arrival('P',depthKm,deg), tS=arrival('S',depthKm,deg);
      const tR=kmEpi/3.5, tL=kmEpi/4.4;
      const m=motion(mw,rM);
      /* (#R189) the ground under THIS point, when the field has read it off the DEM */
      let vs30=null;
      try{ if(fld&&fld.vs30At){ vs30=fld.vs30At(lng,lat); } }catch(_){}
      let pgv=m.pgv, pga=m.pga, pgaG=m.pgaG;
      if(vs30){ const f=ampOf(vs30)/m.amp; pgv*=f; pga*=f; pgaG*=f; }
      /* (#R191) …through mmiOf, like every other reader. This was the THIRD copy of the conversion
         (#R190 found two), and it is exactly why a copy is dangerous: it kept Wald 1999 while the
         model moved to Worden 2012, so the table and the map would have disagreed by a class. */
      const mmi=mmiOf(pgv);
      const jma=jmaI(pgv);
      const calibrated=(m.inRange&&pgv>=PGV_FELT&&mmi<=9.5);
      /* the ground is moving from S until the surface train has passed, plus the rupture's own length */
      const dur=(tS!=null)?Math.max(m.srcDurS, (tR-tS)+m.srcDurS):m.srcDurS;
      return { deg, km, tP, tS, tRayleigh:tR, tLove:tL, durS:dur, mmi, jma, vs30, pgv, pga, pgaG,
        inRange:m.inRange, calibrated };   /* carried through, or the table prints an intensity the model does not claim */
    }
    const fmtT=s=>{ if(s==null||!isFinite(s)) return '—'; let t=Math.round(s); const m=Math.floor(t/60), ss=t%60;
      return m?(m+'m '+String(ss).padStart(2,'0')+'s'):(ss+'s'); };   /* round first, or 13m 59.6s prints "13m 60s" */

    /* ---- panel ------------------------------------------------------------------------------------ */
    const NUM='width:84px;height:26px;border-radius:7px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;padding:0 6px;box-sizing:border-box;';
    const ROW='font-size:11.5px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;gap:8px;';
    const BTN='padding:6px 8px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:11.5px;cursor:pointer;';
    /* (#R189) every control that changes the PHYSICS goes through this — redraw, re-report, and
       rebuild the painted field (debounced; the wavefront tick never comes through here).
       (#R190) `refresh` stays the CALLABLE path (Atlas, setParams, a picked epicentre): those are
       explicit requests for an answer, so they still compute. The panel's own spinners call
       `touch()` instead, which marks the field stale and waits for the ▶ button — see markStale. */
    function refresh(){ draw(); warmEpi(); schedField(); }
    function touch(){ draw(); warmEpi(); markStale(); }
    function render(){ if(!panel) return;
      panel.innerHTML='<div class="sq-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;">'
        +'<span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">🌐 '+L('Seismic waves','地震波シミュレーター','Seismische Wellen','Сейсмические волны','Ondas sísmicas')+'</span>'
        +'<button class="sq-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>'
        +'<div style="padding:10px 12px;display:flex;flex-direction:column;gap:9px;max-height:min(72vh,640px);overflow-y:auto;">'
        +'<button class="sq-pick" style="'+BTN+'width:100%;background:var(--primary-color);color:#fff;border:none;font-weight:700;">◎ '+L('Place the epicentre','震源地を設置','Epizentrum setzen','Указать эпицентр','Colocar el epicentro')+'</button>'
        /* (#R189) the free-drawn rupture: draw → capture, slip → Mw */
        +'<div style="display:flex;gap:5px;">'
          +'<button class="sq-fdraw" style="'+BTN+'flex:1;">'+(_fDrawing
              ?('✔ '+L('Use the drawn area','描いた範囲を取り込む','Gezeichnete Fläche übernehmen','Взять нарисованную область','Usar el área dibujada'))
              :('✏ '+L('Draw the rupture area','震源域をフリーで描く','Bruchfläche zeichnen','Нарисовать очаг','Dibujar la ruptura')))+'</button>'
          +(fault?('<button class="sq-fclear" style="'+BTN+'">✕</button>'):'')
        +'</div>'
        +'<label style="'+ROW+'">'+L('Average slip (m)','平均すべり量 (m)','Mittlerer Versatz (m)','Средняя подвижка (м)','Deslizamiento medio (m)')+'<input class="sq-slip" type="number" min="0.1" max="80" step="0.1" value="'+faultSlip+'" style="'+NUM+'"></label>'
        +(fault?('<div class="sq-finfo" style="font-size:11px;color:var(--text-muted);">'
          +L('Rupture','震源域','Bruchfläche','Очаг','Ruptura')+' '+Math.round(fault.areaKm2).toLocaleString()+' km² · D̄ '+fault.slipM+' m → <b style="color:var(--text-main);">M'+fault.mw.toFixed(1)+'</b> (M₀ '+fault.M0.toExponential(2)+' N·m)</div>'):'')
        +'<label style="'+ROW+'">'+L('Depth (km)','深さ (km)','Tiefe (km)','Глубина (км)','Profundidad (km)')+'<input class="sq-d" type="number" min="0" max="700" step="5" value="'+depthKm+'" style="'+NUM+'"></label>'
        +'<label style="'+ROW+'">'+L('Magnitude (Mw)','規模 (Mw)','Magnitude (Mw)','Магнитуда (Mw)','Magnitud (Mw)')+'<input class="sq-m" type="number" min="3" max="9.6" step="0.1" value="'+mw.toFixed(1)+'"'+(fault?' disabled title="'+L('Set by the drawn rupture — remove it to edit','描いた震源域から決まります（解除で編集可）','Durch die Bruchfläche bestimmt','Задана нарисованным очагом','Fijada por la ruptura dibujada')+'"':'')+' style="'+NUM+'"></label>'
        +'<label style="'+ROW+'">'+L('Stress drop (MPa)','応力降下量 (MPa)','Spannungsabfall (MPa)','Сброс напряжений (МПа)','Caída de esfuerzo (MPa)')+'<input class="sq-sd" type="number" min="0.3" max="30" step="0.5" value="'+stressDropMPa+'" style="'+NUM+'"></label>'
        /* (#R189) which intensity scale is spoken — MMI, or the JMA scale via the PGV conversion */
        +'<label style="'+ROW+'">'+L('Intensity scale','震度階級','Intensitätsskala','Шкала интенсивности','Escala de intensidad')
          +'<select class="sq-scale" style="'+NUM+'width:132px;">'
          +'<option value="mmi"'+(scale==='mmi'?' selected':'')+'>MMI</option>'
          +'<option value="jma"'+(scale==='jma'?' selected':'')+'>'+L('JMA (shindo)','気象庁震度','JMA (Shindo)','JMA (синдо)','JMA (shindo)')+'</option>'
          +'</select></label>'
        +'<label style="'+ROW+'">'+L('Ground (no-DEM fallback)','地盤（DEM欠損時）','Untergrund (ohne DEM)','Грунт (без DEM)','Terreno (sin DEM)')
          +'<select class="sq-site" style="'+NUM+'width:132px;">'
          +'<option value="hard">'+L('hard rock (Vs30 1500)','固い岩盤 (Vs30 1500)','Festgestein (Vs30 1500)','скала (Vs30 1500)','roca dura (Vs30 1500)')+'</option>'
          +'<option value="rock">'+L('rock (Vs30 760)','岩盤 (Vs30 760)','Fels (Vs30 760)','порода (Vs30 760)','roca (Vs30 760)')+'</option>'
          +'<option value="stiff">'+L('stiff soil (Vs30 360)','硬い地盤 (Vs30 360)','steifer Boden (Vs30 360)','плотный грунт (Vs30 360)','suelo firme (Vs30 360)')+'</option>'
          +'<option value="soft">'+L('soft soil (Vs30 180)','軟弱地盤 (Vs30 180)','weicher Boden (Vs30 180)','мягкий грунт (Vs30 180)','suelo blando (Vs30 180)')+'</option>'
          +'</select></label>'
        /* (#R190) the crustal Q — the assumption the far field is most sensitive to, kept visible and
           adjustable like the stress drop above (see the note by QS0). */
        +'<label style="'+ROW+'">'+L('Crustal Q = Q₀·f^η','地殻の Q = Q₀·f^η','Krusten-Q = Q₀·f^η','Q коры = Q₀·f^η','Q cortical = Q₀·f^η')
          +'<span style="display:flex;gap:5px;"><input class="sq-q0" type="number" min="30" max="2000" step="10" value="'+QS0+'" title="Q₀" style="'+NUM+'width:62px;">'
          +'<input class="sq-qe" type="number" min="0" max="1" step="0.05" value="'+QETA+'" title="η" style="'+NUM+'width:62px;"></span></label>'
        /* ══ (#R190) 「震度の塗は透明度選択を可能に」 ═══════════════════════════════════════════════ */
        +'<label style="'+ROW+'">'+L('Intensity fill opacity','震度分布の不透明度','Deckkraft der Fläche','Непрозрачность заливки','Opacidad del relleno')
          +'<span style="display:flex;align-items:center;gap:6px;flex:1;justify-content:flex-end;">'
          +'<input type="range" class="sq-op" min="5" max="100" step="5" value="'+Math.round(fldOpacity*100)+'" style="width:112px;">'
          +'<b class="sq-opv" style="min-width:34px;text-align:right;color:var(--text-main);">'+Math.round(fldOpacity*100)+'%</b></span></label>'
        /* ══ (#R190) 「計算開始ボタンを設置し、LOC方式でローディング表示もして」 (LOS style: real % + bar) */
        +'<button class="sq-run" style="'+BTN+'width:100%;background:var(--primary-color);color:#fff;border:none;font-weight:700;">▶ '
          +L('Compute the intensity map','震度分布を計算','Intensitätskarte berechnen','Рассчитать поле интенсивности','Calcular el mapa de intensidad')+'</button>'
        +'<div class="sq-prog" style="display:none;">'
          +'<div class="sq-progl" style="margin-bottom:4px;font-size:11px;color:var(--text-muted);"></div>'
          +'<div style="height:7px;border-radius:4px;background:rgba(128,128,128,0.22);overflow:hidden;">'
          +'<i class="sq-progb" style="display:block;height:100%;width:0%;background:linear-gradient(90deg,#ffd23f,#ff6b3d);transition:width 0.15s;"></i></div></div>'
        /* (#R189) real-time playback with a visible rate */
        +'<div style="display:flex;align-items:center;gap:8px;"><button class="sq-play" style="'+BTN+'width:36px;">▶</button>'
          +'<input type="range" class="sq-t" min="0" max="'+MAXT+'" step="1" value="'+Math.round(tSec)+'" style="flex:1;">'
          +'<select class="sq-spd" style="'+NUM+'width:70px;">'+SPEEDS.map(v=>'<option value="'+v+'"'+(v===speed?' selected':'')+'>×'+v+'</option>').join('')+'</select>'
          +'<span class="sq-tv" style="font-size:12px;font-weight:700;color:var(--text-main);min-width:52px;text-align:right;">'+fmtT(tSec)+'</span></div>'
        +'<button class="sq-real" style="'+BTN+'width:100%;">🌎 '+L('Load a recent real earthquake','最近の実際の地震を読み込む','Echtes Beben laden','Загрузить реальное землетрясение','Cargar un sismo real')+'</button>'
        /* ══ (#R190) 「津波が発生するとされるような地震だった場合、津波シミュレーターも使えるように。」
           Shown only when THIS event meets the tsunamigenic conditions (see tsunamiCase): the app
           already owns an inundation model driven by the real DEM (js/sims.js, hazard 'tsunami'), so
           this hands it the epicentre and a wave height derived from the same source parameters —
           it does not add a second model. */
        +(function(){ const t=tsunamiCase(); return t?('<button class="sq-tsu" style="'+BTN+'width:100%;background:rgba(10,132,255,0.16);border-color:rgba(10,132,255,0.5);">🌊 '
          +L('Open the tsunami simulator','津波シミュレーターを開く','Tsunami-Simulator öffnen','Открыть симулятор цунами','Abrir el simulador de tsunami')
          +' <span style="opacity:0.75;">('+L('est. wave','推定波高','geschätzt','оценка','estim.')+' ~'+t.waveM+' m)</span></button>'
          +'<div style="font-size:10px;color:var(--text-muted);margin-top:-3px;">'+t.why+'</div>'):''; })()
        +'<div class="sq-leg" style="display:flex;flex-wrap:wrap;gap:4px 8px;font-size:10px;color:var(--text-muted);"></div>'
        +'<div class="sq-out" style="font-size:11.5px;color:var(--text-main);line-height:1.6;"></div>'
        +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
        +L('Arrivals are ray-traced through the IASP91 Earth model; surface waves use 3.5 / 4.4 km/s group velocity. Ground motion is the stochastic method (Brune source; trilinear geometrical spreading AND path duration after Atkinson & Boore 1995; frequency-dependent crustal Q = Q₀·f^η after Raoof, Herrmann & Malagnini 1999; κ = 0.035 s; and the Cartwright & Longuet-Higgins 1956 peak factor with its bandwidth term). A point source carries the equivalent point-source depth that reproduces near-field saturation, log₁₀ h = −0.405 + 0.235·M (Yenier & Atkinson 2014); with a drawn rupture the distance is to the rupture itself (M₀ = μAD̄), no equivalent depth is added, and wavefronts carry the rupture propagation (Vr = 0.75β). The site term varies with the real terrain: Vs30 from topographic slope (Wald & Allen 2007) in quarter-wavelength amplification, measured over the DEM\'s own sample spacing and skipped where that is coarser than 2 km; sea cells are not painted. MMI is converted from PGV with the ShakeMap relation of Worden et al. 2012 and is NOT the JMA shindo scale; the JMA display is a CONVERSION from PGV (Fujimoto & Midorikawa 2005), not the JMA\'s own waveform computation. The painted field runs to the end of the lowest class of the chosen scale: within 1,500 km it follows the terrain, and beyond that one cell is wider than the landforms inside it, so the field is a function of distance alone and is drawn as such. Past 1,000 km the regional spreading law is extrapolated, the panel says how much of the field that is, and the table still declines to print an intensity there. Educational model: in a real emergency follow the official authorities.',
           '到達時刻は地球モデルIASP91のレイトレーシング、表面波は群速度3.5／4.4 km/sです。地動は確率論的震源モデル（Bruneスペクトル、三折れ幾何減衰と経路継続時間（Atkinson & Boore 1995）、周波数依存の地殻Q = Q₀·f^η（Raoof, Herrmann & Malagnini 1999）、κ=0.035秒、帯域項を含むCartwright & Longuet-Higgins 1956のピークファクター）です。点震源の場合は近距離の飽和を再現する等価点震源深さ log₁₀ h = −0.405 + 0.235·M（Yenier & Atkinson 2014）を含みます。震源域を描くと距離は断層面まで（M₀=μAD̄）となり等価深さは加えず、波面は破壊伝播（Vr=0.75β）を含みます。地盤は実地形から：地形勾配によるVs30推定（Wald & Allen 2007）を1/4波長則に入れます。勾配はDEMの実サンプル間隔で測り、2 kmより粗い場合は使いません。海域は塗りません。MMIはPGVからShakeMapと同じWorden et al. 2012で換算しており、気象庁震度階級ではありません。震度表示はPGVからの計測震度換算（藤本・翠川 2005）であり、気象庁の観測波形計算そのものではありません。塗りは選択した階級の最下位クラスが終わる範囲まで描きます。1,500 km以内は地形に従い、それより外側は1セルが地形の変化より広いため、距離だけの関数として描きます。1,000 kmを超える範囲は地域減衰式の外挿であり、その量をパネルに表示し、表には震度を表示しません。教育目的のモデルです。実際の災害時は公的機関の指示に従ってください。',
           'Laufzeiten per Strahlverfolgung durch IASP91; Oberflächenwellen 3,5/4,4 km/s. Bodenbewegung: stochastische Methode (Brune-Quelle; trilineare Abnahme UND Pfaddauer nach Atkinson & Boore 1995; Q = Q₀·f^η (Raoof et al. 1999); κ = 0,035 s; Peakfaktor nach Cartwright & Longuet-Higgins 1956). Eine Punktquelle trägt die äquivalente Herdtiefe log₁₀ h = −0,405 + 0,235·M (Yenier & Atkinson 2014); mit gezeichneter Bruchfläche gilt die Distanz zur Fläche (M₀=μAD̄) ohne diese Zusatztiefe, und die Fronten tragen die Bruchausbreitung. Untergrund aus dem realen Gelände: Vs30 aus der Hangneigung (Wald & Allen 2007). MMI aus PGV nach Worden et al. 2012 (die ShakeMap-Relation) — NICHT die JMA-Skala; die JMA-Anzeige ist eine UMRECHNUNG (Fujimoto & Midorikawa 2005). Die Fläche reicht bis zum Ende der untersten Klasse: bis 1.500 km folgt sie dem Gelände, darüber hinaus nur noch der Distanz. Jenseits 1.000 km ist das Abklinggesetz extrapoliert. Nur Bildungsmodell.',
           'Времена — по IASP91; поверхностные волны 3,5/4,4 км/с. Движение грунта — стохастический метод (источник Бруна; геометрическое расхождение И длительность пути по Atkinson & Boore 1995; Q = Q₀·f^η (Raoof et al. 1999); κ = 0,035 с; пик-фактор Cartwright & Longuet-Higgins 1956). Точечный источник получает эквивалентную глубину log₁₀ h = −0,405 + 0,235·M (Yenier & Atkinson 2014); с нарисованным очагом расстояние — до разрыва (M₀=μAD̄), фронты несут распространение разрыва. Грунт — из реального рельефа: Vs30 по уклону (Wald & Allen 2007). MMI — по PGV по Worden et al. 2012 (реляция ShakeMap), это не шкала JMA; отображение JMA — ПЕРЕСЧЁТ (Fujimoto & Midorikawa 2005). Поле рисуется до конца низшего класса: до 1 500 км — по рельефу, дальше — только по расстоянию. Дальше 1 000 км — экстраполяция. Учебная модель.',
           'Llegadas por IASP91; ondas superficiales a 3,5/4,4 km/s. Movimiento: método estocástico (fuente de Brune; atenuación geométrica Y duración de trayecto según Atkinson & Boore 1995; Q = Q₀·f^η (Raoof et al. 1999); κ = 0,035 s; factor de pico de Cartwright & Longuet-Higgins 1956). Una fuente puntual lleva la profundidad equivalente log₁₀ h = −0,405 + 0,235·M (Yenier & Atkinson 2014); con ruptura dibujada la distancia es a la ruptura (M₀=μAD̄) y los frentes llevan la propagación. Terreno real: Vs30 por pendiente (Wald & Allen 2007). MMI desde PGV según Worden et al. 2012 (la relación de ShakeMap), NO la escala JMA; la vista JMA es una CONVERSIÓN (Fujimoto & Midorikawa 2005). El campo se pinta hasta el final de la clase más baja: hasta 1.500 km sigue el terreno, más allá sólo la distancia. Más allá de 1.000 km la ley regional está extrapolada. Modelo educativo.')
        +'</div></div>';
      panel.querySelector('.sq-close').onclick=()=>close();
      panel.querySelector('.sq-pick').onclick=()=>startPick();
      panel.querySelector('.sq-fdraw').onclick=()=>{ toggleFaultDraw(); };
      const fc=panel.querySelector('.sq-fclear'); if(fc) fc.onclick=()=>{ faultClear(); render(); refresh(); };
      panel.querySelector('.sq-slip').onchange=e=>{ faultSlip=Math.max(0.1,Math.min(80,+e.target.value||2));
        if(fault){ faultSet(fault.ring,faultSlip); render(); } touch(); };
      panel.querySelector('.sq-d').onchange=e=>{ depthKm=Math.max(0,Math.min(700,+e.target.value||10)); render(); touch(); };
      panel.querySelector('.sq-m').onchange=e=>{ if(!fault){ mw=Math.max(3,Math.min(9.6,+e.target.value||7)); render(); touch(); } };
      panel.querySelector('.sq-sd').onchange=e=>{ stressDropMPa=Math.max(0.3,Math.min(30,+e.target.value||3)); touch(); };
      const q0=panel.querySelector('.sq-q0'); if(q0) q0.onchange=e=>{ QS0=Math.max(30,Math.min(2000,+e.target.value||180)); touch(); };
      const qe=panel.querySelector('.sq-qe'); if(qe) qe.onchange=e=>{ QETA=Math.max(0,Math.min(1,+e.target.value)); touch(); };
      const op=panel.querySelector('.sq-op');
      if(op) op.oninput=e=>{ const v=setFieldOpacity((+e.target.value||85)/100);
        const b=panel.querySelector('.sq-opv'); if(b) b.textContent=Math.round(v*100)+'%'; };
      const run=panel.querySelector('.sq-run'); if(run) run.onclick=()=>{ if(!epi){ report(); return; } buildField(); };
      const tsu=panel.querySelector('.sq-tsu'); if(tsu) tsu.onclick=()=>openTsunami();
      const sc=panel.querySelector('.sq-scale'); if(sc){ sc.onchange=e=>{ pickScale(e.target.value==='jma'?'jma':'mmi'); legend(); touch(); }; }
      const sel=panel.querySelector('.sq-site'); if(sel){ sel.value=siteId; sel.onchange=e=>{ siteId=e.target.value; touch(); }; }
      const tl=panel.querySelector('.sq-t'); tl.oninput=()=>{ tSec=+tl.value; panel.querySelector('.sq-tv').textContent=fmtT(tSec); drawFronts(); };
      const sp=panel.querySelector('.sq-spd'); if(sp){ sp.onchange=e=>{ speed=Math.max(1,+e.target.value||1); }; }
      /* (#R189) REAL time by default: the front advances by wall-clock seconds × the chosen rate.
         The old loop hard-coded 10 s of simulation every 90 ms ≈ 111× and nothing on screen said so. */
      const pb=panel.querySelector('.sq-play'); pb.onclick=()=>{ if(playing){ clearInterval(playing); playing=0; pb.textContent='▶'; }
        else { pb.textContent='⏸'; let last=performance.now();
          playing=setInterval(()=>{ const now=performance.now();
            tSec=(tSec+(now-last)/1000*speed)%MAXT; last=now;
            tl.value=Math.round(tSec); panel.querySelector('.sq-tv').textContent=fmtT(tSec); drawFronts(); },90); } };
      panel.querySelector('.sq-real').onclick=()=>loadReal();
      try{ makeDraggable(panel,panel.querySelector('.sq-head')); }catch(_){}
      /* (#R190) whatever this render just decided about the tsunami button IS the shown state —
         recording it here is what stops syncTsunami re-rendering in a loop */
      _tsuShown=!!tsunamiCase();
      warmEpi();
      legend();
      report();
    }
    /* (#R190) the LOS-style progress readout (a real percentage and a bar), driven by buildField */
    function _setProg(){ if(!panel) return;
      const box=panel.querySelector('.sq-prog'), bar=panel.querySelector('.sq-progb'), lbl=panel.querySelector('.sq-progl');
      if(!box) return;
      if(!fldBusy){ box.style.display='none'; return; }
      box.style.display='block';
      if(bar) bar.style.width=fldPct+'%';
      if(lbl) lbl.innerHTML=L('Computing the intensity map','震度分布を計算中','Intensitätskarte wird berechnet','Расчёт поля интенсивности','Calculando el mapa de intensidad')
        +' <b style="color:var(--text-main);">'+fldPct+'%</b>';
    }
    /* ══ (#R190) IS THIS EVENT TSUNAMIGENIC? ══════════════════════════════════════════════════════
       「津波が発生するとされるような地震だった場合、津波シミュレーターも使えるように。」
       The screening conditions are the ones tsunami warning centres actually use, and they are three:
       the source has to be UNDER THE SEA, SHALLOW, and large enough to displace water. The JMA/PTWC
       operational thresholds are Mw ≥ 6.5 and focal depth ≤ 100 km for a tsunami to be considered at
       all (JMA issues its own advisories from about M6.5 shallow offshore), so those are the gates.
       The wave height offered to the inundation model is NOT invented: it is the empirical
       relationship between moment magnitude and maximum near-field tsunami height, log10 Hmax =
       0.5·Mw − 3.3 (Abe 1979/1981 tsunami-magnitude scale, rearranged), clamped to the range the
       inundation model accepts. The button says it is an estimate, and js/sims.js lets the user
       override it — nothing here replaces the coastal wave height with a claim of its own. */
    /* ⚠ (#R190) THE SCREENING NEEDS A TILE THAT MAY NOT BE THERE YET. `render()` asks this question
       while it builds the panel, and at that moment the DEM under a brand-new epicentre has not been
       fetched — so the honest answer is "unknown", the button is not drawn, and nothing ever draws it
       again. Measured: an offshore M9.0 at 143.05/38.30 screened correctly through the API 1.5 s
       later and the BUTTON was still absent.
       Two halves: ask at every zoom that might be warm (the field's own level first — its warm grid
       covers the epicentre), and warm one tile on open/pick so the answer exists before it is needed.
       `_tsuShown` below re-renders the panel exactly once, when the availability flips. */
    let _tsuShown=null, _tsuWarm=null, _epiElev=null;
    /* ⚠ (#R190) …AND THE ANSWER IS REMEMBERED, because the tile it came from does not stay.
       Measured on production: the button rendered for an offshore M9.0 and a screening call a moment
       later returned null — the DEM LRU had evicted the tile under the epicentre while the field
       build warmed a thousand others. A button that is visible and does nothing is worse than no
       button. The sea floor under a fixed point does not change, so the first real reading for THIS
       epicentre is kept and re-used; moving the epicentre clears it (see the key). */
    function _epiSeaDepth(){
      if(!epi) return null;
      const k=epi[0].toFixed(4)+'/'+epi[1].toFixed(4);
      if(_epiElev&&_epiElev.k===k) return _epiElev.v;
      const zs=[]; if(fld&&fld.z) zs.push(fld.z);
      [8,7,6,5].forEach(z=>{ if(zs.indexOf(z)<0) zs.push(z); });
      for(const z of zs){
        let e=null; try{ e=demElevBilinear(epi[0],epi[1],z); if(e==null) e=demElevAt(epi[0],epi[1],null,z); }catch(_){}
        if(e!=null&&isFinite(e)){ _epiElev={k,v:e}; return e; }
      }
      return null;   /* not known YET — never cached, so a warmed tile can still answer later */
    }
    /* one tile, so "is the epicentre at sea?" is answerable without waiting for a whole field */
    function warmEpi(){ if(!epi) return; const k=epi[0].toFixed(2)+'/'+epi[1].toFixed(2);
      if(_tsuWarm===k) return; _tsuWarm=k;
      try{ warmDEMTiles([[epi[0],epi[1]]],6,8000,null).then(()=>{ syncTsunami(); }); }catch(_){}
    }
    /* the panel carries the button only while the case holds; re-render when that flips (never on
       every build — it would throw away focus and scroll position for nothing) */
    function syncTsunami(){ const t=!!tsunamiCase();
      if(t===_tsuShown) return; _tsuShown=t; if(opened) render(); }
    function tsunamiCase(){
      if(!epi) return null;
      const M=fault?fault.mw:mw;
      if(!(M>=6.5)||!(depthKm<=100)) return null;
      /* under the sea? the same DEM the intensity field reads. Unknown → not offered (never guessed). */
      const e0=_epiSeaDepth();
      if(e0==null||e0>0) return null;
      const waveM=Math.max(1,Math.min(40,Math.round(Math.pow(10,0.5*M-3.3)*10)/10));
      return { waveM, M, why:L('Offshore, M'+M.toFixed(1)+', focal depth '+Math.round(depthKm)+' km, sea floor '+Math.round(-e0)+' m — meets the M≥6.5 / ≤100 km screening used for tsunami advisories.',
        '海域・M'+M.toFixed(1)+'・震源深さ '+Math.round(depthKm)+' km・海底 −'+Math.round(-e0)+' m — 津波注意報等の判定基準（M6.5以上・深さ100 km以下）に該当します。',
        'Offshore, M'+M.toFixed(1)+', Tiefe '+Math.round(depthKm)+' km — erfüllt die Tsunami-Screening-Kriterien (M≥6,5 / ≤100 km).',
        'В море, M'+M.toFixed(1)+', глубина '+Math.round(depthKm)+' км — соответствует критериям оповещения о цунами (M≥6,5 / ≤100 км).',
        'En el mar, M'+M.toFixed(1)+', profundidad '+Math.round(depthKm)+' km — cumple los criterios de alerta de tsunami (M≥6,5 / ≤100 km).') };
    }
    function openTsunami(){ const t=tsunamiCase(); if(!t||!epi) return false;
      const D2=window.IntMapDisaster; if(!D2||!D2.open) return false;
      /* hazard and wave height FIRST, then the origin — open(ll) runs the model as soon as it has one,
         and running it under the previous hazard would draw a flood before drawing the tsunami. */
      try{ D2.open({ lng:epi[0], lat:epi[1], hazard:'tsunami', waveH:t.waveM }); }catch(_){ return false; }
      return true; }
    /* (#R189) the painted field's own legend — the class colours of the ACTIVE scale */
    function legend(){ const el=panel&&panel.querySelector('.sq-leg'); if(!el) return;
      const cls=(scale==='jma')?JMA_CLASSES:MMI_CLASSES;
      el.innerHTML=cls.map(k=>'<span style="display:inline-flex;align-items:center;gap:3px;"><span style="width:11px;height:11px;border-radius:2.5px;background:'+k.col+';display:inline-block;border:1px solid rgba(128,128,128,0.35);"></span>'+((scale==='jma')?jmaLabel(k.id):k.id)+'</span>').join('');
    }
    /* (#R189) the rupture draw flow: press once → the shared free-draw tool is live; press again →
       its loop becomes the rupture (area → M₀ → Mw). The tool is the SAME free-draw every other
       feature uses (#R141's currentGeometry), not a private reimplementation. */
    let _fDrawing=false;
    function toggleFaultDraw(){
      const DT=window.DrawTool;
      if(!DT||!DT.start||!DT.currentGeometry){ return; }
      /* (#R190) 「フリー描画中にdrawポップアップは表示しないように。」 — the tool's own measurement
         panel is not part of drawing a rupture; it covered this one. See DrawTool.start's `silent`. */
      if(!_fDrawing){ _fDrawing=true; try{ DT.start(null,{silent:true}); }catch(_){ try{ DT.start(); }catch(__){} } render(); return; }
      _fDrawing=false;
      let ring=null;
      try{ const g=DT.currentGeometry();
        if(g&&g.type==='Polygon'&&g.coordinates&&g.coordinates[0]&&g.coordinates[0].length>=4) ring=g.coordinates[0].slice(0,-1);
        else if(g&&g.type==='MultiPolygon'&&g.coordinates&&g.coordinates[0]&&g.coordinates[0][0]&&g.coordinates[0][0].length>=4) ring=g.coordinates[0][0].slice(0,-1);
      }catch(_){}
      try{ DT.exit&&DT.exit(); }catch(_){}
      if(ring&&faultSet(ring,faultSlip)){ render(); refresh(); }
      else { render(); const o=panel&&panel.querySelector('.sq-out');
        if(o) o.insertAdjacentHTML('afterbegin','<div style="color:#ff9f0a;margin-bottom:4px;">'+L('No closed area was drawn — draw a loop, then press the button again.','閉じた範囲が描かれていません。ループを描いてからもう一度押してください。','Keine geschlossene Fläche — Schleife zeichnen, dann erneut drücken.','Замкнутая область не нарисована — нарисуйте контур и нажмите снова.','No se dibujó un área cerrada — dibuje un lazo y pulse de nuevo.')+'</div>'); }
    }
    function report(){ const o=panel&&panel.querySelector('.sq-out'); if(!o) return;
      _setProg();
      if(!epi){ o.innerHTML=L('Place an epicentre to begin.','震源地を設置してください。','Epizentrum setzen.','Укажите эпицентр.','Coloque un epicentro.'); return; }
      const s=source(mw);
      const notFelt=L('not felt','無感','—','—','—');
      const jp=scale==='jma';
      const iCell=(a)=>{ if(!a.calibrated) return '<span style="opacity:0.6;font-weight:400;">'+notFelt+'</span>';
        if(jp){ const c=jmaClass(a.jma); return c?jmaLabel(c.id):'<span style="opacity:0.6;font-weight:400;">'+notFelt+'</span>'; }
        return ROMAN[Math.max(1,Math.min(12,Math.round(a.mmi)))]; };
      const rows=nearby().map(c=>{ const a=at(c.lng,c.lat); if(!a) return '';
        return '<tr><td style="padding:1px 6px 1px 0;white-space:nowrap;">'+c.name+'</td>'
          +'<td style="padding:1px 6px;text-align:right;">'+Math.round(a.km).toLocaleString()+' km</td>'
          +'<td style="padding:1px 6px;text-align:right;color:#ff6b6b;">'+fmtT(a.tP)+'</td>'
          +'<td style="padding:1px 6px;text-align:right;color:#ffb020;">'+fmtT(a.tS)+'</td>'
          +'<td style="padding:1px 6px;text-align:right;">'+fmtT(a.durS)+'</td>'
          +'<td style="padding:1px 6px;text-align:right;">'+(a.pgv>=0.05?a.pgv.toFixed(1):'—')+'</td>'
          +'<td style="padding:1px 0 1px 6px;text-align:right;font-weight:700;">'+iCell(a)+'</td></tr>'; }).join('');
      o.innerHTML='<div><b>M'+mw.toFixed(1)+'</b> · '+L('depth','深さ','Tiefe','глубина','prof.')+' '+depthKm+' km · M<sub>0</sub> '+s.M0.toExponential(2)+' N·m'
        +' · f<sub>c</sub> '+s.fc.toFixed(3)+' Hz · '+(fault
          ?(L('rupture','震源域','Bruch','очаг','ruptura')+' '+Math.round(fault.areaKm2).toLocaleString()+' km²')
          :(L('rupture radius','破壊半径','Bruchradius','радиус разрыва','radio de ruptura')+' '+s.rupKm.toFixed(1)+' km'))+'</div>'
        /* (#R190) the painted field says what it is standing on — or that it is out of date and the
           ▶ button is what brings it back (the progress bar itself lives above, .sq-prog). */
        +(fldBusy?''
          :(fldStale?('<div style="color:#ffd23f;">'+L('The parameters changed — press ▶ to recompute the intensity map.','設定を変更しました。▶ を押すと震度分布を再計算します。','Parameter geändert — ▶ drücken, um neu zu rechnen.','Параметры изменены — нажмите ▶ для пересчёта.','Los parámetros cambiaron — pulse ▶ para recalcular.')+'</div>')
          :(fld&&fld.stats?('<div style="opacity:0.72;font-size:10.5px;">'
            +(fld.stats.terrain
              ?L('Intensity field: slope-based Vs30 (Wald & Allen 2007) on real DEM','震度分布：実DEMの地形勾配からVs30推定（Wald & Allen 2007）','Intensitätsfeld: Vs30 aus Hangneigung, echtes DEM','Поле интенсивности: Vs30 по уклону, реальный DEM','Campo de intensidad: Vs30 por pendiente, DEM real')
              :('⚠ '+L('Terrain too coarse here — uniform site class used','この範囲では地形が粗く一様地盤で表示','Gelände zu grob — einheitlicher Untergrund','Рельеф слишком грубый — однородный грунт','Terreno demasiado grueso — terreno uniforme')))
            +' · z'+fld.stats.z+' ('+fld.stats.demSpacingM.toLocaleString()+' m'
            /* (#R190) the slope baseline actually used, because the Vs30 proxy is calibrated at ~900 m
               and a field wider than the DEM can resolve does not get to pretend otherwise */
            +(fld.stats.slopeUsable?(' → '+L('slope over','勾配基線','Neigung über','уклон на','pendiente en')+' '+fld.stats.slopeBaselineM.toLocaleString()+' m'):'')+')'
            +' · '+fld.stats.painted.toLocaleString()+'/'+fld.stats.cells.toLocaleString()+' '+L('cells','セル','Zellen','ячеек','celdas')
            +' · '+L('out to','到達範囲','bis','до','hasta')+' '+fld.stats.rEdgeKm.toLocaleString()+' km'
            /* (#R191) …and how much of that is the terrain-free far annulus, so "the picture stops
               following the ground here" is a stated fact rather than something to be inferred */
            +(fldFar?(' ('+L('terrain to','地形は','Gelände bis','рельеф до','terreno hasta')+' '+fldFar.rFineKm.toLocaleString()+' km · '
              +L('distance only beyond','以遠は距離のみ','danach nur Distanz','дальше только расстояние','más allá sólo distancia')+')'):'')
            /* (#R190) the paint reaches the end of the scale; past the calibrated range it says so */
            +(fld.stats.beyondCalib?(' · <span style="color:#ffd23f;">'+fld.stats.beyondCalib.toLocaleString()+' '
              +L('cells beyond the calibrated '+fld.stats.calibKm+' km (extrapolated)','セルは較正範囲 '+fld.stats.calibKm+' km 超（外挿）',
                 'Zellen jenseits '+fld.stats.calibKm+' km (extrapoliert)','ячеек дальше '+fld.stats.calibKm+' км (экстраполяция)',
                 'celdas más allá de '+fld.stats.calibKm+' km (extrapolado)')+'</span>'):'')
            +(fld.stats.noDem?(' · '+fld.stats.noDem.toLocaleString()+' '+L('no DEM','DEM欠損','ohne DEM','без DEM','sin DEM')):'')
            +(fld.stats.coarse?(' · '+fld.stats.coarse.toLocaleString()+' '+L('unresolved slope','勾配不明','Neigung unbestimmt','уклон не определён','pendiente sin resolver')):'')
            +' · '+fld.stats.ms+' ms</div>'):'')))
        +'<table style="margin-top:6px;font-size:11px;border-collapse:collapse;width:100%;"><thead><tr style="color:var(--text-muted);">'
        +'<th style="text-align:left;font-weight:600;">'+L('Place','地点','Ort','Место','Lugar')+'</th>'
        +'<th style="text-align:right;font-weight:600;">Δ</th><th style="text-align:right;font-weight:600;color:#ff6b6b;">P</th>'
        +'<th style="text-align:right;font-weight:600;color:#ffb020;">S</th>'
        +'<th style="text-align:right;font-weight:600;">'+L('shaking','継続','Dauer','длит.','durac.')+'</th>'
        +'<th style="text-align:right;font-weight:600;">PGV</th>'
        +'<th style="text-align:right;font-weight:600;">'+(jp?L('Shindo','震度','Shindo','Синдо','Shindo'):'MMI')+'</th></tr></thead><tbody>'+rows+'</tbody></table>'
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
      pickH=e=>{ epi=[e.lngLat.lng,e.lngLat.lat]; endPick(); refresh(); }; try{ GE().events.once('click',pickH); }catch(_){} }
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
        faultClear();   /* (#R189) a real point event replaces any drawn rupture */
        mw=Math.round(f.properties.mag*10)/10;
        const d=panel.querySelector('.sq-d'), m=panel.querySelector('.sq-m'); if(d) d.value=depthKm; if(m){ m.value=mw; m.disabled=false; }
        try{ GE().camera.flyTo({center:epi,zoom:3,duration:900}); }catch(_){}
        tSec=0; const tl=panel.querySelector('.sq-t'); if(tl) tl.value=0;
        refresh();
        if(o) o.insertAdjacentHTML('afterbegin','<div style="margin-bottom:5px;">📡 '+String(f.properties.place||'').replace(/[<>&]/g,'')+'</div>');
      }catch(_){ if(o) o.innerHTML=L('Could not reach the USGS feed.','USGSのフィードに接続できませんでした。','USGS-Feed nicht erreichbar.','Не удалось получить данные USGS.','No se pudo acceder al feed del USGS.'); }
    }

    function open(o){
      if(!panel){ panel=document.createElement('div'); panel.id='sq-panel';
        /* (#R189) 「ポップアップは透過するな」 — --card-bg is opaque in BOTH themes (#fff / #1c1c1e);
           --popup-bg was rgba with no backdrop-filter, so the map showed through under the table. */
        panel.style.cssText='position:fixed;left:16px;top:80px;width:min(360px,94vw);z-index:1402;display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
        document.body.appendChild(panel); }
      panel.style.display='flex'; opened=true; render();
      if(o&&o.lng!=null){ epi=[o.lng,o.lat]; if(o.depth!=null) depthKm=Math.max(0,+o.depth); if(o.mw!=null&&!fault) mw=Math.max(3,Math.min(9.6,+o.mw)); render(); refresh(); }
      else refresh();
      return true; }
    function close(){ opened=false; endPick(); if(playing){ clearInterval(playing); playing=0; }
      if(_fDrawing){ try{ window.DrawTool&&window.DrawTool.exit&&window.DrawTool.exit(); }catch(_){} _fDrawing=false; }
      fldSeq++; fld=null; fldFar=null; try{ paintField(); paintFar(); }catch(_){}
      if(panel) panel.style.display='none'; setData([]); return true; }
    /* (#R191) …and while the scale is still a DEFAULT, it follows the language the way it would have
       been chosen at boot. A latched choice (scaleSet) is never touched. */
    window.addEventListener('intmap-lang',()=>{ if(!scaleSet){ const want=scaleForLang();
        if(want!==scale){ scale=want; if(fld) fldStale=true; try{ legend(); }catch(_){} } }
      if(opened) render(); });

    return { open, close, draw, at, arrival, curve, source, motion, mmiRings,
      setEpicentre(lng,lat){ epi=[lng,lat]; refresh(); return true; },
      setParams(o){ o=o||{}; if(o.depth!=null) depthKm=Math.max(0,Math.min(700,+o.depth));
        if(o.mw!=null&&!fault) mw=Math.max(3,Math.min(9.6,+o.mw)); if(o.t!=null) tSec=Math.max(0,Math.min(MAXT,+o.t));
        if(o.stressDrop!=null) stressDropMPa=Math.max(0.3,Math.min(30,+o.stressDrop));
        if(o.scale==='mmi'||o.scale==='jma') pickScale(o.scale);                  /* (#R189) */
        if(o.speed!=null&&isFinite(+o.speed)&&+o.speed>0) speed=Math.max(0.1,Math.min(1000,+o.speed));
        if(o.slip!=null){ faultSlip=Math.max(0.1,Math.min(80,+o.slip||faultSlip));
          if(fault) faultSet(fault.ring,faultSlip); }
        if(opened) render(); refresh(); return true; },
      loadReal,
      setSite(id){ if(SITES.some(s=>s.id===id)){ siteId=id; if(opened) render(); refresh(); return true; } return false; },
      /* (#R189) the new controls, callable — the Atlas rule: every feature drives from a call */
      setScale(v){ if(pickScale(v)){ if(opened) render(); refresh(); return true; } return false; },
      setSpeed(v){ const n=+v; if(isFinite(n)&&n>0){ speed=Math.max(0.1,Math.min(1000,n)); if(opened) render(); return true; } return false; },
      setFault(ring,slip){ if(slip!=null) faultSlip=Math.max(0.1,Math.min(80,+slip||faultSlip));
        const ok=faultSet(ring,faultSlip); if(ok){ if(opened) render(); refresh(); } return ok; },
      clearFault(){ faultClear(); if(opened) render(); refresh(); return true; },
      rebuildField:()=>buildField(),
      /* (#R190) the field's own value at one point, with the class colour — read by the always-on
         corner readout (js/map-readout.js). Returns null when the simulator is closed, the field has
         not been computed, or the point is outside it: a readout that guesses is worse than none. */
      intensityAt(lng,lat){ if(!opened||!fld||!fld.pgvAt) return null;
        const pgv=fld.pgvAt(lng,lat); if(pgv==null||!isFinite(pgv)) return null;
        /* the ACTIVE scale, converted from the stored PGV — never a number left over from the scale
           the field happened to be painted in (see the ⚠ note in buildField) */
        if(scale==='jma'){ const I=jmaI(pgv); const c=jmaClass(I); if(!c) return null;
          return { scale:'jma', I:+I.toFixed(2), pgv:+pgv.toFixed(2), col:c.col,
                   label:L('Shindo','震度','Shindo','Синдо','Shindo')+' '+jmaLabel(c.id) }; }
        const I2=mmiOf(pgv); const c2=mmiClass(I2); if(!c2) return null;
        return { scale:'mmi', I:+I2.toFixed(2), pgv:+pgv.toFixed(2), col:c2.col, label:'MMI '+ROMAN[Math.max(1,Math.min(12,Math.round(I2)))] }; },
      /* (#R190) 「震度の塗は透明度選択を可能に」 — callable, like every other control (#R82) */
      setOpacity:(v)=>setFieldOpacity(v),
      opacity:()=>fldOpacity,
      /* (#R190) 「津波…も使えるように」 — the screening result and the hand-off, both callable */
      tsunami:()=>tsunamiCase(),
      openTsunami,
      state:()=>({ open:opened, epi:epi?epi.slice():null, depthKm, mw, tSec, speed, scale, stressDropMPa, siteId, siteAmp:siteAmp(),
        Q0:QS0, Qeta:QETA, opacity:fldOpacity, fieldStale:fldStale, fieldPct:fldPct,   /* (#R190) */
        tsunami:(()=>{ const t=tsunamiCase(); return t?{waveM:t.waveM,mw:+t.M.toFixed(2)}:null; })(),
        fault:fault?{ areaKm2:Math.round(fault.areaKm2), slipM:fault.slipM, mw:+fault.mw.toFixed(2), points:fault.ring.length }:null,
        field:(fld&&fld.stats)?fld.stats:null, fieldBusy:fldBusy,
        /* (#R191) the terrain-free annulus that carries the lowest class to its end */
        far:fldFar?{ N:fldFar.N, painted:fldFar.painted, extrapolated:fldFar.extrap, sea:fldFar.sea, landMask:fldFar.landMask, landZoom:fldFar.landZoom, rFineKm:fldFar.rFineKm, rEdgeKm:fldFar.rEdgeKm }:null,
        scaleSet, terrainKm:MMI_TERRAIN_KM, maxKm:MMI_MAX_KM,
        stations:stations.length, mmiRings:mmiRings().map(r=>({I:r.I,km:Math.round(r.km)})) }) };
  })();
};
