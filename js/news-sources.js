/* ============================================================================
 *  IntMap · CHOOSE WHICH OUTLETS THE NEWS COMES FROM — window.IntMapNewsSources  (#R207)
 * ----------------------------------------------------------------------------
 *  「ニュースは、ニュースの元を選択できるように。例えば、ロイターとか、なんとか新聞とか、そういう。
 *    複数選択可能。」
 *
 *  ── THE LIST IS NOT A TABLE, IT IS THE FEED ─────────────────────────────────────────────────────
 *  Every headline already carries its publisher: Google News puts it after the last " - " in the
 *  title and js/news-feed.js has been splitting it out since #R169. So the set of outlets is not
 *  something to write down and maintain (a written list would claim outlets the feed does not carry,
 *  and would go stale the first time an edition changed) — it is whatever has actually arrived,
 *  counted, most-frequent first.
 *
 *  ⚠ EMPTY MEANS EVERY OUTLET. That is both the default and the only honest reading of "nothing
 *  ticked" for a filter over a set nobody enumerated in advance. The alternative — empty means
 *  nothing — would silently empty the news feed for every existing session on first load.
 *
 *  ⚠ MATCHED ON THE EXACT PUBLISHER STRING, case-insensitively. That string is what the user ticked.
 *  No prefix widening: "Reuters" must not quietly pull in "Reuters UK" that was never chosen.
 *
 *  ⚠ A TICK FOR AN OUTLET THAT IS MOMENTARILY ABSENT IS KEPT. The feed changes between openings of
 *  the Settings panel; dropping a selection because its outlet published nothing in the last few
 *  hours would make a saved filter forget itself. Absent selections are re-listed with no count.
 *
 *  Lives here rather than in js/app-body.js because of standing instruction 13 — new functionality
 *  goes in its own file, and the core only ever shrinks (tests/r200-checks ⑤).
 * ==========================================================================*/
