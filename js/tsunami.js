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
 *  from cells deeper than 200 m, where the linear solution it shoals is still valid.
 *
 *  ── #R197: THE DOMAIN IS THE PLANET, AND THIS IS THE ONLY TSUNAMI MODEL ─────────────────────────
 *  「津波シミュレータのシミュレート範囲は全球に。また、精度と忠実性を根本的に大幅に強化して。
 *    （勝手に災害シミュレータ内の津波シミュレータを起動するな。いまの津波シミュレータだけにして、
 *      災害シミュレータからは津波シミュレータを削除しろ）」
 *
 *  What that changed is written up where each piece lives — the grid and the sea floor in build()
 *  below, the equations and the boundaries in src/tsunami-worker.js. In summary:
 *
 *    · the domain is −180…180 by −80…80 at 0.25°, with LONGITUDE PERIODIC. There is no box for the
 *      wave to run off the edge of, and nothing reflects off an edge that is not there;
 *    · the sea floor is data/bathymetry.png — one bundled image, a measured depth in every cell,
 *      instead of ninety DEM tiles of which #R192 measured 19 % never arriving;
 *    · CORIOLIS is carried (hours of propagation across an ocean is where it starts to matter), the
 *      initial surface adds the Tanioka & Satake (1996) horizontal-displacement term over sloping
 *      sea floor, and the two latitude walls are radiating rather than reflecting;
 *    · the run may be up to 30 hours, which is the far side of the planet and back to the source.
 *
 *  ⚠ AND THE INUNDATION HAND-OFF IS GONE. js/sims.js used to carry a second, unrelated "tsunami" —
 *  a bathtub fill around one coast — that both this panel and the seismic panel could open. There is
 *  now exactly one tsunami in this app, and it is this one.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.tsunami=function(HOST){
  const GE=()=>window.IntMapGeoEngine;
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const makeDraggable=HOST.makeDraggable;
  /* ⚠ (#R197) TWO FEWER THINGS BORROWED FROM THE SHELL. `warmDEMTiles` and `demSnapshot` were this
     module's link to the DEM tile pyramid, and the global model does not use tiles at all — the sea
     floor is data/bathymetry.png (js/bathymetry.js). What is left from HOST is the drag helper and
     the mobile test, neither of which is about the Earth.
     ⚠ (#R205) …AND THEY ARE BACK, BECAUSE THE SOURCE REGION IS EXACTLY WHERE TILES ARE WORTH IT.
     `fineFloor()` reads a local patch of the terrarium DEM around the epicentre — a few dozen tiles
     over ±6°, not the ninety a whole ocean would need, which is the measurement #R197 was reacting
     to. They are taken from HOST rather than referenced freely: the first version of this used the
     bare names and `typeof warmDEMTiles!=='function'` was TRUE on every run, so the patch was
     silently never built (measured: `fineCells: 0` on a Japan Trench M8.6). That is #R194's own
     finding — an inherited free reference fails closed and says nothing — and the reason
     scripts/check-split-scope.mjs exists. */
  const isMobile=HOST.isMobile;
  const warmDEMTiles=HOST.warmDEMTiles, demSnapshot=HOST.demSnapshot;

  window.IntMapTsunami=(function(){
    if(!GE().hasRenderer()) return { open(){}, close(){}, state:()=>({open:false}) };
    const L=window.IntMapLang.pick(()=>HOST.lang);
    const D=Math.PI/180, RE=6371000;
    const DYN='tsu-field', SRC_V='tsu-vec', LYR_EPI='tsu-epi', SRC_ISO='tsu-iso', LYR_ISO='tsu-iso-ln', LYR_ISOL='tsu-iso-lb';

    /* ---- state ---------------------------------------------------------------------------------- */
    let panel=null, opened=false, epi=null, mw=8.5, depthKm=20, minimised=false;   /* (#R210) minimised = body hidden, header kept */
    let rupture=null;   /* (#R212) the free-drawn rupture area, when the seismic panel has one */
    let sim=null;                       /* the built model */
    let busy=false, pct=0, seq=0, jobId=0;
    let tSim=0, playing=0, rafId=0, speed=180;    /* speed = simulated seconds per real second */
    let hours=6, opacity=0.9, showMax=false, showIso=true;
    /* (#R204) which domain the next run uses: 'global' (the planet at 0.25°, #R197) or 'near' (the
       source region at 1/12°). The default is the one #R197 was asked for; this is the extra one. */
    let scope='global';
    let dispAmp=null;                   /* metres at which the ramp saturates; null = automatic */
    let lastErr=null, probe=null;

    /* ⚠ (#R197) THE SOURCE MATHS MOVED TO src/tsunami-worker.js.
       Okada (1985), the Wells & Coppersmith (1994) fault dimensions and the tapered sub-fault grid used
       to be evaluated HERE, over the model grid, on the main thread — 141,000 cells × 24 Okada terms,
       yielded row by row. On a GLOBAL grid that is 921,600 cells and there is no reason for any of it to
       be on the page: the worker already owns the integration, so it now owns the model. This file keeps
       the panel, the picture and the reading of the result — nothing that is arithmetic about elasticity.
       The published verification case travels with the code: tests/r197-checks.test.mjs RUNS okadaUz from
       the worker against Okada Table 2 rather than asserting on its text. */

    /* ---- building the model ---------------------------------------------------------------------- */
    /* ══ (#R197) THE DOMAIN IS THE PLANET ═════════════════════════════════════════════════════════
       0.25° everywhere: 1440 × 640 over −180…180 × −80…80. Two consequences worth stating, because
       both used to be the other way round:

        · the resolution NO LONGER DEPENDS ON THE RUN LENGTH. #R196 cut a box from the reach, so a
          6 h Tōhoku run got 22 km cells and a 24 h run got 40 km ones — the same event modelled at
          two resolutions depending on how long you asked to watch it;
        · there is no box, so there is no edge. Longitude is periodic in the solver, and a wave that
          leaves the western Pacific arrives in the east instead of being absorbed by a sponge.

       ⚠ ±80° AND NOT ±90°. A lat/lon cell at the pole is a sliver, the metric terms divide by cosφ,
       and the bundled sea floor stops at the Mercator limit of ±85.05° in any case. The polar filter
       (src/tsunami-worker.js) is what keeps the time step sane between 60° and 80°.

       ⚠ AND A PHONE GETS THE SAME PHYSICS AT HALF THE PICTURE. `dec` decimates the ANIMATION, not the
       model: 720 × 320 frames on a desktop, 480 × 214 on a phone, against a 1440 × 640 solve in both
       cases. #R193 shrank the grid on mobile, which changed the answer; this changes only the number
       of pixels the answer is drawn into. */
    const NX=1440, NY=640, LAT0=-80, LAT1=80;
    function decNow(){ return (typeof isMobile==='function'&&isMobile())?3:2; }
    function wantFrames(){ return (typeof isMobile==='function'&&isMobile())?90:140; }

    /* ══ (#R204) A SECOND DOMAIN: THE SOURCE REGION, AT FOUR TIMES THE RESOLUTION ═══════════════════
       「津波シミュレータのシミュレーションの精度をもっと高く。特に震源付近は高解像度シミュレーションに。」
       Asked for in #R202 and again in #R203, and deferred twice with a reason: #R203 measured the
       whole-planet grid at 0.25° = 31.2 s for six hours, 1/6° = 63.4 s and 0.125° = 165 s, and
       concluded a nested grid would mean making src/tsunami-worker.js NON-PERIODIC in longitude —
       every flux loop, the light-cone column window and the polar filter wrap `i` — i.e. rewriting
       the inside of the physics that #R192/#R193/#R197 verified. That reasoning was right about a
       longitude BOX and wrong about what a nested domain has to be.

       A LATITUDE BAND AT THE FULL CIRCLE needs none of it. `nx`, `ny`, `lat0` and `lat1` have been
       message parameters since #R197; longitude stays periodic, so not one line of the solver
       changes, and the two latitude walls already have the sponge that #R197 put there. So the fine
       domain is the whole circle at 1/12° over ±BAND° of the source:

           global   1440 × 640 over ±80°     27.8 km at the equator   (unchanged, still the default)
           near     4320 × 240 over src±10°   9.3 km                  desktop
                    2880 × 192 over src±8°   13.9 km                  phone

       ⚠ WHAT IT COSTS IS BOUNDED BY THE LIGHT CONE, NOT BY nx. #R197's cone integrates only the
       columns the wave has reached, so a 4,320-wide grid whose wave has travelled 1,000 km touches
       ~230 columns, and the run is a few seconds. What DOES scale with nx is memory — six Float32
       fields over nx·ny — which is why the band is thin and why the phone gets a coarser one.
       ⚠ AND THE FRAMES STAY THE SIZE THEY WERE. `dec` is raised with the grid (3 → 9 / 6), so a
       near-source frame is the same 480 × 27-ish Int8 the global run streams — the ANIMATION gains
       the band's much finer degrees-per-pixel without the run holding four times the picture.
       The maximum crest, the minimum trough and the first-arrival field come back at FULL grid
       resolution in both scopes (see the worker), so those three are simply 4× finer here.
       ⚠ THE HOURS ARE CAPPED, because the band's own walls are the horizon: ±10° is ~1,110 km, which
       a deep-ocean long wave crosses in about 1.5 h, and past that the sponge is eating the answer.
       The panel says so rather than letting a 24 h near-source run look like a global one.
       ⚠ AND THE SEA FLOOR IS STILL THE BUNDLED 0.25° ONE. data/bathymetry.png is built from AWS
       terrarium z5 (~4.9 km a sample, so a 0.25° cell averages ~30 measured samples); a 1/12° cell
       reads the same image and therefore shares its neighbours' depth. What this scope refines is the
       SOURCE, the numerics and the arrival field — not the bathymetry, and not the coastline, which
       stays a 0.25° staircase. Refining that means a finer bundled floor; it is written down in
       DEV-NOTES as the next step rather than implied by a finer grid. */
    const NEAR_BAND=()=>((typeof isMobile==='function'&&isMobile())?8:9);
    const NEAR_CPD=()=>((typeof isMobile==='function'&&isMobile())?12:20);   /* cells per degree (#R242) */
    const NEAR_MAX_H=3;
    function nearDomain(lat){
      const cpd=NEAR_CPD(), band=NEAR_BAND();
      let a=Math.max(-80,Math.min(80-2*band,lat-band));
      let b=Math.min(80,a+2*band);
      a=Math.max(-80,b-2*band);
      return { nx:Math.round(360*cpd), ny:Math.round((b-a)*cpd), lat0:a, lat1:b, cpd };
    }
    /* ⚠ MEASURED, AND THE FIRST GUESS WAS BACKWARDS. `dec` was set to 9/6 to keep a near-source frame
       the same BYTE SIZE as a global one, and the first run showed why that is the wrong quantity:
       4320 × 240 at dec 9 is 480 × 26, i.e. 1.3 rows a degree against the global run's 2 — the finer
       model was drawn into a COARSER picture. The band is a fortieth of the globe's area, so the same
       byte budget buys far more detail: dec 3 gives 1440 × 80, which is 4 px a degree in both
       directions (twice the global picture) at 115 KB a frame against the global run's 230 KB. */
    /* ══ ⚠⚠⚠ (#R242) THE NEAR PICTURE IS NOT DECIMATED AT ALL, BECAUSE IT IS A WINDOW ═══════════════
       「津波シミュレータの波伝播のアニメーションの解像度を爆発的に上げろ。全部が無理なら半径1000km
         以内のみ。」
       The near scope solves a full-circle band (longitude wraps; #R204 would not change the solver,
       and that is still the right call). The PICTURE never needed the circle: a
       1,000 km radius is ±9° of longitude, so 39/40 of every frame was ocean the wave will not reach
       inside the near scope's own 3-hour cap — sent, companded and drawn, every frame.
       So the worker now crops the frame to a longitude window (src/tsunami-worker.js `winI0/winNx`),
       and the bytes that buys go into resolution instead:

           before   4,320 × 240 grid, dec 3  →  1,440 × 80 picture   4.0 px/°   115 KB a frame
           after    7,200 × 360 grid, dec 1  →    480 × 360 picture  20.0 px/°   173 KB a frame

       — five times the linear detail in longitude and 4.5× in latitude (20× the pixels over the area
       that matters) for one and a half times the bytes. The model grid goes 1/12° → 1/20° (9.3 km →
       5.6 km cells) with the band tightened to ±9° so the memory the solver holds grows by 1.7×
       rather than by 4×. ⚠ The phone keeps a smaller one (1/12°, ±8°, dec 1 → 12 px/°), which is
       still three times its old picture.
       ⚠ WHAT IS UNCHANGED: the global scope, the physics, the sea floor (still the bundled 0.25°
       image plus #R205's measured patch), and the analysis fields, which have always come back at
       full grid resolution. */
    function nearDec(){ return 1; }
    const NEAR_WIN_DEG=()=>((typeof isMobile==='function'&&isMobile())?10:12);   /* half-width of the picture window */
    /* ══ (#R205) THE SEA FLOOR AROUND THE SOURCE, MEASURED RATHER THAN AVERAGED ═══════════════════
       「津波シミュレータのシミュレーションの精度をもっと高く。特に震源付近は高解像度シミュレーションに。」

       #R204 answered this with a finer GRID and said in the same note that the floor under it was
       still the bundled 0.25° image — so nine of its 9.3 km cells shared one 27.8 km depth, and the
       coast the wave shoals on was a 27.8 km staircase. This is the other half: a local patch of the
       terrarium DEM (the same source data/bathymetry.png was built from, four zoom levels deeper)
       around the epicentre, at 1/48° ≈ 2.3 km — twelve times the linear resolution of the bundled
       floor and finer than the model grid in BOTH scopes, so the wet/dry fraction and the mean depth
       of a model cell become averages over ~16 (near) or ~144 (global) real samples instead of a
       single shared number.

       ⚠ IT COSTS ~25 TILES, ONCE. z7 terrarium is 1.2 km a sample at the equator; a ±6° box is about
       5 × 5 of them and they are the same tiles the earthquake panel has already warmed around the
       same epicentre (js/seismic.js warmEpi). Everything outside the box keeps the bundled floor, so
       there is nothing to fall back FROM if the network is unavailable — the patch is simply absent
       and the run is #R204's run exactly.
       ⚠ IT IS THE SOURCE REGION, NOT THE COASTLINE OF THE FAR FIELD. What this fixes is where the
       wave is MADE and its first hour of shoaling. A Chilean source's Japanese landfall is still on
       the 0.25° floor; that needs a finer bundled image, and it stays written down as the next step. */
    /* ⚠ MEASURED, AND THE FIRST CHOICE WAS TOO GREEDY. z7 over ±6° is ~25 terrarium tiles, and the
       run that needs them starts while the EARTHQUAKE panel is still pulling its own field's DEM at
       z8 — six connections to one host, hundreds queued. Measured on a Japan Trench M8.6:
       `demSnapshot` came back **1 of 64** tiles after 9 s, so the patch answered for 14,445 of
       331,776 samples and was discarded whole. z6 is a quarter of the tiles at 2.45 km a sample —
       still eleven times the bundled floor's 27.8 km, and it matches the 1/48° patch cell. */
    const FINE_BOX_DEG=6, FINE_CPD=48, FINE_Z=6, FINE_WARM_MS=12000, FINE_MIN_FRAC=0.15;
    let fineCache=null;                        /* keyed on the epicentre — a re-run at the same source is free */
    /* ⚠ WHY IT IS ABSENT, WHEN IT IS. #R194's rule: an inherited capability that is quietly missing
       looks exactly like a capability that decided not to act. This says which. */
    let fineWhy=null;
    async function fineFloor(my){
      fineWhy=null;
      if(!epi){ fineWhy='noepi'; return null; }
      if(typeof warmDEMTiles!=='function'||typeof demSnapshot!=='function'){ fineWhy='nodem-api'; return null; }
      const key=epi[0].toFixed(3)+'/'+epi[1].toFixed(3);
      if(fineCache&&fineCache.key===key) return fineCache.patch;
      const la=Math.max(-80,Math.min(80,epi[1]));
      const lat0=Math.max(-80,la-FINE_BOX_DEG), lat1=Math.min(80,la+FINE_BOX_DEG);
      const lng0=epi[0]-FINE_BOX_DEG, lng1=epi[0]+FINE_BOX_DEG;
      if(!(lat1>lat0)){ fineWhy='band'; return null; }
      const pts=[]; for(let j=0;j<=8;j++) for(let i=0;i<=8;i++) pts.push([wrapLng(lng0+(lng1-lng0)*i/8), lat0+(lat1-lat0)*j/8]);
      try{ await warmDEMTiles(pts,FINE_Z,FINE_WARM_MS,null); }catch(e){ fineWhy='warm:'+String(e&&e.message||e).slice(0,40); return null; }
      if(my!==seq){ fineWhy='superseded'; return null; }
      let snap=null; try{ snap=demSnapshot(wrapLng(lng0),lat0,wrapLng(lng1),lat1,FINE_Z); }catch(e){ fineWhy='snap:'+String(e&&e.message||e).slice(0,40); return null; }
      if(!snap||!snap.have){ fineWhy='snap-empty:'+(snap?(snap.have+'/'+snap.want):'null'); return null; }
      const w=Math.max(2,Math.round((lng1-lng0)*FINE_CPD)), h=Math.max(2,Math.round((lat1-lat0)*FINE_CPD));
      const d=new Uint16Array(w*h), k=new Uint8Array(w*h);
      let known=0, sea=0;
      for(let j=0;j<h;j++){
        const lat=lat1-(j+0.5)*(lat1-lat0)/h;    /* rows count SOUTH from lat1, like the bundled image */
        for(let i=0;i<w;i++){
          const lng=wrapLng(lng0+(i+0.5)*(lng1-lng0)/w);
          let e=null; try{ e=snap.at(lng,lat); }catch(_){ e=null; }
          if(e==null) continue;
          const o=j*w+i; k[o]=1; known++;
          if(e<0){ d[o]=Math.min(65535,Math.round(-e)); sea++; }
        }
      }
      /* a patch that answered for almost nothing is not a patch — do not let it decide any cell */
      /* ⚠ PARTIAL IS FINE, EMPTY IS NOT. The worker decides per CELL (it needs four answered samples
         inside one), so a patch that covers part of the box refines that part and leaves the rest
         on the bundled floor. What is worth refusing is a patch so sparse that it is noise. */
      if(known < w*h*FINE_MIN_FRAC){ fineWhy='sparse:'+known+'/'+(w*h)+' (dem '+snap.have+'/'+snap.want+')'; fineCache={ key, patch:null }; return null; }
      const patch={ w, h, lat0, lat1, lng0, lng1, d, k, known, sea, z:FINE_Z, cpd:FINE_CPD };
      fineCache={ key, patch };
      return patch;
    }
    /* the run lengths this scope offers, and the one that is actually in force — the near band's
       walls are its horizon, so a 24 h selection made in the global scope is clamped rather than
       silently solved past the point where the sponge is eating the answer. */
    function hourChoices(){ return scope==='near'?[1,2,3]:[3,6,9,12,18,24,30]; }
    function effHours(){ const c=hourChoices(); let best=c[0];
      for(const h of c) if(Math.abs(h-hours)<Math.abs(best-hours)) best=h;
      return (c.indexOf(hours)>=0)?hours:best; }

    const wrapLng=(v)=>((v+540)%360)-180;
    const latOfIdx=(j)=>LAT0+(j+0.5)*(LAT1-LAT0)/NY;
    const lngOfIdx=(i)=>-180+(i+0.5)*360/NX;

    async function build(){
      if(!epi){ lastErr='no epicenter'; render(); return; }
      const my=++seq; busy=true; pct=0; lastErr=null; probe=null; sim=null; tSim=0; playing=0;
      clearPaint(); render();
      const t0=performance.now();
      try{
        const H=Math.max(1,Math.min(scope==='near'?NEAR_MAX_H:30,effHours()));
        /* ── the sea floor: one bundled image, not ninety tiles ─────────────────────────────────
           #R192 measured 34 of 160 DEM tiles missing the timeout on an ocean-wide box, and 19 % of
           the cells then ran on a constant depth. A global domain cannot ask the network at all:
           data/bathymetry.png is 0.25° over the whole world, 1.26 MB, cached after the first run,
           and every cell in it has a measured depth. */
        const B=window.IntMapBathymetry;
        if(!B){ lastErr='nobathy'; busy=false; render(); return; }
        pct=4; render();
        const okB=await B.warm();
        if(my!==seq) return;
        if(!okB){ lastErr='nobathy'; busy=false; render(); return; }
        pct=8; render();

        /* ⚠ EVERYTHING ELSE HAPPENS IN THE WORKER. The sea floor, the fault, Okada over the sub-fault
           grid and the integration are one job now: the main thread posts the parameters and a copy
           of the bathymetry, and gets back a model. #R193 still built the grid and the initial surface
           here, in yielded row loops, which on a global grid would be 921,600 cells of trigonometry
           between two animation frames. */
        const W=window.IntMapTsunamiWorker;
        if(!W||!W.available()){ lastErr='noworker'; busy=false; render(); return; }

        /* (#R204) the domain this run uses — the planet, or the source region at 4× (see nearDomain) */
        const near=(scope==='near');
        const D=near?nearDomain(epi[1]):{ nx:NX, ny:NY, lat0:LAT0, lat1:LAT1 };
        const dec=near?nearDec():decNow();
        const latOfD=(j)=>D.lat0+(j+0.5)*(D.lat1-D.lat0)/D.ny;
        const lngOfD=(i)=>-180+(i+0.5)*360/D.nx;
        sim={ nx:D.nx, ny:D.ny, lat0:D.lat0, lat1:D.lat1, dec, fx:0, fy:0, scope,
              land:null, landD:null, depth:null, frames:[], nFrames:0, total:H*3600, amp:1,
              latOf:latOfD, lngOf:lngOfD, running:true, emax:null, emin:null, tarr:null,
              coastMax:0, coastAt:null, hours:H };

        const onModel=(m)=>{
          if(my!==seq||!sim) return;
          sim.fx=m.fx; sim.fy=m.fy; sim.dec=m.dec;
          sim.winI0=m.winI0|0; sim.winNx=m.winNx|0; sim.lng0=m.lng0; sim.lng1=m.lng1;   /* (#R242) the picture's window */
          sim.land=new Uint8Array(m.land); sim.landD=new Uint8Array(m.landD); sim.depth=new Int16Array(m.depth);
          sim.dt=m.dt; sim.steps=m.steps; sim.total=m.total; sim.nFrames=m.nFrames; sim.cellKm=m.cellKm;
          sim.strike=m.strike; sim.dipDeg=m.dipDeg; sim.seaCells=m.seaCells; sim.hMax=m.hMax; sim.cMax=m.cMax;
          sim.fineCells=m.fineCells|0;   /* (#R205) how many cells took the measured floor */
          /* (#R223) the model build is half of a run's wall clock — so it is reported, not invisible */
          sim.sourceMs=m.sourceMs|0; sim.okadaCalls=m.okadaCalls|0;
          sim.fault={ L:m.faultL, W:m.faultW, slip:m.slip, M0:m.M0, mw, drawn:!!m.drawnFault };
          sim.eta0Up=m.eta0Up; sim.eta0Down=m.eta0Down;
          installPaint();
          render();
        };
        const onFrames=(fr,nf)=>{
          if(my!==seq||!sim) return;
          sim.nFrames=nf||sim.nFrames;
          for(const f of fr) sim.frames.push({ t:f.t, q:f.q });
          if(sim.frames.length===fr.length){ tSim=0; buildLUT(); paint(); frameCamera(); }
          render();
        };
        /* ══ ⚠ (#R226) THE PANEL WAS REBUILT FOR PROGRESS IT HAD ALREADY DRAWN ═══════════════════════
           「地震と津波の計算速度は品質を下げない範囲で爆速に。」 The solver runs in a worker, so what
           the main thread does during a simulation is exactly this callback — and `render()` rebuilds
           the WHOLE panel (its innerHTML, its numbers, its controls). It ran on every progress message
           the worker sent, including the ones whose rounded percentage was the number already on
           screen, so a run redrew the panel hundreds of times to show the same figure. The main thread
           is also the thread the map draws on, which is what makes it visible as 「遅い」 rather than as
           a busy panel. ⚠ Same number, same panel, written when it changes. */
        const onProg=(p)=>{ if(my!==seq) return; const v=Math.max(pct,Math.round(p));
          if(v===pct) return; pct=v; if(opened) render(); };

        /* (#R205) the measured floor around the source, when the DEM can be had — see fineFloor */
        let fine=null;
        try{ fine=await fineFloor(my); }catch(_){ fine=null; }
        if(my!==seq) return;
        pct=Math.max(pct,10); render();
        /* (#R242) the picture's longitude window: the source ±NEAR_WIN_DEG, snapped to grid columns.
           A global run sends nothing and gets the whole circle, exactly as before. */
        let winI0=0, winNx=0;
        if(near){ const w=NEAR_WIN_DEG(); winNx=Math.round(2*w*D.nx/360);
          winI0=Math.round((wrapLng(epi[0])-w+180)/360*D.nx); }
        const job=W.run({ nx:D.nx, ny:D.ny, lat0:D.lat0, lat1:D.lat1, dec, winI0, winNx,
                          bathy:B.slice(), src:{ lng:wrapLng(epi[0]), lat:epi[1], mw, depthKm,
                            rupture:rupture?{ ring:rupture.ring, areaKm2:+rupture.areaKm2||0, slipM:+rupture.slipM||0 }:null },
                          fine:fine?{ w:fine.w, h:fine.h, lat0:fine.lat0, lat1:fine.lat1, lng0:fine.lng0, lng1:fine.lng1,
                                      d:fine.d.slice(), k:fine.k.slice() }:null,
                          hours:H, frames:wantFrames(), filtLat:60 }, onFrames, onProg, onModel);
        if(!job){ lastErr='noworker'; busy=false; sim=null; render(); return; }
        jobId=job.id;
        let out=null;
        try{ out=await job.promise; }
        catch(e){ if(my!==seq) return; lastErr=String((e&&e.message)||e)||'solver'; busy=false; sim=null; clearPaint(); render(); return; }
        if(my!==seq) return;
        if(!out){ if(!sim.frames.length){ lastErr='noworker'; busy=false; sim=null; clearPaint(); render(); return; } }
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
        paint(); render();
      }catch(e){ lastErr=String(e&&e.message||e); busy=false; render(); }
    }

    /* The coast, as this grid can see it: a sea cell within two cells of a wall, shoaled from its own
       depth to 10 m by Green's law (η ∝ h^(−1/4)).
       ⚠ ONLY FROM CELLS WHERE THE LINEAR THEORY STILL HOLDS (#R192): the first version took the
       shallowest cell it could find, where η/h was already 0.16, and reported 27 m off Sanriku — the
       model's own arithmetic run past its validity, not a forecast. */
    function coastal(){
      if(!sim||!sim.emax||!sim.land) return;
      const nx=sim.nx, ny=sim.ny, land=sim.land, emax=sim.emax;
      let best=0, at=null;
      /* ⚠ (#R197) the neighbourhood WRAPS in longitude. On a global grid the column before 0 is
         nx−1, and a coast on the antimeridian (the Aleutians, Fiji, Kamchatka) is a real coast. */
      const nearLand=(i,j)=>{ for(let dj=-2;dj<=2;dj++){ const jj=j+dj; if(jj<0||jj>=ny) continue;
          for(let di=-2;di<=2;di++){ let ii=(i+di)%nx; if(ii<0) ii+=nx;
            if(land[jj*nx+ii]) return true; } } return false; };
      for(let j=1;j<ny-1;j++) for(let i=0;i<nx;i++){
        const k=j*nx+i; if(land[k]) continue;
        const d=sim.depth[k];
        if(d<200) continue;
        if(!nearLand(i,j)) continue;
        const v=emax[k]*Math.pow(d/10,0.25);
        /* ⚠ (#R204) THE RUN'S OWN GRID, NOT THE MODULE CONSTANTS. These two helpers are built from
           NX/NY/LAT0/LAT1 and the near-source scope solves on 4320 × 240 over a 20° band, so reading
           them here reported a coast at longitude 786° — measured, on the first near run. */
        if(v>best){ best=v; at=[sim.lngOf(i),sim.latOf(j)]; }
      }
      sim.coastMax=best; sim.coastAt=at;
    }
    /* The ramp saturates at the 92nd percentile of the maximum-crest field over the sea, not at the
       source. Scaling to the source is what made #R192 invisible: a 6 m uplift beside a 20 cm wave in
       mid-ocean puts the whole far field in the bottom 3 % of the ramp. */
    function autoAmp(){
      if(!sim||!sim.emax||!sim.land) return;
      const v=[]; const emax=sim.emax, land=sim.land;
      /* ⚠ (#R197) EVERY SEVENTH CELL, NOT EVERY THIRD. The grid went from 262,144 cells to 921,600, so
         the same stride would sort 300,000 numbers on the main thread the instant the run finished.
         The quantity wanted is a PERCENTILE of a smooth field, which is exactly the statistic a
         regular subsample estimates well; the stride keeps the sample near the size #R193 already
         sorted, and the sample is spread over the whole ocean rather than over part of it. */
      for(let k=0;k<emax.length;k+=7){ if(land[k]) continue; const a=emax[k]; if(a>0.001) v.push(a); }
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
    /* ══ (#R195) THE PICTURE'S ROWS ARE THE RENDERER'S ROWS, NOT THE GRID'S ═══════════════════════
       「アニメーションの位置がおかしい」— and it was, by up to 8° of latitude. The field is sampled at
       equal steps of LATITUDE; a dynamic image is stretched over whatever the renderer's own vertical
       coordinate is, which on the default engine is MERCATOR (js/geo-engine.js has the measurement).
       Painting grid row j into image row N−1−j therefore put the water at the wrong latitude
       everywhere except the two edges of the box, while the epicentre marker and the hour contours —
       real geographic geometry — stayed where they belonged. The wave visibly missed its own source.

       So the painter asks the engine what latitude each image row will be drawn at, and paints the
       grid row that actually lives there. Nearest row, not a blend: the row map below guarantees at
       least one image row per grid row everywhere, so nothing is skipped and nothing is invented —
       and blending across a coastline would smear land into water, which no interpolation of a
       land-masked field can be allowed to do. */
    let imgH=0, imgRows=null, maxD=null;
    /* Where Mercator compresses — towards the equatorial edge of the picture — one image row would
       otherwise have to stand for up to three rows of water, and the crests in between would simply
       not be drawn. Ask for a taller texture instead, capped so a pathological case cannot demand an
       unbounded one. A geographic engine answers 1.0 here and the texture stays fx × fy.
       ⚠ (#R197) THE PICTURE'S GRID IS fx × fy, NOT THE MODEL'S. The frames are area-averaged down by
       `dec` in the worker (a 1440 × 640 Int8 frame is 921 KB and 140 of them is 126 MB), so every row
       number below counts display rows. The analysis fields are still full resolution and `at()`
       reads them there. */
    function chooseImgH(){
      const NY2=sim.fy, c=coords(); if(!c||!NY2) return NY2||1;
      let rows=null; try{ rows=GE().layers.imageRowLatitudes(c,NY2); }catch(_){}
      if(!rows||rows.length!==NY2) return NY2;
      const dLat=(sim.lat1-sim.lat0)/NY2; let worst=1;
      for(let r=1;r<NY2;r++){ const g=Math.abs(rows[r]-rows[r-1])/dLat; if(g>worst) worst=g; }
      return (worst>1.02)?Math.min(2048,Math.ceil(NY2*worst)):NY2;
    }
    function rowMap(H){
      const NY2=sim.fy, c=coords(), map=new Int32Array(H), span=sim.lat1-sim.lat0;
      let rows=null; try{ if(c) rows=GE().layers.imageRowLatitudes(c,H); }catch(_){}
      const clamp=(j)=>(j<0)?0:(j>NY2-1?NY2-1:j);
      if(rows&&rows.length===H&&span>0){
        for(let r=0;r<H;r++) map[r]=clamp(Math.round((rows[r]-sim.lat0)/span*NY2-0.5));
      } else {
        /* an engine that will not say: assume the image runs north→south in equal latitude steps */
        for(let r=0;r<H;r++) map[r]=clamp(NY2-1-Math.round((r+0.5)*NY2/H-0.5));
      }
      return map;
    }
    /* the maximum-crest field, decimated once to the picture's grid — by MAXIMUM, because that field
       IS a maximum and averaging it would report a smaller peak than the model found */
    function maxDecim(){
      if(maxD||!sim||!sim.emax) return maxD;
      const nx=sim.nx, dec=sim.dec, fx=sim.fx, fy=sim.fy, e=sim.emax;
      /* (#R242) the picture may be a WINDOW on the grid (see nearDec) — the same periodic column
         mapping the worker uses, so the crest field lands on the same pixels the frames do. */
      const i0=sim.winI0|0, col=(i,a)=>{ const c=i0+i*dec+a; return c<nx?c:c-nx; };
      const out=new Float32Array(fx*fy);
      for(let j=0;j<fy;j++) for(let i=0;i<fx;i++){
        let m=0;
        for(let b=0;b<dec;b++){ const r=(j*dec+b)*nx; for(let a=0;a<dec;a++){ const v=e[r+col(i,a)]; if(v>m) m=v; } }
        out[j*fx+i]=m;
      }
      maxD=out; return out;
    }

    function drawField(ctx,W2,H2){
      if(!sim||!sim.fx) return;
      const FX=sim.fx;
      if(!imgRows||imgRows.length!==H2){ imgRows=rowMap(H2); imgH=H2; }
      const rowOf=imgRows;
      const im=ctx.createImageData(FX,H2), px=im.data;
      const land=sim.landD;
      if(showMax&&sim.emax){
        /* ⚠ COMPAND IT THE WAY THE FRAMES ARE COMPANDED, against the run's peak A — not against the
           display amplitude. The lookup table already carries the display gain cbrt(A/S), so scaling
           by S here as well would apply it twice and blow the whole field out (measured: a factor of
           two on a Tōhoku run, where A/S is 8.5). One transform, in one place. */
        const A=Math.max(1e-6,sim.amp), emax=maxDecim();
        if(!emax) return;
        for(let r=0;r<H2;r++){ const src=rowOf[r]*FX, dst=r*FX;
          for(let i=0;i<FX;i++){
            const k=src+i; if(land&&land[k]) continue;
            const a=emax[k]/A;
            if(!(a>0)) continue;
            const x=Math.cbrt(a>1?1:a);
            const q=Math.round(x*127), o=(dst+i)*4, li=(q+128)*4;
            px[o]=LUT[li]; px[o+1]=LUT[li+1]; px[o+2]=LUT[li+2]; px[o+3]=LUT[li+3];
          } }
        ctx.putImageData(im,0,0); return;
      }
      if(!sim.frames.length){ ctx.clearRect(0,0,FX,H2); return; }
      const f=framePos(), i0=Math.floor(f), w=f-i0;
      const A0=sim.frames[Math.min(i0,sim.frames.length-1)].q;
      const A1=sim.frames[Math.min(i0+1,sim.frames.length-1)].q;
      for(let r=0;r<H2;r++){ const src=rowOf[r]*FX, dst=r*FX;   /* image row → the grid row drawn there */
        for(let i=0;i<FX;i++){
          const k=src+i; if(land&&land[k]) continue;
          const q=(A0[k]+(A1[k]-A0[k])*w)|0;
          if(q===0) continue;
          const o=(dst+i)*4, li=(q+128)*4;
          const a=LUT[li+3]; if(!a) continue;
          px[o]=LUT[li]; px[o+1]=LUT[li+1]; px[o+2]=LUT[li+2]; px[o+3]=a;
        } }
      ctx.putImageData(im,0,0);
    }

    /* ⚠ (#R197) THE WHOLE WORLD, AND THE FOUR CORNERS SAY SO. A dynamic image is placed by its four
       corners; −180…180 is a full turn, which is exactly what the periodic solver produces. */
    /* (#R242) …and the corners are the WINDOW's, which for a global run is still the full turn. */
    function coords(){ if(!sim) return null; const a=(sim.lng0==null?-180:sim.lng0), b=(sim.lng1==null?180:sim.lng1);
      return [[a,sim.lat1],[b,sim.lat1],[b,sim.lat0],[a,sim.lat0]]; }
    function installPaint(){
      if(!sim||!sim.fx||!_imCanDraw()) return false;
      buildLUT();
      /* (#R195) the engine's vertical parameterisation decides both of these, so they are settled
         here — where the image is (re)created — and re-settled if the engine is ever swapped */
      imgH=chooseImgH(); imgRows=rowMap(imgH);
      try{
        GE().layers.addDynamicImage(DYN,{ width:sim.fx, height:imgH, coordinates:coords(),
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
      imgRows=null; imgH=0; maxD=null;      /* (#R195) the next install re-asks the engine for them */
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
      const nx=sim.nx, ny=sim.ny, tarr=sim.tarr, land=sim.land;
      /* ⚠ ONE PASS OVER THE GRID, NOT ONE PER HOUR. The obvious shape — a marching-squares sweep per
         contour level — walked 512² cells twenty-four times through four closure calls each, and
         measured as a 2.6 s task on this thread, which is precisely the kind of freeze this rebuild
         exists to remove. A cell can only cross the levels between its own corner minimum and
         maximum, which for a travel-time field is almost always none or one, so the levels are tested
         INSIDE a single sweep and the arrays are read directly. */
      const HRS=Math.min(30,Math.ceil(sim.total/3600));
      const segsBy=[]; for(let hh=0;hh<=HRS;hh++) segsBy.push([]);
      const lngOf=sim.lngOf, latOf=sim.latOf;   /* (#R204) the run's grid — see coastal() */
      /* ⚠ (#R197) THE LAST COLUMN'S EASTERN NEIGHBOUR IS THE FIRST. The cell walk stops one short of
         nx in the loop bound and the wrap is handled by `ip`, so the contour closes across ±180
         instead of leaving a seam there — which on a global grid is the middle of the Pacific and
         exactly where the interesting hour lines are. */
      for(let j=0;j<ny-1;j++){
        const r0=j*nx, r1=r0+nx;
        const yA=latOf(j), yB=latOf(j+1);
        for(let i=0;i<nx;i++){
          const ip=(i+1===nx)?0:i+1;
          const k00=r0+i, k10=r0+ip, k01=r1+i, k11=r1+ip;
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
                  'text-size':window.IntMapLabelScale.sub(0.9),'text-font':['literal',['Noto Sans Regular']]},
          paint:{'text-color':'#ffffff','text-halo-color':'rgba(0,0,0,0.75)','text-halo-width':1.3}});
      }catch(_){}
    }
    function applyIso(){ try{
      if(GE().layers.has(LYR_ISO)) GE().layers.setLayout(LYR_ISO,'visibility',showIso?'visible':'none');
      if(GE().layers.has(LYR_ISOL)) GE().layers.setLayout(LYR_ISOL,'visibility',showIso?'visible':'none');
    }catch(_){} }

    /* …and look at it. A wave crossing the Pacific is not visible from whatever view the app happens
       to be on (measured in #R192: the model built correctly and the screenshot showed Africa). */
    /* ⚠ (#R197) ONCE, AND ONLY IF THE VIEW WOULD MISS IT. The domain is the whole planet now, so
       there is no box width to derive a zoom from, and re-framing on every recompute would fight a
       user who has panned to the coast they care about. It runs when the FIRST frames arrive and only
       if the epicentre is not already on screen — #R192's failure (the model built correctly and the
       screenshot showed Africa) stays fixed without taking the camera away from anyone. */
    let framedFor='';
    function frameCamera(){
      if(!sim||!epi) return;
      const key=epi[0].toFixed(2)+','+epi[1].toFixed(2);
      if(framedFor===key) return;
      framedFor=key;
      try{
        const c=GE().camera.get();
        if(c&&isFinite(c.zoom)&&c.zoom<=3.2){
          const dLng=Math.abs(((c.center[0]-epi[0]+540)%360)-180), dLat=Math.abs(c.center[1]-epi[1]);
          if(dLng<50&&dLat<35) return;                 /* the source is already in view — leave it */
        }
        GE().camera.jumpTo({ center:[wrapLng(epi[0]), Math.max(-60,Math.min(60,epi[1]))],
          zoom:2.2, pitch:0 });
      }catch(_){}
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
    /* ══ (#R234) THE SAME TYPE SCALE AND THE SAME TEXT COLOUR AS THE SEISMIC PANEL ═════════════
       「地震シミュレータポップアップのデザインを整理して。津波のポップアップも同様に整理。」 — this
       file had drifted the same way its sibling had: 10, 10.5, 11, 11.5 and 12 px all in one
       column, and --text-muted on labels the reader is meant to read. Two steps, one text colour,
       and the SAME two numbers js/seismic.js uses, so the two panels are one design rather than two
       that resemble each other. Grey survives only on the ×/— window chrome. */
    const FS='12px', FS_S='11px';
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
        +'</span>'
        /* (#R210) same third state as the seismic panel — a solve in flight is not something to
           close just to see the wave it is drawing. See js/seismic.js for the reasoning. */
        +'<button class="tsu-min" title="'+L('Minimize','最小化','Minimieren','Свернуть','Minimizar')+'" aria-label="'+L('Minimize','最小化','Minimieren','Свернуть','Minimizar')+'" style="border:none;background:transparent;color:var(--text-muted);font-size:15px;line-height:1;cursor:pointer;padding:0 4px;">'+(minimised?'▢':'—')+'</button>'
        +'<button class="tsu-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">×</button></div>';
      /* (#R215) the same two-declaration bug js/seismic.js carried — see the note there. */
      let body='<div class="tsu-body" style="padding:10px 12px;display:'+(minimised?'none':'flex')+';flex-direction:column;gap:8px;max-height:74vh;overflow:auto;">';
      if(epi) body+='<div style="font-size:'+FS+';color:var(--text-main);">M '+mw.toFixed(1)+' · '
        +L('depth','深さ','Tiefe','глубина','profundidad')+' '+Math.round(depthKm)+' km · '
        +epi[1].toFixed(2)+', '+epi[0].toFixed(2)+'</div>';
      /* (#R212) a drawn rupture is a different source and the panel says so, with what was taken from it */
      if(rupture) body+='<div style="font-size:'+FS+';color:#7fd4ff;">✏ '
        +L('Rupture area drawn','震源域を描画','Gezeichnete Bruchfläche','Нарисованный очаг','Ruptura dibujada')+' · '
        +Math.round(rupture.areaKm2||0).toLocaleString()+' km² · D̄ '+(+rupture.slipM||0)+' m'
        +(sim&&sim.fault&&sim.fault.drawn?(' · '+L('strike','走向','Streichen','простирание','rumbo')+' '+Math.round(sim.strike||0)+'°'):'')+'</div>';
      /* (#R196) the seismic panel changed the event under us — say so, then recompute (see follow) */
      if(srcPending) body+='<div class="tsu-follow" style="font-size:'+FS+';color:#ffd23f;">'
        +L('The earthquake changed — recomputing the propagation.','地震の条件が変わりました — 伝播を再計算します。',
           'Das Beben hat sich geändert — Ausbreitung wird neu berechnet.','Землетрясение изменилось — пересчёт распространения.',
           'El terremoto cambió — recalculando la propagación.')+'</div>';
      /* (#R204) which domain to solve on — see nearDomain(). The near scope states its own cell size
         and its own horizon, because both are the reason to pick it. */
      { const nd=nearDomain(epi[1]), km=Math.round(111.32/NEAR_CPD());
        body+='<label style="font-size:'+FS+';color:var(--text-main);display:flex;align-items:center;gap:6px;">'
          +L('Domain','計算領域','Gebiet','Область','Dominio')
          +'<select class="tsu-scope" style="flex:1;'+BTN+'">'
          +'<option value="global"'+(scope==='global'?' selected':'')+'>'
            +L('Whole planet · 28 km','全球 · 28 km','Ganzer Planet · 28 km','Вся планета · 28 км','Todo el planeta · 28 km')+'</option>'
          +'<option value="near"'+(scope==='near'?' selected':'')+'>'
            +L('Near source · '+km+' km','震源近傍 · '+km+' km','Nahe der Quelle · '+km+' km','Вблизи очага · '+km+' км','Cerca del origen · '+km+' km')+'</option>'
          +'</select></label>';
        /* (#R242) …and it says what the PICTURE is now, not only what the grid is: the animation is
           drawn undecimated over a window around the source, which is the resolution the reader can
           actually see. */
        if(scope==='near'){ const w=NEAR_WIN_DEG(), pxd=NEAR_CPD();
          body+='<div style="font-size:'+FS_S+';color:var(--text-main);line-height:1.45;">'
          +L('Latitude '+nd.lat0.toFixed(0)+'° to '+nd.lat1.toFixed(0)+'° at '+km+' km cells; the animation is drawn undecimated over ±'+w+'° of the source (about '+Math.round(w*111)+' km), at '+pxd+' pixels per degree. Capped at '+NEAR_MAX_H+' h — past that the wave reaches the band edge.',
             '緯度 '+nd.lat0.toFixed(0)+'°〜'+nd.lat1.toFixed(0)+'° を '+km+' km セルで計算し、震源から±'+w+'°（約'+Math.round(w*111)+' km）の範囲は間引きなし・1度あたり'+pxd+'画素で描画します。'+NEAR_MAX_H+'時間で打ち切り（それ以降は波が帯の端に達します）。',
             'Breite '+nd.lat0.toFixed(0)+'° bis '+nd.lat1.toFixed(0)+'° mit '+km+'-km-Zellen; die Animation wird ±'+w+'° um die Quelle unreduziert gezeichnet ('+pxd+' Pixel pro Grad). Auf '+NEAR_MAX_H+' h begrenzt — danach erreicht die Welle den Bandrand.',
             'Широты '+nd.lat0.toFixed(0)+'°…'+nd.lat1.toFixed(0)+'°, ячейки '+km+' км; анимация рисуется без прореживания в пределах ±'+w+'° от очага ('+pxd+' пикселей на градус). Не более '+NEAR_MAX_H+' ч — далее волна доходит до края полосы.',
             'Latitud '+nd.lat0.toFixed(0)+'° a '+nd.lat1.toFixed(0)+'° con celdas de '+km+' km; la animación se dibuja sin diezmar en ±'+w+'° del origen ('+pxd+' píxeles por grado). Máximo '+NEAR_MAX_H+' h — después la ola alcanza el borde.')
          +'</div>'; } }
      body+='<label style="font-size:'+FS+';color:var(--text-main);display:flex;align-items:center;gap:6px;">'
        +L('Simulate','計算時間','Simulieren','Смоделировать','Simular')
        +'<select class="tsu-hours" style="flex:1;'+BTN+'">'
        /* (#R197) up to 30 h — the far side of the planet and back. Chile→Japan is about 22 h.
           (#R204) the near-source band is bounded by its own walls, so its list stops at NEAR_MAX_H. */
        +hourChoices().map(h=>'<option value="'+h+'"'+(h===effHours()?' selected':'')+'>'+h+' h</option>').join('')
        +'</select></label>';
      if(busy){
        body+='<div style="font-size:'+FS+';color:var(--text-main);">'+L('Computing','計算中','Berechne','Расчёт','Calculando')+'… '+pct+'%'
          +(sim&&sim.frames.length?(' · '+L('playable now','再生できます','abspielbar','можно смотреть','ya reproducible')):'')+'</div>'
          +'<div style="height:6px;border-radius:3px;background:rgba(128,128,128,0.25);overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:#0a84ff;transition:width .2s;"></div></div>';
      } else {
        body+='<button class="tsu-run" style="'+BTN+'width:100%;background:rgba(10,132,255,0.16);border-color:rgba(10,132,255,0.5);">▶ '
          +(sim?L('Recompute','再計算','Neu berechnen','Пересчитать','Recalcular'):L('Compute propagation','伝播を計算','Ausbreitung berechnen','Рассчитать','Calcular propagación'))+'</button>';
      }
      if(lastErr==='nosea') body+='<div style="font-size:'+FS+';color:#ff9f0a;">'
        +L('This epicenter is inland — there is no sea to displace here.','この震源は内陸で、動かす海がありません。',
           'Das Epizentrum liegt im Landesinneren.','Эпицентр на суше — моря здесь нет.','El epicentro está tierra adentro.')+'</div>';
      /* (#R197) the bundled sea floor is the model's one hard requirement, and it says so */
      else if(lastErr==='nobathy') body+='<div style="font-size:'+FS+';color:#ff453a;">'
        +L('The global sea-floor data could not be loaded, so there is nothing to propagate the wave over.',
           '全球の海底地形データを読み込めなかったため、波を伝播させる海がありません。',
           'Die globalen Meeresboden-Daten konnten nicht geladen werden.',
           'Не удалось загрузить глобальные данные о дне океана.',
           'No se pudieron cargar los datos globales del fondo marino.')+'</div>';
      /* (#R197) the polar filter is an approximation, so the run checks itself — see the worker */
      else if(lastErr==='diverged') body+='<div style="font-size:'+FS+';color:#ff453a;">'
        +L('The solution left its physical bounds and was stopped — no picture is shown rather than a wrong one.',
           '解が物理的な範囲を外れたため中止しました。誤った絵を出すより何も出しません。',
           'Die Lösung verließ ihre physikalischen Grenzen und wurde gestoppt.',
           'Решение вышло за физические границы и было остановлено.',
           'La solución salió de sus límites físicos y se detuvo.')+'</div>';
      else if(lastErr==='noworker') body+='<div style="font-size:'+FS+';color:#ff453a;">'
        +L('This browser cannot run the solver in a background thread, so the propagation model is unavailable here.',
           'このブラウザではバックグラウンドスレッドで計算できないため、伝播計算は利用できません。',
           'Dieser Browser kann den Löser nicht in einem Hintergrund-Thread ausführen.',
           'Этот браузер не может выполнить расчёт в фоновом потоке.',
           'Este navegador no puede ejecutar el solucionador en un hilo de fondo.')+'</div>';
      else if(lastErr) body+='<div style="font-size:'+FS+';color:#ff453a;">'+String(lastErr).slice(0,120)+'</div>';
      if(sim&&sim.frames.length){
        const end=sim.frames[sim.frames.length-1].t;
        body+='<div style="display:flex;align-items:center;gap:6px;">'
          +'<button class="tsu-play" style="'+BTN+'min-width:34px;">'+(playing?'⏸':'▶')+'</button>'
          +'<input class="tsu-t" type="range" min="0" max="'+Math.round(end)+'" step="1" value="'+Math.round(tSim)+'" style="flex:1;">'
          +'<span class="tsu-clock" style="font-size:'+FS+';color:var(--text-main);min-width:60px;text-align:right;font-variant-numeric:tabular-nums;">'+fmtHM(tSim)+'</span></div>';
        body+='<label style="font-size:'+FS+';color:var(--text-main);display:flex;align-items:center;gap:6px;">'
          +L('Speed','速度','Tempo','Скорость','Velocidad')
          +'<select class="tsu-speed" style="flex:1;'+BTN+'">'
          +[60,120,180,300,600,1200].map(s=>'<option value="'+s+'"'+(s===speed?' selected':'')+'>×'+s+'</option>').join('')
          +'</select></label>';
        body+='<label style="font-size:'+FS+';color:var(--text-main);display:flex;align-items:center;gap:6px;">'
          +L('Wave scale','波の階調','Wellenskala','Шкала волны','Escala de ola')
          +'<input class="tsu-amp" type="range" min="-2.2" max="1.4" step="0.05" value="'+Math.log10(ampNow()).toFixed(2)+'" style="flex:1;">'
          +'<span style="font-size:'+FS+';color:var(--text-main);min-width:52px;text-align:right;">±'+(ampNow()<1?(ampNow()*100).toFixed(0)+' cm':ampNow().toFixed(1)+' m')+'</span></label>';
        body+='<label style="font-size:'+FS+';color:var(--text-main);display:flex;align-items:center;gap:7px;">'
          +'<input type="checkbox" class="tsu-max"'+(showMax?' checked':'')+'> '
          +L('Maximum wave height instead','最大波高を表示','Maximale Wellenhöhe','Показать максимум','Altura máxima')+'</label>';
        body+='<label style="font-size:'+FS+';color:var(--text-main);display:flex;align-items:center;gap:7px;">'
          +'<input type="checkbox" class="tsu-iso"'+(showIso?' checked':'')+'> '
          +L('Travel-time contours (hours)','到達時間の等値線（時間）','Laufzeitlinien (Stunden)','Изохроны добегания (часы)','Isócronas de llegada (horas)')+'</label>';
        body+='<label style="font-size:'+FS+';color:var(--text-main);display:flex;align-items:center;gap:6px;">'
          +L('Opacity','不透明度','Deckkraft','Прозрачность','Opacidad')
          +'<input class="tsu-op" type="range" min="10" max="100" step="5" value="'+Math.round(opacity*100)+'" style="flex:1;"></label>';
        if(probe) body+='<div style="font-size:'+FS+';color:var(--text-main);border-top:1px solid rgba(128,128,128,0.18);padding-top:6px;">'
          +probe.lat.toFixed(2)+', '+probe.lng.toFixed(2)+' — '
          +(probe.arrivalS!=null?(L('first arrival','第1波','erste Welle','первая волна','primera ola')+' '+fmtHM(probe.arrivalS)):L('no wave in this run','この計算時間内に到達なし','keine Welle','волна не дошла','sin ola'))
          +(probe.maxM!=null?(' · '+L('max','最大','max','макс','máx')+' '+(probe.maxM<1?(probe.maxM*100).toFixed(0)+' cm':probe.maxM.toFixed(2)+' m')):'')
          +(probe.coastalM!=null?(' · '+L('at the shore','沿岸換算','an der Küste','у берега','en la costa')+' ~'+probe.coastalM.toFixed(1)+' m'):'')
          +'</div>';
        else body+='<div style="font-size:'+FS_S+';color:var(--text-main);">'
          +L('Click anywhere on the sea to read the arrival time there.','海上をクリックすると、その地点の到達時刻を表示します。',
             'Auf das Meer klicken für die Ankunftszeit dort.','Нажмите на море, чтобы узнать время прихода.','Haz clic en el mar para ver la hora de llegada.')+'</div>';
      }
      if(sim&&!sim.running){
        const gm=sim.fault;
        body+='<div style="font-size:'+FS+';color:var(--text-main);line-height:1.5;border-top:1px solid rgba(128,128,128,0.18);padding-top:6px;">'
          +L('Sea-floor uplift','海底の隆起','Hebung','Поднятие дна','Levantamiento')+' +'+sim.eta0Up.toFixed(2)+' m / '+sim.eta0Down.toFixed(2)+' m<br>'
          +L('Rupture','震源断層','Bruchfläche','Разрыв','Ruptura')+' '+Math.round(gm.L/1000)+' × '+Math.round(gm.W/1000)+' km · '
          +L('mean slip','平均滑り','Versatz','смещение','deslizamiento')+' '+gm.slip.toFixed(1)+' m<br>'
          /* ⚠ (#R204) THE DOMAIN IS NOT ALWAYS THE PLANET ANY MORE, so this line may not say it is. It
             read 「4320×240（全球, 0.25°）」 on the first near-source run — the grid numbers were the
             band's and the description was the global one's, which is the worst of both. */
          +L('Grid','格子','Gitter','Сетка','Malla')+' '+sim.nx+'×'+sim.ny+' ('
          +(sim.scope==='near'
              ? L('near source','震源近傍','nahe Quelle','вблизи очага','cerca del origen')+', '+(360/sim.nx).toFixed(3).replace(/0+$/,'')+'°'
              : L('global','全球','global','глобально','global')+', 0.25°')+') · '
          +sim.cellKm+' km · Δt '+(sim.dt||0).toFixed(1)+' s · '+(sim.steps||0)+' '+L('steps','ステップ','Schritte','шагов','pasos')
          +' · '+((sim.solveMs||0)/1000).toFixed(1)+' s<br>'
          +L('Peak coastal height (Green’s law)','沿岸最大波高（グリーンの法則）','Küstenhöhe (Green)','Высота у берега (Грин)','Altura costera (Green)')
          +' ~'+(sim.coastMax||0).toFixed(1)+' m'
          /* (#R205) the source region's floor: how many cells took the measured DEM instead of the
             bundled 0.25° image, and at what sample spacing — see fineFloor. Absent means absent. */
          +(sim.fineCells?('<br>'+L('Sea floor near the source','震源付近の海底地形','Meeresboden nahe der Quelle','Дно вблизи очага','Fondo cerca del origen')
              +' '+sim.fineCells.toLocaleString()+' '+L('cells at','セルを','Zellen bei','ячеек','celdas a')+' '
              +(111.32/FINE_CPD).toFixed(1)+' km ('+L('measured DEM','実測DEM','gemessenes DEM','измеренный DEM','DEM medido')+')'):'')
          +'</div>';
      }
      /* ══ (#R232) THE METHOD AND THE SOURCES FOLD AWAY; THE WARNING DOES NOT ═════════════════════
         「地震シミュレータのポップアップに書かれた説明や出典等はそのまま書くのではなく折りたたんで記載
           する形式に。注意書き等はそのまま残すように。（津波シミュレータも）」 Same change as the
         seismic panel's, for the same reason and with the same rule: the safety line is OUTSIDE the
         fold, because a notice that can be collapsed is a notice that will be missed. */
      body+='<div style="font-size:'+FS_S+';color:#ffd23f;line-height:1.5;border-top:1px solid rgba(128,128,128,0.18);padding-top:6px;">⚠ '
        +L('Educational model — in a real emergency follow the official authorities.','教育目的のモデルです。実際の災害時は公的機関の指示に従ってください。','Bildungsmodell — im Ernstfall den Behörden folgen.','Учебная модель — в реальной ситуации следуйте указаниям властей.','Modelo educativo — en una emergencia real siga a las autoridades.')
        +'</div>'
        +'<details class="tsu-meth" style="font-size:'+FS_S+';color:var(--text-main);line-height:1.45;">'
        +'<summary style="cursor:pointer;color:var(--text-main);font-size:'+FS_S+';opacity:0.85;list-style:revert;">'
        +L('Method & sources','計算方法と出典','Methode & Quellen','Метод и источники','Método y fuentes')+'</summary>'
        +'<div style="padding-top:4px;">'
        +L('Shallow-water long waves on a spherical staggered grid, with total-depth pressure and Manning bottom friction, solved in a background thread. Depth from the terrarium DEM; initial sea-floor displacement from Okada (1985) summed over a tapered sub-fault grid, with Wells & Coppersmith (1994) fault dimensions and the strike read off the local bathymetric gradient. Cells are tens of kilometers, so this is an open-ocean model: arrival times and deep-water amplitude are meaningful, harbor resonance and run-up are not. Coastal height is a Green’s-law estimate. Educational model — in a real emergency follow the official authorities.',
           '球面のスタッガード格子上で浅水長波（全水深による圧力項＋マニングの底面摩擦）をバックグラウンドスレッドで解いています。水深はterrarium DEM、初期海底変位はOkada (1985) をテーパー付き小断層群で重ね合わせ、断層寸法はWells & Coppersmith (1994)、走向は局所的な海底勾配から求めています。格子は数十kmなので外洋モデルです：到達時刻と沖合の波高は意味を持ちますが、港湾の共振や遡上は表現できません。沿岸波高はグリーンの法則による推定です。教育目的のモデルであり、実際の災害時は公的機関の指示に従ってください。',
           'Flachwasser-Langwellen auf einem sphärischen Versetzungsgitter, mit Gesamttiefen-Druckterm und Manning-Bodenreibung, in einem Hintergrund-Thread gelöst. Tiefe aus dem terrarium-DEM; Anfangsverschiebung nach Okada (1985) über ein Teilbruch-Gitter summiert, Bruchmaße nach Wells & Coppersmith (1994), Streichen aus dem lokalen Tiefengradienten. Zellen sind zig Kilometer groß — ein Modell für die offene See. Küstenhöhe ist eine Green-Abschätzung. Nur Bildungsmodell.',
           'Длинные волны мелкой воды на сферической сетке, с давлением по полной глубине и донным трением Маннинга, расчёт в фоновом потоке. Глубины из terrarium DEM; начальное смещение дна по Okada (1985), просуммированное по сетке подразрывов, размеры разрыва по Wells & Coppersmith (1994), простирание — из локального градиента глубин. Ячейки в десятки километров: модель открытого океана. Высота у берега — оценка по закону Грина. Учебная модель.',
           'Ondas largas en aguas someras sobre malla esférica, con presión de profundidad total y fricción de fondo de Manning, resueltas en un hilo de fondo. Profundidad del DEM terrarium; desplazamiento inicial según Okada (1985) sumado sobre una malla de subfallas, dimensiones de ruptura según Wells & Coppersmith (1994) y rumbo tomado del gradiente batimétrico local. Las celdas miden decenas de kilómetros: es un modelo de mar abierto. La altura costera es una estimación por la ley de Green. Modelo educativo.')
        +'</div></details></div>';
      panel.innerHTML=head+body;
      try{ makeDraggable&&makeDraggable(panel,panel.querySelector('.tsu-head')); }catch(_){}
      const q=(s)=>panel.querySelector(s);
      const c=q('.tsu-close'); if(c) c.onclick=()=>close();
      { const mb=q('.tsu-min'); if(mb) mb.onclick=()=>{ minimised=!minimised; render(); }; }   /* (#R210) */
      const r=q('.tsu-run'); if(r) r.onclick=()=>{ build(); };
      const hs=q('.tsu-hours'); if(hs) hs.onchange=()=>{ hours=+hs.value||6; render(); };
      /* (#R204) changing the domain re-renders (the hour list and the note both depend on it) but does
         NOT recompute: a solve is minutes of somebody's phone, and the button is right there. */
      const sc=q('.tsu-scope'); if(sc) sc.onchange=()=>{ scope=(sc.value==='near')?'near':'global'; hours=effHours(); render(); };
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
    }
    /* ⚠ (#R197) THE HAND-OFF TO js/sims.js IS GONE. It opened the disaster panel's `tsunami` hazard — a
       bathtub fill around one coast — from inside the propagation model's own panel, which is precisely
       「勝手に災害シミュレータ内の津波シミュレータを起動する」. That hazard has been removed; this panel
       reports the coastal height it can defend (Green's law, from cells deeper than 200 m) and stops there. */

    /* ---- reading the model at a point -------------------------------------------------------------- */
    function at(lng,lat){
      if(!sim||!sim.tarr||!sim.land) return null;
      /* ⚠ (#R197) longitude wraps and latitude does not: every meridian is inside the domain, but
         ±80° is a real edge and a click beyond it has no cell rather than the nearest one. */
      const i=Math.floor(((((+lng+180)%360)+360)%360)/(360/sim.nx));
      const j=Math.floor((+lat-sim.lat0)/((sim.lat1-sim.lat0)/sim.ny));
      if(!(i>=0&&j>=0&&i<sim.nx&&j<sim.ny)) return null;
      const k=j*sim.nx+i; if(sim.land[k]) return null;
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
        try{ GE().events.claimClick&&GE().events.claimClick(e); }catch(_){}   /* (#R210) the read-out owns this tap */
        const p=at(ll.lng!=null?ll.lng:ll[0], ll.lat!=null?ll.lat:ll[1]);
        probe=p; render();
      }); }catch(_){}
    }

    /* ══ (#R196) THE SOURCE IS NOT FROZEN AT open() ════════════════════════════════════════════════
       「津波シミュレーターも、初期の地震しか対応していない。」 It was true by construction: epi / mw /
       depthKm were only ever written by `open()`, so whatever the seismic panel happened to be
       describing at the moment the 🌊 button was pressed was the only event this model could ever
       show. Moving the epicentre, redrawing the rupture or changing the magnitude next door left the
       wave on screen belonging to an earthquake that no longer existed — and nothing said so.

       `follow()` is the seismic panel pushing its CURRENT source here (js/seismic.js
       syncTsunamiSource). It does nothing unless this panel is open, ignores a source identical to
       the one already running, and DEBOUNCES: a magnitude spinner emits a change per keystroke and a
       solve is tens of seconds, so the run that starts is the one the user stopped on. `build()`'s
       own `seq` guard retires anything already in flight, and the worker job is aborted with it. */
    let followT=0, srcPending=false;
    /* ⚠ (#R212) THE RUPTURE IS PART OF THE SOURCE'S IDENTITY. Two runs with the same epicentre and
       the same magnitude but different drawn rupture areas are different earthquakes, so the key that
       decides «already run» has to see the ring — otherwise redrawing the rupture next door would be
       silently ignored, which is the same class of fault #R196 fixed for the epicentre itself. */
    const rupKey=(r)=>r&&r.ring&&r.ring.length?('R'+r.ring.length+':'+Math.round(r.areaKm2||0)+':'+(+r.slipM||0).toFixed(2)
      +':'+r.ring[0].map(v=>(+v).toFixed(2)).join(',')):'—';
    const srcKey=()=>(epi?epi[0].toFixed(4)+'/'+epi[1].toFixed(4):'—')+'/'+mw.toFixed(2)+'/'+depthKm.toFixed(1)+'/'+rupKey(rupture);
    let ranKey=null;
    function follow(o){
      o=o||{};
      if(!opened||o.lng==null||o.lat==null||!isFinite(+o.lng)||!isFinite(+o.lat)) return false;
      const nMw=(o.mw!=null&&isFinite(+o.mw))?Math.max(6,Math.min(9.6,+o.mw)):mw;
      const nD=(o.depth!=null&&isFinite(+o.depth))?Math.max(0,Math.min(200,+o.depth)):depthKm;
      const nR=(o.rupture&&o.rupture.ring&&o.rupture.ring.length>=3)?o.rupture:null;
      const want=(+o.lng).toFixed(4)+'/'+(+o.lat).toFixed(4)+'/'+nMw.toFixed(2)+'/'+nD.toFixed(1)+'/'+rupKey(nR);
      if(want===srcKey()&&want===ranKey&&!srcPending) return false;    /* already this event, already run */
      if(want===srcKey()&&srcPending) return true;                     /* same edit, timer already armed */
      epi=[+o.lng,+o.lat]; mw=nMw; depthKm=nD; rupture=nR;
      srcPending=true; render();                    /* the header shows the new source at once */
      clearTimeout(followT);
      followT=setTimeout(()=>{ srcPending=false; if(!opened) return; ranKey=srcKey(); build(); },900);
      return true;
    }
    /* ---- lifecycle -------------------------------------------------------------------------------- */
    function open(o){
      o=o||{};
      ensurePanel();
      if(o.lng!=null&&o.lat!=null) epi=[+o.lng,+o.lat];
      if(o.mw!=null) mw=Math.max(6,Math.min(9.6,+o.mw));
      if(o.depth!=null) depthKm=Math.max(0,Math.min(200,+o.depth));
      if(o.rupture!==undefined) rupture=(o.rupture&&o.rupture.ring&&o.rupture.ring.length>=3)?o.rupture:null;   /* (#R212) */
      if(o.scope!=null) scope=(String(o.scope)==='near')?'near':'global';   /* (#R204) */
      if(o.hours!=null) hours=Math.max(1,Math.min(30,+o.hours));   /* (#R197) 30 h = the far side of the planet */
      opened=true; panel.style.display='flex'; render(); wireClick();
      clearTimeout(followT); srcPending=false; ranKey=srcKey();
      if(epi&&o.run!==false) build();
      return true;
    }
    function close(){ opened=false; pause(); seq++;
      clearTimeout(followT); srcPending=false;
      try{ if(jobId&&window.IntMapTsunamiWorker) window.IntMapTsunamiWorker.abort(jobId); }catch(_){}
      busy=false; if(panel) panel.style.display='none'; clearPaint(); return true; }

    const API = { open, close, play, pause, setFrame, setTime:setTimeS, at, follow,
      setHours(h){ hours=Math.max(1,Math.min(30,+h||6)); if(opened) render(); return true; },
      /* (#R204) the domain, so Atlas can ask for the high-resolution near-source solve by name */
      setScope(s){ scope=(String(s)==='near')?'near':'global'; hours=effHours(); if(opened) render(); return scope; },
      setSpeed(s){ speed=Math.max(1,Math.min(3600,+s||180)); if(opened) render(); return true; },
      setOpacity(v){ opacity=Math.max(0.1,Math.min(1,+v>1?(+v/100):+v));
        try{ GE().layers.setDynamicImageOpacity(DYN,opacity); }catch(_){} return opacity; },
      setAmplitude(m){ dispAmp=Math.max(0.005,Math.min(30,+m||0.2)); buildLUT(); paint(); if(opened) render(); return dispAmp; },
      showMaximum(v){ showMax=!!v; paint(); if(opened) render(); return showMax; },
      showContours(v){ showIso=!!v; applyIso(); if(opened) render(); return showIso; },
      run:()=>build(),
      state:()=>({ open:opened, epi:epi?epi.slice():null, mw, depthKm, hours, scope, speed, opacity, showMax,
        showIso, ampM:sim?+ampNow().toFixed(3):null, busy, pct, err:lastErr, playing:!!playing,
        following:!!srcPending,                                   /* (#R196) a queued re-run from the seismic panel */
        tSim:Math.round(tSim), worker:!!(window.IntMapTsunamiWorker&&window.IntMapTsunamiWorker.available()),
        /* (#R197) the grid is two numbers now and it is the same two on every run and every device;
           `demTiles`/`demMissing`/`noData` are gone because there is no longer anything that can be
           missing — the sea floor ships with the app and covers every cell. */
        /* (#R204) `global` is now a fact about the run rather than a constant: the near-source scope
           is the same solver on a latitude band at four times the resolution (see nearDomain). */
        sim:sim?{ nx:sim.nx, ny:sim.ny, fx:sim.fx, fy:sim.fy, dec:sim.dec, global:(sim.scope!=='near'),
          scope:sim.scope||'global',
          lat0:sim.lat0, lat1:sim.lat1, cellKm:sim.cellKm, dt:+(sim.dt||0).toFixed(2), steps:sim.steps||0,
          frames:sim.frames.length, nFrames:sim.nFrames, running:!!sim.running,
          totalS:sim.total, upliftM:+(sim.eta0Up||0).toFixed(2), subsidenceM:+(sim.eta0Down||0).toFixed(2),
          strike:Math.round(sim.strike||0), dipDeg:sim.dipDeg, slipM:sim.fault?+sim.fault.slip.toFixed(1):null,
          faultKm:sim.fault?[Math.round(sim.fault.L/1000),Math.round(sim.fault.W/1000)]:null,
          coastMaxM:+(sim.coastMax||0).toFixed(2), coastAt:sim.coastAt, seaCells:sim.seaCells,
          fineCells:sim.fineCells||0, sourceMs:sim.sourceMs||null, okadaCalls:sim.okadaCalls||null, fineCellKm:+(111.32/FINE_CPD).toFixed(2), fineWhy,   /* (#R205) */
          ampM:sim.amp, autoAmpM:sim.autoAmp||null, solveMs:sim.solveMs||null, ms:sim.ms }:null }) };

    /* ══ (#R214) …AND THE TSUNAMI TRAVELS WITH THE LINK TOO ═══════════════════════════════════════
       「再読み込みした際に、できる限りその状態に戻ってくるようにして。」 #R211 built the registry and
       registered three modules; the simulators were left for later and later is now. The key is the
       LAZY-MODULE NAME, because at restore time js/map-ui.js has to fetch this module back before it
       has anything to hand the value to. ⚠ The free-drawn rupture ring goes in it: without the ring
       the same magnitude at the same epicentre is a DIFFERENT earthquake (see srcKey), so a link that
       dropped it would reopen on a run the sender never made. Rounded to 4 decimals — ~11 m, far
       below the grid — because the ring is the long part of the URL. */
    try{ window.IntMapShareState&&window.IntMapShareState.register('tsunami',{
      get(){ if(!opened||!epi) return null;
        const o={ e:[+epi[0].toFixed(5),+epi[1].toFixed(5)], m:+mw.toFixed(2), d:depthKm, h:hours, sc:scope,
                  sp:speed, op:+opacity.toFixed(2), mx:showMax?1:0, iso:showIso?1:0, t:Math.round(tSim) };
        try{ if(rupture&&rupture.ring&&rupture.ring.length>=3)
          o.r=rupture.ring.map(p=>[+(+p[0]).toFixed(4),+(+p[1]).toFixed(4)]); }catch(_){}
        return o; },
      set(v){ if(!v||!Array.isArray(v.e)) return;
        const rup=(Array.isArray(v.r)&&v.r.length>=3)?{ring:v.r}:undefined;
        Promise.resolve(API.open({ lng:+v.e[0], lat:+v.e[1], mw:v.m, depth:v.d, hours:v.h, scope:v.sc, rupture:rup })).then(()=>{
          try{ if(v.sp!=null) API.setSpeed(v.sp); }catch(_){}
          try{ if(v.op!=null) API.setOpacity(v.op); }catch(_){}
          try{ if(v.mx!=null) API.showMaximum(!!v.mx); if(v.iso!=null) API.showContours(!!v.iso); }catch(_){}
          /* the frame is restored only once a solve exists to have frames — see setTimeS */
          try{ if(v.t!=null) setTimeout(()=>{ try{ setTimeS(+v.t); }catch(_){} },2500); }catch(_){}
        }).catch(()=>{}); } }); }catch(_){}

    return API;
  })();
};
