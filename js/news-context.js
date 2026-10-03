/* ============================================================================
 *  IntMap · News article → place/publisher resolution  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { IntMapTables } from './tables.js';
import { makePlaceTerms, bestSubject, bestPublisherPlace } from './place-terms.js';
import * as bus from './bus.js';

export function newsContext(HOST){
  /* ══ (#R212) THE OUTLET IS OFTEN NAMED BY ITS DOMAIN, AND THE TABLE IS KEYED BY ITS NAME ═════════
     「ニュースの発信地が全然発信地の場所になっていない。」 Part of the mechanism, measured on a real feed:
     Google News hands the publisher as a DISPLAY NAME for some items and as a HOST for others
     («cbsnews.com»), and `sourceDict` is keyed by display names only — so half the feed resolved to
     no headquarters at all and fell through. Normalising both sides to letters-only makes the two
     forms the same key: «cbsnews.com» → cbsnews, «CBS News» → cbsnews. The index is built once from
     the SAME dictionary (no second table to disagree with it) and the article's own link is used when
     the publisher string is a name rather than a host. */
  let _pubDomIdx=null;
  const _normPub=(s)=>String(s||'').toLowerCase().replace(/^the\s+/,'').replace(/[^a-z0-9]/g,'');
  function _pubDomainIndex(){
    if(_pubDomIdx) return _pubDomIdx;
    _pubDomIdx=Object.create(null);
    try{ for(const m of HOST._pubMatchers){ if(m.cjk) continue;
      const k=_normPub(m.label); if(k.length>=3&&!_pubDomIdx[k]) _pubDomIdx[k]=m; } }catch(_){}
    return _pubDomIdx; }
  function _hostKey(s){
    let h=String(s||'').trim();
    try{ if(/^https?:\/\//i.test(h)) h=new URL(h).hostname; }catch(_){}
    h=h.toLowerCase().replace(/^www\./,'');
    if(h.indexOf('.')<0) return '';
    /* drop the public suffix: co.uk / com.au / co.jp are two labels, everything else is one */
    const parts=h.split('.');
    const two=/^(co|com|org|net|gov|ac|or|ne)$/.test(parts[parts.length-2]||'');
    const cut=two?2:1;
    return _normPub(parts.slice(0,Math.max(1,parts.length-cut)).join('')); }
  function matchPublisher(publisher,link){ if(!publisher) return null;
    for(const m of HOST._pubMatchers){ if(m.cjk?publisher.includes(m.label):m.re.test(publisher)) return m; }
    /* (#R212) the domain form of the same outlet — from the publisher string if it IS a host, else
       from the article's own URL */
    try{ const idx=_pubDomainIndex();
      for(const cand of [_hostKey(publisher), _hostKey(link)]){
        if(cand&&cand.length>=3&&idx[cand]) return { loc:idx[cand].loc, label:idx[cand].label, cjk:false }; } }catch(_){}
    /* (#R32) Non-AI publisher-location BOOST ("AIを用いない発信地解析を強化 / 位置不明のピンが多い"): a huge
       share of Google-News sources are LOCAL outlets whose name embeds their city/region/country
       ("Manila Bulletin", "Kashmir Observer", "Texas Tribune", "Nairobi News"…). When the curated dict
       misses, scan the publisher string against the place gazetteer and use the most specific match, so far
       fewer publisher pins land "unknown". Skip demonyms/orgs and very short terms to avoid false hits. */
    try{ if(typeof HOST.geoDB!=='undefined' && HOST.geoDB){ const db=HOST.geoDB;
      const best=bestPublisherPlace(db,publisher,_PT().termsOf,_PT().candidates(db,publisher));
      /* ⚠ (#R212) THE LABEL IS THE OUTLET, NOT THE PLACE ITS NAME CONTAINS. This branch found the
         New York Post by the words «New York» and then labelled the pin 「Source: New York」 — which
         reads as though a city were the publisher. The place decides WHERE; the publisher string is
         WHO, and it is the one the reader asked about. */
      if(best) return { loc:best.loc, label:publisher, place:(best.name&&(best.name[HOST.lang]||best.name.en))||'', cjk:false }; } }catch(_){}
    return null; }
  /* The per-term matchers, the scorer and the prefilter that decides which entries a headline can
     reach live in js/place-terms.js (one instance per page: its compile cache is what #R311 measured
     saving 73.7 % of the compiles across the five rebuilds of a boot). */
  /* made on first use, not at factory time: a factory body only DECLARES (tests/engine-app-shell-split-checks R169 #4) */
  let _pt=null;
  function _PT(){ return _pt||(_pt=makePlaceTerms()); }
  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {_DERU_GZ,_DERU_DEM,_ES_GZ,_ES_DEM}=IntMapTables;
  /* ── (#R208) hand the world rows to the locator a slice at a time ──────────────────────────────
     ⚠ A `function` DECLARATION, not a `const` arrow: rebuildGeoIndex() is defined above this point
     and calls it, and #R200 lost a whole boot to exactly that shape (a const initialised later is
     in its temporal dead zone for every earlier reader, and the failure is silent).
     Runs at most once — a second call while one is in flight is a no-op, because the only caller is
     re-entered by its own completion event. */
  let _sliceRunning=false, _sliceDone=false;
  function registerSlices(rows){
    if(_sliceRunning||_sliceDone) return;
    _sliceRunning=true;
    const NG=window.IntMapNewsGeo;

    /* ══ ⚠⚠ (#R231) A FIXED SLICE IS NOT A BUDGET, AND AN IDLE TIMEOUT IS NOT A PROMISE ═══════════
       「モバイル版がまだ劇的に遅い。もっと爆速に。地図のスクロール、ズームが困難」

       #R208 got the two hard parts right — this waits for the first idle AFTER the app can draw, and
       it yields with `requestIdleCallback` rather than a same-priority macrotask. What it did not
       have was a bound on the work done INSIDE one callback, and that is what the phone feels:

         · SLICE was 4,000 rows. RE-MEASURED on the current build: 107–121 ms per slice, ~338 ms in
           total for the phone gazetteer's 12,000 — every one of them a long task, three to five
           dropped frames each, on a thread the map is drawing on.
         · `{timeout:2000}` says "run me anyway after 2 s". A page that is busy for two seconds is a
           page the user is TOUCHING, so the timeout fired precisely into pinches and drags: the one
           moment the callback was written to stay out of.

       ⚠ THIS CHANGES NOTHING ANYONE CAN SEE. Not one pixel, not one string, not one setting — the
       same 12,000 rows are registered, in the same order, into the same index, for the same feature.
       All that changes is WHEN the thread is taken and for HOW LONG at a stretch. (The instruction
       for this round was 「見た目ゼロ変更のみ」; that is the whole reason the scheduling is where the
       work went.)

       Three things replace the two above:
         ① THE DEADLINE DECIDES THE BATCH, not a constant. `requestIdleCallback` hands the callback
            an IdleDeadline; rows go in 250 at a time (≈7 ms at the measured 27 µs/row) and the loop
            stops as soon as `timeRemaining()` is spent. A fast phone with a quiet frame does several
            batches in one callback; a slow one does one. Neither produces a long task.
         ② IT NEVER RUNS WHILE THE CAMERA IS MOVING. `movestart`/`moveend` are the renderer's own
            statement about that (js/geo-engine.js publishes both for either engine), and a callback
            that arrives mid-gesture now re-schedules itself instead of spending its budget.
         ③ THE TIMEOUT IS 20 s, NOT 2 s. A background index nobody has asked for should starve on a
            busy page — that is the correct outcome, not a failure. The ceiling only exists so a page
            that is somehow never idle still finishes eventually. */
    const BATCH=250;                     /* ≈7 ms of registration at the measured 27 µs/row */
    const SLACK=4;                       /* ms of the idle deadline to leave unspent */
    let moving=false;
    try{ const E=IntMapGeoEngine;
      E.events.on('movestart',()=>{ moving=true; }); E.events.on('moveend',()=>{ moving=false; });
    }catch(_){}
    const rIC=(typeof requestIdleCallback==='function')?requestIdleCallback:null;
    const yieldToBrowser=()=>new Promise(res=>{
      if(rIC){ rIC(()=>res(),{timeout:20000}); return; }
      setTimeout(res,0);
    });

    let at=0;
    function pump(deadline){
      if(moving){ schedule(); return; }                       /* the gesture owns the thread */
      const t0=(performance&&performance.now)?performance.now():0;
      const left=()=>{
        if(deadline&&typeof deadline.timeRemaining==='function') return deadline.timeRemaining()>SLACK;
        return (((performance&&performance.now)?performance.now():0)-t0)<8;   /* no rIC: one frame */
      };
      do{
        const end=Math.min(at+BATCH,rows.length);
        try{ NG.register(rows.slice(at,end).map(([type,terms,lng,lat,en,jp])=>
          ({ terms, lng, lat, type, name_en:en, name_jp:jp }))); }catch(_){}
        at=end;
      } while(at<rows.length && !moving && left());
      if(at<rows.length){ schedule(); return; }
      _sliceRunning=false; _sliceDone=true;
      try{ bus.emit('intmap-newsgeo-world-ready', {rows:rows.length}); }catch(_){}
    }
    function schedule(){
      if(rIC){ rIC(pump,{timeout:20000}); return; }
      setTimeout(()=>pump(null),50);
    }

    (async()=>{
      /* ⚠ (#R208) AND IT DOES NOT START DURING THE BOOT. Measured on an iPhone 13 profile, the boot
         spends 1,017 ms in seven long tasks; this is a background index for a pass that has not been
         asked for yet, so it waits for the first idle period AFTER the app can draw rather than
         competing for the one where the first frame is. `requestIdleCallback` alone was not enough —
         it fires during a boot too, because a boot has gaps. */
      await new Promise(res=>{
        const go=()=>yieldToBrowser().then(res);
        try{ if(IntMapGeoEngine&&IntMapGeoEngine.canDraw&&IntMapGeoEngine.canDraw()) return go(); }catch(_){}
        try{ IntMapGeoEngine.events.once('idle',go); }catch(_){ go(); return; }
        setTimeout(go,6000);                                  /* …and never wait for ever */
      });
      schedule();
    })();
  }

  /* Rebuild the flat geoDB + per-term matchers from geoRaw. Called after the
     Supabase geo_pins load (and on realtime updates). */
  function rebuildGeoIndex(){
    /* Merge the always-present built-in gazetteer (#11) with the Supabase geo_pins so news placement
       is strong even before/without server data. */
    const merged={};
    /* ⚠ (#R208) NOT `push(...src[type])`. Spreading an array into a call passes one ARGUMENT per
       element, and the engine's argument limit is a stack limit: at 15,048 world rows this was
       fine, and at 148,083 it throws `RangeError: Maximum call stack size exceeded` — from inside
       a `forEach`, asynchronously, with a minified frame and no mention of the gazetteer anywhere
       in the message. It surfaced two commits later as 「applyTheme re-entered itself」 in a Cesium
       spec that has nothing to do with either, because that is the test that watches for uncaught
       errors. A loop has no such limit and is what a growing table needs. */
    [HOST.BUILTIN_GAZETTEER, HOST.geoRaw].forEach(src=>{ for(const type in src){
      const dst=(merged[type]=merged[type]||[]), from=src[type]||[];
      for(let i=0;i<from.length;i++) dst.push(from[i]); } });
    /* (#R25/#28) MASSIVE coverage boost for the non-AI locator: auto-add EVERY country (+ its capital name)
       from the already-bundled countryStats — ~200 countries with real EN/JP names and a representative
       point. Curated cities/flashpoints still outrank these (higher TYPE_SCORE + lead-position bonus), so
       precision is unchanged; this just means almost any country/capital mention now places. */
    try{ if(typeof HOST.countryStats==='object'&&HOST.countryStats){ for(const code in HOST.countryStats){ const s=HOST.countryStats[code];
      if(!s||!s.latlng||s.latlng[0]==null||s.latlng[1]==null) continue;
      const terms=[]; if(s.nameEn) terms.push(s.nameEn); if(s.nameJp&&s.nameJp!==s.nameEn) terms.push(s.nameJp);
      if(s.capital&&String(s.capital).length>=4) terms.push(s.capital);
      if(!terms.length) continue;
      (merged.country=merged.country||[]).push({terms, loc:[s.latlng[1],s.latlng[0]], name:{en:s.nameEn||code, jp:s.nameJp||s.nameEn||code}}); } } }catch(_){}
    /* (#R27) demonyms join as low-confidence country entries (flagged so scoreGeo ranks them below a real
       place name) — coverage for "Ukrainian/Israeli/Iranian…" headlines that name no explicit place. */
    try{ for(const [dem,lng,lat,en,jp] of HOST._DEMONYM_GZ){ (merged.country=merged.country||[]).push({terms:[dem], loc:[lng,lat], name:{en,jp}, demonym:true}); } }catch(_){}
    /* (#R28) organizations / institutions / armed groups join as flagged org:true entries — docked below an
       explicit place (see scoreGeo) so they only place a story that names no explicit city/country. */
    try{ for(const [terms,lng,lat,en,jp] of HOST._ORG_GZ){ (merged.country=merged.country||[]).push({terms:terms.slice(), loc:[lng,lat], name:{en,jp}, org:true}); } }catch(_){}
    /* (#R39) German + Russian places (full DE exonyms / RU stems) and Russian demonyms. */
    try{ for(const [type,terms,lng,lat,en,jp] of _DERU_GZ){ (merged[type]=merged[type]||[]).push({terms:terms.slice(), loc:[lng,lat], name:{en,jp}}); } }catch(_){}
    try{ for(const [dem,lng,lat,en,jp] of _DERU_DEM){ (merged.country=merged.country||[]).push({terms:[dem], loc:[lng,lat], name:{en,jp}, demonym:true}); } }catch(_){}
    /* (#R40) Spanish exonyms + demonyms (same shape) — gives the non-AI locator full Spanish coverage. */
    try{ for(const [type,terms,lng,lat,en,jp] of _ES_GZ){ (merged[type]=merged[type]||[]).push({terms:terms.slice(), loc:[lng,lat], name:{en,jp}}); } }catch(_){}
    try{ for(const [dem,lng,lat,en,jp] of _ES_DEM){ (merged.country=merged.country||[]).push({terms:[dem], loc:[lng,lat], name:{en,jp}, demonym:true}); } }catch(_){}
    HOST.geoDB=Object.entries(merged).flatMap(([type,arr])=>arr.map(g=>({...g,type})));
    /* (#R161) hand the ADMIN-CURATED Supabase geo_pins to the NewsGeo engine too, so a place an
       operator added in admin.html is matchable by the primary locator and not only by the legacy
       fallback. Registered at a lower rank than the built-in gazetteer (curated rows add coverage,
       they never override a verified place) and de-duplicated inside register(), which matters
       because this function re-runs on every geo_pins realtime update. */
    try{ if(window.IntMapNewsGeo&&window.IntMapNewsGeo.register){
      const extra=[]; for(const type in HOST.geoRaw){ for(const g of (HOST.geoRaw[type]||[])){
        if(!g||!g.loc||!Array.isArray(g.terms)||!g.terms.length) continue;
        extra.push({ terms:g.terms, lng:g.loc[0], lat:g.loc[1], type, name_en:(g.name&&g.name.en)||g.terms[0], name_jp:(g.name&&g.name.jp)||'' }); } }
      if(extra.length) window.IntMapNewsGeo.register(extra);
    } }catch(_){}
    /* ══ (#R198) …and the WORLD rows, on the same seam, at the same rank ═════════════════════════
       「Gazetteerを今の10倍の網羅性に。」 data/gazetteer-world.json is fetched, not bundled (see
       js/gazetteer.js), so the first pass through here almost always runs without it and places
       exactly what it placed before. `warm()` starts the fetch and fires `intmap-gazetteer-world`
       when the rows land; this function is re-entered then, and register() is idempotent by
       construction (its REGISTERED signature set), so the second pass adds them once and a third
       adds nothing. Registered at rank 3 — below every curated entity — because the whole point is
       that coverage must not be able to move a place the curated table already knows. */
    try{ const GZ=window.IntMapGazetteer;
      if(GZ&&GZ.warm){
        /* ⚠ (#R620) THE MATCHABLE VIEW, NOT THE WHOLE LIST. `world()` now includes the rows whose
           name a curated table already carries — they were being deleted from the file, which made
           78 places above a million people invisible to every DATA reader of it. What the LOCATOR
           may see is unchanged: `worldMatchable()` withholds exactly those rows, so the curated
           coordinate still wins. This is the only place the world rows enter the matcher. */
        const w=GZ.worldMatchable&&GZ.worldMatchable();
        if(w===null){ if(!rebuildGeoIndex._worldHooked){ rebuildGeoIndex._worldHooked=true;
            try{ bus.once('intmap-gazetteer-world',()=>{ try{ rebuildGeoIndex(); }catch(_){} }); }catch(_){} } }
        /* ⚠ (first-impression) THE INDEX LISTENS FOR THE ROWS; IT NO LONGER SENDS FOR THEM. Building the index is
           a BOOT step (js/app-body.js runs this synchronously on a desktop), so the warm() that stood here fetched
           the whole 5,286,074 B world file — MEASURED, cold first visit at 1024×768 — on every first visit, for a
           locator that has no headline to place: news is not fetched until a reader asks for it (#R372,
           js/news-feed.js). The fetch now starts where the rows are first NEEDED — analyzeContext() below, i.e. the
           locator's first pass over real headlines, and the search box (js/app-body.js, js/search-geocode.js) —
           and the listener above re-enters here when they land, whoever asked. */
        else if(w&&w.length&&window.IntMapNewsGeo&&window.IntMapNewsGeo.register){
          /* ⚠ (#R208) IN SLICES, BECAUSE THERE ARE NOW 148,083 OF THEM. MEASURED at 3.7 ms per
             1,000 rows, one call is ~550 ms of unbroken main thread on a desktop and several times
             that on a phone — a long task in the middle of a news pass. The rows are handed over
             a slice at a time with a yield between, so no single task is long; `register()` is
             idempotent by construction (its REGISTERED signature set), so a slice that runs twice
             adds nothing, and a locate() that lands mid-way sees fewer places rather than wrong
             ones. `intmap-newsgeo-world-ready` fires when the last slice lands, for anything that
             wants to ask again with the whole tail present. */
          registerSlices(w);
        }
      } }catch(_){}
    /* longer keywords first → "Tel Aviv" wins over "Israel" (stable tiebreaker on equal scores).
       The key is computed once per entry instead of inside the comparator (the same numbers, so the
       same stable order — Math.max over an empty list is -Infinity there as here). */
    { const db=HOST.geoDB, ml=new Map();
      for(const g of db) ml.set(g,Math.max(...g.terms.map(t=>t.length)));
      db.sort((a,b)=>ml.get(b)-ml.get(a)); }
    /* ⚠ NO MATCHER IS COMPILED HERE ANY MORE. This line compiled every term of every entry
       (≈46,000 new RegExp pairs when the world gazetteer lands — MEASURED ≈0.55 s in one task on a
       phone at CPU ×4) for a scan that reaches a handful of them per headline. js/place-terms.js
       compiles an entry the first time a question reaches it, through a prefilter that cannot drop
       a hit (the reasoning is in its header). */
  }
  /* (the scoring model — title/description/type/context/position — is js/place-terms.js scoreGeo) */
  /* (#R107) COUNTRY-LEVEL FALLBACK for the non-AI locator ("more reliable and flawless"): when the gazetteer scored
     no specific place, anchor a country-level story to the country actually named (its polygon center) instead of a
     meaningless deterministic scatter point — so far fewer "location unknown" pins, and always a REAL, correct place.
     Purely ADDITIVE: it only runs when no subject was found, so it can never make an existing result worse. Built once
     from countryGeo (bbox centers + word-boundary name regexes), memoized; the display name follows the UI language. */
  let _cfIdx=null;
  function _cfBuild(){ try{ const cg=window.countryGeo; if(!cg||!cg.features||!cg.features.length) return null;
    const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); const idx=[];
    for(const f of cg.features){ if(!f.geometry) continue; const p=f.properties||{};
      let a=180,b=90,c=-180,d=-90; const scan=cs=>{ for(const x of cs){ if(typeof x[0]==='number'){ if(x[0]<a)a=x[0]; if(x[1]<b)b=x[1]; if(x[0]>c)c=x[0]; if(x[1]>d)d=x[1]; } else scan(x); } };
      try{ scan(f.geometry.coordinates); }catch(_){ continue; } if(!(c>=a&&d>=b)) continue;
      const names=[p.NAME_EN,p.ADMIN,p.NAME,p.name,p['name:en'],p.NAME_LONG,p.FORMAL_EN].filter(v=>v&&String(v).trim().length>=4);
      const uniq=[...new Set(names.map(v=>String(v).trim()))]; if(!uniq.length) continue;
      idx.push({ res:uniq.map(s=>new RegExp('\\b'+esc(s)+'\\b','i')), loc:[(a+c)/2,(b+d)/2], code:(f.id!=null?String(f.id):(p.__code||'')), en:(p.NAME_EN||p.ADMIN||p.NAME||p.name||''), len:Math.max.apply(null,uniq.map(s=>s.length)) }); }
    return idx.length?idx:null; }catch(_){ return null; } }
  function _countryFallback(hay){ try{ if(!_cfIdx) _cfIdx=_cfBuild(); if(!_cfIdx) return null;
    let best=null; for(const c of _cfIdx){ if(c.res.some(re=>re.test(hay))){ if(!best||c.len>best.len) best=c; } }
    if(!best) return null;
    let nm=best.en; try{ const s=(typeof HOST.countryStats!=='undefined')&&HOST.countryStats[best.code]; if(s){ nm=(s.name&&(s.name[HOST.lang]||s.name.en))||((HOST.lang==='jp'&&s.nameJp)?s.nameJp:s.nameEn)||s.nameEn||best.en; } }catch(_){}
    return { loc:best.loc, name:nm }; }catch(_){ return null; } }
  /* (#R161) NewsGeo kind → the place TYPE the rest of the app already speaks
     (R123 spreads duplicate pins differently for a country vs a city). */
  const _NG_KIND={ country:'country', admin1:'region', feature:'region', flashpoint:'flashpoint', city:'city', seat:'city', org:'city' };
  function analyzeContext(title,publisher,seed,desc){
    desc=desc||'';
    /* (#R416) the map band's text rule moved to js/map-typography.js, beside the code that already
       decides how wide that band comes out — the EVENT path could not reach it here, and filled the
       layer's field with '' instead (empty white pills). One rule, two callers. */
    const short=window.IntMapMapTypography.bandText(title);
    /* (first-impression) the locator's first pass is the first NEED for the world rows (see rebuildGeoIndex):
       ask for them here. warm() fetches once and never rejects, so every later pass is a property read; this
       pass places with the curated rows, and the index re-registers the world when they land. */
    try{ const GZ=window.IntMapGazetteer; if(GZ&&GZ.warm) GZ.warm(); }catch(_){}
    let subjectLoc=null, subjectName=null, subjectType=null, subjectConf=0;
    /* ---- (#R161) PRIMARY: the deterministic NewsGeo engine (js/newsgeo.js).
       It does what a plain gazetteer scan cannot — resolves same-name places from
       country/region cues, suppresses dateline ("Blinken in Washington … Gaza"),
       swallows traps ("Paris Hilton", "New York Times"), and boosts a city whose
       own country is also named. Falls through to the legacy scorer below when it
       declines to answer or the file did not load, so behaviour never regresses. */
    try{
      const NG=window.IntMapNewsGeo;
      if(NG&&NG.locate){
        const r=NG.locate(title,{desc,publisher,lang:HOST.lang});
        if(r&&isFinite(r.lng)&&isFinite(r.lat)){
          subjectLoc=[r.lng,r.lat];
          subjectName=(HOST.lang==='jp'?(r.name.jp||r.name.en):(r.name.en||r.name.jp))||null;
          subjectType=_NG_KIND[r.kind]||'city'; subjectConf=r.confidence||0;
        }
      }
    }catch(_){}
    /* ---- FALLBACK: the in-page gazetteer scorer (also the only path for the
       admin-curated geo_pins types the engine has no opinion about). ---- */
    if(!subjectLoc){
      const db=HOST.geoDB;
      const best=bestSubject(db,title,desc,_PT().termsOf,_PT().candidates(db,title,desc));
      /* name{} only carries en/jp — for de/ru/es fall back to English instead of
         `undefined`, which used to surface as a blank pin label. */
      if(best){ subjectLoc=best.loc; subjectName=best.name[HOST.lang]||best.name.en||best.name.jp||null; subjectType=best.type; }
    }
    /* (#R107) no gazetteer hit → try the country actually named (real location beats a random scatter). */
    if(!subjectLoc){ const cf=_countryFallback(title+' '+desc); if(cf){ subjectLoc=cf.loc; subjectName=cf.name; subjectType='country'; } }
    /* ---- Publisher HQ (expanded gazetteer, longest-key-first, word-boundary safe) ---- */
    const pm=matchPublisher(publisher,seed);   /* `seed` IS the article link (#R212) */
    const pubLoc=pm?pm.loc:null, pubName=pm?((IntMapLang.t(HOST.lang,'Source: ','発信: ','Quelle: ','Источник: ','Fuente: '))+pm.label):null;
    /* Remember title/publisher so the toggle/AI passes can re-seed fallbacks later */
    const res={ subjectLoc, subjectName, subjectType, subjectConf, pubLoc, pubName, short, _title:title, _pub:publisher };
    HOST.applyPinMode(res);
    return res;
  }
  return { analyzeContext, rebuildGeoIndex };
}
