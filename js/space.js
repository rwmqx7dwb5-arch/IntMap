/* ============================================================================
 *  IntMap · THE SPACE EXPLORER — window.IntMapSpace  (#R197)
 * ----------------------------------------------------------------------------
 *  「最もズームアウトしてそれよりズームできなくなった時だけ、画面上に宇宙を探索するボタンを設置し、
 *    そこから各惑星を見れたり、（地球と同じ形式で。地名のラベル付き。）太陽系を実寸大/モデル大で
 *    完全に主要天体をシミュレートしたものも。（過去、live、未来があり、実際の日時と位置がすべて正確。
 *    物理要素も忠実に。）」
 *
 *  ── WHERE THE BUTTON IS ─────────────────────────────────────────────────────────────────────────
 *  Exactly where the request puts it: it appears when the map cannot zoom out any further, and it
 *  goes away again the moment it can. That is a real state — `camera.zoom <= minZoom + ε` — not a
 *  guess about "looks like the whole Earth", and it is read from the renderer through the engine
 *  contract so it is the same on both engines. Nothing about this file runs, loads or allocates until
 *  the button is pressed.
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
    let root=null, gl=null, cv=null, ov=null, octx=null, btn=null;
    let open=false, mode='system', focus='earth', scale='model';
    let live=true, timeMs=Date.now(), rate=0, playing=false, lastTick=0;
    let az=0.6, el=0.45, dist=70;           /* orbit camera, scene units */
    let raf=0, prog=null, progLine=null, progPts=null, sphere=null, ring=null, starBuf=null, starN=0;
    const tex={}, texLoading={};
    let names=null, namesLoading=null;
    let dpr=1, W=0, H=0, lastErr=null, frames=0, lastFpsAt=0, fps=0, sampleReq=null;
    let hoverBody=null;

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
    function texUrl(id){ try{ return new URL('data/planets/'+id+'.jpg',document.baseURI).toString(); }
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
        if(magic!=='IMSTAR1') throw new Error('bad catalogue header');
        const n=dv.getUint32(8,true);
        const pos=new Float32Array(n*3), col=new Float32Array(n*4); let k=0;
        for(let i=0;i<n;i++){ const o=12+i*6;
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
          k++;
        }
        const P=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,P); gl.bufferData(gl.ARRAY_BUFFER,pos.subarray(0,k*3),gl.STATIC_DRAW);
        const C=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,C); gl.bufferData(gl.ARRAY_BUFFER,col.subarray(0,k*4),gl.STATIC_DRAW);
        starBuf={P,C}; starN=k;
      }).catch(e=>{ lastErr='stars: '+((e&&e.message)||e); });
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

    function camera(){
      const ce=Math.cos(el), se=Math.sin(el);
      const eye=[dist*ce*Math.cos(az), dist*ce*Math.sin(az), dist*se];
      const P=mPersp(45*D2R, W/Math.max(1,H), Math.max(1e-7,dist*1e-4), Math.max(10,dist*2000));
      const V=mLook(eye,[0,0,0],[0,0,1]);
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

    /* the body's own axes, as a rotation matrix from body coordinates into the J2000 ecliptic frame
       the orbits live in — the real pole and the real prime meridian (js/ephemeris.js bodyBasis) */
    function basis(id,jd){
      const b=EPH().bodyBasis(id,jd);
      if(!b) return mIdent();
      return new Float32Array([b.x[0],b.x[1],b.x[2],0, b.y[0],b.y[1],b.y[2],0, b.z[0],b.z[1],b.z[2],0, 0,0,0,1]);
    }
    function scenePos(pos,id,centre){
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

      /* stars, at infinity: drawn with the rotation only, so they do not move when the camera does */
      if(starBuf&&starN){
        gl.depthMask(false);
        const far=Math.max(dist*400,1e5);
        const M=mMul(cam.VP,mScale(far));
        gl.useProgram(progPts);
        gl.uniformMatrix4fv(gl.getUniformLocation(progPts,'uMVP'),false,M);
        gl.uniform1f(gl.getUniformLocation(progPts,'uSz'),2.2*dpr);
        const aP=gl.getAttribLocation(progPts,'aP'), aC=gl.getAttribLocation(progPts,'aC');
        gl.bindBuffer(gl.ARRAY_BUFFER,starBuf.P); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP,3,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ARRAY_BUFFER,starBuf.C); gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC,4,gl.FLOAT,false,0,0);
        gl.drawArrays(gl.POINTS,0,starN);
        gl.depthMask(true);
      }

      if(mode==='system'){
        const centre=(focus&&focus!=='sun')?scenePos(pos,focus,[0,0,0]):[0,0,0];
        const VP=mMul(cam.P,mMul(cam.V,mIdent()));
        /* orbits first, so a body is never hidden behind its own line */
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        for(const id of E.bodies()){
          const o=orbitBuf(id,jd);
          const M=mMul(VP,mTrans(-centre[0],-centre[1],-centre[2]));
          drawLines(M,o.B,o.n,[0.42,0.55,0.78,id===focus?0.75:0.32]);
        }
        gl.depthMask(true); gl.disable(gl.BLEND);
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
    }

    function drawFeatureLabels(model,VP,cam){
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
    function hud(){
      return '<div class="sp-bar" style="position:absolute;left:0;right:0;top:0;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;background:linear-gradient(180deg,rgba(0,0,0,0.72),rgba(0,0,0,0));pointer-events:auto;">'
        +'<button class="sp-close" style="'+BTN+'">✕ '+L('Back to the map','地図へ戻る','Zur Karte','К карте','Al mapa')+'</button>'
        +'<button class="sp-mode" style="'+BTN+'">'+(mode==='system'?('🌍 '+L('View the body','天体を見る','Körper ansehen','Смотреть тело','Ver el cuerpo')):('🪐 '+L('Solar system','太陽系','Sonnensystem','Солнечная система','Sistema solar')))+'</button>'
        +'<button class="sp-scale" style="'+BTN+'">'+(scale==='real'?('📏 '+L('True scale','実寸大','Maßstabsgetreu','Реальный масштаб','Escala real')):('🔎 '+L('Model scale','モデル大','Modellmaßstab','Модельный масштаб','Escala modelo')))+'</button>'
        +'<span style="flex:1 1 8px;"></span>'
        +'<span class="sp-clock" style="font-size:11.5px;color:#e8e8e8;font-variant-numeric:tabular-nums;"></span>'
        +'<button class="sp-live" style="'+BTN+'">'+L('Now','現在','Jetzt','Сейчас','Ahora')+'</button>'
        +'<button class="sp-back" style="'+BTN+'">⏪</button>'
        +'<button class="sp-play" style="'+BTN+'">▶</button>'
        +'<button class="sp-fwd" style="'+BTN+'">⏩</button>'
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
        : L('Model scale: orbital radii ∝ r^'+POS_P+' and bodies ∝ ∛r, so the whole system is legible and the order and the ratios inside each family survive. Distances and sizes here are NOT to scale with each other.',
            'モデル大：軌道半径は r^'+POS_P+'、天体は ∛r で圧縮しています。全体が見える代わりに、距離と大きさの比は実際とは異なります。',
            'Modellmaßstab: Bahnradien ∝ r^'+POS_P+', Körper ∝ ∛r — nicht maßstabsgetreu zueinander.',
            'Модельный масштаб: радиусы орбит ∝ r^'+POS_P+', тела ∝ ∛r — не в одном масштабе.',
            'Escala modelo: radios ∝ r^'+POS_P+', cuerpos ∝ ∛r — no están a la misma escala.');
      const s2=L('Positions: JPL approximate elements (3000 BC – 3000 AD); the Moon: truncated ELP-2000/82. Surfaces: Solar System Scope textures (CC BY 4.0) from NASA/JPL/USGS imagery. Names: USGS Gazetteer of Planetary Nomenclature (IAU). Stars: Hipparcos. Satellites other than the Moon are not modelled — their phase cannot be computed faithfully from published elements alone.',
        '位置：JPL 近似軌道要素（紀元前3000年〜紀元3000年）、月は ELP-2000/82 の短縮級数。表面：Solar System Scope のテクスチャ（CC BY 4.0、NASA/JPL/USGS 画像より）。地名：USGS 惑星地名辞典（IAU 承認）。恒星：ヒッパルコス星表。月以外の衛星は、公表要素だけでは位相を忠実に計算できないため扱っていません。',
        'Positionen: JPL-Näherungselemente; Mond: ELP-2000/82. Oberflächen: Solar System Scope (CC BY 4.0). Namen: USGS/IAU. Sterne: Hipparcos.',
        'Положения: приближённые элементы JPL; Луна: ELP-2000/82. Поверхности: Solar System Scope (CC BY 4.0). Названия: USGS/IAU. Звёзды: Hipparcos.',
        'Posiciones: elementos aproximados de JPL; Luna: ELP-2000/82. Superficies: Solar System Scope (CC BY 4.0). Nombres: USGS/IAU. Estrellas: Hipparcos.');
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
    function setScale(s){
      scale=(s==='real')?'real':'model';
      for(const k of Object.keys(orbitCache)){ gl.deleteBuffer(orbitCache[k].B); delete orbitCache[k]; }
      if(mode==='system') dist=systemDist();
      refreshHUD();
      return true;
    }
    function setWhen(d){
      const v=(d instanceof Date)?+d:+new Date(d);
      if(!isFinite(v)) return false;
      live=false; timeMs=Math.max(MIN_MS,Math.min(MAX_MS,v)); refreshHUD(); return true;
    }
    function setLive(){ live=true; playing=false; rate=0; refreshHUD(); return true; }
    function setRate(r){ rate=+r||0; live=false; playing=rate!==0; lastTick=0; refreshHUD(); return true; }

    /* ══ input ════════════════════════════════════════════════════════════════════════════════════ */
    function wire(){
      let drag=null, pinch=0;
      const dn=(e)=>{ if(e.target!==ov&&e.target!==cv) return; drag={x:e.clientX,y:e.clientY}; ov.setPointerCapture&&ov.setPointerCapture(e.pointerId); };
      const mv=(e)=>{ if(!drag) return;
        az-=(e.clientX-drag.x)*0.006; el=Math.max(-1.5,Math.min(1.5,el+(e.clientY-drag.y)*0.006));
        drag={x:e.clientX,y:e.clientY}; };
      const up=()=>{ drag=null; };
      ov.addEventListener('pointerdown',dn); window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up);
      ov.addEventListener('wheel',(e)=>{ e.preventDefault();
        dist=Math.max(mode==='body'?1.02:(scale==='real'?1e-5:0.02), Math.min(mode==='body'?60:1e4, dist*Math.exp(e.deltaY*0.0012))); },{passive:false});
      ov.addEventListener('touchmove',(e)=>{ if(e.touches.length===2){ e.preventDefault();
        const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        if(pinch) dist=Math.max(mode==='body'?1.02:0.02,Math.min(mode==='body'?60:1e4,dist*pinch/d));
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
      root.querySelector('.sp-scale').onclick=()=>setScale(scale==='real'?'model':'real');
      root.querySelector('.sp-live').onclick=()=>setLive();
      root.querySelector('.sp-play').onclick=()=>{ if(live){ live=false; timeMs=Date.now(); }
        playing=!playing; if(playing&&!rate) rate=86400; lastTick=0; refreshHUD(); };
      root.querySelector('.sp-fwd').onclick=()=>{ const i=RATES.indexOf(Math.abs(rate));
        setRate((rate<0?-1:1)*RATES[Math.min(RATES.length-1,(i<0?0:i)+1)]); };
      root.querySelector('.sp-back').onclick=()=>{ const i=RATES.indexOf(Math.abs(rate));
        const nr=RATES[Math.min(RATES.length-1,(i<0?0:i)+1)]; setRate(-nr); };
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
      if(o.body) focus=o.body;
      if(o.mode) mode=(o.mode==='body')?'body':'system';
      if(o.scale) scale=(o.scale==='real')?'real':'model';
      if(o.when) setWhen(o.when); else if(o.live!==false) live=true;
      loadStars(); if(mode==='body'){ loadNames(); texture(focus); }
      dist=(mode==='body')?bodyDist():systemDist();
      if(mode==='body') faceSun();
      lastFpsAt=performance.now(); frames=0; lastTick=0;
      refreshHUD();
      if(!raf) raf=requestAnimationFrame(render);
      try{ if(btn) btn.style.display='none'; }catch(_){}
      return true;
    }
    function close(){
      open=false; if(root) root.style.display='none';
      if(raf){ cancelAnimationFrame(raf); raf=0; }
      syncButton();
      return true;
    }

    /* ══ the button: only at the far end of the zoom ══════════════════════════════════════════════ */
    /* ⚠ ASK THE RENDERER, DO NOT ASSUME 0. js/geo-engine.js RAISES the effective minimum zoom in some
       projections, so "as far out as it goes" is a number that changes underneath this. */
    function minZoom(){
      try{ const v=GE().camera.getMinZoom&&GE().camera.getMinZoom(); if(isFinite(v)) return v; }catch(_){}
      return 0;
    }
    function zoomNow(){ try{ const c=GE().camera.get(); return (c&&isFinite(c.zoom))?c.zoom:99; }catch(_){ return 99; } }
    function atFloor(){ return zoomNow()<=minZoom()+0.06; }
    function ensureButton(){
      if(btn) return btn;
      btn=document.createElement('button'); btn.id='space-btn'; btn.type='button';
      btn.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:96px;z-index:1250;display:none;'
        +'padding:9px 16px;border-radius:999px;border:1px solid rgba(140,180,255,0.55);'
        +'background:linear-gradient(180deg,rgba(20,26,48,0.92),rgba(10,12,26,0.92));color:#dce6ff;'
        +'font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 8px 26px rgba(0,0,0,0.45);'
        +'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
      btn.textContent='🪐 '+L('Explore space','宇宙を探索','Weltraum erkunden','Исследовать космос','Explorar el espacio');
      btn.setAttribute('aria-label',btn.textContent);
      btn.onclick=()=>openView({});
      document.body.appendChild(btn);
      return btn;
    }
    /* ⚠ NOTHING PER FRAME. The only work outside a gesture is one comparison on moveend. */
    function syncButton(){
      const want=!open&&atFloor();
      if(!want){ if(btn) btn.style.display='none'; return; }
      ensureButton().style.display='block';
    }
    function mount(){
      try{ GE().events.on('moveend',syncButton); }catch(_){}
      try{ GE().events.on('zoomend',syncButton); }catch(_){}
      setTimeout(syncButton,1200);
    }

    return {
      open:openView, close, mount, syncButton,
      setBody:setFocus, setMode, setScale, setWhen, setLive, setRate,
      isOpen:()=>open, atFloor,
      bodies:()=>BODIES.slice(),
      /* read the middle of the next drawn frame — the only honest way to ask "is anything there" */
      _sample:(w,h)=>new Promise((res)=>{ if(!open||!gl){ res(null); return; } sampleReq={w:w||240,h:h||160,res}; }),
      state:()=>({ open, mode, focus, scale, live, when:new Date(nowMs()).toISOString(), rate, playing,
        dist:+dist.toFixed(5), fps, stars:starN, names:names?Object.keys(names).length:0,
        textures:Object.keys(tex).length, buttonVisible:!!(btn&&btn.style.display!=='none'),
        atFloor:atFloor(), err:lastErr })
    };
  })();
};
