/* ============================================================================
 *  IntMap · THE WHOLE-EARTH SATELLITE BASE — window.IntMapWorldBase  (#R186)
 * ----------------------------------------------------------------------------
 *  「現在、地球規模でも毎回衛星画像を再読み込みしているから、大雑把な地球単位の衛星画像は、
 *    何もないタイルが発生しないように、デフォルトで読み込み待ちすることなく表示できるように。
 *    それ自体は高画質ではなくてもよい。」
 *
 *  The satellite view is a tile pyramid on a remote host. At world zoom that means a fresh round of
 *  requests to arcgisonline every time the app opens, and until each one lands its square of the
 *  planet is EMPTY — the blank tiles the request is about. Nothing about that is a bug in the tile
 *  path; it is what a remote pyramid does. What was missing was a floor underneath it.
 *
 *  So the app ships one coarse picture of the whole Earth (data/world-basemap.jpg — NASA Blue Marble,
 *  2048 × 1024, ~280 KB, see scripts/build-world-basemap.mjs) and serves the low-zoom satellite tiles
 *  from it LOCALLY, through a registered protocol that never touches the network. It is the same
 *  arrangement #R185 chose for the satellite catalogue and for the same measured reason: a fallback
 *  that only appears after the network has timed out is not a fallback, it is a delay. This one is
 *  the FLOOR — it is already there when the first frame is drawn, and the real Esri tiles paint over
 *  it as they arrive.
 *
 *  ── WHY IT IS A PROTOCOL AND NOT AN IMAGE SOURCE ────────────────────────────────────────────────
 *  A MapLibre `image` source is one quad in one place. The base has to behave like the layer it sits
 *  under — Web Mercator, wrapping, tiled, overzoomed by the renderer when the camera goes deeper
 *  than the source's maxzoom. That is a raster tile source, so the honest way to supply it without a
 *  server is to answer tile requests from the bundled picture: each output row of a Mercator tile is
 *  one latitude, and one latitude is one row of an equirectangular image, so a tile is 512 single-row
 *  `drawImage` calls and no arithmetic beyond the inverse Mercator. Measured at well under a
 *  millisecond a tile.
 *
 *  maxzoom is 4 deliberately. The source picture is 2,048 px around the equator, which IS zoom 2 for
 *  512-px tiles; anything past that is upscaling, and the renderer already overzooms the deepest
 *  level it has. Four leaves the floor visible for a beat during a deep zoom without generating
 *  tiles that carry no more information. 「高画質でなくてよい」 — and it is under the real imagery
 *  wherever the real imagery exists.
 *
 *  ── THE SAME FILE ANSWERS THE POLES ─────────────────────────────────────────────────────────────
 *  Web Mercator stops at ±85.0511° and Cesium draws the Earth to ±90°, which is why 「Cesiumでは
 *  南極・北極付近が…真っ黒」. That cap is not a tile that failed to load — there is no such tile in
 *  any Mercator source. js/cesium-engine.js puts THIS picture, which is equirectangular and does
 *  reach ±90°, underneath everything as a single whole-globe imagery layer.
 * ==========================================================================*/
