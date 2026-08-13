/* ============================================================================
 *  IntMap · Weather — IntMapModules.{wind,weatherEC,weatherPanel}  (#R166)
 * ----------------------------------------------------------------------------
 *  The animated wind field (GFS particles on a canvas), the Environment-Canada style
 *  forecast panel and the point weather popup.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R166): each body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang
 *      currentProj -> HOST.proj
 *      userTZ -> HOST.userTZ
 *
 *  Every factory is called at the exact spot its block used to occupy, so execution order is
 *  unchanged. The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.wind=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const satToast=HOST.satToast, isMobile=HOST.isMobile;
  window.Wind=(function(){
    const cv=document.getElementById('wind-canvas'); if(!cv) return {toggle(){},stop(){},setOpacity(){}};
    const ctx=cv.getContext('2d');
    /* (#R8b) ARCHITECTURE CHANGE. The speed-color FIELD is no longer a screen-space canvas — that was
       the cause of "画面全体が光る while scrolling", was heavy (unproject every pixel every ~100 ms), and
       painted into SPACE on the globe. It is now a GEO-ANCHORED MapLibre raster: a Web-Mercator-
       parameterised image fed to an image source, so MapLibre reprojects it for Flat AND Globe, CLIPS it
       to the sphere (no space color, ever), pans/zooms locked to the map with ZERO per-frame cost, and
       the GPU composites it. Only the WHITE particle streaks remain on #wind-canvas. */
    const oldBg=document.getElementById('wind-bg-canvas'); if(oldBg) oldBg.style.display='none';
    let on=false, raf=0, parts=[], grid=null, fetchT=0, fetching=false, dpr=1, cssW=0, cssH=0, moving=false, gridTime=null;
    let _fieldBusy=false, _fieldT=0;   /* (#R102) guard the field-raster rebuild against its own styledata re-entry (the rare "wind flickers" bug) */
    const R=Math.PI/180;
    const FIELD_SRC='wind-field-src', FIELD_LYR='wind-field';
    const fieldCanvas=document.createElement('canvas'); let fieldReady=false, fieldOpacity=0.72;
    /* Globe near-hemisphere mask for the PARTICLES only (the field is masked by MapLibre's own globe
       clipping). Reuses the marker-occlusion dot test; refreshed once per frame. */
    const _view={x:1,y:0,z:0,th:Math.cos(87*R)};
    function refreshView(){ try{ const c=GE().camera.getCenter(), cla=c.lat*R, clo=c.lng*R;
      _view.x=Math.cos(cla)*Math.cos(clo); _view.y=Math.cos(cla)*Math.sin(clo); _view.z=Math.sin(cla); }catch(_){} }
    function visibleLL(lng,lat){ if(HOST.proj!=='globe') return true;
      const la=lat*R, lo=lng*R, cl=Math.cos(la);
      return (cl*Math.cos(lo)*_view.x + cl*Math.sin(lo)*_view.y + Math.sin(la)*_view.z) > _view.th; }
    function resize(){ const cont=document.getElementById('map-container'); if(!cont) return; dpr=Math.min(2,window.devicePixelRatio||1); cssW=cont.clientWidth; cssH=cont.clientHeight; cv.width=cssW*dpr; cv.height=cssH*dpr; cv.style.width=cssW+'px'; cv.style.height=cssH+'px'; ctx.setTransform(dpr,0,0,dpr,0,0); }
    /* Real GFS field at a finer 5° grid (≈2.2k pts). One URL would be 414 Request-URI-Too-Large, so it's
       fetched as parallel ≤500-pt CHUNKS and reassembled — refreshed every 10 min. "from" direction →
       (east-u, north-v) motion vector. Falls back to a single coarse 8° request; only then gives up. */
    /* ⚠ (#R212) EVERY REQUEST HERE CARRIES A DEADLINE. 「Wind(animated)が表示されるまでが非常に遅い。」
       The fine field is five parallel chunk requests, each of which walked a proxy ladder with no
       timeout, and `Promise.all` meant the slowest one gated the whole picture. Open-Meteo answers
       directly (CORS) and quickly, but it rate-limits (#R72 measured a 429), and a 429 sent every
       chunk down the ladder into api.allorigins.win — measured elsewhere in this round at 19.5 s. */
    const WIND_TIMEOUT_MS=6000;
    function _wfetch(u){
      const c=new AbortController(); const t=setTimeout(()=>{ try{ c.abort(); }catch(_){} },WIND_TIMEOUT_MS);
      return fetch(u,{signal:c.signal}).finally(()=>clearTimeout(t)); }
    async function fetchGrid(){
      if(fetching) return; if(grid && Date.now()-fetchT<10*60000) return;
      fetching=true;
      const STEP=5, lat0=75, lats=[], lons=[];
      for(let la=lat0; la>=-lat0+0.001; la-=STEP) for(let lo=-180; lo<180; lo+=STEP){ lats.push(la); lons.push(lo); }
      const cols=Math.round(360/STEP), N=lats.length, rows=Math.round(N/cols);
      const proxies=[ x=>x, x=>`https://corsproxy.io/?url=${encodeURIComponent(x)}`, x=>`https://api.allorigins.win/raw?url=${encodeURIComponent(x)}` ];
      const CHUNK=500, jobs=[]; for(let s=0;s<N;s+=CHUNK) jobs.push([s,Math.min(N,s+CHUNK)]);
      async function getChunk(s,e){
        const url='https://api.open-meteo.com/v1/forecast?latitude='+lats.slice(s,e).join(',')+'&longitude='+lons.slice(s,e).join(',')+'&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms';
        for(const mk of proxies){ try{ const r=await _wfetch(mk(url)); if(!r.ok) continue; const j=await r.json(); const arr=Array.isArray(j)?j:(j&&j.current?[j]:null); if(arr&&arr.length===(e-s)) return arr; }catch(_){} }
        return null;
      }
      /* ⚠ COARSE FIRST, THEN REFINE. The 8° field is ONE request; the 5° field is five. Asking for
         both at once and drawing whichever arrives first is the difference between «a picture in a
         second» and «nothing until the last chunk lands». The coarse grid is only installed if the
         fine one has not already won, so a fast fine load is never downgraded. */
      const coarseP=grid?null:fetchCoarse().catch(()=>false);
      let fineDone=false;
      if(coarseP) coarseP.then((ok)=>{ if(ok&&!fineDone){ try{ if(on) renderFieldImage&&renderFieldImage(); }catch(_){} } });
      let results=null; try{ results=await Promise.all(jobs.map(j=>getChunk(j[0],j[1]))); }catch(_){ results=null; }
      fineDone=true;
      if(results && results.every(Boolean)){
        const u=new Float32Array(N), v=new Float32Array(N);
        results.forEach((arr,ji)=>{ const s=jobs[ji][0]; for(let k=0;k<arr.length;k++){ const cu=arr[k].current||{}; const sp=+cu.wind_speed_10m||0, dir=(+cu.wind_direction_10m||0)*R; u[s+k]=-sp*Math.sin(dir); v[s+k]=-sp*Math.cos(dir); } });
        grid={STEP,rows,cols,u,v,lat0,lon0:-180}; fieldReady=false;
        try{ gridTime=results[0][0].current.time; updateTimePill(); }catch(_){}
      } else if(!grid){
        const ok=coarseP?await coarseP:await fetchCoarse();     /* (#R212) already in flight — do not ask twice */
        if(!ok){ try{ satToast(window.IntMapLang.t(HOST.lang,'Wind data unavailable','風データを取得できませんでした','Winddaten nicht verfügbar','Данные о ветре недоступны','Datos de viento no disponibles')); }catch(_){}
          const cb=document.getElementById('dl-wind'); if(cb){ cb.checked=false; const row=cb.closest('.lyr-row'); if(row) row.classList.remove('on'); } stop(); }
      }
      fetching=false; fetchT=Date.now();
    }
    async function fetchCoarse(){
      const STEP=8, lat0=72, lats=[], lons=[];
      for(let la=lat0; la>=-lat0; la-=STEP) for(let lo=-180; lo<180; lo+=STEP){ lats.push(la); lons.push(lo); }
      const url='https://api.open-meteo.com/v1/forecast?latitude='+lats.join(',')+'&longitude='+lons.join(',')+'&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms';
      const proxies=[ x=>x, x=>`https://corsproxy.io/?url=${encodeURIComponent(x)}`, x=>`https://api.allorigins.win/raw?url=${encodeURIComponent(x)}` ];
      for(const mk of proxies){ try{ const r=await _wfetch(mk(url)); if(!r.ok) continue; const j=await r.json(); const arr=Array.isArray(j)?j:(j&&j.current?[j]:null);
        if(arr&&arr.length){ const cols=Math.round(360/STEP), rows=Math.round(2*lat0/STEP)+1, u=new Float32Array(arr.length), v=new Float32Array(arr.length);
          arr.forEach((o,i)=>{ const cu=o.current||{}; const sp=+cu.wind_speed_10m||0, dir=(+cu.wind_direction_10m||0)*R; u[i]=-sp*Math.sin(dir); v[i]=-sp*Math.cos(dir); });
          grid={STEP,rows,cols,u,v,lat0,lon0:-180}; fieldReady=false; try{ gridTime=arr[0].current.time; updateTimePill(); }catch(_){} return true; } }catch(_){} }
      return false;
    }
    /* Bilinear sample of the wind field at a geographic lng/lat → [u,v] in m/s, or null off-grid. */
    function sample(lng,lat){
      if(!grid || lat>grid.lat0 || lat<-grid.lat0) return null;
      const lo=((lng+180)%360+360)%360-180;
      const gx=(lo-grid.lon0)/grid.STEP, gy=(grid.lat0-lat)/grid.STEP;
      const x0=Math.floor(gx), y0=Math.floor(gy); if(y0<0||y0>=grid.rows-1) return null;
      const fx=gx-x0, fy=gy-y0, c=grid.cols;
      const i00=y0*c+((x0%c)+c)%c, i10=y0*c+((x0+1)%c+c)%c, i01=(y0+1)*c+((x0%c)+c)%c, i11=(y0+1)*c+((x0+1)%c+c)%c;
      const L=(a,b,f)=>a+(b-a)*f;
      return [ L(L(grid.u[i00],grid.u[i10],fx),L(grid.u[i01],grid.u[i11],fx),fy),
               L(L(grid.v[i00],grid.v[i10],fx),L(grid.v[i01],grid.v[i11],fx),fy) ];
    }
    /* perceptual Windy ramp → a 256-entry RGB lookup (built once; no per-pixel string parsing) */
    function speedColor(s){ const stops=[[0,16,32,92],[3,28,108,184],[7,40,168,170],[11,90,205,120],[16,225,215,75],[22,242,150,52],[29,232,70,70],[40,198,55,176]]; const v=Math.min(40,Math.max(0,s)); let a=stops[0],b=stops[stops.length-1]; for(let i=0;i<stops.length-1;i++){ if(v>=stops[i][0]&&v<=stops[i+1][0]){ a=stops[i]; b=stops[i+1]; break; } } const f=(v-a[0])/Math.max(1e-6,(b[0]-a[0])); return [Math.round(a[1]+(b[1]-a[1])*f),Math.round(a[2]+(b[2]-a[2])*f),Math.round(a[3]+(b[3]-a[3])*f)]; }
    const LUT=(function(){ const a=new Uint8Array(256*3); for(let i=0;i<256;i++){ const c=speedColor(i/255*42); a[i*3]=c[0]; a[i*3+1]=c[1]; a[i*3+2]=c[2]; } return a; })();
    window.WIND_SPEEDCOLOR=(s)=>{ const c=speedColor(s); return `rgb(${c[0]},${c[1]},${c[2]})`; };
    /* Render the field into a Web-Mercator canvas, then hand it to the image source (geo-anchored). */
    const MERC_LAT=85.0511287798;
    const invMercY=(t)=>Math.atan(Math.sinh(Math.PI*(1-2*t)))/R;   /* t∈[0,1] top→bottom → latitude */
    function renderFieldImage(){
      if(!grid) return;
      const W=1024, H=512; fieldCanvas.width=W; fieldCanvas.height=H;
      const fc=fieldCanvas.getContext('2d'); const img=fc.createImageData(W,H); const d=img.data;
      for(let y=0;y<H;y++){ const lat=invMercY((y+0.5)/H); if(lat>grid.lat0||lat<-grid.lat0) continue;
        for(let x=0;x<W;x++){ const lng=(x+0.5)/W*360-180; const w=sample(lng,lat); if(!w) continue;
          const sp=Math.hypot(w[0],w[1]); const li=(Math.min(255,(sp/42*255)|0))*3; const idx=(y*W+x)*4;
          d[idx]=LUT[li]; d[idx+1]=LUT[li+1]; d[idx+2]=LUT[li+2]; d[idx+3]=178; } }
      fc.putImageData(img,0,0); fieldReady=true;
      /* (#R85) GUARANTEED paint for the speed-COLOUR field ("Wind(animated)は粒子のみで地図に色がつかない" — STILL
         re-reported after R84). ImageSource.updateImage({url}) proved unreliable across MapLibre builds: it
         resolved without error yet the raster never repainted, so only the white particles showed. Stop trusting
         the in-place update — REBUILD the image source from the fresh data URL every render (remove the old
         layer+source, re-add with the current colours below the first label layer). This is cheap (once per
         10-min grid refresh / style reload) and can never silently no-op. */
      /* (#R102) keep the known-good REBUILD (in-place updateImage was found to silently no-op — see note above), but
         mark `_fieldBusy` around it + stamp `_fieldT` so the styledata this remove/add fires can't RE-ENTER and rebuild
         again in a burst — that re-entrant loop, each rebuild re-running the 250 ms opacity fade-in, was the rare "点滅". */
      try{ const url=fieldCanvas.toDataURL(); _fieldBusy=true; _fieldT=Date.now();
        try{ if(GE().layers.has(FIELD_LYR)) GE().layers.remove(FIELD_LYR); }catch(_){}
        try{ if(GE().layers.hasSource(FIELD_SRC)) GE().layers.removeSource(FIELD_SRC); }catch(_){}
        GE().layers.addSource(FIELD_SRC,{type:'image',url:url,coordinates:[[-180,MERC_LAT],[180,MERC_LAT],[180,-MERC_LAT],[-180,-MERC_LAT]]});
        GE().layers.add({id:FIELD_LYR,type:'raster',source:FIELD_SRC,paint:{'raster-opacity':(on?fieldOpacity:0),'raster-opacity-transition':{duration:250},'raster-fade-duration':0,'raster-resampling':'linear'}}, firstSymbolId());
      }catch(_){}
      finally{ setTimeout(()=>{ _fieldBusy=false; },30); }
    }
    function firstSymbolId(){ try{ for(const l of (GE().scene.getStyle().layers||[])) if(l.type==='symbol') return l.id; }catch(_){} return undefined; }
    const BLANK='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
    function ensureFieldLayer(){
      if(!_imCanDraw()) return false;
      if(!GE().layers.hasSource(FIELD_SRC)){
        try{ GE().layers.addSource(FIELD_SRC,{type:'image',url:BLANK,coordinates:[[-180,MERC_LAT],[180,MERC_LAT],[180,-MERC_LAT],[-180,-MERC_LAT]]});
          GE().layers.add({id:FIELD_LYR,type:'raster',source:FIELD_SRC,paint:{'raster-opacity':0,'raster-opacity-transition':{duration:350},'raster-fade-duration':0,'raster-resampling':'linear'}}, firstSymbolId());
        }catch(e){ return false; }
      }
      return true;
    }
    function showField(v){ try{ if(GE().layers.has(FIELD_LYR)) GE().layers.setPaint(FIELD_LYR,'raster-opacity', v?fieldOpacity:0); }catch(_){} }
    function setFieldOpacity(o){ fieldOpacity=Math.max(0,Math.min(1,+o||0)); if(on) showField(true); }
    /* (#R8c) Persistent pill stating WHICH hour of GFS data is on screen (the user asked to see the
       valid time). Open-Meteo returns the analysis time in GMT; show it in the user's timezone. */
    function fmtWindTime(iso){ if(!iso) return ''; try{ const d=new Date(/[zZ]|[+\-]\d\d:?\d\d$/.test(iso)?iso:iso+'Z');
      let tz; try{ if(typeof HOST.userTZ!=='undefined'&&HOST.userTZ&&HOST.userTZ!=='auto') tz=HOST.userTZ; }catch(_){}
      return d.toLocaleString(window.IntMapLang.locale(HOST.lang,"en-GB"),{timeZone:tz,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(_){ return iso; } }
    window._fmtWindTime=fmtWindTime;
    /* (#R12) The valid time now lives in the draggable Wind legend (data-legend-wind), like every other
       layer — the old floating top-center pill overlapped the search box. Just refresh the legend. */
    function updateTimePill(){ const old=document.getElementById('wind-ts'); if(old) old.remove(); try{ window._updateWindLegend&&window._updateWindLegend(); }catch(_){} }
    window.addEventListener('intmap-lang',()=>{ try{ updateTimePill(); }catch(_){} });
    /* Re-attach the field after a style reload (theme/basemap switch drops custom sources).
       (#R85) render whenever the GRID exists (not only when fieldReady was already set) — on first load the field
       source is created here once the style finishes loading, which is what makes the colour actually paint. */
    /* (#R102) skip while our own rebuild is in flight (`_fieldBusy`) or within 500 ms of the last one — that
       debounce collapses a styledata BURST (theme swap, other layer toggles, the field's own add/remove) into a
       single rebuild, so the field can't rapidly re-fade ("Wind(animated)が点滅するバグがまれに発生"). A genuine
       later style reload still lands (they are seconds apart). */
    if(GE().hasRenderer()) GE().events.on('styledata',()=>{ if(!on||_fieldBusy) return;
      /* debounce ONLY while the field is still present (a burst); if a real style reload actually dropped it, rebuild
         immediately so it can never get stuck missing. */
      let present=false; try{ present=!!(GE().layers.hasSource(FIELD_SRC)&&GE().layers.has(FIELD_LYR)); }catch(_){}
      if(present&&(Date.now()-_fieldT<500)) return;
      setTimeout(()=>{ if(on&&!_fieldBusy&&ensureFieldLayer()){ if(grid||fieldReady) renderFieldImage(); showField(true); } },60); });
    /* Seed a particle at a random GEOGRAPHIC point inside the current view (so the field fills the
       visible area at any zoom). */
    function spawn(p){
      let b; try{ b=GE().camera.getBounds(); }catch(_){ b=null; }
      /* (#R7) FIX: the old `-grid?grid.lat0:85` parsed as `(-grid)?…:85` → NaN → 85, so every particle
         was seeded at lat ≥72° ABOVE the wind grid, where sample() returns null and the particle
         instantly respawns — the whole field rendered nothing. Clamp the seed band into the grid. */
      const gl=grid?grid.lat0:85;
      /* (#R8) Rejection-sample so a globe particle lands on the VISIBLE hemisphere (else it would be born
         on the far side, fail the mask and respawn every frame — wasted work + a sparse-looking front). */
      for(let attempt=0; attempt<6; attempt++){
        if(b){ const w=b.getWest(),e=b.getEast(),s=Math.max(-gl,b.getSouth()),n=Math.min(gl,b.getNorth());
          let lo=w+(e-w)*Math.random(); if(e<w) lo=w+((e+360-w)*Math.random()); if(lo>180) lo-=360;
          p.lng=lo; p.lat=s+(n-s)*Math.random(); }
        else { p.lng=Math.random()*360-180; p.lat=Math.random()*2*gl-gl; }
        if(HOST.proj!=='globe' || visibleLL(p.lng,p.lat)) break;
      }
      p.age=(Math.random()*60)|0; p.life=60+((Math.random()*70)|0);
    }
    /* (#R8b) Windy model = a DENSE flow. ~1 particle / 300 px² desktop (≈7k on a 1080p map), phone-capped.
       The heavy per-frame field cost is gone (field is a GPU raster now), so the particle budget is freed. */
    function ensureParts(){ const target=Math.min(isMobile()?2600:7000,Math.max(1200,Math.floor(cssW*cssH/(isMobile()?900:300)))); if(parts.length>target) parts.length=target; while(parts.length<target){ const p={}; spawn(p); parts.push(p); } }
    const onScreen=(pt)=>pt && pt.x>=-40 && pt.x<=cssW+40 && pt.y>=-40 && pt.y<=cssH+40;
    function step(){
      if(!on) return;
      refreshView();
      /* WHITE particle streaks. Clear fully while the map moves so trails track the map; fade when idle so
         the streaks flow (the classic Windy trail). The color FIELD underneath is the geo-anchored raster
         (it pans/zooms with the map natively now — no screen-space "glow on scroll"). */
      if(moving){ ctx.clearRect(0,0,cssW,cssH); }
      else { ctx.globalCompositeOperation='destination-out'; ctx.fillStyle='rgba(0,0,0,0.08)'; ctx.fillRect(0,0,cssW,cssH); ctx.globalCompositeOperation='source-over'; }
      ctx.lineCap='round';
      let z=2; try{ z=GE().camera.getZoom(); }catch(_){}
      const sc=Math.pow(2,z);
      for(const p of parts){
        if(p.lng==null){ spawn(p); continue; }
        /* never advect/draw a particle on the far side of the globe (it would smear across the front) */
        if(HOST.proj==='globe' && !visibleLL(p.lng,p.lat)){ if(++p.age>p.life) spawn(p); continue; }
        const w=sample(p.lng,p.lat);
        if(!w){ spawn(p); continue; }
        const sp=Math.hypot(w[0],w[1]);
        const s0=GE().coords.project([p.lng,p.lat]);
        if(!onScreen(s0)){ if(++p.age>p.life) spawn(p); else p.age++; continue; }
        const cosLat=Math.max(0.15,Math.cos(p.lat*R));
        const mPerPx=156543.03*cosLat/sc, dt=0.05*mPerPx;   /* (#R8b) calmer still (was 0.066) */
        p.lng += (w[0]*dt)/(111320*cosLat);
        p.lat += (w[1]*dt)/110540;
        if(p.lng>180) p.lng-=360; else if(p.lng<-180) p.lng+=360;
        const s1=GE().coords.project([p.lng,p.lat]);
        if(p.age<p.life && onScreen(s1)){
          const a=0.6+Math.min(0.38,sp/40); ctx.lineWidth=1.0+Math.min(1.0,sp/28);
          ctx.strokeStyle='rgba(255,255,255,'+a.toFixed(2)+')'; ctx.beginPath(); ctx.moveTo(s0.x,s0.y); ctx.lineTo(s1.x,s1.y); ctx.stroke();
          p.age++;
        } else { spawn(p); }
      }
      raf=requestAnimationFrame(step);
    }
    function start(){ on=true; cv.style.display='block'; resize(); ensureParts(); updateTimePill();
      /* (#R85) PERSISTENT field creation. The colour field can only be added once map.isStyleLoaded() is true; the
         old 3 s retry gave up if the grid arrived before the style finished, leaving only particles ("粒子のみで
         色がつかない"). Retry for ~16 s AND hook the map's next idle, so the field paints as soon as the style is
         ready however the timing falls. renderFieldImage() itself rebuilds the source, so it can't silently no-op. */
      fetchGrid().then(()=>{ if(grid){ let n=0; const tryField=()=>{ if(!on) return; if(ensureFieldLayer()){ renderFieldImage(); showField(true); } else if(n++<80) setTimeout(tryField,200); }; tryField();
        try{ GE().events.once('idle',()=>{ if(on&&grid&&ensureFieldLayer()){ renderFieldImage(); showField(true); } }); }catch(_){} } updateTimePill(); });
      cancelAnimationFrame(raf); raf=requestAnimationFrame(step); }
    function stop(){ on=false; cancelAnimationFrame(raf); try{ ctx.clearRect(0,0,cv.width,cv.height); }catch(_){} cv.style.display='none'; showField(false); updateTimePill(); }
    window.addEventListener('resize',()=>{ if(on){ resize(); } });
    if(GE().hasRenderer()){ GE().events.on('movestart',()=>{ moving=true; }); GE().events.on('moveend',()=>{ moving=false; if(on){ resize(); ensureParts(); } }); }
    return { toggle(v){ v?start():stop(); }, on:()=>on, refetch:fetchGrid, setOpacity:setFieldOpacity,
      sampleAt:(lng,lat)=>{ const w=sample(lng,lat); if(!w) return null; return { speed:Math.hypot(w[0],w[1]), dir:(Math.atan2(-w[0],-w[1])/R+360)%360, time:gridTime }; },
      dataTime:()=>gridTime,
      _dbg:()=>{ let hasSrc=false,hasLyr=false,op=null; try{ hasSrc=!!GE().layers.hasSource(FIELD_SRC); }catch(_){}
        try{ hasLyr=!!GE().layers.has(FIELD_LYR); if(hasLyr) op=GE().layers.getPaint(FIELD_LYR,'raster-opacity'); }catch(_){}
        return { on, gridPts: grid?grid.u.length:0, gridStep: grid?grid.STEP:null, fieldReady, hasSrc, hasLyr, rasterOpacity:op, parts:parts.length, styleLoaded:(()=>{try{return GE().ready();}catch(_){return null;}})() }; } };
  })();
};

