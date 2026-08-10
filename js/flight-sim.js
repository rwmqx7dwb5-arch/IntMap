/* ============================================================================
 *  IntMap · Flight simulator — IntMapFlightSim  (#R163)
 * ----------------------------------------------------------------------------
 *  A flyable arcade flight model over the real map: coordinated-turn banking, stall, terrain
 *  collision, the MapLibre camera as the cockpit view, HUD, moving map and the result screen.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R163). The values it used
 *  to inherit from that closure are now passed in explicitly — see Architecture.md §3.1.
 *   Reassigned at runtime, so read LIVE through HOST (never captured):
 *      currentLang -> HOST.lang
 *      currentMapType -> HOST.mapType
 *      currentProj -> HOST.proj
 *      terrain3D -> HOST.terrain3D
 *  Never rebound, so bound once under the original name:
 *      imToast
 * 
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.flightSim=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  const imToast=HOST.imToast;
  return (function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { start(){}, stop(){}, active:()=>false };
    const LL=(en,j,de,ru,es)=>HOST.lang==='jp'?j:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?(es||en):en;
    let on=false, hud=null, raf=null, st=null, prevCam=null, styled=false; const keys={};
    /* (#R175) SPAWN CLEARANCE, in one place. An airborne start is normally lifted to ground +1,500 m and
       held above ground +1,200 m until the DEM has settled (#R95) — the pre-flight card gives no altitude,
       so without that a spawn over the Alps loads inside a mountain. A caller that DOES know the altitude
       passes `keepAlt` and gets a bare anti-terrain floor instead. Default unchanged for every old path. */
    const _clrLift=()=>(st&&st._keepAlt)?30:1500, _clrMin=()=>(st&&st._keepAlt)?30:1200;
    let acKey='f35', camMode='cockpit', stabilizeCam=false, paused=false;   /* (#R94p) camera state; default aircraft = F-35 (#R98) */
    /* (#R170) 「終了地点から再飛行するように」 — where the previous flight ENDED (crash site or touchdown point),
       with the heading it ended on. Persisted so it survives a reload, and offered as a start location in the
       pre-flight screen. Written once per flight in showResult(). */
    let lastEnd=null; try{ const _le=JSON.parse(localStorage.getItem('intmap_fs_last')||'null'); if(_le&&isFinite(_le.lng)&&isFinite(_le.lat)) lastEnd=_le; }catch(_){}
    let minimap=null, mmOn=true, mmT=0;   /* (#R96) moving-map / nav-display (track-up mini map) state */
    let resultShown=false;   /* (#R98) a flight ends on a crash or a completed landing → the result screen (path map + fly-again/exit) */
    const HANDLERS=['dragPan','scrollZoom','boxZoom','dragRotate','keyboard','doubleClickZoom','touchZoomRotate','touchPitch'];
    /* ===== (#R94p) FULL RIGID-BODY FLIGHT MODEL ("感性(慣性)や空気抵抗、機体による差…すべてを考慮した完璧なモデル").
       Rebuilt from the 3-DOF R85 model. New physics:
        • ROTATIONAL INERTIA — the stick commands angular ACCELERATION (a moment ÷ inertia), damped; roll/pitch RATES
          integrate to attitude, so a bank HOLDS when you centre the ailerons (it no longer snaps to wings-level) and
          pitch carries momentum. Control power scales with dynamic pressure q̄ (mushy when slow, crisp when fast).
        • FULL AERODYNAMICS — lift CL(α) with a real stall break, parasite + induced drag (CD0 + k·CL²), flap/gear/
          speed-brake drag, thrust that falls with air density (props vs jets differ), ISA air density vs altitude.
        • PER-AIRCRAFT DIFFERENCES — mass, wing area, CL curve/stall, thrust(+afterburner), drag, inertia (roll/pitch
          authority & damping), static stability, never-exceed & stall speed, structural G limit, ceiling.
       Each machine flies distinctly: a Cessna is docile & slow, the airliner is heavy (slow to roll), the F-16 is
       razor-sharp with afterburner, the glider is engineless. ===== */
    /* Each aircraft carries mass + 3-axis moments of inertia (Ix/Iy/Iz), geometry (wing area S, span b, chord c),
       the CL(α)/drag build-up, thrust(+AB), prop angular momentum Hp (gyroscopic/P-factor), and the standard
       NON-DIMENSIONAL stability & control derivatives used by the 6-DOF model:
        drv.Cyb — side force / sideslip     Clb — dihedral (roll ← sideslip)   Clp — roll damping
        Cma — pitch stiffness (stability)   Cmq — pitch damping                Cnb — weathervane (yaw ← sideslip)
        Cnr — yaw damping                   Cnda — adverse yaw (yaw ← aileron)
       Control powers: Clda (aileron→roll), Cmde (elevator→pitch), Cndr (rudder→yaw). Cessna values follow the
       published C172 dataset; the others are scaled to distinct, realistic handling. */
    const _DRV={ Cyb:-0.31, Clb:-0.089, Clp:-0.47, Clr:0.096, Cma:-0.89, Cmq:-12.4, Cm0:0.04, Cnb:0.065, Cnr:-0.099, Cnda:-0.053 };
    const AIRCRAFT={
      cessna:{ name:{en:'Cessna 172 · trainer',jp:'セスナ172 · 練習機',de:'Cessna 172 · Schulflugzeug',ru:'Cessna 172 · учебный',es:'Cessna 172 · escuela'}, icon:'🛩',
        m:1043, S:16.2, b:11.0, c:1.49, Ix:1290, Iy:1825, Iz:2670, Hp:24, propTq:0.9,
        CL0:0.31, CLa:5.14, aStall:0.30, CD0:0.031, k:0.054, Tmax:3400, prop:true, Vne:87, Vstall:27, Vcruise:57, ceil:4100, gLim:4.4, ab:false,
        Clda:0.088, Cmde:-1.12, Cndr:-0.072, drv:{} },
      warbird:{ name:{en:'P-51 Mustang · warbird',jp:'P-51 マスタング · 大戦機',de:'P-51 Mustang',ru:'P-51 Mustang',es:'P-51 Mustang'}, icon:'✈',
        m:4300, S:21.8, b:11.3, c:2.0, Ix:9200, Iy:11000, Iz:19000, Hp:150, propTq:1.6,
        CL0:0.24, CLa:5.6, aStall:0.28, CD0:0.025, k:0.05, Tmax:16000, prop:true, Vne:220, Vstall:43, Vcruise:150, ceil:12700, gLim:8, ab:false,
        Clda:0.06, Cmde:-1.25, Cndr:-0.085, drv:{Cma:-0.9,Cmq:-11,Clp:-0.5,Cnb:0.08,Cnr:-0.12,Cyb:-0.4} },
      airliner:{ name:{en:'Airliner A320 · jet',jp:'旅客機 A320 · ジェット',de:'Verkehrsjet A320',ru:'Авиалайнер A320',es:'Avión A320'}, icon:'🛫',
        m:64000, S:122, b:34, c:4.3, Ix:1.3e6, Iy:3.3e6, Iz:4.5e6, Hp:0, propTq:0,
        CL0:0.22, CLa:5.4, aStall:0.27, CD0:0.021, k:0.043, Tmax:220000, prop:false, Vne:265, Vstall:64, Vcruise:175, ceil:12500, gLim:2.5, ab:false,
        Clda:0.028, Cmde:-1.0, Cndr:-0.08, drv:{Cma:-1.2,Cmq:-18,Clp:-0.45,Cnb:0.12,Cnr:-0.20,Cyb:-0.6,Cnda:-0.02} },
      fighter:{ name:{en:'F-16 · fighter',jp:'F-16 · 戦闘機',de:'F-16 · Jäger',ru:'F-16 · истребитель',es:'F-16 · caza'}, icon:'🚀',
        m:9500, S:27, b:9.4, c:3.45, Ix:12800, Iy:75000, Iz:85000, Hp:0, propTq:0,
        CL0:0.10, CLa:5.2, aStall:0.42, CD0:0.020, k:0.09, Tmax:76000, abMax:127000, prop:false, Vne:600, Vstall:60, Vcruise:230, ceil:15200, gLim:9, ab:true,
        Clda:0.033, Cmde:-1.6, Cndr:-0.09, drv:{Cma:-0.35,Cmq:-5,Clp:-0.35,Cnb:0.09,Cnr:-0.35,Cyb:-1.0,Cnda:-0.004} },
      glider:{ name:{en:'Glider · sailplane',jp:'グライダー · 滑空機',de:'Segelflugzeug',ru:'Планёр',es:'Planeador'}, icon:'🪂',
        m:600, S:15, b:18, c:0.83, Ix:2500, Iy:1150, Iz:3500, Hp:0, propTq:0,
        CL0:0.35, CLa:5.9, aStall:0.30, CD0:0.011, k:0.026, Tmax:0, prop:false, Vne:75, Vstall:19, Vcruise:33, ceil:8000, gLim:5.3, ab:false,
        Clda:0.13, Cmde:-1.4, Cndr:-0.08, drv:{Cma:-1.0,Cmq:-14,Clp:-0.55,Cnb:0.05,Cnr:-0.08,Cyb:-0.3} },
      /* (#R96) F-35A Lightning II — real-ish figures: ~15 t, S 42.7 m², F135 125 kN dry / 191 kN wet, 9 g, M1.6, high-alpha. */
      f35:{ name:{en:'F-35 Lightning II · stealth fighter',jp:'F-35 ライトニングII · ステルス戦闘機',de:'F-35 · Tarnkappenjäger',ru:'F-35 · истребитель-невидимка',es:'F-35 · caza furtivo'}, icon:'⚡',
        m:15000, S:42.7, b:10.7, c:4.3, Ix:18000, Iy:190000, Iz:200000, Hp:0, propTq:0,
        CL0:0.06, CLa:4.9, aStall:0.44, CD0:0.022, k:0.11, Tmax:125000, abMax:191000, prop:false, Vne:590, Vstall:68, Vcruise:240, ceil:15240, gLim:9, ab:true,
        Clda:0.032, Cmde:-1.5, Cndr:-0.085, drv:{Cma:-0.4,Cmq:-6,Clp:-0.4,Cnb:0.10,Cnr:-0.4,Cyb:-1.0,Cnda:-0.004} }
    };
    Object.keys(AIRCRAFT).forEach(k=>{ AIRCRAFT[k].D=Object.assign({},_DRV,AIRCRAFT[k].drv||{}); });   /* merge derivatives over the defaults */
    /* (#R96) extra per-aircraft realism params (applied as an overlay so the verified base figures are untouched):
       elevMax = max elevator/stabilator deflection (rad) — the stick was fed straight into Cmde (1.0 = 57°!) which
       made pitch absurdly twitchy; ctlRate = stick/actuator sweep speed (heavy jets are slower); omMax = body-rate
       cap (rad/s), was a flat ±14 (~800°/s) for everything; fbw = fly-by-wire G-command (auto-limits load factor);
       CDmax = broadside flat-plate drag (deep-stall/tailslide deceleration); thrZ = thrust-line pitch arm (m);
       gLimN = negative-g limit; tailAng = tail-strike pitch on the ground; len = length (m). */
    /* aStallNeg (#R100) = the NEGATIVE-side stall AoA (rad), a real per-aircraft number. The old derived formula
       −aStall+2(CL0+flapCL)/CLa gave a full-flap Cessna ≈ −0.9° (it "stalled" nearly level), which was wrong. */
    /* (#R101) `disp` = the instrument set that gives each machine its own world: props → an analog SIX-PACK, the
       airliner → a glass PFD (+ the moving-map as the ND), fighters → the head-up display. */
    /* (#R120) FUEL SYSTEM — real usable-fuel loads and burn laws: props burn ∝ power setting (burnMax kg/s at
       full throttle, from real max fuel-flow figures); jets burn ∝ THRUST via TSFC (sfc kg/(N·s), dry; sfcAB wet).
       C172 ≈ 144 kg usable (201 L) / ~27 kg/h full-rich; P-51 ≈ 730 kg internal / ~340 kg/h at war power;
       A320 ≈ 18,700 kg (23,860 L), CFM56 cruise TSFC ≈ 0.55 lb/lbf/h; F-16 3,200 kg internal; F-35A 8,280 kg. */
    const _ACX={
      cessna:{ elevMax:0.32, ctlRate:2.0, omMax:3.4, fbw:false, CDmax:1.7, thrZ:-0.12, gLimN:-1.76, tailAng:0.20, len:8.3,  aStallNeg:-0.26, disp:'sixpack', fuelKg:144, burnMax:0.0075 },
      warbird:{ elevMax:0.28, ctlRate:2.0, omMax:4.2, fbw:false, CDmax:1.8, thrZ:-0.10, gLimN:-3.5,  tailAng:0.27, len:9.8,  aStallNeg:-0.24, disp:'sixpack', fuelKg:730, burnMax:0.095 },
      airliner:{ elevMax:0.34, ctlRate:1.4, omMax:2.3, fbw:true,  CDmax:1.5, thrZ:1.2,   gLimN:-1.0,  tailAng:0.19, len:37.6, aStallNeg:-0.21, disp:'glass', fuelKg:18700, sfc:1.56e-5 },
      fighter:{ elevMax:0.44, ctlRate:3.2, omMax:5.6, fbw:true,  CDmax:1.6, thrZ:0,     gLimN:-3.0,  tailAng:0.26, len:15.0, aStallNeg:-0.35, disp:'hud', fuelKg:3200, sfc:2.3e-5, sfcAB:5.8e-5 },
      glider:{  elevMax:0.48, ctlRate:2.4, omMax:3.8, fbw:false, CDmax:1.4, thrZ:0,     gLimN:-2.1,  tailAng:0.16, len:7.0,  aStallNeg:-0.27, disp:'sixpack' },
      f35:{     elevMax:0.42, ctlRate:3.1, omMax:5.4, fbw:true,  CDmax:1.6, thrZ:0,     gLimN:-3.0,  tailAng:0.24, len:15.7, aStallNeg:-0.34, disp:'hud', fuelKg:8280, sfc:2.3e-5, sfcAB:5.8e-5 }
    };
    Object.keys(_ACX).forEach(k=>{ if(AIRCRAFT[k]) Object.assign(AIRCRAFT[k],_ACX[k]); });
    const AKEYS=['cessna','warbird','airliner','fighter','glider','f35'];
    const AC=()=>AIRCRAFT[acKey]||AIRCRAFT.airliner;
    const g0=9.80665;
    /* ===== quaternion attitude (body→world, NED frame) — a quaternion (not Euler angles) so the aircraft can roll
       CONTINUOUSLY, loop over the top and fly inverted with no ±180° gimbal clamp. ===== */
    function qMul(a,b){ return [a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3], a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2], a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1], a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]]; }
    function qNorm(q){ const n=Math.hypot(q[0],q[1],q[2],q[3])||1; return [q[0]/n,q[1]/n,q[2]/n,q[3]/n]; }
    function qConj(q){ return [q[0],-q[1],-q[2],-q[3]]; }
    function qRot(q,v){ const t=[2*(q[2]*v[2]-q[3]*v[1]),2*(q[3]*v[0]-q[1]*v[2]),2*(q[1]*v[1]-q[2]*v[0])]; return [v[0]+q[0]*t[0]+q[2]*t[2]-q[3]*t[1], v[1]+q[0]*t[1]+q[3]*t[0]-q[1]*t[2], v[2]+q[0]*t[2]+q[1]*t[1]-q[2]*t[0]]; }
    function qRotInv(q,v){ return qRot(qConj(q),v); }
    function qFromEuler(r,p,y){ const cr=Math.cos(r/2),sr=Math.sin(r/2),cp=Math.cos(p/2),sp=Math.sin(p/2),cy=Math.cos(y/2),sy=Math.sin(y/2); return [cr*cp*cy+sr*sp*sy, sr*cp*cy-cr*sp*sy, cr*sp*cy+sr*cp*sy, cr*cp*sy-sr*sp*cy]; }
    function qToEuler(q){ const w=q[0],x=q[1],y=q[2],z=q[3]; const roll=Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y)); let sp=2*(w*y-z*x); sp=Math.max(-1,Math.min(1,sp)); const pitch=Math.asin(sp); const yaw=Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z)); return {roll,pitch,yaw}; }
    /* ISA atmosphere — air density falls with altitude (troposphere power law, then exponential above 11 km). */
    function rhoAt(alt){ const a=Math.max(0,alt||0); if(a<11000){ return 1.225*Math.pow(1-0.0065*a/288.15,4.256); } return 0.36392*Math.exp(-(a-11000)/6341.6); }
    /* ===== (#R101) FLIGHT AUDIO — a real synthesized Web-Audio engine (no assets): throttle/RPM/Mach engine tone,
       EAS-linked wind noise, stall horn + airframe buffet, gear/flap servos, touchdown thud + tyre skreel, the
       overspeed clacker and GPWS voice callouts. Built on the START gesture (autoplay-safe). Mute on the HUD deck. */
    const fsAudio=(function(){
      const MASTER_VOL=0.425;   /* (#R102) master flight-sim volume — halved to 50% of the previous 0.85 per request */
      /* (#R171) SILENT BY DEFAULT ("フライトシミュレーターは、サウンドなしをデフォルトに"). The engine tone,
         wind, stall horn and GPWS voice all still exist — the SOUND button on the HUD deck turns them on —
         but a first flight is quiet. The pilot's choice is remembered so turning it on is a one-time act,
         which is what "default" means: it applies until someone decides otherwise. */
      const SND_KEY='intmap_fs_sound';
      const _mutedInit=()=>{ try{ return localStorage.getItem(SND_KEY)!=='on'; }catch(_){ return true; } };
      let ctx=null, on=false, muted=_mutedInit(), master=null, engGain=null, engHi=null, engHiGain=null, engLP=null;
      let windBP=null, windGain=null, stallGain=null, buffetGain=null, buffetLFOg=null, clackLFOg=null;
      const engOscs=[];
      let prevGear=null, prevFlaps=null, prevGround=null, lastGpws=0, calloutState={};
      function noiseBuf(sec){ const n=Math.floor(ctx.sampleRate*(sec||2)); const b=ctx.createBuffer(1,n,ctx.sampleRate); const d=b.getChannelData(0); let last=0; for(let i=0;i<n;i++){ const w=Math.random()*2-1; last=(last+0.02*w)/1.02; d[i]=last*3.5; } return b; }
      /* (#R171) The synth graph is built ON DEMAND, not on every take-off. Silence is now the default, and a
         muted flight that still opened an AudioContext and ran a dozen oscillators into a zeroed gain would be
         "no sound" in name only — the tab would show as playing audio and the browser would keep the audio
         hardware awake. So start() only builds the graph when sound is actually wanted, and un-muting mid-flight
         builds it then (that click is the user gesture autoplay policy needs). */
      function build(){ if(ctx) return; try{ const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return; ctx=new AC(); }catch(_){ ctx=null; return; }
        try{
          master=ctx.createGain(); master.gain.value=0.0001; master.connect(ctx.destination);
          engLP=ctx.createBiquadFilter(); engLP.type='lowpass'; engLP.frequency.value=1200; engLP.connect(master);
          engGain=ctx.createGain(); engGain.gain.value=0; engGain.connect(engLP);
          for(let i=0;i<2;i++){ const o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=70+i*2; o.detune.value=i*7; o.connect(engGain); o.start(); engOscs.push(o); }
          engHiGain=ctx.createGain(); engHiGain.gain.value=0; engHiGain.connect(master);
          engHi=ctx.createOscillator(); engHi.type='triangle'; engHi.frequency.value=400; engHi.connect(engHiGain); engHi.start();
          const windSrc=ctx.createBufferSource(); windSrc.buffer=noiseBuf(2.5); windSrc.loop=true;
          windBP=ctx.createBiquadFilter(); windBP.type='bandpass'; windBP.frequency.value=500; windBP.Q.value=0.7;
          windGain=ctx.createGain(); windGain.gain.value=0; windSrc.connect(windBP); windBP.connect(windGain); windGain.connect(master); windSrc.start();
          const stallOsc=ctx.createOscillator(); stallOsc.type='square'; stallOsc.frequency.value=410; stallGain=ctx.createGain(); stallGain.gain.value=0; stallOsc.connect(stallGain); stallGain.connect(master); stallOsc.start();
          const buffetSrc=ctx.createBufferSource(); buffetSrc.buffer=noiseBuf(2); buffetSrc.loop=true; const bLP=ctx.createBiquadFilter(); bLP.type='lowpass'; bLP.frequency.value=140;
          buffetGain=ctx.createGain(); buffetGain.gain.value=0; buffetSrc.connect(bLP); bLP.connect(buffetGain); buffetGain.connect(master); buffetSrc.start();
          const buffetLFO=ctx.createOscillator(); buffetLFO.type='sine'; buffetLFO.frequency.value=17; buffetLFOg=ctx.createGain(); buffetLFOg.gain.value=0; buffetLFO.connect(buffetLFOg); buffetLFOg.connect(buffetGain.gain); buffetLFO.start();
          /* overspeed clacker = a bright square gated by a ~7 Hz square LFO */
          const clackOsc=ctx.createOscillator(); clackOsc.type='square'; clackOsc.frequency.value=1500; const clackGain=ctx.createGain(); clackGain.gain.value=0; clackOsc.connect(clackGain); clackGain.connect(master); clackOsc.start();
          const clackLFO=ctx.createOscillator(); clackLFO.type='square'; clackLFO.frequency.value=7; clackLFOg=ctx.createGain(); clackLFOg.gain.value=0; clackLFO.connect(clackLFOg); clackLFOg.connect(clackGain.gain); clackLFO.start();
          master.gain.setTargetAtTime(muted?0.0001:MASTER_VOL, ctx.currentTime, 0.3);
        }catch(_){}
        try{ if(ctx&&ctx.state==='suspended') ctx.resume(); }catch(_){} }
      function start(){ if(on) return; on=true; prevGear=null; prevFlaps=null; prevGround=null; lastGpws=0; calloutState={};
        if(!muted) build(); }
      function stop(){ if(!on) return; on=false; try{ if(master&&ctx) master.gain.setTargetAtTime(0.0001,ctx.currentTime,0.15); }catch(_){}
        const c=ctx; setTimeout(()=>{ try{ c&&c.close(); }catch(_){} },300); ctx=null; engOscs.length=0; }
      function servo(dur){ if(!on||!ctx||muted) return; try{ const t=ctx.currentTime; const o=ctx.createOscillator(); o.type='sawtooth'; const g=ctx.createGain(); const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=650;
        o.frequency.setValueAtTime(95,t); o.frequency.linearRampToValueAtTime(150,t+dur*0.5); o.frequency.linearRampToValueAtTime(85,t+dur);
        g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.05,t+0.05); g.gain.setValueAtTime(0.05,t+Math.max(0.06,dur-0.06)); g.gain.linearRampToValueAtTime(0.0001,t+dur);
        o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.05);
        const nb=ctx.createBufferSource(); nb.buffer=noiseBuf(0.2); const ng=ctx.createGain(); const nlp=ctx.createBiquadFilter(); nlp.type='lowpass'; nlp.frequency.value=200;
        ng.gain.setValueAtTime(0.0001,t+dur); ng.gain.linearRampToValueAtTime(0.11,t+dur+0.02); ng.gain.exponentialRampToValueAtTime(0.0001,t+dur+0.15);
        nb.connect(nlp); nlp.connect(ng); ng.connect(master); nb.start(t+dur); nb.stop(t+dur+0.2); }catch(_){} }
      function touchdown(sink,spd){ if(!on||!ctx||muted) return; try{ const t=ctx.currentTime, s=Math.min(1,Math.max(0.15,(sink||1)/4)), sp=Math.min(1,(spd||0)/80);
        const nb=ctx.createBufferSource(); nb.buffer=noiseBuf(0.3); const g=ctx.createGain(); const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=190;
        g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.28*s,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+0.3); nb.connect(lp); lp.connect(g); g.connect(master); nb.start(t); nb.stop(t+0.35);
        const sk=ctx.createBufferSource(); sk.buffer=noiseBuf(0.5); const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1900; bp.Q.value=6; const sg=ctx.createGain();
        sg.gain.setValueAtTime(0.0001,t); sg.gain.linearRampToValueAtTime(0.13*sp,t+0.03); sg.gain.exponentialRampToValueAtTime(0.0001,t+0.45); sk.connect(bp); bp.connect(sg); sg.connect(master); sk.start(t); sk.stop(t+0.5); }catch(_){} }
      function speak(txt){ try{ if(muted||!('speechSynthesis'in window)) return; const u=new SpeechSynthesisUtterance(txt); u.rate=1.15; u.pitch=0.65; u.volume=0.95; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); }catch(_){} }
      const CALLS=[[500,'five hundred'],[100,'one hundred'],[50,'fifty'],[40,'forty'],[30,'thirty'],[20,'twenty'],[10,'ten']];
      function update(st,f,ac){ if(!on||!ctx||!st) return; try{ const t=ctx.currentTime, TC=0.08;
        const rho=rhoAt(st.alt), aSnd=340.3*Math.sqrt(Math.max(0.55,(288.15-0.0065*Math.min(11000,Math.max(0,st.alt)))/288.15));
        const hasEngine=ac.Tmax>0, isProp=!!ac.prop, thr=Math.max(0,Math.min(1,st.thr||0));
        if(!hasEngine){ engGain.gain.setTargetAtTime(0,t,TC); engHiGain.gain.setTargetAtTime(0,t,TC); }
        else if(isProp){ const f0=42+thr*95; engOscs.forEach((o,i)=>o.frequency.setTargetAtTime(f0*(1+i*0.012),t,TC)); engGain.gain.setTargetAtTime(0.14+thr*0.34,t,TC); engHi.frequency.setTargetAtTime(f0*4,t,TC); engHiGain.gain.setTargetAtTime(0.03+thr*0.05,t,TC); engLP.frequency.setTargetAtTime(700+thr*1400,t,TC); }
        else { const f0=52+thr*80, mach=st.V/aSnd; engOscs.forEach((o,i)=>o.frequency.setTargetAtTime(f0*(1+i*0.012),t,TC)); engGain.gain.setTargetAtTime(0.12+thr*0.26+(st._ab?0.18:0),t,TC); engHi.frequency.setTargetAtTime(380+thr*1500+mach*300,t,TC); engHiGain.gain.setTargetAtTime(0.04+thr*0.11,t,TC); engLP.frequency.setTargetAtTime(1400+thr*2200+(st._ab?1500:0),t,TC); }
        const eas=st.V*Math.sqrt(Math.max(0.05,rho/1.225)); windGain.gain.setTargetAtTime(Math.min(0.5,Math.pow(eas/115,2)*0.5),t,0.05); windBP.frequency.setTargetAtTime(320+eas*6,t,0.1);
        stallGain.gain.setTargetAtTime(f.stalling?0.10:0,t,0.03);
        buffetLFOg.gain.setTargetAtTime((f.stalling||f.overspeed)?0.30:0,t,0.05);
        clackLFOg.gain.setTargetAtTime(f.overspeed?0.12:0,t,0.03);
        /* gear / flap servos + touchdown (state-change triggered) */
        if(prevGear!==null && Math.round(st.gear)!==Math.round(prevGear)) servo(1.0);
        if(prevFlaps!==null && Math.abs(st.flaps-prevFlaps)>0.05) servo(0.55);
        prevGear=st.gear; prevFlaps=st.flaps;
        if(prevGround===false && st.onGround===true) touchdown(-st.vs, st.V);
        prevGround=st.onGround;
        /* GPWS: altitude callouts on approach + terrain/sink-rate/gear warnings */
        const agl=Math.max(0,(f&&f.agl!=null)?f.agl:(st.alt-(st.lastTerr||0))), descent=-st.vs, now=performance.now();
        if(agl>600) calloutState={};
        else if(!st.onGround && st.gear>0.5 && descent>0.2){ CALLS.forEach(c=>{ const hm=c[0]*0.3048; if(!calloutState['a'+c[0]] && agl<=hm+2 && agl>hm-9){ calloutState['a'+c[0]]=1; speak(c[1]); } }); }
        if(!st.onGround){ if(agl<45 && descent>6 && now-lastGpws>1600){ lastGpws=now; speak('pull up'); }
          else if(agl<300 && descent>18 && now-lastGpws>2600){ lastGpws=now; speak('sink rate'); }
          else if(agl<130 && st.gear<0.5 && st.V<ac.Vne*0.55 && now-lastGpws>3200){ lastGpws=now; speak('too low, gear'); } }
      }catch(_){} }
      function toggleMute(){ muted=!muted; try{ localStorage.setItem(SND_KEY,muted?'off':'on'); }catch(_){}   /* (#R171) remember the pilot's choice */
        if(!muted&&on&&!ctx) build();   /* (#R171) first un-mute of a silent flight — build the synth now, riding this click */
        try{ if(master&&ctx) master.gain.setTargetAtTime(muted?0.0001:MASTER_VOL,ctx.currentTime,0.1); }catch(_){}
        try{ if(muted&&'speechSynthesis'in window) window.speechSynthesis.cancel(); }catch(_){}   /* silence a GPWS callout already in the air */
        return muted; }
      return { start, stop, update, toggleMute, isMuted:()=>muted, active:()=>on };
    })();
    function css(){ if(styled) return; styled=true; const s=document.createElement('style'); s.id='fs-style';
      s.textContent='#fs-hud{position:fixed;left:0;right:0;bottom:0;top:0;z-index:6002;pointer-events:none;font-family:ui-monospace,Menlo,Consolas,monospace;color:#e8f4ff;}'
        /* (#R85c) INDEPENDENT FULLSCREEN cockpit ("既存画面にオーバーレイするのではなく独立した全画面で"): the map is
           lifted to cover the whole viewport above all app chrome, map controls are hidden, and a HUD vignette frames it.
           (#R102) z-index raised to 6000+ so the cockpit sits ABOVE the workspace-mode top menu bar (5990) and ticker (5985). */
        +'body.fs-flying{overflow:hidden !important;}'
        /* (#R174) #R173's painted sky is GONE — 「空を勝手に描くな！不自然」. The sky belongs to the renderer
           (see the setSky call in start()); the sim draws nothing behind the map. */
        +'body.fs-flying #map-container{position:fixed !important;inset:0 !important;width:100vw !important;height:100vh !important;max-width:none !important;min-width:0 !important;margin:0 !important;z-index:6000 !important;border-radius:0 !important;}'
        /* (#R102) WORKSPACE MODE: the map lives inside a .ws-win (z-index:900) whose stacking context TRAPS the promoted
           #map-container — so the fullscreen map was hidden behind the sibling windows/ticker/menu ("開始すると画面が
           真っ黒"). Lift the whole MAP WINDOW to fullscreen above every chrome layer, hide its title bar/grip, and hide the
           other windows + menu + ticker for the duration of the flight (fullscreen WITHIN IntMap, not desktop fullscreen). */
        +'body.fs-flying .ws-win.ws-map{position:fixed !important;inset:0 !important;left:0 !important;top:0 !important;width:100vw !important;height:100vh !important;z-index:6000 !important;border:none !important;border-radius:0 !important;box-shadow:none !important;background:#000 !important;}'
        +'body.fs-flying .ws-win.ws-map .ws-tb,body.fs-flying .ws-win.ws-map .ws-grip{display:none !important;}'
        +'body.fs-flying #ws-menu,body.fs-flying #ticker-bar,body.fs-flying .ws-win:not(.ws-map){display:none !important;}'
        +'body.fs-flying #map-search,body.fs-flying .map-controls-top,body.fs-flying .maplibregl-control-container,body.fs-flying #coord-readout,body.fs-flying .ai-view-summary-btn,body.fs-flying #layer-sidebar-r,body.fs-flying #lsr-toggle,body.fs-flying .sat-controller,body.fs-flying #sat-controller,body.fs-flying .btn-toggle-sidebar,body.fs-flying .data-legend,body.fs-flying .koppen-legend,body.fs-flying #news-timeline,body.fs-flying .maplibregl-popup{display:none !important;}'   /* (#R117) + any already-open feature popup stays hidden during flight */   /* (#R103) hide the time-machine button during flight */
        +'#fs-hud .fs-vign{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 200px 34px rgba(0,0,0,0.5),inset 0 0 70px 0 rgba(0,0,0,0.28);}'
        +'#fs-hud .fs-ladder{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;}'
        +'#fs-hud .fs-bore{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);pointer-events:none;filter:drop-shadow(0 0 3px rgba(0,0,0,0.7));}'
        +'#fs-hud .fs-panel{position:absolute;background:rgba(6,14,24,0.42);border:1px solid rgba(120,190,255,0.35);border-radius:10px;padding:8px 11px;backdrop-filter:blur(3px);}'
        +'#fs-hud .fs-tl{left:14px;top:14px;min-width:120px;} #fs-hud .fs-tr{right:14px;top:14px;text-align:right;min-width:120px;}'
        +'#fs-hud .fs-k{font-size:10px;color:#8fb8e0;letter-spacing:0.04em;} #fs-hud .fs-v{font-size:20px;font-weight:700;line-height:1.1;}'
        +'#fs-hud .fs-adi{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);width:150px;height:150px;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.5));}'
        +'#fs-hud .fs-thr{position:absolute;left:14px;bottom:20px;width:24px;height:150px;background:rgba(6,14,24,0.42);border:1px solid rgba(120,190,255,0.35);border-radius:7px;overflow:hidden;}'
        +'#fs-hud .fs-thrfill{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(#34c759,#ffd60a,#ff453a);}'
        +'#fs-hud .fs-thrlbl{position:absolute;left:14px;bottom:174px;font-size:10px;color:#8fb8e0;}'
        +'#fs-hud .fs-hint{position:absolute;left:64px;bottom:16px;font-size:10.5px;color:#bcd6f0;text-align:left;line-height:1.6;background:rgba(6,14,24,0.42);border:1px solid rgba(120,190,255,0.3);border-radius:9px;padding:7px 10px;}'   /* (#R100) moved off the bottom-right so it no longer overlaps the minimap */
        +'#fs-hud .fs-warn{position:absolute;left:50%;top:116px;transform:translateX(-50%);font-size:22px;font-weight:800;color:#ff453a;text-shadow:0 2px 8px #000;display:none;background:rgba(6,10,18,0.55);border-radius:8px;padding:2px 14px;white-space:nowrap;z-index:8;}'   /* (#R117) fixed slot BELOW the heading tape + badge + config chips — no more overlap with the fighter heading tape */
        +'#fs-hud .fs-x{position:absolute;right:14px;top:112px;pointer-events:auto;background:rgba(255,69,58,0.85);border:none;color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;}'   /* (#R100) below the altitude panel (was overlapping it) */
        +'#fs-hud .fs-heading{position:absolute;left:50%;top:14px;transform:translateX(-50%);font-size:22px;font-weight:700;background:rgba(6,14,24,0.42);border:1px solid rgba(120,190,255,0.35);border-radius:9px;padding:4px 14px;}'
        +'#fs-hud .fs-btns{position:absolute;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);display:none;gap:26px;pointer-events:auto;z-index:9;}'
        +'#fs-hud .fs-btns button{min-width:64px;height:44px;border-radius:22px;border:1px solid rgba(120,190,255,0.4);background:rgba(6,14,24,0.55);color:#e8f4ff;font-size:12px;font-weight:700;padding:0 12px;}'
        /* (#R117) analog touch stick (right thumb): pitch + roll with natural centre return; knob follows the finger */
        +'#fs-hud .fs-stick{position:absolute;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));width:132px;height:132px;border-radius:50%;background:radial-gradient(circle,rgba(10,22,38,0.30),rgba(6,14,24,0.55));border:1.5px solid rgba(120,190,255,0.40);display:none;pointer-events:auto;touch-action:none;z-index:9;}'
        +'#fs-hud .fs-stick-knob{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:rgba(120,190,255,0.28);border:1.5px solid rgba(160,215,255,0.75);box-shadow:0 2px 8px rgba(0,0,0,0.5);}'
        +'@media(hover:none){#fs-hud .fs-btns{display:flex;left:calc(70px + env(safe-area-inset-left,0px));transform:none;} #fs-hud .fs-stick{display:block;} #fs-hud .fs-adi{bottom:70px;}'
          +'#fs-hud .fs-thr{width:40px;pointer-events:auto;touch-action:none;height:140px;bottom:calc(20px + env(safe-area-inset-bottom,0px));} #fs-hud .fs-thrlbl{bottom:calc(166px + env(safe-area-inset-bottom,0px));}'
          +'#fs-hud .fs-minimap{left:8px;right:auto;bottom:calc(170px + env(safe-area-inset-bottom,0px));} #fs-hud .fs-act{min-width:48px;height:44px;}}'
        /* (#R118) LANDSCAPE phones — verified zone layout: top band = panels/badge/tape · centre band = instruments ·
           bottom band = throttle(L) / rudder(C) / minimap+stick(R); deck = 2-col column on the centre-left. */
        +'@media(hover:none) and (max-height:480px){'
          +'#fs-hud .fs-deck{grid-template-columns:repeat(2,minmax(56px,1fr));top:130px;bottom:auto;transform:none;right:auto;left:64px;}'
          +'#fs-hud .fs-sixpack{grid-template-columns:repeat(6,48px);grid-auto-rows:48px;gap:4px;bottom:auto;top:104px;} #fs-hud .fs-g6-cap{font-size:6px;bottom:6px;}'
          +'#fs-hud .fs-pfd{left:50%;right:auto;transform:translateX(-50%);top:100px;width:300px;height:150px;}'
          +'#fs-hud .pfd-att,#fs-hud .pfd-hdg{left:44px;right:44px;} #fs-hud .pfd-tape{width:44px;}'
          +'#fs-hud .fs-warn{top:160px;font-size:16px;}'
          +'#fs-hud .fs-adi{width:104px;height:104px;bottom:12px;}'
          +'#fs-hud .fs-panel.fs-tl{left:8px;top:8px;min-width:0;padding:4px 8px;} #fs-hud .fs-panel.fs-tr{right:8px;top:8px;min-width:0;padding:4px 8px;}'
          +'#fs-hud .fs-tl .fs-v,#fs-hud .fs-tr .fs-v{font-size:14px;}'
          +'#fs-hud .fs-minimap{left:auto;right:164px;bottom:12px;width:112px;height:112px;}'
        +'}'
        /* (#R84) game-grade HUD: scrolling heading tape, banking aircraft symbol, altitude sky tint, boost bar */
        +'#fs-hud .fs-htape{position:absolute;left:50%;top:12px;transform:translateX(-50%);width:min(360px,64vw);height:26px;overflow:hidden;background:rgba(6,14,24,0.5);border:1px solid rgba(120,190,255,0.35);border-radius:8px;}'
        +'#fs-hud .fs-htape-strip{position:absolute;top:0;bottom:0;left:0;will-change:transform;}'
        +'#fs-hud .fs-htick{position:absolute;top:4px;font-size:11px;color:#bcd6f0;transform:translateX(-50%);}'
        +'#fs-hud .fs-htape-ptr{position:absolute;left:50%;top:0;bottom:0;width:2px;background:#ffd60a;transform:translateX(-50%);}'
        +'#fs-hud .fs-hdg-box{position:absolute;left:50%;top:28px;transform:translateX(-50%);background:rgba(6,14,24,0.7);border:1px solid #ffd60a;border-radius:5px;padding:1px 8px;font-size:14px;font-weight:700;color:#ffd60a;}'
        +'#fs-hud .fs-ladder-g line{stroke:#63ff9b;stroke-width:2.4;} #fs-hud .fs-ladder-g text{fill:#63ff9b;font-family:ui-monospace,monospace;font-size:19px;font-weight:600;} #fs-hud .fs-ladder-g .fs-dive{stroke-dasharray:14 10;}'
        /* (#R96) moving-map / nav-display: a small track-up map that follows the aircraft (like a car-nav / FlightRadar mini-map) */
        +'#fs-hud .fs-minimap{position:absolute;right:14px;bottom:74px;width:174px;height:174px;border-radius:14px;overflow:hidden;border:1.5px solid rgba(120,190,255,0.5);box-shadow:0 4px 16px rgba(0,0,0,0.55);background:#0a1420;pointer-events:none;z-index:7;}'
        +'#fs-hud .fs-mm-map{position:absolute;inset:0;} #fs-hud .fs-minimap .maplibregl-ctrl-attrib,#fs-hud .fs-minimap .maplibregl-control-container{display:none !important;}'
        +'#fs-hud .fs-mm-ac{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;filter:drop-shadow(0 0 3px rgba(0,0,0,0.95));z-index:2;}'
        +'#fs-hud .fs-mm-n{position:absolute;left:8px;top:7px;width:18px;height:18px;pointer-events:none;z-index:2;filter:drop-shadow(0 1px 2px #000);}'
        +'#fs-hud .fs-mm-lbl{position:absolute;left:0;right:0;bottom:0;font-size:9.5px;color:#cfe6ff;background:rgba(6,14,24,0.62);text-align:center;padding:2px 0;pointer-events:none;letter-spacing:0.02em;z-index:2;}'
        +'@media(max-width:640px){#fs-hud .fs-minimap{width:118px;height:118px;bottom:150px;right:8px;}}'
        +'@media(max-height:720px) and (min-width:641px){#fs-hud .fs-minimap{width:128px;height:128px;}}'   /* (#R117) shorter desktop windows: smaller map keeps clear of the 2-col deck */
        +'#fs-hud .fs-sky{position:absolute;inset:0;pointer-events:none;background:radial-gradient(120% 90% at 50% -10%, rgba(10,30,80,0.0), rgba(4,10,30,0.0) 60%, rgba(2,6,20,0.55) 100%);opacity:0;transition:opacity .4s ease;}'
        +'#fs-hud .fs-boost{position:absolute;left:44px;bottom:20px;width:8px;height:150px;background:rgba(6,14,24,0.42);border:1px solid rgba(255,140,60,0.4);border-radius:5px;overflow:hidden;}'
        +'#fs-hud .fs-boostfill{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(#ff9f0a,#ff453a);height:0;}'
        /* (#R119) PAPI lights (shown on approach to the spawn runway: white=high, red=low, 2+2=on the 3° path) */
        +'#fs-hud .fs-papi{position:absolute;left:14px;bottom:196px;display:none;align-items:center;gap:4px;background:rgba(6,14,24,0.5);border:1px solid rgba(120,190,255,0.3);border-radius:8px;padding:5px 8px;pointer-events:none;z-index:5;}'
        +'#fs-hud .fs-papi i{width:10px;height:10px;border-radius:50%;background:#ff3b30;box-shadow:0 0 5px currentColor;display:block;}'
        +'#fs-hud .fs-papi .fs-papi-lbl{font-size:8.5px;color:#8fb8e0;margin-left:3px;letter-spacing:0.05em;}'
        +'@media(max-width:640px){#fs-hud .fs-papi{left:8px;bottom:calc(286px + env(safe-area-inset-bottom,0px));}}'
        /* (#R120) ILS box — crosshair + fly-to localizer (vertical bar, moves left/right) & glide-slope (horizontal bar, moves up/down) */
        +'#fs-hud .fs-ils{position:absolute;left:14px;bottom:236px;display:none;flex-direction:column;align-items:center;gap:3px;background:rgba(6,14,24,0.5);border:1px solid rgba(120,190,255,0.3);border-radius:8px;padding:6px 8px;pointer-events:none;z-index:5;}'
        +'#fs-hud .fs-ils-scale{position:relative;width:54px;height:54px;}'
        +'#fs-hud .fs-ils-scale::before{content:"";position:absolute;left:0;top:50%;width:100%;height:0;border-top:1px dotted rgba(143,184,224,0.55);}'
        +'#fs-hud .fs-ils-scale::after{content:"";position:absolute;top:0;left:50%;height:100%;width:0;border-left:1px dotted rgba(143,184,224,0.55);}'
        +'#fs-hud .fs-ils-loc{position:absolute;top:4%;left:50%;width:3px;height:92%;margin-left:-1.5px;background:#63ff9b;border-radius:2px;box-shadow:0 0 5px rgba(99,255,155,0.7);transition:left 0.15s linear;}'
        +'#fs-hud .fs-ils-gs{position:absolute;left:4%;top:50%;height:3px;width:92%;margin-top:-1.5px;background:#63ff9b;border-radius:2px;box-shadow:0 0 5px rgba(99,255,155,0.7);transition:top 0.15s linear;}'
        +'#fs-hud .fs-ils-lbl{font-size:8.5px;color:#8fb8e0;letter-spacing:0.05em;white-space:nowrap;}'
        +'@media(max-width:640px){#fs-hud .fs-ils{left:8px;bottom:calc(326px + env(safe-area-inset-bottom,0px));}}'
        /* (#R94p) aircraft badge + configuration chips (flaps/gear/camera) + side control decks */
        +'#fs-hud .fs-acbadge{position:absolute;left:50%;top:52px;transform:translateX(-50%);background:rgba(6,14,24,0.52);border:1px solid rgba(120,190,255,0.32);border-radius:8px;padding:3px 12px;font-size:12px;font-weight:700;color:#cfe6ff;white-space:nowrap;}'
        +'#fs-hud .fs-config{position:absolute;left:50%;top:80px;transform:translateX(-50%);display:flex;gap:6px;pointer-events:none;}'
        +'#fs-hud .fs-cfg{font-size:10px;font-weight:700;letter-spacing:0.03em;color:#8fb8e0;background:rgba(6,14,24,0.45);border:1px solid rgba(120,190,255,0.25);border-radius:6px;padding:2px 7px;white-space:nowrap;}'
        +'#fs-hud .fs-cfg.on{color:#04120a;background:#63ff9b;border-color:#63ff9b;}'
        +'#fs-hud .fs-mach{font-size:10px;color:#8fb8e0;margin-left:9px;padding-left:9px;border-left:1px solid rgba(120,190,255,0.3);}'   /* (#R99) separate the EAS/Mach from the aircraft name — they used to run together */
        +'#fs-hud .fs-aircraft{position:absolute;left:14px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:5px;pointer-events:auto;z-index:6;}'
        +'#fs-hud .fs-acchip{font-size:11px;font-weight:600;color:#cfe6ff;background:rgba(6,14,24,0.55);border:1px solid rgba(120,190,255,0.3);border-radius:8px;padding:5px 9px;cursor:pointer;text-align:left;white-space:nowrap;transition:.15s;}'
        +'#fs-hud .fs-acchip.on{background:#0a84ff;border-color:#0a84ff;color:#fff;}'
        +'#fs-hud .fs-deck{position:absolute;right:14px;top:50%;transform:translateY(-50%);display:grid;grid-template-columns:repeat(2,minmax(60px,1fr));gap:5px;pointer-events:auto;z-index:6;}'   /* (#R117) 2-column grid — half the height, so the deck no longer reaches down into the minimap on shorter windows */
        +'#fs-hud .fs-act{min-width:60px;height:38px;font-size:11px;font-weight:700;color:#e8f4ff;background:rgba(6,14,24,0.55);border:1px solid rgba(120,190,255,0.32);border-radius:9px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.15;transition:.15s;}'
        +'#fs-hud .fs-act small{font-size:8.5px;color:#8fb8e0;font-weight:600;}'
        +'#fs-hud .fs-act.on{background:#34c759;border-color:#34c759;color:#04120a;} #fs-hud .fs-act.on small{color:#04120a;}'
        +'#fs-hud .fs-act.amber.on{background:#ff9f0a;border-color:#ff9f0a;}'
        +'@media(max-width:640px){#fs-hud .fs-deck{top:auto;bottom:calc(158px + env(safe-area-inset-bottom,0px));transform:none;right:8px;} #fs-hud .fs-act{min-width:48px;height:44px;} #fs-hud .fs-hint{display:none;}}'   /* (#R117) ≥44px touch targets; the deck sits above the stick zone */
        /* (#R101) analog SIX-PACK (Cessna / warbird / glider) — 2×3 round gauges, bottom-centre */
        +'#fs-hud .fs-sixpack{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:grid;grid-template-columns:repeat(3,90px);grid-auto-rows:90px;gap:9px;pointer-events:none;z-index:5;}'
        +'#fs-hud .fs-g6{position:relative;width:90px;height:90px;background:radial-gradient(circle at 50% 40%,#212832,#0a0e13);border:2px solid #313b46;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,0.6),inset 0 0 0 3px #05080b;}'
        +'#fs-hud .fs-g6 svg{position:absolute;inset:0;width:100%;height:100%;}'
        +'#fs-hud .fs-g6-cap{position:absolute;left:0;right:0;bottom:12px;text-align:center;font-size:7.5px;font-weight:700;color:#8ea3b8;letter-spacing:0.06em;}'
        +'#fs-hud .fs-g6 text{fill:#c7d4e2;font-family:ui-monospace,monospace;}'
        +'#fs-hud .fs-g6 .g6-tick{stroke:#8496a8;stroke-width:1.3;} #fs-hud .fs-g6 .g6-tickm{stroke:#c7d4e2;stroke-width:1.8;}'
        +'#fs-hud .fs-g6 .g6-nd{stroke:#f4f7fb;stroke-width:2.6;stroke-linecap:round;} #fs-hud .fs-g6 .g6-nd2{stroke:#f4f7fb;stroke-width:1.6;stroke-linecap:round;}'
        +'#fs-hud .fs-g6 .g6-dig{fill:#eef4fb;font-size:10px;font-weight:700;} #fs-hud .fs-g6 .g6-red{stroke:#ff453a;stroke-width:2.4;} #fs-hud .fs-g6 .g6-grn{stroke:#34c759;stroke-width:2.4;}'
        /* (#R118) MOBILE COCKPIT REDESIGN ("全然モバイル版対応になっていない"): instruments move to the TOP band
           (one 6-gauge row / compact PFD top-centre), the bottom band belongs to the CONTROLS only —
           throttle (left) · rudder pair (centre) · stick (right) · deck above the stick — nothing overlaps. */
        +'@media(max-width:640px){#fs-hud .fs-sixpack{grid-template-columns:repeat(6,54px);grid-auto-rows:54px;gap:4px;bottom:auto;top:146px;}'
          +'#fs-hud .fs-g6-cap{font-size:6.5px;bottom:7px;}'
          +'#fs-hud .fs-pfd{left:50%;right:auto;transform:translateX(-50%);top:142px;width:min(320px,94vw);height:190px;}'
          +'#fs-hud .pfd-att,#fs-hud .pfd-hdg{left:46px;right:46px;} #fs-hud .pfd-tape{width:46px;}'
          +'#fs-hud .fs-warn{top:340px;font-size:18px;}'
          +'#fs-hud .fs-x{top:8px;right:8px;padding:5px 10px;font-size:11px;}'
          +'#fs-hud .fs-panel.fs-tl{left:8px;top:100px;min-width:0;padding:5px 8px;} #fs-hud .fs-panel.fs-tr{right:8px;top:100px;min-width:0;padding:5px 8px;}'
          +'#fs-hud .fs-tl .fs-v,#fs-hud .fs-tr .fs-v{font-size:15px;}'
          +'#fs-hud .fs-minimap{left:8px;right:auto;bottom:calc(170px + env(safe-area-inset-bottom,0px));width:104px;height:104px;}'
          +'#fs-hud .fs-adi{width:110px;height:110px;bottom:auto;top:146px;}'
          +'#fs-hud .fs-htape{width:56vw;}'
        +'}'
        /* (#R101) glass PFD (airliner) — speed tape · attitude · altitude tape · heading strip (the ND is the moving-map) */
        +'#fs-hud .fs-pfd{position:absolute;left:16px;top:50%;transform:translateY(-50%);width:296px;height:300px;background:#090d13;border:2px solid #1c2530;border-radius:10px;overflow:hidden;pointer-events:none;z-index:5;box-shadow:0 6px 20px rgba(0,0,0,0.6);}'
        +'#fs-hud .pfd-att{position:absolute;left:54px;right:54px;top:0;bottom:22px;overflow:hidden;}'
        +'#fs-hud .pfd-att svg{position:absolute;inset:0;width:100%;height:100%;}'
        +'#fs-hud .pfd-tape{position:absolute;top:0;bottom:22px;width:54px;overflow:hidden;background:rgba(8,13,20,0.74);}'
        +'#fs-hud .pfd-spd{left:0;border-right:1px solid #1c2530;} #fs-hud .pfd-alt{right:0;border-left:1px solid #1c2530;}'
        +'#fs-hud .pfd-strip{position:absolute;left:0;right:0;top:50%;will-change:transform;}'
        +'#fs-hud .pfd-tk{position:absolute;right:5px;font-size:11px;color:#cfe0f0;transform:translateY(-50%);font-family:ui-monospace,monospace;white-space:nowrap;}'
        +'#fs-hud .pfd-alt .pfd-tk{left:6px;right:auto;}'
        +'#fs-hud .pfd-box{position:absolute;left:1px;right:1px;top:50%;transform:translateY(-50%);height:24px;background:#000;border:1px solid #39cfff;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;z-index:2;font-family:ui-monospace,monospace;}'
        +'#fs-hud .pfd-hdg{position:absolute;left:54px;right:54px;bottom:0;height:22px;background:rgba(8,13,20,0.82);overflow:hidden;border-top:1px solid #1c2530;}'
        +'#fs-hud .pfd-hdg-strip{position:absolute;top:3px;left:0;will-change:transform;}'
        +'#fs-hud .pfd-htk{position:absolute;font-size:10px;color:#cfe0f0;transform:translateX(-50%);white-space:nowrap;}'
        +'#fs-hud .pfd-hdg-ptr{position:absolute;left:50%;top:0;bottom:0;width:2px;background:#ffd60a;transform:translateX(-50%);}'
        +'#fs-hud .pfd-cap{position:absolute;top:3px;left:0;right:0;text-align:center;font-size:8.5px;color:#7fa8cc;letter-spacing:0.08em;z-index:3;pointer-events:none;}'
        +'@media(max-width:640px){#fs-hud .fs-pfd{width:206px;height:220px;left:6px;} #fs-hud .pfd-att,#fs-hud .pfd-hdg{left:46px;right:46px;} #fs-hud .pfd-tape{width:46px;}}';
      document.head.appendChild(s); }
    /* (#R94p) refresh the non-numeric HUD chrome (aircraft name, flap/gear/camera chips, button highlights) —
       called on build and whenever an action key/button changes a discrete state. */
    function syncHUDChrome(){ if(!hud||!st) return; const ac=AC(), q=s=>hud.querySelector(s);
      const nm=(ac.name&&(ac.name[HOST.lang]||ac.name.en))||acKey; const nEl=q('.fs-acname'); if(nEl) nEl.textContent=(ac.icon?ac.icon+' ':'')+nm;
      const mc=q('.fs-mach'); if(mc) mc.textContent=(!ac.prop&&st.V>120)?('M'+(st.V/300).toFixed(2)):'';
      const upL=LL('UP','格納','EIN','УБР','ARR');
      const fl=q('.fs-cfg-flaps'); if(fl){ const p=st.flaps>0.99?'FULL':st.flaps>0.5?'②':st.flaps>0.1?'①':upL; fl.textContent=LL('FLAPS','フラップ','KLAPPEN','ЗАКРЫЛКИ','FLAPS')+' '+p; fl.classList.toggle('on',st.flaps>0.05); }
      const gr=q('.fs-cfg-gear'); if(gr){ gr.textContent=LL('GEAR','脚','FAHRW','ШАССИ','TREN')+' '+(st.gear>0.5?LL('DOWN','出','AUS','ВЫП','ABAJO'):upL); gr.classList.toggle('on',st.gear>0.5); }
      const cm=q('.fs-cfg-cam'); if(cm){ cm.textContent=(camMode==='cockpit'?LL('COCKPIT','コックピット','COCKPIT','КАБИНА','CABINA'):LL('FOLLOW','追従','VERFOLG.','СЛЕЖЕН.','SEGUIR'))+(stabilizeCam?' · '+LL('LVL','水平','HOR','ГОР','NIV'):''); cm.classList.toggle('on',stabilizeCam); }
      hud.querySelectorAll('.fs-acchip').forEach(b=>b.classList.toggle('on',b.getAttribute('data-ac')===acKey));
      const gb=q('.fs-deck [data-act="g"]'); if(gb) gb.classList.toggle('on',st.gear>0.5);
      const fb=q('.fs-deck [data-act="f"]'); if(fb) fb.classList.toggle('on',st.flaps>0.05);
      const pb=q('.fs-deck [data-act="p"]'); if(pb) pb.classList.toggle('on',paused);
      const vb=q('.fs-deck [data-act="v"]'); if(vb) vb.classList.toggle('on',stabilizeCam); }
    /* (#R101) ---- shared HUD chrome (same for every aircraft): vignette, hint, warn, exit, touch pad, name badge,
       config chips, control deck and the moving-map / ND. Split out so the six-pack & PFD reuse it. ---- */
    function _fsHint(ac){ const abL=(ac&&ac.ab)?LL(' · Shift afterburner',' · Shift アフターバーナー',' · Shift Nachbrenner',' · Shift форсаж',' · Shift poscombustión'):'';   /* (#R117) the afterburner shortcut is only listed on aircraft that HAVE one (it was shown — invalid — on the Cessna/glider too) */
      return '<div class="fs-hint">'+LL('W/S throttle'+abL+'<br>↑↓ pitch · ←→ roll · A/D rudder<br>F flaps · G gear · Space brake/airbrake<br>V camera-level · M map<br>P pause · R reset · Esc exit<br>Gamepad: stick + triggers','W/S 出力'+abL+'<br>↑↓ ピッチ · ←→ ロール · A/D ラダー<br>F フラップ · G 脚 · Space ブレーキ/抵抗板<br>V 視点水平 · M 地図<br>P 一時停止 · R 復帰 · Esc 終了<br>ゲームパッド対応（スティック＋トリガー）','W/S Schub'+abL+'<br>↑↓ Nick · ←→ Roll · A/D Ruder<br>F Klappen · G Fahrwerk · Space Bremse<br>V Kamera-Horizont · M Karte<br>P Pause · R Reset · Esc Ende<br>Gamepad: Stick + Trigger','W/S тяга'+abL+'<br>↑↓ тангаж · ←→ крен · A/D руль<br>F закрылки · G шасси · Space тормоз<br>V камера-горизонт · M карта<br>P пауза · R сброс · Esc выход<br>Геймпад: стик + триггеры','W/S gas'+abL+'<br>↑↓ cabeceo · ←→ alabeo · A/D timón<br>F flaps · G tren · Space freno<br>V cámara-horizonte · M mapa<br>P pausa · R reinicio · Esc salir<br>Mando: stick + gatillos')+'</div>'; }
    function sharedChromeHTML(){ return '<div class="fs-vign"></div>'+_fsHint(AC())
      +'<div class="fs-warn">'+LL('STALL','失速','STRÖMUNGSABRISS','СВАЛИВАНИЕ','PÉRDIDA')+'</div>'
      +'<button class="fs-x">✕ '+LL('Exit','終了','Ende','Выход','Salir')+'</button>'
      /* (#R117) touch controls: a REAL analog stick (pitch+roll, natural centre return) + the throttle bar is draggable
         + a rudder button pair. The old 6 tiny arrow buttons are replaced by the stick (they were the roll/pitch/throttle
         taps); every control they offered is still available (stick=↑↓←→, throttle bar=W/S, deck=rest). */
      +'<div class="fs-btns"><button data-k="a">◀ '+LL('RUD','ラダー','SR','РН','TIM')+'</button><button data-k="d">'+LL('RUD','ラダー','SR','РН','TIM')+' ▶</button></div>'
      +'<div class="fs-stick"><div class="fs-stick-knob"></div></div>'
      +'<div class="fs-thrlbl">'+LL('THR','出力','SCHUB','ТЯГА','GAS')+'</div><div class="fs-thr"><div class="fs-thrfill" style="height:0%"></div></div>'
      +'<div class="fs-boost"><div class="fs-boostfill"></div></div>'
      /* (#R119) PAPI — 4 real precision-approach lights vs the 3° glide path to the ACTIVE runway threshold */
      +'<div class="fs-papi" title="PAPI"><i></i><i></i><i></i><i></i><span class="fs-papi-lbl">PAPI</span></div>'
      /* (#R120) ILS — localizer/glide-slope fly-to needles vs the active runway (see _updIls) */
      +'<div class="fs-ils" title="ILS"><div class="fs-ils-scale"><i class="fs-ils-loc"></i><i class="fs-ils-gs"></i></div><span class="fs-ils-lbl">ILS</span></div>'
      +'<div class="fs-acbadge"><span class="fs-acname">—</span><span class="fs-mach"></span></div>'
      +'<div class="fs-config"><span class="fs-cfg fs-cfg-flaps">FLAPS</span><span class="fs-cfg fs-cfg-gear">GEAR</span><span class="fs-cfg fs-cfg-cam">CAM</span></div>'
      +'<div class="fs-deck">'
        +'<button class="fs-act" data-act="g">⚙<small>'+LL('GEAR','脚','FAHRW','ШАССИ','TREN')+'</small></button>'
        +'<button class="fs-act" data-act="f">⬇<small>'+LL('FLAPS','フラップ','KLAPPEN','ЗАКРЫЛ','FLAPS')+'</small></button>'
        +'<button class="fs-act amber" data-hold=" ">✋<small>'+LL('BRAKE','抵抗板','BREMSE','ТОРМОЗ','FRENO')+'</small></button>'
        +'<button class="fs-act" data-act="m">🗺<small>'+LL('MAP','地図','KARTE','КАРТА','MAPA')+'</small></button>'
        +'<button class="fs-act" data-act="v">⊞<small>'+LL('CAM LVL','視点水平','KAM-HOR','КАМ-ГОР','CÁM NIV')+'</small></button>'
        +'<button class="fs-act" data-act="p">⏸<small>'+LL('PAUSE','一時停止','PAUSE','ПАУЗА','PAUSA')+'</small></button>'
        /* (#R171) the SOUND key shows the REAL audio state — silence is the default now, so hard-coding "on"
           here would have made the deck lie about it on every flight. */
        +'<button class="fs-act'+(fsAudio.isMuted()?'':' on')+'" data-act="mute">'+(fsAudio.isMuted()?'🔇':'🔊')+'<small>'+LL('SOUND','サウンド','TON','ЗВУК','SONIDO')+'</small></button>'
        +'<button class="fs-act" data-act="r">⟳<small>'+LL('RESET','リセット','RESET','СБРОС','REINICIO')+'</small></button>'
      +'</div>'
      +'<div class="fs-minimap"><div class="fs-mm-map"></div>'
        +'<svg class="fs-mm-n" viewBox="0 0 20 20"><path d="M10 1 L14 9 L10 7 L6 9 Z" fill="#ffd60a"/><text x="10" y="19" text-anchor="middle" font-size="8" font-weight="800" fill="#ffd60a">N</text></svg>'
        +'<svg class="fs-mm-ac" width="26" height="26" viewBox="0 0 26 26"><path d="M13 2 L20 22 L13 17.5 L6 22 Z" fill="#ffd60a" stroke="#0a1a2e" stroke-width="1.3"/></svg>'
        +'<div class="fs-mm-lbl"><span class="fs-mm-hdg">---</span>° · <span class="fs-mm-alt">0</span> m</div>'
      +'</div>'; }
    /* ---- FIGHTER HUD instruments (unchanged from the game-grade HUD) ---- */
    function hudInstrHTML(){
      let hlab=''; for(let d=-180;d<=540;d+=15){ const dd=((d%360)+360)%360; const nm=({0:'N',90:'E',180:'S',270:'W'})[dd]; hlab+='<span class="fs-htick" style="left:'+((d+180)*2.4)+'px;'+(nm?'color:#ffd60a;font-weight:700;':'')+'">'+(nm||(''+(dd/10|0)))+'</span>'; }
      let ladder='<line x1="290" y1="500" x2="710" y2="500" stroke-width="3.2"/>';
      [-30,-20,-10,10,20,30].forEach(p=>{ const y=500-p*8, dv=p<0?' class="fs-dive"':''; ladder+='<line'+dv+' x1="340" y1="'+y+'" x2="440" y2="'+y+'"/><line'+dv+' x1="560" y1="'+y+'" x2="660" y2="'+y+'"/><text x="326" y="'+(y+6)+'" text-anchor="end">'+Math.abs(p)+'</text><text x="674" y="'+(y+6)+'">'+Math.abs(p)+'</text>'; });
      return '<div class="fs-sky"></div>'
        +'<svg class="fs-ladder" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice"><g class="fs-ladder-g">'+ladder+'</g><g><polygon points="500,318 489,300 511,300" fill="rgba(99,255,155,0.6)"/><polygon class="fs-rollptr" points="500,306 489,286 511,286" fill="#ffd60a" stroke="#0a1a2e" stroke-width="1"/></g></svg>'
        +'<svg class="fs-bore" width="164" height="46" viewBox="0 0 164 46"><g stroke="#ffd60a" stroke-width="3.2" fill="none" stroke-linecap="round"><path d="M18 22 L62 22 L72 34"/><path d="M146 22 L102 22 L92 34"/></g><circle cx="82" cy="22" r="2.8" fill="#ffd60a"/></svg>'
        +'<div class="fs-htape"><div class="fs-htape-strip">'+hlab+'</div><div class="fs-htape-ptr"></div></div><div class="fs-hdg-box"><span class="fs-hdg">---</span></div>'
        +'<div class="fs-panel fs-tl"><div class="fs-k">'+LL('AIRSPEED','対気速度','GESCHW.','СКОРОСТЬ','VELOCIDAD')+'</div><div class="fs-v"><span class="fs-spd">0</span> <span style="font-size:11px;">km/h</span></div><div class="fs-k" style="margin-top:6px;">'+LL('V/SPEED','昇降','V/S','ВЕРТ.','V/S')+'</div><div class="fs-v" style="font-size:15px;"><span class="fs-vs">0</span> <span style="font-size:10px;">m/s</span></div></div>'
        +'<div class="fs-panel fs-tr"><div class="fs-k">'+LL('ALTITUDE','高度','HÖHE','ВЫСОТА','ALTITUD')+'</div><div class="fs-v"><span class="fs-alt">0</span> <span style="font-size:11px;">m</span></div><div class="fs-k" style="margin-top:6px;">'+LL('AGL','対地高度','ÜBER GRUND','НАД ЗЕМЛЁЙ','SOBRE SUELO')+'</div><div class="fs-v" style="font-size:15px;"><span class="fs-agl">0</span> <span style="font-size:10px;">m</span></div></div>'
        +'<svg class="fs-adi" viewBox="0 0 120 120"><defs><clipPath id="fsc"><circle cx="60" cy="60" r="52"/></clipPath></defs>'
          +'<g clip-path="url(#fsc)"><g class="fs-hor"><rect x="-80" y="-140" width="280" height="200" fill="#4a90d9"/><rect x="-80" y="60" width="280" height="200" fill="#7a5230"/><line x1="-80" y1="60" x2="200" y2="60" stroke="#fff" stroke-width="2"/>'
            +'<line x1="30" y1="40" x2="90" y2="40" stroke="rgba(255,255,255,0.6)" stroke-width="1"/><line x1="30" y1="80" x2="90" y2="80" stroke="rgba(255,255,255,0.6)" stroke-width="1"/></g></g>'
          +'<circle cx="60" cy="60" r="52" fill="none" stroke="#8fb8e0" stroke-width="2"/>'
          +'<line x1="26" y1="60" x2="46" y2="60" stroke="#ffd60a" stroke-width="3.5"/><line x1="74" y1="60" x2="94" y2="60" stroke="#ffd60a" stroke-width="3.5"/><circle cx="60" cy="60" r="2.5" fill="#ffd60a"/></svg>'; }
    /* ---- analog SIX-PACK helpers ---- */
    function _polar(r,a){ const rad=a*Math.PI/180; return [(50+r*Math.sin(rad)).toFixed(2),(50-r*Math.cos(rad)).toFixed(2)]; }
    function _ticks(n,a0,a1,r1,r2,cls){ let t=''; for(let i=0;i<=n;i++){ const a=a0+(a1-a0)*i/n; const p1=_polar(r1,a),p2=_polar(r2,a); t+='<line class="'+(cls||'g6-tick')+'" x1="'+p1[0]+'" y1="'+p1[1]+'" x2="'+p2[0]+'" y2="'+p2[1]+'"/>'; } return t; }
    function _g6(cap,inner){ return '<div class="fs-g6"><svg viewBox="0 0 100 100">'+inner+'</svg><div class="fs-g6-cap">'+cap+'</div></div>'; }
    function sixpackHTML(ac){
      const asi=_g6('KT · km/h', _ticks(8,-135,135,34,41)+'<g class="g6-asi"><line class="g6-nd" x1="50" y1="53" x2="50" y2="15"/></g><circle cx="50" cy="50" r="2.6" fill="#cdd8e4"/><text class="g6-dig g6-asi-d" x="50" y="30" text-anchor="middle">0</text>');
      /* attitude indicator: clipped sky/ground that rolls + pitches, fixed aircraft datum + bank pointer */
      const ai=_g6('ATT','<defs><clipPath id="fsg6c"><circle cx="50" cy="50" r="41"/></clipPath></defs>'
        +'<g clip-path="url(#fsg6c)"><g class="g6-ai-roll"><g class="g6-ai-pitch"><rect x="-60" y="-70" width="220" height="120" fill="#3f78c2"/><rect x="-60" y="50" width="220" height="120" fill="#6f4a28"/><line x1="-60" y1="50" x2="160" y2="50" stroke="#fff" stroke-width="1.6"/>'
          +'<line x1="34" y1="38" x2="66" y2="38" stroke="rgba(255,255,255,0.7)" stroke-width="1"/><line x1="38" y1="62" x2="62" y2="62" stroke="rgba(255,255,255,0.7)" stroke-width="1"/></g></g></g>'
        +'<path d="M50 12 l-4 7 h8 z" fill="#ffd60a" class="g6-ai-bp"/>'
        +'<line x1="32" y1="50" x2="44" y2="50" stroke="#ffd60a" stroke-width="2.4"/><line x1="56" y1="50" x2="68" y2="50" stroke="#ffd60a" stroke-width="2.4"/><circle cx="50" cy="50" r="1.8" fill="#ffd60a"/>');
      const alt=_g6('ALT m', _ticks(10,-180,180,34,41,'g6-tick')+'<g class="g6-alt"><line class="g6-nd2" x1="50" y1="55" x2="50" y2="22"/></g><circle cx="50" cy="50" r="2.4" fill="#cdd8e4"/><text class="g6-dig g6-alt-d" x="50" y="72" text-anchor="middle">0</text>');
      const tc=_g6('TURN','<line x1="12" y1="50" x2="26" y2="50" stroke="#7f93a6" stroke-width="1.4"/><line x1="74" y1="50" x2="88" y2="50" stroke="#7f93a6" stroke-width="1.4"/>'
        +'<g class="g6-tc"><path d="M22 44 h56 M50 40 v8 M34 47 h32" stroke="#eaf1f8" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>'
        +'<rect x="42" y="70" width="16" height="9" rx="4.5" fill="none" stroke="#7f93a6" stroke-width="1"/><circle class="g6-tc-ball" cx="50" cy="74.5" r="3" fill="#eaf1f8"/>');
      const hi=_g6('HDG','<g class="g6-hi">'+_ticks(12,0,330,34,41,'g6-tick')+'<text x="50" y="19" text-anchor="middle" font-size="9" font-weight="700">N</text><text x="83" y="53" text-anchor="middle" font-size="8">E</text><text x="50" y="88" text-anchor="middle" font-size="8">S</text><text x="17" y="53" text-anchor="middle" font-size="8">W</text></g>'
        +'<path d="M50 20 l-5 9 h10 z" fill="#ffd60a"/><path d="M50 44 v14 M44 52 h12" stroke="#eaf1f8" stroke-width="2" fill="none"/>');
      const vsi=_g6('V/S','<text x="20" y="34" font-size="7" fill="#8ea3b8">↑</text><text x="20" y="70" font-size="7" fill="#8ea3b8">↓</text>'+_ticks(8,-110,110,34,41,'g6-tick')+'<g class="g6-vsi"><line class="g6-nd2" x1="50" y1="52" x2="18" y2="50"/></g><circle cx="50" cy="50" r="2.4" fill="#cdd8e4"/>');
      return '<div class="fs-sixpack">'+asi+ai+alt+tc+hi+vsi+'</div>';
    }
    /* ---- glass PFD (airliner) ----: speed tape · attitude+ladder · altitude tape · heading strip (ND = moving-map) */
    function glassHTML(ac){
      /* labels positioned statically on each strip; update just translates the strip. speed 0.7px/(km/h), alt 0.10px/m, hdg 2.4px/° */
      let spd=''; for(let v=0;v<=1000;v+=20){ spd+='<div class="pfd-tk" style="top:'+(-v*0.7).toFixed(1)+'px;">'+v+'</div>'; }
      let alt=''; for(let a=-200;a<=16000;a+=100){ alt+='<div class="pfd-tk" style="top:'+(-a*0.10).toFixed(1)+'px;">'+a+'</div>'; }
      let hdg=''; for(let h=-30;h<=390;h+=10){ const dd=((h%360)+360)%360; const nm=({0:'N',90:'E',180:'S',270:'W'})[dd]; hdg+='<div class="pfd-htk" style="left:'+(h*2.4).toFixed(1)+'px;">'+(nm||dd)+'</div>'; }
      let plad='<line x1="20" y1="150" x2="280" y2="150" stroke="#fff" stroke-width="2"/>';
      [-30,-20,-10,10,20,30].forEach(p=>{ const y=150-p*4.6, dv=p<0?'stroke-dasharray="8 6"':''; plad+='<line '+dv+' x1="110" y1="'+y+'" x2="150" y2="'+y+'" stroke="#fff" stroke-width="1.4"/><line '+dv+' x1="150" y1="'+y+'" x2="190" y2="'+y+'" stroke="#fff" stroke-width="1.4"/><text x="104" y="'+(y+3)+'" text-anchor="end" fill="#dfeaf5" font-size="8">'+Math.abs(p)+'</text>'; });
      return '<div class="fs-pfd">'
        +'<div class="pfd-att"><svg viewBox="0 0 300 300" preserveAspectRatio="xMidYMid slice"><g class="pfd-roll" transform="rotate(0 150 150)"><g class="pfd-pitch"><rect x="-200" y="-260" width="700" height="410" fill="#3f78c2"/><rect x="-200" y="150" width="700" height="410" fill="#6f4a28"/>'+plad+'</g></g></svg>'
          +'<svg viewBox="0 0 300 300" style="position:absolute;inset:0;"><path class="pfd-rp" d="M150 24 l-6 11 h12 z" fill="#ffd60a"/><path d="M110 150 h26 v8 M190 150 h-26 v8" stroke="#ffd60a" stroke-width="2.6" fill="none"/><circle cx="150" cy="150" r="2.4" fill="#ffd60a"/></svg></div>'
        +'<div class="pfd-cap">'+LL('SPD','速度','GESCHW','СК','VEL')+'</div>'
        +'<div class="pfd-tape pfd-spd"><div class="pfd-strip pfd-spd-strip">'+spd+'</div></div><div class="pfd-box pfd-spd-box" style="left:1px;right:auto;width:50px;">0</div>'
        +'<div class="pfd-tape pfd-alt"><div class="pfd-strip pfd-alt-strip">'+alt+'</div></div><div class="pfd-box pfd-alt-box" style="right:1px;left:auto;width:50px;">0</div>'
        +'<div class="pfd-hdg"><div class="pfd-hdg-strip">'+hdg+'</div><div class="pfd-hdg-ptr"></div></div>'
      +'</div>'; }
    function buildHUD(){ css(); try{ document.querySelectorAll('#fs-hud').forEach(h=>h.remove()); }catch(_){}   /* (#R117) never leave a stale HUD behind (a leftover .fs-warn kept shouting CRASHED into the next flight) */
      const disp=(AC().disp)||'hud'; hud=document.createElement('div'); hud.id='fs-hud'; hud.dataset.disp=disp;
      hud.innerHTML=(disp==='sixpack'?sixpackHTML(AC()):disp==='glass'?glassHTML(AC()):hudInstrHTML())+sharedChromeHTML();
      document.body.appendChild(hud);
      hud.querySelector('.fs-x').onclick=()=>stop();
      hud.querySelectorAll('.fs-btns button').forEach(b=>{ const k=b.getAttribute('data-k');
        const dn=e=>{ e.preventDefault(); keys[k]=true; }, up=e=>{ e.preventDefault(); keys[k]=false; };
        b.addEventListener('pointerdown',dn); b.addEventListener('pointerup',up); b.addEventListener('pointerleave',up); });
      hud.querySelectorAll('.fs-deck [data-act]').forEach(b=>b.addEventListener('click',()=>{ fsAction(b.getAttribute('data-act')); }));
      hud.querySelectorAll('.fs-deck [data-hold]').forEach(b=>{ const k=b.getAttribute('data-hold');
        const dn=e=>{ e.preventDefault(); keys[k]=true; }, up=e=>{ e.preventDefault(); keys[k]=false; };
        b.addEventListener('pointerdown',dn); b.addEventListener('pointerup',up); b.addEventListener('pointerleave',up); });
      /* (#R117) analog stick: continuous pitch/roll from the finger offset, natural centre-return on release */
      const stick=hud.querySelector('.fs-stick'), knob=hud.querySelector('.fs-stick-knob');
      if(stick&&knob){ let sid=null;
        const setFrom=e=>{ const r=stick.getBoundingClientRect(), R=r.width/2-12;
          let dx=(e.clientX-(r.left+r.width/2))/R, dy=(e.clientY-(r.top+r.height/2))/R;
          const m=Math.hypot(dx,dy); if(m>1){ dx/=m; dy/=m; }
          if(st){ st._tR=dx; st._tP=-dy; }                       /* drag DOWN = pull = nose up (elev −1) */
          knob.style.transform='translate('+(dx*R).toFixed(0)+'px,'+(dy*R).toFixed(0)+'px)'; };
        const clear=()=>{ sid=null; if(st){ st._tR=null; st._tP=null; } knob.style.transform=''; };
        stick.addEventListener('pointerdown',e=>{ e.preventDefault(); sid=e.pointerId; try{ stick.setPointerCapture(sid); }catch(_){} setFrom(e); });
        stick.addEventListener('pointermove',e=>{ if(sid!=null&&e.pointerId===sid) setFrom(e); });
        stick.addEventListener('pointerup',e=>{ if(sid!=null&&e.pointerId===sid) clear(); });
        stick.addEventListener('pointercancel',clear); }
      /* (#R117) the throttle bar is a real control now (drag/click to set power — mouse or touch) */
      const thrEl=hud.querySelector('.fs-thr');
      if(thrEl){ let tid=null;
        const setT=e=>{ const r=thrEl.getBoundingClientRect(); if(st) st.thr=Math.max(0,Math.min(1,1-(e.clientY-r.top)/r.height)); };
        thrEl.addEventListener('pointerdown',e=>{ e.preventDefault(); tid=e.pointerId; try{ thrEl.setPointerCapture(tid); }catch(_){} setT(e); });
        thrEl.addEventListener('pointermove',e=>{ if(tid!=null&&e.pointerId===tid) setT(e); });
        const tEnd=e=>{ if(tid!=null&&e.pointerId===tid) tid=null; };
        thrEl.addEventListener('pointerup',tEnd); thrEl.addEventListener('pointercancel',tEnd); }
      try{ syncHUDChrome(); }catch(_){} }
    /* ===== (#R96) moving-map / nav display — a small SECOND MapLibre map (track-up) that follows the aircraft, like a
       car-nav / FlightRadar mini map. It reuses the app's existing Esri World Imagery raster (no NEW data source). ===== */
    /* (#R179) …and it is a scoped ENGINE now, not a renderer handle. `createSubView` returns the same
       contract bound to the second view, so this file no longer knows what map library is running —
       the `typeof maplibregl` feature test it used to open with was the last such reference in it. */
    function createMinimap(){ if(minimap||!hud||!GE()) return; const el=hud.querySelector('.fs-mm-map'); if(!el) return;
      try{ minimap=GE().ui.createSubView({ container:el, attributionControl:false, interactive:false, fadeDuration:0, refreshExpiredTiles:false, renderWorldCopies:true,
        center:[st?st.lng:0, st?st.lat:0], zoom:11, bearing:0, pitch:0,
        style:{ version:8, sources:{ mmsat:{ type:'raster', tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}','https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize:256, maxzoom:19, attribution:'© Esri' },
          /* (#R118) flight TRAIL on the moving-map ("ミニマップには軌跡が表示されるように") — the already-recorded st._path */
          mmtrail:{ type:'geojson', data:{type:'Feature',geometry:{type:'LineString',coordinates:[]},properties:{}} } },
          layers:[{ id:'mmsat', type:'raster', source:'mmsat' },
            { id:'mmtrail-cas', type:'line', source:'mmtrail', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'rgba(0,0,0,0.55)','line-width':4} },
            { id:'mmtrail', type:'line', source:'mmtrail', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'#ffd60a','line-width':2.2} }] } });
        setTimeout(()=>{ try{ minimap&&minimap.render.resize(); }catch(_){} },40);
      }catch(_){ minimap=null; } }
    function destroyMinimap(){ if(minimap){ try{ minimap.destroy(); }catch(_){} minimap=null; } mmT=0; }
    function toggleMinimap(){ mmOn=!mmOn; const mm=hud&&hud.querySelector('.fs-minimap'); if(mm) mm.style.display=mmOn?'':'none';
      if(mmOn){ createMinimap(); setTimeout(()=>{ try{ minimap&&minimap.render.resize(); }catch(_){} },40); } }
    /* track-up follow, throttled to ~8 Hz (a nav map needs no per-frame redraw); zoom adapts to height AGL */
    function updateMinimap(dt){ if(!minimap||!mmOn||!st) return; mmT+=dt; if(mmT<0.12) return; mmT=0;
      try{ const nh=qRot(st.q,[1,0,0]), hdg=(Math.atan2(nh[1],nh[0])*180/Math.PI+360)%360;
        const agl=Math.max(0, st.alt-(st.lastTerr!=null?st.lastTerr:0)), z=Math.max(9.5, Math.min(13.5, 13.5-Math.log2(agl/400+1)));
        minimap.camera.jumpTo({ center:[st.lng, st.lat], bearing:hdg, zoom:z });
        /* (#R118) trail line = the recorded flight path + the current position (throttled with the same 8 Hz tick) */
        try{ if(minimap.layers.hasSource('mmtrail')&&st._path){ const cs=st._path.map(p=>[p[0],p[1]]); cs.push([st.lng,st.lat]);
          if(cs.length>1&&cs.length!==(updateMinimap._n||0)){ updateMinimap._n=cs.length;
            minimap.layers.setSourceData('mmtrail',{type:'Feature',geometry:{type:'LineString',coordinates:cs},properties:{}}); } } }catch(_){}
        const nEl=hud.querySelector('.fs-mm-n'); if(nEl) nEl.style.transform='rotate('+(-hdg).toFixed(0)+'deg)';
        const hEl=hud.querySelector('.fs-mm-hdg'); if(hEl) hEl.textContent=Math.round(hdg).toString().padStart(3,'0');
        const aEl=hud.querySelector('.fs-mm-alt'); if(aEl) aEl.textContent=(Math.round(st.alt/10)*10).toLocaleString();   /* (#R99) round to 10 m so the throttled minimap can't show a different exact number than the main HUD */
      }catch(_){} }
    const HELD=['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' '];
    /* ===== (#R120) GAMEPAD — a standard-mapping pad drives the same controls as the keyboard/touch.
       Left stick = pitch/roll ANALOG (push forward = nose down, matching the inverted arrow convention),
       stick-X twist (axis 2) or LB/RB = rudder, RT/LT = throttle up/down (analog), A = wheel-brake/air-brake
       hold, B = afterburner hold, X = flaps, Y = gear, Back = camera-level, Start = pause. Polled once per
       physics() frame (the Gamepad API is poll-based); analog values override the digital keys only while
       deflected, so keyboard and pad coexist. */
    let _gpIdx=null; const _gpBtn={};
    try{ window.addEventListener('gamepadconnected',e=>{ _gpIdx=e.gamepad.index;
        try{ imToast(LL('Gamepad connected: ','ゲームパッド接続: ','Gamepad verbunden: ','Геймпад подключён: ','Mando conectado: ')+(e.gamepad.id||'').slice(0,40)); }catch(_){} });
      window.addEventListener('gamepaddisconnected',e=>{ if(_gpIdx===e.gamepad.index) _gpIdx=null; if(st){ st._gpP=null; st._gpR=null; st._gpY=null; st._gpBrk=false; st._gpAB=false; } }); }catch(_){}
    function _gpPoll(dt){ if(!st) return;
      let g=null; try{ const gs=navigator.getGamepads&&navigator.getGamepads(); if(gs){ g=(_gpIdx!=null&&gs[_gpIdx]&&gs[_gpIdx].connected)?gs[_gpIdx]:null;
        if(!g){ for(const gg of gs){ if(gg&&gg.connected){ g=gg; _gpIdx=gg.index; break; } } } } }catch(_){}
      if(!g){ st._gpP=null; st._gpR=null; st._gpY=null; st._gpBrk=false; st._gpAB=false; return; }
      const dz=v=>{ v=+v||0; return Math.abs(v)>0.12?((Math.abs(v)-0.12)/0.88)*Math.sign(v):0; };
      const ax=g.axes||[], bt=g.buttons||[], bp=i=>!!(bt[i]&&bt[i].pressed);
      const rv=dz(ax[0]), pv=dz(ax[1]), yv=dz(ax[2]);
      st._gpR=(rv!==0)?Math.max(-1,Math.min(1,rv)):null;                       /* stick right = roll right */
      st._gpP=(pv!==0)?Math.max(-1,Math.min(1,-pv)):null;                      /* stick forward = nose DOWN (+1 target, like ↑) */
      const rudIn=-yv+(bp(4)?1:0)+(bp(5)?-1:0);                                 /* cmd −1 = yaw right (matches D key) */
      st._gpY=(rudIn!==0)?Math.max(-1,Math.min(1,rudIn)):null;
      const rt=(bt[7]&&bt[7].value)||0, lt=(bt[6]&&bt[6].value)||0;
      if(rt>0.02||lt>0.02) st.thr=Math.max(0,Math.min(1,st.thr+(rt-lt)*0.55*dt));
      st._gpBrk=bp(0); st._gpAB=bp(1);
      const edge=(i,k)=>{ const p=bp(i); if(p&&!_gpBtn[i]) fsAction(k); _gpBtn[i]=p; };
      edge(2,'f'); edge(3,'g'); edge(8,'v'); edge(9,'p'); }
    /* one-shot actions (debounced against key auto-repeat via keys['_a_'+k]) */
    function fsAction(k){ if(!st) return false;
      if(k==='f') st.flaps=(st.flaps>=0.99)?0:Math.min(1,Math.round((st.flaps+0.34)*100)/100);   /* flaps notch: 0→⅓→⅔→full→up */
      else if(k==='g') st.gear=st.gear>0.5?0:1;                                                    /* landing gear */
      else if(k==='v') stabilizeCam=!stabilizeCam;                                                  /* level-horizon toggle */
      else if(k==='m'){ try{ toggleMinimap(); }catch(_){} }                                         /* (#R96) moving-map on/off */
      else if(k==='p'){ paused=!paused; if(st){ if(paused) st._pauseStart=performance.now(); else if(st._pauseStart){ st._pausedMs=(st._pausedMs||0)+(performance.now()-st._pauseStart); st._pauseStart=0; } } }   /* (#R99) exclude paused wall-time from the flight timer */
      else if(k==='r') respawn();                                                                   /* reset in place */
      else if(k==='mute'){ try{ const m=fsAudio.toggleMute(); const b=hud&&hud.querySelector('.fs-deck [data-act="mute"]'); if(b){ b.classList.toggle('on',!m); b.firstChild.textContent=m?'🔇':'🔊'; } }catch(_){} }   /* (#R101) sound on/off */
      else return false;   /* (#R98) no in-flight aircraft switching (keys 1–6 removed) — the airframe is chosen on the pre-flight screen */
      try{ syncHUDChrome(); }catch(_){} return true; }
    function onKey(e){ const k=e.key.toLowerCase(); if(k==='escape'){ stop(); return; }
      if(k==='shift'||k==='control'){ keys[k]=true; return; }   /* afterburner modifier (no preventDefault) */
      if(HELD.includes(k)){ keys[k]=true; e.preventDefault(); e.stopPropagation(); return; }
      if(!keys['_a_'+k]){ if(fsAction(k)){ keys['_a_'+k]=true; e.preventDefault(); e.stopPropagation(); } } }
    function onKeyUp(e){ const k=e.key.toLowerCase(); keys[k]=false; keys['_a_'+k]=false; }
    /* (#R95) release every held key when the window/tab loses focus or a touch is cancelled (see start()). */
    function onLoseFocus(){ for(const k in keys) keys[k]=false; }
    function onVisChange(){ if(document.hidden) onLoseFocus(); }
    /* (#R117) while flying, MAP FEATURES (place labels, POIs, boundaries…) must be display-only: swallow every
       pointer/click event aimed at the map canvas at the CAPTURE phase, so map.on('click'/'mousemove') handlers
       (label popups, Atlas outline, cursor changes, queryRenderedFeatures work) never even run — not a CSS veil.
       The HUD lives outside the canvas and is untouched. Installed on start(), fully removed on stop(), so the
       pre-flight event behaviour is restored exactly. */
    const _FSBLOCK=['click','dblclick','contextmenu','pointerdown','pointerup','pointermove','mousedown','mouseup','mousemove','touchstart','touchend','touchmove','wheel'];
    function _fsBlocker(e){ try{ const t=e.target;
      if(t&&t.closest&&t.closest('#map-container')&&!t.closest('#fs-hud')){ e.stopPropagation(); } }catch(_){} }
    function addExtraHUD(){ if(!hud) return; const tl=hud.querySelector('.fs-tl'); if(tl&&!tl.querySelector('.fs-g')){ const d=document.createElement('div'); d.style.cssText='margin-top:6px;display:flex;gap:14px;'; d.innerHTML='<div><div class="fs-k">'+LL('LOAD','荷重','LAST','ПЕРЕГР.','CARGA')+'</div><div class="fs-v" style="font-size:15px;"><span class="fs-g">1.0</span><span style="font-size:10px;">g</span></div></div><div><div class="fs-k">'+LL('AoA','迎角','AoA','УГОЛ','AoA')+'</div><div class="fs-v" style="font-size:15px;"><span class="fs-aoa">0</span><span style="font-size:10px;">°</span></div></div>'; tl.appendChild(d); } }
    let prevView=null;
    /* (#R97) a handful of real airports (ICAO, name, lat, lon, field-elevation m, a runway heading°) so the sim can
       spawn ON a runway and take off / land — a spread of geography and elevations (Denver 1655 m, Innsbruck alpine). */
    const AIRPORTS=[
      ['RJTT','Tokyo Haneda',35.5494,139.7798,6,337],['KLAX','Los Angeles',33.9416,-118.4085,38,250],
      ['KJFK','New York JFK',40.6413,-73.7781,4,313],['KSFO','San Francisco',37.6213,-122.3790,4,284],
      ['EGLL','London Heathrow',51.4700,-0.4543,25,270],['LFPG','Paris CDG',49.0097,2.5479,119,270],
      ['EDDF','Frankfurt',50.0379,8.5622,111,250],['LSZH','Zürich',47.4647,8.5492,432,160],
      ['LOWI','Innsbruck · alpine',47.2602,11.3439,581,260],['LEMD','Madrid',40.4936,-3.5668,610,180],
      ['LIRF','Rome Fiumicino',41.8003,12.2389,5,160],['UUEE','Moscow',55.9726,37.4146,190,240],
      ['OMDB','Dubai',25.2532,55.3657,19,300],['OERK','Riyadh',24.9576,46.6988,635,330],
      ['VHHH','Hong Kong',22.3080,113.9185,9,70],['ZBAA','Beijing Capital',40.0801,116.5846,35,10],
      ['RKSI','Seoul Incheon',37.4602,126.4407,7,330],['WSSS','Singapore Changi',1.3644,103.9915,7,20],
      ['VABB','Mumbai',19.0887,72.8679,11,90],['YSSY','Sydney',-33.9461,151.1772,6,343],
      ['NZAA','Auckland',-37.0082,174.7850,7,50],['KDEN','Denver · high',39.8561,-104.6737,1655,343],
      ['SBGR','São Paulo',-23.4356,-46.4731,750,100],['FACT','Cape Town',-33.9715,18.6021,46,10],
      ['CYYZ','Toronto',43.6777,-79.6248,173,50],['PHNL','Honolulu',21.3187,-157.9224,4,80]
    ];
    /* (#R97) PRE-FLIGHT SETUP screen ("開始時に機種等を選択させてから"): choose the aircraft, a start location (an airport
       or the current map view) and whether to spawn ON the runway to take off, or already airborne. START → start(). */
    /* (#R98) RESULT SCREEN — shown on a crash or a completed landing: the flight path drawn as a mini-map coloured by
       altitude, a few stats, and a choice to fly again (back to the pre-flight screen) or exit. */
    function showResult(kind){ if(resultShown||!st) return; resultShown=true; paused=true;
      try{ if(raf) cancelAnimationFrame(raf); }catch(_){} raf=null;
      const path=(st._path||[]).slice(), ok=(kind==='landed');
      const _pMs=(st._pausedMs||0)+(st._pauseStart?performance.now()-st._pauseStart:0);
      const durS=Math.max(0,Math.round((performance.now()-(st._t0||performance.now())-_pMs)/1000));   /* (#R99) flight time excludes paused wall-time */
      const maxAltM=Math.round(st._maxAlt||st.alt), maxVk=Math.round((st._maxV||st.V)*3.6);
      const distKm=(st._dist||0);   /* (#R100) full-resolution accumulated distance (not summed from the decimated draw-path) */
      /* (#R99/#R117) distinguish a RUNWAY landing (aligned with the known runway axis, close to its centreline)
         from "near <airport>" and from off-field. The airport table carries one runway heading; alignment = final
         heading within ±20° of it (either direction) AND lateral offset from the runway line < 150 m. */
      let where=''; let _rwyHit=null;
      /* (#R119) PRECISE corridor test against the REAL runway line (OurAirports thresholds): touchdown within
         ±75 m of the centreline, between the thresholds (+8% overrun grace), heading within ±25° of the axis. */
      if(ok&&st._rwy){ try{ const A=st._rwy.A,B=st._rwy.B, cf=Math.cos(st.lat*Math.PI/180);
        const ax=(st.lng-A[0])*111.32*cf, ay=(st.lat-A[1])*111.32;
        const bx=(B[0]-A[0])*111.32*cf, by=(B[1]-A[1])*111.32; const L2=(bx*bx+by*by)||1e-9;
        const tt=(ax*bx+ay*by)/L2; const xt=Math.hypot(ax-bx*tt, ay-by*tt);
        const hd=_fsHdg(), rb=(Math.atan2(bx,by)*180/Math.PI+360)%360, dh=Math.abs(((hd-rb)%180+270)%180-90);
        if(tt>=-0.05&&tt<=1.08&&xt<=0.075&&dh<=25) _rwyHit=String(st._rwy.id||st._rwy.ident||''); }catch(_){} }
      if(ok&&_rwyHit){ where=' · '+LL('landed on runway '+_rwyHit,'滑走路 '+_rwyHit+' に着陸','auf Landebahn '+_rwyHit+' gelandet','посадка на ВПП '+_rwyHit,'aterrizó en pista '+_rwyHit); }
      else if(ok){ let bd=1e9,best=null; AIRPORTS.forEach(a=>{ const d=Math.hypot((a[2]-st.lat)*111.32,(a[3]-st.lng)*111.32*Math.cos(st.lat*Math.PI/180)); if(d<bd){bd=d;best=a;} });
        if(best&&bd<5){ let rwy=false;
          try{ const hd=_fsHdg(), dh=Math.abs(((hd-best[5])%180+270)%180-90);   /* 0 = parallel with the runway axis (either direction) */
            const rr=best[5]*Math.PI/180, dx=(st.lng-best[3])*111.32*Math.cos(st.lat*Math.PI/180), dy=(st.lat-best[2])*111.32;
            const xt=Math.abs(dx*Math.cos(rr)-dy*Math.sin(rr));               /* cross-track (km) from the line through the field along the runway heading */
            rwy=(dh<=20 && xt<=0.15); }catch(_){}
          where=' · '+(rwy?LL('runway landing — '+best[1],best[1]+' 滑走路に着陸','Landebahn — '+best[1],'на ВПП — '+best[1],'en pista — '+best[1])
                         :LL('near '+best[1],best[1]+' 周辺（滑走路外）','bei '+best[1],'возле '+best[1],'cerca de '+best[1])); }
        else where=' · '+LL('off-field','場外着陸','abseits','вне полосы','fuera de pista'); }
      const col=ok?'#34c759':'#ff453a', title=(ok?LL('✓ LANDED','✓ 着陸成功','✓ GELANDET','✓ ПОСАДКА','✓ ATERRIZÓ'):LL('✕ CRASHED','✕ 墜落','✕ ABGESTÜRZT','✕ КРУШЕНИЕ','✕ ACCIDENTE'))+where;
      const ov=document.createElement('div'); ov.id='fs-result';
      ov.style.cssText='position:fixed;inset:0;z-index:6060;background:rgba(4,10,20,0.86);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#e8f4ff;';   /* (#R102) above ws menu bar */
      const stat=(l,v)=>'<div><div style="font-size:10px;color:#8fb8e0;">'+l+'</div><b style="font-size:14px;">'+v+'</b></div>';
      ov.innerHTML='<div style="width:min(470px,95vw);background:linear-gradient(180deg,rgba(10,20,34,0.98),rgba(6,14,26,0.98));border:1px solid '+col+';border-radius:18px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.6);">'
        +'<div style="font-size:22px;font-weight:800;color:'+col+';margin-bottom:12px;">'+title+'</div>'
        /* (#R117) explain the outcome: crash → the recorded reason; landing → touchdown quality (sink/bank/speed + a grade) */
        +((!ok&&st._crashWhy)?('<div style="font-size:12px;color:#ffb3ad;margin:-6px 0 12px;">'+st._crashWhy+'</div>'):'')
        +((ok&&st._td)?('<div style="font-size:12px;color:#9fe0b5;margin:-6px 0 12px;">'
            +(st._td.vs<0.6?LL('Butter — ','超スムーズ着陸 — ','Butterweich — ','Мягчайшая — ','Suavísimo — '):st._td.vs<2?LL('Smooth — ','スムーズ — ','Sanft — ','Мягкая — ','Suave — '):st._td.vs<3.5?LL('Firm — ','やや強め — ','Fest — ','Жёсткая — ','Firme — '):LL('Hard — ','ハード — ','Hart — ','Грубая — ','Duro — '))
            +LL('touchdown '+st._td.vs.toFixed(1)+' m/s · bank '+Math.round(st._td.bank)+'° · '+Math.round(st._td.V*3.6)+' km/h','接地 '+st._td.vs.toFixed(1)+' m/s · バンク '+Math.round(st._td.bank)+'° · '+Math.round(st._td.V*3.6)+' km/h','Aufsetzen '+st._td.vs.toFixed(1)+' m/s · '+Math.round(st._td.bank)+'° · '+Math.round(st._td.V*3.6)+' km/h','касание '+st._td.vs.toFixed(1)+' м/с · крен '+Math.round(st._td.bank)+'° · '+Math.round(st._td.V*3.6)+' км/ч','contacto '+st._td.vs.toFixed(1)+' m/s · '+Math.round(st._td.bank)+'° · '+Math.round(st._td.V*3.6)+' km/h')+'</div>'):'')
        +'<canvas class="fsr-cv" width="440" height="230" style="width:100%;height:auto;background:rgba(0,0,0,0.4);border-radius:12px;border:1px solid rgba(120,190,255,0.2);display:block;"></canvas>'
        +'<div style="font-size:10px;color:#8fb8e0;margin:6px 0 13px;">'+LL('Flight path — color = altitude (blue low → red high)','飛行経路 — 色は高度（青=低 → 赤=高）','Flugweg — Farbe = Höhe','Маршрут — цвет = высота','Ruta — color = altitud')+'</div>'
        +'<div style="display:flex;gap:16px;margin-bottom:18px;flex-wrap:wrap;">'+stat(LL('DISTANCE','飛行距離','DISTANZ','ДИСТ.','DIST.'),distKm.toFixed(1)+' km')+stat(LL('MAX ALT','最高高度','MAX HÖHE','МАКС ВЫС','ALT MÁX'),maxAltM.toLocaleString()+' m')+stat(LL('TOP SPEED','最高速度','SPITZE','МАКС СК','VEL MÁX'),maxVk.toLocaleString()+' km/h')+stat(LL('TIME','飛行時間','ZEIT','ВРЕМЯ','TIEMPO'),Math.floor(durS/60)+'m '+(durS%60)+'s')+'</div>'
        +'<div style="display:flex;gap:10px;"><button class="fsr-again" style="flex:1;font-size:15px;font-weight:800;color:#fff;background:linear-gradient(135deg,#0a84ff,#34c759);border:none;border-radius:11px;padding:13px;cursor:pointer;">'+LL('↻ Fly again','↻ もう一度飛ぶ','↻ Nochmal','↻ Ещё раз','↻ Otra vez')+'</button>'
          +'<button class="fsr-exit" style="flex:0 0 auto;font-size:14px;font-weight:600;color:#bcd6f0;background:transparent;border:1px solid rgba(120,190,255,0.3);border-radius:11px;padding:13px 20px;cursor:pointer;">'+LL('Exit','終了','Ende','Выход','Salir')+'</button></div></div>';
      document.body.appendChild(ov);
      try{ const cv=ov.querySelector('.fsr-cv'), cx=cv.getContext('2d'), W=cv.width, H=cv.height, pad=16;
        /* (#R99) draw the path in Web-Mercator OVER real satellite imagery (Esri World Imagery tiles) — not a plain
           dark canvas. Tiles are drawn behind the already-drawn path (destination-over) as they load. */
        const merc=(lon,lat)=>[(lon+180)/360, (1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2];
        if(path.length>1){ let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9,mna=1e9,mxa=-1e9;
          path.forEach(p=>{ const m=merc(p[0],p[1]); mnx=Math.min(mnx,m[0]); mxx=Math.max(mxx,m[0]); mny=Math.min(mny,m[1]); mxy=Math.max(mxy,m[1]); mna=Math.min(mna,p[2]); mxa=Math.max(mxa,p[2]); });
          let spanX=(mxx-mnx)||1e-7, spanY=(mxy-mny)||1e-7; const pf=0.12; mnx-=spanX*pf; mxx+=spanX*pf; mny-=spanY*pf; mxy+=spanY*pf; spanX=mxx-mnx; spanY=mxy-mny;
          const sc=Math.min((W-2*pad)/spanX,(H-2*pad)/spanY), ox=(W-spanX*sc)/2, oy=(H-spanY*sc)/2, aR=(mxa-mna)||1;
          const px=lon=>ox+((lon+180)/360-mnx)*sc, pyl=lat=>oy+(merc(0,lat)[1]-mny)*sc;
          cx.lineWidth=2.8; cx.lineCap='round'; cx.lineJoin='round';
          for(let i=1;i<path.length;i++){ const a=path[i-1],b=path[i], t=Math.max(0,Math.min(1,(b[2]-mna)/aR));
            cx.strokeStyle='hsl('+Math.round(210-t*210)+',96%,'+Math.round(54+t*8)+'%)'; cx.beginPath(); cx.moveTo(px(a[0]),pyl(a[1])); cx.lineTo(px(b[0]),pyl(b[1])); cx.stroke(); }
          cx.lineWidth=1.6; cx.strokeStyle='#fff'; cx.fillStyle='#00e676'; cx.beginPath(); cx.arc(px(path[0][0]),pyl(path[0][1]),4.5,0,7); cx.fill(); cx.stroke();
          cx.fillStyle=col; cx.beginPath(); cx.arc(px(path[path.length-1][0]),pyl(path[path.length-1][1]),4.5,0,7); cx.fill(); cx.stroke();
          let z=Math.max(4,Math.min(16,Math.round(Math.log2(sc/256))||4)), tp=Math.pow(2,z);
          let tx0=Math.floor(mnx*tp),tx1=Math.floor(mxx*tp),ty0=Math.floor(mny*tp),ty1=Math.floor(mxy*tp);
          while((tx1-tx0+1)*(ty1-ty0+1)>24 && z>4){ z--; tp=Math.pow(2,z); tx0=Math.floor(mnx*tp);tx1=Math.floor(mxx*tp);ty0=Math.floor(mny*tp);ty1=Math.floor(mxy*tp); }
          const ts=sc/tp;
          for(let tx=tx0;tx<=tx1;tx++) for(let ty=ty0;ty<=ty1;ty++){ if(ty<0||ty>=tp) continue; const im=new Image();
            im.onload=(function(tx,ty,im){ return function(){ try{ cx.save(); cx.globalCompositeOperation='destination-over'; cx.drawImage(im, ox+(tx/tp-mnx)*sc, oy+(ty/tp-mny)*sc, ts+1, ts+1); cx.restore(); }catch(_){} }; })(tx,((ty%tp)+tp)%tp,im);
            im.src='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'+z+'/'+(((ty%tp)+tp)%tp)+'/'+(((tx%tp)+tp)%tp); }
        } else { cx.fillStyle='#8fb8e0'; cx.font='12px ui-monospace,monospace'; cx.fillText(LL('(flight too short to map)','(経路が短すぎます)','(zu kurz)','(слишком коротко)','(muy corto)'),18,H/2); }
      }catch(_){}
      /* (#R170) remember where this flight ENDED, and make "Fly again" resume from there instead of teleporting
         back to the original airport. st._opts still carries the aircraft; the airport-specific fields (elev and
         the runway line) are dropped because they described the ORIGINAL field, not this end point. */
      try{ lastEnd={ lng:+st.lng, lat:+st.lat, hdg:_fsHdg(), t:Date.now(), ok:ok };
        localStorage.setItem('intmap_fs_last',JSON.stringify(lastEnd)); }catch(_){}
      const flyOpts=Object.assign({},st._opts||{},{ aircraft:acKey, lng:lastEnd?lastEnd.lng:undefined, lat:lastEnd?lastEnd.lat:undefined,
        hdg:lastEnd?lastEnd.hdg:undefined, fromEnd:!!lastEnd, elev:null, rwy:null });
      ov.querySelector('.fsr-again').onclick=()=>{ ov.remove(); stop(); setTimeout(()=>{ try{ setup(flyOpts); }catch(_){} },80); };
      ov.querySelector('.fsr-exit').onclick=()=>{ ov.remove(); stop(); };
    }
    /* (#R98) close the Atlas console window when the sim is launched from it (the pre-flight screen / cockpit take over). */
    function _closeAtlas(){ try{ if(window.IntMapConsole&&IntMapConsole.close) IntMapConsole.close(); }catch(_){} try{ const ap=document.getElementById('atlas-panel'); if(ap) ap.style.display='none'; }catch(_){} }
    function setup(opts){ if(on||document.getElementById('fs-setup')) return; opts=opts||{}; _closeAtlas();
      if(!document.getElementById('fss-style')){ const s=document.createElement('style'); s.id='fss-style';
        s.textContent='#fs-setup{position:fixed;inset:0;z-index:6050;background:rgba(4,10,20,0.74);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:16px;font-family:ui-monospace,Menlo,Consolas,monospace;color:#e8f4ff;}'   /* (#R102) z-index above the workspace menu bar (5990) so the pre-flight popup comes to the front in ws mode */
          +'.fss-card{width:min(460px,94vw);max-height:92vh;overflow:auto;background:linear-gradient(180deg,rgba(10,20,34,0.98),rgba(6,14,26,0.98));border:1px solid rgba(120,190,255,0.32);border-radius:18px;padding:20px 20px 18px;box-shadow:0 20px 60px rgba(0,0,0,0.6);}'
          +'.fss-h{font-size:19px;font-weight:800;margin:0 0 14px;letter-spacing:.02em;}'
          +'.fss-lbl{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#8fb8e0;margin:14px 0 7px;}'
          +'.fss-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;}'
          +'.fss-ac{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#cfe6ff;background:rgba(6,14,24,0.6);border:1px solid rgba(120,190,255,0.28);border-radius:10px;padding:9px 10px;cursor:pointer;text-align:left;transition:.12s;}'
          +'.fss-ac.on{background:#0a84ff;border-color:#0a84ff;color:#fff;}'
          +'.fss-sel{width:100%;font-size:14px;font-family:inherit;color:#e8f4ff;background:rgba(6,14,24,0.7);border:1px solid rgba(120,190,255,0.3);border-radius:10px;padding:10px;-webkit-appearance:none;appearance:none;}'
          +'.fss-sel option{background:#0a1522;color:#e8f4ff;}'
          +'.fss-mode{display:flex;gap:7px;}'
          +'.fss-m{flex:1;font-size:12.5px;font-weight:700;color:#cfe6ff;background:rgba(6,14,24,0.6);border:1px solid rgba(120,190,255,0.28);border-radius:10px;padding:11px 8px;cursor:pointer;text-align:center;line-height:1.3;transition:.12s;}'
          +'.fss-m.on{background:#34c759;border-color:#34c759;color:#04120a;}'
          +'.fss-btns{display:flex;gap:10px;margin-top:20px;}'
          +'.fss-cancel{flex:0 0 auto;font-size:14px;font-weight:600;color:#bcd6f0;background:transparent;border:1px solid rgba(120,190,255,0.3);border-radius:11px;padding:12px 18px;cursor:pointer;}'
          +'.fss-go{flex:1;font-size:15px;font-weight:800;letter-spacing:.06em;color:#fff;background:linear-gradient(135deg,#0a84ff,#34c759);border:none;border-radius:11px;padding:12px;cursor:pointer;}';
        document.head.appendChild(s); }
      const selAc=(opts.aircraft&&AIRCRAFT[opts.aircraft])?opts.aircraft:acKey;
      const acRows=AKEYS.map(k=>{ const a=AIRCRAFT[k], nm=((a.name&&(a.name[HOST.lang]||a.name.en))||k).split('·')[0].trim(); return '<button class="fss-ac'+(k===selAc?' on':'')+'" data-ac="'+k+'">'+(a.icon?a.icon+' ':'')+nm+'</button>'; }).join('');
      /* (#R170) the previous flight's end point is a first-class start location, listed first and preselected
         when we got here from "Fly again" — that IS 「終了地点から再飛行」. It is offered on a fresh launch too
         (it persists), so "carry on from where I came down" doesn't require going through the result screen. */
      const _lastOpt=lastEnd?('<option value="__last">'+LL('📍 Last flight end point','📍 前回の終了地点','📍 Letzter Endpunkt','📍 Конец прошлого полёта','📍 Fin del vuelo anterior')+' ('+lastEnd.lat.toFixed(2)+', '+lastEnd.lng.toFixed(2)+')</option>'):'';
      const apOpts=_lastOpt+'<option value="__here">'+LL('📍 Current map view','📍 現在の地図の中心','📍 Aktuelle Kartenmitte','📍 Центр карты','📍 Vista actual')+'</option>'+AIRPORTS.map((a,i)=>'<option value="'+i+'">'+a[1]+' ('+a[0]+')</option>').join('');
      const ov=document.createElement('div'); ov.id='fs-setup';
      ov.innerHTML='<div class="fss-card"><div class="fss-h">✈ '+LL('Flight Simulator','フライトシミュレーター','Flugsimulator','Авиасимулятор','Simulador de vuelo')+'</div>'
        +'<div class="fss-lbl">'+LL('Aircraft','機体','Flugzeug','Самолёт','Aeronave')+'</div><div class="fss-grid">'+acRows+'</div>'
        +'<div class="fss-lbl">'+LL('Start location','開始地点','Startort','Место старта','Ubicación')+'</div><select class="fss-sel">'+apOpts+'</select>'
        +'<div class="fss-lbl">'+LL('Start mode','開始状態','Startmodus','Режим старта','Modo')+'</div><div class="fss-mode">'
          /* (#R170) AIRBORNE is the default (「フライトシミュレーターは、空中で開始をデフォルトに」) — the .on class
             moved from the runway button to this one, matching the `mode:'air'` initial state below. */
          +'<button class="fss-m" data-m="ground">🛫 '+LL('On the runway','滑走路から','Auf der Piste','На полосе','En pista')+'</button>'
          +'<button class="fss-m on" data-m="air">🛩 '+LL('Airborne','空中（巡航）','In der Luft','В воздухе','En vuelo')+'</button></div>'
        /* (#R190) 「高度は一律ではなく、実際に今見てる画角と高度で」 — say what an airborne start from
           THIS view will actually use, before it is pressed. The number is the eye's own altitude,
           clamped to the chosen machine's service ceiling (a 737 has no air to fly in at 300 km);
           when the clamp bites, this line says so instead of leaving every wide view to begin at the
           same height with no explanation. It also states the tilt that will be flown (#R190). */
        +'<div class="fss-note" style="margin-top:9px;font-size:11px;color:#9fc3e6;line-height:1.5;min-height:16px;"></div>'
        +'<div class="fss-btns"><button class="fss-cancel">'+LL('Cancel','キャンセル','Abbrechen','Отмена','Cancelar')+'</button><button class="fss-go">'+LL('START ▸','スタート ▸','START ▸','СТАРТ ▸','INICIAR ▸')+'</button></div></div>';
      document.body.appendChild(ov);
      const state={ ac:selAc, loc:((opts.fromEnd&&lastEnd)?'__last':'__here'), mode:'air' };   /* (#R170) airborne default + resume from the last end point */
      try{ const _s0=ov.querySelector('.fss-sel'); if(_s0) _s0.value=state.loc; }catch(_){}
      /* (#R190) the live preview of what "Current map view + airborne" resolves to */
      const _note=ov.querySelector('.fss-note');
      function _syncNote(){ if(!_note) return; _note.innerHTML='';
        if(state.loc!=='__here'||state.mode!=='air') return;
        try{
          const eye=(GE().camera.eye?GE().camera.eye():null); if(!eye||!isFinite(eye.alt)) return;
          const a2=AIRCRAFT[state.ac]||AIRCRAFT[acKey], ceil=(a2&&a2.ceil)||12000;
          const use=Math.max(150,Math.min(ceil,eye.alt)), capped=eye.alt>ceil;   /* (#R212) clamped again — see the note by the start path */
          const p2=(GE().camera.getPitch?GE().camera.getPitch():null);
          const km=(v)=>v>=1000?((v/1000).toFixed(v>=10000?0:1)+' km'):(Math.round(v)+' m');
          const bits=[LL('Start altitude','開始高度','Starthöhe','Высота старта','Altitud inicial')+' '+km(use)
            /* (#R212) the clamp is back, so the note says so — the number above is what you will get */
            +(capped?(' <span style="color:#ffd23f;">('+LL('limited to this aircraft’s service ceiling','機体の実用上昇限度に制限','auf die Dienstgipfelhöhe begrenzt','ограничено практическим потолком','limitado al techo de servicio')
              +' '+km(ceil)+')</span>'):'')];
          if(p2!=null&&isFinite(p2)) bits.push(LL('flight path','飛行経路角','Bahnwinkel','угол наклона','trayectoria')+' '+Math.round(p2-90)+'°');
          _note.innerHTML=bits.join(' · ');
        }catch(_){}
      }
      ov.querySelectorAll('.fss-ac').forEach(b=>b.onclick=()=>{ state.ac=b.getAttribute('data-ac'); ov.querySelectorAll('.fss-ac').forEach(x=>x.classList.toggle('on',x===b)); _syncNote(); });
      const sel=ov.querySelector('.fss-sel'); sel.onchange=()=>{ state.loc=sel.value; _syncNote(); };
      ov.querySelectorAll('.fss-m').forEach(b=>b.onclick=()=>{ state.mode=b.getAttribute('data-m'); ov.querySelectorAll('.fss-m').forEach(x=>x.classList.toggle('on',x===b)); _syncNote(); });
      _syncNote();
      ov.querySelector('.fss-cancel').onclick=()=>ov.remove();
      ov.querySelector('.fss-go').onclick=async()=>{ const o={ aircraft:state.ac }; let icao=null;
        if(state.loc==='__last'&&lastEnd){ o.lng=lastEnd.lng; o.lat=lastEnd.lat; if(isFinite(lastEnd.hdg)) o.hdg=lastEnd.hdg; }   /* (#R170) resume from where the last flight ended */
        else if(state.loc!=='__here'){ const a=AIRPORTS[+state.loc]; if(a){ o.lat=a[2]; o.lng=a[3]; o.elev=a[4]; o.hdg=a[5]; icao=a[0]; } }
        else if(opts.lng!=null){ o.lng=+opts.lng; o.lat=+opts.lat; }
        if(state.mode==='ground') o.onGround=true; else o.alt=(o.elev!=null?o.elev+2500:2500);
        /* ══ (#R187) "CURRENT MAP VIEW" MEANS THE VIEW YOU ARE ACTUALLY IN ══════════════════════════
           「フライトシミュレーターのcurrent map viewのairborne開始時は、高度は一律ではなく、実際に今
             見てる画角と高度で開始するように。」

           Every airborne start used the same two numbers regardless of what was on screen: a flat
           2,500 m above sea level, then start() lifted it to ground + 1,500 m (_clrLift). Whether the
           user was looking down a valley from 800 m or across a continent from 300 km, the flight
           began at the same height — which is the 「一律」 in the report.

           The renderer already knows where the eye is: camera.eye() is the viewpoint #R172 exposed and
           #R177/#R181 corrected for the globe (it answers on the sphere, not on a tangent plane, which
           is why it can be trusted at low zoom). So an airborne start from "Current map view" takes
           the eye's OWN position and altitude, and `keepAlt` tells start() not to overrule it — the
           ground clearance drops to +30 m, which still cannot spawn inside a mountain but no longer
           discards the altitude that was asked for. Heading is unchanged: start() already reads the
           map's bearing, which is the other half of 「今見てる画角」.

           ⚠ CLAMPED TO THE AIRFRAME, NOT TO A ROUND NUMBER. A globe view at z2 puts the eye some
           10,000 km up; a 737 there has no air to fly in and `ac.ceil` (the service ceiling, already
           the point where thrust fades in stepFixed) is the real limit of the model. So the eye's
           altitude is used as-is whenever it is inside the envelope — which is exactly the case this
           instruction is about — and clamped to the aircraft's own ceiling when it is not. */
        if(state.loc==='__here'&&state.mode!=='ground'){
          try{
            const eye=(GE().camera.eye?GE().camera.eye():null);
            if(eye&&isFinite(eye.alt)&&isFinite(eye.lng)&&isFinite(eye.lat)){
              /* ⚠ (#R210 → REVERTED #R212) THE START ALTITUDE IS CLAMPED TO THE SERVICE CEILING AGAIN.
                 #R190 clamped it; 「一定高度以上は強制的に高度を下げさせられるのを辞めて」 asked for the
                 clamp to go, so #R210 removed it and let the physics sink the aircraft instead; the
                 follow-up is 「やっぱ元に戻して。」 — put it back. So this is #R190's behaviour again,
                 restored on request rather than re-derived: the eye's own position and altitude are
                 used inside the envelope, and above the airframe's service ceiling the start altitude
                 becomes that ceiling. The 150 m floor is unchanged — that one is "above the ground". */
              const _ac=AIRCRAFT[state.ac]||AIRCRAFT[acKey], _ceil=(_ac&&_ac.ceil)||12000;
              o.lng=eye.lng; o.lat=eye.lat;
              o.alt=Math.max(150,Math.min(_ceil,eye.alt));
              o.keepAlt=true;
            }
            /* ══ (#R188) 「画角も合わせてください。」 ════════════════════════════════════════════════
               #R187 carried the eye's POSITION and ALTITUDE across and said heading was 「the other
               half of 今見てる画角」. It is not: heading was already right before #R187 (start() has
               read the map's bearing since #R95), so nothing about the view actually changed. What
               was never carried is the TILT — and the tilt is what makes one view different from
               another at the same place.

               Confirmed with the user this round: match BOTH the attitude and the camera. So the
               view's tilt is handed over as two separate facts, because they answer two different
               questions:

                 · `viewGamma` — where the aeroplane is GOING. The camera convention is the same one
                   the sim already uses (90° = level, 0° = straight down), so the flight-path angle
                   the view implies is pitch − 90°. ⚠ It is then clamped by computeTrim() to what the
                   airframe can actually HOLD — full-thrust climb angle above, idle glide angle below,
                   both computed from the same drag polar as the level trim, not from a round number.
                   A map looking straight down does not become a vertical dive; it becomes the
                   steepest steady descent this aeroplane makes.
                 · `viewCam` — what the SCREEN shows in the first frame. The aeroplane's own attitude
                   would snap the view to the horizon the instant START is pressed, however the
                   aeroplane is trimmed. Seeding the camera smoother with the map's own bearing/
                   pitch/roll makes frame one the view that was on screen, and it eases into the
                   cockpit over 1.2 s (see the intro window in the frame loop). */
            const _p=(GE().camera.getPitch?GE().camera.getPitch():null);
            const _b=(GE().camera.getBearing?GE().camera.getBearing():null);
            const _r=(GE().camera.getRoll?GE().camera.getRoll():0);
            if(_p!=null&&isFinite(_p)){
              o.viewGamma=(_p-90)*Math.PI/180;
              o.viewCam={ pitch:_p, bearing:(isFinite(_b)?_b:0), roll:(isFinite(_r)?_r:0) };
              /* ══ (#R189) THE FRAMING IS THE THIRD FACT. ═══════════════════════════════════════════
                 #R188 carried the angles (pitch/bearing/roll) and the report still came back — because
                 the SCALE never did. The cockpit camera aims a fixed 1,800 m ahead, so however well
                 frame one's angles matched, its zoom was whatever the clamped altitude gave: from any
                 view shallower than ~z13.5 the eye clamp saturated at the service ceiling and every
                 start LOOKED identical — the 「一律」. The seed now records the map's own EYE position
                 and its eye→centre DISTANCE; the frame loop starts the camera exactly there (same
                 framing, same zoom, whatever the zoom was) and flies it into the cockpit over the
                 intro window. The AIRCRAFT still spawns inside its envelope — a machine cannot fly at
                 300 km — but the picture now starts as the picture the user pressed START on. */
              try{ const c0=GE().camera.getCenter();
                if(eye&&c0&&isFinite(eye.alt)&&isFinite(c0.lng)&&isFinite(c0.lat)){
                  const cosL=Math.cos(((eye.lat+c0.lat)/2)*Math.PI/180);
                  const dx=(c0.lng-eye.lng)*111320*cosL, dy=(c0.lat-eye.lat)*110574;
                  o.viewCam.eye={ lng:eye.lng, lat:eye.lat, alt:eye.alt };
                  o.viewCam.dist=Math.max(200,Math.hypot(dx,dy,eye.alt));
                } }catch(_){}
            }
          }catch(_){}
        }
        /* (#R119) REAL RUNWAY spawn: fetch the airport's actual runways (OurAirports, both-end coordinates),
           take the longest, spawn ON its threshold heading down the true centreline; the runway line also
           drives the landing-corridor evaluation + PAPI. Bounded to 8 s — falls back to the curated
           midfield+heading spawn if the data can't load. */
        if(icao&&state.mode==='ground'&&window.RunwaySearch&&window.RunwaySearch.load){
          const goB=ov.querySelector('.fss-go'); try{ goB.disabled=true; goB.textContent=LL('Loading runways…','滑走路データ取得中…','Pisten laden…','Загрузка ВПП…','Cargando pistas…'); }catch(_){}
          try{ const d=await Promise.race([window.RunwaySearch.load(), new Promise(r=>setTimeout(()=>r(null),8000))]);
            if(d){ const rws=d.filter(r=>r.apt===icao&&r.leLa!=null&&r.lenM>500);
              if(rws.length){ rws.sort((x,y)=>y.lenM-x.lenM); const rw=rws[0];
                const brg=(Math.atan2((rw.heLo-rw.leLo)*Math.cos((rw.leLa+rw.heLa)/2*Math.PI/180),(rw.heLa-rw.leLa))*180/Math.PI+360)%360;
                o.lat=rw.leLa; o.lng=rw.leLo; o.hdg=brg;
                o.rwy={ A:[rw.leLo,rw.leLa], B:[rw.heLo,rw.heLa], id:rw.rwy, ident:rw.leId||rw.rwy, len:rw.lenM }; } } }catch(_){}
        }
        ov.remove(); start(o); };
    }
    function start(opts){ if(on) return true; on=true; opts=opts||{}; _closeAtlas();
      /* (#R158) SOLE CAMERA CONTROLLER: cancel any in-flight MapLibre camera animation (Atlas flyTo, a snap-back easeTo, the
         globe intro) before the sim takes over — the per-frame jumpTo below is then the only thing driving the camera. The
         globe-tour auto-spin is stopped separately by _fsStashLayers() (its checkbox lives in #layer-dropdown). */
      try{ if(GE().camera.stop) GE().camera.stop(); }catch(_){} try{ window.__fsCamSkips=0; }catch(_){}
      if(opts.aircraft&&AIRCRAFT[opts.aircraft]) acKey=opts.aircraft;
      const c=GE().camera.getCenter(), ac=AC();
      /* (#R95) start heading = the map's bearing. The old `map.getBearing()||90` turned a perfectly valid 0° (north-
         up map) into 90° (east) because 0 is falsy — read it properly instead. */
      let b0=0; try{ const _b=(GE().camera.getBearing?GE().camera.getBearing():0); if(_b!=null&&isFinite(_b)) b0=_b; }catch(_){}
      if(opts.hdg!=null&&isFinite(opts.hdg)) b0=+opts.hdg;   /* (#R97) runway / requested heading */
      st={ lng:(opts.lng!=null?+opts.lng:c.lng), lat:(opts.lat!=null?+opts.lat:c.lat), alt:(opts.alt!=null?+opts.alt:2500),
        vb:[ac.Vcruise,0,0], q:[1,0,0,0], om:[0,0,0], elevTrim:0,
        thr:0, elev:0, ail:0, rud:0, flaps:0, gear:0, brake:0,
        V:(opts.speed!=null?+opts.speed:ac.Vcruise), phi:0, theta:0, psi:(b0*Math.PI/180), gamma:0, aoa:0, beta:0, vs:0, G:1,
        onGround:false, lastTerr:null, _settleTerr:false, groundStart:false, _tookOff:true, _acc:0, t:performance.now() };
      paused=false; stabilizeCam=false; camMode='cockpit';
      resultShown=false; st._path=[]; st._t0=performance.now(); st._opts=opts; st._maxAlt=st.alt; st._maxV=st.V||0; st._pathT=0; st._pathIntv=350; st._pausedMs=0; st._pauseStart=0; st._dist=0; st._lastPt=[st.lng,st.lat];   /* (#R98/#R99/#R100) flight-path recording + pause-time exclusion + full-res distance accumulation */
      st._rwy=(opts.rwy&&opts.rwy.A&&opts.rwy.B)?opts.rwy:null;   /* (#R119) the REAL runway line (both thresholds) — landing corridor + PAPI */
      st._keepAlt=!!opts.keepAlt;   /* (#R175) the caller supplied a real altitude — see _clrLift/_clrMin */
      st.fuel=(ac.fuelKg>0)?ac.fuelKg:null;   /* (#R120) full usable fuel at engine start (null = engineless glider) */
      /* (#R119) LIVE WINDS ALOFT at the spawn area (Open-Meteo, m/s, surface + 5 pressure levels). The physics
         uses AIR-relative velocity, so a real head/cross/tailwind now affects take-off run, drift, approach and
         touchdown. Fetch is async & optional — no wind data = calm (physics unchanged). */
      st._wind=null; st._wNE=[0,0];
      try{ const _wla=st.lat.toFixed(3), _wlo=st.lng.toFixed(3);
        fetch('https://api.open-meteo.com/v1/forecast?latitude='+_wla+'&longitude='+_wlo+'&current=wind_speed_10m,wind_direction_10m&hourly=wind_speed_925hPa,wind_direction_925hPa,wind_speed_850hPa,wind_direction_850hPa,wind_speed_700hPa,wind_direction_700hPa,wind_speed_500hPa,wind_direction_500hPa,wind_speed_300hPa,wind_direction_300hPa&forecast_days=1&wind_speed_unit=ms&timezone=UTC')
          .then(r=>r.ok?r.json():null).then(j=>{ if(!j||!st) return;
            let hr=0; try{ const iso=new Date().toISOString().slice(0,13); const arr=j.hourly&&j.hourly.time; if(arr){ const ix=arr.findIndex(t2=>String(t2).slice(0,13)===iso); if(ix>=0) hr=ix; } }catch(_){}
            const tbl=[]; const cur=j.current||{}; if(cur.wind_speed_10m!=null) tbl.push({alt:10,sp:+cur.wind_speed_10m||0,di:+cur.wind_direction_10m||0});
            const H=j.hourly||{}; [['925',750],['850',1500],['700',3000],['500',5600],['300',9200]].forEach(p=>{ const s2=H['wind_speed_'+p[0]+'hPa'],d2=H['wind_direction_'+p[0]+'hPa']; if(s2&&s2[hr]!=null) tbl.push({alt:p[1],sp:+s2[hr]||0,di:(d2&&+d2[hr])||0}); });
            if(tbl.length) st._wind=tbl; }).catch(()=>{}); }catch(_){}
      /* (#R97) GROUND START: spawn stationary ON the runway (gear down, level, heading down the runway, throttle idle)
         so the user takes off; the height settles onto the real DEM (see _settleTerr). Otherwise trim for level cruise. */
      if(opts.onGround && ac.Tmax<=0) opts=Object.assign({},opts,{onGround:false});   /* (#R100) an engineless glider can't roll for take-off → a runway choice becomes an aerotow RELEASE: an airborne start (the settle lifts it to a safe release height), not a 33 m/s ground "warp" */
      if(opts.onGround){ st.V=0; st.vb=[0,0,0]; st.gear=1; st.thr=0; st.onGround=true; st.groundStart=true; st._tookOff=false;
        st.alt=(opts.elev!=null?+opts.elev:(st.lastTerr!=null?st.lastTerr:st.alt)); st._groundAlt=st.alt; st._fieldElev=(opts.elev!=null?+opts.elev:null); st._fLL=[st.lng,st.lat]; st._maxAlt=st.alt; st._maxV=0; st.q=qFromEuler(0,0,st.psi); st.aoa=0; st.theta=0; }   /* (#R117) stats start from the runway; (#R118) _fLL = the airport anchor point */   /* (#R117) remember the airport's REAL field elevation — DEM reads far off it while tiles load are rejected */
      else { computeTrim(opts.viewGamma);   /* (#R188) "current map view" hands over the tilt it was showing */
        /* ══ (#R190) 「（画角が水平で強制的に始まる）」 — AND IT REALLY WAS ═════════════════════════════
           Measured on the shipped build (z9.5 / pitch 45 / bearing 70 → START): the camera does begin
           at 9.50/45.0/70.0 — #R189's intro seed works — and by t = 2.0 s it is at pitch 90.5 and it
           stays there for ever. Because computeTrim() clamps the requested flight-path angle into the
           envelope of STEADY flight (between the idle glide angle and the full-thrust climb angle),
           a 45° look-down became about −4° of descent, the nose came level within a second, and the
           cockpit view — which is the nose — went horizontal. The seed was a 1.2-second flourish over
           an aeroplane that had already been levelled.

           Confirmed with the user this round: fly the aeroplane at that angle. So the trim above still
           solves the throttle, the elevator trim and the speed for the steady case, and then the
           ATTITUDE is set to the angle the view was actually showing. The aeroplane is out of trim,
           which is the point — it pulls out of the dive, or decelerates in the zoom climb, as a real
           one does. Nothing "forces" it level; the physics flies it there, and the cockpit view goes
           with the nose, so frame one and second one are both the picture START was pressed on.

           ⚠ ONE LIMIT, AND IT IS A PHYSICAL ONE, NOT A ROUND NUMBER. The app's default map view is
           straight down (pitch 0 → γ = −90°), so without a limit every start from an untilted map
           would be a vertical dive — at low altitude, an instant crash. The limit is the height the
           recovery needs: pulling n g out of a dive at γ costs h = V²(1−cos γ)/(g(n−1)), so the
           steepest ENTERABLE dive is the one whose pull-out fits in the height under the aeroplane.
           With room, any angle is honoured (a 45° dive from 15 km is flown as a 45° dive). Without
           it, the angle is reduced to the steepest one that can still be flown out of — and the
           envelope clamp is no longer what decides. */
        st._wantGamma=(opts.viewGamma!=null&&isFinite(opts.viewGamma))?+opts.viewGamma:null;
      }
      /* (#R188) …and the CAMERA starts where the map was, not where the aeroplane points. Read before
         the basemap/projection switches below touch the camera, so it is genuinely the view the user
         pressed START on. The frame loop consumes and clears it. */
      if(opts.viewCam&&isFinite(opts.viewCam.pitch)){ const vc=opts.viewCam;
        /* (#R189) the seed carries the map's eye POSITION and look DISTANCE too — see the pre-flight
           card. A big altitude cut gets a slightly longer window so the descent is a move, not a drop. */
        const _se=(vc.eye&&isFinite(vc.eye.alt)&&isFinite(vc.eye.lng)&&isFinite(vc.eye.lat))?{lng:+vc.eye.lng,lat:+vc.eye.lat,alt:+vc.eye.alt}:null;
        const _gap=_se?Math.abs(_se.alt-st.alt):0;
        st._camSeed={ pitch:+vc.pitch,
          bearing:(isFinite(vc.bearing)?+vc.bearing:0),
          roll:(isFinite(vc.roll)?+vc.roll:0),
          eye:_se, dist:(isFinite(vc.dist)&&vc.dist>0)?+vc.dist:null,
          t0:performance.now(), ms:(_gap>10000?2000:1200) }; }
      prevCam={ center:GE().camera.getCenter(), zoom:GE().camera.getZoom(), bearing:GE().camera.getBearing(), pitch:GE().camera.getPitch(), roll:(GE().camera.getRoll?GE().camera.getRoll():0) };
      /* (#R85b) "自動でSatellite, 3Dにしろ" + a real first-person cockpit view: switch to a flat satellite map with
         3-D terrain (also gives queryTerrainElevation real ground for collisions), and raise the max pitch so the
         camera can look forward to the horizon. State is remembered and restored on exit. */
      try{ prevView={ base:(typeof HOST.mapType!=='undefined'?HOST.mapType:'map'), proj:(typeof HOST.proj!=='undefined'?HOST.proj:'globe'), terr:(typeof HOST.terrain3D!=='undefined'?HOST.terrain3D:false), maxPitch:(GE().camera.getMaxPitch?GE().camera.getMaxPitch():60) }; }catch(_){ prevView=null; }
      try{ if(GE().camera.setMaxPitch) GE().camera.setMaxPitch(179); }catch(_){}                                       /* (#R95) let the camera look UP past the vertical (climb / loop) — MapLibre v5 accepts ≤180 */
      try{ if(GE().camera.setCenterClamped) GE().camera.setCenterClamped(false); }catch(_){}            /* keep the eye above ground when pitch>90° (per MapLibre docs) */
      /* (#R172) take the tilt PIVOT back for the flight. With unlimited tilt on, the engine installs a
         per-update camera hook that keeps the viewpoint still while the user tilts; the sim is the sole camera
         controller (#R158) and writes the whole camera every frame, so it wants that hook out of the path
         entirely rather than relying on it to no-op. stop() hands it back to js/view-controls.js. */
      try{ const GE=window.IntMapGeoEngine; if(GE&&GE.camera&&GE.camera.setTiltPivot) GE.camera.setTiltPivot('target'); }catch(_){}
      /* (#R98) KEEP THE GLOBE — the sim used to force a flat projection; fly on the real curved Earth instead.
         (#R170) …and force the Globe view on entry, so a pilot who took off from the Flat view flies a globe too.
         (#R171) …and then ALSO asked the engine for 'globe-true' (vertical-perspective), because MapLibre's
         `globe` renders as plain mercator from about z12 up and the cockpit sits at z≈15.
         (#R172) THAT LINE IS GONE — it is what "フライトシミュレーターが完全に破損している" was. Reproduced and
         attributed by flying both trees: on #R170 the cockpit shows Mt Fuji, terrain, sea and a blue sky; on
         #R171 it is a WHITE VOID with nothing in it but the HUD. Confirmed again with the camera frozen
         mid-flight (z15.2, pitch 90.6, 9 s settle) flipping only the projection, A/B/A/B: 'globe' draws the
         world every time, 'vertical-perspective' draws nothing every time. The renderer can do a curved Earth
         at cockpit zoom OR a DEM under the aeroplane, not both — and a flight simulator does not trade away its
         terrain, which is the mountain you are about to hit. So the sim asks for the app's GLOBE (the honest
         "Globe, not Flat"), and the engine now refuses 'globe-true' outright instead of blanking the map. */
      try{ if(HOST.proj!=='globe'&&window.IntMapOS) IntMapOS.exec('view.proj.globe',{source:'flightsim'}); }catch(_){}
      /* (#R99) REAL SKY & HAZE — the sky was pure black (no height cue). MapLibre 5's sky spec gives a blue gradient,
         pale horizon haze and distance fog; restored on exit. */
      try{ prevView.sky=(GE().scene.getSky?GE().scene.getSky():undefined); }catch(_){}
      /* (#R174) THE SKY IS THE RENDERER'S AGAIN. #R173 made MapLibre's sky transparent and painted its own
         gradient behind the canvas; the verdict was 「空を勝手に描くな！不自然。自然ならいいが、そうじゃない
         のに余計なことをするな」. This is the #R99 spec, unchanged since, restored verbatim: a real blue
         gradient, pale horizon haze, distance fog. Nothing of the sim's is drawn behind the map, and the
         pre-flight sky is put back on exit (prevView.sky). */
      /* ══ (#R196) …AND NO DISTANCE HAZE ═══════════════════════════════════════════════════════════
         「MapLibre時のフライトシミュレーターで、遠くを白く霞ませるエフェクトはやめろ。」
         That wash is the FOG half of the block above, and the spec says exactly which two numbers
         produce it: `fog-ground-blend` is "0 is the map centre and 1 is the horizon", so 0.35 started
         the fog barely a third of the way out and painted #dbe6f0 over everything beyond; and
         `horizon-fog-blend` is "0 is the horizon colour only, 1 is the fog colour only", so 0.55 put
         half of that same wash into the horizon band as well. Both are moved to the end of their own
         range — fog only exactly at the horizon, and a horizon that is the horizon colour — which
         removes the haze without removing the sky. `fog-color` is left declared because it is what
         those two numbers blend towards; with them at 1/0 it contributes nothing, and deleting the
         key would silently hand MapLibre its own default (#ffffff) instead.
         ⚠ The SKY half is untouched: sky-color / horizon-color / sky-horizon-blend and the
         atmosphere are the #R99 spec that #R174's 「空を勝手に描くな」 settled. */
      try{ if(GE().scene.setSky) GE().scene.setSky({'sky-color':'#3f78c2','sky-horizon-blend':0.75,'horizon-color':'#cfe0ee','horizon-fog-blend':0,'fog-color':'#dbe6f0','fog-ground-blend':1,'atmosphere-blend':['interpolate',['linear'],['zoom'],0,0.9,10,0.55,15,0.1]}); }catch(_){}
      try{ if(typeof HOST.mapType==='undefined'||HOST.mapType!=='sat'){ const b=document.getElementById('btn-view-sat'); if(b) b.click(); } }catch(_){}
      try{ const b3=document.getElementById('btn-view-3d'); if(b3&&!b3.classList.contains('active')) b3.click(); }catch(_){}
      try{ const t=document.getElementById('sat-controller'); if(t) t.style.display='none'; }catch(_){}   /* keep the sat panel out of the cockpit */
      /* (#R95) spawn clearance is settled once the DEM loads (see _settleTerr in stepFixed). If the ground is already
         known under us, lift now; otherwise defer so we never read a false 0 m over the mountains. */
      /* (#R175) …unless the CALLER already knows the altitude. `keepAlt` is opt-in and nothing that existed
         before this round passes it, so every previous path (the pre-flight card, Atlas, "fly again")
         behaves byte-identically. It exists because the live-aircraft card starts a flight at a REAL
         aeroplane's reported altitude (js/aircraft-detail.js): a 737 on approach at 250 m is the whole
         point of that button, and the blanket +1,500 m clearance would silently discard it. The floor does
         not disappear — it becomes ground +30 m, so a late DEM read can still never spawn inside a hill. */
      { const tr0=_terrRead(st.lng,st.lat), plaus0=tr0.ok&&(st._fieldElev==null||Math.abs(tr0.v-st._fieldElev)<150);   /* (#R117) a half-loaded DEM can read e.g. −1439 m at Haneda — never settle the runway onto garbage */
        if(plaus0){ if(opts.onGround){ st.alt=tr0.v+1.2; st._groundAlt=st.alt; st.groundStart=false; } else st.alt=Math.max(st.alt, tr0.v+_clrLift()); } else st._settleTerr=true; }
      /* (#R190) …and NOW the view's angle can be flown, because the height under the aeroplane is
         known: the pull-out room is what limits it (see the note at computeTrim's call site). */
      try{ if(st._wantGamma!=null&&!opts.onGround) _flyViewGamma(st._wantGamma); }catch(_){}
      try{ HANDLERS.forEach(h=>GE().input.set(h,false)); }catch(_){}
      try{ _FSBLOCK.forEach(ev=>window.addEventListener(ev,_fsBlocker,true)); }catch(_){}   /* (#R117) map features become display-only (see _fsBlocker) */
      /* (#R102) FULLSCREEN WITHIN IntMap — the map is lifted above all app chrome (see .fs-flying CSS), covering the whole
         IntMap viewport. The browser `requestFullscreen()` (desktop/OS fullscreen) was REMOVED per request ("デスクトップ
         での全画面という意味ではない"). Resize the map after the container changes size. */
      try{ document.body.classList.add('fs-flying'); }catch(_){}
      try{ _fsStashLayers(); }catch(_){}   /* (#R122) hide every data layer / highlight / outline while flying (place-name labels stay); restored on exit */
      try{ GE().render.resize(); }catch(_){} setTimeout(()=>{ try{ GE().render.resize(); }catch(_){} },120); setTimeout(()=>{ try{ GE().render.resize(); }catch(_){} },320);
      buildHUD(); addExtraHUD();
      /* (#R158) The blue sea WATER-FILL overlay was REMOVED per request ("フライトシミュレーターの海を水で満たす加工は廃止").
         The ocean now shows the real satellite imagery — the R158 satellite protocol upscales the nearest real tile so the
         open sea reads as genuine imagery instead of Esri's grey "no data" placeholder (the reason the fill was added in R152).
         The PHYSICS sea-surface floor (can't dive below sea level over open ocean) is unrelated and stays. */
      try{ if(GE().layers.has('fs-ocean-water')) GE().layers.remove('fs-ocean-water'); if(GE().layers.hasSource('fs-ocean')) GE().layers.removeSource('fs-ocean'); }catch(_){}   /* clear any leftover fill from an older session */
      try{ fsAudio.start(); }catch(_){}   /* (#R101) start the synthesized flight audio (this call rides the START-button user gesture) */
      mmOn=true; try{ createMinimap(); }catch(_){}   /* (#R96) moving-map on by default each flight */
      window.addEventListener('keydown',onKey,true); window.addEventListener('keyup',onKeyUp,true);
      /* (#R95) drop every held control when focus/visibility/touch is lost mid-manoeuvre — otherwise keyup never
         fires and the roll/pitch/throttle key sticks (e.g. tab-switch during a turn, or an interrupted touch). */
      window.addEventListener('blur',onLoseFocus); document.addEventListener('visibilitychange',onVisChange);
      window.addEventListener('pointercancel',onLoseFocus,true); window.addEventListener('touchcancel',onLoseFocus,true);
      window.__fsCamActive=true;
      st.t=performance.now(); raf=requestAnimationFrame(loop); return true; }
    function stop(){ if(!on) return; on=false; if(raf) cancelAnimationFrame(raf); raf=null;
      window.removeEventListener('keydown',onKey,true); window.removeEventListener('keyup',onKeyUp,true);
      window.removeEventListener('blur',onLoseFocus); document.removeEventListener('visibilitychange',onVisChange);
      window.removeEventListener('pointercancel',onLoseFocus,true); window.removeEventListener('touchcancel',onLoseFocus,true);
      window.__fsCamActive=false;
      try{ if(GE().camera.setCenterClamped) GE().camera.setCenterClamped(true); }catch(_){}   /* (#R95) restore the default ground-clamp */
      /* (#R172) …and hand the camera back to whoever owned it before the flight. The unlimited-tilt setting
         also unpins the ground-clamp (js/view-controls.js) and installs the eye pivot; the line above would
         otherwise silently undo it for anyone who has that setting on. One re-apply puts the owner in charge. */
      try{ if(window.IntMapTilt){ window.IntMapTilt.apply(); window.IntMapTilt.wireTilt(); } }catch(_){}
      try{ if(GE().layers.has('fs-ocean-water')) GE().layers.remove('fs-ocean-water'); if(GE().layers.hasSource('fs-ocean')) GE().layers.removeSource('fs-ocean'); }catch(_){}   /* (#R158) water-fill removed (R152 feature retired) — clean up any leftover layer/source */
      for(const k in keys) keys[k]=false;
      try{ _FSBLOCK.forEach(ev=>window.removeEventListener(ev,_fsBlocker,true)); }catch(_){}   /* (#R117) restore normal map interactivity exactly as before the flight */
      try{ HANDLERS.forEach(h=>GE().input.set(h,true)); }catch(_){}
      try{ fsAudio.stop(); }catch(_){}   /* (#R101) fade out + close the audio context */
      try{ destroyMinimap(); }catch(_){}   /* (#R96) tear down the moving-map's GL context */
      resultShown=false; try{ const r=document.getElementById('fs-result'); if(r) r.remove(); }catch(_){}   /* (#R98) clear the result screen */
      if(hud){ hud.remove(); hud=null; }
      /* (#R85c) leave fullscreen + restore the normal layout */
      try{ document.body.classList.remove('fs-flying'); }catch(_){}
      try{ _fsRestoreLayers(); }catch(_){}   /* (#R122) re-enable every layer/highlight that was on before the flight */
      try{ if(document.fullscreenElement&&document.exitFullscreen) document.exitFullscreen().catch(()=>{}); }catch(_){}
      try{ GE().render.resize(); }catch(_){} setTimeout(()=>{ try{ GE().render.resize(); }catch(_){} },140);
      try{ if(GE().camera.setRoll) GE().camera.setRoll(0); }catch(_){}
      /* (#R85b) restore the pre-flight view (basemap / projection / 3-D / max pitch) */
      try{ const pv=prevView; if(pv){
        if(GE().camera.setMaxPitch) GE().camera.setMaxPitch(pv.maxPitch||60);
        try{ if(GE().scene.setSky) GE().scene.setSky(pv.sky||undefined); }catch(_){}   /* (#R99) restore the pre-flight sky */
        if(pv.base!=='sat'&&typeof HOST.mapType!=='undefined'&&HOST.mapType==='sat'){ const b=document.getElementById('btn-view-map'); if(b) b.click(); }
        if(!pv.terr&&typeof HOST.terrain3D!=='undefined'&&HOST.terrain3D){ const b3=document.getElementById('btn-view-3d'); if(b3) b3.click(); }
        /* (#R170) restore BOTH ways. The old line only knew how to put the globe back; now that entry forces
           globe, a pilot who took off from the Flat view would otherwise be silently left on the globe.
           (#R171) …and restore UNCONDITIONALLY. Entry now sets a projection SPEC (vertical-perspective) that no
           app state records, so `pv.proj!==HOST.proj` is false for a pilot who was already on the globe — and
           the map would have been left on the all-zoom globe for good, silently changing the normal view. */
        if(typeof HOST.proj!=='undefined'&&window.IntMapOS){ IntMapOS.exec(pv.proj==='flat'?'view.proj.flat':'view.proj.globe',{source:'flightsim'}); }
      } }catch(_){}
      prevView=null;
      if(prevCam){ try{ GE().camera.easeTo({center:prevCam.center,zoom:prevCam.zoom,bearing:prevCam.bearing,pitch:prevCam.pitch,roll:prevCam.roll||0,duration:800}); }catch(_){ try{ if(GE().camera.setRoll) GE().camera.setRoll(0); GE().camera.easeTo({center:prevCam.center,zoom:prevCam.zoom,bearing:prevCam.bearing,pitch:prevCam.pitch,duration:800}); }catch(__){} } } }
    /* trim for level flight at the current speed & altitude: solve the AoA that makes lift = weight, and the
       throttle that makes thrust = drag. This stops the aircraft climbing/sinking on its own at spawn, and the
       trimmed AoA becomes the stability target so the machine holds its trimmed speed (speed stability). */
    /* trim for level flight at the current speed & altitude: solve the AoA that makes lift = weight, the ELEVATOR
       that zeroes the pitch moment there (Cm0+Cma·α+Cmde·δe_trim=0), and the throttle for thrust=drag. Then set the
       body-frame velocity (AoA baked in) and the attitude quaternion so the machine spawns hands-off level. */
    /* (#R188) `gammaWant` (radians, + = climbing) asks for a trimmed flight path other than level. It
       is a REQUEST: the solve below clamps it to what this airframe can hold steadily and trims for
       whatever survives, so nothing here can produce an attitude the physics would immediately undo.
       Called with no argument — every path that existed before this round — the answer is byte-for-
       byte the level (or best-glide) trim it always was. */
    function computeTrim(gammaWant){ if(!st) return; const ac=AC(), rho=rhoAt(st.alt), Vt=Math.max(20,st.V||ac.Vcruise), qd=0.5*rho*Vt*Vt, D=ac.D;
      /* (#R97) TRUE equilibrium trim (Fx=Fz=M=0). Solve the AoA for lift=weight WITHOUT a positive-CL floor — a fast
         or lightly-loaded machine genuinely trims at a NEGATIVE AoA, and the old `Math.max(CL0+0.02,…)` clamp forced
         extra lift so it accelerated UP from spawn (e.g. P-51 at 2.5 km needed CL≈0.18 but was given 0.26 ≈1.45 g).
         The elevator trim now zeroes the pitch moment INCLUDING the propeller slipstream over the tail (qElev), the
         thrust-line moment (large on an underslung jet like the A320) and the flap moment — the old formula omitted
         all three. An engineless glider can't hold level, so it trims into its best steady GLIDE (path γ=−atan(CD/CL))
         instead of flying level and then sinking. */
      const flapCL=st.flaps*0.55;
      let CLn=ac.m*g0/Math.max(1,qd*ac.S); CLn=Math.min(CLn, ac.CL0+flapCL+ac.CLa*(ac.aStall-0.03));   /* cap just below the stall; NO positive floor */
      const aT=(CLn-ac.CL0-flapCL)/ac.CLa;                                                             /* trim AoA — may be negative */
      const CD=ac.CD0+ac.k*CLn*CLn+st.flaps*0.02+st.gear*0.022, Drag=qd*ac.S*CD;
      const densF=ac.prop?Math.max(0.30,rho/1.225):Math.pow(Math.max(0.18,rho/1.225),0.7);
      let gamma=0, Th=0;
      /* the envelope of STEADY flight paths at this speed and weight: at most the angle full thrust
         can sustain against drag, at least the angle the airframe glides at with no thrust. Both come
         from the polar already solved above — there is no new constant here. */
      const _glide=-Math.atan2(CD,Math.max(0.05,CLn));
      if(ac.Tmax>0){
        if(gammaWant!=null&&isFinite(gammaWant)){
          const Tmx=ac.Tmax*densF;
          const gMax=Math.asin(Math.max(-1,Math.min(1,(Tmx-Drag)/Math.max(1,ac.m*g0))));
          gamma=Math.max(Math.min(_glide,gMax),Math.min(gMax,gammaWant));
          st.thr=Math.max(0,Math.min(1,(Drag+ac.m*g0*Math.sin(gamma))/Math.max(1e-6,Tmx)));
          Th=st.thr*Tmx;
        } else { st.thr=Math.max(0.02,Math.min(1,Drag/(ac.Tmax*densF))); Th=st.thr*ac.Tmax*densF; }   /* powered: throttle for thrust=drag (level) */
      }
      else { st.thr=0; gamma=_glide; }                                        /* glider: steady glide-path angle */
      const qElev=qd+(ac.prop?Th/(2*ac.S):0), elevMax=(ac.elevMax||0.5), CmBase=D.Cm0+D.Cma*aT-0.09*st.flaps;
      st.elevTrim=-(CmBase*qd + (ac.thrZ||0)*Th/(ac.S*ac.c))/(ac.Cmde*elevMax*qElev);   /* stick-equivalent trim (real elevator angle = stick × elevMax) */
      const yaw=(st.psi!=null&&isFinite(st.psi))?st.psi:((GE().camera.getBearing?GE().camera.getBearing():90)*Math.PI/180);
      st.q=qFromEuler(0,aT+gamma,yaw); st.om=[0,0,0]; st.vb=[Vt*Math.cos(aT),0,Vt*Math.sin(aT)];
      st.V=Vt; st.aoa=aT; st.beta=0; st.gamma=gamma; st.vs=Vt*Math.sin(gamma); st.G=Math.cos(gamma); st.phi=0; st.theta=aT+gamma; st.psi=yaw; st._acc=0; }
    /* ══ (#R190) FLY THE ANGLE THE VIEW WAS SHOWING ═══════════════════════════════════════════════
       See the long note at start()'s computeTrim call. computeTrim has already solved the throttle,
       the elevator trim and the speed; this sets the ATTITUDE to the map's own tilt, so the aeroplane
       genuinely begins in that dive or that climb and flies itself out of it. Body-axis velocity is
       untouched (speed and angle of attack are the trim's), so rotating the nose rotates the flight
       path with it — which is exactly what pointing an aeroplane somewhere does.
       The only limit is the height the recovery needs: h = V²(1−cos γ)/(g(n−1)) for an n-g pull-out,
       so the steepest enterable dive is the one that fits under the aeroplane, with 200 m to spare.
       Returns the angle actually flown. */
    function _flyViewGamma(vg){ if(!st||vg==null||!isFinite(vg)) return null;
      const ac2=AC(), Vt=Math.max(20,st.V||ac2.Vcruise), CAP=85*Math.PI/180;
      const _gr=(st.lastTerr!=null&&isFinite(st.lastTerr))?st.lastTerr:0;
      const h=Math.max(0,(st.alt-_gr)-200);
      const n=Math.max(1.6,Math.min(4,ac2.gLim||3));
      const c=1-h*g0*(n-1)/Math.max(1,Vt*Vt);
      const gMin=(c<=-1)?-CAP:-Math.min(CAP,Math.acos(Math.max(-1,Math.min(1,c))));
      const gam=Math.max(gMin,Math.min(CAP,vg));
      const aT=st.aoa||0, yaw=st.psi;
      st.gamma=gam; st.theta=aT+gam; st.q=qFromEuler(0,aT+gam,yaw); st.om=[0,0,0];
      st.vb=[Vt*Math.cos(aT),0,Vt*Math.sin(aT)];
      st.vs=Vt*Math.sin(gam); st.G=Math.cos(gam); st._acc=0;
      st._flownGamma=gam; st._wantGamma=null;
      return gam; }
    function respawn(){ const ac=AC(); const tr=_terrRead(st.lng,st.lat); st.alt=(tr.ok?tr.v:(st.lastTerr!=null?st.lastTerr:0))+1500; if(!tr.ok) st._settleTerr=true;   /* (#R95) terrain-aware reset height (settles when the DEM confirms) */
      st.V=ac.Vcruise; st.elev=0; st.ail=0; st.rud=0; st.flaps=0; st.gear=0; st.brake=0; st.om=[0,0,0]; st.onGround=false; st.groundStart=false; st._tookOff=true; paused=false; st.fuel=(ac.fuelKg>0)?ac.fuelKg:null; computeTrim(); }   /* (#R120) R-reset also refuels */
    function crash(why){ if(resultShown) return; if(st&&why) st._crashWhy=why;   /* (#R117) keep the reason for the result screen */
      const w=hud&&hud.querySelector('.fs-warn'); if(w){ w.textContent=LL('CRASHED','墜落','ABGESTÜRZT','КРУШЕНИЕ','ACCIDENTE'); w.style.display='block'; w.style.color='#ff453a'; }
      showResult('crash');   /* (#R98) a crash ends the flight → result screen (was an auto-respawn in place); the R key still resets in-flight via respawn() */ }
    /* (#R101) shared readouts present in EVERY display (moving-map alt/hdg, EAS/Mach badge, the warning banner). */
    function _fsHdg(){ const _nh=qRot(st.q,[1,0,0]); return (Math.atan2(_nh[1],_nh[0])*180/Math.PI+360)%360; }
    /* (#R119) PAPI lights vs the 3° glide path to the nearest threshold of the spawn runway — approach only */
    function _updPapi(q){ const pp=q('.fs-papi'); if(!pp||!st) return; let show=false;
      if(st._rwy&&!st.onGround){ const cf=Math.cos(st.lat*Math.PI/180);
        let best=null; [st._rwy.A,st._rwy.B].forEach(E=>{ const dx=(E[0]-st.lng)*111320*cf, dy=(E[1]-st.lat)*111320; const dist=Math.hypot(dx,dy); if(!best||dist<best.dist) best={dx,dy,dist}; });
        if(best&&best.dist>250&&best.dist<15000){ const hd=_fsHdg()*Math.PI/180;
          const dot=Math.cos(hd)*(best.dy/best.dist)+Math.sin(hd)*(best.dx/best.dist);
          if(dot>0.45){ const thrE=(st._fieldElev!=null?st._fieldElev:(st._terrF!=null?st._terrF:0));
            const ang=Math.atan2(st.alt-thrE, best.dist)*180/Math.PI;
            const nW=ang>3.5?4:ang>3.15?3:ang>2.85?2:ang>2.5?1:0;
            pp.querySelectorAll('i').forEach((d2,i2)=>{ d2.style.background=(i2<nW)?'#ffffff':'#ff3b30'; d2.style.color=(i2<nW)?'#ffffff':'#ff3b30'; });
            show=true; } } }
      pp.style.display=show?'flex':'none'; }
    /* (#R120) ILS — localizer + glide-slope deviation vs the spawn runway (course = threshold→far-end axis,
       glide path = 3° to the nearest threshold). Full scale: LOC ±2.5°, GS ±0.7° (real Cat-I sensitivities).
       Shown only on approach: closing on the runway, 0.25–25 km out, airborne. The bars are FLY-TO needles:
       bar right = the course is to your right. */
    function _updIls(q){ const el=q('.fs-ils'); if(!el||!st) return; let show=false;
      if(st._rwy&&!st.onGround){ const cf=Math.cos(st.lat*Math.PI/180), R2D=180/Math.PI;
        const ends=[st._rwy.A,st._rwy.B]; let ti=0;
        { const d0=Math.hypot((ends[0][0]-st.lng)*cf,(ends[0][1]-st.lat)), d1=Math.hypot((ends[1][0]-st.lng)*cf,(ends[1][1]-st.lat)); ti=(d1<d0)?1:0; }
        const T=ends[ti], O=ends[1-ti];
        const dx=(T[0]-st.lng)*111320*cf, dy=(T[1]-st.lat)*111320, dist=Math.hypot(dx,dy);
        if(dist>250&&dist<25000){ const hd=_fsHdg()*Math.PI/180;
          const dot=Math.cos(hd)*(dy/dist)+Math.sin(hd)*(dx/dist);
          if(dot>0.3){
            const crs=Math.atan2((O[0]-T[0])*cf,(O[1]-T[1]))*R2D;          /* landing course over the threshold */
            const brg=Math.atan2(dx,dy)*R2D;                                /* bearing aircraft → threshold */
            let devL=((brg-crs+540)%360)-180;                               /* + = the course/centreline is to the right (fly right) */
            const thrE=(st._fieldElev!=null?st._fieldElev:(st._terrF!=null?st._terrF:0));
            const ang=Math.atan2(st.alt-thrE,dist)*R2D, devG=ang-3;         /* + = above the glide path */
            const loc=el.querySelector('.fs-ils-loc'); if(loc) loc.style.left=(50+Math.max(-1,Math.min(1,devL/2.5))*42)+'%';
            const gs=el.querySelector('.fs-ils-gs'); if(gs) gs.style.top=(50+Math.max(-1,Math.min(1,devG/0.7))*42)+'%';   /* above path → bar below centre = fly DOWN */
            const lb=el.querySelector('.fs-ils-lbl'); if(lb) lb.textContent='ILS '+(st._rwy.ident||st._rwy.id||'')+' '+(dist/1000).toFixed(1)+'km';
            show=true; } } }
      el.style.display=show?'flex':'none'; }
    /* (#R120) fuel chip for every display's aux line (percent of usable fuel; '' on the glider) */
    function _fuelText(){ try{ if(!st||st.fuel==null) return ''; const cap=AC().fuelKg||1, pct=Math.max(0,Math.min(100,st.fuel/cap*100));
      return ' · '+LL('FUEL','燃料','SPRIT','ТОПЛ','COMB')+' '+(pct>=9.5?Math.round(pct):pct.toFixed(1))+'%'; }catch(_){ return ''; } }
    /* (#R119) live-wind chip text shared by every display's aux line */
    function _windText(){ try{ const wv=st&&st._wNE; const wsp=wv?Math.hypot(wv[0],wv[1]):0; if(wsp<=0.6) return '';
      const wdir=(Math.atan2(-wv[1],-wv[0])*180/Math.PI+360)%360;
      return ' · '+LL('WIND','風','WIND','ВЕТЕР','VIENTO')+' '+Math.round(wsp*1.94384)+'kt@'+Math.round(wdir).toString().padStart(3,'0')+'°'; }catch(_){ return ''; } }
    function updateShared(agl,f){ if(!hud||!st) return; const q=s=>hud.querySelector(s);
      try{ const hdg=_fsHdg(), _hdS=Math.round(hdg).toString().padStart(3,'0');
        const _ma=q('.fs-mm-alt'); if(_ma) _ma.textContent=Math.round(st.alt).toLocaleString(); const _mh=q('.fs-mm-hdg'); if(_mh) _mh.textContent=_hdS;
        const mc=q('.fs-mach'); if(mc){ const ac=AC(), aSnd=340.3*Math.sqrt(Math.max(0.55,(288.15-0.0065*Math.min(11000,Math.max(0,st.alt)))/288.15)), mach=st.V/aSnd;
          mc.textContent='TAS '+Math.round(st.V*3.6)+' km/h'+((!ac.prop&&mach>0.4)?(' · M '+mach.toFixed(2)):'')+_windText()+_fuelText(); }   /* (#R117) EAS main / TAS+Mach aux; (#R119) + the live wind actually flowing through the physics; (#R120) + fuel */
        try{ _updPapi(q); }catch(_){}
        try{ _updIls(q); }catch(_){}   /* (#R120) ILS needles on the six-pack / glass too */
        const tf=q('.fs-thrfill'); if(tf) tf.style.height=Math.round(st.thr*100)+'%';   /* (#R117) throttle bar is shared chrome now — EVERY display (six-pack/glass/HUD) shows the power setting */
        const bf=q('.fs-boostfill'); if(bf) bf.style.height=(f.ab?100:0)+'%';
        const w=q('.fs-warn'); if(w&&w.textContent.indexOf('CRAS')<0&&w.textContent.indexOf('墜')<0){
          if(f.landed){ w.style.display='block'; w.style.color='#34c759'; w.textContent=LL('LANDED','着陸成功','GELANDET','ПОСАДКА','ATERRIZÓ'); }
          else if(f.overspeed){ w.style.display='block'; w.style.color='#ff453a'; w.textContent=LL('OVERSPEED','過速度','ÜBERGESCHWIND.','ПРЕВЫШЕНИЕ','SOBREVELOCIDAD'); }
          else if(f.fuelOut){ w.style.display='block'; w.style.color='#ff9f0a'; w.textContent=LL('FUEL OUT','燃料切れ','SPRIT LEER','ТОПЛИВО КОНЧИЛОСЬ','SIN COMBUSTIBLE'); }
          else if(f.stalling){ w.style.display='block'; w.style.color='#ff9f0a'; w.textContent=LL('STALL','失速','STRÖMUNGSABRISS','СВАЛИВАНИЕ','PÉRDIDA'); }
          else if(f.overG){ w.style.display='block'; w.style.color='#ff453a'; w.textContent=LL('G-LIMIT','G制限超過','G-GRENZE','ПЕРЕГРУЗКА','LÍMITE G'); }
          else w.style.display='none'; }
      }catch(_){} }
    /* (#R101) analog six-pack updater — every needle/card driven from the same state as the HUD. */
    function updateSixpack(agl,f){ if(!hud||!st) return; const R2D=180/Math.PI, q=s=>hud.querySelector(s), ac=AC();
      try{ const rollDeg=(st._camRoll!=null?st._camRoll:st.phi*R2D), pitchDeg=st.theta*R2D, vk=st.V*Math.sqrt(Math.max(0.05,rhoAt(st.alt)/1.225))*3.6, vne=(ac.Vne||100)*3.6, hdg=_fsHdg();   /* (#R117) ASI shows EAS (≈IAS), like the real instrument */
        const asi=q('.g6-asi'); if(asi) asi.setAttribute('transform','rotate('+(-135+Math.max(0,Math.min(1,vk/vne))*270).toFixed(1)+' 50 50)'); const asd=q('.g6-asi-d'); if(asd) asd.textContent=Math.round(vk);
        const air=q('.g6-ai-roll'); if(air) air.setAttribute('transform','rotate('+(-rollDeg).toFixed(1)+' 50 50)'); const aip=q('.g6-ai-pitch'); if(aip) aip.setAttribute('transform','translate(0 '+(Math.max(-40,Math.min(40,pitchDeg))*0.9).toFixed(1)+')'); const bp=q('.g6-ai-bp'); if(bp) bp.setAttribute('transform','rotate('+rollDeg.toFixed(1)+' 50 50)');
        const al=q('.g6-alt'); if(al) al.setAttribute('transform','rotate('+(((st.alt%1000)+1000)%1000/1000*360).toFixed(1)+' 50 50)'); const ald=q('.g6-alt-d'); if(ald) ald.textContent=Math.round(st.alt).toLocaleString();
        const tc=q('.g6-tc'); if(tc){ const _cph=Math.cos(st.phi),_sph=Math.sin(st.phi),_cth=Math.max(0.25,Math.cos(st.theta));
          const _trn=((st.om[1]*_sph+st.om[2]*_cph)/_cth)*R2D;   /* (#R117) REAL turn rate (Euler yaw rate, °/s) — a standard-rate 3°/s turn = the full mark; it used to just repeat the bank angle */
          tc.setAttribute('transform','rotate('+Math.max(-30,Math.min(30,_trn/3*22)).toFixed(1)+' 50 50)'); } const tb=q('.g6-tc-ball'); if(tb) tb.setAttribute('cx',(50+Math.max(-6,Math.min(6,(st.beta||0)*R2D*0.5))).toFixed(1));
        const hi=q('.g6-hi'); if(hi) hi.setAttribute('transform','rotate('+(-hdg).toFixed(1)+' 50 50)');
        const vs=q('.g6-vsi'); if(vs) vs.setAttribute('transform','rotate('+Math.max(-110,Math.min(110,(st.vs||0)*11)).toFixed(1)+' 50 50)');
      }catch(_){} }
    /* (#R101) glass PFD updater — tapes translate, the horizon rolls+pitches; the ND is the moving-map. */
    function updateGlass(agl,f){ if(!hud||!st) return; const R2D=180/Math.PI, q=s=>hud.querySelector(s);
      try{ const rollDeg=(st._camRoll!=null?st._camRoll:st.phi*R2D), pitchDeg=st.theta*R2D, vk=st.V*Math.sqrt(Math.max(0.05,rhoAt(st.alt)/1.225))*3.6, hdg=_fsHdg();   /* (#R117) speed tape shows EAS (≈IAS) */
        const roll=q('.pfd-roll'); if(roll) roll.setAttribute('transform','rotate('+(-rollDeg).toFixed(1)+' 150 150)'); const pit=q('.pfd-pitch'); if(pit) pit.setAttribute('transform','translate(0 '+(pitchDeg*4.6).toFixed(1)+')');
        const ss=q('.pfd-spd-strip'); if(ss) ss.style.transform='translateY('+(vk*0.7).toFixed(1)+'px)'; const sb=q('.pfd-spd-box'); if(sb) sb.textContent=Math.round(vk);
        const as=q('.pfd-alt-strip'); if(as) as.style.transform='translateY('+(st.alt*0.10).toFixed(1)+'px)'; const ab=q('.pfd-alt-box'); if(ab) ab.textContent=Math.round(st.alt).toLocaleString();
        const hs=q('.pfd-hdg-strip'), ht=q('.pfd-hdg'); if(hs&&ht){ const w2=ht.clientWidth||188; hs.style.transform='translateX('+(w2/2-hdg*2.4).toFixed(1)+'px)'; }
      }catch(_){} }
    function updateHUD(agl,f){ if(!hud) return; const disp=hud.dataset.disp||'hud';
      if(disp==='sixpack'){ updateShared(agl,f); updateSixpack(agl,f); return; }
      if(disp==='glass'){ updateShared(agl,f); updateGlass(agl,f); return; }
      const q=s=>hud.querySelector(s), R2D=180/Math.PI;
      try{ q('.fs-spd').textContent=Math.round(st.V*Math.sqrt(Math.max(0.05,rhoAt(st.alt)/1.225))*3.6); q('.fs-alt').textContent=Math.round(st.alt).toLocaleString(); q('.fs-agl').textContent=Math.round(Math.max(0,agl)).toLocaleString();   /* (#R117) main airspeed = EAS (≈IAS); TAS/Mach stay on the aux line */
        q('.fs-vs').textContent=(st.vs>=0?'+':'')+Math.round(st.vs);
        /* (#R95) heading from the NOSE vector, not qToEuler yaw — the Euler yaw jumps 180° as the pitch crosses the
           vertical (loop), which snapped the heading tape/indicator. The nose bearing reverses smoothly instead. */
        const _nh=qRot(st.q,[1,0,0]), hdg=(Math.atan2(_nh[1],_nh[0])*R2D+360)%360, _hdS=Math.round(hdg).toString().padStart(3,'0'); q('.fs-hdg').textContent=_hdS+'°';
        /* (#R100) drive the minimap heading/altitude from the SAME frame's snapshot as the main HUD (updateHUD runs after
           the throttled updateMinimap, so this always wins) — fixes the 5,943 vs 5,947 mismatch at the root, not by rounding. */
        { const _ma=q('.fs-mm-alt'); if(_ma) _ma.textContent=Math.round(st.alt).toLocaleString(); const _mh=q('.fs-mm-hdg'); if(_mh) _mh.textContent=_hdS; }
        q('.fs-thrfill').style.height=Math.round(st.thr*100)+'%';
        /* (#R96) attitude from the CAMERA's continuous bank (st._camRoll), NOT qToEuler roll — the Euler roll flips
           ±180° across the vertical, which spun the ADI / roll-pointer / ladder even when the outside view was fine.
           pitch (asin) has no flip. The pitch ladder now ROTATES with bank so its horizon stays parallel to the real one. */
        const rollDeg=(st._camRoll!=null?st._camRoll:st.phi*R2D), pitchDeg=st.theta*R2D;
        const hor=q('.fs-hor'); if(hor) hor.setAttribute('transform','rotate('+(-rollDeg).toFixed(1)+' 60 60) translate(0 '+(pitchDeg*1.4).toFixed(1)+')');
        const strip=q('.fs-htape-strip'), tape=q('.fs-htape'); if(strip&&tape){ const tw=tape.clientWidth||300; strip.style.transform='translateX('+(tw/2-(hdg+180)*2.4)+'px)'; }
        const lg=q('.fs-ladder-g'); if(lg) lg.setAttribute('transform','rotate('+(-rollDeg).toFixed(1)+' 500 500) translate(0 '+(pitchDeg*8).toFixed(1)+')');
        const rp=q('.fs-rollptr'); if(rp) rp.setAttribute('transform','rotate('+rollDeg.toFixed(1)+' 500 500)');
        const sky=q('.fs-sky'); if(sky) sky.style.opacity=Math.min(0.85,Math.max(0,(st.alt-3000)/11000)).toFixed(2);
        const bf=q('.fs-boostfill'); if(bf) bf.style.height=(f.ab?100:0)+'%';
        /* (#R97) IAS (what a pilot flies) is separated from the panel's TAS, and Mach uses the SAME altitude-dependent
           speed of sound as the physics (was a flat V/300 that disagreed with the aero). */
        const mc=q('.fs-mach'); if(mc){ const ac=AC(),
          aSnd=340.3*Math.sqrt(Math.max(0.55,(288.15-0.0065*Math.min(11000,Math.max(0,st.alt)))/288.15)), mach=st.V/aSnd;
          mc.textContent='TAS '+Math.round(st.V*3.6)+' km/h'+((!ac.prop&&mach>0.4)?(' · M '+mach.toFixed(2)):'')+_windText()+_fuelText(); }   /* (#R117) main displays are EAS; (#R119) + live wind; (#R120) + fuel */
        try{ _updPapi(q); }catch(_){}   /* (#R119) PAPI on the fighter HUD too */
        try{ _updIls(q); }catch(_){}   /* (#R120) ILS needles on the fighter HUD */
        const gEl=q('.fs-g'); if(gEl){ gEl.textContent=st.G.toFixed(1); gEl.parentNode.style.color=(st.G>7.5||st.G<-1.5)?'#ff453a':(st.G>5?'#ffd60a':''); }
        const aEl=q('.fs-aoa'); if(aEl){ aEl.textContent=Math.round(st.aoa*R2D); aEl.parentNode.style.color=f.stalling?'#ff9f0a':''; }
        const w=q('.fs-warn'); if(w&&w.textContent.indexOf('CRAS')<0&&w.textContent.indexOf('墜')<0){
          if(f.landed){ w.style.display='block'; w.style.color='#34c759'; w.textContent=LL('LANDED','着陸成功','GELANDET','ПОСАДКА','ATERRIZÓ'); }
          else if(f.overspeed){ w.style.display='block'; w.style.color='#ff453a'; w.textContent=LL('OVERSPEED','過速度','ÜBERGESCHWIND.','ПРЕВЫШЕНИЕ','SOBREVELOCIDAD'); }
          else if(f.fuelOut){ w.style.display='block'; w.style.color='#ff9f0a'; w.textContent=LL('FUEL OUT','燃料切れ','SPRIT LEER','ТОПЛИВО КОНЧИЛОСЬ','SIN COMBUSTIBLE'); }
          else if(f.stalling){ w.style.display='block'; w.style.color='#ff9f0a'; w.textContent=LL('STALL','失速','STRÖMUNGSABRISS','СВАЛИВАНИЕ','PÉRDIDA'); }
          else if(f.overG){ w.style.display='block'; w.style.color='#ff453a'; w.textContent=LL('G-LIMIT','G制限超過','G-GRENZE','ПЕРЕГРУЗКА','LÍMITE G'); }
          else w.style.display='none'; }
      }catch(_){} }
    /* terrain elevation that KNOWS whether the DEM is loaded yet (#R94q). Before the 3-D terrain tiles arrive,
       queryTerrainElevation returns null — the OLD code treated that as 0 m, causing false ground in the
       mountains (sudden height jumps / groundless crashes). Now: null → use the last KNOWN value and report
       ok:false so the collision check is skipped until real data is under the aircraft. */
    /* (#R122) LAYER STASH — on flight start, turn OFF every data layer / highlight / outline / map-object so the
       cockpit shows a clean world (place-name labels stay ON); restore the exact set on exit. Idempotent + guarded. */
    let _fsStash=null;
    /* (#R132) Atlas HIGHLIGHT / outline / choropleth overlay layers. `clearHl()`/`clearLineHl()`/`clearChoro()`/the
       place-highlight clear all live in OTHER closures (IntMapConsole / the place-hl IIFE) and are NOT reachable from
       here, so the old `typeof clearHl==='function'` guard was a permanent no-op and country/line/choropleth/place
       highlights stayed painted through the whole flight ("フライトシミュレーター中は、ハイライト等も非表示に"). `map` IS
       global, so instead of destroying them we HIDE the known overlay layer ids via the `visibility` layout property and
       restore each to its prior value on landing — so a highlight the user set before flying reappears afterwards. */
    const _FS_HL_LAYERS=['place-hl-fill','place-hl-line','place-hl-dot','nlq-fill','nlq-line','nlq-poly-fill','nlq-poly-line','nlq-choro','pl-outline-fill','pl-outline-line'];
    let _fsHlVis=null;
    function _fsHideHl(){ if(_fsHlVis) return; const saved={};
      _FS_HL_LAYERS.forEach(id=>{ try{ if(GE().layers.has(id)){ let v='visible'; try{ v=GE().layers.getLayout(id,'visibility')||'visible'; }catch(_){} saved[id]=v; GE().layers.setLayout(id,'visibility','none'); } }catch(_){} });
      _fsHlVis=saved; }
    function _fsShowHl(){ const s=_fsHlVis; _fsHlVis=null; if(!s) return;
      Object.keys(s).forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setLayout(id,'visibility', s[id]==='none'?'none':'visible'); }catch(_){} }); }
    function _fsStashLayers(){ if(_fsStash) return; const stash=[];
      try{ document.querySelectorAll('#layer-dropdown input[type=checkbox]').forEach(cb=>{ if(!cb.checked) return;
        const id=cb.id||'', dl=(cb.getAttribute&&cb.getAttribute('data-layer'))||'';
        if(id==='cb-names') return;   /* keep place-name labels */
        stash.push(id||('dl:'+dl));
        try{ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} }); }catch(_){}
      /* clear Atlas / place highlights, outlines and drawn objects (they're not checkboxes) */
      try{ window.IntMapOutline&&window.IntMapOutline.clear&&window.IntMapOutline.clear(); }catch(_){}
      try{ if(window._imHlPolys&&window._imHlPolys.clear) window._imHlPolys.clear(); }catch(_){}
      try{ if(typeof clearHl==='function') clearHl(); }catch(_){}
      try{ _fsHideHl(); }catch(_){}   /* (#R132) hide the highlight/choropleth/outline layers the closure-private clears can't reach */
      _fsStash=stash; }
    function _fsRestoreLayers(){ try{ _fsShowHl(); }catch(_){}   /* (#R132) un-hide the overlay layers first (data still intact) */
      const s=_fsStash; _fsStash=null; if(!s) return;
      try{ s.forEach(tok=>{ let cb=null; if(tok.indexOf('dl:')===0){ cb=document.querySelector('#layer-dropdown [data-layer="'+tok.slice(3)+'"]'); } else { cb=document.getElementById(tok); }
        if(cb&&!cb.checked){ try{ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} } }); }catch(_){} }
    function _terrRead(lng,lat){ let v=null; try{ if(GE().coords.terrainElevation){ const te=GE().coords.terrainElevation([lng,lat],{exaggerated:false}); if(te!=null&&isFinite(te)) v=te; } }catch(_){}
      if(v==null) return { v:(st&&st.lastTerr!=null)?st.lastTerr:0, ok:false };
      if(st) st.lastTerr=v; return { v, ok:true }; }
    /* (#R152) OCEAN detection for flight PHYSICS. window.countryGeo = LAND polygons, so a point INSIDE any
       country = land (Dead Sea / Death Valley / Netherlands polders stay flyable below 0 m), OUTSIDE = open ocean
       (floor the collision ground at the sea SURFACE, 0 m, so you can't dive to the bathymetric floor). Cached per
       ~0.25° cell + a per-feature bbox pre-filter so the 200-country point-in-polygon runs rarely — never stuttering
       the 200 Hz physics. Unknown (turf/countryGeo missing) → treated as LAND, so below-sea land is never wrongly clamped.
       (#R158) The blue water-FILL overlay this once fed was retired — this discriminator now serves the physics floor only. */
    let _fsOceanCache=Object.create(null), _fsBBox=null;
    function _fsBBoxes(){ if(_fsBBox) return _fsBBox; const cg=window.countryGeo; if(!cg||!cg.features||!window.turf) return null;
      try{ _fsBBox=cg.features.map(f=>{ try{ return turf.bbox(f); }catch(_){ return null; } }); }catch(_){ _fsBBox=null; } return _fsBBox; }
    function _isOpenOcean(lng,lat){ try{
      const cg=window.countryGeo; if(!cg||!cg.features||!window.turf||!turf.booleanPointInPolygon) return false;
      const key=Math.round(lng*4)+','+Math.round(lat*4); const c=_fsOceanCache[key]; if(c!==undefined) return c;
      const bb=_fsBBoxes(); const pt=turf.point([lng,lat]); let land=false;
      for(let i=0;i<cg.features.length;i++){ const b=bb&&bb[i]; if(b&&(lng<b[0]||lng>b[2]||lat<b[1]||lat>b[3])) continue;
        try{ if(turf.booleanPointInPolygon(pt,cg.features[i])){ land=true; break; } }catch(_){} }
      return (_fsOceanCache[key]=!land);
    }catch(_){ return false; } }
    /* (#R158) The blue water-FILL overlay (_fsOceanFC / _fsAddOcean / _fsRemoveOcean / _fsOceanStyleGuard, R152) was
       REMOVED per request. Over open sea the satellite imagery itself now renders (the R158 tile protocol upscales the
       nearest real Esri tile instead of the grey "no data" placeholder that first motivated the fill). */
    /* ===== (#R94q) ONE fixed-timestep 6-DOF rigid-body step (h seconds) in the BODY frame. Body velocity (u,v,w),
       body angular rates (p,q,r) and a quaternion attitude are integrated from the forces & moments produced by
       AoA + SIDESLIP through the aircraft's stability & control derivatives — so it gives coordinated & skidding
       turns, adverse yaw, dihedral, roll/pitch/yaw damping, Euler cross-coupling and prop gyroscopics, and it can
       roll continuously / loop / fly inverted (quaternion = no gimbal clamp). ===== */
    function stepFixed(h, ac){ const D=ac.D;
      let u=st.vb[0], v=st.vb[1], w=st.vb[2];
      /* (#R119) LIVE WIND → the aerodynamics run on AIR-relative velocity (u−wind), so a real head/cross/tail
         wind changes the take-off run, drift, approach speed over ground and touchdown — while the position
         integration keeps using GROUND velocity. Wind = Open-Meteo winds aloft interpolated by AGL (see start()),
         faded in the lowest 60 m (boundary layer) but never below 25% so a runway crosswind still exists. */
      let wN=0,wE=0;
      if(st._wind&&st._wind.length){ const tb=st._wind, aglW=Math.max(0,st.alt-((st._terrF!=null)?st._terrF:(st.lastTerr||0)));
        const vecOf=e=>[-e.sp*Math.sin(e.di*Math.PI/180), -e.sp*Math.cos(e.di*Math.PI/180)];   /* met "from" → [E,N] flow vector */
        let vE,vN;
        if(aglW<=tb[0].alt){ const v0=vecOf(tb[0]); vE=v0[0]; vN=v0[1]; }
        else if(aglW>=tb[tb.length-1].alt){ const v1=vecOf(tb[tb.length-1]); vE=v1[0]; vN=v1[1]; }
        else{ let a2=tb[0],b2=tb[tb.length-1]; for(let i2=0;i2<tb.length-1;i2++){ if(aglW>=tb[i2].alt&&aglW<=tb[i2+1].alt){ a2=tb[i2]; b2=tb[i2+1]; break; } }
          const f=(b2.alt===a2.alt)?0:(aglW-a2.alt)/(b2.alt-a2.alt); const vA=vecOf(a2), vB=vecOf(b2);
          vE=vA[0]+(vB[0]-vA[0])*f; vN=vA[1]+(vB[1]-vA[1])*f; }
        const bl=Math.max(0.25,Math.min(1,aglW/60));
        wE=vE*bl; wN=vN*bl; }
      st._wNE=[wN,wE];
      const wbv=(wN||wE)?qRotInv(st.q,[wN,wE,0]):[0,0,0];
      const ua=u-wbv[0], va=v-wbv[1], wa=w-wbv[2];
      const V=Math.hypot(ua,va,wa), Vs=Math.max(V,1e-3), rho=rhoAt(st.alt), qd=0.5*rho*V*V;
      const aoa=Math.atan2(wa,ua), beta=Math.asin(Math.max(-1,Math.min(1,va/Vs)));
      /* ===== (#R96) aerodynamics valid through the FULL AoA range. BELOW the stall it is the EXACT linear model
         (attached flight — trim / cruise / rolls / landing — is bit-for-bit unchanged); past the stall it blends
         (smoothstep) into a flat-plate model so CL rolls off CONTINUOUSLY on BOTH sides of zero (fixes the negative-
         AoA lift JUMP), and drag climbs toward a broadside CDmax so a deep stall / tailslide / vertical really bleeds
         speed. sm∈[0,1] = separation fraction (0 attached … 1 fully stalled). ===== */
      /* (#R97) critical AoA is ASYMMETRIC: the negative-side stall (aStallN) is a smaller magnitude than the positive
         one because of camber/CL0, and flaps (flapCL) shift BOTH. Separation now starts at the correct angle for the
         sign of AoA, so the aero roll-off and the STALL flag agree (they used a symmetric ±aStall before). */
      const flapCL=st.flaps*0.55, aStall=ac.aStall+st.flaps*0.05, aStallN=(ac.aStallNeg!=null?ac.aStallNeg:-0.24)+st.flaps*0.05;   /* (#R100) per-aircraft negative stall angle; flaps shift it up (less negative) — no more −0.9° full-flap "stall" */
      const stallAng=(aoa>=0?aStall:Math.abs(aStallN)), sep=Math.max(0,Math.min(1,(Math.abs(aoa)-stallAng)/0.22)), sm=sep*sep*(3-2*sep);
      const CLatt=ac.CL0+flapCL+ac.CLa*aoa, CDmax=ac.CDmax||1.8;
      const CL=(1-sm)*CLatt + sm*(CDmax*Math.sin(aoa)*Math.cos(aoa));                         /* attached ⊕ flat-plate (symmetric ⇒ no −AoA jump) */
      let CD=(1-sm)*(ac.CD0+ac.k*CLatt*CLatt) + sm*(0.02+(CDmax-0.02)*Math.sin(aoa)*Math.sin(aoa)) + st.flaps*0.02+st.gear*0.022+st.brake*0.055;
      /* (#R96) transonic wave drag on the jets (they used low-speed aero at Mach 1.7); heavy buffet drag past Vne */
      const aSnd=340.3*Math.sqrt(Math.max(0.55,(288.15-0.0065*Math.min(11000,Math.max(0,st.alt)))/288.15)), mach=V/aSnd;
      if(!ac.prop && mach>0.78){ const ms=Math.min(1,(mach-0.78)/0.28);   /* transonic drag rise, peak ~M1.06 … */
        CD += (mach<=1.06 ? 0.040*ms : 0.040*Math.max(0.34,1-(mach-1.06)*0.5)); }   /* … then supersonic wave-drag relief so a fighter reaches ~M1.6, not stalls out at M1 */
      if(V>ac.Vne) CD+=0.05*Math.min(4,(V/ac.Vne-1)*9);
      const L=CL*qd*ac.S, Dg=CD*qd*ac.S, Yf=D.Cyb*beta*qd*ac.S;
      /* forces in body frame: drag ∥ −velocity, lift ⟂ velocity in the x-z plane, side force ∥ y, thrust ∥ x,
         gravity rotated world→body via the attitude quaternion */
      const ux=ua/Vs, uy=va/Vs, uz=wa/Vs, lpx=wa, lpz=-ua, lpn=Math.hypot(lpx,lpz)||1;   /* (#R119) aero axes follow the AIR flow, not the ground track */
      const Flx=L*lpx/lpn, Flz=L*lpz/lpn, Fdx=-Dg*ux, Fdy=-Dg*uy, Fdz=-Dg*uz;
      let densF=ac.prop?Math.max(0.30,rho/1.225):Math.pow(Math.max(0.18,rho/1.225),0.7);
      if(st.alt>ac.ceil) densF*=Math.max(0,1-(st.alt-ac.ceil)/2500);              /* (#R96) service ceiling now bites (thrust fades above it) */
      let Th=(st._ab?(ac.abMax||ac.Tmax*1.6):ac.Tmax)*st.thr*densF;
      /* (#R120) FUEL BURN — props ∝ power setting, jets ∝ actual thrust (TSFC, wet rate under afterburner).
         Tanks dry → flame-out: thrust 0, AB off (the airframe becomes a glider; all other aero unchanged). */
      if(st.fuel!=null){
        if(st.fuel>0){ const burn=ac.prop?(st.thr*(ac.burnMax||0)):(Th*(st._ab?(ac.sfcAB||5.8e-5):(ac.sfc||1.6e-5)));
          st.fuel=Math.max(0,st.fuel-burn*h); }
        if(st.fuel<=0){ Th=0; st._ab=false; } }
      const gb=qRotInv(st.q,[0,0,ac.m*g0]);
      const Fx=Fdx+Flx+Th+gb[0], Fy=Fdy+Yf+gb[1], Fz=Fdz+Flz+gb[2];
      /* ===== moments (body). (#R96): the real elevator angle = stick × elevMax (rad) — the raw stick used to be fed
         straight into Cmde (1.0 = a 57° elevator!) which made pitch absurdly sensitive; FBW jets command G and fade
         the elevator near the structural limit; the elevator/stability lose authority past the stall; the propeller
         slipstream feeds the tail so the elevator still works at low speed / on the take-off roll; flaps and an
         offset thrust line add pitch moments. ===== */
      const p=st.om[0], qq=st.om[1], r=st.om[2], b=ac.b, c=ac.c, S=ac.S;
      const phat=p*b/(2*Vs), qhat=qq*c/(2*Vs), rhat=r*b/(2*Vs);
      const gLimN=(ac.gLimN!=null?ac.gLimN:-0.4*ac.gLim);
      let de0=st.elev+(st.elevTrim||0);       /* stick + trim — trims & responds for EVERY aircraft (keeps level flight) */
      if(ac.fbw){
        /* (#R96) FBW G/AoA PROTECTION layered on the trimmed elevator: fade the command as the AoA (predicted 0.3 s
           ahead from the pitch rate, so it ANTICIPATES rather than overshoots) nears the AoA that would hit the +/−
           g-limit (or the stall, whichever comes first). This enforces gLim (was warning-only) and takes the twitch
           out of high-speed pitch — at high q̄ the limiting AoA is tiny so the stick is heavily geared down. */
        const q2=Math.max(1,qd*ac.S), aoaLimP=Math.min(ac.aStall*0.9,(ac.gLim*ac.m*g0/q2-ac.CL0)/ac.CLa),
              aoaLimN=Math.max(aStallN*0.9,(gLimN*ac.m*g0/q2-ac.CL0)/ac.CLa), band=ac.aStall*0.24;   /* (#R117) the NEGATIVE-side AoA floor is the aircraft's aStallNeg (−0.21…−0.35), not −aStall — the old symmetric clamp let a push-over ride past the real negative stall */
        /* lead only on the pitch rate IN EXCESS of what a steady level turn at the current load factor needs
           (qSteady=(g/V)(n−1/n)) — so a SUSTAINED turn reaches the full g-limit (no steady under-shoot) while a rapid
           pull-up is still anticipated (no transient overshoot past the limit). */
        const qSteady=(g0/Vs)*(st.G-1/Math.max(1,Math.abs(st.G))), aoaPred=aoa+(qq-qSteady)*0.30;
        if(de0<0) de0*=Math.max(0,Math.min(1,(aoaLimP-aoaPred)/band));           /* pulling → limit +G / stall */
        else if(de0>0) de0*=Math.max(0,Math.min(1,(aoaPred-aoaLimN)/band));       /* pushing → limit −G */
        de0+=(ac.fbwQd!=null?ac.fbwQd:1.1)*(qq-qSteady);   /* (#R117) FBW pitch-rate damper (SAS): opposes rate IN EXCESS of the steady-turn rate — kills the F-35/F-16 short-period altitude oscillation without fighting a sustained pull */
      }
      const deElev=(ac.elevMax||0.5)*de0*(1-0.6*sm);       /* real elevator angle, faded when the tail is stalled */
      const qElev=qd+(ac.prop?Th/(2*ac.S):0);                                    /* + propeller slipstream dynamic pressure over the tail */
      const Cl=D.Clb*beta+D.Clp*phat+D.Clr*rhat+ac.Clda*st.ail*(1-0.5*sm);
      const CmBase=((1-sm)*(D.Cm0+D.Cma*aoa)+sm*(-0.22*Math.sin(2*aoa)))+D.Cmq*qhat-0.09*st.flaps;   /* post-stall nose-down (AC shift) + flap pitch */
      const Cn=D.Cnb*beta+D.Cnr*rhat+ac.Cndr*st.rud*(1-0.5*sm)+D.Cnda*st.ail;
      let Lm=Cl*qd*S*b, Mm=(CmBase*qd+ac.Cmde*deElev*qElev)*S*c, Nm=Cn*qd*S*b;
      if(ac.thrZ) Mm+=Th*ac.thrZ;                                                /* thrust-line pitch moment (power → trim change) */
      if(ac.Hp){ Mm+=-r*ac.Hp; Nm+=qq*ac.Hp; }                                   /* prop gyroscopic precession */
      if(ac.propTq){ Lm+=-ac.propTq*Th*0.008; Nm+=ac.propTq*Th*0.02*Math.max(0,aoa); }   /* engine torque roll + P-factor yaw */
      /* angular acceleration = I⁻¹·(M − ω×Iω) with a diagonal inertia tensor */
      st.om=[ p+((Lm+(ac.Iy-ac.Iz)*qq*r)/ac.Ix)*h, qq+((Mm+(ac.Iz-ac.Ix)*r*p)/ac.Iy)*h, r+((Nm+(ac.Ix-ac.Iy)*p*qq)/ac.Iz)*h ];
      { const oM=ac.omMax||8; st.om=st.om.map(x=>Math.max(-oM,Math.min(oM,x))); }   /* (#R96) per-aircraft body-rate cap (was a flat ±14≈800°/s for a jumbo and a fighter alike) */
      /* translational dynamics in the rotating body frame (a = F/m − ω×v) — (#R95). Two fixes for the exact faults
         the report flags under bug ⑨ ("人工的な横滑りやエネルギー増減が高角速度時に出る"):
          • the OLD code fed the just-updated u into the v equation and u,v into w (sequential Gauss–Seidel) → the
            roll was left/right asymmetric;
          • the −ω×v frame-rotation term does NO physical work, but written as an explicit-Euler cross product it
            inflates |v| (≈√(1+(ωh)²)) every step, so a SUSTAINED high-rate manoeuvre (a held loop) pumped speed and
            energy without bound (a gentle climb ran away to Mach 15).
         So: rotate the OLD velocity by the true incremental body rotation — norm-preserving, zero spurious energy —
         then add only the physical acceleration F/m·h. This reduces to the classic −(ω×v)h at low rates (level flight
         and gentle manoeuvres unchanged) and stays exactly left/right symmetric. */
      const u0=u,v0=v,w0=w, wmag=Math.hypot(p,qq,r);
      let vr; if(wmag>1e-6){ const ang=wmag*h, sh=Math.sin(ang/2)/wmag, dq=[Math.cos(ang/2),p*sh,qq*sh,r*sh]; vr=qRotInv(dq,[u0,v0,w0]); } else vr=[u0,v0,w0];
      u=vr[0]+(Fx/ac.m)*h; v=vr[1]+(Fy/ac.m)*h; w=vr[2]+(Fz/ac.m)*h;
      st.vb=[u,v,w];
      /* attitude: q̇ = ½ q⊗(0,ω) */
      const o=st.om; st.q=qNorm([ st.q[0]+(-0.5*(st.q[1]*o[0]+st.q[2]*o[1]+st.q[3]*o[2]))*h, st.q[1]+(0.5*(st.q[0]*o[0]+st.q[2]*o[2]-st.q[3]*o[1]))*h, st.q[2]+(0.5*(st.q[0]*o[1]-st.q[1]*o[2]+st.q[3]*o[0]))*h, st.q[3]+(0.5*(st.q[0]*o[2]+st.q[1]*o[1]-st.q[2]*o[0]))*h ]);
      /* position (world NED): rotate body velocity to world, integrate lat/lng/alt */
      const vw=qRot(st.q,[u,v,w]);
      st.alt+=-vw[2]*h; const mLat=111320, mLon=(111320*Math.cos(st.lat*Math.PI/180))||1;
      st.lat+=vw[0]*h/mLat; st.lng+=vw[1]*h/mLon;
      st.lat=Math.max(-85,Math.min(85,st.lat)); if(st.lng>180)st.lng-=360; else if(st.lng<-180)st.lng+=360;
      /* derive Euler angles + flight-path for the HUD/camera */
      const eul=qToEuler(st.q); st.phi=eul.roll; st.theta=eul.pitch; st.psi=(eul.yaw%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
      st.V=V; st.aoa=aoa; st.beta=beta; st.p=st.om[0]; st.vs=-vw[2]; st.gamma=Math.asin(Math.max(-1,Math.min(1,(-vw[2])/Vs)));
      st.G=-(Flz+Fdz)/(ac.m*g0);   /* normal load factor from the aero body-z force (signed: negative when pushing over) */
      /* (#R96) STRUCTURAL FAILURE: a load sustained beyond 1.5× the limit (the design ultimate factor) snaps the
         airframe. FBW aircraft are G-limited on the elevator above and never reach it; the rest CAN over-stress. */
      if(!st.onGround && (st.G>ac.gLim*1.5 || st.G<gLimN*1.5) && V>ac.Vstall){ st._ovg=(st._ovg||0)+h; if(st._ovg>0.30){   /* (#R117) 0.30 s sustained — keyboard input slams to full deflection in ~0.5 s, so a firm but momentary push no longer snaps the airframe; a held one still does */ st._ovg=0; crash(LL('airframe failed — sustained '+st.G.toFixed(1)+' g beyond the structural limit','空中分解 — 構造限界を超える '+st.G.toFixed(1)+' G を維持','Strukturversagen bei '+st.G.toFixed(1)+' g','разрушение планера при '+st.G.toFixed(1)+' g','fallo estructural a '+st.G.toFixed(1)+' g')); return { agl:9999, stalling:false, overspeed:false, overG:true, landed:false, ab:st._ab }; } } else st._ovg=0;   /* (#R97) use the asymmetric ±g structural limits (negative side snaps sooner) */
      /* terrain contact — only when the DEM is really loaded under us */
      const tr=_terrRead(st.lng,st.lat); let terr=tr.v;
      /* (#R117) DEM tiles REFINE while flying (coarse z8 → fine z13 under the moving camera): queryTerrainElevation
         can step several metres in ONE frame at an unchanged position. On/near the runway that either buried the
         wheels or dropped the ground from under the aircraft — a 10 m free-fall reads descent>7 → the reported
         "100% crash" on take-off & landing (headless tests never reproduced it because a hidden tab never refines
         its tiles). The PHYSICS ground is therefore a rate-limited follower of the DEM: it converges within seconds
         but can never STEP, so tile refinements become gentle slopes. The allowed rate scales with speed (real
         ridges approached fast) and is more generous upward (collision safety). */
      if(tr.ok){ if(st._terrF==null) st._terrF=terr;
        const _up=h*(4+0.9*V), _dn=h*(2.5+0.35*V), _dT=terr-st._terrF;
        st._terrF+=(_dT>0?Math.min(_dT,_up):Math.max(_dT,-_dn));
        terr=st._terrF; }
      else if(st._terrF!=null) terr=st._terrF;
      /* (#R118) AIRPORT ANCHOR — within 4 km of the spawn airport the physics ground never sinks below the
         surveyed field elevation −3 m: coastal DEM tiles (Haneda) carry BATHYMETRY (−13 m "runway"), which
         buried the aircraft under the sea surface during the take-off roll / landing. Runways are flat and
         surveyed; trust the airport datum near the field. */
      if(st._fieldElev!=null&&st._fLL){ const _cf=Math.cos(st.lat*Math.PI/180);
        const _dx=(st.lng-st._fLL[0])*111.32*_cf, _dy=(st.lat-st._fLL[1])*111.32;
        if((_dx*_dx+_dy*_dy)<16 && terr<st._fieldElev-3){ terr=st._fieldElev-3; if(st._terrF!=null&&st._terrF<terr) st._terrF=terr; } }   /* clamp the follower too — no phantom sunken ground waiting just outside the 4 km ring */
      /* (#R152) OPEN-OCEAN floor — over the sea the physics ground is the SURFACE (0 m), so you crash at sea level and
         can't fly down to the bathymetric floor; below-sea-level LAND (inside a country polygon → st._overOcean false)
         keeps its real negative elevation and stays flyable. st._overOcean is refreshed once per frame in loop(). */
      if(st._overOcean && terr<0){ terr=0; if(st._terrF!=null&&st._terrF<0) st._terrF=0; }
      /* (#R95) ONE-TIME SPAWN SETTLE: at start/respawn the 3-D DEM has not loaded yet (queryTerrainElevation → null),
         so we cannot know the ground height. Rather than reading 0 m (which spawns inside Himalaya-class terrain and
         "crashes on load"), we wait: the FIRST confirmed ground read lifts the aircraft to a safe clearance if it is
         low, re-trims level, and skips the collision test for that frame. */
      if(st._settleTerr){ const _plaus=tr.ok&&(st._fieldElev==null||!st.groundStart||Math.abs(tr.v-st._fieldElev)<150);   /* (#R117) reject implausible half-loaded DEM reads vs the known field elevation */
        if(_plaus){ st._settleTerr=false; st._terrF=tr.v; terr=tr.v;   /* (#R117) seed the rate-limited ground at the first confirmed read */
          if(st.groundStart){ st.alt=terr+1.2; st.groundStart=false; st.onGround=true; st.vb=[st.vb[0]||0,0,0]; st.om=[0,0,0]; }   /* (#R97) settle a ground start ONTO the runway (not +1500) */
          else if(st.alt<terr+_clrMin()){ st.alt=terr+_clrLift(); try{ computeTrim(); }catch(_){} } }   /* (#R175) …ground +30 m when the caller supplied the altitude (keepAlt) */
        else if(st.groundStart){
          /* (#R118) SETTLE TIMEOUT — at LOWI the DEM read a flat 0 m forever (rejected by the ±150 m gate), so the
             aircraft stayed "parked" while the throttle silently accelerated it down the runway with NO way to
             rotate ("離陸できない"). The airport's surveyed elevation IS known — after 4 s of no plausible DEM,
             adopt it as the ground and fly; the rate-limited follower blends in the real DEM when it arrives. */
          st._settleT=(st._settleT||0)+h;
          if(st._fieldElev!=null && st._settleT>4){ st._settleTerr=false; st._terrF=st._fieldElev; terr=st._fieldElev; st.alt=terr+1.2; st.onGround=true; st.groundStart=false; }
          else { st.alt=(st._groundAlt!=null?st._groundAlt:st.alt); st.vb=[0,0,0]; st.om=[0,0,0]; } }   /* park FULLY (no phantom 40 m/s roll while waiting) */
        return { agl:st.alt-terr, stalling:false, overspeed:false, overG:false, landed:false, ab:st._ab }; }
      /* (#R98) DERIVE the reference stall speed from weight + configuration + CLmax each step (Vstall = √(2mg / ρ·S·CLmax))
         instead of a hardcoded per-aircraft number that disagreed with the aero (F-35/F-16/A320 were off by 10–30%).
         CLmaxCfg includes the flap CL & the flap stall-angle shift; ρ is the local density (higher TAS stall up high). */
      const CLmaxCfg=ac.CL0+flapCL+ac.CLa*aStall, VstallEff=Math.sqrt(2*ac.m*g0/(Math.max(0.02,rho)*ac.S*Math.max(0.3,CLmaxCfg)));
      const agl=st.alt-terr, gearDown=st.gear>0.5, gearH=1.2; let landed=false;
      if(agl>6) st._tookOff=true;   /* (#R97) airborne since spawn — only then does a later touchdown count as a LANDING (a fresh ground start isn't "LANDED") */
      if(tr.ok && agl<=gearH+0.3){ const descent=-st.vs, bankDeg=Math.abs(st.phi*180/Math.PI), pitchAbs=Math.abs(st.theta);
        /* (#R95) gear-up touchdown is a belly landing → crash (it used to count as LANDED at low speed). */
        /* (#R100) touchdown fails on: >7 m/s sink · >25° bank · >0.6 rad nose attitude · gear up · OR too fast for the
           tyres/gear — judged against the stall/Vref (≈1.7·Vstall, i.e. well above the ~1.3·Vstall Vref) AND an absolute
           tyre-speed limit (~110 m/s), NOT 0.72·Vne (which let the F-35 "land" at ~425 m/s). */
        let _why=null;   /* (#R117) record WHY a touchdown failed — shown on the result screen (was an unexplained "CRASHED") */
        /* (#R117) judge ONLY the TOUCHDOWN INSTANT (airborne → ground). These checks used to run EVERY step while
           rolling on the runway, so the moment the take-off roll crossed 1.7·Vstall (which an F-35/F-16/A320 MUST,
           and a delayed rotation in anything else) the sim declared "touched down too fast" → the reported 100%
           crash on take-off. Rolling fast on the wheels is not a crash. */
        if(!st.onGround){
        if(descent>7) _why=LL('sink rate '+descent.toFixed(1)+' m/s at touchdown (max 7)','接地時の降下率 '+descent.toFixed(1)+' m/s（限界 7）','Sinkrate '+descent.toFixed(1)+' m/s (max. 7)','снижение '+descent.toFixed(1)+' м/с (макс. 7)','descenso '+descent.toFixed(1)+' m/s (máx. 7)');
        else if(bankDeg>25) _why=LL('touched down banked '+Math.round(bankDeg)+'° (max 25°)','バンク '+Math.round(bankDeg)+'° で接地（限界 25°）','Querlage '+Math.round(bankDeg)+'° (max. 25°)','крен '+Math.round(bankDeg)+'° (макс. 25°)','alabeo '+Math.round(bankDeg)+'° (máx. 25°)');
        else if(pitchAbs>0.6) _why=LL('extreme nose attitude at touchdown','接地時の機首姿勢が過大','extreme Nicklage beim Aufsetzen','экстремальный тангаж при касании','actitud de morro extrema al tocar');
        else if(!gearDown) _why=LL('gear-up belly landing','脚上げのまま胴体着陸','Bauchlandung — Fahrwerk eingefahren','посадка на фюзеляж — шасси убрано','aterrizaje de panza — tren arriba');
        else if(st._tookOff&&(st.V>VstallEff*1.7||Math.hypot(st.vb[0],st.vb[1],st.vb[2])>110)) _why=LL('touched down too fast ('+Math.round(st.V*3.6)+' km/h)','接地速度が速すぎ（'+Math.round(st.V*3.6)+' km/h）','zu schnell aufgesetzt ('+Math.round(st.V*3.6)+' km/h)','касание на слишком большой скорости ('+Math.round(st.V*3.6)+' км/ч)','contacto demasiado rápido ('+Math.round(st.V*3.6)+' km/h)');   /* (#R117) speed test only for a real LANDING (after being airborne) — a brief wheel-hop during a fast take-off roll is not a "touchdown" */
        }
        if(_why) crash(_why);
        else { if(!st.onGround&&st._tookOff) st._td={vs:descent,bank:bankDeg,V:st.V};   /* (#R117) touchdown stats for the result screen */
          st.onGround=true;
          const vw2=qRot(st.q,st.vb);
          if(vw2[2]>0) vw2[2]=0;                          /* wheels stop the sink … */
          else if(st.V<VstallEff*1.05) vw2[2]=0;           /* … and hold it planted below flying speed (kills the ground bounce; lift can still fly it off once fast) */
          /* (#R96) ground geometry: the aircraft rotates about its MAIN GEAR — the nose-wheel stops it pitching below
             ~0°, the tail scrapes past tailAng (tail-strike), and a wing can't dig in. Rebuild the attitude from the
             constrained Euler angles (no looping on the ground) and re-express the velocity in the new body frame. */
          const geo=qToEuler(st.q), tA=ac.tailAng||0.22;
          const gth=Math.max(-0.035,Math.min(tA,geo.pitch)), gph=Math.max(-0.14,Math.min(0.14,geo.roll));
          if(geo.pitch>=tA && st.om[1]>0) st.om[1]=0;        /* tail-strike: no further nose-up rotation */
          if(geo.pitch<=-0.035 && st.om[1]<0) st.om[1]=0;    /* nose-wheel: no further nose-down rotation */
          st.q=qFromEuler(gph,gth,geo.yaw);
          st.vb=qRotInv(st.q,vw2);
          if(st.alt<terr+gearH) st.alt=terr+gearH;          /* never below the wheels — but no per-step hard teleport when already sitting on them (hysteresis) */
          else if(st.V<VstallEff*1.05 && st.alt>terr+gearH) st.alt=terr+gearH;   /* (#R117) below flying speed the wheels FOLLOW a (rate-limited) sinking ground instead of being left in mid-air by a tile refinement */
          const sp=Math.hypot(st.vb[0],st.vb[1],st.vb[2]), fr=1.3+(st.brake>0.5?9:0)+(keys['s']?4:0);
          if(sp>1e-3){ const nf=Math.max(0,sp-fr*h)/sp; st.vb=[st.vb[0]*nf,st.vb[1]*nf,st.vb[2]*nf]; }
          st.om=[st.om[0]*Math.pow(0.03,h), st.om[1], st.om[2]*Math.pow(0.2,h)];   /* wheels damp roll & yaw */
          if(st._tookOff && Math.hypot(st.vb[0],st.vb[1],st.vb[2])<Math.max(15,VstallEff*0.55) && bankDeg<10 && descent<3) landed=true; }   /* (#R99) require a real roll-out to a slow taxi speed; (#R119) judged on GROUND speed (a strong headwind holds airspeed up while the wheels have stopped) */
      } else st.onGround=false;
      /* (#R97) STALL = critical-AoA exceeded (FAA: an aerofoil stalls at its critical AoA regardless of speed/attitude),
         on BOTH sides of the CL curve. The old extra `V<Vstall` term flagged a false stall whenever the plane was slow
         even at a safe AoA (e.g. the light, low-AoA float over the top of a zoom climb); Vstall stays only as the
         landing/reference speed (VstallEff). overG now uses the asymmetric ±g limits. */
      const stalling=((aoa>aStall*0.97)||(aoa<aStallN*0.97)) && !(st.onGround&&st.V<Math.max(12,VstallEff*0.8)), overspeed=st.V>ac.Vne, overG=(st.G>ac.gLim||st.G<gLimN);   /* (#R117) no false STALL banner while taxiing (AoA=atan2(w,u) is meaningless at walking pace on the wheels) */
      return { agl, stalling, overspeed, overG, landed, ab:st._ab, fuelOut:(st.fuel!=null&&st.fuel<=0) }; }   /* (#R120) */
    /* per-frame: read the controls once, then advance the physics in FIXED sub-steps so the flight characteristics
       don't change with framerate (30 vs 120 fps) and a hitch never hands one huge dt to the integrator. Split out
       of loop() so it's deterministically steppable headlessly (IntMapFlightSim._dbg.step). */
    function physics(dt){ const ac=AC();
      try{ _gpPoll(dt); }catch(_){}   /* (#R120) gamepad — poll-based API, read once per frame */
      if(keys['w']) st.thr=Math.min(1,st.thr+0.5*dt); if(keys['s']) st.thr=Math.max(0,st.thr-0.5*dt);
      st.brake=(keys[' ']||st._gpBrk)?1:0; st._ab=ac.ab&&(!!keys['shift']||!!st._gpAB)&&st.thr>0.95;
      const cmd=(lo,hi)=>((keys[lo]?-1:0)+(keys[hi]?1:0)), sweep=(cur,to,r)=>cur+Math.max(-r*dt,Math.min(r*dt,to-cur));
      /* (#R94s) INVERTED pitch control (per request): ↑ = nose DOWN, ↓ = nose UP — cmd('arrowdown','arrowup')
         gives arrowup=+1 which, with −Cmde, pitches DOWN. Rudder: D → yaw RIGHT. */
      const _pT=(st._tP!=null?st._tP:(st._gpP!=null?st._gpP:cmd('arrowdown','arrowup'))), _rT=(st._tR!=null?st._tR:(st._gpR!=null?st._gpR:cmd('arrowleft','arrowright')));   /* (#R117) analog touch-stick targets override the digital keys when active; (#R120) then the gamepad stick */
      st.elev=sweep(st.elev,_pT,ac.ctlRate||3.0); st.ail=sweep(st.ail,_rT,Math.max(2.6,(ac.ctlRate||3)+1)); st.rud=sweep(st.rud,(st._gpY!=null?st._gpY:cmd('d','a')),3.2);   /* (#R96) per-aircraft actuator speed — a jumbo no longer slams to full stick in 0.33 s like a fighter */
      st._acc=(st._acc||0)+dt; const H=1/200; let n=0, flags=null;
      while(st._acc>=H && n<24 && !resultShown){ flags=stepFixed(H,ac); st._acc-=H; n++; }   /* (#R98) stop sub-stepping the instant a crash ends the flight */
      if(n>=24) st._acc=0;                       /* fell behind (lag) → drop the backlog, never spiral */
      if(!flags){ flags=stepFixed(Math.max(1e-4,st._acc),ac); st._acc=0; }   /* frame shorter than one step */
      return flags; }
    /* ===== (#R174) THE COCKPIT CAMERA IS BACK TO THE ONE THAT WORKS ===================================
       「フライトシミュレーター、上を向いたときにバグる。ふざけんな！よけいなことをかってにするな!」
       WHAT #R173 DID, AND WHY IT COULD NEVER WORK. To make the horizon curve, #R173 pushed the look-at point
       out to tens of kilometres so the renderer would be in its spherical regime — and MapLibre's spherical
       camera is (a point ON the sphere, a distance, a pitch), which cannot describe a camera looking ABOVE
       the horizon at all. So it clamped the map's view axis a few degrees BELOW the horizon and tried to put
       the pilot's real line of sight back with the projection's centre offset (padding).
       MEASURED, flying and pulling the nose up: the pilot's view angle went 92° → 165° while the MAP's pitch
       stayed frozen at 85.4° for every single frame, and the padding it compensated with grew to 1,077 px on
       a 720 px-tall window — the projection centre pushed clean off the screen. That is the reported bug, and
       it is structural: the shift needed is c2c·tan(Δ), which diverges as the nose passes the axis. There is
       no tuning that fixes it.
       So the cockpit is the #R158/#R172 camera again, unchanged: aim a target a FIXED distance ahead along
       the SMOOTHED nose and hand the eye→target pair to calculateCameraOptionsFromTo. It returns
       centre = the target and zoom = f(cameraToCenterDistance / ‖eye−target‖), so with a constant look-ahead
       BOTH centre and zoom are stable at every attitude — and because the pitch comes out of the geometry
       rather than a clamp, looking up through a climb or over the top of a loop yields pitch > 90°, which
       start() has allowed since #R95 (maxPitch 179). No padding, nothing pinned, nothing painted.
       The round-Earth horizon is withdrawn with it. It cost looking up AND the renderer's own sky (the sky
       layer is multiplied out by globeness), and a flight simulator that cannot look up is not one. */
    const _D_LOOK=1800;     /* #R158's look-ahead distance, in metres */
    function loop(){ if(!on||resultShown) return; const now=performance.now(); let dt=(now-st.t)/1000; st.t=now; dt=Math.max(0.0005,Math.min(0.1,dt));
      if(paused){ try{ if(hud){ const w=hud.querySelector('.fs-warn'); if(w&&w.textContent.indexOf('CRAS')<0&&w.textContent.indexOf('墜')<0){ w.style.display='block'; w.style.color='#8fb8e0'; w.textContent=LL('PAUSED','一時停止','PAUSE','ПАУЗА','PAUSA'); } } }catch(_){} raf=requestAnimationFrame(loop); return; }
      try{ st._overOcean=_isOpenOcean(st.lng,st.lat); }catch(_){ st._overOcean=false; }   /* (#R152) refresh open-ocean flag ONCE per frame (cached per cell) — read by stepFixed's sea-surface floor */
      const f=physics(dt), R2D=180/Math.PI, D2R=Math.PI/180, agl=f.agl;
      if(resultShown) return;   /* (#R98) a crash inside physics() opened the result screen → stop the loop */
      /* ---- CAMERA (#R158 — root-cause fix for the "視点が一瞬遠方へ飛んで戻る" teleport). ROOT CAUSE: the previous
         per-frame calculateCameraOptionsFromCameraLngLatAltRotation() derives the map CENTER by projecting the view ray to
         the ground (transform.calculateCenterFromCameraLngLatAlt). Near the horizontal that projection distance diverges and
         MapLibre substitutes a fixed fallback distance, so an UN-smoothed pitch oscillating across that boundary snapped
         center & zoom for a single frame — the teleport. FIX: aim a target a FIXED distance ahead along the (smoothed) nose
         and use calculateCameraOptionsFromTo(eye→target): it returns center = the target and zoom = f(cameraToCenterDistance /
         ‖eye−target‖), so with a CONSTANT look-ahead distance BOTH center and zoom are stable at every attitude — no ground
         projection, no clamp, no snap. Looking up through a climb/loop is preserved: FromTo yields pitch>90 and start() set
         maxPitch=179. roll is applied separately; every output is validated (NaN/Inf + abnormal one-frame Δ) and a bad frame
         is skipped — a SAFETY NET on top of the structural fix, not a substitute (the geometry above should never emit one).
         The eye altitude is decoupled from the aircraft and floored just above the smoothed terrain, so a DEM refresh can't
         drop the camera inside the ground. */
      /* keep the attitude a UNIT quaternion so qRot yields unit body axes (drift here would skew every derived angle). */
      try{ const _qn=Math.hypot(st.q[0],st.q[1],st.q[2],st.q[3]); if(_qn>1e-9&&Math.abs(_qn-1)>1e-6) st.q=[st.q[0]/_qn,st.q[1]/_qn,st.q[2]/_qn,st.q[3]/_qn]; }catch(_){}
      const fwd=qRot(st.q,[1,0,0]), rightW=qRot(st.q,[0,1,0]);
      { const _fn=Math.hypot(fwd[0],fwd[1],fwd[2])||1; fwd[0]/=_fn; fwd[1]/=_fn; fwd[2]/=_fn; }   /* normalise the nose vector */
      const mLatM=110574, mLonM=(111320*Math.cos(st.lat*D2R))||1;
      const eLng=st.lng, eLat=st.lat;   /* (#R96) COCKPIT — the eye is AT the aircraft */
      const bearingT=(Math.atan2(fwd[1],fwd[0])*R2D+360)%360;                       /* nose heading (0=N,90=E) */
      const pitchT=Math.max(0.5,Math.min(179.5, 90 - Math.asin(Math.max(-1,Math.min(1,fwd[2])))*R2D));   /* 90=level, >90 look UP, <90 look DOWN */
      let rollT=0;
      if(!stabilizeCam){ const a=fwd[0],b=fwd[1],c=fwd[2];   /* bank = angle of the right wing about the nose, vs the wings-level reference (world-horizontal ⟂ nose) */
        const d1=rightW[0]*(-b)+rightW[1]*a, d2=rightW[0]*(-a*c)+rightW[1]*(-b*c)+rightW[2]*(a*a+b*b);
        if(Math.abs(d1)>1e-9||Math.abs(d2)>1e-9) rollT=(Math.atan2(d2,d1)*R2D+360)%360; }
      /* TIME-BASED attitude stabilisation (framerate-independent): bearing & roll slew through the ±180 vertical-crossing
         singularity (a high cap clips ONLY the instantaneous pole-pop — real turn/roll rates are far below it); pitch gets an
         exponential low-pass (τ≈55 ms) that erases a one-frame spike WITHOUT lag. dt-based → 30 fps and 120 fps behave
         identically, and a jittery pitch can no longer reintroduce the teleport. */
      /* (#R188) THE INTRO WINDOW. `_camSeed` is set only by an airborne start from "Current map view";
         while it is alive the smoother starts from the MAP's bearing/pitch/roll and its two rates are
         slowed so the change is a move rather than a cut — 1.2 s, after which the seed is dropped and
         every constant below is exactly the one #R174 tuned. */
      let _intro=0;
      if(st._camSeed){ const age=performance.now()-st._camSeed.t0;
        if(age>=st._camSeed.ms) st._camSeed=null; else _intro=1-age/st._camSeed.ms; }
      const cap=(_intro>0?110:900)*Math.max(0.001,dt), slew=(prev,tgt)=>{ let dd=((tgt-prev+540)%360)-180; if(dd>cap)dd=cap; else if(dd<-cap)dd=-cap; return (prev+dd+360)%360; };
      if(st._cB==null){ const sd=st._camSeed;
        st._cB=sd?sd.bearing:bearingT; st._cR=sd?sd.roll:rollT; st._cP=sd?sd.pitch:pitchT; }
      st._cB=slew(st._cB,bearingT); st._cR=slew(st._cR,rollT);
      const _pk=1-Math.exp(-Math.max(0.001,dt)/(_intro>0?0.42:0.055)); st._cP+=(pitchT-st._cP)*_pk;
      const bearing=st._cB, roll=st._cR, pitch=st._cP; st._camRoll=roll; st._camPitch=pitch;
      /* eye altitude: at the aircraft, but never below (smoothed terrain + a small clearance) — decoupled from st.alt so a
         DEM refresh can't put the eye inside the ground. */
      const _grd=(st._terrF!=null&&isFinite(st._terrF))?st._terrF:((st.lastTerr!=null&&isFinite(st.lastTerr))?st.lastTerr:0);
      const camAlt=Math.max(st.alt, _grd+2.5);
      /* (#R189) THE FRAMING RIDES THE SAME INTRO. While the seed is alive the EYE starts at the
         map's own eye and the look-arm at the map's own eye→centre distance, both easing into the
         cockpit values — so frame one is the exact picture START was pressed on (same zoom included,
         which #R188's angle-only seed never carried), at every map zoom, and the move to the cockpit
         is one continuous camera flight. After the window the constants are untouched #R174. */
      let cEyeLng=eLng, cEyeLat=eLat, cEyeAlt=camAlt, _Darm=_D_LOOK;
      if(_intro>0&&st._camSeed&&st._camSeed.eye){
        const _s=1-_intro, _ez=_s*_s*(3-2*_s), sd=st._camSeed;
        cEyeLng=sd.eye.lng+(eLng-sd.eye.lng)*_ez;
        cEyeLat=sd.eye.lat+(eLat-sd.eye.lat)*_ez;
        cEyeAlt=Math.max(sd.eye.alt+(camAlt-sd.eye.alt)*_ez, _grd+2.5);
        if(sd.dist) _Darm=sd.dist+(_D_LOOK-sd.dist)*_ez;
      }
      /* (#R174) the #R158/#R172 camera, restored: a target a FIXED distance ahead along the SMOOTHED nose,
         handed to calculateCameraOptionsFromTo. Centre and zoom are stable at every attitude because the arm
         is constant, and the pitch is whatever the geometry says — including past 90° when the nose is up. */
      const _D=_Darm, _elR=(90-pitch)*D2R, _cE=Math.cos(_elR), _sE=Math.sin(_elR), _bR=bearing*D2R;
      const _nx=_cE*Math.cos(_bR), _ny=_cE*Math.sin(_bR), _nz=_sE;   /* down-positive nz (matches fwd[2]) */
      const tLat=cEyeLat+_D*_nx/mLatM, tLng=cEyeLng+_D*_ny/mLonM, tAlt=cEyeAlt-_D*_nz;
      try{ if(GE().camera.isAnimating&&GE().camera.isAnimating()) GE().camera.stop(); }catch(_){}   /* sole camera controller: cancel any stray ease (Atlas fly / snap-back) that slipped into this frame */
      /* (#R184) ON AN ENGINE WHOSE CAMERA IS A POSITION, SAY THE POSITION.
         Everything below this branch is MapLibre's indirect solve: its camera is a centre + zoom +
         pitch + bearing, so putting the eye in the cockpit means aiming at a target a fixed distance
         ahead and letting the renderer derive the eye — which is what `calculateCameraOptionsFromTo`
         does and what #R174–#R179 tuned. Pushing a positional camera through the same route gets the
         longitude, latitude and heading right and the ALTITUDE wrong, because the target's height and
         the eye's height are two different things once the eye is not derived: measured on Cesium,
         3,174 m of error with everything else correct.
         The simulator already knows exactly where the eye is and where it looks — it computed both a
         few lines above — so an engine that can take that gets told it directly. MapLibre's path is
         untouched, and an engine that does not declare the capability never reaches this line. */
      let posCam=false;
      if(GE().can&&GE().can('eyeIsPosition')&&GE().camera.setEye){
        try{ posCam=!!GE().camera.setEye({ lng:cEyeLng, lat:cEyeLat, alt:cEyeAlt,
          bearing:bearing, pitch:pitch, roll:roll }); }catch(_){ posCam=false; }
        if(posCam) st._cam={ center:{lng:cEyeLng,lat:cEyeLat}, bearing:bearing, pitch:pitch, roll:roll, alt:cEyeAlt };
        /* if it refused, fall through to the solve below rather than freeze the view */
      }
      let cam=null; if(!posCam){ try{ if(GE().camera.fromTo) cam=GE().camera.fromTo({lng:cEyeLng,lat:cEyeLat},cEyeAlt,{lng:tLng,lat:tLat},tAlt); }catch(_){} }
      const _fin=v=>typeof v==='number'&&isFinite(v);
      const sane=!!(cam&&cam.center&&_fin(cam.center.lng)&&_fin(cam.center.lat)&&_fin(cam.zoom)&&cam.zoom>=0&&cam.zoom<=24&&_fin(cam.bearing==null?0:cam.bearing)&&_fin(cam.pitch==null?0:cam.pitch)&&_fin(roll)&&Math.abs(cam.center.lat)<=89.5);
      let okCam=sane;
      /* (#R189) …but not during the intro flight: a seed 300 km up MEANS to move the centre fast */
      if(okCam&&st._camPrev&&_intro<=0){ const _dC=Math.hypot((cam.center.lng-st._camPrev.lng)*mLonM,(cam.center.lat-st._camPrev.lat)*mLatM), _dZ=Math.abs(cam.zoom-st._camPrev.zoom);
        if(_dC>9000||_dZ>3){ okCam=false; st._camSkip=(st._camSkip||0)+1; try{ window.__fsCamSkips=(window.__fsCamSkips||0)+1; }catch(_){} } }   /* abnormal one-frame jump → skip (never happens with FromTo geometry; a real defence, not a mask) */
      /* (#R173, kept) …but a SANE camera is never skipped for more than a few frames in a row. The comparison
         is against the last ACCEPTED camera, so a genuinely large move (a reset, a respawn, an altitude that
         really did change) made every following frame look like a teleport too and the view froze for good —
         measured: 979 consecutive skips with the aeroplane at 718 m and the camera still showing 11.8 km.
         Three frames swallows a one-frame glitch; nothing visible survives it. NaN/Inf is still never used. */
      if(!okCam&&sane&&(st._camSkip||0)>3) okCam=true;
      if(okCam) st._camSkip=0;
      if(okCam){ cam.roll=roll; st._cam=cam; st._camPrev={lng:cam.center.lng,lat:cam.center.lat,zoom:cam.zoom};
        try{ GE().camera.jumpTo(cam); }catch(_){ try{ delete cam.roll; GE().camera.jumpTo(cam); }catch(__){} } }
      /* (#R184) `!posCam` is load-bearing, not defensive. With a positional camera `cam` is null and
         `okCam` is false, which is exactly the shape of "FromTo is unavailable" — so without this the
         last-resort jumpTo would fire every frame and immediately undo the setEye above, putting the
         camera back at z14 over the aeroplane instead of in it. */
      else if(!cam&&!posCam){   /* FromTo unavailable (very old MapLibre) — last-resort validated direct camera */
        try{ if(_fin(bearing)&&_fin(pitch)) GE().camera.jumpTo({center:[st.lng,st.lat],zoom:14,bearing:bearing,pitch:Math.min(85,pitch),roll:roll}); }catch(_){} }
      /* okCam===false with cam!=null → skip this frame, keeping the last good camera (no teleport, no freeze — next frame's
         slightly-advanced geometry resolves cleanly). */
      try{ updateMinimap(dt); }catch(_){}
      try{ fsAudio.update(st,f,AC()); }catch(_){}   /* (#R101) drive the flight audio from this frame's state */
      updateHUD(agl,f);
      /* (#R98) record the flight path (for the result-screen map) + peak stats */
      if(st.alt>(st._maxAlt||0)) st._maxAlt=st.alt; if(st.V>(st._maxV||0)) st._maxV=st.V;
      /* (#R100) accumulate ground distance EVERY frame (full resolution) so the total is right even for a turn-heavy
         flight — the drawn path is decimated, but computing distance from decimated points would short-cut the turns. */
      if(st._lastPt){ const dLat=(st.lat-st._lastPt[1])*111320, dLon=(st.lng-st._lastPt[0])*111320*Math.cos(st.lat*Math.PI/180), dd=Math.hypot(dLat,dLon)/1000; if(dd<50) st._dist=(st._dist||0)+dd; } st._lastPt=[st.lng,st.lat];
      if(!st._pathT || now-st._pathT>(st._pathIntv||350)){ st._pathT=now; if(st._path){ st._path.push([st.lng,st.lat,st.alt]);
        if(st._path.length>1600){ st._path=st._path.filter((_,i)=>i%2===0); st._pathIntv=(st._pathIntv||350)*2; } } }   /* (#R99) DECIMATE (keep the whole route coarser) instead of dropping the oldest — a long flight kept losing its start & under-counting distance */
      if(f.landed){ showResult('landed'); return; }   /* completed landing → result screen */
      /* (#R150) warm satellite tiles AHEAD of the aircraft (~2.6×/s). `moveend` never fires while the camera moves
         continuously in flight, so without this the imagery streamed in BEHIND the aircraft; predictivePrefetch
         self-gates to satellite mode + uses the center delta (flight direction) to prefetch the tiles just ahead. */
      if(now-(st._pfT||0)>300){ st._pfT=now; try{ window._imPredictivePrefetch&&window._imPredictivePrefetch(true); }catch(_){} }   /* (#R151) aggressive lead + slightly faster cadence (~3.3×/s) so 3D imagery stays ahead of the aircraft */
      raf=requestAnimationFrame(loop); }
    /* switch aircraft mid-flight — keep position/attitude, reset speed to the new type's cruise + clear rates */
    function selectAircraft(k){ if(!AIRCRAFT[k]) return; acKey=k; if(st){ st.V=AIRCRAFT[k].Vcruise; st.om=[0,0,0]; st.elev=0; st.ail=0; st.rud=0; st.flaps=0; st.gear=0; computeTrim(); } try{ syncHUDChrome(); }catch(_){} }
    /* (#R175) THE FLIGHT ENVELOPE, READ-ONLY. js/aircraft-detail.js starts a flight from a real ADS-B
       aircraft's own position, altitude, heading and airspeed, and has to land those numbers inside the
       chosen machine's limits (a 240 m/s airliner start is fine, the same figure in a Cessna is not).
       Handing the spec out is the alternative to copying Vstall/Vne/ceil into a second file where they
       would rot; the copy is defensive so no caller can reach in and change the model. */
    function spec(k){ const a=AIRCRAFT[k]; if(!a) return null;
      return { key:k, name:Object.assign({},a.name), icon:a.icon||'', Vstall:a.Vstall, Vcruise:a.Vcruise, Vne:a.Vne, ceil:a.ceil, prop:!!a.prop, ab:!!a.ab }; }
    return { start, stop, setup, active:()=>on, aircraft:selectAircraft, list:()=>AKEYS.slice(), spec, airports:()=>AIRPORTS.slice(), _st:()=>st,
      _dbg:{ step:(dt)=>{ try{ return physics(dt||0.02); }catch(e){ return {err:String(e)}; } }, key:(k,v)=>{ keys[String(k).toLowerCase()]=!!v; }, clearKeys:()=>{ for(const k in keys) keys[k]=false; }, trim:()=>{ try{ computeTrim(); }catch(_){} } } }; })();
};
