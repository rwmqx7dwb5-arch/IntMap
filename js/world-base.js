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
    }).catch(e=>{ console.warn('[world-base] '+(e&&e.message||e)+' — the satellite view keeps its old blank-tile behavior'); throw e; });
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

  /* ══ (#R207) THE MERCATOR CAPS ARE NOT A TILE THAT FAILED — THERE IS NO SUCH TILE ═══════════════
     「MapLibreで南極付近が衛星画像零の暗黒領域になっている。」

     Web Mercator stops at ±85.0511°; MapLibre's globe draws the Earth to ±90°. Everything in this
     app's style is Mercator — Esri's imagery, the Carto base map, and this floor, which is a Mercator
     RASTER SOURCE even though the picture behind it is equirectangular. So the two caps are covered by
     no layer at all, and the app's style has NO `background` layer (verified: nothing in js/ declares
     one), which leaves the renderer's clear colour. That is the black.

     Cesium already gets the whole-globe answer — js/cesium-engine.js hands it THIS picture as a single
     equirectangular imagery layer, which does reach ±90°. MapLibre cannot take that shape, so the cap
     gets the one thing a Mercator style can put under everything: a background layer, coloured with
     the colour that is ACTUALLY THERE, measured from the top and bottom rows of the shipped picture
     rather than picked by eye. Both caps are ice, so one colour is honest for both; it is sampled
     from the tone-matched canvas, so it also matches the Esri tiles the floor was matched to (#R190).

     ⚠ IT IS ONLY EVER VISIBLE AT THE CAPS. The floor above covers every Mercator tile from the first
     frame (#R186), so this cannot re-introduce a coloured flash anywhere else. */
  let capRGB=null;
  function polarColour(){
    if(capRGB) return Promise.resolve(capRGB);
    return source().then(im=>{
      try{
        const w=im.naturalWidth||im.width, h=im.naturalHeight||im.height;
        const cv=document.createElement('canvas'); cv.width=Math.min(64,w); cv.height=2;
        const g=cv.getContext('2d',{willReadFrequently:true});
        /* the top row of the picture is 90°N and the bottom row 90°S — one output row each */
        g.drawImage(im,0,0,w,Math.max(1,Math.round(h*0.012)),0,0,cv.width,1);
        g.drawImage(im,0,h-Math.max(1,Math.round(h*0.012)),w,Math.max(1,Math.round(h*0.012)),0,1,cv.width,1);
        const d=g.getImageData(0,0,cv.width,2).data;
        let r=0,gg=0,b=0,n=0;
        for(let i=0;i<d.length;i+=4){ r+=d[i]; gg+=d[i+1]; b+=d[i+2]; n++; }
        if(!n) throw new Error('no pixels');
        const hex=(v)=>('0'+Math.max(0,Math.min(255,Math.round(v/n))).toString(16)).slice(-2);
        capRGB='#'+hex(r)+hex(gg)+hex(b);
      }catch(_){ capRGB='#e9edf2'; }   /* polar ice, if the canvas cannot be read (tainted/blocked) */
      return capRGB;
    }).catch(()=>{ capRGB='#e9edf2'; return capRGB; });
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
      try{ applyCap(!!satOn); }catch(_){}                      /* (#R207) the ±85°–90° caps */
      if(!GE().layers.has(LYR)) return false;
      GE().layers.setLayout(LYR,'visibility',satOn?'visible':'none');
      return true;
    }catch(_){ return false; }
  }

  /* (#R207) show / recolour the cap background. The LAYER ITSELF is declared as the first entry of
     the style in js/app-body.js — a background layer must be at the very bottom, and declaring it
     there is the only way that is guaranteed rather than arranged at runtime (the engine contract has
     no "list the layers in order", and a guard on a method that does not exist is a silent no-op for
     ever — #R200). This module owns only its visibility and its colour. */
  const CAP='layer-polar-cap';
  /* ══ ⚠⚠ (#R219) #R207 COVERED THE CAPS ON ONE BASE MAP OUT OF TWO ═══════════════════════════════
     「南極付近が真っ暗。何度も何度もふざけるな。修正からの再発何回目やねん」 — the sixth report, and
     MEASURED this round rather than reasoned about: on the vector base map the pixel at the south
     polar cap is (7,7,15). Pure black. `layer-polar-cap` is `visibility:'none'` there, because #R207
     showed it only with the satellite view — its note argues that a satellite picture peeking through
     a street map is not a floor. That argument is about the IMAGERY FLOOR (`layer-world-base`); it
     does not apply to a flat background colour, and the consequence of extending it to the cap was
     that the ±85°–90° hole #R207 set out to close stayed open on the other base map for eleven
     rounds. Every basemap needs SOMETHING under the caps, because Web Mercator ends at ±85.0511° and
     the globe draws to ±90°: with nothing there, the renderer's clear colour is what a reader sees.

     So the cap is always on, and only its COLOUR depends on the map above it:
       · satellite → the tone measured from the shipped picture's own polar rows (`polarColour()`),
         so it matches the Esri tiles the floor was matched to;
       · vector, light → the Carto light basemap's own land tone;
       · vector, dark  → the Carto dark basemap's own land tone, so the cap is dark like the map it
         belongs to and still is not the renderer's black.
     ⚠ THE TONES ARE MEASURED, not chosen. Carto's own land colour over Antarctica (z3/4/7) is
     #f8f8f8 on light_nolabels and #080808 on dark_nolabels — but the DARK layer is drawn through
     `raster-brightness-min:0.33` + `raster-contrast:0.5` (js/app-body.js), and that shader turns
     #080808 into ≈ (84,84,84): ((0.031−0.5)·2+0.5) clamps to 0, then 0.33 + 0·0.67 = 0.33. So the
     cap must match what is on SCREEN, not what came off the wire — using #080808 there would put the
     black straight back. The cap is ice, and ice on those maps is these two colours. */
  const CAP_VEC_LIGHT='#f8f8f8', CAP_VEC_DARK='#545454';
  function _darkBase(){
    try{ for(const id of ['layer-dark','layer-dark-nl'])
      if(GE().layers.has(id)&&GE().layers.getLayout(id,'visibility')!=='none') return true; }catch(_){}
    try{ return document.documentElement.getAttribute('data-theme')==='dark'; }catch(_){}
    return false;
  }
  function applyCap(satOn){
    if(!GE().hasRenderer()||!GE().canDraw()) return false;
    if(!GE().layers.has(CAP)) return false;
    try{ GE().layers.setLayout(CAP,'visibility','visible'); }catch(_){ return false; }
    if(!satOn){
      try{ GE().layers.setPaint(CAP,'background-color',_darkBase()?CAP_VEC_DARK:CAP_VEC_LIGHT); }catch(_){ return false; }
      capImages(false);
      return true;
    }
    /* the measured colour arrives with the picture; until then the layer stands in ice-white, which
       is already the right order of magnitude and never black */
    polarColour().then(c=>{ try{ if(GE().layers.has(CAP)) GE().layers.setPaint(CAP,'background-color',c); }catch(_){} }).catch(()=>{});
    capImages(true);
    return true;
  }

  /* ══ ⚠⚠ (#R219) …AND A COLOUR IS NOT IMAGERY. 「極付近に衛星画像がない」 ═══════════════════════════
     The background above stops the caps being the renderer's black, which is the crash-level bug —
     but what stands there is ONE FLAT TONE over 0.19 % of the sphere, and the report is not that the
     poles are the wrong colour, it is that THE PICTURE STOPS. The bundled floor
     (data/world-basemap.jpg, NASA EOSDIS GIBS Blue Marble) is EQUIRECTANGULAR and does reach ±90°;
     only the delivery was Mercator, and Web Mercator has no tile for a pole.

     ⚠ AND NO `image` SOURCE EITHER, WHICH IS MEASURED RATHER THAN ASSUMED. The obvious fix — the two
     bands as image sources at their real corners — makes MapLibre throw on every load:
         Error: x=0, y=Infinity, z=0 outside of bounds. 0<=x<1, 0<=y<1
     because `ImageSource.setCoordinates` puts each corner through `MercatorCoordinate.fromLngLat`,
     and latitude 90 has no Mercator y. Every raster path in the renderer is Mercator underneath, so
     NOTHING that carries pixels can be placed at a pole. (Caught by tests/smoke «no critical
     console.error» before it left the branch; it is written down because it looks like it should
     work.)

     What CAN be placed there is geometry: a polygon's vertices are lon/lat and 90 is a latitude. So
     the caps are a MOSAIC — 36 sectors × 5 latitude bands per pole — and each cell is filled with the
     colour the shipped picture actually has over that cell, averaged. That is the imagery, at the
     resolution a fan of polygons can carry: not a photograph, but the real light and dark of the ice
     sheet instead of one flat tone, and it is the same tone-mapped canvas (#R190) the tiles below it
     come from, so the seam at 85.0511° matches.
     ⚠ ONLY WITH THE SATELLITE VIEW, for the reason `apply()` gives about the floor. On the vector base
     map the cap stays the measured Carto land tone. */
  const CAPSRC = 'world-cap-src', CAPLYR = 'layer-world-cap';
  const LIMLAT = 85.0511287798066;
  /* ══ ⚠⚠ (#R220) 36 SECTORS IS A PINWHEEL, AND A PINWHEEL IS A DRAWN FIGURE ON THE POLE ═════════
     Measured this round with the night side removed from the picture: the cap mosaic is what draws
     the fan visible at the South Pole. 36 sectors × 10° each converge on ONE point, so every colour
     difference between neighbours becomes a spoke radiating from the pole — and the innermost band
     is where they all meet, so that is where the figure is strongest. Two changes, both about the
     geometry rather than the colours: twice the sectors (5° each, so the step between neighbours is
     halved and lands below what the eye picks out), and the innermost band is painted with ONE
     colour — the average of its own row — because the pole is a POINT and the picture has exactly
     one colour there, not thirty-six. */
  const CAP_SECT = 72, CAP_BANDS = 6;
  let capBusy = false, capFC = null;
  function _capMosaic(im) {
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
    const cv = document.createElement('canvas');
    /* one output pixel per cell: the browser's own box filter does the averaging */
    cv.width = CAP_SECT; cv.height = CAP_BANDS * 2;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const rowOf = (lat) => Math.round(h * (90 - lat) / 180);
    /* north band rows 0 … rowOf(LIMLAT); south rows rowOf(-LIMLAT) … h */
    g.drawImage(im, 0, 0, w, rowOf(LIMLAT), 0, 0, CAP_SECT, CAP_BANDS);
    g.drawImage(im, 0, rowOf(-LIMLAT), w, h - rowOf(-LIMLAT), 0, CAP_BANDS, CAP_SECT, CAP_BANDS);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const hex = (v) => ('0' + Math.max(0, Math.min(255, v)).toString(16)).slice(-2);
    const feats = [];
    for (let north = 1; north >= 0; north--) {
      for (let b = 0; b < CAP_BANDS; b++) {
        /* the picture's rows run north → south, so band 0 of the north cap is the pole itself */
        const f0 = b / CAP_BANDS, f1 = (b + 1) / CAP_BANDS;
        const la0 = north ? (90 - (90 - LIMLAT) * f0) : (-LIMLAT - (90 - LIMLAT) * f0);
        const la1 = north ? (90 - (90 - LIMLAT) * f1) : (-LIMLAT - (90 - LIMLAT) * f1);
        const row = north ? b : (CAP_BANDS + (CAP_BANDS - 1 - b));
        /* the innermost band is one colour: its sectors all meet at the pole */
        let avg = null;
        if (b === 0) { let r = 0, g2 = 0, b2 = 0;
          for (let k = 0; k < CAP_SECT; k++) { const o = (row * CAP_SECT + k) * 4; r += d[o]; g2 += d[o + 1]; b2 += d[o + 2]; }
          avg = '#' + hex(Math.round(r / CAP_SECT)) + hex(Math.round(g2 / CAP_SECT)) + hex(Math.round(b2 / CAP_SECT)); }
        for (let k = 0; k < CAP_SECT; k++) {
          const o = (row * CAP_SECT + k) * 4;
          const col = avg || ('#' + hex(d[o]) + hex(d[o + 1]) + hex(d[o + 2]));
          const l0 = -180 + 360 * k / CAP_SECT, l1 = -180 + 360 * (k + 1) / CAP_SECT;
          const ring = [];
          for (let i = 0; i <= 4; i++) ring.push([l0 + (l1 - l0) * i / 4, la0]);
          for (let i = 4; i >= 0; i--) ring.push([l0 + (l1 - l0) * i / 4, la1]);
          ring.push([l0, la0]);
          feats.push({ type: 'Feature', properties: { c: col },
            geometry: { type: 'Polygon', coordinates: [ring] } });
        }
      }
    }
    return { type: 'FeatureCollection', features: feats };
  }
  /* ══ ⚠⚠ (#R219) …AND THE `background` LAYER DOES NOT REACH THE CAP AT ALL ═══════════════════════
     MEASURED after the first fix landed: with the vector base map and the cap background declared
     `visible` at `#545454`, the pixel at the south pole was still (11,11,11). A MapLibre `background`
     layer is painted over the TILE COVERAGE, and there is no tile above 85.0511° — so #R207's
     background could never have covered the hole it was added to cover. The satellite view looked
     fixed only because the mosaic below is a FILL, i.e. geometry, and geometry does reach the pole.
     So the mosaic is what covers the caps on EVERY base map; only its colour changes:
       · satellite → each cell's own measured colour from the shipped picture (`['get','c']`);
       · vector    → the flat Carto land tone, because a satellite mosaic under a street map is the
                     「別の地図が透けている」 #R207's note is right about.
     The background layer stays as it is: harmless, and it is the floor for the Mercator area. */
  function capImages(satOn) {
    try {
      const col = satOn ? ['get', 'c'] : (_darkBase() ? CAP_VEC_DARK : CAP_VEC_LIGHT);
      /* ⚠ a style reload drops added layers; the LAYERS are the truth, not a flag (#R212) */
      if (GE().layers.has(CAPLYR)) {
        try { GE().layers.setLayout(CAPLYR, 'visibility', 'visible'); } catch (_) {}
        try { GE().layers.setPaint(CAPLYR, 'fill-color', col); } catch (_) {}
        return true;
      }
      const put = () => {
        if (!capFC || !GE().canDraw()) return false;
        if (!GE().layers.hasSource(CAPSRC)) GE().layers.addSource(CAPSRC, { type: 'geojson', data: capFC });
        else GE().layers.setSourceData(CAPSRC, capFC);
        if (!GE().layers.has(CAPLYR)) {
          const before = GE().layers.has(LYR) ? LYR : undefined;
          GE().layers.add({ id: CAPLYR, type: 'fill', source: CAPSRC,
            paint: { 'fill-color': col, 'fill-antialias': false } }, before);
        }
        return GE().layers.has(CAPLYR);
      };
      if (capFC) return put();
      if (capBusy) return false;
      capBusy = true;
      source().then((im) => { capBusy = false;
        try { capFC = _capMosaic(im); } catch (_) { capFC = null; }
        try { put(); } catch (_) {}
      }).catch(() => { capBusy = false; });
      return false;
    } catch (_) { capBusy = false; return false; }
  }

  return {
    url, bitmapUrl, install, apply, registerProtocol, polarColour, applyCap,
    /* pre-decode the picture so the first tile request is a canvas copy and not a download */
    warm:()=>source().catch(()=>null),
    state:()=>({ ready:!!img, failed, tilesMade:made, protocol:protoOn, toned:!!(img&&img.getContext),
      layer:(()=>{ try{ return GE().layers.has(LYR); }catch(_){ return false; } })(),
      visible:(()=>{ try{ return GE().layers.has(LYR)&&GE().layers.getLayout(LYR,'visibility')==='visible'; }catch(_){ return false; } })() }),
  };
})();
