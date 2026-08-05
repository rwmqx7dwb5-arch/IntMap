/* ============================================================================
 *  IntMap · TSUNAMI PROPAGATION — window.IntMapTsunami  (#R192)
 * ----------------------------------------------------------------------------
 *  「津波が発生するとされるような地震だった場合、波の伝播のわかるアニメーション津波シミュレーターも
 *    使えるように。」
 *
 *  The app already had something called a tsunami: js/sims.js floods a 26 km box around a coastal
 *  point up to a chosen wave height. That is an INUNDATION model — it answers "how far inland", and
 *  it is still here and still reachable from this panel. It says nothing at all about how the wave
 *  gets there, which is what was asked for.
 *
 *  This is the other half, and it is the ordinary one: a tsunami in the open ocean is a LINEAR LONG
 *  WAVE. Its wavelength (100-500 km) is enormous next to the depth (4-6 km), so the vertical
 *  structure is hydrostatic and the whole thing is two equations — the same equations JMA runs for
 *  its forecast and the same ones TUNAMI-N2 / COMCOT solve offshore:
 *
 *      ∂M/∂t = −g·h·(1/(R cosφ))·∂η/∂λ            M, N are volume fluxes (m²/s)
 *      ∂N/∂t = −g·h·(1/R)·∂η/∂φ                   h is the still-water depth
 *      ∂η/∂t = −(1/(R cosφ))·[ ∂M/∂λ + ∂(N cosφ)/∂φ ]
 *
 *  on a staggered Arakawa C-grid, leapfrog in time, in SPHERICAL coordinates because a Pacific-wide
 *  wave is not a flat-Earth problem. Nothing here is a curve fit: the wave speed √(gh) comes out of
 *  the equations, so refraction around ridges, the slow-down over shallow shelves and the focusing
 *  that sends Chilean tsunamis to Japan all appear because the bathymetry is real.
 *
 *  ── THE SEA FLOOR ───────────────────────────────────────────────────────────────────────────────
 *  h comes from the same terrarium DEM the rest of the app reads (it carries bathymetry), sampled
 *  through the frozen-snapshot reader #R191 built so the field cannot change under the model between
 *  two frames.
 *
 *  ── THE INITIAL WAVE ────────────────────────────────────────────────────────────────────────────
 *  A tsunami starts as the sea floor moving, and the sea surface copies it. That displacement is
 *  OKADA (1985, BSSA 75(4), 1135-1154) — the closed-form surface deformation of a rectangular
 *  dislocation in an elastic half-space, which is what every tsunami model in use is initialised
 *  with. Fault size and slip come from the magnitude through Wells & Coppersmith (1994) for
 *  reverse faulting, and the STRIKE is read off the sea floor itself: a subduction interface runs
 *  along the isobaths, so the local bathymetric gradient gives the dip direction without anyone
 *  having to guess an azimuth.
 *
 *  ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────────────────────────
 *  The grid is tens of kilometres across, so this is an OPEN-OCEAN model: it gives arrival times and
 *  deep-water amplitude honestly and it cannot resolve a harbour. Coastal height is reported through
 *  Green's law (the standard shoaling relation, η ∝ h^(−1/4)) and labelled as an estimate, and the
 *  inundation model is one button away for the last kilometre.
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
    const D=Math.PI/180, RE=6371000, G=9.80665;
    const SRC='tsu-img', LYR='tsu-fill', SRC_V='tsu-vec', LYR_EPI='tsu-epi';

    /* ---- state ---------------------------------------------------------------------------------- */
    let panel=null, opened=false, epi=null, mw=8.5, depthKm=20;
    let sim=null;                       /* the built model — grids, steps, frames */
    let busy=false, pct=0, seq=0, stale=true;
    let frame=0, playing=0, rafId=0, speed=60;      /* speed = simulated seconds per real second */
    let hours=6, opacity=0.85, showMax=false;
    let lastErr=null;

    /* ══ OKADA (1985) — the vertical surface displacement of one rectangular dislocation ═══════════
       Surface (z = 0) solution, Chinnery-summed over the fault rectangle. Only uz is needed and only
       the dip-slip component is used (a tsunami source is a thrust; rake 90°), which is the U2 term:

           uz = −(U/2π)·[ d̃q/(R(R+ξ)) + sinδ·atan(ξη/(qR)) − I5·sinδ·cosδ ] ‖

       with the Chinnery double difference f(ξ,η)‖ = f(x,p) − f(x,p−W) − f(x−L,p) + f(x−L,p−W), a
       Poisson solid (μ/(λ+μ) = 1/2), and x,y in the fault frame: x along strike, y up the horizontal
       projection of the dip direction, measured from the fault's lower edge.
       ⚠ VERIFIED before use, not trusted: for a 45° thrust the peak uplift is ~0.4 of the slip and
       sits up-dip of the fault, with a subsidence lobe behind it — the classic dipole. tests/r192
       pins the ratio and the sign. */
    function okadaUz(x,y,depth,L2,W2,dipDeg,slip){
      const dip=dipDeg*D, sd=Math.sin(dip), cd=Math.cos(dip);
      const cdS=(Math.abs(cd)<1e-6)?1e-6:cd;                 /* vertical faults are a limit, not a case */
      const p=y*cd+depth*sd;
      const f=(xi,eta)=>{
        const q=y*sd-depth*cd;
        const R=Math.sqrt(xi*xi+eta*eta+q*q); if(!(R>0)) return 0;
        const dt=eta*sd-q*cd;
        const X=Math.sqrt(xi*xi+q*q);
        /* ⚠ arctan OF A RATIO, not atan2. Okada's formulae are written with the PRINCIPAL value;
           the two-argument form adds ±π wherever the numerator and denominator change sign, and the
           Chinnery difference then keeps that jump as a plateau. Measured before the fix: a constant
           −5.14 m of "subsidence" 400 km behind the fault, which is exactly slip·sinδ = 2π·(that
           branch)/2π. Deformation must decay to zero away from a finite source, and now it does. */
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

    /* ---- the model ------------------------------------------------------------------------------- */
    /* Cells: 320² on a desktop, 192² on a phone. The domain is sized so the fastest possible wave
       (√(g·11 km) ≈ 330 m/s) cannot reach the boundary before the run ends, and then clipped to the
       part of the globe a lat/lon grid can hold without degenerating at the pole. */
    function gridN(){ return (typeof isMobile==='function'&&isMobile())?192:320; }

    async function build(){
      if(!epi){ lastErr='no epicentre'; render(); return; }
      const my=++seq; busy=true; stale=false; pct=0; lastErr=null; render();
      const t0=performance.now();
      try{
        const N=gridN(), H=Math.max(1,Math.min(24,hours));
        const reachKm=Math.min(9000, 0.33*3600*H);          /* 330 m/s ceiling, in km over the run */
        let halfLat=Math.min(52, reachKm/111.32);
        const lat0=epi[1], lng0=epi[0];
        /* keep the box off the pole: a lat/lon cell there is a sliver and the CFL step collapses */
        const nLat=Math.min(78, lat0+halfLat), sLat=Math.max(-78, lat0-halfLat);
        const midLat=(nLat+sLat)/2, cosMid=Math.max(0.22,Math.cos(midLat*D));
        const halfLng=Math.min(170, halfLat/cosMid);
        const wLng=lng0-halfLng, eLng=lng0+halfLng;
        const dPhi=(nLat-sLat)/N*D, dLam=(2*halfLng)/N*D;

        /* ── the sea floor ───────────────────────────────────────────────────────────────────────
           ONE DEM zoom for the whole domain, chosen so the tile count stays inside a budget rather
           than by a constant: an ocean-wide box at z5 is 160 tiles and, measured, 34 of them did not
           arrive inside the timeout — 19 % of the model's cells then ran on a fallback depth. z4 is
           9.8 km a pixel, which is still four times finer than this model's own cell, and it covers
           the same box in a quarter of the requests. The zoom is dropped until the count fits. */
        let z=6;
        const tilesAt=(zz)=>{ const n=Math.pow(2,zz);
          return Math.ceil(n*(2*halfLng)/360+1)*Math.ceil(n*(nLat-sLat)/170+1); };
        while(z>3&&tilesAt(z)>90) z--;
        const wrapLng=(v)=>((v+540)%360)-180;
        const warm=[]; const S=Math.min(64,N);
        for(let j=0;j<=S;j++) for(let i=0;i<=S;i++)
          warm.push([wrapLng(wLng+(2*halfLng)*i/S), sLat+(nLat-sLat)*j/S]);
        await warmDEMTiles(warm,z,25000,(f)=>{ pct=Math.round(28*(+f||0)); if(opened) render(); });
        if(my!==seq) return;
        /* ⚠ AND THE BOX CROSSES THE ANTIMERIDIAN. A Pacific-wide domain from Japan runs to 208°E, and
           demSnapshot clamps its request to ±179.999 — so every cell east of the date line came back
           with no depth and ran on the fallback. Measured before the fix: 19,840 of 102,400 cells,
           i.e. the entire eastern Pacific, which is most of what this model is for. Two snapshots, one
           either side, and the sampler picks by the wrapped longitude. */
        const snapA=demSnapshot(Math.max(-180,wrapLng(wLng)),sLat,(eLng>180?179.999:wrapLng(eLng)),nLat,z);
        const snapB=(eLng>180)?demSnapshot(-180,sLat,wrapLng(eLng),nLat,z)
                  :((wLng<-180)?demSnapshot(wrapLng(wLng),sLat,180,nLat,z):null);
        const snap={ have:snapA.have+(snapB?snapB.have:0), missing:snapA.missing+(snapB?snapB.missing:0),
          at(lo,la){ const x=wrapLng(lo); let v=snapA.at(x,la); if(v==null&&snapB) v=snapB.at(x,la); return v; } };
        pct=30; render();

        const h=new Float32Array(N*N);           /* still-water depth, m (>0 = sea) */
        const latOf=(j)=>sLat+(j+0.5)*(nLat-sLat)/N;
        const lngOf=(i)=>wLng+(i+0.5)*(2*halfLng)/N;
        let seaCells=0, noData=0;
        const LM=window.IntMapLandMask;
        for(let j=0;j<N;j++) for(let i=0;i<N;i++){
          const la=latOf(j), lo=lngOf(i);
          let e=null; try{ e=snap.at(lo,la); }catch(_){}
          if(e==null){ noData++;
            /* the bundled mask still knows land from sea; an unknown DEPTH over known sea gets the
               ocean's own mean, which is the honest stand-in for "sea, depth unmeasured" */
            const isL=LM&&LM.ready()?LM.isLand(lo,la):null;
            e=(isL===false)?-3800:(isL===true?10:-3800);
          }
          const d=-e;
          h[j*N+i]=(d>10)?d:0;                   /* under 10 m is coast: a wall for this grid */
          if(h[j*N+i]>0) seaCells++;
        }
        if(!(seaCells>N*N*0.02)){ lastErr='land'; busy=false; render(); return; }

        /* ── the initial sea surface ─────────────────────────────────────────────────────────────
           Okada, with the strike taken from the sea floor: a subduction interface runs along the
           isobaths, so ∇h gives the down-dip direction and the strike is perpendicular to it. */
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
        const botDepth=topDepth+g.W*Math.sin(dipDeg*D);
        const sA=Math.sin(strike*D), cA=Math.cos(strike*D);
        const mPerLat=111320, mPerLngAt=(la)=>111320*Math.cos(la*D);
        let upMax=0, downMax=0;
        for(let j=0;j<N;j++){ const la=latOf(j);
          for(let i=0;i<N;i++){
            const lo=lngOf(i);
            const dx=((lo-lng0+540)%360-180)*mPerLngAt(la), dy=(la-lat0)*mPerLat;
            if(Math.abs(dx)>6*g.L||Math.abs(dy)>6*g.L) continue;    /* Okada dies off; skip the far field */
            /* rotate into the fault frame: x along strike, y up-dip horizontally */
            const xs= dx*sA+dy*cA;
            const ys=-dx*cA+dy*sA;
            const uz=okadaUz(xs+g.L/2, ys+(g.W*Math.cos(dipDeg*D))/2, botDepth, g.L, g.W, dipDeg, g.slip);
            if(!isFinite(uz)) continue;
            eta0[j*N+i]=uz;
            if(uz>upMax) upMax=uz; if(uz<downMax) downMax=uz;
          }
        }
        pct=40; render();

        /* ── the run ─────────────────────────────────────────────────────────────────────────────
           Leapfrog on a C-grid. dt from the CFL condition over the whole domain, with a 0.45 margin. */
        const dyM=RE*dPhi;
        let cMax=0, dxMin=1e18;
        for(let j=0;j<N;j++){ const dxM=RE*Math.cos(latOf(j)*D)*dLam; if(dxM<dxMin) dxMin=dxM; }
        for(let k=0;k<N*N;k++){ const c=Math.sqrt(G*h[k]); if(c>cMax) cMax=c; }
        const dt=Math.max(1,0.45*Math.min(dxMin,dyM)/Math.max(1,cMax));
        const total=H*3600, steps=Math.ceil(total/dt);
        const FRAMES=Math.min(120,Math.max(40,Math.round(H*12)));
        const everyN=Math.max(1,Math.floor(steps/FRAMES));

        const eta=new Float32Array(eta0);        /* surface elevation at cell centres */
        const M=new Float32Array(N*N);           /* flux across the EAST face of (i,j) */
        const Nf=new Float32Array(N*N);          /* flux across the NORTH face of (i,j) */
        const emax=new Float32Array(N*N);        /* the biggest crest each cell ever sees */
        const tarr=new Float32Array(N*N); tarr.fill(-1);   /* first arrival, s */
        const cosC=new Float64Array(N), cosN=new Float64Array(N);
        for(let j=0;j<N;j++){ cosC[j]=Math.cos(latOf(j)*D); cosN[j]=Math.cos((latOf(j)+0.5*(nLat-sLat)/N)*D); }
        /* a sponge on the outer ring so a wave leaves instead of bouncing back in */
        const SP=Math.max(4,Math.round(N*0.035));
        const sponge=new Float32Array(N*N);
        for(let j=0;j<N;j++) for(let i=0;i<N;i++){
          const d=Math.min(Math.min(i,N-1-i),Math.min(j,N-1-j));
          sponge[j*N+i]=(d<SP)?(1-0.06*Math.pow((SP-d)/SP,2)):1;
        }
        const frames=[]; const ARRIVE=0.01;      /* 1 cm — the level a DART buoy calls an arrival */
        let t=0;
        for(let s=0;s<steps;s++){
          /* momentum: −g·h·∇η, on the faces */
          for(let j=0;j<N;j++){
            const row=j*N, invDx=1/(RE*cosC[j]*dLam);
            for(let i=0;i<N-1;i++){
              const a=row+i, b=a+1;
              const hf=Math.min(h[a],h[b]);
              M[a]=(hf>0)?((M[a]-dt*G*hf*(eta[b]-eta[a])*invDx)*sponge[a]):0;
            }
            M[row+N-1]=0;
          }
          const invDy=1/dyM;
          for(let j=0;j<N-1;j++){ const row=j*N, up=row+N;
            for(let i=0;i<N;i++){
              const a=row+i, b=up+i;
              const hf=Math.min(h[a],h[b]);
              Nf[a]=(hf>0)?((Nf[a]-dt*G*hf*(eta[b]-eta[a])*invDy)*sponge[a]):0;
            }
          }
          for(let i=0;i<N;i++) Nf[(N-1)*N+i]=0;
          /* continuity */
          for(let j=0;j<N;j++){
            const row=j*N, invDx=1/(RE*cosC[j]*dLam), cj=cosC[j];
            for(let i=0;i<N;i++){
              const k=row+i;
              if(h[k]<=0){ eta[k]=0; continue; }
              const mw2=(i>0)?M[k-1]:0, me=M[k];
              const ns=(j>0)?Nf[k-N]*cosN[j-1]:0, nn=Nf[k]*cosN[j];
              eta[k]=(eta[k]-dt*((me-mw2)*invDx+(nn-ns)/(dyM*cj)))*sponge[k];
              const a=eta[k];
              if(a>emax[k]) emax[k]=a;
              if(tarr[k]<0&&Math.abs(a)>=ARRIVE) tarr[k]=t;
            }
          }
          t+=dt;
          if(s%everyN===0||s===steps-1){
            /* the animation holds every frame, so a frame is stored at 1 mm in an Int16 rather than
               as a Float32: 120 frames of 320² is 49 MB in floats and 25 MB this way, and a tsunami
               is not measured to the tenth of a millimetre */
            const q=new Int16Array(N*N);
            for(let k2=0;k2<N*N;k2++){ const v=Math.round(eta[k2]*1000);
              q[k2]=v>32767?32767:(v<-32768?-32768:v); }
            frames.push({ t, q });
            if(frames.length%8===0){ pct=40+Math.round(56*s/steps); if(opened) render();
              await new Promise(r=>setTimeout(r,0)); if(my!==seq) return; }
          }
        }
        pct=98; render();
        /* The coast, as this grid can see it: a sea cell within two cells of a wall, shoaled from its
           own depth to 10 m by Green's law (η ∝ h^(−1/4)) — the standard estimate, labelled as one.
           ⚠ ONLY FROM CELLS WHERE THE LINEAR THEORY STILL HOLDS. The first version took the shallowest
           cell it could find, where η/h was already 0.16 and the linear equations have stopped being
           true, and reported 27 m off the Sanriku coast — the model's own arithmetic run past its
           validity, not a forecast. 200 m is where the shelf begins and the long-wave solution is
           still linear there. */
        let coastMax=0, coastAt=null;
        const nearLand=(i,j)=>{ for(let dj=-2;dj<=2;dj++) for(let di=-2;di<=2;di++){
            const jj=j+dj, ii=i+di; if(jj<0||ii<0||jj>=N||ii>=N) continue;
            if(h[jj*N+ii]<=0) return true; } return false; };
        for(let j=1;j<N-1;j++) for(let i=1;i<N-1;i++){
          const k=j*N+i; if(h[k]<200) continue;
          if(!nearLand(i,j)) continue;
          const v=emax[k]*Math.pow(h[k]/10,0.25);
          if(v>coastMax){ coastMax=v; coastAt=[lngOf(i),latOf(j)]; }
        }
        sim={ N, wLng, eLng, sLat, nLat, h, frames, emax, tarr, dt, steps, total,
              eta0Up:upMax, eta0Down:downMax, fault:g, strike, dipDeg, z,
              demTiles:snap.have, demMissing:snap.missing, noData, seaCells,
              coastMax, coastAt, cellKm:Math.round(RE*Math.cos(midLat*D)*dLam/1000),
              cMax:Math.round(cMax), ms:Math.round(performance.now()-t0) };
        frame=0; pct=100; busy=false;
        paint(); render();
        /* …and look at it. A wave crossing the Pacific is not visible from the view the app happens to
           be on (measured: the model built correctly and the screenshot showed Africa), so the camera
           goes to the source with enough of the ocean around it to watch the wave leave. */
        try{ GE().camera.jumpTo({ center:[((lng0+540)%360)-180, Math.max(-60,Math.min(60,lat0))],
          zoom:Math.max(1.2,Math.min(4, Math.log2(360/(2*halfLng))+0.6)), pitch:0 }); }catch(_){}
      }catch(e){ lastErr=String(e&&e.message||e); busy=false; render(); }
    }
    function depthAt(snap,lo,la){ let e=null; try{ e=snap.at(lo,Math.max(-84,Math.min(84,la))); }catch(_){}
      return (e==null)?0:-e; }

    /* ---- painting -------------------------------------------------------------------------------- */
    /* A diverging scale, because a tsunami is a crest AND a trough and the trough is what arrives
       first on a subducting coast. Amplitudes span four orders of magnitude between the source and a
       far shore, so the ramp is on the cube root — the standard way these maps are drawn. */
    function colOf(v,scale){
      const x=Math.max(-1,Math.min(1,Math.cbrt(v/scale)));
      const a=Math.min(255,Math.round(30+225*Math.abs(x)));
      if(x>=0) return [255,Math.round(255-200*x),Math.round(255-235*x),a];
      return [Math.round(255+220*x),Math.round(255+120*x),255,a];
    }
    function fieldURL(){
      if(!sim) return null;
      const N=sim.N, cv=document.createElement('canvas'); cv.width=N; cv.height=N;
      const ctx=cv.getContext('2d'), im=ctx.createImageData(N,N), px=im.data;
      const fr=sim.frames[Math.round(frame)];
      const src=showMax?sim.emax:(fr?fr.q:null);
      if(!src) return null;
      const unit=showMax?1:0.001;                 /* the frames are stored at 1 mm — see build() */
      let peak=0; for(let k=0;k<N*N;k++){ const a=Math.abs(src[k]); if(a>peak) peak=a; }
      peak*=unit;
      const scale=Math.max(0.05,peak);
      for(let j=0;j<N;j++) for(let i=0;i<N;i++){
        const k=j*N+i, o=((N-1-j)*N+i)*4;        /* the image runs north→south */
        if(sim.h[k]<=0) continue;                 /* land is not painted */
        const v=src[k]*unit;
        if(Math.abs(v)<scale*0.002) continue;
        const c=colOf(v,scale);
        px[o]=c[0]; px[o+1]=c[1]; px[o+2]=c[2]; px[o+3]=c[3];
      }
      ctx.putImageData(im,0,0);
      return { url:cv.toDataURL('image/png'), peak };
    }
    function paint(){
      try{
        if(!sim||!_imCanDraw()){ return; }
        const f=fieldURL(); if(!f) return;
        const coords=[[sim.wLng,sim.nLat],[sim.eLng,sim.nLat],[sim.eLng,sim.sLat],[sim.wLng,sim.sLat]];
        if(GE().layers.hasSource(SRC)){
          const ok=GE().layers.updateImage&&GE().layers.updateImage(SRC,{url:f.url,coordinates:coords});
          if(ok===false){ try{ GE().layers.remove(LYR); }catch(_){} try{ GE().layers.removeSource(SRC); }catch(_){} }
        }
        if(!GE().layers.hasSource(SRC)){
          GE().layers.addSource(SRC,{type:'image',url:f.url,coordinates:coords});
          GE().layers.add({id:LYR,type:'raster',source:SRC,paint:{'raster-opacity':opacity,'raster-fade-duration':0}});
        }
        try{ GE().layers.setPaint(LYR,'raster-opacity',opacity); }catch(_){}
        if(!GE().layers.hasSource(SRC_V)) GE().layers.addSource(SRC_V,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.has(LYR_EPI)) GE().layers.add({id:LYR_EPI,type:'circle',source:SRC_V,
          paint:{'circle-radius':5,'circle-color':'#ffd23f','circle-stroke-color':'#000','circle-stroke-width':1.4}});
        GE().layers.setSourceData(SRC_V,{type:'FeatureCollection',features:epi?[{type:'Feature',
          geometry:{type:'Point',coordinates:epi},properties:{}}]:[]});
      }catch(_){}
    }
    function clearPaint(){
      try{ if(GE().layers.has(LYR)) GE().layers.remove(LYR); }catch(_){}
      try{ if(GE().layers.hasSource(SRC)) GE().layers.removeSource(SRC); }catch(_){}
      try{ if(GE().layers.has(LYR_EPI)) GE().layers.remove(LYR_EPI); }catch(_){}
      try{ if(GE().layers.hasSource(SRC_V)) GE().layers.removeSource(SRC_V); }catch(_){}
    }

    /* ---- playback -------------------------------------------------------------------------------- */
    let lastTick=0;
    function tick(){
      rafId=0; if(!playing||!sim) return;
      const now=(typeof performance!=='undefined')?performance.now():Date.now();
      const dtReal=Math.min(0.5,(now-lastTick)/1000); lastTick=now;
      const perFrame=sim.total/Math.max(1,sim.frames.length-1);
      const adv=(speed*dtReal)/perFrame;
      frame=frame+adv;
      if(frame>=sim.frames.length-1){ frame=sim.frames.length-1; playing=0; }
      paint(); render();
      if(playing){ rafId=requestAnimationFrame(tick); }
    }
    function play(){ if(!sim) return false; if(frame>=sim.frames.length-1) frame=0;
      playing=1; lastTick=(typeof performance!=='undefined')?performance.now():Date.now();
      if(!rafId) rafId=requestAnimationFrame(tick); render(); return true; }
    function pause(){ playing=0; if(rafId){ cancelAnimationFrame(rafId); rafId=0; } render(); return true; }
    function setFrame(i){ if(!sim) return false; frame=Math.max(0,Math.min(sim.frames.length-1,+i||0));
      paint(); render(); return true; }
    function setTimeS(s){ if(!sim) return false; const per=sim.total/Math.max(1,sim.frames.length-1);
      return setFrame(Math.round(Math.max(0,Math.min(sim.total,+s||0))/per)); }

    /* ---- panel ------------------------------------------------------------------------------------ */
    const BTN='padding:6px 10px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.3));background:var(--input-bg);color:var(--text-main);font-size:12px;cursor:pointer;';
    const fmtHM=(s)=>{ const t=Math.max(0,Math.round(s)); const h=Math.floor(t/3600), m=Math.floor((t%3600)/60);
      return h?(h+'h '+String(m).padStart(2,'0')+'m'):(m+'m '+String(t%60).padStart(2,'0')+'s'); };
    function ensurePanel(){
      if(panel) return panel;
      panel=document.createElement('div'); panel.id='tsu-panel';
      panel.style.cssText='position:fixed;left:16px;top:96px;width:min(340px,92vw);z-index:1403;display:none;flex-direction:column;'
        +'background:var(--popup-bg,#141414);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
      document.body.appendChild(panel);
      return panel;
    }
    function render(){
      if(!opened||!panel) return;
      const head='<div class="tsu-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;">'
        +'<span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">'
        +L('Tsunami propagation','津波伝播シミュレーション','Tsunami-Ausbreitung','Распространение цунами','Propagación de tsunami')
        +'</span><button class="tsu-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>';
      let body='<div style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;max-height:70vh;overflow:auto;">';
      body+='<div style="font-size:11px;color:var(--text-muted);">'
        +L('Linear long-wave (shallow-water) propagation over the real sea floor.',
           '実際の海底地形上を伝わる線形長波（浅水波）の伝播計算です。',
           'Lineare Langwellen-Ausbreitung über den echten Meeresboden.',
           'Распространение линейных длинных волн над реальным дном.',
           'Propagación de ondas largas lineales sobre el fondo marino real.')+'</div>';
      if(epi) body+='<div style="font-size:11.5px;color:var(--text-main);">M '+mw.toFixed(1)+' · '
        +L('depth','深さ','Tiefe','глубина','profundidad')+' '+Math.round(depthKm)+' km · '
        +epi[1].toFixed(2)+', '+epi[0].toFixed(2)+'</div>';
      /* the run controls */
      body+='<label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">'
        +L('Simulate','計算時間','Simulieren','Смоделировать','Simular')
        +'<select class="tsu-hours" style="flex:1;'+BTN+'">'
        +[3,6,9,12,18,24].map(h=>'<option value="'+h+'"'+(h===hours?' selected':'')+'>'+h+' h</option>').join('')
        +'</select></label>';
      if(busy){
        body+='<div style="font-size:11.5px;color:var(--text-main);">'+L('Computing','計算中','Berechne','Расчёт','Calculando')+'… '+pct+'%</div>'
          +'<div style="height:6px;border-radius:3px;background:rgba(128,128,128,0.25);overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:#0a84ff;"></div></div>';
      } else {
        body+='<button class="tsu-run" style="'+BTN+'width:100%;background:rgba(10,132,255,0.16);border-color:rgba(10,132,255,0.5);">▶ '
          +(sim?L('Recompute','再計算','Neu berechnen','Пересчитать','Recalcular'):L('Compute propagation','伝播を計算','Ausbreitung berechnen','Рассчитать','Calcular propagación'))+'</button>';
      }
      if(lastErr==='land') body+='<div style="font-size:11.5px;color:#ff9f0a;">'
        +L('This epicentre is inland — there is no sea in the model domain.','この震源は内陸で、計算領域に海がありません。',
           'Das Epizentrum liegt im Landesinneren.','Эпицентр на суше — в области нет моря.','El epicentro está tierra adentro.')+'</div>';
      else if(lastErr) body+='<div style="font-size:11.5px;color:#ff453a;">'+String(lastErr).slice(0,120)+'</div>';
      if(sim){
        const cur=sim.frames[Math.round(frame)]||sim.frames[0];
        body+='<div style="display:flex;align-items:center;gap:6px;">'
          +'<button class="tsu-play" style="'+BTN+'">'+(playing?'⏸':'▶')+'</button>'
          +'<input class="tsu-t" type="range" min="0" max="'+(sim.frames.length-1)+'" step="1" value="'+Math.round(frame)+'" style="flex:1;">'
          +'<span style="font-size:11.5px;color:var(--text-main);min-width:64px;text-align:right;">'+fmtHM(cur?cur.t:0)+'</span></div>';
        body+='<label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">'
          +L('Speed','速度','Tempo','Скорость','Velocidad')
          +'<select class="tsu-speed" style="flex:1;'+BTN+'">'
          +[10,30,60,120,300,600].map(s=>'<option value="'+s+'"'+(s===speed?' selected':'')+'>×'+s+'</option>').join('')
          +'</select></label>';
        body+='<label style="font-size:11.5px;color:var(--text-main);display:flex;align-items:center;gap:7px;">'
          +'<input type="checkbox" class="tsu-max"'+(showMax?' checked':'')+'> '
          +L('Show maximum wave height instead','最大波高を表示','Maximale Wellenhöhe zeigen','Показать максимум','Mostrar altura máxima')+'</label>';
        body+='<label style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px;">'
          +L('Opacity','不透明度','Deckkraft','Прозрачность','Opacidad')
          +'<input class="tsu-op" type="range" min="10" max="100" step="5" value="'+Math.round(opacity*100)+'" style="flex:1;"></label>';
        const gm=faultGeom(mw);
        body+='<div style="font-size:11px;color:var(--text-muted);line-height:1.5;border-top:1px solid rgba(128,128,128,0.18);padding-top:6px;">'
          +L('Sea-floor uplift','海底の隆起','Hebung','Поднятие дна','Levantamiento')+' +'+sim.eta0Up.toFixed(2)+' m / '+sim.eta0Down.toFixed(2)+' m<br>'
          +L('Rupture','震源断層','Bruchfläche','Разрыв','Ruptura')+' '+Math.round(gm.L/1000)+' × '+Math.round(gm.W/1000)+' km · '
          +L('slip','平均滑り','Versatz','смещение','deslizamiento')+' '+gm.slip.toFixed(1)+' m<br>'
          +L('Grid','格子','Gitter','Сетка','Malla')+' '+sim.N+'² · '+sim.cellKm+' km · Δt '+sim.dt.toFixed(1)+' s · '+sim.steps+' '+L('steps','ステップ','Schritte','шагов','pasos')+'<br>'
          +L('Peak coastal height (Green’s law)','沿岸最大波高（グリーンの法則）','Küstenhöhe (Green)','Высота у берега (Грин)','Altura costera (Green)')
          +' ~'+sim.coastMax.toFixed(1)+' m'
          +'</div>';
        if(sim.coastAt) body+='<button class="tsu-inund" style="'+BTN+'width:100%;">🌊 '
          +L('Inundation at the worst-hit coast','最大波高地点の浸水域','Überflutung an der Küste','Затопление на берегу','Inundación en la costa')+'</button>';
      }
      body+='<div style="font-size:10px;color:var(--text-muted);line-height:1.45;border-top:1px solid rgba(128,128,128,0.18);padding-top:6px;">'
        +L('Linear shallow-water equations on a spherical staggered grid; depth from the terrarium DEM; initial sea-floor displacement from Okada (1985) with Wells & Coppersmith (1994) fault dimensions and the strike read off the local bathymetric gradient. Cells are tens of kilometres, so this is an open-ocean model: arrival times and deep-water amplitude are meaningful, harbour resonance and run-up are not. Coastal height is a Green’s-law estimate. Educational model — in a real emergency follow the official authorities.',
           '球面のスタッガード格子上で線形浅水方程式を解いています。水深はterrarium DEM、初期海底変位はOkada (1985)、断層寸法はWells & Coppersmith (1994)、走向は局所的な海底勾配から求めています。格子は数十kmなので外洋モデルです：到達時刻と沖合の波高は意味を持ちますが、港湾の共振や遡上は表現できません。沿岸波高はグリーンの法則による推定です。教育目的のモデルであり、実際の災害時は公的機関の指示に従ってください。',
           'Lineare Flachwassergleichungen auf einem sphärischen Versetzungsgitter; Tiefe aus dem terrarium-DEM; Anfangsverschiebung nach Okada (1985), Bruchmaße nach Wells & Coppersmith (1994), Streichen aus dem lokalen Tiefengradienten. Zellen sind zig Kilometer groß — ein Modell für die offene See. Küstenhöhe ist eine Green-Abschätzung. Nur Bildungsmodell.',
           'Линейные уравнения мелкой воды на сферической сетке; глубины из terrarium DEM; начальное смещение дна по Okada (1985), размеры разрыва по Wells & Coppersmith (1994), простирание — из локального градиента глубин. Ячейки в десятки километров: модель открытого океана. Высота у берега — оценка по закону Грина. Учебная модель.',
           'Ecuaciones de aguas someras lineales en malla esférica; profundidad del DEM terrarium; desplazamiento inicial según Okada (1985), dimensiones de ruptura según Wells & Coppersmith (1994) y rumbo tomado del gradiente batimétrico local. Las celdas miden decenas de kilómetros: es un modelo de mar abierto. La altura costera es una estimación por la ley de Green. Modelo educativo.')
        +'</div></div>';
      panel.innerHTML=head+body;
      try{ makeDraggable&&makeDraggable(panel,panel.querySelector('.tsu-head')); }catch(_){}
      const q=(s)=>panel.querySelector(s);
      const c=q('.tsu-close'); if(c) c.onclick=()=>close();
      const r=q('.tsu-run'); if(r) r.onclick=()=>{ build(); };
      const hs=q('.tsu-hours'); if(hs) hs.onchange=()=>{ hours=+hs.value||6; stale=true; render(); };
      const pl=q('.tsu-play'); if(pl) pl.onclick=()=>{ playing?pause():play(); };
      const tr=q('.tsu-t'); if(tr) tr.oninput=()=>{ pause(); setFrame(+tr.value); };
      const sp=q('.tsu-speed'); if(sp) sp.onchange=()=>{ speed=+sp.value||60; };
      const mx=q('.tsu-max'); if(mx) mx.onchange=()=>{ showMax=!!mx.checked; paint(); render(); };
      const op=q('.tsu-op'); if(op) op.oninput=()=>{ opacity=Math.max(0.1,Math.min(1,(+op.value||85)/100));
        try{ GE().layers.setPaint(LYR,'raster-opacity',opacity); }catch(_){} };
      const iu=q('.tsu-inund'); if(iu) iu.onclick=()=>openInundation();
    }
    /* the LAST kilometre, which this grid cannot resolve — handed to the model that can (js/sims.js) */
    function openInundation(){
      if(!sim||!sim.coastAt) return false;
      const D2=window.IntMapDisaster; if(!D2||!D2.open) return false;
      try{ D2.open({ lng:sim.coastAt[0], lat:sim.coastAt[1], hazard:'tsunami', waveH:Math.max(1,Math.round(sim.coastMax)) }); }catch(_){ return false; }
      return true;
    }

    /* ---- lifecycle -------------------------------------------------------------------------------- */
    function open(o){
      o=o||{};
      ensurePanel();
      if(o.lng!=null&&o.lat!=null) epi=[+o.lng,+o.lat];
      if(o.mw!=null) mw=Math.max(6,Math.min(9.6,+o.mw));
      if(o.depth!=null) depthKm=Math.max(0,Math.min(200,+o.depth));
      if(o.hours!=null) hours=Math.max(1,Math.min(24,+o.hours));
      opened=true; panel.style.display='flex'; stale=true; render();
      if(epi&&o.run!==false) build();
      return true;
    }
    function close(){ opened=false; pause(); seq++; busy=false;
      if(panel) panel.style.display='none'; clearPaint(); return true; }

    return { open, close, play, pause, setFrame, setTime:setTimeS,
      setHours(h){ hours=Math.max(1,Math.min(24,+h||6)); stale=true; if(opened) render(); return true; },
      setSpeed(s){ speed=Math.max(1,Math.min(3600,+s||60)); if(opened) render(); return true; },
      setOpacity(v){ opacity=Math.max(0.1,Math.min(1,+v>1?(+v/100):+v)); try{ GE().layers.setPaint(LYR,'raster-opacity',opacity); }catch(_){} return opacity; },
      showMaximum(v){ showMax=!!v; paint(); if(opened) render(); return showMax; },
      run:()=>build(), openInundation,
      /* the model's own answer at one place — arrival time and the biggest crest it ever sees */
      at(lng,lat){ if(!sim) return null;
        const i=Math.floor((((+lng-sim.wLng+540)%360-180+360)%360)/((sim.eLng-sim.wLng)/sim.N));
        const j=Math.floor((+lat-sim.sLat)/((sim.nLat-sim.sLat)/sim.N));
        if(!(i>=0&&j>=0&&i<sim.N&&j<sim.N)) return null;
        const k=j*sim.N+i; if(sim.h[k]<=0) return null;
        return { depthM:Math.round(sim.h[k]), maxM:+sim.emax[k].toFixed(3),
          arrivalS:(sim.tarr[k]>=0)?Math.round(sim.tarr[k]):null,
          /* Green's law only where the linear solution it shoals is still valid — see build() */
          coastalM:(sim.h[k]>=200)?+(sim.emax[k]*Math.pow(sim.h[k]/10,0.25)).toFixed(2):null }; },
      state:()=>({ open:opened, epi:epi?epi.slice():null, mw, depthKm, hours, speed, opacity, showMax,
        busy, pct, stale, err:lastErr, playing:!!playing, frame:Math.round(frame),
        sim:sim?{ N:sim.N, cellKm:sim.cellKm, dt:+sim.dt.toFixed(2), steps:sim.steps, frames:sim.frames.length,
          totalS:sim.total, upliftM:+sim.eta0Up.toFixed(2), subsidenceM:+sim.eta0Down.toFixed(2),
          strike:Math.round(sim.strike), dipDeg:sim.dipDeg, slipM:+sim.fault.slip.toFixed(1),
          faultKm:[Math.round(sim.fault.L/1000),Math.round(sim.fault.W/1000)],
          coastMaxM:+sim.coastMax.toFixed(2), coastAt:sim.coastAt, seaCells:sim.seaCells,
          demTiles:sim.demTiles, demMissing:sim.demMissing, noData:sim.noData,
          cMaxMs:sim.cMax, ms:sim.ms }:null }) };
  })();
};
