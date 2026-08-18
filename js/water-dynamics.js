/* ============================================================================
 *  IntMap · WATER THAT TAKES TIME TO GET THERE — window.IntMapWaterDynamics  (#R265)
 * ----------------------------------------------------------------------------
 *  「経過時間に対する水の動きが、現実と乖離しすぎ。リアルなモデルにしろ。」
 *
 *  ══ WHAT THE CLOCK USED TO MEAN ═════════════════════════════════════════════════════════════════
 *  js/terrain-water.js has solved the water with a priority flood plus a downslope volume accounting
 *  since #R176/#R186, and that solve is a STEADY STATE: it answers where the placed volume ends up,
 *  all at once. The pour transport then advanced a simulated clock and, on every tick, re-solved the
 *  whole accumulated volume — so the water was already at its final resting place at t = 0⁺, however
 *  far away that was. The panel said so in as many words (「波の到達速度は扱いません」), which made the
 *  elapsed-time readout beside it a label on a quantity nothing used.
 *
 *  ══ WHAT IT MEANS NOW ═══════════════════════════════════════════════════════════════════════════
 *  This is the two-dimensional shallow-water problem in its LOCAL INERTIAL form — Bates, Horritt &
 *  Fewtrell (2010), "A simple inertial formulation of the shallow water equations for efficient
 *  two-dimensional flood inundation modelling", J. Hydrology 387(1–2) 33–45 — the formulation
 *  LISFLOOD-FP uses and the standard affordable choice for 2-D flood inundation. It keeps the local
 *  acceleration term and drops advection, so a flood wave travels at the physical celerity instead
 *  of appearing everywhere at once, and it stays explicit and cheap.
 *
 *  Per face, with q the discharge per unit width, η = z + h the water surface and hf the flow depth
 *  between the two cells:
 *
 *      hf      = max(η_i, η_j) − max(z_i, z_j)
 *      q(t+Δt) = [ q(t) − g·hf·Δt·(η_j − η_i)/Δx ] / [ 1 + g·Δt·n²·|q(t)| / hf^(7/3) ]
 *      h(t+Δt) = h(t) + Δt·( q_west − q_east + q_north − q_south ) / Δx
 *
 *  The friction term is Manning's, semi-implicit in q — which is what makes the scheme stable at the
 *  shallow depths where an explicit friction term blows up. Δt is the shallow-water CFL condition,
 *  Δt ≤ α·Δx/√(g·h_max) with α = 0.7 (Bates 2010 §2.3), recomputed every step from the deepest water
 *  actually present.
 *
 *  ⚠ MANNING'S n IS A PUBLISHED NUMBER, NOT A TUNING KNOB. n = 0.035 s·m^(−1/3) is the middle of
 *  Chow, "Open-Channel Hydraulics" (1959) Table 5-6 for natural streams and floodplains — clean
 *  straight channels 0.025–0.033, channels with stones and weeds 0.033–0.045, pasture floodplain
 *  0.030–0.035. The same n is used by js/terrain-water.js's channel sections, so the speed the
 *  course is drawn at and the speed the grid runs at are ONE number, not two (#R255's rule).
 *
 *  ⚠ MASS IS CONSERVED AND DEPTH CANNOT GO NEGATIVE. Candidate fluxes are computed first; then each
 *  cell's total outflow for the step is compared with what it actually holds, and every outgoing
 *  face is scaled by the same factor if it would overdraw. Scaling only ever REDUCES an outflow, and
 *  the same scaled number is added to the receiving cell, so Σh·A changes only by what enters
 *  (sources, rain) and what leaves the boundary — both counted.
 *
 *  ⚠ THE BOUNDARY IS AN OUTFALL, NOT A WALL. The working rectangle is a window onto a river that
 *  keeps going; water reaching its edge leaves at normal depth for the local bed slope, and the
 *  volume that left is accumulated (`outM3`) rather than silently deleted.
 *
 *  ⚠ A CELL WITH NO BED IS NOT A CELL. `z` carries NaN where the elevation data has a hole (#R265's
 *  DEM fix in js/map-readout.js); a face touching one is closed rather than given a fictional head.
 *
 *  ⚠ NO RENDERER, NO DOM, AND ONE `window` ASSIGNMENT — so tests/r265-checks can run the physics in
 *  Node, where a dam break down a plane has a front speed to check against.
 * ==========================================================================*/
