/* ============================================================================
 *  IntMap · CESIUM INPUT — MapLibre's gestures, driving Cesium's camera (#R182)
 * ----------------------------------------------------------------------------
 *  「Cesium選択時に、マップの操作がほぼできない。また、MapLibre時と同じレスポンスに
 *    なるように。（マウスなど）」
 *
 *  #R180 shipped the second engine with Cesium's OWN ScreenSpaceCameraController
 *  left in place, and that is not the navigation model this app has anywhere
 *  else. Measured against MapLibre through the contract, on the same canvas and
 *  from the same camera, with real input (Playwright drives the browser's input
 *  pipeline, not synthetic events):
 *
 *    gesture                     MapLibre              Cesium (#R180)
 *    left-drag  120 px →         Δlng −6.17            Δlng −5.30, Δlat +0.08
 *    left-drag  120 px ↓         Δlat +1.23            Δlat +5.01  (4× too far)
 *    right-drag 120 px →         Δbearing +96          nothing
 *    right-drag 120 px ↑         Δpitch   +48          Δzoom −0.12, Δbearing 180
 *    ctrl+drag  120 px ↑         Δpitch   +48          nothing
 *    shift+drag (box zoom)       Δzoom  +2.83          nothing
 *    wheel −120                  Δzoom  +0.267         0
 *    wheel −120 off-centre       zooms at the cursor   not anchored
 *    ArrowRight                  Δlng   +4.42          nothing
 *    shift+ArrowUp               Δpitch  +10           nothing
 *
 *  Six of the eight gestures the contract names did nothing at all, and the two
 *  that moved moved by a different law: Cesium spins the globe about its centre,
 *  MapLibre translates the map under the pointer. Hence 「ほぼできない」.
 *
 *  ── WHY THE NUMBERS ARE TRANSCRIBED AND NOT INVENTED ────────────────────────
 *  The instruction is not "make it work", it is "make it respond the way
 *  MapLibre does", so every constant and every formula below is transcribed from
 *  the MapLibre build this project already ships (node_modules/maplibre-gl,
 *  pinned at 5.24.0 since #R158) — from the handler classes themselves, not from
 *  a description of them, and each is cited at its use site. That is the
 *  discipline #R177 set for the camera: ONE copy of the law, taken from the
 *  thing that defines it, rather than two that agree with each other and not
 *  with the renderer.
 *
 *  It matters more than it sounds. MapLibre's globe pan is DELIBERATELY not
 *  "grab a place and drag it" — its own comment on handleMapControlsPan says so
 *  ("we avoid using the grab a place and move it around approach from mercator
 *  here, since it is not a very pleasant way to pan a globe") — so the obvious
 *  implementation, the one that keeps the grabbed point exactly under the
 *  cursor, is the one that would NOT match. Cesium's controller is switched off
 *  (`enableInputs = false`) rather than re-tuned: its rotate/tilt/zoom are a
 *  different model, and two camera drivers on one pointer is the class of defect
 *  #R172 and #R179 each spent a round on.
 *
 *  ── AND WHY THE CAMERA IS STILL SET THROUGH setCamera() ─────────────────────
 *  Every gesture here ends in `view.setCamera({center, zoom, bearing, pitch})`.
 *  Nothing in this file touches a Cartesian3. That keeps #R181's `_faceHeading`
 *  (a vertical orbit cannot carry a heading), #R180's range↔zoom transcription
 *  and the DEM `_settle` in the one place they already live — and it is why a
 *  drag on this engine now reports the same bearing back as a jumpTo does.
 * ==========================================================================*/
