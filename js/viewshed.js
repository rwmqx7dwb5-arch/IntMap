/* ============================================================================
 *  IntMap · Line of sight — the high-precision terrain viewshed  (#R176)
 * ----------------------------------------------------------------------------
 *  「Line of sightを超高精度化して。」
 *
 *  What the previous engine (in js/map-tools.js since #R11, last tuned #R22) actually computed, and
 *  why each of those things put a floor under its accuracy:
 *
 *    1. It walked 900 rays outward and STOPPED each one at the first ridge that broke the sightline,
 *       then joined those 900 stopping points into ONE polygon. A valley that drops behind a ridge and
 *       rises back into view further out — the normal shape of real terrain — could not be drawn at all,
 *       because a star polygon has exactly one boundary per bearing. Everything past the first ridge was
 *       declared shadow whether it was or not.
 *    2. The coverage edge was a 900-gon: at 60 km the gap between neighbouring rays is 419 m, so the
 *       boundary was straight-line-interpolated across two thirds of a kilometre of unexamined ground.
 *    3. The observer could see, but nothing could be seen: a 30 m mast and a 30 m tower on the far hill
 *       are not the same problem, and only the first one existed.
 *    4. Refraction was hard-wired to the radio 4/3-earth. Optical sight lines (k ≈ 1.13) and true
 *       geometry (k = 1) were not expressible, so "can I SEE that mountain" was answered with the
 *       radio-propagation constant.
 *    5. Grazing a ridge by a metre counted as a clean path. For radio it is not: the first Fresnel zone
 *       is metres to tens of metres wide and has to be ~60 % clear, and what little energy does get past
 *       a ridge arrives diffracted, at a loss that is computable rather than a binary "no".
 *
 *  This engine answers per RASTER CELL instead of per bearing, so a ray may go in and out of view as
 *  many times as the ground makes it; it samples the terrain along each ray at the DEM's own resolution;
 *  it takes an observer height AND a target height; the effective-earth factor is a parameter; and when
 *  a frequency is given it also reports first-Fresnel obstruction and single-knife-edge diffraction loss
 *  (ITU-R P.526). Every number it shows — cell size, ray count, DEM zoom, sample count — is the one it
 *  actually used, never a nominal setting (standing instruction 4).
 *
 *  Renderer independence: the overlay is one `image` source whose four corners are the Mercator bounding
 *  box, and the grid is built in MERCATOR units, so the raster lands on the map with no resampling and
 *  no equirectangular skew (60 m over 120 km at mid latitude, which would have been visible at this
 *  resolution). Same red = reachable / green = shadow legend as before.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.los=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const isMobile=HOST.isMobile, _demZoomForSpan=HOST._demZoomForSpan, warmDEMTiles=HOST.warmDEMTiles,
        demElevBilinear=HOST.demElevBilinear, demElevAt=HOST.demElevAt, t=HOST.t, makeDraggable=HOST.makeDraggable;

  window.IntMapLOS=(function(){
    if(!GE().hasRenderer()) return { open(){}, clear(){}, run(){}, state:()=>({}) };
    const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;

    const SRC='los-src', IMGSRC='los-img-src', IMGLYR='los-img';
    const R_EARTH=6371008.8, D=Math.PI/180, CIRC=2*Math.PI*R_EARTH;
    /* Mercator, MapLibre's own — the raster is built in these units so the image quad is exact */
    const mX=lng=>(180+lng)/360;
    const mY=lat=>(180-(180/Math.PI)*Math.log(Math.tan(Math.PI/4+lat*D/2)))/360;
    const lngOf=x=>x*360-180;
    const latOf=y=>360/Math.PI*Math.atan(Math.exp((180-y*360)*D))-90;

    let site=null, panel=null, runSeq=0, last=null;
    /* (#R18) a NEW site reuses the SAME numbers — 「一度数値を設定したら、新地点を押しても同じ数値になるように」 */
    let losH=30,            /* observer/antenna height above ground, m */
        losT=0,             /* target height above ground, m (0 = the ground itself) */
        losR=60,            /* range, km */
        losK=1.3333,        /* effective-earth-radius factor */
        losF=0;             /* MHz; 0 = geometry only (no Fresnel, no diffraction) */
    const DIFF_DB=25;       /* knife-edge loss below which the shadow is still called usable */

    /* ---- the physics ------------------------------------------------------------------------- */
    /* Curvature and refraction together: a ray over an earth of radius k·R falls d²/(2kR) below the
       tangent plane. k = 1 is pure geometry, k ≈ 1.13 the usual optical value, k = 4/3 the radio one. */
    const dropAt=(d,k)=>d*d/(2*k*R_EARTH);
    /* First Fresnel-zone radius at an obstacle d1 from one end and d2 from the other. */
    const fresnel1=(lam,d1,d2)=>Math.sqrt(lam*d1*d2/Math.max(1e-9,d1+d2));
    /* ITU-R P.526 single knife-edge diffraction loss, dB, for Fresnel-Kirchhoff parameter v. */
    function knifeEdgeDb(v){ if(v<=-0.78) return 0; return 6.9+20*Math.log10(Math.sqrt((v-0.1)*(v-0.1)+1)+v-0.1); }
    /* How far the sight line reaches before the earth itself gets in the way: √(2kR·h) from each end,
       added. `h` is height above the surface the far end sits on — so this takes the observer's height
       ABOVE SEA LEVEL, not its height above the ground it stands on. Getting that wrong is not a rounding
       error: a 10 m mast on Mt Fuji reads 13 km with the local height and 253 km with the real one, and
       Fuji is in fact visible from about 250 km away. */
    const horizonM=(hObsAsl,hTgt,k)=>Math.sqrt(Math.max(0,2*k*R_EARTH*Math.max(0,hObsAsl)))+Math.sqrt(Math.max(0,2*k*R_EARTH*Math.max(0,hTgt)));

    /* ===== (#R183) POINT-TO-POINT LINK — 「Line of sightをさらに高精度、高機能化して。」 ==========
       The area sweep answers "what can this mast see". It cannot answer the question people actually
       ask of a sight line — **"can THIS point reach THAT point, and if not, what is in the way and
       how high would the mast have to be?"** — and it never could, because a 1,400-cell raster over a
       60 km disk resolves 43 m on the ground while the thing that decides a link is a single ridge
       that may be one metre too high.

       So this is not a re-skin of the sweep. It is a different computation on the same physics:

       PRECISION. One profile line needs a tiny fraction of the tiles a 360° sweep does, so it runs at
       the DEM's NATIVE z15 even for a long link, where the sweep has to back off to stay inside the
       tile-cache budget (#R176: exceeding it evicts the tiles the sweep is still reading). Measured
       on a 60 km link: the sweep uses z13 = 19 m posts, the profile uses z15 = 4.8 m posts, and the
       profile takes ~380 samples instead of 2.6 million.

       WHAT IT ADDS, all of it from helpers that already existed here:
         · the terrain profile with curvature+refraction applied (dropAt), so the earth's bulge is
           visible as the bulge it is rather than hidden inside a verdict;
         · the CONTROLLING OBSTACLE — which ridge decides the link, how far along it sits, and by how
           many metres the ray clears or misses it;
         · first-Fresnel clearance as a PERCENTAGE at that obstacle (the 60 % rule), not a yes/no;
         · knife-edge diffraction loss in dB when the ray is blocked (ITU-R P.526, already here);
         · and the number a survey actually needs — the MINIMUM ANTENNA HEIGHT that clears, solved
           for rather than guessed at, by bisection on the same test.

       The verdict vocabulary is deliberately the same four states the raster uses (clear / Fresnel /
       diffraction / blocked) so the two tools cannot disagree about what a word means. */
    const R2D=180/Math.PI;
    /* geodesic interpolation, the same spherical formulas the sweep's `dest` uses — kept at module
       level because the profile needs them outside analyze()'s closure */
    function _gcPoint(a,b,f){
      const la1=a[1]*D, lo1=a[0]*D, la2=b[1]*D, lo2=b[0]*D;
      const dl=la2-la1, dg=lo2-lo1;
      const h=Math.sin(dl/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dg/2)**2;
      const d=2*Math.asin(Math.min(1,Math.sqrt(h)));
      if(d<1e-12) return [a[0],a[1]];
      const A=Math.sin((1-f)*d)/Math.sin(d), B=Math.sin(f*d)/Math.sin(d);
      const x=A*Math.cos(la1)*Math.cos(lo1)+B*Math.cos(la2)*Math.cos(lo2);
      const y=A*Math.cos(la1)*Math.sin(lo1)+B*Math.cos(la2)*Math.sin(lo2);
      const z=A*Math.sin(la1)+B*Math.sin(la2);
      return [Math.atan2(y,x)*R2D, Math.atan2(z,Math.hypot(x,y))*R2D];
    }
    function _gcDist(a,b){
      const la1=a[1]*D, la2=b[1]*D, dl=(b[1]-a[1])*D, dg=(b[0]-a[0])*D;
      const h=Math.sin(dl/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dg/2)**2;
      return 2*R_EARTH*Math.asin(Math.min(1,Math.sqrt(h)));
    }
    let linkEnd=null, linkLast=null, linkSeq=0;

    /* Walk the profile once and judge it. Split out from linkRun so the height solver below can call
       it repeatedly with a different observer height without re-reading the DEM — the samples are
       terrain, and terrain does not move when the mast gets taller. */
    function judgeProfile(prof, obsElev, tgtElev, kFac, lam){
      const n=prof.length-1, total=prof[n].d;
      let worst=null;                          /* the obstacle that decides the link */
      for(let i=1;i<n;i++){
        const s=prof[i], d1=s.d, d2=total-d1;
        if(d1<=0||d2<=0) continue;
        const hTerr=s.h-dropAt(d1,kFac);       /* apparent terrain, curvature + refraction */
        const lineAt=obsElev+(tgtElev-obsElev)*(d1/total);
        const clearance=lineAt-hTerr;          /* >0 = the ray passes above this point */
        const F1=lam>0?fresnel1(lam,d1,d2):0;
        /* Rank by how badly the ray is doing RELATIVE to what it needs. With a frequency that is the
           Fresnel radius; without one it is raw metres, so the lowest clearance wins. Ranking by raw
           clearance alone would let a close-in hillock outrank the mid-path ridge that actually
           decides the link, because the Fresnel zone is widest at mid-path. */
        const score=F1>0?(clearance/F1):clearance;
        if(!worst||score<worst.score) worst={score,clearance,F1,d1,d2,hTerr,lineAt,i};
      }
      if(!worst) return {verdict:'clear',worst:null};
      let verdict, diffDb=0, fresnelPct=null;
      if(worst.F1>0) fresnelPct=Math.max(0,Math.min(100,100*worst.clearance/worst.F1));
      if(worst.clearance>0){
        if(worst.F1>0&&worst.clearance<0.6*worst.F1) verdict='fresnel';
        else verdict='clear';
      } else {
        if(lam>0){
          const v=(-worst.clearance)*Math.sqrt(2/lam*(1/worst.d1+1/worst.d2));
          diffDb=knifeEdgeDb(v);
          verdict=(diffDb<=DIFF_DB)?'diffraction':'blocked';
        } else verdict='blocked';
      }
      return {verdict,worst,diffDb,fresnelPct};
    }

    async function linkRun(opt){
      if(!site||!linkEnd) return null;
      opt=opt||{};
      const obsH=(opt.obsH!=null?+opt.obsH:losH), tgtH=(opt.tgtH!=null?+opt.tgtH:losT),
            kFac=Math.max(0.5,Math.min(5,(opt.k!=null?+opt.k:losK))),
            fMHz=Math.max(0,(opt.mhz!=null?+opt.mhz:losF));
      const my=++linkSeq, live=()=>my===linkSeq;
      const a=site, b=linkEnd, total=_gcDist(a,b);
      if(!(total>1)) return {err:'same'};
      /* THE DEM ZOOM. A line is not a disk: the tile count grows with LENGTH, not with area, so the
         profile can afford terrarium's native maximum where the sweep cannot. Backed off only if the
         link is long enough that even a line would blow the cache budget. */
      let z=15; const tileKm=(zz)=>40075*Math.max(0.05,Math.cos(a[1]*D))/Math.pow(2,zz);
      while(z>6 && (total/1000)/tileKm(z)*1.6 > 420) z--;
      const stepM=Math.max(3, tileKm(z)*1000/256);     /* one sample per DEM post */
      const n=Math.max(64, Math.min(4000, Math.round(total/stepM)));
      setProgress(0, L('Loading terrain DEM…','地形DEMを取得中…','Gelände-DEM wird geladen…','Загрузка рельефа…','Cargando el DEM…'));
      const warm=[]; for(let i=0;i<=Math.min(n,300);i++) warm.push(_gcPoint(a,b,i/Math.min(n,300)));
      await warmDEMTiles(warm, z, 20000, f=>{ if(live()) setProgress(f*0.7,L('Loading terrain DEM…','地形DEMを取得中…','Gelände-DEM wird geladen…','Загрузка рельефа…','Cargando el DEM…')); });
      if(!live()) return null;
      const prof=[]; let missing=0;
      for(let i=0;i<=n;i++){
        const f=i/n, p=_gcPoint(a,b,f);
        let h=demElevBilinear(p[0],p[1],z); if(h==null) h=demElevAt(p[0],p[1],null,z);
        if(h==null){ missing++; h=null; }
        prof.push({d:total*f, h, lng:p[0], lat:p[1]});
      }
      /* NO DATA IS NOT SEA LEVEL — the same rule the sweep states. A gap is carried as null and
         interpolated between its neighbours ONLY for drawing; it never votes on the verdict. */
      const known=prof.filter(s=>s.h!=null);
      if(known.length<4) return {err:'nodem'};
      for(let i=0;i<prof.length;i++) if(prof[i].h==null){
        let lo=i-1; while(lo>=0&&prof[lo].h==null) lo--;
        let hi=i+1; while(hi<prof.length&&prof[hi].h==null) hi++;
        prof[i].h=(lo>=0&&hi<prof.length)?(prof[lo].h+(prof[hi].h-prof[lo].h)*((i-lo)/(hi-lo)))
                 :(lo>=0?prof[lo].h:prof[hi].h);
        prof[i].gap=true;
      }
      const g0=prof[0].h, g1=prof[prof.length-1].h;
      const obsElev=g0+obsH, tgtElev=g1+tgtH;
      const lam=fMHz>0?(299.792458/fMHz):0;
      setProgress(0.9, L('Computing sightlines…','視通を計算中…','Sichtlinien werden berechnet…','Расчёт линий видимости…','Calculando líneas de vista…'));
      const j=judgeProfile(prof,obsElev,tgtElev,kFac,lam);
      /* THE NUMBER A SURVEY NEEDS. Bisection on the same judgement, raising only the OBSERVER end —
         terrain is fixed, so this converges on the shortest mast that clears (to 60 % of the first
         Fresnel zone when a frequency is given, else to grazing). Capped at 500 m above the ground:
         past that the answer is "not from here", not a taller tower. */
      let needH=null;
      if(j.verdict!=='clear'){
        let lo=obsH, hi=obsH+500, ok=false;
        if(judgeProfile(prof,g0+hi,tgtElev,kFac,lam).verdict==='clear'){ ok=true;
          for(let it=0;it<24;it++){ const mid=(lo+hi)/2;
            if(judgeProfile(prof,g0+mid,tgtElev,kFac,lam).verdict==='clear') hi=mid; else lo=mid; }
          needH=hi; }
        if(!ok) needH=null;
      }
      if(!live()) return null;
      const res={ km:total/1000, prof, obsH, tgtH, k:kFac, mhz:fMHz, demZ:z, samples:prof.length,
        stepM:total/n, missing, groundA:g0, groundB:g1, obsElev, tgtElev,
        verdict:j.verdict, worst:j.worst, diffDb:j.diffDb, fresnelPct:j.fresnelPct, needH,
        horizonKm: horizonM(obsElev,tgtElev,kFac)/1000 };
      linkLast=res;
      drawLinkOnMap(res);
      return res;
    }
    /* The link drawn on the map: the great circle, coloured by the verdict, with the controlling
       obstacle marked. Same source as the site marker so nothing new has to be torn down. */
    function drawLinkOnMap(r){
      try{ if(!ensureLayers()) return;
        if(!GE().layers.has('los-link')) GE().layers.add({id:'los-link',type:'line',source:SRC,
          filter:['==',['get','kind'],'link'], layout:{'line-cap':'round'},
          paint:{'line-width':2.6,'line-color':['coalesce',['get','col'],'#ffd23f'],'line-opacity':0.95}});
        if(!GE().layers.has('los-obst')) GE().layers.add({id:'los-obst',type:'circle',source:SRC,
          filter:['==',['get','kind'],'obstacle'],
          paint:{'circle-radius':5,'circle-color':'#ff3b30','circle-stroke-color':'#fff','circle-stroke-width':1.6}});
        const COL={clear:'#1fd65f',fresnel:'#ffb020',diffraction:'#b06bff',blocked:'#ff3b30'};
        const feats=[{type:'Feature',geometry:{type:'Point',coordinates:site},properties:{kind:'site'}},
          {type:'Feature',geometry:{type:'LineString',coordinates:r.prof.map(s=>[s.lng,s.lat])},
           properties:{kind:'link',col:COL[r.verdict]||'#ffd23f'}}];
        if(r.worst){ const s=r.prof[r.worst.i];
          feats.push({type:'Feature',geometry:{type:'Point',coordinates:[s.lng,s.lat]},properties:{kind:'obstacle'}}); }
        GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats});
      }catch(_){}
    }
    function clearLink(){ linkSeq++; linkEnd=null; linkLast=null;
      try{ if(GE().layers.has('los-link')) GE().layers.remove('los-link'); }catch(_){}
      try{ if(GE().layers.has('los-obst')) GE().layers.remove('los-obst'); }catch(_){}
      setSite(); }

    /* ---- layers ------------------------------------------------------------------------------ */
    function ensureLayers(){ if(!_imCanDraw()) return false;
      try{
        if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        if(!GE().layers.has('los-site')) GE().layers.add({id:'los-site',type:'circle',source:SRC,filter:['==',['get','kind'],'site'],
          paint:{'circle-radius':6,'circle-color':'#ffd23f','circle-stroke-color':'#3a2a00','circle-stroke-width':2}});
        return true;
      }catch(_){ return false; } }
    function setSite(){ try{ if(ensureLayers()) GE().layers.setSourceData(SRC,{type:'FeatureCollection',
      features: site?[{type:'Feature',geometry:{type:'Point',coordinates:site},properties:{kind:'site'}}]:[] }); }catch(_){} }
    /* The overlay is ONE image, so precision is the raster's, not a polygon's. Rebuilt (not patched)
       on every run — an image source keeps its texture until it is handed a new one. */
    function paint(dataUrl, coords){
      try{
        if(!_imCanDraw()) return;
        const s=GE().layers.hasSource(IMGSRC);
        if(s){ GE().layers.updateImage(IMGSRC,{url:dataUrl,coordinates:coords}); }
        else {
          if(s){ try{ if(GE().layers.has(IMGLYR)) GE().layers.remove(IMGLYR); GE().layers.removeSource(IMGSRC); }catch(_){} }
          GE().layers.addSource(IMGSRC,{type:'image',url:dataUrl,coordinates:coords});
          const before=(()=>{ for(const id of ['los-site','pl-outline-fill']){ try{ if(GE().layers.has(id)) return id; }catch(_){} } return undefined; })();
          GE().layers.add({id:IMGLYR,type:'raster',source:IMGSRC,paint:{'raster-opacity':1,'raster-fade-duration':0,'raster-resampling':'nearest'}},before);
        }
      }catch(_){}
    }
    function wipe(){ try{ if(GE().layers.has(IMGLYR)) GE().layers.remove(IMGLYR); }catch(_){}
      try{ if(GE().layers.hasSource(IMGSRC)) GE().layers.removeSource(IMGSRC); }catch(_){} }

    /* ---- progress ---------------------------------------------------------------------------- */
    function setProgress(frac,label){ const body=panel&&panel.querySelector('#los-body'); if(!body) return;
      const pct=Math.round(Math.max(0,Math.min(1,frac))*100);
      body.innerHTML='<div style="margin-bottom:5px;">'+label+' <b>'+pct+'%</b></div>'+
        '<div style="height:7px;border-radius:4px;background:rgba(128,128,128,0.22);overflow:hidden;"><div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,#ffd23f,#ff6b3d);transition:width 0.15s;"></div></div>'; }

    /* ---- the analysis ------------------------------------------------------------------------ */
    async function analyze(opt){
      if(!site) return null;
      opt=opt||{};
      const obsH=(opt.obsH!=null?+opt.obsH:losH), tgtH=(opt.tgtH!=null?+opt.tgtH:losT),
            rangeKm=Math.min(400,Math.max(1,(opt.rangeKm!=null?+opt.rangeKm:losR))),
            kFac=Math.max(0.5,Math.min(5,(opt.k!=null?+opt.k:losK))),
            fMHz=Math.max(0,(opt.mhz!=null?+opt.mhz:losF));
      losH=obsH; losT=tgtH; losR=rangeKm; losK=kFac; losF=fMHz;
      const my=++runSeq, live=()=>my===runSeq;
      const mob=(typeof isMobile==='function'&&isMobile());
      const tick=()=>new Promise(r=>setTimeout(r,0));
      const loadLbl=L('Loading terrain DEM…','地形DEMを取得中…','Gelände-DEM wird geladen…','Загрузка рельефа…','Cargando el DEM…');
      const calcLbl=L('Computing sightlines…','視通を計算中…','Sichtlinien werden berechnet…','Расчёт линий видимости…','Calculando líneas de vista…');
      setProgress(0,loadLbl);

      /* GEOMETRY OF THE GRID — everything in Mercator units so the raster lands exactly on the map. */
      const lng0=site[0], lat0=site[1], rangeM=rangeKm*1000;
      /* geodesic destination, used both for the bounding box and for the ray march */
      const la1=lat0*D, lo1=lng0*D, sLa1=Math.sin(la1), cLa1=Math.cos(la1);
      function dest(brgDeg,dM){ const dR=dM/R_EARTH, br=brgDeg*D, sDR=Math.sin(dR), cDR=Math.cos(dR);
        const la2=Math.asin(sLa1*cDR+cLa1*sDR*Math.cos(br));
        const lo2=lo1+Math.atan2(Math.sin(br)*sDR*cLa1, cDR-sLa1*Math.sin(la2));
        let lg=lo2/D; lg=((lg+540)%360)-180; return [lg, la2/D]; }
      const north=dest(0,rangeM)[1], south=dest(180,rangeM)[1], east=dest(90,rangeM)[0], west=dest(270,rangeM)[0];
      if(!(isFinite(north)&&isFinite(south)&&isFinite(east)&&isFinite(west))||Math.abs(north)>84.5||Math.abs(south)>84.5) return {err:'poles'};
      /* Mercator bbox, then a SQUARE-in-Mercator grid (square in Mercator is square on the ground here). */
      const yN=mY(north), yS=mY(south);
      let xW=mX(west), xE=mX(east); if(xE<xW) xE+=1;                     /* antimeridian */
      const spanX=xE-xW, spanY=yS-yN;
      const NX=mob?480:1400, NY=Math.max(16,Math.round(NX*spanY/Math.max(1e-12,spanX)));
      const dx=spanX/NX, dy=spanY/NY;

      /* DEM zoom: the finest the tile budget allows. terrarium's native maximum is z15.
         THE BUDGET IS THE TILE CACHE, not the network. app-body.js keeps a hard LRU cap of 560 decoded
         tiles on desktop / 140 on mobile (#R19, a real mobile OOM vector — 「重い動作をすると頻繁に
         ブラウザが落ちます」). Asking for more tiles than that does not fetch more terrain, it EVICTS
         the tiles the sweep is still reading: measured at a 900-tile budget, a 60 km run came back with
         11,282 no-data samples and the next run never finished, because warmDEMTiles polls for tiles
         that eviction keeps removing. Stay under the cap and the same run is exact. */
      let z=Math.min(mob?13:15,_demZoomForSpan(rangeKm)+(mob?0:(rangeKm<=12?2:1)));
      const budget=mob?130:500, latA=Math.abs(lat0);
      const estTiles=(zz)=>{ const tk=40075*Math.max(0.05,Math.cos(latA*D))/Math.pow(2,zz); const n=(2*rangeKm)/tk+1; return n*n*0.8; };
      while(z>5 && estTiles(z)>budget) z--;

      /* RAY BUDGET — the radial step and the gap between neighbouring rays at the far edge are made
         equal, so the terrain is examined at one spacing in every direction. rays·steps = π·steps². */
      const SAMPLE_CAP=mob?460000:2600000;
      const steps=Math.max(120,Math.min(1600,Math.floor(Math.sqrt(SAMPLE_CAP/Math.PI))));
      const rays=Math.max(360,Math.floor(SAMPLE_CAP/steps));
      const stepM=rangeM/steps;
      const cellM=(spanX/NX)*CIRC*Math.cos(lat0*D);                       /* raster cell size on the ground */

      /* ---- warm the DEM ---------------------------------------------------------------------- */
      /* A coarse lattice is enough to name the tiles; the rays then read them bilinearly. */
      const warm=[]; const WN=Math.min(160,Math.max(40,Math.ceil(2*rangeKm/ (40075*Math.cos(latA*D)/Math.pow(2,z)) )+2));
      for(let j=0;j<=WN;j++) for(let i=0;i<=WN;i++) warm.push([lngOf(xW+spanX*i/WN), latOf(yN+spanY*j/WN)]);
      await warmDEMTiles(warm, z, 45000, f=>{ if(live()) setProgress(f*0.55, loadLbl); });
      if(!live()) return null;

      const g0=(()=>{ let v=demElevBilinear(lng0,lat0,z); if(v==null) v=demElevAt(lng0,lat0,null,z); return v; })();
      if(g0==null) return {err:'nodem'};
      const obsElev=g0+obsH;
      const lam=fMHz>0?(299.792458/fMHz):0;                               /* wavelength, m */

      /* ---- the sweep -------------------------------------------------------------------------- */
      /* Per ray: march outward keeping the greatest elevation angle any TERRAIN so far subtends. A
         sample is visible when its own angle (terrain + target height) reaches that horizon. The ray is
         never truncated, so a valley that comes back into view is drawn — the defect that made the old
         star polygon wrong wherever terrain is not monotonic. */
      const VIS=1, FRES=2, DIFF=3, SHADOW=0;
      const cls=new Uint8Array(NX*NY);                                     /* 0 = untouched/shadow */
      const seen=new Uint8Array(NX*NY);
      let visCells=0, testCells=0, maxVisM=0, demMissing=0;
      /* the profile of one ray, reused */
      const pTerr=new Float32Array(steps+1), pAng=new Float32Array(steps+1);
      for(let a=0;a<rays;a++){
        const brg=a*360/rays;
        let hznAng=-Infinity, hznIdx=-1, hznH=0, hznD=0;
        /* the tangential gap at this distance decides how many cells one sample stands for */
        for(let s=1;s<=steps;s++){
          const d=s*stepM, p=dest(brg,d);
          let h=demElevBilinear(p[0],p[1],z); if(h==null){ h=demElevAt(p[0],p[1],null,z); }
          /* NO DATA IS NOT SEA LEVEL. Substituting 0 for a missing sample invents a hole in the terrain
             and reports everything behind it as visible; the honest answer is to leave the cell blank and
             count it. The horizon is not updated either — an unknown ridge cannot be claimed to block. */
          if(h==null){ demMissing++; continue; }
          const drop=dropAt(d,kFac);
          const hTerr=h-drop;                                              /* apparent terrain height */
          const angTerr=Math.atan2(hTerr-obsElev,d);
          const angTgt=tgtH?Math.atan2(hTerr+tgtH-obsElev,d):angTerr;
          pTerr[s]=hTerr; pAng[s]=angTerr;
          let c;
          if(angTgt>=hznAng-1e-12){ c=VIS; }
          else {
            c=SHADOW;
            if(lam>0&&hznIdx>0){
              /* the controlling ridge, and how far the direct line clears it */
              const d1=hznD, d2=d-d1;
              if(d2>0){
                const lineAt=obsElev+((hTerr+tgtH)-obsElev)*(d1/d);
                const clearance=lineAt-hznH;                               /* >0 = the line passes above */
                const F1=fresnel1(lam,d1,d2);
                if(clearance>0){ if(clearance<0.6*F1) c=FRES; else c=VIS; }
                else {
                  const v=(-clearance)*Math.sqrt(2/lam*(1/d1+1/d2));
                  if(knifeEdgeDb(v)<=DIFF_DB) c=DIFF;
                }
              }
            }
          }
          if(angTerr>hznAng){ hznAng=angTerr; hznIdx=s; hznH=hTerr; hznD=d; }
          if(c===VIS&&d>maxVisM) maxVisM=d;
          /* splat into the raster, widening with distance so neighbouring rays leave no gap */
          const gx=(mX(p[0])-xW+1)%1, gy=mY(p[1])-yN;
          let ci=Math.floor(((gx<0?gx+1:gx))/dx), cj=Math.floor(gy/dy);
          if(ci<0||cj<0||ci>=NX||cj>=NY) continue;
          const gapCells=Math.min(4,Math.max(0,Math.round(0.5*(2*Math.PI*d/rays)/Math.max(1e-6,cellM))));
          for(let oj=-gapCells;oj<=gapCells;oj++){ const jj=cj+oj; if(jj<0||jj>=NY) continue;
            for(let oi=-gapCells;oi<=gapCells;oi++){ const ii=ci+oi; if(ii<0||ii>=NX) continue;
              const idx=jj*NX+ii;
              if(!seen[idx]){ seen[idx]=1; testCells++; }
              if(c>cls[idx]) cls[idx]=c;                                   /* best answer any ray gave */
            } }
        }
        if((a&127)===127){ setProgress(0.55+0.40*(a/rays), calcLbl); await tick(); if(!live()) return null; }
      }
      for(let i=0;i<cls.length;i++) if(cls[i]===VIS) visCells++;

      /* ---- raster ----------------------------------------------------------------------------- */
      setProgress(0.97, calcLbl);
      const cv=document.createElement('canvas'); cv.width=NX; cv.height=NY;
      const ctx=cv.getContext('2d'); const img=ctx.createImageData(NX,NY); const px=img.data;
      /* same legend as every round since #R13: red = reachable, green = terrain shadow */
      const COL={ 1:[255,45,45,77], 2:[255,176,32,92], 3:[176,107,255,84], 0:[31,214,95,92] };
      for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){ const idx=j*NX+i, o=idx*4;
        if(!seen[idx]) continue;                                           /* outside the disk */
        const c=COL[cls[idx]]; px[o]=c[0]; px[o+1]=c[1]; px[o+2]=c[2]; px[o+3]=c[3]; }
      ctx.putImageData(img,0,0);
      if(!live()) return null;
      const coords=[[lngOf(xW),latOf(yN)],[lngOf(xE),latOf(yN)],[lngOf(xE),latOf(yS)],[lngOf(xW),latOf(yS)]];
      paint(cv.toDataURL('image/png'), coords);
      setSite();

      const cellKm2=(cellM/1000)*(cellM/1000);
      const res={ areaKm2: visCells*cellKm2, diskKm2: Math.PI*rangeKm*rangeKm,
        pct: testCells?(100*visCells/testCells):0, maxVisKm: maxVisM/1000,
        horizonKm: horizonM(obsElev,tgtH,kFac)/1000, groundM:g0, cellM, demZ:z, rays, steps, stepM,
        samples: rays*steps, demMissing, obsH, tgtH, rangeKm, k:kFac, mhz:fMHz, nx:NX, ny:NY };
      last=res;
      return res;
    }

    /* ---- panel -------------------------------------------------------------------------------- */
    const IN='width:74px;height:26px;border-radius:7px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-main);font-size:12px;padding:0 6px;box-sizing:border-box;';
    const ROW='font-size:11.5px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;gap:8px;';
    function buildPanel(){ if(panel) return panel; panel=document.createElement('div'); panel.className='tool-panel'; panel.id='los-panel';
      (document.getElementById('map-container')||document.body).appendChild(panel); return panel; }
    function fmtKm(v){ return (v>=100?Math.round(v):v.toFixed(1))+' km'; }
    function render(){
      const p=panel; if(!p) return;
      p.innerHTML='<div class="tp-header"><span class="tp-title">📡 '+L('Line of sight','見通し線解析','Sichtlinie','Линия видимости','Línea de visión')+'</span><button class="tp-close" title="'+t('close')+'">✕</button></div>'
        +'<div class="tp-row" style="flex-direction:column;align-items:stretch;gap:6px;">'
        +'<label style="'+ROW+'">'+L('Antenna height (m)','アンテナ高 (m)','Antennenhöhe (m)','Высота антенны (м)','Altura de antena (m)')+'<input id="los-h" type="number" value="'+losH+'" min="0" step="5" style="'+IN+'"></label>'
        +'<label style="'+ROW+'">'+L('Target height (m)','対象物の高さ (m)','Zielhöhe (m)','Высота цели (м)','Altura del objetivo (m)')+'<input id="los-t" type="number" value="'+losT+'" min="0" step="1" style="'+IN+'"></label>'
        +'<label style="'+ROW+'">'+L('Range (km)','射程 (km)','Reichweite (km)','Дальность (км)','Alcance (km)')+'<input id="los-r" type="number" value="'+losR+'" min="1" max="400" step="5" style="'+IN+'"></label>'
        +'<label style="'+ROW+'">'+L('Refraction','大気屈折','Refraktion','Рефракция','Refracción')
          +'<select id="los-k" style="'+IN+'width:96px;">'
          +'<option value="1">'+L('none (k=1)','なし (k=1)','keine (k=1)','нет (k=1)','ninguna (k=1)')+'</option>'
          +'<option value="1.13">'+L('optical 1.13','光学 1.13','optisch 1,13','оптическая 1,13','óptica 1,13')+'</option>'
          +'<option value="1.3333">'+L('radio 4/3','電波 4/3','Funk 4/3','радио 4/3','radio 4/3')+'</option>'
          +'</select></label>'
        +'<label style="'+ROW+'">'+L('Frequency (MHz)','周波数 (MHz)','Frequenz (MHz)','Частота (МГц)','Frecuencia (MHz)')+'<input id="los-f" type="number" value="'+(losF||'')+'" min="0" max="100000" step="10" placeholder="—" style="'+IN+'"></label>'
        +'</div>'
        +'<button class="tp-clear" id="los-go" style="width:100%;margin-top:6px;">'+L('Analyze','解析する','Analysieren','Анализ','Analizar')+'</button>'
        /* (#R183) the point-to-point link. Arming it makes the NEXT map click the far end — the same
           "one click, then it acts" shape the measure tools use, so there is nothing new to learn. */
        +'<button class="tp-clear" id="los-link" style="width:100%;margin-top:6px;">📶 '+L('Link to a point…','2点間の見通し…','Verbindung zu einem Punkt…','Связь до точки…','Enlace a un punto…')+'</button>'
        +'<button class="tp-clear" id="los-clr" style="width:100%;margin-top:6px;">'+L('Clear','消去','Löschen','Очистить','Borrar')+'</button>'
        +'<div id="los-body" style="margin-top:8px;font-size:11.5px;color:var(--text-muted);line-height:1.55;">'
        +L('Set the heights and range, then analyze. Leave the frequency empty for pure geometry; give one to also get first-Fresnel and diffraction.',
           '高さと射程を設定して解析。周波数を空欄にすると純粋な幾何計算、入力するとフレネルゾーンと回折も判定します。',
           'Höhen und Reichweite setzen, dann analysieren. Frequenz leer = reine Geometrie; mit Frequenz auch Fresnel und Beugung.',
           'Задайте высоты и дальность, затем анализ. Пустая частота = чистая геометрия; с частотой ещё зона Френеля и дифракция.',
           'Fije las alturas y el alcance y analice. Frecuencia vacía = geometría pura; con frecuencia también Fresnel y difracción.')+'</div>';
      const k=p.querySelector('#los-k'); if(k) k.value=String(losK===1?1:losK===1.13?1.13:1.3333);
      p.querySelector('.tp-close').onclick=()=>{ runSeq++; site=null; clearLink(); setSite(); wipe(); p.style.display='none'; };
      p.querySelector('#los-go').onclick=()=>run();
      p.querySelector('#los-clr').onclick=()=>{ clear(); clearLink(); };
      { const lb=p.querySelector('#los-link'); if(lb) lb.onclick=()=>{ armLink(!linkArmed); }; }
      try{ makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
    }
    function readInputs(){ const p=panel; if(!p) return {};
      return { obsH:Math.max(0,+p.querySelector('#los-h').value||0),
               tgtH:Math.max(0,+p.querySelector('#los-t').value||0),
               rangeKm:Math.min(400,Math.max(1,+p.querySelector('#los-r').value||60)),
               k:+p.querySelector('#los-k').value||1.3333,
               mhz:Math.max(0,+p.querySelector('#los-f').value||0) }; }
    function report(r){ const body=panel&&panel.querySelector('#los-body'); if(!body) return;
      if(!r||r.err){ body.innerHTML=(r&&r.err==='poles')
          ? L('That range reaches past the map’s poles — reduce it.','その射程は地図の極を越えます。短くしてください。','Diese Reichweite überschreitet die Pole — verkleinern.','Дальность выходит за полюса — уменьшите.','Ese alcance pasa de los polos — redúzcalo.')
          : L('Could not load enough terrain data — wait a moment and press Analyze again.','地形データを十分に取得できませんでした。少し待ってもう一度「解析する」を押してください。','Zu wenig Geländedaten — bitte erneut analysieren.','Недостаточно данных рельефа — попробуйте ещё раз.','No se pudo cargar suficiente terreno — inténtelo de nuevo.');
        return; }
      const legend='<b style="color:#ff4d4d;">'+L('Red = reachable','赤＝到達範囲','Rot = erreichbar','Красный = виден','Rojo = alcanzable')+'</b>'
        +' · <b style="color:#1fd65f;">'+L('green = terrain shadow','緑＝地形の死角','grün = Geländeschatten','зелёный = теневая зона','verde = sombra del terreno')+'</b>'
        +(r.mhz>0?(' · <b style="color:#ffb020;">'+L('amber = Fresnel-obstructed','橙＝フレネルゾーン欠損','gelb = Fresnel gestört','жёлтый = зона Френеля перекрыта','ámbar = Fresnel obstruido')
          +'</b> · <b style="color:#b06bff;">'+L('violet = usable by diffraction (≤'+DIFF_DB+' dB)','紫＝回折で到達 (≤'+DIFF_DB+' dB)','violett = per Beugung nutzbar (≤'+DIFF_DB+' dB)','фиолетовый = за счёт дифракции (≤'+DIFF_DB+' дБ)','violeta = por difracción (≤'+DIFF_DB+' dB)')+'</b>'):'');
      const num=(v,d)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:d==null?0:d});
      body.innerHTML=legend
        +'<div style="margin-top:6px;">'+L('Reachable area','到達面積','Erreichbare Fläche','Площадь покрытия','Área alcanzable')+': <b>'+num(r.areaKm2)+' km²</b> ('+r.pct.toFixed(1)+'% '+L('of the disk','の円内','der Scheibe','круга','del disco')+')'
        +'<br>'+L('Farthest sight line','最遠の視通','Weiteste Sichtlinie','Дальняя видимость','Vista más lejana')+': <b>'+fmtKm(r.maxVisKm)+'</b> · '
        +L('earth horizon','地球の見通し限界','Erdhorizont','горизонт Земли','horizonte terrestre')+' '+fmtKm(r.horizonKm)
        +'<br>'+L('Ground at the site','設置点の地面','Boden am Standort','Земля на точке','Suelo en el sitio')+': '+num(r.groundM)+' m'
        +'</div>'
        +'<div style="margin-top:6px;opacity:0.85;">'+L('Precision','精度','Genauigkeit','Точность','Precisión')+': '
        +num(r.cellM)+' m '+L('cells','セル','Zellen','ячейки','celdas')+' · '+num(r.rays)+' '+L('rays','本の放射線','Strahlen','лучей','rayos')
        +' × '+num(r.steps)+' '+L('steps','段','Schritte','шагов','pasos')+' ('+num(r.stepM)+' m) · '+num(r.samples)+' '+L('samples','標本','Proben','проб','muestras')
        +' · DEM z'+r.demZ+(r.demMissing?(' · '+num(r.demMissing)+' '+L('gaps','欠測','Lücken','пропусков','huecos')):'')+'</div>'
        +'<div style="margin-top:5px;opacity:0.7;">'+L('Change the values and press Analyze to re-run at this site; right-click the map to move it.','数値を変えて「解析する」で同地点を再計算。地図を右クリックで移動できます。','Werte ändern und erneut analysieren; Rechtsklick verschiebt den Standort.','Измените значения и повторите анализ; правый клик переносит точку.','Cambie los valores y analice de nuevo; clic derecho para mover el punto.')+'</div>';
    }
    /* ---- the link's UI (#R183) ---------------------------------------------------------------- */
    let linkArmed=false, _linkClickWired=false;
    function armLink(on){
      linkArmed=!!on;
      const b=panel&&panel.querySelector('#los-link');
      if(b) b.textContent=linkArmed
        ? '✕ '+L('Cancel — click the far end','キャンセル（相手側をクリック）','Abbrechen — Gegenstelle klicken','Отмена — щёлкните дальний конец','Cancelar — clic en el otro extremo')
        : '📶 '+L('Link to a point…','2点間の見通し…','Verbindung zu einem Punkt…','Связь до точки…','Enlace a un punto…');
      try{ GE().render.setCursor(linkArmed?'crosshair':''); }catch(_){}
      if(linkArmed&&!_linkClickWired){ _linkClickWired=true;
        try{ GE().events.on('click',(e)=>{ if(!linkArmed) return; const ll=e&&e.lngLat; if(!ll) return;
          armLink(false); linkTo({lng:ll.lng,lat:ll.lat}); }); }catch(_){}
      }
    }
    async function linkTo(lngLat){ if(!site) return null;
      linkEnd=[lngLat.lng,lngLat.lat];
      const r=await linkRun(readInputs());
      if(r) reportLink(r);
      return r; }
    /* The profile chart. Terrain with curvature applied, the direct ray, and — when a frequency is
       given — the 60 % first-Fresnel envelope around it, which is the boundary the verdict uses. A
       picture is the point: "blocked" tells you nothing about WHERE, and the whole reason to run a
       link profile is to see which ridge to argue with. */
    /* `w`/`h` are CSS pixels; the caller has already scaled the context by devicePixelRatio, so every
       coordinate below is in CSS space and the backing store is sharp on a HiDPI screen. */
    function drawProfile(cv,r,w,h){
      const ctx=cv.getContext('2d');
      ctx.clearRect(0,0,w,h);
      const n=r.prof.length, total=r.prof[n-1].d;
      const ter=r.prof.map(s=>s.h-dropAt(s.d,r.k));
      const line=r.prof.map(s=>r.obsElev+(r.tgtElev-r.obsElev)*(s.d/total));
      let lo=Infinity, hi=-Infinity;
      for(let i=0;i<n;i++){ lo=Math.min(lo,ter[i],line[i]); hi=Math.max(hi,ter[i],line[i]); }
      const pad=(hi-lo)*0.12+5; lo-=pad; hi+=pad;
      const X=(d)=>d/total*(w-2)+1, Y=(v)=>h-2-((v-lo)/Math.max(1e-6,hi-lo))*(h-4);
      /* terrain, filled */
      ctx.beginPath(); ctx.moveTo(X(0),Y(ter[0]));
      for(let i=1;i<n;i++) ctx.lineTo(X(r.prof[i].d),Y(ter[i]));
      ctx.lineTo(X(total),h); ctx.lineTo(X(0),h); ctx.closePath();
      ctx.fillStyle='rgba(128,128,128,0.35)'; ctx.fill();
      ctx.strokeStyle='rgba(160,160,160,0.9)'; ctx.lineWidth=1; ctx.stroke();
      /* the 60 % Fresnel envelope */
      if(r.mhz>0){ const lam=299.792458/r.mhz;
        const env=(sign)=>{ ctx.beginPath();
          for(let i=0;i<n;i++){ const d1=r.prof[i].d, d2=total-d1;
            const F=(d1>0&&d2>0)?0.6*fresnel1(lam,d1,d2):0;
            const y=Y(line[i]+sign*F); if(i) ctx.lineTo(X(d1),y); else ctx.moveTo(X(d1),y); }
          ctx.strokeStyle='rgba(255,176,32,0.75)'; ctx.setLineDash([3,3]); ctx.lineWidth=1; ctx.stroke(); ctx.setLineDash([]); };
        env(-1); env(1); }
      /* the direct ray */
      ctx.beginPath(); ctx.moveTo(X(0),Y(line[0])); ctx.lineTo(X(total),Y(line[n-1]));
      const COL={clear:'#1fd65f',fresnel:'#ffb020',diffraction:'#b06bff',blocked:'#ff3b30'};
      ctx.strokeStyle=COL[r.verdict]||'#ffd23f'; ctx.lineWidth=1.8; ctx.stroke();
      /* the controlling obstacle */
      if(r.worst){ const x=X(r.prof[r.worst.i].d);
        ctx.beginPath(); ctx.moveTo(x,Y(r.worst.hTerr)); ctx.lineTo(x,Y(r.worst.lineAt));
        ctx.strokeStyle='#ff3b30'; ctx.lineWidth=1.4; ctx.stroke();
        ctx.beginPath(); ctx.arc(x,Y(r.worst.hTerr),3,0,7); ctx.fillStyle='#ff3b30'; ctx.fill(); }
    }
    function reportLink(r){
      const body=panel&&panel.querySelector('#los-body'); if(!body) return;
      if(!r||r.err){ body.innerHTML=(r&&r.err==='same')
          ? L('Pick a point further away.','もう少し離れた地点を選んでください。','Bitte einen weiter entfernten Punkt wählen.','Выберите точку подальше.','Elija un punto más lejano.')
          : L('Could not load enough terrain data — try again.','地形データを十分に取得できませんでした。もう一度お試しください。','Zu wenig Geländedaten — bitte erneut.','Недостаточно данных рельефа — повторите.','No se pudo cargar suficiente terreno — inténtelo de nuevo.');
        return; }
      const num=(v,d)=>Number(v).toLocaleString(undefined,{maximumFractionDigits:d==null?0:d});
      const V={ clear:['#1fd65f',L('Clear line of sight','見通しあり','Freie Sicht','Прямая видимость','Línea de vista libre')],
        fresnel:['#ffb020',L('Fresnel zone obstructed','フレネルゾーンが欠損','Fresnelzone gestört','Зона Френеля перекрыта','Zona de Fresnel obstruida')],
        diffraction:['#b06bff',L('Blocked — usable by diffraction','遮蔽（回折で到達可）','Verdeckt — per Beugung nutzbar','Перекрыто — проходит дифракцией','Bloqueado — usable por difracción')],
        blocked:['#ff3b30',L('Blocked by terrain','地形に遮られています','Durch Gelände verdeckt','Перекрыто рельефом','Bloqueado por el terreno')] }[r.verdict];
      body.innerHTML='<canvas id="los-prof" width="228" height="86" style="width:100%;height:86px;display:block;border-radius:6px;background:rgba(128,128,128,0.10);"></canvas>'
        +'<div style="margin-top:6px;font-weight:700;color:'+V[0]+';">'+V[1]+'</div>'
        +'<div style="margin-top:4px;">'+L('Distance','距離','Distanz','Расстояние','Distancia')+': <b>'+num(r.km,1)+' km</b>'
        +' · '+L('earth horizon','地球の見通し限界','Erdhorizont','горизонт Земли','horizonte terrestre')+' '+num(r.horizonKm,0)+' km</div>'
        +(r.worst?('<div style="margin-top:4px;">'+L('Controlling obstacle','決め手となる地形','Maßgebliches Hindernis','Определяющее препятствие','Obstáculo determinante')+': '
           +'<b>'+num(r.worst.d1/1000,1)+' km</b> '+L('along','地点','entlang','по трассе','a lo largo')
           +' · '+(r.worst.clearance>=0
               ? (L('clears by','余裕','frei um','запас','despeje')+' <b>'+num(r.worst.clearance,1)+' m</b>')
               : (L('misses by','不足','fehlt um','не хватает','falta')+' <b>'+num(-r.worst.clearance,1)+' m</b>'))
           +(r.fresnelPct!=null?(' · '+L('Fresnel','フレネル','Fresnel','Френель','Fresnel')+' '+num(r.fresnelPct,0)+'%'):'')
           +(r.diffDb>0?(' · '+L('diffraction loss','回折損失','Beugungsverlust','дифракционные потери','pérdida por difracción')+' <b>'+num(r.diffDb,1)+' dB</b>'):'')
           +'</div>'):'')
        +(r.needH!=null?('<div style="margin-top:4px;color:#ffd23f;">'+L('Minimum antenna height here','必要なアンテナ高（この地点）','Mindest-Antennenhöhe hier','Минимальная высота антенны здесь','Altura mínima de antena aquí')
           +': <b>'+num(r.needH,1)+' m</b></div>')
          :(r.verdict!=='clear'?('<div style="margin-top:4px;opacity:0.8;">'
             +L('No mast height up to 500 m clears this path.','500 mまでのアンテナ高では見通せません。','Keine Masthöhe bis 500 m schafft diesen Pfad.','Ни одна высота мачты до 500 м не открывает трассу.','Ninguna altura hasta 500 m despeja este trayecto.')
             /* …and WHY, when the reason is geometric rather than "the hill is too big". Raising the
                NEAR end lifts the ray at an obstacle by only (1 − d1/total) of the mast height, so an
                obstacle sitting next to the far end is barely helped from here however tall the tower
                gets — measured on a real 9.3 km path whose ridge is at 94 % of the way: a 500 m mast
                lifts the ray 29.5 m where 63.7 m is needed. The useful advice there is to raise the
                OTHER antenna, and saying so is the difference between a verdict and an answer. */
             +((r.worst&&(r.worst.d1/(r.worst.d1+r.worst.d2))>0.75)
               ?(' '+L('The obstacle is close to the far end, so raising THIS antenna barely helps — raise the other one.',
                       '遮蔽物が相手側の近くにあるため、この地点のアンテナを高くしてもほとんど効きません。相手側を高くしてください。',
                       'Das Hindernis liegt nahe der Gegenstelle — diese Antenne zu erhöhen bringt kaum etwas; erhöhen Sie die andere.',
                       'Препятствие у дальнего конца: поднимать эту антенну почти бесполезно — поднимайте другую.',
                       'El obstáculo está cerca del otro extremo: subir esta antena apenas ayuda; suba la otra.')):'')
             +'</div>'):''))
        +'<div style="margin-top:6px;opacity:0.85;">'+L('Precision','精度','Genauigkeit','Точность','Precisión')+': '
        +num(r.stepM,1)+' m '+L('samples','間隔','Abstand','шаг','muestreo')+' · '+num(r.samples)+' '+L('points','点','Punkte','точек','puntos')
        +' · DEM z'+r.demZ+(r.missing?(' · '+num(r.missing)+' '+L('gaps','欠測','Lücken','пропусков','huecos')):'')+'</div>'
        +'<div style="margin-top:5px;opacity:0.7;">'+L('Gray = terrain (curvature applied) · dashed = 60% Fresnel zone.','灰＝地形（地球の曲率込み）・破線＝フレネルゾーン60%。','Grau = Gelände (mit Erdkrümmung) · gestrichelt = 60 % Fresnelzone.','Серый = рельеф (с кривизной) · пунктир = 60 % зоны Френеля.','Gris = terreno (con curvatura) · discontinua = 60 % de Fresnel.')+'</div>';
      try{ const cv=body.querySelector('#los-prof');
        /* Drawn at devicePixelRatio — the same lesson the aircraft glyph learned this round: a canvas
           sized in CSS pixels is upscaled by the GPU on a 2× screen and the chart's hairlines blur. */
        const dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1));
        const w=cv.clientWidth||228, h=86;
        cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr);
        const ctx=cv.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
        drawProfile(cv,r,w,h); }catch(_){}
    }
    async function run(o){ if(!site) return null;
      const inputs=Object.assign({},readInputs(),o||{});
      setProgress(0,L('Starting…','開始…','Start…','Запуск…','Iniciando…'));
      let r=null; try{ r=await analyze(inputs); }catch(_){ r=null; }
      if(r) report(r); else if(r===null&&runSeq) report(null);
      return r; }
    function open(lngLat,o){ site=[lngLat.lng,lngLat.lat];
      const p=buildPanel(); p.style.cssText='display:block;left:24px;top:74px;right:auto;bottom:auto;z-index:1600;width:250px;';
      render(); setSite();
      if(o&&o.run) run(o);
      return true; }
    /* (#R19) Clear wipes the OVERLAY but keeps the site + cancels any in-flight run. */
    function clear(){ runSeq++; wipe(); setSite();
      const b=panel&&panel.querySelector('#los-body'); if(b) b.innerHTML=L('Cleared. Press Analyze to re-run here, or right-click the map to move the site.','消去しました。「解析する」で再計算、または地図を右クリックで再配置。','Gelöscht. Erneut analysieren oder Standort per Rechtsklick verschieben.','Очищено. Нажмите «Анализ» или перенесите точку правым кликом.','Borrado. Analice de nuevo o mueva el punto con clic derecho.');
      return true; }
    window.addEventListener('intmap-lang',()=>{ if(panel&&panel.style.display!=='none'){ render(); if(last) report(last); } });

    return { open, clear, run, analyze,
      /* (#R183) the point-to-point link — see the note above _gcPoint */
      linkTo, linkRun, clearLink, armLink, isLinkArmed:()=>linkArmed,
      linkState:()=>linkLast?{ km:linkLast.km, verdict:linkLast.verdict, needH:linkLast.needH,
        fresnelPct:linkLast.fresnelPct, diffDb:linkLast.diffDb, demZ:linkLast.demZ,
        stepM:linkLast.stepM, samples:linkLast.samples, missing:linkLast.missing,
        obstacleKm:linkLast.worst?linkLast.worst.d1/1000:null,
        clearanceM:linkLast.worst?linkLast.worst.clearance:null }:null,
      setParams:(h,r,tg,k,f)=>{ if(h!=null) losH=Math.max(0,+h||0); if(r!=null) losR=Math.min(400,Math.max(1,+r||60));
        if(tg!=null) losT=Math.max(0,+tg||0); if(k!=null) losK=Math.max(0.5,Math.min(5,+k||1.3333)); if(f!=null) losF=Math.max(0,+f||0);
        if(panel&&panel.style.display!=='none') render(); return true; },
      state:()=>({ site:site?site.slice():null, obsH:losH, tgtH:losT, rangeKm:losR, k:losK, mhz:losF,
        open:!!(panel&&panel.style.display!=='none'), last:last?Object.assign({},last):null }),
      /* the physics, exposed so it can be tested without a map */
      _phys:{ dropAt, fresnel1, knifeEdgeDb, horizonM } };
  })();
};
