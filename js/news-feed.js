/* ============================================================================
 *  IntMap · News feed: sources, fetch, cache and title translation  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.newsFeed=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  function startNews(){
    const feed=document.getElementById('live-news-feed'); HOST.clearMarkers(); feed.innerHTML=''; HOST.renderedCount=0;
    if(HOST.globalData.length===0){ feed.innerHTML=`<div class="empty-msg">${HOST.t('loading')}</div>`; return; }
    HOST.newsFiltered=HOST.computeFilteredNews();
    if(HOST.newsFiltered.length===0){ feed.innerHTML=`<div class="empty-msg">${HOST.t('noMatch')}</div>`; return; }
    /* Pin every filtered news item on the map IMMEDIATELY, even items not yet rendered in sidebar.
       This fixes "few pins on map despite many in sidebar". */
    HOST.newsFeatures=[];
    HOST.newsFiltered.forEach(item=>{
      if(item.analysis && item.analysis.loc){
        const fid='n_'+Math.random().toString(36).slice(2,10);
        const mappedStr = item.analysis.mapped===true?'true':(item.analysis.mapped==='publisher'?'publisher':'none');
        HOST.newsFeatures.push({type:'Feature',id:fid,geometry:{type:'Point',coordinates:item.analysis.loc},properties:{
          fid, mapped:mappedStr, ptype:item.analysis.ptype||'', title:item.title, name:item.analysis.name||'',
          short:item.analysis.short||'', publisher:item.publisher, link:item.link, pubDate:item.pubDate
        }});
      }
    });
    HOST._spreadDupNewsPins(HOST.newsFeatures);   /* (#R122) fan out pins sharing an anchor so each is individually clickable */
    if(_imCanDraw()) HOST.setupIntelLayers();
    /* (#R79b) don't paint pins for a hidden News window (they'd appear with no window controlling them) */
    /* (#R171) source data through IntMapGeoEngine — this file no longer names the renderer. */
    try{ const E=window.IntMapGeoEngine; if(E&&E.layers.hasSource('news-points')){ E.layers.setSourceData('news-points',{type:'FeatureCollection',features:HOST._wsNewsHidden()?[]:HOST.newsFeatures}); try{HOST.scheduleNewsDeclutter();}catch(_){} } }catch(_){}
    HOST.appendNewsBatch(); HOST.updateOcclusion();
    maybeAutoEnrich();
  }
  function maybeAutoEnrich(){
    /* (#R29) News location analysis now runs ENTIRELY server-side (refresh-news pre-AI-locates every
       en/jp article into current_news; the dictionary is the server's fallback). The browser never
       calls the AI for news geocoding anymore, so there is no client auto-enrich pass to run here.
       Kept as a no-op hook so existing callers (startNews) stay intact.
       (#R15) Titles are still translated ONLY on the explicit "Translate titles" button. */
  }
  /* ===== AI title translation (multi-language news mode) =====
     Foreign-language headlines (non-English in EN UI / non-Japanese in JP UI) are translated
     into the UI language by the AI, with the original language noted on the card. */
  const LANG_JP={German:'ドイツ語',French:'フランス語',Spanish:'スペイン語',Italian:'イタリア語',Portuguese:'ポルトガル語',Russian:'ロシア語',Arabic:'アラビア語',Chinese:'中国語',Korean:'韓国語',Japanese:'日本語',English:'英語',Dutch:'オランダ語',Turkish:'トルコ語',Hindi:'ヒンディー語',Persian:'ペルシャ語',Hebrew:'ヘブライ語',Ukrainian:'ウクライナ語',Polish:'ポーランド語',Swedish:'スウェーデン語',Greek:'ギリシャ語',Indonesian:'インドネシア語',Thai:'タイ語',Vietnamese:'ベトナム語'};
  function localizeLangName(en){ if(!en) return ''; return HOST.lang==='jp'?(LANG_JP[en]||en):en; }
  /* Update only the title cells of already-rendered cards (keeps scroll position). */
  function rerenderNewsFeedTitles(){
    (HOST.newsFiltered||[]).forEach(item=>{ const el=item._cardEl; if(el&&el.isConnected){ const tt=el.querySelector('.news-title'); if(tt) tt.innerHTML=HOST.newsTitleHTML(item); } });
  }
  let _translateBusy=false;
  async function aiTranslateTitles(){
    if(_translateBusy) return;
    if(!HOST.aiGate()) return;
    const target=window.IntMapLang.t(HOST.lang,'English','Japanese','German','Russian','Spanish');
    const todo=HOST.computeFilteredNews().filter(it=>it.analysis && !it.analysis._titleTried).slice(0,120);
    /* (#R9/#20) Spinner + progress + result toast — mirrors the AI-locate "detecting" UI so it's
       obvious the translation is running and when it finished. */
    const btn=document.getElementById('ai-translate-btn');
    if(!todo.length){ HOST.aiToast(HOST.t('aiTransNone')); return; }
    _translateBusy=true;
    HOST.aiSetBtnBusy(btn,true,HOST.t('aiTransBusy'));
    const sys=`You translate news headlines. The UI language is ${target}. For EACH numbered headline: if it is ALREADY written in ${target}, skip it entirely. Otherwise translate it into natural ${target}. Reply with ONLY a JSON array containing one object for each headline that NEEDED translation: {"i":<index number>,"lang":"<original language name in English, e.g. German>","t":"<the ${target} translation>"}. No commentary, no code fences.`;
    const BATCH=15; let done=0, hit=0;
    try{
      for(let i=0;i<todo.length;i+=BATCH){
        const chunk=todo.slice(i,i+BATCH);
        const list=chunk.map((it,k)=>`${k}. ${it.title}`).join('\n');
        let arr=null;
        try{ arr=await HOST.askAIJSON('Headlines:\n'+list, sys); }catch(e){ break; }
        if(Array.isArray(arr)) arr.forEach(o=>{
          if(!o||typeof o.i!=='number'||!o.t) return;
          const it=chunk[o.i]; if(!it||!it.analysis) return;
          it.analysis.titleTranslated=String(o.t);
          it.analysis.titleOrigLang=o.lang||'';
          it.analysis.titleOrigLangLabel=localizeLangName(o.lang||'');
          hit++;
        });
        chunk.forEach(it=>{ if(it.analysis) it.analysis._titleTried=true; });
        done+=chunk.length;
        HOST.aiSetBtnBusy(btn,true,HOST.t('aiTransBusy')+' '+done+'/'+todo.length);
        if(HOST.mode==='news'||HOST.mode==='saved') rerenderNewsFeedTitles();
      }
    } finally { _translateBusy=false; HOST.aiSetBtnBusy(btn,false); }
    HOST.aiToast(hit? HOST.t('aiTransDone').replace('{n}',hit) : HOST.t('aiTransNone'));
  }
  /* ===== Shared helper: strip HTML to plain text (used by the news ingest) ===== */
  function stripHTML(s){ const d=document.createElement('div'); d.innerHTML=s||''; return d.textContent||d.innerText||''; }
  function dateRangeQualifier(d){
    /* ±3 day window for that date */
    const start=new Date(d.getTime()-3*864e5), end=new Date(d.getTime()+3*864e5);
    return ` after:${HOST.ymdISO(start)} before:${HOST.ymdISO(end)}`;
  }
  /* (#R167) moved verbatim to js/tables.js — see Architecture.md §3.1. */
  const {NEWS_EDITIONS_MULTI,NEWS_COUNTRY_EDITIONS}=window.IntMapTables;
  function feedUrls(){
    /* (#R37) per-language Google News locale so DE/RU get German/Russian feeds (not the JP feed via the old else). */
    const p=({en:'hl=en-US&gl=US&ceid=US:en', jp:'hl=ja&gl=JP&ceid=JP:ja', de:'hl=de&gl=DE&ceid=DE:de', ru:'hl=ru&gl=RU&ceid=RU:ru', es:'hl=es&gl=ES&ceid=ES:es'})[HOST.lang]||'hl=en-US&gl=US&ceid=US:en';   /* (#R40) +Spanish news edition */
    if(HOST.newsDate){
      /* Google News search supports after:/before: operators. Headlines endpoints don't,
         so a date-filtered query goes through search. */
      const q=(HOST.activeSearchQuery||'world')+dateRangeQualifier(HOST.newsDate);
      return [`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${p}`];
    }
    if(HOST.activeSearchQuery) return[`https://news.google.com/rss/search?q=${encodeURIComponent(HOST.activeSearchQuery)}&${p}`];
    let base;
    if(HOST.newsLangMode==='multi'){
      /* (#R9 / #29) In multi-language mode show ONLY the languages ticked in Settings. The UI-language
         WORLD/BUSINESS base feeds are added only when the UI language is among the selections — so
         selecting e.g. just Russian no longer also leaks the English base feed. */
      base=[];
      const sel=(Array.isArray(HOST.newsLangs)&&HOST.newsLangs.length)?HOST.newsLangs:[HOST.lang];
      if(sel.includes(HOST.lang)) base.push(`https://news.google.com/rss/headlines/section/topic/WORLD?${p}`,`https://news.google.com/rss/headlines/section/topic/BUSINESS?${p}`);
      NEWS_EDITIONS_MULTI.filter(ed=>ed.lang!==HOST.lang && sel.includes(ed.lang)).forEach(ed=>base.push(`https://news.google.com/rss/headlines/section/topic/WORLD?${ed.q}`));
      if(!base.length) base.push(`https://news.google.com/rss/headlines/section/topic/WORLD?${p}`);  /* never fetch nothing */
    } else {
      base=[`https://news.google.com/rss/headlines/section/topic/WORLD?${p}`,`https://news.google.com/rss/headlines/section/topic/BUSINESS?${p}`];
    }
    /* National media editions chosen in Settings (#29) — multiple allowed. */
    try{ (window.imNewsCountries||[]).forEach(code=>{ const ed=NEWS_COUNTRY_EDITIONS[code]; if(ed && !base.some(u=>u.includes(ed))) base.push(`https://news.google.com/rss/headlines/section/topic/WORLD?${ed}`); }); }catch(_){}
    /* Pro "RU·CN local primary-source intel" overlay — pulls the Russian + Chinese editions. */
    if(window.proIntelOn && window.imIsPro && window.imIsPro()){
      ['hl=ru&gl=RU&ceid=RU:ru','hl=zh-CN&gl=CN&ceid=CN:zh-Hans'].forEach(ed=>{ if(!base.some(u=>u.includes(ed))) base.push(`https://news.google.com/rss/headlines/section/topic/WORLD?${ed}`); });
    }
    return base;
  }
  /* News cache → instant render on load/return, refreshed in the background. */
  function loadNewsCache(){
    try{ const c=JSON.parse(localStorage.getItem('intmap_news_cache')||'null');
      if(c && c.lang===HOST.lang && !HOST.activeSearchQuery && !HOST.newsDate && Array.isArray(c.data) && c.data.length && (Date.now()-c.ts < 6*3600e3)) return c.data; }catch(_){}
    return null;
  }
  function saveNewsCache(){
    try{ if(!HOST.activeSearchQuery && !HOST.newsDate) localStorage.setItem('intmap_news_cache', JSON.stringify({ts:Date.now(), lang:HOST.lang, data:HOST.globalData.slice(0,120)})); }catch(_){}
  }
  function buildItems(byLink){
    let uniq=[...byLink.values()].sort((a,b)=>HOST.parseDate(b.pubDate)-HOST.parseDate(a.pubDate));
    /* (#R107) TIME-TRAVEL: when a past instant is set, keep ONLY items actually dated near it. Google News ignores
       after:/before: for dates outside its recent window and returns TODAY's headlines, which then wrongly showed as
       "past" news ("時間を過去に設定しても最新ニュースが表示される"). Filtering by pubDate drops that leakage, and
       undated items too — so the feed shows genuine period news around that date, or NOTHING (never latest-as-past). */
    try{ if(typeof HOST.newsDate!=='undefined' && HOST.newsDate){ const t0=HOST.newsDate.getTime(), win=8*864e5;   /* ±8 days (the fetch query uses ±3; allow timezone slack) */
      uniq=uniq.filter(it=>{ const pd=HOST.parseDate(it.pubDate); return pd && isFinite(pd) && Math.abs(pd-t0)<=win; }); } }catch(_){}
    return uniq.slice(0,150).map(it=>{ const sp=it.title.split(' - '); const publisher=sp.length>1?sp.pop():window.IntMapLang.t(HOST.lang,'News','報道','Nachrichten','Новости','Noticias'); const title=sp.join(' - '); const desc=it.desc||''; return { title, publisher, link:it.link, pubDate:it.pubDate, desc, analysis:HOST.analyzeContext(title,publisher,it.link,desc) }; });
  }
  /* ===== Server-baked news (FAST PATH) =====
     The `refresh-news` Edge Function pre-fetches + pre-analyses the default feeds every
     ~20 min into `current_news`, so the browser just runs ONE SELECT (a few ms) instead of
     proxy-fetching 150 articles and scoring them against the whole gazetteer at startup.
     A server row already carries subject/publisher coords, so we skip analyzeContext entirely.
     Used only for the default feed in single-language mode; search / time-travel / multi-language
     keep the live-RSS path below (the server only bakes the WORLD+BUSINESS UI-language editions). */
  /* (#R124) detect whether a subject NAME is a whole COUNTRY (vs a city / region). The default news feed comes from
     the server, which carries no subject_type, so a "USA"-classified cluster had an EMPTY ptype and relied on a
     fragile bbox-centre heuristic (Alaska skews the US bbox north → never detected as country-level → pins stayed
     clustered instead of spreading across the country). Deriving the type from the name makes the R123 region-aware
     spread actually fire for real pins. */
  let _ctryNameSet=null;
  function _isCountrySubject(nm){ if(!nm) return false;
    if(!_ctryNameSet){ _ctryNameSet=new Set();
      try{ if(typeof HOST.countryStats==='object'&&HOST.countryStats){ for(const cd in HOST.countryStats){ const s=HOST.countryStats[cd]; if(!s) continue; [s.nameEn,s.nameJp].forEach(n=>{ if(n) _ctryNameSet.add(String(n).toLowerCase().trim().replace(/^the\s+/,'')); }); } } }catch(_){}
      ['usa','u.s.','u.s.a.','us','america','united states','united states of america','uk','u.k.','britain','great britain','south korea','north korea','russia','uae','drc','dr congo','czechia','ivory coast','burma','swaziland','turkey','türkiye','holland'].forEach(a=>_ctryNameSet.add(a)); }
    const k=String(nm).toLowerCase().trim().replace(/^the\s+/,'').replace(/\s+\(.*\)$/,'');
    return _ctryNameSet.has(k); }
  function serverRowToItem(r){
    const subjectLoc=(r.subject_lng!=null&&r.subject_lat!=null)?[r.subject_lng,r.subject_lat]:null;
    const pubLoc=(r.pub_lng!=null&&r.pub_lat!=null)?[r.pub_lng,r.pub_lat]:null;
    const subjectName=HOST.lang==='jp'?(r.subject_name_jp||r.subject_name_en):(r.subject_name_en||r.subject_name_jp);
    const pubName=r.pub_label?((window.IntMapLang.t(HOST.lang,'Source: ','発信: ','Quelle: ','Источник: ','Fuente: '))+r.pub_label):null;
    const short=HOST.lang==='jp'?(r.short_jp||r.short_en||''):(r.short_en||r.short_jp||'');
    const subjectType=r.subject_type||((_isCountrySubject(r.subject_name_en)||_isCountrySubject(subjectName))?'country':'');   /* (#R124) derive country-type from the name when the server omits it */
    const analysis={ subjectLoc, subjectName, subjectType, pubLoc, pubName, short, _title:r.title, _pub:r.publisher||'' };
    HOST.applyPinMode(analysis);   /* sets loc/name/mapped for the current Subject/Publisher toggle */
    return { title:r.title, publisher:r.publisher||'', link:r.link, pubDate:r.pub_date||'', desc:r.description||'', analysis };
  }
  async function loadNewsFromSupabase(){
    if(!HOST.DB || HOST.activeSearchQuery || HOST.newsDate || HOST.newsLangMode==='multi') return false;
    try{
      const { data, error } = await HOST.DB.from('current_news')
        .select('title,publisher,link,pub_date,description,subject_lng,subject_lat,subject_name_en,subject_name_jp,pub_lng,pub_lat,pub_label,short_en,short_jp')
        .eq('lang',HOST.lang).order('pub_date',{ascending:false}).limit(150);
      if(error) throw error;
      if(!data||!data.length) return false;          /* not seeded yet → fall through to live RSS */
      HOST.globalData=data.map(serverRowToItem);
      saveNewsCache();
      if(HOST.mode==='news'||HOST.mode==='saved') startNews();
      return true;
    }catch(e){ console.warn('[IntMap] current_news unavailable, using live RSS:', e&&e.message); return false; }
  }
  /* ══ ⚠⚠ (#R372) NOTHING IS FETCHED FOR A READER WHO HAS NOT ASKED FOR NEWS ═══════════════════
     `js/lazy-modules.js` and docs/NEWS-EVENTS.md §12 both promise that the Event module does not
     arrive until the News surface is opened. It did. `js/app-body.js` called this on boot, and the
     branch below reached `need('newsEvents')` unconditionally, so the chunk came down on every cold
     load — measured by tests/r209 ①, whose whole subject is «nothing is fetched without a gesture
     except the Atlas kernel». The declaration is the one that was right, so the boot call and the
     three-minute timer now say `{background:true}` and stop here.
     ⚠ MOVING THE need() CALL ALONE WOULD HAVE COST MORE THAN IT SAVED. The Event branch RETURNS on
     success, so skipping it does not skip the work — it falls through to the RSS path, which is the
     self-relay plus four public proxies fired together, ~50 requests, for a reader who never opened
     the News tab. The boundary that makes both true is «has anybody asked», not «which path».
     ⚠ IT IS NOT A FEATURE FLAG. Every real entry point — setMode('news'/'saved'), the search box,
     an Atlas news question, the bottom ticker, the workspace News window, a country/language change
     — calls this with no argument and is therefore a gesture; the first one lifts the latch and the
     timer resumes refreshing behind it. A reader whose saved mode IS the News surface has already
     asked, so the surface check below covers a cold start straight into news.
     ⚠ The cache is still restored, so the gesture that does come has something to paint at once. */
  let _asked=false;
  async function fetchData(opts){
    const feed=document.getElementById('live-news-feed');
    if(opts&&opts.background&&!_asked&&HOST.mode!=='news'&&HOST.mode!=='saved'){
      if(HOST.globalData.length===0){ const c=loadNewsCache(); if(c&&c.length) HOST.globalData=c; }
      return;
    }
    _asked=true;
    /* 1) Instant: show cached headlines immediately while fresh ones load. */
    if(HOST.globalData.length===0){ const cached=loadNewsCache(); if(cached&&cached.length){ HOST.globalData=cached; if(HOST.mode==='news'||HOST.mode==='saved') startNews(); } }
    if((HOST.mode==='news'||HOST.mode==='saved')&&feed&&HOST.globalData.length===0) feed.innerHTML=`<div class="empty-msg">${HOST.t('loading')}</div>`;
    /* 1a) (#R386) EVENT MODE — 記事ではなく**出来事**の一覧。
       ⚠ **搭載条件を先に見て、満たさないなら取りに行かない。** Event 経路が答えを持つのは
         「既定のフィード」だけである——検索・時間旅行（過去の日付）・多言語モードは、
         収集が英語のみ・保持が 72 時間・カテゴリが Event 単位、という前提の外にある
         （docs/NEWS-EVENTS.md §2 の決定 2 と §8）。そこは記事モードのままにする。
       ⚠ **落ちる先がある。** `load()` が false（DB が無い・表が空・失敗）なら下の記事経路へ。
         黙って空の一覧を見せない——それが #R162/#R200/#R205/#R208 の「機能が静かに
         存在しなくなる」形である。 */
    if(HOST.NEWS_EVENT_MODE && !HOST.activeSearchQuery && !HOST.newsDate && HOST.newsLangMode!=='multi'){
      try{
        const okLazy = await window.IntMapLazy.need('newsEvents');
        if(okLazy && window.IntMapNewsEvents && await window.IntMapNewsEvents.load()){
          /* ⚠ 一覧を入れるのは**ここだけ**。`HOST.globalData` の書き手はこのファイル 1 つで、
             出来事のモジュールは項目を**作る**だけである（#R165 の RW 契約）。 */
          HOST.globalData = window.IntMapNewsEvents.loaded();
          window.IntMapNewsEvents.renderChips();
          if(HOST.mode==='news'||HOST.mode==='saved') startNews();
          return;
        }
      }catch(e){ console.warn('[IntMap] event mode unavailable, using the article feed:', e&&e.message); }
      try{ window.IntMapNewsEvents && window.IntMapNewsEvents.hideChips(); }catch(_){}
    }
    /* 1b) FAST PATH: pre-analyzed news from Supabase. If it returns rows we're done — no client scoring.
       (#R40) TEMPORARILY DISABLED via USE_SERVER_NEWS — always fall through to the client non-AI locator. */
    if(HOST.USE_SERVER_NEWS && await loadNewsFromSupabase()) return;
    /* 2) FALLBACK: live RSS via CORS proxies + client-side analysis (function not deployed, or search/time-travel/multi-lang). */
    const parser=new DOMParser(); const byLink=new Map(); let any=false;
    const ingest=(txt)=>{
      if(!txt) return;
      const xml=parser.parseFromString(txt,'text/xml');
      xml.querySelectorAll('item, entry').forEach(it=>{
        const le=it.querySelector('link'); const link=(le&&(le.textContent||le.getAttribute('href')))||'';
        if(!link||byLink.has(link))return;
        /* RSS <description>, else Atom <summary>/<content>; HTML stripped to plain text for analysis. */
        const descNode=it.querySelector('description')||it.querySelector('summary')||it.querySelector('content');
        /* Google News packs each related article as <a>headline</a><font>publisher</font>.
           Drop the <font> publisher names first — otherwise "The Washington Post" etc. leak
           false city matches ("Washington") into the scorer. The <a> headline text is kept. */
        const descHtml=(descNode?.textContent||'').replace(/<font\b[^>]*>[\s\S]*?<\/font>/gi,' ');
        byLink.set(link,{
          title:it.querySelector('title')?.textContent||'',
          link,
          pubDate:it.querySelector('pubDate, published, updated')?.textContent||'',
          desc:stripHTML(descHtml)
        });
      });
      if(byLink.size){ HOST.globalData=buildItems(byLink); any=true; if(HOST.mode==='news'||HOST.mode==='saved') startNews(); }
    };
    try{
      await Promise.all(feedUrls().map(async u=>{ try{ ingest(await HOST.fetchViaProxy(u)); }catch(_){} }));
      if(!any && HOST.globalData.length===0) throw new Error('no items');
      if(any) saveNewsCache();
    }catch(e){ if(HOST.globalData.length===0&&feed&&(HOST.mode==='news'||HOST.mode==='saved')) feed.innerHTML=`<div class="empty-msg" style="color:var(--threat-unmapped);">${HOST.t('networkError')}</div>`; console.warn('fetchData failed:',e); }
  }
  return { aiTranslateTitles, fetchData, loadNewsFromSupabase, startNews };
};
