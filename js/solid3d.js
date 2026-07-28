/* ============================================================================
 *  IntMap · SOLID 3-D BODIES — a closed, filled polyhedron on the map  (#R173)
 * ----------------------------------------------------------------------------
 *  「3-D VolumeはPolygon以外で描画できない。また、下の面は色がついていない。多面体内部の空間も
 *    無色になっている。内部にシートなんていうあほなことをするな。ボケ。」
 *
 *  WHY THIS FILE EXISTS. MapLibre's `fill-extrusion` is a LID AND WALLS — an open tube. It has no
 *  downward-facing surface at all, so a "bottom face" cannot be expressed with it, and its interior
 *  is empty. #R172 tried to close it with a thin slab at the base plus horizontal sheets through the
 *  band, and that failed for a reason worth writing down: **fill-extrusion writes DEPTH**. Anything
 *  drawn inside the body afterwards is behind the near wall and is discarded by the depth test, so
 *  the floor and the sheets were never visible from outside at all. The right answer is not another
 *  layer of sheets; it is to draw the body as what it is — one closed mesh — and that needs the GPU
 *  directly, through MapLibre's `custom` layer contract.
 *
 *  WHAT IT DRAWS. A closed prism: the footprint triangulated as a BOTTOM cap and a TOP cap (ear
 *  clipping, so concave freehand outlines work), joined by wall quads with outward normals. It is
 *  rendered in two passes — back faces, then front faces — with depth TESTING on (so terrain and
 *  buildings still occlude it) but depth WRITING off (so the far side of the body is not thrown away
 *  by its own near side). Standing outside you therefore see through the near wall to the far wall
 *  and the floor; standing inside, the body still surrounds you.
 *
 *  WHY IT LOOKS LIKE A VOLUME AND NOT A SHELL. Absorption through a slab goes as the path length,
 *  which for a flat face is 1/|cos θ| of the thickness — so each fragment's alpha is
 *      1 − (1 − a)^(1 / |n·v|)
 *  with n the surface normal and v the direction from the eye. Faces seen edge-on are dense, faces
 *  seen square-on are light, and the body reads as filled glass instead of a cut-out. n and v are
 *  computed in a LOCAL METRIC frame (east/north/up metres about the footprint's centroid) so the
 *  angle is a real angle and not a mercator-distorted one.
 *
 *  PROJECTION. The shaders are built on MapLibre's own vertex prelude (`args.shaderData`), so the
 *  same mesh projects correctly in the flat regime and on the globe; the program is rebuilt whenever
 *  the renderer reports a different shader variant. Positions are mercator [0..1] with the altitude
 *  carried separately in METRES, which is what `projectTileFor3D` takes.
 *
 *  This file is the MapLibre ADAPTER's implementation detail. Nothing outside IntMapGeoEngine's
 *  `layers.addSolid/setSolid/removeSolid` may reach for it, and a future Earth/Cesium adapter answers
 *  the same three calls with its own primitive.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.solid3d=function(){
  const R=6371008.8, D2R=Math.PI/180;
  /* the WGS84 equatorial circumference MapLibre's mercator is built on — one mercator unit of altitude at
     latitude φ is MERC_CIRC·cos φ metres (see the altitude-unit note in render) */
  const MERC_CIRC=2*Math.PI*6378137;
  /* mercator [0..1] from lng/lat — the coordinate space MapLibre hands custom layers */
  function merc(lng,lat){
    const x=(180+lng)/360;
    const s=Math.sin(Math.max(-85.051129,Math.min(85.051129,lat))*D2R);
    const y=(180-(180/Math.PI)*Math.log((1+s)/(1-s))/2)/360;
    return [x,y];
  }
  /* signed area of a ring in mercator units — the sign tells us the winding */
  function ringArea(p){ let a=0; for(let i=0,j=p.length-1;i<p.length;j=i++) a+=(p[j][0]*p[i][1]-p[i][0]*p[j][1]); return a/2; }
  /* Ear clipping. O(n²), which for a footprint of ≤ a few hundred points is nothing, and unlike a
     fan it survives the concave outlines a traced freehand shape produces. */
  function triangulate(p){
    const n=p.length; if(n<3) return [];
    const idx=[]; for(let i=0;i<n;i++) idx.push(i);
    if(ringArea(p)<0) idx.reverse();                       /* work counter-clockwise */
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const inside=(a,b,c,q)=>cross(a,b,q)>=0&&cross(b,c,q)>=0&&cross(c,a,q)>=0;
    const out=[]; let guard=0;
    while(idx.length>3&&guard++<n*n+64){
      let clipped=false;
      for(let i=0;i<idx.length;i++){
        const i0=idx[(i+idx.length-1)%idx.length], i1=idx[i], i2=idx[(i+1)%idx.length];
        const a=p[i0], b=p[i1], c=p[i2];
        if(cross(a,b,c)<=0) continue;                      /* reflex — not an ear */
        let ok=true;
        for(let k=0;k<idx.length;k++){ const m=idx[k];
          if(m===i0||m===i1||m===i2) continue;
          if(inside(a,b,c,p[m])){ ok=false; break; } }
        if(!ok) continue;
        out.push(i0,i1,i2); idx.splice(i,1); clipped=true; break;
      }
      if(!clipped) break;                                  /* self-intersecting ring — keep what we have */
    }
    if(idx.length===3) out.push(idx[0],idx[1],idx[2]);
    return out;
  }
  /* ---- shaders ---------------------------------------------------------------------------- */
  const VERT=`
in vec2 a_pos;      /* mercator [0..1] */
in float a_alt;     /* metres above sea level (or above ground when terrain is on) */
in vec3 a_local;    /* east / north / up metres, about the footprint centroid */
in vec3 a_norm;     /* outward normal in the same metric frame */
uniform float u_altScale;   /* metres → whatever THIS variant's prelude wants (see render) */
out vec3 v_local;
out vec3 v_norm;
void main(){
  v_local=a_local; v_norm=a_norm;
  gl_Position=projectTileFor3D(a_pos, a_alt*u_altScale);
}`;
  const FRAG=`
precision highp float;
in vec3 v_local;
in vec3 v_norm;
uniform vec3 u_eye;      /* the viewpoint in the same metric frame */
uniform vec3 u_color;
uniform float u_alpha;   /* the body's opacity, as a per-unit-face absorption */
out vec4 fragColor;
void main(){
  vec3 n=normalize(v_norm);
  vec3 v=normalize(v_local-u_eye);
  float c=max(0.22, abs(dot(n,v)));                 /* path through the face ∝ 1/|n·v| */
  /* the slider is the opacity of the BODY seen square-on, and a ray crosses two faces to get through
     it — so each face carries the square root of it, and the two compose back to what was asked for */
  float face=1.0-sqrt(max(0.0,1.0-u_alpha));
  float a=clamp(1.0-pow(1.0-face,1.0/c),0.0,0.985);
  /* a little shape: the lid catches the light, the floor is in shadow, the walls sit between */
  float lit=0.80+0.20*n.z;
  vec3 rgb=u_color*lit;
  fragColor=vec4(rgb*a,a);                          /* premultiplied — MapLibre blends [ONE, 1-SRC_ALPHA] */
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
    return { p, a:{ pos:gl.getAttribLocation(p,'a_pos'), alt:gl.getAttribLocation(p,'a_alt'),
                    local:gl.getAttribLocation(p,'a_local'), norm:gl.getAttribLocation(p,'a_norm') },
             u:{ eye:loc('u_eye'), color:loc('u_color'), alpha:loc('u_alpha'), altScale:loc('u_altScale'),
                 mat:loc('u_projection_matrix'), fallback:loc('u_projection_fallback_matrix'),
                 tileCoords:loc('u_projection_tile_mercator_coords'), clip:loc('u_projection_clipping_plane'),
                 transition:loc('u_projection_transition') } };
  }

  /* ---- one body --------------------------------------------------------------------------- */
  function makeLayer(id){
    const S={ ring:[], base:0, top:0, color:[0.04,0.52,1], alpha:0.45, visible:false, eye:null };
    let gl=null, prog=null, variant=null, vao=null, bPos=null, bAlt=null, bLocal=null, bNorm=null, bIdx=null, nIdx=0, dirty=true, mapRef=null;

    function build(){
      dirty=false; nIdx=0;
      const r=S.ring; if(!(r&&r.length>=3)||!gl) return;
      /* de-duplicate a closed ring's repeated last point */
      const pts=r.slice(); if(pts.length>3){ const a=pts[0], b=pts[pts.length-1];
        if(Math.abs(a[0]-b[0])<1e-12&&Math.abs(a[1]-b[1])<1e-12) pts.pop(); }
      const n=pts.length; if(n<3) return;
      let cLng=0,cLat=0; for(const p of pts){ cLng+=p[0]; cLat+=p[1]; } cLng/=n; cLat/=n;
      const mLat=R*D2R, mLng=R*D2R*Math.cos(cLat*D2R);
      const mp=pts.map(p=>merc(p[0],p[1]));
      const lp=pts.map(p=>[(p[0]-cLng)*mLng,(p[1]-cLat)*mLat]);
      const tri=triangulate(mp);
      const pos=[], alt=[], loc=[], nrm=[], idx=[];
      const push=(i,z,zl,nx,ny,nz)=>{ pos.push(mp[i][0],mp[i][1]); alt.push(z); loc.push(lp[i][0],lp[i][1],zl); nrm.push(nx,ny,nz); return (pos.length/2)-1; };
      /* caps — the BOTTOM one is the face MapLibre cannot make */
      const capTop=[], capBot=[];
      for(let i=0;i<n;i++){ capTop.push(push(i,S.top,S.top,0,0,1)); capBot.push(push(i,S.base,S.base,0,0,-1)); }
      for(let t=0;t<tri.length;t+=3){
        idx.push(capTop[tri[t]],capTop[tri[t+1]],capTop[tri[t+2]]);          /* lid, outward = up */
        idx.push(capBot[tri[t+2]],capBot[tri[t+1]],capBot[tri[t]]);          /* floor, outward = down */
      }
      /* walls — their own vertices so each face keeps a flat outward normal */
      const ccw=ringArea(mp)>=0;
      for(let i=0;i<n;i++){
        const j=(i+1)%n;
        let ex=lp[j][0]-lp[i][0], ey=lp[j][1]-lp[i][1];
        const len=Math.hypot(ex,ey)||1; ex/=len; ey/=len;
        /* outward normal of an edge is its right-hand side when the ring runs counter-clockwise */
        const nx=ccw?ey:-ey, ny=ccw?-ex:ex;
        const a=push(i,S.base,S.base,nx,ny,0), b=push(j,S.base,S.base,nx,ny,0),
              c=push(j,S.top,S.top,nx,ny,0),   d=push(i,S.top,S.top,nx,ny,0);
        if(ccw) idx.push(a,b,c, a,c,d); else idx.push(a,c,b, a,d,c);
      }
      const put=(buf,arr,Type)=>{ gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,new Type(arr),gl.DYNAMIC_DRAW); };
      put(bPos,pos,Float32Array); put(bAlt,alt,Float32Array); put(bLocal,loc,Float32Array); put(bNorm,nrm,Float32Array);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,bIdx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(idx),gl.DYNAMIC_DRAW);
      nIdx=idx.length;
      S.origin={lng:cLng,lat:cLat,mLng,mLat};
    }

    return {
      id, type:'custom', renderingMode:'3d',
      /* the module keeps its own state so the adapter can set it before or after the layer is added */
      _state:S,
      _set(o){ if(!o) return;
        if(o.ring){ S.ring=o.ring.map(p=>[+p[0],+p[1]]); dirty=true; }
        if(o.base!=null&&isFinite(o.base)&&o.base!==S.base){ S.base=+o.base; dirty=true; }
        if(o.top!=null&&isFinite(o.top)&&o.top!==S.top){ S.top=+o.top; dirty=true; }
        if(o.color){ const c=String(o.color).replace('#',''); const h=c.length===3?c.split('').map(x=>x+x).join(''):c;
          const v=parseInt(h,16); if(isFinite(v)) S.color=[((v>>16)&255)/255,((v>>8)&255)/255,(v&255)/255]; }
        if(o.opacity!=null&&isFinite(o.opacity)) S.alpha=Math.max(0.02,Math.min(0.98,+o.opacity));
        if(o.eye) S.eye=o.eye;
        try{ if(mapRef&&mapRef.triggerRepaint) mapRef.triggerRepaint(); }catch(_){}
      },
      onAdd(map,ctx){ mapRef=map; gl=ctx;
        bPos=gl.createBuffer(); bAlt=gl.createBuffer(); bLocal=gl.createBuffer(); bNorm=gl.createBuffer(); bIdx=gl.createBuffer();
        dirty=true;
      },
      onRemove(map,ctx){ const g=ctx||gl; if(!g) return;
        try{ [bPos,bAlt,bLocal,bNorm,bIdx].forEach(b=>b&&g.deleteBuffer(b)); }catch(_){}
        try{ if(prog) g.deleteProgram(prog.p); }catch(_){}
        prog=null; variant=null; gl=null;
      },
      render(ctx,args){
        gl=ctx;
        if(!S.ring||S.ring.length<3) return;
        const sd=args&&args.shaderData, vname=(sd&&sd.variantName)||'mercator';
        if(!prog||variant!==vname){ try{ if(prog) gl.deleteProgram(prog.p); prog=compile(gl,sd); variant=vname; }
          catch(e){ prog=null; try{ console.warn('[IntMap solid3d]',e&&e.message); }catch(_){} return; } }
        if(dirty) build();
        if(!nIdx||!prog) return;
        const P=args&&args.defaultProjectionData;
        gl.useProgram(prog.p);
        try{
          if(prog.u.mat&&P&&P.mainMatrix) gl.uniformMatrix4fv(prog.u.mat,false,new Float32Array(P.mainMatrix));
          if(prog.u.fallback&&P&&P.fallbackMatrix) gl.uniformMatrix4fv(prog.u.fallback,false,new Float32Array(P.fallbackMatrix));
          if(prog.u.tileCoords&&P&&P.tileMercatorCoords) gl.uniform4fv(prog.u.tileCoords,new Float32Array(P.tileMercatorCoords));
          if(prog.u.clip&&P&&P.clippingPlane) gl.uniform4fv(prog.u.clip,new Float32Array(P.clippingPlane));
          if(prog.u.transition) gl.uniform1f(prog.u.transition,(P&&typeof P.projectionTransition==='number')?P.projectionTransition:0);
        }catch(_){}
        /* the viewpoint, in the body's own metric frame */
        let ex=0,ey=0,ez=1e7;
        try{ const o=S.origin, e=S.eye;
          if(o&&e){ ex=(e.lng-o.lng)*o.mLng; ey=(e.lat-o.lat)*o.mLat; ez=e.alt; } }catch(_){}
        gl.uniform3f(prog.u.eye,ex,ey,ez);
        gl.uniform3f(prog.u.color,S.color[0],S.color[1],S.color[2]);
        gl.uniform1f(prog.u.alpha,S.alpha);
        /* (#R174) THE ALTITUDE UNIT IS NOT THE SAME IN BOTH PRELUDES — this is why the body vanished the
           moment you zoomed in (「しかもズームしたら立体が消える！」).
           `projectTileFor3D(pos, elevation)` takes METRES in the globe prelude and MERCATOR UNITS in the
           mercator one, and this file handed it metres either way. The app's globe is plain mercator from
           z12 up, so from z12 every vertex was pushed to a clip-space z past the far plane and discarded.
           Measured directly against the renderer's own answer for (139.76, 35.68) at 3,000 m: at z12 the
           true screen position is y=183, metres-as-elevation lands it at y=1,902 with ndc z=1.0139 (outside
           [-1,1] → clipped), and altitude/(2πR·cos φ) lands it at y=184, ndc z=0.984. Same at z13 (−39 vs
           −38) and z15 (−6,766 vs −6,722). One scale factor, chosen by the variant the renderer reports. */
        gl.uniform1f(prog.u.altScale, (vname==='mercator')
          ? 1/Math.max(1, MERC_CIRC*Math.cos(((S.origin&&S.origin.lat)||0)*D2R))
          : 1);
        const bind=(buf,loc,size)=>{ if(loc<0) return; gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0); };
        bind(bPos,prog.a.pos,2); bind(bAlt,prog.a.alt,1); bind(bLocal,prog.a.local,3); bind(bNorm,prog.a.norm,3);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,bIdx);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
        gl.enable(gl.CULL_FACE);
        /* far side first, near side over it — the body's own two skins, in the only order that
           composites correctly without a depth sort */
        gl.cullFace(gl.FRONT); gl.drawElements(gl.TRIANGLES,nIdx,gl.UNSIGNED_INT,0);
        gl.cullFace(gl.BACK);  gl.drawElements(gl.TRIANGLES,nIdx,gl.UNSIGNED_INT,0);
        gl.disable(gl.CULL_FACE); gl.depthMask(true);
      }
    };
  }
  return { makeLayer };
};
