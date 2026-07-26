/* ============================================================================
 *  IntMap · Elevation profile panel  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.elevationProfile=function(map,HOST){
  async function demSampleAll(points, z, timeoutMs, onProgress){ await HOST.warmDEMTiles(points, z, timeoutMs, onProgress); return points.map(p=>{ if(!p) return null; const v=HOST.demElevAt(p[0],p[1],null,z); return (v==null)?null:v; }); }
  /* ===== (#R9b/#46) Elevation cross-section under a measured line (area uses its perimeter). Below 0 m
     gets a faint blue band so sub-sea segments are obvious. Samples the cached terrarium DEM. ===== */
  /* (#R11) Map cursor that mirrors the hovered point on the elevation chart. */
  /* (#R171) source + layer through IntMapGeoEngine — this file no longer names the renderer.
     canDraw() rather than ready(): adding a layer only needs a parsed style (#R170). */
  function _elevCursor(coord){ try{ const E=window.IntMapGeoEngine; if(!E) return;
    if(!E.layers.hasSource('elev-cursor')){ if(!E.canDraw()) return;
      E.layers.addSource('elev-cursor',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      E.layers.add({id:'elev-cursor-pt',type:'circle',source:'elev-cursor',paint:{'circle-radius':7,'circle-color':'#ff3b30','circle-opacity':0.55,'circle-stroke-color':'#fff','circle-stroke-width':2}}); }
    E.layers.setSourceData('elev-cursor',{type:'FeatureCollection',features:coord?[{type:'Feature',geometry:{type:'Point',coordinates:coord},properties:{}}]:[]}); }catch(_){} }
  function _openProfilePanel(samples,dist){
    let p=document.getElementById('elev-profile-panel');
    if(!p){ p=document.createElement('div'); p.id='elev-profile-panel'; p.className='tool-panel'; (document.getElementById('map-container')||document.body).appendChild(p); }
    p.style.cssText='display:block;left:50%;top:auto;bottom:26px;right:auto;transform:translateX(-50%);width:min(560px,calc(100vw - 40px));z-index:1600;';
    const j=HOST.lang==='jp';
    p.innerHTML='<div class="tp-header"><span class="tp-title">📈 '+(j?'標高断面':'Elevation profile')+'</span><button class="tp-close" title="'+HOST.t('close')+'">✕</button></div><div id="elev-profile-body" style="font-size:12px;color:var(--text-muted);padding:8px 2px;">'+(j?'標高を取得中…':'Sampling elevation…')+'</div>';
    p.querySelector('.tp-close').onclick=()=>{ p.style.display='none'; _elevCursor(null); };
    try{ HOST.makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
    /* (#R12) Sample the LOCAL terrarium DEM (includes ocean bathymetry → negative below sea level) so
       the profile is drawn under water too, instead of Open-Meteo elevation which returns 0 over sea. */
    const _z=HOST._demZoomForSpan(dist[dist.length-1]||50);
    demSampleAll(samples,_z).then(els=>{ _drawProfile(p.querySelector('#elev-profile-body'), samples, dist, els); });
  }
  function _drawProfile(box, samples, dist, els){
    if(!box) return; const j=HOST.lang==='jp';
    const known=els.filter(e=>e!=null && !isNaN(e));
    if(!known.length){ box.textContent=j?'標高データを取得できませんでした':'No elevation data available'; return; }
    let minE=Math.min(...known,0), maxE=Math.max(...known,0); if(maxE===minE) maxE=minE+1;
    const cont=document.getElementById('map-container')||document.body;
    const W=Math.min(520, Math.max(280, cont.clientWidth-60)), H=176, padL=46,padR=10,padT=12,padB=26;
    const total=dist[dist.length-1]||1;
    const X=i=>padL+(dist[i]/total)*(W-padL-padR);
    const Y=e=>padT+(1-(e-minE)/(maxE-minE))*(H-padT-padB);
    let dPath=''; for(let i=0;i<els.length;i++){ const e=els[i]; if(e==null||isNaN(e)) continue; dPath+=(dPath?'L':'M')+X(i).toFixed(1)+' '+Y(e).toFixed(1)+' '; }
    const y0=Y(0);
    const area=dPath?('M'+X(0).toFixed(1)+' '+y0.toFixed(1)+' '+dPath.replace(/^M/,'L')+'L'+X(els.length-1).toFixed(1)+' '+y0.toFixed(1)+' Z'):'';
    /* (#R12) Blue water band drawn OVER the green fill so sub-sea terrain reads as underwater. */
    const seaBand=(minE<0)?'<rect x="'+padL+'" y="'+y0.toFixed(1)+'" width="'+(W-padL-padR)+'" height="'+Math.max(0,(H-padB-y0)).toFixed(1)+'" fill="rgba(38,118,200,0.30)"/>':'';
    /* (#R13c) unit-aware compact labels for the elevation profile (imperial → ft / mi). */
    const _um=(typeof HOST.unitMode!=='undefined')?HOST.unitMode:'both';
    const elevC=(m)=>_um==='imperial'?(Math.round(m*3.28084).toLocaleString()+' ft'):(Math.round(m).toLocaleString()+' m');
    const distC=(km)=>_um==='imperial'?((km*0.621371).toFixed(km*0.621371<10?1:0)+' mi'):(km.toFixed(km<10?1:0)+' km');
    const svg='<svg id="elev-svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" style="display:block;max-width:100%;cursor:crosshair;">'
      +(area?'<path d="'+area+'" fill="rgba(120,170,90,0.28)"/>':'')
      +seaBand
      +'<line x1="'+padL+'" y1="'+y0.toFixed(1)+'" x2="'+(W-padR)+'" y2="'+y0.toFixed(1)+'" stroke="rgba(40,120,200,0.85)" stroke-dasharray="3 3"/>'
      +(dPath?'<path d="'+dPath+'" fill="none" stroke="#5aa02c" stroke-width="1.6"/>':'')
      +'<line id="elev-vline" x1="0" y1="'+padT+'" x2="0" y2="'+(H-padB)+'" stroke="#ff3b30" stroke-width="1" style="display:none;"/>'
      +'<circle id="elev-vdot" r="3.5" fill="#ff3b30" stroke="#fff" stroke-width="1.5" style="display:none;"/>'
      +'<text x="3" y="'+(Y(maxE)+3).toFixed(1)+'" font-size="9" fill="currentColor">'+elevC(maxE)+'</text>'
      +'<text x="3" y="'+(Y(minE)).toFixed(1)+'" font-size="9" fill="currentColor">'+elevC(minE)+'</text>'
      +(minE<0?'<text x="3" y="'+(y0-2).toFixed(1)+'" font-size="9" fill="rgba(60,140,210,1)">0</text>':'')
      +'</svg>';
    box.innerHTML=svg+'<div id="elev-readout" style="display:flex;justify-content:space-between;color:var(--text-muted);font-size:10.5px;margin-top:2px;"><span>'+distC(0)+'</span><span id="elev-hover" style="color:var(--text-main);font-weight:600;"></span><span>'+distC(total)+'</span></div>';
    /* Hover: vertical cursor on the chart + a synced marker on the map (#R11). */
    const svgEl=box.querySelector('#elev-svg'), vline=box.querySelector('#elev-vline'), vdot=box.querySelector('#elev-vdot'), hov=box.querySelector('#elev-hover');
    if(svgEl){ const move=(ev)=>{ const r=svgEl.getBoundingClientRect(); const cx=ev.touches?ev.touches[0].clientX:ev.clientX; let xv=(cx-r.left)/r.width*W; xv=Math.max(padL,Math.min(W-padR,xv)); const frac=(xv-padL)/(W-padL-padR); let idx=Math.round(frac*(samples.length-1)); idx=Math.max(0,Math.min(samples.length-1,idx)); const e=els[idx];
        vline.setAttribute('x1',X(idx)); vline.setAttribute('x2',X(idx)); vline.style.display='block';
        if(e!=null&&!isNaN(e)){ vdot.setAttribute('cx',X(idx)); vdot.setAttribute('cy',Y(e)); vdot.style.display='block'; if(hov) hov.textContent=distC(dist[idx])+' · '+elevC(e)+(e<0?' '+(j?'(海中)':'(below sea)'):''); }
        _elevCursor(samples[idx]); };
      svgEl.addEventListener('mousemove',move); svgEl.addEventListener('touchmove',move,{passive:true});
      svgEl.addEventListener('mouseleave',()=>{ vline.style.display='none'; vdot.style.display='none'; if(hov) hov.textContent=''; _elevCursor(null); });
    }
  }
  return { _openProfilePanel };
};