window.IntMapCesiumInput=(function(){
  'use strict';

  /* ══ MAPLIBRE'S NUMBERS, WITH THE HANDLER EACH COMES FROM ═══════════════════ */
  const ROTATE_DEG_PER_PX=0.8;          /* generateMouseRotationHandler: rotateDegreesPerPixelMoved */
  const PITCH_DEG_PER_PX=-0.5;          /* generateMousePitchHandler:   pitchDegreesPerPixelMoved */
  const ROTATE_CENTRE_PX=100;           /* generateMouseRotationHandler: minPixelCenterThreshold */
  const CLICK_TOLERANCE=3;              /* Map's default option clickTolerance */
  const WHEEL_ZOOM_DELTA=4.000244140625;/* ScrollZoomHandler: wheelZoomDelta */
  const DEFAULT_ZOOM_RATE=1/100;        /* ScrollZoomHandler: defaultZoomRate  (trackpad / single ticks) */
  const WHEEL_ZOOM_RATE=1/450;          /* ScrollZoomHandler: wheelZoomRate */
  const MAX_SCALE_PER_FRAME=2;          /* ScrollZoomHandler: maxScalePerFrame */
  const WHEEL_EASE_MS=200;              /* ScrollZoomHandler: _smoothOutEasing(200) */
  const WHEEL_TIME_ADJ=5;               /* ScrollZoomHandler: wheelEventTimeDiffAdjustment */
  const TOUCH_ZOOM_RATE=1;              /* TwoFingersTouchZoomHandler: defaultZoomRate */
  const TOUCH_ZOOM_THRESHOLD=0.1;       /* TwoFingersTouchZoomHandler: defaultZoomThreshold */
  const TOUCH_ROTATE_THRESHOLD=25;      /* TwoFingersTouchRotateHandler: ROTATION_THRESHOLD */
  const TOUCH_SINGLE_MS=100;            /* TwoFingersTouchPitchHandler: ALLOWED_SINGLE_TOUCH_TIME */
  const TOUCH_PITCH_MIN_PX=2;           /* TwoFingersTouchPitchHandler: gestureBeginsVertically threshold */
  const KEY_PAN_STEP=100, KEY_BEARING_STEP=15, KEY_PITCH_STEP=10;   /* KeyboardHandler: defaultOptions */
  const KEY_EASE_MS=300, DBLCLICK_EASE_MS=300;                      /* both handlers' easeTo duration */
  const INERTIA_CUTOFF=160;             /* HandlerInertia: cutoff */
  const INERTIA={                       /* HandlerInertia: default{Pan,Zoom,Bearing,Pitch}InertiaOptions */
    pan:    { linearity:0.3, deceleration:2500, maxSpeed:1400 },
    zoom:   { linearity:0.3, deceleration:20,   maxSpeed:1400 },
    bearing:{ linearity:0.3, deceleration:1000, maxSpeed:360  },
    pitch:  { linearity:0.3, deceleration:1000, maxSpeed:90   } };
  const MAX_VALID_LATITUDE=85.051129;   /* the Mercator limit MapLibre clamps a centre to */
  const TILE=512, D2R=Math.PI/180;

  /* ══ THE TWO EASINGS ════════════════════════════════════════════════════════
     `bezier(0,0,0.3,1)` is HandlerInertia's defaultInertiaOptions.easing and
     `easeOut` is the keyboard/click handlers'. A cubic-bezier solve is not a
     thing to approximate with a lookalike curve: the whole subject of this file
     is how the map FEELS, and the glide is this function. */
  function unitBezier(p1x,p1y,p2x,p2y){
    const cx=3*p1x, bx=3*(p2x-p1x)-cx, ax=1-cx-bx;
    const cy=3*p1y, by=3*(p2y-p1y)-cy, ay=1-cy-by;
    const sampleX=t=>((ax*t+bx)*t+cx)*t;
    const sampleY=t=>((ay*t+by)*t+cy)*t;
    const sampleDX=t=>(3*ax*t+2*bx)*t+cx;
    function solveX(x){
      let t=x;
      for(let i=0;i<8;i++){
        const d=sampleX(t)-x; if(Math.abs(d)<1e-6) return t;
        const dx=sampleDX(t); if(Math.abs(dx)<1e-6) break;
        t-=d/dx;
      }
      let lo=0,hi=1; t=x;
      for(let i=0;i<24;i++){
        const v=sampleX(t);
        if(Math.abs(v-x)<1e-6) return t;
        if(x>v) lo=t; else hi=t;
        t=(hi-lo)*0.5+lo;
      }
      return t;
    }
    return x=>(x<=0?0:(x>=1?1:sampleY(solveX(x))));
  }
  const INERTIA_EASING=unitBezier(0,0,0.3,1);
  const easeOut=t=>t*(2-t);

  /* ══ THE GLOBE ARITHMETIC ═══════════════════════════════════════════════════
     From maplibre-gl's globe utilities and VerticalPerspectiveCameraHelper —
     the helper the map uses whenever the projection is `globe`, which is this
     app's default and the only thing a Cesium session can be. */
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const lerp=(a,b,m)=>a*(1-m)+b*m;
  const remapSaturate=(v,a,b,c,d)=>lerp(c,d,clamp((v-a)/(b-a),0,1));
  const planetScale=lat=>Math.cos(lat*D2R);                       /* planetScaleAtLatitude */
  /* getZoomAdjustment — what to add to zoom to hold the planet's apparent size
     while the centre latitude changes. Cesium reproduces it for free: its zoom is
     read back through the same cos(lat), so HOLDING THE RANGE moves the reported
     zoom by exactly this. Measured, panning z4 from lat 20 to 17.1: MapLibre
     +0.0244, this expression +0.0245. */
  const zoomAdjust=(oldLat,newLat)=>Math.log2(planetScale(newLat)/planetScale(oldLat));
  const worldSizeAt=z=>TILE*Math.pow(2,z);
  const globeRadiusPx=(world,lat)=>world/(2*Math.PI)/planetScale(lat);   /* getGlobeRadiusPixels */
  const degPerPx=(world,lat)=>360/(2*Math.PI*globeRadiusPx(world,lat));  /* getDegreesPerPixel */
  function diffAngles(a,b){                                       /* differenceOfAnglesDegrees */
    const m=x=>((x%360)+360)%360;
    const A=m(a), B=m(b);
    const d1=B-A, d2=(B>A)?(d1-360):(d1+360);
    return Math.abs(d1)<Math.abs(d2)?d1:d2;
  }
  const wrapLng=v=>((v+180)%360+360)%360-180;

  /* computeGlobePanCenter(panDelta, tr) — the whole of MapLibre's globe pan */
  function panCentre(cam,dx,dy){
    const br=cam.bearing*D2R, cs=Math.cos(br), sn=Math.sin(br);
    const rx=cs*dx-sn*dy, ry=sn*dx+cs*dy;                         /* Point.rotate(bearingInRadians) */
    const normalisedGlobeZoom=cam.zoom+zoomAdjust(cam.lat,0);
    const lngSpeed=lerp(1/planetScale(cam.lat),
                        1/planetScale(Math.min(Math.abs(cam.lat),60)),
                        remapSaturate(normalisedGlobeZoom,7,3,0,1));
    const dpp=degPerPx(worldSizeAt(cam.zoom),cam.lat);
    return { lng:cam.lng-rx*dpp*lngSpeed,
             lat:clamp(cam.lat+ry*dpp,-MAX_VALID_LATITUDE,MAX_VALID_LATITUDE) };
  }

  /* calculateEasing(amount, inertiaDuration, options). MapLibre divides by the raw window and
     lets a zero-length one produce Infinity, which its own clamp then absorbs; a floor of one
     millisecond reaches the same clamp without the intermediate non-finite value. */
  function inertiaEase(amount,ms,opt){
    const speed=clamp(amount*opt.linearity/(Math.max(ms,1)/1000),-opt.maxSpeed,opt.maxSpeed);
    const duration=Math.abs(speed)/(opt.deceleration*opt.linearity);
    return { duration:duration*1000, amount:speed*(duration/2) };
  }

  /* getAngleDelta(lastPoint, currentPoint, centre) */
  function angleDelta(lx,ly,cx,cy,ox,oy){
    const px=cx-ox, py=cy-oy, qx=lx-ox, qy=ly-oy;
    return Math.atan2(px*qy-py*qx, px*qx+py*qy)/D2R;
  }
  /* Point.angleWith — the signed angle from b to a, used by the touch rotate */
  const angleWith=(ax,ay,bx,by)=>Math.atan2(ax*by-ay*bx, ax*bx+ay*by)/D2R;

  const now=()=>(window.performance&&window.performance.now)?window.performance.now():Date.now();

  /* ══ ATTACH ═════════════════════════════════════════════════════════════════ */
  function attach(view,Cesium){
    const cv=view.getCanvas();
    if(!cv) return null;

    try{ view._scene.screenSpaceCameraController.enableInputs=false; }catch(_){}
    /* MapLibre's canvas carries tabindex="0" so it can take the keyboard; Cesium's
       does not, so the arrow keys would land on <body> and do nothing at all. */
    try{ if(!(cv.tabIndex>=0)) cv.tabIndex=0; cv.style.outline='none'; }catch(_){}

    const on={ dragPan:true, dragRotate:true, scrollZoom:true, touchZoomRotate:true,
               keyboard:true, doubleClickZoom:true, boxZoom:true, touchPitch:true };
    /* the two rates ScrollZoomHandler keeps, which is what input.setZoomRate(r,wheel)
       reaches on the MapLibre side (map.scrollZoom.setWheelZoomRate / setZoomRate) */
    let wheelRate=WHEEL_ZOOM_RATE, smallRate=DEFAULT_ZOOM_RATE;

    const limits=()=>({ minZoom:view._minZoom, maxZoom:view._maxZoom,
                        minPitch:view._minPitch, maxPitch:view._maxPitch });
    function read(){
      const c=view.getCenter();
      return { lng:c.lng, lat:c.lat, zoom:view.getZoom(),
               bearing:view.getBearing(), pitch:view.getPitch() };
    }
    function normalise(cam){
      const L=limits();
      cam.zoom=clamp(cam.zoom,L.minZoom,L.maxZoom);
      cam.pitch=clamp(cam.pitch,L.minPitch,L.maxPitch);
      cam.lat=clamp(cam.lat,-MAX_VALID_LATITUDE,MAX_VALID_LATITUDE);
      cam.lng=wrapLng(cam.lng);
      return cam;
    }
    /* THE ONE WAY THIS FILE MOVES THE CAMERA. `silent` stops setCamera firing its
       own move/moveend per gesture frame: a drag is ONE movestart…moveend, and 19
       subscribers of `moveend` do real work (layer reconcile, news refresh, the
       shared #v= URL). The lifecycle is driven explicitly below instead. */
    function apply(cam){
      normalise(cam);
      /* when the gesture last wrote the camera — the view's own `camera.changed` stream reads
         it to tell a frame it already announced from a fresh one (see _wireEvents) */
      view._inputTouched=Date.now();
      view.setCamera({ center:[cam.lng,cam.lat], zoom:cam.zoom, bearing:cam.bearing, pitch:cam.pitch },
                     null,{ silent:true });
    }
    function unprojectAt(x,y){
      const ll=view._pickLngLat({x,y});
      return (ll&&isFinite(ll.lng)&&isFinite(ll.lat))?ll:null;
    }

    /* ══ setLocationAtPoint, SOLVED RATHER THAN TRANSCRIBED ════════════════════
       MapLibre's is closed form because its transform is a Mercator plane; on an
       ellipsoid with terrain it is not. Iterating is exact at convergence and
       needs no second copy of Cesium's projection: move the centre by the error
       the screen reports, re-aim, repeat. The map's response to a centre shift is
       the identity to first order, so this contracts hard — measured, three
       passes leave the anchor inside 0.1 px at every zoom this app reaches. */
    function locationAtPoint(cam,loc,x,y){
      for(let i=0;i<4;i++){
        const cur=unprojectAt(x,y);
        if(!cur) break;
        const dLng=diffAngles(cur.lng,loc.lng), dLat=loc.lat-cur.lat;
        if(Math.abs(dLng)<1e-9&&Math.abs(dLat)<1e-9) break;
        cam.lng=wrapLng(cam.lng+dLng);
        cam.lat=clamp(cam.lat+dLat,-MAX_VALID_LATITUDE,MAX_VALID_LATITUDE);
        apply(cam);
      }
    }

    /* ══ ZOOM ABOUT A SCREEN POINT ═════════════════════════════════════════════
       handleMapControlsRollPitchBearingZoom, VerticalPerspectiveCameraHelper. The
       exact anchor is blended with a heuristic one, and that is not a nicety:
       both of MapLibre's slowing factors exist because an exact anchor yanks the
       map when the cursor's ray passes far from the planet, or when the globe is
       small on screen — which is precisely this app's own startup view at z1.7. */
    function zoomAround(cam,zoomDelta,x,y){
      const loc=unprojectAt(x,y);
      const before=cam.zoom;
      cam.zoom=clamp(cam.zoom+zoomDelta,limits().minZoom,limits().maxZoom);
      const actual=cam.zoom-before;
      apply(cam);
      if(!actual||!loc) return actual;

      const dLngRaw=diffAngles(cam.lng,loc.lng);
      const dLng=dLngRaw/(Math.abs(dLngRaw/180)+1);
      const dLat=diffAngles(cam.lat,loc.lat);

      /* how far the cursor's ray passes from the planet, in planet radii */
      let distanceFactor=1;
      try{
        const ray=view._camera.getPickRay(new Cesium.Cartesian2(x,y));
        if(ray){
          const R=view._globe.ellipsoid.maximumRadius;
          const o=ray.origin, d=ray.direction;
          const t=-(o.x*d.x+o.y*d.y+o.z*d.z);
          const fromSurface=Math.hypot(o.x+d.x*t,o.y+d.y*t,o.z+d.z*t)/R-1;
          distanceFactor=Math.exp(-Math.max(fromSurface-0.3,0)*0.5);
        }
      }catch(_){}
      /* and how big the globe is against the viewport */
      const radius=globeRadiusPx(worldSizeAt(cam.zoom),cam.lat)
                   /Math.max(1,Math.min(view._canvasW(),view._canvasH()));
      const radiusFactor=remapSaturate(radius,0.9,0.5,1,0.25);

      const factor=(1-Math.pow(2,-actual))*Math.min(distanceFactor,radiusFactor);
      const oldLat=cam.lat, oldZoom=cam.zoom;
      const heurLng=cam.lng+dLng*factor;
      const heurLat=clamp(cam.lat+dLat*factor,-MAX_VALID_LATITUDE,MAX_VALID_LATITUDE);

      locationAtPoint(cam,loc,x,y);                       /* the exact answer */
      const exactLng=cam.lng, exactLat=cam.lat;

      const heuristicFactor=Math.pow(Math.max(remapSaturate(Math.abs(dLngRaw),45,85,0,1),
                                              remapSaturate(radius,0.75,0.35,0,1)),0.25);
      cam.lng=wrapLng(exactLng+diffAngles(exactLng,heurLng)*heuristicFactor);
      cam.lat=exactLat+(heurLat-exactLat)*heuristicFactor;
      cam.zoom=oldZoom+zoomAdjust(oldLat,cam.lat);
      apply(cam);
      return actual;
    }

    /* ══ THE GESTURE LIFECYCLE ═════════════════════════════════════════════════
       One movestart…moveend per gesture INCLUDING its inertia, which is what
       MapLibre means by them. While a gesture owns the camera the view's own
       `camera.changed` stream stands down (see _wireEvents) so nothing is
       announced twice. */
    const st={ moving:false, pan:false, zoom:false, rot:false, inertia:[] };
    const fire=(n,e)=>{ try{ view.fire(n,e||{}); }catch(_){} };
    function begin(kind){
      if(!st.moving){ st.moving=true; view._inputActive=true; fire('movestart'); }
      if(kind==='pan'&&!st.pan){ st.pan=true; fire('dragstart'); }
      if(kind==='zoom'&&!st.zoom){ st.zoom=true; fire('zoomstart'); }
      if(kind==='rot'&&!st.rot){ st.rot=true; fire('rotatestart'); }
    }
    function step(zoomed){
      if(!st.moving) return;
      fire('move');
      if(zoomed) fire('zoom');
      if(st.pan) fire('drag');
    }
    function end(){
      if(!st.moving) return;
      if(st.pan){ st.pan=false; fire('dragend'); }
      if(st.zoom){ st.zoom=false; fire('zoomend'); }
      if(st.rot){ st.rot=false; fire('rotateend'); }
      st.moving=false; view._inputActive=false;
      fire('moveend'); fire('idle');
    }

    /* ══ EASED MOTION ══════════════════════════════════════════════════════════
       Everything MapLibre routes through easeTo — the keyboard, the double click,
       the box zoom and every inertial glide — runs here: interpolate in the
       camera's own units, re-anchor `around` on EVERY frame (that is what makes a
       double click zoom toward the cursor and not toward the centre), and stand
       down the moment a new gesture arrives. */
    let easeTok=0, easeRAF=0;
    function cancelEase(){ easeTok++; if(easeRAF){ cancelAnimationFrame(easeRAF); easeRAF=0; } }
    function runEase(opt){
      const tok=++easeTok;
      const from=opt.from, to=opt.to;
      const dur=Math.max(1,opt.duration||0);
      const ez=opt.easing||INERTIA_EASING;
      const t0=now();
      const c=Object.assign({},from);
      const anchor=opt.around||null;
      const anchorLoc=anchor?unprojectAt(anchor.x,anchor.y):null;
      const zoomed=(to.zoom!=null&&to.zoom!==from.zoom);
      const tick=()=>{
        easeRAF=0;
        if(tok!==easeTok) return;
        const t=Math.min(1,(now()-t0)/dur), k=ez(t);
        c.zoom=lerp(from.zoom,(to.zoom==null?from.zoom:to.zoom),k);
        c.bearing=from.bearing+diffAngles(from.bearing,(to.bearing==null?from.bearing:to.bearing))*k;
        c.pitch=lerp(from.pitch,(to.pitch==null?from.pitch:to.pitch),k);
        if(to.lng!=null||to.lat!=null){
          c.lng=wrapLng(from.lng+diffAngles(from.lng,(to.lng==null?from.lng:to.lng))*k);
          c.lat=lerp(from.lat,(to.lat==null?from.lat:to.lat),k);
        }
        apply(c);
        if(anchorLoc) locationAtPoint(c,anchorLoc,anchor.x,anchor.y);
        step(zoomed);
        if(t<1){ easeRAF=requestAnimationFrame(tick); return; }
        end();
      };
      easeRAF=requestAnimationFrame(tick);
    }

    /* ══ INERTIA ═══════════════════════════════════════════════════════════════
       HandlerInertia: keep the last 160 ms of deltas, sum them, convert each
       family with its own deceleration, and let the longest of the resulting
       durations carry all of them (extendDuration). */
    function record(s){
      const t=now();
      while(st.inertia.length&&t-st.inertia[0].t>INERTIA_CUTOFF) st.inertia.shift();
      st.inertia.push({ t, s });
    }
    function releaseInertia(){
      const t=now();
      while(st.inertia.length&&t-st.inertia[0].t>INERTIA_CUTOFF) st.inertia.shift();
      if(st.inertia.length<2){ st.inertia.length=0; end(); return; }
      let px=0,py=0,dz=0,db=0,dp=0,around=null;
      for(const e of st.inertia){
        px+=e.s.px||0; py+=e.s.py||0; dz+=e.s.zoom||0; db+=e.s.bearing||0; dp+=e.s.pitch||0;
        if(e.s.around) around=e.s.around;
      }
      const ms=st.inertia[st.inertia.length-1].t-st.inertia[0].t;
      st.inertia.length=0;
      const from=read();
      const to={}; let dur=0;
      const mag=Math.hypot(px,py);
      if(mag){
        const r=inertiaEase(mag,ms,INERTIA.pan);
        const c=panCentre(from,px*(r.amount/mag),py*(r.amount/mag));
        /* handlePanInertia clamps a glide that would carry the centre past the
           far side of the globe (VerticalPerspectiveCameraHelper) */
        const d=diffAngles(from.lng,c.lng);
        to.lng=(Math.abs(d)>179.5)?(from.lng+179.5*Math.sign(d)):c.lng;
        to.lat=c.lat;
        dur=Math.max(dur,r.duration);
      }
      if(dz){ const r=inertiaEase(dz,ms,INERTIA.zoom);    to.zoom=from.zoom+r.amount;                       dur=Math.max(dur,r.duration); }
      if(db){ const r=inertiaEase(db,ms,INERTIA.bearing); to.bearing=from.bearing+clamp(r.amount,-179,179); dur=Math.max(dur,r.duration); }
      if(dp){ const r=inertiaEase(dp,ms,INERTIA.pitch);   to.pitch=from.pitch+r.amount;                     dur=Math.max(dur,r.duration); }
      if(!(dur>0)||!Object.keys(to).length){ end(); return; }
      runEase({ from, to, duration:dur, easing:INERTIA_EASING,
                around:(to.zoom!=null||to.bearing!=null)?around:null });
    }

    /* ══ POINTERS ══════════════════════════════════════════════════════════════
       One stream for mouse, pen and touch. Cesium prevents the default on
       `pointerdown`, which is what suppresses the browser's compatibility mouse
       events (#R181 measured `mousedown` at 0 against MapLibre's 4), so the
       pointer family is the only one that reports every device here.
       move/up/cancel are bound to the WINDOW, not the canvas: a drag that leaves
       the map must keep working, and a pointermove on the canvas bubbles to the
       window anyway, so binding both would run every handler twice. */
    const pts=new Map();                     /* pointerId → {x,y} — touch only */
    let mode=null;                           /* 'pan' | 'rotate' | 'box' | 'touch' */
    let startX=0,startY=0,lastX=0,lastY=0,moved=false,rotated=false;
    let cam=null, boxEl=null, pinch=null, shiftDown=false, cancelling=false;

    const rel=e=>{ const r=cv.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; };
    /* `getCenter = () => map.project(map.getCenter())` — the SCREEN POSITION OF THE MAP'S
       CENTRE, which is not the middle of the canvas: padding moves it (the app sets padding
       for the sidebar and the mobile sheet), and so does a tilted globe. The rotate handler
       reads it to decide which way a drag turns the map, so using the canvas centre instead
       inverts the bearing wherever the two differ — measured against MapLibre on this app's
       own layout: −96° there, +96° here, for the same 120 px drag. */
    const centrePt=()=>{
      try{ const p=view.project(view.getCenter());
        if(p&&isFinite(p.x)&&isFinite(p.y)&&p.x>=0&&p.y>=0) return p; }catch(_){}
      return { x:view._canvasW()/2, y:view._canvasH()/2 };
    };

    function onDown(e){
      shiftDown=!!e.shiftKey;
      if(e.pointerType==='touch'||e.pointerType==='pen'){
        const p=rel(e); pts.set(e.pointerId,{x:p.x,y:p.y});
        touchStart();
        return;
      }
      if(mode) return;
      const p=rel(e);
      if(e.button===0&&e.shiftKey&&!e.ctrlKey){ if(!on.boxZoom) return; mode='box'; }
      else if(e.button===0&&e.ctrlKey){ if(!on.dragRotate) return; mode='rotate'; }
      else if(e.button===2&&!e.ctrlKey){ if(!on.dragRotate) return; mode='rotate'; }
      else if(e.button===0){ if(!on.dragPan) return; mode='pan'; }
      else return;
      /* a fresh press starts fresh, and from here until the release the context menu is HELD:
         Chromium raises it on mousedown on Linux/macOS and on mouseup on Windows, so the only
         suppression that works on both is one that spans the whole press
         (MapLibre's BlockableMapEventHandler.mousedown sets `_delayContextMenu` for this). */
      rotated=false; moved=false; view._ateContextMenu=false;
      view._ctxDelay=true; try{ view._ctxDrop(); }catch(_){}
      startX=lastX=p.x; startY=lastY=p.y;
      cancelEase();
      cam=read();
      st.inertia.length=0;
      try{ cv.focus({preventScroll:true}); }catch(_){}
    }

    function onMove(e){
      if(e.pointerType==='touch'||e.pointerType==='pen'){
        if(!pts.has(e.pointerId)) return;
        const p=rel(e); touchMove(e.pointerId,p.x,p.y);
        return;
      }
      if(!mode||mode==='touch') return;
      const p=rel(e);
      /* DragHandler: below the tolerance nothing is applied AND lastPoint is not
         advanced, so the first accepted delta is the whole movement from the press */
      if(!moved&&Math.hypot(p.x-startX,p.y-startY)<CLICK_TOLERANCE) return;
      moved=true;
      const dx=p.x-lastX, dy=p.y-lastY, px=lastX, py=lastY;
      lastX=p.x; lastY=p.y;
      if(!dx&&!dy) return;
      if(mode==='box'){ drawBox(); return; }
      if(mode==='pan'){
        begin('pan');
        const oldLat=cam.lat;
        const c=panCentre(cam,dx,dy);
        cam.lng=c.lng; cam.lat=c.lat;
        cam.zoom+=zoomAdjust(oldLat,cam.lat);
        apply(cam);
        record({ px:dx, py:dy, around:{x:p.x,y:p.y} });
        step(false);
        return;
      }
      /* rotate AND pitch, together — MapLibre runs both handlers on the same drag */
      rotated=true;
      /* …and once it has rotated, the release is not a right-CLICK. See the engine's
         contextmenu handler: the app opens a panel over the canvas on that event, and a panel
         over the canvas eats every gesture after it. Drop anything already stashed (Linux and
         macOS raise the event at the press) as well as arming the flag (Windows raises it at
         the release). */
      view._ateContextMenu=true;
      try{ view._ctxDrop(); }catch(_){}
      begin('rot');
      const o=centrePt();
      let bd;
      if(Math.abs(o.y-py)>ROTATE_CENTRE_PX) bd=angleDelta(px,p.y,p.x,p.y,o.x,o.y);
      else { bd=dx*ROTATE_DEG_PER_PX; if(p.y<o.y) bd=-bd; }
      const pd=dy*PITCH_DEG_PER_PX;
      cam.bearing+=bd;
      cam.pitch=clamp(cam.pitch+pd,limits().minPitch,limits().maxPitch);
      apply(cam);
      record({ bearing:bd, pitch:pd, around:{x:p.x,y:p.y} });
      step(false);
    }

    function onUp(e){
      if(e.pointerType==='touch'||e.pointerType==='pen'){ pts.delete(e.pointerId); touchEnd(); return; }
      /* the press is over: whatever context menu it stashed is now due (a plain right click)
         or already dropped (a right drag that rotated) */
      try{ view._ctxRelease(); }catch(_){}
      if(!mode||mode==='touch') return;
      const was=mode; mode=null;
      if(was==='box'){ endBox(rel(e)); return; }
      if(!moved){ st.inertia.length=0; end(); return; }
      releaseInertia();
    }

    /* ── box zoom ─────────────────────────────────────────────────────────────
       BoxZoomHandler, including the element it draws: `.maplibregl-boxzoom` and
       `.maplibregl-crosshair` are already in the app's stylesheet (#R179 kept the
       renderer's class names precisely so this kind of thing stays styled). */
    function drawBox(){
      const host=view.getContainer();
      if(!boxEl&&host){
        boxEl=document.createElement('div');
        boxEl.className='maplibregl-boxzoom';
        boxEl.style.position='absolute'; boxEl.style.top='0'; boxEl.style.left='0';
        host.appendChild(boxEl);
        try{ host.classList.add('maplibregl-crosshair'); }catch(_){}
        fire('boxzoomstart');
      }
      if(!boxEl) return;
      boxEl.style.transform=`translate(${Math.min(startX,lastX)}px,${Math.min(startY,lastY)}px)`;
      boxEl.style.width=Math.abs(lastX-startX)+'px';
      boxEl.style.height=Math.abs(lastY-startY)+'px';
    }
    function endBox(p){
      const host=view.getContainer();
      if(boxEl){ try{ boxEl.remove(); }catch(_){} boxEl=null;
        try{ if(host) host.classList.remove('maplibregl-crosshair'); }catch(_){} }
      if(!moved){ fire('boxzoomcancel'); end(); return; }
      fire('boxzoomend');
      const a=unprojectAt(startX,startY), b=unprojectAt(p.x,p.y);
      if(!a||!b){ end(); return; }
      /* fitScreenCoordinates(p0, p1, bearing, {linear:true}) */
      const from=read();
      const fit=view.cameraForBounds([[Math.min(a.lng,b.lng),Math.min(a.lat,b.lat)],
                                      [Math.max(a.lng,b.lng),Math.max(a.lat,b.lat)]],
                                     { bearing:from.bearing, pitch:from.pitch });
      if(!fit){ end(); return; }
      begin('zoom'); begin('pan');
      runEase({ from, to:{ lng:fit.center.lng, lat:fit.center.lat, zoom:fit.zoom },
                duration:DBLCLICK_EASE_MS, easing:easeOut });
    }

    /* ── wheel ────────────────────────────────────────────────────────────────
       ScrollZoomHandler, whole: the device sniff, the sigmoid, and the 200 ms
       smoothing that makes a mouse wheel glide instead of step. */
    let wType=null, wLastValue=0, wLastTime=0, wDelta=0, wTimeout=0,
        wTarget=null, wStart=null, wEasing=null, wAround=null, wRAF=0;
    function onWheel(e){
      if(!on.scrollZoom) return;
      let value=(e.deltaMode===1)?e.deltaY*40:e.deltaY;          /* DOM_DELTA_LINE */
      const t=now(), timeDelta=t-wLastTime;
      wLastTime=t;
      if(value!==0&&(value%WHEEL_ZOOM_DELTA)===0) wType='wheel';
      else if(value!==0&&Math.abs(value)<4) wType='trackpad';
      else if(timeDelta>400){
        /* A LONE EVENT OF UNKNOWN PROVENANCE. MapLibre banks it for 40 ms rather than
           acting on it, because the same deltaY means different things from a notched
           wheel and from a trackpad, and one more event tells them apart. */
        wType=null; wLastValue=value;
        clearTimeout(wTimeout);
        wTimeout=setTimeout(()=>{ wTimeout=0; wType='wheel'; wDelta-=wLastValue;
                                  const p2=wAround; if(p2) pump(); },40);
      }
      else if(!wType){
        wType=(Math.abs(timeDelta*value)<200)?'trackpad':'wheel';
        if(wTimeout){ clearTimeout(wTimeout); wTimeout=0; value+=wLastValue; }
      }
      /* shift SLOWS the zoom to a quarter for fine control — it does not cancel it */
      if(e.shiftKey&&value) value=value/4;
      const p=rel(e);
      wAround={ x:p.x, y:p.y };
      cancelEase();
      /* `_delta -= value`, and only once the device is known: deltaY is negative when
         scrolling AWAY from the user, which is zoom IN, so the accumulator carries the
         opposite sign to the event. */
      if(wType){ wDelta-=value; pump(); }
      if(e.cancelable) e.preventDefault();
    }
    function pump(){
      if(!wDelta&&wTarget==null) return;
      begin('zoom');
      if(wDelta!==0){
        const rate=(wType==='wheel'&&Math.abs(wDelta)>WHEEL_ZOOM_DELTA)?wheelRate:smallRate;
        let scale=MAX_SCALE_PER_FRAME/(1+Math.exp(-Math.abs(wDelta*rate)));
        if(wDelta<0&&scale!==0) scale=1/scale;
        const base=(wTarget==null)?read().zoom:wTarget;
        wTarget=clamp(base+Math.log2(scale),limits().minZoom,limits().maxZoom);
        if(wType==='wheel'){ wStart=read().zoom; wEasing=INERTIA_EASING; }
        else { wStart=null; wEasing=null; }
        wDelta=0;
      }
      if(!wRAF) wRAF=requestAnimationFrame(wTick);
    }
    function wTick(){
      wRAF=0;
      if(wTarget==null||!wAround){ wTarget=null; end(); return; }
      const c=read();
      let z=wTarget, finished=true;
      if(wType==='wheel'&&wStart!=null&&wEasing){
        const t=Math.min((now()-wLastTime+WHEEL_TIME_ADJ)/WHEEL_EASE_MS,1);
        z=lerp(wStart,wTarget,wEasing(t));
        finished=(t>=1);
      }
      cam=c;
      zoomAround(cam,z-c.zoom,wAround.x,wAround.y);
      step(true);
      if(!finished){ wRAF=requestAnimationFrame(wTick); return; }
      wTarget=null; wStart=null; wEasing=null;
      end();
    }

    /* ── double click ─────────────────────────────────────────────────────────
       ClickZoomHandler. Taken from the VIEW's `dblclick`, not the DOM's: Cesium
       preventDefaults `pointerdown`, so the browser's compatibility dblclick never
       arrives on the canvas — the view raises this one from Cesium's own
       LEFT_DOUBLE_CLICK, which is also the drag-aware source (#R181). */
    function onDblClick(ev){
      if(!on.doubleClickZoom) return;
      const p=ev&&ev.point; if(!p) return;
      cancelEase();
      const from=read();
      begin('zoom');
      runEase({ from, to:{ zoom:from.zoom+(shiftDown?-1:1) }, duration:DBLCLICK_EASE_MS,
                easing:easeOut, around:{x:p.x,y:p.y} });
    }
    view.on('dblclick',onDblClick);

    /* ── keyboard ─────────────────────────────────────────────────────────────
       KeyboardHandler, key codes included: shift turns the arrows into
       rotate/pitch and doubles the +/- zoom step. */
    function onKey(e){
      if(!on.keyboard) return;
      if(e.altKey||e.metaKey||e.ctrlKey) return;
      let zoomDir=0,bearingDir=0,pitchDir=0,xDir=0,yDir=0;
      switch(e.keyCode){
        case 61: case 107: case 171: case 187: zoomDir=1; break;
        case 189: case 109: case 173: zoomDir=-1; break;
        case 37: if(e.shiftKey) bearingDir=-1; else { e.preventDefault(); xDir=-1; } break;
        case 39: if(e.shiftKey) bearingDir=1;  else { e.preventDefault(); xDir=1; } break;
        case 38: if(e.shiftKey) pitchDir=1;    else { e.preventDefault(); yDir=-1; } break;
        case 40: if(e.shiftKey) pitchDir=-1;   else { e.preventDefault(); yDir=1; } break;
        default: return;
      }
      cancelEase();
      const from=read();
      const to={ zoom:from.zoom+(zoomDir?zoomDir*(e.shiftKey?2:1):0),
                 bearing:from.bearing+bearingDir*KEY_BEARING_STEP,
                 pitch:from.pitch+pitchDir*KEY_PITCH_STEP };
      if(xDir||yDir){
        /* ══ AN ARROW IS NOT A DRAG ═══════════════════════════════════════════════════════
           `easeTo({center: tr.center, offset: [-xDir*panStep, -yDir*panStep]})`, and easeTo
           lands that by `setLocationAtPoint(center, centrePoint + offset)` — the CURRENT
           centre ends up at that pixel. That is the exact-anchor law, not the drag law, and
           the two differ once the map is tilted, because 100 px above the middle covers more
           ground than 100 px at the middle. Measured against MapLibre at pitch 30, ArrowUp:
           4.296° of latitude by this law, 3.983° by the drag law — 7% adrift.
           So solve it the same way the animated setCamera solves its destination: move the
           camera until the anchor is where it belongs, read the answer, put the camera back,
           and ease to it. */
        const px=centrePt();
        const scratch=Object.assign({},from);
        locationAtPoint(scratch,{lng:from.lng,lat:from.lat},
                        px.x-xDir*KEY_PAN_STEP, px.y-yDir*KEY_PAN_STEP);
        to.lng=scratch.lng; to.lat=scratch.lat;
        to.zoom+=zoomAdjust(from.lat,scratch.lat);
        apply(Object.assign({},from));                 /* …and back to where the ease starts */
      }
      begin((xDir||yDir)?'pan':(zoomDir?'zoom':'rot'));
      runEase({ from, to, duration:KEY_EASE_MS, easing:easeOut });
    }

    /* ── touch ────────────────────────────────────────────────────────────────
       TouchPanHandler pans by the AVERAGE of the per-finger deltas whatever the
       finger count, so a pinch pans as well as zooms; the two-finger zoom, rotate
       and pitch handlers run alongside it, each with its own threshold. */
    function touchStart(){
      cancelEase();
      cam=read();
      /* a new finger starts a new fling — TouchPanHandler resets on touchstart */
      if(pts.size===1) st.inertia.length=0;
      const ids=[...pts.keys()];
      if(ids.length>=2&&!pinch){
        const a=pts.get(ids[0]), b=pts.get(ids[1]);
        const vx=a.x-b.x, vy=a.y-b.y, d=Math.hypot(vx,vy);
        pinch={ ids:[ids[0],ids[1]], startDist:d, dist:d, vx, vy, startVx:vx, startVy:vy,
                minDiameter:d, last:[{x:a.x,y:a.y},{x:b.x,y:b.y}],
                zoomActive:false, rotActive:false,
                /* TwoFingersTouchPitchHandler._start: fingers stacked vertically → never a pitch */
                pitchValid:(Math.abs(vy)>Math.abs(vx))?false:undefined, firstMove:undefined };
      }
      if(!mode) mode='touch';
    }
    function touchMove(id,x,y){
      const prev=pts.get(id); if(!prev) return;
      const dx=x-prev.x, dy=y-prev.y;
      prev.x=x; prev.y=y;
      if(!dx&&!dy) return;
      if(!cam) cam=read();
      let zd=0, mid=null;

      if(on.dragPan){
        const n=Math.max(1,pts.size);
        begin('pan');
        const oldLat=cam.lat;
        const c=panCentre(cam,dx/n,dy/n);
        cam.lng=c.lng; cam.lat=c.lat; cam.zoom+=zoomAdjust(oldLat,cam.lat);
        record({ px:dx/n, py:dy/n, around:{x,y} });
      }

      if(pinch&&pts.has(pinch.ids[0])&&pts.has(pinch.ids[1])){
        const a=pts.get(pinch.ids[0]), b=pts.get(pinch.ids[1]);
        mid={ x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
        const vx=a.x-b.x, vy=a.y-b.y;
        if(on.touchZoomRotate){
          const d=Math.hypot(vx,vy), lastD=pinch.dist;
          pinch.dist=d;
          if(pinch.zoomActive||Math.abs(Math.log2(d/pinch.startDist))>=TOUCH_ZOOM_THRESHOLD){
            pinch.zoomActive=true;
            zd=Math.log2(d/lastD)*TOUCH_ZOOM_RATE;
            if(zd){ begin('zoom'); record({ zoom:zd, around:mid }); }
          }
          const lvx=pinch.vx, lvy=pinch.vy;
          pinch.minDiameter=Math.min(pinch.minDiameter,Math.hypot(vx,vy));
          const sinceStart=angleWith(vx,vy,pinch.startVx,pinch.startVy);
          const threshold=TOUCH_ROTATE_THRESHOLD/(Math.PI*Math.max(1,pinch.minDiameter))*360;
          if(pinch.rotActive||Math.abs(sinceStart)>=threshold){
            pinch.rotActive=true;
            const bd=angleWith(vx,vy,lvx,lvy);
            if(bd){ begin('rot'); cam.bearing+=bd; record({ bearing:bd, around:mid }); }
          }
          pinch.vx=vx; pinch.vy=vy;
        }
        if(on.touchPitch&&pinch.pitchValid!==false){
          const la=pinch.last[0], lb=pinch.last[1];
          const va={x:a.x-la.x,y:a.y-la.y}, vb={x:b.x-lb.x,y:b.y-lb.y};
          const valid=pitchBeginsVertically(va,vb);
          pinch.pitchValid=valid;
          if(valid){
            pinch.last=[{x:a.x,y:a.y},{x:b.x,y:b.y}];
            const pd=((va.y+vb.y)/2)*PITCH_DEG_PER_PX;
            if(pd){ begin('rot');
                    cam.pitch=clamp(cam.pitch+pd,limits().minPitch,limits().maxPitch);
                    record({ pitch:pd }); }
          }
        }
      }
      apply(cam);
      if(zd&&mid) zoomAround(cam,zd,mid.x,mid.y);
      step(!!zd);
    }
    function pitchBeginsVertically(va,vb){
      if(pinch.pitchValid!==undefined) return pinch.pitchValid;
      const movedA=Math.hypot(va.x,va.y)>=TOUCH_PITCH_MIN_PX;
      const movedB=Math.hypot(vb.x,vb.y)>=TOUCH_PITCH_MIN_PX;
      if(!movedA&&!movedB) return undefined;
      if(!movedA||!movedB){
        if(pinch.firstMove===undefined) pinch.firstMove=now();
        return (now()-pinch.firstMove<TOUCH_SINGLE_MS)?undefined:false;
      }
      const vert=v=>Math.abs(v.y)>Math.abs(v.x);
      return vert(va)&&vert(vb)&&((va.y>0)===(vb.y>0));
    }
    function touchEnd(){
      if(pinch&&(!pts.has(pinch.ids[0])||!pts.has(pinch.ids[1]))) pinch=null;
      if(pts.size===0){ mode=null; releaseInertia(); }
    }

    /* A right-drag IS the rotate gesture, so the browser menu must not open on top
       of it — assignEvents preventDefaults contextmenu for exactly this reason. */
    function onContextMenu(e){
      /* MapLibre suppresses the menu whenever the app listens for `contextmenu` at all
         (BlockableMapEventHandler), and this app does — two subscribers. That is not a
         nicety: a menu that opens swallows everything after it, and under a real browser's
         input pipeline the two wheel gestures following a right-drag measured 0 here
         against MapLibre's 0.268. The rotate case below is what still holds when nobody
         is listening. */
      let listened=false;
      try{ listened=!!(view.listens&&view.listens('contextmenu')); }catch(_){}
      if(listened||rotated||mode==='rotate'){ e.preventDefault(); rotated=false; }
    }

    const bound=[
      [cv,'pointerdown',onDown,{passive:false}],
      [window,'pointermove',onMove,{passive:false}],
      [window,'pointerup',onUp,{passive:false}],
      [window,'pointercancel',onUp,{passive:false}],
      [cv,'wheel',onWheel,{passive:false}],
      [cv,'keydown',onKey,{passive:false}],
      [cv,'contextmenu',onContextMenu,{passive:false}]
    ];
    bound.forEach(([el,n,fn,o])=>{ try{ el.addEventListener(n,fn,o); }catch(_){} });

    return {
      /* the eight names the contract uses — js/geo-engine.js: gestures() */
      set(name,value){
        if(!(name in on)) return false;
        on[name]=!!value;
        if(!value){
          if(name==='dragPan'&&(mode==='pan'||mode==='touch')){ mode=null; pts.clear(); pinch=null; st.inertia.length=0; end(); }
          if(name==='dragRotate'&&mode==='rotate'){ mode=null; st.inertia.length=0; end(); }
          if(name==='boxZoom'&&mode==='box'){ mode=null; endBox({x:lastX,y:lastY}); }
          if(name==='scrollZoom'){ wDelta=0; wTarget=null; }
        }
        return true;
      },
      enabled(name){ return !!on[name]; },
      /* input.setZoomRate(r, wheel) — the app's navigation-sensitivity slider */
      setZoomRate(r,wheel){
        if(!isFinite(r)||r<=0) return false;
        if(wheel) wheelRate=r; else smallRate=r;
        return true;
      },
      rates(){ return { wheel:wheelRate, small:smallRate }; },
      isActive(){ return !!mode||st.moving; },
      /* an EASE, not a drag — the glide after the finger leaves, the keyboard's
         300 ms, the wheel's smoothing. `mode` means a pointer is still down. */
      isEasing(){ return !mode&&(easeRAF!==0||wRAF!==0); },
      /* `end()` fires moveend, and a moveend subscriber that moves the camera would
         re-enter this — so the guard is here rather than at every caller. */
      cancel(){ if(cancelling) return; cancelling=true;
                try{ cancelEase(); wDelta=0; wTarget=null; if(st.moving) end(); }
                finally{ cancelling=false; } },
      destroy(){
        bound.forEach(([el,n,fn,o])=>{ try{ el.removeEventListener(n,fn,o); }catch(_){} });
        try{ view.off('dblclick',onDblClick); }catch(_){}
        cancelEase(); clearTimeout(wTimeout);
        if(wRAF) cancelAnimationFrame(wRAF);
        view._inputActive=false;
      }
    };
  }

  /* The pure arithmetic, exposed so a Node test can check it against MapLibre's
     own formulas without a browser — the same rule #R180 set for cesium-style.js. */
  return { attach,
    _math:{ unitBezier, easeOut, INERTIA_EASING, clamp, lerp, remapSaturate, planetScale,
            zoomAdjust, worldSizeAt, globeRadiusPx, degPerPx, diffAngles, wrapLng,
            panCentre, inertiaEase, angleDelta, angleWith },
    _consts:{ ROTATE_DEG_PER_PX, PITCH_DEG_PER_PX, ROTATE_CENTRE_PX, CLICK_TOLERANCE,
              WHEEL_ZOOM_DELTA, DEFAULT_ZOOM_RATE, WHEEL_ZOOM_RATE, MAX_SCALE_PER_FRAME,
              WHEEL_EASE_MS, WHEEL_TIME_ADJ, TOUCH_ZOOM_RATE, TOUCH_ZOOM_THRESHOLD,
              TOUCH_ROTATE_THRESHOLD, TOUCH_SINGLE_MS, TOUCH_PITCH_MIN_PX,
              KEY_PAN_STEP, KEY_BEARING_STEP, KEY_PITCH_STEP, KEY_EASE_MS, DBLCLICK_EASE_MS,
              INERTIA_CUTOFF, INERTIA, MAX_VALID_LATITUDE, TILE } };
})();