window.IntMapModules.weatherEC=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const satToast=HOST.satToast, t=HOST.t, makeDraggable=HOST.makeDraggable;
  window.IntMapWeatherEC=(function(){
    if(!GE().hasRenderer()) return { open(){}, toggle(){} };
    const jp=()=>HOST.lang==='jp';
    const BASE='https://map-tiles.open-meteo.com/data_spatial/ecmwf_ifs/latest.json';
    const SDK_URL='https://unpkg.com/@openmeteo/weather-map-layer@0.0.19/dist/index.js';
    /* Variable names + types validated LIVE against what ecmwf_ifs actually serves (probed the om://
       protocol → real ImageBitmap tiles). type:'raster' uses the SDK's built-in per-variable color ramp;
       'isobars' = vector contour lines (source-layer 'contours'); 'arrows' = vector wind barbs
       (variable wind_u_component_10m + &arrows=true, source-layer 'wind-arrows'). NOTE: ecmwf_ifs spatial
       does NOT serve precipitation or relative_humidity_2m — precip is covered by the app's IMERG/radar
       layers; humidity is shown here as dew point (the available moisture field). Wind also has a dedicated
       animated GFS layer; this ECMWF arrows layer adds directional barbs. */
    /* Variables re-confirmed live against ecmwf_ifs latest.json (2026-06): precipitation IS now served,
       so the ECMWF precip layer is real; relative_humidity_2m is still NOT served → dew_point is the
       moisture field. All carry the hourly valid_times time-slider. */
    /* (#R38) label arrays carry all four languages [EN, JP, DE, RU]; ecLbl() picks the active one. */
    const LAYERS=[
      {id:'ec-temp',    variable:'temperature_2m',          type:'raster', op:0.72, label:['Temperature 2 m (ECMWF)','気温 2m（ECMWF）','Temperatur 2 m (ECMWF)','Температура 2 м (ECMWF)']},
      {id:'ec-precip',  variable:'precipitation',           type:'raster', op:0.72, label:['Precipitation (ECMWF)','降水量（ECMWF）','Niederschlag (ECMWF)','Осадки (ECMWF)']},
      {id:'ec-wind',    variable:'wind_u_component_10m',     type:'arrows', op:0.85, label:['Wind 10 m arrows (ECMWF)','風 10m 矢羽根（ECMWF）','Wind 10 m, Pfeile (ECMWF)','Ветер 10 м, стрелки (ECMWF)']},
      {id:'ec-cloud',   variable:'cloud_cover',             type:'raster', op:0.70, label:['Cloud cover (ECMWF)','雲量（ECMWF）','Bewölkung (ECMWF)','Облачность (ECMWF)']},
      {id:'ec-dew',     variable:'dew_point_2m',            type:'raster', op:0.65, label:['Dew point / humidity (ECMWF)','露点・湿度（ECMWF）','Taupunkt / Feuchte (ECMWF)','Точка росы / влажность (ECMWF)']},
      {id:'ec-isobars', variable:'pressure_msl',            type:'isobars',op:0.9,  label:['Isobars (ECMWF)','等圧線（ECMWF）','Isobaren (ECMWF)','Изобары (ECMWF)']},
      {id:'ec-slp',     variable:'pressure_msl',            type:'raster', op:0.60, label:['Sea-level pressure (ECMWF)','海面気圧（ECMWF）','Luftdruck (Meereshöhe) (ECMWF)','Давление на уровне моря (ECMWF)']},
      {id:'ec-cape',    variable:'cape',                    type:'raster', op:0.65, label:['CAPE instability (ECMWF)','CAPE 不安定度（ECMWF）','CAPE-Instabilität (ECMWF)','Неустойчивость CAPE (ECMWF)']},
      {id:'ec-sst',     variable:'sea_surface_temperature', type:'raster', op:0.72, label:['Ocean temperature (ECMWF)','海水温（ECMWF）','Meerestemperatur (ECMWF)','Температура океана (ECMWF)']}
    ];
    const ecLbl=(l)=>l.label[Math.max(0,window.IntMapLang.index(HOST.lang))]||l.label[0];
    let sdk=null, sdkLoading=null, protoReg=false, panel=null, validTimes=[], timeIdx=0, refTime='';
    const state={};   /* id → {on, op} */
    LAYERS.forEach(l=>state[l.id]={on:false, op:l.op});
    function loadSDK(){ if(sdk) return Promise.resolve(sdk); if(sdkLoading) return sdkLoading;
      sdkLoading=new Promise((res,rej)=>{ if(window.OMWeatherMapLayer){ sdk=window.OMWeatherMapLayer; return res(sdk); }
        const s=document.createElement('script'); s.src=SDK_URL; s.async=true;
        s.onload=()=>{ sdk=window.OMWeatherMapLayer; sdk?res(sdk):rej(new Error('SDK global missing')); };
        s.onerror=()=>rej(new Error('SDK load failed')); document.head.appendChild(s); });
      return sdkLoading; }
    function registerProto(){ if(protoReg||!sdk||!sdk.omProtocol) return protoReg; try{ GE().scene.addProtocol('om', sdk.omProtocol); protoReg=true; }catch(_){ protoReg=true; /* already added */ } return protoReg; }
    function firstSymbolId(){ try{ for(const l of (GE().scene.getStyle().layers||[])) if(l.type==='symbol') return l.id; }catch(_){} return undefined; }
    function fetchMeta(){ return fetch(BASE).then(r=>r.json()).then(j=>{
      /* (#R17) The ECMWF feed publishes FORECAST steps into the future; the user doesn't want the slider to
         scrub past "now". Keep only valid-times up to the current hour (+1 h grace). */
      const all=j.valid_times||[]; const cut=Date.now()+3600e3;
      validTimes=all.filter(tm=>{ try{ return new Date((''+tm).replace('Z','')+'Z').getTime()<=cut; }catch(_){ return true; } });
      if(!validTimes.length) validTimes=all.slice();
      refTime=j.reference_time||''; if(!timeIdx&&validTimes.length){ /* default to the step nearest "now" */ const now=Date.now(); let bi=0,bd=Infinity; validTimes.forEach((t,i)=>{ const d=Math.abs(new Date(t.replace('Z','')+'Z')-now); if(d<bd){bd=d;bi=i;} }); timeIdx=bi; } }).catch(()=>{}); }
    function omUrl(variable,extra){ const t=validTimes[timeIdx]; return 'om://'+BASE+'?variable='+encodeURIComponent(variable)+(extra||'')+(t?('&time='+encodeURIComponent(t)):''); }
    function addLayer(cfg){
      const sid=cfg.id+'-src'; const before=firstSymbolId();
      try{
        if(cfg.type==='isobars'){
          if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'vector',url:omUrl(cfg.variable)});
          if(!GE().layers.has(cfg.id)) GE().layers.add({id:cfg.id,type:'line',source:sid,'source-layer':'contours',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':'rgba(255,255,255,0.9)','line-width':1.1,'line-opacity':cfg.op}},before);
          if(!GE().layers.has(cfg.id+'-lbl')) GE().layers.add({id:cfg.id+'-lbl',type:'symbol',source:sid,'source-layer':'contours',layout:{visibility:'none','symbol-placement':'line','text-field':['get','value'],'text-size':window.IntMapLabelScale.sub(0.82)},paint:{'text-color':'#fff','text-halo-color':'rgba(0,0,0,0.7)','text-halo-width':1.2}},before);
        } else if(cfg.type==='arrows'){
          /* Wind directional barbs (vector 'wind-arrows' layer; needs &arrows=true). Color darkens with speed. */
          if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'vector',url:omUrl(cfg.variable,'&arrows=true')});
          if(!GE().layers.has(cfg.id)) GE().layers.add({id:cfg.id,type:'line',source:sid,'source-layer':'wind-arrows',layout:{visibility:'none','line-cap':'round'},paint:{'line-width':1.8,'line-opacity':cfg.op,'line-color':['interpolate',['linear'],['to-number',['get','value'],0],0,'#5b8ff9',6,'#36cfc9',12,'#73d13d',18,'#ffd666',26,'#ff7a45',36,'#cf1322']}},before);
        } else {
          if(!GE().layers.hasSource(sid)) GE().layers.addSource(sid,{type:'raster',url:omUrl(cfg.variable),maxzoom:12});
          if(!GE().layers.has(cfg.id)) GE().layers.add({id:cfg.id,type:'raster',source:sid,layout:{visibility:'none'},paint:{'raster-opacity':cfg.op,'raster-fade-duration':0}},before);
        }
        return true;
      }catch(e){ try{ console.warn('ECMWF add fail',cfg.id,e); }catch(_){} return false; }
    }
    function removeLayer(cfg){ [cfg.id,cfg.id+'-lbl'].forEach(l=>{ try{ if(GE().layers.has(l)) GE().layers.remove(l); }catch(_){} }); try{ if(GE().layers.hasSource(cfg.id+'-src')) GE().layers.removeSource(cfg.id+'-src'); }catch(_){} }
    function setVis(cfg,on){ [cfg.id,cfg.id+'-lbl'].forEach(l=>{ try{ if(GE().layers.has(l)) GE().layers.setLayout(l,'visibility',on?'visible':'none'); }catch(_){} }); }
    function setOp(cfg,op){ try{ if(cfg.type==='isobars'||cfg.type==='arrows'){ if(GE().layers.has(cfg.id)) GE().layers.setPaint(cfg.id,'line-opacity',op); } else if(GE().layers.has(cfg.id)) GE().layers.setPaint(cfg.id,'raster-opacity',op); }catch(_){} }
    /* Public toggle API (the brief asked for toggleWeatherLayer(layerId, visible)). */
    function toggle(id,on){ const cfg=LAYERS.find(l=>l.id===id); if(!cfg) return;
      state[id].on=on;
      try{ ensureTimeLegend(); syncTimeLegend(); }catch(_){}   /* (#R15c) show the time legend while any ECMWF layer is on */
      loadSDK().then(()=>{ if(!registerProto()) return;
        const go=()=>{ if(!_imCanDraw()){ GE().events.once('idle',go); return; } if(on){ if(!fetched){ fetchMeta().then(()=>{ fetched=true; if(addLayer(cfg)){ setVis(cfg,true); setOp(cfg,state[id].op); } updateTimeLabel(); }); } else { if(addLayer(cfg)){ setVis(cfg,true); setOp(cfg,state[id].op); } } } else { setVis(cfg,false); } };
        go();
      }).catch(()=>{ try{ satToast(jp()?'ECMWFデータを読み込めませんでした':'Could not load ECMWF weather'); }catch(_){} try{ state[id].on=false; }catch(_){}   /* (#R154) also clear the STATE, not just the checkbox — otherwise the on('styledata') re-attach + applyTime re-show a layer whose box is OFF after a load failure */ const cb=document.getElementById('dl-'+id); if(cb){ cb.checked=false; const r=cb.closest('.lyr-row'); if(r) r.classList.remove('on'); } });
    }
    window.toggleWeatherLayer=toggle;
    let fetched=false;
    /* Rebuild all active sources when the valid-time changes. */
    function applyTime(){ LAYERS.forEach(cfg=>{ if(state[cfg.id].on){ removeLayer(cfg); if(addLayer(cfg)){ setVis(cfg,true); setOp(cfg,state[cfg.id].op); } } }); updateTimeLabel(); }
    function fmtVT(iso){ if(!iso) return ''; try{ let tz; if(typeof HOST.userTZ!=='undefined'&&HOST.userTZ&&HOST.userTZ!=='auto') tz=HOST.userTZ; return new Date(iso.replace('Z','')+'Z').toLocaleString(jp()?'ja-JP':'en-GB',{timeZone:tz,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(_){ return iso; } }
    function updateTimeLabel(){ const el=document.getElementById('ec-validtime'); if(el) el.textContent=(jp()?'ECMWF 有効時刻: ':'ECMWF valid: ')+(validTimes.length?fmtVT(validTimes[timeIdx]):(jp()?'最新':'latest')); const sl=document.getElementById('ec-time'); if(sl){ sl.max=Math.max(0,validTimes.length-1); sl.value=timeIdx; } }
    /* re-attach after a style swap */
    GE().events.on('styledata',()=>{ if(LAYERS.some(l=>state[l.id].on)){ setTimeout(()=>{ if(!_imCanDraw())return; LAYERS.forEach(cfg=>{ if(state[cfg.id].on){ if(addLayer(cfg)){ setVis(cfg,true); setOp(cfg,state[cfg.id].op); } } }); },80); } });
    function buildPanel(){ if(panel) return panel; panel=document.createElement('div'); panel.className='tool-panel'; panel.id='ec-panel'; (document.getElementById('map-container')||document.body).appendChild(panel); return panel; }
    function refreshPanel(){ const p=buildPanel(); p.style.cssText='display:block;left:24px;top:74px;right:auto;bottom:auto;z-index:1600;width:260px;max-height:78vh;overflow-y:auto;';
      const rows=LAYERS.map(l=>'<div class="lyr-row'+(state[l.id].on?' on':'')+'" style="margin:2px 0;"><label class="layer-option" style="display:flex;align-items:center;gap:7px;"><input type="checkbox" id="'+l.id+'-cb"'+(state[l.id].on?' checked':'')+'> <span>'+ecLbl(l)+'</span></label><input type="range" class="ec-op" data-for="'+l.id+'" min="0" max="1" step="0.05" value="'+state[l.id].op+'" style="width:100%;accent-color:var(--primary-color);'+(state[l.id].on?'':'display:none;')+'"></div>').join('');
      p.innerHTML='<div class="tp-header"><span class="tp-title">🌦 '+(jp()?'ECMWF 気象':'ECMWF weather')+'</span><button class="tp-close" title="'+t('close')+'">✕</button></div>'
        +'<div style="font-size:11px;color:var(--text-muted);margin:2px 0 6px;">'+(jp()?'Open-Meteo ECMWF IFS（1時間毎）':'Open-Meteo ECMWF IFS (hourly)')+'</div>'
        +rows
        +'<div style="border-top:1px solid rgba(128,128,128,0.18);margin-top:8px;padding-top:7px;">'
        +'<input type="range" id="ec-time" min="0" max="0" step="1" value="0" style="width:100%;accent-color:var(--primary-color);">'
        +'<div id="ec-validtime" style="font-size:11px;color:var(--text-main);font-weight:600;margin-top:3px;text-align:center;">'+(jp()?'最新':'latest')+'</div></div>';
      p.querySelector('.tp-close').onclick=()=>{ p.style.display='none'; };
      p.querySelectorAll('input[id$="-cb"]').forEach(cb=>{ cb.onchange=()=>{ const id=cb.id.replace(/-cb$/,''); const row=cb.closest('.lyr-row'); if(row) row.classList.toggle('on',cb.checked); const op=row&&row.querySelector('.ec-op'); if(op) op.style.display=cb.checked?'block':'none'; toggle(id,cb.checked); }; });
      p.querySelectorAll('.ec-op').forEach(sl=>{ sl.oninput=()=>{ const id=sl.getAttribute('data-for'); state[id].op=+sl.value; const cfg=LAYERS.find(l=>l.id===id); if(cfg) setOp(cfg,+sl.value); }; });
      const ts=p.querySelector('#ec-time'); if(ts) ts.oninput=()=>{ timeIdx=+ts.value; updateTimeLabel(); clearTimeout(window._ecTimeT); window._ecTimeT=setTimeout(applyTime,250); };
      try{ makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
      if(!fetched) loadSDK().then(()=>{ registerProto(); return fetchMeta(); }).then(()=>{ fetched=true; updateTimeLabel(); }).catch(()=>{});
      else updateTimeLabel();
    }
    function open(){ refreshPanel(); }
    /* Per the user: ECMWF must be treated like every other layer — NOT a separate button/panel. So each
       variable is injected as a normal lyr-row (checkbox + opacity) into the Layers dropdown, plus one
       shared "valid time" row driving the hourly time slider. The taxonomy reorganizer then files these
       rows into the Climate & weather / Oceans groups alongside the other weather layers. */
    function relabelRows(){ LAYERS.forEach(l=>{ const s=document.querySelector('#lyrrow-'+l.id+' .ec-lbl'); if(s) s.textContent=ecLbl(l); }); const tl=document.querySelector('#data-legend-ecmwf .ec-time-cap'); if(tl) tl.textContent=(window.IntMapLang.t(HOST.lang,'Valid time (hourly)','時刻（1時間毎）','Gültigkeitszeit (stündlich)','Время (почасово)','Hora de validez (cada hora)')); const eh=document.querySelector('#data-legend-ecmwf h4'); if(eh) eh.textContent=(window.IntMapLang.t(HOST.lang,'ECMWF weather','ECMWF 気象','ECMWF-Wetter','Погода ECMWF','Meteo ECMWF')); updateTimeLabel(); }   /* (#R111) the legend TITLE also re-localizes (it was baked at creation and relabelRows only touched the rows) */
    function mountRows(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('lyrrow-ec-temp')) return;
      LAYERS.forEach(l=>{
        const w=document.createElement('div'); w.className='lyr-row'; w.id='lyrrow-'+l.id;
        w.innerHTML='<label class="layer-option"><input type="checkbox" id="dl-'+l.id+'"> <span class="ec-lbl">'+ecLbl(l)+'</span></label><input type="range" class="lyr-op ec-op" data-for="'+l.id+'" min="0" max="1" step="0.05" value="'+state[l.id].op+'">';
        dd.appendChild(w);
        const cb=w.querySelector('#dl-'+l.id), op=w.querySelector('.ec-op');
        cb.addEventListener('change',()=>{ w.classList.toggle('on',cb.checked); toggle(l.id,cb.checked); });
        op.addEventListener('input',()=>{ state[l.id].op=+op.value; const cfg=LAYERS.find(x=>x.id===l.id); if(cfg) setOp(cfg,+op.value); });
      });
      /* (#R15c) The shared hourly valid-time slider is now a floating LEGEND, NOT a Layers-tab row. */
      ensureTimeLegend();
      if(!fetched) loadSDK().then(()=>{ registerProto(); return fetchMeta(); }).then(()=>{ fetched=true; updateTimeLabel(); }).catch(()=>{});
      else updateTimeLabel();
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){}
    }
    /* (#R15c) ECMWF hourly time slider as a draggable legend (shown only while an ECMWF layer is on). */
    function ensureTimeLegend(){
      if(document.getElementById('data-legend-ecmwf')) return;
      const mc=document.getElementById('map-container')||document.body;
      const el=document.createElement('div'); el.className='data-legend'; el.id='data-legend-ecmwf'; el.style.bottom='140px';
      el.innerHTML='<span class="dl-drag" title="'+(jp()?'ドラッグして移動':'Drag to move')+'">⋮⋮</span><button class="layer-popup-x" id="ec-legend-x" title="'+t('close')+'">✕</button><h4>'+(jp()?'ECMWF 気象':'ECMWF weather')+'</h4>'
        +'<div class="ec-time-cap" style="font-size:10.5px;color:var(--text-muted);margin:0 0 4px;">'+(jp()?'時刻（1時間毎）':'Valid time (hourly)')+'</div>'
        +'<input type="range" id="ec-time" min="0" max="0" step="1" value="0" style="width:100%;accent-color:var(--primary-color);">'
        +'<div id="ec-validtime" style="font-size:10.5px;color:var(--text-main);font-weight:600;margin-top:3px;text-align:center;">'+(jp()?'最新':'latest')+'</div>';
      mc.appendChild(el);
      const ts=el.querySelector('#ec-time'); ts.oninput=()=>{ timeIdx=+ts.value; updateTimeLabel(); clearTimeout(window._ecTimeT); window._ecTimeT=setTimeout(applyTime,250); };
      el.querySelector('#ec-legend-x').onclick=()=>{ el.style.display='none'; };
      try{ window._wireLegendDrag&&window._wireLegendDrag(el); }catch(_){}
    }
    function syncTimeLegend(){ const el=document.getElementById('data-legend-ecmwf'); if(el) el.style.display = LAYERS.some(l=>state[l.id].on) ? 'block' : 'none'; }
    window._ecSyncTimeLegend=syncTimeLegend;
    mountRows(); setTimeout(mountRows,1500);
    window.addEventListener('intmap-lang',()=>{ relabelRows(); if(panel&&panel.style.display!=='none') refreshPanel(); });
    return { open, toggle, setOp:(id,op)=>{ const c=LAYERS.find(l=>l.id===id); if(c) setOp(c,op); }, _layers:LAYERS };
  })();
};

