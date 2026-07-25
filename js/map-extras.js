/* ============================================================================
 *  IntMap · Remaining self-contained map-surface modules  (#R167)
 * ----------------------------------------------------------------------------
 *  Seven small window.* modules that live on the map surface and had nothing left to share:
 *  live location, saved annotations, the layer hover popup, layer search, runway search,
 *  the DEM sampler and the rail/sea raster overlays.
 *  Every factory is called at the exact spot its block used to occupy — several of these
 *  append rows to shared containers, so their relative order is user-visible.
 * ==========================================================================*/

window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.locate=function(map,HOST){
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ const m=window.__imap||map; return !!(m&&m.isStyleLoaded()); }catch(__){ return false; } } }
  const imToast=HOST.imToast;
  /* ===== (#R137) Live "my location" marker — an ACCENT dot + an accuracy circle (居る可能性のある円) that FOLLOW the
     user via navigator.geolocation.watchPosition. Driven by the mobile locate FAB and the Atlas 'locate' action.
     Rendered as MapLibre layers (so they can't drift), re-asserted across base-map/style swaps. ===== */
  window.IntMapLocate=(function(){
    const SRC_DOT='imloc-dot', SRC_ACC='imloc-acc';
    let watchId=null, last=null, active=false, wired=false;
    const M=()=>window.__imap||(typeof map!=='undefined'?map:null);
    function accent(){ try{ const c=(getComputedStyle(document.documentElement).getPropertyValue('--primary-color')||'').trim(); return c||'#0a84ff'; }catch(_){ return '#0a84ff'; } }
    function ensure(){ const m=M(); if(!m||!_imCanDraw()) return false;
      try{
        if(!m.getSource(SRC_ACC)){ m.addSource(SRC_ACC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
          m.addLayer({id:'imloc-acc-fill',type:'fill',source:SRC_ACC,paint:{'fill-color':accent(),'fill-opacity':0.12}});
          m.addLayer({id:'imloc-acc-line',type:'line',source:SRC_ACC,paint:{'line-color':accent(),'line-width':1.2,'line-opacity':0.5}}); }
        if(!m.getSource(SRC_DOT)){ m.addSource(SRC_DOT,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
          m.addLayer({id:'imloc-dot-halo',type:'circle',source:SRC_DOT,paint:{'circle-radius':13,'circle-color':accent(),'circle-opacity':0.20}});
          m.addLayer({id:'imloc-dot',type:'circle',source:SRC_DOT,paint:{'circle-radius':6,'circle-color':accent(),'circle-stroke-width':2.5,'circle-stroke-color':'#fff'}}); }
        if(!wired){ wired=true; try{ m.on('styledata',()=>{ if(active&&last){ try{ paint(last.lng,last.lat,last.acc); }catch(_){} } }); }catch(_){}
          try{ m.on('move',_syncFab); m.on('moveend',_syncFab); }catch(_){} }   /* (#R139) accent the FAB live as the centre nears/leaves the fix */
        return true;
      }catch(_){ return false; }
    }
    function paint(lng,lat,accM){ const m=M(); if(!m) return; if(!ensure()){ try{ m.once&&m.once('idle',()=>paint(lng,lat,accM)); }catch(_){} return; }
      try{ const col=accent();
        try{ m.setPaintProperty('imloc-acc-fill','fill-color',col); m.setPaintProperty('imloc-acc-line','line-color',col); m.setPaintProperty('imloc-dot-halo','circle-color',col); m.setPaintProperty('imloc-dot','circle-color',col); }catch(_){}
        m.getSource(SRC_DOT).setData({type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{}});
        let poly=null; try{ if(window.turf&&turf.circle&&accM>0) poly=turf.circle([lng,lat],Math.max(0.02,accM/1000),{units:'kilometers',steps:64}); }catch(_){}
        m.getSource(SRC_ACC).setData(poly||{type:'FeatureCollection',features:[]});
      }catch(_){}
    }
    function clear(){ const m=M(); if(!m) return; try{ if(m.getSource(SRC_DOT)) m.getSource(SRC_DOT).setData({type:'FeatureCollection',features:[]}); if(m.getSource(SRC_ACC)) m.getSource(SRC_ACC).setData({type:'FeatureCollection',features:[]}); }catch(_){} }
    /* (#R139) the locate FAB is accent-coloured ONLY when the MAP CENTRE sits on the current-location fix (the
       location dot is at/near the screen centre) — not merely while tracking. Measured in SCREEN PIXELS so it is
       zoom-independent ("地図中心が現在地にあればアクセントカラー"). */
    const _CENTER_PX=44;
    function _mapCenterAtFix(){ const m=M(); if(!m||!active||!last) return false;
      try{ const pc=m.project(m.getCenter()), pf=m.project([last.lng,last.lat]); return Math.hypot(pc.x-pf.x,pc.y-pf.y)<=_CENTER_PX; }catch(_){ return false; } }
    function _syncFab(){ try{ const f=document.getElementById('m-fab-locate'); if(f) f.classList.toggle('on', _mapCenterAtFix()); }catch(_){} }
    window._imLocSyncFab=_syncFab;
    function start(opts){ opts=opts||{}; const m=M(); if(!m) return;
      if(!navigator.geolocation){ try{ if(typeof imToast==='function') imToast('⚠ '+(HOST.lang==='jp'?'位置情報が使えません':HOST.lang==='de'?'Standort nicht verfügbar':HOST.lang==='ru'?'Геолокация недоступна':HOST.lang==='es'?'Geolocalización no disponible':'Geolocation unavailable')); }catch(_){} return; }
      active=true; _syncFab();
      let firstFly=(opts.fly!==false);
      const onPos=p=>{ const lng=+p.coords.longitude, lat=+p.coords.latitude, ac=+p.coords.accuracy||0; last={lng,lat,acc:ac};
        paint(lng,lat,ac); _syncFab();
        if(firstFly){ firstFly=false; try{ m.flyTo({center:[lng,lat],zoom:Math.max(m.getZoom(),14),duration:1100}); }catch(_){} } };
      const onErr=e=>{ try{ if(typeof imToast==='function'){ const denied=e&&e.code===1;   /* (#R155) distinguish a hard denial (actionable) from a transient failure */
        imToast('⚠ '+(denied
          ? (HOST.lang==='jp'?'位置情報がブロックされています。ブラウザ設定で許可してください。':HOST.lang==='de'?'Standort blockiert — im Browser erlauben.':HOST.lang==='ru'?'Геолокация заблокирована — разрешите в браузере.':HOST.lang==='es'?'Ubicación bloqueada — actívala en el navegador.':'Location blocked — enable it in your browser settings.')
          : (HOST.lang==='jp'?'位置情報を取得できませんでした':HOST.lang==='de'?'Standort nicht verfügbar':HOST.lang==='ru'?'Не удалось получить геолокацию':HOST.lang==='es'?'No se pudo obtener la ubicación':'Couldn\'t get your location'))); } }catch(_){}
        if(!last){ active=false; } _syncFab(); };
      /* (#R170) maximumAge 5000/2000 → 0 and a longer first-fix budget: a cached fix is by definition the LAST
         one the device computed (possibly a coarse network fix from another app), so accepting one threw away the
         accuracy enableHighAccuracy had just asked for. The watch keeps refining as the GPS converges. */
      try{ navigator.geolocation.getCurrentPosition(onPos,onErr,{enableHighAccuracy:true,timeout:20000,maximumAge:0}); }catch(_){}
      if(watchId==null){ try{ watchId=navigator.geolocation.watchPosition(onPos,()=>{},{enableHighAccuracy:true,timeout:25000,maximumAge:0}); }catch(_){} }
    }
    function stop(){ if(watchId!=null){ try{ navigator.geolocation.clearWatch(watchId); }catch(_){} watchId=null; } active=false; _syncFab(); clear(); }
    /* FAB tap: first tap starts + flies; while active it re-centres on the last known fix. */
    function toggleOrRecenter(){ const m=M(); if(active&&last){ try{ m.flyTo({center:[last.lng,last.lat],zoom:Math.max(m.getZoom(),14),duration:900}); }catch(_){} } else start({fly:true}); }
    return { start, stop, toggleOrRecenter, _paint:paint, isActive:()=>active, last:()=>last };
  })();
};

window.IntMapModules.annotations=function(map,HOST){
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ const m=window.__imap||map; return !!(m&&m.isStyleLoaded()); }catch(__){ return false; } } }
  /* ===== (#R9b/#55) Persistent measurement annotations — finalise a measure/area/radius as a pin-less
     line/polygon that stays on the map; small popup to rename / recolor / delete; multiple allowed. ===== */
  window.IntMapAnnotations=(function(){
    if(!map) return { add(){}, remove(){}, clear(){}, _items:[] };
    const SRC='annot-src'; let seq=0, popup=null; const items=[];
    const jp=()=>HOST.lang==='jp';
    function fc(){ return {type:'FeatureCollection',features:items.map(it=>({type:'Feature',geometry:it.geom,properties:{id:it.id,color:it.color,op:it.op}}))}; }
    function ensure(){ if(map.getSource(SRC)) return true; if(!_imCanDraw()) return false;
      try{ map.addSource(SRC,{type:'geojson',data:fc()});
        map.addLayer({id:'annot-fill',type:'fill',source:SRC,filter:['==','$type','Polygon'],paint:{'fill-color':['get','color'],'fill-opacity':['coalesce',['get','op'],0.16]}});
        map.addLayer({id:'annot-line',type:'line',source:SRC,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['get','color'],'line-width':2.6}});
        map.on('click','annot-fill',e=>{ if(e.features[0]) openPop(e.features[0].properties.id,e.lngLat); });
        map.on('click','annot-line',e=>{ if(e.features[0]) openPop(e.features[0].properties.id,e.lngLat); });
        ['annot-fill','annot-line'].forEach(l=>{ map.on('mouseenter',l,()=>{ map.getCanvas().style.cursor='pointer'; }); map.on('mouseleave',l,()=>{ map.getCanvas().style.cursor=''; }); });
        return true;
      }catch(_){ return false; }
    }
    /* (#R35) Self-healing refresh: if the style is transiently NOT loaded when an annotation is added
       (e.g. many layers churning styledata right after "Keep on map"), ensure() returns false and the old
       refresh silently did nothing → the kept line/area "disappeared". Now we retry until the source+layers
       exist, so a kept drawing can never be dropped by a load race. */
    function refresh(){ try{ if(ensure()){ map.getSource(SRC).setData(fc()); } else if(items.length){ setTimeout(refresh,120); } }catch(_){ if(items.length) setTimeout(refresh,200); } }
    map.on('styledata',()=>{ if(items.length) setTimeout(refresh,80); });
    function repr(geom){ try{ if(geom.type==='LineString'){ const c=geom.coordinates; return c[Math.floor(c.length/2)]; } if(geom.type==='Polygon'){ const r=geom.coordinates[0]; let x=0,y=0; r.forEach(p=>{x+=p[0];y+=p[1];}); return [x/r.length,y/r.length]; } }catch(_){} return [0,0]; }
    function openPop(id, ll){ const it=items.find(x=>x.id===id); if(!it) return; try{ if(popup) popup.remove(); }catch(_){}
      const at=ll||repr(it.geom);
      const valHtml = it.value ? '<div style="font-size:13px;color:var(--primary-color);font-weight:700;margin:0 0 6px;">'+it.value+'</div>' : '';
      const html='<div style="min-width:172px;">'+valHtml+'<input class="annot-name" value="'+String(it.name).replace(/"/g,'&quot;')+'" style="width:100%;box-sizing:border-box;font-weight:700;font-size:13px;background:var(--input-bg);border:1px solid rgba(128,128,128,0.25);border-radius:7px;color:var(--text-main);padding:5px 7px;margin-bottom:6px;"><div style="display:flex;align-items:center;gap:8px;"><input type="color" class="annot-color" value="'+it.color+'"><span style="font-size:11px;color:var(--text-muted);">'+(jp()?'色':'Color')+'</span><button class="annot-del" style="margin-left:auto;background:var(--info-mil);color:#fff;border:none;border-radius:7px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;">'+(jp()?'削除':'Delete')+'</button></div></div>';
      popup=new maplibregl.Popup({closeButton:true,closeOnClick:false,className:'plc-popup',maxWidth:'260px'}).setLngLat(at).setHTML(html).addTo(map);
      setTimeout(()=>{ const el=popup&&popup.getElement&&popup.getElement(); if(!el) return;
        const nm=el.querySelector('.annot-name'); if(nm) nm.oninput=()=>{ it.name=nm.value; };
        const co=el.querySelector('.annot-color'); if(co) co.oninput=()=>{ it.color=co.value; refresh(); };
        const dl=el.querySelector('.annot-del'); if(dl) dl.onclick=()=>remove(id);
      },0);
    }
    /* (#R11) No auto-popup on finalize — the shape just stays on the map; clicking it later opens the
       dismissable popup with the measured value + rename/recolor/delete. */
    function add(geom,opts){ opts=opts||{}; const id='an'+(++seq); items.push({id,geom,color:opts.color||'#ff9500',op:(opts.op!=null?opts.op:0.16),name:opts.name||((jp()?'注記 ':'Annotation ')+seq),value:opts.value||''}); refresh(); return id; }
    function remove(id){ const i=items.findIndex(x=>x.id===id); if(i>=0){ items.splice(i,1); refresh(); } if(popup){ try{popup.remove();}catch(_){} popup=null; } }
    return { add, remove, refresh, clear:()=>{ items.length=0; refresh(); }, open:openPop, _items:items };   /* (#R88) expose refresh so the Object List can recolour an annotation live */
  })();
};

