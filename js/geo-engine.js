/* ============================================================================
 *  IntMap · THE GEO ENGINE — the renderer seam itself  (#R178)
 * ----------------------------------------------------------------------------
 *  `window.IntMapGeoEngine`: the ONE place in the project that is allowed to know
 *  which map renderer is running. Every other file asks this contract instead —
 *  `const GE=()=>window.IntMapGeoEngine` — and scripts/engine-coupling.mjs fails
 *  CI if one of them reaches for the raw handle again.
 *
 *  WHY IT IS ITS OWN FILE NOW. It was born inside app-body.js's `map.on('load')`
 *  (#R152), so it did not EXIST until the map had loaded — fine while only user
 *  actions used it, fatal the moment the modules themselves are written against
 *  it: every `window.IntMapModules.x(map, HOST)` factory runs at import time,
 *  long before 'load', and the first `GE().layers` in one of them threw
 *  "Cannot read properties of undefined". Imported early, the contract exists
 *  before any module is constructed, and every method already tolerates there
 *  being no map yet (`_m()` returns null and each one guards), so the cut needed
 *  no rewiring — `_m()` already preferred window.__imap over the closure's `map`.
 *  app-body.js now publishes __imap the moment the map is constructed rather
 *  than at 'load'.
 *
 *  It is also the shape the Cesium work needs: a second engine is a second file
 *  implementing this same object, selected at boot, with app-body.js none the
 *  wiser. The declared CESIUM_CONTRACT at the bottom is that checklist.
 *
 *  MOVED VERBATIM out of app-body.js — de-indented by six spaces, nothing else.
 * ==========================================================================*/
/* ===== (#R152) IntMapGeoEngine — Phase 1 renderer-abstraction (業務委託: 地図エンジン交換可能化・第1段階).
   A THIN facade over a swappable renderer adapter, so a future Google-Earth-class "Earth Mode" can be dropped in
   later without touching every call site. Phase 1 ships the MapLibre adapter ONLY and moves just the SAFE common
   operations behind it — camera, coordinate transforms, source/layer add-remove-visibility-opacity, GeoJSON data,
   events — each delegating 1:1 to the current `map`, so behaviour / performance / mobile are byte-identical. It is
   PURELY ADDITIVE: existing MapLibre calls keep working; new common code should call IntMapGeoEngine instead of
   `map` directly. A Cesium CONTRACT (capabilities only, NO SDK, NO keys) is declared for the next phase. The raw()
   escape hatch returns the live MapLibre map for the many features not yet generalised (deliberately not forced). ===== */
