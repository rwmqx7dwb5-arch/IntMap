/* ============================================================================
 *  IntMap · Interactive map tools — IntMapModules.{projView,drawTool,isolate,seaRoute,los,objectList,outline,moveShape,isochrone,arc3d}  (#R166)
 * ----------------------------------------------------------------------------
 *  The self-contained tools the user drives ON the map: the 2D projection viewer, freehand
 *  drawing/annotation, single-country isolation, the maritime A* sea-route engine, line-of-sight
 *  profiles, the universal object list, region outlines, shape dragging, travel-time isochrones and
 *  the 3D great-circle arc overlay.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R166): each body below is
 *  byte-identical to the block that used to live there, except that closure values which are
 *  REASSIGNED at runtime are read through the live host interface (Architecture.md §3.1):
 *      currentLang -> HOST.lang
 *      currentProj -> HOST.proj
 *      radiusItems -> HOST.radiusItems
 *      userPins -> HOST.userPins
 *
 *  Every factory is called at the exact spot its block used to occupy, so execution order is
 *  unchanged. The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.projView=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  window.ProjView=(function(){
    const RAD=Math.PI/180, EARTH_KM=6371;
    let host=null, cv=null, ctx=null, sel=null, titleEl=null, entry=null, mEntry=null;
    let open=false, cur='equalEarth', center=[0,20];
    let land=null, landPromise=null, zoom=1, panx=0, pany=0, raf=0, dpr=1, cssW=0, cssH=0;
    let _S=1,_ox=0,_oy=0;

    function loadLand(){
      if(window.countryGeo&&window.countryGeo.features) return Promise.resolve(window.countryGeo);
      if(landPromise) return landPromise;
      landPromise=fetch('https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson').then(r=>r.ok?r.json():null).catch(()=>null);
      return landPromise;
    }
    const sinc=a=>Math.abs(a)<1e-12?1:Math.sin(a)/a;
    function mollTheta(phi){ if(Math.abs(phi)>=Math.PI/2-1e-9) return phi>0?Math.PI/2:-Math.PI/2; let t=phi; for(let i=0;i<10;i++){ const d=(2*t+Math.sin(2*t)-Math.PI*Math.sin(phi))/(2+2*Math.cos(2*t)); t-=d; if(Math.abs(d)<1e-7) break; } return t; }
    const ROBX=[1,0.9986,0.9954,0.99,0.9822,0.973,0.96,0.9427,0.9216,0.8962,0.8679,0.835,0.7986,0.7597,0.7186,0.6732,0.6213,0.5722,0.5322];
    const ROBY=[0,0.062,0.124,0.186,0.248,0.31,0.372,0.434,0.4958,0.5571,0.6176,0.6769,0.7346,0.7903,0.8435,0.8936,0.9394,0.9761,1];
    const PROJS={
      equalEarth:{name:{en:'Equal Earth',jp:'イコールアース図法'}, fn(loD,laD){ const l=loD*RAD,p=laD*RAD,M=Math.sqrt(3)/2,A1=1.340264,A2=-0.081106,A3=0.000893,A4=0.003796; const th=Math.asin(M*Math.sin(p)),t2=th*th,t6=t2*t2*t2; return [l*Math.cos(th)/(M*(A1+3*A2*t2+t6*(7*A3+9*A4*t2))), th*(A1+A2*t2+t6*(A3+A4*t2))]; }},
      robinson:{name:{en:'Robinson',jp:'ロビンソン図法'}, fn(loD,laD){ const a=Math.min(17.9999,Math.abs(laD)/5),i=Math.floor(a),f=a-i; const xl=ROBX[i]+(ROBX[i+1]-ROBX[i])*f, yl=ROBY[i]+(ROBY[i+1]-ROBY[i])*f; return [0.8487*xl*loD*RAD, 1.3523*yl*(laD<0?-1:1)]; }},
      winkel:{name:{en:'Winkel Tripel',jp:'ヴィンケル第三図法'}, fn(loD,laD){ const l=loD*RAD,p=laD*RAD,p1=Math.acos(2/Math.PI); const al=Math.acos(Math.max(-1,Math.min(1,Math.cos(p)*Math.cos(l/2)))),sc=sinc(al); return [0.5*(l*Math.cos(p1)+2*Math.cos(p)*Math.sin(l/2)/sc), 0.5*(p+Math.sin(p)/sc)]; }},
      mollweide:{name:{en:'Mollweide',jp:'モルワイデ図法'}, fn(loD,laD){ const l=loD*RAD,th=mollTheta(laD*RAD); return [(2*Math.SQRT2/Math.PI)*l*Math.cos(th), Math.SQRT2*Math.sin(th)]; }},
      equirect:{name:{en:'Equirectangular',jp:'正距円筒図法'}, fn(loD,laD){ return [loD*RAD, laD*RAD]; }},
      azimuthal:{name:{en:'Azimuthal equidistant',jp:'正距方位図法'}, azim:true, fn(loD,laD,c){ const l=loD*RAD,p=laD*RAD,l0=c[0]*RAD,p1=c[1]*RAD; let cc=Math.sin(p1)*Math.sin(p)+Math.cos(p1)*Math.cos(p)*Math.cos(l-l0); cc=Math.max(-1,Math.min(1,cc)); if(cc<-0.99996) return null; const C=Math.acos(cc); if(C<1e-9) return [0,0]; const k=C/Math.sin(C); return [k*Math.cos(p)*Math.sin(l-l0), k*(Math.cos(p1)*Math.sin(p)-Math.sin(p1)*Math.cos(p)*Math.cos(l-l0))]; }}
    };
    const projRaw=(lo,la)=>PROJS[cur].fn(lo,la,center);
    const toScreen=(px,py)=>({x:_ox+_S*px+panx, y:_oy-_S*py+pany});
    const projectPt=(ll)=>{ const f=projRaw(ll[0],ll[1]); return f?toScreen(f[0],f[1]):null; };
    function fit(){
      let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
      if(PROJS[cur].azim){ minx=miny=-Math.PI; maxx=maxy=Math.PI; }
      else for(let la=-90;la<=90;la+=5) for(let lo=-180;lo<=180;lo+=5){ const f=projRaw(lo,la); if(!f) continue; if(f[0]<minx)minx=f[0]; if(f[0]>maxx)maxx=f[0]; if(f[1]<miny)miny=f[1]; if(f[1]>maxy)maxy=f[1]; }
      const w=maxx-minx||1, h=maxy-miny||1, pad=46;
      _S=Math.min((cssW-pad)/w,(cssH-pad)/h)*zoom;
      _ox=cssW/2 - _S*((minx+maxx)/2); _oy=cssH/2 + _S*((miny+maxy)/2);
    }
    function outlineRing(){ const r=[],push=(lo,la)=>{const f=projRaw(lo,la); if(f) r.push(f);};
      for(let la=-90;la<=90;la+=2) push(-180,la);
      for(let lo=-180;lo<=180;lo+=2) push(lo,90);
      for(let la=90;la>=-90;la-=2) push(180,la);
      for(let lo=180;lo>=-180;lo-=2) push(lo,-90);
      return r; }
    function strokePath(samples){ ctx.beginPath(); let prev=null,started=false; for(const ll of samples){ const p=projectPt(ll); if(!p){started=false;prev=null;continue;} if(!started){ctx.moveTo(p.x,p.y);started=true;} else { if(prev&&Math.hypot(p.x-prev.x,p.y-prev.y)>cssW*0.5) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);} prev=p; } ctx.stroke(); }
    function render(){
      if(!open||!ctx) return;
      fit();
      const dark=document.documentElement.getAttribute('data-theme')==='dark';
      const ocean=dark?'#0a2436':'#b9dcf0', landFill=dark?'#3a4048':'#e7e1d2', border=dark?'#11161c':'#9b9078', grat=dark?'rgba(255,255,255,0.12)':'rgba(20,40,70,0.13)';
      ctx.clearRect(0,0,cssW,cssH);
      ctx.beginPath();
      if(PROJS[cur].azim){ const c0=toScreen(0,0); ctx.arc(c0.x,c0.y,_S*Math.PI,0,2*Math.PI); }
      else { const ring=outlineRing(); ring.forEach((p,i)=>{ const s=toScreen(p[0],p[1]); i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y); }); ctx.closePath(); }
      ctx.fillStyle=ocean; ctx.fill();
      /* graticule */
      ctx.strokeStyle=grat; ctx.lineWidth=1;
      for(let lo=-180;lo<=180;lo+=30){ const s=[]; for(let la=-90;la<=90;la+=2) s.push([lo,la]); strokePath(s); }
      for(let la=-60;la<=60;la+=30){ const s=[]; for(let lo=-180;lo<=180;lo+=2) s.push([lo,la]); strokePath(s); }
      /* land */
      if(land&&land.features){
        ctx.fillStyle=landFill; ctx.strokeStyle=border; ctx.lineWidth=0.7;
        const drawPoly=(poly)=>{ ctx.beginPath(); for(const ring of poly){ let started=false,prev=null; for(let i=0;i<ring.length;i++){ const p=projectPt(ring[i]); if(!p){started=false;prev=null;continue;} if(!started){ctx.moveTo(p.x,p.y);started=true;} else { if(prev&&Math.hypot(p.x-prev.x,p.y-prev.y)>cssW*0.4) ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y);} prev=p; } } ctx.fill('evenodd'); ctx.stroke(); };
        land.features.forEach(f=>{ const g=f.geometry; if(!g) return; if(g.type==='Polygon') drawPoly(g.coordinates); else if(g.type==='MultiPolygon') g.coordinates.forEach(drawPoly); });
      }
      /* azimuthal: concentric equidistant range rings + the focus point */
      if(PROJS[cur].azim){
        const c0=toScreen(0,0);
        ctx.strokeStyle=dark?'rgba(120,200,255,0.5)':'rgba(0,80,150,0.4)'; ctx.lineWidth=1; ctx.setLineDash([4,5]);
        for(const D of [2500,5000,7500,10000,12500,15000,17500]){ const r=_S*(D/EARTH_KM); if(r<8||r>Math.max(cssW,cssH)*1.4) continue; ctx.beginPath(); ctx.arc(c0.x,c0.y,r,0,2*Math.PI); ctx.stroke(); }
        ctx.setLineDash([]);
        ctx.fillStyle=dark?'rgba(170,225,255,0.92)':'rgba(0,60,115,0.85)'; ctx.font='11px -apple-system,sans-serif'; ctx.textAlign='center';
        for(const D of [2500,5000,7500,10000,12500,15000]){ const r=_S*(D/EARTH_KM); if(r<16) continue; ctx.fillText(D.toLocaleString()+' km', c0.x, c0.y-r-3); }
        ctx.fillStyle='#ff3b30'; ctx.beginPath(); ctx.arc(c0.x,c0.y,5,0,2*Math.PI); ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#fff'; ctx.stroke();
      }
    }
    function scheduleRender(){ if(raf) return; raf=requestAnimationFrame(()=>{ raf=0; render(); }); }
    function resize(){ if(!host) return; dpr=Math.min(2,window.devicePixelRatio||1); cssW=host.clientWidth; cssH=host.clientHeight; cv.width=cssW*dpr; cv.height=cssH*dpr; cv.style.width=cssW+'px'; cv.style.height=cssH+'px'; ctx.setTransform(dpr,0,0,dpr,0,0); render(); }
    function updateTitle(){ if(!titleEl) return; const nm=(PROJS[cur].name[HOST.lang]||PROJS[cur].name.en); titleEl.textContent = PROJS[cur].azim ? (nm+' · '+center[1].toFixed(1)+'°, '+center[0].toFixed(1)+'°') : nm; }
    function ensureDOM(){
      if(host) return;
      const st=document.createElement('style'); st.textContent=`
        .proj-host{ position:absolute; inset:0; z-index:1400; display:none; background:var(--bg-color); }
        .proj-host.on{ display:block; }
        .proj-host canvas{ position:absolute; inset:0; touch-action:none; cursor:grab; }
        .proj-host canvas:active{ cursor:grabbing; }
        .proj-bar{ position:absolute; top:12px; left:50%; transform:translateX(-50%); z-index:2; display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:center; background:var(--glass-fill); -webkit-backdrop-filter:saturate(160%) blur(16px); backdrop-filter:saturate(160%) blur(16px); border:1px solid var(--glass-border,rgba(128,128,128,0.18)); border-radius:12px; padding:7px 10px; box-shadow:var(--shadow); max-width:calc(100% - 20px); }
        .proj-bar .proj-title{ font-size:12.5px; font-weight:700; color:var(--text-main); }
        .proj-bar select{ padding:6px 8px; border-radius:8px; border:1px solid rgba(128,128,128,0.25); background:var(--input-bg); color:var(--text-main); font-size:12px; }
        .proj-bar button{ border:1px solid rgba(128,128,128,0.22); background:var(--input-bg); color:var(--text-main); border-radius:8px; padding:6px 10px; font-size:13px; font-weight:600; cursor:pointer; }
        .proj-bar button.proj-close{ background:var(--primary-color); color:#fff; border-color:transparent; }
        .proj-entry{ -webkit-appearance:none; appearance:none; }
        @media(max-width:768px){ .proj-bar{ top:calc(env(safe-area-inset-top) + 8px); } }
      `; document.head.appendChild(st);
      const mc=document.getElementById('map-container')||document.body;
      host=document.createElement('div'); host.className='proj-host';
      cv=document.createElement('canvas'); host.appendChild(cv);
      const bar=document.createElement('div'); bar.className='proj-bar';
      titleEl=document.createElement('span'); titleEl.className='proj-title';
      sel=document.createElement('select');
      sel.innerHTML=Object.keys(PROJS).map(k=>`<option value="${k}">${PROJS[k].name[HOST.lang]||PROJS[k].name.en}</option>`).join('');
      sel.onchange=()=>{ cur=sel.value; zoom=1;panx=0;pany=0; if(entry)entry.value=cur; updateTitle(); render(); };
      const zin=document.createElement('button'); zin.textContent='＋'; zin.onclick=()=>{ zoom=Math.min(8,zoom*1.25); render(); };
      const zout=document.createElement('button'); zout.textContent='－'; zout.onclick=()=>{ zoom=Math.max(0.5,zoom/1.25); render(); };
      const cl=document.createElement('button'); cl.className='proj-close'; cl.textContent=(window.IntMapLang.t(HOST.lang,'Close','閉じる','Schließen','Закрыть','Cerrar')); cl.onclick=()=>api.close();
      bar.appendChild(titleEl); bar.appendChild(sel); bar.appendChild(zout); bar.appendChild(zin); bar.appendChild(cl);
      host.appendChild(bar); mc.appendChild(host); ctx=cv.getContext('2d');
      /* input: drag to pan, wheel to zoom */
      let dragging=false,lx=0,ly=0;
      cv.addEventListener('pointerdown',e=>{ dragging=true; lx=e.clientX; ly=e.clientY; try{cv.setPointerCapture(e.pointerId);}catch(_){} });
      cv.addEventListener('pointermove',e=>{ if(!dragging) return; panx+=e.clientX-lx; pany+=e.clientY-ly; lx=e.clientX; ly=e.clientY; scheduleRender(); });
      const up=()=>{ dragging=false; }; cv.addEventListener('pointerup',up); cv.addEventListener('pointercancel',up);
      cv.addEventListener('wheel',e=>{ e.preventDefault(); const f=e.deltaY<0?1.12:0.89; zoom=Math.max(0.5,Math.min(8,zoom*f)); scheduleRender(); },{passive:false});
      window.addEventListener('resize',()=>{ if(open) resize(); });
    }
    const api={
      open(proj,c){ ensureDOM(); cur=PROJS[proj]?proj:'equalEarth'; if(c&&c.length===2) center=[+c[0],+c[1]]; zoom=1;panx=0;pany=0; open=true; host.classList.add('on'); if(sel)sel.value=cur; if(entry)entry.value=cur; updateTitle(); resize(); loadLand().then(g=>{ land=(window.countryGeo&&window.countryGeo.features)?window.countryGeo:g; render(); }); },
      close(){ open=false; if(host) host.classList.remove('on'); if(entry) entry.value='mercator'; if(mEntry) mEntry.value='mercator'; },
      isOpen:()=>open,
      _projs:PROJS
    };
    /* ---- entry selectors (#16): desktop top-controls + mobile map sheet ---- */
    function chooseProj(v){ if(v==='mercator'){ api.close(); } else { let c=[0,20]; try{ if(window.map&&GE().hasRenderer()&&GE().camera.getCenter){ const cc=GE().camera.getCenter(); c=[cc.lng,cc.lat]; } }catch(_){} api.open(v,c); } }
    window.__projChoose=chooseProj;
    /* (#R7-proj) The Flat-view no longer carries a projection SELECTOR — Flat = real Mercator and Globe
       stay in perfect lock-step with the live map (the user disliked a separate "blank" projection
       window hijacking the Flat toggle). The alternative projections live in the right-click context
       menu instead: Azimuthal-equidistant is centerd on the clicked point, and an "All projections…"
       entry opens the viewer (whose own bar still switches between Equal Earth / Robinson / Winkel /
       Mollweide / Equirectangular / Azimuthal). So buildEntries no longer injects any selector. */
    function buildEntries(){ /* intentionally empty — see note above */ }
    /* Close the projection viewer whenever the user returns to the real map via Flat/Globe/3D. */
    function _wireProjAutoClose(){ ['btn-view-flat','btn-view-globe','btn-view-3d'].forEach(id=>{ const b=document.getElementById(id); if(b&&!b.__projWired){ b.__projWired=1; b.addEventListener('click',()=>{ try{ if(api.isOpen()) api.close(); }catch(_){} }); } }); }
    if(document.readyState!=='loading') setTimeout(_wireProjAutoClose,0); else document.addEventListener('DOMContentLoaded',_wireProjAutoClose);
    return api;
  })();
};