window.IntMapModules.layerHoverPopup=function(map,HOST){
  /* (#R29) "通常の状態でも、国名の地名ラベルを押したら、isolate機能を使えるボタンが出るように。"
     In the NORMAL state (Countries(info) OFF, no measuring tool, not already isolated), tapping a country
     NAME place-label pops a small "🔍 Isolate <country>" button at the tap point. Tapping it isolates that
     country. (When Countries(info) is ON, the country detail popup already carries its own Isolate button.) */
  (function(){
    if(!map) return; let pop=null, hideT=null;
    function hide(){ if(pop) pop.style.display='none'; clearTimeout(hideT); }
    /* (#R29.1) Styled to MATCH the map's iOS control language (frosted `--popup-bg` pill, the same border
       & shadow as the view buttons / coord readout, primary-tinted icon) — not a foreign-looking chip. */
    function ensurePop(){ if(pop) return pop; pop=document.createElement('button'); pop.id='label-isolate-btn';
      pop.style.cssText='display:none;position:absolute;z-index:1650;transform:translate(-50%,calc(-100% - 12px));background:var(--popup-bg);color:var(--text-main);border:1px solid rgba(128,128,128,0.18);border-radius:11px;padding:9px 14px;font-size:12.5px;font-weight:600;cursor:pointer;box-shadow:var(--shadow);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);white-space:nowrap;display:none;align-items:center;gap:7px;letter-spacing:0.01em;';
      (document.getElementById('map-container')||document.body).appendChild(pop); return pop; }
    map.on('movestart',hide);
    map.on('click',(e)=>{
      return;   /* (#R33) DISABLED — Isolate now lives in the place popup's action row (Copy/Wikipedia/AI brief/Isolate), so the separate floating button is no longer shown. */
      try{
        if(typeof HOST.toolMode!=='undefined' && HOST.toolMode){ hide(); return; }                 /* measuring/drawing → ignore */
        if(typeof HOST.countryInfoOn!=='undefined' && HOST.countryInfoOn){ hide(); return; }        /* its popup already has Isolate */
        if(window.IntMapIsolate && window.IntMapIsolate.active && window.IntMapIsolate.active()){ hide(); return; }
        if(!map.getLayer('ofm-country')){ hide(); return; }
        const hits=map.queryRenderedFeatures(e.point,{layers:['ofm-country']});
        if(!hits||!hits.length){ hide(); return; }
        const p=hits[0].properties||{}; const name=p.name||p['name:en']||p.name_en||p['name:latin']||'';
        if(!name){ hide(); return; }
        const ll=e.lngLat;   /* isolate by the tapped POINT (reliable) — name is just the label */
        const b=ensurePop();
        b.innerHTML='<span style="color:var(--primary-color);display:inline-flex;align-items:center;flex:0 0 auto;"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3"/></svg></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">'+(HOST.lang==='jp'?(name+' だけ表示'):HOST.lang==='de'?(name+' isolieren'):HOST.lang==='ru'?('Только '+name):HOST.lang==='es'?('Aislar '+name):('Isolate '+name))+'</span>';
        /* (#R32b) Pin to a RELIABLY-CLEAR bottom-centre slot (iOS contextual-action style) instead of the tap
           point — guarantees it never overflows the edge nor covers the top/right controls or the FAB stack
           ("はみ出している / ほかのボタンを隠している / 周りのUIと同一にしろ"). Width-capped + ellipsis for long names. */
        const mc=document.getElementById('map-container')||document.body; const mr=mc.getBoundingClientRect();
        const pad=12;
        b.style.maxWidth=Math.max(160,(mr.width-2*pad))+'px';
        b.style.display='inline-flex'; b.style.left='50%'; b.style.right='auto'; b.style.top='auto';
        b.style.bottom='calc(env(safe-area-inset-bottom, 0px) + 92px)';
        b.style.transform='translateX(-50%)';
        b.onclick=(ev)=>{ ev.stopPropagation(); hide(); try{ window.IntMapIsolate&&window.IntMapIsolate.enterAt(ll.lng,ll.lat,name); }catch(_){} };
        clearTimeout(hideT); hideT=setTimeout(hide,4500);   /* auto-dismiss if ignored */
      }catch(_){ hide(); }
    });
  })();
};

