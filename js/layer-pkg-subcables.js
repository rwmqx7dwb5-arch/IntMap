/* ============================================================================
 *  IntMap · js/layer-pkg-subcables.js — LAYER PACKAGE: the submarine cables (dl-subcables)
 * ----------------------------------------------------------------------------
 *  (layer-packages) The implementation of every row whose declaration says `pkg: 'subcables'`
 *  (js/layers/dl-subcables.js): the download ladder (the app's own copy, the relay, TeleGeography), the
 *  build ladder against a style that may refuse it, the click card, the switch and the opacity.
 *  It was the cable block of js/data-layers.js, and moved here with its notes. Every moved line is the same bytes it was
 *  there — indented as it stood inside that file's factory, which is why the body sits one level deeper than this
 *  function needs — except that the names it shared with the rest of that file arrive in the kit (`K`) instead of
 *  through the closure, and the switch at the end, which was the row's two branches of toggleLayer and one of
 *  setLayerOpacity.
 *  js/data-layers.js fetches this module the first time the row is switched — on boot for a first-time reader,
 *  since the cables are on by default — and calls the factory once; what the kit holds is written there
 *  (`packageKit`). tests/layer-manifest.spec.js ⑥ holds what the row draws equal to what it drew before the move.
 * ==========================================================================*/
import { isUnobserved, jsonWithin } from './fetch-deadline.js';
import { IntMapLang } from './lang-registry.js';
import { clockFor, ownRelayUrl } from './proxy-fetch.js';

/** @param {any} K the layer kit js/data-layers.js hands every package (`packageKit` there)
    @returns {{ rows: Record<string, { on: () => any, off: () => void, opacity: (v: number) => void }> }} */
