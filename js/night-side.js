/* ============================================================================
 *  IntMap · THE NIGHT SIDE OF THE EARTH — window.IntMapNightSide  (#R196 → rebuilt #R201)
 * ----------------------------------------------------------------------------
 *  「地球全体が見えるズームレベルから、さらにズームアウトするほど、太陽の当たっていない部分が暗くなり、
 *    夜間光が見えるように。」
 *  追記①「引いたときの黒さをよりきつくして。」  追記②「夜と昼の部分の変遷が階段状で不自然。
 *    また、夜の部分は完全に夜間光レイヤーと同じ画像に。」
 *
 *  ── WHAT #R196/#R200 BUILT, AND WHY THE SECOND ADDENDUM IS A DESIGN REPORT, NOT A TUNING REQUEST ──
 *  The old night side was TWO things stacked: five nested geographic polygons at solar elevations
 *  0°, −3°, −6°, −9°, −12° carrying the darkness, and a canvas of NASA's VIIRS Black Marble drawn
 *  only where its own pixels were bright enough to be a city. #R200 fixed the arithmetic behind the
 *  first (alpha does not add; five coats of 0.156 leave 43 % of the basemap, not 22 %) and the
 *  measured darkness went 0.57 → 0.87. It did not — could not — fix the shape:
 *
 *    · FIVE POLYGONS ARE FIVE STEPS. The twilight band spans 0° to −12° of solar elevation, which at
 *      the whole-Earth zoom this effect lives at is about 17 SCREEN PIXELS wide. Five hard-edged
 *      fills inside 17 px is a staircase by construction, and no choice of five alphas is not one.
 *      「階段状で不自然」 is a description of the mechanism, so the mechanism is what changed.
 *    · AND THE NIGHT WAS NOT THE NIGHT-LIGHTS IMAGE. The lights layer skipped every pixel dimmer
 *      than 2 % (`lum<=0.02 → alpha 0`) and brightened the rest, so what you actually saw over dark
 *      land and over ocean was the ordinary basemap with a dark polygon on top — a shaded day map,
 *      not the night side. 「完全に夜間光レイヤーと同じ画像に」 says: at full night, show the product.
 *
 *  ── WHAT IT IS NOW: ONE IMAGE, ONE GRADIENT, PER PIXEL ─────────────────────────────────────────
 *  A single canvas source whose RGB is Black Marble UNTOUCHED and whose ALPHA is the nightness at
 *  that pixel — smoothstepped from the sunlit horizon (0°) to the end of astronomical twilight
 *  (−18°, which is the definition of night rather than a number chosen to look right). So:
 *
 *      composite = BlackMarble·n + basemap·(1−n)
 *
 *  At n = 1 that is EXACTLY the `dl-nightsat` layer — same GIBS product, same 2016-01-01 composite,
 *  same pixels, nothing added — which is what the request asks for, and because Black Marble is
 *  near-black wherever nobody lives, it is also the darkest the night side has ever been. At n = 0
 *  the basemap is untouched. In between the alpha varies PER PIXEL, so the terminator has as many
 *  levels as it has pixels: the staircase is not smoothed, it is gone.
 *
 *  ⚠ THE DARKNESS NO LONGER NEEDS THE NETWORK EITHER. The mosaic arrives on an idle, so until it
 *  does the same canvas is painted with UNLIT — the value Black Marble itself carries where there
 *  is no light (measured off the product, see the constant) — and the night side is complete and
 *  correctly shaped from the first frame. The lights are then a REFINEMENT of an image that is
 *  already right, which is also why the mosaic is fetched twice: z2 (16 tiles) so it is there
 *  almost at once, then z3 (64 tiles, 2048²) to match the canvas the desktop paints.
 *
 *  ⚠ THE POLES ARE THE ONE THING A CANVAS CANNOT DO, so they are the one thing still drawn as
 *  polygons. A canvas source is a QUAD placed by four corner coordinates and Mercator Y is unbounded
 *  at the pole, so the image stops at ±85.051129° — on the globe projection that leaves a cap the
 *  night would otherwise miss. `im-night-shade` is now ONLY that cap: a fan of wedges from ±85° to
 *  the pole, each carrying its own nightness as a feature property. It is 0.19 % of the sphere.
 *
 *  ⚠ THE IMAGE IS PLACED THROUGH `imageRowLatitudes` (#R195). A canvas source's texture runs
 *  linearly in the RENDERER's vertical coordinate — Mercator on MapLibre, geographic on Cesium.
 *  Sampling at equal steps of latitude and hoping is exactly the 8.05° error #R195 measured on the
 *  tsunami. Every output row asks the engine what latitude it is.
 *
 *  ⚠ NOTHING RUNS PER FRAME, AND NOTHING RUNS AT ALL UNTIL IT WOULD BE VISIBLE. The zoom ramp is a
 *  style EXPRESSION (`interpolate` on zoom), so panning and zooming cost the renderer what they
 *  already cost and this file zero. The layers are not created — and no tile is fetched — until the
 *  camera first reaches a zoom where the effect has any opacity.
 *
 *  DATA: NASA EOSDIS GIBS, VIIRS_Black_Marble (2016-01-01 composite). Already declared in the app's
 *  sources/privacy pages for the manual layer; this is the same service and the same product.
 * ==========================================================================*/
