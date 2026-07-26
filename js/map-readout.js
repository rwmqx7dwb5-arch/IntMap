/* ============================================================================
 *  IntMap · Map readouts (coords / elevation / layer value / compass) and the graticule  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.mapReadout=function(map,HOST){
  /* ===== Grid (zoom-adaptive, red equator) ===== */
  function gridStepForZoom(z){
    if(z<1.5) return {major:30,minor:10};
    if(z<3)   return {major:15,minor:5};
    if(z<5)   return {major:10,minor:2};
    if(z<7)   return {major:5, minor:1};
    if(z<9)   return {major:2, minor:0.5};
    if(z<11)  return {major:1, minor:0.25};
    if(z<13)  return {major:0.5,minor:0.1};
    return    {major:0.1,minor:0.025};
  }
  function buildGridFeatures(){
    if(!HOST.hasTurf()) return [];
    const z=map?map.getZoom():2;
    const {major,minor}=gridStepForZoom(z);
    const b=map?map.getBounds():null;
    let minLng=-180,maxLng=180,minLat=-80,maxLat=80;
    if(b){
      const pad=Math.max(major*2,2);
      minLng=Math.max(-180,Math.floor(b.getWest()/major)*major-pad);
      maxLng=Math.min(180, Math.ceil(b.getEast()/major)*major+pad);
      minLat=Math.max(-85, Math.floor(b.getSouth()/major)*major-pad);
      maxLat=Math.min(85,  Math.ceil(b.getNorth()/major)*major+pad);
    }
    const f=[];
    /* Cap vertices PER LINE (scales with the visible span instead of a fixed dense step) — far
       fewer points to build + upload, so the grid appears much faster (#15). On globe a line still
       gets enough points to look curved; on flat it's nearly straight anyway. */
    const latSpan=maxLat-minLat, lngSpan=maxLng-minLng;
    const latStep=Math.max(minor, latSpan/30), lngStep=Math.max(minor, lngSpan/36);
    const majLatStep=Math.max(major/2, latSpan/40), majLngStep=Math.max(major/2, lngSpan/48);
    /* Minor lines */
    for(let lng=Math.ceil(minLng/minor)*minor; lng<=maxLng; lng+=minor){
      if(Math.abs(lng%major)<1e-6) continue;
      const pts=[]; for(let la=minLat; la<=maxLat; la+=latStep) pts.push([lng,la]); pts.push([lng,maxLat]);
      if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'minor'}});
    }
    for(let lat=Math.ceil(minLat/minor)*minor; lat<=maxLat; lat+=minor){
      if(Math.abs(lat%major)<1e-6 || Math.abs(lat)<1e-6) continue;
      const pts=[]; for(let lo=minLng; lo<=maxLng; lo+=lngStep) pts.push([lo,lat]); pts.push([maxLng,lat]);
      if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'minor'}});
    }
    /* Major lines */
    for(let lng=Math.ceil(minLng/major)*major; lng<=maxLng; lng+=major){
      const pts=[]; for(let la=minLat; la<=maxLat; la+=majLatStep) pts.push([lng,la]); pts.push([lng,maxLat]);
      if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'major'}});
    }
    for(let lat=Math.ceil(minLat/major)*major; lat<=maxLat; lat+=major){
      if(Math.abs(lat)<1e-6) continue; /* equator drawn separately in red */
      const pts=[]; for(let lo=minLng; lo<=maxLng; lo+=majLngStep) pts.push([lo,lat]); pts.push([maxLng,lat]);
      if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'major'}});
    }
    /* Red equator */
    if(minLat<=0 && maxLat>=0){
      const pts=[]; const step=Math.max(major/4,1);
      for(let lo=minLng; lo<=maxLng; lo+=step) pts.push([lo,0]);
      if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'equator'}});
    }
    /* Prime meridian */
    if(minLng<=0 && maxLng>=0){
      const pts=[]; const step=Math.max(major/4,1);
      for(let la=minLat; la<=maxLat; la+=step) pts.push([0,la]);
      if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'prime'}});
    }
    /* Edge labels (along axes) */
    const labelStep=major;
    const c=map?map.getCenter():{lng:0,lat:0};
    const baseLng=Math.max(minLng+major*0.5,Math.min(maxLng-major*0.5,c.lng));
    const baseLat=Math.max(minLat+major*0.5,Math.min(maxLat-major*0.5,c.lat));
    for(let lat=Math.ceil(minLat/labelStep)*labelStep; lat<=maxLat; lat+=labelStep){
      if(Math.abs(lat)>85) continue;
      f.push({type:'Feature',geometry:{type:'Point',coordinates:[baseLng,lat]},properties:{label:degLabel(+lat.toFixed(3),'lat')}});
    }
    for(let lng=Math.ceil(minLng/labelStep)*labelStep; lng<=maxLng; lng+=labelStep){
      f.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,baseLat]},properties:{label:degLabel(+lng.toFixed(3),'lng')}});
    }
    /* Intersection labels at major grid crossings — sparse so they don't clutter */
    const crossStep=major*2;
    for(let lat=Math.ceil(minLat/crossStep)*crossStep; lat<=maxLat; lat+=crossStep){
      if(Math.abs(lat)>80) continue;
      for(let lng=Math.ceil(minLng/crossStep)*crossStep; lng<=maxLng; lng+=crossStep){
        if(Math.abs(lat)<1e-6 && Math.abs(lng)<1e-6) continue;
        f.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{kind:'cross',label:`${degLabel(+lat.toFixed(3),'lat')} ${degLabel(+lng.toFixed(3),'lng')}`}});
      }
    }
    return f;
  }
  let gridRebuildTimer=null, _gridKey='';
  function refreshGrid(){
    if(!HOST.isGridOn||!map||!map.getSource('grid-source')) return;
    clearTimeout(gridRebuildTimer);
    gridRebuildTimer=setTimeout(()=>{
      try{
        /* Skip the rebuild if the zoom-step + rounded viewport haven't really changed (#15) — avoids
           re-tessellating the whole grid on every tiny pan/rotate of the globe. */
        const z=map.getZoom(), {major,minor}=gridStepForZoom(z), b=map.getBounds();
        const key=major+'/'+minor+'/'+(b?[b.getWest(),b.getEast(),b.getSouth(),b.getNorth()].map(v=>Math.round(v/Math.max(major,1))).join(','):'');
        if(key===_gridKey) return; _gridKey=key;
        map.getSource('grid-source').setData({type:'FeatureCollection',features:buildGridFeatures()});
      }catch(e){}
    },90);
  }
  /* (#R38) ROOT FIX for "Grid & labels が何度消しても自動的にチェックされる": toggleGrid() used to blindly FLIP
     isGridOn on every checkbox change. The R36 async-race guard re-dispatches a `change` on a box that went OFF
     (idempotent for normal layers, which READ e.target.checked) — but the flip made that re-dispatch turn Grid
     back ON ~500ms later. Split into an IDEMPOTENT setGrid(on) (drives state FROM the box) + a toggleGrid() for
     the toolbar button. The checkbox change now calls setGrid(checked), so a stray/duplicate change can never
     re-enable Grid. */
  function setGrid(on){
    on=!!on; HOST.isGridOn=on;
    const gb=document.getElementById('btn-tool-grid'); if(gb) gb.classList.toggle('tool-on',HOST.isGridOn);
    const gcb=document.getElementById('cb-grid'); if(gcb && gcb.checked!==HOST.isGridOn) gcb.checked=HOST.isGridOn;   /* (#R10) Grid now lives in the Layers menu */
    document.querySelectorAll('[data-proxy="cb-grid"]').forEach(x=>x.classList.toggle('active',HOST.isGridOn));
    _gridKey='';
    if(!map||!map.getSource('grid-source'))return;
    if(HOST.isGridOn) map.getSource('grid-source').setData({type:'FeatureCollection',features:buildGridFeatures()});
    else map.getSource('grid-source').setData({type:'FeatureCollection',features:[]});
  }
  function degLabel(v,k){ if(v===0)return'0°'; const d=k==='lat'?(v>0?'N':'S'):(v>0?'E':'W'); return Math.abs(v)+'°'+d; }
  function showMeasureTip(pt,txt){ const el=document.getElementById('measure-tooltip'); if(!el) return; el.innerText=txt; el.style.display='block';
    /* (#R14/#7) keep the measure tooltip inside the map — it's drawn translate(12px,-50%), so flip it to
       the LEFT of the point near the right edge and clamp Y, instead of overflowing off-screen. */
    try{ const mc=document.getElementById('map-container').getBoundingClientRect(); const w=el.offsetWidth||120, h=el.offsetHeight||24;
      el.style.transform=(pt.x+12+w > mc.width-6)?('translate(-'+(w+12)+'px,-50%)'):'translate(12px,-50%)';
      el.style.left=Math.max(6,Math.min(mc.width-6,pt.x))+'px';
      el.style.top=Math.max(h/2+6,Math.min(mc.height-h/2-6,pt.y))+'px';
    }catch(_){ el.style.left=pt.x+'px'; el.style.top=pt.y+'px'; }
  }
  function handleMapClick(lng,lat,point,viaBtn){
    if(window.__scpPick) return;   /* (#R86) Compare "pick a country on the map" mode owns the click */
    /* (#R7-draw) The freehand Draw tool owns the map gesture while it is active. */
    if(window.DrawTool && window.DrawTool.active()) return;
    /* Köppen click-to-highlight (#25): when the climate layer is on, clicking the map highlights
       (toggles) the climate zone at that point. Works whether or not a measurement tool is active. */
    try{
      const climCb=document.getElementById('dl-climate');
      if(climCb && climCb.checked && window.sampleKoppenAt){
        /* (#R122) do NOT also toggle/highlight the climate zone when the tap is opening a place-label popup —
           the click landed on a place name, not on empty climate raster ("地名ラベルをクリックする際、その
           クリック地点の気候区分までクリックされ…ないように"). */
        let onLabel=false;
        try{ const pt=point||(map&&map.project([lng,lat]));
          if(pt&&map){ const ls=['ofm-country','ofm-city','ofm-other','geo-sea','ofm-water','ofm-water2','ofm-river','ofm-peak'].filter(id=>map.getLayer(id));
            if(ls.length){ const pad=(typeof HOST.isMobile==='function'&&HOST.isMobile())?15:6; const near=map.queryRenderedFeatures([[pt.x-pad,pt.y-pad],[pt.x+pad,pt.y+pad]],{layers:ls}); if(near&&near.length) onLabel=true; } } }catch(_){}
        if(!onLabel){ const code=window.sampleKoppenAt(lng,lat);
          if(code && window.kSelected){
            window.kSelected.has(code)?window.kSelected.delete(code):window.kSelected.add(code);
            if(window._buildKoppenLegend) window._buildKoppenLegend();
            if(window._refreshKoppenImage) window._refreshKoppenImage();
          }
        }
      }
    }catch(_){}
    /* On phones, tapping the map outside a legend collapses any expanded legend so it stops
       covering the map (#29). */
    try{ if(HOST.isMobile() && window._minimizeOpenLegends) window._minimizeOpenLegends(); }catch(_){}
    if(!HOST.toolMode||!HOST.hasTurf())return;
    /* (#R171) The 3-D volume tool's freehand / circle / rectangle shapes own the drag, and MapLibre
       synthesises a `click` at the end of every one of them. Without this the stroke's release would
       also drop a stray polygon vertex into measurePoints. */
    try{ if(HOST.toolMode==='volume'&&window.IntMapVolume3D&&window.IntMapVolume3D.ownsGesture()) return; }catch(_){}
    /* (#R11) On mobile, measuring is center-fixed: a tap does NOT add a point — only the "Add point"
       button (which calls this with viaBtn=true) adds the map-center coordinate. */
    if(HOST.isMobile() && !viaBtn) return;
    /* Polar safety (#10): the poles AND their surroundings are singular for great-circle / area
       math and make turf emit NaN or globe-wrapping geometry. Clamp out of the polar caps. */
    lat=Math.max(-88,Math.min(88,lat));
    /* Don't add a measure point if the click landed on an existing pin or intel marker */
    if(point && map){
      try{
        const hit=map.queryRenderedFeatures(point,{layers:['user-pin-dot','news-dots','dash-dots'].filter(l=>map.getLayer(l))});
        if(hit&&hit.length) return;
      }catch(e){}
    }
    if(HOST.toolMode==='radius'){
      const rid='r_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
      HOST.radiusItems.push({id:rid,center:[lng,lat],radiusKm: HOST.radiusKm,color:HOST.radiusColor,opacity:HOST.radiusOpacity}); window._activeRadiusId=rid;
      HOST.refreshTool(); HOST.updateToolPanel(); return;
    }
    /* === Auto-close for the Measure tool: if 3+ points and the new click lands within
       SNAP_PX of the start point (the highlighted vertex), close into AREA mode. The same
       threshold drives the on-map highlight so "add vs. close" is unambiguous (#47). */
    if(HOST.toolMode==='measure' && HOST.measurePoints.length>=3 && point){
      try{
        const pStart=map.project(HOST.measurePoints[0]);
        const dx=pStart.x-point.x, dy=pStart.y-point.y;
        if(Math.hypot(dx,dy)<HOST.SNAP_PX){
          HOST.toolMode='area'; HOST.measureSnapClose=false;
          document.getElementById('measure-tooltip').classList.remove('closing');
          HOST._syncToolBtns();
          HOST.refreshTool(); HOST.updateToolPanel();
          return;
        }
      }catch(_){}
    }
    HOST.measurePoints.push([lng,lat]); HOST.refreshTool(); HOST.updateToolPanel();
  }
  const _elevCache=new Map();
  function fmtLL(lng,lat){ return `${Math.abs(lat).toFixed(3)}°${lat>=0?'N':'S'}  ${Math.abs(lng).toFixed(3)}°${lng>=0?'E':'W'}`; }
  function renderCoordReadout(lng,lat){
    const el=document.getElementById('coord-readout'); if(!el) return;
    if(lng!=null){ HOST._crLng=lng; HOST._crLat=lat; }
    /* (#R171) The EYE altitude is a property of the camera, not of the cursor, so it is the one chip
       that still has something true to say when the pointer is off the map. When the option is on the
       readout therefore stays up — it is the "always-on" readout, and the request was for the viewpoint
       altitude to be in it ("常時表示欄に、視点位置の高度も出るように"). */
    const eye=(()=>{ try{ return window.IntMapEyeAlt?window.IntMapEyeAlt.text():''; }catch(_){ return ''; } })();
    if(HOST._crLng==null){
      if(!eye){ el.style.display='none'; return; }
      el.style.display='flex'; el.innerHTML=`<span class="cr-eye">${eye}</span>`; return; }
    const parts=[];
    parts.push(`<span>${fmtLL(HOST._crLng,HOST._crLat)}</span>`); parts.push(`<span class="cr-elev">${HOST.lastElev||'·····'}</span>`);
    if(eye) parts.push(`<span class="cr-eye">${eye}</span>`);
    if(HOST.lastLayerVal) parts.push(`<span class="cr-sat">${HOST.lastLayerVal}</span>`);
    /* (#R8c) Live wind speed/direction under the cursor while the Wind layer is on. */
    /* (#R19) No emoji in the always-on readout ("🌬みたいな絵文字は…いらない") — value + direction only. */
    try{ if(window.Wind&&window.Wind.on&&window.Wind.on()){ const w=window.Wind.sampleAt(HOST._crLng,HOST._crLat); if(w){ const card=['N','NE','E','SE','S','SW','W','NW'][Math.round(w.dir/45)%8]; const sp=window.fmtWindSpeed?window.fmtWindSpeed(w.speed):(w.speed.toFixed(1)+' m/s'); parts.push(`<span class="cr-wind">${sp} ${card}</span>`); } } }catch(_){}
    /* Satellite-imagery chip removed from the readout per request — coords + elevation only. */
    if(!parts.length){ el.style.display='none'; return; }
    el.style.display='flex';
    el.innerHTML=parts.join('');
  }
  /* === Instant elevation/depth from cached terrarium DEM tiles (includes ocean bathymetry) === */
  const _demCache=new Map();
  function _demCacheTrim(){ if(_demCache.size<=HOST._DEM_CACHE_MAX) return;
    for(const k of _demCache.keys()){ if(_demCache.size<=HOST._DEM_CACHE_MAX) break; const v=_demCache.get(k); if(v==='loading') continue; _demCache.delete(k); } }
  /* (#R19) Per-tile decoded pixel buffer, extracted ONCE. demElevBilinear used to call a full 256×256
     getImageData (a ~256 KB copy) for EVERY sample — ~72,000 samples per LOS run ≈ 18 GB of memory
     traffic, which is exactly the "Line of sightを使うとパソコンでもブラウザがフリーズ" freeze. */
  function _demPix(cv){ if(!cv||cv==='loading') return null;
    if(!cv.__pix){ try{ cv.__pix=cv.getContext('2d',{willReadFrequently:true}).getImageData(0,0,256,256).data; }catch(e){ return null; } }
    return cv.__pix; }
  function _ll2tile(lng,lat,z){ const n=Math.pow(2,z); const x=(lng+180)/360*n; const lr=lat*Math.PI/180; const y=(1-Math.log(Math.tan(lr)+1/Math.cos(lr))/Math.PI)/2*n; return {x,y,n}; }
  /* Pick a DEM tile-zoom matched to the map zoom. Zoomed out → low z (a handful of tiles cover the
     whole view, so the readout is instant everywhere). Zoomed in → high z (sharper elevation). */
  function demZoomForMap(){ let mz=4; try{ if(map) mz=map.getZoom(); }catch(_){} return Math.max(3,Math.min(12,Math.round(mz)+1)); }
  function demElevAt(lng,lat,onReady,zArg){
    const z=(zArg!=null?zArg:demZoomForMap()); const tl=_ll2tile(lng,lat,z); const xi=Math.floor(tl.x), yi=Math.floor(tl.y);
    if(xi<0||yi<0||xi>=tl.n||yi>=tl.n||lat>85||lat<-85) return null;
    const key=z+'/'+xi+'/'+yi; let c=_demCache.get(key);
    if(c===undefined){
      _demCacheTrim();
      _demCache.set(key,'loading');
      const img=new Image(); img.crossOrigin='anonymous';
      img.onload=()=>{ try{ const cv=document.createElement('canvas'); cv.width=256; cv.height=256; cv.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0); _demCache.set(key,cv); if(onReady) onReady(); }catch(e){ _demCache.set(key,null); } };
      img.onerror=()=>_demCache.set(key,null);
      img.src=`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${xi}/${yi}.png`;
      return null;
    }
    if(c==='loading'||c===null) return null;
    /* (#R19) read from the per-tile decoded buffer — no per-sample getImageData */
    const d=_demPix(c); if(!d) return null;
    const px=Math.min(255,Math.max(0,Math.floor((tl.x-xi)*256))), py=Math.min(255,Math.max(0,Math.floor((tl.y-yi)*256)));
    const i=(py*256+px)*4; return (d[i]*256+d[i+1]+d[i+2]/256)-32768;
  }
  /* === Shared async DEM sampler (#R12) — used by the elevation profile and line-of-sight viewshed.
     Warms every terrarium tile covering a set of points, then samples them LOCALLY. The terrarium
     DEM carries ocean bathymetry (negative = below sea level), so profiles dip under water and the
     viewshed reads real terrain — replacing the old per-point Open-Meteo fetch that fired hundreds
     of requests at once and silently failed (the root cause of "Line of Sight doesn't work"). */
  function _demZoomForSpan(km){ return Math.max(5, Math.min(13, Math.round(Math.log2(481000/Math.max(1,km))))); }
  /* (#R18) onProgress(frac 0..1) lets callers (Line of Sight / elevation profile) show a real % + bar
     while the covering DEM tiles load — the slow part of a viewshed ("計算の進捗をパーセントで表示"). */
  function warmDEMTiles(points, z, timeoutMs, onProgress){
    const keys=new Set();
    points.forEach(p=>{ if(!p) return; const tl=_ll2tile(p[0],p[1],z); const xi=Math.floor(tl.x), yi=Math.floor(tl.y); if(xi>=0&&yi>=0&&xi<tl.n&&yi<tl.n){ keys.add(z+'/'+xi+'/'+yi); demElevAt(p[0],p[1],null,z); } });
    const total=keys.size||1;
    return new Promise(res=>{ const t0=Date.now(); (function poll(){ let pending=0; keys.forEach(k=>{ const c=_demCache.get(k); if(c===undefined||c==='loading') pending++; }); if(onProgress){ try{ onProgress((total-pending)/total); }catch(_){} } if(pending===0||Date.now()-t0>(timeoutMs||9000)) res(); else setTimeout(poll,90); })(); });
  }
  /* (#R18) Bilinear DEM sample for the viewshed — smooths the stair-stepping of nearest-pixel sampling so
     ridge lines (which decide what's blocked) are physically truer. Reads the 4 surrounding texels and
     interpolates; falls back to nearest at tile edges. Tiles must already be warm (LOS warms them first). */
  function demElevBilinear(lng,lat,z){
    const tl=_ll2tile(lng,lat,z); const xi=Math.floor(tl.x), yi=Math.floor(tl.y);
    if(xi<0||yi<0||xi>=tl.n||yi>=tl.n||lat>85||lat<-85) return null;
    const cv=_demCache.get(z+'/'+xi+'/'+yi); if(!cv||cv==='loading') return null;
    const d=_demPix(cv); if(!d) return null;   /* (#R19) decoded once per tile, not per sample */
    const fx=(tl.x-xi)*256-0.5, fy=(tl.y-yi)*256-0.5;
    const x0=Math.max(0,Math.min(255,Math.floor(fx))), y0=Math.max(0,Math.min(255,Math.floor(fy)));
    const x1=Math.min(255,x0+1), y1=Math.min(255,y0+1); const tx=Math.max(0,Math.min(1,fx-x0)), ty=Math.max(0,Math.min(1,fy-y0));
    const el=(px,py)=>{ const i=(py*256+px)*4; return (d[i]*256+d[i+1]+d[i+2]/256)-32768; };
    const a=el(x0,y0), b=el(x1,y0), c=el(x0,y1), e=el(x1,y1);
    return (a*(1-tx)+b*tx)*(1-ty)+(c*(1-tx)+e*tx)*ty;
  }
  /* Elevation/depth respects the measurement-units setting (#R13c): imperial → feet, both → "m (ft)". */
  function fmtElevVal(e){ const m=Math.round(e), ft=Math.round(e*3.28084); const um=(typeof HOST.unitMode!=='undefined')?HOST.unitMode:'both'; return um==='imperial'?(ft.toLocaleString()+' ft'):um==='metric'?(m.toLocaleString()+' m'):(m.toLocaleString()+' m ('+ft.toLocaleString()+' ft)'); }
  /* Live weather-layer value at the cursor (#12): Köppen is instant (pixel sample); SST / air-temp
     are fetched seamlessly from Open-Meteo (debounced + cached per ~0.1°). */
  let _wxTimer=null;