window.IntMapModules.layerSearch=function(map,HOST){
  /* ===== (#R21) LAYER SEARCH — a filter box pinned to the top of the Layers panel. Matches the
     visible label text of every layer row (EN or JP), expands groups while filtering, hides section
     headers with no hits, and restores the normal panel (incl. the mobile beta pulldown) on clear. ===== */
  (function(){
    const jp=()=>HOST.lang==='jp';
    function dd(){ return document.getElementById('layer-dropdown'); }
    function filter(qs){
      const d=dd(); if(!d) return;
      const q=String(qs||'').trim().toLowerCase();
      const rows=d.querySelectorAll(':scope > .lyr-row, :scope > label.layer-option');
      const extras=d.querySelectorAll(':scope > hr, :scope > .lyr-others-note, :scope > #layer-fav-section, :scope > #layer-active-section, :scope > #layer-tools');
      if(!q){
        rows.forEach(r=>{ r.style.display=''; });
        extras.forEach(el=>{ el.style.display=''; });
        d.querySelectorAll(':scope > .lyr-head, :scope > .layer-group-title').forEach(h=>{ h.style.display=''; });
        try{ window._expandAllLayerGroups&&window._expandAllLayerGroups(); }catch(_){}
        return;
      }
      d.querySelectorAll(':scope > .lyr-head, :scope > .layer-group-title').forEach(h=>h.classList.remove('lyr-collapsed'));
      rows.forEach(r=>{ const t=(r.textContent||'').toLowerCase(); r.style.display=t.indexOf(q)>=0?'':'none'; });
      extras.forEach(el=>{ el.style.display='none'; });
      d.querySelectorAll(':scope > .lyr-head, :scope > .layer-group-title').forEach(h=>{
        let el=h.nextElementSibling, any=false;
        while(el && !el.matches('.lyr-head,.layer-group-title') && el.tagName!=='HR'){
          if((el.matches('.lyr-row')||el.matches('label.layer-option')) && el.style.display!=='none'){ any=true; break; }
          el=el.nextElementSibling; }
        h.style.display=any?'':'none';
      });
    }
    function ensureBox(){
      const d=dd(); if(!d) return;
      let box=document.getElementById('layer-search-wrap');
      if(!box){
        box=document.createElement('div'); box.id='layer-search-wrap';
        /* (#R23) NO longer pinned/sticky — the user asked the desktop layer-search box to sit in normal
           flow and scroll with the list ("レイヤー検索窓の上部固定はやめて"). */
        box.style.cssText='position:relative;z-index:6;padding:2px 0 7px;';
        box.innerHTML='<input id="layer-search" type="search" autocomplete="off" style="width:100%;box-sizing:border-box;padding:7px 11px;border-radius:9px;border:1px solid rgba(128,128,128,0.28);background:var(--input-bg);color:var(--text-main);font-size:12.5px;outline:none;">';
        const inp=box.querySelector('input');
        inp.placeholder=jp()?'🔍 レイヤーを検索…':'🔍 Search layers…';
        inp.addEventListener('input',()=>filter(inp.value));
        inp.addEventListener('click',e=>e.stopPropagation());
        inp.addEventListener('keydown',e=>e.stopPropagation());
        window.addEventListener('intmap-lang',()=>{ inp.placeholder=jp()?'🔍 レイヤーを検索…':'🔍 Search layers…'; });
      }
      /* (#R65) the Active-layers bar owns the very top (sticky) — the search box slots in right below it */
      { const act=document.getElementById('layer-active-section');
        if(act&&act.parentElement===d){ if(act.nextSibling!==box) d.insertBefore(box,act.nextSibling); }
        else if(d.firstChild!==box) d.insertBefore(box,d.firstChild); }
      /* re-apply an active query after a panel rebuild */
      const inp=box.querySelector('input'); if(inp&&inp.value) filter(inp.value);
    }
    /* keep the box pinned across every reorganize (the panel is rebuilt on each open) */
    function hook(){ const orig=window.reorganizeLayerPanel;
      if(typeof orig!=='function'||orig.__lsWrapped){ setTimeout(hook,800); return; }
      const w=function(){ const r=orig.apply(this,arguments); try{ ensureBox(); }catch(_){} return r; };
      w.__lsWrapped=true; window.reorganizeLayerPanel=w; ensureBox(); }
    if(document.readyState!=='loading') setTimeout(hook,600); else document.addEventListener('DOMContentLoaded',()=>setTimeout(hook,600));
  })();
};