window.IntMapModules.drawTool=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const ringArea=HOST.ringArea, t=HOST.t, distHTML=HOST.distHTML, areaHTML=HOST.areaHTML, makeDraggable=HOST.makeDraggable, imToast=HOST.imToast, exitTool=HOST.exitTool;
  window.DrawTool=(function(){
    if(!GE().hasRenderer()) return { start(){}, toggle(){}, active(){return false;}, exit(){}, onResolution(){} };
    let state='off';                 // off | armed | drawing | done
    let raw=[], simplified=[], loopRings=[], lockedArea=0, lengthKm=0, smoothing=0, closeAux=null;
    let lastPx=null, panel=null, layersReady=false, hadTouchMove=false, sampleN=0;
    const MIN_PX=5;                  // min cursor travel between samples (screen px)

    /* ---- geometry ---- */
    function perpDist(p,a,b){ const dx=b[0]-a[0],dy=b[1]-a[1],L=dx*dx+dy*dy; if(L<1e-18) return Math.hypot(p[0]-a[0],p[1]-a[1]); let tt=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L; tt=Math.max(0,Math.min(1,tt)); return Math.hypot(p[0]-(a[0]+tt*dx),p[1]-(a[1]+tt*dy)); }
    function rdp(pts,eps){ if(pts.length<3||eps<=0) return pts.slice(); const keep=new Array(pts.length).fill(false); keep[0]=keep[pts.length-1]=true; const stk=[[0,pts.length-1]];
      while(stk.length){ const sg=stk.pop(),s=sg[0],e=sg[1]; let dmax=0,idx=-1; for(let i=s+1;i<e;i++){ const d=perpDist(pts[i],pts[s],pts[e]); if(d>dmax){dmax=d;idx=i;} } if(dmax>eps&&idx>-1){ keep[idx]=true; stk.push([s,idx]); stk.push([idx,e]); } }
      const out=[]; for(let i=0;i<pts.length;i++) if(keep[i]) out.push(pts[i]); return out; }
    function bboxDiag(pts){ let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9; for(const p of pts){ if(p[0]<mnx)mnx=p[0]; if(p[0]>mxx)mxx=p[0]; if(p[1]<mny)mny=p[1]; if(p[1]>mxy)mxy=p[1]; } return Math.hypot(mxx-mnx,mxy-mny)||0; }
    function epsFor(pts){ const f=smoothing/100; return f*f*0.28*Math.max(0.0004,bboxDiag(pts)); }   // RDP tolerance scaled to the drawing's own size → behaves the same at any zoom
    function segX(a,b,c,d){ const den=(a[0]-b[0])*(c[1]-d[1])-(a[1]-b[1])*(c[0]-d[0]); if(Math.abs(den)<1e-14) return null;
      const tt=((a[0]-c[0])*(c[1]-d[1])-(a[1]-c[1])*(c[0]-d[0]))/den, uu=((a[0]-c[0])*(a[1]-b[1])-(a[1]-c[1])*(a[0]-b[0]))/den;
      if(tt<0||tt>1||uu<0||uu>1) return null; return [a[0]+tt*(b[0]-a[0]), a[1]+tt*(b[1]-a[1])]; }
    /* total spherical area of every closed loop a self-intersecting OPEN path forms (greedy: find an
       intersecting segment pair, bank that loop's geodesic area, collapse the loop to the crossing
       point, repeat). */
    function enclosedArea(points){ let pts=points.slice(), total=0, rings=[], guard=0, found=true;
      while(found && guard++<3000){ found=false;
        for(let i=0;i<pts.length-1 && !found;i++){ for(let j=i+2;j<pts.length-1;j++){
          const X=segX(pts[i],pts[i+1],pts[j],pts[j+1]);
          if(X){ const mid=pts.slice(i+1,j+1), ring=[X].concat(mid);
            let a=0; try{ a=ringArea(ring); }catch(_){}
            if(a>0){ total+=a; rings.push(ring.concat([X])); }
            pts=pts.slice(0,i+1).concat([X]).concat(pts.slice(j+1)); found=true; break; } } }
      }
      return {area:total, rings}; }
    /* (#R8c) Great-circle ("straight line on the Earth") densified between two points — used as the
       AREA-only closing aid when an open trace has no self-intersection. */
    function geodesicLine(a,b,n){ n=n||48; const Rr=Math.PI/180, la1=a[1]*Rr,lo1=a[0]*Rr,la2=b[1]*Rr,lo2=b[0]*Rr;
      const d=2*Math.asin(Math.min(1,Math.sqrt(Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin((lo2-lo1)/2)**2)));
      if(!isFinite(d)||d===0) return [a.slice(),b.slice()];
      const out=[]; for(let i=0;i<=n;i++){ const f=i/n, A=Math.sin((1-f)*d)/Math.sin(d), B=Math.sin(f*d)/Math.sin(d);
        const x=A*Math.cos(la1)*Math.cos(lo1)+B*Math.cos(la2)*Math.cos(lo2), y=A*Math.cos(la1)*Math.sin(lo1)+B*Math.cos(la2)*Math.sin(lo2), z=A*Math.sin(la1)+B*Math.sin(la2);
        out.push([Math.atan2(y,x)/Rr, Math.atan2(z,Math.sqrt(x*x+y*y))/Rr]); }
      return out; }

    /* ---- map layers (line is stored in lng/lat so MapLibre reprojects it for any view) ---- */
    function fc(features){ return {type:'FeatureCollection',features}; }
    function ensureLayers(){ if(layersReady && GE().layers.hasSource('draw-src')) return;
      try{
        if(!GE().layers.hasSource('draw-src')) GE().layers.addSource('draw-src',{type:'geojson',data:fc([])});
        if(!GE().layers.has('draw-loop-fill')) GE().layers.add({id:'draw-loop-fill',type:'fill',source:'draw-src',filter:['==','$type','Polygon'],paint:{'fill-color':'#ffcc00','fill-opacity':0.22}});
        if(!GE().layers.has('draw-line-casing')) GE().layers.add({id:'draw-line-casing',type:'line',source:'draw-src',filter:['all',['==','$type','LineString'],['!=','aux','close']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':5,'line-opacity':0.6}});
        if(!GE().layers.has('draw-line')) GE().layers.add({id:'draw-line',type:'line',source:'draw-src',filter:['all',['==','$type','LineString'],['!=','aux','close']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ff9500','line-width':3}});
        /* (#R8c) AREA-only closing aid: a dashed great-circle from end→start, shown when the trace has no self-crossing. */
        if(!GE().layers.has('draw-close-line')) GE().layers.add({id:'draw-close-line',type:'line',source:'draw-src',filter:['all',['==','$type','LineString'],['==','aux','close']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ff3b30','line-width':2,'line-dasharray':[2,2],'line-opacity':0.85}});
        if(!GE().layers.has('draw-pts')) GE().layers.add({id:'draw-pts',type:'circle',source:'draw-src',filter:['==','$type','Point'],paint:{'circle-radius':5,'circle-color':['get','color'],'circle-stroke-color':'#fff','circle-stroke-width':2}});
        layersReady=true;
      }catch(_){ layersReady=false; }
    }
    function setData(){ const f=[];
      loopRings.forEach(r=>{ if(r.length>=4) f.push({type:'Feature',geometry:{type:'Polygon',coordinates:[r]},properties:{}}); });
      if(closeAux && closeAux.length>=2) f.push({type:'Feature',geometry:{type:'LineString',coordinates:closeAux},properties:{aux:'close'}});
      if(simplified.length>=2) f.push({type:'Feature',geometry:{type:'LineString',coordinates:simplified},properties:{}});
      if(raw.length) f.push({type:'Feature',geometry:{type:'Point',coordinates:raw[0]},properties:{color:'#34c759'}});
      if(raw.length>1) f.push({type:'Feature',geometry:{type:'Point',coordinates:raw[raw.length-1]},properties:{color:'#ff3b30'}});
      try{ GE().layers.setSourceData('draw-src',fc(f)); }catch(_){}
    }

    /* ---- recompute ---- */
    function recomputeLine(){ simplified=rdp(raw, epsFor(raw)); lengthKm=0; for(let i=1;i<simplified.length;i++){ try{ lengthKm+=turf.distance(turf.point(simplified[i-1]),turf.point(simplified[i]),{units:'kilometers'}); }catch(_){} } }
    function recomputeArea(){ const r=enclosedArea(raw); lockedArea=r.area; loopRings=r.rings; }   // RAW-based → invariant under smoothing

    /* ---- panel ---- */
    function jp(){ return HOST.lang==='jp'; }
    function ensurePanel(){ if(panel) return panel; panel=document.createElement('div'); panel.className='tool-panel'; panel.id='draw-panel'; panel.style.display='none'; (document.getElementById('map-container')||document.body).appendChild(panel); return panel; }
    /* ══ (#R190) A HOST FEATURE THAT DRIVES THE DRAW TOOL DOES NOT WANT ITS PANEL ══════════════════
       「フリー描画中にdrawポップアップは表示しないように。」 The seismic simulator borrows this tool to
       capture a rupture outline (#R189 — deliberately the SHARED tool, not a private copy of it), and
       the tool's own panel then covers the seismic panel with length/area/smoothing readouts that
       belong to a measurement the user did not ask for. `start({silent:true})` suppresses the panel
       for the borrowed session only; everything else about the tool is unchanged, and exit() clears
       the flag so the next ordinary Draw behaves exactly as before. */
    let silent=false;
    /* (#R207) the driving feature's "a loop was closed" subscriber — see finish() and start(). One,
       not a list: this tool is single-instance and is driven by at most one feature at a time. */
    let _onFinish=null;
    function renderPanel(){ const p=ensurePanel(); if(silent){ p.style.display='none'; return; } p.style.display='block';
      /* (#R139) touch devices trace by PRESS-DRAG-RELEASE (not tap) — the hint must say so, or a user taps and
         nothing draws. Detect coarse pointers and give the right instruction; 5 languages. */
      const _L5=window.IntMapLang.pick(()=>HOST.lang);
      const _coarse=(()=>{ try{ return !!(window.matchMedia&&matchMedia('(pointer:coarse)').matches); }catch(_){ return false; } })();
      const hint = state==='armed'
                   ? (_coarse ? _L5('Press and drag on the map to trace an area','地図を指でなぞって範囲を描く（押したまま動かす）','Auf der Karte gedrückt ziehen, um eine Fläche zu zeichnen','Проведите пальцем по карте, чтобы обвести область','Mantén y arrastra en el mapa para trazar un área')
                              : _L5('Click the map to start drawing','地図をクリックして描画開始','Zum Zeichnen auf die Karte klicken','Нажмите на карту, чтобы начать рисовать','Haz clic en el mapa para empezar a dibujar'))
                 : state==='drawing'
                   ? (_coarse ? _L5('Lift your finger to finish','指を離すと確定','Finger anheben zum Abschließen','Поднимите палец, чтобы завершить','Levanta el dedo para finalizar')
                              : _L5('Move the cursor to trace → click to finish','カーソルを動かして描画 → クリックで確定','Cursor bewegen zum Zeichnen → Klick zum Abschließen','Двигайте курсор для обводки → клик для завершения','Mueve el cursor para trazar → clic para finalizar'))
                 : _L5('Done — use Redraw to start over','完了。「やり直し」で再描画','Fertig — „Neu zeichnen“ zum Neustart','Готово — «Перерисовать», чтобы начать заново','Listo — usa Redibujar para empezar de nuevo');
      p.innerHTML=`<div class="tp-header"><span class="tp-title">✏️ ${jp()?'描画測定':'Draw / trace'}</span><button class="tp-close" title="${t('close')}">✕</button></div>`+
        `<div class="tp-row"><span>${jp()?'距離':'Length'}</span><b>${distHTML(lengthKm)}</b></div>`+
        `<div class="tp-row"><span>${jp()?'面積（閉領域）':'Area (loops)'}</span><b>${lockedArea>0?areaHTML(lockedArea):'—'}</b></div>`+
        `<div class="tp-row"><span>${jp()?'点数（簡略/元）':'Points (simpl/raw)'}</span><b>${simplified.length}/${raw.length}</b></div>`+
        `<div class="tp-row" style="flex-direction:column;align-items:stretch;gap:5px;"><span>${jp()?'解像度（平滑化）':'Resolution (smoothing)'}</span>`+
          `<input type="range" id="draw-res" min="0" max="100" step="1" value="${smoothing}" style="width:100%;accent-color:var(--primary-color);"></div>`+
        `<div class="tp-hint">${hint}</div>`+
        /* (#R123) POPULATION inside the drawn loop(s) — same WorldPop 100m grid as the measure/radius tools, now
           available for the freehand Draw tool too ("Drawでも使えるように"). Shown once the trace encloses an area. */
        ((lockedArea>0 && loopRings.length) ? `<div class="tp-row" id="draw-pop-row" style="display:none;"><span>${t('popInArea')}</span><b id="draw-pop-val">—</b></div><button class="ai-action-btn" id="draw-pop-btn" style="margin-top:6px;">${t('popInArea')}</button>` : '')+
        /* (#R154) Elevation profile for the freehand line too — same DEM pipeline as the measure tool ("Drawでも
           Elevation profileを使えるように"). Profiles the traced path (simplified, raw fallback). */
        ((simplified.length>=2) ? `<button class="ai-action-btn" id="draw-profile" style="margin-top:6px;">📈 ${t('elevProfile')}</button>` : '')+
        `<div style="display:flex;gap:6px;margin-top:8px;">`+
          `<button class="tp-clear" id="draw-finish" style="flex:1;">${jp()?'地図に残す':'Keep on map'}</button>`+
          `<button class="tp-clear" id="draw-redo" style="flex:1;">${jp()?'やり直し':'Redraw'}</button>`+
        `</div>`;
      p.querySelector('.tp-close').onclick=()=>api.exit();
      try{ makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
      const res=p.querySelector('#draw-res'); if(res) res.oninput=()=>{ smoothing=+res.value; recomputeLine(); /* AREA stays locked to raw */ setData(); updateNumbers(); };
      const fin=p.querySelector('#draw-finish'); if(fin) fin.onclick=keepOnMap;
      const redo=p.querySelector('#draw-redo'); if(redo) redo.onclick=()=>{ raw=[]; simplified=[]; loopRings=[]; lockedArea=0; lengthKm=0; lastPx=null; closeAux=null; state='armed'; setData(); renderPanel(); };
      const popBtn=p.querySelector('#draw-pop-btn'); if(popBtn) popBtn.onclick=()=>_estimateDrawPop(p,popBtn);
      const profBtn=p.querySelector('#draw-profile'); if(profBtn) profBtn.onclick=()=>{ const c=(simplified&&simplified.length>=2)?simplified:((raw&&raw.length>=2)?raw:null); if(c&&window._profileFromCoords) window._profileFromCoords(c); };   /* (#R154) elevation profile of the drawn line */
    }
    function updateNumbers(){ if(!panel) return; const rows=panel.querySelectorAll('.tp-row b'); if(rows[0]) rows[0].innerHTML=distHTML(lengthKm); if(rows[1]) rows[1].innerHTML=lockedArea>0?areaHTML(lockedArea):'—'; if(rows[2]) rows[2].textContent=simplified.length+'/'+raw.length; }

    /* ---- sampling / lifecycle ---- */
    function sample(px,ll){ if(state!=='drawing') return;
      if(lastPx && Math.hypot(px.x-lastPx.x,px.y-lastPx.y)<MIN_PX) return;
      lastPx={x:px.x,y:px.y}; raw.push([ll.lng, Math.max(-89.9,Math.min(89.9,ll.lat))]);
      recomputeLine(); if((++sampleN%3)===0) recomputeArea(); setData(); updateNumbers();
    }
    function startStroke(ll){ raw=[[ll.lng, Math.max(-89.9,Math.min(89.9,ll.lat))]]; simplified=raw.slice(); loopRings=[]; lockedArea=0; lengthKm=0; lastPx=null; sampleN=0; closeAux=null; state='drawing'; try{ GE().input.set('dragPan',false); }catch(_){} setData(); renderPanel(); }
    function finish(){ if(state!=='drawing') return; recomputeLine(); recomputeArea();
      /* (#R8c) No self-crossing ⇒ no enclosed loop. Close END→START with a great-circle line and report
         the area of THAT polygon. The closing line is AREA-only: it is never added to the length and is
         untouched by the smoothing slider (both use the open RAW path). */
      closeAux=null;
      if(lockedArea===0 && raw.length>=3){ try{ const ring=raw.concat([raw[0]]); const a=ringArea(ring); if(a>0){ lockedArea=a; loopRings=[ring]; closeAux=geodesicLine(raw[raw.length-1],raw[0],64); } }catch(_){} }
      setData(); state='done'; try{ GE().input.set('dragPan',true); }catch(_){} renderPanel();
      /* ══ (#R207) THE STROKE ENDING IS AN EVENT, AND IT HAD NO SUBSCRIBERS ═══════════════════════
         「描いた範囲を取り込むボタンを押さなくてもいいようにしろ。」 A feature that DRIVES this tool
         (`start(null,{silent:true})`) could only find out that a loop had been closed by asking —
         which is why the seismic panel needed a second button press to ask. The tool knows the moment
         it happens; it just never said so. Fired after `state='done'` so a subscriber calling
         `currentGeometry()` from inside gets the finished rings rather than re-entering `finish()`. */
      if(_onFinish){ try{ _onFinish(api.currentGeometry()); }catch(_){} } }

    /* (#R123) POPULATION inside the drawn loop(s) — reuses IntMapPopArea (real WorldPop 100m grid, never a guess).
       Multiple enclosed loops are summed as a MultiPolygon. Same live progress bar as the measure/radius panels so
       the button never just sits on "Calculating…". */
    async function _estimateDrawPop(p, btn){
      const rings=(loopRings||[]).filter(r=>r&&r.length>=4); if(!rings.length || !window.IntMapPopArea) return;
      const geom = rings.length===1 ? {type:'Polygon',coordinates:[rings[0]]} : {type:'MultiPolygon',coordinates:rings.map(r=>[r])};
      let box=p.querySelector('.tp-prog'); if(!box){ box=document.createElement('div'); box.className='tp-prog'; box.style.cssText='margin:7px 0 2px;';
        box.innerHTML='<div style="display:flex;justify-content:space-between;gap:8px;font-size:10.5px;color:var(--text-muted);margin-bottom:3px;"><span class="tp-prog-lbl" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span><b class="tp-prog-pct" style="flex:0 0 auto;">0%</b></div><div style="height:7px;border-radius:4px;background:rgba(128,128,128,0.22);overflow:hidden;"><div class="tp-prog-fill" style="height:100%;width:0%;background:var(--prog-grad);transition:width .2s;"></div></div>';
        if(btn.parentNode) btn.parentNode.insertBefore(box, btn.nextSibling); else p.appendChild(box); }
      const lbl=window.IntMapLang.t(HOST.lang,'Summing the WorldPop population grid…','WorldPop人口グリッドを集計中…','WorldPop-Bevölkerungsraster wird summiert…','Суммирование сетки населения WorldPop…','Sumando la cuadrícula de población WorldPop…');
      box.querySelector('.tp-prog-lbl').textContent=lbl; box.classList.remove('indet'); box.style.display='block';
      /* (#R139) HONEST progress (shared window._imProgCtl): indeterminate animated sweep while WorldPop reports no
         real fraction, switching to a real linear fraction the moment the area is large enough to be TILED. No more
         fake decelerating ease-out. */
      const P=window._imProgCtl(box); P.busy();
      const onProg=(f)=>P.set(f);
      btn.disabled=true; const orig=btn.textContent; btn.textContent=t('popCalcing');
      try{ const r=await window.IntMapPopArea.estimate(geom, onProg); P.done(); setTimeout(()=>{ box.style.display='none'; },450);
        const row=p.querySelector('#draw-pop-row'), val=p.querySelector('#draw-pop-val'); if(row&&val){ row.style.display=''; val.innerHTML=Number(r.pop).toLocaleString()+' <span style="font-size:10px;color:var(--text-muted);">('+r.src+' '+r.year+(rings.length>1?' · Σ':'')+')</span>'; }
        btn.style.display='none';
      }catch(e){ box.style.display='none'; btn.disabled=false; btn.textContent=t('popFail'); setTimeout(()=>{ try{ btn.textContent=orig; }catch(_){} },2600); }
    }
    /* (#R34) "Keep on map" — the button used to be wired to finish(), which early-returns once the trace is
       done, so it did NOTHING ("keep on map button is not working"). Now it actually PERSISTS the drawing as
       permanent annotations (same IntMapAnnotations path the measure/area/radius "Keep on map" uses), so the
       traced line + any enclosed area stay on the map after the tool closes. */
    function keepOnMap(){
      if(state==='drawing') finish();
      try{
        (loopRings||[]).forEach(r=>{ if(r&&r.length>=4){ try{ window.IntMapAnnotations.add({type:'Polygon',coordinates:[r]},{color:'#ffcc00',op:0.22,name:(jp()?'描画範囲':'Drawn area'),value:(lockedArea>0?areaHTML(lockedArea):'')}); }catch(_){} } });
        const ln=(simplified&&simplified.length>=2)?simplified:((raw&&raw.length>=2)?raw:null);
        if(ln){ try{ window.IntMapAnnotations.add({type:'LineString',coordinates:ln},{color:'#ff9500',name:(jp()?'描画':'Drawing'),value:(lengthKm>0?distHTML(lengthKm):'')}); }catch(_){} }
        try{ if(typeof imToast==='function') imToast(jp()?'地図に残しました':'Kept on the map'); }catch(_){}   /* (#R149) imToast is closure-scoped, not on window */
      }catch(_){}
      api.exit();
    }

    /* (#R139) MapLibre synthesises a `click` from every touch tap; if the finish path also ran on it, a mobile
       TAP would START and immediately END the stroke (1 point, no area) — the "描画できない" report. Ignore clicks
       that arrive right after touch activity; on touch, the stroke is owned entirely by the touch handlers below. */
    let _touchTs=0;
    function onClick(e){ if(Date.now()-_touchTs<600) return; if(state==='armed') startStroke(e.lngLat); else if(state==='drawing') finish(); }
    function onMove(e){ if(state==='drawing') sample(e.point, e.lngLat); }
    let wired=false;
    function wire(){ if(wired) return; wired=true; GE().events.on('click',onClick); GE().events.on('mousemove',onMove);
      const cv=GE().render.canvas(); cv.addEventListener('touchstart',onTouchStart,{passive:false}); cv.addEventListener('touchmove',onTouchMove,{passive:false}); cv.addEventListener('touchend',onTouchEnd,{passive:false}); }
    function unwire(){ if(!wired) return; wired=false; GE().events.off('click',onClick); GE().events.off('mousemove',onMove);
      const cv=GE().render.canvas(); cv.removeEventListener('touchstart',onTouchStart); cv.removeEventListener('touchmove',onTouchMove); cv.removeEventListener('touchend',onTouchEnd); }
    function touchLL(tch){ const r=GE().render.canvas().getBoundingClientRect(); const pt=[tch.clientX-r.left,tch.clientY-r.top]; return {point:{x:pt[0],y:pt[1]}, lngLat:GE().coords.unproject(pt)}; }
    function onTouchStart(e){ if(state==='off'||e.touches.length!==1) return; _touchTs=Date.now(); e.preventDefault(); hadTouchMove=false; if(state==='armed') startStroke(touchLL(e.touches[0]).lngLat); }
    function onTouchMove(e){ if(state!=='drawing'||e.touches.length!==1) return; _touchTs=Date.now(); e.preventDefault(); hadTouchMove=true; const o=touchLL(e.touches[0]); sample(o.point,o.lngLat); }
    /* (#R139) press-drag-release is the mobile gesture: a real trace (finger moved) finishes on lift; a bare TAP
       (no travel) must NOT leave a dead 1-point 'drawing' state — re-arm so the next press-drag works. */
    function onTouchEnd(e){ _touchTs=Date.now(); if(state!=='drawing') return;
      if(hadTouchMove && raw.length>=2){ e.preventDefault(); finish(); }
      else { raw=[]; simplified=[]; loopRings=[]; lockedArea=0; lengthKm=0; lastPx=null; closeAux=null; sampleN=0; state='armed'; try{ GE().input.set('dragPan',true); }catch(_){} setData(); renderPanel(); } }

    function setBtn(on){ const b=document.getElementById('btn-tool-draw'); if(b) b.classList.toggle('tool-on',on); document.querySelectorAll('[data-proxy="btn-tool-draw"]').forEach(x=>x.classList.toggle('active',on)); try{ window._syncToolBtns&&window._syncToolBtns(); }catch(_){} }

    const api={
      active(){ return state!=='off'; },
      /* (#R190) `opt.silent` hides this tool's own panel for a session another feature is driving
         (see the note by renderPanel). `pt` keeps its old meaning; opt is a separate argument so no
         existing call site changes. */
      start(pt,opt){ try{ if(typeof exitTool==='function') exitTool(); }catch(_){}
        silent=!!(opt&&opt.silent)||!!(pt&&pt.silent);
        _onFinish=(opt&&typeof opt.onFinish==='function')?opt.onFinish:null;   /* (#R207) */
        ensureLayers(); wire(); GE().render.canvas().style.cursor='crosshair'; setBtn(true);
        if(pt&&pt.length===2){ startStroke({lng:pt[0],lat:pt[1]}); } else { state='armed'; raw=[]; simplified=[]; loopRings=[]; lockedArea=0; lengthKm=0; renderPanel(); }
      },
      toggle(){ if(this.active()) this.exit(); else this.start(); },
      exit(){ state='off'; silent=false; _onFinish=null; raw=[]; simplified=[]; loopRings=[]; lockedArea=0; lengthKm=0; lastPx=null; closeAux=null; setData(); unwire(); try{ GE().input.set('dragPan',true); }catch(_){} try{ GE().render.canvas().style.cursor=''; }catch(_){} setBtn(false); if(panel) panel.style.display='none'; },
      onResolution(v){ smoothing=Math.max(0,Math.min(100,+v||0)); recomputeLine(); setData(); updateNumbers(); },
      /* (#R141) Expose the drawn area as a GeoJSON Polygon/MultiPolygon for the area-monitor feature.
         Finishes the stroke first if it is still being drawn, so "monitor this drawn area" works mid-gesture. */
      currentGeometry(){ try{ if(state==='drawing') finish(); const rings=(loopRings||[]).filter(r=>r&&r.length>=4); if(!rings.length) return null; return rings.length===1?{type:'Polygon',coordinates:[rings[0]]}:{type:'MultiPolygon',coordinates:rings.map(r=>[r])}; }catch(_){ return null; } },
      /* Debug/verification hook (same spirit as window.__sat / window.__ai): lets us prove the
         area-invariant-under-smoothing contract and the geodesic length without map interaction. */
      _debug:{ enclosedArea, rdp,
        simulate(rawPts, sm){ raw=rawPts.slice(); smoothing=sm||0; recomputeLine(); recomputeArea(); return { area:lockedArea, length:lengthKm, rawN:raw.length, simplN:simplified.length }; } }
    };
    { const b=document.getElementById('btn-tool-draw'); if(b) b.onclick=()=>api.toggle(); }
    return api;
  })();
};

window.IntMapModules.isolate=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const imToast=HOST.imToast, loadCountryData=HOST.loadCountryData;
  window.IntMapIsolate=(function(){
    if(!GE().hasRenderer()) return { enter(){}, exit(){}, active:()=>false };
    const jp=()=>HOST.lang==='jp'; let active=false, btn=null;
    function bg(){ return (document.documentElement.getAttribute('data-theme')==='dark') ? '#05060a' : '#f2f2f4'; }   /* (#R115) skin themes retired (R33) */
    function ensure(){ if(GE().layers.hasSource('iso-src')) return true; if(!_imCanDraw()) return false;
      try{ GE().layers.addSource('iso-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        GE().layers.add({id:'iso-mask',type:'fill',source:'iso-src',layout:{visibility:'none'},paint:{'fill-color':bg(),'fill-opacity':1}});
        return true;
      }catch(_){ return false; } }
    function findFeature(id){ const cg=window.countryGeo; if(!cg||!cg.features) return null;
      return cg.features.find(f=>String(f.id)===String(id)) || cg.features.find(f=>{ const p=f.properties||{}; return [p.__code,p.ISO_A3,p.iso_a3,p.ADM0_A3,p.id].map(String).includes(String(id)); }); }
    /* (#R29) Resolve a country feature by NAME — used when a place-NAME label is tapped (the label gives a
       name, not a code). Tries exact match across the GeoJSON's name fields, then a loose contains match. */
    function findByName(name){ const cg=window.countryGeo; if(!cg||!cg.features||!name) return null;
      const n=String(name).trim().toLowerCase(); const NF=(p)=>[p.NAME_EN,p.ADMIN,p.NAME,p.name,p.name_en,p['name:en'],p.NAME_LONG,p.BRK_NAME,p.FORMAL_EN,p.SOVEREIGNT,p.nameEn,p.nameJp];
      return cg.features.find(f=>NF(f.properties||{}).some(v=>v&&String(v).trim().toLowerCase()===n))
          || (n.length>3 && cg.features.find(f=>NF(f.properties||{}).some(v=>v&&String(v).trim().toLowerCase().includes(n)))) || null; }
    /* (#R29.1) Resolve a country by the CLICK POINT (point-in-polygon). This is the RELIABLE path — matching
       OFM label text to the border GeoJSON's name fields failed ("country border not found"). The tapped
       label sits inside (or beside) its country, so ray-casting the lng/lat against the polygons finds it. */
    function pointInRing(x,y,ring){ let inside=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){ const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1]; if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi)) inside=!inside; } return inside; }
    function pointInGeom(x,y,g){ if(!g) return false; const polys=g.type==='Polygon'?[g.coordinates]:(g.type==='MultiPolygon'?g.coordinates:[]);
      for(const poly of polys){ if(!poly||!poly.length) continue; if(pointInRing(x,y,poly[0])){ let hole=false; for(let h=1;h<poly.length;h++){ if(pointInRing(x,y,poly[h])){ hole=true; break; } } if(!hole) return true; } } return false; }
    function findByLngLat(lng,lat){ const cg=window.countryGeo; if(!cg||!cg.features) return null; for(const f of cg.features){ if(pointInGeom(lng,lat,f.geometry)) return f; } return null; }
    function maskFC(feat){ const world=[[-180,-89],[180,-89],[180,89],[-180,89],[-180,-89]]; const holes=[]; const g=feat.geometry;
      if(g.type==='Polygon') holes.push(g.coordinates[0]); else if(g.type==='MultiPolygon') g.coordinates.forEach(poly=>holes.push(poly[0]));
      return {type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[world,...holes]},properties:{}}]}; }
    function bbox(feat){ let mnx=180,mny=90,mxx=-180,mxy=-90; const eat=ring=>ring.forEach(p=>{ if(p[0]<mnx)mnx=p[0]; if(p[0]>mxx)mxx=p[0]; if(p[1]<mny)mny=p[1]; if(p[1]>mxy)mxy=p[1]; });
      const g=feat.geometry; if(g.type==='Polygon') g.coordinates.forEach(eat); else g.coordinates.forEach(poly=>poly.forEach(eat)); return [[mnx,mny],[mxx,mxy]]; }
    function exitBtn(){ if(btn) return btn; btn=document.createElement('button'); btn.id='iso-exit-btn';
      /* (#R11) Exit pill lives at the BOTTOM-center, clear of the timebar / mobile sheet / other UI. */
      /* (#R108) sits a bit LOWER (96→64) and dark-mode gets a WHITE bg / black text (see the #iso-exit-btn CSS rule). */
      btn.style.cssText='display:none;position:absolute;bottom:64px;left:50%;transform:translateX(-50%);z-index:1700;background:var(--popup-bg);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));border-radius:999px;padding:9px 18px;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:var(--shadow);backdrop-filter:blur(12px);';
      btn.onclick=exit; (document.getElementById('map-container')||document.body).appendChild(btn); return btn; }
    /* (#R12) The mask must sit ABOVE every data overlay or surrounding layers bleed through. Layers
       toggled on later (or re-added after a basemap swap) can land above it, so re-assert it to the
       very top whenever the map settles — guarded so it only moves when not already last (no repaint loop). */
    function toTop(){ try{ if(!GE().layers.has('iso-mask')) return; const ls=GE().scene.getStyle().layers; if(ls&&ls.length&&ls[ls.length-1].id!=='iso-mask') GE().layers.move('iso-mask'); }catch(_){} }
    function applyFeature(feat){ let tries=0; const apply=()=>{ if(!ensure()){
          /* (#R39) ROOT CAUSE of "Isolateを押しても反応しない（再読み込みで治る）": ensure() returns false while
             the style isn't fully loaded and we waited ONLY on `once('idle')`. On a slow first load the map can
             already be sitting idle (nothing re-triggers a render), so that idle never fires and the mask never
             applies — until a reload warms the cache. POLL instead (reliable regardless of render state), with
             the idle listener kept as a last-resort. */
          if(tries++<60){ setTimeout(apply,120); } else { try{ GE().events.once('idle',apply); }catch(_){} } return; }
        if(!feat){ try{ imToast(jp()?'国境データが見つかりません':'Country border not found'); }catch(_){} return; }
        try{ GE().layers.setSourceData('iso-src',maskFC(feat)); GE().layers.setPaint('iso-mask','fill-color',bg()); GE().layers.setLayout('iso-mask','visibility','visible'); toTop(); }catch(_){}
        /* (#R107) auto-clear any place highlight / blue boundary outline on isolate — a historical-country click
           draws the era outline (IntMapOutline) + place-hl, which otherwise linger on top of the isolated view
           ("昔の国をisolateしたらハイライトは自動消去するように"). */
        try{ GE().layers.setSourceData('place-hl-src',{type:'FeatureCollection',features:[]}); }catch(_){}
        try{ window.IntMapOutline && window.IntMapOutline.clear && window.IntMapOutline.clear(); }catch(_){}
        try{ const _pp=document.querySelector('.plc-popup'); if(_pp&&_pp.parentNode) _pp.remove(); }catch(_){}
        /* (#R29) Isolating a country auto-deselects "Countries (info)" — its hover-fill / info card would
           fight the isolate mask ("isolateを押したらCountries (info)は選択解除"). Dispatch change so the
           checkbox, the map layer and the Active-layers list all update together. */
        try{ const cc=document.getElementById('cb-countries'); if(cc&&cc.checked){ cc.checked=false; cc.dispatchEvent(new Event('change',{bubbles:true})); } }catch(_){}
        active=true; const b=exitBtn(); b.textContent='✕ '+(jp()?'全体表示に戻る':'Exit country view'); b.style.display='block';
        try{ const bb=bbox(feat); if(bb[0][0]>-179&&bb[1][0]<179){ GE().camera.fitBounds(bb,{padding:60,duration:800});
          /* (#R11) Restrict panning to roughly the country's extent so you can only roam that country. */
          const padX=(bb[1][0]-bb[0][0])*0.18+0.6, padY=(bb[1][1]-bb[0][1])*0.18+0.6;
          GE().camera.setMaxBounds([[bb[0][0]-padX,Math.max(-85,bb[0][1]-padY)],[bb[1][0]+padX,Math.min(85,bb[1][1]+padY)]]); } }catch(_){}
        try{ document.getElementById('country-popup').style.display='none'; }catch(_){}
      }; apply(); }
    /* enter by COUNTRY CODE (the country detail popup) or by NAME (a tapped place label). Both load the
       border GeoJSON first if it isn't in memory yet so isolate works even before Countries(info) is used. */
    /* (#R39) ALWAYS route through the data-ready promise (idempotent — resolves instantly if already loaded).
       The old `if(!window.countryGeo)` short-circuit ran go() even when countryGeo was set-but-still-populating,
       so the very first isolate after a cold load could hit an empty feature list and toast "border not found". */
    function withGeo(go){ try{ if(window.countryGeo && window.countryGeo.features && window.countryGeo.features.length){ go(); return; } if(typeof loadCountryData==='function'){ loadCountryData().then(go); return; } }catch(_){} go(); }
    function enter(id){ withGeo(()=>applyFeature(findFeature(id))); }
    function enterByName(name){ withGeo(()=>applyFeature(findByName(name))); }
    /* (#R29.1) enter by the tapped point first (reliable), fall back to the label name. */
    function enterAt(lng,lat,name){ withGeo(()=>{ let f=findByLngLat(lng,lat); if(!f && name) f=findByName(name); applyFeature(f); }); }
    /* (#R106) ROOT CAUSE of "昔の国をisolateできない": historical / former-state polygons (Tibet, the German Empire,
       the Ottoman Empire…) do not exist in the MODERN countryGeo, so enterAt / enterByName either found nothing
       ("border not found") or the point-in-polygon landed on the modern occupant (Tibet → China) and isolated the
       WRONG country. When a click already carries the correct era polygon (the place popup passes opts.geojson),
       isolate THAT geometry directly — no countryGeo lookup at all. Accepts a bare geometry or a Feature. */
    function enterGeom(geom,name){ try{ if(!geom) return; const g=(geom.type==='Feature')?geom.geometry:geom; if(!g||!/Polygon/.test(g.type||'')) return;
      applyFeature({type:'Feature',geometry:g,properties:{name:name||''}}); }catch(_){} }
    function exit(){ active=false; try{ GE().layers.setLayout('iso-mask','visibility','none'); }catch(_){} try{ GE().camera.setMaxBounds(null); }catch(_){} if(btn) btn.style.display='none'; }
    GE().events.on('styledata',()=>{ if(active){ setTimeout(()=>{ if(ensure()){ try{ GE().layers.setPaint('iso-mask','fill-color',bg()); GE().layers.setLayout('iso-mask','visibility','visible'); toTop(); }catch(_){} } },80); } });
    /* Keep the mask on top after any layer toggle / data load settles (#R12). */
    GE().events.on('idle',()=>{ if(active) toTop(); });
    return { enter, enterByName, enterAt, enterGeom, exit, active:()=>active };
  })();
};

window.IntMapModules.seaRoute=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const t=HOST.t, fmtLL=HOST.fmtLL, makeDraggable=HOST.makeDraggable;
  window.IntMapRoute=(function(){
    if(!GE().hasRenderer()) return { open(){}, clear(){}, setStart(){}, active:()=>false };
    const jp=()=>HOST.lang==='jp';
    const W=3600, H=1800;                /* (#R14) 0.1° mask ≈ 11 km cells — sharper coastlines so a route can start at shallow/coastal points and stops cutting across thin land (was 0.2°/22 km) */
    let grid=null, panel=null, start=null, end=null, noGo=[], pureDist=false, addNoGoMode=false, busy=false;
    const toRad=Math.PI/180, Rk=6371;
    function hav(a,b){ const dLat=(b[1]-a[1])*toRad, dLon=(b[0]-a[0])*toRad, la1=a[1]*toRad, la2=b[1]*toRad;
      const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2; return 2*Rk*Math.asin(Math.min(1,Math.sqrt(x))); }
    /* --- land mask (lazy, built once countryGeo is available) --- */
    function buildMask(){
      if(grid) return true; const cg=window.countryGeo; if(!cg||!cg.features) return false;
      const cv=document.createElement('canvas'); cv.width=W; cv.height=H; const c=cv.getContext('2d',{willReadFrequently:true});
      c.fillStyle='#fff'; c.fillRect(0,0,W,H); c.fillStyle='#000'; c.strokeStyle='#000'; c.lineWidth=1; c.lineJoin='round';
      const X=lng=>((lng+180)/360)*W, Y=lat=>((90-lat)/180)*H;
      /* (#R14) FILL ONLY — the old 1px stroke thickened every coastline by ~its width, marking shallow/
         coastal water as land so a route couldn't start there; A* now seals thin land via no-corner-cutting. */
      function ring(r){ if(!r||!r.length) return; c.beginPath(); for(let i=0;i<r.length;i++){ const p=r[i]; const x=X(p[0]),y=Y(p[1]); if(i===0)c.moveTo(x,y); else c.lineTo(x,y); } c.closePath(); c.fill(); }
      cg.features.forEach(f=>{ const g=f.geometry; if(!g) return; if(g.type==='Polygon') g.coordinates.forEach(ring); else if(g.type==='MultiPolygon') g.coordinates.forEach(poly=>poly.forEach(ring)); });
      const d=c.getImageData(0,0,W,H).data; const land=new Uint8Array(W*H);
      for(let p=0;p<land.length;p++){ land[p]=(d[p*4]<128)?1:0; }   /* black pixel = land */
      /* mark near-coast sea cells (adjacent to land) → cost penalty keeps routes off the 0 m line */
      const cell=new Uint8Array(W*H);  /* 2=land, 1=near-coast sea, 0=open sea */
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const p=y*W+x; if(land[p]){ cell[p]=2; continue; }
        let near=0; for(let dy=-1;dy<=1&&!near;dy++) for(let dx=-1;dx<=1;dx++){ const nx=(x+dx+W)%W, ny=y+dy; if(ny<0||ny>=H) continue; if(land[ny*W+nx]){ near=1; break; } }
        cell[p]=near?1:0; }
      /* Carve REAL navigable chokepoints & canals OPEN (they're narrower than a mask cell, so they'd
         otherwise wall off enclosed seas). This is what makes routes follow actual shipping lanes —
         Med↔Atlantic via Gibraltar, Med↔Red Sea via Suez, Atlantic↔Pacific via Panama, etc. Canals are
         legitimate per the brief ("運河など除き"); coast-hugging is handled by the near-coast cost penalty. */
      const STRAITS=[
        {p:[[-5.6,35.95]],r:34},                                            /* Gibraltar */
        {p:[[32.31,31.25],[32.34,30.7],[32.50,30.2],[32.56,29.93],[32.7,29.6],[33.0,29.1],[33.4,28.5],[33.8,27.9],[34.2,27.3],[34.6,26.8]],r:17}, /* Suez Canal + Gulf of Suez → Red Sea */
        {p:[[-79.92,9.37],[-79.82,9.12],[-79.70,8.95],[-79.55,8.9]],r:14},   /* Panama Canal */
        {p:[[28.98,41.05],[28.0,40.7],[26.4,40.2]],r:18},                    /* Bosphorus · Marmara · Dardanelles */
        {p:[[12.7,55.7],[11.0,55.3],[10.7,56.1],[11.0,57.2]],r:24},          /* Danish straits (Øresund/Great Belt/Kattegat) */
        {p:[[9.15,54.37],[9.7,54.13],[10.15,54.36]],r:12},                   /* Kiel Canal */
        {p:[[43.4,12.6]],r:34},                                              /* Bab-el-Mandeb */
        {p:[[56.3,26.6]],r:36},                                              /* Strait of Hormuz */
        {p:[[100.7,1.4]],r:34},                                              /* Malacca */
        {p:[[129.4,34.4]],r:28},                                            /* Korea Strait (Tsushima) */
        {p:[[140.6,41.5]],r:20},                                            /* Tsugaru Strait */
        {p:[[142.0,45.8]],r:22},                                            /* La Pérouse Strait */
        {p:[[15.6,38.22]],r:11},                                            /* Strait of Messina */
        {p:[[174.4,-41.3]],r:18}                                            /* Cook Strait (NZ) */
      ];
      const carve=(lng,lat,rKm)=>{ const dLat=rKm/111, dLng=rKm/(111*Math.max(0.1,Math.cos(lat*toRad)));
        const x0=Math.floor(((lng-dLng+180)/360)*W), x1=Math.ceil(((lng+dLng+180)/360)*W);
        const y0=Math.max(0,Math.floor(((90-(lat+dLat))/180)*H)), y1=Math.min(H-1,Math.ceil(((90-(lat-dLat))/180)*H));
        for(let y=y0;y<=y1;y++) for(let xx=x0;xx<=x1;xx++){ const x=((xx%W)+W)%W; const ll=llOf(x,y); if(hav([lng,lat],ll)<=rKm) cell[y*W+x]=0; } };
      /* Densify each corridor so consecutive carve disks OVERLAP into a continuous navigable channel
         (points were too far apart, leaving gaps that broke connectivity through e.g. the Gulf of Suez). */
      STRAITS.forEach(s=>{ const pts=s.p, dense=[]; for(let i=0;i<pts.length;i++){ dense.push(pts[i]); if(i<pts.length-1){ const a=pts[i],b=pts[i+1], n=Math.max(1,Math.ceil(hav(a,b)/(s.r*0.7))); for(let k=1;k<n;k++){ const tt=k/n; dense.push([a[0]+(b[0]-a[0])*tt, a[1]+(b[1]-a[1])*tt]); } } } dense.forEach(pt=>carve(pt[0],pt[1],s.r)); });
      grid={cell}; return true;
    }
    const cellOf=(lng,lat)=>{ let x=Math.floor(((lng+180)/360)*W), y=Math.floor(((90-lat)/180)*H); x=((x%W)+W)%W; y=Math.max(0,Math.min(H-1,y)); return {x,y}; };
    const llOf=(x,y)=>[ ((x+0.5)/W)*360-180, 90-((y+0.5)/H)*180 ];
    const inNoGo=(lng,lat)=>{ for(const z of noGo){ if(hav([lng,lat],[z.lng,z.lat])<=z.km) return true; } return false; };
    function isSea(x,y){ if(y<0||y>=H) return false; x=((x%W)+W)%W; if(grid.cell[y*W+x]===2) return false; const ll=llOf(x,y); return !inNoGo(ll[0],ll[1]); }
    /* nearest sea cell to a clicked point (snaps a coastal click out to water) */
    function snapSea(lng,lat){ const s=cellOf(lng,lat); if(isSea(s.x,s.y)) return s; for(let r=1;r<140;r++){ for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++){ if(Math.abs(dx)!==r&&Math.abs(dy)!==r) continue; const nx=((s.x+dx)%W+W)%W, ny=s.y+dy; if(isSea(nx,ny)) return {x:nx,y:ny}; } } return null; }
    /* binary-heap A* */
    function astar(s,e){
      const open=[], gScore=new Map(), came=new Map(), closed=new Uint8Array(W*H);
      const key=(x,y)=>y*W+x; const goalLL=llOf(e.x,e.y);
      const push=(n)=>{ open.push(n); let i=open.length-1; while(i>0){ const p=(i-1)>>1; if(open[p].f<=open[i].f) break; [open[p],open[i]]=[open[i],open[p]]; i=p; } };
      const pop=()=>{ const top=open[0], last=open.pop(); if(open.length){ open[0]=last; let i=0; for(;;){ let l=2*i+1,r=l+1,m=i; if(l<open.length&&open[l].f<open[m].f)m=l; if(r<open.length&&open[r].f<open[m].f)m=r; if(m===i)break; [open[m],open[i]]=[open[i],open[m]]; i=m; } } return top; };
      /* (#R14) mild heuristic weight → far fewer expansions so the finer 0.1° grid stays fast (routes can
         be a hair sub-optimal, which is realistic for shipping); MAX raised so a long ocean crossing on the
         denser grid isn't falsely reported as "no route". */
      const HW=1.25;
      const sK=key(s.x,s.y); gScore.set(sK,0); push({x:s.x,y:s.y,f:HW*hav(llOf(s.x,s.y),goalLL)});
      let it=0, MAX=2000000;
      while(open.length){ if(++it>MAX) return null; const cur=pop(); const cK=key(cur.x,cur.y); if(closed[cK]) continue; closed[cK]=1;
        if(cur.x===e.x&&cur.y===e.y){ const path=[]; let k=cK; while(k!==undefined){ const y=Math.floor(k/W),x=k-y*W; path.push(llOf(x,y)); k=came.get(k); } return path.reverse(); }
        const curLL=llOf(cur.x,cur.y), gc=gScore.get(cK);
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const nx=((cur.x+dx)%W+W)%W, ny=cur.y+dy; if(ny<0||ny>=H) continue; if(!isSea(nx,ny)) continue;
          /* (#R14) no diagonal corner-cutting: a diagonal step is only allowed if BOTH orthogonally-adjacent
             cells are also sea, so a route can't slip through a 1-cell land corner (replaces the old stroke). */
          if(dx&&dy && (!isSea(((cur.x+dx)%W+W)%W,cur.y) || !isSea(cur.x,cur.y+dy))) continue;
          const nK=key(nx,ny); if(closed[nK]) continue;
          const nLL=llOf(nx,ny); let step=hav(curLL,nLL); if(grid.cell[ny*W+nx]===1) step*=1.6;   /* near-coast penalty → prefer open water */
          const ng=gc+step; if(ng<(gScore.has(nK)?gScore.get(nK):Infinity)){ gScore.set(nK,ng); came.set(nK,cK); push({x:nx,y:ny,f:ng+HW*hav(nLL,goalLL)}); } }
      }
      return null;
    }
    /* clear-sea sightline between two lng/lat (for string-pulling) */
    /* Sample the sightline finely (every ~9 km) AND reject chords that skim near-coast cells, so
       string-pulling can't straighten a leg across/along a coastline — keeps the route faithful to the
       real geography instead of collapsing it into long straight chords ("too linear"). */
    function seaLineClear(a,b){ const d=hav(a,b), n=Math.max(2,Math.ceil(d/6)); let nearCoast=0; for(let i=1;i<n;i++){ const t=i/n, lng=a[0]+(b[0]-a[0])*t, lat=a[1]+(b[1]-a[1])*t; const c=cellOf(lng,lat); const cv=grid.cell[c.y*W+c.x]; if(cv===2) return false; if(inNoGo(lng,lat)) return false; if(cv===1) nearCoast++; } return nearCoast<=Math.max(2,Math.floor(n*0.5)); }
    function stringPull(path){ if(path.length<3) return path; const out=[path[0]]; let i=0; while(i<path.length-1){ let j=path.length-1; for(;j>i+1;j--){ if(Math.abs(path[j][0]-path[i][0])>170) continue; if(seaLineClear(path[i],path[j])) break; } out.push(path[j]); i=j; } return out; }
    /* --- layers --- */
    function ensureLayers(){ if(GE().layers.hasSource('route-src')) return true; if(!_imCanDraw()) return false;
      try{ GE().layers.addSource('route-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
        GE().layers.add({id:'route-nogo',type:'fill',source:'route-src',filter:['==',['get','kind'],'nogo'],paint:{'fill-color':'#ff3b30','fill-opacity':0.16}});
        GE().layers.add({id:'route-nogo-line',type:'line',source:'route-src',filter:['==',['get','kind'],'nogo'],paint:{'line-color':'#ff3b30','line-dasharray':[2,2],'line-width':1.2,'line-opacity':0.7}});
        GE().layers.add({id:'route-line-casing',type:'line',source:'route-src',filter:['==',['get','kind'],'route'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#04263f','line-width':5.5,'line-opacity':0.85}});
        GE().layers.add({id:'route-line',type:'line',source:'route-src',filter:['==',['get','kind'],'route'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#19c6ff','line-width':2.6}});
        GE().layers.add({id:'route-pts',type:'circle',source:'route-src',filter:['==',['get','kind'],'pt'],paint:{'circle-radius':6,'circle-color':'#19c6ff','circle-stroke-color':'#04263f','circle-stroke-width':2}});
        return true; }catch(_){ return false; } }
    function draw(lineCoords){ const feats=[];
      noGo.forEach(z=>{ try{ feats.push({type:'Feature',geometry:turf.circle([z.lng,z.lat],z.km,{units:'kilometers',steps:48}).geometry,properties:{kind:'nogo'}}); }catch(_){} });
      if(start) feats.push({type:'Feature',geometry:{type:'Point',coordinates:start},properties:{kind:'pt'}});
      if(end) feats.push({type:'Feature',geometry:{type:'Point',coordinates:end},properties:{kind:'pt'}});
      if(lineCoords&&lineCoords.length>1){ /* split at antimeridian so renderWorldCopies:false draws it */
        let seg=[lineCoords[0]]; for(let i=1;i<lineCoords.length;i++){ if(Math.abs(lineCoords[i][0]-lineCoords[i-1][0])>180){ if(seg.length>1) feats.push({type:'Feature',geometry:{type:'LineString',coordinates:seg},properties:{kind:'route'}}); seg=[lineCoords[i]]; } else seg.push(lineCoords[i]); }
        if(seg.length>1) feats.push({type:'Feature',geometry:{type:'LineString',coordinates:seg},properties:{kind:'route'}}); }
      try{ if(ensureLayers()) GE().layers.setSourceData('route-src',{type:'FeatureCollection',features:feats}); }catch(_){}
    }
    function setBody(html){ const b=panel&&panel.querySelector('#route-body'); if(b) b.innerHTML=html; }
    function compute(){ if(!start||!end||busy) return; busy=true;
      if(pureDist){ let line; try{ line=turf.greatCircle(turf.point(start),turf.point(end),{npoints:128}); }catch(_){ line=null; }
        const coords=line?(line.geometry.type==='MultiLineString'?[].concat(...line.geometry.coordinates):line.geometry.coordinates):[start,end];
        draw(coords); const km=hav(start,end); setBody((jp()?'直線距離（最短）: ':'Straight-line (shortest): ')+'<b>'+km.toFixed(0)+' km</b>'); busy=false; return; }
      setBody(jp()?'航路を計算中…':'Computing sea route…');
      setTimeout(()=>{ try{
        if(!buildMask()){ setBody(jp()?'国境データ読み込み待ち…再試行してください':'Country data still loading — try again.'); busy=false; return; }
        const s=snapSea(start[0],start[1]), e=snapSea(end[0],end[1]);
        if(!s||!e){ setBody(jp()?'海上の点が見つかりません（陸地の可能性）':'No sea cell found near a point (is it on land?).'); busy=false; return; }
        let path=astar(s,e);
        if(!path){ setBody(jp()?'航路が見つかりません（封鎖/到達不可）':'No sea route found (blocked or unreachable).'); busy=false; return; }
        /* (#R14) if the click landed on a coastal/shallow cell the mask reads as land, anchor the drawn route
           at the nearest navigable water (the snapped cell) rather than drawing a leg across land or failing —
           this is what lets the user start/end at ports & shallows. A water click keeps its exact point. */
        const sC=cellOf(start[0],start[1]), eC=cellOf(end[0],end[1]);
        path[0]=isSea(sC.x,sC.y)?start.slice():llOf(s.x,s.y);
        path[path.length-1]=isSea(eC.x,eC.y)?end.slice():llOf(e.x,e.y);
        const pulled=stringPull(path);
        let km=0; for(let i=1;i<pulled.length;i++){ if(Math.abs(pulled[i][0]-pulled[i-1][0])<180) km+=hav(pulled[i-1],pulled[i]); }
        draw(pulled);
        setBody((jp()?'航路距離: ':'Sea route: ')+'<b>'+km.toFixed(0)+' km</b> · '+pulled.length+(jp()?' 点':' pts')+(noGo.length?(jp()?(' · 禁止域 '+noGo.length):(' · '+noGo.length+' no-go')):''));
      }catch(err){ setBody((jp()?'エラー: ':'Error: ')+err); } busy=false; },30);
    }
    function buildPanel(){ if(panel) return panel; panel=document.createElement('div'); panel.className='tool-panel'; panel.id='route-panel'; (document.getElementById('map-container')||document.body).appendChild(panel); return panel; }
    function refreshPanel(){ const p=buildPanel(); p.style.cssText='display:block;left:24px;top:74px;right:auto;bottom:auto;z-index:1600;width:248px;';
      p.innerHTML='<div class="tp-header"><span class="tp-title">🚢 '+(jp()?'洋上ルート':'Sea route')+'</span><button class="tp-close" title="'+t('close')+'">✕</button></div>'
        +'<div class="tp-row" style="flex-direction:column;align-items:stretch;gap:6px;font-size:12px;">'
        +'<div>'+(jp()?'始点':'Start')+': <b>'+(start?fmtLL(start[0],start[1]):'—')+'</b></div>'
        +'<div>'+(jp()?'終点':'End')+': <b>'+(end?fmtLL(end[0],end[1]):'—')+'</b></div>'
        +'<label style="display:flex;align-items:center;gap:7px;color:var(--text-muted);"><input type="checkbox" id="route-pure"'+(pureDist?' checked':'')+'> '+(jp()?'純粋な最短距離（陸地無視）':'Pure shortest distance (ignore land)')+'</label>'
        +'<label style="display:flex;align-items:center;gap:7px;color:var(--text-muted);"><input type="checkbox" id="route-nogo-add"'+(addNoGoMode?' checked':'')+'> '+(jp()?'地図クリックで禁止域を追加':'Click map to add a no-go zone')+'</label>'
        +'</div>'
        +'<button class="tp-clear" id="route-go" style="width:100%;margin-top:6px;">'+(jp()?'ルート計算':'Compute route')+'</button>'
        +'<button class="tp-clear" id="route-clr" style="width:100%;margin-top:6px;">'+(jp()?'消去':'Clear')+'</button>'
        +'<div id="route-body" style="margin-top:8px;font-size:11.5px;color:var(--text-muted);line-height:1.5;">'+(jp()?'海上の2点を選びます。右クリック→「始点/終点に設定」、または計算を押す。':'Pick two sea points (right-click → set start/end), then Compute.')+'</div>';
      /* ✕ now clears the drawn route + no-go zones too — the "can't remove it once used" bug was that
         closing the panel left everything painted with the Clear button no longer reachable. */
      p.querySelector('.tp-close').onclick=()=>{ clear(); p.style.display='none'; };
      p.querySelector('#route-pure').onchange=(e)=>{ pureDist=e.target.checked; };
      p.querySelector('#route-nogo-add').onchange=(e)=>{ addNoGoMode=e.target.checked; };
      p.querySelector('#route-go').onclick=compute;
      p.querySelector('#route-clr').onclick=clear;
      try{ makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
    }
    function open(lngLat){ if(lngLat){ if(!start) start=[lngLat.lng,lngLat.lat]; else if(!end) end=[lngLat.lng,lngLat.lat]; } refreshPanel(); draw(null); }
    function setStart(lngLat){ start=[lngLat.lng,lngLat.lat]; end=null; refreshPanel(); draw(null); }
    function setEnd(lngLat){ end=[lngLat.lng,lngLat.lat]; refreshPanel(); draw(null); if(start&&end) compute(); }
    function clear(){ start=null; end=null; noGo=[]; addNoGoMode=false; draw(null); refreshPanel(); }
    /* When "add no-go" is armed, a left-click drops a no-go zone (start/end come from the right-click
       menu, so normal clicks/measure tools aren't hijacked). */
    GE().events.on('click',(e)=>{ if(!panel||panel.style.display==='none'||!addNoGoMode) return;
      noGo.push({lng:e.lngLat.lng,lat:e.lngLat.lat,km:120}); draw(null);
      const b=panel.querySelector('#route-body'); if(b) b.innerHTML=(jp()?'禁止域を追加（計500km毎に120km円）。「ルート計算」を押す。':'No-go added (120 km circle). Press Compute route.'); });
    GE().events.on('styledata',()=>{ if(panel&&panel.style.display!=='none'){ setTimeout(()=>{ if(ensureLayers()) draw(null); },80); } });
    return { open, setStart, setEnd, clear, active:()=>!!(panel&&panel.style.display!=='none'), _astar:()=>({buildMask, snapSea, astar, stringPull}) };
  })();
};

/* (#R176) IntMapModules.los MOVED OUT of this file to js/viewshed.js.
 * It was the 900-ray first-horizon star polygon; 「Line of sightを超高精度化して」 replaced it with a
 * raster viewshed that answers per cell, so it grew past what belongs in a grab-bag of map tools and
 * this file is 125 lines lighter for it (standing instruction 13). The factory name and the
 * window.IntMapLOS API it publishes are unchanged, so every call site — the map right-click menu and
 * the Atlas los/viewshed actions — is untouched. */
window.IntMapModules.outline=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  window.IntMapOutline=(function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { show(){}, clear(){} };
    const L=window.IntMapLang.pick(()=>HOST.lang);
    let _last=null, _active=false, _seq=0, _col='#0a84ff';   /* (#R61) _col: Atlas can recolor the outline */
    function setVis(v){ try{ if(GE().layers.has('pl-outline-fill')) GE().layers.setLayout('pl-outline-fill','visibility',v); if(GE().layers.has('pl-outline-line')) GE().layers.setLayout('pl-outline-line','visibility',v); }catch(_){} }
    function ensureLayers(){ try{
      if(!GE().layers.hasSource('pl-outline-src')) GE().layers.addSource('pl-outline-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      const before=['ofm-country','ofm-city','ofm-other'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
      if(!GE().layers.has('pl-outline-fill')) GE().layers.add({id:'pl-outline-fill',type:'fill',source:'pl-outline-src',paint:{'fill-color':_col,'fill-opacity':0.15}},before);
      if(!GE().layers.has('pl-outline-line')) GE().layers.add({id:'pl-outline-line',type:'line',source:'pl-outline-src',paint:{'line-color':_col,'line-width':2.4,'line-opacity':0.95}},before);
      return true; }catch(_){ return false; } }
    function setColor(c){ if(!c) return; _col=c; try{ if(GE().layers.has('pl-outline-fill')) GE().layers.setPaint('pl-outline-fill','fill-color',c); if(GE().layers.has('pl-outline-line')) GE().layers.setPaint('pl-outline-line','line-color',c); }catch(_){} }
    function setData(geo){ try{ ensureLayers(); GE().layers.setSourceData('pl-outline-src',geo); }catch(_){} }
    /* (#R55) Bulletproof clear. The user re-reported the polygon staying after ×. The REAL hole (R54 missed it):
       a show() whose Nominatim fetch was STILL IN FLIGHT would resolve AFTER clear() and repaint the outline. So
       clear() bumps `_seq` (every in-flight show checks it after its await and bails on mismatch), flips
       `_active`/`_last` off (the styledata re-add is gated on `_active`), empties the source, AND hides the layers
       outright — nothing can render until the next show(). */
    /* (#R56) NUCLEAR clear — the user kept reporting the polygon staying after ×. Emptying the source + hiding the
       layers evidently wasn't enough in the field, so we now REMOVE the layers and the source outright: there is
       literally nothing left that can paint the outline. `_seq`/`_active`/`_last` are flipped off first so any
       in-flight show() or styledata re-add bails. The next show() re-creates everything via ensureLayers(). */
    /* (#R59) Pure boundary renderer (NO chip, NO own click handler). The place-label POPUP (#R8c) now owns the
       click + the × and drives show()/clear() — so there is ONE popup, ONE boundary, and ONE × that clears both
       (the user reported the line staying after the popup's ×, which only closed the popup). clear() is nuclear:
       removes the layers + source so nothing can paint, then forces a repaint. */
    function clear(){ _seq++; _active=false; _last=null;
      try{ if(GE().layers.has('pl-outline-line')) GE().layers.remove('pl-outline-line'); }catch(_){}
      try{ if(GE().layers.has('pl-outline-fill')) GE().layers.remove('pl-outline-fill'); }catch(_){}
      try{ if(GE().layers.hasSource('pl-outline-src')) GE().layers.removeSource('pl-outline-src'); }catch(_){}
      try{ setVis('none'); }catch(_){}
      try{ GE().render.triggerRepaint&&GE().render.triggerRepaint(); }catch(_){} }
    function bboxOf(geo){ let a=180,b=90,c=-180,d=-90; const scan=cs=>{ for(const x of cs){ if(typeof x[0]==='number'){ if(x[0]<a)a=x[0]; if(x[1]<b)b=x[1]; if(x[0]>c)c=x[0]; if(x[1]>d)d=x[1]; } else scan(x); } }; try{ scan(geo.coordinates); }catch(_){ return null; } return (isFinite(a)&&c>a&&d>b)?[[a,b],[c,d]]:null; }
    /* (#R59) point-in-polygon — pick the boundary that CONTAINS the clicked point (exact, no distance threshold:
       the user said "固定基準で解決できると思うな"). Fixes "flies to a far same-named place". */
    function _pipRing(x,y,r){ let inside=false; for(let i=0,j=r.length-1;i<r.length;j=i++){ const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1]; if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi)) inside=!inside; } return inside; }
    function _pipPoly(x,y,poly){ if(!poly||!poly.length||!_pipRing(x,y,poly[0])) return false; for(let i=1;i<poly.length;i++){ if(_pipRing(x,y,poly[i])) return false; } return true; }
    function _pipGeo(x,y,gj){ try{ if(!gj) return false; if(gj.type==='Polygon') return _pipPoly(x,y,gj.coordinates); if(gj.type==='MultiPolygon') return gj.coordinates.some(p=>_pipPoly(x,y,p)); }catch(_){} return false; }
    function _bboxArea(gj){ const bb=bboxOf(gj); return bb?((bb[1][0]-bb[0][0])*(bb[1][1]-bb[0][1])):Infinity; }
    function _bboxHas(gj,x,y){ const bb=bboxOf(gj); return !!(bb&&x>=bb[0][0]&&x<=bb[1][0]&&y>=bb[0][1]&&y<=bb[1][1]); }
    async function fetchPolygon(name, ctx){ const q=String(name||'').trim(); if(!q) return null;
      let vb=''; if(ctx&&isFinite(ctx.lng)&&isFinite(ctx.lat)){ const d=8; vb='&viewbox='+(ctx.lng-d)+','+(ctx.lat+d)+','+(ctx.lng+d)+','+(ctx.lat-d); }
      const thr=(ctx&&ctx.threshold!=null)?ctx.threshold:0.0003;   /* (#R54) high-res shape, not 9 straight points */
      try{ const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&polygon_geojson=1&polygon_threshold='+thr+'&q='+encodeURIComponent(q)+vb,{headers:{Accept:'application/json'}}); const j=await r.json(); if(!Array.isArray(j)||!j.length) return null;
        const polys=j.filter(o=>o.geojson&&/Polygon/.test(o.geojson.type||''));
        if(!polys.length) return null;   /* (#R59) NO rectangle fallback — if there is no real boundary, draw NOTHING */
        let best=null;
        if(ctx&&isFinite(ctx.lng)&&isFinite(ctx.lat)){
          const inside=polys.filter(o=>_pipGeo(ctx.lng,ctx.lat,o.geojson));
          if(inside.length){ inside.sort((a,b)=>_bboxArea(a.geojson)-_bboxArea(b.geojson)); best=inside[0]; }   /* smallest containing = most specific */
          else { const bx=polys.filter(o=>_bboxHas(o.geojson,ctx.lng,ctx.lat)); if(bx.length){ bx.sort((a,b)=>_bboxArea(a.geojson)-_bboxArea(b.geojson)); best=bx[0]; } }   /* tap just off the glyph */
          if(!best) return null;   /* the tapped place has no boundary here → null (never a far namesake, never a box) */
        } else { best=polys.slice().sort((x,y)=>(+y.importance||0)-(+x.importance||0))[0]; }
        if(!best) return null;
        return { name:(best.display_name||q).split(',')[0], geojson:best.geojson, lng:+best.lon, lat:+best.lat };
      }catch(_){ return null; } }
    async function show(name, ctx){ ctx=ctx||{}; const myseq=++_seq;   /* generation token — a later show()/clear() invalidates this one */
      try{ let geo=(ctx.geojson&&/Polygon/.test(ctx.geojson.type||''))?ctx.geojson:null, disp=name||'';
        if(!geo){ const r=await fetchPolygon(name, ctx); if(myseq!==_seq) return false; if(r&&r.geojson){ disp=r.name||disp; geo=r.geojson; } }
        if(myseq!==_seq) return false;
        if(!geo) return false;   /* (#R59) no real polygon → draw NOTHING (no rectangle, no far same-named place) */
        setData({type:'FeatureCollection',features:[{type:'Feature',geometry:geo,properties:{}}]}); _last={name:disp,geo}; _active=true; setVis('visible');
        if(ctx.fit!==false){ const bb=bboxOf(geo); if(bb && (bb[1][0]-bb[0][0])<340 && (bb[1][1]-bb[0][1])<170){ try{ const el=GE().render.container&&GE().render.container(); const pad=Math.max(40,Math.round(Math.min((el&&el.clientWidth)||900,(el&&el.clientHeight)||600)*0.08)); GE().camera.fitBounds(bb,{padding:pad,maxZoom:12,duration:900}); }catch(_){} } }
        return true;
      }catch(_){ return false; } }
    GE().events.on('styledata',()=>{ if(_active&&_last){ setTimeout(()=>{ if(!_active||!_last) return; try{ ensureLayers(); GE().layers.setSourceData('pl-outline-src',{type:'FeatureCollection',features:[{type:'Feature',geometry:_last.geo,properties:{}}]}); setVis('visible'); }catch(_){} },120); }
      else { /* (#R57) REAPER — while no outline is active, NO pl-outline layer/source may survive a style event, so a
                cleared outline can never linger. Only ever removes. */
        try{ if(GE().layers.has('pl-outline-line')) GE().layers.remove('pl-outline-line'); }catch(_){}
        try{ if(GE().layers.has('pl-outline-fill')) GE().layers.remove('pl-outline-fill'); }catch(_){}
        try{ if(GE().layers.hasSource('pl-outline-src')) GE().layers.removeSource('pl-outline-src'); }catch(_){} } });
    /* (#R120) current()/focus() — the active outline is a first-class map object (Object List + objectIds) */
    return { show, clear, setColor, active:()=>_active,
      current:()=>(_active&&_last)?{name:_last.name, geo:_last.geo}:null,   /* (#R122) expose the geometry (Move/Isolate) */
      focus:()=>{ try{ if(_active&&_last){ const bb=bboxOf(_last.geo); if(bb&&(bb[1][0]-bb[0][0])<340) GE().camera.fitBounds(bb,{padding:60,maxZoom:12,duration:800}); } }catch(_){} } };
  })();
};

window.IntMapModules.moveShape=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  window.IntMapMoveShape=(function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { start(){}, stop(){}, active:()=>false };
    let baseGeo=null, baseCen=null, on=false, pill=null, handlers=[];
    const accent=()=>{ try{ return (window.imAccent&&/^#[0-9a-fA-F]{6}$/.test(window.imAccent))?window.imAccent:'#0a84ff'; }catch(_){ return '#0a84ff'; } };
    function ensure(){ try{ if(!GE().layers.hasSource('immove-src')) GE().layers.addSource('immove-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      const bf=['nlq-poly-fill','pl-outline-fill','ofm-country','ofm-city'].find(id=>{ try{ return !!GE().layers.has(id); }catch(_){ return false; } });
      if(!GE().layers.has('immove-fill')) GE().layers.add({id:'immove-fill',type:'fill',source:'immove-src',paint:{'fill-color':accent(),'fill-opacity':0.4}},bf);
      if(!GE().layers.has('immove-line')) GE().layers.add({id:'immove-line',type:'line',source:'immove-src',paint:{'line-color':accent(),'line-width':2.6}},bf);
      else { try{ GE().layers.setPaint('immove-fill','fill-color',accent()); GE().layers.setPaint('immove-line','line-color',accent()); }catch(_){} }
    }catch(_){} }
    function centroid(g){ let sx=0,sy=0,n=0; const eat=c=>{ if(typeof c[0]==='number'){ sx+=c[0]; sy+=c[1]; n++; } else c.forEach(eat); }; try{ eat(g.coordinates); }catch(_){} return n?[sx/n,sy/n]:[0,0]; }
    function _mercNow(){ try{ return (typeof HOST.proj==='undefined'||HOST.proj==='flat'); }catch(_){ return true; } }
    /* (#R123/#R124) FLAT (Mercator): counter-scale by cos(lat0)/cos(latN) so the shape keeps its TRUE AREA as it
       moves through Mercator's latitude inflation. GLOBE: a plain lng/lat translation still visually DISTORTS the
       shape (meridians converge poleward, squishing it) — "まだGlobeでも領域の形が変わってしまう". The correct move on
       a sphere is a RIGID great-circle ROTATION that carries the centroid to the new point, preserving the shape's
       true geodesic form (it looks identical, just relocated). */
    /* (#R125) shared Rodrigues rotation of vector v about UNIT axis k by angle ang (radians). */
    const _rodr=(v,k,ang)=>{ const ca=Math.cos(ang), sa=Math.sin(ang);
      const kv=[k[1]*v[2]-k[2]*v[1],k[2]*v[0]-k[0]*v[2],k[0]*v[1]-k[1]*v[0]]; const kd=k[0]*v[0]+k[1]*v[1]+k[2]*v[2];
      return [v[0]*ca+kv[0]*sa+k[0]*kd*(1-ca), v[1]*ca+kv[1]*sa+k[1]*kd*(1-ca), v[2]*ca+kv[2]*sa+k[2]*kd*(1-ca)]; };
    const _D=Math.PI/180;
    const _toV=(lng,lat)=>{ const a=lng*_D,b=lat*_D,cb=Math.cos(b); return [cb*Math.cos(a),cb*Math.sin(a),Math.sin(b)]; };
    function reshape(newCen,rotAng){ rotAng=rotAng||0;
      if(_mercNow()){ const lat0=baseCen[1], latN=Math.max(-84,Math.min(84,newCen[1]));
        const s=Math.max(0.05,Math.cos(lat0*Math.PI/180))/Math.max(0.05,Math.cos(latN*Math.PI/180));
        /* (#R125) optional right-drag spin: rotate in a locally METRIC frame around the destination centroid
           (x scaled by cos(lat) so the spin doesn't shear the shape on the Mercator plane). */
        const cr=Math.cos(rotAng), sr=Math.sin(rotAng), cl=Math.max(0.05,Math.cos(latN*_D));
        const mv=c=>{ if(typeof c[0]==='number'){
            const dxm=(c[0]-baseCen[0])*s*cl, dym=(c[1]-baseCen[1])*s;
            return [ newCen[0]+(dxm*cr-dym*sr)/cl, latN+(dxm*sr+dym*cr) ]; }
          return c.map(mv); };
        return { type:baseGeo.type, coordinates:mv(baseGeo.coordinates) }; }
      /* GLOBE (#R125): rigid great-circle rotation baseCen→newCen, PLUS a twist about the destination vertical that
         re-aligns the transported north with true north — a bare Rodrigues rotation carries the centroid correctly
         but leaves the shape TILTED at some destinations ("場所によっては傾いてしまう") because the transported local
         frame no longer points north. rotAng (right-drag) then adds the user's deliberate spin. */
      const v0=_toV(baseCen[0],baseCen[1]), v1=_toV(newCen[0],newCen[1]);
      let ax=[v0[1]*v1[2]-v0[2]*v1[1], v0[2]*v1[0]-v0[0]*v1[2], v0[0]*v1[1]-v0[1]*v1[0]];
      const axLen=Math.hypot(ax[0],ax[1],ax[2]); const dot=Math.max(-1,Math.min(1,v0[0]*v1[0]+v0[1]*v1[1]+v0[2]*v1[2])); const ang=Math.acos(dot);
      const k=axLen>1e-12?[ax[0]/axLen,ax[1]/axLen,ax[2]/axLen]:[0,0,1];
      const gcRot=v=>axLen<1e-12?v.slice():_rodr(v,k,ang);
      /* twist = angle between transported north and true north at the destination (both tangents at newCen). */
      const aB=newCen[0]*_D, bB=newCen[1]*_D;
      const northB=[-Math.sin(bB)*Math.cos(aB), -Math.sin(bB)*Math.sin(aB), Math.cos(bB)];
      const eastB=[-Math.sin(aB), Math.cos(aB), 0];
      const aA=baseCen[0]*_D, bA=baseCen[1]*_D;
      const nAr=gcRot([-Math.sin(bA)*Math.cos(aA), -Math.sin(bA)*Math.sin(aA), Math.cos(bA)]);
      const twist=Math.atan2(nAr[0]*eastB[0]+nAr[1]*eastB[1]+nAr[2]*eastB[2], nAr[0]*northB[0]+nAr[1]*northB[1]+nAr[2]*northB[2]);
      /* rotation about the OUTWARD vertical by +ang maps a tangent at bearing θ to θ−ang (north→west), so the
         twist (transported north sitting `twist` east-of-north) is cancelled by spin=+twist. */
      const spin=twist+rotAng;
      const mv=c=>{ if(typeof c[0]==='number'){ let v=gcRot(_toV(c[0],c[1])); if(spin) v=_rodr(v,v1,spin);
        let lat=Math.asin(Math.max(-1,Math.min(1,v[2])))/_D, lng=Math.atan2(v[1],v[0])/_D;
        while(lng-newCen[0]>180) lng-=360; while(lng-newCen[0]<-180) lng+=360;   /* keep longitudes contiguous around the new centre (no dateline split) */
        return [lng,lat]; } return c.map(mv); };
      return { type:baseGeo.type, coordinates:mv(baseGeo.coordinates) }; }
    function paint(g){ ensure(); try{ GE().layers.setSourceData('immove-src',{type:'Feature',geometry:g,properties:{}}); }catch(_){} }
    function showPill(name){ try{ if(pill) pill.remove();
      pill=document.createElement('div'); pill.id='immove-pill';
      pill.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom,0px));z-index:1450;display:flex;align-items:center;gap:10px;background:var(--popup-bg,#141414);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:22px;padding:8px 10px 8px 16px;box-shadow:0 8px 30px rgba(0,0,0,0.4);font-size:13px;';
      const L=window.IntMapLang.pick(()=>HOST.lang);
      /* (#R123) honest suffix: flat map = true-area preserved (Mercator counter-scale); globe = plain reposition. */
      const sizeNote=_mercNow()?L('— true size preserved','（実面積を保持）','— echte Größe','— истинный размер','— tamaño real'):L('— true shape preserved','（形状を保持して移動）','— Form bleibt erhalten','— форма сохраняется','— forma conservada');
      const rotNote=L(' · right-drag to rotate',' · 右ドラッグで回転',' · Rechtsziehen: drehen',' · правая кнопка — поворот',' · clic derecho: girar');
      pill.innerHTML='<span>'+L('Drag ','ドラッグで移動 · ','Ziehen · ','Перетащите · ','Arrastra · ')+'<b>'+String(name||'').replace(/[&<>"]/g,'')+'</b> '+sizeNote+rotNote+'</span><button style="border:none;background:var(--primary-color);color:#fff;border-radius:15px;padding:6px 14px;font-size:12.5px;font-weight:600;cursor:pointer;">'+L('Done','完了','Fertig','Готово','Listo')+'</button>';
      pill.querySelector('button').onclick=()=>stop();
      document.body.appendChild(pill); }catch(_){} }
    function start(geom,name){ if(!geom||!geom.coordinates) return false; stop();
      try{ baseGeo=JSON.parse(JSON.stringify(geom)); }catch(_){ return false; }
      baseCen=centroid(baseGeo); on=true; paint(baseGeo);
      /* (#R125) placement state persists across gestures: left-drag re-positions (curCen), RIGHT-drag spins the
         shape about its own centroid ("右クリックしながら動かしたら回転させられるように") — screen-angle around the
         projected centroid drives rotAng, so the shape follows the cursor like a dial. */
      let curCen=baseCen.slice(), rotAng=0;
      try{ GE().input.set('dragPan',false); }catch(_){} try{ GE().input.set('dragRotate',false); }catch(_){}
      try{ GE().render.canvas().style.cursor='move'; }catch(_){}
      let dragging=false, rotating=false, rotStart=0, rotBase=0;
      const angAt=(e)=>{ try{ const c=GE().coords.project({lng:curCen[0],lat:curCen[1]}); return Math.atan2(e.point.y-c.y,e.point.x-c.x); }catch(_){ return 0; } };
      const dn=(e)=>{ const btn=e&&e.originalEvent&&e.originalEvent.button;
        if(btn===2){ rotating=true; rotStart=angAt(e); rotBase=rotAng; }
        else dragging=true;
        if(e&&e.preventDefault) try{ e.preventDefault(); }catch(_){} };
      const mvv=(e)=>{
        if(rotating&&e.point){ rotAng=rotBase-(angAt(e)-rotStart); paint(reshape(curCen,rotAng)); return; }
        if(!dragging||!e.lngLat) return; curCen=[e.lngLat.lng,e.lngLat.lat]; paint(reshape(curCen,rotAng)); };
      const up=()=>{ dragging=false; rotating=false; };
      const ctx=(e)=>{ if(e&&e.preventDefault) try{ e.preventDefault(); }catch(_){} };   /* no browser context menu while placing */
      GE().events.on('mousedown',dn); GE().events.on('touchstart',dn); GE().events.on('mousemove',mvv); GE().events.on('touchmove',mvv); GE().events.on('mouseup',up); GE().events.on('touchend',up); GE().events.on('contextmenu',ctx);
      handlers=[['mousedown',dn],['touchstart',dn],['mousemove',mvv],['touchmove',mvv],['mouseup',up],['touchend',up],['contextmenu',ctx]];
      showPill(name); return true; }
    function stop(){ if(!on&&!handlers.length){ return; } on=false;
      try{ handlers.forEach(([ev,fn])=>GE().events.off(ev,fn)); }catch(_){} handlers=[];
      try{ GE().input.set('dragPan',true); }catch(_){} try{ GE().input.set('dragRotate',true); }catch(_){}
      try{ GE().render.canvas().style.cursor=''; }catch(_){}
      try{ if(GE().layers.has('immove-fill')) GE().layers.remove('immove-fill'); }catch(_){}
      try{ if(GE().layers.has('immove-line')) GE().layers.remove('immove-line'); }catch(_){}
      try{ if(GE().layers.hasSource('immove-src')) GE().layers.removeSource('immove-src'); }catch(_){}
      if(pill){ try{ pill.remove(); }catch(_){} pill=null; } }
    return { start, stop, active:()=>on, _reshape:(cen,rot)=>reshape(cen,rot||0) }; })();
};

window.IntMapModules.isochrone=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const makeDraggable=HOST.makeDraggable, bringToFront=HOST.bringToFront;
  window.IntMapIsochrone=(function(){
    const LL=window.IntMapLang.pick(()=>HOST.lang);
    const SRC='im-iso-src';
    const COST={auto:'auto',car:'auto',drive:'auto',driving:'auto',walk:'pedestrian',walking:'pedestrian',foot:'pedestrian',pedestrian:'pedestrian',bike:'bicycle',bicycle:'bicycle',cycle:'bicycle',cycling:'bicycle'};
    const ICON={auto:'🚗',pedestrian:'🚶',bicycle:'🚲'};
    const PAL=['#0a84ff','#34c759','#ff9f0a','#ff375f'];   /* smallest → largest contour */
    let panel=null, center=null, mode='auto', mins=[15,30], busy=false, lastMinutes=[15,30];
    function ensureLayers(){ try{ if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!GE().layers.has('im-iso-fill')) GE().layers.add({id:'im-iso-fill',type:'fill',source:SRC,filter:['==','$type','Polygon'],paint:{'fill-color':['coalesce',['get','col'],'#0a84ff'],'fill-opacity':0.18}});
      if(!GE().layers.has('im-iso-line')) GE().layers.add({id:'im-iso-line',type:'line',source:SRC,filter:['==','$type','Polygon'],layout:{'line-join':'round'},paint:{'line-color':['coalesce',['get','col'],'#0a84ff'],'line-width':2.2,'line-opacity':0.92}});
      if(!GE().layers.has('im-iso-ctr')) GE().layers.add({id:'im-iso-ctr',type:'circle',source:SRC,filter:['==','$type','Point'],paint:{'circle-radius':6,'circle-color':'#fff','circle-stroke-color':'#0a84ff','circle-stroke-width':3}});
      return true; }catch(_){ return false; } }
    function clear(){ try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){} if(panel) panel.style.display='none'; }
    async function fetchIso(c,cost,minutes){
      const body={locations:[{lat:+c.lat,lon:+c.lng}],costing:cost,contours:minutes.map(t=>({time:t})),polygons:true,denoise:0.5,generalize:60};
      const url='https://valhalla1.openstreetmap.de/isochrone?json='+encodeURIComponent(JSON.stringify(body));
      const withT=(u)=>{ const ac=new AbortController(),t=setTimeout(()=>{try{ac.abort();}catch(_){}} ,25000); return fetch(u,{signal:ac.signal}).finally(()=>clearTimeout(t)); };
      try{ const r=await withT(url); if(r&&r.ok){ const j=await r.json(); if(j&&j.features&&j.features.length) return j; } }catch(_){}
      try{ const r=await withT('https://corsproxy.io/?url='+encodeURIComponent(url)); if(r&&r.ok){ const j=await r.json(); if(j&&j.features&&j.features.length) return j; } }catch(_){}
      return null; }
    async function run(lngLat,opts){ opts=opts||{}; if(lngLat&&lngLat.lng!=null) center={lng:+lngLat.lng,lat:+lngLat.lat}; if(!center) return {ok:false,reason:'no-point'};
      const cost=COST[String(opts.mode||mode).toLowerCase()]||'auto'; mode=cost;
      let minutes=Array.isArray(opts.minutes)?opts.minutes.slice():(opts.minutes!=null?[+opts.minutes]:mins.slice());
      minutes=minutes.map(x=>Math.round(+x)).filter(x=>x>0&&x<=120); minutes=[...new Set(minutes)].sort((a,b)=>a-b).slice(0,4); if(!minutes.length) minutes=[15,30];
      mins=minutes.slice(); ensureLayers(); busy=true; renderPanel();
      const j=await fetchIso(center,cost,minutes); busy=false;
      if(!j){ renderPanel('err'); return {ok:false,reason:'api'}; }
      const polys=(j.features||[]).filter(f=>f.geometry&&/Polygon/.test(f.geometry.type)).sort((a,b)=>(b.properties.contour||0)-(a.properties.contour||0));   /* largest first → drawn underneath */
      const feats=polys.map(f=>{ const c=+f.properties.contour; const idx=Math.max(0,minutes.indexOf(c)); return {type:'Feature',geometry:f.geometry,properties:{col:PAL[Math.min(PAL.length-1,idx)],min:c}}; });
      feats.push({type:'Feature',geometry:{type:'Point',coordinates:[center.lng,center.lat]},properties:{}});
      try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); }catch(_){}
      try{ if(polys.length&&typeof turf!=='undefined'){ const bb=turf.bbox({type:'FeatureCollection',features:polys}); if(bb.every(isFinite)&&bb[2]>bb[0]) GE().camera.fitBounds([[bb[0],bb[1]],[bb[2],bb[3]]],{padding:56,duration:900,maxZoom:14}); } }catch(_){}
      lastMinutes=minutes.slice(); renderPanel(); return {ok:true,minutes,mode:cost}; }
    function ensurePanel(){ if(panel) return panel;
      panel=document.createElement('div'); panel.id='iso-panel';
      panel.style.cssText='position:fixed;left:20px;top:80px;width:min(268px,92vw);z-index:1500;display:none;flex-direction:column;background:var(--popup-bg,#141414);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:14px;overflow:hidden;box-shadow:0 16px 46px rgba(0,0,0,0.44);';
      panel.innerHTML='<div class="iso-head" style="flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:8px 11px;background:var(--input-bg);cursor:move;"><span style="flex:1;font-size:13px;font-weight:600;color:var(--text-main);">🎯 '+LL('Reachable area','到達圏','Erreichbarkeit','Зона доступности','Área alcanzable')+'</span><button class="iso-x" title="'+LL('Close','閉じる','Schließen','Закрыть','Cerrar')+'" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div><div class="iso-body" style="padding:10px 12px;display:flex;flex-direction:column;gap:9px;"></div>';
      (document.getElementById('map-container')||document.body).appendChild(panel);
      panel.querySelector('.iso-x').onclick=()=>clear();
      try{ if(typeof makeDraggable==='function') makeDraggable(panel,panel.querySelector('.iso-head')); }catch(_){}
      return panel; }
    function renderPanel(state){ const p=ensurePanel(); const body=p.querySelector('.iso-body'); if(!body) return;
      const modes=[['auto','🚗',LL('Drive','車','Auto','Авто','Coche')],['pedestrian','🚶',LL('Walk','徒歩','Zu Fuß','Пешком','A pie')],['bicycle','🚲',LL('Cycle','自転車','Rad','Вело','Bici')]];
      const presets=[10,15,20,30,45,60]; const bs='height:30px;border:1px solid var(--glass-border,rgba(128,128,128,0.28));background:var(--input-bg);color:var(--text-muted);border-radius:8px;cursor:pointer;font-size:12px;';
      body.innerHTML='<div style="display:flex;gap:5px;">'+modes.map(m=>'<button class="iso-mode" data-m="'+m[0]+'" style="flex:1;'+bs+(m[0]===mode?'background:var(--primary-color);color:#fff;border-color:var(--primary-color);':'')+'">'+m[1]+' '+m[2]+'</button>').join('')+'</div>'
        +'<div style="font-size:11px;color:var(--text-muted);">'+LL('Time — tap to add/remove (max 3)','時間 — タップで追加/削除（最大3）','Zeit — antippen (max. 3)','Время — нажмите (макс. 3)','Tiempo — toca (máx. 3)')+'</div>'
        +'<div style="display:flex;flex-wrap:wrap;gap:5px;">'+presets.map(v=>'<button class="iso-min" data-v="'+v+'" style="flex:1;min-width:38px;'+bs+(mins.indexOf(v)>=0?'background:var(--primary-color);color:#fff;border-color:var(--primary-color);':'')+'">'+v+'</button>').join('')+'</div>'
        +(busy?'<div style="font-size:11.5px;color:var(--text-muted);">'+LL('Computing…','計算中…','Berechne…','Расчёт…','Calculando…')+'</div>':(state==='err'?'<div style="font-size:11.5px;color:#ff9f0a;">'+LL('Could not compute (service busy) — try again','算出できませんでした（混雑）— 再試行を','Fehlgeschlagen — erneut versuchen','Не удалось — снова','No se pudo — reintenta')+'</div>':(lastMinutes.length?'<div style="display:flex;flex-direction:column;gap:3px;">'+lastMinutes.slice().sort((a,b)=>a-b).map((v,i)=>'<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--text-main);"><span style="width:13px;height:13px;border-radius:3px;background:'+PAL[Math.min(PAL.length-1,i)]+';opacity:0.75;"></span>'+ICON[mode]+' '+v+' '+LL('min','分','Min','мин','min')+'</div>').join('')+'</div>':'')))
        +'<div style="font-size:10px;color:var(--text-muted);line-height:1.4;">'+LL('Follows the real road network (Valhalla / OpenStreetMap) — not a distance circle.','実際の道路網に沿った範囲（Valhalla／OpenStreetMap）— 距離の円ではありません。','Entlang des echten Straßennetzes (Valhalla/OSM) — kein Distanzkreis.','По реальной дорожной сети (Valhalla/OSM) — не круг расстояния.','Sigue la red vial real (Valhalla/OSM) — no un círculo.')+'</div>';
      body.querySelectorAll('.iso-mode').forEach(b=>b.onclick=()=>{ mode=b.getAttribute('data-m'); run(center,{mode,minutes:mins}); });
      body.querySelectorAll('.iso-min').forEach(b=>b.onclick=()=>{ const v=+b.getAttribute('data-v'); const i=mins.indexOf(v); if(i>=0){ if(mins.length>1) mins.splice(i,1); } else { if(mins.length>=3) mins.shift(); mins.push(v); } run(center,{mode,minutes:mins}); }); }
    function open(lngLat){ if(lngLat&&lngLat.lng!=null) center={lng:+lngLat.lng,lat:+lngLat.lat}; ensurePanel().style.display='flex'; try{ if(typeof bringToFront==='function') bringToFront(panel); }catch(_){} if(center) run(center,{mode,minutes:mins}); else renderPanel(); }
    return { open, run, clear, ensureLayers, _src:SRC }; })();
};

