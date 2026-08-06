/* ============================================================================
 *  IntMap · POLE-SAFE, SEAM-SAFE GEOMETRY — window.IntMapGeodesy  (#R196, split out of app-body.js)
 * ----------------------------------------------------------------------------
 *  「最大の問題は、中心部がまだ巨大なことです。app-body.js は約5,500行以上」 — index.html's TENTH split.
 *
 *  WHY THIS THEME. Everything below is a function of coordinates and nothing else: no DOM, no
 *  renderer, no app state, no `window`. That is rare in the shell and it is exactly what makes a
 *  split provable — the block moves BYTE FOR BYTE, and because it reads nothing from its old scope
 *  there is no free reference to hand over (the failure #R194 measured and scripts/check-split-scope.mjs
 *  now gates). It is also the first piece of the shell that can be tested WITHOUT a browser at all,
 *  which is why tests/r196-checks.test.mjs can assert the antimeridian behaviour in Node.
 *
 *  MEASURED SURFACE — the four counts #R195 established before claiming a theme is separable:
 *    public names 1 (window.IntMapGeodesy) · registrations 0 · flags 0 · free references to the shell 0.
 *
 *  ⚠ THE NAMES STAY THE NAMES. js/app-body.js re-binds every one of these under its original
 *  identifier, so IM_HOST, the tool panel, the seismic simulator, Atlas and the dashboard reach them
 *  exactly as they did — `diskFillPolys`, `diskOutlineLines`, `_splitLineToWindows`,
 *  `_gcRingUnwrapped`, `_splitPolyToWindows` are all already read from four other modules through
 *  IM_HOST, and none of those call sites changes.
 * ==========================================================================*/
