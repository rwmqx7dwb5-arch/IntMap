/* ============================================================================
 *  IntMap · SATELLITES WHERE THEY ACTUALLY ARE — points in orbit  (#R202)
 * ----------------------------------------------------------------------------
 *  「すべての地球周囲にある衛星をリアルタイムで実場所でアニメーションで見られるレイヤーを作って。」
 *
 *  #R184 drew the live catalogue at each object's SUB-SATELLITE POINT — the spot on the ground it is
 *  directly above — and wrote down why: a map is a surface, and 35,786 km of altitude drawn on it
 *  would be off every screen. That reasoning is sound for a flat map and it is the wrong answer to
 *  the question asked here, which is to see the objects AROUND the Earth. The app's default
 *  projection is a globe, the globe is a real sphere, and MapLibre v5 hands custom layers a
 *  `projectTileFor3D(mercatorXY, elevationMetres)` that is correct in both regimes. So the honest
 *  drawing exists now: each object at its own altitude, in orbit, at real scale.
 *
 *  ── WHAT IS DRAWN AND WHAT IS NOT ────────────────────────────────────────────────────────────
 *  Round point sprites, one per object, sized by orbit regime and coloured the way the ground layer
 *  colours them, so the two readings of the same catalogue agree. Nothing here invents a position:
 *  the mercator/altitude pairs come from the SGP4 propagation js/satellites-live.js already runs.
 *
 *  ── HOW IT MOVES BETWEEN PROPAGATIONS ────────────────────────────────────────────────────────
 *  SGP4 for eleven thousand objects is ~21 ms, which is a third of a frame — so it runs on its own
 *  slow tick, and the frames in between are covered by the RATE the same propagation returns. Both
 *  the position and its first derivative are uploaded once per tick and the shader advances the
 *  point by `u_dt` seconds. The CPU therefore does nothing per frame, and the motion is continuous
 *  rather than a step every second. Over one tick a low-orbit object moves ~0.06° of arc and the
 *  linear term is accurate to far under a pixel; the next propagation replaces it outright, so the
 *  approximation never accumulates.
 *
 *  ⚠ MERCATOR Y IS NOT CLAMPED. A sun-synchronous object passes within a couple of degrees of the
 *  pole, where mercator y leaves [0,1] entirely; the globe prelude inverts y through the same
 *  Gudermannian at any value, so leaving it unbounded is what puts a polar pass over the pole. It is
 *  the flat regime that cannot draw it — and there the point is simply off the top of the map, which
 *  is where a pole is in mercator.
 *
 *  This file is the MapLibre ADAPTER's implementation detail, exactly as js/solid3d.js is. Nothing
 *  outside IntMapGeoEngine's `layers.addOrbit/setOrbit/removeOrbit` may reach for it.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.orbitPoints=function(){
  const D2R=Math.PI/180;
  /* the WGS84 equatorial circumference MapLibre's mercator is built on — one mercator unit of
     altitude at latitude φ is MERC_CIRC·cos φ metres (the #R174 lesson, from js/solid3d.js) */
  const MERC_CIRC=2*Math.PI*6378137;

  const VERT=`
in vec2 a_pos;        /* mercator [0..1] at the last propagation */
in vec2 a_vel;        /* d(mercator)/dt, per second */
in float a_alt;       /* metres above the sphere at the last propagation */
in float a_altv;      /* d(altitude)/dt, metres per second */
in float a_mscale;    /* metres → mercator units at THIS point's latitude */
in vec4 a_col;        /* rgba, 0..1 */
in float a_size;      /* device pixels */
uniform float u_dt;         /* seconds since the propagation the buffers hold */
uniform float u_altScale;   /* 0 = the prelude wants metres (globe), 1 = mercator units */
uniform float u_pxRatio;
out vec4 v_col;
void main(){
  v_col=a_col;
  vec2 p=a_pos+a_vel*u_dt;
  float alt=a_alt+a_altv*u_dt;
  float e=mix(alt, alt*a_mscale, u_altScale);
  gl_Position=projectTileFor3D(p, e);
  gl_PointSize=a_size*u_pxRatio;
}`;
  const FRAG=`
precision mediump float;
in vec4 v_col;
out vec4 fragColor;
void main(){
  /* a round dot with a soft edge — the same reading the ground layer's halo gives */
  vec2 d=gl_PointCoord-vec2(0.5);
  float r=length(d)*2.0;
  float a=smoothstep(1.0,0.55,r);
  if(a<=0.003) discard;
  fragColor=vec4(v_col.rgb*v_col.a*a, v_col.a*a);
}`;

  function compile(gl,shaderData){
    const pre=(shaderData&&shaderData.vertexShaderPrelude)||'uniform mat4 u_projection_matrix;\nvec4 projectTileFor3D(vec2 p,float e){return u_projection_matrix*vec4(p,e,1.0);}';
    const def=(shaderData&&shaderData.define)||'';
    const mk=(type,src)=>{ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)||'shader');
      return s; };
    const v=mk(gl.VERTEX_SHADER,'#version 300 es\n'+def+'\n'+pre+'\n'+VERT);
    const f=mk(gl.FRAGMENT_SHADER,'#version 300 es\n'+def+'\n'+FRAG);
    const p=gl.createProgram(); gl.attachShader(p,v); gl.attachShader(p,f); gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)||'link');
    gl.deleteShader(v); gl.deleteShader(f);
    const loc=n=>gl.getUniformLocation(p,n);
    return { p, a:{ pos:gl.getAttribLocation(p,'a_pos'), vel:gl.getAttribLocation(p,'a_vel'),
                    alt:gl.getAttribLocation(p,'a_alt'), altv:gl.getAttribLocation(p,'a_altv'),
                    mscale:gl.getAttribLocation(p,'a_mscale'), col:gl.getAttribLocation(p,'a_col'),
                    size:gl.getAttribLocation(p,'a_size') },
             u:{ dt:loc('u_dt'), altScale:loc('u_altScale'), pxRatio:loc('u_pxRatio'),
                 mat:loc('u_projection_matrix'), fallback:loc('u_projection_fallback_matrix'),
                 tileCoords:loc('u_projection_tile_mercator_coords'), clip:loc('u_projection_clipping_plane'),
                 transition:loc('u_projection_transition') } };
  }

  /** mercator [0..1] from lng/lat — UNCLAMPED in y, see the header */
  function merc(lng,lat){
    const x=(180+lng)/360;
    const p=Math.max(-89.9999,Math.min(89.9999,lat))*D2R;
    const y=(180-(180/Math.PI)*Math.log(Math.tan(Math.PI/4+p/2)))/360;
    return [x,y];
  }

  function makeLayer(id){
    const S={ n:0, t0:0, visible:true, opacity:1 };
    let gl=null, prog=null, variant=null, mapRef=null, dirty=false;
    let bPos=null,bVel=null,bAlt=null,bAltV=null,bMs=null,bCol=null,bSz=null;
    let aPos=null,aVel=null,aAlt=null,aAltV=null,aMs=null,aCol=null,aSz=null;

    /* Build the GPU-side arrays from the propagation. `list` items carry lng/lat/altKm and the rate
       of change of each, plus a colour and a size. Everything is precomputed here, once per tick. */
    function pack(list){
      const n=list.length;
      aPos=new Float32Array(n*2); aVel=new Float32Array(n*2);
      aAlt=new Float32Array(n);   aAltV=new Float32Array(n);
      aMs=new Float32Array(n);    aCol=new Float32Array(n*4); aSz=new Float32Array(n);
      for(let i=0;i<n;i++){
        const f=list[i];
        const m=merc(f.lng,f.lat);
        aPos[i*2]=m[0]; aPos[i*2+1]=m[1];
        /* the rate, in the same coordinates: a finite difference over one second of the propagation,
           supplied by the caller as the position one second later (lng2/lat2/alt2) */
        const m2=merc(f.lng2,f.lat2);
        let dx=m2[0]-m[0];
        if(dx>0.5) dx-=1; else if(dx<-0.5) dx+=1;      /* an antimeridian crossing is not a lap of the planet */
        aVel[i*2]=dx; aVel[i*2+1]=m2[1]-m[1];
        aAlt[i]=f.altKm*1000; aAltV[i]=(f.alt2Km-f.altKm)*1000;
        aMs[i]=1/Math.max(1,MERC_CIRC*Math.cos(f.lat*D2R));
        const c=f.rgba;
        aCol[i*4]=c[0]/255; aCol[i*4+1]=c[1]/255; aCol[i*4+2]=c[2]/255; aCol[i*4+3]=c[3]/255;
        aSz[i]=f.size;
      }
      S.n=n; dirty=true;
    }
    function upload(){
      dirty=false;
      const put=(buf,arr)=>{ gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,arr,gl.DYNAMIC_DRAW); };
      put(bPos,aPos); put(bVel,aVel); put(bAlt,aAlt); put(bAltV,aAltV); put(bMs,aMs); put(bCol,aCol); put(bSz,aSz);
    }

    return {
      id, type:'custom', renderingMode:'3d',
      _state:S,
      /** o.list = the propagation; o.t0 = performance.now() it is valid at; o.visible; o.opacity */
      _set(o){ if(!o) return;
        if(o.list){ pack(o.list); S.t0=(o.t0!=null)?o.t0:((typeof performance!=='undefined')?performance.now():Date.now()); }
        if(o.visible!=null) S.visible=!!o.visible;
        if(o.opacity!=null&&isFinite(o.opacity)) S.opacity=Math.max(0,Math.min(1,+o.opacity));
        try{ if(mapRef&&mapRef.triggerRepaint) mapRef.triggerRepaint(); }catch(_){}
      },
      onAdd(map,ctx){ mapRef=map; gl=ctx;
        bPos=gl.createBuffer(); bVel=gl.createBuffer(); bAlt=gl.createBuffer(); bAltV=gl.createBuffer();
        bMs=gl.createBuffer(); bCol=gl.createBuffer(); bSz=gl.createBuffer();
        dirty=!!aPos;
      },
      onRemove(map,ctx){ const g=ctx||gl; if(!g) return;
        try{ [bPos,bVel,bAlt,bAltV,bMs,bCol,bSz].forEach(b=>b&&g.deleteBuffer(b)); }catch(_){}
        try{ if(prog) g.deleteProgram(prog.p); }catch(_){}
        prog=null; variant=null; gl=null;
      },
      render(ctx,args){
        gl=ctx;
        if(!S.visible||!S.n||!aPos) return;
        const sd=args&&args.shaderData, vname=(sd&&sd.variantName)||'mercator';
        if(!prog||variant!==vname){ try{ if(prog) gl.deleteProgram(prog.p); prog=compile(gl,sd); variant=vname; }
          catch(e){ prog=null; try{ console.warn('[IntMap orbitPoints]',e&&e.message); }catch(_){} return; } }
        if(dirty) upload();
        if(!prog) return;
        const P=args&&args.defaultProjectionData;
        gl.useProgram(prog.p);
        try{
          if(prog.u.mat&&P&&P.mainMatrix) gl.uniformMatrix4fv(prog.u.mat,false,new Float32Array(P.mainMatrix));
          if(prog.u.fallback&&P&&P.fallbackMatrix) gl.uniformMatrix4fv(prog.u.fallback,false,new Float32Array(P.fallbackMatrix));
          if(prog.u.tileCoords&&P&&P.tileMercatorCoords) gl.uniform4fv(prog.u.tileCoords,new Float32Array(P.tileMercatorCoords));
          if(prog.u.clip&&P&&P.clippingPlane) gl.uniform4fv(prog.u.clip,new Float32Array(P.clippingPlane));
          if(prog.u.transition) gl.uniform1f(prog.u.transition,(P&&typeof P.projectionTransition==='number')?P.projectionTransition:0);
        }catch(_){}
        const now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
        /* ⚠ the extrapolation is CAPPED. If the propagation tick stalls — a hidden tab, a long task —
           an uncapped dt would fling every object along its last velocity for as long as the stall
           lasted, which is a picture of something that never happened. Past two ticks it holds. */
        gl.uniform1f(prog.u.dt,Math.max(0,Math.min(4,(now-S.t0)/1000)));
        gl.uniform1f(prog.u.altScale,(vname==='mercator')?1:0);
        let pr=1; try{ pr=Math.max(1,Math.min(3,window.devicePixelRatio||1)); }catch(_){}
        gl.uniform1f(prog.u.pxRatio,pr);
        const bind=(buf,loc,size)=>{ if(loc<0) return; gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0); };
        bind(bPos,prog.a.pos,2); bind(bVel,prog.a.vel,2); bind(bAlt,prog.a.alt,1); bind(bAltV,prog.a.altv,1);
        bind(bMs,prog.a.mscale,1); bind(bCol,prog.a.col,4); bind(bSz,prog.a.size,1);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        /* ⚠ DEPTH TESTED, NOT DEPTH WRITTEN. The globe's own surface is drawn before this layer and
           writes depth, so an object on the far side of the planet is discarded by the test — which
           is the whole point of drawing them in space rather than on the ground. Writing depth would
           make the sprites occlude each other's soft edges. */
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
        gl.drawArrays(gl.POINTS,0,S.n);
        gl.depthMask(true);
      }
    };
  }
  return { makeLayer, merc };
};
