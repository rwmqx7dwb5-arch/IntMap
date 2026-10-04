/* ============================================================================
 *  IntMap · World-events archive — the implementation behind the Events dashboard view  (#R322)
 * ----------------------------------------------------------------------------
 *  Fetched by js/lazy-modules.js when the Information dashboard switches to the Events view.
 *  js/analysis-panels.js keeps the eager SHELL: `window._dashView` (which js/companies-ui.js reads
 *  on every dashboard render) and the two doors, `window._setDashView` and
 *  `window._renderEventsArchive`, both of which await `IntMapLazy.need('analysisEvents')` first.
 *
 *  ⚠ The published global is `__imAnalysis…`, not `IntMap…` — js/atlas-controls.js discovers `window.IntMap*`
 *  by enumeration.
 *  (time-index-unify) The hand-written EVENTS_DB is gone: the view reads the one index of dated events
 *  (js/time-index.js) up to the map's clock — see the note at the top of the block below.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { icon } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */
import { IntMapTime } from './chronos.js';   /* the master clock the list stands at */
import { loadIndex, records, upTo, sourceOf, eventName, eventDesc, dateWords } from './time-index.js';   /* (time-index-unify) the one index */
import { describe, boxOf } from './on-this-day.js';   /* the words «On this day» gives the border and war records — one wording for both views */

