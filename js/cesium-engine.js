/* ============================================================================
 *  IntMap · THE SECOND ENGINE — CesiumJS behind the same contract  (#R180)
 * ----------------------------------------------------------------------------
 *  「デフォルトはこれまで通りMapLibreだが、設定から選択すれば、Cesiumも選べるように。」
 *
 *  This file implements the SAME object js/geo-engine.js's MapLibre adapter
 *  implements, and is installed with `IntMapGeoEngine.use(adapter)` before the
 *  app builds its view. Nothing else in the project changes: #R178–#R180 took
 *  the renderer references outside the seam from 2,037 to one, so every camera
 *  move, layer add, popup and gesture in the app already speaks the contract.
 *
 *  ── WHY IT IS NOT A DROP-IN, AND WHAT THAT COSTS ────────────────────────────
 *  MapLibre's camera is (centre, zoom, pitch, bearing) with a Mercator world
 *  measured in pixels; Cesium's is a position and an orientation in ECEF metres.
 *  Neither is convertible to the other by renaming fields, so this file carries
 *  one honest transcription of the mapping — see the CAMERA block — derived from
 *  the same geometry #R177 transcribed for the MapLibre side, so that "the same
 *  view" really is the same view when the setting is switched. The pitch
 *  convention differs by exactly 90° (MapLibre 0 = straight down = Cesium −90),
 *  which is why MapLibre's whole 0–180° range maps onto Cesium's −90…+90 without
 *  a discontinuity, and why capabilities.tiltRange is honestly [0,180] here too.
 *
 *  ── KEYLESS, LIKE THE REST OF THE APP ───────────────────────────────────────
 *  No Cesium Ion token, no account, no `Ion.defaultAccessToken`. Imagery comes
 *  from the app's own raster sources — including the `imapsat://` protocol, so
 *  #R158's grey-placeholder repair and #R178/#R179's HiDPI stitching apply here
 *  too — and terrain from the same AWS terrarium DEM the MapLibre side streams.
 *  A Cesium session downloads nothing the app was not already fetching except
 *  the engine itself.
 *
 *  ── LOADED ONLY WHEN CHOSEN ─────────────────────────────────────────────────
 *  `import('cesium')` is dynamic and lives inside boot(), so Rollup emits it as
 *  its own chunk and a MapLibre session — the default — transfers zero bytes of
 *  it. js/engine-select.js decides, before DOMContentLoaded, which one runs.
 * ==========================================================================*/