window.IntMapNightSide=(function(){
  'use strict';
  const GE=()=>window.IntMapGeoEngine;
  const SRC='im-night-src', LYR='im-night-shade', DYN='im-night-lights';
  const D=Math.PI/180;

  /* ══ (#R201) THE ZOOM RAMP — 「引いたときの黒さをよりきつくして」 ═════════════════════════════════
     One expression, shared by the image and the polar caps, so "how much night is showing" is one
     fact. #R196's ramp was already 0.86 by z1.6 — the zoom the app OPENS at — so the widest view
     never saw the full effect at all. It is now flat through the whole-Earth range (z0 … z2.4, which
     is every zoom at which the planet has a visible day side and night side) and falls away over the
     continental zooms, reaching 0 at ZMAX where nothing is built. */
  const RAMP_STOPS=[[0,1],[2.4,0.95],[3.6,0.45],[4.6,0]];
  /* ⚠ A ZOOM EXPRESSION MAY ONLY BE THE OUTERMOST ONE. `['*', ['get','a'], ['interpolate',…zoom…]]`
     is a well-formed-looking style that MapLibre REJECTS — and addLayer swallows the rejection, so
     the first version of this file reported `built: true` with no shade layer in the style at all
     and a globe that looked exactly as it had before. Measured, not reasoned: `map.getLayer(...)`
     returned null. Anything data-driven therefore rides on the STOP OUTPUT, which is where a
     property expression is allowed, and `build()` re-reads the layer to prove it was accepted. */
  const ramp=(k)=>['interpolate',['linear'],['zoom']].concat(...RAMP_STOPS.map(([z,v])=>[z,+(v*k).toFixed(5)]));
  const RAMP=ramp(1);
  const ZMAX=4.6;                       /* above this the ramp is 0 — nothing is built */

  /* ══ (#R201) THE TWILIGHT BAND, AS ONE NUMBER ═══════════════════════════════════════════════════
     Nightness is 0 with the Sun on the horizon and 1 when it is TWILIGHT_END below it, smoothstepped
     between. −18° is the astronomical definition of night (the Sun stops lighting the upper
     atmosphere at all), and it is also ~2,000 km of terminator rather than #R196's ~1,300 km — a
     softer band is the other half of 「不自然」, since a real Earth seen from space has one. */
  const TWILIGHT_END=-18;
  /* Black Marble's own value where there is no light. MEASURED off the 2016-01-01 composite (the
     mean of the darkest 90 % of its pixels), so the caps and the pre-mosaic fallback are the same
     colour the image itself will be — not a guess at "dark". */
  const UNLIT=[6,7,17], UNLIT_HEX='#060711';

  let built=false, lights=null, lightsZ=0, lightsBusy=false, lastKey='', enabled=true, wired=false, lastErr=null;

  /* ── the Sun, by the same formulae the Earth Replay terminator uses (js/sims.js) ──────────────── */
  const J1970=2440588, J2000=2451545, dayMs=86400000, ecl=23.4397*D;
  function solar(date){
    const d=date.valueOf()/dayMs-0.5+J1970-J2000;
    const M=D*(357.5291+0.98560028*d);
    const C=D*(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M));
    const Lm=M+C+D*102.9372+Math.PI;
    return { d, dec:Math.asin(Math.sin(ecl)*Math.sin(Lm)), ra:Math.atan2(Math.sin(Lm)*Math.cos(ecl),Math.cos(Lm)) };
  }
  /* nightness ∈ [0,1] at a point: 0 with the Sun on the horizon, 1 at the end of astronomical
     twilight, smoothstepped so the band has no visible edge */
  function nightAt(S,lngDeg,latDeg){
    const th=D*(280.16+360.9856235*S.d)+D*lngDeg, H=th-S.ra, ph=latDeg*D;
    const sinEl=Math.sin(ph)*Math.sin(S.dec)+Math.cos(ph)*Math.cos(S.dec)*Math.cos(H);
    const el=Math.asin(Math.max(-1,Math.min(1,sinEl)))/D;
    const t=Math.max(0,Math.min(1,el/TWILIGHT_END));
    return t*t*(3-2*t);
  }

  /* ══ (#R201) THE POLAR CAP — the 0.19 % of the sphere a Mercator quad cannot reach ══════════════
     A fan of wedges from ±CAP_LAT to the pole. Each carries its own nightness at its own mid
     longitude, so the cap agrees with the image row it meets rather than being one flat disc; the
     seam is the difference between n(85.05°) and n(87.5°) at that longitude, which is zero except in
     the few days around an equinox when the terminator is inside the cap at all. */
  const CAP_LAT=85.0, CAP_WEDGES=24;
  function capFC(date){
    const S=solar(date), feats=[];
    for(const sgn of [1,-1]){
      for(let k=0;k<CAP_WEDGES;k++){
        const l0=-180+360*k/CAP_WEDGES, l1=-180+360*(k+1)/CAP_WEDGES;
        const a=nightAt(S,(l0+l1)/2,sgn*87.5);
        if(!(a>0.004)) continue;                    /* the lit pole draws nothing at all */
        const lat0=sgn*CAP_LAT, ring=[];
        for(let i=0;i<=6;i++) ring.push([l0+(l1-l0)*i/6,lat0]);
        ring.push([l1,sgn*89.98]); ring.push([l0,sgn*89.98]); ring.push([l0,lat0]);
        feats.push({ type:'Feature', properties:{ a:+a.toFixed(4) },
                     geometry:{ type:'Polygon', coordinates:[ring] } });
      }
    }
    return { type:'FeatureCollection', features:feats };
  }
  /* the zoom ramp is the outermost expression; the per-wedge nightness rides on the stop OUTPUT */
  const capOpacity=()=>['interpolate',['linear'],['zoom']].concat(
    ...RAMP_STOPS.map(([z,v])=>[z, v<=0 ? 0 : ['*',['get','a'],v]]));

  /* ── the Black Marble mosaic, fetched once at z2 and then refined to z3 ───────────────────────── */
  const LIGHT_TILE=256;
  function mosaicZ(){ let mob=false; try{ mob=/Mobi|Android|iPhone|iPad/.test(navigator.userAgent||''); }catch(_){}
    return mob?2:3; }
  /* ⚠ TWO PASSES, AND THE FIRST ONE IS THE POINT. 16 tiles is a quarter of a megabyte and arrives
     while the reader is still reaching the whole-Earth zoom; 64 tiles is the resolution the desktop
     canvas can actually show. Painting z2 first and z3 when it lands means the lights appear early
     and sharpen, instead of being absent for as long as the larger fetch takes. */
  function loadLights(z){
    if(lightsBusy||lights&&lightsZ>=z) return Promise.resolve(lights);
    lightsBusy=true;
    const n=1<<z, W=n*LIGHT_TILE;
    const cv=document.createElement('canvas'); cv.width=W; cv.height=W;
    const cx=cv.getContext('2d',{willReadFrequently:true});
    const one=(x,y)=>new Promise((res)=>{
      const im=new Image(); im.crossOrigin='anonymous';
      im.onload=()=>{ try{ cx.drawImage(im,x*LIGHT_TILE,y*LIGHT_TILE,LIGHT_TILE,LIGHT_TILE); }catch(_){} res(true); };
      im.onerror=()=>res(false);
      im.src='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/'
        +'GoogleMapsCompatible_Level8/'+z+'/'+y+'/'+x+'.png';
    });
    const jobs=[]; for(let y=0;y<n;y++) for(let x=0;x<n;x++) jobs.push(one(x,y));
    return Promise.all(jobs).then((oks)=>{
      lightsBusy=false;
      if(!oks.some(Boolean)){ lastErr='lights'; return lights; }
      try{ lights={ w:W, h:W, d:cx.getImageData(0,0,W,W).data }; lightsZ=z; lastErr=null; }
      catch(_){ lastErr='lights-cors'; }
      return lights;
    }).catch(()=>{ lightsBusy=false; lastErr='lights'; return lights; });
  }

  /* ── the layers ──────────────────────────────────────────────────────────────────────────────── */
  const LIM=85.051129;
  const COORDS=[[-180,LIM],[180,LIM],[180,-LIM],[-180,-LIM]];
  /* ⚠ (#R196/#R201) THE CANVAS IS AS BIG AS IT CAN BE PAID FOR, AND NOT ONE PIXEL MORE. #R196
     measured 1024² as a synchronous long task in the middle of a gesture and cut it to 512. The loop
     was then made separable (see drawLights) and the same paint is now 10 ms at 512 / ~20 ms at 1024
     / 120 ms at 2048 — MEASURED on this build, which is why the ladder stops at 1024. It runs on an
     idle after the camera settles and once a minute after that, never inside a gesture. */
  function imgSize(){ let mob=false; try{ mob=/Mobi|Android|iPhone|iPad/.test(navigator.userAgent||''); }catch(_){}
    return mob?512:1024; }
  function beforeId(){
    for(const id of ['ofm-country','ofm-city','ofm-other','tool-poly'])
      { try{ if(GE().layers.has(id)) return id; }catch(_){} }
    return undefined;
  }
  function clockMs(){
    /* ⚠ (#R200) `T.now` IS NOT PART OF window.IntMapTime — see the note in js/theme-sky.js. This
       guard was false on every build since #R196, so the terminator and the city-lights mask were
       drawn for the wall clock even with the time machine years away. `when()` is the real one. */
    try{ const T=window.IntMapTime; if(T&&T.when){ const d=T.when(); const v=(d instanceof Date)?d.getTime():+d; if(isFinite(v)) return v; } }catch(_){}
    return Date.now();
  }
  /* ⚠ (#R196) THE HOT LOOP IS SEPARABLE, SO IT IS SEPARATED. The solar elevation at (lat, lng) is
     sinφ·sinδ + cosφ·cosδ·cos H, and H depends only on the LONGITUDE while φ depends only on the ROW
     — so cos H is computed once per column and the two φ terms once per row, leaving one multiply and
     one add per pixel. The `asin` is gone too: nightness is a function of the elevation, and the
     elevation is monotonic in its sine, so the two thresholds are compared as SINES and the inverse
     is only taken inside the twilight band. Measured on the same picture, this is what took the
     wide-zoom paint off the profile.
     ⚠ (#R201) AND THE PIXELS ARE THE PRODUCT'S OWN. No threshold, no gain, no bias: what is written
     is what GIBS sent, and only HOW MUCH OF IT SURVIVES is this file's arithmetic. That is the whole
     content of 「夜の部分は完全に夜間光レイヤーと同じ画像に」. */
  function drawLights(ctx,W,H){
    ctx.clearRect(0,0,W,H);
    const rows=(()=>{ try{ return GE().layers.imageRowLatitudes(COORDS,H); }catch(_){ return null; } })();
    const S=solar(new Date(clockMs()));
    const out=ctx.createImageData(W,H), o=out.data;
    const L=lights;
    const sinDec=Math.sin(S.dec), cosDec=Math.cos(S.dec);
    const th0=D*(280.16+360.9856235*S.d)-S.ra;
    /* per COLUMN: cos H, and the source column */
    const cosH=new Float64Array(W), sx=new Int32Array(W);
    for(let c=0;c<W;c++){ const lng=-180+360*(c+0.5)/W;
      cosH[c]=Math.cos(th0+D*lng);
      sx[c]=L?Math.max(0,Math.min(L.w-1,Math.round((lng+180)/360*L.w))):0; }
    const SIN_DAY=0, SIN_NIGHT=Math.sin(TWILIGHT_END*D);   /* the two ends of the ramp, as sines */
    const y0=Math.log(Math.tan(Math.PI/4+LIM*D/2));
    const U0=UNLIT[0], U1=UNLIT[1], U2=UNLIT[2];
    for(let r=0;r<H;r++){
      const lat=rows?rows[r]:(LIM-(2*LIM)*(r+0.5)/H);
      const ph=lat*D, a=Math.sin(ph)*sinDec, b=Math.cos(ph)*cosDec;
      /* the source mosaic is Web-Mercator, so its own row for this latitude is a Mercator lookup */
      const my=Math.log(Math.tan(Math.PI/4+Math.max(-LIM,Math.min(LIM,lat))*D/2));
      const sy=L?Math.max(0,Math.min(L.h-1,Math.round((y0-my)/(2*y0)*L.h))):0;
      const rowBase=L?sy*L.w:0, oBase=r*W*4;
      for(let c=0;c<W;c++){
        const k=oBase+c*4;
        const sinEl=a+b*cosH[c];
        if(sinEl>=SIN_DAY){ o[k+3]=0; continue; }        /* day: nothing to draw, and no arithmetic */
        let n;
        if(sinEl<=SIN_NIGHT) n=1;
        else { const t=Math.asin(sinEl)/D/TWILIGHT_END; n=t*t*(3-2*t); }
        if(L){ const j2=(rowBase+sx[c])*4; o[k]=L.d[j2]; o[k+1]=L.d[j2+1]; o[k+2]=L.d[j2+2]; }
        else { o[k]=U0; o[k+1]=U1; o[k+2]=U2; }
        o[k+3]=n>=1?255:Math.round(255*n);
      }
    }
    ctx.putImageData(out,0,0);
  }

  function zoomNow(){ try{ const c=GE().camera.get(); return (c&&isFinite(c.zoom))?c.zoom:99; }catch(_){ return 99; } }

  /* ══ (#R196) THIS IS THE MapLibre IMPLEMENTATION OF SOMETHING CESIUM ALREADY HAS ══════════════════
     ⚠ MEASURED, AND IT WAS A REAL REGRESSION. Built on Cesium, these layers stopped the camera:
     `tests/r182-cesium.spec.js` ③ («easeTo lands on the camera it was asked for») passed on main in
     33.8 s and FAILED here — the camera never left its starting longitude at all — and passed again
     the moment this module was switched off. Whole-globe clamped-to-ground polygons are not a cheap
     thing to hand Cesium, and a scene that cannot finish a frame cannot finish a camera flight.

     It is also unnecessary there. Cesium's globe has REAL solar lighting (`globe.enableLighting`),
     and js/cesium-engine.js turns it on from exactly the call this round now makes for every
     basemap — `scene.setSunDirection()`, the same one that aims MapLibre's atmosphere. So Cesium
     gets its night side from its own renderer, computed per fragment, and this module is what gives
     MapLibre — which has no such thing — the same effect.
     ⚠ WHAT CESIUM THEREFORE DOES NOT HAVE is the zoom ramp and the VIIRS city lights. Cesium's
     ImageryLayer has `dayAlpha`/`nightAlpha` for exactly that; wiring the Black Marble layer through
     them is the way to do it there, and it is NOT done here rather than shipped unverified. */
  function engineIsMapLibre(){ try{ return GE().id()==='maplibre'; }catch(_){ return true; } }
  function build(){
    if(built) return true;
    if(!engineIsMapLibre()) return false;
    try{ if(!GE().hasRenderer()||!GE().canDraw()) return false; }catch(_){ return false; }
    const b=beforeId();
    try{
      /* ① the image. It carries the whole gradient and needs no network to be correct — the mosaic
         only replaces UNLIT with the real product where there is one. */
      const N=imgSize();
      GE().layers.addDynamicImage(DYN,{ width:N, height:N, coordinates:COORDS, opacity:RAMP, draw:drawLights,
        attribution:'City lights: NASA EOSDIS GIBS — VIIRS Black Marble' }, b);
      /* ② the polar caps, which the quad cannot reach */
      if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:capFC(new Date(clockMs()))});
      if(!GE().layers.has(LYR)) GE().layers.add({ id:LYR, type:'fill', source:SRC,
        paint:{ 'fill-color':UNLIT_HEX, 'fill-opacity':capOpacity(), 'fill-antialias':false } }, b);
      if(!GE().layers.has(LYR)){        /* addLayer swallows a rejected paint expression (#R196) */
        lastErr='cap-expression';
        GE().layers.add({ id:LYR, type:'fill', source:SRC,
          paint:{ 'fill-color':UNLIT_HEX, 'fill-opacity':ramp(0.95), 'fill-antialias':false } }, b);
      }
      if(!GE().layers.hasDynamicImage(DYN)) return false;
    }catch(_){ return false; }
    built=true;
    /* ⚠ THE MOSAIC IS NOT ON THE BOOT PATH. The app opens at zoom 1.7, and #R192/#R193/#R195 each
       spent part of a round taking megabytes OFF that path (Köppen, cshapes, the 4.3 MB border
       geometry). The night side is already complete and correctly shaped without it, so the tiles
       are fetched on the first idle — z2 for the lights to appear, then z3 to match the canvas.
       Same escape hatch as js/world-base.js: an idle can be delayed indefinitely by one slow tile,
       so there is a timeout behind it. */
    const _lights=()=>{ loadLights(2).then((L)=>{ if(!built) return;
      if(L) refresh(true);
      const z=mosaicZ(); if(z<=2||!L) return;
      const _fine=()=>{ loadLights(z).then((L2)=>{ if(built&&L2&&lightsZ>=z) refresh(true); }); };
      try{ if(window.requestIdleCallback) requestIdleCallback(_fine,{timeout:12000}); else setTimeout(_fine,4000); }
      catch(_){ setTimeout(_fine,4000); }
    }); };
    try{ if(window.requestIdleCallback) requestIdleCallback(_lights,{timeout:6000}); else setTimeout(_lights,2500); }
    catch(_){ setTimeout(_lights,2500); }
    return true;
  }
  /* ⚠ (#R212) NO EARLY RETURN ON `built`. 「（追記：オフにしてもオフにならない。）」 was not reproducible
     in this environment — a headless preview never finishes the style, so the night side never builds
     and there is nothing to turn off — so nothing here is a guess at the mechanism. What IS certain is
     that `built` is this module's own bookkeeping and the LAYERS are the truth: a style reload, a
     basemap swap or a second module re-adding them all leave the image on screen with `built` false,
     and the old guard made «off» a no-op in exactly that state. Removing is idempotent, so it now
     always runs. (The other half of the report is answered in js/app-body.js: the Settings control
     applies the moment it changes, instead of only on Apply.) */
  function destroy(){
    try{ GE().layers.removeDynamicImage(DYN); }catch(_){}
    try{ if(GE().layers.has(LYR)) GE().layers.remove(LYR); }catch(_){}
    try{ if(GE().layers.hasSource(SRC)) GE().layers.removeSource(SRC); }catch(_){}
    const was=built; built=false; lastKey=''; return was;
  }

  /* repaint when the SUN has moved enough to matter (a quarter degree ≈ one minute of rotation) */
  function refresh(force){
    if(!enabled) return false;
    if(!built) return false;
    const ms=clockMs();
    const key=String(Math.round(ms/60000));
    if(!force&&key===lastKey) return false;
    lastKey=key;
    try{ GE().layers.setSourceData(SRC,capFC(new Date(ms))); }catch(_){}
    try{ if(GE().layers.hasDynamicImage&&GE().layers.hasDynamicImage(DYN)) GE().layers.touchDynamicImage(DYN); }catch(_){}
    return true;
  }

  /* ⚠ built LAZILY. A session that never leaves street level pays nothing: no layers, no GIBS
     request, no arithmetic — the check below is a zoom comparison on moveend. */
  /* ⚠ (#R196) NOTHING THIS MODULE DOES HAPPENS INSIDE A GESTURE. `consider` is called from `moveend`,
     which is the busiest moment in the app: the renderer is uploading tiles, every other layer is
     reacting, and two tests measure exactly that window — tests/r170 gives a freshly ticked layer
     1,500 ms to paint, and tests/r186's aircraft sweep zooms out and then has ten seconds to observe
     a re-plan. Building a source and a layer there is work in the wrong place even when it is small,
     so the whole build is deferred to the first IDLE after the camera settles. The effect is only
     visible at whole-Earth zooms, where nobody is waiting on a frame; the cost of being a moment late
     is nothing, and the cost of being early is a test that measures the app's responsiveness. */
  let _pend=0;
  function consider(){
    if(!enabled||!engineIsMapLibre()) return;
    if(zoomNow()>ZMAX+0.4){ return; }
    if(built){ refresh(false); return; }
    if(_pend) return; _pend=1;
    const go=()=>{ _pend=0;
      if(!enabled||zoomNow()>ZMAX+0.4) return;      /* the camera moved on while we waited */
      if(build()) refresh(true); };
    try{ if(window.requestIdleCallback) requestIdleCallback(go,{timeout:2500}); else setTimeout(go,700); }
    catch(_){ setTimeout(go,700); }
  }
  function wire(){
    if(wired) return; wired=true;
    try{ GE().events.on('moveend',consider); }catch(_){}
    try{ if(window.IntMapTime&&window.IntMapTime.on) window.IntMapTime.on(()=>{ refresh(true); }); }catch(_){}
    /* the sub-solar point moves 15° an hour — the same cadence app-body re-aims the light on */
    setInterval(()=>{ try{ if(!document.hidden) refresh(false); }catch(_){} },60000);
  }

  function apply(){ wire(); consider(); return built; }
  /* ══ (#R210) THE USER MAY TURN THE DAY/NIGHT SIDE OFF, AND IT STAYS OFF ═══════════════════════
     「設定から、昼夜を表示するのをオフにできるように。（…これまで通りデフォルトではオンです。）」
     Atlas could already flip `enabled` (case 'nightSide'), but nothing remembered the answer, so a
     reload brought the night back. The key is written ONLY when the user says off — an absent key
     means on, so the default survives both a fresh profile and a cleared storage. */
  const PREF_KEY='intmap_night_side';
  function prefOn(){ try{ return localStorage.getItem(PREF_KEY)!=='0'; }catch(_){ return true; } }
  function setEnabled(v){ enabled=!!v;
    try{ if(enabled) localStorage.removeItem(PREF_KEY); else localStorage.setItem(PREF_KEY,'0'); }catch(_){}
    if(!enabled) destroy(); else consider(); return enabled; }
  /* Read the saved answer before anything draws. `enabled` starts true above, so this only ever
     turns it off — a stored '0' is the one thing that can. */
  try{ if(!prefOn()) enabled=false; }catch(_){}

  return { apply, refresh:()=>refresh(true), setEnabled, destroy, isOn:()=>enabled,
    state:()=>({ built, enabled, lights:!!lights, lightsZoom:lightsZ, err:lastErr, zoom:zoomNow(),
                 zMax:ZMAX, twilightEnd:TWILIGHT_END, imgSize:imgSize(), capWedges:CAP_WEDGES,
                 capLat:CAP_LAT, ramp:RAMP_STOPS.map((s)=>s.slice()), unlit:UNLIT.slice() }),
    /* pure, so the arithmetic can be checked without a renderer */
    _nightAt:(lng,lat,date)=>nightAt(solar(date||new Date(clockMs())),lng,lat),
    _capFC:(date)=>capFC(date||new Date(clockMs())) };
})();