window.IntMapModules.arc3d=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  window.IntMapArc3D=(function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { show(){}, hide(){}, animate(){}, draw(){} };
    let cv=null, ctx=null, data=null, raf=0, prog=1, dpr=1, bound=false;
    function ensure(){ if(cv) return; cv=document.createElement('canvas'); cv.id='arc3d-canvas';
      cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:6;';
      const cont=document.getElementById('map-container'); (cont||document.body).appendChild(cv); ctx=cv.getContext('2d');
      /* (#R95) arc redraw paused while the flight sim drives the camera.
         ⚠⚠ (#R234) AND IT USED TO REDRAW UP TO FOUR TIMES A FRAME. `move`, `zoom`, `rotate` and
         `pitch` are not four different moments — MapLibre fires all of them within a single frame of
         a pinch-rotate, and this subscribed to each with NO coalescing, so the whole arc was
         re-rasterised once per event. One camera registration in js/runtime.js is one draw per frame,
         with the same picture at the end of it. */
      if(!bound){ bound=true; const rd=()=>{ if(window.__fsCamActive) return; if(data) draw(); };
        const R=window.IntMapRuntime;
        if(R) R.onCamera('arc3d.draw',rd);
        else { GE().events.on('move',rd); GE().events.on('zoom',rd); GE().events.on('rotate',rd); GE().events.on('pitch',rd); }
        window.addEventListener('resize',()=>{ resize(); if(data) draw(); }); } }
    function resize(){ if(!cv) return; const cont=document.getElementById('map-container'); if(!cont) return; dpr=Math.min(2,window.devicePixelRatio||1); const w=cont.clientWidth,h=cont.clientHeight; cv.width=w*dpr; cv.height=h*dpr; cv.style.width=w+'px'; cv.style.height=h+'px'; ctx.setTransform(dpr,0,0,dpr,0,0); }
    function lerp(a,b,t){ return a+(b-a)*t; }
    function hx(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
    const STOPS=[[0,'#2a52be'],[0.35,'#30d5c8'],[0.6,'#ffd60a'],[0.82,'#ff9f0a'],[1,'#ff3b30']];   /* altitude ramp: low blue → high red */
    function altColor(t){ t=Math.max(0,Math.min(1,t)); for(let i=1;i<STOPS.length;i++){ if(t<=STOPS[i][0]){ const a=STOPS[i-1],b=STOPS[i]; const k=(t-a[0])/((b[0]-a[0])||1); const c1=hx(a[1]),c2=hx(b[1]); return 'rgb('+Math.round(lerp(c1[0],c2[0],k))+','+Math.round(lerp(c1[1],c2[1],k))+','+Math.round(lerp(c1[2],c2[2],k))+')'; } } return STOPS[STOPS.length-1][1]; }
    function show(d){ ensure(); resize(); data=d; prog=(d&&d.prog!=null)?d.prog:1; cv.style.display='block'; draw(); }
    function hide(){ cancelAnimationFrame(raf); data=null; if(cv&&ctx){ ctx.clearRect(0,0,cv.width,cv.height); cv.style.display='none'; } }
    function draw(){ if(!cv||!ctx||!data) return; const W=cv.width/dpr, H=cv.height/dpr; ctx.clearRect(0,0,W,H);
      const N=data.pts.length; if(N<2) return; const apo=data.apogee||1;
      /* (#R85) WORLD-SCALE altitude ("立体軌道が全くのでたらめ・ズームレベルによって高さが変わる・現実に忠実に描画"):
         lift each ground point by its REAL altitude at the SAME pixels-per-km the map draws the ground with, so the
         arc is geometrically to scale and grows/shrinks WITH the zoom (the old code used a fixed 0.46·screenHeight
         fraction, which is exactly why the height looked wrong and changed with zoom). Measure the live scale from
         the projection each frame (a 50 km north step at the view centre). */
      let pxPerKm=0.1; try{ const c=GE().camera.getCenter(); const p0=GE().coords.project([c.lng,c.lat]); const p1=GE().coords.project([c.lng,c.lat+50/111.32]); const d=Math.hypot(p1.x-p0.x,p1.y-p0.y)/50; if(isFinite(d)&&d>0) pxPerKm=d; }catch(_){}
      const maxLift=0.92*H;   /* clamp so an extreme apogee at high zoom can't shoot off-canvas */
      const scr=[]; for(let i=0;i<N;i++){ let p; try{ p=GE().coords.project(data.pts[i]); }catch(_){ p={x:0,y:0}; } const lift=Math.min(maxLift,(data.alts[i]||0)*pxPerKm); scr.push({x:p.x, gy:p.y, y:p.y-lift, alt:data.alts[i]||0}); }
      /* ground track (dashed) */
      ctx.setLineDash([5,5]); ctx.strokeStyle='rgba(255,90,90,0.35)'; ctx.lineWidth=1.3; ctx.beginPath(); scr.forEach((p,i)=>{ i?ctx.lineTo(p.x,p.gy):ctx.moveTo(p.x,p.gy); }); ctx.stroke(); ctx.setLineDash([]);
      /* vertical altitude stems */
      ctx.strokeStyle='rgba(130,170,230,0.16)'; ctx.lineWidth=1; const stemStep=Math.max(1,Math.floor(N/30)); for(let i=0;i<N;i+=stemStep){ ctx.beginPath(); ctx.moveTo(scr[i].x,scr[i].gy); ctx.lineTo(scr[i].x,scr[i].y); ctx.stroke(); }
      /* the arc, coloured by altitude, drawn up to prog */
      const upto=Math.max(1,Math.floor((N-1)*prog)); ctx.lineWidth=3.4; ctx.lineCap='round';
      for(let i=1;i<=upto;i++){ ctx.beginPath(); ctx.moveTo(scr[i-1].x,scr[i-1].y); ctx.lineTo(scr[i].x,scr[i].y); ctx.strokeStyle=altColor(scr[i].alt/apo); ctx.stroke(); }
      /* launch + impact markers on the ground */
      const dot=(p,col)=>{ ctx.beginPath(); ctx.arc(p.x,p.gy,4,0,7); ctx.fillStyle=col; ctx.fill(); ctx.strokeStyle='#fff'; ctx.lineWidth=1.4; ctx.stroke(); };
      dot(scr[0],'#34c759'); dot(scr[N-1],'#ff3b30');
      /* warhead marker at prog */
      const wi=Math.min(N-1,Math.round((N-1)*prog)), wp=scr[wi]; if(wp){
        const g2=ctx.createRadialGradient(wp.x,wp.y,1,wp.x,wp.y,15); g2.addColorStop(0,'rgba(255,220,120,0.7)'); g2.addColorStop(1,'rgba(255,220,120,0)'); ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(wp.x,wp.y,15,0,7); ctx.fill();
        ctx.beginPath(); ctx.arc(wp.x,wp.y,5,0,7); ctx.fillStyle='#fff'; ctx.fill(); ctx.strokeStyle='#ff453a'; ctx.lineWidth=2.5; ctx.stroke();
        if(prog<1){ ctx.font='700 10px sans-serif'; ctx.fillStyle='#e8f0ff'; ctx.textAlign='left'; ctx.fillText(Math.round(wp.alt).toLocaleString()+' km', wp.x+10, wp.y-6); } }
    }
    function animate(secs,done){ cancelAnimationFrame(raf); const t0=performance.now(), dur=Math.max(4,secs||16)*1000;
      const fr=now=>{ if(!data) return; const t=Math.min(1,(now-t0)/dur); prog=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2; draw(); if(t<1){ raf=requestAnimationFrame(fr); } else { prog=1; draw(); if(done) done(); } }; raf=requestAnimationFrame(fr); }
    return { show, hide, animate, draw }; })();
};

