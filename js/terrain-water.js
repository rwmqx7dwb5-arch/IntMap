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
window.IntMapModules.terrainWater=function(map,HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ const m=window.__imap||map; return !!(m&&m.isStyleLoaded()); }catch(__){ return false; } } }
  const isMobile=HOST.isMobile, warmDEMTiles=HOST.warmDEMTiles, demElevBilinear=HOST.demElevBilinear,
        demElevAt=HOST.demElevAt, _demZoomForSpan=HOST._demZoomForSpan, makeDraggable=HOST.makeDraggable;

  window.IntMapTerrainWater=(function(){
    if(!map) return { open(){}, close(){}, state:()=>({open:false}) };
    const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
    const D=Math.PI/180, R_EARTH=6371008.8, CIRC=2*Math.PI*R_EARTH;
    const mX=lng=>(180+lng)/360;
    const mY=lat=>(180-(180/Math.PI)*Math.log(Math.tan(Math.PI/4+lat*D/2)))/360;
    const lngOf=x=>x*360-180;
    const latOf=y=>360/Math.PI*Math.atan(Math.exp((180-y*360)*D))-90;

    const IMG_TERR='tw-terr-src', LYR_TERR='tw-terr', IMG_WATER='tw-water-src', LYR_WATER='tw-water',
          VEC='tw-vec-src';

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
    function wipe(){ [[LYR_WATER,IMG_WATER],[LYR_TERR,IMG_TERR]].forEach(([l,s])=>{
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
        const NX=(typeof isMobile==='function'&&isMobile())?150:256;
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

      /* VOLUME ROUTING — reverse pop order is downstream order, so one sweep is enough. */
      const inflow=new Float64Array(N);       /* m³ arriving at each cell from upstream */
      const own=new Float64Array(N);          /* m³ generated on the cell itself */
      const rain=(rainMm/1000)*A;
      if(rain>0) for(let k=0;k<N;k++) own[k]=rain;
      sources.forEach(sc=>{ const c=cellOf(sc.lng,sc.lat); if(c) own[c.j*NX+c.i]+=Math.max(0,sc.m3); });
      const through=new Float64Array(N);
      for(let q=cnt-1;q>=0;q--){ const k=order[q]; const v=own[k]+inflow[k]; through[k]=v;
        const p=parent[k]; if(p>=0) inflow[p]+=v; }

      /* DEPRESSIONS — connected components of "filled above the ground". Each is filled with the water
         that actually arrived, by binary search on its own elevation-sorted prefix sums. */
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
        /* capacity(level) as a prefix sum over the sorted cells */
        const lev=new Float64Array(cells.length), cum=new Float64Array(cells.length);
        let acc=0; for(let q=0;q<cells.length;q++){ lev[q]=surf[cells[q]];
          if(q>0) acc+=q*(lev[q]-lev[q-1])*A; cum[q]=acc; }
        const capacity=acc+cells.length*(spill-lev[cells.length-1])*A;
        deps.push({ id, cells, lev, cum, spill, capacity, inflow:0, level:lev[0], outlet:-1, outDir:0 });
      }
      /* HOW MUCH WATER REACHES EACH DEPRESSION.
         Not "whatever passes through its outlet": a basin can have more than one cell whose drainage
         parent lies outside it (cells at the same spill level tie in the heap), and reading the flow at
         the first one found reported ZERO for a pit that had twenty million cubic metres dropped into
         it. The exact statement has no such ambiguity — everything generated inside the basin, plus
         everything the routing tree carries in from outside it. */
      const depOwn=new Float64Array(deps.length), depExt=new Float64Array(deps.length);
      for(let k=0;k<N;k++){
        const dk=depId[k]; if(dk>=0) depOwn[dk]+=own[k];
        const p=parent[k]; if(p<0) continue;
        const dp2=depId[p];
        if(dp2>=0&&dp2!==dk) depExt[dp2]+=through[k];        /* k is upstream of the basin, and outside it */
      }
      /* …and where it leaves from: of the cells that drain out, the one actually carrying the flow. */
      for(let k=0;k<N;k++){ const id=depId[k]; if(id<0) continue;
        const p=parent[k];
        if(p<0||depId[p]!==id){ const dp=deps[id];
          if(dp.outlet<0||through[k]>through[dp.outlet]){ dp.outlet=k; dp.outDir=p>=0?p:k; } } }
      deps.forEach(dp=>{ const vin=depOwn[dp.id]+depExt[dp.id];
        dp.inflow=vin;
        if(vin>=dp.capacity){ dp.level=dp.spill; dp.over=vin-dp.capacity; }
        else { /* binary search the level whose stored volume is `vin` */
          let lo=0, hi=dp.cells.length-1;
          while(lo<hi){ const mid=(lo+hi)>>1; if(dp.cum[mid]<vin) lo=mid+1; else hi=mid; }
          const q=lo; const below=q>0?dp.cum[q-1]:0; const nCells=Math.max(1,q);
          dp.level=Math.min(dp.spill,(q>0?dp.lev[q-1]:dp.lev[0])+(vin-below)/(nCells*A));
          dp.over=0; }
      });

      /* the answer, per cell */
      const depth=new Float32Array(N);
      let wetCells=0, storedM3=0, maxDepth=0;
      deps.forEach(dp=>{ dp.cells.forEach(c=>{ const d=dp.level-surf[c];
        if(d>0.02){ depth[c]=d; wetCells++; storedM3+=d*A; if(d>maxDepth) maxDepth=d; } }); });
      const breaches=deps.filter(d=>d.over>0&&d.outlet>=0)
        .sort((a,b)=>b.over-a.over).slice(0,12);
      const ms=(typeof performance!=='undefined'?performance.now():Date.now())-t0;
      const biggest=deps.slice().sort((a,b)=>b.capacity-a.capacity)[0]||null;
      result={ surf, filled, depth, through, parent, deps, breaches, wetCells, storedM3, maxDepth,
        floodKm2:wetCells*A/1e6, totalIn:(rainMm/1000)*A*N+sources.reduce((s,x)=>s+Math.max(0,x.m3),0),
        solveMs:Math.round(ms),
        /* diagnostics — the numbers to look at when the answer surprises you */
        depCount:deps.length, depId,
        biggest:biggest?{ cells:biggest.cells.length, capacity:biggest.capacity, inflow:biggest.inflow,
          level:biggest.level, spill:biggest.spill, over:biggest.over||0 }:null };
      draw();
      return result;
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

      /* 3 — levees, the line being drawn, water sources, and an arrow at every overtopping spill */
      const feats=[];
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
        +'<br><span style="opacity:0.72;">'+n(G.cellM)+' m '+L('cells','セル','Zellen','ячейки','celdas')+' · '+G.NX+'×'+G.NY+' · DEM z'+G.z+' · '+result.solveMs+' ms</span>'); }

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
      panel.querySelector('.tw-refit').onclick=async()=>{ levees=[]; sources=[]; setStat(''); if(await build()) solve(); };
      panel.querySelector('.tw-reset').onclick=()=>{ if(!G) return; sculpt=new Float32Array(G.NX*G.NY); levees=[]; sources=[]; rainMm=0;
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
      if(mode==='raise'||mode==='lower'){ painting=true; pushUndo(); paintBrush(e.lngLat.lng,e.lngLat.lat,mode==='raise'?1:-1); schedule(); } }
    function onMove(e){ if(!painting) return; paintBrush(e.lngLat.lng,e.lngLat.lat,mode==='raise'?1:-1); schedule(); }
    function onUp(){ if(painting){ painting=false; solve(); } }
    function schedule(){ if(paintRaf) return; paintRaf=requestAnimationFrame(()=>{ paintRaf=0; solve(); }); }
    function onClick(e){ if(!opened||!G) return;
      if(mode==='levee'){ if(!drafting) drafting={pts:[],crest:leveeCrest,width:leveeWidth};
        drafting.pts.push([e.lngLat.lng,e.lngLat.lat]); draw(); }
      else if(mode==='source'){ sources.push({lng:e.lngLat.lng,lat:e.lngLat.lat,m3:srcM3}); solve(); } }
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
    function close(){ opened=false; painting=false; drafting=null;
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
      addSource(lng,lat,m3){ sources.push({lng,lat,m3:Math.max(0,+m3||srcM3)}); return solve(); },
      addLevee(pts,crest,width){ if(!Array.isArray(pts)||pts.length<2) return false;
        levees.push({pts:pts.slice(),crest:Math.max(1,+crest||leveeCrest),width:Math.max(10,+width||leveeWidth)}); solve(); return true; },
      clearWater(){ sources=[]; rainMm=0; const r=panel&&panel.querySelector('.tw-rain'); if(r) r.value=0; return solve(); },
      state:()=>({ open:opened, mode, grid:G?{nx:G.NX,ny:G.NY,cellM:G.cellM,z:G.z}:null,
        levees:levees.length, sources:sources.length, rainMm,
        result: result?{ storedM3:result.storedM3, floodKm2:result.floodKm2, maxDepth:result.maxDepth,
          breaches:result.breaches.length, biggestOver:result.breaches[0]?result.breaches[0].over:0,
          depCount:result.depCount, biggest:result.biggest, totalIn:result.totalIn, solveMs:result.solveMs }:null }) };
  })();
};
