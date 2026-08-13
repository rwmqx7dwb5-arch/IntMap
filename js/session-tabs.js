/* ============================================================================
 *  IntMap · the tab bar, the OS registrations behind it, and the session that brings both back  (#R200)
 * ----------------------------------------------------------------------------
 *  The sidebar tabs and everything that persists across a reload: which layers were ticked, which
 *  tab was open, which base map and 3-D state were in use, which sidebars were open and where the
 *  master clock was — plus the IntMapOS commands that name those tabs and the layer registry that
 *  lets Atlas switch a layer by name.
 *
 *  Lifted verbatim out of js/app-body.js (#R200): 163 of its 173 lines are byte-identical,
 *  and the 10 that are not are all the same rule — #R165's: a closure value js/app-body.js
 *  REASSIGNS at runtime is read through IM_HOST's live accessor (currentMode → HOST.mode, currentMapType → HOST.mapType, terrain3D → HOST.terrain3D),
 *  never captured when this factory ran. Everything else arrives through CTX under its ORIGINAL name,
 *  which is what lets the body below stay word-for-word what it was.
 *
 *  It is a REAL ES module: nothing registers it on window.IntMapModules, nothing in src/main.js orders
 *  it, and js/app-body.js reaches it only through a static `import`. tests/r200-checks.test.mjs derives
 *  both halves of the hand-off — what this file returns and reads, what the core takes and passes — from
 *  the two files themselves, so neither list can drift into a silent `undefined`.
 * ==========================================================================*/
