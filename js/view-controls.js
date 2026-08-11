/* ============================================================================
 *  IntMap · View controls — the tilt limit and the eye-altitude readout  (#R171)
 * ----------------------------------------------------------------------------
 *  Two small subsystems that answer two requests about the CAMERA rather than the map:
 *
 *    「地図を傾けるのが、いまは一定以上傾けられないから、設定から変更すればそれを360度いくらでも無制限に。」
 *    「設定から変更すれば、常時表示欄に、視点位置の高度も出るように。」
 *
 *  ── Renderer independence ───────────────────────────────────────────────────────────────────
 *  Written entirely against window.IntMapGeoEngine (#R152/#R160/#R161/#R170/#R171) — nothing in
 *  this file touches the MapLibre map, which is why `camera.setMaxPitch/getPitch/tiltRange` and
 *  `camera.altitude()` were added to the contract this round. The third subsystem built engine-only
 *  from scratch, after the news pins (#R161) and the 3-D volume tool (#R170).
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.viewControls=function(HOST){
  const GE=()=>window.IntMapGeoEngine;
  const L=window.IntMapLang.pick(()=>HOST.lang);

  /* =========================================================================================
   *  TILT LIMIT — Settings ▸ Map behaviour ▸ "Tilt limit"
   * -----------------------------------------------------------------------------------------
   *  index.html has raised the ceiling once before (60 → 78 at boot, #R? "Earth-like oblique
   *  views"), and 78° is where the drag still stops today. This makes the ceiling a user choice.
   *
   *  How far "unlimited" actually goes, MEASURED rather than assumed: MapLibre 5.24 accepts
   *  setMaxPitch(180) and throws "maxPitch must be less than or equal to 180" above it, and
   *  setMinPitch throws below 0. That is not an arbitrary cap — 0-180° IS the whole of camera
   *  tilt: 0 looks straight down, 90 at the horizon, 180 straight up. An angle beyond 180 is
   *  the SAME view with the bearing turned around (250° tilt ≡ 110° tilt looking the other way),
   *  which is exactly what fromAngle() below does, so "keep turning past the top" is expressible
   *  — the compass's numeric popup takes any angle from 0 to 360 and lands the camera there.
   *
   *  Deliberately NOT done: hijacking MapLibre's drag-rotate handler to make the mouse gesture
   *  wrap past the top. That would mean re-implementing the rotate gesture (and losing its
   *  inertia) for everyone who turns this on, i.e. rebuilding a mechanism that works — the thing
   *  #R160 was told twice not to do. The drag reaches every direction the camera has.
   * =======================================================================================*/
  window.IntMapTilt=(function(){
    const KEY='intmap_tilt_unlimited';
    const STANDARD=78;                 /* the long-standing ceiling set in index.html at boot */
    let unlimited=(function(){ try{ return localStorage.getItem(KEY)==='1'; }catch(_){ return false; } })();

    /* the renderer's own ceiling — never offer a limit the engine cannot honour */
    function engineMax(){ try{ const r=GE().camera.tiltRange(); return (r&&isFinite(r[1]))?r[1]:STANDARD; }catch(_){ return STANDARD; } }
    function ceiling(){ return unlimited?engineMax():STANDARD; }

    /* Push the current choice at the renderer. Returns false when there is no engine yet (boot
       order — see the lazy wiring at the bottom of this file), so the caller can retry. */
    function apply(){ const E=GE(); if(!E||!E.camera||!E.camera.setMaxPitch) return false;
      const ok=E.camera.setMaxPitch(ceiling());
      /* (#R172) UNPIN THE VIEW TARGET while the ceiling is lifted. MapLibre pins the point the camera looks at
         to the ground, and with it pinned the eye's own height is fixed by zoom+pitch — so tilting HAS to swing
         the viewpoint, and past 90° the camera ends up underground (measured: eye −8,140 m at pitch 120). The
         flight simulator has unpinned it since #R95 for exactly this reason. Pinned again the moment the user
         goes back to Standard, so nothing outside this setting changes. */
      try{ if(!window.__fsCamActive){ if(E.camera.setCenterClamped) E.camera.setCenterClamped(!unlimited); pivot(); } }catch(_){}
      /* Going back to Standard while leaning past it would leave the camera at an angle the user
         can no longer reach — MapLibre keeps the current pitch, it only stops NEW ones. Bring it
         back into range so the setting and the view agree. */
      if(ok&&!unlimited){ try{ if((E.camera.getPitch()||0)>STANDARD) E.camera.easeTo({pitch:STANDARD,duration:450}); }catch(_){} }
      return ok; }
    function set(on){ unlimited=!!on; try{ localStorage.setItem(KEY,unlimited?'1':'0'); }catch(_){} return apply(); }

    /* Any tilt angle → the (pitch, bearing) pair that points the camera the same way. Angles past
       180° come back down the far side with the bearing reversed, so 0-360 is continuous and every
       value lands somewhere real. */
    function fromAngle(deg,bearing){
      let a=((+deg%360)+360)%360, b=(((+bearing||0)%360)+360)%360;
      if(a>180){ a=360-a; b=(b+180)%360; }
      return { pitch:Math.max(0,Math.min(ceiling(),a)), bearing:b }; }
    /* …and back, so a UI can show the angle the user typed rather than the clamped half of it. */
    function toAngle(pitch,bearing,refBearing){
      const p=+pitch||0, b=(((+bearing||0)%360)+360)%360, r=(((+refBearing||0)%360)+360)%360;
      return (Math.abs(((b-r+540)%360)-180)>90) ? (360-p) : p; }

    /* =======================================================================================
     *  (#R172) EYE-ANCHORED TILT — 「Unlimited map tiltにした場合、視点の位置は一切変えないように。」
     * ---------------------------------------------------------------------------------------
     *  Turning the setting ON never moved anything (measured: centre, zoom, bearing, pitch and
     *  eye altitude all identical before and after). What moves is TILTING once it is on, and it
     *  moves a lot, because MapLibre's pitch orbits the camera around the MAP CENTRE rather than
     *  pivoting it where it stands. Measured at z12 over Tokyo: pitch 78° → eye 3,385 m; drag on
     *  to 120° → eye −8,140 m. The viewpoint has swung a whole arc and ended up under the ground.
     *  That is the "視点の位置が変わる" this fixes — with the ceiling lifted you can lean far past
     *  the horizon, so the arc is no longer a small nudge.
     *
     *  The gesture itself is untouched (#R160: do not rebuild working mechanisms). MapLibre still
     *  computes the pitch from the drag; this only puts the EYE back where the drag started, so the
     *  camera turns its head instead of orbiting. Off unless the user asked for unlimited tilt, so
     *  standard behaviour is byte-identical.
     * =====================================================================================*/
    function _cam(){ const E=GE(); return (E&&E.camera)?E.camera:null; }
    let _pivot=null;   /* what the engine was last told; null = never asked */
    /* Ask the engine to pivot the tilt about the VIEWPOINT while the ceiling is lifted, and about the
       look-at target (its normal behaviour) otherwise. The engine owns the how — see setTiltPivot in the
       MapLibre adapter, and the trap recorded there: correcting the camera from a 'pitch' EVENT kills the
       gesture, because MapLibre's jumpTo starts with stop(). */
    function pivot(force){ const c=_cam(); if(!c||!c.setTiltPivot) return false;
      const want=unlimited?'eye':'target'; if(_pivot===want&&!force) return true;
      const ok=c.setTiltPivot(want); if(ok) _pivot=want; return ok; }
    /* force: the flight simulator takes the pivot away for the length of a flight (it drives the camera itself
       every frame) and calls this on the way out, so the cached value cannot be trusted at that moment. */
    function wireTilt(){ return pivot(true); }

    /* Tilt to an absolute angle. With the pivot set the engine keeps the eye still on its own, so this is
       simply "set the pitch" — the numeric tilt field on the compass and Atlas's tilt action both land here. */
    function tiltTo(deg){ const c=_cam(); if(!c) return false;
      try{ c.setPitch(Math.max(0,Math.min(ceiling(),+deg||0))); return true; }catch(_){ return false; } }

    return { isUnlimited:()=>unlimited, set, apply, ceiling, engineMax, standard:()=>STANDARD, fromAngle, toAngle, wireTilt, tiltTo,
      state:()=>({ unlimited, ceiling:ceiling(), engineMax:engineMax(), pivot:_pivot,
        applied:(()=>{ try{ return GE().camera.getMaxPitch(); }catch(_){ return null; } })() }) };
  })();

  /* =========================================================================================
   *  EYE ALTITUDE — an extra chip in the always-on readout (#coord-readout)
   * -----------------------------------------------------------------------------------------
   *  The readout already answers "what is under the cursor" (coordinates + the ground's elevation).
   *  This adds "where am I looking from" — the altitude of the CAMERA above sea level, which is a
   *  different number entirely: hovering a sea-level coast from 40 km up reads "Elev 0 m · Eye
   *  40,000 m". The engine derives it from the renderer's own camera geometry (see cameraAltitude
   *  in the MapLibre adapter); this module only decides whether to show it and how to word it.
   * =======================================================================================*/
  window.IntMapEyeAlt=(function(){
    const KEY='intmap_eye_alt';
    let on=(function(){ try{ return localStorage.getItem(KEY)==='1'; }catch(_){ return false; } })();
    let _raf=0, _wired=false;

    function altitude(){ try{ const a=GE().camera.altitude(); return (a==null||!isFinite(a))?null:a; }catch(_){ return null; } }
    function label(){ return L('Eye','視点','Kamera','Камера','Cámara'); }
    /* Formatted for the readout, in the user's unit setting (shared with the elevation chip so the
       two numbers next to each other are never in different units). '' when off or unavailable. */
    function text(){ if(!on) return '';
      const a=altitude(); if(a==null) return '';
      let v=''; try{ v=HOST.fmtElevVal(Math.abs(a)); }catch(_){ v=Math.round(Math.abs(a)).toLocaleString()+' m'; }
      /* Past 90° of tilt the camera has swung below the centre's ground plane; say so with a sign
         rather than quietly showing the height as if it were still above. */
      return label()+' '+(a<0?'−':'')+v; }

    /* The readout is redrawn on cursor movement, which is not enough on its own: zooming or tilting
       with the pointer still changes the eye altitude. Coalesce to one repaint per frame (the same
       shape as the occlusion updater in index.html) so dragging the globe stays smooth. */
    function refresh(){ if(!on||_raf) return;
      _raf=requestAnimationFrame(()=>{ _raf=0; try{ HOST.renderCoordReadout(); }catch(_){} }); }
    function wire(){ if(_wired) return; const E=GE(); if(!E||!E.events) return; _wired=true;
      E.events.on('move',refresh); E.events.on('zoom',refresh); E.events.on('pitch',refresh); }

    function set(v){ on=!!v; try{ localStorage.setItem(KEY,on?'1':'0'); }catch(_){}
      if(on) wire();
      try{ HOST.renderCoordReadout(); }catch(_){}
      return on; }

    return { isOn:()=>on, set, text, altitude, label, refresh, wire,
      state:()=>({ on, altitude:altitude(), text:text() }) };
  })();

  /* The engine is built inside map.on('load') in index.html, i.e. AFTER these factories run
     (#R170 learned this the hard way: wiring at construction time silently bound nothing). Wait
     for it, then push the saved choices at the renderer exactly once. */
  /* (#R178) …and waiting for the ENGINE is no longer the same as waiting for the RENDERER. The engine
     used to be created inside map.on('load'), so its existence implied a live map; js/geo-engine.js is
     imported before the map is constructed now, and this loop fired immediately — pushing the saved
     ceiling at an adapter whose _m() was still null, which silently did nothing. Measured: the tilt
     limit read back 78° after a reload with the setting on "unlimited". So wait for hasRenderer(),
     and keep the retry alive until apply() actually reports that the renderer took it. */
  (function waitForEngine(n){
    const E=GE();
    if(E&&E.camera&&(E.hasRenderer?E.hasRenderer():true)){
      let ok=false;
      try{ ok=window.IntMapTilt.apply(); }catch(_){}
      try{ window.IntMapTilt.wireTilt(); }catch(_){}
      try{ if(window.IntMapEyeAlt.isOn()) window.IntMapEyeAlt.wire(); }catch(_){}
      if(ok) return;
    }
    if((n||0)<200) setTimeout(()=>waitForEngine((n||0)+1),100);
  })(0);
};
