/* ============================================================================
 *  IntMap · THE COASTLINE AT THE RESOLUTION YOU ASK FOR — window.IntMapCoastMask  (#R215)
 * ----------------------------------------------------------------------------
 *  「海抜0m以下の土地は震源分布の対象外にされるのを辞めろ。（なんか、海外線の境界部分が雑な処理に
 *    なっている。大きなタイルでごまかすな。）」
 *
 *  The first half of that sentence was answered in #R212: a cell below sea level is not a cell in
 *  the sea (the Jordan Rift, a quarter of the Netherlands, the Caspian Depression, Death Valley,
 *  Turfan, the Qattara), and reading the elevation's SIGN as the land/sea answer deleted every one
 *  of them from the intensity map. What that fix reached for instead was js/land-mask.js — a
 *  bundled 2048 × 1024 raster, **19.5 km a pixel, majority-filled**. That is the 大きなタイル.
 *
 *  ⚠ AND IT IS COARSER THAN THE THING IT IS DECIDING FOR. The seismic fine field is 1.5 km a cell
 *  (#R205: measured 1.55 km for an M8.5 at the 1,792 ceiling). Asking a 19.5 km majority raster
 *  where the coast is therefore quantises the coastline to THIRTEEN TIMES the field's own grain:
 *  a bay narrower than 19.5 km is painted as land, a peninsula narrower than that is dropped into
 *  the sea, and the boundary is a visible staircase of 19.5 km blocks. Both errors show up exactly
 *  where people live.
 *
 *  ══ WHAT THIS USES INSTEAD ═════════════════════════════════════════════════════════════════════
 *  The coastline the app already draws: `HOST.countryGeo`, Natural Earth **1:10 m** country
 *  polygons — 「いつもの国境線」, the same geometry js/countries-ui.js hands the choropleths, already
 *  fetched by the time any of this runs. A country polygon's outer boundary IS the coast, so no new
 *  download, no new source to attribute, and no second copy of "where is the land" (#R136).
 *
 *  It is rasterised INTO THE CALLER'S OWN GRID rather than into a fixed one. `rasterize()` takes the
 *  same (west, y0, dx, dy, N) the field is built on and fills the polygons through that transform,
 *  so the answer's resolution is the field's resolution, whatever that happens to be. At 1,792 cells
 *  over 2,771 km that is 1.55 km — thirteen times finer than the raster it replaces, and limited
 *  from then on by Natural Earth's own ~1 km vertex spacing rather than by this app.
 *
 *  ⚠ IT IS NOT A REPLACEMENT FOR js/land-mask.js. That module answers a POINT anywhere on Earth with
 *  no country geometry loaded and no network, which is what the 52 km far field and the tide layer
 *  need; it stays exactly as it is and is the fallback here. This module answers a GRID, finely, and
 *  says which of the two answered (`source`) so a caller can report it rather than imply it.
 *
 *  ⚠ HOLES ARE HOLES. Country polygons are drawn with the even-odd rule, so an interior ring — the
 *  Caspian in Kazakhstan's outline, Lesotho inside South Africa — is a hole in the fill and comes
 *  back as sea. Lesotho being "sea" is wrong and is why enclaves are unioned in first: every ring of
 *  every country is drawn into ONE path in a single fill, so a neighbour's land closes the other's
 *  hole. What remains as holes are the rings no country covers, which are lakes.
 * ==========================================================================*/
