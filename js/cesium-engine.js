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
      this._protocols=Object.create(null);
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
        skyBox:false, skyAtmosphere:new Cesium.SkyAtmosphere(),
        requestRenderMode:true, maximumRenderTimeChange:Infinity,
        scene3DOnly:false,
        contextOptions:{ webgl:{ alpha:false, antialias:o.antialias!==false, preserveDrawingBuffer:!!o.preserveDrawingBuffer,
                                 powerPreference:'high-performance' },
                         requestWebgl1:false },
        msaaSamples:(o.antialias===false?1:4),
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
      this._globe.showGroundAtmosphere=true;
      this._globe.depthTestAgainstTerrain=false;    /* markers must not sink into a hill */
      this._globe.enableLighting=false;
      scene.highDynamicRange=false;
      /* FXAA on top of MSAA: MSAA smooths geometry edges (the terrain silhouette and the
         globe's limb), FXAA also smooths the shaded/textured interior where the imagery
         meets a ridge. Both are cheap next to the fragment cost already being paid, and
         the standing brief is 「表示速度、画質を高めて。どちらか一方犠牲はNG」. */
      try{ const fx=scene.postProcessStages&&scene.postProcessStages.fxaa; if(fx) fx.enabled=(o.antialias!==false); }catch(_){}
      /* the maximum anisotropy the GPU offers, so imagery on a steeply tilted surface stays
         sharp instead of blurring to mush — the case a 3-D globe is in constantly */
      try{ const ctx=scene.context; if(ctx&&ctx.maximumTextureFilterAnisotropy)
        this._maxAniso=ctx.maximumTextureFilterAnisotropy; }catch(_){}
      scene.screenSpaceCameraController.enableCollisionDetection=false;
      this._applyFov();

      /* the app's own DataSource collection, one per style layer */
      this._dsColl=new Cesium.DataSourceCollection();
      this._dsDisplay=new Cesium.DataSourceDisplay({ scene, dataSourceCollection:this._dsColl });
      const tick=()=>{ try{ this._dsDisplay.update(Cesium.JulianDate.now()); }catch(_){} };
      scene.preRender.addEventListener(tick);

      this._wireEvents();
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
    _centreCarto(){
      try{
        const scene=this._scene;
        const px=new Cesium.Cartesian2(this._canvasW()/2,this._canvasH()/2);
        const ray=this._camera.getPickRay(px);
        let p=ray?scene.globe.pick(ray,scene):null;
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
       east-north-up frame, `orbitPosition` puts the eye at
           E = −range·sin(pitch)·sin(heading)
           N = −range·sin(pitch)·cos(heading)
           U =  range·cos(pitch)
       which inverts in closed form, gives MapLibre's 0–180° convention directly (pitch 0 =
       overhead, 90 = horizon, 180 = under the centre looking up), and is exact by construction
       — the same transcription, read backwards, which is #R177's rule about having ONE copy of
       the geometry rather than two that agree with each other and not with the renderer. */
    _hpr(){
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
        const heading=(horiz>range*1e-9)
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

    setCamera(cam,animate){
      const now={ center:this.getCenter(), zoom:this.getZoom(), bearing:this.getBearing(), pitch:this.getPitch() };
      const c=cam.center!=null?normLngLat(cam.center):now.center;
      let zoom=(cam.zoom==null?now.zoom:cam.zoom);
      zoom=Math.max(this._minZoom,Math.min(this._maxZoom,zoom));
      let pitch=(cam.pitch==null?now.pitch:cam.pitch);
      pitch=Math.max(this._minPitch,Math.min(this._maxPitch,pitch));
      const bearing=(cam.bearing==null?now.bearing:cam.bearing);
      const range=Math.max(1,this.rangeFor(c.lat,zoom));
      /* the look-at point sits ON the terrain when there is terrain, so a tilted
         close-up over a mountain frames the mountain and not the ellipsoid under it */
      let h=0; try{ const cc=Cesium.Cartographic.fromDegrees(c.lng,c.lat); const g=this._globe.getHeight(cc); if(isFinite(g)) h=g; }catch(_){}
      const target=Cesium.Cartesian3.fromDegrees(c.lng,c.lat,h);
      const hpr=new Cesium.HeadingPitchRange(Cesium.Math.toRadians(bearing),Cesium.Math.toRadians(pitch-90),range);
      const fire=()=>{ this._afterMove(); };
      if(animate&&animate.duration>0){
        /* Cesium's flyTo takes a destination, not an orbit, so the orbit is solved
           here and handed over as a position + orientation. Same arithmetic as the
           instant path — one transcription, two callers. */
        const dest=orbitPosition(target,hpr);
        this.fire('movestart',{}); this.fire('zoomstart',{});
        this._camera.flyTo({ destination:dest,
          orientation:{ heading:hpr.heading, pitch:hpr.pitch, roll:Cesium.Math.toRadians(cam.roll||0) },
          duration:Math.max(0.1,animate.duration/1000),
          easingFunction:Cesium.EasingFunction.CUBIC_IN_OUT,
          complete:()=>{ this._settle(c,zoom,pitch,bearing,h); fire(); this.fire('moveend',{}); this.fire('zoomend',{}); },
          cancel:()=>{ fire(); this.fire('moveend',{}); } });
        return;
      }
      this._camera.lookAt(target,hpr);
      this._camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      this._settle(c,zoom,pitch,bearing,h);
      if(cam.roll!=null&&isFinite(cam.roll)){
        try{ this._camera.setView({ orientation:{ heading:this._camera.heading, pitch:this._camera.pitch, roll:Cesium.Math.toRadians(cam.roll) } }); }catch(_){}
      }
      this._scene.requestRender();
      fire();
      this.fire('move',{}); this.fire('moveend',{});
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
          Cesium.Cartesian3.clone(this._camera.positionWC,mine);
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
      this.fire('sourcedata',{sourceId:id});
    }
    _fetchGeoJSON(rec,url){
      fetch(url,{mode:'cors',credentials:'omit'}).then(r=>r.ok?r.json():null).then(j=>{
        if(!j) return; rec.data=normaliseFC(j); this._markSourceDirty(rec.id); this.fire('sourcedata',{sourceId:rec.id});
      }).catch(()=>{});
    }
    setSourceData(id,data){
      const rec=this._sources.get(id); if(!rec) return;
      if(typeof data==='string'){ this._fetchGeoJSON(rec,data); return; }
      rec.data=normaliseFC(data);
      this._markSourceDirty(id);
      this.fire('sourcedata',{sourceId:id});
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
    _markSourceDirty(id){
      this._layers.forEach(l=>{ if(l.def.source===id) this._dirty.add(l.def.id); });
      this._schedule();
    }
    _features(def){
      const rec=this._sources.get(def.source);
      if(!rec) return [];
      if(rec.type==='geojson') return (rec.data&&rec.data.features)||[];
      if(rec.type==='vector'&&rec.vt){
        const b=this.getBoundsLL();
        const all=rec.vt.update(b,this.getZoom());
        return def['source-layer']?all.filter(f=>f.sourceLayer===def['source-layer']):all;
      }
      return [];
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
          const ds=this._vec.build(def,visible?this._features(def):[],this._env());
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
          maxzoom:spec.maxzoom, minzoom:spec.minzoom, attribution:spec.attribution, protocols:this._protocols });
      }
      if(def.type==='hillshade'){
        const paintOf=()=>{
          const p=def.paint||{}, ctx={zoom:this.getZoom(),properties:{}};
          return { exaggeration:S().resolveNum(p['hillshade-exaggeration'],ctx,0.5),
                   shadow:S().resolveColor(p['hillshade-shadow-color'],ctx,'#000000'),
                   highlight:S().resolveColor(p['hillshade-highlight-color'],ctx,'#ffffff'),
                   azimuth:335, altitude:45 };
        };
        return CL().makeCanvasImageryProvider(Cesium,CL().makeHillshadeDraw(this._dem,paintOf),
          { maxzoom:Math.min(14,this._dem.maxzoom()), attribution:'Elevation: Mapzen / AWS Terrain Tiles' });
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
      L.brightness=Math.max(n('raster-brightness-min',0)*2,0)+n('raster-brightness-max',1)*0+ (p['raster-brightness-min']!=null?1+n('raster-brightness-min',0):1);
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
      if(rec.ds) this._dirty.add(id);
      this._schedule();
    }
    getLayout(id,prop){ const rec=this._layerById.get(id); return rec&&rec.def.layout?rec.def.layout[prop]:undefined; }
    setFilter(id,f){ const rec=this._layerById.get(id); if(!rec) return;
      rec.def.filter=f; this._dirty.add(id); this._schedule(); }
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
    _env(){ return { zoom:this.getZoom(), terrain:!!this._terrainSpec, images:this._images,
                     maxFeatures:this._maxFeatures, states:null }; }

    /* ── the redraw loop ───────────────────────────────────────────────────── */
    _schedule(){
      if(this._raf) return;
      this._raf=requestAnimationFrame(()=>{ this._raf=0; this._flush(); });
    }
    _flush(){
      const env=this._env();
      const ids=[...this._dirty]; this._dirty.clear();
      for(const id of ids){
        const rec=this._layerById.get(id); if(!rec) continue;
        if(rec.kind!=='vector'||!rec.ds) continue;
        if(!rec.ds.show) continue;
        try{ this._vec.update(rec.ds,rec.def,this._features(rec.def),
                              Object.assign({},env,{states:this._statesFor(rec.def)})); }catch(_){}
      }
      try{ this._vec.placeLabels(this._scene,this._dsColl instanceof Array?this._dsColl:dsList(this._dsColl),this._maxLabels); }catch(_){}
      this._scene.requestRender();
    }
    _afterMove(){
      /* everything whose paint reads the zoom, plus every vector-tile-backed layer
         (a new camera means a new tile cover) */
      const z=this.getZoom();
      if(this._lastZoom==null||Math.abs(z-this._lastZoom)>0.01){
        this._lastZoom=z;
        this._layers.forEach(l=>{ if(l.kind==='vector') this._dirty.add(l.def.id);
                                  else if(l.imagery) this._applyImageryPaint(l); });
      } else {
        this._layers.forEach(l=>{ const rec=this._sources.get(l.def.source);
          if(l.kind==='vector'&&rec&&rec.type==='vector') this._dirty.add(l.def.id); });
      }
      this._schedule();
    }

    /* ── events ────────────────────────────────────────────────────────────── */
    on(name,fn){ (this._handlers[name]||(this._handlers[name]=[])).push(fn); return this; }
    off(name,fn){ const a=this._handlers[name]; if(!a) return this;
      const i=a.indexOf(fn); if(i>=0) a.splice(i,1); return this; }
    once(name,fn){ const w=(e)=>{ this.off(name,w); fn(e); }; return this.on(name,w); }
    fire(name,ev){ const a=this._handlers[name]; if(!a||!a.length) return;
      for(const fn of a.slice()){ try{ fn(ev||{}); }catch(_){} } }
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
      H.setInputAction(m=>dispatch('contextmenu',m.position),T.RIGHT_CLICK);
      H.setInputAction(m=>dispatch('mousemove',m.endPosition),T.MOUSE_MOVE);
      /* the camera's own stream — MapLibre's move/zoom family, from the one event
         Cesium raises when anything about the view changes */
      let moving=false, tmr=0;
      this._camera.changed.raiseEventOnCameraChange=true;
      this._camera.percentageChanged=0.02;
      const onChanged=()=>{
        if(!moving){ moving=true; this.fire('movestart',{}); this.fire('dragstart',{}); }
        this.fire('move',{}); this.fire('zoom',{});
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
                       id:undefined, geometry:null, __entity:ent });
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
        return true;
      }catch(_){ return false; }
    }
    getTerrain(){ return this._terrainSpec; }
    setSky(s){
      try{
        if(s===null||s===false){ this._scene.skyAtmosphere.show=false; return; }
        this._scene.skyAtmosphere.show=true;
        /* MapLibre's sky spec names a horizon and a fog colour; Cesium's atmosphere
           is parameterised by brightness/hue/saturation shifts, so the colour is
           carried across as a brightness shift rather than pretended to be exact. */
        const c=S().parseColor(s&&(s['sky-color']||s['horizon-color']));
        if(c) this._scene.skyAtmosphere.brightnessShift=Math.max(-1,Math.min(1,(c.r+c.g+c.b)/3-0.5));
      }catch(_){}
    }
    getSky(){ try{ return this._scene.skyAtmosphere.show?{}:null; }catch(_){ return null; } }
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
    addProtocol(name,fn){ this._protocols[name]=fn; return true; }

    /* ── the rest of the surface ───────────────────────────────────────────── */
    resize(){ try{ this._widget.resize(); this._applyFov(); this._scene.requestRender(); this.fire('resize',{}); }catch(_){} }
    triggerRepaint(){ try{ this._scene.requestRender(); }catch(_){} }
    getCanvas(){ return this._widget.canvas; }
    getContainer(){ return this._container; }
    getCanvasContainer(){ return this._widget.canvas&&this._widget.canvas.parentNode; }
    isStyleLoaded(){ return this._loaded&&this._styleParsed; }
    styleParsed(){ return this._styleParsed; }
    isEasing(){ try{ return !!this._camera._currentFlight; }catch(_){ return false; } }
    stop(){ try{ this._camera.cancelFlight(); }catch(_){} }
    setGesture(name,on){
      const c=this._scene.screenSpaceCameraController;
      const map={ dragPan:'enableTranslate', dragRotate:'enableRotate', scrollZoom:'enableZoom',
                  touchZoomRotate:'enableZoom', keyboard:null, doubleClickZoom:null,
                  boxZoom:null, touchPitch:'enableTilt' };
      const k=map[name];
      if(k===undefined) return false;
      if(k===null){ this._gestures[name]=!!on; return true; }
      try{ c[k]=!!on; this._gestures[name]=!!on; return true; }catch(_){ return false; }
    }
    setCursor(c){ try{ const cv=this._widget.canvas; if(cv) cv.style.cursor=c||''; }catch(_){} }
    destroy(){
      try{ if(this._ro) this._ro.disconnect(); }catch(_){}
      try{ if(this._ssHandler) this._ssHandler.destroy(); }catch(_){}
      try{ this._dsDisplay.destroy(); }catch(_){}
      try{ this._widget.destroy(); }catch(_){}
    }
  }

  /* the eye position for an orbit — the same solve setCamera's instant path uses,
     factored out so the animated path cannot drift from it */
  function orbitPosition(target,hpr){
    const t=Cesium.Transforms.eastNorthUpToFixedFrame(target);
    const off=new Cesium.Cartesian3(
      hpr.range*Math.cos(-hpr.pitch)*Math.sin(hpr.heading)*-1,
      hpr.range*Math.cos(-hpr.pitch)*Math.cos(hpr.heading)*-1,
      hpr.range*Math.sin(-hpr.pitch));
    return Cesium.Matrix4.multiplyByPoint(t,off,new Cesium.Cartesian3());
  }
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
    projection:true, extrusion3d:true, solid3d:false,
    /* the three things #R171/#R172 had to ask MapLibre for, and which a positional
       camera on a real ellipsoid simply has */
    globeAllZooms:true, tiltRange:[0,180], cameraAltitude:true, eyeControl:true,
    /* honest about what the interpreter does NOT implement — surfaced rather than
       discovered as a missing layer (#R162) */
    styleGaps:()=>{ try{ return window.IntMapStyle.gaps(); }catch(_){ return []; } } };

  function makeCesiumAdapter(_m,ViewClass){
    const V=()=>_m();
    const num=(v,d)=>isFinite(v)?v:d;
    let _decl=null, _lastBranch='n/a';
    const declare=p=>{ _decl=p||null; };
    const camOf=o=>({ center:o&&o.center, zoom:o&&o.zoom, bearing:o&&o.bearing, pitch:o&&o.pitch, roll:o&&o.roll });
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
      cameraForBounds(b,o){ const v=V(); if(!v||!b) return null;
        const bb=normBounds(b); if(!bb) return null;
        const lat=(bb.north+bb.south)/2, lng=wrapLng((bb.east+bb.west)/2);
        /* the zoom at which the box fills the viewport, in the same Mercator pixels
           the range↔zoom mapping is written in */
        const pad=(o&&o.padding)||0, padN=(typeof pad==='number')?pad:0;
        const W=Math.max(1,v._canvasW()-2*padN), H=Math.max(1,v._canvasH()-2*padN);
        const my=l=>Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,l))*D2R/2));
        const dx=Math.abs(wrapLng(bb.east-bb.west))/360, dy=Math.abs(my(bb.north)-my(bb.south))/(2*Math.PI);
        const zx=dx>0?Math.log2(W/(TILE*dx)):20, zy=dy>0?Math.log2(H/(TILE*dy)):20;
        const zoom=Math.max(v._minZoom,Math.min(v._maxZoom,Math.min(zx,zy)));
        return { center:{lng,lat}, zoom, bearing:(o&&o.bearing)||0, pitch:(o&&o.pitch)||0 };
      },
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
      zoomTo(z,o){ const v=V(); if(v){ declare({zoom:true}); v.setCamera({zoom:z},(o&&o.duration)?{duration:o.duration}:null); } },
      zoomIn(o){ const v=V(); if(v){ declare({zoom:true}); v.setCamera({zoom:v.getZoom()+1},(o&&o.duration)?{duration:o.duration}:{duration:300}); } },
      zoomOut(o){ const v=V(); if(v){ declare({zoom:true}); v.setCamera({zoom:v.getZoom()-1},(o&&o.duration)?{duration:o.duration}:{duration:300}); } },
      stop(){ const v=V(); if(v) v.stop(); },
      setCenter(c){ const v=V(); if(v){ declare({center:true}); v.setCamera({center:c},null); } },
      panBy(off,o){ const v=V(); if(!v||!off) return; declare({center:true});
        try{ const p=v.project(v.getCenter()); const ll=v.unproject({x:p.x+off[0],y:p.y+off[1]});
             v.setCamera({center:ll},(o&&o.duration)?{duration:o.duration}:null); }catch(_){} },
      setMaxBounds(){ /* Cesium has no camera bounding box; the app only ever clears it */ },
      setRenderWorldCopies(){ /* a globe has exactly one copy of the world, always */ },
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
      /* scene */
      getStyle(){ const v=V(); return v?v.getStyle():null; },
      setLight(l){ const v=V(); if(v) v.setLight(l); },
      setSky(s){ const v=V(); if(v) v.setSky(s); },
      getSky(){ const v=V(); return v?v.getSky():null; },
      setTerrain(t){ const v=V(); return v?v.setTerrain(t):false; },
      getTerrain(){ const v=V(); return v?v.getTerrain():null; },
      addImage(id,img){ const v=V(); return v?v.addImage(id,img):false; },
      hasImage(id){ const v=V(); return v?v.hasImage(id):false; },
      removeImage(id){ const v=V(); if(v) v.removeImage(id); },
      addProtocol(n,fn){ const v=V(); return v?v.addProtocol(n,fn):false; },
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
      setZoomRate(r){ const v=V(); try{ v._scene.screenSpaceCameraController.zoomFactor=Math.max(0.5,5*(r||1)); return true; }catch(_){ return false; } },
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
      window.__imCesium={ Cesium, adapter };
      return true;
    }catch(e){ console.warn('[IntMap] Cesium engine failed to start:',e); return false; }
  }

  return { boot, loadCesium, makeCesiumAdapter, CESIUM_CAPS,
           /* test hooks — the camera mapping is the one piece that has to agree
              with MapLibre numerically, so it is measurable from the outside */
           _rangeFor:(lat,zoom,c2cPx)=>((2*Math.PI*R_EARTH*Math.cos(lat*D2R))/(TILE*Math.pow(2,zoom)))*c2cPx,
           _zoomFor:(lat,range,c2cPx)=>Math.log2((2*Math.PI*R_EARTH*Math.cos(lat*D2R))*c2cPx/(TILE*range)),
           ML_FOVY, TILE };
})();