export function makeSessionTabs(HOST, CTX) {
  const GE=CTX.GE, isMobile=CTX.isMobile, setMode=CTX.setMode;
  /* ===== (#R122) SESSION STATE PERSISTENCE — a browser reload used to reset everything except the map coordinates
     (those ride the URL hash). Now the ACTIVE LAYERS, the open TAB, the time-machine YEAR, the base map (Map/Satellite)
     and 3-D terrain are saved to localStorage and restored on load. Map lat/lng/zoom/projection stay in the hash. ===== */
  (function(){
    const KEY='intmap_session2'; let _restoring=true, _saveT=null, _tabInit=false;
    function _snapshot(){ try{
      const layers=[]; document.querySelectorAll('#layer-dropdown input[type=checkbox]').forEach(cb=>{ if(cb.checked&&cb.id) layers.push(cb.id); });
      /* ⚠ (#R188) A LAYER THE APP SWITCHED OFF IS NOT A LAYER THE USER SWITCHED OFF. When the
         submarine-cable download failed, js/data-layers.js unticked the box — and this snapshot
         reads ticked boxes, so the next toggle of anything wrote a session with that layer absent.
         _restore() below then treats an absent DEFAULT-ON id as "the user turned it off" and unticks
         it deliberately on every later load: one outage at a volunteer CORS proxy became a permanent
         「片方しかつかない」. `imAutoOff` is set only by the app's own failure path (autoUncheck) and
         cleared the moment a real click touches the box, so the session keeps wanting the layer. */
      (window.IntMapDefaultLayers||[]).forEach(id=>{ const cb=document.getElementById(id);
        if(cb&&!cb.checked&&cb.dataset&&cb.dataset.imAutoOff==='1'&&layers.indexOf(id)<0) layers.push(id); });
      let year=null; try{ const T=window.IntMapTime; if(T&&T.isLive&&!T.isLive()&&T.year) year=T.year(); }catch(_){}
      /* (#R189) `defv` stamps WHICH generation of default-on handling wrote this session. Sessions
         written before #R188's imAutoOff fix (defv absent) may record an outage as an opt-out, and
         no amount of fixing the writer heals what is already in storage — the reader has to.
         ⚠ (#R190) BUMPED TO 190, and the reason is the same one, one layer deeper. Measured on a real
         profile this round: `{"defv":189,"layers":[…,"dl-climate"]}` — stamped as a considered choice,
         with the cables absent, because every session written between #R189 and now was written while
         the cable download could only succeed if a volunteer CORS proxy happened to be up. #R189's
         imAutoOff guard only helps when the app is the one unticking a box it had already ticked; a
         profile whose very first load never got the layer at all had nothing to guard. Now that the
         data comes from our own origin (supabase/functions/cable-geo) the failure that produced those
         sessions cannot recur, so one more generation of them is healed once. */
      /* (#R195) …and which sidebars were open. Read off the DOM rather than off a flag, so a panel
         closed by any route — the button, Esc, the layer-panel setting — is recorded the same way. */
      let sbOpen=null, lsrOpen=null;
      try{ const el=document.getElementById('sidebar'); if(el) sbOpen=!el.classList.contains('collapsed'); }catch(_){}
      try{ const el=document.getElementById('layer-sidebar-r'); if(el) lsrOpen=el.classList.contains('open'); }catch(_){}
      return { v:2, defv:190, layers, tabInit:_tabInit, mode:(typeof HOST.mode!=='undefined'?HOST.mode:null),
        base:(typeof HOST.mapType!=='undefined'?HOST.mapType:'map'), terr3d:!!(typeof HOST.terrain3D!=='undefined'&&HOST.terrain3D),
        sbOpen, lsrOpen,
        year:(year&&year<new Date().getFullYear())?year:null }; }catch(_){ return null; } }
    function _save(){ if(_restoring) return; clearTimeout(_saveT); _saveT=setTimeout(()=>{ try{ const s=_snapshot(); if(s) localStorage.setItem(KEY,JSON.stringify(s)); }catch(_){} },400); }
    window._imSaveSession=_save;
    /* save on the events that change persisted state */
    try{ document.addEventListener('change',e=>{ try{ if(e.target&&e.target.closest&&e.target.closest('#layer-dropdown')){
      /* (#R188) a REAL interaction settles the question the `imAutoOff` mark was holding open — from
         here on the box says what the user wants, either way. Synthetic change events (the default-on
         dispatcher, the session restore) are not trusted and leave the mark alone. */
      if(e.isTrusted&&e.target.dataset) delete e.target.dataset.imAutoOff;
      _save(); } }catch(_){} },true); }catch(_){}
    try{ document.querySelectorAll('.control-panel .mode-btn').forEach(b=>b.addEventListener('click',()=>setTimeout(_save,60))); }catch(_){}
    try{ ['btn-view-map','btn-view-sat','btn-view-3d'].forEach(id=>{ const b=document.getElementById(id); if(b) b.addEventListener('click',()=>setTimeout(_save,120)); }); }catch(_){}
    try{ if(window.IntMapTime&&window.IntMapTime.on) window.IntMapTime.on(()=>_save()); }catch(_){}
    /* (#R170) DESKTOP BOOT → open the Countries tab ("デスクトップ版は通常モードをデフォルトに。（Countries が選択
       された状態で）"). #R11 deliberately left every tab deselected; that stays true for mobile (the tab is a bottom
       sheet, so auto-opening one would cover the map) and for workspace mode (which has its own windows).
       It fires ONCE per browser profile and records `tabInit` in the session snapshot, so:
         · a first-time desktop visitor lands on Countries;
         · so does an existing desktop user whose saved session has no tab — the #R101 workspace default meant
           HOST.mode was never set, and without this they would drop into an empty sidebar after the switch;
         · but a user who then deselects every tab is NOT overridden on the next reload (tabInit is already true).
       `if(!HOST.mode)` additionally means it can never stomp a tab the restore below already opened. */
    function _defaultTab(){ try{
      _tabInit=true; setTimeout(_save,1800);   /* persist the "already offered" flag once _restoring has cleared */
      if(HOST.mode) return;
      if(typeof isMobile==='function' ? isMobile() : window.innerWidth<=768) return;
      if(document.body.classList.contains('ws-mode')) return;
      if(window.IntMapOS) IntMapOS.exec('tab.stats',{source:'default'});
    }catch(_){} }
    function _restore(){ let s=null; try{ s=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(_){} if(!s){ setTimeout(_defaultTab,500); setTimeout(()=>{ _restoring=false; },1600); return; }
      _tabInit=!!s.tabInit;
      if(!s.mode&&!_tabInit) setTimeout(_defaultTab,500);
      /* base map + 3-D first (they swap the style) */
      try{ if(s.base==='sat'&&HOST.mapType!=='sat'){ const b=document.getElementById('btn-view-sat'); if(b) b.click(); } }catch(_){}
      try{ if(s.terr3d){ const b=document.getElementById('btn-view-3d'); if(b&&!(typeof HOST.terrain3D!=='undefined'&&HOST.terrain3D)) setTimeout(()=>b.click(),700); } }catch(_){}
      /* re-enable each saved layer as soon as its checkbox exists (rows build lazily up to ~1 s + beta modules) */
      const want=Array.isArray(s.layers)?s.layers.slice():[]; let tries=0;
      /* ══ (#R224) A RETIRED CHECKBOX ID IS NOT A LAYER THE USER GAVE UP ═══════════════════════════
         「海流レイヤー、二つあるなんていうややこしいことするな。統一しろ。」 The Oceans & maritime row
         (`dl-oceancur`, #R208) is gone and js/ocean-currents.js is the one ocean-current layer. A saved
         session naming the retired box would simply find no element and poll 25 times for nothing — the
         reader would come back and their currents would be off, which is a feature disappearing in a
         round that was about tidying, not removing. So the id is TRANSLATED, once, on the way in.
         ⚠ A MAP, not an `if`: this is where any future retirement is recorded, and keeping it a table
         is what stops the next one being written somewhere else. ⚠ De-duplicated, because a session
         could legitimately hold BOTH ids (someone who had turned on the World-data plate as well). */
      /* (#R232) …and the second entry, for the same reason: 「昼/夜レイヤーは削除」. `dl-night` was the
         flat turf disc; `dl-nightside` is the day/night shading that replaced it. A session that had
         the old row on wants the night side on, which is what it now gets — and since the shading is
         on by default anyway, the translation is usually a no-op rather than a surprise. */
      const RETIRED={ 'dl-oceancur':'wp-dl-currents', 'dl-night':'dl-nightside' };
      for(let i=want.length-1;i>=0;i--){ const to=RETIRED[want[i]];
        if(!to) continue;
        if(want.indexOf(to)<0) want[i]=to; else want.splice(i,1); }
      /* (#R189) ONE-TIME MIGRATION of poisoned sessions. Every session written before #R188 shipped
         (no `defv` stamp) was written by a snapshot that could not tell "the user switched it off"
         from "the download failed and autoUncheck switched it off" — so an absent default-on id in
         such a session is NOT evidence of a choice. Re-add the default-on ids once; the next save
         stamps defv:189 and from then on an absence really is the user's opt-out and is honoured. */
      /* (#R190) …and the same argument, one generation on: see the ⚠ note in _snapshot. Anything
         stamped below 190 was written while the cable layer's success depended on a stranger's
         server, so its absence is not evidence either. */
      if(!(+s.defv>=190)) (window.IntMapDefaultLayers||[]).forEach(id=>{ if(want.indexOf(id)<0) want.push(id); });
      /* (#R186) …and switch a DEFAULT-ON layer back off when this saved session says the user had it
         off. Restore has only ever turned layers ON, which was right while every thematic layer
         started off: absence from the snapshot then meant "nothing to do". Now that Köppen and the
         submarine cables start ON, absence means the user switched one off, and re-checking it on
         every reload would make it impossible to keep off. Only the default-on ids are treated this
         way — for every other layer "absent" still means "was already off". */
      /* (#R225) …and the set is `IntMapDefaultOn` — every id the HTML ships CHECKED, not only the two
         thematic ones. See the note by that list in js/data-layers.js: the base toggles were saved as
         «off» and then restored to their HTML default, so switching one off never survived a reload. */
      const defOff=(window.IntMapDefaultOn||window.IntMapDefaultLayers||[]).filter(id=>want.indexOf(id)<0); let offTries=0;
      (function pollOff(){ offTries++; const left=[];
        defOff.forEach(id=>{ const cb=document.getElementById(id);
          if(cb){ if(cb.checked){ cb.__defFired=true; try{ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} } else cb.__defFired=true; }
          else left.push(id); });
        if(left.length&&offTries<25){ defOff.length=0; defOff.push.apply(defOff,left); setTimeout(pollOff,220); } })();
      (function poll(){ tries++; const pending=[];
        want.forEach(id=>{ const cb=document.getElementById(id); if(cb){ if(!cb.checked){ try{ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} } } else pending.push(id); });
        if(pending.length&&tries<25){ want.length=0; want.push.apply(want,pending); setTimeout(poll,220); } })();
      /* open the saved tab */
      /* (#R231) `monitors:'tab.monitors'` was here. A saved session that last had the Monitors tab open
         would have re-opened a tab that no longer exists in the row — so the mapping is gone with the
         button, and such a session simply restores no tab (the app's own default takes over). */
      try{ if(s.mode){ const map2={news:'tab.news',saved:'tab.news',info:'tab.info',stats:'tab.stats',atlas:'tab.atlas'}[s.mode]; if(map2&&window.IntMapOS) setTimeout(()=>{ try{ if(!HOST.mode) IntMapOS.exec(map2,{source:'restore'}); }catch(_){} },500); } }catch(_){}
      /* set the time-machine year */
      try{ if(s.year&&window.IntMapTime&&window.IntMapTime.setYear){ setTimeout(()=>{ try{ window.IntMapTime.setYear(s.year,{source:'restore'}); }catch(_){} },900); } }catch(_){}
      setTimeout(()=>{ _restoring=false; },1600);   /* stop suppressing saves once the restore settles */ }
    /* run the restore once the map + initial layer UI are ready */
    try{ if(GE().hasRenderer()){ GE().events.on('load',()=>setTimeout(_restore,600)); } else setTimeout(_restore,1400); }catch(_){ setTimeout(()=>{ _restoring=false; },100); }
  })();
  /* sidebar tabs — TRUE kernel commands (setMode is the engine primitive the command calls). */
  IntMapOS.register('tab.news', ()=>setMode('news','btn-news'), {label:'News tab', btn:'btn-news', group:'tab'});
  IntMapOS.register('tab.info', ()=>setMode('info','btn-info'), {label:'Companies tab', btn:'btn-info', group:'tab'});   /* (#R139) Information → Companies (command id kept) */
  IntMapOS.register('tab.stats', ()=>setMode('stats','btn-stats'), {label:'Countries tab', btn:'btn-stats', group:'tab'});
  /* ══ (#R231) `tab.monitors` IS NOT REGISTERED ══════════════════════════════════════════════════
     「MonitorsはNews/Companies/Countries/Atlasの並びから一旦撤去。」 The tab button is gone from
     index.html, and a command that still switched to it would be the worse half of a withdrawal: the
     sidebar would show the Monitors feed with no tab lit and no way back except another command.
     Not registering it means IntMapOS.exec('tab.monitors') is an unknown command — which is the
     honest answer — and js/atlas-console.js no longer offers the planner an action that calls it.
     ⚠ js/monitors.js, its factory and #monitors-feed are untouched: restoring the feature is this
     line, the button in index.html, the restore mapping above, and the Atlas action. */
  /* (#R112) The 4th sidebar slot is Atlas. In normal + mobile mode it is a REAL tab (setMode → renders into
     #atlas-feed like News/Info/Countries); in workspace mode Atlas keeps its own floating window. */
  /* (#R224) the kernel is on demand — open() has to be reached through window.IntMapAtlas, or a
     workspace-mode «Atlas» would silently do nothing on a session that had not opened it yet. */
  const _atlasTab=()=>{ try{ if(document.body.classList.contains('ws-mode')){ if(window.IntMapAtlas) window.IntMapAtlas.call('open'); else if(window.IntMapConsole&&IntMapConsole.open) IntMapConsole.open(); } else setMode('atlas','btn-community'); }catch(_){} };
  IntMapOS.register('tab.atlas', _atlasTab, {label:'Atlas tab', btn:'btn-community', group:'tab'});
  IntMapOS.register('tab.community', _atlasTab, {label:'Atlas tab', btn:'btn-community', group:'tab'});   /* legacy alias */
  document.getElementById('btn-news').onclick=()=>IntMapOS.exec('tab.news',{source:'ui'});
  /* Saved is now a sub-filter inside the News tab (keeps btn-news active) */
  document.getElementById('newsfilter-all').onclick=()=>{ if(HOST.mode!=='news') setMode('news','btn-news'); };
  document.getElementById('newsfilter-saved').onclick=()=>{ if(HOST.mode!=='saved') setMode('saved','btn-news'); };
  document.getElementById('btn-info').onclick=()=>IntMapOS.exec('tab.info',{source:'ui'});
  document.getElementById('btn-stats').onclick=()=>IntMapOS.exec('tab.stats',{source:'ui'});
  /* (#R98) Community feature removed — this sidebar button is the Atlas tab. (#R112) It now behaves like the other
     tabs (News/Info/Countries): a true kernel tab command that renders Atlas INSIDE the sidebar/bottom-sheet. */
  document.getElementById('btn-community').onclick=()=>IntMapOS.exec('tab.atlas',{source:'ui'});
  /* (#R122) auto-fit the News/Information/Countries/Atlas tab labels: the largest font (≤14px) that keeps every
     label on ONE line inside its equal-width button, in every language — so the text is as large as possible
     yet never wraps or overflows ("ボタンサイズに応じてテキストサイズも変更…はみ出さない…改行されない"). */
  function _fitTabFont(){ try{ const btns=[...document.querySelectorAll('.control-panel .mode-btn')]; if(!btns.length||!btns[0].clientWidth) return;
    let fs=14; btns.forEach(b=>b.style.fontSize=fs+'px');
    const fits=()=>btns.every(b=>b.scrollWidth<=b.clientWidth+0.5);
    let guard=0; while(fs>10 && !fits() && guard++<20){ fs-=0.5; btns.forEach(b=>b.style.fontSize=fs+'px'); } }catch(_){} }
  window._fitTabFont=_fitTabFont;
  /* (#R124) the tab labels visibly resized on load ("読み込み時に毎回うにょうにょ変わる") because the fit ran THREE
     times (0 / 300 / 1200 ms) and each staggered run recomputed a different size as fonts + layout settled. Run it
     ONCE, when the measurement is actually stable (fonts loaded), and otherwise only re-fit when something genuinely
     moves — a window resize or a language change. */
  try{ const _fitStable=()=>{ const btns=document.querySelectorAll('.control-panel .mode-btn'); if(!btns.length||!btns[0].clientWidth){ requestAnimationFrame(_fitStable); return; } _fitTabFont(); };
    if(document.fonts&&document.fonts.ready&&document.fonts.ready.then){ document.fonts.ready.then(()=>requestAnimationFrame(_fitStable)); }   /* definitive: fonts loaded → measurement is final → fit ONCE */
    else { requestAnimationFrame(()=>requestAnimationFrame(_fitStable)); }   /* no fonts API → single deferred fit */
    window.addEventListener('resize',()=>{ clearTimeout(_fitTabFont._t); _fitTabFont._t=setTimeout(_fitTabFont,120); });
    window.addEventListener('intmap-lang',()=>setTimeout(_fitTabFont,30)); }catch(_){}
  /* (#R94) TIME is a first-class kernel dimension — the master spacetime clock is registered as OS commands
     so both shells (UI + Atlas) operate it through the one kernel, and it appears in the OS catalog/log. */
  try{
    IntMapOS.register('time.now', ()=>{ window.IntMapTime.setNow({source:'os'}); }, {label:'Time · now (live)', group:'time'});
    IntMapOS.register('time.year', (ctx)=>{ const y=+((ctx&&ctx.params&&ctx.params.year)); if(y>=window.IntMapTime.min) window.IntMapTime.setYear(y,{source:'os'}); }, {label:'Time · set year', group:'time'});
    IntMapOS.register('time.set', (ctx)=>{ const p=(ctx&&ctx.params)||{}; if(p.year!=null) window.IntMapTime.setYear(+p.year,{source:'os'}); else if(p.date!=null) window.IntMapTime.set(new Date(p.date),{source:'os'}); else if(p.daysAgo!=null) window.IntMapTime.setDaysAgo(+p.daysAgo,{source:'os'}); else window.IntMapTime.setNow({source:'os'}); }, {label:'Time · set instant', group:'time'});
  }catch(_){}
  /* (#R119) KERNEL COMMAND EXPANSION — every major subsystem gets a first-class OS command (UI, Atlas and any
     future shell submit the SAME intents; the registrations are thin wrappers over each module's own API, so the
     logic still lives in exactly one place). Commands taking params read ctx.params. Registered lazily (modules
     defined later in the file) — each run() resolves its module at call time. */
  (function(){ const REGL=[
    ['layer.on',   (p)=>{ const cb=document.getElementById(String(p.id||'')); if(!cb||cb.type!=='checkbox') return {ok:false,err:'no layer '+(p.id||'')}; if(!cb.checked){ cb.checked=true; cb.dispatchEvent(new Event('change',{bubbles:true})); } return {ok:true}; }, 'Layer · on (params.id = checkbox id)','layer'],
    ['layer.off',  (p)=>{ const cb=document.getElementById(String(p.id||'')); if(!cb||cb.type!=='checkbox') return {ok:false,err:'no layer '+(p.id||'')}; if(cb.checked){ cb.checked=false; cb.dispatchEvent(new Event('change',{bubbles:true})); } return {ok:true}; }, 'Layer · off (params.id)','layer'],
    ['atlas.open', ()=>{ if(window.IntMapAtlas) window.IntMapAtlas.call('open'); else window.IntMapConsole&&window.IntMapConsole.open(); }, 'Atlas · open','atlas'],
    /* ⚠ (#R224) CLOSE DOES NOT FETCH. Downloading the kernel in order to close a panel that was never
       opened is the same defect as loading it eagerly, so this one keeps the plain guard. */
    ['atlas.close',()=>{ window.IntMapConsole&&window.IntMapConsole.close(); }, 'Atlas · close','atlas'],
    ['compare.open',(p)=>{ if(!window.IntMapStatsCompare) return {ok:false,err:'no module'}; window.IntMapStatsCompare.open(p&&p.countries,p&&p.indicators,p&&p.source); return {ok:true}; }, 'Country comparison · open (params.countries/indicators)','compare'],
    ['compare.clear',()=>{ window.IntMapStatsCompare&&window.IntMapStatsCompare.clearMap&&window.IntMapStatsCompare.clearMap(); }, 'Country comparison · clear map paint','compare'],
    ['flightsim.setup',(p)=>{ window.IntMapLazy.need('flightSim').then(()=>{ window.IntMapFlightSim&&window.IntMapFlightSim.setup(p||{}); }); }, 'Flight simulator · pre-flight screen','sim'],
    ['flightsim.stop', ()=>{ window.IntMapFlightSim&&window.IntMapFlightSim.stop(); }, 'Flight simulator · stop','sim'],
    ['workspace.enter',()=>{ window.IntMapWorkspace&&window.IntMapWorkspace.open&&window.IntMapWorkspace.open(); }, 'Workspace mode · enter','ws'],
    ['workspace.exit', ()=>{ window.IntMapWorkspace&&window.IntMapWorkspace.close&&window.IntMapWorkspace.close(); }, 'Workspace mode · exit','ws'],
    ['objects.open', ()=>{ window.IntMapObjects&&window.IntMapObjects.open(); }, 'Map objects · open list','objects'],
    ['objects.remove',(p)=>{ const ok=!!(window.IntMapObjects&&window.IntMapObjects.remove&&window.IntMapObjects.remove(p&&p.id)); return {ok}; }, 'Map objects · remove (params.id)','objects'],
    ['ticker.on',  ()=>{ window.imTicker='on'; window.IntMapTicker&&window.IntMapTicker.apply(); }, 'Bottom ticker · on','ui'],
    ['ticker.off', ()=>{ window.imTicker='off'; window.IntMapTicker&&window.IntMapTicker.apply(); }, 'Bottom ticker · off','ui'],
    ['settings.open',()=>{ const b=document.getElementById('btn-open-settings')||document.querySelector('[id*=open-settings]'); if(b) b.click(); }, 'Settings · open','ui'],
    ['isolate.exit',()=>{ window.IntMapIsolate&&window.IntMapIsolate.exit&&window.IntMapIsolate.exit(); }, 'Isolate · exit','map'],
    ['layers.data', async(p)=>{ if(!window.IntMapLayers) return {ok:false,err:'no module'}; const c=GE().camera.getCenter&&GE().camera.getCenter(); const v=await window.IntMapLayers.sampleAt((p&&p.lng!=null)?+p.lng:(c?c.lng:0),(p&&p.lat!=null)?+p.lat:(c?c.lat:0),p&&p.layers); return {ok:true,values:v}; }, 'Layer data · sample active layers at a point','layer']
  ];
  REGL.forEach(r=>{ try{ IntMapOS.register(r[0], (ctx)=>r[1]((ctx&&ctx.params)||{}), {label:r[2], group:r[3]}); }catch(_){} }); })();
}
