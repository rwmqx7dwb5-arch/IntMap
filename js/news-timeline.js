/* ============================================================================
 *  IntMap · News time-machine timeline strip  (#R167)
 * ----------------------------------------------------------------------------
 *  The news timeline under the map: year / date / time modes, the scrubber, and the "synced"
 *  badge that ties it to the master clock (window.IntMapTime).
 *  WRITES two host members — moving the clock REPLACES the news arrays, so globalData and
 *  newsFeatures are read-write here (see tests/r165-checks.test.mjs for the RW contract).
 * ==========================================================================*/

window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.newsTimeline=function(map,HOST){
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ const m=window.__imap||map; return !!(m&&m.isStyleLoaded()); }catch(__){ return false; } } }
  const ymdISO=HOST.ymdISO, fetchData=HOST.fetchData;
  /* ================ END GROUP 4 (Pro removed) ================ */

  /* ===== (#R94) Time-machine wiring — the widget is now a SHELL over the IntMapTime kernel.
     Every input WRITES to the kernel (slider = recent day-precision, year field = deep time back to
     1900, date = exact day); a single kernel subscriber reflects the resulting instant back into the
     UI, prints the "what's synced" readout and (debounced) refreshes the news feed. ===== */
  (function(){
    const tl=document.getElementById('news-timeline'), tg=document.getElementById('ntl-toggle');
    const slider=document.getElementById('ntl-slider'), datePicker=document.getElementById('ntl-date');
    const synced=document.getElementById('ntl-synced'), bigval=document.getElementById('ntl-bigval');
    const badge=document.getElementById('ntl-badge'), btnNow=document.getElementById('ntl-today');
    const modeYear=document.getElementById('ntl-mode-year'), modeDate=document.getElementById('ntl-mode-date'), modeTime=document.getElementById('ntl-mode-time');
    const timePicker=document.getElementById('ntl-time');
    const scale=document.getElementById('ntl-scale'), closeX=document.getElementById('ntl-x'), title=document.getElementById('ntl-title');
    if(!tl||!slider) return;
    let pendingTimer=null, _self=false, mode='year';   /* (#R101) Year (1900→now) | Date (recent days) | (#R137) Time (time-of-day) */
    /* (#R137) HH:MM (24h) label used by the Time tab. */
    const _hm=(w)=>String(w.getHours()).padStart(2,'0')+':'+String(w.getMinutes()).padStart(2,'0');
    /* (#R137/#R139) Time tab writes the chosen time-of-day onto the date SELECTED BY the Year/Date tabs (today when
       live) and pushes it to the master clock. (#R139) When that date is TODAY, times AFTER the current moment are NOT
       selectable (no future) — a PAST date is fully scrubbable 0–24h. Time-of-day data (day/night terminator, sun/shadow)
       then syncs to it, exactly like Year/Date already sync. */
    function _timeBase(){ const st=window.IntMapTime.state(); return st.isLive?new Date():new Date(st.when); }
    function _sameDay(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
    function _timeMaxMins(base){ base=base||_timeBase(); const n=new Date(); return _sameDay(base,n)?(n.getHours()*60+n.getMinutes()):1439; }
    function _updTimeMax(){ try{ if(!timePicker) return; if(_sameDay(_timeBase(),new Date())) timePicker.max=_hm(new Date()); else timePicker.removeAttribute('max'); }catch(_){} }
    function _applyTimeOfDay(mins){ try{ const base=_timeBase(); mins=Math.max(0,Math.min(_timeMaxMins(base),mins|0));
      base.setHours(Math.floor(mins/60),mins%60,0,0);
      /* allowFuture:false forbids a future instant — for today it caps at "now"; a past date is always < now anyway. */
      window.IntMapTime.set(base,{allowFuture:false,source:'ui'}); }catch(_){} }
    /* (#R137) genuine, visible time-of-day effect: the day/night terminator for the selected instant (computed via the
       existing Earth-Replay solar math). Drawn while the Time tab is open; cleared otherwise. Fully guarded. */
    function _tmTerminator(show){ try{ const m=window.__imap||(typeof map!=='undefined'?map:null); if(!m||!_imCanDraw()) return;
      const has=!!(m.getSource&&m.getSource('imtm-night'));
      if(!show){ if(has){ try{ m.getSource('imtm-night').setData({type:'FeatureCollection',features:[]}); }catch(_){} } return; }
      if(!has){ try{ m.addSource('imtm-night',{type:'geojson',data:{type:'FeatureCollection',features:[]}}); m.addLayer({id:'imtm-night',type:'fill',source:'imtm-night',paint:{'fill-color':'#04070f','fill-opacity':0.33}}); }catch(_){ return; } }
      let fc={type:'FeatureCollection',features:[]}; try{ const w=window.IntMapTime.when(); const ER=window.IntMapEarthReplay; const t=(ER&&ER._terminatorFC)?ER._terminatorFC(w):null; if(t) fc={type:'FeatureCollection',features:[t]}; }catch(_){}
      try{ m.getSource('imtm-night').setData(fc); }catch(_){} }catch(_){} }
    function _tmSyncTerminator(){ try{ _tmTerminator(mode==='time' && !tl.classList.contains('collapsed')); }catch(_){} }
    const curY=new Date().getFullYear();
    const L5=(en,jp,de,ru,es)=>HOST.lang==='jp'?jp:HOST.lang==='de'?de:HOST.lang==='ru'?ru:HOST.lang==='es'?(es||en):en;
    const on=(id)=>{ try{ const c=document.getElementById(id); return !!(c&&c.checked); }catch(_){ return false; } };
    const yLabel=(y)=>HOST.lang==='jp'?(y+'年'):(''+y);
    /* Köppen climate era covering a given year (matches window.KOPPEN_PERIODS). */
    function kEra(y){ if(y>=1991) return '1991-2020'; if(y>=1961) return '1961-1990'; if(y>=1931) return '1931-1960'; return '1901-1930'; }
    /* Historical-borders snapshot for a year — delegate to IntMapTimeBorders._nearest (closest snapshot, forward
       only across a ≤20yr gap; #R94o), with a local fallback mirroring that logic. */
    const HBY=[1900,1914,1920,1930,1938,1945,1960,1994,2000,2010];
    function hbAt(y){ try{ const TB=window.IntMapTimeBorders; if(TB&&TB._nearest) return TB._nearest(y); }catch(_){}
      let prev=null,next=null; for(const v of HBY){ if(v<=y){ if(prev===null||v>prev) prev=v; } else if(next===null||v<next) next=v; }
      if(prev===null) return next!=null?next:HBY[0]; if(next===null) return prev;
      return ((next-y)<(y-prev)&&(next-prev)<=20)?next:prev; }
    /* localize the static chrome (title / mode buttons / back-to-now / badge / scale) */
    function localizeChrome(){
      if(title) title.textContent=L5('Time machine','タイムマシン','Zeitmaschine','Машина времени','Máquina del tiempo');
      if(modeYear) modeYear.textContent=L5('Year','年','Jahr','Год','Año');
      if(modeDate) modeDate.textContent=L5('Date','日付','Datum','Дата','Fecha');
      if(modeTime) modeTime.textContent=L5('Time','時刻','Zeit','Время','Hora');   /* (#R137) time-of-day tab */
      if(btnNow) btnNow.textContent=L5('Back to now','現在へ戻る','Zurück zu heute','К настоящему','Volver al presente');
      if(badge) badge.textContent=L5('Viewing the past','過去表示中','Vergangenheit','Прошлое','Viendo el pasado');
      /* (#27) the collapsed "See the past world / 1900 to present" button labels */
      try{ const ot=document.getElementById('ntl-open-t'), os=document.getElementById('ntl-open-s');
        if(ot) ot.textContent=L5('See the past world','過去の世界を見る','Die Welt der Vergangenheit','Мир прошлого','Ver el mundo del pasado');
        if(os) os.textContent=L5('1900 to present','1900年から現在まで','1900 bis heute','с 1900 до наших дней','1900 hasta hoy'); }catch(_){}
      buildScale();
    }
    function buildScale(){ if(!scale) return; const now=L5('Now','現在','Jetzt','Сейчас','Ahora');
      scale.innerHTML=(mode==='year')
        ? '<span>1900</span><span>1960</span><span>2000</span><span>'+now+'</span>'
        : (mode==='time')
        ? '<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>'
        : '<span>'+L5('−10y','10年前','−10 J','−10 л','−10 a')+'</span><span>'+L5('−5y','5年前','−5 J','−5 л','−5 a')+'</span><span>'+now+'</span>'; }
    function applyMode(m){ mode=m;
      if(modeYear) modeYear.classList.toggle('on',m==='year');
      if(modeDate) modeDate.classList.toggle('on',m==='date');
      if(modeTime) modeTime.classList.toggle('on',m==='time');
      if(datePicker) datePicker.style.display=(m==='date')?'':'none';
      if(timePicker) timePicker.style.display=(m==='time')?'':'none';
      if(m==='year'){ slider.min='1900'; slider.max=String(curY); slider.step='1'; }
      else if(m==='time'){ slider.min='0'; slider.max=String(_timeMaxMins()); slider.step='1'; _updTimeMax(); }   /* (#R137) minutes-of-day; (#R139) capped at "now" when the selected date is today */
      else { slider.min='0'; slider.max='3650'; slider.step='1'; }
      if(m!=='time') _tmTerminator(false);   /* (#R137) leaving Time mode clears the day/night overlay */
      buildScale();
      try{ refreshUI(window.IntMapTime.state()); }catch(_){}
    }
    function buildSynced(e){ if(!synced) return;
      const lbl='<span class="ntl-sync-lbl">'+L5('Applied','反映内容','Angewendet','Применено','Aplicado')+'</span>';
      const chip=(dot,txt,title)=>'<span class="ntl-chip"'+(title?(' title="'+title.replace(/"/g,'&quot;')+'"'):'')+'><span class="ntl-dot '+dot+'">'+(dot==='ok'?'✓':'')+'</span>'+txt+'</span>';
      if(e.isLive){ synced.innerHTML=lbl+'<div class="ntl-chips">'+chip('ok',L5('Live (present)','ライブ（現在）','Live (Gegenwart)','Прямой эфир','En vivo'))+'</div>'; return; }
      const y=e.year; const within=((new Date()-e.when)/864e5)<=3660;
      const bY=(y>hbAt(y)&&y>2010)?L5('current','現在','aktuell','текущие','actuales'):hbAt(y);
      /* (#R103) chips live in their own row UNDER the "Applied" label so they stay compact & don't line-break awkwardly. */
      let chips='';
      /* (#R137) in Time mode, surface the day/night terminator as the applied-at-this-time effect. */
      if(mode==='time') chips+=chip('ok', L5('Day/night','昼夜','Tag/Nacht','День/ночь','Día/noche')+' <b>'+_hm(e.when)+'</b>');
      /* (#R94i) country data + map borders always follow the clock; GDP/pop are real (Maddison) up to 2018. */
      chips+=chip('ok', L5('Countries','国データ','Länder','Страны','Países')+' <b>'+y+'</b>');
      chips+=chip('ok', L5('Borders','国境','Grenzen','Границы','Fronteras')+' <b>'+bY+'</b>');
      /* (#R104) News chip TEXT is now constant ("News") — the ok/amber dot (+ tooltip) conveys in/out of range, so the
         label width never changes as the slider crosses the news-range boundary → no re-flow ("スライダーを操作しても改行しない"). */
      chips+=chip(within?'ok':'warn', L5('News','ニュース','News','Новости','Noticias'), within?'':L5('Out of the news range (about the last 10 years)','ニュースの対象期間外（約10年以内）','Außerhalb des News-Zeitraums (ca. 10 Jahre)','Вне диапазона новостей (последние ~10 лет)','Fuera del rango de noticias (últimos ~10 años)'));
      if(on('dl-climate')) chips+=chip('ok','Köppen <b>'+kEra(y)+'</b>');
      if(on('dl-nato')) chips+=chip('ok','NATO <b>'+y+'</b>');
      if(on('dl-eu')) chips+=chip('ok','EU <b>'+y+'</b>');
      synced.innerHTML=lbl+'<div class="ntl-chips">'+chips+'</div>';
    }
    window._imTimeSyncedRefresh=()=>{ try{ buildSynced(window.IntMapTime.state()); }catch(_){} };
    /* WRITE side: inputs → kernel */
    tg.onclick=()=>{ tl.classList.toggle('collapsed'); if(!tl.classList.contains('collapsed')){ localizeChrome(); try{ refreshUI(window.IntMapTime.state()); }catch(_){} } _tmSyncTerminator(); };
    if(closeX) closeX.onclick=()=>{ tl.classList.add('collapsed'); _tmSyncTerminator(); };
    if(modeYear) modeYear.onclick=()=>applyMode('year');
    if(modeDate) modeDate.onclick=()=>applyMode('date');
    if(modeTime) modeTime.onclick=()=>applyMode('time');   /* (#R137) */
    slider.addEventListener('input',()=>{ if(_self) return;
      if(mode==='year'){ const y=parseInt(slider.value,10); if(y>=curY) window.IntMapTime.setNow({source:'ui'}); else if(y>=1900) window.IntMapTime.setYear(y,{source:'ui'}); }
      else if(mode==='time'){ _applyTimeOfDay(parseInt(slider.value,10)||0); }   /* (#R137) minutes-of-day → clock */
      else { window.IntMapTime.setDaysAgo(3650-parseInt(slider.value,10),{source:'ui'}); } });
    if(datePicker) datePicker.addEventListener('change',()=>{ if(_self) return; if(!datePicker.value){ window.IntMapTime.setNow({source:'ui'}); } else { const d=new Date(datePicker.value+'T00:00:00'); if(!isNaN(d.getTime())) window.IntMapTime.set(d,{source:'ui'}); } });
    if(timePicker) timePicker.addEventListener('change',()=>{ if(_self) return; const v=timePicker.value; if(!v) return; const p=String(v).split(':'); _applyTimeOfDay((+p[0]||0)*60+(+p[1]||0)); });   /* (#R137) */
    if(btnNow) btnNow.onclick=()=>window.IntMapTime.setNow({source:'ui'});
    /* READ side: kernel → this widget's UI */
    function refreshUI(e){ _self=true; try{
      if(mode==='time'){ /* (#R137) Time tab: show the time-of-day of the current instant (now when live).
                           (#R139) keep the slider/picker max at "now" while the selected date is today (no future). */
        const w=e.when; const base=e.isLive?new Date():new Date(e.when); const maxM=_timeMaxMins(base);
        if(slider.max!==String(maxM)) slider.max=String(maxM); _updTimeMax();
        let mins=w.getHours()*60+w.getMinutes(); if(mins>maxM) mins=maxM;
        tl.classList.toggle('active',!e.isLive);
        bigval.textContent=_hm(w);
        if(timePicker) timePicker.value=_hm(w);
        if(+slider.value!==mins) slider.value=mins;
        _tmSyncTerminator();
      }
      else if(e.isLive){ tl.classList.remove('active'); if(datePicker) datePicker.value='';
        bigval.textContent=(mode==='year')?yLabel(curY):L5('Today','今日','Heute','Сегодня','Hoy');
        if(mode==='year'){ if(+slider.value!==curY) slider.value=curY; } else { if(+slider.value!==3650) slider.value=3650; } }
      else { tl.classList.add('active');
        const today=new Date(); today.setHours(0,0,0,0); const t=new Date(e.when); t.setHours(0,0,0,0); const da=Math.round((today-t)/864e5);
        if(mode==='year'){ bigval.textContent=yLabel(e.year); const sv=Math.max(1900,Math.min(curY,e.year)); if(+slider.value!==sv) slider.value=sv; }
        else { bigval.textContent=e.when.toLocaleDateString(HOST.lang==='jp'?'ja-JP':HOST.lang==='de'?'de-DE':HOST.lang==='ru'?'ru-RU':HOST.lang==='es'?'es-ES':'en-US',{year:'numeric',month:'short',day:'numeric'});
          const sv=Math.max(0,Math.min(3650,3650-da)); if(+slider.value!==sv) slider.value=sv; }
        if(datePicker) datePicker.value=(da>=0&&da<=3650)?ymdISO(e.when):'';   /* deep-past has no valid recent-picker value */
      }
      const mn=+slider.min, mx=+slider.max; slider.style.setProperty('--ntl-fill',(mx>mn?((+slider.value-mn)/(mx-mn)*100):0)+'%');
      buildSynced(e);
      /* (#R105) reflect the set year/date on the COLLAPSED "See the past world" button (it turns blue via .active) —
         same button, just its two label lines swap to the applied period; restored to the default on "Now". */
      try{ const ot=document.getElementById('ntl-open-t'), os=document.getElementById('ntl-open-s');
        if(ot&&os){
          if(e.isLive){ ot.textContent=L5('See the past world','過去の世界を見る','Die Welt der Vergangenheit','Мир прошлого','Ver el mundo del pasado');
            os.textContent=L5('1900 to present','1900年から現在まで','1900 bis heute','с 1900 до наших дней','1900 hasta hoy'); }
          else { ot.textContent=(mode==='year')?yLabel(e.year):(mode==='time')?_hm(e.when):e.when.toLocaleDateString(HOST.lang==='jp'?'ja-JP':HOST.lang==='de'?'de-DE':HOST.lang==='ru'?'ru-RU':HOST.lang==='es'?'es-ES':'en-US',{year:'numeric',month:'short',day:'numeric'});
            os.textContent=L5('Viewing the past · tap','過去を表示中 · タップ','Vergangenheit · tippen','Прошлое · нажмите','Viendo el pasado · toca'); }
        }
      }catch(_){}
    }catch(_){} _self=false; }
    window.IntMapTime.on(e=>{ refreshUI(e);
      /* Refetch the news feed only when the DAY (or live-state) actually changed. */
      const key=e.isLive?'live':e.iso;
      if(key!==window._imTimeNewsKey){ window._imTimeNewsKey=key;
        clearTimeout(pendingTimer); pendingTimer=setTimeout(()=>{
          /* (#R107) a day/live change invalidates the loaded feed — DROP it (and the map news pins) so a past date can
             never keep showing today's news, then re-fetch (buildItems filters to the target date). Runs for ALL modes
             now (was news/saved only), so pins on the map also reflect the date, not the last-loaded latest set. */
          HOST.globalData=[];
          /* (#R171) source data through IntMapGeoEngine — this file no longer names the renderer. */
          try{ const E=window.IntMapGeoEngine; if(E&&E.layers.hasSource('news-points')){ E.layers.setSourceData('news-points',{type:'FeatureCollection',features:[]}); HOST.newsFeatures=[]; } }catch(_){}
          try{ fetchData(); }catch(_){}
        },230); } });
    /* (#R101) close the popup when the user starts operating elsewhere on the map (pan / zoom / click-away). */
    (function autoClose(){ const closeIf=()=>{ try{ if(!tl.classList.contains('collapsed')){ tl.classList.add('collapsed'); _tmSyncTerminator(); } }catch(_){} };
      function wireMap(){ try{ const M=window.__imap||(typeof map!=='undefined'?map:null); if(M&&M.on){ M.on('dragstart',closeIf); M.on('zoomstart',ev=>{ if(ev&&ev.originalEvent) closeIf(); }); M.on('click',closeIf); M.on('styledata',()=>{ try{ _tmSyncTerminator(); }catch(_){} }); return true; } }catch(_){} return false; }
      if(!wireMap()) setTimeout(wireMap,1500);
      document.addEventListener('pointerdown',ev=>{ try{ if(tl.classList.contains('collapsed')) return; if(ev.target&&ev.target.closest&&ev.target.closest('#news-timeline')) return; closeIf(); }catch(_){} },true); })();
    window.addEventListener('intmap-lang',()=>{ try{ localizeChrome(); refreshUI(window.IntMapTime.state()); }catch(_){} });
    /* init */
    if(datePicker){ datePicker.max=ymdISO(new Date()); datePicker.min=ymdISO(new Date(Date.now()-3650*864e5)); }
    tl.classList.add('collapsed'); localizeChrome(); applyMode('year');
  })();
};
