/* ============================================================================
 *  IntMap · News time-machine timeline strip  (#R167)
 * ----------------------------------------------------------------------------
 *  The news timeline under the map: year / date / time modes, the scrubber, and the "synced"
 *  badge that ties it to the master clock (window.IntMapTime).
 *  WRITES two host members — moving the clock REPLACES the news arrays, so globalData and
 *  newsFeatures are read-write here (see tests/r165-checks.test.mjs for the RW contract).
 * ==========================================================================*/

window.IntMapModules=window.IntMapModules||{};

window.IntMapModules.newsTimeline=function(HOST){
  const GE=()=>window.IntMapGeoEngine;   /* (#R178) the renderer, through the contract — never the raw handle */
  /* (#R170) "Is it safe to addSource/addLayer right now?" — the app-wide predicate declared in index.html.
     A function DECLARATION so nested closures above this line can call it (no TDZ). Falls back to the old
     isStyleLoaded() test only if the host is somehow absent. */
  function _imCanDraw(){ try{ return !!HOST.canDraw(); }catch(_){ try{ return !!GE().ready(); }catch(__){ return false; } } }
  const ymdISO=HOST.ymdISO, fetchData=HOST.fetchData;
  /* ================ END GROUP 4 (Pro removed) ================ */

  /* ===== (#R94) Time-machine wiring — the widget is now a SHELL over the IntMapTime kernel.
     Every input WRITES to the kernel (slider = recent day-precision, year field = deep time back to
     1900, date = exact day); a single kernel subscriber reflects the resulting instant back into the
     UI, prints the "what's synced" readout and (debounced) refreshes the news feed. ===== */
  (function(){
    const tl=document.getElementById('news-timeline'), tg=document.getElementById('ntl-toggle');
    const slider=document.getElementById('ntl-slider'), datePicker=document.getElementById('ntl-date');
    const bigval=document.getElementById('ntl-bigval');
    const badge=document.getElementById('ntl-badge'), btnNow=document.getElementById('ntl-today');
    const modeYear=document.getElementById('ntl-mode-year'), modeDate=document.getElementById('ntl-mode-date'), modeTime=document.getElementById('ntl-mode-time');
    /* (#R288) the fourth tab and its transport — see the note on `fcReady` below */
    const modeFc=document.getElementById('ntl-mode-fc'), playerEl=document.getElementById('ntl-player');
    const timePicker=document.getElementById('ntl-time');
    const scale=document.getElementById('ntl-scale'), closeX=document.getElementById('ntl-x'), title=document.getElementById('ntl-title');
    if(!tl||!slider) return;
    let pendingTimer=null, _self=false, mode='year';   /* (#R101) Year (1900→now) | Date (recent days) | (#R137) Time (time-of-day) | (#R288) Forecast (the model's own hours) */
    /* ══ ⚠⚠⚠ (#R288) THE APP HAS ONE CLOCK, AND IT NOW REACHES FORWARD ══════════════════════════
       「ECMWF系レイヤーを開くと勝手にECMWFの時間ポップアップが出るのを辞めろ。わざわざ分けるな。」

       #R284 answered the forecast axis with a floating box of its own that opened by itself. This
       widget is the app's ONE time control — every other time-aware layer has followed it since
       #R94 — and it had no way to reach a future instant, which is the only reason a second clock
       was ever built. So it gets a fourth tab whose steps are the MODEL'S OWN valid times
       (js/wx-ecmwf.js), and the ECMWF layers follow the master clock like everything else.
       ⚠ The tab is present only when the model actually published an axis; a control for something
       that does not exist is the 「押しても何も起きない」 shape (#R268). */
    const EC=()=>{ try{ return window.IntMapECMWF; }catch(_){ return null; } };
    const fcReady=()=>{ try{ const E=EC(); return !!(E&&E.count()>0); }catch(_){ return false; } };
    const fcCount=()=>{ try{ return EC().count(); }catch(_){ return 0; } };
    const fcIndex=()=>{ try{ return EC().index(); }catch(_){ return 0; } };
    const zoneSel=document.getElementById('ntl-zone'), zoneLbl=document.getElementById('ntl-zone-lbl'), subEl=document.getElementById('ntl-sub');
    /* ══ ⚠⚠ (#R289) WHICH CLOCK CHRONOS SPEAKS IN ═══════════════════════════════════════════════
       「タイムマシンのUIに、どこの時刻を採用するかのプルダウンを付けて。デフォルトはユーザーが設定
         した時刻だが、UTCも選ぶことができるというように。」

       ⚠ THE INSTANT IS NOT WHAT CHANGES. window.IntMapTime holds one instant and every subsystem
       reads it; a time zone is a way of WRITING an instant down, not a second clock (which is the
       「2つの時計」 #R265 and #R267 each had to remove). So this setting decides two things and
       nothing else: how this panel PRINTS the instant, and how the Time tab's 「14:30」 is READ
       BACK into one. The terminator, the news, the borders and the statistics are unaffected —
       they were never told a time zone in the first place.

       ⚠ AND THE READ-BACK IS THE HALF THAT CAN BE WRONG. `base.setHours(h,m)` writes DEVICE local
       time, so before this the Time tab silently meant «the device's 14:30» however the reader
       had set the app's time zone. `zSet` inverts the chosen zone properly — build the wall clock
       as if it were UTC, subtract that zone's offset AT THAT INSTANT, then re-measure the offset
       and correct once, because the offset of a zone depends on the instant you are asking about
       and a DST boundary moves it under the first guess.

       Four kinds of answer, and each is a fact rather than a guess:
         · 'user'  — the app's own Settings time zone, or the device when that is 「auto」;
         · 'UTC'   — no offset at all;
         · an IANA name — resolved by Intl, so it carries that zone's real DST rules;
         · 'map'   — the STANDARD offset where the map is centred, read from the same Natural
                     Earth time-zone polygons the Time-zones layer draws (window.IntMapTimeZones).
                     ⚠ STANDARD time: that dataset has no DST rules, and the option says so.
       ⚠ A ZONE WHOSE DATA HAS NOT ARRIVED FALLS BACK TO THE DEVICE and re-renders when it does —
       never to a made-up offset. */
    const ZONES=['Pacific/Auckland','Australia/Sydney','Asia/Tokyo','Asia/Seoul','Asia/Shanghai','Asia/Singapore',
      'Asia/Bangkok','Asia/Kolkata','Asia/Dubai','Europe/Moscow','Africa/Nairobi','Europe/Istanbul','Europe/Athens',
      'Europe/Berlin','Europe/Paris','Europe/London','Atlantic/Reykjavik','America/Sao_Paulo','America/New_York',
      'America/Chicago','America/Denver','America/Los_Angeles','America/Anchorage','Pacific/Honolulu'];
    const ZKEY='intmap_chronos_zone';
    let zone='user';
    try{ const z0=localStorage.getItem(ZKEY); if(z0&&(z0==='user'||z0==='UTC'||z0==='map'||ZONES.indexOf(z0)>=0)) zone=z0; }catch(_){}
    /* resolve the SELECTION to something the arithmetic below can use */
    function zSpec(){
      if(zone==='UTC') return {tz:'UTC'};
      if(zone==='map'){ let h=null;
        try{ const c=GE().hasRenderer()?GE().camera.getCenter():null;
          if(c&&window.IntMapTimeZones) h=window.IntMapTimeZones.offsetAt(c.lng,c.lat); }catch(_){}
        return (h==null)?{local:true}:{off:h}; }
      if(zone!=='user') return {tz:zone};
      let u=null; try{ u=HOST.userTZ; }catch(_){}
      return (u&&u!=='auto')?{tz:u}:{local:true};
    }
    /* the offset of an IANA zone AT a given instant, in ms */
    function tzOffMs(d,tz){ try{
      const f=new Intl.DateTimeFormat('en-US',{timeZone:tz,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const o={}; f.formatToParts(d).forEach(x=>{ if(x.type!=='literal') o[x.type]=x.value; });
      const asUTC=Date.UTC(+o.year,+o.month-1,+o.day,(+o.hour)%24,+o.minute,+o.second);
      return asUTC-(Math.floor(d.getTime()/1000)*1000); }catch(_){ return 0; } }
    /* an instant → its wall-clock fields in the chosen zone */
    function zFields(d){ const sp=zSpec();
      if(sp.local) return {Y:d.getFullYear(),M:d.getMonth()+1,D:d.getDate(),h:d.getHours(),m:d.getMinutes()};
      const shift=sp.tz?tzOffMs(d,sp.tz):(sp.off*3600000);
      const t=new Date(d.getTime()+shift);
      return {Y:t.getUTCFullYear(),M:t.getUTCMonth()+1,D:t.getUTCDate(),h:t.getUTCHours(),m:t.getUTCMinutes()}; }
    /* wall-clock fields in the chosen zone → the instant they name */
    function zInstant(F){ const sp=zSpec();
      if(sp.local) return new Date(F.Y,F.M-1,F.D,F.h,F.m,0,0);
      const naive=Date.UTC(F.Y,F.M-1,F.D,F.h,F.m,0,0);
      if(sp.off!=null) return new Date(naive-sp.off*3600000);
      let t=naive-tzOffMs(new Date(naive),sp.tz);
      t=naive-tzOffMs(new Date(t),sp.tz);            /* one correction: the offset depends on the instant */
      return new Date(t); }
    /* what the reader should see this zone called */
    function zoneName(k){
      if(k==='user'){ let u=null; try{ u=HOST.userTZ; }catch(_){}
        return (u&&u!=='auto')?(L5('Your setting','設定の時間帯','Ihre Einstellung','Ваша настройка','Su ajuste')+' · '+u.replace(/_/g,' '))
          :L5('Your device','端末の時刻','Ihr Gerät','Ваше устройство','Su dispositivo'); }
      if(k==='UTC') return 'UTC';
      if(k==='map') return L5('Where the map is centred (standard time)','地図の中心の標準時','Kartenmitte (Normalzeit)','Центр карты (стандартное время)','Centro del mapa (hora estándar)');
      return k.replace(/_/g,' '); }
    /* the printed offset, so the choice is a fact on screen rather than a name to be trusted */
    function zoneOffText(d){ const sp=zSpec();
      const ms=sp.local?(-d.getTimezoneOffset()*60000):(sp.tz?tzOffMs(d,sp.tz):sp.off*3600000);
      const mins=Math.round(ms/60000), sg=mins<0?'−':'+', a=Math.abs(mins);
      return 'UTC'+sg+String(Math.floor(a/60)).padStart(2,'0')+':'+String(a%60).padStart(2,'0'); }
    /* (#R137) HH:MM (24h) label used by the Time tab. */
    /* (#R289) …in the zone the reader picked, not the device's — see the zone kernel above */
    const _hm=(w)=>{ const f=zFields(w); return String(f.h).padStart(2,'0')+':'+String(f.m).padStart(2,'0'); };
    /* (#R137/#R139) Time tab writes the chosen time-of-day onto the date SELECTED BY the Year/Date tabs (today when
       live) and pushes it to the master clock. (#R139) When that date is TODAY, times AFTER the current moment are NOT
       selectable (no future) — a PAST date is fully scrubbable 0–24h. Time-of-day data (day/night terminator, sun/shadow)
       then syncs to it, exactly like Year/Date already sync. */
    function _timeBase(){ const st=window.IntMapTime.state(); return st.isLive?new Date():new Date(st.when); }
    /* ⚠ (#R210) THE TIME SLIDER IS NO LONGER CLIPPED AT "now" ══════════════════════════════════════
       「今日の中で、現在時刻以降を選択できないスライダーの仕様にするのはやめて。」 #R139 capped today at
       the current minute on the reasoning that the app must not claim to know the future. That is
       right about DATA and wrong about this control: the Time tab moves the time OF DAY, and what it
       drives — the sun's position, the day/night line, the shadow analysis — is astronomy, defined
       for any instant. Earth Replay has always passed `allowFuture:true` for exactly that reason
       (js/sims.js), so today the same slider answered differently in two places. Anything that
       genuinely cannot know the future (the news feed) already decides that for itself.
       `_timeMaxMins` is kept as the one place the range is stated, rather than deleted and inlined. */
    function _timeMaxMins(){ return 1439; }
    function _updTimeMax(){ try{ if(timePicker) timePicker.removeAttribute('max'); }catch(_){} }
    /* ⚠ (#R289) THE MINUTES ARE READ BACK IN THE CHOSEN ZONE. `setHours` writes DEVICE local time,
       so with «UTC» selected the slider used to say 14:30 and set 14:30 of wherever the reader's
       computer is — the control and the clock meaning two different things, which is the whole
       defect a zone selector exists to prevent. The DATE the time is applied TO is the one the
       reader sees in the same zone, so scrubbing past midnight stays on the day on screen. */
    function _applyTimeOfDay(mins){ try{ const base=_timeBase(); mins=Math.max(0,Math.min(_timeMaxMins(),mins|0));
      const f=zFields(base); f.h=Math.floor(mins/60); f.m=mins%60;
      window.IntMapTime.set(zInstant(f),{allowFuture:true,source:'ui'}); }catch(_){} }
    /* (#R137) genuine, visible time-of-day effect: the day/night terminator for the selected instant (computed via the
       existing Earth-Replay solar math). Drawn while the Time tab is open; cleared otherwise. Fully guarded. */
    /* (#R180) through the contract. This held window.__imap under the name `m` and drove it raw —
       the same "handle under another name" hole #R179 closed for the additional views. */
    /* ⚠ (#R210) THE SECOND NIGHT IS GONE ══════════════════════════════════════════════════════════
       「タイムマシンで日時を動かしたときだけ、昼夜境界に新たな影ができるのはやめて。すでにあるから、
        重複して付け足す必要はない。」 #R137 added `imtm-night` — a flat 33 %-black fill of the night
       hemisphere — as the Time tab's "visible effect", and at the time nothing else drew one. #R201
       then built the real one: js/night-side.js, a per-pixel twilight ramp with VIIRS city lights,
       which follows window.IntMapTime and therefore ALREADY moves when the time machine does. Since
       then opening the Time tab painted a second, cruder terminator over the good one — two edges,
       slightly apart, both moving.
       The function stays and always CLEARS, rather than being deleted with its callers: the layer
       may already exist in a session that opened the tab before this deploy, and a removed function
       would leave that fill on the map with nothing left that knows how to empty it. */
    function _tmTerminator(){ try{ const E=GE(); if(!(E&&E.hasRenderer())||!_imCanDraw()) return;
      if(E.layers.hasSource('imtm-night')){ try{ E.layers.setSourceData('imtm-night',{type:'FeatureCollection',features:[]}); }catch(_){} }
    }catch(_){} }
    function _tmSyncTerminator(){ try{ _tmTerminator(); }catch(_){} }   /* (#R210) js/night-side.js is the day/night line — this only clears the old duplicate */
    const curY=new Date().getFullYear();
    /* (#R289) ONE DATE FORMATTER, and it prints the day the CHOSEN zone is on — which is not always
       the day the device is on. `zFields` already answers that; formatting the fields back as a
       UTC noon keeps the calendar arithmetic out of the formatter, so no zone can shift the day a
       second time. */
    function _dateText(d){ try{ const f=zFields(d);
      return new Date(Date.UTC(f.Y,f.M-1,f.D,12,0,0))
        .toLocaleDateString(window.IntMapLang.locale(HOST.lang,'en-US'),{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});
    }catch(_){ return d.toLocaleDateString(); } }
    const L5=window.IntMapLang.pick(()=>HOST.lang);
    const yLabel=(y)=>HOST.lang==='jp'?(y+'年'):(''+y);
    /* (#R290) `on()`, `kEra()`, `HBY` and `hbAt()` lived here to fill the 「反映内容」 chips — the
       Köppen era, the historical-borders snapshot and which of the year-driven layers were on.
       That block is gone (see the note further down), and so is everything that only fed it. */
    /* localize the static chrome (title / mode buttons / back-to-now / badge / scale) */
    function localizeChrome(){
      /* ⚠ (#R289) THE NAME IS NOT TRANSLATED — it is a name. 「IntMap統一時間機能を、これより
         Chronosという名称に。マスターUIであるタイムマシンも、Chronosという名前に改名。」 What IS
         translated is the line under it, which says what the name operates. */
      if(title) title.textContent='Chronos';
      if(subEl) subEl.textContent=L5('Control IntMap’s unified time','IntMapの統一時間を操作','IntMaps einheitliche Zeit steuern','Управление единым временем IntMap','Controla el tiempo unificado de IntMap');
      if(modeYear) modeYear.textContent=L5('Year','年','Jahr','Год','Año');
      if(modeDate) modeDate.textContent=L5('Date','日付','Datum','Дата','Fecha');
      if(modeTime) modeTime.textContent=L5('Time','時刻','Zeit','Время','Hora');   /* (#R137) time-of-day tab */
      if(modeFc) modeFc.textContent=L5('Forecast','予報','Vorhersage','Прогноз','Pronóstico');   /* (#R288) */
      syncFcTab();
      if(btnNow) btnNow.textContent=L5('Back to now','現在へ戻る','Zurück zu heute','К настоящему','Volver al presente');
      if(badge) badge.textContent=L5('Viewing the past','過去表示中','Vergangenheit','Прошлое','Viendo el pasado');
      /* (#R289) 「Chronosボタンは、いまは「過去の世界を見る／1900年から現在」となっていますが、
         「Chronos／地図の時間を操作」にして。」 — the collapsed entry point, same name, same shape. */
      try{ const ot=document.getElementById('ntl-open-t'), os=document.getElementById('ntl-open-s');
        if(ot) ot.textContent='Chronos';
        if(os) os.textContent=L5('Control the map’s time','地図の時間を操作','Die Zeit der Karte steuern','Управление временем карты','Controla el tiempo del mapa'); }catch(_){}
      buildZones();
      buildScale();
    }
    /* the tab appears the moment the model's metadata lands, and never before */
    function syncFcTab(){ try{ if(modeFc) modeFc.style.display=fcReady()?'':'none'; }catch(_){} }
    function fcValid(i){ try{ return EC().validTime(i); }catch(_){ return ''; } }
    function fcFmt(iso){ try{ return EC().fmt(iso,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }catch(_){ return iso||''; } }
    /* the SAME icon declaration the weather legends read (#R284), so the two views of one clock can
       never disagree about which button is 「再生」 and which is 「次へ」 */
    function buildPlayer(){
      if(!playerEl) return;
      if(mode!=='forecast'||!fcReady()){ playerEl.style.display='none'; playerEl.innerHTML=''; return; }
      const P=window.IntMapWxPlayer; if(!P){ playerEl.style.display='none'; return; }
      const E=EC(), playing=!!(E&&E.isPlaying());
      playerEl.style.display='flex';
      playerEl.innerHTML=P.b('first',L5('First step','最初の時刻','Erster Schritt','Первый шаг','Primer paso'),P.IC.first)
        +P.b('prev',L5('One step back','1つ前の時刻','Ein Schritt zurück','На шаг назад','Un paso atrás'),P.IC.prev)
        +P.b('play',(playing?L5('Pause','一時停止','Pause','Пауза','Pausa'):L5('Play','再生','Abspielen','Воспроизвести','Reproducir')),(playing?P.IC.pause:P.IC.play),'ecl-play')
        +P.b('next',L5('One step forward','1つ次の時刻','Ein Schritt vor','На шаг вперёд','Un paso adelante'),P.IC.next)
        +P.b('now',L5('Back to now','現在に戻る','Zurück zu jetzt','К текущему времени','Volver a ahora'),L5('Now','現在','Jetzt','Сейчас','Ahora'),'ecl-now');
      playerEl.querySelectorAll('.ecl-b').forEach(b=>{ b.onclick=()=>{ const a=b.getAttribute('data-act'); const E2=EC(); if(!E2) return;
        if(a==='first'){ E2.pause(); E2.setIndex(0,{now:true}); }
        else if(a==='prev'){ E2.pause(); E2.step(-1); }
        else if(a==='next'){ E2.pause(); E2.step(1); }
        else if(a==='now'){ E2.pause(); E2.setIndex(E2.nowIndex(),{now:true}); }
        else if(a==='play') E2.togglePlay();
        buildPlayer(); refreshUI(window.IntMapTime.state()); }; });
    }
    /* built once and only its VALUE re-set afterwards — the same rule the year <select> follows
       (#R266): rebuilding the list would close the dropdown under the finger that opened it. */
    function buildZones(){ if(!zoneSel) return;
      if(zoneLbl) zoneLbl.textContent=L5('Clock','時刻の基準','Uhr','Часы','Reloj');
      const sig=String(HOST.lang)+'|'+String((()=>{ try{ return HOST.userTZ; }catch(_){ return ''; } })());
      if(zoneSel.getAttribute('data-built')!==sig){
        const esc=(x)=>window.IntMapSafe.html(String(x));
        const opt=(v)=>'<option value="'+esc(v)+'">'+esc(zoneName(v))+'</option>';
        zoneSel.innerHTML=opt('user')+opt('UTC')+opt('map')
          +'<optgroup label="'+esc(L5('Time zones','タイムゾーン','Zeitzonen','Часовые пояса','Husos horarios'))+'">'
          +ZONES.map(opt).join('')+'</optgroup>';
        zoneSel.setAttribute('data-built',sig); }
      zoneSel.value=zone;
      if(zoneLbl){ try{ zoneLbl.title=zoneOffText(window.IntMapTime.when()); }catch(_){} }
    }
    if(zoneSel) zoneSel.addEventListener('change',()=>{ zone=zoneSel.value||'user';
      try{ localStorage.setItem(ZKEY,zone); }catch(_){}
      /* 'map' needs the boundary set; ask for it once and re-render when it lands */
      if(zone==='map'){ try{ window.IntMapTimeZones&&window.IntMapTimeZones.ensure&&window.IntMapTimeZones.ensure().then(()=>{ try{ refreshUI(window.IntMapTime.state()); }catch(_){} }); }catch(_){} }
      try{ refreshUI(window.IntMapTime.state()); }catch(_){} });
    function buildScale(){ if(!scale) return; const now=L5('Now','現在','Jetzt','Сейчас','Ahora');
      if(mode==='forecast'){ const n=fcCount();
        scale.innerHTML=n?('<span>'+fcFmt(fcValid(0))+'</span><span>'+fcFmt(fcValid(n-1))+'</span>'):'';
        return; }
      scale.innerHTML=(mode==='year')
        ? '<span>1900</span><span>1960</span><span>2000</span><span>'+now+'</span>'
        : (mode==='time')
        ? '<span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>'
        : '<span>'+L5('−10y','10年前','−10 J','−10 л','−10 a')+'</span><span>'+L5('−5y','5年前','−5 J','−5 л','−5 a')+'</span><span>'+now+'</span>'; }
    function applyMode(m){ if(m==='forecast'&&!fcReady()) m='date'; mode=m;
      if(modeYear) modeYear.classList.toggle('on',m==='year');
      if(modeDate) modeDate.classList.toggle('on',m==='date');
      if(modeTime) modeTime.classList.toggle('on',m==='time');
      if(modeFc) modeFc.classList.toggle('on',m==='forecast');
      if(datePicker) datePicker.style.display=(m==='date')?'':'none';
      if(timePicker) timePicker.style.display=(m==='time')?'':'none';
      if(m==='forecast'){ slider.min='0'; slider.max=String(Math.max(0,fcCount()-1)); slider.step='1'; }
      else if(m==='year'){ slider.min='1900'; slider.max=String(curY); slider.step='1'; }
      else if(m==='time'){ slider.min='0'; slider.max=String(_timeMaxMins()); slider.step='1'; _updTimeMax(); }   /* (#R137) minutes-of-day; (#R210) the whole day, today included */
      else { slider.min='0'; slider.max='3650'; slider.step='1'; }
      if(m!=='time') _tmTerminator(false);   /* (#R137) leaving Time mode clears the day/night overlay */
      buildScale(); buildPlayer();
      try{ refreshUI(window.IntMapTime.state()); }catch(_){}
    }
    /* (#R290) 「反映内容を表示する箇所はいらない」 — `buildSynced` built the 「Applied」 label and one
       chip per time-aware subsystem. It is gone with its markup. The hook other modules poke when
       their own year changes stays declared and does nothing, so a caller that has not been
       rebuilt is not a TypeError (js/time-countries.js calls it defensively already). */
    window._imTimeSyncedRefresh=()=>{};
    /* WRITE side: inputs → kernel */
    tg.onclick=()=>{ tl.classList.toggle('collapsed'); if(!tl.classList.contains('collapsed')){ localizeChrome(); try{ refreshUI(window.IntMapTime.state()); }catch(_){} } _tmSyncTerminator(); };
    if(closeX) closeX.onclick=()=>{ tl.classList.add('collapsed'); _tmSyncTerminator(); };
    if(modeYear) modeYear.onclick=()=>applyMode('year');
    if(modeDate) modeDate.onclick=()=>applyMode('date');
    if(modeTime) modeTime.onclick=()=>applyMode('time');   /* (#R137) */
    if(modeFc) modeFc.onclick=()=>applyMode('forecast');   /* (#R288) */
    /* the one entry point a weather legend uses to reach this control — it opens the strip on the
       forecast tab rather than growing a second copy of it (「わざわざ分けるな」) */
    window._imTimeMachineForecast=()=>{ try{ tl.classList.remove('collapsed'); localizeChrome(); applyMode(fcReady()?'forecast':'date'); }catch(_){} };
    slider.addEventListener('input',()=>{ if(_self) return;
      /* ⚠ the forecast tab writes to the MODEL's axis, which pushes the master clock itself (and
         coalesces that push) — writing to both from here would be two clocks again. */
      if(mode==='forecast'){ const E=EC(); if(E){ E.pause(); E.setIndex(+slider.value); } bigval.textContent=fcFmt(fcValid(+slider.value)); return; }
      if(mode==='year'){ const y=parseInt(slider.value,10); if(y>=curY) window.IntMapTime.setNow({source:'ui'}); else if(y>=1900) window.IntMapTime.setYear(y,{source:'ui'}); }
      else if(mode==='time'){ _applyTimeOfDay(parseInt(slider.value,10)||0); }   /* (#R137) minutes-of-day → clock */
      else { window.IntMapTime.setDaysAgo(3650-parseInt(slider.value,10),{source:'ui'}); } });
    if(datePicker) datePicker.addEventListener('change',()=>{ if(_self) return; if(!datePicker.value){ window.IntMapTime.setNow({source:'ui'}); } else { const d=new Date(datePicker.value+'T00:00:00'); if(!isNaN(d.getTime())) window.IntMapTime.set(d,{source:'ui'}); } });
    if(timePicker) timePicker.addEventListener('change',()=>{ if(_self) return; const v=timePicker.value; if(!v) return; const p=String(v).split(':'); _applyTimeOfDay((+p[0]||0)*60+(+p[1]||0)); });   /* (#R137) */
    if(btnNow) btnNow.onclick=()=>window.IntMapTime.setNow({source:'ui'});
    /* READ side: kernel → this widget's UI */
    function refreshUI(e){ _self=true; try{
      if(mode==='forecast'){
        const n=fcCount(), i=fcIndex();
        if(slider.max!==String(Math.max(0,n-1))) slider.max=String(Math.max(0,n-1));
        if(+slider.value!==i) slider.value=i;
        bigval.textContent=fcFmt(fcValid(i));
        tl.classList.toggle('active',!e.isLive);
      }
      else if(mode==='time'){ /* (#R137) Time tab: show the time-of-day of the current instant (now when live).
                           (#R139) keep the slider/picker max at "now" while the selected date is today (no future). */
        const w=e.when; const base=e.isLive?new Date():new Date(e.when); const maxM=_timeMaxMins();
        if(slider.max!==String(maxM)) slider.max=String(maxM); _updTimeMax();
        const zf=zFields(w); let mins=zf.h*60+zf.m; if(mins>maxM) mins=maxM;   /* (#R289) in the chosen zone */
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
        else { bigval.textContent=_dateText(e.when);   /* (#R289) in the chosen zone */
          const sv=Math.max(0,Math.min(3650,3650-da)); if(+slider.value!==sv) slider.value=sv; }
        if(datePicker) datePicker.value=(da>=0&&da<=3650)?ymdISO(e.when):'';   /* deep-past has no valid recent-picker value */
      }
      buildZones();
      const mn=+slider.min, mx=+slider.max; slider.style.setProperty('--ntl-fill',(mx>mn?((+slider.value-mn)/(mx-mn)*100):0)+'%');
      /* (#R105) reflect the set year/date on the COLLAPSED Chronos button (it turns blue via .active) —
         same button, just its two label lines swap to the applied period; restored to the default on "Now". */
      try{ const ot=document.getElementById('ntl-open-t'), os=document.getElementById('ntl-open-s');
        if(ot&&os){
          if(e.isLive){ ot.textContent='Chronos';
            os.textContent=L5('Control the map’s time','地図の時間を操作','Die Zeit der Karte steuern','Управление временем карты','Controla el tiempo del mapa'); }
          else { ot.textContent=(mode==='year')?yLabel(e.year):(mode==='time')?_hm(e.when):_dateText(e.when);
            /* ══ ⚠⚠ (#R290) THE CLOCK REACHES FORWARD, AND THE LABEL DID NOT ═══════════════════
               「Chronosで時間を変更したとき、未来を見てるときに、『過去を表示中・タップ』と出てくる。
                 表示変えろ。タップも書かなくていい。」
               #R288 gave Chronos a forecast tab, so a chosen instant can be AFTER now — and this
               line has said 「過去を表示中」 for every non-live instant since #R105, because at the
               time there was no other kind. It reads the instant and says which side of now it is
               on. And 「タップ」 goes: the whole element is a button, it is already labelled as
               one, and telling a reader to tap the thing they are looking at is not information. */
            os.textContent=(e.when.getTime()>Date.now())
              ? L5('Viewing the future','未来を表示中','Zukunft','Будущее','Viendo el futuro')
              : L5('Viewing the past','過去を表示中','Vergangenheit','Прошлое','Viendo el pasado'); }
        }
      }catch(_){}
    }catch(_){} _self=false; }
    /* the axis and the tab keep each other honest: a step taken from a weather legend moves this
       slider, and the tab appears as soon as the model's metadata lands */
    try{ (window.IntMapECMWF||{on:()=>{}}).on(ev=>{ try{
      if(ev.type==='meta'){ syncFcTab(); if(mode==='forecast'){ applyMode('forecast'); } }
      if(ev.type==='play') buildPlayer();
      if(mode==='forecast') refreshUI(window.IntMapTime.state());
    }catch(_){} }); }catch(_){}
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
      function wireMap(){ try{ const E=GE(); if(E&&E.hasRenderer()){ E.events.on('dragstart',closeIf); E.events.on('zoomstart',ev=>{ if(ev&&ev.originalEvent) closeIf(); }); E.events.on('click',closeIf); E.events.on('styledata',()=>{ try{ _tmSyncTerminator(); }catch(_){} }); return true; } }catch(_){} return false; }
      if(!wireMap()) setTimeout(wireMap,1500);
      document.addEventListener('pointerdown',ev=>{ try{ if(tl.classList.contains('collapsed')) return; if(ev.target&&ev.target.closest&&ev.target.closest('#news-timeline')) return; closeIf(); }catch(_){} },true); })();
    window.addEventListener('intmap-lang',()=>{ try{ localizeChrome(); refreshUI(window.IntMapTime.state()); }catch(_){} });
    /* init */
    if(datePicker){ datePicker.max=ymdISO(new Date()); datePicker.min=ymdISO(new Date(Date.now()-3650*864e5)); }
    tl.classList.add('collapsed'); localizeChrome(); applyMode('year');
    /* the metadata is a 3 kB JSON with no SDK behind it, so the tab can be honest from boot */
    try{ (window.IntMapECMWF||{meta:()=>Promise.resolve()}).meta().then(syncFcTab).catch(()=>{}); }catch(_){}
    setTimeout(syncFcTab,2500);
  })();
};
