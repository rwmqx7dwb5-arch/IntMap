/* ============================================================================
 *  IntMap · Map readouts (coords / elevation / layer value / compass) and the graticule  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.mapReadout=function(HOST){
  /* (#R251) the module's language helper. It used to be bound INSIDE `tropicLabel()` only, so the
     tsunami readout below — which this round moved off a private two-language helper — referenced a
     free identifier; scripts/static-checks.mjs `split-scope` caught that before a browser did.
     ⚠ LAZY, because tests/r169 #4 holds this repo to «a factory body does nothing while it runs» —
     a module factory may DECLARE, never CALL, and `IntMapLang.pick()` is a call. Binding on first
     use also means it is bound after the registry exists, which is the ordering every module here
     already relies on. */
  let _L=null;
  const L=(...a)=>{ if(!_L) _L=window.IntMapLang.pick(()=>HOST.lang); return _L(...a); };
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* ===== Grid (zoom-adaptive, red equator, 山吹色 tropics) ===== */
  const TROPIC_LAT=23.4362;   /* (#R210) mean obliquity of the ecliptic, this epoch — not 23.5 */
  function tropicLabel(side){
    return side==='n'
      ? L('Tropic of Cancer','北回帰線','Wendekreis des Krebses','Северный тропик','Trópico de Cáncer')
      : L('Tropic of Capricorn','南回帰線','Wendekreis des Steinbocks','Южный тропик','Trópico de Capricornio');
  }
  function gridStepForZoom(z){
    if(z<1.5) return {major:30,minor:10};
    if(z<3)   return {major:15,minor:5};
    if(z<5)   return {major:10,minor:2};
    if(z<7)   return {major:5, minor:1};
    if(z<9)   return {major:2, minor:0.5};
    if(z<11)  return {major:1, minor:0.25};
    if(z<13)  return {major:0.5,minor:0.1};
    return    {major:0.1,minor:0.025};
  }
  /* (#R210) ⚠ This used to open with `if(!HOST.hasTurf()) return [];` and NOTHING below it calls
     turf — the whole builder is arithmetic on lat/lng. The gate was the reported "グリッド線の表示が
     遅すぎる": turf lives in its own chunk, so a Grid switched on before that chunk lands built an
     EMPTY collection, and setGrid() had already reset _gridKey, so nothing redrew until the camera
     next moved. Removing the gate makes the grid appear on the same frame as the toggle. */
  function buildGridFeatures(){
    const z=GE().hasRenderer()?GE().camera.getZoom():2;
    const {major,minor}=gridStepForZoom(z);
    const b=GE().hasRenderer()?GE().camera.getBounds():null;
    let minLng=-180,maxLng=180,minLat=-80,maxLat=80;
    if(b){
      const pad=Math.max(major*2,2);
      minLng=Math.max(-180,Math.floor(b.getWest()/major)*major-pad);
      maxLng=Math.min(180, Math.ceil(b.getEast()/major)*major+pad);
      minLat=Math.max(-85, Math.floor(b.getSouth()/major)*major-pad);
      maxLat=Math.min(85,  Math.ceil(b.getNorth()/major)*major+pad);
    }
    const f=[];
    /* Cap vertices PER LINE (scales with the visible span instead of a fixed dense step) — far
       fewer points to build + upload, so the grid appears much faster (#15). On globe a line still
       gets enough points to look curved; on flat it's nearly straight anyway. */
    const latSpan=maxLat-minLat, lngSpan=maxLng-minLng;
    const latStep=Math.max(minor, latSpan/30), lngStep=Math.max(minor, lngSpan/36);
    const majLatStep=Math.max(major/2, latSpan/40), majLngStep=Math.max(major/2, lngSpan/48);
    /* Minor lines */
    for(let lng=Math.ceil(minLng/minor)*minor; lng<=maxLng; lng+=minor){
      if(Math.abs(lng%major)<1e-6) continue;
      const pts=[]; for(let la=minLat; la<=maxLat; la+=latStep) pts.push([lng,la]); pts.push([lng,maxLat]);
      if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'minor'}});
    }
    for(let lat=Math.ceil(minLat/minor)*minor; lat<=maxLat; lat+=minor){
      if(Math.abs(lat%major)<1e-6 || Math.abs(lat)<1e-6) continue;
      const pts=[]; for(let lo=minLng; lo<=maxLng; lo+=lngStep) pts.push([lo,lat]); pts.push([maxLng,lat]);
      if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'minor'}});
    }
    /* Major lines */
    for(let lng=Math.ceil(minLng/major)*major; lng<=maxLng; lng+=major){
      const pts=[]; for(let la=minLat; la<=maxLat; la+=majLatStep) pts.push([lng,la]); pts.push([lng,maxLat]);
      if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'major'}});
    }
    for(let lat=Math.ceil(minLat/major)*major; lat<=maxLat; lat+=major){
      if(Math.abs(lat)<1e-6) continue; /* equator drawn separately in red */
      const pts=[]; for(let lo=minLng; lo<=maxLng; lo+=majLngStep) pts.push([lo,lat]); pts.push([maxLng,lat]);
      if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'major'}});
    }
    /* Red equator */
    if(minLat<=0 && maxLat>=0){
      const pts=[]; const step=Math.max(major/4,1);
      for(let lo=minLng; lo<=maxLng; lo+=step) pts.push([lo,0]);
      if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'equator'}});
    }
    /* Prime meridian */
    if(minLng<=0 && maxLng>=0){
      const pts=[]; const step=Math.max(major/4,1);
      for(let la=minLat; la<=maxLat; la+=step) pts.push([0,la]);
      if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'prime'}});
    }
    /* (#R210) Tropics of Cancer and Capricorn. The obliquity is not 23.5° — it is 23.4362° for
       this epoch (IAU 2006 mean obliquity at J2000 = 23.439279°, drifting ≈ −0.013°/century), and
       that is the latitude the sun actually stands overhead at solstice. Both are drawn, in the
       requested 山吹色, from the SAME source as the rest of the grid so they arrive with it. */
    for(const [lat,side] of [[TROPIC_LAT,'n'],[-TROPIC_LAT,'s']]){
      if(minLat<=lat && maxLat>=lat){
        const pts=[]; const step=Math.max(major/4,1);
        for(let lo=minLng; lo<=maxLng; lo+=step) pts.push([lo,lat]);
        pts.push([maxLng,lat]);
        if(pts.length>1) f.push({type:'Feature',geometry:{type:'LineString',coordinates:pts},properties:{kind:'tropic',label:tropicLabel(side)}});
      }
    }
    /* Edge labels (along axes) */
    const labelStep=major;
    const c=GE().hasRenderer()?GE().camera.getCenter():{lng:0,lat:0};
    const baseLng=Math.max(minLng+major*0.5,Math.min(maxLng-major*0.5,c.lng));
    const baseLat=Math.max(minLat+major*0.5,Math.min(maxLat-major*0.5,c.lat));
    for(let lat=Math.ceil(minLat/labelStep)*labelStep; lat<=maxLat; lat+=labelStep){
      if(Math.abs(lat)>85) continue;
      f.push({type:'Feature',geometry:{type:'Point',coordinates:[baseLng,lat]},properties:{label:degLabel(+lat.toFixed(3),'lat')}});
    }
    for(let lng=Math.ceil(minLng/labelStep)*labelStep; lng<=maxLng; lng+=labelStep){
      f.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,baseLat]},properties:{label:degLabel(+lng.toFixed(3),'lng')}});
    }
    /* Intersection labels at major grid crossings — sparse so they don't clutter */
    const crossStep=major*2;
    for(let lat=Math.ceil(minLat/crossStep)*crossStep; lat<=maxLat; lat+=crossStep){
      if(Math.abs(lat)>80) continue;
      for(let lng=Math.ceil(minLng/crossStep)*crossStep; lng<=maxLng; lng+=crossStep){
        if(Math.abs(lat)<1e-6 && Math.abs(lng)<1e-6) continue;
        f.push({type:'Feature',geometry:{type:'Point',coordinates:[lng,lat]},properties:{kind:'cross',label:`${degLabel(+lat.toFixed(3),'lat')} ${degLabel(+lng.toFixed(3),'lng')}`}});
      }
    }
    return f;
  }
  let gridRebuildTimer=null, _gridKey='';
  function refreshGrid(){
    if(!HOST.isGridOn||!GE().hasRenderer()||!GE().layers.hasSource('grid-source')) return;
    clearTimeout(gridRebuildTimer);
    gridRebuildTimer=setTimeout(()=>{
      try{
        /* Skip the rebuild if the zoom-step + rounded viewport haven't really changed (#15) — avoids
           re-tessellating the whole grid on every tiny pan/rotate of the globe. */
        const z=GE().camera.getZoom(), {major,minor}=gridStepForZoom(z), b=GE().camera.getBounds();
        const key=major+'/'+minor+'/'+(b?[b.getWest(),b.getEast(),b.getSouth(),b.getNorth()].map(v=>Math.round(v/Math.max(major,1))).join(','):'');
        if(key===_gridKey) return; _gridKey=key;
        GE().layers.setSourceData('grid-source',{type:'FeatureCollection',features:buildGridFeatures()});
      }catch(e){}
    },90);
  }
  /* (#R38) ROOT FIX for "Grid & labels が何度消しても自動的にチェックされる": toggleGrid() used to blindly FLIP
     isGridOn on every checkbox change. The R36 async-race guard re-dispatches a `change` on a box that went OFF
     (idempotent for normal layers, which READ e.target.checked) — but the flip made that re-dispatch turn Grid
     back ON ~500ms later. Split into an IDEMPOTENT setGrid(on) (drives state FROM the box) + a toggleGrid() for
     the toolbar button. The checkbox change now calls setGrid(checked), so a stray/duplicate change can never
     re-enable Grid. */
  function setGrid(on){
    on=!!on; HOST.isGridOn=on;
    const gb=document.getElementById('btn-tool-grid'); if(gb) gb.classList.toggle('tool-on',HOST.isGridOn);
    const gcb=document.getElementById('cb-grid'); if(gcb && gcb.checked!==HOST.isGridOn) gcb.checked=HOST.isGridOn;   /* (#R10) Grid now lives in the Layers menu */
    document.querySelectorAll('[data-proxy="cb-grid"]').forEach(x=>x.classList.toggle('active',HOST.isGridOn));
    _gridKey='';
    if(!GE().hasRenderer()||!GE().layers.hasSource('grid-source'))return;
    if(HOST.isGridOn) GE().layers.setSourceData('grid-source',{type:'FeatureCollection',features:buildGridFeatures()});
    else GE().layers.setSourceData('grid-source',{type:'FeatureCollection',features:[]});
  }
  function degLabel(v,k){ if(v===0)return'0°'; const d=k==='lat'?(v>0?'N':'S'):(v>0?'E':'W'); return Math.abs(v)+'°'+d; }
  function showMeasureTip(pt,txt){ const el=document.getElementById('measure-tooltip'); if(!el) return; el.innerText=txt; el.style.display='block';
    /* (#R14/#7) keep the measure tooltip inside the map — it's drawn translate(12px,-50%), so flip it to
       the LEFT of the point near the right edge and clamp Y, instead of overflowing off-screen. */
    try{ const mc=document.getElementById('map-container').getBoundingClientRect(); const w=el.offsetWidth||120, h=el.offsetHeight||24;
      el.style.transform=(pt.x+12+w > mc.width-6)?('translate(-'+(w+12)+'px,-50%)'):'translate(12px,-50%)';
      el.style.left=Math.max(6,Math.min(mc.width-6,pt.x))+'px';
      el.style.top=Math.max(h/2+6,Math.min(mc.height-h/2-6,pt.y))+'px';
    }catch(_){ el.style.left=pt.x+'px'; el.style.top=pt.y+'px'; }
  }
  function handleMapClick(lng,lat,point,viaBtn){
    if(window.__scpPick) return;   /* (#R86) Compare "pick a country on the map" mode owns the click */
    /* (#R7-draw) The freehand Draw tool owns the map gesture while it is active. */
    if(window.DrawTool && window.DrawTool.active()) return;
    /* Köppen click-to-highlight (#25): when the climate layer is on, clicking the map highlights
       (toggles) the climate zone at that point. Works whether or not a measurement tool is active. */
    try{
      const climCb=document.getElementById('dl-climate');
      if(climCb && climCb.checked && window.sampleKoppenAt){
        /* (#R122) do NOT also toggle/highlight the climate zone when the tap is opening a place-label popup —
           the click landed on a place name, not on empty climate raster ("地名ラベルをクリックする際、その
           クリック地点の気候区分までクリックされ…ないように"). */
        let onLabel=false;
        try{ const pt=point||(GE().coords.project([lng,lat]));
          if(pt&&GE().hasRenderer()){ const ls=['ofm-country','ofm-city','ofm-other','geo-sea','ofm-water','ofm-water2','ofm-river','ofm-peak'].filter(id=>GE().layers.get(id));
            if(ls.length){ const pad=(typeof HOST.isMobile==='function'&&HOST.isMobile())?15:6; const near=GE().coords.queryRenderedFeatures([[pt.x-pad,pt.y-pad],[pt.x+pad,pt.y+pad]],{layers:ls}); if(near&&near.length) onLabel=true; } } }catch(_){}
        if(!onLabel){ const code=window.sampleKoppenAt(lng,lat);
          if(code && window.kSelected){
            window.kSelected.has(code)?window.kSelected.delete(code):window.kSelected.add(code);
            if(window._buildKoppenLegend) window._buildKoppenLegend();
            if(window._refreshKoppenImage) window._refreshKoppenImage();
          }
        }
      }
    }catch(_){}
    /* On phones, tapping the map outside a legend collapses any expanded legend so it stops
       covering the map (#29). */
    try{ if(HOST.isMobile() && window._minimizeOpenLegends) window._minimizeOpenLegends(); }catch(_){}
    if(!HOST.toolMode||!HOST.hasTurf())return;
    /* (#R171) The 3-D volume tool's freehand / circle / rectangle shapes own the drag, and MapLibre
       synthesises a `click` at the end of every one of them. Without this the stroke's release would
       also drop a stray polygon vertex into measurePoints. */
    try{ if(HOST.toolMode==='volume'&&window.IntMapVolume3D&&window.IntMapVolume3D.ownsGesture()) return; }catch(_){}
    /* (#R174) …and once the polygon's "drawing complete" button has been pressed, the footprint is finished:
       a click on the map is a click on the map again, not another vertex. Reopened by the same button. */
    try{ if(HOST.toolMode==='volume'&&window.IntMapVolume3D&&window.IntMapVolume3D.isSealed&&window.IntMapVolume3D.isSealed()) return; }catch(_){}
    /* (#R11) On mobile, measuring is center-fixed: a tap does NOT add a point — only the "Add point"
       button (which calls this with viaBtn=true) adds the map-center coordinate. */
    if(HOST.isMobile() && !viaBtn) return;
    /* Polar safety (#10): the poles AND their surroundings are singular for great-circle / area
       math and make turf emit NaN or globe-wrapping geometry. Clamp out of the polar caps. */
    lat=Math.max(-88,Math.min(88,lat));
    /* Don't add a measure point if the click landed on an existing pin or intel marker */
    if(point && GE().hasRenderer()){
      try{
        const hit=GE().coords.queryRenderedFeatures(point,{layers:['user-pin-dot','news-dots','dash-dots'].filter(l=>GE().layers.get(l))});
        if(hit&&hit.length) return;
      }catch(e){}
    }
    if(HOST.toolMode==='radius'){
      const rid='r_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
      HOST.radiusItems.push({id:rid,center:[lng,lat],radiusKm: HOST.radiusKm,color:HOST.radiusColor,opacity:HOST.radiusOpacity}); window._activeRadiusId=rid;
      HOST.refreshTool(); HOST.updateToolPanel(); return;
    }
    /* === Auto-close for the Measure tool: if 3+ points and the new click lands within
       SNAP_PX of the start point (the highlighted vertex), close into AREA mode. The same
       threshold drives the on-map highlight so "add vs. close" is unambiguous (#47). */
    if(HOST.toolMode==='measure' && HOST.measurePoints.length>=3 && point){
      try{
        const pStart=GE().coords.project(HOST.measurePoints[0]);
        const dx=pStart.x-point.x, dy=pStart.y-point.y;
        if(Math.hypot(dx,dy)<HOST.SNAP_PX){
          HOST.toolMode='area'; HOST.measureSnapClose=false;
          document.getElementById('measure-tooltip').classList.remove('closing');
          HOST._syncToolBtns();
          HOST.refreshTool(); HOST.updateToolPanel();
          return;
        }
      }catch(_){}
    }
    HOST.measurePoints.push([lng,lat]); HOST.refreshTool(); HOST.updateToolPanel();
  }
  const _elevCache=new Map();
  function fmtLL(lng,lat){ return `${Math.abs(lat).toFixed(3)}°${lat>=0?'N':'S'}  ${Math.abs(lng).toFixed(3)}°${lng>=0?'E':'W'}`; }
  /* ══ ⚠⚠ (#R311) THE ROW IS BUILT ONCE AND UPDATED IN PLACE ═════════════════════════════════════
     「pointer move や map move のたびに innerHTML を作り直している箇所を…DOM 構造は初回に一度だけ生成／
       element reference を保持／変更された text node だけ更新／変更された attribute だけ更新／値が同じ
       場合は更新しない。同じ画面出力を、DOM の再利用で実現してください。」

     This is the app's hottest DOM writer. `updateCoord` already coalesces to ONE animation frame
     (#R25), and that frame then ran `el.innerHTML=parts.join('')` — six elements plus an <svg>
     thrown away and re-parsed sixty times a second, for a row in which usually nothing has changed
     but the third decimal of the latitude.

     The chips are created ONCE and kept. A frame writes a text node, a `style` property or an
     attribute only where the value it would write differs from the one already there, so a cursor
     moving inside the same metre writes nothing at all. The OUTPUT is unchanged by construction:
     the same six chips, in the same order, from the same formatters (fmtLL / HOST.elevText /
     fmtWindSpeed / IntMapCompass.point) — nothing here decides what a chip says.

     ⚠ ABSENCE IS DETACHMENT, NOT `display:none`. A chip that is not in the row must not be in the
     DOM: a hidden span would still be in `el.textContent` (which tests/r171.spec reads to prove the
     Eye chip is up) and would still be counted by any structural selector a later round writes.
     `_crOrder` moves the chips in and out, so the element holds exactly what `innerHTML` left.
     ⚠ AND THE TEXT IS A TEXT NODE, NOT MARKUP. Audited, every producer: `HOST.lastElev` is
     `elevText()` (a locale word + fmtElevVal) and `HOST.lastLayerVal` is built only by
     updateLayerReadout below — tsunami/precip/ECMWF/choropleth/Köppen/GIBS, all plain text. One of
     them, the GIBS date, is DOM text that left our code and came back (see the #R138/#R186 note in
     js/data-layers.js): it used to reach `innerHTML` here UNESCAPED, and now it reaches a text node,
     where the escaping is the browser's and cannot be forgotten. */
  const CR_ARROW='<i><svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true" focusable="false" fill="currentColor"><path d="M7 0.9 L11.1 10.2 L7 8.1 L2.9 10.2 Z"></path></svg></i>';
  const CR_LL=1, CR_ELEV=2, CR_EYE=4, CR_SAT=8, CR_WIND=16, CR_SEIS=32;
  /* the order the row has always printed — ONE list, so `_crOrder` cannot disagree with the render */
  const CR_SEQ=[{b:CR_LL,k:'ll'},{b:CR_ELEV,k:'elev'},{b:CR_EYE,k:'eye'},{b:CR_SAT,k:'sat'},{b:CR_WIND,k:'wind'},{b:CR_SEIS,k:'seis'}];
  let _crEl=null, _crChips=null, _crBits=0;
  /* the last value written to each chip — the comparison that makes an unchanged frame cost nothing */
  let _crVll='', _crVelev='', _crVeye='', _crVsat='', _crVwind='', _crVtip='', _crVrot='', _crVseis='', _crVcol='';
  /* ⚠ EACH CHIP OWNS ITS TEXT NODE, and the render writes `nodeValue`. `span.textContent=x` does not
     edit a text node — it REPLACES the span's children with a NEW one, which is a tree mutation
     (measured on 3,000 renders: 3,000 node creations and 3,000 destructions). Writing the node that
     is already there is 「変更された text node だけ更新」 literally, and costs the tree nothing.
     ⚠ No chip is ever in the row while its text is empty (the coordinates and the elevation always
     say something — the elevation falls back to '·····' — and the other four are added only when
     their value is truthy), so the empty node this creates is never in the document. */
  function _crBuild(){
    /* ⚠ no class ⇒ no `class` attribute, exactly like the bare <span> the coordinates used to get */
    const mk=(cls)=>{ const s=document.createElement('span'); if(cls) s.className=cls;
      const t=document.createTextNode(''); s.appendChild(t); return [s,t]; };
    const [ll,llT]=mk(''), [elev,elevT]=mk('cr-elev'), [eye,eyeT]=mk('cr-eye'), [sat,satT]=mk('cr-sat');
    const [seis,seisT]=mk('cr-seis'); seis.style.fontWeight='700';   /* the weight never varies; only the colour does */
    const wind=document.createElement('span'); wind.className='cr-wind';
    const warr=document.createElement('span'); warr.className='cr-warr';
    warr.innerHTML=CR_ARROW;                                 /* the glyph is STATIC — parsed once, never again */
    const windT=document.createTextNode('');
    wind.appendChild(warr); wind.appendChild(windT);          /* arrow, then "speed word" — the old order */
    return { ll, llT, elev, elevT, eye, eyeT, sat, satT, seis, seisT, wind, warr, windT };
  }
  /* Make the element's children exactly the chips `bits` names, in CR_SEQ order. Runs only when the
     SET changes — a layer switched on, the cursor left the map — never on an ordinary move. */
  function _crOrder(el,bits){
    const C=_crChips; let n=el.firstChild;
    for(let i=0;i<CR_SEQ.length;i++){
      if(!(bits&CR_SEQ[i].b)) continue;
      const w=C[CR_SEQ[i].k];
      if(n===w){ n=n.nextSibling; continue; }
      el.insertBefore(w,n);                       /* insertBefore MOVES a node that is already in the row */
    }
    while(n){ const nx=n.nextSibling; el.removeChild(n); n=nx; }
  }
  function _crShow(el,bits){
    if(!bits){ el.style.display='none'; return; }
    /* ⚠ `el` is re-resolved on every call, so if the row were ever emptied or replaced by someone
       else the chips are moved back into whatever element is there now instead of being orphaned. */
    if(el!==_crEl||bits!==_crBits){ _crEl=el; _crBits=bits; _crOrder(el,bits); }
    /* ⚠ READ the inline style, do not remember it: the mouseout handler in js/app-body.js sets this
       element's display to 'none' directly, and a remembered 'flex' would leave it hidden for good. */
    if(el.style.display!=='flex') el.style.display='flex';
  }
  function renderCoordReadout(lng,lat){
    const el=document.getElementById('coord-readout'); if(!el) return;
    if(lng!=null){ HOST._crLng=lng; HOST._crLat=lat; }
    /* (#R171) The EYE altitude is a property of the camera, not of the cursor, so it is the one chip
       that still has something true to say when the pointer is off the map. When the option is on the
       readout therefore stays up — it is the "always-on" readout, and the request was for the viewpoint
       altitude to be in it ("常時表示欄に、視点位置の高度も出るように"). */
    const eye=(()=>{ try{ return window.IntMapEyeAlt?window.IntMapEyeAlt.text():''; }catch(_){ return ''; } })();
    const C=_crChips||(_crChips=_crBuild());
    if(HOST._crLng==null){
      if(!eye){ el.style.display='none'; return; }
      if(eye!==_crVeye){ _crVeye=eye; C.eyeT.nodeValue=eye; }
      _crShow(el,CR_EYE); return; }
    let bits=CR_LL|CR_ELEV;
    const _ll=fmtLL(HOST._crLng,HOST._crLat); if(_ll!==_crVll){ _crVll=_ll; C.llT.nodeValue=_ll; }
    const _ev=HOST.lastElev||'·····'; if(_ev!==_crVelev){ _crVelev=_ev; C.elevT.nodeValue=_ev; }
    if(eye){ bits|=CR_EYE; if(eye!==_crVeye){ _crVeye=eye; C.eyeT.nodeValue=eye; } }
    if(HOST.lastLayerVal){ bits|=CR_SAT; const _sv=HOST.lastLayerVal; if(_sv!==_crVsat){ _crVsat=_sv; C.satT.nodeValue=_sv; } }
    /* (#R8c) Live wind speed/direction under the cursor while the Wind layer is on. */
    /* (#R19) No emoji in the always-on readout ("🌬みたいな絵文字は…いらない") — value + direction only. */
    /* ══ (#R289) THE DIRECTION IS A WORD IN THE READER'S LANGUAGE, AND AN ARROW THAT MOVES ═════════
       「風向きも、矢印を動的に動くように表示してください。また、日本語設定でも…NEと表示されますが、
         ちゃんと北東と書くように。」
       · the WORD comes from js/compass.js — the one table, so this chip cannot say 「NE」 in Japanese
         while some other chip says 北東 (that is why the table is a file and not a line here);
       · the ARROW points DOWNWIND, i.e. `dir + 180`, because `dir` is the meteorological FROM
         bearing (js/weather.js: atan2(-u,-v)) and the particles on the map beside it fly the other
         way. An arrow that disagreed with the animation it sits next to would be worse than none.
       ⚠ THE ANIMATION'S PHASE IS CARRIED, NOT RESTARTED. This whole readout is rebuilt with
       `innerHTML` on every mousemove, so a CSS keyframe animation on a freshly created node would be
       re-seeded at t=0 sixty times a second and the arrow would sit still while the pointer moves —
       a "dynamic" arrow that is only dynamic when nobody is touching the map. A NEGATIVE
       `animation-delay` taken from a shared clock puts each new node at the phase the old one had
       reached, so the drift is continuous across every rebuild.
       ⚠ (#R311) THE PREMISE OF THAT PARAGRAPH NO LONGER HOLDS, and it is kept because it is why the
       drift and its phase carry were built (#R290 then removed them, by request). The row is not
       rebuilt any more: this arrow is ONE node for the life of the page, so nothing about it is
       ever re-seeded, and only its `transform` is written — and only when the bearing changes. */
    try{ if(window.Wind&&window.Wind.on&&window.Wind.on()){ const w=window.Wind.sampleAt(HOST._crLng,HOST._crLat); if(w){
      const card=window.IntMapCompass.point(w.dir,HOST.lang,8);
      const sp=window.fmtWindSpeed?window.fmtWindSpeed(w.speed):(w.speed.toFixed(1)+' m/s');
      const to=((w.dir+180)%360).toFixed(1);
      /* seconds per drift cycle: a calm breeze crawls, a jet streaks. Clamped so neither end stops
         nor strobes. */
      /* ══ (#R290) THE ARROW POINTS. IT DOES NOT DRIFT. ═══════════════════════════════════════
         「風レイヤーのホバー地点の風向きの座標標高常時表示欄での表示は、風の流れる向きに動かさなくて
           よい。向きだけ表示しろ。」 #R289 gave this glyph a speed-scaled drift along its own axis,
         carried across the `innerHTML` rebuild with a negative animation-delay. The reader has
         asked for the direction and nothing else, so the motion — and the machinery that existed
         only to keep it continuous — is gone. The rotation stays: it IS the direction. */
      const tip=L('Wind from the {d} — the arrow points the way it is blowing','{d}の風 — 矢印は風が吹いていく向き','Wind aus {d} — der Pfeil zeigt die Windrichtung','Ветер с направления {d} — стрелка показывает, куда он дует','Viento del {d} — la flecha apunta hacia donde sopla').replace('{d}',card);
      /* (#R311) three values, three comparisons: the text beside the arrow, the tooltip, the bearing.
         ⚠ THE TOOLTIP IS SET AS AN ATTRIBUTE, so `window.IntMapSafe.html()` is not merely unnecessary
         here — it would be WRONG. That helper escapes a string on its way into HTML SOURCE; the
         browser un-escapes it again when it parses the attribute, so the attribute VALUE has always
         been the raw `tip`. Writing the escaped form straight into the attribute would show a reader
         「Vent de &#39;Est」 the first time a translation contains an apostrophe. There is no HTML
         string left to escape — the sink is a property, and the escaping is the browser's. */
      const _wt=sp+' '+card;   if(_wt!==_crVwind){ _crVwind=_wt; C.windT.nodeValue=_wt; }
      if(tip!==_crVtip){ _crVtip=tip; C.wind.title=tip; }
      const _rot='rotate('+to+'deg)'; if(_rot!==_crVrot){ _crVrot=_rot; C.warr.style.transform=_rot; }
      bits|=CR_WIND;
    } } }catch(_){}
    /* ══ (#R190) THE INTENSITY UNDER THE CURSOR ═══════════════════════════════════════════════════
       「ホバー地点の震度は色付きで左下の座標標高常時表示欄に表示して。」 The value and its colour come
       from the seismic simulator's OWN painted field (IntMapSeismic.intensityAt), not from a second
       computation here — the corner and the map can then never disagree, which is exactly the defect
       #R136 records when a detector and a painter are written twice. Absent while the simulator is
       closed or the point is outside the painted area. */
    try{ const S=window.IntMapSeismic;
      if(S&&S.intensityAt){ const q=S.intensityAt(HOST._crLng,HOST._crLat);
        /* (#R311) the label and the colour move independently — a cursor crossing a contour changes
           both, a cursor inside one class changes neither. `q.col` is a '#rrggbb' from the field's
           own ramp (js/seismic.js `_mmiHex` / the JMA class table), so the CSSOM takes it verbatim. */
        if(q&&q.label){ bits|=CR_SEIS;
          if(q.label!==_crVseis){ _crVseis=q.label; C.seisT.nodeValue=q.label; }
          if(q.col!==_crVcol){ _crVcol=q.col; C.seis.style.color=q.col; } } } }catch(_){}
    /* Satellite-imagery chip removed from the readout per request — coords + elevation only. */
    _crShow(el,bits);
  }
  /* === Instant elevation/depth from cached terrarium DEM tiles (includes ocean bathymetry) === */
  const _demCache=new Map();
  /* ══ ⚠⚠ (#R221) THE PICTURE THAT NEEDS 520 TILES WAS SHARING A CACHE THAT HOLDS 140 ═════════════
     「震度分布はたまに単なる同心円になることがある。ふざけるな。」

     The intensity field's site term is a slope read off this DEM, and where a cell has no DEM the
     field uses the panel's single site class instead — one amplification everywhere, so the
     intensity becomes a function of distance alone, which is drawn as perfect rings. #R216 named
     that mechanism and closed ONE of its two doors (the slope-baseline give-up). This is the other,
     and it is arithmetic rather than luck:

         one continental field asks for up to  520 tiles  (1,600 since #R216 raised the ceiling
                                                            for fields that need a finer baseline)
         _DEM_CACHE_MAX                          560 desktop  ·  **140 on a phone**

     Every request past the budget evicts a tile ALREADY FETCHED FOR THE SAME PICTURE. By the time
     `demSnapshot()` runs — after the warm-up, which is the only moment it takes strong references —
     most of what arrived has been thrown away, `noDem` covers the map, and the whole field is
     concentric. On a phone it cannot even hold a quarter of one field, which is why the report says
     たまに: it depends on the magnitude (the span), the zoom the span picks, and the device.

     A build now PINS the tiles it is depending on. Pinned keys are exempt from the trim and the
     ceiling floats above them, so an ordinary mouse-move over the map still evicts normally and
     nothing about the steady state changes — the pin exists only between `hold` and `release`. */
  const _demHold=new Set();
  function _demCap(){ return HOST._DEM_CACHE_MAX+_demHold.size; }
  function _demCacheTrim(){ if(_demCache.size<=_demCap()) return;
    for(const k of _demCache.keys()){ if(_demCache.size<=_demCap()) break;
      if(_demHold.has(k)) continue;                       /* a build is reading this one */
      const v=_demCache.get(k); if(v==='loading') continue; _demCache.delete(k); } }
  /* ══ ⚠⚠ (#R223) A CACHED TILE IS 65,536 ELEVATIONS, NOT A CANVAS AND AN RGBA COPY ═══════════════
     「モバイル版がまだ劇的に遅い。…ブラウザが落ちることもある。」

     #R19 decoded each tile ONCE into an RGBA buffer instead of per sample, which fixed a freeze.
     What it left behind is what a cached tile COSTS: the <canvas> keeps its own 256×256 backing
     store (256 kB) and `__pix` is a second 256 kB copy of the same pixels hanging off it. Half a
     megabyte a tile — and #R221 taught the intensity field to PIN every tile it depends on, up to
     1,600 of them (#R216's budget). That is 800 MB of retained canvas for one picture, on a device
     whose whole tab budget may be under a gigabyte. It is the most plausible thing in this app that
     ends in the browser closing the tab, and it is arithmetic rather than a guess.

     A tile is now decoded AT LOAD into a `Float32Array(65536)` of metres and neither the canvas nor
     the RGBA copy is kept:
         canvas 256 kB + RGBA 256 kB  →  Float32Array 256 kB      (half, per tile)
     ⚠ IT IS EXACT. terrarium encodes height as R·256 + G + B/256 − 32768, whose smallest step is
     1/256 m and whose range is ±32,768 m; a float32 mantissa holds 24 bits, so every value the
     format can express is representable without rounding. This is a storage change, not a
     resampling one — the samplers below read the same numbers they read before.
     ⚠ AND IT MOVES THE `getImageData` OFF THE CRITICAL PATH. It used to happen lazily, which meant
     ALL of it happened inside `demSnapshot` — measured at 2.8–3.4 s for one continental field,
     charged to a progress bar that had already reached 40 %. Now it happens once per tile as the
     tile lands, i.e. inside the network wait that is going on anyway.
     ⚠ ONE decode canvas for the whole app, reused. Creating 700 canvases to throw 700 away is the
     other half of the allocation this removes. */
  let _decCv=null, _decCtx=null;
  /* ══ ⚠⚠⚠ (#R265) THE ELEVATION DATA HAS HOLES, AND EVERY ONE OF THEM WAS −32,768 m OF GROUND ════
     「地形編集・水流でたまに、直線で地形を完全無視するクソ区間がある。」 — a FIFTH report, and the first four
     rounds all looked at the walk. The walk was never the problem. MEASURED on the shipped build,
     fetching the tiles directly from the bucket:

         https://…/terrarium/14/9101/5896.png   256×256, loads fine, alpha 255 everywhere,
                                                 and ALL 65,536 pixels are RGB(0,0,0)

     terrarium encodes height as R·256 + G + B/256 − 32768, so RGB(0,0,0) decodes to −32,768 m. The
     same ground one level down reads **85.61 m**. Around the Sava floodplain **14 of 49** z14 tiles
     are like this (Lake Biwa, Death Valley, W-Siberia, Tokyo Bay and Lake Geneva: 0 of 49 each) —
     which is exactly 「たまに」, and exactly why four rounds of path fixes could not remove it.

     What that did to the water: MEASURED on js/terrain-water.js's working grid over that place,
     **2,240 of 7,680 sampled cells (29.2 %) read −32,768 m**, and `demMissing` was **0** — nothing
     was missing, because a number came back. A 1.7 km square of −32.8 km ground is a bottomless pit
     to the priority flood and, to the crossing refinement, a region whose `max(0, e − lo)` term is
     zero everywhere — i.e. FREE TO CROSS — so the least-cost path dives in and runs dead straight,
     because inside the void nothing but distance costs anything. That is the reported symptom.
     (Lake Biwa's largest basin reported `level: −7,800.7 m` against a spill of 81 m for the same
     reason — a bilinear blend of one void corner with three real ones.)

     ⚠ THE GUARD IS PHYSICAL, NOT A MAGIC NUMBER. The deepest point on Earth is the Challenger Deep
     at −10,935 m, and terrarium's own bathymetry bottoms out just above that, so nothing this
     dataset can legitimately say is under −12,000 m. A reading below that is not ground.
     ⚠ AND A HOLE IS NOT AN ENDING. `demElevAt` steps DOWN the pyramid instead — the parent tile
     covers the same place with real, published, coarser data (85.61 m at z12 where z14 is void) —
     and the parent is requested the moment a holed tile decodes, so the fallback has something to
     read. What cannot be answered at any level is counted and reportable (#R185: no silent caps). */
  const DEM_NODATA_BELOW=-12000;   /* Challenger Deep is −10,935 m — under this is not Earth */
  const DEM_VOID_MIN_Z=6;          /* how far down the pyramid a hole may be chased */
  const DEM_VOID_STEPS=4;
  const _demVoid={ tiles:0, holedTiles:0, cells:0, fallbacks:0, unfilled:0 };
  function _decodeTile(img){
    try{
      if(!_decCv){ _decCv=document.createElement('canvas'); _decCv.width=256; _decCv.height=256;
        _decCtx=_decCv.getContext('2d',{willReadFrequently:true}); }
      if(!_decCtx) return null;
      _decCtx.clearRect(0,0,256,256);
      _decCtx.drawImage(img,0,0,256,256);
      const d=_decCtx.getImageData(0,0,256,256).data;
      const out=new Float32Array(65536);
      let voids=0;
      for(let i=0,o=0;i<65536;i++,o+=4){
        /* an untouched pixel of the cleared canvas is (0,0,0,0) and a void terrarium pixel is
           (0,0,0,255); both decode to −32,768, and both are «no data», not «32.8 km down» */
        const v=(d[o]*256+d[o+1]+d[o+2]/256)-32768;
        if(d[o+3]===0||!(v>DEM_NODATA_BELOW)){ out[i]=NaN; voids++; } else out[i]=v;
      }
      if(voids){ _demVoid.cells+=voids; _demVoid.holedTiles++; if(voids===65536) _demVoid.tiles++; }
      return { el:out, voids };
    }catch(e){ return null; }
  }
  /* the decoded elevations for a cache entry — a Float32Array, or null while loading / after a failure */
  function _demPix(v){ return (v&&v!=='loading'&&v.length===65536)?v:null; }
  function _ll2tile(lng,lat,z){ const n=Math.pow(2,z); const x=(lng+180)/360*n; const lr=lat*Math.PI/180; const y=(1-Math.log(Math.tan(lr)+1/Math.cos(lr))/Math.PI)/2*n; return {x,y,n}; }
  /* ══ ⚠ (#R223) FOUR HOST NAMES FOR ONE BUCKET — THE INTENSITY FIELD IS CONNECTION-BOUND ══════════
     「地震と津波シミュレータの計算速度を爆速にして。ただし品質は一切落とさないように。」

     MEASURED on the shipped build (M7.5 over Tokyo, phone viewport): the whole field takes 15.8 s
     and the ARITHMETIC is 0.5 s of it. 9.1 s is spent waiting for 702 DEM tiles, which is not
     bandwidth — a browser opens at most six connections to one host over HTTP/1.1, so 702 tiles are
     117 sequential rounds of six no matter how fast the link is.

     The same public bucket answers on four host names (the same four scripts/build-bathymetry.mjs
     already uses), so the six-connection limit becomes twenty-four. ⚠ The host is a DETERMINISTIC
     function of the tile, so a tile always has one URL and the HTTP cache still hits. ⚠ All four
     were checked from the page, not from Node (#R216's lesson): all four load and none taints the
     canvas. ⚠ Same bytes, same dataset, same attribution — this is a transport change. */
  const _DEM_HOSTS=[
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium',
    'https://elevation-tiles-prod.s3.amazonaws.com/terrarium',
    'https://elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com/terrarium',
    'https://elevation-tiles-prod.s3.us-east-1.amazonaws.com/terrarium'];
  function _demURL(z,x,y){ return _DEM_HOSTS[(x+y)&3]+'/'+z+'/'+x+'/'+y+'.png'; }
  /* Pick a DEM tile-zoom matched to the map zoom. Zoomed out → low z (a handful of tiles cover the
     whole view, so the readout is instant everywhere). Zoomed in → high z (sharper elevation). */
  function demZoomForMap(){ let mz=4; try{ if(GE().hasRenderer()) mz=GE().camera.getZoom(); }catch(_){} return Math.max(3,Math.min(12,Math.round(mz)+1)); }
  function demElevAt(lng,lat,onReady,zArg,_step){
    const z=(zArg!=null?zArg:demZoomForMap()); const tl=_ll2tile(lng,lat,z); const xi=Math.floor(tl.x), yi=Math.floor(tl.y);
    if(xi<0||yi<0||xi>=tl.n||yi>=tl.n||lat>85||lat<-85) return null;
    const key=z+'/'+xi+'/'+yi; let c=_demCache.get(key);
    if(c===undefined){
      _demCacheTrim();
      _demCache.set(key,'loading');
      const img=new Image(); img.crossOrigin='anonymous';
      /* (#R223) decode straight to elevations and let the <img> go — see _decodeTile */
      img.onload=()=>{ const r=_decodeTile(img); _demCache.set(key,(r&&r.el)||null);
        /* (#R265) a tile with holes in it: ask for its PARENT now, so the fallback below has real
           ground to read by the time anything samples this place. One extra tile per holed tile. */
        if(r&&r.voids&&z>DEM_VOID_MIN_Z){ try{ demElevAt(lng,lat,onReady,z-1,0); }catch(_){} }
        if(r&&r.el&&onReady) onReady(); };
      /* ⚠ (#R221) A FAILED TILE USED TO BE DEAD FOR THE WHOLE SESSION. `null` is the "asked and got
         nothing" marker, and nothing ever cleared it — so one dropped request (a phone changing
         network, a 503 from the tile host) left a permanent hole that every later intensity field
         painted with the fallback site class. The marker is kept, so the field being built right now
         still sees a definite answer rather than waiting, and it EXPIRES a few seconds later so the
         next build asks again. Bounded: one retry per tile per 4 s, never a loop. */
      img.onerror=()=>{ _demCache.set(key,null);
        setTimeout(()=>{ if(_demCache.get(key)===null) _demCache.delete(key); },4000); };
      img.src=_demURL(z,xi,yi);
      return null;
    }
    if(c==='loading'||c===null) return null;
    /* (#R19) read from the per-tile decoded buffer — no per-sample getImageData
       (#R223) …which is now a Float32Array of metres, so the read is one index */
    const d=_demPix(c); if(!d) return null;
    const px=Math.min(255,Math.max(0,Math.floor((tl.x-xi)*256))), py=Math.min(255,Math.max(0,Math.floor((tl.y-yi)*256)));
    const raw=d[py*256+px];
    /* (#R265) NaN is a hole in the published data, not an elevation — step down the pyramid, where
       the same place is covered by real (coarser) ground. Bounded, and counted when it runs out. */
    if(raw!==raw){
      const st=_step||0;
      if(st<DEM_VOID_STEPS&&z>DEM_VOID_MIN_Z){ _demVoid.fallbacks++; return demElevAt(lng,lat,onReady,z-1,st+1); }
      _demVoid.unfilled++; return null;
    }
    return _edited(lng,lat,raw);
  }
  /* ══ (#R255) SCULPTED GROUND IS THE GROUND ═══════════════════════════════════════════════════════
     「盛る、削るはそれに合わせて実際の標高や3D表示も対応させろ。堤防・ダムも同様」 The terrain
     sculptor (js/terrain-water.js) held its edits in a private height field and painted a coloured
     overlay for them, so the app's own elevation readout — and everything that reads through it, the
     profile, the line-of-sight viewshed, the insolation model — still answered with the ground as it
     was before the edit. One hook, published by the module that OWNS the edit, consulted by the one
     function every one of those callers already goes through. Absent hook = unchanged behaviour. */
  function _edited(lng,lat,v){
    if(v==null) return v;
    try{ const f=window.IntMapElevEdit; return f?f(lng,lat,v):v; }catch(_){ return v; }
  }
  /* === Shared async DEM sampler (#R12) — used by the elevation profile and line-of-sight viewshed.
     Warms every terrarium tile covering a set of points, then samples them LOCALLY. The terrarium
     DEM carries ocean bathymetry (negative = below sea level), so profiles dip under water and the
     viewshed reads real terrain — replacing the old per-point Open-Meteo fetch that fired hundreds
     of requests at once and silently failed (the root cause of "Line of Sight doesn't work"). */
  function _demZoomForSpan(km){ return Math.max(5, Math.min(13, Math.round(Math.log2(481000/Math.max(1,km))))); }
  /* (#R18) onProgress(frac 0..1) lets callers (Line of Sight / elevation profile) show a real % + bar
     while the covering DEM tiles load — the slow part of a viewshed ("計算の進捗をパーセントで表示"). */
  /* (#R221) `hold` pins every tile this call warms until `releaseDEMHold()` — see _demCacheTrim.
     ⚠ The caller MUST release in a `finally`, or the cache keeps growing for the rest of the session. */
  function warmDEMTiles(points, z, timeoutMs, onProgress, hold){
    const keys=new Set();
    points.forEach(p=>{ if(!p) return; const tl=_ll2tile(p[0],p[1],z); const xi=Math.floor(tl.x), yi=Math.floor(tl.y); if(xi>=0&&yi>=0&&xi<tl.n&&yi<tl.n){ keys.add(z+'/'+xi+'/'+yi); } });
    if(hold) keys.forEach(k=>_demHold.add(k));
    /* ⚠ PIN FIRST, REQUEST SECOND. `demElevAt` calls `_demCacheTrim` before it inserts, so asking
       for the tiles while building the key set means the first requests of a big field are evicted
       by its own later ones — the exact loop this pin exists to break. */
    points.forEach(p=>{ if(p) demElevAt(p[0],p[1],null,z); });
    const total=keys.size||1;
    return new Promise(res=>{ const t0=Date.now(); (function poll(){ let pending=0; keys.forEach(k=>{ const c=_demCache.get(k); if(c===undefined||c==='loading') pending++; }); if(onProgress){ try{ onProgress((total-pending)/total); }catch(_){} } if(pending===0||Date.now()-t0>(timeoutMs||9000)) res(); else setTimeout(poll,90); })(); });
  }
  function releaseDEMHold(){ _demHold.clear(); _demCacheTrim(); }
  /* (#R221) ONE POINT PER TILE over the rectangle demSnapshot will read — INCLUDING the ±1 tile
     margin it expands by. The intensity field used to warm a fixed 33 × 33 lattice of positions,
     which is neither necessary (many samples land in the same tile) nor sufficient (a field whose
     tile grid is wider than 33 leaves whole columns unrequested, and those columns then paint with
     the fallback site class — a stripe of "concentric" through an otherwise terrain-shaped field).
     Asking the tile grid itself makes the warm-up exactly the set demSnapshot will look for. */
  /* (#R223) `keep(lng,lat,halfLngDeg,halfLatDeg)` — an optional filter over the tile grid, given a
     tile's centre and its own half-extent. The intensity field passes a land test through it so a
     picture whose box is mostly ocean stops paying for the ocean; demSnapshot takes the SAME filter
     so `want`/`missing` still describe the set that was actually asked for (otherwise the skipped
     tiles read as failures and trigger the retry passes this is meant to make unnecessary). */
  function _demTileGrid(w,s,e,n,z,keep,fn){
    const N=Math.pow(2,z);
    const t0=_ll2tile(Math.max(-179.999,w),Math.min(85,n),z), t1=_ll2tile(Math.min(179.999,e),Math.max(-85,s),z);
    const x0=Math.max(0,Math.floor(t0.x)-1), x1=Math.min(N-1,Math.floor(t1.x)+1);
    const y0=Math.max(0,Math.floor(t0.y)-1), y1=Math.min(N-1,Math.floor(t1.y)+1);
    const latOf=(gy)=>{ const ly=Math.PI*(1-2*gy/N); return 180/Math.PI*Math.atan(0.5*(Math.exp(ly)-Math.exp(-ly))); };
    const hLng=180/N;
    for(let yi=y0;yi<=y1;yi++){
      const lat=latOf(yi+0.5), hLat=Math.abs(latOf(yi)-latOf(yi+1))/2;
      for(let xi=x0;xi<=x1;xi++){
        const lng=(xi+0.5)/N*360-180;
        if(keep&&!keep(lng,lat,hLng,hLat)) continue;
        fn(xi,yi,lng,lat);
      }
    }
  }
  function demTilePoints(w,s,e,n,z,keep){
    const out=[];
    _demTileGrid(w,s,e,n,z,keep,(xi,yi,lng,lat)=>out.push([lng,lat]));
    return out;
  }
  /* ══ (#R191) A SNAPSHOT, SO A PICTURE BUILT OVER SEVERAL FRAMES CANNOT CHANGE UNDER IT ═════════════
     「震度分布の色塗りが、たまにバグって縞々になる場合がある。」 — and the stripes are horizontal, in
     bands, which is the shape of the answer. The intensity field paints ~83,000 cells and yields to the
     event loop every eight rows so it can show a percentage; each row then asks THIS cache for its
     elevations. Between two yields the cache is not the same object it was:
       · tiles requested by warmDEMTiles keep ARRIVING (its timeout returns whatever landed, and the
         rest resolve later), so a row computed at 3 s sees ground a row computed at 1 s did not — no
         DEM means the panel's fallback site class, a DEM means the slope-derived one, and the two
         differ by a whole amplification factor;
       · and `_demCacheTrim` EVICTS while it does. The budget is 560 tiles on desktop and 140 on a
         phone; a continental field asks for up to 520 of its own, and every mouse move over the map
         inserts more at a different zoom. Tiles the field had already used get dropped mid-build.
     Both make the picture depend on WHEN a row was computed, in bands exactly as wide as the yield
     interval. This hands the caller a fixed set of decoded tile buffers — strong references, so no
     eviction can reach them, and no new request can add to them — and every sample the field takes
     comes out of that set. What is missing is missing for the whole picture, and is counted once. */
  function demSnapshot(w,s,e,n,z,keep){
    const tiles=new Map(); const N=Math.pow(2,z);
    let have=0, want=0;
    _demTileGrid(w,s,e,n,z,keep,(xi,yi)=>{
      want++; const d=_demPix(_demCache.get(z+'/'+xi+'/'+yi));
      if(d){ have++; tiles.set(xi+'/'+yi,d); } });
    /* ⚠ named, so `at` can reach `rowSampler` without `this` — a caller that detaches the method
       (`const f=snap.at`) would otherwise get a TypeError instead of an elevation. */
    const api={ z, want, have, missing:want-have,
      /* the same bilinear read as demElevBilinear, against the frozen buffers.
         ⚠ (#R226) …AND IT IS NOW THE ROW SAMPLER, CALLED ONCE. Keeping a second copy of the bilinear
         here is how the two would eventually disagree, and the ONE property this round's speed-up
         has to have is that the number does not move (「品質を下げない範囲で」). Delegating makes that
         true by construction rather than by a test that samples a few thousand points and hopes.
         The cursor readout calls this a few times a second, so the closure it allocates is free. */
      at(lng,lat){ return api.rowSampler(lat)(lng); },
      /* ══ ⚠ (#R226) A ROW OF SAMPLES SHARES ITS LATITUDE, AND `at()` RE-DERIVED IT EVERY TIME ══════
         「地震と津波の計算速度は品質を下げない範囲で爆速に。」
         The intensity field walks a REGULAR grid and takes three samples per cell, so at this round's
         2,560² ceiling that is 19.7 million reads — and every one of them used to evaluate
         `Math.tan`, `Math.cos`, `Math.log` and `Math.pow` (inside `_ll2tile`) and then build a
         STRING, `xi+'/'+yi`, to index a Map. All four transcendentals depend on the LATITUDE alone,
         which is constant along a row, and consecutive cells in a row sit in the same tile for
         hundreds of samples at a time (one z8 tile is ~150 km; a cell is 1 km).
         So a row is prepared once — the Mercator y, the tile row, the two pixel rows and the vertical
         weight — and the returned sampler does one divide, one floor and a compare per sample, with
         the tile buffer memoised until the column crosses a tile edge.
         ⚠ THE ARITHMETIC IS THE SAME ARITHMETIC, expression for expression: `yy` is `_ll2tile`'s y,
         `xx` is its x, and the four-texel blend below is the same product. What changed is how often
         the row half of it is evaluated. */
      rowSampler(lat){
        if(!(lat<=85&&lat>=-85)) return ()=>null;
        const lr=lat*Math.PI/180;
        const yy=(1-Math.log(Math.tan(lr)+1/Math.cos(lr))/Math.PI)/2*N;
        const yi=Math.floor(yy);
        if(yi<0||yi>=N) return ()=>null;
        const fy=(yy-yi)*256-0.5;
        const ay=Math.max(0,Math.min(255,Math.floor(fy))), by=Math.min(255,ay+1);
        const ty=Math.max(0,Math.min(1,fy-ay)), ty1=1-ty;
        const rA=ay*256, rB=by*256;
        let lastXi=-1, d=null;
        return (lng)=>{
          const xx=(lng+180)/360*N, xi=Math.floor(xx);
          if(xi<0||xi>=N) return null;
          if(xi!==lastXi){ lastXi=xi; d=tiles.get(xi+'/'+yi)||null; }
          if(!d) return null;
          const fx=(xx-xi)*256-0.5;
          const ax=Math.max(0,Math.min(255,Math.floor(fx))), bx=Math.min(255,ax+1);
          const tx=Math.max(0,Math.min(1,fx-ax)), tx1=1-tx;
          const a=d[rA+ax], b=d[rA+bx], c=d[rB+ax], e=d[rB+bx];
          /* (#R265) the same renormalisation demElevBilinear does — this sampler feeds the seismic
             and tsunami fields, which were reading −32,768 m as ground wherever a tile has holes.
             No hole at all (the overwhelming case) is the original expression, term for term. */
          if(a===a&&b===b&&c===c&&e===e) return (a*tx1+b*tx)*ty1+(c*tx1+e*tx)*ty;
          const wa=tx1*ty1, wb=tx*ty1, wc=tx1*ty, we=tx*ty;
          let sum=0, wsum=0;
          if(a===a){ sum+=a*wa; wsum+=wa; } if(b===b){ sum+=b*wb; wsum+=wb; }
          if(c===c){ sum+=c*wc; wsum+=wc; } if(e===e){ sum+=e*we; wsum+=we; }
          return (wsum>0)?(sum/wsum):null;
        };
      } };
    return api;
  }
  /* (#R18) Bilinear DEM sample for the viewshed — smooths the stair-stepping of nearest-pixel sampling so
     ridge lines (which decide what's blocked) are physically truer. Reads the 4 surrounding texels and
     interpolates; falls back to nearest at tile edges. Tiles must already be warm (LOS warms them first). */
  function demElevBilinear(lng,lat,z){
    const tl=_ll2tile(lng,lat,z); const xi=Math.floor(tl.x), yi=Math.floor(tl.y);
    if(xi<0||yi<0||xi>=tl.n||yi>=tl.n||lat>85||lat<-85) return null;
    const cv=_demCache.get(z+'/'+xi+'/'+yi); if(!cv||cv==='loading') return null;
    const d=_demPix(cv); if(!d) return null;   /* (#R19) decoded once per tile, not per sample */
    const fx=(tl.x-xi)*256-0.5, fy=(tl.y-yi)*256-0.5;
    const x0=Math.max(0,Math.min(255,Math.floor(fx))), y0=Math.max(0,Math.min(255,Math.floor(fy)));
    const x1=Math.min(255,x0+1), y1=Math.min(255,y0+1); const tx=Math.max(0,Math.min(1,fx-x0)), ty=Math.max(0,Math.min(1,fy-y0));
    const a=d[y0*256+x0], b=d[y0*256+x1], c=d[y1*256+x0], e=d[y1*256+x1];
    /* ⚠ (#R265) ONE VOID CORNER USED TO POISON THE WHOLE BLEND. A quarter of −32,768 mixed with
       three real 85 m corners is −7,800 m — which is precisely the level js/terrain-water.js
       reported for Lake Biwa's largest basin. Weights are renormalised over the corners that
       actually carry data; with none of them the pyramid fallback in demElevAt answers instead. */
    const wa=(1-tx)*(1-ty), wb=tx*(1-ty), wc=(1-tx)*ty, we=tx*ty;
    let sum=0, wsum=0;
    if(a===a){ sum+=a*wa; wsum+=wa; } if(b===b){ sum+=b*wb; wsum+=wb; }
    if(c===c){ sum+=c*wc; wsum+=wc; } if(e===e){ sum+=e*we; wsum+=we; }
    if(!(wsum>0)) return demElevAt(lng,lat,null,z);
    return _edited(lng,lat,sum/wsum);   /* (#R255) …and the sculpted delta */
  }
  /* Elevation/depth respects the measurement-units setting (#R13c): imperial → feet, both → "m (ft)". */
  function fmtElevVal(e){ const m=Math.round(e), ft=Math.round(e*3.28084); const um=(typeof HOST.unitMode!=='undefined')?HOST.unitMode:'both'; return um==='imperial'?(ft.toLocaleString()+' ft'):um==='metric'?(m.toLocaleString()+' m'):(m.toLocaleString()+' m ('+ft.toLocaleString()+' ft)'); }
  /* Live weather-layer value at the cursor: Köppen is an instant pixel sample, an ECMWF raster is an
     instant lookup in the field it was drawn from, and a NASA GIBS raster names its dataset and date.
     ⚠ (#R276) THE DEBOUNCED PER-CELL Open-Meteo FETCH AND ITS 0.25° CACHE ARE GONE. They existed to
     hide the latency of asking a live API for a number that did not belong to the layer on screen —
     the defect, not the latency, was the problem. Nothing here touches the network any more. */
  /* (#R288) the merged temperature layer's reanalysis source is a GIBS raster with no point
     service, so it names its dataset (below) rather than printing a forecast number for it. */
  function _ecSource(){ try{ const W=window.IntMapWeatherEC; return (W&&W.source)?W.source('ec-temp'):'ecmwf'; }catch(_){ return 'ecmwf'; } }
  function activeWxLayer(){ const on=id=>{ const cb=document.getElementById('dl-'+id); return cb&&cb.checked; }; return on('sst')?'sst':(on('ec-temp')&&_ecSource()==='merra2')?'temp':on('climate')?'climate':null; }
  /* ══ (#R276) THE NUMBER UNDER THE CURSOR BELONGS TO THE PICTURE UNDER THE CURSOR ═══════════════
     「地図上の地点値は、表示中のレイヤー・モデル・時刻と同じデータから取得する。NASA過去レイヤー表示中に
       Open-Meteo現在値を返す現状は禁止する。」

     What this used to do, MEASURED: with the NASA `temp` layer on — MERRA-2 monthly-mean 2 m air
     temperature for a date chosen in the layer's own date picker, which defaults to two days ago and
     can be set to any past month — it fetched `api.open-meteo.com/…&current=temperature_2m` and
     printed that. A live reading, to three significant figures, sitting under a monthly mean from
     another dataset for another time. The same for `sst`, against a GHRSST composite.

     Two rules now:
       ① if an ECMWF raster is on, the value comes from THAT variable, THAT model run and THAT valid
          time — the identical Float32Array the tiles were rendered from (IntMapECMWF.valueNow), so
          the readout cannot disagree with the colour it is standing on;
       ② a GIBS layer has no point-value service, so it names its dataset and the date it is showing
          and stops there. A blank is honest; a number from somewhere else is not. */
  const _GIBS_WHEN={
    temp:()=>L('MERRA-2 monthly mean','MERRA-2 月平均','MERRA-2 Monatsmittel','MERRA-2 среднемесячное','MERRA-2 media mensual'),
    sst:()=>L('GHRSST MUR L4','GHRSST MUR L4','GHRSST MUR L4','GHRSST MUR L4','GHRSST MUR L4')
  };
  /* ══ ⚠⚠⚠ (#R290) THE NUMBER EXISTED FOR ONE LAYER AND ONE ONLY ═════════════════════════════
     「気温レイヤーに…ホバー地点の数値を座標標高常時表示欄に表示しろ。」
     `IntMapECMWF.valueNow` reads the decoded field the module is HOLDING, and the only thing that
     ever asked it to hold one was the animated wind — the raster layers are painted by the tile
     SDK straight from `om://` and never call `load()`. So this function returned null for every
     ECMWF raster there has ever been, silently, and the corner printed nothing.
     Two halves to the fix: js/wx-ecmwf.js can now hold more than one variable's frame at a time
     (a single slot would evict the wind's and stop the particles), and this asks for the one the
     cursor is actually over — ONCE per variable and valid time, for the latitude band on screen,
     which is the same ~1.6 MB read the wind already makes. `field` is emitted when it lands and
     the readout re-renders, so the number appears without a second hover. */
  /* ⚠ SUBSCRIBED FROM INSIDE, NOT AT FACTORY LEVEL. `tests/r169 #4` requires that a factory body
     only DECLARES — a statement that runs while the factory runs takes its side effect with it and
     reads closure state in the #R167 dead zone. The hook is attached the first time a reader
     hovers over an ECMWF layer, which is the first moment it can matter. */
  let _fieldAsk='', _fieldSub=false;
  function askEcField(cfg){
    try{
      const EC=window.IntMapECMWF; if(!EC) return;
      if(!_fieldSub){ _fieldSub=true;
        try{ EC.on(ev=>{ if(ev&&ev.type==='field'){ try{ window.renderCoordReadout&&window.renderCoordReadout(); }catch(_){} } }); }catch(_){} }
      /* ⚠ (#R290 追記) `bandNear`, not `bandFor` — a POINT value must never ask for the planet, or
         it evicts the wind's field. See the note on FRAME_SAMPLES in js/wx-ecmwf.js. */
      let band=null; try{ const b=GE().camera.getBounds(); band=EC.bandNear(b.getSouth(),b.getNorth()); }catch(_){}
      /* ⚠ THE BAND IS PART OF THE REQUEST, so it has to be part of the 「already asked」 key. The
         field is read for the latitudes on screen (#R288); a reader who scrolls north out of that
         band gets NaN from the sampler, and a key that named only the variable and the hour would
         refuse to ask again — the value would simply never come back. */
      const key=EC.stateKey(cfg.variable,'')+'#'+(band?(band[1]+','+band[3]):'*');
      if(!key||_fieldAsk===key) return;
      _fieldAsk=key;
      EC.load(cfg.variable,null,band).then(()=>{ try{ window.renderCoordReadout&&window.renderCoordReadout(); }catch(_){} }).catch(()=>{});
    }catch(_){}
  }
  function ecmwfReadout(lng,lat){
    try{
      const EC=window.IntMapECMWF, W=window.IntMapWeatherEC;
      if(!EC||!W||!W.activeVariable) return null;
      const cfg=W.activeVariable(); if(!cfg) return null;
      const v=EC.valueNow(cfg.variable,lat,lng);
      if(v==null){ askEcField(cfg); return null; }
      const lg=EC.legend(cfg.variable,true);
      let out, unit=(lg&&lg.unit)||'';
      if(cfg.kind==='temp'){ const um=window.imUnitTemp||'both';
        out = um==='f' ? (v*9/5+32).toFixed(1)+'°F' : um==='c' ? v.toFixed(1)+'°C' : v.toFixed(1)+'°C ('+(v*9/5+32).toFixed(1)+'°F)'; }
      else if(cfg.kind==='wind'){ out=(window.fmtWindSpeed?window.fmtWindSpeed(v):(v.toFixed(1)+' m/s')); }
      else { out=(Math.abs(v)>=100?Math.round(v):(Math.round(v*10)/10))+(unit?(' '+unit):''); }
      return out+' · '+EC.fmt(EC.validTime(),{hour:'2-digit',minute:'2-digit',month:'short',day:'numeric'});
    }catch(_){ return null; }
  }
  function updateLayerReadout(lng,lat){
    /* ══ (#R211) THE TSUNAMI ANSWER BELONGS ON THE LINE THAT IS ALWAYS THERE ═════════════════════
       「津波シミュレータ — ホバー地点の到達時間と最大波高を座標標高の常時表示欄に」
       The propagation solve already answers both for any cell (`IntMapTsunami.at`), and the panel
       already showed them for the point you CLICKED. What was missing is the cheap continuous
       reading: hover anywhere and the same two numbers appear beside the coordinates and the
       elevation. No new computation and no fetch — this reads arrays the run has already filled,
       so it costs one array index per mouse frame.
       ⚠ It takes priority over the weather/choropleth value while a run is loaded, because while a
       tsunami is on screen that IS the layer the cursor is asking about. When no run is loaded
       `at()` returns null and the old behaviour is untouched. */
    try{ const T=window.IntMapTsunami;
      if(T&&T.at){ const p=T.at(lng,lat);
        if(p&&(p.arrivalS!=null||p.maxM!=null)){
          const t=(p.arrivalS==null)?null:(p.arrivalS<3600
            ? Math.round(p.arrivalS/60)+' min'
            : Math.floor(p.arrivalS/3600)+' h '+Math.round((p.arrivalS%3600)/60)+' min');
          const h=(p.maxM==null)?null:(Math.abs(p.maxM)>=0.1?p.maxM.toFixed(2):p.maxM.toFixed(3))+' m';
          /* ⚠⚠ (#R251) `const L5=(en,jp)=>HOST.lang==='jp'?jp:en;` WAS THE WHOLE TRANSLATION
             MECHANISM FOR THIS READOUT — a private two-language helper, so the tsunami readout was
             English in seven of the nine languages, and invisible to every instrument: the
             two-branch audit wants a ternary between two LITERALS, and these are parameters. */
          HOST.lastLayerVal='🌊 '+(t?(L('arrives','到達','Ankunft','приход','llegada')+' '+t):L('no arrival','未到達','keine Ankunft','нет прихода','sin llegada'))
            +(h?(' · '+L('max','最大波高','max. Höhe','макс.','máx.')+' '+h):'')
            +((p.coastalM!=null)?(' · '+L('coast','沿岸','Küste','побережье','costa')+' '+p.coastalM.toFixed(1)+' m'):'');
          return; } } }catch(_){}
    /* ══ (#R268) THE ANNUAL-PRECIPITATION FIELD ANSWERS FOR A POINT, SO THE POINT LINE SHOWS IT ═══
       「年降水量レイヤーはホバー地点の数値を表示するように。」 The layer has had an exact point value
       since #R266 — `valueAt` reads data/precip-mm.png, the 8-bit log(mm) VALUE grid, never the
       banded picture — and nothing asked it. It is synchronous (the grid is decoded when the layer
       is switched on), so this costs one array index per mouse frame, the same as the tsunami line
       above. The year the number is FROM travels with it, because 1,600 mm in 2011 and 1,600 mm in
       the 1981–2010 normal are different statements. */
    try{ const P=window.IntMapPrecipAnnual;
      if(P&&P.isOn&&P.isOn()){ const v=P.valueAt(lng,lat);
        if(v!=null&&isFinite(v)){
          const y=P.year&&P.year();
          HOST.lastLayerVal=Math.round(v)+' mm'+L('/yr','／年','/Jahr','/год','/año')
            +' · '+(y?String(y):'1981–2010');
          return; } } }catch(_){}
    /* an ECMWF raster answers for itself, and it takes priority: it is the layer the reader is
       looking at, and it is the only weather layer in the app that HAS a point value */
    { const ec=ecmwfReadout(lng,lat); if(ec){ HOST.lastLayerVal=ec; return; } }
    const lyr=activeWxLayer();
    if(!lyr){ /* no weather layer → show the active numeric choropleth's value at the cursor (#R13c) */
      let cv=null; try{ cv=window.choroValueAt&&window.choroValueAt(lng,lat); }catch(_){}
      HOST.lastLayerVal = cv||''; return; }
    if(lyr==='climate'){ let code=null; try{ code=window.sampleKoppenAt&&window.sampleKoppenAt(lng,lat); }catch(_){}
      /* no leading emoji on the layer value (#34) */
      /* (#R245) one climate-name lookup for the whole app — see window.kName in js/data-layers.js */
      HOST.lastLayerVal = code ? (code+((window.kName&&window.kName(code)!==code)?' · '+window.kName(code):'')) : ''; return; }
    /* ⚠ NO LIVE FETCH HERE ANY MORE — see the note beside `ecmwfReadout`. A GIBS raster is an image
       of a dataset for a chosen date; NASA publishes no point-value service for it, so the readout
       says WHICH dataset and WHICH date the colour under the cursor is from, and nothing more. The
       exact number for a place and an hour is what the ECMWF layers above are for. */
    try{
      const when=(window._imLayerDates&&window._imLayerDates[lyr])||'';
      const name=_GIBS_WHEN[lyr]?_GIBS_WHEN[lyr]():lyr;
      HOST.lastLayerVal=name+(when?(' · '+when):'');
    }catch(_){ HOST.lastLayerVal=''; }
  }
  /* (#R25) Coalesce the per-move readout to ONE animation frame with the LATEST cursor position, so fast
     mouse movement can't build a backlog of heavy updateCoord calls (queryRenderedFeatures + DEM + DOM)
     that made the value/classification visibly lag behind the cursor ("カーソルを動かしているのに遅い"). */
  let _ucRAF=0,_ucLng=null,_ucLat=null;
  function updateCoord(lng,lat){ if(HOST.isMobile()) return; _ucLng=lng; _ucLat=lat; if(_ucRAF) return;
    _ucRAF=requestAnimationFrame(()=>{ _ucRAF=0; try{ _updateCoordNow(_ucLng,_ucLat); }catch(_){} }); }
  function _updateCoordNow(lng,lat){
    if(HOST.isMobile()) return;
    try{ updateLayerReadout(lng,lat); }catch(_){}
    /* Instant: read elevation/depth straight from a cached DEM tile (no network). */
    const dem=demElevAt(lng,lat,()=>{ const d2=demElevAt(lng,lat); if(d2!=null){ HOST.lastElev=HOST.elevText(d2); renderCoordReadout(lng,lat); } });
    if(dem!=null){ HOST.lastElev=HOST.elevText(dem); renderCoordReadout(lng,lat); return; }
    /* Tile still loading → show coords now, fall back to network elevation briefly. */
    const ckey=lat.toFixed(2)+','+lng.toFixed(2);
    HOST.lastElev=_elevCache.has(ckey)?_elevCache.get(ckey):'';
    renderCoordReadout(lng,lat);
    clearTimeout(HOST.elevTimer);
    if(!_elevCache.has(ckey)) HOST.elevTimer=setTimeout(()=>{ fetchElev(lng,lat); },80);
  }
  /* GEBCO 2020 bathymetry (real ocean depth) via CORS proxy — Open-Meteo returns 0 over water. */
  const _bathyCache=new Map();
  async function fetchBathymetry(lat,lng){
    const key=lat.toFixed(2)+','+lng.toFixed(2);
    if(_bathyCache.has(key)) return _bathyCache.get(key);
    const u=`https://api.opentopodata.org/v1/gebco2020?locations=${lat.toFixed(4)},${lng.toFixed(4)}`;
    const proxies=[ x=>`https://api.allorigins.win/raw?url=${encodeURIComponent(x)}`, x=>`https://corsproxy.io/?url=${encodeURIComponent(x)}`, x=>`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(x)}` ];
    for(const mk of proxies){
      try{ const r=await fetch(mk(u)); if(!r.ok) continue; const j=await r.json(); const v=j&&j.results&&j.results[0]&&j.results[0].elevation; if(typeof v==='number'){ _bathyCache.set(key,v); return v; } }catch(_){}
    }
    return null;
  }
  async function fetchElev(lng,lat){
    const rLat=lat, rLng=lng, seq=++HOST._elevSeq;
    const ckey=rLat.toFixed(2)+','+rLng.toFixed(2);
    const set=(txt)=>{ _elevCache.set(ckey,txt); if(seq===HOST._elevSeq){ HOST.lastElev=txt; renderCoordReadout(rLng,rLat); } };
    try{
      /* (#R276) elevation goes through window.IntMapWx too: it is the same host and the same quota
         as the weather endpoints, and a cursor sweeping a coastline used to fire one uncached request
         per 0.01° cell. */
      const j=await window.IntMapWx.guardedJSON(`https://api.open-meteo.com/v1/elevation?latitude=${rLat.toFixed(4)}&longitude=${rLng.toFixed(4)}`,3600000);
      let e=null; if(j){ e=j&&j.elevation&&j.elevation[0]; }
      if(typeof e==='number' && e>0.5){ set(HOST.elevText(e)); return; }
      /* At/below sea level → fetch true depth from GEBCO bathymetry. */
      const d=await fetchBathymetry(rLat,rLng);
      if(typeof d==='number'){ set(HOST.elevText(d)); }
      else if(typeof e==='number'){ set(HOST.elevText(e)); }
    }catch(_){}
  }
  function updateCompass(){ const s=document.querySelector('.compass-svg'); if(s&&GE().hasRenderer())s.style.transform=`rotate(${-GE().camera.getBearing()}deg)`; }
  /* (#R265) what the elevation source could not answer, so a hole is visible instead of silent:
     `tiles` entirely void, `holedTiles` with any hole, `cells` no-data samples decoded, `fallbacks`
     samples answered one level down, `unfilled` samples no level could answer. */
  function demVoidStats(){ return Object.assign({},_demVoid); }
  return { _demZoomForSpan, demElevAt, demElevBilinear, demSnapshot, demTilePoints, demVoidStats, demZoomForMap, releaseDEMHold, fetchBathymetry, fmtElevVal, fmtLL, handleMapClick, refreshGrid, renderCoordReadout, setGrid, showMeasureTip, updateCompass, updateCoord, updateLayerReadout, warmDEMTiles };
};
