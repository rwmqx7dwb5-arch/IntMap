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
  function openArticleInSidebar(item){
    HOST.readerOpen=true; HOST.readerCurrent=item;
    /* (#R80) vision §2 — Atlas must know the ARTICLE the user is reading right now (not just that the News tab is
       open), so follow-ups like "この記事について詳しく"/"translate this"/"背景は？"/"where did this happen" resolve.
       globalData is closure-scoped, so bridge the open article onto window (same pattern as window._imLayerDates). */
    try{ const _a=(item&&item.analysis)||{}; window._imReader={ open:true, title:item&&item.title||'', publisher:item&&item.publisher||'', link:item&&item.link||'', pubDate:item&&item.pubDate||'', loc:(_a.loc&&isFinite(_a.loc[0]))?[_a.loc[0],_a.loc[1]]:null, place:_a.name||'' }; }catch(_){ }
    /* (#R160) reveal the sidebar to show the article reader. The sidebar overlays a fixed full-width map, so this
       can't move the map — just drop `collapsed` and let the search-pill layout recompute; no anchor, no resize. */
    try{ const _sb=document.getElementById('sidebar'); if(_sb&&_sb.classList.contains('collapsed')){ _sb.classList.remove('collapsed'); window.dispatchEvent(new Event('intmap-sidebar-resize')); } }catch(_){}
    try{ if(window.matchMedia('(max-width:768px)').matches && window.__setDetent) window.__setDetent('full'); }catch(_){}
    const cp=document.querySelector('.control-panel'); if(cp) cp.style.display='none';
    const sbBar=document.getElementById('sidebar-search-bar'); if(sbBar) sbBar.style.display='none';   /* (#R79e) by ID, not .search-bar (see renderUI note) */
    const pt=document.getElementById('news-pin-toggle'); if(pt) pt.style.display='none';
    ['live-news-feed','info-dashboard','community-feed'].forEach(id=>{ const e=document.getElementById(id); if(e) e.style.display='none'; });
    const pane=document.getElementById('news-reader-pane'); pane.style.display='flex';
    const back=HOST.lang==='jp'?'ニュースへ戻る':HOST.lang==='de'?'Zurück zu den News':HOST.lang==='ru'?'Назад к новостям':HOST.lang==='es'?'Volver a noticias':'Back to news';
    pane.innerHTML=`<div class="nrp-bar"><button class="nrp-back" id="nrp-back-btn">‹ ${back}</button><span class="nrp-src">${HOST.escForReader(item.publisher)}</span></div>
      <div class="nrp-loading"><div class="nrp-spinner"></div>${HOST.lang==='jp'?'記事を読み込み中…':HOST.lang==='de'?'Artikel lädt…':HOST.lang==='ru'?'Загрузка статьи…':HOST.lang==='es'?'Cargando artículo…':'Loading article…'}</div>`;
    pane.querySelector('#nrp-back-btn').onclick=HOST.closeArticleReader;
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
  return { openArticleInSidebar };
};
