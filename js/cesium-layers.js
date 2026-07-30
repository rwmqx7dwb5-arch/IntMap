/* ============================================================================
 *  IntMap · CESIUM PROVIDERS AND LAYER RENDERERS  (#R180)
 * ----------------------------------------------------------------------------
 *  The back half of the style interpreter: given a MapLibre layer definition and
 *  the features of its source, put the right thing in a Cesium scene.
 *
 *  Everything here is a FACTORY taking the Cesium namespace, because Cesium is
 *  imported dynamically (a MapLibre session must not download it) and so there
 *  is no module-scope `Cesium` to close over.
 *
 *  WHAT MAPS TO WHAT, and why each is the honest equivalent rather than a
 *  look-alike:
 *
 *    raster           → ImageryLayer. Cesium's own imagery pipeline, and it
 *                       carries brightness/contrast/saturation/hue/gamma
 *                       natively — which is what the app's dark base map is
 *                       built out of (#R34's measured contrast + brightness
 *                       floor), so those four paint properties are not
 *                       approximated at all.
 *    fill             → PolygonGraphics, classified onto the terrain so a
 *                       choropleth follows the ground instead of floating.
 *    line             → PolylineGraphics, clamped to ground; `line-dasharray`
 *                       becomes a PolylineDashMaterial.
 *    circle           → PointGraphics (a screen-space disc, which is exactly
 *                       what circle-radius means).
 *    symbol           → LabelGraphics (+ BillboardGraphics when icon-image is
 *                       set), with the screen-space declutter Cesium does not
 *                       do for itself — see placeLabels().
 *    fill-extrusion   → PolygonGraphics with height/extrudedHeight in METRES,
 *                       which is what #R170 needed and Cesium is built for.
 *    heatmap          → a density raster computed in Mercator and shown as an
 *                       imagery layer, coloured through the same heatmap-color
 *                       ramp expression the GPU shader would evaluate.
 *    hillshade        → a real slope/aspect shade computed from the SAME
 *                       terrarium DEM tiles the app already loads.
 *    color-relief     → the same DEM, coloured through the layer's own ramp.
 *    background       → the globe's base colour.
 * ==========================================================================*/