window.IntMapGeoEngine=(function(){
  /* (#R178) …and ONLY window.__imap now. The `typeof map!=='undefined'` half was reaching for
   app-body.js's closure variable, which this file no longer shares — app-body publishes the
   handle the moment the map is constructed, so the fallback had nothing left to catch. */
function _m(){ return window.__imap||null; }
  const MAPLIBRE_CAPS={ engine:'maplibre', globe:true, flat:true, terrain3d:true, freeCamera:true, pitchBeyond90:true,
    rasterLayers:true, vectorLayers:true, geojson:true, terrainElevation:true, markers:true, opacity:true, projection:true,
    /* (#R170) real-scale metric extrusion (base/height in metres) — what the Measure ▸ 3-D volume tool needs */
    extrusion3d:true,
    /* (#R173) can the renderer draw a CLOSED body — a floor, and an interior that is filled rather
       than hollow? `extrusion3d` cannot: fill-extrusion is a lid and walls with no downward face at
       all, which is why 「下の面は色がついていない・多面体内部の空間も無色」 could not be answered by
       adding more extrusions. MapLibre can, through a custom GL layer (js/solid3d.js). */
    solid3d:true,
    /* (#R171) A CURVED EARTH AT EVERY ZOOM. Declared separately from `globe` because in MapLibre they are
       NOT the same thing: its `globe` projection is DEFINED as vertical-perspective at low zoom and plain
       MERCATOR from z≈12 up. Measured on this app (bow of the ±60° parallel, px): z10 741 → z11 753 →
       z12 0 → z15 0, i.e. flat.
       (#R172) …and the answer for MapLibre is FALSE. #R171 set this to true and pointed the flight sim at
       'globe-true' (vertical-perspective); the cockpit then rendered NOTHING — a white void where the world
       should be. Measured with the flight camera FROZEN (z15.2, pitch 90.6, 9 s settle, same frame, A/B/A/B):
       'globe' draws the full terrain, coastline and sky; 'vertical-perspective' draws no ground at all. Away
       from the sim the same projection renders correctly at z14 with 3-D terrain OFF, and loses roads/labels
       with it ON — so the incompatibility is CURVED PROJECTION × 3-D TERRAIN, and a flight simulator cannot
       give up terrain. Pushing the crossover up instead of naming the projection ('globe' as an explicit
       ['interpolate',…,17,'vertical-perspective',18,'mercator']) blanks it in exactly the same way, so this
       is the regime, not the spelling. Hence: this renderer CAN be a globe, but not at cockpit zoom with a
       DEM on it, and setProjection('globe-true') below refuses rather than blanking the map. */
    globeAllZooms:false,
    /* (#R171) the renderer's true tilt range, in degrees, for the "unlimited tilt" setting to be honest about.
       MEASURED, not assumed: setMaxPitch accepts ≤180 and throws "maxPitch must be less than or equal to 180"
       above it; setMinPitch throws below 0. 0-180 is therefore the whole of camera tilt — straight down,
       through the horizon, to straight up — and anything beyond it is the same direction with the bearing
       turned around (which is exactly how the wrap in js/map-extras.js keeps tilting past the end). */
    tiltRange:[0,180],
    /* (#R171) the eye's own altitude above sea level (see cameraAltitude below) */
    cameraAltitude:true,
    /* (#R172) the engine can READ the viewpoint's position and PUT IT BACK (eyePosition/setEye), which is
       what "tilting must not move the viewpoint" needs: MapLibre's pitch orbits the eye around the map
       centre, so leaning from 78° to 120° swings the eye from +3,385 m to −8,140 m — it goes under the
       world. An engine without this pair cannot honour the unlimited-tilt setting's promise. */
    eyeControl:true };
  /* (#R173) the live custom-layer objects behind layers.addSolid — keyed by layer id */
  const _solids={};
  /* (#R173) a few-millisecond cache of the renderer's projection data — see projectAltitude */
  let _pd=null, _pdAt=0;
  /* ── (#R178) THE ZOOM FLOOR IS OWNED IN ONE PLACE ───────────────────────────────────────
     Two things want to set it and they are not the same want. The APP sets it per projection
     (globe 0, flat 1.2 on desktop) so the world always covers the viewport. The unlimited-tilt
     setting needs ROOM BELOW that: holding the viewpoint on a sphere spends the zoom, and the
     globe's pixel radius carries a 1/cos(centre.lat), so as the look-at point walks poleward
     the zoom the geometry wants runs off the bottom. Measured on the startup view, the app's
     own floor of 0 is what stopped the viewpoint being held past 60° of tilt; MapLibre's real
     floor is −2 (defaultMinZoom) and at −2 the same view holds to 76°, where the ±85.051°
     latitude wall takes over instead — i.e. −2 is exactly enough to make the zoom stop being
     the binding constraint anywhere.
     So the adapter REMEMBERS what the app asked for and applies min(app, −2) only while the
     eye pivot is installed; turning the setting off restores the app's own floor exactly. */
  const TILT_MIN_ZOOM=-2;
  let _appMinZoom=null, _eyePivot=false;
  function _applyZoomFloor(){ const m=_m(); if(!m||!m.setMinZoom) return;
    if(_appMinZoom==null){ try{ _appMinZoom=m.getMinZoom(); }catch(_){ return; } }
    const want=_eyePivot?Math.min(_appMinZoom,TILT_MIN_ZOOM):_appMinZoom;
    try{ if(m.getMinZoom()!==want) m.setMinZoom(want); }catch(_){} }

  /* ═══════════════════════════════════════════════════════════════════════════════════════
     (#R177) WHERE THE CAMERA IS — ONE transcription of the renderer's own geometry.
     ---------------------------------------------------------------------------------------
     #R172-#R176 each wrote this geometry twice: once in the tilt correction and once in the
     thing that measured it. Every round the two copies agreed with each other and disagreed
     with the renderer, so every round reported 0 m and the report came back. #R176's own note
     says "an error cannot be seen with the yardstick that shares it" and then built the new
     yardstick out of the new correction. So: this is the single definition, and the test
     (tests/r177.spec.js) checks it against transform.cameraPosition — the vector MapLibre
     derives by inverting the matrix it actually draws with, which shares no code with it.

     MEASURED on the #R176 build with that ruler, over a real ctrl-drag to 54° of pitch:

         globe z3  Tokyo    eye 8,573 km → 1,948 km altitude     drift 7,115 km
         globe z6  Tokyo        1,072 km →   610 km                    475 km
         globe z10 Tokyo         67.0 km →  39.4 km                     27.6 km
         flat  z6  Tromsø         453 km →   388 km                     64.4 km
         z12 Tokyo             16,522 m → 16,588 m                     193 m

     THE RENDERER HAS TWO CAMERA MODELS, not one, and `globe` owns both (it swaps by zoom —
     #R173's globeness). Transcribed from MapLibre 5.24's _calcMatrices:

       MERCATOR   cameraPosition = [worldPx, worldPx, METRES]. The eye sits c2c/worldSize merc
                  units back along the bearing, and its HEIGHT is that same number times
                  circumferenceAtLatitude(CENTRE) — which is why holding the eye's merc-z
                  constant (what #R176 did) does not hold its altitude: the centre marches
                  north as you tilt and the unit shrinks with cos(centre.lat). That is the
                  64 km at Tromsø, where 3.3° of centre travel is a 16 % change of scale.

       SPHERE     cameraPosition = Ry(lng)·Rx(−lat)·([0,0,1] + Rz(−b)·Rx(p)·[0,0,dg]) in EARTH
                  RADII, with dg = c2c / (worldSize/2π/cos(centre.lat)). The pivot is pinned to
                  the SURFACE — elevation does not enter it at all — so the eye's distance from
                  the Earth's centre is sqrt(1 + dg² + 2·dg·cos p) wherever the centre is.
                  A mercator plane cannot describe this at all, which is the 7,115 km at z3.
     ═══════════════════════════════════════════════════════════════════════════════════════ */
  const GEO_R=6371008.8, GEO_RAD=Math.PI/180, GEO_CIRC=2*Math.PI*GEO_R;
  const gmX=lng=>(180+lng)/360;
  const gmY=lat=>(180-(180/Math.PI)*Math.log(Math.tan(Math.PI/4+lat*GEO_RAD/2)))/360;
  const glngOf=x=>{ const v=x*360-180; return ((v+180)%360+360)%360-180; };
  const glatOf=y=>360/Math.PI*Math.atan(Math.exp((180-y*360)*GEO_RAD))-90;
  /* the Mercator world ends at ±85.051129°; a centre outside it is not a place */
  const GEO_YLO=gmY(85.051129), GEO_YHI=gmY(-85.051129);
  /* glMatrix's vec3.rotateX / vec3.rotateY about the origin — MapLibre's own helpers */
  const grotX=(v,a)=>{ const c=Math.cos(a),s=Math.sin(a); return [v[0], v[1]*c-v[2]*s, v[1]*s+v[2]*c]; };
  const grotY=(v,a)=>{ const c=Math.cos(a),s=Math.sin(a); return [v[2]*s+v[0]*c, v[1], v[2]*c-v[0]*s]; };
  /* IS THE SPHERE ON SCREEN? MapLibre's `globe` is a wrapper holding a vertical-perspective
     transform AND a mercator one, swapping by zoom; `isGlobeRendering` is its own name for
     which is drawing, and the clone handed to transformCameraUpdate carries it. A plain
     mercator transform has no such property, which reads false — correctly. */
  const gSpherical=t=>{ try{ return !!(t&&t.isGlobeRendering); }catch(_){ return false; } };
  /* the canvas-and-fov constant, in pixels; never latitude- or zoom-dependent */
  function gC2C(t,m){ let v; try{ v=t&&t.cameraToCenterDistance; }catch(_){}
    if(isFinite(v)&&v>0) return v;
    try{ const w=m&&m.transform&&m.transform.cameraToCenterDistance; if(isFinite(w)&&w>0) return w; }catch(_){}
    return 1050; }
  /* WHERE THE EYE IS for a camera state {lng,lat,zoom,pitch,bearing,elevation}, as a place:
     {lng, lat, alt in metres above sea level, distance in ground metres to the point it looks
     at}. Pass k = 1 to ask where the eye IS.
     `k` = 2^(z0−z1) asks where a ZOOM of that much would put it, and #R175 settled what that
     means: a zoom is a SIMILARITY about the map point under the centre — the eye AND the point
     it looks at both scale by k — not a dolly towards a target left where it was. The
     difference only shows once something has tilted, because only then is the target off the
     ground: measured at pitch 110, z12 Tokyo, wheel-zooming 2.3 levels with the target held at
     14,099 m, the eye CONVERGED on it (8,373 → 12,955 m — it climbed while zooming in, which
     is #R174's bug exactly). So the altitude scales by k here too, not just the look distance;
     for a pure zoom the solve then returns elevation·k and the eye descends by exactly k. */
  function gEye(cam,c2c,tile,sphere,k){
    k=(isFinite(k)&&k>0)?k:1;
    const p=(cam.pitch||0)*GEO_RAD, b=(cam.bearing||0)*GEO_RAD;
    const world=tile*Math.pow(2,cam.zoom);
    if(!(isFinite(world)&&world>0)) return null;
    if(sphere){
      const dg=k*(c2c*2*Math.PI*Math.cos(cam.lat*GEO_RAD))/world;
      if(!(isFinite(dg)&&dg>0)) return null;
      const u=[-dg*Math.sin(p)*Math.sin(b), -dg*Math.sin(p)*Math.cos(b), 1+dg*Math.cos(p)];
      const E=grotY(grotX(u,-cam.lat*GEO_RAD), cam.lng*GEO_RAD);
      const r=Math.hypot(E[0],E[1],E[2]); if(!(isFinite(r)&&r>0)) return null;
      return { lng:Math.atan2(E[0],E[2])/GEO_RAD, lat:Math.asin(Math.max(-1,Math.min(1,E[1]/r)))/GEO_RAD,
               alt:(r-1)*GEO_R, distance:dg*GEO_R };
    }
    const d=k*c2c/world, circ=GEO_CIRC*Math.cos(cam.lat*GEO_RAD);
    if(!(isFinite(d)&&d>0&&isFinite(circ))) return null;
    const ex=gmX(cam.lng)-d*Math.sin(p)*Math.sin(b), ey=gmY(cam.lat)+d*Math.sin(p)*Math.cos(b);
    /* k multiplies the TARGET's height as well as the look distance — that is what makes the
       zoom a similarity rather than a convergence (see the note above). k = 1 leaves it alone. */
    const alt=k*(+cam.elevation||0)+d*circ*Math.cos(p);
    if(!(isFinite(ex)&&isFinite(ey)&&isFinite(alt))) return null;
    return { lng:glngOf(ex), lat:glatOf(Math.min(GEO_YHI,Math.max(GEO_YLO,ey))), alt, distance:d*circ };
  }
  /* …AND THE INVERSE: the camera state that puts the eye AT `anchor` while looking along
     (pitch, bearing). What carries the change differs between the two models, and neither is
     a choice:
       MERCATOR the look-at target's ELEVATION is free, so the zoom is untouched. One
                subtraction per axis, and the height comes out in metres against the NEW
                centre's parallel — the term #R176 held constant in the wrong unit.
       SPHERE   the pivot is welded to the surface, so that degree of freedom does not exist
                and the LOOK DISTANCE — the zoom — is what a tilt has to spend. It is fully
                determined: |eye| fixes dg, dg and the attitude fix the centre, and the centre
                fixes the zoom. A pure zoom still comes back as the identity, because k·dg is
                just dg at the new scale, so #R175's dolly survives untouched.
     Clamped, never declined: #R173 established that a frame this hook refuses is applied
     verbatim and wipes every correction before it — that is a guaranteed jump.

     (#R178) …and WHAT gets clamped is now the TILT. #R177 clamped the eye's radius — it kept
     the viewpoint's direction and pulled it in towards the surface until the camera came back
     into range — which is still 「視点の位置が変わる」, just continuously: measured on the app's
     OWN STARTUP VIEW (globe z1.7, the zoom every session begins at and the one band #R172-#R177
     never tested) a plain 66° tilt drag moved the viewpoint 3,712 km and dropped the eye from
     24,422 km to 20,709 km, in frame-to-frame steps of 1,184 and 2,529 km. The user chose, when
     told the two cannot both hold: 「視点を優先し、そこで傾きを止める」. So the answer is always
     the EXACT one, and the pitch is the thing that saturates — see gLimitPitch below. */
  const GEO_LATMAX=85.051129*GEO_RAD;
  /* (#R178) WOULD THE RENDERER KEEP THIS CAMERA, OR MOVE IT? — asked of the renderer, never
     modelled. Every previous round's idea of "in range" was a hand-written rule (|lat| ≤ 85.051,
     zoom within [minZoom, maxZoom]) and every one of them was wrong somewhere: MapLibre also
     pulls the centre back so the world keeps covering the viewport (`_latRange` is ±85.051 the
     moment anything calls setMaxBounds(null), which this app does on every projection switch),
     and it zooms IN rather than out when the world would be smaller than the canvas. Measured
     on the flat map at the startup zoom, that box is ±60.4° of latitude — nothing to do with
     85.051° — and holding the eye past ~20° of tilt asked for a centre outside it, so the
     renderer moved the camera and the viewpoint went with it: 17,515 km.
     `applyConstrain` is the renderer's own answer to exactly this question, it is pure (it
     returns a camera, it does not apply one), and both transforms implement it. So the rule is
     simply: a camera is feasible when the renderer hands it back unchanged. */
  function gGuard(t){
    let LL=null; try{ LL=maplibregl.LngLat; }catch(_){}
    if(!(t&&t.applyConstrain&&LL)) return null;
    return (lng,lat,z)=>{
      if(!(isFinite(lng)&&isFinite(lat)&&isFinite(z))||Math.abs(lat)>90) return false;
      try{
        const r=t.applyConstrain(new LL(lng,lat),z);
        if(!(r&&r.center)) return true;
        const dLng=Math.abs((((r.center.lng-lng)%360)+540)%360-180);
        return Math.abs(r.center.lat-lat)<1e-7&&dLng<1e-7&&Math.abs(r.zoom-z)<1e-7;
      }catch(_){ return false; }
    };
  }
  /* one attempt at one pitch. `ok` is the whole feasibility question: does this pitch resolve to
     a camera the renderer can actually hold, with the eye exactly where it was? */
  function gSolveAt(anchor,pitch,bearing,c2c,tile,zoom,sphere,hint,guard){
    const p=(pitch||0)*GEO_RAD, b=(bearing||0)*GEO_RAD, cp=Math.cos(p);
    if(sphere){
      const r=1+anchor.alt/GEO_R; if(!(isFinite(r)&&r>0.2)) return null;
      const cl=Math.cos(anchor.lat*GEO_RAD), sl=Math.sin(anchor.lat*GEO_RAD);
      const E=[cl*Math.sin(anchor.lng*GEO_RAD)*r, sl*r, cl*Math.cos(anchor.lng*GEO_RAD)*r];
      /* modulo, NOT a while-loop: `while(v>π) v-=2π` never terminates on an infinity, and this
         runs inside the render loop where a hang is a frozen map, not an exception */
      const wrap=a=>{ if(!isFinite(a)) return 0; const v=(a+Math.PI)%(2*Math.PI); return (v<0?v+2*Math.PI:v)-Math.PI; };
      const hl=(hint&&isFinite(hint.lat)?hint.lat:0)*GEO_RAD;
      /* GIVEN a look distance, where the centre has to be. Ry spins about the pole and cannot
         touch E_y, so the latitude falls out of that one component; the longitude then follows
         from the other two. Two branches solve the latitude — take the one nearest the camera we
         were handed, so consecutive frames stay on the same branch (a branch flip is a snap).
         `hit` says whether it was reachable at all. */
      const centreFor=(dg,Ev)=>{
        const u=[-dg*Math.sin(p)*Math.sin(b), -dg*Math.sin(p)*Math.cos(b), 1+dg*cp];
        const Ru=Math.hypot(u[1],u[2]); if(!(Ru>1e-12)) return null;
        const th=Math.atan2(u[1],u[2]);
        const raw=Ev[1]/Ru, s=Math.max(-1,Math.min(1,raw)), asn=Math.asin(s);
        /* TWO latitudes satisfy E_y, and picking the wrong one is a snap. #R177 first chose by
           nearness to the proposed centre, which is a HEURISTIC and ties: at pitch 178 the two
           candidates sat 1.586 and 1.553 rad from the hint, the choice flipped between frames,
           and the viewpoint moved 1,553 km in one. So do not guess — build BOTH cameras and
           keep the one whose eye actually lands closer to where the eye is meant to be. That is
           the thing being solved for, so it can neither tie meaningfully nor flip. */
        const build=(latRaw)=>{
          const inRange=Math.abs(latRaw)<=GEO_LATMAX;
          const lat=Math.max(-GEO_LATMAX,Math.min(GEO_LATMAX,latRaw));
          const w=grotX(u,-lat), den=w[0]*w[0]+w[2]*w[2];
          const lng=(den>1e-18)?Math.atan2(w[2]*Ev[0]-w[0]*Ev[2], w[0]*Ev[0]+w[2]*Ev[2])
                              : (hint&&isFinite(hint.lng)?hint.lng*GEO_RAD:0);
          const back=grotY(grotX(u,-lat),lng);            /* the eye this camera really gives */
          const err=Math.hypot(back[0]-Ev[0],back[1]-Ev[1],back[2]-Ev[2]);
          return { lat, lng, err:isFinite(err)?err:Infinity, ok:inRange&&Math.abs(raw)<=1 };
        };
        const A=build(wrap(asn-th)), B=build(wrap(Math.PI-asn-th));
        /* an out-of-range latitude is not a solution at all, so prefer a reachable one even if
           the clamped other happens to score better */
        if(A.ok!==B.ok) return A.ok?A:B;
        return (B.err<A.err)?B:A;
      };
      /* ── NOT EVERY TILT CAN HOLD THE VIEWPOINT ON A SPHERE ──────────────────────────────
         MapLibre's camera is (centre, zoom, pitch, bearing) with the pivot WELDED to the
         surface. Hold the eye and the surface point has to walk away from it along the bearing
         by ψ, where cos ψ = (1 + dg·cos p)/r — which sends it OVER THE POLE, and a globe centre
         past ±85.051° is not expressible (MapLibre clamps it in the vertical-perspective
         transform's own defaultConstrain), while the zoom that goes with it runs off the bottom
         of the scale because the globe's pixel radius carries a 1/cos(centre.lat).

         So "hold the eye" simply runs out of parameterisation at some pitch. MEASURED, per
         projection and zoom, with the app's own minZoom of 0:

             globe  z1.7 (STARTUP)  held to  60°      globe  z9   held to 120°
             globe  z3             held to  82°      globe  z12+ held to 178° (mercator)
             globe  z6             held to 114°      flat   z3+  held to 178°

         #R177 answered this by clamping the eye's RADIUS — same direction, pulled towards the
         surface — which is continuous but is still the viewpoint moving, thousands of km of it.
         Asked to choose, the user chose the viewpoint: 「視点を優先し、そこで傾きを止める」.
         So this returns ONLY exact solutions and `ok` says whether one exists; gLimitPitch
         above finds the largest pitch that still has one. NEVER emit a camera outside the
         renderer's range — an unconstrained solve answered z −0.167 at 85.0511°N for pitch 120
         and the next camera change FROZE the page inside MapLibre's tile cover. */
      const dg=-cp+Math.sqrt(Math.max(0,cp*cp-1+r*r));
      if(!(isFinite(dg)&&dg>1e-12)) return null;
      const c=centreFor(dg,E); if(!c) return null;
      const z=Math.log2(((c2c*2*Math.PI*Math.cos(c.lat))/dg)/tile);
      if(!(isFinite(c.lat)&&isFinite(c.lng)&&isFinite(z))) return null;
      const oLng=c.lng/GEO_RAD, oLat=c.lat/GEO_RAD;
      return { lng:oLng, lat:oLat, zoom:z, elevation:0,
               ok:!!(c.ok&&(guard?guard(oLng,oLat,z):true)) };
    }
    const world=tile*Math.pow(2,zoom); const d=c2c/world;
    if(!(isFinite(d)&&d>0)) return null;
    const tx=gmX(anchor.lng)+d*Math.sin(p)*Math.sin(b), ty=gmY(anchor.lat)-d*Math.sin(p)*Math.cos(b);
    if(!(isFinite(tx)&&isFinite(ty))) return null;
    /* (#R178) the plane has the SAME wall, for the same reason: the look-at point walks away
       from the eye and Mercator ends at ±85.051°. It is only invisible at the zooms #R176/#R177
       tested because d = c2c/worldSize is tiny there — at the startup zoom d is 0.63 of the
       whole world, so measured on the flat map at z1.7 the viewpoint could only be held to 20°.
       `inLat` is that wall; clamping ty and answering anyway is what moved the eye. */
    const inLat=(ty>=GEO_YLO&&ty<=GEO_YHI);
    const lat=glatOf(Math.min(GEO_YHI,Math.max(GEO_YLO,ty))), lng=glngOf(tx);
    const look=d*GEO_CIRC*Math.cos(lat*GEO_RAD);          /* eye→target distance, metres */
    let elevation=anchor.alt-look*cp;
    /* HOW FAR THE TARGET MAY BE FROM SEA LEVEL, in the renderer's own arithmetic. MapLibre
       sizes its frustum from `cameraToCenterDistance + elevation·pixelPerMeter / cos(pitch)`,
       so an elevation worth many thousands of look-distances is a camera it cannot pick tiles
       for — measured, 1,488 km at z12 (89 look-distances) FROZE the page rather than throwing.
       The honest geometry never needs more than one look-distance either side of the eye
       (|elevation − alt| = look·|cos p|), so this only ever binds on a camera that has already
       gone wrong; when it binds the eye is no longer exactly held, which beats a frozen map. */
    const cap=50*Math.abs(look);
    const inCap=!(isFinite(cap)&&cap>0&&Math.abs(elevation)>cap);
    if(!inCap) elevation=Math.sign(elevation)*cap;
    if(!(isFinite(lat)&&isFinite(lng)&&isFinite(elevation))) return null;
    return { lng, lat, elevation, ok:(inLat&&inCap&&(guard?guard(lng,lat,zoom):true)) };
  }
  /* ══ THE TILT IS WHAT SATURATES (#R178) ═════════════════════════════════════════════════
     `gSolveAt` answers exactly or says it cannot. This turns that into the camera to apply:
     the exact solve at the proposed pitch when one exists, and otherwise the exact solve at
     the LARGEST pitch that still has one, handed back with that pitch so the renderer stops
     the tilt there instead of the viewpoint sliding.

     Why a bisection rather than a formula: the wall is where the look-at point reaches
     ±85.051° OR the zoom leaves [minZoom, maxZoom], and which of the two binds depends on the
     bearing, the latitude, the viewport height and the projection. Feasibility is monotone in
     pitch for a fixed anchor (measured: every combination in the table above holds from 0 up
     to one angle and never recovers), so bisecting between a pitch known to work and the one
     asked for lands exactly on the boundary — and AT the boundary the answer is the exact
     solve, which is what makes the tilt come to rest smoothly instead of stepping.

     `floorDeg` is the pitch CURRENTLY ON SCREEN. It is feasible by construction — it is a
     camera this same hook produced — so it is a free lower bracket. When it is not (the first
     frame after a jumpTo, or the flight simulator handing the camera back) the search falls
     back to 0, which always resolves: at pitch 0 the look-at point is directly under the eye
     and the zoom is the one already applied. */
  function gLimitPitch(anchor,pitch,bearing,c2c,tile,zoom,sphere,hint,guard,floorDeg){
    const at=pd=>gSolveAt(anchor,pd,bearing,c2c,tile,zoom,sphere,hint,guard);
    const want=(isFinite(pitch)?pitch:0);
    let lo=(isFinite(floorDeg)?Math.max(0,Math.min(floorDeg,want)):0), best=at(lo);
    if(!(best&&best.ok)){ lo=0; best=at(0); }
    if(!(best&&best.ok)) return at(want);   /* nothing holds at all — the exact answer is still the least wrong */
    /* WALK, do not jump. Feasibility is NOT monotone in pitch: past the horizon the solve comes
       back — at globe z1.7 the eye is holdable to 76.7°, unholdable to about 130°, and holdable
       again beyond that, because a camera "looking up" resolves to a surface point on the FAR
       side of the Earth. Those far solutions are real cameras and the eye is genuinely held in
       them, but they are a different view: accepting one the moment it becomes reachable put
       the tilt from 76.7° straight to 140° in a single frame, which is 「挙動もぎこちない」 in
       its purest form. So only pitches reachable CONTINUOUSLY from the one on screen count.
       Sample the interval first (cheap — a handful of trig calls), stop at the first sample
       that fails, then bisect that last gap for the exact boundary. */
    if(want>lo){
      /* p0 is fixed: the samples must march from the STARTING pitch, not from the
         last accepted one, or the step doubles every iteration and the walk shoots
         past `want` into pitches nobody asked for (measured: a 20° request probed
         past 150° and stopped the tilt at 11.9°). */
      const SAMPLES=24, p0=lo, span=want-p0; let hi=want, gap=false;
      for(let i=1;i<=SAMPLES;i++){
        const pd=p0+span*i/SAMPLES, s=at(pd);
        if(s&&s.ok){ best=s; lo=pd; } else { hi=pd; gap=true; break; }
      }
      if(gap){
        for(let it=0;it<20;it++){
          const mid=(lo+hi)/2, sm=at(mid);
          if(sm&&sm.ok){ best=sm; lo=mid; } else hi=mid;
        }
        best.pitch=lo;                               /* …and STOP the tilt here */
      }
    }
    return best;
  }
  /* The MapLibre adapter — the ONLY implemented renderer in Phase 1. Every method is a 1:1 pass-through. */
  const MapLibreAdapter={ id:'maplibre', capabilities:MAPLIBRE_CAPS,
    flyTo(o){ const m=_m(); if(m) m.flyTo(o); }, easeTo(o){ const m=_m(); if(m) m.easeTo(o); }, jumpTo(o){ const m=_m(); if(m) m.jumpTo(o); },
    fitBounds(b,o){ const m=_m(); if(m) m.fitBounds(b,o); }, setPadding(p){ const m=_m(); if(m) m.setPadding(p); },
    /* (#R172) "what camera shows this box?" — the answer WITHOUT moving, so a caller can fly to it
       itself (widgets fit a whole country that way). A pass-through; null when the engine has no
       such query, and the caller falls back to fitBounds. */
    cameraForBounds(b,o){ const m=_m(); try{ return (m&&m.cameraForBounds)?m.cameraForBounds(b,o):null; }catch(_){ return null; } },
    getPadding(){ const m=_m(); try{ return (m&&m.getPadding)?m.getPadding():null; }catch(_){ return null; } },
    getCamera(){ const m=_m(); if(!m) return null; try{ return { center:m.getCenter(), zoom:m.getZoom(), bearing:m.getBearing(), pitch:m.getPitch() }; }catch(_){ return null; } },
    /* (#R171) three modes now, because MapLibre's "globe" is only a globe SOME of the time:
         'flat'        → mercator
         'globe'       → the zoom-dependent globe (curved when zoomed out, mercator from z≈12) = the app's Globe button
         'globe-true'  → a curved Earth at EVERY zoom
       Unknown values fall back to mercator, exactly as before.
       (#R172) 'globe-true' now REFUSES (returns false, changes nothing) when the engine cannot honour it —
       see capabilities.globeAllZooms. On MapLibre it maps to vertical-perspective, which renders an empty
       white void once 3-D terrain is on, and the flight sim shipped exactly that. A contract method that
       can only be kept some of the time must say no rather than wreck the view; the caller then reports
       honestly instead of the user discovering it as a blank cockpit. */
    setProjection(mode){ const m=_m(); if(!(m&&m.setProjection)) return false;
      if(mode==='globe-true'&&!MAPLIBRE_CAPS.globeAllZooms) return false;
      const spec=(mode==='globe-true')?{type:'vertical-perspective'}:(mode==='globe')?{type:'globe'}:{type:'mercator'};
      try{ m.setProjection(spec); return true; }catch(_){ /* an older renderer may not know vertical-perspective — the plain globe is the closest it has */
        if(mode==='globe-true'){ try{ m.setProjection({type:'globe'}); return true; }catch(__){} } return false; } },
    getProjection(){ const m=_m(); try{ return (m&&m.getProjection)?m.getProjection():null; }catch(_){ return null; } },
    /* (#R173) HOW SPHERICAL IS THE VIEW RIGHT NOW — 0 = a flat plane, 1 = a globe, and everything in
       between while an engine cross-fades. This is NOT the same question as getProjection(): MapLibre's
       `globe` is defined as ['interpolate',['linear'],['zoom'],11,'vertical-perspective',12,'mercator'],
       so the same "globe" spec draws a sphere at z11 and a plane at z12 — the fact that cost #R170–#R172
       three rounds. Anything that has to know whether the horizon is curved (the flight simulator's own
       sky, which MapLibre stops drawing exactly as the sphere takes over) must ask this, not the name.
       The renderer's own transition value when it exposes one, else the projection type as 0/1. */
    globeness(){ const m=_m(); try{ const v=m&&m.style&&m.style.projection&&m.style.projection.transitionState;
        if(typeof v==='number'&&isFinite(v)) return Math.max(0,Math.min(1,v)); }catch(_){}
      try{ const t=(m&&m.getProjection&&m.getProjection()||{}).type; return (t==='mercator'||t==='flat')?0:1; }catch(_){ return 0; } },
    /* (#R171) camera ATTITUDE — bearing / pitch / roll and the tilt limits. The unlimited-tilt setting and
       the flight sim both need these, and both are written against the engine, so they belong in the contract. */
    setBearing(b){ const m=_m(); if(m&&m.setBearing) m.setBearing(b); }, setPitch(p){ const m=_m(); if(m&&m.setPitch) m.setPitch(p); },
    getRoll(){ const m=_m(); try{ return m&&m.getRoll?m.getRoll():0; }catch(_){ return 0; } }, setRoll(r){ const m=_m(); try{ if(m&&m.setRoll) m.setRoll(r); }catch(_){} },
    getMaxPitch(){ const m=_m(); try{ return (m&&m.getMaxPitch)?m.getMaxPitch():60; }catch(_){ return 60; } },
    setMaxPitch(v){ const m=_m(); if(!(m&&m.setMaxPitch)) return false; try{ m.setMaxPitch(v); return true; }catch(_){ return false; } },
    getMinPitch(){ const m=_m(); try{ return (m&&m.getMinPitch)?m.getMinPitch():0; }catch(_){ return 0; } },
    /* (#R178) the ZOOM range, through the contract for the same reason the pitch range is: the
       app sets a floor per projection and the unlimited-tilt setting needs room under it, and
       two owners writing the same renderer property directly is how one silently wins. Setting
       it records the APP's intent; what actually reaches the renderer is _applyZoomFloor's
       min(app, tilt). Reading gives the effective value, which is what a solve must respect. */
    setMinZoom(v){ if(!isFinite(v)) return false; _appMinZoom=v; _applyZoomFloor(); return true; },
    getMinZoom(){ const m=_m(); try{ return (m&&m.getMinZoom)?m.getMinZoom():0; }catch(_){ return 0; } },
    setMaxZoom(v){ const m=_m(); if(!(m&&m.setMaxZoom)||!isFinite(v)) return false; try{ m.setMaxZoom(v); return true; }catch(_){ return false; } },
    getMaxZoom(){ const m=_m(); try{ return (m&&m.getMaxZoom)?m.getMaxZoom():22; }catch(_){ return 22; } },
    zoomRange(){ return [this.getMinZoom(),this.getMaxZoom()]; },
    /* (#R171) THE EYE'S OWN ALTITUDE above sea level, in metres — what the readout option shows.
       MapLibre 5.24 has no public getter for it (getFreeCameraOptions does not exist here; transform
       .getCameraAltitude() returns null), so the adapter derives it from the renderer's own geometry:
       the camera sits `cameraToCenterDistance` PIXELS from the map centre along the view ray, so its
       height above the centre's ground plane is that distance in ground METRES times cos(pitch). The
       metres-per-pixel is measured off the renderer itself (unproject two points 100 px apart at the
       centre row) rather than assumed from the zoom, so it stays true in globe as well as mercator.
       Verified against an independent API: asking calculateCameraOptionsFromTo for an eye 900 m above
       its target reads back as 900.0001 m. Past 90° of pitch the camera really has swung BELOW the
       centre's ground plane, and the negative value it returns says so rather than pretending. */
    cameraAltitude(){ const e=this.eyePosition(); return e?e.alt:null; },
    /* (#R172) WHERE THE VIEWPOINT IS — the same geometry as cameraAltitude, carried all the way to a
       position: {lng, lat, alt, distance}. `distance` is the eye→centre distance in ground metres, i.e.
       the number that fixes the zoom. Needed because "keep the viewpoint still while tilting" (Settings ▸
       unlimited tilt) can only be expressed if the engine can say where the viewpoint IS and put it back.
       The eye sits OPPOSITE the bearing from the map centre, `distance·sin(pitch)` along the ground and
       `distance·cos(pitch)` above it; past 90° of pitch the cosine turns negative because the eye really
       has swung below the centre's ground plane. */
    /* (#R177) …and it now asks gEye, the ONE transcription of the renderer's camera geometry
       (see the block above the adapter). #R171-#R176 all wrote a second copy here, which is
       precisely what hid four rounds of drift: this function was the yardstick for the tilt
       correction AND shared its equation. It is also what feeds the always-on 「視点」 chip and
       the 3-D solid shader's camera, so it was reporting a viewpoint the renderer did not have
       — 8,573 km at globe z3, where the eye is on a SPHERE and this answered on a plane. */
    eyePosition(){ const m=_m(); if(!m) return null;
      try{
        const c=m.getCenter(); if(!c) return null;
        const t=m.transform;
        let tile=512; try{ const v=t&&t.tileSize; if(isFinite(v)&&v>0) tile=v; }catch(_){}
        const cam={ lng:c.lng, lat:c.lat, zoom:m.getZoom()||0, pitch:m.getPitch()||0, bearing:m.getBearing()||0,
                    elevation:(m.getCameraTargetElevation?(+m.getCameraTargetElevation()||0):0) };
        return gEye(cam,gC2C(t,m),tile,gSpherical(t),1);
      }catch(_){ return null; } },
    /* (#R172) …and the inverse: put the viewpoint AT {lng,lat,alt} looking along {bearing,pitch}, keeping
       `distance` (so the zoom does not change). Built on calculateCameraOptionsFromTo — the same call the
       flight simulator has used for its cockpit since #R158 — by aiming a target `distance` away along the
       view direction; the renderer then derives centre+zoom+pitch from eye→target, which is exactly the
       "pivot about the eye" a person means by tilting their head. */
    setEye(o){ const m=_m(); if(!(m&&o&&m.calculateCameraOptionsFromTo)) return false;
      try{
        const r=Math.PI/180, D=Math.max(1,+o.distance||1000), br=(+o.bearing||0)*r, pit=(+o.pitch||0)*r;
        const horiz=D*Math.sin(pit), drop=D*Math.cos(pit);
        /* (#R177) step to the look-at point in MERCATOR units, not on a tangent plane. The old
           110,574 m/° and 111,320·cos(lat) m/° are only true while `distance` is small next to the
           Earth — fine for the flight simulator's few kilometres, wrong by tens of degrees for the
           hundreds of km a zoomed-out caller asks for, and the |lat|>89.5 bail-out then refused
           outright rather than answering. Same conversion the renderer uses; exact at every latitude. */
        const circ=2*Math.PI*6371008.8*Math.cos(o.lat*r);
        const dM=circ?horiz/circ:0;                     /* merc units of ground travel */
        /* north is DECREASING mercator y, east is increasing x */
        const my=(180-(180/Math.PI)*Math.log(Math.tan(Math.PI/4+o.lat*r/2)))/360-dM*Math.cos(br);
        const mx=(180+o.lng)/360+dM*Math.sin(br);
        const YLO=(180-(180/Math.PI)*Math.log(Math.tan(Math.PI/4+85.051129*r/2)))/360;
        const YHI=(180-(180/Math.PI)*Math.log(Math.tan(Math.PI/4-85.051129*r/2)))/360;
        const tLat=360/Math.PI*Math.atan(Math.exp((180-Math.min(YHI,Math.max(YLO,my))*360)*r))-90;
        const tLng=((((mx*360-180)+180)%360+360)%360)-180;
        if(!(isFinite(tLat)&&isFinite(tLng))) return false;
        const cam=m.calculateCameraOptionsFromTo({lng:o.lng,lat:o.lat},o.alt,{lng:tLng,lat:tLat},o.alt-drop);
        if(!(cam&&cam.center&&isFinite(cam.zoom)&&isFinite(cam.center.lat)&&isFinite(cam.center.lng))) return false;
        if(o.roll!=null&&isFinite(o.roll)) cam.roll=o.roll;
        m.jumpTo(cam); return true;
      }catch(_){ return false; } },
    /* (#R172) is the RENDERER running a camera animation of its own right now? Lets a caller tell a user
       gesture apart from a programmatic flyTo/easeTo without reaching for MapLibre's isEasing(). */
    isAnimating(){ const m=_m(); try{ return !!(m&&m.isEasing&&m.isEasing()); }catch(_){ return false; } },
    /* (#R172) does the point the camera looks at STICK TO THE GROUND? MapLibre pins it there by default,
       which is why jumpTo silently drops the `elevation` that calculateCameraOptionsFromTo returns
       (measured: asked for 8,531 m, read back 0 m) — and with the target pinned to the ground the eye's
       own height is a function of zoom and pitch alone, so it cannot be held still while you tilt, and
       beyond 90° of pitch the camera goes UNDER the world. Unpinning it is the precondition for both
       eye-anchored tilt and the flight simulator's above-90° cockpit; it belongs in the contract because
       an engine whose camera is positional to begin with has nothing to unpin. */
    setCenterClamped(on){ const m=_m(); try{ if(m&&m.setCenterClampedToGround){ m.setCenterClampedToGround(!!on); return true; } }catch(_){} return false; },
    /* (#R172) WHAT DOES TILTING PIVOT AROUND?
         'target' → the point on the map you are looking at (MapLibre's own behaviour, the default)
         'eye'    → the viewpoint itself: the camera turns its head and does not move
       Stated as an INTENT, not a mechanism, because engines differ on which one is free: a positional
       camera (Cesium) pivots about the eye natively and would implement 'target' by orbiting, while
       MapLibre is the other way round and needs the compensation below.
       How, and why it is NOT done by correcting the camera afterwards: MapLibre's jumpTo begins with
       stop(), which aborts an in-progress gesture — traced on a twelve-step ctrl-drag, the pitch stream
       went "S49.0 49.0 58.0 67.0 76.0 78.0 …" untouched but "S49.2 E S49.4 49.4 E" once a correcting
       jumpTo was in the loop: the drag died on the first correction. The supported hook is
       `transformCameraUpdate`, which MapLibre calls with the PROPOSED camera before applying it, so the
       correction rides along with the gesture instead of fighting it.
       The geometry: the eye is `dist·sin(pitch)` back along the bearing from the target and
       `dist·cos(pitch)` above it. Holding the eye and the distance (i.e. the zoom) fixed while the pitch
       changes gives the new target directly — and the target's ELEVATION is what carries the difference,
       which is why setCenterClamped(false) is a precondition (MapLibre pins that elevation to the ground
       otherwise, and a pinned target makes the eye's height a function of zoom and pitch alone). */
    /* (#R176) …AND THAT GEOMETRY IS MERCATOR, NOT A TANGENT PLANE — true, and still not enough.
       #R172-#R175 solved this hook in METRES (110,574 m/° of latitude, 111,320·cos(lat) m/° of longitude
       — a plane laid on the map at the centre); #R176 moved it to Mercator units, which is right for one
       of the renderer's two camera models and wrong for the other.

       (#R177) THE RENDERER HAS TWO CAMERA MODELS AND `globe` USES BOTH.
       Measured on the #R176 build with transform.cameraPosition — the vector MapLibre gets by inverting
       the matrix it draws with, which shares no code with any of these corrections:

           globe z3  Tokyo    drift 7,115 km   eye altitude 8,573 km → 1,948 km during one drag
           globe z6  Tokyo            475 km                1,072 km →   610 km
           globe z10 Tokyo           27.6 km                 67.0 km →  39.4 km
           flat  z6  Tromsø          64.4 km                  453 km →   388 km
           z12 Tokyo                   193 m               16,522 m → 16,588 m

       …while the ruler #R176 shipped read 0 m in every one of those cases, because it was the fix's own
       equation. 「高度が明らかに変わっている」 is the middle column, exactly.

       The two errors it was hiding:
         · Below z12 the app is on the SPHERE (MapLibre's `globe` is vertical-perspective there and plain
           mercator above), and a vertical-perspective camera pivots about a point welded to the SURFACE.
           No mercator-plane algebra describes it — hence kilometres, not metres, of drift.
         · Even in mercator, holding the eye's merc-z constant is not holding its ALTITUDE: merc-z is
           metres ÷ circumferenceAtLatitude(CENTRE), and the centre marches 3.3° north over a tilt at
           Tromsø, shrinking that unit 16 %. 453 km × 16 % is the 64 km.

       So the geometry now lives ONCE, in gEye/gSolve above the adapter, transcribed from _calcMatrices for
       both models — and this hook is the caller. What carries a tilt differs by model and is forced, not
       chosen: mercator spends the target's ELEVATION (which is why setCenterClamped(false) is a
       precondition), the sphere has no such freedom — its pivot is on the surface, so the eye's distance
       from the Earth's centre is fixed by dg and pitch alone — and spends the LOOK DISTANCE, i.e. the
       ZOOM. A pure zoom is still the identity in both, so #R175's dolly is untouched.

       How, and why it is NOT done by correcting the camera afterwards: MapLibre's jumpTo begins with
       stop(), which aborts an in-progress gesture — traced on a twelve-step ctrl-drag, the pitch stream
       went "S49.0 49.0 58.0 67.0 76.0 78.0 …" untouched but "S49.2 E S49.4 49.4 E" once a correcting
       jumpTo was in the loop: the drag died on the first correction. `transformCameraUpdate` gets the
       PROPOSED camera before it is applied, so the correction rides along with the gesture. */
    setTiltPivot(mode){ const m=_m(); if(!m) return false;
      if(mode!=='eye'){ try{ m.transformCameraUpdate=null; }catch(_){ return false; }
        _eyePivot=false; _applyZoomFloor(); return true; }
      /* (#R178) give the solve the room the renderer really has before installing the hook —
         see _applyZoomFloor. Done here rather than in the tilt module so an engine whose zoom
         has no such floor simply does nothing, and so the two can never disagree. */
      _eyePivot=true; _applyZoomFloor();
      /* The PROPOSED camera lives in its own running state (MapLibre keeps a `_requestedCameraState` while
         a transformCameraUpdate hook is installed) and does NOT receive our override — so "did this update
         also move the centre?" has to be asked of the proposal's own history, not of the applied map, or
         every frame after the first correction looks like travel. Measured both ways: comparing against the
         applied centre made a tilt drag drift 5.3 km; comparing like with like holds it at 0. */
      let req=null;
      try{
        m.transformCameraUpdate=(t)=>{
          let cur, was;
          try{ cur={ lng:t.center.lng, lat:t.center.lat, zoom:t.zoom, bearing:t.bearing, pitch:t.pitch };
               /* "before" is read from the LIVE map, not from a cache of what we returned last time:
                  MapLibre runs _elevateCameraIfInsideTerrain and its constraints after us, so a cached
                  value slowly diverges from what was actually applied (measured: 392 m of drift over a
                  116° drag, 8 m when read live). */
               const c=m.getCenter();
               was={ lng:c.lng, lat:c.lat, zoom:m.getZoom(), bearing:m.getBearing(), pitch:m.getPitch(),
                     elevation:(m.getCameraTargetElevation?(+m.getCameraTargetElevation()||0):0) };
          }catch(_){ return {}; }
          const last=req; req=cur;
          if(!isFinite(cur.pitch)) return {};
          /* ONLY when the update is not a journey. A flyTo that travels somewhere is asking to look at
             a PLACE, and re-anchoring the eye would land it short — measured: "fly to Paris, pitch 55"
             arrived 4.3 km off centre. Tilt gestures and easeTo({pitch}) leave the centre alone, so this
             one test separates "turn your head" from "go there" without having to guess at easing state
             (drag INERTIA is an easeTo too, and it must stay anchored). */
          /* (#R173) "did the centre move?" has to be asked of BOTH histories. The proposal lives in
             MapLibre's `_requestedCameraState`, which is thrown away and re-cloned from the APPLIED
             transform between interactions — so after one anchored tilt, the next gesture's very first
             proposal carries our corrected centre and looks like a 16 km journey next to the previous
             proposal's. Measured: tilt to 120° (anchored, eye still), then easeTo({pitch:60}) — declined
             as "travel" and the eye climbed 18.6 km. A frame is travel only when the centre differs from
             the previous proposal AND from the camera actually on screen; matching either one means the
             map is where we put it and this is an attitude change, not a journey. */
          const movedFromLast=!!last&&(Math.abs(cur.lng-last.lng)>1e-9||Math.abs(cur.lat-last.lat)>1e-9);
          const movedFromApplied=Math.abs(cur.lng-was.lng)>1e-9||Math.abs(cur.lat-was.lat)>1e-9;
          /* (#R175) HOW FAR THIS UPDATE DOLLIES — the look distance is c2c·metres-per-pixel and
             metres-per-pixel halves per zoom level, so the ratio is 2^(Δzoom) at any latitude.
             (#R177) …and Δ FROM WHAT is the same question #R173 answered for the centre: the
             proposal lives in `_requestedCameraState`, which never receives our overrides. The
             sphere branch below now returns a ZOOM, so the applied zoom diverges from the
             proposed one exactly as the centre already did — and comparing across that gap
             reads every frame of a plain tilt as a 2.3 % zoom (measured on a globe z3 drag:
             cur z3 against was z2.967, six frames running). Ask the proposal's own history;
             fall back to the applied zoom only on the first frame, where the proposal has just
             been cloned from it and the two agree by construction. */
          /* (#R177) …and "Δ from WHAT" has to be asked of BOTH histories, exactly as #R173
             established for the centre. Once the sphere branch returns a zoom, the applied zoom
             and the proposed one diverge, and WHICH of them the proposal was derived from
             depends on the gesture:
               · a DRAG keeps one running `_requestedCameraState`, so the proposal's zoom is
                 unchanged frame to frame while the applied zoom moves under it — the answer is
                 in `last`. (Measured against the applied zoom instead: a plain globe z3 tilt
                 read as a 2.3 % dolly on every frame, cur z3 against was z2.967.)
               · `setPitch`/`jumpTo` re-clone the proposal FROM the applied camera, so the
                 proposal's zoom is the corrected one and `last` is a round stale — the answer
                 is in `was`. (Measured against `last` instead: a 0-180° sweep at globe z4 held
                 the viewpoint only to pitch 2, while a real ctrl-drag held it perfectly.)
             Matching EITHER reference means nobody asked to zoom; only differing from both is
             a real one. */
          const zSame=(!!last&&Math.abs(cur.zoom-last.zoom)<1e-9)||Math.abs(cur.zoom-was.zoom)<1e-9;
          const zRef=zSame?cur.zoom:((last&&isFinite(last.zoom))?last.zoom:was.zoom);
          const k=(isFinite(cur.zoom)&&isFinite(zRef))?Math.pow(2,zRef-cur.zoom):1;
          const zoomed=isFinite(k)&&k>0&&Math.abs(k-1)>1e-12;
          /* (#R177) which of the renderer's two camera models is on screen for THIS proposal */
          const sphere=gSpherical(t);
          let tile=512; try{ const v=t.tileSize; if(isFinite(v)&&v>0) tile=v; }catch(_){}
          const c2c=gC2C(t,m);
          /* (#R177) A STALE TARGET ALTITUDE IS A HAZARD BY ITSELF, whatever this frame decides.
             MapLibre sizes its frustum from `cameraToCenterDistance + elevation·pixelPerMeter`,
             and a target left thousands of look-distances up is the shape of camera that froze
             the renderer. It gets there by inheritance, not by any one solve: a tilt past the
             horizon legitimately wants its mercator target 8,538 km up at z3, and if the frames
             after it DECLINE (nothing to correct) the number survives into a z15 camera where
             it is 7,822 look-distances. `isGlobeRendering` follows the RENDER, so the frame
             that crosses the swap cannot be relied on to clean up either. So bound it here,
             once, against the camera actually on screen — and hand that back on every path
             below, including the ones that otherwise change nothing. */
          let capEl=null;
          if(was.elevation){
            /* against the camera being PROPOSED, not the one being left: 16,373 km is a
               proportionate target at z3 with a 10,570 km look distance and an absurd one at
               z15 with a 2 km one, and the frame that carries it across is exactly the frame
               that declines (at z3/pitch 175 the eye is below the surface, so the sphere solve
               has no answer and rightly says so). Not conditioned on the model either: on the
               sphere the number is inert, so bounding it there costs nothing and saves the
               mercator camera that inherits it. */
            const lookNow=(c2c/(tile*Math.pow(2,cur.zoom)))*GEO_CIRC*Math.cos(cur.lat*GEO_RAD);
            const capNow=50*Math.abs(lookNow);
            if(isFinite(capNow)&&capNow>0&&Math.abs(was.elevation)>capNow) capEl=Math.sign(was.elevation)*capNow;
          }
          const NOOP=()=>(capEl!=null?{ elevation:capEl }:{});
          if(movedFromApplied&&(movedFromLast||!last)){
            /* Travel — a flyTo/pan is asking to look at a PLACE, so the centre is left alone (#R173).
               (#R175) But a journey that also ZOOMS still has to carry the look-at target's altitude
               with it, for the same reason the anchored branch below does: the target is only on the
               ground while nothing has tilted, and a target left at a fixed altitude while the look
               distance shrinks is one the camera converges ON. Wheel zoom is exactly this shape —
               MapLibre zooms around the POINTER, so the centre moves and every frame lands here. */
            /* (#R177) On the SPHERE there is nothing to carry: the pivot is the surface point, so
               the target's elevation moves the camera not at all. Zero it on EVERY such frame,
               zooming or not — a declined frame leaves the previous value in place, and a
               mercator-era one that rode along this way is what froze the renderer (see gSolve).
               Inert here by construction, so it costs nothing. */
            if(sphere) return { elevation:0 };
            if(!zoomed) return NOOP();
            if(!was.elevation) return NOOP();
            /* (#R177) …and bounded by the same rule the anchored branch uses. Unbounded, a
               target altitude carried in from an extreme tilt survives every pan: measured
               16,373 km at z15 — 7,822 look-distances — which is the shape of camera that
               froze the renderer. */
            const look=(c2c/(tile*Math.pow(2,cur.zoom)))*GEO_CIRC*Math.cos(cur.lat*GEO_RAD);
            let el=was.elevation*k;
            const cap=50*Math.abs(look);
            if(isFinite(cap)&&cap>0&&Math.abs(el)>cap) el=Math.sign(el)*cap;
            return isFinite(el)?{ elevation:el }:{};
          }
          /* (#R173) …and it must answer EVERY such update, including the ones that change nothing.
             #R172 returned {} whenever the pitch had not moved since the last frame, and that is what
             「視点の位置は一切変えない」 was still failing on: _applyUpdatedTransform starts from the
             PROPOSED transform — whose centre and elevation never carry our corrections — so a frame
             this hook declines applies the proposal verbatim and wipes every correction before it.
             Traced on a 50°→180° ctrl-drag: eleven frames anchored the eye perfectly at 12,059 m and
             then the twelfth, a repeat of pitch 180 with nothing to do, put the elevation back to 0 and
             dropped the eye to −18,606 m. The same last-frame snap-back moved easeTo({pitch}) by 18.6 km.
             Solving with an unchanged pitch is the IDENTITY (the eye is derived from the applied camera
             and immediately solved back into it), so answering always costs nothing and closes the hole. */
          try{ if(window.__fsCamActive) return NOOP(); }catch(_){}
          /* WHERE THE EYE IS NOW — the applied camera run through the renderer's own geometry, with the
             look distance already scaled by `k` so that a zoom in the same update lands as the DOLLY it
             is (#R175). Both statements the last three rounds traded against each other — "hold the eye
             while the attitude changes" and "a zoom is a dolly" — are this one call. */
          const anchor=gEye(was,c2c,tile,sphere,k);
          if(!anchor) return NOOP();
          /* …and the camera that puts it back there at the NEW attitude. Never declines: #R173 proved a
             refused frame is applied verbatim and wipes every correction before it — that is what the old
             |lat|>89.5 guard did when it produced a 23,152 km single-frame snap at z3 (「挙動もぎこちない」).
             Out-of-range answers are CLAMPED, and `hint` keeps the sphere's two-branch latitude solve on
             the branch nearest the proposal so it cannot flip between frames. */
          /* (#R178) the renderer's own "would you keep this camera?" — see gGuard. Built from
             the PROPOSED transform, so it already knows the projection, the canvas size and the
             zoom range that will be in force when the answer is applied. */
          const guard=gGuard(t);
          const sol=gLimitPitch(anchor,cur.pitch,cur.bearing,c2c,tile,cur.zoom,sphere,cur,guard,was.pitch);
          if(!sol) return NOOP();
          const out={ elevation:sol.elevation };
          /* (#R178) …and the tilt stops where the viewpoint stops being holdable. Only set when
             gLimitPitch actually had to saturate — an untouched pitch must not be re-asserted,
             or every frame would re-apply a value MapLibre already has and the drag would
             fight its own handler. */
          if(sol.pitch!=null&&isFinite(sol.pitch)) out.pitch=sol.pitch;
          /* a real LngLat, not a pair: the renderer hands the override straight to
             Transform.setCenter. Omitted when the solve has no centre to offer — past the reach
             of the sphere's parameterisation the least-moving answer is the proposal's own. */
          if(isFinite(sol.lng)&&isFinite(sol.lat)){
            try{ out.center=new maplibregl.LngLat(sol.lng,sol.lat); }catch(_){ out.center={lng:sol.lng,lat:sol.lat}; }
          }
          /* only the sphere returns a zoom, and only because its pivot leaves no other freedom */
          if(sol.zoom!=null&&isFinite(sol.zoom)) out.zoom=sol.zoom;
          return out;
        };
      }catch(_){ return false; }
      return true; },
    project(ll){ const m=_m(); return m?m.project(ll):null; }, unproject(pt){ const m=_m(); return m?m.unproject(pt):null; },
    /* (#R173) WHERE ON SCREEN IS A POINT THAT IS UP IN THE AIR? project() answers only for the ground,
       and MapLibre's own hit-testing has the same blind spot: queryRenderedFeatures on a fill-extrusion
       answers at the FOOTPRINT, not at the body — measured on an aircraft at 11,003 m with the glyph
       drawn at y=272 and its ground point at y=388, the only pixel that reported a feature was 388, at
       every zoom and in both regimes. So nothing lifted into the air could be hovered or clicked where
       it is drawn. This projects a real (lng, lat, altitude) through the renderer's own matrices —
       transform.getMatrixForModel + the custom-layer projection data, the supported path for placing
       3-D content — so it is right on the globe as well as on the flat map.
       Returns null when the point is behind the camera. */
    projectAltitude(ll,altM){ const m=_m(); if(!m) return null;
      try{
        const t=m.transform; if(!(t&&t.getMatrixForModel&&t.getProjectionDataForCustomLayer)) return null;
        const lng=(ll&&ll.lng!=null)?ll.lng:(ll?ll[0]:0), lat=(ll&&ll.lat!=null)?ll.lat:(ll?ll[1]:0);
        const M=t.getMatrixForModel({lng,lat},+altM||0);           /* model origin = the point itself */
        /* the projection data is per-CAMERA, not per-point, and building it allocates matrices — a
           hover that asks for 600 aircraft would otherwise rebuild it 600 times in one mouse move.
           Held for a few milliseconds, which is less than a frame. */
        const now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
        if(!_pd||now-_pdAt>6){ _pd=t.getProjectionDataForCustomLayer(true); _pdAt=now; }
        const A=(_pd||{}).mainMatrix; if(!(A&&M)) return null;
        const x=M[12],y=M[13],z=M[14];
        const cx=A[0]*x+A[4]*y+A[8]*z+A[12], cy=A[1]*x+A[5]*y+A[9]*z+A[13], cw=A[3]*x+A[7]*y+A[11]*z+A[15];
        if(!(cw>1e-9)||!isFinite(cx)||!isFinite(cy)) return null;   /* behind the camera / degenerate */
        const cv=m.getCanvas(); const W=cv.clientWidth||cv.width, H=cv.clientHeight||cv.height;
        return { x:(cx/cw*0.5+0.5)*W, y:(0.5-cy/cw*0.5)*H };
      }catch(_){ return null; } },
    terrainElevation(ll,o){ const m=_m(); return (m&&m.queryTerrainElevation)?m.queryTerrainElevation(ll,o):null; },
    queryRenderedFeatures(g,o){ const m=_m(); return (m&&m.queryRenderedFeatures)?m.queryRenderedFeatures(g,o):[]; },
    hasSource(id){ const m=_m(); return !!(m&&m.getSource(id)); }, addSource(id,d){ const m=_m(); if(m&&!m.getSource(id)) m.addSource(id,d); },
    setSourceData(id,data){ const m=_m(); const s=m&&m.getSource(id); if(s&&s.setData) s.setData(data); }, removeSource(id){ const m=_m(); try{ if(m&&m.getSource(id)) m.removeSource(id); }catch(_){} },
    hasLayer(id){ const m=_m(); return !!(m&&m.getLayer(id)); }, addLayer(d,b){ const m=_m(); if(m&&!m.getLayer(d.id)) m.addLayer(d,b); }, removeLayer(id){ const m=_m(); try{ if(m&&m.getLayer(id)) m.removeLayer(id); }catch(_){} },
    setVisible(id,v){ const m=_m(); if(m&&m.getLayer(id)) m.setLayoutProperty(id,'visibility',v?'visible':'none'); }, isVisible(id){ const m=_m(); if(!(m&&m.getLayer(id))) return false; try{ return m.getLayoutProperty(id,'visibility')!=='none'; }catch(_){ return true; } },
    setPaint(id,p,v){ const m=_m(); if(m&&m.getLayer(id)) m.setPaintProperty(id,p,v); }, setLayout(id,p,v){ const m=_m(); if(m&&m.getLayer(id)) m.setLayoutProperty(id,p,v); },
    setOpacity(id,v){ const m=_m(); if(!(m&&m.getLayer(id))) return; let t=''; try{ t=m.getLayer(id).type; }catch(_){} const p={raster:'raster-opacity',fill:'fill-opacity',line:'line-opacity',circle:'circle-opacity',symbol:'icon-opacity','fill-extrusion':'fill-extrusion-opacity',heatmap:'heatmap-opacity'}[t]; if(p) m.setPaintProperty(id,p,v); },
    on(e,c){ const m=_m(); if(m) m.on(e,c); }, off(e,c){ const m=_m(); if(m) m.off(e,c); }, once(e,c){ const m=_m(); if(m) m.once(e,c); },
    /* (#R160) Phase-2 contract broadening — the common camera getters, zoom controls, render + feature-state ops
       that call sites still reach for on the raw map. Each is a 1:1 pass-through (byte-identical behaviour), so
       adopting them anywhere is safe, and a future adapter (Cesium/Earth) only has to implement these. */
    getZoom(){ const m=_m(); return m?m.getZoom():null; }, getCenter(){ const m=_m(); return m?m.getCenter():null; },
    getBearing(){ const m=_m(); return m?m.getBearing():0; }, getPitch(){ const m=_m(); return m?m.getPitch():0; }, getBounds(){ const m=_m(); return m?m.getBounds():null; },
    zoomTo(z,o){ const m=_m(); if(m) m.zoomTo(z,o); }, zoomIn(o){ const m=_m(); if(m) m.zoomIn(o); }, zoomOut(o){ const m=_m(); if(m) m.zoomOut(o); }, stop(){ const m=_m(); if(m&&m.stop) m.stop(); },
    resize(){ const m=_m(); if(m&&m.resize) m.resize(); }, triggerRepaint(){ const m=_m(); if(m&&m.triggerRepaint) m.triggerRepaint(); }, getCanvas(){ const m=_m(); return (m&&m.getCanvas)?m.getCanvas():null; },
    setFeatureState(f,s){ const m=_m(); if(m&&m.setFeatureState) m.setFeatureState(f,s); }, removeFeatureState(f,k){ const m=_m(); if(m&&m.removeFeatureState){ if(k!==undefined) m.removeFeatureState(f,k); else m.removeFeatureState(f); } },
    /* (#R161) Phase-3 contract broadening — everything a self-contained OVERLAY subsystem needs so it
       can be written against the engine alone: readiness, the drawing surface's container + pixel size,
       the cursor, per-LAYER pointer events (hover/click on a rendered feature), and paint read-back.
       All 1:1 pass-throughs, so adopting them is behaviour-neutral; a future Cesium/Earth adapter only
       has to implement this list to inherit the whole news-pin layer. */
    styleReady(){ const m=_m(); try{ return !!(m&&m.isStyleLoaded&&m.isStyleLoaded()); }catch(_){ return false; } },
    /* (#R170) canDraw — "the style is PARSED, so addSource/addLayer are safe" — deliberately DISTINCT from
       styleReady ("everything, including every tile, has settled"). Overlay subsystems want the former;
       only code that must wait for a quiet frame (screenshots, paint sampling) wants the latter. Making a
       renderer distinguish the two is a hard requirement of the contract now, not an implementation detail:
       MapLibre answers it from the parsed-style flag, a Cesium/Earth adapter from its own scene readiness. */
    canDraw(){ try{ return !!(window.IntMapCanDraw&&window.IntMapCanDraw()); }catch(_){ return this.styleReady(); } },
    /* (#R170) 3-D EXTRUSION — real-scale volumes standing in the air (base/height in METRES above the
       ground plane). Needed by the Measure ▸ 3-D volume tool; a future Earth adapter maps it onto its own
       primitive. Kept as its own contract entry (not just "a fill layer") because an engine without real
       metric extrusion must be able to say so via capabilities.extrusion3d. */
    addExtrusion(d,before){ const m=_m(); if(!m||m.getLayer(d.id)) return false;
      try{ m.addLayer(Object.assign({type:'fill-extrusion'},d), (before&&m.getLayer(before))?before:undefined); return true; }catch(_){ return false; } },
    setExtrusionRange(id,baseM,topM){ const m=_m(); if(!(m&&m.getLayer(id))) return false;
      try{ m.setPaintProperty(id,'fill-extrusion-base',baseM); m.setPaintProperty(id,'fill-extrusion-height',topM); return true; }catch(_){ return false; } },
    /* (#R173) A CLOSED, FILLED BODY — distinct from addExtrusion, because an extrusion is a lid and
       walls and can express neither a floor nor an interior. Asked for as an intent (a solid between
       two altitudes over a footprint); MapLibre answers it with a `custom` layer that draws the whole
       prism as one mesh (js/solid3d.js), a Cesium-class engine would answer with its own primitive,
       and an engine that cannot must say so via capabilities.solid3d. */
    addSolid(id,before){ const m=_m(); if(!m||m.getLayer(id)) return false;
      try{ if(!(window.IntMapModules&&window.IntMapModules.solid3d)) return false;
        /* the mesh is written in GLSL 3.00 with 32-bit indices. MapLibre 5 still transpiles ITS own
           shaders down to WebGL1, so a context without WebGL2 is possible — say no there and the
           caller falls back to the open shell rather than drawing nothing. */
        const cv=m.getCanvas&&m.getCanvas(); if(!(cv&&cv.getContext('webgl2'))) return false;
        const L=(_solids[id]||(_solids[id]=window.IntMapModules.solid3d().makeLayer(id)));
        m.addLayer(L,(before&&m.getLayer(before))?before:undefined); return true; }catch(_){ return false; } },
    setSolid(id,o){ const L=_solids[id]; if(!L) return false;
      try{ /* the eye is what makes the absorption an absorption — see the shader's 1/|n·v| */
        if(o&&!o.eye){ const e=this.eyePosition(); if(e) o=Object.assign({},o,{eye:e}); }
        L._set(o); return true; }catch(_){ return false; } },
    removeSolid(id){ const m=_m(); try{ if(m&&m.getLayer(id)) m.removeLayer(id); }catch(_){} delete _solids[id]; return true; },
    /* (#R171) INPUT — hand the drag gesture to a tool for the length of a stroke. A tool that traces a
       shape has to stop the renderer panning underneath it; #R170's DrawTool reached straight for
       map.dragPan for this, which is precisely the kind of call a renderer-independent tool cannot make.
       Named for the intent ("the tool owns the drag now"), not for MapLibre's handler objects. */
    setDragPan(on){ const m=_m(); try{ if(m&&m.dragPan){ on?m.dragPan.enable():m.dragPan.disable(); return true; } }catch(_){} return false; },
    getContainer(){ const m=_m(); return (m&&m.getContainer)?m.getContainer():null; },
    getSize(){ const m=_m(); if(!m) return {width:0,height:0}; try{ const c=m.getContainer(); const cv=m.getCanvas&&m.getCanvas();
      return { width:(c&&c.clientWidth)||(cv&&cv.width)||0, height:(c&&c.clientHeight)||(cv&&cv.height)||0 }; }catch(_){ return {width:0,height:0}; } },
    setCursor(c){ const m=_m(); try{ const cv=m&&m.getCanvas&&m.getCanvas(); if(cv) cv.style.cursor=c||''; }catch(_){} },
    getPaint(id,p){ const m=_m(); try{ return (m&&m.getLayer(id))?m.getPaintProperty(id,p):undefined; }catch(_){ return undefined; } },
    onLayer(e,layer,c){ const m=_m(); if(m) m.on(e,layer,c); }, offLayer(e,layer,c){ const m=_m(); if(m) m.off(e,layer,c); },
    onceLayer(e,layer,c){ const m=_m(); if(m&&m.once) m.once(e,layer,c); },
    /* ══ (#R178) THE REST OF THE SURFACE ════════════════════════════════════════════════════
       「MapLibre依存脱却作業を完了させて。」 An AST sweep (scripts/engine-coupling.mjs) counted
       what the app still reaches for directly: 2,037 references across 31 files and 86 distinct
       APIs. #R152-#R177 grew the contract as each round needed it, which covered the popular
       half; everything below is the remainder, so that no file has to touch the renderer for
       ANY reason. Each entry is a 1:1 pass-through, so adopting it is behaviour-neutral, and a
       Cesium adapter now has one list to implement rather than a moving target.
       ---------------------------------------------------------------------------------------
       LAYERS & SOURCES */
    getLayer(id){ const m=_m(); try{ return (m&&m.getLayer)?m.getLayer(id):null; }catch(_){ return null; } },
    getLayout(id,p){ const m=_m(); try{ return (m&&m.getLayer(id))?m.getLayoutProperty(id,p):undefined; }catch(_){ return undefined; } },
    moveLayer(id,before){ const m=_m(); try{ if(m&&m.getLayer(id)) m.moveLayer(id,(before&&m.getLayer(before))?before:undefined); }catch(_){} },
    setFilter(id,f){ const m=_m(); try{ if(m&&m.getLayer(id)) m.setFilter(id,f); }catch(_){} },
    getFilter(id){ const m=_m(); try{ return (m&&m.getLayer(id))?m.getFilter(id):null; }catch(_){ return null; } },
    getFeatureState(f){ const m=_m(); try{ return (m&&m.getFeatureState)?m.getFeatureState(f):null; }catch(_){ return null; } },
    querySourceFeatures(src,params){ const m=_m(); try{ return (m&&m.querySourceFeatures)?m.querySourceFeatures(src,params):[]; }catch(_){ return []; } },
    /* an IMAGE source's picture, swapped without rebuilding the source — the wind field and the
       GIBS composites repaint this way. Named for the intent; MapLibre calls it updateImage. */
    updateImageSource(id,o){ const m=_m(); try{ const s=m&&m.getSource(id); if(s&&s.updateImage){ s.updateImage(o); return true; } }catch(_){} return false; },
    /* STYLE-LEVEL FURNITURE — the sky, the light, the terrain attachment and the sprite atlas.
       All of them are "the scene", not "a layer", which is why they were never in layers.*. */
    getStyle(){ const m=_m(); try{ return (m&&m.getStyle)?m.getStyle():null; }catch(_){ return null; } },
    setLight(l){ const m=_m(); try{ if(m&&m.setLight) m.setLight(l); }catch(_){} },
    setSky(s){ const m=_m(); try{ if(m&&m.setSky) m.setSky(s); }catch(_){} },
    getSky(){ const m=_m(); try{ return (m&&m.getSky)?m.getSky():null; }catch(_){ return null; } },
    setTerrain(t){ const m=_m(); try{ if(m&&m.setTerrain) m.setTerrain(t); return true; }catch(_){ return false; } },
    getTerrain(){ const m=_m(); try{ return (m&&m.getTerrain)?m.getTerrain():null; }catch(_){ return null; } },
    addImage(id,img,o){ const m=_m(); try{ if(m&&m.addImage&&!m.hasImage(id)){ m.addImage(id,img,o); return true; } }catch(_){} return false; },
    hasImage(id){ const m=_m(); try{ return !!(m&&m.hasImage&&m.hasImage(id)); }catch(_){ return false; } },
    removeImage(id){ const m=_m(); try{ if(m&&m.hasImage&&m.hasImage(id)) m.removeImage(id); }catch(_){} },
    /* CAMERA leftovers */
    setCenter(c){ const m=_m(); if(m&&m.setCenter) m.setCenter(c); },
    panBy(off,o){ const m=_m(); if(m&&m.panBy) m.panBy(off,o); },
    setMaxBounds(b){ const m=_m(); try{ if(m&&m.setMaxBounds) m.setMaxBounds(b); }catch(_){} },
    setRenderWorldCopies(v){ const m=_m(); try{ if(m&&m.setRenderWorldCopies) m.setRenderWorldCopies(v); }catch(_){} },
    /* "what camera looks FROM here TO there" — the flight simulator's cockpit and the drone
       navigator both fly by asking this rather than by setting a pitch (#R158). */
    cameraFromTo(from,fromAlt,to,toAlt){ const m=_m(); try{ return (m&&m.calculateCameraOptionsFromTo)?m.calculateCameraOptionsFromTo(from,fromAlt,to,toAlt):null; }catch(_){ return null; } },
    /* THE WORLD'S SIZE IN PIXELS at the current zoom — the one number that converts a screen
       distance to a map distance without a round trip through unproject. Two callers derive a
       metres-per-pixel from it; both reached into transform.worldSize, which is a private field
       of a MapLibre class and the single most engine-specific thing left in js/. */
    worldSize(){ const m=_m(); try{ const v=m&&m.transform&&m.transform.worldSize; if(isFinite(v)&&v>0) return v; }catch(_){}
      try{ let t=512; const tr=m&&m.transform; if(tr&&isFinite(tr.tileSize)&&tr.tileSize>0) t=tr.tileSize;
           const z=m&&m.getZoom?m.getZoom():0; const v=t*Math.pow(2,z); return isFinite(v)?v:0; }catch(_){ return 0; } },
    getCanvasContainer(){ const m=_m(); try{ return (m&&m.getCanvasContainer)?m.getCanvasContainer():null; }catch(_){ return null; } },
    /* INPUT — the whole gesture set, by NAME rather than by MapLibre's handler objects. The
       flight simulator suspends all of them for the length of a flight and restores them after;
       it did that by indexing map[handlerName], which is the shape of call an engine swap
       cannot survive. */
    setGesture(name,on){ const m=_m(); try{ const h=m&&m[name]; if(h&&h.enable&&h.disable){ on?h.enable():h.disable(); return true; } }catch(_){} return false; },
    gestures(){ return ['dragPan','dragRotate','scrollZoom','touchZoomRotate','keyboard','doubleClickZoom','boxZoom','touchPitch']; },
    setZoomRate(r,wheel){ const m=_m(); try{ const s=m&&m.scrollZoom; if(!s) return false;
      if(wheel){ if(s.setWheelZoomRate) s.setWheelZoomRate(r); } else if(s.setZoomRate) s.setZoomRate(r); return true; }catch(_){ return false; } },
    /* RENDERER-OWNED UI OBJECTS. A popup and a marker are DOM anchored to a map position, which
       is a thing every engine has and no two spell alike; handing back the renderer's own object
       keeps every existing call site working while making the constructor swappable. */
    popup(o){ try{ return new maplibregl.Popup(o); }catch(_){ return null; } },
    marker(o){ try{ return new maplibregl.Marker(o); }catch(_){ return null; } },
    lngLat(lng,lat){ try{ return new maplibregl.LngLat(lng,lat); }catch(_){ return {lng,lat}; } },
    /* a custom tile SCHEME (weather composites, the elevation-tiles proxy). MapLibre calls these
       protocols; the contract calls them what they are. */
    addProtocol(name,fn){ try{ if(maplibregl&&maplibregl.addProtocol){ maplibregl.addProtocol(name,fn); return true; } }catch(_){} return false; },
    /* A SECOND VIEW of the same world — the compare pane, the flight simulator's minimap and the
       geo-guessing game each build one. They did it with `new maplibregl.Map(...)`, i.e. the one
       call that names the engine outright. `createView` keeps the ownership (the caller still
       holds and destroys it) while leaving the constructor to the adapter. */
    createView(o){ try{ return new maplibregl.Map(o); }catch(_){ return null; } },
    /* GLOBAL TUNING — how many tile images may be in flight at once. Not per-map, which is why
       it is here and not on the camera. */
    setImageConcurrency(n){ try{ if(maplibregl&&maplibregl.config){ maplibregl.config.MAX_PARALLEL_IMAGE_REQUESTS=n; return true; } }catch(_){} return false; },
    raw(){ return _m(); } };
  /* Cesium CONTRACT — declared capabilities only; no adapter/SDK/keys yet. Registering a real adapter later
     (IntMapGeoEngine.use(cesiumAdapter)) is all that Phase 2+ needs; nothing here loads Cesium. */
  const CESIUM_CONTRACT={ id:'cesium', implemented:false, capabilities:{ engine:'cesium', globe:true, flat:false, terrain3d:true, freeCamera:true, pitchBeyond90:true, rasterLayers:true, vectorLayers:true, geojson:true, terrainElevation:true, markers:true, opacity:true, projection:true, extrusion3d:true,
    /* (#R171) a Cesium-class engine is curved at every zoom by construction, has no pitch ceiling of its
       own, and knows its camera's altitude natively — the three things this round had to ask MapLibre for.
       (#R172) …and its camera is positional to begin with (position + orientation), so eyeControl is free. */
    globeAllZooms:true, tiltRange:[0,180], cameraAltitude:true, eyeControl:true, solid3d:true } };
  let _adapter=MapLibreAdapter;
  return {
    id(){ return _adapter&&_adapter.id; }, capabilities(){ return _adapter&&_adapter.capabilities; }, can(f){ const c=_adapter&&_adapter.capabilities; return !!(c&&c[f]); },
    adapter(){ return _adapter; }, use(a){ if(a&&a.id) _adapter=a; return _adapter; }, contracts(){ return { maplibre:MAPLIBRE_CAPS, cesium:CESIUM_CONTRACT }; },
    camera:{ flyTo:o=>_adapter.flyTo(o), easeTo:o=>_adapter.easeTo(o), jumpTo:o=>_adapter.jumpTo(o), fitBounds:(b,o)=>_adapter.fitBounds(b,o), setPadding:p=>_adapter.setPadding(p), get:()=>_adapter.getCamera(), setProjection:mo=>_adapter.setProjection(mo),
      /* (#R160) camera getters + zoom controls so call sites read/drive the camera through the engine, not the raw map */
      getZoom:()=>_adapter.getZoom(), getCenter:()=>_adapter.getCenter(), getBearing:()=>_adapter.getBearing(), getPitch:()=>_adapter.getPitch(), getBounds:()=>_adapter.getBounds(),
      zoomTo:(z,o)=>_adapter.zoomTo(z,o), zoomIn:o=>_adapter.zoomIn(o), zoomOut:o=>_adapter.zoomOut(o), stop:()=>_adapter.stop(),
      /* (#R172) the camera that would show a box, and the current padding — both read-only */
      forBounds:(b,o)=>_adapter.cameraForBounds?_adapter.cameraForBounds(b,o):null, getPadding:()=>_adapter.getPadding?_adapter.getPadding():null,
      /* (#R171) attitude + tilt limits + the projection spec read-back + the eye's altitude */
      getProjection:()=>_adapter.getProjection(),
      /* (#R173) 0 = flat, 1 = a sphere — see the adapter; the projection's NAME does not answer this */
      globeness:()=>_adapter.globeness?_adapter.globeness():0,
      setBearing:b=>_adapter.setBearing(b), setPitch:p=>_adapter.setPitch(p), getRoll:()=>_adapter.getRoll(), setRoll:r=>_adapter.setRoll(r),
      getMaxPitch:()=>_adapter.getMaxPitch(), setMaxPitch:v=>_adapter.setMaxPitch(v), getMinPitch:()=>_adapter.getMinPitch(),
      /* (#R178) the zoom range — set it here, never on the renderer, so the unlimited-tilt floor
         and the projection's own floor cannot overwrite one another */
      setMinZoom:v=>_adapter.setMinZoom?_adapter.setMinZoom(v):false, getMinZoom:()=>_adapter.getMinZoom?_adapter.getMinZoom():0,
      setMaxZoom:v=>_adapter.setMaxZoom?_adapter.setMaxZoom(v):false, getMaxZoom:()=>_adapter.getMaxZoom?_adapter.getMaxZoom():22,
      zoomRange:()=>_adapter.zoomRange?_adapter.zoomRange():[0,22],
      /* the renderer's own tilt ceiling, so the UI never offers a limit the engine cannot honour */
      tiltRange:()=>{ const c=_adapter.capabilities; return (c&&c.tiltRange)?c.tiltRange.slice():[0,60]; },
      altitude:()=>_adapter.cameraAltitude(),
      /* (#R172) the VIEWPOINT itself — read it, put it back, and tell a gesture from an animation */
      eye:()=>_adapter.eyePosition?_adapter.eyePosition():null,
      setEye:o=>_adapter.setEye?_adapter.setEye(o):false,
      setCenterClamped:v=>_adapter.setCenterClamped?_adapter.setCenterClamped(v):false,
      setTiltPivot:mo=>_adapter.setTiltPivot?_adapter.setTiltPivot(mo):false,
      isAnimating:()=>_adapter.isAnimating?_adapter.isAnimating():false,
      /* (#R178) the remainder of the camera surface — see the adapter block */
      setCenter:c=>_adapter.setCenter(c), panBy:(o,opt)=>_adapter.panBy(o,opt),
      setMaxBounds:b=>_adapter.setMaxBounds(b), setRenderWorldCopies:v=>_adapter.setRenderWorldCopies(v),
      fromTo:(f,fa,t,ta)=>_adapter.cameraFromTo?_adapter.cameraFromTo(f,fa,t,ta):null },
    coords:{ project:ll=>_adapter.project(ll), unproject:pt=>_adapter.unproject(pt), terrainElevation:(ll,o)=>_adapter.terrainElevation(ll,o), queryRenderedFeatures:(g,o)=>_adapter.queryRenderedFeatures(g,o),
      /* (#R173) the screen position of a point AT ALTITUDE — what picking anything lifted needs */
      projectAltitude:(ll,a)=>_adapter.projectAltitude?_adapter.projectAltitude(ll,a):null,
      /* (#R178) features already in a source's tiles (not necessarily drawn), the world's pixel
         size (the metres-per-pixel two callers were deriving from transform.worldSize), and a
         renderer position object */
      querySourceFeatures:(s,p)=>_adapter.querySourceFeatures?_adapter.querySourceFeatures(s,p):[],
      worldSize:()=>_adapter.worldSize?_adapter.worldSize():0,
      lngLat:(lng,lat)=>_adapter.lngLat?_adapter.lngLat(lng,lat):{lng,lat} },
    /* (#R161) has the renderer fully settled (style parsed AND every tile in)? Use canDraw() below for the
       far more common question "may I add a layer now" — (#R170) they are NOT the same, and answering the
       second with the first is what made freshly-ticked layers appear seconds late. */
    /* (#R178) IS THERE A RENDERER AT ALL YET? A NEW question, and it only became one this round:
       while the engine was built inside map.on('load'), "IntMapGeoEngine exists" and "the map exists"
       were the same fact, and callers waited by polling for the former. The engine is imported before
       the map is constructed now, so they are two facts — and the tilt setting, which polls for the
       engine and then pushes the saved ceiling at it, silently pushed it at nothing (measured: the
       ceiling read back 78 after a reload instead of 180). Distinct from ready()/canDraw(), which ask
       about the STYLE; this asks whether the renderer object is there to be asked. */
    hasRenderer:()=>{ try{ return !!_adapter.raw(); }catch(_){ return false; } },
    ready:()=>_adapter.styleReady(),
    canDraw:()=>_adapter.canDraw(),
    layers:{ hasSource:id=>_adapter.hasSource(id), addSource:(id,d)=>_adapter.addSource(id,d), setSourceData:(id,d)=>_adapter.setSourceData(id,d), removeSource:id=>_adapter.removeSource(id), has:id=>_adapter.hasLayer(id), add:(d,b)=>_adapter.addLayer(d,b), remove:id=>_adapter.removeLayer(id), setVisible:(id,v)=>_adapter.setVisible(id,v), isVisible:id=>_adapter.isVisible(id), setPaint:(id,p,v)=>_adapter.setPaint(id,p,v), setLayout:(id,p,v)=>_adapter.setLayout(id,p,v), setOpacity:(id,v)=>_adapter.setOpacity(id,v),
      /* (#R170) real-scale 3-D volumes (metres above ground) */
      addExtrusion:(d,b)=>_adapter.addExtrusion(d,b), setExtrusionRange:(id,a,b)=>_adapter.setExtrusionRange(id,a,b),
      /* (#R173) a CLOSED body (floor + filled interior), which an extrusion cannot be */
      addSolid:(id,b)=>_adapter.addSolid?_adapter.addSolid(id,b):false, setSolid:(id,o)=>_adapter.setSolid?_adapter.setSolid(id,o):false,
      removeSolid:id=>_adapter.removeSolid?_adapter.removeSolid(id):false,
      /* (#R160) feature-state (hover/selection highlighting) through the engine */
      setFeatureState:(f,s)=>_adapter.setFeatureState(f,s), removeFeatureState:(f,k)=>_adapter.removeFeatureState(f,k),
      /* (#R161) read a paint property back (theme code needs to know the current value) */
      getPaint:(id,p)=>_adapter.getPaint(id,p),
      /* (#R178) the rest of the layer surface — see the adapter block */
      get:id=>_adapter.getLayer(id), getLayout:(id,p)=>_adapter.getLayout(id,p),
      move:(id,before)=>_adapter.moveLayer(id,before),
      setFilter:(id,f)=>_adapter.setFilter(id,f), getFilter:id=>_adapter.getFilter(id),
      getFeatureState:f=>_adapter.getFeatureState(f),
      updateImage:(id,o)=>_adapter.updateImageSource(id,o) },
    /* (#R178) THE SCENE rather than a layer — sky, light, terrain attachment, sprite atlas and
       the parsed style itself. Separate from layers.* because an engine can have all of these
       without having a "layer" concept at all. */
    scene:{ getStyle:()=>_adapter.getStyle(), setLight:l=>_adapter.setLight(l),
      setSky:s=>_adapter.setSky(s), getSky:()=>_adapter.getSky(),
      setTerrain:t=>_adapter.setTerrain(t), getTerrain:()=>_adapter.getTerrain(),
      addImage:(id,img,o)=>_adapter.addImage(id,img,o), hasImage:id=>_adapter.hasImage(id), removeImage:id=>_adapter.removeImage(id),
      addProtocol:(n,fn)=>_adapter.addProtocol(n,fn), setImageConcurrency:n=>_adapter.setImageConcurrency(n) },
    /* (#R178) RENDERER-OWNED UI + a SECOND VIEW. `new maplibregl.Popup/Marker/Map` were the last
       places the engine was named outright outside this file. */
    ui:{ popup:o=>_adapter.popup(o), marker:o=>_adapter.marker(o), createView:o=>_adapter.createView(o) },
    /* (#R160/#R161) render surface — resize / repaint / canvas / container + size / cursor */
    render:{ resize:()=>_adapter.resize(), triggerRepaint:()=>_adapter.triggerRepaint(), canvas:()=>_adapter.getCanvas(),
      container:()=>_adapter.getContainer(), size:()=>_adapter.getSize(), setCursor:c=>_adapter.setCursor(c),
      /* (#R178) the element gestures are dispatched on — NOT the canvas: MapLibre stacks markers
         and the attribution over it, and a synthetic pointer event has to land on the same node
         the renderer listens to. */
      canvasContainer:()=>_adapter.getCanvasContainer() },
    /* (#R171) gesture ownership — a drawing tool suspends the renderer's own pan for the stroke */
    /* (#R178) …and now the whole gesture set by NAME, because the flight simulator suspends all
       of them for a flight and was indexing map[handlerName] to do it. */
    input:{ setDragPan:on=>_adapter.setDragPan(on),
      set:(name,on)=>_adapter.setGesture(name,on), names:()=>_adapter.gestures(),
      setAll:on=>{ let n=0; _adapter.gestures().forEach(g=>{ if(_adapter.setGesture(g,on)) n++; }); return n; },
      setZoomRate:(r,wheel)=>_adapter.setZoomRate(r,wheel) },
    events:{ on:(e,c)=>_adapter.on(e,c), off:(e,c)=>_adapter.off(e,c), once:(e,c)=>_adapter.once(e,c),
      /* (#R161) pointer events scoped to a rendered LAYER (hover/click a feature) */
      onLayer:(e,l,c)=>_adapter.onLayer(e,l,c), offLayer:(e,l,c)=>_adapter.offLayer(e,l,c),
      onceLayer:(e,l,c)=>_adapter.onceLayer?_adapter.onceLayer(e,l,c):null },
    raw(){ return _adapter.raw(); }
  };
})();
