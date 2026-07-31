/* ============================================================================
 *  IntMap · THE REAL SKY BEHIND THE GLOBE — window.IntMapSky  (#R186)
 * ----------------------------------------------------------------------------
 *  「現在、ダークモードでは地球の背景は真っ黒だが、実際の時刻や位置に忠実な星空、
 *    遠くに見える太陽にして。」
 *
 *  WHAT WAS THERE. In dark mode `#map` is painted with --bg-color and MapLibre's globe leaves deep
 *  space fully transparent (the atmosphere shader returns alpha 0 where the ray misses the
 *  atmosphere, and the frame is cleared to transparent). So the "space" around the Earth was a CSS
 *  background colour — black by construction, with nothing in it.
 *
 *  WHAT IT IS NOW. A canvas UNDER the renderer's own canvas, carrying the actual night sky:
 *    · 9,096 stars from the Bright Star Catalogue (data/stars.bin, see scripts/build-star-catalogue.mjs),
 *      precessed from J2000 to the map's own clock, rotated into Earth-fixed coordinates by Greenwich
 *      Mean Sidereal Time, coloured from their measured B−V index and sized by their measured V
 *      magnitude — so Orion is Orion, Sirius is the brightest thing in it, Betelgeuse is red, and the
 *      whole sky turns once a sidereal day exactly as it does outside;
 *    · the Sun, at its real geocentric right ascension and declination for that instant and at its
 *      real angular diameter (0.53°, which is a small bright disc — 「遠くに見える太陽」).
 *
 *  ── WHY A CANVAS UNDERNEATH, AND NOT A LAYER ────────────────────────────────────────────────────
 *  Because occlusion then costs nothing and cannot be wrong. The globe is opaque and is drawn in the
 *  renderer's canvas ABOVE this one, so every star behind the Earth is hidden by the Earth itself —
 *  no depth buffer, no horizon maths, no sphere-ray test. And the atmosphere, which the renderer
 *  draws with alpha blending, dims the stars near the limb by exactly its own opacity, which is what
 *  the sky does.
 *
 *  ── THE ONE PIECE THAT HAD TO BE GOT RIGHT: WHERE A POINT AT INFINITY LANDS ─────────────────────
 *  A star's screen position depends only on the camera's ROTATION and its projection. That rotation
 *  is not something to re-derive from bearing/pitch by intuition — #R182 records what happens when a
 *  camera convention is guessed at instead of transcribed. It is taken from the renderer's own
 *  Transform._calcMatrices, which builds the globe matrix as
 *
 *      P · T(0,0,−c2c) · Rz(roll) · Rx(−pitch) · Rz(bearing) · T(0,0,−R) · Rx(lat) · Ry(−lng) · S(R)
 *
 *  and is confirmed by MapLibre's own atmosphere code, whose getSunPos() puts the light direction
 *  through Rz(roll)·Rx(−pitch)·Rz(bearing)·Rx(lat)·Ry(−lng) — the same chain with the translations
 *  dropped, which is precisely the "at infinity" case. tests/r186 does not take that on trust: it
 *  runs the SAME code path with the translations restored and compares it to map.project() over a
 *  grid of bearings, pitches and zooms.
 *
 *  ── SCOPE ───────────────────────────────────────────────────────────────────────────────────────
 *  Dark theme + globe projection + an engine that does not draw its own sky. Cesium is excluded on
 *  the third test: it has a real Tycho-2 SkyBox and a real Sun of its own (js/cesium-engine.js), and
 *  two skies would be one too many. In light mode the surround is deliberately white and is left
 *  alone — the request is about the black one.
 * ==========================================================================*/