window.IntMapCoastMask=(function(){
  'use strict';
  const D=Math.PI/180;
  const mY=(lat)=>(180-(180/Math.PI)*Math.log(Math.tan(Math.PI/4+Math.max(-85.05,Math.min(85.05,lat))*D/2)))/360;

  /* `window.countryGeo` is js/countries-ui.js's own publication of the outline it holds — the same
     object the `countries` source is built from, at whichever resolution has arrived (110 m at boot,
     10 m once the idle upgrade lands, #R195). It is asked for by name rather than kept, so a caller
     that runs after the upgrade gets the upgraded geometry. */
  function geo(){ try{ const g=window.countryGeo; if(g&&g.features&&g.features.length) return g; }catch(_){}
    return null; }

  /* Every ring of every polygon, as flat [lng,lat,…] runs. Built once per geometry object and cached
     on it, because a field rebuild at a new magnitude asks for the same 548,000 vertices again. */
  function rings(g){
    if(g.__imRings) return g.__imRings;
    const out=[];
    (g.features||[]).forEach(f=>{ const gm=f&&f.geometry; if(!gm) return;
      const polys=(gm.type==='Polygon')?[gm.coordinates]:(gm.type==='MultiPolygon')?gm.coordinates:null;
      if(!polys) return;
      polys.forEach(p=>p.forEach(r=>{ if(r&&r.length>2) out.push(r); })); });
    try{ Object.defineProperty(g,'__imRings',{value:out,enumerable:false}); }catch(_){ g.__imRings=out; }
    return out; }
  /* ══ ⚠ (#R223) EVERY RING'S BOX, ONCE — THIS RASTERISE WAS 3 SECONDS ══════════════════════════════
     「地震と津波シミュレータの計算速度を爆速にして。ただし品質は一切落とさないように。」
     MEASURED on the shipped build: `rasterize()` at N=640 over Japan takes **2,966 ms**, and it is
     the single largest block left in an intensity build after the tile fetch. The reason is that it
     walks 548,000 vertices of 1:10 m country outline — every ring on Earth — into a canvas path,
     for a window that usually sees a handful of countries.
     A ring whose bounding box does not meet the window cannot put ink in it (if the box misses the
     window, the window is wholly outside the box and therefore wholly outside the ring), so skipping
     it is EXACT rather than an approximation — the even-odd fill sees the same set of edges over the
     window either way. The boxes are computed once per geometry object and cached beside the rings,
     because a field rebuild at a new magnitude asks the same question again. */
  function boxes(g){
    if(g.__imRingBox) return g.__imRingBox;
    const R=rings(g), b=new Float64Array(R.length*4);
    for(let i=0;i<R.length;i++){ const r=R[i];
      let w=Infinity,e=-Infinity,s=Infinity,n=-Infinity;
      for(let k=0;k<r.length;k++){ const c=r[k], x=c[0], y=c[1];
        if(x<w)w=x; if(x>e)e=x; if(y<s)s=y; if(y>n)n=y; }
      b[i*4]=w; b[i*4+1]=e; b[i*4+2]=s; b[i*4+3]=n; }
    try{ Object.defineProperty(g,'__imRingBox',{value:b,enumerable:false}); }catch(_){ g.__imRingBox=b; }
    return b; }

  /* ── the grid answer ──────────────────────────────────────────────────────────────────────────
     west/y0/dx/dy/N describe the caller's grid exactly as it builds it: cell (i,j) is centred at
     lng = west+(i+0.5)*dx and mercator-y = y0+(j+0.5)*dy. Returns a Uint8Array(N*N) of 1 = land, or
     null when there is no country geometry to rasterise. */
  function rasterize(o){
    const g=geo(); if(!g) return null;
    const N=o.N|0; if(!(N>0)) return null;
    const west=+o.west, dx=+o.dx, y0=+o.y0, dy=+o.dy;
    if(!(isFinite(west)&&isFinite(dx)&&isFinite(y0)&&isFinite(dy))||dx===0||dy===0) return null;
    let cv,ct;
    try{ cv=document.createElement('canvas'); cv.width=N; cv.height=N;
      ct=cv.getContext('2d',{alpha:false,willReadFrequently:true}); }catch(_){ return null; }
    if(!ct) return null;
    ct.fillStyle='#000'; ct.fillRect(0,0,N,N);
    /* the window in longitude, so a field that crosses the antimeridian still receives the polygons
       on the other side of it — each ring is drawn at every 360° offset the window can see */
    const east=west+dx*N;
    const offs=[];
    for(let k=-2;k<=2;k++){ const lo=west-k*360, hi=east-k*360; if(hi>-190&&lo<190) offs.push(k*360); }
    if(!offs.length) offs.push(0);
    const R=rings(g), BB=boxes(g);
    /* the window in lat/lng, for the box test — y0/dy are mercator-y, so invert the two edges */
    const latOfY=(y)=>360/Math.PI*Math.atan(Math.exp((180-y*360)*D))-90;
    const yA=y0, yB=y0+dy*N;
    const latN=Math.max(latOfY(yA),latOfY(yB)), latS=Math.min(latOfY(yA),latOfY(yB));
    const lngW=Math.min(west,east), lngE=Math.max(west,east);
    let drawn=0;
    ct.fillStyle='#fff';
    ct.beginPath();
    for(let oi=0;oi<offs.length;oi++){ const off=offs[oi];
      for(let ri=0;ri<R.length;ri++){
        /* (#R223) exact cull — see boxes() */
        if(BB[ri*4]+off>lngE||BB[ri*4+1]+off<lngW||BB[ri*4+2]>latN||BB[ri*4+3]<latS) continue;
        const r=R[ri];
        let started=false;
        for(let k=0;k<r.length;k++){ const c=r[k];
          const x=((c[0]+off)-west)/dx, y=(mY(c[1])-y0)/dy;
          if(!started){ ct.moveTo(x,y); started=true; } else ct.lineTo(x,y); }
        if(started){ ct.closePath(); drawn++; } } }
    rasterize._drawn=drawn; rasterize._rings=R.length;
    /* ONE fill for every ring at once (see the ⚠ about holes in the header) */
    ct.fill('evenodd');
    let d; try{ d=ct.getImageData(0,0,N,N).data; }catch(_){ cv.width=cv.height=1; return null; }
    const out=new Uint8Array(N*N);
    for(let k=0,n=N*N;k<n;k++) out[k]=(d[k*4]>127)?1:0;
    cv.width=cv.height=1;
    return out; }

  /* how fine the answer just produced actually is, in km, at the middle of the window — for the
     caller to PRINT rather than for anybody to assume (#R185: no silent caps) */
  function cellKm(o){
    try{ const N=o.N|0, dx=+o.dx, y0=+o.y0, dy=+o.dy;
      const latMid=360/Math.PI*Math.atan(Math.exp((180-(y0+dy*N/2)*360)*D))-90;
      return Math.abs(dx)*111.32*Math.cos(Math.max(-85,Math.min(85,latMid))*D); }catch(_){ return null; } }

  /* ── the point answer, finest first ───────────────────────────────────────────────────────────
     Used where there is no grid to build: the country polygons when they are loaded, the bundled
     19.5 km raster when they are not, and `null` — not `false` — when neither can answer. ⚠ null is
     "I do not know", which is a different statement from "sea" and callers must keep it that way. */
  function isLand(lng,lat){
    try{ const g=geo();
      if(g&&window.IntMapRegionResolver&&window.IntMapRegionResolver.countryAt){
        const c=window.IntMapRegionResolver.countryAt(lng,lat); if(c) return true; } }catch(_){}
    try{ const LM=window.IntMapLandMask; if(LM&&LM.ready()){ const v=LM.isLand(lng,lat); if(typeof v==='boolean') return v; } }catch(_){}
    return null; }

  function source(){ return geo()?'countries-10m':(function(){ try{ return (window.IntMapLandMask&&window.IntMapLandMask.ready())?'bundled-19km':null; }catch(_){ return null; } })(); }

  return { rasterize, cellKm, isLand, source, ready:()=>!!geo(),
    state:()=>({ source:source(), rings:(function(){ const g=geo(); return g?rings(g).length:0; })(),
      /* (#R223) how many of them the last rasterise actually had to draw — the cull, measured */
      lastDrawn:(rasterize._drawn==null?null:rasterize._drawn) }) };
})();
