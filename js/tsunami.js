/* ============================================================================
 *  IntMap · TSUNAMI PROPAGATION — window.IntMapTsunami  (#R192, rebuilt #R193)
 * ----------------------------------------------------------------------------
 *  「津波が発生するとされるような地震だった場合、波の伝播のわかるアニメーション津波シミュレーターも
 *    使えるように。（追記：まったくのごみ。徹底的に作り直せ。）」
 *
 *  #R192 solved the right equations and then made them impossible to watch. Measured on the shipped
 *  module, Tōhoku M9.1 / 6 h:
 *
 *      build      9.5 s wall, 6.6 s of it BLOCKING the page (worst single task 900 ms)
 *      playback   9.3 fps, and two of seventy-four frames in eight seconds — five minutes to watch
 *                 the wave cross the Pacific once
 *      picture    a near-white wash at 12 % alpha over a light basemap: the wave was not visible
 *      panel      --popup-bg, which #R189 had already established is translucent with no
 *                 backdrop-filter, so the sidebar's text read straight through it
 *
 *  Three causes, all in the delivery:
 *
 *   1. the solver ran on the page, yielding once every eighth stored frame;
 *   2. playback re-encoded a 320² canvas to a PNG DATA URL and replaced a whole image source on
 *      EVERY animation frame, while the frame index advanced by 0.003 per frame;
 *   3. the colour ramp started at white and 30/255 alpha, so a far-field wave was indistinguishable
 *      from haze.
 *
 *  So: (1) the solve is in src/tsunami-worker.js and streams frames back as they are produced —
 *  nothing on this thread ever blocks and the animation is watchable within about a second of
 *  pressing the button; (2) the field is painted through the engine's DYNAMIC IMAGE primitive
 *  (#R193, js/geo-engine.js) — a canvas the renderer uploads as a texture, no encoder in the path —
 *  and playback INTERPOLATES between stored frames, so it is smooth at any speed rather than a
 *  slideshow; (3) the ramp is diverging, saturated, transparent only at true zero, and scaled to a
 *  chosen sea-surface amplitude rather than to the source, which is what makes the far field visible.
 *
 *  ── THE PHYSICS ─────────────────────────────────────────────────────────────────────────────────
 *  Shallow-water long waves on a spherical Arakawa C-grid with TOTAL-DEPTH pressure and Manning
 *  bottom friction — see the header of src/tsunami-worker.js, which is where the equations and the
 *  two deliberate omissions (advection, Kajiura) are argued.
 *
 *  The initial sea surface is the co-seismic sea-floor displacement: OKADA (1985) — verified against
 *  the published test case in #R192 and unchanged here, including the note that its `arctan` is the
 *  PRINCIPAL value and not `atan2` — now summed over a TAPERED SUB-FAULT GRID rather than one
 *  uniform-slip rectangle. Real ruptures do not slip uniformly to a hard edge; a raised taper over
 *  8 × 3 sub-faults, normalised so the seismic moment is exactly the one the magnitude implies, gives
 *  the peaked uplift and the smooth edges an inversion recovers, at a cost that is invisible because
 * the field is only evaluated where Okada is not already zero (see nearM in build()).
 *
 *  Fault size and mean slip: Wells & Coppersmith (1994), reverse faulting. Strike: read off the sea
 *  floor, because a subduction interface follows the isobaths.
 *
 *  ── WHAT IT STILL DOES NOT DO ───────────────────────────────────────────────────────────────────
 *  Cells are twenty-odd kilometres, so this is an OPEN-OCEAN model: arrival times and deep-water
 *  amplitude are meaningful, a harbour is not. Coastal height is a Green's-law estimate taken only
 *  from cells deeper than 200 m, where the linear solution it shoals is still valid. The last
 *  kilometre is one button away, in the inundation model that can resolve it.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.tsunami=function(HOST){
  const GE=()=>window.IntMapGeoEngine;
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const makeDraggable=HOST.makeDraggable;
  const warmDEMTiles=HOST.warmDEMTiles, demSnapshot=HOST.demSnapshot, isMobile=HOST.isMobile;

  window.IntMapTsunami=(function(){
    if(!GE().hasRenderer()) return { open(){}, close(){}, state:()=>({open:false}) };
    const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
    const D=Math.PI/180, RE=6371000;
    const DYN='tsu-field', SRC_V='tsu-vec', LYR_EPI='tsu-epi', SRC_ISO='tsu-iso', LYR_ISO='tsu-iso-ln', LYR_ISOL='tsu-iso-lb';

    /* ---- state ---------------------------------------------------------------------------------- */
    let panel=null, opened=false, epi=null, mw=8.5, depthKm=20;
    let sim=null;                       /* the built model */
    let busy=false, pct=0, seq=0, jobId=0;
    let tSim=0, playing=0, rafId=0, speed=180;    /* speed = simulated seconds per real second */
    let hours=6, opacity=0.9, showMax=false, showIso=true;
    let dispAmp=null;                   /* metres at which the ramp saturates; null = automatic */
    let lastErr=null, probe=null;

    /* ══ OKADA (1985) — the vertical surface displacement of one rectangular dislocation ═══════════
       Unchanged from #R192, which verified it against the published test case (L=3, W=2, d=4,
       δ=70°, observation (2,3): dip-slip uz = −3.5639e−2 against the published −3.564e−2).
       ⚠ arctan OF A RATIO, not atan2 — see the note inside. */
    function okadaUz(x,y,depth,L2,W2,dipDeg,slip){
      const dip=dipDeg*D, sd=Math.sin(dip), cd=Math.cos(dip);
      const cdS=(Math.abs(cd)<1e-6)?1e-6:cd;                 /* vertical faults are a limit, not a case */
      const p=y*cd+depth*sd;
      const f=(xi,eta)=>{
        const q=y*sd-depth*cd;
        const R=Math.sqrt(xi*xi+eta*eta+q*q); if(!(R>0)) return 0;
        const dt=eta*sd-q*cd;
        const X=Math.sqrt(xi*xi+q*q);
        /* ⚠ PRINCIPAL value. The two-argument form adds ±π wherever the numerator and denominator
           change sign, and the Chinnery difference then keeps that jump as a plateau: measured
           before #R192 fixed it, a constant −5.14 m of "subsidence" 400 km behind the fault, which
           is exactly slip·sinδ. Deformation must decay to zero away from a finite source. */
        const den=xi*(R+X)*cdS;
        const I5=(Math.abs(cd)<1e-6)?(-0.5*xi*q/Math.pow(R+dt,2))
          :((Math.abs(den)<1e-12)?0:(0.5*(2/cdS)*Math.atan((eta*(X+q*cdS)+X*(R+X)*sd)/den)));
        const t1=(R+xi)!==0?dt*q/(R*(R+xi)):0;
        const t2=sd*((Math.abs(q*R)>1e-12)?Math.atan(xi*eta/(q*R)):0);
        return t1+t2-I5*sd*cdS;
      };
      const v=f(x,p)-f(x,p-W2)-f(x-L2,p)+f(x-L2,p-W2);
      return -(slip/(2*Math.PI))*v;
    }

    /* Wells & Coppersmith (1994), reverse faulting: subsurface rupture length and down-dip width from
       the moment magnitude, and the average slip that carries the moment over that area. */
    function faultGeom(M){
      const Lk=Math.pow(10,0.58*M-2.42), Wk=Math.min(Lk,Math.pow(10,0.41*M-1.61));
      const M0=Math.pow(10,1.5*M+9.1), MU=3.0e10;
      const slip=M0/(MU*Lk*1000*Wk*1000);
      return { L:Lk*1000, W:Wk*1000, slip, M0 };
    }

    /* ══ (#R193) THE SOURCE IS A TAPERED SUB-FAULT GRID, NOT ONE RECTANGLE ═════════════════════════
       A uniform-slip rectangle puts the same displacement everywhere and steps to zero at the edge.
       Real ruptures taper. Splitting the plane into NS × NW sub-faults, weighting each by a raised
       taper along strike and down dip, and RE-NORMALISING so Σ(slip·area) is exactly M0/μ, keeps the
       magnitude honest while giving the peaked centre and the soft edges an inversion recovers.
       Evaluated only within six rupture lengths of the epicentre, where Okada is not already zero. */
    const SUB_S=8, SUB_W=3;
    function taper(s){ return Math.sqrt(Math.sin(Math.PI*Math.max(0.001,Math.min(0.999,s)))); }
    function subFaults(g,dipDeg,topDepth){
      const out=[]; const dl=g.L/SUB_S, dw=g.W/SUB_W;
      let wsum=0; const wts=[];
      for(let a=0;a<SUB_S;a++) for(let b=0;b<SUB_W;b++){
        const w=taper((a+0.5)/SUB_S)*taper((b+0.5)/SUB_W); wts.push(w); wsum+=w;
      }
      const norm=(SUB_S*SUB_W)/Math.max(1e-9,wsum);     /* mean weight → 1, so ΣM0 is preserved */
      let k=0;
      for(let a=0;a<SUB_S;a++) for(let b=0;b<SUB_W;b++){
        /* okadaUz measures x along strike from the plane's near edge and y from the plane's LOWER
           edge, with `depth` the depth of that lower edge. So each sub-fault has to be expressed the
           same way, about ITS OWN lower edge:
             x0 — along-strike offset of this strip's near edge  = a·dl
             y0 — horizontal offset of this strip's lower edge, measured UP-DIP from the plane's
                  lower edge = (W − (b+1)·dw)·cos δ
             d0 — the depth of this strip's lower edge = topDepth + (b+1)·dw·sin δ
           ⚠ y0 was `b·dw·cos δ` when this was written, which is the same expression counted from the
             wrong end: the strips came out MIRRORED down dip, so the deep low-slip strip sat where
             the shallow high-slip one belongs. Measured on Tōhoku, that alone drove the subsidence
             lobe from −3.5 m to −6.2 m and spread the initial field far too wide. Both forms reduce
             to the correct single rectangle when SUB_W is 1, which is exactly why it survived the
             first look. */
        out.push({ x0:a*dl, y0:(g.W-(b+1)*dw)*Math.cos(dipDeg*D), d0:topDepth+(b+1)*dw*Math.sin(dipDeg*D),
                   L:dl, W:dw, slip:g.slip*wts[k++]*norm });
      }
      return out;
    }

    /* ---- building the model ---------------------------------------------------------------------- */
    /* The grid: finer than #R192's 320² on both classes of device, because the solve no longer runs
       on the page and can afford it. 512² over a Pacific-wide box is ~22 km a cell. */
    function gridN(){ return (typeof isMobile==='function'&&isMobile())?256:512; }
    function wantFrames(){ return (typeof isMobile==='function'&&isMobile())?90:140; }

    const wrapLng=(v)=>((v+540)%360)-180;
    function depthAt(snap,lo,la){ let e=null; try{ e=snap.at(lo,Math.max(-84,Math.min(84,la))); }catch(_){}
      return (e==null)?0:-e; }
    const yieldFrame=()=>new Promise(r=>setTimeout(r,0));

    async function build(){
      if(!epi){ lastErr='no epicentre'; render(); return; }
      const my=++seq; busy=true; pct=0; lastErr=null; probe=null; sim=null; tSim=0; playing=0;
      clearPaint(); render();
      const t0=performance.now();
      try{
        const N=gridN(), H=Math.max(1,Math.min(24,hours));
        const reachKm=Math.min(9000, 0.33*3600*H);          /* 330 m/s ceiling, in km over the run */
        const halfLat=Math.min(52, reachKm/111.32);
        const lat0=epi[1], lng0=epi[0];
        /* keep the box off the pole: a lat/lon cell there is a sliver and the CFL step collapses */
        const nLat=Math.min(78, lat0+halfLat), sLat=Math.max(-78, lat0-halfLat);
        const midLat=(nLat+sLat)/2, cosMid=Math.max(0.22,Math.cos(midLat*D));
        const halfLng=Math.min(170, halfLat/cosMid);
        const wLng=lng0-halfLng, eLng=lng0+halfLng;
        const dPhi=(nLat-sLat)/N*D, dLam=(2*halfLng)/N*D;

        /* ── the sea floor ───────────────────────────────────────────────────────────────────────
           ONE DEM zoom for the whole domain, chosen so the tile count stays inside a budget rather
           than by a constant: an ocean-wide box at z5 is 160 tiles and, measured in #R192, 34 of them
           did not arrive inside the timeout — 19 % of the cells then ran on a fallback depth. */
        let z=6;
        const tilesAt=(zz)=>{ const n=Math.pow(2,zz);
          return Math.ceil(n*(2*halfLng)/360+1)*Math.ceil(n*(nLat-sLat)/170+1); };
        while(z>3&&tilesAt(z)>90) z--;
        const warm=[]; const S=Math.min(64,N);
        for(let j=0;j<=S;j++) for(let i=0;i<=S;i++)
          warm.push([wrapLng(wLng+(2*halfLng)*i/S), sLat+(nLat-sLat)*j/S]);
        await warmDEMTiles(warm,z,25000,(f)=>{ pct=Math.round(22*(+f||0)); if(opened) render(); });
        if(my!==seq) return;
        /* ⚠ THE BOX CROSSES THE ANTIMERIDIAN (#R192). A Pacific-wide domain from Japan runs to 208°E
           and demSnapshot clamps to ±179.999, so every cell east of the date line came back with no
           depth: 19,840 of 102,400 cells, the entire eastern Pacific. Two snapshots, one either side. */
        const snapA=demSnapshot(Math.max(-180,wrapLng(wLng)),sLat,(eLng>180?179.999:wrapLng(eLng)),nLat,z);
        const snapB=(eLng>180)?demSnapshot(-180,sLat,wrapLng(eLng),nLat,z)
                  :((wLng<-180)?demSnapshot(wrapLng(wLng),sLat,180,nLat,z):null);
        const snap={ have:snapA.have+(snapB?snapB.have:0), missing:snapA.missing+(snapB?snapB.missing:0),
          at(lo,la){ const x=wrapLng(lo); let v=snapA.at(x,la); if(v==null&&snapB) v=snapB.at(x,la); return v; } };
        pct=24; render();

        const h=new Float32Array(N*N);           /* still-water depth, m (>0 = sea) */
        /* ⚠ h.buffer is TRANSFERRED to the worker and is detached the moment it is posted, so the two
           things this thread still needs from it are copied out first: the land mask the painter
           tests every pixel against, and the depth Green's law shoals from. Int16 metres is exact
           over the whole range of the ocean (−11,000 … 0) and costs 512 KB rather than a megabyte. */
        const land=new Uint8Array(N*N), depth=new Int16Array(N*N);
        const latOf=(j)=>sLat+(j+0.5)*(nLat-sLat)/N;
        const lngOf=(i)=>wLng+(i+0.5)*(2*halfLng)/N;
        let seaCells=0, noData=0;
        const LM=window.IntMapLandMask;
        for(let j=0;j<N;j++){
          for(let i=0;i<N;i++){
            const la=latOf(j), lo=lngOf(i);
            let e=null; try{ e=snap.at(lo,la); }catch(_){}
            if(e==null){ noData++;
              /* the bundled mask still knows land from sea; an unknown DEPTH over known sea gets the
                 ocean's own mean, which is the honest stand-in for "sea, depth unmeasured" */
              const isL=LM&&LM.ready()?LM.isLand(lo,la):null;
              e=(isL===false)?-3800:(isL===true?10:-3800);
            }
            const d=-e;
            const k=j*N+i;
            h[k]=(d>10)?d:0;                     /* under 10 m is coast: a wall for this grid */
            depth[k]=Math.max(0,Math.min(32000,Math.round(h[k])));
            if(h[k]>0){ seaCells++; } else land[k]=1;
          }
          /* the bathymetry pass is O(N²) bilinear reads — yielded by rows so a 512² grid never
             holds the page for a frame (#R193's whole point) */
          if((j&7)===7){ pct=24+Math.round(10*j/N); if(opened) render(); await yieldFrame(); if(my!==seq) return; }
        }
        if(!(seaCells>N*N*0.02)){ lastErr='land'; busy=false; render(); return; }

        /* ── the initial sea surface ─────────────────────────────────────────────────────────────
           Okada over a tapered sub-fault grid, with the strike taken from the sea floor: a
           subduction interface runs along the isobaths, so ∇h gives the down-dip direction. */
        const g=faultGeom(mw);
        const eps=0.6;                                   /* degrees, for the gradient stencil */
        const dHx=(depthAt(snap,lng0+eps,lat0)-depthAt(snap,lng0-eps,lat0));
        const dHy=(depthAt(snap,lng0,lat0+eps)-depthAt(snap,lng0,lat0-eps));
        /* down-dip points towards DEEPER water (the trench); strike is 90° from it */
        let dipAz=Math.atan2(dHx,dHy)/D; if(!isFinite(dipAz)) dipAz=90;
        const strike=(dipAz+90+360)%360;
        const dipDeg=15;                                 /* a subduction interface at tsunami depths */
        const eta0=new Float32Array(N*N);
        const topDepth=Math.max(2000, depthKm*1000-g.W*Math.sin(dipDeg*D)/2);
        const botDepth=topDepth+g.W*Math.sin(dipDeg*D);   /* the depth of the plane’s lower edge — the frame okadaUz works in */
        const subs=subFaults(g,dipDeg,topDepth);
        const sA=Math.sin(strike*D), cA=Math.cos(strike*D);
        const mPerLat=111320, mPerLngAt=(la)=>111320*Math.cos(la*D);
        let upMax=0, downMax=0;
        /* ══ (#R193) WHERE THE SOURCE STOPS, AND WHY IT MAY NOT STOP ABRUPTLY ═════════════════════
           ⚠ MEASURED THE HARD WAY. The sub-fault sum is 24 Okada evaluations a cell, so #R192's
           window of SIX rupture lengths — 4,326 km each way for an M9, 141,000 cells — became 13.5
           million evaluations and a 3.6 s task on this thread. Narrowing it to 2.2 L looked obviously
           right and was obviously wrong: at 1,586 km an M9's static field is still ~1 cm, so cutting
           there left a STEP in the initial sea surface, and a step is broadband. It radiated a sharp
           front at √(gh) that tripped the 1 cm arrival threshold long before the real long-period wave
           built up — the modelled first arrival at Guam fell from 3 h 11 to 1 h 51 against an observed
           3–4 h, and the segment speeds along the path matched √(gh) exactly, which is the signature
           of a front launched from the cut rather than from the fault.

           So the window is wide again, and the COST is dealt with where it actually lives. Past about
           two rupture lengths the static field of a finite source depends only on its moment, not on
           how the slip is distributed inside it — so out there one equivalent rectangle carrying the
           same M0 gives the same answer as twenty-four tapered strips, for a twenty-fourth of the
           arithmetic. The two forms are blended across a band so nothing is discontinuous anywhere,
           which is the property the whole problem turned on. */
        const nearM=2.2*g.L, farM=Math.max(6*g.L, 2500e3);
        const blend0=nearM, blend1=2.6*g.L;
        const cosW=(g.W*Math.cos(dipDeg*D))/2;
        const one=(xs,ys)=>okadaUz(xs+g.L/2, ys+cosW, botDepth, g.L, g.W, dipDeg, g.slip);
        const many=(xs,ys)=>{ let u=0;
          for(let s2=0;s2<subs.length;s2++){ const f=subs[s2];
            const v=okadaUz(xs+g.L/2-f.x0, ys+cosW-f.y0, f.d0, f.L, f.W, dipDeg, f.slip);
            if(isFinite(v)) u+=v; }
          return u; };
        for(let j=0;j<N;j++){ const la=latOf(j);
          for(let i=0;i<N;i++){
            const lo=lngOf(i);
            const dx=((lo-lng0+540)%360-180)*mPerLngAt(la), dy=(la-lat0)*mPerLat;
            const r=Math.max(Math.abs(dx),Math.abs(dy));
            if(r>farM) continue;                       /* genuinely below a millimetre out here */
            /* rotate into the fault frame: x along strike, y up-dip horizontally */
            const xs= dx*sA+dy*cA;
            const ys=-dx*cA+dy*sA;
            let uz;
            if(r<=blend0) uz=many(xs,ys);
            else if(r>=blend1) uz=one(xs,ys);
            else { const w=(r-blend0)/(blend1-blend0); uz=(1-w)*many(xs,ys)+w*one(xs,ys); }
            if(!isFinite(uz)) continue;
            eta0[j*N+i]=uz;
            if(uz>upMax) upMax=uz; if(uz<downMax) downMax=uz;
          }
          if((j&7)===7){ pct=34+Math.round(8*j/N); if(opened) render(); await yieldFrame(); if(my!==seq) return; }
        }
        pct=42; render();

        /* ── the run, in a worker ────────────────────────────────────────────────────────────────
           Frames arrive in batches while it integrates, so the wave is on screen and playable long
           before the last time step. The page never blocks. */
        const geom={ N, wLng, eLng, sLat, nLat, dLam, dPhi, hours:H, frames:wantFrames(),
                     cellKm:Math.round(RE*Math.cos(midLat*D)*dLam/1000) };
        sim={ N, wLng, eLng, sLat, nLat, land, depth, frames:[], nFrames:0, total:H*3600, amp:1,
              fault:g, strike, dipDeg, z, eta0Up:upMax, eta0Down:downMax,
              demTiles:snap.have, demMissing:snap.missing, noData, seaCells, cellKm:geom.cellKm,
              latOf, lngOf, running:true, emax:null, tarr:null, coastMax:0, coastAt:null };
        installPaint();

        const W=window.IntMapTsunamiWorker;
        const onFrames=(fr,nf)=>{
          if(my!==seq||!sim) return;
          sim.nFrames=nf||sim.nFrames;
          for(const f of fr) sim.frames.push({ t:f.t, q:f.q });
          if(sim.frames.length===fr.length){ tSim=0; buildLUT(); paint(); }
          render();
        };
        const onProg=(p)=>{ if(my!==seq) return; pct=42+Math.round(56*(p/100)); if(opened) render(); };

        let out=null;
        if(W&&W.available()){
          const job=W.run(Object.assign({},geom,{ h:h.buffer, eta0:eta0.buffer }),onFrames,onProg);
          if(job){ jobId=job.id; out=await job.promise; }
        }
        if(!out&&my===seq){
          /* no worker (or it died): the model is still owed. Say so rather than pretending. */
          if(!sim.frames.length){ lastErr='noworker'; busy=false; sim=null; clearPaint(); render(); return; }
        }
        if(my!==seq) return;
        if(out){
          sim.amp=out.amp; sim.dt=out.dt; sim.steps=out.steps; sim.total=out.total; sim.nFrames=out.nFrames;
          sim.emax=new Float32Array(out.emax); sim.emin=new Float32Array(out.emin);
          sim.tarr=new Float32Array(out.tarr); sim.cMax=out.cMax; sim.solveMs=out.ms;
          coastal();
          autoAmp();
          buildLUT();
          isochrones();
        }
        sim.running=false; sim.ms=Math.round(performance.now()-t0);
        pct=100; busy=false;
        paint(); render(); frameCamera();
      }catch(e){ lastErr=String(e&&e.message||e); busy=false; render(); }
    }

    /* The coast, as this grid can see it: a sea cell within two cells of a wall, shoaled from its own
       depth to 10 m by Green's law (η ∝ h^(−1/4)).
       ⚠ ONLY FROM CELLS WHERE THE LINEAR THEORY STILL HOLDS (#R192): the first version took the
       shallowest cell it could find, where η/h was already 0.16, and reported 27 m off Sanriku — the
       model's own arithmetic run past its validity, not a forecast. */
    function coastal(){
      if(!sim||!sim.emax) return;
      const N=sim.N, land=sim.land, emax=sim.emax;
      let best=0, at=null;
      const nearLand=(i,j)=>{ for(let dj=-2;dj<=2;dj++) for(let di=-2;di<=2;di++){
          const jj=j+dj, ii=i+di; if(jj<0||ii<0||jj>=N||ii>=N) continue;
          if(land[jj*N+ii]) return true; } return false; };
      for(let j=1;j<N-1;j++) for(let i=1;i<N-1;i++){
        const k=j*N+i; if(land[k]) continue;
        const d=sim.depth[k];
        if(d<200) continue;
        if(!nearLand(i,j)) continue;
        const v=emax[k]*Math.pow(d/10,0.25);
        if(v>best){ best=v; at=[sim.lngOf(i),sim.latOf(j)]; }
      }
      sim.coastMax=best; sim.coastAt=at;
    }
    /* The ramp saturates at the 92nd percentile of the maximum-crest field over the sea, not at the
       source. Scaling to the source is what made #R192 invisible: a 6 m uplift beside a 20 cm wave in
       mid-ocean puts the whole far field in the bottom 3 % of the ramp. */
    function autoAmp(){
      if(!sim||!sim.emax) return;
      const v=[]; const emax=sim.emax, land=sim.land;
      for(let k=0;k<emax.length;k+=3){ if(land[k]) continue; const a=emax[k]; if(a>0.001) v.push(a); }
      if(!v.length) return;
      v.sort((a,b)=>a-b);
      sim.autoAmp=Math.max(0.05,v[Math.floor(v.length*0.92)]);
    }
    function ampNow(){ return dispAmp||((sim&&sim.autoAmp)||(sim?Math.max(0.05,sim.amp/25):1)); }

    /* ---- the picture ----------------------------------------------------------------------------- */
    /* The frames are companded (see the worker): q = sign(η)·127·(|η|/A)^(1/3). The display transform
       is a CUBE ROOT of η/S, so in companded space it is exactly a linear gain k = cbrt(A/S) — which
       is why the whole ramp is one 255-entry lookup table and a pixel costs an index and four writes.
       Rebuilt only when the amplitude or the palette changes. */
    let LUT=null, lutKey='';
    function buildLUT(){
      if(!sim) return;
      const S=ampNow(), k=Math.cbrt(Math.max(1e-6,sim.amp)/Math.max(1e-6,S));
      const key=S.toFixed(4)+'/'+sim.amp.toFixed(4);
      if(lutKey===key&&LUT) return; lutKey=key;
      LUT=new Uint8Array(256*4);
      for(let q=-127;q<=127;q++){
        let x=q*k/127; if(x>1) x=1; if(x<-1) x=-1;
        const a=Math.abs(x);
        /* alpha rises fast so a centimetre-scale far-field wave is still a wave, and is exactly zero
           at zero so the ocean underneath is never hazed over */
        const A8=Math.round(255*Math.pow(a,0.62)*0.94);
        let r,g,b;
        if(x>=0){ /* crest: warm — sand → amber → red */
          r=255; g=Math.round(232-186*a); b=Math.round(150-140*a);
        } else {  /* trough: cool — pale cyan → blue */
          r=Math.round(150-140*a); g=Math.round(226-150*a); b=255;
        }
        const o=(q+128)*4;
        LUT[o]=r; LUT[o+1]=g; LUT[o+2]=b; LUT[o+3]=A8;
      }
    }

    /* Where we are in the frame list, as a real number, so the picture can be interpolated. */
    function framePos(){
      if(!sim||!sim.frames.length) return 0;
      const last=sim.frames[sim.frames.length-1].t;
      const t=Math.max(0,Math.min(last,tSim));
      /* frames are evenly spaced in time by construction; bisect anyway so a changed cadence is safe */
      let lo=0, hi=sim.frames.length-1;
      while(lo<hi-1){ const mid=(lo+hi)>>1; if(sim.frames[mid].t<=t) lo=mid; else hi=mid; }
      const a=sim.frames[lo].t, b=sim.frames[hi].t;
      return lo+((b>a)?(t-a)/(b-a):0);
    }

    /* The draw callback the engine calls (js/geo-engine.js addDynamicImage). N² pixels, one LUT
       lookup each; measured at ~2 ms for 512². Interpolation happens in COMPANDED space, which is
       monotone in η and is the same curve the ramp uses — so a blended pixel lands where the eye
       expects it, and the error against blending metres is under one ramp step. */
    function drawField(ctx,W2,H2){
      if(!sim) return;
      const N=sim.N;
      const im=ctx.createImageData(N,N), px=im.data;
      const land=sim.land;
      if(showMax&&sim.emax){
        /* ⚠ COMPAND IT THE WAY THE FRAMES ARE COMPANDED, against the run's peak A — not against the
           display amplitude. The lookup table already carries the display gain cbrt(A/S), so scaling
           by S here as well would apply it twice and blow the whole field out (measured: a factor of
           two on a Tōhoku run, where A/S is 8.5). One transform, in one place. */
        const A=Math.max(1e-6,sim.amp), emax=sim.emax;
        for(let j=0;j<N;j++){ const src=j*N, dst=(N-1-j)*N;
          for(let i=0;i<N;i++){
            const k=src+i; if(land[k]) continue;
            const a=emax[k]/A;
            if(!(a>0)) continue;
            let x=Math.cbrt(a>1?1:a);
            const q=Math.round(x*127), o=(dst+i)*4, li=(q+128)*4;
            px[o]=LUT[li]; px[o+1]=LUT[li+1]; px[o+2]=LUT[li+2]; px[o+3]=LUT[li+3];
          } }
        ctx.putImageData(im,0,0); return;
      }
      if(!sim.frames.length){ ctx.clearRect(0,0,N,N); return; }
      const f=framePos(), i0=Math.floor(f), w=f-i0;
      const A0=sim.frames[Math.min(i0,sim.frames.length-1)].q;
      const A1=sim.frames[Math.min(i0+1,sim.frames.length-1)].q;
      for(let j=0;j<N;j++){ const src=j*N, dst=(N-1-j)*N;      /* the image runs north→south */
        for(let i=0;i<N;i++){
          const k=src+i; if(land[k]) continue;
          const q=(A0[k]+(A1[k]-A0[k])*w)|0;
          if(q===0) continue;
          const o=(dst+i)*4, li=(q+128)*4;
          const a=LUT[li+3]; if(!a) continue;
          px[o]=LUT[li]; px[o+1]=LUT[li+1]; px[o+2]=LUT[li+2]; px[o+3]=a;
        } }
      ctx.putImageData(im,0,0);
    }

    function coords(){ return sim?[[sim.wLng,sim.nLat],[sim.eLng,sim.nLat],[sim.eLng,sim.sLat],[sim.wLng,sim.sLat]]:null; }
    function installPaint(){
      if(!sim||!_imCanDraw()) return false;
      buildLUT();
      try{
        GE().layers.addDynamicImage(DYN,{ width:sim.N, height:sim.N, coordinates:coords(),
          opacity, draw:drawField, smooth:true });
        if(!GE().layers.hasSource(SRC_V)) GE().layers.addSource(SRC_V,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.has(LYR_EPI)) GE().layers.add({id:LYR_EPI,type:'circle',source:SRC_V,
          paint:{'circle-radius':6,'circle-color':'#ffd23f','circle-stroke-color':'#1a1a1a','circle-stroke-width':1.6}});
        GE().layers.setSourceData(SRC_V,{type:'FeatureCollection',features:epi?[{type:'Feature',
          geometry:{type:'Point',coordinates:epi},properties:{}}]:[]});
      }catch(_){ return false; }
      return true;
    }
    function paint(){ try{ if(sim) GE().layers.touchDynamicImage(DYN); }catch(_){} }
    function clearPaint(){
      try{ GE().layers.removeDynamicImage(DYN); }catch(_){}
      try{ if(GE().layers.has(LYR_ISOL)) GE().layers.remove(LYR_ISOL); }catch(_){}
      try{ if(GE().layers.has(LYR_ISO)) GE().layers.remove(LYR_ISO); }catch(_){}
      try{ if(GE().layers.hasSource(SRC_ISO)) GE().layers.removeSource(SRC_ISO); }catch(_){}
      try{ if(GE().layers.has(LYR_EPI)) GE().layers.remove(LYR_EPI); }catch(_){}
      try{ if(GE().layers.hasSource(SRC_V)) GE().layers.removeSource(SRC_V); }catch(_){}
    }

    /* ══ (#R193) TRAVEL-TIME ISOCHRONES ═══════════════════════════════════════════════════════════
       The one thing every published tsunami chart carries and this panel did not: the hour lines. The
       arrival field is already computed cell by cell in the solver, so the contours are marching
       squares over it — one line per hour, labelled. They are what turns "a wave is moving" into
       "it reaches you at 04:20". */
    function isochrones(){
      if(!sim||!sim.tarr) return;
      const N=sim.N, tarr=sim.tarr, land=sim.land;
      /* ⚠ ONE PASS OVER THE GRID, NOT ONE PER HOUR. The obvious shape — a marching-squares sweep per
         contour level — walked 512² cells twenty-four times through four closure calls each, and
         measured as a 2.6 s task on this thread, which is precisely the kind of freeze this rebuild
         exists to remove. A cell can only cross the levels between its own corner minimum and
         maximum, which for a travel-time field is almost always none or one, so the levels are tested
         INSIDE a single sweep and the arrays are read directly. */
      const HRS=Math.min(24,Math.ceil(sim.total/3600));
      const segsBy=[]; for(let hh=0;hh<=HRS;hh++) segsBy.push([]);
      const lngOf=sim.lngOf, latOf=sim.latOf;
      for(let j=0;j<N-1;j++){
        const r0=j*N, r1=r0+N;
        const yA=latOf(j), yB=latOf(j+1);
        for(let i=0;i<N-1;i++){
          const k00=r0+i, k10=k00+1, k01=r1+i, k11=k01+1;
          if(land[k00]|land[k10]|land[k01]|land[k11]) continue;
          const v00=tarr[k00], v10=tarr[k10], v01=tarr[k01], v11=tarr[k11];
          if(v00<0||v10<0||v01<0||v11<0) continue;
          let lo=v00, hi=v00;
          if(v10<lo) lo=v10; else if(v10>hi) hi=v10;
          if(v01<lo) lo=v01; else if(v01>hi) hi=v01;
          if(v11<lo) lo=v11; else if(v11>hi) hi=v11;
          const h0=Math.floor(lo/3600)+1, h1=Math.ceil(hi/3600)-1;
          if(h1<h0) continue;
          const xA=lngOf(i), xB=lngOf(i+1);
          for(let hh=Math.max(1,h0);hh<=Math.min(HRS,h1+1);hh++){
            const lv=hh*3600;
            let idx=0; if(v00>lv) idx|=1; if(v10>lv) idx|=2; if(v11>lv) idx|=4; if(v01>lv) idx|=8;
            if(idx===0||idx===15) continue;
            const eB=()=>{ const t=(lv-v00)/((v10-v00)||1); return [xA+(xB-xA)*t,yA]; };
            const eT=()=>{ const t=(lv-v01)/((v11-v01)||1); return [xA+(xB-xA)*t,yB]; };
            const eL=()=>{ const t=(lv-v00)/((v01-v00)||1); return [xA,yA+(yB-yA)*t]; };
            const eR=()=>{ const t=(lv-v10)/((v11-v10)||1); return [xB,yA+(yB-yA)*t]; };
            const S=segsBy[hh];
            switch(idx){
              case 1: case 14: S.push([eL(),eB()]); break;
              case 2: case 13: S.push([eB(),eR()]); break;
              case 3: case 12: S.push([eL(),eR()]); break;
              case 4: case 11: S.push([eR(),eT()]); break;
              case 6: case 9:  S.push([eB(),eT()]); break;
              case 7: case 8:  S.push([eL(),eT()]); break;
              case 5: S.push([eL(),eB()]); S.push([eR(),eT()]); break;
              case 10: S.push([eL(),eT()]); S.push([eB(),eR()]); break;
            }
          }
        }
      }
      const feats=[];
      for(let hh=1;hh<=HRS;hh++){ const segs=segsBy[hh]; if(!segs.length) continue;
        feats.push({ type:'Feature', properties:{ h:hh, label:hh+' h' },
          geometry:{ type:'MultiLineString', coordinates:segs } }); }
      try{
        if(!GE().layers.hasSource(SRC_ISO)) GE().layers.addSource(SRC_ISO,{type:'geojson',data:{type:'FeatureCollection',features:feats}});
        else GE().layers.setSourceData(SRC_ISO,{type:'FeatureCollection',features:feats});
        if(!GE().layers.has(LYR_ISO)) GE().layers.add({id:LYR_ISO,type:'line',source:SRC_ISO,
          layout:{visibility:showIso?'visible':'none','line-join':'round'},
          paint:{'line-color':'rgba(255,255,255,0.85)','line-width':1.1,'line-dasharray':[3,2]}});
        if(!GE().layers.has(LYR_ISOL)) GE().layers.add({id:LYR_ISOL,type:'symbol',source:SRC_ISO,
          layout:{visibility:showIso?'visible':'none','symbol-placement':'line','text-field':['get','label'],
                  'text-size':11,'text-font':['literal',['Noto Sans Regular']]},
          paint:{'text-color':'#ffffff','text-halo-color':'rgba(0,0,0,0.75)','text-halo-width':1.3}});
      }catch(_){}
    }
    function applyIso(){ try{
      if(GE().layers.has(LYR_ISO)) GE().layers.setLayout(LYR_ISO,'visibility',showIso?'visible':'none');
      if(GE().layers.has(LYR_ISOL)) GE().layers.setLayout(LYR_ISOL,'visibility',showIso?'visible':'none');
    }catch(_){} }

    /* …and look at it. A wave crossing the Pacific is not visible from whatever view the app happens
       to be on (measured in #R192: the model built correctly and the screenshot showed Africa). */
    function frameCamera(){
      if(!sim||!epi) return;
      try{ GE().camera.jumpTo({ center:[wrapLng(epi[0]), Math.max(-60,Math.min(60,epi[1]))],
        zoom:Math.max(1.2,Math.min(4, Math.log2(360/(sim.eLng-sim.wLng))+0.6)), pitch:0 }); }catch(_){}
    }

    /* ---- playback -------------------------------------------------------------------------------- */
    /* tSim is SIMULATED SECONDS, advanced by wall-clock × speed, and the picture is interpolated to
       it. #R192 advanced a frame INDEX by 0.003 per animation frame and repainted anyway; this
       repaints a frame that has actually changed and is smooth at every speed. */
    let lastTick=0;
    function tick(){
      rafId=0; if(!playing||!sim) return;
      const now=(typeof performance!=='undefined')?performance.now():Date.now();
      /* the clamp only exists to stop a backgrounded tab from jumping hours on its first frame */
      const dtReal=Math.min(0.6,(now-lastTick)/1000); lastTick=now;
      tSim+=speed*dtReal;
      const end=sim.frames.length?sim.frames[sim.frames.length-1].t:0;
      if(tSim>=end){ tSim=end; if(!sim.running) playing=0; }
      paint(); renderClock();
      if(playing) rafId=requestAnimationFrame(tick);
      else render();
    }
    function play(){ if(!sim||!sim.frames.length) return false;
      const end=sim.frames[sim.frames.length-1].t;
      if(tSim>=end&&!sim.running) tSim=0;
      playing=1; lastTick=(typeof performance!=='undefined')?performance.now():Date.now();
      if(!rafId) rafId=requestAnimationFrame(tick); render(); return true; }
    function pause(){ playing=0; if(rafId){ cancelAnimationFrame(rafId); rafId=0; } render(); return true; }
    function setTimeS(s){ if(!sim) return false;
      tSim=Math.max(0,Math.min(sim.total,+s||0)); paint(); render(); return true; }
    function setFrame(i){ if(!sim||!sim.frames.length) return false;
      const k=Math.max(0,Math.min(sim.frames.length-1,Math.round(+i||0)));
      tSim=sim.frames[k].t; paint(); render(); return true; }

    /* ---- panel ------------------------------------------------------------------------------------ */
    const BTN='padding:6px 10px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.3));background:var(--input-bg);color:var(--text-main);font-size:12px;cursor:pointer;';
    const fmtHM=(s)=>{ const t=Math.max(0,Math.round(s)); const h=Math.floor(t/3600), m=Math.floor((t%3600)/60);
      return h?(h+'h '+String(m).padStart(2,'0')+'m'):(m+'m '+String(t%60).padStart(2,'0')+'s'); };
    function ensurePanel(){
      if(panel) return panel;
      panel=document.createElement('div'); panel.id='tsu-panel';
      /* (#R189, re-learned in #R192) 「ポップアップは透過するな」 — --card-bg is OPAQUE in both
         themes; --popup-bg is rgba with no backdrop-filter, and the sidebar read straight through it.
         Right-hand side, because the left is where the app's own sidebar lives. */
      panel.style.cssText='position:fixed;right:16px;top:150px;width:min(340px,92vw);z-index:1403;display:none;flex-direction:column;'
        +'background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
      document.body.appendChild(panel);
      return panel;
    }
    /* the clock + slider move every animation frame; re-rendering the whole panel there would throw
       away the focus and the open <select> sixty times a second */
    function renderClock(){
      if(!opened||!panel||!sim) return;
      const c=panel.querySelector('.tsu-clock'); if(c) c.textContent=fmtHM(tSim);
      const tr=panel.querySelector('.tsu-t');
      if(tr&&document.activeElement!==tr) tr.value=String(Math.round(tSim));
    }
    function render(){
      if(!opened||!panel) return;
      const head='<div class="tsu-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;">'
        +'<span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">'
        +L('Tsunami propagation','津波伝播シミュレーション','Tsunami-Ausbreitung','Распространение цунами','Propagación de tsunami')
        +'</span><button class="tsu-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>';
      let body='<div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;max-height:74vh;overflow:auto;">';
      if(epi) body+='<div style="font-size:11.5px;color:var(--text-main);">M '+mw.toFixed(1)+' · '
        +L('depth','深さ','Tiefe','глубина','profundidad')+' '+Math.round(depthKm)+' km · '
        +epi[1].toFixed(2)+', '+epi[0].toFixed(2)+'</div>';
      body+='<label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">'
        +L('Simulate','計算時間','Simulieren','Смоделировать','Simular')
        +'<select class="tsu-hours" style="flex:1;'+BTN+'">'
        +[3,6,9,12,18,24].map(h=>'<option value="'+h+'"'+(h===hours?' selected':'')+'>'+h+' h</option>').join('')
        +'</select></label>';
      if(busy){
        body+='<div style="font-size:11.5px;color:var(--text-main);">'+L('Computing','計算中','Berechne','Расчёт','Calculando')+'… '+pct+'%'
          +(sim&&sim.frames.length?(' · '+L('playable now','再生できます','abspielbar','можно смотреть','ya reproducible')):'')+'</div>'
          +'<div style="height:6px;border-radius:3px;background:rgba(128,128,128,0.25);overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:#0a84ff;transition:width .2s;"></div></div>';
      } else {
        body+='<button class="tsu-run" style="'+BTN+'width:100%;background:rgba(10,132,255,0.16);border-color:rgba(10,132,255,0.5);">▶ '
          +(sim?L('Recompute','再計算','Neu berechnen','Пересчитать','Recalcular'):L('Compute propagation','伝播を計算','Ausbreitung berechnen','Рассчитать','Calcular propagación'))+'</button>';
      }
      if(lastErr==='land') body+='<div style="font-size:11.5px;color:#ff9f0a;">'
        +L('This epicentre is inland — there is no sea in the model domain.','この震源は内陸で、計算領域に海がありません。',
           'Das Epizentrum liegt im Landesinneren.','Эпицентр на суше — в области нет моря.','El epicentro está tierra adentro.')+'</div>';
      else if(lastErr==='noworker') body+='<div style="font-size:11.5px;color:#ff453a;">'
        +L('This browser cannot run the solver in a background thread, so the propagation model is unavailable here.',
           'このブラウザではバックグラウンドスレッドで計算できないため、伝播計算は利用できません。',
           'Dieser Browser kann den Löser nicht in einem Hintergrund-Thread ausführen.',
           'Этот браузер не может выполнить расчёт в фоновом потоке.',
           'Este navegador no puede ejecutar el solucionador en un hilo de fondo.')+'</div>';
      else if(lastErr) body+='<div style="font-size:11.5px;color:#ff453a;">'+String(lastErr).slice(0,120)+'</div>';
      if(sim&&sim.frames.length){
        const end=sim.frames[sim.frames.length-1].t;
        body+='<div style="display:flex;align-items:center;gap:6px;">'
          +'<button class="tsu-play" style="'+BTN+'min-width:34px;">'+(playing?'⏸':'▶')+'</button>'
          +'<input class="tsu-t" type="range" min="0" max="'+Math.round(end)+'" step="1" value="'+Math.round(tSim)+'" style="flex:1;">'
          +'<span class="tsu-clock" style="font-size:11.5px;color:var(--text-main);min-width:60px;text-align:right;font-variant-numeric:tabular-nums;">'+fmtHM(tSim)+'</span></div>';
        body+='<label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">'
          +L('Speed','速度','Tempo','Скорость','Velocidad')
          +'<select class="tsu-speed" style="flex:1;'+BTN+'">'
          +[60,120,180,300,600,1200].map(s=>'<option value="'+s+'"'+(s===speed?' selected':'')+'>×'+s+'</option>').join('')
          +'</select></label>';
        body+='<label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">'
          +L('Wave scale','波の階調','Wellenskala','Шкала волны','Escala de ola')
          +'<input class="tsu-amp" type="range" min="-2.2" max="1.4" step="0.05" value="'+Math.log10(ampNow()).toFixed(2)+'" style="flex:1;">'
          +'<span style="font-size:11px;color:var(--text-main);min-width:52px;text-align:right;">±'+(ampNow()<1?(ampNow()*100).toFixed(0)+' cm':ampNow().toFixed(1)+' m')+'</span></label>';
        body+='<label style="font-size:11.5px;color:var(--text-main);display:flex;align-items:center;gap:7px;">'
          +'<input type="checkbox" class="tsu-max"'+(showMax?' checked':'')+'> '
          +L('Maximum wave height instead','最大波高を表示','Maximale Wellenhöhe','Показать максимум','Altura máxima')+'</label>';
        body+='<label style="font-size:11.5px;color:var(--text-main);display:flex;align-items:center;gap:7px;">'
          +'<input type="checkbox" class="tsu-iso"'+(showIso?' checked':'')+'> '
          +L('Travel-time contours (hours)','到達時間の等値線（時間）','Laufzeitlinien (Stunden)','Изохроны добегания (часы)','Isócronas de llegada (horas)')+'</label>';
        body+='<label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">'
          +L('Opacity','不透明度','Deckkraft','Прозрачность','Opacidad')
          +'<input class="tsu-op" type="range" min="10" max="100" step="5" value="'+Math.round(opacity*100)+'" style="flex:1;"></label>';
        if(probe) body+='<div style="font-size:11.5px;color:var(--text-main);border-top:1px solid rgba(128,128,128,0.18);padding-top:6px;">'
          +probe.lat.toFixed(2)+', '+probe.lng.toFixed(2)+' — '
          +(probe.arrivalS!=null?(L('first arrival','第1波','erste Welle','первая волна','primera ola')+' '+fmtHM(probe.arrivalS)):L('no wave in this run','この計算時間内に到達なし','keine Welle','волна не дошла','sin ola'))
          +(probe.maxM!=null?(' · '+L('max','最大','max','макс','máx')+' '+(probe.maxM<1?(probe.maxM*100).toFixed(0)+' cm':probe.maxM.toFixed(2)+' m')):'')
          +(probe.coastalM!=null?(' · '+L('at the shore','沿岸換算','an der Küste','у берега','en la costa')+' ~'+probe.coastalM.toFixed(1)+' m'):'')
          +'</div>';
        else body+='<div style="font-size:10.5px;color:var(--text-muted);">'
          +L('Click anywhere on the sea to read the arrival time there.','海上をクリックすると、その地点の到達時刻を表示します。',
             'Auf das Meer klicken für die Ankunftszeit dort.','Нажмите на море, чтобы узнать время прихода.','Haz clic en el mar para ver la hora de llegada.')+'</div>';
      }
      if(sim&&!sim.running){
        const gm=sim.fault;
        body+='<div style="font-size:11px;color:var(--text-muted);line-height:1.5;border-top:1px solid rgba(128,128,128,0.18);padding-top:6px;">'
          +L('Sea-floor uplift','海底の隆起','Hebung','Поднятие дна','Levantamiento')+' +'+sim.eta0Up.toFixed(2)+' m / '+sim.eta0Down.toFixed(2)+' m<br>'
          +L('Rupture','震源断層','Bruchfläche','Разрыв','Ruptura')+' '+Math.round(gm.L/1000)+' × '+Math.round(gm.W/1000)+' km · '
          +L('mean slip','平均滑り','Versatz','смещение','deslizamiento')+' '+gm.slip.toFixed(1)+' m<br>'
          +L('Grid','格子','Gitter','Сетка','Malla')+' '+sim.N+'² · '+sim.cellKm+' km · Δt '+(sim.dt||0).toFixed(1)+' s · '+(sim.steps||0)+' '+L('steps','ステップ','Schritte','шагов','pasos')
          +' · '+((sim.solveMs||0)/1000).toFixed(1)+' s<br>'
          +L('Peak coastal height (Green’s law)','沿岸最大波高（グリーンの法則）','Küstenhöhe (Green)','Высота у берега (Грин)','Altura costera (Green)')
          +' ~'+(sim.coastMax||0).toFixed(1)+' m'
          +'</div>';
        if(sim.coastAt) body+='<button class="tsu-inund" style="'+BTN+'width:100%;">🌊 '
          +L('Inundation at the worst-hit coast','最大波高地点の浸水域','Überflutung an der Küste','Затопление на берегу','Inundación en la costa')+'</button>';
      }
      body+='<div style="font-size:10px;color:var(--text-muted);line-height:1.45;border-top:1px solid rgba(128,128,128,0.18);padding-top:6px;">'
        +L('Shallow-water long waves on a spherical staggered grid, with total-depth pressure and Manning bottom friction, solved in a background thread. Depth from the terrarium DEM; initial sea-floor displacement from Okada (1985) summed over a tapered sub-fault grid, with Wells & Coppersmith (1994) fault dimensions and the strike read off the local bathymetric gradient. Cells are tens of kilometres, so this is an open-ocean model: arrival times and deep-water amplitude are meaningful, harbour resonance and run-up are not. Coastal height is a Green’s-law estimate. Educational model — in a real emergency follow the official authorities.',
           '球面のスタッガード格子上で浅水長波（全水深による圧力項＋マニングの底面摩擦）をバックグラウンドスレッドで解いています。水深はterrarium DEM、初期海底変位はOkada (1985) をテーパー付き小断層群で重ね合わせ、断層寸法はWells & Coppersmith (1994)、走向は局所的な海底勾配から求めています。格子は数十kmなので外洋モデルです：到達時刻と沖合の波高は意味を持ちますが、港湾の共振や遡上は表現できません。沿岸波高はグリーンの法則による推定です。教育目的のモデルであり、実際の災害時は公的機関の指示に従ってください。',
           'Flachwasser-Langwellen auf einem sphärischen Versetzungsgitter, mit Gesamttiefen-Druckterm und Manning-Bodenreibung, in einem Hintergrund-Thread gelöst. Tiefe aus dem terrarium-DEM; Anfangsverschiebung nach Okada (1985) über ein Teilbruch-Gitter summiert, Bruchmaße nach Wells & Coppersmith (1994), Streichen aus dem lokalen Tiefengradienten. Zellen sind zig Kilometer groß — ein Modell für die offene See. Küstenhöhe ist eine Green-Abschätzung. Nur Bildungsmodell.',
           'Длинные волны мелкой воды на сферической сетке, с давлением по полной глубине и донным трением Маннинга, расчёт в фоновом потоке. Глубины из terrarium DEM; начальное смещение дна по Okada (1985), просуммированное по сетке подразрывов, размеры разрыва по Wells & Coppersmith (1994), простирание — из локального градиента глубин. Ячейки в десятки километров: модель открытого океана. Высота у берега — оценка по закону Грина. Учебная модель.',
           'Ondas largas en aguas someras sobre malla esférica, con presión de profundidad total y fricción de fondo de Manning, resueltas en un hilo de fondo. Profundidad del DEM terrarium; desplazamiento inicial según Okada (1985) sumado sobre una malla de subfallas, dimensiones de ruptura según Wells & Coppersmith (1994) y rumbo tomado del gradiente batimétrico local. Las celdas miden decenas de kilómetros: es un modelo de mar abierto. La altura costera es una estimación por la ley de Green. Modelo educativo.')
        +'</div></div>';
      panel.innerHTML=head+body;
      try{ makeDraggable&&makeDraggable(panel,panel.querySelector('.tsu-head')); }catch(_){}
      const q=(s)=>panel.querySelector(s);
      const c=q('.tsu-close'); if(c) c.onclick=()=>close();
      const r=q('.tsu-run'); if(r) r.onclick=()=>{ build(); };
      const hs=q('.tsu-hours'); if(hs) hs.onchange=()=>{ hours=+hs.value||6; render(); };
      const pl=q('.tsu-play'); if(pl) pl.onclick=()=>{ playing?pause():play(); };
      /* ⚠ pause WITHOUT re-rendering: render() replaces the panel's innerHTML, which would destroy the
         very <input> the pointer is dragging and drop the gesture on the first move. The button glyph
         is corrected when the drag ends. */
      const tr=q('.tsu-t'); if(tr){
        tr.oninput=()=>{ if(playing){ playing=0; if(rafId){ cancelAnimationFrame(rafId); rafId=0; } }
          tSim=+tr.value||0; paint(); renderClock(); };
        tr.onchange=()=>{ render(); };
      }
      const sp=q('.tsu-speed'); if(sp) sp.onchange=()=>{ speed=+sp.value||180; };
      const am=q('.tsu-amp'); if(am) am.oninput=()=>{ dispAmp=Math.pow(10,+am.value); buildLUT(); paint();
        const lab=am.nextElementSibling; if(lab) lab.textContent='±'+(dispAmp<1?(dispAmp*100).toFixed(0)+' cm':dispAmp.toFixed(1)+' m'); };
      const mx=q('.tsu-max'); if(mx) mx.onchange=()=>{ showMax=!!mx.checked; paint(); render(); };
      const iso=q('.tsu-iso'); if(iso) iso.onchange=()=>{ showIso=!!iso.checked; applyIso(); };
      const op=q('.tsu-op'); if(op) op.oninput=()=>{ opacity=Math.max(0.1,Math.min(1,(+op.value||90)/100));
        try{ GE().layers.setDynamicImageOpacity(DYN,opacity); }catch(_){} };
      const iu=q('.tsu-inund'); if(iu) iu.onclick=()=>openInundation();
    }
    /* the LAST kilometre, which this grid cannot resolve — handed to the model that can (js/sims.js) */
    function openInundation(){
      if(!sim||!sim.coastAt) return false;
      const D2=window.IntMapDisaster; if(!D2||!D2.open) return false;
      try{ D2.open({ lng:sim.coastAt[0], lat:sim.coastAt[1], hazard:'tsunami', waveH:Math.max(1,Math.round(sim.coastMax)) }); }catch(_){ return false; }
      return true;
    }

    /* ---- reading the model at a point -------------------------------------------------------------- */
    function at(lng,lat){
      if(!sim||!sim.tarr) return null;
      const span=sim.eLng-sim.wLng;
      const i=Math.floor((((+lng-sim.wLng+540)%360-180+360)%360)/(span/sim.N));
      const j=Math.floor((+lat-sim.sLat)/((sim.nLat-sim.sLat)/sim.N));
      if(!(i>=0&&j>=0&&i<sim.N&&j<sim.N)) return null;
      const k=j*sim.N+i; if(sim.land[k]) return null;
      const mx=sim.emax?sim.emax[k]:null;
      return { lng:+lng, lat:+lat, maxM:(mx!=null?+mx.toFixed(3):null),
        minM:(sim.emin?+sim.emin[k].toFixed(3):null),
        depthM:sim.depth[k],
        arrivalS:(sim.tarr[k]>=0)?Math.round(sim.tarr[k]):null,
        /* Green's law only where the linear solution it shoals is still valid — see coastal() */
        coastalM:(mx!=null&&sim.depth[k]>=200)?+(mx*Math.pow(sim.depth[k]/10,0.25)).toFixed(2):null };
    }
    let clickOn=false;
    function wireClick(){
      if(clickOn) return; clickOn=true;
      try{ GE().events.on('click',(e)=>{
        if(!opened||!sim) return;
        const ll=e&&e.lngLat; if(!ll) return;
        const p=at(ll.lng!=null?ll.lng:ll[0], ll.lat!=null?ll.lat:ll[1]);
        probe=p; render();
      }); }catch(_){}
    }

    /* ---- lifecycle -------------------------------------------------------------------------------- */
    function open(o){
      o=o||{};
      ensurePanel();
      if(o.lng!=null&&o.lat!=null) epi=[+o.lng,+o.lat];
      if(o.mw!=null) mw=Math.max(6,Math.min(9.6,+o.mw));
      if(o.depth!=null) depthKm=Math.max(0,Math.min(200,+o.depth));
      if(o.hours!=null) hours=Math.max(1,Math.min(24,+o.hours));
      opened=true; panel.style.display='flex'; render(); wireClick();
      if(epi&&o.run!==false) build();
      return true;
    }
    function close(){ opened=false; pause(); seq++;
      try{ if(jobId&&window.IntMapTsunamiWorker) window.IntMapTsunamiWorker.abort(jobId); }catch(_){}
      busy=false; if(panel) panel.style.display='none'; clearPaint(); return true; }

    return { open, close, play, pause, setFrame, setTime:setTimeS, at,
      setHours(h){ hours=Math.max(1,Math.min(24,+h||6)); if(opened) render(); return true; },
      setSpeed(s){ speed=Math.max(1,Math.min(3600,+s||180)); if(opened) render(); return true; },
      setOpacity(v){ opacity=Math.max(0.1,Math.min(1,+v>1?(+v/100):+v));
        try{ GE().layers.setDynamicImageOpacity(DYN,opacity); }catch(_){} return opacity; },
      setAmplitude(m){ dispAmp=Math.max(0.005,Math.min(30,+m||0.2)); buildLUT(); paint(); if(opened) render(); return dispAmp; },
      showMaximum(v){ showMax=!!v; paint(); if(opened) render(); return showMax; },
      showContours(v){ showIso=!!v; applyIso(); if(opened) render(); return showIso; },
      run:()=>build(), openInundation,
      state:()=>({ open:opened, epi:epi?epi.slice():null, mw, depthKm, hours, speed, opacity, showMax,
        showIso, ampM:sim?+ampNow().toFixed(3):null, busy, pct, err:lastErr, playing:!!playing,
        tSim:Math.round(tSim), worker:!!(window.IntMapTsunamiWorker&&window.IntMapTsunamiWorker.available()),
        sim:sim?{ N:sim.N, cellKm:sim.cellKm, dt:+(sim.dt||0).toFixed(2), steps:sim.steps||0,
          frames:sim.frames.length, nFrames:sim.nFrames, running:!!sim.running,
          totalS:sim.total, upliftM:+sim.eta0Up.toFixed(2), subsidenceM:+sim.eta0Down.toFixed(2),
          strike:Math.round(sim.strike), dipDeg:sim.dipDeg, slipM:+sim.fault.slip.toFixed(1),
          faultKm:[Math.round(sim.fault.L/1000),Math.round(sim.fault.W/1000)],
          coastMaxM:+(sim.coastMax||0).toFixed(2), coastAt:sim.coastAt, seaCells:sim.seaCells,
          demTiles:sim.demTiles, demMissing:sim.demMissing, noData:sim.noData,
          ampM:sim.amp, autoAmpM:sim.autoAmp||null, solveMs:sim.solveMs||null, ms:sim.ms }:null }) };
  })();
};
