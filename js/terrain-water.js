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
 *  HONESTY: this is a steady-state routing model, not a shallow-water solver. It answers "where does
 *  the water end up and which way does it leave", which is what the request asks for. It does not
 *  answer "how fast does the front travel" — the panel says so, and IntMapDisaster's inundation model
 *  stays what it is (an existing feature; nothing here replaces it).
 * ==========================================================================*/
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
          IMG_FLOW='tw-flow-src', LYR_FLOW='tw-flowimg', VEC='tw-vec-src';

    /* ---- the working grid --------------------------------------------------------------------- */
    let G=null;        /* {NX,NY,xW,yN,dx,dy,cellM,areaM2,z,base:Float32Array} */
    let sculpt=null;   /* Float32Array — the brush strokes */
    let levees=[];     /* [{pts:[[lng,lat]…], crest:m above ground, width:m}] */
    let sources=[];    /* [{lng,lat,m3}] */
    let rainMm=0;
    let result=null;
    let panel=null, opened=false, busy=false, building=false;
    let mode='pan';    /* pan | raise | lower | levee | source */
    let brushM=400, brushStrength=20, leveeCrest=8, leveeWidth=60, srcM3=1e6;
    /* (#R189) 「水の水流は設定可能に」 — the channel's DISCHARGE (m³/s). null = the #R188 behaviour:
       the whole placed volume laid along the course by continuity. A number here scales every
       cross-section from Q = A·v with v = K·√S instead, so the same course can be drawn carrying a
       stream or a flood. K is a Chézy-like bulk speed factor: v = 40·√S gives 1.3 m/s on a 0.1 %
       grade — the middle of what real lowland rivers run. */
    let flowM3s=null; const CHEZY_K=40;
    let drafting=null; /* a levee being drawn */
    let undoStack=[];
    /* (#R211) continuous pouring — see renderParams()'s 'source' branch for what this models and
       what it deliberately does not. `pourSimS` is SIMULATED seconds, never wall clock. */
    let pourMode='once', pourRate=20000, timeScale=10, pourT=null, pourAt=0, pourSimS=0;
    const pourTotal=()=>sources.reduce((s,x)=>s+Math.max(0,x.m3),0);
    function pourStart(){ if(pourT||!sources.length) return false;
      pourAt=Date.now();
      pourT=setInterval(()=>{
        if(!opened||!sources.length){ pourStop(); return; }
        const now=Date.now(), dt=Math.min(2,(now-pourAt)/1000); pourAt=now;
        pourSimS+=dt*timeScale;
        sources[sources.length-1].m3+=pourRate*dt*timeScale;
        solve();                       /* redraws and re-reports; _retrace() stays debounced out */
        try{ syncFoot(); }catch(_){}   /* (#R256) the footer clock ticks with the simulation */
      },220);
      return true; }
    function pourStop(){ if(pourT){ clearInterval(pourT); pourT=null; if(opened){ report(); try{ syncFoot(); }catch(_){} } } return false; }

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
      if(!GE().layers.has('tw-src')) GE().layers.add({id:'tw-src',type:'circle',source:VEC,filter:['==',['get','kind'],'source'],
        paint:{'circle-radius':6,'circle-color':'#29b6f6','circle-stroke-color':'#04283a','circle-stroke-width':2}});
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
         image overlay the standing water already uses (see flowImage), in the same palette, at a
         width set by the DEM sampling the trace was computed at rather than by a pixel count. It
         reads as a watercourse at every zoom because it is drawn in ground units — zoom in and it
         stays the width of the channel the elevation data can resolve, instead of staying 2.6 px.

         Nothing new is computed and no feature is added: the same traceDownstream() result is simply
         drawn as what it is. */
      /* ══ (#R211) NO PINS ALONG THE COURSE ════════════════════════════════════════════════════════
         「流れの途中の水色ピンを大量に置くのをやめる」
         #R188 already draws every pond the trace crosses as WATER — its real outline, at its own
         depth, from `collectPond` (see flowImage). The circle on top of each one was #R186's marker
         from before that existed, so a 300 km trace ended up with a line of light-blue dots ON the
         water they were marking. The ponds are still crossed, still counted, and the count is still
         in the panel; what is gone is the second drawing of the same fact.
         ⚠ `trace.lakes` itself is untouched — it is the evidence behind the panel's 「n 箇所の窪地を
         通過」 line and behind tests/r186. Only the map symbol is removed. */
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
    function wipe(){ [[LYR_WATER,IMG_WATER],[LYR_TERR,IMG_TERR],[LYR_FLOW,IMG_FLOW]].forEach(([l,s])=>{
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
           The LONG-RANGE answer no longer depends on this number at all — where the water finally
           goes is traced on the raw DEM by traceDownstream() below, not on this grid. */
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
        G={ NX,NY,xW,yN,dx,dy,cellM,areaM2:cellM*cellM,z,base,
            bbox:[lngOf(xW),latOf(yN),lngOf(xE),latOf(yS)], midLat, demMissing:miss };
        sculpt=new Float32Array(NX*NY); undoStack=[]; editDirty();
        return true;
      } finally { building=false; setProg(null); }
    }
    function fillHoles(a,NX,NY){ /* one relaxation sweep in each direction is enough for isolated gaps */
      const idx=(i,j)=>j*NX+i;
      for(let pass=0;pass<4;pass++){ let left=0;
        for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){ const k=idx(i,j); if(!isNaN(a[k])) continue;
          let s=0,c=0; for(let dj=-1;dj<=1;dj++) for(let di=-1;di<=1;di++){ const ii=i+di,jj=j+dj;
            if(ii<0||jj<0||ii>=NX||jj>=NY) continue; const v=a[idx(ii,jj)]; if(!isNaN(v)){ s+=v; c++; } }
          if(c) a[k]=s/c; else left++; }
        if(!left) break; }
      for(let k=0;k<a.length;k++) if(isNaN(a[k])) a[k]=0;
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
      sources:sources.map(s=>({lng:s.lng,lat:s.lat,m3:s.m3})), rainMm }; }
    function pushUndo(){ if(!G) return; undoStack.push(snapState()); if(undoStack.length>24) undoStack.shift(); }
    function undo(){ const s=undoStack.pop(); if(!s) return false;
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
    /* ══ ⚠⚠⚠ (#R256) THE WATER WENT THROUGH THE DAM, AND THE CROSS-SECTION IS WHY ═══════════════════
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
      for(let i=0,p=0;i<out.length;i++,p+=4) out[i]=(px[p]*256+px[p+1]+px[p+2]/256)-32768;
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
    /* ══ ⚠⚠⚠ (#R256) ONE SOURCE, RE-TILED — NOT A NEW SOURCE PER STROKE ═════════════════════════════
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
         downstream (the trace) priority flood → `channelChain`, an MFD accumulation of UNIT area
                                (`acc.fill(1)`) — a CATCHMENT-SIZE talweg, which is a different
                                quantity, and separate ad-hoc pond collection on top of it

       So the routing is one function now, and both halves call it. Nothing about the upstream answer
       changes (it is this code, moved); the downstream half stops computing drainage area and starts
       routing the same cubic metres through the same depressions, which is what the instruction asks
       for. `channelChain` and its unit-accumulation sweep are gone with the question they answered.

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
      const R=routeWater(surf,NX,NY,G.cellM,own);
      const breaches=R.deps.filter(d=>d.over>0&&d.outlet>=0)
        .sort((a,b)=>b.over-a.over).slice(0,12);
      const ms=(typeof performance!=='undefined'?performance.now():Date.now())-t0;
      const biggest=R.deps.slice().sort((a,b)=>b.capacity-a.capacity)[0]||null;
      result={ surf:R.surf, filled:R.filled, depth:R.depth, through:R.through, parent:R.parent,
        mainOut:R.mainOut, deps:R.deps, breaches, wetCells:R.wetCells, storedM3:R.storedM3, maxDepth:R.maxDepth,
        floodKm2:R.wetCells*A/1e6, totalIn:(rainMm/1000)*A*N+sources.reduce((s,x)=>s+Math.max(0,x.m3),0),
        solveMs:Math.round(ms),
        /* diagnostics — the numbers to look at when the answer surprises you */
        depCount:R.deps.length, depId:R.depId, model:'priority-flood + MFD(1.1) + cascading depressions',
        biggest:biggest?{ cells:biggest.cells.length, capacity:biggest.capacity, inflow:biggest.inflow,
          level:biggest.level, spill:biggest.spill, over:biggest.over||0 }:null };
      draw();
      _retrace();
      return result;
    }

    /* ══ (#R190) THE COURSE FOLLOWS THE GROUND IT WAS TRACED ON ═══════════════════════════════════
       「また、他の操作をすれば、水の流れは再描画して。」

       traceDownstream() ran once, when the water was placed. Everything after that — a brush stroke
       that raises a ridge, a levee across the valley, a change of rainfall or discharge, an undo —
       re-solved the GRID and redrew the ponding, and left the drawn course exactly where it was: a
       watercourse over terrain that no longer has that shape. Every one of those edits goes through
       solve(), so that is where the re-trace belongs.

       Debounced, because a brush drag calls solve() once per animation frame and a trace is a DEM
       walk; skipped while one is already running or when the caller is about to start its own (a
       click places the source, solves, and traces — the explicit trace wins and this stays quiet).
       `trace.from` is the origin the user actually chose, so the answer is recomputed for the same
       question, never for a new one. */
    let _reT=null, _lastTraceAt=0, _reWhy='never';
    /* ⚠ (#R212) A PURE DEBOUNCE NEVER FIRES UNDER A CONTINUOUS SOURCE, WHICH IS WHY THE WATER STOPPED
       FLOWING. 「継続のやつは、地形に応じて流れ続けるように。」 — `pourStart` re-solves every 220 ms and
       every solve calls this, which cleared the 320 ms timer before it could ever elapse: the pond grew
       and the WATERCOURSE below it never moved again. The debounce is what makes a burst of brush
       strokes cost one trace, so it stays — with a ceiling. If the first pending request is older than
       MAXWAIT the trace runs now, so a tap left running re-traces about three times a second's worth of
       simulated filling instead of never. */
    const _RE_MAXWAIT=900;
    let _reFirst=0;
    function _retrace(){
      if(!trace||!trace.from){ _reWhy='no-trace'; return; }
      if(tracing){ _reWhy='tracing'; return; }
      const from=trace.from.slice();
      const now=Date.now();
      if(!_reT) _reFirst=now;
      const waited=now-_reFirst;
      const delay=(waited>=_RE_MAXWAIT)?0:320;      /* the ceiling: never postpone past MAXWAIT */
      _reWhy=(delay===0)?'maxwait':'scheduled';
      clearTimeout(_reT);
      _reT=setTimeout(()=>{ _reT=null; _reFirst=0;
        if(!opened){ _reWhy='closed'; return; }
        if(tracing){ _reWhy='busy'; return; }
        if(Date.now()-_lastTraceAt<600){ _reWhy='just-traced'; return; }   /* an explicit trace is already the answer */
        _reWhy='fired'; traceDownstream(from[0],from[1]); },delay);
    }

    /* ══ (#R186) WHERE THE WATER ACTUALLY GOES ═══════════════════════════════════════════════════════
       「水は流れなくなる地点または海に到達した地点まで高精度に実データに忠実に描画すること。」

       The working grid above is at most 60 km across. A river is not. Everything that left the grid
       used to leave the ANSWER too — the picture stopped at a rectangle, which is the one place the
       water certainly does not stop. So this walks the real DEM, outside the grid, with no rectangle
       at all, until one of the two endings the request names:

         · THE SEA — the ground has been at or below sea level for a continuous 1.5 km. One negative
           sample is noise or a below-sea-level valley; a kilometre and a half of it, reached by
           flowing downhill, is the coast.
         · IT STOPS — the descent runs into a basin that would have to fill by more than 25 m before
           it could leave. That is a lake, not a DEM pit, and under gravity alone the water stops
           there. The trace reports how deep and how wide that basin is, so "it stops" comes with the
           evidence for it.

       Shallower pits are DEM noise (and small ponds), and stopping at every one of them would end
       most traces within a kilometre. They are crossed the way hydrology crosses them — a local
       priority flood finds the spill, the trace steps over it and carries on — and the crossing is
       marked so nothing is hidden.

       Resolution is the terrarium DEM at z11: 54 m a sample at mid-latitude, real measured elevation,
       no smoothing and no synthetic channel. Step is 1.5 samples and the descent is chosen from 16
       directions rather than 8, because an 8-direction walk on a continuous surface produces the same
       staircase artefact D8 produces on a grid. Both caps — 600 km of path and 260 DEM tiles — are
       REPORTED when they bite; a trace that quietly gave up would read as "the water ends here". */
    /* (#R189) RESOLUTION WHERE IT MATTERS. #R188's own measurement said it: at a fixed z11, 454 of
       498 cross-sections came out BELOW the DEM's resolution — and the head of the course, right
       where the user clicked, is exactly where the channel is narrowest relative to the data. The
       trace now starts at z13 (~19 m a sample) for the first 10 km, z12 to 50 km, and z11 beyond,
       where the river is wide enough for 76 m samples to see it. The tile budget rises with it and,
       as always, is REPORTED when it bites. */
    const TRACE_Z=11, TRACE_Z_NEAR=[[10,13],[50,12]], TRACE_MAX_KM=600, TRACE_TILE_ROUNDS=64;
    const LAKE_STOP_M=25;          /* fill depth above which a basin is a lake, not a pit */
    const FLAT_DROP_M=1.0;         /* (#R211) the smallest fall a wide look-ahead may call progress */
    const FLAT_TOL_M=10;           /* (#R211) how rough one 'flat' surface may be — the DEM over a lake, measured */
    const SEA_RUN_M=1500;          /* continuous distance at or below 0 m that counts as the sea */
    let trace=null, tracing=false, traceSeq=0;

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
               spacingM,                                  /* (#R187) the width flowImage() draws the course at */
               cellAreaM2:spacingM*spacingM };
    }
    /* ══ ⚠⚠⚠ (#R255) THE WINDOW IS ROUTED, NOT ACCUMULATED ═════════════════════════════════════════
       「上流から下流まですべて同じ計算・描画方法にしろ。上流のものに合わせろ。」

       #R189 replaced the flood's least-rise escape with `channelChain` — an MFD sweep over UNIT
       contributions, i.e. drainage AREA. That was the right correction to the question it was asked
       (which branch is the river), and it is a different quantity from the one the working grid
       computes: upstream every number is cubic metres of the water the reader placed, routed through
       depressions that hold it and spill only their overflow.

       This runs `routeWater` — the working grid's own function, unchanged — over the window, with the
       water that actually arrived at the entry cell as its input. The channel is then `mainOut`, the
       neighbour taking the largest SHARE OF THE FLOW, and standing water is the routing's own
       `depth`, from the same cascading-depression solve. Same code, same physics, same units, from
       the click to the sea.

       ⚠ WHAT IS CARRIED BETWEEN WINDOWS is the volume: a window's routing tells us how much of it
       leaves at the exit cell (`through`), and that becomes the next window's input. A basin that
       swallows everything ends the course, exactly as it does on the working grid.
       ⚠ Rainfall is applied over the window too, at the same mm the panel is set to, because that is
       what the upstream grid does with it. */
    function windowRoute(W,k0,inM3){
      const own=new Float64Array(W.N);
      const rain=(rainMm/1000)*W.cellAreaM2;
      if(rain>0) for(let k=0;k<W.N;k++) own[k]=rain;
      own[k0]+=Math.max(0,+inM3||0);
      return routeWater(W.surf,W.n,W.n,W.spacingM,own);
    }
    /* the course through one window: follow the share of the flow, and cross a still lake by the
       flood's own spill route (there is no descending neighbour inside one — #R186's rule, kept). */
    function channelChain(W,k0,R){
      const n=W.n, N=W.N, filled=R.filled, mainOut=R.mainOut;
      const chain=[k0]; let k=k0, guard=0;
      const border=(kk)=>{ const ki=kk%n, kj=(kk/n)|0; return ki===0||kj===0||ki===n-1||kj===n-1; };
      while(guard++<4*N){
        if(border(k)) break;
        const nxt=mainOut[k];
        if(nxt!=null&&nxt>=0&&filled[nxt]<filled[k]-1e-6){ chain.push(nxt); k=nxt; continue; }
        /* a filled flat (a lake surface): walk the spill route across the WHOLE flat in one go.
           Taking a single parent step and handing back can ping-pong — a measured Chikuma trace
           ended in a false 'lake' at a braided reach because of exactly that oscillation. */
        const lev=filled[k]; let k2=R.parent[k], hop=0, moved=false;
        while(k2>=0&&hop++<4*N){ chain.push(k2); k=k2; moved=true;
          if(border(k2)||filled[k2]<lev-1e-6) break;
          k2=R.parent[k2]; }
        if(!moved||k2<0) break;
      }
      return chain;
    }
    /* ══ (#R211) THE WAY OUT OF A LAKE IS ITS SPILL, NOT ITS DRAINAGE TREE ════════════════════════
       MEASURED, after the ladder alone did not fix the report: from northern Shiga the trace still
       burned the whole 600 km budget and ended at 136.003°E 35.249°N — the middle of Lake Biwa. The
       ladder WAS firing; it was jumping in an arbitrary direction, because `channelChain()` on a
       flat has no descending neighbour anywhere and falls back to the priority flood's `parent`
       tree, which on a featureless surface leads to whichever border the heap happened to reach
       first. Widening the window makes that arbitrary jump LONGER, not righter.

       A lake does not leave by its drainage tree; it leaves by its SPILL — the lowest ground that
       touches it. So: flood-fill the connected surface at the entry's own level (a lake is flat to
       within a metre at any sampling), collect every cell ADJACENT to that region but not in it,
       and take the lowest. For Biwa that is the Seta, which is the only place the ground continues
       downward, and it is found regardless of which shore the entry is on.

       ⚠ Returns `null` when the flat fills the whole window — then there is nothing outside it to
       compare, and the caller must widen instead of guessing. That is what the ladder is for. */
    /* ══ ⚠⚠ (#R256) …AND IT RETURNS THE WAY ACROSS, NOT ONLY THE FAR SIDE ═══════════════════════════
       「たまに、直線で地形を完全無視するクソ区間がある。」 That section is HERE. When the walk crossed a
       lake wider than its window, the escape below pushed exactly ONE point — the outlet — so the
       course jumped from the shore it entered on to the shore it leaves by in a single leg, and the
       renderer drew a straight line between them, over whatever the ground does in between (across a
       peninsula, over a ridge, through a town). The water does not go that way; it goes across the
       water. The fill is breadth-first now and keeps a parent link, so the cells the crossing
       actually passes through come back with it and the drawn course follows the lake. */
    function flatOutlet(W,k0,tolM){
      const n=W.n, N=W.N, surf=W.surf, lv=surf[k0], tol=(tolM==null?1.0:tolM);
      if(!isFinite(lv)) return null;
      const inR=new Uint8Array(N), st=new Int32Array(N), par=new Int32Array(N).fill(-1);
      let sp=0, head=0, cells=0;
      const NB=[-1,1,-n,n,-n-1,-n+1,n-1,n+1];
      let best=-1, bestE=Infinity, bestFrom=-1, touchedEdge=false;
      st[sp++]=k0; inR[k0]=1;
      /* BREADTH-first: the parent tree is then a shortest-hop path across the flat, which is the
         crossing to draw. A depth-first tree reaches the same outlet by a wandering route. */
      while(head<sp){ const k=st[head++]; cells++;
        const ki=k%n, kj=(k/n)|0;
        if(ki===0||kj===0||ki===n-1||kj===n-1) touchedEdge=true;
        for(let d=0;d<8;d++){ const nk=k+NB[d]; if(nk<0||nk>=N) continue;
          const ni=nk%n, nj=(nk/n)|0; if(Math.abs(ni-ki)>1||Math.abs(nj-kj)>1) continue;
          if(inR[nk]) continue;
          const e=surf[nk]; if(!isFinite(e)) continue;
          if(Math.abs(e-lv)<=tol){ inR[nk]=1; par[nk]=k; st[sp++]=nk; }
          else if(e<bestE){ bestE=e; best=nk; bestFrom=k; } } }
      /* the crossing itself: k0 → … → the in-region cell the outlet was seen from → the outlet */
      let path=null;
      if(best>=0&&bestFrom>=0){ const chain=[]; let g=0;
        for(let k=bestFrom;k>=0&&g++<N;k=par[k]) chain.push(k);
        chain.reverse();
        if(chain.length&&chain[0]===k0){ chain.push(best);
          path=chain.map(k=>{ const p=W.ll(k); return { at:p, e:surf[k] }; }); } }
      /* ⚠ `touchedEdge` IS REPORTED, NOT ACTED ON HERE. The caller decides, because the two cases
         it separates are decided by whether a usable spill was ALSO found:
           · flat runs off the window AND nothing lower was seen → this window cannot answer, widen;
           · flat runs off the window but something well below it WAS seen → that IS the spill. A
             lake's outlet is a local property; you do not need the whole lake in view to find it,
             and demanding that is why the walk first stopped dead at the southern tip of Biwa with
             the Seta — 100 m wide, invisible at every coarse rung — right in front of it.
         Measured before this distinction existed: five escalations, every one at the 3× rung,
         because the talweg branch 'succeeded' on the lake every time and the wider rungs that would
         have contained it were never reached. */
      return { touchedEdge, cells, outlet:best, outElev:bestE, level:lv, path,
               areaKm2:cells*W.cellAreaM2/1e6, at:(best>=0?W.ll(best):null) };
    }
    /* ⚠ (#R186) ONE PIT, ANSWERED — AND WHY IT CANNOT ASK "AM I IN A PIT?".
       The first version of this did ask, and it stopped every trace after one step. The walk samples a
       CONTINUOUS bilinear surface on a ring of 92 m, while the flood samples a 92 m LATTICE: a point
       can be the lowest thing on its ring and still not be a lattice minimum, and the two answers
       disagreed on the very first pit (measured at 138.621°E 36.300°N: ring minimum +0.55 m above the
       point, lattice fill depth 0.00 m → "not a pit" → the trace ended as 'flat' after 92 metres).
       Two samplings of one surface will always disagree somewhere near a threshold. So the question is
       not asked at all any more. The flood already knows the way OUT of the window from any cell — the
       parent chain — and that chain is the answer whether or not the start was "in" anything:
         · the highest point along it is the rim the water must cross;
         · if that rim is more than 25 m above us, the water stops here and this is a lake;
         · otherwise the trace resumes at the first point along the chain that is strictly LOWER than
           where it started, which also makes the whole trace monotonically descending and therefore
           incapable of looping.
       An odd window size puts the start exactly on a node instead of half a cell off it. */
    function pitEscape(lng,lat,z,spacingM){
      for(const mult of [1,3]){                                /* a ~7.5 km window, then a ~22 km one */
        const W=floodWindow(lng,lat,81,spacingM*mult,z); if(!W) continue;
        const k0=W.at(lng,lat); if(k0<0) continue;
        const e0=W.surf[k0];
        const chain=[]; let k=k0, guard=0;
        while(k>=0&&guard++<4*W.n){ chain.push(k); k=W.parent[k]; }
        if(chain.length<2) continue;                           /* already on the window border */
        let sIdx=0; for(let a=1;a<chain.length;a++) if(W.surf[chain[a]]>W.surf[chain[sIdx]]) sIdx=a;
        const rim=W.surf[chain[sIdx]], rimUp=rim-e0;
        /* how wide the pool would be if it did fill to that rim */
        let cells=0; for(let i=0;i<W.N;i++) if(W.filled[i]<=rim+1e-6&&W.filled[i]>W.surf[i]+1e-6) cells++;
        const areaKm2=cells*W.cellAreaM2/1e6;
        if(rimUp>LAKE_STOP_M) return { stop:true, depth:rimUp, areaKm2, spill:W.ll(chain[sIdx]) };
        let rIdx=-1;
        for(let a=sIdx+1;a<chain.length;a++){ if(W.surf[chain[a]]<e0-0.05){ rIdx=a; break; } }
        if(rIdx<0) continue;                                   /* nothing lower in this window — widen it */
        return { stop:false, depth:Math.max(0,rimUp), areaKm2, spill:(rimUp>1?W.ll(chain[sIdx]):null),
                 resume:W.ll(chain[rIdx]) };
      }
      /* Neither window found anywhere lower: the descent really has run out. */
      return { stop:true, depth:NaN, areaKm2:NaN, spill:[lng,lat], exhausted:true };
    }

    /* ⚠ (#R186) WHY THIS WALKS WINDOWS AND NOT POINTS.
       The first working version stepped point by point down the steepest of sixteen directions and
       called pitEscape whenever nothing was lower. It ran, but the numbers said it was fighting the
       data rather than reading it: 295 steps over 101 km needed **95 pit escapes** — one every three
       steps, each running two 81×81 floods to advance a single cell — and it then stopped 100 km
       short of a coast it should have reached. At 54 m resolution a river valley is FULL of one-cell
       minima; a point walk meets every one of them.

       A priority flood already answers all of them at once. Its parent link points at the cell each
       cell was REACHED FROM, i.e. downstream, so following `parent` from anywhere runs the complete
       drainage path to the window's edge with every pit inside the window already resolved — and
       `filled − surf` along that path says exactly where the water is standing rather than flowing.
       So the trace is: flood a window, walk its whole chain, move the window to where the chain left
       it, repeat. One flood per ~9 km of river instead of one per pothole. */
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
    async function traceDownstream(lng0,lat0,opt){
      opt=opt||{};
      const seq=++traceSeq; tracing=true; _lastTraceAt=Date.now();   /* (#R190) see _retrace() */
      const zFix=+opt.z||0, maxKm=opt.maxKm||TRACE_MAX_KM;
      /* (#R189) the resolution ladder — finest near the source, where the channel is narrowest */
      const zFor=(dM)=>{ if(zFix) return zFix;
        for(const [km,zz] of TRACE_Z_NEAR) if(dM<km*1000) return zz; return TRACE_Z; };
      let z=zFor(0);
      let lng=lng0, lat=lat0;
      const path=[[lng,lat]], lakes=[];
      /* (#R188) the bed elevation under every path point, and every cell the window floods found
         standing water in. Both are read from data the flood ALREADY computed — see the note above
         flowImage() for what they are for. (#R189) `spac` records the DEM sampling each point was
         traced at, because the ladder above means it is no longer one number. */
      const elev=[], wet=[], spac=[]; let wetCap=false;
      const WET_MAX=140000, WET_MIN_D=0.3;
      let distM=0, rounds=0, warmC=null, end='cap', endInfo=null, windows=0, pts=1, escal=0, escalMult=0, stallRun=0;
      /* ══ (#R255) THE VOLUME TRAVELS WITH THE COURSE ════════════════════════════════════════════════
         What crosses from one window to the next is water, in cubic metres — the quantity the working
         grid routes. It starts as everything the reader placed (plus what the rainfall puts on the
         working rectangle) and is re-read from each window's routing at the cell the course leaves
         by, so a lake that swallows the lot ends the course because the routing says nothing came
         out, not because a separate rule said so. */
      let carryM3=(function(){ try{ let v=sources.reduce((s,x)=>s+Math.max(0,x.m3),0);
        if(G&&rainMm>0) v+=(rainMm/1000)*G.areaM2*G.NX*G.NY;
        return v; }catch(_){ return 0; } })();
      /* (#R190) how often the "is this really the sea?" flood may be paid for, and whether the course
         has run below sea level on land at any point (the panel says so — it is the interesting fact
         that used to be an ending). */
      let seaChecks=0, lastSeaCheck=null, belowSea=false;
      const SEA_CHECK_MAX=8;
      let minSpacingM=null;    /* (#R187/#R189) the finest window sampling — flowImage() sizes by it */
      const visited=new Set();
      let headX=0, headY=0;      /* the unit heading of the last window's travel, for the frame bias */
      const pixM=()=>CIRC*Math.max(0.05,Math.cos(lat*D))/(Math.pow(2,z)*256);
      const N_WIN=161;                                   /* odd, so the entry point is exactly a node */
      const gcM=(a,b)=>Math.hypot((b[0]-a[0])*111320*Math.cos(((a[1]+b[1])/2)*D),(b[1]-a[1])*110574);
      try{
        while(distM<maxKm*1000&&windows<160){
          if(seq!==traceSeq){ end='superseded'; break; }
          const zWant=zFor(distM); if(zWant!==z){ z=zWant; warmC=null; }   /* (#R189) step down the ladder */
          const tileDeg=360/Math.pow(2,z), dLatT=tileDeg*Math.max(0.05,Math.cos(lat*D));
          if(!warmC||Math.abs(lng-warmC[0])>tileDeg*0.5||Math.abs(lat-warmC[1])>dLatT*0.5){
            if(rounds>=TRACE_TILE_ROUNDS){ end='tiles'; break; }
            rounds++; await warmBlock(lng,lat,z); warmC=[lng,lat];
            if(seq!==traceSeq){ end='superseded'; break; }
          }
          const spacing=pixM()*1.5;
          if(minSpacingM==null||spacing<minSpacingM) minSpacingM=spacing;
          /* ⚠ THE WINDOW LOOKS FORWARD. Centred exactly on where the last one left off, a window
             contains as much of the ground already travelled as of the ground ahead — and a
             window-local minimax escape has no idea which is which, so it can perfectly well leave
             by the way it came in. Measured: two long river traces (the Chikuma from the Japanese
             Alps, and a Colorado headwater) both ended on the doubling-back guard at 167 km and
             119 km. Shifting the window a third of its half-width along the current heading puts the
             travelled ground at its back edge and the unexplored ground in the middle, which is
             where the answer is. The entry point stays the previous exit — only the FRAME moves. */
          const halfM=(N_WIN-1)/2*spacing, offM=halfM*0.34;
          const cLng=lng+headX*offM/(111320*Math.max(0.05,Math.cos(lat*D))), cLat=lat+headY*offM/110574;
          let W=floodWindow(cLng,cLat,N_WIN,spacing,z);
          if(!W){ await warmBlock(lng,lat,z); warmC=[lng,lat]; W=floodWindow(cLng,cLat,N_WIN,spacing,z); }
          if(!W){ end='nodata'; break; }
          windows++;
          /* (#R211) the trace has two bounded budgets (distance and windows) and no way to know
             which will bite — so the bar shows whichever is further along, which is the honest
             lower bound on how much is left. */
          setProg(Math.max(distM/(maxKm*1000),windows/160),
                  L('Tracing downstream','流下先を追跡中','Verlauf wird verfolgt','Трассировка стока','Trazando aguas abajo')
                  +' · '+Math.round(distM/1000)+' km');
          const k0=W.at(lng,lat); if(k0<0){ end='nodata'; break; }
          const entryLng=lng, entryLat=lat;
          const entryE=W.surf[k0];
          if(!elev.length){ elev.push(entryE); spac.push(spacing); }
          /* (#R188/#R189) the outline of ONE pond: everything connected to `seed` whose flood level
             is at or under `lev` and that the flood put water on. Bounded by the window and by the
             global cap, so a window full of shallow roughness cannot become a lake.
             ⚠ (#R189) DECLARED BEFORE ITS FIRST USE. #R188 wrote this as a `const` BELOW the
             terminal-basin branch that calls it — a temporal-dead-zone ReferenceError, so every
             trace that ended in a basin (`end='sink'` — the advertised 「水は流れなくなる地点」
             ending!) rejected instead of drawing, with no catch anywhere on the caller side. That
             is the 「結果が出ないことがある」 the user kept reporting, verbatim. */
          const collectPond=(seed,lev)=>{
            if(seed<0||wet.length>=WET_MAX){ if(wet.length>=WET_MAX) wetCap=true; return 0; }
            const seen=new Set([seed]); const stack=[seed]; let n2=0;
            while(stack.length){
              const k=stack.pop(); const ki=k%W.n, kj=(k/W.n)|0;
              const d=W.filled[k]-W.surf[k];
              if(!(d>WET_MIN_D)||W.filled[k]>lev+1e-6) continue;
              const p=W.ll(k); wet.push([p[0],p[1],d,W.spacingM]); n2++;
              if(wet.length>=WET_MAX){ wetCap=true; break; }
              for(let dj=-1;dj<=1;dj++) for(let di=-1;di<=1;di++){
                if(!di&&!dj) continue;
                const ni=ki+di, nj=kj+dj; if(ni<0||nj<0||ni>=W.n||nj>=W.n) continue;
                const nk=nj*W.n+ni; if(seen.has(nk)) continue; seen.add(nk); stack.push(nk); }
            }
            return n2;
          };
          /* ⚠ (#R188) NOT EVERY CELL WITH `filled > surf` IS WATER, AND #R186 ALREADY SAID SO.
             Inside a window, `filled − surf` means "how far this cell would have to fill before it
             could leave THIS WINDOW", which is non-zero at every metre-scale dip along a valley floor
             — #R186 measured that as 157 "lakes" over 125 km of river, and the first draft of this
             round drew all 15,755 of them as standing water. That would be a map covered in water
             that is not there.
             The cells that ARE water are the ones a pool actually holds, and #R186 already has the
             test for a pool: deep AND wide. So the collector below runs per POOL, from its deepest
             cell, over the connected cells at or under that pool's own level — the real outline of a
             real pond — and it is called only where the chain walk qualifies one, plus once for the
             basin a trace ends in. The cap is reported (`wetCapped`), never silent (#R185). */
          /* The water at the entry has to rise this far before it can leave the window at all. More
             than 25 m of that is a lake, not a pothole, and under gravity the water stops there. */
          const need=W.filled[k0]-W.surf[k0];
          if(need>LAKE_STOP_M){
            let cells=0; for(let i=0;i<W.N;i++) if(W.filled[i]<=W.filled[k0]+1e-6&&W.filled[i]>W.surf[i]+1e-6) cells++;
            /* (#R188) the basin the water STOPS in is the one place it certainly stands — collect its
               outline so the trace ends in a lake shaped like the ground, not in a disc. */
            collectPond(k0,W.filled[k0]);
            end='sink'; endInfo={ depthM:need, areaKm2:cells*W.cellAreaM2/1e6 }; break;
          }
          /* ══ (#R255) THE SAME ROUTING THE WORKING GRID RUNS, ON THIS WINDOW ═══════════════════════
             `routeWater` — the upstream function itself — with the volume that arrived here as its
             input. The channel is the share of the FLOW (`mainOut`), and the standing water below is
             this routing's own depression solve rather than a second pond collector. */
          const WR=windowRoute(W,k0,carryM3);
          const chain=channelChain(W,k0,WR);
          if(chain.length<2){ end='flat'; break; }
          let seaRun=0, poolRun=0, poolMax=0, poolStart=null, hitSea=false, prev=[lng,lat], poolSeed=-1, poolLev=0;
          for(let a=1;a<chain.length;a++){
            const k=chain[a], p=W.ll(k), e=W.surf[k], sub=W.filled[k]-e;
            const d=gcM(prev,p); distM+=d; prev=p; path.push(p); elev.push(e); spac.push(spacing); pts++;
            /* ⚠ `filled − surf` inside a WINDOW is "how far this cell would have to fill to get out
               of the window", which along a valley floor is non-zero at every little dip — the first
               version marked 157 "lakes" over 125 km of river because of that. A pool is only worth
               calling a pool when it is both DEEP and WIDE: 3 m over at least eight cells (~0.1 km²).
               Anything under that is the metre-scale roughness of a 54 m DEM. */
            if(sub>0.5){ if(!poolRun){ poolStart=p; poolSeed=k; } poolRun++; if(sub>poolMax){ poolMax=sub; poolSeed=k; poolLev=W.filled[k]; } }
            else { if(poolMax>3&&poolRun>=8){ lakes.push({ at:poolStart, depthM:poolMax, areaKm2:poolRun*W.cellAreaM2/1e6 });
                     collectPond(poolSeed,poolLev); }        /* (#R188) …and its real outline, for drawing */
              poolRun=0; poolMax=0; poolSeed=-1; poolLev=0; }
            if(e<=0){ seaRun+=d; if(seaRun>=SEA_RUN_M){ hitSea=true; endInfo={ elevM:e }; break; } }
            else seaRun=0;
            if(distM>=maxKm*1000) break;
          }
          if(poolMax>3&&poolRun>=8){ lakes.push({ at:poolStart, depthM:poolMax, areaKm2:poolRun*W.cellAreaM2/1e6 });
            collectPond(poolSeed,poolLev); }
          lng=prev[0]; lat=prev[1];
          /* (#R255) how much of the water is still moving where the course leaves this window — the
             routing's own `through` at that cell. A basin that held everything reports ~0, and the
             next window then has nothing to route, which is what ends the course. */
          { const kOut=W.at(lng,lat); if(kOut>=0&&WR.through) carryM3=Math.max(0,WR.through[kOut]); }
          { const dx=(lng-entryLng)*Math.cos(lat*D), dy=lat-entryLat, m=Math.hypot(dx,dy);
            if(m>1e-9){ headX=dx/m; headY=dy/m; } }
          /* ⚠ "BELOW SEA LEVEL" IS NOT "THE SEA". Measured: a trace started above Death Valley ran
             15 km, hit −4.8 m and reported 「海に到達」 — but that is Badwater Basin, 86 m below the
             Pacific and 250 km from it, and it is the textbook place where water STOPS. Elevation
             alone cannot tell the ocean from a closed basin that happens to be below zero.
             What can is whether the water could LEAVE from there without rising: flood a window on
             the spot and read how much it would have to fill to reach that window's edge. In the open
             sea that is zero — the sea is already connected to everywhere. In Badwater it is the
             height of the basin rim. One extra flood, and only ever on the last step of a trace. */
          /* ══ (#R190) BELOW SEA LEVEL ON LAND IS NOT AN ENDING ═══════════════════════════════════
             「Terrain & waterは、陸地にもかかわらず、0m以下になったから描画を終了するのはやめて。」

             #R186 established the right test — elevation alone cannot tell the ocean from a closed
             basin that happens to be under zero — and #R189 wired it in. Both then did the same
             wrong thing with the answer: when the test said NOT the sea, the trace STOPPED anyway,
             with `end='sink'`. That is the report. The Netherlands, the Po delta, Japan's 海抜ゼロ
             メートル地帯, the Imperial Valley — hundreds of kilometres of real river run below zero
             on real land, and the water in them keeps going.

             So a below-zero stretch that is not the sea is now just ground: the run counter resets,
             the trace is marked as having been under sea level, and the walk continues. Only two
             things still end it here — reaching water that is genuinely CONNECTED to the ocean, and
             the flood test above finding a basin the water cannot climb out of, which is the honest
             「水が流れなくなる地点」 and is decided by the terrain rather than by the number zero.

             The check itself is bounded: it costs one extra flood window, so it is asked at most
             SEA_CHECK_MAX times a trace and never twice within 20 km of the same place. Past that the
             stretch is treated as land (the walk's own basin test still terminates it if it is one). */
          if(hitSea){
            let v=null;
            const far=!lastSeaCheck||gcM(lastSeaCheck,[lng,lat])>20000;
            if(seaChecks<SEA_CHECK_MAX&&far){ seaChecks++; lastSeaCheck=[lng,lat]; v=await seaCheck(lng,lat); }
            /* (#R189) `unchecked` means the TEST failed (its own DEM window did not arrive), not
               that the answer is yes — a network outage was being rendered as a confident
               「海に到達」. Keep the ending (the ground here IS at sea level) but say the sea
               itself was not verified. */
            if(v&&v.sea){ endInfo=Object.assign(endInfo||{},{connectedKm2:v.connectedKm2, unchecked:!!v.unchecked}); end='sea'; break; }
            belowSea=true; endInfo=null;                    /* land that happens to be under zero — carry on */
          }
          if(distM>=maxKm*1000){ end='cap'; break; }
          /* ⚠ NOT an elevation test. The minimax path leaves by the lowest saddle to the window's
             edge, and the cell it lands on can sit above the cell it started from even though the
             ground drops away just beyond it — an elevation-progress test stopped a real river 100 km
             from the coast for exactly that reason. What must not happen is going round in circles, so
             the guard is on POSITION: a window centre we have already used means the path is looping,
             and nothing else can. */
          /* 0.002° ≈ 220 m. A coarser 1 km grid stopped a river 80 km short of its coast because two
             window exits happened to land in the same kilometre; the guard has to be tight enough
             that only a genuine doubling-back trips it. */
          const key=Math.round(lng*500)+'/'+Math.round(lat*500);
          const looped=visited.has(key);
          /* ⚠ (#R211) …AND WAITING FOR THE LOOP GUARD IS TOO LATE ON A BIG LAKE. On Biwa the fine
             walk crosses 15 km of flat water in a direction the parent tree picked, and only
             doubles back after several windows — by which time it has wandered kilometres up the
             wrong shore. A window that came out with no fall at all HAS already stalled, whether or
             not it has been here before, so the wider look-ahead is asked for at that moment.
             ⚠ It is only a TRIGGER. Failing to find a way on at 3×/9×/27× ends the trace only when
             the walk is genuinely looping; a flat that the fine walk is still crossing carries on
             exactly as before, so this cannot shorten a trace that used to succeed. */
          const stalled=(entryE-W.surf[chain[chain.length-1]])<0.25;
          if(looped||stalled){
            /* Coming back to a window we have already used means the descent is no longer taking us
               anywhere — and measured on a trace from Chamonix, the place that happens is LAKE
               GENEVA. A large body of standing water has no slope for a steepest-descent walk to
               follow, so this is not a failure of the trace, it is the trace arriving at one.
               ══ (#R189) …UNLESS THE FLAT IS SIMPLY WIDER THAN THE WINDOW. Measured on the Chikuma:
               the trace ended 「静水域に広がる」 on the Kawanakajima plain — a flat river PLAIN wider
               than one window, 200 km short of the Japan Sea the real river reaches. The window
               flood cannot see across a flat larger than itself, but a WIDER window can: before
               declaring an ending, flood once at 3× the spacing and walk its talweg. If that leaves
               the flat downhill and genuinely elsewhere, the trace continues from there (the coarse
               crossing is recorded at its own spacing — the panel's per-point resolution carries
               it); if even the wide window finds no way on, the ending stands, honestly. Bounded:
               six escalations a trace. */
            /* ══ (#R211) THE WINDOW HAS TO BE BIGGER THAN THE LAKE ═══════════════════════════════
               「滋賀県北部に置くと琵琶湖で停滞して淀川に行かない」

               Reproduced from the numbers rather than guessed at. The fine window is 161 samples of
               ~94 m at z11 = **15 km across**. Lake Biwa is **63 km long and 22 km wide**, so a
               window opened anywhere on it is entirely INSIDE it: every border cell is lake surface
               at ~85 m, `filled − surf` at the entry is ~0 (so the lake-stop test correctly does not
               fire), and `channelChain` finds no descending neighbour anywhere — it falls to the
               flood's own parent tree, which on a featureless flat leads to whichever border the
               heap happened to reach first. That direction is not the outlet. The trace then walks
               back and forth across the lake until the doubling-back guard trips, and the answer
               comes out as 「静水域に広がる」 at Biwa instead of running down the Seta into the Yodo.

               #R189 already had the right idea and stopped one rung short: it escalated ONCE, to 3×
               (45 km), which is still smaller than the lake. So the escalation is a LADDER now — 3×,
               9×, 27× — and each rung asks the DEM at the level whose own sample spacing matches
               that window, so a 400 km window is still about one tile of data and not ten thousand.
               At 9× (135 km) Biwa fits with room to spare, the Seta valley is the only way the level
               drops, and the walk resumes there.

               ⚠ THE GATE DOES NOT GROW WITH THE LADDER. It stays at 3× the lake-stop depth (75 m) at
               every rung. A coarser window can only over-estimate how much a place must fill (a
               200 m gorge vanishes between 2.5 km samples), so holding the number fixed makes the
               test STRICTER as the window widens — the safe direction. A genuinely closed basin
               (Death Valley, the Caspian) still shows a rim far above 75 m at every rung and the
               trace still stops there, honestly. */
            let escaped=false;
            /* ⚠⚠ THE LADDER DOES NOT START AT 1×, AND THE MEASUREMENT IS WHY. Adding a fine rung
               looked obviously right — only the trace's own resolution can see a 100 m outlet
               channel like the Seta. It made the answer WORSE: the terrarium DEM over Lake Biwa is
               not flat, it reads 74–81 m across the surface, so a 1 m 'flat' at fine sampling is not
               the lake but a patch of it, and the walk hopped between patches and then took a 250 km
               jump off the widest rung. Measured waypoints, all at 81 m: 136.09/35.31 → 136.13/35.31
               → 136.10/35.36 → 136.14/35.36 — back and forth inside the lake. The coarse rungs, where
               one sample already averages the surface, are the ones where a tolerance means
               something. Carrying the water on down the Seta is still open — see DEV-NOTES §11. */
            for(const mult of [3,9,27]){
              if(escaped||escal>=6) break;
              /* the DEM level whose sampling matches this window — at ~1.5 px a sample the whole
                 window is about one tile, so a 400 km look-ahead costs a 5×5 block, not a fan-out */
              const wantPx=spacing*mult/1.5;
              const zc=Math.max(5,Math.min(z,Math.round(Math.log2(CIRC*Math.max(0.05,Math.cos(lat*D))/(256*wantPx)))));
              try{ const td=360/Math.pow(2,zc), dLt=td*Math.max(0.05,Math.cos(lat*D));
                const ptsC=[]; for(let j=-2;j<=2;j++) for(let i=-2;i<=2;i++)
                  ptsC.push([lng+i*td, Math.max(-84,Math.min(84,lat+j*dLt))]);
                await warmDEMTiles(ptsC,zc,15000,null);
              }catch(_){}
              if(seq!==traceSeq){ end='superseded'; break; }
              const V3=floodWindow(lng,lat,N_WIN,spacing*mult,zc), vk3=V3?V3.at(lng,lat):-1;
              if(!(V3&&vk3>=0&&(V3.filled[vk3]-V3.surf[vk3])<=LAKE_STOP_M*3)) continue;
              /* ① THE SPILL, FIRST. On a flat this is the only construction that has a direction —
                 see flatOutlet(). It answers null when the flat runs off the window, which is the
                 signal to take the next rung rather than to guess. */
              /* ⚠⚠ THE TOLERANCE IS THE DEM'S ROUGHNESS OVER WATER, NOT ZERO. Measured across Lake
                 Biwa the terrarium surface reads 74–81 m — a real lake is flat, the DATA is not — so
                 a 1 m flat is a patch of the lake rather than the lake, and the walk hops between
                 patches. FLAT_TOL_M spans that roughness while staying well under LAKE_STOP_M, so a
                 basin deep enough to actually stop the water still stops it. */
              const fo=flatOutlet(V3,vk3,FLAT_TOL_M);
              const minMove=(mult===1)?(spacing*3):(halfM*0.5);
              const usable=!!(fo&&fo.outlet>=0&&fo.outElev<fo.level-FLAT_DROP_M&&gcM([lng,lat],fo.at)>minMove);
              /* the flat runs off this window and nothing lower was in it — widen, and do NOT let
                 the talweg guess a direction on a surface that has none */
              if(!usable&&fo&&fo.touchedEdge){ escalMult=mult; continue; }
              if(usable){
                escal++; escaped=true; escalMult=mult;
                const p=fo.at;
                /* (#R256) the CROSSING, cell by cell — not a chord from one shore to the other. The
                   fallback is the single leg only when the fill could not hand a path back. */
                const walk=(fo.path&&fo.path.length>1)?fo.path.slice(1):[{at:p,e:fo.outElev}];
                let pv=[lng,lat];
                walk.forEach(step=>{ distM+=gcM(pv,step.at); pv=step.at;
                  path.push(step.at); elev.push(step.e); spac.push(V3.spacingM); pts++; });
                lakes.push({ at:[lng,lat], depthM:0, areaKm2:fo.areaKm2 });   /* the lake it crossed, and how big */
                { const dx=(p[0]-lng)*Math.cos(p[1]*D), dy=p[1]-lat, m=Math.hypot(dx,dy);
                  if(m>1e-9){ headX=dx/m; headY=dy/m; } }
                lng=p[0]; lat=p[1];
                continue;
              }
              /* ② otherwise the same construction on the coarse window: route the volume we are
                 carrying through it and follow the share of the flow. Right wherever the wide view
                 actually has a slope, which is the case this rung was built for.
                 ⚠ (#R255) THE WIDE LOOK-AHEAD IS A SECOND CALL SITE, AND IT IS EASY TO MISS: the
                 first version of this round changed the signature and updated the one call the
                 grep showed in the main loop, leaving this one two arguments short — the trace ran
                 88 km over 13 windows and then ended `error`, «Cannot read properties of undefined
                 (reading 'filled')», which the catch turned into a silent bad ending. */
              const ch3=channelChain(V3,vk3,windowRoute(V3,vk3,carryM3));
              if(ch3.length<=2) continue;
              const exit=ch3[ch3.length-1], pExit=V3.ll(exit);
              const eHere=V3.surf[vk3], eExit=V3.surf[exit];
              const moved=gcM([lng,lat],pExit);
              /* ⚠⚠ AND IT MUST ACTUALLY GO DOWN, BY MORE THAN THE DATA'S OWN NOISE. #R189's gate
                 allowed +0.5 m, which on a lake every direction satisfies — including back the way
                 we came, which is how the trace spent 600 km crossing Biwa. Even a strict `< 0`
                 is not enough: the terrarium DEM is quantised, and a few centimetres of it is
                 always available somewhere on a lake surface. FLAT_DROP_M is the smallest fall
                 that means the ground, not the encoding. */
              if(!(moved>halfM*1.2&&eExit<eHere-FLAT_DROP_M)) continue;
              escal++; escaped=true; escalMult=mult;
              let pv=[lng,lat];
              for(let a2=1;a2<ch3.length;a2++){ const p=V3.ll(ch3[a2]);
                const dd=gcM(pv,p); distM+=dd; pv=p;
                path.push(p); elev.push(V3.surf[ch3[a2]]); spac.push(V3.spacingM); pts++;
                if(distM>=maxKm*1000) break; }
              lng=pv[0]; lat=pv[1];
              { const dx=(lng-entryLng)*Math.cos(lat*D), dy=lat-entryLat, m=Math.hypot(dx,dy);
                if(m>1e-9){ headX=dx/m; headY=dy/m; } }
            }
            /* ⚠ AND A STALL THAT CANNOT BE ESCAPED MUST END, NOT WANDER. Measured on Biwa: with no
               bound, the walk crossed the lake back and forth until the 600 km cap and reported
               「still flowing」 from the middle of a lake — the least honest ending available. Four
               windows in a row that fall nowhere, with no rung finding a spill, IS the ending. */
            if(!escaped&&stalled){ stallRun++; } else stallRun=0;
            if(stallRun>=4){
              let flat=0; { const V=floodWindow(lng,lat,N_WIN,spacing,z), vk=V?V.at(lng,lat):-1;
                if(V&&vk>=0){ const e=V.surf[vk]; for(let i=0;i<V.N;i++) if(Math.abs(V.surf[i]-e)<0.6) flat++;
                  endInfo={ areaKm2:flat*V.cellAreaM2/1e6, elevM:e }; } }
              end='lake'; break;
            }
            if(end==='superseded') break;
            if(!escaped&&looped){
              /* Say which: how much flat ground is at this level answers whether it is a lake or a
                 genuine dead end. */
              let flat=0; { const V=floodWindow(lng,lat,N_WIN,spacing,z), vk=V?V.at(lng,lat):-1;
                if(V&&vk>=0){ const e=V.surf[vk]; for(let i=0;i<V.N;i++) if(Math.abs(V.surf[i]-e)<0.6) flat++;
                  endInfo={ areaKm2:flat*V.cellAreaM2/1e6, elevM:e }; } }
              end=(flat>200)?'lake':'loop';
              break;
            }
          }
          visited.add(key);
        }
        if(windows>=160&&end==='cap') end='windows';
      } catch(err){
        /* (#R189) no caller of this function has a .catch — an exception here USED to reject the
           promise and the screen showed nothing at all (the TDZ bug above rode exactly this hole).
           An error is an ending like any other: record it, draw what was traced, and say so. */
        end='error'; endInfo={ message:String((err&&err.message)||err) };
        console.warn('traceDownstream',err);
      } finally { if(seq===traceSeq){ tracing=false; setProg(null); } }
      if(seq!==traceSeq) return trace;
      trace={ path, lakes, end, endInfo, belowSea, km:distM/1000, steps:pts, windows, warmRounds:rounds, z,
              escal, escalMult,                           /* (#R211) how many wide look-aheads, and the widest rung reached */
              stepM:minSpacingM,                          /* (#R189) the FINEST sampling on the ladder */
              elev, wet, spac, wetCapped:wetCap,          /* (#R188/#R189) bed profile, flooded cells, per-point sampling */
              from:[lng0,lat0], to:[lng,lat], at:Date.now() };
      try{ trace.section=channelSections(trace); }catch(e){ trace.section=null; console.warn('channel sections',e); }
      draw();
      report();
      return trace;
    }

    /* ══ (#R188) THE WATER'S OWN EDGES, READ OFF THE ELEVATION DATA ════════════════════════════════
       「（追記：補助線を単なるタイルに置き換えただけの手抜きはやめろ。意味がないことをするな。）」

       #R187 deleted the 2.6-px polyline and drew the SAME polyline as a raster stroke of constant
       width. The addendum is exactly right: a line rendered as a tile is still a line, and a channel
       that is 92 m wide in a gorge and 92 m wide across a floodplain is not the water, it is the
       path with a thickness. Nothing about the terrain reached the picture.

       What reaches it now is the cross-section. At every sampled point along the course the DEM is
       read on the PERPENDICULAR, out to ±1.1 km, and the water surface is raised until the wetted
       area of that section matches what has to pass through it. The two edges of the wetted run are
       the water's left and right banks — measured, at the elevation data's own resolution — so the
       drawn body pinches into every gorge, spreads across every flat, and its depth comes out of the
       same solve. There is no constant width anywhere in it.

       ⚠ HOW MUCH WATER IS IN A SECTION IS NOT A GUESS EITHER. Continuity: the same volume passes
       every section, and a section's area is inversely proportional to how fast the water crosses
       it. Speed goes as √slope (the √ of the friction-slope term every open-channel formula shares),
       and the bed slope at each point is measured from the trace's own elevation profile. So
       A(s) ∝ 1/√S(s), scaled once so that ∫A ds equals the volume the user actually placed —
       the 「1クリックの水量」 box. Steep reach → narrow and quick; flat reach → broad and slow. The
       only free number is the user's own.

       ⚠ AND WHERE THE ANSWER IS FINER THAN THE DATA, IT SAYS SO. A section narrower than one DEM
       sample is a claim the elevation data cannot support, so it is drawn one sample wide and counted
       in `belowRes` — reported in the panel rather than passed off as measurement. That is the same
       argument #R187 made for using ground metres, applied where it is actually true instead of
       everywhere.

       Cost: the sections are decimated to at most 900 along the whole course and every DEM read is
       from tiles the trace has already warmed, so this adds no network work at all. */
    /* SEC_HALF is how far the transect looks for a bank. 24 samples (±1.1 km) was measured pinning a
       flood plain at exactly the limit — 2,204 m on a 5×10⁸ m³ release down the Chikuma, i.e. the
       number was the sampling and not the water. 40 samples (±1.8 km) clears it, and any section
       that still reaches the end of its transect is COUNTED (`atLimit`) rather than passed off as a
       measured bank (#R185: no silent caps). */
    const SEC_MAX=900, SEC_HALF=40, SEC_DEPTH_MAX=80;
    function channelSections(tr){
      const path=tr&&tr.path, elev=tr&&tr.elev, spacArr=tr&&tr.spac;
      if(!path||path.length<3||!elev||elev.length<path.length) return null;
      const z=tr.z, stepM=tr.stepM||92;
      const V=Math.max(1,sources.reduce((s,x)=>s+Math.max(0,x.m3),0)||srcM3);
      /* (#R189) the user's discharge, if set — see flowM3s above. Q=A·v with v=K√S gives
         A(s) = (Q/K)/√S(s): the same 1/√S shape continuity always had, scaled by a real m³/s
         instead of a stored volume. */
      const Q=(flowM3s!=null&&isFinite(flowM3s)&&flowM3s>0)?+flowM3s:null;
      const n=path.length;
      const keep=[]; const stride=Math.max(1,Math.ceil(n/SEC_MAX));
      for(let i=1;i<n-1;i+=stride) keep.push(i);
      if(!keep.length) return null;
      /* ds carried by each kept section, and the bed slope over a 5-sample window around it */
      const M=keep.length, ds=new Float64Array(M), slope=new Float64Array(M);
      const gc=(a,b)=>Math.hypot((b[0]-a[0])*111320*Math.cos(((a[1]+b[1])/2)*D),(b[1]-a[1])*110574);
      for(let m=0;m<M;m++){ const i=keep[m];
        const a=Math.max(0,i-stride), b=Math.min(n-1,i+stride);
        ds[m]=Math.max(1,gc(path[a],path[b])/2);      /* the length of course this section speaks for */
        const rw=Math.max(1,gc(path[Math.max(0,i-2)],path[Math.min(n-1,i+2)]));
        const de=Math.max(0,elev[Math.max(0,i-2)]-elev[Math.min(n-1,i+2)]);
        slope[m]=Math.max(1e-4,de/rw);
      }
      let tot=0; for(let m=0;m<M;m++) tot+=ds[m]/Math.sqrt(slope[m]);
      const C=(Q!=null)?(Q/CHEZY_K):(V/Math.max(1e-6,tot));           /* Q/v, or ∫A ds = V (#R188) */
      const out=new Array(M); let belowRes=0, atLimit=0, wMax=0, dMax=0, wSum=0, thMax=0;
      const half=SEC_HALF;
      const prof=new Float64Array(2*half+1);
      for(let m=0;m<M;m++){
        const i=keep[m], p=path[i];
        /* (#R189) the transect samples at HALF THIS POINT'S OWN DEM spacing — the resolution ladder
           means the head of the course is measured at ~10 m and the lower reaches at ~46 m, each
           the finest its own data supports */
        const stM=(spacArr&&isFinite(spacArr[i])&&spacArr[i]>0)?spacArr[i]:stepM;
        const dt=stM/2; if(half*dt>thMax) thMax=half*dt;
        const a=path[Math.max(0,i-1)], b=path[Math.min(n-1,i+1)];
        const cosL=Math.max(0.05,Math.cos(p[1]*D));
        let dx=(b[0]-a[0])*111320*cosL, dy=(b[1]-a[1])*110574;
        const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L;
        const nx=-dy, ny=dx;                                          /* unit normal, in metres */
        const bed=elev[i];
        let lo=bed;
        for(let t=-half;t<=half;t++){
          const om=t*dt;
          const lo2=p[0]+nx*om/(111320*cosL), la2=p[1]+ny*om/110574;
          let e=demAt(lo2,la2,z); if(e==null||!isFinite(e)) e=bed+SEC_DEPTH_MAX;   /* unknown ground is a bank */
          prof[t+half]=e; if(e<lo) lo=e;
        }
        const A=C/Math.sqrt(slope[m]);                 /* the wetted area continuity asks for here */
        /* wetted area of the run CONNECTED to the centre, as a function of the water level */
        const areaAt=(h)=>{ let acc=0;
          for(let t=half;t>=0;t--){ if(prof[t]>=h) break; acc+=(h-prof[t])*dt; }
          for(let t=half+1;t<=2*half;t++){ if(prof[t]>=h) break; acc+=(h-prof[t])*dt; }
          return acc; };
        let h0=lo, h1=lo+SEC_DEPTH_MAX;
        if(areaAt(h1)<A) h0=h1;                                       /* the valley cannot hold it — take the cap */
        else { for(let it=0;it<26;it++){ const hm=(h0+h1)/2; if(areaAt(hm)<A) h0=hm; else h1=hm; } }
        const h=h0;
        let left=0, right=0;
        for(let t=half;t>=0;t--){ if(prof[t]>=h) break; left=(half-t)*dt; }
        for(let t=half+1;t<=2*half;t++){ if(prof[t]>=h) break; right=(t-half)*dt; }
        let wl=left, wr=right;
        if(left>=half*dt-1e-9||right>=half*dt-1e-9) atLimit++;        /* the transect ran out before the bank did */
        if(wl+wr<stM){ belowRes++; wl=wr=stM/2; }                     /* finer than the data — say so */
        const dep=Math.max(0,h-lo);
        out[m]={ i, lng:p[0], lat:p[1], nx, ny, wl, wr, depth:dep, stM };   /* (#R211) its own DEM sampling — flowImage draws cells of it */
        wSum+=(wl+wr); if(wl+wr>wMax) wMax=wl+wr; if(dep>dMax) dMax=dep;
      }
      return { list:out, volM3:V, flowM3s:Q, belowRes, atLimit, meanWidthM:wSum/M, maxWidthM:wMax, maxDepthM:dMax,
               sections:M, transectHalfM:thMax };
    }

    /* ── (#R187) the traced course, rasterised as water ──────────────────────────────────────────
       Drawn into its own image overlay because the course leaves the working grid almost immediately
       — that is the whole point of tracing on the raw DEM — so it cannot share the grid's canvas.

       WIDTH IS IN GROUND METRES, NOT PIXELS — and (#R188) it is no longer ONE width. The two things
       drawn here are the standing water the flood solved cell by cell (`trace.wet`) and the flowing
       channel between the banks the cross-section solve measured (`trace.section`); both come out of
       the DEM, so neither has a constant width anywhere. `trace.stepM` survives only as the floor:
       one elevation sample is the finest channel the data can support, and a section narrower than
       that is drawn at it and counted (`belowRes`).

       Palette and alpha are the shallow end of the standing-water ramp in draw(), so the course and
       the pooled water read as one body of water rather than as two features. */
    function flowImage(){
      const clear=()=>{ try{ if(GE().layers.has(LYR_FLOW)) GE().layers.remove(LYR_FLOW); }catch(_){}
                        try{ if(GE().layers.hasSource(IMG_FLOW)) GE().layers.removeSource(IMG_FLOW); }catch(_){} };
      const path=trace&&trace.path;
      if(!path||path.length<2){ clear(); return; }
      /* (#R188) the extent of the WATER, not of the line: the flooded cells reach well outside the
         course wherever a lake or a terminal basin does, and clipping the canvas to the path would
         cut exactly the parts that are not a line. */
      let x0=1,x1=0,y0=1,y1=0;
      const grow=(lng,lat)=>{ const x=mX(lng), y=mY(lat);
        if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; };
      for(const p of path) grow(p[0],p[1]);
      for(const w of (trace.wet||[])) grow(w[0],w[1]);
      const stepM=(trace.stepM&&isFinite(trace.stepM))?trace.stepM:92;
      const midLat=latOf((y0+y1)/2);
      const mPerMercY=CIRC*Math.cos(midLat*D);            /* metres per unit of mercator y at this latitude */
      const bankM=Math.max(2.5*stepM,(trace.section&&trace.section.maxWidthM)?trace.section.maxWidthM:0);
      const padY=Math.max(bankM/mPerMercY,(y1-y0)*0.02+1e-6);
      x0-=padY; x1+=padY; y0-=padY; y1+=padY;
      const spanX=Math.max(1e-9,x1-x0), spanY=Math.max(1e-9,y1-y0);
      /* A course that crosses ±180° comes out of mX() as a bbox spanning the whole world, and the
         overlay would be drawn across the wrong half of it. Draw nothing rather than something
         wrong — the panel still reports where the water went. */
      if(spanX>0.5){ clear(); return; }
      /* (#R188) THE CANVAS IS SIZED BY THE DATA, NOT BY A ROUND NUMBER. #R187's fixed 1,024 px put a
         92 m DEM cell on 0.16 of a pixel over a 600 km course, which would erase every edge this
         round computes. The long side is now whatever puts one DEM sample on one pixel, capped at
         2,560 so a continental trace still encodes quickly (the cap is reported below). */
      const longM=Math.max(spanX*CIRC*Math.max(0.05,Math.cos(midLat*D)),spanY*mPerMercY);
      const LONG=Math.max(512,Math.min(2560,Math.round(longM/Math.max(1,stepM))));
      const W=Math.max(8,Math.round(spanX>=spanY?LONG:LONG*spanX/spanY));
      const H=Math.max(8,Math.round(spanY>=spanX?LONG:LONG*spanY/spanX));
      const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
      const g=cv.getContext('2d');
      const pxPerMercY=H/spanY;
      const PX=(lng)=>(mX(lng)-x0)/spanX*W, PY=(lat)=>(mY(lat)-y0)/spanY*H;
      const mToPx=(m)=>(m/mPerMercY)*pxPerMercY;
      /* (#R211) THE SHARED RAMP — see waterRGBA/waterCSS. There is no second palette any more. */
      const shade=waterCSS;
      /* (#R211) one CELL is one elevation sample, or one pixel where a pixel is coarser — the same
         object the grid raster in draw() draws, and the reason the far field cannot be finer than
         its own data. Everything below marches in these units, so the two halves have the same
         texture as well as the same colour, and the cost is bounded by the pixels covered rather
         than by the length of the course. */
      const pxGroundM=(spanY/H)*mPerMercY;
      /* ── 1 · EVERY CELL THE FLOOD FOUND STANDING WATER IN, AT ITS OWN PLACE AND DEPTH ──────────
         These are real solved depths on real DEM cells (trace.wet), so the lakes, the pools and the
         terminal basin are drawn as the shapes they are — #R187 drew them as discs of equivalent
         area, which is the same "a number, rendered" mistake the addendum is about. */
      /* (#R189) each flooded cell is drawn at ITS OWN window's sampling — the resolution ladder
         means cells near the source are ~3× finer than cells 100 km downstream */
      const wet=(trace.wet||[]);
      for(let i=0;i<wet.length;i++){ const w=wet[i];
        const cellM=Math.max((w[3]&&isFinite(w[3]))?w[3]:stepM,pxGroundM);
        const cell=Math.max(1,mToPx(cellM));
        const X=PX(w[0]), Y=PY(w[1]);
        if(X<-cell||Y<-cell||X>W+cell||Y>H+cell) continue;
        g.fillStyle=shade(w[2]); g.fillRect(X-cell/2,Y-cell/2,cell,cell); }
      /* ── 2 · THE FLOWING CHANNEL, BANK TO BANK, AS CELLS ──────────────────────────────────────
         (#R211) The measured banks are unchanged — channelSections still reads the DEM on the
         perpendicular and solves the level continuity asks for — but the wetted strip between them
         is now STAMPED, one cell at a time, instead of being filled as a smooth quad. Consecutive
         sections are interpolated along the course at the same cell size so nothing is left between
         them; position, normal, half-widths and depth all vary linearly over the gap, which is what
         the quad was doing implicitly at its two ends. */
      const sec=trace.section&&trace.section.list;
      if(sec&&sec.length>1){
        const gcM2=(a,b)=>Math.hypot((b[0]-a[0])*111320*Math.cos(((a[1]+b[1])/2)*D),(b[1]-a[1])*110574);
        const stamp=(lng,lat,nx,ny,wl,wr,dep,cellM)=>{
          const cell=Math.max(1,mToPx(cellM)), cosL=Math.max(0.05,Math.cos(lat*D));
          g.fillStyle=shade(dep);
          const steps=Math.max(1,Math.ceil((wl+wr)/cellM));
          for(let q=0;q<=steps;q++){ const om=-wl+(wl+wr)*q/steps;
            const lo=lng+nx*om/(111320*cosL), la=lat+ny*om/110574;
            const X=PX(lo), Y=PY(la);
            if(X<-cell||Y<-cell||X>W+cell||Y>H+cell) continue;
            g.fillRect(X-cell/2,Y-cell/2,cell,cell); } };
        for(let m=0;m<sec.length-1;m++){
          const a=sec[m], b=sec[m+1];
          const cellM=Math.max(a.stM||stepM,pxGroundM);
          const along=Math.max(1,Math.ceil(gcM2([a.lng,a.lat],[b.lng,b.lat])/cellM));
          for(let t=0;t<along;t++){ const f=t/along, g1=1-f;
            stamp(a.lng*g1+b.lng*f, a.lat*g1+b.lat*f, a.nx*g1+b.nx*f, a.ny*g1+b.ny*f,
                  a.wl*g1+b.wl*f, a.wr*g1+b.wr*f, a.depth*g1+b.depth*f, cellM); }
        }
        { const z2=sec[sec.length-1]; stamp(z2.lng,z2.lat,z2.nx,z2.ny,z2.wl,z2.wr,z2.depth,Math.max(z2.stM||stepM,pxGroundM)); }
      } else {
        /* no section solve (a path too short to have a perpendicular) — the course still gets drawn,
           at the elevation data's own resolution, which is all that can honestly be claimed for it */
        g.lineCap='round'; g.lineJoin='round'; g.beginPath();
        for(let i=0;i<path.length;i++){ if(i) g.lineTo(PX(path[i][0]),PY(path[i][1])); else g.moveTo(PX(path[i][0]),PY(path[i][1])); }
        g.strokeStyle=shade(0.5); g.lineWidth=Math.max(1,mToPx(stepM)); g.stroke();
      }
      const coords=[[lngOf(x0),latOf(y0)],[lngOf(x1),latOf(y0)],[lngOf(x1),latOf(y1)],[lngOf(x0),latOf(y1)]];
      /* under the grid's own water, so where both exist the solved depths win */
      paintImg(IMG_FLOW,LYR_FLOW,cv.toDataURL('image/png'),coords,
               GE().layers.has(LYR_WATER)?LYR_WATER:undefined);
    }

    /* ---- drawing -------------------------------------------------------------------------------- */
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

      /* 2 — the water: standing depth in blue, the routed flow path in cyan on top */
      const cv=document.createElement('canvas'); cv.width=NX; cv.height=NY;
      const ct=cv.getContext('2d'), im=ct.createImageData(NX,NY), px=im.data;
      /* the flow scale is set by the biggest through-flow, so the picture reads the same whether the
         user dropped a bathtub or a reservoir */
      let maxThrough=0; for(let k=0;k<result.through.length;k++) if(result.through[k]>maxThrough) maxThrough=result.through[k];
      const thr=Math.max(1e-9,maxThrough*0.004);
      for(let k=0;k<NX*NY;k++){ const o=k*4, d=result.depth[k], f=result.through[k];
        if(d>0.02){ const c=waterRGBA(d);        /* (#R211) the shared ramp — the far field uses this one too */
          px[o]=c[0]; px[o+1]=c[1]; px[o+2]=c[2]; px[o+3]=c[3]; }
        else if(f>thr){ const s=Math.min(1,Math.log10(f/thr)/2.4);
          px[o]=Math.round(80+40*s); px[o+1]=Math.round(220-30*s); px[o+2]=255; px[o+3]=Math.round(70+150*s); } }
      ct.putImageData(im,0,0);
      paintImg(IMG_WATER,LYR_WATER,cv.toDataURL('image/png'),coords);
      /* (#R187) 2b — and the traced course beyond the grid, as water rather than as a line */
      try{ flowImage(); }catch(_){}

      /* 3 — levees, the line being drawn, water sources, and an arrow at every overtopping spill.
         (#R211) The working rectangle and the per-pond pins are gone — see ensureVec. */
      const feats=[];
      /* (#R187) the traced watercourse is WATER now (flowImage above); what stays as a marker is the
         label saying how it ended, which is information the picture cannot carry */
      if(trace&&trace.path&&trace.path.length>1){
        const lastPt=trace.path[trace.path.length-1];
        feats.push({type:'Feature',geometry:{type:'Point',coordinates:lastPt},properties:{kind:'end',label:traceEndLabel()}});
      }
      levees.forEach(lv2=>feats.push({type:'Feature',geometry:{type:'LineString',coordinates:lv2.pts},properties:{kind:'levee'}}));
      if(drafting&&drafting.pts.length>1) feats.push({type:'Feature',geometry:{type:'LineString',coordinates:drafting.pts},properties:{kind:'draft'}});
      sources.forEach(s=>feats.push({type:'Feature',geometry:{type:'Point',coordinates:[s.lng,s.lat]},properties:{kind:'source'}}));
      /* ⚠ (#R212) NO RED ARROWS AT ALL. 「また、赤い矢印はいらない。一切不要。」 — #R211 read 「体積の赤字
         表示を消す」 as "keep the arrow, drop the number beside it"; the follow-up settles it. The spill
         points are still COMPUTED and still reported in words (how many, and how much goes over the
         largest), and the water itself already shows where it leaves — the arrow was a second, louder
         drawing of a thing the picture says. `tw-breach` therefore never receives a feature. */
      setVec(feats);
      report();
    }
    /* (#R186) what the trace ended ON, in five languages — the map label and the panel line share it */
    function traceEndLabel(){
      if(!trace) return '';
      const km=trace.km<10?trace.km.toFixed(1):Math.round(trace.km);
      /* (#R190) running below zero on land is now something the course DID, not something that ended
         it — worth saying, because it is the interesting part of a delta or a polder. */
      const bs=trace.belowSea?(' · '+L('runs below sea level on land','途中で海抜0m以下の陸地を流下','verläuft unter dem Meeresspiegel','проходит ниже уровня моря по суше','discurre bajo el nivel del mar')):'';
      switch(trace.end){
        case 'sea': return '🌊 '+L('Reaches the sea','海に到達','Erreicht das Meer','Достигает моря','Llega al mar')
          /* (#R189) the connectedness test could not run (its DEM window failed) — say so instead of
             passing a network outage off as a verified ocean */
          +((trace.endInfo&&trace.endInfo.unchecked)?(' '+L('(unverified — data missing)','（未確認・データ欠損）','(unbestätigt — Daten fehlen)','(не подтверждено — нет данных)','(sin verificar — faltan datos)')):'')
          +bs+' · '+km+' km';
        case 'sink': { const d=trace.endInfo&&isFinite(trace.endInfo.depthM)?Math.round(trace.endInfo.depthM):null;
          const bsl=trace.endInfo&&trace.endInfo.belowSeaLevel;
          return '⏹ '+L('Flow stops here','ここで流れが止まる','Fluss endet hier','Течение здесь заканчивается','El flujo se detiene aquí')
            +(bsl?(' · '+L('closed basin below sea level','海面下の閉じた窪地','abflusslos unter dem Meeresspiegel','замкнутая впадина ниже уровня моря','cuenca cerrada bajo el nivel del mar')):'')
            +(d!=null?(' · '+L('basin','窪地','Becken','котловина','cuenca')+' '+d+' m'):'')+bs+' · '+km+' km'; }
        case 'lake': { const a=trace.endInfo&&isFinite(trace.endInfo.areaKm2)?trace.endInfo.areaKm2.toFixed(1):null;
          return '🏞 '+L('Spreads into standing water','静水域に広がる','Verteilt sich in stehendem Wasser','Растекается в стоячей воде','Se extiende en aguas quietas')
            +(a?(' · ≥'+a+' km²'):'')+' · '+km+' km'; }
        case 'loop': return '⏹ '+L('Flow stops here','ここで流れが止まる','Fluss endet hier','Течение здесь заканчивается','El flujo se detiene aquí')+' · '+km+' km';
        case 'flat': return '⏹ '+L('Flow stops here (flat)','ここで流れが止まる（平坦）','Fluss endet hier (flach)','Течение останавливается (равнина)','El flujo se detiene (llano)')+' · '+km+' km';
        case 'nodata': return '⚠ '+L('No elevation data beyond here','ここから先は標高データなし','Keine Höhendaten weiter','Дальше нет данных о высоте','Sin datos de elevación')+' · '+km+' km';
        case 'error': return '⚠ '+L('The trace failed here','ここで追跡が失敗','Verfolgung hier fehlgeschlagen','Трассировка здесь прервалась','El trazado falló aquí')+' · '+km+' km';
        case 'tiles': return '… '+L('traced as far as the elevation budget allows','標高データの上限まで追跡','bis zum Datenlimit verfolgt','прослежено до предела данных','trazado hasta el límite de datos')+' · '+km+' km';
        case 'steps':
        case 'cap': return '… '+L('still flowing at the 600 km limit','600 km の上限でもまだ流下中','fließt noch bei 600 km','всё ещё течёт на 600 км','sigue fluyendo al llegar a 600 km')+' · '+km+' km';
        /* (#R211) the window budget ran out — a real ending that used to fall through to a bare
           distance, which reads as "this is where the water is" when it is not */
        case 'windows': return '… '+L('traced as far as the window budget allows','探索窓の上限まで追跡','bis zum Fensterlimit verfolgt','прослежено до предела окон','trazado hasta el límite de ventanas')+' · '+km+' km';
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
    function waterCSS(d){ const c=waterRGBA(d); return 'rgba('+c[0]+','+c[1]+','+c[2]+','+(c[3]/255).toFixed(3)+')'; }
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
      setStat((tracing?('<b>'+L('Downstream','流下先','Unterlauf','Ниже по течению','Aguas abajo')+':</b> '+L('tracing…','追跡中…','wird verfolgt…','трассировка…','trazando…')):'')
        +((!tracing&&trace)?('<b>'+L('Downstream','流下先','Unterlauf','Ниже по течению','Aguas abajo')+':</b> '+traceEndLabel()):'')
        +((!tracing&&!trace)?('<span style="opacity:0.75;">'+L('Place water to see where it goes.','水を配置すると流下先を表示します。','Wasser platzieren, um den Verlauf zu sehen.','Разместите воду, чтобы увидеть путь.','Coloque agua para ver adónde va.')+'</span>'):'')
        +'<br><b>'+L('Overtopping','決壊・越流','Überströmen','Перелив','Desbordamiento')+':</b> '
        +(result.breaches.length?(result.breaches.length+' '+L('spill points','箇所','Stellen','точек','puntos'))
          :L('none — everything is held','なし（すべて湛水）','keines','нет','ninguno'))
        /* (#R256) the pouring volume and the elapsed clock moved to the footer — see syncFoot() */
        );
      try{ syncFoot(); }catch(_){}
      setMore('<b>'+L('Ponded','湛水','Aufgestaut','Затоплено','Embalsado')+':</b> '+fmtM3(result.storedM3)
        +' · '+n(result.floodKm2,2)+' km² · '+L('max depth','最大水深','max. Tiefe','макс. глубина','prof. máx')+' '+n(result.maxDepth,1)+' m'
        +(result.breaches.length?('<br><b>'+L('Largest spill','最大の越流','Größter Überlauf','Наибольший перелив','Mayor desbordamiento')+':</b> '+fmtM3(result.breaches[0].over)):'')
        +'<br><span style="opacity:0.72;">'+n(G.cellM)+' m '+L('cells','セル','Zellen','ячейки','celdas')+' · '+G.NX+'×'+G.NY+' · DEM z'+G.z+' · MFD · '+result.solveMs+' ms'
        /* (#R189) a repaired DEM hole is a guess — say how many cells are guessed, never silently */
        +(G.demMissing?(' · ⚠ '+n(G.demMissing)+' '+L('cells interpolated (no DEM)','セルは補間（DEM欠損）','Zellen interpoliert (kein DEM)','ячеек интерполировано (нет DEM)','celdas interpoladas (sin DEM)')):'')+'</span>'
        +((!tracing&&trace)?(
          (trace.lakes.length?('<br><b>'+L('Ponds crossed','通過した窪地','Gequerte Senken','Пройдено котловин','Depresiones cruzadas')+':</b> '+trace.lakes.length):'')
          /* (#R188) the drawn water, in numbers — the section solve and the flooded cells behind it */
          +(trace.section?('<br><b>'+L('Channel','水路','Gerinne','Русло','Cauce')+':</b> '
            +L('width','幅','Breite','ширина','ancho')+' '+n(trace.section.meanWidthM)+'–'+n(trace.section.maxWidthM)+' m · '
            +L('max depth','最大水深','max. Tiefe','макс. глубина','prof. máx')+' '+n(trace.section.maxDepthM,1)+' m · '
            +(trace.section.flowM3s?('Q '+n(trace.section.flowM3s)+' m³/s'):fmtM3(trace.section.volM3))):'')
          +'<br><span style="opacity:0.72;">'+L('real DEM','実標高','echtes DEM','реальный DEM','DEM real')+' z'+trace.z+' · '+trace.steps+' '+L('steps','ステップ','Schritte','шагов','pasos')
            /* (#R211) a wide look-ahead crossed a lake bigger than the window — say so, it is why
               the course did not stop there */
            +(trace.escal?(' · '+trace.escal+' '+L('wide look-aheads','広域探索','Weitblicke','широких обзора','búsquedas amplias')+(trace.escalMult?(' ×'+trace.escalMult):'')):'')
            +(trace.section?(' · '+trace.section.sections+' '+L('cross-sections','断面','Querprofile','сечений','secciones')
              +' ±'+n(trace.section.transectHalfM)+' m'
              +(trace.section.belowRes?(' · '+trace.section.belowRes+' '+L('below DEM resolution','DEM解像度未満','unter DEM-Auflösung','ниже разрешения DEM','bajo la resolución del DEM')):'')
              +(trace.section.atLimit?(' · '+trace.section.atLimit+' '+L('wider than the transect','断面幅の上限に到達','breiter als das Profil','шире профиля','más ancho que el perfil')):'')):'')
            +((trace.wet&&trace.wet.length)?(' · '+n(trace.wet.length)+' '+L('flooded cells','湛水セル','geflutete Zellen','затопленных ячеек','celdas inundadas')+(trace.wetCapped?' ('+L('capped','上限','begrenzt','предел','limitado')+')':'')):'')
            +'</span>'):'')); }
    function fmtDur(s){ s=Math.max(0,Math.round(s));
      if(s<90) return s+' '+L('s','秒','s','с','s');
      if(s<5400) return Math.round(s/60)+' '+L('min','分','min','мин','min');
      if(s<172800) return (s/3600).toFixed(1)+' '+L('h','時間','h','ч','h');
      return (s/86400).toFixed(1)+' '+L('d','日','T','сут','d'); }

    /* ══ ⚠⚠ (#R256) THE PANEL IS THE SAME GROUPED INSET LIST THE EARTHQUAKE SIMULATOR IS ═══════════
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
        /* ⚠ (#R256) THE TOOL PICKER IS 2×2, NOT A FOUR-WAY STRIP. Measured in this panel: the strip
           gives each segment 73 px while 「🧱 堤防・ダム」 needs 96 and 「💧 ここに水」 88 — two of the
           four labels were clipped. Four names do not fit across 306 px, so they go two by two. */
        '.tw-modes{display:grid;grid-template-columns:1fr 1fr;}',
        '.tw-modes .tw-seg{overflow:hidden;text-overflow:ellipsis;}',
        '.tw-btn{padding:8px 10px;border-radius:10px;border:1px solid var(--glass-border,rgba(128,128,128,0.22));'
          +'background:var(--input-bg);color:var(--text-main);font-size:'+TW_FS+';cursor:pointer;}',
        /* the transport: a round accent button, the way the other simulator's player is (#R242) */
        '.tw-play{width:38px;height:38px;flex:0 0 auto;border-radius:19px;border:none;background:var(--primary-color);'
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
        /* ⑤ what the model is and is not — folded, like every other long note (#R256) */
        +'<details class="tw-note" style="line-height:1.5;">'
          +'<summary>'+L('About this model','このモデルについて','Über dieses Modell','Об этой модели','Sobre este modelo')+'</summary>'
          +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;margin-top:4px;">'
          +L('Real terrarium elevation, sculpted by you. Water is routed by priority-flood depression filling and downslope volume accounting — it answers where the water stands and which way it leaves, not how fast the front travels.',
             '実際の標高データを編集しています。水はプライオリティフラッド（窪地充填）と流下方向への体積集積で解いています。「どこに溜まり、どちらへ抜けるか」を答えるモデルで、波の到達速度は扱いません。',
             'Echte Höhendaten. Wasser über Priority-Flood und Volumenrouting — wo es steht und wohin es abfließt, nicht wie schnell die Front läuft.',
             'Реальные высоты. Вода — priority-flood и маршрутизация объёма: где стоит и куда уходит, но не скорость фронта.',
             'Elevación real. El agua se resuelve con priority-flood y enrutamiento de volumen: dónde queda y por dónde sale, no la velocidad del frente.')
          +'</div></details>'
        +'</div>'
        +'<div class="tw-foot" style="flex:0 0 auto;position:sticky;bottom:0;padding:8px 12px calc(10px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:8px;background:var(--card-bg,#1c1c1e);border-top:1px solid var(--glass-border,rgba(128,128,128,0.25));">'
        /* ══ (#R256) 「時間は下部スティックしろ。」 — the transport, the multiplier and the clock ═══════ */
        +'<div style="display:flex;align-items:center;gap:8px;">'
          +'<button class="tw-play tw-pp" aria-label="'+L('Pour','注水','Zulauf','Наполнение','Verter')+'">▶</button>'
          +'<div class="tw-segwrap" style="flex:1 1 auto;">'+[1,10,60,600].map(s=>'<button class="tw-seg tw-ts" data-s="'+s+'">'+(s>=60?(s/60)+'m':s+'s')+'</button>').join('')+'</div>'
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
      /* (#R256) the clock belongs to the simulation, so its controls are wired from here and stay
         live in every tool — including when no tool at all is selected. */
      panel.querySelectorAll('.tw-ts').forEach(b=>b.onclick=()=>{ timeScale=+b.getAttribute('data-s'); syncFoot(); });
      panel.querySelector('.tw-pp').onclick=()=>{ if(pourT) pourStop(); else { pourMode='cont'; pourStart(); } syncFoot(); renderParams(); };
      panel.querySelector('.tw-undo').onclick=()=>undo();
      /* (#R211) 「配置した水は残して地形だけ戻す」 — the sculpt and the levees go, the water stays put
         and is re-solved on the ORIGINAL ground, which is the comparison the button exists for. */
      panel.querySelector('.tw-resetT').onclick=()=>{ if(!G) return; pushUndo();
        sculpt=new Float32Array(G.NX*G.NY); levees=[]; solve(); };
      panel.querySelector('.tw-reset').onclick=()=>{ if(!G) return; pourStop(); sculpt=new Float32Array(G.NX*G.NY); levees=[]; sources=[]; rainMm=0; pourSimS=0; editDirty(); clearTrace();
        const r=panel.querySelector('.tw-rain'); if(r) r.value=0; undoStack=[]; solve(); terrainSoon(); };
      try{ makeDraggable(panel,panel.querySelector('.tw-head')); }catch(_){}
      syncMode(); renderParams(); syncFoot();
      if(result) report();
    }
    function syncMode(){ if(!panel) return; panel.querySelectorAll('.tw-m').forEach(b=>{
      b.classList.toggle('on',b.getAttribute('data-m')===mode); }); }
    /* ══ (#R256) THE FOOTER IS THE SIMULATION'S CLOCK ═══════════════════════════════════════════════
       Repainted without rebuilding the panel, so it can be called from the pour's own interval. The
       transport is disabled — visibly, not silently — until there is water to pour into. */
    function syncFoot(){ if(!panel) return;
      const pp=panel.querySelector('.tw-pp'); if(!pp) return;
      pp.textContent=pourT?'⏸':'▶';
      pp.disabled=!sources.length;
      pp.title=sources.length
        ? (pourT?L('Pause','一時停止','Pause','Пауза','Pausa'):L('Pour','注水開始','Zulauf starten','Начать','Verter'))
        : L('Place water on the map first','先に地図へ水を配置してください','Zuerst Wasser platzieren','Сначала разместите воду','Coloque agua primero');
      panel.querySelectorAll('.tw-ts').forEach(b=>b.classList.toggle('on',+b.getAttribute('data-s')===timeScale));
      const el=panel.querySelector('.tw-elapsed');
      if(el) el.textContent=L('Elapsed','経過時間','Vergangen','Прошло','Transcurrido')+' '+fmtDur(pourSimS)+' ('+timeScale+'×)';
      const vo=panel.querySelector('.tw-vol');
      if(vo) vo.textContent=sources.length?fmtM3(pourTotal()):''; }
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
        /* (#R256) …and it says when the grid cannot carry the width that was typed (see stampLevees) */
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
        /* ⚠ (#R256) THE TRANSPORT AND THE SPEED ARE NOT HERE ANY MORE — they are in the footer, which
           is what 「時間は下部スティックしろ」 asks for and what stops them vanishing when the reader
           picks up the brush while a pour is running. What stays is what the TOOL decides: whether a
           click drops a fixed volume or opens a tap, how much, and the channel discharge. */
        p.innerHTML=cap(L('Water here','ここに水','Wasser hier','Вода здесь','Agua aquí'))
          +card('<div class="tw-row">'+L('Pour','注水','Zulauf','Наполнение','Vertido')
            +'<span class="tw-val" style="flex:1 1 auto;max-width:190px;"><span class="tw-segwrap" style="flex:1 1 auto;">'
              +'<button class="tw-seg tw-pm" data-p="once">'+L('One shot','1回きり','Einmalig','Разово','Una vez')+'</button>'
              +'<button class="tw-seg tw-pm" data-p="cont">'+L('Continuous','継続','Dauernd','Непрерывно','Continuo')+'</button>'
            +'</span></span></div>'
          +(pourMode==='once'
            ?'<label class="tw-row">'+L('Volume per click','1クリックの水量','Volumen je Klick','Объём за клик','Volumen por clic')
              +'<span class="tw-val"><input class="tw-num tw-sv" type="number" min="1" step="100000" value="'+srcM3+'"><span style="opacity:.7;">m³</span></span></label>'
            :'<label class="tw-row">'+L('Inflow','注水量','Zulauf','Приток','Aporte')
              +'<span class="tw-val"><input class="tw-num tw-pr" type="number" min="1" step="1000" value="'+pourRate+'"><span style="opacity:.7;">m³/s</span></span></label>')
          /* (#R189) 「水の水流は設定可能に」 — empty = the volume-continuity behaviour (#R188) */
          +'<label class="tw-row">'+L('Discharge','流量','Durchfluss','Расход','Caudal')
            +'<span class="tw-val"><input class="tw-num tw-fq" type="number" min="0" step="50" value="'+(flowM3s!=null?flowM3s:'')+'" placeholder="'+L('auto','自動','auto','авто','auto')+'"><span style="opacity:.7;">m³/s</span></span></label>');
        p.querySelectorAll('.tw-pm').forEach(b=>{ b.classList.toggle('on',b.getAttribute('data-p')===pourMode);
          b.onclick=()=>{ pourMode=b.getAttribute('data-p'); if(pourMode==='once') pourStop(); renderParams(); syncFoot(); }; });
        const sv=p.querySelector('.tw-sv'); if(sv) sv.onchange=e=>srcM3=Math.max(1,+e.target.value||1e6);
        const pr=p.querySelector('.tw-pr'); if(pr) pr.onchange=e=>pourRate=Math.max(1,+e.target.value||20000);
        p.querySelector('.tw-fq').onchange=e=>{ const v=parseFloat(e.target.value);
          flowM3s=(isFinite(v)&&v>0)?v:null;
          if(trace){ try{ trace.section=channelSections(trace); }catch(_){} draw(); report(); } };
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
      sources.push({lng,lat,m3:(pourMode==='cont')?0:srcM3});
      /* (#R255) the clock is the SIMULATION's, not this source's — it is reset when the simulation is
         (全消去 / 元に戻す / close), and a second inlet added to a flood that is already running joins
         it at the time it is at. Restarting from zero here is what made 「時間がリセットされる」 true
         even after the tool-switch stop was removed. */
      if(pourMode==='cont'){ if(!pourT) pourSimS=0; solve(); pourStart(); if(panel) renderParams(); }
      else solve();
      try{ syncFoot(); }catch(_){}      /* (#R256) the transport is live the moment there is water */
      traceDownstream(lng,lat); }
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
    function clearTrace(){ traceSeq++; tracing=false; trace=null; }   /* (#R186) bumping the token aborts an in-flight trace */
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
          editDirty();          /* (#R256) a restored levee is a change to the ground — see addLevee */
          solve();
          if(sources.length) traceDownstream(sources[0].lng,sources[0].lat);
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
      probe(lng,lat){ if(!G||!result) return null; const c=cellOf(lng,lat); if(!c) return null;
        const k=c.j*G.NX+c.i, id=result.depId?result.depId[k]:-1;
        const dp=(id>=0&&result.deps[id])?result.deps[id]:null;
        return { groundM:result.surf[k], depthM:result.depth[k], throughM3:result.through[k],
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
        else if(o.run===true||(pourMode==='cont'&&o.run==null&&sources.length)) pourStart();
        if(opened) renderParams();
        return this.pourState(); },
      pourState(){ return { running:!!pourT, mode:pourMode, rateM3s:pourRate, speed:timeScale,
        simSeconds:Math.round(pourSimS), totalM3:pourTotal() }; },
      /* (#R211) what the progress bar is showing, for a test that must not sleep a fixed time */
      progress(){ return { busy:!!(building||tracing||progOn), building, tracing }; },
      /* (#R189) the channel discharge — null/0 restores the volume-continuity behaviour (#R188) */
      setFlow(m3s){ const v=parseFloat(m3s); flowM3s=(isFinite(v)&&v>0)?v:null;
        const f=panel&&panel.querySelector('.tw-fq'); if(f) f.value=(flowM3s!=null?flowM3s:'');
        if(trace){ try{ trace.section=channelSections(trace); }catch(_){} draw(); report(); }
        return flowM3s; },
      addSource(lng,lat,m3){ pushUndo(); sources.push({lng,lat,m3:Math.max(0,+m3||srcM3)}); const r=solve();
        /* (#R186) the same follow-through a click gets, so Atlas and the tests see the same feature */
        traceDownstream(lng,lat); return r; },
      /* (#R186) 「水は流れなくなる地点または海に到達した地点まで」 — the long-range answer on the raw DEM,
         reachable on its own (Atlas: "where does water from here go"). Resolves when the trace ends. */
      trace:(lng,lat,o)=>traceDownstream(lng,lat,o),
      /* (#R186) what the tracer SEES at one point — the ground, the ring of candidate steps, and what
         the local flood makes of it. #R176's lesson is that an error measured with the same expression
         that produced it stays invisible; this exposes the raw inputs so a test (or a person) can check
         the walk against the DEM instead of against the walk. */
      _traceProbe:async(lng,lat,z)=>{ z=z||TRACE_Z; await warmBlock(lng,lat,z);
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
      traceState:()=>(trace?{ end:trace.end, km:trace.km, steps:trace.steps, points:trace.path.length,
        escal:trace.escal, escalMult:trace.escalMult,   /* (#R211) how many wide look-aheads fired, and the widest rung */
        lakes:trace.lakes.length, z:trace.z, from:trace.from, to:trace.to, info:trace.endInfo,
        belowSea:!!trace.belowSea,        /* (#R190) ran under 0 m on land and kept going */
        tracing }:{ end:null, tracing }),
      /* ══ (#R211) THE PROFILE THE WALK ACTUALLY FOLLOWED ═══════════════════════════════════════
         Not temporary. Four hypotheses about the Lake Biwa stall were tested this round and the
         only ones that settled anything were readings off this: the elevation quantiles, how many
         steps FELL versus stayed level, and which rung the escalation actually reached. `wp` gives
         eleven waypoints along the course, which is what showed the walk going back and forth
         inside the lake at a constant 81 m. Whoever picks the Seta crossing up next needs this. */
      _dbgTrace:()=>{ if(!trace||!trace.elev) return null; const e=trace.elev;
        const n=e.length, q=(f)=>e[Math.min(n-1,Math.round(f*(n-1)))];
        let drops=0, flats=0; for(let i=1;i<n;i++){ const d=e[i-1]-e[i]; if(d>0.25) drops++; else if(Math.abs(d)<=0.25) flats++; }
        const P=trace.path;
        const wp=[0,0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1].map(f=>{ const i=Math.min(P.length-1,Math.round(f*(P.length-1)));
          return [+P[i][0].toFixed(3),+P[i][1].toFixed(3),Math.round(e[i])]; });
        return { n, wp, first:e[0], last:e[n-1], min:Math.min.apply(null,e), max:Math.max.apply(null,e),
                 q:[q(0),q(0.25),q(0.5),q(0.75),q(1)], drops, flats,
                 escal:trace.escal, escalMult:trace.escalMult, windows:trace.windows }; },
      clearTrace,
      /* ⚠ (#R256) `editDirty()` — WITHOUT IT THIS DOOR BUILDS NOTHING. MEASURED: adding a levee through
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
      clearWater(){ pushUndo(); pourStop(); sources=[]; rainMm=0; const r=panel&&panel.querySelector('.tw-rain'); if(r) r.value=0; return solve(); },
      /* (#R211) 「配置した水は残して地形だけ戻す」 — the button's other half, as a call */
      resetTerrain(){ if(!G) return false; pushUndo(); sculpt=new Float32Array(G.NX*G.NY); levees=[]; editDirty(); solve(); terrainSoon(); return true; },
      /* (#R190) why the automatic re-trace did or did not run after the last edit — a silent no-op is
         exactly the class of defect this feature keeps producing (#R186/#R188/#R189), so it reports. */
      retraceState:()=>({ why:_reWhy, pending:!!_reT, sinceLastTraceMs:Date.now()-_lastTraceAt }),
      state:()=>({ open:opened, mode, grid:G?{nx:G.NX,ny:G.NY,cellM:G.cellM,z:G.z,bbox:G.bbox,demMissing:G.demMissing||0}:null,
        levees:levees.length, sources:sources.length, rainMm, flowM3s, tracing,
        /* (#R211) the pour, the pen and how many single operations 元に戻す can still take back */
        brushM, brushStrength, undoDepth:undoStack.length,
        pour:{ running:!!pourT, mode:pourMode, rateM3s:pourRate, speed:timeScale, simSeconds:Math.round(pourSimS), totalM3:pourTotal() },
        trace: trace?{ end:trace.end, km:trace.km, steps:trace.steps, lakes:trace.lakes.length, z:trace.z }:null,
        result: result?{ storedM3:result.storedM3, floodKm2:result.floodKm2, maxDepth:result.maxDepth,
          breaches:result.breaches.length, biggestOver:result.breaches[0]?result.breaches[0].over:0,
          depCount:result.depCount, biggest:result.biggest, totalIn:result.totalIn, solveMs:result.solveMs }:null }) };
  })();
};