window.IntMapSky=(function(){
  'use strict';
  const GE=()=>window.IntMapGeoEngine;
  const D2R=Math.PI/180, R2D=180/Math.PI;

  /* ── astronomy ─────────────────────────────────────────────────────────────────────────────── */
  const J2000=2451545.0;
  function julianDay(ms){ return ms/86400000+2440587.5; }
  /* Greenwich Mean Sidereal Time in DEGREES (IAU 1982 series). This is the whole reason the sky is
     "faithful to the time": it is the angle Earth has turned relative to the stars, so subtracting it
     from a star's right ascension gives the longitude the star is standing over right now. */
  function gmstDeg(ms){
    const T=(julianDay(ms)-J2000)/36525;
    let s=67310.54841+(876600*3600+8640184.812866)*T+0.093104*T*T-6.2e-6*T*T*T;   /* seconds of time */
    s=((s%86400)+86400)%86400;
    return s/240;                                                                  /* 1 s of time = 1/240° */
  }
  /* J2000 → mean equinox of date. About 0.36° over the app's lifetime so far — small, but a fixed
     0.36° error in every constellation is a real error, and the rigorous rotation is fifteen lines. */
  function precess(raDeg,decDeg,T){
    const AS=1/3600;
    const z1=(2306.2181*T+0.30188*T*T+0.017998*T*T*T)*AS*D2R;
    const z2=(2306.2181*T+1.09468*T*T+0.018203*T*T*T)*AS*D2R;
    const th=(2004.3109*T-0.42665*T*T-0.041833*T*T*T)*AS*D2R;
    const a=raDeg*D2R+z1, d=decDeg*D2R;
    const cd=Math.cos(d), sd=Math.sin(d), ca=Math.cos(a), sa=Math.sin(a);
    const A=cd*sa, B=Math.cos(th)*cd*ca-Math.sin(th)*sd, C=Math.sin(th)*cd*ca+Math.cos(th)*sd;
    return [ (Math.atan2(A,B)*R2D+z2*R2D+360)%360, Math.asin(Math.max(-1,Math.min(1,C)))*R2D ];
  }
  /* Geocentric apparent Sun (the USNO low-precision series — better than 0.02°, which is a
     twenty-fifth of the Sun's own diameter). Returns RA/Dec of date and the true distance, which is
     what sets the apparent size the disc is drawn at. */
  function sunPosition(ms){
    const n=julianDay(ms)-J2000;
    const L=(280.460+0.9856474*n)%360;
    const g=((357.528+0.9856003*n)%360)*D2R;
    const lam=(L+1.915*Math.sin(g)+0.020*Math.sin(2*g))*D2R;
    const eps=(23.439-0.0000004*n)*D2R;
    const ra=(Math.atan2(Math.cos(eps)*Math.sin(lam),Math.cos(lam))*R2D+360)%360;
    const dec=Math.asin(Math.sin(eps)*Math.sin(lam))*R2D;
    const au=1.00014-0.01671*Math.cos(g)-0.00014*Math.cos(2*g);
    return { ra, dec, au, angularDiamDeg:2*Math.atan(696000/(au*149597870.7))*R2D };
  }
  /* B−V → colour temperature (Ballesteros 2012), then temperature → sRGB (the standard piecewise fit
     to the Planckian locus). Both are physical relations, so Rigel comes out blue-white and
     Betelgeuse orange-red because that is what their measured colour indices say. */
  function bvToRGB(bv){
    const t=4600*(1/(0.92*bv+1.7)+1/(0.92*bv+0.62));
    const k=Math.max(1000,Math.min(40000,t))/100;
    let r,g,b;
    if(k<=66){ r=255; g=99.4708025861*Math.log(k)-161.1195681661; }
    else { r=329.698727446*Math.pow(k-60,-0.1332047592); g=288.1221695283*Math.pow(k-60,-0.0755148492); }
    if(k>=66) b=255; else if(k<=19) b=0; else b=138.5177312231*Math.log(k-10)-305.0447927307;
    const c=v=>Math.max(0,Math.min(255,Math.round(v)));
    return [c(r),c(g),c(b)];
  }

  /* ── the camera ────────────────────────────────────────────────────────────────────────────── */
  /* Sphere space, exactly as the renderer defines it: y is north, z points at longitude 0.
     (MapLibre's angularCoordinatesRadiansToVector.) */
  function sphereVec(lngDeg,latDeg){
    const a=lngDeg*D2R, b=latDeg*D2R, c=Math.cos(b);
    return [Math.sin(a)*c, Math.sin(b), Math.cos(a)*c];
  }
  const rotX=(v,r)=>{ const c=Math.cos(r),s=Math.sin(r); return [v[0], c*v[1]-s*v[2], s*v[1]+c*v[2]]; };
  const rotY=(v,r)=>{ const c=Math.cos(r),s=Math.sin(r); return [c*v[0]+s*v[2], v[1], -s*v[0]+c*v[2]]; };
  const rotZ=(v,r)=>{ const c=Math.cos(r),s=Math.sin(r); return [c*v[0]-s*v[1], s*v[0]+c*v[1], v[2]]; };
  /* Rz(roll)·Rx(−pitch)·Rz(bearing)·Rx(lat)·Ry(−lng) — the renderer's own chain, applied right to left. */
  function toView(F,v){
    v=rotY(v,-F.lng*D2R); v=rotX(v,F.lat*D2R);
    v=rotZ(v,F.bearingDeg*D2R); v=rotX(v,-F.pitchDeg*D2R); v=rotZ(v,(F.rollDeg||0)*D2R);
    return v;
  }
  /* Perspective + the padding-derived centre-of-perspective offset, as gl-matrix builds them.
     A direction has w = 0, so only the z column of the offset rows survives — which is why the two
     offsets multiply d[2] here. */
  function projectView(F,d){
    const f=1/Math.tan(F.fovRad/2), aspect=F.width/F.height;
    const w=-d[2];
    if(!(w>1e-9)) return null;                         /* behind the camera */
    const cx=(f/aspect)*d[0]+(-F.offsetX*2/F.width)*d[2];
    const cy=f*d[1]+(F.offsetY*2/F.height)*d[2];
    return [ (cx/w*0.5+0.5)*F.width, (0.5-cy/w*0.5)*F.height ];
  }
  /* A direction on the celestial sphere → screen. This is the function the star field uses. */
  function projectDirection(F,lngDeg,latDeg){ return projectView(F,toView(F,sphereVec(lngDeg,latDeg))); }
  /* …and the SAME chain with the two translations and the scale restored, i.e. a point ON the globe.
     Nothing draws with this. It exists so the model can be checked against map.project() — if a
     surface point lands where the renderer puts it, the rotation the star field uses is the
     renderer's rotation. */
  function projectSurface(F,lngDeg,latDeg){
    const R=F.globeRadiusPx||0;
    let v=sphereVec(lngDeg,latDeg).map(x=>x*R);
    v=rotY(v,-F.lng*D2R); v=rotX(v,F.lat*D2R);
    v=[v[0],v[1],v[2]-R];
    v=rotZ(v,F.bearingDeg*D2R); v=rotX(v,-F.pitchDeg*D2R); v=rotZ(v,(F.rollDeg||0)*D2R);
    v=[v[0],v[1],v[2]-(F.cameraToCenterPx||0)];
    return projectView(F,v);
  }

  /* ── the catalogue ─────────────────────────────────────────────────────────────────────────── */
  let stars=null, starsLoading=null, starErr=null;
  function catalogueUrl(){
    /* Same trick the rest of the app uses for its bundled data: relative to the document, so it
       works from the Pages sub-path, from vite preview and from the test server alike. */
    try{ return new URL('data/stars.bin',document.baseURI).toString(); }catch(_){ return 'data/stars.bin'; }
  }
  function loadStars(){
    if(stars||starsLoading) return starsLoading||Promise.resolve(stars);
    starsLoading=fetch(catalogueUrl()).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); })
      .then(buf=>{
        const dv=new DataView(buf);
        let magic=''; for(let i=0;i<7;i++) magic+=String.fromCharCode(dv.getUint8(i));
        if(magic!=='IMSTAR1') throw new Error('bad catalogue header');
        const n=dv.getUint32(8,true);
        const ra=new Float32Array(n), dec=new Float32Array(n), mag=new Float32Array(n);
        const cr=new Uint8Array(n), cg=new Uint8Array(n), cb=new Uint8Array(n);
        for(let i=0;i<n;i++){ const o=12+i*6;
          ra[i]=dv.getUint16(o,true)*360/65536;
          dec[i]=dv.getInt16(o+2,true)*90/32767;
          mag[i]=dv.getUint8(o+4)/20-2;
          const rgb=bvToRGB(dv.getInt8(o+5)/50);
          cr[i]=rgb[0]; cg[i]=rgb[1]; cb[i]=rgb[2]; }
        stars={ n, ra, dec, mag, cr, cg, cb, precessedFor:null, pra:new Float32Array(n), pdec:new Float32Array(n) };
        starsLoading=null; schedule(); return stars;
      }).catch(e=>{ starErr=String(e&&e.message||e); starsLoading=null;
        console.warn('[sky] star catalogue unavailable — the sky falls back to the plain background:',starErr);
        return null; });
    return starsLoading;
  }
  /* Precession is a whole-sky rotation that changes by 20 arcsec a year, so it is recomputed once a
     day of map time rather than once a frame. */
  function ensurePrecessed(ms){
    if(!stars) return;
    const T=(julianDay(ms)-J2000)/36525;
    if(stars.precessedFor!=null&&Math.abs(T-stars.precessedFor)<1/36525) return;   /* < 1 day */
    for(let i=0;i<stars.n;i++){ const p=precess(stars.ra[i],stars.dec[i],T); stars.pra[i]=p[0]; stars.pdec[i]=p[1]; }
    stars.precessedFor=T;
  }

  /* ── the canvas ────────────────────────────────────────────────────────────────────────────── */
  let cv=null, ctx=null, raf=0, wired=false, forced=null, lastDraw=null;
  function canvas(){
    if(cv) return cv;
    const mc=document.getElementById('map-container'), mp=document.getElementById('map');
    if(!mc||!mp) return null;
    cv=document.createElement('canvas'); cv.id='space-canvas'; cv.setAttribute('aria-hidden','true');
    /* Before #map in the DOM and at stacking level 0, so the renderer's canvas paints on top of it
       and the globe hides everything behind itself. pointer-events:none — this is scenery. */
    mc.insertBefore(cv,mp);
    ctx=cv.getContext('2d');
    return cv;
  }
  function mapClock(){
    try{ const T=window.IntMapTime; if(T&&T.now) { const d=T.now(); const ms=(d instanceof Date)?d.getTime():+d; if(isFinite(ms)) return ms; } }catch(_){}
    return Date.now();
  }
  /* Dark theme + a globe + an engine with no sky of its own. `forced` is the manual override the
     console/Atlas can set; null means "decide from the conditions". */
  function shouldDraw(){
    if(forced===false) return false;
    try{ if(!GE().hasRenderer()) return false; }catch(_){ return false; }
    let F=null; try{ F=GE().camera.viewFrame(); }catch(_){}
    if(!F||!F.width||!F.height) return false;                      /* null = the engine draws its own sky */
    if(forced===true) return true;
    if(document.documentElement.getAttribute('data-theme')!=='dark') return false;
    if(!(F.globeness>0.5)) return false;                           /* flat map: the surround is not space */
    return true;
  }
  function resize(F){
    const dpr=Math.min(2,window.devicePixelRatio||1);
    const w=Math.max(1,Math.round(F.width*dpr)), h=Math.max(1,Math.round(F.height*dpr));
    if(cv.width!==w||cv.height!==h){ cv.width=w; cv.height=h; }
    cv.style.width=F.width+'px'; cv.style.height=F.height+'px';
    return dpr;
  }
  function draw(){
    raf=0;
    if(!canvas()) return;
    if(!shouldDraw()){ cv.style.display='none'; document.body.classList.remove('space-sky-on'); return; }
    const F=GE().camera.viewFrame(); if(!F) return;
    cv.style.display='block'; document.body.classList.add('space-sky-on');
    if(!stars){ loadStars(); }
    const dpr=resize(F);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,F.width,F.height);
    const ms=mapClock(), gm=gmstDeg(ms);
    let drawn=0;
    if(stars){
      ensurePrecessed(ms);
      const W=F.width, H=F.height;
      for(let i=0;i<stars.n;i++){
        const p=projectDirection(F,stars.pra[i]-gm,stars.pdec[i]);
        if(!p) continue;
        const x=p[0], y=p[1];
        if(x<-4||y<-4||x>W+4||y>H+4) continue;
        const v=stars.mag[i];
        /* Size and opacity both follow the magnitude, which is the log of the real flux — the
           ORDER is physical and never adjusted, only the mapping into pixels. Measured on a 1400×900
           dark globe view the first curve put a magnitude-4 star at 0.26 alpha in a 0.9 px square,
           which is faithful to a dark-sky naked eye and invisible on a screen at arm's length. The
           exponent is gentler now, so the mid-magnitude bulk of the sky (which is what makes a sky
           look like a sky) reads, while the brightest still stand well clear of it:
               mag 6 → α 0.19, 0.7 px    mag 4 → α 0.39, 0.9 px
               mag 2 → α 0.73, 1.5 px    mag 0 → α 1.00, 2.6 px    Sirius → α 1.00, 4.0 px + glow */
        const b=Math.max(0,Math.min(1,(6.8-v)/8.3));
        const bp=Math.pow(b,1.6);
        const a=Math.min(1,0.16+bp*1.35);
        const s=0.62+Math.pow(b,1.7)*3.4;
        const col=stars.cr[i]+','+stars.cg[i]+','+stars.cb[i];
        /* the brightest handful get the small halo the eye gives them */
        if(v<1.6){ const g=ctx.createRadialGradient(x,y,0,x,y,s*2.6);
          g.addColorStop(0,'rgba('+col+',0.42)'); g.addColorStop(1,'rgba('+col+',0)');
          ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,s*2.6,0,6.283185307); ctx.fill(); }
        ctx.fillStyle='rgba('+col+','+a.toFixed(3)+')';
        if(s<1.6) ctx.fillRect(x-s/2,y-s/2,s,s);
        else { ctx.beginPath(); ctx.arc(x,y,s/2,0,6.283185307); ctx.fill(); }
        drawn++;
      }
    }
    /* The Sun. Its real angular diameter over the camera's real field of view — at a typical globe
       view that is a disc of a few pixels with a glow around it, which is what the Sun looks like
       from here. Drawn last so it is over the stars, as it is. */
    const S=sunPosition(ms);
    const sp=projectDirection(F,S.ra-gm,S.dec);
    let sun=null;
    if(sp){
      const pxPerDeg=(F.height/2)/Math.tan(F.fovRad/2)*D2R;
      const rad=Math.max(1.5,S.angularDiamDeg/2*pxPerDeg);
      const glow=Math.max(rad*7,26);
      const g=ctx.createRadialGradient(sp[0],sp[1],0,sp[0],sp[1],glow);
      g.addColorStop(0,'rgba(255,246,214,0.85)');
      g.addColorStop(0.16,'rgba(255,226,160,0.30)');
      g.addColorStop(0.45,'rgba(255,204,130,0.08)');
      g.addColorStop(1,'rgba(255,190,110,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(sp[0],sp[1],glow,0,6.283185307); ctx.fill();
      ctx.fillStyle='rgba(255,250,235,1)'; ctx.beginPath(); ctx.arc(sp[0],sp[1],rad,0,6.283185307); ctx.fill();
      sun={ x:sp[0], y:sp[1], radiusPx:rad };
    }
    lastDraw={ ms, gmstDeg:gm, stars:drawn, sun, sunRa:S.ra, sunDec:S.dec, at:Date.now() };
  }
  function schedule(){ if(raf) return; raf=requestAnimationFrame(draw); }

  /* ── lifecycle ─────────────────────────────────────────────────────────────────────────────── */
  let tick=0;
  function wire(){
    if(wired) return; wired=true;
    try{ ['move','moveend','zoom','rotate','pitch','resize','projectiontransition','styledata','load'].forEach(ev=>{
      try{ GE().events.on(ev,schedule); }catch(_){} }); }catch(_){}
    window.addEventListener('resize',schedule);
    window.addEventListener('intmap-theme',schedule);
    try{ if(window.IntMapTime&&window.IntMapTime.on) window.IntMapTime.on(schedule); }catch(_){}
    /* The sky turns 15° an hour; a repaint every 30 s keeps it within a quarter of a degree of the
       truth without asking for a frame the camera did not ask for. */
    if(!tick) tick=setInterval(()=>{ if(!document.hidden) schedule(); },30000);
    /* A theme switch does not raise a map event, so watch the attribute that carries it. */
    try{ new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']}); }catch(_){}
    schedule();
  }

  return {
    /* the whole point, for anything that wants to drive it (Atlas, the console, the tests) */
    start:wire,
    refresh:schedule,
    set(on){ forced=(on==null?null:!!on); schedule(); return forced; },
    isOn:()=>!!(cv&&cv.style.display!=='none'&&shouldDraw()),
    /* diagnostics — every number the drawing used, so a test never has to read pixels to know
       whether the sky is in the right place */
    state:()=>({ active:shouldDraw(), forced, stars:stars?stars.n:0, error:starErr,
      last:lastDraw?Object.assign({},lastDraw):null }),
    /* the astronomy and the camera, exposed by name so tests can check them against published
       values and against map.project() rather than against themselves (#R176) */
    gmstDeg, sunPosition, precess, bvToRGB, sphereVec,
    frame:()=>{ try{ return GE().camera.viewFrame(); }catch(_){ return null; } },
    projectDirection:(lng,lat,F)=>{ F=F||(()=>{ try{ return GE().camera.viewFrame(); }catch(_){ return null; } })(); return F?projectDirection(F,lng,lat):null; },
    projectSurface:(lng,lat,F)=>{ F=F||(()=>{ try{ return GE().camera.viewFrame(); }catch(_){ return null; } })(); return F?projectSurface(F,lng,lat):null; },
    load:loadStars,
  };
})();
