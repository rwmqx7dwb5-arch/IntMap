/* ============================================================================
 *  IntMap · COMPANY FACILITIES ON THE MAP — IntMapCompanyFacilities   (#R354)
 * ----------------------------------------------------------------------------
 *  The selected company's real estate, drawn from the profile js/company-data.js
 *  already holds. Nothing here fetches anything: `show(profile)` is handed the
 *  decorated profile, and every facility it draws comes out of
 *  `IntMapCompanyData.facilityGeoJSON` — the ONE derivation, so the panel's list
 *  and the map's dots cannot disagree about what a company's sites are
 *  (docs/COMPANIES.md §4.2/§5).
 *
 *  ── WHAT IS ON THE MAP ─────────────────────────────────────────────────────────────────────────
 *  ONE GeoJSON source and four layers over it:
 *      co-fac-cluster   the cluster discs        (features that carry point_count)
 *      co-fac-count     the count inside them
 *      co-fac-pt        one dot per facility     (features that do NOT)
 *      co-fac-lbl       the names, sparingly
 *  The six map GROUPS (hq / office / factory / rnd / logistics / other) are the colour key, exactly
 *  as §5.1 designs it: `type` may grow — a brewery, a smelter, a port terminal — without the legend
 *  or this file growing, because the colour reads the group and the CARD reads the type.
 *
 *  ── CLUSTERING, AND WHY THE COUNTS ARE HONEST ──────────────────────────────────────────────────
 *  This is the app's first clustered GeoJSON source, so two things are stated rather than assumed:
 *    · the cluster options ride through the contract untouched — GE().layers.addSource hands the
 *      whole source descriptor to the adapter, which hands it to the renderer. An engine that does
 *      not cluster (the second adapter stores the descriptor and draws the collection as given)
 *      simply produces no `point_count` features: the cluster/count layers then match nothing and
 *      every facility is drawn by co-fac-pt. Degrading, not breaking.
 *    · a group filter CANNOT be only a layer filter here. Clustering happens in the source, before
 *      any filter, so hiding «factory» with a filter alone would leave a disc reading «12» of which
 *      seven are no longer on the map — a number the reader can see and count against, and it would
 *      be wrong. `setGroups` therefore re-derives the collection from the profile ALREADY IN HAND
 *      (no fetch) and sets the layer filters too, so both halves say the same thing.
 *
 *  ── THE CAMERA IS NOT TOUCHED BY DISPLAY ───────────────────────────────────────────────────────
 *  CONSTITUTION §3: choosing a layer must not move the view by one pixel. So `show()` frames only
 *  when the CALLER says a person just picked this company (`{fit:true}`), and `focus()` frames
 *  because a person just picked that facility. Nothing else in this file moves the camera.
 *  The frame itself avoids the open panel by MEASUREMENT (see `_pad`) — never a fixed padding
 *  (#R291) — and clamps its own zoom at both ends, so one lone headquarters does not end up under
 *  the pavement and a company on every continent does not end up circling the planet twice.
 *
 *  ── RENDERER / MODULE RULES ────────────────────────────────────────────────────────────────────
 *  · Everything on the map goes through window.IntMapGeoEngine. This file never names a renderer.
 *  · No CSS here — the card is a `.country-popup`, the app's existing detail-card vocabulary
 *    (the choice js/aircraft-detail.js made in #R175 and js/datacenters.js in #R254); the
 *    stylesheet stays in css/intmap.css.
 *  · Every value that reaches the DOM goes through window.IntMapSafe (#R138).
 *  · Five languages inline (standing rule 5); the other four answer from the inline table.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.companyFacilities=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never a raw handle */
  const L=window.IntMapLang.pick(()=>HOST.lang);
  const S=(v)=>{ try{ return window.IntMapSafe.html(v==null?'':String(v)); }catch(_){ return ''; } };
  function _canDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }

  /* ─── the six map groups: the colour key, and the word beside the dot ─────────────────────────── */
  const GROUPS=['hq','office','factory','rnd','logistics','other'];
  /* Chosen to stay apart from one another on both the dark and the satellite basemap, and to stay
     apart from the layers this one is most often shown over (data centres blue-grey, alerts warm).
     ⚠ Read from js/company-data.js, which owns the one copy, so the panel's key and the map's paint
     are the same numbers rather than two lists that agree until one is edited. */
  const CD=()=>window.IntMapCompanyData;
  const GROUP_COL=(function(){ const o={}; GROUPS.forEach(g=>{ try{ o[g]=CD().groupColor(g); }catch(_){ o[g]='#8e8e93'; } }); return o; }());
  const GROUP_LBL=(function(){ const o={}; GROUPS.forEach(g=>{ o[g]=()=>{ try{ return CD().groupLabel(g); }catch(_){ return g; } }; }); return o; }());
  /* ⚠ the TYPE vocabulary is NOT here either — the card asks for it by name, because «assembly
     plant» and «refinery» are different facts and collapsing both to «factory» would throw away
     what the source said. */
  /* ⚠ A proxy returns something for EVERY key, so `TYPE_LBL[x]||GROUP_LBL[g]` would never reach its
     fallback. Missing and unknown keys therefore return undefined here, and the `||` still works. */
  const _lbl=(fn)=>new Proxy({},{ get:(_t,k)=>((!k||k==='undefined'||typeof k!=='string')?undefined:()=>{ try{ return CD()[fn](k); }catch(_){ return String(k); } }) });
  const TYPE_LBL=_lbl('typeLabel');
  const STATUS_LBL=_lbl('statusLabel');
  /* ─── state ───────────────────────────────────────────────────────────────────────────────────── */
  const SRC='co-fac-src', CLU='co-fac-cluster', CNT='co-fac-count', PT='co-fac-pt', LBL='co-fac-lbl';
  let _prof=null, _cid='', _groups=null, _shown=false, _wired=false, _styleT=0, _focusT=0;

  const groupOf=(f)=>{ const g=f&&f.group; return (GROUPS.indexOf(g)>=0)?g:'other'; };
  function _normGroups(gs){ if(!Array.isArray(gs)||!gs.length) return null;
    const keep=GROUPS.filter(g=>gs.indexOf(g)>=0);
    return (keep.length&&keep.length<GROUPS.length)?keep:null; }   /* «all of them» is expressed as no filter at all */

  /** the collection currently on the map — derived, never stored, so there is one copy of the truth */
  function _fc(){ try{ return window.IntMapCompanyData.facilityGeoJSON(_prof,_groups); }
    catch(_){ return {type:'FeatureCollection',features:[]}; } }
  function _facById(fid){ try{ return (_prof&&_prof.facilities||[]).find(f=>f&&f.id===fid)||null; }catch(_){ return null; } }

  /* ─── layers ──────────────────────────────────────────────────────────────────────────────────── */
  const before=()=>{ try{ return GE().layers.has('tool-poly')?'tool-poly':undefined; }catch(_){ return undefined; } };
  /* built from the table above so the card's dot, the panel's key and the map cannot drift apart */
  const colExpr=()=>['match',['get','group']].concat(
    GROUPS.reduce((a,g)=>a.concat([g,GROUP_COL[g]]),[]), [GROUP_COL.other]);

  /* ⚠ IDEMPOTENT PER OBJECT, not all-or-nothing. «The source is there» does not mean the layers
     are: a style swap takes both, but a partial teardown elsewhere would leave one behind, and an
     `if(hasSource) return` would then have declared the layer present for the rest of the session
     and never drawn it again — a feature that stops existing in silence (#R162's shape). */
  function _ensure(){
    if(!_canDraw()) return false;
    try{
      if(!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC,{ type:'geojson', data:_fc(),
        /* ⚠ the first clustered source in this app. clusterMaxZoom sits below the zoom at which a
           reader is looking at one city, so a city's sites are individual dots by the time the
           city fills the screen; the radius is a little wider than the dots themselves so two
           discs never overlap into an unreadable pair. */
        cluster:true, clusterRadius:46, clusterMaxZoom:9,
        /* how many headquarters a cluster swallowed — a company's HQ must not vanish into an
           anonymous disc, so the disc that holds it is ringed in the HQ colour */
        clusterProperties:{ hq:['+',['case',['==',['get','group'],'hq'],1,0]] } });

      if(!GE().layers.has(CLU)) GE().layers.add({id:CLU,type:'circle',source:SRC,filter:['has','point_count'],paint:{
        'circle-radius':['step',['get','point_count'],14,10,18,50,23,200,29],
        'circle-color':'rgba(10,132,255,0.82)',
        'circle-stroke-color':['case',['>',['coalesce',['get','hq'],0],0],GROUP_COL.hq,'rgba(255,255,255,0.9)'],
        'circle-stroke-width':['case',['>',['coalesce',['get','hq'],0],0],2.2,1.2]}},before());

      if(!GE().layers.has(CNT)) GE().layers.add({id:CNT,type:'symbol',source:SRC,filter:['has','point_count'],layout:{
        'text-field':['get','point_count_abbreviated'],'text-size':12.5,
        'text-font':['literal',['Noto Sans Regular']],
        'text-allow-overlap':true,'text-ignore-placement':true},
        paint:{'text-color':'#ffffff'}},before());

      if(!GE().layers.has(PT)) GE().layers.add({id:PT,type:'circle',source:SRC,filter:_ptFilter(),paint:{
        /* the headquarters is the one site a reader looks for first, so it is bigger at every zoom */
        'circle-radius':['interpolate',['linear'],['zoom'],
          2,['case',['==',['get','group'],'hq'],4.4,2.8],
          6,['case',['==',['get','group'],'hq'],6.4,4.2],
          11,['case',['==',['get','group'],'hq'],9.5,6.4],
          15,['case',['==',['get','group'],'hq'],12.5,8.4]],
        'circle-color':colExpr(),
        /* ⚠ a site that is closed, announced or still being built is NOT the same fact as a site
           that is running. It keeps its group colour — it is still that company's factory — but the
           fill drops away and the group colour moves to the ring, so it reads as an outline. The
           fill is weakened rather than removed: a fully transparent circle is still clickable, but
           it is also invisible on a busy basemap, and «invisible» is the failure #R344 measured. */
        'circle-opacity':['case',['==',['get','status'],'operating'],0.92,0.2],
        'circle-stroke-color':['case',['==',['get','status'],'operating'],'#ffffff',colExpr()],
        'circle-stroke-width':['case',['==',['get','status'],'operating'],1.1,1.8]}},before());

      if(!GE().layers.has(LBL)) GE().layers.add({id:LBL,type:'symbol',source:SRC,filter:_ptFilter(),minzoom:4.2,layout:{
        'text-field':['get','name'],'text-size':window.IntMapLabelScale.sub(0.8),
        'text-offset':[0,1.0],'text-anchor':'top','text-font':['literal',['Noto Sans Regular']],
        'text-max-width':15,'text-optional':true,
        'symbol-sort-key':['case',['==',['get','group'],'hq'],0,1]},
        /* ⚠ NOT every name at every zoom: a company with 200 sites would carpet a continent in its
           own name. The headquarters is named as soon as the layer draws at all; everything else
           waits until the reader is close enough for the names to mean a place rather than a smear.
           Expressed as opacity because `zoom` is not allowed inside a layer filter. */
        paint:{'text-color':'#dce6f5','text-halo-color':'rgba(0,0,0,0.8)','text-halo-width':1.2,
          'text-opacity':['step',['zoom'],['case',['==',['get','group'],'hq'],1,0],9.5,1]}},before());
      return GE().layers.has(PT);
    }catch(_){ return false; }
  }

  /* clusters are features WITHOUT a group, so the group filter can only be applied to the two
     per-facility layers — and the source has already been re-derived, so this is the second half
     of the same statement rather than the only one (see the header). */
  function _ptFilter(){ const base=['!',['has','point_count']];
    if(!_groups) return base;
    return ['all',base,['in',['get','group'],['literal',_groups.slice()]]]; }
  function _applyFilters(){ [PT,LBL].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.setFilter(id,_ptFilter()); }catch(_){} }); }
  function _push(){ try{ GE().layers.setSourceData(SRC,_fc()); return true; }catch(_){ return false; } }

  /* ─── the camera: insets, and a frame that cannot run away ────────────────────────────────────── */
  /* ⚠ (#R291) 「パネル表示中の fitBounds はパネル実寸を考慮する。固定値の padding:70 等だけで処理しない。」
     The company panel measures itself and pushes its rectangle here; with nothing pushed, the app's
     own furniture is measured instead, so a frame is never computed against a viewport that is
     partly covered by something the reader is reading. */
  let _insets=null;
  function setInsets(o){ _insets=o?{top:+o.top||0,right:+o.right||0,bottom:+o.bottom||0,left:+o.left||0}:null; }
  function _measured(){ const out={top:0,right:0,bottom:0,left:0};
    try{
      const mob=!!(window.matchMedia&&window.matchMedia('(max-width:768px)').matches);
      const sb=document.getElementById('sidebar');
      if(sb&&!sb.classList.contains('collapsed')&&getComputedStyle(sb).display!=='none'){
        const r=sb.getBoundingClientRect();
        if(r.width>1&&r.height>1){
          /* the same element IS the bottom sheet on a phone (js/mobile-ui.js) and the left column
             on the desktop — so which inset it fills is a question about the layout, not the id */
          if(mob) out.bottom=Math.max(0,(window.innerHeight||0)-r.top);
          else if(r.left<=2) out.left=Math.max(0,r.right);
        }
      }
      const rs=document.getElementById('layer-sidebar-r');
      if(rs&&document.body.classList.contains('lsr-open')){
        const rr=rs.getBoundingClientRect(); if(rr.width>1) out.right=Math.max(0,(window.innerWidth||0)-rr.left); }
    }catch(_){}
    return out; }
  function _pad(base){ base=base||28;
    /* an inset pair wider than the canvas makes the fit throw and silently not happen (#R291) */
    let w=0,h=0; try{ const c=GE().render.canvas(); w=c.clientWidth||c.width||0; h=c.clientHeight||c.height||0; }catch(_){}
    const i=_insets||_measured();
    const cap=(v,span)=>span?Math.max(base,Math.min(v+base,Math.round(span*0.42))):(v+base);
    return { top:cap(i.top,h), bottom:cap(i.bottom,h), left:cap(i.left,w), right:cap(i.right,w) }; }

  /* ⚠ THE SHORTEST ARC AROUND THE PLANET, not min/max of the longitudes. A company with a plant in
     Nagoya and one in Kentucky has longitudes −85 and +137: min/max calls that 222° wide and frames
     the Atlantic, i.e. the half of the world with none of its sites in it. The enclosing arc is
     found the only way that is always right — the BIGGEST GAP between neighbouring longitudes is
     the part of the planet the company is not on, and what is left is the frame. */
  function _lonArc(lons){
    const a=lons.slice().sort((x,y)=>x-y);
    if(a.length===1) return {w:a[0],e:a[0]};
    let gap=-1, at=0;
    for(let i=0;i<a.length;i++){ const nx=(i+1<a.length)?a[i+1]:(a[0]+360); const g=nx-a[i]; if(g>gap){ gap=g; at=i; } }
    const start=(at+1<a.length)?a[at+1]:a[0];
    return {w:start,e:start+(360-gap)}; }
  function _bboxOf(feats){
    if(!feats||!feats.length) return null;
    const lons=[]; let s=90,n=-90;
    for(const f of feats){ const c=f&&f.geometry&&f.geometry.coordinates; if(!c||!isFinite(c[0])||!isFinite(c[1])) continue;
      lons.push(+c[0]); if(c[1]<s) s=+c[1]; if(c[1]>n) n=+c[1]; }
    if(!lons.length) return null;
    const arc=_lonArc(lons);
    return [[arc.w,s],[arc.e,n]]; }

  /* One frame, with both ends clamped: `forBounds` is asked what the fit WOULD be, and the answer is
     put back through easeTo. A single-site company therefore stops at a city view instead of a
     doorstep, and a company on six continents stops at the whole planet instead of past it. */
  /* ⚠ THE ARC IS ALLOWED TO RUN PAST +180; THE CAMERA IS NOT. _lonArc deliberately returns an
     unwrapped east edge — TSMC's sites in Hsinchu and in Phoenix are 127° apart THROUGH THE
     PACIFIC, which is the frame anyone wants, and expressing that means an east edge of 247.8.
     forBounds reads it correctly and answers centre 184.4°, zoom 1.46. Handing 184.4 straight to
     easeTo does NOT put the camera there: MEASURED on the globe, the map landed at 89.4° and zoom
     0.69 — the whole planet, for five sites. Both ends of the world contained everything, so the
     frame was not «wrong» in a way any assertion about containment could catch; it was simply the
     view that shows the reader nothing. 184.4° and −175.6° are the same meridian, and the second
     one is the one every projection accepts. */
  const _wrapLon=(x)=>{ let v=+x; if(!isFinite(v)) return 0; v=((v+180)%360+360)%360-180; return v; };
  function _frame(bb,minZ,maxZ,dur){
    if(!bb) return false;
    const o={padding:_pad(30),maxZoom:maxZ};
    try{
      const cam=GE().camera.forBounds(bb,o);
      if(cam&&isFinite(+cam.zoom)&&cam.center){
        const z=Math.max(minZ,Math.min(maxZ,+cam.zoom));
        const lng=_wrapLon(cam.center.lng!==undefined?cam.center.lng:cam.center[0]);
        const lat=(cam.center.lat!==undefined?cam.center.lat:cam.center[1]);
        GE().camera.easeTo({center:[lng,lat],zoom:z,duration:dur||900});
        return true;
      }
      GE().camera.fitBounds(bb,Object.assign({duration:dur||900},o));
      return true;
    }catch(_){ return false; } }

  /** frame everything currently drawn. Called ONLY from show({fit:true}) — see the header. */
  function fitAll(){ const gj=_fc(); if(!gj.features.length) return false;
    return _frame(_bboxOf(gj.features),0.6,11,900); }

  /* ─── clusters open ───────────────────────────────────────────────────────────────────────────── */
  /* ⚠ The renderer's own «what zoom does this cluster break apart at» lives on the source object,
     which this file has no way to reach through the contract — and reaching past the contract is
     the one thing js/geo-engine.js exists to prevent. It does not have to: the points inside a
     cluster are points THIS MODULE put there. Supercluster's disc sits on its children's mean, and
     its children are contiguous, so the `point_count` nearest features to the disc are that
     cluster; framing their box breaks it open in one press. When that box is degenerate (every
     site at one coordinate, or the frame would not actually zoom in) the camera steps in instead,
     so a press always does something. */
  function _openCluster(f){
    let c=null,n=0; try{ c=f.geometry.coordinates; n=+f.properties.point_count||0; }catch(_){ }
    if(!c||!isFinite(c[0])) return;
    let z0=0; try{ z0=+GE().camera.getZoom()||0; }catch(_){}
    const step=()=>{ try{ GE().camera.easeTo({center:{lng:+c[0],lat:+c[1]},zoom:Math.min(15,z0+1.9),duration:600}); }catch(_){} };
    const feats=_fc().features;
    if(!n||n>feats.length){ step(); return; }
    const kx=Math.max(0.08,Math.cos((+c[1])*Math.PI/180));
    const near=feats.map(g=>{ const p=g.geometry.coordinates;
        let dx=p[0]-c[0]; if(dx>180) dx-=360; else if(dx<-180) dx+=360;
        return {g,d:(dx*kx)*(dx*kx)+(p[1]-c[1])*(p[1]-c[1])}; })
      .sort((a,b)=>a.d-b.d).slice(0,n).map(o=>o.g);
    const bb=_bboxOf(near);
    if(!bb){ step(); return; }
    const o={padding:_pad(34),maxZoom:15};
    let z=null; try{ const cam=GE().camera.forBounds(bb,o); if(cam&&isFinite(+cam.zoom)) z=+cam.zoom; }catch(_){}
    if(z==null||z<=z0+0.2){ step(); return; }
    try{ GE().camera.fitBounds(bb,Object.assign({duration:700},o)); }catch(_){ step(); } }

  /* ══ THE FACILITY CARD ═══════════════════════════════════════════════════════════════════════════
     A `.country-popup`, so it inherits the app's existing detail-card look, its drag behaviour and
     its mobile bottom sheet rather than inventing a second vocabulary. Every field is printed only
     when the profile carries it — docs/COMPANIES.md §6: an unpublished number is an observation
     about the company, not a hole to fill. */
  let card=null;
  function closeCard(){ try{ if(card&&card.parentNode) card.parentNode.removeChild(card); }catch(_){} card=null; }
  function row(k,v){ return v?('<div style="display:flex;gap:10px;justify-content:space-between;font-size:12.5px;padding:4px 0;border-bottom:1px solid rgba(128,128,128,0.14);">'
    +'<span style="color:var(--text-muted);flex:0 0 auto;">'+S(k)+'</span><b style="color:var(--text-main);text-align:right;">'+S(v)+'</b></div>'):''; }
  function _ccName(cc){ try{ const s=HOST.countryStats&&HOST.countryStats[cc];
    if(!s) return cc||''; return (HOST.cName?HOST.cName(s):(s.nameEn||cc))||cc||''; }catch(_){ return cc||''; } }
  /* ⚠ docs/COMPANIES.md §5.2: `city` and `region` must never be shown as if they were the site. The
     note is not optional and not a tooltip — it is on the card, under the fields it qualifies. */
  function _precisionNote(p){
    if(p==='city') return L('This point is the city’s representative location, not the site itself — the source names only the city.',
      'この座標は市の代表点であり、施設そのものの位置ではありません（出典は市までしか示していません）。',
      'Dieser Punkt ist der repräsentative Ort der Stadt, nicht der Standort selbst — die Quelle nennt nur die Stadt.',
      'Эта точка — представительная точка города, а не сам объект: источник указывает только город.',
      'Este punto es la ubicación representativa de la ciudad, no el emplazamiento en sí: la fuente solo indica la ciudad.');
    if(p==='region') return L('The source names only the state or province, so this point is that region’s representative location.',
      '出典は州・県までしか示していないため、この座標はその地域の代表点です。',
      'Die Quelle nennt nur das Bundesland bzw. die Provinz; dieser Punkt ist der repräsentative Ort dieser Region.',
      'Источник указывает только штат или провинцию, поэтому это представительная точка региона.',
      'La fuente solo indica el estado o la provincia, por lo que este punto es la ubicación representativa de esa región.');
    return ''; }

  function openCard(fid,lngLat){
    closeCard();
    const f=_facById(fid); if(!f) return;
    const g=groupOf(f);
    const typeTxt=(TYPE_LBL[f.type]||GROUP_LBL[g])();
    const statusTxt=(STATUS_LBL[f.status]||STATUS_LBL.operating)();
    const where=[f.city,f.region,_ccName(f.cc)].filter(Boolean).join(', ');
    const products=Array.isArray(f.products)?f.products.filter(Boolean).join(', '):'';
    const research=Array.isArray(f.research)?f.research.filter(Boolean).join(', '):'';
    const note=_precisionNote(f.precision);
    const coName=(()=>{ try{ const id=_prof.identity||{}; return id.name||_prof.id||''; }catch(_){ return ''; } })();
    const el=document.createElement('div'); el.className='country-popup'; el.id='co-fac-detail';
    el.style.display='block';
    el.innerHTML='<button class="country-popup-close cf-close" type="button" aria-label="'+S(L('Close','閉じる','Schließen','Закрыть','Cerrar'))+'" title="'+S(L('Close','閉じる','Schließen','Закрыть','Cerrar'))+'">×</button>'
      +'<div style="padding:16px 18px 18px;">'
      +'<div class="cf-drag" style="display:flex;align-items:center;gap:9px;margin-bottom:3px;padding-right:32px;cursor:move;user-select:none;">'
      +'<span style="width:12px;height:12px;border-radius:7px;flex:none;background:'+S(GROUP_COL[g])+';"></span>'
      +'<span style="font-weight:700;font-size:15px;color:var(--text-main);">'+S(f.name||'')+'</span></div>'
      +'<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px;">'+S(coName?(coName+' · '+GROUP_LBL[g]()):GROUP_LBL[g]())+'</div>'
      +row(L('Type','種類','Art','Тип','Tipo'),typeTxt)
      +row(L('Site location','所在地','Standort','Местоположение','Ubicación'),where)
      +row(L('Role','役割','Funktion','Роль','Función'),f.role||'')
      +row(L('Products','生産品','Produkte','Продукция','Productos'),products)
      +row(L('Research','研究分野','Forschungsgebiete','Направления исследований','Áreas de investigación'),research)
      +row(L('Opened','開設','Eröffnet','Открыт','Apertura'),f.opened||'')
      /* ⚠ NOT the bare word "Closed" — js/atlas-console.js owns that English string for "the panel
         was closed" (閉じました) and the inline table is keyed by the English text, so the year a
         plant shut down was labelled 닫힘 in Korean. This is a DATE heading and pairs with `Opened`
         above, so it needs its own word rather than the status badge's `Closed permanently`. */
      +row(L('Closed in','閉鎖','Geschlossen','Закрыт','Cierre'),f.closed||'')
      +row(L('Status','状態','Status','Статус','Estado'),statusTxt)
      +(note?('<div style="margin-top:11px;font-size:9.5px;color:var(--text-muted);line-height:1.55;">'+S(note)+'</div>'):'')
      +'</div>';
    document.body.appendChild(el); card=el;
    /* ⚠ (#R255) `.country-popup` is `position:absolute` with no left/top of its own, so an element
       appended to <body> takes the END OF THE DOCUMENT FLOW — below every panel in it, i.e. off the
       bottom of the page. Placing it is part of using this shell. */
    try{
      const vw=window.innerWidth||1200, vh=window.innerHeight||800;
      const w=el.offsetWidth||380, h=el.offsetHeight||300;
      const rs=(()=>{ try{ const s=document.getElementById('layer-sidebar-r');
        return (s&&document.body.classList.contains('lsr-open'))?s.getBoundingClientRect().width:0; }catch(_){ return 0; } })();
      /* ⚠ project() is CANVAS-relative (#R252); the card is placed in PAGE coordinates, so the
         canvas's own offset — the left sidebar's width, when it is open — has to be added back. */
      const px=(()=>{ try{ const p=GE().coords.project({lng:+lngLat.lng,lat:+lngLat.lat});
        if(!p) return null; const r=GE().render.canvas().getBoundingClientRect(); return r.left+p.x; }catch(_){ return null; } })();
      let left=(px!=null)?(px+18):(vw-rs-w-24);
      left=Math.max(12,Math.min(left,vw-rs-w-12));
      el.style.left=Math.round(Math.max(12,left))+'px';
      el.style.top=Math.round(Math.max(12,Math.min(96,vh-h-16)))+'px';
    }catch(_){ el.style.left='16px'; el.style.top='96px'; }
    try{ HOST.makeDraggable&&HOST.makeDraggable(el,el.querySelector('.cf-drag')); }catch(_){}
    try{ el.querySelector('.cf-close').onclick=closeCard; }catch(_){} }

  /* ─── listeners ───────────────────────────────────────────────────────────────────────────────────
     ⚠ GE().events.onLayer returns NOTHING — the contract's unsubscribe is offLayer(type, layer, cb)
     with the SAME callback identity (js/geo-engine.js). So every registration is remembered here,
     and `hide()` hands each one back. `_wired` is what keeps a second `show()` from doubling them. */
  const _regs=[];
  function _onLayer(type,layer,cb){ try{ GE().events.onLayer(type,layer,cb); _regs.push({k:'l',type,layer,cb}); }catch(_){} }
  function _on(type,cb){ try{ GE().events.on(type,cb); _regs.push({k:'m',type,cb}); }catch(_){} }
  function _unwire(){ _wired=false;
    _regs.splice(0).forEach(r=>{ try{ if(r.k==='l') GE().events.offLayer(r.type,r.layer,r.cb); else GE().events.off(r.type,r.cb); }catch(_){} }); }

  const _cursor=(v)=>{ try{ GE().render.setCursor(v); }catch(_){} };
  function _onPointClick(e){ const f=e&&e.features&&e.features[0]; if(!f) return;
    const p=f.properties||{}; const c=f.geometry&&f.geometry.coordinates;
    if(!c) return; openCard(p.fid,{lng:c[0],lat:c[1]}); }
  function _onClusterClick(e){ const f=e&&e.features&&e.features[0]; if(f) _openCluster(f); }
  /* ⚠ a theme change or an engine swap rebuilds the style and takes every source and layer with it.
     The registrations above are held by the renderer against the LAYER ID and survive; the layers
     themselves do not, so they are put back. Without this the company simply disappears from the
     map and nothing says why (#R162's shape). */
  function _onStyle(){ if(!_shown) return; clearTimeout(_styleT);
    _styleT=setTimeout(()=>{ if(!_shown) return; if(_ensure()){ _push(); _applyFilters(); } },90); }
  function _wire(){ if(_wired) return; _wired=true;
    _onLayer('click',PT,_onPointClick);
    _onLayer('click',CLU,_onClusterClick);
    _onLayer('mouseenter',PT,()=>_cursor('pointer'));
    _onLayer('mouseleave',PT,()=>_cursor(''));
    _onLayer('mouseenter',CLU,()=>_cursor('pointer'));
    _onLayer('mouseleave',CLU,()=>_cursor(''));
    _on('styledata',_onStyle); }

  /* ─── the public doors (js/company-panel.js drives all of them) ───────────────────────────────── */
  function _draw(fit){
    if(!_ensure()){ try{ GE().events.once('idle',()=>{ if(_shown) _draw(fit); }); }catch(_){} return false; }
    _wire(); _push(); _applyFilters();
    if(fit) fitAll();
    return true; }

  /** show(profile, {groups, fit}) — draws this company. A company with no located facility draws
      nothing and says so by returning false; it does not throw and it does not move the camera.
      ⚠ the answer is «is there anything to draw», NOT «did it reach the map this instant»: a style
      that is still parsing defers the draw to the next idle and the company still has its sites. */
  function show(prof,opts){
    opts=opts||{};
    if(!prof||!prof.id) return false;
    const same=(_cid===prof.id);
    if(!same) closeCard();
    _prof=prof; _cid=prof.id;
    if(opts.groups!==undefined) _groups=_normGroups(opts.groups);
    else if(!same) _groups=null;      /* a newly opened company starts with every group visible */
    _shown=true;
    /* switching company REPLACES the data — the source and the layers are not rebuilt (see hide()) */
    _draw(!!opts.fit);
    return _fc().features.length>0; }

  /** narrow the visible groups. Re-derives from the profile in hand; nothing is fetched. */
  function setGroups(gs){ _groups=_normGroups(gs);
    if(!_shown) return false;
    _push(); _applyFilters(); return true; }

  /** focus(facilityId) — the one other place allowed to move the camera: a person picked this site. */
  function focus(fid){
    const f=_facById(fid); if(!f||!isFinite(f.lon)||!isFinite(f.lat)) return false;
    if(_focusT){ clearTimeout(_focusT); _focusT=0; }
    const dur=800;
    try{
      const z0=+GE().camera.getZoom()||0;
      /* ⚠ HOW CLOSE IS HONEST IS A PROPERTY OF THE COORDINATE (docs/COMPANIES.md §5.2). An `exact`
         coordinate may be approached as far as the reader likes, so this only ever moves IN. A city
         or region representative point is a different fact: flying to street level over one would
         draw a building the source never located, so those stop where the source stops — including
         by pulling BACK if the reader happened to be closer than the coordinate deserves. */
      const near=(f.precision==='exact')?13.5:((f.precision==='city')?11:8);
      GE().camera.easeTo({center:{lng:+f.lon,lat:+f.lat},
        zoom:(f.precision==='exact')?Math.max(z0,near):near, padding:_pad(30),duration:dur});
    }catch(_){}
    /* the card is placed from the PROJECTED position, so it is opened once the camera has arrived */
    _focusT=setTimeout(()=>{ _focusT=0; if(_shown) openCard(fid,{lng:+f.lon,lat:+f.lat}); },dur+60);
    return true; }

  /** take everything down: the card, the timers, every registration, the layers, the source. */
  function hide(){
    _shown=false; _wired=false;
    closeCard();
    if(_focusT){ clearTimeout(_focusT); _focusT=0; }
    if(_styleT){ clearTimeout(_styleT); _styleT=0; }
    _unwire();
    [LBL,PT,CNT,CLU].forEach(id=>{ try{ if(GE().layers.has(id)) GE().layers.remove(id); }catch(_){} });
    try{ if(GE().layers.hasSource(SRC)) GE().layers.removeSource(SRC); }catch(_){}
    _prof=null; _cid=''; _groups=null;
    return true; }

  const API={ show, setGroups, focus, hide, setInsets,
    isShown:()=>!!_shown,
    current:()=>(_shown&&_cid)?_cid:null,
    /* the colour key, built here so the panel's legend and the map cannot disagree (#R270) */
    key:()=>GROUPS.map(g=>[g,GROUP_COL[g],GROUP_LBL[g]()]),
    groups:()=>_groups?_groups.slice():GROUPS.slice(),
    /* ids, so a test can assert what is on the map without re-deriving them from prose */
    layerIds:()=>({source:SRC,cluster:CLU,count:CNT,point:PT,label:LBL}) };
  window.IntMapCompanyFacilities=API;
  return API;
};