export function analysisEvents(HOST){
  const LWE=IntMapLang.pick(()=>HOST.lang);
  /* (#R241) the ARRAY form — see `pickArgs` in js/lang-registry.js. `EV_LBL` was `['War','戦争']`
     read as `jp?[1]:[0]`, i.e. English on every language but Japanese, and invisible to every
     instrument because an array literal is not a call. */
  const LA=IntMapLang.pickArgs();
 const GE=()=>IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  /* stable closure values (never reassigned) — rebound under their original names so the moved body stays verbatim */
  const renderDashboard=HOST.renderDashboard, setupIntelLayers=HOST.setupIntelLayers;
  (function(){
    /* ══ (time-index-unify) THE EVENTS ARE THE INDEX'S, AND THE RANGE IS THE MAP'S CLOCK ═════════════════════════
       This view used to read EVENTS_DB, 132 hand-written rows — a year, a pin and a sentence each, none citing
       anything — between two year fields of its own that ignored the map's clock. Both are gone:
         · THE ROWS are the one index of dated events (js/time-index.js over data/on-this-day.json): the border
           record's change days and the war record's operations (which «On this day» and the year book read too),
           and the events beside them as Wikidata states them. Every card says which record it comes from and the
           precision of its date. What became of the 132 rows — replaced by a record that states the same event,
           carried from Wikidata, or dropped because no source dates it — is counted in
           dev-notes/2026-10-04-time-index-unify.md and in scripts/fetch-world-events.mjs;
         · THE RANGE is the master clock (js/chronos.js): the view lists what had happened BY the clock's instant,
           newest first, and the ‹ › beside it move the clock itself — so the map, the borders and this list stand
           at one instant. A clock moved anywhere else moves the list. */
    const EV_COLORS={war:'#ff3b30',disaster:'#ff9500',revolution:'#af52de',assassination:'#8e8e93',space:'#5856d6',economic:'#34c759',geo:'#007aff'};
    const EV_LBL={war:LA('War','戦争','Krieg','Война','Guerra'),disaster:LA('Disaster','災害','Katastrophe','Катастрофа','Desastre'),revolution:LA('Revolution','革命・政変','Revolution','Революция','Revolución'),assassination:LA('Assassination','暗殺','Attentat','Убийство','Asesinato'),space:LA('Space & science','宇宙・科学','Raumfahrt & Wissenschaft','Космос и наука','Espacio y ciencia'),economic:LA('Economy','経済危機・転換点','Wirtschaft','Экономика','Economía'),geo:LA('Geopolitics','地政学・条約','Geopolitik','Геополитика','Geopolítica')};
    const PAGE=50;   /* cards drawn at once; «Show more» draws the next as many — a list, not a cap on what is listed */
    let IX=null, ixP=null, ixFailed=false, shown=PAGE, shownFor='';
    /* the index, read the first time the view is opened; the view redraws itself when it arrives */
    function needIndex(){
      if(IX||ixP) return;
      ixFailed=false;
      ixP=loadIndex().then((idx)=>{ IX=idx; },()=>{ ixFailed=true; }).then(()=>{ ixP=null; if(viewing()){ try{ renderDashboard(); }catch(_){} } });
    }
    /* a moved clock redraws the list — once per calendar day it lands on, not once per tick */
    let clockDay='', clockT=0;
    const dayKey=(w)=>w.getFullYear()+'-'+(w.getMonth()+1)+'-'+w.getDate();
    /* «is this view on screen» is asked of the element it last drew into, not of the shell's global */
    let lastDash=null;
    const viewing=()=>!!(lastDash&&lastDash.isConnected&&lastDash.querySelector('[data-evstep]'));
    IntMapTime.on(()=>{ const k=dayKey(IntMapTime.when()); if(k===clockDay||!viewing()) return;
      clearTimeout(clockT); clockT=setTimeout(()=>{ try{ renderDashboard(); }catch(_){} },250); });
    const T=(en,jp)=>IntMapLang.t(HOST.lang,en,jp);
    const kindOf=(r)=>r.src==='wars'?'war':r.src==='cshapes'?'geo':(r.kind||'geo');
    /* one record, as this view states it: its date (to its precision), its words, the line under them, its place, its links */
    function card(r){
      const lang=HOST.lang, jp=lang==='jp';
      let title='', sub='', date=r.d+(r.d2?' – '+r.d2:''), at=null;
      if(r.src==='wikidata'){ title=eventName(r,lang); sub=eventDesc(r,lang); date=dateWords(r,lang); at=r.at||null; }
      else{
        const D=describe(r,IX,lang);
        title=D.text; sub=D.war?D.war:D.record; at=r.src==='wars'?(r.at||null):null;
        if(r.src==='cshapes'){ const b=boxOf(r); if(b) at=[(b[0]+b[2])/2,(b[1]+b[3])/2]; if(r.maybeYearOnly) sub+=T(' · dated 1 January: may be the year only',' · 1月1日付け（年だけの場合があります）'); }
      }
      const links=[];
      if(r.src==='wikidata'){
        links.push({ href:sourceOf(r,IX).cite.url, label:'Wikidata '+r.q });
        const w=r.wiki||{}, wt=(jp&&w.jp)?w.jp:w.en;
        if(wt) links.push({ href:'https://'+((jp&&w.jp)?'ja':'en')+'.wikipedia.org/wiki/'+encodeURIComponent(String(wt).replace(/ /g,'_')), label:'Wikipedia' });
      } else if(r.src==='wars'&&r.wiki) links.push({ href:'https://en.wikipedia.org/wiki/'+encodeURIComponent(r.wiki).replace(/%2F/g,'/'), label:'Wikipedia' });
      const k=kindOf(r), tl=EV_LBL[k]?LWE.arr(EV_LBL[k]):k;
      const src=r.src==='wikidata'?T('Wikidata','Wikidata'):r.src==='wars'?T('IntMap’s war record','IntMap の戦争記録'):T('The border record (CShapes 2.0)','国境の記録（CShapes 2.0）');
      return { at, title, sub, date, kind:k, tl, src, links, text:(date+' '+title+' '+sub+' '+tl+' '+src+' '+(r.q||'')).toLowerCase() };
    }
    /* …and as markup: every value escaped here, every link through the one URL guard */
    function cardHTML(c){
      const col=EV_COLORS[c.kind]||'#007aff';
      return '<div class="wiki-card"'+(c.at?' role="button" tabindex="0" data-evfly="'+(+c.at[0])+','+(+c.at[1])+'" style="cursor:pointer;"':'')+'>'+
        '<div class="wiki-card-content"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">'+
        '<span style="font-weight:800;font-size:14px;color:var(--primary-color);font-variant-numeric:tabular-nums;">'+esc(c.date)+'</span>'+
        '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;background:'+esc(col)+'22;color:'+esc(col)+';">'+esc(c.tl)+'</span></div>'+
        '<h4 class="wiki-card-title" style="margin:0 0 4px;">'+esc(c.title)+'</h4>'+(c.sub?'<p class="wiki-card-body" style="margin:0;">'+esc(c.sub)+'</p>':'')+
        '<div class="wiki-card-footer" style="display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;"><span style="font-size:11px;color:var(--text-muted);">'+esc(c.src)+'</span>'+
        c.links.map((l)=>'<a href="'+window.IntMapSafe.url(l.href)+'" target="_blank" rel="noopener" class="wiki-link" data-im-click="stopPropagation">'+esc(l.label)+' ↗</a>').join('')+'</div></div></div>';
    }
    /* the app's one escaper (js/safe-html.js) */
    const esc=(s)=>window.IntMapSafe.html(String(s==null?'':s));
    /* renderDashboard delegates here when the Events view is active */
    window._renderEventsArchive=function(dash,q){
      const seg='<div class="dash-nav"><button class="dash-nav-btn" data-im-click="dashView" data-im-arg="places">'+((icon('pin')+' '+IntMapLang.t(HOST.lang,'Places','場所','Orte','Места','Lugares')))+'</button><button class="dash-nav-btn active" data-im-click="dashView" data-im-arg="events">'+((icon('calendar')+' '+IntMapLang.t(HOST.lang,'World events','出来事','Ereignisse','События','Sucesos')))+'</button></div>';
      lastDash=dash;
      const when=IntMapTime.when(); clockDay=dayKey(when);
      const stamp=(y)=>(y<=0?T((1-y)+' BC','紀元前'+(1-y)+'年'):String(y));
      const at=String(when.getFullYear()).padStart(4,'0')+'-'+String(when.getMonth()+1).padStart(2,'0')+'-'+String(when.getDate()).padStart(2,'0');
      const clock='<div style="display:flex;align-items:center;gap:8px;margin:4px 0 10px;font-size:12px;color:var(--text-muted);flex-wrap:wrap;">'+
        '<button type="button" class="dash-nav-btn" data-evstep="-1" aria-label="'+esc(T('Previous year','前の年'))+'">‹</button>'+
        '<span style="font-variant-numeric:tabular-nums;">'+esc(T('Up to '+(when.getFullYear()>0?at:stamp(when.getFullYear()))+' — the map’s clock',(when.getFullYear()>0?at:stamp(when.getFullYear()))+' まで（地図の時刻）'))+'</span>'+
        '<button type="button" class="dash-nav-btn" data-evstep="1" aria-label="'+esc(T('Next year','次の年'))+'">›</button>';
      if(!IX){
        needIndex();
        dash.innerHTML=seg+clock+'</div><div class="dash-cards-container"><p class="wiki-card-body" style="margin:8px 2px;">'+esc(ixFailed?T('The index of dated events could not be read.','日付のある出来事の索引を読めませんでした。'):T('Reading the index of dated events…','日付のある出来事の索引を読んでいます…'))+'</p></div>';
        wire(dash);
        return;
      }
      const all=upTo(records(IX),when).map(card);
      const qq=String(q||'').toLowerCase();
      const list=qq?all.filter((c)=>c.text.includes(qq)):all;
      const key=at+'|'+qq; if(key!==shownFor){ shownFor=key; shown=PAGE; }
      const page=list.slice(0,shown);
      /* pins: the cards on screen that have a place */
      try{
        if(_imCanDraw()) setupIntelLayers();
        const feats=page.filter((c)=>c.at).map((c,i)=>({type:'Feature',id:'ev'+i,geometry:{type:'Point',coordinates:c.at},properties:{fid:'ev'+i,type:'event',color:'#007aff',title:c.title,body:'',layerRef:''}}));
        if(GE().layers.hasSource('dash-points')) GE().layers.setSourceData('dash-points',{type:'FeatureCollection',features:feats});
      }catch(_){}
      dash.innerHTML=seg+clock+' <span>'+list.length+(IntMapLang.t(HOST.lang,' events','件',' Ereignisse',' событий',' sucesos'))+'</span></div>'+
        '<div class="dash-cards-container">'+page.map((c)=>cardHTML(c)).join('')+'</div>'+
        (list.length>page.length?'<button type="button" class="dash-nav-btn" data-evmore="1" style="margin:8px 0;">'+esc(T('Show more','さらに表示'))+'</button>':'')+
        '<p style="margin:10px 2px 4px;font-size:11px;line-height:1.45;color:var(--text-muted);">'+esc(T('What had happened by the map’s clock, newest first: the days the border record changes, the operations of IntMap’s war record, and events as Wikidata states them (the date to the precision it gives). Move the clock to move the list.',
          '地図の時刻までに起きたことを新しい順に表示します。国境の記録が変わった日、IntMap の戦争記録の作戦、そして Wikidata が記述する出来事（日付は Wikidata が示す精度）です。時刻を動かすと一覧も動きます。'))+'</p>';
      wire(dash);
    };
    /* ⚠ SEC: the coordinates live in a data attribute, never an onclick STRING — see the note in js/companies-ui.js,
       which writes into this same `dash` element with its own attribute. The `<a class="wiki-link"
       data-im-click="stopPropagation">` inside each card (js/inline-actions.js) still stops the click from reaching
       this listener, so a link does not fly the map. */
    function wire(dash){
      if(dash.__imEvWired) return; dash.__imEvWired=1;
      dash.addEventListener('click',(ev)=>{ if(ev.target.closest('a')) return;
        const st=ev.target.closest('[data-evstep]');
        if(st&&dash.contains(st)){ try{ IntMapTime.setYear(IntMapTime.year()+(+st.getAttribute('data-evstep')),{source:'ui'}); }catch(_){} return; }
        const mo=ev.target.closest('[data-evmore]');
        if(mo&&dash.contains(mo)){ shown+=PAGE; try{ renderDashboard(); }catch(_){} return; }
        const c=ev.target.closest('[data-evfly]'); if(!c||!dash.contains(c)) return;
        const ll=String(c.getAttribute('data-evfly')||'').split(','); window.flyToLoc(+ll[0],+ll[1]); });
    }
    /* (#R322) the shell's facade hands over to this once the loader says the file arrived; this is the handle the
       shell holds, so a facade never calls itself back. */
    window.__imAnalysisEvents={ render:window._renderEventsArchive };
  })();
}