window.IntMapCesiumEngine=(function(){
  'use strict';
  const S=()=>window.IntMapStyle;
  const CL=()=>window.IntMapCesiumLayers;
  const VT=()=>window.IntMapVectorTiles;

  let Cesium=null;

  /* ══ TILE PROTOCOLS ARE ENGINE-LEVEL, NOT PER-VIEW ═══════════════════════════
     A near miss worth recording, because it would have shipped looking fine.
     `maplibregl.addProtocol` is a STATIC registration, so app-body.js registers
     the satellite protocol (`imapsat://`, which is where #R158's grey-placeholder
     repair and #R178/#R179's HiDPI stitching live) at line 940 — thirty lines
     BEFORE it asks the contract for a view at line 973. A per-view registry is
     empty at that moment, so the handler would have been dropped on the floor,
     and nothing would have said so: the satellite layer boots with
     `visibility:'none'`, so the map looks perfectly correct until somebody turns
     it on and gets a blank layer.
     So the registry lives here, outside every view, which is also what it IS —
     a scheme handler is a property of the app, not of a canvas. */
  const PROTOCOLS=Object.create(null);

  /* Cesium resolves its Workers/, Assets/ and ThirdParty/ against this. The Vite
     build copies them to dist/cesium/ (see vite.config.js) and the dev server
     serves them from node_modules through the same path, so one value works in
     both. Set BEFORE the import, because the module reads it at evaluation. */
  function baseUrl(){
    try{ if(window.CESIUM_BASE_URL) return window.CESIUM_BASE_URL; }catch(_){}
    try{
      const b=document.querySelector('base');
      const root=(b&&b.getAttribute('href'))||'./';
      return new URL('cesium/',new URL(root,location.href)).href;
    }catch(_){ return './cesium/'; }
  }
  /* (#R184) How many MSAA samples a screen of this pixel density can actually show. See the
     constructor for the measurement and the reasoning; declared here so it is one rule rather than
     an expression buried in an options literal, and so a test can call it directly.
       dpr 1  → 4  (an edge is one pixel wide; this is what shipped and it does not change)
       dpr 2  → 2  (4 device pixels per CSS pixel already; 4× MSAA would be 16 samples)
       dpr 3+ → 1  (9 device pixels per CSS pixel — the display is the anti-aliasing) */
  function _msaaFor(dpr){ const d=+dpr||1; return d>=3?1:d>=2?2:4; }
  let _loadP=null;
  function loadCesium(){
    if(_loadP) return _loadP;
    _loadP=(async()=>{
      try{ window.CESIUM_BASE_URL=baseUrl(); }catch(_){}
      const mod=await import('cesium');
      Cesium=mod.default&&mod.default.Cartesian3?mod.default:mod;
      /* Ion is never contacted: no token is set and no Ion asset is requested.
         Blanking the default token makes an accidental Ion call fail loudly in
         development rather than silently phoning home in production. */
      try{ if(Cesium.Ion) Cesium.Ion.defaultAccessToken=undefined; }catch(_){}
      return Cesium;
    })();
    return _loadP;
  }

  /* ══ CAMERA — ONE transcription of the mapping, as #R177 did for MapLibre ═══
     ---------------------------------------------------------------------------
     MapLibre sizes its camera from the CANVAS: the eye sits
     `cameraToCenterDistance` PIXELS from the map centre, where that distance is
     `0.5/tan(fovy/2) · canvasHeight`, and a pixel at the centre is
     `2πR·cos(lat) / (tileSize·2^zoom)` ground metres. Multiply and the eye is a
     real distance in metres — which is the one number Cesium needs.

       range(lat, zoom) = 2πR·cos(lat) / (512·2^zoom) · 0.5/tan(fovy/2) · H
       zoom(lat, range) = log2( 2πR·cos(lat) · 0.5/tan(fovy/2) · H / (512·range) )

     The two are exact inverses, which is what makes "the same view" survive a
     switch of engine, and what lets getZoom() answer a question Cesium does not
     have a field for. `fovy` is forced to MapLibre's own 0.6435 rad on every
     resize (Cesium's frustum.fov is the HORIZONTAL angle when the canvas is
     wider than it is tall, so it is converted, not assigned).
     ═════════════════════════════════════════════════════════════════════════ */
  const R_EARTH=6371008.8, TILE=512, D2R=Math.PI/180;
  const ML_FOVY=0.6435011087932844;                 /* MapLibre Transform's default _fov */

  function viewFactory(){

  class CesiumView {
    constructor(opts){
      const o=opts||{};
      this.opts=o;
      this._container=(typeof o.container==='string')?document.getElementById(o.container):o.container;
      if(!this._container) throw new Error('cesium: no container');
      this._handlers=Object.create(null);          /* event name → [fn] */
      this._layerHandlers=[];                      /* {type, layerId, fn} */
      this._sources=new Map();                     /* id → source record */
      this._layers=[];                             /* ordered [{def, kind, ds|imagery}] */
      this._layerById=new Map();
      this._states=new Map();                      /* "source[/sourceLayer]" → { featureId → state } */
      this._images=Object.create(null);
      this._minZoom=(o.minZoom==null?0:o.minZoom);
      this._maxZoom=(o.maxZoom==null?22:o.maxZoom);
      this._maxPitch=85; this._minPitch=0;
      this._padding={top:0,right:0,bottom:0,left:0};
      this._terrainSpec=null;
      this._dem=CL().makeDemCache();
      this._vec=CL().makeVectorRenderer(Cesium);
      this._dirty=new Set();                       /* layer ids whose entities need rebuilding */
      this._raf=0; this._loaded=false; this._styleParsed=false;
      this._gestures=Object.create(null);
      this._maxFeatures=(o.maxFeaturesPerLayer||12000);
      this._maxLabels=(o.maxLabels||320);
      /* the same desktop/mobile split the rest of the app makes — see makeTerrainProvider */
      if(o.terrainSamples==null){
        const mob=/Mobi|Android|iPhone|iPad/.test(navigator.userAgent||'');
        this.opts=Object.assign({},o,{ terrainSamples:mob?65:129 });
      }
      this._decl=null;

      /* CesiumWidget, not Viewer: the Viewer's furniture (timeline, animation,
         base-layer picker, geocoder) is Ion-backed UI this app already has its
         own version of, and every one of them is weight a map does not need. */
      this._widget=new Cesium.CesiumWidget(this._container,{
        baseLayer:false,                            /* NO Ion imagery — the app supplies its own */
        /* ══ (#R186) THE REAL SKY, WHICH THIS ENGINE ALREADY HAD ══════════════════════════════
           「実際の時刻や位置に忠実な星空、遠くに見える太陽にして。」
           `skyBox:false` was switching off the one thing that answers this exactly. Left
           undefined, CesiumWidget builds SkyBox.createEarthSkyBox() — the Tycho-2 star map that
           ships in Assets/Textures/SkyBox/ — and, in the same branch, a real Sun and Moon. The
           star cube is oriented by Transforms.computeIcrfToFixedMatrix at the scene's own time,
           so it turns with sidereal time and is correct for the viewer's position by
           construction; the Sun and Moon are drawn at their computed ephemeris positions. This
           is not decoration made to look astronomical — it is the same class of thing
           js/space-sky.js builds for MapLibre, and it was already in the bundle.
           The clock those positions are read from is driven from the app's master clock below,
           so the time machine moves the sky. */
        skyAtmosphere:new Cesium.SkyAtmosphere(),
        requestRenderMode:true, maximumRenderTimeChange:Infinity,
        scene3DOnly:false,
        contextOptions:{ webgl:{ alpha:false, antialias:o.antialias!==false, preserveDrawingBuffer:!!o.preserveDrawingBuffer,
                                 powerPreference:'high-performance' },
                         requestWebgl1:false },
        /* ══ (#R184) HOW MUCH MULTISAMPLING, AND WHY IT DEPENDS ON THE SCREEN ═════
           MSAA smooths GEOMETRY edges — the globe's limb and the terrain silhouette
           against the sky. How many samples that needs is a fact about the DISPLAY,
           not about the scene: at devicePixelRatio 2 every CSS pixel already holds
           four device pixels, so 4× MSAA on top is sixteen samples per CSS pixel
           and no screen resolves the last twelve. The cost, meanwhile, is paid on
           the whole frame — this is the biggest single item in a 3-D satellite
           frame after the imagery itself.
           So the sample count comes DOWN as the pixel density goes UP, and at 1×
           (where an edge really is one pixel wide) it stays at 4 — unchanged from
           what shipped. Nothing here trades quality for speed; it declines to pay
           for samples the display cannot show. */
        msaaSamples:(o.antialias===false?1:_msaaFor(o.pixelRatio||(window.devicePixelRatio||1))),
        /* ══ THE SAME HALF-RESOLUTION DEFECT, IN THE NEW ENGINE ═══════════════════
           Cesium's default is `useBrowserRecommendedResolution: true`, which sizes
           the drawing buffer in CSS PIXELS and ignores devicePixelRatio entirely —
           so on a 2× display the whole globe, terrain silhouette and every label
           would be rendered at half the resolution the screen can show and then
           upscaled. That is exactly the defect #R178 measured in the satellite
           tiles and #R179 found again in the base map, arriving a third time
           through a different door, and it is worth catching here because it is
           invisible in a screenshot taken at 1×.
           Turning it off makes Cesium render at devicePixelRatio × resolutionScale,
           so the scale is set to hit the app's OWN policy — full device resolution
           on desktop, capped at 2× on phones (a DPR-3 screen otherwise shades 9×
           the fragments of DPR-1, which is the #3 cause of mobile stutter). */
        useBrowserRecommendedResolution:false
      });
      try{
        const want=o.pixelRatio||(window.devicePixelRatio||1);
        this._widget.resolutionScale=Math.max(0.5,want/(window.devicePixelRatio||1));
      }catch(_){}
      const scene=this._scene=this._widget.scene;
      this._camera=scene.camera;
      this._globe=scene.globe;
      this._globe.baseColor=Cesium.Color.fromCssColorString('#0b1220');
      /* ══ (#R186) THE BLACK POLES ═══════════════════════════════════════════════════════════════
         「Cesiumでは南極・北極付近が衛星画像のない真っ黒だから、どうにかして。」
         Not a tile that failed: Web Mercator is defined to ±85.0511° and this engine draws the
         Earth to ±90°, so for the two caps there is NO tile in any of the app's sources to ask for
         — every one of them is a WebMercatorTilingScheme. What showed there was `baseColor`.
         The fix is a source that is not Mercator. data/world-basemap.jpg is the bundled
         equirectangular NASA Blue Marble the MapLibre side uses as its no-wait floor
         (js/world-base.js); as a single whole-globe tile with a GeographicTilingScheme it covers
         −180…180 by −90…90, poles included, and sits at the BOTTOM of the imagery collection —
         `_reorderImagery` raises every app layer above whatever else is in there, so it stays
         underneath without any ordering work. Where Mercator imagery exists it is completely
         hidden by it; where none can exist, it is real satellite imagery instead of black. */
      /* ══ (#R187) …AND ONE 2,048 × 1,024 PICTURE IS NOT A POLAR CAP ═════════════════════════════
         「Cesiumでは南極・北極付近が衛星画像のない真っ黒だから、どうにかして。」— re-reported.

         #R186's diagnosis above is right and its cure was half a cure. Screenshotted at the poles:
         they are no longer black, they are a RADIAL SMEAR. An equirectangular image has one row of
         pixels for its topmost 0.176° of latitude, and a single whole-globe tile hands that one row
         to the entire polar cap, so it is stretched into streaks radiating from the axis — and being
         permanently on, that bright blue smear also sat on top of the DARK basemap in Map mode,
         where nothing about it belongs.

         The real answer is a source that is genuinely tiled AND genuinely reaches ±90°. NASA GIBS
         publishes exactly that: EPSG:4326 (geographic, not Mercator) WMTS, nine levels down to 500 m,
         `Access-Control-Allow-Origin: *`, and its level-0 grid is 2 × 1 tiles — which is Cesium's
         GeographicTilingScheme default, so the two line up without a custom scheme. Verified against
         the live service (z2, z4 and BlueMarble_NextGeneration all answer 200 image/jpeg). At the
         cap the projection still converges, as every equirectangular source must, but it converges
         from 500-metre imagery instead of from one row, so what is drawn there is Antarctica.

         The bundled picture stays UNDERNEATH as the offline floor: if GIBS is unreachable the caps
         are still imagery rather than baseColor, which is the failure mode #R186 was fixing.

         And both now FOLLOW THE BASEMAP (setWorldBase, driven by js/world-base.js) — satellite view
         gets the imagery, map view gets the map's own baseColor back. */
      /* ══ (#R188) …AND A CAP THAT IS ONLY LIT IN SATELLITE VIEW IS STILL A BLACK CAP ═══════════════
         「Cesiumでは南極・北極付近が衛星画像のない真っ黒だから、どうにかして。」— reported a third time.

         Measured before changing anything, at the pole, on the built app:

             satellite basemap, 88°S, z3  →  mean channel 239.3 / 255, dark pixels 0 %
             MAP basemap,       88°S, z3  →  mean channel   0.56/ 255, dark pixels 99.4 %
             MAP basemap,       88°N, z3  →  mean channel  12.0 / 255, dark pixels 99.99 %

         So #R187's imagery works — and #R187 also tied it to the SATELLITE basemap, on the reasoning
         that a satellite picture peeking through a street map is a different map. The app opens in
         MAP view, which is where the caps are 0.56/255. The half that was fixed is not the half
         anybody looks at.

         The cure is not to un-tie it but to make the cap wear the map's clothes. Cesium's
         ImageryLayer carries the same colour controls the app's own basemap rasters already use
         (#R34 measured the Carto dark tiles and chose saturation/brightness/contrast for them), so
         the polar bands are now ALWAYS shown and simply switch treatment with the basemap:
         untouched under satellite, and desaturated + level-matched under the map, dark or light.
         What lands there is real 500-metre imagery of real ice in the map's own palette, instead of
         `baseColor`.

         ⚠ The bundled whole-globe picture is a different object and still follows the satellite view
         alone: it is ONE equirectangular tile, so at the cap it is the radial smear #R187 replaced,
         and it has no business under a street map. It stays the offline floor for satellite view. */
      this._worldBase=[];       /* everything that follows the satellite basemap */
      this._polarBase=[];       /* the two polar bands — always on, treatment follows the basemap */
      try{
        const rect=Cesium.Rectangle.fromDegrees(-180,-90,180,90);
        /* Hidden until told otherwise: js/world-base.js is the single authority on whether the
           satellite view is on, and app-body calls it once the map loads — which is always AFTER
           this constructor, because changing engine is a reload (js/engine-select.js).
           ⚠ Each provider reads this flag when it RESOLVES, not a value captured now: the tiled one
           is created synchronously but the bundled floor arrives from a promise, and setWorldBase()
           can easily land in between. */
        this._wantWorldBase=false;
        /* ⚠ EVERY INSERT IS AT INDEX 0, AND THAT IS NOT A STYLE CHOICE. The imagery collection is
           EMPTY when this constructor runs — the app's own layers arrive later — so `add(layer, 1)`
           is out of range and throws, which is precisely how the tiled provider silently failed to
           be added the first time (measured: `_worldBase.length === 1`, and the cap on screen was
           still the stretched single tile). Index 0 is always valid, and because the bundled floor
           resolves from a promise it lands AFTER the tiled layer and therefore below it — which is
           the order wanted anyway: the offline picture underneath, the real imagery over it. */
        const add=(prov,polar)=>{ try{ const L=new Cesium.ImageryLayer(prov,{});
          /* (#R188) a polar band is shown whatever the basemap is; only its treatment changes */
          L.show=polar?true:!!this._wantWorldBase;
          this._scene.imageryLayers.add(L,0); (polar?this._polarBase:this._worldBase).push(L);
          this._scene.requestRender(); return L; }catch(e){ console.warn('[cesium] whole-globe imagery layer rejected',e); return null; } };
        /* ⚠ GIBS'S EPSG:4326 GRID IS NOT A QUADTREE, AND ASSUMING IT WAS DREW A BLACK CAP.
           Cesium's default GeographicTilingScheme doubles from 2 × 1, so it asked for 2/3/3 and got
           `TileOutOfRange` — measured against the live service, and confirmed from the service's own
           capabilities, which declare the 500 m matrices as
               L0 2×1   L1 3×2   L2 5×3   L3 10×5   L4 20×10   L5 40×20   L6 80×40   L7 160×80   L8 320×160
           The first three levels are ceil-rounded and their tiles are not even square (72°×60° at
           L2), so no doubling scheme can express them. From L3 ON it is exactly a doubling of 10 × 5
           square 36° tiles — so THAT is the pyramid, entered at its own level 0, with `customTags`
           adding the three GIBS levels back onto the path. Nothing here is a guess: every dimension
           comes from WMTSCapabilities.xml, and every level this asks for answered 200. */
        /* ⚠ AND IT IS SCOPED TO THE CAPS, WHICH ARE ITS ONLY JOB. Given the whole globe as its
           rectangle, this layer fetches tiles for wherever the camera is — including 3 km over the
           Alps with a flight simulator running, where every one of them is hidden behind the app's
           own satellite imagery and none of them is why the layer exists. Measured: on a CI runner
           with no GPU that extra traffic was enough to make tests/r184-cesium-fs fail three times
           out of three (「the aircraft flies and the camera is at the aircraft」) while main was
           green. Web Mercator ends at ±85.0511°, so the two bands beyond it are exactly the ground
           no other source can cover, and Cesium only requests tiles that intersect a layer's
           rectangle — so away from the poles this now costs nothing at all. */
        /* ══ (#R189) …AND A CAP WHOSE IMAGERY IS A LIVE URL IS BLACK WHEREVER THAT URL IS NOT. ═════
           Fourth report. #R188's bands and treatment measure correct on this machine — but the bands
           are a NETWORK dependency with no failure path: if gibs.earthdata.nasa.gov cannot be
           reached (offline, DNS, a corporate proxy, an Earthdata outage), the band layers render
           nothing, and in MAP view the bundled floor underneath is hidden (`show=_wantWorldBase`),
           so what shows is `baseColor` — the original black, on someone else's network. The floor
           was kept satellite-only because one equirectangular row smeared over a cap is worse than
           a proper tile (#R187) — but it is NOT worse than black. So the bands' errorEvent now arms
           a fallback: the moment a polar tile actually fails, the bundled floor is shown in map
           view too, wearing the same map treatment as the bands. While GIBS answers, nothing
           changes — the fallback only exists where the report exists. */
        this._polarFallback=false;
        if(Cesium.UrlTemplateImageryProvider&&Cesium.GeographicTilingScheme){
          const MERC_EDGE=85.0511287798066;
          [[MERC_EDGE,90],[-90,-MERC_EDGE]].forEach(([s,n])=>{
            const band=new Cesium.UrlTemplateImageryProvider({
              url:'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/{gibsZ}/{y}/{x}.jpeg',
              customTags:{ gibsZ:(prov,x,y,level)=>level+3 },
              tilingScheme:new Cesium.GeographicTilingScheme({numberOfLevelZeroTilesX:10,numberOfLevelZeroTilesY:5}),
              tileWidth:512, tileHeight:512, minimumLevel:0, maximumLevel:5,
              rectangle:Cesium.Rectangle.fromDegrees(-180,s,180,n),
              credit:'NASA EOSDIS GIBS — Blue Marble (shaded relief + bathymetry)'
            });
            try{ if(band.errorEvent&&band.errorEvent.addEventListener)
              band.errorEvent.addEventListener(()=>{ if(!this._polarFallback){ this._polarFallback=true; this._polarTreatment(); } }); }catch(_){}
            add(band,true);
          });
        } else { this._polarFallback=true; }   /* no band at all (trimmed build) → the floor is all there is */
        /* (#R190) the COLOUR-MATCHED picture, not the file: js/world-base.js maps the bundled Blue
           Marble onto the Esri World Imagery tone the satellite tiles actually have, so this floor no
           longer changes colour the moment the tiles land. `bitmapUrl()` is a promise for a blob of
           that canvas and falls back to the plain file if the export is refused. */
        const _wb=window.IntMapWorldBase;
        const worldUrlP=(_wb&&_wb.bitmapUrl)?_wb.bitmapUrl()
          :Promise.resolve((_wb&&_wb.url&&_wb.url())||new URL('data/world-basemap.jpg',document.baseURI).toString());
        worldUrlP.then(worldUrl=>{
          if(Cesium.SingleTileImageryProvider&&Cesium.SingleTileImageryProvider.fromUrl){
            Cesium.SingleTileImageryProvider.fromUrl(worldUrl,{rectangle:rect,tileWidth:2048,tileHeight:1024})
              .then(add).catch(e=>console.warn('[cesium] bundled whole-globe floor unavailable',e));
          } else if(Cesium.SingleTileImageryProvider){
            add(new Cesium.SingleTileImageryProvider({url:worldUrl,rectangle:rect}));
          }
        }).catch(e=>console.warn('[cesium] bundled whole-globe floor unavailable',e));
        /* (#R188) the map's palette is a theme decision, and the theme changes without the basemap
           changing — so re-run the treatment on the same signal js/space-sky.js watches. */
        this._polarTreatment();
        try{ new MutationObserver(()=>this._polarTreatment())
               .observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']}); }catch(_){}
      }catch(e){ console.warn('[cesium] whole-globe base imagery',e); }
      /* ══ (#R186) THE SKY FOLLOWS THE APP'S CLOCK, NOT ITS OWN ══════════════════════════════════
         The star box, the Sun and the Moon are all read from `widget.clock.currentTime`, and a bare
         Cesium clock free-runs on the system clock. That is right while the app is live — and wrong
         the moment the time machine moves, which is the whole reason IntMap has ONE master clock
         (window.IntMapTime, #R94). So the widget's clock is pushed from it: pinned when the user is
         viewing another moment, free-running when they are back at now.
         ⚠ requestRenderMode is on, so nothing redraws unless something asks. A sky that is correct
         and never repainted is a sky frozen at boot, which would look exactly like the bug this
         replaces — hence the slow heartbeat. 30 s is a quarter of a degree of sidereal rotation. */
      try{
        const syncClock=()=>{ try{
          const T=window.IntMapTime; const c=this._widget&&this._widget.clock; if(!c) return;
          let ms=null, live=true;
          /* ⚠ (#R200) `T.now` is not on window.IntMapTime (see js/theme-sky.js), so `ms` stayed null
             and the `if(ms==null) return;` below made this heartbeat a no-op: Cesium's clock — and
             therefore its real solar lighting — never followed the master clock at all. */
          if(T&&T.when){ const d=T.when(); const v=(d instanceof Date)?d.getTime():+d; if(isFinite(v)) ms=v; }
          try{ if(T&&T.isLive) live=!!T.isLive(); }catch(_){}
          if(ms==null) return;
          c.shouldAnimate=live;
          if(!live||Math.abs(Cesium.JulianDate.toDate(c.currentTime).getTime()-ms)>1000)
            c.currentTime=Cesium.JulianDate.fromDate(new Date(ms));
          this._scene.requestRender();
        }catch(_){} };
        syncClock();
        try{ if(window.IntMapTime&&window.IntMapTime.on) window.IntMapTime.on(syncClock); }catch(_){}
        this._skyTick=setInterval(()=>{ if(!document.hidden) syncClock(); },30000);
      }catch(_){}
      this._globe.showGroundAtmosphere=true;
      this._globe.depthTestAgainstTerrain=false;    /* markers must not sink into a hill */
      this._globe.enableLighting=false;
      scene.highDynamicRange=false;
      /* ══ (#R189) THE CACHE WAS THE DEFAULT, AND THE DEFAULT IS A HUNDRED TILES ═══════════════════
         `tileCacheSize` was never set, so it sat at Cesium's default 100 — about one screenful.
         Panning away and back re-downloaded (or at best re-decoded) everything, which is exactly
         where #R185 measured the cost living: in the frames where the camera MOVES. 512 desktop /
         256 mobile is a 5× working set at a bounded memory cost.
         ⚠ `preloadSiblings` was tried here and WITHDRAWN the same round: it keeps
         `globe.tilesLoaded` churning (every loaded tile queues eight more), and both the app's own
         settle logic and tests/r180-cesium wait on that flag — measured on CI as r180 ⑥ and
         r184-fs ② timing out three retries straight, on runners where R188 was green. A knob that
         changes the meaning of "the globe is quiet" is not a performance setting.
         (#R190) 512 → 768 on desktop (256 → 320 on phones). Same knob, same argument, one more step:
         the working set that a tilt-and-pan back over a city touches is bigger than one screenful of
         terrain meshes plus their imagery, and this is the only cache between it and the network. It
         changes no flag anyone waits on — which is precisely the property `preloadSiblings` lacked. */
      try{ const _mob=/Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
        this._globe.tileCacheSize=_mob?320:768; }catch(_){}
      /* ══ (#R184) FXAA IS NOT A SECOND OPINION ON TOP OF MSAA — IT IS A BLUR ═══════════
         This used to run FXAA AND MSAA together, on the reasoning that MSAA smooths
         geometry edges while FXAA also smooths the textured interior. Measured on one
         frozen 3-D satellite scene over the Alps, A/B in the same tab, the second half of
         that sentence is the problem: FXAA works on the RESOLVED image and cannot tell an
         aliased edge from real detail, so what it smooths in the interior is the satellite
         imagery. Mean |Laplacian| of the rendered pixels — a sharpness measure — over two
         independent runs:

             MSAA 4 + FXAA (as shipped)   332-336 ms   sharpness 5.06
             MSAA 4, FXAA off             315-320 ms   sharpness 7.25   ← faster AND sharper
             MSAA 1, FXAA on              230-234 ms   sharpness 5.06

         FXAA costs ~17-20 ms and removes 30 % of the image detail. There is no trade here
         to weigh: switching it off improves BOTH axes, which is the one thing the standing
         brief 「どちらか一方犠牲はNG」 asks for.
         It stays ON in the one case where it is the only anti-aliasing there is — a context
         that gave us no multisampling — because then it is smoothing edges that would
         otherwise be raw stair-steps, and that is what it is good at. */
      try{ const fx=scene.postProcessStages&&scene.postProcessStages.fxaa;
        if(fx) fx.enabled=(o.antialias!==false)&&!(scene.msaaSamples>1); }catch(_){}
      scene.screenSpaceCameraController.enableCollisionDetection=false;
      this._applyFov();

      /* the app's own DataSource collection, one per style layer */
      this._dsColl=new Cesium.DataSourceCollection();
      this._dsDisplay=new Cesium.DataSourceDisplay({ scene, dataSourceCollection:this._dsColl });
      const tick=()=>{ try{ this._dsDisplay.update(Cesium.JulianDate.now()); }catch(_){} };
      scene.preRender.addEventListener(tick);
      /* ══ (#R185) THE FRAME COUNTER THE CAMERA READBACK IS CACHED AGAINST ══════════════════
         `_centreCarto` intersects a ray with the TESSELLATED globe, and that mesh can only
         change inside scene.render() — so its answer is constant between two frames, and every
         extra call in the same frame is the same pick paid again. setCamera alone asks for it
         five times (centre, zoom, bearing, pitch, then _afterMove's zoom); measured, one
         readback of all four cost 7.7 ms with terrain attached. Counting frames is what makes
         "the same question, in the same frame" answerable without changing any answer. */
      this._frameNo=0; this._poseCache=null;
      scene.postRender.addEventListener(()=>{ this._frameNo++; });

      this._wireEvents();
      /* ══ (#R182) THE GESTURES ARE MAPLIBRE'S, NOT CESIUM'S ═══════════════════════
         Cesium's own ScreenSpaceCameraController is a different navigation model
         (left-drag spins the globe about its centre, right-drag zooms, middle-drag
         tilts) and six of the eight gestures the contract names had no binding at
         all here. js/cesium-input.js switches that controller off and drives this
         view's setCamera from MapLibre's own handler arithmetic instead. It is a
         separate file because it is a transcription of another library's behaviour
         and has to be readable as one. */
      this._input=(window.IntMapCesiumInput&&window.IntMapCesiumInput.attach)
        ? window.IntMapCesiumInput.attach(this,Cesium) : null;
      if(o.center) this.setCamera({ center:o.center, zoom:(o.zoom==null?1.7:o.zoom), bearing:o.bearing||0, pitch:o.pitch||0 });
      if(o.style) this.setStyle(o.style);
      /* 'load' once the first frame with the initial style is on screen — the same
         moment MapLibre means by it, and what app-body waits for. */
      const first=()=>{ scene.postRender.removeEventListener(first);
        this._loaded=true; this.fire('load',{}); this.fire('styledata',{}); this.fire('idle',{}); };
      scene.postRender.addEventListener(first);
      this._widget.resize(); scene.requestRender();
    }

    /* ── geometry ──────────────────────────────────────────────────────────── */
    _canvasH(){ const c=this._widget.canvas; return (c&&(c.clientHeight||c.height))||600; }
    _canvasW(){ const c=this._widget.canvas; return (c&&(c.clientWidth||c.width))||800; }
    _applyFov(){
      try{
        const f=this._camera.frustum; if(!f||f.fov===undefined) return;
        const w=this._canvasW(), h=this._canvasH(), aspect=(h>0?w/h:1);
        /* Cesium reads `fov` as HORIZONTAL when width > height */
        f.fov=(w>h)?2*Math.atan(Math.tan(ML_FOVY/2)*aspect):ML_FOVY;
      }catch(_){}
    }
    _c2cPx(){ return 0.5/Math.tan(ML_FOVY/2)*this._canvasH(); }
    rangeFor(lat,zoom){
      const circ=2*Math.PI*R_EARTH*Math.cos(Math.max(-89.9,Math.min(89.9,lat))*D2R);
      const world=TILE*Math.pow(2,zoom);
      return (circ/world)*this._c2cPx();
    }
    zoomFor(lat,range){
      const circ=2*Math.PI*R_EARTH*Math.cos(Math.max(-89.9,Math.min(89.9,lat))*D2R);
      if(!(range>0)||!(circ>0)) return this._minZoom;
      return Math.log2(circ*this._c2cPx()/(TILE*range));
    }

    /* the ground point the camera is looking at — the thing MapLibre calls the
       centre. Picked off the globe when there is one under the crosshair, and
       otherwise the point directly beneath the eye, which is what a camera
       looking at the sky is honestly centred on. */
    /* ══ (#R185) THE SAME PICK, ASKED FIVE TIMES A FRAME ══════════════════════════════════════
       True while nothing has moved and no frame has been drawn: the ray, the mesh it meets and
       therefore the answer are all unchanged. So hold the pose the last answer was computed for
       — position, direction and up, exactly the three vectors `_readPose` calls the camera — and
       the frame it was computed in, and return the same Cartographic when all four still hold.
       This changes no answer: the tessellation the ray hits is only rewritten inside
       scene.render(), and every code path that moves the camera moves one of those vectors. */
    _poseUnchanged(){
      const m=this._poseCache; if(!m||m.frame!==this._frameNo) return false;
      const c=this._camera, p=c.positionWC, d=c.directionWC, u=c.upWC;
      return m.px===p.x&&m.py===p.y&&m.pz===p.z&&m.dx===d.x&&m.dy===d.y&&m.dz===d.z
          &&m.ux===u.x&&m.uy===u.y&&m.uz===u.z;
    }
    _rememberPose(carto,hpr){
      const c=this._camera, p=c.positionWC, d=c.directionWC, u=c.upWC;
      this._poseCache={ frame:this._frameNo, px:p.x,py:p.y,pz:p.z, dx:d.x,dy:d.y,dz:d.z,
                        ux:u.x,uy:u.y,uz:u.z, carto:carto||null, hpr:(hpr===undefined?undefined:hpr) };
    }
    _centreCarto(){
      if(this._poseUnchanged()&&this._poseCache.carto) return this._poseCache.carto;
      const out=this._centreCartoRaw();
      if(this._poseUnchanged()) this._poseCache.carto=out; else this._rememberPose(out);
      return out;
    }
    _centreCartoRaw(){
      try{
        const scene=this._scene;
        const px=new Cesium.Cartesian2(this._canvasW()/2,this._canvasH()/2);
        /* WITH NO TERRAIN, ASK THE ELLIPSOID, NOT THE MESH. `globe.pick` intersects the
           TESSELLATED surface, and a low-zoom tile approximates the curve with a handful of
           flat triangles — so the ray meets the chord, which is inside the true surface, and
           the distance comes back slightly long. Measured at the app's startup view: the zoom
           read 1.6991 for a camera placed at exactly 1.7. Tiny, but it is the number every
           other derived quantity is built on, and pickEllipsoid is both exact and cheaper.
           When terrain IS attached the mesh is the ground, and then the mesh is the right
           answer — a camera over Mt Fuji is looking at the mountain, not at the ellipsoid
           3.7 km below it. */
        let p=null;
        if(!this._terrainSpec) p=this._camera.pickEllipsoid(px,scene.globe.ellipsoid);
        if(!p){ const ray=this._camera.getPickRay(px); p=ray?scene.globe.pick(ray,scene):null; }
        if(!p) p=this._camera.pickEllipsoid(px,scene.globe.ellipsoid);
        if(p) return Cesium.Cartographic.fromCartesian(p);
      }catch(_){}
      try{ const c=this._camera.positionCartographic; return new Cesium.Cartographic(c.longitude,c.latitude,0); }catch(_){}
      return new Cesium.Cartographic(0,0,0);
    }
    getCenter(){ const c=this._centreCarto();
      return { lng:Cesium.Math.toDegrees(c.longitude), lat:Cesium.Math.toDegrees(c.latitude) }; }
    /* ══ THE CAMERA, READ IN THE LOOK-AT POINT'S FRAME — NOT ITS OWN ══════════════════════
       `camera.heading` and `camera.pitch` are measured against the ellipsoid normal AT THE
       CAMERA, and the camera is not above the point it is looking at. MapLibre's pitch and
       bearing are properties of the (centre, eye) pair, so reading Cesium's own fields answers
       a slightly different question and the round trip does not close: measured on the first
       build, jumpTo({pitch:55, bearing:30}) at z9 read back 54.03° and 29.66°, and the error
       grows with the look distance — at low zoom it is tens of degrees.
       So invert the exact expression setCamera() uses. With the offset taken in the CENTRE's
       east-north-up frame, `Camera.lookAt(target, HeadingPitchRange)` puts the eye at
           E = −range·sin(pitch)·sin(heading)
           N = −range·sin(pitch)·cos(heading)
           U =  range·cos(pitch)
       which inverts in closed form, gives MapLibre's 0–180° convention directly (pitch 0 =
       overhead, 90 = horizon, 180 = under the centre looking up), and is exact by construction
       — the same transcription, read backwards, which is #R177's rule about having ONE copy of
       the geometry rather than two that agree with each other and not with the renderer. */
    /* ══ (#R181) WHERE THE OFFSET STOPS BEING A DIRECTION AND BECOMES RESIDUE ══════════════
       At pitch 0 the horizontal part of the offset is zero by definition, so `atan2` is being
       asked to name the direction of a quantity that is not there. The guard for that was
       `range*1e-9` — and measured, `horiz` at pitch 0 is never anywhere near that small:

           z1.7  range 2.35e7 m   horiz 1.98      m      guard 2.4e−2   NOT caught
           z2.5  range 1.35e7 m   horiz 5.3e−1    m      guard 1.4e−2   NOT caught
           z4    range 4.78e6 m   horiz 2.6e−2    m      guard 4.8e−3   NOT caught
           z6    range 1.11e6 m   horiz 2.1e−3    m      guard 1.1e−3   NOT caught
           z9    range 1.49e5 m   horiz 3.5e−4    m      guard 1.5e−4   NOT caught
           z14   range 4.67e3 m   horiz 1.1e−5    m      guard 4.7e−6   NOT caught

       — so it never fired, at any zoom, and the bearing at pitch 0 was the direction of a
       residue: 67.34° at z9, 123.54° at z6, −177.63° at boot, for a camera pointing due north.
       Nothing LOOKED wrong, because a map at pitch 0 is drawn north-up whatever the heading;
       what was wrong was every reader of the number — the shared `#v=` URL, the compass,
       Atlas's answer to "which way is this facing".

       The residue is not floating-point noise. It scales with RANGE, because it is the
       resolution of the centre pick itself: `_centreCarto` intersects a ray with the ellipsoid,
       and the further away the eye is, the more ground a ray's own precision covers. Above,
       horiz/range is 8.4e−8 at worst and ~2e−9 at close range. Half a degree of tilt puts
       sin(0.5°) = 8.7e−3 of range there — FIVE orders of magnitude above it.
       `range*1e-5` sits in that gap with ~119× of margin over the largest residue measured and
       ~870× below the smallest tilt, and stays right at the closest range the zoom scale can
       reach (z22 ≈ 15 m, where it is 1.5e−4 m against ~6e−6 m of matrix noise). The original
       form was correct; only the constant was, by four orders of magnitude, not. */
    _enuNoise(range){
      const r=(isFinite(range)&&range>0)?range:1;
      return r*1e-5;
    }
    /* (#R185) …and the three readers of _hpr — getZoom, getBearing, getPitch — are three more
       copies of the same question. Same cache, same rule: pose plus frame. */
    _hpr(){
      if(this._poseUnchanged()&&this._poseCache.hpr!==undefined) return this._poseCache.hpr;
      const out=this._hprRaw();
      if(this._poseUnchanged()) this._poseCache.hpr=out; else this._rememberPose(null,out);
      return out;
    }
    _hprRaw(){
      try{
        const c=this._centreCarto();
        const target=Cesium.Cartesian3.fromRadians(c.longitude,c.latitude,c.height||0);
        const enu=Cesium.Transforms.eastNorthUpToFixedFrame(target);
        const inv=Cesium.Matrix4.inverseTransformation(enu,new Cesium.Matrix4());
        const off=Cesium.Matrix4.multiplyByPoint(inv,this._camera.positionWC,new Cesium.Cartesian3());
        const range=Math.hypot(off.x,off.y,off.z);
        if(!(range>0)) return null;
        const pitch=Math.acos(Math.max(-1,Math.min(1,off.z/range)))/D2R;
        /* at pitch 0 or 180 the horizontal offset vanishes and the bearing is undefined —
           keep the renderer's own answer there rather than emitting a random direction */
        const horiz=Math.hypot(off.x,off.y);
        const heading=(horiz>this._enuNoise(range))
          ? Math.atan2(-off.x,-off.y)/D2R
          : Cesium.Math.toDegrees(this._camera.heading);
        return { lat:Cesium.Math.toDegrees(c.latitude), lng:Cesium.Math.toDegrees(c.longitude),
                 range, pitch, heading:((heading%360)+360)%360 };
      }catch(_){ return null; }
    }
    getZoom(){
      const h=this._hpr(); if(!h) return this._minZoom;
      const z=this.zoomFor(h.lat,h.range);
      return isFinite(z)?Math.max(this._minZoom-2,Math.min(this._maxZoom+1,z)):this._minZoom;
    }
    getBearing(){ const h=this._hpr(); if(!h) return 0;
      return h.heading>180?h.heading-360:h.heading; }
    getPitch(){ const h=this._hpr(); return h?h.pitch:0; }
    getRoll(){ try{ return Cesium.Math.toDegrees(this._camera.roll); }catch(_){ return 0; } }

    /* (#R182) `opts.silent` — a GESTURE frame, not a camera command. A drag is one
       movestart…moveend however many frames it takes, so js/cesium-input.js drives
       that lifecycle itself and asks setCamera not to announce each frame as a
       complete move; 19 subscribers of `moveend` do real work (layer reconcile,
       news refresh, the shared #v= URL) and none of them should run 60 times a
       second. Everything else about the call is unchanged, `_afterMove` included. */
    setCamera(cam,animate,opts){
      /* (#R182) A PROGRAMMATIC CAMERA COMMAND ENDS A GESTURE'S GLIDE. MapLibre's
         jumpTo/easeTo/flyTo all begin with `stop()`, which cancels handler inertia —
         without it a fling that is still gliding keeps writing the camera on top of
         wherever the caller just asked to go, and the caller silently loses. */
      if(!(opts&&opts.silent)&&this._input) try{ this._input.cancel(); }catch(_){}
      const now={ center:this.getCenter(), zoom:this.getZoom(), bearing:this.getBearing(), pitch:this.getPitch() };
      const c=cam.center!=null?normLngLat(cam.center):now.center;
      let zoom=(cam.zoom==null?now.zoom:cam.zoom);
      zoom=Math.max(this._minZoom,Math.min(this._maxZoom,zoom));
      let pitch=(cam.pitch==null?now.pitch:cam.pitch);
      pitch=Math.max(this._minPitch,Math.min(this._maxPitch,pitch));
      const bearing=(cam.bearing==null?now.bearing:cam.bearing);
      /* ══ (#R182) `around` — THE POINT THE ZOOM IS ANCHORED TO ═══════════════════════════
         MapLibre's easeTo takes it and holds that location at the pixel it already occupies.
         This adapter used to drop it on the floor (`camOf` never listed it), and two call
         sites pass it: the app's own double-click/double-tap zoom and its custom pinch —
         both of which exist precisely to zoom TOWARD THE CURSOR (#R20:「カーソル地点へと
         ズームされるというUXがなくなってしまった」). Without it they zoomed to the centre.
         The pixel is read BEFORE anything moves, and the centre is then solved so the same
         ground point lands back on it. */
      const around=(cam.around!=null)?normLngLat(cam.around):null;
      let aroundPx=null;
      if(around){ const p=this.project(around);
        if(p&&p.x>=0&&p.y>=0&&isFinite(p.x)&&isFinite(p.y)) aroundPx=p; }
      /* the look-at point sits ON the terrain when there is terrain, so a tilted
         close-up over a mountain frames the mountain and not the ellipsoid under it.
         WITH NO TERRAIN THE HEIGHT IS ZERO BY DEFINITION and must not be asked for:
         globe.getHeight reads the TESSELLATED surface, and with the ellipsoid provider a
         coarse tile approximates the curve with a handful of flat triangles whose chord
         sags kilometres inside it — measured, a z9 jumpTo to Tokyo landed 9,377 m out
         because the target had been placed on that sag. The same mistake as reading the
         centre off the mesh (see _centreCarto): a tessellation approximates the surface,
         it is not the surface. */
      const at={ lng:c.lng, lat:c.lat };
      const build=()=>{
        let h=0;
        if(this._terrainSpec){ try{ const cc=Cesium.Cartographic.fromDegrees(at.lng,at.lat);
          const g=this._globe.getHeight(cc); if(isFinite(g)) h=g; }catch(_){} }
        const range=Math.max(1,this.rangeFor(at.lat,zoom));
        return { h, range, target:Cesium.Cartesian3.fromDegrees(at.lng,at.lat,h),
                 hpr:new Cesium.HeadingPitchRange(Cesium.Math.toRadians(bearing),
                                                  Cesium.Math.toRadians(pitch-90),range) };
      };
      let S=build();
      /* aim, and — when an anchor was given — nudge the centre until the anchor is back
         under its own pixel. The map's response to a centre shift is the identity to first
         order, so this contracts in two or three passes. */
      const solve=()=>{
        this._aimAt(S.target,S.hpr,bearing,pitch,S.range,cam.roll);
        if(!aroundPx) return;
        for(let i=0;i<4;i++){
          const cur=this._pickLngLat(aroundPx);
          if(!cur) break;
          const dLng=wrapLng(around.lng-cur.lng), dLat=around.lat-cur.lat;
          if(Math.abs(dLng)<1e-9&&Math.abs(dLat)<1e-9) break;
          at.lng=wrapLng(at.lng+dLng);
          at.lat=Math.max(-89.9,Math.min(89.9,at.lat+dLat));
          S=build();
          this._aimAt(S.target,S.hpr,bearing,pitch,S.range,cam.roll);
        }
      };
      const fire=()=>{ this._afterMove(); };
      if(animate&&animate.duration>0){
        /* ══ (#R182) "SAME ARITHMETIC, TWO CALLERS" WAS THE INTENTION, NOT THE CODE ═══════
           This branch used to hand `flyTo` the ORBIT angles — `orientation:{heading, pitch}`
           straight out of the HeadingPitchRange — and those are not the angles Cesium means
           by that field. Cesium's orientation is the camera's own attitude in the local frame
           AT THE DESTINATION; the orbit pitch is the angle subtended at the TARGET. They
           coincide only when the two are the same point, i.e. never. Measured, asking for
           centre 12,25 z4 by easeTo and reading back what arrived:

               asked                 jumpTo (exact)            easeTo (this branch)
               p0  b0                12.00,25.00 b0    p0      12.00,24.95 b−180 p0.1
               p0  b45               12.00,25.00 b45   p0      12.00,24.95 b−180 p0.1
               p30 b0                12.00,25.00 b0    p30     12.00,40.03 b0    p57.9
               p60 b0                12.00,25.00 b0    p60     12.00,−0.38 b0    p0.0

           — the centre 15° to 25° of latitude away, the pitch doubled or flattened, and at
           pitch 0 the bearing thrown away entirely (the #R181 defect, in the other path: an
           orbit that is vertical cannot carry a heading, and `flyTo` recovers the attitude
           the same way `lookAtTransform` does). MapLibre lands on the asked-for camera to the
           second decimal in all six cases. Every animated move in the app goes through here —
           search results, Atlas commands, the zoom buttons, fitBounds with a duration.

           So SOLVE the destination with the instant path, which is exact and already carries
           `_faceHeading`, read the camera it produced, put the camera back, and fly to that.
           Position and attitude both come from the one solve; `direction`/`up` is an
           orientation form `flyTo` accepts, and it cannot be misread because it is not an
           angular convention at all. */
        const keep=this._readPose();
        solve();
        const dest=this._readPose();
        this._writePose(keep);
        this.fire('movestart',{}); this.fire('zoomstart',{});
        this._camera.flyTo({ destination:dest.pos, orientation:{ direction:dest.dir, up:dest.up },
          duration:Math.max(0.1,animate.duration/1000),
          easingFunction:Cesium.EasingFunction.CUBIC_IN_OUT,
          /* …AND LAND ON THE SOLVE, NOT ON THE FLIGHT'S OWN LAST FRAME. `flyTo` converts
             direction/up back into heading/pitch/roll internally, which is degenerate when
             the camera looks straight down — measured, the one remaining case after the
             repair above was pitch 0, which arrived 0.1° off nadir and therefore with a
             bearing of 112.6° instead of the 45° asked for. The flight is an ANIMATION; the
             destination is defined by the instant solve, so re-assert it on arrival. */
          complete:()=>{ this._aimAt(S.target,S.hpr,bearing,pitch,S.range,cam.roll);
                         this._noteCommanded(zoom);
                         this._settle(at,zoom,pitch,bearing,S.h); fire();
                         this._scene.requestRender();
                         this.fire('moveend',{}); this.fire('zoomend',{}); },
          cancel:()=>{ fire(); this.fire('moveend',{}); } });
        return;
      }
      solve();
      /* (#R185) the zoom the styles will be evaluated at, and the camera position that makes
         that claim true — see _styleZoom */
      this._noteCommanded(zoom);
      this._settle(at,zoom,pitch,bearing,S.h);
      this._scene.requestRender();
      fire();
      if(!(opts&&opts.silent)){ this.fire('move',{}); this.fire('moveend',{}); }
    }

    /* (#R182) THE SOLVE ITSELF, once — put the eye on the orbit and aim it at the target.
       Three callers now: the instant path, the destination the animated path flies TO, and
       the re-assert when that flight arrives. Splitting it out is what makes "same
       arithmetic, two callers" a fact rather than a comment. */
    _aimAt(target,hpr,bearing,pitch,range,roll){
      this._camera.lookAt(target,hpr);
      this._camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      this._faceHeading(bearing,pitch,range);
      if(roll!=null&&isFinite(roll)){
        try{ this._camera.setView({ orientation:{ heading:this._camera.heading, pitch:this._camera.pitch,
                                                  roll:Cesium.Math.toRadians(roll) } }); }catch(_){}
      }
    }
    /* position + attitude as three world vectors — an orientation form that carries no
       angular convention, and therefore cannot be read back as a different question */
    _readPose(){
      return { pos:Cesium.Cartesian3.clone(this._camera.positionWC,new Cesium.Cartesian3()),
               dir:Cesium.Cartesian3.clone(this._camera.directionWC,new Cesium.Cartesian3()),
               up:Cesium.Cartesian3.clone(this._camera.upWC,new Cesium.Cartesian3()) };
    }
    _writePose(p){
      try{ this._camera.setView({ destination:p.pos, orientation:{ direction:p.dir, up:p.up } }); }catch(_){}
    }

    /* ══ (#R181) …AND THE ORBIT CANNOT CARRY THE HEADING WHEN IT IS VERTICAL ═══════════════
       The other half of the same defect, and the half that is not merely a readback. An
       orbit offset is a POSITION, and `Camera.lookAtTransform` recovers the attitude from it
       by `right = direction × UNIT_Z` — which is the zero vector when the camera is straight
       above the target, so Cesium substitutes UNIT_X and the eye ends up facing north no
       matter what heading was asked for (read `lookAtTransform`, and confirmed: at pitch 0
       the camera's own `heading` is 0 for every bearing passed in). Pitch 0 is the app's
       DEFAULT view, so on this engine the map simply could not be rotated.
       The repair has to add the heading WITHOUT disturbing anything else, and the obvious tool
       does not: `setView({orientation:{pitch:-90}})` aims down the geodetic normal at the
       CAMERA, and on an oblate ellipsoid that is not the line back to the target — measured, it
       slid the look-point 11 m south at z9, which reads as 0.004° of phantom tilt and takes the
       bearing with it. A twist about the view axis changes neither the position nor the
       direction; it only spins `up`, which at the poles of the orbit is the whole of the
       heading. So turn the camera until Cesium's OWN heading reads what was asked — a
       correction driven by a measurement rather than by a second transcription of the
       geometry — and let `_hpr`'s degenerate branch report that same number back.
       The sign is read from the geometry, not assumed: a twist about the view axis turns the
       heading one way when the eye looks DOWN the normal and the other way when it looks up it
       (pitch 180, #R179's LOOKING UP), and `direction · normal` says which.
       Applied only where the offset has stopped carrying the heading — the same predicate
       `_hpr` reads it back with, so the two cannot disagree. Everywhere else the existing path
       is exact (measured: bearing 25° round trips to 25.000° at pitch 30 and 60) and is
       left alone. */
    _faceHeading(bearing,pitch,range){
      if(!(range*Math.abs(Math.sin(pitch*D2R))<=this._enuNoise(range))) return false;
      try{
        const nrm=this._scene.globe.ellipsoid.geodeticSurfaceNormal(this._camera.positionWC,new Cesium.Cartesian3());
        const s=(Cesium.Cartesian3.dot(this._camera.direction,nrm)<0)?1:-1;
        const want=((bearing%360)+360)%360;
        const have=((Cesium.Math.toDegrees(this._camera.heading)%360)+360)%360;
        let d=want-have; while(d>180) d-=360; while(d<=-180) d+=360;
        if(Math.abs(d)>1e-9) this._camera.twistRight(s*Cesium.Math.toRadians(d));
        return true;
      }catch(_){ return false; }
    }

    /* ══ …AND THEN WAIT FOR THE GROUND TO ARRIVE ═══════════════════════════════════════════
       The look-at point sits ON the terrain, which is what makes a tilted close-up frame the
       mountain rather than the ellipsoid under it — and it means the camera depends on a tile
       that may not be here yet. Measured before this existed: a single jumpTo to Mt Fuji at
       z13 landed with the ground still at 0 m, and once the DEM arrived the view was 3.7 km
       out; jumping a second time after the tiles loaded was exact to the metre in every band
       (z1.7 → z14, pitch 0 → 70). A caller should not have to know that, so the engine
       re-asserts the camera it was ASKED for when the height under the target changes.
       Bounded and self-cancelling: at most a few attempts, only while nothing else has taken
       the camera (a user gesture or a newer setCamera bumps the token), and only when the
       height really moved — so a flat target settles on the first check and costs one compare.
       With no terrain attached there is nothing to wait for and this returns immediately. */
    _settle(centre,zoom,pitch,bearing,usedHeight){
      const tok=(this._settleTok=(this._settleTok||0)+1);
      if(!this._terrainSpec) return;
      /* the DEM refines in LEVELS, not in one step: at z13 over Mt Fuji the height under the
         target went 0 → coarse → 3,752 m over about four seconds, and a fixed short window
         stopped watching at the second step (measured 358 m out). So back off rather than
         poll, and keep going while the globe still has tiles in flight. */
      const WAIT=[300,400,550,750,1000,1300,1700,2200];
      let tries=0;
      /* where WE left the camera. If it has moved since, somebody else owns it now —
         a drag, a wheel, the flight simulator — and re-asserting would be the engine
         fighting the user, which is #R172's whole lesson about correcting a gesture. */
      let mine=Cesium.Cartesian3.clone(this._camera.positionWC,new Cesium.Cartesian3());
      const check=()=>{
        if(tok!==this._settleTok||tries>=WAIT.length) return;
        if(Cesium.Cartesian3.distance(mine,this._camera.positionWC)>1) return;
        let h=0; try{ const g=this._globe.getHeight(Cesium.Cartographic.fromDegrees(centre.lng,centre.lat));
          if(isFinite(g)) h=g; }catch(_){}
        const settled=Math.abs(h-usedHeight)<=1;
        /* done once the height has stopped moving AND nothing is still on its way in */
        let quiet=false; try{ quiet=!!this._globe.tilesLoaded; }catch(_){}
        if(settled&&quiet) return;
        if(!settled){
          usedHeight=h;
          const range=Math.max(1,this.rangeFor(centre.lat,zoom));
          const target=Cesium.Cartesian3.fromDegrees(centre.lng,centre.lat,h);
          this._camera.lookAt(target,new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(bearing),Cesium.Math.toRadians(pitch-90),range));
          this._camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          this._faceHeading(bearing,pitch,range);   /* (#R181) re-asserting the camera re-asserts the HEADING too */
          Cesium.Cartesian3.clone(this._camera.positionWC,mine);
          this._noteCommanded(zoom);               /* (#R185) …and the camera is still ours, at the same zoom */
          this._scene.requestRender();
        }
        setTimeout(check,WAIT[tries++]);
      };
      setTimeout(check,WAIT[tries++]);
    }

    /* ── the style ─────────────────────────────────────────────────────────── */
    setStyle(style){
      try{
        const s=style||{};
        for(const [id,spec] of Object.entries(s.sources||{})) this.addSource(id,spec);
        for(const def of (s.layers||[])) this.addLayer(def);
        this._styleParsed=true;
        this.fire('styledata',{});
      }catch(e){ this.fire('error',{error:e}); }
    }
    getStyle(){
      const sources={}; this._sources.forEach((v,k)=>{ sources[k]=v.spec; });
      return { version:8, sources, layers:this._layers.map(l=>l.def) };
    }

    /* ── sources ───────────────────────────────────────────────────────────── */
    hasSource(id){ return this._sources.has(id); }
    addSource(id,spec){
      if(!id||this._sources.has(id)) return;
      const rec={ id, spec:spec||{}, type:(spec&&spec.type)||'geojson', data:null, vt:null, imagery:null };
      if(rec.type==='geojson'){
        rec.data=normaliseFC(spec&&spec.data);
        if(typeof (spec&&spec.data)==='string') this._fetchGeoJSON(rec,spec.data);
      } else if(rec.type==='vector'){
        rec.vt=VT().makeSource(id,spec,()=>{ this._markSourceDirty(id); });
      } else if(rec.type==='raster-dem'){
        this._dem.configure(spec);
      }
      this._sources.set(id,rec);
      this._fireSourceData(id);
    }
    _fetchGeoJSON(rec,url){
      fetch(url,{mode:'cors',credentials:'omit'}).then(r=>r.ok?r.json():null).then(j=>{
        if(!j) return; rec.data=normaliseFC(j); this._markSourceDirty(rec.id);
      }).catch(()=>{});
    }
    setSourceData(id,data){
      const rec=this._sources.get(id); if(!rec) return;
      if(typeof data==='string'){ this._fetchGeoJSON(rec,data); return; }
      rec.data=normaliseFC(data);
      this._markSourceDirty(id);
      this._fireSourceData(id);
    }
    sourceData(id){ const r=this._sources.get(id); return r?r.data:null; }
    removeSource(id){
      const rec=this._sources.get(id); if(!rec) return;
      if(rec.vt) rec.vt.destroy();
      this._sources.delete(id);
    }
    setSourceTiles(id,tiles){
      const rec=this._sources.get(id); if(!rec) return false;
      rec.spec=Object.assign({},rec.spec,{tiles:tiles.slice()});
      /* a raster source's tiles changed → its imagery layers must be rebuilt */
      this._layers.filter(l=>l.def.source===id).forEach(l=>this._rebuildLayer(l));
      return true;
    }
    updateImageSource(id,o){
      const rec=this._sources.get(id); if(!rec||rec.type!=='image') return false;
      rec.spec=Object.assign({},rec.spec,o||{});
      this._layers.filter(l=>l.def.source===id).forEach(l=>this._rebuildLayer(l));
      return true;
    }
    /* ══ (#R193) THE ANIMATED QUAD, AND WHY IT TAKES TWO CANVASES HERE ═══════════════════════════
       The contract (js/geo-engine.js) is "here is a draw callback; upload what it paints, whenever I
       say the pixels moved". MapLibre satisfies it with one canvas and a `canvas` source.

       Cesium cannot, and the reason is worth writing down because it looks like the code is being
       wasteful. A material's `image` uniform is compared BY IDENTITY: `Material` only rebuilds its
       texture when the value it is handed is not the value it already has. Hand back the same canvas
       element with new pixels in it and nothing happens — the globe keeps showing the first frame it
       ever saw, forever, with no error anywhere. So the adapter keeps TWO canvases and alternates:
       paint into the one that is not currently on screen, then hand that one over, and the identity
       really has changed. The extra canvas costs one allocation for the life of the layer; painting
       happens once per touch either way.

       It is an ENTITY rectangle rather than an imagery layer for the same class of reason: Cesium's
       imagery is tiled and cached, so a provider would have to invalidate and re-request every tile
       per frame. A rectangle with an ImageMaterialProperty is one quad and one texture. */
    /* (#R195) …and here the answer is the trivial one, which is exactly why it has to be asked.
       A Cesium `rectangle` is GEOGRAPHIC: its texture runs linearly in latitude, so an
       equal-latitude-step field was always right on this engine and wrong on the default one. That
       asymmetry is why the bug survived — #R188's lesson, that fixing the side you are not looking
       at fixes nothing, run backwards. */
    imageRowLatitudes(coordinates,height){
      const H=Math.max(1,height|0);
      if(!coordinates||!coordinates.length) return null;
      let n=-90,s=90;
      for(let k=0;k<coordinates.length;k++){ const la=+coordinates[k][1];
        if(!isFinite(la)) continue; if(la>n) n=la; if(la<s) s=la; }
      if(!(n>s)) return null;
      const out=new Float64Array(H);
      for(let r=0;r<H;r++) out[r]=n+(s-n)*(r+0.5)/H;
      return out;
    }
    addDynamicImage(id,o,before){
      if(!o||typeof o.draw!=='function') return false;
      if(!Cesium) return false;
      try{
        this._dynImg=this._dynImg||new Map();
        this.removeDynamicImage(id);
        const W=Math.max(1,o.width|0), H=Math.max(1,o.height|0);
        const mk=()=>{ const c=document.createElement('canvas'); c.width=W; c.height=H; return c; };
        const rec={ id, draw:o.draw, cv:[mk(),mk()], at:0, W, H, opacity:(o.opacity==null?1:o.opacity) };
        const c=o.coordinates||[];
        const lngs=c.map(p=>p[0]), lats=c.map(p=>p[1]);
        rec.rect=Cesium.Rectangle.fromDegrees(Math.min.apply(null,lngs),Math.min.apply(null,lats),
                                              Math.max.apply(null,lngs),Math.max.apply(null,lats));
        try{ rec.draw(rec.cv[0].getContext('2d'),W,H); }catch(_){}
        rec.entity=this._dynEntities().add({
          rectangle:{ coordinates:rec.rect, height:0,
            material:new Cesium.ImageMaterialProperty({
              image:new Cesium.CallbackProperty(()=>rec.cv[rec.at],false),
              transparent:true,
              color:new Cesium.CallbackProperty(()=>Cesium.Color.WHITE.withAlpha(rec.opacity),false) }) }
        });
        this._dynImg.set(id,rec);
        this._scene.requestRender();
        return true;
      }catch(_){ return false; }
    }
    _dynEntities(){
      if(!this._dynDS){ this._dynDS=new Cesium.CustomDataSource('im-dyn'); this._dsColl.add(this._dynDS); }
      return this._dynDS.entities;
    }
    touchDynamicImage(id){
      const rec=this._dynImg&&this._dynImg.get(id); if(!rec) return false;
      const next=rec.at^1;
      try{ rec.draw(rec.cv[next].getContext('2d'),rec.W,rec.H); }catch(_){ return false; }
      rec.at=next;                    /* the CallbackProperty now returns a different object — see above */
      try{ this._scene.requestRender(); }catch(_){}
      return true;
    }
    setDynamicImageOpacity(id,v){ const rec=this._dynImg&&this._dynImg.get(id); if(!rec) return false;
      rec.opacity=Math.max(0,Math.min(1,+v)); try{ this._scene.requestRender(); }catch(_){} return true; }
    setDynamicImageCoords(id,coords){
      const rec=this._dynImg&&this._dynImg.get(id); if(!rec) return false;
      if(!Cesium) return false;
      try{ const lngs=coords.map(p=>p[0]), lats=coords.map(p=>p[1]);
        rec.rect=Cesium.Rectangle.fromDegrees(Math.min.apply(null,lngs),Math.min.apply(null,lats),
                                              Math.max.apply(null,lngs),Math.max.apply(null,lats));
        rec.entity.rectangle.coordinates=rec.rect; this._scene.requestRender(); return true; }catch(_){ return false; }
    }
    hasDynamicImage(id){ return !!(this._dynImg&&this._dynImg.get(id)); }
    removeDynamicImage(id){
      const rec=this._dynImg&&this._dynImg.get(id); if(!rec) return false;
      try{ this._dynEntities().remove(rec.entity); }catch(_){}
      this._dynImg.delete(id);
      try{ this._scene.requestRender(); }catch(_){}
      return true;
    }
    /* ══ (#R181) `sourcedata` HAS TO CARRY `isSourceLoaded`, OR THREE HANDLERS ARE DEAD ═══════
       The event fired — 12 times against MapLibre's 95 in the audit, which looked like a mere
       difference of frequency — but it carried only `{sourceId}`, and every subscriber in the app
       tests `e.isSourceLoaded`:
         app-body.js  the OFM place labels + label language, re-asserted when the tiles land
         app-body.js  the community-board reference overlays (admin1 / roads / rail)
         satellite.js the satellite cross-fade, which waits for the incoming raster and otherwise
                      falls through to a 1,900 ms timeout
       So none of them ran, and the last one degraded to always taking the timeout. "Loaded" means
       something different per source type, so each type answers for itself rather than one of them
       answering for all. */
    _sourceLoaded(rec){
      if(!rec) return false;
      try{
        if(rec.type==='geojson') return !!rec.data;
        if(rec.type==='vector') return !!(rec.vt&&rec.vt.stats().pending===0);
        /* raster / raster-dem / image are Cesium imagery, and Cesium tracks tiles for the whole
           globe rather than per layer — `tilesLoaded` is a superset, and a true statement about
           this layer whenever it holds */
        return !!this._globe.tilesLoaded;
      }catch(_){ return false; }
    }
    _fireSourceData(id){
      const rec=this._sources.get(id);
      this.fire('sourcedata',{ sourceId:id, isSourceLoaded:this._sourceLoaded(rec), dataType:'source' });
    }
    _markSourceDirty(id){
      this._layers.forEach(l=>{ if(l.def.source===id) this._dirty.add(l.def.id); });
      /* a vector tile landing is the one moment "this source is now loaded" can become true
         without anything else happening, and it is exactly what those handlers are waiting for */
      this._fireSourceData(id);
      this._schedule();
    }
    /* ══ (#R185) EVERY FEATURE THIS SOURCE HAS, ONCE ══════════════════════════════════════════
       A style layer selects a slice of its source with `source-layer`, so the assembly (which
       walks the whole tile cover) is a property of the SOURCE and the slicing is a property of
       the layer. They were fused, so ten OpenFreeMap layers over one tileset assembled the same
       ~10,000 features ten times and then scanned them ten times to pick their own. Pass a memo
       and both become once. Without a memo the behaviour is exactly what it was — `_buildLayer`
       and `queryRenderedFeatures` still call it one layer at a time. */
    _sourceFeatures(rec){
      if(!rec) return [];
      if(rec.type==='geojson') return (rec.data&&rec.data.features)||[];
      if(rec.type==='vector'&&rec.vt) return rec.vt.update(this.getBoundsLL(),this._styleZoom());
      return [];
    }
    _features(def,memo){
      const rec=this._sources.get(def.source);
      if(!rec) return [];
      let all;
      if(memo){
        all=memo.all.get(def.source);
        if(all===undefined){ all=this._sourceFeatures(rec); memo.all.set(def.source,all); }
      } else all=this._sourceFeatures(rec);
      const sl=def['source-layer'];
      if(!sl) return all;
      if(!memo) return all.filter(f=>f.sourceLayer===sl);
      let by=memo.byLayer.get(def.source);
      if(!by){
        by=new Map();
        for(const f of all){ const k=f.sourceLayer||''; let a=by.get(k); if(!a){ a=[]; by.set(k,a); } a.push(f); }
        memo.byLayer.set(def.source,by);
      }
      return by.get(sl)||[];
    }

    /* ── layers ────────────────────────────────────────────────────────────── */
    hasLayer(id){ return this._layerById.has(id); }
    getLayer(id){ const l=this._layerById.get(id); return l?Object.assign({},l.def):null; }
    addLayer(def,before){
      if(!def||!def.id||this._layerById.has(def.id)) return;
      const rec={ def:Object.assign({},def), kind:kindOf(def.type), ds:null, imagery:null, provider:null };
      const at=before?this._layers.findIndex(l=>l.def.id===before):-1;
      if(at>=0) this._layers.splice(at,0,rec); else this._layers.push(rec);
      this._layerById.set(def.id,rec);
      this._buildLayer(rec);
      this.fire('styledata',{});
      return rec;
    }
    removeLayer(id){
      const rec=this._layerById.get(id); if(!rec) return;
      this._teardownLayer(rec);
      this._layers=this._layers.filter(l=>l!==rec);
      this._layerById.delete(id);
      this.fire('styledata',{});
    }
    moveLayer(id,before){
      const rec=this._layerById.get(id); if(!rec) return;
      this._layers=this._layers.filter(l=>l!==rec);
      const at=before?this._layers.findIndex(l=>l.def.id===before):-1;
      if(at>=0) this._layers.splice(at,0,rec); else this._layers.push(rec);
      this._reorderImagery();
    }
    _teardownLayer(rec){
      try{ if(rec.ds){ this._dsColl.remove(rec.ds,true); rec.ds=null; } }catch(_){}
      try{ if(rec.imagery){ this._scene.imageryLayers.remove(rec.imagery,true); rec.imagery=null; } }catch(_){}
    }
    _rebuildLayer(rec){ this._teardownLayer(rec); this._buildLayer(rec); }
    _buildLayer(rec){
      const def=rec.def;
      const visible=(def.layout&&def.layout.visibility)!=='none';
      try{
        if(rec.kind==='imagery'){
          const prov=this._providerFor(rec);
          if(!prov) return;
          const L=new Cesium.ImageryLayer(prov,{});
          rec.provider=prov;
          rec.imagery=L;
          this._scene.imageryLayers.add(L);
          this._applyImageryPaint(rec);
          L.show=visible;
          this._reorderImagery();
        } else if(rec.kind==='vector'){
          /* the feature states go in on the FIRST build too, not only on the next flush —
             a layer added while a hover is already set would otherwise draw unhighlighted
             until something else happened to dirty it */
          const ds=this._vec.build(def,visible?this._features(def):[],
            Object.assign({},this._env(),{states:this._statesFor(def)}));
          rec.ds=ds; ds.show=visible;
          this._dsColl.add(ds);
        } else if(rec.kind==='background'){
          const c=S().resolveColor(def.paint&&def.paint['background-color'],{zoom:this.getZoom()},'#0b1220');
          if(c) this._globe.baseColor=new Cesium.Color(c.r,c.g,c.b,c.a==null?1:c.a);
        }
      }catch(e){ this.fire('error',{error:e}); }
      this._scene.requestRender();
    }
    _providerFor(rec){
      const def=rec.def, src=this._sources.get(def.source)||{spec:{}};
      const spec=src.spec||{};
      if(def.type==='raster'){
        if(src.type==='image'){
          try{ return new Cesium.SingleTileImageryProvider({ url:spec.url,
            rectangle:rectFromCoords(Cesium,spec.coordinates) }); }catch(_){ return null; }
        }
        return CL().makeTileImageryProvider(Cesium,{ tiles:spec.tiles||[], tileSize:spec.tileSize||256,
          maxzoom:spec.maxzoom, minzoom:spec.minzoom, attribution:spec.attribution, protocols:PROTOCOLS,
          /* (#R185) the two numbers that decide how much imagery a screen pixel gets —
             see makeTileImageryProvider, which turns them into the imagery LEVEL */
          screenSpaceError:this._globe?this._globe.maximumScreenSpaceError:2,
          fullResolution:!/Mobi|Android|iPhone|iPad/.test(navigator.userAgent||'') });
      }
      if(def.type==='hillshade'){
        const paintOf=()=>{
          const p=def.paint||{}, ctx={zoom:this.getZoom(),properties:{}};
          return { exaggeration:S().resolveNum(p['hillshade-exaggeration'],ctx,0.5),
                   shadow:S().resolveColor(p['hillshade-shadow-color'],ctx,'#000000'),
                   highlight:S().resolveColor(p['hillshade-highlight-color'],ctx,'#ffffff'),
                   azimuth:335, altitude:45 };
        };
        /* ⚠ (#R234) 14 WAS A SECOND, LOWER CEILING ON THE SAME DATA. `this._dem.maxzoom()` already
           carries the device's answer (terrarium's native 15 on desktop, 13 on a phone — #R19/#R20),
           and then this clamped it to 14 for no reason either file records: the hillshade in the
           Cesium engine was one zoom level blurrier than the identical layer in MapLibre.
           「陰影起伏（標高）レイヤーの解像度を上げて」 — the phone's 13 still wins the Math.min, so
           this raises desktop only, which is what was asked for. */
        return CL().makeCanvasImageryProvider(Cesium,CL().makeHillshadeDraw(this._dem,paintOf),
          { maxzoom:Math.min(15,this._dem.maxzoom()), attribution:'Elevation: Mapzen / AWS Terrain Tiles' });
      }
      if(def.type==='color-relief'){
        const rampOf=()=>(def.paint&&def.paint['color-relief-color'])||null;
        return CL().makeCanvasImageryProvider(Cesium,CL().makeReliefDraw(this._dem,rampOf),
          { maxzoom:Math.min(12,this._dem.maxzoom()), attribution:'Elevation: Mapzen / AWS Terrain Tiles' });
      }
      if(def.type==='heatmap'){
        const featuresOf=()=>this._features(def);
        const paintOf=()=>{
          const p=def.paint||{}, ctx={zoom:this.getZoom(),properties:{}};
          const ramp=p['heatmap-color'];
          return { radius:S().resolveNum(p['heatmap-radius'],ctx,30),
                   intensity:S().resolveNum(p['heatmap-intensity'],ctx,1),
                   opacity:S().resolveNum(p['heatmap-opacity'],ctx,1),
                   weightOf:f=>S().resolveNum(p['heatmap-weight'],this._vec.ctxFor(f,this.getZoom(),{}),1),
                   colorAt:d=>S().resolveColor(ramp,{zoom:ctx.zoom,properties:{},heatmapDensity:d},'rgba(0,0,0,0)') };
        };
        return CL().makeCanvasImageryProvider(Cesium,CL().makeHeatmapDraw(featuresOf,paintOf),{ maxzoom:12 });
      }
      return null;
    }
    /* Cesium's ImageryLayer carries the raster adjustments natively, which is the
       whole of #R34's dark base map (measured contrast + a brightness floor) and
       every raster-opacity in the app. Not an approximation: the same four knobs. */
    _applyImageryPaint(rec){
      const L=rec.imagery; if(!L) return;
      const p=rec.def.paint||{}, ctx={zoom:this.getZoom(),properties:{}};
      const n=(k,d)=>S().resolveNum(p[k],ctx,d);
      L.alpha=n('raster-opacity',1);
      /* opacity, contrast, saturation and hue are the SAME knob in both renderers, so those three
         are exact — MapLibre's 0-centred deltas against Cesium's 1-centred multipliers.
         BRIGHTNESS IS NOT, and it is the one worth being explicit about. MapLibre's
         raster-brightness-min/max remap the input range, which is how #R34's dark base map works:
         a measured contrast for the land/sea slope PLUS a brightness FLOOR applied afterwards, so
         land is rescued from the crush while the ocean stays dark. Cesium's `brightness` is a
         plain multiplier and cannot express a floor at all. Lifting by the floor is the closest
         honest reading of the intent (0.33 → 1.33) and it preserves the ordering the measurement
         was about; it is an approximation, and saying so here is better than a line of arithmetic
         that looks exact and is not. */
      const bmin=n('raster-brightness-min',0);
      L.brightness=(p['raster-brightness-min']!=null)?(1+bmin):1;
      L.contrast=1+n('raster-contrast',0);
      L.saturation=1+n('raster-saturation',0);
      L.hue=n('raster-hue-rotate',0)*D2R;
      L.gamma=1;
    }
    /* imagery draws in collection order, so the style's own layer order is
       replayed onto the collection whenever it changes */
    _reorderImagery(){
      try{
        const coll=this._scene.imageryLayers;
        const want=this._layers.filter(l=>l.imagery).map(l=>l.imagery);
        want.forEach(L=>{ try{ coll.raiseToTop(L); }catch(_){} });
      }catch(_){}
    }
    /* (#R187) show/hide the whole-globe polar floor with the basemap. Called by js/world-base.js,
       which is the module that already owns "the whole-globe floor" and already receives the
       satellite flag — so one caller drives both engines. */
    setWorldBase(on){
      const list=this._worldBase; if(!Array.isArray(list)) return false;
      list.forEach(L=>{ try{ L.show=!!on; }catch(_){} });
      this._wantWorldBase=!!on;
      this._polarTreatment();
      try{ this._scene.requestRender(); }catch(_){}
      return true;
    }
    /* (#R188) How the polar bands are coloured. Satellite view wants the imagery as it comes; the map
       wants it to read as part of the map, so it is desaturated and levelled to the basemap's own
       tone — the same two decisions #R34 made for the Carto rasters, in Cesium's own controls
       (brightness/contrast/saturation/gamma are all multiplicative around 1). Both settings are
       re-applied on a theme change, because the light map and the dark map are different targets.
       Nothing here can hide the band: the lowest of these still puts the cap two orders of magnitude
       above the 0.56/255 it was measured at. */
    _polarTreatment(){
      const list=this._polarBase; if(!Array.isArray(list)||!list.length) return;
      let dark=true; try{ dark=document.documentElement.getAttribute('data-theme')!=='light'; }catch(_){}
      const sat=!!this._wantWorldBase;
      /* ⚠ THESE FOUR NUMBERS WERE SWEPT, NOT PICKED. A single dim factor makes ice glow and ocean
         vanish, because the two caps are not the same picture: measured on the raw GIBS tiles, the
         Antarctic cap is 143/255 and the Arctic cap 48.9 (and 48.9 is the BRIGHTEST Arctic of the
         three Blue Marble products — NextGeneration and ShadedRelief are both 19, which is why the
         bathymetry variant stays). The first attempt, brightness 0.62 with contrast just over 1, put
         Antarctica at 151 on a dark map whose own ground is 9.4 — a searchlight — and left the Arctic
         at 9.4, i.e. still black. Lowering CONTRAST is what moves the two towards each other, so the
         sweep was over contrast and brightness together, measured at 88°S and 88°N:

             b .62 c 1.06 → S 151.1  N  9.4      b .34 c .80 → S 90.9  N 30.8
             b .42 c 0.90 → S 103.5  N 20.1      b .26 c .72 → S 80.8  N 39.5

         The second row is the one taken: Antarctica reads as a pale cap and the Arctic Ocean as
         water, both inside the dark basemap's own range (its land ≈ 45, its ocean ≈ 10, #R34), and
         NEITHER of them is the 0.56/255 this instruction is about. */
      const t=sat?{b:1,c:1,s:1,g:1}:(dark?{b:0.42,c:0.90,s:0.35,g:1}:{b:1.22,c:0.92,s:0.34,g:0.9});
      list.forEach(L=>{ try{ L.brightness=t.b; L.contrast=t.c; L.saturation=t.s; L.gamma=t.g; L.show=true; }catch(_){} });
      /* (#R189) the offline fallback: once a GIBS polar tile has actually FAILED, the bundled floor
         is shown under the map basemap too — the Mercator basemap covers ±85.05°, so the only place
         it can show through is exactly the two caps — wearing the same treatment as the bands. While
         GIBS answers, the floor stays a satellite-view object (#R187's smear stays retired). */
      const fb=!!this._polarFallback;
      (this._worldBase||[]).forEach(L=>{ try{
        L.show=this._wantWorldBase||fb;
        if(!this._wantWorldBase&&fb){ L.brightness=t.b; L.contrast=t.c; L.saturation=t.s; L.gamma=t.g; }
        else { L.brightness=1; L.contrast=1; L.saturation=1; L.gamma=1; }
      }catch(_){} });
      try{ this._scene.requestRender(); }catch(_){}
    }
    setVisible(id,on){
      const rec=this._layerById.get(id); if(!rec) return;
      rec.def.layout=Object.assign({},rec.def.layout,{visibility:on?'visible':'none'});
      if(rec.imagery) rec.imagery.show=!!on;
      if(rec.ds){ rec.ds.show=!!on; if(on) this._dirty.add(id); }
      if(!rec.imagery&&!rec.ds&&on) this._buildLayer(rec);
      this._schedule();
    }
    isVisible(id){ const rec=this._layerById.get(id); if(!rec) return false;
      return ((rec.def.layout&&rec.def.layout.visibility)||'visible')!=='none'; }
    setPaint(id,prop,val){
      const rec=this._layerById.get(id); if(!rec) return;
      rec.def.paint=Object.assign({},rec.def.paint,{[prop]:val});
      rec.zoomy=undefined;                      /* (#R185) the document changed — re-answer "does it read the zoom" */
      if(rec.imagery) this._applyImageryPaint(rec);
      else if(rec.ds) this._dirty.add(id);
      else if(rec.kind==='background') this._buildLayer(rec);
      this._schedule();
    }
    getPaint(id,prop){ const rec=this._layerById.get(id); return rec&&rec.def.paint?rec.def.paint[prop]:undefined; }
    setLayout(id,prop,val){
      if(prop==='visibility') return this.setVisible(id,val!=='none');
      const rec=this._layerById.get(id); if(!rec) return;
      rec.def.layout=Object.assign({},rec.def.layout,{[prop]:val});
      rec.zoomy=undefined;                      /* (#R185) as setPaint */
      if(rec.ds) this._dirty.add(id);
      this._schedule();
    }
    getLayout(id,prop){ const rec=this._layerById.get(id); return rec&&rec.def.layout?rec.def.layout[prop]:undefined; }
    setFilter(id,f){ const rec=this._layerById.get(id); if(!rec) return;
      rec.def.filter=f; rec.zoomy=undefined; this._dirty.add(id); this._schedule(); }
    getFilter(id){ const rec=this._layerById.get(id); return rec?rec.def.filter:null; }
    setOpacity(id,v){
      const rec=this._layerById.get(id); if(!rec) return;
      const key={raster:'raster-opacity',fill:'fill-opacity',line:'line-opacity',circle:'circle-opacity',
        symbol:'text-opacity','fill-extrusion':'fill-extrusion-opacity',heatmap:'heatmap-opacity',
        hillshade:'hillshade-exaggeration','color-relief':'color-relief-opacity'}[rec.def.type];
      if(key) this.setPaint(id,key,v);
    }

    /* ── feature state ─────────────────────────────────────────────────────── */
    _stateKey(f){ return (f.source||'')+(f.sourceLayer?'/'+f.sourceLayer:''); }
    setFeatureState(f,s){
      if(!f||f.id==null) return;
      const k=this._stateKey(f); let m=this._states.get(k);
      if(!m){ m=Object.create(null); this._states.set(k,m); }
      m[String(f.id)]=Object.assign({},m[String(f.id)],s);
      this._layers.forEach(l=>{ if(l.def.source===f.source) this._dirty.add(l.def.id); });
      this._schedule();
    }
    getFeatureState(f){ if(!f||f.id==null) return {};
      const m=this._states.get(this._stateKey(f)); return (m&&m[String(f.id)])||{}; }
    removeFeatureState(f,key){
      if(!f) return;
      const m=this._states.get(this._stateKey(f)); if(!m) return;
      if(f.id==null){ this._states.delete(this._stateKey(f)); }
      else if(key!==undefined){ if(m[String(f.id)]) delete m[String(f.id)][key]; }
      else delete m[String(f.id)];
      this._layers.forEach(l=>{ if(l.def.source===f.source) this._dirty.add(l.def.id); });
      this._schedule();
    }
    _statesFor(def){
      const m=this._states.get(def.source+(def['source-layer']?'/'+def['source-layer']:''))
            ||this._states.get(def.source);
      return m||{};
    }
    /* ══ (#R185) THE ZOOM THE STYLES ARE EVALUATED AT IS THE ONE THAT WAS ASKED FOR ══════════
       `getZoom()` is a READBACK: it inverts the camera against the ground point picked off the
       tessellated globe, so while the DEM under the crosshair is still refining it answers a
       slightly different number each frame for a camera that has not changed zoom at all.
       Measured over a 20-step pan at a fixed zoom 13: 13.122, 13.141, 13.128, then 13.000 for
       eleven frames, then 13.020 — five jumps larger than the 0.01 the redraw gate below tests,
       for a gesture in which the zoom was constant by construction. Every one of those five
       frames rebuilt all 84 vector layers.
       So when the camera is still exactly where setCamera put it, use the zoom setCamera was
       GIVEN. It is the same number the readback converges to, it is what the user asked for, and
       it does not wobble with the terrain. The moment anything else moves the camera — a gesture
       that writes the camera directly, the flight simulator's setEye — the position no longer
       matches and the readback answers, as before. */
    _styleZoom(){
      try{
        if(this._cmdZoom!=null&&this._cmdPos&&Cesium.Cartesian3.equals(this._cmdPos,this._camera.positionWC))
          return this._cmdZoom;
      }catch(_){}
      return this.getZoom();
    }
    _noteCommanded(zoom){
      this._cmdZoom=zoom;
      try{ this._cmdPos=Cesium.Cartesian3.clone(this._camera.positionWC,this._cmdPos||new Cesium.Cartesian3()); }
      catch(_){ this._cmdPos=null; }
    }
    _env(){ return { zoom:this._styleZoom(), terrain:!!this._terrainSpec, images:this._images,
                     maxFeatures:this._maxFeatures, states:null }; }

    /* Does this layer's OUTPUT depend on the zoom? A style layer is a fixed document, so this is
       a property of the document and is answered once: any `["zoom"]` in a filter/paint/layout
       expression, or a legacy `{stops:…}` function (which is a zoom function unless it names a
       property — and one that names a property is re-evaluated per feature, not per zoom, so
       treating it as zoom-dependent is the conservative direction). */
    _zoomSensitive(rec){
      if(rec.zoomy===undefined){
        let s=true;
        try{ const j=JSON.stringify([rec.def.filter||null,rec.def.paint||null,rec.def.layout||null]);
          s=/"zoom"/.test(j)||/"stops"/.test(j); }catch(_){ s=true; }
        rec.zoomy=s;
      }
      return rec.zoomy;
    }
    _inZoomWindow(def,z){
      return (def.minzoom==null||z>=def.minzoom)&&(def.maxzoom==null||z<def.maxzoom);
    }

    /* ── the redraw loop ───────────────────────────────────────────────────── */
    _schedule(){
      if(this._raf) return;
      this._raf=requestAnimationFrame(()=>{ this._raf=0; this._flush(); });
    }
    _flush(){
      const env=this._env();
      const ids=[...this._dirty]; this._dirty.clear();
      const memo={ all:new Map(), byLayer:new Map() };
      for(const id of ids){
        const rec=this._layerById.get(id); if(!rec) continue;
        if(rec.kind!=='vector'||!rec.ds) continue;
        if(!rec.ds.show) continue;
        try{ this._vec.update(rec.ds,rec.def,this._features(rec.def,memo),
                              Object.assign({},env,{states:this._statesFor(rec.def)})); }catch(_){}
      }
      /* the declutter pass is a function of the CAMERA, not of the layers, so it runs on every
         scheduled frame — including the ones where nothing needed rebuilding */
      try{ this._vec.placeLabels(this._scene,dsList(this._dsColl),this._maxLabels); }catch(_){}
      this._scene.requestRender();
    }
    _afterMove(){
      /* (#R181) …including a programmatic one, so the compass follows a jumpTo as well as a drag */
      if(this._fireAngles) try{ this._fireAngles(); }catch(_){}
      /* ══ (#R185) A CAMERA MOVE IS NOT A REASON TO REBUILD A LAYER ═════════════════════════
         What `_vec.update` produces from a layer is a function of three things: the features it
         is given, the zoom the style is evaluated at, and the feature states. A camera move can
         change the first (a vector TILESET has a new cover) and the second — and nothing else.
         Both branches below used to assert that everything had changed on every frame of every
         gesture, so a pan re-created the Cesium entity graph of up to 84 layers, ~1,900 entities,
         sixty times a second. Measured on the 3-D satellite scene over the Alps, a 40-step drag:
         252 ms per frame, of which 114 ms was this rebuild and its feature assembly — against
         36 ms for the same gesture on MapLibre, which reuses what it already parsed.
         So ask the two questions the output actually depends on:
           · the tile cover — declared once per SOURCE and compared by signature, so a layer over
             a tileset rebuilds when it crosses a tile boundary and not when it moves a pixel;
           · the zoom — and only for layers whose own document mentions it, or whose min/maxzoom
             window the zoom just crossed.
         Nothing is skipped that could have looked different; a tile landing still arrives through
         `_markSourceDirty`, and setPaint / setLayout / setFilter / setFeatureState all dirty their
         layers themselves. */
      const z=this._styleZoom();
      const prev=this._lastZoom;
      const zChanged=(prev==null||Math.abs(z-prev)>0.01);
      this._lastZoom=z;
      /* declare the cover once per vector-tile source (this is also what QUEUES the new tiles,
         so it has to happen on every move, cover change or not) */
      const moved=new Map();
      const b=this.getBoundsLL();
      this._sources.forEach((rec,id)=>{
        if(rec.type!=='vector'||!rec.vt||!rec.vt.want) return;
        const sig=rec.vt.want(b,z);
        moved.set(id,sig!==rec.coverSig);
        rec.coverSig=sig;
      });
      this._layers.forEach(l=>{
        if(l.kind==='vector'){
          const cover=moved.get(l.def.source);
          const need=(cover===true)
            ||(zChanged&&(this._zoomSensitive(l)
                          ||this._inZoomWindow(l.def,prev)!==this._inZoomWindow(l.def,z)));
          if(need) this._dirty.add(l.def.id);
        } else if(l.imagery&&zChanged) this._applyImageryPaint(l);
      });
      this._schedule();
    }

    /* ── events ────────────────────────────────────────────────────────────── */
    on(name,fn){ (this._handlers[name]||(this._handlers[name]=[])).push(fn); return this; }
    off(name,fn){ const a=this._handlers[name]; if(!a) return this;
      const i=a.indexOf(fn); if(i>=0) a.splice(i,1); return this; }
    once(name,fn){ const w=(e)=>{ this.off(name,w); fn(e); }; return this.on(name,w); }
    fire(name,ev){ const a=this._handlers[name]; if(!a||!a.length) return;
      for(const fn of a.slice()){ try{ fn(ev||{}); }catch(_){} } }
    /* (#R182) `map.listens(name)` — MapLibre's own question, and js/cesium-input.js asks it
       for the same reason MapLibre does: the browser context menu is suppressed whenever the
       app is listening for `contextmenu`, because otherwise the menu opens on top of a
       right-drag rotate and eats every event after it. */
    listens(name){ const a=this._handlers[name]; return !!(a&&a.length); }
    onLayer(type,layerId,fn){ this._layerHandlers.push({type,layerId,fn}); }
    offLayer(type,layerId,fn){ this._layerHandlers=this._layerHandlers.filter(h=>!(h.type===type&&h.layerId===layerId&&h.fn===fn)); }

    _wireEvents(){
      const scene=this._scene;
      const H=new Cesium.ScreenSpaceEventHandler(this._widget.canvas);
      this._ssHandler=H;
      const T=Cesium.ScreenSpaceEventType;
      const mk=(pos)=>{
        const ll=this._pickLngLat(pos);
        return { point:{x:pos.x,y:pos.y}, lngLat:ll||{lng:0,lat:0}, originalEvent:{}, features:[] };
      };
      const dispatch=(name,pos)=>{
        const ev=mk(pos);
        this.fire(name,ev);
        const wanted=this._layerHandlers.filter(h=>h.type===name);
        if(!wanted.length) return;
        const hits=this.queryRenderedFeatures([pos.x,pos.y]);
        for(const h of wanted){
          const f=hits.filter(x=>x.layer&&x.layer.id===h.layerId);
          if(f.length){ try{ h.fn(Object.assign({},ev,{features:f})); }catch(_){} }
        }
        /* mouseenter/mouseleave are derived, exactly as MapLibre derives them */
        if(name==='mousemove'){
          const over=new Set(hits.map(x=>x.layer&&x.layer.id));
          const prev=this._over||new Set();
          for(const h of this._layerHandlers){
            if(h.type==='mouseenter'&&over.has(h.layerId)&&!prev.has(h.layerId))
              { try{ h.fn(Object.assign({},ev,{features:hits.filter(x=>x.layer.id===h.layerId)})); }catch(_){} }
            if(h.type==='mouseleave'&&!over.has(h.layerId)&&prev.has(h.layerId))
              { try{ h.fn(ev); }catch(_){} }
            if(h.type==='mousemove'&&over.has(h.layerId))
              { try{ h.fn(Object.assign({},ev,{features:hits.filter(x=>x.layer.id===h.layerId)})); }catch(_){} }
          }
          this._over=over;
        }
      };
      H.setInputAction(m=>dispatch('click',m.position),T.LEFT_CLICK);
      H.setInputAction(m=>dispatch('dblclick',m.position),T.LEFT_DOUBLE_CLICK);
      H.setInputAction(m=>dispatch('mousemove',m.endPosition),T.MOUSE_MOVE);
      /* ══ (#R181) THE REST OF THE POINTER STREAM, FROM THE DOM ══════════════════════════════
         Cesium's ScreenSpaceEventHandler is an ABSTRACTION over the pointer — it folds touch
         into its LEFT_* events and offers no down/up/out/wheel at all — so four of the app's
         subscriptions had nothing to fire them: `mousedown` `mouseup` `touchstart` `touchmove`
         `touchend` `wheel` `mouseout`. That is not a cosmetic gap. map-tools.js's shape
         placement and terrain-water.js both bind down → move → up on BOTH mouse and touch, so
         on this engine a shape could be started and never dragged; atlas-console's flight
         animations cancel on mousedown/touchstart/wheel and so could not be interrupted; and
         the coordinate readout clears on `mouseout` and so never cleared.
         The events that ARE in Cesium's abstraction keep coming from it — LEFT_CLICK is
         drag-aware, which is the same suppression MapLibre applies (`click` only when the
         pointer did not move between press and release), and re-deriving that from raw DOM
         clicks would be a second, worse copy of it. Everything else is listened for on the
         canvas directly, which is where MapLibre gets it too.
         `contextmenu` MOVES here from RIGHT_CLICK for a reason: map-tools calls
         `e.preventDefault()` on it to keep the browser menu away while placing a shape, and
         Cesium's synthetic object has no DOM event to prevent — so the call was a silent
         no-op and the menu opened. */
      const domEv=(name,e,pos)=>{
        const ev=mk(pos||{x:0,y:0});
        ev.originalEvent=e;
        ev.preventDefault=()=>{ try{ e.preventDefault(); }catch(_){} ev.defaultPrevented=true; };
        ev.defaultPrevented=false;
        return ev;
      };
      const rel=(e)=>{ const r=this._widget.canvas.getBoundingClientRect();
        const t=(e.touches&&e.touches[0])||(e.changedTouches&&e.changedTouches[0])||e;
        return { x:(t.clientX||0)-r.left, y:(t.clientY||0)-r.top }; };
      const domDispatch=(name)=>(e)=>{
        const pos=rel(e);
        const ev=domEv(name,e,pos);
        this.fire(name,ev);
        /* (#R181) the pointer leaving the canvas ends every hover, and a `mousemove` can no
           longer say so because there are no more of them — MapLibre closes them out the same
           way, and without it a layer's `mouseleave` never arrived (measured 0 against 2) and
           whatever it un-highlights stayed lit. */
        if(name==='mouseout'&&this._over&&this._over.size){
          for(const h of this._layerHandlers){
            if(h.type==='mouseleave'&&this._over.has(h.layerId)){ try{ h.fn(ev); }catch(_){} }
          }
          this._over=new Set();
        }
        /* the layer-scoped handlers see the same names the primary stream does */
        const wanted=this._layerHandlers.filter(h=>h.type===name);
        if(!wanted.length) return;
        const hits=this.queryRenderedFeatures([pos.x,pos.y]);
        for(const h of wanted){
          const f=hits.filter(x=>x.layer&&x.layer.id===h.layerId);
          if(f.length){ try{ h.fn(Object.assign({},ev,{features:f})); }catch(_){} }
        }
      };
      const cv=this._widget.canvas;
      this._domEvs=[];
      /* passive where the app never prevents (so scrolling and pinch stay smooth), and NOT
         passive for wheel/contextmenu/touchstart, which callers do prevent */
      for(const [n,passive] of [['mouseout',true],
                                ['touchstart',false],['touchmove',false],['touchend',true],
                                ['wheel',false]]){
        const fn=domDispatch(n);
        try{ cv.addEventListener(n,fn,{passive}); this._domEvs.push([n,fn]); }catch(_){}
      }
      /* ══ (#R182) `contextmenu` IS DELAYED TO THE RELEASE, AND DROPPED IF THE PRESS ROTATED ══
         MapLibre's BlockableMapEventHandler does exactly this, and the reason is platform:
         Chromium raises `contextmenu` on mouseDOWN on Linux and macOS, and on mouseUP on
         Windows. Suppressing it only once a rotate has MOVED therefore works on Windows and
         does nothing on Linux — measured, this round's first repair passed locally and failed
         all three CI attempts, with the right-drag pitch and both ctrl gestures reading 0
         because the app's `#ctx-menu` had opened over the canvas and was eating the input.
         So: stash it while a button is down, drop the stash the moment the gesture turns into
         a rotate, and fire whatever survives on release. A plain right CLICK still gets its
         menu; a right DRAG never does, on either platform. */
      let pendingCtx=null;
      this._ctxDelay=false;
      this._ctxDrop=()=>{ pendingCtx=null; };
      this._ctxRelease=()=>{
        this._ctxDelay=false;
        if(!pendingCtx) return;
        const ev=pendingCtx; pendingCtx=null;
        this.fire('contextmenu',ev);
      };
      const onCtx=(e)=>{
        const ev=domEv('contextmenu',e,rel(e));
        /* MapLibre suppresses the browser's own menu whenever the app listens at all */
        if(this.listens('contextmenu')){ try{ e.preventDefault(); }catch(_){} }
        if(this._ateContextMenu){ this._ateContextMenu=false; pendingCtx=null; return; }
        if(this._ctxDelay){ pendingCtx=ev; return; }
        this.fire('contextmenu',ev);
      };
      try{ cv.addEventListener('contextmenu',onCtx,{passive:false}); this._domEvs.push(['contextmenu',onCtx]); }catch(_){}
      /* ══ (#R181) …AND `mousedown`/`mouseup` COME FROM THE POINTER, NOT THE MOUSE ══════════
         Listening for `mousedown` on the canvas measured ZERO while `mouseout` from the very
         same registration measured two. The reason is Cesium's own input layer: it binds
         POINTER events and calls preventDefault on pointerdown, and preventing a pointer
         event's default is exactly what suppresses the browser's compatibility mouse events.
         So take them from the pointer stream, which is where they still exist — restricted to
         a real mouse, because a touch already arrives as touchstart/touchend and MapLibre does
         not raise `mousedown` for one either. */
      for(const [src,name] of [['pointerdown','mousedown'],['pointerup','mouseup']]){
        const inner=domDispatch(name);
        const fn=(e)=>{ if(e.pointerType&&e.pointerType!=='mouse') return; inner(e); };
        try{ cv.addEventListener(src,fn,{passive:true}); this._domEvs.push([src,fn]); }catch(_){}
      }
      /* ══ (#R181) EVERY FRAME, AND THE TWO ANGLES ══════════════════════════════════════════
         `render` had no source at all, and three call sites want it: the pin popup is
         repositioned on it (so it drifted on this engine), and two canvas captures wait on it
         with a timeout as the safety net (so they silently took the slow path). The widget is
         in `requestRenderMode`, so postRender fires only when a frame really was drawn — this
         is the honest per-frame hook and it does not spin when the map is still.
         `rotate` and `pitch` had no source either, and `updateCompass` is bound to both: the
         compass simply did not follow the map. Fired when the angle actually MOVED rather than
         on every camera event, which is what makes them different from `move`. */
      scene.postRender.addEventListener(()=>{ this.fire('render',{}); });
      /* (#R181) …and the moment the globe's tile queue DRAINS is when a raster source becomes
         "loaded" — the only signal Cesium has for it, and what satellite.js's cross-fade is
         waiting on. Fired on the transition to zero, not on every change of the queue, so a
         screen of tiles arriving is one announcement rather than dozens. */
      try{
        let inQueue=0;
        this._globe.tileLoadProgressEvent.addEventListener((n)=>{
          const was=inQueue; inQueue=n|0;
          if(was>0&&inQueue===0){
            this._sources.forEach((rec,id)=>{ if(rec.type!=='geojson') this._fireSourceData(id); });
          }
        });
      }catch(_){}
      let lastB=null,lastP=null;
      /* published on the instance because a PROGRAMMATIC camera move (jumpTo/flyTo) does not
         go through the gesture stream, and MapLibre fires rotate/pitch for those too */
      this._fireAngles=()=>{
        const b=this.getBearing(), p=this.getPitch();
        if(lastB==null||Math.abs(b-lastB)>1e-4){ lastB=b; this.fire('rotate',{}); }
        if(lastP==null||Math.abs(p-lastP)>1e-4){ lastP=p; this.fire('pitch',{}); }
      };
      const angles=()=>this._fireAngles();
      /* the camera's own stream — MapLibre's move/zoom family, from the one event
         Cesium raises when anything about the view changes */
      let moving=false, tmr=0;
      this._camera.changed.raiseEventOnCameraChange=true;
      this._camera.percentageChanged=0.02;
      const onChanged=()=>{
        /* (#R182) …unless a GESTURE owns the camera. js/cesium-input.js fires one
           movestart…moveend for the whole gesture including its glide, which is what
           MapLibre means by them; letting this stream run as well would announce
           every frame of a drag as a separate move that also ended.
           The grace period after it lets go is not belt-and-braces: Cesium raises
           `changed` from postRender, i.e. AFTER the frame that moved — so the last
           frame of a gesture is announced once the flag is already down, and the whole
           movestart…moveend pair arrives again as an echo. Measured on a throttled
           machine at 3 Hz, that echo landed 330 ms after the glide finished. */
        if(this._inputActive) return;
        if(this._inputTouched&&(Date.now()-this._inputTouched)<500) return;
        if(!moving){ moving=true; this.fire('movestart',{}); this.fire('dragstart',{}); }
        this.fire('move',{}); this.fire('zoom',{});
        angles();
        this._afterMove();
        clearTimeout(tmr);
        tmr=setTimeout(()=>{ moving=false; this.fire('moveend',{}); this.fire('dragend',{});
                             this.fire('zoomend',{}); this.fire('idle',{}); },180);
      };
      this._camera.changed.addEventListener(onChanged);
      /* the canvas can be resized by CSS alone (the sidebar, the workspace mode) */
      if(typeof ResizeObserver!=='undefined'){
        this._ro=new ResizeObserver(()=>{ this.resize(); });
        try{ this._ro.observe(this._container); }catch(_){}
      }
    }
    _pickLngLat(pos){
      try{
        const ray=this._camera.getPickRay(new Cesium.Cartesian2(pos.x,pos.y));
        let p=ray?this._scene.globe.pick(ray,this._scene):null;
        if(!p) p=this._camera.pickEllipsoid(new Cesium.Cartesian2(pos.x,pos.y),this._globe.ellipsoid);
        if(!p) return null;
        const c=Cesium.Cartographic.fromCartesian(p);
        return { lng:Cesium.Math.toDegrees(c.longitude), lat:Cesium.Math.toDegrees(c.latitude) };
      }catch(_){ return null; }
    }

    /* ── queries ───────────────────────────────────────────────────────────── */
    project(ll){
      try{
        const c=normLngLat(ll);
        const p=Cesium.Cartesian3.fromDegrees(c.lng,c.lat,0);
        const w=Cesium.SceneTransforms.worldToWindowCoordinates
          ? Cesium.SceneTransforms.worldToWindowCoordinates(this._scene,p)
          : Cesium.SceneTransforms.wgs84ToWindowCoordinates(this._scene,p);
        return w?{x:w.x,y:w.y}:{x:-1,y:-1};
      }catch(_){ return {x:-1,y:-1}; }
    }
    /* ══ (#R202) ORBIT POINTS — Cesium's own primitive ═══════════════════════════════════════════
       The contract's `addOrbit` asks for "these objects, at these altitudes, moving at these rates".
       Cesium answers with a PointPrimitiveCollection: real Cartesian3 positions on a real ellipsoid,
       so occlusion by the planet is the depth buffer's business and not ours. The rate is integrated
       here, once per scene render, because Cesium's points take positions rather than a shader
       uniform — the same numbers, applied on this side of the contract. */
    addOrbit(id){
      try{
        this._orb=this._orb||{};
        if(this._orb[id]) return true;
        const col=this._scene.primitives.add(new Cesium.PointPrimitiveCollection());
        this._orb[id]={ col, list:null, t0:0, visible:true, opacity:1 };
        if(!this._orbTick){
          this._orbTick=()=>{ try{ this._orbStep(); }catch(_){} };
          try{ this._scene.preRender.addEventListener(this._orbTick); }catch(_){}
        }
        return true;
      }catch(_){ return false; }
    }
    _orbStep(){
      const all=this._orb; if(!all) return;
      const now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
      for(const id of Object.keys(all)){
        const O=all[id]; if(!O.list||!O.col) continue;
        O.col.show=!!O.visible;
        if(!O.visible) continue;
        const dt=Math.max(0,Math.min(4,(now-O.t0)/1000));
        const L=O.list;
        for(let i=0;i<L.length;i++){
          const f=L[i], pt=O.col.get(i); if(!pt) continue;
          let dl=f.lng2-f.lng; if(dl>180) dl-=360; else if(dl<-180) dl+=360;
          pt.position=Cesium.Cartesian3.fromDegrees(f.lng+dl*dt, f.lat+(f.lat2-f.lat)*dt,
            (f.altKm+(f.alt2Km-f.altKm)*dt)*1000);
        }
      }
    }
    setOrbit(id,o){
      try{
        this._orb=this._orb||{}; const O=this._orb[id]; if(!O) return false;
        if(o&&o.visible!=null) O.visible=!!o.visible;
        if(o&&o.opacity!=null&&isFinite(o.opacity)) O.opacity=Math.max(0,Math.min(1,+o.opacity));
        if(o&&o.list){
          O.list=o.list; O.t0=(o.t0!=null)?o.t0:((typeof performance!=='undefined')?performance.now():Date.now());
          O.col.removeAll();
          for(let i=0;i<o.list.length;i++){
            const f=o.list[i], c=f.rgba;
            O.col.add({ position:Cesium.Cartesian3.fromDegrees(f.lng,f.lat,f.altKm*1000),
              pixelSize:f.size, color:new Cesium.Color(c[0]/255,c[1]/255,c[2]/255,(c[3]/255)*O.opacity) });
          }
        }
        try{ this._scene.requestRender&&this._scene.requestRender(); }catch(_){}
        return true;
      }catch(_){ return false; }
    }
    removeOrbit(id){
      try{ const O=this._orb&&this._orb[id]; if(!O) return true;
        this._scene.primitives.remove(O.col); delete this._orb[id]; return true; }catch(_){ return false; }
    }
    /* the batched pick projection. The contract speaks mercator + metres because that is what the
       MapLibre layer holds; here it is turned back into lng/lat, which is what Cesium speaks. */
    projectMercAlt(xy){
      try{
        if(!xy) return null;
        const n=(xy.length/3)|0, out=new Float32Array(n*2), D2R=Math.PI/180;
        for(let i=0;i<n;i++){
          const lng=xy[i*3]*360-180;
          const lat=(2*Math.atan(Math.exp((0.5-xy[i*3+1])*2*Math.PI))-Math.PI/2)/D2R;
          const w=this.projectAltitude({lng,lat},xy[i*3+2]);
          if(w){ out[i*2]=w.x; out[i*2+1]=w.y; } else { out[i*2]=NaN; out[i*2+1]=NaN; }
        }
        return out;
      }catch(_){ return null; }
    }
    projectAltitude(ll,alt){
      try{
        const c=normLngLat(ll);
        const p=Cesium.Cartesian3.fromDegrees(c.lng,c.lat,+alt||0);
        const w=Cesium.SceneTransforms.worldToWindowCoordinates
          ? Cesium.SceneTransforms.worldToWindowCoordinates(this._scene,p)
          : Cesium.SceneTransforms.wgs84ToWindowCoordinates(this._scene,p);
        return w?{x:w.x,y:w.y}:null;
      }catch(_){ return null; }
    }
    unproject(pt){
      const p=Array.isArray(pt)?{x:pt[0],y:pt[1]}:pt;
      const ll=this._pickLngLat(p);
      return ll?Object.assign(ll,{ toArray:()=>[ll.lng,ll.lat] }):{lng:0,lat:0,toArray:()=>[0,0]};
    }
    terrainElevation(ll){
      try{ const c=normLngLat(ll);
        const h=this._globe.getHeight(Cesium.Cartographic.fromDegrees(c.lng,c.lat));
        return isFinite(h)?h:null; }catch(_){ return null; }
    }
    getBoundsLL(){
      try{
        const r=this._camera.computeViewRectangle(this._globe.ellipsoid);
        if(r) return { west:Cesium.Math.toDegrees(r.west), south:Cesium.Math.toDegrees(r.south),
                       east:Cesium.Math.toDegrees(r.east), north:Cesium.Math.toDegrees(r.north) };
      }catch(_){}
      const c=this.getCenter(), z=this.getZoom();
      const d=180/Math.pow(2,Math.max(0,z));
      return { west:c.lng-d, east:c.lng+d, south:Math.max(-85,c.lat-d), north:Math.min(85,c.lat+d) };
    }
    getBounds(){
      const b=this.getBoundsLL();
      return { getWest:()=>b.west, getEast:()=>b.east, getSouth:()=>b.south, getNorth:()=>b.north,
               getNorthEast:()=>({lng:b.east,lat:b.north}), getSouthWest:()=>({lng:b.west,lat:b.south}),
               getNorthWest:()=>({lng:b.west,lat:b.north}), getSouthEast:()=>({lng:b.east,lat:b.south}),
               toArray:()=>[[b.west,b.south],[b.east,b.north]] };
    }
    queryRenderedFeatures(geom,opts){
      const out=[];
      try{
        const layerFilter=opts&&opts.layers?new Set(opts.layers):null;
        const pts=[];
        if(!geom){ pts.push(new Cesium.Cartesian2(this._canvasW()/2,this._canvasH()/2)); }
        else if(Array.isArray(geom)&&typeof geom[0]==='number') pts.push(new Cesium.Cartesian2(geom[0],geom[1]));
        else if(Array.isArray(geom)&&Array.isArray(geom[0])){
          /* a box query — sample its corners and centre, which is what a pick can do */
          const [a,b]=geom;
          const xs=[a[0],(a[0]+b[0])/2,b[0]], ys=[a[1],(a[1]+b[1])/2,b[1]];
          xs.forEach(x=>ys.forEach(y=>pts.push(new Cesium.Cartesian2(x,y))));
        } else if(geom&&geom.x!=null) pts.push(new Cesium.Cartesian2(geom.x,geom.y));
        const seen=new Set();
        for(const p of pts){
          let picks=[]; try{ picks=this._scene.drillPick(p,8)||[]; }catch(_){}
          for(const pk of picks){
            const ent=pk&&pk.id;
            const eid=ent&&ent.id;
            if(typeof eid!=='string') continue;
            const layerId=eid.split('/')[0];
            if(layerFilter&&!layerFilter.has(layerId)) continue;
            if(seen.has(eid)) continue; seen.add(eid);
            const rec=this._layerById.get(layerId); if(!rec) continue;
            out.push({ layer:{ id:layerId, type:rec.def.type, source:rec.def.source },
                       source:rec.def.source, sourceLayer:rec.def['source-layer'],
                       properties:(ent.properties&&ent.properties.getValue)?ent.properties.getValue(Cesium.JulianDate.now()):(ent.properties||{}),
                       /* the FEATURE's id, not the entity's — `setFeatureState({source,id},…)` is
                          how the app highlights what was picked, and it needs the former */
                       id:ent.__fid, geometry:null, __entity:ent });
          }
        }
      }catch(_){}
      return out;
    }
    querySourceFeatures(id,params){
      const rec=this._sources.get(id); if(!rec) return [];
      if(rec.type==='geojson') return ((rec.data&&rec.data.features)||[]).slice();
      if(rec.type==='vector'&&rec.vt){
        const all=rec.vt.current(this.getBoundsLL(),this.getZoom());
        const sl=params&&params.sourceLayer;
        return sl?all.filter(f=>f.sourceLayer===sl):all;
      }
      return [];
    }

    /* ── scene furniture ───────────────────────────────────────────────────── */
    setTerrain(t){
      this._terrainSpec=t||null;
      try{
        if(!t){ this._scene.terrainProvider=new Cesium.EllipsoidTerrainProvider(); }
        else{
          const src=this._sources.get(t.source);
          if(src) this._dem.configure(src.spec);
          this._scene.terrainProvider=CL().makeTerrainProvider(Cesium,this._dem,
            { maxzoom:(src&&src.spec&&src.spec.maxzoom), exaggeration:(t.exaggeration==null?1:t.exaggeration),
              samples:this.opts.terrainSamples||129 });
        }
        this._globe.depthTestAgainstTerrain=false;
        this._scene.requestRender();
        /* (#R181) three subscribers wait on this — the 3-D aircraft refresh, drone-nav and
           volume3d all re-place things that sit ON the ground when the ground changes */
        this.fire('terrain',{terrain:this._terrainSpec});
        return true;
      }catch(_){ return false; }
    }
    getTerrain(){ return this._terrainSpec; }
    setSky(s){
      try{
        /* (#R181) KEEP THE SPEC, not just its effect. Cesium's atmosphere is parameterised by
           brightness/hue/saturation shifts, so setSky can only carry a MapLibre sky across
           approximately — and `getSky` used to answer `{}`, i.e. "there is a sky", losing what
           it was. flight-sim.js reads getSky() to put the sky BACK after a flight
           (js/flight-sim.js: `prevView.sky = GE().scene.getSky()`), so on this engine the
           restore replaced the sky with an empty one. Store what was asked for and hand it
           back; the approximation stays in how it is APPLIED. */
        this._skySpec=(s===false)?null:(s||null);
        if(s===null||s===false){ this._scene.skyAtmosphere.show=false; return; }
        this._scene.skyAtmosphere.show=true;
        /* MapLibre's sky spec names a horizon and a fog colour; Cesium's atmosphere
           is parameterised by brightness/hue/saturation shifts, so the colour is
           carried across as a brightness shift rather than pretended to be exact. */
        const c=S().parseColor(s&&(s['sky-color']||s['horizon-color']));
        if(c) this._scene.skyAtmosphere.brightnessShift=Math.max(-1,Math.min(1,(c.r+c.g+c.b)/3-0.5));
      }catch(_){}
    }
    getSky(){ try{ return this._scene.skyAtmosphere.show?(this._skySpec||{}):null; }catch(_){ return null; } }
    setLight(l){
      try{
        /* MapLibre `light` is a lighting model for extrusions; Cesium's equivalent
           knob that is actually visible here is globe lighting. */
        this._globe.enableLighting=!!(l&&l.anchor==='map'&&l.intensity>0);
        this._scene.requestRender();
      }catch(_){}
    }
    addImage(id,img){ if(this._images[id]) return false; this._images[id]=img; return true; }
    hasImage(id){ return !!this._images[id]; }
    removeImage(id){ delete this._images[id]; }
    addProtocol(name,fn){ PROTOCOLS[name]=fn; return true; }

    /* ── the rest of the surface ───────────────────────────────────────────── */
    resize(){ try{ this._widget.resize(); this._applyFov(); this._scene.requestRender(); this.fire('resize',{}); }catch(_){} }
    triggerRepaint(){ try{ this._scene.requestRender(); }catch(_){} }
    getCanvas(){ return this._widget.canvas; }
    getContainer(){ return this._container; }
    getCanvasContainer(){ return this._widget.canvas&&this._widget.canvas.parentNode; }
    isStyleLoaded(){ return this._loaded&&this._styleParsed; }
    styleParsed(){ return this._styleParsed; }
    /* (#R182) …and an inertial glide is an ease too. NOT a drag: the contract's
       `isAnimating()` exists to tell a gesture apart from a programmatic flight
       (js/geo-engine.js), which is also what MapLibre's isEasing() answers — true
       while the fling coasts, false while the finger is down. */
    isEasing(){ try{ return !!this._camera._currentFlight||!!(this._input&&this._input.isEasing()); }catch(_){ return false; } }
    stop(){ try{ this._camera.cancelFlight(); }catch(_){}
            try{ if(this._input) this._input.cancel(); }catch(_){} }
    /* (#R182) the eight gesture names now reach handlers that implement them, rather
       than Cesium's four enable flags — three of which had no counterpart at all
       (`keyboard`, `doubleClickZoom`, `boxZoom` were recorded and ignored) and two
       of which shared one flag, so turning the pinch off also killed the wheel. */
    cameraForBounds(b,o){ const v=this; if(!b) return null;
      const bb=normBounds(b); if(!bb) return null;
      const pad=(o&&o.padding)||0, padN=(typeof pad==='number')?pad:0;
      const W=Math.max(1,v._canvasW()-2*padN), H=Math.max(1,v._canvasH()-2*padN);
      const my=l=>Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,l))*D2R/2));
      const myInv=y=>(2*Math.atan(Math.exp(y))-Math.PI/2)/D2R;
      /* (#R181) THE CENTRE OF A BOX ON A MAP IS THE MERCATOR MIDPOINT, not the mean of the
         two latitudes — the box is being fitted to a rectangle of Mercator PIXELS, which is
         exactly what the zoom two lines down is derived from, so taking the mean here left
         the centre and the zoom disagreeing about the same box. Measured against MapLibre
         for [[135,33],[141,37]]: 35.000 here, 35.024 there. Longitude is linear in Mercator
         x, so its mean is already the right answer. */
      /* (#R181) …and a box that goes the whole way round is 360° WIDE, not 0° wide.
         `wrapLng(east-west)` sends 360 to 0, which read as "no width at all" and quietly
         dropped the longitude constraint from the fit entirely. */
      let span=((bb.east-bb.west)%360+360)%360;
      if(span===0&&bb.east!==bb.west) span=360;
      const lat=myInv((my(bb.north)+my(bb.south))/2), lng=wrapLng(bb.west+span/2);
      /* the zoom at which the box fills the viewport, in the same Mercator pixels
         the range↔zoom mapping is written in */
      const dx=span/360, dy=Math.abs(my(bb.north)-my(bb.south))/(2*Math.PI);
      const zx=dx>0?Math.log2(W/(TILE*dx)):20, zy=dy>0?Math.log2(H/(TILE*dy)):20;
      let zoom=Math.min(zx,zy);
      /* ══ (#R181) ON A GLOBE, A RECTANGLE IS NOT A RECTANGLE ═══════════════════════════════
         The arithmetic above fits the box to a rectangle of Mercator pixels, which is exactly
         right on a plane and NOT right on a sphere: the far parts of the box are turned away
         from the eye, so they land further from the centre of the screen than a flat map says
         and fall outside it. Measured by projecting the box's own boundary after the fit,
         against MapLibre on the same viewport: [[-10,35],[30,60]] left 6% of the box off
         screen, [[135,33],[141,37]] 0.6%, [[2,48],[3,49]] 0.2%.
         So when the scene really is a sphere, ask the sphere. With the eye at distance d from
         the centre of the Earth above the fit centre, a surface point whose unit vector in the
         centre's east/north/up frame is (e,n,u) sits at screen offsets R·e/(d−R·u) and
         R·n/(d−R·u); requiring both to stay inside the frustum gives, for each point,
             d ≥ R·u + R·max(|e|/tanX, |n|/tanY)
         and the fit is the largest of those over the boundary. Closed form — no search — and
         it is the SAME transcription, not a second one: for a small box u→1 and it reduces
         algebraically to the Mercator expression above, which is why the two agree to 0.001
         of a zoom level on a city-sized box and part company only where the curve matters. */
      try{
        if(v._scene.mode===Cesium.SceneMode.SCENE3D){
          const tanY0=Math.tan(ML_FOVY/2), cw=v._canvasW(), ch=v._canvasH();
          const tanX=tanY0*(W/ch), tanY=tanY0*(H/ch);
          void cw;
          const cLat=lat*D2R, cLng=lng*D2R;
          const sinC=Math.sin(cLat), cosC=Math.cos(cLat);
          let need=R_EARTH;
          const consider=(lngDeg,latDeg)=>{
            const la=latDeg*D2R, dl=(lngDeg*D2R)-cLng;
            const cosLa=Math.cos(la), sinLa=Math.sin(la);
            const e=cosLa*Math.sin(dl);
            const n=cosC*sinLa-sinC*cosLa*Math.cos(dl);
            const u=sinC*sinLa+cosC*cosLa*Math.cos(dl);
            const d=R_EARTH*u+R_EARTH*Math.max(Math.abs(e)/tanX,Math.abs(n)/tanY);
            if(d>need) need=d;
          };
          const N=24;
          for(let i=0;i<=N;i++){
            const t=i/N, lo=bb.west+span*t;
            consider(lo,bb.south); consider(lo,bb.north);
            const la=bb.south+(bb.north-bb.south)*t;
            consider(bb.west,la); consider(bb.west+span,la);
          }
          const range=need-R_EARTH;
          if(range>0){ const zs=v.zoomFor(lat,range); if(isFinite(zs)) zoom=Math.min(zoom,zs); }
        }
      }catch(_){}
      zoom=Math.max(v._minZoom,Math.min(v._maxZoom,zoom));
      return { center:{lng,lat}, zoom, bearing:(o&&o.bearing)||0, pitch:(o&&o.pitch)||0 };
    }
    setGesture(name,on){
      if(this._input){ const ok=this._input.set(name,on); if(ok) this._gestures[name]=!!on; return ok; }
      const c=this._scene.screenSpaceCameraController;
      const map={ dragPan:'enableTranslate', dragRotate:'enableRotate', scrollZoom:'enableZoom',
                  touchZoomRotate:'enableZoom', keyboard:null, doubleClickZoom:null,
                  boxZoom:null, touchPitch:'enableTilt' };
      const k=map[name];
      if(k===undefined) return false;
      if(k===null){ this._gestures[name]=!!on; return true; }
      try{ c[k]=!!on; this._gestures[name]=!!on; return true; }catch(_){ return false; }
    }
    setZoomRate(r,wheel){ return this._input?this._input.setZoomRate(r,wheel):false; }
    setCursor(c){ try{ const cv=this._widget.canvas; if(cv) cv.style.cursor=c||''; }catch(_){} }
    destroy(){
      try{ if(this._ro) this._ro.disconnect(); }catch(_){}
      try{ if(this._input) this._input.destroy(); this._input=null; }catch(_){}
      try{ if(this._ssHandler) this._ssHandler.destroy(); }catch(_){}
      /* (#R181) the DOM half of the pointer stream comes off with it — a sub-view that is
         closed and reopened would otherwise leave a listener firing at a dead scene */
      try{ const cv=this._widget&&this._widget.canvas;
           if(cv&&this._domEvs) this._domEvs.forEach(([n,fn])=>cv.removeEventListener(n,fn));
           this._domEvs=null; }catch(_){}
      try{ this._dsDisplay.destroy(); }catch(_){}
      try{ this._widget.destroy(); }catch(_){}
    }
  }

  /* (#R182) `orbitPosition` lived here — a second copy of the eye-position solve, kept so the
     animated path could compute a destination without going through the instant one. It was
     the reason the two paths could disagree, and they did (see setCamera). The animated path
     now flies to the camera the INSTANT path produces, so there is nothing left to keep in
     step and the copy is gone. The formula it held is still written out above `_hpr`, which is
     where it is read BACKWARDS. */
  function rectFromCoords(Cesium,coords){
    if(!Array.isArray(coords)||coords.length<4) return Cesium.Rectangle.MAX_VALUE;
    const lngs=coords.map(c=>c[0]), lats=coords.map(c=>c[1]);
    return Cesium.Rectangle.fromDegrees(Math.min(...lngs),Math.min(...lats),Math.max(...lngs),Math.max(...lats));
  }
  function dsList(coll){ const out=[]; for(let i=0;i<coll.length;i++) out.push(coll.get(i)); return out; }

  return CesiumView;
  }

  /* ── shared helpers (no Cesium needed) ─────────────────────────────────────── */
  /* every one of these is INSIDE the IIFE on purpose: js/ has zero top-level
     declarations by design (#R169, re-verified by tests/r175-checks.test.mjs on
     every commit) — that property is what made the #R175 conversion to ES modules
     incapable of changing a name resolution, and it holds for new files too. */
  function wrapLng(v){ return ((v+180)%360+360)%360-180; }
  function normBounds(b){
    try{
      if(!b) return null;
      if(Array.isArray(b)&&b.length===2&&Array.isArray(b[0]))
        return { west:+b[0][0], south:+b[0][1], east:+b[1][0], north:+b[1][1] };
      if(Array.isArray(b)&&b.length===4) return { west:+b[0], south:+b[1], east:+b[2], north:+b[3] };
      if(typeof b.getWest==='function')
        return { west:b.getWest(), south:b.getSouth(), east:b.getEast(), north:b.getNorth() };
      if(b.west!=null) return { west:+b.west, south:+b.south, east:+b.east, north:+b.north };
    }catch(_){}
    return null;
  }
  function normLngLat(c){
    if(!c) return {lng:0,lat:0};
    if(Array.isArray(c)) return {lng:+c[0],lat:+c[1]};
    if(c.lng!=null) return {lng:+c.lng,lat:+c.lat};
    if(c.lon!=null) return {lng:+c.lon,lat:+c.lat};
    return {lng:0,lat:0};
  }
  function normaliseFC(d){
    if(!d||typeof d!=='object') return {type:'FeatureCollection',features:[]};
    if(d.type==='FeatureCollection') return d;
    if(d.type==='Feature') return {type:'FeatureCollection',features:[d]};
    return {type:'FeatureCollection',features:[]};
  }
  function kindOf(type){
    if(type==='raster'||type==='hillshade'||type==='color-relief'||type==='heatmap') return 'imagery';
    if(type==='background') return 'background';
    if(type==='fill'||type==='line'||type==='circle'||type==='symbol'||type==='fill-extrusion') return 'vector';
    return 'unsupported';
  }

  /* ══ THE ADAPTER ═════════════════════════════════════════════════════════════
     The same object js/geo-engine.js's makeMapLibreAdapter returns, method for
     method, so engineFacade can bind either one and no call site can tell. Where
     Cesium genuinely cannot answer, the method says NO (returns false/null) —
     never a value that looks like a yes. */
  const CESIUM_CAPS={ engine:'cesium', globe:true, flat:true, terrain3d:true, freeCamera:true, pitchBeyond90:true,
    rasterLayers:true, vectorLayers:true, geojson:true, terrainElevation:true, markers:true, opacity:true,
    projection:true, extrusion3d:true, solid3d:false, orbit3d:true,
    /* the three things #R171/#R172 had to ask MapLibre for, and which a positional
       camera on a real ellipsoid simply has */
    globeAllZooms:true, tiltRange:[0,180], cameraAltitude:true, eyeControl:true,
    /* (#R184) …and the camera IS a position, which is a stronger statement than eyeControl:
       MapLibre can be talked into holding a viewpoint, but its camera is defined by a centre and
       a zoom and the eye is derived from them. The flight simulator asks this question because
       the two answers need two different ways of driving the cockpit — see js/geo-engine.js. */
    eyeIsPosition:true,
    /* honest about what the interpreter does NOT implement — surfaced rather than
       discovered as a missing layer (#R162) */
    styleGaps:()=>{ try{ return window.IntMapStyle.gaps(); }catch(_){ return []; } } };

  function makeCesiumAdapter(_m,ViewClass){
    const V=()=>_m();
    const num=(v,d)=>isFinite(v)?v:d;
    let _decl=null, _lastBranch='n/a';
    const declare=p=>{ _decl=p||null; };
    /* (#R182) …`around` included — see setCamera. It used to stop here. */
    const camOf=o=>({ center:o&&o.center, zoom:o&&o.zoom, bearing:o&&o.bearing, pitch:o&&o.pitch,
                      roll:o&&o.roll, around:o&&o.around });
    /* (#R181) the animation options a caller ASKED for — `duration: 0` is an answer, not a
       missing one, so the test is `!= null` rather than truthiness (see zoomIn/zoomOut) */
    const _dur=(o,dflt)=>((o&&o.duration!=null)?(o.duration>0?{duration:o.duration}:null):dflt);
    const declOf=o=>o&&typeof o==='object'
      ? { zoom:o.zoom!=null, center:o.center!=null, pitch:o.pitch!=null, bearing:o.bearing!=null, roll:o.roll!=null }
      : null;
    return {
      id:'cesium', capabilities:CESIUM_CAPS,
      /* camera */
      flyTo(o){ const v=V(); if(v){ declare(declOf(o)); v.setCamera(camOf(o),{duration:(o&&o.duration!=null)?o.duration:1200}); } },
      easeTo(o){ const v=V(); if(v){ declare(declOf(o)); v.setCamera(camOf(o),{duration:(o&&o.duration!=null)?o.duration:400}); } },
      jumpTo(o){ const v=V(); if(v){ declare(declOf(o)); v.setCamera(camOf(o),null); } },
      fitBounds(b,o){ const v=V(); if(!v) return; declare({zoom:true,center:true});
        const c=this.cameraForBounds(b,o); if(c) v.setCamera(c,(o&&o.duration)?{duration:o.duration}:null); },
      /* (#R182) the fit itself now lives ON THE VIEW — js/cesium-input.js's box zoom
         needs it too, and a second copy of the sphere solve is exactly what #R181
         went to the trouble of not having. */
      cameraForBounds(b,o){ const v=V(); return v?v.cameraForBounds(b,o):null; },
      setPadding(p){ const v=V(); if(v) v._padding=Object.assign({},v._padding,p||{}); },
      getPadding(){ const v=V(); return v?v._padding:null; },
      getCamera(){ const v=V(); if(!v) return null;
        return { center:v.getCenter(), zoom:v.getZoom(), bearing:v.getBearing(), pitch:v.getPitch() }; },
      /* Cesium's scene modes ARE the projection: SCENE3D is a real ellipsoid at
         every zoom (which MapLibre's `globe` is not — #R171), COLUMBUS_VIEW is a
         Mercator plane you can still tilt and drape terrain on, which is what this
         app's "flat" means. SCENE2D is not used: it is orthographic and cannot
         tilt, so it would silently take the pitch away. */
      setProjection(mode){ const v=V(); if(!v) return false;
        try{
          if(mode==='flat') v._scene.morphToColumbusView(0.6);
          else v._scene.morphTo3D(0.6);
          return true;
        }catch(_){ return false; } },
      getProjection(){ const v=V(); if(!v) return null;
        try{ return { type:(v._scene.mode===Cesium.SceneMode.SCENE3D)?'globe':'mercator' }; }catch(_){ return null; } },
      globeness(){ const v=V(); try{ const t=v&&v._scene.morphTime;
        return (typeof t==='number'&&isFinite(t))?Math.max(0,Math.min(1,t)):1; }catch(_){ return 1; } },
      getZoom(){ const v=V(); return v?v.getZoom():null; },
      getCenter(){ const v=V(); return v?v.getCenter():null; },
      getBearing(){ const v=V(); return v?v.getBearing():0; },
      getPitch(){ const v=V(); return v?v.getPitch():0; },
      getBounds(){ const v=V(); return v?v.getBounds():null; },
      setBearing(b){ const v=V(); if(v){ declare({bearing:true}); v.setCamera({bearing:b},null); } },
      setPitch(p){ const v=V(); if(v){ declare({pitch:true}); v.setCamera({pitch:p},null); } },
      getRoll(){ const v=V(); return v?v.getRoll():0; },
      setRoll(r){ const v=V(); if(v) v.setCamera({roll:r},null); },
      getMaxPitch(){ const v=V(); return v?v._maxPitch:85; },
      setMaxPitch(x){ const v=V(); if(!v||!isFinite(x)) return false; v._maxPitch=Math.max(0,Math.min(180,x)); return true; },
      getMinPitch(){ const v=V(); return v?v._minPitch:0; },
      setMinZoom(x){ const v=V(); if(!v||!isFinite(x)) return false; v._minZoom=x; return true; },
      getMinZoom(){ const v=V(); return v?v._minZoom:0; },
      setMaxZoom(x){ const v=V(); if(!v||!isFinite(x)) return false; v._maxZoom=x; return true; },
      getMaxZoom(){ const v=V(); return v?v._maxZoom:22; },
      zoomRange(){ return [this.getMinZoom(),this.getMaxZoom()]; },
      /* (#R181) `duration: 0` MEANS instant, and `(o&&o.duration)` reads 0 as "not given" —
         so zoomIn({duration:0}) animated for 300 ms here while the same call on MapLibre
         returned already at the new zoom. Ask whether the caller SAID duration, not whether
         the number it said is truthy. */
      zoomTo(z,o){ const v=V(); if(v){ declare({zoom:true}); v.setCamera({zoom:z,around:o&&o.around},_dur(o,null)); } },
      zoomIn(o){ const v=V(); if(v){ declare({zoom:true}); v.setCamera({zoom:v.getZoom()+1},_dur(o,{duration:300})); } },
      zoomOut(o){ const v=V(); if(v){ declare({zoom:true}); v.setCamera({zoom:v.getZoom()-1},_dur(o,{duration:300})); } },
      stop(){ const v=V(); if(v) v.stop(); },
      setCenter(c){ const v=V(); if(v){ declare({center:true}); v.setCamera({center:c},null); } },
      panBy(off,o){ const v=V(); if(!v||!off) return; declare({center:true});
        try{ const p=v.project(v.getCenter()); const ll=v.unproject({x:p.x+off[0],y:p.y+off[1]});
             v.setCamera({center:ll},(o&&o.duration)?{duration:o.duration}:null); }catch(_){} },
      setMaxBounds(){ /* Cesium has no camera bounding box; the app only ever clears it */ },
      setRenderWorldCopies(){ /* a globe has exactly one copy of the world, always */ },
      getRenderWorldCopies(){ return false; },   /* (#R298) …and it says so, rather than staying silent */
      /* THE VIEWPOINT — free on this engine. Cesium's camera IS a position, so
         "where is the eye" and "put it back" are reads and writes, not a solve;
         that is why capabilities.eyeControl was declared true for Cesium in #R172
         before there was an adapter to honour it. */
      eyePosition(){ const v=V(); if(!v) return null;
        try{
          const c=Cesium.Cartographic.fromCartesian(v._camera.positionWC);
          const t=v._centreCarto();
          const d=Cesium.Cartesian3.distance(v._camera.positionWC,
                    Cesium.Cartesian3.fromRadians(t.longitude,t.latitude,t.height||0));
          return { lng:Cesium.Math.toDegrees(c.longitude), lat:Cesium.Math.toDegrees(c.latitude),
                   alt:c.height, distance:d };
        }catch(_){ return null; } },
      cameraAltitude(){ const e=this.eyePosition(); return e?e.alt:null; },
      setEye(o){ const v=V(); if(!v||!o) return false;
        try{
          v._camera.setView({ destination:Cesium.Cartesian3.fromDegrees(+o.lng,+o.lat,+o.alt||0),
            orientation:{ heading:Cesium.Math.toRadians(+o.bearing||0),
                          pitch:Cesium.Math.toRadians((+o.pitch||0)-90),
                          roll:Cesium.Math.toRadians(+o.roll||0) } });
          v._scene.requestRender(); v._afterMove(); return true;
        }catch(_){ return false; } },
      /* MapLibre pins the look-at point to the ground and #R172 had to unpin it to
         hold the eye. Cesium never pinned it, so there is nothing to unpin — and
         saying so (false) is the honest answer, not silently returning true. */
      setCenterClamped(){ return false; },
      /* …and for the same reason the eye pivot is the engine's NATIVE behaviour:
         changing heading/pitch on a positional camera turns its head. The whole
         #R172–#R179 correction has nothing to correct here. */
      setTiltPivot(mode){ return mode==='eye'||mode==='target'; },
      eyePivotDiag(){ return { pivot:true, hook:'native', underGuard:'n/a',
        decl:_decl?{zoom:!!_decl.zoom,center:!!_decl.center,pitch:!!_decl.pitch}:null,
        lastBranch:'cesium/native' }; },
      isAnimating(){ const v=V(); return v?v.isEasing():false; },
      cameraFromTo(from,fromAlt,to,toAlt){
        const v=V(); if(!v||!from||!to) return null;
        try{
          const a=normLngLat(from), b=normLngLat(to);
          const A=Cesium.Cartesian3.fromDegrees(a.lng,a.lat,+fromAlt||0);
          const B=Cesium.Cartesian3.fromDegrees(b.lng,b.lat,+toAlt||0);
          const d=Cesium.Cartesian3.distance(A,B);
          const enu=Cesium.Transforms.eastNorthUpToFixedFrame(A);
          const inv=Cesium.Matrix4.inverseTransformation(enu,new Cesium.Matrix4());
          const local=Cesium.Matrix4.multiplyByPoint(inv,B,new Cesium.Cartesian3());
          const heading=Cesium.Math.toDegrees(Math.atan2(local.x,local.y));
          const pitch=Cesium.Math.toDegrees(Math.atan2(local.z,Math.hypot(local.x,local.y)));
          return { center:{lng:b.lng,lat:b.lat}, zoom:v.zoomFor(b.lat,Math.max(1,d)),
                   bearing:((heading%360)+360)%360, pitch:pitch+90 };
        }catch(_){ return null; } },
      /* coords */
      project(ll){ const v=V(); return v?v.project(ll):null; },
      unproject(p){ const v=V(); return v?v.unproject(p):null; },
      projectAltitude(ll,a){ const v=V(); return v?v.projectAltitude(ll,a):null; },
      terrainElevation(ll){ const v=V(); return v?v.terrainElevation(ll):null; },
      queryRenderedFeatures(g,o){ const v=V(); return v?v.queryRenderedFeatures(g,o):[]; },
      querySourceFeatures(s,p){ const v=V(); return v?v.querySourceFeatures(s,p):[]; },
      worldSize(){ const v=V(); return v?TILE*Math.pow(2,v.getZoom()):0; },
      lngLat(lng,lat){ return { lng, lat, toArray:()=>[lng,lat] }; },
      /* sources + layers */
      hasSource(id){ const v=V(); return v?v.hasSource(id):false; },
      addSource(id,d){ const v=V(); if(v) v.addSource(id,d); },
      setSourceData(id,d){ const v=V(); if(v) v.setSourceData(id,d); },
      removeSource(id){ const v=V(); if(v) v.removeSource(id); },
      sourceData(id){ const v=V(); return v?v.sourceData(id):null; },
      setSourceTiles(id,t){ const v=V(); return v?v.setSourceTiles(id,t):false; },
      updateImageSource(id,o){ const v=V(); return v?v.updateImageSource(id,o):false; },
      /* (#R193) the animated geographic quad — see the view class for why this engine needs two
         canvases where MapLibre needs one */
      addDynamicImage(id,o,b){ const v=V(); return v?v.addDynamicImage(id,o,b):false; },
      /* (#R195) geographic here, Mercator on MapLibre — the painter asks rather than assumes */
      imageRowLatitudes(c,h){ const v=V(); return v?v.imageRowLatitudes(c,h):null; },
      touchDynamicImage(id){ const v=V(); return v?v.touchDynamicImage(id):false; },
      setDynamicImageOpacity(id,x){ const v=V(); return v?v.setDynamicImageOpacity(id,x):false; },
      setDynamicImageCoords(id,c){ const v=V(); return v?v.setDynamicImageCoords(id,c):false; },
      hasDynamicImage(id){ const v=V(); return v?v.hasDynamicImage(id):false; },
      removeDynamicImage(id){ const v=V(); return v?v.removeDynamicImage(id):false; },
      hasLayer(id){ const v=V(); return v?v.hasLayer(id):false; },
      getLayer(id){ const v=V(); return v?v.getLayer(id):null; },
      addLayer(d,b){ const v=V(); if(v) v.addLayer(d,b); },
      removeLayer(id){ const v=V(); if(v) v.removeLayer(id); },
      moveLayer(id,b){ const v=V(); if(v) v.moveLayer(id,b); },
      setVisible(id,on){ const v=V(); if(v) v.setVisible(id,on); },
      isVisible(id){ const v=V(); return v?v.isVisible(id):false; },
      setPaint(id,p,x){ const v=V(); if(v) v.setPaint(id,p,x); },
      getPaint(id,p){ const v=V(); return v?v.getPaint(id,p):undefined; },
      setLayout(id,p,x){ const v=V(); if(v) v.setLayout(id,p,x); },
      getLayout(id,p){ const v=V(); return v?v.getLayout(id,p):undefined; },
      setFilter(id,f){ const v=V(); if(v) v.setFilter(id,f); },
      getFilter(id){ const v=V(); return v?v.getFilter(id):null; },
      setOpacity(id,x){ const v=V(); if(v) v.setOpacity(id,x); },
      setFeatureState(f,s){ const v=V(); if(v) v.setFeatureState(f,s); },
      getFeatureState(f){ const v=V(); return v?v.getFeatureState(f):null; },
      removeFeatureState(f,k){ const v=V(); if(v) v.removeFeatureState(f,k); },
      addExtrusion(d,b){ const v=V(); if(!v||v.hasLayer(d.id)) return false;
        v.addLayer(Object.assign({type:'fill-extrusion'},d),b); return true; },
      setExtrusionRange(id,base,top){ const v=V(); if(!v||!v.hasLayer(id)) return false;
        v.setPaint(id,'fill-extrusion-base',base); v.setPaint(id,'fill-extrusion-height',top); return true; },
      /* A CLOSED BODY. #R173 answered this on MapLibre with a custom GL layer
         (js/solid3d.js) because fill-extrusion has no floor. Cesium's polygon has
         closeTop AND closeBottom, so the intent is native — but the ABSORPTION
         shading that solid3d computes from the eye is not, so capabilities.solid3d
         stays false and the caller keeps its documented fallback rather than being
         handed something that looks like the feature and is not. */
      addSolid(){ return false; }, setSolid(){ return false; }, removeSolid(){ return false; },
      /* (#R202) objects in orbit. Where MapLibre needs a custom GL layer for this, Cesium has the
         primitive already — a PointPrimitiveCollection of Cartesian3s at real heights, in a scene
         that is a real ellipsoid, so the far side of the planet occludes them without being asked.
         What Cesium does NOT have is a per-frame extrapolation uniform, so the caller's rate is
         applied here on the CPU at the same cadence the scene renders. */
      addOrbit(id,b){ const v=V(); return v&&v.addOrbit?v.addOrbit(id,b):false; },
      setOrbit(id,o){ const v=V(); return v&&v.setOrbit?v.setOrbit(id,o):false; },
      removeOrbit(id){ const v=V(); return v&&v.removeOrbit?v.removeOrbit(id):false; },
      projectMercAlt(a){ const v=V(); return v&&v.projectMercAlt?v.projectMercAlt(a):null; },
      /* scene */
      getStyle(){ const v=V(); return v?v.getStyle():null; },
      setLight(l){ const v=V(); if(v) v.setLight(l); },
      setSky(s){ const v=V(); if(v) v.setSky(s); },
      getSky(){ const v=V(); return v?v.getSky():null; },
      /* (#R187) the polar-cap imagery, switched with the basemap by js/world-base.js. ⚠ It has to be
         listed HERE and not only on the view: the engine contract calls the ADAPTER, and a method
         that exists only on the view reads as "this engine has no such thing" and silently no-ops —
         which is exactly how the caps stayed hidden in satellite mode the first time round. */
      setWorldBase(on){ const v=V(); return v?v.setWorldBase(on):false; },
      setTerrain(t){ const v=V(); return v?v.setTerrain(t):false; },
      getTerrain(){ const v=V(); return v?v.getTerrain():null; },
      addImage(id,img){ const v=V(); return v?v.addImage(id,img):false; },
      hasImage(id){ const v=V(); return v?v.hasImage(id):false; },
      removeImage(id){ const v=V(); if(v) v.removeImage(id); },
      /* NO `if(v)` GUARD — that is the whole point (see PROTOCOLS at the top). The app registers
         the satellite protocol thirty lines before it asks for a view, so a method that needs a
         view to exist would return false and drop the handler on the floor. Measured after the
         first attempt at this fix moved only the STORAGE: the layer still fetched nothing,
         because this guard was still here. A scheme handler belongs to the app, not to a canvas. */
      addProtocol(n,fn){ if(!n||typeof fn!=='function') return false; PROTOCOLS[n]=fn; return true; },
      setImageConcurrency(n){ try{ if(Cesium&&Cesium.RequestScheduler&&isFinite(n)){
        Cesium.RequestScheduler.maximumRequests=n;
        Cesium.RequestScheduler.maximumRequestsPerServer=Math.max(6,Math.round(n/4)); return true; } }catch(_){}
        return false; },
      /* CONTOURS FROM THE DEM. maplibre-contour registers a protocol on the
         MapLibre namespace, which does not exist here — so this engine says no
         rather than returning a URL nothing can fetch, and js/data-layers.js's own
         feature test (it already handles a null return) picks the fallback. */
      demContourSource(){ return null; },
      /* readiness */
      styleReady(){ const v=V(); return v?v.isStyleLoaded():false; },
      styleParsed(){ const v=V(); return v?v.styleParsed():false; },
      canDraw(){ return this.styleReady()||this.styleParsed(); },
      /* events */
      on(e,c){ const v=V(); if(v) v.on(e,c); }, off(e,c){ const v=V(); if(v) v.off(e,c); },
      once(e,c){ const v=V(); if(v) v.once(e,c); },
      onLayer(e,l,c){ const v=V(); if(v) v.onLayer(e,l,c); },
      offLayer(e,l,c){ const v=V(); if(v) v.offLayer(e,l,c); },
      onceLayer(e,l,c){ const v=V(); if(!v) return; const w=(x)=>{ v.offLayer(e,l,w); c(x); }; v.onLayer(e,l,w); },
      /* render surface */
      resize(){ const v=V(); if(v) v.resize(); },
      /* (#R202) Cesium's own name for the same quantity is resolutionScale — a multiplier on the
         canvas backing store, which is exactly what setRenderScale asks for. */
      getRenderScale(){ const v=V(); try{ return v?v._widget.resolutionScale:null; }catch(_){ return null; } },
      setRenderScale(r){ const v=V(); try{ if(v&&isFinite(r)&&r>0){ v._widget.resolutionScale=r; v._scene.requestRender&&v._scene.requestRender(); return true; } }catch(_){} return false; },
      triggerRepaint(){ const v=V(); if(v) v.triggerRepaint(); },
      getCanvas(){ const v=V(); return v?v.getCanvas():null; },
      getContainer(){ const v=V(); return v?v.getContainer():null; },
      getCanvasContainer(){ const v=V(); return v?v.getCanvasContainer():null; },
      getSize(){ const v=V(); if(!v) return {width:0,height:0};
        return { width:v._canvasW(), height:v._canvasH() }; },
      setCursor(c){ const v=V(); if(v) v.setCursor(c); },
      /* input */
      setDragPan(on){ return this.setGesture('dragPan',on); },
      setGesture(n,on){ const v=V(); return v?v.setGesture(n,on):false; },
      gestures(){ return ['dragPan','dragRotate','scrollZoom','touchZoomRotate','keyboard','doubleClickZoom','boxZoom','touchPitch']; },
      /* (#R182) …and this reaches the SAME two rates MapLibre keeps
         (scrollZoom.setWheelZoomRate / setZoomRate). It used to be folded into
         Cesium's single `zoomFactor` through `Math.max(0.5, 5*r)`, which for both of
         the app's settings (1/300 and 1/90) clamped to 0.5 — a tenth of Cesium's own
         default — so the navigation-sensitivity slider moved nothing and the wheel
         barely moved the map. */
      setZoomRate(r,wheel){ const v=V(); return v?v.setZoomRate(r,wheel):false; },
      /* renderer-owned UI. Cesium has no popup/marker primitive, so these are DOM
         elements positioned by projecting their anchor every frame — the same
         thing MapLibre's Popup/Marker are, and they answer the same little API
         (setLngLat/setHTML/addTo/remove/isOpen) the 18 call sites use. */
      popup(o){ return makeOverlay(V,'popup',o); },
      marker(o){ return makeOverlay(V,'marker',o); },
      addMarker(o,ll){ const m=makeOverlay(V,'marker',o); if(ll) m.setLngLat(ll); return m.addTo(V()); },
      addPopup(o,ll,html){ const p=makeOverlay(V,'popup',o); if(ll) p.setLngLat(ll);
        if(html!=null) p.setHTML(html); return p.addTo(V()); },
      attach(o){ try{ if(o&&o.addTo) o.addTo(V()); }catch(_){} return o; },
      /* views */
      createView(o){ try{ return new ViewClass(o); }catch(e){ console.warn('Cesium init failed:',e); return null; } },
      createSubView(o){
        let vv=null; try{ vv=new ViewClass(o); }catch(_){ return null; }
        if(!vv) return null;
        const sub=makeCesiumAdapter(()=>vv,ViewClass);
        const face=window.IntMapGeoEngine.makeFacade(()=>sub);
        face.destroy=()=>{ try{ vv.destroy(); }catch(_){} vv=null; return true; };
        return face;
      },
      raw(){ return _m(); }
    };
  }

  /* ── POPUPS AND MARKERS ────────────────────────────────────────────────────
     MapLibre's Popup and Marker are DOM elements it re-projects every frame, and
     the app's CSS already styles them (`.maplibregl-popup`, `.maplibregl-marker`
     — 11 selectors in 26 places, measured in #R179). Keeping those class names is
     deliberate: the styling is the app's, not the renderer's, and re-implementing
     the positioning is far less work than re-theming every popup in the project. */
  function makeOverlay(V,kind,opts){
    const o=opts||{};
    const el=document.createElement('div');
    el.className=(kind==='popup'?'maplibregl-popup maplibregl-popup-anchor-bottom':'maplibregl-marker')
                 +(o.className?' '+o.className:'');
    el.style.position='absolute'; el.style.willChange='transform'; el.style.zIndex=kind==='popup'?'5':'4';
    let content=null, closer=null;
    if(kind==='popup'){
      const tip=document.createElement('div'); tip.className='maplibregl-popup-tip';
      content=document.createElement('div'); content.className='maplibregl-popup-content';
      if(o.maxWidth) content.style.maxWidth=o.maxWidth;
      el.appendChild(tip); el.appendChild(content);
      if(o.closeButton!==false){
        closer=document.createElement('button');
        closer.className='maplibregl-popup-close-button'; closer.type='button';
        closer.setAttribute('aria-label','Close popup'); closer.textContent='×';
        content.appendChild(closer);
      }
    } else if(o.element){ el.appendChild(o.element); }
    const state={ view:null, ll:null, open:false, raf:0 };
    const offset=(typeof o.offset==='number')?o.offset:0;
    function place(){
      state.raf=0;
      const v=state.view; if(!v||!state.ll) return;
      const p=v.projectAltitude?v.projectAltitude(state.ll,0):v.project(state.ll);
      if(!p||p.x<-1e5){ el.style.display='none'; }
      else{
        el.style.display='';
        const anchor=(kind==='popup')?'translate(-50%,-100%)':'translate(-50%,-100%)';
        el.style.transform=`translate(${Math.round(p.x)}px,${Math.round(p.y-offset)}px) ${anchor}`;
      }
    }
    const sched=()=>{ if(!state.raf) state.raf=requestAnimationFrame(place); };
    const api={
      setLngLat(ll){ state.ll=normLngLat(ll); sched(); return api; },
      getLngLat(){ return state.ll; },
      setHTML(h){ if(content){ const keep=closer; content.innerHTML=h==null?'':String(h); if(keep) content.appendChild(keep); }
                  else el.innerHTML=h==null?'':String(h); sched(); return api; },
      setText(t){ return api.setHTML(window.IntMapSafe?window.IntMapSafe.html(t):String(t==null?'':t)); },
      setDOMContent(n){ if(content){ content.innerHTML=''; content.appendChild(n); if(closer) content.appendChild(closer); }
                        else { el.innerHTML=''; el.appendChild(n); } sched(); return api; },
      setMaxWidth(w){ if(content) content.style.maxWidth=w; return api; },
      setOffset(){ return api; },
      getElement(){ return el; },
      isOpen(){ return state.open; },
      addTo(view){
        const v=view&&view._widget?view:V();
        if(!v) return api;
        state.view=v; state.open=true;
        const host=v.getContainer(); if(host&&el.parentNode!==host) host.appendChild(el);
        if(!api.__wired){ api.__wired=true;
          v.on('move',sched); v.on('moveend',sched); v.on('resize',sched);
          if(closer) closer.addEventListener('click',()=>{ api.remove(); });
          if(o.closeOnClick!==false&&kind==='popup') v.on('click',()=>{ if(state.open) api.remove(); });
        }
        sched();
        return api;
      },
      remove(){ state.open=false; try{ el.remove(); }catch(_){} if(o.onClose) try{ o.onClose(); }catch(_){}
                return api; },
      togglePopup(){ return api; },
      setPopup(){ return api; }
    };
    /* Marker's own little API, the parts the app uses */
    api._map=null;
    Object.defineProperty(api,'_map',{ get:()=>state.open?state.view:null, configurable:true });
    return api;
  }

  /* ══ BOOT ════════════════════════════════════════════════════════════════════
     Called by js/engine-select.js BEFORE DOMContentLoaded, so the adapter is in
     place by the time app-body.js asks the contract for a view. Resolves false
     when Cesium cannot be brought up at all — the caller then leaves MapLibre
     installed and says so, rather than presenting a dead map. */
  async function boot(){
    try{
      await loadCesium();
      if(!Cesium||!Cesium.CesiumWidget) return false;
      const ViewClass=viewFactory();
      const adapter=makeCesiumAdapter(()=>window.__imap,ViewClass);
      if(!(window.IntMapGeoEngine&&window.IntMapGeoEngine.use)) return false;
      window.IntMapGeoEngine.use(adapter);
      /* diagnostics, in the spirit of window.__imap / window.IntMapSatProto — the registered
         scheme handlers are reported so "is the satellite protocol actually wired?" is a
         question with an answer, rather than something inferred from a blank layer */
      window.__imCesium={ Cesium, adapter, protocols:()=>Object.keys(PROTOCOLS) };
      return true;
    }catch(e){ console.warn('[IntMap] Cesium engine failed to start:',e); return false; }
  }

  return { boot, loadCesium, makeCesiumAdapter, CESIUM_CAPS,
           /* test hooks — the camera mapping is the one piece that has to agree
              with MapLibre numerically, so it is measurable from the outside */
           _rangeFor:(lat,zoom,c2cPx)=>((2*Math.PI*R_EARTH*Math.cos(lat*D2R))/(TILE*Math.pow(2,zoom)))*c2cPx,
           _zoomFor:(lat,range,c2cPx)=>Math.log2((2*Math.PI*R_EARTH*Math.cos(lat*D2R))*c2cPx/(TILE*range)),
           /* (#R184) the anti-aliasing policy, exposed so the rule can be checked without
              constructing a widget — see _msaaFor and the constructor's measurement */
           _msaaFor,
           ML_FOVY, TILE };
})();
