/* ============================================================================
 *  IntMap · theme and sky — the app's colours, and where the sun is  (#R199)
 * ----------------------------------------------------------------------------
 *  One question, answered in one place: what colour is everything right now? The UI theme and its
 *  skins, the basemap's light/dark pair, the label and border visibility that follow from the
 *  basemap choice, and — since #R196 — the real atmosphere: the sub-solar point, the horizon colour
 *  at the camera's own local sun elevation, MapLibre's seven-property sky block, and the two clocks
 *  (the master clock and a one-minute tick) that keep re-aiming it.
 *
 *  Lifted out of js/app-body.js's 233-line block (#R199), 222 of its 233 lines byte-identical.
 *  It is a REAL ES module: nothing registers it on window.IntMapModules and nothing depends on load
 *  order — js/app-body.js names it in an `import`.
 *
 *  ⚠ The eleven lines that are NOT verbatim are all one thing, and it is the rule #R165 wrote down:
 *  a closure value that app-body REASSIGNS at runtime must be read through IM_HOST's live accessor,
 *  never captured when this factory ran. Those are userTheme (read AND written), currentMapType →
 *  HOST.mapType, namesOn, bordersOn, satActive, satPanelDismissed. Everything else — every function —
 *  arrives through CTX under its original name. tests/r199-checks.test.mjs enumerates both sets.
 *
 *  (#R202) It also imports js/sky-model.js — the scattering integral that decides `sky-color`. That
 *  file is pure arithmetic with no DOM and no renderer, so tests/r202-checks.test.mjs runs it in Node.
 * ==========================================================================*/
import { skyColour, limbViewElev, sunOpticalDepth, skyModelTables } from './sky-model.js';
/* ⚠ (#R227) THE MODEL IS PUBLISHED, NOT COPIED. js/limb-layer.js is a `window.IntMapModules` factory
   (a MapLibre adapter implementation detail, like js/solid3d.js) and cannot `import` an ES module,
   but the whole point of that layer is that it marches THIS model — same coefficients, same ozone
   tent, same multiple-scattering table. So the tables and the sun-ray integral are put on the window
   from the one file that already imports them, and js/geo-engine.js hands them to the layer.
   ⚠ A `window.X` that nothing assigns is the #R162 trap; tests/r227-checks holds both ends. */
