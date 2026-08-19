/* ============================================================================
 *  IntMap · Terrain sculpting + water routing  (#R176)
 * ----------------------------------------------------------------------------
 *  「地形編集＋水流シミュレーター — 地図をブラシで盛る・削る。そこへ任意量の水を落とすと、流下経路、
 *    湛水域、決壊方向がリアルタイムで変わる。堤防やダムも線を引くだけで作れる。」
 *
 *  WHAT MAKES THE WATER REAL (standing instruction 4 — no placeholder physics).
 *
 *  The surface is the actual terrarium DEM for the area in view, plus whatever the user has sculpted.
 *  Water is then routed with the two algorithms hydrology actually uses, on that surface:
 *
 *    1. PRIORITY-FLOOD (Barnes, Lehman & Mulla 2014 — the modern form of Planchon-Darboux). A
 *       min-heap starts at the edge of the grid and grows inward, always taking the lowest cell it
 *       has reached. Every cell comes out with (a) the level to which a depression containing it
 *       would fill before it spills — its 湛水域 level — and (b) the neighbour it was reached FROM,
 *       which is its way out. Because a cell is always popped after its outlet, the pop order is a
 *       topological order of the drainage network: no separate flow-direction pass, no sinks to
 *       special-case, and flats drain instead of stalling.
 *    2. VOLUME ROUTING down that order, reversed. Each cell hands its own water plus everything it
 *       received to its outlet neighbour. That single sweep gives the 流下経路 (how much water passes
 *       through each cell) for any combination of rainfall and point sources.
 *
 *  Then each depression is filled with the water that actually reached it, not with an assumed level:
 *  its cells are sorted by elevation once, so the stored volume as a function of water level is a
 *  prefix sum and the level for a given volume is a binary search. If that level reaches the spill
 *  elevation the depression OVERTOPS — and the outlet cell the priority flood already identified is
 *  the 決壊方向, drawn as an arrow with the volume that goes over it.
 *
 *  A levee or a dam is nothing special: drawing a line stamps a ridge into the same height field, so
 *  the same solver decides whether it holds, where the water backs up to, and where it goes over.
 *
 *  Real time: 256² = 65,536 cells, one heap pass and two linear sweeps — a few milliseconds, so the
 *  answer is recomputed on every brush stroke rather than behind a "compute" button.
 *
 *  ══ ⚠⚠⚠ (#R265) …AND THE CLOCK NOW MEANS SOMETHING ═══════════════════════════════════════
 *  「経過時間に対する水の動きが、現実と乖離しすぎ。リアルなモデルにしろ。」
 *
 *  Everything above is still here and still true — it is the STEADY STATE, the t → ∞ answer, and it
 *  is what the downstream trace and the ⏭ button are built on. What was wrong is that it was the
 *  ONLY answer: the pour transport advanced a simulated clock and re-solved the whole accumulated
 *  volume on every tick, so the water was already at its final resting place at t = 0⁺ however far
 *  away that was, and the elapsed-time readout beside it labelled a quantity nothing used.
 *
 *  The drawn water is now integrated in time by js/water-dynamics.js — the two-dimensional
 *  shallow-water equations in their local inertial form (Bates, Horritt & Fewtrell 2010) with the
 *  q-centred stabilisation of de Almeida et al. (2012) and Manning friction at n = 0.035. ▶ runs
 *  the clock, ⏸ freezes it, ⏭ jumps to the steady state above, and a flood wave takes the time a
 *  flood wave takes. See that file's header for the scheme and for what it was validated against.
 * ==========================================================================*/
