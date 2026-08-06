/* ============================================================================
 *  IntMap · THE NIGHT SIDE OF THE EARTH — window.IntMapNightSide  (#R196)
 * ----------------------------------------------------------------------------
 *  「地球全体が見えるズームレベルから、さらにズームアウトするほど、太陽の当たっていない部分が暗くなり、
 *    夜間光が見えるように。」
 *
 *  Two effects that both belong to ONE fact — where the Sun is — and both fade in as the camera pulls
 *  back to the whole-Earth view, because that is the only scale at which a planet has a day side and
 *  a night side at all:
 *
 *    ① THE SHADE. The unlit hemisphere is darkened. Not with the hard-edged terminator polygon the
 *       Earth Replay panel draws (js/sims.js) — from space the terminator is a ~1,300 km band, not a
 *       line — so this is FIVE nested rings at solar elevations 0°, −3°, −6°, −9° and −12°, each
 *       carrying a fifth of the darkening. Stacked they compose a smooth twilight gradient, and
 *       because they are geographic POLYGONS they cover the poles, which a Mercator image cannot.
 *
 *    ② THE LIGHTS. NASA's VIIRS "Black Marble" city-lights composite — the same GIBS product the
 *       app already offers as a manual layer (`dl-nightsat`, #R9/#39) — drawn ONLY where it is
 *       actually night. A raster layer cannot be masked to a shape, so the mask is baked into the
 *       pixels: one canvas whose RGB is Black Marble and whose ALPHA is (nightness × light
 *       brightness). On the day side the alpha is zero and the basemap is untouched.
 *
 *  ⚠ THE IMAGE IS PLACED THROUGH `imageRowLatitudes` (#R195). A canvas source is one quad whose
 *  texture runs linearly in the RENDERER's vertical coordinate — Mercator on MapLibre, geographic on
 *  Cesium. Sampling the Black Marble mosaic at equal steps of latitude and hoping is exactly the
 *  8.05° error #R195 measured on the tsunami. Every output row asks the engine what latitude it is.
 *
 *  ⚠ NOTHING RUNS PER FRAME, AND NOTHING RUNS AT ALL UNTIL IT WOULD BE VISIBLE. The zoom ramp is a
 *  style EXPRESSION (`interpolate` on zoom), so panning and zooming cost the renderer what they
 *  already cost and this file zero. The layers are not created — and the 16 Black Marble tiles are
 *  not fetched — until the camera first reaches a zoom where the effect has any opacity.
 *
 *  DATA: NASA EOSDIS GIBS, VIIRS_Black_Marble (2016-01-01 composite). Already declared in the app's
 *  sources/privacy pages for the manual layer; this is the same service and the same product.
 * ==========================================================================*/
