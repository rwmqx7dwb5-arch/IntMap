/* ============================================================================
 *  IntMap · WARMING THE TILES THE CAMERA IS ABOUT TO NEED — IntMapModules.tileWarm  (#R196)
 * ----------------------------------------------------------------------------
 *  「最大の問題は、中心部がまだ巨大なことです」 — index.html's ELEVENTH split, and the one this round
 *  earned: the mobile-weight measurement that opens this file is the whole reason it moved.
 *
 *  WHAT IT IS. Two things that both mean "the bytes should already be here": the persistent tile
 *  cache in sw.js, and a directional prefetch that warms the ring the viewport is travelling into,
 *  the two levels a pinch would land on, and — while a flight is under way — a deeper ring ahead of
 *  the aircraft. It changes no URL and no quality setting; every tile it asks for is one the render
 *  path was going to ask for anyway.
 *
 *  MEASURED SURFACE: public names 1 (window._imPredictivePrefetch, kept because js/flight-sim.js
 *  calls it by that name) · registrations 2 (moveend, move) · flags 0 · values from the shell 5
 *  (currentMapType, satProviderById, satBuildTiles, isMobile, and the engine) — all handed over
 *  through IM_HOST rather than closed over, which is what makes the move checkable.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.tileWarm=function(HOST){
  const GE=()=>window.IntMapGeoEngine;
  const isMobile=HOST.isMobile;
  const satProviderById=(id)=>HOST.satProviderById(id);
  const satBuildTiles=(p)=>HOST.satBuildTiles(p);
  /* =============================================================================
   *  TILE ACCELERATION — persistent disk cache (Service Worker) + predictive
   *  pan/zoom prefetch. Quality is never reduced: identical tile URLs, just
   *  served from cache on revisit and fetched a beat early in the travel
   *  direction so they're already there when the viewport arrives.
   *  ============================================================================= */
  let _tileSW=null;
  function registerTileSW(){
    try{
      if(!('serviceWorker' in navigator)) return;                       /* unsupported */
      if(location.protocol!=='https:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return; /* SW needs a secure context (file:// can't) */
      navigator.serviceWorker.register('sw.js').then(reg=>{
        _tileSW=navigator.serviceWorker.controller||reg.active||reg.waiting||reg.installing||null;
      }).catch(()=>{});
      navigator.serviceWorker.addEventListener('controllerchange',()=>{ _tileSW=navigator.serviceWorker.controller; });
    }catch(_){}
  }
  const _lng2x=(lng,z)=>Math.floor((lng+180)/360*Math.pow(2,z));
  const _lat2y=(lat,z)=>{ const r=lat*Math.PI/180; return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z)); };
  const _tileUrl=(tpl,z,x,y)=>tpl.replace('{z}',z).replace('{x}',x).replace('{y}',y);
  let _prevCenter=null, _prefetchT=null;
  /* ⚠ (#R196) DECLARED ABOVE ITS ONLY USER, DELIBERATELY. #R189's lesson is that a `const` sitting
     below the function that reads it is a temporal dead zone waiting for the one call that arrives
     early, and every call site here is inside a `try`/`catch` that would swallow it silently. */
  const _pfSeen=new Set();   /* every tile URL this prefetch has already asked for */
  /* ⚠ (#R230) …AND SO IS THE PREFETCH QUEUE, FOR THE SAME REASON THE COMMENT ABOVE GIVES. These three
     are read by predictivePrefetch, which every call site reaches from inside a `try`/`catch`, so a
     TDZ here would not throw — it would silently stop warming tiles, which is the shape of defect
     #R196 wrote that warning about. `_warmPump` is a DECLARATION (hoisted); the state it walks is not.
     ONE cursor for every batch, for the reason sw.js states beside its own lanes: a pan is a run of
     `moveend`s, so a per-batch limit still lets three overlapping batches put 3×N in the air. */
  const WARM_LANES=4; let _warmQueued=[], _warmLanes=0;
  function _warmPump(){
    while(_warmLanes<WARM_LANES && _warmQueued.length){
      const u=_warmQueued.shift(); _warmLanes++;
      let p=null; try{ p=fetch(u,{mode:'cors',cache:'force-cache'}); }catch(_){}
      Promise.resolve(p).catch(()=>{}).then(()=>{ _warmLanes--; _warmPump(); });
    }
  }
  function predictivePrefetch(aggressive){
    if(!GE().hasRenderer() || HOST.mapType!=='sat') return;                          /* satellite = the heavy high-res case the user asked about */
    const p=satProviderById(HOST.satState.providerId); if(!p) return;
    let tiles; try{ tiles=satBuildTiles(p); }catch(_){ return; }
    if(!tiles||!tiles[0]||tiles[0].indexOf('{z}')<0) return;             /* skip non-XYZ custom sources */
    /* (#R178) WARM THE LEVEL THAT WILL ACTUALLY BE FETCHED. On a HiDPI display the satellite protocol
       serves each tile by stitching the four children one level deeper (see the imapsat block — the
       imagery was otherwise running at half the screen's resolution), so the widest ring here was
       warming a level that is now only the fallback. `_satZBias` shifts the whole prefetch — the
       viewport ring, the travel lead and the zoom-in anticipation — onto the level the protocol
       consumes. 0 on a 1x screen, so nothing changes there. */
    /* …and ONLY for the provider that actually stitches. `imapsat` serves the Esri base layer; the
       other providers (Sentinel-2, GIBS, the BYOK ones) are plain XYZ sources whose displayed level
       is unchanged, so biasing their prefetch would warm a level nothing fetches — the exact defect
       this is fixing, pointed the other way. */
    /* ⚠ (#R206) THE BASE WAS ALREADY ONE LEVEL TOO SHALLOW, SO THE BIAS COULD NOT SAVE IT.
       Every satellite source in this app is declared `tileSize:256` (see satApply and the style), and
       MapLibre picks its tiles at `round(zoom + log2(512/256))` = zoom + 1 — MEASURED on the phone
       profile: map zoom 12.00, and the only two Esri requests in that window were BOTH z13, while
       this function reported `{z:12, bias:0}`. So on a phone (hiDPI off ⇒ bias 0) the viewport ring
       and the travel lead were warming a level the render path never asks for: a prefetch that could
       not hit, on exactly the device the instruction is about.
       The +1 is the source's, and it is not optional; the @2x stitch's extra level is the protocol's
       and it OWNS that number now (IntMapSatProto.netLevelBias) rather than this file re-deriving it.
       Non-Esri providers are plain XYZ at the same tileSize, so they take the +1 and nothing else. */
    const _satZBias=(function(){ try{ if(p.id==='esri'&&window.__imSatProto&&window.IntMapSatProto&&window.IntMapSatProto.netLevelBias)
        return window.IntMapSatProto.netLevelBias(); }catch(_){}
      return 1; })();
    /* the same URL the render path will ask for — host included (see IntMapSatProto.tileUrl) */
    const _esriDirect=(function(){ try{ return (p.id==='esri'&&window.__imSatProto&&window.IntMapSatProto&&window.IntMapSatProto.tileUrl)||null; }catch(_){ return null; } })();
    const tpl=tiles[0], z=Math.min(p.maxzoom||19,Math.max(0,Math.round(GE().camera.getZoom())+_satZBias)), n=Math.pow(2,z);
    const c=GE().camera.getCenter(), b=GE().camera.getBounds(), clamp=v=>Math.max(0,Math.min(n-1,v));
    let x0=clamp(_lng2x(b.getWest(),z)), x1=clamp(_lng2x(b.getEast(),z)), y0=clamp(_lat2y(b.getNorth(),z)), y1=clamp(_lat2y(b.getSouth(),z));
    if(x1<x0){[x0,x1]=[x1,x0];} if(y1<y0){[y0,y1]=[y1,y0];}
    let dx=0,dy=0; if(_prevCenter){ dx=Math.sign(c.lng-_prevCenter.lng); dy=Math.sign(_prevCenter.lat-c.lat); } /* moving north → smaller tile y */
    _prevCenter={lng:c.lng,lat:c.lat};
    /* (#R151) FLIGHT LEAD: in the sim the camera moves continuously and fast, so a 3-tile lead can't keep the imagery
       ahead of the aircraft ("3D衛星画像の生成が飛行に追い付いていない"). When called aggressively (flight loop), warm a
       DEEPER ring in the direction of travel AND, if the map is tilted (3D/oblique), one zoom level SHALLOWER too so the
       far horizon tiles the oblique view pulls in are resident before they scroll into frame. */
    /* one URL builder for every ring below — the protocol's when it has one, the template otherwise */
    const U=(zz,xx,yy)=>_esriDirect?_esriDirect(zz,yy,xx):_tileUrl(tpl,zz,xx,yy);
    const RING=aggressive?7:3, push=(x,y)=>{ if(x>=0&&y>=0&&x<n&&y<n) urls.push(U(z,x,y)); };
    const urls=[];
    const _side=(k)=>{ if(dx>0) for(let y=y0-1;y<=y1+1;y++) push(x1+k,y); else if(dx<0) for(let y=y0-1;y<=y1+1;y++) push(x0-k,y);
      if(dy>0) for(let x=x0-1;x<=x1+1;x++) push(x,y1+k); else if(dy<0) for(let x=x0-1;x<=x1+1;x++) push(x,y0-k); };
    for(let k=1;k<=RING;k++) _side(k);
    if(aggressive && dx&&dy){ for(let k=1;k<=RING;k++){ push((dx>0?x1:x0)+dx*k,(dy>0?y1:y0)+ (dy>0?1:-1)*k); } }   /* diagonal corner ahead for a banking turn */
    /* (#R8) Anticipate a zoom-IN: warm the center tiles one AND two levels deeper so the next pinch is
       already resident (the user asked for "Unthinkable Speed" satellite). */
    for(let dz=1;dz<=2;dz++){ const z2=z+dz; if(z2>(p.maxzoom||19)) break; const n2=Math.pow(2,z2),cx=_lng2x(c.lng,z2),cy=_lat2y(c.lat,z2),rr=dz===1?1:0; for(let ix=-rr;ix<=rr;ix++) for(let iy=-rr;iy<=rr;iy++){ const x=cx+ix,y=cy+iy; if(x>=0&&y>=0&&x<n2&&y<n2) urls.push(U(z2,x,y)); } }
    /* (#R151) tilted view → the horizon draws from a shallower zoom; warm a small block one level up in the travel dir. */
    if(aggressive){ try{ if((GE().camera.getPitch()||0)>25){ const zc=Math.max(0,z-1), nc=Math.pow(2,zc), cx=_lng2x(c.lng,zc)+ (dx||0)*2, cy=_lat2y(c.lat,zc)+ ( -(dy||0))*2; for(let ix=-2;ix<=2;ix++) for(let iy=-2;iy<=2;iy++){ const x=cx+ix,y=cy+iy; if(x>=0&&y>=0&&x<nc&&y<nc) urls.push(U(zc,x,y)); } } }catch(_){} }
    /* (#R178) what level this call chose, for observation. Inferring it from network traffic does not
       work once the protocol is stitching @2x tiles: the RENDER path then fetches the children one
       level below the displayed zoom, and those outnumber the prefetch ring (measured at map z11 on a
       2x screen: 18 requests at z12 from the ring, 41 at z13 from the children). */
    try{ predictivePrefetch.lastLevel={ z, bias:_satZBias, mapZoom:Math.round(GE().camera.getZoom()), n:urls.length }; }catch(_){}
    if(!urls.length) return;
    const _mob=(typeof isMobile==='function'&&isMobile());
    /* ══ (#R196) THE PREFETCH HAD NO MEMORY ══════════════════════════════════════════════════════════
       「モバイル版で、衛星画像が圧倒的に重い。」 MEASURED on an emulated iPhone (390×844, DPR 3),
       satellite over Tokyo at z12, a six-second pan of twenty-four steps:

           Esri World_Imagery requests   865
           DISTINCT tiles among them     112
           worst single tile              24× — once per pan step
           issued from THIS function     829 of the 865

       A pan moves the viewport by a fraction of its own width, so consecutive rings overlap almost
       entirely, and this recomputed the whole ring every time and re-issued all of it. `force-cache`
       means most of those are answered by the browser's cache rather than the radio — but each one is
       still a fetch, a cache lookup and a slot in the same connection pool the tiles the user is
       actually LOOKING AT are queueing in, sixty at a time, ninety milliseconds after every gesture.

       So it remembers. A URL that has been asked for once is never asked for again, and the ring
       shrinks to the tiles that are genuinely new — which is what "prefetch" meant in the first place.
       The set holds strings only (a bounded FIFO, phones smaller), and it is deliberately never
       invalidated by time: a tile's imagery does not change while a session is open, and the whole
       point is that the second visit is free. Changing PROVIDER changes the URL, so that needs no
       reset either. */
    const uniq=[...new Set(urls)].filter(u=>!_pfSeen.has(u)).slice(0, aggressive?(_mob?110:280):(_mob?60:150));   /* (#R21/#R151) flight spends more of the idle bandwidth to stay ahead */
    if(!uniq.length) return;
    const _pfMax=_mob?1500:6000;
    uniq.forEach(u=>{ _pfSeen.add(u); });
    while(_pfSeen.size>_pfMax){ const f=_pfSeen.values().next().value; _pfSeen.delete(f); }
    try{ predictivePrefetch.lastIssued={ n:uniq.length, seen:_pfSeen.size }; }catch(_){}
    if(_tileSW){ try{ _tileSW.postMessage({type:'prefetch',urls:uniq}); return; }catch(_){} }
    /* ⚠ (#R230) …AND THE NO-SERVICE-WORKER PATH GETS THE SAME LANES. sw.js's batch was changed from
       `Promise.all` to a four-lane queue this round («衛星先読みの一斉実行を小さなキューに変更»); this
       branch is what runs when there is no controller yet — the FIRST load, which is exactly the load
       the reader is complaining about — and it was firing all sixty (110 in flight) at once into the
       same connection pool as the tiles being drawn. Same URLs, same order, same count: only the
       number in the air at one time changes, so no tile is dropped and no pixel differs. */
    _warmQueued.push(...uniq); _warmPump();
  }
  registerTileSW();
  /* ⚠ (#R206) …AND NOT WHILE THE ZOOM IS STILL MOVING. A wheel sweep is a run of moveend events a few
     tens of milliseconds apart, so a 90 ms debounce fired a whole ring PER NOTCH — at every level the
     camera was passing through. That was harmless only for as long as the level was wrong (above):
     the moment this warms the level the render path uses, it would be issuing hundreds of fetches for
     levels nobody is going to look at, into the same connection pool as the visible tiles — i.e. it
     would undo #R205's zoom gate, which exists to stop exactly that. 260 ms is longer than the gap
     between two wheel notches, so a sweep collapses to ONE ring at the level the gesture ended on,
     and a pan (whose moveend already means "arrived") is warmed 170 ms later than before, which no
     prefetch can be hurt by. */
  if(GE().hasRenderer()) GE().events.on('moveend',()=>{ clearTimeout(_prefetchT); _prefetchT=setTimeout(predictivePrefetch,260); });
  /* (#R151) 3D is "dramatically heavier the moment you enable it" because a tilted/oblique view pulls in far more
     tiles AND `moveend` never fires during a continuous drag-rotate/pitch — so satellite imagery streamed in behind
     the gesture. Warm tiles ahead on every `move` while tilted (pitch>25°) in satellite mode, throttled to ~3×/s. */
  /* ⚠ (#R234) …and it rides the runtime's one camera registration rather than opening a ninth
     subscription of its own. The 320 ms throttle inside is unchanged, so the prefetch still fires
     at the same rate on the same cameras; what is gone is one more per-frame dispatch out of the
     renderer's emitter, on the path 「指に付いてこない」 is about. */
  let _movePfT=0;
  const _pf=()=>{ try{ if(HOST.mapType!=='sat') return; const now=Date.now(); if((GE().camera.getPitch()||0)>25 && now-_movePfT>320){ _movePfT=now; predictivePrefetch(true); } }catch(_){} };
  if(GE().hasRenderer()){ const R=window.IntMapRuntime;
    if(R) R.onCamera('tilewarm.prefetch',_pf,{phase:'read'}); else GE().events.on('move',_pf); }
  /* (#R150) expose the directional prefetch so the flight simulator can warm satellite tiles AHEAD of the aircraft
     every few hundred ms — during flight the camera moves CONTINUOUSLY so `moveend` never fires and the imagery
     couldn't keep up ("3D衛星画像の生成が飛行に追い付いていない"). The flight loop throttles the calls. */
  try{ window._imPredictivePrefetch=predictivePrefetch; }catch(_){}
};
