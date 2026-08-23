/* ============================================================================
 *  IntMap · Road / foot / bike / transit routing — IntMapRouting  (#R163)
 * ----------------------------------------------------------------------------
 *  Real turn-by-turn directions from public OSRM + Valhalla + Transitous/MOTIS, drawn on the map
 *  with per-mode leg styling, alternatives, lane/heading guidance and GPX/GeoJSON export.
 *
 *  Moved verbatim out of index.html's DOMContentLoaded closure (#R163). The values it used
 *  to inherit from that closure are now passed in explicitly — see Architecture.md §3.1.
 *   Reassigned at runtime, so read LIVE through HOST (never captured):
 *      currentLang -> HOST.lang
 *  Never rebound, so bound once under the original name:
 *      bringToFront, makeDraggable
 * 
 *  The CSS stays in css/intmap.css; this file adds no <style>.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.routing=function(HOST){
 const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const bringToFront=HOST.bringToFront, makeDraggable=HOST.makeDraggable;
  return (function(){
    /* ══ ⚠⚠⚠ (#R299) 「経路機能を使っても、経路が地図にマッピングされない！」 — THIS LINE WAS THE FIRST
       CANDIDATE, AND IT WAS A TYPO. It read `if(!GE().hasRenderer()||!GE().hasRenderer())` — the same
       test written twice, where the second half was meant to be something else — and what it RETURNED
       was a module with two methods. `ensureLayers` / `frame` / `setInsets` / `clearAreas` /
       `openPanel` / `selectAlt` / `hasRoute` / `summary` were all `undefined` on that object, and
       every call to them in js/routing-ui.js is inside `try{}catch(_){}`, so a panel built against
       the stub SAID NOTHING AND DREW NOTHING. js/app-body.js constructs this module ONCE, while the
       app is loading; if the renderer was not up at that instant the stub was what the whole session
       got, and no message anywhere said so.
       ⚠ THE GUARD IS GONE RATHER THAN CORRECTED, because the reduced surface is the defect and a
       correct condition still produces one. `GE()` is a LIVE getter (above), every method that
       touches the renderer already asks `_imCanDraw()` / `ensureLayers()` at CALL time, and `_paint`
       stashes what it could not draw for the `styledata` repaint. A module built before the renderer
       exists is therefore the same module, and it starts working the moment the renderer does.
       ⚠ THE ONE THING THAT WAS NOT CALL-TIME is the `styledata` subscription — see `_watchStyle`. */
    const SRC='imroute-src';
    /* (#R85) per-mode leg styling ("どこで徒歩、どこで鉄道なのか地図上で一切わからない") — walking legs draw as a
       DOTTED line in grey, transit legs as a SOLID line coloured by vehicle mode (rail blue, subway orange, tram
       green, bus purple, ferry teal), with a white casing under everything and a ring marker at every stop. */
    function _modeColor(m){ m=String(m||'').toUpperCase();
      if(/SUBWAY|METRO/.test(m)) return '#ff6d00';
      if(/TRAM|STREETCAR|LIGHT_RAIL/.test(m)) return '#00a152';
      if(/BUS|COACH/.test(m)) return '#7b1fa2';
      if(/FERRY|BOAT|SHIP/.test(m)) return '#0097a7';
      if(/WALK|FOOT/.test(m)) return '#7a7f87';
      if(/BIKE|CYCL/.test(m)) return '#00897b';
      if(/HIGHSPEED|LONG_DISTANCE|NIGHT|REGIONAL|SUBURBAN|RAIL|TRAIN/.test(m)) return '#1558d6';
      if(/CAR|DRIV/.test(m)) return '#1a73e8';
      return '#d81b60'; }
    function _modeIcon(m){ m=String(m||'').toUpperCase();
      if(/SUBWAY|METRO/.test(m)) return '🚇'; if(/TRAM|STREETCAR|LIGHT_RAIL/.test(m)) return '🚊';
      if(/BUS|COACH/.test(m)) return '🚌'; if(/FERRY|BOAT/.test(m)) return '⛴';
      if(/WALK|FOOT/.test(m)) return '🚶'; if(/BIKE|CYCL/.test(m)) return '🚲';
      if(/HIGHSPEED|LONG_DISTANCE/.test(m)) return '🚄'; if(/RAIL|TRAIN|REGIONAL|SUBURBAN|NIGHT/.test(m)) return '🚆';
      if(/CAR|DRIV/.test(m)) return '🚗'; return '🚈'; }
    /* (#R105) ROOT CAUSE of "鉄道経路が実際の路線を無視した直線になる": the old decoder used 32-bit bitwise ops
       (`<<shift`, `>>1`, `&1`), which OVERFLOW for precision-7 polylines wherever the coordinate exceeds ~2^31 — i.e.
       any longitude > ~107° (all of East Asia, incl. Tokyo 139°). The longitude decoded to garbage (−74.98 for
       Tokyo's 139.77), the R103 >3° guard then DISCARDED the geometry, and the straight from→to fallback drew the
       "直線". Decode with plain arithmetic (Math.pow / %2 / /2) so values up to 2^53 stay exact. Verified: the Tokyo→
       Yokohama rail leg now decodes to 139 points that follow the real JR track. */
    function _decodePoly(str,precision){ let index=0,lat=0,lng=0,coords=[],factor=Math.pow(10,precision||5);
      const rd=()=>{ let shift=0,result=0,b; do{ b=str.charCodeAt(index++)-63; result+=(b&0x1f)*Math.pow(2,shift); shift+=5; }while(b>=0x20);
        return (result%2===1)?(-(result+1)/2):(result/2); };
      while(index<str.length){ lat+=rd(); lng+=rd(); coords.push([lng/factor,lat/factor]); } return coords; }
    /* ⚠⚠ (#R299) THE LAYERS ARE WHAT «ALREADY DRAWN» MEANS — NOT THE SOURCE. The early return was
       `if(GE().layers.hasSource(SRC)) return true;`, so a style in which the source had survived and
       the LAYERS had not could never be repaired: `_paint` wrote features into a source that nothing
       drew, reported success, and the journey was 「地図にマッピングされない」 with no error anywhere.
       The engine's `addSource` and `addLayer` are both no-ops when the id already exists
       (js/geo-engine.js), so simply re-running the block below is how a partial style is completed. */
    const LAYERS=['imroute-cas','imroute-walk','imroute-rail','imroute-line','imroute-transfer','imroute-pt','imroute-wp','imroute-durlab','imroute-hit'];
    function _layersOK(){ try{ if(!GE().layers.hasSource(SRC)) return false;
      for(let i=0;i<LAYERS.length;i++) if(!GE().layers.has(LAYERS[i])) return false; return true; }catch(_){ return false; } }
    function ensureLayers(){ _watchStyle(); try{ if(_layersOK()) return true; if(!_imCanDraw()) return false;
      GE().layers.addSource(SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      /* ⚠ (#R291) THE CASING IS OPAQUE NOW. At 0.6 alpha the white under-line took the colour of
         whatever it sat on, so on satellite imagery and on the dark basemap the route read as a
         muddy line rather than a route with an outline — 「ライト・ダーク・衛星の全てで読める」.
         Full opacity plus a wider halo is what makes the same line legible on all three. */
      GE().layers.add({id:'imroute-cas',type:'line',source:SRC,filter:['==',['geometry-type'],'LineString'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffffff','line-width':['+',['coalesce',['get','w'],5],5],'line-opacity':['coalesce',['get','cop'],0.95]}});
      GE().layers.add({id:'imroute-walk',type:'line',source:SRC,filter:['all',['==',['geometry-type'],'LineString'],['==',['get','walk'],1]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','col'],'#7a7f87'],'line-width':['coalesce',['get','w'],4],'line-dasharray':[0,2],'line-opacity':['coalesce',['get','op'],0.95]}});
      GE().layers.add({id:'imroute-rail',type:'line',source:SRC,filter:['all',['==',['geometry-type'],'LineString'],['!=',['get','walk'],1]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','col'],'#1a73e8'],'line-width':['coalesce',['get','w'],5],'line-opacity':['coalesce',['get','op'],1]}});
      GE().layers.add({id:'imroute-line',type:'line',source:SRC,filter:['all',['==',['geometry-type'],'LineString'],['==',['get','walk'],9]],layout:{},paint:{'line-color':'#1a73e8','line-width':4.5}});   /* legacy no-op filter kept for _OVL id */
      GE().layers.add({id:'imroute-transfer',type:'circle',source:SRC,filter:['all',['==',['geometry-type'],'Point'],['==',['get','k'],'stop']],paint:{'circle-radius':4.6,'circle-color':'#fff','circle-stroke-color':['coalesce',['get','col'],'#1a73e8'],'circle-stroke-width':2.6}});
      GE().layers.add({id:'imroute-pt',type:'circle',source:SRC,filter:['all',['==',['geometry-type'],'Point'],['!=',['get','k'],'stop']],paint:{'circle-radius':10,'circle-color':['coalesce',['get','color'],'#1a73e8'],'circle-stroke-color':'#fff','circle-stroke-width':2.5}});
      /* ⚠⚠ (#R291) THE ENDS ARE LABELLED, NOT JUST COLOURED. 「現在の緑丸・赤丸だけの表示へ依存しない
         でください。色覚差があっても区別できるよう、文字・形・ラベルを併用してください。」 A → 1 → 2 → B
         is the SAME text the panel puts beside each field, so the marker and the row cannot get out
         of step when a stop is dragged into a new position. */
      GE().layers.add({id:'imroute-wp',type:'symbol',source:SRC,filter:['all',['==',['geometry-type'],'Point'],['has','wp']],
        layout:{'text-field':['get','wp'],'text-font':['literal',['Noto Sans Regular']],'text-size':12,'text-allow-overlap':true,'text-ignore-placement':true},
        paint:{'text-color':'#ffffff','text-halo-color':'rgba(0,0,0,0.35)','text-halo-width':0.6}});
      /* (#R291) 「経路線付近に、可能なら所要時間ラベル」 — one per alternative, at its own midpoint,
         WITHOUT allow-overlap so it yields to place names instead of burying them. */
      GE().layers.add({id:'imroute-durlab',type:'symbol',source:SRC,filter:['all',['==',['geometry-type'],'Point'],['has','dur']],
        layout:{'text-field':['get','dur'],'text-font':['literal',['Noto Sans Regular']],'text-size':11.5,'text-padding':6,'text-offset':[0,-0.2]},
        paint:{'text-color':['coalesce',['get','col'],'#1a73e8'],'text-halo-color':'#ffffff','text-halo-width':1.8}});
      /* (#R291) 「経路線をクリックまたはタップしやすい透明ヒット領域を別途持たせる」 — an invisible line
         under everything. A 4 px route line is not a touch target; this is.
         ⚠⚠ (#R298) AND 22 px IS NOT A FINGER (WCAG 2.2 asks for 44). It was a constant, so widening
         it everywhere would have made the alternatives — which at world zoom lie within a few pixels
         of each other — impossible to tell apart by tapping. The width is what MAY be widened, and
         zoom is what says when: zoomed in the alternatives are far apart on screen and a finger-sized
         target cannot pick the wrong one, zoomed out they are not and it keeps the old 22. */
      GE().layers.add({id:'imroute-hit',type:'line',source:SRC,filter:['all',['==',['geometry-type'],'LineString'],['has','alt']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#000000','line-opacity':0.01,'line-width':['interpolate',['linear'],['zoom'],10,22,14,44]}});
      _wireLineEvents();
      return _layersOK(); }catch(_){ return false; } }
    /* ⚠ (#R299) BOUND ONCE PER MAP, NOT ONCE PER STYLE. These three used to sit inside the block
       above, which re-runs whenever the style is replaced — and a layer listener is held by the MAP
       rather than by the style (js/geo-engine.js `onLayer`), so every basemap switch added another
       copy and one tap on a route ran `selectAlt` as many times as the reader had changed basemaps.
       The canvas element is the map's identity: a re-created renderer brings a new one and is wired
       again, which is the same shape the engine's own hover hub uses (it keys on the map instance). */
    let _evtKey=null;
    function _wireLineEvents(){ try{ const k=GE().render.canvas(); if(!k||_evtKey===k) return; _evtKey=k;
      try{ GE().events.onLayer('click','imroute-hit',_onLineClick); }catch(_){}
      try{ GE().events.onLayer('mouseenter','imroute-hit',()=>{ try{ GE().render.canvas().style.cursor='pointer'; }catch(_){} }); }catch(_){}
      try{ GE().events.onLayer('mouseleave','imroute-hit',()=>{ try{ if(!_pickTarget) GE().render.canvas().style.cursor=''; }catch(_){} }); }catch(_){}
    }catch(_){} }
    /* ⚠ (#R291) THE MAP IS A SELECTOR, NOT A PICTURE (§10). Tapping an alternative on the map picks
       it, and because selection lives in the store the panel's card and Atlas's card follow — this
       is the half that could not exist while the two surfaces each kept their own «selected». */
    /* ⚠⚠⚠ (#R299) …AND A SELECTOR NOBODY CAN SEE IS NOT ONE. 「地図上で経路を押したら、自動的にパネル
       側でもその経路が選択されるように。」 The chain #R291 built ends in the store and #R298 added
       `revealSelected()` at the panel end — but BOTH halves begin with `if (!openState) return;`, so
       with the panel shut a tap re-drew the map and nothing else happened. The panel is opened here.
       ⚠ THE SET COMES OFF THE FEATURE, not off `_rsActive`. Only the active set is drawn today, so
       the two always agreed; reading the tapped line's own `rs` makes that a property of the data
       instead of a coincidence, and a tap can never select alternative 2 of one journey inside
       another. `selectAlt` only writes the store when the store is showing that same set.
       ⚠ THE CAMERA DOES NOT MOVE. `open({reveal:true, keepView:true})` skips the re-frame — 「レイヤー
       を選択しても視点を一切動かさない」 (CONSTITUTION §3); `revealSelected()` scrolls the panel only. */
    function _onLineClick(e){ try{
      const f=(e&&e.features&&e.features[0])||null; if(!f||!f.properties) return;
      const i=+f.properties.alt; if(!isFinite(i)) return;
      const sid=String(f.properties.rs||'')||_rsActive;
      selectAlt(i,sid);
      _revealPanel();
    }catch(_){} }
    /* the panel, opened where it is and with what it was showing — never a second one (`open()` is
       idempotent) and never a camera move. The UI is a lazy module, so it may still have to arrive. */
    function _revealPanel(){ try{
      const UI=window.IntMapRouteUI;
      /* ⚠⚠⚠ (#R299 追記) 「OPEN」 AND 「VISIBLE」 ARE NOT THE SAME STATE. A minimised panel is open —
         `openState` is true — so this returned early and the tap selected a route inside a strip of
         header the reader could not read. MEASURED on production R299: the store went `sel 0 → 1`
         and `.rtp-min` stayed on, height 46 px. `open()` is idempotent and its `reveal` flag is what
         takes `rtp-min` off (js/routing-ui.js), so the answer is to CALL it rather than to guess
         from `isOpen()` that there is nothing left to do. */
      if(UI&&typeof UI.open==='function'){ UI.open({reveal:true,keepView:true}); return; }
      window.IntMapLazy.need('routeUi').then(()=>{ try{ window.IntMapRouteUI.open({reveal:true,keepView:true}); }catch(_){} },()=>{});
    }catch(_){} }
    /* ⚠⚠ (#R298) THIS IS THE ONE PLACE A ROUTE IS THROWN AWAY, AND CLOSING THE PANEL CALLS IT.
       The note that stood here said the opposite — 「Closing the panel does not call it」 — which was
       true of #R291 and stopped being true in #R296, when 「経路機能を閉じても地図に経路が残り続ける
       のをやめろ」 inverted the rule. js/routing-ui.js `close()` has called `RT().clear()` ever since,
       so the same fact was written down twice in two files with opposite signs, and this was the copy
       a reader of js/routing.js would have believed. The callers are: 「経路を消去」, Atlas's
       「経路を消して」, and the panel's ×.
       ⚠ (#R299 追記) …AND THE TOOLS ROW, which the line above used to exempt («the Tools row still
       only closes the panel»). MEASURED on production R299: a second press on Layers ▸ Tools ▸
       Directions left `hasRoute()` false and every `imroute-*` layer at 0 features. It goes
       `_toolOff` → `IntMapRouteUI.close()` → here, like every other way of closing, and it has done
       since #R296 inverted the rule. The exemption was a leftover of #R291 in a third file.
       ⚠ EVERY SOURCE THIS SUBSYSTEM DRAWS INTO IS EMPTIED, not merely hidden — see js/routing-ops.js.
       The four are `imroute-src` (here), `imroute-diff-src` and `imroute-hist-src` (the two calls
       below) and `imroute-area-src` (`clearAreas`, which the panel calls beside this one). */
    /* ⚠⚠⚠ (#R298) …AND THE IN-MEMORY SET GOES WITH IT, OR TWO THINGS ANSWER 「is there a route」.
       MEASURED on production, in the same frame right after the panel was closed:
         IntMapRouteStore.hasRoute()      false
         IntMapRouteUI.state().hasRoute   TRUE
       because this module's `hasRoute()` reads `_rsets`/`_rsActive` — which `clear()` did not touch —
       while the store had been emptied one line below. The footer's 「経路を消去」, the analysis tab's
       gate and both exporters read the stale one. Same shape as #R293 ⑮ and #R270: one fact, two
       owners, and they disagree the moment one of them is updated.
       ⚠ ONLY THE ACTIVE SET IS DETACHED. `_rsets` also holds the sets of Atlas replies still in the
       transcript, which `altsOf(setId)` and `IntMapRouteCards.refreshDetail` address by id — wiping
       the map would make a reply from ten turns ago stop responding to its own cards. */
    function clear(){ _lastPaint=null; _painted=false; _abortInflight();   /* (#R299) …and «is it on the map» goes with it */
      try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:[]}); }catch(_){}
      _rsActive='';
      try{ window.IntMapRouteStore.clearRoute(); }catch(_){}
      try{ window.IntMapRoutingOps&&window.IntMapRoutingOps.clearDifferences(); }catch(_){}
      try{ window.IntMapRoutingOps&&window.IntMapRoutingOps.clearHistorical(); }catch(_){} }
    const PROFILES={ driving:['router.project-osrm.org','driving'], car:['router.project-osrm.org','driving'], drive:['router.project-osrm.org','driving'],
      walking:['routing.openstreetmap.de/routed-foot','foot'], walk:['routing.openstreetmap.de/routed-foot','foot'], foot:['routing.openstreetmap.de/routed-foot','foot'],
      cycling:['routing.openstreetmap.de/routed-bike','bike'], cycle:['routing.openstreetmap.de/routed-bike','bike'], bike:['routing.openstreetmap.de/routed-bike','bike'] };
    const _isTransit=m=>/transit|train|rail|public|metro|subway|tram|bus|ferry|電車|鉄道|地下鉄|バス|公共|列車/i.test(String(m||''));
    /* (#R85) REAL public-transit routing via Transitous / MOTIS (free, GTFS worldwide): typed legs (WALK / RAIL /
       SUBWAY / BUS / FERRY …) each with real geometry — so "電車" actually rides the rails, and the map shows
       exactly where you walk vs ride. No silent fallback to roads: if there is no transit here we say so. */
    function _hav(a,b){ const R=6371,dLat=(b[1]-a[1])*Math.PI/180,dLng=(b[0]-a[0])*Math.PI/180,la1=a[1]*Math.PI/180,la2=b[1]*Math.PI/180; const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.min(1,Math.sqrt(h))); }
    /* ===== (#R126) request lifecycle — 経路10-10 §3.4/§17.1/§24.12: every route computation gets a requestId; a NEW
       request aborts all in-flight fetches of the previous one, and a completed request whose id is no longer current
       returns status 'cancelled' WITHOUT drawing — a stale response can never overwrite a newer route on screen. */
    let _reqSeq=0, _acPool=[];
    function _mkAC(ms){ const ac=new AbortController(); ac._t=setTimeout(()=>{ try{ac.abort();}catch(_){}} ,ms||30000); _acPool.push(ac); return ac; }
    function _rmAC(ac){ try{ clearTimeout(ac._t); }catch(_){} const i=_acPool.indexOf(ac); if(i>=0) _acPool.splice(i,1); }
    function _abortInflight(){ _acPool.forEach(a=>{ try{ clearTimeout(a._t); a.abort(); }catch(_){} }); _acPool=[]; }
    /* (#R86) transit alternatives — ALL alternatives are drawn at once (like the Google/Apple-Maps screenshot): the
       selected one bright & on top, the others dimmed & thin in their own DISTINCT palette colour; tapping one in the
       reply selects it. (#R86d) The SELECTED route is coloured PER LEG BY MODE on the map (walk grey-dotted, subway
       orange, rail blue, bus purple, tram green, ferry teal) — matching the itinerary detail list — so you can see at
       a glance where you walk vs ride and on what. Unselected alternatives keep their single palette colour. */
    const ALT_PAL=['#1a73e8','#e8710a','#12a150','#a142f4','#e52592'];
    /* ===== (#R126) RouteStore — 経路10-10指示書 §4.2/§24.3: alternatives + selection live in a store keyed by
       routeSetId (one per computed route set), NOT in shared module globals, so a tap on an OLD Atlas message's
       alternative selects within THAT message's route set instead of whatever was computed last. */
    let _rsSeq=0; const _rsets=new Map(); let _rsActive=null;
    /* (#R291) the ENDS of a route set are every waypoint in order, not just the two ends — the map
       has to letter A / 1 / 2 / B, and it can only do that if it is told about the stops. */
    function _ends(from,to,via){ return [[+from.lng,+from.lat]]
      .concat((Array.isArray(via)?via:[]).filter(v=>v&&isFinite(+v.lng)).map(v=>[+v.lng,+v.lat]))
      .concat([[+to.lng,+to.lat]]); }
    /* (#R291) 「主な道路名または主要通過地」 — what makes one alternative different from another, taken
       from the steps it is actually made of: the road names carrying the most distance, biggest
       first. Nothing is invented; a route whose steps carry no names simply returns none. */
    function _majorRoads(steps,n){ const by=new Map();
      (steps||[]).forEach(st=>{ const nm=String((st.ref||'').split(/[;,]/)[0]||st.name||'').trim();
        if(!nm) return; by.set(nm,(by.get(nm)||0)+(st.distance||0)); });
      return Array.from(by.entries()).sort((a,b)=>b[1]-a[1]).slice(0,n||3).map(e=>e[0]); }
    function _rsNew(alts,ends){ const id='rs'+(++_rsSeq); _rsets.set(id,{alts,ends,sel:0});
      if(_rsets.size>12){ const k=_rsets.keys().next().value; if(k!==id) _rsets.delete(k); } _rsActive=id; return id; }
    /* (#R126) §2.1/§24.2: CALC and DRAW are separate — _paint stashes the last feature set and repaints it once the
       style is ready (styledata below), so a route computed while the style is loading still SUCCEEDS. */
    let _lastPaint=null;
    /* (#R299) `_painted` — did the last `_paint` reach the source; `_noFit` — a repaint that must not
       touch the camera (see `repaint`). Both are about the MAP's state, never about the journey. */
    let _painted=false, _noFit=false;
    function _bounds(coords){ if(!coords||!coords.length) return null;
      /* §3.19/§14.6 dateline-safe: unwrap longitudes onto a continuous axis before min/max */
      let lo=1e9,hi=-1e9; coords.forEach(p=>{ if(p[0]<lo)lo=p[0]; if(p[0]>hi)hi=p[0]; });
      const wrap=(hi-lo>180); let a=1e9,b=1e9,c=-1e9,d=-1e9;
      coords.forEach(p=>{ const x=(wrap&&p[0]<0)?p[0]+360:p[0]; if(x<a)a=x; if(x>c)c=x; if(p[1]<b)b=p[1]; if(p[1]>d)d=p[1]; });
      return (isFinite(a)&&c>=a)?[[a,b],[c,d]]:null; }
    /* ══ ⚠ (#R291) THE CAMERA HAS TO KNOW WHERE THE PANEL IS ════════════════════════════════
       `padding:70` framed the route inside the whole viewport, so on the desktop the left third of
       the fit sat UNDER the directions panel and on a phone the bottom half sat under the sheet —
       「パネル表示中の fitBounds はパネル実寸を考慮する。固定値の padding:70 等だけで処理しない。」
       The panel MEASURES itself and writes its real rectangle here; with no panel open the insets
       are zero and the behaviour is exactly what it was. */
    let _insets={top:0,right:0,bottom:0,left:0};
    function setInsets(o){ o=o||{}; _insets={top:+o.top||0,right:+o.right||0,bottom:+o.bottom||0,left:+o.left||0}; }
    function _pad(base){ base=base||24;
      /* never let the insets eat the whole viewport — a padding pair wider than the canvas makes
         MapLibre throw and the fit silently not happen */
      let w=0,h=0; try{ const c=GE().render.canvas(); w=c.clientWidth||c.width||0; h=c.clientHeight||c.height||0; }catch(_){}
      const cap=(v,span)=>span?Math.max(base,Math.min(v+base,Math.round(span*0.42))):(v+base);
      return { top:cap(_insets.top,h), bottom:cap(_insets.bottom,h), left:cap(_insets.left,w), right:cap(_insets.right,w) }; }
    /* ⚠ (#R291) 「ユーザーが手動で地図を動かした直後に、勝手に全体表示へ戻さない」 — a repaint caused by
       a style swap, a step highlight or an alternative being selected must not re-frame the route
       under the reader's hands. Only a NEW route set fits, and only once. */
    function _paint(feats,fitCoords,maxZoom){ _lastPaint={feats:feats,fit:fitCoords||null,mz:maxZoom||14};
      if(!ensureLayers()) return false;   /* stashed — styledata repaints (and fits, once) when the style is ready */
      /* ⚠ (#R299) 「渡した」 IS NOT 「乗っている」. `setSourceData` is inside a catch, so a failure here
         was indistinguishable from a success to every caller — and js/routing-ui.js re-opens the
         panel on the strength of it. The flag is set only when the call RETURNED, and `painted()`
         re-checks the layers, because the other way a drawn route disappears is a style swap. */
      _painted=false;
      try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:feats}); _painted=!!(feats&&feats.length); }catch(_){}
      if(fitCoords&&!_noFit){ try{ const bb=_bounds(fitCoords); if(bb) GE().camera.fitBounds(bb,{padding:_pad(28),maxZoom:maxZoom||14,duration:900}); }catch(_){} }
      _lastPaint.fit=null;   /* fit only once — a later style-swap repaint must not re-fly the camera */
      return true; }
    /** is the CURRENT route actually on the map right now — the source has it AND the layers draw it */
    function painted(){ try{ return !!(_painted&&_rsActive&&_rsets.get(_rsActive)&&_layersOK()); }catch(_){ return false; } }
    /** ⚠ (#R299) draw the active set again WITHOUT re-computing and WITHOUT moving the camera.
        `_drawAlts` re-frames only through `_paint`'s `fitCoords`, and it passes them — so the
        re-frame is suppressed here and the reader's view is left where they put it. */
    function repaint(){ try{ const rs=_rsets.get(_rsActive); if(!rs||!rs.alts.length) return false;
      const keep=_noFit; _noFit=true; try{ _drawAlts(rs.sel,_rsActive); } finally { _noFit=keep; }
      return painted(); }catch(_){ return false; } }
    /** ⚠ (#R299) is the drawn route VISIBLE — a layer that exists but is switched off is not on the
        map, and the surfaces that light a dot for 「there is a route」 have no other way to ask
        (js/atlas-console.js's in-message overlay toggle switches these off).
        ⚠ IT ASKS THE THREE THAT DRAW THE LINE, not all nine. The letters, the duration labels and
        the invisible hit target are decoration and hit-testing; a route whose casing and coloured
        legs are all hidden is not on the map however many of those are still switched on — and one
        of them, `imroute-line`, has drawn nothing since #R86 (its filter matches no feature). */
    const LINE_LAYERS=['imroute-cas','imroute-walk','imroute-rail'];
    function visible(){ try{ if(!painted()) return false;
      for(let i=0;i<LINE_LAYERS.length;i++) if(GE().layers.isVisible(LINE_LAYERS[i])) return true;
      return false; }catch(_){ return false; } }
    /** re-frame the CURRENT route on demand — the panel calls this when it is resized or re-opened */
    function frame(){ try{ const rc=_routeCoords(); if(!rc||!rc.coords.length) return false;
      const bb=_bounds(rc.coords); if(!bb) return false;
      GE().camera.fitBounds(bb,{padding:_pad(28),maxZoom:15,duration:600}); return true; }catch(_){ return false; } }
    /* the label a waypoint marker carries: A, then 1…n for the stops, then B (§5.1). One rule, so the
       marker on the map and the row in the panel are the same character by construction. */
    function _wpLabel(i,n){ return i===0?'A':(i===n-1?'B':String(i)); }
    function _wpColor(i,n){ return i===0?'#1e8e3e':(i===n-1?'#d93025':'#1a73e8'); }
    function _midOf(coords){ if(!coords||!coords.length) return null;
      let tot=0; for(let i=1;i<coords.length;i++) tot+=_hav(coords[i-1],coords[i]);
      let want=tot/2, acc=0;
      for(let i=1;i<coords.length;i++){ const d=_hav(coords[i-1],coords[i]);
        if(acc+d>=want){ const t=d?(want-acc)/d:0; return [coords[i-1][0]+(coords[i][0]-coords[i-1][0])*t, coords[i-1][1]+(coords[i][1]-coords[i-1][1])*t]; }
        acc+=d; }
      return coords[Math.floor(coords.length/2)]; }
    function _durLabel(sec){ try{ return window.IntMapRouteCards.duration(sec,{lang:HOST.lang}); }catch(_){ return Math.round((sec||0)/60)+' min'; } }
    function _drawAlts(sel,setId){ const rs=_rsets.get(setId||_rsActive); if(!rs||!rs.alts.length) return;
      const sid=setId||_rsActive;   /* (#R299) the id every line carries, so a tap resolves to the set that drew it */
      const alts=rs.alts; sel=Math.max(0,Math.min(alts.length-1,sel|0)); rs.sel=sel; if(setId) _rsActive=setId;
      const feats=[]; const order=[]; for(let i=0;i<alts.length;i++) if(i!==sel) order.push(i); order.push(sel);   /* selected last = on top within each layer */
      order.forEach(i=>{ const a=alts[i], on=(i===sel); (a.lines||[]).forEach(ln=>{ const col=on?(ln.col||a.color):a.color; feats.push({type:'Feature',geometry:{type:'LineString',coordinates:ln.coords},properties:{alt:i,rs:sid,col:col,walk:ln.walk,w:on?(ln.walk?5:6.5):(ln.walk?3.5:4),op:on?1:0.55,cop:on?0.95:0.5}}); }); });   /* (#R86d) selected route → each leg its MODE colour (walk grey-dotted, subway orange, rail blue, bus purple, tram green, ferry teal); other alternatives → their distinct palette colour, dimmed */
      const sa=alts[sel]; (sa.stops||[]).forEach(s=>feats.push({type:'Feature',geometry:{type:'Point',coordinates:s},properties:{k:'stop',col:sa.color}}));
      /* (#R291) a duration label per alternative, at that alternative's own midpoint */
      if(alts.length>1) alts.forEach((a,i)=>{ const co=(a.lines&&a.lines[0]&&a.lines[0].coords)||a.coords; const mid=_midOf(co);
        if(mid) feats.push({type:'Feature',geometry:{type:'Point',coordinates:mid},properties:{dur:_durLabel(a.duration),col:(i===sel?(a.color||'#1a73e8'):'#6b7280')}}); });
      /* ⚠ (#R291) EVERY waypoint, LABELLED — not only the two ends, and never by colour alone (§5.1) */
      const ends=rs.ends||[];
      ends.forEach((p,i)=>{ if(!p) return; feats.push({type:'Feature',geometry:{type:'Point',coordinates:p},properties:{color:_wpColor(i,ends.length),wp:_wpLabel(i,ends.length)}}); });
      const fc=[]; (sa.lines||[]).forEach(ln=>ln.coords.forEach(p=>fc.push(p)));
      _paint(feats,fc.length?fc:null,15); }
    /* ══ ⚠⚠⚠ (#R299 追記) SELECTING AN ALTERNATIVE RE-FRAMED THE CAMERA — FOR SEVEN ROUNDS ══════════
       MEASURED on production R299, tapping a route line at z10.91: Δlng **+0.001934°**, Δlat
       **−0.002779°**, **Δzoom −0.0359** — about 2.7 px east, 4.7 px south and 2.5 % out. Two
       independent runs gave the identical delta, and the gesture was move→down→60 ms→up with no
       movement in between and a ZOOM change, so it was not a synthesised drag.
       `_drawAlts` ALWAYS hands `_paint` the selected alternative's coordinates as `fitCoords`, and
       `_paint` fits whenever they are non-null. #R291's rule — 「Only a NEW route set fits, and only
       once」 — was enforced only for the style-swap repaint (`_lastPaint.fit=null`), never for a
       selection. So every tap on the map and every press of a candidate card flew the camera.
       ⚠ AND THE COMMENT ABOVE `_onLineClick` SAID THE OPPOSITE («THE CAMERA DOES NOT MOVE»), because
       `open({keepView:true})` really does skip the panel's own re-frame — the move was coming from
       the line the same function calls one statement earlier. A note that names the mechanism it
       checked is still wrong if it did not check the other one.
       → the selection repaints WITHOUT fitting (`_noFit`, the switch `repaint()` already uses).
       ⚠ `selectStep` still flies, deliberately: 「fly to it」 is what asking for one step MEANS, and
       it is a different gesture from choosing which of two journeys to look at. */
    function selectAlt(i,setId){ const rs=_rsets.get(setId||_rsActive); if(rs&&rs.alts[i]){
      const keep=_noFit; _noFit=true; try{ _drawAlts(i,setId||_rsActive); } finally { _noFit=keep; }
      /* (#R291) the SELECTION lives in the store, so the panel's card, Atlas's card and the map are
         ONE fact — which is what lets a tap on the map drive the card and the card drive the map. */
      try{ const ST=window.IntMapRouteStore; if(ST&&ST.get().routeSetId===(setId||_rsActive)) ST.setSel(i); }catch(_){}
      return true; } return false; }
    /* (#R132) 経路10-10 §12.5: highlight ONE step's segment on the currently-selected road route + fly to it. Steps
       carry a start/end coordinate index into the selected alternative's full geometry; we paint the sub-segment on
       top and ease the camera onto it. Returns false if the set/step is unknown (a stale message card). */
    function selectStep(setId,stepIdx,coords){ try{ const rs=_rsets.get(setId||_rsActive); if(!rs) return false;
      try{ const ST=window.IntMapRouteStore; if(ST&&ST.get().routeSetId===(setId||_rsActive)) ST.get().step=(stepIdx==null?-1:stepIdx|0); }catch(_){}
      const a=rs.alts[rs.sel]||rs.alts[0]; if(!a) return false;
      _drawAlts(rs.sel,setId||_rsActive);   /* repaint base first so a previous step highlight is cleared (_lastPaint.feats now = the base) */
      if((!coords||coords.length<2)&&a.steps&&a.steps[stepIdx]&&a.steps[stepIdx].geometry){ coords=a.steps[stepIdx].geometry.coordinates; }   /* (#R132) derive from the store so Atlas needn't carry step geometry in the DOM */
      if(!coords||coords.length<2) return true;
      const hi={type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{col:'#ffd23f',walk:0,w:9,op:1}};
      const base=(_lastPaint&&_lastPaint.feats)?_lastPaint.feats:[];   /* (#R132) use our OWN paint store, not MapLibre's {geojson:…}-wrapped source._data */
      try{ GE().layers.setSourceData(SRC,{type:'FeatureCollection',features:base.concat([hi])}); }catch(_){}
      try{ const bb=_bounds(coords); if(bb) GE().camera.fitBounds(bb,{padding:120,maxZoom:16,duration:800}); }catch(_){}
      return true; }catch(_){ return false; } }
    /* (#R132) 経路10-10 §3.3/§7.1-7.2/§10: road ALTERNATIVES — coarse-grid overlap so near-identical OSRM alternatives
       collapse to one (keep the faster), then rank fastest-first and give each a meaningful differentiator label. */
    function _roadSig(coords){ const s=new Set(); (coords||[]).forEach(p=>s.add(Math.round(p[0]*200)+'_'+Math.round(p[1]*200))); return s; }
    /* OSRM's `alternatives` already guarantees the routes are meaningfully distinct (built-in sharing factor), so
       dedup ONLY removes a near-exact repeat: high geometric overlap AND near-equal time (else two routes that share
       a motorway corridor but diverge — e.g. Munich→Nuremberg 109 vs 119 min — get wrongly collapsed). */
    function _roadDedup(alts){ const out=[]; alts.forEach(a=>{ a._sig=_roadSig(a.lines[0]&&a.lines[0].coords);
      const dup=out.find(b=>{ let inter=0; const small=(a._sig.size<b._sig.size)?a._sig:b._sig, big=(a._sig.size<b._sig.size)?b._sig:a._sig; small.forEach(k=>{ if(big.has(k)) inter++; }); const ov=small.size?(inter/small.size):0;
        const dt=Math.abs((a.duration||0)-(b.duration||0))/Math.max(1,Math.min(a.duration||1,b.duration||1)); return ov>0.92&&dt<0.03; });
      if(dup){ if(a.duration<dup.duration){ const i=out.indexOf(dup); out[i]=a; } } else out.push(a); }); return out; }
    /* ⚠⚠ (#R291 追記) THE LABEL IS A DESCRIPTOR, NOT A SENTENCE — because it outlives the language.
       PRODUCTION VERIFICATION caught this: compute a route, then switch the app to Japanese, and the
       card still read 「Fastest」 while everything around it was Japanese. Every OTHER string on the
       card is produced at RENDER time (the notes are keys, the distances go through
       js/routing-cards.js, the turn text is `maneuver()` called per render), so the panel's
       `intmap-lang` rebuild fixed all of them — and could not fix this one, because `a.label` was a
       STRING baked when the route was computed. That is [[intmap-recurring-lessons]]'s
       «translation held as data»: a tuple resolved once is a tuple that cannot be resolved again.
       ⚠ `a.label` IS STILL WRITTEN. js/atlas-console.js prints it into a message that is a permanent
       transcript entry, `_routeExport` has carried it, and tests/r184-routing reads it; what is new
       is `a.labelKey`, which js/routing-cards.js renders in the language of the moment. */
    function _labelRoad(alts,avoid){ if(!alts.length) return; const fast=alts[0];
      let si=0,sd=alts[0].distance; for(let i=1;i<alts.length;i++){ if(alts[i].distance<sd){ sd=alts[i].distance; si=i; } }
      const av=(avoid&&avoid.length)?avoid.slice():null;
      const avoidTx=av?(' · '+LL('avoids ','回避: ','ohne ','без ','evita ')+av.map(x=>({toll:LL('tolls','有料','Maut','платн.','peajes'),motorway:LL('highways','高速','Autobahn','магистр.','autopistas'),ferry:LL('ferries','フェリー','Fähren','паромы','ferris')}[x]||x)).join(', ')):'';
      alts.forEach((a,i)=>{ if(i===0){ a.labelKey={k:'fastest',avoid:av}; a.label=LL('Fastest','最速','Schnellste','Быстрейший','Más rápido')+avoidTx; }
        else if(i===si){ a.labelKey={k:'shortest',avoid:av}; a.label=LL('Shortest','最短距離','Kürzeste','Кратчайший','Más corto')+avoidTx; }
        else { const dMin=Math.round((a.duration-fast.duration)/60); a.labelKey={k:'delta',min:dMin,avoid:av};
          a.label=(dMin>0?('+'+dMin+' '+LL('min','分','Min','мин','min')):LL('Alternative','代替','Alternative','Альтернатива','Alternativa'))+avoidTx; } }); }
    /* (#R132) 経路10-10 §7.3/§4.7: AVOID toll / highway / ferry. The public OSRM demo REJECTS `exclude=` ("Exclude
       flag combination is not supported"), so an avoid request would be a broken button — instead we route it on
       Valhalla (FOSSGIS, keyless — the same server used for isochrones), which honours costing_options.use_* and
       genuinely reroutes (measured: Munich→Nuremberg avoiding highways = 218 km/252 min vs 169 km/109 min). This is
       real provider-selection-by-feature, not a facade. Valhalla's maneuver `type` maps onto the SAME _maneuver()
       pseudo-step so the 5-language turn-by-turn + lane/step-highlight all work unchanged. */
    function _vhStep(m){ const T=m.type;
      const MAP={1:['depart',''],2:['depart',''],3:['depart',''],7:['new name','straight'],8:['continue','straight'],
        9:['turn','slight right'],10:['turn','right'],11:['turn','sharp right'],12:['turn','uturn'],13:['turn','uturn'],
        14:['turn','sharp left'],15:['turn','left'],16:['turn','slight left'],
        17:['on ramp','straight'],18:['on ramp','right'],19:['on ramp','left'],20:['off ramp','right'],21:['off ramp','left'],
        22:['fork','straight'],23:['fork','slight right'],24:['fork','slight left'],25:['merge','straight'],
        26:['roundabout',''],27:['continue','straight'],28:['notification',''],29:['notification',''],
        4:['arrive',''],5:['arrive','right'],6:['arrive','left'],37:['arrive','']};
      const e=MAP[T]||['continue','straight'];
      const step={maneuver:{type:e[0],modifier:e[1]},name:(m.street_names&&m.street_names[0])||'',distance:(m.length||0)*1000};
      if(T===26&&m.roundabout_exit_count) step.maneuver.exit=m.roundabout_exit_count;
      return step; }
    /* (#R184) Valhalla's costing name for each of the road modes, so an AREA to avoid can be honoured
       on foot and by bike as well as by car. OSRM has no equivalent at all — the demo server rejects
       `exclude=` — which is why the whole avoid path goes through Valhalla. */
    const _vhCosting=(m)=>/walk|foot|pedestr/i.test(m||'')?'pedestrian':/cycl|bike/i.test(m||'')?'bicycle':'auto';
    async function _roadValhalla(from,to,opts){ const rid=opts._rid; const av=new Set(opts.avoid||[]);
      const co={}; if(av.has('toll')) co.use_tolls=0; if(av.has('motorway')) co.use_highways=0.1; if(av.has('ferry')) co.use_ferry=0;
      const costing=_vhCosting(opts.mode);
      const cOpts={}; cOpts[costing]=co;
      const body={locations:[{lat:+from.lat,lon:+from.lng}].concat((Array.isArray(opts.via)?opts.via:[]).map(p=>({lat:+p.lat,lon:+p.lng}))).concat([{lat:+to.lat,lon:+to.lng}]),
        costing:costing,costing_options:cOpts,directions_options:{units:'kilometers'}};
      /* (#R184) 「通過禁止範囲を地図で描画」 — the drawn areas, as Valhalla's own exclude_polygons. Rings
         are [lon,lat], which is the order Valhalla documents and the order this app stores anyway.
         Measured on the public FOSSGIS server (Munich, one 2 km box across the direct line):
         4.675 km / 725 s becomes 5.444 km / 834 s — it really reroutes, it does not merely accept the
         parameter. Degenerate rings are dropped rather than sent, because a 2-point "polygon" makes
         the whole request fail and the user would see "no route" instead of "your box is empty". */
      const ex=(Array.isArray(opts.avoidAreas)?opts.avoidAreas:[])
        .map(r=>(Array.isArray(r)?r.filter(p=>Array.isArray(p)&&isFinite(+p[0])&&isFinite(+p[1])).map(p=>[+p[0],+p[1]]):[]))
        .filter(r=>r.length>=4);
      if(ex.length) body.exclude_polygons=ex;
      const url='https://valhalla1.openstreetmap.de/route?json='+encodeURIComponent(JSON.stringify(body));
      let j=null,errKind='provider_unavailable'; const ac=_mkAC(22000);
      try{ const r=await fetch(url,{signal:ac.signal});
        if(r.status===429) errKind='rate_limited';
        else if(r.ok){ const jj=await r.json(); if(jj&&jj.trip&&jj.trip.status===0&&jj.trip.legs&&jj.trip.legs.length) j=jj; else errKind='no_route'; }
        else if(r.status>=400&&r.status<500) errKind='no_route'; }
      catch(e){ errKind=(e&&e.name==='AbortError')?((rid!==_reqSeq)?'cancelled':'provider_timeout'):'provider_unavailable'; }
      finally{ _rmAC(ac); }
      if(rid!==_reqSeq) return {ok:false,status:'cancelled'};
      if(!j) return {ok:false,status:errKind,provider:'valhalla'};
      const trip=j.trip; let shape=[]; const steps=[];
      trip.legs.forEach(leg=>{ const seg=_decodePoly(leg.shape,6);
        (leg.maneuvers||[]).forEach(m=>{ const st=_vhStep(m); const b=Math.max(0,m.begin_shape_index||0), e2=Math.max(b,m.end_shape_index||0);
          st.geometry={type:'LineString',coordinates:seg.slice(b,e2+1)}; steps.push(st); });
        shape=shape.length?shape.concat(seg):seg; });
      const avoidTx=(opts.avoid&&opts.avoid.length)?(LL('avoids ','回避: ','ohne ','без ','evita ')+opts.avoid.map(x=>({toll:LL('tolls','有料道路','Maut','платные','peajes'),motorway:LL('highways','高速道路','Autobahn','магистрали','autopistas'),ferry:LL('ferries','フェリー','Fähren','паромы','ferris')}[x]||x)).join(', ')):LL('Route','経路','Route','Маршрут','Ruta');
      const alt={lines:[{coords:shape,walk:0,col:'#1a73e8'}],stops:[],geometry:{type:'LineString',coordinates:shape},coords:shape,steps:steps,
        duration:trip.summary.time,distance:(trip.summary.length||0)*1000,color:ALT_PAL[0],label:avoidTx,
        labelKey:{k:'route',avoid:(opts.avoid&&opts.avoid.length)?opts.avoid.slice():null},
        legDurations:(trip.legs||[]).map(l=>(l.summary&&l.summary.time)||0)};
      alt.roads=_majorRoads(steps,3);
      const setId=_rsNew([alt],_ends(from,to,opts.via)); _drawAlts(0,setId);
      return {ok:true,status:'success',road:true,provider:'valhalla',routeSetId:setId,sel:0,
        /* (#R291) Valhalla answers with ONE route, so an avoid request costs the alternatives. Said
           out loud rather than left for the reader to notice (§9.2). */
        altsSuppressed:'provider',
        mode:(costing==='pedestrian'?'walking':costing==='bicycle'?'cycling':'driving'),
        avoid:opts.avoid, avoidAreas:ex.length||0, avoidAreasAsked:(Array.isArray(opts.avoidAreas)?opts.avoidAreas.length:0),
        distance:alt.distance,duration:alt.duration,steps:steps,coords:shape,legDurations:alt.legDurations,
        alternatives:[{duration:alt.duration,distance:alt.distance,steps:steps,label:alt.label,labelKey:alt.labelKey,color:alt.color,coords:shape,roads:alt.roads}]}; }
    /* (#R125) plan fetch extracted from transit() so the intercity JR bridge can reuse it for ACCESS/EGRESS legs.
       (#R126) 経路10-10 §3.2/§24.1: public CORS proxies REMOVED from the routing path (api.transitous.org serves CORS
       headers directly — proxying routed third parties through corsproxy.io/allorigins leaked origin/destination
       coordinates and mangled polylines). Direct fetch with one backoff retry; requests register in the module abort
       pool so a newer route request cancels them. _planItins._fail carries WHY it failed (§2.5 error taxonomy). */
    async function _planItins(from,to,opts){ opts=opts||{};
      const when=(opts.time?new Date(opts.time):new Date()); const tISO=isFinite(when.getTime())?when.toISOString():new Date().toISOString();
      /* (#R184) 「フェリー、鉄道、徒歩区間の個別除外」 — MOTIS takes the transit modes it MAY use as an
         allow-list, so excluding one means sending the others. Verified against the live server: a
         valid list answers 200, an invalid mode name answers 500, so the parameter is really read
         rather than ignored. Walking is not a transit mode — it is how you reach a stop — so
         excluding it is expressed by capping the access/egress distance instead (below). */
      const url='https://api.transitous.org/api/v1/plan?fromPlace='+(+from.lat).toFixed(6)+','+(+from.lng).toFixed(6)+'&toPlace='+(+to.lat).toFixed(6)+','+(+to.lng).toFixed(6)+'&time='+encodeURIComponent(tISO)+(opts.arriveBy?'&arriveBy=true':'')
        +(Array.isArray(opts.transitModes)&&opts.transitModes.length?('&transitModes='+encodeURIComponent(opts.transitModes.join(','))):'')
        +(isFinite(+opts.maxWalkM)&&+opts.maxWalkM>0
          ? (()=>{ const s=Math.round(Math.max(60,Math.min(3600,(+opts.maxWalkM)/1.35)));   /* 1.35 m/s walking */
                   return '&maxPreTransitTime='+s+'&maxPostTransitTime='+s; })() : '');
      const tmo=opts.quick?15000:32000;
      let fail='provider_unavailable';
      const _fetchPlan=async(u)=>{ const ac=_mkAC(tmo);
        try{ const r=await fetch(u,{signal:ac.signal});
          if(r){ if(r.status===429){ fail='rate_limited'; return null; }
            if(r.ok){ const jj=await r.json(); const it=jj&&(jj.itineraries||(jj.plan&&jj.plan.itineraries));
              if(it&&it.length) return jj; fail='no_transit'; return null; }   /* provider answered: genuinely no itineraries */
            fail='provider_unavailable'; } }
        catch(e){ fail=(e&&e.name==='AbortError')?'provider_timeout':'provider_unavailable'; }
        finally{ _rmAC(ac); } return null; };
      const attempts=opts.quick?[url]:[url,url,url];
      let j=null; for(let i=0;i<attempts.length;i++){ j=await _fetchPlan(attempts[i]); if(j||fail==='no_transit') break; if(!opts.quick&&i<attempts.length-1) await new Promise(r=>setTimeout(r,800)); }
      const its=j&&(j.itineraries||(j.plan&&j.plan.itineraries));
      _planItins._fail=(its&&its.length)?null:fail;
      return (its&&its.length)?its:null; }
    const _P=l=>({lng:+(l.lon!=null?l.lon:l.lng),lat:+l.lat});
    /* ===== (#R125) INTERCITY JAPAN RAIL BRIDGE ("瑞穂区役所から新宿まで電車で、というのに対応していない").
       Transitous/MOTIS only carries Japan's OPEN GTFS (Tokyo/ODPT etc. — Shinjuku→Tokyo works), but JR Central and
       the Shinkansen publish no open timetable, so any Nagoya↔Tokyo ask returned a flat "no transit". This bridge
       answers intercity Japan asks with REAL infrastructure: a curated registry of the actual Shinkansen network
       (real lines, real stations + coordinates, express-pattern segment minutes and service headways from the
       operators' PUBLISHED timetables) routed with Dijkstra, plus local access/egress legs planned on Transitous
       where it HAS coverage and otherwise shown as clearly-labelled distance estimates. Times are frequency-based
       estimates (headway/2 boarding wait), NEVER invented clock times, and the reply says so. The drawn intercity
       line passes through the real stations it stops at (the alignment BETWEEN stations is schematic — labelled,
       not passed off as track geometry; the R122 rule against fake OSM-graph passenger routes stands). */
    /* ⚠ (#R246) THE LINE NAMES ARE A CALL. `{jp:…,en:…}` read as `jpn?Ln.jp:Ln.en` gave every
       language but Japanese the English (the eleventh shape; scripts/i18n-langmap-audit.mjs).
       `LA(…)` is IntMapLang.pickArgs() — the same data as an ordinary call site, resolved by
       `LSH.arr()` through pick() itself. */
    const LA=window.IntMapLang.pickArgs(), LSH=window.IntMapLang.pick(()=>HOST.lang);
    /* @i18n-entity-data  railway STATION names, each row pinned by [lng,lat] and a distance
       (#R249 — declared, and validated by scripts/i18n-pair-audit.mjs against the coordinate).
       ⚠ These rows are written [ja, en, lng, lat, km] — Japanese FIRST. #R248 broke three arrays
       by assuming slot 0 is always English; nothing here may assume an order either. */
    const _SHINK=[
      {nm:LA('Tokaido–Sanyo Shinkansen','東海道・山陽新幹線','Tōkaidō-Sanyō-Shinkansen','Синкансэн Токайдо-Санъё','Shinkansen Tokaido-Sanyo'),head:8,st:[
        ['東京','Tokyo',139.7671,35.6812,0],['品川','Shinagawa',139.7387,35.6284,7],['新横浜','Shin-Yokohama',139.6178,35.5093,18],
        ['小田原','Odawara',139.1557,35.2565,34],['熱海','Atami',139.0776,35.1039,44],['三島','Mishima',138.9109,35.1265,52],
        ['静岡','Shizuoka',138.3890,34.9719,66],['浜松','Hamamatsu',137.7345,34.7038,88],['豊橋','Toyohashi',137.3820,34.7629,97],
        ['名古屋','Nagoya',136.8816,35.1706,100],['岐阜羽島','Gifu-Hashima',136.6856,35.3155,112],['米原','Maibara',136.2897,35.3143,124],
        ['京都','Kyoto',135.7585,34.9855,135],['新大阪','Shin-Osaka',135.5000,34.7335,150],['新神戸','Shin-Kobe',135.1950,34.7067,163],
        ['姫路','Himeji',134.6903,34.8290,180],['岡山','Okayama',133.9184,34.6669,201],['福山','Fukuyama',133.3627,34.4877,217],
        ['広島','Hiroshima',132.4753,34.3979,237],['徳山','Tokuyama',131.8065,34.0522,261],['新山口','Shin-Yamaguchi',131.3963,34.0938,273],
        ['小倉','Kokura',130.8823,33.8870,288],['博多','Hakata',130.4207,33.5902,304]]},
      {nm:LA('Tohoku Shinkansen','東北新幹線','Tōhoku-Shinkansen','Синкансэн Тохоку','Shinkansen Tohoku'),head:14,st:[
        ['東京','Tokyo',139.7671,35.6812,0],['上野','Ueno',139.7770,35.7138,6],['大宮','Omiya',139.6236,35.9064,25],
        ['宇都宮','Utsunomiya',139.8987,36.5594,49],['郡山','Koriyama',140.3889,37.3986,78],['福島','Fukushima',140.4590,37.7541,92],
        ['仙台','Sendai',140.8824,38.2600,112],['盛岡','Morioka',141.1367,39.7015,154],['八戸','Hachinohe',141.4883,40.5123,183],
        ['新青森','Shin-Aomori',140.6932,40.8272,209]]},
      {nm:LA('Joetsu Shinkansen','上越新幹線','Jōetsu-Shinkansen','Синкансэн Дзёэцу','Shinkansen Joetsu'),head:18,st:[
        ['東京','Tokyo',139.7671,35.6812,0],['大宮','Omiya',139.6236,35.9064,25],['高崎','Takasaki',139.0128,36.3229,50],
        ['越後湯沢','Echigo-Yuzawa',138.8087,36.9351,71],['長岡','Nagaoka',138.8513,37.4468,89],['新潟','Niigata',139.0614,37.9124,104]]},
      {nm:LA('Hokuriku Shinkansen','北陸新幹線','Hokuriku-Shinkansen','Синкансэн Хокурику','Shinkansen Hokuriku'),head:22,st:[
        ['東京','Tokyo',139.7671,35.6812,0],['大宮','Omiya',139.6236,35.9064,25],['高崎','Takasaki',139.0128,36.3229,50],
        ['軽井沢','Karuizawa',138.6356,36.3428,66],['長野','Nagano',138.1889,36.6433,84],['富山','Toyama',137.2137,36.7008,130],
        ['金沢','Kanazawa',136.6576,36.5783,149],['福井','Fukui',136.2237,36.0621,172],['敦賀','Tsuruga',136.0553,35.6453,189]]},
      {nm:LA('Kyushu Shinkansen','九州新幹線','Kyūshū-Shinkansen','Синкансэн Кюсю','Shinkansen Kyushu'),head:22,st:[
        ['博多','Hakata',130.4207,33.5902,0],['熊本','Kumamoto',130.6884,32.7900,35],['鹿児島中央','Kagoshima-Chuo',130.5427,31.5838,78]]},
      {nm:LA('Hokkaido Shinkansen','北海道新幹線','Hokkaidō-Shinkansen','Синкансэн Хоккайдо','Shinkansen Hokkaido'),head:60,st:[
        ['新青森','Shin-Aomori',140.6932,40.8272,0],['新函館北斗','Shin-Hakodate-Hokuto',140.6488,41.9054,58]]}
    ];
    let _jrG=null;
    function _jrGraph(){ if(_jrG) return _jrG;
      const nodes=[]; const byName=new Map();
      _SHINK.forEach((Ln,li)=>{ Ln.st.forEach((s,si)=>{ const id=nodes.length; nodes.push({li,si,s,Ln});
        if(!byName.has(s[0])) byName.set(s[0],[]); byName.get(s[0]).push(id); }); });
      const adj=nodes.map(()=>[]);
      nodes.forEach((n,id)=>{ const st=n.Ln.st; if(n.si+1<st.length){ const o=id+1, dt=Math.abs(st[n.si+1][4]-n.s[4]); adj[id].push([o,dt]); adj[o].push([id,dt]); } });
      byName.forEach(ids=>{ for(let i=0;i<ids.length;i++) for(let j2=i+1;j2<ids.length;j2++){ adj[ids[i]].push([ids[j2],15]); adj[ids[j2]].push([ids[i],15]); } });
      return _jrG={nodes,adj,byName}; }
    function _jrRoute(fromName,toName){ const G=_jrGraph(); const S=G.byName.get(fromName)||[], T=new Set(G.byName.get(toName)||[]);
      if(!S.length||!T.size) return null;
      const dist=G.nodes.map(()=>Infinity), prev=G.nodes.map(()=>-1), done=G.nodes.map(()=>false);
      S.forEach(id=>{ dist[id]=0; });
      for(;;){ let u=-1,bd=Infinity; for(let i=0;i<dist.length;i++) if(!done[i]&&dist[i]<bd){ bd=dist[i]; u=i; }
        if(u<0) break; done[u]=true; if(T.has(u)) break;
        for(const [v,w] of G.adj[u]) if(!done[v]&&dist[u]+w<dist[v]){ dist[v]=dist[u]+w; prev[v]=u; } }
      let end=-1,bd=Infinity; T.forEach(id=>{ if(dist[id]<bd){ bd=dist[id]; end=id; } });
      if(end<0||!isFinite(bd)) return null;
      const path=[]; for(let u=end;u>=0;u=prev[u]) path.unshift(u);
      /* group into per-line ride segments (skip 0-length transfer hops) */
      const G2=_jrGraph(); const segs=[]; let cur=null;
      for(let i=0;i<path.length;i++){ const n=G2.nodes[path[i]];
        if(cur&&cur.li===n.li) cur.stops.push(n);
        else { if(cur&&cur.stops.length>1) segs.push(cur); cur={li:n.li,Ln:n.Ln,stops:[n]}; } }
      if(cur&&cur.stops.length>1) segs.push(cur);
      return {segs, rideMin:bd}; }
    async function _jrAccess(p,st,toStation,opts){ const d=_hav([p.lng,p.lat],[st[2],st[3]]);
      const jpn=(typeof HOST.lang!=='undefined'&&HOST.lang==='jp');
      const stName=jpn?st[0]:st[1];
      if(d<=1.2){ const sec=Math.round(d*14*60);
        return {legs:[{mode:'WALK',walk:1,route:'',headsign:'',from:toStation?'':stName,to:toStation?stName:'',duration:sec,color:_modeColor('WALK')}],
          lines:[{coords:toStation?[[p.lng,p.lat],[st[2],st[3]]]:[[st[2],st[3]],[p.lng,p.lat]],walk:1,col:_modeColor('WALK')}],stops:[],sec}; }
      try{ const A=toStation?p:{lng:st[2],lat:st[3]}, B=toStation?{lng:st[2],lat:st[3]}:p;
        const its=await _planItins(A,B,{quick:true,time:opts&&opts.time});
        if(its&&its.length){ const b=_buildItin(its[0]); return {legs:b.legs,lines:b.lines,stops:b.stops,sec:(b.duration||0),live:true}; } }catch(_){}
      /* no open timetable here (e.g. Nagoya subway) → an honest, clearly-labelled local estimate leg */
      const sec=Math.round((8+d*2.4)*60);
      const lbl=jpn?'ローカル区間（公開時刻表なし・目安）':(window.IntMapLang.t(HOST.lang,'Local segment (no open timetable, estimate)',undefined,'Lokaler Abschnitt (kein offener Fahrplan, Schätzung)','Местный участок (нет открытого расписания, оценка)','Tramo local (sin horario abierto, estimación)'));
      return {legs:[{mode:'LOCAL',walk:0,route:'',headsign:lbl,from:toStation?'':stName,to:toStation?stName:'',duration:sec,color:'#9aa0a6',est:1}],
        lines:[{coords:toStation?[[p.lng,p.lat],[st[2],st[3]]]:[[st[2],st[3]],[p.lng,p.lat]],walk:1,col:'#9aa0a6'}],stops:[],sec,est:true}; }
    async function _jrPlan(from,to,opts){
      const inJP=p=>p&&isFinite(+p.lng)&&p.lng>=127&&p.lng<=146.5&&p.lat>=30&&p.lat<=46;
      if(!inJP(from)||!inJP(to)) return null;
      const gc=_hav([from.lng,from.lat],[to.lng,to.lat]); if(gc<70) return null;
      const near=p=>{ let b=null,bd=Infinity; _SHINK.forEach(Ln=>Ln.st.forEach(s=>{ const d=_hav([p.lng,p.lat],[s[2],s[3]]); if(d<bd){ bd=d; b={s,d}; } })); return (b&&b.d<=130)?b:null; };
      const A=near(from), B=near(to); if(!A||!B||A.s[0]===B.s[0]) return null;
      const jr=_jrRoute(A.s[0],B.s[0]); if(!jr||!jr.segs.length) return null;
      const jpn=(typeof HOST.lang!=='undefined'&&HOST.lang==='jp');
      const [acc,egr]=await Promise.all([_jrAccess(from,A.s,true,opts),_jrAccess(to,B.s,false,opts)]);
      const legs=[],lines=[],stops=[]; let waitMin=0;
      legs.push.apply(legs,acc.legs); lines.push.apply(lines,acc.lines); stops.push.apply(stops,acc.stops);
      jr.segs.forEach(seg=>{ const st0=seg.stops[0].s, st1=seg.stops[seg.stops.length-1].s;
        const min=Math.abs(st1[4]-st0[4]); waitMin+=seg.Ln.head/2;
        legs.push({mode:'HIGHSPEED_RAIL',walk:0,route:LSH.arr(seg.Ln.nm),headsign:jpn?st1[0]:st1[1],from:jpn?st0[0]:st0[1],to:jpn?st1[0]:st1[1],duration:min*60,color:_modeColor('HIGHSPEED')});
        lines.push({coords:seg.stops.map(n=>[n.s[2],n.s[3]]),walk:0,col:_modeColor('HIGHSPEED')});
        seg.stops.forEach(n=>stops.push([n.s[2],n.s[3]])); });
      legs.push.apply(legs,egr.legs); lines.push.apply(lines,egr.lines); stops.push.apply(stops,egr.stops);
      const durSec=acc.sec+egr.sec+(jr.rideMin+waitMin)*60;
      const transfers=Math.max(0,legs.filter(l=>!l.walk).length-1);
      if(opts&&opts._rid&&opts._rid!==_reqSeq) return {ok:false,status:'cancelled'};   /* stale — do not draw */
      const itin={lines,stops,legs,duration:durSec,transfers,startTime:null,endTime:null,color:ALT_PAL[0],jrEstimate:true};
      const setId=_rsNew([itin],_ends(from,to,null)); _drawAlts(0,setId);
      return {ok:true,status:'success',transit:true,jrEstimate:true,routeSetId:setId,duration:durSec,transfers,legs,startTime:null,endTime:null,mode:'transit',sel:0,
        alternatives:[{duration:durSec,transfers,legs,startTime:null,endTime:null,color:itin.color}]}; }
    async function transit(from,to,opts){ opts=opts||{};
      const its=await _planItins(from,to,opts);
      if(!its||!its.length){ /* (#R122) OSM rail-corridor fallback stays DISABLED (freight/non-passenger nonsense).
           (#R125) but intercity JAPAN gets the curated Shinkansen bridge above — real stations, published-timetable
           estimates — before we give up with an honest "no transit". */
        const fail=_planItins._fail||'no_transit';
        if(fail==='no_transit'){ try{ const jr=await _jrPlan(from,to,opts); if(jr) return jr; }catch(_){} }
        /* (#R126) §2.5: provider outage/timeout/429 is NOT the same answer as "no transit here" */
        return {ok:false,reason:'no-transit',status:fail}; }
      if(opts._rid&&opts._rid!==_reqSeq) return {ok:false,status:'cancelled'};   /* stale — a newer request superseded us; do not draw */
      return _transitBuild(its,from,to); }
    function _buildItin(it){ const P=_P; const legOut=[], lines=[], stops=[];
        (it.legs||[]).forEach(l=>{ const col=_modeColor(l.mode), walk=/WALK|FOOT/i.test(l.mode)?1:0;
          let coords=null; try{ if(l.legGeometry&&l.legGeometry.points) coords=_decodePoly(l.legGeometry.points,l.legGeometry.precision||7); }catch(_){}
          /* (#R103) FIX "経路がアメリカ沖の大西洋に描画される": a CORS-proxied MOTIS response can mangle the encoded
             polyline → _decodePoly yields garbage coords (near 0,0 / wrong hemisphere). Validate the decoded geometry
             against the leg's OWN endpoints (which come as plain lat/lon, not encoded) and DISCARD it if any point is
             absurdly far (>3°) — then the straight-line from/to fallback below draws a sane leg instead. */
          if(coords&&coords.length&&l.from&&l.to&&l.from.lat!=null&&l.to.lat!=null){ const a=P(l.from),b=P(l.to);
            if(isFinite(a.lng)&&isFinite(b.lng)){ const lo=Math.min(a.lng,b.lng)-3,hi=Math.max(a.lng,b.lng)+3,slo=Math.min(a.lat,b.lat)-3,shi=Math.max(a.lat,b.lat)+3;
              if(coords.some(c=>!(isFinite(c[0])&&isFinite(c[1])&&c[0]>=lo&&c[0]<=hi&&c[1]>=slo&&c[1]<=shi))) coords=null; } }
          /* (#R126) 経路10-10 §3.8/§22.3/§24.4: a broken/absent TRANSIT leg shape is NEVER replaced by a station-to-
             station straight line dressed up as the route. Only a WALK leg may fall back to a short straight dashed
             connector (its two endpoints are real and it is drawn in the walk style). A ride leg with no usable
             geometry contributes NO line — the leg stays in the itinerary list and the result is flagged shapeGap. */
          let gap=false;
          if((!coords||coords.length<2)&&l.from&&l.to&&l.from.lat!=null&&l.to.lat!=null){
            const a=P(l.from),b=P(l.to);
            if(isFinite(a.lng)&&isFinite(b.lng)){ if(walk) coords=[[a.lng,a.lat],[b.lng,b.lat]]; else gap=true; } }
          if(coords&&coords.length>1) lines.push({coords:coords,walk:walk,col:col});   /* (#R86d) keep the per-leg MODE colour on the geometry so the map can colour each leg by type (walk/subway/rail/bus/…) — not just one colour per alternative */
          if(gap) legOut._gap=true;
          if(!walk){ if(l.from&&l.from.lat!=null){ const a=P(l.from); if(isFinite(a.lng)) stops.push([a.lng,a.lat]); }
            if(l.to&&l.to.lat!=null){ const b=P(l.to); if(isFinite(b.lng)) stops.push([b.lng,b.lat]); } }
          /* (#R132) 経路10-10 §2.4/§9.6: MOTIS marks each leg realTime true/false and carries scheduledStartTime.
             Surface whether a leg's time is LIVE (real-time) or timetable-based, and any delay (actual − scheduled),
             so the reply can say "real-time" only when it truly is — never dress a static timetable as live. */
          const rt=(l.realTime===true); let delay=0;
          try{ if(rt&&l.startTime&&l.scheduledStartTime){ delay=Math.round((new Date(l.startTime).getTime()-new Date(l.scheduledStartTime).getTime())/60000); if(!isFinite(delay)) delay=0; } }catch(_){ delay=0; }
          /* ⚠⚠ (#R296) 「「徒歩 → END」ではなく「徒歩 → 到着」でいい」 — THE PROVIDER'S SENTINEL, NOT A PLACE ═══
             MOTIS names the two ends of a trip `START` and `END` — they are not place names, they are
             the API saying 「the coordinate you gave me」. They were being passed through as if they
             were, so the last walk of every itinerary read 「徒歩 → END」 in every language.
             ⚠ THE FLAG TRAVELS, NOT THE WORD. #R291 追記's lesson is that a translated string baked into
             route DATA is resolved once and can never follow a language change, so this records WHICH
             end it is and js/routing-cards.js says it in the reader's language at render time. */
          const _sent=(n)=>/^(START|END)$/i.test(String(n||''));
          const _fN=(l.from&&l.from.name)||'', _tN=(l.to&&l.to.name)||'';
          /* (#R296) …and WHERE each end is, so js/routing-cards.js can print the local wall clock there */
          const _ll=(x)=>(x&&isFinite(+x.lon)&&isFinite(+x.lat))?[+x.lon,+x.lat]:((x&&isFinite(+x.lng)&&isFinite(+x.lat))?[+x.lng,+x.lat]:null);
          legOut.push({mode:l.mode,walk,route:(l.routeShortName||l.tripShortName||l.routeLongName||l.route||''),headsign:(l.headsign||l.tripHeadsign||''),from:_sent(_fN)?'':_fN,to:_sent(_tN)?'':_tN,fromStart:_sent(_fN)&&/^START$/i.test(_fN)?1:0,toEnd:_sent(_tN)&&/^END$/i.test(_tN)?1:0,fromLL:_ll(l.from),toLL:_ll(l.to),duration:l.duration||0,dep:l.startTime||l.scheduledStartTime||'',arr:l.endTime||l.scheduledEndTime||'',color:col,rt:rt,delay:delay}); });
        const anyRt=legOut.some(l=>!l.walk&&l.rt);
        return {lines:lines,stops:stops,legs:legOut,shapeGap:!!legOut._gap,realtime:anyRt,duration:it.duration||0,transfers:(it.transfers!=null?it.transfers:Math.max(0,legOut.filter(l=>!l.walk).length-1)),startTime:it.startTime,endTime:it.endTime}; }
    function _transitBuild(its,from,to){
      /* rank: itineraries that actually ride something first (a bare all-walk plan is unhelpful), then by duration; keep up to 5 */
      const ranked=its.slice().sort((x,y)=>{ const rx=(x.legs||[]).some(l=>!/WALK|FOOT/i.test(l.mode))?0:1, ry=(y.legs||[]).some(l=>!/WALK|FOOT/i.test(l.mode))?0:1; return (rx-ry)||((x.duration||1e9)-(y.duration||1e9)); });
      const alts=ranked.slice(0,5).map(_buildItin); if(!alts.length) return {ok:false,reason:'no-transit',status:'no_transit'};
      alts.forEach((a,i)=>{ a.color=ALT_PAL[i%ALT_PAL.length]; });
      const setId=_rsNew(alts,_ends(from,to,null));
      _drawAlts(0,setId);
      const b0=alts[0];
      return {ok:true,status:'success',transit:true,routeSetId:setId,duration:b0.duration,transfers:b0.transfers,legs:b0.legs,shapeGap:alts.some(a=>a.shapeGap),realtime:alts.some(a=>a.realtime),startTime:b0.startTime,endTime:b0.endTime,mode:'transit',sel:0,
        alternatives:alts.map(a=>({duration:a.duration,transfers:a.transfers,legs:a.legs,realtime:a.realtime,startTime:a.startTime,endTime:a.endTime,color:a.color}))}; }
    /* (#R126) 経路10-10 §3.1–§3.5/§17/§24: road routing goes DIRECT to the router (no public CORS proxy — §24.1),
       carries a requestId so stale responses never draw (§24.12), separates calculation from drawing (§24.2 — a
       route computed while the style is loading still succeeds; _paint repaints on styledata), and returns a TYPED
       status (§5.7) instead of one generic failure: success / invalid_request / no_route / provider_timeout /
       provider_unavailable / rate_limited / cancelled. */
    /* ══ ⚠⚠⚠ (#R291) EVERY ROUTE REQUEST LANDS IN THE STORE, WHOEVER MADE IT ═════════════════════
       This is what §17 is: Atlas typing 「東京から大阪へ車で」 and the panel's 🚗 chip are the same
       journey afterwards, because BOTH of them come through here and here is where the state is
       written. `opts.places` lets a caller pass the NAMES it resolved (Atlas has them; the panel put
       them there itself) — without it the endpoints still land, as coordinates.
       ⚠ AND THE STALE-RESPONSE RULE IS THE STORE'S TOO. `_reqSeq` already stopped an old response
       DRAWING (#R126); `store.settle(id,…)` stops an old response becoming the state. */
    function _storeBegin(from,to,opts){ try{ const ST=window.IntMapRouteStore; if(!ST) return 0;
      const pl=opts.places||null;
      const mk=(p,nm)=>({lng:+p.lng,lat:+p.lat,name:nm||p.name||((+p.lat).toFixed(4)+', '+(+p.lng).toFixed(4)),kind:p.kind||'place',source:p.source||'route'});
      const st=ST.get();
      if(!st.from.place||st.from.place.lng!==+from.lng||st.from.place.lat!==+from.lat) ST.setPlace('from',mk(from,pl&&pl.from));
      if(!st.to.place||st.to.place.lng!==+to.lng||st.to.place.lat!==+to.lat) ST.setPlace('to',mk(to,pl&&pl.to));
      const via=Array.isArray(opts.via)?opts.via:[];
      const cur=st.via.map(v=>v.place).filter(Boolean);
      if(via.length!==cur.length||via.some((v,i)=>!cur[i]||cur[i].lng!==+v.lng||cur[i].lat!==+v.lat)){
        while(st.via.length) ST.removeVia(st.via.length-1);
        via.forEach((v,i)=>ST.addVia(mk(v,pl&&pl.via&&pl.via[i]))); }
      if(opts.mode) ST.setMode(_isTransit(String(opts.mode))?'transit':({car:'driving',drive:'driving',driving:'driving',foot:'walking',walk:'walking',walking:'walking',bike:'cycling',cycle:'cycling',cycling:'cycling'})[String(opts.mode).toLowerCase()]||'driving');
      return ST.begin('route'); }catch(_){ return 0; } }
    function _storeSettle(id,res){ try{ const ST=window.IntMapRouteStore; if(ST&&id) ST.settle(id,res,_notesFor(res)); }catch(_){} return res; }
    /* the capability shortfalls this answer has to be honest about (§8.4/§9.2) — computed from the
       RESULT, so a note can never claim something the router did not actually report. */
    function _notesFor(res){ const n=[];
      if(!res||!res.ok) return n;
      if(res.avoidDropped) n.push(res.avoidAreasDropped?'areaDropped':'avoidDropped');
      if(res.altsSuppressed==='via') n.push('altsViaOsrm');
      else if(res.altsSuppressed==='provider') n.push('altsAvoid');
      if(res.provider==='valhalla'&&res.avoid&&res.avoid.indexOf('motorway')>=0) n.push('motorwayPref');
      if(res.shapeGap) n.push('shapeGap');
      if(res.jrEstimate||res.railEstimate) n.push('jrEstimate');
      if(res.transit) n.push(res.realtime?'transitLive':'transitTimetable');
      /* ⚠ (#R347) §43: 「fallbackで能力が落ちた場合、必ずResult metadataへ記録します。黙って品質を
         落とさないこと。」 A traffic-aware provider that was reachable a minute ago and is not now
         returns a duration that LOOKS identical and means something else — so the reply says which. */
      if(res.trafficDropped) n.push('trafficDropped');
      if(res.road) n.push('roadTypical');
      return n; }
    /* ══ (#R347) IS THERE A BETTER PROVIDER THAN THE OPEN ONES TODAY? ═════════════════════════
       §5 asks for real traffic where a provider that carries it is usable. Two things make that safe:

       ① THE PROBE FIRES HERE AND NOWHERE ELSE. `js/routing-traffic.js` can ask the relay whether a key
         is configured, but asking at BOOT would cost every session a request for a feature most of them
         never use (§45). Asking on the first route request costs the sessions that route, once — and
         `probe()` shares one in-flight promise, so N simultaneous requests make one call.
         ⚠ IT IS FIRE-AND-FORGET. This route must not wait for it; the answer arrives in time for the
         NEXT request, and until it does `available()` is false and nothing is offered.

       ② THE TABLE DECIDES, NOT THIS FUNCTION. `forRequest()` returns a chain, and the traffic provider
         is at its head only when the probe said yes. If it fails, we fall through to exactly the code
         that ran before — and `_trafficDropped` makes the reply say so rather than quietly handing back
         a number that looks the same and means something else (§43). */
    /* ⚠ THE ADAPTER IS FETCHED HERE TOO, NOT IMPORTED AT THE TOP. `check:perf` priced it at 22 kB of
       eager JavaScript for a file whose earliest possible caller is this function, so it is a
       deferred module. The fetch and the probe are the same fire-and-forget: by the time the answer
       matters (`available()` on the NEXT request) both have landed, and until then `available()` is
       false and nothing anywhere offers a traffic feature. */
    let _probed=false;
    function _kickProbe(){ if(_probed) return; _probed=true;
      try{
        const go=function(){ try{ const T=window.IntMapRouteTraffic; if(T&&T.probe) T.probe().catch(function(){}); }catch(_){} };
        if(window.IntMapRouteTraffic) go();
        else if(window.IntMapLazy) window.IntMapLazy.need('routingTraffic').then(go).catch(function(){});
      }catch(_){}
    }

    async function _tryTraffic(from,to,opts,mode){
      try{
        const PV=window.IntMapRouteProviders, T=window.IntMapRouteTraffic;
        if(!PV||!T||!T.available()) return null;
        const pick=PV.forRequest({mode:mode,via:opts.via,avoid:opts.avoid,avoidAreas:opts.avoidAreas,
                                  departAt:!!opts.time&&!opts.arriveBy,arriveBy:!!opts.arriveBy});
        if(!pick||!pick.provider||pick.provider.id!=='mapbox') return null;
        const r=await T.route(from,to,opts);
        if(r&&(r.ok||r.status==='CANCELLED'||r.status==='cancelled')) return r;
        opts._trafficDropped=true;
        return null;
      }catch(_){ opts._trafficDropped=true; return null; }
    }

    async function route(from,to,opts){ opts=opts||{};
      if(!from||to==null||!isFinite(+from.lng)||!isFinite(+from.lat)||!isFinite(+to.lng)||!isFinite(+to.lat)) return {ok:false,status:'invalid_request'};
      const _sid=_storeBegin(from,to,opts);
      const rid=++_reqSeq; _abortInflight(); opts._rid=rid;
      const mode=String(opts.mode||'driving').toLowerCase();
      _kickProbe();
      if(_isTransit(mode)) return _storeSettle(_sid,await transit(from,to,opts));
      { const tr=await _tryTraffic(from,to,opts,mode);
        if(tr) return _storeSettle(_sid,tr);
        if(rid!==_reqSeq) return {ok:false,status:'cancelled'}; }
      /* (#R132) §7.3/§4.7: an AVOID request (driving) goes to Valhalla, which actually honours it. If Valhalla is
         unreachable, fall through to OSRM without the avoid and flag it so the reply is honest (avoid not applied). */
      if(opts.avoid&&opts.avoid.length&&/driv|car|auto/.test(mode)){ const vr=await _roadValhalla(from,to,opts);
        if(vr&&(vr.ok||vr.status==='cancelled')) return _storeSettle(_sid,vr); opts._avoidDropped=true; }
      /* (#R184) …and a DRAWN AREA to keep out of goes the same way, for every road mode. OSRM cannot
         express it at all, so this is provider selection by capability rather than by preference: if
         Valhalla is unreachable we fall through to OSRM WITHOUT the area and flag it, because a route
         that quietly ignores the box the user drew is worse than one that says it could not. */
      if(Array.isArray(opts.avoidAreas)&&opts.avoidAreas.length&&!_isTransit(mode)){
        const vr=await _roadValhalla(from,to,opts);
        if(vr&&(vr.ok||vr.status==='cancelled')) return _storeSettle(_sid,vr); opts._avoidDropped=true; opts._areaDropped=true; }
      const prof=PROFILES[mode]||PROFILES.driving;
      const via=Array.isArray(opts.via)?opts.via:[];
      const pts=[from].concat(via).concat([to]);
      const coordStr=pts.map(p=>(+p.lng).toFixed(6)+','+(+p.lat).toFixed(6)).join(';');
      /* (#R132) §3.3/§7.1/§10: ask OSRM for up to 3 ALTERNATIVES (only for a plain A→B — the demo returns none when
         there are via points). */
      const url='https://'+prof[0]+'/route/v1/'+prof[1]+'/'+coordStr+'?overview=full&geometries=geojson&steps=true'+(via.length?'':'&alternatives=3');
      let j=null, errKind='provider_unavailable';
      for(let att=0;att<2&&!j;att++){
        if(rid!==_reqSeq) return {ok:false,status:'cancelled'};
        const ac=_mkAC(20000);
        try{ const r=await fetch(url,{signal:ac.signal});
          if(r.status===429){ errKind='rate_limited'; }
          else if(r.ok){ const jj=await r.json();
            if(jj&&jj.routes&&jj.routes.length) j=jj;
            else return _storeSettle(_sid,{ok:false,status:'no_route'}); }   /* router answered: there IS no route */
          else if(r.status>=400&&r.status<500){ const jj=await r.json().catch(()=>null);
            if(jj&&/NoRoute|NoSegment|NoMatch/i.test(String(jj.code||''))) return _storeSettle(_sid,{ok:false,status:'no_route'});
            errKind='invalid_request'; }
          else errKind='provider_unavailable'; }
        catch(e){ errKind=(e&&e.name==='AbortError')?((rid!==_reqSeq)?'cancelled':'provider_timeout'):'provider_unavailable'; }
        finally{ _rmAC(ac); }
        if(!j&&att===0&&errKind!=='rate_limited'&&errKind!=='cancelled') await new Promise(r2=>setTimeout(r2,600)); }
      if(rid!==_reqSeq) return {ok:false,status:'cancelled'};
      if(!j) return _storeSettle(_sid,{ok:false,status:errKind});
      /* (#R126) 経路10-10 §21.3/§2.2: the demo router SNAPS a point outside its road data to the nearest road it
         knows — even 5,500 km away across the Atlantic — and answers "Ok" (measured: Lisbon→New York snapped NY to
         Cascais, Portugal). A snap that far is a FAKE route; report no_route with the snap distance instead. */
      const _farM=(j.waypoints||[]).reduce((mx,w)=>Math.max(mx,(w&&w.distance)||0),0);
      if(_farM>30000) return _storeSettle(_sid,{ok:false,status:'no_route',snapKm:Math.round(_farM/1000)});
      const rcol=(mode==='foot'||mode==='walk'||mode==='walking')?'#7a7f87':(mode==='bike'||mode==='cycle'||mode==='cycling')?'#00897b':'#1a73e8';
      const rwalk=(mode==='foot'||mode==='walk'||mode==='walking')?1:0;
      /* (#R132) build every returned route into a RouteStore alternative (unified with transit — §10.1). Each carries
         its full geometry + steps (with per-step geometry indices for §12.5 step→map), a palette colour and a
         differentiator label; near-identical alternatives are collapsed and the set is ranked fastest-first. */
      let alts=j.routes.slice(0,3).map((rt,i)=>{ const steps=[]; (rt.legs||[]).forEach(l=>(l.steps||[]).forEach(s=>steps.push(s)));
        const coords=(rt.geometry&&rt.geometry.coordinates)||[];
        return {lines:[{coords:coords,walk:rwalk,col:rcol}],stops:[],geometry:rt.geometry,coords:coords,steps:steps,
          /* (#R184) the per-LEG durations — one leg per via-point section. This is what "arrival time
             at each point on the way" is made of, and it is only available here: the total duration
             cannot be split back into legs after the fact. */
          legDurations:(rt.legs||[]).map(l=>l.duration||0),
          duration:rt.duration,distance:rt.distance,color:ALT_PAL[i%ALT_PAL.length]}; });
      alts=_roadDedup(alts); alts.sort((a,b)=>(a.duration||0)-(b.duration||0));
      alts.forEach((a,i)=>{ a.color=ALT_PAL[i%ALT_PAL.length]; a.roads=_majorRoads(a.steps,3); }); _labelRoad(alts,opts.avoid);
      const setId=_rsNew(alts,_ends(from,to,via)); _drawAlts(0,setId);
      const b0=alts[0];
      return _storeSettle(_sid,{ok:true,status:'success',road:true,provider:'osrm',routeSetId:setId,sel:0,mode,avoid:opts.avoid||null,avoidDropped:!!opts._avoidDropped,trafficDropped:!!opts._trafficDropped,
        avoidAreasDropped:!!opts._areaDropped, avoidAreasAsked:(Array.isArray(opts.avoidAreas)?opts.avoidAreas.length:0),
        /* ⚠ (#R291) WHY THERE IS ONLY ONE. The demo returns no alternatives once there is a via point
           (measured), and until this round the request simply stopped asking and nothing said so —
           「経由地を含むため、このプロバイダーでは代替経路を取得できません」 (§9.2). */
        altsSuppressed:(via.length&&alts.length<2)?'via':'',
        distance:b0.distance,duration:b0.duration,steps:b0.steps,coords:b0.coords,legDurations:b0.legDurations,
        alternatives:alts.map(a=>({duration:a.duration,distance:a.distance,steps:a.steps,label:a.label,labelKey:a.labelKey,color:a.color,coords:a.coords,legDurations:a.legDurations,roads:a.roads}))}); }
    /* (#R126) §3.7: restore from the module's OWN last-paint store on style swap — not MapLibre's private source._data */
    /* ⚠⚠ (#R299) …AND IT IS ATTACHED WHEN THERE IS SOMETHING TO ATTACH TO. This was one bare
       `try{ GE().events.on('styledata', …) }catch(_){}` at module scope: with the renderer not yet
       up when js/app-body.js builds this module, the `catch` swallowed the failure and the ONLY
       thing that repaints a stashed route was never wired for the rest of the session. It is now a
       function keyed on the map's canvas — called at load, and again from `ensureLayers()` BEFORE
       its own draw test, so the first thing that ever asks to draw also completes the wiring. */
    let _styleKey=null;
    function _watchStyle(){ try{ const k=GE().render.canvas(); if(!k||_styleKey===k) return; _styleKey=k;
      GE().events.on('styledata',()=>{ setTimeout(()=>{ try{ if(_lastPaint&&_lastPaint.feats&&_lastPaint.feats.length) _paint(_lastPaint.feats,_lastPaint.fit,_lastPaint.mz); }catch(_){} },160); });
    }catch(_){ _styleKey=null; } }
    _watchStyle();
    /* ===== (#R84) RICH ROUTING UI ("経路のUIをもっと充実させて。Google MapやApple Mapのように") — a proper
       directions panel: editable start/destination, one-tap mode switch (drive/walk/cycle), swap, live recompute,
       distance + time, and a scrollable turn-by-turn list. ===== */
    const LL=window.IntMapLang.pick(()=>HOST.lang);
    const escp=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    /* (#R126) 経路10-10 §6.3/§6.4: SAME-NAME disambiguation — fetch several candidates and prefer the one near the
       current map view (then the most populous), instead of blindly taking hit #1 ("Potsdam" from a Germany view
       geocoded to Potsdam NY, USA). refLL (optional) = the point to bias toward (map centre / other endpoint). */
    function _mapCtr(){ try{ const c=GE().camera.getCenter(); return [c.lng,c.lat]; }catch(_){ return null; } }
    function _pickNear(cands,refLL){ if(!cands.length) return null; const ref=refLL||_mapCtr(); if(!ref) return cands[0];
      const scored=cands.map(c=>({c,d:_hav(ref,[c.lng,c.lat])}));
      const near=scored.filter(s=>s.d<=300).sort((a,b)=>a.d-b.d);
      if(near.length) return near[0].c;
      scored.sort((a,b)=>((b.c.pop||0)-(a.c.pop||0))||(a.d-b.d)); return scored[0].c; }
    async function geo1(q,refLL){ q=String(q||'').trim(); if(!q) return null;
      const m=q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/); if(m) return {lng:+m[2],lat:+m[1],name:(+m[1]).toFixed(3)+', '+(+m[2]).toFixed(3)};
      try{ const st=stationLL(q); if(st) return st; }catch(_){}
      try{ const r=await fetch('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(q)+'&count=5&language='+(window.IntMapLang.locale(HOST.lang,"en"))); const j=await r.json();
        const cs=(j&&j.results||[]).map(g=>({lng:+g.longitude,lat:+g.latitude,pop:+g.population||0,name:g.name+(g.admin1?(', '+g.admin1):'')+(g.country?(', '+g.country):'')}));
        const b=_pickNear(cs,refLL); if(b) return b; }catch(_){}
      try{ const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&q='+encodeURIComponent(q)); const j=await r.json();
        const cs=(j||[]).map(x=>({lng:+x.lon,lat:+x.lat,pop:+x.importance*1e6||0,name:(x.display_name||q).split(',').slice(0,2).join(', ')}));
        const b=_pickNear(cs,refLL); if(b) return b; }catch(_){}
      return null; }
    /* ══ ⚠⚠⚠ (#R291) THE PANEL'S PRIVATE STATE IS GONE FROM THIS FILE ═════════════════════════════
       `pFrom / pTo / pVia / pMode / pAvoid / pAreas / pTModes / pMaxWalk / pLastResult` lived here,
       in the same closure as the router, and NOTHING else could read one of them. Atlas therefore
       could not know what the panel was showing and the panel could not know what Atlas had just
       routed — 「Atlas専用の『最後の経路』とパネル専用の『最後の経路』を別々に持つ」, which §17 forbids.
       They are one object now (js/routing-store.js), and what stays here is only what is about the
       MAP: which field a click is currently choosing for, and the keep-out rectangles being drawn. */
    let _pickTarget=null,_pickHandler=null,_pickCb=null;
    let pAreas=[], pAreaDraw=null, _areaCb=null;
    /* (#R132) 経路10-10 §12: proper turn-by-turn — interpret the FULL OSRM maneuver vocabulary (turn / merge / on-ramp
       / off-ramp / fork / end-of-road / roundabout+exit-number / U-turn / arrive-side), plus road ref, signposted
       destinations (方面), motorway exit numbers, and lane guidance (▮ valid / ▯ not) — not just "arrow + road name".
       Natural 5-language phrasing. Returns {icon,text,lane}. */
    function _ord(n){ n=+n||0; if(HOST.lang==='jp') return n+'番目の'; if(HOST.lang==='de') return n+'.'; if(HOST.lang==='es') return n+'ª'; if(HOST.lang==='ru') return n+'-й'; const s=['th','st','nd','rd'],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }
    function _maneuver(s){ const m=s.maneuver||{}, type=String(m.type||''), mod=String(m.modifier||'');
      const nm=String(s.name||'').trim(), ref=String(s.ref||'').trim(), dest=String(s.destinations||'').trim(), exits=String(s.exits||'').trim();
      const road=(ref&&nm)?(nm+' ('+ref+')'):(nm||ref||'');
      const ARW={left:'←','slight left':'↖','sharp left':'⬅',right:'→','slight right':'↗','sharp right':'➡',straight:'↑',uturn:'↩'};
      const TURN={ 'left':LL('Turn left','左折','Links abbiegen','Поверните налево','Gira a la izquierda'),'right':LL('Turn right','右折','Rechts abbiegen','Поверните направо','Gira a la derecha'),
        'slight left':LL('Bear slightly left','斜め左へ','Leicht links halten','Держитесь левее','Ligeramente a la izquierda'),'slight right':LL('Bear slightly right','斜め右へ','Leicht rechts halten','Держитесь правее','Ligeramente a la derecha'),
        'sharp left':LL('Turn sharply left','鋭く左折','Scharf links','Резко налево','Giro cerrado izq.'),'sharp right':LL('Turn sharply right','鋭く右折','Scharf rechts','Резко направо','Giro cerrado der.'),
        'straight':LL('Continue straight','直進','Geradeaus','Прямо','Recto'),'uturn':LL('Make a U-turn','Uターン','Wenden','Развернитесь','Cambio de sentido') };
      const onto=road?(LL(' onto ',' → ',' auf ',' на ',' hacia ')+road):'';
      let icon=ARW[mod]||'↑', text='';
      switch(type){
        case 'depart': icon='🚩'; text=LL('Start','出発','Start','Старт','Salida')+(road?(' · '+road):''); break;
        case 'arrive': icon='🏁'; text=LL('Arrive at destination','目的地に到着','Ziel erreicht','Прибытие','Llegar al destino')+(mod==='left'?(' — '+LL('on your left','左側','links','слева','a la izquierda')):mod==='right'?(' — '+LL('on your right','右側','rechts','справа','a la derecha')):''); break;
        case 'roundabout': case 'rotary': { icon='◯'; const ex=m.exit?_ord(m.exit):''; text=LL('At the roundabout take the ','ラウンドアバウトで','Im Kreisverkehr die ','На кольце ','En la rotonda toma la ')+(ex?ex+' ':'')+LL('exit','出口','Ausfahrt','съезд','salida')+onto; break; }
        case 'roundabout turn': case 'exit roundabout': case 'exit rotary': icon='◯'; text=(TURN[mod]||LL('Continue','道なり','weiter','далее','continúa'))+onto; break;
        case 'merge': icon='⇱'; text=LL('Merge','合流','Einfädeln','Перестроение','Incorpórate')+(TURN[mod]&&mod!=='straight'?(' ('+TURN[mod]+')'):'')+onto; break;
        case 'on ramp': icon='⇗'; text=LL('Take the on-ramp','入口ランプへ','Auffahrt nehmen','На въезд','Toma la rampa de acceso')+onto; break;
        case 'off ramp': icon='⇘'; text=LL('Take the exit ramp','出口ランプへ','Ausfahrt nehmen','Съезд','Toma la salida')+(exits?(' '+exits):'')+onto; break;
        case 'fork': icon=(mod.indexOf('left')>=0)?'↖':(mod.indexOf('right')>=0)?'↗':'↑'; text=LL('Keep ','分岐を','Halte dich ','На развилке держитесь ','En la bifurcación mantente ')+(mod?(TURN[mod]||mod).toLowerCase().replace(/^(turn |bear |continue )/,''):LL('straight','直進','geradeaus','прямо','recto'))+onto; break;
        case 'end of road': icon=ARW[mod]||'↑'; text=LL('At the end of the road, ','突き当りを','Am Straßenende ','В конце дороги ','Al final de la vía ')+((TURN[mod]||'').toLowerCase()||LL('turn','曲がる','abbiegen','поверните','gira'))+onto; break;
        case 'new name': icon=ARW[mod]||'↑'; text=(mod&&mod!=='straight')?((TURN[mod]||'')+onto):(LL('Continue','道なりに進む','Weiter','Продолжайте','Continúa')+(road?(' · '+road):'')); break;
        case 'notification': case 'continue': icon=ARW[mod]||'↑'; text=(mod&&mod!=='straight'&&mod!=='uturn')?((TURN[mod]||'')+onto):(LL('Continue','道なりに進む','Weiter','Продолжайте','Continúa')+(road?(' · '+road):'')); break;
        default: icon=ARW[mod]||'↑'; text=(TURN[mod]||(road?(LL('Continue on ','道なり: ','Weiter auf ','Продолжайте по ','Continúa por ')+road):LL('Continue','道なり','weiter','далее','continuar')))+(mod&&road?onto:''); break;
      }
      if(dest) text+=' · '+LL('toward ','方面: ','Ri. ','в сторону ','hacia ')+dest.replace(/[;,]+/g,' / ').replace(/:/g,' ');
      if(exits&&type!=='off ramp') text+=' · '+LL('exit ','出口 ','Ausf. ','съезд ','salida ')+exits;
      let lane=''; try{ const li=(s.intersections||[]).find(it=>it.lanes&&it.lanes.length); if(li) lane=li.lanes.map(l=>l.valid?'▮':'▯').join(''); }catch(_){}
      /* ⚠ (#R291) THE GLYPH IS NAMED, NOT DRAWN HERE. `icon` stays exactly what it was (a character,
         which older callers print); `key` is the name js/routing-cards.js resolves to an SVG, so the
         panel and Atlas draw the same arrow from one set instead of two strings of emoji. */
      const key=(type==='depart')?'depart':(type==='arrive')?'arrive'
        :(type==='roundabout'||type==='rotary'||/roundabout|rotary/.test(type))?'roundabout'
        :(type==='merge')?'merge':(type==='on ramp')?'on ramp':(type==='off ramp')?'off ramp'
        :(type==='fork')?'fork':(type==='end of road')?'end of road'
        :(mod&&mod!=='straight')?mod:'straight';
      return {icon,text,lane,key,type,modifier:mod,road}; }
    /* ══ (#R291) CHOOSING A POINT ON THE MAP ══════════════════════════════════════════════════
       Unchanged in effect from #R126's `_startPick`, with three things it did not have: it says
       WHAT is being chosen (the caller renders that), Escape cancels it, and the answer comes back
       through a callback instead of being written into a panel variable — which is what lets the
       same service serve the desktop panel, the phone sheet and Atlas. */
    function startPick(which,cb){ endPick(); _pickTarget=which||'from'; _pickCb=(typeof cb==='function')?cb:null;
      try{ GE().render.canvas().style.cursor='crosshair'; }catch(_){}
      try{ document.addEventListener('keydown',_pickKey,true); }catch(_){}
      _pickHandler=async e=>{ const ll={lng:e.lngLat.lng,lat:e.lngLat.lat};
        const g={lng:ll.lng,lat:ll.lat,name:ll.lat.toFixed(4)+', '+ll.lng.toFixed(4),kind:'map',source:'map'};
        const tgt=_pickTarget, cb2=_pickCb;
        endPick();
        if(cb2) try{ cb2(g,tgt); }catch(_){}
        /* (#R126 §6.6) reverse-geocode for a NAME only. The point is usable as a coordinate the
           instant it is clicked, and the caller checks the field has not moved on before applying. */
        try{ const rg=window.IntMapRouteGeocode; if(!rg) return;
          const nm=await rg.reverse(ll.lng,ll.lat,{lang:HOST.lang});
          if(nm&&cb2) cb2(Object.assign({},nm,{_rename:g}),tgt); }catch(_){} };
      try{ GE().events.once('click',_pickHandler); }catch(_){} }
    function endPick(){ const was=_pickTarget; _pickTarget=null; _pickCb=null;
      try{ if(_pickHandler) GE().events.off('click',_pickHandler); }catch(_){} _pickHandler=null;
      try{ document.removeEventListener('keydown',_pickKey,true); }catch(_){}
      try{ GE().render.canvas().style.cursor=''; }catch(_){}
      return was; }
    function _pickKey(e){ if(e&&e.key==='Escape'){ e.stopPropagation(); endPick(); _endAreaDraw(true); try{ window.IntMapRouteStore.setPick(null); }catch(_){} } }
    function picking(){ return _pickTarget; }

    /* ══ (#R184/#R291) THE DRAWN KEEP-OUT AREAS ═══════════════════════════════════════════════════
       Two clicks give the opposite corners of a box; the request already accepts arbitrary rings.
       ⚠ WHAT CHANGED IN #R291 is the thing §14.2 names: pressing the button used to CLEAR EVERY
       AREA when any existed («範囲を押すと全消去されるだけの不明瞭な操作をやめる»), there was no
       preview after the first corner, and a degenerate box was pushed into the list and then dropped
       silently inside the request builder. Now: draw adds, each area is removed individually by the
       panel, the first corner previews, and a box too small to mean anything is refused HERE with a
       reason the caller can print. */
    const AREA_SRC='imroute-area-src', AREA_FILL='imroute-area', AREA_LINE='imroute-area-line';
    function _areaLayers(){ try{ const E=GE(); if(!E||!E.canDraw()) return false;
      if(!E.layers.hasSource(AREA_SRC)) E.layers.addSource(AREA_SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      if(!E.layers.has(AREA_FILL)) E.layers.add({id:AREA_FILL,type:'fill',source:AREA_SRC,paint:{'fill-color':'#ff453a','fill-opacity':['case',['==',['get','sel'],1],0.28,0.16]}});
      if(!E.layers.has(AREA_LINE)) E.layers.add({id:AREA_LINE,type:'line',source:AREA_SRC,paint:{'line-color':'#ff453a','line-width':['case',['==',['get','sel'],1],2.6,1.6],'line-dasharray':[3,2]}});
      return true; }catch(_){ return false; } }
    let _areaSel=-1;
    function _drawAreas(){ if(!_areaLayers()) return;
      try{ GE().layers.setSourceData(AREA_SRC,{type:'FeatureCollection',features:pAreas.map((r,i)=>({type:'Feature',geometry:{type:'Polygon',coordinates:[r]},properties:{i:i,sel:(i===_areaSel)?1:0}}))});
        [AREA_FILL,AREA_LINE].forEach(id=>{ if(GE().layers.has(id)) GE().layers.setVisible(id,pAreas.length>0); }); }catch(_){} }
    /** the smallest box worth sending: below this the router snaps straight past it */
    function _areaTooSmall(r){ try{ const w=_hav([r[0][0],r[0][1]],[r[1][0],r[0][1]]), h=_hav([r[0][0],r[0][1]],[r[0][0],r[2][1]]);
      return (w<0.05||h<0.05); }catch(_){ return true; } }
    function startAreaDraw(cb){ _endAreaDraw(); _areaCb=(typeof cb==='function')?cb:null;
      let first=null;
      try{ document.addEventListener('keydown',_pickKey,true); }catch(_){}
      pAreaDraw=(e)=>{ const ll=[e.lngLat.lng,e.lngLat.lat];
        if(!first){ first=ll; if(_areaCb) try{ _areaCb({phase:'first'}); }catch(_){} try{ GE().events.once('click',pAreaDraw); }catch(_){} return; }
        /* ⚠ (#R291) 「日付変更線付近で不正な巨大矩形を作らない」 — two clicks 30° apart in longitude are a
           box; two clicks either side of the antimeridian are the reader saying «this narrow strip»,
           and min/max would produce its complement (the other 340° of the planet). The short way
           round is the one that was drawn, so the ring is built on the unwrapped axis. */
        let x1=first[0], x2=ll[0];
        if(Math.abs(x2-x1)>180){ if(x2<x1) x2+=360; else x1+=360; }
        const w=Math.min(x1,x2), e2=Math.max(x1,x2);
        const so=Math.min(first[1],ll[1]), n=Math.max(first[1],ll[1]);
        const ring=[[w,so],[e2,so],[e2,n],[w,n],[w,so]];
        _endAreaDraw();
        if(_areaTooSmall(ring)){ if(_areaCb) try{ _areaCb({phase:'too-small'}); }catch(_){} return; }
        pAreas.push(ring); _drawAreas();
        if(_areaCb) try{ _areaCb({phase:'done',areas:pAreas.slice()}); }catch(_){} };
      try{ GE().render.canvas().style.cursor='crosshair'; GE().events.once('click',pAreaDraw); }catch(_){}
      return true; }
    function _endAreaDraw(silent){ try{ if(pAreaDraw) GE().events.off('click',pAreaDraw); }catch(_){}
      const had=!!pAreaDraw; pAreaDraw=null;
      try{ GE().render.canvas().style.cursor=''; }catch(_){}
      try{ document.removeEventListener('keydown',_pickKey,true); }catch(_){}
      if(had&&!silent&&_areaCb) try{ _areaCb({phase:'cancel'}); }catch(_){}
      return had; }
    function areas(){ return pAreas.slice(); }
    function removeArea(i){ if(i>=0&&i<pAreas.length){ pAreas.splice(i,1); if(_areaSel>=pAreas.length) _areaSel=-1; _drawAreas(); return true; } return false; }
    function clearAreas(){ pAreas=[]; _areaSel=-1; _drawAreas(); }
    function highlightArea(i){ _areaSel=(i==null?-1:i|0); _drawAreas(); }
    function drawingArea(){ return !!pAreaDraw; }

    /* ══ ⚠⚠⚠ (#R291) THIS FUNCTION HAD NO CALLER, ANYWHERE, FOR SEVEN ROUNDS ═════════════════════
       `openPanel` has been exported since #R84 and MEASURED on the shipped build (a repository-wide
       search for `openPanel`, `route-panel` and `IntMapRouting.`): nothing in js/, index.html, the
       right-click menu, the command palette, IntMapOS or the Tools list ever called it. The rich
       directions panel — mode switch, avoid chips, via points, drawn keep-out areas, six analyses —
       existed and could not be opened by any reader; typing a sentence at Atlas was the only door
       into routing at all. That is this project's most expensive recurring defect ([[intmap-recurring-lessons]]:
       a feature that silently does not exist), and it is why #R291 starts with an ENTRY (§2).
       ⚠ THE UI IS FETCHED WHEN IT IS FIRST ASKED FOR (js/lazy-modules.js). The ROUTER is not: Atlas
       must be able to route without any panel, which is what §2.3 asks for. */
    async function openPanel(from,to,mode){
      const ST=window.IntMapRouteStore;
      if(mode&&ST){ const ml=String(mode).toLowerCase();
        const mapped=_isTransit(ml)?'transit':({car:'driving',drive:'driving',driving:'driving',walk:'walking',foot:'walking',walking:'walking',cycle:'cycling',bike:'cycling',cycling:'cycling'})[ml];
        if(mapped) ST.setMode(mapped); }
      if(ST){
        if(from) ST.setPlace('from',(typeof from==='object'&&from.lng!=null)?from:await geo1(String(from)));
        if(to) ST.setPlace('to',(typeof to==='object'&&to.lng!=null)?to:await geo1(String(to))); }
      try{ await window.IntMapLazy.need('routeUi'); }catch(_){}
      /* ⚠ (#R299) `reveal` — this caller ASKED to see a journey (Atlas, the widget board, a tap on
         the line), so a panel the reader left minimised is opened up rather than opened as a title
         bar. A plain press on the Tools row carries no such intent and keeps what was left. */
      try{ return !!(window.IntMapRouteUI&&window.IntMapRouteUI.open({reveal:true})); }catch(_){ return false; }
    }
    /* (#R125) exact station lookup for the curated Shinkansen registry ("仙台駅" → the real 仙台駅, not a fuzzy
       POI hit like 仙太鮨) — accepts the name with/without 駅 and the English name, case-insensitive. */
    function stationLL(q){ q=String(q||'').trim().replace(/駅$/,'').replace(/\s+station$/i,''); if(!q) return null;
      const ql=q.toLowerCase();
      for(const Ln of _SHINK) for(const s of Ln.st){ if(s[0]===q||s[1].toLowerCase()===ql) return {lng:s[2],lat:s[3],name:(typeof HOST.lang!=='undefined'&&HOST.lang==='jp')?(s[0]+'駅'):(s[1]+' Station')}; }
      return null; }
    /* (#R132) 経路10-10 §15.7: export the CURRENTLY-SELECTED route as GPX or GeoJSON (real coordinates, user-initiated
       local download — no location is sent anywhere). _routeExport(fmt) builds the string (testable); exportRoute(fmt)
       downloads it. Uses the active RouteStore alternative's geometry (works for road, transit and the JR bridge). */
    function _routeCoords(){ const rs=_rsets.get(_rsActive); if(!rs||!rs.alts.length) return null; const a=rs.alts[rs.sel]||rs.alts[0];
      let coords=[]; (a.lines||[]).forEach(ln=>{ if(ln.coords&&ln.coords.length) coords=coords.length?coords.concat(ln.coords):ln.coords.slice(); });
      if(!coords.length&&a.coords) coords=a.coords; return {coords, alt:a}; }
    /* (#R291) the payload BOTH formats are built from — one description of the journey, so the GPX
       and the GeoJSON cannot disagree about which route they are a copy of. */
    function exportPayload(){ const rc=_routeCoords(); if(!rc||!rc.coords.length) return null;
      const rs=_rsets.get(_rsActive); const ST=window.IntMapRouteStore; const st=ST?ST.get():null;
      const res=(st&&st.result)||null;
      const ends=(rs&&rs.ends)||[];
      const names=st?[st.from].concat(st.via,[st.to]).map(f=>(f&&f.place&&f.place.name)||''):[];
      return { coords:rc.coords, distance:rc.alt.distance, duration:rc.alt.duration,
        mode:(res&&res.mode)||(st&&st.mode)||'driving', provider:(res&&res.provider)||'',
        avoid:(res&&res.avoid)||[], avoidAreas:(res&&res.avoidAreas)||0,
        liveTraffic:false, estimated:!!(res&&(res.jrEstimate||res.railEstimate)),
        legs:(res&&res.legs)||null, generatedISO:new Date().toISOString(),
        waypoints:ends.map((p,i)=>({ lng:p[0], lat:p[1], name:names[i]||'', role:i===0?'start':(i===ends.length-1?'destination':'stop') })) }; }
    function _routeExport(fmt){ const pl=exportPayload(); if(!pl) return null;
      const X=window.IntMapRouteExport;
      return /gpx/i.test(fmt)?X.gpx(pl):X.geojson(pl); }
    function exportRoute(fmt){ const s=_routeExport(fmt); if(s==null) return false; fmt=/gpx/i.test(fmt)?'gpx':'geojson';
      try{ const blob=new Blob([s],{type:fmt==='gpx'?'application/gpx+xml':'application/geo+json'}); const url=URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download='intmap-route.'+fmt; document.body.appendChild(a); a.click();
        setTimeout(()=>{ try{ document.body.removeChild(a); URL.revokeObjectURL(url); }catch(_){} },1200); return true; }catch(_){ return false; } }
    function hasRoute(){ const rc=_routeCoords(); return !!(rc&&rc.coords&&rc.coords.length); }
    /* (#R291) the alternatives of the CURRENT set, for the panel and for the analyses */
    function alts(){ const rs=_rsets.get(_rsActive); return (rs&&rs.alts)?rs.alts.slice():[]; }
    function altAt(i){ const a=alts(); return a[i]||null; }
    /* (#R291) …and of a NAMED set. An Atlas message from ten replies ago has its own routeSetId
       (#R126 §24.3), so re-rendering its detail list must read THAT set, never «whatever is active». */
    function altsOf(setId){ const rs=_rsets.get(setId||_rsActive); return (rs&&rs.alts)?rs.alts.slice():[]; }
    /* ⚠ (#R291) EVERYTHING BELOW `hasRoute` IS NEW, AND EVERY ADDITION EXISTS BECAUSE THE UI MOVED
       OUT OF THIS FILE. The panel used to reach into the closure; now it asks. `route`, `clear`,
       `selectAlt`, `selectStep`, `maneuver`, `stationLL`, `geoNear`, `exportRoute`, `_routeExport`
       and `hasRoute` are UNCHANGED names with unchanged meanings — js/atlas-console.js, js/map-tools.js
       and tests/r163 / r184-routing call them and must keep working. */
    /* ══ (#R291) THE SHARE LINK ═════════════════════════════════════════════════════════════════
       Registered with the app's OWN share registry (js/map-ui.js `IntMapShareState`), so a route
       travels in the same `#…&s=` parameter as every simulator's state and there is no second URL
       scheme to keep in step. ⚠ THE KEY IS THE LAZY-MODULE NAME: on restore the registry asks
       IntMapLazy for `routeUi` before handing the value over, which is what makes a shared route
       open its panel rather than land in a module that does not exist yet.
       ⚠ NO GEOMETRY TRAVELS — see js/routing-export.js. The recipient's app recomputes. */
    (function(){ const io2={
      get(){ try{ const ST=window.IntMapRouteStore; if(!ST||!ST.hasRoute()) return null;
        return window.IntMapRouteExport.encodeShare(ST.get()); }catch(_){ return null; } },
      set(v){ try{ const d=window.IntMapRouteExport.decodeShare(v); if(!d) return;
        const ST=window.IntMapRouteStore;
        ST.setPlace('from',d.from); ST.setPlace('to',d.to);
        while(ST.get().via.length) ST.removeVia(ST.get().via.length-1);
        d.via.forEach(v2=>ST.addVia(v2));
        ST.setMode(d.mode); ST.setWhen(d.when.kind,d.when.local);
        ['toll','motorway','ferry'].forEach(k=>ST.setAvoid(k,d.avoid.indexOf(k)>=0));
        if(d.transitModes) ST.setTransitModes(d.transitModes);
        if(d.maxWalkM) ST.setMaxWalk(d.maxWalkM);
        window.IntMapLazy.need('routeUi').then(()=>{ try{ window.IntMapRouteUI.open({restored:d}); }catch(_){} });
      }catch(_){} } };
      try{ if(window.IntMapShareState) window.IntMapShareState.register('routeUi',io2);
        else (window._imShareEarly||(window._imShareEarly=[])).push(['routeUi',io2]); }catch(_){}
    })();
    /* ══ (#R292) THE ROUTE, AS A RECORD — what the widget board's Route status card reads.
       ⚠ READ-ONLY AND DERIVED: every field already exists on the alternative the reader is looking
       at (`_routeCoords()` resolves which one that is), so this cannot disagree with the panel. A
       card must never be a second place where "how long is the route" is worked out. When nothing
       is routed it answers `{active:false}` — which is an EMPTY state on the card, not an error. */
    function summary(){
      const rc=_routeCoords();
      if(!rc||!rc.coords.length) return { active:false };
      const rs=_rsets.get(_rsActive), a=rc.alt;
      let w=180,s=90,e=-180,n=-90;
      rc.coords.forEach(c=>{ if(c[0]<w)w=c[0]; if(c[0]>e)e=c[0]; if(c[1]<s)s=c[1]; if(c[1]>n)n=c[1]; });
      return { active:true,
        distance:a.distance!=null?+a.distance:null,          /* metres, from the router */
        duration:a.duration!=null?+a.duration:null,          /* seconds, from the router */
        mode:a.mode||a.profile||null,
        label:a.label||null,
        alternatives:rs?rs.alts.length:1, selected:rs?rs.sel:0,
        steps:(a.steps||[]).length,
        nextSteps:(a.steps||[]).slice(0,3).map(st=>({
          name:(st.name||''), distance:st.distance!=null?+st.distance:null,
          type:(st.maneuver&&st.maneuver.type)||'' })),
        ends:(rs&&rs.ends)||null,
        bbox:[w,s,e,n],
        coords:rc.coords };
    }
    /* (#R299) `painted` / `repaint` / `visible` — 「その経路は今この地図に乗っているか」, which is a
       different question from `hasRoute` (「計算された経路はあるか」) and had no answer before. The
       panel asks the first two when it is re-opened; the surfaces that light a 「there is a route」
       dot (js/map-ui.js's Tools row, the widget board) can ask the third rather than assume. */
    return { route, clear, ensureLayers, openPanel, _src:SRC, selectAlt, selectStep, maneuver:_maneuver,
             stationLL, geoNear:geo1, exportRoute, _routeExport, hasRoute, painted, repaint, visible,
             alts, altAt, altsOf, routeCoords:_routeCoords, exportPayload, frame, setInsets,
             startPick, endPick, picking,
             startAreaDraw, endAreaDraw:_endAreaDraw, areas, removeArea, clearAreas, highlightArea, drawingArea,
             summary };
  })();
};
