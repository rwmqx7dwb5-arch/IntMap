/* ============================================================================
 *  IntMap · In-sidebar article reader  (#R169)
 * ----------------------------------------------------------------------------
 *  Moved VERBATIM out of the index.html DOMContentLoaded closure (Architecture.md §3.1).
 *  Every statement here is a DECLARATION — the factory runs no app code, so it can be
 *  instantiated with the other #R168/#R169 factories right after `map` exists.
 *  The only edit to the moved text is that free references to closure variables became
 *  HOST.<member> reads/writes.
 *
 *  FINDING (#R169), recorded rather than silently "fixed": nothing calls openArticleInSidebar().
 *  #R11 ("revert Read->external") pointed the news card's Read button back at the original site, and
 *  the in-sidebar reader has been unreachable ever since — the chain openArticleInSidebar ->
 *  fetchReadable -> renderReader -> IM_NEWS_UI.renderReaderMode has no live entry point. Nothing here
 *  is deleted and nothing is re-wired: that is a product decision, not a refactoring one. The code is
 *  moved out of index.html unchanged, with its single entry point still exported (so index.html keeps
 *  exactly the declared-but-uncalled function it had before), and the finding is written up in
 *  DEV-NOTES R169 for a decision: re-wire the Read button to it, or delete the feature.
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.articleReader=function(HOST){
  const READER_NOISE=new Set(['edit','[edit]','skip to content','watch live','sign in','log in','menu','advertisement','home','news','sport','business','technology','more','share','save','reuters','associated press','follow us','related topics','watch','listen']);
  function cleanReaderMarkdown(md){
    let firstImg=''; let text=md||'';
    const im=text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/);
    if(im) firstImg=im[1];
    text=text.replace(/```[\s\S]*?```/g,' ');                 /* code fences */
    text=text.replace(/`([^`]+)`/g,'$1');                     /* inline code */
    text=text.replace(/!\[[^\]]*\]\([^)]*\)/g,'');            /* strip images */
    text=text.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1');         /* links -> text */
    text=text.replace(/\\([\\_*\[\]()#~`>+.!-])/g,'$1');      /* unescape md */
    text=text.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/__([^_]+)__/g,'$1'); /* bold */
    text=text.replace(/\*([^*]+)\*/g,'$1');                   /* italic */
    const lines=text.split(/\n/); const blocks=[]; let buf=[];
    const isNoise=s=>READER_NOISE.has(s.toLowerCase().replace(/^[•§]\s*/,'').trim());
    const flush=()=>{ if(buf.length){ const p=buf.join(' ').replace(/\s+/g,' ').trim(); if(p&&p.length>1&&!isNoise(p)) blocks.push({t:'p',v:p}); buf=[]; } };
    for(const raw of lines){
      const line=raw.replace(/\s+$/,'');
      if(/^\s*#{1,6}\s+/.test(line)){ flush(); const h=line.replace(/^\s*#{1,6}\s+/,'').trim(); if(h&&!isNoise(h)) blocks.push({t:'h',v:h}); continue; }
      if(/^\s*>\s?/.test(line)){ flush(); const q=line.replace(/^\s*>\s?/,'').trim(); if(q&&!isNoise(q)) buf.push(q); continue; }
      if(/^\s*[-*+]\s+/.test(line)){ flush(); const li=line.replace(/^\s*[-*+]\s+/,'').trim(); if(li.length>=30&&!isNoise(li)) blocks.push({t:'p',v:'• '+li}); continue; }
      if(line.trim()===''){ flush(); continue; }
      if(/^[=*_\-|>#`~]{1,}$/.test(line.trim())) continue;   /* skip rule/noise lines */
      buf.push(line.trim());
    }
    flush();
    return {hero:firstImg, blocks};
  }
  async function fetchReadable(item){
    /* Strategy 1: r.jina.ai reader — clean article text, CORS-friendly (works from file://). */
    try{
      const ctrl=new AbortController(); const to=setTimeout(()=>ctrl.abort(),12000);
      const r=await fetch('https://r.jina.ai/'+item.link,{signal:ctrl.signal});
      clearTimeout(to);
      if(r.ok){
        let txt=await r.text();
        if(txt&&txt.length>200){
          const mc=txt.indexOf('Markdown Content:');
          if(mc>=0) txt=txt.slice(mc+'Markdown Content:'.length);
          const parsed=cleanReaderMarkdown(txt);
          if(parsed.blocks.length>=2) return {blocks:parsed.blocks, hero:parsed.hero, ok:true};
        }
      }
    }catch(_){}
    /* Strategy 2: proxy raw HTML -> extract <article>/<p> text or og:description. */
    try{
      const html=await HOST.fetchViaProxy(item.link);
      if(html){
        const doc=new DOMParser().parseFromString(html,'text/html');
        let hero=''; const ogi=doc.querySelector('meta[property="og:image"]'); if(ogi) hero=ogi.getAttribute('content')||'';
        const scope=doc.querySelector('article')||doc.querySelector('main')||doc.body;
        const ps=[...scope.querySelectorAll('p')].map(p=>p.textContent.trim()).filter(t=>t.length>40);
        if(ps.length>=2) return {blocks:ps.slice(0,50).map(v=>({t:'p',v})), hero, ok:true};
        const desc=doc.querySelector('meta[property="og:description"],meta[name="description"]');
        if(desc) return {blocks:[{t:'p',v:desc.getAttribute('content')||''}], hero, ok:false};
      }
    }catch(_){}
    return {blocks:[], hero:'', ok:false};
  }
  /* ══ (#R435) ENTERING THE READING SURFACE — ONE SEQUENCE, BOTH READERS ═══════════════════════
     `#news-reader-pane` is the app's ONE reading surface: this file draws the article in it and
     js/news-events.js draws the Event detail in it (docs/NEWS-EVENTS.md §9「同じ News surface 内で」).
     Until this round only the article reader ran the sequence below and the Event detail ran two
     lines of it, so the detail opened UNDERNEATH the list's own chrome — tab bar, search box,
     scope + category chips — which is the reported 「デザインが浮いている」: a reading view wedged
     into the strip left over by a list that is no longer there.
     ⚠ AND ON A PHONE IT OPENED WHEREVER THE SHEET HAPPENED TO BE. MEASURED (390×780, sheet at the
       peek detent): the detail's back button landed at y=866 in a 780-px viewport. The reported
       「左上に出る戻るボタンが見えない」 is the button being off the bottom of the screen — not a colour.
     ⚠ EVERY ELEMENT HIDDEN HERE IS PUT BACK BY `closeReaderPane()` (js/app-body.js). The two are a
       pair: an element added to one has to be added to the other, or the app keeps a hidden row. */
  /* ⚠⚠ (#R430) THE `#news-pin-toggle` HIDE IS GONE WITH THAT ID — the pin-mode segment moved into
     the shared `#news-filter-toggle` row in Round 5, so the lookup had been returning null ever since.
     #R430 declined to re-point it at `#news-filter-toggle` for a reason it wrote down: that row also
     carries All/★Saved, and hiding it would have been NEW behaviour invented for a chain that had had
     no caller since #R11.
     ⚠⚠⚠ (#R435) THAT REASON HAS EXPIRED, AND THE ROW IS NOW HIDDEN ON PURPOSE. This pane has a live
       caller — the Event detail — and leaving the list's scope + category chips above a reading view is
       exactly the reported 「デザインが浮いている」: a reader wedged into the strip left over by a list
       that is no longer on screen (measured: 42 + 44 + 27 px of list chrome still standing). It is not
       invented behaviour any more; it is what the one reading surface has to do to be one. */
  function enterReaderPane(){
    /* (#R160) reveal the sidebar to show the reader. The sidebar overlays a fixed full-width map, so this
       can't move the map — just drop `collapsed` and let the search-pill layout recompute; no anchor, no resize. */
    try{ const _sb=document.getElementById('sidebar'); if(_sb&&_sb.classList.contains('collapsed')){ _sb.classList.remove('collapsed'); window.dispatchEvent(new Event('intmap-sidebar-resize')); } }catch(_){}
    try{ if(window.matchMedia('(max-width:768px)').matches && window.__setDetent) window.__setDetent('full'); }catch(_){}
    const cp=document.querySelector('.control-panel'); if(cp) cp.style.display='none';
    /* ⚠ `sidebar-search-bar` by ID, not `.search-bar` (see the renderUI note) — #countries-search-bar shares the class. */
    ['sidebar-search-bar','news-filter-toggle','ai-geocode-row',
     'live-news-feed','info-dashboard','community-feed'].forEach(id=>{ const e=document.getElementById(id); if(e) e.style.display='none'; });
    const pane=document.getElementById('news-reader-pane'); if(pane) pane.style.display='flex';
    /* ⚠ (#R435) the ONE switch that says «something is being read». Workspace mode's own layout CSS
       (js/workspace.js) forces the News window's list visible with `!important`, so an inline
       display:none cannot reach it — it reads this class instead of keeping a second copy of the rule. */
    try{ document.body.classList.add('im-reading'); }catch(_){}
    return pane;
  }
  function openArticleInSidebar(item){
    HOST.readerOpen=true; HOST.readerCurrent=item;
    /* (#R80) vision §2 — Atlas must know the ARTICLE the user is reading right now (not just that the News tab is
       open), so follow-ups like "この記事について詳しく"/"translate this"/"背景は？"/"where did this happen" resolve.
       globalData is closure-scoped, so bridge the open article onto window (same pattern as window._imLayerDates). */
    try{ const _a=(item&&item.analysis)||{}; window._imReader={ open:true, title:item&&item.title||'', publisher:item&&item.publisher||'', link:item&&item.link||'', pubDate:item&&item.pubDate||'', loc:(_a.loc&&isFinite(_a.loc[0]))?[_a.loc[0],_a.loc[1]]:null, place:_a.name||'' }; }catch(_){ }
    const pane=enterReaderPane(); if(!pane) return;
    const back=window.IntMapLang.t(HOST.lang,'Back to news','ニュースへ戻る','Zurück zu den News','Назад к новостям','Volver a noticias');
    pane.innerHTML=`<div class="nrp-bar"><button class="nrp-back" id="nrp-back-btn">‹ ${back}</button><span class="nrp-src">${HOST.escForReader(item.publisher)}</span></div>
      <div class="nrp-loading"><div class="nrp-spinner"></div>${window.IntMapLang.t(HOST.lang,'Loading article…','記事を読み込み中…','Artikel lädt…','Загрузка статьи…','Cargando artículo…')}</div>`;
    pane.querySelector('#nrp-back-btn').onclick=HOST.closeReaderPane;
    pane.scrollTop=0;
    fetchReadable(item).then(res=>{ if(HOST.readerOpen&&HOST.readerCurrent===item) renderReader(item,res);
      /* (#R118) ARTICLE-BODY bridge: Atlas can now READ the open article's extracted text ("この記事の根拠を
         整理して / この段落を翻訳して" work on the real body, not just the headline). Capped to ~6k chars. */
      try{ if(window._imReader&&res&&Array.isArray(res.blocks)&&res.blocks.length){
        window._imReader.body=res.blocks.map(b=>String((b&&(b.v!=null?b.v:(b.text!=null?b.text:b)))||'')).filter(Boolean).join('\n\n').slice(0,6000); } }catch(_){ } });
  }
  function renderReader(item,res){
    const pane=document.getElementById('news-reader-pane'); if(!pane) return;
    /* If we extracted real body text, default to the clean Reader; otherwise show the
       in-sidebar mini-browser (iframe) so the user can always read the page. */
    const hasText=res.blocks&&res.blocks.length>=2;
    HOST.renderReaderMode(item,res, hasText?'reader':'web');
  }
  return { enterReaderPane, openArticleInSidebar };
};