window.IntMapModules.weatherPanel=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const t=HOST.t, fmtTemp=HOST.fmtTemp;
  window.IntMapWeather=(function(){
    if(!GE().hasRenderer()) return { open(){} };
    const L=window.IntMapLang.pick(()=>HOST.lang);
    function wx(code){ const M={
      0:['☀️','Clear sky','快晴','Klarer Himmel','Ясно','Despejado'],1:['🌤','Mainly clear','晴れ','Überwiegend klar','Преим. ясно','Mayormente despejado'],
      2:['⛅','Partly cloudy','一部曇り','Teilweise bewölkt','Переменная облачность','Parcialmente nublado'],3:['☁️','Overcast','曇り','Bedeckt','Пасмурно','Nublado'],
      45:['🌫','Fog','霧','Nebel','Туман','Niebla'],48:['🌫','Rime fog','着氷霧','Reifnebel','Изморозь','Niebla helada'],
      51:['🌦','Light drizzle','弱い霧雨','Leichter Niesel','Слабая морось','Llovizna débil'],53:['🌦','Drizzle','霧雨','Niesel','Морось','Llovizna'],55:['🌧','Heavy drizzle','強い霧雨','Starker Niesel','Сильная морось','Llovizna intensa'],
      61:['🌧','Light rain','弱い雨','Leichter Regen','Небольшой дождь','Lluvia débil'],63:['🌧','Rain','雨','Regen','Дождь','Lluvia'],65:['🌧','Heavy rain','強い雨','Starker Regen','Сильный дождь','Lluvia intensa'],
      66:['🌧','Freezing rain','着氷性の雨','Gefrierender Regen','Ледяной дождь','Lluvia helada'],67:['🌧','Freezing rain','着氷性の雨','Gefrierender Regen','Ледяной дождь','Lluvia helada'],
      71:['🌨','Light snow','弱い雪','Leichter Schnee','Небольшой снег','Nieve débil'],73:['🌨','Snow','雪','Schnee','Снег','Nieve'],75:['❄️','Heavy snow','大雪','Starker Schnee','Сильный снег','Nieve intensa'],77:['❄️','Snow grains','霧雪','Schneegriesel','Снежные зёрна','Granos de nieve'],
      80:['🌦','Light showers','弱いにわか雨','Leichte Schauer','Слабый ливень','Chubascos débiles'],81:['🌦','Showers','にわか雨','Schauer','Ливни','Chubascos'],82:['⛈','Heavy showers','激しいにわか雨','Starke Schauer','Сильные ливни','Chubascos intensos'],
      85:['🌨','Snow showers','にわか雪','Schneeschauer','Снежный ливень','Chubascos de nieve'],86:['🌨','Snow showers','にわか雪','Schneeschauer','Снежный ливень','Chubascos de nieve'],
      95:['⛈','Thunderstorm','雷雨','Gewitter','Гроза','Tormenta'],96:['⛈','Thunderstorm, hail','雹を伴う雷雨','Gewitter, Hagel','Гроза с градом','Tormenta, granizo'],99:['⛈','Thunderstorm, hail','雹を伴う雷雨','Gewitter, Hagel','Гроза с градом','Tormenta, granizo'] };
      const idx={en:1,jp:2,de:3,ru:4,es:5}[HOST.lang]||1; const e=M[code]; return e?{icon:e[0],desc:e[idx]}:{icon:'🌡',desc:'—'}; }
    const COMPASS=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const dir=(d)=>(d==null||isNaN(d))?'':COMPASS[Math.round(d/22.5)%16];
    const wind=(kmh)=>{ if(kmh==null||isNaN(kmh)) return '—'; const m=window.imUnitMode||window.unitMode||'both'; const k=Math.round(kmh), mph=Math.round(kmh*0.621371); return m==='imperial'?(mph+' mph'):m==='metric'?(k+' km/h'):(k+' km/h ('+mph+' mph)'); };
    /* (#R41) compact daily-outlook temperature — UNIT-AWARE. The old code printed raw °C even when the user
       chose °F ("華氏を選択しても、華氏に完全対応していない"). Now it follows window.imUnitTemp. */
    const dT=(c)=>{ if(c==null||isNaN(c)) return '—'; return ((window.imUnitTemp==='f')?Math.round(c*9/5+32):Math.round(c))+'°'; };
    /* (#R42) In '°C + °F' mode the daily strip showed ONLY °C ("摂氏＋華氏を選択しても華氏に対応していない").
       fF supplies the secondary °F figure so 'both' really shows both units; single-unit modes already follow dT. */
    const fF=(c)=>(c==null||isNaN(c))?'–':Math.round(c*9/5+32);
    let panel=null, styled=false, _lastLL=null;
    function ensureStyle(){ if(styled) return; styled=true; const s=document.createElement('style');
      s.textContent='#weather-panel{position:absolute;z-index:1750;width:300px;max-width:calc(100vw - 24px);background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));border-radius:16px;box-shadow:var(--shadow);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);padding:14px 16px;font-size:12.5px;}'
        +'#weather-panel .wp-x{position:absolute;top:9px;right:11px;background:none;border:none;color:var(--text-muted);font-size:19px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:8px;}'
        +'#weather-panel .wp-x:hover{background:var(--input-bg);color:var(--text-main);}'
        +'#weather-panel .wp-rf{position:absolute;top:10px;right:39px;background:none;border:none;color:var(--text-muted);font-size:16px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:8px;}'
        +'#weather-panel .wp-rf:hover{background:var(--input-bg);color:var(--text-main);transform:rotate(90deg);transition:transform .2s;}'
        +'#weather-panel .wp-head{padding-right:58px;touch-action:none;user-select:none;}'
        +'#weather-panel .wp-cur{display:flex;align-items:center;gap:12px;margin:6px 0 4px;}'
        +'#weather-panel .wp-temp{font-size:30px;font-weight:700;line-height:1;}'
        +'#weather-panel .wp-ico{font-size:34px;line-height:1;}'
        +'#weather-panel .wp-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px 12px;margin-top:8px;font-size:11.5px;color:var(--text-muted);}'
        +'#weather-panel .wp-grid b{color:var(--text-main);font-weight:600;}'
        +'#weather-panel .wp-days{display:flex;gap:4px;margin-top:11px;border-top:1px solid rgba(128,128,128,0.18);padding-top:9px;}'
        +'#weather-panel .wp-day{flex:1;text-align:center;font-size:10.5px;color:var(--text-muted);}'
        +'#weather-panel .wp-day .di{font-size:18px;margin:2px 0;}'
        +'#weather-panel .wp-day b{display:block;color:var(--text-main);font-size:11px;}'
        +'#weather-panel .wp-dayf{font-size:8.5px;color:var(--text-muted);margin-top:1px;line-height:1.2;}'
        +'@media(max-width:768px){#weather-panel{left:8px !important;right:8px;width:auto;top:auto !important;bottom:calc(var(--sheet-cover, var(--peek-h)) + 12px) !important;}}';
      document.head.appendChild(s); }
    function ensure(){ if(panel) return panel; ensureStyle(); panel=document.createElement('div'); panel.id='weather-panel'; panel.style.display='none';
      (document.getElementById('map-container')||document.body).appendChild(panel);
      try{ window._wireLegendDrag&&window._wireLegendDrag(panel); }catch(_){}
      return panel; }
    function close(){ if(panel) panel.style.display='none'; }
    /* (#R41) don't snap a user-dragged panel back to the corner when the data finishes loading. */
    function place(){ try{ if(panel&&panel.dataset.dragged) return; const mc=document.getElementById('map-container'); if(!mc) return; if(window.matchMedia&&window.matchMedia('(max-width:768px)').matches) return; panel.style.left=(mc.clientWidth-panel.offsetWidth-22)+'px'; panel.style.top='70px'; }catch(_){} }
    /* (#R72) "地点の天気機能が、表示されなくなっている" ROOT CAUSE: Open-Meteo's per-IP daily quota can be
       exhausted (this app is a heavy consumer — wind grids, widgets, probes), the API then answers
       429 {"error":true} and the panel silently rendered "—" placeholders forever. Fixes: (a) a 10-min
       per-location cache so reopening costs nothing; (b) an automatic FAILOVER to MET Norway
       (api.met.no Locationforecast, CORS-open) mapped into the same shape; (c) if both fail, an HONEST
       error line instead of a dash-filled skeleton. */
    /* (#R183) The ladder above is now ONE function shared with everything else that asks for weather:
       window.IntMapWx.point() (js/wx-source.js). The cache, the r.ok/{"error":true} guard and the MET
       Norway mapping this block used to hold privately are all in there, plus the thing #R72 could not
       have known it needed — a circuit breaker, so a daily-quota 429 stops the whole app re-asking for
       the rest of the day instead of only this panel backing off.
       Keeping a second copy here is what let the identical defect survive in js/widgets.js until #R183,
       so there is deliberately no second copy any more. `_metNo` stays as a thin alias because the
       function name appears in the R72 notes and in tests. */
    const _wxCache={};
    const _metNo=(lat,lng)=>window.IntMapWx.metNo(lat,lng);
    async function open(lngLat){ const p=ensure(); _lastLL=lngLat; p.style.display='block'; place();
      const lat=lngLat.lat, lng=lngLat.lng;
      /* (#R41) title is an <h4> so the shared _wireLegendDrag delegated handler makes the popup MOVABLE
         ("ポップアップは移動可能にしろ"); a ⟳ button re-fetches for always-latest data. */
      const head=`<button class="wp-x" title="${t('close')}">✕</button><button class="wp-rf" title="${L('Refresh','更新','Aktualisieren','Обновить','Actualizar')}">⟳</button><h4 class="wp-head" style="margin:0;font-weight:700;font-size:13.5px;cursor:move;">🌤 ${L('Weather','天気','Wetter','Погода','El tiempo')}</h4><div style="font-size:10.5px;color:var(--text-muted);margin-top:1px;">${lat.toFixed(3)}°, ${lng.toFixed(3)}°</div>`;
      p.innerHTML=head+`<div style="margin-top:12px;color:var(--text-muted);">${L('Loading…','読み込み中…','Wird geladen…','Загрузка…','Cargando…')}</div>`;
      p.querySelector('.wp-x').onclick=close; { const rf=p.querySelector('.wp-rf'); if(rf) rf.onclick=()=>open(_lastLL||lngLat); }
      try{
        const ck=lat.toFixed(2)+','+lng.toFixed(2);
        let j=null; const hit=_wxCache[ck];
        if(hit&&(Date.now()-hit.t)<600000) j=hit.j;
        if(!j){
          j=await window.IntMapWx.point(lat,lng,{days:5,uv:false});   /* Open-Meteo, else MET Norway — one ladder */
          if(!j) throw new Error('all weather sources failed');
          _wxCache[ck]={t:Date.now(),j};
        }
        const c=j.current||{}; const w=wx(c.weather_code);
        const days=(j.daily&&j.daily.time)||[]; const dn=L(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],['日','月','火','水','木','金','土'],['So','Mo','Di','Mi','Do','Fr','Sa'],['Вс','Пн','Вт','Ср','Чт','Пт','Сб'],['Do','Lu','Ma','Mi','Ju','Vi','Sá']);
        const _both=(window.imUnitTemp||'both')==='both';
        let dh=''; for(let i=0;i<days.length;i++){ const d=new Date(days[i]+'T00:00'); const dw=wx(j.daily.weather_code[i]);
          const mx=j.daily.temperature_2m_max[i], mn=j.daily.temperature_2m_min[i];
          const ff=_both?('<div class="wp-dayf">'+fF(mx)+'/'+fF(mn)+'°F</div>'):'';
          dh+=`<div class="wp-day"><div>${i===0?L('Today','今日','Heute','Сег.','Hoy'):dn[d.getDay()]}</div><div class="di">${dw.icon}</div><b>${dT(mx)}</b><div>${dT(mn)}</div>${ff}</div>`; }
        const upd=new Date().toLocaleTimeString(HOST.lang==='jp'?'ja':HOST.lang,{hour:'2-digit',minute:'2-digit'});
        p.innerHTML=head
          +`<div class="wp-cur"><span class="wp-ico">${w.icon}</span><span class="wp-temp">${fmtTemp(c.temperature_2m)}</span><span style="flex:1;font-size:12px;color:var(--text-muted);">${w.desc}</span></div>`
          +`<div class="wp-grid">`
          +`<span>${L('Feels like','体感','Gefühlt','Ощущается','Sensación')}<br><b>${fmtTemp(c.apparent_temperature)}</b></span>`
          +`<span>${L('Humidity','湿度','Luftf.','Влажность','Humedad')}<br><b>${c.relative_humidity_2m!=null?Math.round(c.relative_humidity_2m)+'%':'—'}</b></span>`
          +`<span>${L('Wind','風','Wind','Ветер','Viento')}<br><b>${wind(c.wind_speed_10m)} ${dir(c.wind_direction_10m)}</b></span>`
          +`<span>${L('Pressure','気圧','Druck','Давление','Presión')}<br><b>${c.surface_pressure!=null?Math.round(c.surface_pressure)+' hPa':'—'}</b></span>`
          +`<span>${L('Precip.','降水','Niederschl.','Осадки','Precip.')}<br><b>${c.precipitation!=null?c.precipitation+' mm':'—'}</b></span>`
          +`<span>${L('Updated','更新','Aktualisiert','Обновлено','Actualizado')}<br><b>${upd}</b></span>`
          +`</div><div class="wp-days">${dh}</div>`
          +`<div style="margin-top:9px;font-size:9.5px;color:var(--text-muted);">${j._src||'Open-Meteo'} · ${L('live · drag to move','最新 · ドラッグで移動','live · zum Verschieben ziehen','актуально · перетащите','en vivo · arrastra para mover')}</div>`;
        p.querySelector('.wp-x').onclick=close; { const rf=p.querySelector('.wp-rf'); if(rf) rf.onclick=()=>open(_lastLL||lngLat); } place();
      }catch(e){ p.innerHTML=head+`<div style="margin-top:12px;color:#ff453a;">${L('Weather temporarily unavailable (both weather services could not be reached — possibly rate-limited). Try again in a few minutes.','天気を一時的に取得できません（両方の気象サービスに接続できませんでした。レート制限の可能性があります）。数分後に再試行してください。','Wetter vorübergehend nicht verfügbar (beide Wetterdienste unerreichbar). Bitte später erneut versuchen.','Погода временно недоступна (оба сервиса не отвечают). Повторите позже.','El tiempo no está disponible temporalmente (ninguno de los servicios respondió). Inténtalo de nuevo en unos minutos.')}</div>`; const x=p.querySelector('.wp-x'); if(x) x.onclick=close; }
    }
    return { open, close };
  })();
};
