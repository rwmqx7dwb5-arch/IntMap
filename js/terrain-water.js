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
    const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
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
    let drafting=null; /* a levee being drawn */
    let undoStack=[];

    /* ---- layers ------------------------------------------------------------------------------- */
    function ensureVec(){ try{ if(!_imCanDraw()) return false;
      if(!GE().layers.hasSource(VEC)) GE().layers.addSource(VEC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!GE().layers.has('tw-levee-line')) GE().layers.add({id:'tw-levee-line',type:'line',source:VEC,filter:['==',['get','kind'],'levee'],
        paint:{'line-color':'#8d6e3a','line-width':4,'line-opacity':0.95}});
      if(!GE().layers.has('tw-draft-line')) GE().layers.add({id:'tw-draft-line',type:'line',source:VEC,filter:['==',['get','kind'],'draft'],
        paint:{'line-color':'#ffd23f','line-width':3,'line-dasharray':[2,1.5],'line-opacity':0.95}});
      if(!GE().layers.has('tw-breach')) GE().layers.add({id:'tw-breach',type:'symbol',source:VEC,filter:['==',['get','kind'],'breach'],
        layout:{'text-field':['get','label'],'text-size':13,'text-allow-overlap':true,'text-rotate':['get','rot'],'text-rotation-alignment':'map'},
        paint:{'text-color':'#ff3b30','text-halo-color':'#fff','text-halo-width':1.6}});
      if(!GE().layers.has('tw-src')) GE().layers.add({id:'tw-src',type:'circle',source:VEC,filter:['==',['get','kind'],'source'],
        paint:{'circle-radius':6,'circle-color':'#29b6f6','circle-stroke-color':'#04283a','circle-stroke-width':2}});
      /* (#R186) THE WORKING AREA, DRAWN. This is the other half of 「水を配置したときに、結果が出ない
         ことがある」: the solver grid is clipped to at most 60 km, the viewport is often far larger,
         and a click outside the grid was silently dropped — a blue dot appeared and nothing else
         happened. The rectangle makes the boundary visible, and clicking outside it now MOVES the
         grid there (see onClick) instead of doing nothing. */
      if(!GE().layers.has('tw-area')) GE().layers.add({id:'tw-area',type:'line',source:VEC,filter:['==',['get','kind'],'area'],
        paint:{'line-color':'#7fd4ff','line-width':1.4,'line-opacity':0.5,'line-dasharray':[4,3]}});
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
      if(!GE().layers.has('tw-lake')) GE().layers.add({id:'tw-lake',type:'circle',source:VEC,filter:['==',['get','kind'],'lake'],
        paint:{'circle-radius':4.5,'circle-color':'#7fd4ff','circle-stroke-color':'#04283a','circle-stroke-width':1.6,'circle-opacity':0.9}});
      if(!GE().layers.has('tw-end')) GE().layers.add({id:'tw-end',type:'symbol',source:VEC,filter:['==',['get','kind'],'end'],
        layout:{'text-field':['get','label'],'text-size':12,'text-allow-overlap':true,'text-offset':[0,-0.9],'text-anchor':'bottom'},
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
    async function build(){
      if(building) return false; building=true;
      try{
        const b=GE().camera.getBounds(); if(!b) return false;
        let w=b.getWest(), e=b.getEast(), s=b.getSouth(), n=b.getNorth();
        if(e<w) e+=360;
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
        const warm=[]; for(let j=0;j<=48;j++) for(let i=0;i<=48;i++) warm.push([lngOf(xW+(xE-xW)*i/48), latOf(yN+(yS-yN)*j/48)]);
        await warmDEMTiles(warm,z,25000,null);
        const base=new Float32Array(NX*NY); let miss=0;
        for(let j=0;j<NY;j++){ const lat=latOf(yN+(j+0.5)*dy);
          for(let i=0;i<NX;i++){ const lng=lngOf(xW+(i+0.5)*dx);
            let v=demElevBilinear(lng,lat,z); if(v==null) v=demElevAt(lng,lat,null,z);
            if(v==null){ miss++; v=NaN; }
            base[j*NX+i]=v; } }
        /* a hole in the DEM would become a hole in the terrain; carry the nearest known value instead */
        if(miss) fillHoles(base,NX,NY);
        G={ NX,NY,xW,yN,dx,dy,cellM,areaM2:cellM*cellM,z,base,
            bbox:[lngOf(xW),latOf(yN),lngOf(xE),latOf(yS)], midLat, demMissing:miss };
        sculpt=new Float32Array(NX*NY); undoStack=[];
        return true;
      } finally { building=false; }
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
    function pushUndo(){ if(!G) return; undoStack.push(sculpt.slice()); if(undoStack.length>12) undoStack.shift(); }
    function undo(){ if(!undoStack.length) return false; sculpt=undoStack.pop(); solve(); return true; }
    /* A raised-cosine brush: no step at the rim, so the sculpted ground is a landform and not a cylinder. */
    function paintBrush(lng,lat,sign){ if(!G) return;
      const c=cellOf(lng,lat); if(!c) return;
      const rad=Math.max(1,Math.round(brushM/G.cellM)), amp=sign*brushStrength;
      for(let dj=-rad;dj<=rad;dj++){ const j=c.j+dj; if(j<0||j>=G.NY) continue;
        for(let di=-rad;di<=rad;di++){ const i=c.i+di; if(i<0||i>=G.NX) continue;
          const d=Math.hypot(di,dj)/rad; if(d>1) continue;
          sculpt[j*G.NX+i]+=amp*0.5*(1+Math.cos(Math.PI*d)); } } }
    /* A levee is a ridge whose crest follows the drawn line — stamped into the SAME height field, so
       the solver has no idea it is man-made and treats it exactly like ground. */
    function stampLevees(out){ if(!G||!levees.length) return;
      const halfW=(w)=>Math.max(1,(w||leveeWidth)/2/G.cellM);
      levees.forEach(lv=>{ const pts=lv.pts.map(p=>{ const c=cellOf(p[0],p[1]); return c?[c.i,c.j]:null; }).filter(Boolean);
        if(pts.length<2) return; const hw=halfW(lv.width), crest=lv.crest;
        for(let s=0;s<pts.length-1;s++){ const [x0,y0]=pts[s], [x1,y1]=pts[s+1];
          const n=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0)));
          for(let t=0;t<=n;t++){ const cx=x0+(x1-x0)*t/n, cy=y0+(y1-y0)*t/n;
            const r=Math.ceil(hw);
            for(let dj=-r;dj<=r;dj++){ const j=Math.round(cy)+dj; if(j<0||j>=G.NY) continue;
              for(let di=-r;di<=r;di++){ const i=Math.round(cx)+di; if(i<0||i>=G.NX) continue;
                const d=Math.hypot(Math.round(cx)+di-cx,Math.round(cy)+dj-cy)/hw; if(d>1) continue;
                const add=crest*(1-d*d);                       /* parabolic cross-section */
                const k=j*G.NX+i; if(add>out[k]) out[k]=add; } } } } }); }
    function surface(){ const n=G.NX*G.NY, s=new Float32Array(n);
      const lv=new Float32Array(n); stampLevees(lv);
      for(let k=0;k<n;k++) s[k]=G.base[k]+sculpt[k]+lv[k];
      return s; }

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

    function solve(){
      if(!G) return null;
      const t0=(typeof performance!=='undefined'?performance.now():Date.now());
      const NX=G.NX, NY=G.NY, N=NX*NY, A=G.areaM2;
      const surf=surface();
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
         (#R186) MOVED AHEAD OF THE ROUTING, because the routing now needs to know which cells are in a
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
      const own=new Float64Array(N);          /* m³ generated on the cell itself */
      const rain=(rainMm/1000)*A;
      if(rain>0) for(let k=0;k<N;k++) own[k]=rain;
      sources.forEach(sc=>{ const c=cellOf(sc.lng,sc.lat); if(c) own[c.j*NX+c.i]+=Math.max(0,sc.m3); });
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
          const dist=(card?1:Math.SQRT2)*G.cellM, L=(card?0.5:0.354)*G.cellM;
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
      const breaches=deps.filter(d=>d.over>0&&d.outlet>=0)
        .sort((a,b)=>b.over-a.over).slice(0,12);
      const ms=(typeof performance!=='undefined'?performance.now():Date.now())-t0;
      const biggest=deps.slice().sort((a,b)=>b.capacity-a.capacity)[0]||null;
      result={ surf, filled, depth, through, parent, mainOut, deps, breaches, wetCells, storedM3, maxDepth,
        floodKm2:wetCells*A/1e6, totalIn:(rainMm/1000)*A*N+sources.reduce((s,x)=>s+Math.max(0,x.m3),0),
        solveMs:Math.round(ms),
        /* diagnostics — the numbers to look at when the answer surprises you */
        depCount:deps.length, depId, model:'priority-flood + MFD(1.1) + cascading depressions',
        biggest:biggest?{ cells:biggest.cells.length, capacity:biggest.capacity, inflow:biggest.inflow,
          level:biggest.level, spill:biggest.spill, over:biggest.over||0 }:null };
      draw();
      return result;
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
    const TRACE_Z=11, TRACE_MAX_KM=600, TRACE_TILE_ROUNDS=42;
    const LAKE_STOP_M=25;          /* fill depth above which a basin is a lake, not a pit */
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
      const seq=++traceSeq; tracing=true;
      const z=opt.z||TRACE_Z, maxKm=opt.maxKm||TRACE_MAX_KM;
      let lng=lng0, lat=lat0;
      const path=[[lng,lat]], lakes=[];
      /* (#R188) the bed elevation under every path point, and every cell the window floods found
         standing water in. Both are read from data the flood ALREADY computed — see the note above
         flowImage() for what they are for. */
      const elev=[], wet=[]; let wetCap=false;
      const WET_MAX=140000, WET_MIN_D=0.3;
      let distM=0, rounds=0, warmC=null, end='cap', endInfo=null, windows=0, pts=1;
      let lastSpacingM=null;   /* (#R187) the window sampling — flowImage() draws the course this wide */
      const visited=new Set();
      let headX=0, headY=0;      /* the unit heading of the last window's travel, for the frame bias */
      const pixM=()=>CIRC*Math.max(0.05,Math.cos(lat*D))/(Math.pow(2,z)*256);
      const N_WIN=161;                                   /* odd, so the entry point is exactly a node */
      const gcM=(a,b)=>Math.hypot((b[0]-a[0])*111320*Math.cos(((a[1]+b[1])/2)*D),(b[1]-a[1])*110574);
      try{
        while(distM<maxKm*1000&&windows<160){
          if(seq!==traceSeq){ end='superseded'; break; }
          const tileDeg=360/Math.pow(2,z), dLatT=tileDeg*Math.max(0.05,Math.cos(lat*D));
          if(!warmC||Math.abs(lng-warmC[0])>tileDeg*0.5||Math.abs(lat-warmC[1])>dLatT*0.5){
            if(rounds>=TRACE_TILE_ROUNDS){ end='tiles'; break; }
            rounds++; await warmBlock(lng,lat,z); warmC=[lng,lat];
            if(seq!==traceSeq){ end='superseded'; break; }
          }
          const spacing=pixM()*1.5; lastSpacingM=spacing;
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
          const k0=W.at(lng,lat); if(k0<0){ end='nodata'; break; }
          const entryLng=lng, entryLat=lat;
          const entryE=W.surf[k0];
          if(!elev.length) elev.push(entryE);
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
          /* (#R188) the outline of ONE pond: everything connected to `seed` whose flood level is at
             or under `lev` and that the flood put water on. Bounded by the window and by the global
             cap, so a window full of shallow roughness cannot become a lake. */
          const collectPond=(seed,lev)=>{
            if(seed<0||wet.length>=WET_MAX){ if(wet.length>=WET_MAX) wetCap=true; return 0; }
            const seen=new Set([seed]); const stack=[seed]; let n2=0;
            while(stack.length){
              const k=stack.pop(); const ki=k%W.n, kj=(k/W.n)|0;
              const d=W.filled[k]-W.surf[k];
              if(!(d>WET_MIN_D)||W.filled[k]>lev+1e-6) continue;
              const p=W.ll(k); wet.push([p[0],p[1],d]); n2++;
              if(wet.length>=WET_MAX){ wetCap=true; break; }
              for(let dj=-1;dj<=1;dj++) for(let di=-1;di<=1;di++){
                if(!di&&!dj) continue;
                const ni=ki+di, nj=kj+dj; if(ni<0||nj<0||ni>=W.n||nj>=W.n) continue;
                const nk=nj*W.n+ni; if(seen.has(nk)) continue; seen.add(nk); stack.push(nk); }
            }
            return n2;
          };
          /* the whole downstream path inside this window, in one walk */
          const chain=[]; { let k=k0, guard=0; while(k>=0&&guard++<4*W.n){ chain.push(k); k=W.parent[k]; } }
          if(chain.length<2){ end='flat'; break; }
          let seaRun=0, poolRun=0, poolMax=0, poolStart=null, hitSea=false, prev=[lng,lat], poolSeed=-1, poolLev=0;
          for(let a=1;a<chain.length;a++){
            const k=chain[a], p=W.ll(k), e=W.surf[k], sub=W.filled[k]-e;
            const d=gcM(prev,p); distM+=d; prev=p; path.push(p); elev.push(e); pts++;
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
          if(hitSea){
            const v=await seaCheck(lng,lat);
            if(v.sea){ endInfo=Object.assign(endInfo||{},{connectedKm2:v.connectedKm2}); end='sea'; break; }
            end='sink'; endInfo={ depthM:null, areaKm2:v.connectedKm2||0, belowSeaLevel:true }; break;
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
          if(visited.has(key)){
            /* Coming back to a window we have already used means the descent is no longer taking us
               anywhere — and measured on a trace from Chamonix, the place that happens is LAKE
               GENEVA. A large body of standing water has no slope for a steepest-descent walk to
               follow, so this is not a failure of the trace, it is the trace arriving at one. Say
               which: how much flat ground is at this level answers whether it is a lake or a genuine
               dead end. (Finding a flat lake's OUTFLOW needs flow accumulation over the whole basin,
               which is not something this tracer claims to do — so it reports where it got to.) */
            let flat=0; { const V=floodWindow(lng,lat,N_WIN,spacing,z), vk=V?V.at(lng,lat):-1;
              if(V&&vk>=0){ const e=V.surf[vk]; for(let i=0;i<V.N;i++) if(Math.abs(V.surf[i]-e)<0.6) flat++;
                endInfo={ areaKm2:flat*V.cellAreaM2/1e6, elevM:e }; } }
            end=(flat>200)?'lake':'loop';
            break;
          }
          visited.add(key);
        }
        if(windows>=160&&end==='cap') end='windows';
      } finally { if(seq===traceSeq) tracing=false; }
      if(seq!==traceSeq) return trace;
      trace={ path, lakes, end, endInfo, km:distM/1000, steps:pts, windows, warmRounds:rounds, z,
              stepM:lastSpacingM,                         /* (#R187) the DEM sampling the course was traced at */
              elev, wet, wetCapped:wetCap,                /* (#R188) the bed profile and the flooded cells */
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
      const path=tr&&tr.path, elev=tr&&tr.elev;
      if(!path||path.length<3||!elev||elev.length<path.length) return null;
      const z=tr.z, stepM=tr.stepM||92;
      const V=Math.max(1,sources.reduce((s,x)=>s+Math.max(0,x.m3),0)||srcM3);
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
      const C=V/Math.max(1e-6,tot);                                  /* ∫A ds = V */
      const out=new Array(M); let belowRes=0, atLimit=0, wMax=0, dMax=0, wSum=0;
      const half=SEC_HALF, dt=stepM/2;                               /* transect sampling, finer than the trace */
      const prof=new Float64Array(2*half+1);
      for(let m=0;m<M;m++){
        const i=keep[m], p=path[i];
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
        if(wl+wr<stepM){ belowRes++; wl=wr=stepM/2; }                 /* finer than the data — say so */
        const dep=Math.max(0,h-lo);
        out[m]={ i, lng:p[0], lat:p[1], nx, ny, wl, wr, depth:dep };
        wSum+=(wl+wr); if(wl+wr>wMax) wMax=wl+wr; if(dep>dMax) dMax=dep;
      }
      return { list:out, volM3:V, belowRes, atLimit, meanWidthM:wSum/M, maxWidthM:wMax, maxDepthM:dMax,
               sections:M, transectHalfM:half*dt };
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
      /* the standing-water ramp from draw(), so the course and the pooled water are ONE body */
      const shade=(d)=>{ const t=Math.max(0,Math.min(1,d/6));
        return 'rgba('+Math.round(96-46*t)+','+Math.round(196-52*t)+','+Math.round(255-12*t)+','+(0.72+0.2*t).toFixed(3)+')'; };
      /* ── 1 · EVERY CELL THE FLOOD FOUND STANDING WATER IN, AT ITS OWN PLACE AND DEPTH ──────────
         These are real solved depths on real DEM cells (trace.wet), so the lakes, the pools and the
         terminal basin are drawn as the shapes they are — #R187 drew them as discs of equivalent
         area, which is the same "a number, rendered" mistake the addendum is about. */
      const cell=Math.max(1,mToPx(stepM));
      const wet=(trace.wet||[]);
      for(let i=0;i<wet.length;i++){ const w=wet[i];
        const X=PX(w[0]), Y=PY(w[1]);
        if(X<-cell||Y<-cell||X>W+cell||Y>H+cell) continue;
        g.fillStyle=shade(w[2]); g.fillRect(X-cell/2,Y-cell/2,cell,cell); }
      /* ── 2 · THE FLOWING CHANNEL, BANK TO BANK ────────────────────────────────────────────────
         Consecutive cross-sections make a quad each: the water's left bank, the next section's left
         bank, its right bank, this one's right bank. Width and depth both come from the DEM solve
         (channelSections), so the body narrows and widens with the ground it is on. */
      const sec=trace.section&&trace.section.list;
      if(sec&&sec.length>1){
        for(let m=0;m<sec.length-1;m++){
          const a=sec[m], b=sec[m+1];
          const cosA=Math.max(0.05,Math.cos(a.lat*D)), cosB=Math.max(0.05,Math.cos(b.lat*D));
          const aL=[a.lng+a.nx*-a.wl/(111320*cosA), a.lat+a.ny*-a.wl/110574];
          const aR=[a.lng+a.nx*  a.wr/(111320*cosA), a.lat+a.ny*  a.wr/110574];
          const bL=[b.lng+b.nx*-b.wl/(111320*cosB), b.lat+b.ny*-b.wl/110574];
          const bR=[b.lng+b.nx*  b.wr/(111320*cosB), b.lat+b.ny*  b.wr/110574];
          g.beginPath();
          g.moveTo(PX(aL[0]),PY(aL[1])); g.lineTo(PX(bL[0]),PY(bL[1]));
          g.lineTo(PX(bR[0]),PY(bR[1])); g.lineTo(PX(aR[0]),PY(aR[1])); g.closePath();
          g.fillStyle=shade((a.depth+b.depth)/2); g.fill();
        }
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
        if(d>0.02){ const s=Math.min(1,d/8);
          px[o]=Math.round(126-96*s); px[o+1]=Math.round(200-120*s); px[o+2]=255; px[o+3]=Math.round(120+110*s); }
        else if(f>thr){ const s=Math.min(1,Math.log10(f/thr)/2.4);
          px[o]=Math.round(80+40*s); px[o+1]=Math.round(220-30*s); px[o+2]=255; px[o+3]=Math.round(70+150*s); } }
      ct.putImageData(im,0,0);
      paintImg(IMG_WATER,LYR_WATER,cv.toDataURL('image/png'),coords);
      /* (#R187) 2b — and the traced course beyond the grid, as water rather than as a line */
      try{ flowImage(); }catch(_){}

      /* 3 — levees, the line being drawn, water sources, and an arrow at every overtopping spill */
      const feats=[];
      /* (#R186) the working rectangle, so the user can see where an edit will land */
      feats.push({type:'Feature',geometry:{type:'LineString',coordinates:[
        [G.bbox[0],G.bbox[1]],[G.bbox[2],G.bbox[1]],[G.bbox[2],G.bbox[3]],[G.bbox[0],G.bbox[3]],[G.bbox[0],G.bbox[1]]]},properties:{kind:'area'}});
      /* (#R187) the traced watercourse is WATER now (flowImage above); what stays as a marker is the
         standing water it passes through and the label saying how it ended, which is information the
         picture cannot carry */
      if(trace&&trace.path&&trace.path.length>1){
        trace.lakes.forEach(k=>feats.push({type:'Feature',geometry:{type:'Point',coordinates:k.at},properties:{kind:'lake'}}));
        const lastPt=trace.path[trace.path.length-1];
        feats.push({type:'Feature',geometry:{type:'Point',coordinates:lastPt},properties:{kind:'end',label:traceEndLabel()}});
      }
      levees.forEach(lv2=>feats.push({type:'Feature',geometry:{type:'LineString',coordinates:lv2.pts},properties:{kind:'levee'}}));
      if(drafting&&drafting.pts.length>1) feats.push({type:'Feature',geometry:{type:'LineString',coordinates:drafting.pts},properties:{kind:'draft'}});
      sources.forEach(s=>feats.push({type:'Feature',geometry:{type:'Point',coordinates:[s.lng,s.lat]},properties:{kind:'source'}}));
      result.breaches.forEach(b=>{ const k=b.outlet, i=k%NX, j=(k/NX)|0;
        const p=b.outDir, pi=p%NX, pj=(p/NX)|0;
        const rot=(Math.atan2(pi-i,-(pj-j))/D+360)%360;
        feats.push({type:'Feature',geometry:{type:'Point',coordinates:[lngOf(G.xW+(i+0.5)*G.dx), latOf(G.yN+(j+0.5)*G.dy)]},
          properties:{kind:'breach', rot, label:'➤ '+fmtM3(b.over)}}); });
      setVec(feats);
      report();
    }
    /* (#R186) what the trace ended ON, in five languages — the map label and the panel line share it */
    function traceEndLabel(){
      if(!trace) return '';
      const km=trace.km<10?trace.km.toFixed(1):Math.round(trace.km);
      switch(trace.end){
        case 'sea': return '🌊 '+L('Reaches the sea','海に到達','Erreicht das Meer','Достигает моря','Llega al mar')+' · '+km+' km';
        case 'sink': { const d=trace.endInfo&&isFinite(trace.endInfo.depthM)?Math.round(trace.endInfo.depthM):null;
          const bsl=trace.endInfo&&trace.endInfo.belowSeaLevel;
          return '⏹ '+L('Flow stops here','ここで流れが止まる','Fluss endet hier','Течение здесь заканчивается','El flujo se detiene aquí')
            +(bsl?(' · '+L('closed basin below sea level','海面下の閉じた窪地','abflusslos unter dem Meeresspiegel','замкнутая впадина ниже уровня моря','cuenca cerrada bajo el nivel del mar')):'')
            +(d!=null?(' · '+L('basin','窪地','Becken','котловина','cuenca')+' '+d+' m'):'')+' · '+km+' km'; }
        case 'lake': { const a=trace.endInfo&&isFinite(trace.endInfo.areaKm2)?trace.endInfo.areaKm2.toFixed(1):null;
          return '🏞 '+L('Spreads into standing water','静水域に広がる','Verteilt sich in stehendem Wasser','Растекается в стоячей воде','Se extiende en aguas quietas')
            +(a?(' · ≥'+a+' km²'):'')+' · '+km+' km'; }
        case 'loop': return '⏹ '+L('Flow stops here','ここで流れが止まる','Fluss endet hier','Течение здесь заканчивается','El flujo se detiene aquí')+' · '+km+' km';
        case 'flat': return '⏹ '+L('Flow stops here (flat)','ここで流れが止まる（平坦）','Fluss endet hier (flach)','Течение останавливается (равнина)','El flujo se detiene (llano)')+' · '+km+' km';
        case 'nodata': return '⚠ '+L('No elevation data beyond here','ここから先は標高データなし','Keine Höhendaten weiter','Дальше нет данных о высоте','Sin datos de elevación')+' · '+km+' km';
        case 'tiles': return '… '+L('traced as far as the elevation budget allows','標高データの上限まで追跡','bis zum Datenlimit verfolgt','прослежено до предела данных','trazado hasta el límite de datos')+' · '+km+' km';
        case 'steps':
        case 'cap': return '… '+L('still flowing at the 600 km limit','600 km の上限でもまだ流下中','fließt noch bei 600 km','всё ещё течёт на 600 км','sigue fluyendo al llegar a 600 km')+' · '+km+' km';
        default: return km+' km';
      }
    }
    function fmtM3(v){ if(v>=1e9) return (v/1e9).toFixed(2)+' km³';
      if(v>=1e6) return (v/1e6).toFixed(2)+' Mm³';
      if(v>=1e3) return Math.round(v/1e3)+' '+L('k m³','千m³','Tsd. m³','тыс. м³','k m³');
      return Math.round(v)+' m³'; }

    /* ---- panel ---------------------------------------------------------------------------------- */
    function setStat(h){ const s=panel&&panel.querySelector('.tw-stat'); if(s) s.innerHTML=h; }
    function report(){ if(!result) return;
      const n=(v,d)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:d==null?0:d});
      setStat('<b>'+L('Ponded','湛水','Aufgestaut','Затоплено','Embalsado')+':</b> '+fmtM3(result.storedM3)
        +' · '+n(result.floodKm2,2)+' km² · '+L('max depth','最大水深','max. Tiefe','макс. глубина','prof. máx')+' '+n(result.maxDepth,1)+' m'
        +'<br><b>'+L('Overtopping','決壊・越流','Überströmen','Перелив','Desbordamiento')+':</b> '
        +(result.breaches.length?(result.breaches.length+' '+L('spill points','箇所','Stellen','точек','puntos')+' · '+L('largest','最大','größte','наибольший','mayor')+' '+fmtM3(result.breaches[0].over))
          :L('none — everything is held','なし（すべて湛水）','keines','нет','ninguno'))
        +'<br><span style="opacity:0.72;">'+n(G.cellM)+' m '+L('cells','セル','Zellen','ячейки','celdas')+' · '+G.NX+'×'+G.NY+' · DEM z'+G.z+' · MFD · '+result.solveMs+' ms</span>'
        /* (#R186) the long-range answer: where the water goes after it leaves the working rectangle */
        +(tracing?('<br><b>'+L('Downstream','流下先','Unterlauf','Ниже по течению','Aguas abajo')+':</b> '+L('tracing…','追跡中…','wird verfolgt…','трассировка…','trazando…')):'')
        +((!tracing&&trace)?('<br><b>'+L('Downstream','流下先','Unterlauf','Ниже по течению','Aguas abajo')+':</b> '+traceEndLabel()
          +(trace.lakes.length?(' · '+trace.lakes.length+' '+L('ponds crossed','箇所の窪地を通過','Senken gequert','пройдено котловин','depresiones cruzadas')):'')
          /* (#R188) the drawn water, in numbers — the section solve and the flooded cells behind it */
          +(trace.section?('<br><b>'+L('Channel','水路','Gerinne','Русло','Cauce')+':</b> '
            +L('width','幅','Breite','ширина','ancho')+' '+n(trace.section.meanWidthM)+'–'+n(trace.section.maxWidthM)+' m · '
            +L('max depth','最大水深','max. Tiefe','макс. глубина','prof. máx')+' '+n(trace.section.maxDepthM,1)+' m · '
            +fmtM3(trace.section.volM3)):'')
          +'<br><span style="opacity:0.72;">'+L('real DEM','実標高','echtes DEM','реальный DEM','DEM real')+' z'+trace.z+' · '+trace.steps+' '+L('steps','ステップ','Schritte','шагов','pasos')
            +(trace.section?(' · '+trace.section.sections+' '+L('cross-sections','断面','Querprofile','сечений','secciones')
              +' ±'+n(trace.section.transectHalfM)+' m'
              +(trace.section.belowRes?(' · '+trace.section.belowRes+' '+L('below DEM resolution','DEM解像度未満','unter DEM-Auflösung','ниже разрешения DEM','bajo la resolución del DEM')):'')
              +(trace.section.atLimit?(' · '+trace.section.atLimit+' '+L('wider than the transect','断面幅の上限に到達','breiter als das Profil','шире профиля','más ancho que el perfil')):'')):'')
            +((trace.wet&&trace.wet.length)?(' · '+n(trace.wet.length)+' '+L('flooded cells','湛水セル','geflutete Zellen','затопленных ячеек','celdas inundadas')+(trace.wetCapped?' ('+L('capped','上限','begrenzt','предел','limitado')+')':'')):'')
            +'</span>'):'')); }

    const BTN='padding:5px 7px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:11px;cursor:pointer;white-space:nowrap;';
    const NUM='width:78px;height:26px;border-radius:7px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;padding:0 6px;box-sizing:border-box;';
    const ROW='font-size:11.5px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;gap:8px;';
    function modes(){ return [
      ['pan','✋ '+L('Pan','移動','Verschieben','Панорама','Mover')],
      ['raise','⛰ '+L('Raise','盛る','Anheben','Поднять','Elevar')],
      ['lower','⛏ '+L('Lower','削る','Abtragen','Срезать','Rebajar')],
      ['levee','🧱 '+L('Levee / dam','堤防・ダム','Deich / Damm','Дамба','Dique / presa')],
      ['source','💧 '+L('Water here','ここに水','Wasser hier','Вода здесь','Agua aquí')]]; }
    function render(){ if(!panel) return;
      panel.innerHTML='<div class="tw-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;">'
        +'<span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">⛰💧 '+L('Terrain &amp; water','地形編集・水流','Gelände &amp; Wasser','Рельеф и вода','Terreno y agua')+'</span>'
        +'<button class="tw-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>'
        +'<div style="padding:10px 12px;display:flex;flex-direction:column;gap:9px;">'
        +'<div class="tw-modes" style="display:flex;flex-wrap:wrap;gap:5px;">'+modes().map(m=>'<button class="tw-m" data-m="'+m[0]+'" style="'+BTN+'flex:1 1 auto;">'+m[1]+'</button>').join('')+'</div>'
        +'<div class="tw-params"></div>'
        +'<label style="'+ROW+'">'+L('Rainfall (mm)','降水量 (mm)','Niederschlag (mm)','Осадки (мм)','Lluvia (mm)')+'<input class="tw-rain" type="number" min="0" max="2000" step="10" value="'+rainMm+'" style="'+NUM+'"></label>'
        +'<div style="display:flex;gap:5px;">'
          +'<button class="tw-undo" style="'+BTN+'flex:1;">↩ '+L('Undo','元に戻す','Rückgängig','Отменить','Deshacer')+'</button>'
          +'<button class="tw-refit" style="'+BTN+'flex:1;">⛶ '+L('Fit to view','表示範囲に合わせる','An Ansicht','По виду','Ajustar')+'</button>'
          +'<button class="tw-reset" style="'+BTN+'flex:1;">✖ '+L('Reset','全消去','Zurücksetzen','Сброс','Reiniciar')+'</button>'
        +'</div>'
        +'<div class="tw-stat" style="font-size:11.5px;color:var(--text-main);min-height:16px;line-height:1.55;"></div>'
        +'<div style="font-size:9.5px;color:var(--text-muted);line-height:1.5;">'
        +L('Real terrarium elevation, sculpted by you. Water is routed by priority-flood depression filling and downslope volume accounting — it answers where the water stands and which way it leaves, not how fast the front travels.',
           '実際の標高データを編集しています。水はプライオリティフラッド（窪地充填）と流下方向への体積集積で解いています。「どこに溜まり、どちらへ抜けるか」を答えるモデルで、波の到達速度は扱いません。',
           'Echte Höhendaten. Wasser über Priority-Flood und Volumenrouting — wo es steht und wohin es abfließt, nicht wie schnell die Front läuft.',
           'Реальные высоты. Вода — priority-flood и маршрутизация объёма: где стоит и куда уходит, но не скорость фронта.',
           'Elevación real. El agua se resuelve con priority-flood y enrutamiento de volumen: dónde queda y por dónde sale, no la velocidad del frente.')
        +'</div></div>';
      panel.querySelector('.tw-close').onclick=()=>close();
      panel.querySelectorAll('.tw-m').forEach(b=>b.onclick=()=>{ setMode(b.getAttribute('data-m')); });
      panel.querySelector('.tw-rain').onchange=e=>{ rainMm=Math.max(0,+e.target.value||0); solve(); };
      panel.querySelector('.tw-undo').onclick=()=>undo();
      panel.querySelector('.tw-refit').onclick=async()=>{ levees=[]; sources=[]; clearTrace(); setStat(''); if(await build()) solve(); };
      panel.querySelector('.tw-reset').onclick=()=>{ if(!G) return; sculpt=new Float32Array(G.NX*G.NY); levees=[]; sources=[]; rainMm=0; clearTrace();
        const r=panel.querySelector('.tw-rain'); if(r) r.value=0; undoStack=[]; solve(); };
      try{ makeDraggable(panel,panel.querySelector('.tw-head')); }catch(_){}
      syncMode(); renderParams();
      if(result) report();
    }
    function syncMode(){ if(!panel) return; panel.querySelectorAll('.tw-m').forEach(b=>{ const on=b.getAttribute('data-m')===mode;
      b.style.background=on?'var(--primary-color)':'var(--input-bg)'; b.style.color=on?'#fff':'var(--text-main)'; }); }
    function renderParams(){ if(!panel) return; const p=panel.querySelector('.tw-params'); if(!p) return;
      if(mode==='raise'||mode==='lower'){
        p.innerHTML='<label style="'+ROW+'">'+L('Brush radius (m)','ブラシ半径 (m)','Pinselradius (m)','Радиус кисти (м)','Radio (m)')+'<input class="tw-br" type="number" min="20" max="20000" step="50" value="'+brushM+'" style="'+NUM+'"></label>'
          +'<label style="'+ROW+'margin-top:6px;">'+L('Height per stroke (m)','1ストロークの高さ (m)','Höhe je Strich (m)','Высота за мазок (м)','Altura por trazo (m)')+'<input class="tw-bs" type="number" min="1" max="500" step="5" value="'+brushStrength+'" style="'+NUM+'"></label>';
        p.querySelector('.tw-br').onchange=e=>brushM=Math.max(20,+e.target.value||400);
        p.querySelector('.tw-bs').onchange=e=>brushStrength=Math.max(1,+e.target.value||20);
      } else if(mode==='levee'){
        p.innerHTML='<div style="font-size:11px;color:var(--text-muted);margin-bottom:5px;">'+L('Click along the line, double-click to finish.','線に沿ってクリック、ダブルクリックで確定。','Entlang der Linie klicken, Doppelklick beendet.','Кликайте по линии, двойной клик — конец.','Haga clic a lo largo; doble clic para terminar.')+'</div>'
          +'<label style="'+ROW+'">'+L('Crest above ground (m)','天端高 (地上, m)','Kronenhöhe (m)','Высота гребня (м)','Coronación (m)')+'<input class="tw-lc" type="number" min="1" max="300" step="1" value="'+leveeCrest+'" style="'+NUM+'"></label>'
          +'<label style="'+ROW+'margin-top:6px;">'+L('Width (m)','幅 (m)','Breite (m)','Ширина (м)','Ancho (m)')+'<input class="tw-lw" type="number" min="10" max="2000" step="10" value="'+leveeWidth+'" style="'+NUM+'"></label>';
        p.querySelector('.tw-lc').onchange=e=>leveeCrest=Math.max(1,+e.target.value||8);
        p.querySelector('.tw-lw').onchange=e=>leveeWidth=Math.max(10,+e.target.value||60);
      } else if(mode==='source'){
        p.innerHTML='<label style="'+ROW+'">'+L('Volume per click (m³)','1クリックの水量 (m³)','Volumen je Klick (m³)','Объём за клик (м³)','Volumen por clic (m³)')+'<input class="tw-sv" type="number" min="1" step="100000" value="'+srcM3+'" style="'+NUM+'"></label>';
        p.querySelector('.tw-sv').onchange=e=>srcM3=Math.max(1,+e.target.value||1e6);
      } else p.innerHTML='<div style="font-size:11px;color:var(--text-muted);">'+L('Drag the map normally. Pick a tool above to edit.','通常どおり地図を操作できます。編集は上のツールを選んでください。','Karte normal bewegen. Oben ein Werkzeug wählen.','Карта работает как обычно. Выберите инструмент выше.','Mueva el mapa normalmente. Elija una herramienta arriba.')+'</div>';
    }
    function setMode(m){ mode=m; drafting=null;
      try{ GE().render.canvas().style.cursor=(m==='pan')?'':'crosshair'; }catch(_){}
      try{ if(m==='raise'||m==='lower') GE().input.set('dragPan',false); else GE().input.set('dragPan',true); }catch(_){}
      syncMode(); renderParams(); draw(); }

    /* ---- map interaction -------------------------------------------------------------------------- */
    let painting=false, paintRaf=0;
    function onDown(e){ if(!opened||!G) return;
      if(mode==='raise'||mode==='lower'){
        /* (#R186) same trap as the water source: a brush stroke outside the rectangle painted nothing */
        if(!cellOf(e.lngLat.lng,e.lngLat.lat)){ rebuildAround(e.lngLat.lng,e.lngLat.lat).then(ok=>{ if(ok) solve(); }); return; }
        painting=true; pushUndo(); paintBrush(e.lngLat.lng,e.lngLat.lat,mode==='raise'?1:-1); schedule(); } }
    function onMove(e){ if(!painting) return; paintBrush(e.lngLat.lng,e.lngLat.lat,mode==='raise'?1:-1); schedule(); }
    function onUp(){ if(painting){ painting=false; solve(); } }
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
    async function rebuildAround(lng,lat){
      setStat(L('Moving the working area here…','作業範囲をここへ移動中…','Arbeitsbereich wird hierher verschoben…','Рабочая область переносится сюда…','Moviendo el área de trabajo…'));
      try{ GE().camera.easeTo({center:[lng,lat],duration:420}); }catch(_){}
      await new Promise(r=>setTimeout(r,520));
      return await build();
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
      if(!ok||!G){ setStat(L('The elevation data for this area could not be read — try another place or zoom out.',
                             'この範囲の標高データを読み込めませんでした。別の場所か、少し広い表示でお試しください。',
                             'Höhendaten für diesen Bereich nicht lesbar — anderer Ort oder herauszoomen.',
                             'Не удалось прочитать данные о рельефе — выберите другое место или уменьшите масштаб.',
                             'No se pudieron leer los datos de elevación — pruebe otro lugar o aleje el mapa.')); return; }
      sources.push({lng:p[0],lat:p[1],m3:srcM3}); solve(); traceDownstream(p[0],p[1]);
    }
    function onClick(e){ if(!opened) return;
      const lng=e.lngLat.lng, lat=e.lngLat.lat;
      if(!G){ if(mode==='source') onClickNoGrid(lng,lat); return; }
      if(mode==='levee'){ if(!drafting) drafting={pts:[],crest:leveeCrest,width:leveeWidth};
        drafting.pts.push([lng,lat]); draw(); }
      else if(mode==='source'){
        if(!inGrid(lng,lat)){ rebuildAround(lng,lat).then(ok=>{ if(!ok) return;
          sources.push({lng,lat,m3:srcM3}); solve(); traceDownstream(lng,lat); }); return; }
        sources.push({lng,lat,m3:srcM3}); solve();
        /* (#R186) …and follow it out of the rectangle: 「水は流れなくなる地点または海に到達した地点まで」 */
        traceDownstream(lng,lat);
      } }
    /* (#R174 recorded this: a double-click delivers TWO plain clicks first, so the last two vertices of
       a levee are the same point twice. Drop them, and stop MapLibre zooming on the same gesture. */
    function onDbl(e){ if(!opened) return;
      if(mode!=='levee'||!drafting) return;
      try{ e.preventDefault(); }catch(_){}
      const p=drafting.pts;
      while(p.length>2){ const a=p[p.length-1], b=p[p.length-2];
        if(Math.abs(a[0]-b[0])<1e-7&&Math.abs(a[1]-b[1])<1e-7) p.pop(); else break; }
      if(p.length>=2){ levees.push(drafting); drafting=null; solve(); }
      else { drafting=null; draw(); } }
    GE().events.on('mousedown',onDown); GE().events.on('mousemove',onMove); GE().events.on('mouseup',onUp);
    GE().events.on('touchstart',onDown); GE().events.on('touchmove',onMove); GE().events.on('touchend',onUp);
    GE().events.on('click',onClick); GE().events.on('dblclick',onDbl);

    /* ---- lifecycle -------------------------------------------------------------------------------- */
    async function open(o){
      if(!panel){ panel=document.createElement('div'); panel.id='tw-panel';
        panel.style.cssText='position:fixed;left:16px;top:80px;width:min(330px,92vw);z-index:1402;display:none;flex-direction:column;background:var(--popup-bg,#141414);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
        document.body.appendChild(panel); }
      panel.style.display='flex'; opened=true; render();
      if(o&&o.lng!=null){ try{ GE().camera.flyTo({center:[o.lng,o.lat],zoom:Math.max(GE().camera.getZoom(),11),duration:600}); }catch(_){}
        await new Promise(r=>setTimeout(r,750)); }
      if(!G||o&&o.refit){ if(await build()) solve(); } else solve();
      return true; }
    function clearTrace(){ traceSeq++; tracing=false; trace=null; }   /* (#R186) bumping the token aborts an in-flight trace */
    function close(){ opened=false; painting=false; drafting=null; clearTrace();
      try{ GE().input.set('dragPan',true); GE().render.canvas().style.cursor=''; }catch(_){}
      if(panel) panel.style.display='none'; wipe(); return true; }
    window.addEventListener('intmap-lang',()=>{ if(opened) render(); });

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
      setRain(mm){ rainMm=Math.max(0,+mm||0); const r=panel&&panel.querySelector('.tw-rain'); if(r) r.value=rainMm; return solve(); },
      addSource(lng,lat,m3){ sources.push({lng,lat,m3:Math.max(0,+m3||srcM3)}); const r=solve();
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
        lakes:trace.lakes.length, z:trace.z, from:trace.from, to:trace.to, info:trace.endInfo,
        tracing }:{ end:null, tracing }),
      clearTrace,
      addLevee(pts,crest,width){ if(!Array.isArray(pts)||pts.length<2) return false;
        levees.push({pts:pts.slice(),crest:Math.max(1,+crest||leveeCrest),width:Math.max(10,+width||leveeWidth)}); solve(); return true; },
      clearWater(){ sources=[]; rainMm=0; const r=panel&&panel.querySelector('.tw-rain'); if(r) r.value=0; return solve(); },
      state:()=>({ open:opened, mode, grid:G?{nx:G.NX,ny:G.NY,cellM:G.cellM,z:G.z,bbox:G.bbox}:null,
        levees:levees.length, sources:sources.length, rainMm, tracing,
        trace: trace?{ end:trace.end, km:trace.km, steps:trace.steps, lakes:trace.lakes.length, z:trace.z }:null,
        result: result?{ storedM3:result.storedM3, floodKm2:result.floodKm2, maxDepth:result.maxDepth,
          breaches:result.breaches.length, biggestOver:result.breaches[0]?result.breaches[0].over:0,
          depCount:result.depCount, biggest:result.biggest, totalIn:result.totalIn, solveMs:result.solveMs }:null }) };
  })();
};