import './water-dynamics.js';
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.terrainWater=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const isMobile=HOST.isMobile, warmDEMTiles=HOST.warmDEMTiles, demElevBilinear=HOST.demElevBilinear,
        demElevAt=HOST.demElevAt, _demZoomForSpan=HOST._demZoomForSpan, makeDraggable=HOST.makeDraggable;

  window.IntMapTerrainWater=(function(){
    if(!GE().hasRenderer()) return { open(){}, close(){}, state:()=>({open:false}) };
    const L=window.IntMapLang.pick(()=>HOST.lang);
    const D=Math.PI/180, R_EARTH=6371008.8, CIRC=2*Math.PI*R_EARTH;
    const mX=lng=>(180+lng)/360;
    const mY=lat=>(180-(180/Math.PI)*Math.log(Math.tan(Math.PI/4+lat*D/2)))/360;
    const lngOf=x=>x*360-180;
    const latOf=y=>360/Math.PI*Math.atan(Math.exp((180-y*360)*D))-90;

    const IMG_TERR='tw-terr-src', LYR_TERR='tw-terr', IMG_WATER='tw-water-src', LYR_WATER='tw-water',
          VEC='tw-vec-src';
    /* (#R267) the SECOND water raster — the one the traced polyline was stamped into. There is one
       field and therefore one image now; these ids are kept only so a style that still carries the
       layer loses it, the way #R212 removed `tw-breach` rather than emptying it. */
    const GONE_FLOW=['tw-flowimg','tw-flow-src'];

    /* ---- the working grid --------------------------------------------------------------------- */
    let G=null;        /* {NX,NY,xW,yN,dx,dy,cellM,areaM2,z,base:Float32Array} */
    let sculpt=null;   /* Float32Array — the brush strokes */
    let levees=[];     /* [{pts:[[lng,lat]…], crest:m above ground, width:m}] */
    /* (#R261) [{lng,lat,m3,cont,rate}] — `cont` and `rate` belong to the SOURCE, not to the panel.
       See the ⚠⚠⚠ note above pourStart for what was wrong with keeping them global. */
    let sources=[];
    let rainMm=0;
    let result=null;
    let panel=null, opened=false, busy=false, building=false;
    let mode='pan';    /* pan | raise | lower | levee | source */
    let brushM=400, brushStrength=20, leveeCrest=8, leveeWidth=60, srcM3=1e6;
    /* (#R189) 「水の水流は設定可能に」 — the channel's DISCHARGE (m³/s). null = the #R188 behaviour:
       the whole placed volume laid along the course by continuity.
       ⚠ (#R265) THE CHÉZY-LIKE BULK SPEED FACTOR IS GONE. `v = K·√S` with K = 40 was a number with
       no source, and it was a DIFFERENT friction law from the one the grid runs on. Both halves use
       Manning at js/water-dynamics.js's n now, and (#R267) the model itself is that one solver.
       ⚠⚠ THE OLD NAME IS DELIBERATELY NOT WRITTEN HERE. tests/r265 ⑥ asserts the identifier is gone
       from this file, and a specimen of it in prose is an occurrence — [[intmap-recurring-lessons]]
       «自分の検査が自分のコメントに当たる», which this project has now paid for nine times. */
    let flowM3s=null;
    let drafting=null; /* a levee being drawn */
    let undoStack=[];
    /* (#R211) continuous pouring — see renderParams()'s 'source' branch for what this models and
       what it deliberately does not. `pourSimS` is SIMULATED seconds, never wall clock. */
    let pourMode='once', pourRate=20000, timeScale=10, pourT=null, pourAt=0, pourSimS=0;
    const pourTotal=()=>sources.reduce((s,x)=>s+Math.max(0,x.m3),0);
    /* ══ (#R265) THE TIME-DEPENDENT WATER ════════════════════════════════════════════
       `sim` is the shallow-water state on the working rectangle (js/water-dynamics.js) and it is what
       gets DRAWN. `steady` says the field on screen is the t → ∞ routing answer instead — the ⏭
       button, and what the tool used to show unconditionally.
       ⚠ THE WATER IS DELIVERED ONCE. Each source records how much of itself has already gone into
       `sim` (`_fed`), because `x.m3` is a running total that the tap keeps adding to and the routing
       keeps re-reading; injecting the total every tick would multiply the water by the tick count. */
    let sim=null, simBedStamp=-1, steady=false, simCapped=0, rainFed=0, simFrontM=0, simFrontAt=0;
    const WD=()=>window.IntMapWaterDynamics;
    const SIM_MAX_STEPS=140;      /* per tick — a capped tick is reported, never silent (#R185) */
    /* ══ ⚠⚠⚠ (#R261) A TAP AND A BUCKET ARE TWO DIFFERENT OBJECTS ═══════════════════════════════════
       「一回だけと継続の水の水源の区別をつけろ。」

       There was no distinction to see, and there was none in the data either. `pourMode` was a
       PANEL setting, so every placed source was the same record — `{lng,lat,m3}` — drawn as the same
       blue dot, and which of them was actually a running tap was decided by ONE line:

           sources[sources.length - 1].m3 += pourRate · dt · timeScale        ← only the LAST one

       So: place a continuous source, then place a second one, and the first stopped filling without
       any indication; place a one-shot source while a pour was running and it became the tap
       instead. The map could not show the difference because the difference was not recorded.

       Now the kind is a property of the source. `cont:true` sources fill at their OWN `rate`, ALL of
       them, for as long as the transport runs; `cont:false` sources are a volume that was put there
       once and does not change. They are drawn differently (js draw(): a plain disc for a placed
       volume, a ringed disc for a running tap — see `tw-src-ring`), the panel lists them, and the
       ▶ button is enabled only when there is something for it to actually pour. */
    const contSources=()=>sources.filter(x=>x.cont);
    /* ⚠⚠ (#R265) ▶ NO LONGER MEANS «THERE IS A TAP», IT MEANS «THERE IS SOMETHING TO ADVANCE».
       With a steady-state solver, water with no tap behind it had nothing to do, so the transport was
       disabled unless a continuous source existed. Water that is MOVING has plenty to do — a placed
       volume runs downhill, spreads, fills and drains, and watching that is the whole point of the
       clock now. So the button is live whenever there is a tap OR water still in motion. */
    function simMoving(){ try{ return !!(sim&&!steady&&sim.stats().maxUnitQ>1e-4); }catch(_){ return false; } }
    function canPour(){ return !!(contSources().length||simMoving()); }
    function pourStart(){ if(pourT) return false;
      if(!canPour()) return false;
      steady=false; pourAt=Date.now();
      pourT=setInterval(()=>{
        if(!opened){ pourStop(); return; }
        const now=Date.now(), dt=Math.min(2,(now-pourAt)/1000); pourAt=now;
        stepSim(dt*timeScale);      /* (#R265) …which advances the clock and the taps by what it managed */
        /* the water has arrived and stopped, and nothing is feeding it any more — say so and stop
           rather than burning frames on a field that is not changing */
        if(!contSources().length&&!simMoving()){ pourStop(); return; }
        draw(); try{ syncFoot(); }catch(_){}   /* (#R258) the footer clock ticks with the simulation */
      },220);
      return true; }
    function pourStop(){ if(pourT){ clearInterval(pourT); pourT=null;
      if(opened){ solve(); try{ syncFoot(); }catch(_){} } } return false; }

    /* ---- layers ------------------------------------------------------------------------------- */
    function ensureVec(){ try{ if(!_imCanDraw()) return false;
      if(!GE().layers.hasSource(VEC)) GE().layers.addSource(VEC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!GE().layers.has('tw-levee-line')) GE().layers.add({id:'tw-levee-line',type:'line',source:VEC,filter:['==',['get','kind'],'levee'],
        paint:{'line-color':'#8d6e3a','line-width':4,'line-opacity':0.95}});
      if(!GE().layers.has('tw-draft-line')) GE().layers.add({id:'tw-draft-line',type:'line',source:VEC,filter:['==',['get','kind'],'draft'],
        paint:{'line-color':'#ffd23f','line-width':3,'line-dasharray':[2,1.5],'line-opacity':0.95}});
      /* (#R212) `tw-breach` — the red spill arrows — is not created at all. 「赤い矢印はいらない。一切
         不要。」 The layer is removed rather than emptied so a session that had it drawn loses it too. */
      try{ if(GE().layers.has('tw-breach')) GE().layers.remove('tw-breach'); }catch(_){}
      /* ══ (#R261) A RUNNING TAP LOOKS DIFFERENT FROM A PLACED VOLUME ═════════════════════════
         「一回だけと継続の水の水源の区別をつけろ。」 The ring is drawn UNDER the dot and only for
         `cont`, so a continuous source reads as a spring (a mouth with water spreading from it) and
         a one-shot source stays the plain blue drop it always was. Two layers rather than one
         data-driven paint because a circle layer cannot draw a hollow annulus and a filled dot at
         the same time; both are filtered on the same feature property, so they cannot disagree. */
      if(!GE().layers.has('tw-src-ring')) GE().layers.add({id:'tw-src-ring',type:'circle',source:VEC,
        filter:['all',['==',['get','kind'],'source'],['==',['get','cont'],1]],
        paint:{'circle-radius':12,'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#34c759','circle-stroke-width':2.2,'circle-stroke-opacity':0.9}});
      if(!GE().layers.has('tw-src')) GE().layers.add({id:'tw-src',type:'circle',source:VEC,filter:['==',['get','kind'],'source'],
        paint:{'circle-radius':6,
          'circle-color':['case',['==',['get','cont'],1],'#34c759','#29b6f6'],
          'circle-stroke-color':['case',['==',['get','cont'],1],'#06301a','#04283a'],'circle-stroke-width':2}});
      /* ══ (#R211) THE DASHED RECTANGLE IS GONE ════════════════════════════════════════════════════
         「水を配置すると謎の点線長方形が出る」
         #R186 drew it for a real reason: the solver grid is clipped to at most 60 km, the viewport is
         often larger, and a click outside the grid was silently dropped. But the OTHER half of that
         fix — a click outside the rectangle rebuilds the grid around it (see onClick / rebuildAround)
         — is what actually removed the failure, and it removed the need to show the boundary at all.
         What was left on screen was a dashed box with no explanation attached to it, which is the
         report. The boundary is still reported in words (the panel's cell size and grid dimensions),
         and the rebuild still happens; only the unexplained object is gone.
         ⚠ Asserted as an ABSENCE in tests/r187-checks and tests/r186.spec so it cannot return by
         accident — the same way #R187's deleted guide line is pinned. */
      /* ══ (#R187) THE WATER GOES THERE — IT IS NOT A LINE POINTING AT WHERE THE WATER WOULD GO ═════
         「（追記：一本の補助線はいらない。余計な機能を追加するな。）」

         #R186 computed the right thing and drew the wrong object. Where the water goes was traced on
         the real DEM, window by window, all the way to the sea or to the basin it cannot leave — and
         then rendered as a 2.6-px cyan polyline: a guide line laid over the map, which is what the
         addendum rejects. The instruction it was answering asks for the opposite: 「水は流れなくなる
         地点または海に到達した地点まで…描画すること」— the WATER, drawn that far.

         So the two line layers are gone and the traced course is rasterised into the same kind of
         image overlay the standing water already uses, in the same palette, at a width set by the
         elevation data rather than by a pixel count.
         ⚠ (#R267) …and it is now the SAME overlay: there is one depth field over one lattice, so
         the near water and the far water are the same pixels of the same raster rather than two
         images that agree about colour. */
      /* ══ (#R211) NO PINS ALONG THE COURSE ════════════════════════════════════════════════════════
         「流れの途中の水色ピンを大量に置くのをやめる」
         #R188 already draws every pond the trace crosses as WATER — its real outline, at its own
         depth. The circle on top of each one was #R186's marker
         from before that existed, so a 300 km trace ended up with a line of light-blue dots ON the
         water they were marking. The ponds are still crossed, still counted, and the count is still
         in the panel; what is gone is the second drawing of the same fact.
         ⚠ (#R267) the ponds are the field's own standing water now — a cell is deep and still
         because the integration made it so — so there is no separate list of them to draw either. */
      if(!GE().layers.has('tw-end')) GE().layers.add({id:'tw-end',type:'symbol',source:VEC,filter:['==',['get','kind'],'end'],
        layout:{'text-field':['get','label'],'text-size':window.IntMapLabelScale.sub(0.92),'text-allow-overlap':true,'text-offset':[0,-0.9],'text-anchor':'bottom'},
        paint:{'text-color':'#eaf7ff','text-halo-color':'rgba(0,20,32,0.9)','text-halo-width':1.8}});
      return true; }catch(_){ return false; } }
    function setVec(feats){ try{ if(ensureVec()) GE().layers.setSourceData(VEC,{type:'FeatureCollection',features:feats||[]}); }catch(_){} }
    function paintImg(srcId,lyrId,url,coords,before){
      try{ if(!_imCanDraw()) return;
        const s=GE().layers.hasSource(srcId);
        if(s) GE().layers.updateImage(srcId,{url,coordinates:coords});
        else { GE().layers.addSource(srcId,{type:'image',url,coordinates:coords});
          GE().layers.add({id:lyrId,type:'raster',source:srcId,paint:{'raster-opacity':1,'raster-fade-duration':0,'raster-resampling':'nearest'}},
            (before&&GE().layers.has(before))?before:undefined); }
      }catch(_){} }
    function wipe(){ [[LYR_WATER,IMG_WATER],[LYR_TERR,IMG_TERR],GONE_FLOW].forEach(([l,s])=>{
        try{ if(GE().layers.has(l)) GE().layers.remove(l); }catch(_){} try{ if(GE().layers.hasSource(s)) GE().layers.removeSource(s); }catch(_){} });
      setVec([]); }

    /* ---- build the grid from the real DEM ------------------------------------------------------ */
    async function build(opt){
      if(building) return false; building=true;
      try{
        const b=GE().camera.getBounds(); if(!b) return false;
        let w=b.getWest(), e=b.getEast(), s=b.getSouth(), n=b.getNorth();
        if(e<w) e+=360;
        /* (#R255) …re-centred on a point when the caller names one, WITHOUT flying the camera there */
        if(opt&&opt.center){ const cw=(w+e)/2, cn=(s+n)/2, hw=(e-w)/2, hn=(n-s)/2;
          const dl=(+opt.center[0])-cw, db=(+opt.center[1])-cn;
          w+=dl; e+=dl; s+=db; n+=db;
          s=Math.max(-84,s); n=Math.min(84,n);
          if(!(hw>0&&hn>0)) return false; }
        const midLat=(n+s)/2;
        /* cap the working area — beyond this the DEM tile budget, not the solver, is the limit */
        const spanKm=Math.max((e-w)*111.32*Math.cos(midLat*D),(n-s)*110.54);
        const MAXKM=(typeof isMobile==='function'&&isMobile())?26:60;
        if(spanKm>MAXKM){ const f=MAXKM/spanKm, cw=(w+e)/2, cn=(n+s)/2;
          w=cw-(e-w)*f/2; e=cw+(e-w)*f/2; s=cn-(n-s)*f/2; n=cn+(n-s)*f/2; }
        const xW=mX(w), xE=mX(e)+(mX(e)<mX(w)?1:0), yN=mY(n), yS=mY(s);
        /* (#R186) 256 → 384 on desktop. The grid was throwing away most of the elevation data it had
           already paid for: over a 60 km view the DEM comes in at z13, i.e. 13.5 m a sample, and a
           256-cell grid resampled that to 234 m cells — seventeen DEM samples averaged into one
           solver cell. 384 makes the cell 156 m over the same view (and 13 m over a 5 km view, where
           it then matches the DEM exactly), for 2.25× the cells; the solve time is printed in the
           panel so the cost is never hidden. Phones go 150 → 192 for the same reason at their scale.
           ⚠ (#R267) THIS IS ALSO THE LONG-RANGE ANSWER'S CELL SIZE. The basin extends this lattice
           rather than starting a second one, so the number chosen here is the resolution of the
           whole answer, from the click to wherever the water stops. */
        const NX=(typeof isMobile==='function'&&isMobile())?192:384;
        const NY=Math.max(24,Math.round(NX*(yS-yN)/Math.max(1e-12,xE-xW)));
        const dx=(xE-xW)/NX, dy=(yS-yN)/NY;
        const cellM=dx*CIRC*Math.cos(midLat*D);
        let z=Math.min((typeof isMobile==='function'&&isMobile())?12:14,_demZoomForSpan(Math.max(1,spanKm))+2);
        const budget=(typeof isMobile==='function'&&isMobile())?110:420;   /* under the DEM LRU cap (#R176) */
        const est=(zz)=>{ const tk=40075*Math.max(0.05,Math.cos(Math.abs(midLat)*D))/Math.pow(2,zz); const nn=spanKm/tk+1; return nn*nn*0.85; };
        while(z>5&&est(z)>budget) z--;
        setStat(L('Reading the terrain…','地形を読み込み中…','Gelände wird gelesen…','Чтение рельефа…','Leyendo el terreno…'));
        /* ══ (#R190) A LEVEL THAT DID NOT ARRIVE IS NOT "NO ELEVATION DATA FOR THIS AREA" ═════════
           「⚠ The elevation data for this area could not be read … となる事態にするな。」

           #R189 was right to refuse to invent a third of a rectangle — a solver routing water over
           ground nobody measured is worse than no answer. It was wrong about WHY the rectangle was
           empty. The gaps are not a property of the place; they are a property of the LEVEL asked
           for: at z14 a 60 km view is ~420 tiles from one host inside a 25 s budget, and the tail of
           that fan-out is what goes missing. One level down is a QUARTER of the tiles covering the
           same ground with real, measured, published elevation — coarser, and honest about it (the
           panel already prints the cell size and the interpolated-cell count).

           So the fine level is tried, and if too much of it is missing the ladder steps down and
           tries again, to z7. Only if even the coarsest level cannot be fetched is anything said —
           and then the message names the cause it actually has, which is the network, not the place.
           Measured effect: the refusal message now requires the DEM host to be unreachable. */
        let base=null, miss=0, tries=0;
        const MISS_MAX=NX*NY*0.3;
        for(;;){
          const warm=[]; for(let j=0;j<=48;j++) for(let i=0;i<=48;i++) warm.push([lngOf(xW+(xE-xW)*i/48), latOf(yN+(yS-yN)*j/48)]);
          /* (#R211) the elevation fetch IS the wait — feed its own progress to the bar. The last
             tenth is the sampling sweep below, which is CPU and takes a few ms. */
          setProg(0,L('Reading the terrain','地形を読み込み中','Gelände wird gelesen','Чтение рельефа','Leyendo el terreno')+' (z'+z+')');
          await warmDEMTiles(warm,z,25000,(f)=>setProg(0.9*(+f||0),L('Reading the terrain','地形を読み込み中','Gelände wird gelesen','Чтение рельефа','Leyendo el terreno')+' (z'+z+')'));
          setProg(0.92,L('Sampling','標本化中','Abtasten','Выборка','Muestreando'));
          base=new Float32Array(NX*NY); miss=0;
          for(let j=0;j<NY;j++){ const lat=latOf(yN+(j+0.5)*dy);
            for(let i=0;i<NX;i++){ const lng=lngOf(xW+(i+0.5)*dx);
              let v=demElevBilinear(lng,lat,z); if(v==null) v=demElevAt(lng,lat,null,z);
              if(v==null){ miss++; v=NaN; }
              base[j*NX+i]=v; } }
          if(miss<=MISS_MAX||z<=7||tries>=6) break;
          tries++; z--;
          setStat(L('Reading the terrain… (coarser level)','地形を読み込み中…（粗い解像度で再試行）','Gelände wird gelesen… (gröbere Stufe)','Чтение рельефа… (грубее)','Leyendo el terreno… (nivel más grueso)'));
        }
        /* a hole in the DEM would become a hole in the terrain; carry the nearest known value instead —
           for ISOLATED gaps. If even z7 came back mostly empty the elevation host is unreachable, and
           filling that in would be invention rather than repair (#R189). */
        if(miss>MISS_MAX){ setProg(null); _bldFail(); return false; }
        if(miss) fillHoles(base,NX,NY);
        setProg(null);
        /* ══ ⚠⚠⚠ (#R261) THE REBUILD USED TO THROW THE SCULPTED GROUND AWAY ════════════════════════
           「水源を追加しても地形はリセットするな。」 — and it did, every time, for one reason:

               onClick(mode==='source')  →  !inGrid(lng,lat)  →  rebuildAround()  →  build()
                                                                                  →  sculpt = new Float32Array

           The working rectangle is «about a screenful» centred on the last build, so a water source
           placed anywhere outside it — which is the ordinary thing to do after panning to look at
           where the water went — silently rebuilt the grid and wiped every brush stroke and every
           undo step with it. The levees survived (they are lng/lat), the sources survived, only the
           terrain the reader had spent the session shaping did not. Nothing said so.

           `sculpt` is a field of OFFSETS IN METRES over a mercator rectangle, so it is not tied to
           the grid it was made on: it is resampled onto the new one, and so is every undo snapshot
           (a snapshot holds a `sculpt` sized for the OLD grid — restoring one after a rebuild would
           have handed the solver an array of the wrong length). Ground the new rectangle does not
           cover is genuinely gone, which is honest and is reported: `carriedEdits` counts the cells
           that came across, and 0 with a non-empty field is the case worth seeing.
           ⚠ 「地形をリセット」 and 「リセット」 still clear it — this is about the rebuild, which is not
           something the reader asked for at all. */
        const _oldG=G, _oldSculpt=sculpt, _oldUndo=undoStack;
        G={ NX,NY,xW,yN,dx,dy,cellM,areaM2:cellM*cellM,z,base,
            bbox:[lngOf(xW),latOf(yN),lngOf(xE),latOf(yS)], midLat, demMissing:miss };
        sculpt=regridField(_oldSculpt,_oldG,G);
        resetSim();       /* (#R265) a different lattice is a different state vector — see ensureSim */
        undoStack=_oldUndo.map(u=>Object.assign({},u,{ sculpt:regridField(u.sculpt,_oldG,G) }));
        G.carriedEdits=(function(){ let n2=0; for(let i=0;i<sculpt.length;i++) if(sculpt[i]) n2++; return n2; })();
        editDirty();
        return true;
      } finally { building=false; setProg(null); }
    }
    /* (#R261) one height-offset field, read onto another grid. Bilinear over the OLD lattice at each
       new cell centre; cells whose four old neighbours are not all present stay 0, because the reader
       edited ground that the new rectangle does not cover and inventing a value there would be worse
       than losing it. Mercator x can run past 1 at the antimeridian (`xE=mX(e)+1`), so the new
       rectangle is shifted by whole worlds until its centre is the nearest copy of the old one's. */
    function regridField(src,oldG,newG){
      const out=new Float32Array(newG.NX*newG.NY);
      if(!src||!oldG||!src.length||src.length!==oldG.NX*oldG.NY) return out;
      const oNX=oldG.NX, oNY=oldG.NY;
      let shift=0; { const oc=oldG.xW+oldG.dx*oNX/2, nc=newG.xW+newG.dx*newG.NX/2;
        if(nc-oc>0.5) shift=-Math.round(nc-oc); else if(oc-nc>0.5) shift=Math.round(oc-nc); }
      for(let j=0;j<newG.NY;j++){
        const fy=(newG.yN+(j+0.5)*newG.dy-oldG.yN)/oldG.dy-0.5;
        const j0=Math.floor(fy), ty=fy-j0;
        if(j0<0||j0+1>=oNY) continue;
        for(let i=0;i<newG.NX;i++){
          const fx=(newG.xW+(i+0.5)*newG.dx+shift-oldG.xW)/oldG.dx-0.5;
          const i0=Math.floor(fx), tx=fx-i0;
          if(i0<0||i0+1>=oNX) continue;
          const a=src[j0*oNX+i0], b=src[j0*oNX+i0+1], c=src[(j0+1)*oNX+i0], d=src[(j0+1)*oNX+i0+1];
          out[j*newG.NX+i]=(a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty; } }
      return out;
    }
    function fillHoles(a,NX,NY){ /* one relaxation sweep in each direction is enough for isolated gaps */
      const idx=(i,j)=>j*NX+i;
      for(let pass=0;pass<4;pass++){ let left=0;
        for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){ const k=idx(i,j); if(!isNaN(a[k])) continue;
          let s=0,c=0; for(let dj=-1;dj<=1;dj++) for(let di=-1;di<=1;di++){ const ii=i+di,jj=j+dj;
            if(ii<0||jj<0||ii>=NX||jj>=NY) continue; const v=a[idx(ii,jj)]; if(!isNaN(v)){ s+=v; c++; } }
          if(c) a[k]=s/c; else left++; }
        if(!left) break; }
      /* ⚠ (#R265) A HOLE THE SWEEPS COULD NOT REACH WAS FILLED WITH **0 m** — i.e. sea level, in the
         middle of a plateau, which is a pit the water then runs into. It is the same fiction #R265
         took out of the DEM decode (js/map-readout.js), one layer up. The grid's own mean is not a
         measurement either, but it is the flattest thing that cannot attract or repel water. */
      let sum=0, cnt=0;
      for(let k=0;k<a.length;k++) if(!isNaN(a[k])){ sum+=a[k]; cnt++; }
      const fallback=cnt?(sum/cnt):0;
      for(let k=0;k<a.length;k++) if(isNaN(a[k])) a[k]=fallback;
    }

    /* ---- edits --------------------------------------------------------------------------------- */
    /* +1 %1 so a grid that crosses the antimeridian still measures the offset the short way round */
    function cellOf(lng,lat){ if(!G) return null;
      const i=Math.floor(((mX(lng)-G.xW+1)%1)/G.dx), j=Math.floor((mY(lat)-G.yN)/G.dy);
      return (i>=0&&j>=0&&i<G.NX&&j<G.NY)?{i,j}:null; }
    /* ══ (#R211) UNDO IS ONE OPERATION, NOT ONE HEIGHT FIELD ═════════════════════════════════════
       「元に戻す＝1操作だけ巻き戻す」
       The old stack held copies of `sculpt` only, so 元に戻す could not touch a levee, a placed
       water source or a rainfall change — pressing it after any of those silently rewound a BRUSH
       STROKE instead, which is the report: one press, some other thing changes. An entry is now the
       whole editable state before ONE user action, and every action pushes exactly one. */
    function snapState(){ return { sculpt:sculpt?sculpt.slice():null,
      levees:levees.map(l=>({pts:l.pts.slice(),crest:l.crest,width:l.width})),
      sources:sources.map(s=>({lng:s.lng,lat:s.lat,m3:s.m3,cont:!!s.cont,rate:s.rate})), rainMm }; }   /* (#R261) …and which kind each one is */
    function pushUndo(){ if(!G) return; undoStack.push(snapState()); if(undoStack.length>24) undoStack.shift(); }
    function undo(){ const s=undoStack.pop(); if(!s) return false;
      resetSim();       /* (#R265) the water is a function of what was placed; taking a step back re-places it */
      pourStop();
      if(s.sculpt) sculpt=s.sculpt;
      levees=s.levees; sources=s.sources; rainMm=s.rainMm; editDirty(); terrainSoon();
      const r=panel&&panel.querySelector('.tw-rain'); if(r) r.value=rainMm;
      solve(); return true; }
    /* A raised-cosine brush: no step at the rim, so the sculpted ground is a landform and not a cylinder. */
    function paintBrush(lng,lat,sign){ if(!G) return;
      const c=cellOf(lng,lat); if(!c) return;
      const rad=Math.max(1,Math.round(brushM/G.cellM)), amp=sign*brushStrength;
      for(let dj=-rad;dj<=rad;dj++){ const j=c.j+dj; if(j<0||j>=G.NY) continue;
        for(let di=-rad;di<=rad;di++){ const i=c.i+di; if(i<0||i>=G.NX) continue;
          const d=Math.hypot(di,dj)/rad; if(d>1) continue;
          sculpt[j*G.NX+i]+=amp*0.5*(1+Math.cos(Math.PI*d)); } }
      editDirty(); }
    /* A levee is a ridge whose crest follows the drawn line — stamped into the SAME height field, so
       the solver has no idea it is man-made and treats it exactly like ground. */
    /* ══ ⚠⚠⚠ (#R258) THE WATER WENT THROUGH THE DAM, AND THE CROSS-SECTION IS WHY ═══════════════════
       「堤防・ダムも同様。水面より高いはずの場所をすり抜ける。どないなっとんねん。」 Reproduced from the
       arithmetic, and there are two independent faults in these four lines:

       ① THE CREST WAS ONLY THE CREST ON THE CENTRELINE. `add = crest·(1 − d²)` with d the distance
          from the line in half-widths is a parabola that reaches ZERO at the levee's own edge. So
          「天端高 8 m」 produced 8 m at one point of the cross-section and less than that everywhere
          else — and the solver reads CELLS, not the continuous shape, so a cell whose centre falls
          at d = 0.7 was raised 4.1 m, not 8. The water then quite correctly went over the part that
          was not 8 m high. A levee has a FLAT crest at the height it is built to; the taper belongs
          on its outer shoulders.
       ② A RIDGE ONE CELL WIDE LEAKS DIAGONALLY. `halfW` floors at **1** cell, and the default width
          is 60 m against a cell that is 156 m over a 60 km view — so a diagonal run of the line
          stamped a chain of cells touching only at their CORNERS, while `routeWater`'s flood is
          8-connected (NB has eight entries): the water simply steps between the corners. The floor
          is 1.5 cells now, which is the smallest half-width that leaves no corner-only gap.

       ⚠ AND WHEN THE GRID CANNOT CARRY THE WIDTH THAT WAS ASKED FOR, IT SAYS SO — `leveeThin` is
       reported in the panel rather than silently widening the structure (#R185's rule). */
    let leveeThin=0;
    function stampLevees(out){ if(!G||!levees.length) return;
      leveeThin=0;
      const MIN_HW=1.5;                       /* cells — under this an 8-connected flood finds a corner */
      levees.forEach(lv=>{ const pts=lv.pts.map(p=>{ const c=cellOf(p[0],p[1]); return c?[c.i,c.j]:null; }).filter(Boolean);
        if(pts.length<2) return;
        const want=(lv.width||leveeWidth)/2/G.cellM;
        if(want<MIN_HW) leveeThin++;
        const hw=Math.max(MIN_HW,want), crest=lv.crest;
        /* flat to 65 % of the half-width, then a shoulder down to nothing at the edge */
        const FLAT=0.65;
        for(let s=0;s<pts.length-1;s++){ const [x0,y0]=pts[s], [x1,y1]=pts[s+1];
          /* ⚠ the sampling step is a fraction of a CELL: at one step per cell a diagonal segment
             skips the cells between two samples, which is the same corner-gap by another route. */
          const n=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)*3));
          for(let t=0;t<=n;t++){ const cx=x0+(x1-x0)*t/n, cy=y0+(y1-y0)*t/n;
            const r=Math.ceil(hw);
            for(let dj=-r;dj<=r;dj++){ const j=Math.round(cy)+dj; if(j<0||j>=G.NY) continue;
              for(let di=-r;di<=r;di++){ const i=Math.round(cx)+di; if(i<0||i>=G.NX) continue;
                const d=Math.hypot(Math.round(cx)+di-cx,Math.round(cy)+dj-cy)/hw; if(d>1) continue;
                const add=crest*Math.min(1,Math.max(0,(1-d)/(1-FLAT)));
                const k=j*G.NX+i; if(add>out[k]) out[k]=add; } } } } }); }
    function surface(){ const n=G.NX*G.NY, s=new Float32Array(n);
      for(let k=0;k<n;k++) s[k]=G.base[k]+editField()[k];
      return s; }

    /* ══ ⚠⚠ (#R255) THE SCULPTED GROUND IS THE GROUND — NOT A COLOURED OVERLAY OVER IT ══════════════
       「盛る、削るはそれに合わせて実際の標高や3D表示も対応させろ。堤防・ダムも同様」
       Everything this tool built up or cut away lived in `sculpt` (+ the levee stamp), was fed to the
       SOLVER, and was drawn as a translucent brown/blue wash — while the 3-D relief, the coordinate
       readout, the elevation profile, the line-of-sight viewshed and the insolation model all went on
       reading the untouched AWS terrarium DEM. Building a dam and then hovering it reported the
       valley floor. There are exactly two consumers to reach, and both are reached from here:

         · the READOUT family, through the one function they all call (js/map-readout.js's
           `demElevAt` / `demElevBilinear`), via the `IntMapElevEdit` hook this publishes;
         · the 3-D TERRAIN, through a raster-dem source whose tiles are the terrarium tiles with the
           same delta added (see ensureDemProto / syncTerrain).

       ⚠ ONE FIELD, ONE OWNER. `sculpt` and the levees are combined ONCE per change into `editF`, and
       the solver, the hook and the terrain tiles all read that — a second summation somewhere would
       be a second thing to keep true. `editStamp` is bumped whenever it changes, which is also what
       tells the terrain tiles they are stale. */
    let editF=null, editStamp=0, editSeen=-1;
    function editField(){ if(!G) return new Float32Array(0);
      if(editF&&editSeen===editStamp&&editF.length===G.NX*G.NY) return editF;
      const n=G.NX*G.NY, lv=new Float32Array(n); stampLevees(lv);
      const f=new Float32Array(n);
      for(let k=0;k<n;k++) f[k]=sculpt[k]+lv[k];
      editF=f; editSeen=editStamp; return f; }
    /* ⚠ (#R255) EVERY path that changes the ground goes through here — the brush, a levee, 元に戻す,
       either reset, a rebuild, and the Atlas `brush`/`addLevee` calls that have no pointer at all.
       Hanging the re-mesh off the individual UI handlers is how `brush()` from Atlas sculpted the
       solver's world and left the 3-D relief showing the old valley (measured: the readout went
       1000 → 1117.96 m and `getTerrain().source` was still `terrain-dem`). */
    function editDirty(){ editStamp++; terrainSoon(); }
    /* has the reader changed the ground at all? (a pure water run must not swap the terrain source) */
    function hasEdits(){ if(!G) return false; if(levees.length||drafting) return true;
      const f=editField(); for(let k=0;k<f.length;k++) if(Math.abs(f[k])>0.01) return true; return false; }
    /* the delta in metres at a geographic point — bilinear inside the working rectangle, 0 outside */
    function editDeltaAt(lng,lat){
      if(!G||building) return 0;
      const fx=((mX(lng)-G.xW+1)%1)/G.dx-0.5, fy=(mY(lat)-G.yN)/G.dy-0.5;
      if(!(fx>-1&&fy>-1&&fx<G.NX&&fy<G.NY)) return 0;
      const f=editField(); if(!f.length) return 0;
      const x0=Math.max(0,Math.min(G.NX-1,Math.floor(fx))), y0=Math.max(0,Math.min(G.NY-1,Math.floor(fy)));
      const x1=Math.min(G.NX-1,x0+1), y1=Math.min(G.NY-1,y0+1);
      const tx=Math.max(0,Math.min(1,fx-x0)), ty=Math.max(0,Math.min(1,fy-y0));
      const a=f[y0*G.NX+x0], b=f[y0*G.NX+x1], c=f[y1*G.NX+x0], d=f[y1*G.NX+x1];
      return (a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+d*tx)*ty; }

    /* ══ (#R255) …AND THE 3-D RELIEF ════════════════════════════════════════════════════════════════
       A terrarium tile carries elevation as `(R·256 + G + B/256) − 32768` metres. This serves the
       SAME tiles with `editDeltaAt` added, so MapLibre's terrain mesh — and therefore the hillshade,
       the horizon and anything the camera flies over — is the sculpted ground rather than the ground
       that was there before. The base tile is fetched once and kept decoded, so a brush stroke costs
       a re-encode of the tiles on screen and NO network at all.
       ⚠ The swap only happens while the tool is open AND the reader has actually changed something,
       and only when the app is in 3-D to begin with: a pure water run, or a flat map, is left on the
       app's own `terrain-dem` exactly as before. */
    const DEM_PROTO='imapterr';
    const _demBase=new Map();   /* z/x/y → Float32Array(256·256), the untouched terrarium tile */
    let _demProtoOn=false, _demSrcN=0, _demSrcId=null, _demPrev=null, _demTileV=-1;
    const _demHosts=['https://s3.amazonaws.com/elevation-tiles-prod/terrarium',
      'https://elevation-tiles-prod.s3.amazonaws.com/terrarium',
      'https://elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com/terrarium',
      'https://elevation-tiles-prod.s3.us-east-1.amazonaws.com/terrarium'];
    async function _demTile(z,x,y){
      const k=z+'/'+x+'/'+y; const have=_demBase.get(k); if(have) return have;
      const r=await fetch(_demHosts[(x+y)&3]+'/'+z+'/'+x+'/'+y+'.png');
      if(!r.ok) throw new Error('dem '+r.status);
      const bmp=await createImageBitmap(await r.blob());
      const cv=document.createElement('canvas'); cv.width=cv.height=256;
      const ct=cv.getContext('2d',{willReadFrequently:true}); ct.drawImage(bmp,0,0,256,256);
      try{ bmp.close&&bmp.close(); }catch(_){}
      const px=ct.getImageData(0,0,256,256).data, out=new Float32Array(256*256);
      /* ⚠⚠ (#R265) A VOID PIXEL IS NOT −32,768 m OF GROUND HERE EITHER. Some terrarium tiles come
         back entirely RGB(0,0,0) — measured: 14 of 49 z14 tiles around the Sava floodplain — and
         re-encoding that into the terrain mesh puts a 32.8 km pit under the camera. The sampler side
         of this is fixed in js/map-readout.js by stepping down the pyramid; here the tile is already
         in hand, so the holes are filled from the tile's own median, and a tile with NOTHING in it
         is refused so MapLibre falls back rather than rendering a hole. */
      let good=0, sum=0;
      for(let i=0,q=0;i<out.length;i++,q+=4){
        const v=(px[q]*256+px[q+1]+px[q+2]/256)-32768;
        if(px[q+3]===0||!(v>-12000)) out[i]=NaN; else { out[i]=v; good++; sum+=v; }
      }
      if(!good) throw new Error('dem tile is entirely no-data');
      if(good<out.length){ const fill=sum/good;
        for(let i=0;i<out.length;i++) if(out[i]!==out[i]) out[i]=fill; }
      _demBase.set(k,out); if(_demBase.size>360) _demBase.delete(_demBase.keys().next().value);
      return out; }
    function ensureDemProto(){ if(_demProtoOn) return true;
      try{ _demProtoOn=!!GE().scene.addProtocol(DEM_PROTO, async (params)=>{
        const m=/^imapterr:\/\/(\d+)\/(\d+)\/(\d+)/.exec(String((params&&params.url)||''));
        if(!m) throw new Error('bad imapterr url');
        const z=+m[1], x=+m[2], y=+m[3];
        const base=await _demTile(z,x,y);
        const cv=document.createElement('canvas'); cv.width=cv.height=256;
        const ct=cv.getContext('2d'); const img=ct.createImageData(256,256), px=img.data;
        const n=Math.pow(2,z);
        for(let j=0;j<256;j++){ const yy=(y+(j+0.5)/256)/n, lat=latOf(yy);
          for(let i=0;i<256;i++){ const xx=(x+(i+0.5)/256)/n;
            const k=j*256+i, e=base[k]+editDeltaAt(lngOf(xx),lat);
            let v=Math.max(0,Math.min(65535.99,e+32768));
            const p=k*4; px[p]=Math.floor(v/256); px[p+1]=Math.floor(v)%256;
            px[p+2]=Math.floor((v-Math.floor(v))*256); px[p+3]=255; } }
        ct.putImageData(img,0,0);
        const blob=await new Promise(res=>{ try{ cv.toBlob(b2=>res(b2),'image/png'); }catch(_){ res(null); } });
        if(!blob) throw new Error('encode');
        return { data: await blob.arrayBuffer() };
      }); }catch(e){ try{ console.warn('sculpted terrain protocol could not be registered',e); }catch(_){} }
      return _demProtoOn; }
    /* ══ ⚠⚠⚠ (#R258) ONE SOURCE, RE-TILED — NOT A NEW SOURCE PER STROKE ═════════════════════════════
       「盛る、削るやった瞬間3D表示が毎回リセットされるのを辞めろ。堤防・ダムも同様。」
       #R255 built a BRAND-NEW `raster-dem` source (`tw-dem-1`, `tw-dem-2`, …) on every edit and
       called `setTerrain` on it. Attaching a different terrain source makes the renderer throw the
       whole elevation mesh away, re-derive the transform's centre elevation and rebuild — which is
       the reset: the relief flattens, the camera's zoom is recalculated under it, and the tiles come
       back one by one. Once per brush stroke.
       The source is created ONCE now and `setTerrain` is called ONCE. An edit only changes the tile
       TEMPLATE (`…?v=<editStamp>`), which re-fetches the squares through the protocol while the
       terrain attachment, the mesh binding and the camera stay exactly where they are. */
    function demTiles(){ return [DEM_PROTO+'://{z}/{x}/{y}?v='+editStamp]; }
    function syncTerrain(){
      let cur=null; try{ cur=GE().scene.getTerrain(); }catch(_){ return; }
      const want=opened&&hasEdits();
      if(!want){
        if(_demSrcId){ const old=_demSrcId; _demSrcId=null; _demTileV=-1;
          try{ if(cur&&cur.source===old) GE().scene.setTerrain(_demPrev||{source:'terrain-dem',exaggeration:1.0}); }catch(_){}
          try{ if(GE().layers.hasSource(old)) GE().layers.removeSource(old); }catch(_){} }
        return; }
      if(!cur&&!_demSrcId) return;                    /* the app is in 2-D — nothing to re-mesh */
      if(cur&&cur.source!==_demSrcId) _demPrev=cur;
      if(!ensureDemProto()) return;
      const mz=(window.IntMapDem&&window.IntMapDem.maxZoom)?window.IntMapDem.maxZoom():14;
      try{
        if(!_demSrcId||!GE().layers.hasSource(_demSrcId)){
          _demSrcId='tw-dem-'+(++_demSrcN);          /* still unique per OPEN, so a stale one cannot be inherited */
          GE().layers.addSource(_demSrcId,{type:'raster-dem',tiles:demTiles(),
            encoding:'terrarium',tileSize:256,maxzoom:mz});
          GE().scene.setTerrain({source:_demSrcId,exaggeration:(_demPrev&&_demPrev.exaggeration)||1.0});
          _demTileV=editStamp; return; }
        if(_demTileV!==editStamp){ _demTileV=editStamp;
          /* re-tile IN PLACE: same source id, so the terrain is never detached */
          GE().layers.setSourceTiles(_demSrcId,demTiles()); }
      }catch(_){ }
    }
    /* the terrain is re-meshed when a stroke ENDS, not on every frame of it — one encode per edit */
    let _terrT=null;
    function terrainSoon(){ if(_terrT) clearTimeout(_terrT);
      _terrT=setTimeout(()=>{ _terrT=null; try{ syncTerrain(); }catch(_){} },260); }

    /* ---- the solver ---------------------------------------------------------------------------- */
    /* A binary min-heap over (priority, cell). Flat typed arrays — this runs on every brush stroke. */
    function Heap(cap){ const pr=new Float64Array(cap), id=new Int32Array(cap); let n=0;
      return { get size(){ return n; },
        push(p,i){ let c=n++; pr[c]=p; id[c]=i;
          while(c>0){ const par=(c-1)>>1; if(pr[par]<=pr[c]) break;
            const tp=pr[par],ti=id[par]; pr[par]=pr[c]; id[par]=id[c]; pr[c]=tp; id[c]=ti; c=par; } },
        pop(){ const top=id[0]; n--; if(n){ pr[0]=pr[n]; id[0]=id[n];
            let c=0; for(;;){ const l=2*c+1,r=l+1; let m=c;
              if(l<n&&pr[l]<pr[m]) m=l; if(r<n&&pr[r]<pr[m]) m=r; if(m===c) break;
              const tp=pr[m],ti=id[m]; pr[m]=pr[c]; id[m]=id[c]; pr[c]=tp; id[c]=ti; c=m; } }
          return top; } }; }

    /* ══ ⚠⚠⚠ (#R255) ONE ROUTING. THE UPSTREAM ONE. ═══════════════════════════════════════════════
       「上流から下流まですべて同じ計算・描画方法にしろ。上流のものに合わせろ。」 → confirmed as
       「計算そのものを上流に統一する」.

       #R211 unified the PALETTE and the drawing primitive and said so; the two halves still answered
       different questions with different mathematics:

         upstream (this grid)   priority flood → depressions → MFD(1.1) VOLUME routing, cascading
                                lakes; every number is cubic metres of the water actually placed
         downstream (the trace) priority flood → its own chain walk, an MFD accumulation of UNIT area
                                (`acc.fill(1)`) — a CATCHMENT-SIZE talweg, which is a different
                                quantity, and separate ad-hoc pond collection on top of it

       So the routing is one function now, and both halves call it. Nothing about the upstream answer
       changes (it is this code, moved); the downstream half stops computing drainage area and starts
       routing the same cubic metres through the same depressions, which is what the instruction asks
       for. That chain walk and its unit-accumulation sweep are gone with the question they answered
       — and (#R267) so is everything else that ran outside this rectangle.

       ⚠ It takes the surface, the dimensions, the cell size and the water GENERATED per cell, and it
       returns everything either caller needs. It knows nothing about `G`, the panel or the map — that
       is what makes it usable from a 161² DEM window as well as from the working grid. */
    function routeWater(surf,NX,NY,cellM,own){
      const N=NX*NY, A=cellM*cellM;
      const filled=new Float32Array(N);
      const parent=new Int32Array(N).fill(-1);
      const order=new Int32Array(N);
      const done=new Uint8Array(N);
      const heap=Heap(N+8);
      /* PRIORITY FLOOD — seed the whole border, then always take the lowest reached cell. The level a
         cell comes out with is the height water must reach before it can leave the grid from there;
         inside a basin that is the spill level, which is the impounded surface. */
      for(let i=0;i<NX;i++){ for(const j of [0,NY-1]){ const k=j*NX+i; if(done[k]) continue; done[k]=1; filled[k]=surf[k]; heap.push(surf[k],k); } }
      for(let j=0;j<NY;j++){ for(const i of [0,NX-1]){ const k=j*NX+i; if(done[k]) continue; done[k]=1; filled[k]=surf[k]; heap.push(surf[k],k); } }
      let cnt=0;
      const NB=[-1,1,-NX,NX,-NX-1,-NX+1,NX-1,NX+1];
      while(heap.size){ const k=heap.pop(); order[cnt++]=k;
        const ki=k%NX, kj=(k/NX)|0;
        for(let d=0;d<8;d++){ const nk=k+NB[d];
          if(nk<0||nk>=N) continue;
          const ni=nk%NX, nj=(nk/NX)|0;
          if(Math.abs(ni-ki)>1||Math.abs(nj-kj)>1) continue;      /* no wrap across the row edge */
          if(done[nk]) continue; done[nk]=1;
          /* the neighbour can never sit below the level its outlet sits at */
          filled[nk]=Math.max(surf[nk],filled[k]);
          parent[nk]=k;                                            /* …and this is its way out */
          heap.push(filled[nk],nk); } }

      /* DEPRESSIONS — connected components of "filled above the ground". Each is filled with the water
         that actually arrived, by binary search on its own elevation-sorted prefix sums.
         (#R186) MOVED AHEAD OF THE ROUTING, because the routing needs to know which cells are in a
         basin before it starts: a lake absorbs what arrives and passes on only its overflow. */
      const depId=new Int32Array(N).fill(-1);
      const deps=[];
      const stack=new Int32Array(N);
      for(let k=0;k<N;k++){
        if(depId[k]>=0||!(filled[k]>surf[k]+1e-6)) continue;
        const id=deps.length; let sp=0; stack[sp++]=k; depId[k]=id;
        const cells=[]; const spill=filled[k];
        while(sp){ const c=stack[--sp]; cells.push(c);
          const ci=c%NX, cj=(c/NX)|0;
          for(let d=0;d<8;d++){ const nk=c+NB[d]; if(nk<0||nk>=N||depId[nk]>=0) continue;
            const ni=nk%NX, nj=(nk/NX)|0; if(Math.abs(ni-ci)>1||Math.abs(nj-cj)>1) continue;
            if(filled[nk]>surf[nk]+1e-6&&Math.abs(filled[nk]-spill)<1e-6){ depId[nk]=id; stack[sp++]=nk; } } }
        cells.sort((a,b)=>surf[a]-surf[b]);
        /* ⚠ (#R186) A SINGLE CELL 40 cm DEEP IS NOT A 湛水域. Raising the grid from 256 to 384 cells
           made every one-cell dip in the DEM's own roughness qualify as a depression — caught by
           tests/r176 «flat ground has no basin», which measured a 1-cell "basin" of 993 m³ and
           0.43 m on ground that is flat. Nothing is lost by declining to register these: a cell with
           no lower neighbour still routes through the flood's own `parent` link, which is what that
           link is for. A pond is either WIDE (three cells or more) or DEEP (a metre or more). */
        if(cells.length<3&&(spill-surf[cells[0]])<1.0){ cells.forEach(c=>{ depId[c]=-1; }); continue; }
        /* capacity(level) as a prefix sum over the sorted cells */
        const lev=new Float64Array(cells.length), cum=new Float64Array(cells.length);
        let acc=0; for(let q=0;q<cells.length;q++){ lev[q]=surf[cells[q]];
          if(q>0) acc+=q*(lev[q]-lev[q-1])*A; cum[q]=acc; }
        const capacity=acc+cells.length*(spill-lev[cells.length-1])*A;
        deps.push({ id, cells, lev, cum, spill, capacity, inflow:0, level:lev[0], outlet:-1, outDir:0, over:0 });
      }
      /* Where each basin leaves from: of the cells that drain out of it, the one the routing tree
         carries the flow through. Computed before the routing so the overflow has somewhere to go. */
      const depOrder=new Int32Array(deps.length).fill(-1);      /* the q index at which each basin is settled */
      for(let k=0;k<N;k++){ const id=depId[k]; if(id<0) continue;
        const p=parent[k];
        if(p<0||depId[p]!==id){ const dp=deps[id];
          /* the outlet is the boundary cell that sits LOWEST — the one the water reaches first */
          if(dp.outlet<0||surf[k]<surf[dp.outlet]){ dp.outlet=k; dp.outDir=p>=0?p:k; } } }

      /* ══ (#R186) VOLUME ROUTING — MULTIPLE FLOW DIRECTIONS, AND LAKES THAT ACTUALLY HOLD ═════════
         「水の流れるシミュレーションを圧倒的に高精度に。」  Two changes, both of them standard hydrology
         that the single-parent version could not express:

         ① MULTIPLE FLOW DIRECTION (Freeman 1991 / Quinn 1991) instead of D8. The priority flood gives
            every cell ONE outlet, and sending all of a cell's water down that one link is the D8
            model — whose signature artefact is exactly the thing that makes a routed map look wrong:
            on an open hillside, where the real slope fans out, D8 collapses the flow into parallel
            single-cell lines because eight directions cannot represent a fan. Each cell now splits
            its water between EVERY neighbour that is lower, in proportion to (slope)^1.1 × contour
            width (0.5·Δ across a face, 0.354·Δ across a corner) — the published weighting, not a
            guess. Hillslopes disperse, valleys converge on their own because the weighting is
            super-linear in slope, and channels come out as channels.
            No cycles are possible: a share only ever moves to a strictly LOWER `filled`, and the
            priority flood pops in non-decreasing `filled`, so the reverse pop order visits every
            contributor before its receiver. Ties inside a lake surface have no lower neighbour and
            fall back to the flood's own parent link, which is what that link is for.

         ② LAKES CASCADE. The old model routed everything to the bottom and then asked each basin
            "how much passed by?", so a full reservoir upstream still delivered its entire inflow
            downstream and an EMPTY one delivered it too. Now a cell inside a basin hands its water
            to the BASIN, not to the next cell; when the last of that basin's cells has been visited
            (its cells are all at one `filled` level, and everything that drains into it is popped
            later, so at that moment its inflow is complete) the level is solved and only the
            OVERFLOW is injected at its outlet. A basin that does not fill therefore stops the water
            — which is what 「水は流れなくなる地点」 means on this grid. */
      const inflow=new Float64Array(N);       /* m³ arriving at each cell from upstream */
      const through=new Float64Array(N);
      const mainOut=new Int32Array(N).fill(-1);   /* the neighbour taking the largest share — the channel */
      const depIn=new Float64Array(deps.length);
      /* the LAST time each basin is touched in the reverse sweep = the smallest q among its cells */
      for(let q=0;q<cnt;q++){ const id=depId[order[q]]; if(id>=0&&depOrder[id]<0) depOrder[id]=q; }
      const MFD_P=1.1;
      const wBuf=new Float64Array(8), kBuf=new Int32Array(8);
      const settle=(id)=>{ const dp=deps[id]; const vin=depIn[id]; dp.inflow=vin;
        if(vin>=dp.capacity){ dp.level=dp.spill; dp.over=vin-dp.capacity; }
        else { let lo=0, hi=dp.cells.length-1;
          while(lo<hi){ const mid=(lo+hi)>>1; if(dp.cum[mid]<vin) lo=mid+1; else hi=mid; }
          const qq=lo; const below=qq>0?dp.cum[qq-1]:0; const nCells=Math.max(1,qq);
          dp.level=Math.min(dp.spill,(qq>0?dp.lev[qq-1]:dp.lev[0])+(vin-below)/(nCells*A));
          dp.over=0; }
        if(dp.over>0&&dp.outlet>=0&&dp.outDir>=0&&depId[dp.outDir]!==id) inflow[dp.outDir]+=dp.over; };
      for(let q=cnt-1;q>=0;q--){
        const k=order[q]; const v=own[k]+inflow[k]; through[k]=v;
        const myDep=depId[k];
        if(myDep>=0){ depIn[myDep]+=v; if(depOrder[myDep]===q) settle(myDep); continue; }
        if(v<=0) continue;
        const fk=filled[k], ki=k%NX, kj=(k/NX)|0;
        let m=0, tot=0, best=-1, bestW=0;
        for(let d=0;d<8;d++){ const nk=k+NB[d]; if(nk<0||nk>=N) continue;
          const ni=nk%NX, nj=(nk/NX)|0; if(Math.abs(ni-ki)>1||Math.abs(nj-kj)>1) continue;
          const dz=fk-filled[nk]; if(dz<=1e-9) continue;
          const card=(d<4);                                  /* NB = [-1,1,-NX,NX, …diagonals] */
          const dist=(card?1:Math.SQRT2)*cellM, L=(card?0.5:0.354)*cellM;
          const w=Math.pow(dz/dist,MFD_P)*L;
          if(w>0){ kBuf[m]=nk; wBuf[m]=w; tot+=w; if(w>bestW){ bestW=w; best=nk; } m++; }
        }
        if(m&&tot>0){ for(let a=0;a<m;a++) inflow[kBuf[a]]+=v*wBuf[a]/tot; mainOut[k]=best; }
        else { const p=parent[k]; if(p>=0){ inflow[p]+=v; mainOut[k]=p; } }
      }
      /* A basin with no cell in the pop order (impossible in practice) still gets a level. */
      for(let id=0;id<deps.length;id++) if(depOrder[id]<0) settle(id);

      /* the answer, per cell */
      const depth=new Float32Array(N);
      let wetCells=0, storedM3=0, maxDepth=0;
      deps.forEach(dp=>{ dp.cells.forEach(c=>{ const d=dp.level-surf[c];
        if(d>0.02){ depth[c]=d; wetCells++; storedM3+=d*A; if(d>maxDepth) maxDepth=d; } }); });
      return { surf, filled, parent, order, cnt, depId, deps, through, mainOut, depth,
               wetCells, storedM3, maxDepth, cellAreaM2:A, NX, NY, cellM };
    }

    /* ══ ⚠⚠⚠ (#R267) ONE MODEL, ONE LATTICE, ONE CLOCK — FROM THE CLICK TO WHEREVER IT STOPS ═══════
       「上流から下流まで全部同じモデル、描画にしろと言っている。」 — and #R255 was told
       「上流から下流まですべて同じ計算・描画方法にしろ。上流のものに合わせろ。」, and #R211 was told
       「上流と下流でモデルと表示方法を変えず配置地点付近のもので統一」. Three rounds answered it by making
       the two halves LOOK alike — same palette, same square-cell primitive, same friction constant —
       and left them as two halves. They were:

         · inside the rectangle — the shallow-water solver, integrated in time, drawn as a depth field
         · outside it          — a walk down the raw DEM producing a POLYLINE, sized by Manning
                                 cross-sections and labelled with ∫ds/c, drawn complete at t = 0

       MEASURED on the shipped build, with nothing but a click (`_dbgTrace`, #R264's instrument):

           from                  km      travel time    mean speed   longest straight run   its relief
           Kofu basin → sea      99.2    184.8 days     0.0062 m/s     1,120 m (48 cells)      5.9 m
           Alps → Po            362.9    566.4 days     0.0074 m/s     4,249 m (215 cells)     4.1 m
           W-Siberia            135.6    432.8 days     0.0036 m/s     2,267 m (159 cells)    14.7 m

       A river runs at 0.5–2 m/s. Both reported symptoms are properties of that second half and of
       nothing else: the straight runs are the chords of a polyline, and the travel time is a second
       clock computed by a second friction law over a geometry the first model never saw.

       THERE IS NO SECOND HALF NOW. `B` is the BASIN: G's own lattice — same cell size, same DEM
       level, same origin — extended cell by cell in whichever direction the water actually runs.
       The solver's state vector is re-laid on the larger lattice by `grow()` (nothing is
       interpolated and nothing is handed over, so mass is conserved exactly across a growth), and
       the picture is one raster of one depth field. There is no path anywhere in this file any more,
       so «a straight run that ignores the terrain» has nothing left to come from, and «when does it
       get here» is read off `tArr` — the clock the water was integrated on.

       ⚠ THE EXTENT IS BUDGETED AND A BUDGET THAT BITES SAYS SO. Beyond `basinMaxCells()` the basin
       stops growing and its rim goes back to being the outfall it already was (water leaves at
       normal depth for the local bed slope and is counted in `outM3`) — reported, never silent
       (#R185). */
    let simBed=null;      /* the bed the solver integrates on — B's lattice, G's cells */
    let B=null;           /* {NX,NY,xW,yN,dx,dy,cellM,areaM2,z,offI,offJ} — offI/offJ locate G inside B */
    let basinCapped=false, basinGrow=0, basinVoid=0, growPending=false, growFailed=0;
    const GROW_TRIGGER=10;     /* cells of clearance the drawable water may not come inside of */
    const GROW_CELLS=72;       /* …and how much lattice is added when it does */
    function basinMaxCells(){ return (typeof isMobile==='function'&&isMobile())?360000:1600000; }
    function bLng(i){ return lngOf(B.xW+(i+0.5)*B.dx); }
    function bLat(j){ return latOf(B.yN+(j+0.5)*B.dy); }
    /* the basin cell a point falls in (or null) — the same arithmetic cellOf() does for G */
    function basinCellOf(lng,lat){ if(!B) return null;
      const i=Math.floor(((mX(lng)-B.xW+1)%1)/B.dx), j=Math.floor((mY(lat)-B.yN)/B.dy);
      return (i>=0&&j>=0&&i<B.NX&&j<B.NY)?{i,j}:null; }
    function basinBBox(){ return B?[lngOf(B.xW),latOf(B.yN),lngOf(B.xW+B.NX*B.dx),latOf(B.yN+B.NY*B.dy)]:null; }
    /* the bed for one basin cell: inside the working rectangle it is the SCULPTED ground, outside it
       is the DEM at the basin's own level. One level for the whole basin, so the answer never has
       two resolutions in it (#R249). A sample the DEM cannot answer stays NaN — the solver closes
       every face touching it rather than inventing a bed (#R265). */
    function bedAt(i,j,surf){
      const gi=i-B.offI, gj=j-B.offJ;
      if(gi>=0&&gj>=0&&gi<G.NX&&gj<G.NY) return surf[gj*G.NX+gi];
      const v=demAt(bLng(i),bLat(j),B.z);
      if(v==null||!isFinite(v)){ basinVoid++; return NaN; }
      return v;
    }
    function ensureSim(){
      if(!G||!WD()) return null;
      if(!sim||!B||!simBed||simBed.length!==B.NX*B.NY){
        B={ NX:G.NX, NY:G.NY, xW:G.xW, yN:G.yN, dx:G.dx, dy:G.dy, cellM:G.cellM,
            areaM2:G.areaM2, z:G.z, offI:0, offJ:0 };
        simBed=new Float32Array(B.NX*B.NY);
        sim=WD().create(simBed,B.NX,B.NY,B.cellM);
        simBedStamp=-1; rainFed=0; basinCapped=false; basinGrow=0; basinVoid=0; growFailed=0;
        sources.forEach(x=>{ x._fed=0; });
      }
      if(simBedStamp!==editStamp){
        /* ⚠ ONLY THE RECTANGLE IS RE-READ. A brush stroke changes the ground under water that is
           already moving, which is the point of being able to build a dam mid-flood; the basin
           beyond it is untouched ground and re-sampling it would cost a DEM sweep per stroke. */
        const surf=surface();
        for(let gj=0;gj<G.NY;gj++){ const dst=(gj+B.offJ)*B.NX+B.offI, src=gj*G.NX;
          for(let gi=0;gi<G.NX;gi++) simBed[dst+gi]=surf[src+gi]; }
        simBedStamp=editStamp;
      }
      return sim;
    }
    /* every source's water reaches the model EXACTLY ONCE — see the note on `_fed` above */
    function feedSim(){
      const S=ensureSim(); if(!S) return;
      if(rainMm>rainFed){ S.addRain(rainMm-rainFed); rainFed=rainMm; }
      else if(rainMm<rainFed) rainFed=rainMm;               /* lowered: nothing to add or take back */
      sources.forEach(sc=>{
        const c=basinCellOf(sc.lng,sc.lat); if(!c) return;
        const k=c.j*B.NX+c.i;
        const want=Math.max(0,+sc.m3||0), had=Math.max(0,+sc._fed||0);
        if(want<=had){ sc._fed=want; return; }
        const give=want-had;
        /* a bucket tipped out makes a pool; a tap delivers into its own cell (#R261's distinction,
           now visible in the physics as well as in the symbol) */
        if(sc.cont) S.addVolume([k],give); else S.pool(k,give);
        sc._fed=want;
      });
    }
    /* ══ ⚠⚠ (#R265) ONE CLOCK, AND IT IS THE WATER'S ══════════════════════════════════════════════
       The first version advanced `pourSimS` by what the tick ASKED for and the model by what it could
       fit in its step budget, and the panel then printed both: MEASURED, the footer read
       「Elapsed 2.0 h」 while the details read 「Flow: Elapsed 35 min」 for the same run, because four
       ticks had hit the cap. Two clocks for one simulation is the defect this round is about, in
       miniature — the clock has to be the time the water was actually integrated for. So the model is
       advanced FIRST, and the elapsed time and the taps' delivery both follow what it returns; a
       capped tick then shows up as the clock running slower than the multiplier asks, which is true,
       and `cappedTicks` says why. */
    /* ══ ⚠⚠⚠ (#R267 追記) A TAP IS A RATE, SO IT IS DELIVERED PER STEP ══════════════════════════
       MEASURED IN PRODUCTION: a 60,000 m³/s source advanced by half an hour reported
       「max depth 21,290.1 m」 — 1.08×10⁸ m³ divided by one 71 m cell, to the metre. The volume owed
       for the whole interval was handed to `addVolume` before the integration started, i.e. as a
       PARCEL. It drains, and the flood it produces is about right, but a 21 km column of water is
       not something that ever exists, and both the picture and the readout showed it.
       `feedTaps(dt)` runs before every step of the solver instead, so what a discharge puts in is
       rate·dt — and `x.m3` (the running total the panel prints) advances by exactly the same
       amount at exactly the same time, which is what keeps the two from disagreeing again. */
    function feedTaps(dt){
      const S=sim; if(!S||!B||!(dt>0)) return;
      sources.forEach(sc=>{ if(!sc.cont) return;
        const c=basinCellOf(sc.lng,sc.lat); if(!c) return;
        const give=Math.max(0,+sc.rate||pourRate)*dt; if(!(give>0)) return;
        S.addVolume([c.j*B.NX+c.i],give);
        sc.m3=Math.max(0,+sc.m3||0)+give;
        sc._fed=Math.max(0,+sc._fed||0)+give; });
    }
    function stepSim(sec,maxSteps){
      const S=ensureSim(); if(!S) return null;
      steady=false;
      feedSim();                                    /* the one-shot volumes and the rain, once each */
      /* the interactive tick is a frame budget; the explicit door below passes its own */
      const r=S.advance(sec,maxSteps||SIM_MAX_STEPS,arguments.length>2?arguments[2]:180,feedTaps);
      if(r.capped) simCapped++;
      pourSimS+=r.simS;
      simFrontM=frontDistanceM(); simFrontAt=S.tS;
      growSoon();                                   /* (#R267) make room before the water needs it */
      return r;
    }
    /* ══ ⚠⚠ (#R267) THE LATTICE IS EXTENDED BEFORE THE WATER GETS THERE, NOT AFTER ════════════════
       Growth needs elevation tiles, which is a network round trip, so the trigger is a CLEARANCE
       rather than contact: the moment drawable water comes within GROW_TRIGGER cells of a rim the
       basin adds GROW_CELLS on that side. At the working rectangle's own cell size that is a couple
       of kilometres of warning for eight of new ground, which a front at 1 m/s takes half an hour of
       simulated time to use up.
       ⚠ A growth in flight does not block the clock — the rim stays an outfall until the ground
       arrives, which is the honest behaviour for «we do not have that data yet» and is counted. */
    function growSoon(){
      if(!sim||!B||growPending||basinCapped) return;
      const m=sim.wetMargins();
      const w=m.w<GROW_TRIGGER, e=m.e<GROW_TRIGGER, n=m.n<GROW_TRIGGER, s=m.s<GROW_TRIGGER;
      if(!(w||e||n||s)) return;
      const padW=w?GROW_CELLS:0, padE=e?GROW_CELLS:0, padN=n?GROW_CELLS:0, padS=s?GROW_CELLS:0;
      const nNX=B.NX+padW+padE, nNY=B.NY+padN+padS;
      if(nNX*nNY>basinMaxCells()){ basinCapped=true; return; }
      growPending=true;
      growBasin(padW,padE,padN,padS).catch(()=>{ growFailed++; }).then(()=>{ growPending=false; });
    }
    async function growBasin(padW,padE,padN,padS){
      const oldNX=B.NX, oldNY=B.NY;
      const nNX=oldNX+padW+padE, nNY=oldNY+padN+padS;
      const xW2=B.xW-padW*B.dx, yN2=B.yN-padN*B.dy;
      /* the elevation the new ground needs, asked for as a lattice over the new extent only */
      const pts=[];
      const STEP=Math.max(1,Math.round(Math.max(nNX,nNY)/28));
      for(let j=0;j<nNY;j+=STEP) for(let i=0;i<nNX;i+=STEP){
        const gi=i-padW, gj=j-padN;
        if(gi>=0&&gj>=0&&gi<oldNX&&gj<oldNY) continue;      /* already have this ground */
        pts.push([lngOf(xW2+(i+0.5)*B.dx),latOf(yN2+(j+0.5)*B.dy)]); }
      if(pts.length) await warmDEMTiles(pts.slice(0,1600),B.z,25000,null);
      if(!sim||!B||B.NX!==oldNX||B.NY!==oldNY) return;       /* a rebuild overtook us — drop it */
      const surf=surface();
      const nZ=new Float32Array(nNX*nNY);
      const Bold=B;
      B={ NX:nNX, NY:nNY, xW:xW2, yN:yN2, dx:Bold.dx, dy:Bold.dy, cellM:Bold.cellM,
          areaM2:Bold.areaM2, z:Bold.z, offI:Bold.offI+padW, offJ:Bold.offJ+padN };
      try{
        for(let j=0;j<oldNY;j++){ const src=j*oldNX, dst=(j+padN)*nNX+padW;
          for(let i=0;i<oldNX;i++) nZ[dst+i]=simBed[src+i]; }
        for(let j=0;j<nNY;j++){ const gj=j-padN;
          for(let i=0;i<nNX;i++){ const gi=i-padW;
            if(gi>=0&&gj>=0&&gi<oldNX&&gj<oldNY) continue;
            nZ[j*nNX+i]=bedAt(i,j,surf); } }
      }catch(err){ B=Bold; throw err; }
      if(!sim.grow(nNX,nNY,padW,padN,nZ)){ B=Bold; growFailed++; return; }
      simBed=nZ; basinGrow++;
    }
    /* how far the wetted edge has reached from the nearest source — the number that says whether the
       clock and the water agree, and the one the panel prints beside the elapsed time */
    function frontDistanceM(){
      if(!sim||!B||!sources.length) return 0;
      const NX=B.NX, h=sim.h, cm=B.cellM;
      const src=sources.map(sc=>basinCellOf(sc.lng,sc.lat)).filter(Boolean).map(c=>[c.i,c.j]);
      if(!src.length) return 0;
      let best=0;
      for(let k=0;k<h.length;k++){ if(!(h[k]>0.02)) continue;
        const i=k%NX, j=(k/NX)|0;
        let d=Infinity;
        for(let a=0;a<src.length;a++){ const dd=Math.hypot(i-src[a][0],j-src[a][1]); if(dd<d) d=dd; }
        if(d>best) best=d; }
      return best*cm;
    }
    /* ⏭ — the SAME model, run until the water stops moving. #R265 copied the routing's t → ∞ field
       in here, which is a different model's answer to a different question; a resting state has to be
       a state this integration actually reached, or the button is the two-models defect with a
       shortcut. A run that hits the budget reports `capped` rather than calling a moving field
       «at rest» (#R185). */
    let settleInfo=null;
    function settleSim(){
      const S=ensureSim(); if(!S) return false;
      feedSim();
      const r=S.settle({ maxSteps:(typeof isMobile==='function'&&isMobile())?9000:120000,
                        maxMs:(typeof isMobile==='function'&&isMobile())?2500:6000 });
      pourSimS=S.tS; settleInfo=r; steady=!r.capped;
      simFrontM=frontDistanceM();
      solve(); try{ syncFoot(); }catch(_){}
      return true;
    }
    function resetSim(){ sim=null; simBed=null; B=null; simBedStamp=-1; steady=false; rainFed=0; simCapped=0;
      simFrontM=0; simFrontAt=0; basinCapped=false; basinGrow=0; basinVoid=0; growFailed=0; settleInfo=null;
      course={ end:null, at:null, info:null, since:0, lastFrontM:0, checking:false };
      sources.forEach(x=>{ x._fed=0; }); }

    function solve(){
      if(!G) return null;
      const t0=(typeof performance!=='undefined'?performance.now():Date.now());
      const NX=G.NX, NY=G.NY, N=NX*NY, A=G.areaM2;
      const surf=surface();
      /* what this grid GENERATES: uniform rainfall plus every placed source, in cubic metres */
      const own=new Float64Array(N);
      const rain=(rainMm/1000)*A;
      if(rain>0) for(let k=0;k<N;k++) own[k]=rain;
      sources.forEach(sc=>{ const c=cellOf(sc.lng,sc.lat); if(c) own[c.j*NX+c.i]+=Math.max(0,sc.m3); });
      /* ⚠ (#R267) THE ROUTING IS NOT DRAWN ANY MORE, AND IT IS NOT A SECOND ANSWER TO «WHERE IS THE
         WATER». It answers a question about the GROUND — which depressions overtop, where they spill
         and how much goes over (#R176's 決壊方向) — on the rectangle the reader is editing. The water
         on screen is always the integration, everywhere. */
      const R=routeWater(surf,NX,NY,G.cellM,own);
      const breaches=R.deps.filter(d=>d.over>0&&d.outlet>=0)
        .sort((a,b)=>b.over-a.over).slice(0,12);
      const ms=(typeof performance!=='undefined'?performance.now():Date.now())-t0;
      const biggest=R.deps.slice().sort((a,b)=>b.capacity-a.capacity)[0]||null;
      const S=ensureSim(); if(S) feedSim();
      const st=S?S.stats():null;
      result={ surf:R.surf, filled:R.filled, eqDepth:R.depth, through:R.through, parent:R.parent,
        mainOut:R.mainOut, deps:R.deps, breaches,
        wetCells:st?st.wetCells:R.wetCells, storedM3:st?st.storedM3:R.storedM3,
        maxDepth:st?st.maxDepthM:R.maxDepth,
        floodKm2:(st?st.wetCells:R.wetCells)*(B?B.areaM2:A)/1e6,
        totalIn:(rainMm/1000)*A*N+sources.reduce((s,x)=>s+Math.max(0,x.m3),0),
        solveMs:Math.round(ms),
        /* (#R265) what the clock says, and (#R267) how much lattice it took to say it */
        /* ══ ⚠⚠⚠ (#R267) THE REPORTED SYMPTOM, ON EVERY SOLVE ═══════════════════════════════════
           「直線で地形を完全無視するクソ区間がある」 — six reports, four correct fixes, all four about a
           polyline. `jumps` is the same question asked of the field: water can only arrive across a
           face, so every wet cell must have a neighbour that got wet no later than it did. It must
           read 0, it is computed on every solve rather than only when someone runs a debug door
           (#R264: an instrument nobody looks at is not an instrument), and a non-zero reading is
           printed in the panel below. */
        sim:st?Object.assign(st,S.jumpCells(),{ steady, frontM:simFrontM, cappedTicks:simCapped,
          grows:basinGrow, capped:basinCapped, growing:growPending, growFailed, voids:basinVoid,
          spanKm:B?+(Math.max(B.NX,B.NY)*B.cellM/1000).toFixed(1):0,
          settle:settleInfo?{ steps:settleInfo.steps, simS:settleInfo.simS, capped:!!settleInfo.capped,
                              why:settleInfo.why||null, ms:settleInfo.ms||0 }:null }):null,
        /* diagnostics — the numbers to look at when the answer surprises you */
        depCount:R.deps.length, depId:R.depId,
        /* ⚠ (#R267) NO DEFAULT. A fallback roughness here would be a second place the number
           lives, which is the whole shape of the defect this round removed — if the solver is not
           loaded there is no model to name. */
        model:'local-inertial shallow water (Bates 2010; q-centred de Almeida 2012; Manning n='
              +(WD()&&WD().MANNING_N)+')',
        biggest:biggest?{ cells:biggest.cells.length, capacity:biggest.capacity, inflow:biggest.inflow,
          level:biggest.level, spill:biggest.spill, over:biggest.over||0 }:null };
      draw();
      courseSoon();
      return result;
    }

    /* ══ ⚠⚠⚠ (#R267) «WHERE DOES IT GO» IS SOMETHING THE WATER DOES, NOT A SECOND CALCULATION ═════
       「水は流れなくなる地点または海に到達した地点まで高精度に実データに忠実に描画すること。」 (#R186)

       That instruction is still the requirement and it is still met — by the model, now, instead of
       beside it. #R186 met it with a walk: 600 km of polyline computed the moment the water was
       placed, so the reader saw the whole course at t = 0 and a travel-time LABEL beside it. Under
       one clock the course is simply where the water has got to, and the two endings the instruction
       names are read off the field:

         · THE SEA — the wetted edge has reached ground at or below 0 m that is connected to open
           water. `seaCheck` below is what decides that, unchanged: it is a question about the DEM,
           not a second model of the water, and elevation alone cannot answer it (Death Valley is
           −86 m and is the opposite of the sea).
         · IT STOPS — the front has not advanced for a stretch of simulated time while nothing is
           being added. That is a measurement of this run, not a rule about basins.

       Everything else the walk carried — the escalation ladder for wide flats, the corridor
       refinement, the cross-section solve, the kinematic-wave arrival — is deleted rather than
       ported. Each existed to make a POLYLINE behave like water; there is no polyline. */
    let trace=null;              /* {end,at,info,km,...} — the ANSWER, derived from the field */
    let tracing=false;
    let course={ end:null, at:null, info:null, since:0, lastFrontM:0, checking:false };
    const STILL_S=1800;          /* simulated seconds of no advance that count as «it stopped» */
    let _courseT=null;
    function courseSoon(){ if(_courseT) return;
      _courseT=setTimeout(()=>{ _courseT=null; courseCheck(); },400); }
    /* the leading wet cell — furthest from the sources, which is the point the reader is asking
       about when they ask where the water went */
    function frontCell(){
      if(!sim||!B) return null;
      const NX=B.NX, h=sim.h;
      const src=sources.map(sc=>basinCellOf(sc.lng,sc.lat)).filter(Boolean).map(c=>[c.i,c.j]);
      let best=-1, bd=-1;
      for(let k=0;k<h.length;k++){ if(!(h[k]>0.02)) continue;
        const i=k%NX, j=(k/NX)|0;
        let d=0;
        if(src.length){ d=Infinity; for(let a=0;a<src.length;a++){ const dd=Math.hypot(i-src[a][0],j-src[a][1]); if(dd<d) d=dd; } }
        if(d>bd){ bd=d; best=k; } }
      if(best<0) return null;
      const i=best%NX, j=(best/NX)|0;
      return { k:best, i, j, lng:bLng(i), lat:bLat(j), bedM:simBed[best], depthM:sim.h[best],
               distM:bd*B.cellM, tS:sim.tArr[best] };
    }
    async function courseCheck(){
      if(!sim||!B||course.checking) return;
      const f=frontCell();
      if(!f){ trace=null; return; }
      /* has it stopped? — measured on this run, in simulated seconds */
      if(f.distM<=course.lastFrontM+B.cellM*0.5){ if(!course.since) course.since=sim.tS; }
      else { course.since=0; course.lastFrontM=f.distM; }
      const stalled=course.since>0&&(sim.tS-course.since)>=STILL_S&&!contSources().length;
      let end=stalled?'still':'running', info=null;
      if(f.bedM<=0){
        course.checking=true;
        try{ const v=await seaCheck(f.lng,f.lat); info=v; if(v&&v.sea) end='sea'; }
        catch(_){ } finally{ course.checking=false; }
      }
      if(end==='still'&&!info) info={ depthM:f.depthM, bedM:f.bedM };
      if(basinCapped&&end==='running') end='extent';
      const st=sim.stats();
      trace={ end, from:sources.length?[sources[0].lng,sources[0].lat]:null, to:[f.lng,f.lat],
              km:f.distM/1000, endInfo:info, tS:sim.tS, frontTS:f.tS,
              wetCells:st.wetCells, spanKm:+(Math.max(B.NX,B.NY)*B.cellM/1000).toFixed(1) };
      course.end=end; course.at=[f.lng,f.lat]; course.info=info;
      try{ report(); }catch(_){}
      try{ setVec(vecFeatures()); }catch(_){}
    }

    function demAt(lng,lat,z){ let v=demElevBilinear(lng,lat,z); if(v==null) v=demElevAt(lng,lat,null,z); return v; }
    /* a 3×3 block of DEM tiles around a point; a Mercator tile spans tileDeg of longitude and about
       tileDeg·cos(lat) of latitude, so the block is stepped accordingly */
    async function warmBlock(lng,lat,z){
      const tileDeg=360/Math.pow(2,z), dLat=tileDeg*Math.max(0.05,Math.cos(lat*D));
      const pts=[];
      for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++) pts.push([lng+i*tileDeg,Math.max(-84,Math.min(84,lat+j*dLat))]);
      await warmDEMTiles(pts,z,9000,null);
    }
    /* A local priority flood used ONLY to get out of a pit: it answers "how far would this have to
       fill before it could leave, and which way out". Same algorithm as solve(), on a small window. */
    function floodWindow(clng,clat,n,spacingM,z){
      const dLat=spacingM/110574, dLng=spacingM/(111320*Math.max(0.05,Math.cos(clat*D)));
      const N=n*n, surfW=new Float32Array(N);
      let missing=0;
      for(let j=0;j<n;j++){ const la=clat+(j-(n-1)/2)*dLat;
        for(let i=0;i<n;i++){ const lo=clng+(i-(n-1)/2)*dLng;
          const v=demAt(lo,la,z); if(v==null){ missing++; surfW[j*n+i]=NaN; } else surfW[j*n+i]=v; } }
      if(missing>N*0.4) return null;
      if(missing) fillHoles(surfW,n,n);
      const filledW=new Float32Array(N), parentW=new Int32Array(N).fill(-1), done=new Uint8Array(N);
      const heap=Heap(N+8), NB=[-1,1,-n,n,-n-1,-n+1,n-1,n+1];
      for(let i=0;i<n;i++){ for(const j of [0,n-1]){ const k=j*n+i; if(done[k]) continue; done[k]=1; filledW[k]=surfW[k]; heap.push(surfW[k],k); } }
      for(let j=0;j<n;j++){ for(const i of [0,n-1]){ const k=j*n+i; if(done[k]) continue; done[k]=1; filledW[k]=surfW[k]; heap.push(surfW[k],k); } }
      while(heap.size){ const k=heap.pop(); const ki=k%n, kj=(k/n)|0;
        for(let d=0;d<8;d++){ const nk=k+NB[d]; if(nk<0||nk>=N) continue;
          const ni=nk%n, nj=(nk/n)|0; if(Math.abs(ni-ki)>1||Math.abs(nj-kj)>1) continue;
          if(done[nk]) continue; done[nk]=1;
          filledW[nk]=Math.max(surfW[nk],filledW[k]); parentW[nk]=k; heap.push(filledW[nk],nk); } }
      const at=(lo,la)=>{ const i=Math.round((lo-clng)/dLng+(n-1)/2), j=Math.round((la-clat)/dLat+(n-1)/2);
        return (i>=0&&j>=0&&i<n&&j<n)?(j*n+i):-1; };
      const ll=(k)=>[clng+((k%n)-(n-1)/2)*dLng, clat+(((k/n)|0)-(n-1)/2)*dLat];
      return { n, N, surf:surfW, filled:filledW, parent:parentW, at, ll,
               spacingM,
               cellAreaM2:spacingM*spacingM };
    }
    /* ⚠ (#R186) IS THIS THE SEA, OR JUST BELOW SEA LEVEL?
       Measured: a trace above Death Valley reached −4.8 m after 15 km and reported 「海に到達」. It had
       reached a CLOSED BASIN that happens to be below the Pacific — and that is precisely a place
       where water STOPS, the opposite of the ending it was given. Elevation cannot separate the two.
       Connectedness can, and the question to ask is the simple one: **can this point reach open
       ground without ever rising above sea level?** The world ocean is one connected surface at 0 m,
       so from anywhere in it the answer is yes trivially. From inside Death Valley, or the Dead Sea,
       or the Qattara Depression, you have to climb over a rim that is above 0 first.

       ⚠ It is NOT the priority flood that answers this. The first attempt used one and asked how far
       the water would have to RISE to leave the window — and rejected the open Pacific, because the
       seafloor is not flat and the minimax escape from an abyssal plain climbs 3.4 m over a hill on
       the way out. The seafloor's own drainage is irrelevant: what matters is the ≤ 0 m REGION, so
       this is a flood fill on that mask and nothing more.

       The window has to be bigger than the basins it must exclude, which is why it is asked at z7
       over ~240 km rather than at the trace's own resolution: Death Valley is 200 km long and a 13 km
       window sits entirely inside it (which is how the first version passed it). Nine DEM tiles, and
       only ever on the last step of a trace. */
    async function seaCheck(lng,lat){
      const zc=7, n=161;
      try{
        await warmBlock(lng,lat,zc);
        const spacing=CIRC*Math.max(0.05,Math.cos(lat*D))/(Math.pow(2,zc)*256)*1.5;   /* ≈1.5 km */
        const dLat=spacing/110574, dLng=spacing/(111320*Math.max(0.05,Math.cos(lat*D)));
        const N=n*n, low=new Uint8Array(N); let missing=0;
        for(let j=0;j<n;j++){ const la=lat+(j-(n-1)/2)*dLat;
          for(let i=0;i<n;i++){ const lo=lng+(i-(n-1)/2)*dLng;
            const v=demAt(lo,la,zc); if(v==null){ missing++; continue; } if(v<=0) low[j*n+i]=1; } }
        if(missing>N*0.4) return { sea:true, unchecked:true, spanKm:Math.round(n*spacing/1000) };
        const c=((n-1)/2)*n+((n-1)/2);
        if(!low[c]) return { sea:false, reason:'above sea level', spanKm:Math.round(n*spacing/1000) };
        /* flood fill the ≤0 region from the centre; touching the window edge = connected to open water */
        const seen=new Uint8Array(N), st=new Int32Array(N); let sp=0, cells=0, edge=false;
        st[sp++]=c; seen[c]=1;
        while(sp){ const k=st[--sp]; cells++;
          const ki=k%n, kj=(k/n)|0;
          if(ki===0||kj===0||ki===n-1||kj===n-1) edge=true;
          for(const d of [-1,1,-n,n]){ const nk=k+d; if(nk<0||nk>=N||seen[nk]||!low[nk]) continue;
            if(Math.abs((nk%n)-ki)>1) continue;                       /* no wrap across the row edge */
            seen[nk]=1; st[sp++]=nk; } }
        /* ⚠ Edge-contact alone is not enough either. Measured, the DEAD SEA passes it: the Jordan
           rift's ≤ 0 m corridor runs off a 250 km window, so a purely topological test calls the
           lowest closed basin on Earth "the sea". The world ocean is not merely connected to the
           edge, it FILLS the neighbourhood — so the second signal is how much of the window that
           connected region covers, and the two families separate with a wide margin:
               open Pacific 100 %   ·   off Los Angeles 55 %   ·   Caspian 92 %
               Dead Sea       7 %   ·   Death Valley (above 0 at this sampling) —
           15 % sits in the gap. */
        const winKm2=(n*spacing/1000)*(n*spacing/1000);
        const km2=cells*spacing*spacing/1e6;
        return { sea:edge&&(km2>=winKm2*0.15), edge, connectedKm2:+km2.toFixed(1),
                 fraction:+(km2/winKm2).toFixed(3), spanKm:Math.round(n*spacing/1000) };
      }catch(_){ return { sea:true, unchecked:true }; }
    }

    /* ---- drawing -------------------------------------------------------------------------------- */
    /* ══ ⚠⚠⚠ (#R267) ONE RASTER, BECAUSE THERE IS ONE FIELD ═══════════════════════════════════════
       There were two images: `tw-water` (the rectangle's depth field, one pixel per solver cell) and
       `tw-flowimg` (the traced course, stamped from a polyline and its cross-sections into a canvas
       of its own, under the first one). Two canvases, two extents, two geometries, meeting at the
       rectangle's edge — the reported seam. The second one is gone. This paints the BASIN, which is
       the rectangle extended to wherever the water has actually run, out of `sim.h`, at one pixel
       per cell in exactly the same ramp.
       ⚠ THE CANVAS IS CAPPED AND THE CAP IS PRINTED. A basin that outgrows `DRAW_MAX_PX` is drawn by
       taking the deepest cell of each block rather than by quietly dropping cells: the water thins
       but never disappears, and `report()` prints the metres per pixel it ended up at, so «is this
       the resolution of the answer or of the picture» has a number instead of an argument (#R250). */
    const DRAW_MAX_PX=1400;
    let drawPxM=0, drawBlock=1;
    function draw(){
      if(!G||!result) return;
      const NX=G.NX, NY=G.NY;
      const coords=[[G.bbox[0],G.bbox[1]],[G.bbox[2],G.bbox[1]],[G.bbox[2],G.bbox[3]],[G.bbox[0],G.bbox[3]]];
      /* 1 — the sculpted difference, so an edit is visible even before any water is added */
      const lv=new Float32Array(NX*NY); stampLevees(lv);
      const cvT=document.createElement('canvas'); cvT.width=NX; cvT.height=NY;
      const ctT=cvT.getContext('2d'), imT=ctT.createImageData(NX,NY), pT=imT.data;
      let anyEdit=false;
      for(let k=0;k<NX*NY;k++){ const d=sculpt[k]+lv[k]; if(Math.abs(d)<0.05) continue; anyEdit=true;
        const a=Math.min(190,40+Math.abs(d)*4), o=k*4;
        if(d>0){ pT[o]=214; pT[o+1]=132; pT[o+2]=52; }                 /* built up */
        else   { pT[o]=90;  pT[o+1]=110; pT[o+2]=140; }                /* cut away */
        pT[o+3]=a; }
      ctT.putImageData(imT,0,0);
      if(anyEdit) paintImg(IMG_TERR,LYR_TERR,cvT.toDataURL('image/png'),coords,'tw-water');
      else { try{ if(GE().layers.has(LYR_TERR)) GE().layers.remove(LYR_TERR); if(GE().layers.hasSource(IMG_TERR)) GE().layers.removeSource(IMG_TERR); }catch(_){} }

      /* 2 — the water: depth in blue, and where it is MOVING in cyan, over the whole basin */
      if(sim&&B){
        const bNX=B.NX, bNY=B.NY, h=sim.h, qx=sim.qx, qy=sim.qy;
        const blk=Math.max(1,Math.ceil(Math.max(bNX,bNY)/DRAW_MAX_PX));
        const W=Math.max(1,Math.ceil(bNX/blk)), H=Math.max(1,Math.ceil(bNY/blk));
        drawBlock=blk; drawPxM=B.cellM*blk;
        const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
        const ct=cv.getContext('2d'), im=ct.createImageData(W,H), px=im.data;
        /* the flow scale is set by the fastest thing on the grid, so the picture reads the same
           whether the reader dropped a bathtub or a reservoir */
        let maxQ=0;
        for(let k=0;k<h.length;k++){ const f=Math.abs(qx[k])+Math.abs(qy[k]); if(f>maxQ) maxQ=f; }
        const thr=Math.max(1e-9,maxQ*0.004);
        for(let py=0;py<H;py++){ const j0=py*blk, j1=Math.min(bNY,j0+blk);
          for(let pxi=0;pxi<W;pxi++){ const i0=pxi*blk, i1=Math.min(bNX,i0+blk);
            let d=0, f=0;
            for(let j=j0;j<j1;j++){ const row=j*bNX;
              for(let i=i0;i<i1;i++){ const k=row+i;
                if(h[k]>d) d=h[k];
                const u=Math.abs(qx[k])+Math.abs(qy[k]); if(u>f) f=u; } }
            const o=(py*W+pxi)*4;
            if(d>0.02){ const c=waterRGBA(d);      /* (#R211) the one ramp — nothing else draws water */
              px[o]=c[0]; px[o+1]=c[1]; px[o+2]=c[2]; px[o+3]=c[3]; }
            else if(f>thr){ const s=Math.min(1,Math.log10(f/thr)/2.4);
              px[o]=Math.round(80+40*s); px[o+1]=Math.round(220-30*s); px[o+2]=255; px[o+3]=Math.round(70+150*s); } } }
        ct.putImageData(im,0,0);
        const bb=basinBBox();
        paintImg(IMG_WATER,LYR_WATER,cv.toDataURL('image/png'),
                 [[bb[0],bb[1]],[bb[2],bb[1]],[bb[2],bb[3]],[bb[0],bb[3]]]);
      }

      /* 3 — levees, the line being drawn, water sources, and the label for where the water got to.
         (#R211) The working rectangle and the per-pond pins are gone — see ensureVec. */
      setVec(vecFeatures());
      report();
    }
    /* the vector furniture, as one list — `courseCheck` refreshes the end label on its own schedule
       (it has to wait for a DEM read) and must not have to rebuild the rest of the drawing to do it */
    function vecFeatures(){
      const feats=[];
      /* (#R187) the watercourse is WATER, not a line; what stays as a marker is the label saying how
         far it has got and how it ended, which is information the picture cannot carry */
      if(trace&&trace.to) feats.push({type:'Feature',geometry:{type:'Point',coordinates:trace.to},
        properties:{kind:'end',label:traceEndLabel()}});
      levees.forEach(lv2=>feats.push({type:'Feature',geometry:{type:'LineString',coordinates:lv2.pts},properties:{kind:'levee'}}));
      if(drafting&&drafting.pts.length>1) feats.push({type:'Feature',geometry:{type:'LineString',coordinates:drafting.pts},properties:{kind:'draft'}});
      sources.forEach(s=>feats.push({type:'Feature',geometry:{type:'Point',coordinates:[s.lng,s.lat]},
        properties:{kind:'source',cont:s.cont?1:0,m3:Math.round(s.m3||0),rate:Math.round(+s.rate||0)}}));   /* (#R261) the kind travels with the point */
      /* ⚠ (#R212) NO RED ARROWS AT ALL. 「また、赤い矢印はいらない。一切不要。」 — #R211 read 「体積の赤字
         表示を消す」 as "keep the arrow, drop the number beside it"; the follow-up settles it. The spill
         points are still COMPUTED and still reported in words (how many, and how much goes over the
         largest), and the water itself already shows where it leaves — the arrow was a second, louder
         drawing of a thing the picture says. `tw-breach` therefore never receives a feature. */
      return feats;
    }
    /* (#R186) what the water has reached, in nine languages — the map label and the panel line share
       it. (#R267) 「まだ流れている」 is now one of the answers, because the clock decides all of them. */
    function traceEndLabel(){
      if(!trace) return '';
      const km=trace.km<10?trace.km.toFixed(1):Math.round(trace.km);
      const far=' · '+km+' km';
      switch(trace.end){
        case 'sea': return '🌊 '+L('Reaches the sea','海に到達','Erreicht das Meer','Достигает моря','Llega al mar')
          /* (#R189) the connectedness test could not run (its DEM window failed) — say so instead of
             passing a network outage off as a verified ocean */
          +((trace.endInfo&&trace.endInfo.unchecked)?(' '+L('(unverified — data missing)','（未確認・データ欠損）','(unbestätigt — Daten fehlen)','(не подтверждено — нет данных)','(sin verificar — faltan datos)')):'')
          +far;
        case 'still': return '⏹ '+L('Flow stops here','ここで流れが止まる','Fluss endet hier','Течение здесь заканчивается','El flujo se detiene aquí')+far;
        case 'extent': return '… '+L('still flowing at the edge of the modelled area','計算領域の端でもまだ流下中','fließt noch am Rand des Modellgebiets','всё ещё течёт у края области','sigue fluyendo en el borde del área')+far;
        case 'running': return '💧 '+L('flowing','流下中','fließt','течёт','fluyendo')+far;
        default: return km+' km';
      }
    }
    /* ══ (#R211) ONE WATER, ONE PALETTE, ONE PRIMITIVE ═══════════════════════════════════════════
       「上流と下流でモデルと表示方法を変えず配置地点付近のもので統一」

       There were two of everything. Near the click the grid solve wrote depth-shaded CELLS into an
       ImageData with the ramp (126−96s, 200−120s, 255, α 120+110s) over 0–8 m; beyond the rectangle
       the traced course was filled as smooth bank-to-bank QUADS with a different ramp (96−46t,
       196−52t, 255−12t, α 0.72+0.2t) over 0–6 m. Same water, two colours and two textures, meeting
       at a rectangle edge — which is what the report is about.

       So the ramp is this one function, used by both, and the far field is drawn with the near
       field's primitive: a square cell per elevation sample, or per pixel where a pixel is coarser
       than a sample (you cannot draw a cell smaller than a pixel). Nothing about the MODEL changed —
       both halves were already priority-flood + slope-weighted routing — but neither is the
       appearance a second decision any more. */
    function waterRGBA(d){ const s=Math.max(0,Math.min(1,(+d||0)/8));
      return [Math.round(126-96*s), Math.round(200-120*s), 255, Math.round(120+110*s)]; }
    function fmtM3(v){ if(v>=1e9) return (v/1e9).toFixed(2)+' km³';
      if(v>=1e6) return (v/1e6).toFixed(2)+' Mm³';
      if(v>=1e3) return Math.round(v/1e3)+' '+L('k m³','千m³','Tsd. m³','тыс. м³','k m³');
      return Math.round(v)+' m³'; }

    /* ---- panel ---------------------------------------------------------------------------------- */
    function setStat(h){ const s=panel&&panel.querySelector('.tw-stat'); if(s) s.innerHTML=h; }
    /* ══ (#R211) A COMPUTATION THAT TAKES SECONDS HAS TO SAY SO WHILE IT IS TAKING THEM ═══════════
       「計算中の進捗バーを表示」
       Reading the DEM for a 60 km rectangle is ~420 tiles over the network and the downstream trace
       is up to 64 more rounds of them; both used to show one line of text that did not move, which
       is indistinguishable from a hang. `warmDEMTiles(points,z,timeoutMs,onProgress)` has always
       reported its own progress (js/elevation-profile.js uses it) — this feeds that through, and
       the trace reports its own two bounded budgets (distance and windows).
       ⚠ Determinate where a real fraction exists, indeterminate where it does not. A fake bar that
       walks to 90 % and waits is the same lie as no bar at all. */
    let progOn=false;
    function setProg(frac,label){
      progOn=(frac!=null);
      const p=panel&&panel.querySelector('.tw-prog'); if(!p) return;
      if(frac==null){ p.style.display='none'; return; }
      p.style.display='block';
      const f=(frac<0)?null:Math.max(0,Math.min(1,frac));
      const bar=p.querySelector('.tw-prog-bar'), txt=p.querySelector('.tw-prog-txt');
      if(bar){ bar.style.width=(f==null?100:Math.round(f*100))+'%'; bar.style.opacity=(f==null?'0.45':'1'); }
      if(txt) txt.textContent=(label||'')+(f==null?'':(' '+Math.round(f*100)+'%'));
    }
    /* the DETAILS half — everything below is the expert read-out the panel used to lead with */
    function setMore(h){ const s=panel&&panel.querySelector('.tw-more-body'); if(s) s.innerHTML=h; }
    function report(){ if(!result) return;
      const n=(v,d)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:d==null?0:d});
      /* ══ (#R211) THE HEADLINE IS THE ANSWER; THE NUMBERS ARE BEHIND A DISCLOSURE ════════════════
         「`湛水: 1000 千m³ …` のような専門統計は「詳細情報を表示」で隠す」
         The panel opened with a line of hydrological book-keeping — stored volume, flooded area,
         maximum depth, cell size, DEM level, solver milliseconds — before it ever said where the
         water went. What a person wants first is the sentence: it flows to here, and it does or
         does not overtop. Nothing is deleted; everything that was on top is one click away. */
      setStat(((trace&&trace.end)?('<b>'+L('Downstream','流下先','Unterlauf','Ниже по течению','Aguas abajo')+':</b> '+traceEndLabel()):
               ('<span style="opacity:0.75;">'+L('Place water to see where it goes.','水を配置すると流下先を表示します。','Wasser platzieren, um den Verlauf zu sehen.','Разместите воду, чтобы увидеть путь.','Coloque agua para ver adónde va.')+'</span>'))
        +'<br><b>'+L('Overtopping','決壊・越流','Überströmen','Перелив','Desbordamiento')+':</b> '
        +(result.breaches.length?(result.breaches.length+' '+L('spill points','箇所','Stellen','точек','puntos'))
          :L('none — everything is held','なし（すべて湛水）','keines','нет','ninguno'))
        /* (#R258) the pouring volume and the elapsed clock moved to the footer — see syncFoot() */
        );
      try{ syncFoot(); }catch(_){}
      setMore('<b>'+L('Ponded','湛水','Aufgestaut','Затоплено','Embalsado')+':</b> '+fmtM3(result.storedM3)
        +' · '+n(result.floodKm2,2)+' km² · '+L('max depth','最大水深','max. Tiefe','макс. глубина','prof. máx')+' '+n(result.maxDepth,1)+' m'
        /* ══ (#R267) ONE CLOCK, ONE MODEL, AND THE EXTENT IT IS RUNNING ON ═════════════════════
           There is no «at rest this becomes» line any more: it printed a DIFFERENT model's t → ∞
           field beside this one's running state, which is the pair of answers this round removed.
           ⏭ runs THIS model until the water stops moving, and says so when it could not. */
        +(result.sim?('<br><b>'+L('Flow','流れ','Strömung','Течение','Flujo')+':</b> '
            +(result.sim.steady
              ? (L('at rest','静止（定常状態）','in Ruhe','в покое','en reposo')
                 +(result.sim.settle?(' <span style="opacity:0.72;">('+L('integrated','積分','integriert','проинтегрировано','integrado')+' '+fmtDur(result.sim.settle.simS)+')</span>'):''))
              : (L('Elapsed','経過','Vergangen','Прошло','Transcurrido')+' '+fmtDur(result.sim.tS)
                 +' · '+L('front','先端','Front','фронт','frente')+' '+n(result.sim.frontM/1000,1)+' km'
                 +' · '+L('left the area','領域外へ','abgeflossen','ушло за пределы','salió del área')+' '+fmtM3(result.sim.outM3)
                 +((result.sim.outM3s>0)?(' ('+n(result.sim.outM3s)+' m³/s)'):'')
                 +' · Δt '+n(result.sim.dt,1)+' s'
                 +(result.sim.cappedTicks?(' · ⚠ '+result.sim.cappedTicks+' '+L('ticks hit the step cap (the clock ran ahead of the water)','ティックがステップ上限に到達（時計が水より先に進みました）','Ticks am Schrittlimit','тиков упёрлись в предел шагов','ticks alcanzaron el límite de pasos')):'')
                 +((result.sim.settle&&result.sim.settle.capped)?(' · ⚠ '+L('still moving when the ⏭ budget ran out','⏭ の計算上限に達した時点でまだ移動中','beim ⏭-Limit noch in Bewegung','всё ещё движется на пределе ⏭','aún en movimiento al agotarse el límite de ⏭')):'')))
          ):'')
        +(result.breaches.length?('<br><b>'+L('Largest spill','最大の越流','Größter Überlauf','Наибольший перелив','Mayor desbordamiento')+':</b> '+fmtM3(result.breaches[0].over)):'')
        /* ══ (#R267) ONE LATTICE, ONE CELL SIZE, ONE DEM LEVEL — AND ITS SIZE ═══════════════════
           The cell, the level and the extent are ONE set of numbers for the whole answer now,
           because the answer is one field. `spanKm` is how far the lattice has grown to follow the
           water; the drawing resolution is printed beside it so «is the picture coarser than the
           model» is a number rather than an argument (#R250). */
        +'<br><span style="opacity:0.72;">'+n(G.cellM)+' m '+L('cells','セル','Zellen','ячейки','celdas')
        +' · '+(result.sim?(result.sim.NX+'×'+result.sim.NY):(G.NX+'×'+G.NY))
        +' · DEM z'+G.z+' · '+result.solveMs+' ms'
        +((result.sim&&result.sim.grows)?(' · '+L('extended','領域拡張','erweitert','расширено','ampliado')+' ×'+result.sim.grows
          +' → '+n(result.sim.spanKm,1)+' km'):'')
        +((drawBlock>1)?(' · '+L('drawn at','描画','gezeichnet mit','отрисовка','dibujado a')+' '+n(drawPxM)+' m/px'):'')
        /* (#R189) a repaired DEM hole is a guess — say how many cells are guessed, never silently */
        +(G.demMissing?(' · ⚠ '+n(G.demMissing)+' '+L('cells interpolated (no DEM)','セルは補間（DEM欠損）','Zellen interpoliert (kein DEM)','ячеек интерполировано (нет DEM)','celdas interpoladas (sin DEM)')):'')
        +((result.sim&&result.sim.voids)?(' · ⚠ '+n(result.sim.voids)+' '+L('cells with no DEM (closed)','セルはDEM欠損（面を閉鎖）','Zellen ohne DEM (geschlossen)','ячеек без DEM (закрыты)','celdas sin DEM (cerradas)')):'')
        +'</span>'
        /* ⚠ (#R185/#R267) EVERY CAP THAT BIT, IN WORDS. A basin that stopped growing is still
           drawing water at its rim, and a reader who is not told reads that rim as a shoreline. */
        +((result.sim&&result.sim.capped)?('<br><span style="opacity:0.85;">⚠ '+L('The modelled area has reached its limit — water leaving its edge is counted, not drawn.','計算領域が上限に達しました。端から出た水は集計され、描画されません。','Das Modellgebiet hat seine Grenze erreicht — abfließendes Wasser wird gezählt, nicht gezeichnet.','Область моделирования достигла предела — вода за краем учитывается, но не рисуется.','El área modelada alcanzó su límite: el agua que sale del borde se contabiliza, no se dibuja.')+'</span>'):'')
        /* ⚠ (#R267) 0 is the whole point, so it is printed only when it is not 0 — and then loudly */
        +((result.sim&&result.sim.jumps)?('<br><span style="opacity:0.85;">⚠ '+n(result.sim.jumps)+' '+L('cells hold water that did not flow into them','セルの水が、流れ込んだのではない経路で存在しています','Zellen mit Wasser, das nicht eingeflossen ist','ячеек с водой, которая туда не притекла','celdas con agua que no fluyó hasta allí')+'</span>'):'')
        +((result.sim&&result.sim.growFailed)?('<br><span style="opacity:0.85;">⚠ '+result.sim.growFailed+' '+L('extensions could not read the elevation data','回、領域拡張が標高データを取得できませんでした','Erweiterungen konnten keine Höhendaten lesen','расширений не смогли прочитать данные высот','ampliaciones no pudieron leer los datos de elevación')+'</span>'):'')
        +((trace&&trace.frontTS>0)?('<br><b>'+L('Travel time','到達時間','Laufzeit','Время добегания','Tiempo de recorrido')+':</b> '
          +fmtDur(trace.frontTS)+' '+L('over','／','über','на','en')+' '+n(trace.km,1)+' km'
          +' <span style="opacity:0.72;">'+L('— when the water reached the front, on the run that drew it','——描画と同じ積分で先端に水が届いた時刻です','— gemessen an derselben Integration','— по той же интеграции, что и рисунок','— medido en la misma integración que dibuja el agua')+'</span>'):''));
    }
    function fmtDur(s){ s=Math.max(0,Math.round(s));
      if(s<90) return s+' '+L('s','秒','s','с','s');
      if(s<5400) return Math.round(s/60)+' '+L('min','分','min','мин','min');
      if(s<172800) return (s/3600).toFixed(1)+' '+L('h','時間','h','ч','h');
      return (s/86400).toFixed(1)+' '+L('d','日','T','сут','d'); }

    /* ══ ⚠⚠ (#R258) THE PANEL IS THE SAME GROUPED INSET LIST THE EARTHQUAKE SIMULATOR IS ═══════════
       「UIも総じてくそ。全面改修しろ。上流のものに合わせろ。時間は下部スティックしろ。」

       What was here: one flat column of `display:flex;gap:9px` rows — four tool buttons, then
       whichever parameters that tool has, then a `<details>`, then a paragraph, then a footer with
       the rainfall box and three reset buttons. Nothing said where one subject ended and the next
       began, the number boxes were 26 px tall against a 40 px touch target everywhere else in this
       app, and 「1ストロークの高さ」 sat at the same level as 「リセット」.

       This app already decided what a simulator's panel looks like: #R237/#R240/#R242/#R244 rebuilt
       the earthquake simulator as a grouped inset list — a titled card per subject, hairlines inside
       a card and none between cards, one row per control with the label left and the value right, a
       40 px row, and a PINNED footer holding the thing you keep coming back to. That is the shape
       this panel takes now, with the same measurements (`FS`/`FS_S`/`FS_H`, 40 px rows, the
       segmented control carrying the accent on the chosen segment).

       ⚠ THE CLOCK IS IN THE FOOTER, NOT IN A TOOL. 「時間は下部スティックしろ。」 ▶/⏸, the time
       multiplier and the elapsed simulated time used to live inside the 「ここに水」 tool's parameter
       block — i.e. they scrolled away, and they DISAPPEARED entirely as soon as you picked up the
       brush, while the pour they control kept running (#R255 made sure of that). The pour is the
       simulation's, so its controls belong to the panel and not to a pointer mode: the footer
       carries the transport, the speed and the elapsed clock in every mode.
       ⚠ Every class name the handlers bind to is unchanged, and `.tw-foot` is still a SIBLING of
       `.tw-body` closed in the order it is opened (tests/r255 asserts its parent is the panel — the
       one unbalanced `</div>` that broke #R245's pinned footer). */
    const TW_FS='12px', TW_FS_S='11px';
    function _ensureCss(){
      if(document.getElementById('tw-ios-css')) return;
      const s=document.createElement('style'); s.id='tw-ios-css';
      s.textContent=[
        '.tw-card{background:var(--card-bg);border:1px solid var(--glass-border,rgba(128,128,128,0.16));border-radius:12px;overflow:hidden;}',
        '.tw-cap{font-size:'+TW_FS_S+';font-weight:600;letter-spacing:.01em;color:var(--text-main);padding:0 3px 5px;}',
        '.tw-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:40px;'
          +'padding:7px 11px;font-size:'+TW_FS+';color:var(--text-main);box-sizing:border-box;}',
        '.tw-row+.tw-row,.tw-row+.tw-blk,.tw-blk+.tw-row,.tw-blk+.tw-blk{border-top:1px solid var(--glass-border,rgba(128,128,128,0.16));}',
        '.tw-blk{padding:9px 11px;font-size:'+TW_FS+';color:var(--text-main);box-sizing:border-box;}',
        '.tw-val{margin-left:auto;display:flex;align-items:center;gap:7px;flex:0 0 auto;}',
        '.tw-num{width:82px;height:30px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.22));'
          +'background:var(--input-bg);color:var(--text-main);font-size:'+TW_FS+';padding:0 7px;box-sizing:border-box;text-align:right;}',
        '.tw-segwrap{display:flex;gap:3px;background:var(--input-bg);border-radius:10px;padding:3px;}',
        '.tw-seg{flex:1;min-width:0;border:none;background:transparent;color:var(--text-main);font-size:'+TW_FS+';'
          +'font-weight:500;padding:7px 6px;border-radius:8px;cursor:pointer;line-height:1.25;white-space:nowrap;}',
        '.tw-seg.on{background:var(--primary-color);color:#fff;font-weight:600;}',
        /* ⚠ (#R258) THE TOOL PICKER IS 2×2, NOT A FOUR-WAY STRIP. Measured in this panel: the strip
           gives each segment 73 px while 「🧱 堤防・ダム」 needs 96 and 「💧 ここに水」 88 — two of the
           four labels were clipped. Four names do not fit across 306 px, so they go two by two. */
        '.tw-modes{display:grid;grid-template-columns:1fr 1fr;}',
        '.tw-modes .tw-seg{overflow:hidden;text-overflow:ellipsis;}',
        '.tw-btn{padding:8px 10px;border-radius:10px;border:1px solid var(--glass-border,rgba(128,128,128,0.22));'
          +'background:var(--input-bg);color:var(--text-main);font-size:'+TW_FS+';cursor:pointer;}',
        /* (#R261) 「再生ボタンは四角にしろ。」 — it was `border-radius:19px` on a 38 px box, i.e. a
           circle. A rounded SQUARE now (11 px, the same corner the segmented controls and the
           .tw-btn row in this panel already use), so the transport belongs to the panel it sits in
           instead of being the one disc in it. Same size, same accent, same states.
           ⚠ THE COMMENT THIS REPLACED SAID «a round accent button, the way the other simulator's
           player is (#R242)», AND THAT WAS NOT TRUE WHEN IT WAS WRITTEN. `.sq-play` in
           js/seismic.js is 32 px at `border-radius:9px` — already a rounded square. `.tw-play` was
           the only disc, so this change makes the two players AGREE rather than diverge. A note
           that says «matched to X» is only evidence about X if somebody looked at X. */
        '.tw-play{width:38px;height:38px;flex:0 0 auto;border-radius:11px;border:none;background:var(--primary-color);'
          +'color:#fff;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
        '.tw-play:disabled{opacity:.42;cursor:default;}',
        '.tw-clock{font-variant-numeric:tabular-nums;font-size:'+TW_FS+';color:var(--text-main);white-space:nowrap;}',
        '.tw-note summary{cursor:pointer;font-size:'+TW_FS_S+';color:var(--text-main);list-style:revert;}',
      ].join('\n');
      document.head.appendChild(s);
    }
    const cap=(t)=>'<div class="tw-cap">'+t+'</div>';
    const card=(inner)=>'<div class="tw-card">'+inner+'</div>';
    /* kept for the few places that still write an inline control (the params block builds rows) */
    const NUM='';
    const ROW='';
    /* ══ (#R211) NO "PAN" BUTTON, AND EVERY BUTTON RELEASES ITSELF ═══════════════════════════════
       「移動ボタンを削除し各ボタンは再クリックで選択解除」
       'pan' was a tool you had to select in order to stop using a tool — i.e. the panel made the
       map's ORDINARY behaviour into a mode, and the only way back to it was to notice the button.
       It is still the internal idle state (setMode falls back to it, and the drag-pan lock keys off
       it), but it is no longer something to press: clicking the active tool turns it off. */
    function modes(){ return [
      ['raise','⛰ '+L('Raise','盛る','Anheben','Поднять','Elevar')],
      ['lower','⛏ '+L('Lower','削る','Abtragen','Срезать','Rebajar')],
      ['levee','🧱 '+L('Levee / dam','堤防・ダム','Deich / Damm','Дамба','Dique / presa')],
      ['source','💧 '+L('Water here','ここに水','Wasser hier','Вода здесь','Agua aquí')]]; }
    /* 「盛る・削るはペン太さ3段階」 — three named widths instead of a metre box nobody can picture.
       The metres are still what the brush uses (and setBrush() still takes any radius), so Atlas and
       the tests are unaffected; this is the human end of the same number. */
    const PEN=[[150,L('Fine','細','Fein','Тонкая','Fina')],[400,L('Medium','中','Mittel','Средняя','Media')],[1200,L('Broad','太','Breit','Широкая','Ancha')]];
    function render(){ if(!panel) return;
      _ensureCss();
      panel.innerHTML='<div class="tw-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;">'
        +'<span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">⛰💧 '+L('Terrain &amp; water','地形編集・水流','Gelände &amp; Wasser','Рельеф и вода','Terreno y agua')+'</span>'
        +'<button class="tw-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>'
        /* ══ ⚠ (#R255) THE SHARED HALF IS PINNED TO THE BOTTOM ══════════════════════════════════════
           「下部スティックしろ。」 → 「共通部分や、時刻など。」 The panel was one column that simply grew:
           choosing the brush adds five rows of pen settings, choosing 「ここに水」 adds the pour
           controls, and the things that are the same in EVERY mode — the rainfall, 元に戻す / 地形を
           リセット / リセット, the progress bar, and the status line that carries the elapsed simulated
           clock — were pushed further down each time, off the bottom of a tall panel.
           So the panel is now a SCROLLING body and a STICKY FOOTER: the per-mode parameters scroll,
           the shared controls and the clock never move.
           ⚠ (#R245) THE DOM PARENTAGE IS THE THING TO GET RIGHT, NOT THE CSS. That round's pinned
           footer failed on ONE unbalanced `</div>` — `innerHTML` accepts it silently and the browser
           re-parents the footer inside the scroller, where `position:sticky` is a no-op. Body and
           footer are siblings here, closed in the order they are opened, and tests/r255 asserts that
           `.tw-foot`'s parent is the panel itself. */
        +'<div class="tw-body" style="padding:10px 12px 4px;display:flex;flex-direction:column;gap:11px;flex:1 1 auto;min-height:0;overflow-y:auto;">'
        /* ① the tool — a segmented control, because exactly one of them is in the pointer's hand */
        +'<div>'+cap(L('Tool','ツール','Werkzeug','Инструмент','Herramienta'))
          +'<div class="tw-segwrap tw-modes">'+modes().map(m=>'<button class="tw-seg tw-m" data-m="'+m[0]+'">'+m[1]+'</button>').join('')+'</div></div>'
        /* ② whatever that tool is set by */
        +'<div class="tw-params"></div>'
        /* ③ the one condition that applies to the whole rectangle whichever tool is out */
        +'<div>'+cap(L('Weather','気象','Wetter','Погода','Meteorología'))
          +card('<label class="tw-row">'+L('Rainfall','降水量','Niederschlag','Осадки','Lluvia')
            /* ⚠ (#R237) ONE `class` attribute per tag — a second one is silently discarded */
            +'<span class="tw-val"><input class="tw-num tw-rain" type="number" min="0" max="2000" step="10" value="'+rainMm+'"><span style="opacity:.7;">mm</span></span></label>')
        +'</div>'
        /* ④ (#R211) 「専門統計は「詳細情報を表示」で隠す」 — <details> so the browser owns the state */
        +'<details class="tw-more tw-note" style="font-size:'+TW_FS_S+';color:var(--text-main);line-height:1.55;">'
          +'<summary>'+L('Show details','詳細情報を表示','Details anzeigen','Подробнее','Ver detalles')+'</summary>'
          +'<div class="tw-more-body" style="margin-top:5px;"></div></details>'
        /* ⑤ what the model is and is not — folded, like every other long note (#R258) */
        +'<details class="tw-note" style="line-height:1.5;">'
          +'<summary>'+L('About this model','このモデルについて','Über dieses Modell','Об этой модели','Sobre este modelo')+'</summary>'
          +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;margin-top:4px;">'
          +L('Real terrarium elevation, sculpted by you. The water is integrated in time by the 2-D shallow-water equations in their local inertial form (Bates 2010, q-centred after de Almeida 2012) with Manning friction at n = 0.035, so a flood wave takes the time a flood wave takes. The same model runs the whole course: the lattice is extended in whichever direction the water goes, at the same cell size, so there is no second calculation and no second drawing downstream. ⏭ runs this model on until the water stops moving.',
             '実際の標高データを編集しています。水は2次元浅水方程式（局所慣性形：Bates 2010／q中心化 de Almeida 2012、マニング粗度 n = 0.035）で時間積分しており、洪水波は実際にかかる時間をかけて進みます。上流から下流まで同じモデルです——水が進んだ方向へ同じセル寸法の格子を継ぎ足していくので、下流に別の計算も別の描画もありません。⏭ は同じモデルを水が動かなくなるまで進めます。',
             'Echte Höhendaten. Das Wasser wird zeitlich integriert — 2-D-Flachwassergleichungen in lokal-inertialer Form (Bates 2010, q-zentriert nach de Almeida 2012) mit Manning-Reibung n = 0,035; eine Flutwelle braucht die Zeit, die sie braucht. Dasselbe Modell gilt für den gesamten Lauf: das Gitter wächst in Fließrichtung mit derselben Zellgröße. ⏭ rechnet weiter, bis das Wasser zur Ruhe kommt.',
             'Реальные высоты. Вода интегрируется по времени: двумерные уравнения мелкой воды в локально-инерционной форме (Bates 2010, q-центрированная схема de Almeida 2012), трение Маннинга n = 0,035 — паводковая волна идёт столько, сколько идёт. Одна и та же модель работает на всём пути: сетка достраивается туда, куда идёт вода, с тем же размером ячейки. ⏭ считает дальше, пока вода не остановится.',
             'Elevación real. El agua se integra en el tiempo con las ecuaciones de aguas someras en forma inercial local (Bates 2010, esquema centrado en q de de Almeida 2012) y fricción de Manning n = 0,035: una onda de crecida tarda lo que tarda. El mismo modelo cubre todo el recorrido: la malla se extiende hacia donde va el agua, con el mismo tamaño de celda. ⏭ sigue integrando hasta que el agua se detiene.')
          +'</div></details>'
        +'</div>'
        +'<div class="tw-foot" style="flex:0 0 auto;position:sticky;bottom:0;padding:8px 12px calc(10px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:8px;background:var(--card-bg,#1c1c1e);border-top:1px solid var(--glass-border,rgba(128,128,128,0.25));">'
        /* ══ (#R258) 「時間は下部スティックしろ。」 — the transport, the multiplier and the clock ═══════ */
        +'<div style="display:flex;align-items:center;gap:8px;">'
          +'<button class="tw-play tw-pp" aria-label="'+L('Pour','注水','Zulauf','Наполнение','Verter')+'">▶</button>'
          +'<div class="tw-segwrap" style="flex:1 1 auto;">'+[1,10,60,600].map(s=>'<button class="tw-seg tw-ts" data-s="'+s+'">'+(s>=60?(s/60)+'m':s+'s')+'</button>').join('')+'</div>'
          /* (#R265) …and the way to the END of the run, for a reader who wants the resting answer
             rather than the journey — it is the routing this file has always computed. */
          +'<button class="tw-play tw-settle" aria-label="'+L('Run on until the water stops moving','水が動かなくなるまで進める','Bis zur Ruhe weiterrechnen','Считать, пока вода не остановится','Integrar hasta que el agua se detenga')+'">⏭</button>'
        +'</div>'
        +'<div class="tw-clock" style="display:flex;justify-content:space-between;gap:8px;"><span class="tw-elapsed"></span><span class="tw-vol" style="opacity:.72;"></span></div>'
        +'<div style="display:flex;gap:5px;flex-wrap:wrap;">'
          +'<button class="tw-btn tw-undo" style="flex:1 1 46%;">↩ '+L('Undo','元に戻す','Rückgängig','Отменить','Deshacer')+'</button>'
          /* (#R211) 「配置した水は残して地形だけ戻す「地形をリセット」を追加」 */
          +'<button class="tw-btn tw-resetT" style="flex:1 1 46%;">⛰ '+L('Reset terrain','地形をリセット','Gelände zurücksetzen','Сбросить рельеф','Reiniciar terreno')+'</button>'
          /* (#R211) 「全消去→リセットに改名」 — 全消去 read as "delete everything on the map" */
          +'<button class="tw-btn tw-reset" style="flex:1 1 100%;">✖ '+L('Reset','リセット','Zurücksetzen','Сброс','Reiniciar')+'</button>'
        +'</div>'
        /* (#R211) the progress bar — hidden until something is actually computing */
        +'<div class="tw-prog" style="display:none;">'
          +'<div style="height:4px;border-radius:3px;background:var(--input-bg);overflow:hidden;">'
            +'<div class="tw-prog-bar" style="height:100%;width:0%;background:var(--prog-grad);transition:width .18s linear;"></div></div>'   /* (#R212) the accent, like every other bar */
          +'<div class="tw-prog-txt" style="font-size:10px;color:var(--text-muted);margin-top:3px;"></div>'
        +'</div>'
        +'<div class="tw-stat" style="font-size:'+TW_FS_S+';color:var(--text-main);min-height:16px;line-height:1.55;"></div>'
        +'</div>';
      panel.querySelector('.tw-close').onclick=()=>close();
      panel.querySelectorAll('.tw-m').forEach(b=>b.onclick=()=>{ setMode(b.getAttribute('data-m')); });
      panel.querySelector('.tw-rain').onchange=e=>{ pushUndo(); rainMm=Math.max(0,+e.target.value||0); solve(); };
      /* (#R258) the clock belongs to the simulation, so its controls are wired from here and stay
         live in every tool — including when no tool at all is selected. */
      panel.querySelectorAll('.tw-ts').forEach(b=>b.onclick=()=>{ timeScale=+b.getAttribute('data-s'); syncFoot(); });
      /* ⚠ (#R261) …AND IT NO LONGER REWRITES THE TOOL'S MODE. `pourMode='cont'` here meant pressing ▶
         silently switched 「1回きり」 to 「継続」, so the next click placed a tap when the reader had
         asked for a bucket. ▶ runs the taps that exist; it does not decide what a tap is. */
      panel.querySelector('.tw-pp').onclick=()=>{ if(pourT) pourStop(); else pourStart(); syncFoot(); renderParams(); };
      /* (#R265) ⏭ — stop the clock and show the t → ∞ answer */
      panel.querySelector('.tw-settle').onclick=()=>{ pourStop(); settleSim(); renderParams(); };
      panel.querySelector('.tw-undo').onclick=()=>undo();
      /* (#R211) 「配置した水は残して地形だけ戻す」 — the sculpt and the levees go, the water stays put
         and is re-solved on the ORIGINAL ground, which is the comparison the button exists for. */
      panel.querySelector('.tw-resetT').onclick=()=>{ if(!G) return; pushUndo();
        sculpt=new Float32Array(G.NX*G.NY); levees=[]; solve(); };
      panel.querySelector('.tw-reset').onclick=()=>{ if(!G) return; pourStop(); sculpt=new Float32Array(G.NX*G.NY); levees=[]; sources=[]; rainMm=0; pourSimS=0; resetSim(); editDirty(); clearTrace();
        const r=panel.querySelector('.tw-rain'); if(r) r.value=0; undoStack=[]; solve(); terrainSoon(); };
      try{ makeDraggable(panel,panel.querySelector('.tw-head')); }catch(_){}
      syncMode(); renderParams(); syncFoot();
      if(result) report();
    }
    function syncMode(){ if(!panel) return; panel.querySelectorAll('.tw-m').forEach(b=>{
      b.classList.toggle('on',b.getAttribute('data-m')===mode); }); }
    /* ══ (#R258) THE FOOTER IS THE SIMULATION'S CLOCK ═══════════════════════════════════════════════
       Repainted without rebuilding the panel, so it can be called from the pour's own interval. The
       transport is disabled — visibly, not silently — until there is water to pour into. */
    function syncFoot(){ if(!panel) return;
      const pp=panel.querySelector('.tw-pp'); if(!pp) return;
      pp.textContent=pourT?'⏸':'▶';
      /* (#R261) ▶ pours the CONTINUOUS sources. With only one-shot volumes on the map there is
         nothing running to start, and the disabled title says which of the two cases it is. */
      /* ⚠ (#R265) ▶ IS LIVE WHENEVER THERE IS SOMETHING TO ADVANCE. With a steady-state solver a
         placed volume had nothing to do, so this was disabled unless a tap existed; now a bucket
         tipped out is a body of water that runs, and pressing ▶ is how you watch it. */
      const nc=contSources().length, mv=simMoving();
      pp.disabled=!(nc||mv);
      pp.title=(nc||mv)
        ? (pourT?L('Pause','一時停止','Pause','Пауза','Pausa'):L('Pour','注水開始','Zulauf starten','Начать','Verter'))
        : (sources.length
            ? L('The water has come to rest — add a continuous source or place more','水は静止しました。継続の水源を足すか、さらに配置してください','Das Wasser ruht — dauernde Quelle hinzufügen oder mehr platzieren','Вода успокоилась — добавьте источник или ещё воды','El agua se ha detenido — añada una fuente o más agua')
            : L('Place water on the map first','先に地図へ水を配置してください','Zuerst Wasser platzieren','Сначала разместите воду','Coloque agua primero'));
      const sb=panel.querySelector('.tw-settle');
      if(sb){ sb.disabled=!sources.length&&!rainMm; sb.classList.toggle('on',!!steady); }
      panel.querySelectorAll('.tw-ts').forEach(b=>b.classList.toggle('on',+b.getAttribute('data-s')===timeScale));
      const el=panel.querySelector('.tw-elapsed');
      /* (#R265) the elapsed clock now has something to be elapsed AGAINST: how far the wetted edge
         has travelled from the source, and the mean speed that implies. That pair is the whole
         report — a front that is 12 km out after 40 simulated seconds is the defect, visibly. */
      if(el){
        const front=(simFrontM>0&&!steady)
          ? (' · '+L('front','先端','Front','фронт','frente')+' '+(simFrontM>=1000?((simFrontM/1000).toFixed(1)+' km'):(Math.round(simFrontM)+' m'))
             +((pourSimS>0)?(' @ '+(simFrontM/pourSimS).toFixed(2)+' m/s'):''))
          : '';
        el.innerHTML=steady
          /* (#R267) …and this is a state the integration REACHED, not another model's answer copied
             in, so it carries the clock it took to get there. */
          ? (L('At rest','静止','In Ruhe','В покое','En reposo')+' · '+fmtDur(pourSimS))
          : (L('Elapsed','経過時間','Vergangen','Прошло','Transcurrido')+' '+fmtDur(pourSimS)+' ('+timeScale+'×)'+front);
      }
      const vo=panel.querySelector('.tw-vol');
      if(vo) vo.textContent=sources.length?fmtM3(pourTotal()):''; }
    /* (#R261) one line of plain language for what is on the map right now, used by the 「ここに水」
       tool's panel — «2 継続 · 1 1回きり» is the distinction the report asked to be able to see. */
    function sourceSummary(){ const c=contSources().length, o2=sources.length-c;
      if(!sources.length) return '';
      const parts=[];
      if(c) parts.push(c+' '+L('continuous','継続','dauernd','непрерывных','continuas'));
      if(o2) parts.push(o2+' '+L('one shot','1回きり','einmalig','разовых','de una vez'));
      return parts.join(' · '); }
    function renderParams(){ if(!panel) return; const p=panel.querySelector('.tw-params'); if(!p) return;
      if(mode==='raise'||mode==='lower'){
        /* (#R211) three named pen widths, and the height/depth box labelled for what this tool does
           to the ground (盛る → 高さ, 削る → 深さ) rather than one word for both. */
        p.innerHTML=cap(mode==='raise'?L('Raise','盛る','Anheben','Поднять','Elevar'):L('Lower','削る','Abtragen','Срезать','Rebajar'))
          +card('<div class="tw-row">'+L('Pen width','ペンの太さ','Pinselbreite','Ширина пера','Grosor')
            +'<span class="tw-val" style="flex:1 1 auto;max-width:180px;"><span class="tw-segwrap tw-pen" style="flex:1 1 auto;">'
              +PEN.map(([m2,lb])=>'<button class="tw-seg tw-pw" data-m="'+m2+'">'+lb+'</button>').join('')+'</span></span></div>'
          +'<label class="tw-row">'+(mode==='raise'
              ?L('Height per stroke','1ストロークの高さ','Höhe je Strich','Высота за мазок','Altura por trazo')
              :L('Depth per stroke','1ストロークの深さ','Tiefe je Strich','Глубина за мазок','Profundidad por trazo'))
            +'<span class="tw-val"><input class="tw-num tw-bs" type="number" min="1" max="500" step="5" value="'+brushStrength+'"><span style="opacity:.7;">m</span></span></label>'
          +'<div class="tw-row" style="color:var(--text-muted);">'+L('Radius','半径','Radius','Радиус','Radio')
            +'<span class="tw-val">'+Math.round(brushM)+' m</span></div>');
        p.querySelectorAll('.tw-pw').forEach(b=>{ const v=+b.getAttribute('data-m');
          b.classList.toggle('on',Math.abs(brushM-v)<1e-6);
          b.onclick=()=>{ brushM=v; renderParams(); }; });
        p.querySelector('.tw-bs').onchange=e=>brushStrength=Math.max(1,+e.target.value||20);
      } else if(mode==='levee'){
        /* (#R258) …and it says when the grid cannot carry the width that was typed (see stampLevees) */
        const thin=(leveeWidth/2/((G&&G.cellM)||1))<1.5;
        p.innerHTML=cap(L('Levee / dam','堤防・ダム','Deich / Damm','Дамба','Dique / presa'))
          +card('<div class="tw-blk" style="color:var(--text-muted);font-size:'+TW_FS_S+';">'+L('Click along the line, double-click to finish.','線に沿ってクリック、ダブルクリックで確定。','Entlang der Linie klicken, Doppelklick beendet.','Кликайте по линии, двойной клик — конец.','Haga clic a lo largo; doble clic para terminar.')+'</div>'
          +'<label class="tw-row">'+L('Crest above ground','天端高（地上）','Kronenhöhe','Высота гребня','Coronación')
            +'<span class="tw-val"><input class="tw-num tw-lc" type="number" min="1" max="300" step="1" value="'+leveeCrest+'"><span style="opacity:.7;">m</span></span></label>'
          +'<label class="tw-row">'+L('Width','幅','Breite','Ширина','Ancho')
            +'<span class="tw-val"><input class="tw-num tw-lw" type="number" min="10" max="2000" step="10" value="'+leveeWidth+'"><span style="opacity:.7;">m</span></span></label>'
          +((G&&thin)?('<div class="tw-blk" style="color:var(--text-muted);font-size:'+TW_FS_S+';">⚠ '
              +L('Thinner than the solver grid ('+Math.round(G.cellM)+' m cells) — it is built '+Math.round(G.cellM*3)+' m wide so the water cannot pass between the cells.',
                 '解像度（'+Math.round(G.cellM)+' m セル）より細いため、セルの隙間を水が抜けないよう幅 '+Math.round(G.cellM*3)+' m で構築します。',
                 'Dünner als das Rechengitter ('+Math.round(G.cellM)+' m) — gebaut mit '+Math.round(G.cellM*3)+' m.',
                 'Тоньше расчётной сетки ('+Math.round(G.cellM)+' м) — строится шириной '+Math.round(G.cellM*3)+' м.',
                 'Más fino que la malla ('+Math.round(G.cellM)+' m) — se construye de '+Math.round(G.cellM*3)+' m.')+'</div>'):''));
        p.querySelector('.tw-lc').onchange=e=>{ leveeCrest=Math.max(1,+e.target.value||8); renderParams(); };
        p.querySelector('.tw-lw').onchange=e=>{ leveeWidth=Math.max(10,+e.target.value||60); renderParams(); };
      } else if(mode==='source'){
        /* ══ (#R211) ONE POUR, OR A TAP LEFT RUNNING ═══════════════════════════════════════════════
           「連続注水アニメーション（1回きりの一定量 or 継続注水を選択、時間速度も調節可）」
           ⚠ AND IT IS NOT AN ANIMATION OVER A FAKE CLOCK. The solver is steady-state (see the file
           header) — it answers where a GIVEN volume ends up. So "continuous" is exactly that,
           repeated: the source's volume grows by rate × elapsed simulated time and the same solve
           re-runs, which is the quasi-static filling sequence a reservoir study actually draws.
           The panel prints the simulated time alongside the volume so the two are never confused,
           and the speed control multiplies simulated time, not the frame rate. */
        /* ⚠ (#R258) THE TRANSPORT AND THE SPEED ARE NOT HERE ANY MORE — they are in the footer, which
           is what 「時間は下部スティックしろ」 asks for and what stops them vanishing when the reader
           picks up the brush while a pour is running. What stays is what the TOOL decides: whether a
           click drops a fixed volume or opens a tap, how much, and the channel discharge. */
        p.innerHTML=cap(L('Water here','ここに水','Wasser hier','Вода здесь','Agua aquí'))
          /* (#R261) the segmented control decides what the NEXT click places; each source then keeps
             that kind for good, so the label has to say «next» or it reads as a global switch. */
          +card('<div class="tw-row">'+L('Next source','次に置く水源','Nächste Quelle','Следующий источник','Próxima fuente')
            +'<span class="tw-val" style="flex:1 1 auto;max-width:190px;"><span class="tw-segwrap" style="flex:1 1 auto;">'
              +'<button class="tw-seg tw-pm" data-p="once">'+L('One shot','1回きり','Einmalig','Разово','Una vez')+'</button>'
              +'<button class="tw-seg tw-pm" data-p="cont">'+L('Continuous','継続','Dauernd','Непрерывно','Continuo')+'</button>'
            +'</span></span></div>'
          +(pourMode==='once'
            ?'<label class="tw-row">'+L('Volume per click','1クリックの水量','Volumen je Klick','Объём за клик','Volumen por clic')
              +'<span class="tw-val"><input class="tw-num tw-sv" type="number" min="1" step="100000" value="'+srcM3+'"><span style="opacity:.7;">m³</span></span></label>'
            :'<label class="tw-row">'+L('Inflow','注水量','Zulauf','Приток','Aporte')
              +'<span class="tw-val"><input class="tw-num tw-pr" type="number" min="1" step="1000" value="'+pourRate+'"><span style="opacity:.7;">m³/s</span></span></label>')
          /* (#R189) 「水の水流は設定可能に」 — (#R267) empty leaves each tap on its own rate; a value
             here sets the rate of every continuous source, which is what the model consumes. */
          +'<label class="tw-row">'+L('Discharge','流量','Durchfluss','Расход','Caudal')
            +'<span class="tw-val"><input class="tw-num tw-fq" type="number" min="0" step="50" value="'+(flowM3s!=null?flowM3s:'')+'" placeholder="'+L('auto','自動','auto','авто','auto')+'"><span style="opacity:.7;">m³/s</span></span></label>'
          /* (#R261) …and what is actually standing on the map, by kind, with the key to the two dots */
          +(sources.length
            ?('<div class="tw-row" style="color:var(--text-muted);align-items:flex-start;">'+L('On the map','配置済み','Auf der Karte','На карте','En el mapa')
              +'<span class="tw-val" style="flex-wrap:wrap;justify-content:flex-end;">'+sourceSummary()+'</span></div>'
              +'<div class="tw-blk" style="color:var(--text-muted);font-size:'+TW_FS_S+';display:flex;gap:12px;flex-wrap:wrap;">'
                +'<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:#29b6f6;border:2px solid #04283a;"></span>'
                  +L('one shot','1回きり','einmalig','разовый','de una vez')+'</span>'
                +'<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:#34c759;box-shadow:0 0 0 3px rgba(52,199,89,0.35);"></span>'
                  +L('continuous (▶ pours these)','継続（▶ で注水されるのはこちら）','dauernd (▶ füllt diese)','непрерывный (▶ наполняет их)','continua (▶ vierte estas)')+'</span></div>')
            :''));
        p.querySelectorAll('.tw-pm').forEach(b=>{ b.classList.toggle('on',b.getAttribute('data-p')===pourMode);
          b.onclick=()=>{ pourMode=b.getAttribute('data-p'); if(pourMode==='once') pourStop(); renderParams(); syncFoot(); }; });
        const sv=p.querySelector('.tw-sv'); if(sv) sv.onchange=e=>srcM3=Math.max(1,+e.target.value||1e6);
        const pr=p.querySelector('.tw-pr'); if(pr) pr.onchange=e=>pourRate=Math.max(1,+e.target.value||20000);
        p.querySelector('.tw-fq').onchange=e=>{ const v=parseFloat(e.target.value);
          flowM3s=(isFinite(v)&&v>0)?v:null;
          /* (#R267) the discharge is an INPUT to the model now — it sets the rate of the continuous
             sources that have not been given one of their own — rather than the scale of a
             cross-section drawing that no longer exists. */
          sources.forEach(x=>{ if(x.cont&&flowM3s!=null) x.rate=flowM3s; });
          solve(); };
      } else p.innerHTML=card('<div class="tw-blk" style="color:var(--text-muted);font-size:'+TW_FS_S+';">'+L('Drag the map normally. Pick a tool above to edit.','通常どおり地図を操作できます。編集は上のツールを選んでください。','Karte normal bewegen. Oben ein Werkzeug wählen.','Карта работает как обычно. Выберите инструмент выше.','Mueva el mapa normalmente. Elija una herramienta arriba.')+'</div>');
    }
    /* (#R211) re-selecting the active tool releases it — see modes(). 'pan' remains the idle state
       the map's own gestures belong to; it is simply no longer something you have to find. */
    /* ══ ⚠ (#R255) PUTTING THE TOOL DOWN IS NOT STOPPING THE WATER ═════════════════════════════════
       「ここに水を選択解除したら時間がリセットされるのをやめろ。」 Leaving the 「ここに水」 tool called
       `pourStop()`, which clears the interval — the elapsed clock stops dead, and because the next
       `placeSource` in continuous mode sets `pourSimS = 0`, the reader who deselects and then places
       again sees the timer back at zero. The tool is what the POINTER does; the pour is a running
       simulation and belongs to the simulation. Selecting «pan» to move the map around a flood must
       not end the flood. (Explicit stops are unchanged: the ⏸ button, 全消去, 元に戻す and close.) */
    function setMode(m){ mode=(mode===m&&m!=='pan')?'pan':m; drafting=null;
      try{ GE().render.canvas().style.cursor=(mode==='pan')?'':'crosshair'; }catch(_){}
      try{ if(mode==='raise'||mode==='lower') GE().input.set('dragPan',false); else GE().input.set('dragPan',true); }catch(_){}
      syncMode(); renderParams(); draw(); }

    /* ---- map interaction -------------------------------------------------------------------------- */
    let painting=false, paintRaf=0;
    function onDown(e){ if(!opened) return;
      if(mode==='raise'||mode==='lower'){
        /* (#R189) the brush had the same silent first line the water source had (#R188): no grid →
           the stroke vanished without a word. Build one around the stroke and say so. */
        if(!G){ rebuildAround(e.lngLat.lng,e.lngLat.lat).then(ok=>{ if(ok) solve(); else _bldFail(); }); return; }
        /* (#R186) same trap as the water source: a brush stroke outside the rectangle painted nothing */
        if(!cellOf(e.lngLat.lng,e.lngLat.lat)){ rebuildAround(e.lngLat.lng,e.lngLat.lat).then(ok=>{ if(ok) solve(); else _bldFail(); }); return; }
        painting=true; pushUndo(); paintBrush(e.lngLat.lng,e.lngLat.lat,mode==='raise'?1:-1); schedule(); } }
    function onMove(e){ if(!painting) return; paintBrush(e.lngLat.lng,e.lngLat.lat,mode==='raise'?1:-1); schedule(); }
    function onUp(){ if(painting){ painting=false; solve(); terrainSoon(); } }
    function schedule(){ if(paintRaf) return; paintRaf=requestAnimationFrame(()=>{ paintRaf=0; solve(); }); }
    /* ⚠ (#R186) THE REPORTED FAULT, AND ITS CAUSE.
       「Terrain & waterで、水を配置したときに、結果が出ないことがある。」
       The working grid is clipped to at most 60 km (build(), MAXKM) but the viewport is very often
       larger, and every edit went through `cellOf`, which returns null outside the grid. A click out
       there pushed a source that no solver cell ever saw: the blue dot appeared, `solve()` ran, and
       NOTHING changed — a silent no-op that looks exactly like a broken feature.
       Two things fix it, and both are needed: the rectangle is now drawn (see ensureVec), and a click
       outside it REBUILDS the grid around that click instead of being discarded. Rebuilding costs a
       DEM read, so it is only done when the click really is outside. */
    function inGrid(lng,lat){ return !!cellOf(lng,lat); }
    /* (#R189) the shared "the DEM did not arrive" message — every rebuild path says it now instead
       of leaving the stat stuck on "Moving the working area here…"
       ⚠ (#R190) ONE string, in one place, used by build() and by every caller of it. #R183's rule:
       a second copy of a message is a second thing to keep true, and #R189 had three copies of the
       old wording. It also no longer blames the PLACE — build()'s resolution ladder (see there) drops
       to z7 before giving up, so the only way to reach this is an unreachable elevation host. */
    const _DEM_FAIL=()=>L('The elevation tiles could not be fetched — check the connection and try again.',
                          '標高タイルを取得できませんでした。通信状況を確認して、もう一度お試しください。',
                          'Höhenkacheln konnten nicht geladen werden — Verbindung prüfen und erneut versuchen.',
                          'Не удалось загрузить тайлы рельефа — проверьте соединение и повторите.',
                          'No se pudieron descargar los teselas de elevación — revise la conexión e inténtelo de nuevo.');
    function _bldFail(){ setStat('⚠ '+_DEM_FAIL()); }
    /* ══ ⚠ (#R255) THE WORKING AREA MOVES. THE CAMERA DOES NOT ══════════════════════════════════════
       「地形編集・水流で水を置いた場所に画面を移動するのをやめろ。」 This used to `easeTo` the click
       and then wait 520 ms for the camera to land, because `build()` took its rectangle from
       `camera.getBounds()` — so moving the view WAS how the working area was aimed. Taking the
       rectangle as an argument instead aims it directly: the reader's view is left exactly where they
       put it, and the half-second of dead time before the DEM read goes with the camera flight.
       ⚠ The span still comes from the view (the rectangle is «about a screenful», which is what makes
       the cell size match what is on screen); only its CENTRE is the click now. */
    async function rebuildAround(lng,lat){
      setStat(L('Moving the working area here…','作業範囲をここへ移動中…','Arbeitsbereich wird hierher verschoben…','Рабочая область переносится сюда…','Moviendo el área de trabajo…'));
      return await build({center:[lng,lat]});
    }
    /* ⚠ (#R188) THE OTHER SILENT NO-OP. #R186 found and fixed one cause of 「水を配置したときに、結果が
       出ないことがある」 — a click outside the working rectangle. It left a second one in the very
       first line of this handler: `if(!opened||!G) return`. `G` is null until build() has finished
       reading the DEM (seconds, and longer on a cold tile cache) and stays null for good if that read
       failed, so a click in either state was discarded without a word — exactly the same "nothing
       happens" the report is about, from a different direction. A click now BUILDS if there is no
       grid yet and then places the water, and says which is happening. */
    let _pendingSrc=null;
    async function onClickNoGrid(lng,lat){
      if(_pendingSrc) return;                       /* one build at a time; the click is not lost, it is queued */
      _pendingSrc=[lng,lat];
      setStat(L('Reading the terrain here…','ここの地形を読み込み中…','Gelände wird hier gelesen…','Чтение рельефа здесь…','Leyendo el terreno aquí…'));
      let ok=false;
      try{ ok=await rebuildAround(lng,lat); }catch(_){ ok=false; }
      const p=_pendingSrc; _pendingSrc=null;
      if(!ok||!G){ _bldFail(); return; }   /* (#R190) one message, one wording — see _DEM_FAIL */
      placeSource(p[0],p[1]);
    }
    /* (#R211) ONE place where water is placed, so 元に戻す, the pour mode and the downstream trace
       cannot disagree about what a click did. */
    function placeSource(lng,lat){ pushUndo();
      /* (#R261) the tool's current mode decides what the NEXT source is; the source then keeps it */
      const cont=(pourMode==='cont');
      sources.push({lng,lat,m3:cont?0:srcM3,cont,rate:cont?pourRate:0});
      /* (#R255) the clock is the SIMULATION's, not this source's — it is reset when the simulation is
         (全消去 / 元に戻す / close), and a second inlet added to a flood that is already running joins
         it at the time it is at. Restarting from zero here is what made 「時間がリセットされる」 true
         even after the tool-switch stop was removed. */
      /* (#R265) …and a ONE-SHOT volume now has somewhere to be as well: it is a body of water that
         runs downhill, so placing it starts the clock exactly as a tap does. ⏸ or ⏭ take it back. */
      if(pourMode==='cont'&&!pourT) pourSimS=0;
      solve(); pourStart(); if(panel) renderParams();
      try{ syncFoot(); }catch(_){}      /* (#R258) the transport is live the moment there is water */
      courseSoon(); }
    function onClick(e){ if(!opened) return;
      try{ GE().events.claimClick&&GE().events.claimClick(e); }catch(_){}   /* (#R210) the brush owns the tap while this tool is open */
      const lng=e.lngLat.lng, lat=e.lngLat.lat;
      if(!G){ if(mode==='source') onClickNoGrid(lng,lat);
        /* (#R189) a levee click before the grid exists was the last silent drop — build and say so */
        else if(mode==='levee') rebuildAround(lng,lat).then(ok=>{ if(!ok) _bldFail(); });
        return; }
      if(mode==='levee'){ if(!drafting) drafting={pts:[],crest:leveeCrest,width:leveeWidth};
        drafting.pts.push([lng,lat]); draw(); }
      else if(mode==='source'){
        if(!inGrid(lng,lat)){ rebuildAround(lng,lat).then(ok=>{ if(!ok){ _bldFail(); return; }
          placeSource(lng,lat); }); return; }
        /* (#R186) …and follow it out: 「水は流れなくなる地点または海に到達した地点まで」 (placeSource) */
        placeSource(lng,lat);
      } }
    /* (#R174 recorded this: a double-click delivers TWO plain clicks first, so the last two vertices of
       a levee are the same point twice. Drop them, and stop MapLibre zooming on the same gesture. */
    function onDbl(e){ if(!opened) return;
      if(mode!=='levee'||!drafting) return;
      try{ e.preventDefault(); }catch(_){}
      const p=drafting.pts;
      while(p.length>2){ const a=p[p.length-1], b=p[p.length-2];
        if(Math.abs(a[0]-b[0])<1e-7&&Math.abs(a[1]-b[1])<1e-7) p.pop(); else break; }
      if(p.length>=2){ pushUndo(); levees.push(drafting); drafting=null; editDirty(); solve(); terrainSoon(); }   /* (#R211) a levee is one operation */
      else { drafting=null; draw(); } }
    GE().events.on('mousedown',onDown); GE().events.on('mousemove',onMove); GE().events.on('mouseup',onUp);
    GE().events.on('touchstart',onDown); GE().events.on('touchmove',onMove); GE().events.on('touchend',onUp);
    GE().events.on('click',onClick); GE().events.on('dblclick',onDbl);

    /* ---- lifecycle -------------------------------------------------------------------------------- */
    async function open(o){
      if(!panel){ panel=document.createElement('div'); panel.id='tw-panel';
        /* (#R189) 「ポップアップは透過するな」 — --card-bg is opaque in BOTH themes (#fff / #1c1c1e);
           --popup-bg was rgba(...,0.72/0.74) with no backdrop-filter, i.e. the map showed through
           unblurred behind the numbers. */
        /* (#R255) a ceiling, so the body can be the thing that scrolls under the sticky footer */
        panel.style.cssText='position:fixed;left:16px;top:80px;width:min(330px,92vw);max-height:min(82vh,calc(100vh - 104px));z-index:1402;display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
        document.body.appendChild(panel); }
      panel.style.display='flex'; opened=true; render();
      /* (#R255) the readout family reads the sculpted ground through this while the tool is open */
      try{ window.IntMapElevEdit=(lng,lat,v)=>{ try{ return (opened&&G)?(v+editDeltaAt(lng,lat)):v; }catch(_){ return v; } }; }catch(_){}
      if(o&&o.lng!=null){ try{ GE().camera.flyTo({center:[o.lng,o.lat],zoom:Math.max(GE().camera.getZoom(),11),duration:600}); }catch(_){}
        await new Promise(r=>setTimeout(r,750)); }
      if(!G||o&&o.refit){ if(await build()) solve(); } else solve();
      return true; }
    /* (#R267) there is nothing in flight to abort any more — the answer is a reading of the field,
       so clearing it is clearing the reading. `course` is the running «has it stopped» book-keeping. */
    function clearTrace(){ if(_courseT){ clearTimeout(_courseT); _courseT=null; }
      trace=null; course={ end:null, at:null, info:null, since:0, lastFrontM:0, checking:false }; }
    function close(){ opened=false; painting=false; drafting=null; clearTrace(); pourStop(); setProg(null);
      /* (#R255) hand the untouched ground back — the hook and the sculpted DEM both go with the tool */
      try{ delete window.IntMapElevEdit; }catch(_){ try{ window.IntMapElevEdit=null; }catch(__){} }
      try{ syncTerrain(); }catch(_){}
      try{ GE().input.set('dragPan',true); GE().render.canvas().style.cursor=''; }catch(_){}
      if(panel) panel.style.display='none'; wipe(); return true; }
    window.addEventListener('intmap-lang',()=>{ if(opened) render(); });

    /* ══ (#R211) THE NUMBERS THE USER TYPED TRAVEL WITH THE LINK ═══════════════════════════════════
       「シミュレーションに入力された数値まで共有して同じ状態で開ける。」
       The registry key IS the lazy-module name, because this module is fetched on demand: at restore
       time js/map-ui.js asks IntMapLazy for 'terrainWater' by that key and hands the value over the
       moment this registration runs. Coordinates are rounded to 5 decimals (~1 m) and volumes to the
       cubic metre — a link is a link, not a save file, and the solve is deterministic from these. */
    try{ window.IntMapShareState&&window.IntMapShareState.register('terrainWater',{
      get(){ if(!opened) return null;
        return { m:mode, rain:rainMm, vol:srcM3, q:flowM3s, br:brushM, bs:brushStrength,
          pm:pourMode, pr:pourRate, ts:timeScale,
          src:sources.slice(0,40).map(s=>[+s.lng.toFixed(5),+s.lat.toFixed(5),Math.round(s.m3)]),
          lv:levees.slice(0,12).map(l=>[l.crest,l.width,l.pts.map(p=>[+p[0].toFixed(5),+p[1].toFixed(5)])]) }; },
      set(v){ if(!v||typeof v!=='object') return;
        if(v.rain!=null) rainMm=Math.max(0,+v.rain||0);
        if(v.vol!=null) srcM3=Math.max(1,+v.vol||srcM3);
        if(v.q!=null) flowM3s=(isFinite(+v.q)&&+v.q>0)?+v.q:null;
        if(v.br!=null) brushM=Math.max(20,+v.br||brushM);
        if(v.bs!=null) brushStrength=Math.max(0.1,+v.bs||brushStrength);
        if(v.pm==='cont'||v.pm==='once') pourMode=v.pm;
        if(v.pr!=null) pourRate=Math.max(1,+v.pr||pourRate);
        if(v.ts!=null) timeScale=Math.max(1,+v.ts||timeScale);
        const first=(Array.isArray(v.src)&&v.src[0])?{lng:+v.src[0][0],lat:+v.src[0][1]}:null;
        Promise.resolve(open(first?{lng:first.lng,lat:first.lat}:undefined)).then(()=>{
          if(Array.isArray(v.lv)) v.lv.forEach(l=>{ if(Array.isArray(l)&&Array.isArray(l[2])&&l[2].length>1)
            levees.push({pts:l[2].map(p=>[+p[0],+p[1]]),crest:Math.max(1,+l[0]||leveeCrest),width:Math.max(10,+l[1]||leveeWidth)}); });
          if(Array.isArray(v.src)){ sources=v.src.map(s=>({lng:+s[0],lat:+s[1],m3:Math.max(0,+s[2]||0)})); }
          if(v.m) setMode(String(v.m));
          editDirty();          /* (#R258) a restored levee is a change to the ground — see addLevee */
          solve();
          if(sources.length) courseSoon();
          if(opened) render();
        }).catch(()=>{}); } }); }catch(_){}

    return { open, close, solve, build,
      isOpen:()=>opened, setMode,
      /* (#R176) the sculpting the brush does, as a call — so Atlas can say "dig a basin here" and so a
         test can prove that a pit really ponds water instead of trusting a mouse gesture (standing rule:
         every feature is operable through Atlas). */
      brush(lng,lat,dir,o){ if(!G) return false; o=o||{};
        const rb=brushM, sb=brushStrength;
        if(o.radiusM!=null) brushM=Math.max(20,+o.radiusM||brushM);
        if(o.heightM!=null) brushStrength=Math.max(0.1,+o.heightM||brushStrength);
        pushUndo(); paintBrush(lng,lat,(dir==='lower'||dir===-1)?-1:1);
        brushM=rb; brushStrength=sb; solve(); return true; },
      setBrush(o){ o=o||{}; if(o.radiusM!=null) brushM=Math.max(20,+o.radiusM||brushM);
        if(o.heightM!=null) brushStrength=Math.max(0.1,+o.heightM||brushStrength);
        if(opened) renderParams(); return { radiusM:brushM, heightM:brushStrength }; },
      /* (#R176) WHAT HAPPENS AT ONE POINT — the ground after editing, the water standing on it, how much
         passes through, and, if it is inside a basin, that basin's whole story: how much it can hold,
         how much arrived, where it is spilling. */
      /* ⚠ (#R267) `depthM` IS THE WATER THAT IS THERE, WHICH IS THE INTEGRATION. `result.depth`
         used to be the routing's t → ∞ field and is `eqDepth` now — reading it here would answer
         「ここの水深は」 with a different model's number than the one on screen, which is the
         defect this round removed. `restDepthM` keeps the resting answer beside it, named. */
      probe(lng,lat){ if(!G||!result) return null; const c=cellOf(lng,lat); if(!c) return null;
        const k=c.j*G.NX+c.i, id=result.depId?result.depId[k]:-1;
        const dp=(id>=0&&result.deps[id])?result.deps[id]:null;
        const bc=basinCellOf(lng,lat);
        const dNow=(sim&&B&&bc)?sim.h[bc.j*B.NX+bc.i]:0;
        return { groundM:result.surf[k], depthM:dNow, restDepthM:result.eqDepth[k],
          arrivedS:(sim&&B&&bc)?(function(t){ return (t===t)?t:null; })(sim.tArr[bc.j*B.NX+bc.i]):null,
          throughM3:result.through[k],
          basin: dp?{ cells:dp.cells.length, capacityM3:dp.capacity, inflowM3:dp.inflow,
            levelM:dp.level, spillM:dp.spill, overflowM3:dp.over||0, full:(dp.over||0)>0 }:null }; },
      undo,
      setRain(mm){ pushUndo(); rainMm=Math.max(0,+mm||0); const r=panel&&panel.querySelector('.tw-rain'); if(r) r.value=rainMm; return solve(); },
      /* ══ (#R211) THE CONTINUOUS POUR, AS A CALL ═══════════════════════════════════════════════
         Standing rule: every feature is operable from Atlas. `mode:'cont'` keeps adding
         rateM3s × speed cubic metres of water per real second to the most recently placed source
         and re-solves; `run:false` (or mode:'once') stops it. `speed` is SIMULATED seconds per real
         second — it multiplies the water, never the frame rate. */
      pour(o){ o=o||{};
        if(o.mode==='once'||o.mode==='cont') pourMode=o.mode;
        if(o.rateM3s!=null) pourRate=Math.max(1,+o.rateM3s||pourRate);
        if(o.speed!=null) timeScale=Math.max(1,+o.speed||timeScale);
        if(o.run===false) pourStop();
        else if(o.run===true||(o.run==null&&contSources().length)) pourStart();   /* (#R261) run what is actually continuous */
        if(opened) renderParams();
        return this.pourState(); },
      pourState(){ const st=(sim&&sim.stats)?sim.stats():null;
        return { running:!!pourT, mode:pourMode, rateM3s:pourRate, speed:timeScale,
        simSeconds:Math.round(pourSimS), totalM3:pourTotal(),
        /* (#R261) how many of each kind are on the map — the thing that used to be unknowable */
        continuous:contSources().length, oneShot:sources.length-contSources().length,
        /* (#R265) the water itself: where its edge has got to, how fast, and whether the clock is
           the running one or the t → ∞ one */
        steady, frontM:Math.round(simFrontM), frontMs:(pourSimS>0?+(simFrontM/pourSimS).toFixed(3):0),
        storedM3:st?Math.round(st.storedM3):0, outM3:st?Math.round(st.outM3):0,
        maxDepthM:st?+st.maxDepthM.toFixed(2):0, dtS:st?+st.dt.toFixed(2):0,
        cappedTicks:simCapped }; },
      /* (#R265) ⏭ as a call — Atlas must be able to reach every control (standing rule) */
      settle(){ pourStop(); return settleSim(); },
      /* (#R265) advance the water by a given number of SIMULATED seconds without the wall clock —
         this is what a test drives, and what «run it for six hours» means from Atlas */
      advance(seconds){ if(!G) return null;
        const sec=Math.max(0,+seconds||0); if(!sec) return null;
        /* ⚠ this door is not on a frame budget, so it gets a step ceiling generous enough that «run
           it for six hours» really runs six hours; the interactive tick keeps SIM_MAX_STEPS. */
        /* ⚠ (#R267) «run it for six hours» really runs six hours — but not for ever. The lattice
           grows with the flood, so a step is not a fixed price; a run that hits the ceiling reports
           how far it actually got, and the clock follows the water either way. */
        const r=stepSim(sec,2000000,20000);
        solve(); try{ syncFoot(); }catch(_){}
        return r; },
      /* (#R211) what the progress bar is showing, for a test that must not sleep a fixed time */
      progress(){ return { busy:!!(building||tracing||progOn), building, tracing }; },
      /* (#R267) the discharge a continuous source delivers, in m³/s. It used to be the scale of the
         cross-section drawing that no longer exists; it is now an INPUT to the one model — which is
         what «the same model everywhere» costs and buys. */
      setFlow(m3s){ const v=parseFloat(m3s); flowM3s=(isFinite(v)&&v>0)?v:null;
        const f=panel&&panel.querySelector('.tw-fq'); if(f) f.value=(flowM3s!=null?flowM3s:'');
        sources.forEach(x=>{ if(x.cont&&flowM3s!=null) x.rate=flowM3s; });
        if(G) solve();
        return flowM3s; },
      /* (#R261) `o.cont` / `o.rateM3s` — the same distinction the map now draws, through the API.
         Omitted keeps the old meaning exactly: a one-shot volume. */
      addSource(lng,lat,m3,o){ o=o||{}; pushUndo();
        const cont=!!o.cont;
        sources.push({lng,lat,m3:cont?Math.max(0,+m3||0):Math.max(0,+m3||srcM3),cont,rate:cont?Math.max(1,+o.rateM3s||flowM3s||pourRate):0});
        if(cont&&!pourT) pourStart();
        const r=solve();
        courseSoon(); return r; },
      /* ══ (#R267) 「水は流れなくなる地点または海に到達した地点まで」 — BY RUNNING IT ══════════════════
         #R186 answered this with a 600 km walk that finished in a few seconds because it never
         modelled time. The answer is the same question asked of the one model: put the water there
         and integrate until it stops moving or reaches the sea. `o.seconds` runs the clock for a
         fixed stretch instead, and `o.m3` is how much to place. Resolves with `traceState()`. */
      trace:async(lng,lat,o)=>{ o=o||{};
        if(!G||!cellOf(lng,lat)){ const ok=await rebuildAround(lng,lat); if(!ok) return null; }
        if(!sources.length) sources.push({lng,lat,m3:Math.max(0,+o.m3||srcM3),cont:false,rate:0});
        solve();
        tracing=true;
        try{
          if(o.seconds>0) stepSim(+o.seconds,200000);
          else settleSim();
          await courseCheck();
        } finally { tracing=false; }
        solve();
        return trace; },
      /* (#R186) what the model SEES at one point — the ground, the ring of neighbours, and what a
         local flood makes of it. #R176's lesson is that an error measured with the same expression
         that produced it stays invisible; this exposes the raw DEM so a test (or a person) can check
         the answer against the elevation data instead of against the code that read it. */
      _traceProbe:async(lng,lat,z)=>{ z=z||((G&&G.z)||11); await warmBlock(lng,lat,z);
        const s=CIRC*Math.max(0.05,Math.cos(lat*D))/(Math.pow(2,z)*256)*1.5;
        const dLat=s/110574, dLng=s/(111320*Math.max(0.05,Math.cos(lat*D)));
        const e0=demAt(lng,lat,z), ring=[];
        for(let a=0;a<16;a++){ const th=a*Math.PI/8; ring.push(demAt(lng+Math.sin(th)*dLng,lat+Math.cos(th)*dLat,z)); }
        const ok=ring.filter(v=>v!=null&&isFinite(v));
        const W=floodWindow(lng,lat,80,s,z); const k0=W?W.at(lng,lat):-1;
        return { stepM:+s.toFixed(2), e0, ringMin:ok.length?Math.min.apply(null,ok):null, ringN:ok.length,
                 window:(W&&k0>=0)?{ surf:W.surf[k0], filled:W.filled[k0], depth:W.filled[k0]-W.surf[k0] }:null }; },
      /* (#R186) "is this the sea?" on its own — the connectedness test, so a test can check it at a
         known ocean point and at a known below-sea-level closed basin instead of trusting the label */
      _seaCheck:(lng,lat)=>seaCheck(lng,lat),
      /* ══ (#R267) WHEN THE WATER GOT THERE — READ, NOT COMPUTED ═══════════════════════════════════
         `at(lng,lat)` is the clock the cell was first wet at (`tArr`), which is a fact about the run
         that drew the picture. #R265 answered this with ∫ds/c over a polyline: a second friction law
         over a second geometry, and MEASURED it put 99 km of the Fuji valley 184.8 days away. There
         is no formula here to be wrong — a cell that is not wet has no arrival time and says so. */
      travelTime:()=>{ if(!sim||!B) return null;
        const f=frontCell();
        return { totalS:f?f.tS:null, km:f?f.distM/1000:0, tS:sim.tS,
                 frontM:Math.round(simFrontM), model:(result&&result.model)||null,
                 at:(lng,lat)=>{ const c=basinCellOf(lng,lat); if(!c) return null;
                   const k=c.j*B.NX+c.i, t=sim.tArr[k];
                   return { tS:(t===t)?t:null, depthM:sim.h[k], bedM:simBed[k],
                            at:[bLng(c.i),bLat(c.j)] }; } }; },
      traceState:()=>(trace?{ end:trace.end, km:trace.km, to:trace.to, from:trace.from,
        info:trace.endInfo, tS:trace.tS, frontTS:trace.frontTS,
        wetCells:trace.wetCells, spanKm:trace.spanKm, tracing }:{ end:null, tracing }),
      /* ══ (#R267) THE REPORTED SYMPTOM, MEASURED — AND IT IS A DIFFERENT MEASUREMENT NOW ═══════════
         #R261/#R264/#R265 measured legs, chords and collinear runs because the drawn thing was a
         POLYLINE. It is a depth field, so the question «is there a straight run that ignores the
         terrain» becomes «is any drawn water somewhere the ground does not put it», and the honest
         instrument for that is: every wet cell, is its water surface (bed + depth) at or above its
         bed, and is the wet set 8-connected back to a source. A straight line of water across a
         hillside cannot exist in a field that only ever moves water between adjacent faces — this
         reports the numbers that would have to be non-zero for it to. */
      _dbgTrace:()=>{ if(!sim||!B) return null;
        const NX=B.NX, NY=B.NY, h=sim.h, tA=sim.tArr;
        let wet=0, minBed=Infinity, maxBed=-Infinity, maxD=0, isolated=0, arrived=0, tMax=0;
        const NB=[-1,1,-NX,NX,-NX-1,-NX+1,NX-1,NX+1];
        /* ⚠ CONNECTIVITY IS ASKED AT THE PHYSICAL WET THRESHOLD, NOT THE DRAWING ONE. At 2 cm a
           sheet thinning out has cells just above beside cells just below, and «isolated» would
           count the ramp rather than a defect; at H_DRY it is the invariant it is meant to be,
           because a cell can only have water if a face carried it there from a neighbour. */
        const WET=(WD()&&WD().H_DRY)||0.001;
        for(let j=0;j<NY;j++){ const row=j*NX;
          for(let i=0;i<NX;i++){ const k=row+i; if(!(h[k]>WET)) continue;
            const b=simBed[k];
            if(h[k]>0.02){ wet++;
              if(b<minBed) minBed=b; if(b>maxBed) maxBed=b; if(h[k]>maxD) maxD=h[k];
              if(tA[k]===tA[k]){ arrived++; if(tA[k]>tMax) tMax=tA[k]; } }
            /* a wet cell with no wet neighbour is water that got somewhere without crossing a face —
               which is the only way a field could do what a polyline's chord did. It must read 0. */
            let nb=0;
            for(let d=0;d<8;d++){ const nk=k+NB[d]; if(nk<0||nk>=h.length) continue;
              if(Math.abs((nk%NX)-i)>1) continue;
              if(h[nk]>WET) nb++; }
            if(!nb) isolated++; } }
        const f=frontCell();
        return { lattice:{ NX, NY, cellM:+B.cellM.toFixed(1), z:B.z,
                   spanKm:+(Math.max(NX,NY)*B.cellM/1000).toFixed(1), grows:basinGrow,
                   capped:basinCapped, growFailed, voids:basinVoid, offI:B.offI, offJ:B.offJ },
                 wetCells:wet, isolatedWetCells:isolated, arrivedCells:arrived,
                 /* ⚠ THE ONE THAT MUST BE ZERO — see the note over `jumpCells` in the solver.
                    `isolatedWetCells` is NOT that number: a receding tongue legitimately leaves a
                    detached puddle, and a check that called that a defect would be ignored. */
                 jump:sim.jumpCells(),
                 maxDepthM:+maxD.toFixed(2), bedRangeM:isFinite(minBed)?[+minBed.toFixed(1),+maxBed.toFixed(1)]:null,
                 tS:+sim.tS.toFixed(1), tMaxArrivalS:+tMax.toFixed(1),
                 front:f?{ at:[+f.lng.toFixed(4),+f.lat.toFixed(4)], km:+(f.distM/1000).toFixed(2),
                           bedM:+f.bedM.toFixed(1), depthM:+f.depthM.toFixed(2),
                           arrivedS:(f.tS===f.tS)?+f.tS.toFixed(1):null,
                           meanMs:(f.tS>0)?+(f.distM/f.tS).toFixed(3):null }:null,
                 drawing:{ blockCells:drawBlock, mPerPx:Math.round(drawPxM) },
                 end:trace?trace.end:null }; },
      clearTrace,
      /* ⚠ (#R258) `editDirty()` — WITHOUT IT THIS DOOR BUILDS NOTHING. MEASURED: adding a levee through
         this call and then sampling `IntMapElevEdit` along its own centreline returned **0.00 m at
         every point**. `editField()` is memoised on `editStamp`, and only `editDirty()` bumps it, so
         the levee never reached the solver, the readout or the 3-D relief — the water went straight
         through a dam that, as far as every consumer was concerned, did not exist. The double-click
         that builds one from the map has called `editDirty()` since #R255; this door was left out,
         which is the exact shape of the #R255 note above `editDirty` («hanging the re-mesh off the
         individual UI handlers is how `brush()` from Atlas sculpted nothing»). */
      addLevee(pts,crest,width){ if(!Array.isArray(pts)||pts.length<2) return false; pushUndo();
        levees.push({pts:pts.slice(),crest:Math.max(1,+crest||leveeCrest),width:Math.max(10,+width||leveeWidth)});
        editDirty(); solve(); return true; },
      /* ⚠ (#R265) …AND THE SHALLOW-WATER STATE WITH IT. Emptying `sources` used to leave `sim.h`
         holding everything that had been poured, so the next placement started on top of the old
         flood — measured, a 5 Mm³ release reported 「Ponded 14.48 Mm³」 after two runs. */
      clearWater(){ pushUndo(); pourStop(); sources=[]; rainMm=0; resetSim(); const r=panel&&panel.querySelector('.tw-rain'); if(r) r.value=0; return solve(); },
      /* (#R211) 「配置した水は残して地形だけ戻す」 — the button's other half, as a call */
      resetTerrain(){ if(!G) return false; pushUndo(); sculpt=new Float32Array(G.NX*G.NY); levees=[]; editDirty(); solve(); terrainSoon(); return true; },
      state:()=>({ open:opened, mode, grid:G?{nx:G.NX,ny:G.NY,cellM:G.cellM,z:G.z,bbox:G.bbox,demMissing:G.demMissing||0}:null,
        levees:levees.length, sources:sources.length, rainMm, flowM3s, tracing,
        /* (#R211) the pour, the pen and how many single operations 元に戻す can still take back */
        brushM, brushStrength, undoDepth:undoStack.length,
        pour:{ running:!!pourT, mode:pourMode, rateM3s:pourRate, speed:timeScale, simSeconds:Math.round(pourSimS), totalM3:pourTotal(),
          continuous:contSources().length, oneShot:sources.length-contSources().length,   /* (#R261) */
          /* (#R265) the shallow-water state: is the clock running or is this the t -> infinity answer,
             and how far the wetted edge has travelled from the source */
          steady, frontM:Math.round(simFrontM), model:(result&&result.model)||null },
        /* (#R261) the terrain edits that survived the last working-rectangle rebuild */
        carriedEdits:(G&&G.carriedEdits!=null)?G.carriedEdits:null,
        /* (#R267) where the water has got to, which is a reading of the field rather than a
           separate object with a geometry of its own */
        trace: trace?{ end:trace.end, km:trace.km, to:trace.to, frontTS:trace.frontTS, spanKm:trace.spanKm }:null,
        result: result?{ storedM3:result.storedM3, floodKm2:result.floodKm2, maxDepth:result.maxDepth,
          breaches:result.breaches.length, biggestOver:result.breaches[0]?result.breaches[0].over:0,
          depCount:result.depCount, biggest:result.biggest, totalIn:result.totalIn, solveMs:result.solveMs }:null }) };
  })();
};
