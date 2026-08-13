/* ============================================================================
 *  IntMap · THE LIMB, DRAWN BY THIS APP  —  IntMapModules.limbLayer   (#R227)
 * ----------------------------------------------------------------------------
 *  「MapLibreの地球大気の描写をもっとリアルで忠実で美しく。」 — the seventh round on this line, and
 *  the first one that found out why the previous six could not have worked.
 *
 *  ⚠⚠ WHAT #R227 MEASURED. maplibre-gl's sky pass ends with
 *
 *      fragColor = mix(fragColor, vec4(vec3(0.0), 0.0), u_sky_blend);      (sky.fragment.glsl)
 *      const skyBlend = projectionData.projectionTransition;               (sky_program.ts)
 *      projectionTransition: params.applyGlobeMatrix ? this._globeness : 0 (globe_transform.ts)
 *
 *  — i.e. while the Earth is drawn as a globe, `_globeness` is 1 and the ENTIRE sky quad is mixed to
 *  transparent black. `sky-color`, `horizon-color` and `sky-horizon-blend` are not drawn at all.
 *  Everything #R196 → #R226 computed for 「宇宙から見た地球の縁」 — the limb integral, the ozone term,
 *  the multiple-scattering table, #R226's N = 32 → 256 march — reached the STYLE and never reached a
 *  pixel. What the reader has been looking at is maplibre's own `atmosphere.fragment.glsl`, all of it:
 *
 *      const int iSteps = 5;  const int jSteps = 3;        five view samples, three sun samples
 *      vec3(5.5e-6, 13.0e-6, 22.4e-6)                      Rayleigh — the blue is 22.4 where the
 *                                                          published value this app uses is 33.1
 *      (no ozone term, no multiple scattering)
 *
 *  Five uniform steps is the same defect #R224 and #R226 each spent a round on, one order of
 *  magnitude worse, and a blue coefficient 32 % low is a limb that cannot be blue enough. There is no
 *  knob into that shader — `atmosphere-blend` is a scalar multiplier and the app already sets it — so
 *  the only way to draw the limb correctly is to draw it.
 *
 *  WHAT THIS FILE IS. A `custom` layer that marches the SAME model as js/sky-model.js, per pixel, in
 *  the fragment shader: planet 6,371 km, shell 6,471 km, Rayleigh β (5.8, 13.5, 33.1)e−6 with an 8 km
 *  scale height, Mie 21e−6 with 1.2 km and g = 0.76, ozone in the Chappuis band on the published tent
 *  profile (#R218), the multiple-scattering table (#R220), and #R224's warped quadrature — samples
 *  placed densest at the ray's LOWEST point, which for a limb ray is the tangent point where all the
 *  air is.
 *
 *  ⚠ THE TWO THINGS IT LOOKS UP RATHER THAN COMPUTING, AND WHY THAT IS NOT AN APPROXIMATION:
 *    · the sun ray — `sunOpticalDepth(h, sunElev)` in js/sky-model.js, which is the very loop that
 *      march runs, sampled into a 128 × 64 texture. It depends on nothing but the height of the point
 *      and the Sun's elevation over it, so a table IS the function.
 *    · the multiple-scattering term ψ_ms — `skyColour`'s own 16 × 24 table, uploaded as it stands.
 *  Both come from js/sky-model.js at run time, so a constant changed there reaches this shader on the
 *  next build of the texture. #R226's rule: a value that must not drift is held by STRUCTURE.
 *
 *  ⚠⚠ (#R237) IT DRAWS OVER THE DISC TOO, AND THAT IS WHAT WAS MISSING ═══════════════════════════
 *  「ズームインしたら見えなくなるって話…そもそも前まであったものがない」 — MEASURED, one camera,
 *  same layers, the pixel column up from the map centre, at 1,2,…,16 px inside the outer edge:
 *
 *      px inside edge        this layer (as #R227 shipped it)     maplibre's own pass at 0.55
 *      −16                        33,103,118                          88,166,186
 *      −10                        19, 72, 86                          88,151,171
 *       −6                       102,146,175                         183,207,223
 *
 *  maplibre's atmosphere lights THE WHOLE DISC — roughly double the luminance right across the
 *  globe — because it is blended over the imagery. #R227 switched it off (`atmosphere-blend: 0`)
 *  and put in its place a band that draws ONLY outside the planet, 4 px wide (100 km on 6,371 km is
 *  1.57 % of the radius, and 1.57 % of a 236 px radius is 3.7 px). Nothing was faint or dead: the
 *  air over the daylight side of the Earth had simply stopped being drawn. That is the report.
 *
 *  So the ray that meets the planet is marched now, from the eye down to the surface, and #R227's
 *  reason for not doing it is answered rather than repeated. Its note said compositing
 *  L_bg·T + L_inscatter needs "a linear off-screen target rather than a better constant", because
 *  adding a tone-mapped in-scatter into a gamma-encoded framebuffer over-brightens (it measured open
 *  ocean #013a4c arriving as #588bc1). The linear target is not needed — the TONE MAP IS INVERTIBLE.
 *  The background is read back with `copyTexSubImage2D`, run back through
 *  `L = −ln(1 − c^γ)/exposure` into radiance, composited THERE, and tone-mapped once on the sum.
 *  With no air in the way that round-trip is the identity, so this layer is a no-op wherever it has
 *  nothing to say, and there is no constant to tune.
 *
 *  ⚠ AND ONLY WHERE THERE IS A LIMB. The uniforms come back null unless the projection is the globe,
 *  so nothing about the flat map, the ground-level sky or the flight simulator moves. (#R237) The
 *  eye no longer has to be ABOVE the shell: that test is what made the air vanish at z ≈ 9.5 —
 *  measured, the handover fell between z9, eye 183 km, and z10, eye 92 km — and what it handed to
 *  was maplibre's own pass, which the table above shows is a 2 px sliver. Strength rides `globeness`
 *  instead, the same gate maplibre's own atmosphere uses, so the two can never disagree and there is
 *  no zoom at which the air switches off in one frame.
 *
 *  ⚠ THIS FILE NEVER NAMES THE RENDERER. Its geometry arrives as uniforms from the one file allowed
 *  to ask for them (js/geo-engine.js, `layers.addLimb`), which takes them from the same transform
 *  maplibre's own atmosphere pass uses — so the band is registered with the globe by construction
 *  rather than by a screen-space guess that would drift the moment the camera is pitched.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.limbLayer=function(){
  /* how finely the shader marches the VIEW ray. #R226 measured the same march on the CPU against an
     N = 512 reference at the limb: N = 32 was 20 counts out (a lilac collar), N = 128 is 3 and
     N = 256 is exact. 128 is what ships here — the error it carries is a third of a colour step,
     and it is the only place a GPU budget touches the physics. */
  const MARCH_N=128, KWARP=7.0;
  /* (#R237) …and how finely it marches a ray that MEETS THE PLANET. That path has no tangent point —
     the height falls monotonically from the eye to the ground, so the integrand has no interior peak
     for #R224's warp to resolve — and it is short: the ray leaves the shell after at most 100 km of
     air rather than the ~1,100 km a grazing ray crosses. Both of the reasons N is 128 are about the
     limb ray, so the disc gets its own count, and it is the count that decides the cost of this
     change, because the disc is most of the screen where the ring is a few pixels of it.
     ⚠ 24 is a REASONED number, not a measured one: unlike #R226's N = 32 → 128 sweep at the limb,
     no reference march has been run against it on the disc. If the disc's air ever bands, this is
     the first place to look. */
  const DISC_N=24;
  /* the sun-ray table. 128 elevations × 64 heights, both on warps that put the samples where the
     integral actually moves: near the horizon in elevation (where the air mass runs away) and near
     the ground in height (where the density is). */
  const SUN_W=128, SUN_H=64, OD_SCALE=1e6;

  const VS=`#version 300 es
    in vec2 a_pos;
    uniform mat4 u_invProj;
    out vec3 v_dir;
    void main(){ v_dir=(u_invProj*vec4(a_pos,0.0,1.0)).xyz; gl_Position=vec4(a_pos,0.0,1.0); }`;

  /* ⚠ THE SHADER SOURCE IS BUILT FROM THE MODEL, not beside it: the shell thickness and the
     multiple-scattering table's top height are the model's numbers, and a copy of either here is a
     way for the drawn limb and the computed sky to drift apart. Compiled once, in onAdd. */
  const fsSource=(M)=>`#version 300 es
    precision highp float;
    in vec3 v_dir;
    out vec4 fragColor;
    uniform vec3 u_camPos;        /* eye, metres, planet centre at the origin */
    uniform vec3 u_sunDir;        /* unit, toward the Sun, same frame */
    uniform sampler2D u_tSun;     /* (sun elevation, height) -> optical depth to the Sun, /1e6 */
    uniform sampler2D u_tMs;      /* (sun elevation, height) -> the multiple-scattering term */
    uniform vec3 u_BR;
    uniform vec3 u_BO;
    uniform float u_BM, u_mieExt, u_HR, u_HM, u_RG, u_RT, u_sunI, u_exposure, u_gamma, u_g;
    uniform float u_msE0, u_msE1, u_msN;
    uniform float u_o3Peak, u_o3Half;
    uniform float u_strength;
    /* (#R237) the frame as it stands before this pass, and its size — see the header. The air in
       front of the planet MULTIPLIES what is behind it, so this layer has to know what that is. */
    uniform sampler2D u_bg;
    uniform vec2 u_res;
    /* (#R237) how much of the disc's own air to draw: globeness × #R187/#R205's per-basemap ramp.
       0 restores #R227's behaviour exactly (the ring alone), and it is 0 the moment the globe has
       finished turning into a plane. */
    uniform float u_disc;

    const int N=${MARCH_N};
    const int ND=${DISC_N};
    const float KW=${KWARP.toFixed(1)};
    const float SUN_TOP=${(M.RT-M.RG).toFixed(1)};
    const float MS_TOP=${(M.ms.h[M.ms.h.length-1]).toFixed(1)};

    /* the ozone tent of #R218: a peak at 25 km falling linearly to zero at 10 km and 40 km */
    float ozone(float h){ return max(0.0, 1.0 - abs(h-u_o3Peak)/u_o3Half); }

    /* the two warps the sun table is sampled on — the inverse of how it was filled — with the
       half-texel correction, because the rows were filled at i/(W−1) and a texture is sampled at
       (i+0.5)/W. Getting that wrong is a whole texel of Sun elevation at the terminator. */
    float ax(float t, float n){ return (t*(n-1.0)+0.5)/n; }
    vec4 sunOD(float h, float seDeg){
      float u = 0.5 + 0.5*sign(seDeg)*sqrt(min(1.0, abs(seDeg)/90.0));
      float v = pow(clamp(h/SUN_TOP, 0.0, 1.0), 1.0/3.0);
      return texture(u_tSun, vec2(ax(u, ${SUN_W}.0), ax(v, ${SUN_H}.0)));
    }
    vec3 msAt(float h, float seDeg){
      float u = clamp((seDeg-u_msE0)/(u_msE1-u_msE0), 0.0, 1.0);
      float v = pow(clamp(h/MS_TOP, 0.0, 1.0), 1.0/3.0);
      return texture(u_tMs, vec2(ax(u, u_msN), ax(v, 64.0))).rgb;
    }

    void main(){
      vec3 d = normalize(v_dir);
      vec3 o = u_camPos;
      float b = dot(o,d);
      float cT = dot(o,o) - u_RT*u_RT;
      float discT = b*b - cT;
      if (discT < 0.0) discard;                       /* the ray never enters the air */
      float rt = sqrt(discT);
      float tIn = max(0.0, -b - rt), tMax = -b + rt;
      if (tMax <= tIn) discard;
      /* ══ ⚠⚠ (#R237) A RAY THAT MEETS THE PLANET IS MARCHED TOO — THAT IS THE AIR THAT WENT MISSING
         #R227 discarded it and recorded why: compositing L_bg·T + L_inscatter is a product and a sum
         in LINEAR radiance, and a custom layer draws into a gamma-encoded framebuffer where the only
         tool is one alpha — measured, open ocean reading #013a4c came out #588bc1, because the
         tone-map's 1/2.2 turns a small path integral into a fifth of full brightness BEFORE it is
         blended. Its own note says the fix is "a linear off-screen target rather than a better
         constant". It is neither: the tone-map is a bijection on [0,1), so the background can simply
         be run BACKWARDS through it into radiance (see the composite below), composited there, and
         tone-mapped once on the sum. Nothing is tuned, and with no air in the way the round trip is
         the identity to within a count — which is what makes this safe to run over the whole disc. */
      float cG = dot(o,o) - u_RG*u_RG;
      float discG = b*b - cG;
      float tHit = -1.0;
      if (discG >= 0.0){ float tg = -b - sqrt(discG); if (tg > 0.0) tHit = tg; }
      bool onDisc = (tHit > 0.0);
      /* the ray stops at the ground; beyond it there is rock, not air */
      if (onDisc) tMax = min(tMax, tHit);
      if (tMax <= tIn) discard;
      float strength = onDisc ? (u_strength * u_disc) : u_strength;
      if (strength <= 0.0005) discard;         /* the disc's air switched off: #R227's picture exactly */

      /* #R224's warp: samples densest at the ray's lowest point, split there when it descends first */
      float tLow = clamp(-b, tIn, tMax);
      float denom = exp(KW) - 1.0;
      float odR=0.0, odM=0.0, odO=0.0;
      vec3 sumR=vec3(0.0), sumM=vec3(0.0), ms=vec3(0.0);
      float lenA = tLow - tIn, lenB = tMax - tLow;
      /* (#R237) a ray that meets the planet descends the whole way — no tangent point, no peak in
         the middle for the warp to resolve — so it gets ND steps instead of N. See DISC_N. */
      int NT = onDisc ? ND : N;
      int nA = (lenA > 0.0 && lenB > 0.0) ? int(float(NT)*0.35) : (lenA > 0.0 ? NT : 0);
      int nB = NT - nA;

      /* ⚠ THE SAMPLES ARE PLACED FROM THE LOWEST POINT OUTWARD AND WALKED IN INCREASING t. That is
         #R224's rule and it is not a detail: the optical depth accumulated so far is what attenuates
         the next sample, so a warp walked in the order it was generated would light the ray from the
         wrong end. The near half's boundaries are generated toward tIn and then stepped BACKWARDS. */
      for (int pass=0; pass<2; pass++){
        int n = (pass==0) ? nA : nB;
        if (n < 1) continue;
        float a1 = (pass==0) ? tIn : tMax;
        for (int i=1; i<=N; i++){
          if (i > n) break;
          int k = (pass==0) ? (n - i + 1) : i;
          float x0 = float(k-1)/float(n), x1 = float(k)/float(n);
          float b0 = tLow + (a1-tLow)*((exp(KW*x0)-1.0)/denom);
          float b1 = tLow + (a1-tLow)*((exp(KW*x1)-1.0)/denom);
          float tm = (b0+b1)*0.5, dt = abs(b1-b0);
          vec3 p = o + d*tm;
          float rlen = length(p);
          float h = max(0.0, rlen - u_RG);
          float hr = exp(-h/u_HR)*dt, hm = exp(-h/u_HM)*dt, ho = ozone(h)*dt;
          float seDeg = degrees(asin(clamp(dot(p,u_sunDir)/rlen, -1.0, 1.0)));
          /* multiple scattering rides the same march and has no sun-visibility test (#R220) */
          vec3 av = exp(-(u_BR*(odR+hr) + u_BM*u_mieExt*(odM+hm) + u_BO*(odO+ho)));
          ms += av * msAt(h, seDeg) * (u_BR*hr + u_BM*hm);
          vec4 sod = sunOD(h, seDeg);
          odR += hr; odM += hm; odO += ho;
          if (sod.a > 0.001){
            vec3 tau = u_BR*(odR + sod.r*${OD_SCALE.toFixed(1)}) + u_BM*u_mieExt*(odM + sod.g*${OD_SCALE.toFixed(1)})
                     + u_BO*(odO + sod.b*${OD_SCALE.toFixed(1)});
            vec3 att = exp(-tau) * sod.a;
            sumR += hr*att; sumM += hm*att;
          }
        }
      }

      float mu = dot(d, u_sunDir);
      float mumu = mu*mu, gg = u_g*u_g;
      float pR = 3.0/(16.0*3.14159265)*(1.0+mumu);
      float pM = 3.0/(8.0*3.14159265)*((1.0-gg)*(1.0+mumu))/((2.0+gg)*pow(max(1e-6, 1.0+gg-2.0*u_g*mu), 1.5));
      vec3 L = u_sunI*(sumR*u_BR*pR + sumM*u_BM*pM + ms);
      /* ⚠⚠ THE EXTINCTION IS PER CHANNEL, AND IT IS WHAT MULTIPLIES WHAT IS BEHIND. A scattering
         term composites as L_out = L_background·T + L_inscatter, so what dims what is behind is the
         TRANSMITTANCE of the air the ray crossed — exp(−τ) over the whole path — and not how bright
         the in-scattered light happens to be. #R227 had to squeeze that into ONE alpha (a luminance
         average of T) because there was no background to multiply; there is one now, so the three
         channels keep their own τ, which is the whole reason the air is BLUE: it takes the red out
         of what is behind it at the same time as it adds blue of its own. */
      vec3 T = exp(-(u_BR*odR + u_BM*u_mieExt*odM + u_BO*odO));
      /* ══ ⚠⚠ (#R237) THE COMPOSITE, IN RADIANCE ════════════════════════════════════════════════
         bgDisp is the frame as it stands, tone-mapped and gamma-encoded. 1 − exp(−L·E) then
         ^(1/γ) is a bijection from radiance onto [0,1), so running it backwards recovers the
         radiance the renderer would have had to hold — and every term below is then a real product
         and a real sum, tone-mapped ONCE at the end. With T = 1 and L = 0 this returns bgDisp
         bit-for-bit, which is why the pass can be run over the whole screen. */
      vec2 uv = gl_FragCoord.xy / u_res;
      vec3 bgDisp = texture(u_bg, uv).rgb;
      vec3 bgL = -log(max(vec3(1e-6), 1.0 - pow(clamp(bgDisp, 0.0, 1.0), vec3(u_gamma)))) / u_exposure;
      /* ⚠ STRENGTH INTERPOLATES THE WHOLE EFFECT, IT DOES NOT SCALE THE COLOUR. #R187 (0.55 over
         satellite) and #R205 (0.15 over the light basemap) are answers to "how much atmosphere",
         and scaling only the in-scatter would darken the imagery at full strength while lighting it
         at a fraction of one — the two halves of one physical quantity pulling apart. Mixing the
         RESULT keeps them together, and 0 is exactly "no air". */
      vec3 outL = mix(bgL, bgL*T + L, strength);
      vec3 c = pow(max(vec3(0.0), 1.0 - exp(-outL*u_exposure)), vec3(1.0/u_gamma));
      if (dot(abs(c - bgDisp), vec3(1.0)) <= 0.004) discard;   /* nothing to say here */
      fragColor = vec4(c, 1.0);
    }`;

  function compile(gl,type,src){
    const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){ const e=gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('limb shader: '+e); }
    return s;
  }

  /* the two tables, built from js/sky-model.js — see the header for why they are looked up */
  function buildTables(M){
    const RG=M.RG, D2R=Math.PI/180, SUN_TOP=M.RT-M.RG;
    const sun=new Float32Array(SUN_W*SUN_H*4);
    for(let j=0;j<SUN_H;j++){
      const v=j/(SUN_H-1), h=SUN_TOP*v*v*v;
      /* below this elevation the planet is in the way; the table still carries the GRAZING depth so
         a linear fetch across the terminator interpolates a real number rather than a hole, and the
         alpha channel is what says "the Sun is not visible from here" */
      const horiz=-Math.acos(Math.max(-1,Math.min(1,RG/(RG+h))))/D2R;
      for(let i=0;i<SUN_W;i++){
        const u=i/(SUN_W-1), t=2*u-1;
        const se=Math.sign(t)*90*t*t;
        const lit=se>horiz;
        const od=M.sunOpticalDepth(h, lit?se:horiz+1e-4, 8) || [0,0,0];
        const o=(j*SUN_W+i)*4;
        sun[o]=od[0]/OD_SCALE; sun[o+1]=od[1]/OD_SCALE; sun[o+2]=od[2]/OD_SCALE; sun[o+3]=lit?1:0;
      }
    }
    const MH=M.ms.h, ME=M.ms.n, msW=ME, msH=64;
    const ms=new Float32Array(msW*msH*4);
    for(let j=0;j<msH;j++){
      const v=j/(msH-1), h=MH[MH.length-1]*v*v*v;
      let a=0; while(a<MH.length-2&&MH[a+1]<h) a++;
      const fa=Math.max(0,Math.min(1,(h-MH[a])/(MH[a+1]-MH[a])));
      for(let i=0;i<ME;i++){
        const o=(j*msW+i)*4;
        for(let k=0;k<3;k++) ms[o+k]=M.ms.data[a][i][k]*(1-fa)+M.ms.data[a+1][i][k]*fa;
        ms[o+3]=1;
      }
    }
    return { sun, ms, msW, msH };
  }

  function makeTex(gl,w,h,data){
    const t=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,w,h,0,gl.RGBA,gl.FLOAT,data);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return t;
  }

  /**
   * @param {string} id layer id
   * @param {function} uniforms called every frame; returns null when there is no limb to draw, or
   *        { invProj:Float32Array(16), camPos:number[3], sunDir:number[3], strength:number,
   *          disc:number }   — `disc` (#R237) is how much of the air IN FRONT of the planet to draw
   * @param {object} model js/sky-model.js's tables + `sunOpticalDepth`
   */
  function makeLayer(id, uniforms, model){
    let prog=null, buf=null, loc={}, tSun=null, tMs=null, tables=null, dead=false, drawn=0;
    /* (#R237) the frame as it stands before this pass. Allocated on first draw and re-allocated
       only when the drawing buffer changes size — a copy is a GPU-side blit, an allocation is not. */
    let tBg=null, bgW=0, bgH=0;
    return {
      id, type:'custom', renderingMode:'2d',
      onAdd(_map, gl){
        try{
          /* float textures with linear filtering: core in WebGL2 with this extension, and the whole
             design rests on them, so an engine without it keeps maplibre's own pass (geo-engine
             refuses to add the layer) rather than being handed a broken one */
          gl.getExtension('OES_texture_float_linear');
          gl.getExtension('EXT_color_buffer_float');
          const vs=compile(gl,gl.VERTEX_SHADER,VS), fs=compile(gl,gl.FRAGMENT_SHADER,fsSource(model));
          prog=gl.createProgram(); gl.attachShader(prog,vs); gl.attachShader(prog,fs); gl.linkProgram(prog);
          if(!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw new Error('limb link: '+gl.getProgramInfoLog(prog));
          gl.deleteShader(vs); gl.deleteShader(fs);
          buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
          gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1, 3,-1, -1,3]),gl.STATIC_DRAW);
          tables=buildTables(model);
          tSun=makeTex(gl,SUN_W,SUN_H,tables.sun);
          tMs=makeTex(gl,tables.msW,tables.msH,tables.ms);
          ['u_invProj','u_camPos','u_sunDir','u_tSun','u_tMs','u_BR','u_BO','u_BM','u_mieExt','u_HR','u_HM',
           'u_RG','u_RT','u_sunI','u_exposure','u_gamma','u_g','u_msE0','u_msE1','u_msN','u_o3Peak','u_o3Half','u_strength',
           'u_bg','u_res','u_disc']
            .forEach(n=>{ loc[n]=gl.getUniformLocation(prog,n); });
          loc.a_pos=gl.getAttribLocation(prog,'a_pos');
        }catch(e){ dead=true; try{ console.warn('[IntMap] limb layer disabled:',e&&e.message); }catch(_){} }
      },
      /* ══ ⚠⚠ (#R236) WHETHER THIS LAYER CAN DRAW AT ALL, ASKED OF THE LAYER ═════════════════════
         「MapLibreの地球周辺の大気は…（追記：そもそも消えてしまっている）」

         #R227's rule is that a refusal is told by RESULT, not by intent — but it was only ever
         applied to whether the layer could be ADDED. `onAdd` above can fail on its own (a shader
         that will not compile or link on this particular driver) and set `dead`, and the layer is
         still in the style: `hasLimb()` says true, `_applySkyAtmosphere` writes
         `atmosphere-blend: 0` to hand the rim over, and the thing it handed it to draws nothing.
         The result is a globe with no air on it in EVERY state, which is the report.
         ⚠ `onAdd` runs synchronously inside `map.addLayer`, so this is answerable the instant the
         layer is added — see the caller in js/geo-engine.js. */
      imAlive(){ return !dead && !!prog; },
      /* …and how many frames it has actually painted, for the watchdog in js/theme-sky.js: a layer
         can be alive and still never draw (uniforms that never resolve). Nothing reads this to
         decide colour — only to decide WHO owns the rim. */
      imDrawn(){ return drawn; },
      onRemove(_map, gl){
        try{ if(prog) gl.deleteProgram(prog); if(buf) gl.deleteBuffer(buf);
          if(tSun) gl.deleteTexture(tSun); if(tMs) gl.deleteTexture(tMs);
          if(tBg) gl.deleteTexture(tBg); }catch(_){}
        prog=buf=tSun=tMs=tBg=null; bgW=bgH=0;
      },
      render(gl){
        if(dead||!prog) return;
        let u=null; try{ u=uniforms(); }catch(_){ u=null; }
        if(!u) return;
        const M=model;
        /* ══ ⚠⚠ (#R237) THE FRAME SO FAR, COPIED SO THE AIR CAN MULTIPLY IT ═══════════════════════
           A custom layer cannot READ the framebuffer it draws into, and the air in front of the
           planet has to (L_bg·T + L_in). `copyTexSubImage2D` from the bound READ framebuffer is the
           whole answer: it is a GPU-side blit of the frame as it stands — every style layer below
           this one, which is all of them, since this layer is added on top — into a texture the
           shader then samples. No feedback loop: the copy happens before the draw.
           ⚠ ALLOCATE ONLY ON A SIZE CHANGE. copyTexImage2D re-allocates; copyTexSubImage2D does not,
           and this runs every frame. */
        const W=gl.drawingBufferWidth, H=gl.drawingBufferHeight;
        if(!(W>0&&H>0)) return;
        gl.activeTexture(gl.TEXTURE2);
        if(!tBg){ tBg=gl.createTexture(); bgW=bgH=0; }
        gl.bindTexture(gl.TEXTURE_2D,tBg);
        if(W!==bgW||H!==bgH){
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,W,H,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
          bgW=W; bgH=H;
        }
        gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,W,H);
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER,buf);
        gl.enableVertexAttribArray(loc.a_pos);
        gl.vertexAttribPointer(loc.a_pos,2,gl.FLOAT,false,0,0);
        gl.uniformMatrix4fv(loc.u_invProj,false,u.invProj);
        gl.uniform3f(loc.u_camPos,u.camPos[0],u.camPos[1],u.camPos[2]);
        gl.uniform3f(loc.u_sunDir,u.sunDir[0],u.sunDir[1],u.sunDir[2]);
        gl.uniform3f(loc.u_BR,M.BR[0],M.BR[1],M.BR[2]);
        gl.uniform3f(loc.u_BO,M.BO[0],M.BO[1],M.BO[2]);
        gl.uniform1f(loc.u_BM,M.BM); gl.uniform1f(loc.u_mieExt,M.MIE_EXT);
        gl.uniform1f(loc.u_HR,M.HR); gl.uniform1f(loc.u_HM,M.HM);
        gl.uniform1f(loc.u_RG,M.RG); gl.uniform1f(loc.u_RT,M.RT);
        gl.uniform1f(loc.u_sunI,M.SUN_I); gl.uniform1f(loc.u_exposure,M.EXPOSURE);
        gl.uniform1f(loc.u_gamma,M.GAMMA); gl.uniform1f(loc.u_g,M.G);
        gl.uniform1f(loc.u_msE0,M.ms.e0); gl.uniform1f(loc.u_msE1,M.ms.e1); gl.uniform1f(loc.u_msN,tables.msW);
        gl.uniform1f(loc.u_o3Peak,M.O3_PEAK); gl.uniform1f(loc.u_o3Half,M.O3_HALF);
        gl.uniform1f(loc.u_strength,(u.strength==null?1:u.strength));
        gl.uniform1f(loc.u_disc,(u.disc==null?0:u.disc));
        gl.uniform2f(loc.u_res,W,H);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,tSun); gl.uniform1i(loc.u_tSun,0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,tMs); gl.uniform1i(loc.u_tMs,1);
        gl.uniform1i(loc.u_bg,2);
        /* ⚠⚠ (#R237) NO BLENDING. The shader emits the COMPOSITE — what is behind, attenuated, plus
           what the air scatters in — so the framebuffer is replaced where the air has something to
           say and `discard`ed where it does not. Source-over was #R227's only option while the
           background was unreadable, and it is what forced the three-channel extinction into one
           luminance alpha; both go away with the copy above. */
        gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.TRIANGLES,0,3);
        drawn++;                       /* (#R236) counted only where the draw call actually issued */
        gl.activeTexture(gl.TEXTURE0);
      },
    };
  }
  return { makeLayer, MARCH_N, SUN_W, SUN_H };
};