window.IntMapSkyModel = { tables: skyModelTables, sunOpticalDepth };
export function makeThemeSky(HOST, CTX) {
  const GE=CTX.GE, applyLabelLang=CTX.applyLabelLang, canDraw=CTX.canDraw, ensurePlaceLabels=CTX.ensurePlaceLabels, mapLabelsViaVector=CTX.mapLabelsViaVector, satRefreshReadout=CTX.satRefreshReadout, satRenderController=CTX.satRenderController;
  function applyTheme(){
    /* ══ (#R181) NOT RE-ENTRANT — IT CALLS SOMETHING THAT CALLS IT BACK ═══════════════════════
       Measured on the DEFAULT engine, simply pressing "Satellite": three to six uncaught
       `RangeError: Maximum call stack size exceeded`, and applyTheme running eleven times deep.
       The loop is entirely inside this function's own first half:

         applyTheme → refreshNewsPill → ensureLabelPill(force) → scene.removeImage
                    → MapLibre `_afterImageUpdated` fires `styledata` SYNCHRONOUSLY
                    → the handler below (see the `layer-sat` visibility check) → applyTheme …

       and what would have stopped it — flipping `layer-sat`'s visibility, which is the very
       condition that handler tests — is the NEXT line after the sprite rebuild. So every
       re-entry still saw the old visibility and went round again, unwinding only when the
       stack gave out. Everything after the throw in the outermost call was skipped, which is
       why the base map could be left mid-flip.
       A re-entrant call is always redundant: the call already running is about to set the whole
       theme, including whatever the inner one wanted. Say so, rather than reordering the body
       and leaving the trap set for the next thing that fires an event mid-theme. */
    if(applyTheme._busy) return;
    applyTheme._busy=true;
    try{ return _applyThemeBody(); } finally { applyTheme._busy=false; }
  }
  function _applyThemeBody(){
    /* (#R9/#58) Tactical theme is a phosphor-green military HUD built ON the dark theme.
       (#R13c) Classic = an Age-of-Discovery parchment/nautical look built ON the LIGHT theme — warm
       sepia surfaces, serif type, brass accents, and a parchment tint over the (light) basemap. */
    /* (#R33) Skin themes DELETED per request — only System Default / Light / Dark remain. Any old saved
       skin theme is coerced to System Default, and every theme-* body class is cleared. */
    const _SKINS=['cyber','classic','psychedelic','military','medical','baroque','taisho','tactical'];
    if(_SKINS.includes(HOST.userTheme)){ HOST.userTheme='auto'; }
    const isLight = (HOST.userTheme==='light')||(HOST.userTheme==='auto'&&window.matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.setAttribute('data-theme', isLight?'light':'dark');
    _SKINS.forEach(k=>document.body.classList.remove('theme-'+k));
    /* (#R12) If the style isn't fully loaded the basemap layer-visibility set below is skipped — and
       NOTHING re-ran it, so the wrong base (black/white) occasionally stuck. Retry once on idle so the
       chosen map color always lands. */
    if(!canDraw()){   /* (#R170) a parsed style is all the base-map visibility set below needs */
      /* (#R34) Even while the style is still loading, do an IMMEDIATE best-effort base flip so a Map/Sat
         tap never feels dead ("切り替えができない/反応が極めて悪い"). The full applyTheme re-runs on idle. */
      if(GE().hasRenderer()){ try{
        const _l=(window.imMapColor==='light')||(window.imMapColor!=='dark'&&((HOST.userTheme==='light')||(HOST.userTheme==='auto'&&window.matchMedia('(prefers-color-scheme: light)').matches)));
        const _sat=HOST.mapType==='sat';
        if(GE().layers.has('layer-sat'))      GE().layers.setLayout('layer-sat','visibility',_sat?'visible':'none');
        if(GE().layers.has('layer-light-nl')) GE().layers.setLayout('layer-light-nl','visibility',(!_sat&&_l)?'visible':'none');
        if(GE().layers.has('layer-dark-nl'))  GE().layers.setLayout('layer-dark-nl','visibility',(!_sat&&!_l)?'visible':'none');
      }catch(_){} GE().events.once('idle',()=>{ try{ applyTheme(); }catch(_){} }); }
      return;
    }
    /* Map base color can be chosen independently of the UI theme (#map-color). */
    const mc=(window.imMapColor||'auto'); const mapLight = (mc==='light')?true:(mc==='dark')?false:isLight;
    const sat=HOST.mapType==='sat', light=!sat&&mapLight, dark=!sat&&!mapLight;
    try{ window.refreshNewsPill&&window.refreshNewsPill(); }catch(_){}   /* (#R32) flip the news band color with the theme */
    GE().layers.setLayout('layer-sat','visibility',sat?'visible':'none');
    /* Place labels: nicer crisp VECTOR labels (OpenFreeMap) replace the old Esri raster labels in
       satellite mode and provide Japanese / native-script labels on the map (#41/#42/#43). The
       reliable CartoDB English labels stay as the default for EN map view. */
    const vecMap = HOST.namesOn && mapLabelsViaVector();        /* vector labels on the (non-sat) map */
    /* (#R94j) while the clock is on a past year the labelled Carto base (dark_all/light_all) must NOT be used:
       it has the MODERN borders & country names BAKED INTO the raster, which would survive under the era
       borders and make the map look un-synced. Force the label-free base; the era borders/names come from
       imtb-line / imtb-lbl. */
    const _travelingBase = !!(window.IntMapTimeBorders&&window.IntMapTimeBorders.active&&window.IntMapTimeBorders.active());
    const showCartoLabels = HOST.namesOn && !vecMap && !_travelingBase;   /* labeled carto basemap */
    if(GE().layers.has('layer-sat-labels')) GE().layers.setLayout('layer-sat-labels','visibility','none');  /* Esri labels retired */
    GE().layers.setLayout('layer-light','visibility',(light&&showCartoLabels)?'visible':'none');
    GE().layers.setLayout('layer-light-nl','visibility',(light&&!showCartoLabels)?'visible':'none');
    GE().layers.setLayout('layer-dark','visibility',(dark&&showCartoLabels)?'visible':'none');
    GE().layers.setLayout('layer-dark-nl','visibility',(dark&&!showCartoLabels)?'visible':'none');
    try{ ensurePlaceLabels(); applyLabelLang(); }catch(_){}
    /* Country-borders overlay (always-on outline layer using the same countries source as Countries(info)) */
    try{ window._applyBorders(); }catch(_){ ['borders-only-line','borders-only-casing'].forEach(id=>{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility', HOST.bordersOn?'visible':'none'); }); }   /* (#R210) casing too, or it survives a border switched off */
    /* (#R210) The graticule is WHITE in BOTH themes now (js/grid-style.js). This block used to
       re-tint it per basemap and would silently undo that on the first theme apply, so what it
       varies is the CASING — the dark stroke under the white line, which is what has to carry the
       contrast over a light basemap. The white itself never moves. */
    if(GE().layers.has('grid-labels')){ GE().layers.setPaint('grid-labels','text-color','#ffffff'); GE().layers.setPaint('grid-labels','text-halo-color',mapLight?'rgba(0,0,0,0.85)':'rgba(0,0,0,0.75)'); }
    if(GE().layers.has('grid-labels-cross')){ GE().layers.setPaint('grid-labels-cross','text-color','#ffffff'); GE().layers.setPaint('grid-labels-cross','text-halo-color',mapLight?'rgba(0,0,0,0.8)':'rgba(0,0,0,0.7)'); }
    if(GE().layers.has('grid-lines')){ GE().layers.setPaint('grid-lines','line-color','#ffffff'); }
    if(GE().layers.has('grid-lines-casing')){ GE().layers.setPaint('grid-lines-casing','line-opacity',['case',['==',['get','kind'],'major'],mapLight?0.42:0.24,mapLight?0.26:0.14]); }
    /* Satellite imagery engine: panel + cross-fade buffer visibility follow the mode. */
    const satCont=document.getElementById('map-container'), satPanel=document.getElementById('sat-controller');
    /* (#R101) mobile: the panel is docked in the tools sheet → keep it available. desktop: show only when the
       user has explicitly opened it (satPanelDismissed=false), never merely because the basemap is Satellite. */
    if(satPanel){ const _satMob=window.matchMedia&&window.matchMedia('(max-width:768px)').matches; satPanel.style.display=(sat&&(_satMob||!HOST.satPanelDismissed))?'block':'none'; }
    if(satCont) satCont.classList.toggle('sat-on',sat);
    [0,1].forEach(i=>{ const L='sat-fx-'+i; if(GE().layers.has(L)) GE().layers.setLayout(L,'visibility',(sat&&i===HOST.satActive)?'visible':'none'); });
    if(sat){ try{ satRenderController(); }catch(_){} }
    try{ satRefreshReadout(); }catch(_){}
    /* (#R186) the coarse whole-Earth floor under the satellite tiles (js/world-base.js) and the
       real-scale atmosphere around the globe — both belong to the satellite basemap, so both follow
       the same `sat` the base layers above do. */
    try{ window.IntMapWorldBase&&window.IntMapWorldBase.apply(sat); }catch(_){}
    try{ _applySkyAtmosphere(sat); }catch(_){}
  }
  /* ══ (#R186) THE ATMOSPHERE, AT ITS REAL SIZE AND ITS REAL COLOUR ═══════════════════════════════
     「MapLibreでも、Satelliteでは、地球の大気が見えるように。（実寸・実色）」

     The renderer already contains the right thing and it was switched off. MapLibre's globe draws a
     Rayleigh + Mie scattering integral — planet 6,371 km, atmosphere 6,471 km, per-wavelength
     Rayleigh coefficients (5.5, 13.0, 22.4)e−6, Mie 21e−6, scale heights 8 km and 1.2 km, tone-mapped
     and gamma-corrected — which is 実寸・実色 by construction rather than by a hand-picked gradient.
     But it is multiplied by `atmosphere-blend`, and a style with no `sky` block gets 0: the app has
     never had a `sky`, so the multiplier has always been zero and the comment in set3D() claiming
     "the globe already renders its own atmosphere" was describing something that never ran.

     The Sun's direction comes from `style.light`, and the app's default light is a fixed viewport
     lamp — which would put the terminator glow wherever the user happened to be looking. It is set
     from the REAL Sun instead (js/space-sky.js computes the sub-solar point from the map's own
     clock), so the lit limb is the lit limb.

     `atmosphere-blend` falls off with zoom because the effect is a limb: at street level the camera
     is inside it and a full-strength halo would be a wash over the imagery. Only that one property
     is set — sky-color/horizon-color/fog-color are left alone, because fog is not supported on the
     globe and setting it there is what fills the console with warnings. */
  function _sunOverheadPoint(){
    try{ const S=window.IntMapSky; if(!S||!S.sunPosition) return null;
      /* ⚠ (#R200) IT ASKED FOR A METHOD THAT DOES NOT EXIST. window.IntMapTime's surface is
         get / when / iso / year / isLive / min / state / on / set / setYear / setDaysAgo / setNow —
         there is no `now()`. (`const now=()=>new Date()` is a PRIVATE helper inside that IIFE.) So
         `if(T&&T.now)` was false on every build since #R196 and the sun was aimed by the wall clock
         no matter where the time machine stood. Four files carried the same line; all four are fixed,
         and tests/r200-checks derives the real surface from js/app-body.js so this cannot come back.
         `when()` is the one to call: it returns the travelled instant, or now when the clock is live. */
      let ms=Date.now(); try{ const T=window.IntMapTime; if(T&&T.when){ const d=T.when(); const v=(d instanceof Date)?d.getTime():+d; if(isFinite(v)) ms=v; } }catch(_){}
      const s=S.sunPosition(ms), g=S.gmstDeg(ms);
      return { lng:((s.ra-g+540)%360)-180, lat:s.dec };
    }catch(_){ return null; }
  }
  /* ⚠ The sun direction and the scene LIGHT are the same setting — MapLibre's atmosphere shader reads
     `style.light`, there is no separate uniform for it. The Sun & shadow simulator (window.IntMapSun)
     also drives that light while it is open, and it aims it at the sun for the moment the user is
     studying, which is a more specific request than "now". So it wins: while its panel is open the
     atmosphere is left with whatever light the simulator has set. */
  function _sunSimOwnsLight(){ try{ const s=window.IntMapSun&&window.IntMapSun.state&&window.IntMapSun.state(); return !!(s&&s.open); }catch(_){ return false; } }
  /* ⚠ …and the FLIGHT SIMULATOR owns the sky outright while it runs. It sets its own cockpit sky in
     start() and restores whatever was there in stop(), so anything this function does in between is
     both wrong and destructive: measured, a basemap switch during a flight cleared the sim's
     `sky-color` to undefined (tests/r174 «the renderer's own sky is what a cockpit sees»). A window
     with a pilot in it is a more specific request than "the satellite view has an atmosphere". */
  function _skyIsOwnedElsewhere(){
    try{ const FS=window.IntMapFlightSim; if(FS&&FS.active&&FS.active()) return true; }catch(_){}
    return false;
  }
  /* ⚠⚠ (#R214) 「設定から、昼夜を表示するのをオフに…（追記：オフにしてもオフにならない。）」 AND ON
     CESIUM IT NEVER DID ANYTHING AT ALL. js/night-side.js states the reason in its own header and
     then does not act on it: MapLibre has no solar term, so that module DRAWS the night side as a
     layer — and `setEnabled(false)` removes that layer. Cesium does have one, `globe.enableLighting`,
     and js/cesium-engine.js turns it on from `setSunDirection()` — the call right below. So on Cesium
     the whole day/night effect is the renderer's, the Settings control removed layers that were never
     added, and the globe stayed shaded. The switch has to reach the thing that is actually drawing.

     ⚠ ONLY where the renderer owns it. On MapLibre this same light is the fill-extrusion lighting and
     the atmosphere's sun, and the night side is a separate layer that `setEnabled` already removes
     correctly — unaiming the sun there would darken buildings nobody asked about. Measured on
     MapLibre before this: the two layers do disappear and stay gone across a camera move. So MapLibre
     is left byte-for-byte as it was, and this only stops the sun-anchored light on the engines whose
     night side IS that light. `setSunDirection(null)` is the documented "restore the default light". */
  /* ══ ⚠⚠ (#R221) …AND «OFF» NOW ALSO MEANS «THE BASEMAP IS THE MAP» ═══════════════════════════════
     「昼夜で夜間光にしたり明るくしたり暗くしたりするやつはSatellite時のみに。Mapではなにも無し。」
     — sent again, because #R220 answered only half of it. #R220 put the `satelliteUp()` condition on
     js/night-side.js, and measured that on the vector map neither `im-night-shade` nor
     `im-night-lights-lyr` is in the style any more. That is true and it is not the whole effect:
     THREE more things in THIS file are aimed by the Sun, and none of them was gated —

       · `style.light`, from which maplibre-gl's own atmosphere pass takes `u_sun_pos`, so the halo
         is bright on the day side and dark on the night side (#R215 found this once already, for
         the Settings switch, and fixed it only for that switch);
       · `horizon-color`, interpolated on the Sun's elevation at the map centre;
       · `sky-color`, integrated by js/sky-model.js at that same elevation.

     On the vector map at local midnight that is a globe with a dark limb and a black sky — 「暗く
     したり」 exactly, with the layers correctly absent. The photograph-on-a-drawing argument #R220
     made for the mosaic applies to all four: a drawn map has no photometry to be consistent with.

     ⚠ ONE PREDICATE, and it is the same question js/night-side.js asks (`layer-sat` visible), so the
     two can never disagree about which basemap is up. The SETTING still wins where it is off. */
  function _satelliteUp(){
    try{ return GE().layers.getLayout('layer-sat','visibility')==='visible'; }catch(_){ return false; } }
  function _nightSideOff(){
    try{ const N=window.IntMapNightSide; if(N&&N.isOn&&!N.isOn()) return true; }catch(_){}
    return !_satelliteUp();
  }
  /* ══ ⚠⚠ (#R215) …AND MapLibre DRAWS A TERMINATOR OF ITS OWN, WHICH IS WHY IT IS BACK ═══════════
     「設定から、昼夜を表示するのをオフにできるように。（追記：オフにしてもオフにならない。MapLibre。）」

     #R214 answered this for Cesium and left MapLibre alone on a stated argument: there the day/night
     effect is js/night-side.js's two layers, `setEnabled(false)` removes them, and this light is only
     the fill-extrusion shading. MEASURED again this round, that argument is half right — the layers
     really do go and stay gone (Settings → off, `im-night-shade` and `im-night-lights-lyr` absent,
     absent after a camera move, `intmap_night_side='0'`). But it is NOT the only thing that shades
     the globe by the Sun. maplibre-gl's own atmosphere pass integrates Rayleigh + Mie with
     `u_sun_pos` taken straight from `style.light` (node_modules/maplibre-gl … `drawAtmosphere` →
     `getSunPos(light, transform)`), so on the globe the halo itself is bright over the day side and
     dark over the night side — a terminator that this app aims, every sixty seconds, at the real Sun.
     Switching the layer off and leaving the light aimed is exactly 「オフにしてもオフにならない」.

     So the switch reaches the LIGHT on every engine, not on every engine except this one. What
     `setSunDirection(null)` restores is the app's default viewport-anchored light — buildings keep
     their shading, the atmosphere keeps its halo, and neither follows the Sun any more. */
  /* ══ ⚠⚠⚠ (#R240) «NO DAY/NIGHT» IS NOT «NO SUN» — AND THAT IS WHERE THE AIR WENT ═══════════════
     「MapLibreの地球周辺の大気は…（追記：そもそも消えてしまっている）（追記：いやだからなんで前まで
       あった大気が消えとんねんって言ってんねん）」「そもそも前作った大気がなくなってる」 — reported
     for the fourth round, and #R238b's answer (restore `atmosphere-blend`) was necessary and not
     sufficient, because the property was never the thing that had gone.

     ⚠ MEASURED, and the control is exact. maplibre's globe atmosphere takes its sun from
     `style.light` and from nowhere else (`drawAtmosphere` → `getSunPos(light, transform)`), so the
     light IS the atmosphere's brightness. This function called `setSunDirection(null)` whenever the
     day/night side was off, and `null` means «maplibre's own default», which is
     `{anchor:'viewport', position:[1.15,210,30]}` — a sun fixed at a shallow angle behind the
     reader's left shoulder, in VIEW space, while the scattering integral marches in PLANET space.
     Same camera, same build, only the light changed:

         place        sun aimed (map anchor)      light = maplibre's default
         Congo        [ 71,112, 77]               [ 35, 62, 13]
         Atlantic     [ 44,105,134]               [  2, 51, 72]
         Indian       [ 44,111,141]               [  1, 56, 75]
         Sahara       [255,251,227]               [248,217,171]

     That second column is a globe with no air on it, and it is byte-for-byte what the #R226 build
     renders when it is handed the same light — i.e. nothing about the atmosphere pass regressed;
     the app simply stopped telling it where the Sun is. Switching the day/night layer off turned
     the atmosphere off with it, and on the vector basemap `_nightSideOff()` is ALWAYS true.

     ⚠ SO «OFF» NOW MEANS «NO TERMINATOR», WHICH IS WHAT WAS ASKED FOR, RATHER THAN «NO SUN».
     The sun is aimed at the point the camera is looking at, so the visible disc is lit from
     straight on: there is no light/dark division anywhere on screen — 「昼夜を表示するのをオフに」
     and 「Mapではなにも無し」 are both satisfied — and the scattering integral still has a sun in
     the right frame, so the air is on the globe. It follows the camera through the same settle
     this file already runs, so panning cannot bring a terminator into view. */
  function _aimSun(){ if(_sunSimOwnsLight()||_skyIsOwnedElsewhere()) return false;
    if(_nightSideOff()){
      /* the sub-camera point: sun overhead where the reader is looking ⇒ no terminator on screen */
      let c=null; try{ c=GE().camera.getCenter(); }catch(_){}
      if(!(c&&isFinite(c.lng)&&isFinite(c.lat))) return false;
      try{ return GE().scene.setSunDirection({lng:c.lng,lat:c.lat}); }catch(_){ return false; }
    }
    const p=_sunOverheadPoint(); if(!p) return false;
    try{ return GE().scene.setSunDirection(p); }catch(_){ return false; } }
  /* ══ (#R196) THE SKY IS NOT A PROPERTY OF THE BASEMAP ═════════════════════════════════════════════
     「Cesiumと同じ大気・空のエフェクトをMapLibreでも。完全に同一な見た目にしろ。（現在は空が真っ暗である
       ため）」 — MEASURED, both engines, same camera, dark theme (test-results/sky):

       globe z1.6, the band just inside the limb   MapLibre [34,33,34] grey     Cesium [31,41,55] blue
       z5 pitch 60, the band above the horizon     MapLibre [46,46,46] grey     Cesium a bright blue arc
       z5 pitch 60, the sky above that             MapLibre pure black          Cesium black + stars

     Two separate defects with one cause. `_applySkyAtmosphere` returned early unless the SATELLITE
     basemap was on, so on the default map basemap the style carried no `sky` at all — and with no
     `sky` block MapLibre's atmosphere multiplier is 0 AND there is no sky quad above the horizon, so
     what fills it is the container's CSS colour. That is the 真っ暗 in the report, exactly.

     ⚠ SETTING ONLY `atmosphere-blend` IS NOT ENOUGH AND IS NOT SAFE. Every other sky property then
     takes its SPEC DEFAULT — sky-color #88C6FC, horizon/fog #ffffff, fog-ground-blend 0.5 — i.e. a
     permanent daylight-blue dome and the same white distance wash this round was told to remove from
     the flight simulator. So all seven are stated:

       sky-color         deep space. Cesium's sky above the atmosphere is its star box: black.
       horizon-color     THE ATMOSPHERE BAND, and the one thing that has to follow the Sun — Cesium's
                         SkyAtmosphere is bright over the day side and dark over the night side, so
                         this is interpolated on the Sun's elevation AT THE MAP CENTRE.
       sky-horizon-blend 0.55 — a thin band, matching the arc in the Cesium capture.
       fog-*             off (ground-blend 1 = fog only exactly at the horizon, horizon-fog-blend 0 =
                         the horizon band is the horizon colour). Cesium draws no ground haze here.
       atmosphere-blend  unchanged from #R187 — the Rayleigh+Mie limb, tapered by zoom.

     ⚠ ONE OWNER. js/flight-sim.js owns the sky outright while a flight is running (_skyIsOwnedElsewhere)
     and set3D's own mercator-only sky block is gone — two writers meant the last one to run decided,
     which is why a basemap switch during a flight once cleared the cockpit sky (#R174). */
  /* ══ (#R202) `sky-color` WAS A CONSTANT, AND THE CONSTANT WAS DEEP SPACE ═════════════════════════
     「Cesiumと同じ大気・空のエフェクトをMapLibreでも。完全に同一な見た目にしろ。（現在は空が真っ暗である
       ため）」 — reported again, and the half #R196 did not do is why.

     #R196 gave the style a `sky` block, which is what put a surface above the horizon at all. But it
     set `sky-color` to _SKY_SPACE and left it there: at noon, standing on the ground, everything
     above the thin horizon band was #060b16. Measured at Tokyo z14 pitch 75 at local noon, the top
     of the frame was [45,52,64] on MapLibre against [85,112,130] on Cesium — darker, and grey where
     Cesium is blue. Cesium is not choosing a hex; `SkyAtmosphere` integrates scattering, and no pair
     of hexes agrees with an integral except at one Sun elevation and one eye height — and this app
     flies from a street to low orbit and travels in time.

     So the far end of the gradient is now computed: js/sky-model.js marches the same Rayleigh + Mie
     model MapLibre's own globe shader uses, for THIS Sun elevation and THIS eye height, and returns
     the colour. It goes blue in daylight, dusky through twilight, and to space both at night and as
     the camera climbs out of the atmosphere — the last one for the same reason Cesium's does.
     _SKY_SPACE remains as the floor the model itself converges to, and as the answer when the Sun's
     position is unknown. */
  const _SKY_SPACE='#060b16';
  /* ⚠ (#R202) _SKY_H_DAY MOVED ONTO CESIUM'S OWN NUMBER. #R196 picked #c9dcf0 = (201,220,240) by eye;
     Cesium's SkyAtmosphere at the same camera and instant reads (194,204,209) in the band just above
     the horizon (test-results/r202/sky-cesium-noonLow.png). Same instruction, measured answer. */
  const _SKY_H_NIGHT='#0a1526', _SKY_H_DAY='#c2ccd1';
  function _mix(a,b,t){ const p=(h)=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
    const A=p(a),B=p(b),u=Math.max(0,Math.min(1,t));
    return '#'+[0,1,2].map(i=>Math.round(A[i]+(B[i]-A[i])*u).toString(16).padStart(2,'0')).join(''); }
  /* how high the Sun stands over the point the camera is looking at, in degrees */
  /* ⚠ (#R215) …and the SKY is the third thing that says which side is night. `horizon-color` is
     interpolated on this elevation and `sky-color` is integrated at it, so with the day/night display
     off both would still go dark at local midnight. `null` is already the "the Sun's position is
     unknown" path in both callers, and it lands on the DAY colours — which is what "do not show me
     the night" means. */
  function _sunElevAtCentre(){
    if(_nightSideOff()) return null;
    const s=_sunOverheadPoint(); if(!s) return null;
    let c=null; try{ c=GE().camera.getCenter(); }catch(_){}
    if(!c||!isFinite(c.lat)||!isFinite(c.lng)) return null;
    const R=Math.PI/180, a=c.lat*R, b=s.lat*R, dl=(c.lng-s.lng)*R;
    const cos=Math.sin(a)*Math.sin(b)+Math.cos(a)*Math.cos(b)*Math.cos(dl);
    return 90-Math.acos(Math.max(-1,Math.min(1,cos)))/R;
  }
  /* ══ (#R213) THE BAND WAS THE ONE PART OF THE SKY STILL PICKED BY HAND ═══════════════════════════
     「MapLibreの地球大気の描写をもっとリアルで美しく。」

     #R202 replaced `sky-color` — the FAR end of the gradient — with the Rayleigh + Mie integral in
     js/sky-model.js. It left `horizon-color` as a smoothstep between two hexes, and `horizon-color`
     is the band: the bright arc at the limb and the strip just above the ground, i.e. the part of
     the atmosphere anybody actually looks at.

     ⚠ AND THE TWO HEXES HAVE NO WARM PHASE AT ALL. #0a1526 (night blue) → #c2ccd1 (grey-white) is a
     straight line through desaturated blue-grey, so at the exact moment a real horizon is orange
     this drew grey. That is not a taste disagreement, it is a missing physical effect: near sunset
     the sight-line through the atmosphere is ~38× longer than at the zenith, Rayleigh scattering has
     removed most of the short wavelengths from it, and what survives is red. The model already
     computes that — it takes the VIEW ELEVATION as an argument and has since #R202 — and nothing was
     passing it.

     So the band is sampled at 0.6° above the horizon, from the same integral, at the same Sun
     elevation, eye height and relative azimuth the far end uses. One model, two samples, one
     gradient. The old two-hex ramp stays as the fallback for when the Sun's position is unknown or
     the model throws — it is a worse answer, not a wrong one.

     ⚠⚠ THE MODEL'S HUE IS USED AND ITS BRIGHTNESS IS NOT, AND THAT IS NOT A FUDGE — IT IS WHAT THE
     MODEL DOES AND DOES NOT CONTAIN. js/sky-model.js integrates SINGLE scattering. Along a grazing
     sight-line the air mass is about 38× the zenith value, so multiple scattering — the light that
     has bounced more than once — is most of what reaches the eye, and that is exactly the term the
     model omits. Measured, at a 0.6° view elevation the model returns [111,112,83] at local noon
     where #R196's Cesium capture of the same band reads [194,204,209]: too dark, and olive. Its
     RATIO between channels near the terminator is right (the long path really has had its blue
     scattered out), its MAGNITUDE at any sun elevation is not.

     So: the luminance stays on #R196's measurement and only the hue comes from the model, and it is
     mixed in as the Sun comes DOWN — zero weight above +6°, full weight below −6°. Above +6° this
     returns byte-for-byte what #R196 measured, so no earlier finding is walked back; the change is
     entirely in the twilight window, which is the window that was grey and should not have been.

     ⚠ FLOORED AT THE NIGHT HEX FOR THE REASON #R202 GAVE: the model carries no starlight and no
     airglow, so deep night integrates to black, and a black horizon band is darker than the sky has
     ever been. Nothing above that floor is touched. */
  const _HZ_VIEW_ELEV=0.6;
  const _lum=(c)=>0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
  /* ══ ⚠⚠ (#R222) FROM ORBIT THE BAND IS A LIMB, AND IT WAS A GREY HEX ═══════════════════════════
     「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。」 — asked again, with a photograph of the
     globe, and confirmed as 「縁の帯の色（茶/くすみ）／とにかくリアルにしてほしい。現実に忠実に美しく。」

     MEASURED on the shipped build, satellite globe at 5,286 km over Japan: `horizon-color` = #c2ccd1
     and `sky-color` = #060b16. That first hex is `_SKY_H_DAY`, a NEUTRAL GREY, and it is what the
     band around the Earth has been at every altitude and every hour — #R213's model contribution is
     weighted to zero above a +6° Sun, and js/sky-model.js could not have answered anyway: its
     `radiance()` CLAMPED the eye to the top of the atmosphere, so every orbital camera was modelled
     as standing at 100 km and looking 0.6° up, which is empty space. A grey collar over blue-white
     imagery, with maplibre-gl's own Rayleigh pass tinting it, is the 茶/くすみ in the report.

     The physics of what the reader is looking at is not the sky ABOVE an observer — it is the
     atmosphere seen EDGE-ON. A ray toward the planet's edge whose closest approach is a few km above
     the surface crosses 700–900 km of air; one at 55 km crosses almost none. So the gradient the sky
     block draws is exactly the limb if its two ends are those two rays, and js/sky-model.js can now
     integrate both (the eye is no longer clamped, and `limbViewElev` gives the geometry). Measured
     through the model at 5,286 km:

         Sun 60° above the limb point   tangent  6 km  #b2b8d8      tangent 55 km  #111a28
         Sun  0° (the terminator)                     #836d89                     #0e151f
         Sun −12° (the night side)                    #0a0403                     #0b0a11

     — blue-white low down on the day side, mauve-red through the terminator, black on the night side.
     That is the limb, and it is an integral rather than a hex, so it is right at every altitude the
     camera can reach rather than at the one #R196 measured.
     ⚠ IT ONLY REPLACES THE BAND WHERE THERE IS A LIMB TO SEE — above the shell js/sky-model.js
     integrates. Below 100 km the ground-level path below is untouched, byte for byte.
     ⚠ AND ONLY WHERE THE SUN IS KNOWN. `_sunElevAtCentre()` returns null with the day/night display
     off or on the vector basemap (#R221's gate), and this returns null with it, so the switch that
     says 「Mapではなにも無し」 still means what it says. */
  const _ATM_TOP_M=100000;
  const _LIMB_LOW_M=6000, _LIMB_HIGH_M=55000;
  function _limbHex(tangentM){
    const alt=_eyeAltM();
    if(!(alt>_ATM_TOP_M)) return null;
    const e=_sunElevAtCentre(); if(e==null) return null;
    const ve=limbViewElev(alt,tangentM); if(ve==null) return null;
    try{
      const c=skyColour(e,alt,_relAzimuth(),ve).rgb;
      if(!c||!isFinite(c[0])) return null;
      return '#'+[0,1,2].map(i=>Math.max(0,Math.min(255,Math.round(c[i]))).toString(16).padStart(2,'0')).join('');
    }catch(_){ return null; }
  }
  function _horizonColour(){
    const limb=_limbHex(_LIMB_LOW_M); if(limb) return limb;
    const e=_sunElevAtCentre(); if(e==null) return _SKY_H_DAY;
    const t=Math.max(0,Math.min(1,(e+6)/12));
    const rampHex=_mix(_SKY_H_NIGHT,_SKY_H_DAY,t*t*(3-2*t));
    const ramp=[parseInt(rampHex.slice(1,3),16),parseInt(rampHex.slice(3,5),16),parseInt(rampHex.slice(5,7),16)];
    /* ══ ⚠⚠ (#R224) THE +6° CUT-OFF IS GONE, AND WITH IT THE GREY DAYTIME BAND ═════════════════════
       「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。」

       #R213 weighted the model's hue to ZERO above a +6° Sun and said exactly why: at a 0.6° view
       elevation the model returned [111,112,83] at noon — OLIVE — so above the twilight window the
       band fell back to #R196's measured constant #c2ccd1, a NEUTRAL GREY, at every hour and every
       camera. That was the right call for a model that answered olive. It is the wrong call now:
       #R224 found the olive was the march's quadrature (see js/sky-model.js) and the same integral at
       the same 0.6° returns, rescaled to #R196's measured luminance,

           Sun 80°  #b9ceda      Sun 20°  #c0cdce      Sun 6°  #d8c9a9      Sun 2°  #fbc193

       — pale blue at noon, going gold and then orange as the Sun sets, which is what a horizon does
       and what a constant grey never did.
       ⚠ THE WEIGHT IS NOW ON THE MODEL'S OWN CONFIDENCE, NOT ON THE SUN'S ELEVATION. The one case
       where its hue is genuinely meaningless is when it has integrated to black (no starlight, no
       airglow — #R202's floor), so the hue fades out with the model's LUMINANCE rather than at an
       elevation: full below 12 counts, and the two-hex ramp answers when there is nothing to take a
       hue from. ⚠ Only the HUE is taken; the brightness is still #R196's measurement (`k` below), so
       nothing about how bright the band is has moved. */
    try{
      const m=skyColour(e,_eyeAltM(),_relAzimuth(),_HZ_VIEW_ELEV).rgb;
      const lm=_lum(m); if(!(lm>1)) return rampHex;          /* nothing to take a hue from */
      const w=Math.max(0,Math.min(1,lm/12));
      const k=_lum(ramp)/lm;                                  /* the model's colour at the measured brightness */
      const night=[parseInt(_SKY_H_NIGHT.slice(1,3),16),parseInt(_SKY_H_NIGHT.slice(3,5),16),parseInt(_SKY_H_NIGHT.slice(5,7),16)];
      return '#'+[0,1,2].map(i=>{
        const v=ramp[i]+(Math.min(255,m[i]*k)-ramp[i])*w;
        return Math.max(night[i],Math.min(255,Math.round(v))).toString(16).padStart(2,'0');
      }).join('');
    }catch(_){ return rampHex; }
  }
  /* ⚠ (#R213) HOW THICK THE BAND IS, FROM THE GEOMETRY RATHER THAN FROM A CONSTANT.
     `sky-horizon-blend` is where the horizon colour has faded into the sky colour, as a fraction of
     the drawn band. #R196 fixed it at 0.55 from a Cesium capture taken at ONE camera height, and it
     has been that number at every height since — so the limb seen from orbit (where the atmosphere
     subtends about 1.5° and should be a hairline) is drawn as thick as the sky seen from a street
     (where it fills the view). The apparent half-angle of the shell from height h is
     acos(R/(R+h)) − 0 … i.e. how much of the sphere's edge the air occupies, which falls off as the
     camera climbs. Mapped onto the same 0.55 at ground level so nothing measured before moves, and
     down to a thin band at globe height. */
  /* ══ ⚠ (#R221) …AND THE OTHER HALF OF THE BAND'S THICKNESS IS THE SUN ═══════════════════════════
     「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。」 — the fifth round on this line, so it
     starts from what the previous four left. #R196 gave the style a sky at all, #R202 replaced
     `sky-color` with the Rayleigh + Mie integral, #R213 replaced `horizon-color` with it and made
     THIS function depend on the eye's height, #R218 added ozone and #R220 added multiple scattering.
     Everything about the band's COLOUR is now integrated. Its THICKNESS still was not: `_horizonBlend`
     answered from the camera's height alone, so a sunset and a noon at the same height were drawn
     with the same gradient.

     They are not the same gradient, and the reason is in the model already. How fast the sky darkens
     with view elevation is the whole shape of the band — at noon the sight-line at 3° and at 55°
     cross air masses of 19 and 1.2, a ratio of a few, so the gradient is long and gentle; at sunset
     the low ray is 38 air masses of reddened, ozone-absorbed light and the high one is nearly dark,
     so the bright part is compressed into the first few degrees. That ratio IS the thickness, and it
     costs two more evaluations of a function that already runs on the same events.

     ⚠ MULTIPLICATIVE WITH #R213's HEIGHT TERM, NOT A REPLACEMENT. Height and Sun are independent
     reasons for the band to be thin (an orbital limb is a hairline at any hour), and #R213's measured
     mapping is left exactly where it was: at ground level with a high Sun this returns 0.55, which is
     the value #R196 measured off the Cesium capture.

     ⚠ AND IT ONLY BECAME A REAL TERM ONCE THE MIE BUG WAS OUT. Measured against the model AS SHIPPED,
     this ratio moved only between 0.60 and 0.69 across the whole day — a 10 % swing nobody could see,
     and the honest thing would have been to drop the idea. It was the per-channel Mie transmittance
     (see js/sky-model.js) that was flattening it: with that fixed the same measurement runs

         noon, looking at the Sun   ratio 1.000 → blend 0.550     (a long, gentle gradient)
         sunset, looking at it      ratio 0.344 → blend 0.425     (the glow packed into the first few degrees)
         sunset, looking across it  ratio 0.653 → blend 0.492

     which is the shape a real sunset has. Two measurements of the same idea, three hours apart, and
     only the second one earned the code. */
  /* ⚠ THE REFERENCE CONDITION IS THE ONE #R196 MEASURED AT — ground level, high Sun — and the Sun
     factor is NORMALISED so that it returns exactly 1 there. That is what keeps `_horizonBlend()`
     equal to 0.55 for the Cesium capture this whole number came from (#R196), while still thinning
     the band where the model says it is thin. 0.69 is the model's own low/high luminance ratio at
     that condition, measured rather than chosen; the floor keeps a hard sunset at 45 % of it. */
  const _HB_REF=0.69;
  function _horizonBlend(){
    const h=Math.max(0,_eyeAltM());
    const top=100000;                                  /* the shell js/sky-model.js integrates */
    const frac=(h>0)?Math.max(0,Math.min(1,1-Math.log10(1+h/top)/Math.log10(1+40000000/top))):1;
    const byHeight=Math.max(0.14,Math.min(0.55,0.14+0.41*frac));
    const e=_sunElevAtCentre();
    if(e==null) return byHeight;                       /* day/night off, or the Sun is unknown */
    try{
      const az=_relAzimuth();
      const lo=_lum(skyColour(e,h,az,3).rgb), hi=_lum(skyColour(e,h,az,55).rgb);
      if(!(lo>0.5)) return byHeight;                   /* night: there is no band to shape */
      /* r → 1 when the sky is as bright at 55° as at 3° (a long, gentle gradient: noon);
         r → 0 when the low sky is far brighter (the glow packed into the first few degrees). */
      const r=Math.max(0,Math.min(1,hi/lo));
      const k=Math.max(0.45,Math.min(1,Math.sqrt(r/_HB_REF)));
      return +Math.max(0.10,Math.min(0.55,byHeight*k)).toFixed(3);
    }catch(_){ return byHeight; }
  }
  /* ══ ⚠⚠ (#R223) THE GROUND HAZE IS GONE — IT IS NOT A SETTING, IT IS REMOVED ════════════════════
     「衛星画像で地平線付近を白い靄で見えなくするな。クソ機能つけるな。」 (confirmed with the reader:
     remove it on EVERY basemap, not only over satellite imagery.)

     #R216 added aerial perspective here and argued for it from physics: the same Rayleigh scattering
     seen along a horizontal path, which is why a distant ridge is paler than a near one. The physics
     is right and the picture was still wrong, because of what the two knobs actually control.
     `fog-ground-blend` is not "how strong the haze is", it is WHERE ALONG THE GROUND IT STARTS —
     0.62 begins washing at 62 % of the way from the map centre to the horizon and reaches full
     strength at the horizon itself, in `horizon-color`, which on a sunlit day is a pale grey-blue
     (measured on the shipped build: #c2ccd1). Over satellite imagery that is a white curtain across
     the far third of the screen, and the imagery it hides is the thing the reader opened.

     ⚠ THIS FUNCTION IS KEPT rather than deleted, and it keeps returning the pair, because
     `_skyFollowCamera` compares it against the last value to decide whether the sky block needs
     re-parsing. Returning the OFF values from one place is what guarantees there is no second
     opinion anywhere: `fog-ground-blend:1` is "fog only exactly at the horizon" and
     `horizon-fog-blend:0` is "the horizon band is the horizon colour" — i.e. off, both of them,
     at every altitude, on every basemap.
     ⚠ The limb over the globe (`atmosphere-blend`) and the sky band above the horizon
     (`sky-color` / `horizon-color` / `sky-horizon-blend`) are UNTOUCHED — those are the air above
     the horizon, they are what §大気 is about, and none of them paints over the ground. */
  function _aerial(){ return { ground:1, horizon:0 }; }
  /* the eye's own height above sea level — the model's other input, and the reason the sky goes to
     space as you climb rather than only as the Sun sets */
  function _eyeAltM(){
    try{ const a=GE().camera.altitude(); if(isFinite(a)&&a>=0) return a; }catch(_){}
    return 0;
  }
  /* how far the view direction is from the Sun's azimuth — a low Sun ahead of you is not the same
     sky as the same low Sun behind you, and the bearing is something the camera already knows */
  function _relAzimuth(){
    try{
      const s=_sunOverheadPoint(); if(!s) return 90;
      const c=GE().camera.getCenter(); if(!c) return 90;
      const R=Math.PI/180, a=c.lat*R, b=s.lat*R, dl=(s.lng-c.lng)*R;
      const az=Math.atan2(Math.sin(dl)*Math.cos(b), Math.cos(a)*Math.sin(b)-Math.sin(a)*Math.cos(b)*Math.cos(dl))/R;
      let brg=0; try{ brg=GE().camera.getBearing()||0; }catch(_){}
      let d=Math.abs(((az-brg)%360+540)%360-180);
      return d;
    }catch(_){ return 90; }
  }
  function _skyColour(){
    /* (#R222) the far end of the same limb: the ray that grazes at 55 km crosses almost no air, so
       this is where the band has faded into space — and it fades THROUGH the model rather than to a
       constant, which is what puts the deep blue between the bright limb and the black. */
    const limb=_limbHex(_LIMB_HIGH_M);
    if(limb){
      const f=[parseInt(_SKY_SPACE.slice(1,3),16),parseInt(_SKY_SPACE.slice(3,5),16),parseInt(_SKY_SPACE.slice(5,7),16)];
      const c=[parseInt(limb.slice(1,3),16),parseInt(limb.slice(3,5),16),parseInt(limb.slice(5,7),16)];
      return '#'+[0,1,2].map(i=>Math.max(c[i],f[i]).toString(16).padStart(2,'0')).join('');
    }
    const e=_sunElevAtCentre(); if(e==null) return _SKY_SPACE;
    try{
      const c=skyColour(e,_eyeAltM(),_relAzimuth()).rgb;
      /* ⚠ FLOORED AT _SKY_SPACE. The model has no starlight and no airglow, so deep night integrates
         to (0,0,0) — blacker than the sky has ever actually been and blacker than #R196's measured
         value for space. The floor is that measurement; above it the model decides. */
      const f=[parseInt(_SKY_SPACE.slice(1,3),16),parseInt(_SKY_SPACE.slice(3,5),16),parseInt(_SKY_SPACE.slice(5,7),16)];
      return '#'+[0,1,2].map(i=>Math.max(c[i],f[i]).toString(16).padStart(2,'0')).join('');
    }catch(_){ return _SKY_SPACE; }
  }
  /* (#R205) is the MAP basemap the light one? Same rule applyTheme uses for `mapLight` — the map
     colour setting wins, and 'auto' follows the UI theme. Written once, read from both callers
     (applyTheme and _skyFollowCamera), because a second copy of this rule is how the two disagree. */
  function _mapIsLight(){
    try{ const mc=(window.imMapColor||'auto');
      if(mc==='light') return true; if(mc==='dark') return false;
      return (HOST.userTheme==='light')||(HOST.userTheme==='auto'&&window.matchMedia('(prefers-color-scheme: light)').matches);
    }catch(_){ return false; }
  }
  /* ══ ⚠⚠ (#R227) WHO DRAWS THE EARTH'S EDGE ═════════════════════════════════════════════════════
     「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。」 (confirmed: 宇宙から見た地球の縁.)

     #R222 and #R226 both computed this band from js/sky-model.js and wrote it into `horizon-color`,
     and #R227 measured that MapLibre THROWS THE WHOLE SKY BLOCK AWAY while the globe is drawn:
     sky.fragment.glsl ends with `mix(fragColor, vec4(vec3(0.0),0.0), u_sky_blend)` and u_sky_blend
     is `_globeness`, which is 1 there. So none of it was ever drawn, and what the reader saw was
     maplibre's own five-step, ozone-free atmosphere shader. js/limb-layer.js draws the real one.

     ⚠ THE PREDICATE IS THE SAME ONE THE LIMB HEXES ALREADY USED — the eye above the shell
     (`_ATM_TOP_M`) and the Sun's position known — so 「Mapではなにも無し」 (#R221) still decides it:
     with the day/night display off, or on the vector basemap, `_sunElevAtCentre()` is null, this is
     false, and the renderer's own halo stays exactly as it was. `_limbHex` keeps answering for the
     `sky` block because that block IS drawn once the projection leaves the globe. */
  /* (#R237) 0 = a plane, 1 = a sphere. The renderer's own answer, not the projection's NAME. */
  function _globeness(){ try{ const g=GE().camera.globeness; return g?(g()||0):0; }catch(_){ return 0; } }
  /* ══ (#R237) HOW MUCH AIR IS DRAWN IN FRONT OF THE PLANET ════════════════════════════════════════
     「そもそも前まであったものがない」 — what went missing when #R227 took the rim is the air over
     the DISC, which is what maplibre's own pass had been drawing all along (measured: at 16 px inside
     the edge, 88,166,186 with maplibre against 33,103,118 with #R227's ring alone).

     ⚠⚠ AND #R187's AND #R205's NUMBERS DO NOT CARRY OVER. 0.55 / 0.80 / 0.15 are strengths for
     maplibre's `atmosphere-blend`, which is an ADDITIVE term with its own five-step integral — not
     for a composite that multiplies what is behind it by a per-channel transmittance.

     ══ ⚠⚠⚠ (#R238) …AND 0.20 WAS STILL A QUARTER OF WHAT HAD BEEN THERE. MEASURED. ═══════════════
     「いやだからなんで前まであった大気が消えとんねんって言ってんねん」 — the third round on this
     line, and #R237's answer (this constant, at 0.20) was swept BY EYE against screenshots of
     itself. It was never measured against the thing it was restoring. Done properly this round:
     one page load, one camera (globe, z1.2, sub-solar longitude centred, satellite), the SAME
     tiles and the same overlays throughout, mean colour over three concentric rings of the disc at
     0.30 R / 0.75 R / 0.97 R, read inside the `render` event. Luminance, 0.2126R+0.7152G+0.0722B:

         disc strength        0.30 R    0.75 R    0.97 R    rim ÷ inner
         maplibre's own        137.1     138.7     151.2      1.103      ← 「前まであった大気」
         0.20  (#R237)         103.9     101.2     112.5      1.083      ← the report
         0.40                  113.5     114.2     131.0      1.154
         0.60                  121.0     124.4     144.6      1.195
         0.80                  127.6     132.8     155.5      1.219
         1.00                  133.4     140.1     164.2      1.231      ← shipped

     0.20 leaves the globe 25–27 % DARKER than it was before #R227 on every ring, and — the part the
     eye actually reads as air — it flattens the limb-ward gradient to 1.083, i.e. almost no
     brightening toward the edge at all. That is what 「消えた」 names. Nothing about it is a matter
     of taste: the picture at 0.20 has less light in it than the picture the reader is asking to
     have back.

     ⚠ SO THE CONSTANT IS GONE, RATHER THAN RETUNED. 1 is not "the value that measured best" — it is
     `mix(bgL, bgL·T + L, 1)` = `bgL·T + L`, the composite itself, i.e. the air that is actually
     there, drawn. There is no longer a number here for a later round to sweep, and the two ways this
     could be wrong are both structural and both testable: the model (js/sky-model.js) and the march
     (js/limb-layer.js). ⚠ tests/r238 pins the RELATION — that the rim is brighter than the inner
     disc by more than maplibre's own pass managed — not the number.

     ⚠ ONE ANSWER FOR ALL THREE BASEMAPS, and that is a PROPERTY OF THE COMPOSITE rather than a
     shortcut. #R187 and #R205 needed three because an additive term clips over a bright surface —
     Positron measures mean luminance 243, so anything added to it lands on white. Here a bright
     background inverts to a LARGE radiance, which is the flat top of the tone map, so the same
     in-scatter moves it by almost nothing. Measured this round on all three (see #R238 in
     DEV-NOTES): the light basemap moves least of the three, which is the opposite of the direction
     #R205's report feared. The clipping those rounds were tuning against is structural now.

     ⚠ AND THERE IS NO ZOOM TAPER. The old ramps fell to 0 by z15 because maplibre's pass covers the
     whole screen and had to get out of the way of a street. This term is bounded by the PLANET — it
     stops at the ground — and by `globeness`, which reaches 0 while the globe is still a globe.
     Re-applying a zoom taper would put back a softer version of the cliff #R237 removed. */
  /* ══ ⚠⚠⚠ (#R238b) BACK TO #R237's 0.20 — THE 1 WAS MY OWN COMPENSATION FOR A WRONG DIAGNOSIS ═══
     #R238 raised this to 1 because the globe looked 25–27 % darker than it used to, and read that
     as the disc air being too weak. It was not: `atmosphere-blend` had been zeroed by #R227, and
     THAT is what had gone. With the band restored above, a disc strength of 1 adds a second full
     atmosphere on top of the first — measured, inner-disc luminance 169.5 against 96.9 for the
     band alone, and 5 % of the disc past L235, which is #R187's 「質感がチープ」 coming back: the
     Pacific loses its gradients and the globe reads as a pale ball.
     ⚠ This is not a removal — it is undoing a change made in the same round, under a diagnosis
     that turned out to be wrong. 0.20 is #R237's value, swept and shipped, and it is what the
     reader had before today. The thing that was MISSING is restored above, where it was taken. */
  function _discStrength(){ return 0.20; }
  function _limbOwnsRim(){
    try{
      if(_applyLimb._refused) return false;   /* the engine already said it cannot draw it — see below */
      if(_skyIsOwnedElsewhere()||_sunSimOwnsLight()) return false;
      /* ══ ⚠⚠ (#R237) «IS THERE A GLOBE», NOT «IS THE EYE ABOVE 100 km» ═════════════════════════════
         `_eyeAltM()>_ATM_TOP_M` stood here. It is the cliff in 「ある程度までズームインすると途端に
         見えなくなってしまう」: measured on the zoom sweep, ownership flips between z9 (eye 183 km)
         and z10 (eye 92 km), and what it flips TO is maplibre's own pass, which is a 2 px sliver —
         so the air went out in one frame at a fixed zoom. Below the shell the ray starts INSIDE the
         air, which the layer now marches (see js/limb-layer.js and _limbUniforms), so the height of
         the eye is no longer a reason to stop drawing. The gate is the one maplibre uses for its own
         atmosphere — `globeness` — and the strength rides it continuously, so there is no zoom at
         which the two owners disagree and none at which the air disappears in a step. */
      if(!(_globeness()>0)) return false;
      if(_sunElevAtCentre()==null) return false;
      return !!(GE().layers&&GE().layers.addLimb);
    }catch(_){ return false; }
  }
  const _LIMB_ID='im-limb';
  /* ⚠⚠ IT RETURNS WHAT ACTUALLY HAPPENED, AND THE CALLER USES THAT — not what was wanted. The engine
     REFUSES this layer on a context that cannot afford it (no WebGL2, or a software rasteriser — see
     the adapter's addLimb for the measurement). Switching maplibre's own atmosphere off on the
     strength of an intention would then leave those contexts with NO atmosphere at all, which is
     worse than either answer. Measured while writing this: `?rafshim=1` alone gave
     `hasLimb:false, atmosphere-blend:0` — a globe with no air on it. */
  /* ══ ⚠⚠ (#R236) THE RIM IS HANDED OVER ONLY TO SOMETHING THAT IS ACTUALLY DRAWING ══════════════
     「（追記：そもそも消えてしまっている）」 — not "it disappears when you zoom in" (#R234's
     reading) but gone in EVERY state, which is a different defect with a different cause.

     #R227's rule was already the right one — a refusal is told by RESULT, not by intent — but it
     was only ever asked of ONE step: could the layer be added. Two ways past that, both of which
     end with `atmosphere-blend: 0` handed to something that paints nothing:
       · `onAdd` fails on this driver (shader compile/link) — now caught in geo-engine's addLimb,
         which removes the layer and reports the refusal;
       · the layer is alive but its uniforms never resolve, so `render()` returns before the draw
         call every frame. Nothing downstream could tell that from a limb that simply looks faint.

     So ownership is now REVOKED on evidence: once we have claimed the rim, if the layer has still
     painted zero frames after a grace period, the claim is dropped for the session and maplibre's
     own atmosphere pass comes back. ⚠ It is one-way and remembered — a rim that flickered between
     two owners every settle would be worse than either of them, and the reason is a property of
     the GL context rather than of this camera. */
  function _limbPainting(){
    try{ return (GE().layers.limbDrawn?GE().layers.limbDrawn(_LIMB_ID):1)>0; }catch(_){ return true; }
  }
  /* ⚠ THE TEST IS «THE MAP PAINTED AND THE LIMB DID NOT», NOT «TIME PASSED». maplibre only redraws
     when something asks it to, so a rim claimed over a map that then sits still would show zero
     limb frames for any timeout you choose — and revoking on that would take the good limb away
     from every reader whose map happens to be idle. So the map's OWN frames are counted as the
     control: with no frames there is no evidence either way and the watchdog simply waits (nudging
     the renderer so evidence can arrive); it only revokes once the map has demonstrably painted
     frames that the limb was absent from. ⚠ One-way and remembered, for the reason above. */
  function _armLimbWatch(){
    if(_applyLimb._watch) return;
    _applyLimb._watch=1;
    let mapFrames=0, tries=0;
    const onRender=()=>{ mapFrames++; };
    const stop=()=>{ try{ GE().events.off('render',onRender); }catch(_){} };
    try{ GE().events.on('render',onRender); }catch(_){}
    const nudge=()=>{ try{ GE().render.triggerRepaint(); }catch(_){} };
    const check=()=>{
      try{
        if(_limbPainting()){ stop(); return; }              /* it drew — settled, for the session */
        if(mapFrames<8){                                    /* no evidence yet */
          if(++tries<6){ nudge(); setTimeout(check,700); return; }
          stop(); _applyLimb._watch=0; return;              /* never got evidence: change nothing */
        }
        /* the map painted and this layer was not in any of those frames */
        stop();
        _applyLimb._refused=true;
        try{ GE().layers.setLimb(_LIMB_ID,{on:false}); }catch(_){}
        try{ GE().layers.removeLimb(_LIMB_ID); }catch(_){}
        try{ console.warn('[IntMap] limb painted none of '+mapFrames+' frames — atmosphere handed back to the renderer'); }catch(_){}
        _applySkyAtmosphere(HOST.mapType==='sat');          /* re-write the sky block, ramp restored */
      }catch(_){ stop(); }
    };
    nudge(); try{ setTimeout(check,900); }catch(_){}
  }
  function _applyLimb(want){
    try{
      if(_applyLimb._refused) want=false;
      if(want&&!GE().layers.hasLimb(_LIMB_ID)) GE().layers.addLimb(_LIMB_ID);
      const there=!!GE().layers.hasLimb(_LIMB_ID);
      /* ⚠ AND THE REFUSAL IS REMEMBERED. It is a property of the GL context, not of this camera, so
         asking again on every settle would re-run the whole sky block for ever — the wish would say
         yes, the answer would say no, and `_skyFollowCamera`'s comparison would never match. */
      if(want&&!there) _applyLimb._refused=true;
      GE().layers.setLimb(_LIMB_ID,{on:!!(want&&there), disc:_discStrength()});
      if(want&&there) _armLimbWatch();
      return !!(want&&there);
    }catch(_){ return false; }
  }
  function _applySkyAtmosphere(sat){
    if(!GE().hasRenderer()||_skyIsOwnedElsewhere()) return;
    _followClock();
    try{
      _applySkyAtmosphere._on=true;
      _wireSkyFollow();   /* (#R234) the rim handover follows the camera, not the settle — see there */
      /* ══ (#R187) THINNER. THE HALO WAS THE "CHEAP" PART ═════════════════════════════════════════
         「（追記：質感がチープかつ、読み込み時の動作が不安定で視覚的に美しくない。）」 and
         「SatelliteのGlobeの地球の日光当たってる側が、ちょっと明るくしすぎ。」

         Screenshotted at z1.4 over Asia: the globe wore a fat, desaturated white-grey collar, and the
         sunward limb was blown to near-white over the Atlantic. Both come from the same number.
         #R186 set `atmosphere-blend` to 1.0 at z0 — full strength — and full strength is not the
         atmosphere being accurate, it is the accurate scattering integral multiplied until it
         saturates. Once a channel clips there is no colour left in it, which is exactly why an
         optically correct Rayleigh+Mie term ends up looking like a cheap white glow: the blue is
         still being computed and then thrown away by the clip.

         Halved at the wide end and tapered faster, so the limb is a THIN band that still carries its
         own colour — the blue-white close in, the deeper blue above it — and the lit side of the disc
         keeps the imagery's own contrast instead of being washed toward white. The scattering model
         underneath is untouched: this is only how much of it is blended over the globe, which is the
         one knob the spec offers and the one the two reports are about. */
      const hz=_horizonColour(), sc=_skyColour();
      _applySkyAtmosphere._hz=hz; _applySkyAtmosphere._sc=sc;
      const fg=_aerial();
      _applySkyAtmosphere._fog=fg;
      /* ⚠ the layer is added FIRST, because what goes into the sky block below has to be what
         actually happened and not what was wanted — see _applyLimb */
      const limb=_applyLimb(_limbOwnsRim());
      _applySkyAtmosphere._limb=limb;
      GE().scene.setSky({
        'sky-color':sc, 'sky-horizon-blend':_horizonBlend(),   /* (#R213) */
        /* ══ (#R223) THE `fog-*` PAIR IS OFF, AND `_aerial()` IS THE ONLY PLACE THAT SAYS SO ═════════
           #R216 switched aerial perspective ON here; this round switches it back OFF at the reader's
           explicit instruction — 「衛星画像で地平線付近を白い靄で見えなくするな。クソ機能つけるな。」
           The values still come from `_aerial()` rather than being written as literals so there is
           exactly one place to read, and `_skyFollowCamera` keeps comparing the same pair. See the
           long note on `_aerial()` for why the physics was right and the picture was still wrong. */
        'horizon-color':hz, 'horizon-fog-blend':fg.horizon,
        'fog-color':hz, 'fog-ground-blend':fg.ground,
        /* ⚠ TWO STRENGTHS, EACH SETTLED BY ITS OWN MEASUREMENT. #R187 halved this to 0.55 because a
           full-strength limb over BRIGHT SATELLITE IMAGERY clipped to white — 「質感がチープ」. That
           finding is about the imagery, and it stands. Over the dark vector basemap nothing clips and
           0.55 reads as a hairline next to Cesium's halo, so the map basemap gets 0.80 (swept at
           0.55 / 0.80 / 1.00 and screenshotted; past 0.80 the picture stops changing). */
        /* ══ (#R205) …AND A THIRD STRENGTH, FOR THE ONE SURFACE BRIGHTER THAN THE IMAGERY ═══════════
           「ライトモードかつMapを選択した場合、昼の箇所がまぶしすぎて何も見えない。」

           #R187's finding is the whole explanation and it was only ever applied to satellite: a
           full-strength limb over a BRIGHT surface clips to white, and once a channel clips there is
           no picture left in it. The light map basemap (CartoDB Positron) is brighter than satellite
           imagery — the raw z3 tile measures mean luminance **243, with 81 % of its pixels above 235**
           — and it was being blended at the DARK basemap's 0.80. Measured on the day side at z3,
           1440 × 900, sampling only the globe's own pixels:

             blend  0.80 (shipped)  mean [252,253,254]   97.4 % of the disc above L235  ← the report
             blend  0.25            mean [237,245,249]   95.4 %
             blend  0.20            mean [235,242,246]   69.3 %
             blend  0.15            mean [233,239,243]   44.6 %
             blend  0               mean [225,228,228]   40.9 %   (the basemap by itself)

           So the picture survives up to 0.15 and falls off a cliff after it. The light ramp is the
           map ramp scaled by 0.15/0.80 — same shape, same zoom taper, one third of a stop of limb
           left where the eye can still see coastlines under it.
           ⚠ The DARK basemap keeps 0.80 and satellite keeps #R187's 0.55: nothing measured about
           either of them has changed, and this round does not undo a previous round's answer. */
        /* ══ ⚠⚠⚠ (#R238b) THE ZERO IS GONE — IT WAS REMOVED WITHOUT BEING ASKED FOR ═══════════════════
           「ちげーよ Maplibre固有の大気じゃねーよ だからふざけんな 一度つけてんのに勝手に外すな」

           #R227 wrote `limb ? 0 : …` here so its new custom layer would not add to maplibre's pass.
           That was a judgement nobody approved, and it is the ONLY thing in this block that ever
           reached a pixel on the globe — established by diffing R226 against HEAD: `_horizonColour`,
           `_skyColour`, `_limbHex`, `_horizonBlend` and `_eyeAltM`, the five functions that produce
           the band #R213–#R222 built, are BYTE-FOR-BYTE IDENTICAL. Nothing about the band was
           rewritten or lost. One line switched off what carried it to the screen.

           ⚠⚠ THIS IS [[never-act-without-confirming]] AGAIN, AND IT IS THE SAME SHAPE AS #R229.
           #R227 removed a visible thing to make room for its own mechanism; #R228, #R234, #R236,
           #R237 and #R238 then each spent a round making that mechanism better, and not one of them
           asked whether the thing it replaced was wanted. Five rounds of 「どう描くか」 over a
           「消してよいか」 that was never put. The rule is: restore first, ask before removing.

           ⚠ SO BOTH ARE DRAWN NOW. The ramps below are #R187's and #R205's, unchanged and measured;
           js/limb-layer.js keeps drawing the app's own physical air over the disc. They add, which
           is exactly what #R227 avoided — and avoiding it is not a decision this file gets to make
           on its own. If the sum is too strong, that is a number to bring to the reader, not a
           feature to delete. */
        /* ══ ⚠ (#R240) THE STRENGTHS ARE #R187's AND #R205's; THE ZOOM TAPER IS NOT ═══════════════════
           「ある程度までズームインすると途端に見えなくなってしまう」. Measured over a zoom sweep with
           the sun aimed, the air on screen fell 43.7 → 38.5 → 32.3 → 25.6 → 23.9 from z4 to z11 and
           then to 0.00 at z12. Half of that fall was this ramp and it is redundant: maplibre
           multiplies the blend by `projectionTransition`, i.e. by globeness, which is already 0 by
           z12 — the taper was written when the pass covered the whole screen and had to get out of
           the way of a street, and the projection now does that on its own. Holding the value flat
           to z11 is what stops the air thinning out as the reader comes in.
           ⚠ THE z0 NUMBERS ARE UNTOUCHED — 0.55 satellite (#R187), 0.80 dark map, 0.15 light map
           (#R205). Those were swept against real screenshots for clipping over bright surfaces and
           this round has no measurement that argues with them. Only the middle of the curve moved,
           and the tail past z13 stays as a backstop for a renderer that does not apply globeness. */
        'atmosphere-blend':(sat
          ?['interpolate',['linear'],['zoom'],0,0.55,8,0.52,11,0.45,13,0.10,15,0]
          :(_mapIsLight()
            ?['interpolate',['linear'],['zoom'],0,0.15,8,0.142,11,0.123,13,0.027,15,0]
            :['interpolate',['linear'],['zoom'],0,0.80,8,0.76,11,0.66,13,0.15,15,0]))});
      _aimSun();
    }catch(_){}
  }
  /* the horizon band follows the Sun, and the Sun's elevation depends on WHERE the camera is looking
     as much as on the clock — so this is re-evaluated when the camera settles too. It re-sets the sky
     only when the colour has actually moved, because setSky re-parses the block. */
  function _skyFollowCamera(){
    try{ if(!_applySkyAtmosphere._on||_skyIsOwnedElsewhere()) return;
      /* (#R202) …and the far end of the gradient moves with the camera too: climbing out of the
         atmosphere darkens the sky exactly as sunset does, so both ends are compared before the
         block is re-parsed. */
      const hz=_horizonColour(), sc=_skyColour();
      /* (#R216) …and so does the aerial perspective, which is a function of eye height alone — a
         camera that climbs without the Sun moving still has less air in front of it. Comparing only
         the two colours would leave the haze at the value it had on the ground. */
      const fg=_aerial(), of=_applySkyAtmosphere._fog||{};
      /* (#R227) …and WHO owns the rim, which is a function of the eye's height alone: a camera that
         climbs out of the atmosphere without the Sun moving still hands the band over. Comparing
         only the colours would leave maplibre's own halo drawn under ours, or ours switched off. */
      const limb=_limbOwnsRim();
      /* ⚠ (#R240) …and with the day/night side OFF the sun is aimed at the SUB-CAMERA POINT (see
         `_aimSun`), so a pan is exactly what moves it. Nothing else in the comparison below notices
         a pure pan — the colours are a function of the Sun's elevation at the centre, which barely
         changes when the sun IS the centre — so panning would leave the light behind the reader and
         a terminator would walk into view. Re-aim on a moved centre; that is one setLight, not a
         re-parse of the sky block, so it is cheap enough for the per-frame camera hook. */
      if(_nightSideOff()){
        try{ const c=GE().camera.getCenter(), p=_aimSun._at;
          if(c&&isFinite(c.lng)&&(!p||Math.abs(c.lng-p.lng)>0.25||Math.abs(c.lat-p.lat)>0.25)){
            _aimSun._at={lng:c.lng,lat:c.lat}; _aimSun(); } }catch(_){}
      } else { _aimSun._at=null; }
      if(hz===_applySkyAtmosphere._hz&&sc===_applySkyAtmosphere._sc
         &&fg.ground===of.ground&&fg.horizon===of.horizon&&limb===_applySkyAtmosphere._limb) return;
      _applySkyAtmosphere(HOST.mapType==='sat');
    }catch(_){}
  }
  /* ══ ⚠⚠ (#R234) …AND IT HAD TO BE ASKED WHILE THE CAMERA IS STILL MOVING ═══════════════════════
     「MapLibreの地球周辺の大気は、ある程度までズームインすると途端に見えなくなってしまう。」
     Reported for PC + satellite imagery, which is the ONE combination where `_limbOwnsRim()` is
     true: desktop GPU, the globe, and a Sun position (js/limb-layer.js). In that state the app
     writes `atmosphere-blend: 0` and hands the rim to its own layer — and that layer draws a LIMB,
     which is a thing you can only see from OUTSIDE the shell. So the moment the eye descends
     through `_ATM_TOP_M` (100 km, ≈ z8.3) there is nothing for it to draw…

     …and the only thing that noticed was `moveend` (js/app-body.js) and a 60-second interval below.
     A zoom from space to the ground is ONE gesture, so for the whole of it the custom limb has
     nothing to show and maplibre's own halo is switched off waiting for the gesture to end: an
     Earth with no air on it, appearing abruptly at a particular zoom. That is the report.

     ⚠ THE FIX IS THE QUESTION'S TIMING, NOT ITS ANSWER. #R227's own note says ownership "is a
     function of the eye's height alone" — and the eye's height changes continuously, so the
     handover has to be continuous too. It rides js/runtime.js's single camera registration (one
     `_limbOwnsRim()` per frame, all booleans and one altitude), and `_skyFollowCamera` already
     compares before it re-parses, so `setSky` still runs only on the frame the answer flips.
     ⚠ THE RAMPS ARE NOT TOUCHED. #R187 and #R205 measured 0.55 / 0.80 / 0.15 and their zoom taper
     against real screenshots; this round has no pixels to argue with them (#R227/#R230: this
     environment cannot photograph the atmosphere) and does not try. */
  function _wireSkyFollow(){
    if(_wireSkyFollow._done) return;
    const R=window.IntMapRuntime; if(!R||!R.onCamera) return;
    _wireSkyFollow._done=true;
    R.onCamera('themesky.follow',_skyFollowCamera,{phase:'read'});
  }
  /* The sub-solar point moves 15° an hour, and the time machine can move it by years in one step, so
     re-aim the light on the master clock as well as on the basemap switch.

     ⚠ (#R200) THIS SUBSCRIPTION HAD NEVER RUN — not once, on any build, since #R196 wrote it. It was
     a statement in the factory BODY, i.e. it executed the moment js/app-body.js instantiated this
     module, and js/app-body.js creates `window.IntMapTime` about 2,200 lines LATER in the same
     closure. So the guard `window.IntMapTime && window.IntMapTime.on` was false every single time and
     the subscriber list stayed empty: travelling to another date left the sky, the horizon band and
     the scene light on the OLD sun until the 60-second interval below happened to come round. Moving
     the file in #R199 changed nothing about that (the condition is the same before and after), which
     is why it is a #R196 defect rather than a #R199 regression.

     The fix is not a longer guard, it is subscribing at a moment when the clock exists. _followClock()
     is called from _applySkyAtmosphere, which first runs inside map-load — long after IntMapTime is
     built — and it attaches exactly once however many times the theme is re-applied. */
  function _followClock(){
    if(_followClock._on) return false;
    try{
      const T=window.IntMapTime;
      if(!(T&&T.on)) return false;
      _followClock._on=true;
      T.on(()=>{ try{ if(_applySkyAtmosphere._on){ _aimSun(); _skyFollowCamera(); } }catch(_){} });
      return true;
    }catch(_){ return false; }
  }
  setInterval(()=>{ try{ if(!document.hidden&&_applySkyAtmosphere._on){ _aimSun(); _skyFollowCamera(); } }catch(_){} },60000);
  /* ⚠ (#R214) PUBLISHED FROM HERE, NOT FROM js/app-body.js. js/night-side.js is a plain window module
     with no HOST, and it has to be able to ask for the light to be re-decided when the day/night
     setting is flipped on an engine that lights its own globe — the alternative is setting the light
     behind the back of the one function that knows the Sun simulator and the flight sim can own it.
     The first version published it beside the `makeThemeSky` call in js/app-body.js and tests/r200
     ⑤ caught that immediately: eight lines took that file from 4,398 to 4,406 against a 4,400
     ceiling. The ratchet is standing instruction 13 with teeth, and the answer it forces is the right
     one anyway — the object belongs to the file that builds it.
     ⚠ A `window.X` that nothing assigns is the #R162 trap: every caller is inside a try/catch, so a
     missing assignment removes the feature in silence. tests/r214-checks ⑤ holds both ends. */
  window.IntMapThemeSky = { applyTheme, _applySkyAtmosphere, _skyFollowCamera };
  return { applyTheme, _applySkyAtmosphere, _skyFollowCamera };
}