window.IntMapModules.runwaySearch=function(map,HOST){
  const t=HOST.t, makeDraggable=HOST.makeDraggable;
  /* ===== (#R8c) Runway / air-base search SCAFFOLD. Data is NOT auto-fetched (the user: "今はすべての
     データ取ってこなくていい"); it lazy-loads from OurAirports (public-domain, CORS*) only when a search is
     run, then caches in IndexedDB (IntMapCache). Right-click -> "Runway search (from here)" opens a panel:
     radius km, military/civil/all, minimum runway length, and airport-level vs runway-level view. ===== */
  window.RunwaySearch=(function(){
    if(!map) return { open(){}, load(){}, search(){}, ready:()=>false };
    const SRC='rwy-src', LYR='rwy-pt', LBL='rwy-lbl';
    const R=Math.PI/180, MIL=/\b(air ?base|a\.?f\.?b|air force|naval air|\bnas\b|\braf\b|army air ?field|aerodrom|militar|airbase)\b/i;
    let data=null, loading=false, panel=null, center=null;
    const jp=()=>HOST.lang==='jp';
    const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    /* (#R11) Runway lengths / distances respect the measurement-units setting (metric / imperial / both). */
    const isImp=()=>((typeof HOST.unitMode!=='undefined')?HOST.unitMode:'both')==='imperial';
    /* (#R15c) Per-panel unit override — imperial is always selectable inside Runway search regardless of
       the global default. Reads the panel's own selector, falling back to the global setting. */
    const imp=()=>{ const s=panel&&panel.querySelector('#rwy-unit'); return s? s.value==='imp' : isImp(); };
    /* (#R15c) Results follow the panel's own unit selector (imp()) so the Imperial option works in the
       result rows too, regardless of the global default. */
    const lenFmt=m=>{ const ft=Math.round(m*3.28084); return imp()?(ft.toLocaleString()+' ft'):(Math.round(m).toLocaleString()+' m'); };
    const distFmtKm=km=>{ const mi=km*0.621371; return imp()?(mi.toFixed(0)+' mi'):(km.toFixed(0)+' km'); };
    function hav(lo1,la1,lo2,la2){ const d1=(la2-la1)*R,d2=(lo2-lo1)*R,a=Math.sin(d1/2)**2+Math.cos(la1*R)*Math.cos(la2*R)*Math.sin(d2/2)**2; return 6371*2*Math.asin(Math.min(1,Math.sqrt(a))); }
    function rows(txt){ const out=[]; let f='',row=[],q=false; for(let i=0;i<txt.length;i++){ const c=txt[i];
      if(q){ if(c==='"'){ if(txt[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
      else { if(c==='"') q=true; else if(c===','){ row.push(f); f=''; } else if(c==='\n'||c==='\r'){ if(c==='\r'&&txt[i+1]==='\n') i++; row.push(f); out.push(row); row=[]; f=''; } else f+=c; } }
      if(f.length||row.length){ row.push(f); out.push(row); } return out; }
    async function load(){ if(data) return data; if(loading) return null; loading=true;
      try{
        let cached=null; try{ if(window.IntMapCache&&window.IntMapCache.get) cached=await window.IntMapCache.get('runways_v2'); }catch(_){}   /* (#R119) v2 rows carry BOTH runway-end coordinates (for the flight sim's real-threshold spawn + landing corridor) */
        if(cached&&cached.length){ data=cached; loading=false; return data; }
        const base='https://davidmegginson.github.io/ourairports-data/';
        const got=await Promise.all([ fetch(base+'runways.csv').then(r=>r.text()), fetch(base+'airports.csv').then(r=>r.text()) ]);
        const rw=got[0], ap=got[1];
        const A=rows(ap), ah=A[0], ai=n=>ah.indexOf(n); const aId=ai('ident'),aNm=ai('name'),aMu=ai('municipality');
        const by={}; for(let i=1;i<A.length;i++){ const r=A[i]; if(!r||!r[aId]) continue; const nm=r[aNm]||''; by[r[aId]]={name:nm,muni:r[aMu]||'',mil:MIL.test(nm)}; }
        const Rw=rows(rw), rh=Rw[0], ri=n=>rh.indexOf(n);
        const cAp=ri('airport_ident'),cLn=ri('length_ft'),cCl=ri('closed'),cLe=ri('le_ident'),cHe=ri('he_ident'),cLa=ri('le_latitude_deg'),cLo=ri('le_longitude_deg'),cHa=ri('he_latitude_deg'),cHo=ri('he_longitude_deg');
        const out=[]; for(let i=1;i<Rw.length;i++){ const r=Rw[i]; if(!r||r[cCl]==='1') continue;
          const a1=parseFloat(r[cLa]),o1=parseFloat(r[cLo]),a2=parseFloat(r[cHa]),o2=parseFloat(r[cHo]); let la,lo;
          if(isFinite(a1)&&isFinite(a2)){ la=(a1+a2)/2; lo=(o1+o2)/2; } else if(isFinite(a1)){ la=a1; lo=o1; } else continue;
          const inf=by[r[cAp]]||{}; const row={apt:r[cAp],name:inf.name||r[cAp],muni:inf.muni||'',mil:!!inf.mil,la:la,lo:lo,lenM:Math.round((parseFloat(r[cLn])||0)*0.3048),rwy:(r[cLe]||'')+'/'+(r[cHe]||'')};
          if(isFinite(a1)&&isFinite(o1)&&isFinite(a2)&&isFinite(o2)){ row.leLa=a1; row.leLo=o1; row.heLa=a2; row.heLo=o2; row.leId=r[cLe]||''; row.heId=r[cHe]||''; }   /* (#R119) both thresholds */
          out.push(row); }
        data=out; loading=false; try{ if(window.IntMapCache&&window.IntMapCache.set) window.IntMapCache.set('runways_v2',out); }catch(_){} return out;
      }catch(e){ loading=false; return null; }
    }
    function search(o){ if(!data) return []; const cl=o.center;
      let res=data.filter(r=>{ if(o.minLenM&&r.lenM<o.minLenM) return false; if(o.use==='mil'&&!r.mil) return false; if(o.use==='civ'&&r.mil) return false; return hav(cl[0],cl[1],r.lo,r.la)<=o.radiusKm; });
      res.forEach(r=>{ r._d=hav(cl[0],cl[1],r.lo,r.la); }); res.sort((a,b)=>a._d-b._d);
      if(o.mode==='airport'){ const seen={},g=[]; res.forEach(r=>{ if(!seen[r.apt]){ seen[r.apt]={apt:r.apt,name:r.name,muni:r.muni,mil:r.mil,la:r.la,lo:r.lo,_d:r._d,maxLen:r.lenM,n:1}; g.push(seen[r.apt]); } else { seen[r.apt].n++; if(r.lenM>seen[r.apt].maxLen) seen[r.apt].maxLen=r.lenM; } }); return g; }
      return res; }
    /* (#R9/#47) Airport/runway popup with key info + a Wikipedia link. Opened from a list row OR a pin. */
    let rwyPopup=null;
    function wikiLink(name){ const w=jp()?'ja':'en'; return 'https://'+w+'.wikipedia.org/wiki/Special:Search?search='+encodeURIComponent(name||''); }
    function showRwyPopup(d){
      try{ if(rwyPopup) rwyPopup.remove(); }catch(_){}
      const title=esc(d.name||d.apt||'Airport'), rws=[];
      if(d.apt) rws.push((jp()?'コード':'Code')+': <b>'+esc(d.apt)+'</b>');
      if(d.muni) rws.push((jp()?'所在地':'Municipality')+': <b>'+esc(d.muni)+'</b>');
      rws.push((jp()?'種別':'Type')+': <b>'+(d.mil?(jp()?'軍用':'Military'):(jp()?'民間':'Civil'))+'</b>');
      if(d.len) rws.push((jp()?'最長滑走路':'Longest runway')+': <b>'+lenFmt(d.len)+'</b>');
      if(d.n) rws.push((jp()?'滑走路数':'Runways')+': <b>'+d.n+'</b>');
      if(d.rwy) rws.push((jp()?'滑走路':'Runway')+': <b>'+esc(d.rwy)+'</b>');
      rws.push((jp()?'座標':'Coords')+': <b>'+(+d.coords[1]).toFixed(4)+', '+(+d.coords[0]).toFixed(4)+'</b>');
      const html='<div style="min-width:170px;"><div style="font-weight:700;font-size:14px;color:var(--text-main);margin-bottom:6px;">'+(d.mil?'🪖':'🛬')+' '+title+'</div><div style="font-size:12px;color:var(--text-main);line-height:1.65;">'+rws.join('<br>')+'</div><a href="'+wikiLink(d.name||d.apt)+'" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;color:var(--primary-color);font-weight:600;font-size:12px;text-decoration:none;">📖 '+(jp()?'Wikipediaで見る ↗':'Read on Wikipedia ↗')+'</a></div>';
      try{ rwyPopup=new maplibregl.Popup({closeButton:true,closeOnClick:true,maxWidth:'280px',className:'plc-popup'}).setLngLat(d.coords).setHTML(html).addTo(map); }catch(_){}
    }
    function ensureLayers(){ if(map.getSource(SRC)) return; try{ map.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      map.addLayer({id:LYR,type:'circle',source:SRC,paint:{'circle-radius':['interpolate',['linear'],['zoom'],2,3,8,6],'circle-color':['case',['get','mil'],'#ff453a','#0a84ff'],'circle-stroke-color':'#fff','circle-stroke-width':1.3,'circle-opacity':0.92}});
      map.addLayer({id:LBL,type:'symbol',source:SRC,minzoom:5,layout:{'text-field':['get','t'],'text-size':10,'text-offset':[0,1.1],'text-anchor':'top','text-font':['literal',['Noto Sans Regular']]},paint:{'text-color':'#fff','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.2}});
      /* Click a pin → the same info popup (#47). */
      map.on('click',LYR,e=>{ if(!e.features||!e.features.length) return; const p=e.features[0].properties||{}, c=e.features[0].geometry.coordinates; showRwyPopup({ name:p.name, apt:p.apt, muni:p.muni, mil:(p.mil===true||p.mil==='true'), len:+p.len||0, n:+p.n||0, rwy:p.rwy||'', coords:c }); });
      map.on('mouseenter',LYR,()=>{ map.getCanvas().style.cursor='pointer'; }); map.on('mouseleave',LYR,()=>{ map.getCanvas().style.cursor=''; });
    }catch(_){} }
    function renderMarks(res,mode){ ensureLayers(); const feats=res.slice(0,600).map(r=>({type:'Feature',geometry:{type:'Point',coordinates:[r.lo,r.la]},properties:{mil:!!r.mil,t:mode==='airport'?r.name:(r.apt+' '+r.rwy),name:r.name||'',apt:r.apt||'',muni:r.muni||'',len:(mode==='airport'?r.maxLen:r.lenM)||0,n:(mode==='airport'?(r.n||0):0),rwy:(mode==='runway'?(r.rwy||''):'')}})); try{ map.getSource(SRC).setData({type:'FeatureCollection',features:feats}); }catch(_){} }
    function run(){ const p=panel; const im=imp(); const rIn=+p.querySelector('#rwy-radius').value||(im?186:300), lIn=+p.querySelector('#rwy-len').value||0, use=p.querySelector('#rwy-use').value, mode=p.querySelector('#rwy-mode').value;
      const radiusKm=im?rIn*1.60934:rIn, minLenM=im?lIn*0.3048:lIn;
      const list=p.querySelector('#rwy-list'); list.innerHTML=jp()?'読み込み中…':'Loading…';
      load().then(d=>{ if(!d){ list.innerHTML=jp()?'データを取得できませんでした':'Could not load data'; return; }
        const res=search({center:center,radiusKm:radiusKm,use:use,minLenM:minLenM,mode:mode}); renderMarks(res,mode);
        if(!res.length){ list.innerHTML=jp()?'該当なし':'No matches'; return; }
        const shown=res.slice(0,120);
        list.innerHTML=shown.map((r,idx)=>{ const dd=distFmtKm(r._d), len=lenFmt(mode==='airport'?r.maxLen:r.lenM), nm=esc(mode==='airport'?r.name:(r.apt+' '+r.rwy)), extra=mode==='airport'?(jp()?(r.n+'本'):(r.n+' rwy')):'', flag=r.mil?'🪖':'🛬';
          return '<div class="rwy-item" data-idx="'+idx+'" style="display:flex;justify-content:space-between;gap:8px;padding:5px 4px;border-radius:6px;cursor:pointer;"><span>'+flag+' '+nm+'</span><span style="color:var(--text-muted);white-space:nowrap;">'+len+' · '+dd+' '+extra+'</span></div>'; }).join('');
        list.querySelectorAll('.rwy-item').forEach(it=>{ it.onclick=()=>{ const r=shown[+it.getAttribute('data-idx')]; if(!r) return; map.flyTo({center:[r.lo,r.la],zoom:Math.max(map.getZoom(),11)}); showRwyPopup({ name:r.name, apt:r.apt, muni:r.muni, mil:r.mil, len:(mode==='airport'?r.maxLen:r.lenM), n:(mode==='airport'?r.n:0), rwy:(mode==='runway'?r.rwy:''), coords:[r.lo,r.la] }); }; });
      });
    }
    function open(lngLat){ center=[lngLat.lng,lngLat.lat]; if(!panel){ panel=document.createElement('div'); panel.className='tool-panel'; panel.id='rwy-panel'; (document.getElementById('map-container')||document.body).appendChild(panel); } const p=panel; p.style.display='block';
      const im0=isImp();
      p.innerHTML='<div class="tp-header"><span class="tp-title">🛬 '+(jp()?'滑走路検索':'Runway search')+'</span><button class="tp-close" title="'+t('close')+'">✕</button></div>'+
        '<div class="tp-row" style="flex-direction:column;align-items:stretch;gap:6px;">'+
          '<label style="font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;">'+(jp()?'単位':'Units')+' <select id="rwy-unit"><option value="met"'+(im0?'':' selected')+'>'+(jp()?'メートル法 (km/m)':'Metric (km/m)')+'</option><option value="imp"'+(im0?' selected':'')+'>'+(jp()?'ヤード・ポンド (mi/ft)':'Imperial (mi/ft)')+'</option></select></label>'+
          '<label style="font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;"><span class="rwy-ulabel-r"></span> <input id="rwy-radius" type="number" value="'+(im0?186:300)+'" min="1" style="width:74px;"></label>'+
          '<label style="font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;"><span class="rwy-ulabel-l"></span> <input id="rwy-len" type="number" value="'+(im0?6500:2000)+'" min="0" step="'+(im0?500:100)+'" style="width:74px;"></label>'+
          '<label style="font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;">'+(jp()?'種別':'Use')+' <select id="rwy-use"><option value="all">'+(jp()?'すべて':'All')+'</option><option value="mil">'+(jp()?'軍用':'Military')+'</option><option value="civ">'+(jp()?'民間':'Civil')+'</option></select></label>'+
          '<label style="font-size:12px;color:var(--text-muted);display:flex;justify-content:space-between;align-items:center;">'+(jp()?'表示':'View')+' <select id="rwy-mode"><option value="airport">'+(jp()?'空港単位':'By airport')+'</option><option value="runway">'+(jp()?'滑走路単位':'By runway')+'</option></select></label>'+
        '</div>'+
        '<button class="tp-clear" id="rwy-go" style="width:100%;margin-top:6px;">'+(jp()?'検索（初回データ取得）':'Search (loads data 1st run)')+'</button>'+
        '<div id="rwy-list" style="margin-top:8px;max-height:230px;overflow:auto;font-size:12.5px;"></div>';
      const relabelUnits=()=>{ const im=imp(); const rl=p.querySelector('.rwy-ulabel-r'), ll=p.querySelector('.rwy-ulabel-l');
        if(rl) rl.textContent=im?(jp()?'半径 (mi)':'Radius (mi)'):(jp()?'半径 (km)':'Radius (km)');
        if(ll) ll.textContent=im?(jp()?'最小長 (ft)':'Min length (ft)'):(jp()?'最小長 (m)':'Min length (m)'); };
      relabelUnits();
      p.querySelector('#rwy-unit').onchange=()=>{ const im=imp(); const ri=p.querySelector('#rwy-radius'), li=p.querySelector('#rwy-len'); if(ri) ri.value=im?186:300; if(li){ li.value=im?6500:2000; li.step=im?500:100; } relabelUnits(); };
      p.querySelector('.tp-close').onclick=()=>{ p.style.display='none'; try{ const s=map.getSource(SRC); if(s) s.setData({type:'FeatureCollection',features:[]}); }catch(_){} };
      p.querySelector('#rwy-go').onclick=run;
      try{ makeDraggable(p,p.querySelector('.tp-header')); }catch(_){}
    }
    return { open:open, load:load, search:search, ready:()=>!!data };
  })();
};

window.IntMapModules.terrain=function(map,HOST){
  /* ===== (#R89) TERRAIN ELEVATION SAMPLER — shared keyless DEM access for slope/aspect, viewshed (RF) and
     terrain shadows. Decodes Mapzen/AWS "terrarium" terrain-RGB tiles (public S3, CORS-OK for canvas readback,
     elevation = R*256 + G + B/256 − 32768 metres) into an elevAt(lng,lat) sampler for a given bounds+zoom. ===== */
  window.IntMapTerrain=(function(){
    const cache={};
    const tileURL=(z,x,y)=>'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/'+z+'/'+x+'/'+y+'.png';
    function loadTile(z,x,y){ const key=z+'/'+x+'/'+y; if(cache[key]) return cache[key];
      const pr=new Promise(res=>{ const im=new Image(); im.crossOrigin='anonymous';
        im.onload=()=>{ try{ const cv=document.createElement('canvas'); cv.width=im.naturalWidth; cv.height=im.naturalHeight; const cx=cv.getContext('2d'); cx.drawImage(im,0,0); res({data:cx.getImageData(0,0,cv.width,cv.height).data,w:cv.width,h:cv.height}); }catch(e){ res(null); } };
        im.onerror=()=>res(null); im.src=tileURL(z,x,y); });
      cache[key]=pr; return pr; }
    const lon2x=(lon,z)=>(lon+180)/360*Math.pow(2,z);
    const lat2y=(lat,z)=>{ const r=lat*Math.PI/180; return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z); };
    async function sampler(bounds,z){ let [w,s,e,n]=bounds; z=Math.max(1,Math.min(14,Math.round(z)));
      const N=Math.pow(2,z), wrap=x=>((x%N)+N)%N;
      const x0=Math.floor(lon2x(w,z)), x1=Math.floor(lon2x(e,z)), y0=Math.max(0,Math.floor(lat2y(n,z))), y1=Math.min(N-1,Math.floor(lat2y(s,z)));
      if((x1-x0+1)*(y1-y0+1)>48) return null;   /* too many tiles → caller should lower zoom */
      const tiles={}, jobs=[];
      for(let x=x0;x<=x1;x++) for(let y=y0;y<=y1;y++){ jobs.push(loadTile(z,wrap(x),y).then(t=>{ tiles[x+'/'+y]=t; })); }
      await Promise.all(jobs);
      let got=0; for(const k in tiles) if(tiles[k]) got++; if(!got) return null;
      function elevAt(lon,lat){ const fx=lon2x(lon,z), fy=lat2y(lat,z); const tx=Math.floor(fx), ty=Math.floor(fy); const t=tiles[tx+'/'+ty]; if(!t) return null;
        const px=Math.min(t.w-1,Math.max(0,Math.floor((fx-tx)*t.w))), py=Math.min(t.h-1,Math.max(0,Math.floor((fy-ty)*t.h))); const i=(py*t.w+px)*4;
        return (t.data[i]*256+t.data[i+1]+t.data[i+2]/256)-32768; }
      return { elevAt, z }; }
    return { sampler, loadTile }; })();
};

window.IntMapModules.railSeaOverlays=function(map,HOST){
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ const m=window.__imap||map; return !!(m&&m.isStyleLoaded()); }catch(__){ return false; } } }
  const satToast=HOST.satToast;
  /* ===== (#R40) Two more well-known, key-free RASTER overlays (non-country, per "国単位以外を中心に"):
     OpenRailwayMap (global rail infrastructure) + OpenSeaMap (nautical seamarks). Raster tiles load as
     images (no CORS needed to display). Filed into Others(beta). Same additive toggle pattern as GIBS. ===== */
  (function(){
    if(!map) return;
    const LIST=[
      {id:'oxrail', tiles:['https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png','https://b.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png','https://c.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png'], max:19, sw:'#7b1fa2', attr:'© OpenRailwayMap · OSM',
        label:{en:'Rail infrastructure (OpenRailwayMap)',jp:'鉄道インフラ (OpenRailwayMap)',de:'Eisenbahninfrastruktur (OpenRailwayMap)',ru:'Ж/д инфраструктура (OpenRailwayMap)',es:'Infraestructura ferroviaria (OpenRailwayMap)'}},
      {id:'oxsea', tiles:['https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png'], max:18, sw:'#0277bd', attr:'© OpenSeaMap · OSM',
        label:{en:'Nautical seamarks (OpenSeaMap)',jp:'航海用海図記号 (OpenSeaMap)',de:'Seezeichen (OpenSeaMap)',ru:'Морские знаки (OpenSeaMap)',es:'Señales náuticas (OpenSeaMap)'}}
    ];
    const state={}; LIST.forEach(L=>state[L.id]=false);
    const lbl=(L)=>L.label[HOST.lang]||L.label.en;
    const beforeLabels=()=>['ofm-country','ofm-city','ofm-other','borders-only-line'].find(id=>{ try{ return !!map.getLayer(id); }catch(_){ return false; } });
    function ensure(L){ try{ if(!_imCanDraw()) return false;
      if(!map.getSource('ox-'+L.id)) map.addSource('ox-'+L.id,{type:'raster',tiles:L.tiles,tileSize:256,maxzoom:L.max,attribution:L.attr});
      if(!map.getLayer('oxl-'+L.id)) map.addLayer({id:'oxl-'+L.id,type:'raster',source:'ox-'+L.id,layout:{visibility:'none'},paint:{'raster-opacity':0.92,'raster-fade-duration':0}}, beforeLabels());
      return true; }catch(_){ return false; } }
    function toggle(L,on){ state[L.id]=on; let tries=0; const apply=()=>{ if(!ensure(L)){ if(tries++<40) setTimeout(apply,150); else map.once('idle',apply); return; }
      try{ map.setLayoutProperty('oxl-'+L.id,'visibility',on?'visible':'none'); }catch(_){}
      if(on){ try{ window._registerLayerOpacity&&window._registerLayerOpacity('ox-'+L.id,[L.label.en,L.label.jp,L.label.de,L.label.ru],['oxl-'+L.id],'ox-'+L.id); window._raiseLabelLayers&&window._raiseLabelLayers(); }catch(_){}
        /* (#R41) OpenSeaMap seamarks are a SPARSE transparent overlay — empty over open ocean / at world zoom, so
           it looked "broken" ("OpenSeaMapが動作しない"). It DOES load (tiles verified 200/png); tell the user the
           marks only appear when zoomed into a coast or harbour. */
        if(L.id==='oxsea'){ try{ if(map.getZoom()<9){ const h={en:'Seamarks (buoys, lights, depths) appear when you zoom into a coast or harbour.',jp:'海図記号（ブイ・灯台・水深など）は海岸や港に拡大すると表示されます。',de:'Seezeichen (Bojen, Feuer, Tiefen) erscheinen beim Hineinzoomen an Küsten/Häfen.',ru:'Морские знаки (буи, огни, глубины) видны при приближении к берегу или порту.',es:'Las señales náuticas (boyas, luces, profundidades) aparecen al acercarte a una costa o puerto.'}; satToast(h[HOST.lang]||h.en); } }catch(_){} } }
      else { try{ window._hideGenericLegend&&window._hideGenericLegend('ox-'+L.id); }catch(_){} } };
      apply(); if(on)[400,1500].forEach(ms=>setTimeout(apply,ms)); }
    map.on('styledata',()=>{ if(LIST.some(L=>state[L.id])) setTimeout(()=>{ LIST.forEach(L=>{ if(state[L.id]&&ensure(L)){ try{ map.setLayoutProperty('oxl-'+L.id,'visibility','visible'); }catch(_){} } }); },80); });
    function buildUI(){ const dd=document.getElementById('layer-dropdown'); if(!dd||document.getElementById('ox-oxrail')) return;
      LIST.forEach(L=>{ const w=document.createElement('div'); w.className='lyr-row'; w.id='lyrrow-ox-'+L.id;
        const lab=document.createElement('label'); lab.className='layer-option';
        const cb=document.createElement('input'); cb.type='checkbox'; cb.id='ox-'+L.id;
        const sw=document.createElement('span'); sw.className='lyr-sw'; sw.style.background=L.sw;
        const sp=document.createElement('span'); sp.id='ox-'+L.id+'-lbl'; sp.textContent=lbl(L);
        lab.appendChild(cb); lab.appendChild(document.createTextNode(' ')); lab.appendChild(sw); lab.appendChild(document.createTextNode(' ')); lab.appendChild(sp);
        w.appendChild(lab); dd.appendChild(w);
        cb.addEventListener('change',e=>{ w.classList.toggle('on',e.target.checked); toggle(L,e.target.checked); }); });
      try{ window.reorganizeLayerPanel&&window.reorganizeLayerPanel(); }catch(_){} }
    window.addEventListener('intmap-lang',()=>{ LIST.forEach(L=>{ const s=document.getElementById('ox-'+L.id+'-lbl'); if(s) s.textContent=lbl(L); }); });
    if(document.readyState!=='loading') setTimeout(buildUI,950); else document.addEventListener('DOMContentLoaded',()=>setTimeout(buildUI,950));
  })();
};
