/* ============================================================================
 *  IntMap · Street View panel + real coverage — IntMapStreetView  (#R163)
 * ----------------------------------------------------------------------------
 *  The keyless embedded Street View window plus the svv coverage overlay and the pixel-sampling
 *  nearest-coverage probe (#R140/#R145).
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R163). The values it used
 *  to inherit from that closure are now passed in explicitly — see Architecture.md §3.1.
 *   Reassigned at runtime, so read LIVE through HOST (never captured):
 *      currentLang -> HOST.lang
 *  Never rebound, so bound once under the original name:
 *      bringToFront, imToast, makeDraggable
 * 
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.streetView=function(HOST){
  /* (#R173) 脱MapLibre 第7段階 — this module is written against the engine facade, never the raw renderer.
     Every call below already existed in the contract (#R152/#R160/#R161); the parameter is kept only
     because the factory signature is shared by all module files. */
  const GE=()=>window.IntMapGeoEngine;
  const bringToFront=HOST.bringToFront, imToast=HOST.imToast, makeDraggable=HOST.makeDraggable;
  return (function(){
    const LL=window.IntMapLang.pick(()=>HOST.lang);
    let panel=null, iframe=null;
    function ensure(){ if(panel) return panel;
      panel=document.createElement('div'); panel.id='streetview-panel';
      /* (#R140) UNCONDITIONALLY OPAQUE ("ストリートビューのポップアップは無条件で透過しないで"): the base was
         var(--popup-bg)=rgba(…,0.72/0.74) with NO backdrop-filter, so the live map bled through the head/nav
         chrome. Use the fully-opaque --card-bg (#fff / #1c1c1e) so nothing behind the panel shows through — the
         head/nav's own translucent --input-bg now composits over this solid base, not over the map. */
      panel.style.cssText='position:fixed;right:16px;bottom:64px;width:min(480px,92vw);height:min(360px,54vh);z-index:1400;display:none;flex-direction:column;background:var(--card-bg,#111);border:1px solid var(--glass-border,rgba(128,128,128,0.3));border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.45);';
      panel.innerHTML='<div class="sv-head" style="flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:7px 11px;background:var(--input-bg);cursor:move;">'
        +'<span class="sv-title" style="flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🧍 '+LL('Street View','ストリートビュー','Street View','Просмотр улиц','Street View')+'</span>'
        +'<button class="sv-ext" title="'+LL('Open in Google Maps','Googleマップで開く','In Google Maps öffnen','Открыть в Google Maps','Abrir en Google Maps')+'" style="border:none;background:transparent;color:var(--text-muted);font-size:15px;cursor:pointer;padding:2px 4px;">↗</button>'
        +'<button class="sv-close" title="'+LL('Close','閉じる','Schließen','Закрыть','Cerrar')+'" style="border:none;background:transparent;color:var(--text-muted);font-size:16px;cursor:pointer;padding:2px 4px;">×</button></div>'
        /* (#R85b) heading controls — turn the view; the map marker's cone points the same way so you always see on the map which way you are looking */
        +'<div class="sv-nav" style="flex:0 0 auto;display:flex;align-items:center;gap:5px;padding:5px 9px;background:var(--input-bg);border-top:1px solid rgba(128,128,128,0.14);">'
          +'<button class="sv-turn-l" title="'+LL('Turn left','左を向く','Nach links','Влево','Izquierda')+'" style="border:none;background:var(--popup-bg,#222);color:var(--text-main);border-radius:7px;width:30px;height:26px;cursor:pointer;font-size:13px;">↺</button>'
          +'<span class="sv-hdg" style="flex:1;text-align:center;font-size:12px;font-weight:600;color:var(--text-main);min-width:52px;">N&nbsp;0°</span>'
          +'<button class="sv-turn-r" title="'+LL('Turn right','右を向く','Nach rechts','Вправо','Derecha')+'" style="border:none;background:var(--popup-bg,#222);color:var(--text-main);border-radius:7px;width:30px;height:26px;cursor:pointer;font-size:13px;">↻</button>'
          +'<span style="width:1px;height:18px;background:rgba(128,128,128,0.3);flex:0 0 auto;margin:0 2px;"></span>'
          +'<button class="sv-back" title="'+LL('Step back','後退','Zurück','Назад','Atrás')+'" style="border:none;background:var(--popup-bg,#222);color:var(--text-main);border-radius:7px;width:30px;height:26px;cursor:pointer;font-size:13px;">▼</button>'
          +'<button class="sv-fwd" title="'+LL('Step forward','前進','Vorwärts','Вперёд','Adelante')+'" style="border:none;background:var(--primary-color);color:#fff;border-radius:7px;width:34px;height:26px;cursor:pointer;font-size:13px;font-weight:700;">▲</button>'
          +'<span style="font-size:9px;color:var(--text-muted);flex:0 0 auto;line-height:1.15;">'+LL('move here<br>= map syncs','移動＝<br>地図同期','bewegen<br>= Karte','движение<br>= карта','mover<br>= mapa')+'</span>'
        +'</div>'
        +'<div class="sv-body" style="flex:1 1 auto;position:relative;background:#000;min-height:0;"><iframe class="sv-if" style="width:100%;height:100%;border:0;display:block;" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>'
        +'<div class="sv-hint" style="position:absolute;left:0;right:0;bottom:0;font-size:10px;color:#ddd;background:rgba(0,0,0,0.5);padding:3px 8px;pointer-events:none;">'+LL('Drag to look; use ◀ ▶ to turn (the map shows your facing).','ドラッグで見回し／◀ ▶ で向きを変更（地図に向きを表示）。','Ziehen zum Umsehen; ◀ ▶ zum Drehen.','Тяните; ◀ ▶ — поворот (направление на карте).','Arrastra; ◀ ▶ para girar (dirección en el mapa).')+'</div></div>';
      document.body.appendChild(panel); iframe=panel.querySelector('.sv-if');
      panel.querySelector('.sv-close').onclick=()=>close();   /* (#R151) route through close() so auto-shown coverage is turned off too */
      panel.querySelector('.sv-turn-l').onclick=()=>_rotateHere(-30);
      panel.querySelector('.sv-turn-r').onclick=()=>_rotateHere(30);
      panel.querySelector('.sv-fwd').onclick=()=>_moveHere(1);
      panel.querySelector('.sv-back').onclick=()=>_moveHere(-1);
      try{ if(typeof makeDraggable==='function') makeDraggable(panel,panel.querySelector('.sv-head')); }catch(_){}
      return panel; }
    /* (#R289) the eight points come from js/compass.js — one table, nine languages */
    function _compass(h){ h=((h%360)+360)%360; return window.IntMapCompass.point(h,HOST.lang,8)+'&nbsp;'+Math.round(h)+'°'; }
    /* (#R85) "現在のストリートビュー表示箇所はどこを映しているのか地図上に表示" — a live marker + facing cone on the
       map showing the exact spot (and initial heading) the Street View panel is viewing. Painted INSTANTLY on
       select so there is immediate feedback while Google's embed loads (the embed reload is the only slow part
       and is Google's, not ours; the marker makes point-picking feel responsive again). */
    /* (#R85b) The "where am I looking" indicator is a DOM maplibregl.Marker (NOT a style layer) — it renders
       INSTANTLY without waiting for map.isStyleLoaded() (the old GeoJSON-layer version silently didn't paint when
       the style wasn't ready → "地図上で分からない"), and rotates with the map so its cone always points where the
       panorama faces. */
    let _hereLL=null, _hereHdg=0, _hereMarker=null, _svDragging=false;
    function _hereEl(){ const d=document.createElement('div'); d.style.cssText='width:64px;height:64px;pointer-events:auto;cursor:grab;';
      d.title=LL('Street View viewpoint — drag me to move it','ストリートビューの視点 — ドラッグで移動','Street-View-Standpunkt — ziehen','Точка обзора — тяните','Punto de vista — arrástralo');
      d.innerHTML='<svg width="64" height="64" viewBox="0 0 64 64" style="overflow:visible;display:block;">'
        +'<path d="M32 32 L12 -2 A 38 38 0 0 1 52 -2 Z" fill="rgba(57,179,255,0.34)" stroke="rgba(57,179,255,0.6)" stroke-width="1.2"/>'
        +'<circle cx="32" cy="32" r="15" fill="rgba(57,179,255,0.16)"/>'
        +'<circle cx="32" cy="32" r="7.5" fill="#39b3ff" stroke="#fff" stroke-width="3"/></svg>';
      return d; }
    /* (#R85d) the marker IS the Street-View viewpoint and is DRAGGABLE — drop it anywhere and the panorama reloads
       there, so the map always shows exactly where SV is looking (the keyless Google embed is cross-origin, so we
       drive the position from the map instead of reading it back). */
    function _setHere(lng,lat,hdg){ _hereLL={lng:+lng,lat:+lat}; if(hdg!=null&&isFinite(+hdg)) _hereHdg=((+hdg%360)+360)%360;
      try{ if(!_hereMarker){ _hereMarker=GE().ui.marker({element:_hereEl(),rotationAlignment:'map',pitchAlignment:'map',draggable:true});
          _hereMarker.on('dragstart',()=>{ _svDragging=true; try{ _hereMarker.getElement().style.cursor='grabbing'; }catch(_){} });
          _hereMarker.on('dragend',()=>{ _svDragging=false; try{ _hereMarker.getElement().style.cursor='grab'; }catch(_){} let dp; try{ dp=_hereMarker.getLngLat(); }catch(_){} if(!dp) return;
            /* (#R140) snap the dropped viewpoint onto Google's REAL coverage too, so dragging never strands the marker
               off-pano; if the drop has no coverage nearby, keep it where dropped but say so honestly. */
            _snapPano(dp.lng,dp.lat).then(res=>{ if(res&&res.covered){ _svLinks=res.links||[]; _hereLL={lng:res.lng,lat:res.lat}; try{ if(_hereMarker) _hereMarker.setLngLat([res.lng,res.lat]); }catch(_){} } else{ _svLinks=[]; _hereLL={lng:dp.lng,lat:dp.lat}; if(res&&res.covered===false) _noCoverageToast(); else _coverageUnverifiedToast(); } _reloadEmbed(); }).catch(()=>{ _hereLL={lng:dp.lng,lat:dp.lat}; _coverageUnverifiedToast(); _reloadEmbed(); }); }); }
        if(!_svDragging) _hereMarker.setLngLat([+lng,+lat]); _hereMarker.setRotation(_hereHdg);
        if(!_hereMarker._map){ GE().ui.attach(_hereMarker); } }catch(_){}
      try{ const b=GE().camera.getBounds(); if(b&&!b.contains([+lng,+lat])) GE().camera.easeTo({center:[+lng,+lat],duration:600}); }catch(_){}
      _updHeadingLabel(); }
    function _updHeadingLabel(){ try{ if(panel){ const h=panel.querySelector('.sv-hdg'); if(h) h.innerHTML=_compass(_hereHdg); } }catch(_){} }
    function _reloadEmbed(){ try{ if(iframe&&_hereLL) iframe.src='https://maps.google.com/maps?q=&layer=c&cbll='+(_hereLL.lat).toFixed(6)+','+(_hereLL.lng).toFixed(6)+'&cbp=11,'+_hereHdg+',0,0,0&output=svembed'; }catch(_){} }
    function _rotateHere(delta){ if(!_hereLL) return; _hereHdg=((_hereHdg+delta)%360+360)%360;
      try{ if(_hereMarker) _hereMarker.setRotation(_hereHdg); }catch(_){}
      _reloadEmbed(); _updHeadingLabel(); }
    /* (#R146) AUTHORITATIVE keyless pano snap — Google's GeoPhotoService.SingleImageSearch returns the EXACT nearest
       Street-View panorama (lat/lng + pano id + walkable neighbours) for a point. It is JSONP (a <script> load, NOT a
       fetch) so it needs NO CORS/proxy and is immune to the Apple-Private-Relay / ad-blocker tile-stripping that made
       the svv-pixel sampler return null → raw-click fallback. THE real fix for "クリック地点に置くだけ・Coverageを考慮してない". */
    let _svLinks=[], _jsonpN=0;
    function _bearing(la1,lo1,la2,lo2){ const tr=Math.PI/180, y=Math.sin((lo2-lo1)*tr)*Math.cos(la2*tr), x=Math.cos(la1*tr)*Math.sin(la2*tr)-Math.sin(la1*tr)*Math.cos(la2*tr)*Math.cos((lo2-lo1)*tr); return (Math.atan2(y,x)/tr+360)%360; }
    function _nearestPano(lng,lat){ lng=+lng; lat=+lat; if(!isFinite(lng)||!isFinite(lat)) return Promise.resolve(null);   /* only finite numbers reach the JSONP src — no injection */
      return new Promise(resolve=>{
      const cb='_svp'+(++_jsonpN); let done=false,s=null,tid=null;
      const fin=v=>{ if(done)return; done=true; try{clearTimeout(tid);}catch(_){} try{delete window[cb];}catch(_){ try{window[cb]=undefined;}catch(__){}} try{ if(s&&s.parentNode)s.parentNode.removeChild(s);}catch(_){} resolve(v); };
      window[cb]=res=>{ try{
        if(!res||!res[0]||res[0][0]===5||!res[1]||!res[1][5]||!res[1][5][0]){ fin({covered:false}); return; }   /* [[5,"generic","Search returned no images."]] = no coverage */
        const loc=res[1][5][0][1]&&res[1][5][0][1][0];   /* [null,null,lat,lng] of the nearest pano */
        const plat=loc&&loc[2], plng=loc&&loc[3], pid=(res[1][1]&&res[1][1][1])||null;
        const links=[]; try{ for(const nb of res[1][5][0][3][0]){ const c=nb&&nb[2]&&nb[2][0]; if(c&&isFinite(c[2])&&isFinite(c[3])) links.push({panoId:nb[0]&&nb[0][1], lat:c[2], lng:c[3]}); } }catch(_){}   /* walkable neighbours */
        if(isFinite(plat)&&isFinite(plng)) fin({covered:true,lat:plat,lng:plng,panoId:pid,links}); else fin({covered:false});
      }catch(_){ fin(null); } };
      try{ const pb='!1m5!1sapiv3!5sUS!11m2!1m1!1b0!2m4!1m2!3d'+lat+'!4d'+lng+'!2d50!3m10!2m2!1sen!2sUS!9m1!1e2!11m4!1m3!1e2!2b1!3e2!4m10!1e1!1e2!1e3!1e4!1e8!1e6!5m1!1e2!6m1!1e2';
        s=document.createElement('script'); s.async=true; s.onerror=()=>fin(null);
        s.src='https://maps.googleapis.com/maps/api/js/GeoPhotoService.SingleImageSearch?pb='+pb+'&callback='+cb;
        (document.head||document.documentElement).appendChild(s); tid=setTimeout(()=>fin(null),6000);
      }catch(_){ fin(null); } }); }
    /* snap ladder: authoritative JSONP first, keyless svv-pixel sampler second, undetermined (null) last */
    function _snapPano(lng,lat){ return _nearestPano(lng,lat).then(r=>{ if(r&&(r.covered===true||r.covered===false)) return r; return _nearestCoverage(lng,lat); }).catch(()=>{ try{ return _nearestCoverage(lng,lat); }catch(_){ return null; } }); }
    function _refreshLinks(lng,lat){ try{ _nearestPano(lng,lat).then(r=>{ if(r&&r.covered&&r.links) _svLinks=r.links; }).catch(()=>{}); }catch(_){} }
    /* (#R85b/#R146) step forward/back to the REAL adjacent panorama, not a blind 18 m interpolation ("ボタン押したときの
       移動が単なる移動でクソ"): prefer a walkable neighbour (SingleImageSearch links) whose bearing matches the heading,
       else step a little and SNAP to the nearest real pano so the marker always lands on actual coverage. */
    function _moveHere(sign){ if(!_hereLL) return; const hdg=sign>0?_hereHdg:((_hereHdg+180)%360);
      if(_svLinks&&_svLinks.length){ let best=null,bd=1e9;
        for(const nb of _svLinks){ const b=_bearing(_hereLL.lat,_hereLL.lng,nb.lat,nb.lng); const df=Math.abs(((b-hdg+540)%360)-180); if(df<bd){bd=df;best=nb;} }
        if(best&&bd<70){ _setHere(best.lng,best.lat,_hereHdg); _refreshLinks(best.lng,best.lat); _reloadEmbed(); return; } }
      const stepM=16, R=6378137, tr=Math.PI/180;
      const nlat=_hereLL.lat+((stepM*Math.cos(hdg*tr))/R)/tr;
      const nlng=_hereLL.lng+((stepM*Math.sin(hdg*tr))/(R*Math.max(0.15,Math.cos(_hereLL.lat*tr))))/tr;
      _snapPano(nlng,nlat).then(res=>{ if(res&&res.covered){ if(res.links)_svLinks=res.links; _setHere(res.lng,res.lat,_hereHdg); } else { _svLinks=[]; _setHere(nlng,nlat,_hereHdg); } _reloadEmbed(); }).catch(()=>{ _setHere(nlng,nlat,_hereHdg); _reloadEmbed(); }); }
    function _clearHere(){ _hereLL=null; try{ if(_hereMarker){ _hereMarker.remove(); _hereMarker=null; } }catch(_){} }
    /* (#R140) COVERAGE-AWARE OPEN ("単にユーザーがクリックした地点に置くだけになっており、Coverageを全く考慮していない"):
       a raw click rarely lands exactly on a pano, so the on-map viewpoint marker used to LIE about where the panorama
       is, and clicks with no coverage at all still dropped a bogus marker + a random far snap. open() now consults
       Google's REAL coverage (keyless svv tiles, pixel-sampled by _nearestCoverage) to snap the marker onto the nearest
       covered point, and honestly reports when there is no coverage nearby. _openAt() is the definite-point painter. */
    function _openAt(lng,lat,label,hdg0){ const p=ensure();
      const latS=(+lat).toFixed(6), lngS=(+lng).toFixed(6);
      try{ _setHere(+lng,+lat,hdg0); }catch(_){}
      try{ iframe.src='https://maps.google.com/maps?q=&layer=c&cbll='+latS+','+lngS+'&cbp=11,'+hdg0+',0,0,0&output=svembed'; }catch(_){}
      const t=p.querySelector('.sv-title'); if(t) t.textContent='🧍 '+(label?String(label):(LL('Street View','ストリートビュー','Street View','Просмотр улиц','Street View')))+' · '+latS+', '+lngS;
      const ext=p.querySelector('.sv-ext'); if(ext) ext.onclick=()=>{ try{ window.open('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+latS+','+lngS,'_blank','noopener'); }catch(_){} };
      p.style.display='flex'; try{ if(typeof bringToFront==='function') bringToFront(p); }catch(_){}
      return true; }
    function open(ll,label){ if(!ll||ll.lng==null||!isFinite(+ll.lng)) return false;
      const lng=+ll.lng, lat=+ll.lat, hdg0=(ll.heading!=null&&isFinite(+ll.heading))?((+ll.heading%360)+360)%360:0;
      /* (#R151) "ストリートビューをオンにしている際は、coverageも表示するように" — whenever a panorama is opened,
         auto-show Google's real coverage (the light-blue lines) so the surrounding walkable network is visible.
         Only auto-enable when it was OFF (preserve a user's manual coverage state); close() turns it back off. */
      if(!_cov){ try{ coverage(true); _covAuto=true; }catch(_){} }
      if(ll.noSnap){ return _openAt(lng,lat,label,hdg0); }        /* internal raw path (caller already has a coverage point) */
      try{ _setHere(lng,lat,hdg0); }catch(_){}                    /* instant marker feedback while the pano resolves */
      /* covered → snap the marker AND embed onto the REAL nearest pano (+ store walkable links for forward/back);
         known-uncovered → honest toast, no bogus marker; undetermined (null) → open nearest available but say so. */
      const _resolve=res=>{ if(res&&res.covered){ _svLinks=res.links||[]; _openAt(res.lng,res.lat,label,hdg0); return true; } if(res&&res.covered===false){ _clearHere(); _noCoverageToast(); return true; } return false; };
      const _fallbackHonest=()=>{ _svLinks=[]; _openAt(lng,lat,label,hdg0); _coverageUnverifiedToast(); };   /* (#R142) never a silent "moved to your click" — say coverage is unverified */
      _snapPano(lng,lat).then(res=>{ if(!_resolve(res)) _fallbackHonest(); }).catch(_fallbackHonest);
      return true; }
    function close(){ if(panel){ panel.style.display='none'; try{ iframe.src='about:blank'; }catch(_){} } _clearHere();
      if(_covAuto){ _covAuto=false; try{ coverage(false); }catch(_){} } }   /* (#R151) turn off auto-shown coverage when SV closes (manual coverage stays) */
    /* (#R84/#R140) COVERAGE MODE ("地図上の水色の線、ポイントから選択できるように") — show Google's REAL Street-View
       coverage and let the user click it. R84–R85 approximated coverage by tinting the BASEMAP's own road lines blue,
       but that is NOT where panoramas actually exist ("Coverageを全く考慮していない"): a road with no SV lit up, and a
       covered alley that the basemap lacked stayed dark. We now overlay Google's genuine keyless SV coverage tiles
       (the svv layer) so the blue lines ARE the real panoramas, and clicks snap to them via _nearestCoverage. */
    let _cov=false, _covClick=null, _covHint=null, _covStyled=false, _covAuto=false;   /* (#R151) _covAuto = coverage was auto-enabled by opening SV (restored on close) */
    const _COV_SRC='sv-cov-src', _COV_LYR='sv-cov-lyr';
    const _covTileUrl=(sd)=>'https://mts'+sd+'.google.com/vt?hl=en&src=api&x={x}&y={y}&z={z}&lyrs=svv&style=40,18';
    function addCoverageTiles(){ try{
        if(!GE().layers.hasSource(_COV_SRC)) GE().layers.addSource(_COV_SRC,{type:'raster',tileSize:64,minzoom:0,maxzoom:21,attribution:'Street View coverage © Google',tiles:[_covTileUrl(0),_covTileUrl(1),_covTileUrl(2),_covTileUrl(3)]});   /* (#R154) STILL "太すぎる" after R153's tileSize:128. The svv stroke on screen ≈ nativeStroke × (tileSize/256), so tileSize:64 makes MapLibre fetch the tile THREE zooms deeper and draw its 256px image into a 64px slot → the line is downscaled ~4× (was ~2× at 128) ≈ 0.9px — a true hairline, monotonically thinner than 128 regardless of whether Google serves the deep tile natively or upscaled. */
        if(!GE().layers.has(_COV_LYR)) GE().layers.add({id:_COV_LYR,type:'raster',source:_COV_SRC,paint:{'raster-opacity':0.62,'raster-saturation':0.9,'raster-hue-rotate':-42,'raster-resampling':'linear'}});   /* (#R152) R147's raster-brightness-min:0.5 + raster-contrast:0.15 bloomed the anti-aliased edges → fat; dropped both. raster-resampling:linear keeps the downscaled edges smooth (crisp, not blurry). cyan tint via saturation + hue-rotate. (#R154) raster-opacity 0.9→0.62 so the hairline reads even lighter (geometry unchanged, perceived weight down). */
        return true; }catch(_){ return false; } }
    function removeCoverageTiles(){ try{ GE().layers.remove(_COV_LYR); }catch(_){} try{ GE().layers.removeSource(_COV_SRC); }catch(_){} }
    /* keyless coverage sampling ("Coverageを考慮"): read the svv tile PIXELS around a point and return the nearest
       COVERED lng/lat — {covered:true,lng,lat}, or {covered:false} when none is within the search radius, or null when
       the tiles couldn't be read at all. (#R145) Google's svv tiles do NOT reliably send Access-Control-Allow-Origin, so
       the canvas read is loaded through the _COV_PROX ladder below (direct → our sv-cov ACAO proxy → CORS proxy) to keep
       getImageData un-tainted. Sampled at the CURRENT map zoom (clamped) so the ~R-pixel radius matches the user's
       on-screen click precision at any scale. */
    const _COV_TS=256, _COV_R=115;   /* (#R142) widened search radius so "nearest coverage" actually reaches a nearby road instead of giving up (was 40px → off-road clicks returned no-coverage) */
    function _llToPx(lng,lat,z){ const s=_COV_TS*Math.pow(2,z); const sn=Math.max(-0.9999,Math.min(0.9999,Math.sin(lat*Math.PI/180))); return { x:(lng+180)/360*s, y:(0.5-Math.log((1+sn)/(1-sn))/(4*Math.PI))*s }; }
    function _pxToLl(x,y,z){ const s=_COV_TS*Math.pow(2,z); const n=Math.PI-2*Math.PI*y/s; return { lng:x/s*360-180, lat:180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))) }; }
    /* (#R145) SNAP ROOT-CAUSE FIX: the pixel sampler reads svv tile PIXELS on a <canvas>, which needs the tile to be
       CORS-clean (crossOrigin='anonymous' + Access-Control-Allow-Origin). Google's mts.google.com tiles do NOT reliably
       send ACAO (and Apple Private Relay / ad-blockers / DNS blocklists strip or drop them), so the anonymous <img> load
       is blocked → every tile fails → sampler returns null → caller falls back to the RAW CLICK. The visible raster
       overlay still renders (no CORS needed) so coverage looked present but never snapped — the re-reported bug that
       R140/R142 both built on top of. Ladder: direct first (fast where ACAO IS present), then OUR OWN sv-cov edge
       function which fetches the tile server-side and re-adds ACAO:* (works everywhere, incl. Private Relay), then a
       public CORS proxy as a last resort. If all fail the caller still degrades HONESTLY (no silent raw marker). */
    const _COV_PROX=(function(){ const b=(window.SUPABASE_URL||'').replace(/\/$/,''); return ['', ...(b?[b+'/functions/v1/sv-cov?u=']:[]), 'https://corsproxy.io/?url=']; })();
    /* (#R145b) per-attempt TIMEOUT: an <img> load that neither loads nor errors (a stalled connection / hung proxy)
       would otherwise leave this promise — and thus _nearestCoverage's Promise.all — pending FOREVER, so the Street-View
       marker would never appear (worse than the honest raw-click fallback). Each proxy attempt is capped; on timeout we
       advance to the next proxy, and when the ladder is exhausted we resolve(false) so the sampler always completes. */
    function _loadTile(url,ctx,dx,dy){ return new Promise(res=>{ let tried=0, done=false, tid=null; const im=new Image(); im.crossOrigin='anonymous';
      const fin=v=>{ if(done) return; done=true; try{ clearTimeout(tid); }catch(_){} res(v); };
      const go=()=>{ if(done) return; if(tried>=_COV_PROX.length){ fin(false); return; } const pfx=_COV_PROX[tried++];
        try{ clearTimeout(tid); }catch(_){} tid=setTimeout(()=>{ if(!done) go(); }, 3500);   /* this attempt hung → try the next proxy */
        try{ im.src=pfx?(pfx+encodeURIComponent(url)):url; }catch(_){ go(); } };
      im.onload=()=>{ try{ ctx.drawImage(im,dx,dy); }catch(_){} fin(true); };
      im.onerror=()=>{ if(!done) go(); };
      go(); }); }
    async function _nearestCoverage(lng,lat){ try{
        const z=Math.min(18,Math.max(14,Math.round(GE().camera.getZoom()||14))), n=Math.pow(2,z), R=_COV_R;   /* (#R142) sample at z≥14 so pixels are fine enough that the widened radius stays a sensible metric distance */
        const wp=_llToPx(lng,lat,z), cxp=Math.floor(wp.x), cyp=Math.floor(wp.y); const tx=Math.floor(cxp/_COV_TS), ty=Math.floor(cyp/_COV_TS);
        if(ty<0||ty>=n) return {covered:false};
        const cv=document.createElement('canvas'); cv.width=768; cv.height=768; const ctx=cv.getContext('2d',{willReadFrequently:true});
        const jobs=[]; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const Y=ty+dy; if(Y<0||Y>=n) continue; const X=((tx+dx)%n+n)%n; const sd=(X+Y)%4;
          jobs.push(_loadTile('https://mts'+sd+'.google.com/vt?hl=en&src=api&x='+X+'&y='+Y+'&z='+z+'&lyrs=svv&style=40,18',ctx,(dx+1)*_COV_TS,(dy+1)*_COV_TS)); }
        const oks=await Promise.all(jobs); if(!oks.some(Boolean)) return null;   /* nothing loaded → undetermined, caller falls back */
        let img; try{ img=ctx.getImageData(0,0,768,768); }catch(_){ return null; } const D=img.data;
        const ox=(tx-1)*_COV_TS, oy=(ty-1)*_COV_TS, px=cxp-ox, py=cyp-oy;
        let best=null,bd=R*R+1; const y0=Math.max(0,py-R),y1=Math.min(767,py+R),x0=Math.max(0,px-R),x1=Math.min(767,px+R);
        for(let yy=y0;yy<=y1;yy++){ const row=yy*768; for(let xx=x0;xx<=x1;xx++){ if(D[(row+xx)*4+3]<=24) continue; const d=(xx-px)*(xx-px)+(yy-py)*(yy-py); if(d<bd){ bd=d; best={x:xx,y:yy}; } } }
        if(!best) return {covered:false};
        const gl=_pxToLl(ox+best.x, oy+best.y, z); return {covered:true, lng:gl.lng, lat:gl.lat};
      }catch(_){ return null; } }
    function _noCoverageToast(){ try{ imToast('🧍 '+LL('No Street View coverage here','ここにはストリートビューがありません','Hier ist kein Street View verfügbar','Здесь нет панорам Street View','No hay Street View aquí')); }catch(_){} }
    /* (#R142) shown when the coverage tiles couldn't be read (even via proxy): the panorama still opens (the embed self-snaps
       to the nearest real pano) but we admit the exact coverage point is unverified — never a silent "moved to your click". */
    function _coverageUnverifiedToast(){ try{ imToast('🧍 '+LL('Showing the nearest available panorama — exact Street View coverage couldn\'t be verified (a network filter or browser extension may be blocking Google\'s tiles)','最寄りのパノラマを表示中 — 正確なカバレッジを確認できませんでした（拡張機能やネットワークがGoogleのタイルを遮断している可能性）','Zeige das nächste verfügbare Panorama — die genaue Abdeckung ließ sich nicht prüfen (evtl. blockiert eine Erweiterung/das Netzwerk Googles Kacheln)','Показан ближайший доступный панорамный снимок — точное покрытие проверить не удалось (возможно, расширение или сеть блокируют тайлы Google)','Mostrando el panorama más cercano — no se pudo verificar la cobertura exacta (una extensión o red podría bloquear las teselas de Google)')); }catch(_){} }
    function coverage(on){ if(on===undefined) on=!_cov; on=!!on; if(on===_cov) return _cov; _cov=on;
      if(on){ addCoverageTiles();
        _covClick=e=>{ try{ open({lng:e.lngLat.lng,lat:e.lngLat.lat}); }catch(_){} };
        try{ GE().events.on('click',_covClick); GE().render.setCursor('crosshair'); }catch(_){}
        _covHint=document.createElement('div'); _covHint.id='sv-cov-hint';
        _covHint.style.cssText='position:fixed;left:50%;top:58px;transform:translateX(-50%);z-index:1350;background:rgba(18,28,44,0.92);color:#dbeaff;border:1px solid rgba(57,179,255,0.55);border-radius:20px;padding:6px 14px;font-size:12px;display:flex;gap:10px;align-items:center;box-shadow:0 6px 18px rgba(0,0,0,0.35);';
        _covHint.innerHTML='<span>🧍 '+LL('Street View mode — the light-blue lines are Google\'s real coverage; click one to open its panorama','ストリートビュー・モード — 水色の線がGoogleの実際のカバレッジです。クリックでパノラマを表示','Street-View-Modus — die hellblauen Linien sind Googles echte Abdeckung; zum Öffnen anklicken','Режим панорам — голубые линии это реальное покрытие Google; кликните для просмотра','Modo Street View — las líneas celestes son la cobertura real de Google; haz clic para abrir')+'</span><button id="sv-cov-off" style="border:none;background:rgba(57,179,255,0.28);color:#dbeaff;border-radius:12px;padding:3px 10px;cursor:pointer;font-size:11px;">×</button>';
        document.body.appendChild(_covHint); const off=_covHint.querySelector('#sv-cov-off'); if(off) off.onclick=()=>coverage(false);
        if(!_covStyled){ _covStyled=true; try{ GE().events.on('styledata',()=>{ if(_cov) setTimeout(()=>{ if(_cov) addCoverageTiles(); },250); }); }catch(_){} }   /* re-add over a basemap/theme switch */
      } else {
        removeCoverageTiles();
        if(_covClick){ try{ GE().events.off('click',_covClick); }catch(_){} _covClick=null; }
        try{ GE().render.setCursor(''); }catch(_){}
        if(_covHint){ _covHint.remove(); _covHint=null; } }
      return _cov; }
    return { open, close, coverage, coverageOn:()=>_cov, nearestCoverage:_nearestCoverage, nearestPano:_nearestPano };
  })();
};
