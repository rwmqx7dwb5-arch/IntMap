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
import { skyColour } from './sky-model.js';
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
  function _aimSun(){ if(_sunSimOwnsLight()||_skyIsOwnedElsewhere()) return false;
    if(_nightSideOff()){
      try{ GE().scene.setSunDirection(null); }catch(_){}
      return false;
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
  function _horizonColour(){
    const e=_sunElevAtCentre(); if(e==null) return _SKY_H_DAY;
    const t=Math.max(0,Math.min(1,(e+6)/12));
    const rampHex=_mix(_SKY_H_NIGHT,_SKY_H_DAY,t*t*(3-2*t));
    const ramp=[parseInt(rampHex.slice(1,3),16),parseInt(rampHex.slice(3,5),16),parseInt(rampHex.slice(5,7),16)];
    const w=Math.max(0,Math.min(1,(6-e)/12));
    if(w<=0) return rampHex;
    try{
      const m=skyColour(e,_eyeAltM(),_relAzimuth(),_HZ_VIEW_ELEV).rgb;
      const lm=_lum(m); if(!(lm>1)) return rampHex;          /* nothing to take a hue from */
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
  /* ══ (#R216) HOW MUCH AIR IS BETWEEN THE EYE AND THE FAR GROUND ═══════════════════════════════
     `fog-ground-blend` is where along the ground the haze STARTS (1 = only exactly at the horizon,
     i.e. off); `horizon-fog-blend` is how far the haze reaches UP into the sky band (0 = off).
     Both are driven by the one quantity that decides how much atmosphere a horizontal view crosses:
     the eye's height. A person on a hill looks through ~100 km of dense air and sees a pale blue
     distance; from 200 km up there is no air between the eye and the ground at all (it is all
     BELOW), and what is left is the limb, which `atmosphere-blend` already draws. So this fades out
     with altitude rather than being a constant, and it is zero above the atmosphere — where a haze
     would be a claim about air that is not in the line of sight.
       ≤ 3 km   ground 0.62 / horizon 0.30   a lived-in distance: ridges pale toward the sky
       15 km    ground 0.80 / horizon 0.16
       ≥ 80 km  off                          above the scattering shell js/sky-model.js integrates
     ⚠ IT MUST NEVER REACH THE MAP CENTRE. `fog-ground-blend` below ~0.5 starts washing the middle of
     the screen, which is the 「白いモヤ」 #R174 removed from the flight simulator; 0.62 is the floor
     here for that reason and the value is clamped rather than extrapolated. */
  function _aerial(){
    const h=Math.max(0,_eyeAltM());
    if(h>=80000) return { ground:1, horizon:0 };
    const f=Math.max(0,Math.min(1,1-Math.log10(1+h/3000)/Math.log10(1+80000/3000)));
    return { ground:+(1-0.38*f).toFixed(3), horizon:+(0.30*f).toFixed(3) };
  }
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
  function _applySkyAtmosphere(sat){
    if(!GE().hasRenderer()||_skyIsOwnedElsewhere()) return;
    _followClock();
    try{
      _applySkyAtmosphere._on=true;
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
      GE().scene.setSky({
        'sky-color':sc, 'sky-horizon-blend':_horizonBlend(),   /* (#R213) */
        /* ══ (#R216) THE AIR BETWEEN THE EYE AND THE GROUND, WHICH WAS THE ONE PART SWITCHED OFF ═════
           「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。」 Everything the previous rounds
           built is about the air ABOVE the horizon — the scattering integral for `sky-color` (#R202),
           the Sun-following band (#R213), the limb over the globe (#R187/#R205). The `fog-*` pair was
           deliberately switched off (see the block comment above: ground-blend 1, horizon-fog-blend 0)
           because Cesium's SkyAtmosphere draws no ground haze and #R196 was matching a Cesium capture.
           But AERIAL PERSPECTIVE is not decoration and it is not Cesium's opinion — it is the same
           Rayleigh scattering, seen along a horizontal path instead of an upward one, and it is why a
           distant ridge is paler and bluer than a near one. With it off, terrain runs to the horizon
           at full contrast and meets the sky at a hard line, which is precisely the un-real part of
           this picture that no amount of tuning the band above it can fix.
           It is switched on WHERE THERE IS AIR TO SEE THROUGH and off where there is not — see
           `_aerial()`. The colour is the horizon colour, so the haze is the same air the band above it
           is drawn from and cannot disagree with it; at night that colour is dark, so this darkens the
           distance rather than fogging it white (#R174's complaint about the flight sim's white wash). */
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
        'atmosphere-blend':(sat
          ?['interpolate',['linear'],['zoom'],0,0.55,4,0.48,7,0.32,10,0.14,13,0.035,15,0]
          :(_mapIsLight()
            ?['interpolate',['linear'],['zoom'],0,0.15,4,0.13,7,0.086,10,0.038,13,0.009,15,0]
            :['interpolate',['linear'],['zoom'],0,0.80,4,0.70,7,0.46,10,0.20,13,0.05,15,0]))});
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
      if(hz===_applySkyAtmosphere._hz&&sc===_applySkyAtmosphere._sc
         &&fg.ground===of.ground&&fg.horizon===of.horizon) return;
      _applySkyAtmosphere(HOST.mapType==='sat');
    }catch(_){}
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