const _wxCache=new Map();
  function activeWxLayer(){ const on=id=>{ const cb=document.getElementById('dl-'+id); return cb&&cb.checked; }; return on('sst')?'sst':on('temp')?'temp':on('climate')?'climate':null; }
  function updateLayerReadout(lng,lat){
    const lyr=activeWxLayer();
    if(!lyr){ /* no weather layer → show the active numeric choropleth's value at the cursor (#R13c) */
      let cv=null; try{ cv=window.choroValueAt&&window.choroValueAt(lng,lat); }catch(_){}
      HOST.lastLayerVal = cv||''; return; }
    if(lyr==='climate'){ let code=null; try{ code=window.sampleKoppenAt&&window.sampleKoppenAt(lng,lat); }catch(_){}
      /* no leading emoji on the layer value (#34) */
      HOST.lastLayerVal = code ? (code+(window.KNAME&&window.KNAME[code]?' · '+(window.KNAME[code][HOST.lang]||window.KNAME[code].en):'')) : ''; return; }
    /* (#R27) Cache on a COARSER 0.25° grid (was 0.1°). SST / air-temp barely change over ~28 km, so a
       coarser grid means the cursor lands on an ALREADY-cached cell far more often → the value is shown
       instantly (no fetch) across a whole local area, and far fewer network calls fire. This is the main
       "数値が変わるのが遅い" lever — the per-cell fetch was the only real latency. */
    const q=(v)=>(Math.round(v*4)/4);                        /* snap to 0.25° */
    const qla=q(lat), qlo=q(lng), key=lyr+':'+qla.toFixed(2)+','+qlo.toFixed(2);
    if(_wxCache.has(key)){ HOST.lastLayerVal=_wxCache.get(key); return; }
    /* (#R25/#R27) Show the nearest already-cached neighbor INSTANTLY so the readout tracks the cursor with
       no blank/stale gap; the exact fetch refines it below. Tolerance widened (0.6°→1.5°) so the readout
       stays populated while panning into a new region. */
    try{ let best=null,bd=1e9;
      for(const k of _wxCache.keys()){ if(k.slice(0,key.indexOf(':'))!==lyr) continue; const m=k.split(':')[1].split(','); const d=Math.abs(+m[0]-qla)+Math.abs(+m[1]-qlo); if(d<bd){ bd=d; best=k; } }
      if(best&&bd<=1.5){ HOST.lastLayerVal=_wxCache.get(best); } }catch(_){}
    clearTimeout(_wxTimer);
    _wxTimer=setTimeout(async()=>{
      try{
        let url,pick;   /* fetch the CELL CENTER so the cached value matches the key */
        if(lyr==='sst'){ url=`https://marine-api.open-meteo.com/v1/marine?latitude=${qla.toFixed(3)}&longitude=${qlo.toFixed(3)}&current=sea_surface_temperature`; pick=j=>j&&j.current&&j.current.sea_surface_temperature; }
        else { url=`https://api.open-meteo.com/v1/forecast?latitude=${qla.toFixed(3)}&longitude=${qlo.toFixed(3)}&current=temperature_2m`; pick=j=>j&&j.current&&j.current.temperature_2m; }
        const r=await fetch(url); if(!r.ok) return; const j=await r.json(); const v=pick(j);
        if(typeof v==='number'){ const um=window.imUnitTemp||'both'; const txt = um==='f' ? (v*9/5+32).toFixed(1)+'°F' : um==='c' ? v.toFixed(1)+'°C' : v.toFixed(1)+'°C ('+(v*9/5+32).toFixed(1)+'°F)'; _wxCache.set(key,txt); HOST.lastLayerVal=txt; renderCoordReadout(lng,lat); }   /* unit-aware (#R13c); no leading emoji (#34) */
      }catch(_){}
    },30);
  }
  /* (#R25) Coalesce the per-move readout to ONE animation frame with the LATEST cursor position, so fast
     mouse movement can't build a backlog of heavy updateCoord calls (queryRenderedFeatures + DEM + DOM)
     that made the value/classification visibly lag behind the cursor ("カーソルを動かしているのに遅い"). */
  let _ucRAF=0,_ucLng=null,_ucLat=null;
  function updateCoord(lng,lat){ if(HOST.isMobile()) return; _ucLng=lng; _ucLat=lat; if(_ucRAF) return;
    _ucRAF=requestAnimationFrame(()=>{ _ucRAF=0; try{ _updateCoordNow(_ucLng,_ucLat); }catch(_){} }); }
  function _updateCoordNow(lng,lat){
    if(HOST.isMobile()) return;
    try{ updateLayerReadout(lng,lat); }catch(_){}
    /* Instant: read elevation/depth straight from a cached DEM tile (no network). */
    const dem=demElevAt(lng,lat,()=>{ const d2=demElevAt(lng,lat); if(d2!=null){ HOST.lastElev=HOST.elevText(d2); renderCoordReadout(lng,lat); } });
    if(dem!=null){ HOST.lastElev=HOST.elevText(dem); renderCoordReadout(lng,lat); return; }
    /* Tile still loading → show coords now, fall back to network elevation briefly. */
    const ckey=lat.toFixed(2)+','+lng.toFixed(2);
    HOST.lastElev=_elevCache.has(ckey)?_elevCache.get(ckey):'';
    renderCoordReadout(lng,lat);
    clearTimeout(HOST.elevTimer);
    if(!_elevCache.has(ckey)) HOST.elevTimer=setTimeout(()=>{ fetchElev(lng,lat); },80);
  }
  /* GEBCO 2020 bathymetry (real ocean depth) via CORS proxy — Open-Meteo returns 0 over water. */
  const _bathyCache=new Map();
  async function fetchBathymetry(lat,lng){
    const key=lat.toFixed(2)+','+lng.toFixed(2);
    if(_bathyCache.has(key)) return _bathyCache.get(key);
    const u=`https://api.opentopodata.org/v1/gebco2020?locations=${lat.toFixed(4)},${lng.toFixed(4)}`;
    const proxies=[ x=>`https://api.allorigins.win/raw?url=${encodeURIComponent(x)}`, x=>`https://corsproxy.io/?url=${encodeURIComponent(x)}`, x=>`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(x)}` ];
    for(const mk of proxies){
      try{ const r=await fetch(mk(u)); if(!r.ok) continue; const j=await r.json(); const v=j&&j.results&&j.results[0]&&j.results[0].elevation; if(typeof v==='number'){ _bathyCache.set(key,v); return v; } }catch(_){}
    }
    return null;
  }
  async function fetchElev(lng,lat){
    const rLat=lat, rLng=lng, seq=++HOST._elevSeq;
    const ckey=rLat.toFixed(2)+','+rLng.toFixed(2);
    const set=(txt)=>{ _elevCache.set(ckey,txt); if(seq===HOST._elevSeq){ HOST.lastElev=txt; renderCoordReadout(rLng,rLat); } };
    try{
      const r=await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${rLat.toFixed(4)}&longitude=${rLng.toFixed(4)}`);
      let e=null; if(r.ok){ const j=await r.json(); e=j&&j.elevation&&j.elevation[0]; }
      if(typeof e==='number' && e>0.5){ set(HOST.elevText(e)); return; }
      /* At/below sea level → fetch true depth from GEBCO bathymetry. */
      const d=await fetchBathymetry(rLat,rLng);
      if(typeof d==='number'){ set(HOST.elevText(d)); }
      else if(typeof e==='number'){ set(HOST.elevText(e)); }
    }catch(_){}
  }
  function updateCompass(){ const s=document.querySelector('.compass-svg'); if(s&&map)s.style.transform=`rotate(${-map.getBearing()}deg)`; }
  return { _demZoomForSpan, demElevAt, demElevBilinear, demZoomForMap, fetchBathymetry, fmtElevVal, fmtLL, handleMapClick, refreshGrid, renderCoordReadout, setGrid, showMeasureTip, updateCompass, updateCoord, updateLayerReadout, warmDEMTiles };
};