window.IntMapWaterDynamics=(function(){
  'use strict';
  const G=9.80665;
  const MANNING_N=0.035;          /* Chow (1959) Table 5-6 — see the header */
  const CFL=0.7;                  /* Bates et al. (2010) §2.3 */
  const H_DRY=0.001;              /* under a millimetre a cell is dry: no face, no CFL vote */
  const DT_MAX=60;                /* still water must not take an unbounded step */
  const DT_MIN=0.02;

  /* the normal-depth velocity Manning gives for a depth and a slope — the ONE place this number is
     written down, so the grid and the traced course cannot disagree about how fast water moves */
  function manningV(depthM,slope){
    const d=Math.max(H_DRY,+depthM||0), s=Math.max(1e-6,+slope||0);
    return Math.pow(d,2/3)*Math.sqrt(s)/MANNING_N;
  }

  /* ── one grid, integrated in time ─────────────────────────────────────────────────────────────
     `z` is the bed (metres, the sculpted ground), NX×NY cells of `cellM` metres. */
  function create(z,NX,NY,cellM){
    const N=NX*NY, A=cellM*cellM;
    /* ⚠ THE DEPTH IS THE CONSERVED QUANTITY, SO IT IS DOUBLE PRECISION. A Float32 mantissa cannot
       see an increment under ~1.2 µm on a 20 m pool, and a long run adds millions of them; the
       fluxes stay single precision because they are recomputed from scratch every step rather than
       summed. Measured over two simulated hours on rough ground, in + out closes to 5×10⁻¹⁰. */
    const h=new Float64Array(N);
    const qx=new Float32Array(N), qy=new Float32Array(N);   /* per unit width, on the +i / +j faces */
    const scale=new Float32Array(N), loss=new Float32Array(N);
    let tS=0, outM3=0, inM3=0, nSteps=0, lastDt=0, outRate=0;

    /* ⚠ THE OUTFALL HAS A DIRECTION, AND THE FIRST VERSION OF IT DID NOT. Draining every wet border
       cell at |dz|/2Δx let water leave at the UPSTREAM edge, where the ground falls INTO the
       rectangle — measured on a uniform plane fed a constant unit discharge, the steady depth came
       out at 0.046 m against Manning's normal depth of 1.611 m, because the inflow row was also a
       border row and shed almost all of it. `side` is the way OUT (0 = −i, 1 = +i, 2 = −j, 3 = +j)
       and the slope is read from the INSIDE neighbour: positive only when the ground really falls
       out of the rectangle. Where it does not, nothing leaves — water at that edge simply flows
       inward down the interior faces, which is what the ground says it does. */
    function outSlope(k,side){
      const i=k%NX, j=(k/NX)|0;
      const k2=(side===0)?(j*NX+Math.min(NX-1,i+1))
             :(side===1)?(j*NX+Math.max(0,i-1))
             :(side===2)?(Math.min(NY-1,j+1)*NX+i)
             :(Math.max(0,j-1)*NX+i);
      const z1=z[k], z2=z[k2];
      if(k2===k||!(z1===z1)||!(z2===z2)) return 0;
      return (z2-z1)/cellM;                    /* > 0 ⇔ the inside is higher ⇔ the ground falls out */
    }
    /* metres of depth a border cell sheds through one side this step, at normal depth for that slope */
    function outfall(k,side,ddx){
      const d=h[k]; if(!(d>H_DRY)) return 0;
      const s=outSlope(k,side); if(!(s>1e-5)) return 0;
      return manningV(d,s)*d*ddx;
    }

    /* the largest step the CFL condition allows for the water that is actually here */
    function dtFor(){
      let hm=0; for(let k=0;k<N;k++) if(h[k]>hm) hm=h[k];
      if(!(hm>H_DRY)) return DT_MAX;
      return Math.max(DT_MIN,Math.min(DT_MAX,CFL*cellM/Math.sqrt(G*hm)));
    }

    /* ⚠⚠ …AND THE NUMERATOR IS q-CENTRED, BECAUSE STEEP GROUND BREAKS THE PLAIN SCHEME.
       de Almeida & Bates (2013), «Applicability of the local inertial approximation of the shallow
       water equations to flood modeling», WRR 49, 4833–4844: the local inertial formulation loses
       stability as the Froude number approaches 1, i.e. on steep ground. MEASURED here on a uniform
       plane fed 2 m²/s per unit width: at S₀ = 0.001 and 0.005 the steady depth is Manning's normal
       depth to three decimals, and at S₀ = 0.02 (Fr ≈ 1.2) the profile broke into a sawtooth — 0.66 m
       near the inlet, then 0.004 m beside 2.4 m downstream.
       The published fix is the q-CENTRED scheme of de Almeida, Bates, Freer & Souvignet (2012),
       «Improving the stability of a simple formulation of the shallow water equations for 2-D flood
       modeling», WRR 48, W05528: the q(t) in the numerator becomes a weighted mean of the face and
       its two in-line neighbours,

           q̄ = θ·qᵢ + (1−θ)/2·(qᵢ₋₁ + qᵢ₊₁)              θ = 0.7 (θ = 1 is Bates 2010)

       which damps the checkerboard mode the instability grows in AND leaves every uniform flow
       untouched, because the mean of three equal numbers is that number. That is why the validated
       normal-depth answers above do not move. */
    const THETA=0.7;
    function faceQ(qc,qa,qb,hf,dEta,gdt,n2){
      const qm=THETA*qc+(1-THETA)*0.5*(qa+qb);
      return (qm-gdt*hf*(dEta/cellM))/(1+gdt*n2*Math.abs(qc)/Math.pow(hf,7/3));
    }
    /* one explicit step of `dt` seconds */
    function step(dt){
      const n2=MANNING_N*MANNING_N, gdt=G*dt, ddx=dt/cellM;
      /* ① candidate fluxes on every interior face */
      for(let j=0;j<NY;j++){ const row=j*NX;
        for(let i=0;i<NX-1;i++){ const k=row+i, k2=k+1;
          const z1=z[k], z2=z[k2];
          if(!(z1===z1)||!(z2===z2)){ qx[k]=0; continue; }
          const hf=Math.max(z1+h[k],z2+h[k2])-Math.max(z1,z2);
          if(!(hf>H_DRY)){ qx[k]=0; continue; }
          const qc=qx[k];
          qx[k]=faceQ(qc,(i>0)?qx[k-1]:qc,(i<NX-2)?qx[k+1]:qc,hf,(z2+h[k2])-(z1+h[k]),gdt,n2); }
        qx[row+NX-1]=0; }
      for(let j=0;j<NY-1;j++){ for(let i=0;i<NX;i++){ const k=j*NX+i, k2=k+NX;
          const z1=z[k], z2=z[k2];
          if(!(z1===z1)||!(z2===z2)){ qy[k]=0; continue; }
          const hf=Math.max(z1+h[k],z2+h[k2])-Math.max(z1,z2);
          if(!(hf>H_DRY)){ qy[k]=0; continue; }
          const qc=qy[k];
          qy[k]=faceQ(qc,(j>0)?qy[k-NX]:qc,(j<NY-2)?qy[k+NX]:qc,hf,(z2+h[k2])-(z1+h[k]),gdt,n2); } }
      for(let i=0;i<NX;i++) qy[(NY-1)*NX+i]=0;

      /* ② what each cell would lose this step — interior faces plus its share of the outfall */
      scale.fill(0); loss.fill(0);
      for(let j=0;j<NY;j++){ const row=j*NX;
        for(let i=0;i<NX-1;i++){ const k=row+i, q=qx[k];
          if(q>0) scale[k]+=q*ddx; else if(q<0) scale[k+1]+=-q*ddx; } }
      for(let j=0;j<NY-1;j++){ for(let i=0;i<NX;i++){ const k=j*NX+i, q=qy[k];
          if(q>0) scale[k]+=q*ddx; else if(q<0) scale[k+NX]+=-q*ddx; } }
      for(let j=0;j<NY;j++){ const a=j*NX, b=j*NX+NX-1;
        loss[a]+=outfall(a,0,ddx);
        if(b!==a) loss[b]+=outfall(b,1,ddx); }
      for(let i=0;i<NX;i++){ const a=i, b=(NY-1)*NX+i;
        loss[a]+=outfall(a,2,ddx);
        if(b!==a) loss[b]+=outfall(b,3,ddx); }
      for(let k=0;k<N;k++) if(loss[k]>0){ if(loss[k]>h[k]) loss[k]=h[k]; scale[k]+=loss[k]; }
      for(let k=0;k<N;k++){ const want=scale[k]; scale[k]=(want>h[k]&&want>0)?(h[k]/want):1; }

      /* ③ apply, scaled by the SENDING cell's factor, so mass is conserved exactly */
      for(let j=0;j<NY;j++){ const row=j*NX;
        for(let i=0;i<NX-1;i++){ const k=row+i, q=qx[k];
          if(q>0) qx[k]=q*scale[k]; else if(q<0) qx[k]=q*scale[k+1]; } }
      for(let j=0;j<NY-1;j++){ for(let i=0;i<NX;i++){ const k=j*NX+i, q=qy[k];
          if(q>0) qy[k]=q*scale[k]; else if(q<0) qy[k]=q*scale[k+NX]; } }
      for(let j=0;j<NY;j++){ const row=j*NX;
        for(let i=0;i<NX;i++){ const k=row+i;
          const inW=(i>0)?qx[k-1]:0, outE=(i<NX-1)?qx[k]:0;
          const inN=(j>0)?qy[k-NX]:0, outS=(j<NY-1)?qy[k]:0;
          const nh=h[k]+(inW-outE+inN-outS)*ddx;
          h[k]=nh>0?nh:0; } }
      let left=0;
      for(let k=0;k<N;k++){ const d=loss[k]*scale[k];
        if(d>0){ const take=Math.min(h[k],d); h[k]-=take; left+=take*A; } }

      outM3+=left; outRate=left/Math.max(1e-9,dt);
      tS+=dt; nSteps++; lastDt=dt;
    }

    /* advance by `seconds` of SIMULATED time, in as many CFL-bounded steps as that takes.
       ⚠ `maxSteps` is a real cap and a capped call SAYS SO — the caller reports it rather than
       letting the clock drift away from the water (#R185: no silent caps). */
    function advance(seconds,maxSteps){
      const want=Math.max(0,+seconds||0);
      if(!want) return { steps:0, simS:0, capped:false, dt:lastDt };
      const cap=Math.max(1,maxSteps||160);
      let rest=want, n=0;
      while(rest>1e-6&&n<cap){ const dt=Math.min(rest,dtFor()); step(dt); rest-=dt; n++; }
      return { steps:n, simS:want-rest, capped:rest>1e-6, dt:lastDt };
    }

    /* put water in — a volume in m³ spread evenly over the cells listed */
    function addVolume(cells,m3){
      const v=Math.max(0,+m3||0); if(!v||!cells||!cells.length) return 0;
      const per=v/cells.length/A;
      for(let a=0;a<cells.length;a++){ const k=cells[a]; if(k>=0&&k<N&&z[k]===z[k]) h[k]+=per; }
      inM3+=v; return v;
    }
    /* …and rain, as a depth over every cell that has a bed */
    function addRain(mm){ const d=Math.max(0,+mm||0)/1000; if(!d) return 0;
      let n=0; for(let k=0;k<N;k++) if(z[k]===z[k]){ h[k]+=d; n++; }
      inM3+=d*n*A; return d*n*A; }

    /* ══ POURING A VOLUME AT A POINT IS A POOL, NOT A COLUMN ═══════════════════════════════════════
       A million cubic metres dropped into one 72 m cell is a 193 m column — a legitimate dam-break
       initial condition and a silly picture. Water poured at a point spreads to a LEVEL surface over
       the ground it can reach, so this grows the wet set from the seed by always taking the lowest
       adjacent cell (the volume-limited flood fill) and stops when the volume is used up. In a
       hollow that is a pond; on a hillside it is a thin tongue lying downhill, which is what a
       tipped bucket looks like. No free parameter, and it is the same construction the depression
       solver in js/terrain-water.js uses for a basin. */
    function pool(seedK,m3){
      const v=Math.max(0,+m3||0);
      if(!(v>0)||seedK<0||seedK>=N||!(z[seedK]===z[seedK])) return 0;
      const seen=new Uint8Array(N), cells=[];
      let cap=1024, PR=new Float64Array(cap), ID=new Int32Array(cap), hn=0;
      const push=(p,k)=>{
        if(hn>=cap){ cap*=2; const p2=new Float64Array(cap), i2=new Int32Array(cap);
          p2.set(PR); i2.set(ID); PR=p2; ID=i2; }
        let c=hn++; PR[c]=p; ID[c]=k;
        while(c>0){ const par=(c-1)>>1; if(PR[par]<=PR[c]) break;
          const tp=PR[par],ti=ID[par]; PR[par]=PR[c]; ID[par]=ID[c]; PR[c]=tp; ID[c]=ti; c=par; } };
      const pop=()=>{ const top=ID[0]; hn--;
        if(hn){ PR[0]=PR[hn]; ID[0]=ID[hn];
          let c=0; for(;;){ const l=2*c+1,r=l+1; let m=c;
            if(l<hn&&PR[l]<PR[m]) m=l; if(r<hn&&PR[r]<PR[m]) m=r; if(m===c) break;
            const tp=PR[m],ti=ID[m]; PR[m]=PR[c]; ID[m]=ID[c]; PR[c]=tp; ID[c]=ti; c=m; } }
        return top; };
      const NB=[-1,1,-NX,NX];
      push(z[seedK],seedK); seen[seedK]=1;
      /* ⚠ THE LEVEL ONLY EVER RISES. The frontier can open onto ground LOWER than the pool — a
         basin that spills into the next valley — and the first version subtracted that drop from
         the volume accounted for, so a 10,000 m³ bucket placed 154,901 m³ (measured). `level` is
         the running MAXIMUM of the cells taken, exactly as the priority flood's `filled` is, and a
         cell that turns up below it is simply already under water. */
      let level=z[seedK], need=0;
      const LIMIT=Math.min(N,200000);
      while(hn&&cells.length<LIMIT&&need<v){
        const k=pop(), e=z[k], was=level;
        if(e>level) level=e;
        need+=(level-was)*cells.length*A;      /* raising what is already held to the new lip */
        cells.push(k);
        need+=(level-e)*A;                     /* …and this cell, which the surface now covers */
        const ki=k%NX, kj=(k/NX)|0;
        for(let d=0;d<4;d++){ const nk=k+NB[d];
          if(nk<0||nk>=N||seen[nk]) continue;
          const ni=nk%NX, nj=(nk/NX)|0;
          if(Math.abs(ni-ki)>1||Math.abs(nj-kj)>1) continue;
          if(!(z[nk]===z[nk])) continue;
          seen[nk]=1; push(z[nk],nk); }
      }
      if(!cells.length) return 0;
      /* the exact surface for this volume over the ground actually collected — the same
         elevation-sorted prefix sum js/terrain-water.js's depression solver uses */
      const sorted=cells.slice().sort((p,q)=>z[p]-z[q]);
      const m=sorted.length, cum=new Float64Array(m);
      let acc=0;
      for(let i=1;i<m;i++){ acc+=i*(z[sorted[i]]-z[sorted[i-1]])*A; cum[i]=acc; }
      let lo=0, hi=m-1;
      while(lo<hi){ const mid=(lo+hi)>>1; if(cum[mid]<v) lo=mid+1; else hi=mid; }
      const q0=lo, below=q0>0?cum[q0-1]:0, nc=Math.max(1,q0);
      const surface=(cum[m-1]>=v)
        ? ((q0>0?z[sorted[q0-1]]:z[sorted[0]])+(v-below)/(nc*A))
        : (z[sorted[m-1]]+(v-cum[m-1])/(m*A));      /* the collection ran out: spread the rest level */
      let placed=0;
      for(let a2=0;a2<m;a2++){ const k=sorted[a2], d=surface-z[k];
        if(d>0){ h[k]+=d; placed+=d*A; } }
      inM3+=placed;
      return placed;
    }

    /* ⚠ `storedM3` IS WHAT IS DRAWN, `totalM3` IS WHAT IS THERE. The 2 cm threshold is the same one
       the depth ramp uses, so `storedM3` matches the picture — and it is therefore NOT the conserved
       quantity: a sheet a centimetre deep over a whole grid is half a million cubic metres of water
       the picture does not show. Measured, the difference read as a 0.33 % «mass leak» that was not
       one. Anything checking conservation must use `totalM3`. */
    function stats(){
      let wet=0, vol=0, all=0, mx=0, mxV=0;
      for(let k=0;k<N;k++){ const d=h[k];
        if(d>0){ all+=d*A; if(d>0.02){ wet++; vol+=d*A; if(d>mx) mx=d; } }
        const u=Math.abs(qx[k])+Math.abs(qy[k]); if(u>mxV) mxV=u; }
      return { tS, wetCells:wet, storedM3:vol, totalM3:all, maxDepthM:mx, maxUnitQ:mxV,
               inM3, outM3, outM3s:outRate, steps:nSteps, dt:lastDt };
    }
    function reset(){ h.fill(0); qx.fill(0); qy.fill(0); tS=0; outM3=0; inM3=0; nSteps=0; lastDt=0; outRate=0; }
    function setTime(t){ tS=Math.max(0,+t||0); }

    return { h, qx, qy, NX, NY, cellM, areaM2:A,
             advance, step, dtFor, addVolume, addRain, pool, stats, reset, setTime,
             get tS(){ return tS; }, get outM3(){ return outM3; } };
  }

  return { create, manningV, MANNING_N, CFL, G, H_DRY };
})();