window.IntMapNightSide=(function(){
  'use strict';
  const GE=()=>window.IntMapGeoEngine;
  const SRC='im-night-src', LYR='im-night-shade', DYN='im-night-lights';
  const D=Math.PI/180;

  /* the zoom ramp, as ONE expression shared by both effects: full strength when the globe fills the
     view, gone by the time a continent does. */
  const RAMP_STOPS=[[0,1],[1.6,0.86],[3,0.42],[4.6,0]];
  /* ⚠ A ZOOM EXPRESSION MAY ONLY BE THE OUTERMOST ONE. `['*', ['get','a'], ['interpolate',…zoom…]]`
     is a well-formed-looking style that MapLibre REJECTS — and addLayer swallows the rejection, so
     the first version of this file reported `built: true` with no shade layer in the style at all
     and a globe that looked exactly as it had before. Measured, not reasoned: `map.getLayer(...)`
     returned null. The scale therefore multiplies the STOPS, which needs no data-driven term. */
  const ramp=(k)=>['interpolate',['linear'],['zoom']].concat(...RAMP_STOPS.map(([z,v])=>[z,+(v*k).toFixed(5)]));
  const RAMP=ramp(1);
  const ZMAX=4.6;                       /* above this the ramp is 0 — nothing is built */
  const SHADE='#03060f';
  const RINGS=[0,-3,-6,-9,-12];         /* solar elevation, degrees: day → astronomical twilight */
  const SHADE_MAX=0.78;                 /* total darkening at full night, at the widest zoom */

  let built=false, lights=null, lightsTried=false, lastKey='', enabled=true, wired=false, lastErr=null;

  /* ── the Sun, by the same formulae the Earth Replay terminator uses (js/sims.js) ──────────────── */
  const J1970=2440588, J2000=2451545, dayMs=86400000, ecl=23.4397*D;
  function solar(date){
    const d=date.valueOf()/dayMs-0.5+J1970-J2000;
    const M=D*(357.5291+0.98560028*d);
    const C=D*(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M));
    const Lm=M+C+D*102.9372+Math.PI;
    return { d, dec:Math.asin(Math.sin(ecl)*Math.sin(Lm)), ra:Math.atan2(Math.sin(Lm)*Math.cos(ecl),Math.cos(Lm)) };
  }
  /* the latitude at which the Sun stands at elevation `elevDeg` for this longitude */
  function ringLat(S,lngDeg,elevDeg){
    const th=D*(280.16+360.9856235*S.d)+D*lngDeg, H=th-S.ra;
    const h=elevDeg*D, dec=S.dec;
    /* sin h = sin φ sin δ + cos φ cos δ cos H  →  solve for φ:
       write A = sin δ, B = cos δ cos H; then A sin φ + B cos φ = sin h, i.e.
       R sin(φ + ψ) = sin h with R = √(A²+B²), ψ = atan2(B, A). */
    const A=Math.sin(dec), B=Math.cos(dec)*Math.cos(H);
    const R=Math.hypot(A,B); if(!(R>1e-9)) return null;
    const s=Math.sin(h)/R; if(s>1||s<-1) return null;                 /* no such latitude at this longitude */
    const psi=Math.atan2(B,A);
    /* two roots; the terminator we want is the one that keeps the DARK pole inside the ring */
    const p1=Math.asin(s)-psi, p2=Math.PI-Math.asin(s)-psi;
    const norm=(p)=>{ let v=p; while(v>Math.PI/2) v-=Math.PI; while(v<-Math.PI/2) v+=Math.PI; return v; };
    const c1=norm(p1), c2=norm(p2);
    /* pick the root whose own elevation really is `elevDeg` (the normalisation can pick the mirror) */
    const el=(phi)=>Math.asin(Math.sin(phi)*A+Math.cos(phi)*B);
    return (Math.abs(el(c1)-h)<Math.abs(el(c2)-h)?c1:c2)/D;
  }
  /* a closed ring along that curve, shut over the pole that is in darkness */
  function ringFC(date){
    const S=solar(date), feats=[];
    const darkPole=(S.dec>0)?-90:90;
    for(let k=0;k<RINGS.length;k++){
      const pts=[]; let ok=true;
      for(let lng=-180;lng<=180;lng+=3){
        const la=ringLat(S,lng,RINGS[k]);
        if(la==null){ ok=false; break; }
        pts.push([lng,Math.max(-89.6,Math.min(89.6,la))]);
      }
      /* no such curve (the Sun never reaches that elevation at some longitude): the whole cap is
         darker than the threshold, so the ring degenerates to the pole cap itself */
      if(!ok||pts.length<4) continue;
      const ring=pts.concat([[180,darkPole],[-180,darkPole],[pts[0][0],pts[0][1]]]);
      feats.push({ type:'Feature', properties:{ elev:RINGS[k] },
                   geometry:{ type:'Polygon', coordinates:[ring] } });
    }
    return { type:'FeatureCollection', features:feats };
  }
  /* nightness ∈ [0,1] at a point: 0 with the Sun on the horizon, 1 at −12° (nautical twilight's end),
     smoothstepped so the band has no visible edge */
  function nightAt(S,lngDeg,latDeg){
    const th=D*(280.16+360.9856235*S.d)+D*lngDeg, H=th-S.ra, ph=latDeg*D;
    const sinEl=Math.sin(ph)*Math.sin(S.dec)+Math.cos(ph)*Math.cos(S.dec)*Math.cos(H);
    const el=Math.asin(Math.max(-1,Math.min(1,sinEl)))/D;
    const t=Math.max(0,Math.min(1,(-el)/12));
    return t*t*(3-2*t);
  }

  /* ── the Black Marble mosaic, fetched once ───────────────────────────────────────────────────── */
  const LIGHT_Z=2, LIGHT_TILE=256;
  function loadLights(){
    if(lights||lightsTried) return Promise.resolve(lights);
    lightsTried=true;
    const n=1<<LIGHT_Z, W=n*LIGHT_TILE;
    const cv=document.createElement('canvas'); cv.width=W; cv.height=W;
    const cx=cv.getContext('2d',{willReadFrequently:true});
    const one=(x,y)=>new Promise((res)=>{
      const im=new Image(); im.crossOrigin='anonymous';
      im.onload=()=>{ try{ cx.drawImage(im,x*LIGHT_TILE,y*LIGHT_TILE,LIGHT_TILE,LIGHT_TILE); }catch(_){} res(true); };
      im.onerror=()=>res(false);
      im.src='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/'
        +'GoogleMapsCompatible_Level8/'+LIGHT_Z+'/'+y+'/'+x+'.png';
    });
    const jobs=[]; for(let y=0;y<n;y++) for(let x=0;x<n;x++) jobs.push(one(x,y));
    return Promise.all(jobs).then((oks)=>{
      if(!oks.some(Boolean)){ lastErr='lights'; return null; }
      try{ lights={ w:W, h:W, d:cx.getImageData(0,0,W,W).data }; }catch(_){ lastErr='lights-cors'; lights=null; }
      return lights;
    }).catch(()=>{ lastErr='lights'; return null; });
  }

  /* ── the layers ──────────────────────────────────────────────────────────────────────────────── */
  const LIM=85.051129;
  const COORDS=[[-180,LIM],[180,LIM],[180,-LIM],[-180,-LIM]];
  function imgSize(){ let mob=false; try{ mob=/Mobi|Android|iPhone|iPad/.test(navigator.userAgent||''); }catch(_){}
    return mob?512:1024; }
  function beforeId(){
    for(const id of ['ofm-country','ofm-city','ofm-other','tool-poly'])
      { try{ if(GE().layers.has(id)) return id; }catch(_){} }
    return undefined;
  }
  function clockMs(){
    try{ const T=window.IntMapTime; if(T&&T.now){ const d=T.now(); const v=(d instanceof Date)?d.getTime():+d; if(isFinite(v)) return v; } }catch(_){}
    return Date.now();
  }
  function drawLights(ctx,W,H){
    ctx.clearRect(0,0,W,H);
    const rows=(()=>{ try{ return GE().layers.imageRowLatitudes(COORDS,H); }catch(_){ return null; } })();
    const S=solar(new Date(clockMs()));
    const out=ctx.createImageData(W,H), o=out.data;
    const L=lights;
    for(let r=0;r<H;r++){
      const lat=rows?rows[r]:(LIM-(2*LIM)*(r+0.5)/H);
      /* the source mosaic is Web-Mercator, so its own row for this latitude is a Mercator lookup */
      let sy=0;
      if(L){ const my=Math.log(Math.tan(Math.PI/4+Math.max(-LIM,Math.min(LIM,lat))*D/2));
        const y0=Math.log(Math.tan(Math.PI/4+LIM*D/2));
        sy=Math.max(0,Math.min(L.h-1,Math.round((y0-my)/(2*y0)*L.h))); }
      for(let c=0;c<W;c++){
        const lng=-180+360*(c+0.5)/W;
        const n=nightAt(S,lng,lat);
        const k=(r*W+c)*4;
        if(n<=0.01||!L){ o[k+3]=0; continue; }
        const sx=Math.max(0,Math.min(L.w-1,Math.round((lng+180)/360*L.w)));
        const j=(sy*L.w+sx)*4;
        const R=L.d[j], G=L.d[j+1], B=L.d[j+2];
        const lum=(R*0.30+G*0.59+B*0.11)/255;
        if(lum<=0.02){ o[k+3]=0; continue; }
        /* the lights keep their own colour; only how much of them survives is ours */
        o[k]=Math.min(255,Math.round(R*1.15+18));
        o[k+1]=Math.min(255,Math.round(G*1.10+14));
        o[k+2]=Math.min(255,Math.round(B*1.00+8));
        o[k+3]=Math.round(255*n*Math.pow(lum,0.72));
      }
    }
    ctx.putImageData(out,0,0);
  }

  function zoomNow(){ try{ const c=GE().camera.get(); return (c&&isFinite(c.zoom))?c.zoom:99; }catch(_){ return 99; } }

  function build(){
    if(built) return true;
    try{ if(!GE().hasRenderer()||!GE().canDraw()) return false; }catch(_){ return false; }
    const b=beforeId();
    try{
      if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:ringFC(new Date(clockMs()))});
      if(!GE().layers.has(LYR)) GE().layers.add({ id:LYR, type:'fill', source:SRC,
        paint:{ 'fill-color':SHADE, 'fill-opacity':ramp(SHADE_MAX/RINGS.length), 'fill-antialias':false } }, b);
      if(!GE().layers.has(LYR)) return false;         /* addLayer swallows a rejected paint expression */
    }catch(_){ return false; }
    built=true;
    /* the lights arrive when they arrive; the shade never waits for the network */
    loadLights().then((L)=>{ if(!L||!built) return;
      try{ const N=imgSize();
        GE().layers.addDynamicImage(DYN,{ width:N, height:N, coordinates:COORDS, opacity:RAMP, draw:drawLights,
          attribution:'City lights: NASA EOSDIS GIBS — VIIRS Black Marble' }, beforeId());
      }catch(_){}
    });
    return true;
  }
  function destroy(){
    if(!built) return false;
    try{ GE().layers.removeDynamicImage(DYN); }catch(_){}
    try{ if(GE().layers.has(LYR)) GE().layers.remove(LYR); }catch(_){}
    try{ if(GE().layers.hasSource(SRC)) GE().layers.removeSource(SRC); }catch(_){}
    built=false; lastKey=''; return true;
  }

  /* repaint when the SUN has moved enough to matter (a quarter degree ≈ one minute of rotation) */
  function refresh(force){
    if(!enabled) return false;
    if(!built) return false;
    const ms=clockMs();
    const key=String(Math.round(ms/60000));
    if(!force&&key===lastKey) return false;
    lastKey=key;
    try{ GE().layers.setSourceData(SRC,ringFC(new Date(ms))); }catch(_){}
    try{ if(GE().layers.hasDynamicImage&&GE().layers.hasDynamicImage(DYN)) GE().layers.touchDynamicImage(DYN); }catch(_){}
    return true;
  }

  /* ⚠ built LAZILY. A session that never leaves street level pays nothing: no layers, no GIBS
     request, no arithmetic — the check below is a zoom comparison on moveend. */
  function consider(){
    if(!enabled) return;
    if(zoomNow()>ZMAX+0.4){ return; }
    if(!built){ if(build()) refresh(true); }
    else refresh(false);
  }
  function wire(){
    if(wired) return; wired=true;
    try{ GE().events.on('moveend',consider); }catch(_){}
    try{ if(window.IntMapTime&&window.IntMapTime.on) window.IntMapTime.on(()=>{ refresh(true); }); }catch(_){}
    /* the sub-solar point moves 15° an hour — the same cadence app-body re-aims the light on */
    setInterval(()=>{ try{ if(!document.hidden) refresh(false); }catch(_){} },60000);
  }

  function apply(){ wire(); consider(); return built; }
  function setEnabled(v){ enabled=!!v; if(!enabled) destroy(); else consider(); return enabled; }

  return { apply, refresh:()=>refresh(true), setEnabled, destroy,
    state:()=>({ built, enabled, lights:!!lights, err:lastErr, zoom:zoomNow(), rings:RINGS.length,
                 shadeMax:SHADE_MAX, zMax:ZMAX }),
    /* pure, so the arithmetic can be checked without a renderer */
    _nightAt:(lng,lat,date)=>nightAt(solar(date||new Date(clockMs())),lng,lat),
    _ringFC:(date)=>ringFC(date||new Date(clockMs())) };
})();