window.IntMapModules.objectList=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const removePin=HOST.removePin, refreshTool=HOST.refreshTool, makeDraggable=HOST.makeDraggable, isMobile=HOST.isMobile;
  window.IntMapObjects=(function(){
    if(!GE().hasRenderer()||!GE().hasRenderer()) return { open(){}, close(){}, toggle(){}, refresh(){}, count(){ return 0; } };
    const OL=window.IntMapLang.pick(()=>HOST.lang);
    const labels={}, hiddenUp={};   /* labels: rename side-store for objects with no native name; hiddenUp: upload sid→hidden */
    let panel=null, fab=null, openState=false;
    const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    function srcFeats(id){ try{ const d=GE().layers.sourceData(id); return (d&&d.features)||[]; }catch(_){ return []; } }
    function fitFeats(feats){ try{ let a=180,b=90,c=-180,d=-90; const eat=co=>{ if(typeof co[0]==='number'){ if(co[0]<a)a=co[0]; if(co[1]<b)b=co[1]; if(co[0]>c)c=co[0]; if(co[1]>d)d=co[1]; } else co.forEach(eat); };
      feats.forEach(f=>{ if(f&&f.geometry&&f.geometry.coordinates) eat(f.geometry.coordinates); });
      if(isFinite(a)&&c>=a){ if(a===c&&b===d) GE().camera.flyTo({center:[a,b],zoom:Math.max(GE().camera.getZoom(),12),duration:800}); else GE().camera.fitBounds([[a,b],[c,d]],{padding:70,maxZoom:14,duration:800}); } }catch(_){} }
    /* one normalised object list gathered live from every subsystem */
    function collect(){ const out=[];
      try{ (HOST.userPins||[]).forEach((p,i)=>out.push({ id:p.id, kind:'pin', dot:'#ff3b30', name:labels[p.id]||(OL('Pin','ピン','Pin','Метка','Pin')+' '+(i+1)),
        focus:()=>GE().camera.flyTo({center:[p.lng,p.lat],zoom:Math.max(GE().camera.getZoom(),13),duration:800}), rename:v=>{ labels[p.id]=v; }, remove:()=>{ try{ removePin(p.id); }catch(_){} } })); }catch(_){}
      try{ (HOST.radiusItems||[]).forEach(c=>out.push({ id:c.id, kind:'radius', dot:c.color, color:c.color, name:labels[c.id]||(c.radiusKm+' km '+OL('radius','半径','Radius','радиус','radio')),
        focus:()=>GE().camera.flyTo({center:c.center,duration:800}), rename:v=>{ labels[c.id]=v; }, setColor:col=>{ c.color=col; try{ refreshTool(); }catch(_){} }, remove:()=>{ try{ window.removeRadiusItem(c.id); }catch(_){} } })); }catch(_){}
      try{ const IA=window.IntMapAnnotations; ((IA&&IA._items)||[]).forEach(it=>out.push({ id:it.id, kind:'annot', dot:it.color, color:it.color, name:it.name||OL('Drawing','図形','Zeichnung','Фигура','Dibujo'),
        focus:()=>{ if(it.geom) fitFeats([{geometry:it.geom}]); }, rename:v=>{ it.name=v; }, setColor:col=>{ it.color=col; try{ IA.refresh&&IA.refresh(); }catch(_){} }, remove:()=>{ try{ IA.remove(it.id); }catch(_){} } })); }catch(_){}
      try{ const GU=window.GeoJSONUpload; ((GU&&GU._items)||[]).forEach(it=>{ const oid='up_'+it.n; out.push({ id:oid, kind:'upload', dot:it.col, color:it.col, name:labels[oid]||it.name||'GeoJSON', hidden:!!hiddenUp[it.sid],
        focus:()=>fitFeats(srcFeats(it.sid)), rename:v=>{ labels[oid]=v; },
        setColor:col=>{ it.col=col; ['-fill','-line','-pt'].forEach((sfx,k)=>{ const L=it.sid+sfx; try{ if(GE().layers.has(L)) GE().layers.setPaint(L, k===0?'fill-color':k===1?'line-color':'circle-color', col); }catch(_){} }); },
        toggleHide:()=>{ hiddenUp[it.sid]=!hiddenUp[it.sid]; const v=hiddenUp[it.sid]?'none':'visible'; ['-fill','-line','-pt'].forEach(sfx=>{ const L=it.sid+sfx; try{ if(GE().layers.has(L)) GE().layers.setLayout(L,'visibility',v); }catch(_){} }); },
        remove:()=>{ try{ if(GU.remove) GU.remove(it.n); }catch(_){} } }); }); }catch(_){}
      try{ const rf=srcFeats('imroute-src').filter(f=>f.geometry&&f.geometry.type==='LineString'); if(rf.length) out.push({ id:'route', kind:'route', dot:'#1a73e8', name:OL('Route','経路','Route','Маршрут','Ruta'),
        focus:()=>fitFeats(rf), remove:()=>{ try{ window.IntMapRouting&&window.IntMapRouting.clear(); }catch(_){} } }); }catch(_){}
      try{ const isf=srcFeats('im-iso-src'); if(isf.length) out.push({ id:'iso', kind:'iso', dot:'#0a84ff', name:OL('Reachable area','到達圏','Erreichbarkeit','Зона доступности','Área alcanzable'),
        focus:()=>fitFeats(isf), remove:()=>{ try{ window.IntMapIsochrone&&window.IntMapIsochrone.clear(); }catch(_){} } }); }catch(_){}
      /* (#R120) Atlas-drawn polygons + the active place outline join the universal inventory, so "さっき
         描いたやつ" resolves via objectIds and they can be renamed/recoloured/deleted like everything else. */
      try{ const HP=window._imHlPolys; ((HP&&HP.list())||[]).forEach((p,i)=>{ const pid=HP.tagId(p); if(!pid) return;
        out.push({ id:pid, kind:'poly', dot:p.color||'#ff9500', color:p.color||'#ff9500', name:labels[pid]||p.name||(OL('Polygon','ポリゴン','Polygon','Полигон','Polígono')+' '+(i+1)),
          focus:()=>{ if(p.geo) fitFeats([{geometry:p.geo}]); }, rename:v=>{ labels[pid]=v; },
          setColor:col=>{ p.color=col; try{ HP.repaint(); }catch(_){} },
          remove:()=>{ try{ HP.remove(pid); }catch(_){} } }); }); }catch(_){}
      try{ const OT=window.IntMapOutline, cur=OT&&OT.current&&OT.current(); if(cur) out.push({ id:'outline', kind:'outline', dot:'#0a84ff',
        name:labels.outline||cur.name||OL('Boundary outline','行政界アウトライン','Grenzumriss','Контур границы','Contorno'),
        focus:()=>{ try{ OT.focus&&OT.focus(); }catch(_){} }, rename:v=>{ labels.outline=v; }, remove:()=>{ try{ OT.clear(); }catch(_){} } }); }catch(_){}
      return out; }
    function count(){ try{ return collect().length; }catch(_){ return 0; } }
    const ICON={ pin:'📍', radius:'⭕', annot:'✏️', poly:'⬠', outline:'▢', upload:'📂', route:'🧭', iso:'🎯' };
    function kindLbl(k){ return ({ pin:OL('Pins','ピン','Pins','Метки','Pines'), radius:OL('Radius circles','半径円','Radien','Радиусы','Radios'), annot:OL('Drawings','図形','Zeichnungen','Фигуры','Dibujos'), poly:OL('Polygons','ポリゴン','Polygone','Полигоны','Polígonos'), outline:OL('Boundary outline','行政界アウトライン','Grenzumriss','Контур границы','Contorno'), upload:OL('Uploaded data','アップロードデータ','Uploads','Загрузки','Cargas'), route:OL('Route','経路','Route','Маршрут','Ruta'), iso:OL('Reachable area','到達圏','Erreichbarkeit','Доступность','Alcanzable') })[k]||k; }
    let _objs=[];
    function renderList(){ if(!panel) return; const body=panel.querySelector('.iol-body'); if(!body) return;
      _objs=collect(); const order=['pin','radius','annot','poly','outline','upload','route','iso']; const groups={}; _objs.forEach(o=>{ (groups[o.kind]=groups[o.kind]||[]).push(o); });   /* (#R120) + poly/outline */
      if(!_objs.length){ body.innerHTML='<div style="color:var(--text-muted);font-size:12px;padding:14px 4px;line-height:1.6;">'+OL('No objects yet. Drop a pin, draw, add a radius, upload GeoJSON, or make a route — they all show up here to manage in one place.','まだオブジェクトがありません。ピン・図形・半径・GeoJSON・経路を作ると、ここで一括管理できます。','Noch keine Objekte.','Пока нет объектов.','Aún no hay objetos.')+'</div>'; return; }
      let h=''; order.forEach(k=>{ const g=groups[k]; if(!g||!g.length) return;
        h+='<div class="iol-grp"><span>'+ICON[k]+' '+esc(kindLbl(k))+'</span><span style="color:var(--text-muted);font-weight:600;">'+g.length+'</span></div>';
        g.forEach(o=>{ const i=_objs.indexOf(o);
          h+='<div class="iol-row" data-i="'+i+'">'
            +'<span class="iol-dot" style="background:'+esc(o.dot||'#888')+';"></span>'
            +'<span class="iol-name" data-act="focus" title="'+esc(OL('Fly to','移動','Anfliegen','Перейти','Ir'))+'">'+esc(o.name)+'</span>'
            +(o.setColor?('<label class="iol-ic" title="'+esc(OL('Color','色','Farbe','Цвет','Color'))+'"><input type="color" value="'+esc(o.color||'#888888')+'" data-act="color"></label>'):'')
            +(o.toggleHide?('<button class="iol-ic" data-act="hide" title="'+esc(OL('Show / hide','表示切替','Ein/Aus','Показать/скрыть','Mostrar/ocultar'))+'">'+(o.hidden?'🙈':'👁')+'</button>'):'')
            +'<button class="iol-ic" data-act="focus" title="'+esc(OL('Fly to','移動','Anfliegen','Перейти','Ir'))+'">◎</button>'
            +(o.rename?('<button class="iol-ic" data-act="rename" title="'+esc(OL('Rename','名称変更','Umbenennen','Переименовать','Renombrar'))+'">✎</button>'):'')
            +'<button class="iol-ic iol-del" data-act="del" title="'+esc(OL('Delete','削除','Löschen','Удалить','Eliminar'))+'">✕</button>'
          +'</div>'; });
      });
      body.innerHTML=h; }
    function ensurePanel(){ if(panel) return panel;
      panel=document.createElement('div'); panel.id='iol-panel';
      /* (#R124) the Objects panel must be OPAQUE ("Objects popupは無条件で透過しないように") — it used the
         semi-transparent --popup-bg (0.72/0.74 alpha) with NO backdrop blur, so the map showed straight through.
         Use the solid --card-bg (#fff / #1c1c1e). */
      panel.style.cssText='position:fixed;left:16px;top:80px;width:min(330px,92vw);max-height:74vh;z-index:1402;display:none;flex-direction:column;background:var(--card-bg,#1c1c1e);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:15px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
      panel.innerHTML='<div class="iol-head" style="flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--input-bg);cursor:move;"><span style="flex:1;font-size:13px;font-weight:700;color:var(--text-main);">🗂 '+esc(OL('Objects','オブジェクト一覧','Objekte','Объекты','Objetos'))+'</span><button class="iol-clear" style="border:none;background:transparent;color:var(--info-mil,#ff3b30);font-size:11px;font-weight:700;cursor:pointer;">'+esc(OL('Clear all','全消去','Alles löschen','Очистить','Borrar todo'))+'</button><button class="iol-close" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;">✕</button></div>'
        +'<div class="iol-body" style="flex:1 1 auto;overflow-y:auto;padding:6px 10px 12px;"></div>';
      document.body.appendChild(panel);
      if(!document.getElementById('iol-css')){ const st=document.createElement('style'); st.id='iol-css';
        st.textContent='#iol-panel .iol-grp{display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:700;color:var(--text-main);text-transform:uppercase;letter-spacing:.03em;padding:9px 3px 4px;}'
          +'#iol-panel .iol-row{display:flex;align-items:center;gap:6px;padding:4px 3px;border-top:1px solid rgba(128,128,128,0.12);}'
          +'#iol-panel .iol-dot{flex:0 0 auto;width:11px;height:11px;border-radius:50%;border:1.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.15);}'
          +'#iol-panel .iol-name{flex:1;min-width:0;font-size:12.5px;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;}'
          +'#iol-panel .iol-ic{flex:0 0 auto;width:26px;height:26px;border:none;background:transparent;color:var(--text-muted);font-size:13px;cursor:pointer;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;padding:0;}'
          +'#iol-panel .iol-ic:hover{background:var(--input-bg);color:var(--text-main);}'
          +'#iol-panel .iol-ic input[type=color]{width:16px;height:16px;border:none;background:none;padding:0;cursor:pointer;}'
          +'#iol-panel .iol-del:hover{color:#fff;background:var(--info-mil,#ff3b30);}'
          +'#iol-fab{position:fixed;left:16px;bottom:104px;z-index:1401;display:none;align-items:center;gap:6px;height:38px;padding:0 13px;border:none;border-radius:19px;background:var(--card-bg,#1c1c1e);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.3));box-shadow:0 6px 20px rgba(0,0,0,0.35);font-size:13px;font-weight:700;cursor:pointer;}';
        document.head.appendChild(st); }
      panel.querySelector('.iol-close').onclick=()=>close();
      panel.querySelector('.iol-clear').onclick=()=>{ if(!_objs.length) return; _objs.slice().forEach(o=>{ try{ o.remove&&o.remove(); }catch(_){} }); setTimeout(renderList,60); };
      panel.querySelector('.iol-body').addEventListener('click',e=>{ const row=e.target.closest&&e.target.closest('.iol-row'); if(!row) return; const o=_objs[+row.getAttribute('data-i')]; if(!o) return; const act=(e.target.getAttribute&&e.target.getAttribute('data-act'))||(e.target.closest('[data-act]')&&e.target.closest('[data-act]').getAttribute('data-act'));
        if(act==='focus'){ try{ o.focus&&o.focus(); }catch(_){} }
        else if(act==='del'){ try{ o.remove&&o.remove(); }catch(_){} setTimeout(renderList,60); }
        else if(act==='hide'){ try{ o.toggleHide&&o.toggleHide(); }catch(_){} renderList(); }
        else if(act==='rename'){ const cur=o.name; const v=window.prompt(OL('New name','新しい名前','Neuer Name','Новое имя','Nuevo nombre'),cur); if(v!=null&&v.trim()){ try{ o.rename&&o.rename(v.trim()); }catch(_){} renderList(); } } });
      panel.querySelector('.iol-body').addEventListener('input',e=>{ if(!(e.target.getAttribute&&e.target.getAttribute('data-act')==='color')) return; const row=e.target.closest('.iol-row'); const o=row&&_objs[+row.getAttribute('data-i')]; if(o&&o.setColor){ try{ o.setColor(e.target.value); }catch(_){} const dot=row.querySelector('.iol-dot'); if(dot) dot.style.background=e.target.value; } });
      try{ if(typeof makeDraggable==='function') makeDraggable(panel,panel.querySelector('.iol-head')); }catch(_){}
      return panel; }
    function ensureFab(){ if(fab) return fab; ensurePanel(); fab=document.createElement('button'); fab.id='iol-fab';
      fab.innerHTML='🗂 <span class="iol-fab-n">0</span>'; fab.title=OL('Manage all map objects','地図上のオブジェクトを管理','Objekte verwalten','Управление объектами','Gestionar objetos');
      fab.onclick=()=>toggle(); document.body.appendChild(fab); return fab; }
    /* (#R130) Drive BOTH the top-right toolbar button (#btn-tool-objects, desktop/normal) and the legacy bottom-left
       FAB (#iol-fab, now mobile-only since the top-right toolbar is hidden on phones). Both show only when >=1 object
       exists — a faithful relocation of the FAB's visibility, not a behaviour change. */
    function tickFab(){ try{ ensureFab(); const n=count();
      const ns=fab.querySelector('.iol-fab-n'); if(ns) ns.textContent=n;
      const tb=document.getElementById('btn-tool-objects');
      if(tb){ if(!tb.__wired){ tb.__wired=1; tb.onclick=()=>toggle(); tb.title=OL('Manage all map objects','地図上のオブジェクトを管理','Objekte verwalten','Управление объектами','Gestionar objetos'); }
        const tn=document.getElementById('tool-objects-n'); if(tn) tn.textContent=(n>0?n:'');
        tb.classList.toggle('tool-on', !!(openState&&panel&&panel.style.display!=='none'));
        tb.style.display=(n>0)?'inline-flex':'none'; }
      const mob=(typeof isMobile==='function'?isMobile():true);
      fab.style.display=(n>0&&!openState&&mob)?'inline-flex':'none'; }catch(_){} }
    /* (#R132) place the panel DIRECTLY BELOW the button that opened it (was hard-pinned to the top-LEFT at
       left:16px;top:80px while its trigger — #btn-tool-objects — sits top-RIGHT, so the popup appeared far from the
       button: "ボタンの直下にポップアップが出るように"). Anchor right-aligned under the toolbar button on desktop, just
       above the bottom-left FAB on mobile. Respect a user-dragged panel (data-dragged) and clamp on-screen. */
    function _placePanel(){ try{ if(!panel||panel.hasAttribute('data-dragged')) return;
      const w=Math.min(330, window.innerWidth*0.92);
      const tb=document.getElementById('btn-tool-objects');
      if(tb&&tb.offsetParent!==null){ const r=tb.getBoundingClientRect();
        let right=Math.max(6, window.innerWidth-r.right);
        if(right+w>window.innerWidth-6) right=Math.max(6, window.innerWidth-w-6);
        panel.style.left='auto'; panel.style.right=right+'px'; panel.style.top=Math.round(r.bottom+8)+'px'; panel.style.bottom='auto'; return; }
      const fb=document.getElementById('iol-fab');
      if(fb&&fb.offsetParent!==null){ const r=fb.getBoundingClientRect();
        panel.style.left='16px'; panel.style.right='auto'; panel.style.top='auto'; panel.style.bottom=Math.round(Math.max(6, window.innerHeight-r.top+8))+'px'; return; }
      panel.style.left='16px'; panel.style.right='auto'; panel.style.top='80px'; panel.style.bottom='auto'; }catch(_){} }
    function open(){ ensurePanel(); renderList(); _placePanel(); panel.style.display='flex'; openState=true; tickFab(); }
    function close(){ if(panel) panel.style.display='none'; openState=false; tickFab(); }
    function toggle(){ (openState&&panel&&panel.style.display!=='none')?close():open(); }
    function refresh(){ if(openState) renderList(); tickFab(); }
    setInterval(tickFab, 2200); setTimeout(tickFab, 1500);
    /* (#R118) PUBLIC object API — Atlas can enumerate and operate on every map-object ("2番目の円を消して"):
       list() = sanitized inventory; get(id) = live handle (focus/rename/remove/setColor); remove/focus/rename
       are id-based conveniences. The ids also appear in Atlas's state context. */
    function list(){ try{ return collect().map((o,i)=>({ id:String(o.id), kind:o.kind, name:o.name, color:o.color||null, hidden:!!o.hidden, index:i })); }catch(_){ return []; } }
    function get(id){ try{ return collect().find(o=>String(o.id)===String(id))||null; }catch(_){ return null; } }
    function removeObj(id){ const o=get(id); if(o&&o.remove){ try{ o.remove(); refresh(); return true; }catch(_){} } return false; }
    function focusObj(id){ const o=get(id); if(o&&o.focus){ try{ o.focus(); return true; }catch(_){} } return false; }
    function renameObj(id,v){ const o=get(id); if(o&&o.rename){ try{ o.rename(String(v||'').slice(0,60)); refresh(); return true; }catch(_){} } return false; }
    return { open, close, toggle, refresh, count, list, get, remove:removeObj, focus:focusObj, rename:renameObj }; })();
};
