/* ============================================================================
 *  IntMap · News feed, pins & reader  (#R168)
 * ----------------------------------------------------------------------------
 *  The news presentation layer: the intel/news map layers, duplicate-pin spreading, the feed
 *  renderer and its lazy batches, the article reader (with its AI translate) and the AI
 *  geocoding pass. The news DATA pipeline (fetch/cache/filter) stays in index.html — this is
 *  everything that turns it into pins and DOM.
 *
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure: the only edit is that free
 *  references to closure variables became HOST.<member> reads (Architecture.md §3.1). The
 *  extraction was done by script and reversed byte-for-byte against the original text.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.newsUi=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const saveBookmarks=()=>localStorage.setItem('intmap_bookmarks',JSON.stringify(HOST.bookmarks));

  /* ══ (#R210) ★ SAVED ARTICLES SURVIVE THE FEED THEY CAME FROM ═════════════════════════════════
     「ニュースの★保存機能あるけど、★付けても保持されず、次開いたときには消えてしまっている。」

     REPRODUCED IN THE SOURCE, and the star was never the thing that was lost. Both stores are
     correct — a guest's links go to `intmap_bookmarks`, an account's go to the `favorites` table
     and js/auth-ui.js reads them back on login. What was wrong is what ★ Saved is MADE of:
     `computeFilteredNews` (js/app-body.js) built it by FILTERING `globalData`, the live feed. RSS
     feeds carry roughly a day of headlines, so the morning after, the article the user deliberately
     kept is no longer in `globalData` and the filter has nothing to keep — the row vanishes while
     the favourite itself is still sitting in the database. Saving the link was never enough: a
     saved article has to carry its own copy of what it takes to draw a card.

     So a snapshot is written beside the link (title, outlet, date, image, resolved location) and
     `merge()` hands the missing ones back to the feed filter. The cap is a real cap: 800 most
     recently saved, oldest evicted, because this is localStorage and it is shared with everything
     else the app keeps there. Records are keyed by link — the same identity the star already uses.

     ⚠ THIS IS A CACHE, NOT THE RECORD. The authoritative list is still `HOST.bookmarks` (DB or
     localStorage). If the snapshot is missing — cleared storage, another device — `seed()` fills
     what it can from the account's own `favorites.article_title`, and a card with a title and a
     link is still a usable card. The star is never inferred FROM the snapshot. */
  const SNAP_KEY='intmap_saved_articles', SNAP_MAX=800;
  function snapAll(){ try{ const o=JSON.parse(localStorage.getItem(SNAP_KEY)||'{}'); return (o&&typeof o==='object')?o:{}; }catch(_){ return {}; } }
  function snapWrite(o){
    try{
      const keys=Object.keys(o);
      if(keys.length>SNAP_MAX){
        keys.sort((a,b)=>(o[b].savedAt||0)-(o[a].savedAt||0));
        const trimmed={}; keys.slice(0,SNAP_MAX).forEach(k=>{ trimmed[k]=o[k]; }); o=trimmed;
      }
      localStorage.setItem(SNAP_KEY,JSON.stringify(o));
    }catch(_){
      /* (#R215) a full quota must not make the star itself fail — AND it must not silently drop the
         one the user just added. Evict the oldest half and try again; if even that is refused the
         write is abandoned, which is where this used to give up on the first attempt. */
      try{ const keys=Object.keys(o).sort((a,b)=>(o[b].savedAt||0)-(o[a].savedAt||0));
        const half={}; keys.slice(0,Math.max(20,Math.floor(keys.length/2))).forEach(k=>{ half[k]=o[k]; });
        localStorage.setItem(SNAP_KEY,JSON.stringify(half));
      }catch(__){}
    }
  }
  /* ══ ⚠⚠ (#R215) A SAVED CARD WITH NO `analysis` THREW, AND ONE THROW EMPTIES THE WHOLE LIST ═════
     「★保存機能あるけど…（追記：いやその時は保存されるけど数日後とかには消えるって話だわボケ）」

     #R210 built the snapshot and it is written correctly — the record really is in localStorage days
     later, and the link really is in `favorites`. What was wrong is the SHAPE of what merge() hands
     back. `analysis` was stored as `null` for any article with no resolved location, and `seed()`
     (the account's own titles, i.e. every saved article on a browser that has never drawn it) stored
     `null` unconditionally. js/news-ui.js `appendNewsBatch` then reads `item.analysis.mapped` with
     no guard, inside a `forEach` — so the FIRST such card throws a TypeError and every card after it
     in that batch is never appended. The star is still there and the list is empty, which is exactly
     what «数日後に消える» looks like: it works while the live feed still carries the article (a real
     `analysis` object) and stops the day it does not.

     Two halves, and both are needed. Here: a snapshot always carries an `analysis` OBJECT, and it
     keeps the place NAME the card prints rather than only the coordinates. Below in appendNewsBatch:
     the renderer stops assuming — a card must not be able to take the list down with it. */
  function snapAnalysis(a){
    const src=a||{};
    const loc=(src.loc&&src.loc.length>=2&&isFinite(src.loc[0])&&isFinite(src.loc[1]))?[+src.loc[0],+src.loc[1]]:null;
    return { loc, name:src.name||'', short:src.short||'', place:src.place||'',
             ptype:src.ptype||'', mapped:loc?(src.mapped===true?true:(src.mapped==='publisher'?'publisher':true)):false }; }
  function snapPut(item){ if(!item||!item.link) return;
    const o=snapAll();
    o[item.link]={ link:item.link, title:item.title||'', publisher:item.publisher||'', pubDate:item.pubDate||'',
      image:item.image||'', analysis:snapAnalysis(item.analysis),
      savedAt:Date.now(), fromSnapshot:true };
    snapWrite(o); }
  function snapForget(link){ const o=snapAll(); if(link in o){ delete o[link]; snapWrite(o); } }
  /* WARN (#R210) PUBLISHED FROM A FUNCTION, NOT FROM THE FACTORY BODY. tests/r168-checks #4
     requires that a factory body only DECLARES — an assignment here would run the moment the
     factory is instantiated, which is the #R167 dead-zone trap this project has paid for twice.
     renderUI() and appendNewsBatch() both call it and both are idempotent, so the global exists
     before anything asks for it (computeFilteredNews guards with && either way). */
  function publishSaved(){ if(window.IntMapNewsSaved) return; window.IntMapNewsSaved={
    put:snapPut, forget:snapForget, all:snapAll,
    /* Fill in a title for links the account knows about but this browser has never drawn. */
    seed(rows){ try{ const o=snapAll(); let n=0;
      (rows||[]).forEach(r=>{ const l=r&&(r.article_link||r.link); if(!l||o[l]) return;
        o[l]={ link:l, title:(r.article_title||r.title||l), publisher:'', pubDate:'', image:'', analysis:snapAnalysis(null), savedAt:Date.now(), fromSnapshot:true }; n++; });
      if(n) snapWrite(o); return n; }catch(_){ return 0; } },
    /* The feed, plus a synthetic item for every bookmarked link the feed no longer carries. */
    merge(feed,links){
      try{
        const have=new Set((feed||[]).map(i=>i&&i.link)); const o=snapAll(); const extra=[];
        /* ⚠ a record written by an older build has `analysis:null`; normalise on the way OUT so the
           fix reaches snapshots that are already on disk, not only the ones written from now on */
        (links||[]).forEach(l=>{ if(have.has(l)) return; const s=o[l];
          if(s) extra.push(Object.assign({},s,{ analysis:snapAnalysis(s.analysis), title:s.title||l, publisher:s.publisher||'', pubDate:s.pubDate||'' })); });
        extra.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
        return extra.length?(feed||[]).concat(extra):(feed||[]);
      }catch(_){ return feed||[]; }
    }
  }; }

  const tzOpt=()=>(HOST.userTZ==='auto'?undefined:HOST.userTZ);

  const ymd=(d,tz)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);

  const hm=(d,tz)=>new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(d);

  function formatCustomDate(s){ const d=HOST.parseDate(s),tz=tzOpt(),now=new Date(); const a=ymd(d,tz),today=ymd(now,tz),yest=ymd(new Date(now.getTime()-864e5),tz),time=hm(d,tz);
    /* (#R37) localize "today"/"yesterday" for ALL four languages — the old en?…:… else-branch showed Japanese to DE/RU. */
    const TODAY=({en:'today',jp:'今日',de:'heute',ru:'сегодня'})[HOST.lang]||'today', YEST=({en:'yesterday',jp:'昨日',de:'gestern',ru:'вчера'})[HOST.lang]||'yesterday';
    if(a===today)return `${TODAY} ${time}`; if(a===yest)return `${YEST} ${time}`; const[,M,D]=a.split('-'); return `${+M}/${+D} ${time}`; }

  let hoveredNewsId=null, hoveredDashId=null;

  function setupIntelLayers(){
    /* (#R161 MapLibre reduction, Phase 3) the NEWS overlay is created through IntMapGeoEngine.
       `GE` falls back to nothing only if the engine has not been constructed yet (it is built in
       map.on('load') before the first call), in which case we simply return and the existing
       styledata re-run creates the layers. */
    const GE=window.IntMapGeoEngine;
    /* (#R170) ready() → canDraw(). ready() means "the renderer has fully settled, tiles and all", which is
       false for most of the time a user spends panning — so the news pin layer, like every dl-* layer, was
       waiting for an idle frame it might not get for seconds. Creating sources/layers only needs a parsed
       style, which is what canDraw() answers. */
    if(!GE||!GE.canDraw()) return;
    HOST.ensureLabelPill();
    if(!GE.layers.hasSource('news-points')){
      GE.layers.addSource('news-points',{type:'geojson',data:{type:'FeatureCollection',features:[]},promoteId:'fid'});
      GE.layers.add({id:'news-pulse',type:'circle',source:'news-points',filter:['match',['get','mapped'],['true','publisher'],true,false],paint:{
        'circle-radius':['interpolate',['linear'],['zoom'],0,8,4,14,10,22],
        'circle-color':['match',['get','mapped'],'publisher','#5856d6','#007aff'],
        'circle-opacity':0.18,
        'circle-stroke-width':0
      }});
      GE.layers.add({id:'news-dots',type:'circle',source:'news-points',paint:{
        'circle-radius':['case',['boolean',['feature-state','hover'],false],10,7],
        'circle-color':['match',['get','mapped'],
          'true','#007aff',
          'publisher','#5856d6',
          'none','#9b59b6',
          '#9b59b6'],
        'circle-opacity':['match',['get','mapped'],
          'true',1.0,
          'publisher',0.85,
          'none',0.5,
          0.5],
        'circle-stroke-width':2,
        'circle-stroke-color':'#ffffff'
      }});
      /* Title preview "band" to the right of the pin; hidden when hovered (popup takes over).
         (#R15) Shown for publisher-located pins too, not just subject pins. */
      GE.layers.add({id:'news-labels',type:'symbol',source:'news-points',layout:{   /* (#R15c) band on ALL pins incl. not-yet-located */
        'text-field':['get','short'],
        'text-size':window.IntMapLabelScale.sub(0.92),
        'text-font':['literal',['Noto Sans Regular']],
        'text-anchor':'left',
        'text-offset':[1.25,0],
        /* (#R36) ROOT CAUSE of "ズームインすると帯が見えなくなる / 空間に余裕があるピンにも帯が出ない / 高速点滅":
           GL collision is GLOBAL across every symbol layer, so allow-overlap:false made the news bands compete
           against ALL the base-map place labels (cities/towns/streets). Zooming in spawns more base labels →
           the bands lose the collision even when there's plenty of room between NEWS pins, and the per-frame
           re-placement flickered. Fix: take the bands OUT of GL collision entirely (allow-overlap + ignore
           placement) and decide visibility ourselves with a JS de-clutter that only considers OTHER NEWS bands
           (see _declutterNewsBands). A band shows iff feature-state `bnd` is true; it runs on moveend (not every
           frame) so it never blinks. Dense clusters → only the winners show, the rest stay dots; zoom in →
           pins spread → more win. Independent of base labels. */
        'symbol-sort-key':['match',['get','mapped'],'true',0,'publisher',1,'none',3,2],
        'text-allow-overlap':true,
        'text-ignore-placement':true,
        'text-optional':false,
        'text-max-width':14,
        'icon-image':'news-pill',
        'icon-text-fit':'both',
        'icon-text-fit-padding':[2,9,2,9],
        'icon-allow-overlap':true,
        'icon-ignore-placement':true,
        'icon-optional':false
      },paint:{
        'text-color':'#ffffff',
        'text-halo-color':'rgba(0,0,0,0.55)',
        'text-halo-width':0.8,
        'text-opacity':['case',['boolean',['feature-state','hover'],false],0,['case',['boolean',['feature-state','bnd'],false],1,0]],
        'icon-opacity':['case',['boolean',['feature-state','hover'],false],0,['case',['boolean',['feature-state','bnd'],false],1,0]]
      }});
      GE.events.on('moveend',HOST.scheduleNewsDeclutter); GE.events.on('zoomend',HOST.scheduleNewsDeclutter);
      /* If pins were accumulated before map.load, flush them now. */
      if(HOST.newsFeatures.length){ GE.layers.setSourceData('news-points',{type:'FeatureCollection',features:HOST.newsFeatures}); try{HOST.scheduleNewsDeclutter();}catch(_){} }
      try{ HOST.refreshNewsPill(); }catch(_){}   /* (#R32) set the band's initial colors for the current theme */
    }
    if(!GE.layers.hasSource('dash-points')){
      GE.layers.addSource('dash-points',{type:'geojson',data:{type:'FeatureCollection',features:[]},promoteId:'fid'});
      GE.layers.add({id:'dash-pulse',type:'circle',source:'dash-points',paint:{
        'circle-radius':['interpolate',['linear'],['zoom'],0,10,4,18,10,28],
        'circle-color':['get','color'],
        'circle-opacity':0.20,
        'circle-stroke-width':0
      }});
      GE.layers.add({id:'dash-dots',type:'circle',source:'dash-points',paint:{
        'circle-radius':['case',['boolean',['feature-state','hover'],false],11,8],
        'circle-color':['get','color'],
        'circle-stroke-width':2,
        'circle-stroke-color':'#ffffff'
      }});
      if(HOST.dashFeatures.length) GE.layers.setSourceData('dash-points',{type:'FeatureCollection',features:HOST.dashFeatures});
    }
    if(window._intelHandlersBound) return;
    window._intelHandlersBound=true;
    /* News hover/click — (#R161 Phase 3) bound through IntMapGeoEngine.events.onLayer */
    GE.events.onLayer('mousemove','news-dots',e=>{
      if(!e.features.length) return;
      GE.render.setCursor('pointer');
      const f=e.features[0];
      if(hoveredNewsId!==f.id){
        if(hoveredNewsId!=null) try{GE.layers.setFeatureState({source:'news-points',id:hoveredNewsId},{hover:false});}catch(err){}
        hoveredNewsId=f.id;
        try{GE.layers.setFeatureState({source:'news-points',id:hoveredNewsId},{hover:true});}catch(err){}
      }
      const el=HOST.ensureMapTooltip(); el.style.display='block';
      el.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--primary-color);font-weight:600;font-size:11px;">[${IntMapSafe.html(f.properties.name)}]</span><span style="color:var(--text-muted);font-size:11px;font-weight:500;">${formatCustomDate(f.properties.pubDate)}</span></div><div style="line-height:1.4;font-weight:500;margin-top:4px;">${IntMapSafe.html(f.properties.title)}</div><div style="color:var(--text-muted);margin-top:6px;font-size:11px;">${IntMapSafe.html(f.properties.publisher)}</div>`;   /* (#R138 SEC) news name/title/publisher come from external RSS → escape */
      HOST.positionTooltip(GE.coords.project(f.geometry.coordinates));
    });
    GE.events.onLayer('mouseleave','news-dots',()=>{
      if(hoveredNewsId!=null){ try{GE.layers.setFeatureState({source:'news-points',id:hoveredNewsId},{hover:false});}catch(err){} hoveredNewsId=null; }
      GE.render.setCursor('');
      if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none';
    });
    /* (#R38) MOBILE: tapping a news pin/band shows a POPUP with a "Read" button rather than jumping straight
       to the article (the explicit request "直接ニュース記事に行くのではなく、ポップアップが出て、そこに読むボタン").
       Desktop keeps the direct open (its hover tooltip already previews the item). */
    function _showMobileNewsPopup(pr){
      if(!pr) return;
      let back=document.getElementById('m-news-pop-back');
      if(!back){ back=document.createElement('div'); back.id='m-news-pop-back'; back.className='m-news-pop-back'; back.innerHTML='<div class="m-news-pop"></div>'; document.body.appendChild(back);
        back.addEventListener('click',(ev)=>{ if(ev.target===back) back.classList.remove('show'); }); }
      const pop=back.querySelector('.m-news-pop'), link=pr.link||'';
      const readLbl=window.IntMapLang.t(HOST.lang,'Read article','記事を読む','Artikel lesen','Читать статью','Leer el artículo');
      const closeLbl=window.IntMapLang.t(HOST.lang,'Close','閉じる','Schließen','Закрыть','Cerrar');
      pop.innerHTML=`<div class="mnp-head"><span class="mnp-loc">${pr.name?('['+IntMapSafe.html(pr.name)+']'):''}</span><span class="mnp-date">${formatCustomDate(pr.pubDate)}</span></div><div class="mnp-title">${IntMapSafe.html(pr.title||'')}</div><div class="mnp-pub">${IntMapSafe.html(pr.publisher||'')}</div><div class="mnp-actions">${link?`<button class="mnp-read" type="button">${readLbl}</button>`:''}<button class="mnp-close" type="button">${closeLbl}</button></div>`;   /* (#R138 SEC) escape external news fields */
      const rb=pop.querySelector('.mnp-read'); if(rb) rb.onclick=()=>{ try{ const _u=IntMapSafe.url(link); if(_u) window.open(_u,'_blank','noopener'); }catch(_){} back.classList.remove('show'); };   /* (#R138 SEC) http(s) only — never open a javascript: link */
      const cb=pop.querySelector('.mnp-close'); if(cb) cb.onclick=()=>back.classList.remove('show');
      back.classList.add('show');
    }
    window._showMobileNewsPopup=_showMobileNewsPopup;
    GE.events.onLayer('click','news-dots',e=>{
      if(!e.features.length) return;
      const p=e.features[0].properties;
      if(HOST.isMobile()){ _showMobileNewsPopup(p); return; }
      /* Desktop: open the article straight in the device's browser (the in-app mini-browser was removed) */
      if(p.link){ const _u=IntMapSafe.url(p.link); if(_u) window.open(_u,'_blank','noopener'); }   /* (#R138 SEC) http(s)-only */
    });
    /* (#R37) The BAND (news-labels = the place-name pill) is the big, natural tap target — make it clickable
       too, not just the tiny dot ("地名ラベルを押しても反応しない"). */
    GE.events.onLayer('click','news-labels',e=>{ if(!e.features.length) return; const p=e.features[0].properties; if(HOST.isMobile()){ _showMobileNewsPopup(p); return; } if(p.link){ const _u=IntMapSafe.url(p.link); if(_u) window.open(_u,'_blank','noopener'); }   /* (#R138 SEC) http(s)-only */ });
    GE.events.onLayer('mousemove','news-labels',e=>{ if(!e.features.length) return; GE.render.setCursor('pointer'); const f=e.features[0];
      /* (#R159) hovering the BAND itself must hide the band while the popup shows — the band's icon/text-opacity
         collapses to 0 when this feature's `hover` state is set (same rule the dot uses). The band sits offset to the
         right of the dot and swallows the pointer, so the news-dots handler never fires here; set the state directly,
         reusing the shared `hoveredNewsId` so crossing dot↔band never leaves a stuck-hover. */
      if(hoveredNewsId!==f.id){
        if(hoveredNewsId!=null) try{GE.layers.setFeatureState({source:'news-points',id:hoveredNewsId},{hover:false});}catch(err){}
        hoveredNewsId=f.id;
        try{GE.layers.setFeatureState({source:'news-points',id:hoveredNewsId},{hover:true});}catch(err){}
      }
      const el=HOST.ensureMapTooltip(); el.style.display='block';
      el.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--primary-color);font-weight:600;font-size:11px;">[${IntMapSafe.html(f.properties.name)}]</span><span style="color:var(--text-muted);font-size:11px;font-weight:500;">${formatCustomDate(f.properties.pubDate)}</span></div><div style="line-height:1.4;font-weight:500;margin-top:4px;">${IntMapSafe.html(f.properties.title)}</div><div style="color:var(--text-muted);margin-top:6px;font-size:11px;">${IntMapSafe.html(f.properties.publisher)}</div>`;   /* (#R138 SEC) news name/title/publisher come from external RSS → escape */
      HOST.positionTooltip(GE.coords.project(f.geometry.coordinates)); });
    GE.events.onLayer('mouseleave','news-labels',()=>{ GE.render.setCursor(''); if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none';
      if(hoveredNewsId!=null){ try{GE.layers.setFeatureState({source:'news-points',id:hoveredNewsId},{hover:false});}catch(err){} hoveredNewsId=null; }   /* (#R159) restore the band when the pointer leaves it */ });
    /* (#R37) MOBILE crosshair → news popup, the same way the DESKTOP cursor reveals the pin under it
       ("モバイル版でも…十字ポインターの位置のニュースは…ポップアップが出るように"). On every settle, look for a news
       pin/band right under the centre crosshair and show the same popup there; tap it to open the article. */
    let _xhrNewsId=null, _xhrLink=null, _xhrProps=null;
    function _crosshairNews(){ try{
      /* (#R107) DISABLED on mobile per request ("disable hover news pin and popping news popup in mobile version"):
         no auto hover-highlight of the pin under the crosshair and no auto-popping news tooltip. Tapping a pin/label
         still opens the article (that handler is separate). Clear any lingering state and bail. */
      if(HOST.mapTooltipEl){ HOST.mapTooltipEl.style.display='none'; HOST.mapTooltipEl.style.pointerEvents='none'; }
      if(_xhrNewsId!=null){ try{GE().layers.setFeatureState({source:'news-points',id:_xhrNewsId},{hover:false});}catch(_){} _xhrNewsId=null; _xhrLink=null; _xhrProps=null; }
      return;
      if(!HOST.isMobile()||!_imCanDraw()||!GE().layers.has('news-dots')) return;
      if(HOST.toolMode||document.body.classList.contains('pg-we')){ if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none'; return; }
      const c=GE().coords.project(GE().camera.getCenter()); const R=22;
      const layers=['news-labels','news-dots'].filter(l=>GE().layers.get(l));
      let hits=[]; try{ hits=GE().coords.queryRenderedFeatures([[c.x-R,c.y-R],[c.x+R,c.y+R]],{layers}); }catch(_){}
      if(hits&&hits.length){ let best=hits[0],bd=Infinity; hits.forEach(f=>{ try{ const p=GE().coords.project(f.geometry.coordinates); const d=Math.hypot(p.x-c.x,p.y-c.y); if(d<bd){bd=d;best=f;} }catch(_){} }); const f=best, pr=f.properties||{};
        if(_xhrNewsId!==f.id){ if(_xhrNewsId!=null) try{GE().layers.setFeatureState({source:'news-points',id:_xhrNewsId},{hover:false});}catch(_){}
          _xhrNewsId=f.id; try{GE().layers.setFeatureState({source:'news-points',id:f.id},{hover:true});}catch(_){} }
        _xhrLink=pr.link||null; _xhrProps=pr;
        const el=HOST.ensureMapTooltip(); el.style.display='block'; el.style.pointerEvents='auto'; el.style.cursor='pointer';
        el.innerHTML=`<div style="display:flex;justify-content:space-between;gap:8px;"><span style="color:var(--primary-color);font-weight:600;font-size:11px;">[${pr.name}]</span><span style="color:var(--text-muted);font-size:11px;font-weight:500;">${formatCustomDate(pr.pubDate)}</span></div><div style="line-height:1.4;font-weight:500;margin-top:4px;">${pr.title}</div><div style="color:var(--text-muted);margin-top:6px;font-size:11px;">${pr.publisher}${' · '+(window.IntMapLang.t(HOST.lang,'tap for details','タップで詳細','Für Details tippen','Нажмите для подробностей','toca para ver detalles'))}</div>`;
        try{ HOST.positionTooltip(GE().coords.project(f.geometry.coordinates)); }catch(_){}
      } else { if(_xhrNewsId!=null){ try{GE().layers.setFeatureState({source:'news-points',id:_xhrNewsId},{hover:false});}catch(_){} _xhrNewsId=null; } _xhrLink=null; _xhrProps=null; if(HOST.mapTooltipEl){ HOST.mapTooltipEl.style.display='none'; HOST.mapTooltipEl.style.pointerEvents='none'; } }
    }catch(_){} }
    window._crosshairNews=_crosshairNews;
    GE().events.on('moveend',_crosshairNews);
    /* tap the crosshair popup itself → open the article (the dot under the crosshair is too small to hit) */
    document.addEventListener('click',(ev)=>{ try{ if(!HOST.isMobile()||!_xhrProps) return; if(HOST.mapTooltipEl&&HOST.mapTooltipEl.style.display!=='none'&&HOST.mapTooltipEl.contains(ev.target)){ _showMobileNewsPopup(_xhrProps); } }catch(_){} });
    /* Dash hover/click */
    GE().events.onLayer('mousemove','dash-dots',e=>{
      if(!e.features.length) return;
      GE().render.canvas().style.cursor='pointer';
      const f=e.features[0];
      if(hoveredDashId!==f.id){
        if(hoveredDashId!=null){
          try{GE().layers.setFeatureState({source:'dash-points',id:hoveredDashId},{hover:false});}catch(err){}
          const oc=document.getElementById('card-'+hoveredDashId); if(oc) oc.classList.remove('hovered');
          const olditem=HOST.extendedDashDB.find(i=>i.id===hoveredDashId); if(olditem&&olditem.layerRef) window.triggerLayerHover(olditem.layerRef,false);
        }
        hoveredDashId=f.id;
        try{GE().layers.setFeatureState({source:'dash-points',id:hoveredDashId},{hover:true});}catch(err){}
        const card=document.getElementById('card-'+hoveredDashId);
        if(card){ card.classList.add('hovered'); }
        if(f.properties.layerRef) window.triggerLayerHover(f.properties.layerRef,true);
      }
      const el=HOST.ensureMapTooltip(); el.style.display='block';
      el.innerHTML=`<div style="color:${f.properties.color};font-weight:600;font-size:14px;">${f.properties.title}</div><div style="line-height:1.4;margin-top:4px;color:var(--text-muted);">${f.properties.body}</div>`;
      HOST.positionTooltip(GE().coords.project(f.geometry.coordinates));
    });
    GE().events.onLayer('mouseleave','dash-dots',()=>{
      if(hoveredDashId!=null){
        try{GE().layers.setFeatureState({source:'dash-points',id:hoveredDashId},{hover:false});}catch(err){}
        const oc=document.getElementById('card-'+hoveredDashId); if(oc) oc.classList.remove('hovered');
        const olditem=HOST.extendedDashDB.find(i=>i.id===hoveredDashId); if(olditem&&olditem.layerRef) window.triggerLayerHover(olditem.layerRef,false);
        hoveredDashId=null;
      }
      GE().render.canvas().style.cursor='';
      if(HOST.mapTooltipEl) HOST.mapTooltipEl.style.display='none';
    });
    GE().events.onLayer('click','dash-dots',e=>{
      if(!e.features.length) return;
      const f=e.features[0], id=f.id;
      GE().camera.flyTo({center:f.geometry.coordinates,zoom:4,speed:1.2});
      const wasInfo=HOST.mode==='info';
      if(!wasInfo) HOST.setMode('info','btn-info');   /* clicking a pin reveals its card */
      setTimeout(()=>{ const card=document.getElementById('card-'+id); if(card){ card.scrollIntoView({behavior:'smooth',block:'center'}); card.classList.add('hovered'); setTimeout(()=>card.classList.remove('hovered'),1800); } }, wasInfo?60:280);
    });
  }

  function _spreadDupNewsPins(feats){ try{ if(!Array.isArray(feats)||feats.length<2) return feats;
    const groups=new Map();
    feats.forEach(f=>{ if(!f||!f.geometry) return;
      /* (#R127) remember each pin's ORIGINAL anchor so the spread is IDEMPOTENT — re-running it (once the async
         country borders finish loading, see _respreadNews) re-groups by the TRUE stacked coords instead of the
         already-scattered ones (which no longer collide → a permanent tight blob if countryGeo wasn't ready on the
         first pass — the strongest systemic cause of "密集的に散らすだけ"). */
      if(!f.__oc){ const c=f.geometry.coordinates; if(!c||!isFinite(+c[0])||!isFinite(+c[1])) return; f.__oc=[+c[0],+c[1]]; }
      const c=f.__oc; const k=c[0].toFixed(3)+','+c[1].toFixed(3); let g=groups.get(k); if(!g){ g=[]; groups.set(k,g); } g.push(f); });
    const GA=2.399963229; /* golden angle (rad) */
    const cg=(window.countryGeo&&window.countryGeo.features&&window.countryGeo.features.length)?window.countryGeo:null;
    const haveTurf=(typeof turf!=='undefined');
    const _regCache=new Map();
    /* the country polygon under an anchor + its bbox / representative centre, AND the LARGEST ring's own bbox +
       polygon (used to spread when the whole-feature bbox is an antimeridian artifact). */
    function regionFor(c0){ if(!cg||!haveTurf) return null; const key=c0[0].toFixed(2)+','+c0[1].toFixed(2);
      if(_regCache.has(key)) return _regCache.get(key);
      let out=null; try{ const pt=turf.point(c0);
        for(const f of cg.features){ if(!f.geometry) continue; try{ if(turf.booleanPointInPolygon(pt,f)){
          const bb=turf.bbox(f);
          /* (#R124) representative point = centroid of the LARGEST ring (by bbox area), NOT the whole-feature bbox
             centre — the latter is skewed by outlying territory (Alaska pulls the US centre up into Canada).
             (#R127) also keep that largest ring's OWN bbox + polygon: a country whose polygon crosses the
             antimeridian (USA/Aleutians, Russia, Fiji, NZ) has turf.bbox ≈ [-180…180], so sampling the WHOLE bbox
             lands ~99% in open ocean → EVERY rejection sample misses → the old code collapsed to a 0.12° dot. This
             is exactly the reported "アメリカに分類された…アメリカの領域内に分散できていない". Sample the mainland ring. */
          let bc=[(bb[0]+bb[2])/2,(bb[1]+bb[3])/2], rbb=bb.slice(), rPoly=f;
          try{ const polys=f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates]; let bestA=-1;
            polys.forEach(poly=>{ const ring=poly&&poly[0]; if(!ring||ring.length<3) return; let mnx=1e9,mny=1e9,mxx=-1e9,mxy=-1e9,sx=0,sy=0; ring.forEach(p=>{ if(p[0]<mnx)mnx=p[0]; if(p[0]>mxx)mxx=p[0]; if(p[1]<mny)mny=p[1]; if(p[1]>mxy)mxy=p[1]; sx+=p[0]; sy+=p[1]; }); const a=(mxx-mnx)*(mxy-mny); if(a>bestA){ bestA=a; bc=[sx/ring.length,sy/ring.length]; rbb=[mnx,mny,mxx,mxy]; rPoly={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[ring]}}; } });
          }catch(_){}
          out={f,bb,bc,rbb,rPoly}; break; } }catch(_){} } }catch(_){}
      _regCache.set(key,out); return out; }
    function seeded(c0){ let s=Math.abs(Math.round(c0[0]*1000+c0[1]*7919))||1; return ()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }; }
    groups.forEach(g=>{ if(g.length<2) return; const c0=g[0].__oc.slice();
      const ptype=String((g[0].properties&&g[0].properties.ptype)||'').toLowerCase();
      const reg=regionFor(c0);
      /* country-level = the gazetteer typed it 'country', OR the anchor sits near the containing country's
         representative centre — a country-representative point (a stacked cluster ON the centroid), not a real city
         inside it. (#R127) the proximity test now also rescues a country cluster mis-typed 'city' (a "US"/"America"
         headline that resolved to a city term) — a genuine city almost never sits within ~1.6° of the mainland
         centroid AND stacks dozens of duplicate stories there. */
      let countryLevel=false;
      if(reg){ if(ptype==='country'||ptype==='nation') countryLevel=true;
        else if(ptype!=='region'&&ptype!=='flashpoint'){ const near=Math.hypot(c0[0]-reg.bc[0],c0[1]-reg.bc[1]); countryLevel = near < (ptype==='city'?1.6:2.6); } }
      if(countryLevel && reg){
        /* (#R127) antimeridian-safe: if the whole-feature bbox is absurdly wide it's a dateline artifact → spread
           over the mainland ring; otherwise the full feature (best coverage for compact archipelagos like
           Indonesia/Philippines that don't cross 180°). */
        const crossAM=(reg.bb[2]-reg.bb[0])>180;
        const sbb=crossAM?reg.rbb:reg.bb, sf=crossAM?reg.rPoly:reg.f, rnd=seeded(c0), cosl=Math.max(0.2,Math.cos(c0[1]*Math.PI/180));
        const diag=Math.hypot(sbb[2]-sbb[0],sbb[3]-sbb[1]);
        g.forEach((ft,i)=>{ let placed=null;
          for(let k=0;k<44;k++){ const lng=sbb[0]+rnd()*(sbb[2]-sbb[0]), lat=sbb[1]+rnd()*(sbb[3]-sbb[1]);
            try{ if(turf.booleanPointInPolygon(turf.point([lng,lat]),sf)){ placed=[lng,lat]; break; } }catch(_){} }
          if(!placed){ const r=Math.min(diag*0.42,0.5+0.14*Math.sqrt(i)), ang=i*GA;   /* miss → REGION-scaled disk (mainland diagonal), genuinely wide — not a 0.12° dot */
            placed=[c0[0]+r*Math.cos(ang)/cosl, c0[1]+r*Math.sin(ang)]; }
          ft.geometry={type:'Point',coordinates:placed}; });
      } else {
        const cosl=Math.max(0.2,Math.cos(c0[1]*Math.PI/180));
        /* (#R127) widened so a mis-classified or borderless cluster still reads as DISTRIBUTED, not a dense knot;
           still latitude-corrected and clipped back inside the containing country when one is known. */
        const base=(ptype==='region')?0.12:(ptype==='city'||ptype==='flashpoint')?0.05:0.08;
        const cap=(ptype==='region')?1.1:(ptype==='city'||ptype==='flashpoint')?0.32:0.5;
        g.forEach((ft,i)=>{ if(i===0){ ft.geometry={type:'Point',coordinates:c0.slice()}; return; }   /* leave one pin on the true spot (reset on a re-spread) */
          let r=Math.min(cap,base*Math.sqrt(i)); const ang=i*GA;
          let lng=c0[0]+r*Math.cos(ang)/cosl, lat=c0[1]+r*Math.sin(ang);
          if(reg&&haveTurf){ try{ if(!turf.booleanPointInPolygon(turf.point([lng,lat]),reg.f)){ r*=0.5; lng=c0[0]+r*Math.cos(ang)/cosl; lat=c0[1]+r*Math.sin(ang); } }catch(_){} }
          ft.geometry={type:'Point',coordinates:[lng,lat]}; }); }
    });
    return feats; }catch(_){ return feats; } }

  function renderUI(){ publishSaved();
    const feed=document.getElementById('live-news-feed'),
          cfeed=document.getElementById('countries-feed'),
          dash=document.getElementById('info-dashboard'),
          comm=document.getElementById('community-feed'),
          afeed=document.getElementById('atlas-feed'),   /* (#R112) Atlas tab content area */
          sb=document.getElementById('sidebar-search-bar'),   /* (#R79e) by ID — #countries-search-bar also has class .search-bar, so querySelector('.search-bar') could grab it after a ws cycle and renderUI would leak the "Filter countries" box into the normal sidebar */
          filterToggle=document.getElementById('news-filter-toggle');
    HOST.clearMarkers();
    try{ HOST.pushCommunityFeatures(); }catch(_){}   /* show community pins only on the Community tab */
    /* Hide all panels first (pin-mode toggle now lives inside #ai-geocode-row, #28) */
    feed.style.display='none'; if(cfeed) cfeed.style.display='none'; dash.style.display='none'; comm.style.display='none'; if(afeed) afeed.style.display='none'; filterToggle.style.display='none';
    { const _mf=document.getElementById('monitors-feed'); if(_mf) _mf.style.display='none'; }   /* (#R141) hide Monitors feed unless its tab is active */
    { const gr=document.getElementById('ai-geocode-row'); if(gr) gr.style.display='none'; }
    /* Stats compare panel only belongs on the Stats tab (#26) */
    if(HOST.mode!=='stats'){ const scf=document.getElementById('stats-compare-fixed'); if(scf){ scf.classList.remove('show'); scf.innerHTML=''; } feed.style.paddingBottom=''; }
    if(HOST.mode!=='info'){ const cof=document.getElementById('co-compare-fixed'); if(cof){ cof.classList.remove('show'); cof.innerHTML=''; } }   /* (#R152) Companies compare dock only belongs on the Companies tab — mirror the Countries dock hide above so the absolute overlay never lingers over another tab */
    /* Search-bar UI per tab (#27): News keeps a Search button (matching is slow);
       Info & Stats filter live as you type, so their button is hidden.
       Summarize-this-view button shows only on the News tab (#20). */
    const searchBtn=document.getElementById('btn-search');
    const sumBtn=document.getElementById('ai-view-summary-btn');
    const isNewsTab=(HOST.mode==='news'||HOST.mode==='saved');
    if(searchBtn) searchBtn.style.display=isNewsTab?'':'none';
    /* (#R129) the Countries search bar's "pick on the map" crosshair shows only on the Countries tab (the bar is
       shared with News/Info); leaving Countries cancels an active pick so the crosshair/handler never lingers. */
    { const cpk=document.getElementById('csearch-pick'); if(cpk) cpk.classList.toggle('on-tab', HOST.mode==='stats'); }
    if(!document.body.classList.contains('ws-mode') && HOST.mode!=='stats' && window.__countryPickActive && window.__countryPickActive()){ try{ window.__countryPick(false); }catch(_){} }
    /* (#R85) "要約ボタンがニュースウィンドウを開いてなくても表示される": in workspace mode renderUI still runs with
       currentMode==='news' even when the News WINDOW is hidden, so the summarize-view button leaked onto the map.
       Also require the News window to be visible in ws-mode (_wsNewsHidden() is always false outside ws-mode, so
       the normal News-tab behaviour is unchanged). */
    if(sumBtn) sumBtn.style.display=(isNewsTab && !(window._wsNewsHidden&&window._wsNewsHidden()))?'':'none';
    { const ip=document.getElementById('search-input'); if(ip) ip.placeholder = (HOST.mode==='stats'||HOST.mode==='info'||HOST.mode==='monitors') ? (window.IntMapLang.t(HOST.lang,'Filter…','絞り込み...','Filtern…','Фильтр…','Filtrar…')) : HOST.t('searchPh'); }

    /* (#R11) No tab selected → blank sidebar content (map stays prominent). News pins still load when the
       user opens the News tab. (#R19) The blank state now hosts the opt-in Apple-style widget board. */
    if(!HOST.mode){ if(sb) sb.style.display='none'; try{ window.IntMapWidgets2&&window.IntMapWidgets2.sync(); }catch(_){} try{ HOST.updateOcclusion(); }catch(_){} return; }
    try{ window.IntMapWidgets2&&window.IntMapWidgets2.sync(); }catch(_){}
    /* (#R112) Atlas tab — the console renders IN FLOW inside #atlas-feed (below the tab bar), exactly like News /
       Information / Countries. Its own input replaces the news search bar. Workspace mode never reaches here (Atlas
       is its own window there). */
    if(HOST.mode==='atlas'){ if(afeed) afeed.style.display='flex'; if(sb) sb.style.display='none';
      /* (#R224) fetches the kernel if this is the first time Atlas has been reached for */
      try{ if(window.IntMapAtlas) window.IntMapAtlas.call('mountTab'); else if(window.IntMapConsole&&window.IntMapConsole.mountTab) window.IntMapConsole.mountTab(); }catch(_){}
      try{ HOST.updateOcclusion(); }catch(_){} return; }
    if(HOST.mode==='info'){ dash.style.display='flex'; sb.style.display='flex'; HOST.renderDashboard(); HOST.updateOcclusion(); return; }
    if(HOST.mode==='monitors'){ const mf=document.getElementById('monitors-feed'); if(mf) mf.style.display='flex'; sb.style.display='flex';   /* (#R141) Monitors tab */
      try{ window.IntMapMonitors&&window.IntMapMonitors.render(HOST.searchVal()); }catch(_){}
      try{ HOST.updateOcclusion(); }catch(_){} return; }
    if(HOST.mode==='community'){ comm.style.display='flex'; sb.style.display='none'; HOST.loadCommunity(); HOST.updateOcclusion(); return; }
    if(HOST.mode==='stats'){ if(cfeed) cfeed.style.display='flex'; sb.style.display='flex'; HOST.renderStats(HOST.searchVal()); return; }
    if(HOST.mode==='news'||HOST.mode==='saved'){
      feed.style.display='flex'; sb.style.display='flex';
      filterToggle.style.display='block';
      /* (#R30) Translate titles only when the news set actually carries a non-UI language. */
      { const gr=document.getElementById('ai-geocode-row'); if(gr) gr.style.display=HOST._newsHasForeignLang()?'block':'none'; }
      try{ HOST.aiSyncFeatureButtons(); }catch(_){}
      /* sync the All / ★ Saved sub-filter (Saved now lives inside the News tab) */
      document.getElementById('newsfilter-all').textContent = window.IntMapLang.t(HOST.lang,'All','すべて','Alle','Все','Todo');
      document.getElementById('newsfilter-saved').textContent = window.IntMapLang.t(HOST.lang,'★ Saved','★ 保存済み','★ Gespeichert','★ Сохранённые','★ Guardado');
      document.getElementById('newsfilter-all').classList.toggle('active', HOST.mode==='news');
      document.getElementById('newsfilter-saved').classList.toggle('active', HOST.mode==='saved');
      /* sync the segmented control with current mode */
      document.getElementById('pinmode-loc').classList.toggle('active', HOST.newsPinMode==='location');
      document.getElementById('pinmode-pub').classList.toggle('active', HOST.newsPinMode==='publisher');
      HOST.startNews(); return;
    }
    feed.style.display='flex'; sb.style.display='none'; feed.innerHTML=`<div class="empty-msg">${HOST.t('emptyHint')}</div>`;
  }

  /* Rebuild news-points from the current filter WITHOUT touching the sidebar feed (so a
     progressive update during geocoding doesn't reset scroll). Mirrors startNews()'s shape. */
  function aiRefreshNewsPins(){
    if(!(GE().layers.hasSource('news-points'))) return;
    HOST.newsFeatures=[];
    HOST.computeFilteredNews().forEach(item=>{ const a=item.analysis; if(a&&a.loc){
      const fid='n_'+Math.random().toString(36).slice(2,10);
      const mappedStr=a.mapped===true?'true':(a.mapped==='publisher'?'publisher':'none');
      HOST.newsFeatures.push({type:'Feature',id:fid,geometry:{type:'Point',coordinates:a.loc},properties:{
        fid, mapped:mappedStr, ptype:a.ptype||'', title:item.title, name:a.name||'', short:a.short||'', publisher:item.publisher, link:item.link, pubDate:item.pubDate }});
    }});
    _spreadDupNewsPins(HOST.newsFeatures);   /* (#R122) fan out pins sharing an anchor */
    GE().layers.setSourceData('news-points',{type:'FeatureCollection',features:HOST.newsFeatures}); try{HOST.scheduleNewsDeclutter();}catch(_){}
  }

  const AI_GEO_CAP=120;

  async function aiGeocodeNews(force){
    if(!HOST.aiGate()) return;
    const mode=HOST.newsPinMode, pub=(mode==='publisher'), cacheKey=pub?'_aiPub':'_aiGeo';
    const need=it=>{ const a=it.analysis; if(!a) return false;
      if(force) return true;
      return pub ? (!a.pubLoc && !a[cacheKey]) : (!a.subjectLoc && !a[cacheKey]); };
    const todo=HOST.computeFilteredNews().filter(need).slice(0,AI_GEO_CAP);
    const btn=document.getElementById('ai-geocode-btn');
    if(!todo.length){ HOST.aiToast(HOST.t('aiGeoNone')); return; }
    HOST.aiSetBtnBusy(btn,true,HOST.t('aiGeoBusy'));
    const sys=pub
      ? "You are a precise geocoder. Each numbered line is the NAME of a news outlet / publisher. Return the city where that outlet is headquartered. Reply with ONLY a JSON array, one object per identifiable outlet: {\"i\":<index>,\"name\":\"<City, Country>\",\"lat\":<number>,\"lng\":<number>}. Omit outlets you cannot place. No commentary, no code fences."
      : "You are a precise geocoder for a world news map. For EACH numbered headline, return the SUBJECT LOCATION: the single specific real-world place where the main event/incident actually happens. RULES: (1) NOT the news outlet's HQ or dateline (e.g. ignore 'Reuters, London'). (2) NOT a place where someone merely SPOKE about the event — if an official at the White House in Washington comments on the Middle East, return the specific Middle-East country/city the event concerns, NOT Washington. (3) Be as SPECIFIC as possible — prefer city/landmark over country (e.g. 'Mariupol' over 'Ukraine', 'Rafah' over 'Gaza' when identifiable). Reply with ONLY a JSON array; one object per locatable item: {\"i\":<index number>,\"name\":\"<short English place name, most specific>\",\"lat\":<number>,\"lng\":<number>}. Omit any item with no clear subject location. No commentary, no code fences.";
    const BATCH=12; let done=0, hit=0, failed=false;
    try{
      for(let i=0;i<todo.length;i+=BATCH){
        const chunk=todo.slice(i,i+BATCH);
        const list=pub
          ? chunk.map((it,k)=>`${k}. ${it.publisher||'?'}`).join('\n')
          : chunk.map((it,k)=>`${k}. ${it.title}${it.desc?' — '+String(it.desc).slice(0,160):''}`).join('\n');
        let arr=null;
        try{ arr=await HOST.askAIJSON((pub?'Outlets:\n':'Headlines:\n')+list, sys); }
        catch(e){ HOST.aiToast((e&&e.message)||HOST.t('aiGeoErr')); failed=true; break; }
        if(Array.isArray(arr)) arr.forEach(o=>{
          if(!o||typeof o.lat!=='number'||typeof o.lng!=='number') return;
          if(o.lat<-90||o.lat>90||o.lng<-180||o.lng>180) return;
          const it=chunk[o.i]; if(!it||!it.analysis) return;
          if(pub){ it.analysis.pubLoc=[o.lng,o.lat]; it.analysis.pubName=(window.IntMapLang.t(HOST.lang,'Source: ','発信: ','Quelle: ','Источник: ','Fuente: '))+(o.name||it.publisher||''); }
          else { it.analysis.subjectLoc=[o.lng,o.lat]; it.analysis.subjectName=o.name||it.analysis.subjectName||''; }
          HOST.applyPinMode(it.analysis); hit++;
        });
        /* mark the whole chunk attempted so auto-mode won't re-ask outlets the AI couldn't place */
        chunk.forEach(it=>{ if(it.analysis) it.analysis[cacheKey]=true; });
        done+=chunk.length;
        HOST.aiSetBtnBusy(btn,true,HOST.t('aiGeoBusy')+' '+done+'/'+todo.length);
        aiRefreshNewsPins(); /* progressive pin update */
      }
    } finally { HOST.aiSetBtnBusy(btn,false); }
    if(HOST.mode==='news'||HOST.mode==='saved') HOST.startNews(); /* refresh feed chips + pins */
    if(!failed) HOST.aiToast(hit? HOST.t('aiGeoDone').replace('{n}',hit) : HOST.t('aiGeoNone'));
  }

  function appendNewsBatch(){ publishSaved();
    const feed=document.getElementById('live-news-feed');
    const next=HOST.newsFiltered.slice(HOST.renderedCount, HOST.renderedCount+HOST.NEWS_BATCH);
    next.forEach(item=>{
      const card=document.createElement('div'); card.className='news-item'; const bm=HOST.bookmarks.includes(item.link);
      /* (#R215) ⚠ NOT `item.analysis.…` — see the snapshot note above snapPut. A restored ★ card can
         legitimately have no analysis at all, and one TypeError inside this forEach silently ends the
         whole batch. The object is normalised in place so everything below (and the pin builder) sees
         the shape it expects. */
      if(!item.analysis||typeof item.analysis!=='object') item.analysis={ loc:null, name:'', short:'', mapped:false };
      let chipCls='loc-chip';
      if(item.analysis.mapped===true) chipCls='loc-chip';
      else if(item.analysis.mapped==='publisher') chipCls='loc-chip publisher';
      else chipCls='loc-chip unmapped';
      const readLabel = window.IntMapLang.t(HOST.lang,'Read ↗','記事を読む ↗','Lesen ↗','Читать ↗','Leer ↗');
      card.innerHTML=`<button class="btn-bookmark ${bm?'active':''}">★</button>
        <div class="news-head"><span class="${chipCls}">${IntMapSafe.html(item.analysis.name)||(window.IntMapLang.t(HOST.lang,'Location unknown','場所不明','Ort unbekannt','Место неизвестно','Ubicación desconocida'))}</span><small class="news-date">${formatCustomDate(item.pubDate)}</small></div>
        <div class="news-title">${HOST.newsTitleHTML(item)}</div>
        <div class="news-foot"><small class="news-pub"${item.publisher?' role="link" tabindex="0" title="'+IntMapSafe.html(item.publisher+' — Wikipedia ↗')+'"':''}>${IntMapSafe.html(item.publisher)}</small><button class="btn-read">${readLabel}</button></div>`;   /* (#R138 SEC) name/publisher from external RSS → escape (newsTitleHTML self-escapes) */
      card.querySelector('.btn-bookmark').onclick=async(e)=>{ e.stopPropagation();
        /* (#R210) the snapshot is written from the item that is ON SCREEN — the only moment the app
           is holding everything a saved card needs. Written before the await so a slow round-trip
           cannot lose it, and rolled back if the toggle turns out to have been an UN-save. */
        if(HOST.user){ snapPut(item); const on=await toggleFavorite(item.link,item.title); if(!on) snapForget(item.link); if(HOST.mode==='saved')HOST.startNews(); else card.querySelector('.btn-bookmark').classList.toggle('active',on); }
        else { /* guest: keep a local list until they log in */ if(HOST.bookmarks.includes(item.link)){ HOST.bookmarks=HOST.bookmarks.filter(b=>b!==item.link); snapForget(item.link); } else { HOST.bookmarks.push(item.link); snapPut(item); } saveBookmarks(); if(HOST.mode==='saved')HOST.startNews(); else card.querySelector('.btn-bookmark').classList.toggle('active'); }
      };
      /* (#R11) Read article → open directly in the device's browser (reverted per request). */
      card.querySelector('.btn-read').onclick=(e)=>{ e.stopPropagation(); const _u=IntMapSafe.url(item.link); if(_u) window.open(_u,'_blank','noopener'); };   /* (#R138 SEC) http(s)-only */
      /* (#R142) Clicking the OUTLET NAME opens that outlet's Wikipedia page in the UI language (jp→ja subdomain). Uses
         Special:Search&go=Go so an exact title jumps straight to the article and a near-miss lands on search results
         instead of a 404 (publisher strings from RSS don't always match a Wikipedia title exactly). stopPropagation so
         it doesn't also fly the card. */
      { const pub=card.querySelector('.news-pub');
        if(pub&&item.publisher){ const openWiki=(e)=>{ e.stopPropagation(); const wl=(HOST.lang==='jp')?'ja':HOST.lang; const _u=IntMapSafe.url('https://'+wl+'.wikipedia.org/w/index.php?title=Special:Search&search='+encodeURIComponent(item.publisher)+'&go=Go'); if(_u) window.open(_u,'_blank','noopener'); };
          pub.onclick=openWiki; pub.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openWiki(e); } }); } }
      /* Whole card → fly to the map location (replaces the old "Show on map" button) */
      card.onclick=()=>{ if(item.analysis.loc) GE().camera.flyTo({center:item.analysis.loc,zoom:4,speed:1.0}); };
      item._cardEl=card; /* lets the translation pass update this title in place */
      feed.appendChild(card);
      /* Pins are populated in bulk by startNews(); no per-batch pin push here. */
    });
    HOST.renderedCount+=next.length;
    HOST.updateOcclusion();
  }

  function readerBar(item,mode){
    const back=window.IntMapLang.t(HOST.lang,'Back','戻る','Zurück','Назад','Atrás');
    const other=mode==='reader'?(window.IntMapLang.t(HOST.lang,'🌐 Web','🌐 ページ表示','🌐 Web','🌐 Веб','🌐 Web')):(window.IntMapLang.t(HOST.lang,'📖 Reader','📖 リーダー','📖 Reader','📖 Читалка','📖 Lector'));
    return `<div class="nrp-bar"><button class="nrp-back" id="nrp-back-btn">‹ ${back}</button><button class="nrp-mode" id="nrp-mode-btn">${other}</button>${mode==='reader'?`<button class="nrp-mode" id="nrp-translate-btn">✨ ${HOST.t('aiTranslate')}</button>`:''}<span class="nrp-src">${HOST.escForReader(item.publisher)}</span></div>`;
  }

  function renderReaderMode(item,res,mode){
    const pane=document.getElementById('news-reader-pane'); if(!pane) return;
    const metaRow=`<div class="nrp-meta"><span>${HOST.escForReader(item.publisher)}</span><span class="nrp-dot"></span><span>${HOST.escForReader(formatCustomDate(item.pubDate))}</span></div>`;
    if(mode==='web'){
      pane.innerHTML=`${readerBar(item,'web')}
        <h1 class="nrp-title">${HOST.escForReader(item.title)}</h1>${metaRow}
        <div class="nrp-webwrap"><div class="nrp-webnote" id="nrp-webnote">${window.IntMapLang.t(HOST.lang,'Loading page…','ページを読み込み中…','Seite lädt…','Загрузка страницы…','Cargando página…')}</div><iframe class="nrp-iframe" src="${HOST.escForReader(item.link)}" referrerpolicy="no-referrer" sandbox="allow-same-origin allow-scripts allow-popups allow-forms"></iframe></div>
        <a class="nrp-orig" href="${HOST.escForReader(item.link)}" target="_blank" rel="noopener">${window.IntMapLang.t(HOST.lang,'Open in new tab','新しいタブで開く','In neuem Tab öffnen','Открыть в новой вкладке','Abrir en pestaña nueva')} ↗</a>`;
      const ifr=pane.querySelector('.nrp-iframe'); const note=pane.querySelector('#nrp-webnote');
      if(ifr){ ifr.addEventListener('load',()=>{ if(note) note.style.display='none'; });
        setTimeout(()=>{ if(note&&note.style.display!=='none') note.innerHTML=window.IntMapLang.t(HOST.lang,'This site blocks embedding. Try “📖 Reader” or open it in a new tab.','このサイトは埋め込み表示を許可していません。「📖 リーダー」か「新しいタブで開く」をお使いください。','Diese Seite erlaubt kein Einbetten. Nutze „📖 Reader“ oder öffne sie in einem neuen Tab.','Сайт запрещает встраивание. Используйте «📖 Читалка» или откройте в новой вкладке.','Este sitio bloquea la inserción. Prueba «📖 Lector» o ábrelo en una pestaña nueva.'); }, 5000); }
    } else {
      const locName=(item.analysis&&item.analysis.name)?item.analysis.name:'';
      const bodyHtml=(res.blocks&&res.blocks.length)
        ? res.blocks.map(b=> b.t==='h' ? `<h3>${HOST.escForReader(b.v)}</h3>` : `<p>${HOST.escForReader(b.v)}</p>`).join('')
        : `<p>${window.IntMapLang.t(HOST.lang,'Could not extract text — use “🌐 Web” above to open the page.','本文を自動取得できませんでした。上の「🌐 ページ表示」で元ページを開けます。','Text konnte nicht extrahiert werden — öffne die Seite über „🌐 Web“ oben.','Не удалось извлечь текст — откройте страницу через «🌐 Веб» выше.','No se pudo extraer el texto — abre la página con «🌐 Web» arriba.')}</p>`;
      const heroHtml=res.hero?`<img class="nrp-hero" src="${HOST.escForReader(res.hero)}" onerror="this.style.display='none'">`:'';
      const locHtml=locName?`<span class="nrp-loc" id="nrp-loc">${HOST.escForReader(locName)}</span>`:'';
      pane.innerHTML=`${readerBar(item,'reader')}
        ${heroHtml}${locHtml}
        <h1 class="nrp-title">${HOST.escForReader(item.title)}</h1>${metaRow}
        <div class="nrp-body">${bodyHtml}</div>
        <a class="nrp-orig" href="${HOST.escForReader(item.link)}" target="_blank" rel="noopener">${window.IntMapLang.t(HOST.lang,'Open original','元記事を開く','Original öffnen','Открыть оригинал','Abrir original')} ↗</a>`;
      const locEl=pane.querySelector('#nrp-loc');
      if(locEl) locEl.onclick=()=>{ if(item.analysis&&item.analysis.loc) GE().camera.flyTo({center:item.analysis.loc,zoom:4,speed:1.0}); };
    }
    pane.querySelector('#nrp-back-btn').onclick=HOST.closeArticleReader;
    const mb=pane.querySelector('#nrp-mode-btn');
    if(mb) mb.onclick=()=>renderReaderMode(item,res, mode==='web'?'reader':'web');
    const tb=pane.querySelector('#nrp-translate-btn'); if(tb) tb.onclick=()=>aiTranslateReader(item,res,tb);
    pane.scrollTop=0;
  }

  async function aiTranslateReader(item,res,btn){
    if(!HOST.aiGate()) return;
    const bodyEl=document.querySelector('#news-reader-pane .nrp-body'); if(!bodyEl||!btn) return;
    const setLbl=on=>{ btn.innerHTML = on ? '↩ '+HOST.aiEsc(HOST.t('aiShowOriginal')) : '✨ '+HOST.aiEsc(HOST.t('aiTranslate')); };
    if(bodyEl.dataset.translated==='1'){ if(res._origHTML!=null) bodyEl.innerHTML=res._origHTML; bodyEl.dataset.translated='0'; setLbl(false); return; }
    if(res._translatedHTML){ if(res._origHTML==null) res._origHTML=bodyEl.innerHTML; bodyEl.innerHTML=res._translatedHTML; bodyEl.dataset.translated='1'; setLbl(true); return; }
    const src=((res.blocks||[]).map(b=>b&&b.v).filter(Boolean).join('\n\n')||'').trim();
    if(!src){ HOST.aiToast(HOST.t('aiTransNoText')); return; }
    res._origHTML=bodyEl.innerHTML; btn.disabled=true; btn.innerHTML='<span class="ai-spin"></span>';
    try{
      /* (#R39) Translate into the UI language, not always Japanese (DE/RU/EN users got Japanese). */
      const _tgt=HOST._aiLangName();
      const sys="You are a professional news translator. Translate the article into natural, fluent "+_tgt+". Keep paragraph breaks. Do not add notes, labels, or the original text — output only the "+_tgt+" translation.";
      const out=await HOST.askAI('Title: '+item.title+'\n\n'+src, sys);
      const paras=String(out||'').split(/\n{2,}/).map(s=>s.trim()).filter(Boolean);
      res._translatedHTML=(paras.length?paras:[String(out||'')]).map(p=>`<p>${HOST.escForReader(p)}</p>`).join('');
      bodyEl.innerHTML=res._translatedHTML; bodyEl.dataset.translated='1';
    }catch(e){ HOST.aiToast((e&&e.message)||HOST.t('aiError')); }
    finally{ btn.disabled=false; setLbl(bodyEl.dataset.translated==='1'); }
  }

  async function toggleFavorite(link,title){
    if(!HOST.user){ HOST.openAuthModal(); return false; }
    const has=HOST.bookmarks.includes(link);
    if(has){ HOST.bookmarks=HOST.bookmarks.filter(b=>b!==link); await HOST.DB.from('favorites').delete().eq('user_id',HOST.user.id).eq('article_link',link); }
    else { HOST.bookmarks.push(link); await HOST.DB.from('favorites').insert({ user_id:HOST.user.id, article_link:link, article_title:title||null }); }
    return !has;
  }

  /* The names index.html still calls: it keeps a hoisted shim for each (#R168). */
  return { renderUI, setupIntelLayers, appendNewsBatch, renderReaderMode, aiGeocodeNews, _spreadDupNewsPins };
};
