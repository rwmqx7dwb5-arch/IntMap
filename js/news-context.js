/* ============================================================================
 *  IntMap · News article → place/publisher resolution  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.newsContext=function(HOST){
  function matchPublisher(publisher){ if(!publisher) return null;
    for(const m of HOST._pubMatchers){ if(m.cjk?publisher.includes(m.label):m.re.test(publisher)) return m; }
    /* (#R32) Non-AI publisher-location BOOST ("AIを用いない発信地解析を強化 / 位置不明のピンが多い"): a huge
       share of Google-News sources are LOCAL outlets whose name embeds their city/region/country
       ("Manila Bulletin", "Kashmir Observer", "Texas Tribune", "Nairobi News"…). When the curated dict
       misses, scan the publisher string against the place gazetteer and use the most specific match, so far
       fewer publisher pins land "unknown". Skip demonyms/orgs and very short terms to avoid false hits. */
    try{ if(typeof HOST.geoDB!=='undefined' && HOST.geoDB){ let best=null,bestLen=0,bestLocal=-1;
      for(const g of HOST.geoDB){ if(g.demonym||g.org||!g._terms) continue;
        for(const t of g._terms){ const term=t.term; if(!term||term.length<4) continue;
          const hit = t.jp ? publisher.includes(term) : (t.matchRe&&t.matchRe.test(publisher));
          if(hit){ const loc=(typeof TYPE_LOCAL!=='undefined'?(TYPE_LOCAL[g.type]||0):0);
            if(term.length>bestLen || (term.length===bestLen && loc>bestLocal)){ best=g; bestLen=term.length; bestLocal=loc; } } } }
      if(best) return { loc:best.loc, label:(best.name&&(best.name[HOST.lang]||best.name.en))||'', cjk:false }; } }catch(_){}
    return null; }
  /* Precompile per-term matchers once (runs ≈290 entries × N news items on every refresh):
       jp      — CJK terms match by substring; Latin terms match on word boundaries
       matchRe — word-boundary matcher for Latin terms
       ctxRe   — "is this place governed by a locational preposition / particle?"
                 EN: in/at/to/from/near/into <place>   ·   JP: <place>で/へ/に/を/から */
  function isCJKTerm(term){ return /[　-鿿]/.test(term); }
  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {_DERU_GZ,_DERU_DEM,_ES_GZ,_ES_DEM}=window.IntMapTables;
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
    const NG=window.IntMapNewsGeo, SLICE=4000;
    /* ⚠ (#R208) THE YIELD IS `requestIdleCallback`, NOT A BARE MACROTASK. The first version used
       `scheduler.yield()` / `setTimeout(0)`, which hands the thread back at the SAME priority — so
       37 slices of registration interleaved with the app's own start-up timers and won some of the
       races. MEASURED: tests/r168.spec.js ②, which clicks Countries 1.2 s after boot and reads the
       feed, got the live list where its stub should have been. Idle time is what this work deserves:
       it is a background index for a feature nobody has asked for yet, and nothing waits on it.
       The 2 s timeout keeps it from starving on a busy page; a browser without rIC gets a
       macrotask, which is still not a microtask (that would run all 148,083 in one task). */
    const yieldToBrowser=()=>new Promise(res=>{
      try{ if(typeof requestIdleCallback==='function'){ requestIdleCallback(()=>res(),{timeout:2000}); return; } }catch(_){}
      setTimeout(res,0);
    });
    (async()=>{
      /* ⚠ (#R208) AND IT DOES NOT START DURING THE BOOT. Measured on an iPhone 13 profile, the boot
         spends 1,017 ms in seven long tasks; this is a background index for a pass that has not been
         asked for yet, so it waits for the first idle period AFTER the app can draw rather than
         competing for the one where the first frame is. `requestIdleCallback` alone was not enough —
         it fires during a boot too, because a boot has gaps. */
      await new Promise(res=>{
        const go=()=>yieldToBrowser().then(res);
        try{ if(window.IntMapGeoEngine&&window.IntMapGeoEngine.canDraw&&window.IntMapGeoEngine.canDraw()) return go(); }catch(_){}
        try{ window.IntMapGeoEngine.events.once('idle',go); }catch(_){ go(); return; }
        setTimeout(go,6000);                                  /* …and never wait for ever */
      });
      for(let i=0;i<rows.length;i+=SLICE){
        try{ NG.register(rows.slice(i,i+SLICE).map(([type,terms,lng,lat,en,jp])=>
          ({ terms, lng, lat, type, name_en:en, name_jp:jp }))); }catch(_){}
        if(i+SLICE<rows.length) await yieldToBrowser();
      }
      _sliceRunning=false; _sliceDone=true;
      try{ window.dispatchEvent(new CustomEvent('intmap-newsgeo-world-ready',{detail:{rows:rows.length}})); }catch(_){}
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
        const w=GZ.world&&GZ.world();
        if(w===null){ if(!rebuildGeoIndex._worldHooked){ rebuildGeoIndex._worldHooked=true;
            try{ window.addEventListener('intmap-gazetteer-world',()=>{ try{ rebuildGeoIndex(); }catch(_){} },{once:true}); }catch(_){} }
          GZ.warm(); }
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
    /* longer keywords first → "Tel Aviv" wins over "Israel" (stable tiebreaker on equal scores) */
    HOST.geoDB.sort((a,b)=>Math.max(...b.terms.map(t=>t.length)) - Math.max(...a.terms.map(t=>t.length)));
    HOST.geoDB.forEach(g=>{
      g._terms=g.terms.map(term=>{
        const jp=isCJKTerm(term), cyr=/[Ѐ-ӿ]/.test(term), esc=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        /* (#R39) Cyrillic/Russian path: JS `\b` word-boundaries don't fire around Cyrillic (it isn't `\w`),
           AND Russian inflects heavily — so match the supplied STEM plus up to 4 trailing Cyrillic letters,
           bounded by a non-Cyrillic-letter on the left (a consuming prefix, not lookbehind, for old-Safari
           safety). e.g. stem «Москв» → Москва/Москве/Москвы/Москву; «Росси» → России/Россию. */
        if(cyr){ return { term, jp:false, cyr:true,
          matchRe: new RegExp('(?:^|[^А-Яа-яЁёІіЇїЄє])'+esc+'[а-яёіїєa-z]{0,4}','i'),
          ctxRe:   new RegExp('(?:в|во|на|из|под|у|около)\\s+'+esc,'i') }; }
        return { term, jp,
          matchRe: jp?null:new RegExp(`\\b${esc}\\b`,'i'),
          ctxRe:   jp?new RegExp(`${esc}(?:で|へ|に|を|から|では)`)
                     :new RegExp(`\\b(?:in|at|to|from|near|into)\\s+${esc}\\b`,'i') };
      });
    });
  }
  /* ===== Scoring model (replaces the old "first geo term wins" loop) =====
     Every geo entry is scored over the title + description; the highest score is the Subject.
        title hit          +10   strong signal — the headline names the place
        description hit     +3    supporting signal from the article snippet
        type "flashpoint"   +5    conflict zone / chokepoint → high news relevance
        type "city"         +2    precise locality
        locational context  +4    "in Gaza" / "ガザで" → the place is the story's setting
     Ties break toward the more local type (flashpoint > city > country > region). */
  const TYPE_SCORE={ flashpoint:5, city:2, country:0, region:0 };
  const TYPE_LOCAL={ flashpoint:4, city:3, country:2, region:1 };
  function scoreGeo(g,title,desc){
    let titleHit=false, descHit=false, ctx=false, firstIdx=Infinity;
    for(const t of g._terms){
      if(t.jp){ const i=title.indexOf(t.term); if(i>=0){ titleHit=true; if(i<firstIdx) firstIdx=i; if(!ctx&&t.ctxRe.test(title)) ctx=true; } }
      else { const i=title.search(t.matchRe); if(i>=0){ titleHit=true; if(i<firstIdx) firstIdx=i; if(!ctx&&t.ctxRe.test(title)) ctx=true; } }
      if(desc&&(t.jp?desc.includes(t.term):t.matchRe.test(desc))){ descHit=true; if(!ctx&&t.ctxRe.test(desc)) ctx=true; }
    }
    if(!titleHit&&!descHit) return 0;
    /* (#R25/#28) Lead-subject bonus: a place named EARLY in the headline is much more likely to be what the
       story is about (e.g. "Kyiv strikes …" → Kyiv, not a country mentioned at the end). Up to +3. */
    const tl=title.length||1; const posBonus = titleHit ? Math.max(0, 3-Math.floor((Math.min(firstIdx,tl)/tl)*4)) : 0;
    /* (#R27) Corroboration bonus: a place named in BOTH the title AND the description is a stronger subject
       signal (+2). Demonym entries ("Ukrainian"…) are docked 3 so an explicit place name always outranks
       them — they only win when nothing more specific matched, preserving precision while adding coverage. */
    const corro = (titleHit&&descHit) ? 2 : 0;
    /* (#R28) demonyms AND organizations/groups are docked so an explicit place name always outranks them
       (an "Ukrainian"/"Hamas"/"NATO" mention only places a story that names no explicit city/country). */
    const demPen = (g.demonym||g.org) ? 3 : 0;
    return (titleHit?10:0)+(descHit?3:0)+(TYPE_SCORE[g.type]||0)+(ctx?4:0)+posBonus+corro-demPen;
  }
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
    const short=HOST.lang==='jp'?(title.length>20?title.slice(0,20)+'…':title):(title.split(' ').slice(0,5).join(' ')+'…');
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
      let best=null, bestScore=0;
      for(const g of HOST.geoDB){
        const s=scoreGeo(g,title,desc);
        if(s<=0) continue;
        if(s>bestScore || (s===bestScore && (!best||(TYPE_LOCAL[g.type]||0)>(TYPE_LOCAL[best.type]||0)))){ best=g; bestScore=s; }
      }
      /* name{} only carries en/jp — for de/ru/es fall back to English instead of
         `undefined`, which used to surface as a blank pin label. */
      if(best){ subjectLoc=best.loc; subjectName=best.name[HOST.lang]||best.name.en||best.name.jp||null; subjectType=best.type; }
    }
    /* (#R107) no gazetteer hit → try the country actually named (real location beats a random scatter). */
    if(!subjectLoc){ const cf=_countryFallback(title+' '+desc); if(cf){ subjectLoc=cf.loc; subjectName=cf.name; subjectType='country'; } }
    /* ---- Publisher HQ (expanded gazetteer, longest-key-first, word-boundary safe) ---- */
    const pm=matchPublisher(publisher);
    const pubLoc=pm?pm.loc:null, pubName=pm?((HOST.lang==='jp'?'発信: ':HOST.lang==='de'?'Quelle: ':HOST.lang==='ru'?'Источник: ':HOST.lang==='es'?'Fuente: ':'Source: ')+pm.label):null;
    /* Remember title/publisher so the toggle/AI passes can re-seed fallbacks later */
    const res={ subjectLoc, subjectName, subjectType, subjectConf, pubLoc, pubName, short, _title:title, _pub:publisher };
    HOST.applyPinMode(res);
    return res;
  }
  return { analyzeContext, rebuildGeoIndex };
};
