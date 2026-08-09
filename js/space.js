/* ============================================================================
 *  IntMap · THE SPACE EXPLORER — window.IntMapSpace  (#R197)
 * ----------------------------------------------------------------------------
 *  「最もズームアウトしてそれよりズームできなくなった時だけ、画面上に宇宙を探索するボタンを設置し、
 *    そこから各惑星を見れたり、（地球と同じ形式で。地名のラベル付き。）太陽系を実寸大/モデル大で
 *    完全に主要天体をシミュレートしたものも。（過去、live、未来があり、実際の日時と位置がすべて正確。
 *    物理要素も忠実に。）」
 *
 *  ── HOW YOU GET THERE (#R201 — 「ボタンで押す形式ではなく…ズームアウトし続ければそのまま宇宙まで」) ──
 *  There is no button. The map's zoom floor is a real state — `camera.zoom <= minZoom + ε`, read from
 *  the renderer through the engine contract so it is the same on both engines — and once the camera
 *  is standing on it, the zoom-out the renderer can no longer spend is INTEGRATED instead: keep
 *  pulling back and the integral fills, stop and it decays. At 1.6 zoom levels' worth the view
 *  crosses over on a fade. The way back is the same integral mirrored — a zoom-IN the space camera
 *  has nowhere to spend — and Escape and × still work. Nothing about this file runs, loads or
 *  allocates until that crossing happens. See the long note above mount().
 *
 *  ── WHAT IS SIMULATED ───────────────────────────────────────────────────────────────────────────
 *  The Sun, the eight planets, Pluto and the Moon, from published elements (js/ephemeris.js — the JPL
 *  approximate elements over 3000 BC – 3000 AD, and the truncated ELP-2000/82 for the Moon). Time
 *  runs from the app's own clock when live and anywhere in that span when it is not, forwards or
 *  backwards at any rate. Positions, distances, phase angles and elongations are the ones those
 *  series give; the panel prints them and says which series they came from.
 *
 *  ⚠ THE OTHER MOONS ARE NOT HERE, AND THAT IS A DECISION. Io on a circular orbit of the right radius
 *  and period looks perfect and is on the wrong side of Jupiter, because the phase needs a mean
 *  longitude at epoch that this app would be inventing. 「フェイク実装をするな」— see the note in
 *  js/ephemeris.js. The body list says what is modelled.
 *
 *  ── 実寸大 / モデル大 ────────────────────────────────────────────────────────────────────────────
 *  Two scales, both honest, neither a compromise between them:
 *
 *    · TRUE SCALE — one scene unit is one astronomical unit and every radius is the body's real
 *      radius in the same unit. The Earth is then 4.3×10⁻⁵ units across and IS invisible next to a
 *      1 AU orbit. That is what the solar system looks like, and the readout says how many pixels the
 *      body is currently worth so the emptiness is a measurement rather than a bug.
 *    · MODEL SCALE — orbital radii compressed by a power law and bodies enlarged by a cube root, the
 *      two curves chosen so the whole system is legible in one view and the ORDER and the RATIOS
 *      within each family survive. The panel states both factors.
 *
 *  ── THE PLANETS AS GLOBES ───────────────────────────────────────────────────────────────────────
 *  「地球と同じ形式で。地名のラベル付き。」 A body is a textured sphere lit by the real Sun direction
 *  for the chosen instant, turning at its own real sidereal rate about its own real axial tilt, with
 *  the IAU-approved names from the USGS Gazetteer placed at their published coordinates
 *  (data/planet-names.json, scripts/build-planet-data.mjs). Back-facing names are hidden by the body
 *  itself; the rest are laid out largest-first with collision rejection, exactly as a map does it.
 *
 *  ⚠ IT IS ITS OWN RENDERER, NOT THE MAP'S. MapLibre draws Web Mercator tiles of one particular
 *  spheroid and Cesium draws WGS-84; neither has an opinion about Mercury. This is ~200 lines of
 *  WebGL — a sphere, a texture, a light and a line — which is smaller than the adapter would be.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.space=function(HOST){
  const GE=()=>window.IntMapGeoEngine;

  window.IntMapSpace=(function(){
    'use strict';
    const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
    const EPH=()=>window.IntMapEphemeris;
    /* ⚠ (#R138) EVERY VALUE THAT REACHES THE DOM GOES THROUGH THE ONE SANITISER. Two of the strings
       this panel builds HTML from are DATA rather than literals — the body colour out of
       js/ephemeris.js and the body name out of the language table — and CodeQL was right to say so
       even though both are ours today: a table is exactly the thing that later grows an entry from a
       file. The feature labels are drawn on a canvas with fillText and never touch innerHTML. */
    const S=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
    const D2R=Math.PI/180, AU=149597870.7;

    /* ---- state ------------------------------------------------------------------------------- */
    let root=null, gl=null, cv=null, ov=null, octx=null;
    let open=false, mode='system', focus='earth', scale='model';
    let live=true, timeMs=Date.now(), rate=0, playing=false, lastTick=0;
    let az=0.6, el=0.45, dist=70;           /* orbit camera, scene units */
    let raf=0, prog=null, progLine=null, progPts=null, sphere=null, ring=null, starBuf=null, starN=0;
    /* (#R208) the same stars as real POINTS rather than as a direction on a shell: `starDir` is the
       unit vector per star and `starPc` its measured distance in parsecs (0 = the catalogue has no
       usable parallax). Kept on the CPU because the far view rebuilds a GPU buffer from them only
       when the camera leaves the solar system, which is rare and not per-frame. */
    let starPc=null, starDir=null;
    const tex={}, texLoading={};
    let names=null, namesLoading=null;
    let dpr=1, W=0, H=0, lastErr=null, frames=0, lastFpsAt=0, fps=0, sampleReq=null;
    let hoverBody=null;
    /* (#R207) 「軌道をオンオフしたりできるように。また、各惑星の地名ラベルをオンオフできるように。」
       Two independent switches, both default ON so nothing a session already saw disappears.
       `showOrbits` is the system view's orbit lines; `showNames` is the IAU nomenclature drawn on a
       body in body view (the "地名ラベル"). The body NAMES in the system view are what identifies the
       dots at all, so they are not part of either switch. */
    let showOrbits=true, showNames=true;

    const BODIES=['sun','mercury','venus','earth','moon','mars','jupiter','saturn','uranus','neptune','pluto'];
    const NAMED={ sun:['Sun','太陽','Sonne','Солнце','Sol'], mercury:['Mercury','水星','Merkur','Меркурий','Mercurio'],
      venus:['Venus','金星','Venus','Венера','Venus'], earth:['Earth','地球','Erde','Земля','Tierra'],
      moon:['Moon','月','Mond','Луна','Luna'], mars:['Mars','火星','Mars','Марс','Marte'],
      jupiter:['Jupiter','木星','Jupiter','Юпитер','Júpiter'], saturn:['Saturn','土星','Saturn','Сатурн','Saturno'],
      uranus:['Uranus','天王星','Uranus','Уран','Urano'], neptune:['Neptune','海王星','Neptun','Нептун','Neptuno'],
      pluto:['Pluto','冥王星','Pluto','Плутон','Plutón'] };
    const bodyName=(id)=>{ const a=NAMED[id]; if(!a) return id;
      return HOST.lang==='jp'?a[1]:HOST.lang==='de'?a[2]:HOST.lang==='ru'?a[3]:HOST.lang==='es'?a[4]:a[0]; };
    /* Saturn's rings, at their published radii in km — the C ring, the B ring, the Cassini division
       and the A ring, so what is drawn is the structure that is there rather than a flat disc. */
    const RINGS=[[74658,92000,0.35],[92000,117580,0.85],[117580,122170,0.06],[122170,136775,0.55]];

    /* ══ time ═════════════════════════════════════════════════════════════════════════════════════
       Live means the app's own clock (#R94: window.IntMapTime is the ONE master clock), so opening
       the explorer while the map is replaying 1998 shows the sky of 1998. Stepping the explorer's own
       time does NOT move the app's clock — the map underneath is not asked to follow a trip to 2400. */
    function nowMs(){
      if(!live) return timeMs;
      try{ const T=window.IntMapTime; if(T&&T.when){ const d=T.when(); if(d&&isFinite(+d)) return +d; } }catch(_){}
      return Date.now();
    }
    const jdNow=()=>EPH().julianDay(nowMs());
    const MIN_MS=Date.UTC(-2999,0,1), MAX_MS=Date.UTC(3000,0,1);

    /* ══ scales ═══════════════════════════════════════════════════════════════════════════════════ */
    /* true: 1 unit = 1 AU, radii in AU. model: r^0.42 compressed orbits, cube-root bodies. */
    const POS_P=0.42, POS_K=26, RAD_K=0.055;
    function posScale(au){ return scale==='real'?au:(POS_K*Math.pow(au,POS_P)); }
    function radScale(km){ return scale==='real'?(km/AU):(RAD_K*Math.pow(km/6378.137,1/3)); }
    /* ══ ⚠ (#R203) THE MOON IS ITS OWN FAMILY, OR IT IS INSIDE THE EARTH ═════════════════════════════
       「宇宙を探索で、モデル大にしたら地球と月が融合している」— and the arithmetic says exactly that.
       Model scale compresses a HELIOCENTRIC distance, and the Moon's heliocentric distance is the
       Earth's ± 0.00257 AU. So 26·1.0000^0.42 = 26.000 and 26·1.0026^0.42 = 26.028: the two bodies end
       up 0.028 units apart while the Earth's model radius alone is 0.055 and the Moon's is 0.036. The
       Moon was drawn INSIDE the Earth — not a tuning problem, a category error.

       The file's own rule is that model scale keeps 「the ORDER and the RATIOS within each family」,
       and the Moon is not a member of the Sun's family. It is placed relative to the Earth, by the
       same power law applied to its GEOCENTRIC distance, with the constant chosen so that even at
       perigee it clears both radii: 0.30·(356,500/384,400)^0.42 = 0.291 against 0.055 + 0.036 = 0.091.
       Its own perigee-to-apogee ratio survives, which is what the ratio promise means here. True scale
       is untouched — there the real geometry already separates them. */
    const MOON_K=0.30, MOON_REF_KM=384400;
    function moonSep(km){ return scale==='real'?(km/AU):(MOON_K*Math.pow(km/MOON_REF_KM,POS_P)); }

    /* ══ a very small matrix library ══════════════════════════════════════════════════════════════ */
    function mIdent(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
    function mMul(a,b){ const o=new Float32Array(16);
      for(let i=0;i<4;i++) for(let j=0;j<4;j++){ let s=0; for(let k=0;k<4;k++) s+=a[k*4+j]*b[i*4+k]; o[i*4+j]=s; }
      return o; }
    function mPersp(fovy,aspect,near,far){ const f=1/Math.tan(fovy/2), o=new Float32Array(16);
      o[0]=f/aspect; o[5]=f; o[10]=(far+near)/(near-far); o[11]=-1; o[14]=2*far*near/(near-far); return o; }
    function mLook(e,c,u){
      const z=norm([e[0]-c[0],e[1]-c[1],e[2]-c[2]]);
      const x=norm(cross(u,z)), y=cross(z,x);
      return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
        -dot(x,e),-dot(y,e),-dot(z,e),1]);
    }
    function mTrans(x,y,z){ const o=mIdent(); o[12]=x; o[13]=y; o[14]=z; return o; }
    function mScale(s){ const o=mIdent(); o[0]=o[5]=o[10]=s; return o; }
    function mRotX(a){ const o=mIdent(), c=Math.cos(a), s=Math.sin(a); o[5]=c; o[6]=s; o[9]=-s; o[10]=c; return o; }
    function mRotY(a){ const o=mIdent(), c=Math.cos(a), s=Math.sin(a); o[0]=c; o[2]=-s; o[8]=s; o[10]=c; return o; }
    function mRotZ(a){ const o=mIdent(), c=Math.cos(a), s=Math.sin(a); o[0]=c; o[1]=s; o[4]=-s; o[5]=c; return o; }
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const norm=(a)=>{ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; };
    function mApply(m,v){ const x=v[0],y=v[1],z=v[2];
      return [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13],
              m[2]*x+m[6]*y+m[10]*z+m[14], m[3]*x+m[7]*y+m[11]*z+m[15]]; }

    /* ══ WebGL ════════════════════════════════════════════════════════════════════════════════════ */
    const VS_SPH=`attribute vec3 aP; attribute vec2 aUV; uniform mat4 uMVP, uM; varying vec2 vUV; varying vec3 vN;
      void main(){ vUV=aUV; vN=normalize((uM*vec4(aP,0.0)).xyz); gl_Position=uMVP*vec4(aP,1.0); }`;
    const FS_SPH=`precision mediump float; varying vec2 vUV; varying vec3 vN;
      uniform sampler2D uT; uniform vec3 uSun; uniform float uEmit, uAmb; uniform vec3 uTint;
      void main(){ vec4 c=texture2D(uT,vUV);
        float d=max(dot(normalize(vN),normalize(uSun)),0.0);
        float lit=uEmit+(1.0-uEmit)*(uAmb+(1.0-uAmb)*d);
        gl_FragColor=vec4(c.rgb*uTint*lit,1.0); }`;
    const VS_LINE=`attribute vec3 aP; uniform mat4 uMVP; void main(){ gl_Position=uMVP*vec4(aP,1.0); }`;
    const FS_LINE=`precision mediump float; uniform vec4 uC; void main(){ gl_FragColor=uC; }`;
    const VS_PT=`attribute vec3 aP; attribute vec4 aC; uniform mat4 uMVP; uniform float uSz;
      varying vec4 vC; void main(){ vC=aC; gl_Position=uMVP*vec4(aP,1.0); gl_PointSize=uSz*aC.a+0.6; }`;
    const FS_PT=`precision mediump float; varying vec4 vC;
      void main(){ vec2 d=gl_PointCoord-vec2(0.5); if(dot(d,d)>0.25) discard; gl_FragColor=vec4(vC.rgb,1.0); }`;

    function shader(type,src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)||'shader'); return s; }
    function program(vs,fs){ const p=gl.createProgram();
      gl.attachShader(p,shader(gl.VERTEX_SHADER,vs)); gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs));
      gl.linkProgram(p);
      if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)||'link');
      return p; }

    function buildSphere(nu,nv){
      const pos=[], uv=[], idx=[];
      for(let j=0;j<=nv;j++){ const v=j/nv, phi=(v-0.5)*Math.PI, cp=Math.cos(phi), sp=Math.sin(phi);
        for(let i=0;i<=nu;i++){ const u=i/nu, th=u*2*Math.PI;
          /* x towards longitude 0, z up: the texture's u = 0 is longitude −180 */
          pos.push(cp*Math.cos(th-Math.PI), cp*Math.sin(th-Math.PI), sp);
          uv.push(u,1-v); } }
      for(let j=0;j<nv;j++) for(let i=0;i<nu;i++){
        const a=j*(nu+1)+i, b=a+nu+1;
        idx.push(a,b,a+1, a+1,b,b+1); }
      const P=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,P); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(pos),gl.STATIC_DRAW);
      const U=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,U); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(uv),gl.STATIC_DRAW);
      const I=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,I); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),gl.STATIC_DRAW);
      return { P, U, I, n:idx.length };
    }
    function buildRing(){
      /* one annulus per real ring band, drawn as a triangle strip in the body's equatorial plane */
      const pos=[], uv=[], idx=[]; const S=96; let base=0;
      for(const [r0,r1] of RINGS){
        const a=r0/60268, b=r1/60268;                  /* in Saturn radii */
        for(let i=0;i<=S;i++){ const t=i/S*2*Math.PI, c=Math.cos(t), s=Math.sin(t);
          pos.push(a*c,a*s,0, b*c,b*s,0); uv.push(0,0, 1,0); }
        for(let i=0;i<S;i++){ const k=base+i*2; idx.push(k,k+1,k+2, k+1,k+3,k+2); }
        base+=(S+1)*2;
      }
      const P=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,P); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(pos),gl.STATIC_DRAW);
      const I=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,I); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(idx),gl.STATIC_DRAW);
      return { P, I, n:idx.length, alpha:RINGS.map(r=>r[2]) };
    }

    /* ⚠ PLUTO HAS NO BUNDLED SURFACE, ON PURPOSE. The texture set this app ships (see
       scripts/build-planet-data.mjs) has no Pluto, and the ones that are offered elsewhere in that set
       for the dwarf planets are labelled "fictional" by their own author. New Horizons photographed
       the real thing, so a made-up Pluto is not a gap to be filled with an invention — it is drawn in
       its measured colour and the panel says why. Its POSITION and its 73 IAU-approved feature names
       are as real as everything else here. */
    const NO_TEXTURE={ pluto:1 };
    /* ══ ⚠ (#R203) THE EARTH HERE IS THE APP'S OWN EARTH, NOT A SECOND ONE ═══════════════════════════
       「そもそも、宇宙を探索専用に別の地球を作るな。そんな指示はしていない。勝手に別の地球に差し替えるな。」

       It was. `data/planets/earth.jpg` was a 463 KB picture of the Earth that existed for this file
       and for nothing else, while the app already ships one — data/world-basemap.jpg, the NASA Blue
       Marble equirectangular that js/world-base.js draws UNDER the satellite tiles and that
       js/cesium-engine.js uses for the polar caps. Two pictures of the same planet is exactly the
       complaint, so there is now one, and js/world-base.js owns its URL.

       ⚠ AND THE FIRST ANSWER WAS SUPPOSED TO BE THAT THERE IS NO SPHERE HERE AT ALL — the map's own
       globe, still drawn by MapLibre, simply getting smaller as the camera pulls further out. THAT IS
       MEASURED NOT TO BE AVAILABLE. MapLibre accepts `setMinZoom(-2)` and the transform follows it
       (worldSize 512 → 256 → 128, the projected radius 77 → 40 → 20 px), but it DRAWS NOTHING below
       zoom 0: sampled through a render tick at z −0.5 / −1 / −2 the canvas comes back [2,2,2] /
       [1,1,1] / [0,0,0] and the screenshot is the page background through a transparent canvas. Its
       tile pyramid has no level under 0 and the whole-Earth image floor is not drawn there either. So
       the sphere stays, and what changes is everything that made it read as a DIFFERENT Earth: the
       same picture, the same face, the same size across the crossing, in both directions. */
    function texUrl(id){
      if(id==='earth'){ try{ const W=window.IntMapWorldBase; if(W&&W.url) return W.url(); }catch(_){}
        try{ return new URL('data/world-basemap.jpg',document.baseURI).toString(); }catch(_){ return 'data/world-basemap.jpg'; } }
      try{ return new URL('data/planets/'+id+'.jpg',document.baseURI).toString(); }
      catch(_){ return 'data/planets/'+id+'.jpg'; } }
    /* Textures load ON DEMAND and one at a time per body: the whole set is 5.7 MB and a view of the
       whole system does not need any of them at more than a few pixels a body. */
    function texture(id){
      if(tex[id]) return tex[id];
      if(NO_TEXTURE[id]||texLoading[id]) return null;
      texLoading[id]=true;
      const im=new Image(); im.decoding='async'; im.crossOrigin='anonymous';
      im.onload=()=>{ try{
        const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,im);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.generateMipmap(gl.TEXTURE_2D);
        tex[id]=t;
      }catch(e){ lastErr='texture '+id+': '+((e&&e.message)||e); } texLoading[id]=false; };
      im.onerror=()=>{ texLoading[id]=false; lastErr='texture '+id+' failed to load'; };
      im.src=texUrl(id);
      return null;
    }
    /* a 1×1 stand-in in the body's own measured colour, so a body is never a hole while its texture
       is on the wire */
    const flat={};
    function flatTex(id){
      if(flat[id]) return flat[id];
      const b=EPH().body(id), c=(b&&b.colour)||'#888888';
      const r=parseInt(c.slice(1,3),16), g2=parseInt(c.slice(3,5),16), b2=parseInt(c.slice(5,7),16);
      const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([r,g2,b2]));
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      flat[id]=t; return t;
    }

    /* ── the real sky behind it all: the same Hipparcos catalogue js/space-sky.js draws (#R186) ─── */
    function loadStars(){
      if(starBuf||starBuf===false) return;
      starBuf=false;
      let url; try{ url=new URL('data/stars.bin',document.baseURI).toString(); }catch(_){ url='data/stars.bin'; }
      fetch(url).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.arrayBuffer(); }).then(buf=>{
        const dv=new DataView(buf); let magic=''; for(let i=0;i<7;i++) magic+=String.fromCharCode(dv.getUint8(i));
        /* (#R208) the stride comes from the magic — see js/space-sky.js. IMSTAR2 also carries the
           measured parallax, which is what lets this view leave the solar system: `starPc` below is
           the real distance in parsecs, and 0 means the catalogue has no usable parallax for that
           star (⚠ NOT "at the origin"). */
        if(magic!=='IMSTAR1'&&magic!=='IMSTAR2') throw new Error('bad catalogue header');
        const STRIDE=(magic==='IMSTAR2')?8:6;
        const n=dv.getUint32(8,true);
        const pos=new Float32Array(n*3), col=new Float32Array(n*4), pc=new Float32Array(n); let k=0;
        for(let i=0;i<n;i++){ const o=12+i*STRIDE;
          const ra=dv.getUint16(o,true)*360/65536*D2R, dec=dv.getInt16(o+2,true)*90/32767*D2R;
          const mag=dv.getUint8(o+4)/20-2;
          if(mag>6.5) continue;                      /* the naked-eye sky — 9,000 of the 99,000 */
          const cd=Math.cos(dec);
          pos[k*3]=cd*Math.cos(ra); pos[k*3+1]=cd*Math.sin(ra); pos[k*3+2]=Math.sin(dec);
          const bv=dv.getInt8(o+5)/50;
          const t=Math.max(-0.3,Math.min(1.8,bv));
          col[k*4]=Math.min(1,1.05-0.18*t); col[k*4+1]=Math.min(1,0.98-0.05*Math.abs(t-0.3));
          col[k*4+2]=Math.min(1,0.85+0.28*(0.4-t));
          col[k*4+3]=Math.max(0.12,Math.min(1,(6.6-mag)/6.2));
          /* parallax (mas × 10) → parsecs. 0 stays 0 and MEANS "not measured well enough". */
          const plx=(STRIDE===8)?dv.getUint16(o+6,true)/10:0;
          pc[k]=plx>0?(1000/plx):0;
          k++;
        }
        const P=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,P); gl.bufferData(gl.ARRAY_BUFFER,pos.subarray(0,k*3),gl.STATIC_DRAW);
        const C=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,C); gl.bufferData(gl.ARRAY_BUFFER,col.subarray(0,k*4),gl.STATIC_DRAW);
        starBuf={P,C}; starN=k; starPc=pc.subarray(0,k); starDir=pos.subarray(0,k*3);
      }).catch(e=>{ lastErr='stars: '+((e&&e.message)||e); });
    }
    /* ══ (#R208) THE STARS AS REAL POINTS, IN THE SCENE'S OWN DISTANCE MAPPING ═══════════════════
       One parsec is 206,264.806 AU (the definition: the distance at which 1 AU subtends 1 arcsec).
       The position goes through `posScale` — the SAME mapping the planets use — so true scale puts
       α Centauri at 276,000 units and model scale compresses it by the same power law that
       compresses Neptune's orbit. Using real AU here while the planets were compressed would put
       the whole solar system inside one pixel the moment model scale was selected.

       ⚠ THE STARS WITH NO USABLE PARALLAX GO AT THE FAR EDGE, AND THAT IS A LOWER BOUND RATHER
       THAN A GUESS. A parallax that Hipparcos could not measure to 2σ is the measurement "further
       away than this instrument resolves", so placing those stars at the distance of the furthest
       star that WAS measured states exactly that and no more (standing instruction 4). They are
       counted in the debug readout rather than blended in silently.

       Rebuilt when the scale changes, because the scale is what the positions are expressed in. */
    const AU_PER_PC=206264.806;
    let starFarBuf=null, starFarScale=null, starMaxPc=0, starFarUnknown=0;
    /* ⚠ (#R208) THE EDGE IS DERIVED FROM THE DATA AND THE CURRENT SCALE, NOT CACHED WITH THE BUFFER.
       Caching it alongside the positions looks equivalent and is not: `starField()` only rebuilds on
       the next DRAW, so between a `setScale()` and that frame the edge still described the other
       scale — and the edge is what the star pass's FAR CLIP PLANE is computed from. Caught by
       tests/smoke.spec.js ⑧, which read 80,729 (a model-scale figure) where true scale had to be
       past 276,000. `starMaxPc` is the measurement; the mapping is applied when asked. */
    function starFarEdgeNow(){ return starMaxPc>0?posScale(starMaxPc*AU_PER_PC):1e5; }
    function starField(){
      if(!starPc||!starDir||!starN) return null;
      if(!starMaxPc){ for(let i=0;i<starN;i++) if(starPc[i]>starMaxPc) starMaxPc=starPc[i]; }
      if(!(starMaxPc>0)) return null;
      if(starFarBuf&&starFarScale===scale) return starFarBuf;
      const p=new Float32Array(starN*3); let unknown=0;
      for(let i=0;i<starN;i++){
        const pc=starPc[i]>0?starPc[i]:(unknown++,starMaxPc);
        const u=posScale(pc*AU_PER_PC);
        p[i*3]=starDir[i*3]*u; p[i*3+1]=starDir[i*3+1]*u; p[i*3+2]=starDir[i*3+2]*u;
      }
      if(starFarBuf&&starFarBuf.P) try{ gl.deleteBuffer(starFarBuf.P); }catch(_){}
      const P=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,P); gl.bufferData(gl.ARRAY_BUFFER,p,gl.STATIC_DRAW);
      starFarBuf={P,C:starBuf.C}; starFarScale=scale; starFarUnknown=unknown;
      return starFarBuf;
    }

    function loadNames(){
      if(names||namesLoading) return;
      namesLoading=true;
      let url; try{ url=new URL('data/planet-names.json',document.baseURI).toString(); }catch(_){ url='data/planet-names.json'; }
      fetch(url).then(r=>r.json()).then(j=>{ names=j; namesLoading=false; })
        .catch(e=>{ namesLoading=false; lastErr='names: '+((e&&e.message)||e); });
    }

    /* ══ positions ════════════════════════════════════════════════════════════════════════════════
       Heliocentric ecliptic J2000, in AU, straight from js/ephemeris.js — no interpolation, no cache:
       the series is a closed form and evaluating eleven of them is microseconds. */
    function positions(jd){
      const E=EPH(), out={ sun:[0,0,0] };
      for(const id of E.bodies()){ const p=E.heliocentric(id,jd); out[id]=[p.x,p.y,p.z]; }
      const m=E.moonGeocentric(jd), r=m.distKm/AU;
      const lo=(m.lonDeg-E.precessLonDeg(jd))*D2R, la=m.latDeg*D2R;   /* back to J2000, where the planets are */
      out.moon=[out.earth[0]+r*Math.cos(la)*Math.cos(lo), out.earth[1]+r*Math.cos(la)*Math.sin(lo), out.earth[2]+r*Math.sin(la)];
      /* (#R203) …and the SAME offset kept as itself, because model scale has to compress it as a
         geocentric distance rather than as a heliocentric one — see moonSep(). */
      out._moonGeo=[Math.cos(la)*Math.cos(lo),Math.cos(la)*Math.sin(lo),Math.sin(la)];
      out._moonKm=m.distKm;
      return out;
    }

    /* ══ the scene ════════════════════════════════════════════════════════════════════════════════ */
    function resize(){
      dpr=Math.min(2,(window.devicePixelRatio||1));
      const w=root.clientWidth, h=root.clientHeight;
      W=Math.max(1,Math.round(w*dpr)); H=Math.max(1,Math.round(h*dpr));
      if(cv.width!==W||cv.height!==H){ cv.width=W; cv.height=H; }
      if(ov.width!==W||ov.height!==H){ ov.width=W; ov.height=H; }
      cv.style.width=ov.style.width=w+'px'; cv.style.height=ov.style.height=h+'px';
    }

    /* ══ (#R208) THE AXIS DOES NOT JUMP AT THE HANDOVER ═══════════════════════════════════════════
       「地球↔宇宙の地軸の傾きの連続性」. The map draws the Earth with NORTH UP — MapLibre's globe puts
       the spin axis vertical on screen at bearing 0 — and this view had its up-vector hard-wired to
       [0,0,1], the ECLIPTIC north. Those differ by the obliquity, 23.44°, so the instant the crossing
       handed over, the Earth rolled by up to that much in one frame. #R203 matched the face, the size
       and the instant across that seam and this was the one thing left that did not match.

       ⚠ AND IT CANNOT SIMPLY USE THE EARTH'S AXIS EITHER, because the solar system is a picture OF
       THE ECLIPTIC: with the Earth's pole up, every planet's orbit would sit at a permanent 23°
       slant. So the up-vector is INTERPOLATED between the two — the Earth's own axis while the Earth
       still fills the view (which is where the map left off), the ecliptic once the system is what is
       on screen — and the blend is driven by the Earth's own APPARENT SIZE, so it is the same gesture
       that carries it. Nothing snaps; the tilt arrives as you pull away, which is what it looks like
       from a departing spacecraft.

       ⚠⚠ AND THE UPPER KNEE IS A RELATION, NOT A NUMBER (#R198's lesson, learned again here). The
       first two attempts wrote the knee as a fraction of the VIEWPORT HALF-HEIGHT — 0.55, then 0.28
       "measured at the handover". Both are wrong for the same reason, and measuring four viewports
       is what showed it: the map's globe at its minimum zoom is ~89 CSS px WHATEVER the window is
       (it is 2^minZoom worlds wide, and a world is a constant), so the same 89 px is 0.247 of a
       720-tall window, 0.212 of a phone and 0.177 of a tablet. One literal cannot be the handover on
       all three, and it was not — the blend arrived at 0.85 / 0.69 / 0.53, leaving 3.5° / 7.2° /
       11.0° of roll at the seam on the three shapes of screen:

           viewport      map globe r   r/(H/2)   blend at the handover   residual roll
           1280 × 720      88.9 px      0.247          0.850                3.5°
            390 × 844      89.7 px      0.212          0.693                7.2°
            768 × 1024     90.4 px      0.177          0.530               11.0°

       So the ratio is taken against `handoverRadiusPx()` — the size the crossing itself is defined
       at, and the same quantity `atNearLimit()` already tests. At the handover the ratio is 1 BY
       CONSTRUCTION on every screen, and no measurement can drift away from it. */
    const AXIS_LOW = 0.2;      /* …and the ecliptic has taken over once the Earth is a fifth of that */
    /* the handover size is a property of the CROSSING, not of the frame: the map cannot change its
       minimum zoom while this view is up, so it is read when the view opens and held. Re-reading it
       per frame would also mean a transient 0 (a renderer between styles) snapping the camera. */
    let handoverPx = 0;
    function axisRefPx(){
      if(!(handoverPx > 0)){ try{ handoverPx = handoverRadiusPx() || 0; }catch(_){ handoverPx = 0; } }
      return handoverPx;
    }
    function axisBlend(){
      /* 1 = the map's frame (the Earth's axis up), 0 = the ecliptic. ⚠ only while the EARTH is the
         subject — focus Mars and the map's frame is not what the picture is of (#R207's rule). */
      if(!earthIsSubject()) return 0;
      const ref = axisRefPx(); if(!(ref > 0)) return 0;
      let r = 0;
      try{ r = earthRadiusPx(); }catch(_){ return 0; }
      if(!isFinite(r) || r <= 0) return 0;
      const t = (r / ref - AXIS_LOW) / (1 - AXIS_LOW);
      return Math.max(0, Math.min(1, t));
    }
    /* ── the map's own roll, so the seam matches a ROTATED map too ──────────────────────────────
       Everything above assumes the map draws north straight up, which is only true at bearing 0.
       MEASURED (tests/r203.spec.js ③ asserts it): the map's globe puts north at exactly −bearing from
       screen up, so a map at bearing 40 wants the Earth's pole 40° anticlockwise of vertical here as
       well. Measured seam error with this in: 0.000° at bearing 0, 40 and −70, on four viewports.
       Captured at the crossing for the same reason as `handoverPx`. */
    let mapRollDeg = 0;
    function captureMapFrame(){
      handoverPx = 0; mapRollDeg = 0;
      try{ handoverPx = handoverRadiusPx() || 0; }catch(_){}
      try{ const b = GE().camera.get(); if(b && isFinite(b.bearing)) mapRollDeg = -b.bearing; }catch(_){}
    }
    /* the pole, rolled in the screen plane by `mapRollDeg`. Derivation: with P the pole and z the
       view axis (both unit, P made ⊥ z), R0 = P × z is screen-right when P is up, and
       up = P·cos a − R0·sin a lands the pole at exactly +a from screen up. */
    function mapFrameUp(z){
      let p = null;
      try{ p = EPH().poleVector('earth', jdNow()); }catch(_){}
      if(!p) return null;
      const d = p[0]*z[0] + p[1]*z[1] + p[2]*z[2];
      const P = [p[0]-d*z[0], p[1]-d*z[1], p[2]-d*z[2]];
      const m = Math.hypot(P[0],P[1],P[2]); if(!(m > 1e-9)) return null;
      P[0]/=m; P[1]/=m; P[2]/=m;
      const a = mapRollDeg*D2R, ca = Math.cos(a), sa = Math.sin(a);
      const R0 = [P[1]*z[2]-P[2]*z[1], P[2]*z[0]-P[0]*z[2], P[0]*z[1]-P[1]*z[0]];
      return [P[0]*ca-R0[0]*sa, P[1]*ca-R0[1]*sa, P[2]*ca-R0[2]*sa];
    }
    function upVector(){
      const t = axisBlend();
      if(t <= 0) return [0,0,1];
      const ce=Math.cos(el), se=Math.sin(el);
      const z = norm([dist*ce*Math.cos(az), dist*ce*Math.sin(az), dist*se]);   /* eye − origin */
      const f = mapFrameUp(z);
      if(!f) return [0,0,1];
      const u = [ f[0]*t, f[1]*t, f[2]*t + (1-t) ];
      const n = Math.hypot(u[0],u[1],u[2]) || 1;
      return [u[0]/n, u[1]/n, u[2]/n];
    }
    /* what the picture actually shows: the screen angle of the Earth's north, clockwise from straight
       up, in degrees. The map's equivalent is −bearing, so a test can put ONE number either side of
       the seam instead of asserting the mechanism (#R187: the subjective report is measurable). */
    function northRollDeg(){
      let p = null;
      try{ p = EPH().poleVector('earth', jdNow()); }catch(_){ return null; }
      if(!p) return null;
      const ce=Math.cos(el), se=Math.sin(el);
      const z = norm([dist*ce*Math.cos(az), dist*ce*Math.sin(az), dist*se]);
      const u = upVector();
      const R = norm(cross(u,z)), Y = cross(z,R);
      const d = dot(p,z), P = norm([p[0]-d*z[0], p[1]-d*z[1], p[2]-d*z[2]]);
      return Math.atan2(dot(P,R), dot(P,Y))/D2R;
    }

    function camera(){
      const ce=Math.cos(el), se=Math.sin(el);
      const eye=[dist*ce*Math.cos(az), dist*ce*Math.sin(az), dist*se];
      const P=mPersp(45*D2R, W/Math.max(1,H), Math.max(1e-7,dist*1e-4), Math.max(10,dist*2000));
      const V=mLook(eye,[0,0,0],upVector());
      return { P, V, VP:mMul(P,V), eye };
    }

    function drawSphere(mvp,model,texId,sun,emit,tint){
      gl.useProgram(prog);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog,'uMVP'),false,mvp);
      gl.uniformMatrix4fv(gl.getUniformLocation(prog,'uM'),false,model);
      gl.uniform3fv(gl.getUniformLocation(prog,'uSun'),new Float32Array(sun));
      gl.uniform1f(gl.getUniformLocation(prog,'uEmit'),emit);
      gl.uniform1f(gl.getUniformLocation(prog,'uAmb'),0.06);
      gl.uniform3fv(gl.getUniformLocation(prog,'uTint'),new Float32Array(tint||[1,1,1]));
      const t=texture(texId)||flatTex(texId);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,t);
      gl.uniform1i(gl.getUniformLocation(prog,'uT'),0);
      const aP=gl.getAttribLocation(prog,'aP'), aUV=gl.getAttribLocation(prog,'aUV');
      gl.bindBuffer(gl.ARRAY_BUFFER,sphere.P); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,sphere.U); gl.enableVertexAttribArray(aUV); gl.vertexAttribPointer(aUV,2,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,sphere.I);
      gl.drawElements(gl.TRIANGLES,sphere.n,gl.UNSIGNED_SHORT,0);
    }
    function drawLines(mvp,buf,count,colour,mode2){
      gl.useProgram(progLine);
      gl.uniformMatrix4fv(gl.getUniformLocation(progLine,'uMVP'),false,mvp);
      gl.uniform4fv(gl.getUniformLocation(progLine,'uC'),new Float32Array(colour));
      const aP=gl.getAttribLocation(progLine,'aP');
      gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP,3,gl.FLOAT,false,0,0);
      gl.drawArrays(mode2||gl.LINE_STRIP,0,count);
    }

    /* the orbit of a body, sampled over one full period of its own mean longitude */
    const orbitCache={};
    function orbitBuf(id,jd){
      const key=id+'|'+scale+'|'+Math.round(jd/3650);
      if(orbitCache[key]) return orbitCache[key];
      const E=EPH(), P=E.periodDays(id)||365, N=256, a=new Float32Array((N+1)*3);
      for(let i=0;i<=N;i++){ const p=E.heliocentric(id,jd+P*i/N);
        const r=Math.sqrt(p.x*p.x+p.y*p.y+p.z*p.z), s=posScale(r)/(r||1);
        a[i*3]=p.x*s; a[i*3+1]=p.y*s; a[i*3+2]=p.z*s; }
      const B=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,B); gl.bufferData(gl.ARRAY_BUFFER,a,gl.STATIC_DRAW);
      for(const k of Object.keys(orbitCache)) if(k.indexOf(id+'|')===0) { gl.deleteBuffer(orbitCache[k].B); delete orbitCache[k]; }
      orbitCache[key]={B,n:N+1}; return orbitCache[key];
    }
    /* (#R207) the Moon's line, in the frame the Moon is actually DRAWN in — geocentric, separated by
       the same `moonSep()` the body uses, then offset by the Earth's own scene position. Rebuilt each
       27-day bucket (its period), because unlike a planet's this curve MOVES with the Earth. */
    function moonOrbitBuf(jd){
      try{
        const E=EPH(), P=E.periodDays('moon')||27.32, N=128;
        const key='moon|'+scale+'|'+Math.round(jd/(P/8));
        if(orbitCache[key]) return orbitCache[key];
        const a=new Float32Array((N+1)*3);
        for(let i=0;i<=N;i++){
          const t=jd+P*i/N, p=positions(t);
          const v=scenePos(p,'moon',[0,0,0]);
          a[i*3]=v[0]; a[i*3+1]=v[1]; a[i*3+2]=v[2];
        }
        const B=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,B); gl.bufferData(gl.ARRAY_BUFFER,a,gl.STATIC_DRAW);
        for(const k of Object.keys(orbitCache)) if(k.indexOf('moon|')===0&&k!==key){ gl.deleteBuffer(orbitCache[k].B); delete orbitCache[k]; }
        orbitCache[key]={B,n:N+1}; return orbitCache[key];
      }catch(_){ return null; }
    }

    /* the body's own axes, as a rotation matrix from body coordinates into the J2000 ecliptic frame
       the orbits live in — the real pole and the real prime meridian (js/ephemeris.js bodyBasis) */
    function basis(id,jd){
      const b=EPH().bodyBasis(id,jd);
      if(!b) return mIdent();
      return new Float32Array([b.x[0],b.x[1],b.x[2],0, b.y[0],b.y[1],b.y[2],0, b.z[0],b.z[1],b.z[2],0, 0,0,0,1]);
    }
    function scenePos(pos,id,centre){
      /* (#R203) the Moon is placed relative to the EARTH — see moonSep() for why it has to be */
      if(id==='moon'&&pos._moonGeo&&isFinite(pos._moonKm)){
        const e=scenePos(pos,'earth',[0,0,0]), g=pos._moonGeo, d=moonSep(pos._moonKm);
        return [e[0]+g[0]*d-centre[0], e[1]+g[1]*d-centre[1], e[2]+g[2]*d-centre[2]];
      }
      const p=pos[id]; const r=Math.hypot(p[0],p[1],p[2]);
      const s=r>0?posScale(r)/r:0;
      const v=[p[0]*s,p[1]*s,p[2]*s];
      return [v[0]-centre[0],v[1]-centre[1],v[2]-centre[2]];
    }

    function render(){
      raf=0; if(!open||!gl) return;
      resize();
      gl.viewport(0,0,W,H);
      gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      const jd=jdNow(), E=EPH(), pos=positions(jd);
      const cam=camera();
      octx.setTransform(1,0,0,1,0,0); octx.clearRect(0,0,W,H);
      const labels=[];

      /* ══ (#R208) THE STARS ARE WHERE THEY ARE, NOT ON A SHELL ═══════════════════════════════════
         「太陽系外のはるか遠くまでズームアウト」. #R186 put the stars on a sphere of radius
         `max(dist*400, 1e5)` and rotated it — the standard trick for a sky, and it is exactly what
         makes leaving the solar system impossible: every star stays the same angular distance from
         every other one however far the camera travels, so flying outwards shows nothing new.

         With IMSTAR2 the catalogue carries the measured parallax, so each star can go at its real
         distance and the perspective divide does the rest. ⚠ AND NOTHING IS LOST CLOSE IN: α
         Centauri is 276,000 AU away, so at a camera distance of 70 AU its parallax is 0.015° — a
         fifth of a pixel. The shell was never doing anything the real geometry does not do; it was
         working around the FAR CLIP PLANE, which `camera()` sets at `dist*2000` for the planets.
         So the stars get their own projection with a far plane that reaches them, drawn first with
         depth writes off exactly as before. */
      if(starBuf&&starN){
        gl.depthMask(false);
        const far=Math.max(dist*400,1e5);
        const fb=starField();
        const M=fb ? mMul(mMul(mPersp(45*D2R, W/Math.max(1,H), Math.max(1e-7,dist*1e-4),
                                      Math.max(dist*2000, starFarEdgeNow()*1.2)), cam.V), mIdent())
                   : mMul(cam.VP,mScale(far));
        gl.useProgram(progPts);
        gl.uniformMatrix4fv(gl.getUniformLocation(progPts,'uMVP'),false,M);
        gl.uniform1f(gl.getUniformLocation(progPts,'uSz'),2.2*dpr);
        const aP=gl.getAttribLocation(progPts,'aP'), aC=gl.getAttribLocation(progPts,'aC');
        gl.bindBuffer(gl.ARRAY_BUFFER,(starField()||starBuf).P); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP,3,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ARRAY_BUFFER,starBuf.C); gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC,4,gl.FLOAT,false,0,0);
        gl.drawArrays(gl.POINTS,0,starN);
        gl.depthMask(true);
      }

      if(mode==='system'){
        const centre=(focus&&focus!=='sun')?scenePos(pos,focus,[0,0,0]):[0,0,0];
        const VP=mMul(cam.P,mMul(cam.V,mIdent()));
        /* orbits first, so a body is never hidden behind its own line */
        if(showOrbits){                                            /* (#R207) */
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        for(const id of E.bodies()){
          /* ══ (#R207) THE MOON'S LINE WAS ITS HELIOCENTRIC PATH ═══════════════════════════════════
             「天体が描かれた軌道から微妙に外れた挙動だから、グラフィック的に不自然。」
             #R203 moved the Moon's POSITION to be measured about the Earth (see scenePos / moonSep —
             compressing its heliocentric distance had put it inside the Earth) and left this loop
             alone, so its ORBIT stayed the 1-AU heliocentric curve: the body sits beside the Earth
             while its line is a circle round the Sun. The line is drawn where the body is by using
             the same placement function that puts the body there — one owner for "where is it",
             which is the only way the two can agree. */
          const o=(id==='moon')?moonOrbitBuf(jd):orbitBuf(id,jd);
          if(!o) continue;
          const M=mMul(VP,mTrans(-centre[0],-centre[1],-centre[2]));
          drawLines(M,o.B,o.n,[0.42,0.55,0.78,id===focus?0.75:0.32]);
        }
        gl.depthMask(true); gl.disable(gl.BLEND);
        }
        const sunScene=[-centre[0],-centre[1],-centre[2]];
        for(const id of BODIES){
          const b=E.body(id); if(!b) continue;
          const p=scenePos(pos,id,centre);
          const R=radScale(b.rKm);
          const sun=(id==='sun')?[0,0,1]:norm([sunScene[0]-p[0],sunScene[1]-p[1],sunScene[2]-p[2]]);
          const model=mMul(mTrans(p[0],p[1],p[2]),mMul(basis(id,jd),mScale(R)));
          drawSphere(mMul(VP,model),model,id,sun,id==='sun'?1:0,null);
          if(id==='saturn') drawRings(VP,p,b,R,jd);
          /* where it lands on screen, for the label and for the pick */
          const c=mApply(mMul(cam.P,cam.V),p);
          if(c[3]>0){ const sx=(c[0]/c[3]*0.5+0.5)*W, sy=(1-(c[1]/c[3]*0.5+0.5))*H;
            const px=R/ (dist) * H / (2*Math.tan(45*D2R/2));
            labels.push({ id, x:sx, y:sy, px, name:bodyName(id) }); }
        }
        drawSystemLabels(labels);
      } else {
        drawBody(jd,pos,cam);
      }

      /* ⚠ THE PIXEL READBACK HAPPENS HERE, INSIDE THE FRAME. The context is created without
         `preserveDrawingBuffer` (it costs a copy every frame and nothing in the app needs it), so
         reading the canvas from outside the draw returns a cleared buffer — a test that did that
         would report a black screen for a scene that is fine. The sample is taken while the frame is
         still current, which is the only moment it means anything. */
      if(sampleReq){ const q=sampleReq; sampleReq=null;
        const w=Math.min(q.w,W), h=Math.min(q.h,H), buf=new Uint8Array(w*h*4);
        try{ gl.readPixels((W-w)>>1,(H-h)>>1,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf); }catch(_){}
        let lit=0, max=0;
        for(let i=0;i<buf.length;i+=4){ const v=Math.max(buf[i],buf[i+1],buf[i+2]);
          if(v>24) lit++; if(v>max) max=v; }
        try{ q.res({ lit, max, total:w*h }); }catch(_){}
      }
      /* fps, measured rather than assumed */
      frames++;
      const t=performance.now();
      if(t-lastFpsAt>800){ fps=Math.round(frames*1000/(t-lastFpsAt)); frames=0; lastFpsAt=t; refreshHUD(); }
      if(playing||live) tickTime();
      raf=requestAnimationFrame(render);
    }

    function drawRings(VP,p,b,R,jd){
      if(!ring) return;
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      /* the rings lie in Saturn's own equatorial plane, which is what makes them open and close as
         Saturn goes round — the same basis the globe is drawn with, so they cannot disagree */
      const model=mMul(mTrans(p[0],p[1],p[2]),mMul(basis('saturn',jd),mScale(R)));
      gl.useProgram(progLine);
      gl.uniformMatrix4fv(gl.getUniformLocation(progLine,'uMVP'),false,mMul(VP,model));
      const aP=gl.getAttribLocation(progLine,'aP');
      gl.bindBuffer(gl.ARRAY_BUFFER,ring.P); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ring.I);
      const per=ring.n/RINGS.length;
      for(let i=0;i<RINGS.length;i++){
        gl.uniform4fv(gl.getUniformLocation(progLine,'uC'),new Float32Array([0.88,0.82,0.68,ring.alpha[i]]));
        gl.drawElements(gl.TRIANGLES,per,gl.UNSIGNED_SHORT,i*per*2);
      }
      gl.depthMask(true); gl.disable(gl.BLEND);
    }

    function drawSystemLabels(list){
      octx.font=Math.round(12*dpr)+'px system-ui, sans-serif';
      octx.textBaseline='middle';
      const placed=[];
      list.sort((a,b)=>b.px-a.px);
      for(const l of list){
        const w=octx.measureText(l.name).width, h=15*dpr;
        const x=l.x+Math.max(6*dpr,l.px+4*dpr), y=l.y;
        let hit=false;
        for(const p of placed) if(x<p.x+p.w+4*dpr&&x+w>p.x-4*dpr&&y<p.y+p.h&&y+h>p.y){ hit=true; break; }
        if(hit) continue;
        placed.push({x,y:y-h/2,w,h});
        /* a body smaller than a pixel still gets a mark, or true scale would be an empty screen */
        if(l.px<1.5){ octx.fillStyle='rgba(255,255,255,0.85)';
          octx.beginPath(); octx.arc(l.x,l.y,1.6*dpr,0,6.284); octx.fill(); }
        octx.fillStyle=(l.id===focus)?'#ffd23f':'rgba(255,255,255,0.86)';
        octx.fillText(l.name,x,y);
      }
    }

    /* ══ a body, as a globe ═══════════════════════════════════════════════════════════════════════ */
    /* ══ (#R208) THE OTHER PLANETS' MOONS — FROM REAL ELEMENTS AT A REAL EPOCH ═══════════════════
       「他の惑星にも衛星（各惑星選択時にその衛星たち）」. #R197 declined to place them and wrote down
       why: without the mean longitude at an epoch, a moon at a plausible distance and a chosen angle
       is a drawing. data/moons.json is JPL's own mean-element table (scripts/build-moons.mjs) — a,
       e, ω, M, i, node and P for 177 satellites at 2000-01-01.5 TDB — so each one is propagated to
       the clock and its position is an answer rather than an arrangement.

       ⚠ AND THE ELEMENTS ARE NOT ALL IN THE SAME PLANE. Each row states its own frame: the ecliptic
       for the distant irregulars, and for a close giant-planet satellite that planet's LOCAL LAPLACE
       PLANE, whose pole the table gives as R.A./Dec. Reading a Laplace i/node as ecliptic would tilt
       Io's orbit by tens of degrees. The build carries the frame through and it is applied here. */
    const OBLIQ=23.4392911*D2R;
    let moons=null, moonsLoading=false, moonsErr=null;
    function loadMoons(){
      if(moons||moonsLoading) return;
      moonsLoading=true;
      let url; try{ url=new URL('data/moons.json',document.baseURI).toString(); }catch(_){ url='data/moons.json'; }
      fetch(url).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(d=>{ moons=d; moonsLoading=false; })
        .catch(e=>{ moons={planets:{}}; moonsLoading=false; moonsErr=(e&&e.message)||String(e); });
    }
    /** a satellite's position at `jd`, in PLANET RADII, in the J2000 ecliptic frame the scene uses */
    function moonPos(m,jd,planetRadiusKm){
      const E=EPH();
      const n=360/m.periodDays;                                  /* the table's own period, not a derived one */
      const M=m.mDeg+n*(jd-2451545.0);                           /* epoch is J2000 for every row */
      const ecc=E.kepler(M,m.e);
      const cE=Math.cos(ecc*D2R), sE=Math.sin(ecc*D2R);
      const a=m.aKm/planetRadiusKm;
      /* in the orbital plane, periapsis on +x */
      const xv=a*(cE-m.e), yv=a*Math.sqrt(Math.max(0,1-m.e*m.e))*sE;
      /* → the reference plane: Rz(node) · Rx(i) · Rz(ω) */
      const w=m.wDeg*D2R, i=m.iDeg*D2R, O=m.nodeDeg*D2R;
      const cw=Math.cos(w), sw=Math.sin(w), ci=Math.cos(i), si=Math.sin(i), cO=Math.cos(O), sO=Math.sin(O);
      const x1=xv*cw-yv*sw, y1=xv*sw+yv*cw;
      let X=x1*cO-y1*ci*sO, Y=x1*sO+y1*ci*cO, Z=y1*si;
      if(m.frame==='laplace'&&m.poleRaDeg!=null){
        /* the Laplace plane, expressed in J2000 EQUATORIAL: its ascending node on the equator is at
           R.A.+90° and its inclination to the equator is 90°−Dec. */
        const Op=(m.poleRaDeg+90)*D2R, ip=(90-m.poleDecDeg)*D2R;
        const cp=Math.cos(ip), sp=Math.sin(ip), co=Math.cos(Op), so=Math.sin(Op);
        const ex=X*co-Y*cp*so+Z*sp*so, ey=X*so+Y*cp*co-Z*sp*co, ez=Y*sp+Z*cp;
        /* …and equatorial → ecliptic, which is the frame js/ephemeris.js hands the scene */
        X=ex; Y=ey*Math.cos(OBLIQ)+ez*Math.sin(OBLIQ); Z=-ey*Math.sin(OBLIQ)+ez*Math.cos(OBLIQ);
      }
      return [X,Y,Z];
    }
    function moonList(){
      if(!moons||!moons.planets) return [];
      const all=moons.planets[focus]||[];
      /* the ones with a MEASURED radius first (they are the ones anybody means by "the moons of
         Jupiter"), then by distance; capped so a crowded system stays readable */
      return all.slice().sort((a,b)=>(b.rKm||0)-(a.radiusKm||0)).slice(0,12);
    }

    function drawBody(jd,pos,cam){
      const E=EPH(), b=E.body(focus); if(!b) return;
      /* the Sun's direction as seen from this body, in the J2000 ecliptic frame the basis is in — so
         the terminator on the globe is the real one for the instant on the clock */
      const p=pos[focus]||[0,0,0];
      const sun=norm([-p[0],-p[1],-p[2]]);
      const model=basis(focus,jd);
      const VP=mMul(cam.P,cam.V);
      drawSphere(mMul(VP,model),model,focus,focus==='sun'?[0,0,1]:sun,focus==='sun'?1:0,null);
      if(focus==='saturn') drawRings(VP,[0,0,0],b,1,jd);
      drawFeatureLabels(model,VP,cam);
      /* (#R208) …and the satellites of whichever planet this is */
      loadMoons();
      const list=moonList();
      if(list.length&&b.rKm){
        for(const m of list){
          const P0=moonPos(m,jd,b.rKm);
          /* the orbit, one revolution either side of now — drawn from the SAME propagation as the
             body, so the dot is always on its own line (#R207's lesson about the Moon's track) */
          const pts=[];
          for(let k=0;k<=96;k++) pts.push(moonPos(m,jd+m.periodDays*(k/96-0.5),b.rKm));
          const buf=gl.createBuffer(); const fa=new Float32Array(pts.length*3);
          pts.forEach((p,k)=>{ fa[k*3]=p[0]; fa[k*3+1]=p[1]; fa[k*3+2]=p[2]; });
          gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,fa,gl.STREAM_DRAW);
          drawLines(VP,buf,pts.length,[0.55,0.68,0.92,0.30]);
          try{ gl.deleteBuffer(buf); }catch(_){}
          /* the body itself, at its own measured radius where the table has one. ⚠ A moon with no
             published radius is drawn at a FLOOR size, not at a guessed one — the table says which
             is which and the panel can too. */
          const rr=m.radiusKm?Math.max(0.004,m.radiusKm/b.rKm):0.006;
          drawSphere(mMul(VP,mMul(mTrans(P0[0],P0[1],P0[2]),mScale(rr))),mIdent(),'moonlet',sun,0,[0.78,0.78,0.74]);
          if(showNames){
            const c=mApply(VP,P0);
            if(c[3]>0){
              const x=(c[0]/c[3]*0.5+0.5)*W, y=(1-(c[1]/c[3]*0.5+0.5))*H;
              if(x>=0&&y>=0&&x<=W&&y<=H){
                octx.font=Math.round(11*dpr)+'px system-ui, sans-serif';
                octx.textBaseline='middle'; octx.textAlign='left';
                octx.lineWidth=2.4*dpr; octx.strokeStyle='rgba(0,0,0,0.72)';
                octx.strokeText(m.name,x+6*dpr,y);
                octx.fillStyle='rgba(226,236,255,0.95)';
                octx.fillText(m.name,x+6*dpr,y);
              }
            }
          }
        }
      }
    }

    function drawFeatureLabels(model,VP,cam){
      if(!showNames) return;                    /* (#R207) 「各惑星の地名ラベルをオンオフできるように」 */
      if(!names||!names[focus]) return;
      const list=names[focus];
      const MVP=mMul(VP,model);
      const placed=[]; let shown=0;
      const max=Math.min(list.length, Math.round(24+380/Math.max(1.05,dist)));
      octx.font=Math.round(11*dpr)+'px system-ui, sans-serif';
      octx.textBaseline='middle'; octx.textAlign='left';
      for(let i=0;i<list.length&&shown<max;i++){
        const f=list[i];
        const la=f.lat*D2R, lo=f.lon*D2R;
        const v=[Math.cos(la)*Math.cos(lo),Math.cos(la)*Math.sin(lo),Math.sin(la)];
        /* the body itself hides its own far side: the surface normal must face the camera */
        const wv=mApply(model,v);
        const toEye=norm([cam.eye[0]-wv[0],cam.eye[1]-wv[1],cam.eye[2]-wv[2]]);
        if(dot(norm([wv[0],wv[1],wv[2]]),toEye)<0.12) continue;
        const c=mApply(MVP,v); if(!(c[3]>0)) continue;
        const x=(c[0]/c[3]*0.5+0.5)*W, y=(1-(c[1]/c[3]*0.5+0.5))*H;
        if(x<0||y<0||x>W||y>H) continue;
        const w=octx.measureText(f.n).width, h=14*dpr;
        let hit=false;
        for(const q of placed) if(x<q.x+q.w+5*dpr&&x+w+5*dpr>q.x&&y<q.y+q.h+2*dpr&&y+h>q.y){ hit=true; break; }
        if(hit) continue;
        placed.push({x:x+5*dpr,y:y-h/2,w,h});
        octx.fillStyle='rgba(255,255,255,0.55)';
        octx.beginPath(); octx.arc(x,y,1.5*dpr,0,6.284); octx.fill();
        octx.lineWidth=2.4*dpr; octx.strokeStyle='rgba(0,0,0,0.72)';
        octx.strokeText(f.n,x+5*dpr,y);
        octx.fillStyle='rgba(255,255,255,0.94)';
        octx.fillText(f.n,x+5*dpr,y);
        shown++;
      }
    }

    /* ══ time stepping ════════════════════════════════════════════════════════════════════════════ */
    function tickTime(){
      const t=performance.now();
      if(!lastTick){ lastTick=t; return; }
      const dtReal=Math.min(0.25,(t-lastTick)/1000); lastTick=t;
      if(!playing||live) return;
      timeMs=Math.max(MIN_MS,Math.min(MAX_MS,timeMs+rate*1000*dtReal));
      refreshClock();
    }

    /* ══ the HUD ══════════════════════════════════════════════════════════════════════════════════ */
    const BTN='padding:5px 9px;border-radius:8px;border:1px solid rgba(255,255,255,0.22);background:rgba(255,255,255,0.06);color:#f2f2f2;font-size:11.5px;cursor:pointer;';
    /* (#R202) one segment of a two-option switch; `.on` is added by refreshChrome() below. */
    const SEG='padding:5px 9px;border-radius:7px;border:none;background:transparent;color:rgba(255,255,255,0.62);font-size:11.5px;font-weight:600;cursor:pointer;';
    function fmtWhen(ms){
      const d=new Date(ms);
      if(!isFinite(+d)) return '—';
      const y=d.getUTCFullYear();
      const p=(n)=>String(n).padStart(2,'0');
      return (y<0?('BC '+(1-y)):y)+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate())+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes())+' UTC';
    }
    const RATES=[0,60,3600,86400,864000,2592000,31556952];
    function rateLabel(r){
      if(!r) return L('paused','停止','Pause','пауза','pausa');
      if(r<3600) return '×'+r;
      if(r<86400) return (r/3600)+' h/s';
      if(r<2592000) return (r/86400)+' d/s';
      if(r<31556952) return Math.round(r/86400)+' d/s';
      return '1 '+L('yr','年','J','г','a')+'/s';
    }
    /* ══ (#R202) ANY MULTIPLIER, NOT SEVEN OF THEM ═══════════════════════════════════════════════
       「時間進める速度の倍数は任意に変えられるように。また現在の状態に合わせられるLiveボタンを追加して。」

       `rate` has always been "simulated seconds per real second", i.e. the multiplier itself — ×1 is
       real time, ×86400 is a day a second. What was missing is a way to SAY a number: the only way in
       was ⏩, which walked a seven-rung ladder, and ⏪ — which read `RATES[i+1]` exactly as ⏩ did and
       then negated it, so it could not slow anything down and the speed could only ever go UP.
       So: ⏪ and ⏩ now step DOWN and UP the same ladder (keeping the direction), and the multiplier is
       also a plain field you can type into. Anything JS reads as a number is accepted — 2.5, 1e6, a
       negative one to run time backwards — clamped only by what the clock itself can hold. */
    const RATE_MAX=3.2e9;              /* ~100 yr/s: MIN_MS…MAX_MS crossed in a few minutes of real time */
    function parseRate(s){
      if(s==null) return null;
      const t=String(s).trim().replace(/^[×xX*]\s*/,'').replace(/,/g,'');
      if(!t) return null;
      const v=Number(t);
      if(!isFinite(v)) return null;
      return Math.max(-RATE_MAX,Math.min(RATE_MAX,v));
    }
    /* the rung above / below the current speed, sign preserved. step(+1) from ×0 starts at the slowest
       real rung rather than staying at zero, which is what "faster" means when you are paused. */
    function rateStep(dir){
      const sign=(rate<0)?-1:1, mag=Math.abs(rate);
      let i;
      if(dir>0){ i=RATES.findIndex(r=>r>mag+1e-9); if(i<0) i=RATES.length-1; }
      else { i=0; for(let k=RATES.length-1;k>=0;k--){ if(RATES[k]<mag-1e-9){ i=k; break; } } }
      return sign*RATES[i];
    }
    function hud(){
      return '<div class="sp-bar" style="position:absolute;left:0;right:0;top:0;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;background:linear-gradient(180deg,rgba(0,0,0,0.72),rgba(0,0,0,0));pointer-events:auto;">'
        +'<button class="sp-close" style="'+BTN+'">✕ '+L('Back to the map','地図へ戻る','Zur Karte','К карте','Al mapa')+'</button>'
        +'<button class="sp-mode" style="'+BTN+'">'+(mode==='system'?('🌍 '+L('View the body','天体を見る','Körper ansehen','Смотреть тело','Ver el cuerpo')):('🪐 '+L('Solar system','太陽系','Sonnensystem','Солнечная система','Sistema solar')))+'</button>'
        /* ══ (#R202) THE SCALE CONTROL SHOWS BOTH CHOICES ═════════════════════════════════════════
           「宇宙を探索で、実寸とモデル大に変えるボタンをもっとわかりやすくしろ。」
           It was ONE button carrying ONE label, and a lone label on a toggle is ambiguous by
           construction: 「実寸大」 could equally mean "you are in true scale" or "press for true
           scale", and the two readings are opposites. A two-segment switch cannot be misread — both
           options are on screen and the lit one is the state — and it is the same segmented control
           the phone's Map/Satellite uses, so it is not a new invention (#R148). */
        +'<span class="sp-seg" style="display:inline-flex;gap:2px;padding:2px;border-radius:9px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);">'
        /* (#R207) 「実寸大とモデル大には絵文字を付けるな。」 — the two segments carry their words only.
           They are the two halves of one state switch; a pictogram on each was decoration that made
           them look like two separate actions. */
        +'<button class="sp-scale" data-s="real" style="'+SEG+'">'+L('True scale','実寸大','Maßstabsgetreu','Реальный масштаб','Escala real')+'</button>'
        +'<button class="sp-scale" data-s="model" style="'+SEG+'">'+L('Model scale','モデル大','Modellmaßstab','Модельный масштаб','Escala modelo')+'</button>'
        +'</span>'
        /* (#R207) 「軌道をオンオフしたりできるように。また、各惑星の地名ラベルをオンオフできるように。」
           State switches, lit from the state by refreshChrome — same language as the scale segments. */
        +'<button class="sp-orbits" style="'+BTN+'">'+L('Orbits','軌道','Bahnen','Орбиты','Órbitas')+'</button>'
        +'<button class="sp-names" style="'+BTN+'">'+L('Place names','地名','Ortsnamen','Названия','Topónimos')+'</button>'
        +'<span style="flex:1 1 8px;"></span>'
        +'<span class="sp-clock" style="font-size:11.5px;color:#e8e8e8;font-variant-numeric:tabular-nums;"></span>'
        +'<button class="sp-live" style="'+BTN+'" title="'+S(L('Follow the app clock — the sky as it is right now','アプリの時計に合わせる（今この瞬間の空）','Der App-Uhr folgen — der Himmel wie er jetzt ist','Следовать часам приложения — небо прямо сейчас','Seguir el reloj de la app — el cielo de ahora mismo'))+'">● '+L('Live','ライブ','Live','Сейчас','En vivo')+'</button>'
        +'<button class="sp-back" style="'+BTN+'" title="'+S(L('Slower','遅く','Langsamer','Медленнее','Más lento'))+'">⏪</button>'
        +'<button class="sp-play" style="'+BTN+'">▶</button>'
        +'<button class="sp-fwd" style="'+BTN+'" title="'+S(L('Faster','速く','Schneller','Быстрее','Más rápido'))+'">⏩</button>'
        /* any multiplier, typed. `sp-ratev` is what it currently is, in the unit the ladder speaks. */
        +'<label class="sp-ratebox" style="display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:8px;border:1px solid rgba(255,255,255,0.22);background:rgba(255,255,255,0.06);color:#f2f2f2;font-size:11.5px;">'
        +'<span style="opacity:.72;">'+L('Speed','速度','Tempo','Скорость','Velocidad')+'</span>'
        +'<span>×</span><input class="sp-rate" type="text" inputmode="decimal" spellcheck="false" style="width:74px;background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.3);color:#fff;font-size:11.5px;font-variant-numeric:tabular-nums;padding:0 1px;">'
        +'<span class="sp-ratev" style="opacity:.72;white-space:nowrap;"></span></label>'
        +'<input class="sp-when" type="datetime-local" style="'+BTN+'font-size:11px;">'
        +'</div>'
        +'<div class="sp-side" style="position:absolute;left:10px;top:52px;width:190px;max-height:calc(100% - 130px);overflow:auto;display:flex;flex-direction:column;gap:3px;pointer-events:auto;"></div>'
        +'<div class="sp-info" style="position:absolute;right:10px;top:52px;width:min(280px,44vw);padding:9px 11px;border-radius:12px;background:rgba(12,12,16,0.78);border:1px solid rgba(255,255,255,0.14);color:#eee;font-size:11.5px;line-height:1.55;pointer-events:auto;"></div>'
        +'<div class="sp-note" style="position:absolute;left:10px;bottom:8px;right:10px;font-size:9.5px;color:rgba(255,255,255,0.55);line-height:1.45;pointer-events:none;"></div>';
    }
    function refreshClock(){
      if(!root) return;
      const c=root.querySelector('.sp-clock');
      if(c) c.textContent=(live?('● '+L('live','ライブ','live','сейчас','en vivo')+' · '):'')+fmtWhen(nowMs());
      const p=root.querySelector('.sp-play'); if(p) p.textContent=playing&&!live?'⏸':'▶';
      refreshChrome();
    }
    /* ══ (#R202) WHICH BUTTON IS THE STATE ═══════════════════════════════════════════════════════
       The scale switch, the LIVE button and the speed field all show state rather than an action, so
       they are re-lit from the state on every clock tick. The typed field is left alone WHILE IT HAS
       FOCUS — writing into an input under the caret is how a value the user is halfway through typing
       gets eaten. */
    function refreshChrome(){
      if(!root) return;
      /* this runs on every clock tick; nothing below is worth a DOM write when nothing moved */
      const sig=scale+'|'+live+'|'+rate+'|'+showOrbits+'|'+showNames+'|'+mode;   /* (#R207) */
      if(sig===refreshChrome._sig) return;
      refreshChrome._sig=sig;
      /* (#R207) the two new switches. "Place names" belongs to the body view, so in the system view
         it is shown disabled rather than removed — a control that vanishes reads as a bug. */
      const litOn=(b,on)=>{ if(!b) return;
        b.style.background=on?'rgba(255,210,63,0.20)':'rgba(255,255,255,0.06)';
        b.style.borderColor=on?'rgba(255,210,63,0.65)':'rgba(255,255,255,0.22)';
        b.style.color=on?'#ffe9a8':'#f2f2f2'; };
      litOn(root.querySelector('.sp-orbits'),showOrbits);
      const nb=root.querySelector('.sp-names');
      litOn(nb,showNames);
      if(nb){ const usable=(mode==='body'); nb.style.opacity=usable?'1':'0.45'; nb.title=usable?'':
        S(L('Place names are drawn on a body — open one from the list','地名は天体の表面に描かれます（左の一覧から天体を開いてください）','Ortsnamen werden auf einem Körper gezeichnet','Названия рисуются на теле','Los topónimos se dibujan sobre un cuerpo')); }
      root.querySelectorAll('.sp-scale').forEach(b=>{
        const on=(b.getAttribute('data-s')===scale);
        b.style.background=on?'#fff':'transparent';
        b.style.color=on?'#000':'rgba(255,255,255,0.62)';
      });
      const lv=root.querySelector('.sp-live');
      if(lv){ lv.style.background=live?'rgba(90,230,140,0.22)':'rgba(255,255,255,0.06)';
        lv.style.borderColor=live?'rgba(90,230,140,0.75)':'rgba(255,255,255,0.22)';
        lv.style.color=live?'#bdf7d2':'#f2f2f2'; }
      const inp=root.querySelector('.sp-rate');
      if(inp&&document.activeElement!==inp){ const v=String(rate); if(inp.value!==v) inp.value=v; }
      const rv=root.querySelector('.sp-ratev'); if(rv) rv.textContent=live?L('(live)','（ライブ）','(live)','(сейчас)','(en vivo)'):rateLabel(Math.abs(rate))+((rate<0)?' ◀':'');
    }
    function refreshHUD(){
      if(!root||!open) return;
      refreshClock();
      const side=root.querySelector('.sp-side');
      if(side){
        side.innerHTML=BODIES.map(id=>{
          const on=id===focus;
          return '<button class="sp-b" data-b="'+id+'" style="'+BTN+'text-align:left;'
            +(on?'background:rgba(255,210,63,0.18);border-color:rgba(255,210,63,0.6);':'')+'">'
            +'<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+S(EPH().body(id).colour)+';margin-right:6px;"></span>'
            +S(bodyName(id))+'</button>';
        }).join('');
        side.querySelectorAll('.sp-b').forEach(b=>b.onclick=()=>{ setFocus(b.getAttribute('data-b')); });
      }
      const info=root.querySelector('.sp-info'); if(info) info.innerHTML=infoHtml();
      const note=root.querySelector('.sp-note'); if(note) note.innerHTML=noteHtml();
    }
    function infoHtml(){
      const E=EPH(), jd=jdNow(), id=focus, b=E.body(id); if(!b) return '';
      let s='<div style="font-weight:700;font-size:13px;margin-bottom:3px;">'+S(bodyName(id))+'</div>';
      const pr=(k,v)=>'<div style="display:flex;justify-content:space-between;gap:8px;"><span style="opacity:.72;">'+S(k)+'</span><b>'+S(v)+'</b></div>';
      s+=pr(L('Radius','半径','Radius','Радиус','Radio'),Math.round(b.rKm).toLocaleString()+' km');
      s+=pr(L('Mass','質量','Masse','Масса','Masa'),b.massKg.toExponential(3).replace('e+',' × 10^')+' kg');
      s+=pr(L('Rotation','自転','Rotation','Вращение','Rotación'),
        (Math.abs(b.rotD)<1?(Math.abs(b.rotD)*24).toFixed(2)+' h':Math.abs(b.rotD).toFixed(3)+' d')+(b.rotD<0?' ('+L('retrograde','逆行','retrograd','ретроградное','retrógrado')+')':''));
      s+=pr(L('Axial tilt','赤道傾斜角','Achsneigung','Наклон оси','Inclinación axial'),b.tiltDeg.toFixed(2)+'°');
      if(id!=='sun'&&id!=='moon'){
        const h=E.heliocentric(id,jd);
        if(h){ s+=pr(L('From the Sun','太陽から','Von der Sonne','От Солнца','Del Sol'),h.r.toFixed(4)+' AU');
          s+=pr(L('Orbital period','公転周期','Umlaufzeit','Период','Período'),(E.periodDays(id)/365.25).toFixed(3)+' '+L('yr','年','a','лет','a'));
          s+=pr(L('Eccentricity','離心率','Exzentrizität','Эксцентриситет','Excentricidad'),h.e.toFixed(5));
          s+=pr(L('Inclination','軌道傾斜','Neigung','Наклонение','Inclinación'),h.I.toFixed(3)+'°'); }
      }
      if(id==='moon'){ const m=E.moonGeocentric(jd);
        s+=pr(L('From the Earth','地球から','Von der Erde','От Земли','De la Tierra'),Math.round(m.distKm).toLocaleString()+' km'); }
      if(id!=='earth'&&id!=='sun'){
        const g=E.geocentric(id,jd);
        if(g){ s+=pr(L('From the Earth','地球から','Von der Erde','От Земли','De la Tierra'),
          id==='moon'?'':(g.distAU.toFixed(4)+' AU'));
          s+=pr(L('Elongation','太陽離角','Elongation','Элонгация','Elongación'),E.elongationDeg(id,jd).toFixed(1)+'°'); }
      }
      return s;
    }
    function noteHtml(){
      const px=(function(){ const b=EPH().body(focus); if(!b) return 0;
        return radScale(b.rKm)/Math.max(1e-9,dist)*H/(2*Math.tan(45*D2R/2)); })();
      const s1=(scale==='real')
        ? L('True scale: 1 unit = 1 AU and every radius is real, so a planet is a fraction of a pixel until you go to it — '+px.toFixed(px<1?3:1)+' px right now.',
            '実寸大：1単位＝1天文単位、半径もすべて実寸なので、寄るまで惑星は1画素未満です（現在 '+px.toFixed(px<1?3:1)+' px）。',
            'Maßstabsgetreu: 1 Einheit = 1 AE, Radien real — derzeit '+px.toFixed(px<1?3:1)+' px.',
            'Реальный масштаб: 1 единица = 1 а.е., радиусы настоящие — сейчас '+px.toFixed(px<1?3:1)+' px.',
            'Escala real: 1 unidad = 1 UA y los radios son reales — ahora '+px.toFixed(px<1?3:1)+' px.')
        : L('Model scale: orbital radii ∝ r^'+POS_P+' and bodies ∝ ∛r, so the whole system is legible and the order and the ratios inside each family survive. The Moon is compressed about the EARTH by the same law, not about the Sun — compressing its heliocentric distance put it inside the Earth. Distances and sizes here are NOT to scale with each other.',
            'モデル大：軌道半径は r^'+POS_P+'、天体は ∛r で圧縮しています。全体が見える代わりに、距離と大きさの比は実際とは異なります。',
            'Modellmaßstab: Bahnradien ∝ r^'+POS_P+', Körper ∝ ∛r — nicht maßstabsgetreu zueinander.',
            'Модельный масштаб: радиусы орбит ∝ r^'+POS_P+', тела ∝ ∛r — не в одном масштабе.',
            'Escala modelo: radios ∝ r^'+POS_P+', cuerpos ∝ ∛r — no están a la misma escala.');
      const s2=L('Positions: JPL approximate elements (3000 BC – 3000 AD); the Moon: truncated ELP-2000/82. Surfaces: Solar System Scope textures (CC BY 4.0) from NASA/JPL/USGS imagery — except the Earth, which is the app’s own whole-Earth basemap (NASA Blue Marble via GIBS), the same picture the map draws under its satellite tiles. Names: USGS Gazetteer of Planetary Nomenclature (IAU). Stars: Hipparcos. Satellites other than the Moon are not modelled — their phase cannot be computed faithfully from published elements alone.',
        '位置：JPL 近似軌道要素（紀元前3000年〜紀元3000年）、月は ELP-2000/82 の短縮級数。表面：Solar System Scope のテクスチャ（CC BY 4.0、NASA/JPL/USGS 画像より）。ただし地球はアプリ自身の全球ベース画像（NASA Blue Marble／GIBS 経由）＝地図が衛星タイルの下に敷いているものと同一。地名：USGS 惑星地名辞典（IAU 承認）。恒星：ヒッパルコス星表。月以外の衛星は、公表要素だけでは位相を忠実に計算できないため扱っていません。',
        'Positionen: JPL-Näherungselemente; Mond: ELP-2000/82. Oberflächen: Solar System Scope (CC BY 4.0); die Erde ist die eigene Weltkarte der App (NASA Blue Marble). Namen: USGS/IAU. Sterne: Hipparcos.',
        'Положения: приближённые элементы JPL; Луна: ELP-2000/82. Поверхности: Solar System Scope (CC BY 4.0); Земля — собственное изображение приложения (NASA Blue Marble). Названия: USGS/IAU. Звёзды: Hipparcos.',
        'Posiciones: elementos aproximados de JPL; Luna: ELP-2000/82. Superficies: Solar System Scope (CC BY 4.0); la Tierra es el mapa base propio de la app (NASA Blue Marble). Nombres: USGS/IAU. Estrellas: Hipparcos.');
      const s3=(focus==='pluto')?('<br>'+L('Pluto is drawn in its measured colour: no global surface map is bundled for it, and the ones offered for the dwarf planets elsewhere are labelled fictional by their author. Its position and its IAU names are real.',
        '冥王星は実測の色で描いています（全球表面図を同梱していないため。他所で配布されている準惑星の表面図は作者自身が「架空」と明記しています）。位置とIAU地名は実データです。',
        'Pluto wird in seiner gemessenen Farbe gezeichnet — es liegt keine globale Oberflächenkarte bei.',
        'Плутон показан своим измеренным цветом: глобальной карты поверхности в комплекте нет.',
        'Plutón se dibuja con su color medido: no se incluye un mapa global de su superficie.')):'';
      /* ⚠ `lastErr` IS THE ONE STRING HERE THAT NOBODY IN THIS FILE WROTE. It carries whatever a failed
         fetch, a rejected texture or a WebGL context error said — i.e. text from outside — and it was
         the one CodeQL was still pointing at after the obvious two were fixed. Through the sanitiser
         like everything else that reaches innerHTML (#R138). */
      return s1+'<br>'+s2+s3+(lastErr?('<br><span style="color:#ff9f0a;">'+S(String(lastErr).slice(0,120))+'</span>'):'');
    }

    /* ⚠ OPEN ON THE DAY SIDE. Measured on the first working build:選んだ天体が真っ黒 — Mars came up
       with `lit: 0` out of 70,400 sampled pixels and a peak of 13/255, which is exactly the 6 %
       ambient term. Nothing was broken: the camera started at a fixed azimuth and Mars happened to
       have its night side towards it, which is a correct picture of a useless view. The camera is
       placed along the real Sun direction for the instant instead, turned 20° off it so the globe
       still reads as a sphere and the terminator is on screen. Rotating away from there is the
       user's business — the night side is real and reachable, it is just not where this opens. */
    /* ⚠ THE DEFAULT VIEW HAS TO CONTAIN THE THING IT IS A VIEW OF. Measured on the first build: the
       system opened at 70 units with Neptune's orbit at 107, so the picture was the inner planets and
       three lines leaving the frame. The distance is derived from the outermost orbit and the field of
       view instead of being a constant, and Saturn opens far enough out for its rings (2.27 radii) to
       be inside the frame rather than cropped by it. */
    function systemDist(){
      const far=posScale(scale==='real'?30.1:39.5);        /* Neptune / Pluto, in scene units */
      return far/Math.tan(45*D2R/2)*0.62;
    }
    function bodyDist(){ return focus==='saturn'?5.6:3.0; }
    function faceSun(){
      const p=positions(jdNow())[focus]||[0,0,0];
      const s=norm([-p[0],-p[1],-p[2]]);
      if(!isFinite(s[0])||(s[0]===0&&s[1]===0&&s[2]===0)) return;
      az=Math.atan2(s[1],s[0])+0.35;
      el=Math.max(-1.1,Math.min(1.1,Math.asin(Math.max(-1,Math.min(1,s[2])))+0.18));
    }
    function setFocus(id){
      if(!EPH().body(id)) return false;
      focus=id;
      /* (#R208) start the satellite table as soon as a body is CHOSEN rather than when it is first
         drawn in body mode — it is 36 kB and the two events are usually a zoom apart, so by the
         time the moons are needed they are there. */
      loadMoons();
      if(mode==='body'){ dist=bodyDist(); faceSun(); loadNames(); texture(id); maxNames(); }
      else if(scale==='real') dist=Math.max(0.02,posScale(1)*0.6);
      refreshHUD();
      return true;
    }
    function setMode(m){
      mode=(m==='body')?'body':'system';
      if(mode==='body'){ dist=bodyDist(); faceSun(); loadNames(); texture(focus); }
      else { dist=systemDist(); el=0.45; }
      refreshHUD();
      return true;
    }
    /* the bodies that carry IAU nomenclature — the panel says so rather than leaving a silent blank */
    function maxNames(){ return names&&names[focus]?names[focus].length:0; }
    /* ══ (#R207) SWITCHING THE SCALE MUST NOT MOVE THE VIEWPOINT ═══════════════════════════════════
       「実寸大とモデル大を切り替えると視点位置が変な場所に飛ばされるのを辞めて。」

       The two scales are two different unit systems — `posScale` maps an AU to a scene unit by a
       power law in one and by identity in the other — and `dist` is a length IN SCENE UNITS. So the
       switch was doing two things at once: changing the units and then throwing the camera to the
       default framing of the new ones. What the user is holding is not a number of units, it is a
       FRAMING: "this much of the solar system fills the screen". That is `dist / systemDist()`, and
       it is the thing that is carried across.
       ⚠ Recomputed from `systemDist()` BEFORE and AFTER the switch rather than from a conversion
       factor, because `systemDist()` is the one place that knows what each scale considers "the whole
       system" (it reads Neptune in one and Pluto in the other). */
    function setScale(s){
      const want=(s==='real')?'real':'model';
      if(want===scale) return true;
      const before=systemDist();
      scale=want;
      for(const k of Object.keys(orbitCache)){ gl.deleteBuffer(orbitCache[k].B); delete orbitCache[k]; }
      if(mode==='system'){
        const after=systemDist();
        const k=(isFinite(before)&&before>0&&isFinite(after)&&after>0)?(after/before):1;
        const d=dist*k;
        dist=isFinite(d)&&d>0?Math.max(distFloor(),Math.min(distCeil(),d)):after;
      }
      refreshHUD();
      return true;
    }
    /* (#R207) the two display switches — public so Atlas can drive them like every other control */
    function setOrbits(v){ showOrbits=!!v; refreshHUD(); return showOrbits; }
    function setNames(v){ showNames=!!v; refreshHUD(); return showNames; }
    function setWhen(d){
      const v=(d instanceof Date)?+d:+new Date(d);
      if(!isFinite(v)) return false;
      live=false; timeMs=Math.max(MIN_MS,Math.min(MAX_MS,v)); refreshHUD(); return true;
    }
    function setLive(){ live=true; playing=false; rate=0; refreshHUD(); return true; }
    function setRate(r){ rate=+r||0; live=false; playing=rate!==0; lastTick=0; refreshHUD(); return true; }

    /* ══ input ════════════════════════════════════════════════════════════════════════════════════ */
    function wire(){
      refreshChrome._sig=null;    /* (#R202) the HUD was just (re)built — nothing on screen is lit yet */
      let drag=null, pinch=0;
      const dn=(e)=>{ if(e.target!==ov&&e.target!==cv) return; drag={x:e.clientX,y:e.clientY}; ov.setPointerCapture&&ov.setPointerCapture(e.pointerId); };
      const mv=(e)=>{ if(!drag) return;
        az-=(e.clientX-drag.x)*0.006; el=Math.max(-1.5,Math.min(1.5,el+(e.clientY-drag.y)*0.006));
        drag={x:e.clientX,y:e.clientY}; };
      const up=()=>{ drag=null; };
      ov.addEventListener('pointerdown',dn); window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up);
      ov.addEventListener('wheel',(e)=>{ e.preventDefault();
        /* (#R201) the same integral as the map's, mirrored: a zoom-IN the camera has nowhere left to
           spend is how you come back down, so the way out and the way in are the one gesture. */
        if(e.deltaY<0) pushIn(Math.min(0.5,-e.deltaY/300));
        dist=Math.max(mode==='body'?1.02:(scale==='real'?1e-5:0.02), Math.min(distCeil(), dist*Math.exp(e.deltaY*0.0012))); },{passive:false});
      ov.addEventListener('touchmove',(e)=>{ if(e.touches.length===2){ e.preventDefault();
        const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        if(pinch){ if(d>pinch) pushIn(Math.log2(d/pinch));
          dist=Math.max(mode==='body'?1.02:0.02,Math.min(distCeil(),dist*pinch/d)); }
        pinch=d; } },{passive:false});
      ov.addEventListener('touchend',()=>{ pinch=0; });
      /* clicking a body focuses it — the same list the sidebar shows */
      ov.addEventListener('click',(e)=>{
        if(mode!=='system') return;
        const r=ov.getBoundingClientRect(), x=(e.clientX-r.left)*dpr, y=(e.clientY-r.top)*dpr;
        const jd=jdNow(), pos=positions(jd), cam=camera();
        const centre=(focus&&focus!=='sun')?scenePos(pos,focus,[0,0,0]):[0,0,0];
        let best=null, bd=26*dpr;
        for(const id of BODIES){ const p=scenePos(pos,id,centre);
          const c=mApply(mMul(cam.P,cam.V),p); if(!(c[3]>0)) continue;
          const sx=(c[0]/c[3]*0.5+0.5)*W, sy=(1-(c[1]/c[3]*0.5+0.5))*H;
          const d=Math.hypot(sx-x,sy-y); if(d<bd){ bd=d; best=id; } }
        if(best) setFocus(best);
      });
      root.querySelector('.sp-close').onclick=()=>close();
      root.querySelector('.sp-mode').onclick=()=>setMode(mode==='system'?'body':'system');
      root.querySelectorAll('.sp-scale').forEach(b=>{ b.onclick=()=>setScale(b.getAttribute('data-s')); });
      /* (#R207) */
      { const ob=root.querySelector('.sp-orbits'); if(ob) ob.onclick=()=>setOrbits(!showOrbits); }
      { const nb=root.querySelector('.sp-names'); if(nb) nb.onclick=()=>setNames(!showNames); }
      root.querySelector('.sp-live').onclick=()=>setLive();
      root.querySelector('.sp-play').onclick=()=>{ if(live){ live=false; timeMs=Date.now(); }
        playing=!playing; if(playing&&!rate) rate=86400; lastTick=0; refreshHUD(); };
      root.querySelector('.sp-fwd').onclick=()=>setRate(rateStep(+1));
      root.querySelector('.sp-back').onclick=()=>setRate(rateStep(-1));
      /* (#R202) the typed multiplier. Applied on Enter and on blur, so a half-typed "1e" never becomes
         a rate; an unreadable entry is rejected by putting the live value back rather than by an alert. */
      const rIn=root.querySelector('.sp-rate');
      const applyRate=()=>{ const v=parseRate(rIn.value); if(v==null){ rIn.value=String(rate); refreshChrome(); return; } setRate(v); rIn.value=String(rate); };
      rIn.onkeydown=(e)=>{ if(e.key==='Enter'){ e.preventDefault(); applyRate(); rIn.blur(); }
        if(e.key!=='Escape') e.stopPropagation(); };   /* Escape must still reach the window handler that closes the view */
      rIn.onchange=applyRate; rIn.onblur=applyRate;
      const w=root.querySelector('.sp-when');
      w.onchange=()=>{ if(w.value) setWhen(new Date(w.value+'Z')); };
      window.addEventListener('keydown',esc);
    }
    function esc(e){ if(open&&e.key==='Escape'){ e.preventDefault(); close(); } }

    /* ══ open / close ═════════════════════════════════════════════════════════════════════════════ */
    function ensure(){
      if(root) return true;
      root=document.createElement('div'); root.id='space-view';
      root.style.cssText='position:fixed;inset:0;z-index:4200;background:#000;display:none;overflow:hidden;';
      cv=document.createElement('canvas'); cv.id='space-gl';
      cv.style.cssText='position:absolute;inset:0;display:block;';
      ov=document.createElement('canvas'); ov.id='space-ov';
      ov.style.cssText='position:absolute;inset:0;display:block;touch-action:none;';
      root.appendChild(cv); root.appendChild(ov);
      const h=document.createElement('div'); h.style.cssText='position:absolute;inset:0;pointer-events:none;';
      h.innerHTML=hud(); root.appendChild(h);
      document.body.appendChild(root);
      try{
        gl=cv.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:false})||cv.getContext('experimental-webgl');
        if(!gl) throw new Error('WebGL is unavailable');
        octx=ov.getContext('2d');
        prog=program(VS_SPH,FS_SPH); progLine=program(VS_LINE,FS_LINE); progPts=program(VS_PT,FS_PT);
        sphere=buildSphere(96,48); ring=buildRing();
      }catch(e){ lastErr=String((e&&e.message)||e); gl=null; return false; }
      wire();
      return true;
    }

    function openView(o){
      o=o||{};
      if(!EPH()){ lastErr='ephemeris missing'; return false; }
      if(!ensure()) return false;
      open=true; root.style.display='block';
      /* (#R208) read the map's frame — the size it hands the Earth over at and the roll it is drawing
         north with — once, here, while the map is still the picture. See axisBlend(). */
      captureMapFrame();
      if(o.body) focus=o.body;
      if(o.mode) mode=(o.mode==='body')?'body':'system';
      if(o.scale) scale=(o.scale==='real')?'real':'model';
      if(o.when) setWhen(o.when); else if(o.live!==false) live=true;
      loadStars(); if(mode==='body'){ loadNames(); texture(focus); }
      dist=(mode==='body')?bodyDist():systemDist();
      if(mode==='body') faceSun();
      /* ⚠ (#R203) ARRIVING FROM THE MAP IS NOT ARRIVING AT THE SOLAR SYSTEM. `systemDist()` is far
         enough to hold Neptune's orbit, so the Earth the gesture was pulling away from disappeared in
         the same frame it appeared — which is the whole of 「遷移を断絶的に勝手にするな」. When the
         crossing hands over a size and a face, start there instead and let the same gesture carry on
         outwards; the solar system is then something the user zooms out TO, not something they are
         dropped into. */
      if(o.match&&o.match.r>0){
        mode='system'; focus='earth';
        try{ resize(); }catch(_){}          /* FOVK() reads H, and the first resize is in render() */
        texture('earth');
        faceGeo(o.match.lat,o.match.lng);
        try{
          const R=radScale(EPH().body('earth').rKm);
          const d=R*FOVK()/o.match.r;
          if(isFinite(d)&&d>0) dist=Math.max(distFloor(),Math.min(distCeil(),d));
        }catch(_){}
      }
      lastFpsAt=performance.now(); frames=0; lastTick=0;
      refreshHUD();
      if(!raf) raf=requestAnimationFrame(render);
      try{ if(gauge) gauge.style.opacity='0'; }catch(_){}
      return true;
    }
    function close(){
      open=false; if(root) root.style.display='none';
      if(raf){ cancelAnimationFrame(raf); raf=0; }
      over=0; try{ if(gauge) gauge.style.opacity='0'; }catch(_){}
      return true;
    }

    /* ══ (#R201) THE WAY IN IS THE ZOOM ITSELF, NOT A BUTTON ═════════════════════════════════════════
       「宇宙を探索は、ボタンで押す形式ではなく、そのまま普段の状態から、ズームアウトし続ければそのまま
         宇宙まで行き、画面も出てくる形式に。」

       #R197 put a button at the zoom floor because the request it answered asked for one there. This
       one asks for the opposite: the floor should not be a wall with a door in it, it should be a
       place you keep going through. So the button is gone and what replaces it is the gesture that
       was already being made — the zoom-out that the renderer has nowhere left to spend.

       ⚠ THE RENDERER GIVES NO EVENT FOR A ZOOM THAT CANNOT HAPPEN. MapLibre clamps the camera at
       minZoom and reports nothing, so "the user is still asking to zoom out" can only be read from
       the INPUT. Two are watched, and they are the two that exist: the wheel/trackpad (deltaY > 0)
       and a two-finger pinch that is closing. Both are read PASSIVELY — nothing here preventDefaults
       anything, so at every zoom that is not the floor the map behaves exactly as it always has.

       ⚠ AND IT HAS TO BE SUSTAINED, NOT INSTANTANEOUS. One flick past the floor must not launch
       anybody into space, so the gesture is integrated in ZOOM LEVELS (the same unit the renderer
       uses: MapLibre's wheel rate is one level per ~300 units of deltaY) and the integral decays back
       to zero the moment the pushing stops. 「ズームアウトし続ければ」 is a duration, and this is it.
       While it is filling, a non-interactive gauge says so — it is feedback for a gesture already
       under way, not a control to press. */
    /* ⚠ ASK THE RENDERER, DO NOT ASSUME 0. js/geo-engine.js RAISES the effective minimum zoom in some
       projections, so "as far out as it goes" is a number that changes underneath this. */
    function minZoom(){
      try{ const v=GE().camera.getMinZoom&&GE().camera.getMinZoom(); if(isFinite(v)) return v; }catch(_){}
      return 0;
    }
    function zoomNow(){ try{ const c=GE().camera.get(); return (c&&isFinite(c.zoom))?c.zoom:99; }catch(_){ return 99; } }
    function atFloor(){ return zoomNow()<=minZoom()+0.06; }

    const OVER_TRIGGER=1.6;          /* zoom levels of refused zoom-out that mean "keep going" */
    const OVER_DECAY=900;            /* ms of no input after which the gesture has stopped */
    let over=0, overAt=0, gauge=null, gaugeFill=null, wiredMap=false, pinchD=0;

    /* ══ (#R207) THE CENTRE OF THE MAP IS NOT THE CENTRE OF THE WINDOW ═════════════════════════════
       「さらにズームアウトで宇宙への文字は地図空間の中央下に。現在はサイドバー開時にも絶対的な中央下の
        位置に配置されている。」

       Since #R160 the sidebars OVERLAY a map that stays full-width, so `left:50%` is the middle of the
       window and the middle of the map only when nothing is open. With the sidebar out, the caption
       sits under it or beside it — never in the middle of what the user is actually looking at.
       So the midpoint is MEASURED: the map's own box minus whatever panels are currently covering its
       edges. Recomputed each time the gauge is shown, because the sidebar can open while it is up. */
    function mapMidX(){
      try{
        const mc=document.getElementById('map-container');
        const r=mc?mc.getBoundingClientRect():{left:0,right:(window.innerWidth||0)};
        let l=r.left, rr=r.right;
        /* every panel that OVERLAYS the map and is actually on screen eats into it from its own side */
        ['#sidebar','#layer-sidebar-r','.mobile-sheet.open'].forEach(sel=>{
          try{ const el=document.querySelector(sel); if(!el) return;
            const cs=getComputedStyle(el);
            if(cs.display==='none'||cs.visibility==='hidden'||+cs.opacity===0) return;
            const b=el.getBoundingClientRect();
            if(b.width<=1||b.height<=1) return;
            /* a panel that does not reach into the map's box is not covering it */
            if(b.right<=l||b.left>=rr) return;
            const midEl=(b.left+b.right)/2, midMap=(l+rr)/2;
            if(midEl<midMap) l=Math.max(l,b.right); else rr=Math.min(rr,b.left);
          }catch(_){}
        });
        if(rr-l<120){ l=r.left; rr=r.right; }   /* everything covered → fall back to the whole map */
        return (l+rr)/2;
      }catch(_){ return (window.innerWidth||0)/2; }
    }
    function ensureGauge(){
      if(gauge) return gauge;
      gauge=document.createElement('div'); gauge.id='space-approach';
      /* ⚠ (#R207) …AND IT IS A PILL, IN BOTH THEMES. 「ライトモードの時に視認性が悪いので、ダーク/
         ライトモードともにピルで包んで。」 The caption was pale blue text with a shadow — legible over a
         night sky, invisible over a white basemap, which is exactly the view a light-mode user zooms
         out of. Wrapped in the app's own card surface so it carries its own contrast either way. */
      gauge.style.cssText='position:fixed;bottom:96px;transform:translateX(-50%);z-index:1250;'
        +'pointer-events:none;opacity:0;transition:opacity 180ms ease;display:flex;flex-direction:column;'
        +'align-items:center;gap:6px;font-size:12px;font-weight:700;'
        +'padding:9px 16px 11px;border-radius:999px;'
        +'color:var(--text-main,#dce6ff);background:var(--card-bg,rgba(18,22,32,0.9));'
        +'border:1px solid var(--glass-border,rgba(128,128,128,0.28));'
        +'box-shadow:0 8px 26px rgba(0,0,0,0.28);'
        +'-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);';
      const cap=document.createElement('div');
      cap.textContent=L('Keep zooming out for space','さらにズームアウトで宇宙へ','Weiter herauszoomen für den Weltraum','Продолжайте отдалять — космос','Sigue alejando para ir al espacio');
      const bar=document.createElement('div');
      bar.style.cssText='width:132px;height:4px;border-radius:99px;background:rgba(128,150,190,0.28);overflow:hidden;';
      gaugeFill=document.createElement('div');
      gaugeFill.style.cssText='height:100%;width:0%;border-radius:99px;background:linear-gradient(90deg,var(--primary-color,#6ea8ff),#cfe0ff);';
      bar.appendChild(gaugeFill); gauge.appendChild(cap); gauge.appendChild(bar);
      document.body.appendChild(gauge);
      return gauge;
    }
    function paintGauge(){
      if(!over){ if(gauge) gauge.style.opacity='0'; return; }
      const g=ensureGauge();
      g.style.left=Math.round(mapMidX())+'px';   /* (#R207) */
      g.style.opacity='1';
      gaugeFill.style.width=Math.round(100*Math.min(1,over/OVER_TRIGGER))+'%';
    }
    /* the integral, in zoom levels; `dz` is how much zoom-out the gesture just asked for */
    function pushOut(dz){
      if(open||!(dz>0)) return;
      if(!atFloor()){ if(over){ over=0; paintGauge(); } return; }
      const t=(typeof performance!=='undefined'?performance.now():Date.now());
      if(overAt&&t-overAt>OVER_DECAY) over=0;
      overAt=t;
      over=Math.min(OVER_TRIGGER*1.5, over+Math.min(0.5,dz));
      if(over>=OVER_TRIGGER){ over=0; paintGauge(); enterFromZoom(); return; }
      paintGauge();
      if(overTmr) clearTimeout(overTmr);
      overTmr=setTimeout(()=>{ over=0; paintGauge(); },OVER_DECAY);
    }
    let overTmr=0;
    /* the same integral on the way back: a zoom-IN the space camera has nowhere to spend returns the
       map. `close()` and Escape still exist; this is only the gesture's own inverse. */
    let backIn=0, backAt=0, backTmr=0;
    function pushIn(dz){
      if(!open||!(dz>0)) return;
      if(!atNearLimit()){ backIn=0; return; }
      const t=(typeof performance!=='undefined'?performance.now():Date.now());
      if(backAt&&t-backAt>OVER_DECAY) backIn=0;
      backAt=t;
      backIn=Math.min(OVER_TRIGGER*1.5, backIn+Math.min(0.5,dz));
      if(backIn>=OVER_TRIGGER){ backIn=0; leaveToMap(); return; }
      if(backTmr) clearTimeout(backTmr);
      backTmr=setTimeout(()=>{ backIn=0; },OVER_DECAY);
    }
    function distFloor(){ return mode==='body'?1.02:(scale==='real'?1e-5:0.02); }
    /* ══ (#R208) HOW FAR OUT THE CAMERA MAY GO — ONE FUNCTION, NOT FOUR LITERALS ══════════════════
       「太陽系外のはるか遠くまでズームアウト」. The ceiling was `1e4` written out in four places
       (the wheel, the pinch, and two restore paths), and in true scale that is 10,000 AU — still
       inside the Oort cloud, a twenty-eighth of the way to the nearest star. So "zoom out past the
       solar system" was not a rendering problem first, it was a clamp.
       REACH_AU is 10 million AU ≈ 48 parsecs: far enough that the Sun is one star among the local
       neighbourhood, and bounded rather than infinite because past the catalogue's own reach there
       would be nothing left to draw and the view would be a lie. It goes through `posScale` for the
       same reason the stars do — model scale expresses distance differently, and a raw AU ceiling
       would mean something different in each. */
    const REACH_AU=1e7;
    function distCeil(){ return mode==='body'?60:posScale(REACH_AU); }

    /* ══ (#R203) THE CROSSING IS A SIZE, AND BOTH SIDES CAN STATE IT ═════════════════════════════════
       「宇宙を探索での地球をはるかにズームインして普通の地球に戻るのではなく、同じサイズで戻るようにしろ。
         宇宙を探索モードへの遷移を断絶的に勝手にするな。」

       #R201 crossed over on a fade between two Earths of unrelated sizes: going out, `openView` set the
       camera to `systemDist()` — far enough to hold Neptune's orbit, i.e. the Earth vanished in one
       frame — and coming back needed `dist` driven all the way down to the floor (0.02 scene units,
       ~50 zoom-in gestures) before the map was handed back at ITS min zoom, whatever size that was.
       Neither direction preserved the one thing that makes two pictures read as one object.

       So both sides measure the Earth's RADIUS ON SCREEN in CSS pixels and match it:
         · the map's is measured, not derived — the engine's own `project()` of a point 90° away from
           the centre is the disc's radius (#R186: transcribe, do not re-derive), and it scales with
           2^zoom, which is what lets the return solve for a zoom;
         · the scene's is R/dist × (h/2)/tan(fov/2), the projection this file already uses for labels.
       Going out, the space camera starts at the distance that reproduces the map's radius. Coming
       back, the map is entered at the zoom that reproduces the scene's. The fade is then between two
       pictures of the same size, of the same face, lit the same way — 250 ms of cross-fade rather than
       a cut, because they are the same object. */
    const FOVK=()=>(H/Math.max(1,dpr))/(2*Math.tan(45*D2R/2));
    /* the Earth's on-screen radius in the space scene, CSS px */
    function earthRadiusPx(){
      try{
        const R=radScale(EPH().body('earth').rKm);
        const jd=jdNow(), pos=positions(jd);
        const centre=(mode==='system'&&focus&&focus!=='sun')?scenePos(pos,focus,[0,0,0]):[0,0,0];
        const p=(mode==='system')?scenePos(pos,'earth',centre):[0,0,0];
        /* the camera orbits the origin at `dist`; the Earth sits at p (which is the origin whenever
           it is the focus, and somewhere else when the focus is another body) */
        const ce=Math.cos(el), se=Math.sin(el);
        const eye=[dist*ce*Math.cos(az), dist*ce*Math.sin(az), dist*se];
        const d=Math.max(1e-9,Math.hypot(eye[0]-p[0],eye[1]-p[1],eye[2]-p[2]));
        return R/d*FOVK();
      }catch(_){ return 0; }
    }
    /* the map globe's on-screen radius in CSS px, asked of the renderer rather than derived */
    function mapGlobeRadiusPx(){
      try{
        const c=GE().camera.getCenter(); if(!c) return 0;
        const a=GE().coords.project([c.lng,c.lat]);
        const b=GE().coords.project([c.lng+90,c.lat]);
        if(!a||!b) return 0;
        const r=Math.hypot(b.x-a.x,b.y-a.y);
        return isFinite(r)&&r>0?r:0;
      }catch(_){ return 0; }
    }
    /* aim the orbit camera at the geodetic point (lat,lng) of the Earth, so the face that was in
       front of the map is the face that is in front here */
    function faceGeo(lat,lng){
      try{
        const b=EPH().bodyBasis('earth',jdNow()); if(!b) return;
        const la=lat*D2R, lo=lng*D2R, cl=Math.cos(la);
        const d=[0,1,2].map(i=>b.x[i]*cl*Math.cos(lo)+b.y[i]*cl*Math.sin(lo)+b.z[i]*Math.sin(la));
        const n=Math.hypot(d[0],d[1],d[2])||1;
        az=Math.atan2(d[1]/n,d[0]/n);
        el=Math.max(-1.5,Math.min(1.5,Math.asin(Math.max(-1,Math.min(1,d[2]/n)))));
      }catch(_){}
    }
    /* the geodetic point the orbit camera is over — the inverse of faceGeo, for the way back */
    function cameraGeo(){
      try{
        const b=EPH().bodyBasis('earth',jdNow()); if(!b) return null;
        const ce=Math.cos(el), d=[ce*Math.cos(az),ce*Math.sin(az),Math.sin(el)];
        const dot=(u)=>u[0]*d[0]+u[1]*d[1]+u[2]*d[2];
        const x=dot(b.x), y=dot(b.y), z=dot(b.z);
        return { lat:Math.asin(Math.max(-1,Math.min(1,z)))/D2R, lng:Math.atan2(y,x)/D2R };
      }catch(_){ return null; }
    }
    /* ⚠ THE WAY BACK IS NOW A SIZE, NOT A FLOOR. A zoom-IN hands the map back as soon as the Earth is
       at least as big as the map's own globe would be at its minimum zoom — which is the size the map
       will come back at. Below that there is genuinely nowhere further in to go, so the old floor
       remains as the second way of satisfying it. */
    /* ══ (#R207) THE WAY BACK IS THE EARTH'S, AND ONLY THE EARTH'S ═════════════════════════════════
       「月を拡大したら地球に戻ってしまうのはおかしい。」

       Every test in here is about the EARTH — `earthRadiusPx()` against the radius the map would be
       handed back at — but nothing checked what the camera was actually looking at. Focus the Moon
       (or Mars, or Saturn) and zoom in: the Earth is a few scene units away, so its on-screen radius
       grows with exactly the same gesture, crosses the handover size, and the app leaves space and
       drops the user on the map. The other half is worse: `dist<=distFloor()*1.02` returns true at
       the floor for ANY focus, so a deep zoom on any body ended on the world map.

       Handing the map back is a statement that the sphere filling the screen IS the map's globe. That
       is true when the Earth is the body being approached and false otherwise, so that is the test.
       A body that is not the Earth simply zooms up to the floor and stays there, which is what
       「拡大」 asked for. ✕ and Escape are unchanged and still leave from anywhere. */
    function earthIsSubject(){ return focus==='earth'; }
    function atNearLimit(){
      if(!earthIsSubject()) return false;
      if(dist<=distFloor()*1.02) return true;
      const r=earthRadiusPx(), m=handoverRadiusPx();
      return !!(r>0&&m>0&&r>=m);
    }
    /* the map globe's radius at the zoom the map would be handed back at (its own minimum) */
    function handoverRadiusPx(){
      try{
        const c=GE().camera.get(); if(!c||!isFinite(c.zoom)) return 0;
        const r=mapGlobeRadiusPx(); if(!(r>0)) return 0;
        let mz=0; try{ const v=GE().camera.getMinZoom(); if(isFinite(v)) mz=v; }catch(_){}
        return r*Math.pow(2,mz-c.zoom);
      }catch(_){ return 0; }
    }

    /* ── the two crossings, both a fade so neither is a cut ───────────────────────────────────── */
    function fadeRoot(from,to,ms,done){
      if(!root){ if(done) done(); return; }
      root.style.transition='opacity '+ms+'ms ease';
      root.style.opacity=String(from);
      requestAnimationFrame(()=>{ root.style.opacity=String(to);
        setTimeout(()=>{ root.style.transition=''; if(done) done(); },ms+20); });
    }
    function enterFromZoom(){
      if(open) return false;
      /* (#R203) hand the map's own picture over: the same face, the same size, the same instant */
      let seed=null;
      try{
        const c=GE().camera.getCenter(), r=mapGlobeRadiusPx();
        if(c&&r>0) seed={ lat:c.lat, lng:c.lng, r };
      }catch(_){}
      if(!openView({ from:'zoom', match:seed })) return false;
      fadeRoot(0,1,250);
      return true;
    }
    function leaveToMap(){
      if(!open) return false;
      /* …and take it back the same way: the zoom whose globe is the size the Earth is right now, and
         the centre the camera is standing over. 「同じサイズで戻るようにしろ」 */
      try{
        const want=earthRadiusPx(), now=mapGlobeRadiusPx(), c=GE().camera.get(), g=cameraGeo();
        if(want>0&&now>0&&c&&isFinite(c.zoom)){
          const zr=GE().camera.zoomRange?GE().camera.zoomRange():[0,22];
          const z=Math.max(zr[0],Math.min(zr[1],c.zoom+Math.log2(want/now)));
          GE().camera.jumpTo(g?{ center:[g.lng,g.lat], zoom:z }:{ zoom:z });
        } else if(g){ GE().camera.jumpTo({ center:[g.lng,g.lat] }); }
      }catch(_){}
      fadeRoot(1,0,250,()=>{ close(); if(root) root.style.opacity='1'; });
      return true;
    }

    function mount(){
      if(wiredMap) return; wiredMap=true;
      let cont=null; try{ cont=GE().render.canvasContainer&&GE().render.canvasContainer(); }catch(_){}
      if(!cont) cont=document.getElementById('map')||document.body;
      /* MapLibre's own wheel rate is one zoom level per ~300 units of deltaY (js/wheel-zoom.js sets
         it), so the same divisor keeps this integral in the same unit the map is refusing to move in.
         Line/page deltas are normalised the way the renderer normalises them. */
      cont.addEventListener('wheel',(e)=>{
        let d=e.deltaY||0; if(e.deltaMode===1) d*=16; else if(e.deltaMode===2) d*=100;
        if(d>0) pushOut(Math.min(0.5,d/300));
      },{passive:true});
      cont.addEventListener('touchstart',(e)=>{ if(e.touches&&e.touches.length===2)
        pinchD=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); },{passive:true});
      cont.addEventListener('touchmove',(e)=>{
        if(!e.touches||e.touches.length!==2) return;
        const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        if(pinchD>0&&d>0&&d<pinchD) pushOut(Math.log2(pinchD/d));
        pinchD=d;
      },{passive:true});
      const endPinch=()=>{ pinchD=0; };
      cont.addEventListener('touchend',endPinch,{passive:true});
      cont.addEventListener('touchcancel',endPinch,{passive:true});
      /* the map moved somewhere that is not the floor → the gesture is no longer about leaving */
      try{ GE().events.on('moveend',()=>{ if(!open&&over&&!atFloor()){ over=0; paintGauge(); } }); }catch(_){}
    }

    return {
      open:openView, close, mount,
      setBody:setFocus, setMode, setScale, setWhen, setLive, setRate,
      setOrbits, setNames, orbits:()=>showOrbits, names:()=>showNames,   /* (#R207) */
      isOpen:()=>open, atFloor,
      bodies:()=>BODIES.slice(),
      /* the two gesture integrals, exposed so a test can drive them without synthesising wheel events
         on a renderer that may or may not have delivered them */
      _pushOut:pushOut, _pushIn:pushIn, enterFromZoom, leaveToMap,
      /* read the middle of the next drawn frame — the only honest way to ask "is anything there" */
      _sample:(w,h)=>new Promise((res)=>{ if(!open||!gl){ res(null); return; } sampleReq={w:w||240,h:h||160,res}; }),
      state:()=>({ open, mode, focus, scale, live, when:new Date(nowMs()).toISOString(), rate, playing,
        dist:+dist.toFixed(5), fps, stars:starN, names:names?Object.keys(names).length:0,
        /* (#R208) the interstellar view, reportable rather than only visible: how far the camera may
           go in the current scale, whether the stars are being drawn at their measured distances,
           and how many of them the catalogue could not place (those sit at the far edge — see
           starField()). A test can then assert the mechanism instead of counting bright pixels. */
        distCeil:+distCeil().toFixed(3), starDepth:!!(starPc&&starDir&&starFarBuf),
        starFarEdge:+starFarEdgeNow().toFixed(1), starsWithoutParallax:starFarUnknown,
        /* (#R208) the map-to-space axis handover, reportable: 1 = the map's frame is up (the Earth's
           own axis, rolled by the map's bearing), 0 = ecliptic north (what the solar system wants),
           the up-vector the camera is using right now, and — the number the eye actually sees — the
           screen angle of the Earth's north, clockwise from vertical. The map's own value for that
           last one is −bearing, so the two sides of the seam are directly comparable. */
        axisBlend:+axisBlend().toFixed(4), up:upVector().map(v=>+v.toFixed(4)),
        northRollDeg:(()=>{ const v=northRollDeg(); return v==null?null:+v.toFixed(3); })(),
        handoverPx:+axisRefPx().toFixed(2), mapRollDeg:+mapRollDeg.toFixed(3),
        /* (#R208) the satellites of whatever is in focus, with the frame and epoch their elements
           came with — so a test can check a position against an ephemeris instead of a picture */
        moons:(()=>{ const l=moonList(); return { loaded:!!moons, error:moonsErr, shown:l.length,
          available:(moons&&moons.planets&&moons.planets[focus]||[]).length,
          names:l.map(m=>m.name), epoch:(moons&&moons.epoch)||null }; })(),
        moonAt:(name)=>{ const b=EPH().body(focus); const m=moonList().find(x=>x.name===name);
          return (m&&b&&b.rKm)?{ name, frame:m.frame, aKm:m.aKm, periodDays:m.periodDays,
            radiusKm:m.radiusKm||null, pos:moonPos(m,jdNow(),b.rKm) }:null; },
        textures:Object.keys(tex).length, overzoom:+over.toFixed(3), overTrigger:OVER_TRIGGER,
        gaugeVisible:!!(gauge&&gauge.style.opacity==='1'), atNearLimit:atNearLimit(),
        atFloor:atFloor(), err:lastErr })
    };
  })();
};