window.IntMapCesiumLayers=(function(){
  'use strict';
  const S=()=>window.IntMapStyle;

  /* ── DEM TILES, DECODED ONCE AND SHARED ────────────────────────────────────
     Terrain, hillshade and colour-relief all want the same terrarium PNGs, and
     the app already pays for them on the MapLibre side. One decoder, one cache. */
  function makeDemCache(){
    const cache=new Map(), MAX=400;
    const inflight=new Map();
    let templates=['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'];
    let maxzoom=15;
    function configure(spec){
      if(spec&&spec.tiles&&spec.tiles.length) templates=spec.tiles.slice();
      if(spec&&spec.maxzoom!=null) maxzoom=spec.maxzoom;
    }
    function url(z,x,y){ const t=templates[(x+y)%templates.length];
      return t.replace('{z}',z).replace('{x}',x).replace('{y}',y); }
    /* → Float32Array of heights in metres, row-major, size×size, or null.
       ══ DECODED AT NATIVE RESOLUTION, ALWAYS ═════════════════════════════════════════════
       The first version drew the 256-px tile into a 64-px canvas and decoded that, which is
       wrong in a way that looks like a plausible number rather than an error: terrarium packs
       one height across THREE channels (R·256 + G + B/256 − 32768), so the encoding is not
       linear in RGB and the browser's bilinear downscale blends R against R and G against G
       independently. A boundary where R steps by one — i.e. every 256 m contour — comes back
       as a height thousands of metres away from either neighbour. Measured on the first build:
       Tokyo, whose real elevation is a few metres, read −6,592 m.
       So decode the tile as delivered, and let the CALLER point-sample the float heights it
       needs. Interpolating metres is fine; interpolating the encoding is not. */
    function get(z,x,y,size){
      const k=z+'/'+x+'/'+y;
      const hit=cache.get(k); if(hit){ cache.delete(k); cache.set(k,hit); return Promise.resolve(hit); }
      if(inflight.has(k)) return inflight.get(k);
      const p=(async()=>{
        try{
          const r=await fetch(url(z,x,y),{mode:'cors',credentials:'omit'});
          if(!r.ok) return null;
          const bmp=await createImageBitmap(await r.blob());
          const n=bmp.width||256;
          const c=(typeof OffscreenCanvas!=='undefined')?new OffscreenCanvas(n,n):Object.assign(document.createElement('canvas'),{width:n,height:n});
          const ctx=c.getContext('2d',{willReadFrequently:true});
          ctx.imageSmoothingEnabled=false;          /* belt and braces — 1:1 here, but never resample the encoding */
          ctx.drawImage(bmp,0,0,n,n);
          try{ bmp.close&&bmp.close(); }catch(_){}
          const px=ctx.getImageData(0,0,n,n).data;
          const out=new Float32Array(n*n);
          /* terrarium: height = (R*256 + G + B/256) − 32768 */
          for(let i=0,j=0;i<out.length;i++,j+=4) out[i]=(px[j]*256+px[j+1]+px[j+2]/256)-32768;
          out.size=n;
          cache.set(k,out);
          while(cache.size>MAX){ const f=cache.keys().next().value; if(f===k) break; cache.delete(f); }
          return out;
        }catch(_){ return null; }
        finally{ inflight.delete(k); }
      })();
      inflight.set(k,p);
      return p;
    }
    return { get, configure, maxzoom:()=>maxzoom, size:()=>cache.size,
             clear:()=>{ cache.clear(); inflight.clear(); } };
  }

  /* ── TERRAIN, KEYLESS ──────────────────────────────────────────────────────
     Cesium's own terrain is an Ion asset behind a token. The app has no account
     and is keyless by policy, and it ALREADY streams a global DEM — the AWS
     terrarium tiles it feeds MapLibre's `raster-dem` source (#R7/#R19/#R20, up
     to the tileset's native z15). So the second engine reads the same tiles and
     builds HeightmapTerrainData from them: the same ground, to the metre, as the
     3-D terrain the MapLibre side draws — which is the only way "switch engines"
     can mean "same world". */
  function makeTerrainProvider(Cesium,dem,opts){
    opts=opts||{};
    /* ── HOW MANY SAMPLES A TILE CARRIES ──────────────────────────────────────
       This is the terrain's real quality knob and it cuts both ways at once.
       Cesium decides when to split a tile from `getLevelMaximumGeometricError`,
       which is derived FROM this number: a denser heightmap has a smaller error
       at the same level, so the same on-screen fidelity is reached with FEWER
       tiles — finer ground and fewer requests, not one traded for the other.
       The source tiles are 256², so 129 samples an every-other-pixel grid (with
       the shared edge that makes neighbouring tiles meet without a crack) and
       throws away nothing a coarser mesh was keeping. Phones stay at 65: the
       vertex buffers are the cost there, and 「ブラウザが落ちることがないように」
       has outranked sharpness on mobile since #R20. */
    const SIZE=opts.samples||129;
    const scheme=new Cesium.WebMercatorTilingScheme();
    const levelZeroMaximumGeometricError=Cesium.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
      scheme.ellipsoid, SIZE, scheme.getNumberOfXTilesAtLevel(0));
    const maxLevel=Math.min(opts.maxzoom==null?15:opts.maxzoom, 15);
    const exaggeration=opts.exaggeration==null?1:opts.exaggeration;

    class TerrariumTerrainProvider {
      constructor(){
        this._errorEvent=new Cesium.Event();
        this.tilingScheme=scheme;
        this.ready=true;
        this.hasWaterMask=false;
        this.hasVertexNormals=false;
        this.credit=new Cesium.Credit('Elevation: Mapzen / AWS Terrain Tiles',false);
      }
      get errorEvent(){ return this._errorEvent; }
      get availability(){ return undefined; }
      getLevelMaximumGeometricError(level){ return levelZeroMaximumGeometricError/(1<<level); }
      getTileDataAvailable(x,y,level){ return level<=maxLevel; }
      loadTileDataAvailability(){ return undefined; }
      requestTileGeometry(x,y,level){
        if(level>maxLevel) return undefined;
        return dem.get(level,x,y,SIZE).then(heights=>{
          const buf=new Float32Array(SIZE*SIZE);
          if(heights){
            const n=heights.size||SIZE;
            if(n===SIZE) buf.set(heights);
            else{
              /* BILINEAR on the decoded METRES. Resampling the terrarium ENCODING is what
                 read −6,592 m over Tokyo (see makeDemCache); resampling the heights it
                 decodes to is just arithmetic, and it is smoother than point-sampling on a
                 ridge — which matters here because these samples ARE the mesh. */
              const s=(n-1)/(SIZE-1);
              for(let r=0;r<SIZE;r++){
                const fy=r*s, y0=Math.min(n-1,fy|0), y1=Math.min(n-1,y0+1), ty=fy-y0;
                for(let c=0;c<SIZE;c++){
                  const fx=c*s, x0=Math.min(n-1,fx|0), x1=Math.min(n-1,x0+1), tx=fx-x0;
                  const a=heights[y0*n+x0], b=heights[y0*n+x1], d=heights[y1*n+x0], e=heights[y1*n+x1];
                  buf[r*SIZE+c]=(a+(b-a)*tx)+((d+(e-d)*tx)-(a+(b-a)*tx))*ty;
                }
              }
            }
          }
          if(exaggeration!==1) for(let i=0;i<buf.length;i++) buf[i]*=exaggeration;
          return new Cesium.HeightmapTerrainData({
            buffer:buf, width:SIZE, height:SIZE,
            /* ══ lowest/highestEncodedHeight ARE NOT OPTIONAL ═════════════════════════
               Cesium fills in the rest of `structure` from defaults, and with
               elementsPerHeight:1 the default highestEncodedHeight is 256¹ − 1 = 255
               and the default lowest is 0. It CLAMPS to that window — so every real
               elevation was being pinned and the mesh came out meaningless: measured on
               the first build, globe.getHeight() answered −57,092 m over Mt Fuji (real
               3,776 m) and −55,820 m over Tokyo, while the tile itself decoded correctly
               to 3,280 m at that pixel. The camera went with it, because setCamera puts
               the look-at point ON the terrain — a z14 jumpTo landed 22° of latitude away.
               One wrong default, two subsystems visibly broken, and the decoder blameless.
               The window is the DEM's own range: terrarium is bounded by its ±32,768 m
               encoding, and the Earth by roughly −11,000 m (Challenger Deep) to 9,000 m. */
            structure:{ heightScale:1, heightOffset:0, elementsPerHeight:1, stride:1,
                        elementMultiplier:256, isBigEndian:false,
                        lowestEncodedHeight:-12000, highestEncodedHeight:9500 },
            /* a missing tile must not punch a hole in the globe — it becomes sea level,
               which is what the DEM says for most of the places it does not cover */
            childTileMask:level<maxLevel?15:0
          });
        }).catch(()=>undefined);
      }
    }
    return new TerrariumTerrainProvider();
  }

  /* ── IMAGERY THROUGH THE APP'S OWN TILE PATHS ──────────────────────────────
     Two reasons this is not just UrlTemplateImageryProvider:
       · the satellite source is a registered PROTOCOL (`imapsat://`), which is
         where #R158's grey-placeholder repair and #R178/#R179's HiDPI stitching
         live. Bypassing it would hand the Cesium user the half-resolution,
         grey-at-the-limit imagery the MapLibre user stopped getting two rounds
         ago — the same defect, in the new engine.
       · the raster sources round-robin over host aliases (`a`–`d`.cartocdn,
         two ArcGIS hosts, five S3 aliases), which is worth ~2× on HTTP/1.1 and
         is a property of the URL LIST, not of any one template. */
  function makeTileImageryProvider(Cesium,cfg){
    const tiles=(cfg.tiles||[]).slice();
    const tileSize=cfg.tileSize||256;
    const protocols=cfg.protocols||{};
    const scheme=new Cesium.WebMercatorTilingScheme();
    const maxLevel=cfg.maxzoom==null?19:cfg.maxzoom;
    const minLevel=cfg.minzoom==null?0:cfg.minzoom;

    function urlFor(x,y,level){
      if(!tiles.length) return null;
      const t=tiles[(x+y)%tiles.length];
      return t.replace('{z}',level).replace('{x}',x).replace('{y}',y)
              .replace(/\{s\}/,'abcd'[(x+y)%4]).replace(/\{quadkey\}/,'');
    }
    class AppImageryProvider {
      constructor(){
        this._errorEvent=new Cesium.Event();
        this.tilingScheme=scheme;
        this.rectangle=scheme.rectangle;
        this.tileWidth=tileSize; this.tileHeight=tileSize;
        this.maximumLevel=maxLevel; this.minimumLevel=minLevel;
        this.ready=true;
        this.hasAlphaChannel=true;
        this.credit=cfg.attribution?new Cesium.Credit(cfg.attribution,true):undefined;
        this.proxy=undefined; this.tileDiscardPolicy=undefined;
      }
      get errorEvent(){ return this._errorEvent; }
      getTileCredits(){ return undefined; }
      pickFeatures(){ return undefined; }
      requestImage(x,y,level){
        const url=urlFor(x,y,level);
        if(!url) return undefined;
        const scheme=/^([a-z0-9+.-]+):\/\//i.exec(url);
        const proto=scheme&&protocols[scheme[1]];
        if(proto){
          /* the registered handler returns {data: ImageBitmap|ArrayBuffer} — the same
             contract MapLibre's addProtocol has, so #R179's stitched 512-px satellite
             tile arrives here as a bitmap with no re-encode */
          const ac=(typeof AbortController!=='undefined')?new AbortController():{signal:undefined,abort(){}};
          return Promise.resolve(proto({url},ac)).then(res=>{
            const d=res&&res.data;
            if(!d) return undefined;
            if(typeof ImageBitmap!=='undefined'&&d instanceof ImageBitmap) return d;
            if(d instanceof ArrayBuffer||ArrayBuffer.isView(d)) return createImageBitmap(new Blob([d]));
            return d;
          }).catch(()=>undefined);
        }
        return Cesium.ImageryProvider.loadImage(this,new Cesium.Resource({url,request:new Cesium.Request({throttle:true,throttleByServer:true,type:Cesium.RequestType.IMAGERY})}));
      }
    }
    return new AppImageryProvider();
  }

  /* ── A CANVAS THE ENGINE PAINTS ITSELF ─────────────────────────────────────
     Heatmaps, hillshade and colour-relief are all "compute a raster over the
     visible extent, then show it". One provider, three producers. */
  function makeCanvasImageryProvider(Cesium,draw,opts){
    opts=opts||{};
    const scheme=new Cesium.WebMercatorTilingScheme();
    const size=opts.tileSize||256;
    class CanvasImageryProvider {
      constructor(){
        this._errorEvent=new Cesium.Event();
        this.tilingScheme=scheme;
        this.rectangle=scheme.rectangle;
        this.tileWidth=size; this.tileHeight=size;
        this.maximumLevel=opts.maxzoom==null?14:opts.maxzoom;
        this.minimumLevel=opts.minzoom==null?0:opts.minzoom;
        this.ready=true; this.hasAlphaChannel=true;
        this.credit=opts.attribution?new Cesium.Credit(opts.attribution,true):undefined;
        this._version=0;
      }
      get errorEvent(){ return this._errorEvent; }
      getTileCredits(){ return undefined; }
      pickFeatures(){ return undefined; }
      requestImage(x,y,level){
        try{ return Promise.resolve(draw(x,y,level,size)).catch(()=>undefined); }
        catch(_){ return undefined; }
      }
    }
    return new CanvasImageryProvider();
  }

  /* tile (x,y,level) → its lng/lat box, the conversion every canvas producer needs */
  function tileBox(x,y,level){
    const n=Math.pow(2,level);
    const lng0=x/n*360-180, lng1=(x+1)/n*360-180;
    const my0=Math.PI-2*Math.PI*y/n, my1=Math.PI-2*Math.PI*(y+1)/n;
    const lat0=180/Math.PI*Math.atan(0.5*(Math.exp(my0)-Math.exp(-my0)));
    const lat1=180/Math.PI*Math.atan(0.5*(Math.exp(my1)-Math.exp(-my1)));
    return { west:lng0, east:lng1, north:lat0, south:lat1 };
  }
  function newCanvas(w,h){
    if(typeof OffscreenCanvas!=='undefined') return new OffscreenCanvas(w,h);
    const c=document.createElement('canvas'); c.width=w; c.height=h; return c;
  }

  /* ── HILLSHADE, from the same DEM ──────────────────────────────────────────
     A genuine slope/aspect shade (Horn's 3×3 gradient, the same one GDAL and
     MapLibre use), not a texture that looks like one. `hillshade-exaggeration`,
     the shadow/highlight/accent colours and the illumination direction all come
     from the layer's own paint properties. */
  function makeHillshadeDraw(dem,paintOf){
    return async function draw(x,y,level,size){
      const p=paintOf()||{};
      const heights=await dem.get(Math.min(level,dem.maxzoom()),x,y,size);
      if(!heights) return undefined;
      const n=heights.size||size;
      const c=newCanvas(size,size), ctx=c.getContext('2d');
      const img=ctx.createImageData(size,size), o=img.data;
      const ex=p.exaggeration==null?0.5:p.exaggeration;
      const az=(p.azimuth==null?335:p.azimuth)*Math.PI/180, alt=(p.altitude==null?45:p.altitude)*Math.PI/180;
      const box=tileBox(x,y,level);
      /* ground metres per sample, so the slope is a real gradient rather than a
         pixel one — otherwise the same terrain shades differently at every zoom */
      const latMid=(box.north+box.south)/2;
      const mPerSampleX=(2*Math.PI*6378137*Math.cos(latMid*Math.PI/180))/Math.pow(2,level)/n;
      const mPerSampleY=(2*Math.PI*6378137)/Math.pow(2,level)/n;
      const shadow=p.shadow||{r:0,g:0,b:0,a:1}, highlight=p.highlight||{r:1,g:1,b:1,a:1};
      const H=(r,cc)=>heights[Math.max(0,Math.min(n-1,r))*n+Math.max(0,Math.min(n-1,cc))];
      for(let r=0;r<size;r++) for(let cc=0;cc<size;cc++){
        const sr=(r*n/size)|0, sc=(cc*n/size)|0;
        const dzdx=((H(sr-1,sc+1)+2*H(sr,sc+1)+H(sr+1,sc+1))-(H(sr-1,sc-1)+2*H(sr,sc-1)+H(sr+1,sc-1)))/(8*mPerSampleX);
        const dzdy=((H(sr+1,sc-1)+2*H(sr+1,sc)+H(sr+1,sc+1))-(H(sr-1,sc-1)+2*H(sr-1,sc)+H(sr-1,sc+1)))/(8*mPerSampleY);
        const slope=Math.atan(ex*4*Math.hypot(dzdx,dzdy));
        const aspect=Math.atan2(dzdy,-dzdx);
        let v=Math.cos(alt)*Math.sin(slope)*Math.cos(az-aspect)+Math.sin(alt)*Math.cos(slope);
        v=Math.max(0,Math.min(1,v));
        /* below the light's own level = shadow tint, above = highlight tint */
        const t=v, col=t<0.5?shadow:highlight, k=t<0.5?(1-t*2):((t-0.5)*2);
        const i=(r*size+cc)*4;
        o[i]=Math.round(col.r*255); o[i+1]=Math.round(col.g*255); o[i+2]=Math.round(col.b*255);
        o[i+3]=Math.round(255*k*(col.a==null?1:col.a)*0.72);
      }
      ctx.putImageData(img,0,0);
      return c.transferToImageBitmap?c.transferToImageBitmap():createImageBitmap(c);
    };
  }

  /* ── COLOUR RELIEF ─────────────────────────────────────────────────────────
     `color-relief-color` is an `interpolate` over `['elevation']`, so the ramp is
     evaluated through the SAME expression interpreter the vector layers use —
     the ramp is data, not a hard-coded palette. */
  function makeReliefDraw(dem,rampOf){
    return async function draw(x,y,level,size){
      const ramp=rampOf();
      if(!ramp) return undefined;
      const heights=await dem.get(Math.min(level,dem.maxzoom()),x,y,size);
      if(!heights) return undefined;
      const n=heights.size||size;
      const c=newCanvas(size,size), ctx=c.getContext('2d');
      const img=ctx.createImageData(size,size), o=img.data;
      /* one lookup table per tile rather than one evaluation per pixel: the ramp
         depends on elevation alone, and 65 536 evaluations a tile is the whole
         frame budget */
      const LUT=new Uint8Array(1024*4);
      const LO=-500, HI=9000;
      for(let i=0;i<1024;i++){
        const el=LO+(HI-LO)*i/1023;
        const col=S().resolveColor(ramp,{ properties:{}, elevation:el, zoom:level },'rgba(0,0,0,0)')||{r:0,g:0,b:0,a:0};
        LUT[i*4]=Math.round(col.r*255); LUT[i*4+1]=Math.round(col.g*255);
        LUT[i*4+2]=Math.round(col.b*255); LUT[i*4+3]=Math.round((col.a==null?1:col.a)*255);
      }
      for(let r=0;r<size;r++) for(let cc=0;cc<size;cc++){
        const h=heights[Math.min(n-1,(r*n/size)|0)*n+Math.min(n-1,(cc*n/size)|0)];
        let k=Math.round((h-LO)/(HI-LO)*1023); k=k<0?0:k>1023?1023:k;
        const i=(r*size+cc)*4, j=k*4;
        o[i]=LUT[j]; o[i+1]=LUT[j+1]; o[i+2]=LUT[j+2]; o[i+3]=LUT[j+3];
      }
      ctx.putImageData(img,0,0);
      return c.transferToImageBitmap?c.transferToImageBitmap():createImageBitmap(c);
    };
  }

  /* `['elevation']` is a color-relief-only input; the interpreter reaches it
     through ctx.elevation, so teach it that name here rather than widening the
     shared evaluator with a term only this layer type has. */
  const RELIEF_CTX_PATCH=true;

  /* ── HEATMAP ───────────────────────────────────────────────────────────────
     The GPU version accumulates a per-pixel density from weighted points and
     colours it through `heatmap-color` at `heatmap-density`. Same thing on a
     canvas: a radial kernel per point, then the ramp as a lookup table. */
  function makeHeatmapDraw(featuresOf,paintOf){
    return async function draw(x,y,level,size){
      const p=paintOf()||{};
      const feats=featuresOf();
      if(!feats||!feats.length) return undefined;
      const box=tileBox(x,y,level);
      const radius=Math.max(1,p.radius==null?30:p.radius);
      const pad=radius*2;
      /* accumulate in a padded buffer so a point just outside the tile still
         contributes — otherwise every tile boundary is a visible seam */
      const W=size+pad*2;
      const acc=new Float32Array(W*W);
      const lngSpan=box.east-box.west, latSpan=box.north-box.south;
      if(!(lngSpan>0)) return undefined;
      const kernel=[];
      for(let dy=-radius;dy<=radius;dy++) for(let dx=-radius;dx<=radius;dx++){
        const d=Math.hypot(dx,dy); if(d>radius) continue;
        kernel.push([dx,dy,1-d/radius]);
      }
      let maxV=0;
      for(const f of feats){
        const g=f&&f.geometry; if(!g||g.type!=='Point') continue;
        const [lng,lat]=g.coordinates;
        if(lng<box.west-lngSpan||lng>box.east+lngSpan) continue;
        const px=Math.round((lng-box.west)/lngSpan*size)+pad;
        const py=Math.round((box.north-lat)/latSpan*size)+pad;
        if(px<0||py<0||px>=W||py>=W) continue;
        const w=p.weightOf?p.weightOf(f):1;
        for(const [dx,dy,k] of kernel){
          const ax=px+dx, ay=py+dy; if(ax<0||ay<0||ax>=W||ay>=W) continue;
          const i=ay*W+ax; acc[i]+=k*w; if(acc[i]>maxV) maxV=acc[i];
        }
      }
      if(maxV<=0) return undefined;
      const intensity=p.intensity==null?1:p.intensity;
      const LUT=new Uint8Array(256*4);
      for(let i=0;i<256;i++){
        const col=p.colorAt?p.colorAt(i/255):{r:0,g:0,b:0,a:0};
        LUT[i*4]=Math.round(col.r*255); LUT[i*4+1]=Math.round(col.g*255);
        LUT[i*4+2]=Math.round(col.b*255); LUT[i*4+3]=Math.round((col.a==null?1:col.a)*255);
      }
      const c=newCanvas(size,size), ctx=c.getContext('2d');
      const img=ctx.createImageData(size,size), o=img.data;
      const norm=1/Math.max(1e-6,maxV);
      for(let r=0;r<size;r++) for(let cc=0;cc<size;cc++){
        const v=Math.min(1,acc[(r+pad)*W+(cc+pad)]*norm*intensity);
        const j=Math.round(v*255)*4, i=(r*size+cc)*4;
        o[i]=LUT[j]; o[i+1]=LUT[j+1]; o[i+2]=LUT[j+2];
        o[i+3]=Math.round(LUT[j+3]*(p.opacity==null?1:p.opacity));
      }
      ctx.putImageData(img,0,0);
      return c.transferToImageBitmap?c.transferToImageBitmap():createImageBitmap(c);
    };
  }

  /* ── VECTOR LAYERS → ENTITIES ──────────────────────────────────────────────
     A CustomDataSource per style layer, so show/hide, ordering and removal are
     one call each and picking answers with the feature that was drawn.
     Rebuilt when the data changes; the paint is re-resolved in place when only
     the zoom moved, which is the common case. */
  function makeVectorRenderer(Cesium){
    const St=()=>window.IntMapStyle;
    const col=c=>c?new Cesium.Color(c.r,c.g,c.b,c.a==null?1:c.a):Cesium.Color.TRANSPARENT;

    /* the evaluation context for one feature, in the shape the interpreter wants */
    function ctxFor(f,zoom,state){
      const g=f.geometry||{};
      let gt=g.type||'';
      if(gt.startsWith('Multi')) gt=gt.slice(5);
      if(gt==='LinearRing') gt='LineString';
      return { properties:f.properties||{}, geometryType:gt, id:(f.id!=null?f.id:(f.properties&&f.properties.id)),
               zoom, state:state||{} };
    }
    /* every ring / line / point in a geometry, as flat lng,lat,(alt) arrays */
    function rings(g){
      if(!g) return [];
      if(g.type==='Polygon') return [g.coordinates];
      if(g.type==='MultiPolygon') return g.coordinates;
      return [];
    }
    function lines(g){
      if(!g) return [];
      if(g.type==='LineString') return [g.coordinates];
      if(g.type==='MultiLineString') return g.coordinates;
      if(g.type==='Polygon') return g.coordinates;
      if(g.type==='MultiPolygon') return g.coordinates.reduce((a,p)=>a.concat(p),[]);
      return [];
    }
    function points(g){
      if(!g) return [];
      if(g.type==='Point') return [g.coordinates];
      if(g.type==='MultiPoint') return g.coordinates;
      return [];
    }
    const deg=coords=>{ const out=[];
      for(const c of coords){ if(!c||c.length<2) continue; const a=+c[0], b=+c[1];
        if(!isFinite(a)||!isFinite(b)) continue; out.push(a,b); }
      return out; };

    /* ONE style layer. `def` is the MapLibre layer definition verbatim. */
    function build(def,feats,env){
      const ds=new Cesium.CustomDataSource(def.id);
      update(ds,def,feats,env);
      return ds;
    }
    function update(ds,def,feats,env){
      const zoom=env.zoom, states=env.states||{}, terrain=!!env.terrain;
      const paint=def.paint||{}, layout=def.layout||{};
      const pass=St().compileFilter(def.filter);
      const ents=ds.entities;
      ents.suspendEvents();
      ents.removeAll();
      /* minzoom/maxzoom are the layer's own visibility window and MapLibre applies
         them before anything else — a layer outside it draws nothing at all. */
      const inZoom=(def.minzoom==null||zoom>=def.minzoom)&&(def.maxzoom==null||zoom<def.maxzoom);
      if(!inZoom||layout.visibility==='none'){ ents.resumeEvents(); return ds; }
      const R=(spec,ctx,fb)=>St().resolve(spec,ctx,fb);
      const RC=(spec,ctx,fb)=>St().resolveColor(spec,ctx,fb);
      const RN=(spec,ctx,fb)=>St().resolveNum(spec,ctx,fb);
      let n=0;
      for(const f of feats){
        const st=states[String(f.id!=null?f.id:(f.properties&&f.properties.id))]||{};
        const ctx=ctxFor(f,zoom,st);
        if(!pass(ctx)) continue;
        if(++n>env.maxFeatures) break;
        const g=f.geometry;
        try{
          switch(def.type){
            case 'fill': {
              const fc=RC(paint['fill-color'],ctx,'#000000');
              const op=RN(paint['fill-opacity'],ctx,1);
              for(const poly of rings(g)){
                if(!poly.length) continue;
                ents.add({ id:def.id+'/'+n+'/'+ents.values.length, properties:f.properties,
                  polygon:{ hierarchy:hierarchyOf(Cesium,poly),
                    material:col({...fc,a:(fc.a==null?1:fc.a)*op}),
                    /* draped onto the ground so a choropleth follows the terrain instead
                       of cutting through a hillside */
                    classificationType:terrain?Cesium.ClassificationType.TERRAIN:Cesium.ClassificationType.BOTH,
                    perPositionHeight:false } });
              }
              break; }
            case 'fill-extrusion': {
              const fc=RC(paint['fill-extrusion-color'],ctx,'#888888');
              const op=RN(paint['fill-extrusion-opacity'],ctx,1);
              const base=RN(paint['fill-extrusion-base'],ctx,0);
              const top=RN(paint['fill-extrusion-height'],ctx,0);
              for(const poly of rings(g)){
                if(!poly.length) continue;
                ents.add({ id:def.id+'/x'+ents.values.length, properties:f.properties,
                  polygon:{ hierarchy:hierarchyOf(Cesium,poly), height:base, extrudedHeight:top,
                    material:col({...fc,a:(fc.a==null?1:fc.a)*op}), closeTop:true, closeBottom:true,
                    outline:false } });
              }
              break; }
            case 'line': {
              const lc=RC(paint['line-color'],ctx,'#000000');
              const op=RN(paint['line-opacity'],ctx,1);
              const w=Math.max(0.1,RN(paint['line-width'],ctx,1));
              const dash=R(paint['line-dasharray'],ctx,null);
              const c4=col({...lc,a:(lc.a==null?1:lc.a)*op});
              const material=(Array.isArray(dash)&&dash.length>=2)
                ? new Cesium.PolylineDashMaterialProperty({ color:c4, dashLength:Math.max(4,(dash[0]+dash[1])*w*2) })
                : c4;
              for(const ln of lines(g)){
                const pos=deg(ln); if(pos.length<4) continue;
                ents.add({ id:def.id+'/l'+ents.values.length, properties:f.properties,
                  polyline:{ positions:Cesium.Cartesian3.fromDegreesArray(pos), width:w, material,
                    clampToGround:true, arcType:Cesium.ArcType.GEODESIC } });
              }
              break; }
            case 'circle': {
              const cc=RC(paint['circle-color'],ctx,'#000000');
              const op=RN(paint['circle-opacity'],ctx,1);
              const rad=Math.max(0.5,RN(paint['circle-radius'],ctx,5));
              const sw=RN(paint['circle-stroke-width'],ctx,0);
              const sc=RC(paint['circle-stroke-color'],ctx,'#ffffff');
              for(const pt of points(g)){
                if(!pt||pt.length<2) continue;
                ents.add({ id:def.id+'/p'+ents.values.length, properties:f.properties,
                  position:Cesium.Cartesian3.fromDegrees(+pt[0],+pt[1],pt.length>2?+pt[2]:0),
                  point:{ pixelSize:rad*2, color:col({...cc,a:(cc.a==null?1:cc.a)*op}),
                    outlineWidth:sw, outlineColor:col(sc),
                    /* a marker must not be swallowed by the hill it stands on */
                    disableDepthTestDistance:Number.POSITIVE_INFINITY,
                    heightReference:(pt.length>2?Cesium.HeightReference.NONE:Cesium.HeightReference.CLAMP_TO_GROUND) } });
              }
              break; }
            case 'symbol': {
              const text=R(layout['text-field'],ctx,'');
              const icon=R(layout['icon-image'],ctx,null);
              const size=RN(layout['text-size'],ctx,14);
              const tc=RC(paint['text-color'],ctx,'#000000');
              const hc=RC(paint['text-halo-color'],ctx,'rgba(255,255,255,0.9)');
              const hw=RN(paint['text-halo-width'],ctx,0);
              const top=RN(paint['text-opacity'],ctx,1);
              const off=R(layout['text-offset'],ctx,null);
              const anchor=R(layout['text-anchor'],ctx,'center');
              const label=(text==null?'':String(text));
              if(!label&&!icon) break;
              for(const pt of points(g)){
                if(!pt||pt.length<2) continue;
                const e={ id:def.id+'/s'+ents.values.length, properties:f.properties,
                  position:Cesium.Cartesian3.fromDegrees(+pt[0],+pt[1],pt.length>2?+pt[2]:0) };
                if(label) e.label={ text:label,
                  font:`${Math.round(size)}px ${fontOf(layout['text-font'])}`,
                  fillColor:col({...tc,a:(tc.a==null?1:tc.a)*top}),
                  style:hw>0?Cesium.LabelStyle.FILL_AND_OUTLINE:Cesium.LabelStyle.FILL,
                  outlineColor:col(hc), outlineWidth:hw*2,
                  pixelOffset:Array.isArray(off)?new Cesium.Cartesian2(off[0]*size,off[1]*size):undefined,
                  horizontalOrigin:hAnchor(Cesium,anchor), verticalOrigin:vAnchor(Cesium,anchor),
                  disableDepthTestDistance:Number.POSITIVE_INFINITY,
                  heightReference:(pt.length>2?Cesium.HeightReference.NONE:Cesium.HeightReference.CLAMP_TO_GROUND),
                  /* the declutter pass below owns this; allow-overlap opts out of it */
                  show:true };
                if(icon&&env.images&&env.images[icon]) e.billboard={ image:env.images[icon],
                  scale:RN(layout['icon-size'],ctx,1),
                  rotation:-(RN(layout['icon-rotate'],ctx,0))*Math.PI/180,
                  disableDepthTestDistance:Number.POSITIVE_INFINITY,
                  heightReference:(pt.length>2?Cesium.HeightReference.NONE:Cesium.HeightReference.CLAMP_TO_GROUND) };
                const ent=ents.add(e);
                ent.__allowOverlap=(R(layout['text-allow-overlap'],ctx,false)===true);
                ent.__sortKey=RN(layout['symbol-sort-key'],ctx,0);
                ent.__padding=RN(layout['text-padding'],ctx,2);
              }
              break; }
          }
        }catch(_){ /* one feature must never take the layer down */ }
      }
      ents.resumeEvents();
      ds.__count=ents.values.length;
      ds.__truncated=(n>env.maxFeatures);
      return ds;
    }
    function hierarchyOf(Cesium,poly){
      const outer=Cesium.Cartesian3.fromDegreesArray(deg(poly[0]||[]));
      const holes=[];
      for(let i=1;i<poly.length;i++){
        const h=deg(poly[i]); if(h.length>=6) holes.push(new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(h)));
      }
      return new Cesium.PolygonHierarchy(outer,holes);
    }
    function fontOf(spec){
      const f=Array.isArray(spec)?spec[0]:spec;
      const name=(typeof f==='string')?f:'Noto Sans Regular';
      /* MapLibre font stacks name a glyph set ("Noto Sans Regular"); a canvas font
         wants a family and a weight. Split the trailing style word off. */
      const m=/^(.*?)\s+(Regular|Medium|Bold|Italic|Light|SemiBold)$/i.exec(name);
      const fam=(m?m[1]:name), wt=(m&&/bold/i.test(m[2]))?'bold ':'';
      return wt+`"${fam}", "Noto Sans", system-ui, sans-serif`;
    }
    const hAnchor=(C,a)=>/left/.test(a)?C.HorizontalOrigin.LEFT:/right/.test(a)?C.HorizontalOrigin.RIGHT:C.HorizontalOrigin.CENTER;
    const vAnchor=(C,a)=>/top/.test(a)?C.VerticalOrigin.TOP:/bottom/.test(a)?C.VerticalOrigin.BOTTOM:C.VerticalOrigin.CENTER;

    /* ── SCREEN-SPACE DECLUTTER ──────────────────────────────────────────────
       MapLibre's symbol layers are collision-detected; Cesium's LabelCollection
       is not, so a place-label layer that looks right in one engine is a solid
       block of overlapping text in the other. This is the missing pass: project
       every label, sort by the layer's own symbol-sort-key, and hide the ones
       whose box has already been taken. `text-allow-overlap` opts out, exactly
       as it does in the renderer this is matching. */
    function placeLabels(scene,dataSources,maxLabels){
      const C=Cesium;
      const now=C.JulianDate.now();
      const W=scene.canvas.clientWidth||scene.canvas.width, H=scene.canvas.clientHeight||scene.canvas.height;
      /* ON THE OTHER SIDE OF THE PLANET. A globe shows half the Earth and
         worldToWindowCoordinates happily projects the hidden half onto the screen too, so
         without this every antipodal label competes for space with — and can win against —
         the ones actually in front of the viewer. This is Cesium's own horizon test. */
      let occluder=null;
      try{ occluder=new C.EllipsoidalOccluder(scene.globe.ellipsoid,scene.camera.positionWC); }catch(_){}
      const cands=[];
      for(const ds of dataSources){
        if(!ds||!ds.show) continue;
        for(const e of ds.entities.values){ if(e.label&&e.position) cands.push(e); }
      }
      /* highest symbol-sort-key first, which is what decides who keeps the space */
      cands.sort((a,b)=>(b.__sortKey||0)-(a.__sortKey||0));
      const taken=[];
      let shown=0;
      for(const e of cands){
        const pos=e.position.getValue(now);
        if(!pos){ e.label.show=false; continue; }
        if(occluder&&!occluder.isPointVisible(pos)){ e.label.show=false; continue; }
        const win=C.SceneTransforms.worldToWindowCoordinates
          ? C.SceneTransforms.worldToWindowCoordinates(scene,pos)
          : C.SceneTransforms.wgs84ToWindowCoordinates(scene,pos);
        if(!win){ e.label.show=false; continue; }
        const txt=e.label.text&&e.label.text.getValue?e.label.text.getValue():e.label.text;
        const fs=parseFloat((e.label.font&&e.label.font.getValue?e.label.font.getValue():e.label.font)||'14')||14;
        const pad=e.__padding||2;
        const w=String(txt||'').length*fs*0.55+pad*2, h=fs+pad*2;
        const box=[win.x-w/2,win.y-h/2,win.x+w/2,win.y+h/2];
        /* OFF SCREEN: hidden, and — the part that matters — it does not RESERVE space either.
           The first version pushed every candidate's box into `taken`, so labels far outside
           the viewport were blocking visible ones. */
        if(box[2]<0||box[0]>W||box[3]<0||box[1]>H){ e.label.show=false; continue; }
        if(e.__allowOverlap){ e.label.show=true; continue; }   /* opts out of the collision pass, as in MapLibre */
        if(shown>=maxLabels){ e.label.show=false; continue; }
        let hit=false;
        for(const t of taken){ if(box[0]<t[2]&&box[2]>t[0]&&box[1]<t[3]&&box[3]>t[1]){ hit=true; break; } }
        if(hit){ e.label.show=false; continue; }
        taken.push(box); e.label.show=true; shown++;
      }
      return shown;
    }

    return { build, update, placeLabels, ctxFor };
  }

  return { makeDemCache, makeTerrainProvider, makeTileImageryProvider, makeCanvasImageryProvider,
           makeHillshadeDraw, makeReliefDraw, makeHeatmapDraw, makeVectorRenderer, tileBox, newCanvas,
           RELIEF_CTX_PATCH };
})();