window.IntMapWorldBase=(function(){
  'use strict';
  const GE=()=>window.IntMapGeoEngine;
  const SRC='world-base-src', LYR='layer-world-base', PROTO='imapworld';
  const TILE=512;

  function url(){
    try{ return new URL('data/world-basemap.jpg',document.baseURI).toString(); }
    catch(_){ return 'data/world-basemap.jpg'; }
  }

  /* The bundled picture, decoded once. Everything downstream waits on this ONE promise, so a screen
     full of tile requests is one decode and not a hundred. */
  let img=null, loading=null, failed=null;
  function source(){
    if(img) return Promise.resolve(img);
    if(loading) return loading;
    loading=new Promise((res,rej)=>{
      const im=new Image();
      im.decoding='async';
      im.onload=()=>{ img=im; loading=null; res(im); };
      im.onerror=()=>{ failed='image failed to load'; loading=null; rej(new Error(failed)); };
      im.src=url();
    }).catch(e=>{ console.warn('[world-base] '+(e&&e.message||e)+' — the satellite view keeps its old blank-tile behaviour'); throw e; });
    return loading;
  }

  /* Mercator y (0..1 over the whole world) → latitude in degrees. */
  const latOf=(my)=>Math.atan(Math.sinh(Math.PI*(1-2*my)))*180/Math.PI;

  let made=0;
  /* Render one Web Mercator tile out of the equirectangular picture.
     Longitude is LINEAR in Mercator x, so the horizontal mapping is a single constant scale and each
     output row can be filled by one drawImage of the matching source row. Latitude is not linear, so
     the row index is recomputed per row — which is exactly the reprojection, done at output
     resolution rather than by resampling a grid. */
  function tile(z,x,y){
    return source().then(im=>{
      const n=Math.pow(2,z), sw=im.naturalWidth||im.width, sh=im.naturalHeight||im.height;
      const cv=document.createElement('canvas'); cv.width=TILE; cv.height=TILE;
      const g=cv.getContext('2d',{alpha:false});
      g.imageSmoothingEnabled=true; g.imageSmoothingQuality='low';
      const sx=(x/n)*sw, sWid=sw/n;
      for(let j=0;j<TILE;j++){
        const lat=latOf((y+j/TILE)/n), lat2=latOf((y+(j+1)/TILE)/n);
        const sy=(90-lat)/180*sh;
        const sy2=(90-lat2)/180*sh;
        const hgt=Math.max(0.5,sy2-sy);
        g.drawImage(im,sx,Math.max(0,Math.min(sh-0.5,sy)),sWid,Math.min(hgt,sh-sy),0,j,TILE,1);
      }
      made++;
      if(typeof createImageBitmap==='function') return createImageBitmap(cv);
      return cv;
    });
  }

  let protoOn=false;
  function registerProtocol(){
    if(protoOn) return true;
    try{
      const ok=GE().scene.addProtocol(PROTO,(params,abort)=>{
        const m=/imapworld:\/\/(\d+)\/(\d+)\/(\d+)/.exec((params&&params.url)||'');
        if(!m) return Promise.reject(new Error('bad imapworld url'));
        /* {z}/{x}/{y} — the order the source template below asks for */
        return tile(+m[1],+m[2],+m[3]).then(d=>({data:d}));
      });
      /* Both engines answer false when they could not register it, and `state().protocol` is read by
         the tests — so report what happened rather than asserting success. */
      protoOn=!!ok;
    }catch(_){ return false; }
    return protoOn;
  }

  /* Add the floor UNDER the satellite layer. `beforeId` is 'layer-sat' when it exists, which is the
     bottom of the app's own stack, so nothing else has to move. */
  function install(){
    try{
      if(!GE().hasRenderer()||!GE().canDraw()) return false;
      if(!registerProtocol()) return false;
      if(!GE().layers.hasSource(SRC)){
        GE().layers.addSource(SRC,{ type:'raster', tiles:[PROTO+'://{z}/{x}/{y}'], tileSize:TILE,
          minzoom:0, maxzoom:4,
          attribution:'Base imagery: NASA EOSDIS GIBS — Blue Marble (Shaded Relief & Bathymetry)' });
      }
      if(!GE().layers.has(LYR)){
        const before=GE().layers.has('layer-sat')?'layer-sat':undefined;
        GE().layers.add({ id:LYR, type:'raster', source:SRC,
          layout:{visibility:'none'},
          paint:{'raster-fade-duration':0,'raster-opacity':1} }, before);
      }
      return true;
    }catch(e){ console.warn('[world-base] install',e); return false; }
  }

  /* The floor is shown with the satellite basemap, because that is the view whose tiles it stands in
     for. Under the vector/Carto base map it would be a satellite picture peeking through a street
     map, which is not a floor, it is a different map. */
  function apply(satOn){
    try{
      if(!GE().hasRenderer()) return false;
      if(satOn&&!GE().layers.has(LYR)) install();
      if(!GE().layers.has(LYR)) return false;
      GE().layers.setLayout(LYR,'visibility',satOn?'visible':'none');
      return true;
    }catch(_){ return false; }
  }

  return {
    url, install, apply, registerProtocol,
    /* pre-decode the picture so the first tile request is a canvas copy and not a download */
    warm:()=>source().catch(()=>null),
    state:()=>({ ready:!!img, failed, tilesMade:made, protocol:protoOn,
      layer:(()=>{ try{ return GE().layers.has(LYR); }catch(_){ return false; } })(),
      visible:(()=>{ try{ return GE().layers.has(LYR)&&GE().layers.getLayout(LYR,'visibility')==='visible'; }catch(_){ return false; } })() }),
  };
})();
