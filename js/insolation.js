/* ============================================================================
 *  IntMap · Terrain shadow and sunlight-hours engine  (#R176)
 * ----------------------------------------------------------------------------
 *  「影・日照時間エンジン — 建物や地形が落とす影を、指定日時だけでなく年間を通して計算する。
 *    任意地点の日照時間、冬至の影、山影、太陽光発電可能時間を表示する。」
 *
 *  The 🌇 Sun & shadow panel already cast the shadows of OSM BUILDINGS at one instant. Two things were
 *  missing and they are the two the request is about: the ground itself casts shadows (a mountain
 *  shades a valley for the whole morning, and no building geometry will ever say so), and a single
 *  instant answers nothing about a year.
 *
 *  TERRAIN SHADOW — a sweep, not a ray per pixel. For a given sun direction, define for each cell the
 *  highest "sun-relative height" any terrain reaches along the ray toward the sun:
 *      S(cell) = max over the ray of ( z(terrain) − distance · tan(altitude) )
 *  Stepping one cell toward the sun turns that into a recurrence — S(cell) = max(z, S)(previous cell)
 *  − Δ·tan(altitude) — so the whole grid is solved in ONE pass over the cells in sun order, O(N²)
 *  instead of O(N² · ray length). A cell is lit exactly when its own height reaches S.
 *
 *  A POINT'S HORIZON — for the annual questions, the expensive part is done once. March the DEM out
 *  along 360 azimuths (with earth curvature and standard refraction, which is worth 70 m at 30 km and
 *  decides whether a distant ridge blocks the low winter sun) and keep the greatest elevation angle in
 *  each direction. After that, a whole year is 52,560 comparisons of the sun's altitude against that
 *  profile — so annual sunlight hours, the winter solstice, and the hours a panel could actually work
 *  are all read off the same 360 numbers.
 *
 *  CLEAR-SKY BEAM — air mass from Kasten & Young (1989), direct normal irradiance 1361·0.7^(AM^0.678)
 *  (Meinel & Meinel). That is a CLEAR-SKY figure: it is the sun the site's own horizon allows, not a
 *  weather forecast, and the panel says so rather than implying a yield.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.insolation=function(map,HOST){
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ const m=window.__imap||map; return !!(m&&m.isStyleLoaded()); }catch(__){ return false; } } }
  const isMobile=HOST.isMobile, warmDEMTiles=HOST.warmDEMTiles, demElevBilinear=HOST.demElevBilinear,
        demElevAt=HOST.demElevAt, _demZoomForSpan=HOST._demZoomForSpan;

  window.IntMapInsolation=(function(){
    if(!map) return { shade(){}, analyse(){}, clear(){}, state:()=>({}) };
    const L=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?es:en;
    const D=Math.PI/180, R_EARTH=6371008.8, CIRC=2*Math.PI*R_EARTH;
    const mX=lng=>(180+lng)/360;
    const mY=lat=>(180-(180/Math.PI)*Math.log(Math.tan(Math.PI/4+lat*D/2)))/360;
    const lngOf=x=>x*360-180, latOf=y=>360/Math.PI*Math.atan(Math.exp((180-y*360)*D))-90;
    const IMG='insol-src', LYR='insol-shade';

    /* The solar position is the one the Sun & shadow panel already uses — one clock, one algorithm
       (the standing 「IntMapTime = ONE master clock」 rule applies to the sun too). */
    function sunPos(date,lat,lng){
      try{ if(window.IntMapSun&&window.IntMapSun._sunPos) return window.IntMapSun._sunPos(date,lat,lng); }catch(_){}
      /* stand-in with the same formulation, only used if the panel module is somehow absent */
      const rad=D, J1970=2440588, J2000=2451545, dayMs=86400000, e=rad*23.4397;
      const d=date.valueOf()/dayMs-0.5+J1970-J2000, lw=rad*-lng, phi=rad*lat;
      const M=rad*(357.5291+0.98560028*d), C=rad*(1.9148*Math.sin(M)+0.02*Math.sin(2*M)+0.0003*Math.sin(3*M)), Ls=M+C+rad*102.9372+Math.PI;
      const dec=Math.asin(Math.sin(e)*Math.sin(Ls)), ra=Math.atan2(Math.sin(Ls)*Math.cos(e),Math.cos(Ls));
      const th=rad*(280.16+360.9856235*d)-lw, H=th-ra;
      const alt=Math.asin(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H));
      const az=Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(phi)-Math.tan(dec)*Math.cos(phi));
      return { altitude:alt, azimuth:az, azCompass:(az/rad+180+360)%360, altDeg:alt/rad };
    }

    /* ---- the working grid ---------------------------------------------------------------------- */
    let G=null, painted=false;
    async function grid(force){
      const b=map.getBounds(); if(!b) return null;
      let w=b.getWest(), e=b.getEast(), s=b.getSouth(), n=b.getNorth(); if(e<w) e+=360;
      const midLat=(n+s)/2;
      const spanKm=Math.max((e-w)*111.32*Math.cos(midLat*D),(n-s)*110.54);
      const key=[w.toFixed(4),e.toFixed(4),s.toFixed(4),n.toFixed(4)].join(',');
      if(G&&G.key===key&&!force) return G;
      const xW=mX(w), xE=mX(e)+(mX(e)<mX(w)?1:0), yN=mY(n), yS=mY(s);
      const mob=(typeof isMobile==='function'&&isMobile());
      const NX=mob?280:520, NY=Math.max(16,Math.round(NX*(yS-yN)/Math.max(1e-12,xE-xW)));
      const dx=(xE-xW)/NX, dy=(yS-yN)/NY, cellM=dx*CIRC*Math.cos(midLat*D);
      let z=Math.min(mob?12:14,_demZoomForSpan(Math.max(1,spanKm))+2);
      const budget=mob?110:420, est=zz=>{ const tk=40075*Math.max(0.05,Math.cos(Math.abs(midLat)*D))/Math.pow(2,zz); const nn=spanKm/tk+1; return nn*nn*0.85; };
      while(z>5&&est(z)>budget) z--;
      const warm=[]; for(let j=0;j<=44;j++) for(let i=0;i<=44;i++) warm.push([lngOf(xW+(xE-xW)*i/44), latOf(yN+(yS-yN)*j/44)]);
      await warmDEMTiles(warm,z,25000,null);
      const Z=new Float32Array(NX*NY);
      for(let j=0;j<NY;j++){ const lat=latOf(yN+(j+0.5)*dy);
        for(let i=0;i<NX;i++){ const lng=lngOf(xW+(i+0.5)*dx);
          let v=demElevBilinear(lng,lat,z); if(v==null) v=demElevAt(lng,lat,null,z); Z[j*NX+i]=(v==null?0:v); } }
      G={ key, NX,NY,xW,yN,dx,dy,cellM,z,Z, bbox:[lngOf(xW),latOf(yN),lngOf(xE),latOf(yS)], midLat };
      return G;
    }

    /* ---- the sweep ------------------------------------------------------------------------------ */
    /* Returns a Uint8Array: 1 where the terrain shades the cell at that sun position. */
    function shadowMask(g,azCompass,altDeg){
      const { NX,NY,Z,cellM }=g, out=new Uint8Array(NX*NY);
      if(altDeg<=0.05){ out.fill(1); return out; }                    /* sun below the horizon: all shade */
      const tanA=Math.tan(altDeg*D);
      /* the direction TOWARD the sun in grid steps: +x east, +y SOUTH (mercator rows go south) */
      const ux=Math.sin(azCompass*D), uy=-Math.cos(azCompass*D);
      const M=new Float32Array(NX*NY);                                /* max(z, S) carried along the ray */
      const ax=Math.abs(ux), ay=Math.abs(uy);
      const sx=ux>=0?1:-1, sy=uy>=0?1:-1;
      const NONE=-1e9;
      /* March the DOMINANT axis one cell at a time and interpolate the other, starting from the edge
         the sun is on. One step toward the sun moves (sx, uy/ax) or (ux/ay, sy) cells, i.e. 1/ax (or
         1/ay) cells of ground — so the ray's rise over that step is that distance × tan(altitude), and
         the cell one step sunward has always been solved already. */
      if(ax>=ay){
        const dj=uy/Math.max(1e-9,ax), drop=(cellM/Math.max(1e-9,ax))*tanA;
        const iStart=sx>0?NX-1:0, iEnd=sx>0?-1:NX;
        for(let i=iStart;i!==iEnd;i-=sx){
          const pi=i+sx, inside=(pi>=0&&pi<NX);
          for(let j=0;j<NY;j++){ const k=j*NX+i, z=Z[k];
            if(!inside){ M[k]=z; continue; }
            const pj=j+dj, j0=Math.floor(pj), t=pj-j0, j1=j0+1;
            const a=(j0>=0&&j0<NY)?M[j0*NX+pi]:NONE, b2=(j1>=0&&j1<NY)?M[j1*NX+pi]:NONE;
            const prev=(a===NONE&&b2===NONE)?NONE:(a===NONE?b2:(b2===NONE?a:a*(1-t)+b2*t));
            const S=(prev===NONE)?NONE:prev-drop;
            if(z<S-1e-6) out[k]=1;
            M[k]=Math.max(z,S);
          }
        }
      } else {
        const di=ux/Math.max(1e-9,ay), drop=(cellM/Math.max(1e-9,ay))*tanA;
        const jStart=sy>0?NY-1:0, jEnd=sy>0?-1:NY;
        for(let j=jStart;j!==jEnd;j-=sy){
          const pj=j+sy, inside=(pj>=0&&pj<NY);
          for(let i=0;i<NX;i++){ const k=j*NX+i, z=Z[k];
            if(!inside){ M[k]=z; continue; }
            const pi=i+di, i0=Math.floor(pi), t=pi-i0, i1=i0+1;
            const a=(i0>=0&&i0<NX)?M[pj*NX+i0]:NONE, b2=(i1>=0&&i1<NX)?M[pj*NX+i1]:NONE;
            const prev=(a===NONE&&b2===NONE)?NONE:(a===NONE?b2:(b2===NONE?a:a*(1-t)+b2*t));
            const S=(prev===NONE)?NONE:prev-drop;
            if(z<S-1e-6) out[k]=1;
            M[k]=Math.max(z,S);
          }
        }
      }
      return out;
    }

    function paint(g,mask,strength){
      const { NX,NY }=g;
      const cv=document.createElement('canvas'); cv.width=NX; cv.height=NY;
      const ctx=cv.getContext('2d'), im=ctx.createImageData(NX,NY), px=im.data;
      const a=Math.round(255*Math.max(0.05,Math.min(0.95,strength==null?0.42:strength)));
      for(let k=0;k<NX*NY;k++) if(mask[k]){ const o=k*4; px[o]=8; px[o+1]=14; px[o+2]=34; px[o+3]=a; }
      ctx.putImageData(im,0,0);
      const coords=[[g.bbox[0],g.bbox[1]],[g.bbox[2],g.bbox[1]],[g.bbox[2],g.bbox[3]],[g.bbox[0],g.bbox[3]]];
      try{ if(!_imCanDraw()) return;
        const s=map.getSource(IMG);
        if(s&&s.updateImage) s.updateImage({url:cv.toDataURL('image/png'),coordinates:coords});
        else { map.addSource(IMG,{type:'image',url:cv.toDataURL('image/png'),coordinates:coords});
          const before=(()=>{ for(const id of ['imsun-shadow']){ try{ if(map.getLayer(id)) return id; }catch(_){} } return undefined; })();
          map.addLayer({id:LYR,type:'raster',source:IMG,paint:{'raster-opacity':1,'raster-fade-duration':0,'raster-resampling':'nearest'}},before); }
        painted=true;
      }catch(_){}
    }
    function clear(){ painted=false;
      try{ if(map.getLayer(LYR)) map.removeLayer(LYR); }catch(_){}
      try{ if(map.getSource(IMG)) map.removeSource(IMG); }catch(_){} }

    /* The terrain shadow for one moment. */
    let busy=false, lastShade=null;
    async function shade(when,o){
      if(busy) return null; busy=true;
      try{
        const g=await grid(o&&o.refit); if(!g) return null;
        const c=map.getCenter(); const sp=sunPos(when instanceof Date?when:new Date(when),c.lat,c.lng);
        const mask=shadowMask(g,sp.azCompass,sp.altDeg);
        let shaded=0; for(let k=0;k<mask.length;k++) if(mask[k]) shaded++;
        paint(g,mask,o&&o.strength);
        lastShade={ shadedFrac:shaded/mask.length, altDeg:sp.altDeg, azDeg:sp.azCompass, cellM:g.cellM, z:g.z, nx:g.NX, ny:g.NY };
        return lastShade;
      } finally { busy=false; }
    }
    /* Every cell that the sun never reaches on one day — the 「冬至の影」 product. Stepped every 15
       minutes because the sun moves 3.75° of hour angle in that time, which is under the grid's own
       angular resolution at any useful zoom. */
    async function dayShadow(date,o){
      if(busy) return null; busy=true;
      try{
        const g=await grid(o&&o.refit); if(!g) return null;
        const c=map.getCenter(); const acc=new Uint8Array(g.NX*g.NY).fill(1);
        const d0=new Date(date); d0.setHours(0,0,0,0);
        let steps=0, anySun=false;
        /* up to 96 sweeps over a quarter-million cells — yield between them, or the tab locks for
           seconds. #R19 was told about exactly that ("Line of sightを使うとパソコンでもブラウザがフリーズ"). */
        const tick=()=>new Promise(r=>setTimeout(r,0));
        for(let mnt=0;mnt<1440;mnt+=15){
          const t=new Date(d0.getTime()+mnt*60000);
          const sp=sunPos(t,c.lat,c.lng); if(sp.altDeg<=0.5) continue;
          anySun=true; steps++;
          const mask=shadowMask(g,sp.azCompass,sp.altDeg);
          for(let k=0;k<acc.length;k++) if(!mask[k]) acc[k]=0;         /* lit at least once → not in the union */
          if((steps&3)===0) await tick();
        }
        if(!anySun) acc.fill(1);
        let never=0; for(let k=0;k<acc.length;k++) if(acc[k]) never++;
        paint(g,acc,o&&o.strength!=null?o.strength:0.55);
        lastShade={ neverSunFrac:never/acc.length, steps, cellM:g.cellM, z:g.z, day:d0.toISOString().slice(0,10) };
        return lastShade;
      } finally { busy=false; }
    }

    /* ---- a point's own horizon, and its year ----------------------------------------------------- */
    const horCache=new Map();
    async function horizon(lng,lat,o){
      /* 25 km of horizon, not 40. A ridge further out has to stand 25 km · tan(5°) ≈ 2.2 km above the
         site to block even the low winter sun, and the extra tiles cost more than they buy: at 40 km
         the DEM warm-up alone ran past twenty seconds. */
      o=o||{}; const radiusKm=Math.max(2,Math.min(120,o.radiusKm||25)), obsH=+o.obsH||0;
      const key=lng.toFixed(4)+','+lat.toFixed(4)+','+radiusKm+','+obsH;
      if(horCache.has(key)&&!o.force) return horCache.get(key);
      const mob=(typeof isMobile==='function'&&isMobile());
      let z=Math.min(mob?12:14,_demZoomForSpan(radiusKm*2)+2);
      const budget=mob?90:240, latA=Math.abs(lat);
      const est=zz=>{ const tk=40075*Math.max(0.05,Math.cos(latA*D))/Math.pow(2,zz); const nn=(2*radiusKm)/tk+1; return nn*nn*0.85; };
      while(z>5&&est(z)>budget) z--;
      const NA=mob?180:360, NS=mob?200:400, stepM=radiusKm*1000/NS;
      const la1=lat*D, lo1=lng*D, sLa1=Math.sin(la1), cLa1=Math.cos(la1);
      const dest=(brg,dM)=>{ const dR=dM/R_EARTH, br=brg*D, sDR=Math.sin(dR), cDR=Math.cos(dR);
        const la2=Math.asin(sLa1*cDR+cLa1*sDR*Math.cos(br));
        const lo2=lo1+Math.atan2(Math.sin(br)*sDR*cLa1,cDR-sLa1*Math.sin(la2));
        return [((lo2/D+540)%360)-180, la2/D]; };
      const warm=[]; for(let a=0;a<NA;a+=4) for(let s=8;s<=NS;s+=8) warm.push(dest(a*360/NA,s*stepM));
      warm.push([lng,lat]);
      await warmDEMTiles(warm,z,25000,null);
      let g0=demElevBilinear(lng,lat,z); if(g0==null) g0=demElevAt(lng,lat,null,z); if(g0==null) g0=0;
      const eye=g0+obsH;
      const hor=new Float32Array(NA);
      const K=1.13;                                                    /* standard optical refraction */
      for(let a=0;a<NA;a++){ const brg=a*360/NA; let mx=-90;
        for(let s=1;s<=NS;s++){ const d=s*stepM, p=dest(brg,d);
          let h=demElevBilinear(p[0],p[1],z); if(h==null) continue;
          const drop=d*d/(2*K*R_EARTH);
          const ang=Math.atan2(h-drop-eye,d)/D; if(ang>mx) mx=ang; }
        hor[a]=Math.max(0,mx); }
      const res={ lng, lat, groundM:g0, obsH, radiusKm, demZ:z, azimuths:NA, hor };
      horCache.set(key,res); return res;
    }
    const horAt=(h,azDeg)=>{ const n=h.hor.length, x=((azDeg%360)+360)%360*n/360;
      const i=Math.floor(x)%n, j=(i+1)%n, t=x-Math.floor(x); return h.hor[i]*(1-t)+h.hor[j]*t; };

    /* Air mass (Kasten & Young 1989) and the clear-sky direct normal irradiance (Meinel & Meinel). */
    function dni(altDeg){ if(altDeg<=0) return 0;
      const AM=1/(Math.sin(altDeg*D)+0.50572*Math.pow(altDeg+6.07995,-1.6364));
      return 1361*Math.pow(0.7,Math.pow(Math.max(1,AM),0.678)); }

    /* The whole year at one point, read off that horizon profile. */
    async function analyse(lng,lat,o){
      o=o||{};
      const h=await horizon(lng,lat,o);
      const year=o.year||new Date().getFullYear();
      const stepMin=o.stepMin||10, pvMinAlt=(o.pvMinAlt!=null?o.pvMinAlt:10);
      const perDay=[], dayKeys=[];
      let annualH=0, annualFlatH=0, zeroDays=0, pvH=0, beamWh=0;
      const start=new Date(Date.UTC(year,0,1,0,0,0));
      const days=((year%4===0&&year%100!==0)||year%400===0)?366:365;
      const tick=()=>new Promise(r=>setTimeout(r,0));
      for(let d=0;d<days;d++){
        if((d&63)===63) await tick();       /* 52,560 sun positions — keep the page answering */
        const base=new Date(start.getTime()+d*86400000);
        let lit=0, flat=0, pv=0;
        for(let mnt=0;mnt<1440;mnt+=stepMin){
          const t=new Date(base.getTime()+mnt*60000);
          const sp=sunPos(t,lat,lng);
          if(sp.altDeg<=0) continue;
          flat++;
          if(sp.altDeg>horAt(h,sp.azCompass)){ lit++;
            beamWh+=dni(sp.altDeg)*Math.sin(sp.altDeg*D)*(stepMin/60);
            if(sp.altDeg>=pvMinAlt) pv++; }
        }
        const hrs=lit*stepMin/60;
        perDay.push(hrs); dayKeys.push(base.toISOString().slice(5,10));
        annualH+=hrs; annualFlatH+=flat*stepMin/60; pvH+=pv*stepMin/60;
        if(lit===0) zeroDays++;
      }
      const pick=(mm,dd)=>{ const i=Math.round((Date.UTC(year,mm,dd)-start.getTime())/86400000); return perDay[Math.max(0,Math.min(perDay.length-1,i))]; };
      const north=lat>=0;
      return { lng, lat, groundM:h.groundM, demZ:h.demZ, radiusKm:h.radiusKm, year,
        annualHours:annualH, annualOpenHours:annualFlatH,
        lossPct:annualFlatH?100*(1-annualH/annualFlatH):0,
        winterSolstice:pick(north?11:5,north?21:21), summerSolstice:pick(north?5:11,21),
        equinox:pick(2,20), zeroSunDays:zeroDays, pvHours:pvH,
        beamKWhM2:beamWh/1000, meanHorizonDeg:(()=>{ let s=0; for(let i=0;i<h.hor.length;i++) s+=h.hor[i]; return s/h.hor.length; })(),
        maxHorizonDeg:(()=>{ let m=0,a=0; for(let i=0;i<h.hor.length;i++) if(h.hor[i]>m){ m=h.hor[i]; a=i*360/h.hor.length; } return {deg:m,azimuth:a}; })(),
        perDay, dayKeys };
    }
    /* Sunrise and sunset AS THE TERRAIN LEAVES THEM — the moment the sun clears the ridge, which in a
       valley is not the moment it clears the sea horizon. */
    async function dayAt(lng,lat,date,o){
      const h=await horizon(lng,lat,o||{});
      const d0=new Date(date); d0.setHours(0,0,0,0);
      let first=null, last=null, mins=0;
      for(let m=0;m<1440;m++){ const t=new Date(d0.getTime()+m*60000); const sp=sunPos(t,lat,lng);
        if(sp.altDeg>0&&sp.altDeg>horAt(h,sp.azCompass)){ if(first==null) first=new Date(t); last=new Date(t); mins++; } }
      return { first, last, hours:mins/60, groundM:h.groundM };
    }

    return { shade, dayShadow, clear, horizon, analyse, dayAt, sunPos, dni,
      isPainted:()=>painted,
      state:()=>({ painted, grid:G?{nx:G.NX,ny:G.NY,cellM:G.cellM,z:G.z}:null, last:lastShade }) };
  })();
};
