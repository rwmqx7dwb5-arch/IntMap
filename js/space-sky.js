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
        /* (#R208) IMSTAR2 added the measured parallax as two more bytes per star. THE STRIDE COMES
           FROM THE MAGIC, so this reader serves either version — the alternative is that rebuilding
           the catalogue silently shifts every field by two bytes and the sky turns to noise. This
           view draws a sky on a sphere and does not use the distance; it only has to read past it. */
        if(magic!=='IMSTAR1'&&magic!=='IMSTAR2') throw new Error('bad catalog header');
        const STRIDE=(magic==='IMSTAR2')?8:6;
        const n=dv.getUint32(8,true);
        const ra=new Float32Array(n), dec=new Float32Array(n), mag=new Float32Array(n);
        const cr=new Uint8Array(n), cg=new Uint8Array(n), cb=new Uint8Array(n);
        for(let i=0;i<n;i++){ const o=12+i*STRIDE;
          ra[i]=dv.getUint16(o,true)*360/65536;
          dec[i]=dv.getInt16(o+2,true)*90/32767;
          mag[i]=dv.getUint8(o+4)/20-2;
          const rgb=bvToRGB(dv.getInt8(o+5)/50);
          cr[i]=rgb[0]; cg[i]=rgb[1]; cb[i]=rgb[2]; }
        stars={ n, ra, dec, mag, cr, cg, cb, precessedFor:null, pra:new Float32Array(n), pdec:new Float32Array(n),
                vx:new Float32Array(n), vy:new Float32Array(n), vz:new Float32Array(n),
                css:new Array(n), sz:new Float32Array(n) };
        /* ── (#R187) SIZE AND COLOUR ARE FUNCTIONS OF MAGNITUDE, AND MAGNITUDE NEVER CHANGES ──────
           So they are not per-frame work. Building `rgba(r,g,b,a)` inside the draw loop meant ~99,000
           string concatenations every frame on top of ~99,000 canvas state changes; the strings are
           the same every time, so they are built once here. The curve is documented at its use site
           in draw() — this is the same arithmetic, evaluated at load. */
        for(let i=0;i<n;i++){
          const v=mag[i];
          const b=Math.max(0,Math.min(1,(9.8-v)/11.3));
          const a=Math.min(1,0.14+Math.pow(b,1.5)*1.45);
          stars.sz[i]=0.55+Math.pow(b,2.2)*3.7;
          stars.css[i]='rgba('+cr[i]+','+cg[i]+','+cb[i]+','+a.toFixed(3)+')';
        }
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
    for(let i=0;i<stars.n;i++){ const p=precess(stars.ra[i],stars.dec[i],T); stars.pra[i]=p[0]; stars.pdec[i]=p[1];
      /* (#R187) …and the unit vector with it. See drawStars: the per-frame loop is now 99,000 long,
         so the two sines and two cosines sphereVec() costs per star cannot be paid every frame. They
         change only when the precession does — once a day of map time. */
      const a=p[0]*D2R, b=p[1]*D2R, c=Math.cos(b);
      stars.vx[i]=Math.sin(a)*c; stars.vy[i]=Math.sin(b); stars.vz[i]=Math.cos(a)*c; }
    stars.precessedFor=T;
  }
  /* ══ (#R187) THE WHOLE ROTATION AS ONE MATRIX ══════════════════════════════════════════════════
     projectDirection() is the CONTRACT — it is what the tests check against map.project(), and it is
     unchanged. What changes is that the bulk loop no longer calls it 99,000 times a frame.

     Two identities make that exact rather than approximate:
       · sphereVec(ra − gmst, dec) ≡ Ry(−gmst) · sphereVec(ra, dec)   — a rotation about the polar
         axis IS the sidereal hour angle, so the catalogue's own unit vector can be precomputed and
         the clock folded into the matrix;
       · Ry(−lng) · Ry(−gmst) ≡ Ry(−(lng + gmst))                     — adjacent rotations about the
         same axis compose.
     So the renderer's chain Rz(roll)·Rx(−pitch)·Rz(bearing)·Rx(lat)·Ry(−lng) applied to
     sphereVec(ra−gmst, dec) is one 3×3 matrix applied to a precomputed vector: nine multiplies a
     star instead of four transcendentals plus five rotations.

     ⚠ NOT TAKEN ON TRUST. tests/r187 builds this matrix and compares it to projectDirection() over a
     grid of camera states and sky directions; if the two ever disagree the fast path is wrong. */
  function viewMatrix(F,gmst){
    const rows=[[1,0,0],[0,1,0],[0,0,1]];
    const ap=(fn,r)=>{ for(let k=0;k<3;k++){ const v=fn([rows[0][k],rows[1][k],rows[2][k]],r);
      rows[0][k]=v[0]; rows[1][k]=v[1]; rows[2][k]=v[2]; } };
    ap(rotY,-(F.lng+gmst)*D2R); ap(rotX,F.lat*D2R);
    ap(rotZ,F.bearingDeg*D2R); ap(rotX,-F.pitchDeg*D2R); ap(rotZ,(F.rollDeg||0)*D2R);
    return rows;
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
    /* ⚠ (#R200) `T.now` is not on window.IntMapTime (see js/theme-sky.js) — the star field had been
       drawn for the wall clock since #R187 whatever the master clock said. `when()` is the real one. */
    try{ const T=window.IntMapTime; if(T&&T.when) { const d=T.when(); const ms=(d instanceof Date)?d.getTime():+d; if(isFinite(ms)) return ms; } }catch(_){}
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
    const _t0=performance.now();
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
      const M=viewMatrix(F,gm);
      const m00=M[0][0],m01=M[0][1],m02=M[0][2],
            m10=M[1][0],m11=M[1][1],m12=M[1][2],
            m20=M[2][0],m21=M[2][1],m22=M[2][2];
      const f=1/Math.tan(F.fovRad/2), aspect=W/H;
      const ox=(-F.offsetX*2/W), oy=(F.offsetY*2/H);
      const fa=f/aspect;
      for(let i=0;i<stars.n;i++){
        const vx=stars.vx[i], vy=stars.vy[i], vz=stars.vz[i];
        const dz=m20*vx+m21*vy+m22*vz;
        const w=-dz; if(!(w>1e-9)) continue;                     /* behind the camera */
        const dx=m00*vx+m01*vy+m02*vz, dy=m10*vx+m11*vy+m12*vz;
        const x=((fa*dx+ox*dz)/w*0.5+0.5)*W;
        if(x<-4||x>W+4) continue;
        const y=(0.5-(f*dy+oy*dz)/w*0.5)*H;
        if(y<-4||y>H+4) continue;
        const v=stars.mag[i];
        /* ── (#R187) THE CURVE, RE-FITTED FOR A CATALOGUE THAT GOES FOUR MAGNITUDES DEEPER ────────
           Size and opacity both follow the magnitude, which is the log of the real flux — the ORDER
           is physical and is never adjusted, only the mapping into pixels. #R186's curve ran out at
           V 6.8 because that was the end of the Bright Star Catalogue; every Hipparcos star fainter
           than that would have been pinned to the same floor, which would have drawn the deep sky as
           a flat wash instead of as the graded thing it is. The span is now the catalogue's own:
               V 9.5 → α 0.15, 0.6 px     V 6.5 → α 0.36, 0.8 px
               V 4   → α 0.62, 1.3 px     V 2   → α 0.88, 2.2 px
               V 0   → α 1.00, 3.2 px     Sirius (−1.44) → α 1.00, 4.2 px + glow
           The faintest are individually almost nothing, which is correct — what they do is give the
           Milky Way its brightness, because that band IS their density.
           ⚠ It is EVALUATED IN loadStars, not here: magnitude never changes, so both outputs are
           constants per star, and computing them in the loop cost ~99,000 pow() pairs and ~99,000
           string builds a frame for an answer that was identical every time. */
        const s=stars.sz[i];                                     /* precomputed at load — see loadStars */
        /* the brightest handful get the small halo the eye gives them */
        if(v<1.6){ const col=stars.cr[i]+','+stars.cg[i]+','+stars.cb[i];
          const g=ctx.createRadialGradient(x,y,0,x,y,s*2.6);
          g.addColorStop(0,'rgba('+col+',0.42)'); g.addColorStop(1,'rgba('+col+',0)');
          ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,s*2.6,0,6.283185307); ctx.fill(); }
        ctx.fillStyle=stars.css[i];
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
    lastDraw={ ms, gmstDeg:gm, stars:drawn, sun, sunRa:S.ra, sunDec:S.dec, at:Date.now(),
               catalogue:stars?stars.n:0, drawMs:+(performance.now()-_t0).toFixed(2) };
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
    /* (#R187) the composed rotation the bulk star loop uses, so a test can hold it against
       projectDirection() rather than against itself */
    viewMatrix,
    frame:()=>{ try{ return GE().camera.viewFrame(); }catch(_){ return null; } },
    projectDirection:(lng,lat,F)=>{ F=F||(()=>{ try{ return GE().camera.viewFrame(); }catch(_){ return null; } })(); return F?projectDirection(F,lng,lat):null; },
    projectSurface:(lng,lat,F)=>{ F=F||(()=>{ try{ return GE().camera.viewFrame(); }catch(_){ return null; } })(); return F?projectSurface(F,lng,lat):null; },
    load:loadStars,
  };
})();
