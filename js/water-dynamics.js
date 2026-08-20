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
 *
 *  ══ ⚠⚠⚠ (#R267) THE LATTICE GROWS, BECAUSE THE RIVER DOES ═══════════════════════════════════════
 *  「上流から下流まで全部同じモデル、描画にしろと言っている。」
 *
 *  #R265 gave the WORKING RECTANGLE a clock and left everything past its edge to a second machine —
 *  a walk down the raw DEM that produced a polyline, sized it with Manning cross-sections and
 *  labelled it with ∫ds/c. Two models, two geometries, two clocks, joined at a rectangle: measured
 *  on the shipped build, that second machine put 99.2 km of the Fuji valley 184.8 DAYS away
 *  (0.0062 m/s) and drew all of it at t = 0, and its longest dead-straight run was 1,120 m across
 *  ground with 5.9 m of relief. Both reported symptoms live entirely on that side.
 *
 *  There is no second machine now. `grow()` re-lays the SAME state vector on a LARGER lattice of the
 *  SAME cells — the water, the fluxes and the arrival times are copied cell for cell, the new ground
 *  is handed in by the caller — so the model simply keeps going wherever the water goes. Nothing
 *  interpolates, nothing hands over, and there is no path anywhere in this file to be straight.
 *
 *  ⚠ `tArr` IS THE TRAVEL TIME, AND IT IS A MEASUREMENT RATHER THAN A FORMULA. The first time a cell
 *  holds drawable water the clock is written into it. «When does it get there» is then read off the
 *  same integration that draws the water, so the two cannot disagree — which is exactly what they
 *  did when one was ∫ds/c and the other was Σdt.
 * ==========================================================================*/
window.IntMapWaterDynamics=(function(){
  'use strict';
  const G=9.80665;
  const MANNING_N=0.035;          /* Chow (1959) Table 5-6 — see the header */
  const CFL=0.7;                  /* Bates et al. (2010) §2.3 */
  const H_DRY=0.001;              /* under a millimetre a cell is dry: no face, no CFL vote */
  /* ══ ⚠⚠⚠ (#R267) THE ARRIVAL CLOCK IS THE LEADING EDGE, NOT THE DRAWN EDGE ═════════════════════
     The first version stamped `tArr` when a cell passed H_DRAW — the depth the picture starts at —
     so that «the water has arrived» and «there is water drawn» would be one threshold instead of
     two. MEASURED on the Fuji valley, that made `jumpCells` report 1 cell in 33,450 as water that
     did not flow in, and the reading was CORRECT: on a bed that falls by more than 2 cm per cell —
     0.03 % at a 71 m cell, i.e. almost everywhere — an upstream cell holding 1 cm can fill its
     downstream neighbour past 2 cm, so the neighbour crosses the drawn threshold while the cell
     that filled it never does. The threshold was wrong, not the physics.
     Any water at all is the only threshold that makes the invariant exact, because a face carries
     flux only when the flow depth between the two cells exceeds H_DRY — so a cell can hold water
     only if a neighbour held water first. And it is also the better answer to 「何時間後にここへ
     届くか」: a flood wave arrives when its leading edge arrives, not when it is deep enough to
     colour a pixel. H_DRAW stays as what it is — the DRAWING threshold, used by the picture. */
  const H_DRAW=0.02;
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
    let N=NX*NY; const A=cellM*cellM;
    /* ⚠ THE DEPTH IS THE CONSERVED QUANTITY, SO IT IS DOUBLE PRECISION. A Float32 mantissa cannot
       see an increment under ~1.2 µm on a 20 m pool, and a long run adds millions of them; the
       fluxes stay single precision because they are recomputed from scratch every step rather than
       summed. Measured over two simulated hours on rough ground, in + out closes to 5×10⁻¹⁰. */
    let h=new Float64Array(N);
    let qx=new Float32Array(N), qy=new Float32Array(N);     /* per unit width, on the +i / +j faces */
    let scale=new Float32Array(N), loss=new Float32Array(N);
    /* (#R267) when this cell first held drawable water — the travel time, measured off the run that
       draws it. NaN until the water arrives; survives grow() like every other part of the state. */
    let tArr=new Float32Array(N).fill(NaN);
    /* ⚠ (#R267) WHICH CELLS WERE *PLACED* IN RATHER THAN FLOWED INTO. The instrument that replaces
       #R261–#R265's «how many cells long is this leg» is: a cell can only be wet because a face
       carried water into it, so every wet cell must have a neighbour that got wet EARLIER — unless
       water was put there directly. Without this flag that check cannot tell the two apart, and an
       instrument that cannot tell them apart is the shape of failure this project has paid for
       nine times ([[intmap-recurring-lessons]]). */
    let seed=new Uint8Array(N);
    let tS=0, outM3=0, inM3=0, nSteps=0, lastDt=0, outRate=0, lastMaxDh=0;
    /* ══ ⚠⚠ (#R267) THE STEP RUNS OVER THE WATER, NOT OVER THE WORLD ════════════════════════
       The basin grows to follow a river, and a river is long and thin: MEASURED on the Fuji valley,
       24 simulated hours wet 9,739 of 120,576 cells (8 %) and the sweep cost the same either way.
       The CFL condition is exactly the statement that water cannot cross more than one cell in one
       step, so a box around the wet cells plus a margin of BOX_MARGIN cells is provably still ahead
       of the water for BOX_MARGIN steps — and outside it every depth is zero, every face is closed
       and every flux is zero, so skipping it changes nothing at all. Re-measured every BOX_MARGIN
       steps, which costs one O(N) pass per BOX_MARGIN. */
    const BOX_MARGIN=8;
    let bi0=0, bi1=NX-1, bj0=0, bj1=NY-1, boxAge=1e9;
    function refreshBox(){
      let i0=NX, i1=-1, j0=NY, j1=-1;
      for(let j=0;j<NY;j++){ const row=j*NX;
        for(let i=0;i<NX;i++) if(h[row+i]>H_DRY){
          if(i<i0) i0=i; if(i>i1) i1=i; if(j<j0) j0=j; if(j>j1) j1=j; } }
      if(i1<0){ bi0=0; bi1=-1; bj0=0; bj1=-1; }        /* nothing wet: nothing to step */
      else { bi0=Math.max(0,i0-BOX_MARGIN); bi1=Math.min(NX-1,i1+BOX_MARGIN);
             bj0=Math.max(0,j0-BOX_MARGIN); bj1=Math.min(NY-1,j1+BOX_MARGIN); }
      boxAge=0;
    }

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
      let hm=0;
      if(bi1>=bi0){ for(let j=bj0;j<=bj1;j++){ const row=j*NX;
          for(let i=bi0;i<=bi1;i++) if(h[row+i]>hm) hm=h[row+i]; } }
      else for(let k=0;k<N;k++) if(h[k]>hm) hm=h[k];
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
      /* hf^(7/3) = hf² · hf^(1/3); cbrt is markedly cheaper than pow and the value is identical */
      return (qm-gdt*hf*(dEta/cellM))/(1+gdt*n2*Math.abs(qc)/(hf*hf*Math.cbrt(hf)));
    }
    /* one explicit step of `dt` seconds */
    function step(dt){
      const n2=MANNING_N*MANNING_N, gdt=G*dt, ddx=dt/cellM;
      if(boxAge>=BOX_MARGIN) refreshBox();
      boxAge++;
      if(bi1<bi0){ tS+=dt; nSteps++; lastDt=dt; lastMaxDh=0; outRate=0; return; }
      const I0=bi0, I1=bi1, J0=bj0, J1=bj1, IE=Math.min(I1,NX-2), JE=Math.min(J1,NY-2);
      /* ① candidate fluxes on every interior face */
      for(let j=J0;j<=J1;j++){ const row=j*NX;
        for(let i=I0;i<=IE;i++){ const k=row+i, k2=k+1;
          const z1=z[k], z2=z[k2];
          if(!(z1===z1)||!(z2===z2)){ qx[k]=0; continue; }
          const hf=Math.max(z1+h[k],z2+h[k2])-Math.max(z1,z2);
          if(!(hf>H_DRY)){ qx[k]=0; continue; }
          const qc=qx[k];
          qx[k]=faceQ(qc,(i>0)?qx[k-1]:qc,(i<NX-2)?qx[k+1]:qc,hf,(z2+h[k2])-(z1+h[k]),gdt,n2); }
        qx[row+NX-1]=0; }
      for(let j=J0;j<=JE;j++){ for(let i=I0;i<=I1;i++){ const k=j*NX+i, k2=k+NX;
          const z1=z[k], z2=z[k2];
          if(!(z1===z1)||!(z2===z2)){ qy[k]=0; continue; }
          const hf=Math.max(z1+h[k],z2+h[k2])-Math.max(z1,z2);
          if(!(hf>H_DRY)){ qy[k]=0; continue; }
          const qc=qy[k];
          qy[k]=faceQ(qc,(j>0)?qy[k-NX]:qc,(j<NY-2)?qy[k+NX]:qc,hf,(z2+h[k2])-(z1+h[k]),gdt,n2); } }
      for(let i=0;i<NX;i++) qy[(NY-1)*NX+i]=0;

      /* ② what each cell would lose this step — interior faces plus its share of the outfall */
      for(let j=J0;j<=J1;j++){ const row=j*NX;
        for(let i=I0;i<=I1;i++){ scale[row+i]=0; loss[row+i]=0; } }
      for(let j=J0;j<=J1;j++){ const row=j*NX;
        for(let i=I0;i<=IE;i++){ const k=row+i, q=qx[k];
          if(q>0) scale[k]+=q*ddx; else if(q<0) scale[k+1]+=-q*ddx; } }
      for(let j=J0;j<=JE;j++){ for(let i=I0;i<=I1;i++){ const k=j*NX+i, q=qy[k];
          if(q>0) scale[k]+=q*ddx; else if(q<0) scale[k+NX]+=-q*ddx; } }
      if(I0===0||I1===NX-1) for(let j=J0;j<=J1;j++){ const a=j*NX, b=j*NX+NX-1;
        if(I0===0) loss[a]+=outfall(a,0,ddx);
        if(I1===NX-1&&b!==a) loss[b]+=outfall(b,1,ddx); }
      if(J0===0||J1===NY-1) for(let i=I0;i<=I1;i++){ const a=i, b=(NY-1)*NX+i;
        if(J0===0) loss[a]+=outfall(a,2,ddx);
        if(J1===NY-1&&b!==a) loss[b]+=outfall(b,3,ddx); }
      for(let j=J0;j<=J1;j++){ const row=j*NX;
        for(let i=I0;i<=I1;i++){ const k=row+i;
          if(loss[k]>0){ if(loss[k]>h[k]) loss[k]=h[k]; scale[k]+=loss[k]; }
          const want=scale[k]; scale[k]=(want>h[k]&&want>0)?(h[k]/want):1; } }

      /* ③ apply, scaled by the SENDING cell's factor, so mass is conserved exactly */
      for(let j=J0;j<=J1;j++){ const row=j*NX;
        for(let i=I0;i<=IE;i++){ const k=row+i, q=qx[k];
          if(q>0) qx[k]=q*scale[k]; else if(q<0) qx[k]=q*scale[k+1]; } }
      for(let j=J0;j<=JE;j++){ for(let i=I0;i<=I1;i++){ const k=j*NX+i, q=qy[k];
          if(q>0) qy[k]=q*scale[k]; else if(q<0) qy[k]=q*scale[k+NX]; } }
      const tNext=tS+dt; let mdh=0;
      for(let j=J0;j<=J1;j++){ const row=j*NX;
        for(let i=I0;i<=I1;i++){ const k=row+i;
          const inW=(i>0)?qx[k-1]:0, outE=(i<NX-1)?qx[k]:0;
          const inN=(j>0)?qy[k-NX]:0, outS=(j<NY-1)?qy[k]:0;
          const was=h[k], nh=was+(inW-outE+inN-outS)*ddx;
          h[k]=nh>0?nh:0;
          const d=h[k]-was; if(d>mdh) mdh=d; else if(-d>mdh) mdh=-d;
          /* (#R267) the travel time, written once, when the leading edge reaches this cell */
          if(h[k]>0&&!(tArr[k]===tArr[k])) tArr[k]=tNext; } }
      let left=0;
      for(let j=J0;j<=J1;j++){ const row=j*NX;
        for(let i=I0;i<=I1;i++){ const k=row+i, d=loss[k]*scale[k];
          if(d>0){ const take=Math.min(h[k],d); h[k]-=take; left+=take*A; } } }

      outM3+=left; outRate=left/Math.max(1e-9,dt);
      tS+=dt; nSteps++; lastDt=dt; lastMaxDh=mdh;
    }

    /* advance by `seconds` of SIMULATED time, in as many CFL-bounded steps as that takes.
       ⚠ `maxSteps` is a real cap and a capped call SAYS SO — the caller reports it rather than
       letting the clock drift away from the water (#R185: no silent caps). */
    /* ⚠ (#R267)  IS A SECOND, INDEPENDENT CEILING, AND IT EXISTS BECAUSE THE LATTICE GROWS.
       A step budget prices a step as a constant; it is not one — the cost of a step is the size of
       the basin, and the basin follows the flood. MEASURED: 36 simulated hours of a 60,000 m³/s
       release did not return inside several minutes through this door, because by then the sweep
       was over a lattice several times the one the budget was chosen for. Both ceilings report. */
    /* ⚠⚠⚠ (#R267 追記) `onStep(dt)` EXISTS BECAUSE A TAP IS A RATE, NOT A PARCEL. Water owed for a
       whole interval used to be handed over in one lump before the integration started, so a tap at
       60,000 m³/s advanced by half an hour put 1.08×10⁸ m³ into ONE 71 m cell — MEASURED IN
       PRODUCTION, 「max depth 21,290.1 m」 in the panel, which is 1.08e8 / 71.2² to the metre. The
       column drains over the next steps and the flood that results is roughly right, but the depth
       it passes through is not water, and the picture and the readout both show it.
       A discharge is delivered per unit time: `onStep` is called before every step with that step's
       dt, so a tap adds rate·dt and nothing ever exists as a parcel. */
    function advance(seconds,maxSteps,maxMs,onStep){
      const want=Math.max(0,+seconds||0);
      if(!want) return { steps:0, simS:0, capped:false, dt:lastDt, maxDh:0 };
      const cap=Math.max(1,maxSteps||160);
      const ms=Math.max(0,+maxMs||0)||Infinity;
      const t0ms=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
      const el=()=>((typeof performance!=='undefined'&&performance.now)?performance.now():Date.now())-t0ms;
      let rest=want, n=0, mdh=0, over=false;
      while(rest>1e-6&&n<cap){ const dt=Math.min(rest,dtFor());
        if(onStep) onStep(dt);
        step(dt); rest-=dt; n++;
        if(lastMaxDh>mdh) mdh=lastMaxDh;
        if((n&7)===0&&el()>=ms){ over=true; break; } }
      return { steps:n, simS:want-rest, capped:rest>1e-6, dt:lastDt, maxDh:mdh,
               why:over?'time':(rest>1e-6?'steps':null), ms:Math.round(el()) };
    }
    /* ══ ⚠⚠ (#R267) ⏭ IS THIS MODEL RUN TO REST, NOT A DIFFERENT MODEL'S ANSWER ═══════════════════
       「上流から下流まで全部同じモデル」 — so the resting state has to come out of the same integration
       that the running state does. This keeps stepping until the water stops changing: the deepest
       cell moves by less than `stillM` over a whole batch AND nothing is flowing faster than
       `stillQ`. Both budgets are REAL and a run that hits one SAYS SO (`capped`) rather than
       reporting a state that is still moving as «at rest» (#R185: no silent caps). */
    function settle(opt){
      opt=opt||{};
      const maxSteps=Math.max(1,opt.maxSteps||40000);
      const maxS=Math.max(0,opt.maxSeconds||0)||Infinity;
      /* ⚠ (#R267) …AND A WALL-CLOCK BUDGET, BECAUSE ⏭ IS A BUTTON A PERSON PRESSES. A step budget
         alone is not one: the cost of a step is the size of the lattice, which grows with the
         flood, so «30,000 steps» is two seconds on a fresh rectangle and four minutes once the
         basin has followed a river for a day. MEASURED: 96 simulated hours on the Fuji valley did
         not return inside ten minutes. The budget that bites is reported either way (#R185). */
      const t0ms=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
      const maxMs=Math.max(0,opt.maxMs||0)||Infinity;
      const nowMs=()=>((typeof performance!=='undefined'&&performance.now)?performance.now():Date.now())-t0ms;
      const stillM=Math.max(1e-6,opt.stillM||1e-4);      /* a tenth of a millimetre a batch */
      const stillQ=Math.max(1e-9,opt.stillQ||1e-4);
      /* ⚠ (#R275) `onStep` — THE SAME HOOK `advance` TAKES, FOR THE SAME REASON. A source is a rate
         (js/terrain-water.js), so water that has not been delivered yet is still owed while this
         runs; without the hook ⏭ would settle a field the taps had stopped filling and call that
         the resting state. It is optional and the physics does not depend on it. */
      const onStep=(typeof opt.onStep==='function')?opt.onStep:null;
      const t0=tS; let n=0, batches=0;
      for(;;){
        let mdh=0;
        for(let b=0;b<40&&n<maxSteps&&(tS-t0)<maxS;b++){ const dt=dtFor();
          if(onStep) onStep(dt);
          step(dt); n++;
          if(lastMaxDh>mdh) mdh=lastMaxDh; }
        batches++;
        const over=nowMs()>=maxMs;
        let mq=0; for(let k=0;k<N;k++){ const u=Math.abs(qx[k])+Math.abs(qy[k]); if(u>mq) mq=u; }
        if(mdh<stillM&&mq<stillQ) return { steps:n, simS:tS-t0, capped:false, still:true, maxDh:mdh, maxUnitQ:mq, ms:Math.round(nowMs()) };
        if(n>=maxSteps||(tS-t0)>=maxS||over)
          return { steps:n, simS:tS-t0, capped:true, still:false, maxDh:mdh, maxUnitQ:mq,
                   why:over?'time':(n>=maxSteps?'steps':'seconds'), ms:Math.round(nowMs()) };
      }
    }
    /* ══ ⚠⚠⚠ (#R267) THE SAME STATE VECTOR, ON A LARGER LATTICE OF THE SAME CELLS ═════════════════
       The cells do not change size, move or get resampled: cell (i,j) becomes (i+offI, j+offJ) and
       every field — depth, both flux components, and the arrival clock — is copied across
       unchanged. `newZ` is the bed for the WHOLE new lattice, read from the DEM by the caller, and
       it is the only new information. Mass is therefore conserved exactly across a growth (nothing
       is interpolated, nothing is dropped) and there is no seam for the drawing to show, because
       there is no second grid to have a seam WITH.
       ⚠ The face arrays are copied by cell, not by face: `qx[k]` is the face between k and k+1, so a
       cell that was on the old +i border now has an interior face to its right, and that face
       starts at zero — which is the truth (no water has crossed it yet). */
    function grow(nNX,nNY,offI,offJ,newZ){
      nNX=Math.max(1,nNX|0); nNY=Math.max(1,nNY|0); offI=offI|0; offJ=offJ|0;
      if(!newZ||newZ.length!==nNX*nNY) return false;
      if(offI<0||offJ<0||offI+NX>nNX||offJ+NY>nNY) return false;
      const nN=nNX*nNY;
      const nh=new Float64Array(nN), nqx=new Float32Array(nN), nqy=new Float32Array(nN);
      const nt=new Float32Array(nN).fill(NaN);
      const ns=new Uint8Array(nN);
      for(let j=0;j<NY;j++){ const src=j*NX, dst=(j+offJ)*nNX+offI;
        for(let i=0;i<NX;i++){ nh[dst+i]=h[src+i]; nqx[dst+i]=qx[src+i]; nqy[dst+i]=qy[src+i];
          nt[dst+i]=tArr[src+i]; ns[dst+i]=seed[src+i]; } }
      /* a face that WAS the old border is not a face any more — it must not carry the old boundary
         value into the interior, where it would be read as flow that never happened */
      for(let j=0;j<NY;j++) nqx[(j+offJ)*nNX+offI+NX-1]=0;
      for(let i=0;i<NX;i++) nqy[(offJ+NY-1)*nNX+offI+i]=0;
      z=newZ; h=nh; qx=nqx; qy=nqy; tArr=nt; seed=ns;
      boxAge=1e9;                                     /* a new lattice invalidates the active box */
      NX=nNX; NY=nNY; N=nN;
      scale=new Float32Array(nN); loss=new Float32Array(nN);
      return true;
    }
    /* how close the drawable water is to each side, in cells — the caller grows the side the water
       is about to run off. Infinity when nothing is wet: there is nothing to make room for. */
    function wetMargins(){
      let i0=NX, i1=NX, j0=NY, j1=NY, any=false;
      for(let j=0;j<NY;j++){ const row=j*NX;
        for(let i=0;i<NX;i++){ if(!(h[row+i]>H_DRAW)) continue; any=true;
          if(i<i0) i0=i; if(NX-1-i<i1) i1=NX-1-i;
          if(j<j0) j0=j; if(NY-1-j<j1) j1=NY-1-j; } }
      return any?{ w:i0, e:i1, n:j0, s:j1 }:{ w:Infinity, e:Infinity, n:Infinity, s:Infinity };
    }

    /* put water in — a volume in m³ spread evenly over the cells listed */
    function addVolume(cells,m3){
      const v=Math.max(0,+m3||0); if(!v||!cells||!cells.length) return 0;
      const per=v/cells.length/A;
      /* ⚠ (#R267) WATER THAT IS PUT SOMEWHERE HAS ARRIVED THERE. Leaving `tArr` NaN until the next
         step would make the cell invisible to `jumpCells` (no arrival, so nothing to check) and
         would leave the panel's travel time reading «never» for the very cell the reader clicked. */
      for(let a=0;a<cells.length;a++){ const k=cells[a]; if(k>=0&&k<N&&z[k]===z[k]){
        h[k]+=per; seed[k]=1; if(!(tArr[k]===tArr[k])) tArr[k]=tS; } }
      boxAge=1e9; inM3+=v; return v;
    }
    /* …and rain, as a depth over every cell that has a bed */
    function addRain(mm){ const d=Math.max(0,+mm||0)/1000; if(!d) return 0;
      let n=0; for(let k=0;k<N;k++) if(z[k]===z[k]){ h[k]+=d; seed[k]=1;
        if(!(tArr[k]===tArr[k])) tArr[k]=tS; n++; }
      boxAge=1e9; inM3+=d*n*A; return d*n*A; }

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
        if(d>0){ h[k]+=d; seed[k]=1; placed+=d*A;
          if(!(tArr[k]===tArr[k])) tArr[k]=tS; } }
      boxAge=1e9; inM3+=placed;
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
               inM3, outM3, outM3s:outRate, steps:nSteps, dt:lastDt, maxDh:lastMaxDh,
               NX, NY, cells:N };
    }
    function reset(){ h.fill(0); qx.fill(0); qy.fill(0); tArr.fill(NaN); seed.fill(0); boxAge=1e9;
      tS=0; outM3=0; inM3=0; nSteps=0; lastDt=0; outRate=0; lastMaxDh=0; }
    function setTime(t){ tS=Math.max(0,+t||0); }

    /* ══ ⚠⚠⚠ (#R267) THE SYMPTOM, MEASURED ON THE OBJECT THAT REPLACED THE POLYLINE ═══════════════
       「直線で地形を完全無視するクソ区間がある」 — six reports. #R261/#R264/#R265 measured it as leg
       length against cell size, which was the right question about a polyline. The drawn thing is a
       depth field, and the same question about a field is: DID ANY WATER GET SOMEWHERE WITHOUT
       CROSSING THE GROUND IN BETWEEN? Fluxes only ever move water between face neighbours, so every
       wet cell must have a neighbour that became wet no later than it did — unless water was placed
       there. Cells that break that are counted here, and the count must be zero.
       ⚠ THIS IS NOT THE SAME AS «isolated wet cells». A receding tongue legitimately leaves a
       detached puddle, and a check that counted those would report a defect every time water dried
       out — which is how an instrument ends up ignored. This one asks about ARRIVAL, so a puddle
       left behind still has the earlier neighbour it arrived through. */
    function jumpCells(){
      let jumps=0, placed=0, wet=0;
      const NB=[-1,1,-NX,NX,-NX-1,-NX+1,NX-1,NX+1];
      for(let j=0;j<NY;j++){ const row=j*NX;
        for(let i=0;i<NX;i++){ const k=row+i; const t=tArr[k];
          /* ⚠ ANY WATER — see the note on H_DRAW. Asking this at a DRAWING threshold makes it
             report the slope, not a defect, which is how an instrument stops being believed. */
          if(!(h[k]>0)||!(t===t)) continue;
          wet++;
          if(seed[k]){ placed++; continue; }
          let ok=false;
          for(let d=0;d<8&&!ok;d++){ const nk=k+NB[d];
            if(nk<0||nk>=N) continue;
            if(Math.abs((nk%NX)-i)>1) continue;
            const tn=tArr[nk]; if(tn===tn&&tn<=t) ok=true; }
          if(!ok) jumps++; } }
      return { jumps, placedCells:placed, wetCells:wet };
    }
    /* ⚠ (#R267) EVERY FIELD IS A GETTER, because grow() REPLACES the arrays. A consumer that copied
       `S.h` once would go on writing into the lattice the water has already left. */
    return { get h(){ return h; }, get qx(){ return qx; }, get qy(){ return qy; },
             get z(){ return z; }, get tArr(){ return tArr; },
             get NX(){ return NX; }, get NY(){ return NY; }, get cells(){ return N; },
             cellM, areaM2:A,
             advance, step, dtFor, settle, grow, wetMargins, jumpCells,
             get activeBox(){ return { i0:bi0, i1:bi1, j0:bj0, j1:bj1, margin:BOX_MARGIN }; },
             addVolume, addRain, pool, stats, reset, setTime,
             get tS(){ return tS; }, get outM3(){ return outM3; } };
  }

  return { create, manningV, MANNING_N, CFL, G, H_DRY, H_DRAW };
})();