window.IntMapGeodesy=(function(){
  /* ===== Antimeridian / pole-safe geometry for the measurement tools (#5,#6,#25) =====
     MapLibre (renderWorldCopies:false) cannot draw a polygon or line whose longitudes jump across
     ±180°, and a geodesic circle big enough to swallow a pole both crosses that seam AND wraps the
     pole. These helpers build geometry in CONTINUOUS (unwrapped) longitude, then split it into
     pieces that each stay inside [-180,180] — adding a polar cap, or using the antipodal
     complement — so a radius ring or great-circle area stays correct ANYWHERE on Earth. */
  const _R_EARTH_KM=6371.0088, _HALF_CIRCUM=Math.PI*_R_EARTH_KM;            /* ≈ 20015 km */
  const _d2r=d=>d*Math.PI/180, _r2d=r=>r*180/Math.PI;
  const _clampLat=la=>Math.max(-89.9999,Math.min(89.9999,la));
  function _dest(lon,lat,brgDeg,distKm){                                    /* geodesic destination */
    const dr=distKm/_R_EARTH_KM, br=_d2r(brgDeg), la1=_d2r(lat), lo1=_d2r(lon);
    const la2=Math.asin(Math.min(1,Math.max(-1,Math.sin(la1)*Math.cos(dr)+Math.cos(la1)*Math.sin(dr)*Math.cos(br))));
    const lo2=lo1+Math.atan2(Math.sin(br)*Math.sin(dr)*Math.cos(la1), Math.cos(dr)-Math.sin(la1)*Math.sin(la2));
    return [_r2d(lo2), _r2d(la2)];
  }
  function _gcPoints(a,b,n){                                                /* great-circle a→b, unwrapped lon */
    const la1=_d2r(a[1]),lo1=_d2r(a[0]),la2=_d2r(b[1]),lo2=_d2r(b[0]);
    const d=2*Math.asin(Math.min(1,Math.sqrt(Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2)));
    if(!isFinite(d)||d<1e-9) return [[a[0],_clampLat(a[1])],[b[0],_clampLat(b[1])]];
    const out=[]; let prev=null;
    for(let i=0;i<=n;i++){ const f=i/n, A=Math.sin((1-f)*d)/Math.sin(d), B=Math.sin(f*d)/Math.sin(d);
      const x=A*Math.cos(la1)*Math.cos(lo1)+B*Math.cos(la2)*Math.cos(lo2);
      const y=A*Math.cos(la1)*Math.sin(lo1)+B*Math.cos(la2)*Math.sin(lo2);
      const z=A*Math.sin(la1)+B*Math.sin(la2);
      let lat=_r2d(Math.atan2(z,Math.sqrt(x*x+y*y))), lon=_r2d(Math.atan2(y,x));
      if(prev!=null){ while(lon-prev>180)lon-=360; while(lon-prev<-180)lon+=360; } out.push([lon,_clampLat(lat)]); prev=lon; }
    return out;
  }
  /* closed great-circle ring through pts (each edge densified), longitudes continuous */
  function _gcRingUnwrapped(pts,nPerEdge){
    const closed=[...pts,pts[0]]; const ring=[]; let prev=null;
    for(let i=0;i<closed.length-1;i++){ const seg=_gcPoints(closed[i],closed[i+1],nPerEdge);
      seg.forEach(p=>{ let lo=p[0]; if(prev!=null){ while(lo-prev>180)lo-=360; while(lo-prev<-180)lo+=360; } ring.push([lo,p[1]]); prev=lo; }); }
    return ring;
  }
  function _clipHalf(poly,x,keepGE){                                        /* Sutherland–Hodgman vs a vertical line */
    const out=[]; const n=poly.length; if(!n) return out;
    for(let i=0;i<n;i++){ const a=poly[i], b=poly[(i+1)%n];
      const ai=keepGE?a[0]>=x:a[0]<=x, bi=keepGE?b[0]>=x:b[0]<=x;
      if(ai) out.push(a);
      if(ai!==bi){ const t=(x-a[0])/(b[0]-a[0]); out.push([x, a[1]+(b[1]-a[1])*t]); } }
    return out;
  }
  /* split a polygon given in CONTINUOUS lon into 1+ rings, each shifted into [-180,180] */
  function _splitPolyToWindows(poly){
    let mn=Infinity,mx=-Infinity; poly.forEach(p=>{ if(p[0]<mn)mn=p[0]; if(p[0]>mx)mx=p[0]; });
    const rings=[]; for(let k=Math.floor((mn+180)/360);k<=Math.floor((mx+180)/360);k++){
      let c=_clipHalf(poly,k*360-180,true); if(c.length<3) continue;
      c=_clipHalf(c,k*360+180,false); if(c.length<3) continue;
      rings.push(c.map(p=>[p[0]-k*360,_clampLat(p[1])])); }
    return rings;
  }
  /* split a CONTINUOUS-lon line into segments, each shifted into [-180,180] */
  function _splitLineToWindows(line){
    const segs=[]; let cur=[];
    for(let i=0;i<line.length;i++){ const p=line[i];
      if(cur.length){ const prev=cur[cur.length-1]; const k0=Math.round(prev[0]/360), k1=Math.round(p[0]/360);
        if(k0!==k1){ /* crossed a seam → break, inserting boundary points */
          const x=(Math.max(k0,k1))*360-180; const t=(x-prev[0])/(p[0]-prev[0]); const ly=prev[1]+(p[1]-prev[1])*t;
          cur.push([x,ly]); segs.push(cur); cur=[[x,ly]]; } }
      cur.push(p); }
    if(cur.length) segs.push(cur);
    return segs.map(s=>{ const k=Math.round(s[Math.floor(s.length/2)][0]/360); return s.map(p=>[p[0]-k*360,_clampLat(p[1])]); }).filter(s=>s.length>=2);
  }
  /* geodesic-disk fill polygons (array of GeoJSON Polygon coord arrays) for a radius circle */
  function diskFillPolys(center,radiusKm,steps){
    const clon=center[0], clat=center[1], R=Math.min(radiusKm,19500);
    const dNP=(90-clat)/180*_HALF_CIRCUM, dSP=(90+clat)/180*_HALF_CIRCUM, npIn=R>dNP, spIn=R>dSP;
    const ring=[]; let prev=null;
    for(let i=0;i<=steps;i++){ let p=_dest(clon,clat,(i/steps)*360,R); let lo=p[0];
      if(prev!=null){ while(lo-prev>180)lo-=360; while(lo-prev<-180)lo+=360; } ring.push([lo,_clampLat(p[1])]); prev=lo; }
    if(npIn&&spIn){                                                         /* disk covers ~everything → world minus antipodal hole */
      const antiLon=((clon+180+540)%360)-180;
      const holes=diskFillPolys([antiLon,-clat],_HALF_CIRCUM-R,steps).map(poly=>poly[0]);
      return [[[[-180,-89.9999],[180,-89.9999],[180,89.9999],[-180,89.9999],[-180,-89.9999]], ...holes]];
    }
    if(npIn||spIn){                                                         /* one pole inside → cap to the pole line */
      const cap=89.9999*(npIn?1:-1), capPoly=ring.concat([[ring[ring.length-1][0],cap],[ring[0][0],cap]]);
      return _splitPolyToWindows(capPoly).map(r=>[r]);
    }
    return _splitPolyToWindows(ring).map(r=>[r]);                           /* ordinary disk, maybe seam-split */
  }
  /* geodesic-disk outline lines (array of LineString coord arrays) */
  function diskOutlineLines(center,radiusKm,steps){
    const clon=center[0], clat=center[1], R=Math.min(radiusKm,19500);
    const ring=[]; let prev=null;
    for(let i=0;i<=steps;i++){ let p=_dest(clon,clat,(i/steps)*360,R); let lo=p[0];
      if(prev!=null){ while(lo-prev>180)lo-=360; while(lo-prev<-180)lo+=360; } ring.push([lo,_clampLat(p[1])]); prev=lo; }
    return _splitLineToWindows(ring);
  }

  /* CLAMP coordinates rather than dropping whole features (#5,#25): polar great-circle math can
     push a latitude past ±90 or emit a stray non-finite value. The old code discarded the entire
     feature, so a measurement passing near a pole simply vanished. Now we clamp latitude into the
     renderable band and only drop a vertex that is truly non-finite, so the shape stays visible. */
  function sanitizeFeatures(feats){
    const fixPos=p=>(Array.isArray(p)&&isFinite(p[0])&&isFinite(p[1]))?[p[0],Math.max(-89.9999,Math.min(89.9999,p[1]))]:null;
    const fixCoords=(c)=>{ if(!Array.isArray(c)) return null; if(typeof c[0]==='number') return fixPos(c);
      const out=c.map(fixCoords).filter(x=>x!=null); return out; };
    const out=[];
    feats.forEach(f=>{ try{ if(!f||!f.geometry) return; const g=f.geometry; const fixed=fixCoords(g.coordinates);
      if(fixed==null) return;
      const okPoint=(g.type==='Point')&&Array.isArray(fixed)&&fixed.length===2&&typeof fixed[0]==='number';
      const okLine=(g.type==='LineString')&&Array.isArray(fixed)&&fixed.length>=2;
      const okPoly=(g.type==='Polygon')&&Array.isArray(fixed)&&fixed[0]&&fixed[0].length>=4;
      const okML=(g.type==='MultiLineString')&&Array.isArray(fixed)&&fixed.length>=1;
      const okMP=(g.type==='MultiPolygon')&&Array.isArray(fixed)&&fixed.length>=1;
      if(okPoint||okLine||okPoly||okML||okMP){ out.push({...f,geometry:{...g,coordinates:fixed}}); }
    }catch(_){} });
    return out;
  }
  return { _R_EARTH_KM, _HALF_CIRCUM, _d2r, _r2d, _clampLat, _dest, _gcPoints, _gcRingUnwrapped,
           _clipHalf, _splitPolyToWindows, _splitLineToWindows, diskFillPolys, diskOutlineLines,
           sanitizeFeatures };
})();