window.IntMapModules=window.IntMapModules||{};
window.IntMapModules.newsSources=function(HOST,DEPS){
  /* (#R207) the country table comes from js/tables.js through the caller, the same way every other
     split module receives what it borrows — see Architecture.md §3.1 and scripts/check-split-scope.mjs.
     ⚠ A FREE REFERENCE HERE WOULD BE A SILENT NO-OP, which is exactly the failure #R194 built that
     gate against: the picker would build zero rows and nothing would say why. */
  const NEWS_COUNTRY_FEEDS=(DEPS&&DEPS.NEWS_COUNTRY_FEEDS)||{};
  const LNS=window.IntMapLang.pick(()=>HOST.lang);   /* (#R246) the feed names are tuples held as data — see IntMapLang.pickArgs() */

  window.IntMapNewsSources=(function(){
    'use strict';
    const esc=(s)=>{ try{ return window.IntMapSafe.html(s==null?'':String(s)); }catch(_){ return ''; } };
    const L=window.IntMapLang.pick(()=>HOST.lang);

    /* the outlets the CURRENT feed carries, with how many headlines each has, most first */
    function counts(){
      const m=new Map();
      try{ (HOST.globalData||[]).forEach(it=>{ const p=(it&&it.publisher||'').trim(); if(!p) return;
        m.set(p,(m.get(p)||0)+1); }); }catch(_){}
      return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
    }

    /* does the filter let this publisher through? */
    function allows(pub){
      const sel=window.imNewsSources;
      if(!Array.isArray(sel)||!sel.length) return true;
      const p=String(pub||'').trim().toLowerCase();
      return sel.some(s=>String(s||'').trim().toLowerCase()===p);
    }

    const allLabel=()=>L('All outlets','すべての提供元','Alle Quellen','Все источники','Todas las fuentes');
    const emptyLabel=()=>L('No headlines have loaded yet.','まだ見出しが読み込まれていません。','Noch keine Schlagzeilen geladen.','Заголовки ещё не загружены.','Aún no se han cargado titulares.');
    function label(){ const sel=window.imNewsSources||[]; return sel.length?sel.join(', '):allLabel(); }
    function syncLabel(){ const el=document.getElementById('newssource-dd-label'); if(el) el.textContent=label(); }

    /* Rebuild the picker. Called every time Settings opens, because the feed it describes changes. */
    function render(){
      const wrap=document.getElementById('newssource-multi'); if(!wrap) return false;
      const rows=counts();
      const seen=new Set(rows.map(r=>r[0]));
      (window.imNewsSources||[]).forEach(s=>{ if(!seen.has(s)) rows.push([s,0]); });
      wrap.innerHTML=rows.length
        ? rows.map(([name,n])=>'<label><input type="checkbox" value="'+esc(name)+'"> <span>'+esc(name)+(n?(' <span style="opacity:.55;">('+n+')</span>'):'')+'</span></label>').join('')
        : '<div class="ns-empty" style="padding:8px 10px;font-size:12px;color:var(--text-muted);">'+esc(emptyLabel())+'</div>';
      wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked=(window.imNewsSources||[]).includes(cb.value); });
      if(!wrap.dataset.built){ wrap.dataset.built='1';
        wrap.addEventListener('change',()=>{ const tmp=Array.from(wrap.querySelectorAll('input:checked')).map(c=>c.value);
          const el=document.getElementById('newssource-dd-label');
          if(el) el.textContent=tmp.length?tmp.join(', '):allLabel(); }); }
      syncLabel();
      /* the mode select in front of it — the same two-step shape the news-language block has */
      const sel=document.getElementById('setting-newssource'), dd=document.getElementById('newssource-dd'), hint=document.getElementById('newssource-hint');
      if(sel){
        if(!sel.dataset.wired){ sel.dataset.wired='1'; sel.addEventListener('change',()=>{ sel.dataset.touched='1'; render(); }); }
        if(!sel.dataset.touched) sel.value=((window.imNewsSources||[]).length?'multi':'off');
        const show=(sel.value==='multi');
        if(dd) dd.style.display=show?'block':'none';
        if(hint) hint.style.display=show?'block':'none';
      }
      return true;
    }

    /* Apply pressed. Returns true when the selection actually moved, so the caller knows whether to
       repaint. ⚠ "Default"/off means NO outlets selected, whatever is still ticked in the panel it
       hides — otherwise turning the feature off would leave it on. */
    function commit(){
      const wrap=document.getElementById('newssource-multi'); if(!wrap) return false;
      const before=(window.imNewsSources||[]).slice().sort().join(' ');
      const sel=document.getElementById('setting-newssource');
      const mode=sel?sel.value:'multi';
      window.imNewsSources=(mode==='off')?[]:Array.from(wrap.querySelectorAll('input:checked')).map(c=>c.value);
      const dd=document.getElementById('newssource-dd'); if(dd) dd.classList.remove('open');
      syncLabel();
      return before!==(window.imNewsSources||[]).slice().sort().join(' ');
    }

    /* ── the by-COUNTRY picker (#29), moved here verbatim from js/app-body.js ────────────────────
       (#R207) 「国別メディアのニュースの選択欄は、ニュースの言語の選択欄と同じUIに。今は微妙に違って、
       統一感がなく気持ち悪い。」 The markup gained a mode <select> and moved its hint below the control
       (index.html); what is new HERE is only the block that shows/hides the picker with that select.
       ⚠ (#R212) 「チェックボックスのUIが違う。」 — AND IT STILL WAS, because of an inline style. Both
       pickers here wrote `accent-color:…;width:16px;height:16px` onto the input. css/intmap.css draws
       these boxes itself (`appearance:none`, 22 px, a drawn tick at left:7px/top:3px), so
       `accent-color` did nothing at all and the 16 px override left a smaller box with the tick
       hanging off it. The language picker never had those styles, which is exactly why it looked
       right. They are gone; all three pickers are now the one CSS rule.
       ⚠ The mode is DERIVED from the selection rather than stored separately — one fewer thing that
       can disagree with the list it describes. */
    const noneLabel=()=>L('None (default feeds only)','未選択（標準のニュースのみ）','Keine (nur Standard-Feeds)','Не выбрано (только стандартные ленты)','Ninguno (solo fuentes predeterminadas)');
    /* (#R466) ONE place that turns a set of country codes into the button's summary. It was written
       twice — once for the committed set and once for the ticked set — and `relabel()` below needs a
       third reading of the same sentence, which is exactly when a copy stops being free. */
    function countryLabelOf(codes){
      const sel=codes||[];
      if(!sel.length) return noneLabel();
      return sel.map(c=>{ const f=NEWS_COUNTRY_FEEDS[c]; return f?(f.flag+' '+LNS.arr(f.name)):c; }).join(', ');
    }
    function countryLabel(){ return countryLabelOf(window.imNewsCountries||[]); }
    function syncCountryLabel(){ const el=document.getElementById('newscountry-dd-label'); if(el) el.textContent=countryLabel(); }
    function renderCountries(){
      const wrap=document.getElementById('newscountry-multi'); if(!wrap) return false;
      if(!wrap.dataset.built){
        wrap.innerHTML=Object.keys(NEWS_COUNTRY_FEEDS).map(code=>'<label><input type="checkbox" value="'+esc(code)+'"> <span>'+NEWS_COUNTRY_FEEDS[code].flag+' <span class="ncx" data-code="'+esc(code)+'"></span></span></label>').join('');
        wrap.dataset.built='1';
        /* the button summary follows the ticks live; the selection itself commits on Apply */
        wrap.addEventListener('change',()=>{ const el=document.getElementById('newscountry-dd-label');
          if(el) el.textContent=countryLabelOf(Array.from(wrap.querySelectorAll('input:checked')).map(c=>c.value)); });
      }
      wrap.querySelectorAll('input[type=checkbox]').forEach(cb=>{ cb.checked=(window.imNewsCountries||[]).includes(cb.value); });
      wrap.querySelectorAll('.ncx').forEach(s=>{ const c=s.getAttribute('data-code'); const f=NEWS_COUNTRY_FEEDS[c]; if(f) s.textContent=LNS.arr(f.name); });
      syncCountryLabel();
      const sel=document.getElementById('setting-newscountry'), dd=document.getElementById('newscountry-dd'), hint=document.getElementById('newscountry-hint');
      if(sel){
        if(!sel.dataset.wired){ sel.dataset.wired='1'; sel.addEventListener('change',()=>{ sel.dataset.touched='1'; renderCountries(); }); }
        if(!sel.dataset.touched) sel.value=((window.imNewsCountries||[]).length?'multi':'off');
        const show=(sel.value==='multi');
        if(dd) dd.style.display=show?'block':'none';
        if(hint) hint.style.display=show?'block':'none';
      }
      return true;
    }
    /* Apply pressed — same "off means none" rule as the outlet picker above. */
    function commitCountries(){
      const wrap=document.getElementById('newscountry-multi'); if(!wrap) return false;
      const before=(window.imNewsCountries||[]).slice().sort().join(',');
      const sel=document.getElementById('setting-newscountry');
      const mode=sel?sel.value:'multi';
      window.imNewsCountries=(mode==='off')?[]:Array.from(wrap.querySelectorAll('input:checked')).map(c=>c.value);
      const dd=document.getElementById('newscountry-dd'); if(dd) dd.classList.remove('open');
      return before!==(window.imNewsCountries||[]).slice().sort().join(',');
    }

    /* ══ (#R466) THE LANGUAGE CHANGES WHILE THIS DIALOG IS OPEN ═══════════════════════════════════
       Both pickers are painted by `render()`/`renderCountries()`, and the only thing that calls those
       is Settings being OPENED (js/app-body.js `btn-open-settings`). The language `<select>` is INSIDE
       Settings, so between choosing a language and reading these rows the dialog is never re-opened —
       MEASURED on production R450 and again here: all sixteen country names stayed English after an
       in-session switch to fr/ko/zh, while a reload in the same language showed them translated. The
       translations were never missing; nothing re-asked for them.
       ⚠ RELABEL, DO NOT RE-RENDER. `renderCountries()` sets every checkbox from `imNewsCountries` —
       the COMMITTED selection — so re-running it here would silently throw away ticks the user has
       made but not yet applied. Same for `render()`. This writes text and nothing else. */
    function relabel(){
      const cw=document.getElementById('newscountry-multi');
      if(cw){
        cw.querySelectorAll('.ncx').forEach(s=>{ const c=s.getAttribute('data-code'); const f=NEWS_COUNTRY_FEEDS[c]; if(f) s.textContent=LNS.arr(f.name); });
        const el=document.getElementById('newscountry-dd-label');
        if(el) el.textContent=cw.dataset.built
          ? countryLabelOf(Array.from(cw.querySelectorAll('input:checked')).map(c=>c.value))
          : countryLabel();
      }
      const sw=document.getElementById('newssource-multi');
      if(sw){
        /* outlet names are publisher strings out of the feed and are not translated; the two strings
           here that ARE ours are the empty-state line and the "All outlets" summary. */
        const em=sw.querySelector('.ns-empty'); if(em) em.textContent=emptyLabel();
        const el=document.getElementById('newssource-dd-label');
        if(el){ const ticked=sw.dataset.built?Array.from(sw.querySelectorAll('input:checked')).map(c=>c.value):(window.imNewsSources||[]);
          el.textContent=ticked.length?ticked.join(', '):allLabel(); }
      }
    }
    try{ window.addEventListener('intmap-lang',relabel); }catch(_){}

    /* one wiring pass for both dropdown buttons — identical behaviour, so identical code */
    ['newssource','newscountry'].forEach(k=>{
      const dd=document.getElementById(k+'-dd'), btn=document.getElementById(k+'-dd-btn'); if(!dd||!btn) return;
      btn.addEventListener('click',(e)=>{ e.stopPropagation(); dd.classList.toggle('open'); });
      document.addEventListener('click',(e)=>{ if(dd.classList.contains('open') && !dd.contains(e.target)) dd.classList.remove('open'); });
    });

    return { counts, allows, label, render, commit, syncLabel, relabel,
      renderCountries, commitCountries, countryLabel, countryLabelOf, syncCountryLabel };
  })();
};