export function subcablesPackage(K) {
    const { GE, HOST, autoUncheck, beforeId, layerReads, opacities, rowUntilObserved, satToast, setVis, whenStyleReady } = K;
    /* === Submarine cables (#36) — TeleGeography "Submarine Cable Map" open data ===
       Their public API serves all cable routes + landing points as GeoJSON; each cable
       carries its own color. Loaded lazily with the same CORS-proxy fallbacks used elsewhere. */
    let _subcablesLoading=false;
    /* ══ (#R188) WHY IT WAS ALWAYS THE CABLES THAT WENT MISSING ════════════════════════════════════
       「デフォルトでは、ケッペンと海底ケーブルレイヤーがオンが初期状態に。（追記：片方しかつかない）」

       #R187 found a real defect (a refused addSource that was logged and abandoned) and fixed it. The
       report came back, so the asymmetry between the two default layers was measured from the page's
       own origin instead of reasoned about:

           fetch('https://www.submarinecablemap.com/api/v3/cable/cable-geo.json')
               → TypeError: Failed to fetch          (no Access-Control-Allow-Origin, EVERY time)

       So the direct request in the proxy list below has never once succeeded from a browser: the
       submarine cables have ALWAYS come through a free public CORS proxy, and the layer is up only
       when one of three volunteer proxies happens to be up. Köppen has no such dependency — it is a
       bundled PNG on the app's own origin — which is exactly why 「片方しかつかない」 names this one
       every time and never that one.

       Two changes, and neither invents a data source:

       1. THE ANSWER IS KEPT. A successful download goes into the Cache API and is served from there
          on the next visit BEFORE the network is tried, with a refresh behind it that updates the
          source in place when it lands. Same data, same attribution; a proxy outage now costs a
          refresh rather than the layer. (#R186's rule: a fallback that only appears after the
          network has timed out is not a fallback, it is a delay.)
       2. A FAILED DOWNLOAD IS NOT A PREFERENCE. When everything failed, the old code unticked the
          box — and _snapshot() saves the ticked boxes, so the next thing the user toggled wrote a
          session in which this layer was OFF. From then on the restore switched it off deliberately,
          for ever: one bad afternoon for corsproxy.io became a permanent 「片方しかつかない」.
          The box is now marked `imAutoOff` when the app is the one unticking it, the session keeps
          wanting it (js/app-body.js), and it is retried with backoff before giving up at all. */
    const _CABLE_CACHE='intmap-page-subcables-v1';   /* `intmap-page-` = the page owns it; sw.js keeps every such cache across deploys */
    async function _cableCached(u){ try{ if(!self.caches) return null;
        const c=await caches.open(_CABLE_CACHE); const r=await c.match(u); if(!r) return null;
        const j=await r.json(); return (j&&j.features)?j:null; }catch(_){ return null; } }
    async function _cableStore(u,j){ try{ if(!self.caches||!j||!j.features) return;
        const c=await caches.open(_CABLE_CACHE);
        await c.put(u,new Response(JSON.stringify(j),{headers:{'content-type':'application/json'}})); }catch(_){} }
    const CABLE_URL='https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';
    const CABLE_LP_URL='https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json';
    /* ══ (#R190) THE LAYER STOPS DEPENDING ON A STRANGER'S UPTIME ══════════════════════════════════
       「デフォルトでは、ケッペンと海底ケーブルレイヤーがオンが初期状態に。（追記：片方しかつかない）」

       #R188 measured why it is always THIS layer: submarinecablemap.com sends no ACAO, so the direct
       request has never once succeeded from a browser, and the layer was up only when one of three
       VOLUNTEER proxies happened to be alive. #R188 kept the answer (Cache API) and #R189 stopped a
       failure being recorded as a preference — both real, both about the SECOND visit. The first
       visit still asked a stranger.

       So the app now relays it through its own Edge Function, exactly as #R145 did for the
       Street-View coverage tiles: supabase/functions/cable-geo, an allowlist of these two URLs and
       nothing else, `Access-Control-Allow-Origin: *`, one day of edge cache. Same data, same source,
       same attribution — a request to our origin instead of to someone else's goodwill.

       ⚠ the bare URL stays FIRST even though it is measured to fail from a browser: the app is also
       opened from origins that are allowed to read it (a local file server, an extension host), and
       the data should not travel through anyone — including us — when it need not.
       (own-fetch-relay) The volunteer proxies that stood LAST are gone: a build with no Supabase URL has the bundled routes
       (step 1 below) and the Cache API, and the relay URL is asked of js/proxy-fetch.js at call time instead of being
       built here once when this module was evaluated (the #R216 shape — a base read too early is '' for good). */
    /* ⚠ (cable-relay-first) OUR RELAY FIRST WHEN THERE IS ONE. submarinecablemap.com sends no ACAO, so the bare
       URL is refused in EVERY page context a reader has (measured again on production 2026-09-29: two CORS errors +
       two net::ERR_FAILED in the console whenever the bundled file missed its clock). The #R190 reason for keeping it
       first — «origins that are allowed to read it» — has no such origin in a browser. It stays as the last rung for a
       build with no relay (ownRelayUrl → ''), where it is the only thing left to try. */
    async function _cableNet(u,scale,seen){ for(const src of [ownRelayUrl(u), u]){ if(!src) continue; try{ const j=await jsonWithin(src,clockFor(u,src===u?'direct':'relay')*(scale||1),undefined,{idle:true}); if(j&&j.features){ _cableStore(u,j); return j; } }catch(e){ if(seen&&isUnobserved(e)) seen.unobserved=e; } } return null; }
    /* ══ (#R355) THE ROUTES COME FROM THIS APP'S OWN ORIGIN NOW ═══════════════════════════════════
       「世界中の全海底ケーブルが…実際に海底を通っていると考えられる場所に描画され」

       What used to be drawn here was TeleGeography's SCHEMATIC geometry — 702 cables in 1,933 rings
       and 14,103 vertices, a median of FOUR points per leg — fetched live, through a relay, from an
       origin that sends no ACAO. scripts/build-subcables.mjs now rebuilds every route offline from
       surveyed government route data where it exists and a least-cost path over the sea floor where
       it does not, and the result SHIPS WITH THE APP as data/subcables*.json.

       ⚠ THAT MAKES THE LAYER MORE ROBUST, NOT LESS, AND THE ORDER IS WHY. The brief's §3 forbids
       trading display reliability for route accuracy, so the four sources are tried strictly in
       order of how little can go wrong with them:

         1. data/subcables.json — the app's own origin, same deploy, no CORS, no third party. If the
            page loaded, this loads.
         2. the Cache API copy of (1) — written on every success, so a second visit paints with no
            network at all, and an offline start still paints. (The service worker deliberately
            keeps every `intmap-page-*` cache across deploys; see sw.js.)
         3. the Cache API copy of the TeleGeography answer — what #R188 put there. Every browser that
            has ever shown this layer still has one.
         4. the TeleGeography relay chain — #R190's Edge Function (the volunteer proxies behind it went in own-fetch-relay).

       Steps 3 and 4 are the MIGRATION path the brief's §3 asks to be kept: a build that somehow
       shipped without the dataset still draws cables, exactly as it did before this round. Nothing
       below touches the layer's paint, its layout, its order or its default state. */
    const CABLE_LOCAL=(p)=>{ try{ return new URL(p,document.baseURI).toString(); }catch(_){ return p; } };
    const CABLE_LOCAL_URL=CABLE_LOCAL('data/subcables.json');
    const CABLE_LOCAL_LP_URL=CABLE_LOCAL('data/subcables-lp.json');
    /* ══ (stalled-fetch) EVERY CABLE READ HAS A CLOCK — AND IT MEASURES SILENCE, NOT LENGTH ══════════
       The cable row's request is `_subcRequest()`, settled only where the download or the build ends.
       Its reads were bare `fetch`es, so a connection that stopped answering held the row «in flight» for
       the session. Each read now goes through js/fetch-deadline.js `jsonWithin` with the IDLE clock:
       data/subcables.json is 2,188,692 B, and a deadline on the whole transfer would measure the
       reader's line, not a stall — the clock restarts on every chunk, so `ms` is the longest silence.
       The numbers are js/proxy-fetch.js `clockFor`:
         · our own origin and submarinecablemap.com, read directly — DIRECT_TIMEOUT_MS (6 s). Observed
           2026-09-28 from the live site: subcables.json in 1.06 / 1.87 s, subcables-lp.json (329,206 B)
           in 0.71 / 0.92 s; not one of those reads was silent for anything like 6 s.
         · the cable-geo relay — the clock the relay ladder races that same relay at (PROXY_TIMEOUT_MS,
           8 s, since its row carries no clock of its own).
         Lapses if a read of ours or the relay's legitimately goes silent for longer (a cold relay whose
         upstream answers after 8 s — the ladder would then need the relay's own row clock, as gdelt-relay has).
       A failed read is a null here and the ladder falls through: kept copy → TeleGeography. When nothing
       came back, (unobserved-is-not-refused) a rung that timed out makes the answer 「not observed」 and
       the row asks the whole ladder again with its clocks doubled (rowUntilObserved, up to 8×); only a
       ladder whose every rung answered takes the 5 / 15 / 45 s back-off (#R188), and either ends in the
       toast 「Submarine cable data unavailable」, `imAutoOff`, and the request settled.
       ⚠ THE 90 s HORIZON IS NOT THE DOWNLOAD'S BOUND. `BUILD_HORIZON_MS` in addSubcables starts only once
       fetchSubcables() has handed back data, and it bounds the renderer refusing the add. The download
       is bounded by these clocks: per attempt, the two local reads in parallel, then the direct and relay
       reads — at most one silence each — and either four attempts separated by 65 s of back-off (every
       rung answered) or four at 1 / 2 / 4 / 8 × the clocks, paused by the clock each one had (a rung was
       silent). */
    async function _cableLocal(u,scale,seen){
      try{ const j=await jsonWithin(u,clockFor(u)*(scale||1),{cache:'default'},{idle:true});
        /* a truncated or half-written answer is not data — the layer must fall through, not draw a
           fragment and call it the world's cables */
        if(!j||!Array.isArray(j.features)||!j.features.length) return null;
        _cableStore(u,j); return j; }catch(e){ if(seen&&isUnobserved(e)) seen.unobserved=e; return null; }
    }
    /* (unobserved-is-not-refused) `scale` multiplies every clock of the ladder, and `unobserved` on the
       answer is the error of a rung whose read ran out of time — set only when no cables came back. A
       ladder that got nothing is 「refused」 only if every rung it asked ANSWERED; one silent rung (our own
       origin, under a loaded page) means the answer may have been there, and the row asks again
       (rowUntilObserved) instead of reporting the data unavailable. */
    async function fetchSubcables(scale){
      const seen={unobserved:null};
      /* 1 · this app's own dataset */
      const [cab,lp]=await Promise.all([_cableLocal(CABLE_LOCAL_URL,scale,seen),_cableLocal(CABLE_LOCAL_LP_URL,scale,seen)]);
      if(cab&&lp) return {cab,lp,from:'local'};
      /* 2 · the kept copy of it */
      const [cKept,lKept]=await Promise.all([_cableCached(CABLE_LOCAL_URL),_cableCached(CABLE_LOCAL_LP_URL)]);
      if(cKept&&lKept) return {cab:cKept,lp:lKept,from:'local-cache',fromCache:true};
      /* 3 · the kept TeleGeography copy, refreshed behind the drawing */
      const [cCache,lCache]=await Promise.all([_cableCached(CABLE_URL),_cableCached(CABLE_LP_URL)]);
      if(cCache){
        Promise.all([_cableNet(CABLE_URL),_cableNet(CABLE_LP_URL)]).then(([c2,l2])=>{
          try{ if(c2&&GE().layers.hasSource('src-subcables')) GE().layers.setSourceData('src-subcables',c2); }catch(_){}
          try{ if(l2&&GE().layers.hasSource('src-subcables-lp')) GE().layers.setSourceData('src-subcables-lp',l2); }catch(_){}
        });
        return {cab:cCache,lp:lCache,from:'telegeography-cache',fromCache:true};
      }
      /* 4 · the relay chain */
      const [cNet,lNet]=await Promise.all([_cableNet(CABLE_URL,scale,seen),_cableNet(CABLE_LP_URL,scale,seen)]);
      return {cab:cNet,lp:lNet,from:'telegeography',fromCache:false,unobserved:cNet?null:seen.unobserved};
    }
    layerReads.subcables=fetchSubcables;   /* (fetch-deadline-layer) the preview draws from THIS ladder — see layerReads at the top */
    let _subcableTries=0;
    /* ── (#R355) the click/tap info popup, in its OWN chunk ────────────────────────────────────
       js/subcable-info.js draws nothing on the map: it reads the feature the reader clicked and
       opens the same `.plc-popup` every other place card uses. It is imported dynamically so a
       session that never switches this layer on never downloads it, and so that it cannot enter the
       eager bundle (scripts/perf-budget.mjs). A failed import costs the popup, never the layer. */
    let _subcInfo=null,_subcInfoP=null;
    function _wireSubcableInfo(){
      if(_subcInfo){ try{ _subcInfo.attach(); }catch(_){} return; }
      if(_subcInfoP) return;
      _subcInfoP=import('./subcable-info.js').then(()=>{
        try{ _subcInfo=window.IntMapSubcableInfo(HOST); _subcInfo.attach(); }catch(e){ console.warn('subcable info',e); }
      }).catch(e=>{ console.warn('subcable info',e); });
    }
    /* (heal-waits-for-inflight) the request addSubcables() returns — ONE across the download, its
       back-off (#R188) and the build ladder (#R355), settled where any of them ends: drawn, given up
       (autoUncheck), or abandoned because the box was unticked. Bounded by those: three back-offs
       (5 + 15 + 45 s) or three unobserved retries (rowUntilObserved), and the horizon of the ladder itself
       (BUILD_HORIZON_MS). js/layer-rows.js ④. */
    let _subcReq=null,_subcDone=null;
    function _subcRequest(){ if(!_subcReq) _subcReq=new Promise(r=>{ _subcDone=r; }); return _subcReq; }
    function _subcSettle(){ const d=_subcDone; _subcReq=null; _subcDone=null; if(d) d(); }
    function addSubcables(){
      if(GE().layers.has('lyr-subcables')){ setVis('lyr-subcables',true); setVis('lyr-subcables-glow',true); setVis('lyr-subcables-pts',true); _wireSubcableInfo(); _subcSettle(); return; }
      const req=_subcRequest();
      if(_subcablesLoading) return req; _subcablesLoading=true;
      /* (unobserved-is-not-refused) a ladder that got nothing because a rung was not observed asks again
         with longer clocks (rowUntilObserved) and keeps the box; 'aborted' = the box was unticked while
         it waited. The #R188 back-off below is for a ladder whose every rung ANSWERED — after the policy
         has already asked four times, a fourth silence goes straight to the report, not round again. */
      rowUntilObserved('dl-subcables',s=>fetchSubcables(s).then(r=>{ if(!r.cab&&r.unobserved) throw r.unobserved; return r; }),clockFor(CABLE_LOCAL_URL))
        .catch(e=>((e&&e.reason==='aborted')?null:{cab:null,lp:null,silent:isUnobserved(e)})).then(res=>{
        _subcablesLoading=false;
        if(res===null){ _subcableTries=0; _subcSettle(); return; }
        const {cab,lp}=res;
        if(!cab){
          /* (#R188) three volunteer proxies all refusing at the same second is a bad minute, not an
             answer. Back off and ask again while the box is still ticked; only a fourth failure is
             reported — and even then as `imAutoOff`, which the session does not record as a choice. */
          const cb=document.getElementById('dl-subcables');
          if(cb&&cb.checked&&!res.silent&&_subcableTries<3){ const wait=[5000,15000,45000][_subcableTries++];
            setTimeout(()=>{ const c2=document.getElementById('dl-subcables'); if(c2&&c2.checked) addSubcables(); else _subcSettle(); },wait); return; }
          _subcableTries=0; autoUncheck('dl-subcables'); _subcSettle();
          try{ satToast(IntMapLang.t(HOST.lang,'Submarine cable data unavailable','海底ケーブルデータを取得できませんでした','Seekabel-Daten nicht verfügbar','Данные о подводных кабелях недоступны','Datos de cables submarinos no disponibles')); }catch(_){} return; }
        _subcableTries=0;
        /* ══ (#R187) A REFUSED ADD IS NOT AN ANSWER — TRY AGAIN ═══════════════════════════════════
           「デフォルトでは、ケッペンと海底ケーブルレイヤーがオンが初期状態に。（追記：片方しかつかない）」

           Reproduced on a cold first load, and the console says it outright:
               addSubcables Error: Style is not done loading.
           whenStyleReady() resolves for real when the style is parsed, but it also HARD-RESOLVES
           after ~6 s (#R41 put that there because the promise could otherwise hang forever and the
           layer would never appear at all). On a slow first load — and #R186 measured that its own two
           new default layers push "ready" from 3.2 s to 9.2 s, so this load is exactly the slow one —
           the hard resolve wins, MapLibre refuses addSource, and the old code logged the refusal and
           stopped. The box stayed ticked, the row stayed lit, and the layer did not exist: one of the
           two default layers on screen, which is the report.

           Köppen survives the same race because its branch polls for `lyr-climate` for 5 s and calls
           setVis when it appears. This gives the cables the same persistence at the point where it
           actually failed: build, and if the style refused, wait and build again. Bounded (12 tries
           over ~9 s), abandoned the moment the user unticks the box, and a no-op once the layers are
           there — so the successful path is byte-for-byte what it was. */
        /* ══ (#R355) THE LADDER IS TIED TO THE STYLE, NOT TO A STOPWATCH ═══════════════════════════
           #R187's ladder is twelve tries at 750 ms — about nine seconds — and it was measured
           against a style that was merely SLOW. Measured this round on a machine whose basemap host
           was answering 429/503: `isStyleLoaded()` was still false at 22 s, every addSource threw
           "Style is not done loading.", the ladder ran out, and the box was unticked with
           `imAutoOff` — correct bookkeeping for the wrong outcome.

           ⚠ AND THIS ROUND MADE THAT RACE TIGHTER, WHICH IS WHY IT IS FIXED HERE. The routes now
           come from this app's own origin: measured, `data/subcables.json` answers in 12 ms where
           the relay took seconds. Arriving earlier means arriving while the style is less ready.

           So the ladder keeps its 750 ms rhythm and stops asking a clock whether to continue: it
           continues while the box is ticked and the horizon has not passed, and — the part that
           actually matters — it retries THE MOMENT the renderer says the style changed, instead of
           waiting out the next tick. A style that becomes usable at 40 s now paints at 40 s.
           ⚠ `on`, not `once`: a `styledata` that has already fired never fires again for a listener
           registered afterwards, and this listener is registered after the first refusal by
           construction. It is removed on success, on giving up, and when the box is unticked. */
        const BUILD_HORIZON_MS=90000;
        const _giveUpAt=Date.now()+BUILD_HORIZON_MS;
        let _styleHook=null, _retryT=null;
        const stopHook=()=>{ if(_styleHook){ try{ GE().events.off('styledata',_styleHook); }catch(_){} _styleHook=null; }
          if(_retryT){ clearTimeout(_retryT); _retryT=null; } };
        const again=()=>{
          const cb=document.getElementById('dl-subcables');
          if(!cb||!cb.checked||Date.now()>_giveUpAt) return false;
          if(!_styleHook){ _styleHook=()=>{ if(_retryT){ clearTimeout(_retryT); _retryT=null; } build(); };
            try{ GE().events.on('styledata',_styleHook); }catch(_){} }
          if(!_retryT) _retryT=setTimeout(()=>{ _retryT=null; build(); },750);
          return true;
        };
        const build=()=>{
          if(_retryT){ clearTimeout(_retryT); _retryT=null; }
          try{
            if(!GE().layers.hasSource('src-subcables')) GE().layers.addSource('src-subcables',{type:'geojson',data:cab});
            if(!GE().layers.has('lyr-subcables-glow')) GE().layers.add({id:'lyr-subcables-glow',type:'line',source:'src-subcables',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#30b0c7'],'line-width':3.2,'line-opacity':0.20,'line-blur':3}},beforeId);
            if(!GE().layers.has('lyr-subcables')) GE().layers.add({id:'lyr-subcables',type:'line',source:'src-subcables',layout:{visibility:'none','line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#30b0c7'],'line-width':['interpolate',['linear'],['zoom'],0,0.6,4,1.1,8,2],'line-opacity':opacities.subcables}},beforeId);
            if(lp){ if(!GE().layers.hasSource('src-subcables-lp')) GE().layers.addSource('src-subcables-lp',{type:'geojson',data:lp});
              if(!GE().layers.has('lyr-subcables-pts')) GE().layers.add({id:'lyr-subcables-pts',type:'circle',source:'src-subcables-lp',minzoom:3,layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],3,1.6,8,3.5],'circle-color':'#ffd23f','circle-stroke-color':'#1a1a1a','circle-stroke-width':0.6,'circle-opacity':0.9}},beforeId); }
          }catch(e){
            /* the style refused this add. whenStyleReady() no longer answers «ready» early (it used to
               hard-resolve at ~6 s — see its note), so this is now a style that went away between the
               wait and this line; the ladder stays for exactly that */
            if(again()) return;
            stopHook();
            /* (#R189) giving up QUIETLY here left the one state #R187 was hunting: box ticked, layer
               absent. Say so the same way the download path does — imAutoOff, so the session still
               wants the layer, and a toast, so the screen is not silently missing what the row claims. */
            console.warn('addSubcables',e); autoUncheck('dl-subcables'); _subcSettle();
            try{ satToast(IntMapLang.t(HOST.lang,'Could not add the submarine-cable layer','海底ケーブルレイヤーを追加できませんでした','Seekabel-Ebene konnte nicht hinzugefügt werden','Не удалось добавить слой подводных кабелей','No se pudo añadir la capa de cables submarinos')); }catch(_){} return;
          }
          if(!GE().layers.has('lyr-subcables')){                 /* refused without throwing */
            if(again()) return;
            stopHook();
            console.warn('addSubcables: the style never accepted the cable layers'); autoUncheck('dl-subcables'); _subcSettle();
            try{ satToast(IntMapLang.t(HOST.lang,'Could not add the submarine-cable layer','海底ケーブルレイヤーを追加できませんでした','Seekabel-Ebene konnte nicht hinzugefügt werden','Не удалось добавить слой подводных кабелей','No se pudo añadir la capa de cables submarinos')); }catch(_){} return;
          }
          stopHook();
          setVis('lyr-subcables-glow',true); setVis('lyr-subcables',true); if(GE().layers.has('lyr-subcables-pts')) setVis('lyr-subcables-pts',true);
          /* the layer is up — whatever an earlier failure recorded is settled (#R188) */
          try{ const cb=document.getElementById('dl-subcables'); if(cb&&cb.dataset) delete cb.dataset.imAutoOff; }catch(_){}
          _wireSubcableInfo();
          _subcSettle();
        };
        build();
      }).then(null,e=>{ _subcSettle(); throw e; });   /* a download or build that threw has ended too */
      return req;
    }
    /* (layer-packages) the row: what toggleLayer's two branches and setLayerOpacity's one did for it */
    return { rows: {
      'dl-subcables': {
        on: () => whenStyleReady().then(()=>{ try{ return addSubcables(); }catch(e){ console.warn('subcables',e); } }),
        off: () => { setVis('lyr-subcables',false); setVis('lyr-subcables-glow',false); setVis('lyr-subcables-pts',false); },
        opacity: (v) => { if(GE().layers.has('lyr-subcables'))GE().layers.setPaint('lyr-subcables','line-opacity',v); },
      },
    } };
}
