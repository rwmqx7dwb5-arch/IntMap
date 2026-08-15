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
 *  instead of hidden inside coefficients — and it is honest about what it omits: with no rupture
 *  drawn it is a point source, so a megathrust is under-stated near its own coast (measured for 2011
 *  Tōhoku in DEV-NOTES #R192), and there is no basin resonance.
 *
 *  INTENSITY — each scale from the band it is defined on (#R192). MMI is Worden et al. (2012), the
 *  GMICE ShakeMap converts PGV with, fed the PGV a strong-motion record actually delivers (4-pole
 *  high-pass at 0.1 Hz). 震度 is the JMA's own computation — 気象庁「計測震度の算出方法」: the period
 *  filter, the 10 Hz high-cut, the 0.5 Hz low-cut, and the level exceeded for a total of 0.3 s. They
 *  are DIFFERENT SCALES of different quantities, and the panel says so rather than quietly presenting
 *  one as the other.
 *
 *  DURATION — from this model's own arrivals, so it explains itself: the ground is moving from the S
 *  arrival until the surface-wave train has gone by, and the rupture adds its own length 1/fc.
 * ==========================================================================*/
/* (#R232) the published source parameters of the past earthquakes the panel can load, and the
   geometry that turns a published rectangle into the ring this simulator draws. Its own file
   because it is DATA with citations rather than model code (standing instruction 13), and because
   a catalogue that must be checkable should be readable without wading through the physics. */
import { QUAKE_EVENTS, ruptureRing, momentOf, fetchRuptureRing } from './seismic-events.js';

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
    const L=window.IntMapLang.pick(()=>HOST.lang);
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
    /* ══ ⚠⚠⚠ (#R238) …AND THE INVERSE, INTERPOLATED — 「動作は離散的ではなくスムーズにして」 ═══════════
       How far has the phase got by time t? This returned `max { Δᵢ : Tᵢ ≤ t }` over the SAMPLED curve,
       i.e. it could only ever return one of the 1,042 Δ values `curve()` happened to trace. The front
       therefore SAT STILL until the clock crossed the next sample's time and then JUMPED to it — a
       staircase in radius, which is what 「離散的」 names and which neither #R235 (which fixed the
       TICK RATE, from an 11 Hz interval to the frame loop) nor #R237 (which fixed the VERTEX COUNT,
       144 → screen-driven) touched: both made a quantised radius smoother to look at without
       un-quantising it.

       Measured before the change, and this is how big the steps were: `frontDelta('S', 24 km, t)`
       returns 0.8961573° for t = 30 s AND for t = 60 s — the S front stands still for half a minute
       at 100 km. Worse, with a rupture drawn the envelope is a max over ~16 source points, each
       frozen on its OWN curve's samples, so different points take the lead at different bearings and
       the ring came out NOTCHED — measured at t = 60 s, radius 1.310° at bearing 0 and 0.929° at
       bearing 90, a step of 42 km between two adjacent parts of one wavefront. That is the second
       half of 「まだ震央中心の同心円に見える／動きがカクカク・飛ぶ」.

       The samples bracket the answer, so the answer is between them: the last sample reached and the
       first one not yet reached are consecutive in Δ by construction (anything further out that had
       already arrived would BE the last one reached), so Δ is interpolated linearly in TIME across
       that one gap. ⚠ Linear in time, not in Δ: t is the variable the animation moves, so this is
       what makes dΔ/dt finite everywhere instead of a train of impulses. */
    function frontDelta(phase,srcDepth,t){
      const pts=curve(phase,srcDepth); if(!pts.length) return null;
      let best=null, bestT=null, bi=-1;
      for(let i=0;i<pts.length;i++){ const q=pts[i];
        if(q[1]<=t&&(best==null||q[0]>best)){ best=q[0]; bestT=q[1]; bi=i; } }
      if(best==null) return null;
      /* the first sample further out that this time has NOT reached */
      let nx=null;
      for(let i=bi+1;i<pts.length;i++){ if(pts[i][0]>best){ nx=pts[i]; break; } }
      if(!nx||!(nx[1]>bestT)) return best;
      const f=(t-bestT)/(nx[1]-bestT);
      return best+Math.max(0,Math.min(1,f))*(nx[0]-best);
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
    /* ══ (#R192) A GREAT EARTHQUAKE IS NOT ONE CIRCULAR CRACK ══════════════════════════════════════
       Brune's single-corner ω⁻² spectrum puts the whole source in one number, and for a large event
       that number is very small: at M9 with Δσ = 3 MPa the corner is 0.0075 Hz, so EVERYTHING an
       engineering instrument or a person responds to sits on the f⁻² slope, hundreds of times below
       the plateau. Measured on this model: at M9 it under-predicts the observed 震度 near the source
       by about two whole classes (2011 Tōhoku, Sendai: 4.1 against the observed 6強), and the ratio
       grows with magnitude — which is exactly the defect the two-corner source was published for.
       ATKINSON & SILVA (2000, BSSA 90(2), 255-274) fit a two-corner spectrum to the empirical
       California data — a low corner fa carrying the moment and a high corner fb carrying the
       radiated high frequency, mixed by ε:
           log₁₀ fa = 2.181 − 0.496 M      log₁₀ fb = 2.41 − 0.408 M     log₁₀ ε = 0.605 − 0.255 M
           S(f) = (1−ε)/(1+(f/fa)²) + ε/(1+(f/fb)²)
       It reduces to a single corner for small events (ε → 1 and fb → fa near M4) and departs from it
       exactly where the single corner fails. The stress drop stays what it is — the CRACK RADIUS and
       the source duration are still Brune's, and Δσ is still the panel's adjustable assumption; what
       changes is the SHAPE of the spectrum between the two corners.
       ⚠ VERIFIED BEFORE ADOPTION, against BSSA14 (Boore, Stewart, Seyhan & Atkinson 2014) at
       Vs30 = 760 m/s — see the table in DEV-NOTES #R192. */
    function source(mw,fd){
      const M0=Math.pow(10,1.5*mw+9.1);                          /* N·m — Hanks & Kanamori 1979 */
      const dSigma=stressDropMPa*1e6;
      const fc0=0.49*BETA*Math.pow(dSigma/M0,1/3);               /* Hz — Brune 1970 */
      const rupKm=Math.pow(7*M0/(16*dSigma),1/3)/1000;           /* circular-crack radius */
      /* ══ (#R232) RUPTURE DIRECTIVITY — 「断層の破壊方向による影響を科学的根拠をもとに考慮した地震
         シミュレーションに。」 ═══════════════════════════════════════════════════════════════════
         A rupture is not a point that lights up: it is a tear running along the fault at Vr ≈ 0.75β,
         so a site AHEAD of it is reached by energy that left successive parts of the fault ever
         closer together in time, and a site BEHIND it by energy that has been stretched out. That is
         a Doppler effect on the SOURCE TIME FUNCTION, and it is kinematics rather than a fitted
         curve — Ben-Menahem (1961); Aki & Richards, *Quantitative Seismology*, §10. The apparent
         duration seen at an angle θ from the rupture direction is

             T(θ) = T₀ · Fd,      Fd = 1 − (Vr/β)·X·cos θ

         ⚠⚠ (#R234) AND #R232 THEN SPENT THAT DURATION IN THE WRONG PLACE — 「この実装により震度計算に
         大幅な誤差が生じてしまっている」. It moved the corner frequencies with it (f_c → f_c/Fd, and
         both corners of the two-corner shape with them), which slides the WHOLE spectrum. The
         high-frequency acceleration plateau of an ω⁻² source is ∝ M₀·f_c², so sliding f_c by 1/Fd
         multiplies it by 1/Fd² — and at the 0.3 floor that is a factor of ELEVEN. Measured on this
         model's own integrators, forward against the azimuth-average:

             #R232      PGV ×8.3 – ×12.8    PGA ×13.7 – ×16.2    ΔMMI +3.4 – +4.1    ∫A²df ×88 – ×103
             this round PGV ×1.38 – ×1.53   PGA ×1.43 – ×1.58    ΔMMI +0.52 – +0.68  ∫A²df ×1.00

         ⚠ THE LAST COLUMN IS THE PROOF, AND IT INDICTS THE PARAGRAPH ABOVE IT. The old header says
         the effect "redistributes energy instead of creating it" and cites M₀ as the reason — but M₀
         is only the f → 0 LEVEL. It was preserved; the RADIATED ENERGY, ∫A²df, was multiplied by a
         HUNDRED. An earthquake cannot radiate a hundred times more energy toward one azimuth than
         the average of all of them, so the number the panel printed was not an earthquake.
         ⚠ AND NOTHING OBSERVED LOOKS LIKE +4 INTENSITY UNITS. Somerville et al. (1997) — the same
         paper the X·cos θ predictor comes from — measure forward amplification of roughly ×1.4–×2,
         and ONLY at periods longer than about 0.6 s. ×16 on PGA is not that model, or any model.

         ══ WHERE THE DOPPLER TERM ACTUALLY BELONGS: THE DURATION, NOT THE SPECTRUM ═══════════════
         The kinematics say the same energy arrives in a shorter time, and this model already has
         the place where "in a shorter time" is expressed. Random-vibration theory (Boore 2003, and
         `rvt` below) takes the peak from the rms and the rms from the energy DIVIDED BY THE
         DURATION: rms² = (1/T_d)∫A²df. So the amplitude spectrum is left exactly as it is — the
         same at every azimuth, as ∫A²df ×1.00 above says out loud — and Fd enters only as the
         apparent source duration T(θ) = T₀·Fd that Ben-Menahem derived in the first place. Peak
         then goes as ≈1/√Fd, which is ×1.83 at the floor and ×0.76 away: the observed bracket.

         ⚠ `X` IS WHAT KEEPS THIS HONEST. It is the fraction of the fault that ruptures TOWARD the
         site (Somerville et al. 1997 use the same predictor, X·cos θ, for their empirical model), so
         a rupture that nucleates in the middle and runs both ways has X ≈ ½ in either direction and
         a modest effect, while one that nucleates at an end and runs the whole length has X → 1 and
         a strong one. A model that ignored X would hand every earthquake the fully-unilateral answer.
         ⚠ AND THE FLOOR IS NUMERICAL, NOT COSMETIC. Fd → 0 is the Vr → β limit where the kinematic
         factor is singular and real ruptures stop being coherent anyway; 0.3 keeps the arithmetic
         finite and is stated rather than hidden.
         ⚠ Fd = 1 IS THE OLD MODEL EXACTLY. Without a drawn rupture there is no direction to have,
         and every number below is byte-for-byte what it was — `durS` is 1/fc0 at Fd = 1, which is
         what `1/fc` used to evaluate to. */
      const f=(fd>0)?fd:1;
      /* ⚠ NO `/f` ON ANY OF THESE THREE. That division is the defect above; it is the source
         spectrum, and the source spectrum is the same earthquake from every side. */
      const fc=fc0;
      const fa=Math.pow(10,2.181-0.496*mw), fb=Math.pow(10,2.41-0.408*mw);
      const eps=Math.min(1,Math.pow(10,0.605-0.255*mw));
      /* the normalised displacement shape: 1 at f → 0, and ω⁻² past the upper corner */
      const shape=(f2)=>(1-eps)/(1+(f2/fa)*(f2/fa))+eps/(1+(f2/fb)*(f2/fb));
      /* …and the ONE quantity the azimuth is allowed to change: how long it takes to arrive. */
      return { M0, fc, fa, fb, eps, shape, rupKm, durS:f/fc0, fd:f, fc0, fcApparent:fc0/f };
    }
    /* ── the geometry half of the directivity: which way is the rupture running, and how much of it
       runs toward this site. Both come from what the reader already gave us — the drawn rupture and
       the epicentre, which IS the nucleation point (the panel calls it 震源, and the wavefront
       envelope has propagated from it since #R189). Null when there is nothing to be directional
       about, and every caller then passes Fd = 1. */
    const VR_BETA=0.75;                        /* Vr/β — the same ratio VRUP_KMS is built from */
    const FD_FLOOR=0.3;
    /* ⚠ THE AXIS IS THE RUPTURE'S LONG AXIS, NOT "THE FARTHEST VERTEX FROM THE HYPOCENTRE". For a
       rectangle those are different things — the farthest vertex is a CORNER, so a rupture running
       due north would have been given a direction 20-odd degrees off it, and a bilateral rupture
       whose two ends are equidistant would have picked one of them arbitrarily. Take the two ring
       vertices that are farthest APART (that is the along-strike axis, whatever the ring's winding
       or vertex count), then measure everything as a signed projection onto it: the hypocentre's own
       position on the axis is what splits the length into the part that runs forward and the part
       that runs back, which is exactly the X the directivity term needs. */
    /* ⚠ (#R234) MEMOISED, AND THAT IS NOT AN OPTIMISATION — IT IS WHAT MAKES THE LOOP BELOW LEGAL.
       The search is O(n²) over the ring's vertices, and #R234 densified the published ruptures from
       4 vertices to 60 (js/seismic-events.js: a 1,300 km edge cannot be drawn with two points). 4
       vertices is 6 pairs; 60 is 1,770 — and `fdAt` is called once PER CELL, up to 82,944 of them.
       That is 147 million great-circle distances for one field. The axis is a property of the ring
       and the hypocentre, both of which are constant for the whole build, so it is computed once
       per (ring, epicentre) and re-used. The cache key is identity: `faultSet` builds a NEW ring
       array whenever the rupture changes, and `setEpi` a new epicentre. */
    let _axCache=null;
    function rupAxis(){
      if(!fault||!fault.ring||fault.ring.length<3||!epi) return null;
      if(_axCache&&_axCache.ring===fault.ring&&_axCache.epi===epi) return _axCache.ax;
      const ax=_rupAxisCompute();
      _axCache={ ring:fault.ring, epi, ax };
      return ax;
    }
    function _rupAxisCompute(){
      const R2=fault.ring;
      let a=null,b=null,best=-1;
      for(let i=0;i<R2.length;i++) for(let j=i+1;j<R2.length;j++){
        const d=gcDelta(R2[i],R2[j]); if(d>best){ best=d; a=R2[i]; b=R2[j]; } }
      if(!a||!b||!(best>0)) return null;
      const brg=bearingTo(a,b);
      /* signed distance along the axis, from `a`, in km — local projection is ample here (the axis
         is at most ~1,300 km and this only has to split it into two parts). */
      const proj=(p)=>{ const d=gcDelta(a,p)*D*RE; if(!(d>0)) return 0;
        return d*Math.cos((bearingTo(a,p)-brg)*D); };
      let lo=Infinity, hi=-Infinity;
      for(const p of R2){ const t=proj(p); if(t<lo) lo=t; if(t>hi) hi=t; }
      const t0=Math.max(lo,Math.min(hi,proj(epi)));
      const L=hi-lo; if(!(L>0)) return null;
      return { brg, fwdKm:hi-t0, backKm:t0-lo, L };
    }
    /* Fd at a site. X is measured along the rupture: the site's own side of the hypocentre supplies
       the length that can run toward it, normalised by the whole rupture length. */
    function fdAt(lng,lat){
      const ax=rupAxis(); if(!ax) return 1;
      const cosT=Math.cos((bearingTo(epi,[lng,lat])-ax.brg)*D);
      const X=(cosT>=0?ax.fwdKm:ax.backKm)/ax.L;
      return Math.max(FD_FLOOR, 1-VR_BETA*X*cosT);
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
    /* ══ (#R192) THE ONLY PART OF THE MOTION AN INTENSITY SCALE IS ABOUT ═══════════════════════════
       「シミュレーションの精度、忠実性を根本的に…高めて。（現在の分布は過大評価すぎに思える。）」

       Both intensity scales measure FELT shaking, and the model was feeding them a number that is not
       felt shaking. `rvt` integrates the Fourier spectrum from 0.02 Hz, and a Brune ω⁻² source has its
       VELOCITY spectrum peak exactly at the corner frequency — which for an M9 is 0.0075 Hz, a
       133-second period. Measured on this model's own spectra: at M9, the velocity energy in the
       0.02 Hz bin is a HUNDRED TIMES the energy at 1 Hz, both at 100 km and at 7,000 km. So the PGV
       that fed the intensity was set by the lower LIMIT OF THE INTEGRATION — an arbitrary constant —
       and it described a 50-second swell that no one feels and no accelerograph reports as PGV.
       That is the over-estimate: at 7,000 km almost nothing above 0.1 Hz survives the path, the
       0.02 Hz swell does, and it was being coloured in as 震度1 across three continents.

       An intensity is therefore computed from the band its own definition covers:

         · 震度 — the JMA's own filter, exactly (気象庁「計測震度の算出方法」): the period-effect
           term f^-0.5, the 10 Hz high-cut and the 0.5 Hz low-cut, then the level exceeded for a TOTAL
           of 0.3 s. See jmaFilter / jmaA0. No conversion, no regression, no free constant.
         · MMI — Worden et al. (2012)'s GMICE on PGV, with PGV taken over the band a strong-motion
           record can actually deliver it in. Real PGV is read off an instrument-corrected record with
           a high-pass corner; below it the trace is drift, not ground motion. 0.1 Hz is the corner
           used across strong-motion processing (PEER/NGA, K-NET, ShakeMap inputs), applied here as a
           4-pole Butterworth amplitude so nothing is discarded at a step.

       PGA keeps the whole band — it is carried far above 1 Hz, where the filter is 1. */
    const FELT_HP=0.1, FELT_POLES=4;
    const feltHP=(f)=>1/Math.sqrt(1+Math.pow(FELT_HP/Math.max(1e-4,f),2*FELT_POLES));
    /* 気象庁 計測震度 — the three filters, as published. y = f/10 for the high-cut. */
    function jmaFilter(f){
      if(!(f>0)) return 0;
      const y=f/10, y2=y*y, y4=y2*y2, y6=y4*y2, y8=y4*y4, y10=y8*y2, y12=y6*y6;
      const hc=1/Math.sqrt(1+0.694*y2+0.241*y4+0.0557*y6+0.009664*y8+0.00134*y10+0.000155*y12);
      const lc=Math.sqrt(Math.max(0,1-Math.exp(-Math.pow(f/0.5,3))));
      return hc*lc/Math.sqrt(f);
    }
    /* Abramowitz & Stegun 7.1.26 — erfc to ~1.5e-7, which is far past what the level below needs */
    function erfc(x){ const z=Math.abs(x), t=1/(1+0.5*z);
      const y=t*Math.exp(-z*z-1.26551223+t*(1.00002368+t*(0.37409196+t*(0.09678418+t*(-0.18628806+
        t*(0.27886807+t*(-1.13520398+t*(1.48851587+t*(-0.82215223+t*0.17087277)))))))));
      return x>=0?y:2-y; }
    /* ⚠ THE JMA LEVEL IS NOT A PEAK. 計測震度 is defined as the acceleration a₀ that the VECTOR of the
       three filtered components exceeds for a TOTAL of 0.3 seconds — a duration statement, not a
       maximum. Random-vibration theory answers it directly: for a stationary Gaussian process the
       fraction of time above a level is known in closed form, so a₀ solves Td·P(|a|>a₀) = 0.3 s.
       The vector of three Gaussian components is Maxwell-distributed,
           P(|a| > uσ) = erfc(u/√2) + √(2/π)·u·e^(−u²/2),
       with σ the equivalent isotropic rms: this model computes ONE horizontal component (the 1/√2 in
       omega0 splits the motion onto the two of them), and the vertical is taken at the usual V/H = 2/3,
       so σ² = σ_h²(2 + (2/3)²)/3. Isotropising an anisotropic vector is an approximation and is stated
       as one; it moves a₀ by 10 %, i.e. 0.08 of an intensity class. */
    const JMA_VH=2/3;
    function jmaA0(spec,Td){
      const f0=0.02, f1=40, N=400; let m0=0;
      const lg0=Math.log(f0), lg1=Math.log(f1), dl=(lg1-lg0)/N;
      for(let i=0;i<=N;i++){ const f=Math.exp(lg0+i*dl), w=(i===0||i===N)?1:(i%2?4:2);
        const A=spec(f)*jmaFilter(f); m0+=w*A*A*(f*dl)/3; }
      m0*=2/Math.max(0.05,Td);
      const sh=Math.sqrt(Math.max(0,m0));
      if(!(sh>0)) return 0;
      const se=sh*Math.sqrt((2+JMA_VH*JMA_VH)/3);
      const need=0.3/Math.max(0.05,Td);                       /* the fraction of the record above a₀ */
      if(need>=1) return 0;                                   /* shorter than 0.3 s — no level qualifies */
      const P=(u)=>erfc(u/Math.SQRT2)+Math.sqrt(2/Math.PI)*u*Math.exp(-u*u/2);
      let lo=0, hi=12;
      for(let i=0;i<60;i++){ const m=(lo+hi)/2; if(P(m)>need) lo=m; else hi=m; }
      return se*(lo+hi)/2;
    }
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
    /* ══ ⚠⚠ (#R223) THE POINT SOURCE AND THE DRAWN RUPTURE NOW DESCRIBE THE SAME OBJECT ═════════════
       「同じマグニチュードでも、フリー描画と点震源の際は、明らかに点震源のほうが震度分布の震度が
         過小評価されている。この不整合の原因を究明して。」

       MEASURED on the shipped build, Mw 7.50, depth 10 km, rock, at the epicentre:

           point source   MMI 7.70   震度 5.17          drawn rupture   MMI 9.08   震度 6.08
           …and at 100 km and beyond the two agree to better than 0.2 %.

       So the whole difference lives in the near field, and it has one cause. #R191 gave the POINT
       source Yenier & Atkinson's (2014) equivalent point-source depth — log₁₀ h = −0.405 + 0.235·M,
       22.8 km at M7.5 — added in quadrature to the distance, precisely so a point would not report
       ground motion no instrument has recorded. It deliberately did NOT give it to a drawn rupture,
       because there the distance is already Rrup to a real finite fault and adding a pseudo-depth
       would count the same finiteness twice. Both halves of that reasoning are correct, and together
       they leave the two paths describing DIFFERENT EARTHQUAKES at the same magnitude: one whose
       energy comes from a point 22.8 km away, and one whose energy comes from a surface you are
       standing on.

       ⚠ THE FIX IS GEOMETRY, NOT A FUDGE FACTOR, and it goes in the direction the reader named
       (confirmed before the change: 「点震源を上げて揃える」). A magnitude already implies a rupture
       SIZE — Wells & Coppersmith (1994), the same regression the tsunami solver uses for the fault
       plane it builds from M (src/tsunami-worker.js): log₁₀ A = −3.49 + 0.91·M, A in km², which is
       2,163 km² at M7.5 and an equivalent radius of 26 km. A point source is therefore treated as
       that rupture: the distance every receiver uses is the distance to its FOOTPRINT,
       max(0, R_epi − a), combined with the focal depth exactly as the drawn case combines Rrup with
       it. The pseudo-depth is gone, because the finiteness it stood in for is now in the geometry —
       #R191's own rule about not counting it twice, applied to both branches instead of one.

       CONSEQUENCE, and it is the point: at the epicentre the point source now returns what a drawn
       rupture of the size its magnitude implies returns, and the two curves are one curve. A drawn
       rupture that is BIGGER or SMALLER than the implied one still differs — that is the reader
       drawing a different earthquake, which is what drawing is for. */
    const RUP_A=(mw)=>Math.pow(10,-3.49+0.91*mw);                 /* Wells & Coppersmith 1994 — rupture area, km² */
    function impliedRupKm(m){ return Math.sqrt(RUP_A(Math.max(3,Math.min(9.6,m)))/Math.PI); }
    /* how much of a surface distance is INSIDE the source. Zero when a rupture is drawn: there the
       surface distance already IS Rrup (faultDistKm returns 0 inside the polygon). */
    function rupCutKm(){ return fault?0:impliedRupKm(mw); }
    /* ⚠ ONE CONVERSION, FOUR READERS (buildField · buildFar · mmiRings · at()). A surface distance
       measured from the epicentre / the drawn rupture becomes the distance the ground-motion chain
       is asked for. Writing it four times is how the rings and the paint drift apart (#R190). */
    function srcDistM(surfKm,cutKm){ const c=(cutKm==null)?rupCutKm():cutKm;
      const s=Math.max(0,surfKm-c); return Math.sqrt(s*s+depthKm*depthKm)*1000; }
    function motion(mw,rM,fd){
      const s=source(mw,fd); let r=Math.max(1000,rM);
      const rKm=r/1000;
      /* the displacement spectral level, with the trilinear spreading folded in */
      const omega0=RAD*FREE*(1/Math.SQRT2)*siteAmp()*s.M0/(4*Math.PI*RHO*BETA*BETA*BETA)*spread(rKm)/1000;
      /* (#R190) Q(f) = Q₀·f^η — see the note by QS0. The exponent leaves f^(1−η) in the exponent, which
         is why a constant Q cannot be tuned to imitate it: the two curves cross. */
      const path=f=>Math.exp(-Math.PI*f*r/(QS0*Math.pow(Math.max(0.01,f),QETA)*BETA))*Math.exp(-Math.PI*KAPPA*f);
      const disp=f=>omega0*s.shape(f)*path(f);                      /* (#R192) two-corner source — see source() */
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
      /* (#R192) the velocity an instrument reports — see FELT_HP. PGA keeps the whole band. */
      const velF=f=>velS(f)*feltHP(f);
      const pgvMs=rvt(velF,Td), pgaMs2=rvt(accS,Td);
      const pgv=pgvMs*100, pga=pgaMs2*100;                          /* cm/s, cm/s² */
      /* (#R192) …and 震度 by its own definition, off the JMA-filtered acceleration (cm/s²) */
      const a0=jmaA0(accS,Td)*100;
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
      return { pgv, pga, pgaG:pgaMs2/9.80665, mmi, a0, jma:jmaOfA0(a0), inRange,
        calibrated:(inRange&&pgv>=PGV_FELT&&mmi<=9.5),
        /* (#R223) the pseudo-depth is GONE from this object as well as from the chain — a key that is
           always 0 is a reader's trap. What replaces it is the rupture the answer belongs to. */
        fc:s.fc, M0:s.M0, rupKm:s.rupKm, srcDurS:s.durS, gmDurS:Td, pathDurS:Tp,
        impliedRupKm:(fault?0:impliedRupKm(mw)), amp:siteAmp() };
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
    /* (#R237) …and the point-source ring is densified by the same rule as the rupture envelope, so
       「離散的ではなくスムーズに」 is one answer and not two. `_frontSteps` is declared later in this
       closure but only ever CALLED from here at draw time, which is long after the whole factory body
       has run — the #R200 trap is a `let` read during evaluation, not a function read during a draw. */
    function ringLines(centre,angDeg){
      const a=Math.min(179.9,Math.max(0.02,angDeg));
      let n=180; try{ n=Math.max(180,Math.round(_frontSteps(a)/2)*2); }catch(_){}
      try{ const w=HOST.diskOutlineLines(centre,a*D*RE,n); if(w&&w.length) return w; }catch(_){}
      const out=[]; for(let i=0;i<=n;i++) out.push(destAng(centre,i*360/n,a));   /* renderer-less fallback */
      return [out];
    }

    /* ---- state ---------------------------------------------------------------------------------- */
    let epi=null, depthKm=10, mw=7.0, tSec=0, playing=0, panel=null, opened=false, stations=[], picking=false, minimised=false;   /* (#R210) minimised = body hidden, header kept */
    /* (#R205) what a plain click on the map means while this panel is open — 'epi' (re-place the
       epicentre, the default and the report) or 'station' (add a row to the table). Declared HERE with
       the rest of the panel state rather than next to onClick: #R200 lost a whole boot to a `let` that
       render() could reach before its declaration had been evaluated. */
    /* ══ ⚠⚠⚠ (#R240) NOTHING IS ARMED UNTIL THE READER ARMS IT ═══════════════════════════════════════
       「手順や流れが全く理解できない。フローが破綻している。」 — the fourth round of this instruction.
       Screenshotted on the shipped build: the panel opens with step ② ALREADY ARMED. Its button says
       「解除」(Cancel), a banner under it says 「地図をタップして震源地を置いてください」, and the map
       carries a HUD saying the same — while the row directly above prints the coordinates of the
       hypocentre that is already there. So the first thing the panel says is «cancel the thing you
       have not started», about a step that is already done, before it has said what steps ① and ③
       are for. That is the broken flow, and it is one initialiser: this was 'epi'.
       ⚠ IT IS STILL 'epi' WHEN THERE IS NOTHING TO POINT AT — see `open()`. Opening the simulator on
       an empty map arms the one gesture there is, which is help; opening it on a loaded earthquake
       arms nothing, which is also help. */
    let clickMode='none';
    /* (#R236) set when a hypocentre click landed outside the drawn rupture — the banner says so, and
       it is cleared by the next accepted click or by clearing the rupture. */
    let _epiOutside=0;
    /* (#R236) which side of the one earthquake picker is showing: the curated catalogue or the USGS
       feed. ⚠ Declared up here with the rest of the panel state, above render() — #R200 lost a whole
       boot to a `let` a function could reach before its declaration had been evaluated. */
    let evSrc='past';
    /* (#R242) the player's two glyphs — SVG, so they scale with the button and inherit its colour
       (a text ▶/⏸ renders at a different baseline in every font, which is what the old row did). */
    const SVG_PLAY='<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true" style="margin-left:2px;"><path d="M7 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>';
    const SVG_PAUSE='<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4.5" height="16" rx="1.4"/><rect x="13.5" y="4" width="4.5" height="16" rx="1.4"/></svg>';
    /* (#R243) the two jump glyphs of the transport — same 24-box, same `currentColor`, so they take
       the button's own tint and scale with it exactly as the play/pause pair do. */
    const SVG_START='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="2.6" height="14" rx="1.1"/><path d="M19.4 5.6v12.8a1 1 0 0 1-1.53.85l-9.6-6.4a1 1 0 0 1 0-1.7l9.6-6.4a1 1 0 0 1 1.53.85z"/></svg>';
    const SVG_END='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="16.4" y="5" width="2.6" height="14" rx="1.1"/><path d="M4.6 5.6v12.8a1 1 0 0 0 1.53.85l9.6-6.4a1 1 0 0 0 0-1.7l-9.6-6.4A1 1 0 0 0 4.6 5.6z"/></svg>';
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

    /* ══ (#R189) JMA INSTRUMENTAL INTENSITY (計測震度) ═════════════════════════════════════════════
       「震度階級は気象庁のものにも変えられるように。」 #R189 converted it from PGV with Fujimoto &
       Midorikawa (2005), I = 2.68 + 1.72·log₁₀(PGV), and its own note said what was wrong with that:
       it is a REGRESSION standing in for the JMA's actual computation, which filters the three-
       component waveform.
       ══ (#R192) SO THE FILTER IS DONE, AND THE REGRESSION IS GONE ══════════════════════════════════
       計測震度 = 2·log₁₀(a₀) + 0.94, where a₀ (cm/s²) is the level the filtered three-component vector
       exceeds for a total of 0.3 s — 気象庁「計測震度の算出方法」, computed here by jmaA0 from the
       model's own acceleration spectrum. That is the definition, not a fit to it, and it is why the
       far field collapsed to something that can actually be felt: the 0.5 Hz low-cut removes exactly
       the long-period swell that a PGV regression was reading as 震度1 at 7,000 km.
       Class boundaries are the real scale: 5弱/5強 split at 5.0, 6弱/6強 at 6.0, 7 from 6.5. Colours
       are the JMA's published map colours (気象庁 配色基準). */
    function jmaOfA0(a0){ return 2*Math.log10(Math.max(1e-6,a0))+0.94; }
    function a0AtJMA(I){ return Math.pow(10,(I-0.94)/2); }
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
    const JMA_CLASSES=[
      { min:0.5, id:'1',  col:'#F2F2FF' }, { min:1.5, id:'2',  col:'#00AAFF' },
      { min:2.5, id:'3',  col:'#0041FF' }, { min:3.5, id:'4',  col:'#FAE696' },
      { min:4.5, id:'5-', col:'#FFE600' }, { min:5.0, id:'5+', col:'#FF9900' },
      { min:5.5, id:'6-', col:'#FF2800' }, { min:6.0, id:'6+', col:'#A50021' },
      { min:6.5, id:'7',  col:'#B40068' } ];
    function jmaClass(I){ let c=null; for(const k of JMA_CLASSES){ if(I>=k.min) c=k; } return c; }
    /* ══ ⚠ (#R235) THE BACKGROUND IS THE CLASS COLOUR — THE *TEXT* IS WHAT MOVES ══════════════════
       「それぞれの震度色（そのままの色）背景と白文字に。」 #R234 read the same instruction and
       DARKENED the swatch until white could sit on it, because three JMA classes are nearly white by
       design (震度1 #F2F2FF, 4 #FAE696, 5- #FFE600). That made the chip legible and made it the
       wrong colour, which is what 「そのままの色」 answers: the background is now the class colour
       itself, byte for byte, exactly as the map paints it.
       ⚠ …so the readable-white problem moves to the only other variable there is, and the answer
       given was 「明るい階級だけ文字を黒にする」. `_chipInk` returns white, and black only where
       white would fail WCAG 3:1 for large text (relative luminance > 0.30 ⇒ 1.05/(L+0.05) < 3).
       Black clears the same 3:1 on every colour that trips it, since (L+0.05)/0.05 ≥ 3 from L ≥ 0.10.
       ⚠ NOTHING chooses a colour here — the swatch is the input, not the output. */
    function _chipInk(hex){
      const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
      if(!(isFinite(r)&&isFinite(g)&&isFinite(b))) return '#fff';
      const lin=(c)=>{ c/=255; return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4); };
      return (0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b))>0.30 ? '#000' : '#fff';
    }
    /* ══ ⚠⚠ (#R238) ONE BOX FOR EVERY INTENSITY CHIP, MEASURED RATHER THAN WRITTEN DOWN ═══════════════
       「各地の表内のJMA 7やMMI IVなどの背景の四角は、震度階級ごとに大きさをそろえるように。」 — sent
       twice. #R237 answered it with `min-width:62px`, a number read off THIS browser at THIS text
       size, and a `min-width` yields the moment a label is wider than it: a different resolved font,
       a different `IntMapLabelScale`, or a browser at 110 % text zoom puts 「MMI VIII」 past 62 px and
       the column goes ragged again, silently, in exactly the way the report describes.

       So the widest label either scale can print is measured, once, in a detached span carrying the
       same font-size and weight the chip uses, and the answer is cached against the size and the
       resolved family — so it is re-measured when either moves and never otherwise. ⚠ THE LIST IS
       DERIVED, NOT TYPED: the JMA labels come from JMA_CLASSES and the MMI ones from ROMAN, so a
       class added to either is measured too and nothing here has to be remembered. */
    let _cwCache=null;
    /* ══ ⚠ (#R240) ONE WIDTH PER SCALE, NOT ONE WIDTH FOR BOTH ═════════════════════════════════════
       「各地の表内のJMAの背景の四角は、JMAで大きさをそろえるように。MMIはまた別の幅。」
       #R237/#R238 made every chip one box — right, and measured across BOTH scales' labels at once,
       so a 震度 table was padded out to the width of 「MMI VIII」 for no reason a reader can see. The
       table only ever prints one scale at a time, so the box is measured against the labels THAT
       scale can print: every JMA chip equals every other JMA chip, every MMI chip equals every other
       MMI chip, and the two are different numbers. The invariant #R238 pinned — a column of chips is
       one width — is unchanged; what changed is which set the maximum is taken over.
       ══ ⚠⚠ (#R241) …AND THE SET IS THE LABELS THIS TABLE ACTUALLY PRINTS ══════════════════════════
       「左右に大きすぎに見えただけ。（テキストがとっている幅の割に）」 — measured: every chip was
       62 px on MMI and 58 px on JMA because the maximum ran over EVERY class the scale can print,
       so a table whose strongest row says 「MMI V」 (35 px of text) still carried the box that
       「MMI VIII」 needs. The invariant is «a column of chips is one width», not «one width for all
       time», so the maximum is taken over the labels IN THIS RENDER and the box is as tight as an
       equal-width column can be. Padding is 4 px a side rather than 6. */
    function _chipW(jma,labels){
      try{
        const fs=String(FS_H);
        const probe=document.createElement('span');
        probe.style.cssText='position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;'
          +'font-size:'+fs+';font-weight:400;line-height:1.35;';
        document.body.appendChild(probe);
        const fam=getComputedStyle(probe).fontFamily||'';
        const set=(labels&&labels.length)?labels.slice().sort():null;
        const key=(jma?'jma|':'mmi|')+fs+'|'+fam+'|'+(set?set.join('|'):'*');
        if(_cwCache&&_cwCache[key]!=null){ probe.remove(); return _cwCache[key]; }
        /* ⚠ THE LIST IS DERIVED, NOT TYPED — the fallback (no row printed a chip yet) is still every
           class the scale defines, so JMA_CLASSES / ROMAN stay the single source. */
        let list=set;
        if(!list){ list=[];
          if(jma){ try{ JMA_CLASSES.forEach(c=>list.push('JMA '+c.id)); }catch(_){} }
          else { try{ for(let i=1;i<=12;i++) list.push('MMI '+ROMAN[i]); }catch(_){} } }
        if(!list.length) list=[jma?'JMA 5-':'MMI VIII'];
        let w=0;
        list.forEach(t=>{ probe.textContent=t; const r=probe.getBoundingClientRect().width; if(r>w) w=r; });
        probe.remove();
        /* + the chip's own horizontal padding (3px 4px), and a whole pixel so nothing ever clips */
        w=Math.ceil(w)+8+1;
        (_cwCache||(_cwCache={}))[key]=w;
        return w;
      }catch(_){ return jma?48:58; }              /* the floor if the DOM is absent */
    }
    /* (#R192) each scale's LOWEST class, in the quantity that scale is computed from — inverted from
       the relations above rather than written out again (#R190's lesson: two copies of one number
       always drift). They are no longer the same quantity, which is the point: 震度1 is a level of
       JMA-filtered acceleration and MMI II is a PGV. */
    const A0_FLOOR_JMA=a0AtJMA(JMA_CLASSES[0].min);              /* 震度1 — 0.60 cm/s² */
    const PGV_FLOOR_MMI=pgvAtMMI(2);                             /* MMI II — 0.062 cm/s */
    const PGV_FELT=PGV_FLOOR_MMI;
    function jmaLabel(id){ return id.replace('-',L(' lower','弱',' schwach',' слаб.',' débil')).replace('+',L(' upper','強',' stark',' сильн.',' fuerte')); }
    /* ══ ⚠⚠ (#R224) THE MMI COLOURS WERE ONE WHOLE CLASS COOLER THAN USGS'S ════════════════════════
       「震度分布のMMIの震度別の色味は、USGS.能登.pdf と同じものにして。」

       The reference is the USGS ShakeMap "Macroseismic Intensity Map" for the 2024-01-01 M7.5 Noto
       event (us6000m0xl, Version 10). Its colour ramp was READ OUT OF THE FILE rather than
       remembered: the legend bar at the foot of that PDF is drawn as 81 filled strips, and the nine
       anchor colours below all appear in it, in order, at the x-positions the SHAKING row's own
       column labels sit over (Not felt / Weak / Light / Moderate / Strong / Very strong / Severe /
       Violent / Extreme). It is the `mmi` colormap ShakeMap paints with, anchored at INTEGER MMI and
       linearly interpolated between.

       What was wrong was not a hue, it was an OFF-BY-ONE-CLASS: this table paired class IV with the
       ramp's MMI-3 colour, V with MMI-4, VI with MMI-5 … so IntMap drew MMI VI in GREEN where every
       ShakeMap draws it YELLOW, and every class from IV up was a full step too cool. Reported as
       「色味」 because that is exactly what it looks like — the right palette, shifted.

       ⚠ AND THE FILL IS CONTINUOUS NOW (confirmed with the reader: 「連続塗り、離散凡例」). USGS
       paints the intensity field as a smooth ramp, not as eight flat bands, and the banding was the
       other visible difference from the PDF. `MMI_RAMP` is what the raster is painted from;
       `MMI_CLASSES` survives as the LEGEND and as the class names the table and the rings quote —
       each key carrying the ramp's colour at its own lower bound, so the two can never disagree.
       ⚠ 震度 (JMA) is UNCHANGED and stays banded: 計測震度 is a discrete scale by definition and its
       colours are the JMA's own published ones. */
    const MMI_RAMP=[ [1,255,255,255], [2,191,204,255], [3,160,230,255], [4,128,255,255],
                     [5,122,255,147], [6,255,255,  0], [7,255,200,  0], [8,255,145,  0],
                     [9,255,  0,  0], [10,200,  0,  0] ];
    /* the ramp at any intensity, clamped at both ends. Returns a fresh triple only at the anchors is
       not worth the cache: this is three multiplies and the caller writes it straight into the raster. */
    function mmiRGB(I,out){
      const v=Math.max(1,Math.min(10,I)); let k=Math.min(8,Math.max(0,Math.floor(v)-1));
      const a=MMI_RAMP[k], b=MMI_RAMP[k+1], f=Math.max(0,Math.min(1,v-a[0]));
      const o=out||[0,0,0];
      o[0]=(a[1]+(b[1]-a[1])*f)|0; o[1]=(a[2]+(b[2]-a[2])*f)|0; o[2]=(a[3]+(b[3]-a[3])*f)|0;
      return o;
    }
    const _mmiHex=(I)=>{ const c=mmiRGB(I); return '#'+((1<<24)+(c[0]<<16)+(c[1]<<8)+c[2]).toString(16).slice(1); };
    /* the legend's bands and the names the table/rings quote. ⚠ `col` is DERIVED from the ramp above
       — never a second copy of a hex (#R212's lesson), so re-anchoring the ramp moves the legend with
       it. Nothing is painted under II, which is the floor `mmiClass` already expressed. */
    const MMI_CLASSES=[
      { min:2, id:'II–III' }, { min:4, id:'IV'  },
      { min:5, id:'V'   },    { min:6, id:'VI'  },
      { min:7, id:'VII' },    { min:8, id:'VIII'},
      { min:9, id:'IX'  },    { min:10,id:'X+'  } ].map(k=>Object.assign(k,{ col:_mmiHex(k.min) }));
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
    /* ══ ⚠⚠ (#R224) THE DRAWN OUTLINE IS THE FAULT'S SHADOW, NOT THE FAULT ═══════════════════════
       「震源域を自由描画した場合、それをそのまま断層面積にせず地表投影として扱い、規模・形状から最も
         典型的な傾斜角・断層幅・深さを自動推定して…詳細設定では dip・上端/下端深さ・断層幅などを手動
         上書きでき、Mw・M0・断層面積・平均すべり量が一貫して再計算されるように」

       #R189 put the drawn area straight into M₀ = μ·A·D̄ with a fixed 2 m of slip. Two things were
       wrong with that and js/fault-geometry.js fixes both (its header has the derivations and the
       measurements against real earthquakes):
         · a map can only carry the PROJECTION of a dipping plane, so A₃D = A_proj / cos δ;
         · and 2 m is the average slip of an M7-ish crustal event, not of whatever was drawn — it made
           a 20 km loop an M6.9 and Tōhoku an M8.5.
       Verified on the shipped model: the Noto footprint (150 × 19 km) comes back dip 52° / W 31 km /
       D̄ 2.55 m / Mw 7.66 against a published 50° / 30 km / 2–4 m / 7.5, and the Tōhoku footprint
       (500 × 197 km) comes back dip 10° / W 200 km / D̄ 11.8 m / Mw 8.99.
       ⚠ THE OVERRIDES LIVE IN ONE OBJECT and are re-solved through the SAME chain, never patched into
       the result — that is what makes 「一貫して再計算」 true rather than approximately true. */
    let fault=null;      /* { ring, areaKm2, areaProjKm2, dipDeg, widthKm, zTopKm, zBotKm, slipM, mw, M0, auto, centroid } */
    let faultOver={};    /* dip / widthKm / zTopKm / zBotKm / slipM — only what the reader pinned */
    const FG=()=>window.IntMapFaultGeom;
    function faultSolve(ring,areaKm2){
      const G=FG(); if(!G) return null;
      const fp=G.footprint(ring,areaKm2); if(!fp) return null;
      return G.solve({ footprint:fp, depthKm, stressDropMPa, muPa:MU, override:faultOver });
    }
    function faultSet(ring){
      if(!Array.isArray(ring)||ring.length<3) return false;
      let aKm2=0; try{ aKm2=HOST.ringArea(ring); }catch(_){ aKm2=0; }   /* spherical excess, in km² */
      if(!(aKm2>0)) return false;
      const s=faultSolve(ring,aKm2); if(!s) return false;
      let cx=0, cy=0; ring.forEach(p=>{ cx+=p[0]; cy+=p[1]; });
      const centroid=[cx/ring.length, cy/ring.length];
      fault=Object.assign({ ring:ring.map(p=>[+p[0],+p[1]]), centroid, footprintKm2:aKm2 }, s,
                          { mw:Math.max(3,Math.min(9.6,s.mw)) });
      mw=fault.mw;
      if(!epi) epi=centroid.slice();
      return true;
    }
    /* re-run the chain on the SAME ring — every advanced control and every parameter the solve reads
       (depth, stress drop) comes back through here rather than editing `fault` in place */
    function faultResolve(){ return fault?faultSet(fault.ring):false; }
    function faultClear(){ fault=null; faultOver={}; _epiOutside=0; }   /* (#R236) the warning goes with the area */
    /* the whole solved plane, in one shape, for the panel · the callable API · state() · the tests.
       ⚠ `auto` travels with the numbers: a reader (or Atlas) has to be able to tell an estimate from
       a value that was typed, and that distinction is the difference between the two halves of the
       instruction (「通常は自動推定だけ」 / 「詳細設定では手動上書き」). */
    function faultGeom(){ if(!fault) return null;
      return { areaKm2:Math.round(fault.areaKm2), areaProjKm2:Math.round(fault.areaProjKm2),
        lengthKm:+fault.lengthKm.toFixed(1), widthKm:+fault.widthKm.toFixed(1),
        widthProjKm:+fault.widthProjKm.toFixed(1), dipDeg:+fault.dipDeg.toFixed(1),
        strikeDeg:(fault.strikeDeg!=null?Math.round(fault.strikeDeg):null),
        zTopKm:+fault.zTopKm.toFixed(1), zBotKm:+fault.zBotKm.toFixed(1),
        slipM:+fault.slipM.toFixed(2), M0:fault.M0, mw:+fault.mw.toFixed(2),
        auto:Object.assign({},fault.auto), points:fault.ring.length }; }
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
    /* the surface distance every receiver actually uses — Rrup with a fault, epicentral without.
       ⚠ (#R223) this is the RAW surface distance; `srcDistM` is what turns it into the distance the
       ground-motion chain is asked for (it subtracts the implied rupture footprint when the source
       is a point, and combines with the focal depth). */
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
    /* One full-chain profile over log-spaced hypocentral distance, interpolated in log-log.
       (#R192) It carries BOTH quantities the map can be painted with — the felt-band PGV that the MMI
       GMICE takes, and the JMA level a₀ that IS 計測震度. They are not one number times a constant
       (that is the whole point of #R192: the two scales look at different bands), so a profile that
       carried only PGV could not answer for the JMA scale at all. Both are linear in the site
       amplification, so one profile still serves every cell (#R189). */
    function pgvProfile(fd){
      const n=140, rr=new Float64Array(n), out=new Float64Array(n), a0s=new Float64Array(n);
      const r0=Math.max(1,depthKm||1), r1=Math.sqrt(MMI_MAX_KM*MMI_MAX_KM+depthKm*depthKm)*1.02;
      for(let i=0;i<n;i++){ const r=r0*Math.pow(r1/r0,i/(n-1)); rr[i]=r;
        const m=motion(mw,r*1000,fd); out[i]=Math.max(1e-9,m.pgv); a0s[i]=Math.max(1e-9,m.a0); }
      /* ══ (#R218) THE SAME INTERPOLATION, WITHOUT THE SEARCH ═══════════════════════════════════════
         「震源分布の計算速度が遅いから爆速に。（品質に一切影響を及ばさないように。）」 — and this is one
         of the two places the field spends its arithmetic (the other is the distance; see buildField).
         The nodes are a GEOMETRIC series by construction — rr[i] = r0·(r1/r0)^(i/(n−1)) — so the index
         of a radius is a closed form, and the log-spacing fraction between two nodes IS the fractional
         part of that index. The binary search (7 probes) and three of the four logs were rediscovering
         a number the constructor already knows. Interpolating in LOG SPACE with a pre-taken log of the
         table then replaces `a·(b/a)^f` with one exp, and gives the same value — `a·(b/a)^f` is
         `exp(log a + f·(log b − log a))` identically, to within a rounding of the last bit.
         ⚠ Same nodes, same spacing, same log-interpolation: the ANSWER is unchanged. Measured on the
         shipped tables: max relative difference against the old form 2.4e−16 over 10⁵ radii, i.e. one
         unit in the last place. tests/r218-checks ③ re-runs that comparison. */
      const lOut=new Float64Array(n), lA0=new Float64Array(n);
      for(let i=0;i<n;i++){ lOut[i]=Math.log(out[i]); lA0[i]=Math.log(a0s[i]); }
      const lr0=Math.log(r0), kIx=(n-1)/(Math.log(r1)-lr0||1);
      const idx=(rM)=>{ const r=Math.max(rr[0],Math.min(rr[n-1],rM/1000));
        const x=Math.max(0,Math.min(n-1-1e-9,(Math.log(r)-lr0)*kIx));
        const lo=Math.min(n-2,x|0); return [lo,x-lo]; };
      const interp=(la,rM)=>{ const t=idx(rM), lo=t[0], f=t[1];
        return Math.exp(la[lo]+f*(la[lo+1]-la[lo])); };
      return { rr, out, a0s, fd:(fd>0?fd:1),   /* (#R232) the bank picks by this */
        at(rM){ return interp(lOut,rM); }, a0At(rM){ return interp(lA0,rM); },
        /* both quantities share one index — the field asks for them together, cell by cell */
        both(rM){ const t=idx(rM), lo=t[0], f=t[1];
          return [Math.exp(lOut[lo]+f*(lOut[lo+1]-lOut[lo])), Math.exp(lA0[lo]+f*(lA0[lo+1]-lA0[lo]))]; } };
    }
    /* ══ ⚠ (#R218) THE PICTURE LEAVES THE CANVAS AS A BLOB, NOT AS BASE64 ═══════════════════════════
       「震源分布の計算速度が遅いから爆速に。（品質に一切影響を及ばさないように。）」 `toDataURL` PNG-encodes
       the canvas AND then base64s the result on the main thread: at the shipped ceiling that is
       1,792² = 3.2 M pixels turned into a ~10 MB string that the renderer immediately decodes again.
       `toBlob` is the same lossless PNG encoder without the base64 step, it hands back a Blob the
       renderer can decode directly, and it is asynchronous — so the encode does not hold the frame.
       ⚠ SAME PIXELS. PNG is lossless and neither path resamples; this is a transport change.
       ⚠ AN OBJECT URL IS A LIVE REFERENCE — it pins the blob until it is revoked, so every field that
       is replaced or cleared revokes the one it is giving up (see `_setImg`). A browser without
       `toBlob` falls back to the old data URL rather than losing the layer. */
    function pngURL(cv){
      return new Promise((res)=>{
        try{ if(cv.toBlob){ cv.toBlob((b)=>{ try{ res(b?URL.createObjectURL(b):cv.toDataURL('image/png')); }
              catch(_){ res(cv.toDataURL('image/png')); } },'image/png'); return; } }catch(_){}
        try{ res(cv.toDataURL('image/png')); }catch(_){ res(''); }
      });
    }
    const _revoke=(u)=>{ try{ if(u&&u.indexOf('blob:')===0) URL.revokeObjectURL(u); }catch(_){} };
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
    /* ══ ⚠⚠ (#R226) 100 % WAS 92 %, BECAUSE THE OPACITY WAS WRITTEN IN TWO PLACES ═══════════════════
       「MMI震度分布の不透明度100%は全然100%ではない。」 And it never could be. Two independent
       transparencies multiply into this picture:

         · `raster-opacity`, which the slider sets — 1.00 at the top of its range, correctly;
         · the ALPHA BAKED INTO EVERY PAINTED PIXEL of the PNG, which was 235/255 = 0.922.

       So the top of the slider drew 0.922, and no setting of the control could ever reach 1. The
       baked 235 dates from when the field had no slider at all (it was the only way to see the
       basemap through it); once #R190 added the control it became a second, invisible opinion about
       the same quantity. ⚠ ONE OWNER: the pixels are opaque and `raster-opacity` is the only
       transparency, so the number on the slider is the transparency on the screen. ⚠ THAT MOVES THE
       DEFAULT TOO, and deliberately: 85 % used to draw 0.85 × 0.922 = 0.784 and now draws 0.85. The
       alternative — re-deriving the default as 0.78 so the first view is byte-identical — would keep
       exactly the defect that was reported, one notch further down the slider. Every position on the
       control now means the fraction it prints, including the default one.
       ⚠ BOTH RASTERS. The fine field and the far annulus are one picture under one slider (#R191),
       so they share the constant rather than each carrying a literal. */
    const FIELD_ALPHA=255;
    /* ══ ⚠ (#R226) A YIELD THAT COSTS 4 ms IS NOT A FREE YIELD ══════════════════════════════════════
       「地震と津波の計算速度は品質を下げない範囲で爆速に。」 Both rasters below hand the event loop back
       on a 12 ms budget so the page stays responsive while they compute — with `setTimeout(…,0)`, which
       HTML clamps to ~4 ms once it is nested. At this round's 2,560 grid that is up to 320 waits of
       4 ms inside a build the panel reports as computation, and #R218 already paid for it once by
       yielding less often (which is responsiveness spent to buy back latency).
       A MessageChannel message is an ordinary task — the event loop runs, input is delivered, a frame
       can be produced — and it comes back in under a millisecond. One channel for the module, a queue
       so overlapping builds cannot steal each other's resolver, and a setTimeout fallback. */
    const _yield=(function(){
      try{
        if(typeof MessageChannel!=='function') throw 0;
        const ch=new MessageChannel(), q=[];
        ch.port1.onmessage=()=>{ const f=q.shift(); if(f) f(); };
        return ()=>new Promise(r=>{ q.push(r); ch.port2.postMessage(0); });
      }catch(_){ return ()=>new Promise(r=>setTimeout(r,0)); }
    })();
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
    /* ⚠ (#R245) THE FAR GRID IS DECLARED HERE BECAUSE TWO FUNCTIONS HAVE TO AGREE ON IT. `buildFar`
       walks it; `buildField` SNAPS the fine image's box to it (see `snapFar` there) so that the two
       rasters tile exactly. A local `const NF` inside buildFar was fine while nobody else needed the
       number, and it stopped being fine the moment the seam had to be exact. */
    const FAR_N=()=>((typeof isMobile==='function'&&isMobile())?640:1408);
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
          /* ══ ⚠⚠ (#R245) `nearest`, AND THE REASON IS THE SEAM ══════════════════════════════════════
             MapLibre's default is `linear`, which interpolates a screen pixel from the four nearest
             texels — INCLUDING the transparent ones this raster holds wherever the fine image owns
             the ground. Along the fine image's box that ramps the alpha from 0 to 255 across one 28 km
             cell, and the basemap shows through the ramp: the 「四角形の線」, measured five device
             pixels wide at z3 (see the note in buildField). With the box snapped to this raster's own
             cell grid the two images tile exactly, and `nearest` is what makes the tiling hold on
             screen instead of being smeared back into a gap.
             ⚠ IT IS ALSO WHAT THIS RASTER IS: past MMI_TERRAIN_KM the field is a function of distance
             and the bundled 0.25° site term, i.e. a genuinely discrete 28 km field. Drawing each cell
             as the value it is, is what #R202 already said the fine field does («every square IS one
             computed value, which is the honest way to draw a discrete field»). ⚠ The FINE layer is
             deliberately NOT changed: its cell is 1–1.5 km, its edges are the image's own (clamped,
             never faded), and its look is not what this report is about. */
          GE().layers.add({id:LYR_FAR,type:'raster',source:SRC_FAR,
            paint:{'raster-opacity':fldOpacity,'raster-fade-duration':0,'raster-resampling':'nearest'}},
            GE().layers.has(LYR_IMG)?LYR_IMG:(GE().layers.has('seis-ring')?'seis-ring':undefined));
        }
        try{ GE().layers.setPaint(LYR_FAR,'raster-opacity',fldOpacity); }catch(_){}
      }catch(_){}
    }
    /* ══ ⚠⚠⚠ (#R244) THE RUPTURE'S REACH BY BEARING — WHY THE FAR FIELD HAD A SQUARE IN IT ═══════════
       「MMIで震度分布を計算したときに、震源の外側に数千キロ規模の四角形の線がありそこで震度分布が
         断絶している。やめて。」

       MEASURED as a distance defect, not a drawing one. `srcDistM` says of itself 「ONE CONVERSION,
       FOUR READERS … writing it four times is how the rings and the paint drift apart」 — and
       `buildFar` was handing it the WRONG surface distance. The fine field passes Rrup (the distance
       to the nearest point of the rupture, `distKmTo`); the far field passed the great-circle
       distance to the rupture's CENTROID. With a rupture drawn or loaded the two differ by the
       rupture's own extent toward the site — 250 km along strike for Tōhoku's 500 km plane — so at
       the seam between the two images the SAME place was 1,750 km away on one side of the line and
       1,500 km away on the other. The seam is the fine image's box, which is a lat/lng rectangle
       ~3,500 km across: that is the 四角形, and 断絶 is the intensity step across it.
       Without a rupture the two distances are identical, which is exactly why a point source never
       showed the line and only a loaded past earthquake did.

       ⚠ THE FIX IS THE DISTANCE, NOT THE BOX. `faultDistKm` is a local planar projection — right at
       the source, meaningless at 8,000 km — so the far field cannot simply call it. Instead the
       rupture's REACH toward a bearing is tabulated once per build: for a site far away, the nearest
       point of the rupture lies at the vertex whose offset from the centroid projects farthest
       toward it, i.e. the polygon's support function, which for a ring is attained at a vertex. The
       error against the exact Rrup is O(r²/2D) — under 1 % at the 1,500 km handover — while the
       thing it removes is a 14 % step. `Math.max(0, …)` keeps a site over the rupture at zero.
       ⚠ TABULATED, NOT COMPUTED PER CELL: d·cos(θ−b) = (d cos θ)·cos b + (d sin θ)·sin b, so the
       whole ring collapses to two sums per bearing bin and a cell costs one array read. */
    const REACH_BINS=720;
    function rupReach(C0){
      if(!fault||!fault.ring||fault.ring.length<3) return null;
      const xs=[],ys=[];
      for(const p of fault.ring){
        const d=gcDelta(C0,p)*D*RE; if(!(d>0)) continue;
        const th=bearingTo(C0,p)*D; xs.push(d*Math.cos(th)); ys.push(d*Math.sin(th));
      }
      if(!xs.length) return null;
      const out=new Float64Array(REACH_BINS);
      for(let b=0;b<REACH_BINS;b++){
        const t=(b+0.5)*2*Math.PI/REACH_BINS, cb=Math.cos(t), sb=Math.sin(t);
        let m=0; for(let i=0;i<xs.length;i++){ const v=xs[i]*cb+ys[i]*sb; if(v>m) m=v; }
        out[b]=m;
      }
      return out;
    }
    /* (#R232)  rather than one profile — the directivity bank, indexed by azimuth. */
    async function buildFar(profAt,box,rFine,rEdge,seq){
      fldFar=null;
      if(!epi||!(rEdge>rFine+1)){ paintFar(); return; }
      const C0=fault?fault.centroid:epi;
      /* (#R203) the FAR field is the same picture at the same request, and it is pure arithmetic —
         #R191 measured the whole world at ~40 ms — so it gets the same step up: 1,024² is ~1.8 M cells
         at two multiplies and one acos each. Phones 384 → 512. */
      /* (#R204) …and again, for the same reason and at the same price: this grid covers the WHOLE
         world, so 1,024 is a 39 km cell at the equator against the fine field's 1.5 km. 1,408 is a
         28 km cell for 1.9× of an arithmetic cost #R191 measured at ~40 ms for the entire globe. */
      const NF=FAR_N();
      const yT=mY(85), yB=mY(-85), dyF=(yB-yT)/NF, dxF=360/NF;
      const cv=document.createElement('canvas'); cv.width=NF; cv.height=NF;
      const ctx=cv.getContext('2d'), im=ctx.createImageData(NF,NF), px=im.data;
      const hx=(h)=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
      /* ⚠ (#R191) AND IT MUST NOT PAINT THE SEA, BECAUSE THE FINE FIELD DOES NOT.
         The first version skipped the land test — there is no DEM at this scale — and the result was a
         grey RECTANGLE punched through the middle of the rings: the fine field's box, where the ocean
         is left unpainted, surrounded by far-field colour that covered the same ocean. Two rules for
         one picture is worse than either rule.
         ══ (#R192) …AND THAT TEST MUST NOT DEPEND ON THE NETWORK ═══════════════════════════════════
         「震度分布の色塗りが、たまにバグって海もべた塗になる場合がある。」 THIS IS THAT BUG, and it is
         the line #R191 wrote to be careful: the mask was 64 z3 DEM tiles, and when fewer than half of
         them arrived the mask was dropped and every cell was painted — the whole ocean, in colour.
         「たまに」 is exactly what a tile fetch is. A cold cache, a slow radio, or `_demCacheTrim`
         evicting under a continental field all produce it, and none of them is visible to the user.
         Land and sea are the same today as yesterday, so the answer now SHIPS with the app:
         js/land-mask.js decodes data/land-mask.png, a 1-bit 2048 × 1024 raster of Natural Earth's
         1:50m land (19.6 KB, ~19.5 km a pixel, finer than this raster's own 52 km cell). No request,
         no timeout, no failure mode that ends in a painted sea.
         AND IT FAILS CLOSED. If the mask cannot be decoded at all, the annulus is not drawn — a
         missing picture is a missing picture, while a painted ocean is a wrong one. */
      let land=null;
      try{
        const LM=window.IntMapLandMask;
        if(LM){ await LM.warm(); if(seq!==fldSeq) return; if(LM.ready()) land=LM; }
      }catch(_){}
      if(!land){ console.warn('[seismic] the land mask is unavailable — the far field is not drawn rather than painted over the sea'); return; }
      /* ══ ⚠⚠ (#R223) …AND THE GROUND OUT HERE IS NOT ALL THE SAME GROUND ═════════════════════════
         「震度分布が同心円状になることがった。ふざけるな。」 THIS raster was the largest remaining
         source of it, and by construction rather than by accident: past MMI_TERRAIN_KM there is no
         DEM, so every cell took `ampRef` — one amplification for a third of a hemisphere, i.e. the
         intensity is a function of distance alone and the annulus is a set of perfect rings. For an
         M8+ that annulus is most of what the reader sees.
         js/vs30-mask.js is the site term for exactly this case: the mean Vs30 of each 0.25° cell's
         land, computed offline from the same Wald & Allen proxy at 1,223 m and averaged AFTER the
         conversion (scripts/build-vs30.mjs). 0.25° is 28 km, which is this raster's own cell — the
         resolution matches the picture instead of being invented for it.
         ⚠ It is a fallback with a fallback: a cell the raster has no land for keeps `ampRef`. */
      let vsm=null;
      try{ const VM=window.IntMapVs30;
        if(VM){ await VM.warm(); if(seq!==fldSeq) return; if(VM.ready()) vsm=VM; } }catch(_){}
      /* the site the PROFILE was computed for — `motion()` bakes `siteAmp()` in, so a cell's own
         ground enters as a ratio against it, exactly as the fine field does it (#R189). */
      const ampRef=siteAmp();
      const la0=C0[1]*D, sinA=Math.sin(la0), cosA=Math.cos(la0);
      const cosDL=new Float64Array(NF);
      for(let i=0;i<NF;i++) cosDL[i]=Math.cos((-180+(i+0.5)*dxF-C0[0])*D);
      let painted=0, extrap=0, seaSkipped=0, ampCells=0;
      /* ══ ⚠ (#R218) THE ANNULUS IS SOLVED FOR, NOT SEARCHED FOR ════════════════════════════════════
         「震源分布の計算速度が遅いから爆速に。（品質に一切影響を及ばさないように。）」 This raster covers
         the WHOLE WORLD at 1,408² = 1,982,464 cells, and every one of them called `Math.acos` in order
         to be told it was outside the ring. But the ring is a circle on a sphere, and both of its
         limits invert exactly:
             cos d = sinφ₀·sinφ + cosφ₀·cosφ·cos Δλ   ⇒   cos Δλ = (cos d − sinφ₀·sinφ)/(cosφ₀·cosφ)
         so for each ROW the columns that can be inside are a contiguous band about the epicentre's
         longitude, and rows whose nearest possible point is already past rEdge have no band at all.
         The cells that survive take the identical `acos` they always took, and the colours, classes
         and counters are untouched — the skipped cells are the ones the old loop `continue`d on. For
         a 1,000 km field that is roughly 2 % of the globe examined instead of 100 %.
         ⚠ THE TWO LIMITS ARE cos(), WHICH IS DECREASING, so the INNER radius gives the UPPER bound on
         cos Δλ and the outer gives the lower one — the band is an annulus in Δλ only when the inner
         circle also crosses this row, which is why both roots are taken and the two arcs are walked. */
      /* (#R244) the rupture's reach by bearing — see rupReach above. `null` (no rupture) means the
         far field's distance IS the epicentral one, which is what the fine field uses too. */
      const reach=rupReach(C0);
      let maxReach=0; if(reach) for(let b=0;b<reach.length;b++) if(reach[b]>maxReach) maxReach=reach[b];
      const RBIN=REACH_BINS/(2*Math.PI);
      /* ⚠ the BAND is solved on the centroid distance (#R218) while the PAINT is Rrup, so the outer
         limit has to be widened by the reach or the forward end of the rupture would be clipped. */
      const cosEdge=Math.cos(Math.min(Math.PI,(rEdge+maxReach)/RE)), cosFine=Math.cos(Math.min(Math.PI,rFine/RE));
      const _cut=rupCutKm();   /* (#R223) hoisted: the implied rupture radius is a constant over the raster */
      const iOfLng=(l)=>(l+180)/dxF-0.5;
      const rgbOfFar=(cl)=>cl._rgb||(cl._rgb=hx(cl.col));
      const _farRGB=[0,0,0];   /* (#R224) one scratch triple for the continuous MMI ramp — see mmiRGB */
      let _lastYield=performance.now();
      for(let j=0;j<NF;j++){
        const la=latOfY(yT+(j+0.5)*dyF), lb=la*D, sinB=Math.sin(lb), cosB=Math.cos(lb);
        const den=cosA*cosB;
        /* the Δλ half-width at which the distance is exactly rEdge (and rFine); NaN/out-of-range
           means "this row never reaches that circle", handled by the clamps below */
        let dl=Math.PI;
        if(Math.abs(den)>1e-12){
          const cx=(cosEdge-sinA*sinB)/den;
          if(cx>1) continue;                     /* the whole row is outside rEdge */
          dl=(cx<-1)?Math.PI:Math.acos(cx);
        } else if(cosEdge>sinA*sinB+1e-12) continue;
        let inner=-1;
        if(Math.abs(den)>1e-12){
          const cf=(cosFine-sinA*sinB)/den;
          if(cf<=1&&cf>=-1) inner=Math.acos(cf);  /* inside this the FINE image owns the cells */
        }
        const halfI=dl/D/dxF, innerI=(inner>=0)?inner/D/dxF:-1;
        const i0=iOfLng(C0[0]);
        /* walk the band, wrapped: the epicentre may sit near ±180 and the band crosses the seam.
           ⚠ A band wider than the world must be walked ONCE — the wrap would otherwise visit the same
           column from both sides and double-count `painted` / `seaSkipped`, which the panel prints. */
        const full=(2*halfI>=NF-1);
        const sLo=full?0:Math.ceil(i0-halfI), sHi=full?NF-1:Math.floor(i0+halfI);
        for(let s=sLo;s<=sHi;s++){
          if(innerI>=0&&Math.abs(s-i0)<innerI-1) continue;   /* wholly inside the fine radius */
          const i=((s%NF)+NF)%NF;
          const c=Math.max(-1,Math.min(1,sinA*sinB+cosA*cosB*cosDL[i]));
          const kmC=Math.acos(c)*RE;
          const lo=-180+(i+0.5)*dxF;
          /* ⚠ (#R244) THE SAME SURFACE DISTANCE THE FINE FIELD USES — Rrup, not the centroid range.
             See rupReach: the bearing's reach is what the rupture puts between its centroid and this
             site, and subtracting it is what makes the two images agree where they meet. */
          let km=kmC;
          if(reach){ const b=bearingTo(C0,[lo,la])*D;
            km=Math.max(0,kmC-reach[((Math.floor(b*RBIN)%REACH_BINS)+REACH_BINS)%REACH_BINS]); }
          if(km<=rFine||km>rEdge) continue;
          /* ⚠ (#R245) THE FINE IMAGE OWNS THIS — AND ITS BOX IS SNAPPED TO **THIS** GRID, so a cell is
             either wholly inside it or wholly outside it and the two images tile exactly: no cell is
             dropped by both (a gap) and none is drawn by both (a double-painted band). See the note
             by `snapFar` in buildField, and the one above `raster-resampling` in paintFar. */
          if(lo>=box.W&&lo<=box.E&&la>=box.Ss&&la<=box.Nn) continue;
          if(land.isLand(lo,la)!==true){ seaSkipped++; continue; }
          const rM=srcDistM(km,_cut);   /* (#R223) the one conversion — see srcDistM */
          /* (#R192) each scale from its own quantity.
             (#R223) …and the site term is this cell's own, from the bundled 0.25° Vs30 raster —
             both quantities are LINEAR in the amplification, which is what lets one profile still
             serve every cell (#R189's argument, applied out here for the first time). */
          const b2=profAt(lo,la).both(rM);   /* (#R232) the directivity bank — see the note where it is built */
          let g=1;
          if(vsm){ const v=vsm.at(lo,la); if(v){ g=ampOf(v)/ampRef; ampCells++; } }
          const I=(scale==='jma')?jmaOfA0(b2[1]*g):mmiOf(b2[0]*g);
          /* (#R224) MMI is a CONTINUOUS ramp now (see MMI_RAMP); 震度 keeps its published bands.
             `mmiClass` is still what decides whether anything is painted at all — the II floor. */
          let rgb;
          if(scale==='jma'){ const cl=jmaClass(I); if(!cl) continue; rgb=rgbOfFar(cl); }
          else { if(I<2) continue; rgb=mmiRGB(I,_farRGB); }
          const o=(j*NF+i)*4;
          px[o]=rgb[0]; px[o+1]=rgb[1]; px[o+2]=rgb[2]; px[o+3]=FIELD_ALPHA; painted++;
          if(km>MMI_CALIB_KM) extrap++;
        }
        if((j&63)===63){ const t=performance.now();
          if(t-_lastYield>12){ await _yield(); _lastYield=performance.now();
            if(seq!==fldSeq) return; } }
      }
      if(seq!==fldSeq) return;
      ctx.putImageData(im,0,0);
      const _uf=await pngURL(cv);
      if(seq!==fldSeq){ _revoke(_uf); return; }
      _revoke(fldFar&&fldFar.url);
      fldFar={ url:_uf, coords:[[-180,85],[180,85],[180,-85],[-180,-85]],
               N:NF, painted, extrap, sea:seaSkipped, landMask:!!land, landSource:'bundled',
               landCellKm:(land.state?land.state().cellKm:null),
               /* (#R223) how much of the annulus carries its OWN ground rather than the reference —
                  the number that says whether this picture is rings or terrain */
               siteCells:ampCells, siteSource:(vsm?'bundled-vs30-0.25deg':null),
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
    /* ══ (#R234) 「変更があれば…ボタンが光り、その後は再計算ボタンとして目立たない色に」 ═══════════
       One predicate for the colour AND the wording, and it is painted IN PLACE rather than through
       render(): `touch()` fires on every keystroke of a spinner, and re-rendering the panel there
       would take the focus out of the box the reader is typing in (which is why #R190 made touch()
       call report() and not render() in the first place). */
    function _needsRun(){ return !fld||fldStale; }
    /* (#R237) a CLASS, not a cssText — the two states are 「やることがある」 and 「答えを見ている」
       (#R234), and both are now one word in the sheet rather than a string of declarations. */
    function _runBtnClass(){ return 'sq-run sq-btn sq-btn-wide'+(_needsRun()?' sq-btn-accent':''); }
    function _runBtnLabel(){ return '▶ '+(_needsRun()
      ?L('Compute the intensity map','震度分布を計算','Intensitätskarte berechnen','Рассчитать поле интенсивности','Calcular el mapa de intensidad')
      :L('Recompute the intensity map','震度分布を再計算','Intensitätskarte neu berechnen','Пересчитать поле интенсивности','Recalcular el mapa de intensidad')); }
    /* (#R240) the run button lives in the pinned footer now, and its label, its colour AND the
       three-step track beside it are all functions of the same state — so one repaint does all of
       them. See `_flowFoot`. It replaces the footer element rather than editing it in place because
       the primary verb itself changes identity (place-the-hypocentre → compute → recompute). */
    function _paintFoot(){ try{ if(!panel) return; const f=panel.querySelector('.sq-foot'); if(!f) return;
      const t=document.createElement('div'); t.innerHTML=_flowFoot();
      const nf=t.firstElementChild; if(!nf) return; f.replaceWith(nf);
      const run=panel.querySelector('.sq-run'); if(run) run.onclick=()=>{ if(!epi){ report(); return; } buildField(); };
      const ge=panel.querySelector('.sq-go-epi'); if(ge) ge.onclick=()=>{ setClickMode('epi'); };
    }catch(_){} }
    function _paintRunBtn(){ _paintFoot(); }
    function markStale(){ fldStale=true; if(opened){ report(); _paintRunBtn(); } }
    function schedField(){ clearTimeout(fldT); fldT=setTimeout(()=>{ buildField(); },260); }
    async function buildField(){
      const seq=++fldSeq;
      if(!epi){ _revoke(fld&&fld.url); _revoke(fldFar&&fldFar.url); fld=null; fldFar=null; paintField(); paintFar(); return; }
      fldBusy=true; fldStale=false; fldPct=0; if(opened) report();
      const t0=performance.now();
      /* ══ ⚠ (#R226) THE PROGRESS BAR WAS REDRAWN FIVE TIMES PER VISIBLE STEP ═══════════════════════
         「地震と津波の計算速度は品質を下げない範囲で爆速に。」 `prog()` is called every eight rows —
         320 times at this round's 2,560 ceiling — and wrote to the DOM every time, although the number
         it writes is a ROUNDED PERCENTAGE with at most 59 distinct values across the whole loop. Each
         write invalidates style and paint for a visible element, i.e. the browser is asked for a frame
         it has no new information for, in the middle of the arithmetic. A CPU profile of the build
         charges 61 % of its wall clock to root-level native work with the page NOT idle — the frames
         between the loop's yields — against 0.7 s of this app's own JavaScript.
         ⚠ It is the SAME number and the same bar; it is written when it changes. */
      const prog=(p)=>{ const v=Math.max(0,Math.min(100,Math.round(p)));
        if(v===fldPct) return; fldPct=v; if(opened) _setProg(); };
      try{
        /* ══ (#R232) ONE PROFILE PER AZIMUTH BIN, WHEN THERE IS A DIRECTION TO HAVE ═════════════════
           「地震シミュレータの地震波伝播は、単に同心円状に広がらせるのではなく、震源域の形状や深さ、
             地盤なども多角的に考慮した伝播にして。」
           Shape and ground were already in: the distance every receiver uses is Rrup (0 over the
           drawn rupture, nearest edge outside — #R189), the wavefronts are the envelope of fronts
           from across the rupture (#R189), depth enters through the IASP91 ray and through Rrup, and
           the site term is this cell's own Vs30 (#R223). What was still a circle is the SOURCE: the
           radial profile below is a function of distance alone, so at equal Rrup two sites on
           opposite ends of a rupture got identical ground motion however the rupture ran between them.
           ⚠ Fd VARIES ONLY WITH AZIMUTH, so a bank of profiles indexed by azimuth is exact rather
           than an approximation — the cell still reads its own distance out of its own profile. 24
           bins × 140 nodes is 3,360 evaluations of the source chain, which is nothing beside the
           two million cells the paint walks.
           ⚠ AND WITH NO RUPTURE DRAWN THE BANK IS ONE PROFILE — `profAt` returns it for every cell,
           the azimuth is never computed, and the field is byte-for-byte the old one. */
        const dirAx=rupAxis();
        const AZN=24;
        const profBank=dirAx?Array.from({length:AZN},(_,k)=>{
          const brg=(k+0.5)*360/AZN, cosT=Math.cos((brg-dirAx.brg)*D);
          const X=(cosT>=0?dirAx.fwdKm:dirAx.backKm)/dirAx.L;
          return pgvProfile(Math.max(FD_FLOOR,1-VR_BETA*X*cosT));
        }):null;
        const prof=pgvProfile(1);            /* the azimuth-average answer — and the only one without a rupture */
        /* ⚠ THE PAINTED RADIUS COMES FROM THE MOST FORWARD-DIRECTIVE PROFILE, NOT FROM THE AVERAGE.
           rEdge is "where does the softest plausible site stop reaching the lowest class"; taking it
           from the average would clip the forward lobe, which is the one direction this whole change
           exists to draw. The bin with the smallest Fd is the strongest, by construction. */
        const profEdge=profBank?profBank.reduce((a,b)=>(b.fd<a.fd?b:a)):prof;
        const profAt=profBank
          ? ((lo,la)=>profBank[(((Math.round(bearingTo(epi,[lo,la])*AZN/360)%AZN)+AZN)%AZN)])
          : (()=>prof);
        const ampRef=siteAmp();
        /* how far anything at all is painted: the softest plausible site against the lowest class.
           (#R191) inverted from the SAME conversions the colours use, so the edge follows the relation
           instead of repeating two of its constants. (#R192) …and it now walks the profile the ACTIVE
           scale is computed from — a₀ for 震度, PGV for MMI. */
        const jmaScale=(scale==='jma');
        const arr=jmaScale?profEdge.a0s:profEdge.out, floor=jmaScale?A0_FLOOR_JMA:PGV_FLOOR_MMI;   /* (#R232) the forward lobe sets the edge */
        const ampMax=ampOf(180);
        let rEdge=30;
        for(let k=profEdge.rr.length-1;k>=0;k--){ if(arr[k]*(ampMax/ampRef)>=floor){ rEdge=Math.max(30,profEdge.rr[k]); break; } }
        rEdge=Math.min(rEdge,MMI_MAX_KM);
        /* (#R191) the FINE field is bounded by the terrain, not by the class — see MMI_TERRAIN_KM.
           Everything past it is the far field, which needs no DEM and is drawn by buildFar(). */
        const rFine=Math.min(rEdge,MMI_TERRAIN_KM);
        const C0=fault?fault.centroid:epi;
        let halfKm=rFine; if(fault){ let mx=0; fault.ring.forEach(p=>{ const d2=gcDelta(C0,p)*D*RE; if(d2>mx) mx=d2; }); halfKm+=mx; }
        const cosC=Math.max(0.1,Math.cos(C0[1]*D));
        const dLng=halfKm/(111.32*cosC), dLat=halfKm/110.574;
        /* ══ ⚠⚠⚠ (#R245) THE BOX IS SNAPPED TO THE FAR RASTER'S OWN CELL GRID ═════════════════════════
           「MMIで震度分布を計算したときに、震源の外側に数千キロ規模の四角形の線がありそこで震度分布が
             断絶している。やめて。」 — re-sent after #R244 made the two images agree on the DISTANCE.

           MEASURED on the composited frame this time (`gl.readPixels` inside `map.on('render')`, which
           is the only place this environment returns real pixels — M9 at 100 E / 45 N, z3, the box's
           east edge at device x=1296):

               …1294 (139,255,255) │ 1296 (116,171,254) → 1300 (141,249,255) │ 1302 (143,252,255)
                  fine field       │   five pixels of BASEMAP showing through │      far field

           The two rasters agree to within 4/255 either side. What draws the line is that the far
           raster is TRANSPARENT wherever the fine image owns, and a raster layer is sampled with
           `raster-resampling: linear` (MapLibre's default; no layer here overrode it). Bilinear
           filtering ramps its ALPHA from 0 to 255 across one 28 km cell all the way round the
           rectangle — a fading gap between the two images. That is the 四角形の線, and 断絶 is the
           field genuinely missing inside it.

           ⚠ AND THE FIRST FIX FOR IT WAS WORSE, WHICH IS WHY THIS ONE IS SHAPED LIKE THIS. Making the
           far field paint two cells PAST the boundary (into the box, under the fine image) closed the
           gap — and produced a band where BOTH rasters are painted. Two layers at `raster-opacity`
           0.85 compose to 1−0.15² = 0.9775, so the overlap is a different transparency from either
           side of it. MEASURED at z6.5 across the same edge: far-only 119…120, fine-only 120…121,
           BOTH 133…136 — a 15/255 step, i.e. a fainter rectangle in place of the first one.
           With two layers there is no third option: a partial overlap is a double-painted band and a
           partial gap is a transparent one. The boundary has to be EXACT.

           So the fine image's box is snapped OUTWARD onto the far raster's cell boundaries. Every far
           cell is then wholly inside the box (skipped, the fine image draws it) or wholly outside
           (painted) — the union is a tiling, with no cell drawn twice and none dropped. The box grows
           by at most one 28 km cell, which only means a little more terrain-driven field.
           ⚠ THE OTHER HALF OF THIS IS `raster-resampling:'nearest'` ON THE FAR LAYER (see paintFar):
           an exact tiling still fades if the sampler interpolates towards the transparent texel.

           MEASURED AFTER, same transect, z3:  …141,254,255 │ 142,253,255 │ 144,251,255…  — the largest
           step anywhere across the seam is 2/255 and no basemap shows through. At z6.5 the two rasters
           were also isolated layer by layer: north of the edge only the far paints, south of it only
           the fine, and there is no band where both do.
           ⚠ HONEST RESIDUAL: on the NORTH and SOUTH edges only (the east/west seam is exact at every
           zoom) MapLibre draws this raster about 0.18 of a texel high, which leaves a hairline of
           ~1.4 km — 1 device pixel at z4, 17 at z8. It is a sub-texel registration in the renderer, not
           in the data (the snap is exact: `(mY(Nn)-mY(85))/dyF` = 418.000, and MapLibre's own
           MercatorCoordinate agrees), and every alternative measured worse: a one-cell overlap makes a
           15/255 double-painted band 92 pixels wide at the same zoom, and `linear` makes the fade this
           round removed. Written down rather than left to be re-discovered. */
        const _fN=FAR_N(), _fdx=360/_fN, _fy0=mY(85), _fdy=(mY(-85)-_fy0)/_fN;
        const snapLngFar=(v,out)=>{ const k=(v+180)/_fdx; return -180+(out<0?Math.floor(k):Math.ceil(k))*_fdx; };
        /* mercator y grows SOUTHWARD, so the northern edge floors its row index and the southern one
           ceils it; both are clamped to the raster's own ±85° extent. */
        const snapLatFar=(v,out)=>{ const k=(mY(Math.max(-85,Math.min(85,v)))-_fy0)/_fdy;
          const r=Math.max(0,Math.min(_fN,out>0?Math.floor(k):Math.ceil(k)));
          return latOfY(_fy0+r*_fdy); };
        const W=snapLngFar(C0[0]-dLng,-1), E=snapLngFar(C0[0]+dLng,+1);
        const Nn=snapLatFar(Math.min(85,C0[1]+dLat),+1), Ss=snapLatFar(Math.max(-85,C0[1]-dLat),-1);
        /* (#R190) MORE CELLS. 176 across a 2,000 km field is an 11 km cell, which is coarser than the
           terrain the site term is read off — the picture was quantised well below the information in
           it. 288 on desktop is 2.7× the cells for 2.7× the work, which the ms figure in the panel
           reports as always; phones stay proportionally smaller. */
        /* ══ (#R202) MORE CELLS AGAIN — 「震度分布のメッシュをより高画質に」 ═════════════════════════
           #R190's 288 across a 2,000 km field is a 7 km cell, and the picture is painted with nearest
           resampling (every square IS one computed value, which is the honest way to draw a discrete
           field) — so the cell size is exactly what "blocky" means here. 448 is a 4.5 km cell, which
           is finer than the DEM sampling interval the site term is read at over most spans, i.e. the
           picture is no longer the coarsest thing in the chain. The DEM TILE budget is unchanged —
           `est(z)>520` above governs how many tiles are fetched and does not depend on N — so this
           costs arithmetic and no network.
           ⚠ AND THE ARITHMETIC IS NOT WHAT THE USER WAITS FOR. Measured end to end three times each
           (M9 off Tohoku, 3,000 km span, desktop, same machine): 288² = 82,944 cells took
           9,779 / 12,431 / 12,469 ms and 448² = 200,704 cells took 12,512 / 12,492 / 12,518 ms —
           i.e. 2.4× the cells did not move the wall clock at all, because the build is waiting on DEM
           TILES (100–157 fetched, the rest unanswered) and not on the field. The resolution was being
           limited by a cost that is not there. Phones go 128 → 192 rather than the same multiple:
           #R20's ceiling there is memory and the tab, not patience. */
        /* ══ (#R203) AND AGAIN, BECAUSE THE MEASUREMENT SAYS IT IS STILL FREE ═══════════════════════
           「震度分布のメッシュをより高画質に。」 — reported again after #R202's 288 → 448.
           #R202's own measurement is the argument: 2.4× the cells did not move the wall clock at all
           (9,779/12,431/12,469 ms at 288² against 12,512/12,492/12,518 ms at 448²), because the build
           waits on DEM TILES. The cell is the last quantiser in the chain and it is still coarser than
           what feeds it: 448 across a 2,000 km field is 4.5 km, while the DEM the site term is read
           off is sampled at ~1 km over the same span. 640 is a 3.1 km cell — 2.0× the arithmetic of
           448 against a cost that is not the arithmetic — and it is where this stops, because past it
           the cell goes under the DEM's own sample spacing and the extra cells would be interpolation
           rather than information (#R191: the calibrated range, the range terrain is available over,
           and the range the class ends at are three different things).
           The texture is the other budget and it is small: 640² RGBA is 1.6 MB. Phones go 192 → 288 —
           #R20's ceiling there is memory and the tab, not patience. */
        /* ══ (#R204) …AND THE THING TO PIN IS THE CELL, NOT THE COUNT ═══════════════════════════════
           「震度分布のメッシュをより高画質に。」— the third round in a row, and a fixed N is why: the
           SAME 640 is a 0.3 km cell for a M6 whose field spans 200 km and a 3.1 km cell for the M9
           whose field spans 2,000. The blockiness is entirely in the second case, and raising the
           constant would spend nine times the arithmetic on the first, where the picture was already
           finer than anything feeding it. So the QUANTITY THIS FIXES IS THE CELL SIZE, and the grid
           count is derived from the span — which is what "more detailed" actually means here.
           CELL_KM = 1.5 halves #R203's worst case (3.1 km → 1.56 km at the 1,280 ceiling) and leaves
           every field narrower than ~960 km exactly where it was, at the 640 floor.
           ⚠ THE CEILING IS MEMORY, NOT PATIENCE — #R202 measured that 2.4× the cells did not move the
           wall clock at all, because the build waits on DEM TILES, and #R203 confirmed it at 640. What
           does grow is the three Float32Arrays and the texture: 1,280² is 19.7 MB of field and 6.6 MB
           of RGBA, which is the reason for a ceiling rather than an open formula. Phones keep #R20's
           much lower ceiling for the same reason they always have (the tab, not the wait). */
        /* ══ (#R205) …AND THE CEILING, WHICH IS WHAT THE CELL ACTUALLY HIT ═════════════════════════
           「震度分布のメッシュをより高画質に。」— the fourth round in a row, so this one starts with a
           measurement of the SHIPPED build rather than with a constant. An M8.5 at 140 E / 36 N:

               span 2,771 km · N 1,280 (the ceiling) · cell **2.17 km** · DEM spacing 495 m
               1,638,400 cells, 144,404 painted, 1,309,165 sea · whole build 13.3 s

           So #R204's CELL_KM = 1.5 never got to decide anything here — N_MAX did, at 1.4× the target,
           and the DEM feeding the site term is four times finer than the cell it lands in. The ceiling
           is memory (#R204), so the ceiling moves once the memory per cell comes down: `vs` holds a
           Vs30 in metres per second, 150…1500 with two sentinels, which is an Int16 and was a Float32.
           12 → 10 bytes a cell retained, and the ceiling goes to 1,792: the same M8.5 gets a
           **1.55 km** cell, which is #R204's stated target met rather than described.

               retained  1,280² × 12 B = 19.7 MB  →  1,792² × 10 B = 32.1 MB
               transient RGBA 6.6 MB → 12.8 MB (freed with the canvas)

           ⚠ THE PHONE MOVES BY LESS AND FOR A DIFFERENT REASON. #R20's ceiling there is the tab, not
           patience; 640² × 10 B is 4.1 MB, which is nothing, and 640 is where it stops.
           ⚠ AND THE BUILD IS STILL DEM-BOUND — #R202 measured 2.4× the cells at the same wall clock,
           and this round re-measured it at the new ceiling rather than assuming it (see DEV-NOTES). */
        /* ══ (#R226) 1.5 km → 1.0 km, AND THE CEILING WITH IT ═══════════════════════════════════════
           「MMI震度分布の…解像度を上げて。」 (confirmed with the reader: 1.0 km cell, ceiling 2,560².)

           Two quantities decide this picture's grain and only one of them was moved by #R204/#R205:
           the CELL, and the ceiling N_MAX that overrides it once the field is wide. At 1,792 a field
           spanning 2,700 km was already back to a 1.5 km cell, so raising the cell target alone would
           have changed nothing for exactly the events that look blocky. Both move: 1.0 km, ceiling
           2,560 — a 2,560 km field is 1.0 km a cell where it used to be 1.43, and everything narrower
           than 2,560 km gets its full 1.0 km.

           ⚠ THE FINER CELL BUYS REAL INFORMATION, not interpolation — which is the objection #R203
           raised against going past 640 and which #R215 answered without noticing: the COASTLINE is
           rasterised from the app's own 10 m outline INTO THIS GRID (js/coast-mask.js), so land/sea
           is decided at whatever the cell is. At 1.5 km a 1 km-wide spit is a coin toss; at 1.0 km it
           is drawn. The site term is still read at the DEM's own spacing (`dsM`), and still says so.

           ⚠ THE CEILING IS STILL MEMORY (#R204/#R205's argument, re-costed here):
               retained  1,792² × 10 B = 32.1 MB  →  2,560² × 10 B = 65.5 MB
               transient RGBA 12.8 MB → 26.2 MB (freed with the canvas)
           ⚠ AND THE PHONE DOES NOT MOVE. Its ceiling is the tab, not patience (#R20), the reader
           chose not to raise it, and this round is also answering 「モバイル版がまだ劇的に遅い」 —
           raising the phone's grid would work against that instruction. 288…640 is unchanged. */
        const spanKm0=2*halfKm, _mob=(typeof isMobile==='function'&&isMobile());
        /* the phone keeps #R204's cell, named rather than inlined — see the ⚠ above for why it does
           not move this round. The line below stays the one place the grid rule is declared, which is
           what #R202/#R203/#R204's checks read. */
        const CELL_KM_MOB=1.5;
        const CELL_KM=1.0, N_MIN=(_mob?288:640), N_MAX=(_mob?640:2560);
        const N=Math.max(N_MIN,Math.min(N_MAX,Math.round(spanKm0/(_mob?CELL_KM_MOB:CELL_KM))));
        const y0=mY(Nn), y1=mY(Ss), dy=(y1-y0)/N, dx=(E-W)/N;
        const spanKm=2*halfKm;
        let z=Math.max(4,Math.min(12,(_demZoomForSpan?_demZoomForSpan(Math.max(1,spanKm)):7)+1));
        const est=(zz)=>{ const tk=40075*cosC/Math.pow(2,zz); const nn=spanKm/tk+1; return nn*nn*0.85; };
        while(z>4&&est(z)>520) z--;
        /* ══ ⚠⚠ (#R216) A FIELD THAT THREW THE TERRAIN AWAY IS A FIELD OF CONCENTRIC CIRCLES ═══════
           「地震分布が、一部は諦めたのか、単位同心円に塗られることがある。あれはやめて。」 — and the
           mechanism is two lines below this one. `slopeUsable` is `demSpacingM <= 2000`: #R190 added it
           for a good reason (a slope measured finer than the data is a fictional slope, and it is
           biased toward the softest Vs30 bin), but the CURE it chose is to fall back to the panel's
           single site class for every cell. With one amplification everywhere, the intensity is a
           function of distance alone — which is drawn as perfect rings. The reader is describing the
           fallback, and 「諦めた」 is the right word for it.

           So the spacing is fixed instead of the term being dropped: `z` is raised until one DEM
           sample is 2 km or finer, and the tile budget is raised WITH IT rather than the picture being
           degraded. ⚠ The budget only moves for the fields that need it (a wide one — a narrow field
           already clears 2 km at its own zoom), and it is still bounded: 1,600 tiles, roughly three
           times 520, against a fallback that made the whole map a lie about the ground. Where even
           that cannot reach 2 km the old fallback still applies and `stats.slopeUsable` still says so
           — this makes the give-up rare, it does not pretend it cannot happen. */
        /* ⚠ (#R223) THE PHONE'S CEILING IS MEMORY, AND IT IS NOW ALLOWED TO BE LOWER. #R216 raised
           this budget to 1,600 tiles because the alternative was a uniform site class, i.e. rings.
           A pinned tile costs 256 kB (#R223 halved it from 512 kB), so 1,600 of them is 410 MB —
           which on a phone is how a tab dies, and 「ブラウザが落ちることもある」 is in this round's
           report. The trade is no longer "a finer baseline OR rings": where the tiles are not
           affordable the site term comes from the bundled 0.25° Vs30 raster (js/vs30-mask.js), which
           is a real, varying ground. So the phone gets a budget it can hold. */
        const TILE_BUDGET=_mob?480:1600;
        while(z<12&&(40075017*Math.max(0.05,cosC)/(Math.pow(2,z)*256))>2000&&est(z+1)<=TILE_BUDGET) z++;
        /* ══ ⚠⚠ (#R221) THE WARM-UP ASKS THE TILE GRID, AND PINS WHAT IT ASKS FOR ═══════════════════
           「震度分布はたまに単なる同心円になることがある。ふざけるな。」 Two defects, both here:

           ① THE FIELD EVICTED ITS OWN TILES. `warmDEMTiles` shares `_demCache`, whose ceiling is 560
              on desktop and **140 on a phone**, and one continental field asks for up to 520 (1,600
              since #R216). Past the ceiling every new tile threw out one this same picture had
              already fetched, so `demSnapshot` — which is the only moment strong references are
              taken — found a fraction of them. Every cell without a DEM takes the panel's single
              site class, and an intensity with one amplification everywhere is a function of
              DISTANCE ALONE: concentric circles, exactly as reported, on the whole field rather
              than part of it. `hold` pins the set for the duration and the `finally` releases it.
           ② THE WARM LIST WAS A 33 × 33 LATTICE, not the tile grid. Positions are not tiles: many
              samples share one tile (wasted) and, once the field's tile grid is wider than 33, whole
              columns are never requested at all (missed). `demTilePoints` asks for exactly the
              rectangle `demSnapshot` will read, margin included — one point per tile, no more. */
        /* ══ ⚠⚠ (#R223) THE FIELD STOPS PAYING FOR THE OCEAN ═══════════════════════════════════════
           「地震と津波シミュレータの計算速度を爆速にして。ただし品質は一切落とさないように。」
           MEASURED: an M7.5 over Tokyo asks for 702 DEM tiles and spends 9.1 s of a 15.8 s build
           waiting for them. A large share of that box is open Pacific — and this field NEVER PAINTS
           THE SEA (every sea cell is skipped, by three separate tests). Those tiles were fetched,
           decoded, cached and then not used.
           A tile is skipped when the bundled land mask says its whole footprint, plus a margin, is
           water. ⚠ The mask is 19.5 km and a tile here is hundreds of kilometres, so the footprint
           is SAMPLED at the mask's own grain rather than at its corners — a tile with one island in
           it is kept. ⚠ The same filter goes to demSnapshot, so `want`/`missing` still describe the
           set that was asked for. ⚠ It fails OPEN: no mask, no filter, every tile as before. */
        const LMw=window.IntMapLandMask;
        try{ if(LMw&&!LMw.ready()) await LMw.warm(); }catch(_){}
        if(seq!==fldSeq) return;
        /* ⚠ …and the box is the bounding box of a DISC. A tile whose nearest corner is already
           past the painted radius is never read either — that is another 21 % of a square, free
           and exact (the cells it holds are the ones the loop skips with `km>MMI_MAX_KM` or that
           the class test drops). */
        const _outside=(lo,la,hLo,hLa)=>{
          const dLo=Math.max(0,Math.abs(((lo-C0[0]+540)%360)-180)-hLo), dLa=Math.max(0,Math.abs(la-C0[1])-hLa);
          const km=Math.hypot(dLo*111.32*Math.max(0.05,Math.cos(la*D)), dLa*110.574);
          return km>halfKm; };
        const _keepTile=(LMw&&LMw.ready())?((lo,la,hLo,hLa)=>{
          if(_outside(lo,la,hLo,hLa)) return false;
          const stepLo=Math.max(0.176,2*hLo/12), stepLa=Math.max(0.176,2*hLa/12);
          for(let dla=-hLa-0.2; dla<=hLa+0.2+1e-9; dla+=stepLa)
            for(let dlo=-hLo-0.2; dlo<=hLo+0.2+1e-9; dlo+=stepLo)
              if(LMw.isLand(lo+dlo,Math.max(-85,Math.min(85,la+dla)))===true) return true;
          return false; }):((lo,la,hLo,hLa)=>!_outside(lo,la,hLo,hLa));
        try{
          const warm=HOST.demTilePoints(W,Ss,E,Nn,z,_keepTile);
          prog(6);
          /* (#R190) 20 s was the whole of a slow build: the timeout, not the arithmetic. A field this
             wide is answered by whatever arrived — the cells that did not are counted and declared.
             (#R221) …and the deadline now scales with how many tiles were actually asked for, because
             a phone fetching 400 tiles over mobile data is not a 12-second job and the old constant
             is what turned a slow network into a ring pattern. */
          const _ms=Math.max(12000,Math.min(45000,600*Math.sqrt(warm.length)*1.6));
          await warmDEMTiles(warm,z,_ms,(f)=>prog(6+34*(+f||0)),true);
        }catch(_){}
        prog(40);
        if(seq!==fldSeq) return;
        /* ⚠ (#R190) THE FIELD STORES PGV, NOT AN INTENSITY. It used to store the intensity of the
           scale that happened to be active when it was built, and the cursor readout then read that
           array — so switching MMI→JMA reported an MMI number as a 震度 (measured: 8.63 → 「震度7」)
           until the next rebuild. PGV is what the model computes; both scales are one line from it.
           The PAINT still belongs to the scale it was drawn for, and `fld.scale` records which. */
        /* (#R192) …and the JMA level beside the PGV. #R190 stored PGV rather than an intensity so the
           readout could change scale without a rebuild; that argument now needs BOTH quantities,
           because the two scales no longer read the same band of the same motion. */
        /* (#R205) `vs` is a Vs30 in m/s (150…1500) with the sentinels 0 (unknown) and −1 (sea):
           an Int16 holds every one of those exactly, and it is 2 bytes a cell off the retained
           field — which is what pays for the higher ceiling above. pgv and a₀ stay Float32. */
        const vs=new Int16Array(N*N), pgvArr=new Float32Array(N*N), a0Arr=new Float32Array(N*N);
        let painted=0, sea=0, noDem=0, coarse=0, beyondCalib=0, bulk=0;   /* (#R223) `bulk` = cells whose site term came from the bundled 0.25° Vs30 raster */
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
        let snap=(typeof demSnapshot==='function')?demSnapshot(W,Ss,E,Nn,z,_keepTile):null;   /* (#R223) the same filter the warm-up used */
        /* ⚠ (#R216) …AND THE OTHER WAY TO END UP WITH RINGS IS TO RUN OUT OF PATIENCE. A cell whose
           DEM never arrived is painted with the panel's single site class (see the `e0==null` branch
           below), so a build whose tiles mostly missed the 12 s deadline draws the same concentric
           field this round is removing — over the part of the map the tiles were missing for, which
           is the 「一部は」 in the report. One more bounded pass costs eight seconds in the case that
           was going to be wrong anyway, and nothing at all in the normal case. */
        /* (#R221) …and the second pass asks the same tile grid, twice if it is still short. With the
           pin in place a retry now KEEPS what it recovers, which is what makes retrying worth doing
           at all — before, the second pass re-fetched tiles the first pass had already lost and then
           lost them again to the same ceiling. */
        for(let pass=0; pass<2 && snap && snap.missing>Math.max(4,snap.want*0.08); pass++){
          try{
            await warmDEMTiles(HOST.demTilePoints(W,Ss,E,Nn,z,_keepTile),z,10000,null,true);
            if(seq!==fldSeq) return;
            const s2=demSnapshot(W,Ss,E,Nn,z,_keepTile);
            if(s2&&s2.have>=snap.have) snap=s2;
          }catch(_){ break; }
        }
        /* (#R226) ONE SAMPLER PER ROW, not one call per sample — see demSnapshot.rowSampler in
           js/map-readout.js for why (the four transcendentals and the Map key are all latitude, and
           the latitude is constant along a row). The fallback path, for a build with no snapshot at
           all, keeps calling demElevBilinear exactly as before. */
        const _rowAt=(snap&&snap.rowSampler)?((la)=>snap.rowSampler(la))
                                            :((la)=>((lo)=>demElevBilinear(lo,la,z)));
        /* (#R192) the bundled land/sea sign, for the cells the DEM did not answer for — see below */
        let landMask=null;
        try{ const LM=window.IntMapLandMask; if(LM){ await LM.warm(); if(seq!==fldSeq) return; if(LM.ready()) landMask=LM; } }catch(_){}
        /* (#R223) the bundled site term, for every cell the DEM could not answer for — see js/vs30-mask.js */
        let vsm=null;
        try{ const VM=window.IntMapVs30; if(VM){ await VM.warm(); if(seq!==fldSeq) return; if(VM.ready()) vsm=VM; } }catch(_){}
        /* ══ ⚠⚠ (#R215) THE COAST IS DECIDED AT **THIS FIELD'S** CELL SIZE, NOT AT 19.5 km ═══════════
           「海抜0m以下の土地は震源分布の対象外にされるのを辞めろ。（なんか、海外線の境界部分が雑な処理に
           なっている。大きなタイルでごまかすな。）」 #R212 answered the first clause and reached for
           js/land-mask.js to do it — a 2048 × 1024 **majority-filled** raster, 19.5 km a pixel. This
           field's cell is 1.5 km (#R205), so every below-sea-level cell's land/sea answer was being
           quantised to thirteen times the grain of the picture it was drawn into: bays narrower than
           19.5 km painted as land, peninsulas narrower than that dropped into the sea, and a coastline
           that is a staircase of 19.5 km blocks. That is the 雑 in the report, and it is measurable
           rather than aesthetic.
           js/coast-mask.js rasterises the app's own 10 m country outline — 「いつもの国境線」, already
           loaded — INTO THIS GRID, so the answer's resolution is the field's resolution. The bundled
           raster stays as the fallback for a session where the outline has not arrived, and `coastSrc`
           records which one answered so the panel can say so instead of implying it. */
        let coast=null, coastSrc=null, coastKm=null;
        try{ const CM=window.IntMapCoastMask;
          if(CM&&CM.ready()){ try{ if(window._imFlushCountryGeo) window._imFlushCountryGeo(); }catch(_){}
            coast=CM.rasterize({west:W,y0,dx,dy,N});
            if(coast){ coastSrc=CM.source(); coastKm=CM.cellKm({west:W,y0,dx,dy,N}); } } }catch(e){ coast=null; }
        if(!coast&&landMask) coastSrc='bundled-19km';
        if(seq!==fldSeq) return;
        /* land at (i,j): the fine raster when there is one, the 19.5 km majority when there is not,
           and `null` — not false — when neither can answer (#R192: a missing answer is not "sea"). */
        const landAt=(k,lo,la)=>{ if(coast) return coast[k]===1;
          if(landMask){ const v=landMask.isLand(lo,la); return (typeof v==='boolean')?v:null; }
          return null; };
        /* ══ ⚠ (#R218) THE DISTANCE, FACTORED — 3.2 MILLION HAVERSINES BECOME 3.2 MILLION MULTIPLIES ══
           「震源分布の計算速度が遅いから爆速に。（品質に一切影響を及ばさないように。）」
           At the shipped ceiling this loop runs 1,792² = 3,211,264 times and every iteration called
           `gcDelta`, which is four trigonometric evaluations, a sqrt and an asin. But the grid is
           REGULAR, and haversine factors exactly over a regular grid:
               h = sin²(Δφ/2) + cosφ₁·cosφ₂·sin²(Δλ/2)
                 = A(row) + B(row)·C(column)
           — Δφ and φ₂ depend only on the row, Δλ only on the column. Precomputing A, B per row and C
           per column leaves ONE multiply, one add, one sqrt and one asin per cell. ⚠ It is the same
           expression, only factored: the value is identical to the last bit, which is what
           「品質に一切影響を及ぼさない」 requires. asin is kept — #R189 chose haversine here precisely
           because acos loses precision at the small separations the FINE field is made of.
           ⚠ IT ONLY APPLIES WITHOUT A DRAWN RUPTURE. With a fault the distance is Rrup to a polygon
           (faultDistKm) and there is nothing to factor, so that case takes the original path unchanged. */
        const _fastD=!fault&&!!epi;
        const _cut=rupCutKm();   /* (#R223) hoisted: constant over the raster (see srcDistM) */
        let rowA=null,rowB=null,colC=null;
        if(_fastD){
          const la1=epi[1]*D, cos1=Math.cos(la1);
          rowA=new Float64Array(N); rowB=new Float64Array(N); colC=new Float64Array(N);
          for(let j=0;j<N;j++){ const la=latOfY(y0+(j+0.5)*dy), s=Math.sin((la-epi[1])*D/2);
            rowA[j]=s*s; rowB[j]=cos1*Math.cos(la*D); }
          for(let i=0;i<N;i++){ const lo=W+(i+0.5)*dx, s=Math.sin((lo-epi[0])*D/2); colC[i]=s*s; }
        }
        /* the class colours, parsed ONCE. `hex()` was three slice+parseInt pairs per PAINTED cell —
           on a continental field that is a million string operations for eleven distinct colours. */
        const _rgbOf=(cls)=>cls._rgb||(cls._rgb=hex(cls.col));
        const _fineRGB=[0,0,0];   /* (#R224) scratch triple for the continuous MMI ramp — see mmiRGB */
        /* (#R218) yielding on a TIME budget rather than every eight rows. `setTimeout(…,0)` is clamped
           to ~4 ms once nested, so 1,792 rows / 8 was 224 forced waits ≈ 0.9 s of pure timer latency
           inside a build the panel reports as computation. The point of the yield is that the page
           stays responsive, which is a property of the INTERVAL, not of the row number. */
        let _lastYield=performance.now();
        for(let j=0;j<N;j++){
          const la=latOfY(y0+(j+0.5)*dy);
          /* (#R226) the row's own samplers: `_hereAt` reads this latitude, `_northAt` the one the
             slope's second arm needs. Both are prepared once for the whole row (see _rowAt). */
          const _hereAt=_rowAt(la), _northAt=_rowAt(Math.max(-85,Math.min(85,la+dLatS)));
          for(let i=0;i<N;i++){
            const lo=W+(i+0.5)*dx, k=j*N+i, o=k*4;
            const km=_fastD?(2*Math.asin(Math.min(1,Math.sqrt(rowA[j]+rowB[j]*colC[i])))*RE):distKmTo(lo,la);
            if(km>MMI_MAX_KM){ vs[k]=0; continue; }
            const e0=_hereAt(lo);
            let amp;
            /* ⚠ (#R192) A CELL WITH NO ELEVATION IS NOT A CELL ON LAND. This branch used to paint —
               with the panel's site class — and over water that is the same reported bug as the far
               field's, one grid finer: a missing tile put colour on the sea. The bundled mask
               (js/land-mask.js, ~19.5 km) answers where the DEM cannot, and where even that is
               unavailable the cell is left unpainted and counted. The DEM still answers FIRST, so
               nothing about the coastline the field can actually see is coarsened. */
            if(e0==null&&landAt(k,lo,la)===false){ sea++; vs[k]=-1; continue; }
            if(e0==null&&landAt(k,lo,la)==null){ noDem++; vs[k]=0; continue; }
            /* (#R223) a cell whose DEM tile never arrived is no longer the panel's single site class
               — that is the 「一部は同心円」 case. The bundled 0.25° Vs30 raster answers instead, and
               `ampRef` is now only what is left when even that has no land here. */
            if(e0==null){ noDem++; const bv=vsm?vsm.at(lo,la):null;
              if(bv){ vs[k]=bv; amp=ampOf(bv); bulk++; } else { vs[k]=0; amp=ampRef; } }
            /* ⚠ (#R212) 「海抜0m以下の土地は震源分布の対象外にされるのを辞めろ。」 AND IT WAS EXCLUDED —
               by a test that read the elevation's SIGN as the land/sea answer. It is not: the Jordan
               Rift (−430 m at the Dead Sea shore, the lowest exposed land on Earth), a quarter of the
               Netherlands, the Caspian Depression, Death Valley, Turfan and the Qattara are all dry
               land below zero, and every one of them was dropped out of the intensity map.
               The sign still decides where the DEM is all we have, but where the bundled land mask
               says LAND the cell is land — bounded at −440 m, because below that nothing on Earth is
               dry and the reading is bathymetry. ⚠ The mask is ~19.5 km and majority-filled, so a
               shallow strip of water inside a mostly-land cell can now be painted; that is a coastal
               artefact at the mask's own grain, and the alternative was deleting entire countries. */
            else if(e0<=0){
              if(!(landAt(k,lo,la)===true&&e0>-440)){ sea++; vs[k]=-1; continue; }
              if(!slopeUsable){ coarse++; const bv=vsm?vsm.at(lo,la):null;
                if(bv){ vs[k]=bv; amp=ampOf(bv); bulk++; } else { vs[k]=0; amp=ampRef; } }
              else { let ex=_hereAt(lo+dLngS); if(ex==null) ex=e0;
                let ey=_northAt(lo); if(ey==null) ey=e0;
                const v=vs30FromSlope(Math.hypot(ex-e0,ey-e0)/dsM); vs[k]=v; amp=ampOf(v); } }
            /* (#R190) see the note by dsM. (#R223) …and the give-up is the bundled raster, not one
               class for the whole picture — the second of the two ways this field became rings. */
            else if(!slopeUsable){ coarse++; const bv=vsm?vsm.at(lo,la):null;
              if(bv){ vs[k]=bv; amp=ampOf(bv); bulk++; } else { vs[k]=0; amp=ampRef; } }
            else {
              let ex=_hereAt(lo+dLngS); if(ex==null) ex=e0;
              let ey=_northAt(lo); if(ey==null) ey=e0;
              const slope=Math.hypot(ex-e0,ey-e0)/dsM;
              const v=vs30FromSlope(slope); vs[k]=v; amp=ampOf(v);
            }
            const rM=srcDistM(km,_cut);                          /* (#R223) the one conversion — see srcDistM */
            const g=amp/ampRef;                                  /* both quantities are linear in it */
            const b2=profAt(lo,la).both(rM);                     /* (#R218) one index, two values; (#R232) …from this azimuth's profile */
            const pgv=b2[0]*g, a0=b2[1]*g;
            pgvArr[k]=pgv; a0Arr[k]=a0;
            const I=(scale==='jma')?jmaOfA0(a0):mmiOf(pgv);
            /* (#R224) the same split as buildFar: continuous ramp for MMI, published bands for 震度 */
            let c;
            if(scale==='jma'){ const cls=jmaClass(I); if(!cls) continue; c=_rgbOf(cls); }
            else { if(I<2) continue; c=mmiRGB(I,_fineRGB); }
            if(km>MMI_CALIB_KM) beyondCalib++;   /* (#R190) drawn, and declared as extrapolated */
            px[o]=c[0]; px[o+1]=c[1]; px[o+2]=c[2]; px[o+3]=FIELD_ALPHA; painted++;
          }
          if((j&7)===7){ prog(40+58*(j+1)/N);
            const t=performance.now();
            if(t-_lastYield>12){ await _yield(); _lastYield=performance.now();
              if(seq!==fldSeq) return; } }
        }
        ctx.putImageData(im,0,0);
        prog(99);
        const _u=await pngURL(cv);
        if(seq!==fldSeq){ _revoke(_u); return; }
        _revoke(fld&&fld.url);
        fld={ url:_u,
          coords:[[W,Nn],[E,Nn],[E,Ss],[W,Ss]],
          W, E, y0, dy, dx, N, vs, pgv:pgvArr, a0:a0Arr, z, scale,
          vs30At(lo,la){ const i=Math.floor((lo-this.W)/this.dx), j=Math.floor((mY(la)-this.y0)/this.dy);
            if(i<0||j<0||i>=this.N||j>=this.N) return null; const v=this.vs[j*this.N+i]; return v>0?v:null; },
          /* (#R190) the PGV the FIELD computed at one point — what the readout under the cursor
             converts, so the number in the corner and the colour on the map come from the same cell
             and cannot drift apart (#R136's lesson: a detector and a painter written twice).
             (#R192) …and the JMA level from the same cell, for the same reason. */
          pgvAt(lo,la){ const i=Math.floor((lo-this.W)/this.dx), j=Math.floor((mY(la)-this.y0)/this.dy);
            if(i<0||j<0||i>=this.N||j>=this.N) return null; const v=this.pgv[j*this.N+i]; return v>0?v:null; },
          a0At(lo,la){ const i=Math.floor((lo-this.W)/this.dx), j=Math.floor((mY(la)-this.y0)/this.dy);
            if(i<0||j<0||i>=this.N||j>=this.N) return null; const v=this.a0[j*this.N+i]; return v>0?v:null; },
          stats:{ cells:N*N, painted, sea, noDem, coarse, beyondCalib, calibKm:MMI_CALIB_KM, z, demSpacingM:Math.round(demSpacingM),
                  /* (#R223) how many cells took the bundled 0.25° site term instead of one class */
                  bulkSite:bulk, bulkSiteSource:(vsm?'bundled-vs30-0.25deg':null),
                  /* (#R215) WHICH coastline decided the coast, and how fine it was — declared, not implied */
                  coastSource:coastSrc, coastCellKm:(coastKm!=null?+coastKm.toFixed(2):null),
                  slopeBaselineM:Math.round(dsM), slopeUsable,
                  spanKm:Math.round(spanKm), rEdgeKm:Math.round(rEdge), rFineKm:Math.round(rFine),
                  demTiles:snap?snap.have:null, demTilesMissing:snap?snap.missing:null,
                  terrain:(noDem+coarse)<N*N*0.5, ms:Math.round(performance.now()-t0) } };
        paintField();
        /* (#R191) …and the annulus the terrain cannot reach, out to the end of the lowest class */
        await buildFar(profAt,{W,E,Ss,Nn},rFine,rEdge,seq);
        if(fld&&fld.stats) fld.stats.ms=Math.round(performance.now()-t0);
        prog(100);
      } finally { try{ HOST.releaseDEMHold(); }catch(_){}   /* (#R221) the pin is for THIS build only */
        if(seq===fldSeq){ fldBusy=false;
        /* (#R190) the build warmed the DEM around the epicentre, so the tsunami screening may have an
           answer now that it did not have when the panel was drawn — see syncTsunami. */
        const _t=!!tsunamiCase();
        if(opened&&_t!==_tsuShown){ _tsuShown=_t; render(); } else if(opened){ report(); _paintRunBtn(); } } }   /* (#R234) …and the run button drops back to 「再計算」 the moment there is an answer */
    }

    function ensure(){ try{ if(!_imCanDraw()) return false;
      if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      /* (#R189) the intensity CONTOUR LINES ('seis-mmi' + labels) are gone — the intensity is the
         painted field (see buildField/paintField), which is what the instruction asks for. */
      /* ⚠ (#R239) THE BAND IS ADDED FIRST BECAUSE ADD ORDER IS Z ORDER. It is the ground being
         shaken; the fault, the rupture and the four fronts are all things drawn ON that ground. */
      if(!GE().layers.has('seis-band')) GE().layers.add({id:'seis-band',type:'fill',source:SRC,filter:['==',['get','kind'],'band'],
        paint:{'fill-color':['get','col'],'fill-opacity':0.13}});
      if(!GE().layers.has('seis-fault-fill')) GE().layers.add({id:'seis-fault-fill',type:'fill',source:SRC,filter:['==',['get','kind'],'fault'],
        paint:{'fill-color':'#ff3b30','fill-opacity':0.13}});
      if(!GE().layers.has('seis-fault-line')) GE().layers.add({id:'seis-fault-line',type:'line',source:SRC,filter:['==',['get','kind'],'fault'],
        paint:{'line-color':'#ff3b30','line-width':1.8,'line-dasharray':[2,1.5],'line-opacity':0.9}});
      /* ══ (#R238) THE BROKEN PART OF THE FAULT, AND THE BREAK'S OWN LEADING EDGE ═══════════════════
         Under the wavefronts and over the fault outline, so the reader sees the rupture fill the
         shape they drew and then the rings leave it. The fill is the same red the outline uses (this
         IS that fault, part-broken) at a weight that reads under the dashed outline; the edge is the
         bright line, thicker than a wavefront because it is the only front bounded by the drawing. */
      if(!GE().layers.has('seis-rup-fill')) GE().layers.add({id:'seis-rup-fill',type:'fill',source:SRC,filter:['==',['get','kind'],'rup'],
        paint:{'fill-color':'#ff3b30','fill-opacity':0.34}});
      if(!GE().layers.has('seis-rup-edge')) GE().layers.add({id:'seis-rup-edge',type:'line',source:SRC,filter:['==',['get','kind'],'rupedge'],
        paint:{'line-color':'#ffd60a','line-width':3.2,'line-opacity':0.95}});
      /* ══ ⚠⚠⚠ (#R239) THE SHAKING BAND, AND THE TRAILING EDGE THAT CARRIES THE FAULT ═══════════════
         The band goes UNDER the rings and under the rupture, because it is the ground state those
         are the boundaries of — a wash, not a shape to read edges off. `fill-opacity` is deliberately
         low: four phases overlap at every instant (P has long since passed where Love is arriving),
         and four washes at a readable weight would be an opaque disc. The trailing edge is the same
         hue as its own leading edge at just over half the width, so the pair reads as ONE wave with
         a front and a back rather than as eight rings. Both exist only when a rupture is drawn —
         see `train()` in drawFronts. */
      /* (#R240) `o` is the arc's own opacity — the directivity weight, see emitFrontArcs. A ring
         emitted whole (no rupture drawn) carries o = 0.92, which is the constant this used to be. */
      if(!GE().layers.has('seis-ring')) GE().layers.add({id:'seis-ring',type:'line',source:SRC,filter:['==',['get','kind'],'ring'],
        paint:{'line-color':['get','col'],'line-width':['get','w'],'line-opacity':['coalesce',['get','o'],0.92]}});
      if(!GE().layers.has('seis-ring-back')) GE().layers.add({id:'seis-ring-back',type:'line',source:SRC,filter:['==',['get','kind'],'ringBack'],
        paint:{'line-color':['get','col'],'line-width':['get','w'],'line-opacity':0.62,'line-dasharray':[3,2]}});
      /* (#R210) 「観測地点の点には番号を振るように。そうじゃないとどれがどの観測地点と対応しているのか
         わからない（現在は座標のみ）」— the dot grew to fit a numeral, and the numeral is the same
         index the table row shows in its own ① column, so a glance matches them without reading
         coordinates. Dark text on the white dot: the dot is drawn over intensity paint of any colour. */
      if(!GE().layers.has('seis-sta')) GE().layers.add({id:'seis-sta',type:'circle',source:SRC,filter:['==',['get','kind'],'station'],
        paint:{'circle-radius':9,'circle-color':'#ffffff','circle-stroke-color':'#222','circle-stroke-width':1.8}});
      if(!GE().layers.has('seis-sta-n')) GE().layers.add({id:'seis-sta-n',type:'symbol',source:SRC,filter:['==',['get','kind'],'station'],
        layout:{'text-field':['get','n'],'text-size':window.IntMapLabelScale.sub(0.8),'text-font':['literal',['Noto Sans Regular']],'text-allow-overlap':true,'text-ignore-placement':true},
        paint:{'text-color':'#111111'}});
      /* (#R242) the cities the panel picked: a smaller ringed dot and the name, under the numbered
         markers above so a placed point always wins the overlap. */
      if(!GE().layers.has('seis-city')) GE().layers.add({id:'seis-city',type:'circle',source:SRC,filter:['==',['get','kind'],'city'],
        paint:{'circle-radius':4.5,'circle-color':'#ffffff','circle-stroke-color':'#1c1c1e','circle-stroke-width':1.6,'circle-opacity':0.95}});
      if(!GE().layers.has('seis-city-n')) GE().layers.add({id:'seis-city-n',type:'symbol',source:SRC,filter:['==',['get','kind'],'city'],
        layout:{'text-field':['get','name'],'text-size':window.IntMapLabelScale.sub(0.82),'text-font':['literal',['Noto Sans Regular']],
          'text-anchor':'top','text-offset':[0,0.62],'text-optional':true,'text-max-width':9},
        paint:{'text-color':'#ffffff','text-halo-color':'rgba(0,0,0,0.85)','text-halo-width':1.5}});
      if(!GE().layers.has('seis-epi')) GE().layers.add({id:'seis-epi',type:'circle',source:SRC,filter:['==',['get','kind'],'epi'],
        paint:{'circle-radius':7,'circle-color':'#ff3b30','circle-stroke-color':'#fff','circle-stroke-width':2.4}});
      /* ══ (#R232) 「地震波伝播は、波がどの波かわからないから名称を記載して。」 ═══════════════════════
         Four fronts were drawn in four colours and nothing said which was which: a reader saw a red
         ring, an orange ring, a blue ring and a purple ring expanding at different speeds and had to
         already know seismology to read them. Each front now carries its own name and its speed at
         the leading edge, in the colour of its line, placed ON the ring. The halo is what keeps them
         legible over the intensity paint, which can be any colour underneath. */
      if(!GE().layers.has('seis-front-lbl')) GE().layers.add({id:'seis-front-lbl',type:'symbol',source:SRC,filter:['==',['get','kind'],'frontLabel'],
        layout:{'text-field':['get','t'],'text-size':window.IntMapLabelScale.sub(0.86),'text-font':['literal',['Noto Sans Regular']],
                'text-allow-overlap':false,'text-ignore-placement':false,'text-padding':6,'text-offset':[0,-0.65]},
        paint:{'text-color':['get','col'],'text-halo-color':'rgba(0,0,0,0.72)','text-halo-width':1.5}});
      return true; }catch(_){ return false; } }
    function setData(f){ try{ if(ensure()) GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:f||[]}); }catch(_){} }

    /* The radius at which MMI falls through each integer — the spatial answer to 「推定震度」.
       ⚠ (#R190) These are QUOTED NUMBERS, like the table, so they live inside MMI_CALIB_KM and not
       inside the painting limit. Splitting the two constants moved this by accident and tests/r176 ⑤
       caught it immediately (a ring at 1,129 km against its "stay inside the model's stated range"
       assertion). The painted field may reach further BECAUSE it is labelled an extrapolation on
       screen; a number in a list carries no such label, so it does not go there. */
    function mmiRings(){ const out=[]; if(!epi) return out;
      /* (#R223) the peak is at the surface distance where the source distance is smallest — the whole
         footprint of the implied rupture, so `srcDistM(0)` rather than the focal depth alone. */
      const peak=motion(mw,srcDistM(0)).mmi;
      const maxDeg=MMI_CALIB_KM/(RE*D);
      for(let I=Math.min(11,Math.floor(peak));I>=2;I--){
        let lo=0, hi=maxDeg;
        for(let k=0;k<40;k++){ const mid=(lo+hi)/2;
          const km=mid*D*RE, rM=srcDistM(km);
          if(motion(mw,rM).mmi>=I) lo=mid; else hi=mid; }
        /* only where the model still applies — a contour pinned to its own range limit is not a contour */
        if(lo>0.02&&lo<maxDeg*0.999) out.push({ I, deg:lo, km:lo*D*RE });
      }
      return out; }

    /* (#R232) each front knows its own NAME — 「波がどの波かわからないから名称を記載して」. The name is
       a function so it follows a language change without the table being rebuilt, and it names the
       wave the way seismology does (P = primary / 初動 / 縦波, S = secondary / 横波) rather than by
       colour. Rayleigh and Love are the two surface trains, and they are genuinely different waves —
       Rayleigh is the retrograde-elliptical ground roll, Love the horizontal shear — which is exactly
       the distinction a reader could not make from "blue ring" and "purple ring". */
    const PH=[
      { k:'P', col:'#ff3b30', w:2.6, name:()=>L('P wave','P波','P-Welle','P-волна','Onda P') },
      { k:'S', col:'#ff9f0a', w:2.6, name:()=>L('S wave','S波','S-Welle','S-волна','Onda S') }
    ];
    const SURF=[
      { v:3.5, col:'#0a84ff', name:()=>L('Rayleigh wave','レイリー波（表面波）','Rayleigh-Welle','Волна Рэлея','Onda Rayleigh') },
      { v:4.4, col:'#bf5af2', name:()=>L('Love wave','ラブ波（表面波）','Love-Welle','Волна Лява','Onda Love') }
    ];
    /* (#R189) initial great-circle bearing — for the finite-source front envelope below */
    function bearingTo(a,b){ const la1=a[1]*D, la2=b[1]*D, dl=(b[0]-a[0])*D;
      return (Math.atan2(Math.sin(dl)*Math.cos(la2),Math.cos(la1)*Math.sin(la2)-Math.sin(la1)*Math.cos(la2)*Math.cos(dl))/D+360)%360; }

    /* ══ ⚠ (#R235) 「地盤なども多角的に考慮した伝播にして」 — THE SURFACE-WAVE PATH ═══════════════
       The two group velocities above were CONSTANTS for the whole planet, so those two fronts were
       exact circles about the epicentre no matter what they were crossing. They are not: the
       fundamental-mode group velocity at the periods these carry (roughly 20–60 s) is set by the
       thickness and the velocity of the crust the wave is running through, and a thin oceanic crust
       over mantle is measurably faster than 35–40 km of continental crust with a slow granitic top.

       ⚠ THIS IS A PATH INTEGRAL, NOT A DESTINATION LOOKUP. Surface-wave tomography works with the
       average of the slowness ALONG the great circle, so that is what is integrated here: with a
       local multiplier g(s) on the reference velocity, the time to reach Δ is (1/U₀)·∫₀^Δ ds/g(s),
       and the quantity that does not depend on which of the two waves is asking is
             S(Δ) = ∫₀^Δ ds/g(s)      [km]           front at time t  ⇔  S(Δ) = U₀·t
       so ONE table per epicentre serves Rayleigh and Love both, and each keeps its own U₀.

       ⚠ THE REFERENCE VALUES ARE UNCHANGED. g = 1 over continental crust, so an all-land path is
       3.5 / 4.4 km/s exactly as before; only an oceanic leg departs from it. `OCEAN_G` is a stated
       first-order assumption, like Q₀/η and the stress drop, and it is in 詳細設定 beside them.
       ⚠ AND IT DEGRADES TO THE OLD BEHAVIOUR: with no land mask loaded the table is never built and
       `_pathDeg` is the plain great-circle conversion, i.e. exactly the circles it replaced. */
    let OCEAN_G=1.08;                    /* oceanic vs continental fundamental-mode group velocity */
    /* ══ ⚠ (#R238) 144 BEARINGS AT 0.5°, NOT 72 AT 1° ════════════════════════════════════════════════
       5° of azimuth is 87 km of arc at Δ=10°, so the path integral itself was faceted at exactly the
       scale the departure from a circle lives on — the reader saw a polygon and read it as 「同心円」.
       2.5° halves that, and the step along each ray goes to 0.5° (55 km) so a coastline crossed
       obliquely lands in the right cell. Built ONCE per epicentre and cached (see `_pKey`); the cost
       is 144 × 360 = 51,840 mask lookups on the first frame after the epicentre moves, not per frame. */
    const _PB=144, _PS=0.5;              /* bearings sampled (2.5°) · step along each, in degrees */
    let _pTab=null, _pKey='';
    function _pathBuild(){
      const key=epi?(epi[0].toFixed(3)+','+epi[1].toFixed(3)+','+OCEAN_G):'';
      if(_pTab&&_pKey===key) return _pTab;
      const LM=window.IntMapLandMask;
      if(!epi||!LM||!LM.ready||!LM.ready()){ try{ LM&&LM.warm&&LM.warm(); }catch(_){} _pTab=null; _pKey=''; return null; }
      const N=Math.round(180/_PS), stepKm=_PS*D*RE, tab=new Array(_PB);
      for(let bi=0;bi<_PB;bi++){ const b=bi*360/_PB, cum=new Float32Array(N+1); let s=0;
        for(let i=1;i<=N;i++){
          const p=destAng(epi,b,(i-0.5)*_PS);                 /* midpoint of this step */
          let g=1; try{ if(!LM.isLand(p[0],p[1])) g=OCEAN_G; }catch(_){}
          s+=stepKm/g; cum[i]=s; }
        tab[bi]=cum; }
      _pTab=tab; _pKey=key; return _pTab;
    }
    /* ══ ⚠⚠ (#R238) THE BODY WAVES CROSS THE SAME CRUST, AND THEY WERE NOT ASKED ══════════════════════
       「震源域の形状や深さ、地盤なども多角的に考慮した伝播にして。」 — and the reader's answer this
       round, after #R235 and #R237 both recorded the item as done: 「まだ震央中心の同心円に見える」.

       #R235 gave the SURFACE waves a per-bearing path integral and left P and S with the comment
       「These do NOT vary with bearing … so a point source is still a circle」. P and S are the two
       fastest, largest and most-watched fronts on the screen, so two of the four rings were exact
       circles by construction and the picture as a whole read as circles.

       A body wave does not cross the same rock as a Rayleigh wave, so the surface-wave factor cannot
       simply be reused: past the Pn/Pg crossover most of the ray is in the MANTLE, which this app has
       no lateral model for and should not invent one for. What it does have is the crustal legs, and
       those are the same crust the mask already describes. So the correction is applied to the
       CRUSTAL SHARE of the path and to nothing else:

           Δ' = Δ · ( 1 − wC + wC · ḡ )      ḡ = harmonic mean of g along this bearing, from the
                                                 same cumulative table the surface waves invert
           wC = min(1, Lc / Δkm)             Lc = the crustal path: the up-leg at the receiver (35 km)
                                                 plus the down-leg at the source when the source is
                                                 IN the crust — so a 500 km deep event gets half of it

       At regional distance wC = 1 and the whole front follows the crust it is crossing; by Δ = 20°
       it is 3 %, which is the honest size of the effect there and is what stops this from becoming a
       decorative wobble. ⚠ WITH NO MASK LOADED ḡ = 1 AND THIS IS THE IDENTITY — the fronts are
       exactly the circles they were, which is the same degradation `_pathDeg` already had. */
    const CRUST_KM=35;                   /* continental crustal thickness, the reference this rides on */
    function _pathHarmonicG(brg,deltaDeg){
      const tab=_pathBuild(); if(!tab||!(deltaDeg>0)) return 1;
      const f=((brg%360)+360)%360*_PB/360, b0=Math.floor(f)%_PB, b1=(b0+1)%_PB, w=f-Math.floor(f);
      const N=tab[0].length-1;
      const cumAt=(cum)=>{ const x=Math.min(N,Math.max(0,deltaDeg/_PS)); const i=Math.floor(x);
        if(i>=N) return cum[N];
        return cum[i]+(cum[i+1]-cum[i])*(x-i); };
      const reduced=cumAt(tab[b0])*(1-w)+cumAt(tab[b1])*w;
      const trueKm=deltaDeg*D*RE;
      return (reduced>1e-6)?(trueKm/reduced):1;
    }
    function _bodyStretch(brg,deltaDeg,depKm){
      if(!(deltaDeg>0)) return deltaDeg;
      const g=_pathHarmonicG(brg,deltaDeg);
      if(!(isFinite(g))||Math.abs(g-1)<1e-6) return deltaDeg;
      const Lc=CRUST_KM+((depKm<CRUST_KM)?(CRUST_KM-depKm):0);
      const wC=Math.min(1,Lc/Math.max(1e-6,deltaDeg*D*RE));
      return deltaDeg*(1-wC+wC*g);
    }
    /* invert S(Δ) = reduced, for the bearing asked (linear between the two sampled bearings) */
    function _pathDeg(reducedKm,brg){
      if(!(reducedKm>0)) return 0;
      const tab=_pathBuild();
      if(!tab) return reducedKm/(D*RE);                        /* no mask — the old constant-velocity ring */
      const f=((brg%360)+360)%360*_PB/360, b0=Math.floor(f)%_PB, b1=(b0+1)%_PB, w=f-Math.floor(f);
      const inv=(cum)=>{ const N=cum.length-1;
        if(reducedKm>=cum[N]) return 180;
        let lo=1,hi=N; while(lo<hi){ const m=(lo+hi)>>1; if(cum[m]<reducedKm) lo=m+1; else hi=m; }
        const a=cum[lo-1], c=cum[lo];
        return ((lo-1)+((c>a)?(reducedKm-a)/(c-a):0))*_PS; };
      return inv(tab[b0])*(1-w)+inv(tab[b1])*w;
    }
    /* ══ ⚠⚠ (#R235) THE SOURCE POINTS CARRY THEIR OWN DEPTH ══════════════════════════════════════
       「震源域の形状や深さ、地盤なども多角的に考慮した伝播にして。」
       #R189/#R234 delayed every point of the rupture by its distance from the hypocentre and then
       asked ONE travel-time curve — the hypocentre's — how far the phase had got. A rupture plane
       DIPS: Tōhoku's down-dip edge is ~45 km deep against a 29 km hypocentre, and a 45 km source
       reaches Δ=10° some seconds before a 29 km one does. So each sampled point gets the depth of
       the plane AT that point, and its own curve.
       Depth is linear in the across-strike coordinate between `zTopKm` (the up-dip edge) and
       `zBotKm` (the down-dip edge) — which is exactly the plane the geometry solver returned, so
       this reads the solved plane rather than estimating a second one. With no strike solved (a
       blob), every point keeps the hypocentral depth: an unknown dip direction is not a licence to
       invent one. */
    /* ══ ⚠ (#R238) CACHED, AND CARRYING ITS OWN TRIG — 「動きがカクカク・飛ぶ」 ═══════════════════════
       This was rebuilt from scratch ONCE PER FRONT PER FRAME (four times a frame), and `_envR` then
       took cos(off) and sin(off) for every (bearing, source point) pair — with #R237's screen-driven
       vertex count that is 4 × 720 × 24 = 69,120 pairs and about 140,000 trig calls per frame, on
       the main thread, beside a `setData` that re-parses the GeoJSON. That is the stutter: the
       playback loop was already a clean rAF tick (#R236), so what was jumping was not the clock but
       the work each tick had to finish. Nothing about the model changes here — the same points with
       the same depths and delays — they are computed when the SOURCE changes rather than when the
       clock does, and the two constants that depend only on the point travel with it. */
    let _spCache=null, _spKey='';
    function _srcPts(){
      const key=(epi?epi[0].toFixed(4)+','+epi[1].toFixed(4):'-')+'|'+depthKm+'|'
        +(fault&&fault.ring?(fault.ring.length+':'+(fault.strikeDeg||0).toFixed(2)+':'+(fault.zTopKm||0).toFixed(2)+':'+(fault.zBotKm||0).toFixed(2)+':'+fault.ring[0][0].toFixed(4)+','+fault.ring[0][1].toFixed(4)):'-');
      if(_spCache&&_spKey===key) return _spCache;
      const out=_srcPtsBuild();
      for(let i=0;i<out.length;i++){ const k=out[i]; k.cA=Math.cos(k.off*D); k.sA=Math.sin(k.off*D); }
      _spCache=out; _spKey=key; return out;
    }
    /* ══ ⚠⚠⚠ (#R241) THE OUTLINE IS WALKED, NOT SAMPLED AT ITS VERTICES ═══════════════════════════════
       `fault.ring` is whatever the reader drew, and for the shape this panel is most often asked
       about — a rupture rectangle, hand-drawn or loaded from a published finite-fault model — that
       is FOUR POINTS. Sampling "every ring.length/24-th vertex" then samples the four corners and
       nothing along the 500 km edges between them, so the source the whole envelope is built from is
       four dots. MEASURED before this change, M9.1 with a 500 × 180 km rupture: at t = 30 s the front
       was byte-identical to the point-source front (the nearest corner is 90 km away and breaks at
       t = 34 s, so NOTHING had radiated), and at t = 120 s the front was 10 % out of round instead of
       the ~50 % the fault's own length implies. The fault was in the model and could not reach the
       picture — [[intmap-recurring-lessons]] A, one more time.
       So the outline is WALKED at a spacing set by its own size (~1/28th of its perimeter, floored at
       one sample per 6 km so a small rupture is not over-sampled), and the vertices are kept. */
    function _walkRing(R2,n){
      const out=[]; if(!(R2&&R2.length>=3)) return out;
      let per=0; for(let i=0;i<R2.length;i++) per+=gcDelta(R2[i],R2[(i+1)%R2.length]);
      const perKm=per*D*RE;
      const stepKm=Math.max(6,perKm/Math.max(8,n));
      for(let i=0;i<R2.length;i++){
        const a=R2[i], b=R2[(i+1)%R2.length];
        out.push(a);
        const segKm=gcDelta(a,b)*D*RE;
        const m=Math.floor(segKm/stepKm);
        if(m<1) continue;
        const brg=bearingTo(a,b);
        for(let j=1;j<=m;j++){ const d=(segKm*j)/(m+1); out.push(destAng(a,brg,d/(D*RE))); }
      }
      return out;
    }
    function _srcPtsBuild(){
      const K=[{off:0,phi:0,delay:0,dep:depthKm}];
      if(!(fault&&fault.ring&&fault.ring.length>=3)) return K;
      const R2=_walkRing(fault.ring,28), step=1;
      const zT=(fault.zTopKm!=null)?+fault.zTopKm:depthKm, zB=(fault.zBotKm!=null)?+fault.zBotKm:depthKm;
      const st=(fault.strikeDeg!=null&&isFinite(fault.strikeDeg))?+fault.strikeDeg:null;
      /* across-strike coordinate of every ring point, so the two edges can be told apart */
      let lo2=Infinity, hi2=-Infinity; const xs=[];
      if(st!=null){ const c0=fault.centroid||epi;
        for(let i=0;i<R2.length;i+=step){ const p=R2[i];
          const dd=gcDelta(c0,p)*D*RE, br=bearingTo(c0,p);
          const x=dd*Math.cos((br-(st+90))*D);          /* +x = down-dip side of the centroid */
          xs.push(x); if(x<lo2) lo2=x; if(x>hi2) hi2=x; } }
      let n=0;
      for(let i=0;i<R2.length;i+=step,n++){ const p=R2[i];
        const off=gcDelta(epi,p);
        let dep=depthKm;
        if(st!=null&&hi2>lo2){ const f=Math.max(0,Math.min(1,(xs[n]-lo2)/(hi2-lo2))); dep=zT+(zB-zT)*f; }
        K.push({ off, phi:bearingTo(epi,p), delay:off*D*RE/VRUP_KMS, dep:Math.max(0.5,dep) }); }
      return K;
    }
    /* ══ ⚠⚠ (#R235) THE ENVELOPE WAS THE CONVEX HULL, AND A HAND-DRAWN RUPTURE IS NOT CONVEX ══════
       #R189 evaluated the union of the source circles through its SUPPORT FUNCTION,
       `R = off·cos(b−φ) + r`, and said so: 「exact for the convex hull of the union」. That is the
       first-order expansion of the real thing, and it has two consequences the instruction names:
         · a free-drawn rupture that is bent, hooked or C-shaped has its concavity FILLED IN — the
           front leaves the shape the user drew and becomes its hull;
         · `off` and `r` are angles on a sphere, and adding them as if they were flat over-reaches
           by ~1% at 10° and much more beyond, on exactly the giant ruptures that need it.
       The exact outer root is a spherical triangle, not an expansion. Along the great circle from
       the epicentre at bearing b, a point at angular distance R sits on the circle of radius r
       about a source point at (off, φ) when
             cos r = cos(off)·cos R + sin(off)·sin R·cos(b−φ)
       ⇒ with A = cos(off), B = sin(off)·cos(b−φ), C = √(A²+B²), δ = atan2(B, A):
             C·cos(R − δ) = cos r  ⇒  R = δ + acos(cos r / C)      (the outer of the two roots)
       and |cos r / C| > 1 simply means this ray never reaches that source point's circle, so it
       contributes nothing to this bearing. Taking the max over the sampled points is then the outer
       boundary of the union itself — concave where the union is concave.
       ⚠ IT DOES **NOT** REDUCE TO THE OLD LINE AT SMALL ANGLES, and it should not. Flattening the
       sphere gives `R = off·cos Δb + √(r² − off²·sin²Δb)`, and the old expression is that with the
       square root replaced by `r` — i.e. the TANGENT, which is where the convex hull comes from, not
       a small-angle approximation of the union. The two agree only along the strike (Δb = 0 or 180°)
       and diverge most across it; at Δb = 90° the old form returns `off·0 + r` for a point whose
       circle the ray reaches at √(r² − off²). So this is a correction at every scale, and the
       spherical form is checked against the planar union — not against the old line — in tests/r235. */
    /* ⚠ `rFor(k, b)` TAKES THE RAY BEARING AS WELL AS THE SOURCE POINT. The first cut passed only
       `k`, and `k.phi` is the bearing OF THAT SOURCE POINT from the hypocentre — not the direction
       the front is travelling in. Any radius that depends on direction (the surface-wave path
       integral below) was therefore evaluated along the wrong azimuth and came out the same for
       every bearing: measured on Tōhoku at t=400 s, east and west were 1441 km each, ratio 1.000,
       i.e. a perfect circle wearing a path integral's clothes. */
    /* (#R238) `k.cA` / `k.sA` are cos(off) and sin(off), carried by the point (see `_srcPts`) rather
       than recomputed for every bearing — the geometry is identical, the trig is not repeated. */
    function _envR(K,rFor,b){
      let R=null;
      for(let i=0;i<K.length;i++){ const k=K[i], r=rFor(k,b); if(r==null) continue;
        const A=k.cA, B=k.sA*Math.cos((b-k.phi)*D);
        const C=Math.hypot(A,B); if(!(C>1e-9)) continue;
        const q=Math.cos(r*D)/C; if(q<-1||q>1) continue;
        const cand=(Math.atan2(B,A)+Math.acos(q))/D;
        if(R==null||cand>R) R=cand; }
      return R;
    }
    /* ══ ⚠⚠⚠ (#R239) THE OTHER END OF THE WAVE TRAIN — WHERE THE FAULT'S SHAPE ACTUALLY LIVES ═════
       「地震シミュレータの地震波伝播は断層破壊を考慮していない。震央からほぼ同心円状に広がるだけ。」
       — sent for the FOURTH round, and this time with the answer to what is wanted:
       「その時々の破壊中の断層を考慮したやつにしろ。何妥協しとんねん。どう考えてもそれ以外に地震学上
         まともなものないやろが。」

       #R238 proved — five lines of algebra, reproduced above `drawFronts` — that the FIRST arrival
       from a rupture with Vr ≤ V is EXACTLY a circle about the hypocentre. That is not a modelling
       choice this file can improve on; it is what the physics does, and it is why three rounds of
       work on the envelope changed nothing anybody could see. But the first arrival is only one of
       the two boundaries a finite rupture has, and the other one is not a circle at all:

           T_first(x) = min over k of ( off_k/Vr + dist(k,x)/V )    ← the circle
           T_last (x) = MAX over k of ( off_k/Vr + dist(k,x)/V )    ← the fault, drawn in the ground

       Between them the ground at x is being shaken by a source that is still radiating — the part of
       the fault whose energy is arriving right now. `T_last − T_first` at a site is precisely the
       duration this panel already prints in its table as 継続時間, so the band between the two rings
       is that column, on the map, everywhere at once. It is narrow ahead of a rupture that ran
       toward you (the whole fault's energy piles up: that IS directivity, the thing the panel
       reports as Fd) and wide behind it, and its inner edge carries the outline the reader drew.

       ⚠ THE MAX IS AN INTERSECTION, SO THE POINTS THE ENVELOPE PRUNES ARE THE ONES THAT DECIDE IT.
       `_envR` takes the outer boundary of a UNION and `_prune` drops every source point that cannot
       reach past the hypocentre's own circle — 24 of 25 of them, measured in #R238. Those are
       exactly the points whose circles are innermost, i.e. the ones the min below is made of. So
       this runs on the FULL `_srcPts()`, and a single `null` (a point that has not radiated to this
       bearing yet) makes the whole bearing null: until the last piece of the fault has broken AND
       its energy has arrived, nowhere is finished, and there is no trailing edge to draw. That is
       the correct answer and it is also the visible one — while the fault is still tearing, the
       whole illuminated disc is shaking, which is what a finite rupture does. */
    function _envRmin(K,rFor,b){
      let R=null;
      for(let i=0;i<K.length;i++){ const k=K[i], r=rFor(k,b);
        if(r==null) return null;
        const A=k.cA, B=k.sA*Math.cos((b-k.phi)*D);
        const C=Math.hypot(A,B); if(!(C>1e-9)) return null;
        const q=Math.cos(r*D)/C; if(q<-1||q>1) return null;
        const cand=(Math.atan2(B,A)+Math.acos(q))/D;
        if(R==null||cand<R) R=cand; }
      return R;
    }
    /* the ring is built in CONTINUOUS longitude and split at the seam by the same helper every other
       ring uses, so the polar/antimeridian behaviour is identical to ringLines(). */
    /* ══ ⚠ (#R237) HOW MANY BEARINGS A FRONT IS DRAWN FROM — 「動作は離散的ではなくスムーズにして」 ═══
       144 was a constant, i.e. 2.5° of arc between vertices whatever the front's size and whatever
       the camera is doing. That is invisible on a whole-Earth view and a visible polygon the moment
       the reader zooms in on the coast the front is about to reach, which is the one thing this
       animation exists to be watched doing: at z6 a front 300 km out has its vertices about 13 km
       apart, and 13 km is ~40 screen pixels there, so the arc is drawn as a chain of straight lines
       long enough to see.

       The count is chosen from the arc the front actually subtends ON SCREEN — the front's radius in
       pixels at the current zoom — so a vertex lands about every 6 px whatever the combination of
       radius and zoom. That is the same rule the app already uses for great-circle densification and
       it is bounded at both ends: never coarser than the old 144 (so nothing regresses), never finer
       than 720 (2 vertices per degree, past which the GeoJSON costs more than the smoothness is
       worth on a phone).

       ⚠ IT IS BOUNDED BY THE SCREEN, NOT BY THE FRONT'S SIZE IN KILOMETRES. A front the size of the
       Pacific viewed from space needs FEWER vertices than a 50 km front viewed from a city, and a
       rule written on the kilometre would get both backwards. */
    function _frontSteps(Rdeg){
      let px=null;
      try{
        const z=GE().camera.getZoom(), c=GE().camera.getCenter();
        if(isFinite(z)&&c){
          /* metres per pixel at this latitude and zoom — the renderer's own scale */
          const mpp=156543.03392*Math.cos(c.lat*D)/Math.pow(2,z);
          if(mpp>0) px=(Rdeg*D*RE*1000)/mpp;         /* the front's radius, in screen pixels */
        }
      }catch(_){}
      if(!(px>0)) return 144;
      /* one vertex per ~6 px of the circumference */
      const n=Math.round((2*Math.PI*px)/6);
      return Math.max(144,Math.min(720,n));
    }
    /* ══ ⚠ (#R238) THE POINTS THAT CANNOT WIN ARE DROPPED BEFORE THE BEARING LOOP ═══════════════════
       The outer root of a source point's circle obeys the spherical triangle inequality
       R_k(b) ≤ off_k + r_k(b), and the hypocentre's own is R_0(b) = r_0(b). So a point whose circle
       cannot reach past the hypocentre's at ANY bearing contributes nothing to the max and can be
       skipped for this front, at this instant — which, by the collapse proved in `drawFronts`, is
       every point of the rupture in the ordinary Vr < V case. Measured on a hand-drawn M8.4 outline:
       25 source points survive to 1 at t = 60 s, so the bearing loop does 1/25 of the work.
       ⚠ THE 1.15 IS A BOUND, NOT A GUESS. `r` varies with bearing only through the path factor, and
       that factor is bounded by OCEAN_G (1.08) for the surface waves and by (1−wC+wC·ḡ) ≤ ḡ ≤ 1.08
       for the body waves. 1.15 clears both with margin, so the prune cannot drop a point that would
       have won. If a supershear Vr or a per-point depth ever DOES let a rupture point outrun the
       hypocentre, that point simply survives the test and the exact envelope runs as before — this
       is a shortcut through work whose answer is already known, not a change of model. */
    const _PRUNE_SLACK=1.15;
    function _prune(K,rFor){
      if(K.length<2) return K;
      const r0=rFor(K[0],0); if(r0==null) return K;
      const floor0=r0/_PRUNE_SLACK, out=[K[0]];
      for(let i=1;i<K.length;i++){ const k=K[i], rk=rFor(k,0);
        if(rk==null) continue;
        if(k.off+rk*_PRUNE_SLACK<=floor0) continue;
        out.push(k); }
      return out;
    }
    /* (#R239) one builder, two boundaries. `side` is 'front' (the union's outer edge — first
       arrival) or 'back' (the intersection — last arrival). It returns the CONTINUOUS ring as well
       as the seam-split windows, because the band between the two is drawn as a polygon and a
       polygon wants the continuous longitudes, while a line wants the split ones. */
    function faultRing(rFor,side){
      const back=(side==='back');
      /* ⚠ NO PRUNE ON THE BACK — see `_envRmin`: the pruned points ARE the minimum. */
      const K=back?_srcPts():_prune(_srcPts(),rFor);
      const at=(b)=>back?_envRmin(K,rFor,b):_envR(K,rFor,b);
      const R0=at(0); if(R0==null) return null;
      const NB2=_frontSteps(R0), ringPts=[]; let prev=null;
      for(let a2=0;a2<=NB2;a2++){ const b=a2*360/NB2; const R=at(b); if(R==null) return null;
        const p=destAng(epi,b,Math.min(179.9,Math.max(0.02,R)));
        let lo=p[0]; if(prev!=null){ while(lo-prev>180)lo-=360; while(lo-prev<-180)lo+=360; }
        ringPts.push([lo,p[1]]); prev=lo; }
      let windows=null;
      try{ const w=HOST._splitLineToWindows(ringPts); if(w&&w.length) windows=w; }catch(_){}
      if(!windows) windows=[ringPts.map(p=>[((p[0]+540)%360)-180,p[1]])];
      return { ring:ringPts, windows, steps:NB2 };
    }
    /* ══ ⚠⚠⚠ (#R240) WHAT A FINITE FAULT DOES TO A WAVEFRONT IS AMPLITUDE, NOT SHAPE ═══════════════
       「地震シミュレータの地震波伝播は断層破壊を考慮していない。震央からほぼ同心円状に広がるだけ。」

       #R238 proved the first-arrival isochron is EXACTLY a circle whenever Vr ≤ V, and that proof is
       not going to stop being true. What is different about a wave from a 500 km fault and a wave
       from a point is how much energy leaves in each direction: Ben-Menahem's apparent source
       duration T(θ) = T₀·Fd compresses the whole radiated pulse into a shorter window ahead of the
       rupture, so the peak goes as ≈1/√Fd — ×1.83 in the direction the break ran and ×0.76 behind
       it. This panel already computes Fd for every azimuth (`fdAt`, and the 24-bin `profBank` the
       intensity field is painted from); the wavefronts were the one place still drawing a rupture as
       though it had no direction.

       So each front is emitted as arcs, and each arc carries the weight and the opacity its own
       azimuth earns. The reader sees the ring run bright and thick where the fault threw its energy
       and fade to a hairline behind the nucleation point — which is the rupture, in the picture, at
       t = 0, and it is the same quantity the table's 継続時間 column and the painted field are using.
       ⚠ WITH NO RUPTURE DRAWN `fdAt` returns 1 at every azimuth, so every arc gets weight 1 and the
       ring is byte-for-byte the circle it was. */
    /* ══ ⚠⚠⚠ (#R241) THE FRONT LEAVES THE RUPTURE, NOT THE HYPOCENTRE ═══════════════════════════════
       「地震シミュレータの地震波伝播は断層破壊を考慮していない。震央からほぼ同心円状に広がるだけ。」
       — the FIFTH round of this report, and this time the previous rounds' answer was rejected by
       name: 「いや破壊速度 Vr ≤ 波速 Vだから同心円でオッケーですってどんな理屈やねんアホ」.

       ⚠ THE THEOREM IS STILL TRUE AND IT WAS NEVER AN ANSWER. #R238 proved that
           T_first(x) = min over k of ( off_k/Vr + dist(k,x)/V )
       is minimised at off_k = 0 whenever Vr ≤ V, i.e. the FIRST ARRIVAL is exactly a circle about
       the hypocentre. Three rounds quoted that proof and shipped a circle. A proof that the picture
       cannot be drawn from the definition being used is a reason to change the definition, not a
       reason to keep drawing the circle — the reader is not asking for the first infinitesimal
       tremor, they are asking to see the earthquake come off the fault they drew.

       SO THE FRONT IS THE OTHER STATEMENT, WHICH IS THE ONE 「その時々の破壊中の断層を考慮した
       やつにしろ」 (#R239) actually describes:

           the wave spreads at V from EVERY PART OF THE FAULT THAT HAS BROKEN,
           and a part breaks when the rupture front reaches it — off_k/Vr ≤ t.

       Written out, the drawn front is the outer boundary of ∪{ k : τ_k ≤ t } of the discs of radius
       V·t about k — the OFFSET CURVE of the broken region, which is a circle while the break is
       still near the nucleation point and grows into the fault's own shape as the rupture runs. The
       rupture's progress is visible IN the wavefront, over time, which is what has been asked for
       five times.

       ⚠ WHAT THIS COSTS, STATED PLAINLY: a sub-fault that broke at τ has really been radiating for
       (t − τ), not for t, so this front runs ahead of the true first arrival by at most V·L/Vr in
       the along-strike direction. That is the ONE approximation, it is bounded, it is documented in
       the panel's own methodology paragraph, and the table is measured the same way (`at()` reads
       the distance to the rupture, which is also the distance its ground-motion model has always
       used) so the picture and the numbers cannot disagree.
       ⚠ WITH NO RUPTURE DRAWN `_srcPts()` is the hypocentre alone and τ = 0, so `_frontT` returns
       `tSec` and every front is byte-for-byte the circle it was. */
    function _frontT(k){ return (k&&k.delay>tSec)?0:Math.max(0,tSec); }
    const _FRONT_ARCS=36;
    function emitFrontArcs(feats,r,col,w){
      const ring=r.ring, n=ring.length-1;                 /* last point repeats the first */
      if(!(n>8)) return false;
      const wrap=(pt)=>[((pt[0]+540)%360)-180,pt[1]];
      const per=Math.max(2,Math.round(n/_FRONT_ARCS));
      for(let s=0;s<n;s+=per){
        const e=Math.min(n,s+per);
        const seg=ring.slice(s,e+1); if(seg.length<2) continue;
        /* the arc's own azimuth, and the amplitude the fault sends that way */
        const brg=((s+e)/2)*360/n;
        const p=destAng(epi,brg,0.5);
        let fd=1; try{ fd=fdAt(p[0],p[1]); }catch(_){}
        const g=Math.max(0.45,Math.min(2.0,1/Math.sqrt(Math.max(0.05,fd))));
        let out=null; try{ out=HOST._splitLineToWindows(seg); }catch(_){ out=null; }
        (out&&out.length?out:[seg.map(wrap)]).forEach(sg=>feats.push({type:'Feature',
          geometry:{type:'LineString',coordinates:sg},
          properties:{kind:'ring',col,w:+(w*g).toFixed(2),o:+Math.max(0.30,Math.min(1,0.92*g)).toFixed(3)}}));
      }
      return true;
    }
    function faultFrontLines(rFor){ const r=faultRing(rFor,'front'); return r?r.windows:null; }
    /* the wavefront features alone — cheap enough for a real-time tick (the intensity field and the
       report do NOT depend on tSec, so the playback loop calls this and only this) */
    function drawFronts(){
      if(!epi){ setData([]); return; }
      const feats=[{type:'Feature',geometry:{type:'Point',coordinates:epi},properties:{kind:'epi'}}];
      if(fault&&fault.ring&&fault.ring.length>=3)
        feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[[...fault.ring,fault.ring[0]]]},properties:{kind:'fault'}});
      /* ══ ⚠⚠⚠ (#R238) THE RUPTURE'S OWN FRONT — THE ONE THING THAT CARRIES THE SHAPE ═══════════════
         「地震波伝播は、震源域に対応させて。単に震央中心から同心円状に広がらせるのではなく…」, sent
         for the third round running, with the reader's answer this time: 「まだ震央中心の同心円に
         見える」. #R235 built an exact spherical envelope of the union of the source circles and
         #R237 recorded the item as already satisfied. Both are describing code that CANNOT draw
         anything but a circle, and it is provable in one line rather than a matter of degree:

             t(x) = min over rupture points k of ( off_k/Vr + dist(k,x)/V )
                  ≈ d/V + min_k [ off_k · ( 1/Vr − cos(b−φ_k)/V ) ]

         Every bracket is ≥ 0 as long as Vr ≤ V, so the minimum is ALWAYS at off_k = 0 — the
         hypocentre — and the first-arrival isochron is EXACTLY its own circle. Shipped Vr is 0.75 β,
         so min over all bearings of (1/Vr − cos/V) is +2.2e−4 for P, +9.5e−5 for S and for Rayleigh,
         +1.5e−4 for Love: strictly positive for all four. Drawing a C-shaped rupture and expecting
         the P front to be C-shaped is asking the physics for something it does not do; the envelope
         machinery is right and it collapses.

         ⚠ SO WHAT CARRIES THE SHAPE IS THE RUPTURE FRONT ITSELF, AND IT WAS NEVER DRAWN. The break
         running across the fault at Vr from the nucleation point IS the rupture's geometry in
         motion — it is bounded by the outline the reader drew, it is not a circle, it stops when the
         fault has finished breaking, and its direction is the directivity the panel already reports.
         That is the propagation 「震源域に対応」 asks for, and it is a different object from the
         wavefronts, so it is drawn as one.

         ⚠ STAR-SHAPED ABOUT THE NUCLEATION POINT, AND SAID SO. The broken region is the rupture
         outline clipped to the disc of radius Vr·t about the hypocentre. Taking it vertex by vertex
         — keep the vertex if it has broken, otherwise pull it back to the disc along its own bearing
         — is exact whenever every point of the outline is reachable in a straight line from the
         nucleation point, which is the case for a rectangle, an ellipse and every published finite-
         fault model. For an outline hooked back on itself it is a first-order answer, and the
         envelope below (which does not make that assumption) is unaffected either way. */
      /* ⚠ (#R240) the broken part of the fault is needed TWICE — once as the rupture's own fill, and
         once as the inner boundary of the shaking band below, which is what makes the fault's shape
         visible from the first second instead of six minutes in. See `train()`. */
      let brokeRing=null;
      if(fault&&fault.ring&&fault.ring.length>=3&&tSec>0){
        const rB=(VRUP_KMS*tSec)/(D*RE);                     /* how far the break has run, in degrees */
        /* (#R241) walked, not sampled — a four-corner rectangle has nothing between its corners for
           the break to advance along, so the broken outline jumped a whole edge at a time. Same
           helper the source points use, so the two can never disagree about where the fault is. */
        const R2=_walkRing(fault.ring,48), brokePts=[], edge=[]; let done=true, prev=null, run=null;
        for(let i=0;i<=R2.length;i++){
          const p=R2[i%R2.length], off=gcDelta(epi,p);
          const inside=(off<=rB);
          if(!inside) done=false;
          const q=inside?p:destAng(epi,bearingTo(epi,p),Math.max(0.0005,rB));
          let lo=q[0]; if(prev!=null){ while(lo-prev>180)lo-=360; while(lo-prev<-180)lo+=360; }
          brokePts.push([lo,q[1]]); prev=lo;
          /* the leading edge is the part of that outline that is the DISC and not the fault */
          if(!inside){ (run||(run=[])).push([lo,q[1]]); }
          else if(run){ if(run.length>1) edge.push(run); run=null; }
        }
        if(run&&run.length>1) edge.push(run);
        if(brokePts.length>2){
          const wrap=(pt)=>[((pt[0]+540)%360)-180,pt[1]];
          brokeRing=brokePts.concat([brokePts[0]]);     /* continuous longitudes — the band wants those */
          feats.push({type:'Feature',geometry:{type:'Polygon',coordinates:[brokeRing.map(wrap)]},
            properties:{kind:'rup'}});
          /* once the whole fault has broken there is no front left — the fill stays, the edge goes */
          if(!done) edge.forEach(seg=>{ let out=null;
            try{ out=HOST._splitLineToWindows(seg); }catch(_){ out=null; }
            (out&&out.length?out:[seg.map(wrap)]).forEach(s=>feats.push({type:'Feature',
              geometry:{type:'LineString',coordinates:s},properties:{kind:'rupedge'}})); });
        }
      }
      const emit=(lines,props)=>{ (lines||[]).forEach(seg=>feats.push({type:'Feature',geometry:{type:'LineString',coordinates:seg},properties:props})); };
      /* ══ ⚠⚠⚠ (#R239) A WAVE FROM A FAULT IS A BAND, NOT A LINE ═════════════════════════════════
         See `_envRmin`. The leading edge is the first arrival (a circle, provably); the trailing
         edge is the last arrival, which is the intersection of the source circles and therefore
         carries the rupture's own shape; the band between them is where the ground is shaking now.
         ⚠ ONLY WITH A RUPTURE. With a point source the two boundaries are the same curve and the
         band is empty — correctly, because a point has no length for the arrivals to spread over —
         so nothing is drawn and the picture is exactly what it was before this round. This is the
         one place the reader's 「震源域」 enters the propagation, and it enters it as physics.
         ⚠ THE POLYGON KEEPS CONTINUOUS LONGITUDES (the ring as built, before the seam split) while
         the two outlines use the split windows: a fill that has been wrapped into [−180,180] tears
         itself in half across the antimeridian, a line that has NOT been split does. */
      /* ══ ⚠⚠⚠ (#R240) …AND THE BAND HAS TO EXIST WHILE THE FAULT IS STILL TEARING ═══════════════════
         「震源域描いた時にちゃんとできてないから言ってるんだわ。そもそもできてないってことだわ」

         MEASURED on a 500 km drawn rupture, counting the features this function emits:

             t =  30 s   ring×4                                    ← circles, and nothing else
             t =  90 s   ring×4
             t = 200 s   ring×4
             t = 400 s   ring×4  band×4  ringBack×4                ← the fault finally appears

         #R239 shipped the band and then made it unreachable for the first six minutes, which is the
         whole of the animation anybody watches. The cause is stated in `_envRmin`'s own note and was
         read as a feature: T_last(x) = max over the fault of (off/Vr + dist/V) does not exist
         anywhere until the LAST piece of the fault has broken, so the trailing edge is null and this
         drew nothing at all — including no band.

         ⚠ «NO TRAILING EDGE YET» IS NOT «NOTHING IS SHAKING». It is the opposite: before the rupture
         has finished, NOWHERE has stopped, so the shaking region runs from the leading edge all the
         way back to the source. Its inner boundary in that interval is the source — the part of the
         fault that has broken — which is precisely the outline the reader drew, growing along itself
         at Vr. So the band is drawn from t = 0, and the shape bounding it from the inside is the
         fault. The two regimes join continuously: at the instant the last sub-fault breaks, the
         T_last isochron IS the fault outline (zero distance, zero extra travel), and from there it
         detaches and runs outward as the wave train's back. */
      const hasRupture=!!(fault&&fault.ring&&fault.ring.length>=3);
      const train=(rad,col,w)=>{
        const front=faultRing(rad,'front'); if(!front) return null;
        if(hasRupture){
          const back=faultRing(rad,'back');
          if(back){
            feats.push({type:'Feature',
              geometry:{type:'Polygon',coordinates:[front.ring,back.ring.slice().reverse()]},
              properties:{kind:'band',col}});
            emit(back.windows,{kind:'ringBack',col,w:Math.max(0.9,w*0.55)});
          } else if(brokeRing&&brokeRing.length>3){
            /* still tearing: the hole is the broken fault itself. Reversed for the same reason the
               T_last ring is — a GeoJSON hole runs against its outer ring. */
            feats.push({type:'Feature',
              geometry:{type:'Polygon',coordinates:[front.ring,brokeRing.slice().reverse()]},
              properties:{kind:'band',col}});
          }
        }
        /* (#R240) with a rupture the ring is emitted arc by arc so its weight can carry the
           directivity — see `emitFrontArcs`. Without one there is no direction to have, and the
           whole ring is one feature exactly as before. */
        if(!(hasRupture&&emitFrontArcs(feats,front,col,w))) emit(front.windows,{kind:'ring',col,w,o:0.92});
        return front;
      };
      /* (#R232) …and the NAME of the front, on the front. The anchor is the ring's own north-east
         point (bearing 45°, where a label is least likely to sit on the panel or the epicentre
         marker), taken from the same radius function the line was drawn from so the text can never
         drift off its own ring. `v` is the apparent speed at the leading edge — for P and S that is
         what the IASP91 ray is actually doing there, not a textbook constant. */
      /* ══ ⚠ (#R234) THE NAME GOES WHERE THE READER IS LOOKING ══════════════════════════════════════
         「地震シミュレータの地震波の名称は、一方向ではなく、今見ている箇所で見えるように表示して。」
         #R232 placed every front's name at a FIXED bearing of 45° from the epicentre. On a whole-
         Earth view that is fine; the moment the reader pans to the coast they care about — which is
         the entire point of watching a wavefront — all four names are off-screen behind them, on a
         part of the ring nobody is looking at. The bearing is now epicentre → the map's own centre,
         so each name sits on the arc that is actually in view, and it follows a pan (see the
         `moveend` subscription by onClick: it redraws the fronts, not the field). 45° remains the
         answer for the one case that has no direction — the camera sitting on the epicentre. */
      /* ⚠ (#R235) the label is placed at `_viewBearing()`, so it must ask for the radius AT THAT
         BEARING — with a laterally varying path the two are no longer the same number, and a name
         taken from bearing 0 would float off its own ring. */
      const label=(rad,col,name,vkm)=>{ const vb=_viewBearing(); const r=rad(vb); if(r==null) return;
        const p=destAng(epi,vb,Math.min(179.9,Math.max(0.02,r)));
        feats.push({type:'Feature',geometry:{type:'Point',coordinates:[((p[0]+540)%360)-180,p[1]]},
          properties:{kind:'frontLabel',col,t:name+(vkm?('  '+vkm.toFixed(1)+' km/s'):'')}}); };
      /* body waves — IASP91, each source point through the curve for ITS OWN depth (#R235 _srcPts).
         ⚠ (#R238) …AND THROUGH THE CRUST THAT BEARING CROSSES — see `_bodyStretch`. These used to be
         bearing-INDEPENDENT, which made P and S exact circles by construction whatever the reader
         drew, and P and S are the two fronts the picture is mostly made of. They go through the
         per-bearing builder now for the same reason the surface waves do: `ringLines` takes ONE
         radius, so it would draw the bearing-0 answer all the way round and throw the path away. */
      PH.forEach(ph=>{ const rad=(k,b)=>{ const dep=(k&&k.dep!=null)?k.dep:depthKm;
          if(k&&k.delay>tSec) return null;                 /* (#R241) this piece has not broken yet */
          const d=frontDelta(ph.k,dep,_frontT(k));
          if(!(d!=null&&d>0.02)) return null;
          const s=_bodyStretch(b||0,d,dep); return (s>0.02&&s<179)?s:null; };
        train(rad,ph.col,ph.w);
        /* apparent speed at the edge: the distance the front has covered over the time it took */
        let v=null; { const r=rad(null,_viewBearing()); if(r!=null&&tSec>0.5) v=(r*D*RE)/tSec; }
        label((b)=>rad(null,b),ph.col,ph.name(),v); });
      /* ══ (#R235) SURFACE WAVES TRAVEL THROUGH THE CRUST THEY ARE CROSSING ═══════════════════════
         Group velocity is no longer one constant for the whole planet: `_pathKm` integrates the
         local slowness along each bearing's great circle (see the note there), so the front runs
         ahead over oceanic path and lags over thick continental crust. Everything else is as it
         was — the 3.5 / 4.4 km/s reference values are unchanged and are what an all-continental
         path still gives. */
      SURF.forEach(sw=>{
        const rad=(k,b)=>{ if(k&&k.delay>tSec) return null;
          const d=_pathDeg(sw.v*_frontT(k),b||0); return (d>0.02&&d<179)?d:null; };
        /* ⚠ ALWAYS THE PER-BEARING BUILDER, fault or no fault. `ringLines` takes ONE radius, so with
           a point source it would draw the bearing-0 answer all the way round and quietly throw the
           path integral away — which is exactly the defect measured above. With no rupture `_srcPts`
           is just the hypocentre, so the ring is the same construction with one source point. */
        train(rad,sw.col,1.8);
        /* the name sits on the arc in view, so it reads the radius for THAT bearing */
        label((b)=>rad(null,b),sw.col,sw.name(),sw.v); });
      stations.forEach((s,i)=>feats.push({type:'Feature',geometry:{type:'Point',coordinates:[s.lng,s.lat]},properties:{kind:'station',n:String(i+1)}}));   /* (#R210) the marker carries its row number */
      /* ══ ⚠⚠ (#R242) THE OBSERVATION CITIES GO ON THE MAP TOO ═══════════════════════════════════════
         「地震シミュレータで観測都市に関してはマッピングするように。」 The table's rows come from
         `nearby()` = the points the reader PLACED plus the major cities `obsCities()` picks around the
         epicentre — and only the placed half was ever drawn. So the panel named ten cities and the map
         showed none of them: nothing tied a row to a place, and 「近隣の都市のみ」 was a claim the
         picture could not back. They are drawn as a smaller marker WITH THE CITY'S NAME beside it, so
         a reader can tell at a glance which is a point they chose (numbered disc) and which the panel
         chose for them. ⚠ Same source, same `nearby()`, so the map and the table cannot disagree. */
      try{ obsCities().forEach(c=>{ if(stations.some(s=>s.name===c.name)) return;
        feats.push({type:'Feature',geometry:{type:'Point',coordinates:[c.lng,c.lat]},properties:{kind:'city',name:String(c.name||'')}}); }); }catch(_){}
      setData(feats);
    }
    /* (#R234) which way the reader is looking, from the epicentre — see `label` in drawFronts. */
    function _viewBearing(){ try{ if(!epi) return 45;
      const c=GE().camera.getCenter(); if(!c) return 45;
      const b=bearingTo(epi,[c.lng,c.lat]);
      return isFinite(b)?b:45; }catch(_){ return 45; } }
    function draw(){ drawFronts(); report(); }

    /* ---- the answer for one place ----------------------------------------------------------------- */
    function at(lng,lat){
      if(!epi) return null;
      /* ══ ⚠⚠ (#R241) ONE DISTANCE FOR THE WHOLE PANEL, AND IT IS THE DISTANCE TO THE RUPTURE ═══════
         This read `gcDelta(epi, …)` for the TIMES and `distKmTo` (Rrup) for the SHAKING, and said so
         — 「travel times run from the HYPOCENTRE; the shaking runs from the RUPTURE」. That split was
         defensible while the drawn wavefronts were circles about the hypocentre, because the picture
         and the numbers then agreed with each other. They no longer would: the fronts leave the
         BROKEN FAULT now (see `_frontT`), so a ring drawn from the rupture would sweep over a city
         while this column still printed a time measured from a point up to 500 km away. Two answers
         to 「いつ揺れ始めるか」 in one panel is the defect #R136 records, and the one the picture uses
         is the one the ground-motion model has used since #R189. So the panel has ONE distance.
         ⚠ With no rupture drawn `distKmTo` IS the epicentral distance, so nothing moves. */
      const km=distKmTo(lng,lat);
      const deg=km/(D*RE), kmEpi=km;
      const rM=srcDistM(km);   /* (#R223) the one conversion — see srcDistM */
      const tP=arrival('P',depthKm,deg), tS=arrival('S',depthKm,deg);
      const tR=kmEpi/3.5, tL=kmEpi/4.4;
      /* (#R232) …and this point's own directivity: Fd = 1 without a drawn rupture, so an unchanged answer. */
      const m=motion(mw,rM,fdAt(lng,lat));
      /* (#R189) the ground under THIS point, when the field has read it off the DEM */
      let vs30=null;
      try{ if(fld&&fld.vs30At){ vs30=fld.vs30At(lng,lat); } }catch(_){}
      let pgv=m.pgv, pga=m.pga, pgaG=m.pgaG, a0=m.a0;
      if(vs30){ const f=ampOf(vs30)/m.amp; pgv*=f; pga*=f; pgaG*=f; a0*=f; }
      /* (#R191) …through mmiOf, like every other reader. This was the THIRD copy of the conversion
         (#R190 found two), and it is exactly why a copy is dangerous: it kept Wald 1999 while the
         model moved to Worden 2012, so the table and the map would have disagreed by a class.
         (#R192) …and 震度 comes off the JMA level, which is the scale's own definition. */
      const mmi=mmiOf(pgv);
      const jma=jmaOfA0(a0);
      const calibrated=(m.inRange&&pgv>=PGV_FELT&&mmi<=9.5);
      /* the ground is moving from S until the surface train has passed, plus the rupture's own length */
      const dur=(tS!=null)?Math.max(m.srcDurS, (tR-tS)+m.srcDurS):m.srcDurS;
      return { deg, km, tP, tS, tRayleigh:tR, tLove:tL, durS:dur, mmi, jma, a0, vs30, pgv, pga, pgaG,
        inRange:m.inRange, calibrated };   /* carried through, or the table prints an intensity the model does not claim */
    }
    const fmtT=s=>{ if(s==null||!isFinite(s)) return '—'; let t=Math.round(s); const m=Math.floor(t/60), ss=t%60;
      return m?(m+'m '+String(ss).padStart(2,'0')+'s'):(ss+'s'); };   /* round first, or 13m 59.6s prints "13m 60s" */

    /* ---- panel ------------------------------------------------------------------------------------ */
    /* ══ (#R234) ONE TYPE SCALE AND ONE TEXT COLOUR FOR THE WHOLE PANEL ═══════════════════════════
       「テキストサイズやUIやレイアウトがばらばらで煩雑なため、地震シミュレータポップアップのデザインを
         整理して。」 — measured before the change: NINE distinct font sizes in this file (9.5, 10,
       10.5, 11, 11.5, 12, 13, 15, 16 px), most of them within half a pixel of each other, i.e. not
       a hierarchy but drift. Three steps replace them, and every size below is one of the three.

       「地震シミュレータのポップアップに書かれたテキストには必須ではない限り灰色を使わないように。」
       — so `--text-muted` is gone from the body of the panel. It survives in exactly two places, and
       both are the case where grey is the MEANING rather than the decoration: the window's own ✕
       and — glyphs, which are chrome and not content. Everything a reader is meant to READ is
       `--text-main`, including the 「無感」 placeholder, which stays distinguishable from a real
       reading by having no chip behind it — (#R235) 「太字禁止」 took the chip's weight to 400 too,
       so the two are told apart by the coloured background alone, which is the thing that carries
       the meaning anyway. */
    /* ══ ⚠⚠ (#R237) 「地震シミュレータのUIが分かりにくすぎるから全面的に改修し、モダンな実装でiOS風に」
       ═══════════════════════════════════════════════════════════════════════════════════════════════
       WHAT WAS ACTUALLY HARD TO READ. #R234 gave the panel one type scale and one text colour, and
       that fixed the drift it was asked about — but it left the SHAPE alone, and the shape is the
       report: fifteen controls in one flat column, `gap:9px` between every pair of them, so
       「どの地震を読み込むか」, 「震源をどう作るか」, 「モデルの仮定」, 「再生」 and 「結果」 all sit at
       the same level with nothing saying where one ends and the next begins. Reading it means
       reading all of it. Grouping is the change; the type scale is #R234's, unchanged.

       WHAT iOS ACTUALLY IS, and what it is not. It is not rounder corners: it is the grouped inset
       list — a titled card per topic, hairline separators inside a card and none between cards, one
       row per control with its label on the left and its value on the right, and a 44 px touch row.
       The panel is now six of those cards, in the order the work is done:

           地震を選ぶ → 震源を作る → パラメータ → 表示 → 計算と再生 → 結果 → 注意と出典

       ⚠ EVERY CLASS NAME THE HANDLERS BIND TO IS UNCHANGED. `.sq-d`, `.sq-m`, `.sq-run`, `.sq-t` …
       all forty of them keep their selectors, so this is a re-grouping of the same markup and not a
       rewrite of the panel's behaviour — which is what makes it reviewable. #R236's lesson applies
       in reverse here: a control that is MOVED is safe, a control that is DELETED takes its handler
       with it or the panel throws inside render().

       ⚠ THE SHEET IS INJECTED BY THIS MODULE, NOT ADDED TO css/intmap.css. That file is a
       render-blocking <link> on every page load; this panel is behind a button and behind
       js/lazy-modules.js. Putting its styling in the boot path would pay for it on every visit that
       never opens the simulator, and this round is also asked to make the boot smaller. */
    const FS='12px', FS_S='11px', FS_H='13px';
    function _ensureCss(){
      if(document.getElementById('sq-ios-css')) return;
      const s=document.createElement('style'); s.id='sq-ios-css';
      s.textContent=[
        /* the card: one topic, hairlines inside it, nothing between it and the next but space */
        '.sq-card{background:var(--card-bg);border:1px solid var(--glass-border,rgba(128,128,128,0.16));border-radius:12px;overflow:hidden;}',
        /* ⚠ FS_S, not a literal 11px. #R234 replaced NINE drifting sizes with three constants and
           tests/r234 checks that no fourth one appears — a sheet that writes its own number is how
           the drift starts again, and the check caught exactly that in the first cut of this round. */
        '.sq-cap{font-size:'+FS_S+';font-weight:600;letter-spacing:.01em;color:var(--text-main);padding:0 3px 5px;}',
        /* ⚠ NOT --text-muted. #R234: 「必須ではない限り灰色を使わないように」 — a caption is text the
           reader is meant to read, so it is full contrast and separates itself by size and weight. */
        '.sq-sec{display:flex;flex-direction:column;}',
        '.sq-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:40px;'
          +'padding:7px 11px;font-size:'+FS+';color:var(--text-main);box-sizing:border-box;}',
        '.sq-row+.sq-row,.sq-row+.sq-blk,.sq-blk+.sq-row,.sq-blk+.sq-blk{border-top:1px solid var(--glass-border,rgba(128,128,128,0.16));}',
        /* ══ ⚠ (#R244) THE FOLD CARRIES THE CARD'S INSET, so its marker is not against the border ═════
           「「詳細設定」の左の▲・▶が微妙にUIに隠れている。」 The `<details>` was a direct child of
           `.sq-card` with no padding of its own: measured, its `<summary>` box began at x=30 with the
           card's border at x=29, and `.sq-card{overflow:hidden}` clipped the marker's outer edge —
           while every `.sq-row` beside it sits 11 px in. The inset moves to the fold itself and the
           rows INSIDE it drop their own horizontal padding, so nothing is indented twice and the
           heading rows (`.sq-advh`, the explanatory line, the `<hr>`) line up with everything else
           for the first time. */
        '.sq-adv-box{padding:0 11px 7px;box-sizing:border-box;}',
        '.sq-adv-box .sq-row{padding-left:0;padding-right:0;}',
        '.sq-blk{padding:9px 11px;font-size:'+FS+';color:var(--text-main);box-sizing:border-box;}',
        '.sq-row>span:first-child,.sq-row>label:first-child{flex:0 1 auto;min-width:0;}',
        /* the value side of a row: right-aligned, the way a grouped list puts it */
        '.sq-val{margin-left:auto;display:flex;align-items:center;gap:7px;flex:0 0 auto;}',
        '.sq-num{width:78px;height:28px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.22));'
          +'background:var(--input-bg);color:var(--text-main);font-size:'+FS+';padding:0 7px;box-sizing:border-box;text-align:right;}',
        '.sq-num:disabled{opacity:.55;}',
        '.sq-sel{height:28px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.22));'
          +'background:var(--input-bg);color:var(--text-main);font-size:'+FS+';padding:0 6px;box-sizing:border-box;max-width:100%;}',
        /* the segmented control: one track, the chosen segment carries the accent (#R206's rule) */
        '.sq-segwrap{display:flex;gap:3px;background:var(--input-bg);border-radius:10px;padding:3px;}',
        '.sq-seg{flex:1;min-width:0;border:none;background:transparent;color:var(--text-main);font-size:'+FS+';'
          +'font-weight:500;padding:7px 6px;border-radius:8px;cursor:pointer;line-height:1.25;}',
        '.sq-seg.on{background:var(--primary-color);color:#fff;font-weight:600;}',
        '.sq-btn{padding:8px 10px;border-radius:10px;border:1px solid var(--glass-border,rgba(128,128,128,0.22));'
          +'background:var(--input-bg);color:var(--text-main);font-size:'+FS+';cursor:pointer;}',
        '.sq-btn-wide{width:100%;min-height:40px;border-radius:12px;font-weight:600;}',
        '.sq-btn-accent{background:var(--primary-color);color:#fff;border-color:transparent;}',
        /* ══ ⚠⚠ (#R240) THE PINNED FOOTER — the flow, and the one verb ═══════════════════════════════
           Outside `.sq-body`, so it never scrolls away: 「フローが破綻している」 is in large part
           that the button which produces the answer was the fifth control in the fourth card. */
        '.sq-foot{flex:0 0 auto;padding:9px 12px calc(11px + env(safe-area-inset-bottom,0px));'
          +'border-top:1px solid var(--glass-border,rgba(128,128,128,0.22));background:var(--input-bg);}',
        /* (#R242) the tick track that used to be here is gone — 「チェック画面？はいらない」. */
        /* ══ (#R242) THE PLAYER — 「時刻バーとか再生機構はもっと…洗練されたiOS風のUIに」 ═══════════════
           A round accent play/pause, a scrubber whose elapsed half is filled, the two times under its
           ends, and the rate as a segmented pill. `accent-color` paints the native range's fill in
           Chromium/Safari/Firefox alike; the thumb is styled for the two engines that need it. */
        /* ══ ⚠⚠⚠ (#R245) 「再生ボタンは音楽プレーヤー風ではなく、もっとシンプルな洗練されたUIにしろ。」
           Three rounds styled the SAME media transport (#R242 Music, #R243 Podcasts, #R244 a lighter
           disc inside it). The idiom itself is what is being rejected, so the geometry goes: no
           centred ⏮ ▶ ⏭ cluster, no filled accent disc, no chip strip. One row — a 32 px glyph
           button, the scrubber, the time — then a quiet meta line and the panel's own segmented
           control for the rate. Every class and handler is unchanged (see the note in render()). */
        '.sq-player{display:flex;flex-direction:column;gap:7px;}',
        '.sq-pl-row{display:flex;align-items:center;gap:10px;}',
        /* ⚠ NOT `--text-muted`, and not a filled disc. #R234's rule 「必須ではない限り灰色を使わない」
           still holds, and the accent belongs to the button that COMPUTES (the pinned footer); a
           playback toggle is the same ink at a lighter weight. */
        '.sq-play{flex:0 0 auto;width:32px;height:32px;border-radius:9px;border:none;cursor:pointer;'
          +'background:var(--input-bg);color:var(--text-main);display:flex;align-items:center;justify-content:center;'
          +'transition:transform .12s ease,background .12s ease;padding:0;}',
        '.sq-play svg{width:15px;height:15px;}',
        '.sq-play.on{background:var(--primary-color);color:#fff;}',
        '.sq-play:active{transform:scale(0.94);}',
        '.sq-pl-meta{display:flex;align-items:center;gap:8px;font-size:'+FS_S+';}',
        '.sq-pl-cap{flex:1;min-width:0;color:var(--text-muted);letter-spacing:.01em;}',
        '.sq-pl-jumps{flex:0 0 auto;display:flex;gap:6px;}',
        /* a WORD, not a transport glyph — this is the line that stops the block reading as a player */
        '.sq-pl-jump{border:none;background:transparent;color:var(--text-main);opacity:.6;cursor:pointer;'
          +'font-size:'+FS_S+';padding:2px 0;line-height:1.2;}',
        '.sq-pl-jump+.sq-pl-jump{border-left:1px solid var(--glass-border,rgba(128,128,128,0.28));padding-left:8px;}',
        '.sq-pl-jump:hover{opacity:1;}',
        '.sq-pl-row input[type=range]{flex:1;min-width:0;margin:0;height:22px;background:transparent;'
          +'accent-color:var(--primary-color);cursor:pointer;-webkit-appearance:none;appearance:none;}',
        '.sq-pl-row input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;'
          +'background:rgba(128,128,128,0.28);}',
        '.sq-pl-row input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;'
          +'width:14px;height:14px;border-radius:50%;background:#fff;border:none;margin-top:-5px;'
          +'box-shadow:0 1px 3px rgba(0,0,0,0.3);}',
        '.sq-pl-row input[type=range]::-moz-range-track{height:4px;border-radius:2px;background:rgba(128,128,128,0.28);}',
        '.sq-pl-row input[type=range]::-moz-range-thumb{width:14px;height:14px;border:none;border-radius:50%;'
          +'background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.3);}',
        '.sq-pl-times{flex:0 0 auto;font-size:'+FS_S+';font-variant-numeric:tabular-nums;color:var(--text-muted);}',
        '.sq-pl-times .sq-tv{color:var(--text-main);font-weight:600;}',
        '.sq-sites{border-collapse:collapse;width:100%;table-layout:auto;}',
        '.sq-sites th,.sq-sites td{padding:1px 3px;}',
        '.sq-sites th:first-child,.sq-sites td:first-child{padding-left:0;}',
        /* the classic auto-layout squeeze: `width:100%;max-width:0` makes THIS the only elastic
           column, so the six numeric columns keep their natural width and the name truncates. */
        '.sq-st-nm{padding:2px 5px 2px 0 !important;width:100%;max-width:0;'
          +'overflow-wrap:anywhere;line-height:1.3;}',
        '.sq-tbl{position:relative;}',
        '.sq-ev-row{display:flex;align-items:center;gap:6px;}',
        '.sq-ev-x{flex:0 0 auto;width:30px;height:30px;border-radius:50%;border:1px solid var(--glass-border,rgba(128,128,128,0.24));'
          +'background:var(--input-bg);color:var(--text-muted);font-size:13px;line-height:1;cursor:pointer;padding:0;}',
        '.sq-ev-x:hover{color:var(--text-main);}',
        '.sq-obs-h{font-weight:600;color:var(--text-main);margin-bottom:5px;}',
        '.sq-obs{width:100%;border-collapse:collapse;table-layout:fixed;}',
        '.sq-obs th,.sq-obs td{text-align:left;vertical-align:top;padding:4px 0;'
          +'border-top:1px solid var(--glass-border,rgba(128,128,128,0.16));font-weight:400;'
          +'overflow-wrap:anywhere;line-height:1.5;}',
        '.sq-obs tr:first-child th,.sq-obs tr:first-child td{border-top:none;}',
        '.sq-obs th{width:38%;padding-right:8px;color:var(--text-muted);}',
        '.sq-obs td{color:var(--text-main);}',
        '.sq-obs-w th{width:auto;color:var(--text-muted);}',
        '.sq-obs-w th span{display:block;color:var(--text-main);margin-top:1px;}',
        '.sq-leg{display:flex;flex-wrap:wrap;gap:5px;}',
        '.sq-lgc{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:22px;'
          +'padding:0 7px;border-radius:7px;font-size:'+FS_S+';font-weight:700;line-height:1;'
          +'font-variant-numeric:tabular-nums;box-sizing:border-box;}',
        '.sq-pl-spd{display:flex;align-items:center;gap:8px;}',
        '.sq-pl-spdl{flex:0 0 auto;font-size:'+FS_S+';color:var(--text-muted);}',
        /* (#R245) the rate rides the panel's OWN segmented control (`.sq-segwrap`/`.sq-seg`) — the
           bespoke chip strip was the last media-player part of this block. Only the numerals need
           anything of their own. */
        '.sq-pl-chips{flex:1;min-width:0;}',
        '.sq-spdc{font-variant-numeric:tabular-nums;}',
        /* ══ (#R242) 「Open the tsunami simulatorを（洗練されたボタンを保ちながら）もっと目立たせろ」 ═════
           It was a tinted outline among five other tinted rows. Now it is the only FILLED element in
           the result card — the ocean gradient, a 48 px target, its own glyph in a translucent disc,
           and the estimate as a second line rather than a parenthesis. Still one button, still the
           same handler. */
        '.sq-tsu{width:100%;min-height:52px;display:flex;align-items:center;gap:11px;text-align:left;'
          +'padding:9px 13px;border:none;border-radius:14px;cursor:pointer;color:#fff;'
          +'background:linear-gradient(135deg,#0a84ff 0%,#00b8d4 100%);'
          +'box-shadow:0 4px 14px rgba(10,132,255,0.34);transition:transform .12s ease,box-shadow .12s ease;}',
        '.sq-tsu:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(10,132,255,0.42);}',
        '.sq-tsu:active{transform:translateY(0);}',
        /* (#R244) `.sq-tsu-ic` is gone with the glyph it held — 「マークを使うな」 */
        '.sq-tsu-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}',
        '.sq-tsu-t b{font-size:'+FS+';font-weight:600;line-height:1.3;}',
        '.sq-tsu-t span{font-size:'+FS_S+';opacity:0.9;line-height:1.3;}',
        '.sq-tsu-go{flex:0 0 auto;font-size:17px;opacity:0.85;}',
        '.sq-fhint{font-size:'+FS_S+';color:var(--text-main);line-height:1.45;margin-bottom:8px;}',
        /* the instruction banner keeps #R234's shape and moves inside the card it belongs to */
        '.sq-banner{padding:8px 10px;border-radius:9px;background:var(--input-bg);'
          +'border-left:3px solid var(--primary-color);color:var(--text-main);font-size:'+FS_S+';line-height:1.6;}',
        '.sq-card details>summary{cursor:pointer;font-size:'+FS+';color:var(--text-main);padding:9px 11px;list-style:revert;}',
        '.sq-card details[open]>summary{border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.16));}',
        '.sq-card details>div{padding:9px 11px;display:flex;flex-direction:column;gap:8px;}',
        '.sq-card details+.sq-row,.sq-card details+.sq-blk,.sq-row+details,.sq-blk+details{border-top:1px solid var(--glass-border,rgba(128,128,128,0.16));}',
        /* ══ ⚠⚠ (#R238) THE STEP LIST — 「震源置いたり震源域描いたりするのにUIが分かりにくすぎる」 ═════
           #R237 grouped the panel into cards and the reader's answer this round named ALL FOUR of the
           things it did not fix: the rupture-drawing gesture, the hypocentre gesture, the look, and
           the sheer amount on screen. The three controls were a SEGMENTED CONTROL — three equal
           buttons in one track — and a segmented control means 「pick one of these views」. These are
           not three views: they are three STEPS, done in order, each with a state (not started / in
           progress / done) and a result. A reader looking at three identical buttons cannot tell
           which they have already done, which they are in, or which comes next, and that is what
           「分かりにくすぎる」 is describing.

           So: a numbered grouped list, the iOS shape for a task with steps. Each row is
           number · what it is · what it came to · one button. The badge FILLS with the accent when
           the step is done and the row grows an accent rule and its instruction while it is armed —
           which is #R234's rule (「the accent fill already says it」) applied to state rather than to
           selection, so no glyph is added to any button. */
        '.sq-step{display:block;padding:0;}',
        '.sq-step+.sq-step{border-top:1px solid var(--glass-border,rgba(128,128,128,0.16));}',
        '.sq-step.on{box-shadow:inset 3px 0 0 var(--primary-color);background:var(--input-bg);}',
        '.sq-strow{display:flex;align-items:center;gap:10px;min-height:46px;padding:7px 11px;box-sizing:border-box;}',
        '.sq-stn{flex:0 0 auto;width:21px;height:21px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
          +'font-size:'+FS_S+';font-weight:600;border:1.5px solid var(--glass-border,rgba(128,128,128,0.4));color:var(--text-main);}',
        '.sq-step.done .sq-stn{background:var(--primary-color);border-color:transparent;color:#fff;}',
        '.sq-step.on .sq-stn{border-color:var(--primary-color);}',
        '.sq-stlab{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px;}',
        '.sq-stlab b{font-size:'+FS+';font-weight:600;color:var(--text-main);}',
        '.sq-stlab span{font-size:'+FS_S+';color:var(--text-main);opacity:.72;}',
        '.sq-stbtn{flex:0 0 auto;padding:7px 13px;border-radius:9px;border:1px solid var(--glass-border,rgba(128,128,128,0.22));'
          +'background:var(--input-bg);color:var(--text-main);font-size:'+FS+';font-weight:500;cursor:pointer;white-space:nowrap;}',
        '.sq-stbtn.on{background:var(--primary-color);border-color:transparent;color:#fff;font-weight:600;}',
        '.sq-stbtn:disabled{opacity:.45;cursor:default;}',
        '.sq-stbody{padding:0 11px 10px;display:flex;flex-direction:column;gap:8px;}',
      ].join('');
      document.head.appendChild(s);
    }
    /* the three inline constants #R234 left behind, now naming the classes above. They are kept as
       constants rather than inlined so the ~40 call sites below did not all have to be touched. */
    const NUM='', ROW='', BTN='';
    const CNUM='class="sq-num sq-row sq-btn"', CROW='', CBTN='';
    /* (#R205) the two halves of the map-click switch — the selected one wears the accent */
    const SEGC=(on)=>'sq-seg'+(on?' on':'');
    /* ══ (#R234) THE ONE PLACE THIS PANEL GIVES AN INSTRUCTION ════════════════════════════════════
       「このボタンをクリックしたら、何をすればいいかの指示が出るように。」 and 「◎ 震源地を設置・移動、
         ◇ 観測地点を追加ボタンについても、同様のわかりやすい案内（バナー等）を出すように。」
       One shape for all three modes, so «what do I do now» always appears in the same place, in the
       same colours, and never in two competing sizes. It is present only while a mode is armed —
       #R220's rule that a hint has one job and an idle panel should not narrate its own idleness.
       ⚠ It is NOT `--text-muted`: an instruction the reader is being asked to follow is the last
       thing that should be the faintest text on screen. */
    const BANNER=(txt)=>'<div class="sq-banner">'+txt+'</div>';
    /* ══ (#R224) 詳細設定 — the five numbers the reader may take off auto ═══════════════════════════
       A <details>, closed by default, because the instruction is explicit that the normal path is
       「自動推定だけで自然な結果」 — the overrides must be reachable without being in the way.
       ⚠ EVERY BOX IS EMPTY WHEN IT IS ON AUTO, with the estimate as its PLACEHOLDER. That is the one
       arrangement in which the same control says "the model chose 52°" and "I choose 60°" without a
       second widget per row, and clearing a box is how a value goes back to being estimated. */
    let _advOpen=false;   /* (#R242) ONE fold now — see _advHTML() */
    function _fadvRow(k,label,val,step,min,max,unit){
      const pinned=(faultOver[k]!=null);
      return '<label class="sq-row">'+label+(unit?(' <span style="opacity:.6;">'+unit+'</span>'):'')
        +'<input class="sq-fadv sq-num" data-k="'+k+'" type="number" step="'+step+'" min="'+min+'" max="'+max+'"'
        +' value="'+(pinned?faultOver[k]:'')+'" placeholder="'+val+'"'
        +' title="'+L('Leave empty to estimate it','空欄で自動推定','Leer lassen = geschätzt','Пусто — оценивается','Vacío = estimado')+'"'
        +''+(pinned?' style="border-color:var(--primary-color);"':'')+'></label>';
    }
    /* ══ (#R234) 詳細設定 — the model's own assumptions (#R233 item ⑲) ════════════════════════════
       Three controls that were on the panel's front page and describe the MODEL rather than the
       earthquake: the stress drop Brune's corner frequency is built from, the site class used only
       where the DEM cannot reach, and the crustal Q the far field is most sensitive to. Each keeps
       its own units, range and step exactly as it had them — this moves them, it does not change
       what any of them does. `_advOpen` survives a re-render. */
    /* ══ ⚠⚠ (#R242) ONE 詳細設定, NOT TWO ═══════════════════════════════════════════════════════════
       「Advanced設定はひとつにまとめろ。」 The panel had 「詳細設定 — 断層形状」 in card 2 and
       「詳細設定 — モデルの仮定」 in card 3, so a reader looking for "the advanced settings" had to
       know there were two of them and which card each lived in. `_advHTML()` is one <details> with
       both groups inside it, under the Parameters card — the fault group appears only while there IS
       a drawn rupture, exactly as before, and it is a sub-heading now rather than a second fold.
       ⚠ Every control keeps its class, so nothing about the handlers below changes. */
    function _advHTML(){
      const f=_faultAdvHTML();
      /* ══ ⚠ (#R244) THE DISCLOSURE TRIANGLE NEEDS THE SAME INSET EVERY OTHER ROW HAS ═══════════════
         「「詳細設定」の左の▲・▶が微妙にUIに隠れている。」 Measured: the `<details>` is a direct child
         of `.sq-card` with NO padding of its own, so the summary box started at x=30 while the card's
         border sits at x=29 — the marker was pressed against the border, and `.sq-card` is
         `overflow:hidden`, so its outer edge was clipped. Every sibling in that card is a `.sq-row`
         with `padding:7px 11px`; this row now carries the same 11 px, and the marker sits in it. */
      return '<details class="sq-adv-box"'+(_advOpen?' open':'')+' style="margin-top:-2px;">'
        +'<summary style="cursor:pointer;font-size:'+FS+';color:var(--text-main);padding:5px 0;">'
        +L('Advanced settings','詳細設定','Erweiterte Einstellungen','Расширенные настройки','Ajustes avanzados')
        +'</summary><div style="display:flex;flex-direction:column;gap:8px;padding:7px 0 2px;">'
        +f+(f?'<hr style="border:0;border-top:1px solid var(--glass-border,rgba(128,128,128,0.18));margin:2px 0;">':'')
        +'<div class="sq-advh" style="font-size:'+FS_S+';font-weight:600;color:var(--text-muted);">'
        +L('Model assumptions','モデルの仮定','Modellannahmen','Допущения модели','Supuestos del modelo')+'</div>'
        +_modelAdvHTML()
        +'</div></details>';
    }
    function _modelAdvHTML(){
      return ''
        +'<div style="display:flex;flex-direction:column;gap:8px;">'
        +'<label class="sq-row">'+L('Stress drop (MPa)','応力降下量 (MPa)','Spannungsabfall (MPa)','Сброс напряжений (МПа)','Caída de esfuerzo (MPa)')+'<input class="sq-sd sq-num" type="number" min="0.3" max="30" step="0.5" value="'+stressDropMPa+'"></label>'
        +'<label class="sq-row">'+L('Ground (no-DEM fallback)','地盤（DEM欠損時）','Untergrund (ohne DEM)','Грунт (без DEM)','Terreno (sin DEM)')
          +'<select class="sq-site sq-sel" style="width:132px;">'
          +'<option value="hard">'+L('hard rock (Vs30 1500)','固い岩盤 (Vs30 1500)','Festgestein (Vs30 1500)','скала (Vs30 1500)','roca dura (Vs30 1500)')+'</option>'
          +'<option value="rock">'+L('rock (Vs30 760)','岩盤 (Vs30 760)','Fels (Vs30 760)','порода (Vs30 760)','roca (Vs30 760)')+'</option>'
          +'<option value="stiff">'+L('stiff soil (Vs30 360)','硬い地盤 (Vs30 360)','steifer Boden (Vs30 360)','плотный грунт (Vs30 360)','suelo firme (Vs30 360)')+'</option>'
          +'<option value="soft">'+L('soft soil (Vs30 180)','軟弱地盤 (Vs30 180)','weicher Boden (Vs30 180)','мягкий грунт (Vs30 180)','suelo blando (Vs30 180)')+'</option>'
          +'</select></label>'
        /* (#R190) the crustal Q — the assumption the far field is most sensitive to */
        +'<label class="sq-row">'+L('Crustal Q = Q₀·f^η','地殻の Q = Q₀·f^η','Krusten-Q = Q₀·f^η','Q коры = Q₀·f^η','Q cortical = Q₀·f^η')
          +'<span style="display:flex;gap:5px;"><input class="sq-q0 sq-num" type="number" min="30" max="2000" step="10" value="'+QS0+'" title="Q₀" style="width:62px;">'
          +'<input class="sq-qe sq-num" type="number" min="0" max="1" step="0.05" value="'+QETA+'" title="η" style="width:62px;"></span></label>'
        /* (#R235) the surface-wave path term — the one lateral-heterogeneity assumption the fronts
           carry, filed beside the other priors-on-the-model rather than on the event's side of the
           panel (#R234 ⑪). 1.00 restores the constant-velocity circles exactly. */
        +'<label class="sq-row">'+L('Oceanic path, surface waves (×)','海洋地殻を通る表面波 (×)','Ozeanischer Pfad, Oberflächenwellen (×)','Океанический путь, поверхностные волны (×)','Trayecto oceánico, ondas superficiales (×)')
          +'<input class="sq-og sq-num" type="number" min="1" max="1.3" step="0.01" value="'+OCEAN_G+'"></label>'
        +'</div>';
    }
    function _faultAdvHTML(){
      if(!fault) return '';
      const pinned=Object.keys(faultOver).length;
      return '<div class="sq-advh" style="font-size:'+FS_S+';font-weight:600;color:var(--text-muted);">'
        +L('Fault geometry','断層形状','Bruchgeometrie','Геометрия разрыва','Geometría de falla')
        +(pinned?(' <b style="color:var(--primary-color);">'+pinned+'</b>'):'')+'</div>'
        +'<div style="display:flex;flex-direction:column;gap:5px;">'
        +'<div style="font-size:'+FS_S+';color:var(--text-main);line-height:1.5;">'
        +L('The drawn outline is the fault’s surface projection. Dip, width and depth are estimated from its length and shape (Wells & Coppersmith 1994 with the magnitude eliminated); the mean slip follows from the stress drop above (Eshelby). Leave a box empty to keep it estimated.',
           '描いた輪郭は断層面の地表投影です。傾斜・幅・深さは長さと形状から推定します（Wells & Coppersmith 1994 からマグニチュードを消去した関係）。平均すべり量は上の応力降下量から決まります（Eshelby の円形クラック）。空欄のままなら自動推定です。',
           'Der gezeichnete Umriss ist die Projektion der Bruchfläche. Einfallen, Breite und Tiefe werden aus Länge und Form geschätzt (Wells & Coppersmith 1994, Magnitude eliminiert); der mittlere Versatz folgt aus dem Spannungsabfall oben (Eshelby). Leeres Feld = geschätzt.',
           'Нарисованный контур — проекция плоскости разрыва. Падение, ширина и глубина оцениваются по длине и форме (Wells & Coppersmith 1994 с исключённой магнитудой); средняя подвижка следует из сброса напряжений выше (Эшелби). Пустое поле — оценка.',
           'El contorno dibujado es la proyección de la falla. Buzamiento, anchura y profundidad se estiman de su longitud y forma (Wells & Coppersmith 1994 eliminando la magnitud); el deslizamiento medio sale de la caída de esfuerzo (Eshelby). Deje el campo vacío para estimarlo.')
        +'</div>'
        +_fadvRow('dip',L('Dip','傾斜角','Einfallen','Падение','Buzamiento'),fault.dipDeg.toFixed(0),1,1,90,'°')
        +_fadvRow('widthKm',L('Fault width','断層幅','Breite','Ширина','Anchura'),fault.widthKm.toFixed(0),1,0.5,1500,'km')
        +_fadvRow('zTopKm',L('Top depth','上端深さ','Obere Tiefe','Верх','Prof. superior'),fault.zTopKm.toFixed(1),0.5,0,700,'km')
        +_fadvRow('zBotKm',L('Bottom depth','下端深さ','Untere Tiefe','Низ','Prof. inferior'),fault.zBotKm.toFixed(1),0.5,0,700,'km')
        +_fadvRow('slipM',L('Average slip','平均すべり量','Mittlerer Versatz','Средняя подвижка','Deslizamiento medio'),fault.slipM.toFixed(2),0.1,0.01,80,'m')
        +'<button class="sq-fauto sq-btn sq-btn-wide">'
        +L('Back to automatic','すべて自動推定に戻す','Zurück zu automatisch','Вернуть к авто','Volver a automático')+'</button>'
        +'</div>';
    }
    /* ══ (#R206) THE ACCENT FILL MEANS "ON", SO A BUTTON THAT IS NEVER ON MUST NOT WEAR IT ═════════
       「地震シミュレータで震源地を設置ボタンがずっと選択中になっているというUIがくそ。」

       ◎ 震源地を設置 was declared with `background:var(--primary-color);color:#fff;font-weight:700`
       UNCONDITIONALLY — byte for byte the style SEG() above uses to mean "this mode is selected" —
       and #R205 put the segmented row directly underneath it. So the panel opened with TWO of its
       three ◎/◇ controls painted as selected, one of which could never turn off: it is an action
       (arm a pick), not a mode, and it has no off state to show. That is the report.

       An action keeps its prominence without borrowing the language of state: accent TEXT on an
       accent OUTLINE. And the fill now has the one meaning it has everywhere else in this panel —
       `picking` is genuinely on while a pick is armed, so that is when it is filled. In the normal
       path window.IntMapPick hides the panel for the duration (#R196), so what a user sees is a
       button that is never stuck on; in the fallback path (no pick module, panel stays up) the fill
       is the armed state, which is exactly what it should have meant all along.

       ⚠ (#R212) THAT BUTTON NO LONGER EXISTS. 「震源地を設置と震源地を移動と、二つのボタンに分ける意味が
       全く分からない。」 — and there was none. The armed pick is now what the ◎ segment does, so the
       fill it wears is SEG()'s, which means "this is what a map click does"; the state #R206 was
       arguing about cannot get stuck because it is a mode, not an action. PICKBTN is gone with it. */
    /* (#R189) every control that changes the PHYSICS goes through this — redraw, re-report, and
       rebuild the painted field (debounced; the wavefront tick never comes through here).
       (#R190) `refresh` stays the CALLABLE path (Atlas, setParams, a picked epicentre): those are
       explicit requests for an answer, so they still compute. The panel's own spinners call
       `touch()` instead, which marks the field stale and waits for the ▶ button — see markStale. */
    /* ══ (#R196) …AND THE PROPAGATION MODEL FOLLOWS ═══════════════════════════════════════════════
       「津波シミュレーターも、初期の地震しか対応していない。」 The 🌊 button hands an event over once;
       after that the two panels described different earthquakes. Every path that changes THIS event
       now pushes it next door. `follow` is inert unless that panel is open, and it debounces, so a
       spinner being dragged does not start a solve per keystroke — see js/tsunami.js. */
    function syncTsunamiSource(){
      try{ const T=window.IntMapTsunami; if(!T||!T.follow||!epi) return;
        /* ⚠ (#R212) 「津波シミュレータ時は、フリー描画震源域の地震にも対応するように。」 — the drawn ring
           travels with the source. The tsunami model used to derive the fault plane from the magnitude
           alone (Wells & Coppersmith) and the strike from the sea floor, so a hand-drawn 600 km
           rupture along a trench produced a rectangle of the model's own choosing, pointing wherever
           the isobaths did. With the ring in hand it takes the ORIENTATION and the ASPECT from what
           was drawn and the MOMENT from μ·A·D̄ — the same M₀ this panel reports. */
        /* (#R216) the point is the WET centroid of a drawn rupture — see _rupSeaDepth */
        const P=srcPoint()||epi;
        T.follow({ lng:P[0], lat:P[1], mw:(fault?fault.mw:mw), depth:depthKm,
          /* (#R224) `areaKm2` is the 3-D PLANE now and `slipM` the solved mean slip, so the tsunami's
             moment and the panel's Mw are the same earthquake; the geometry rides along for the
             solver to use when it stops deriving its own dip from Wells & Coppersmith. */
          rupture: fault?{ ring:fault.ring, areaKm2:fault.areaKm2, areaProjKm2:fault.areaProjKm2,
            slipM:+fault.slipM.toFixed(2), mw:fault.mw, dipDeg:fault.dipDeg, widthKm:fault.widthKm,
            zTopKm:fault.zTopKm, strikeDeg:fault.strikeDeg }:null });
      }catch(_){}
    }
    function refresh(){ draw(); warmEpi(); schedField(); syncTsunamiSource(); }
    function touch(){ draw(); warmEpi(); markStale(); syncTsunamiSource(); }
    /* ══ ⚠⚠⚠ (#R240) THE FLOW, SAID ONCE, WHERE IT CANNOT SCROLL AWAY ══════════════════════════════
       「手順や流れが全く理解できない。フローが破綻している。」

       Three rounds have改善ed the CONTROLS — #R236 put them in work order, #R238 made them numbered
       steps with their own state, #R239 put the armed instruction on the map. Measured against the
       shipped build, what is still missing is the thing all three assumed the reader already had:

         · nothing on screen says the panel HAS a sequence, or where in it you are. Six cards, in a
           column, all the same weight — 「地震を読み込む」 and 「震源を作る」 read as alternatives.
         · the one button that produces the answer is the 5th thing in the 4th card. On a 900 px
           screen it is BELOW THE FOLD of the panel's own scroller, so the reader scrolls the panel
           looking for a verb, and the map has already painted a field, so it is not even clear that
           pressing anything is required.
         · and the panel opened with a step armed and 「解除」 on it — see `clickMode`.

       So the panel gets a FOOTER, outside the scroller, pinned: the three steps as a track with the
       done ones ticked and the current one lit, one line naming what to do next, and the primary
       action — which is the SAME `.sq-run` button, moved here rather than copied, because two
       buttons that compute would be two sources of truth ([[intmap-recurring-lessons]] G). What the
       footer's verb is depends on the state, and there is exactly one at a time:

           no epicentre        →  ② 震央を置く            (arms the map, and the HUD says so)
           epicentre, stale    →  ▶ 震度分布を計算
           computed            →  ▶ 震度分布を再計算 …and the transport above it is live

       ⚠ The track is a READOUT of `fault` / `epi` / `fldStale`; pressing a step is the same handler
       the step row uses. Nothing here is a second mechanism. */
    function _flowStep(){
      if(!epi) return 'epi';
      if(_needsRun()||fldBusy) return 'run';
      return 'done';
    }
    /* ⚠ (#R242) 「✓Rupture area✓HypocenterIntensityのチェック画面？はいらない。」 — the tick track
       #R240 put in this footer is gone. What the footer is FOR stays: the one line naming the next
       action, and the primary button, still pinned outside the scroller so it is always reachable. */
    /* ══ ⚠⚠ (#R243) THE PROGRESS BAR LIVES UNDER THE BUTTON THAT STARTS IT ══════════════════════════
       「震度分布を計算ボタンの下に計算進捗ボタンが出現するように。」
       `.sq-prog` was built in card 4, several screens up: press the pinned button and the only thing
       that moves is a bar the reader cannot see. It is now a SECOND `.sq-prog` inside this footer,
       and `_setProg()` writes to BOTH (`querySelectorAll`), so there is still one progress state with
       two readouts rather than two mechanisms. It appears when a solve starts and goes when it ends —
       exactly the display rule `_setProg` already had.
       ⚠ AND THE 「完了しました」 LINE IS GONE. 「これはいらない」. When there IS something to do the
       footer says what; when the answer is on screen it says nothing and just offers the recompute. */
    function _progHTML(cls){
      return '<div class="sq-prog '+cls+'" style="display:none;">'
        +'<div class="sq-progl" style="margin-bottom:4px;font-size:'+FS+';color:var(--text-main);"></div>'
        +'<div style="height:7px;border-radius:4px;background:rgba(128,128,128,0.22);overflow:hidden;">'
        +'<i class="sq-progb" style="display:block;height:100%;width:0%;background:var(--prog-grad);transition:width 0.15s;"></i></div></div>';
    }
    function _flowFoot(){
      const st=_flowStep();
      const hint=st==='epi'
        ? L('Tap the map to place the hypocenter. Drawing a rupture area first is optional.','地図をタップして震央を置いてください。先に震源域を描くこともできます（任意）。','Tippen Sie auf die Karte, um das Hypozentrum zu setzen. Eine Bruchfläche vorher zu zeichnen ist optional.','Нажмите на карту, чтобы поставить гипоцентр. Очаг можно обвести заранее — это необязательно.','Toque el mapa para colocar el hipocentro. Dibujar antes la ruptura es opcional.')
        : (st==='run'
          ? L('Press to solve the intensity field for this source.','この震源で震度分布を計算します。','Für diesen Herd das Intensitätsfeld berechnen.','Рассчитать поле интенсивности для этого очага.','Calcule el campo de intensidad para esta fuente.')
          : '');
      const btn=(st==='epi')
        ? '<button class="sq-go-epi sq-btn sq-btn-wide sq-btn-accent">② '+L('Place the hypocenter','震央を置く','Hypozentrum setzen','Поставить гипоцентр','Colocar el hipocentro')+'</button>'
        : '<button class="'+_runBtnClass()+'">'+_runBtnLabel()+'</button>';
      /* ⚠ (#R246) THE PROGRESS SITS ABOVE THE BUTTON. 「計算進捗は「震度分布を計算」の下ではなく上に。」
         #R243 put it under the button because that is where the bar the reader could not see used to
         be (card 4, several screens up); the pinned footer is at the BOTTOM of the panel, so a bar
         below the button is the last row on screen and the button — the thing being pressed — jumps
         down by the bar's height the moment a solve starts. Above it, the button keeps its position
         and the bar grows into the footer instead. One `.sq-prog`, one `_setProg()`, moved not copied. */
      return '<div class="sq-foot"'+(minimised?' style="display:none;"':'')+'>'
        +(hint?('<div class="sq-fhint">'+hint+'</div>'):'')
        +'<div class="sq-foot-prog" style="margin-bottom:9px;">'+_progHTML('sq-prog-foot')+'</div>'+btn+'</div>';
    }
    function render(){ if(!panel) return; _ensureCss();
      /* (#R239) the on-map HUD is a readout of the same three states this function is about to draw
         rows for, so it is refreshed from exactly here and from nowhere else. */
      try{ _hud(); }catch(_){}
      panel.innerHTML='<div class="sq-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;">'
        /* (#R232) 「地震シミュレータから🌐の絵文字を削除。」 A globe glyph in front of a panel that is
           already the earthquake panel said nothing, and the standing rule is no decorative emoji. */
        +'<span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">'+L('Seismic waves','地震波シミュレーター','Seismische Wellen','Сейсмические волны','Ondas sísmicas')+'</span>'
        /* (#R210) 「地震・津波シミュレータウィンドウは最小化可能に。」 A long solve is worth watching the
           map during; closing the panel throws the run away, so the third state is "keep everything,
           give the map back its pixels". The header stays (it is also the drag handle), the body is
           the only thing hidden, and `minimised` lives outside render() so a redraw keeps it. */
        +'<button class="sq-min" title="'+L('Minimize','最小化','Minimieren','Свернуть','Minimizar')+'" aria-label="'+L('Minimize','最小化','Minimieren','Свернуть','Minimizar')+'" style="border:none;background:transparent;color:var(--text-muted);font-size:15px;line-height:1;cursor:pointer;padding:0 4px;">'+(minimised?'▢':'—')+'</button>'
        +'<button class="sq-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>'
        /* ⚠⚠ (#R215) `display` WAS DECLARED TWICE IN THE SAME INLINE STYLE, AND THE SECOND ONE WON.
           「地震・津波シミュレータウィンドウは最小化可能に」 — #R210 added the button and it has been a no-op ever
           since: the string began `display:none;` when minimised and then unconditionally continued
           `…;display:flex;…`, so CSS's last-declaration-wins put the body straight back. MEASURED: the
           glyph flipped to ▢ and `getComputedStyle(.sq-body).display` stayed `flex`. One property, one
           declaration. */
        /* (#R240) `flex:1 1 auto; min-height:0` rather than a max-height of its own — see the panel's
           cssText: the SCREEN is the bound, and the footer under this box has to keep its room. */
        +'<div class="sq-body" style="padding:11px 12px 13px;display:'+(minimised?'none':'flex')+';flex:1 1 auto;min-height:0;flex-direction:column;gap:13px;overflow-y:auto;">'
        /* CARD 1 — 地震を選ぶ */
        +'<div><div class="sq-cap">'+L('Load an earthquake','地震を読み込む','Beben laden','Загрузить землетрясение','Cargar un terremoto')+'</div><div class="sq-card">'
        /* ══ (#R232) 「過去の地震を選べる機能を付け、選んだら当時と同じ条件や震源域を精密に入力し、その
              結果を出すように。」 One control, at the top, because it REPLACES every input below it —
              hypocentre, depth, magnitude, focal mechanism, rupture rectangle and nucleation point all
              come from the row (js/seismic-events.js) and the panel then computes the result the same
              way it computes anything the reader drew by hand. Nothing about the model is special-cased
              for a preset: that is what makes the answer comparable. */
        /* ══ (#R236) ONE PLACE TO LOAD AN EARTHQUAKE, WITH TWO SOURCES ═══════════════════════════════
           「過去の地震を読み込む、最近の地震を読み込むは同じUIに統一し、そのなかで両方から選べるように。」
           and, on the shape: 「上部に切替、下に共通の一覧」.

           They had been two unrelated controls at opposite ends of the panel — a `<select>` of the
           curated catalogue at the top and a button-plus-`<select>` for the USGS feed at the bottom —
           which made "load an earthquake" a thing you did in two different places depending on which
           kind you wanted. Now: one segmented switch, one list under it. The switch chooses where the
           rows COME FROM; everything below the list is unchanged, because both paths already ended
           in the same place (applyEvent / applyReal each set up the panel the same way a hand-drawn
           event is set up). ⚠ The recent list is fetched on demand and only once — switching to it
           with nothing loaded starts the query, and the list says so while it runs. */
        +'<div class="sq-ev-wrap sq-blk" style="display:flex;flex-direction:column;gap:7px;">'
        +'<div class="sq-segwrap">'
          +'<button class="sq-src-past '+SEGC(evSrc!=='recent')+'">'+L('Past earthquakes','過去の地震','Vergangene Beben','Прошлые землетрясения','Terremotos pasados')+'</button>'
          +'<button class="sq-src-recent '+SEGC(evSrc==='recent')+'">'+L('Recent earthquakes','最近の地震','Aktuelle Beben','Недавние землетрясения','Terremotos recientes')+'</button>'
        +'</div>'
        +'<div class="sq-ev-row"><select class="sq-ev" style="flex:1;min-width:0;box-sizing:border-box;padding:6px 8px;border-radius:8px;border:1px solid rgba(128,128,128,0.28);background:var(--input-bg);color:var(--text-main);font-size:'+FS+';">'
        +(evSrc==='recent'
          ? ('<option value="">'+(_realBusy
                ? L('Loading the recent earthquakes…','最近の地震を読み込み中…','Aktuelle Beben werden geladen…','Загрузка недавних землетрясений…','Cargando terremotos recientes…')
                : (_realFeats.length
                   ? L('Choose an earthquake…','地震を選んでください…','Beben auswählen…','Выберите землетрясение…','Elija un terremoto…')
                   : L('No list yet — press to load','一覧はまだありません（押すと読み込みます）','Noch keine Liste — zum Laden drücken','Списка ещё нет — нажмите для загрузки','Aún no hay lista — pulse para cargar')))+'</option>'
             +_realFeats.map((f,i)=>'<option value="'+i+'">'+HOST.escapeHtml(_realLabel(f))+'</option>').join(''))
          : ('<option value="">'+L('Choose an earthquake…','地震を選んでください…','Beben auswählen…','Выберите землетрясение…','Elija un terremoto…')+'</option>'
             +QUAKE_EVENTS.map(e=>'<option value="'+e.id+'"'+(evId===e.id?' selected':'')+'>'+HOST.escapeHtml(L.arr(e.name))+' · M'+e.mw.toFixed(1)+'</option>').join('')))
        +'</select>'
        /* ══ ⚠ (#R242) A LOADED EARTHQUAKE HAS TO BE UNLOADABLE ═════════════════════════════════════
           「過去の地震から選んだ後、それを選択解除して戻す方法がない。」 The list's first option is
           「地震を選んでください…」 and choosing it did nothing — `onchange` returned early on the empty
           value — so once a preset was in, the panel had no way back to the state it opens in. Now that
           option CLEARS, and there is a visible ✕ beside the list while something is loaded, because a
           way back that is only reachable by re-opening a dropdown is not a way back. */
        +(evNow?('<button class="sq-ev-x" title="'+L('Clear the loaded earthquake','読み込んだ地震を解除','Geladenes Beben entfernen','Убрать загруженное землетрясение','Quitar el terremoto cargado')+'" aria-label="'+L('Clear the loaded earthquake','読み込んだ地震を解除','Geladenes Beben entfernen','Убрать загруженное землетрясение','Quitar el terremoto cargado')+'">✕</button>'):'')
        +'</div>'
        +(evNow?('<div class="sq-ev-obs sq-blk" style="font-size:'+FS_S+';line-height:1.55;color:var(--text-main);border-left:2px solid var(--primary-color);">'+evObsHtml(evNow)+'</div>'):'')
        /* ══ ⚠⚠⚠ (#R245) THREE CLOSERS, NOT TWO — THIS IS WHY THE FOOTER WAS NEVER PINNED ═══════════
           「ポップアップ時に震度分布を計算が下部スティックになっていない。」
           Card 1 opens THREE boxes — its own wrapper, `.sq-card`, and `.sq-ev-wrap` — and closed two.
           An unbalanced innerHTML does not throw: the parser simply keeps card 1's wrapper open, so
           cards 2…6 were nested INSIDE card 1, and the final `</div>` at the end of card 6 (which was
           written for `.sq-body`) closed that wrapper instead. `.sq-body` therefore never closed
           either, and `_flowFoot()` — the whole point of which is that it sits OUTSIDE the scroller
           (#R240) — was appended INTO it. MEASURED on the shipped build (desktop, 720 px tall):
           panel 80…706, `.sq-body` 121…705, `.sq-foot` **1510…1580** — 800 px below the panel, i.e.
           it scrolled with the cards exactly like every other row. The pinned footer has never been
           pinned since #R240 created it; it is one `</div>`. */
        +'</div></div></div>'
        /* ══ ⚠⚠⚠ (#R243) A LOADED EARTHQUAKE IS NOT A THING YOU CONFIGURE ══════════════════════════
           「過去・最近の地震から選択した場合、ユーザーが自ら設定する類のUiは全部消すように。」
           Confirmed with the reader: 「震度階級の選択以外、2,3は隠す」.

           Cards 2 (震源を作る — the rupture outline, the hypocentre, the observation points) and 3
           (パラメータ — depth, magnitude, 詳細設定) exist so a reader can BUILD a source. When one is
           loaded from the catalogue or the USGS feed, every one of those numbers is already the
           published value for a real earthquake (js/seismic-events.js: hypocentre, depth, magnitude,
           focal mechanism, the finite-fault outline and the nucleation point), so offering the
           controls invites the reader to overwrite a measurement with a guess and makes the panel
           look like a form when it is a result.
           ⚠ THE ONE EXCEPTION IS 震度階級, which is not a property of the earthquake: MMI or JMA is
           how the READER wants the answer spelled, and it stays available for a loaded event exactly
           as it is for a drawn one.
           ⚠ AND THIS IS A DISPLAY RULE, NOT A DELETION. `evNow` is cleared by the ✕ beside the list
           and by picking the empty option (#R242), and both re-render — so the controls come back
           whole, with their state untouched, the moment the earthquake is unloaded. */
        +(evNow?'':(''
        /* CARD 2 — 震源を作る: the three steps, the instruction for whichever is armed, and what the
           drawn rupture turned out to be. One card because they are one task. */
        +'<div><div class="sq-cap">'+L('Build the source','震源を作る','Herd aufbauen','Задать очаг','Definir la fuente')+'</div><div class="sq-card">'
        /* ══ (#R212) ONE CONTROL FOR ONE THING ═══════════════════════════════════════════════════════
           「震源地を設置と震源地を移動と、二つのボタンに分ける意味が全く分からない。」 There is no
           difference between the two — an epicentre that exists is moved and one that does not is
           placed, by the same tap on the same map. #R205 and #R196 had arrived at two buttons for two
           MECHANISMS (a one-shot armed pick that hides the panel on a phone, and a persistent click
           mode), which is the app's internals showing through. Now: one segment, which does both —
           it selects what a plain map click means AND arms the pick, so the panel gets out of the way
           on the screens where it covers the map. Pressing it again re-arms it. */
        /* ══ (#R236) ONE ROW, AND THE RUPTURE AREA COMES FIRST ═══════════════════════════════════════
           「震源地点配置とフリー描画、観測地点追加ボタンは横一列に配置して。」 and, after a first
           answer that had it the other way round, 「やっぱり、震源域を先にという形に。その後に、
           震央を震源域の範囲内に配置という形に。」

           So the row reads in the order the work is done: draw the rupture area, put the hypocentre
           somewhere ON that area, then add the places you want answers for. The three used to be two
           rows separated by the banner, which put the drawing button BELOW the instruction telling
           you to draw. ⚠ The ✕ is not a fourth step — it only exists once there is a rupture to
           clear, and it stays beside the button that made one. */
        /* ══ ⚠⚠⚠ (#R238) THREE STEPS, NOT THREE BUTTONS ═══════════════════════════════════════════════
           「地震シミュレータで震源置いたり震源域描いたりするのにUIが分かりにくすぎるから全面的に改修し、
             モダンな実装でiOS風に。」 — and, asked which part, the reader named all four: the drawing
           gesture, the hypocentre gesture, the look, and the amount on screen.

           #R236 put these three in ONE ROW in the order the work is done, and #R234 stripped their
           glyphs. Both were right about the ORDER and wrong about the CONTROL: a segmented track says
           「these are alternatives, pick one」, and these are not alternatives — they are a sequence
           with state. Nothing on screen said which of the three was already done, what it came to, or
           which one to press next, and the one instruction banner sat OUTSIDE all three, so the
           reader had to hold "the banner is talking about the middle button" in their head.

           Now each step is its own row and carries its own three facts: a number, what it produced
           (「未設定」 or the value), and one button whose word is the next action for THAT step
           (描く / 描画を終了 / 描き直す). The instruction lives INSIDE the armed row, under the button
           that armed it. ⚠ The class names the handlers grab are unchanged — `.sq-fdraw`,
           `.sq-cm-epi`, `.sq-cm-sta`, `.sq-fclear` — so this is a re-shape of the markup and not a
           rewrite of the wiring (#R237's rule, which is what kept that round's regression list to
           spelling). */
        +(function(){
          const step=(n,cls,title,value,btn,body)=>'<div class="sq-step'+(cls?' '+cls:'')+'">'
            +'<div class="sq-strow"><span class="sq-stn">'+n+'</span>'
            +'<span class="sq-stlab"><b>'+title+'</b><span>'+value+'</span></span>'+btn+'</div>'
            +(body?('<div class="sq-stbody">'+body+'</div>'):'')+'</div>';
          /* ① the rupture area */
          const s1btn='<button class="sq-fdraw sq-stbtn'+(_fDrawing?' on':'')+'">'+(_fDrawing
              ?L('Finish','終了','Fertig','Готово','Terminar')
              :(fault?L('Redraw','描き直す','Neu zeichnen','Перерисовать','Redibujar')
                     :L('Draw','描く','Zeichnen','Нарисовать','Dibujar')))+'</button>'
            +(fault?('<button class="sq-fclear sq-stbtn" title="'+L('Clear','消去','Löschen','Очистить','Borrar')+'">✕</button>'):'');
          const s1val=fault
            ?(Math.round(fault.areaKm2).toLocaleString()+' km² · M'+fault.mw.toFixed(1))
            :L('Not set — optional, a point source works too','未設定（省略可・点震源でも動きます）','Nicht gesetzt — optional','Не задано — необязательно','Sin definir — opcional');
          /* ② the hypocentre */
          const s2btn='<button class="sq-cm-epi sq-stbtn'+(clickMode==='epi'?' on':'')+'">'+(clickMode==='epi'
              ?L('Cancel','解除','Abbrechen','Отмена','Cancelar')
              :(epi?L('Move','動かす','Verschieben','Переместить','Mover'):L('Place','置く','Setzen','Указать','Colocar')))+'</button>';
          const s2val=epi
            ?(epi[1].toFixed(3)+'°, '+epi[0].toFixed(3)+'° · '+L('depth','深さ','Tiefe','глубина','prof.')+' '+depthKm+' km')
            :L('Not set','未設定','Nicht gesetzt','Не задано','Sin definir');
          /* ③ the places the table answers for */
          const s3btn='<button class="sq-cm-sta sq-stbtn'+(clickMode==='station'?' on':'')+'">'+(clickMode==='station'
              ?L('Done','終了','Fertig','Готово','Listo')
              :L('Add','追加','Hinzufügen','Добавить','Añadir'))+'</button>';
          const s3val=stations.length
            ?(stations.length+' '+L('places','地点','Orte','точек','lugares'))
            :L('Nearby cities only','近隣の都市のみ','Nur Städte in der Nähe','Только ближайшие города','Sólo ciudades cercanas');
          return step('1',(fault?'done':'')+(_fDrawing?' on':''),
                L('Rupture area','震源域','Bruchfläche','Очаг','Ruptura'),s1val,s1btn,
                _fDrawing?BANNER('<b>'+L('Draw the rupture area on the map.','地図上で震源域を囲ってください。','Zeichnen Sie die Bruchfläche auf der Karte.','Обведите очаг на карте.','Rodee la ruptura en el mapa.')+'</b><br>'
                  +L('Click to start, click each corner, and click the first point again to finish.','クリックで開始し、続けてクリックして囲み、最初の点をもう一度クリックすると終了です。','Klicken zum Starten, weiter klicken, und den ersten Punkt erneut klicken zum Beenden.','Клик — начать, далее клики по контуру, клик по первой точке — закончить.','Haga clic para empezar, siga marcando el contorno y vuelva a hacer clic en el primer punto para terminar.')):'')
            +step('2',(epi?'done':'')+(clickMode==='epi'?' on':''),
                L('Hypocenter','震央','Hypozentrum','Гипоцентр','Hipocentro'),s2val,s2btn,
                clickMode==='epi'?BANNER(fault
                  ?('<b>'+L('Tap inside the rupture area to place the hypocenter.','震源域の内側をタップして震央を置いてください。','Tippen Sie in die Bruchfläche, um das Hypozentrum zu setzen.','Нажмите внутри очага, чтобы поставить гипоцентр.','Toque dentro de la ruptura para colocar el hipocentro.')+'</b><br>'
                   +(_epiOutside
                     ? '<span style="color:var(--danger-color,#ff453a);">'+L('That point is outside the rupture area — the rupture starts on the plane it happened on.','その地点は震源域の外です。破壊はその面の上から始まります。','Dieser Punkt liegt außerhalb der Bruchfläche — der Bruch beginnt auf der Fläche selbst.','Эта точка вне очага — разрыв начинается на самой плоскости.','Ese punto está fuera de la ruptura — la ruptura empieza en el propio plano.')+'</span>'
                     : L('This is where the rupture starts, so it sets the direction it runs in.','ここが破壊の開始点になり、破壊が走る向きを決めます。','Hier beginnt der Bruch, das bestimmt seine Laufrichtung.','Отсюда начинается разрыв — это задаёт направление.','Aquí empieza la ruptura, lo que fija su dirección.')))
                  :('<b>'+L('Tap the map to place the epicenter.','地図をタップして震源地を置いてください。','Tippen Sie auf die Karte, um das Epizentrum zu setzen.','Нажмите на карту, чтобы поставить эпицентр.','Toque el mapa para colocar el epicentro.')+'</b><br>'
                   +L('If one is already placed, tapping moves it.','すでに設置済みの場合はタップした位置へ移動します。','Ist bereits eines gesetzt, wird es verschoben.','Если эпицентр уже есть, он переместится.','Si ya hay uno, el toque lo mueve.'))):'')
            +step('3',(stations.length?'done':'')+(clickMode==='station'?' on':''),
                L('Observation points','観測地点','Messpunkte','Точки наблюдения','Puntos de observación'),s3val,s3btn,
                clickMode==='station'?BANNER('<b>'+L('Click the map to add an observation point.','地図をクリックして観測地点を追加してください。','Klicken Sie auf die Karte, um einen Messpunkt hinzuzufügen.','Кликните по карте, чтобы добавить точку наблюдения.','Haga clic en el mapa para añadir un punto de observación.')+'</b><br>'
                  +L('Each point is added to the table below.','追加した地点は下の表に並びます。','Jeder Punkt erscheint in der Tabelle unten.','Каждая точка попадает в таблицу ниже.','Cada punto aparece en la tabla de abajo.')):'');
        })()
        /* ══ ⚠ (#R238) THE SHARED BANNER IS GONE — EACH STEP CARRIES ITS OWN ════════════════
           #R234 put ONE banner here for all three modes, under the row of three buttons, so the
           reader had to work out which button it was talking about. The step list above now shows
           the instruction INSIDE the armed step, directly under the button that armed it, which is
           the same words in the place they refer to. Leaving this block as well printed the
           instruction TWICE — seen in the screenshot of the first build, once inside step 2 and
           again below step 3. Deleted, not hidden: two copies of one sentence is the #R220 defect
           («a list in two places») applied to prose. */
        /* (#R189) the free-drawn rupture: draw → capture, slip → Mw.
           (#R236) its BUTTON moved up into the single row above; what stays here is the readout. */
        /* ══ (#R224) THE DRAWN AREA IS THE SHADOW; WHAT IS REPORTED IS THE PLANE ════════════════════
           Both numbers are shown, because 「断層面積」 is now genuinely two numbers and leaving the
           reader to guess which one is on screen would be the same defect in a new place. The slip is
           an estimate until it is typed — the row says which, so 「自動推定」 is visible rather than
           implied. */
        +(fault?('<div class="sq-finfo sq-blk" style="line-height:1.65;">'
          +L('Rupture','震源域','Bruchfläche','Очаг','Ruptura')+' <b style="color:var(--text-main);">'+Math.round(fault.areaKm2).toLocaleString()+' km²</b> '
          +L('(3-D fault plane)','（3D断層面）','(3-D-Bruchfläche)','(3-D плоскость)','(plano 3-D)')
          +' · '+L('surface projection','地表投影','Projektion','проекция','proyección')+' '+Math.round(fault.areaProjKm2).toLocaleString()+' km²<br>'
          +Math.round(fault.lengthKm)+' × '+Math.round(fault.widthKm)+' km · '+L('dip','傾斜','Einfallen','падение','buzamiento')+' '+Math.round(fault.dipDeg)+'° · '
          +L('depth','深さ','Tiefe','глубина','prof.')+' '+fault.zTopKm.toFixed(1)+'–'+fault.zBotKm.toFixed(1)+' km<br>'
          +'D̄ '+fault.slipM.toFixed(2)+' m'+(fault.auto.slip?(' <span style="opacity:.7;">'+L('(auto)','（自動）','(auto)','(авто)','(auto)')+'</span>'):'')
          +' → <b style="color:var(--text-main);">M'+fault.mw.toFixed(1)+'</b> (M₀ '+fault.M0.toExponential(2)+' N·m)</div>'):'')   /* (#R242) the fault's own controls moved into the ONE 詳細設定 in card 3 */
        +'</div></div>'
        /* CARD 3 — パラメータ: what this earthquake IS, plus (folded) what the MODEL assumes.
           #R234 moved the three model priors behind 詳細設定 for exactly this reason; the card now
           says out loud which of the two kinds of number the reader is looking at. */
        +'<div><div class="sq-cap">'+L('Parameters','パラメータ','Parameter','Параметры','Parámetros')+'</div><div class="sq-card">'
        +'<label class="sq-row">'+L('Depth (km)','深さ (km)','Tiefe (km)','Глубина (км)','Profundidad (km)')+'<input class="sq-d sq-num" type="number" min="0" max="700" step="5" value="'+depthKm+'"></label>'
        +'<label class="sq-row">'+L('Magnitude (Mw)','規模 (Mw)','Magnitude (Mw)','Магнитуда (Mw)','Magnitud (Mw)')+'<input class="sq-m sq-num" type="number" min="3" max="9.6" step="0.1" value="'+mw.toFixed(1)+'"'+(fault?' disabled title="'+L('Set by the drawn rupture — remove it to edit','描いた震源域から決まります（解除で編集可）','Durch die Bruchfläche bestimmt','Задана нарисованным очагом','Fijada por la ruptura dibujada')+'"':'')+'></label>'
        /* (#R189) which intensity scale is spoken — MMI, or the JMA scale via the PGV conversion */
        +'<label class="sq-row">'+L('Intensity scale','震度階級','Intensitätsskala','Шкала интенсивности','Escala de intensidad')
          +'<select class="sq-scale sq-sel" style="width:132px;">'
          +'<option value="mmi"'+(scale==='mmi'?' selected':'')+'>MMI</option>'
          +'<option value="jma"'+(scale==='jma'?' selected':'')+'>'+L('JMA (shindo)','気象庁震度','JMA (Shindo)','JMA (синдо)','JMA (shindo)')+'</option>'
          +'</select></label>'
        /* ══ (#R234) THE THREE MODEL ASSUMPTIONS ARE BEHIND 詳細設定 ═══════════════════════════════
           「応力降下量 (MPa)、地盤（DEM欠損時）、地殻の Q = Q₀·f^η は詳細設定のほうに入れて。」
           All three answer a question the reader did not ask — they are the model's own priors, not
           a description of an earthquake — and the panel's front page is for the event. Same
           <details> shape as 詳細設定 — 断層形状 above it (#R224), closed by default, so nothing is
           lost and nothing is in the way. */
        +_advHTML()
        +'</div></div>'
        ))
        /* ⚠ (#R243) …AND 震度階級 IS THE EXCEPTION THE READER NAMED, so with an earthquake loaded it
           gets its own one-row card rather than dragging the rest of パラメータ back with it. Same
           class, same handler, same `scale` state — this is where the control is drawn, not a copy. */
        +(evNow?('<div><div class="sq-cap">'+L('Display','表示','Anzeige','Отображение','Visualización')+'</div><div class="sq-card">'
          +'<label class="sq-row">'+L('Intensity scale','震度階級','Intensitätsskala','Шкала интенсивности','Escala de intensidad')
          +'<select class="sq-scale sq-sel" style="width:132px;">'
          +'<option value="mmi"'+(scale==='mmi'?' selected':'')+'>MMI</option>'
          +'<option value="jma"'+(scale==='jma'?' selected':'')+'>'+L('JMA (shindo)','気象庁震度','JMA (Shindo)','JMA (синдо)','JMA (shindo)')+'</option>'
          +'</select></label></div></div>'):'')
        /* CARD 4 — 計算と再生: the one button that computes, the bar that says how far it got, and
           the transport that moves time. They are one card because they are one loop. */
        +'<div><div class="sq-cap">'+L('Run and playback','計算と再生','Rechnen und Wiedergabe','Расчёт и воспроизведение','Cálculo y reproducción')+'</div><div class="sq-card">'
        /* ══ (#R190) 「震度の塗は透明度選択を可能に」 ═══════════════════════════════════════════════ */
        +'<label class="sq-row">'+L('Intensity fill opacity','震度分布の不透明度','Deckkraft der Fläche','Непрозрачность заливки','Opacidad del relleno')
          +'<span style="display:flex;align-items:center;gap:6px;flex:1;justify-content:flex-end;">'
          +'<input type="range" class="sq-op" min="5" max="100" step="5" value="'+Math.round(fldOpacity*100)+'" style="width:112px;">'
          +'<b class="sq-opv" style="min-width:34px;text-align:right;color:var(--text-main);">'+Math.round(fldOpacity*100)+'%</b></span></label>'
        /* ══ (#R190) 「計算開始ボタンを設置し、LOC方式でローディング表示もして」 (LOS style: real % + bar) */
        /* ══ (#R234) THE BUTTON HAS TWO STATES AND ITS COLOUR IS ONE OF THEM ══════════════════════
           「終了したら、震度分布を計算ボタンがアクセントカラーでいろつくように。これ含め、条件や震源に
             変更があれば震度分布を変更ボタンが光り、その後は再計算ボタンとして目立たない色に。」
           `fldStale` already knew this — `touch()` sets it from every spinner, every mode switch and
           every rupture capture (#R190), and finishing a drawing goes through the same call. It was
           simply never on the button: the fill was unconditional, so «there is something to compute»
           and «you are looking at the answer» wore the same accent. Now:

               stale, or never run  →  accent fill,   「震度分布を計算」   (the thing to do next)
               fresh                →  plain outline, 「震度分布を再計算」 (available, not urgent)

           ⚠ ONE PREDICATE, READ IN TWO PLACES. The wording and the colour come from the same
           `_needsRun` so they cannot disagree — which is the defect #R206 wrote up for this panel. */
        /* (#R240) the button itself now lives in the panel's pinned footer — see `_flowFoot()`. What
           stays in this card is the progress bar it drives and the transport, which are readouts. */
        /* ══ ⚠ (#R244) ONE PROGRESS READOUT, AND IT IS THE ONE UNDER THE BUTTON ════════════════════
           「計算進捗ボタンが二つあるから下部のものだけにしろ。」 #R243 added a SECOND `.sq-prog` in the
           pinned footer because the one built here, five controls up card 4, is below the fold while
           the button that starts it is pinned — and left both, so a solve moved two identical bars.
           The footer's is the one that answers 「押したものは動いているか」, so it is the one that
           stays; this one is deleted rather than hidden. `_setProg()` already writes to every
           `.sq-prog` it finds, so it needs no edit and there is still exactly one progress STATE. */
        /* ══ ⚠⚠ (#R242) THE TRANSPORT IS A PLAYER, NOT FOUR CONTROLS IN A ROW ═══════════════════════
           「時刻バーとか再生機構はもっとわかりやすい洗練されたiOS風のUIにしろ。」
           It was a 36 px ▶, a bare `input[type=range]`, a `<select>` reading ×1 and a right-aligned
           number — four widgets of four different kinds, none of which said what the number under
           them meant. Now it reads like the transport in Music: one round accent play/pause, a full
           width scrubber with a filled elapsed track and a real knob, the elapsed time under its
           LEFT end and the total under its right, and the rate as a segmented pill whose选択 is a
           chip rather than a dropdown. ⚠ SAME classes, same events, same `MAXT`/`SPEEDS`/`fmtT` —
           `.sq-t` is still the range the playback loop writes to, `.sq-spd` is still what the speed
           handler reads. This is a re-dress of the same mechanism, not a second one. */
        /* ══ ⚠⚠ (#R243) 「再生ボタンはもっとわかりやすい洗練されたiOS風のUIにしろ。」 ═══════════════
           #R242 turned four widgets into a transport and the report came back, so the thing that was
           unclear was not the ARRANGEMENT — it was that a 40 px circle beside a slider does not say
           WHAT it plays. The transport now reads top-down like the one in Podcasts: a line naming
           what is about to happen, the scrubber with its two times, and a CENTRED control cluster
           whose middle element is a 58 px accent disc with a ring, flanked by 「頭出し」 and 「最後へ」.
           ⚠ `.sq-play`, `.sq-t`, `.sq-spd` and `.sq-tv` keep their classes and their handlers; the two
           new buttons write to the SAME `tl` input and fire its `input` event, so they go through the
           one scrub path rather than moving time themselves. */
        /* ══ ⚠⚠⚠ (#R245) NOT A MEDIA PLAYER — 「再生ボタンは音楽プレーヤー風ではなく、もっとシンプルな
              洗練されたUIにしろ。」 ══════════════════════════════════════════════════════════════════
           #R242 built «the transport in Music», #R243 rebuilt it as «the transport in Podcasts», and
           #R244 flattened the disc inside that same arrangement. All three kept the IDIOM the report
           now names: a caption over a scrubber with a time at each end, a CENTRED ⏮ ▶ ⏭ cluster, and
           the rate as media-player chips. That cluster is what «音楽プレーヤー風» is; making the disc
           lighter cannot stop a three-button transport reading as one.
           So the arrangement goes back to what this panel uses for everything else — a labelled row
           in a grouped inset card:
             · ONE line: a 32 px play/pause with no filled disc, the scrubber, and the elapsed time;
             · the caption and the two jumps as small TEXT buttons (a word is not a transport glyph);
             · the rate on `.sq-segwrap`, the segmented control every other row in this panel uses,
               instead of a bespoke chip strip.
           ⚠ EVERY CLASS AND HANDLER IS UNCHANGED — `.sq-play`, `.sq-t`, `.sq-tv`, `.sq-pl-jump`
           (with its `data-to`), `.sq-spdc` and the hidden `.sq-spd` select are all still here and
           still wired by the same block below. This is the same mechanism in the panel's own
           vocabulary, not a second one. */
        +'<div class="sq-player sq-blk">'
          +'<div class="sq-pl-row">'
            +'<button class="sq-play" aria-label="'+L('Play','再生','Abspielen','Воспроизвести','Reproducir')+'" title="'+L('Play','再生','Abspielen','Воспроизвести','Reproducir')+'">'+SVG_PLAY+'</button>'
            +'<input type="range" class="sq-t" min="0" max="'+MAXT+'" step="0.01" value="'+tSec+'" aria-label="'+L('Time since the rupture began','破壊開始からの経過時間','Zeit seit Bruchbeginn','Время от начала разрыва','Tiempo desde el inicio de la ruptura')+'">'
            +'<span class="sq-pl-times"><b class="sq-tv">'+fmtT(tSec)+'</b> / <span class="sq-pl-tot">'+fmtT(MAXT)+'</span></span>'
          +'</div>'
          +'<div class="sq-pl-meta">'
            +'<span class="sq-pl-cap">'+L('Wave propagation','波の伝播','Wellenausbreitung','Распространение волн','Propagación de las ondas')+'</span>'
            +'<span class="sq-pl-jumps">'
              +'<button class="sq-pl-jump sq-pl-start" data-to="0">'+L('Back to the start','先頭に戻す','Zum Anfang','К началу','Al principio')+'</button>'
              +'<button class="sq-pl-jump sq-pl-end" data-to="'+MAXT+'">'+L('Jump to the end','最後へ','Zum Ende','В конец','Al final')+'</button>'
            +'</span>'
          +'</div>'
          +'<div class="sq-pl-spd" role="group" aria-label="'+L('Playback speed','再生速度','Wiedergabegeschwindigkeit','Скорость воспроизведения','Velocidad de reproducción')+'">'
            +'<span class="sq-pl-spdl">'+L('Speed','速度','Tempo','Скорость','Velocidad')+'</span>'
            +'<div class="sq-segwrap sq-pl-chips">'+SPEEDS.map(v=>'<button class="sq-seg sq-spdc'+(v===speed?' on':'')+'" data-spd="'+v+'">×'+v+'</button>').join('')+'</div>'
          +'</div>'
          /* the <select> the handler below reads stays, hidden — one source of truth for the rate */
          +'<select class="sq-spd" style="display:none;">'+SPEEDS.map(v=>'<option value="'+v+'"'+(v===speed?' selected':'')+'>×'+v+'</option>').join('')+'</select>'
        +'</div>'
        +'</div></div>'
        /* CARD 5 — 結果 */
        +'<div><div class="sq-cap">'+L('Result','結果','Ergebnis','Результат','Resultado')+'</div><div class="sq-card">'
        /* ══ (#R234) A LIST, NOT WHICHEVER ONE HAPPENED TO BE BIGGEST ═════════════════════════════
           「🌎 最近の実際の地震を読み込むに、絵文字はいらない。また、地震は一つだけでなく、直近の地震
             一覧から選べるように。」 — the old button fetched the month's summary feed and took
           `sort(mag)[0]`, i.e. exactly one earthquake, chosen by the code. The picker is filled from
           the USGS event query (worldwide, M ≥ 6.0, the last year) and the reader chooses.
           (#R236) …and BOTH pickers are the one control at the top of the panel now — see there.
           `applyReal` is unchanged, so a chosen event is still set up exactly as it was. */
        /* ══ (#R190) 「津波が発生するとされるような地震だった場合、津波シミュレーターも使えるように。」
           Shown only when THIS event meets the tsunamigenic conditions (see tsunamiCase). It hands the
           epicentre, the magnitude and the focal depth to the ONE tsunami model this app has — the
           propagation simulator (js/tsunami.js). ⚠ (#R197) it no longer has an alternative to fall back
           on: js/sims.js's `tsunami` hazard has been removed. The estimated wave height shown on the
           button is from the screening (Abe's tsunami-magnitude relation), not from the model. */
        /* ⚠ (#R244) 「Open the tsunami simulatorにはマークを使うな。」 The glyph in its translucent
           disc — a 🌊 in #R242, redrawn as an SVG in #R243 — is gone. The button keeps everything
           that makes it the one filled element in the card (the ocean gradient, the 52 px target,
           the estimate on its own line) and says what it does in words alone. */
        +(function(){ const t=tsunamiCase(); return t?('<div class="sq-blk"><button class="sq-tsu">'
          +'<span class="sq-tsu-t"><b>'+L('Open the tsunami simulator','津波シミュレーターを開く','Tsunami-Simulator öffnen','Открыть симулятор цунами','Abrir el simulador de tsunami')+'</b>'
          +'<span>'+L('est. wave','推定波高','geschätzt','оценка','estim.')+' ~'+t.waveM+' m</span></span>'
          +'<span class="sq-tsu-go" aria-hidden="true">›</span></button>'
          +'<div style="font-size:'+FS_S+';color:var(--text-main);margin-top:7px;">'+t.why+'</div></div>'):''; })()
        +'<div class="sq-leg sq-blk"></div>'
        +'<div class="sq-out sq-blk" style="line-height:1.6;"></div>'
        +'</div></div>'
        /* CARD 6 — 注意と出典. ⚠ the safety line is OUTSIDE the fold (#R232) and outside the card,
           because a notice inside a container the eye reads as "settings" is a notice that is
           skipped. It is the only sentence here that matters in a real emergency. */
        /* ══ (#R232) THE METHOD AND THE SOURCES FOLD AWAY; THE WARNING DOES NOT ═════════════════════
           「地震シミュレータのポップアップに書かれた説明や出典等はそのまま書くのではなく折りたたんで
             記載する形式に。注意書き等はそのまま残すように。（津波シミュレータも）」
           The paragraph below is ~2,000 characters of model description and citations. It has to be
           there — every number this panel prints is only meaningful with it — but as the last thing
           on a phone screen it pushed the actual result out of view, and nobody reads a wall of
           references before looking at the answer.
           ⚠ THE SAFETY LINE STAYS OUTSIDE THE FOLD, which is the second half of the instruction. A
           notice that can be collapsed is a notice that will be missed, and this one is the only
           sentence in the panel that matters in a real emergency. */
        /* ══ ⚠ (#R244) …AND IT SAYS WHAT THE NUMBER IS NOT ═══════════════════════════════════════════
           「これらのシミュレーションは被害がある/ないを予想するものではありません。いずれにせよ普段から
             必要な備えをしておきましょう。という趣旨も盛り込んで。」 An intensity map invites exactly
           the reading it cannot support — 「うちは VI だから大丈夫」 — so the notice now denies the
           forecast outright and says the one thing that is true either way. */
        /* ══ ⚠ (#R245) THE SAME FOUR THINGS, SAID IN FOUR SHORT SENTENCES ═══════════════════════════
           「…これは文言を整えて。」 #R244 wrote the third clause as 「これらのシミュレーションは被害が
           ある／ないを予想するものではありません。いずれにせよ、…」 — a subject that names the machinery
           rather than the reading it is denying, an ある／ない that has to be parsed, and a filler
           connective. Four flat sentences instead: what this is, what to do in a real emergency, what
           the picture is NOT, and the one thing that is true either way. Nothing is dropped.
           ⚠ THE ENGLISH STRING IS THE KEY the inline tables are stored under (js/locales/ui.*.js), so
           rewording it silently drops fr/ko/zh/zh-Hans back to English unless they are re-keyed in the
           same change — they are (scripts/i18n/r245-a.json). #R235 wrote that warning; this is the
           first round to change the sentence since. */
        +'<div style="font-size:'+FS_S+';color:#ffd23f;line-height:1.5;">⚠ '
        +L('An educational model. In a real emergency, follow the instructions of the official authorities. It does not predict whether damage will occur. Keep your everyday preparations ready.',
           '教育目的のモデルです。実際の災害時は公的機関の指示に従ってください。被害の有無を予測するものではありません。日ごろから備えておきましょう。',
           'Ein Bildungsmodell. Folgen Sie im Ernstfall den Anweisungen der Behörden. Es sagt nicht voraus, ob Schäden entstehen. Treffen Sie im Alltag die nötigen Vorkehrungen.',
           'Учебная модель. В реальной ситуации следуйте указаниям официальных служб. Она не предсказывает, будут ли разрушения. Держите повседневные запасы наготове.',
           'Un modelo educativo. En una emergencia real, siga las indicaciones de las autoridades oficiales. No predice si habrá daños. Mantenga preparado a diario lo necesario.')
        +'</div>'
        +'<div class="sq-card"><details class="sq-meth" style="font-size:'+FS_S+';color:var(--text-main);line-height:1.5;">'
        +'<summary style="cursor:pointer;color:var(--text-main);font-size:'+FS_S+';list-style:revert;">'
        +L('Method & sources','計算方法と出典','Methode & Quellen','Метод и источники','Método y fuentes')+'</summary>'
        +'<div style="padding-top:4px;">'
        +L('Arrivals are ray-traced through the IASP91 Earth model; surface waves use 3.5 / 4.4 km/s group velocity. Ground motion is the stochastic method (Brune source; trilinear geometrical spreading AND path duration after Atkinson & Boore 1995; frequency-dependent crustal Q = Q₀·f^η after Raoof, Herrmann & Malagnini 1999; κ = 0.035 s; and the Cartwright & Longuet-Higgins 1956 peak factor with its bandwidth term). A point source and a drawn rupture are the SAME finite source: a point stands for the rupture its magnitude implies (Wells & Coppersmith 1994, log₁₀ A = −3.49 + 0.91·M — 2,163 km² at M7.5), so the distance is to that footprint combined with the focal depth, and a drawn rupture uses its own outline instead (M₀ = μAD̄) with wavefronts that carry the rupture propagation (Vr = 0.75β). No pseudo-depth is added to either, so the two agree at the same magnitude. The site term varies with the real terrain: Vs30 from topographic slope (Wald & Allen 2007) in quarter-wavelength amplification, measured over the DEM\'s own sample spacing and skipped where that is coarser than 2 km; sea cells are not painted. MMI is converted with the ShakeMap relation of Worden et al. 2012 from PGV taken over the band a strong-motion record delivers it in (4-pole high-pass at 0.1 Hz), and is NOT the JMA shindo scale. The JMA shindo IS its own definition here (気象庁「計測震度の算出方法」): the period-effect, 10 Hz high-cut and 0.5 Hz low-cut filters applied to the acceleration spectrum, then the level exceeded for a total of 0.3 s, I = 2·log₁₀ a₀ + 0.94 — the three components isotropised at V/H = 2/3 rather than simulated separately. The painted field runs to the end of the lowest class of the chosen scale: within 1,500 km it follows the terrain, and beyond that one cell is wider than the landforms inside it, so the field is a function of distance alone and is drawn as such. Past 1,000 km the regional spreading law is extrapolated, the panel says how much of the field that is, and the table still declines to print an intensity there. Educational model: in a real emergency follow the official authorities.',
           '到達時刻は地球モデルIASP91のレイトレーシング、表面波は群速度3.5／4.4 km/sです。地動は確率論的震源モデル（Bruneスペクトル、三折れ幾何減衰と経路継続時間（Atkinson & Boore 1995）、周波数依存の地殻Q = Q₀·f^η（Raoof, Herrmann & Malagnini 1999）、κ=0.035秒、帯域項を含むCartwright & Longuet-Higgins 1956のピークファクター）です。点震源と描画した震源域は同じ有限断層として扱います。点震源はその規模が意味する破壊面（Wells & Coppersmith 1994、log₁₀ A = −3.49 + 0.91·M。M7.5 で 2,163 km²）を代表し、距離はその面までの距離と震源深さを合成したものです。震源域を描いた場合はその輪郭そのもの（M₀=μAD̄）を使い、波面は破壊伝播（Vr=0.75β）を含みます。どちらにも等価深さは加えないため、同じ規模なら両者は一致します。地盤は実地形から：地形勾配によるVs30推定（Wald & Allen 2007）を1/4波長則に入れます。勾配はDEMの実サンプル間隔で測り、2 kmより粗い場合は使いません。海域は塗りません。MMIはShakeMapと同じWorden et al. 2012による換算で、PGVは強震記録が実際に出せる帯域（0.1 Hz・4次ハイパス）で求めています。気象庁震度階級ではありません。震度は換算ではなく気象庁「計測震度の算出方法」そのものです（周期補正・10 Hzハイカット・0.5 Hzローカットを加速度スペクトルに適用し、合計0.3秒間超える加速度a₀から I = 2·log₁₀a₀ + 0.94）。3成分は個別に計算せずV/H=2/3で等方化しています。塗りは選択した階級の最下位クラスが終わる範囲まで描きます。1,500 km以内は地形に従い、それより外側は1セルが地形の変化より広いため、距離だけの関数として描きます。1,000 kmを超える範囲は地域減衰式の外挿であり、その量をパネルに表示し、表には震度を表示しません。教育目的のモデルです。実際の災害時は公的機関の指示に従ってください。',
           'Laufzeiten per Strahlverfolgung durch IASP91; Oberflächenwellen 3,5/4,4 km/s. Bodenbewegung: stochastische Methode (Brune-Quelle; trilineare Abnahme UND Pfaddauer nach Atkinson & Boore 1995; Q = Q₀·f^η (Raoof et al. 1999); κ = 0,035 s; Peakfaktor nach Cartwright & Longuet-Higgins 1956). Punktquelle und gezeichnete Bruchfläche sind DIESELBE endliche Quelle: eine Punktquelle steht für die Bruchfläche, die ihre Magnitude impliziert (Wells & Coppersmith 1994, log₁₀ A = −3,49 + 0,91·M), also gilt die Distanz zu dieser Fläche zusammen mit der Herdtiefe; eine gezeichnete Bruchfläche nutzt ihren eigenen Umriss (M₀=μAD̄), und die Fronten tragen die Bruchausbreitung. Keine Zusatztiefe bei beiden — bei gleicher Magnitude stimmen sie überein. Untergrund aus dem realen Gelände: Vs30 aus der Hangneigung (Wald & Allen 2007). MMI aus PGV nach Worden et al. 2012 (die ShakeMap-Relation), PGV im nutzbaren Band eines Starkbebenschriebs (Hochpass 0,1 Hz) — NICHT die JMA-Skala. Die JMA-Shindo folgt hier ihrer eigenen Definition (気象庁): Periodenfilter, 10-Hz-Hochschnitt, 0,5-Hz-Tiefschnitt, dann der insgesamt 0,3 s überschrittene Pegel, I = 2·log₁₀ a₀ + 0,94. Die Fläche reicht bis zum Ende der untersten Klasse: bis 1.500 km folgt sie dem Gelände, darüber hinaus nur noch der Distanz. Jenseits 1.000 km ist das Abklinggesetz extrapoliert. Nur Bildungsmodell.',
           'Времена — по IASP91; поверхностные волны 3,5/4,4 км/с. Движение грунта — стохастический метод (источник Бруна; геометрическое расхождение И длительность пути по Atkinson & Boore 1995; Q = Q₀·f^η (Raoof et al. 1999); κ = 0,035 с; пик-фактор Cartwright & Longuet-Higgins 1956). Точечный источник и нарисованный очаг — ОДИН И ТОТ ЖЕ конечный источник: точка представляет разрыв, который подразумевает её магнитуда (Wells & Coppersmith 1994, log₁₀ A = −3,49 + 0,91·M), поэтому расстояние берётся до этой площадки вместе с глубиной очага; нарисованный очаг использует собственный контур (M₀=μAD̄), а фронты несут распространение разрыва. Псевдоглубина не добавляется ни в одном случае, поэтому при одной магнитуде результаты совпадают. Грунт — из реального рельефа: Vs30 по уклону (Wald & Allen 2007). MMI — по PGV по Worden et al. 2012 (реляция ShakeMap), PGV берётся в полосе, которую даёт запись сильных движений (ФВЧ 0,1 Гц); это не шкала JMA. Синдо JMA вычисляется по её собственному определению (気象庁): фильтры периода, 10 Гц и 0,5 Гц, затем уровень, превышаемый суммарно 0,3 с, I = 2·log₁₀ a₀ + 0,94. Поле рисуется до конца низшего класса: до 1 500 км — по рельефу, дальше — только по расстоянию. Дальше 1 000 км — экстраполяция. Учебная модель.',
           'Llegadas por IASP91; ondas superficiales a 3,5/4,4 km/s. Movimiento: método estocástico (fuente de Brune; atenuación geométrica Y duración de trayecto según Atkinson & Boore 1995; Q = Q₀·f^η (Raoof et al. 1999); κ = 0,035 s; factor de pico de Cartwright & Longuet-Higgins 1956). Una fuente puntual y una ruptura dibujada son LA MISMA fuente finita: un punto representa la ruptura que implica su magnitud (Wells & Coppersmith 1994, log₁₀ A = −3,49 + 0,91·M), así que la distancia es a esa superficie combinada con la profundidad focal; una ruptura dibujada usa su propio contorno (M₀=μAD̄) y sus frentes llevan la propagación. No se añade profundidad equivalente en ninguno de los dos casos, por lo que con la misma magnitud coinciden. Terreno real: Vs30 por pendiente (Wald & Allen 2007). MMI desde PGV según Worden et al. 2012 (la relación de ShakeMap), con PGV en la banda que entrega un registro de movimiento fuerte (paso alto 0,1 Hz); NO es la escala JMA. El shindo JMA sigue aquí su propia definición (気象庁): filtros de periodo, corte alto de 10 Hz y corte bajo de 0,5 Hz, y el nivel superado durante 0,3 s en total, I = 2·log₁₀ a₀ + 0,94. El campo se pinta hasta el final de la clase más baja: hasta 1.500 km sigue el terreno, más allá sólo la distancia. Más allá de 1.000 km la ley regional está extrapolada. Modelo educativo.')
        /* ⚠ (#R235) THE FRONTS CHANGED, SO THE DISCLAIMER HAS TO SAY SO — and it is a SEPARATE
           sentence rather than an edit to the paragraph above. That paragraph is the key its own
           translations are stored under (js/locales/ui.*.js `inline`), so rewording it would silently
           drop nine languages back to English; appending is the only change that keeps them. */
        +' '+L('The wavefronts are the outer envelope of the fronts from every sampled point of the rupture — solved on the sphere, so a hand-drawn outline keeps its concavity instead of being replaced by its convex hull — and each sampled point uses the travel-time curve for its OWN depth on the dipping plane. Surface-wave group velocity is integrated along each great-circle path rather than held constant, so an oceanic path runs ahead of a continental one; the 3.5 / 4.4 km/s figures are the continental reference and the ratio is in the advanced settings.',
           '波面は震源域の各標本点から広がる波の外側の包絡線で、球面上で解いているため手描きの凹んだ形もそのまま保たれます（凸包に置き換わりません）。各標本点は傾斜した断層面上の自分自身の深さに対応する走時曲線を使います。表面波の群速度は大円経路に沿って積分しており一定ではないため、海洋地殻を通る経路は大陸地殻より先行します。3.5 / 4.4 km/s は大陸の基準値で、比率は詳細設定にあります。',
           'Die Wellenfronten sind die äußere Einhüllende der Fronten aller abgetasteten Punkte des Bruchs — auf der Kugel gelöst, sodass ein von Hand gezeichneter Umriss seine Konkavität behält statt durch seine konvexe Hülle ersetzt zu werden — und jeder Punkt nutzt die Laufzeitkurve seiner EIGENEN Tiefe auf der einfallenden Fläche. Die Gruppengeschwindigkeit der Oberflächenwellen wird entlang jedes Großkreises integriert statt konstant gehalten, sodass ein ozeanischer Pfad einem kontinentalen vorauseilt; 3,5 / 4,4 km/s sind der kontinentale Bezugswert, das Verhältnis steht in den erweiterten Einstellungen.',
           'Фронты волн — внешняя огибающая фронтов от всех выбранных точек очага, решённая на сфере, поэтому нарисованный от руки контур сохраняет вогнутость и не заменяется выпуклой оболочкой; каждая точка использует годограф для СВОЕЙ глубины на наклонной плоскости. Групповая скорость поверхностных волн интегрируется вдоль каждого большого круга, а не берётся постоянной, поэтому океанический путь опережает континентальный; 3,5 / 4,4 км/с — континентальный эталон, отношение задаётся в расширенных настройках.',
           'Los frentes de onda son la envolvente exterior de los frentes de cada punto muestreado de la ruptura — resuelta sobre la esfera, de modo que un contorno dibujado a mano conserva su concavidad en lugar de ser sustituido por su envolvente convexa — y cada punto usa la curva de tiempos de su PROPIA profundidad en el plano buzante. La velocidad de grupo de las ondas superficiales se integra a lo largo de cada círculo máximo en vez de mantenerse constante, así que un trayecto oceánico se adelanta a uno continental; 3,5 / 4,4 km/s son la referencia continental y la razón está en los ajustes avanzados.')
        /* ══ ⚠ (#R238) WHAT THE PICTURE IS ACTUALLY SHOWING, SAID OUT LOUD ═══════════════════
           The reader asked three rounds running why the fronts are circles when they had drawn a
           shape. They are circles because the first-arrival isochron of a finite source IS the
           hypocentre's circle whenever the rupture runs slower than the wave (see the proof by
           `drawFronts`), and a model that quietly draws the right thing while the reader believes it
           is drawing the wrong thing is worse than one that explains itself. So the panel says it,
           and says where the shape DOES appear. */
        +' '+L('A wavefront from a finite rupture is still a circle about the hypocenter whenever the rupture runs slower than the wave — the first arrival always comes from the point where the break started — so the shape you drew appears as the RUPTURE FRONT running across it (the filled area and its bright edge), not as a dent in the rings. What does bend the rings is the crust they cross: the body-wave travel time is corrected over its crustal share and the surface-wave group velocity is integrated along each great circle, so an oceanic path runs ahead of a continental one.',
           '破壊が波より遅い限り、有限の震源域からの初動の波面は震央を中心とする円になります（最初に届くのは常に破壊の開始点からの波だからです）。描いた形は、リングの歪みではなく、その中を走る**破壊フロント**（塗りつぶされた領域とその先端の明るい線）として現れます。リングを曲げるのは通過する地殻で、実体波は走時のうち地殻分を補正し、表面波は群速度を大円経路に沿って積分しているため、海洋経路は大陸経路より先行します。',
           'Solange der Bruch langsamer läuft als die Welle, bleibt die Ersteinsatz-Wellenfront eines endlichen Herdes ein Kreis um das Hypozentrum — der erste Einsatz kommt immer vom Startpunkt des Bruchs. Die gezeichnete Form erscheint deshalb als BRUCHFRONT, die darüber läuft (gefüllte Fläche und helle Kante), nicht als Delle in den Ringen. Was die Ringe verbiegt, ist die durchquerte Kruste: die Laufzeit der Raumwellen wird über ihren Krustenanteil korrigiert, die Gruppengeschwindigkeit der Oberflächenwellen entlang jedes Großkreises integriert.',
           'Пока разрыв идёт медленнее волны, фронт первого вступления от конечного очага остаётся окружностью вокруг гипоцентра — первое вступление всегда приходит из точки начала разрыва. Нарисованная форма появляется как ФРОНТ РАЗРЫВА, бегущий по ней, а не как вмятина в кольцах. Кольца искривляет кора: время пробега объёмных волн корректируется на коровую долю, а групповая скорость поверхностных волн интегрируется вдоль большого круга.',
           'Mientras la ruptura avance más despacio que la onda, el frente de primera llegada de una fuente finita sigue siendo un círculo en torno al hipocentro: la primera llegada procede siempre del punto donde empezó la rotura. Por eso la forma que ha dibujado aparece como FRENTE DE RUPTURA recorriéndola (área rellena y borde brillante), no como una hendidura en los anillos. Lo que sí curva los anillos es la corteza que atraviesan: el tiempo de viaje de las ondas de cuerpo se corrige según su tramo cortical y la velocidad de grupo de las superficiales se integra a lo largo de cada círculo máximo.')
        +'</div></details></div></div>'
        +_flowFoot();
      /* ══ (#R236) THE ONE PICKER: the switch chooses the SOURCE, the list chooses the earthquake ═══
         Each half keeps the handler it already had — `applyEvent` for the curated catalogue,
         `applyReal` for a USGS feature — so neither path changed, only where you reach it from. */
      { const ev=panel.querySelector('.sq-ev');
        if(ev) ev.onchange=()=>{ const v=ev.value;
          if(v===''){ clearEvent(); return; }   /* (#R242) 「選択解除して戻す方法がない」 */
          if(evSrc==='recent'){ const i=+v; if(_realFeats[i]) applyReal(_realFeats[i]); }
          else applyEvent(v); }; }   /* (#R232) */
      { const x=panel.querySelector('.sq-ev-x'); if(x) x.onclick=()=>clearEvent(); }   /* (#R242) */
      { const past=panel.querySelector('.sq-src-past'), rec=panel.querySelector('.sq-src-recent');
        if(past) past.onclick=()=>{ if(evSrc==='past') return; evSrc='past'; render(); };
        /* switching to the feed with nothing loaded is what starts the query — the reader should not
           have to find a separate button to make the list they just asked for appear (#R234's list
           button is gone, its body is loadReal()). */
        if(rec) rec.onclick=()=>{ if(evSrc!=='recent'){ evSrc='recent'; render(); }
          if(!_realFeats.length&&!_realBusy) loadReal(); }; }
      /* ══ ⚠⚠⚠ (#R244) EVERY LOOKUP IN THIS BLOCK IS GUARDED, BECAUSE THE PANEL IS CONDITIONAL ═══════
         「過去の地震の震源域などの精度が落ちている。さっきまでちゃんとしてた。」

         MEASURED, and it is not the geometry. #R243 stopped rendering cards ② and ③ when an
         earthquake is LOADED (a published event is not a form), and the three lines below still
         wrote `.onclick` / `.onchange` onto the result of a bare `querySelector` for controls that
         live in those cards — `.sq-fdraw`, `.sq-d`, `.sq-m`, `.sq-sd`. With one loaded, the first of
         them threw `Cannot set properties of null`, which:
           · aborted the REST of the wiring — measured on the shipped build, `.sq-play`, `.sq-t`,
             `.sq-scale`, `.sq-op`, `.sq-spdc` and the two jumps had NO handler at all;
           · and, because `render()` is called from `applyEvent()` BEFORE the published finite-fault
             outline is fetched, threw out of `applyEvent` too — so `fetchRuptureRing()` was never
             called and the map kept the offline RECTANGLE instead of the published outline. Measured:
             zero requests to earthquake.usgs.gov after picking an event, and the drawn ring starting
             at the rectangle's own corner (143.526, 40.361) for Tōhoku.
         That is 「震源域の精度が落ちている」 exactly, and 「など」 is the dead transport.

         ⚠ This is [[intmap-recurring-lessons]] I for the second time — #R236 wrote it up for
         `querySelector('.sq-real').onclick` — so the fix is not "guard these three", it is that NO
         lookup here may assume its control was rendered. A panel that draws different cards in
         different states cannot have a wiring block that assumes one of them. */
      { const c=panel.querySelector('.sq-close'); if(c) c.onclick=()=>close(); }
      { const mb=panel.querySelector('.sq-min'); if(mb) mb.onclick=()=>{ minimised=!minimised; render(); }; }   /* (#R210) */
      { const a=panel.querySelector('.sq-cm-epi'), b=panel.querySelector('.sq-cm-sta');
        /* one press: this is what a map click means AND arm the pick (#R212 — see the note above).
           ⚠ (#R218) …and a SECOND press on the lit one turns it off. 「どちらも、もう一度クリックしたら
           選択解除されるように。」 A segmented control with no off state means the map is permanently
           armed: every click anywhere moves the epicentre or adds a row, and there is no way to just
           look at the map with the panel open (the panel's own click-claim then eats place labels
           too — see onClick). `clickMode` now has a third value, `'none'`, and both buttons toggle. */
        if(a) a.onclick=()=>{ if(clickMode==='epi') setClickMode('none'); else { setClickMode('epi'); startPick(); } };
        if(b) b.onclick=()=>setClickMode(clickMode==='station'?'none':'station'); }
      { const fd=panel.querySelector('.sq-fdraw'); if(fd) fd.onclick=()=>{ toggleFaultDraw(); }; }
      const fc=panel.querySelector('.sq-fclear'); if(fc) fc.onclick=()=>{ faultClear(); render(); refresh(); };
      /* ══ (#R224) THE ADVANCED GEOMETRY — every field is an OVERRIDE, and blank means "back to auto"
         An empty box is not "zero", it is "you decide", which is the only way one control can express
         both halves of 「通常は自動推定だけ…詳細設定では手動上書き」 without a second checkbox per row.
         Each change re-enters faultSolve() with the pinned value, so Mw · M₀ · 断層面積 · 平均すべり量
         are recomputed from the SAME chain rather than patched. */
      panel.querySelectorAll('.sq-fadv').forEach(inp=>{ inp.onchange=e=>{
        const k=e.target.dataset.k, raw=String(e.target.value||'').trim();
        if(raw==='') delete faultOver[k]; else faultOver[k]=+raw;
        /* a top and a bottom together state the width; typing a width releases them, and vice versa,
           so the three can never be pinned into a contradiction */
        if(k==='widthKm'&&raw!=='') delete faultOver.zBotKm;
        if(k==='zBotKm'&&raw!=='') delete faultOver.widthKm;
        if(faultResolve()){ render(); refresh(); } touch(); }; });
      { const b=panel.querySelector('.sq-fauto'); if(b) b.onclick=()=>{ faultOver={};
          if(faultResolve()){ render(); refresh(); } touch(); }; }
      /* the panel re-renders on every solve, so the disclosure has to remember it was open — or
         typing one number would close the box the number was typed into */
      { const d=panel.querySelector('.sq-adv-box'); if(d) d.addEventListener('toggle',()=>{ _advOpen=d.open; }); }   /* (#R242) one fold */
      /* (#R234) …and the same for the model-assumption box, or opening it and touching a spinner
         (which re-renders) would close it under the reader's hand. */
      
      { const d=panel.querySelector('.sq-d'); if(d) d.onchange=e=>{ depthKm=Math.max(0,Math.min(700,+e.target.value||10)); render(); touch(); }; }
      { const m=panel.querySelector('.sq-m'); if(m) m.onchange=e=>{ if(!fault){ mw=Math.max(3,Math.min(9.6,+e.target.value||7)); render(); touch(); } }; }
      { const sd=panel.querySelector('.sq-sd'); if(sd) sd.onchange=e=>{ stressDropMPa=Math.max(0.3,Math.min(30,+e.target.value||3)); touch(); }; }
      const q0=panel.querySelector('.sq-q0'); if(q0) q0.onchange=e=>{ QS0=Math.max(30,Math.min(2000,+e.target.value||180)); touch(); };
      const qe=panel.querySelector('.sq-qe'); if(qe) qe.onchange=e=>{ QETA=Math.max(0,Math.min(1,+e.target.value)); touch(); };
      /* (#R235) …and this one invalidates the PATH TABLE rather than the intensity field: the fronts
         read it every frame, the ground-motion chain never does — so `touch()` would be a lie. */
      const og=panel.querySelector('.sq-og'); if(og) og.onchange=e=>{ OCEAN_G=Math.max(1,Math.min(1.3,+e.target.value||1.08)); _pTab=null; _pKey=''; drawFronts(); };
      const op=panel.querySelector('.sq-op');
      if(op) op.oninput=e=>{ const v=setFieldOpacity((+e.target.value||85)/100);
        const b=panel.querySelector('.sq-opv'); if(b) b.textContent=Math.round(v*100)+'%'; };
      const run=panel.querySelector('.sq-run'); if(run) run.onclick=()=>{ if(!epi){ report(); return; } buildField(); };
      /* (#R240) the footer's own verb while there is nothing to compute yet — it arms the SAME mode
         step ② arms, so there is one place that decides what a map tap means. */
      { const ge=panel.querySelector('.sq-go-epi'); if(ge) ge.onclick=()=>{ setClickMode('epi'); }; }
      const tsu=panel.querySelector('.sq-tsu'); if(tsu) tsu.onclick=()=>openTsunami();
      const sc=panel.querySelector('.sq-scale'); if(sc){ sc.onchange=e=>{ pickScale(e.target.value==='jma'?'jma':'mmi'); legend(); touch(); }; }
      const sel=panel.querySelector('.sq-site'); if(sel){ sel.value=siteId; sel.onchange=e=>{ siteId=e.target.value; touch(); }; }
      const tl=panel.querySelector('.sq-t'); if(tl) tl.oninput=()=>{ tSec=+tl.value; const tv=panel.querySelector('.sq-tv'); if(tv) tv.textContent=fmtT(tSec); drawFronts(); };
      const sp=panel.querySelector('.sq-spd'); if(sp){ sp.onchange=e=>{ speed=Math.max(1,+e.target.value||1); }; }
      /* (#R242) the segmented rate writes to that same <select> and fires its change — the chips are
         a skin over the control, never a second place the speed is stored. */
      panel.querySelectorAll('.sq-spdc').forEach(b=>{ b.onclick=()=>{ const v=+b.getAttribute('data-spd')||1;
        panel.querySelectorAll('.sq-spdc').forEach(o=>o.classList.toggle('on',o===b));
        if(sp){ sp.value=String(v); sp.dispatchEvent(new Event('change',{bubbles:true})); } else speed=v; }; });
      /* (#R189) REAL time by default: the front advances by wall-clock seconds × the chosen rate.
         The old loop hard-coded 10 s of simulation every 90 ms ≈ 111× and nothing on screen said so. */
      /* ══ ⚠ (#R235) 「動作は離散的ではなくスムーズにして」 ═══════════════════════════════════════
         The playback was `setInterval(…, 90)` — 11 steps a second on a 60 Hz display, so the fronts
         JUMPED five frames at a time. And the slider was written back as `Math.round(tSec)`, which
         quantised the model's own clock to whole seconds: at 1× the ring moved 3.5 km, stopped for
         most of a second, then moved 3.5 km again. Both are gone:
           · the tick is the animation frame, through the ONE frame loop (#R234 js/runtime.js) — so
             this shares the map's rAF instead of opening a competing timer, and it is skipped while
             the tab is hidden rather than accumulating;
           · `tSec` keeps its fractional part. The slider is a `step` of 0.01 now (see the markup),
             so writing the real value no longer snaps it.
         ⚠ The advance is still WALL-CLOCK × speed, so the playback rate is unchanged — this is the
         same motion sampled at the display's rate instead of at 11 Hz. */
      const RT=()=>window.IntMapRuntime;
      const _stop=()=>{ playing=0; try{ const R=RT(); R&&R.frame&&R.frame('seismic:play',()=>{}); }catch(_){} };
      const pb=panel.querySelector('.sq-play'); const _pbIcon=(on)=>{ try{ pb.innerHTML=on?SVG_PAUSE:SVG_PLAY; pb.classList.toggle('on',!!on); }catch(_){} };
      if(pb&&tl) pb.onclick=()=>{ if(playing){ _stop(); _pbIcon(0); }
        else { _pbIcon(1); let last=performance.now(); playing=1;
          const step=()=>{ if(!playing||!opened) return;
            const now=performance.now();
            tSec=(tSec+(now-last)/1000*speed)%MAXT; last=now;
            tl.value=tSec; { const tv=panel.querySelector('.sq-tv'); if(tv) tv.textContent=fmtT(tSec); } drawFronts();
            const R=RT(); if(R&&R.frame) R.frame('seismic:play',step); else { playing=0; _pbIcon(0); } };
          const R=RT(); if(R&&R.frame) R.frame('seismic:play',step); else { playing=0; _pbIcon(0); } } };
      /* (#R243) the two jumps write the SAME range the scrubber does and fire its own event, so the
         one `input` handler below moves time — nothing here touches `tSec` or the fronts directly. */
      panel.querySelectorAll('.sq-pl-jump').forEach(b=>{ b.onclick=()=>{ try{
        if(playing){ _stop(); _pbIcon(0); }
        if(!tl) return;
        tl.value=b.dataset.to; tl.dispatchEvent(new Event('input',{bubbles:true}));
      }catch(_){} }; });
      /* (#R236) `.sq-real` / `.sq-real-sel` are gone — both halves are the one picker at the top of
         the panel now, wired beside `.sq-ev` above. ⚠ The old lines were an unguarded
         `querySelector('.sq-real').onclick`, which on a panel without that button throws inside
         render() and takes the WHOLE panel with it; that is why they are deleted rather than left
         to find nothing. */
      try{ makeDraggable(panel,panel.querySelector('.sq-head')); }catch(_){}
      /* (#R190) whatever this render just decided about the tsunami button IS the shown state —
         recording it here is what stops syncTsunami re-rendering in a loop */
      _tsuShown=!!tsunamiCase();
      warmEpi();
      legend();
      report();
    }
    /* (#R190) the LOS-style progress readout (a real percentage and a bar), driven by buildField */
    /* ⚠ (#R243) EVERY `.sq-prog` IN THE PANEL, not the first one. There are two now — the one in card
       4 and the one under the button in the pinned footer (see `_flowFoot`) — and they are two
       READOUTS of one state, so they are written in one pass and can never disagree. */
    function _setProg(){ if(!panel) return;
      const boxes=panel.querySelectorAll('.sq-prog');
      if(!boxes.length) return;
      const txt=fldBusy?(L('Computing the intensity map','震度分布を計算中','Intensitätskarte wird berechnet','Расчёт поля интенсивности','Calculando el mapa de intensidad')
        +' <b style="color:var(--text-main);">'+fldPct+'%</b>'):'';
      boxes.forEach(box=>{
        if(!fldBusy){ box.style.display='none'; return; }
        box.style.display='block';
        const bar=box.querySelector('.sq-progb'), lbl=box.querySelector('.sq-progl');
        if(bar) bar.style.width=fldPct+'%';
        if(lbl) lbl.innerHTML=txt;
      });
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
    /* ══ ⚠⚠ (#R216) A DRAWN RUPTURE IS AN AREA, AND THE SCREENING WAS ASKING ONE POINT ═══════════
       「津波シミュレータ時は、フリー描画震源域の地震にも対応するようにして。（現在は点の震源にしか
        津波シミュレータは対応していない。）」 — reported again after #R212 wired the ring all the way
       into the solver and #R215 measured that the SOLVER accepts it. Both were true; the gate in
       front of them was not. `tsunamiCase()` asked `_epiSeaDepth()`, i.e. the sea floor at ONE point:
       `epi`. With a drawn rupture that point is whichever spot was clicked first (`faultSet` only
       fills `epi` when it is empty), so a rupture drawn along a trench next to a coastal click was
       screened at the CLICK — on land — and the 🌊 button was never offered. From the reader's side
       that is exactly 「点の震源にしか対応していない」: the drawn source could not reach the simulator
       at all, no matter what the simulator could do with it.

       A tsunami is made by the sea floor moving over the RUPTURE, so the rupture is what is sampled:
       a lattice inside the ring plus its own vertices, each asked of the same DEM. The case is
       offered when a real part of that area is submarine, the depth reported is the mean over the
       submarine part, and the point handed to the model is the centroid OF THE WET PART — so the
       solver's domain is centred on water rather than on a click. ⚠ Unknown is still not offered:
       cells the DEM cannot answer for are counted out, never assumed to be sea. */
    let _rupSea=null;
    function _rupSeaDepth(){
      if(!fault||!fault.ring||fault.ring.length<3) return null;
      const key=fault.ring.length+'/'+fault.areaKm2.toFixed(0)+'/'+fault.centroid[0].toFixed(3)+'/'+fault.centroid[1].toFixed(3);
      if(_rupSea&&_rupSea.key===key) return _rupSea.v;
      let W=Infinity,E=-Infinity,S=Infinity,N=-Infinity;
      fault.ring.forEach(p=>{ if(p[0]<W)W=p[0]; if(p[0]>E)E=p[0]; if(p[1]<S)S=p[1]; if(p[1]>N)N=p[1]; });
      const pts=fault.ring.slice();
      const K=6;
      for(let j=0;j<K;j++) for(let i=0;i<K;i++){
        const lo=W+(i+0.5)*(E-W)/K, la=S+(j+0.5)*(N-S)/K;
        if(faultDistKm(lo,la)===0) pts.push([lo,la]); }
      const zs=[]; if(fld&&fld.z) zs.push(fld.z); [8,7,6,5].forEach(z=>{ if(zs.indexOf(z)<0) zs.push(z); });
      let known=0, wet=0, sum=0, cx=0, cy=0;
      for(const p of pts){
        let e=null;
        for(const z of zs){ try{ e=demElevBilinear(p[0],p[1],z); if(e==null) e=demElevAt(p[0],p[1],null,z); }catch(_){}
          if(e!=null&&isFinite(e)) break; }
        if(e==null||!isFinite(e)) continue;
        known++;
        if(e<0){ wet++; sum+=e; cx+=p[0]; cy+=p[1]; } }
      if(!known) return null;                       /* not known YET — never cached (see _epiSeaDepth) */
      const v={ frac:wet/known, depth:wet?sum/wet:null, pt:wet?[cx/wet,cy/wet]:null, known, wet };
      _rupSea={key,v}; return v; }
    /* where the model should be centred: the wet part of a drawn rupture, else the epicentre */
    function srcPoint(){ const r=_rupSeaDepth(); return (r&&r.pt)?r.pt:epi; }

    function tsunamiCase(){
      if(!epi) return null;
      const M=fault?fault.mw:mw;
      if(!(M>=6.5)||!(depthKm<=100)) return null;
      /* under the sea? the same DEM the intensity field reads. Unknown → not offered (never guessed). */
      const rs=_rupSeaDepth();
      const e0=rs?((rs.frac>=0.25&&rs.depth!=null)?rs.depth:1):_epiSeaDepth();
      if(e0==null||e0>0) return null;
      const waveM=Math.max(1,Math.min(40,Math.round(Math.pow(10,0.5*M-3.3)*10)/10));
      return { waveM, M, why:L('Offshore, M'+M.toFixed(1)+', focal depth '+Math.round(depthKm)+' km, sea floor '+Math.round(-e0)+' m — meets the M≥6.5 / ≤100 km screening used for tsunami advisories.',
        '海域・M'+M.toFixed(1)+'・震源深さ '+Math.round(depthKm)+' km・海底 −'+Math.round(-e0)+' m — 津波注意報等の判定基準（M6.5以上・深さ100 km以下）に該当します。',
        'Offshore, M'+M.toFixed(1)+', Tiefe '+Math.round(depthKm)+' km — erfüllt die Tsunami-Screening-Kriterien (M≥6,5 / ≤100 km).',
        'В море, M'+M.toFixed(1)+', глубина '+Math.round(depthKm)+' км — соответствует критериям оповещения о цунами (M≥6,5 / ≤100 км).',
        'En el mar, M'+M.toFixed(1)+', profundidad '+Math.round(depthKm)+' km — cumple los criterios de alerta de tsunami (M≥6,5 / ≤100 km).') };
    }
    /* ══ (#R192) THE HAND-OFF IS TO THE PROPAGATION MODEL ══════════════════════════════════════════
       「津波が発生するとされるような地震だった場合、波の伝播のわかるアニメーション津波シミュレーターも
         使えるように。」 #R190 wired this button to js/sims.js, which floods a 26 km box around the
       epicentre up to a chosen wave height — an INUNDATION model, and one that says nothing about
       propagation. It is still the right tool for the last kilometre and it is still reachable (the
       propagation panel opens it at the coast the wave actually hits hardest), but the button asked
       for here is the one that shows the wave crossing the ocean. */
    /* ⚠ (#R197) THERE IS EXACTLY ONE TSUNAMI MODEL, AND THIS BUTTON OPENS IT OR NOTHING.
       「勝手に災害シミュレータ内の津波シミュレータを起動するな。」 #R192 left a fallback here: if the
       propagation module was absent, this opened js/sims.js's disaster panel on its `tsunami` hazard —
       a 26 km bathtub — under the same button and with no way to tell which one you got. That hazard no
       longer exists (js/sims.js), and this no longer looks for a second model to run instead. */
    function openTsunami(){ const t=tsunamiCase(); if(!t||!epi) return false;
      const T=window.IntMapTsunami; if(!T||!T.open) return false;
      const P=srcPoint()||epi;   /* (#R216) centre the domain on the submarine part of the rupture */
      try{ T.open({ lng:P[0], lat:P[1], mw:(fault?fault.mw:mw), depth:depthKm,
        rupture: fault?{ ring:fault.ring, areaKm2:fault.areaKm2, areaProjKm2:fault.areaProjKm2,
          slipM:+fault.slipM.toFixed(2), mw:fault.mw, dipDeg:fault.dipDeg, widthKm:fault.widthKm,
          zTopKm:fault.zTopKm, strikeDeg:fault.strikeDeg }:null }); }catch(_){ return false; }
      return true; }
    /* (#R189) the painted field's own legend — the class colours of the ACTIVE scale */
    /* ══ ⚠ (#R242) THE LEGEND IS THE NUMBER, PAINTED ══════════════════════════════════════════════
       「震度の凡例は、🟥 X のようにするのではなく、数字の背景をその色で塗るという形に。」
       A swatch beside a numeral makes the reader match two things; the map paints a colour and the
       table prints a class, and the legend is the one place both are said at once. So the CLASS
       ITSELF wears its colour — the same chip the table's intensity column already uses — and the
       text colour is chosen from the fill's luminance so IX on dark red and IV on pale cyan are both
       legible. */
    function legend(){ const el=panel&&panel.querySelector('.sq-leg'); if(!el) return;
      const cls=(scale==='jma')?JMA_CLASSES:MMI_CLASSES;
      el.innerHTML=cls.map(k=>'<span class="sq-lgc" style="background:'+k.col+';color:'+_onCol(k.col)+';">'+((scale==='jma')?jmaLabel(k.id):k.id)+'</span>').join('');
    }
    /* black or white, whichever the fill can carry (sRGB relative luminance, the WCAG split point) */
    function _onCol(hex){
      try{
        const h=String(hex||'').replace('#',''); if(h.length<6) return '#fff';
        const f=(i)=>{ const c=parseInt(h.slice(i,i+2),16)/255; return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4); };
        return (0.2126*f(0)+0.7152*f(2)+0.0722*f(4))>0.42 ? '#101014' : '#ffffff';
      }catch(_){ return '#ffffff'; }
    }
    /* (#R189) the rupture draw flow: press once → the shared free-draw tool is live; press again →
       its loop becomes the rupture (area → M₀ → Mw). The tool is the SAME free-draw every other
       feature uses (#R141's currentGeometry), not a private reimplementation. */
    let _fDrawing=false;
    /* the outer ring of whatever DrawTool.currentGeometry() shape came back, or null */
    function _ringOf(g){
      try{
        if(g&&g.type==='Polygon'&&g.coordinates&&g.coordinates[0]&&g.coordinates[0].length>=4) return g.coordinates[0].slice(0,-1);
        if(g&&g.type==='MultiPolygon'&&g.coordinates&&g.coordinates[0]&&g.coordinates[0][0]&&g.coordinates[0][0].length>=4) return g.coordinates[0][0].slice(0,-1);
      }catch(_){}
      return null;
    }
    /* ══ (#R207) THE LOOP BECOMES THE RUPTURE THE MOMENT IT CLOSES ═════════════════════════════════
       「描いた範囲を取り込むボタンを押さなくてもいいようにしろ。」 #R189's flow was press → draw →
       press again, and the second press did nothing the tool could not report by itself: DrawTool now
       calls back when a stroke ends (js/map-tools.js `finish`), so the area, the moment M₀ and the Mw
       land as soon as the finger lifts.
       The button stays, and stops being a step: while drawing it says "finish drawing", which is what
       it now does — a way OUT of the mode, not the way to get the answer. */
    /* ══ (#R212) THE STROKE DEFINES THE RUPTURE; THE ▶ BUTTON RUNS THE SOLVE ═══════════════════════
       「フリー描画した際は、終わった時点ではそのままで、ボタンを押したら解析開始する形式に。」 #R207 was
       right that the CAPTURE needs no second press — the area, M₀ and Mw are arithmetic over the ring
       and appear the moment the finger lifts. What it also did was start the intensity field, which
       is the minute-long part, while the user was still drawing. So the capture stays immediate and
       the SOLVE goes back behind the button that already exists for it: `touch()` marks the field
       stale exactly the way the magnitude and depth spinners do (#R190), and ▶「震度分布を計算」 is
       the one place a run starts. One button, and it is the same one for every input. */
    function _fCapture(g,{keepDrawing}={}){
      const ring=_ringOf(g);
      if(ring&&faultSet(ring)){ render(); touch(); return true; }
      return false;
    }
    function toggleFaultDraw(){
      const DT=window.DrawTool;
      if(!DT||!DT.start||!DT.currentGeometry){ return; }
      /* (#R190) 「フリー描画中にdrawポップアップは表示しないように。」 — the tool's own measurement
         panel is not part of drawing a rupture; it covered this one. See DrawTool.start's `silent`. */
      if(!_fDrawing){ _fDrawing=true;
        const opt={ silent:true, onFinish:(g)=>{ _fCapture(g,{keepDrawing:true}); } };
        try{ DT.start(null,opt); }catch(_){ try{ DT.start(); }catch(__){} } render(); return; }
      _fDrawing=false;
      /* the manual path is still here for a stroke the tool has not seen end (and for Atlas) */
      let g=null; try{ g=DT.currentGeometry(); }catch(_){}
      const had=!!fault;
      const ok=_fCapture(g);
      try{ DT.exit&&DT.exit(); }catch(_){}
      if(ok||had){ render(); touch(); }   /* (#R212) the ▶ button runs it — see _fCapture */
      else { render(); const o=panel&&panel.querySelector('.sq-out');
        if(o) o.insertAdjacentHTML('afterbegin','<div style="color:#ff9f0a;margin-bottom:4px;">'+L('No closed area was drawn — draw a loop on the map.','閉じた範囲が描かれていません。地図上にループを描いてください。','Keine geschlossene Fläche — zeichnen Sie eine Schleife auf der Karte.','Замкнутая область не нарисована — нарисуйте контур на карте.','No se dibujó un área cerrada — dibuje un lazo en el mapa.')+'</div>'); }
    }
    function report(){ const o=panel&&panel.querySelector('.sq-out'); if(!o) return;
      _setProg();
      if(!epi){ o.innerHTML=L('Place an epicenter to begin.','震源地を設置してください。','Epizentrum setzen.','Укажите эпицентр.','Coloque un epicentro.'); return; }
      /* ⚠ (#R235) DE/RU/ES said 「—」 here — an em-dash is not a translation of "not felt", it is the
         absence of one, and it collided with the 「—」 this table already prints for a missing number
         (see fmtT). Part of the DE/RU/ES sweep this round. */
      const notFelt=L('not felt','無感','nicht spürbar','не ощущается','no sentido');
      /* ⚠ (#R235) …and this is a DIFFERENT statement, which is the whole bug below: past the
         calibrated range the model declines to answer. "No answer" is not "no shaking". */
      const noAnswer=L('out of range','範囲外','außerhalb','вне диапазона','fuera de rango');
      const jp=scale==='jma';
      /* ══ (#R234) THE INTENSITY IS THE ANSWER, SO IT IS THE BIGGEST THING IN THE ROW ═══════════════
         「各地の表は、震度を大きめに表示し、かつそれぞれの震度色背景と白文字に。MMIならMMI X、
           気象庁震度ならJMA 6+のように記載すること。」
         The scale is NAMED in every cell rather than only in the column head, because MMI IX and
         JMA 6+ are different statements and a numeral alone does not say which one is being made.
         ⚠ AND WHITE HAS TO BE READABLE ON IT. Three of the JMA swatches are nearly white by design
         (震度1 is #F2F2FF, 4 is #FAE696, 5- is #FFE600) — white on those is a blank chip, which is
         not 「白文字」, it is no text. `_onDark` keeps the class's own hue and darkens it only until
         white clears a 3:1 contrast ratio, so the colour still identifies the class and the label is
         still legible. The map's own paint is untouched; this is the table's chip. */
      /* ══ ⚠⚠ (#R235) 「どう考えても揺れているにもかかわらず無感とかかれた都市が混じっている」 ═════════
         THE CELL WAS TESTING `calibrated`, AND `calibrated` GOES FALSE THREE WAYS:
           1. `pgv < PGV_FELT`  — the ground is not moving.        ← the ONLY one that means 無感
           2. `!inRange`        — past 1,000 km the regional spreading law is extrapolated and the
                                  model declines to print a number. That is "no answer", not "no
                                  shaking", and it was being reported as the latter.
           3. `mmi > 9.5`       — the GMICE runs out at the TOP. ⚠⚠ THIS IS THE REPORTED DEFECT: the
                                  worst-hit city in the table — the one at Rrup 0 of an M9 — printed
                                  「無感」. `obsCut()` twelve lines down already documents this exact
                                  trap ("cutting on it threw away the worst-hit city… Sendai, at
                                  Rrup 0, was the one place excluded") and works around it; the cell
                                  never got the same fix, so the row now survives the cut and then
                                  says the opposite of what the map beside it is painting.
         ⚠ AND (3) IS NOT EVEN A JMA STATEMENT. 震度 comes off the JMA level `a0` through the scale's
         own definition (#R192) — the MMI conversion's ceiling has no authority over it at all, yet a
         JMA-scale table was being blanked by it. Each scale is now bounded by its own top class. */
      /* ⚠ (#R241) SPLIT IN TWO: what the cell SAYS, and how wide the box is. The width is the widest
         label THIS table prints (see `_chipW`), which cannot be known while the first row is being
         built — so every row's answer is resolved first, the set of labels is handed to `_chipW`
         once, and only then is the HTML written. */
      const iTxt=(a)=>{
        if(!(a.pgv>=PGV_FELT)) return null;
        if(!a.inRange) return null;
        let txt,col;
        if(jp){ const c=jmaClass(a.jma); if(!c) return null; txt='JMA '+c.id; col=c.col; }
        else { txt='MMI '+ROMAN[Math.max(1,Math.min(12,Math.round(a.mmi)))]; col=_mmiHex(a.mmi); }
        return { txt, col };
      };
      const iCell=(a,cw)=>{ const plain=(t)=>'<span style="color:var(--text-main);font-weight:400;">'+t+'</span>';
        if(!(a.pgv>=PGV_FELT)) return plain(notFelt);
        if(!a.inRange) return plain(noAnswer);
        const k=iTxt(a); if(!k) return plain(notFelt);
        const txt=k.txt, col=k.col;
        /* 「四角背景で、太字禁止」 — square corners (was border-radius:6px) and weight 400 (was 800).
           Background is the class colour itself; only the ink moves (see _chipInk). */
        /* ══ ⚠ (#R237) EVERY CHIP IS THE SAME BOX, WHATEVER IS WRITTEN IN IT ═══════════════════════
           「各地の表内のJMA 7やMMI IVなどの背景の四角は、震度階級ごとに大きさをそろえるように。」
           The box was `padding:3px 9px` around the TEXT, so its width was the width of the numeral:
           「MMI VIII」 is eight characters and 「MMI IV」 is six, so a column of chips came out ragged
           and the eye read the RUN OF THE EDGE as if it meant something — a wider box for a stronger
           shake — which is not what any of the labels say. A fixed box makes the colour the only
           variable, which is the one that carries the class.
           ⚠⚠ (#R238) …AND THE WIDTH IS NOW MEASURED AT RUN TIME RATHER THAN WRITTEN DOWN. #R237 read
           the six labels back in this browser, at this font, and wrote 62 into the sheet. That is a
           measurement of ONE environment: the face actually used depends on which of the stack's
           fonts resolved, `FS_H` follows the app's own label scale, and a browser at 110 % text zoom
           makes every one of those numbers wrong at once — at which point the widest label overflows
           its `min-width` and the column is ragged again, which is the report, sent twice.
           `_chipW()` renders every label EITHER SCALE CAN PRINT into a detached span carrying this
           chip's exact font declarations, takes the widest, and caches it against the font and size
           it measured for. So the boxes are equal by construction rather than by a constant that was
           true once, a new scale needs no edit here, and tests/r238 checks the RELATION (all chips
           one width) instead of the number. */
        return '<span style="display:inline-block;box-sizing:border-box;width:'+cw+'px;padding:3px 4px;'
          +'text-align:center;border-radius:0;background:'+col
          +';color:'+_chipInk(col)+';font-size:'+FS_H+';font-weight:400;line-height:1.35;white-space:nowrap;">'+txt+'</span>'; };
      const seats=nearby().map(c=>({c,a:at(c.lng,c.lat)})).filter(x=>!!x.a);
      const CW=_chipW(jp, seats.map(x=>iTxt(x.a)).filter(Boolean).map(k=>k.txt));
      const rows=seats.map(({c,a})=>{
        /* (#R210) a user-placed point carries the same numeral its marker does; the nearest
           well-known cities the table adds for context are not numbered because they are not
           placed and there is nothing on the map to match them to. */
        const badge=c.n?('<span style="display:inline-block;min-width:15px;height:15px;line-height:15px;text-align:center;border-radius:50%;background:var(--text-main);color:var(--bg-color);font-size:'+FS_S+';font-weight:700;margin-right:5px;">'+c.n+'</span>'):'';
        return '<tr><td class="sq-st-nm" title="'+HOST.escapeHtml(String(c.name||''))+'">'+badge+c.name+'</td>'
          +'<td style="padding:1px 3px;text-align:right;white-space:nowrap;">'+Math.round(a.km).toLocaleString()+'</td>'   /* (#R242) the unit is in the header — six characters of every row back for the place name */
          +'<td style="padding:1px 3px;text-align:right;white-space:nowrap;color:#ff6b6b;">'+fmtT(a.tP)+'</td>'
          +'<td style="padding:1px 3px;text-align:right;white-space:nowrap;color:#ffb020;">'+fmtT(a.tS)+'</td>'
          +'<td style="padding:1px 3px;text-align:right;white-space:nowrap;">'+fmtT(a.durS)+'</td>'
          +'<td style="padding:1px 3px;text-align:right;white-space:nowrap;">'+(a.pgv>=0.05?a.pgv.toFixed(1):'—')+'</td>'
          +'<td style="padding:3px 0 3px 4px;text-align:right;">'+iCell(a,CW)+'</td></tr>'; }).join('');
      /* ══ ⚠⚠ (#R243) THE RESULT CARD OPENS WITH THE ANSWER, NOT WITH THE MODEL'S DIARY ═════════
         「地震シミュレータの「M7.0 · 深さ 10 km · M0 3.98e+19 N·m · fc 0.072 Hz · 破壊半径 18.0 km
           震度分布：実DEMの地形勾配からVs30推定（Wald & Allen 2007） · z8 (555 m → 勾配基線 900 m) ·
           1,595,318/6,553,600 セル · 到達範囲 1,661 km … · 5059 ms」これはいらない。」
         Two lines, both removed: the source restated (M, depth, M0, fc, rupture size — every one of
         which is a control the reader set, or the fault readout in card 2) and the SOLVER'S OWN
         TELEMETRY (tile zoom, cell counts, slope baseline, extrapolated cells, milliseconds). The
         card is for what the earthquake DOES; the method belongs in 「Method & sources」 below it,
         which is where it already is.
         ⚠ WHAT STAYS is what the reader has to ACT on or would otherwise MISREAD, and there are two:
         the 「設定を変更しました。▶ を押すと…」 instruction, and the two ⚠ lines that say the painted
         field is NOT what it looks like — 「標高タイルが届かず一様地盤」 and 「この範囲では地形が粗く
         一様地盤」. Those are the #R190/#R221 contract (tests/r189-checks: 「an unusable site term is
         declared, not hidden」): without them a distance-only ring pattern is indistinguishable from a
         terrain solution, which is the one way this panel can lie. They appear only in the failure
         cases; the normal case — the line the instruction quotes — now says nothing at all. */
      const _siteWarn=(fld&&fld.stats&&!fld.stats.terrain&&!(fld.stats.bulkSite>0))
        ? ('<div style="color:#ffd23f;">⚠ '+(fld.stats.slopeUsable
            ? L('Elevation tiles did not arrive — uniform site class, so the field is distance alone','標高タイルが届かず一様地盤で計算（距離だけの分布になります）','Höhenkacheln kamen nicht an — einheitlicher Untergrund','Тайлы рельефа не пришли — однородный грунт','No llegaron los mosaicos de elevación — terreno uniforme')
            : L('Terrain too coarse here — uniform site class used','この範囲では地形が粗く一様地盤で表示','Gelände zu grob — einheitlicher Untergrund','Рельеф слишком грубый — однородный грунт','Terreno demasiado grueso — terreno uniforme'))+'</div>')
        : '';
      o.innerHTML=(fldBusy?''
          :(fldStale?('<div style="color:#ffd23f;">'+L('The parameters changed — press ▶ to recompute the intensity map.','設定を変更しました。▶ を押すと震度分布を再計算します。','Parameter geändert — ▶ drücken, um neu zu rechnen.','Параметры изменены — нажмите ▶ для пересчёта.','Los parámetros cambiaron — pulse ▶ para recalcular.')+'</div>')
          :_siteWarn))
        /* (#R234) one size for the table, and the head is not grey — see the note by FS / ROW. */
        /* ══ ⚠⚠⚠ (#R241) THE TABLE GETS ITS OWN HORIZONTAL SCROLLER ═══════════════════════════════════
           「地震シミュレータの地点表が左右方向にスクロールできなくなっている。」

           MEASURED, panel at 260 px: the table wants 316 px, `.sq-out` offers 224, and the whole
           intensity column (right edge at x=346 against a card edge at x=255) is BEYOND THE CARD AND
           UNREACHABLE. Nothing scrolls: `.sq-card{overflow:hidden}` (#R237, and it is what gives the
           grouped-inset list its rounded corners) clips the row before the panel's own body ever
           sees the overflow, so `.sq-body`'s `overflow-y:auto` — which computes `overflow-x:auto` —
           has nothing to scroll. Before #R237 there was no card and the body took the overflow, which
           is the horizontal scroll the report says has gone.
           ⚠ THE SCROLLER GOES ROUND THE TABLE, NOT ON THE CARD. Making the card scroll would put a
           rail under every block in it and let the head of the panel slide out of its own border.
           ⚠ AND THE TABLE KEEPS `width:100%`, NOT `max-content`. Auto table layout takes the larger
           of the two: it spreads to the full width when the columns fit (no rail, nothing to reach)
           and grows past it when they do not, which is the frame the scroller is for. `max-content`
           was measured first and is wrong in the other direction — it parks the table at its natural
           width and leaves a gap inside a panel wider than the data.
           ⚠ EVERY NUMERIC CELL IS `white-space:nowrap`, which is what gives the table a real minimum
           to overflow WITH. Without it a squeezed column wraps 「13m 59s」 onto two lines instead,
           i.e. the overflow is hidden by breaking the reading rather than by scrolling it. */
        /* ══ ⚠⚠⚠ (#R242) THE TABLE FITS. A SCROLLER IS THE FALLBACK, NOT THE ANSWER ═══════════════════
           「過去の地震から選択した場合、各地の表が横スクロールできない。」 — reported again after
           #R241 gave this box `overflow-x:auto`. MEASURED on the shipped build (panel 362 px): the
           scroller works (clientWidth 312, scrollWidth 356) — and that is not what was asked for. A
           reader looking at a table whose last column is sliced in half does not want to learn a
           gesture; they want to see the column. Seven columns in 312 px is 44 px too many, so the
           table is made to FIT: the place name is the only elastic column (it truncates with an
           ellipsis and keeps its `title`), the six numeric columns lose 2 px of padding each, and
           `width:100%;max-width:0` on that one cell is what makes the six numeric columns keep their
           natural width instead of being squeezed — and the name WRAPS there rather than being cut,
           because an ellipsis hides the very thing the row is about.
           The scroller stays for the case that still overflows — a 260 px docked column — and now
           says so with a fade at the edge it is scrollable from. */
        +'<div class="sq-tbl" style="margin-top:8px;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;">'
        +'<table class="sq-sites" style="font-size:'+FS+';"><thead><tr style="color:var(--text-main);">'
        +'<th style="text-align:left;font-weight:600;">'+L('Place','地点','Ort','Место','Lugar')+'</th>'
        +'<th style="text-align:right;font-weight:600;white-space:nowrap;">Δ <span style="opacity:.65;font-weight:400;">km</span></th><th style="text-align:right;font-weight:600;color:#ff6b6b;">P</th>'
        +'<th style="text-align:right;font-weight:600;color:#ffb020;">S</th>'
        +'<th style="text-align:right;font-weight:600;">'+L('shaking','継続','Dauer','длит.','durac.')+'</th>'
        +'<th style="text-align:right;font-weight:600;">PGV</th>'
        +'<th style="text-align:right;font-weight:600;">'+(jp?L('Shindo','震度','Shindo','Синдо','Shindo'):'MMI')+'</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
        /* (#R205) …and this line no longer claims the click unconditionally: it says so only while the
           switch at the top of the panel is on 観測地点, and names the switch when it is not. */
        +'<div style="margin-top:5px;opacity:0.75;">'+(clickMode==='station'
          ?L('Click the map to add a place to this table.','地図をクリックすると地点を追加できます。','Karte klicken, um einen Ort hinzuzufügen.','Кликните по карте, чтобы добавить место.','Haga clic en el mapa para añadir un lugar.')
          :L('Switch the map click to “Add a place” to add rows here.','地図クリックを「観測地点を追加」に切り替えると、ここに行を追加できます。','Kartenklick auf „Ort hinzufügen“ stellen, um hier Zeilen zu ergänzen.','Переключите клик по карте на «Добавить место», чтобы добавлять строки.','Cambie el clic del mapa a «Añadir un lugar» para añadir filas aquí.'))+'</div>';
    }
    /* ══ (#R232) LOADING A PAST EARTHQUAKE ═══════════════════════════════════════════════════════
       「選んだら当時と同じ条件や震源域を精密に入力し、その結果を出すように。」

       Every input the panel has is set from the row, and then the model runs unchanged:
         · the HYPOCENTRE is the published epicentre and the published focal depth — and it is also
           the NUCLEATION POINT, which is what the rupture rectangle is positioned around and what
           the directivity term measures from (see `fdAt`). A preset that put the hypocentre at the
           centroid would silently make every earthquake bilateral;
         · the RUPTURE is the published rectangle, projected to the surface through its own dip
           (js/seismic-events.js `ruptureRing`), and handed to the same `faultSet` a hand-drawn
           outline goes through;
         · dip, down-dip width and the top of the plane are PINNED as overrides, so the geometry
           solver reproduces the published plane instead of estimating one from the outline;
         · and the mean slip is derived from the PUBLISHED MOMENT over that plane's own area, so
           M₀ = μ·A·D̄ returns the published Mw rather than something 0.3 away from it.

       ⚠ THE PANEL'S Mw IS THEN THE MODEL'S, AND IT IS CHECKED AGAINST THE PUBLISHED ONE. If the two
       disagree by more than 0.05 the slip is corrected once — the geometry solver may clamp a width
       or a depth, and an answer that quietly stops being the earthquake it claims to be is worse
       than one that says so. */
    let evId='', evNow=null, evPub=null;
    /* the plane + slip chain, run on whichever outline we have. Factored out by (#R235) because it
       now runs TWICE for the same event: once on the published rectangle so the panel is never
       empty, and again on the fetched finite-fault outline when it lands. */
    function _evBuild(ev,ring,over){
      faultOver=Object.assign({},over);
      if(!faultSet(ring)) return false;
      /* D̄ that reproduces the published moment over the plane the solver actually built */
      const A3=Math.max(1,(fault&&fault.areaKm2)||0)*1e6;      /* m² */
      let slip=momentOf(ev.mw)/(MU*A3);
      faultOver=Object.assign({},over,{slipM:slip});
      faultSet(ring);
      if(Math.abs(mw-ev.mw)>0.05){                            /* one correction, then stop */
        slip*=Math.pow(10,1.5*(ev.mw-mw));
        faultOver=Object.assign({},over,{slipM:slip});
        faultSet(ring);
      }
      return true;
    }
    function _evFrame(ring){
      /* the camera goes where the earthquake is — the whole rupture, not just its hypocentre */
      try{ const b=ring.reduce((a,p)=>[Math.min(a[0],p[0]),Math.min(a[1],p[1]),Math.max(a[2],p[0]),Math.max(a[3],p[1])],[180,90,-180,-90]);
        GE().camera.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:80,duration:900}); }catch(_){}
    }
    /* ══ ⚠⚠ (#R242) UNLOADING IS THE EXACT INVERSE OF LOADING ══════════════════════════════════════
       「過去の地震から選んだ後、それを選択解除して戻す方法がない。」 `applyEvent` sets five things —
       the catalogue row, the depth, the epicentre, the rupture plane and the published outline — so
       unloading puts all five back rather than only forgetting the row (which would leave the map
       showing an earthquake the panel no longer names: exactly the 「出たまま」 defect one item
       below). The panel returns to the state `open()` starts in, and a rupture or an epicentre the
       reader placed BY HAND is not touched — only what a preset put there is removed. */
    function clearEvent(){
      const had=!!(evNow||evPub);
      evId=''; evNow=null; evPub=null;
      if(!had){ render(); return; }
      try{ faultClear(); }catch(_){}
      epi=null; stations.length=0; depthKm=10; mw=7.0; tSec=0; playing=0;
      try{ setClickMode('epi'); }catch(_){}   /* back to the state open() leaves an empty panel in */
      /* the painted field belonged to the earthquake that has just been unloaded; `buildField`
         itself drops it when there is no epicentre, and `refresh()` below is what asks it to. */
      refresh(); render();
    }
    function applyEvent(id){
      const ev=QUAKE_EVENTS.find(e=>e.id===id)||null;
      evId=ev?ev.id:''; evNow=ev; evPub=null;
      if(!ev){ render(); return; }
      try{
        depthKm=ev.depthKm;
        setEpi([ev.lng,ev.lat]);
        const ring=ruptureRing(ev);
        /* the published plane, pinned: dip / down-dip width / top depth are facts about this
           earthquake, not things to estimate from a rectangle. */
        if(!_evBuild(ev,ring,{ dip:ev.dip, widthKm:ev.widKm, zTopKm:ev.zTopKm })){ render(); return; }
        _evFrame(ring);
      }catch(_){}
      refresh(); render();
      /* ══ ⚠ (#R235) …AND THEN THE REAL OUTLINE REPLACES THE RECTANGLE ═══════════════════════════
         「震源域の描画が雑すぎる。（現状は単に長方形置くだけ。）」 The rectangle above is what the
         catalogue can state offline, and it stays the answer if the fetch fails — so this is a
         REFINEMENT, not a dependency. When the published finite-fault outline arrives:
           · the ring becomes the model's own (Türkiye's bent multi-segment trace, Sumatra's
             1,300 km arc, Wenchuan's 15-vertex outline — none of them a rectangle);
           · `zTopKm` / `zBotKm` come off the polygon's OWN depth ordinates, so the plane is pinned
             to the published geometry instead of to the catalogue's estimate, and the dip is left
             for the solver to read from a shape that now actually has one;
           · the reference string is kept for the panel's attribution (CONSTITUTION 4).
         ⚠ Guarded on `evId` so a reader who changes the selection while a fetch is in flight does
         not get the previous earthquake's rupture painted over the new one. */
      try{
        const want=ev.id;
        fetchRuptureRing(ev).then((pub)=>{
          if(!pub||evId!==want||!opened) return;
          const over={ dip:ev.dip, widthKm:ev.widKm, zTopKm:ev.zTopKm };
          if(pub.zTopKm!=null&&pub.zBotKm!=null&&pub.zBotKm>pub.zTopKm){
            over.zTopKm=pub.zTopKm; over.zBotKm=pub.zBotKm; delete over.dip; delete over.widthKm; }
          if(!_evBuild(ev,pub.ring,over)) return;
          evPub=pub; _evFrame(pub.ring); refresh(); render();
        });
      }catch(_){}
    }
    /* what was actually MEASURED, beside what the model says — 「実測値も併記する」. Quoted with its
       source and never mixed into the computed numbers above it. */
    /* ══ ⚠⚠ (#R242) WHAT WAS OBSERVED IS A TABLE, NOT A PARAGRAPH ═══════════════════════════════════
       「…というようにテキストべったりではなく、ちゃんと表形式でまとめろ。」
       Every line in this block is a NAME and a VALUE — the time, the magnitude, the depth, the focal
       mechanism, the rupture size, the peak intensity, the slip, the tsunami, the casualties, the
       source. #R232 wrote them as one run of sentences with the names in a lighter grey, so the
       values did not line up and the whole thing read as prose you skim past. Two columns, one row
       per fact, the value column carrying the numbers — and the two long free-text rows (the note and
       the citations) keep a full-width row of their own, because forcing a paragraph into a value
       column is how a table becomes unreadable again. */
    function evObsHtml(ev){
      const esc=(x)=>HOST.escapeHtml(String(x==null?'':x));
      const o=ev.obs||{};
      const rows=[];
      const row=(k,v)=>{ if(v==null||v==='') return; rows.push('<tr><th>'+k+'</th><td>'+esc(v)+'</td></tr>'); };
      const wide=(k,v)=>{ if(v==null||v==='') return; rows.push('<tr class="sq-obs-w"><th colspan="2">'+k+'<span>'+esc(v)+'</span></th></tr>'); };
      const pick=(a)=>Array.isArray(a)?L.arr(a):a;   /* (#R242) through pick() itself — see js/lang-registry.js */
      row(L('When','発生時刻','Zeitpunkt','Время','Cuándo'), String(ev.when||'').replace('T',' '));
      row(L('Magnitude','規模','Magnitude','Магнитуда','Magnitud'), 'Mw '+ev.mw.toFixed(1));
      row(L('Depth','深さ','Tiefe','Глубина','Profundidad'), ev.depthKm+' km');
      row(L('Strike / dip / rake','走向／傾斜／すべり角','Streichen / Fallen / Rake','Простир. / падение / подвижка','Rumbo / buz. / cabeceo'), ev.strike+'° / '+ev.dip+'° / '+ev.rake+'°');
      row(L('Rupture size','震源域の大きさ','Bruchfläche','Размер очага','Tamaño de la ruptura'), ev.lenKm+' × '+ev.widKm+' km');
      row(L('Peak intensity','最大震度','Max. Intensität','Макс. интенсивность','Intensidad máx.'), pick(o.intensity));
      row(L('Slip','すべり量','Versatz','Подвижка','Deslizamiento'), o.slipM);
      row(L('Tsunami','津波','Tsunami','Цунами','Tsunami'), o.tsunamiM);
      row(L('Casualties','人的被害','Opfer','Жертвы','Víctimas'), o.deaths);
      wide(L('Note','注記','Hinweis','Примечание','Nota'), pick(o.note));
      wide(L('Source','出典','Quelle','Источник','Fuente'), ev.src);
      /* ⚠ (#R235) THE DRAWN OUTLINE GETS ITS OWN ROW, because it is a different claim from the one
         above it: `ev.src` says where the catalogue's NUMBERS come from, this says whose model the
         SHAPE on the map is. It appears only when the published outline actually arrived — when the
         fetch fails the panel is showing the rectangle and says nothing it cannot support. */
      if(evPub) wide(L('Rupture outline','震源域の輪郭','Bruchfläche','Контур очага','Contorno de ruptura'),
        'USGS ShakeMap'+(evPub.segments>1?(' ('+evPub.segments+' '+L('segments','セグメント','Segmente','сегментов','segmentos')+')'):'')
        +(evPub.ref?(' — '+evPub.ref.replace(/https?:\/\/\S+/g,'').trim().slice(0,180)):''));
      return '<div class="sq-obs-h">'+L('Observed at the time','当時の実測値','Damals gemessen','Наблюдалось тогда','Observado entonces')+'</div>'
        +'<table class="sq-obs">'+rows.join('')+'</table>';
    }

    /* ══ (#R232) THE OBSERVATION POINTS ARE THE MAJOR CITIES AROUND IT, AND ONLY THE ONES THAT SHAKE ══
       「地震シミュレータの観測地点は、周囲の主要都市に。各都市の首都に今はなっているが、そんな大きな
         くくりはいらない。JMA震度3もしくはMMI IV以下の都市は観測地点として表示しないように。」

       The old picker read `IntMapGazetteer.builtin` — a hand-written list of flashpoints, countries
       and CAPITALS — and took the six nearest by angle. For an earthquake off Tōhoku that answers
       「Tokyo, Seoul, Pyongyang, Beijing, Taipei, Manila」: a table of national capitals, most of which
       feel nothing, which is exactly the 「そんな大きなくくり」 being objected to.

       ⚠ THE SOURCE IS THE WORLD GAZETTEER, WHICH HAS POPULATIONS (#R232 keeps them — see
       js/gazetteer.js `_rowsFrom`). 「主要都市」 is a ranking, not a category, so candidates are ranked
       by population among everything near enough to matter, and the intensity decides the rest.

       ⚠ AND THE FILTER IS THE INSTRUCTION'S, EXACTLY. A city is dropped when it would feel JMA 震度3
       or less, or MMI IV or less — evaluated on the SCALE THE PANEL IS SHOWING, since that is the
       number the reader is being asked to compare. Class boundaries, not rounded labels: 震度4 begins
       at 3.5 on the JMA level and MMI V begins at 4.5, so those are the thresholds.
       ⚠ USER-PLACED POINTS ARE NEVER FILTERED. Someone who tapped a spot asked about that spot, and
       "you would feel nothing here" is a legitimate answer to that question. Only the automatic
       suggestions are subject to the cut. */
    const OBS_MAX=10;                 /* rows of automatic cities, after the intensity cut */
    const OBS_POOL=300;               /* how many FELT cities are ranked (bounds the at() calls) */
    const OBS_MIN_SEP_KM=30;          /* two rows this close are one place with two names */
    function obsCut(a){
      if(!a) return false;
      /* ⚠ THE RANGE TEST IS THE DISTANCE, NOT `calibrated`. `calibrated` also goes false ABOVE MMI
         9.5, where the GMICE runs out at the top — so cutting on it threw away the worst-hit city in
         the list, which is the opposite of what this filter is for. Measured on Tōhoku: Sendai, at
         Rrup 0, was the one place excluded. Past MMI_CALIB_KM the regional spreading law is
         extrapolated and the table declines to print an intensity at all, and a row the model will
         not answer for is not an observation point — that half of the test stays. */
      if(!(a.km<=MMI_CALIB_KM)) return false;
      return (scale==='jma') ? (a.jma>=3.5) : (a.mmi>=4.5);
    }
    function obsCities(){
      const G=window.IntMapGazetteer; if(!G||!epi) return [];
      let rows=null;
      /* the world list (147,924 places with populations — 12,000 on a phone) when it has been
         warmed, the bundled list otherwise: a session that has not needed it yet still gets an
         answer rather than an empty table, and the warm() below means the next redraw has the real
         thing. */
      try{ rows=G.world&&G.world(); }catch(_){}
      if(!rows||!rows.length){ try{ G.warm&&G.warm().then(()=>{ try{ if(opened) report(); }catch(_){} }); }catch(_){}
        rows=G.builtin||[]; }
      const near=[];
      for(const r of rows){
        if(r[0]!=='city'&&r[0]!=='capital') continue;
        const d=gcDelta(epi,[r[2],r[3]]);
        if(d*D*RE>MMI_CALIB_KM*1.2) continue;            /* outside anything the model will answer for */
        near.push({ name:(HOST.lang==='jp'?(r[5]||r[4]):r[4]), lng:r[2], lat:r[3], d, pop:+r[6]||0 });
      }
      near.sort((a,b)=>a.d-b.d);
      /* ⚠ THE INTENSITY CUT COMES BEFORE THE POPULATION RANKING, AND THAT ORDER IS THE WHOLE POINT.
         Ranking the nearest N by population first put Nanjing, Qingdao and Shanghai at the top of a
         Tōhoku table — measured — because "the 260 nearest cities" reaches 2,289 km when only 2,101
         places in the list are cities at all. 「周囲の主要都市」 means the major cities AMONG THE ONES
         THAT SHAKE, so the shaking decides who is eligible and the population decides who is
         interesting. */
      const felt=[];
      for(const c of near){
        if(felt.length>=OBS_POOL) break;
        let a=null; try{ a=at(c.lng,c.lat); }catch(_){}
        if(obsCut(a)) felt.push(c);
      }
      felt.sort((a,b)=>(b.pop-a.pop)||(a.d-b.d));
      /* ⚠ …AND A SPATIAL SPREAD, because the biggest places in a metropolis are its own wards. The
         gazetteer has no row for Tokyo — it has Setagaya, Suginami, Edogawa and twenty more — so a
         pure population ranking answers a Tōhoku table with ten Tokyo wards reading the same number.
         Anything within OBS_MIN_SEP_KM of a place already chosen is skipped, which turns the list
         back into 「周囲の」: around it. */
      const out=[];
      for(const c of felt){
        if(out.length>=OBS_MAX) break;
        if(out.some(o=>gcDelta([o.lng,o.lat],[c.lng,c.lat])*D*RE<OBS_MIN_SEP_KM)) continue;
        out.push(c);
      }
      /* nearest-first reads like a felt report, which is what this table is — and "nearest" is the
         distance the row PRINTS (Rrup, to the rupture), not the epicentral one. Sorting by the
         epicentral angle put Kayseri at 211 km above Mersin at 106 km, which reads as a bug. */
      out.forEach(c=>{ let a=null; try{ a=at(c.lng,c.lat); }catch(_){} c._km=(a&&a.km!=null)?a.km:(c.d*D*RE); });
      out.sort((a,b)=>a._km-b._km);
      return out;
    }
    /* the table: whatever the user clicked, plus the major cities around the source that actually shake */
    function nearby(){
      const out=stations.map((s,i)=>({name:s.name,lng:s.lng,lat:s.lat,n:i+1}));   /* (#R210) 1-based, same as the marker */
      try{ obsCities().forEach(c=>{ if(!out.some(o=>o.name===c.name)) out.push(c); }); }catch(_){}
      return out.slice(0,OBS_MAX+6);
    }
    let pickH=null;
    /* (#R206) ⚠ setPicking, not `picking=false` — the fallback path (no IntMapPick) leaves the panel
       ON SCREEN while a pick is armed, so it is the one path where the button's state is visible and
       therefore the one that must put it back. `function` declarations hoist, so calling it from here
       is safe (#R200: the same care a `const` would have needed). */
    function endPick(){ setPicking(false); try{ if(pickH) GE().events.off('click',pickH); }catch(_){} pickH=null;
      try{ const P=window.IntMapPick; if(P&&P.active()) P.abort(); }catch(_){}
      try{ GE().render.canvas().style.cursor=''; }catch(_){} }
    /* ══ (#R196) THE EPICENTRE CAN BE MOVED AGAIN ══════════════════════════════════════════════════
       「地震シミュレーター、地点を選びなおせない。」 The gesture was never broken; the PANEL was
       standing on the map it asked to be tapped. Measured at 390 × 844: this panel is 362 × 669 at
       (16, 80), so on a phone the only reachable pixels are two 16 px slivers and the app's own
       sidebar — `document.elementsFromPoint` at the tap point returned `DIV.sidebar collapsed`, never
       the canvas. window.IntMapPick (js/map-pick.js) hides the panel for the duration of the click
       and brings it straight back, so the map is reachable on every screen. */
    /* (#R206) …and the button says which of the two it is. `picking` is drawn by PICKBTN, so every
       path that changes it re-renders — otherwise IntMapPick's teardown puts the panel back showing
       the state it had when it was hidden, which is the stuck-looking button all over again. */
    function setPicking(v){ const n=!!v; if(picking===n) return n; picking=n; if(opened&&panel) render(); return n; }
    function startPick(){ endPick(); setPicking(true);
      const P=window.IntMapPick;
      if(P&&P.start){
        const ok=P.start({ panel, hidePanel:true,
          hint:L('Tap the map to place the epicenter.','地図をタップして震源地を置いてください。','Zum Setzen des Epizentrums auf die Karte tippen.','Нажмите на карту, чтобы указать эпицентр.','Toca el mapa para colocar el epicentro.'),
          onPick:(ll)=>{ setPicking(false); setEpi([ll.lng,ll.lat]); refresh(); },
          onCancel:()=>{ setPicking(false); } });
        if(ok) return;
      }
      /* no pick module in this build — the original behaviour, unchanged */
      try{ GE().render.canvas().style.cursor='crosshair'; }catch(_){}
      pickH=e=>{ setEpi([e.lngLat.lng,e.lngLat.lat]); endPick(); refresh(); }; try{ GE().events.once('click',pickH); }catch(_){} }
    /* ══ (#R205) CLICKING THE MAP MOVES THE EPICENTRE ══════════════════════════════════════════════
       「地震シミュレータは、別の震源地を選びなおせない。地図に白い丸が出るだけ。」

       REPRODUCED, desktop 1440 × 900: open the simulator at 140 E / 35 N, click the map anywhere
       outside the panel → `state().epi` unchanged, `state().stations` 0 → 1. The white circle IS the
       station marker (`seis-sta`, circle-color #ffffff). #R196 fixed the ◎ button — and the button
       still works, measured in the same run — but the gesture a user actually makes to re-place a
       point is to click where they want it, and this panel spent that gesture on the OTHER thing it
       can do with a click. Its own footer even said so: 「地図をクリックすると地点を追加できます」.

       So the click has a stated owner, shown as one segmented row at the top of the panel, and the
       DEFAULT is the epicentre. The observation-point table is not removed — it is the other half of
       the same switch, one tap away, and everything that reads `stations` is unchanged. */
    /* (#R218) three states, not two: 'epi', 'station' and 'none' (the map is not armed at all). An
       unknown value still lands on 'epi', so the callable API (Atlas, setParams) behaves as before. */
    function setClickMode(v){ clickMode=(v==='station')?'station':(v==='none'||v===null||v===false)?'none':'epi';
      if(opened) render(); return clickMode; }

    /* ══ ⚠⚠⚠ (#R239) THE INSTRUCTION BELONGS WHERE THE HANDS ARE ═══════════════════════════════════
       「地震シミュレータで震源置いたり震源域描いたりするのにUIが分かりにくすぎるから全面的に改修し、
         モダンな実装でiOS風に。」 — the third round this has been sent.

       #R236 put the three controls in work order; #R238 made them numbered steps that carry their
       own state and their own instruction. Both changes were to the PANEL, and the panel is not
       where the difficulty is. The moment any of the three is armed the reader stops looking at the
       sidebar — they are looking at the map, with a finger on it — and everything that tells them
       what a tap will now do, how to finish, and how to get out is behind them in a column they are
       no longer reading. On a phone the panel may be a whole sheet away. That is why this keeps
       being reported as 「分かりにくい」 while each round's screenshot of the panel looks tidy.

       ⚠ SO THE ARMED STATE GETS A HUD ON THE MAP, and it is the plainest iOS pattern there is — the
       same bar Maps puts up while you are moving a pin: a floating capsule at the bottom of the
       canvas, a live dot, one line of what a tap does now, and the way out as a real button rather
       than «press the thing you pressed again». Three states, one shape:

           ① 震源域を描く   … 完了 (closes the loop — no more «click the first point again»)
           ② 震央を置く     … 完了
           ③ 観測地点を追加 … 完了

       ⚠ IT IS A READOUT OF EXISTING STATE, NOT A FOURTH WAY TO DRIVE THE PANEL. Its buttons call
       the very handlers the step rows call (`toggleFaultDraw` / `setClickMode`), so there is no
       second source of truth about what is armed — the defect [[intmap-recurring-lessons]] G is
       about, and the reason the panel rows are untouched by this. */
    let _hudEl=null;
    function _hudCss(){
      if(document.getElementById('sq-hud-css')) return;
      const st=document.createElement('style'); st.id='sq-hud-css';
      st.textContent='#sq-hud{position:absolute;left:50%;transform:translateX(-50%);'
        +'bottom:calc(env(safe-area-inset-bottom,0px) + 96px);z-index:1450;display:none;align-items:center;gap:12px;'
        +'max-width:min(560px,92%);padding:10px 10px 10px 14px;border-radius:22px;pointer-events:auto;'
        +'background:var(--popup-bg,rgba(28,28,30,0.82));border:1px solid var(--glass-border,rgba(128,128,128,0.28));'
        +'box-shadow:0 14px 44px rgba(0,0,0,0.42);backdrop-filter:blur(22px) saturate(1.7);-webkit-backdrop-filter:blur(22px) saturate(1.7);}'
        +'#sq-hud.on{display:flex;}'
        +'#sq-hud .sqh-dot{flex:0 0 auto;width:10px;height:10px;border-radius:50%;background:var(--primary-color);'
        +'box-shadow:0 0 0 0 var(--primary-color);animation:sqhPulse 1.8s ease-out infinite;}'
        +'@keyframes sqhPulse{0%{box-shadow:0 0 0 0 rgba(10,132,255,0.55);}70%{box-shadow:0 0 0 9px rgba(10,132,255,0);}100%{box-shadow:0 0 0 0 rgba(10,132,255,0);}}'
        +'#sq-hud .sqh-txt{flex:1 1 auto;min-width:0;}'
        /* ⚠ (#R239) ONE TYPE SCALE. #R234's rule (and tests/r234-checks) is that this panel has three
           sizes — FS / FS_S / FS_H — and no raw px anywhere else; the HUD is part of the panel even
           though it is drawn on the map, so it interpolates the same three constants. */
        +'#sq-hud .sqh-t{display:block;font-size:'+FS_H+';font-weight:700;color:var(--text-main);line-height:1.25;}'
        +'#sq-hud .sqh-s{display:block;font-size:'+FS_S+';color:var(--text-muted);line-height:1.35;margin-top:1px;}'
        +'#sq-hud button{flex:0 0 auto;border:none;border-radius:16px;height:32px;padding:0 15px;font-size:'+FS_H+';'
        +'font-weight:700;cursor:pointer;background:var(--primary-color);color:#fff;}'
        +'#sq-hud button.sqh-2{background:var(--input-bg);color:var(--text-main);}'
        +'@media(prefers-reduced-motion:reduce){#sq-hud .sqh-dot{animation:none;}}';
      document.head.appendChild(st);
    }
    function _hud(){
      try{
        const mc=document.getElementById('map-container'); if(!mc) return;
        _hudCss();
        if(!_hudEl||!_hudEl.isConnected){
          _hudEl=document.createElement('div'); _hudEl.id='sq-hud';
          _hudEl.innerHTML='<span class="sqh-dot"></span><span class="sqh-txt"><span class="sqh-t"></span>'
            +'<span class="sqh-s"></span></span><button class="sqh-1"></button>';
          mc.appendChild(_hudEl);
        }
        const on=opened&&(_fDrawing||clickMode==='epi'||clickMode==='station');
        _hudEl.classList.toggle('on',!!on);
        if(!on) return;
        const t=_hudEl.querySelector('.sqh-t'), s=_hudEl.querySelector('.sqh-s'), b=_hudEl.querySelector('.sqh-1');
        if(_fDrawing){
          t.textContent='① '+L('Draw the rupture area','震源域を描く','Bruchfläche zeichnen','Обведите очаг','Dibuje la ruptura');
          s.textContent=L('Tap each corner on the map, then press Done.','地図上で角を順にタップし、「完了」を押してください。','Tippen Sie die Ecken auf der Karte an und drücken Sie dann Fertig.','Отмечайте углы на карте, затем нажмите «Готово».','Toque cada vértice en el mapa y pulse Listo.');
          b.textContent=L('Done','完了','Fertig','Готово','Listo');
          b.onclick=()=>{ toggleFaultDraw(); };
        } else if(clickMode==='epi'){
          t.textContent='② '+L('Place the hypocenter','震央を置く','Hypozentrum setzen','Поставьте гипоцентр','Coloque el hipocentro');
          s.textContent=fault
            ?L('Tap inside the rupture area — this is where the rupture starts.','震源域の内側をタップしてください。ここが破壊の開始点になります。','Tippen Sie in die Bruchfläche — dort beginnt der Bruch.','Нажмите внутри очага — оттуда начинается разрыв.','Toque dentro de la ruptura — ahí empieza.')
            :L('Tap the map. Tapping again moves it.','地図をタップしてください。もう一度タップすると移動します。','Tippen Sie auf die Karte; erneutes Tippen verschiebt.','Нажмите на карту; повторное нажатие переместит.','Toque el mapa; otro toque lo mueve.');
          b.textContent=L('Done','完了','Fertig','Готово','Listo');
          b.onclick=()=>setClickMode('none');
        } else {
          t.textContent='③ '+L('Add observation points','観測地点を追加','Messpunkte hinzufügen','Добавьте точки наблюдения','Añada puntos de observación');
          s.textContent=L('Every point you tap is added to the table.','タップした地点が下の表に追加されます。','Jeder angetippte Punkt kommt in die Tabelle.','Каждая точка попадает в таблицу.','Cada punto tocado se añade a la tabla.');
          b.textContent=L('Done','完了','Fertig','Готово','Listo');
          b.onclick=()=>setClickMode('none');
        }
      }catch(_){}
    }
    /* ⚠ (#R207) …AND NOT WHILE A RUPTURE IS BEING DRAWN ═══════════════════════════════════════════
       「フリーで描く際に、それが震源地を配置した判定になるのを辞めろ。」 #R205 gave a plain map click to
       the epicentre, and DrawTool's stroke is made of plain map clicks: every loop drawn since then
       also dragged the epicentre to wherever the finger came down, silently redefining the event the
       drawn area was about to describe. Drawing owns the pointer for the duration. */
    function onClick(e){ if(!opened||picking||_fDrawing) return;
      /* ⚠ (#R218) THE CLAIM COMES AFTER THE ARMED TEST, NOT BEFORE IT. #R210 claims the tap so a place
         label under the panel does not also open its popup — correct while the map IS armed, and
         exactly wrong once it can be disarmed: an unarmed panel would go on eating every click and
         the map would be dead in a way nothing on screen explains. Claim what this panel consumes. */
      if(clickMode==='none') return;      /* neither segment is lit — the map is not armed */
      /* (#R210) whichever branch runs below, this panel consumed the tap — a place label under it
         must not open its popup as well. See js/geo-engine.js `claimClick`. */
      try{ GE().events.claimClick&&GE().events.claimClick(e); }catch(_){}
      if(clickMode==='station'){ if(!epi) return;
        stations.push({ lng:e.lngLat.lng, lat:e.lngLat.lat, name:e.lngLat.lat.toFixed(2)+', '+e.lngLat.lng.toFixed(2) });
        if(stations.length>6) stations.shift(); draw(); report(); return; }
      /* ══ ⚠ (#R236) WITH A RUPTURE DRAWN, THE HYPOCENTRE BELONGS **ON** IT ═════════════════════════
         「その後に、震央を震源域の範囲内に配置という形に。」 The hypocentre is where the rupture
         NUCLEATES — `_srcPts` measures every sampled point's delay as its distance from `epi` at
         Vr — so a point outside the drawn area describes a rupture that starts somewhere it does
         not exist, and the directivity computed from it is not about this earthquake.
         ⚠ A REJECTED CLICK IS TOLD, NOT SWALLOWED. Silently ignoring the tap would read as the
         same defect the reader reported before ("nothing happens"), so the panel says why. */
      const p=[e.lngLat.lng,e.lngLat.lat];
      if(fault&&fault.ring&&fault.ring.length>=3&&!_inRing(p,fault.ring)){ _epiOutside=1; render(); return; }
      _epiOutside=0;
      /* (#R240) the first placement changes the FLOW step (there is now something to compute), and
         the step rows above print the coordinates — so this is a full redraw, not a field refresh. */
      const first=!epi;
      setEpi(p); refresh(); if(first) render(); else _paintFoot(); }
    /* ray casting in the ring's own longitude frame — the ring is stored as drawn, so a stroke that
       crossed the antimeridian keeps its continuous longitudes and the test has to be asked in the
       same frame rather than in wrapped degrees (#R189's seam rule, applied to a point query). */
    function _inRing(pt,ring){
      let x=pt[0]; const x0=ring[0][0];
      while(x-x0>180) x-=360; while(x-x0<-180) x+=360;
      const y=pt[1]; let inside=false;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const xi=ring[i][0], yi=ring[i][1], xj=ring[j][0], yj=ring[j][1];
        if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi)) inside=!inside; }
      return inside; }
    /* ══ (#R210) A NEW EARTHQUAKE STARTS WITH AN EMPTY TABLE ══════════════════════════════════════
       「地震が変われば観測地点はリセットされるように。」 The table used to accumulate across events, so
       rows placed around a Tokyo epicentre were still listed — with freshly computed arrival times —
       after the epicentre was dropped off Chile, and nothing said they belonged to a different run.
       ⚠ WHAT COUNTS AS "a different earthquake" HERE IS THE LOCATION, and that is a reading worth
       stating: magnitude and depth spinners tune the SAME event (the rows stay valid and simply
       recompute, and clearing on every spinner step would be hostile), whereas moving the epicentre
       or loading a real USGS event makes the placed points describe an event that no longer exists.
       The threshold is 1 m, i.e. "the same point re-picked" does not clear. */
    function setEpi(next){
      const moved=!epi||!next||Math.abs(epi[0]-next[0])>1e-5||Math.abs(epi[1]-next[1])>1e-5;
      epi=next; _epiElev=null;
      if(moved&&stations.length){ stations.length=0; }
      return moved; }
    GE().events.on('click',onClick);
    /* (#R234) …and the front NAMES follow the view (see `label` in drawFronts). `moveend` only —
       never per frame: 「指に付いてこない」 is this round's other instruction and a wavefront label
       that settles when the pan does is indistinguishable from one that tracked every frame. It
       redraws the fronts alone; the intensity field is not touched. */
    GE().events.on('moveend',()=>{ try{ if(opened&&epi) drawFronts(); }catch(_){} });

    /* A real event, from the USGS feed the app already uses (and already declares in the privacy page). */
    /* ══ (#R234) THE RECENT-EARTHQUAKE PICKER ═════════════════════════════════════════════════════
       Worldwide, M ≥ 6.0, the last 365 days — about 130 events, which is a list a person can read.
       The USGS event query is the same host the summary feed was already fetched from, so nothing
       new is being asked of the browser's CORS (⚠ #R212's rule: a fetch is only proven from the
       page, and this host is proven by the feed this replaces). Newest first, because "recent" is
       the reader's ordering; the magnitude is in the label, so a big one is still easy to find. */
    let _realFeats=[];
    /* (#R236) …and whether that query is in flight, so the one shared picker can say so rather than
       looking like an empty list. */
    let _realBusy=0;
    function _realLabel(f){
      const p=f.properties||{}, t=new Date(+p.time||0);
      const d=isFinite(t) ? t.toISOString().slice(0,10) : '';
      return 'M'+(+p.mag).toFixed(1)+' · '+d+' · '+String(p.place||'').replace(/\s+/g,' ').trim();
    }
    async function loadReal(){
      if(_realBusy) return;                        /* (#R236) one query, however often the switch is pressed */
      const o=panel&&panel.querySelector('.sq-out'); if(o) o.innerHTML=L('Fetching USGS…','USGSから取得中…','USGS wird abgefragt…','Запрос к USGS…','Consultando USGS…');
      _realBusy=1; if(opened) render();
      try{
        const since=new Date(Date.now()-365*24*3600*1000).toISOString().slice(0,10);
        const r=await fetch('https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time&minmagnitude=6&starttime='+since);
        const j=await r.json();
        _realFeats=(j.features||[]).filter(x=>x&&x.properties&&isFinite(x.properties.mag)&&x.geometry&&x.geometry.coordinates);
        if(!_realFeats.length) throw new Error('the query returned no events');
        _realBusy=0;
        render();
        if(o) o.insertAdjacentHTML('afterbegin','<div style="margin-bottom:5px;">'
          +L(_realFeats.length+' earthquakes of M6.0+ in the last year — choose one below.',
             '直近1年のM6.0以上の地震 '+_realFeats.length+' 件です。下の一覧から選んでください。',
             _realFeats.length+' Beben ab M6,0 im letzten Jahr — unten auswählen.',
             _realFeats.length+' землетрясений M6,0+ за год — выберите ниже.',
             _realFeats.length+' terremotos de M6,0+ en el último año — elija abajo.')+'</div>');
      }catch(_){ _realBusy=0; if(opened) render();
        if(o) o.innerHTML=L('Could not reach the USGS feed.','USGSのフィードに接続できませんでした。','USGS-Feed nicht erreichbar.','Не удалось получить данные USGS.','No se pudo acceder al feed del USGS.'); }
    }
    /* the old body of loadReal, given the chosen feature rather than finding one itself */
    /* ⚠ (#R242) 「Past earthquakes の情報表示が、recent earthquakes で新たな地震を選択しても出たまま。」
       The 「当時の実測値」 table belongs to a row of the CURATED catalogue, and this is the other
       source — so loading from the feed clears it, exactly as loading from the catalogue replaces it.
       Same three variables `applyEvent` sets, set to nothing. */
    function applyReal(f){
      evId=''; evNow=null; evPub=null;
      if(!f||!f.geometry) return;
      const o=panel&&panel.querySelector('.sq-out');
      setEpi([f.geometry.coordinates[0],f.geometry.coordinates[1]]);   /* (#R210) a real USGS event is a different earthquake — the placed points go */
      depthKm=Math.max(0,Math.round(f.geometry.coordinates[2]||10));
      faultClear();   /* (#R189) a real point event replaces any drawn rupture */
      mw=Math.round(f.properties.mag*10)/10;
      const d=panel.querySelector('.sq-d'), m=panel.querySelector('.sq-m'); if(d) d.value=depthKm; if(m){ m.value=mw; m.disabled=false; }
      try{ GE().camera.flyTo({center:epi,zoom:3,duration:900}); }catch(_){}
      tSec=0; const tl=panel.querySelector('.sq-t'); if(tl) tl.value=0;
      refresh();
      if(o) o.insertAdjacentHTML('afterbegin','<div style="margin-bottom:5px;">'+HOST.escapeHtml(_realLabel(f))+'</div>');
    }

    function open(o){
      if(!panel){ panel=document.createElement('div'); panel.id='sq-panel';
        /* (#R189) 「ポップアップは透過するな」 — --card-bg is opaque in BOTH themes (#fff / #1c1c1e);
           --popup-bg was rgba with no backdrop-filter, so the map showed through under the table. */
        /* ⚠ (#R240) THE PANEL IS BOUNDED BY THE SCREEN, and the body is what gives way. Before the
           pinned footer the body's own `max-height` was the whole bound; with a footer under it the
           two added up past the viewport and the primary button was cut off at the bottom — which is
           the defect the footer exists to fix, one layer down. The panel caps itself, the body flexes
           inside that cap, and the footer is `flex:0 0 auto`, so the verb is on screen at any height. */
        panel.style.cssText='position:fixed;left:16px;top:80px;width:min(360px,94vw);max-height:calc(100dvh - 96px);z-index:1402;display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
        document.body.appendChild(panel); }
      panel.style.display='flex'; opened=true; render();
      if(o&&o.lng!=null){ setEpi([o.lng,o.lat]); if(o.depth!=null) depthKm=Math.max(0,+o.depth); if(o.mw!=null&&!fault) mw=Math.max(3,Math.min(9.6,+o.mw)); render(); refresh(); }
      else refresh();
      /* (#R240) the one exception to «nothing is armed» — see `clickMode`. With no epicentre there is
         exactly one thing to do and the map is where it is done, so the tap is live and the HUD says
         so. With one already placed, the panel opens quiet and the reader chooses. */
      if(!epi&&clickMode==='none'){ setClickMode('epi'); }
      return true; }
    function close(){ opened=false; endPick(); if(playing){ playing=0; }
      if(_fDrawing){ try{ window.DrawTool&&window.DrawTool.exit&&window.DrawTool.exit(); }catch(_){} _fDrawing=false; }
      fldSeq++; _revoke(fld&&fld.url); _revoke(fldFar&&fldFar.url); fld=null; fldFar=null; try{ paintField(); paintFar(); }catch(_){}
      /* (#R239) …and the on-map HUD goes with it. It reads `opened`, but nothing calls render()
         after the panel is closed, so it is asked here directly. */
      try{ _hud(); }catch(_){}
      if(panel) panel.style.display='none'; setData([]); return true; }
    /* (#R191) …and while the scale is still a DEFAULT, it follows the language the way it would have
       been chosen at boot. A latched choice (scaleSet) is never touched. */
    window.addEventListener('intmap-lang',()=>{ if(!scaleSet){ const want=scaleForLang();
        if(want!==scale){ scale=want; if(fld) fldStale=true; try{ legend(); }catch(_){} } }
      if(opened) render(); });

    /* (#R211) 「シミュレーションに入力された数値まで共有」 — the epicentre, the magnitude, the depth
       and the intensity scale ARE the question this panel was asked, so a share link that reproduced
       the panel without them would reopen on a different earthquake. The key is the lazy-module name
       ('seismic'), which is how js/map-ui.js fetches this module back before handing the value over. */
    try{ window.IntMapShareState&&window.IntMapShareState.register('seismic',{
      get(){ if(!opened||!epi) return null;
        return { e:[+epi[0].toFixed(5),+epi[1].toFixed(5)], d:depthKm, m:+mw.toFixed(2), t:tSec,
                 sc:scale, sp:speed, st:stressDropMPa, si:siteId, op:fldOpacity }; },
      set(v){ if(!v||!Array.isArray(v.e)) return;
        Promise.resolve(open()).then(()=>{
          try{ setEpi([+v.e[0],+v.e[1]]); }catch(_){}
          if(v.si) try{ if(SITES.some(s=>s.id===v.si)) siteId=v.si; }catch(_){}
          if(v.op!=null) try{ setFieldOpacity(+v.op); }catch(_){}
          try{ if(v.d!=null) depthKm=Math.max(0,Math.min(700,+v.d));
            if(v.m!=null&&!fault) mw=Math.max(3,Math.min(9.6,+v.m));
            if(v.t!=null) tSec=Math.max(0,Math.min(MAXT,+v.t));
            if(v.st!=null) stressDropMPa=Math.max(0.3,Math.min(30,+v.st));
            if(v.sc==='mmi'||v.sc==='jma') pickScale(v.sc);
            if(v.sp!=null&&isFinite(+v.sp)&&+v.sp>0) speed=Math.max(0.1,Math.min(1000,+v.sp)); }catch(_){}
          if(opened) render(); refresh();
        }).catch(()=>{}); } }); }catch(_){}

    return { open, close, draw, at, arrival, curve, source, motion, mmiRings,
      setEpicentre(lng,lat){ setEpi([lng,lat]); refresh(); return true; },
      setParams(o){ o=o||{}; if(o.depth!=null) depthKm=Math.max(0,Math.min(700,+o.depth));
        if(o.mw!=null&&!fault) mw=Math.max(3,Math.min(9.6,+o.mw)); if(o.t!=null) tSec=Math.max(0,Math.min(MAXT,+o.t));
        if(o.stressDrop!=null) stressDropMPa=Math.max(0.3,Math.min(30,+o.stressDrop));
        if(o.scale==='mmi'||o.scale==='jma') pickScale(o.scale);                  /* (#R189) */
        if(o.speed!=null&&isFinite(+o.speed)&&+o.speed>0) speed=Math.max(0.1,Math.min(1000,+o.speed));
        /* (#R224) a slip handed in is an OVERRIDE of the auto estimate — `null` puts it back on auto */
        if(o.slip!==undefined){ if(o.slip==null) delete faultOver.slipM;
          else faultOver.slipM=Math.max(0.01,Math.min(80,+o.slip||1));
          faultResolve(); }
        if(opened) render(); refresh(); return true; },
      loadReal,
      setSite(id){ if(SITES.some(s=>s.id===id)){ siteId=id; if(opened) render(); refresh(); return true; } return false; },
      /* (#R189) the new controls, callable — the Atlas rule: every feature drives from a call */
      setScale(v){ if(pickScale(v)){ if(opened) render(); refresh(); return true; } return false; },
      setSpeed(v){ const n=+v; if(isFinite(n)&&n>0){ speed=Math.max(0.1,Math.min(1000,n)); if(opened) render(); return true; } return false; },
      setFault(ring,slip){ if(slip!=null) faultOver.slipM=Math.max(0.01,Math.min(80,+slip||1));
        const ok=faultSet(ring); if(ok){ if(opened) render(); refresh(); } return ok; },
      /* (#R224) the advanced geometry, callable like every other control (#R82). Any of
         dip / widthKm / zTopKm / zBotKm / slipM; `null` for a key puts that one back on auto,
         and `{}` with reset:true puts ALL of them back. */
      setFaultGeometry(o){ o=o||{};
        if(o.reset) faultOver={};
        ['dip','widthKm','zTopKm','zBotKm','slipM'].forEach(k=>{ if(!(k in o)) return;
          if(o[k]==null) delete faultOver[k]; else faultOver[k]=+o[k]; });
        const ok=faultResolve(); if(ok){ if(opened) render(); refresh(); } return ok?faultGeom():null; },
      faultGeometry:()=>faultGeom(),
      clearFault(){ faultClear(); if(opened) render(); refresh(); return true; },
      rebuildField:()=>buildField(),
      /* (#R205) the map-click owner, callable (the Atlas rule) and readable by the regression test */
      setClickMode,
      /* (#R190) the field's own value at one point, with the class colour — read by the always-on
         corner readout (js/map-readout.js). Returns null when the simulator is closed, the field has
         not been computed, or the point is outside it: a readout that guesses is worse than none. */
      intensityAt(lng,lat){ if(!opened||!fld||!fld.pgvAt) return null;
        const pgv=fld.pgvAt(lng,lat); if(pgv==null||!isFinite(pgv)) return null;
        /* the ACTIVE scale, from the quantity that scale is computed from — never a number left over
           from the scale the field happened to be painted in (see the ⚠ note in buildField) */
        if(scale==='jma'){ const a0=fld.a0At?fld.a0At(lng,lat):null; if(a0==null) return null;
          const I=jmaOfA0(a0); const c=jmaClass(I); if(!c) return null;
          return { scale:'jma', I:+I.toFixed(2), pgv:+pgv.toFixed(2), a0:+a0.toFixed(2), col:c.col,
                   label:L('Shindo','震度','Shindo','Синдо','Shindo')+' '+jmaLabel(c.id) }; }
        const I2=mmiOf(pgv); const c2=mmiClass(I2); if(!c2) return null;
        /* (#R224) the swatch is the RAMP at this exact intensity, not the class's lower bound — the
           fill is continuous now, so a class colour here would disagree with the pixel underneath. */
        return { scale:'mmi', I:+I2.toFixed(2), pgv:+pgv.toFixed(2), col:_mmiHex(I2), label:'MMI '+ROMAN[Math.max(1,Math.min(12,Math.round(I2)))] }; },
      /* (#R190) 「震度の塗は透明度選択を可能に」 — callable, like every other control (#R82) */
      setOpacity:(v)=>setFieldOpacity(v),
      opacity:()=>fldOpacity,
      /* (#R190) 「津波…も使えるように」 — the screening result and the hand-off, both callable */
      tsunami:()=>tsunamiCase(),
      openTsunami,
      state:()=>({ open:opened, epi:epi?epi.slice():null, clickMode, depthKm, mw, tSec, speed, scale, stressDropMPa, siteId, siteAmp:siteAmp(),
        Q0:QS0, Qeta:QETA, opacity:fldOpacity, fieldStale:fldStale, fieldPct:fldPct,   /* (#R190) */
        tsunami:(()=>{ const t=tsunamiCase(); return t?{waveM:t.waveM,mw:+t.M.toFixed(2)}:null; })(),
        fault:faultGeom(),
        field:(fld&&fld.stats)?fld.stats:null, fieldBusy:fldBusy,
        /* (#R191) the terrain-free annulus that carries the lowest class to its end */
        far:fldFar?{ N:fldFar.N, painted:fldFar.painted, extrapolated:fldFar.extrap, sea:fldFar.sea, landMask:fldFar.landMask, landSource:fldFar.landSource, landCellKm:fldFar.landCellKm, rFineKm:fldFar.rFineKm, rEdgeKm:fldFar.rEdgeKm }:null,
        scaleSet, terrainKm:MMI_TERRAIN_KM, maxKm:MMI_MAX_KM,
        stations:stations.length, mmiRings:mmiRings().map(r=>({I:r.I,km:Math.round(r.km)})) }) };
  })();
};
