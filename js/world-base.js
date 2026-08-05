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

  /* ══ (#R190) THE FLOOR HAS TO LOOK LIKE THE THING IT IS A FLOOR FOR ══════════════════════════════
     「衛星画像が、読み込み前と読み込み後で全然色味が違う。初期読み込みされる衛星画像を、全然色味の
       違う衛星画像にするな。」

     #R186 chose NASA Blue Marble for this picture — public domain, real satellite imagery, real
     bathymetry, already one of the app's attributed sources, and the only whole-Earth equirectangular
     source that also answers the poles for Cesium. All of that is still right. What was never checked
     is whether it looks like the tiles that paint OVER it, and it does not: Blue Marble is a saturated
     MODIS composite, Esri World Imagery at low zoom is a hazy Landsat mosaic that is much lighter and
     much greener. So the globe visibly changes colour as the tiles land, which is the report.

     MEASURED FROM THE PAGE, over the sixteen z2 World_Imagery tiles and the matching windows of this
     picture (mean channel value, 0-255):

         Esri  R 85.5  G 121.3  B 125.9
         Blue  R 72.4  G  84.3  B 101.1        ← the same Earth, 37 units less green

     A per-channel least squares over those sixteen pairs fits it almost exactly (R² 0.97 / 0.98 /
     0.96, RMSE ≈ 12/255), so the correction is one affine map per channel, applied ONCE to the decoded
     picture and baked into an offscreen canvas that everything downstream draws from. The file on disk
     is untouched — this is a colour match to the imagery it stands in for, not a new data source, and
     the attribution is unchanged.

     ⚠ The correction is applied HERE rather than in the MapLibre paint properties because `raster-*`
     adjustments are luminance/saturation knobs, not per-channel ones, and because the SAME canvas has
     to reach the other engine (js/cesium-engine.js takes `bitmapUrl()` for its whole-globe floor). */
  const TONE=[[1.1011,5.81],[0.9225,43.53],[0.9787,26.94]];   /* [gain, offset] per channel — see above */
  function toneMap(im){
    try{
      const w=im.naturalWidth||im.width, h=im.naturalHeight||im.height;
      if(!(w>0&&h>0)) return im;
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      const g=cv.getContext('2d',{alpha:false, willReadFrequently:true});
      g.drawImage(im,0,0);
      const d=g.getImageData(0,0,w,h), p=d.data;
      /* one 256-entry table per channel — 2 M pixels is 6 M table lookups, not 6 M multiplies */
      const lut=TONE.map(([k,b])=>{ const t=new Uint8ClampedArray(256);
        for(let v=0;v<256;v++) t[v]=k*v+b; return t; });
      const l0=lut[0], l1=lut[1], l2=lut[2];
      for(let i=0;i<p.length;i+=4){ p[i]=l0[p[i]]; p[i+1]=l1[p[i+1]]; p[i+2]=l2[p[i+2]]; }
      g.putImageData(d,0,0);
      return cv;
    }catch(e){ console.warn('[world-base] tone match unavailable — using the picture as shipped',e); return im; }
  }

  /* The bundled picture, decoded once and colour-matched once. Everything downstream waits on this ONE
     promise, so a screen full of tile requests is one decode and not a hundred. */
  let img=null, loading=null, failed=null, blobUrl=null;
  function source(){
    if(img) return Promise.resolve(img);
    if(loading) return loading;
    loading=new Promise((res,rej)=>{
      const im=new Image();
      im.decoding='async';
      im.onload=()=>{ img=toneMap(im); loading=null; res(img); };
      im.onerror=()=>{ failed='image failed to load'; loading=null; rej(new Error(failed)); };
      im.src=url();
    }).catch(e=>{ console.warn('[world-base] '+(e&&e.message||e)+' — the satellite view keeps its old blank-tile behaviour'); throw e; });
    return loading;
  }
  /* The colour-matched picture as a URL, for consumers that can only take one (Cesium's
     SingleTileImageryProvider). Falls back to the file itself if the canvas cannot be exported. */
  function bitmapUrl(){
    if(blobUrl) return Promise.resolve(blobUrl);
    return source().then(c=>new Promise((res)=>{
      if(!c||!c.toBlob){ res(url()); return; }
      try{ c.toBlob(b=>{ try{ blobUrl=b?URL.createObjectURL(b):url(); }catch(_){ blobUrl=url(); } res(blobUrl); },'image/jpeg',0.9); }
      catch(_){ res(url()); }
    })).catch(()=>url());
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
        /* (#R190) maxzoom 4 → 6. #R186 chose 4 on the ground that the source picture is 2,048 px
           around the equator, so anything past z2 is upscaling and carries no new information. That
           is true, and it was the right call while the floor was a DIFFERENT-looking picture: an
           upscaled Blue Marble under Esri tiles reads as a second map, so the less of it the better.
           Now that it is colour-matched to the tiles it stands in for (see TONE above), the trade
           reverses — an out-of-focus patch of the right imagery is what "still loading" should look
           like, and a hole is not. Two more levels cost nothing but a few sub-millisecond canvas
           tiles and keep the globe whole through a deep jump. */
        GE().layers.addSource(SRC,{ type:'raster', tiles:[PROTO+'://{z}/{x}/{y}'], tileSize:TILE,
          minzoom:0, maxzoom:6,
          attribution:'Base imagery: NASA EOSDIS GIBS — Blue Marble (Shaded Relief & Bathymetry)' });
      }
      if(!GE().layers.has(LYR)){
        const before=GE().layers.has('layer-sat')?'layer-sat':undefined;
        GE().layers.add({ id:LYR, type:'raster', source:SRC,
          layout:{visibility:'none'},
          /* (#R191) the same 180 ms the satellite layer above it fades with — see the note there. The
             floor is what a view fades FROM, so a hard swap here is half the flicker. */
          paint:{'raster-fade-duration':180,'raster-opacity':1} }, before);
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
      /* (#R187) the OTHER engine's whole-globe floor is the polar cap imagery (js/cesium-engine.js),
         and it wants the same answer to the same question. This module already owns "the floor under
         the satellite view" and already gets told when that view changes, so it tells both. A
         renderer without one simply returns false and nothing here depends on it. */
      try{ if(GE().scene.setWorldBase) GE().scene.setWorldBase(!!satOn); }catch(_){}
      if(satOn&&!GE().layers.has(LYR)) install();
      if(!GE().layers.has(LYR)) return false;
      GE().layers.setLayout(LYR,'visibility',satOn?'visible':'none');
      return true;
    }catch(_){ return false; }
  }

  return {
    url, bitmapUrl, install, apply, registerProtocol,
    /* pre-decode the picture so the first tile request is a canvas copy and not a download */
    warm:()=>source().catch(()=>null),
    state:()=>({ ready:!!img, failed, tilesMade:made, protocol:protoOn, toned:!!(img&&img.getContext),
      layer:(()=>{ try{ return GE().layers.has(LYR); }catch(_){ return false; } })(),
      visible:(()=>{ try{ return GE().layers.has(LYR)&&GE().layers.getLayout(LYR,'visibility')==='visible'; }catch(_){ return false; } })() }),
  };
})();
