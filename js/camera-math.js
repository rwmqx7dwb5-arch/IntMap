/* ============================================================================
 *  IntMap · CAMERA GEOMETRY — where the eye is, and how far it may look  (#R177, moved #R322)
 * ----------------------------------------------------------------------------
 *  ONE transcription of the renderer's own geometry: the mercator projection, the eye position
 *  for a camera, the pitch that saturates, and how far in a zoom may go while looking up on a
 *  sphere. #R172–#R176 each wrote this twice — once in the correction and once in the thing that
 *  measured it — and every round the two copies agreed with each other and disagreed with the
 *  renderer. The header inside the first block is that story; it moved here with the code.
 *
 *  ⚠ WHY IT IS ITS OWN FILE NOW. Not tidiness: js/geo-engine.js is part of the SHELL, and
 *  tests/r168-checks.test.mjs holds the shell under a line ceiling that only ever goes DOWN. #R322
 *  added the renderer-command census to the adapter and put the shell over. That check states the
 *  remedy in its own words — 「a subject moves out instead」 — and names the precedents: #R195 took
 *  the satellite protocol out (259 lines), #R196 the antimeridian geodesy (111) and the tile
 *  acceleration (110). This is 375 lines of pure geometry, which makes it the obvious next one.
 *
 *  ⚠ IT TAKES ITS ARGUMENTS AND REMEMBERS NOTHING, which is the property that made the move safe:
 *  every function here is handed the transform's numbers and returns numbers. It names no
 *  renderer class and holds no state, so `npm run check:engine` is untouched and two views cannot
 *  answer for each other. The ONE piece that could not come is `gGuard`, which asks MapLibre
 *  itself whether a camera is reachable (`maplibregl.LngLat` + `applyConstrain`) — it stays in the
 *  adapter and is passed in here as the `guard` argument, exactly as it was before.
 * ==========================================================================*/
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
export const GEO_R=6371008.8, GEO_RAD=Math.PI/180, GEO_CIRC=2*Math.PI*GEO_R;
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
export const gSpherical=t=>{ try{ return !!(t&&t.isGlobeRendering); }catch(_){ return false; } };
/* the canvas-and-fov constant, in pixels; never latitude- or zoom-dependent */
export function gC2C(t,m){ let v; try{ v=t&&t.cameraToCenterDistance; }catch(_){}
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
export function gEye(cam,c2c,tile,sphere,k){
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

/* one attempt at one pitch. `ok` is the whole feasibility question: does this pitch resolve to
   a camera the renderer can actually hold, with the eye exactly where it was? */
export function gSolveAt(anchor,pitch,bearing,c2c,tile,zoom,sphere,hint,guard){
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
export function gLimitPitch(anchor,pitch,bearing,c2c,tile,zoom,sphere,hint,guard,floorDeg){
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
    /* …and the sample COUNT follows the span, because this runs inside the render loop. A drag frame
       asks for one or two more degrees and needs two samples; only a setPitch(180) from 0 needs the
       full sweep. The step never exceeds 2°, and the infeasible band is tens of degrees wide where it
       exists (at globe z1.7 it runs from 76.7° to about 130°), so a coarser walk still cannot step
       over one. Fixed at 24 this cost ~24 solves plus 24 applyConstrain calls on every frame of every
       tilt, almost all of them re-answering "yes" about ground already covered. */
    const p0=lo, span=want-p0;
    const SAMPLES=Math.min(24,Math.max(2,Math.ceil(span/2))); let hi=want, gap=false;
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
/* ══ (#R179) THE RENDERER'S OWN UNDERGROUND CORRECTION RUNS *BEFORE* OURS ════════════════
   ---------------------------------------------------------------------------------------
   The SEVENTH report was 「上を見上げると…高度が明らかに変わっている」 — LOOKING UP, which
   #R178 never dragged into: its one real ctrl-drag was at the startup band, where the tilt
   saturates at 76.7° and so never reaches 90°, and its 0-180° sweeps used setPitch, which
   #R177 had already recorded as a DIFFERENT code path. Measured on the #R178 build with a
   real ctrl-drag past 90°:

       flat z6  Tokyo   drift 1,394,705 m   eye 1,071,682 m → 56,088 m   pitch frozen at 90.0
       flat z14 Tokyo         5,610 m             4,186 m →    219 m     pitch frozen at 90.0
       globe (either zoom)         0 m                   held            (never triggered)

   The cause is in MapLibre, and it is an ORDERING fact, not arithmetic. Camera._applyUpdated
   Transform runs a chain of modifiers, and `_elevateCameraIfInsideTerrain` is pushed FIRST —
   before `transformCameraUpdate`. It asks `getCameraAltitude()`, which is
   `cos(pitch)·cameraToCenterDistance/pixelPerMeter + elevation`, of the PROPOSAL — and the
   proposal is `_requestedCameraState`, which #R173 established never receives this hook's
   overrides. During a drag it is cloned once at gesture start (`||=`) and thereafter only the
   input handlers touch it, so its elevation stays at whatever it was before the drag — 0.
   Past 90° the cosine turns negative, so that camera reads as being under the ground, and the
   correction returns a pitch and zoom "to fix it": pitch exactly 90 and the zoom pushed in.
   By the time our hook is called the pitch has already been rewritten, so it faithfully holds
   the eye of a mangled camera, and the next frame re-reads the mangled camera as truth. That
   is the monotone collapse in the numbers above, and it is why the setPitch sweeps passed:
   jumpTo re-clones the proposal FROM the applied transform, elevation and all.

   THE REPAIR IS NOT TO DISABLE THE CHECK. Measured both ways: neutralising it holds the eye
   to 0 m but leaves the renderer permanently believing the camera is underground (it fired on
   30 of 70 frames and we discarded 30 answers), and it stalled at 177°. Handing it the
   elevation this engine actually applies holds the eye to 0 m, reaches 180°, and the check
   fires ZERO times — because there was never anything wrong with the camera, only with the
   transform it was shown. So: let it judge first; if it is happy, change nothing whatsoever;
   and only when it wants to move the camera, give it the elevation the engine is about to
   apply and ask the same question again. If it still objects, it is right — the eye really is
   below ground — and its answer stands.
   ═════════════════════════════════════════════════════════════════════════════════════════ */
/* ══ (#R179) HOW FAR IN YOU MAY ZOOM WHILE LOOKING UP ON A SPHERE ════════════════════════
   ---------------------------------------------------------------------------------------
   Defect ①, measured: on the globe, looking up at 105° and zooming in put the viewpoint's
   altitude at −0.193 of what it was, i.e. INSIDE the planet. This is not a bug in the tilt
   correction — the eye is exactly where it was asked to be. It is what the sphere's camera IS:
   the pivot is welded to the surface, so the eye sits at r = √(1 + dg² + 2·dg·cos p) Earth
   radii, and once cos p < 0 that expression dips BELOW 1. It bottoms out at |sin p| when
   dg = |cos p|, which is to say the camera passes through the crust on the way in.

   Asked whether to stop the zoom the way #R178 stops the tilt, the answer was 「①②両方直す」.
   So: the largest zoom whose eye is still at or above sea level, found by bisecting gEye — the
   one transcription of the renderer's geometry — rather than by re-deriving the algebra here,
   which is how #R176/#R177 got two disagreeing copies of it.

   Feasibility is NOT monotone in zoom (as dg → 0 the eye returns to the surface point, so
   there is a second feasible region at absurd zooms), which is why this bisects from a zoom
   KNOWN to be safe — the one on screen, which the previous frame already vetted — exactly as
   gLimitPitch walks from the pitch on screen. Returns null when there is nothing to limit,
   which is every ordinary zoom: this can only ever bind while cos p < 0 on a sphere, so
   #R175's 「unlimited tiltだとズームインできない」 cannot come back through it. */
export function gLimitZoom(cam,c2c,tile,heldZoom){
  /* the eye's altitude for the same camera at zoom z. `elevation` is passed as 0 deliberately:
     on the sphere the target's height is INERT (gEye's sphere branch never reads it — the pivot
     is the surface point), so this is the whole truth about where that camera's eye would be. */
  const at=z=>{ const e=gEye({lng:cam.lng,lat:cam.lat,zoom:z,pitch:cam.pitch,bearing:cam.bearing,elevation:0},
                             c2c,tile,true,1);
                return (e&&isFinite(e.alt))?e.alt:null; };
  if(!isFinite(cam.zoom)) return null;
  const now=at(cam.zoom); if(now==null||now>=0) return null;      /* the eye is fine — nothing to do */
  /* FIND THE BRACKET, do not assume one. The first version of this took the zoom on screen as
     "known safe", which is wrong for the reason #R177 catalogued about every other reference in
     this hook: the applied camera and the proposal are different cameras. Holding the eye on a
     sphere spends the zoom AND walks the centre, so evaluating the applied zoom against the
     PROPOSAL's centre and pitch describes a camera that never existed — measured underwater
     already, so the clamp declined and the eye submerged anyway (−164,485 m at globe z4).
     Zooming out grows dg without bound and the eye radius with it, so a safe zoom always exists
     below; walk out until the eye surfaces, then bisect. Bounded, because this runs per frame. */
  let lo=null;
  for(let i=1;i<=24;i++){ const z=cam.zoom-i*0.5, v=at(z); if(v!=null&&v>=0){ lo=z; break; } }
  if(lo==null) return null;
  let hi=cam.zoom;
  for(let i=0;i<20;i++){ const mid=(lo+hi)/2, v=at(mid); if(v!=null&&v>=0) lo=mid; else hi=mid; }
  /* …and it may only ever STOP the zoom, never reverse it. A clamp that answers below the zoom
     already on screen would make "+" zoom OUT, which is the shape of #R175's report
     (「unlimited tiltだとズームインできない」) and worse — the measured runaway to z −5.54 was
     exactly this kind of feedback. So the answer is confined between the zoom on screen and the
     one asked for; when the boundary is behind us, the honest answer is "stay". */
  if(isFinite(heldZoom)){
    const lowest=Math.min(heldZoom,cam.zoom);
    if(lo<lowest) lo=lowest;
  }
  return (lo<cam.zoom)?lo:null;
}
